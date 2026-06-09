import React, { useState, useEffect } from 'react';
import { StockInfo, MarketIndex } from '../types';
import { API_BASE } from '../services/api';
import { Search, RotateCcw, Play, Pause, TrendingUp, TrendingDown, RefreshCw, ChevronUp, ChevronDown } from 'lucide-react';

interface DataCenterProps {
  stocks: StockInfo[];
  indices: MarketIndex[];
  selectedStockCode: string;
  onSelectStock: (code: string) => void;
  onAddStockToPool: (stock: StockInfo) => void;
}

type SortField = 'code' | 'price' | 'changePct' | 'pe' | 'roe' | 'name';

export default function DataCenter({
  stocks,
  indices,
  selectedStockCode,
  onSelectStock,
  onAddStockToPool,
}: DataCenterProps) {
  const [searchTerm, setSearchTerm] = useState('');
  const [searchResults, setSearchResults] = useState<StockInfo[] | null>(null);
  const [searchLoading, setSearchLoading] = useState(false);
  const [selectedSector, setSelectedSector] = useState('ALL');

  useEffect(() => {
    if (!searchTerm.trim()) {
      setSearchResults(null);
      return;
    }

    setSearchLoading(true);
    const delayDebounce = setTimeout(() => {
      fetch(`${API_BASE}/api/market/spot?limit=150&search=${encodeURIComponent(searchTerm)}`)
        .then((r) => r.json())
        .then((d) => {
          if (d.success && d.data) {
            const mapped = d.data.map((s: any) => {
              const raw = (s.代码 || s.f12 || '').replace(/^(sh|sz|bj)/i, '').padStart(6, '0');
              const currentPrice = parseFloat(s.最新价 || s.f2 || '0');
              return {
                code: raw,
                name: s.名称 || s.f14 || '',
                price: currentPrice,
                change: parseFloat(s.涨跌额 || s.f4 || '0') || 0,
                changePct: parseFloat(s.涨跌幅 || s.f3 || '0'),
                sector: s.板块 || s.行业 || s.f13 || '其他',
                pe: parseFloat(s.市盈率 || s.f9 || '0') || 0,
                roe: parseFloat(s.净资产收益率 || s.f5 || '0') || 0,
                marketCap: parseFloat(s.总市值 || '0') / 1e8 || 0,
                volume: parseFloat(s.成交量 || s.f5 || '0') || 0,
                high: parseFloat(s.最高 || s.f15 || '0') || currentPrice,
                low: parseFloat(s.最低 || s.f16 || '0') || currentPrice,
                scores: { valuation: 60, profitability: 60, technical: 60, capitalFlow: 60, prosperity: 65 },
                signal: 'HOLD' as const,
                signalReason: '该股已被检索载入，双击可查因数或交易',
                isLeader: false,
                consecutiveBoards: 0,
              };
            });
            setSearchResults(mapped);
          } else {
            setSearchResults([]);
          }
        })
        .catch(() => {
          setSearchResults([]);
        })
        .finally(() => {
          setSearchLoading(false);
        });
    }, 400);

    return () => clearTimeout(delayDebounce);
  }, [searchTerm]);

  // 1. Column Sorting States
  const [sortField, setSortField] = useState<SortField>('changePct');
  const [sortAsc, setSortAsc] = useState<boolean>(false);

  // 1b. Screener 多因子智能初选状态
  const [screenerActive, setScreenerActive] = useState<boolean>(false);
  const [screenerData, setScreenerData] = useState<any[] | null>(null);
  const [screenerLoading, setScreenerLoading] = useState<boolean>(false);
  const [screenerMinScore, setScreenerMinScore] = useState<number>(80);

  // 拉取后端多因子筛选 Top 股票
  const fetchScreenerTop = (minScore: number) => {
    setScreenerLoading(true);
    fetch(`${API_BASE}/api/screener/top?limit=30&min_score=${minScore}`)
      .then((r) => r.json())
      .then((d) => {
        if (d.success && d.data?.length) {
          setScreenerData(d.data);
        } else {
          setScreenerData([]);
        }
      })
      .catch(() => {
        // 降级：从当前 stocks 中本地筛选
        const localTop = [...stocks]
          .sort((a, b) =>
            (b.scores.valuation + b.scores.profitability + b.scores.technical + b.scores.capitalFlow + b.scores.prosperity) / 5 -
            (a.scores.valuation + a.scores.profitability + a.scores.technical + a.scores.capitalFlow + a.scores.prosperity) / 5
          )
          .filter((s) => {
            const avg = (s.scores.valuation + s.scores.profitability + s.scores.technical + s.scores.capitalFlow + s.scores.prosperity) / 5;
            return avg >= minScore;
          })
          .slice(0, 30);
        setScreenerData(localTop);
      })
      .finally(() => setScreenerLoading(false));
  };

  const handleToggleScreener = () => {
    if (!screenerActive) {
      fetchScreenerTop(screenerMinScore);
    }
    setScreenerActive(!screenerActive);
  };

  // 2. Quote Flashing System
  const [prevPrices, setPrevPrices] = useState<Record<string, number>>({});
  const [flashes, setFlashes] = useState<Record<string, 'up' | 'down' | null>>({});

  // === 真实行情接入（Python后端） ===
  const [realData, setRealData] = useState<Record<string, {price: number; changePct: number; name: string}>>({});
  const [realIndices, setRealIndices] = useState<any[] | null>(null);

  useEffect(() => {
    const fetchReal = () => {
      fetch(`${API_BASE}/api/market/spot?limit=200`)
        .then(r => r.json())
        .then(d => {
          if (d.success && d.data) {
            const map: Record<string, any> = {};
            d.data.forEach((s: any) => {
              const raw = s.代码 || s.f12 || '';
              const code = raw.replace(/^(sh|sz|bj)/i, '').padStart(6, '0');
              map[code] = {
                price: parseFloat(s.最新价 || s.f2 || '0'),
                changePct: parseFloat(s.涨跌幅 || s.f3 || '0'),
                name: s.名称 || s.f14 || '',
              };
            });
            setRealData(map);
          }
        })
        .catch(() => {});
    };
    // 真实指数
    const fetchIndices = () => {
      fetch(`${API_BASE}/api/market/indices`)
        .then(r => r.json())
        .then(d => { if (d.success) setRealIndices(d.data); })
        .catch(() => {});
    };
    fetchReal();
    fetchIndices();
    const timer = setInterval(fetchReal, 30000);
    const idxTimer = setInterval(fetchIndices, 60000);
    return () => { clearInterval(timer); clearInterval(idxTimer); };
  }, []);

  useEffect(() => {
    const newFlashes: Record<string, 'up' | 'down' | null> = {};
    let hasChanges = false;

    stocks.forEach((st) => {
      const prev = prevPrices[st.code];
      if (prev !== undefined && prev !== st.price) {
        newFlashes[st.code] = st.price > prev ? 'up' : 'down';
        hasChanges = true;
      }
    });

    if (hasChanges) {
      setFlashes((prev) => ({ ...prev, ...newFlashes }));
      const timer = setTimeout(() => {
        setFlashes({});
      }, 700);

      // Keep prevPrices updated with current prices
      const updatedPrices = stocks.reduce((acc, st) => {
        acc[st.code] = st.price;
        return acc;
      }, {} as Record<string, number>);
      setPrevPrices(updatedPrices);

      return () => clearTimeout(timer);
    } else {
      // Initialize prevPrices
      if (Object.keys(prevPrices).length === 0 && stocks.length > 0) {
        const initialPrices = stocks.reduce((acc, st) => {
          acc[st.code] = st.price;
          return acc;
        }, {} as Record<string, number>);
        setPrevPrices(initialPrices);
      }
    }
  }, [stocks]);

  // Extract unique sectors list
  const sectorsList = ['ALL', ...Array.from(new Set(stocks.map((s) => s.sector)))];

  // Search and filter stocks list
  const baseStocks = searchResults !== null ? searchResults : stocks;

  const filteredStocks = baseStocks.filter((st) => {
    const matchesSearch = searchResults !== null ? true : (
      st.name.includes(searchTerm) || st.code.includes(searchTerm)
    );
    const matchesSector = selectedSector === 'ALL' || st.sector === selectedSector;
    return matchesSearch && matchesSector;
  });

  // 合并真实行情（兼容 600519.SH → 600519 格式差异）
  const mergedStocks = filteredStocks.map(s => {
    const bareCode = s.code.replace(/\.(SH|SZ|BJ)$/i, '');
    const real = realData[bareCode] || realData[s.code];
    if (real) return { ...s, price: real.price, changePct: real.changePct, name: real.name || s.name };
    return s;
  });

  // Sort logic
  const sortedStocks = [...mergedStocks].sort((a, b) => {
    let valA = a[sortField];
    let valB = b[sortField];

    // Under-the-hood sorting for overall average score option
    if (sortField === 'name') {
      return sortAsc ? a.name.localeCompare(b.name) : b.name.localeCompare(a.name);
    }
    if (sortField === 'code') {
      return sortAsc ? a.code.localeCompare(b.code) : b.code.localeCompare(a.code);
    }

    const nA = valA as number;
    const nB = valB as number;
    return sortAsc ? nA - nB : nB - nA;
  });

  const toggleSort = (field: SortField) => {
    if (sortField === field) {
      setSortAsc(!sortAsc);
    } else {
      setSortField(field);
      setSortAsc(false); // Default desc for numeric screens
    }
  };

  const renderSortArrow = (field: SortField) => {
    if (sortField !== field) return null;
    return sortAsc ? <ChevronUp className="w-3 h-3 inline ml-1 text-red-500" /> : <ChevronDown className="w-3 h-3 inline ml-1 text-red-500" />;
  };

  return (
    <div className="bg-white border border-slate-200 rounded-xl p-6 shadow-sm hover:shadow-md hover:border-slate-300 transition" id="data-center-module">
      {/* 模块头部 */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 mb-5">
        <div>
          <h2 className="text-lg md:text-xl font-bold text-slate-900 flex items-center gap-2">
            <span className="w-1.5 h-5 bg-red-500 rounded-full"></span>
            数据中心 & 实时行情
          </h2>
          <p className="text-xs md:text-sm text-slate-500 mt-0.5 font-medium">
            沪深京A股实时多核分色计算行情（A股：红涨绿跌；支持行情闪烁及自由排序）
          </p>
        </div>
        
        {/* 工具栏 */}
        <div className="flex items-center gap-2 self-stretch sm:self-auto">
          <button
            onClick={handleToggleScreener}
            className={`flex items-center justify-center gap-1.5 px-3.5 py-2 text-xs md:text-sm font-bold rounded-lg transition cursor-pointer border ${
              screenerActive
                ? 'bg-cyan-50 text-cyan-700 border-cyan-200'
                : 'bg-slate-100 hover:bg-slate-200 text-slate-700 border-slate-200'
            }`}
            title="请求后端多因子筛选器，过滤评分≥80且多头排列的优质股"
          >
            🧠 多因子智能初选
          </button>
        </div>
      </div>

      {/* 指数多网格 */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-5">
        {(realIndices || indices).map((ind) => {
          const isUp = ind.changePct >= 0;
          return (
            <div
              key={ind.code}
              className="bg-slate-55/70 border border-slate-200 rounded-lg p-3 flex flex-col justify-between hover:border-slate-300 hover:bg-slate-50 transition"
            >
              <div className="flex justify-between items-center">
                <span className="text-xs font-bold text-slate-700">{ind.name}</span>
                <span className="text-[10px] font-mono text-slate-400">{ind.code}</span>
              </div>
              <div className="mt-2 flex items-baseline justify-between">
                <span
                  className={`text-lg font-bold font-mono ${
                    isUp ? 'text-red-600' : 'text-emerald-600'
                  }`}
                >
                  {ind.price.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </span>
                <span
                  className={`text-xs font-bold flex items-center gap-0.5 ${
                    isUp ? 'text-red-600' : 'text-emerald-600'
                  }`}
                >
                  {isUp ? '+' : ''}
                  {ind.changePct.toFixed(2)}%
                </span>
              </div>
              <div className="text-[10px] text-slate-500 mt-1 flex justify-between">
                <span>量: {ind.volume}</span>
                <span className={isUp ? 'text-red-500/30' : 'text-emerald-505/30'}>
                  {isUp ? '▲' : '▼'}
                </span>
              </div>
            </div>
          );
        })}
      </div>

      {/* 🧠 多因子智能初选 Screener 结果面板 */}
      {screenerActive && (
        <div className="mb-5 bg-cyan-50/50 p-5 rounded-xl border border-cyan-200">
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 mb-3">
            <div>
              <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                🧠 多因子智能初选
                {screenerLoading && <span className="text-[10px] text-cyan-600 animate-pulse">⏳ 计算中...</span>}
                {!screenerLoading && screenerData && (
                  <span className="text-[10px] font-bold text-emerald-700 bg-emerald-50 px-1.5 py-0.5 rounded border border-emerald-200">
                    {screenerData.length} 只通过筛选
                  </span>
                )}
              </h3>
              <p className="text-[10px] text-slate-500 mt-0.5 font-medium">
                评分≥{screenerMinScore} · MA20 &gt; MA60多头排列 · 排除ST · RSI&lt;80
              </p>
            </div>
            <div className="flex items-center gap-2">
              <select
                value={screenerMinScore}
                onChange={(e) => { setScreenerMinScore(Number(e.target.value)); fetchScreenerTop(Number(e.target.value)); }}
                className="bg-white border border-slate-200 text-[11px] text-slate-700 rounded px-2 py-1 font-bold focus:outline-none focus:border-cyan-500 cursor-pointer"
              >
                <option value={60}>≥60分</option>
                <option value={70}>≥70分</option>
                <option value={80}>≥80分</option>
                <option value={85}>≥85分</option>
                <option value={90}>≥90分</option>
              </select>
              <button
                onClick={() => setScreenerActive(false)}
                className="text-[10px] text-slate-500 hover:text-slate-700 px-2 py-1 font-semibold rounded transition cursor-pointer"
              >
                关闭
              </button>
            </div>
          </div>

          {screenerData && screenerData.length > 0 ? (
            <div className="overflow-x-auto max-h-64 overflow-y-auto border border-slate-200 rounded-lg bg-white shadow-xs">
              <table className="w-full text-left text-xs font-mono">
                <thead className="bg-slate-50 text-slate-500 text-[10px] uppercase tracking-wider sticky top-0 border-b border-slate-100">
                  <tr>
                    <th className="p-2.5">代码</th>
                    <th className="p-2.5">名称</th>
                    <th className="p-2.5 text-right">综合评分</th>
                    <th className="p-2.5 text-right">趋势</th>
                    <th className="p-2.5 text-right">资金</th>
                    <th className="p-2.5 text-right">估值</th>
                    <th className="p-2.5 text-center">操作</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {screenerData.map((item: any) => {
                    const sc = item.scores || item;
                    return (
                      <tr
                        key={item.code}
                        className={`hover:bg-slate-50/80 transition cursor-pointer ${
                          item.code === selectedStockCode ? 'bg-red-50 font-bold border-l-2 border-red-500' : ''
                        }`}
                        onClick={() => onSelectStock(item.code)}
                      >
                        <td className="p-2.5 text-slate-500">{item.code}</td>
                        <td className="p-2.5 text-slate-800 font-sans font-black">{item.name}</td>
                        <td className="p-2.5 text-right">
                          <span className="text-red-600 font-extrabold">
                            {sc.total_score ?? sc.overall_score ?? Math.round(
                              ((sc.valuation_score || sc.valuation || 60) +
                               (sc.trend_score || sc.technical || 60) +
                               (sc.capital_score || sc.capitalFlow || 60) +
                               (sc.valuation_score || sc.valuation || 60) +
                               (sc.sentiment_score || sc.prosperity || 60)) / 5
                            )}
                          </span>
                        </td>
                        <td className="p-2.5 text-right text-cyan-700 font-bold">{sc.trend_score ?? sc.technical ?? '-'}</td>
                        <td className="p-2.5 text-right text-rose-700 font-bold">{sc.capital_score ?? sc.capitalFlow ?? '-'}</td>
                        <td className="p-2.5 text-right text-amber-700 font-bold">{sc.valuation_score ?? sc.valuation ?? '-'}</td>
                        <td className="p-2.5 text-center" onClick={(e) => e.stopPropagation()}>
                          <button
                            onClick={() => onSelectStock(item.code)}
                            className="px-2.5 py-1 bg-cyan-600 hover:bg-cyan-750 text-white rounded text-[10px] font-semibold transition cursor-pointer"
                          >
                            查看
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          ) : !screenerLoading && (
            <p className="text-xs text-slate-500 text-center py-4">
              当前无符合条件的股票，请降低评分阈值再试
            </p>
          )}
        </div>
      )}
       {/* 搜索与过滤条 */}
      <div className="flex flex-col sm:flex-row gap-3 mb-4">
        {/* 关键字搜索 */}
        <div className="relative flex-1">
          <Search className="absolute left-3 top-3 w-4 h-4 text-slate-400" />
          <input
            type="text"
            placeholder="输入代码或名称检索全市场 5000+ A股 (如：600519、比亚迪)..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-10 pr-24 py-2.5 bg-white border border-slate-205 text-slate-800 text-sm font-semibold rounded-lg focus:outline-none focus:ring-1 focus:ring-red-500 focus:border-red-500 transition font-sans shadow-xs"
          />
          {searchLoading && (
            <div className="absolute right-3 top-3 text-xs text-red-500 font-bold animate-pulse flex items-center gap-1">
              <RefreshCw className="w-3 h-3 animate-spin" />
              检索中...
            </div>
          )}
          {!searchLoading && searchTerm && (
            <div className="absolute right-3 top-3 text-[10px] text-emerald-600 bg-emerald-50 px-1.5 py-0.5 rounded border border-emerald-250 font-bold select-none">
              全市场已匹配
            </div>
          )}
        </div>

        {/* 板块筛检 */}
        <div className="flex gap-1.5 overflow-x-auto py-1 scrollbar-thin">
          {sectorsList.map((sec) => (
            <button
              key={sec}
              onClick={() => setSelectedSector(sec)}
              className={`px-3 py-1.5 bg-slate-100 rounded-lg text-xs font-bold whitespace-nowrap transition cursor-pointer ${
                selectedSector === sec
                  ? 'border border-red-500 text-red-600 bg-red-50 font-semibold'
                  : 'border border-slate-200 text-slate-600 hover:text-red-650 hover:bg-slate-200'
              }`}
            >
              {sec === 'ALL' ? '全板块' : sec}
            </button>
          ))}
        </div>
      </div>

      {/* 行情表格 */}
      <div className="overflow-x-auto max-h-[380px] overflow-y-auto border border-slate-200 rounded-xl bg-white shadow-xs">
        <table className="w-full text-left text-xs">
          <thead className="bg-slate-50 text-slate-600 font-bold uppercase tracking-wider sticky top-0 border-b border-slate-205 select-none text-[11px] md:text-xs">
            <tr>
              <th className="p-3 cursor-pointer hover:bg-slate-100 transition" onClick={() => toggleSort('name')}>
                名称/代码 {renderSortArrow('name')}
              </th>
              <th className="p-3 text-right cursor-pointer hover:bg-slate-100 transition" onClick={() => toggleSort('price')}>
                最新价 {renderSortArrow('price')}
              </th>
              <th className="p-3 text-right font-semibold cursor-pointer hover:bg-slate-100 transition" onClick={() => toggleSort('changePct')}>
                涨跌幅 {renderSortArrow('changePct')}
              </th>
              <th className="p-3">行业</th>
              <th className="p-3 text-right cursor-pointer hover:bg-slate-100 transition" onClick={() => toggleSort('pe')}>
                市盈率(PE) {renderSortArrow('pe')}
              </th>
              <th className="p-3 text-right cursor-pointer hover:bg-slate-100 transition" onClick={() => toggleSort('roe')}>
                ROE% {renderSortArrow('roe')}
              </th>
              <th className="p-3 text-center">决策诊断</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-150 font-mono text-xs md:text-sm">
            {sortedStocks.map((st) => {
              const actsSelected = st.code === selectedStockCode;
              const isUp = st.changePct >= 0;
              const tickState = flashes[st.code];

              // Add tick flashing effect background classes
              const rowFlashClass = 
                tickState === 'up' 
                  ? 'bg-red-100/50' 
                  : tickState === 'down' 
                  ? 'bg-emerald-100/50' 
                  : actsSelected
                  ? 'bg-red-50/70 border-l-2 border-l-red-500 font-bold'
                  : 'hover:bg-slate-50';

              return (
                <tr
                  key={st.code}
                  onClick={() => onSelectStock(st.code)}
                  className={`transition-colors duration-300 cursor-pointer ${rowFlashClass}`}
                >
                  {/* 代码/名称 */}
                  <td className="p-3">
                    <div className="font-sans font-black text-slate-900 text-xs md:text-sm flex items-center gap-1.5">
                      {st.name}
                      {st.isLeader && (
                        <span className="bg-red-100 text-red-655 text-[10px] px-1 py-0.5 rounded border border-red-200 font-extrabold shadow-3xs">
                          龙头{st.consecutiveBoards > 0 ? ` ${st.consecutiveBoards}B` : ''}
                        </span>
                      )}
                    </div>
                    <div className="text-slate-500 text-[10px] mt-0.5 font-bold">{st.code}</div>
                  </td>
                  
                  {/* 现价 with flash animation classes */}
                  <td className={`p-3 text-right font-bold transition-all duration-300 text-xs md:text-sm ${
                    tickState === 'up' 
                      ? 'text-red-700 scale-102 bg-red-100' 
                      : tickState === 'down' 
                      ? 'text-emerald-700 scale-102 bg-emerald-100' 
                      : isUp 
                      ? 'text-red-600' 
                      : 'text-emerald-600'
                  }`}>
                    {st.price.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </td>
                  
                  {/* Pct Change */}
                  <td className="p-3 text-right">
                    <span
                      className={`inline-block px-2 py-1 rounded text-right font-black text-xs ${
                        isUp ? 'bg-red-100 text-red-655 border border-red-200' : 'bg-emerald-100 text-emerald-700 border border-emerald-200'
                      }`}
                    >
                      {isUp ? '+' : ''}
                      {st.changePct.toFixed(2)}%
                    </span>
                  </td>

                  {/* 行业 */}
                  <td className="p-3 text-slate-800 font-sans font-bold text-[11px] md:text-xs">{st.sector}</td>

                  {/* PE */}
                  <td className="p-3 text-right text-slate-800 font-bold">{st.pe.toFixed(1)}</td>

                  {/* ROE */}
                  <td className="p-3 text-right text-slate-800 font-bold">{st.roe.toFixed(1)}%</td>

                  {/* 评分 & 选入 */}
                  <td className="p-3 text-center">
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        onAddStockToPool(st);
                      }}
                      className="px-2.5 py-1.5 bg-red-50 hover:bg-red-100 text-red-655 font-sans font-bold rounded-lg border border-red-200 transition cursor-pointer text-xs"
                    >
                      加入自选池
                    </button>
                  </td>
                </tr>
              );
            })}
            
            {sortedStocks.length === 0 && (
              <tr>
                <td colSpan={7} className="p-8 text-center text-slate-500 font-sans">
                  无符合筛选条件的股票，请尝试重新输入
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
