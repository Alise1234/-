/**
 * 行情中心 V4.0 — 数据行情中心 + 行业板块资金 融合
 * 一屏三区: 指数跑马灯 | 个股行情表(左) + 板块动量(右) | 资金流向
 */
import React, { useState, useEffect, useMemo } from 'react';
import { StockInfo, MarketIndex, SectorHeatInfo } from '../types';
import { API_BASE } from '../services/api';
import {
  Search, RefreshCw, ChevronUp, ChevronDown, TrendingUp, TrendingDown,
  Zap, Flame, DollarSign, BarChart2, ArrowUp, ArrowDown, Minus
} from 'lucide-react';

interface MarketCenterProps {
  stocks: StockInfo[];
  indices: MarketIndex[];
  sectors: SectorHeatInfo[];
  selectedStockCode: string;
  onSelectStock: (code: string) => void;
  onAddStockToPool: (stock: StockInfo) => void;
}

type SortField = 'code' | 'price' | 'changePct' | 'pe' | 'name';

export default function MarketCenter({
  stocks, indices, sectors, selectedStockCode,
  onSelectStock, onAddStockToPool,
}: MarketCenterProps) {
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedSector, setSelectedSector] = useState('ALL');
  const [sortField, setSortField] = useState<SortField>('changePct');
  const [sortAsc, setSortAsc] = useState(false);
  const [sectorTab, setSectorTab] = useState<'rotation' | 'ranking' | 'capital'>('rotation');

  // 多因子智能初选 Screener V4.0
  const [screenerActive, setScreenerActive] = useState(false);
  const [screenerData, setScreenerData] = useState<any[] | null>(null);
  const [screenerLoading, setScreenerLoading] = useState(false);
  const [screenerMinScore, setScreenerMinScore] = useState(80);

  const fetchScreenerTop = (minScore: number) => {
    setScreenerLoading(true);
    fetch(`${API_BASE}/api/screener/top?limit=30&min_score=${minScore}`)
      .then(r => r.json())
      .then(d => {
        if (d.success && d.data?.length) setScreenerData(d.data);
        else setScreenerData([]);
      })
      .catch(() => setScreenerData([]))
      .finally(() => setScreenerLoading(false));
  };

  const handleToggleScreener = () => {
    if (!screenerActive) fetchScreenerTop(screenerMinScore);
    setScreenerActive(!screenerActive);
  };

  // 个股搜索（延迟400ms防抖）
  const [searchResults, setSearchResults] = useState<StockInfo[] | null>(null);
  const [searchLoading, setSearchLoading] = useState(false);

  useEffect(() => {
    if (!searchTerm.trim()) { setSearchResults(null); return; }
    setSearchLoading(true);
    const timer = setTimeout(() => {
      fetch(`${API_BASE}/api/market/spot?limit=100&search=${encodeURIComponent(searchTerm)}`)
        .then(r => r.json())
        .then(d => {
          if (d.success && d.data) {
            setSearchResults(d.data.map((s: any) => ({
              code: (s.代码 || s.f12 || '').replace(/^(sh|sz|bj)/i, '').padStart(6, '0'),
              name: s.名称 || s.f14 || '',
              price: parseFloat(s.最新价 || s.f2 || '0'),
              change: parseFloat(s.涨跌额 || s.f4 || '0') || 0,
              changePct: parseFloat(s.涨跌幅 || s.f3 || '0'),
              sector: s.板块 || s.行业 || s.f13 || '其他',
              pe: parseFloat(s.市盈率 || s.f9 || '0') || 0,
              roe: 0, marketCap: 0, volume: 0, high: 0, low: 0,
              scores: { valuation: 0, profitability: 0, technical: 0, capitalFlow: 0, prosperity: 0 },
              signal: 'HOLD' as const, signalReason: '', isLeader: false, consecutiveBoards: 0,
            })));
          } else setSearchResults([]);
        })
        .catch(() => setSearchResults([]))
        .finally(() => setSearchLoading(false));
    }, 400);
    return () => clearTimeout(timer);
  }, [searchTerm]);

  // 筛选 + 排序
  const sectorsList = ['ALL', ...Array.from(new Set(stocks.map(s => s.sector)))];
  const baseStocks = searchResults ?? stocks;
  const filtered = baseStocks.filter(s => {
    const matchSearch = searchResults ? true : (s.name.includes(searchTerm) || s.code.includes(searchTerm));
    return matchSearch && (selectedSector === 'ALL' || s.sector === selectedSector);
  });
  const sorted = [...filtered].sort((a, b) => {
    if (sortField === 'name') return sortAsc ? a.name.localeCompare(b.name) : b.name.localeCompare(a.name);
    const va = a[sortField] as number, vb = b[sortField] as number;
    return sortAsc ? va - vb : vb - va;
  });

  const toggleSort = (f: SortField) => { setSortField(f); setSortAsc(sortField === f ? !sortAsc : false); };
  const SortArrow = ({ field }: { field: SortField }) =>
    sortField === field ? (sortAsc ? <ChevronUp className="w-3 h-3 text-red-500 inline ml-1" /> : <ChevronDown className="w-3 h-3 text-red-500 inline ml-1" />) : null;

  // 板块散点数据
  const sectorAlphaData = useMemo(() => {
    const maxAbs = Math.max(...sectors.map(s => Math.abs(s.alpha)), 1);
    return sectors.map(s => ({
      ...s, x: (s.momentumScore / 100) * 80 + 10,
      y: 90 - ((s.alpha + maxAbs) / (maxAbs * 2)) * 80,
      isPos: s.alpha >= 0,
    }));
  }, [sectors]);

  return (
    <div className="space-y-4">
      {/* ──── 1. 指数跑马灯 ──── */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        {indices.slice(0, 5).map(ind => {
          const isUp = ind.changePct >= 0;
          return (
            <div key={ind.code} className="bg-white border border-slate-200 rounded-xl p-3.5 hover:shadow-md hover:border-slate-300 transition">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-slate-600">{ind.name}</span>
                <span className={`text-[10px] font-mono ${isUp ? 'text-red-500' : 'text-emerald-500'}`}>{ind.code}</span>
              </div>
              <div className="flex items-baseline gap-2 mt-1.5">
                <span className={`text-lg font-black font-mono ${isUp ? 'text-red-600' : 'text-emerald-600'}`}>
                  {ind.price.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                </span>
                <span className={`text-xs font-bold flex items-center ${isUp ? 'text-red-600' : 'text-emerald-600'}`}>
                  {isUp ? <TrendingUp className="w-3 h-3 mr-0.5" /> : <TrendingDown className="w-3 h-3 mr-0.5" />}
                  {isUp ? '+' : ''}{ind.changePct.toFixed(2)}%
                </span>
              </div>
            </div>
          );
        })}
      </div>

      {/* Screener 多因子智能初选 */}
      {screenerActive && (
        <div className="bg-cyan-50/50 p-4 rounded-xl border border-cyan-200">
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 mb-3">
            <div>
              <h3 className="text-sm font-bold text-slate-800">🧠 多因子智能初选</h3>
              <span className={`text-[10px] ml-2 ${screenerLoading ? 'text-cyan-600 animate-pulse' : 'text-emerald-600'}`}>
                {screenerLoading ? '计算中...' : screenerData ? `${screenerData.length} 只通过筛选` : ''}
              </span>
            </div>
            <div className="flex items-center gap-2">
              <select value={screenerMinScore} onChange={e => { setScreenerMinScore(Number(e.target.value)); fetchScreenerTop(Number(e.target.value)); }}
                className="bg-white border border-slate-200 text-xs rounded px-2 py-1 font-bold cursor-pointer">
                <option value={60}>≥60分</option><option value={70}>≥70分</option>
                <option value={80}>≥80分</option><option value={85}>≥85分</option><option value={90}>≥90分</option>
              </select>
              <button onClick={() => setScreenerActive(false)}
                className="text-xs text-slate-500 hover:text-slate-700 font-semibold cursor-pointer">关闭</button>
            </div>
          </div>
          {screenerData && screenerData.length > 0 ? (
            <div className="overflow-x-auto max-h-48 overflow-y-auto bg-white rounded-lg border">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-50 text-slate-500 text-[10px] uppercase sticky top-0">
                  <tr><th className="p-2">代码</th><th className="p-2">名称</th><th className="p-2 text-right">评分</th><th className="p-2 text-right">趋势</th><th className="p-2 text-right">资金</th><th className="p-2 text-center">操作</th></tr>
                </thead>
                <tbody className="divide-y">
                  {screenerData.map((item: any) => (
                    <tr key={item.code} className="hover:bg-red-50 cursor-pointer" onClick={() => onSelectStock(item.code)}>
                      <td className="p-2 text-slate-500 font-mono">{item.code}</td>
                      <td className="p-2 font-bold font-sans">{item.name}</td>
                      <td className="p-2 text-right text-red-600 font-bold">{item.total_score ?? item.scores?.total_score ?? '-'}</td>
                      <td className="p-2 text-right">{item.trend_score ?? '-'}</td>
                      <td className="p-2 text-right">{item.capital_score ?? '-'}</td>
                      <td className="p-2 text-center"><button onClick={e => { e.stopPropagation(); onSelectStock(item.code); }}
                        className="px-2 py-0.5 bg-cyan-600 text-white rounded text-[10px] cursor-pointer">诊股</button></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : !screenerLoading && <p className="text-xs text-slate-500 text-center py-3">暂无符合条件的股票</p>}
        </div>
      )}

      {/* ──── 2. 双栏：个股行情 (60%) + 板块分析 (40%) ──── */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
        {/* 左：个股行情表 */}
        <div className="lg:col-span-7 bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden">
          <div className="p-4 border-b border-slate-100 flex flex-col sm:flex-row gap-3">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-2.5 w-4 h-4 text-slate-400" />
              <input
                type="text" placeholder="搜代码/名称 (如 600519、茅台)..."
                value={searchTerm} onChange={e => setSearchTerm(e.target.value)}
                className="w-full pl-10 pr-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm focus:outline-none focus:border-red-500"
              />
              {searchLoading && <RefreshCw className="absolute right-3 top-2.5 w-4 h-4 text-red-500 animate-spin" />}
            </div>
            <div className="flex gap-1.5 overflow-x-auto">
              {sectorsList.slice(0, 8).map(sec => (
                <button key={sec} onClick={() => setSelectedSector(sec)}
                  className={`px-2.5 py-1.5 rounded-lg text-xs font-bold whitespace-nowrap transition cursor-pointer border ${
                    selectedSector === sec ? 'bg-red-50 text-red-600 border-red-200' : 'bg-slate-50 text-slate-600 border-slate-200 hover:bg-slate-100'
                  }`}>{sec === 'ALL' ? '全部' : sec}</button>
              ))}
              <button onClick={handleToggleScreener}
                className={`px-2.5 py-1.5 rounded-lg text-xs font-bold whitespace-nowrap transition cursor-pointer border ${
                  screenerActive ? 'bg-cyan-50 text-cyan-700 border-cyan-200' : 'bg-slate-50 text-slate-600 border-slate-200 hover:bg-slate-100'
                }`}>🧠 智能初选</button>
            </div>
          </div>

          <div className="overflow-x-auto max-h-[420px] overflow-y-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 text-slate-500 font-bold uppercase tracking-wider sticky top-0 text-[10px] border-b">
                <tr>
                  <th className="p-2.5 cursor-pointer hover:bg-slate-100" onClick={() => toggleSort('name')}>名称/代码 <SortArrow field="name" /></th>
                  <th className="p-2.5 text-right cursor-pointer hover:bg-slate-100" onClick={() => toggleSort('price')}>现价 <SortArrow field="price" /></th>
                  <th className="p-2.5 text-right cursor-pointer hover:bg-slate-100" onClick={() => toggleSort('changePct')}>涨跌幅 <SortArrow field="changePct" /></th>
                  <th className="p-2.5">行业</th>
                  <th className="p-2.5 text-right cursor-pointer hover:bg-slate-100" onClick={() => toggleSort('pe')}>PE <SortArrow field="pe" /></th>
                  <th className="p-2.5 text-center">操作</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 font-mono text-xs">
                {sorted.slice(0, 80).map(st => {
                  const isUp = st.changePct >= 0;
                  const isSel = st.code === selectedStockCode;
                  return (
                    <tr key={st.code} onClick={() => onSelectStock(st.code)}
                      className={`cursor-pointer transition-colors ${isSel ? 'bg-red-50/70 border-l-2 border-red-500' : 'hover:bg-slate-50'}`}>
                      <td className="p-2.5">
                        <span className="font-sans font-black text-slate-800 text-xs block">{st.name}</span>
                        <span className="text-slate-400 text-[10px]">{st.code}</span>
                      </td>
                      <td className={`p-2.5 text-right font-bold ${isUp ? 'text-red-600' : 'text-emerald-600'}`}>
                        {st.price.toFixed(2)}
                      </td>
                      <td className="p-2.5 text-right">
                        <span className={`px-1.5 py-0.5 rounded font-black text-[10px] ${isUp ? 'bg-red-100 text-red-600' : 'bg-emerald-100 text-emerald-600'}`}>
                          {isUp ? '+' : ''}{st.changePct.toFixed(2)}%
                        </span>
                      </td>
                      <td className="p-2.5 text-slate-600 font-sans text-[11px]">{st.sector}</td>
                      <td className="p-2.5 text-right text-slate-700 font-bold">{st.pe > 0 ? st.pe.toFixed(1) : '-'}</td>
                      <td className="p-2.5 text-center" onClick={e => e.stopPropagation()}>
                        <button onClick={() => onAddStockToPool(st)}
                          className="px-2 py-1 bg-red-50 hover:bg-red-100 text-red-600 font-sans font-bold rounded text-[10px] border border-red-100 cursor-pointer">+自选</button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>

        {/* 右：板块分析 */}
        <div className="lg:col-span-5 space-y-4">
          {/* Tab 切换 */}
          <div className="flex gap-1 bg-slate-100 p-1 rounded-lg">
            {([
              { k: 'rotation', l: '轮动评分', i: <Zap className="w-3 h-3" /> },
              { k: 'ranking', l: '板块排名', i: <BarChart2 className="w-3 h-3" /> },
              { k: 'capital', l: '资金流向', i: <DollarSign className="w-3 h-3" /> },
            ] as const).map(tab => (
              <button key={tab.k} onClick={() => setSectorTab(tab.k)}
                className={`flex-1 flex items-center justify-center gap-1.5 py-1.5 rounded-md text-xs font-bold transition cursor-pointer ${
                  sectorTab === tab.k ? 'bg-white text-red-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'
                }`}>{tab.i}{tab.l}</button>
            ))}
          </div>

          {/* 轮动评分视图 */}
          {sectorTab === 'rotation' && (
            <div className="bg-white border border-slate-200 rounded-xl p-4">
              <div className="relative w-full" style={{ height: 280 }}>
                {/* 坐标轴 */}
                <div className="absolute bottom-6 left-10 right-4 top-4 border-l border-b border-slate-200">
                  <span className="absolute -left-8 top-1/2 -translate-y-1/2 text-[9px] text-slate-400 -rotate-90">Alpha →</span>
                  <span className="absolute bottom-[-18px] left-1/2 -translate-x-1/2 text-[9px] text-slate-400">轮动评分 →</span>
                </div>
                {sectorAlphaData.map(s => (
                  <div key={s.name}
                    className={`absolute text-[8px] font-bold px-1 py-0.5 rounded cursor-default border ${
                      s.isPos ? 'text-red-700 bg-red-50 border-red-200' : 'text-emerald-700 bg-emerald-50 border-emerald-200'
                    }`}
                    style={{ left: `${s.x}%`, top: `${s.y}%`, transform: 'translate(-50%,-50%)' }}
                    title={`${s.name}: 评分${s.momentumScore} Alpha${s.isPos ? '+' : ''}${s.alpha.toFixed(2)}%`}>
                    {s.name.substring(0, 3)}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* 板块排名视图 */}
          {sectorTab === 'ranking' && (
            <div className="bg-white border border-slate-200 rounded-xl p-4 max-h-[320px] overflow-y-auto">
              {sectors.slice(0, 15).map((s, i) => (
                <div key={s.name} className={`flex items-center justify-between py-2 px-3 rounded-lg mb-1 ${i === 0 ? 'bg-red-50' : 'hover:bg-slate-50'}`}>
                  <div className="flex items-center gap-2">
                    <span className={`text-[10px] font-black w-5 text-center ${i < 3 ? 'text-red-500' : 'text-slate-400'}`}>{i + 1}</span>
                    <span className="text-xs font-bold text-slate-700">{s.name}</span>
                  </div>
                  <div className="flex items-center gap-4 text-xs">
                    <span className="font-mono font-bold text-slate-700">{s.momentumScore}</span>
                    <span className={`font-mono ${s.alpha >= 0 ? 'text-red-600' : 'text-emerald-600'}`}>
                      {s.alpha >= 0 ? '+' : ''}{s.alpha.toFixed(2)}%
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* 资金流向视图 */}
          {sectorTab === 'capital' && (
            <div className="bg-white border border-slate-200 rounded-xl p-4 space-y-3">
              <div>
                <span className="text-[10px] font-bold text-red-600 flex items-center gap-1 mb-2"><ArrowUp className="w-3 h-3" /> 主力净流入 Top</span>
                {sectors.filter(s => s.alpha > 0).slice(0, 5).map(s => (
                  <div key={s.name} className="flex justify-between items-center py-1.5 px-2 text-xs">
                    <span className="font-bold text-slate-700">{s.name}</span>
                    <span className="font-mono text-red-600 font-bold">+{s.alpha.toFixed(2)}%</span>
                  </div>
                ))}
              </div>
              <div className="border-t border-slate-100 pt-3">
                <span className="text-[10px] font-bold text-emerald-600 flex items-center gap-1 mb-2"><ArrowDown className="w-3 h-3" /> 资金流出 Top</span>
                {sectors.filter(s => s.alpha < 0).slice(-5).reverse().map(s => (
                  <div key={s.name} className="flex justify-between items-center py-1.5 px-2 text-xs">
                    <span className="font-bold text-slate-700">{s.name}</span>
                    <span className="font-mono text-emerald-600 font-bold">{s.alpha.toFixed(2)}%</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
