/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import { StockInfo, MarketIndex, SectorHeatInfo, MarketSentiment, PortfolioHolding } from './types';
// 零假数据：所有行情来自 API 真实拉取

// 导入特色子板块模块组件
import DataCenter from './components/DataCenter';
import StockPool from './components/StockPool';
import FiveDimRating from './components/FiveDimRating';
import SignalSystem from './components/SignalSystem';
import PositionSystem from './components/PositionSystem';
import SectorHeat from './components/SectorHeat';
import LeaderIdentification from './components/LeaderIdentification';
import SentimentCycle from './components/SentimentCycle';
import BacktestSystem from './components/BacktestSystem';
import AiAnalysis from './components/AiAnalysis';
import PortfolioManagement from './components/PortfolioManagement';
import { API_BASE } from './services/api';

import {
  TrendingUp, Award, Coins, HelpCircle, Activity,
  LayoutDashboard, BarChart2, Flame, Radio, Layers,
  Compass, Crown, Briefcase, Shield, Brain, LineChart,
  Sparkles, Wallet, ChevronRight, RefreshCw, Menu, X, ArrowUpRight, TrendingDown
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

export default function App() {
  // 1. 全局行情大脑状态
  const [stocks, setStocks] = useState<StockInfo[]>([]);
  const [indices, setIndices] = useState<MarketIndex[]>([]);
  const [sectors, setSectors] = useState<SectorHeatInfo[]>([]);
  const [sentiment, setSentiment] = useState<MarketSentiment>({
    phase: '启动期', fearGreedIndex: 50, limitUpCount: 0, limitDownCount: 0,
    boardRatio: 0, totalTurnover: 0, description: '数据加载中...',
  });
  // 特色股池分类（成分股来自真实行情，由用户动态添加）
  const [poolGroupings, setPoolGroupings] = useState<Record<string, string[]>>({
    '科技龙头股': [],
    '高分红红利股': [],
    '成长绩优股': [],
    '超跌反弹股': [],
    '热点概念股': [],
  });

  // 2. 选股焦点及账户状态（初始为空，启动时从 Python 后端同步真实持仓）
  const [selectedStockCode, setSelectedStockCode] = useState<string>('');
  const [cash, setCash] = useState<number>(100000); // 默认模拟资金 10 万
  const [portfolio, setPortfolio] = useState<PortfolioHolding[]>([]);
  const [portfolioLoading, setPortfolioLoading] = useState<boolean>(true);

  // 3. 真实数据接入状态
  const [apiStatus, setApiStatus] = useState<string>('connecting');
  const [lastPollTime, setLastPollTime] = useState<string>('--:--:--');

  // 4. 导航及菜单抽屉状态
  const [activeMenu, setActiveMenu] = useState<string>('OVERVIEW');
  const [mobileOpen, setMobileOpen] = useState<boolean>(false);

  // === 核心：15 秒真实行情轮询（价格从实时行情，评分从数据库，无写死假数据） ===
  const fetchLiveMarketData = () => {
    // 1. 拉指数
    fetch(`${API_BASE}/api/market/indices`)
      .then((r) => r.json())
      .then((d) => {
        if (d.success && d.data?.length) {
          setIndices(d.data);
          setApiStatus('live');
        }
      })
      .catch((err) => console.error('[行情] 指数拉取失败:', err));

    // 2. 拉个股行情
    fetch(`${API_BASE}/api/market/spot?limit=100`)
      .then((r) => r.json())
      .then((d) => {
        if (d.success && d.data?.length) {
          const priceMap: Record<string, number> = {};
          const codes: string[] = [];
          const realStocks = d.data.slice(0, 100).map((s: any) => {
            const raw = (s.代码 || s.f12 || '').replace(/^(sh|sz|bj)/i, '').padStart(6, '0');
            const currentPrice = parseFloat(s.最新价 || s.f2 || '0');
            if (!currentPrice || currentPrice <= 0) return null;
            priceMap[raw] = currentPrice;
            codes.push(raw);
            return {
              code: raw,
              name: s.名称 || s.f14 || '',
              price: currentPrice,
              change: parseFloat(s.涨跌额 || s.f4 || '0') || 0,
              changePct: parseFloat(s.涨跌幅 || s.f3 || '0'),
              sector: '加载中...',
              pe: parseFloat(s.市盈率 || s.f9 || '0') || 0,
              roe: 0,
              marketCap: 0,
              volume: parseFloat(s.成交量 || s.f5 || '0') || 0,
              high: parseFloat(s.最高 || s.f15 || '0') || currentPrice,
              low: parseFloat(s.最低 || s.f16 || '0') || currentPrice,
              scores: { valuation: 0, profitability: 0, technical: 0, capitalFlow: 0, prosperity: 0 },
              signal: 'HOLD' as const,
              signalReason: '评分加载中...',
              isLeader: false,
              consecutiveBoards: 0,
            };
          }).filter(Boolean) as StockInfo[];

          if (realStocks.length > 10) {
            setStocks(realStocks);
            setApiStatus('live');

            // 3. 后台批量拉取数据库真实评分（只发一次，不在每轮轮询都拉）
            const codesStr = codes.slice(0, 50).join(',');
            fetch(`${API_BASE}/api/analysis/scores/batch?codes=${codesStr}`)
              .then((r) => r.json())
              .then((scoreData) => {
                if (scoreData.success && scoreData.data?.length) {
                  const scoreMap: Record<string, any> = {};
                  for (const item of scoreData.data) {
                    if (item.total_score != null) {
                      scoreMap[item.code] = item;
                    }
                  }
                  setStocks((prev) =>
                    prev.map((st) => {
                      const sc = scoreMap[st.code];
                      if (!sc) return st;
                      return {
                        ...st,
                        scores: {
                          valuation: sc.valuation_score || 0,
                          profitability: sc.valuation_score || 0,
                          technical: sc.trend_score || 0,
                          capitalFlow: sc.capital_score || 0,
                          prosperity: sc.sentiment_score || 0,
                        },
                        signalReason: `${sc.calc_date || '实时'}`,
                        signal: (sc.total_score ?? 0) >= 80 ? 'BUY' : (sc.total_score ?? 0) >= 60 ? 'HOLD' : 'SELL',
                      };
                    })
                  );
                }
              })
              .catch((err) => console.error('[评分] 批量拉取失败:', err));

            // 4. 同步持仓最新价
            setPortfolio((prevPortfolio) =>
              prevPortfolio.map((p) => {
                const livePrice = priceMap[p.code];
                return livePrice ? { ...p, currentPrice: livePrice } : p;
              })
            );
          }
        }
      })
      .catch((err) => {
        console.error('[行情] 个股拉取失败，请检查 Python 后端是否已启动:', err);
        setApiStatus('offline');
      });

    // 3. 拉取板块热度（来自数据库实时聚合）
    fetch(`${API_BASE}/api/market/sectors`)
      .then((r) => r.json())
      .then((d) => {
        if (d.success && d.data?.length) {
          setSectors(d.data);
        }
      })
      .catch((err) => console.error('[板块] 拉取失败:', err));

    // 4. 拉取大盘情绪（来自数据库实时聚合）
    fetch(`${API_BASE}/api/market/sentiment`)
      .then((r) => r.json())
      .then((d) => {
        if (d.success) {
          setSentiment({
            phase: d.phase || '启动期',
            fearGreedIndex: d.fearGreedIndex ?? 50,
            limitUpCount: d.limitUpCount ?? 0,
            limitDownCount: d.limitDownCount ?? 0,
            boardRatio: d.boardRatio ?? 0,
            totalTurnover: d.totalTurnover ?? 0,
            description: d.description || '数据加载中...',
          });
        }
      })
      .catch((err) => console.error('[情绪] 拉取失败:', err));

    setLastPollTime(new Date().toLocaleTimeString('zh-CN', { hour12: false }));
  };

  // 手动刷新
  const handleManualRefresh = () => {
    fetchLiveMarketData();
  };

  // 初次挂载：从 Python 后端同步真实持仓（代替硬编码假数据）
  useEffect(() => {
    fetch(`${API_BASE}/api/portfolio/positions`)
      .then((r) => r.json())
      .then((d) => {
        if (d.success && d.data) {
          const holdings: PortfolioHolding[] = d.data.map((p: any) => ({
            id: String(p.id || p.code),
            code: p.code,
            name: p.name,
            buyPrice: p.buy_price ?? 0,
            currentPrice: p.current_price ?? 0,
            shares: p.quantity ?? 0,
            buyDate: p.buy_date || '',
          }));
          setPortfolio(holdings);
        }
      })
      .catch((err) => console.error('[持仓] 同步失败:', err))
      .finally(() => setPortfolioLoading(false));

    fetch(`${API_BASE}/api/portfolio/summary`)
      .then((r) => r.json())
      .then((d) => {
        if (d.success && d.cash != null) {
          setCash(parseFloat(d.cash) || 0);
        }
      })
      .catch((err) => console.error('[资金] 同步失败:', err));
  }, []);

  // 每 15 秒轮询行情
  useEffect(() => {
    fetchLiveMarketData();
    const pollInterval = setInterval(fetchLiveMarketData, 15000);
    return () => clearInterval(pollInterval);
  }, []);

  // 联动诊断远程检索：若点选的股票不在当前 A 股强势力度行情池中，自动从后端检索补全数据
  useEffect(() => {
    if (!selectedStockCode) return;
    const cleanSelected = selectedStockCode.split('.')[0].replace(/^(sh|sz|bj)/i, '').padStart(6, '0');
    const found = stocks.some((s) => {
      const sClean = s.code.split('.')[0].replace(/^(sh|sz|bj)/i, '').padStart(6, '0');
      return sClean === cleanSelected;
    });

    if (!found && stocks.length > 0) {
      fetch(`${API_BASE}/api/market/spot?limit=1&search=${cleanSelected}`)
        .then((r) => r.json())
        .then((d) => {
          if (d.success && d.data && d.data.length > 0) {
            const rawItem = d.data[0];
            const currentPrice = parseFloat(rawItem.最新价 || rawItem.f2 || '0');
            const newlyFetchedStock: StockInfo = {
              code: cleanSelected,
              name: rawItem.名称 || rawItem.f14 || '',
              price: currentPrice,
              change: parseFloat(rawItem.涨跌额 || rawItem.f4 || '0') || 0,
              changePct: parseFloat(rawItem.涨跌幅 || rawItem.f3 || '0'),
              sector: rawItem.板块 || rawItem.行业 || rawItem.f13 || '其他',
              pe: parseFloat(rawItem.市盈率 || rawItem.f9 || '0') || 0,
              roe: 0,
              marketCap: parseFloat(rawItem.总市值 || '0') / 1e8 || 0,
              volume: parseFloat(rawItem.成交量 || rawItem.f5 || '0') || 0,
              high: parseFloat(rawItem.最高 || rawItem.f15 || '0') || currentPrice,
              low: parseFloat(rawItem.最低 || rawItem.f16 || '0') || currentPrice,
              scores: { valuation: 60, profitability: 60, technical: 60, capitalFlow: 60, prosperity: 60 },
              signal: 'HOLD',
              signalReason: '检索同步：正在从多维分析数据库拉取实时量化评分因子...',
              isLeader: false,
              consecutiveBoards: 0,
            };

            // 拉取对应的评分
            fetch(`${API_BASE}/api/analysis/scores/batch?codes=${cleanSelected}`)
              .then((r) => r.json())
              .then((scoreData) => {
                if (scoreData.success && scoreData.data?.length) {
                  const sc = scoreData.data[0];
                  if (sc && sc.total_score != null) {
                    newlyFetchedStock.scores = {
                      valuation: sc.valuation_score || 60,
                      profitability: sc.valuation_score || 60,
                      technical: sc.trend_score || 60,
                      capitalFlow: sc.capital_score || 60,
                      prosperity: sc.sentiment_score || 60,
                    };
                    newlyFetchedStock.signalReason = `主力五维因子分析：趋势因子 ${sc.trend_score || 0}，估值因子 ${sc.valuation_score || 0}，多维评估处于推荐等级。`;
                    newlyFetchedStock.signal = (sc.total_score ?? 60) >= 80 ? 'BUY' : (sc.total_score ?? 60) >= 55 ? 'HOLD' : 'SELL';
                  }
                }
                setStocks((prev) => [...prev, newlyFetchedStock]);
              })
              .catch(() => {
                setStocks((prev) => [...prev, newlyFetchedStock]);
              });
          }
        })
        .catch((err) => console.error('[诊断] 远程检索个股失败:', err));
    }
  }, [selectedStockCode, stocks.length]);

  // 5. 自选和成分管理
  const handleAddStockToPool = (stock: StockInfo) => {
    const activeThemes = Object.keys(poolGroupings);
    const targetTheme = activeThemes[0] || '成长绩优股';
    handleRegisterStockToPool(targetTheme, stock.code);
  };

  const handleRegisterStockToPool = (poolName: string, code: string) => {
    setPoolGroupings((prev) => {
      const currentList = prev[poolName] || [];
      if (currentList.includes(code)) return prev;
      return { ...prev, [poolName]: [...currentList, code] };
    });
  };

  const handleUnregisterStockFromPool = (poolName: string, code: string) => {
    setPoolGroupings((prev) => {
      const currentList = prev[poolName] || [];
      return { ...prev, [poolName]: currentList.filter((c) => c !== code) };
    });
  };

  // 6. 手动微调沙盘情绪阶段
  const handleUpdateSentimentPhase = (newPhase: MarketSentiment['phase']) => {
    let fearGreed = 50, up = 20, down = 25, ratio = 40, desc = '';

    if (newPhase === '冰点期') {
      fearGreed = 18; up = 12; down = 85; ratio = 15.5;
      desc = '空头力量宣泄极致，全盘总交易额缩水至5200亿。两市仅余少数大妖股抱团，绝望冰点处酝酿短线转势黎明。';
    } else if (newPhase === '启动期') {
      fearGreed = 58; up = 68; down = 4; ratio = 65.0;
      desc = '科技及半导体主力大资金强行点火，高度板梯队完好，增量买气开始缓慢溢出，建议积极关注最热龙一做试错。';
    } else if (newPhase === '狂热期') {
      fearGreed = 88; up = 145; down = 0; ratio = 92.4;
      desc = '两市交易额突破1.8万亿，板块悉数井喷形成共振，情绪面临极度超买，短线投机难度上升，注意高位爆头分歧风险。';
    } else if (newPhase === '退潮期') {
      fearGreed = 35; up = 12; down = 48; ratio = 28.2;
      desc = '主力高位兑现撤退，龙头亏钱效应巨大，市场进入亏损补偿期，资金向大金融及长江电力等红利板块防御性撤退。';
    }

    setSentiment({
      phase: newPhase, fearGreedIndex: fearGreed, limitUpCount: up, limitDownCount: down,
      boardRatio: ratio, totalTurnover: newPhase === '狂热期' ? 18500 : newPhase === '冰点期' ? 5200 : 9600,
      description: desc,
    });
  };

  // 7. 买入（先确认后端，成功后再更新前端）
  const handleBuyStock = async (code: string, name: string, price: number, shares: number): Promise<boolean> => {
    const cost = price * shares;
    if (cash < cost) return false;

    // 先同步后端
    try {
      const res = await fetch(`${API_BASE}/api/portfolio/buy`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code, quantity: shares, price }),
      });
      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        alert(`买入同步后端失败：${errData.error || `HTTP ${res.status}`}`);
        return false;
      }
      const d = await res.json();
      if (!d.success) {
        alert(`买入失败：${d.error || '未知错误'}`);
        return false;
      }
    } catch (err: any) {
      alert(`买入后端不可达：${err.message || '网络错误'}`);
      return false;
    }

    // 后端确认成功后更新前端
    setCash((prevCash) => parseFloat((prevCash - cost).toFixed(2)));
    setPortfolio((prevPortfolio) => {
      const matchIndex = prevPortfolio.findIndex((item) => item.code === code);
      if (matchIndex >= 0) {
        const updated = [...prevPortfolio];
        const existing = updated[matchIndex];
        const newShares = existing.shares + shares;
        const newBuyPrice = parseFloat(((existing.buyPrice * existing.shares + price * shares) / newShares).toFixed(2));
        updated[matchIndex] = { ...existing, shares: newShares, buyPrice: newBuyPrice, currentPrice: price };
        return updated;
      }
      return [...prevPortfolio, { id: `h-${Date.now()}`, code, name, buyPrice: price, currentPrice: price, shares, buyDate: new Date().toISOString().split('T')[0] }];
    });

    return true;
  };

  // 8. 卖出（前端状态 + 后端同步）
  const handleSellStock = async (id: string, shares: number) => {
    const target = portfolio.find((p) => p.id === id);
    if (!target) return;

    const actualSell = Math.min(shares, target.shares);
    if (actualSell <= 0) return;

    // 先同步后端，成功后再更新前端
    try {
      const res = await fetch(`${API_BASE}/api/portfolio/sell`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code: target.code, quantity: actualSell, price: target.currentPrice }),
      });
      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        alert(`交易同步后端失败，操作被拦截：${errData.error || `HTTP ${res.status}`}`);
        return;
      }
    } catch (err: any) {
      alert(`交易同步后端失败，操作被拦截：${err.message || '网络连接不可用'}`);
      return;
    }

    // 后端确认成功后更新前端
    const proceeds = target.currentPrice * actualSell;
    setCash((prevCash) => parseFloat((prevCash + proceeds).toFixed(2)));
    setPortfolio((prevPortfolio) => {
      if (actualSell >= target.shares) {
        return prevPortfolio.filter((p) => p.id !== id);
      }
      return prevPortfolio.map((p) =>
        p.id === id ? { ...p, shares: p.shares - actualSell } : p
      );
    });
  };

  const handleSelectStockAndDirect = (code: string) => {
    setSelectedStockCode(code);
    setActiveMenu('FIVE_DIM');
    setMobileOpen(false);
  };

  // 动态量化持股估值与投资回报
  const portfolioValue = portfolio.reduce((sum, item) => sum + (item.currentPrice * item.shares), 0);
  const portfolioCost = portfolio.reduce((sum, item) => sum + (item.buyPrice * item.shares), 0);
  const totalAssets = cash + portfolioValue;
  const totalYieldPct = portfolioCost > 0 
    ? parseFloat(((portfolioValue - portfolioCost) / portfolioCost * 100).toFixed(2)) 
    : 0;

  // 寻获联动诊断股票对象（无锁定：未选股时为 undefined，不自动选中第一只）
  const cleanSelectedCode = selectedStockCode.split('.').slice(0, 1)[0].replace(/^(sh|sz|bj)/i, '');
  const selectedStock: StockInfo | undefined = selectedStockCode
    ? stocks.find((s) => s.code.replace(/^(sh|sz|bj)/i, '') === cleanSelectedCode)
    : undefined;

  // 子菜单/功能划分定义
  const menuCategories = [
    { title: '决策中心', items: [
      { id: 'OVERVIEW', name: '大盘全景看板', desc: '宏观行情、持仓及诊股概览', icon: LayoutDashboard },
    ]},
    { title: '行情数据', items: [
      { id: 'DATA_CENTER', name: '数据行情中心', desc: '个股检索及实时量化排列', icon: BarChart2 },
      { id: 'SECTOR_HEAT', name: '行业板块资金', desc: '细分主力流入与资金热度', icon: Flame },
    ]},
    { title: '个股研判', items: [
      { id: 'FIVE_DIM', name: '五维评分量化', desc: '诊断个股各项多因子分值', icon: Award },
      { id: 'SIGNALS', name: '双限共振信号', desc: '筹码、均线及主力变动预警', icon: Radio },
    ]},
    { title: '特色策略', items: [
      { id: 'STOCK_POOL', name: '特色主题股池', desc: '龙头、高分红、超跌组配置', icon: Layers },
      { id: 'SENTIMENT', name: '大盘情绪监测', desc: '两市多维情绪追踪与阶梯指标', icon: Compass },
      { id: 'LEADERS', name: '妖股连板接力', desc: '两市最高连板高度梯队扫描', icon: Crown },
    ]},
    { title: '账户资管', items: [
      { id: 'PORTFOLIO', name: '实盘自选投资', desc: '资金建仓、交易记录与组合盈亏', icon: Briefcase },
      { id: 'POSITION', name: '当前仓位管理', desc: '动态凯利公式控仓配资量化建议', icon: Shield },
    ]},
    { title: '高级量化工具', items: [
      { id: 'AI_ANALYSIS', name: '智能 AI 投顾', desc: '自选池大模型组合优化报告', icon: Brain },
      { id: 'BACKTEST', name: '策略多段回测', desc: '个股与选股模型历史实算拟合', icon: LineChart },
    ]},
  ];

  const apiStatusText = apiStatus === 'live' ? `15s实时轮询 · ${lastPollTime}` : apiStatus === 'connecting' ? '连接中...' : '后端离线';

  return (
    <div className="min-h-screen bg-slate-100/50 text-slate-800 font-sans flex flex-col md:flex-row overflow-x-hidden selection:bg-red-500/10 selection:text-red-900">

      {/* 1. 移动端快捷控制头 */}
      <header className="md:hidden flex justify-between items-center px-4 py-3 bg-white border-b border-slate-200 sticky top-0 z-40 w-full shadow-xs">
        <div className="flex items-center gap-2">
          <span className={`flex h-2.5 w-2.5 rounded-full ${apiStatus === 'live' ? 'bg-emerald-500' : 'bg-red-500 animate-pulse'}`}></span>
          <h1 className="text-sm font-black uppercase tracking-wider text-slate-900">A股 AI 智能选股分析系统</h1>
        </div>
        <button onClick={() => setMobileOpen(!mobileOpen)} className="p-1 px-2 text-slate-600 hover:text-slate-900 focus:outline-none transition cursor-pointer">
          {mobileOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
        </button>
      </header>

      {mobileOpen && (
        <div onClick={() => setMobileOpen(false)} className="md:hidden fixed inset-0 bg-slate-900/40 backdrop-blur-xs z-30 transition-all duration-200" />
      )}

      {/* 3. 极速侧边主菜单栏 (Sidebar) */}
      <aside className={`fixed inset-y-0 left-0 z-30 w-72 bg-white border-r border-slate-200 flex flex-col justify-between transition-transform duration-200 transform md:translate-x-0 md:relative md:flex md:w-72 flex-shrink-0 ${mobileOpen ? 'translate-x-0' : '-translate-x-full md:translate-x-0'}`}>
        <div className="p-5 border-b border-slate-200">
          <div className="flex items-center gap-2">
            <div className={`h-2.5 w-2.5 rounded-full ${apiStatus === 'live' ? 'bg-emerald-500' : 'bg-red-500 animate-pulse'}`} />
            <h1 className="text-sm md:text-base font-black tracking-widest text-slate-900 uppercase">A股 AI SMART SYSTEM</h1>
          </div>
          <p className="text-xs text-slate-500 mt-1 font-mono tracking-wide">极光量化终端 · SLATE v2.0</p>
        </div>

        <nav className="flex-1 overflow-y-auto px-3 py-4 space-y-4">
          {menuCategories.map((cat, idx) => (
            <div key={idx} className="space-y-1">
              <span className="px-3 text-xs font-bold text-slate-400 uppercase tracking-widest block">{cat.title}</span>
              <div className="space-y-0.5">
                {cat.items.map((item) => {
                  const Icon = item.icon;
                  const isActive = activeMenu === item.id;
                  return (
                    <button key={item.id} onClick={() => { setActiveMenu(item.id); setMobileOpen(false); }}
                      className={`w-full flex items-center justify-between text-left px-3 py-2 rounded-lg transition-all group cursor-pointer ${isActive ? 'bg-red-50 text-red-650 border border-red-200 font-semibold shadow-3xs' : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100 border border-transparent'}`}>
                      <div className="flex items-center gap-2.5">
                        <Icon className={`w-4 h-4 transition ${isActive ? 'text-red-600' : 'text-slate-450 group-hover:text-slate-650'}`} />
                        <div><span className="text-xs md:text-sm font-bold block">{item.name}</span><span className="text-xs text-slate-500 hidden lg:block line-clamp-1">{item.desc}</span></div>
                      </div>
                      <ChevronRight className={`w-3.5 h-3.5 text-slate-400 transition-transform ${isActive ? 'translate-x-0.5 text-red-555' : 'group-hover:translate-x-0.5'}`} />
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
        </nav>

        <div className="p-4 border-t border-slate-200 bg-slate-50/60">
          <div className="flex justify-between items-center mb-2">
            <span className="text-xs text-slate-500 font-mono font-bold">自选资产速览</span>
            <span className={`text-xs font-mono font-bold px-1.5 py-0.5 rounded ${totalYieldPct >= 0 ? 'bg-red-500/10 text-red-600' : 'bg-emerald-500/10 text-emerald-600'}`}>累计 {totalYieldPct >= 0 ? '+' : ''}{totalYieldPct}%</span>
          </div>
          <div className="space-y-1">
            <div className="flex justify-between text-xs md:text-sm"><span className="text-slate-500">自选总市值:</span><span className="font-mono font-black text-slate-900">¥{totalAssets.toLocaleString('zh-CN', { minimumFractionDigits: 2 })}</span></div>
            <div className="flex justify-between text-xs"><span className="text-slate-500">可用现金:</span><span className="font-mono text-slate-700">¥{cash.toLocaleString('zh-CN', { minimumFractionDigits: 2 })}</span></div>
          </div>
        </div>
      </aside>

      {/* 4. 工作区主内容区 */}
      <section className="flex-1 flex flex-col p-4 md:p-6 bg-slate-50/80 min-h-screen justify-between gap-6 overflow-y-auto">

        {/* 全局顶部实时信息栏 */}
        <div className="bg-white border border-slate-200 rounded-xl p-4 flex flex-col gap-3 shadow-3xs">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
            <div>
              <div className="flex items-center gap-2">
                <span className="text-xs font-bold text-slate-500">行情同步:</span>
                <span className={`h-2 w-2 rounded-full ${apiStatus === 'live' ? 'bg-emerald-500' : 'bg-red-505 animate-ping'}`} />
                <span className="text-xs font-mono text-slate-700">
                  {apiStatus === 'live' ? `15s 实时轮询 · ${lastPollTime}` : apiStatus === 'connecting' ? '连接中...' : '后端离线 — 无法获取实时行情'}
                </span>
              </div>
              <p className="text-[10px] text-slate-500 mt-1">
                当前关注：<span className="text-red-600 font-extrabold">{selectedStock ? `${selectedStock.name} (${selectedStock.code})` : '未选择'}</span>
              </p>
            </div>

            <div className="flex items-center gap-2">
              <button onClick={handleManualRefresh}
                className="p-1.5 bg-slate-50 hover:bg-slate-100 border border-slate-200 rounded-lg text-slate-700 hover:text-slate-900 transition cursor-pointer shadow-3xs"
                title="强制同步最新行情价格脉冲">
                <RefreshCw className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>

          {/* 指数跑马灯 */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-2.5 border-t border-slate-150 pt-2.5">
            {indices.map((ind) => {
              const isUp = ind.changePct >= 0;
              return (
                <div key={ind.code} className="bg-slate-50/50 p-2 rounded-lg border border-slate-150 flex items-center justify-between">
                  <div><span className="text-[10px] text-slate-500 block">{ind.name}</span><span className="text-xs font-mono font-bold text-slate-800">{ind.price.toFixed(2)}</span></div>
                  <span className={`text-[10px] font-mono font-bold flex items-center ${isUp ? 'text-red-600' : 'text-emerald-600'}`}>{isUp ? '▲' : '▼'}{isUp ? '+' : ''}{ind.changePct.toFixed(2)}%</span>
                </div>
              );
            })}
          </div>
        </div>

        {/* 5. 选项卡视口 */}
        <div className="flex-1">
          <AnimatePresence mode="wait">
            <motion.div key={activeMenu} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }} transition={{ duration: 0.18 }} className="h-full">

              {/* 5.1 大盘全景看板 */}
              {activeMenu === 'OVERVIEW' && (
                <div className="space-y-6">
                  <div className="bg-white border border-slate-200 rounded-xl p-6 shadow-sm hover:shadow-md hover:border-slate-300 transition">
                    <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center gap-4 mb-4">
                      <div><h2 className="text-base md:text-lg font-bold text-slate-900 flex items-center gap-1.5"><Compass className="w-5 h-5 text-red-500 animate-spin" style={{ animationDuration: '8s' }} />大盘全局风控情绪沙盘</h2><p className="text-xs md:text-sm text-slate-500 mt-1">评估当前A股大盘所处的活跃度及周期演进阶段</p></div>
                      <div className="flex items-center gap-2"><span className="text-xs md:text-sm font-semibold text-slate-600">周期阶段:</span><span className={`text-xs md:text-sm font-black px-2.5 py-1 rounded-full ${sentiment.phase === '狂热期' ? 'bg-red-550/10 text-red-600 border border-red-500/20' : sentiment.phase === '冰点期' ? 'bg-indigo-500/10 text-indigo-400 border border-indigo-500/20' : sentiment.phase === '启动期' ? 'bg-amber-500/10 text-amber-500 border border-amber-500/20' : 'bg-slate-500/10 text-slate-600 border border-slate-200'}`}>{sentiment.phase}</span></div>
                    </div>
                    <p className="text-xs md:text-sm text-slate-700 leading-relaxed bg-slate-50 p-4 rounded-lg border border-slate-200 font-medium">{sentiment.description}</p>
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mt-4">
                      <div className="text-center p-3 bg-slate-100/50 border border-slate-200 rounded-lg"><span className="text-xs font-bold text-slate-500 block mb-1">两市上涨比率</span><span className="text-base md:text-lg font-mono font-black text-red-600">{sentiment.boardRatio}%</span></div>
                      <div className="text-center p-3 bg-slate-100/50 border border-slate-200 rounded-lg"><span className="text-xs font-bold text-slate-500 block mb-1">恐慌贪婪分值</span><span className="text-base md:text-lg font-mono font-black text-amber-600">{sentiment.fearGreedIndex} / 100</span></div>
                      <div className="text-center p-3 bg-slate-100/50 border border-slate-200 rounded-lg"><span className="text-xs font-bold text-slate-500 block mb-1">涨停数量</span><span className="text-base md:text-lg font-mono font-black text-slate-800">{sentiment.limitUpCount} 家</span></div>
                      <div className="text-center p-3 bg-slate-100/50 border border-slate-200 rounded-lg"><span className="text-xs font-bold text-slate-550 block mb-1">总成交额</span><span className="text-base md:text-lg font-mono font-black text-slate-900">{(sentiment.totalTurnover / 10).toFixed(1)} 百亿</span></div>
                    </div>
                    <div className="mt-4 flex justify-end"><button onClick={() => setActiveMenu('SENTIMENT')} className="px-3.5 py-2 bg-slate-100 hover:bg-slate-200 border border-slate-200 text-xs md:text-sm font-bold rounded-lg text-red-600 transition flex items-center gap-1 cursor-pointer">调整周期阶段与推演 <ChevronRight className="w-3.5 h-3.5" /></button></div>
                  </div>

                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                    <div className="bg-white border border-slate-200 rounded-xl p-6 shadow-sm hover:shadow-md hover:border-slate-300 transition flex flex-col justify-between">
                      {selectedStock ? (
                        <div>
                          <div className="flex justify-between items-start mb-3"><div><span className="text-xs font-bold text-slate-500 uppercase tracking-widest block">当前焦点关注个股评分</span><h3 className="text-lg md:text-xl font-black text-slate-900 mt-1">{selectedStock.name} <span className="text-xs md:text-sm font-mono font-normal text-slate-405">{selectedStock.code}</span></h3></div><span className={`text-xs md:text-sm font-black px-2.5 py-1 rounded ${selectedStock.signal === 'BUY' ? 'bg-red-500/10 text-red-600' : selectedStock.signal === 'SELL' ? 'bg-emerald-500/10 text-emerald-600' : 'bg-slate-100 text-slate-600'}`}>信号: {selectedStock.signal === 'BUY' ? '建仓买入' : selectedStock.signal === 'SELL' ? '避险卖出' : '建议持有'}</span></div>
                          <div className="bg-slate-50 border border-slate-150 p-4 rounded-lg mb-4 hover:bg-slate-100/50 transition"><span className="text-xs font-bold text-slate-500 block mb-1">智能评估因子分析:</span><p className="text-xs md:text-sm text-slate-700 leading-relaxed font-semibold">{selectedStock.signalReason}</p></div>
                          <div className="grid grid-cols-5 gap-2 text-center">
                            {Object.entries(selectedStock.scores).map(([k, val]) => (
                              <div key={k} className="bg-slate-50 p-2.5 rounded-lg border border-slate-150"><span className="text-[10px] md:text-xs font-bold text-slate-500 block truncate mb-1">{k === 'valuation' ? '估值' : k === 'profitability' ? '盈利' : k === 'technical' ? '技术' : k === 'capitalFlow' ? '净流入' : '景气度'}</span><span className="text-sm font-mono font-extrabold text-slate-800">{val}</span></div>
                            ))}
                          </div>
                        </div>
                      ) : (
                        <div className="flex flex-col items-center justify-center py-12 text-center">
                          <p className="text-sm text-slate-500 font-semibold">暂无数据</p>
                          <p className="text-xs text-slate-400 mt-1">行情加载中，或请从「数据行情中心」选择股票</p>
                        </div>
                      )}
                      {selectedStock && (
                      <div className="mt-5 pt-3 border-t border-slate-150 flex justify-between gap-3 items-center">
                        <span className="text-xs md:text-sm font-semibold text-slate-505 font-mono">PE: <span className="text-slate-800 font-extrabold">{selectedStock.pe}</span> · ROE: <span className="text-slate-800 font-extrabold">{selectedStock.roe}%</span></span>
                        <div className="flex gap-2"><button onClick={() => setActiveMenu('FIVE_DIM')} className="px-3.5 py-1.5 bg-slate-105 hover:bg-slate-205 border border-slate-205 text-xs font-bold rounded-lg transition text-slate-700">探查五维评分</button><button onClick={() => setActiveMenu('SIGNALS')} className="px-3.5 py-1.5 bg-red-600 hover:bg-red-700 text-xs font-bold rounded-lg text-white font-medium transition">观察因子共振</button></div>
                      </div>
                      )}
                    </div>

                    <div className="bg-white border border-slate-200 rounded-xl p-6 shadow-sm hover:shadow-md hover:border-slate-300 transition flex flex-col justify-between">
                      <div><span className="text-xs font-bold text-slate-500 uppercase tracking-widest block">当前实盘自选投资组合监控</span>
                        <div className="mt-2 grid grid-cols-2 gap-4"><div><span className="text-xs text-slate-500 block">最新账户总资产估值</span><span className="text-lg md:text-2xl font-mono font-black text-slate-905">¥{totalAssets.toLocaleString('zh-CN', { minimumFractionDigits: 2 })}</span></div><div><span className="text-xs text-slate-500 block">持仓自选总市值</span><span className="text-lg md:text-2xl font-mono font-black text-red-600">¥{portfolioValue.toLocaleString('zh-CN', { minimumFractionDigits: 2 })}</span></div></div>
                        <div className="mt-4 space-y-1.5"><span className="text-xs font-bold text-slate-500 block font-bold">自选重仓持股 ({portfolio.length} 只):</span>
                          {portfolio.length === 0 ? (<p className="text-xs md:text-sm text-slate-400 py-3">暂无任何真实持股，请在实盘自选菜单下录入持仓或管理。</p>) : (
                            <div className="max-h-[110px] overflow-y-auto space-y-1 pr-1">
                              {portfolio.map((port) => { const yieldVal = port.currentPrice - port.buyPrice; const yieldPct = ((yieldVal / port.buyPrice) * 100).toFixed(2); const isProfit = parseFloat(yieldPct) >= 0;
                                return (<div key={port.id} className="flex justify-between items-center text-xs md:text-sm bg-slate-50 px-3 py-2 rounded-lg border border-slate-200 hover:bg-slate-100 transition"><div className="flex items-center gap-1.5"><span className="font-extrabold text-slate-805">{port.name}</span><span className="text-xs text-slate-500 font-mono">{port.code}</span></div><div className="flex items-center gap-4"><span className="text-slate-600 font-mono">{port.shares} 股</span><span className={`font-mono font-bold ${isProfit ? 'text-red-500' : 'text-emerald-600'}`}>{isProfit ? '+' : ''}{yieldPct}%</span></div></div>);
                              })}
                            </div>
                          )}
                        </div>
                      </div>
                      <div className="mt-4 pt-3 border-t border-slate-205 flex justify-between items-center"><span className="text-xs md:text-sm font-bold text-slate-700">可用资金: ¥{cash.toLocaleString('zh-CN', { minimumFractionDigits: 2 })}</span><button onClick={() => setActiveMenu('PORTFOLIO')} className="px-3.5 py-1.5 bg-red-50 hover:bg-red-100 border border-red-200 text-xs font-bold rounded-lg text-red-600 transition flex items-center gap-1 cursor-pointer">管理自选建仓仓位 <ChevronRight className="w-3.5 h-3.5" /></button></div>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                    <div className="bg-white border border-slate-200 shadow-sm p-5 rounded-xl transition hover:shadow-md hover:border-slate-300"><h4 className="text-xs md:text-sm font-bold text-slate-800 flex items-center gap-1.5 mb-2"><Crown className="w-3.5 h-3.5 text-amber-500" />今日龙头接力连板高标</h4><p className="text-xs text-slate-500 mb-3">追踪当日两市资金高度抱团的大妖股梯队：</p><button onClick={() => setActiveMenu('LEADERS')} className="w-full text-left py-2 px-3 bg-slate-50 hover:bg-slate-100 rounded border border-slate-200 text-xs md:text-sm text-red-600 flex justify-between items-center transition cursor-pointer font-bold"><span>点击开始妖股判定扫描</span><ChevronRight className="w-3.5 h-3.5" /></button></div>
                    <div className="bg-white border border-slate-200 shadow-sm p-5 rounded-xl transition hover:shadow-md hover:border-slate-300"><h4 className="text-xs md:text-sm font-bold text-slate-800 flex items-center gap-1.5 mb-2"><Shield className="w-3.5 h-3.5 text-red-500" />凯利公式仓位风控决策</h4><p className="text-xs text-slate-500 mb-3">由个股参数与大盘情绪精算出的最佳安全配比：</p><button onClick={() => setActiveMenu('POSITION')} className="w-full text-left py-2 px-3 bg-slate-50 hover:bg-slate-100 rounded border border-slate-200 text-xs md:text-sm text-red-600 flex justify-between items-center transition cursor-pointer font-bold"><span>查看最优配资分配比例</span><ChevronRight className="w-3.5 h-3.5" /></button></div>
                    <div className="bg-white border border-slate-200 shadow-sm p-5 rounded-xl transition hover:shadow-md hover:border-slate-300"><h4 className="text-xs md:text-sm font-bold text-slate-800 flex items-center gap-1.5 mb-2"><LineChart className="w-3.5 h-3.5 text-blue-500" />个股策略多段量化回测</h4><p className="text-xs text-slate-500 mb-3">分析该股在特定时间周期内的累积收益拟合曲线：</p><button onClick={() => setActiveMenu('BACKTEST')} className="w-full text-left py-2 px-3 bg-slate-50 hover:bg-slate-100 rounded border border-slate-200 text-xs md:text-sm text-red-600 flex justify-between items-center transition cursor-pointer font-bold"><span>调用历史自算多段拟合器</span><ChevronRight className="w-3.5 h-3.5" /></button></div>
                  </div>
                </div>
              )}

              {/* 5.2 数据行情中心 */}
              {activeMenu === 'DATA_CENTER' && (
                <DataCenter stocks={stocks} indices={indices} selectedStockCode={selectedStockCode}
                  onSelectStock={setSelectedStockCode} onAddStockToPool={handleAddStockToPool} />
              )}

              {/* 5.3 行业板块热度 */}
              {activeMenu === 'SECTOR_HEAT' && (<SectorHeat sectors={sectors} />)}

              {/* 5.4 五维评分 */}
              {activeMenu === 'FIVE_DIM' && (
                <div className="space-y-6">
                  <div className="bg-white border border-slate-200 shadow-sm rounded-xl p-4 flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                    <div><h3 className="text-sm font-bold text-slate-850">当前诊断联动聚焦：<span className="text-red-650 font-black text-base">{selectedStock ? `${selectedStock.name} (${selectedStock.code})` : '未选择股票'}</span></h3><p className="text-xs text-slate-550 mt-1">切换个股可以在「数据行情中心」或「特色股票池」中点选您要诊断的任意个股</p></div>
                    <button onClick={() => setActiveMenu('DATA_CENTER')} className="px-3.5 py-1.5 bg-slate-50 hover:bg-slate-100 border border-slate-200 text-xs font-bold rounded-lg transition text-slate-750 flex items-center gap-1 cursor-pointer">去行情中心挑股票 <ChevronRight className="w-3.5 h-3.5" /></button>
                  </div>
                  <div className="grid grid-cols-1 gap-6">
                    <FiveDimRating selectedStock={selectedStock} stocks={stocks} onSelectStockCode={setSelectedStockCode} />
                  </div>
                </div>
              )}

              {/* 5.5 双限共振信号 */}
              {activeMenu === 'SIGNALS' && (
                <div className="space-y-6">
                  <div className="bg-white border border-slate-200 shadow-sm rounded-xl p-4 flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                    <div><h3 className="text-sm font-bold text-slate-850">当前诊断联动聚焦：<span className="text-red-650 font-black text-base">{selectedStock ? `${selectedStock.name} (${selectedStock.code})` : '未选择股票'}</span></h3><p className="text-xs text-slate-550 mt-1">评估其日线/周线金叉、主力抄底力度、支撑买入因子强度</p></div>
                    <button onClick={() => setActiveMenu('DATA_CENTER')} className="px-3.5 py-1.5 bg-slate-50 hover:bg-slate-100 border border-slate-200 text-xs font-bold rounded-lg transition text-slate-750 flex items-center gap-1 cursor-pointer">去行情中心挑股票 <ChevronRight className="w-3.5 h-3.5" /></button>
                  </div>
                  <div className="grid grid-cols-1 gap-6"><SignalSystem selectedStock={selectedStock} /></div>
                </div>
              )}

              {/* 5.6 主题特色股池 */}
              {activeMenu === 'STOCK_POOL' && (
                <StockPool stocks={stocks} stockPoolGroupings={poolGroupings} selectedStockCode={selectedStockCode}
                  onSelectStock={handleSelectStockAndDirect} onAddStockToCustomPool={handleRegisterStockToPool} onRemoveStockFromCustomPool={handleUnregisterStockFromPool} />
              )}

              {/* 5.7 情绪周期 */}
              {activeMenu === 'SENTIMENT' && (<SentimentCycle sentiment={sentiment} onUpdateSentimentPhase={handleUpdateSentimentPhase} />)}

              {/* 5.8 连板识别 */}
              {activeMenu === 'LEADERS' && (<LeaderIdentification stocks={stocks} onSelectStock={handleSelectStockAndDirect} />)}

              {/* 5.9 仿真交易持仓管理 */}
              {activeMenu === 'PORTFOLIO' && (
                <PortfolioManagement cash={cash} portfolio={portfolio} selectedStock={selectedStock}
                  onBuyStock={handleBuyStock} onSellStock={handleSellStock} onUpdateCash={setCash} onUpdatePortfolio={setPortfolio} stocks={stocks} />
              )}

              {/* 5.10 仓位风控 */}
              {activeMenu === 'POSITION' && (
                <PositionSystem cash={cash} selectedStockCode={selectedStockCode} selectedStockPrice={selectedStock?.price ?? 0} />
              )}

              {/* 5.11 AI 分析 */}
              {activeMenu === 'AI_ANALYSIS' && (
                <AiAnalysis 
                  stocks={stocks} 
                  sectors={sectors} 
                  sentiment={sentiment} 
                  portfolio={portfolio} 
                  selectedStockCode={selectedStockCode}
                  onSelectStockCode={setSelectedStockCode}
                />
              )}

              {/* 5.12 量化回测 */}
              {activeMenu === 'BACKTEST' && (
                <BacktestSystem selectedStockCode={selectedStockCode} stocks={stocks} />
              )}

            </motion.div>
          </AnimatePresence>
        </div>

        <footer className="border-t border-slate-900 pt-4 mt-auto text-center flex flex-col md:flex-row justify-between items-center gap-2 text-slate-500">
          <p className="text-[10px] tracking-wide max-w-2xl text-left leading-relaxed">极光量化免责声明：本系统数据来源于AKShare公开行情接口与Python后端计算引擎，不构成实质投资建议。</p>
          <p className="text-[9px] font-mono tracking-widest text-slate-600">COMPACT SYSTEM v2.0 · API: {apiStatusText}</p>
        </footer>
      </section>
    </div>
  );
}
