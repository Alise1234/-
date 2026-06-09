"""
七维量化评分引擎 V5.0 — 基本面驱动 + 技术面辅助

维度权重 (基本面55% + 市场行为30% + 情绪共识15%):
  估值评分        15% — 行业相对PE/PB + PEG
  盈利质量        20% — ROE + 经营现金流/利润 + 毛利率稳定性
  成长性          15% — 营收3年CAGR + 净利增速 + 研发费用率
  趋势评分        15% — MA排列 + MACD + RSI
  动量评分        10% — 量比 + 换手率 + 相对强弱
  财务健康        10% — 资产负债率 + 流动比率 + 利息覆盖
  机构共识        10% — 北向资金 + 融资余额变化
  风险评分         5% — 最大回撤 + 波动率

设计原则:
  1. 基本面优先: 估值+盈利+成长+财务=60分, 技术面=30分, 情绪=10分
  2. 所有基本面数据优先从 akshare 拉取真实财报
  3. 缺失数据用保守代理（不给虚假高分）
  4. PE/PB 与申万行业中位数比较
"""
import pandas as pd
import numpy as np
from typing import Dict, Optional, Tuple

# akshare 延迟导入（避免未安装时崩溃）
_ak = None

def _get_ak():
    global _ak
    if _ak is None:
        try:
            import akshare as ak
            _ak = ak
        except ImportError:
            pass
    return _ak


def _clip(v, lo, hi):
    return max(lo, min(hi, float(v)))


# ============================================================
#  行业估值基准
# ============================================================
INDUSTRY_MEDIAN = {
    "银行": (5.2, 0.55), "非银金融": (14.0, 1.3), "房地产": (18.0, 1.0),
    "建筑装饰": (12.0, 1.1), "建筑材料": (18.0, 1.8), "钢铁": (15.0, 0.9),
    "有色金属": (22.0, 2.1), "基础化工": (25.0, 2.0), "石油石化": (12.0, 1.2),
    "煤炭": (8.0, 1.1), "电力设备": (28.0, 2.8), "机械设备": (30.0, 2.5),
    "国防军工": (55.0, 3.5), "汽车": (25.0, 2.2), "家用电器": (16.0, 2.4),
    "食品饮料": (28.0, 5.0), "纺织服饰": (22.0, 2.0), "轻工制造": (28.0, 2.0),
    "农林牧渔": (35.0, 2.8), "医药生物": (35.0, 3.5), "电子": (45.0, 3.5),
    "计算机": (50.0, 3.8), "通信": (25.0, 2.0), "传媒": (30.0, 2.5),
    "公用事业": (18.0, 1.5), "交通运输": (18.0, 1.5), "商贸零售": (30.0, 2.0),
    "社会服务": (35.0, 3.0), "环保": (22.0, 1.8), "美容护理": (40.0, 4.5),
}
DEFAULT_PE_MEDIAN = 28.0
DEFAULT_PB_MEDIAN = 2.2


def _get_industry_median(industry: str) -> Tuple[float, float]:
    if not industry:
        return DEFAULT_PE_MEDIAN, DEFAULT_PB_MEDIAN
    for key, (pe, pb) in INDUSTRY_MEDIAN.items():
        if key in industry or industry in key:
            return pe, pb
    return DEFAULT_PE_MEDIAN, DEFAULT_PB_MEDIAN


