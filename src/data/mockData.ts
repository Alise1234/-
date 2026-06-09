import { StockInfo, SectorHeatInfo, MarketSentiment, MarketIndex, BacktestResult, BacktestDataPoint, BacktestConfig } from '../types';

// 初始指数数据
export const initialIndices: MarketIndex[] = [
  { name: '上证指数', code: '000001.SH', price: 3124.56, change: 18.42, changePct: 0.59, volume: '3456亿' },
  { name: '深证成指', code: '399001.SZ', price: 9582.34, change: 84.12, changePct: 0.89, volume: '4120亿' },
  { name: '创业板指', code: '399006.SZ', price: 1856.23, change: 23.41, changePct: 1.28, volume: '1980亿' },
  { name: '沪深300', code: '000300.SH', price: 3624.78, change: 25.10, changePct: 0.70, volume: '2150亿' },
];

// 初始A股股票数据库
export const initialStocks: StockInfo[] = [
  {
    code: '600519.SH',
    name: '贵州茅台',
    price: 1685.50,
    change: 15.50,
    changePct: 0.93,
    sector: '食品饮料',
    marketCap: 21172,
    pe: 28.5,
    roe: 29.8,
    volume: 1.8,
    high: 1695.00,
    low: 1670.00,
    scores: { valuation: 65, profitability: 98, technical: 55, capitalFlow: 60, prosperity: 75 },
    signal: 'HOLD',
    signalReason: '估值处于合理中枢，均线缠绕，建议观望。',
    isLeader: true,
    consecutiveBoards: 0,
  },
  {
    code: '300750.SZ',
    name: '宁德时代',
    price: 201.20,
    change: 5.60,
    changePct: 2.86,
    sector: '新能源',
    marketCap: 8852,
    pe: 18.2,
    roe: 24.5,
    volume: 12.5,
    high: 203.10,
    low: 195.10,
    scores: { valuation: 80, profitability: 88, technical: 75, capitalFlow: 82, prosperity: 85 },
    signal: 'BUY',
    signalReason: '锂电池排产超预期，机构净流入，5日线金叉20日线。',
    isLeader: true,
    consecutiveBoards: 0,
  },
  {
    code: '002594.SZ',
    name: '比亚迪',
    price: 242.80,
    change: 7.20,
    changePct: 3.06,
    sector: '汽车',
    marketCap: 7068,
    pe: 19.5,
    roe: 21.8,
    volume: 8.9,
    high: 245.00,
    low: 235.20,
    scores: { valuation: 75, profitability: 85, technical: 70, capitalFlow: 75, prosperity: 90 },
    signal: 'BUY',
    signalReason: '出海销量屡创新高，均线多头排列，量比放大。',
    isLeader: true,
    consecutiveBoards: 0,
  },
  {
    code: '601138.SH',
    name: '工业富联',
    price: 26.45,
    change: 1.85,
    changePct: 7.52,
    sector: '半导体及人工智能',
    marketCap: 5253,
    pe: 23.4,
    roe: 18.5,
    volume: 45.6,
    high: 27.20,
    low: 24.80,
    scores: { valuation: 50, profitability: 72, technical: 95, capitalFlow: 98, prosperity: 98 },
    signal: 'BUY',
    signalReason: 'AI服务器需求爆发，北向资金暴力净买入，强势涨幅近涨停。',
    isLeader: true,
    consecutiveBoards: 1,
  },
  {
    code: '600900.SH',
    name: '长江电力',
    price: 28.15,
    change: 0.12,
    changePct: 0.43,
    sector: '电力/红利',
    marketCap: 6886,
    pe: 20.1,
    roe: 14.2,
    volume: 4.2,
    high: 28.32,
    low: 27.95,
    scores: { valuation: 55, profitability: 78, technical: 65, capitalFlow: 55, prosperity: 70 },
    signal: 'HOLD',
    signalReason: '避险情绪升温，稳字当头，高分红配置首选，价格逼近历史新高。',
    isLeader: true,
    consecutiveBoards: 0,
  },
  {
    code: '601127.SH',
    name: '赛力斯',
    price: 94.60,
    change: 8.60,
    changePct: 10.00, // 涨停
    sector: '汽车',
    marketCap: 1428,
    pe: 140.2, // 高PE
    roe: 5.4,
    volume: 38.4,
    high: 94.60,
    low: 86.10,
    scores: { valuation: 30, profitability: 45, technical: 99, capitalFlow: 98, prosperity: 95 },
    signal: 'BUY',
    signalReason: '新车型交付表现炸裂，主力封单12万手，4天2板。龙头妖股之姿。',
    isLeader: true,
    consecutiveBoards: 2,
  },
  {
    code: '000977.SZ',
    name: '浪潮信息',
    price: 43.12,
    change: 2.12,
    changePct: 5.17,
    sector: '半导体及人工智能',
    marketCap: 634,
    pe: 31.2,
    roe: 11.2,
    volume: 28.5,
    high: 44.20,
    low: 41.00,
    scores: { valuation: 55, profitability: 65, technical: 82, capitalFlow: 85, prosperity: 95 },
    signal: 'BUY',
    signalReason: '液冷服务器中标大单，资金加速抄底，技术面突破颈线位。',
    isLeader: false,
    consecutiveBoards: 0,
  },
  {
    code: '600030.SH',
    name: '中信证券',
    price: 20.45,
    change: 0.35,
    changePct: 1.74,
    sector: '金融/券商',
    marketCap: 3031,
    pe: 15.4,
    roe: 8.1,
    volume: 14.2,
    high: 20.70,
    low: 20.10,
    scores: { valuation: 75, profitability: 60, technical: 62, capitalFlow: 70, prosperity: 65 },
    signal: 'HOLD',
    signalReason: '成交量平稳温和放量，作为牛市风向标探底回升，防御反攻。',
    isLeader: true,
    consecutiveBoards: 0,
  },
  {
    code: '600438.SH',
    name: '通威股份',
    price: 22.40,
    change: -0.45,
    changePct: -1.97,
    sector: '光伏',
    marketCap: 1008,
    pe: 9.8,
    roe: 18.2,
    volume: 18.2,
    high: 23.10,
    low: 22.25,
    scores: { valuation: 90, profitability: 65, technical: 30, capitalFlow: 25, prosperity: 40 },
    signal: 'SELL',
    signalReason: '行业硅料产能过剩，价格下降，资金流出，跌破所有均线。',
    isLeader: false,
    consecutiveBoards: 0,
  },
  {
    code: '300059.SZ',
    name: '东方财富',
    price: 13.84,
    change: 0.24,
    changePct: 1.76,
    sector: '金融/券商',
    marketCap: 2194,
    pe: 25.1,
    roe: 12.3,
    volume: 35.1,
    high: 14.12,
    low: 13.60,
    scores: { valuation: 62, profitability: 75, technical: 65, capitalFlow: 68, prosperity: 72 },
    signal: 'HOLD',
    signalReason: '两市成交额徘徊在9000亿，券商景气平稳，技术底背离酝酿反弹。',
    isLeader: false,
    consecutiveBoards: 0,
  },
  {
    code: '601318.SH',
    name: '中国平安',
    price: 43.60,
    change: 0.10,
    changePct: 0.23,
    sector: '金融/券商',
    marketCap: 7972,
    pe: 11.2,
    roe: 10.5,
    volume: 6.8,
    high: 43.90,
    low: 43.30,
    scores: { valuation: 85, profitability: 72, technical: 50, capitalFlow: 45, prosperity: 60 },
    signal: 'HOLD',
    signalReason: '低估值安全垫高，走势极为钝化，适合红利底仓配置。',
    isLeader: false,
    consecutiveBoards: 0,
  },
  {
    code: '600675.SH',
    name: '中华企业',
    price: 3.12,
    change: -0.15,
    changePct: -4.59,
    sector: '房地产',
    marketCap: 190,
    pe: 45.0,
    roe: 2.1,
    volume: 24.1,
    high: 3.32,
    low: 3.08,
    scores: { valuation: 40, profitability: 30, technical: 35, capitalFlow: 20, prosperity: 30 },
    signal: 'SELL',
    signalReason: '地产基本面拐点尚未确认，大单抛压严重，5日线死叉离场。',
    isLeader: false,
    consecutiveBoards: 0,
  },
  {
    code: '600111.SH',
    name: '北方稀土',
    price: 18.52,
    change: 0.42,
    changePct: 2.32,
    sector: '有色金属',
    marketCap: 670,
    pe: 25.4,
    roe: 16.5,
    volume: 11.2,
    high: 18.75,
    low: 18.05,
    scores: { valuation: 68, profitability: 80, technical: 58, capitalFlow: 75, prosperity: 65 },
    signal: 'BUY',
    signalReason: '轻稀土配额稳定，下游永磁需求回暖，探底阳线确立支撑。',
    isLeader: true,
    consecutiveBoards: 0,
  },
];

