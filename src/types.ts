export interface MarketIndex {
  name: string;
  code: string;
  price: number;
  change: number;
  changePct: number;
  volume: string;
}

export interface StockScores {
  valuation: number;          // 估值水平 (0-15)
  earningsQuality: number;    // 盈利质量 (0-20)
  growth: number;             // 成长性 (0-15)
  trend: number;              // 趋势评分 (0-15)
  momentum: number;           // 动量评分 (0-10)
  health: number;             // 财务健康 (0-10)
  consensus: number;          // 机构共识 (0-10)
  risk: number;               // 风险评分 (0-5)
}

export type TechnicalSignal = 'BUY' | 'SELL' | 'HOLD';

export interface StockInfo {
  code: string;
  name: string;
  price: number;
  change: number;
  changePct: number;
  sector: string;
  marketCap: number; // 亿
  pe: number;
  roe: number;
  volume: number; // 万手
  high: number;
  low: number;
  scores: StockScores;
  signal: TechnicalSignal;
  signalReason: string;
  isLeader: boolean;
  consecutiveBoards: number; // 连板天数
}

export interface SectorHeatInfo {
  name: string;
  changePct: number;       // 板块涨跌幅 (%)
  netInflow: number;       // 主力净流入估算（亿元）
  volumePct: number;       // 成交额占比
  leaders: string[];        // 龙头股票名称
  status: 'HOT' | 'STABLE' | 'COOL';
  momentumScore: number;     // 轮动评分 (0-100)
  alpha: number;           // Alpha 超额收益 (%)
  rank: number;             // 综合排名
  strength: '极强' | '强势' | '中性' | '弱势' | '极弱';
  capitalTrend: '流入' | '流出' | '平稳';
  historicalChange: number; // 近5日累计涨跌幅
  beatCount: number;        // 跑赢大盘天数 (近5日)
  marketAvgPct: number;     // 大盘平均涨跌幅
  stockCount: number;       // 成分股数量
}

export interface MarketSentiment {
  phase: '冰点期' | '启动期' | '狂热期' | '退潮期';
  fearGreedIndex: number; // 0 - 100
  limitUpCount: number;   // 涨停家数
  limitDownCount: number; // 跌停家数
  boardRatio: number;     // 连板晋级率 (%)
  totalTurnover: number;  // 全市场成交额（亿）
  description: string;
}

export interface PortfolioHolding {
  id: string;
  code: string;
  name: string;
  buyPrice: number;
  currentPrice: number;
  shares: number;
  buyDate: string;
}

export interface BacktestConfig {
  strategy: 'MA_CROSSOVER' | 'LOW_VALUATION' | 'LEADER_FOLLOW' | 'SENTIMENT_CYCLE';
  startDate: string;
  endDate: string;
  initialCapital: number;
  stopLossPct: number;
  takeProfitPct: number;
  targetType?: 'POOL' | 'STOCK';
  selectedStockCode?: string;
}

export interface BacktestDataPoint {
  date: string;
  strategyReturn: number; // %
  benchmarkReturn: number; // %
  capital: number;
}

export interface BacktestResult {
  totalReturn: number;     // %
  benchmarkReturn: number; // %
  winRate: number;         // %
  maxDrawdown: number;     // %
  tradeCount: number;
  chartData: BacktestDataPoint[];
  commentary?: string;
  tradeLogs?: Array<{
    date: string;
    type: '买入' | '卖出' | '止损' | '止盈' | '建仓';
    price: number;
    shares: number;
    profitPct?: number;
    reason: string;
  }>;
}

export interface AiAnalysisResult {
  marketOutlook: string;
  recommendedSectors: string[];
  recommendedStocks: string[];
  riskWarning: string;
  positionSizingAdvice: string;
}
