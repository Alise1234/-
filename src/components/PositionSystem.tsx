import React, { useState, useEffect, useRef } from 'react';
import { API_BASE } from '../services/api';
import { Target, Coins, Percent } from 'lucide-react';

interface PositionSystemProps {
  cash: number;
  selectedStockCode?: string;
  selectedStockPrice?: number;
}

export default function PositionSystem({ cash, selectedStockCode, selectedStockPrice }: PositionSystemProps) {
  const [winRate, setWinRate] = useState<number>(55);
  const [profitRatio, setProfitRatio] = useState<number>(2.2);
  const [stopLossDist, setStopLossDist] = useState<number>(5);
  const [accountRisk, setAccountRisk] = useState<number>(2);

  const [kellyPct, setKellyPct] = useState<number | null>(null);
  const [positionPct, setPositionPct] = useState<number | null>(null);
  const [suggestedShares, setSuggestedShares] = useState<number | null>(null);
  const [maxRiskAmount, setMaxRiskAmount] = useState<number | null>(null);
  const [apiLoading, setApiLoading] = useState<boolean>(false);
  const [apiOnline, setApiOnline] = useState<boolean | null>(null);

  const debounceRef = useRef<NodeJS.Timeout | null>(null);

  const fetchRisk = () => {
    if (!selectedStockCode || !selectedStockPrice) return;
    setApiLoading(true);

    Promise.allSettled([
      fetch(`${API_BASE}/api/risk/calc/kelly?win_rate=${winRate / 100}&profit_loss_ratio=${profitRatio}`)
        .then((r) => r.json())
        .then((d) => {
          if (d.success) {
            setKellyPct(d.kelly_half != null ? parseFloat((d.kelly_half * 100).toFixed(1)) : (d.kelly_full != null ? parseFloat((d.kelly_full * 100).toFixed(1)) : null));
            setApiOnline(true);
          }
        })
        .catch(() => setApiOnline(false)),
      fetch(`${API_BASE}/api/risk/calc/position-size`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          total_asset: cash, price: selectedStockPrice,
          win_rate: winRate / 100, profit_loss_ratio: profitRatio,
          stop_loss_pct: stopLossDist, account_risk_pct: accountRisk,
        }),
      })
        .then((r) => r.json())
        .then((d) => {
          if (d.success) {
            setPositionPct(d.position_pct != null ? parseFloat(d.position_pct.toFixed(1)) : null);
            setSuggestedShares(d.suggested_shares ?? null);
            setMaxRiskAmount(d.max_risk_amount ?? null);
            setApiOnline(true);
          }
        })
        .catch(() => setApiOnline(false)),
    ]).finally(() => setApiLoading(false));
  };

  // 参数变化自动防抖请求
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(fetchRisk, 500);
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, [selectedStockCode, selectedStockPrice, winRate, profitRatio, stopLossDist, accountRisk, cash]);

  const displayKelly = kellyPct;
  const displayPosition = positionPct;
  const recommendedSizing = (displayKelly != null && displayPosition != null)
    ? Math.round((displayKelly + displayPosition) / 2)
    : null;

  return (
    <div className="bg-white border border-slate-200 shadow-sm rounded-xl p-5 hover:border-slate-350 hover:shadow-md transition" id="position-system-module">
      <h2 className="text-lg font-bold text-slate-850 flex items-center gap-2 mb-1">
        <Coins className="w-5 h-5 text-yellow-500" />
        量化仓位风控决策系统
        {apiLoading && <span className="text-[10px] font-bold text-amber-500 animate-pulse ml-1">⏳ 计算中...</span>}
        {apiOnline === true && <span className="text-[10px] font-bold text-emerald-600 bg-emerald-50 px-1.5 py-0.5 rounded border border-emerald-250">📡 后端精算</span>}
        {apiOnline === false && <span className="text-[10px] font-bold text-red-500 ml-1">后端离线 — 无法计算</span>}
      </h2>
      <p className="text-xs text-slate-500 mb-5">运用经典的《凯利公式》与ATR波动限损，拒绝凭直觉决定成交仓位</p>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        <div className="lg:col-span-7 bg-slate-50 p-4 rounded-lg border border-slate-205 flex flex-col gap-4 shadow-3xs">
          <div className="text-xs text-slate-700 font-bold border-b border-slate-200 pb-2 flex items-center gap-1.5"><Percent className="w-4 h-4 text-red-505" />风控要素交互精算区间</div>

          <div>
            <div className="flex justify-between text-xs mb-1.5"><span className="text-slate-650 font-medium">历史统计胜率 (p):</span><span className="text-red-600 font-bold font-mono">{winRate}%</span></div>
            <input type="range" min="20" max="90" value={winRate} onChange={(e) => setWinRate(Number(e.target.value))} className="w-full h-1.5 rounded-lg appearance-none cursor-pointer bg-slate-200 accent-red-600" />
          </div>
          <div>
            <div className="flex justify-between text-xs mb-1.5"><span className="text-slate-650 font-medium">预期平均盈亏比 (b:1): </span><span className="text-red-600 font-bold font-mono">{profitRatio} 倍</span></div>
            <input type="range" min="1.0" max="5.0" step="0.1" value={profitRatio} onChange={(e) => setProfitRatio(Number(e.target.value))} className="w-full h-1.5 rounded-lg appearance-none cursor-pointer bg-slate-200 accent-red-600" />
          </div>
          <div>
            <div className="flex justify-between text-xs mb-1.5"><span className="text-slate-650 font-medium">单笔承受总资产损失系数:</span><span className="text-amber-600 font-bold font-mono">{accountRisk}%</span></div>
            <input type="range" min="0.5" max="5.0" step="0.5" value={accountRisk} onChange={(e) => setAccountRisk(Number(e.target.value))} className="w-full h-1.5 rounded-lg appearance-none cursor-pointer bg-slate-200 accent-amber-500" />
          </div>
          <div>
            <div className="flex justify-between text-xs mb-1.5"><span className="text-slate-650 font-medium">拟定最大亏损离场距离:</span><span className="text-emerald-650 font-bold font-mono">{stopLossDist}% 跌幅</span></div>
            <input type="range" min="2" max="20" value={stopLossDist} onChange={(e) => setStopLossDist(Number(e.target.value))} className="w-full h-1.5 rounded-lg appearance-none cursor-pointer bg-slate-200 accent-emerald-600" />
          </div>
        </div>

        <div className="lg:col-span-5 flex flex-col justify-between gap-4">
          <div className="bg-slate-50 p-4 rounded-lg border border-slate-205 shadow-3xs flex-1 flex flex-col justify-between">
            <div><span className="text-xs text-slate-700 block font-bold mb-1">《凯利公式》期望最优仓位解</span><p className="text-[10px] text-slate-500 leading-tight">基于历史复利优势与胜率分布，测算所得的最优风险敞口配额比</p></div>
            <div className="my-2">
              <span className="text-2xl font-black font-mono text-cyan-600">{displayKelly != null ? `${displayKelly}%` : '--'}</span>
              <span className="text-xs text-slate-500 ml-1 font-semibold">建议总仓位</span>
            </div>
            <span className="text-[10px] text-slate-400 font-mono">公式: f* = (p·b - q) / b</span>
          </div>

          <div className="bg-slate-50 p-4 rounded-lg border border-slate-205 shadow-3xs flex-1 flex flex-col justify-between">
            <div><span className="text-xs text-slate-700 block font-bold mb-1">单笔风险限制最大安全边界</span><p className="text-[10px] text-slate-500 leading-tight">通过单笔最大回撤上限限制购买资金量 (单笔最大损失 ≤ {accountRisk}%)</p></div>
            <div className="my-2">
              <span className="text-2xl font-black font-mono text-emerald-600">{displayPosition != null ? `${displayPosition}%` : '--'}</span>
              <span className="text-xs text-slate-500 ml-1 font-semibold">满额仓上限</span>
              {maxRiskAmount != null && <div className="text-[9px] text-slate-500 mt-0.5 font-mono">最大风险敞口 ¥{maxRiskAmount.toLocaleString()}</div>}
            </div>
            <span className="text-[10px] text-slate-400 font-mono">计算: 总额损 % / 止损下边界 %</span>
          </div>

          {suggestedShares != null && (
            <div className="bg-slate-50 p-3 rounded-lg border border-slate-205 shadow-3xs text-center">
              <span className="text-[10px] text-slate-500 block font-bold">后端建议买入股数（取整手）</span>
              <span className="text-lg font-black font-mono text-red-600">{suggestedShares} 股</span>
            </div>
          )}

          <div className="bg-slate-105 border border-slate-200 p-4 rounded-lg font-sans flex items-center gap-3 shadow-3xs">
            <div className="p-2 rounded-lg bg-yellow-100"><Target className="w-5 h-5 text-yellow-600" /></div>
            <div>
              <span className="text-xs text-slate-500 font-semibold block">风控部综合折中建议仓位</span>
              <div className="text-sm font-bold text-slate-800 mt-0.5">
                分投不宜超过：<span className="text-yellow-600 font-extrabold text-base font-mono">{recommendedSizing != null ? `${recommendedSizing}%` : '--'}</span> 仓量
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
