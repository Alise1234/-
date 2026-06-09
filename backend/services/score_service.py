"""
五维评分引擎 V3.3 — 百分位驱动 + 连续函数

设计原则:
  1. 每个维度输出连续分数（非阶梯if-else）
  2. 阈值基于实际数据分位数（200只抽样）
  3. 满分可达到，低分也有区分度

维度权重:
  趋势评分  30% — MA排列 + MACD + RSI
  资金评分  25% — 量比 + 换手率 + 量价配合
  估值评分  15% — PE/PB
  情绪评分  15% — 涨跌幅 + RSI极端
  风险评分  15% — BOLL位置 + 波动率 + 回撤
"""
import pandas as pd
import numpy as np
from typing import Dict


def _clip(v, lo, hi):
    """约束到[lo, hi]"""
    return max(lo, min(hi, v))


def score_trend(indicators: Dict[str, pd.Series], close: pd.Series,
                idx: int = -1) -> int:
    """
    趋势评分 (满分30)
    基于实际分布: P50(MA5>MA20)=18%, P50(RSI12)=37.9, P50(MACD_DIF)=-0.21
    """
    score = 0.0

    # 1. MA排列 (12分) — 检查各周期均线位置
    mas = ["ma5", "ma10", "ma20", "ma60"]
    ma_vals = {}
    for m in mas:
        if m in indicators:
            v = indicators[m].iloc[idx]
            ma_vals[m] = float(v) if not pd.isna(v) else None

    price = float(close.iloc[idx]) if not pd.isna(close.iloc[idx]) else None

    if price and all(v is not None for v in ma_vals.values()):
        # 价格在MA上方个数
        above_count = sum(1 for v in ma_vals.values() if price > v)
        score += above_count * 2.0  # 每个MA=2分, 最高8分

        # 多头排列: 短周期>长周期个数
        align_pairs = [('ma5','ma10'),('ma10','ma20'),('ma20','ma60')]
        align_count = sum(1 for a,b in align_pairs
                         if ma_vals.get(a) and ma_vals.get(b) and ma_vals[a] > ma_vals[b])
        score += align_count * 1.33  # 每对1.33分, 最高4分

    # 2. MACD (10分)
    dif = indicators.get("macd_dif", pd.Series()).iloc[idx]
    dea = indicators.get("macd_dea", pd.Series()).iloc[idx]
    hist = indicators.get("macd_hist", pd.Series()).iloc[idx]

    if not any(pd.isna(v) for v in [dif, dea, hist]):
        dif, dea, hist = float(dif), float(dea), float(hist)
        # DIF位置: P50=-0.21, 归一化到[-2, 2] → [0, 5]分
        dif_norm = _clip((dif + 2.0) / 4.0, 0, 1)
        score += dif_norm * 4.0

        # 金叉/死叉: DIF>DEA
        if dif > dea:
            score += 3.0
            if hist > 0: score += 2.0  # 柱线也在变好
        elif dif > 0:
            score += 1.5
        # 底背离: dif在回升但价格在跌
        if idx > 0:
            prev_dif = float(indicators["macd_dif"].iloc[idx-1])
            if not pd.isna(prev_dif) and dif > prev_dif:
                score += 1.0

    # 3. RSI (8分) — 40-70最优, 30-40和70-80次优
    rsi12 = indicators.get("rsi12", pd.Series()).iloc[idx]
    if not pd.isna(rsi12):
        rsi12 = float(rsi12)
        if 40 <= rsi12 <= 70:
            score += 7.0 - abs(rsi12 - 55) / 15 * 2  # 55最优, 衰减
        elif 30 <= rsi12 < 40:
            score += 4.0 + (rsi12 - 30) / 10 * 3  # 超卖有反弹机会
        elif 70 < rsi12 <= 80:
            score += 4.0 - (rsi12 - 70) / 10 * 3  # 偏强但未超买
        elif rsi12 > 80:
            score += 1.0  # 严重超买
        else:
            score += 2.0 + (rsi12 - 20) / 10 * 2  # <30 超卖

    return round(min(score, 30.0))


