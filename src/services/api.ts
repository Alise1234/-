/**
 * A股AI选股系统 — 前端 API 服务层
 * 对接 FastAPI 后端 (默认 http://localhost:8000)
 *
 * 当前阶段：仅定义接口，供未来从 mockData 迁移到真实数据
 */

// ===== 配置 =====
// 本地开发：通过 Express 代理或直连 (默认空字符串由 Express 与 Vite 托管，或配置 VITE_API_BASE)
// 容器/AI Studio/本地开发兼容：设为空字符串 ""，以完美兼容 Express 的双轨制兜底
const API_BASE = (import.meta as any).env?.VITE_API_BASE ?? "";

// ===== 类型定义 =====

/** 实时行情股票数据（新浪数据源） */
export interface StockSpot {
  代码?: string;
  名称?: string;
  最新价?: string;
  涨跌幅?: string;
  涨跌额?: string;
  成交量?: string;
  成交额?: string;
  振幅?: string;
  最高?: string;
  最低?: string;
  今开?: string;
  昨收?: string;
  量比?: string;
  换手率?: string;
  市盈率?: string;
  市净率?: string;
}

/** 日K线数据 */
export interface StockDailyK {
  日期?: string;
  开盘?: string;
  收盘?: string;
  最高?: string;
  最低?: string;
  成交量?: string;
  成交额?: string;
  振幅?: string;
  涨跌幅?: string;
  涨跌额?: string;
  换手率?: string;
}

/** 五维评分 */
export interface StockScores {
  估值评分?: number;
  盈利能力评分?: number;
  技术面评分?: number;
  资金流向评分?: number;
  景气度评分?: number;
  综合评分?: number;
}

/** API 通用响应包装 */
export interface ApiResponse<T> {
  success: boolean;
  data: T[];
  count?: number;
  total?: number;
  error?: string;
  code?: string;
}

// ===== API 函数 =====

/**
 * 获取实时行情列表
 * @param limit 返回数量（默认20）
 */
export async function fetchStocks(limit = 20): Promise<ApiResponse<StockSpot>> {
  const res = await fetch(`${API_BASE}/api/market/spot?limit=${limit}`);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

/**
 * 获取单只股票历史日K线
 * @param code 股票代码（如 "600519"）
 * @param startDate 开始日期 YYYYMMDD
 * @param endDate 结束日期 YYYYMMDD
 * @param adjust 复权类型: qfq | hfq | ''
 */
export async function fetchStockDaily(
  code: string,
  startDate?: string,
  endDate?: string,
  adjust = "qfq"
): Promise<ApiResponse<StockDailyK>> {
  const params = new URLSearchParams();
  if (startDate) params.append("start_date", startDate);
  if (endDate) params.append("end_date", endDate);
  if (adjust) params.append("adjust", adjust);

  const query = params.toString();
  const url = `${API_BASE}/api/market/daily/${code}${query ? "?" + query : ""}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

/**
 * 获取五维评分（P2阶段实现）
 * @param code 股票代码
 */
export async function fetchStockScores(code: string): Promise<ApiResponse<StockScores>> {
  const res = await fetch(`${API_BASE}/api/analysis/scores/${code}`);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

/**
 * 后端健康检查
 */
export async function fetchHealth(): Promise<{ status: string; service: string; version: string }> {
  const res = await fetch(`${API_BASE}/`);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

export { API_BASE };
