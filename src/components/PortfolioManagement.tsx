import React, { useState, useEffect } from 'react';
import { PortfolioHolding, StockInfo } from '../types';
import { API_BASE } from '../services/api';
import {
  Briefcase,
  CreditCard,
  ArrowUpRight,
  ArrowDownRight,
  CircleDollarSign,
  Database,
  Settings,
  Plus,
  Trash2,
  Edit,
  Check,
  X,
  Wrench,
  PlusCircle,
  RefreshCw
} from 'lucide-react';

interface PortfolioManagementProps {
  cash: number;
  portfolio: PortfolioHolding[];
  selectedStock: StockInfo;
  onBuyStock: (code: string, name: string, price: number, shares: number) => Promise<boolean>;
  onSellStock: (id: string, shares: number) => void;
  onUpdateCash: (cash: number) => void;
  onUpdatePortfolio: (portfolio: PortfolioHolding[]) => void;
  stocks?: StockInfo[];
}

export default function PortfolioManagement({
  cash,
  portfolio,
  selectedStock,
  onBuyStock,
  onSellStock,
  onUpdateCash,
  onUpdatePortfolio,
  stocks = [],
}: PortfolioManagementProps) {
  const [buyShares, setBuyShares] = useState<number>(100);
  const [tradeMessage, setTradeMessage] = useState<string>('');
  const [tradeError, setTradeError] = useState<string>('');

  // 自定义持仓配置状态
  const [showConfig, setShowConfig] = useState<boolean>(false);
  const [configCash, setConfigCash] = useState<string>(cash.toString());

  // 新增持仓配置输入
  const [manualCode, setManualCode] = useState<string>('');
  const [manualName, setManualName] = useState<string>('');
  const [manualBuyPrice, setManualBuyPrice] = useState<string>('');
  const [manualCurrentPrice, setManualCurrentPrice] = useState<string>('');
  const [manualShares, setManualShares] = useState<string>('1000');
  const [manualBuyDate, setManualBuyDate] = useState<string>(new Date().toISOString().split('T')[0]);
  const [manualError, setManualError] = useState<string>('');
  const [manualSuccess, setManualSuccess] = useState<string>('');

  // 行内编辑状态
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingShares, setEditingShares] = useState<string>('');
  const [editingPrice, setEditingPrice] = useState<string>('');

  // 部分减持状态
  const [sellingId, setSellingId] = useState<string | null>(null);
  const [sellQty, setSellQty] = useState<string>('');

  // 后端同步状态
  const [realSummary, setRealSummary] = useState<any>(null);
  const [backendOnline, setBackendOnline] = useState<boolean | null>(null);

  useEffect(() => {
    fetch(`${API_BASE}/api/portfolio/summary`)
      .then((r) => r.json())
      .then((d) => {
        if (d.success) { 
          setRealSummary(d); 
          setBackendOnline(true); 
        } else { 
          setBackendOnline(false); 
        }
      })
      .catch(() => { 
        setBackendOnline(false); 
      });
  }, [portfolio.length]);

  // 1. 计算总市值和总资产
  const totalHoldingsValue = portfolio.reduce((sum, held) => sum + held.currentPrice * held.shares, 0);
  const totalAssets = cash + totalHoldingsValue;

  // 2. 盈总算账
  const totalCost = portfolio.reduce((sum, held) => sum + held.buyPrice * held.shares, 0);
  const totalFloatingProfit = totalHoldingsValue - totalCost;
  const floatingProfitPct = totalCost > 0 ? (totalFloatingProfit / totalCost) * 100 : 0;

  const handleBuySubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (buyShares <= 0) return;
    if (buyShares % 100 !== 0) {
      setTradeError('× A股交易规定：最小买入单位是「手」，必须为100的整数倍！');
      setTimeout(() => setTradeError(''), 4000);
      return;
    }

    const success = await onBuyStock(selectedStock.code, selectedStock.name, selectedStock.price, buyShares);

    if (success) {
      setTradeMessage(`✓ 委托成功：以最新价 ${selectedStock.price.toFixed(2)}元 购入 ${buyShares}股【${selectedStock.name}】`);
      setTimeout(() => setTradeMessage(''), 4000);
    } else {
      setTradeError('× 委托失败：账户现金不足或后端不可达！');
      setTimeout(() => setTradeError(''), 4000);
    }
  };

  // 自定义可用现金余额调整
  const handleConfigCashSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const newCash = parseFloat(configCash);
    if (isNaN(newCash) || newCash < 0) {
      setManualError('× 现金金额输入不合法！');
      setTimeout(() => setManualError(''), 3000);
      return;
    }
    onUpdateCash(parseFloat(newCash.toFixed(2)));
    setManualSuccess('✓ 成功更新账户可用现金余额！');
    setTimeout(() => setManualSuccess(''), 3500);
  };

  // 下拉选择股票快捷填表
  const handleMarketStockSelect = (code: string) => {
    const match = stocks.find((s) => s.code === code);
    if (match) {
      setManualCode(match.code);
      setManualName(match.name);
      setManualBuyPrice(match.price.toString());
      setManualCurrentPrice(match.price.toString());
    }
  };

  // 手动新增自定义任意持仓股票
  const handleManualAddHolding = (e: React.FormEvent) => {
    e.preventDefault();
    if (!manualCode || !manualName) {
      setManualError('× 股票代码和股票名称必须填齐！');
      setTimeout(() => setManualError(''), 3500);
      return;
    }
    const bPrice = parseFloat(manualBuyPrice);
    const cPrice = parseFloat(manualCurrentPrice) || bPrice;
    const shs = parseInt(manualShares);

    if (isNaN(bPrice) || bPrice <= 0) { 
      setManualError('× 购入单价必须是大于零的数字！'); 
      setTimeout(() => setManualError(''), 3500); 
      return; 
    }
    if (isNaN(shs) || shs <= 0) { 
      setManualError('× 持仓股数必须是大于零的数字！'); 
      setTimeout(() => setManualError(''), 3500); 
      return; 
    }

    const newHolding: PortfolioHolding = {
      id: 'custom-' + Date.now(), 
      code: manualCode, 
      name: manualName,
      buyPrice: bPrice, 
      currentPrice: cPrice, 
      shares: shs,
      buyDate: manualBuyDate || new Date().toISOString().split('T')[0]
    };
    onUpdatePortfolio([...portfolio, newHolding]);
    setManualCode('');
    setManualName('');
    setManualBuyPrice('');
    setManualCurrentPrice('');
    setManualShares('1000');
    setManualSuccess('✓ 成功登记并添加自定义持仓！');
    setTimeout(() => setManualSuccess(''), 3500);
  };

  // 保存行内直接编辑结果
  const handleSaveInlineEdit = (id: string) => {
    const shs = parseInt(editingShares);
    const prc = parseFloat(editingPrice);
    if (isNaN(shs) || shs <= 0 || isNaN(prc) || prc <= 0) {
      setManualError('× 持仓数量与成本价格必须是大于零的数字！');
      setTimeout(() => setManualError(''), 3000);
      return;
    }
    const updated = portfolio.map((held) => {
      if (held.id === id) {
        return { ...held, shares: shs, buyPrice: prc };
      }
      return held;
    });
    onUpdatePortfolio(updated);
    setEditingId(null);
  };

  // 纯账面直接删除记录
  const handleDeleteHoldingDirect = (id: string) => {
    const updated = portfolio.filter((held) => held.id !== id);
    onUpdatePortfolio(updated);
    setManualSuccess('✓ 持仓已在账面成功删除相应记录');
    setTimeout(() => setManualSuccess(''), 3000);
  };

  return (
    <div className="bg-white border border-slate-200 shadow-sm rounded-xl p-5 hover:border-slate-300 hover:shadow-md transition" id="portfolio-module">
      {/* 模块头部 */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 pb-4 border-b border-slate-150">
        <div>
          <h2 className="text-lg font-bold text-slate-850 flex items-center gap-2">
            <Briefcase className="w-5 h-5 text-red-500" />
            全景持仓 & 账目中心{' '}
            {backendOnline === true ? (
              <span className="text-emerald-600 bg-emerald-50 px-1.5 py-0.5 rounded border border-emerald-200 text-[10px]"><Database className="w-3 h-3 inline mr-0.5" />后端同步</span>
            ) : backendOnline === false ? (
              <span className="text-red-650 bg-red-50 px-1.5 py-0.5 rounded border border-red-200 text-[10px]">后端离线</span>
            ) : null}
          </h2>
          <p className="text-xs text-slate-500 mt-0.5">个股自选建仓买卖管理，买入成交单位最小为1手（100股）</p>
        </div>
        <button
          onClick={() => { setShowConfig(!showConfig); setConfigCash(cash.toString()); }}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold select-none cursor-pointer transition-all border ${showConfig ? 'bg-red-50 text-red-600 border-red-200 shadow-3xs' : 'bg-slate-50 text-slate-600 hover:text-slate-900 border-slate-205 hover:bg-slate-100 shadow-3xs'}`}
        >
          <Wrench className={`w-3.5 h-3.5 text-slate-550 ${showConfig ? 'rotate-45 text-red-400' : ''} transition-transform`} />
          {showConfig ? '收起配置台' : '🛠️ 配置自选持仓与现金'}
        </button>
      </div>

      {/* 资产全息面格 */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-4 mb-5">
        <div className="bg-slate-50 p-4 rounded-lg border border-slate-200 shadow-3xs">
          <span className="text-[10px] text-slate-500 block font-semibold">账户总权益资产总值(估值)</span>
          <div className="text-xl font-black font-mono text-red-600 mt-1">¥ {totalAssets.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</div>
          <span className="text-[9px] text-slate-400 mt-1 block">全盘现金 + 股票持仓总和值</span>
        </div>
        <div className="bg-slate-50 p-4 rounded-lg border border-slate-200 shadow-3xs">
          <span className="text-[10px] text-slate-500 block font-semibold">可用现金余额 (CNY)</span>
          <div className="text-xl font-black font-mono text-cyan-600 mt-1">¥ {cash.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</div>
          <span className="text-[9px] text-slate-400 mt-1 block font-sans">可开仓或加仓的最大购买边</span>
        </div>
        <div className="bg-slate-50 p-4 rounded-lg border border-slate-200 shadow-3xs">
          <span className="text-[10px] text-slate-500 block font-semibold">浮动持仓盈亏 (P&L)</span>
          <div className={`text-xl font-black font-mono mt-1 flex items-center gap-1 ${totalFloatingProfit >= 0 ? 'text-red-550' : 'text-emerald-600'}`}>
            {totalFloatingProfit >= 0 ? '+' : ''}{totalFloatingProfit.toLocaleString(undefined, { minimumFractionDigits: 1, maximumFractionDigits: 1 })}
            <span className="text-xs">({totalFloatingProfit >= 0 ? '+' : ''}{floatingProfitPct.toFixed(2)}%)</span>
          </div>
          <span className="text-[9px] text-slate-450 mt-1 block">与初始持仓购入单价做多维度比对</span>
        </div>
      </div>

      {/* 🛠️ 用户自定义配置中心 */}
      {showConfig && (
        <div className="bg-slate-50 p-4 rounded-xl border border-dashed border-red-200 mb-5 space-y-4">
          <div className="flex items-center gap-1.5 border-b border-slate-200 pb-2">
            <Wrench className="w-4 h-4 text-red-500" />
            <h4 className="text-xs font-black text-slate-800">仿真账户研判配置中台</h4>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="bg-white p-3 rounded-lg border border-slate-200">
              <span className="text-[10px] text-slate-600 font-bold block mb-1">🪙 充值 / 自定义配置可用现金余额 (CNY):</span>
              <form onSubmit={handleConfigCashSubmit} className="flex gap-2">
                <input type="number" value={configCash} onChange={(e) => setConfigCash(e.target.value)} placeholder="如：500000" className="flex-1 bg-white border border-slate-200 rounded px-2.5 text-xs py-1.5 text-slate-800 font-mono focus:outline-none focus:border-red-500" />
                <button type="submit" className="bg-red-650 hover:bg-red-550 text-white font-bold text-xs px-3 rounded transition cursor-pointer">确认充值/重设</button>
              </form>
            </div>
            <div className="bg-white p-3 rounded-lg border border-slate-200 flex flex-col justify-between">
              <div>
                <span className="text-[10px] text-slate-600 font-bold block mb-1">🗑️ 快捷清空与重设持仓:</span>
                <p className="text-[9px] text-slate-500 leading-relaxed font-sans">想要清除默认示例持仓，重新按照个人真实的实际持股成本和仓位重置？</p>
              </div>
              <div className="flex gap-2 mt-2">
                <button type="button" onClick={() => { onUpdatePortfolio([]); setManualSuccess('✓ 已成功一键清空全部示例持仓！'); setTimeout(() => setManualSuccess(''), 3000); }} className="px-2.5 py-1 text-[10px] bg-slate-50 hover:bg-slate-100 border border-slate-200 text-slate-600 hover:text-slate-800 rounded transition cursor-pointer font-bold">一键清空全部持仓</button>
                <button type="button" onClick={() => { const dp = [{ id: 'h1', code: '601138.SH', name: '工业富联', buyPrice: 22.10, currentPrice: 26.45, shares: 12000, buyDate: '2026-05-18' }, { id: 'h2', code: '600519.SH', name: '贵州茅台', buyPrice: 1650.00, currentPrice: 1685.50, shares: 100, buyDate: '2026-05-25' }]; onUpdatePortfolio(dp); setManualSuccess('✓ 已复位至初始默认示例组合持仓！'); setTimeout(() => setManualSuccess(''), 3000); }} className="px-2.5 py-1 text-[10px] bg-slate-50 hover:bg-slate-100 border border-slate-200 text-slate-600 hover:text-slate-800 rounded transition cursor-pointer font-bold">重设回系统默认组合</button>
              </div>
            </div>
          </div>
          <div className="bg-white p-3 rounded-lg border border-slate-200">
            <span className="text-[10px] text-slate-600 font-bold block mb-1.5">➕ 手动登记 / 快速导入特定个股持仓:</span>
            {stocks && stocks.length > 0 && (
              <div className="mb-2 max-w-sm">
                <label className="text-[9px] text-slate-500 block mb-0.5 font-sans">从两市实时行情大盘池内快速挑选标的:</label>
                <select onChange={(e) => handleMarketStockSelect(e.target.value)} className="bg-white border border-slate-200 rounded px-2 py-1 text-[10px] text-slate-700 w-full focus:outline-none focus:border-red-500 font-sans cursor-pointer" defaultValue="">
                  <option value="" disabled>-- 挑选公开股票，自动套用最新代码、买入原价及最新价 --</option>
                  {stocks.map((s) => (<option key={s.code} value={s.code}>[{s.code}] {s.name} - 最新成交价: ¥{s.price} / 股</option>))}
                </select>
              </div>
            )}
            <form onSubmit={handleManualAddHolding} className="grid grid-cols-2 sm:grid-cols-6 gap-2 border-t border-slate-100 pt-2 items-end">
              <div><label className="text-[9px] text-slate-500 block mb-0.5">代码:</label><input type="text" value={manualCode} onChange={(e) => setManualCode(e.target.value)} placeholder="601127.SH" className="bg-white border border-slate-200 rounded px-2 py-1 text-[11px] text-slate-800 w-full font-mono focus:outline-none focus:border-red-500 text-left" /></div>
              <div><label className="text-[9px] text-slate-500 block mb-0.5">个股名称:</label><input type="text" value={manualName} onChange={(e) => setManualName(e.target.value)} placeholder="赛力斯" className="bg-white border border-slate-200 rounded px-2 py-1 text-[11px] text-slate-800 w-full focus:outline-none focus:border-red-500 text-left" /></div>
              <div><label className="text-[9px] text-slate-500 block mb-0.5">买入成本价 (元):</label><input type="number" step="0.01" value={manualBuyPrice} onChange={(e) => setManualBuyPrice(e.target.value)} placeholder="85.20" className="bg-white border border-slate-200 rounded px-2 py-1 text-[11px] text-slate-800 w-full font-mono focus:outline-none focus:border-red-500 text-left" /></div>
              <div><label className="text-[9px] text-slate-500 block mb-0.5">当前最新价 (元):</label><input type="number" step="0.01" value={manualCurrentPrice} onChange={(e) => setManualCurrentPrice(e.target.value)} placeholder="与成本同价" className="bg-white border border-slate-200 rounded px-2 py-1 text-[11px] text-slate-800 w-full font-mono focus:outline-none focus:border-red-500 text-left" /></div>
              <div><label className="text-[9px] text-slate-500 block mb-0.5">持仓股数 (股):</label><input type="number" step="100" value={manualShares} onChange={(e) => setManualShares(e.target.value)} placeholder="1000" className="bg-white border border-slate-200 rounded px-2 py-1 text-[11px] text-slate-800 w-full font-mono focus:outline-none focus:border-red-500 text-left" /></div>
              <div><button type="submit" className="bg-gradient-to-r from-red-650 to-red-550 hover:from-red-550 hover:to-red-450 text-white font-bold text-xs h-7.5 rounded w-full flex items-center justify-center gap-1 transition cursor-pointer shadow-sm"><Plus className="w-3.5 h-3.5" />确认入账</button></div>
            </form>
          </div>
          {manualSuccess && (<div className="text-xs text-emerald-600 bg-emerald-50 p-2 rounded border border-emerald-250 font-bold animate-pulse text-center">{manualSuccess}</div>)}
          {manualError && (<div className="text-xs text-amber-600 bg-amber-50 p-2 rounded border border-amber-250 font-bold text-center">{manualError}</div>)}
        </div>
      )}

      {/* 模拟买入买卖盒 */}
      <div className="bg-slate-50 rounded-xl p-4 border border-slate-200 mb-5 relative">
        <div className="text-xs font-bold text-slate-700 mb-2 flex items-center gap-1.5">
          <CircleDollarSign className="w-3.5 h-3.5 text-red-500" />
          快捷委托柜台：<span className="text-[11px] text-red-600 font-bold">下单买入【{selectedStock.name}】</span>
        </div>
        <form onSubmit={handleBuySubmit} className="flex flex-col sm:flex-row gap-3 items-end">
          <div className="flex-1 w-full">
            <div className="flex justify-between text-[10px] text-slate-500 mb-1">
              <span>股票代码: <strong className="text-slate-850 font-mono">{selectedStock.code}</strong></span>
              <span>最新即时价格: <strong className="text-red-600 font-mono">¥ {selectedStock.price.toFixed(2)} /股</strong></span>
            </div>
            <div className="flex gap-2">
              <input type="number" min="100" step="100" value={buyShares} onChange={(e) => setBuyShares(Number(e.target.value))} className="flex-1 bg-white border border-slate-200 rounded px-3 py-1.5 text-xs text-slate-800 focus:outline-none focus:border-red-550 font-mono" />
              <span className="bg-slate-100 border border-slate-200 text-slate-500 px-3 py-1.5 rounded text-xs leading-none flex items-center">股 (手)</span>
            </div>
          </div>
          <div className="flex gap-2 w-full sm:w-auto">
            <button type="button" onClick={() => setBuyShares(100)} className="px-2.5 py-1.5 bg-white hover:bg-slate-100 border border-slate-200 text-slate-600 text-[10px] rounded transition cursor-pointer">1手</button>
            <button type="button" onClick={() => setBuyShares(1000)} className="px-2.5 py-1.5 bg-white hover:bg-slate-100 border border-slate-200 text-slate-600 text-[10px] rounded transition cursor-pointer">10手</button>
            <button type="submit" className="flex-1 sm:flex-none uppercase tracking-wide bg-gradient-to-r from-red-655 to-red-555 hover:from-red-555 hover:to-red-455 text-white font-bold text-xs px-4 py-1.8 rounded shadow-sm cursor-pointer transition h-8 flex items-center">一键买入</button>
          </div>
        </form>
        {tradeMessage && (<div className="text-xs text-emerald-600 mt-2 font-mono text-center font-bold">{tradeMessage}</div>)}
        {tradeError && (<div className="text-xs text-red-600 mt-2 font-mono text-center font-bold">{tradeError}</div>)}
      </div>

      {/* 持仓列表明细表格 */}
      <h3 className="text-xs font-bold text-slate-700 mb-2 flex items-center gap-1">持仓清单 ({portfolio.length} 笔)</h3>
      <div className="overflow-x-auto border border-slate-200 rounded-lg">
        <table className="w-full text-left text-xs font-mono">
          <thead className="bg-slate-50 text-slate-600 font-bold border-b border-slate-200">
            <tr>
              <th className="p-2.5 font-bold">股票名称 (代码)</th>
              <th className="p-2.5 text-right font-bold">买入成本价</th>
              <th className="p-2.5 text-right font-bold">当前单价</th>
              <th className="p-2.5 text-right font-bold">持股数</th>
              <th className="p-2.5 text-right font-bold">总市值</th>
              <th className="p-2.5 text-right font-bold">持仓盈亏 (P/L)</th>
              <th className="p-2.5 text-center font-bold">高级操作</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-150 bg-white">
            {portfolio.map((held) => {
              const currentVal = held.currentPrice * held.shares;
              const costVal = held.buyPrice * held.shares;
              const profit = currentVal - costVal;
              const profitPct = costVal > 0 ? (profit / costVal) * 100 : 0;
              const isProfitUp = profit >= 0;
              const isEditing = editingId === held.id;

              return (
                <tr key={held.id} className={`transition ${isEditing ? 'bg-red-50/50' : 'hover:bg-slate-50/50'}`}>
                  <td className="p-2.5"><span className="font-sans font-bold text-slate-800 block">{held.name}</span><span className="text-[10px] text-slate-500 font-mono">{held.code}</span></td>
                  <td className="p-2.5 text-right text-slate-800">
                    {isEditing ? (
                      <div className="flex items-center justify-end gap-1">
                        <span className="text-[10px] text-slate-500 font-mono">¥</span>
                        <input type="number" step="0.01" className="bg-white border border-slate-300 text-slate-800 px-1 py-0.5 rounded text-[11px] text-right w-20 font-mono focus:outline-none focus:border-red-500" value={editingPrice} onChange={(e) => setEditingPrice(e.target.value)} />
                      </div>
                    ) : `¥ ${held.buyPrice.toFixed(2)}`}
                  </td>
                  <td className="p-2.5 text-right text-slate-600 font-mono">¥ {held.currentPrice.toFixed(2)}</td>
                  <td className="p-2.5 text-right text-slate-800 font-bold">
                    {isEditing ? (
                      <input type="number" step="100" className="bg-white border border-slate-300 text-slate-800 px-1 py-0.5 rounded text-[11px] text-right w-22 font-mono focus:outline-none focus:border-red-500" value={editingShares} onChange={(e) => setEditingShares(e.target.value)} />
                    ) : held.shares.toLocaleString()}
                  </td>
                  <td className="p-2.5 text-right font-bold text-slate-900 font-mono">¥ {currentVal.toLocaleString(undefined, { maximumFractionDigits: 0 })}</td>
                  <td className={`p-2.5 text-right font-black font-mono ${isProfitUp ? 'text-red-650' : 'text-emerald-600'}`}>
                    {isProfitUp ? '+' : ''}{profit.toLocaleString(undefined, { maximumFractionDigits: 0 })}
                    <div className="text-[9px] font-bold font-sans">({isProfitUp ? '+' : ''}{profitPct.toFixed(2)}%)</div>
                  </td>
                  <td className="p-2.5 text-center">
                    {isEditing ? (
                      <div className="flex justify-center items-center gap-1.5">
                        <button onClick={() => handleSaveInlineEdit(held.id)} className="p-1 bg-red-650 hover:bg-red-500 text-white rounded transition cursor-pointer" title="确认保存"><Check className="w-3.5 h-3.5" /></button>
                        <button onClick={() => setEditingId(null)} className="p-1 bg-slate-200 hover:bg-slate-300 text-slate-700 rounded transition cursor-pointer" title="取消编辑"><X className="w-3.5 h-3.5" /></button>
                      </div>
                    ) : (
                      <div className="flex items-center justify-center gap-1.5 font-sans">
                        <button onClick={() => { setEditingId(held.id); setEditingShares(held.shares.toString()); setEditingPrice(held.buyPrice.toString()); }} className="p-1 bg-slate-100 hover:bg-slate-200 text-slate-600 hover:text-slate-800 rounded transition cursor-pointer" title="修改数量/买价"><Edit className="w-3.5 h-3.5" /></button>

                        {sellingId === held.id ? (
                          <div className="flex items-center gap-1">
                            <input type="number" min="100" step="100" value={sellQty} onChange={(e) => setSellQty(e.target.value)} className="w-14 bg-white border border-slate-300 text-slate-800 px-1 py-0.5 rounded text-[10px] font-mono focus:outline-none focus:border-red-500 text-center" placeholder="股数" />
                            <button onClick={() => { const qty = parseInt(sellQty) || 0; if (qty > 0 && qty <= held.shares) { onSellStock(held.id, qty); } setSellingId(null); setSellQty(''); }} className="px-1.5 py-0.5 bg-red-600 hover:bg-red-500 text-white rounded text-[9px] font-bold transition cursor-pointer">确认</button>
                            <button onClick={() => { setSellingId(null); setSellQty(''); }} className="px-1 py-0.5 bg-slate-100 text-slate-400 hover:text-slate-600 rounded text-[9px] transition cursor-pointer">✕</button>
                          </div>
                        ) : (
                          <>
                            <button onClick={() => { setSellingId(held.id); setSellQty(String(Math.min(100, held.shares))); }} className="px-1.5 py-0.5 bg-amber-600 hover:bg-amber-500 text-white rounded text-[9px] font-bold transition cursor-pointer" title="卖出指定数量">减持</button>
                            <button onClick={() => onSellStock(held.id, held.shares)} className="px-2 py-0.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded text-[10px] font-bold transition cursor-pointer" title="一键全部卖出变现">清仓</button>
                          </>
                        )}
                        <button onClick={() => handleDeleteHoldingDirect(held.id)} className="p-1 bg-slate-100 hover:bg-red-50 hover:text-red-600 text-slate-450 rounded transition cursor-pointer" title="账面直接删除"><Trash2 className="w-3.5 h-3.5" /></button>
                      </div>
                    )}
                  </td>
                </tr>
              );
            })}
            {portfolio.length === 0 && (
              <tr><td colSpan={7} className="p-8 text-center text-slate-500 font-sans">当前处于空仓避险状态，开启配置或直接买入公开标的快速开仓！</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