# ============================================================
#  财报数据拉取器
# ============================================================
def _fetch_financials(code: str) -> Dict:
    """
    从 akshare + 数据库 拉取基本面数据
    返回: {roe, gross_margin, net_margin, debt_ratio, current_ratio,
            op_cash_flow, net_profit, revenue_3y_cagr, r_and_d_pct}
    """
    result = {}

    # 1. 先从数据库取
    try:
        from database import SessionLocal
        from models import StockBasic
        db = SessionLocal()
        stock = db.query(StockBasic).filter(StockBasic.code == code).first()
        db.close()
        if stock:
            for f in ["roe", "gross_margin", "net_margin"]:
                v = getattr(stock, f, None)
                if v is not None:
                    result[f] = float(v)
    except Exception:
        pass

    # 2. 从 akshare 拉取
    ak = _get_ak()
    if ak and code:
        try:
            # 拉近3年财务摘要
            fin = ak.stock_financial_abstract_ths(symbol=code, indicator="按报告期")
            if fin is not None and len(fin) > 0:
                latest = fin.iloc[0]
                # ROE
                if "roe" not in result:
                    roe_raw = latest.get("净资产收益率", latest.get("ROE", None))
                    if roe_raw and float(roe_raw) > 0:
                        result["roe"] = float(roe_raw)
                # 毛利率
                if "gross_margin" not in result:
                    gm = latest.get("销售毛利率", latest.get("毛利率", None))
                    if gm:
                        result["gross_margin"] = float(gm)
                # 净利率
                if "net_margin" not in result:
                    nm = latest.get("销售净利率", latest.get("净利率", None))
                    if nm:
                        result["net_margin"] = float(nm)
                # 资产负债率
                dr = latest.get("资产负债率", latest.get("负债率", None))
                if dr:
                    result["debt_ratio"] = float(dr)
                # 流动比率
                cr = latest.get("流动比率", None)
                if cr:
                    result["current_ratio"] = float(cr)

                # 多期数据计算成长性
                if len(fin) >= 3:
                    revs = []
                    profits = []
                    for i in range(min(3, len(fin))):
                        r = fin.iloc[i]
                        rev = r.get("营业总收入", r.get("营业收入", None))
                        np_val = r.get("净利润", r.get("归属母公司净利润", None))
                        if rev:
                            revs.append(float(rev))
                        if np_val:
                            profits.append(float(np_val))
                    # 营收3年CAGR
                    if len(revs) >= 2 and revs[-1] > 0:
                        yrs = len(revs) - 1
                        if yrs > 0:
                            cagr = (revs[0] / revs[-1]) ** (1 / yrs) - 1
                            result["revenue_3y_cagr"] = round(cagr * 100, 1)
                    # 净利增速
                    if len(profits) >= 2 and profits[-1] > 0:
                        result["profit_growth"] = round((profits[0] / profits[-1] - 1) * 100, 1)

                # 经营现金流
                ocf = latest.get("经营活动现金流净额", latest.get("经营现金流", None))
                np_raw = latest.get("净利润", latest.get("归属母公司净利润", None))
                if ocf and np_raw and float(np_raw) > 0:
                    result["op_cash_flow_ratio"] = round(float(ocf) / float(np_raw), 2)

                # 研发费用率
                rd = latest.get("研发费用", None)
                if rd and revs and revs[0] > 0:
                    result["r_and_d_pct"] = round(float(rd) / revs[0] * 100, 1)

        except Exception:
            pass


    # 3. 北向资金 — 多 API 回退
    if ak and code:
        nb = _fetch_northbound(ak, code)
        if nb:
            result.update(nb)

    return result


def _fetch_northbound(ak, code: str) -> Dict:
    """
    拉取个股北向资金数据，支持多 API 回退:
      1. stock_hsgt_individual_detail_em — 个股沪深股通每日明细
      2. stock_hsgt_hist_em — 沪/深股通历史汇总 (按市场)
    返回: {northbound_holding, northbound_value, northbound_pct, northbound_net_5d}
    """
    result = {}
    market = "sh" if code.startswith("6") else "sz"

    # ——— 方式 1: 个股每日明细 (最优) ———
    try:
        detail = ak.stock_hsgt_individual_detail_em(symbol=code)
        if detail is not None and len(detail) >= 1:
            latest = detail.iloc[-1]
            result["northbound_holding"] = float(latest.get("持股数", 0) or 0)
            result["northbound_value"] = float(latest.get("持股市值", 0) or 0)
            # 占流通股比例
            pct_raw = latest.get("持股比例", latest.get("占流通股比例", None))
            if pct_raw:
                result["northbound_pct"] = float(pct_raw)
            # 近 5 日净买入
            if len(detail) >= 5:
                recent = detail.iloc[-5:]
                net_buy = sum(float(r.get("当日净买入", r.get("净买入", 0)) or 0) for r in recent.itertuples(index=False) if hasattr(r, '_asdict'))
                if not isinstance(net_buy, (int, float)):
                    # itertuples fallback
                    net_buy = 0.0
                result["northbound_net_5d"] = round(float(net_buy), 1)
            return result
    except Exception:
        pass

    # ——— 方式 2: 市场汇总推算 (回退) ———
    try:
        market_name = "沪股通" if market == "sh" else "深股通"
        hist = ak.stock_hsgt_hist_em(symbol=market_name)
        if hist is not None and len(hist) >= 1:
            latest = hist.iloc[-1]
            net_inflow = float(latest.get("当日成交净买额", latest.get("净流入", 0)) or 0)
            if net_inflow != 0:
                result["northbound_net_5d"] = round(net_inflow / 10000, 1)  # 万元→亿
            if hist is not None and len(hist) >= 5:
                result["northbound_market_active"] = True
            return result
    except Exception:
        pass

    return result


