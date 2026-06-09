import React from 'react';
import { MarketSentiment } from '../types';
import { Compass, Thermometer, ShieldAlert, Zap, TrendingUp, TrendingDown } from 'lucide-react';

interface SentimentCycleProps {
  sentiment: MarketSentiment;
  onUpdateSentimentPhase: (phase: MarketSentiment['phase']) => void;
}

export default function SentimentCycle({ sentiment, onUpdateSentimentPhase }: SentimentCycleProps) {
  const { phase, fearGreedIndex, limitUpCount, limitDownCount, boardRatio, totalTurnover, description } = sentiment;

  // 四种特征周期的视觉配色说明
  const phaseMetadata: Record<MarketSentiment['phase'], { bg: string, text: string, border: string, btnActive: string, iconColor: string }> = {
    '冰点期': { 
      bg: 'bg-cyan-50', 
      text: 'text-cyan-700', 
      border: 'border-cyan-200', 
      btnActive: 'bg-cyan-600 text-white border-cyan-600',
      iconColor: 'text-cyan-600' 
    },
    '启动期': { 
      bg: 'bg-amber-50', 
      text: 'text-amber-700', 
      border: 'border-amber-200', 
      btnActive: 'bg-amber-500 text-white border-amber-500',
      iconColor: 'text-amber-500' 
    },
    '狂热期': { 
      bg: 'bg-red-50/70', 
      text: 'text-red-700 border-red-200 shadow-sm', 
      border: 'border-red-200', 
      btnActive: 'bg-red-650 text-white border-red-650',
      iconColor: 'text-red-600' 
    },
    '退潮期': { 
      bg: 'bg-emerald-50', 
      text: 'text-emerald-700', 
      border: 'border-emerald-200', 
      btnActive: 'bg-emerald-600 text-white border-emerald-600',
      iconColor: 'text-emerald-600' 
    }
  };

  const activeMeta = phaseMetadata[phase];

  return (
    <div className="bg-white border border-slate-200 rounded-xl p-6 shadow-sm hover:shadow-md hover:border-slate-300 transition" id="sentiment-cycle-module">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 mb-4">
        <div>
          <h2 className="text-lg md:text-xl font-bold text-slate-900 flex items-center gap-2">
            <Compass className="w-5 h-5 text-red-500 animate-spin" style={{ animationDuration: '8s' }} />
            情绪温度监测 & 周期阶段追踪
          </h2>
          <p className="text-xs md:text-sm text-slate-500 mt-0.5 font-medium">
            A股特有的牛熊轮换微型情绪周期状态度量模型（支持自定义切换周期状态评估）
          </p>
        </div>
      </div>

      {/* 周期手动沙盘推演 */}
      <div className="grid grid-cols-4 gap-2 mb-4">
        {(['冰点期', '启动期', '狂热期', '退潮期'] as MarketSentiment['phase'][]).map((p) => {
          const isActive = phase === p;
          const meta = phaseMetadata[p];
          return (
            <button
              key={p}
              onClick={() => onUpdateSentimentPhase(p)}
              className={`p-2 rounded-lg text-center text-xs md:text-sm font-bold transition border cursor-pointer ${
                isActive
                  ? meta.btnActive + ' shadow-md scale-[1.02]'
                  : 'bg-slate-50 border-slate-200 text-slate-600 hover:text-slate-900 hover:bg-slate-100'
              }`}
            >
              {p}
            </button>
          );
        })}
      </div>

      {/* 核心指标统计仪表网格 */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
        {/* 恐慌贪婪指数 */}
        <div className="bg-slate-50 border border-slate-200 rounded-lg p-3">
          <span className="text-xs font-bold text-slate-500 block">恐慌贪婪指数</span>
          <div className="flex items-baseline mt-1 gap-1">
            <span className="text-xl font-black font-mono text-slate-900">{fearGreedIndex}</span>
            <span className="text-xs text-slate-500">/ 100</span>
          </div>
          {/* 微型进度条 */}
          <div className="w-full bg-slate-200 h-1.5 rounded-full mt-2 overflow-hidden">
            <div
              className="bg-gradient-to-r from-cyan-500 via-amber-400 to-red-500 h-full transition-all duration-500"
              style={{ width: `${fearGreedIndex}%` }}
            ></div>
          </div>
        </div>

        {/* 赞/跌停比率 */}
        <div className="bg-slate-50 border border-slate-200 rounded-lg p-3">
          <span className="text-xs font-bold text-slate-500 block">涨停/跌停数</span>
          <div className="flex items-center gap-1.5 mt-1 font-mono font-extrabold text-sm">
            <span className="text-red-650 flex items-center gap-0.5">
              <TrendingUp className="w-4 h-4" />
              {limitUpCount}
            </span>
            <span className="text-slate-300">/</span>
            <span className="text-emerald-650 flex items-center gap-0.5">
              <TrendingDown className="w-4 h-4" />
              {limitDownCount}
            </span>
          </div>
          <span className="text-[10px] text-slate-500 block mt-2 font-medium">当日极限板封单指标</span>
        </div>

        {/* 连板晋级率 */}
        <div className="bg-slate-50 border border-slate-200 rounded-lg p-3">
          <span className="text-xs font-bold text-slate-500 block">连板晋级概率</span>
          <div className="flex items-baseline mt-1 gap-1">
            <span className="text-xl font-black font-mono text-amber-600">{boardRatio}%</span>
          </div>
          <span className="text-[10px] text-slate-500 block mt-2 font-medium">高位游资接力活跃度分水岭</span>
        </div>

        {/* 全两市总成交额 */}
        <div className="bg-slate-50 border border-slate-200 rounded-lg p-3">
          <span className="text-xs font-bold text-slate-500 block">两市交投成交额</span>
          <div className="flex items-baseline mt-1 gap-1">
            <span className="text-xl font-black font-mono text-cyan-600">{(totalTurnover / 1000).toFixed(1)}</span>
            <span className="text-xs text-slate-500 font-bold">万亿</span>
          </div>
          <span className="text-[10px] text-slate-500 block mt-2 font-medium">增量行情VS存量盘整主标</span>
        </div>
      </div>

      {/* 情绪评判公告板 */}
      <div className={`p-4 border rounded-xl flex gap-3 ${activeMeta.bg} ${activeMeta.border} shadow-3xs`}>
        <div className="p-2 rounded-lg bg-white border border-slate-105 self-start shadow-3xs">
          <Compass className={`w-5 h-5 ${activeMeta.iconColor} animate-spin`} style={{ animationDuration: '10s' }} />
        </div>
        <div>
          <span className={`text-sm font-black ${activeMeta.text}`}>
            当前情绪刻位：{phase}（市场心跳）
          </span>
          <p className="text-xs md:text-sm text-slate-705 mt-1 leading-relaxed font-semibold">
            {description}
          </p>
        </div>
      </div>
    </div>
  );
}