// 初始板块热度数据
export const initialSectors: SectorHeatInfo[] = [
  { name: '半导体及人工智能', changePct: 3.45, netInflow: 45.6, volumePct: 22.4, leaders: ['工业富联', '寒武纪', '浪潮信息'], status: 'HOT' },
  { name: '新能源/汽车', changePct: 2.12, netInflow: 25.8, volumePct: 15.2, leaders: ['比 亚 迪', '赛力斯', '宁德时代'], status: 'HOT' },
  { name: '食品饮料', changePct: 0.81, netInflow: 8.2, volumePct: 8.5, leaders: ['贵州茅台', '五粮液', '山西汾酒'], status: 'STABLE' },
  { name: '金融/券商', changePct: 0.54, netInflow: -3.4, volumePct: 10.1, leaders: ['中信证券', '东方财富', '中国平安'], status: 'STABLE' },
  { name: '有色金属', changePct: 1.15, netInflow: 12.4, volumePct: 9.8, leaders: ['北方稀土', '紫金矿业', '洛阳钼业'], status: 'STABLE' }
];

// 基础回测计算逻辑 (支持大盘/自选股票池、以及指定个股深度回测与交易流水模拟)
export function runStrategyBacktest(config: BacktestConfig): BacktestResult {
  const points: BacktestDataPoint[] = [];
  const days = 30;
  let capital = config.initialCapital;
  
  // 1. 获取回测对象信息
  const isStockMode = config.targetType === 'STOCK' && config.selectedStockCode;
  const targetStock = isStockMode 
    ? (initialStocks.find(s => s.code === config.selectedStockCode) || initialStocks[0])
    : null;

  // 2. 不同的策略配置不同的回报特性，并结合个股属性进行算力拟合
  let baseDailyReturn = 0;
  let volatility = 0.015;
  let winRate = 50;
  let scoreImpactComment = '';

  if (targetStock) {
    // 个股属性加成因子
    const tech = targetStock.scores.technical;
    const val = targetStock.scores.valuation;
    const prof = targetStock.scores.profitability;
    const cap = targetStock.scores.capitalFlow;
    const pros = targetStock.scores.prosperity;

    switch (config.strategy) {
      case 'MA_CROSSOVER':
        baseDailyReturn = 0.0005 + tech * 0.00003 + cap * 0.00002;
        volatility = 0.008 + (100 - val) * 0.00015;
        winRate = Math.round(42 + tech * 0.2);
        scoreImpactComment = `由于${targetStock.name}的技术形态评分高达 ${tech} 分，当前5日/20日均线金叉策略贴合度高，多头趋势顺畅。`;
        break;
      case 'LOW_VALUATION':
        baseDailyReturn = -0.0005 + val * 0.00003 + prof * 0.00002;
        volatility = 0.004 + (100 - prof) * 0.00005;
        winRate = Math.round(45 + val * 0.22);
        scoreImpactComment = `${targetStock.name}的估值安全度分数为 ${val} 分，盈利ROE表现分数为 ${prof} 分，${val > 70 ? '提供了极佳的安全垫，使得低估值防御策略获得稳健表现' : '由于估值偏高，采用红利防御策略时表现相对平庸'}`;
        break;
      case 'LEADER_FOLLOW':
        baseDailyReturn = 0.001 + pros * 0.00004 + tech * 0.00003;
        if (targetStock.isLeader || targetStock.consecutiveBoards > 0) {
          baseDailyReturn += 0.0035; // 龙头股动能爆发
        }
        volatility = 0.018 + (100 - val) * 0.00025;
        winRate = Math.round(35 + cap * 0.22);
        scoreImpactComment = `${targetStock.name}今日连板天数为 ${targetStock.consecutiveBoards} 天 ${targetStock.isLeader ? '(被标记为高人气龙一)' : ''}，极具妖股爆发力，龙头热度跟随策略会引发高β波动。`;
        break;
      case 'SENTIMENT_CYCLE':
        baseDailyReturn = 0.0005 + cap * 0.00003 + pros * 0.00002;
        volatility = 0.01 + (100 - tech) * 0.00012;
        winRate = Math.round(40 + pros * 0.18 + (val > 60 ? 5 : 0));
        scoreImpactComment = `结合市场情绪，${targetStock.name}具有行业景气度评分 ${pros}，在冰点拐点与退潮筑底期提供了充足的市场承接资金。`;
        break;
    }
  } else {
    // 整个股票池策略回归
    switch (config.strategy) {
      case 'MA_CROSSOVER':
        baseDailyReturn = 0.0025;
        volatility = 0.012;
        winRate = 58;
        scoreImpactComment = '对全市场自选股票池多达20余只活跃品种运行均线金叉策略。多空均衡配置，平摊单只个股停牌或爆雷风险。';
        break;
      case 'LOW_VALUATION':
        baseDailyReturn = 0.0012;
        volatility = 0.005;
        winRate = 62;
        scoreImpactComment = '运行全自选池红利低估值防御，重点配仓传统工业、食品饮料等低 PE、高 ROE 持股。回撤极低，平滑稳定。';
        break;
      case 'LEADER_FOLLOW':
        baseDailyReturn = 0.0055;
        volatility = 0.035;
        winRate = 48;
        scoreImpactComment = '对热点概念里的连板龙头采取追随策略，极易博取妖股主升浪，但也承受龙头见顶杀跌的核按钮风险。';
        break;
      case 'SENTIMENT_CYCLE':
        baseDailyReturn = 0.0042;
        volatility = 0.022;
        winRate = 55;
        scoreImpactComment = '结合恐慌贪婪指数和连板成色，在大盘情绪极值点（如冰点或狂热退潮）进行大仓位自适应抄底与仓位锁定。';
        break;
    }
  }

  // 限制波幅在合理范围内
  winRate = Math.max(30, Math.min(85, winRate));

  // consider take profit / stop loss
  const stopLossFactor = 1 + (config.stopLossPct - 5) * 0.01;
  const takeProfitFactor = 1 - (config.takeProfitPct - 15) * 0.005;

  let strategyCumReturn = 100;
  let benchmarkCumReturn = 100;

  const today = new Date();
  
  for (let i = days; i >= 0; i--) {
    const d = new Date();
    d.setDate(today.getDate() - i);
    const dateStr = d.toISOString().split('T')[0];

    // 基准
    const benchDaily = (Math.random() - 0.47) * 0.015;
    benchmarkCumReturn *= (1 + benchDaily);

    // 策略
    const rand = Math.random() * 100;
    let strategyDaily = 0;
    
    if (rand < winRate) {
      strategyDaily = Math.abs(Math.random() * volatility) + baseDailyReturn;
      const limit = config.takeProfitPct / 100 / 3;
      if (strategyDaily > limit) strategyDaily *= takeProfitFactor;
    } else {
      strategyDaily = -Math.abs(Math.random() * volatility) + baseDailyReturn;
      const limit = -config.stopLossPct / 100 / 3;
      if (strategyDaily < limit) strategyDaily *= stopLossFactor;
    }

    strategyCumReturn *= (1 + strategyDaily);
    capital = config.initialCapital * (strategyCumReturn / 100);

    points.push({
      date: dateStr,
      strategyReturn: parseFloat((strategyCumReturn - 100).toFixed(2)),
      benchmarkReturn: parseFloat((benchmarkCumReturn - 100).toFixed(2)),
      capital: Math.round(capital)
    });
  }

  const finalStrategyPct = parseFloat((strategyCumReturn - 100).toFixed(2));
  const finalBenchmarkPct = parseFloat((benchmarkCumReturn - 100).toFixed(2));
  const maxDrawDownCalculated = parseFloat((Math.max(...points.map(p => p.strategyReturn)) - finalStrategyPct + (Math.random() * 2 + 1)).toFixed(2));
  const finalMaxDrawdown = Math.max(2.1, maxDrawDownCalculated);

  const tradeLogs: any[] = [];
  const logDates = [
    points[Math.min(3, points.length - 1)].date,
    points[Math.min(9, points.length - 1)].date,
    points[Math.min(15, points.length - 1)].date,
    points[Math.min(21, points.length - 1)].date,
    points[Math.min(27, points.length - 1)].date
  ];

  const stockName = targetStock ? targetStock.name : '自选池龙头';
  const currentPrice = targetStock ? targetStock.price : 25;
  const qty = Math.round(config.initialCapital / 3 / currentPrice / 100) * 100 || 100;

  if (targetStock) {
    const p1 = parseFloat((currentPrice * 0.92).toFixed(2));
    const p2 = parseFloat((p1 * 1.12).toFixed(2));
    const p3 = parseFloat((currentPrice * 1.05).toFixed(2));
    const p4 = parseFloat((p3 * 0.96).toFixed(2));

    tradeLogs.push(
      { date: logDates[0], type: '建仓', price: p1, shares: qty, reason: `策略扫描发现 ${stockName} 触及关键买入因子阈值，发出建仓指令。` },
      { date: logDates[1], type: '止盈', price: p2, shares: qty, profitPct: 12.0, reason: `个股暴涨拉升超预期，触发设定阻力防线首波 ${(12.0).toFixed(1)}% 分段高抛止盈。` },
      { date: logDates[2], type: '买入', price: p3, shares: qty, reason: `主力资金二度涌入，技术面回踩均线获得有力支撑，策略回补仓位。` }
    );

    if (finalStrategyPct < -5) {
      tradeLogs.push({ date: logDates[3], type: '止损', price: p4, shares: qty, profitPct: -8.0, reason: `市场波动刺穿 ${config.stopLossPct}% 止损保护线下沿，触发风控盘强制离场避险。` });
    } else {
      const p5 = parseFloat((p3 * (1 + finalStrategyPct / 120)).toFixed(2));
      const prof = parseFloat((finalStrategyPct / 2.5).toFixed(1));
      tradeLogs.push({ date: logDates[3], type: '卖出', price: p5, shares: qty, profitPct: prof, reason: `大盘环境大势降温，个股趋势发出获利了结死叉信号，触发卖出关仓。` });
    }
  } else {
    tradeLogs.push(
      { date: logDates[0], type: '买入', price: 15.4, shares: 1500, reason: `全市场股票池筛选：5日线穿越20日线，批量多头建仓。` },
      { date: logDates[1], type: '卖出', price: 17.2, shares: 1500, profitPct: 11.7, reason: `成分股触发波段止盈，分批出局回收现金。` },
      { date: logDates[2], type: '买入', price: 32.5, shares: 800, reason: `行业景气度评分拐点，增持大消费/高端制造细分领头羊。` },
      { date: logDates[3], type: '卖出', price: 34.1, shares: 800, profitPct: 4.9, reason: `系统检测到市场恐慌指数攀升，全自选股票池风控级别上调，执行半仓避险。` }
    );
  }

  const commentary = `全量化智能引擎针对该模拟区间已拟合完成。评估结论：${scoreImpactComment} 该偏好模型本次最终达成 **${finalStrategyPct}%** 的模拟累积收益率，相比沪深300指数同期基准 **${finalBenchmarkPct}%**，取得了 **${(finalStrategyPct - finalBenchmarkPct).toFixed(2)}%** 的超额胜率。最大持仓期间回撤精准被限缩在 **${finalMaxDrawdown}%** 强制风控级别以内。`;

  return {
    totalReturn: finalStrategyPct,
    benchmarkReturn: finalBenchmarkPct,
    winRate: winRate,
    maxDrawdown: finalMaxDrawdown,
    tradeCount: Math.round(8 + Math.random() * 8),
    chartData: points,
    commentary,
    tradeLogs
  };
}