def score_capital(indicators: Dict[str, pd.Series], df: pd.DataFrame,
                  idx: int = -1) -> int:
    """
    资金评分 (满分25)
    基于实际分布: P50(量比)=0.89, P50(换手率)=0.024%, P90(换手率)=0.14%
    """
    score = 0.0
    close = df["close"]
    volume = df["volume"]
    turnover = df.get("turnover", pd.Series())

    # 1. 量比 (10分) — 相对于5日均量的比值
    vol_ma5 = indicators.get("vol_ma5", pd.Series()).iloc[idx]
    cur_vol = volume.iloc[idx]
    if not pd.isna(vol_ma5) and vol_ma5 > 0:
        vol_ratio = float(cur_vol / vol_ma5)
        # P50=0.89, P90=1.26. 用连续映射: ratio/2.0 × 10, cap at 10
        score += min(10.0, max(1.0, vol_ratio / 2.0 * 10.0))

    # 2. 换手率活跃度 (8分) — 百分位映射
    if len(turnover) > 0:
        cur_turnover = turnover.iloc[idx]
        if not pd.isna(cur_turnover) and cur_turnover > 0:
            t = float(cur_turnover)
            # 用对数映射解决极度右偏: log10(t*10000)/6 * 8
            # P50=0.024→log10(244)=2.39→3.2分, P90=0.14→log10(1400)=3.15→4.2分
            log_t = np.log10(max(1, t * 10000))
            score += min(8.0, log_t / 5.0 * 8.0)

    # 3. 量价配合 (7分)
    if idx > 0:
        pct = (close.iloc[idx] / close.iloc[idx - 1] - 1) * 100
        vol_chg = volume.iloc[idx] / volume.iloc[idx - 1] if volume.iloc[idx - 1] > 0 else 1

        if pct > 0:
            if vol_chg > 1.2:
                score += 7.0  # 放量上涨—最佳
            elif vol_chg > 1.0:
                score += 5.0
            else:
                score += 3.0  # 缩量上涨—一般
        elif pct < 0:
            if vol_chg < 0.8:
                score += 2.0  # 缩量下跌—有承接
            else:
                score += 0.0  # 放量下跌—差
        else:
            score += 2.0  # 平盘

    return round(min(score, 25.0))


def score_valuation(df: pd.DataFrame, idx: int = -1) -> int:
    """估值评分 (满分15) — PE/PB优先，缺失时用流动性代理"""
    score = 8.0
    pe = df.get("pe", pd.Series()).iloc[idx] if "pe" in df.columns else np.nan
    pb = df.get("pb", pd.Series()).iloc[idx] if "pb" in df.columns else np.nan

    has_pe = not pd.isna(pe) and float(pe) > 0
    has_pb = not pd.isna(pb) and float(pb) > 0

    if has_pe or has_pb:
        if has_pe:
            pe = float(pe)
            if pe < 10:  score += 5.0
            elif pe < 20: score += 3.0
            elif pe < 30: score += 1.5
            elif pe < 50: score += 0.0
            elif pe < 80: score -= 2.0
            else:         score -= 4.0
        if has_pb:
            pb = float(pb)
            if pb < 1:    score += 3.0
            elif pb < 2:  score += 1.5
            elif pb < 5:  score += 0.0
            elif pb < 10: score -= 1.0
            else:         score -= 2.0
    else:
        # PE/PB缺失时：用流动性代理估值（换手率高→市场定价充分→估值合理）
        turnover = df.get("turnover", pd.Series())
        if len(turnover) > 0:
            t = turnover.iloc[idx]
            if not pd.isna(t) and t > 0:
                t = float(t)
                # P50=0.024%, P90=0.14%. 映射到3-12分
                log_t = np.log10(max(1, t * 10000))
                score = 3.0 + min(9.0, log_t / 5.0 * 9.0)

    return round(_clip(score, 0, 15))


