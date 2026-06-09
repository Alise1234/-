import express from 'express';
import path from 'path';
import { createServer as createViteServer } from 'vite';
import dotenv from 'dotenv';
import { HttpsProxyAgent } from 'https-proxy-agent';

dotenv.config();

const app = express();
const PORT = 3000;
const PROXY_URL = process.env.HTTPS_PROXY || process.env.https_proxy || '';
const proxyAgent = PROXY_URL ? new HttpsProxyAgent(PROXY_URL) : null;

app.use(express.json());

function makeFetchOptions(method: string, body?: any) {
  const opts: any = {
    method,
    headers: {
      'Accept': 'application/json',
      'Content-Type': 'application/json',
    },
    agent: proxyAgent,
  };
  if (body && !['GET', 'HEAD'].includes(method)) {
    opts.body = JSON.stringify(body);
  }
  return opts;
}

// 0. 本地 Python 服务的反向代理中转/合并拦截网关 (双轨制兼容方案)
// 注意：/api/market/sentiment 由 Express 原生实现，排除代理；sectors 代理到 Python 后端
app.all('/api/*', async (req: express.Request, res: express.Response, next: express.NextFunction) => {
  // 这些路由由 Express 原生实现，排除代理
  if (req.path === '/api/market/sentiment') {
    return next();
  }
  try {
    const targetUrl = `http://127.0.0.1:8000${req.originalUrl}`;
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 8000); // 8秒超时（summary等接口需拉取实时价格）

    const fetchOptions: any = {
      method: req.method,
      headers: {
        'Accept': 'application/json',
        'Content-Type': 'application/json',
      },
      signal: controller.signal
    };

    if (!['GET', 'HEAD'].includes(req.method)) {
      fetchOptions.body = JSON.stringify(req.body);
    }

    const response = await fetch(targetUrl, {
      ...makeFetchOptions(req.method, req.body),
      signal: controller.signal,
    });
    clearTimeout(timeoutId);

    if (response.ok) {
      const data = await response.json();
      // Python 返回成功（success 不为 false），直接透传
      if (data && data.success !== false) {
        return res.json(data);
      }
      // Python 返回了空数据或 success=false，降级到 Express 处理
    }
  } catch (error) {
    // 捕获不可达/连接拒绝/超时等，继续流向 Express 原生兼容性接口做兜底
  }
  next();
});

// 延迟初始化 DeepSeek 客户端，防止因缺失 API Key 导致启动崩盘
// 1. AI 决策选股 — 透传到 Python DeepSeek 后端
app.post('/api/gemini/analyze', async (req, res) => {
  try {
    const r = await fetch('http://127.0.0.1:8000/api/ai/analyze-market', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(req.body),
      signal: AbortSignal.timeout(25000),
    });
    if (r.ok) return res.json(await r.json());
  } catch (e) { /* 降级提示 */ }
  res.json({
    success: false, source: 'fallback', error: 'deepseek unavailable',
    marketOutlook: 'AI 分析暂不可用',
    recommendedSectors: [], recommendedStocks: [],
    riskWarning: '服务异常', positionSizingAdvice: '建议人工判断',
  });
});

// ===== 真实/高保真 A股行情抓取服务 =====
let cacheIndices: any = null;
let lastIndicesTime = 0;
let cacheSpot: any = null;
let lastSpotTime = 0;

// 预热缓存（服务启动后立即拉取一次，避免首次请求等很久）
(async () => {
  try {
    const [indices, spot] = await Promise.all([
      getRealIndices(),
      getRealSpot(),
    ]);
    console.log(`[启动] 指数缓存预热: ${indices.length} 条`);
    console.log(`[启动] 行情缓存预热: ${spot.length} 条`);
  } catch (e) {
    console.warn('[启动] 缓存预热失败（不影响服务）:', (e as Error)?.message);
  }
})();

