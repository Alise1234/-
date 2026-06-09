/**
 * 量化回测系统 V4.0 — 止损止盈真实生效 + 增强指标
 */
import React, { useState } from 'react';
import { API_BASE } from '../services/api';
import { StockInfo } from '../types';
import { Play, TrendingUp, AlertTriangle, BarChart2, Shield, Target, Activity } from 'lucide-react';
import { ResponsiveContainer, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, Area, AreaChart } from 'recharts';
import { motion } from 'motion/react';

interface BacktestSystemProps { selectedStockCode?: string; stocks?: StockInfo[]; }

const STRATEGIES = [
  { key: 'ma_cross',   label: '均线金叉 (MA5×MA20)', desc: '短期动量突破' },
  { key: 'macd',       label: 'MACD动能', desc: '趋势跟踪经典' },
  { key: 'score',      label: '五维综合评分', desc: '多因子驱动' },
  { key: 'boll_break', label: '布林突破', desc: '波动率突破' },
  { key: 'dual_ma',    label: '双均线趋势', desc: '中长期趋势跟踪' },
];

export default function BacktestSystem({ selectedStockCode, stocks = [] }: BacktestSystemProps) {
  const [code, setCode] = useState(selectedStockCode || '');
  const [strategy, setStrategy] = useState('ma_cross');
  const [capital, setCapital] = useState(100000);
  const [stopLoss, setStopLoss] = useState(-5);
  const [takeProfit, setTakeProfit] = useState(15);
  const [position, setPosition] = useState(100);
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<any>(null);
  const [error, setError] = useState('');

  React.useEffect(() => { if (selectedStockCode) setCode(selectedStockCode); }, [selectedStockCode]);

  const handleRun = async () => {
    if (!code) { setError('请先选择回测标的'); return; }
    setRunning(true); setError(''); setResult(null);

    try {
      const params = new URLSearchParams({
        code, strategy,
        capital: String(capital),
        stop_loss: String(stopLoss),
        take_profit: String(takeProfit),
        position: String(position / 100),
      });
      const res = await fetch(`${API_BASE}/api/backtest/run?${params}`);
      const data = await res.json();
      if (data.success && data.metrics && !data.metrics.error) {
        setResult(data);
      } else {
        setError(data.error || data.metrics?.error || '回测失败');
      }
    } catch (e) {
      setError('后端不可达，请检查服务状态');
    } finally {
      setRunning(false);
    }
  };

  const m = result?.metrics || {};
  const equityCurve = result?.equity_curve || [];
  const benchCurve = result?.benchmark_curve || [];

  // 合并策略+基准曲线（按日期对齐，非索引对齐）
  const chartData = equityCurve.length > 0 ? equityCurve
    .filter((_: any, i: number) => i % Math.max(1, Math.floor(equityCurve.length / 50)) === 0 || i === equityCurve.length - 1)
    .map((pt: any) => {
      // 找到同日期最近的基准点
      const benchPt = benchCurve.length > 0
        ? benchCurve.reduce((best: any, b: any) => {
            const bDate = String(b.date || '').replace(/-/g, '');
            const pDate = String(pt.date || '').replace(/-/g, '');
            return Math.abs(parseInt(bDate) - parseInt(pDate)) < Math.abs(parseInt(best?.date?.replace(/-/g, '') || '99999999') - parseInt(pDate)) ? b : best;
          }, benchCurve[0])
        : null;
      return {
        date: pt.date?.slice(5) || 'N/A',
        strategy: round((pt.equity / capital - 1) * 100),
        benchmark: benchPt ? round((benchPt.value / capital - 1) * 100) : null,
      };
    }) : [];

  return (
    <div className="space-y-4">
      {/* 配置面板 */}
      <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-sm">
        <h2 className="text-lg font-bold text-slate-800 flex items-center gap-2 mb-4">
          <BarChart2 className="w-5 h-5 text-red-500" />量化策略回测 V4.0
        </h2>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {/* 标的 + 策略 */}
          <div className="space-y-3">
            <div>
              <label className="text-[10px] font-bold text-slate-500 block mb-1">回测标的</label>
              <select value={code} onChange={e => setCode(e.target.value)}
                className="w-full bg-slate-50 border border-slate-200 text-xs rounded-lg p-2 font-mono focus:outline-none focus:border-red-500">
                <option value="">-- 选择股票 --</option>
                {stocks.map(s => <option key={s.code} value={s.code}>{s.name} ({s.code})</option>)}
              </select>
            </div>
            <div>
              <label className="text-[10px] font-bold text-slate-500 block mb-1">交易策略</label>
              <select value={strategy} onChange={e => setStrategy(e.target.value)}
                className="w-full bg-slate-50 border border-slate-200 text-xs rounded-lg p-2 font-mono focus:outline-none focus:border-red-500">
                {STRATEGIES.map(s => <option key={s.key} value={s.key}>{s.label}</option>)}
              </select>
              <p className="text-[10px] text-slate-400 mt-1">{STRATEGIES.find(s => s.key === strategy)?.desc}</p>
            </div>
          </div>

          {/* 资金 + 仓位 */}
          <div className="space-y-3">
            <div>
              <label className="text-[10px] font-bold text-slate-500 block mb-1">初始资金 (元)</label>
              <input type="number" value={capital} onChange={e => setCapital(Number(e.target.value))}
                className="w-full bg-slate-50 border border-slate-200 text-xs rounded-lg p-2 font-mono focus:outline-none focus:border-red-500" />
            </div>
            <div>
              <label className="text-[10px] font-bold text-slate-500 block mb-1">仓位比例 (%)</label>
              <input type="range" min={10} max={100} step={10} value={position} onChange={e => setPosition(Number(e.target.value))}
                className="w-full accent-red-500" />
              <span className="text-xs font-mono text-slate-600">{position}%</span>
            </div>
          </div>

          {/* 风控参数 */}
          <div className="space-y-3">
            <div>
              <label className="text-[10px] font-bold text-red-600 flex items-center gap-1 mb-1"><Shield className="w-3 h-3" />止损线 (%)</label>
              <input type="number" value={stopLoss} onChange={e => setStopLoss(Number(e.target.value))}
                className="w-full bg-red-50 border border-red-200 text-xs rounded-lg p-2 font-mono text-red-700 focus:outline-none focus:border-red-500" />
            </div>
            <div>
              <label className="text-[10px] font-bold text-emerald-600 flex items-center gap-1 mb-1"><Target className="w-3 h-3" />止盈线 (%)</label>
              <input type="number" value={takeProfit} onChange={e => setTakeProfit(Number(e.target.value))}
                className="w-full bg-emerald-50 border border-emerald-200 text-xs rounded-lg p-2 font-mono text-emerald-700 focus:outline-none focus:border-emerald-500" />
            </div>
          </div>
        </div>

        <button onClick={handleRun} disabled={running}
          className={`mt-4 w-full py-2.5 rounded-lg text-sm font-bold transition flex items-center justify-center gap-2 cursor-pointer ${
            running ? 'bg-slate-200 text-slate-400' : 'bg-red-600 hover:bg-red-700 text-white shadow-lg'
          }`}>
          <Play className={`w-4 h-4 ${running ? 'animate-spin' : ''}`} />
          {running ? '回测引擎运行中...' : '启动策略回测'}
        </button>

        {error && <p className="text-xs text-red-600 font-semibold mt-2">{error}</p>}
      </div>

      {/* 回测结果 */}
      {result && (
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="space-y-4">
          {/* 核心指标 */}
          <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
            {[
              { l: '总收益率',  v: m.total_return_pct,  fmt: (v: number) => `${v >= 0 ? '+' : ''}${v}%`, c: 'text-red-600' },
              { l: '年化收益',  v: m.annual_return,     fmt: (v: number) => `${v}%`, c: 'text-red-600' },
              { l: '夏普比率',  v: m.sharpe_ratio,      fmt: (v: number) => v.toFixed(2), c: 'text-cyan-600' },
              { l: '最大回撤',  v: m.max_drawdown,      fmt: (v: number) => `${v}%`, c: 'text-orange-500' },
              { l: '卡尔玛比',  v: m.calmar_ratio,      fmt: (v: number) => v.toFixed(2), c: 'text-purple-600' },
              { l: '胜率',     v: m.win_rate,           fmt: (v: number) => `${v}%`, c: 'text-slate-700' },
              { l: '盈亏比',    v: m.profit_factor,      fmt: (v: number) => v.toFixed(2), c: 'text-slate-700' },
              { l: '交易次数',  v: m.total_trades,       fmt: (v: number) => String(v), c: 'text-slate-700' },
              { l: '止损触发',  v: m.stop_loss_count,    fmt: (v: number) => String(v), c: 'text-red-500' },
              { l: '止盈触发',  v: m.take_profit_count,  fmt: (v: number) => String(v), c: 'text-emerald-500' },
            ].map(({ l, v, fmt, c }, i) => (
              <div key={i} className="bg-white border border-slate-200 rounded-lg p-3 text-center shadow-sm">
                <span className="text-[10px] text-slate-500 block">{l}</span>
                <span className={`text-sm font-black font-mono ${c}`}>{v != null ? fmt(v) : '-'}</span>
              </div>
            ))}
          </div>

          {/* 权益曲线 */}
          {chartData.length > 0 && (
            <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm">
              <h3 className="text-xs font-bold text-slate-600 mb-3">策略权益曲线 vs 沪深300基准</h3>
              <ResponsiveContainer width="100%" height={300}>
                <AreaChart data={chartData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                  <defs>
                    <linearGradient id="stratGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#ef4444" stopOpacity={0.3} />
                      <stop offset="95%" stopColor="#ef4444" stopOpacity={0} />
                    </linearGradient>
                    <linearGradient id="benchGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#64748b" stopOpacity={0.15} />
                      <stop offset="95%" stopColor="#64748b" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                  <XAxis dataKey="date" stroke="#94a3b8" fontSize={9} tickLine={false} />
                  <YAxis stroke="#94a3b8" fontSize={9} tickLine={false} tickFormatter={v => `${v}%`} />
                  <Tooltip contentStyle={{ borderRadius: 8, border: '1px solid #e2e8f0', fontSize: 11 }}
                    formatter={(v: any, n: string) => n === 'strategy' ? [`${v}%`, '策略收益'] : [`${v}%`, '沪深300']} />
                  <Legend iconType="circle" iconSize={6} wrapperStyle={{ fontSize: 10 }} />
                  <Area name="strategy" type="monotone" dataKey="strategy" stroke="#ef4444" strokeWidth={2} fill="url(#stratGrad)" />
                  <Area name="benchmark" type="monotone" dataKey="benchmark" stroke="#64748b" strokeWidth={1.5} fill="url(#benchGrad)" />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          )}

          {/* 月度收益 + 交易记录 */}
          {m.monthly_returns?.length > 0 && (
            <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm">
              <h3 className="text-xs font-bold text-slate-600 mb-2">月度收益热力</h3>
              <div className="flex flex-wrap gap-1">
                {m.monthly_returns.map((mr: any) => (
                  <div key={mr.month}
                    className={`px-2 py-1 rounded text-[10px] font-mono font-bold ${
                      mr.return_pct > 0 ? 'bg-red-100 text-red-700' : 'bg-emerald-100 text-emerald-700'
                    }`}
                    title={`${mr.month}: ${mr.return_pct}%`}>
                    {mr.month.slice(5)}<br/>{mr.return_pct > 0 ? '+' : ''}{mr.return_pct}%
                  </div>
                ))}
              </div>
            </div>
          )}
        </motion.div>
      )}

      {!result && !running && (
        <div className="bg-white border border-slate-200 rounded-xl p-12 text-center">
          <Activity className="w-10 h-10 text-slate-300 mx-auto mb-3" />
          <p className="text-sm text-slate-500 font-semibold">选择股票和策略，点击「启动策略回测」</p>
          <p className="text-xs text-slate-400 mt-1">止损/止盈/仓位参数真实参与回测计算</p>
        </div>
      )}
    </div>
  );
}

function round(v: number): number { return parseFloat(v.toFixed(2)); }
