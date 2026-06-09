import React, { useState, useEffect } from 'react';
import { StockInfo } from '../types';
import { API_BASE } from '../services/api';
import { Award, Layers, TrendingUp, Sparkles, Activity, Search, Filter, BrainCircuit, X, Loader2 } from 'lucide-react';

interface FiveDimRatingProps {
  selectedStock?: StockInfo;
  stocks?: StockInfo[];
  onSelectStockCode?: (code: string) => void;
}

interface RealScores {
  valuation: number; earningsQuality: number; growth: number;
  trend: number; momentum: number; health: number; consensus: number; risk: number;
}

export default function FiveDimRating({ selectedStock, stocks = [], onSelectStockCode }: FiveDimRatingProps) {
  if (!selectedStock) {
    return (
      <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-sm">
        <h2 className="text-lg font-bold text-slate-850 flex items-center gap-2 mb-4">
          <Award className="w-5 h-5 text-red-500" />
          五维评分诊股
        </h2>
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <p className="text-sm text-slate-500 font-semibold">行情数据加载中，请稍候...</p>
          <p className="text-xs text-slate-400 mt-2">请从「数据行情中心」或「特色股票池」选择股票后查看五维评分</p>
        </div>
      </div>
    );
  }

  const { scores, name, code } = selectedStock;
  const [realScores, setRealScores] = useState<RealScores | null>(null);
  const [scoresLoading, setScoresLoading] = useState<boolean>(true);
  const [scoresError, setScoresError] = useState<boolean>(false);

  const [searchQuery, setSearchQuery] = useState<string>('');
  const [showTable, setShowTable] = useState<boolean>(false);

  // AI 深度决策状态
  const [aiDeciding, setAiDeciding] = useState<boolean>(false);
  const [aiDecision, setAiDecision] = useState<any>(null);
  const [showAiPanel, setShowAiPanel] = useState<boolean>(false);

  // 强制拉取后端真实五维评分
  useEffect(() => {
    setScoresLoading(true);
    setScoresError(false);
    fetch(`${API_BASE}/api/analysis/scores/${code}`)
      .then((r) => r.json())
      .then((d) => {
        if (d.success && d.data) {
          const s = d.data;
          setRealScores({
            valuation: s.valuation_score ?? 0,
            earningsQuality: s.earnings_quality_score ?? 0,
            growth: s.growth_score ?? 0,
            trend: s.trend_score ?? 0,
            momentum: s.momentum_score ?? 0,
            health: s.health_score ?? 0,
            consensus: s.consensus_score ?? 0,
            risk: s.risk_score ?? 0,
          });
        } else { setScoresError(true); }
      })
      .catch(() => { setScoresError(true); })
      .finally(() => setScoresLoading(false));
  }, [code]);

  // 仅使用后端真实数据
  const displayScores = realScores || { valuation: 0, earningsQuality: 0, growth: 0, trend: 0, momentum: 0, health: 0, consensus: 0, risk: 0 };

  const handleAiDecide = async () => {
    setAiDeciding(true);
    setShowAiPanel(true);
    try {
      const res = await fetch(`${API_BASE}/api/ai/decide/${code}?model=deepseek-chat`);
      const data = await res.json();
      if (data.success) { setAiDecision(data); }
      else { setAiDecision({ error: true, action: 'N/A', reason: 'AI 决策服务未就绪' }); }
    } catch (_err) {
      setAiDecision({ error: true, action: 'N/A', reason: '后端不可达' });
    } finally { setAiDeciding(false); }
  };

  const dimensions = [
    { key: 'valuation', name: '估值水平', val: displayScores.valuation, max: 15, color: 'text-cyan-600', desc: '行业相对PE/PB+PEG，越低越安全' },
    { key: 'earningsQuality', name: '盈利质量', val: displayScores.earningsQuality, max: 20, color: 'text-amber-500', desc: 'ROE+经营现金流/利润+毛利率稳定性' },
    { key: 'growth', name: '成长性', val: displayScores.growth, max: 15, color: 'text-emerald-500', desc: '营收3年CAGR+净利增速+研发投入' },
    { key: 'trend', name: '技术趋势', val: displayScores.trend, max: 15, color: 'text-rose-500', desc: 'MA排列+MACD+RSI多空判断' },
    { key: 'momentum', name: '动量资金', val: displayScores.momentum, max: 10, color: 'text-orange-500', desc: '量比+换手率+量价配合' },
    { key: 'health', name: '财务健康', val: displayScores.health, max: 10, color: 'text-blue-500', desc: '负债率+流动比率+利息覆盖' },
    { key: 'consensus', name: '机构共识', val: displayScores.consensus, max: 10, color: 'text-purple-500', desc: '北向持仓+融资余额+资金趋势' },
    { key: 'risk', name: '风险控制', val: displayScores.risk, max: 5, color: 'text-slate-500', desc: '最大回撤+波动率' },
  ];

  const avgScore = realScores ? Math.round(dimensions.reduce((s, d) => s + d.val, 0)) : 0;

  const filteredStocks = searchQuery.trim()
    ? stocks.filter((s) => s.code.includes(searchQuery) || s.name.includes(searchQuery) || s.code.toLowerCase().includes(searchQuery.toLowerCase()))
    : stocks;

  return (
    <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-sm hover:shadow-md hover:border-slate-300 transition" id="five-dim-rating-module">
      <h2 className="text-lg font-bold text-slate-850 flex items-center gap-2 mb-1"><Award className="w-5 h-5 text-red-500" />七维量化诊断 V5.0</h2>
      <p className="text-xs text-slate-500 mb-5">
        当前选中：<strong className="text-red-500 font-bold">{name} ({code})</strong>
        {scoresLoading ? ' · 加载中...' : scoresError ? ' · 该股票暂无多因子历史量化评分，请在后端先执行调度跑批：python scheduler/daily_job.py --scores' : ` · ${avgScore}分综合评定`}
      </p>

      {/* 搜索与AI决策工具栏 */}
      <div className="mb-6 bg-slate-50 p-3 rounded-xl border border-slate-200">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
          <div className="flex items-center gap-2"><Search className="w-4 h-4 text-red-500" /><span className="text-xs font-semibold text-slate-650">两市多因子个股诊断联动选股检索</span></div>
          <div className="flex items-center gap-2">
            <button onClick={() => setShowTable(!showTable)} className="flex items-center gap-1.5 px-3 py-1.5 bg-red-650 hover:bg-red-600 text-white rounded-lg text-xs font-bold transition cursor-pointer select-none shadow-md shadow-red-500/10"><Filter className="w-3.5 h-3.5" />{showTable ? '关闭选股检索表' : '🔍 开启股票代码/名称诊断索引表'}</button>
            <button onClick={handleAiDecide} disabled={aiDeciding} className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition cursor-pointer select-none shadow-md ${aiDeciding ? 'bg-slate-250 text-slate-400 cursor-wait' : 'bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 text-white shadow-purple-500/10'}`}>
              {aiDeciding ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <BrainCircuit className="w-3.5 h-3.5" />}{aiDeciding ? 'AI 分析中...' : '🧠 AI 深度决策'}
            </button>
          </div>
        </div>

        {/* 选股检索表 */}
        {showTable && (
          <div className="mt-3 pt-3 border-t border-slate-200 space-y-3">
            <div className="relative">
              <input type="text" value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} placeholder="键入股票代码或拼音/名称进行智能搜索诊断，如：赛力斯 / 601127.SH..." className="w-full bg-white border border-slate-200 rounded px-3 py-2 text-xs text-slate-800 placeholder-slate-400 focus:outline-none focus:border-red-500 font-sans" />
              {searchQuery && <button onClick={() => setSearchQuery('')} className="absolute right-2 top-2 px-2 py-0.5 bg-slate-100 hover:bg-slate-200 text-slate-500 text-[10px] rounded">清除</button>}
            </div>
            <div className="overflow-x-auto max-h-60 overflow-y-auto border border-slate-200 rounded-lg bg-white">
              <table className="w-full text-left text-xs font-mono">
                <thead className="bg-slate-50 border-b border-slate-200 text-slate-500 text-[10px] uppercase tracking-wider sticky top-0">
                  <tr><th className="p-2.5">代码名称</th><th className="p-2.5 text-right">最新成交价</th><th className="p-2.5 text-right">今日涨跌幅</th><th className="p-2.5 text-right">估值/技术/均分</th><th className="p-2.5 text-center">操作</th></tr>
                </thead>
                <tbody className="divide-y divide-slate-150">
                  {filteredStocks.map((st) => {
                    const vs = st.scores?.valuation ?? 0; const ts = st.scores?.trend ?? 0;
                    const avg = Math.round(((st.scores?.valuation ?? 0) + (st.scores?.earningsQuality ?? 0) + (st.scores?.growth ?? 0) + (st.scores?.trend ?? 0) + (st.scores?.momentum ?? 0) + (st.scores?.health ?? 0) + (st.scores?.consensus ?? 0) + (st.scores?.risk ?? 0)));
                    const isSel = st.code === code;
                    return (
                      <tr key={st.code} className={`hover:bg-slate-50/60 transition cursor-pointer ${isSel ? 'bg-red-50/50' : ''}`} onClick={() => onSelectStockCode && onSelectStockCode(st.code)}>
                        <td className="p-2.5"><span className="font-sans font-bold text-slate-850 block">{st.name}</span><span className="text-[10px] text-slate-500">{st.code}</span></td>
                        <td className="p-2.5 text-right text-slate-755 font-bold">¥{st.price.toFixed(2)}</td>
                        <td className={`p-2.5 text-right font-bold ${st.changePct >= 0 ? 'text-red-500' : 'text-emerald-600'}`}>{st.changePct >= 0 ? '+' : ''}{st.changePct.toFixed(2)}%</td>
                        <td className="p-2.5 text-right text-[11px] text-slate-505"><span className="text-cyan-600">{vs}</span>/<span className="text-rose-600">{ts}</span>/<span className="text-red-550 font-bold">{avg}分</span></td>
                        <td className="p-2.5 text-center" onClick={(e) => e.stopPropagation()}><button onClick={() => onSelectStockCode && onSelectStockCode(st.code)} className={`px-3 py-1 rounded text-[10px] font-black transition cursor-pointer ${isSel ? 'bg-red-655 text-white border border-red-600' : 'bg-slate-50 hover:bg-slate-100 text-slate-550 hover:text-slate-800 border border-slate-200'}`}>{isSel ? '聚焦诊断中' : '开始诊股'}</button></td>
                      </tr>
                    );
                  })}
                  {filteredStocks.length === 0 && (<tr><td colSpan={5} className="p-4 text-center text-slate-400 font-sans">未检索到与"{searchQuery}"匹配的个股代码或拼音，请核对。</td></tr>)}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>

      {/* AI 决策面板 */}
      {showAiPanel && (
        <div className="mb-6 bg-purple-50/40 p-4 rounded-xl border border-purple-200">
          <div className="flex justify-between items-start mb-3">
            <h3 className="text-sm font-bold text-slate-805 flex items-center gap-2"><BrainCircuit className="w-4 h-4 text-purple-600" />AI 深度决策报告 <span className="text-[9px] font-normal text-slate-500">for {name} ({code})</span></h3>
            <button onClick={() => setShowAiPanel(false)} className="p-1 text-slate-450 hover:text-slate-650 rounded transition"><X className="w-4 h-4" /></button>
          </div>
          {aiDecision ? (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="bg-white p-3 rounded-lg border border-slate-200 text-center flex flex-col justify-center shadow-3xs">
                <span className="text-[9px] text-slate-400 block mb-1">综合操作评级</span>
                <span className={`text-sm font-black ${aiDecision.action === 'BUY' ? 'text-red-550' : aiDecision.action === 'SELL' ? 'text-emerald-600' : 'text-amber-550'}`}>
                  {aiDecision.action === 'BUY' ? '🟢 建议买入' : aiDecision.action === 'SELL' ? '🔴 建议卖出' : aiDecision.action === 'HOLD' ? '🟡 持股观望' : 'N/A'}
                </span>
                {aiDecision.confidence && <span className="text-[10px] text-slate-500 mt-1">置信度 {aiDecision.confidence}% · 建议仓位 {aiDecision.position_pct}%</span>}
              </div>
              <div className="bg-white p-3 rounded-lg border border-slate-200 md:col-span-2 shadow-3xs">
                <span className="text-[9px] text-slate-400 block mb-1">量化分析论证</span>
                <p className="text-xs text-slate-700 leading-relaxed font-semibold">{aiDecision.reason || aiDecision.error ? '无法获取AI决策' : '分析中...'}</p>
                {aiDecision.risk_note && <p className="text-[10px] text-amber-600 mt-2 leading-relaxed">⚠️ 风控提示：{aiDecision.risk_note}</p>}
              </div>
            </div>
          ) : <p className="text-xs text-slate-400 text-center py-3">{aiDeciding ? 'AI 分析中...' : ''}</p>}
        </div>
      )}

      {/* 八维评分总览 */}
      <div className="bg-white border border-slate-200 rounded-xl p-4 mb-4 text-center shadow-sm">
        <span className="text-[10px] text-slate-400 block">综合评分</span>
        <span className="text-3xl font-black font-mono text-red-600">{avgScore}</span>
        <span className="text-xs text-slate-400"> / 100</span>
        <div className="mt-2 grid grid-cols-4 gap-1 text-[10px] text-slate-500">
          <span>基本面 60%</span><span>市场行为 30%</span><span>机构共识 10%</span><span></span>
        </div>
      </div>

      {/* 维度进度条 */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {dimensions.map((dim) => (
          <div key={dim.key} className="bg-white border border-slate-200 rounded-lg p-3 shadow-sm hover:shadow-md transition">
            <div className="flex justify-between items-center mb-1.5">
              <span className="text-xs font-bold text-slate-700">{dim.name}</span>
              <span className="text-xs font-mono font-black text-red-600">{dim.val} <span className="text-[9px] font-normal text-slate-400">/ {dim.max}</span></span>
            </div>
            <div className="w-full bg-slate-100 h-2 rounded-full overflow-hidden">
              <div className="bg-red-500 h-full rounded-full transition-all duration-700"
                style={{ width: `${Math.min(100, dim.val / dim.max * 100)}%` }}></div>
            </div>
            <div className="text-[10px] text-slate-400 mt-1.5 leading-tight">{dim.desc}</div>
          </div>
        ))}
      </div>
    </div>
  );
}