// 模拟股票及指数的价格tick更新
export function simulatePricesUpdate(
  stocks: StockInfo[], 
  indices: MarketIndex[], 
  sectors: SectorHeatInfo[]
): { stocks: StockInfo[], indices: MarketIndex[], sectors: SectorHeatInfo[] } {
  const nextStocks = stocks.map(st => {
    let factor = 0.0005 * (Math.random() - 0.5);
    
    if (st.isLeader) factor += 0.0008 * (Math.random() - 0.35); // 偏多
    if (st.sector === '半导体及人工智能') factor += 0.0005 * (Math.random() - 0.4);
    if (st.sector === '房地产') factor += 0.0005 * (Math.random() - 0.6); // 偏空

    let nextPct = st.changePct / 100 + factor;
    
    const maxLimit = st.code.startsWith('300') ? 0.20 : 0.10;
    if (nextPct > maxLimit - 0.0005) nextPct = maxLimit;
    if (nextPct < -maxLimit + 0.0005) nextPct = -maxLimit;

    const basePrice = st.price / (1 + st.changePct / 100);
    const nextPrice = parseFloat((basePrice * (1 + nextPct)).toFixed(2));
    const priceChange = parseFloat((nextPrice - basePrice).toFixed(2));

    let consecutiveBoards = st.consecutiveBoards;
    if (nextPct >= 0.099) {
      if (st.changePct < 9.9) {
         consecutiveBoards += 1;
      }
    } else {
      consecutiveBoards = nextPct > 0.05 ? consecutiveBoards : 0;
    }

    return {
      ...st,
      price: nextPrice,
      change: priceChange,
      changePct: parseFloat((nextPct * 100).toFixed(2)),
      consecutiveBoards,
      high: Math.max(st.high, nextPrice),
      low: Math.min(st.low, nextPrice),
    };
  });

  const nextIndices = indices.map(ind => {
    const factor = 0.0002 * (Math.random() - 0.45);
    let pct = ind.changePct / 100 + factor;
    const basePrice = ind.price / (1 + ind.changePct / 100);
    const nextPrice = parseFloat((basePrice * (1 + pct)).toFixed(2));
    const priceChange = parseFloat((nextPrice - basePrice).toFixed(2));

    return {
      ...ind,
      price: nextPrice,
      change: priceChange,
      changePct: parseFloat((pct * 100).toFixed(2)),
    };
  });

  const nextSectors = sectors.map(sec => {
    const sectorStocks = nextStocks.filter(st => st.sector.includes(sec.name.substring(0, 3)));
    let changePct = sec.changePct;
    if (sectorStocks.length > 0) {
      changePct = parseFloat((sectorStocks.reduce((sum, s) => sum + s.changePct, 0) / sectorStocks.length).toFixed(2));
    } else {
      changePct = parseFloat((sec.changePct + (Math.random() - 0.5) * 0.2).toFixed(2));
    }

    return {
      ...sec,
      changePct,
      netInflow: parseFloat((sec.netInflow + (Math.random() - 0.45) * 2).toFixed(1)),
    };
  });

  return { stocks: nextStocks, indices: nextIndices, sectors: nextSectors };
}

export const stockPoolGroupings: Record<string, string[]> = {
  '科技龙头股': ['601138.SH', '000977.SZ', '300750.SZ'],
  '成长绩优股': ['300750.SZ', '002594.SZ'],
  '高分红红利股': ['600519.SH', '600900.SH', '601318.SH'],
  '超跌反弹股': ['600438.SH', '300059.SZ'],
  '热点概念股': ['601127.SH', '600111.SH', '600675.SH'],
};

export const initialSentiment: MarketSentiment = {
  phase: '启动期',
  fearGreedIndex: 68,
  limitUpCount: 48,
  limitDownCount: 4,
  boardRatio: 64,
  totalTurnover: 8450,
  description: '两市温和放量突破压力位，科技龙头板块赚钱效应显著升温，市场人气重拾。'
};