// 新浪实时指数数据解析
function parseSinaIndexLine(line: string): any | null {
  // 格式: var hq_str_s_sh000001="上证指数,4066.56,-17.42,-0.43,3878823,79826844"
  const match = line.match(/var hq_str_(\w+)="(.+)"/);
  if (!match) return null;
  const symbol = match[1];   // e.g. "s_sh000001"
  const parts = match[2].split(',');
  if (parts.length < 4) return null;

  const name = parts[0];
  const price = parseFloat(parts[1]) || 0;
  const change = parseFloat(parts[2]) || 0;
  const changePct = parseFloat(parts[3]) || 0;
  const amount = parseFloat(parts[5]) || 0;  // 成交额（万元）

  // symbol → code mapping
  const codeMap: Record<string, string> = {
    's_sh000001': '000001.SH',
    's_sz399001': '399001.SZ',
    's_sz399006': '399006.SZ',
    's_sh000300': '000300.SH',
  };

  return {
    code: codeMap[symbol] || symbol,
    name: name || symbol,
    price,
    change: Math.round(change * 100) / 100,
    changePct: Math.round(changePct * 100) / 100,
    volume: amount > 0 ? `${(amount / 1e8).toFixed(1)}亿` : '-',
    // 兼容旧字段名
    f12: codeMap[symbol]?.replace(/\.(SH|SZ)/, '') || '',
    f14: name,
    f2: String(price),
    f3: String(changePct),
    f4: String(change),
    代码: codeMap[symbol] || symbol,
    名称: name,
    最新价: String(price),
    涨跌幅: String(changePct),
    涨跌额: String(change),
  };
}

async function getRealIndices() {
  const now = Date.now();
  if (cacheIndices && now - lastIndicesTime < 10000) {
    return cacheIndices;
  }

  // 方式1: 新浪实时行情（已验证可用，不受代理影响）
  try {
    const sinaUrl = 'http://hq.sinajs.cn/list=s_sh000001,s_sz399001,s_sz399006,s_sh000300';
    const res = await fetch(sinaUrl, {
      headers: {
        'Referer': 'https://finance.sina.com.cn',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36'
      },
      agent: proxyAgent,
      signal: AbortSignal.timeout(5000),
    });
    if (res.ok) {
      const buffer = await res.arrayBuffer();
      const text = new TextDecoder('gbk').decode(buffer);
      const lines = text.split('\n').filter(l => l.includes('='));
      const mapped = lines.map(parseSinaIndexLine).filter(Boolean);
      if (mapped.length >= 3) {
        cacheIndices = mapped;
        lastIndicesTime = now;
        return mapped;
      }
    }
  } catch (err) {
    console.warn('[指数] 新浪数据源失败:', (err as Error)?.message);
  }

  // 方式2: 东方财富API（回退）
  try {
    const url = 'https://push2.eastmoney.com/api/qt/clist/get?pn=1&pz=10&po=1&np=1&ut=bd1d9ddb04089700cf9c27f6f7426219&fltt=2&invt=2&wbp2f=|0|0|0|web&fid=f3&fs=i:1.000001,i:0.399001,i:0.399006,i:1.000300&fields=f2,f3,f4,f6,f12,f13,f14';
    const res = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
        'Referer': 'https://finance.eastmoney.com/'
      },
      agent: proxyAgent,
      signal: AbortSignal.timeout(5000)
    });
    const json = await res.json();
    if (json?.data?.diff) {
      const mapped = Object.values(json.data.diff).map((item: any) => {
        const code = item.f12;
        const suffix = item.f13 === 1 ? 'SH' : 'SZ';
        const amount = parseFloat(item.f6 || '0');
        return {
          code: `${code}.${suffix}`,
          name: item.f14,
          price: item.f2 ? parseFloat(item.f2) : 0,
          change: item.f4 ? parseFloat(item.f4) : 0,
          changePct: item.f3 ? parseFloat(item.f3) : 0,
          volume: amount > 0 ? `${(amount / 1e8).toFixed(1)}亿` : '-',
          f12: code, f14: item.f14,
          f2: String(item.f2 || '0'), f3: String(item.f3 || '0'), f4: String(item.f4 || '0'),
          代码: `${code}.${suffix}`, 名称: item.f14,
          最新价: String(item.f2 || '0'), 涨跌幅: String(item.f3 || '0'), 涨跌额: String(item.f4 || '0'),
        };
      });
      if (mapped.length >= 3) {
        cacheIndices = mapped;
        lastIndicesTime = now;
        return mapped;
      }
    }
  } catch (err) {
    console.warn('[指数] 东方财富数据源失败:', (err as Error)?.message);
  }

  // 方式3: 返回缓存（即使过期也比硬编码假数据强）
  if (cacheIndices) return cacheIndices;

  // 最后兜底：返回空标记，让前端显示"数据获取中"而非假数据
  return [
    { code: '000001.SH', name: '上证指数', price: 0, change: 0, changePct: 0, volume: '数据获取中...', _error: true },
    { code: '399001.SZ', name: '深证成指', price: 0, change: 0, changePct: 0, volume: '数据获取中...', _error: true },
    { code: '399006.SZ', name: '创业板指', price: 0, change: 0, changePct: 0, volume: '数据获取中...', _error: true },
    { code: '000300.SH', name: '沪深300', price: 0, change: 0, changePct: 0, volume: '数据获取中...', _error: true },
  ];
}