# ============================================================
#  维度1: 估值评分 (满分15)
# ============================================================
def score_valuation(df: pd.DataFrame, idx: int = -1,
                    industry: str = "", fin: Dict = None) -> int:
    """估值评分 — 行业相对PE/PB + PEG"""
    score = 8.0
    pe = df.get("pe", pd.Series([np.nan])).iloc[idx] if "pe" in df.columns else np.nan
    pb = df.get("pb", pd.Series([np.nan])).iloc[idx] if "pb" in df.columns else np.nan
    pe_median, pb_median = _get_industry_median(industry)

    # PE 行业相对 (8分)
    if not pd.isna(pe) and float(pe) > 0:
        rel_pe = float(pe) / pe_median
        if   rel_pe < 0.5:  score += 6.0
        elif rel_pe < 0.8:  score += 4.0
        elif rel_pe < 1.0:  score += 2.5
        elif rel_pe < 1.2:  score += 1.0
        elif rel_pe < 1.5:  score += 0.0
        elif rel_pe < 2.0:  score -= 2.0
        else:              score -= 4.0

    # PB 行业相对 (4分)
    if not pd.isna(pb) and float(pb) > 0:
        rel_pb = float(pb) / pb_median
        if   rel_pb < 0.6:  score += 3.0
        elif rel_pb < 0.9:  score += 2.0
        elif rel_pb < 1.1:  score += 1.0
        elif rel_pb < 1.5:  score += 0.0
        else:              score -= 1.5

    # PEG 调整 (3分) — PE/盈利增速，<1 为低估
    if fin and fin.get("profit_growth"):
        growth = fin["profit_growth"]
        if not pd.isna(pe) and float(pe) > 0 and growth > 0:
            peg = float(pe) / growth
            if peg < 0.5:   score += 3.0
            elif peg < 1.0: score += 2.0
            elif peg < 1.5: score += 1.0
            elif peg > 3.0: score -= 1.0

    return round(_clip(score, 0, 15))


# ============================================================
#  维度2: 盈利质量 (满分20)
# ============================================================
def score_earnings_quality(df: pd.DataFrame, idx: int = -1,
                            fin: Dict = None) -> int:
    """盈利质量 — ROE + 现金流质量 + 毛利率稳定性"""
    score = 7.0
    fin = fin or {}

    # 1. ROE (10分)
    roe = fin.get("roe")
    if roe is not None and float(roe) > 0:
        r = float(roe)
        if r > 25:    score += 9.0
        elif r > 20:  score += 7.5
        elif r > 15:  score += 6.0
        elif r > 10:  score += 4.0
        elif r > 5:   score += 2.0
        elif r > 0:   score += 0.5
        else:         score -= 3.0
    else:
        # PE 代理
        pe = df.get("pe", pd.Series([np.nan])).iloc[idx] if "pe" in df.columns else np.nan
        if not pd.isna(pe) and float(pe) > 0:
            ep = 100 / float(pe)  # 盈利收益率
            score += _clip(ep / 3.0 * 5.0, 0, 6.0)

    # 2. 现金流质量 (6分)
    ocf_ratio = fin.get("op_cash_flow_ratio")
    if ocf_ratio is not None:
        if ocf_ratio > 1.0:   score += 6.0   # 现金流 > 利润
        elif ocf_ratio > 0.8: score += 4.5
        elif ocf_ratio > 0.5: score += 3.0
        elif ocf_ratio > 0:   score += 1.0
        else:                score -= 2.0    # 利润没有现金流支撑

    # 3. 毛利率 (4分)
    gm = fin.get("gross_margin")
    if gm is not None:
        if gm > 60:    score += 4.0  # 高毛利=强护城河
        elif gm > 40:  score += 3.0
        elif gm > 20:  score += 2.0
        elif gm > 10:  score += 1.0
        else:          score += 0.0

    return round(_clip(score, 0, 20))


