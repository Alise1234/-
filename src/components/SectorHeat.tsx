import React, { useState, useEffect, useMemo } from 'react';
import { SectorHeatInfo } from '../types';
import {
  BarChart2, TrendingUp, Flame, DollarSign, Activity,
  ChevronDown, ChevronUp, RefreshCw, Zap, ArrowUp, ArrowDown, Minus,
  Eye, EyeOff
} from 'lucide-react';

const STRENGTH_COLORS: Record<string, string> = {
  '极强': 'bg-red-50 text-red-700 border-red-200',
  '强势': 'bg-orange-50 text-orange-700 border-orange-200',
  '中性': 'bg-slate-100 text-slate-600 border-slate-200',
  '弱势': 'bg-emerald-50 text-emerald-700 border-emerald-200',
  '极弱': 'bg-blue-50 text-blue-700 border-blue-200',
};

const STRENGTH_BG: Record<string, string> = {
  '极强': 'bg-red-500', '强势': 'bg-orange-500', '中性': 'bg-slate-400',
  '弱势': 'bg-emerald-400', '极弱': 'bg-blue-400',
};

type TabKey = 'rotation' | 'ranking' | 'alpha' | 'heatmap' | 'capital';

const TABS: { key: TabKey; label: string; icon: React.ReactNode }[] = [
  { key: 'rotation', label: '轮动评分', icon: <Zap className="w-4 h-4" /> },
  { key: 'ranking', label: '板块排名', icon: <BarChart2 className="w-4 h-4" /> },
  { key: 'alpha', label: 'Alpha分析', icon: <TrendingUp className="w-4 h-4" /> },
  { key: 'heatmap', label: '板块热力图', icon: <Flame className="w-4 h-4" /> },
  { key: 'capital', label: '资金流向', icon: <DollarSign className="w-4 h-4" /> },
];