async function getRealSpot() {
  const now = Date.now();
  if (cacheSpot && now - lastSpotTime < 15000) {
    return cacheSpot;
  }

  // 方式1: 新浪全市场行情（num=5000 一次拉全量，过滤科创板 688）
  try {
    const sinaUrl = 'http://vip.stock.finance.sina.com.cn/quotes_service/api/json_v2.php/Market_Center.getHQNodeDataSimple?page=1&num=5000&sort=symbol&asc=1&node=hs_a&symbol=&_s_r_a=page';
    const res = await fetch(sinaUrl, {
      headers: {
        'Referer': 'https://finance.sina.com.cn',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
        'Accept': 'application/json, text/javascript, */*',
      },
      signal: AbortSignal.timeout(15000),
    });
    if (res.ok) {
      const text = await res.text();
      // 清理 JSONP 包装: v_json_name(...json...) → json
      const clean = text.replace(/^(?:var \w+=|[^(]+\()/, '').replace(/\);?\s*$/, '');
      const raw: any[] = JSON.parse(clean);
      if (Array.isArray(raw) && raw.length > 100) {
        // 过滤掉科创板(688)代码，保留沪深主板+创业板+北交所
        const filtered = raw.filter((item: any) => {
          const sym = (item.symbol || '').toLowerCase();
          return !sym.startsWith('sh688'); // 排除科创板
        });
        const mapped = filtered.map((item: any) => {
          const rawCode = (item.symbol || item.code || '').toLowerCase();
          const code6 = rawCode.replace(/^(sh|sz|bj)/, '').padStart(6, '0');
          return {
            _raw: rawCode,
            代码: code6,
            名称: item.name || '',
            最新价: String(item.trade || 0),
            涨跌幅: String(item.changepercent || 0),
            涨跌额: String(item.pricechange || 0),
            成交量: String(item.volume || 0),
            开盘: String(item.open || 0),
            最高: String(item.high || 0),
            最低: String(item.low || 0),
            昨收: String(item.settlement || 0),
            f12: code6,
            f14: item.name || '',
            f2: String(item.trade || 0),
            f3: String(item.changepercent || 0),
            f4: String(item.pricechange || 0),
            f5: String(item.volume || 0),
            f6: String(item.amount || 0),
            f15: String(item.high || 0),
            f16: String(item.low || 0),
            f17: String(item.open || 0),
            f9: '22.4',
          };
        });
        console.log(`[行情] 获取 ${mapped.length} 条（过滤科创板后），原始 ${raw.length} 条`);
        cacheSpot = mapped;
        lastSpotTime = now;
        return mapped;
      }
    }
  } catch (err) {
    console.warn('[行情] 新浪全市场数据源失败:', (err as Error)?.message);
  }

  // 方式2: 腾讯实时行情（备用）
  try {
    const codes = ['sh600000','sh600519','sh601318','sz000001','sz000002','sz300750','sh688981'];
    const url = `https://qt.gtimg.cn/q=${codes.join(',')}`;
    const res = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0',
        'Referer': 'https://gu.qq.com',
      },
      signal: AbortSignal.timeout(5000),
    });
    if (res.ok) {
      const text = await res.text();
      const lines = text.trim().split('\n').filter(Boolean);
      if (lines.length >= 3) {
        const mapped = lines.map(line => {
          const m = line.match(/="([^"]+)"/);
          if (!m) return null;
          const parts = m[1].split('~');
          if (parts.length < 32) return null;
          const codeRaw = parts[2] || '';
          const code = codeRaw.replace(/^(sh|sz|bj)/i, '').padStart(6, '0');
          const suffix = codeRaw.toLowerCase().startsWith('sh') ? '.SH' : codeRaw.toLowerCase().startsWith('sz') ? '.SZ' : '';
          return {
            代码: code,
            名称: parts[1] || '',
            最新价: parts[3] || '0',
            涨跌幅: parts[32] || '0',
            涨跌额: parts[31] || '0',
            成交量: parts[36] || '0',
            开盘: parts[5] || '0',
            最高: parts[33] || '0',
            最低: parts[34] || '0',
            昨收: parts[4] || '0',
            f12: code,
            f14: parts[1] || '',
            f2: parts[3] || '0',
            f3: parts[32] || '0',
            f4: parts[31] || '0',
            f5: parts[36] || '0',
            f9: '22.4',
          };
        }).filter(Boolean);
        if (mapped.length >= 3) {
          cacheSpot = mapped;
          lastSpotTime = now;
          return mapped;
        }
      }
    }
  } catch (err) {
    console.warn('[行情] 腾讯实时行情数据源失败:', (err as Error)?.message);
  }

  if (cacheSpot) return cacheSpot;
  return [];
}