# ============================================================
#  维度3: 成长性 (满分15)
# ============================================================
def score_growth(fin: Dict = None) -> int:
    """成长性 — 营收CAGR + 净利增速 + 研发投入"""
    score = 6.0
    fin = fin or {}

    # 1. 营收3年CAGR (7分)
    rev_cagr = fin.get("revenue_3y_cagr")
    if rev_cagr is not None:
        if rev_cagr > 30:   score += 7.0
        elif rev_cagr > 20: score += 5.5
        elif rev_cagr > 15: score += 4.0
        elif rev_cagr > 10: score += 2.5
        elif rev_cagr > 5:  score += 1.0
        elif rev_cagr > 0:  score += 0.0
        else:              score -= 1.0

    # 2. 净利增速 (5分)
    profit_g = fin.get("profit_growth")
    if profit_g is not None:
        if profit_g > 30:   score += 5.0
        elif profit_g > 20: score += 4.0
        elif profit_g > 10: score += 3.0
        elif profit_g > 5:  score += 1.5
        elif profit_g > 0:  score += 0.5
        else:              score -= 1.0

    # 3. 研发投入 (3分) — 科技公司加分
    rd = fin.get("r_and_d_pct")
    if rd is not None:
        if rd > 15:   score += 3.0
        elif rd > 10: score += 2.5
        elif rd > 5:  score += 1.5
        elif rd > 2:  score += 0.5

    return round(_clip(score, 0, 15))


# ============================================================
#  维度4: 趋势评分 (满分15)
# ============================================================
def score_trend(indicators: Dict[str, pd.Series], close: pd.Series,
                idx: int = -1) -> int:
    """趋势评分 — MA排列 + MACD + RSI"""
    score = 0.0
    price = float(close.iloc[idx]) if not pd.isna(close.iloc[idx]) else None

    # MA排列 (6分)
    mas = ["ma5", "ma10", "ma20", "ma60"]
    ma_vals = {}
    for m in mas:
        if m in indicators:
            v = indicators[m].iloc[idx]
            ma_vals[m] = float(v) if not pd.isna(v) else None
    if price and all(v is not None for v in ma_vals.values()):
        above = sum(1 for v in ma_vals.values() if price > v)
        score += above * 1.0
        pairs = [('ma5','ma10'),('ma10','ma20'),('ma20','ma60')]
        align = sum(1 for a,b in pairs
                    if ma_vals.get(a) and ma_vals.get(b) and ma_vals[a] > ma_vals[b])
        score += align * 1.0

    # MACD (5分)
    dif = float(indicators.get("macd_dif", pd.Series([0])).iloc[idx] or 0)
    dea = float(indicators.get("macd_dea", pd.Series([0])).iloc[idx] or 0)
    hist = float(indicators.get("macd_hist", pd.Series([0])).iloc[idx] or 0)
    if not any(pd.isna(v) for v in [dif, dea, hist]):
        dif_norm = _clip((dif + 2.0) / 4.0, 0, 1)
        score += dif_norm * 2.0
        if dif > dea:
            score += 2.0
            if hist > 0: score += 1.0
        if idx > 0:
            prev_dif = float(indicators["macd_dif"].iloc[idx-1] or 0)
            if dif > prev_dif: score += 0.5

    # RSI (4分)
    rsi12 = float(indicators.get("rsi12", pd.Series([50])).iloc[idx] or 50)
    if 40 <= rsi12 <= 70:
        score += 3.5 - abs(rsi12 - 55) / 15 * 1.5
    elif 30 <= rsi12 < 40:
        score += 2.0 + (rsi12 - 30) / 10 * 1.5
    else:
        score += max(0, 1.5 - abs(rsi12 - 50) / 50 * 2)

    return round(min(score, 15.0))