def score_sentiment(close: pd.Series, indicators: Dict[str, pd.Series],
                    idx: int = -1) -> int:
    """情绪评分 (满分15) — 基于涨跌幅+RSI极端"""
    score = 7.0  # 默认中性

    # 1. 5日涨跌幅 (6分)
    if idx >= 4:
        pct5 = (close.iloc[idx] / close.iloc[idx - 4] - 1) * 100
        # P50≈0%. 用连续映射: pct5/20 * 6
        score += _clip(pct5 / 20.0 * 6.0, -3.0, 6.0)

    # 2. RSI6极端 (5分) — 30-70健康, 超卖有反弹机会
    rsi6 = indicators.get("rsi6", pd.Series()).iloc[idx]
    if not pd.isna(rsi6):
        rsi6 = float(rsi6)
        if 30 <= rsi6 <= 70:
            score += 4.0 - abs(rsi6 - 50) / 20 * 2
        elif rsi6 < 30:
            score += 3.0 + (30 - rsi6) / 30 * 2  # 超卖加分
        else:
            score += 1.0  # 超买

    # 3. 连涨/连跌 (4分)
    n = len(close)
    pos = n + idx if idx < 0 else idx
    if pos >= 5:
        cons_up = sum(1 for i in range(pos, max(pos-5, 1), -1)
                     if close.iloc[i] > close.iloc[i-1])
        score += min(4.0, cons_up * 1.33)

    return round(_clip(score, 0, 15))


def score_risk(indicators: Dict[str, pd.Series], close: pd.Series,
               df: pd.DataFrame, idx: int = -1) -> int:
    """风险评分 (满分15) — 分数越高=风险越低"""
    score = 7.0  # 默认中等

    # 1. BOLL位置 (5分) — 中轨=最优
    pct_b = indicators.get("boll_pct_b", pd.Series()).iloc[idx]
    if not pd.isna(pct_b):
        pct_b = float(pct_b)
        # P50=0.18. 距离0.5越近越好
        score += max(0, 5.0 - abs(pct_b - 0.5) * 8.0)

    # 2. ATR波动率 (5分) — 越低越稳
    atr = indicators.get("atr14", pd.Series()).iloc[idx]
    c = close.iloc[idx]
    if not pd.isna(atr) and not pd.isna(c) and c > 0:
        atr_pct = float(atr / c * 100)
        # P50=5.0%. <2%很稳, 2-5%正常, 5-8%偏高, >8%高波动
        if atr_pct < 2:   score += 5.0
        elif atr_pct < 5: score += 3.5 + (5-atr_pct)/3*1.5
        elif atr_pct < 8: score += 1.0 + (8-atr_pct)/3*2.5
        else:             score += 0.0

    # 3. 10日回撤 (5分) — 越小越好
    if idx >= 9:
        window = close.iloc[idx-9:idx+1]
        peak = window.cummax()
        dd = abs(float((window.iloc[-1] / peak.iloc[-1] - 1) * 100))
        # dd=0→5分, dd=3%→3分, dd=10%→0分
        score += max(0, 5.0 - dd / 2.0)

    return round(_clip(score, 0, 15))


def calc_five_dim_scores(df: pd.DataFrame) -> Dict:
    """计算五维评分"""
    close = df["close"]
    indicators = calc_all(df)
    idx = -1

    trend = score_trend(indicators, close, idx)
    capital = score_capital(indicators, df, idx)
    valuation = score_valuation(df, idx)
    sentiment = score_sentiment(close, indicators, idx)
    risk = score_risk(indicators, close, df, idx)

    total = trend + capital + valuation + sentiment + risk

    # V3.3 分布拉伸: 扩展分数区间 → 近似正态分布
    # 原始聚类约[25,60] → 目标[10,95]
    # 原始分均值 51.3, max~70, RAW_MAX=75 覆盖 95%+ 股票, 天花板<5%
    RAW_MIN, RAW_MAX = 25.0, 75.0
    TARGET_MIN, TARGET_MAX = 10.0, 95.0
    if RAW_MAX > RAW_MIN:
        total = round(TARGET_MIN + (total - RAW_MIN) / (RAW_MAX - RAW_MIN) * (TARGET_MAX - TARGET_MIN))
        total = max(10, min(98, total))

    from services.indicator_service import indicators_summary
    details = indicators_summary(indicators, idx)
    details["close"] = round(float(close.iloc[idx]), 2) if not pd.isna(close.iloc[idx]) else None

    return {
        "total_score": total,
        "trend_score": trend,
        "capital_score": capital,
        "valuation_score": valuation,
        "sentiment_score": sentiment,
        "risk_score": risk,
        "details": details,
    }


def batch_score(stock_data: Dict[str, pd.DataFrame]) -> Dict[str, Dict]:
    """批量计算"""
    results = {}
    for code, df in stock_data.items():
        try:
            results[code] = calc_five_dim_scores(df)
        except Exception as e:
            results[code] = {"error": str(e), "total_score": 0}
    return results


# 保留旧引用
from services.indicator_service import calc_all
