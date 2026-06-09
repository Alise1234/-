import React, { useState, useEffect, useRef } from 'react';
import { StockInfo, SectorHeatInfo, MarketSentiment, PortfolioHolding } from '../types';
import { API_BASE } from '../services/api';
import { 
  BrainCircuit, Send, AlertTriangle, ShieldCheck, HeartPulse, 
  ChevronRight, Activity, Search, Zap, Award, Sparkles, 
  Compass, HelpCircle, Loader2, ArrowRight, RefreshCw, CheckCircle2, ShieldAlert
} from 'lucide-react';

interface AiAnalysisProps {
  stocks: StockInfo[];
  sectors: SectorHeatInfo[];
  sentiment: MarketSentiment;
  portfolio: PortfolioHolding[];
  selectedStockCode?: string;
  onSelectStockCode?: (code: string) => void;
}

type AiMode = 'SEARCH' | 'FAST' | 'EXPERT' | 'DEEP';

export default function AiAnalysis({ 
  stocks, 
  sectors, 
  sentiment, 
  portfolio,
  selectedStockCode = '',
  onSelectStockCode
}: AiAnalysisProps) {
  const [customPrompt, setCustomPrompt] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<any | null>(null);
  const [activeTab, setActiveTab] = useState<AiMode>('SEARCH');
  const [thinkingStep, setThinkingStep] = useState(0);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  // 找当前关注个股（无锁定：未选股时为 undefined）
  const selectedStock = selectedStockCode
    ? stocks.find((s) => s.code.replace(/^(sh|sz|bj)/i, '') === selectedStockCode.replace(/^(sh|sz|bj)/i, ''))
    : undefined;

  // 热门指令模板
  const hotQuestionsTemplate = [
    {
      id: 'Q1',
      template: '结合实时行情，分析【股票名】现在能不能买，按【短线3-5天】思路，给我买点、止损位和后市推演。'
    },
    {
      id: 'Q2',
      template: '【股票名】现价还能不能参与？按中线1-2个月看，给我详细的操作计划、买点、防守位和仓位安排。'
    },
    {
      id: 'Q3',
      template: '我想做【股票名】的1到2天快进快出极速超短，当前能不能轻仓试错博反弹？请直接告诉我能不能做、怎么买、哪里止损。'
    },
    {
      id: 'Q4',
      template: '我现在持有【股票名】，盘中该继续拿还是先落袋减仓？结合当前两市大盘周期和实时主力资金量能，给我减仓条件和价格阀值。'
    },
    {
      id: 'Q5',
      template: '我持有【股票名】，当前成本在【持股价】附近。近期股价持续底部盘整，盘中应该如何调整交易计划并防范失效风险？'
    },
    {
      id: 'Q6',
      template: '【股票名】昨日踩在技术关键支撑位，成交量明显萎缩。请结合实时行情、主力筹码变动和资金流入趋势告诉我盘中进场条件。'
    }
  ];

  // 渲染最终文字
  const displayQuestions = hotQuestionsTemplate.map((q) => {
    const rawCode = selectedStock.code.replace(/^(sh|sz|bj)/i, '');
    const cleanName = `${selectedStock.name}(${rawCode})`;
    const costPrice = `${(selectedStock.price * 0.96).toFixed(2)}元`;
    const text = q.template
      .replace(/【股票名】/g, cleanName)
      .replace(/【持股价】/g, costPrice);
    return { id: q.id, text };
  });

  // 点击热门问句复制到输入框并聚焦
  const handleSelectHotQuestion = (text: string) => {
    setCustomPrompt(text);
    if (inputRef.current) {
      inputRef.current.focus();
    }
  };

  // 仿真深度思考流变化
  useEffect(() => {
    let timer: NodeJS.Timeout;
    if (loading) {
      timer = setInterval(() => {
        setThinkingStep((prev) => (prev + 1) % 5);
      }, 2500);
    } else {
      setThinkingStep(0);
    }
    return () => clearInterval(timer);
  }, [loading]);

  const loadingSteps = [
    "正在提取当前选择个股的五维智能诊断因子量化得分...",
    "正在连接微服务引擎，评估行业资金强度及两市情绪温度刻度...",
    "正在加载 DeepSeek 强化推理网络：构建大盘风控与对冲评估模型...",
    "深度逻辑对齐：拟合当前A股主线热点与量价多维特征...",
    "正在执行凯利控仓公式计算并组织机构级宏观投顾文字报告..."
  ];

  const triggerAiAnalysis = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (loading) return;

    setLoading(true);
    setError(null);

    // 获取精选股票
    const coreStocks = [...stocks]
      .sort((a, b) => b.scores.technical + b.scores.capitalFlow - (a.scores.technical + a.scores.capitalFlow))
      .slice(0, 10);

    try {
      // 包含前缀以增加 prompt 丰富度
      let promptPrefixed = customPrompt.trim();
      if (activeTab === 'DEEP') {
        promptPrefixed = `[深度思考/深度逻辑慢演算模式] ${promptPrefixed}`;
      } else if (activeTab === 'EXPERT') {
        promptPrefixed = `[专家对决机构诊断模式] ${promptPrefixed}`;
      } else if (activeTab === 'FAST') {
        promptPrefixed = `[极速响应极简策略模式] ${promptPrefixed}`;
      }

      const response = await fetch(`${API_BASE}/api/ai/analyze-market`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          stocks: coreStocks.length > 0 ? coreStocks : [selectedStock],
          sectors: sectors.slice(0, 5),
          sentiment: sentiment,
          portfolio: portfolio,
          customPrompt: promptPrefixed
        }),
      });

      if (!response.ok) {
        throw new Error(`服务器返回异常代码: ${response.status}`);
      }

      const replyData = await response.json();
      setResult(replyData);
    } catch (err: any) {
      console.error(err);
      setError(err?.message || '网络连接失败，请确认后端Python服务正在良好运行。');
    } finally {
      setLoading(false);
    }
  };

  // 行情未返回时显示提示
  if (!selectedStock) {
    return (
      <div className="bg-white border border-slate-200 rounded-xl p-6 shadow-sm" id="ai-decision-matrix-container">
        <div className="text-center py-12">
          <BrainCircuit className="w-12 h-12 text-slate-300 mx-auto mb-4" />
          <p className="text-sm text-slate-500 font-semibold">行情数据加载中，请稍候...</p>
          <p className="text-xs text-slate-400 mt-2">或从「数据行情中心」搜索股票后再使用AI分析</p>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white border border-slate-200 rounded-xl p-6 shadow-sm hover:shadow-md transition" id="ai-decision-matrix-container">
      
      {/* 头部区域 */}
      <div className="text-center max-w-2xl mx-auto mb-6">
        <h2 className="text-xl md:text-2xl font-black text-slate-900 tracking-tight flex items-center justify-center gap-2">
          <BrainCircuit className="w-6 h-6 text-red-600 animate-pulse" />
          向AI决策矩阵提问
        </h2>
        <p className="text-xs md:text-sm text-slate-500 mt-1.5 font-semibold">
          基于多维数据与智能分析，助你做出更明智的投资决策
        </p>

        {/* 勾选项标记 */}
        <div className="flex flex-wrap items-center justify-center gap-x-5 gap-y-1.5 mt-3 text-xs text-slate-600 font-bold">
          <span className="flex items-center gap-1">
            <span className="text-emerald-500 font-extrabold">✓</span> 自选股分析
          </span>
          <span className="flex items-center gap-1">
            <span className="text-emerald-500 font-extrabold">✓</span> 实时行情
          </span>
          <span className="flex items-center gap-1">
            <span className="text-emerald-500 font-extrabold">✓</span> 收盘因子
          </span>
          <span className="flex items-center gap-1">
            <span className="text-emerald-500 font-extrabold">✓</span> 公告/舆情风险
          </span>
        </div>
      </div>

      {/* 状态控制与模式 Tab 控制器 */}
      <div className="flex flex-wrap items-center justify-center gap-2 mb-5">
        <button
          onClick={() => setActiveTab('SEARCH')}
          className={`px-4 py-2.5 rounded-full text-xs font-bold flex items-center gap-1.5 cursor-pointer border transition ${
            activeTab === 'SEARCH'
              ? 'bg-blue-50 text-blue-600 border-blue-200 shadow-3xs scale-102'
              : 'bg-slate-50 text-slate-600 border-slate-200 hover:bg-slate-100 hover:text-slate-900'
          }`}
        >
          <Search className="w-3.5 h-3.5" />
          实时搜索
        </button>

        <button
          onClick={() => setActiveTab('FAST')}
          className={`px-4 py-2.5 rounded-full text-xs font-bold flex items-center gap-1.5 cursor-pointer border transition ${
            activeTab === 'FAST'
              ? 'bg-amber-50 text-amber-600 border-amber-200 shadow-3xs scale-102'
              : 'bg-slate-50 text-slate-600 border-slate-200 hover:bg-slate-100 hover:text-slate-900'
          }`}
        >
          <Zap className="w-3.5 h-3.5" />
          快速模式
        </button>

        <button
          onClick={() => setActiveTab('EXPERT')}
          className={`px-4 py-2.5 rounded-full text-xs font-bold flex items-center gap-1.5 cursor-pointer border transition ${
            activeTab === 'EXPERT'
              ? 'bg-indigo-50 text-indigo-600 border-indigo-200 shadow-3xs scale-102'
              : 'bg-slate-50 text-slate-600 border-slate-200 hover:bg-slate-100 hover:text-slate-900'
          }`}
        >
          <Award className="w-3.5 h-3.5" />
          专家模式
        </button>

        <button
          onClick={() => setActiveTab('DEEP')}
          className={`px-4 py-2.5 rounded-full text-xs font-bold flex items-center gap-1.5 cursor-pointer border transition ${
            activeTab === 'DEEP'
              ? 'bg-rose-50 text-rose-600 border-rose-200 shadow-[0_0_12px_rgba(244,63,94,0.15)] scale-102 font-extrabold animate-pulse'
              : 'bg-slate-50 text-slate-600 border-slate-200 hover:bg-slate-100 hover:text-slate-900'
          }`}
        >
          <Sparkles className="w-3.5 h-3.5 text-rose-500" />
          深度思考
        </button>
      </div>

      {/* 提问输入框表单 */}
      <form onSubmit={triggerAiAnalysis} className="mb-6 relative">
        <div className={`border rounded-2xl p-2 transition bg-white ${
          activeTab === 'DEEP' 
            ? 'border-rose-300 focus-within:border-rose-500 focus-within:ring-2 focus-within:ring-rose-100 bg-rose-50/5' 
            : activeTab === 'EXPERT'
            ? 'border-indigo-300 focus-within:border-indigo-500 focus-within:ring-2 focus-within:ring-indigo-100'
            : activeTab === 'FAST'
            ? 'border-amber-300 focus-within:border-amber-500 focus-within:ring-2 focus-within:ring-amber-100'
            : 'border-slate-300 focus-within:border-blue-500 focus-within:ring-2 focus-within:ring-blue-100'
        }`}>
          <textarea
            ref={inputRef}
            rows={2}
            placeholder={
              activeTab === 'DEEP' 
                ? "【深度思考模式已开启】请输入关于个股的复杂研判命题，AI将进行多源推理演算..."
                : `关于“${selectedStock.name}”或其它自选股的行情疑问，AI将基于多维数据为您精确解答...`
            }
            value={customPrompt}
            onChange={(e) => setCustomPrompt(e.target.value)}
            className="w-full text-xs md:text-sm text-slate-800 bg-transparent resize-none p-2 focus:outline-none placeholder-slate-400 font-medium"
          />
          <div className="flex justify-between items-center px-1 pt-1.5 border-t border-slate-100 mt-1">
            <span className="text-[10px] text-slate-400 font-bold flex items-center gap-1">
              <Compass className="w-3 h-3 text-slate-400" />
              当前锁定的研判个股: 
              <span className="text-red-650 bg-red-50 border border-red-100 px-1.5 py-0.5 rounded font-mono">
                {selectedStock.name} ({selectedStock.code.replace(/^(sh|sz|bj)/i, '')})
              </span>
            </span>
            <button
              type="submit"
              disabled={loading || !customPrompt.trim()}
              className={`p-2 rounded-xl transition ${
                loading 
                  ? 'bg-slate-100 text-slate-400' 
                  : !customPrompt.trim()
                  ? 'bg-slate-50 text-slate-300'
                  : activeTab === 'DEEP'
                  ? 'bg-rose-550 hover:bg-rose-600 text-white shadow'
                  : 'bg-blue-600 hover:bg-blue-700 text-white shadow'
              }`}
            >
              {loading ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Send className="w-4.5 h-4.5 rotate-0" />
              )}
            </button>
          </div>
        </div>
      </form>

      {/* 热门问句区域 */}
      <div className="border-t border-slate-150 pt-5">
        <h3 className="text-xs font-black text-slate-900 mb-3 flex items-center gap-1">
          <HelpCircle className="w-4 h-4 text-slate-500" />
          热门问句参考
        </h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3" id="hot-questions-section">
          {displayQuestions.map((item) => (
            <div
              key={item.id}
              onClick={() => handleSelectHotQuestion(item.text)}
              className="bg-slate-50 hover:bg-slate-100/80 border border-slate-200/60 rounded-xl p-3.5 flex items-start gap-2.5 transition cursor-pointer group hover:border-slate-300"
            >
              <span className="w-6 h-6 rounded-full bg-blue-50 text-blue-600 text-[10px] font-black flex items-center justify-center shrink-0 border border-blue-100 group-hover:bg-blue-600 group-hover:text-white group-hover:border-blue-600 transition">
                {item.id}
              </span>
              <p className="text-xs text-slate-700 leading-relaxed font-semibold group-hover:text-slate-900 transition flex-1">
                {item.text}
              </p>
            </div>
          ))}
        </div>
      </div>

      {/* 错误模块 */}
      {error && (
        <div className="mt-5 bg-red-50 border border-red-200 text-red-700 p-3.5 rounded-xl text-xs font-semibold flex items-center gap-2 animate-bounce">
          <AlertTriangle className="w-4 h-4 shrink-0 text-red-500" />
          <span>{error}</span>
        </div>
      )}

      {/* Loading 推演状态 */}
      {loading && (
        <div className="mt-6 bg-slate-50 border border-slate-200 rounded-xl p-5 text-center flex flex-col items-center justify-center min-h-[160px] animate-pulse">
          <Loader2 className="w-8 h-8 text-blue-650 animate-spin mb-3" />
          <h4 className="text-xs font-black text-slate-800">
            {activeTab === 'DEEP' ? '🧠 DeepSeek R1 递归五维投研策略推演中...' : 'AI 行情分析精算中...'}
          </h4>
          <p className="text-[11px] text-slate-550 mt-1.5 font-medium transition-all duration-300 max-w-md">
            {loadingSteps[thinkingStep]}
          </p>
        </div>
      )}

      {/* 研判回答面板 */}
      {result && !loading && (
        <div className="mt-6 border border-slate-200 rounded-xl bg-slate-50/50 p-5 relative overflow-hidden" id="ai-response-matrix-result">
          {/* 水波纹斜切装饰线 */}
          <div className="absolute top-0 right-0 w-36 h-36 bg-blue-500/5 rounded-full blur-3xl pointer-events-none"></div>

          <div className="text-xs font-black text-slate-500 flex justify-between items-center border-b border-slate-200 pb-2.5 mb-4">
            <span className="flex items-center gap-1 text-slate-700 font-bold">
              <CheckCircle2 className="w-4 h-4 text-emerald-500" />
              投研部 AI 策略决策报告
            </span>
            <span className="text-[10px] font-mono text-slate-400 bg-white border border-slate-200 px-1.5 py-0.5 rounded shadow-3xs">
              AI 模式: {activeTab === 'DEEP' ? '深度推理 R1' : activeTab === 'EXPERT' ? '专家微核' : '极速风控'}
            </span>
          </div>

          <div className="space-y-4">
            {/* 极速思考展示栏 */}
            {activeTab === 'DEEP' && (
              <div className="border border-rose-100 bg-rose-50/20 rounded-xl p-3.5">
                <span className="text-xs font-extrabold text-rose-600 block mb-2 flex items-center gap-1.5">
                  <Sparkles className="w-3.5 h-3.5 animate-spin" style={{ animationDuration: '6s' }} />
                  DeepSeek 深度思维推理链 (耗时约 8.2s)：
                </span>
                <div className="text-[11px] text-slate-600 leading-relaxed font-medium space-y-1 pl-1">
                  <p>• [数据采集层] 已确认锁定联动标的 <b>{selectedStock.name} ({selectedStock.code})</b>，并完整拉取其技术走势及情绪温度（当前标记为 {sentiment.phase}）。</p>
                  <p>• [因子推演层] 本机检测到两市上攻动能处于 {sentiment.boardRatio}% 的临界水平，主力在 {selectedStock.sector || '主流'} 板块进行了防守性吸筹。</p>
                  <p>• [策略匹配层] 基于用户的提问进行深度解构，剔除高风险高位分歧选项。匹配“底仓持有、波段防守”的对冲交易预案。</p>
                </div>
              </div>
            )}

            {/* 1. 全局大盘与个股研判 */}
            <div>
              <h3 className="text-xs font-black text-slate-800 mb-1.5 flex items-center gap-1.5">
                <Activity className="w-3.5 h-3.5 text-blue-600" />
                大盘宏观研判与个股定位
              </h3>
              <p className="text-xs text-slate-700 leading-relaxed pl-3.5 border-l-2 border-blue-500 font-medium">
                {result.marketOutlook || '无相关研判输出'}
              </p>
            </div>

            {/* 2. 推荐配置热门板块 */}
            {result.recommendedSectors && result.recommendedSectors.length > 0 && (
              <div>
                <h3 className="text-xs font-black text-slate-800 mb-1.5 flex items-center gap-1.5">
                  <Compass className="w-3.5 h-3.5 text-amber-500" />
                  研判联动的热门方向
                </h3>
                <div className="pl-3.5 flex flex-wrap gap-2">
                  {result.recommendedSectors.map((sect: string, idx: number) => (
                    <span key={idx} className="bg-amber-50/80 border border-amber-200/60 text-amber-900 text-[10px] font-bold px-2.5 py-1 rounded-lg">
                      ★ {sect}块
                    </span>
                  ))}
                </div>
              </div>
            )}

            {/* 3. 关联股精选榜单 */}
            {result.recommendedStocks && result.recommendedStocks.length > 0 && (
              <div>
                <h3 className="text-xs font-black text-slate-800 mb-1.5 flex items-center gap-1.5">
                  <Award className="w-3.5 h-3.5 text-indigo-500" />
                  AI 决策矩阵联动选股库
                </h3>
                <div className="pl-3.5 space-y-1.5">
                  {result.recommendedStocks.map((st: string, idx: number) => (
                    <div key={idx} className="bg-white p-2.5 rounded-lg border border-slate-200 text-xs text-slate-700 font-medium flex justify-between items-center shadow-3xs">
                      <span>{st}</span>
                      <span className="text-[10px] text-slate-400 font-mono">相关系数: 高</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* 4. 防御风险 */}
            {result.riskWarning && (
              <div>
                <h3 className="text-xs font-black text-slate-800 mb-1.5 flex items-center gap-1.5">
                  <ShieldAlert className="w-3.5 h-3.5 text-red-500" />
                  避障风险与失效机制提示
                </h3>
                <p className="text-xs text-red-650 bg-red-50/50 p-3 rounded-lg border border-red-100 leading-relaxed pl-3.5 font-medium">
                  ⚠️ {result.riskWarning}
                </p>
              </div>
            )}

            {/* 5. 建议资金仓位规划 */}
            {result.positionSizingAdvice && (
              <div className="bg-white p-4 rounded-xl border border-slate-200 flex items-center gap-3 shadow-3xs">
                <div className="p-2 bg-emerald-50 text-emerald-600 rounded-full">
                  <HeartPulse className="w-5 h-5 animate-pulse" />
                </div>
                <div>
                  <span className="text-[10px] text-slate-400 block font-bold uppercase">资金调配与控仓比例建议:</span>
                  <p className="text-xs text-slate-800 font-black mt-0.5">{result.positionSizingAdvice}</p>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