// ============================================================
// 子模块 1: 行业轮动评分
// ============================================================
function RotationScore({ data, meta }: { data: SectorHeatInfo[]; meta: any }) {
  const top = data.slice(0, 10);
  const maxScore = 100;

  return (
    <div>
      <div className="flex items-center gap-3 mb-4">
        <span className="text-xs text-slate-500">大盘今日均幅</span>
        <span className={`text-sm font-black font-mono ${(meta?.marketAvgPct || 0) >= 0 ? 'text-red-500' : 'text-emerald-500'}`}>
          {(meta?.marketAvgPct || 0) >= 0 ? '+' : ''}{meta?.marketAvgPct?.toFixed(2) || '0.00'}%
        </span>
        <span className="text-xs text-slate-400">涨跌板块比 {meta?.upSectors || 0}/{meta?.downSectors || 0}</span>
      </div>
      <div className="space-y-2.5">
        {top.map((s) => {
          const barWidth = Math.round((s.momentumScore / maxScore) * 100);
          return (
            <div key={s.name} className="flex items-center gap-3">
              <div className="w-16 text-xs font-semibold text-slate-700 truncate" title={s.name}>{s.name}</div>
              <div className="flex-1 bg-slate-100 rounded-full h-2.5 overflow-hidden">
                <div
                  className={`h-full rounded-full transition-all duration-700 ${barWidth >= 70 ? 'bg-gradient-to-r from-red-500 to-orange-400' : barWidth >= 40 ? 'bg-gradient-to-r from-blue-400 to-slate-400' : 'bg-slate-300'}`}
                  style={{ width: `${barWidth}%` }}
                />
              </div>
              <div className="w-10 text-right">
                <span className={`text-xs font-black font-mono ${barWidth >= 70 ? 'text-red-600' : barWidth >= 40 ? 'text-slate-600' : 'text-slate-400'}`}>
                  {s.momentumScore.toFixed(1)}
                </span>
              </div>
              <div className={`px-1.5 py-0.5 rounded text-[10px] font-bold border ${STRENGTH_COLORS[s.strength]}`}>
                {s.strength}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ============================================================
// 子模块 2: 板块强度排名
// ============================================================
function SectorRanking({ data }: { data: SectorHeatInfo[] }) {
  const [showAll, setShowAll] = useState(false);
  const displayed = showAll ? data : data.slice(0, 15);

  return (
    <div>
      <div className="overflow-x-auto">
        <table className="w-full text-left text-[11px] font-mono">
          <thead>
            <tr className="bg-slate-50 text-slate-500 uppercase border-b border-slate-200">
              <th className="p-2 font-bold w-8">#</th>
              <th className="p-2 font-bold">行业</th>
              <th className="p-2 font-bold text-right">当日涨跌</th>
              <th className="p-2 font-bold text-right">近5日累计</th>
              <th className="p-2 font-bold text-right">Alpha</th>
              <th className="p-2 font-bold text-center">跑赢天数</th>
              <th className="p-2 font-bold text-right">评分</th>
              <th className="p-2 font-bold text-center">强度</th>
              <th className="p-2 font-bold text-center">资金</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {displayed.map((s) => {
              const isUp = s.changePct >= 0;
              return (
                <tr key={s.name} className="hover:bg-slate-50 transition">
                  <td className="p-2 text-slate-400 font-bold">{s.rank}</td>
                  <td className="p-2 font-semibold text-slate-800 font-sans">{s.name}</td>
                  <td className={`p-2 text-right font-black ${isUp ? 'text-red-600' : 'text-emerald-600'}`}>
                    {isUp ? '+' : ''}{s.changePct.toFixed(2)}%
                  </td>
                  <td className={`p-2 text-right font-semibold ${s.historicalChange >= 0 ? 'text-red-500' : 'text-emerald-500'}`}>
                    {s.historicalChange >= 0 ? '+' : ''}{s.historicalChange.toFixed(2)}%
                  </td>
                  <td className={`p-2 text-right font-bold ${s.alpha >= 0 ? 'text-red-600' : 'text-emerald-600'}`}>
                    {s.alpha >= 0 ? '+' : ''}{s.alpha.toFixed(2)}%
                  </td>
                  <td className="p-2 text-center">
                    <span className={`inline-block px-1.5 py-0.5 rounded text-[10px] font-bold ${s.beatCount >= 3 ? 'bg-red-100 text-red-700' : s.beatCount >= 1 ? 'bg-amber-100 text-amber-700' : 'bg-slate-100 text-slate-500'}`}>
                      {s.beatCount}/5天
                    </span>
                  </td>
                  <td className="p-2 text-right font-black text-slate-700">{s.momentumScore.toFixed(1)}</td>
                  <td className="p-2 text-center">
                    <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold border ${STRENGTH_COLORS[s.strength]}`}>
                      {s.strength}
                    </span>
                  </td>
                  <td className="p-2 text-center">
                    {s.capitalTrend === '流入' ? (
                      <span className="text-red-500 text-xs flex items-center gap-0.5 justify-center"><ArrowUp className="w-3 h-3" />流入</span>
                    ) : s.capitalTrend === '流出' ? (
                      <span className="text-emerald-500 text-xs flex items-center gap-0.5 justify-center"><ArrowDown className="w-3 h-3" />流出</span>
                    ) : (
                      <span className="text-slate-400 text-xs flex items-center gap-0.5 justify-center"><Minus className="w-3 h-3" />平稳</span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {data.length > 15 && (
        <button
          onClick={() => setShowAll(!showAll)}
          className="mt-3 w-full text-xs text-slate-500 hover:text-slate-700 py-1.5 border border-dashed border-slate-200 rounded-lg transition"
        >
          {showAll ? '收起更多' : `展开剩余 ${data.length - 15} 个行业`}
        </button>
      )}
    </div>
  );
}

// ============================================================
// 子模块 3: 行业Alpha分析
// ============================================================
function AlphaAnalysis({ data }: { data: SectorHeatInfo[] }) {
  const sorted = [...data].sort((a, b) => b.alpha - a.alpha);
  const maxAbs = Math.max(...sorted.map(s => Math.abs(s.alpha)), 1);

  return (
    <div>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div>
          <h4 className="text-xs font-bold text-slate-600 mb-3 uppercase tracking-wide">Alpha 超额收益排行</h4>
          <div className="space-y-1.5">
            {sorted.slice(0, 10).map((s) => {
              const isPos = s.alpha >= 0;
              const barW = Math.round((Math.abs(s.alpha) / maxAbs) * 100);
              return (
                <div key={s.name} className="flex items-center gap-2">
                  <div className="w-14 text-[10px] font-semibold text-slate-600 truncate font-sans">{s.name}</div>
                  <div className="flex-1 h-5 bg-slate-100 rounded relative overflow-hidden">
                    <div
                      className={`absolute top-0 h-full rounded transition-all duration-700 ${isPos ? 'bg-red-400/70 right-0' : 'bg-emerald-400/70 left-0'}`}
                      style={{ width: `${barW}%` }}
                    />
                    <span className={`absolute inset-y-0 flex items-center text-[9px] font-black font-mono ${isPos ? 'right-1.5 text-red-700' : 'left-1.5 text-emerald-700'}`}>
                      {isPos ? '+' : ''}{s.alpha.toFixed(2)}%
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
        <div>
          <h4 className="text-xs font-bold text-slate-600 mb-3 uppercase tracking-wide">Alpha vs 轮动评分散点</h4>
          <div className="relative bg-slate-50 rounded-xl p-4 h-[260px]">
            {data.map((s) => {
              const x = ((s.momentumScore - 0) / 100) * 80 + 10;
              const y = 90 - ((s.alpha + maxAbs) / (maxAbs * 2)) * 80;
              const isPos = s.alpha >= 0;
              return (
                <div
                  key={s.name}
                  className={`absolute text-[8px] font-bold px-1 py-0.5 rounded cursor-default ${isPos ? 'text-red-700' : 'text-emerald-700'} bg-white/80 border border-slate-200`}
                  style={{ left: `${x}%`, top: `${y}%`, transform: 'translate(-50%,-50%)' }}
                  title={s.name + ': 评分' + s.momentumScore.toFixed(0) + ' Alpha' + (isPos ? '+' : '') + s.alpha.toFixed(2) + '%'}
                >
                  {s.name.substring(0, 3)}
                </div>
              );
            })}
            <div className="absolute bottom-1 left-1/2 -translate-x-1/2 text-[9px] text-slate-400">轮动评分 →</div>
            <div className="absolute left-1 top-1/2 -translate-y-1/2 text-[9px] text-slate-400 -rotate-90 origin-left">Alpha →</div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ============================================================
// 子模块 4: 板块热力图
// ============================================================
function SectorHeatmap({ data }: { data: SectorHeatInfo[] }) {
  const [showAll, setShowAll] = useState(false);
  const sorted = useMemo(() => [...data].sort((a, b) => b.momentumScore - a.momentumScore), [data]);
  const display = showAll ? sorted : sorted.slice(0, 24);

  const heatColor = (score: number): string => {
    if (score >= 80) return 'bg-red-500 text-white shadow-lg shadow-red-200';
    if (score >= 65) return 'bg-orange-400 text-white shadow-md shadow-orange-200';
    if (score >= 50) return 'bg-amber-400 text-amber-900';
    if (score >= 35) return 'bg-yellow-100 text-yellow-800';
    if (score >= 20) return 'bg-slate-100 text-slate-600';
    return 'bg-blue-100 text-blue-600';
  };

  return (
    <div>
      <div className="grid grid-cols-4 sm:grid-cols-6 md:grid-cols-8 gap-1.5">
        {display.map((s) => (
          <div
            key={s.name}
            className={`rounded-lg p-2 flex flex-col items-center justify-center cursor-default transition hover:scale-105 ${heatColor(s.momentumScore)}`}
            title={`${s.name} 评分:${s.momentumScore.toFixed(1)} 涨跌:${s.changePct >= 0 ? '+' : ''}${s.changePct.toFixed(2)}%`}
          >
            <div className="text-[9px] font-bold leading-tight text-center truncate w-full">{s.name}</div>
            <div className="text-sm font-black font-mono mt-0.5">{s.momentumScore.toFixed(0)}</div>
            <div className={`text-[9px] font-mono ${s.changePct >= 0 ? 'text-red-200' : 'text-emerald-200'}`}>
              {s.changePct >= 0 ? '+' : ''}{s.changePct.toFixed(1)}%
            </div>
          </div>
        ))}
      </div>
      {sorted.length > 24 && (
        <button
          onClick={() => setShowAll(!showAll)}
          className="mt-3 w-full text-xs text-slate-500 hover:text-slate-700 py-1.5 border border-dashed border-slate-200 rounded-lg transition"
        >
          {showAll ? '收起' : `展开全部 ${sorted.length} 个行业`}
        </button>
      )}
      <div className="mt-3 flex items-center gap-4 justify-center text-[10px] text-slate-500">
        <span className="flex items-center gap-1"><span className="w-3 h-3 rounded bg-red-500 inline-block"></span>极强</span>
        <span className="flex items-center gap-1"><span className="w-3 h-3 rounded bg-orange-400 inline-block"></span>强势</span>
        <span className="flex items-center gap-1"><span className="w-3 h-3 rounded bg-amber-400 inline-block"></span>中性</span>
        <span className="flex items-center gap-1"><span className="w-3 h-3 rounded bg-yellow-100 inline-block border border-yellow-200"></span>偏弱</span>
        <span className="flex items-center gap-1"><span className="w-3 h-3 rounded bg-blue-100 inline-block"></span>极弱</span>
      </div>
    </div>
  );
}

// ============================================================
// 子模块 5: 行业资金流向
// ============================================================
function CapitalFlow({ data }: { data: SectorHeatInfo[] }) {
  const sorted = useMemo(() => [...data].sort((a, b) => b.netInflow - a.netInflow), [data]);
  const maxAbs = Math.max(...sorted.map(s => Math.abs(s.netInflow)), 1);
  const inflow = sorted.filter(s => s.netInflow > 0).sort((a, b) => b.netInflow - a.netInflow);
  const outflow = sorted.filter(s => s.netInflow < 0).sort((a, b) => a.netInflow - b.netInflow);

  const totalInflow = inflow.reduce((s, x) => s + x.netInflow, 0);
  const totalOutflow = Math.abs(outflow.reduce((s, x) => s + x.netInflow, 0));

  const Bar = ({ s }: { s: SectorHeatInfo }) => {
    const isPos = s.netInflow >= 0;
    const width = Math.round((Math.abs(s.netInflow) / maxAbs) * 100);
    return (
      <div className="flex items-center gap-2 mb-1.5">
        <div className="w-14 text-[10px] font-semibold text-slate-600 truncate font-sans">{s.name}</div>
        <div className="flex-1 h-5 bg-slate-100 rounded overflow-hidden relative">
          <div
            className={`absolute top-0 h-full rounded transition-all duration-700 ${isPos ? 'bg-red-400' : 'bg-emerald-400'}`}
            style={{ width: `${width}%`, ...(isPos ? { right: 0 } : { left: 0 }) }}
          />
          <span className={`absolute inset-y-0 flex items-center text-[9px] font-black font-mono ${isPos ? 'right-1 text-red-700' : 'left-1 text-emerald-700'}`}>
            {isPos ? '+' : ''}{s.netInflow.toFixed(1)}亿
          </span>
        </div>
      </div>
    );
  };

  return (
    <div>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div>
          <div className="flex items-center justify-between mb-3">
            <h4 className="text-xs font-bold text-red-600 uppercase tracking-wide flex items-center gap-1">
              <ArrowUp className="w-3.5 h-3.5" /> 资金流入
            </h4>
            <span className="text-sm font-black text-red-600 font-mono">+{totalInflow.toFixed(1)}亿</span>
          </div>
          {inflow.slice(0, 10).map(s => <Bar key={s.name} s={s} />)}
        </div>
        <div>
          <div className="flex items-center justify-between mb-3">
            <h4 className="text-xs font-bold text-emerald-600 uppercase tracking-wide flex items-center gap-1">
              <ArrowDown className="w-3.5 h-3.5" /> 资金流出
            </h4>
            <span className="text-sm font-black text-emerald-600 font-mono">-{totalOutflow.toFixed(1)}亿</span>
          </div>
          {outflow.slice(0, 10).map(s => <Bar key={s.name} s={s} />)}
        </div>
      </div>
    </div>
  );
}

// ============================================================
// 主组件
// ============================================================
export default function SectorHeat() {
  const [sectors, setSectors] = useState<SectorHeatInfo[]>([]);
  const [meta, setMeta] = useState<any>({});
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<TabKey>('rotation');
  const [lastUpdate, setLastUpdate] = useState<Date | null>(null);

  const fetchSectors = async () => {
    try {
      const res = await fetch('/api/market/sectors');
      const d = await res.json();
      if (d.success) {
        setSectors(d.data || []);
        setMeta(d.meta || {});
        setLastUpdate(new Date());
      }
    } catch { /* ignore */ } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchSectors(); }, []);
  useEffect(() => {
    const id = setInterval(fetchSectors, 60_000);
    return () => clearInterval(id);
  }, []);

  const TAB_CONTENT: Record<TabKey, React.ReactNode> = {
    rotation: <RotationScore data={sectors} meta={meta} />,
    ranking: <SectorRanking data={sectors} />,
    alpha: <AlphaAnalysis data={sectors} />,
    heatmap: <SectorHeatmap data={sectors} />,
    capital: <CapitalFlow data={sectors} />,
  };

  return (
    <div className="bg-white border border-slate-200 shadow-sm rounded-xl p-5 hover:border-slate-300 hover:shadow-md transition" id="sector-heat-module">
      {/* 标题栏 */}
      <div className="flex justify-between items-center mb-4">
        <div>
          <h2 className="text-lg font-bold text-slate-850 flex items-center gap-2">
            <Activity className="w-5 h-5 text-blue-500" />
            行业分析
          </h2>
          <p className="text-xs text-slate-500 mt-0.5">
            {lastUpdate ? `更新于 ${lastUpdate.toLocaleTimeString()} · ${meta?.upSectors || 0} 涨 / ${meta?.downSectors || 0} 跌 · ${meta?.totalSectors || 0} 个行业` : '加载中...'}
          </p>
        </div>
        <button
          onClick={fetchSectors}
          className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-400 hover:text-slate-600 transition"
          title="刷新"
        >
          <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
        </button>
      </div>

      {/* Tab 切换 */}
      <div className="flex gap-1 mb-4 overflow-x-auto">
        {TABS.map(tab => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap transition ${
              activeTab === tab.key
                ? 'bg-blue-600 text-white shadow-sm'
                : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
            }`}
          >
            {tab.icon}
            {tab.label}
          </button>
        ))}
      </div>

      {/* 内容区 */}
      {loading ? (
        <div className="flex items-center justify-center h-48">
          <RefreshCw className="w-6 h-6 text-slate-300 animate-spin" />
        </div>
      ) : sectors.length === 0 ? (
        <div className="flex flex-col items-center justify-center h-48 text-slate-400">
          <Activity className="w-10 h-10 mb-2 opacity-30" />
          <p className="text-sm">暂无行业数据</p>
          <p className="text-xs mt-1">请等待行情数据同步</p>
        </div>
      ) : (
        <div className="animate-in fade-in duration-300">
          {TAB_CONTENT[activeTab]}
        </div>
      )}
    </div>
  );
}