// 3. 股票和大盘行情接口
app.get('/api/market/indices', async (req, res) => {
  const data = await getRealIndices();
  res.json({ success: true, count: data.length, data, indices: data });
});

app.get('/api/market/spot', async (req, res) => {
  const data = await getRealSpot();
  res.json({ success: true, count: data.length, data, stocks: data });
});

app.get('/api/market/stocks', async (req, res) => {
  const data = await getRealSpot();
  res.json({ success: true, count: data.length, data, stocks: data });
});

// 3b. 大盘情绪（基于当前行情数据实时计算，不依赖数据库）
app.get('/api/market/sentiment', async (req, res) => {
  try {
    const stocks = await getRealSpot();
    if (!stocks.length) return res.json({ success: false, error: '无行情数据' });

    let upCount = 0, downCount = 0, limitUp = 0, limitDown = 0;
    let totalAmount = 0;
    let totalPct = 0;

    for (const s of stocks) {
      const pct = parseFloat(String(s.涨跌幅 || s.f3 || 0));
      const amount = parseFloat(String(s.f6 || 0));
      if (pct > 0) upCount++;
      else if (pct < 0) downCount++;
      if (pct >= 9.5) limitUp++;
      if (pct <= -9.5) limitDown++;
      totalAmount += amount;
      totalPct += pct;
    }

    const total = upCount + downCount || 1;
    const boardRatio = Math.round((upCount / total) * 1000) / 10;
    const marketAvgPct = stocks.length ? Math.round((totalPct / stocks.length) * 100) / 100 : 0;
    const amountBillion = totalAmount / 1e8;

    let fearGreed = 50;
    if (limitUp >= 50) fearGreed += 15;
    else if (limitUp >= 30) fearGreed += 10;
    else if (limitUp >= 15) fearGreed += 5;
    if (limitDown >= 30) fearGreed -= 15;
    else if (limitDown >= 15) fearGreed -= 8;
    if (amountBillion >= 15000) fearGreed += 10;
    else if (amountBillion >= 10000) fearGreed += 5;
    else if (amountBillion <= 7000) fearGreed -= 5;
    fearGreed = Math.max(0, Math.min(100, fearGreed));

    const phase = fearGreed >= 75 ? '狂热期'
      : fearGreed >= 60 ? '启动期'
      : fearGreed >= 40 ? '退潮期' : '冰点期';
    const description = fearGreed >= 75 ? '两市交易额突破1.5万亿，板块悉数井喷，情绪面临极度超买，注意高位分歧风险。'
      : fearGreed >= 60 ? '科技及半导体主力大资金强行点火，高度板梯队完好，建议积极关注最热龙一做试错。'
      : fearGreed >= 40 ? '主力高位兑现撤退，龙头亏钱效应显现，市场进入震荡分化期。'
      : '空头力量宣泄极致，全盘交易额缩水至7000亿以下。绝望冰点处酝酿短线转势。';

    res.json({
      success: true,
      phase,
      fearGreedIndex: fearGreed,
      limitUpCount: limitUp,
      limitDownCount: limitDown,
      boardRatio,
      totalTurnover: Math.round(amountBillion),
      marketAvgPct,
      description,
    });
  } catch (err) {
    res.json({ success: false, error: (err as Error).message });
  }
});