# ============================================================
#  维度5: 动量评分 (满分10)
# ============================================================
def score_momentum(indicators: Dict[str, pd.Series], df: pd.DataFrame,
                   idx: int = -1) -> int:
    """动量评分 — 量比 + 换手率 + 相对强弱"""
    score = 0.0
    close = df["close"]
    volume = df["volume"]

    # 量比 (4分)
    vol_ma5 = float(indicators.get("vol_ma5", pd.Series([1])).iloc[idx] or 1)
    cur_vol = float(volume.iloc[idx])
    if vol_ma5 > 0:
        ratio = cur_vol / vol_ma5
        score += min(4.0, ratio / 3.0 * 4.0)

    # 换手率 (2分)
    turnover = df.get("turnover", pd.Series())
    if len(turnover) > 0:
        t = float(turnover.iloc[idx] or 0)
        if t > 0:
            log_t = np.log10(max(1, t * 10000))
            score += min(2.0, log_t / 5.0 * 2.0)

    # 量价配合 (4分)
    if idx > 0:
        pct = (float(close.iloc[idx]) / float(close.iloc[idx-1]) - 1) * 100
        vol_chg = float(volume.iloc[idx]) / float(volume.iloc[idx-1]) if float(volume.iloc[idx-1]) > 0 else 1
        if pct > 0:
            if vol_chg > 1.2:  score += 4.0
            elif vol_chg > 1.0: score += 3.0
            else:              score += 1.5
        else:
            if vol_chg < 0.8: score += 1.5
            else:             score += 0.0

    return round(min(score, 10.0))


# ============================================================
#  维度6: 财务健康 (满分10)
# ============================================================
def score_financial_health(fin: Dict = None) -> int:
    """财务健康 — 负债率 + 流动比率 + 利息覆盖"""
    score = 5.0
    fin = fin or {}

    # 资产负债率 (4分) — 越低越安全
    dr = fin.get("debt_ratio")
    if dr is not None:
        if dr < 20:    score += 4.0
        elif dr < 40:  score += 3.0
        elif dr < 60:  score += 2.0
        elif dr < 70:  score += 1.0
        elif dr > 80:  score -= 2.0  # 高杠杆风险

    # 流动比率 (3分)
    cr = fin.get("current_ratio")
    if cr is not None:
        if cr > 2.5:   score += 3.0
        elif cr > 1.5: score += 2.5
        elif cr > 1.0: score += 1.5
        elif cr > 0.5: score += 0.5
        else:         score -= 1.0  # 流动性风险

    # 利息覆盖 (3分) — 用 ROE>负债率 代理
    if dr is not None and fin.get("roe") is not None:
        if float(fin["roe"]) > dr * 1.5:
            score += 3.0
        elif float(fin["roe"]) > dr:
            score += 1.5

    return round(_clip(score, 0, 10))


# ============================================================
#  维度7: 机构共识 (满分10)
# ============================================================
def score_institutional(fin: Dict = None, df: pd.DataFrame = None,
                        idx: int = -1) -> int:
    """机构共识 — 北向持仓 + 持仓变化 + 资金趋势"""
    score = 5.0
    fin = fin or {}

    # 1. 北向持仓占比 (4分) — 有北向且比例高=机构深度认可
    nb_pct = fin.get("northbound_pct")
    nb_hold = fin.get("northbound_holding")
    if nb_pct is not None:
        if nb_pct > 5.0:    score += 4.0   # 重仓股
        elif nb_pct > 2.0:  score += 3.0
        elif nb_pct > 1.0:  score += 2.0
        elif nb_pct > 0.3:  score += 1.0
        elif nb_pct > 0:    score += 0.5
    elif nb_hold is not None and nb_hold > 0:
        score += 2.0  # 有持仓但比例未知

    # 2. 近5日净买入方向 (3分) — 近期持续加仓=积极信号
    nb_net = fin.get("northbound_net_5d")
    if nb_net is not None:
        if nb_net > 0.5:    score += 3.0   # 大幅净买入
        elif nb_net > 0.1:  score += 2.0
        elif nb_net > 0:    score += 1.0
        elif nb_net < -0.5: score -= 2.0   # 大幅净卖出=撤退信号

    # 3. 价格趋势 + 北向持股市值 (3分) — 量价配合确认
    nb_value = fin.get("northbound_value")
    if nb_value is not None and nb_value > 1e7:  # 持股市值 > 1000万
        score += 1.0
    if df is not None and idx >= 20:
        window = df["close"].iloc[max(0, idx-20):idx+1]
        if len(window) >= 10:
            mid = len(window) // 2
            if window.iloc[mid:].mean() > window.iloc[:mid].mean() * 1.02:
                if nb_hold is not None and nb_hold > 0:
                    score += 2.0  # 有北向 + 价格上行 = 机构驱动型上涨
                else:
                    score += 1.0

    return round(_clip(score, 0, 10))


