import React, { useState } from 'react';
import { StockInfo } from '../types';
import { Star, ShieldAlert, BadgePlus, Trash2, Layers, Landmark, Cpu, Sparkles } from 'lucide-react';
import { API_BASE } from '../services/api';

interface StockPoolProps {
  stocks: StockInfo[];
  stockPoolGroupings: Record<string, string[]>;
  selectedStockCode: string;
  onSelectStock: (code: string) => void;
  onAddStockToCustomPool: (poolName: string, code: string) => void;
  onRemoveStockFromCustomPool: (poolName: string, code: string) => void;
}

export default function StockPool({
  stocks,
  stockPoolGroupings,
  selectedStockCode,
  onSelectStock,
  onAddStockToCustomPool,
  onRemoveStockFromCustomPool,
}: StockPoolProps) {
  const [activePool, setActivePool] = useState<string>('科技龙头股');
  const [newStockCode, setNewStockCode] = useState<string>('');
  const [addFeedback, setAddFeedback] = useState<string>('');

  // 各分类池对应装饰图标
  const poolIcons: Record<string, React.ReactNode> = {
    '成长绩优股': <Sparkles className="w-4 h-4 text-pink-500" />,
    '高分红红利股': <Landmark className="w-4 h-4 text-amber-500" />,
    '科技龙头股': <Cpu className="w-4 h-4 text-cyan-600" />,
    '超跌反弹股': <ShieldAlert className="w-4 h-4 text-orange-500" />,
    '热点概念股': <Layers className="w-4 h-4 text-violet-500" />,
  };

  const poolCodes = stockPoolGroupings[activePool] || [];
  const poolStocks = stocks.filter((s) => poolCodes.includes(s.code));

  // 聚合计算池平均数指标
  const avgPe = poolStocks.length
    ? poolStocks.reduce((sum, s) => sum + s.pe, 0) / poolStocks.length
    : 0;
  const avgRoe = poolStocks.length
    ? poolStocks.reduce((sum, s) => sum + s.roe, 0) / poolStocks.length
    : 0;

  const handleAddStock = (e: React.FormEvent) => {
    e.preventDefault();
    const formatted = newStockCode.trim().toUpperCase();
    if (!formatted) return;

    // First try a local search for instant matches
    const localStock = stocks.find(
      (s) => s.code.toUpperCase() === formatted || s.name === formatted
    );

    if (localStock) {
      if (poolCodes.includes(localStock.code)) {
        setAddFeedback('× 重复添加，该股已在该池中！');
        setTimeout(() => setAddFeedback(''), 3000);
        return;
      }
      onAddStockToCustomPool(activePool, localStock.code);
      setNewStockCode('');
      setAddFeedback('✓ 成功添加进当前特色股票池！');
      setTimeout(() => setAddFeedback(''), 3000);
      return;
    }

    // Fallback: search across all 5000+ A-shares on backend
    setAddFeedback('🔍 全市场比对中...');
    fetch(`${API_BASE}/api/market/spot?limit=5&search=${encodeURIComponent(formatted)}`)
      .then((r) => r.json())
      .then((d) => {
        if (d.success && d.data && d.data.length > 0) {
          const firstMatch = d.data[0];
          const rawCode = (firstMatch.代码 || firstMatch.f12 || '').replace(/^(sh|sz|bj)/i, '').padStart(6, '0');
          
          if (poolCodes.includes(rawCode)) {
            setAddFeedback('× 重复添加，该股已在该池中！');
            setTimeout(() => setAddFeedback(''), 3000);
            return;
          }

          onAddStockToCustomPool(activePool, rawCode);
          setNewStockCode('');
          setAddFeedback('✓ 成功添加进当前特色股票池！');
          setTimeout(() => setAddFeedback(''), 3000);
        } else {
          setAddFeedback('× 错误拼写，股票不存在于 A 股市场中！');
          setTimeout(() => setAddFeedback(''), 3000);
        }
      })
      .catch(() => {
        setAddFeedback('× 无法连接服务，请重试！');
        setTimeout(() => setAddFeedback(''), 3000);
      });
  };

  return (
    <div className="bg-white border border-slate-200 shadow-sm rounded-xl p-5 hover:border-slate-350 hover:shadow-md transition h-full" id="stock-pool-module">
      <div className="flex justify-between items-center mb-4">
        <div>
          <h2 className="text-lg font-bold text-slate-850 flex items-center gap-2">
            <Star className="w-5 h-5 text-yellow-400 fill-yellow-400/10" />
            特色主题股票池
          </h2>
          <p className="text-xs text-slate-500 mt-0.5 font-medium">
            精筛核心价值，支持动态添加或自定义跟踪股
          </p>
        </div>
      </div>

      {/* 主题标签组 */}
      <div className="flex flex-wrap gap-2 mb-4">
        {Object.keys(stockPoolGroupings).map((pName) => (
          <button
            key={pName}
            onClick={() => setActivePool(pName)}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold cursor-pointer border transition ${
              activePool === pName
                ? 'bg-red-50 border-red-300 text-red-650 shadow-3xs scale-102'
                : 'bg-slate-50 border-slate-200 text-slate-600 hover:text-slate-900 hover:bg-slate-100'
            }`}
          >
            {poolIcons[pName]}
            {pName}
          </button>
        ))}
      </div>

      {/* 平均指标仪表 */}
      <div className="grid grid-cols-2 gap-3 mb-4">
        <div className="bg-slate-50 border border-slate-200 rounded-lg p-3 text-center shadow-3xs">
          <div className="text-[10px] text-slate-500 font-semibold">股票池平均市盈率 (PE)</div>
          <div className="text-lg font-black font-mono text-cyan-600 mt-1">
            {avgPe ? avgPe.toFixed(1) : '-'} <span className="text-xs font-normal text-slate-400 font-sans">倍</span>
          </div>
        </div>
        <div className="bg-slate-50 border border-slate-200 rounded-lg p-3 text-center shadow-3xs">
          <div className="text-[10px] text-slate-500 font-semibold">股票池平均 ROE%</div>
          <div className="text-lg font-black font-mono text-red-550 mt-1">
            {avgRoe ? avgRoe.toFixed(1) : '-'} <span className="text-xs font-normal text-slate-400 font-sans">%</span>
          </div>
        </div>
      </div>

      {/* 股票池成分股展示 */}
      <div className="bg-slate-50 rounded-lg border border-slate-200 p-3 mb-4 max-h-[190px] overflow-y-auto scrollbar-thin shadow-3xs">
        <div className="text-xs text-slate-650 font-bold mb-2">
          当前股票池成分股 ({poolStocks.length} 只)
        </div>
        <div className="grid grid-cols-1 divide-y divide-slate-150">
          {poolStocks.map((st) => {
            const isSelected = st.code === selectedStockCode;
            const isUp = st.changePct >= 0;
            return (
              <div
                key={st.code}
                onClick={() => onSelectStock(st.code)}
                className={`flex justify-between items-center py-2 px-1.5 rounded hover:bg-slate-150 cursor-pointer transition ${
                  isSelected ? 'bg-red-50/50' : ''
                }`}
              >
                <div className="flex flex-col">
                  <span className="text-xs font-black text-slate-800 flex items-center gap-1">
                    {st.name}
                    <span className="text-[10px] font-mono text-slate-500 font-normal">
                      {st.code.split('.')[0]}
                    </span>
                  </span>
                  <span className="text-[10px] text-slate-500">{st.sector}</span>
                </div>
                <div className="flex items-center gap-3">
                  <div className="text-right">
                    <div className={`text-xs font-mono font-black ${isUp ? 'text-red-655' : 'text-emerald-600'}`}>
                      {st.price.toFixed(2)}
                    </div>
                    <div className={`text-[10px] font-mono font-bold ${isUp ? 'text-red-500' : 'text-emerald-550'}`}>
                      {isUp ? '+' : ''}{st.changePct.toFixed(2)}%
                    </div>
                  </div>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      onRemoveStockFromCustomPool(activePool, st.code);
                    }}
                    className="p-1 text-slate-400 hover:text-red-600 hover:bg-slate-200 rounded transition"
                    title="移出成分股票池"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            );
          })}
          {poolStocks.length === 0 && (
            <div className="text-center py-6 text-xs text-slate-500 font-sans">
              池中尚空无一物，可在下方输入代码或名称添加！
            </div>
          )}
        </div>
      </div>

      {/* 底部代码塞入表单 */}
      <form onSubmit={handleAddStock} className="flex flex-col gap-2">
        <div className="flex gap-2">
          <div className="relative flex-1">
            <input
              type="text"
              placeholder="输入代码/名称 (如: 601138)"
              value={newStockCode}
              onChange={(e) => setNewStockCode(e.target.value)}
              className="w-full bg-white border border-slate-200 text-xs rounded-lg px-3 py-2 text-slate-800 focus:outline-none focus:border-red-500 transition font-mono"
            />
          </div>
          <button
            type="submit"
            className="flex items-center gap-1 bg-red-650 hover:bg-red-550 text-white text-xs px-3 py-2 rounded-lg font-bold transition cursor-pointer"
          >
            <BadgePlus className="w-3.5 h-3.5" />
            塞入此池
          </button>
        </div>
        {addFeedback && (
          <div
            className={`text-[10px] text-center font-bold ${
              addFeedback.startsWith('✓') ? 'text-emerald-600' : 'text-amber-600'
            }`}
          >
            {addFeedback}
          </div>
        )}
      </form>
    </div>
  );
}