// 3c. 板块热度（代理 Python 后端获取真实行业数据）
app.get('/api/market/sectors', async (req, res) => {
  try {
    const pythonRes = await fetch(`http://127.0.0.1:8000/api/market/sectors`);
    const data = await pythonRes.json();
    res.json(data);
  } catch {
    res.json({ success: false, error: '后端不可达', data: [] });
  }
});

// 4. 日K线历史数据（含 Python 后端代理 + Express 兜底）
app.get('/api/market/daily/:code', async (req, res) => {
  const { code } = req.params;
  const cleanCode = code.replace(/^(sh|sz|bj)/i, '').padStart(6, '0');
  
  // 1. 尝试直连 Python 后端
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 1500);
    const pyRes = await fetch(`http://127.0.0.1:8000/api/market/daily/${cleanCode}`, { signal: controller.signal });
    clearTimeout(timeoutId);
    if (pyRes.ok) {
      const data = await pyRes.json();
      if (data && data.success !== false && data.data?.length) {
        return res.json(data);
      }
    }
  } catch (_err) { /* 降级到 Express 原生 A股行情拉取 */ }

  // 2. Express 级高保真 Web 真实行情 K线直接兜底服务 (东方财富接口)
  try {
    const suffix = cleanCode.startsWith('6') || cleanCode.startsWith('9') ? '1' : '0';
    const secid = `${suffix}.${cleanCode}`;
    const url = `https://push2his.eastmoney.com/api/qt/stock/kline/get?secid=${secid}&fields1=f1,f2,f3,f4,f5,f6&fields2=f51,f52,f53,f54,f55,f56,f57,f58,f59,f60,f61&klt=101&fqt=1&end=20500000&lmt=120`;
    
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
        'Referer': 'https://finance.eastmoney.com/'
      },
      agent: proxyAgent,
      signal: AbortSignal.timeout(6000)
    });
    
    if (response.ok) {
      const json = await response.json();
      if (json?.data?.klines?.length) {
        const parsedKlines = json.data.klines.map((line: string) => {
          const parts = line.split(',');
          return {
            '日期': parts[0],
            '开盘': parseFloat(parts[1]) || 0,
            '收盘': parseFloat(parts[2]) || 0,
            '最高': parseFloat(parts[3]) || 0,
            '最低': parseFloat(parts[4]) || 0,
            '成交量': parseFloat(parts[5]) || 0,
            '成交额': parseFloat(parts[6]) || 0,
            '振幅': parseFloat(parts[7]) || 0,
            '涨跌幅': parseFloat(parts[8]) || 0,
            '涨跌额': parseFloat(parts[9]) || 0,
            '换手率': parseFloat(parts[10]) || 0
          };
        });
        
        return res.json({
          success: true,
          code: cleanCode,
          count: parsedKlines.length,
          data: parsedKlines
        });
      }
    }
  } catch (err) {
    console.warn('[K线] 东方财富接口兜底失败:', (err as Error).message);
  }

  res.json({ success: false, error: 'K线数据暂不可用，请确认网络代理或 Python 后端已启动' });
});

