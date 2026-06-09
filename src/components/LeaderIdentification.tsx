import React from 'react';
import { StockInfo } from '../types';
import { Award, Zap, Flame, ShieldAlert } from 'lucide-react';

interface LeaderIdentificationProps {
  stocks: StockInfo[];
  onSelectStock: (code: string) => void;
}

export default function LeaderIdentification({ stocks, onSelectStock }: LeaderIdentificationProps) {
  // 过滤并根据连板数+技术评分进行降序排序
  const leaders = stocks
    .filter((s) => s.isLeader || s.consecutiveBoards > 0)
    .sort((a, b) => b.consecutiveBoards - a.consecutiveBoards || b.scores.technical - a.scores.technical);

  return (
    <div className="bg-white border border-slate-200 shadow-sm rounded-xl p-5 hover:border-slate-300 hover:shadow-md transition" id="leader-iden-module">
      {/* 模块头部 */}
      <div>
        <h2 className="text-lg font-bold text-slate-850 flex items-center gap-2">
          <Zap className="w-5 h-5 text-red-500 fill-red-500/10" />
          弱市抱团 · 龙头接力赛
        </h2>
        <p className="text-xs text-slate-500 mt-0.5">
          实时监测市场连板梯队（连板即正义，抱团即安全）
        </p>
      </div>

      {/* 梯队纵列阵 */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4">
        {/* 高度板龙头 (主打) */}
        {leaders.slice(0, 2).map((st, index) => {
          const isUp = st.changePct >= 0;
          return (
            <div
              key={st.code}
              onClick={() => onSelectStock(st.code)}
              className="relative bg-gradient-to-br from-white to-red-50/20 border border-slate-200 rounded-xl p-4 cursor-pointer hover:border-red-350 transition group overflow-hidden shadow-3xs"
            >
              {/* 金光流溢线 */}
              <div className="absolute top-0 left-0 right-0 h-[2px] bg-gradient-to-r from-red-650 to-yellow-500"></div>
              
              {/* 水印标识 */}
              <div className="absolute right-[-10px] bottom-[-10px] text-red-500/5 font-extrabold text-7xl font-mono select-none pointer-events-none group-hover:scale-110 transition duration-500">
                L{index + 1}
              </div>

              <div className="flex justify-between items-start">
                <div className="flex items-center gap-2">
                  <div className="w-10 h-10 rounded-lg bg-red-50 text-red-600 flex items-center justify-center font-black border border-red-200">
                    {index === 0 ? '龙一' : '龙二'}
                  </div>
                  <div>
                    <h3 className="text-sm font-black text-slate-850 group-hover:text-red-655 transition">
                      {st.name}
                    </h3>
                    <span className="text-[10px] font-mono text-slate-500">{st.code}</span>
                  </div>
                </div>

                <div className="text-right">
                  <span className="inline-block bg-red-600 text-white font-black text-[10px] uppercase tracking-wider px-2 py-0.5 rounded shadow-md shadow-red-600/20">
                    连板: {st.consecutiveBoards > 0 ? `${st.consecutiveBoards}连板` : '趋势龙头'}
                  </span>
                  <div className="text-xs font-bold text-red-600 font-mono mt-1">
                    {isUp ? '+' : ''}{st.changePct.toFixed(2)}%
                  </div>
                </div>
              </div>

              {/* 板块和指标分析 */}
              <div className="mt-4 grid grid-cols-3 gap-2 border-t border-slate-200/80 pt-3 flex-wrap">
                <div className="text-center bg-slate-50 p-2 rounded border border-slate-200/60">
                  <span className="text-[8px] text-slate-500 block">技术分</span>
                  <span className="text-xs font-mono font-extrabold text-cyan-600">{st.scores.technical}</span>
                </div>
                <div className="text-center bg-slate-50 p-2 rounded border border-slate-200/60">
                  <span className="text-[8px] text-slate-500 block">资金流入</span>
                  <span className="text-xs font-mono font-extrabold text-red-600">{st.scores.capitalFlow}</span>
                </div>
                <div className="text-center bg-slate-50 p-2 rounded border border-slate-200/60">
                  <span className="text-[8px] text-slate-500 block">景气系数</span>
                  <span className="text-xs font-mono font-extrabold text-emerald-600">{st.scores.prosperity}</span>
                </div>
              </div>

              <div className="text-[10px] text-slate-500 font-sans mt-3 line-clamp-1">
                评语: <span className="text-slate-700 font-semibold">{st.signalReason}</span>
              </div>
            </div>
          );
        })}
      </div>

      {/* 行业龙头跟随备选卡 */}
      <div className="mt-4 bg-slate-50 rounded-xl border border-slate-200 p-4">
        <h3 className="text-xs font-semibold text-slate-700 mb-2 flex items-center gap-1.5">
          <Flame className="w-3.5 h-3.5 text-yellow-500" />
          其它强势先锋候选跟踪：
        </h3>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          {leaders.slice(2, 5).map((st) => (
            <div
              key={st.code}
              onClick={() => onSelectStock(st.code)}
              className="bg-white border border-slate-200 rounded p-2 hover:border-slate-350 cursor-pointer hover:shadow-3xs transition flex justify-between items-center"
            >
              <div className="flex flex-col">
                <span className="text-xs font-bold text-slate-800">{st.name}</span>
                <span className="text-[9px] text-slate-400">{st.sector}</span>
              </div>
              <span className="text-[10px] font-mono font-bold text-red-600 bg-red-500/10 px-1 py-0.5 rounded">
                +{st.changePct.toFixed(1)}%
              </span>
            </div>
          ))}
          {leaders.length <= 2 && (
            <div className="col-span-3 text-center py-2 text-[10px] text-slate-400">
              市场处于绝对极地冰点期，暂无其它溢溢出龙头候选股。
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
