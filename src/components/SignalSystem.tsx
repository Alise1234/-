import React, { useState, useEffect } from 'react';
import { StockInfo } from '../types';
import { API_BASE } from '../services/api';
import { Activity, ArrowUpRight, ArrowDownRight, Compass, ShieldCheck } from 'lucide-react';

interface SignalSystemProps { selectedStock?: StockInfo; }

interface RealIndicator {
  macd_dif?: number; macd_dea?: number; macd_hist?: number;
  kdj_k?: number; kdj_d?: number; kdj_j?: number;
  rsi6?: number; rsi12?: number; rsi24?: number;
  atr14?: number; ma5?: number; ma10?: number; ma20?: number; ma60?: number;
  boll_upper?: number; boll_mid?: number; boll_lower?: number;
}

export default function SignalSystem({ selectedStock }: SignalSystemProps) {
  const code = selectedStock?.code ?? '';
  const signal = selectedStock?.signal ?? 'HOLD';
  const signalReason = selectedStock?.signalReason ?? '暂无信号数据';

  const [realIndicators, setRealIndicators] = useState<RealIndicator | null>(null);
  const [apiSource, setApiSource] = useState<string>('');
  const [loading, setLoading] = useState<boolean>(true);
  const [fetchError, setFetchError] = useState<boolean>(false);

  useEffect(() => {
    if (!code) return;
    setLoading(true);
    setFetchError(false);
    setRealIndicators(null);
    fetch(`${API_BASE}/api/analysis/indicators/${code}`)
      .then((r) => r.json())
      .then((d) => {
        if (d.success && d.data) {
          setRealIndicators(d.data);
          setApiSource(d.source || 'api');
        } else {
          setFetchError(true);
        }
      })
      .catch(() => {
        setFetchError(true);
      })
      .finally(() => setLoading(false));
  }, [code]);

  const difVal = realIndicators?.macd_dif != null ? parseFloat(realIndicators.macd_dif.toFixed(2)) : null;
  const deaVal = realIndicators?.macd_dea != null ? parseFloat(realIndicators.macd_dea.toFixed(2)) : null;
  const macdHist = realIndicators?.macd_hist != null ? parseFloat(realIndicators.macd_hist.toFixed(2)) : null;
  const kValue = realIndicators?.kdj_k != null ? Math.round(realIndicators.kdj_k) : null;
  const dValue = realIndicators?.kdj_d != null ? Math.round(realIndicators.kdj_d) : null;
  const jValue = realIndicators?.kdj_j != null ? Math.round(realIndicators.kdj_j) : null;
  const rsiValue = realIndicators?.rsi12 != null ? Math.round(realIndicators.rsi12) : null;
  const atrVal = realIndicators?.atr14 != null ? parseFloat(realIndicators.atr14.toFixed(2)) : null;

  const maStickiness = (realIndicators?.ma5 != null && realIndicators?.ma20 != null)
    ? parseFloat((Math.abs(realIndicators.ma5 - realIndicators.ma20) / (realIndicators.ma20 || 1) * 100).toFixed(1))
    : null;

  const rsiColor = rsiValue != null ? (rsiValue > 75 ? 'text-red-650' : rsiValue < 35 ? 'text-emerald-650' : 'text-slate-800') : 'text-slate-400';
  const rsiStatus = rsiValue != null ? (rsiValue > 75 ? '超买域' : rsiValue < 35 ? '超卖域' : '常态盘整') : '---';

  if (!selectedStock) {
    return (
      <div className="bg-white border border-slate-200 shadow-sm rounded-xl p-5 hover:border-slate-350 hover:shadow-md transition">
        <h2 className="text-lg font-bold text-slate-850 flex items-center gap-2 mb-4">
          <Activity className="w-5 h-5 text-red-500 animate-pulse" />
          多因子智能信号系统
        </h2>
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <p className="text-sm text-slate-500 font-semibold">行情数据加载中，请稍候...</p>
          <p className="text-xs text-slate-400 mt-2">请从「数据行情中心」或「特色股票池」选择股票后查看信号</p>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white border border-slate-200 shadow-sm rounded-xl p-5 hover:border-slate-350 hover:shadow-md transition" id="signal-system-module">
      <div className="flex justify-between items-start mb-4">
        <div>
          <h2 className="text-lg font-bold text-slate-850 flex items-center gap-2">
            <Activity className="w-5 h-5 text-red-500 animate-pulse" />
            多因子智能信号系统
            {apiSource && (
              <span className="text-[10px] font-bold text-emerald-600 bg-emerald-50 px-1.5 py-0.5 rounded border border-emerald-200">
                {apiSource === 'db' ? '📡 DB缓存' : '⚡ 实时计算'}
              </span>
            )}
          </h2>
          <p className="text-xs text-slate-500 mt-0.5">日线级别技术指标共振与主力意图推演</p>
        </div>
        <div className={`px-3 py-1.5 rounded-lg text-xs font-bold border flex items-center gap-1.5 ${signal === 'BUY' ? 'bg-red-50 text-red-600 border-red-200 shadow-3xs' : signal === 'SELL' ? 'bg-emerald-50 text-emerald-600 border-emerald-200' : 'bg-slate-50 text-slate-600 border-slate-205'}`}>
          {signal === 'BUY' && <ArrowUpRight className="w-4 h-4 text-red-500" />}
          {signal === 'SELL' && <ArrowDownRight className="w-4 h-4 text-emerald-500" />}
          建议：{signal === 'BUY' ? '买入评级' : signal === 'SELL' ? '卖出评级' : '持股观望'}
        </div>
      </div>

      <div className="bg-slate-50 rounded-lg p-3.5 border border-slate-200 mb-5 shadow-3xs">
        <div className="text-xs text-slate-700 font-bold mb-1 flex items-center gap-1"><ShieldCheck className="w-3.5 h-3.5 text-red-500" />系统决策论证:</div>
        <p className="text-xs text-slate-700 leading-relaxed font-sans font-medium">{signalReason}</p>
      </div>

      {fetchError && (
        <div className="text-center py-8 text-slate-500 bg-red-50/50 rounded-lg border border-red-105 my-4">
          <p className="text-sm font-bold text-red-650">后端信号获取失败</p>
          <p className="text-xs mt-1 text-slate-500">请检查 Python 定时任务是否已执行及接口可达性</p>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* MACD */}
        <div className="bg-slate-50 rounded-lg p-3 border border-slate-200 shadow-3xs flex flex-col justify-between">
          <div>
            <div className="flex justify-between items-center mb-2">
              <span className="text-xs font-bold text-slate-750">MACD 平滑异同移动平均</span>
              <span className="text-[10px] font-mono text-slate-400">12, 26, 9</span>
            </div>
            <div className="flex items-center gap-4 text-xs font-mono mt-1">
              <div><span className="text-slate-400">DIF:</span> <span className={difVal != null ? (difVal >= 0 ? 'text-red-600' : 'text-emerald-600') : 'text-slate-400'}>{difVal?.toFixed(4) ?? '---'}</span></div>
              <div><span className="text-slate-400">DEA:</span> <span className={deaVal != null ? (deaVal >= 0 ? 'text-red-500' : 'text-emerald-500') : 'text-slate-400'}>{deaVal?.toFixed(4) ?? '---'}</span></div>
              <div><span className="text-slate-400">柱状:</span> <span className={macdHist != null ? (macdHist >= 0 ? 'text-red-600' : 'text-emerald-600') : 'text-slate-400'}>{macdHist?.toFixed(4) ?? '---'}</span></div>
            </div>
          </div>
          <div className="h-8 flex items-end gap-0.5 mt-3 border-b border-slate-200">
            {macdHist != null ? Array.from({ length: 18 }).map((_, idx) => {
              const hValue = Math.min(24, Math.abs(macdHist) * 12 + (idx % 3));
              return (
                <div key={idx} className={`flex-1 rounded-t-sm transition-all duration-300 ${macdHist >= 0 ? 'bg-red-500/60' : 'bg-emerald-500/60'}`} style={{ height: `${Math.max(2, hValue)}px` }}></div>
              );
            }) : <span className="text-[10px] text-slate-400 w-full text-center">等待后端精算数据...</span>}
          </div>
          <span className="text-[10px] text-slate-500 mt-2 font-medium">{macdHist != null ? (macdHist > 0 ? '✓ 主力红柱扩张，强势上行通道' : '× 绿柱延展，短线承压探底') : ''}</span>
        </div>

        {/* KDJ */}
        <div className="bg-slate-50 rounded-lg p-3 border border-slate-200 shadow-3xs flex flex-col justify-between">
          <div>
            <div className="flex justify-between items-center mb-2">
              <span className="text-xs font-bold text-slate-750">KDJ 随机步长摆动指数</span>
              <span className="text-[10px] font-mono text-slate-400">9, 3, 3</span>
            </div>
            <div className="flex flex-col gap-1.5 mt-2">
              <div className="flex justify-between text-xs font-mono"><span className="text-slate-400">K 值 (快速):</span><span className="text-cyan-600 font-bold">{kValue ?? '---'}</span></div>
              <div className="flex justify-between text-xs font-mono"><span className="text-slate-400">D 值 (慢速):</span><span className="text-amber-605 font-bold">{dValue ?? '---'}</span></div>
              <div className="flex justify-between text-xs font-mono"><span className="text-slate-400">J 值 (方向):</span><span className="text-rose-600 font-bold">{jValue ?? '---'}</span></div>
            </div>
          </div>
          <span className="text-[10px] text-slate-500 mt-2 font-medium">{kValue != null && jValue != null ? (jValue > kValue ? '✓ 金叉买入区，势能向上加速' : '× 势能死叉向下，警惕高位分歧') : ''}</span>
        </div>

        {/* RSI + ATR */}
        <div className="bg-slate-50 rounded-lg p-3 border border-slate-200 shadow-3xs flex flex-col justify-between">
          <div>
            <div className="flex justify-between items-center mb-2">
              <span className="text-xs font-bold text-slate-755">RSI 强弱平衡测度量</span>
              <span className="text-[10px] font-mono text-slate-400">6, 12, 24</span>
            </div>
            <div className="text-center py-1 mt-1">
              <span className={`text-xl font-black font-mono ${rsiColor}`}>{rsiValue ?? '---'}</span>
              <span className="text-[10px] text-slate-500 font-semibold ml-1.5">({rsiStatus})</span>
            </div>
            <div className="w-full bg-slate-200 h-1 mt-3.5 rounded-full relative">
              {rsiValue != null && <div className="absolute top-[-3px] w-2.5 h-2.5 rounded-full bg-red-600 border border-slate-100" style={{ left: `${Math.min(95, Math.max(5, rsiValue))}%` }}></div>}
              <div className="absolute left-[30%] w-0.5 h-1.5 bg-slate-350"></div>
              <div className="absolute left-[70%] w-0.5 h-1.5 bg-slate-350"></div>
            </div>
            <div className="grid grid-cols-2 gap-2 mt-3 pt-2 border-t border-slate-200/80">
              <div className="text-center"><span className="text-[9px] text-slate-550 block">均线粘合度</span><span className="text-[11px] font-mono font-black text-amber-600">{maStickiness != null ? `${maStickiness}%` : '---'}</span></div>
              <div className="text-center"><span className="text-[9px] text-slate-550 block">ATR(14)波幅</span><span className="text-[11px] font-mono font-black text-cyan-600">{atrVal ?? '---'}</span></div>
            </div>
          </div>
          <span className="text-[10px] text-slate-500 mt-2 font-medium">安全设定：20(超跌下边界) 至 80(超买警戒线)</span>
        </div>
      </div>
    </div>
  );
}