// 4. 五维评分 — 直接透传到 Python 后端
app.get('/api/analysis/scores/:code', async (req, res) => {
  const { code } = req.params;
  try {
    const r = await fetch(`http://127.0.0.1:8000/api/analysis/scores/${code}`, { signal: AbortSignal.timeout(5000) });
    if (r.ok) return res.json(await r.json());
  } catch {}
  res.json({ success: false, error: '评分服务暂不可用，请确认 Python 后端已启动' });
});


// 5. 组合管理 — 直接透传到 Python 后端
//    注意：上面的 app.all('/api/*', ...) 中间件已经会优先代理到 Python
//    这里的路由仅作为 Python 不可达时的降级提示

app.get('/api/portfolio/summary', async (_req, res) => {
  try {
    const r = await fetch('http://127.0.0.1:8000/api/portfolio/summary', { signal: AbortSignal.timeout(15000) });
    if (r.ok) return res.json(await r.json());
  } catch {}
  res.json({ success: false, error: '持仓服务暂不可用，请确认 Python 后端已启动' });
});

app.get('/api/portfolio/positions', async (_req, res) => {
  try {
    const r = await fetch('http://127.0.0.1:8000/api/portfolio/positions', { signal: AbortSignal.timeout(5000) });
    if (r.ok) return res.json(await r.json());
  } catch {}
  res.json({ success: true, data: [], message: '请确认 Python 后端已启动以加载真实持仓信息' });
});

app.post('/api/portfolio/buy', async (req, res) => {
  try {
    const r = await fetch('http://127.0.0.1:8000/api/portfolio/buy', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(req.body),
      signal: AbortSignal.timeout(5000),
    });
    if (r.ok) return res.json(await r.json());
  } catch {}
  res.json({ success: false, error: '交易服务暂不可用，请确认 Python 后端已启动' });
});

app.post('/api/portfolio/sell', async (req, res) => {
  try {
    const r = await fetch('http://127.0.0.1:8000/api/portfolio/sell', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(req.body),
      signal: AbortSignal.timeout(5000),
    });
    if (r.ok) return res.json(await r.json());
  } catch {}
  res.json({ success: false, error: '交易服务暂不可用，请确认 Python 后端已启动' });
});

// 6. 回测 / 信号 / 风控 — 透明代理至 Python 后端（带超时容错兜底）
app.get('/api/backtest/run', async (req, res) => {
  try {
    const query = new URLSearchParams(req.url.split('?')[1] || '');
    const targetUrl = `http://127.0.0.1:8000/api/backtest/run?${query.toString()}`;
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 8000); // 回测计算耗时长，给8秒
    const pyRes = await fetch(targetUrl, { signal: controller.signal });
    clearTimeout(timeoutId);
    if (pyRes.ok) {
      return res.json(await pyRes.json());
    }
  } catch (_err) { /* 超时/不可达 */ }
  res.json({ success: false, error: '回测引擎暂不可用，请确认 Python 后端已启动' });
});

app.get('/api/backtest/strategies', async (req, res) => {
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 1500);
    const pyRes = await fetch('http://127.0.0.1:8000/api/backtest/strategies', { signal: controller.signal });
    clearTimeout(timeoutId);
    if (pyRes.ok) return res.json(await pyRes.json());
  } catch (_err) { /* 降级 */ }
  res.json({
    success: true,
    strategies: {
      score: '综合评分策略: total_score>=80买入, <=60卖出',
      ma_cross: 'MA金叉死叉: MA5上穿MA20买入, MA5下穿MA20卖出',
      macd: 'MACD金叉死叉: DIF上穿DEA买入, DIF下穿DEA卖出',
    },
  });
});

// 信号 API 透明代理
app.get('/api/signal/daily', async (req, res) => {
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 2000);
    const pyRes = await fetch('http://127.0.0.1:8000/api/signal/daily', { signal: controller.signal });
    clearTimeout(timeoutId);
    if (pyRes.ok) return res.json(await pyRes.json());
  } catch (_err) { /* 降级 */ }
  res.json({ success: false, error: '信号服务暂不可用' });
});

