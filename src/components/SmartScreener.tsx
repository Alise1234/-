/**
 * 智能因子选股 V1.0 — 作战指挥室
 * 五区布局: 宏观脉搏 | 筛选+排名 | 资金+消息 | 龙头+预警
 */
import React, { useState, useEffect, useMemo } from 'react';
import { StockInfo, MarketIndex, MarketSentiment, SectorHeatInfo } from '../types';
import { API_BASE } from '../services/api';
import {
  TrendingUp, TrendingDown, Search, RefreshCw, ChevronDown, ChevronUp,
  Zap, Award, Target, Shield, Brain, Newspaper, DollarSign,
  AlertTriangle, Crown, ArrowUp, ArrowDown, Filter, Sliders, X
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

interface SmartScreenerProps {
  stocks: StockInfo[];
  indices: MarketIndex[];
  sectors: SectorHeatInfo[];
  sentiment: MarketSentiment;
  selectedStockCode: string;
  onSelectStock: (code: string) => void;
  onAddToPool: (stock: StockInfo) => void;
}

interface ScreenerData {
  macro: any;
  rankings: any[];
  sector_flow: any[];
  leaders: any[];
  news: any[];
  alerts: any[];
  updated_at: string;
}

const DEFAULT_WEIGHTS = {
  valuation: 15, earningsQuality: 20, growth: 15,
  trend: 15, momentum: 10, health: 10, consensus: 10, risk: 5,
};

export default function SmartScreener({
  stocks, indices, sectors, sentiment,
  selectedStockCode, onSelectStock, onAddToPool,
}: SmartScreenerProps) {
  // 数据状态
  const [data, setData] = useState<ScreenerData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // 筛选状态
  const [minScore, setMinScore] = useState(75);
  const [filterIndustry, setFilterIndustry] = useState('');
  const [sortBy, setSortBy] = useState('total_score');
  const [sortAsc, setSortAsc] = useState(false);
  const [selectedRow, setSelectedRow] = useState<string | null>(null);

  // 自定义权重
  const [weights, setWeights] = useState({ ...DEFAULT_WEIGHTS });
  const [showWeights, setShowWeights] = useState(false);
  const [useCustomWeights, setUseCustomWeights] = useState(false);

  // 消息筛选
  const [newsFilter, setNewsFilter] = useState('');

  const fetchData = () => {
    setLoading(true);
    const params = new URLSearchParams({
      min_score: String(minScore),
      sort_by: sortBy,
      limit: '50',
    });
    if (filterIndustry) params.set('industry', filterIndustry);

    fetch(`${API_BASE}/api/screener/v2/overview?${params}`)
      .then(r => r.json())
      .then(d => { if (d.success) { setData(d.data); setError(''); } else setError(d.error || '数据为空'); })
      .catch(() => setError('后端不可达'))
      .finally(() => setLoading(false));
  };

  useEffect(() => { fetchData(); const t = setInterval(fetchData, 60000); return () => clearInterval(t); }, [minScore, filterIndustry, sortBy]);

  // 用自定义权重重排
  const rankedStocks = useMemo(() => {
    if (!data?.rankings) return [];
    let list = [...data.rankings];
    if (useCustomWeights) {
      list.sort((a, b) => {
        const sa = (a.valuation || 0) * weights.valuation + (a.earnings_quality || 0) * weights.earningsQuality +
          (a.growth || 0) * weights.growth + (a.trend || 0) * weights.trend +
          (a.momentum || 0) * weights.momentum + (a.health || 0) * weights.health +
          (a.consensus || 0) * weights.consensus + (a.risk || 0) * weights.risk;
        const sb = (b.valuation || 0) * weights.valuation + (b.earnings_quality || 0) * weights.earningsQuality +
          (b.growth || 0) * weights.growth + (b.trend || 0) * weights.trend +
          (b.momentum || 0) * weights.momentum + (b.health || 0) * weights.health +
          (b.consensus || 0) * weights.consensus + (b.risk || 0) * weights.risk;
        return sb - sa;
      });
    }
    return list;
  }, [data?.rankings, weights, useCustomWeights]);

  const filteredNews = useMemo(() => {
    if (!data?.news) return [];
    if (!newsFilter) return data.news;
    return data.news.filter((n: any) =>
      n.tags?.some((t: string) => t.includes(newsFilter)) ||
      n.title?.includes(newsFilter));
  }, [data?.news, newsFilter]);

  return (
    <div className="space-y-3">
      {/* ──── ① 宏观脉搏 ──── */}
      <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm">
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
          {indices.slice(0, 5).map(ind => {
            const up = ind.changePct >= 0;
            return (
              <div key={ind.code} className="text-center">
                <span className="text-[10px] text-slate-500 block">{ind.name}</span>
                <span className={`text-sm font-black font-mono ${up ? 'text-red-600' : 'text-emerald-600'}`}>
                  {ind.price.toFixed(2)}
                </span>
                <span className={`text-[10px] font-bold block ${up ? 'text-red-500' : 'text-emerald-500'}`}>
                  {up ? '+' : ''}{ind.changePct.toFixed(2)}%
                </span>
              </div>
            );
          })}
        </div>
        <div className="flex flex-wrap justify-center gap-4 mt-3 pt-3 border-t border-slate-100 text-xs">
          <span className="text-slate-500">恐慌贪婪 <span className="font-bold text-amber-600">{sentiment.fearGreedIndex}</span></span>
          <span className="text-slate-500">涨停 <span className="font-bold text-red-600">{sentiment.limitUpCount}</span></span>
          <span className="text-slate-500">跌停 <span className="font-bold text-emerald-600">{sentiment.limitDownCount}</span></span>
          <span className="text-slate-500">成交额 <span className="font-bold text-slate-700">{(sentiment.totalTurnover / 10).toFixed(0)}百亿</span></span>
          {data?.macro?.northbound_net !== 0 && (
            <span className="text-slate-500">北向 <span className={`font-bold ${data?.macro?.northbound_net > 0 ? 'text-red-600' : 'text-emerald-600'}`}>
              {data?.macro?.northbound_net > 0 ? '+' : ''}{data?.macro?.northbound_net}亿</span>
          </span>
          )}
          {data?.macro?.margin_balance > 0 && (
            <span className="text-slate-500">融资余额 <span className="font-bold text-slate-700">{(data?.macro?.margin_balance / 1e8).toFixed(0)}亿</span></span>
          )}
        </div>
      </div>

      {/* ──── ② + ③ 筛选面板 + 排名表 ──── */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-3">
        {/* ② 筛选面板 */}
        <div className="lg:col-span-3 bg-white border border-slate-200 rounded-xl p-4 shadow-sm space-y-4">
          <h3 className="text-sm font-bold text-slate-800 flex items-center gap-1.5"><Filter className="w-4 h-4 text-red-500" />因子筛选</h3>

          <div>
            <label className="text-[10px] font-bold text-slate-500 block mb-1">行业</label>
            <select value={filterIndustry} onChange={e => setFilterIndustry(e.target.value)}
              className="w-full bg-slate-50 border text-xs rounded-lg p-1.5">
              <option value="">全部行业</option>
              {Array.from(new Set(stocks.map(s => s.sector))).slice(0, 15).map(s => (
                <option key={s} value={s}>{s}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="text-[10px] font-bold text-slate-500 block mb-1">最低总分: {minScore}</label>
            <input type="range" min={40} max={95} step={5} value={minScore}
              onChange={e => setMinScore(Number(e.target.value))} className="w-full accent-red-500" />
          </div>

          <div>
            <label className="text-[10px] font-bold text-slate-500 block mb-1">排序</label>
            <select value={sortBy} onChange={e => setSortBy(e.target.value)}
              className="w-full bg-slate-50 border text-xs rounded-lg p-1.5">
              <option value="total_score">综合评分</option>
              <option value="valuation_score">估值水平</option>
              <option value="earnings_quality_score">盈利质量</option>
              <option value="growth_score">成长性</option>
              <option value="trend_score">技术趋势</option>
            </select>
          </div>

          {/* 自定义权重 */}
          <button onClick={() => setShowWeights(!showWeights)}
            className="w-full flex items-center justify-between text-xs font-bold text-slate-600 hover:text-red-600 transition cursor-pointer">
            <span className="flex items-center gap-1"><Sliders className="w-3 h-3" />自定义权重</span>
            {showWeights ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
          </button>

          <AnimatePresence>
            {showWeights && (
              <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }}
                className="space-y-2 overflow-hidden">
                {[
                  { k: 'valuation', l: '估值', max: 15 },
                  { k: 'earningsQuality', l: '盈利质量', max: 20 },
                  { k: 'growth', l: '成长性', max: 15 },
                  { k: 'trend', l: '技术趋势', max: 15 },
                  { k: 'momentum', l: '动量资金', max: 10 },
                  { k: 'health', l: '财务健康', max: 10 },
                  { k: 'consensus', l: '机构共识', max: 10 },
                  { k: 'risk', l: '风险控制', max: 5 },
                ].map(({ k, l, max }) => (
                  <div key={k}>
                    <div className="flex justify-between text-[10px]">
                      <span className="text-slate-600">{l}</span>
                      <span className="font-mono font-bold text-red-600">{weights[k as keyof typeof weights]}</span>
                    </div>
                    <input type="range" min={0} max={max} step={1}
                      value={weights[k as keyof typeof weights]}
                      onChange={e => { setWeights({ ...weights, [k]: Number(e.target.value) }); setUseCustomWeights(true); }}
                      className="w-full accent-red-500 h-1" />
                  </div>
                ))}
                <div className="flex gap-2 pt-1">
                  <button onClick={() => { setWeights({ ...DEFAULT_WEIGHTS }); setUseCustomWeights(false); }}
                    className="flex-1 py-1 text-[10px] font-bold rounded bg-slate-100 hover:bg-slate-200 text-slate-600 cursor-pointer">重置</button>
                  <button onClick={() => setUseCustomWeights(!useCustomWeights)}
                    className={`flex-1 py-1 text-[10px] font-bold rounded cursor-pointer ${useCustomWeights ? 'bg-red-50 text-red-600 border border-red-200' : 'bg-slate-100 text-slate-600'}`}>
                    {useCustomWeights ? '自定义✓' : '启用'}
                  </button>
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          <button onClick={fetchData}
            className="w-full py-2 bg-red-600 hover:bg-red-700 text-white text-xs font-bold rounded-lg transition cursor-pointer flex items-center justify-center gap-1">
            <RefreshCw className={`w-3 h-3 ${loading ? 'animate-spin' : ''}`} />应用筛选
          </button>
          {error && <p className="text-[10px] text-red-500 text-center">{error}</p>}
        </div>

        {/* ③ 排名表 */}
        <div className="lg:col-span-9 bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden">
          <div className="p-3 border-b border-slate-100 flex justify-between items-center">
            <h3 className="text-sm font-bold text-slate-800 flex items-center gap-1.5">
              <Award className="w-4 h-4 text-red-500" />选股排名
              {data && <span className="text-[10px] font-normal text-slate-400 ml-2">Top {rankedStocks.length} · {data.updated_at}更新</span>}
            </h3>
            <span className="text-[10px] text-slate-400">{useCustomWeights ? '自定义权重' : '默认权重'}</span>
          </div>

          <div className="overflow-x-auto max-h-[420px] overflow-y-auto">
            <table className="w-full text-left text-[10px]">
              <thead className="bg-slate-50 text-slate-500 font-bold uppercase sticky top-0 border-b">
                <tr>
                  <th className="p-2 w-8">#</th>
                  <th className="p-2">名称/代码</th>
                  <th className="p-2 text-right">总分</th>
                  <th className="p-2 text-right hidden md:table-cell">估</th>
                  <th className="p-2 text-right hidden md:table-cell">盈</th>
                  <th className="p-2 text-right hidden md:table-cell">成</th>
                  <th className="p-2 text-right hidden md:table-cell">趋</th>
                  <th className="p-2 text-right hidden md:table-cell">动</th>
                  <th className="p-2 text-right hidden md:table-cell">财</th>
                  <th className="p-2 text-right hidden md:table-cell">共</th>
                  <th className="p-2 text-right hidden md:table-cell">风</th>
                  <th className="p-2 text-center">信号</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {rankedStocks.map((r: any, i: number) => {
                  const isSel = selectedRow === r.code;
                  const sigColor = r.signal === 'BUY' ? 'bg-red-100 text-red-600' : r.signal === 'SELL' ? 'bg-emerald-100 text-emerald-600' : 'bg-slate-100 text-slate-500';
                  return (
                    <React.Fragment key={r.code}>
                      <tr onClick={() => { setSelectedRow(isSel ? null : r.code); onSelectStock(r.code); }}
                        className={`cursor-pointer transition-colors ${isSel ? 'bg-red-50/60' : 'hover:bg-slate-50'}`}>
                        <td className="p-2">
                          <span className={`font-black ${i < 3 ? 'text-red-500' : 'text-slate-400'}`}>{i + 1}</span>
                        </td>
                        <td className="p-2">
                          <span className="font-bold text-slate-800 font-sans text-xs block">{r.name}</span>
                          <span className="text-slate-400">{r.code}</span>
                        </td>
                        <td className="p-2 text-right font-black font-mono text-sm text-red-600">{r.total_score}</td>
                        <td className="p-2 text-right hidden md:table-cell">{r.valuation}</td>
                        <td className="p-2 text-right hidden md:table-cell">{r.earnings_quality}</td>
                        <td className="p-2 text-right hidden md:table-cell">{r.growth}</td>
                        <td className="p-2 text-right hidden md:table-cell">{r.trend}</td>
                        <td className="p-2 text-right hidden md:table-cell">{r.momentum}</td>
                        <td className="p-2 text-right hidden md:table-cell">{r.health}</td>
                        <td className="p-2 text-right hidden md:table-cell">{r.consensus}</td>
                        <td className="p-2 text-right hidden md:table-cell">{r.risk}</td>
                        <td className="p-2 text-center">
                          <span className={`px-1.5 py-0.5 rounded font-bold text-[9px] ${sigColor}`}>
                            {r.signal === 'BUY' ? '买入' : r.signal === 'SELL' ? '卖出' : '持有'}
                          </span>
                        </td>
                      </tr>
                      {/* 展开诊断卡片 */}
                      {isSel && (
                        <tr>
                          <td colSpan={12} className="p-3 bg-red-50/40 border-b">
                            <div className="grid grid-cols-4 gap-3">
                              <div className="col-span-1 text-center">
                                <span className="text-[9px] text-slate-400 block">综合评分</span>
                                <span className="text-2xl font-black text-red-600">{r.total_score}</span>
                              </div>
                              <div className="col-span-3 grid grid-cols-4 gap-1">
                                {[
                                  { l: '估值', v: r.valuation, max: 15 },
                                  { l: '盈利', v: r.earnings_quality, max: 20 },
                                  { l: '成长', v: r.growth, max: 15 },
                                  { l: '趋势', v: r.trend, max: 15 },
                                  { l: '动量', v: r.momentum, max: 10 },
                                  { l: '财务', v: r.health, max: 10 },
                                  { l: '共识', v: r.consensus, max: 10 },
                                  { l: '风险', v: r.risk, max: 5 },
                                ].map(({ l, v, max }) => (
                                  <div key={l} className="text-center">
                                    <span className="text-[8px] text-slate-400 block">{l}</span>
                                    <div className="w-full bg-slate-200 h-1 rounded-full mt-0.5">
                                      <div className="bg-red-500 h-1 rounded-full" style={{ width: `${(v / max) * 100}%` }} />
                                    </div>
                                    <span className="text-[9px] font-mono font-bold">{v}</span>
                                  </div>
                                ))}
                              </div>
                              <div className="col-span-4 flex gap-2 justify-end pt-1 border-t border-slate-200">
                                <button onClick={() => { const s = stocks.find(x => x.code === r.code); if (s) onAddToPool(s); }}
                                  className="px-3 py-1 bg-red-50 hover:bg-red-100 text-red-600 text-[10px] font-bold rounded border border-red-200 cursor-pointer">+ 加入自选</button>
                                <button onClick={() => onSelectStock(r.code)}
                                  className="px-3 py-1 bg-slate-100 hover:bg-slate-200 text-slate-600 text-[10px] font-bold rounded cursor-pointer">深度诊断</button>
                              </div>
                            </div>
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
                  );
                })}
                {rankedStocks.length === 0 && (
                  <tr><td colSpan={12} className="p-8 text-center text-slate-400 text-xs">
                    {loading ? '加载中...' : '无符合条件股票，请降低评分阈值'}
                  </td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* ──── ④ 资金面 + 消息面 ──── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
        {/* 资金面 */}
        <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm">
          <h3 className="text-sm font-bold text-slate-800 flex items-center gap-1.5 mb-3"><DollarSign className="w-4 h-4 text-emerald-500" />主力资金追踪</h3>
          <div className="space-y-2 text-xs">
            {data?.sector_flow && data.sector_flow.length > 0 ? (
              <>
                <span className="text-[10px] font-bold text-red-600 flex items-center gap-1"><ArrowUp className="w-3 h-3" />板块净流入 Top</span>
                {data.sector_flow.filter((s: any) => s.net_inflow > 0).slice(0, 5).map((s: any) => (
                  <div key={s.sector} className="flex justify-between py-1 px-2 bg-slate-50 rounded">
                    <span className="font-bold">{s.sector}</span>
                    <span className="font-mono text-red-600 font-bold">+{s.net_inflow}亿</span>
                  </div>
                ))}
                <span className="text-[10px] font-bold text-emerald-600 flex items-center gap-1 mt-2"><ArrowDown className="w-3 h-3" />板块净流出</span>
                {data.sector_flow.filter((s: any) => s.net_inflow < 0).slice(-5).reverse().map((s: any) => (
                  <div key={s.sector} className="flex justify-between py-1 px-2 bg-slate-50 rounded">
                    <span className="font-bold">{s.sector}</span>
                    <span className="font-mono text-emerald-600 font-bold">{s.net_inflow}亿</span>
                  </div>
                ))}
              </>
            ) : (
              <p className="text-slate-400 text-xs text-center py-4">板块资金数据加载中...</p>
            )}
          </div>
        </div>

        {/* 消息面 */}
        <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm">
          <div className="flex justify-between items-center mb-3">
            <h3 className="text-sm font-bold text-slate-800 flex items-center gap-1.5"><Newspaper className="w-4 h-4 text-blue-500" />实时消息驱动</h3>
            <select value={newsFilter} onChange={e => setNewsFilter(e.target.value)}
              className="text-[10px] border rounded px-1.5 py-0.5 bg-slate-50">
              <option value="">全部</option>
              <option value="半导体">半导体</option>
              <option value="AI算力">AI算力</option>
              <option value="新能源汽车">新能源</option>
              <option value="消费">消费</option>
              <option value="金融">金融</option>
              <option value="医药">医药</option>
            </select>
          </div>
          <div className="space-y-1.5 max-h-[200px] overflow-y-auto">
            {filteredNews.map((n: any, i: number) => {
              const color = n.sentiment === 'positive' ? 'border-l-green-500 bg-green-50/30' :
                n.sentiment === 'negative' ? 'border-l-red-500 bg-red-50/30' : 'border-l-slate-300';
              return (
                <div key={i} className={`border-l-2 ${color} pl-2 py-1.5 text-xs`}>
                  <div className="flex items-center gap-1.5">
                    <span className="text-[9px] text-slate-400">{n.time}</span>
                    {n.tags?.map((t: string) => (
                      <span key={t} className="text-[8px] px-1 py-0.5 rounded bg-slate-100 text-slate-500">{t}</span>
                    ))}
                  </div>
                  <p className="text-slate-700 leading-snug mt-0.5 font-medium">{n.title}</p>
                  {n.related_stocks?.length > 0 && (
                    <span className="text-[9px] text-red-500 mt-0.5 block">关联: {n.related_stocks.join(', ')}</span>
                  )}
                </div>
              );
            })}
            {filteredNews.length === 0 && (
              <p className="text-slate-400 text-xs text-center py-4">暂无消息，请确认网络连接</p>
            )}
          </div>
        </div>
      </div>

      {/* ──── ⑤ 龙头梯队 + 风险预警 ──── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
        {/* 龙头 */}
        <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm">
          <h3 className="text-sm font-bold text-slate-800 flex items-center gap-1.5 mb-3"><Crown className="w-4 h-4 text-amber-500" />龙头梯队</h3>
          <div className="flex flex-wrap gap-2">
            {data?.leaders && data.leaders.length > 0 ? (
              data.leaders.map((l: any) => (
                <div key={l.code} onClick={() => onSelectStock(l.code)}
                  className="px-3 py-2 bg-amber-50 border border-amber-200 rounded-lg cursor-pointer hover:bg-amber-100 transition">
                  <span className="text-xs font-bold text-slate-700">{l.name}</span>
                  <span className="text-[9px] text-red-500 font-bold ml-1.5">{l.boards}B</span>
                </div>
              ))
            ) : (
              <p className="text-slate-400 text-xs">暂无连板数据</p>
            )}
          </div>
        </div>

        {/* 风险预警 */}
        <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm">
          <h3 className="text-sm font-bold text-slate-800 flex items-center gap-1.5 mb-3"><AlertTriangle className="w-4 h-4 text-red-500" />风险预警</h3>
          <div className="space-y-1.5 max-h-[120px] overflow-y-auto">
            {data?.alerts && data.alerts.length > 0 ? (
              data.alerts.map((a: any) => (
                <div key={a.code} className="flex items-center justify-between py-1 px-2 bg-red-50/40 rounded text-xs">
                  <div>
                    <span className={`text-[9px] font-bold ${a.type === '超买' ? 'text-red-600' : 'text-amber-600'}`}>{a.type}</span>
                    <span className="font-bold text-slate-700 ml-2">{a.name}</span>
                  </div>
                  <span className="text-[10px] text-slate-500">{a.reason}</span>
                </div>
              ))
            ) : (
              <p className="text-slate-400 text-xs text-center py-3">✅ 当前无高风险预警</p>
            )}
          </div>
        </div>
      </div>

      {/* 底部状态栏 */}
      <div className="text-center text-[9px] text-slate-400 py-1">
        数据来源: akshare · 东方财富 · 数据库缓存 · 刷新间隔 60s · {loading ? '加载中...' : `就绪 ${data?.updated_at || ''}`}
      </div>
    </div>
  );
}