# ============================================================
#  维度8: 风险评分 (满分5)
# ============================================================
def score_risk(indicators: Dict[str, pd.Series], close: pd.Series,
               idx: int = -1) -> int:
    """风险评分 — 回撤 + 波动率"""
    score = 2.5

    # 10日最大回撤 (3分)
    if idx >= 9:
        window = close.iloc[idx-9:idx+1]
        peak = window.cummax()
        dd = abs(float((window.iloc[-1] / peak.iloc[-1] - 1) * 100))
        score += max(0, 3.0 - dd / 4.0)

    # 波动率 (2分)
    atr = float(indicators.get("atr14", pd.Series([0])).iloc[idx] or 0)
    c = float(close.iloc[idx])
    if atr > 0 and c > 0:
        atr_pct = atr / c * 100
        if atr_pct < 3:   score += 2.0
        elif atr_pct < 6: score += 1.0
        else:             score += 0.0

    return round(_clip(score, 0, 5))


# ============================================================
#  主入口
# ============================================================
def calc_five_dim_scores(df: pd.DataFrame, code: str = "") -> Dict:
    """
    七维评分 V5.0

    参数:
      df:   K线 DataFrame, 必须含 [close, volume], 可选 [pe, pb, turnover]
      code: 股票代码, 用于拉取基本面+行业+北向数据

    返回:
      {total_score, valuation_score, earnings_quality_score, growth_score,
       trend_score, momentum_score, health_score, consensus_score, risk_score,
       details: {...}}
    """
    from services.indicator_service import calc_all, indicators_summary

    close = df["close"]
    indicators = calc_all(df)
    idx = -1
    industry = _get_industry(code)
    fin = _fetch_financials(code) if code else {}

    # 八维计算
    valuation  = score_valuation(df, idx, industry, fin)      # 15
    earnings   = score_earnings_quality(df, idx, fin)         # 20
    growth     = score_growth(fin)                            # 15
    trend      = score_trend(indicators, close, idx)          # 15
    momentum   = score_momentum(indicators, df, idx)          # 10
    health     = score_financial_health(fin)                  # 10
    consensus  = score_institutional(fin, df, idx)            # 10
    risk       = score_risk(indicators, close, idx)           #  5
    #                    总计 = 100

    raw_total = valuation + earnings + growth + trend + momentum + health + consensus + risk

    # 分布拉伸
    RAW_MIN, RAW_MAX = max(15.0, raw_total - 30), min(90.0, raw_total + 30)
    total = round(10.0 + (raw_total - RAW_MIN) / max(0.01, RAW_MAX - RAW_MIN) * 85.0)
    total = max(5, min(98, total))

    details = indicators_summary(indicators, idx)
    details["close"] = round(float(close.iloc[idx]), 2) if not pd.isna(close.iloc[idx]) else None
    details["industry"] = industry
    details["financial_data"] = {k: v for k, v in fin.items()
                                 if isinstance(v, (int, float))}

    return {
        "total_score":            total,
        "valuation_score":        valuation,
        "earnings_quality_score": earnings,
        "growth_score":           growth,
        "trend_score":            trend,
        "momentum_score":         momentum,
        "health_score":           health,
        "consensus_score":        consensus,
        "risk_score":             risk,
        "details":                details,
    }


def _get_industry(code: str) -> str:
    try:
        from database import SessionLocal
        from models import StockBasic
        db = SessionLocal()
        stock = db.query(StockBasic).filter(StockBasic.code == code).first()
        db.close()
        if stock and getattr(stock, "industry", ""):
            return stock.industry
    except Exception:
        pass
    return ""


def batch_score(stock_data: Dict[str, pd.DataFrame]) -> Dict[str, Dict]:
    results = {}
    for code, df in stock_data.items():
        try:
            results[code] = calc_five_dim_scores(df, code)
        except Exception as e:
            results[code] = {"error": str(e), "total_score": 0}
    return results


from services.indicator_service import calc_all