app.get('/api/signal/buy', async (req, res) => {
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 2000);
    const query = req.url.includes('?') ? req.url.slice(req.url.indexOf('?')) : '';
    const pyRes = await fetch(`http://127.0.0.1:8000/api/signal/buy${query}`, { signal: controller.signal });
    clearTimeout(timeoutId);
    if (pyRes.ok) return res.json(await pyRes.json());
  } catch (_err) { /* 降级 */ }
  res.json({ success: false, error: '信号服务暂不可用' });
});

// 风控 API 透明代理
app.all('/api/risk/*', async (req, res) => {
  try {
    const targetUrl = `http://127.0.0.1:8000${req.originalUrl}`;
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 3000);
    const fetchOptions: any = {
      method: req.method,
      headers: { 'Accept': 'application/json', 'Content-Type': 'application/json' },
      signal: controller.signal,
    };
    if (!['GET', 'HEAD'].includes(req.method)) {
      fetchOptions.body = JSON.stringify(req.body);
    }
    const pyRes = await fetch(targetUrl, fetchOptions);
    clearTimeout(timeoutId);
    if (pyRes.ok) return res.json(await pyRes.json());
  } catch (_err) { /* 降级 */ }
  res.json({ success: false, error: '风控服务暂不可用，请确认 Python 后端已启动' });
});

// 行业数据同步端点 — Express直连东方财富，不走Python代理
app.get('/api/admin/sync-industry', async (_req, res) => {
  try {
    // 第一步：获取所有行业板块列表
    const boardUrl = 'https://push2.eastmoney.com/api/qt/clist/get?pn=1&pz=200&po=1&np=1&ut=bd1d9ddb04089700cf9c27f6f7426219&fltt=2&invt=2&fid=f3&fs=m:90+t:2&fields=f12,f14';
    const boardRes = await fetch(boardUrl, {
      headers: { 'User-Agent': 'Mozilla/5.0', 'Referer': 'https://data.eastmoney.com/' },
      signal: AbortSignal.timeout(10000),
    });
    if (!boardRes.ok) return res.json({ success: false, error: `HTTP ${boardRes.status}` });
    const boardJson: any = await boardRes.json();
    const boards = boardJson?.data?.diff || [];
    console.log(`[行业] 获取到 ${boards.length} 个行业板块`);

    let total = 0;
    for (const board of boards) {
      const boardCode = board.f12;
      const boardName = board.f14;
      try {
        // 第二步：获取该行业的成分股
        const consUrl = `https://push2.eastmoney.com/api/qt/clist/get?pn=1&pz=5000&po=1&np=1&ut=bd1d9ddb04089700cf9c27f6f7426219&fltt=2&invt=2&fid=f3&fs=b:${boardCode}+t:2&fields=f12`;
        const consRes = await fetch(consUrl, {
          headers: { 'User-Agent': 'Mozilla/5.0', 'Referer': 'https://data.eastmoney.com/' },
          signal: AbortSignal.timeout(10000),
        });
        if (!consRes.ok) continue;
        const consJson: any = await consRes.json();
        const stocks = consJson?.data?.diff || [];
        // 第三步：通过 Python API 写入数据库
        for (const stock of stocks) {
          const code = (stock.f12 || '').padStart(6, '0');
          if (code.length !== 6) continue;
          try {
            await fetch(`http://127.0.0.1:8000/api/admin/set-industry/${code}?industry=${encodeURIComponent(boardName)}`, { method: 'POST' });
            total++;
          } catch (_) {}
        }
      } catch (_) {}
    }
    res.json({ success: true, boards: boards.length, stocks_updated: total });
  } catch (e: any) {
    res.json({ success: false, error: e.message });
  }
});

// 2. 静态及构建中间件
async function startServer() {
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Express 选股系统后端正在侦听 http://localhost:${PORT}`);
  });
}

startServer();
