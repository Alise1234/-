"""
AI 分析报告生成器
DeepSeek 驱动 + 规则引擎降级
"""
import pandas as pd
import numpy as np
import json
import os
import logging
from typing import Dict, Optional
from sqlalchemy import desc

from database import SessionLocal

logger = logging.getLogger(__name__)
from models import StockBasic, StockDailyK, StockIndicator, StockScore
from services.indicator_service import calc_all, indicators_summary
from services.score_service import calc_five_dim_scores


def _atr_pct(atr: Optional[float], close: Optional[float]) -> float:
    """ATR 占收盘价百分比"""
    if atr and close and close > 0:
        return round(atr / close * 100, 2)
    return 0.0


def _ma_status(
    summary: Dict, price: Optional[float]
) -> str:
    """判断均线状态"""
    if price is None:
        return "数据不足"
    ma5 = summary.get("ma5")
    ma10 = summary.get("ma10")
    ma20 = summary.get("ma20")
    ma60 = summary.get("ma60")
    if any(v is None for v in [ma5, ma10, ma20, ma60]):
        return "数据不足"

    if price > ma5 > ma10 > ma20 > ma60:
        return "强势多头排列，均线全面向上发散"
    elif price > ma20 and ma20 > ma60:
        return "多头格局，短期均线在上方运行"
    elif price < ma5 < ma10 < ma20:
        return "短期均线空头排列"
    elif price < ma20 and ma20 < ma60:
        return "空头格局，中长期均线压制"
    return "均线交织，方向不明"


def _macd_status(summary: Dict) -> str:
    """MACD 状态"""
    dif = summary.get("macd_dif")
    dea = summary.get("macd_dea")
    hist = summary.get("macd_hist")
    if any(v is None for v in [dif, dea, hist]):
        return "数据不足"

    if dif > dea and hist > 0:
        if dif > 0:
            return "MACD零轴上方金叉运行，多头动能充足"
        return "MACD零轴下方金叉，弱势反弹中"
    elif dif > dea and hist < 0:
        return "MACD柱线缩短，动能减弱，关注是否死叉"
    elif dif < dea and hist < 0:
        if dif < 0:
            return "MACD零轴下方死叉，空头趋势延续"
        return "MACD零轴上方死叉，短线调整"
    elif dif < dea and hist > 0:
        return "MACD绿柱缩短，有金叉迹象，关注拐点"
    return "MACD信号不明"


def _rsi_status(summary: Dict) -> str:
    """RSI 状态"""
    rsi6 = summary.get("rsi6")
    rsi12 = summary.get("rsi12")
    rsi24 = summary.get("rsi24")
    if rsi6 is None:
        return "数据不足"

    if rsi6 > 80:
        return f"RSI6={rsi6:.0f} 严重超买，短期回调风险较大"
    elif rsi6 > 70:
        return f"RSI6={rsi6:.0f} 偏强，接近超买区域"
    elif rsi6 > 30:
        return f"RSI6={rsi6:.0f} 健康区间运行"
    elif rsi6 > 20:
        return f"RSI6={rsi6:.0f} 偏弱，接近超卖区域"
    return f"RSI6={rsi6:.0f} 严重超卖，技术性反弹概率较大"


def _kdj_status(summary: Dict) -> str:
    """KDJ 状态"""
    k = summary.get("kdj_k")
    d = summary.get("kdj_d")
    j = summary.get("kdj_j")
    if any(v is None for v in [k, d, j]):
        return "数据不足"

    if k > d and j > k:
        return "KDJ金叉向上，短期动能偏多"
    elif k > d:
        return "KDJ金叉区域，关注J值拐头"
    elif k < d and j < 20:
        return "KDJ低位钝化，超卖严重，等待金叉信号"
    elif k < d:
        return "KDJ死叉回落，短期动能偏空"
    return "KDJ信号不明"


def _boll_status(summary: Dict, price: Optional[float]) -> str:
    """BOLL 状态"""
    pct_b = summary.get("boll_pct_b")
    upper = summary.get("boll_upper")
    lower = summary.get("boll_lower")
    mid = summary.get("boll_mid")
    width = summary.get("boll_width")
    if any(v is None for v in [pct_b, upper, lower, mid]):
        return "数据不足"

    if pct_b > 1.0:
        return f"股价突破布林上轨({upper:.2f})，短期超买，注意回落风险"
    elif pct_b > 0.8:
        return "股价运行在布林带上轨附近，强势特征"
    elif pct_b > 0.2:
        return f"股价在布林带中轨({mid:.2f})附近运行，走势平稳"
    elif pct_b > 0:
        return "股价运行在布林带下轨附近，弱势特征"
    return f"股价跌破布林下轨({lower:.2f})，短期超卖，有反弹需求"


def _vol_status(summary: Dict, price: Optional[float]) -> str:
    """成交量状态"""
    vol_ma5 = summary.get("vol_ma5")
    vol_ma20 = summary.get("vol_ma20")
    if vol_ma5 is None or vol_ma20 is None or vol_ma20 == 0:
        return "数据不足"

    ratio = vol_ma5 / vol_ma20
    if ratio > 1.5:
        return "近期放量明显，5日均量远超20日均量，资金活跃"
    elif ratio > 1.0:
        return "成交量温和放大，市场关注度上升"
    elif ratio > 0.7:
        return "成交量处于正常水平"
    return "成交量萎缩，市场关注度降低"


def _generate_position_advice(
    scores: Dict, summary: Dict
) -> Dict:
    """生成持仓建议"""
    total = scores.get("total_score", 50)
    trend = scores.get("trend_score", 0)
    risk = scores.get("risk_score", 0)
    sentiment = scores.get("sentiment_score", 0)
    atr = summary.get("atr14")
    close = summary.get("close")

    # 建议仓位 (0-100%)
    if total >= 85 and trend >= 25:
        position_pct = min(80, total)
    elif total >= 75:
        position_pct = min(60, total - 20)
    elif total >= 60:
        position_pct = min(30, total - 40)
    else:
        position_pct = 0

    advice = ""
    if total >= 85:
        advice = "综合评分优秀，可积极参与，建议分批建仓降低波动风险"
    elif total >= 75:
        advice = "综合评分良好，可适度参与，注意控制单只仓位上限"
    elif total >= 60:
        advice = "综合评分中等，观望为主，轻仓试探，待信号明朗后加仓"
    else:
        advice = "综合评分偏低，建议规避，耐心等待更好的入场时机"

    # 买卖区间估算（基于 ATR）
    if close and atr:
        buy_low = round(close - 1.5 * atr, 2)
        buy_high = round(close + 0.5 * atr, 2)
        target_low = round(close + 2 * atr, 2)
        target_high = round(close + 4 * atr, 2)
        stop_loss = round(close - 2 * atr, 2)
    else:
        buy_low = buy_high = target_low = target_high = stop_loss = None

    return {
        "advice": advice,
        "position_pct": position_pct,
        "buy_range": f"{buy_low} ~ {buy_high}" if buy_low else "数据不足",
        "target_range": f"{target_low} ~ {target_high}" if target_low else "数据不足",
        "stop_loss": stop_loss if stop_loss else "数据不足",
    }


def deepseek_analyze(code: str, name: str, scores: Dict, indicators: Dict,
                     df: pd.DataFrame) -> Optional[Dict]:
    """
    DeepSeek 驱动的分析报告
    成功返回 dict，失败返回 None
    """
    api_key = os.getenv("DEEPSEEK_API_KEY")
    if not api_key:
        return None

    try:
        from openai import OpenAI

        close = indicators.get("close", "?")
        prompt = "\n".join([
            f"股票: {code} {name} 收盘: {close}",
            f"总评: {scores.get('total_score','?')}/100",
            f"趋势:{scores.get('trend_score','?')}/30 资金:{scores.get('capital_score','?')}/25",
            f"估值:{scores.get('valuation_score','?')}/15 情绪:{scores.get('sentiment_score','?')}/15 风险:{scores.get('risk_score','?')}/15",
            f"MA5:{indicators.get('ma5','?')} MA10:{indicators.get('ma10','?')} MA20:{indicators.get('ma20','?')} MA60:{indicators.get('ma60','?')}",
            f"MACD: DIF={indicators.get('macd_dif','?')} DEA={indicators.get('macd_dea','?')} HIST={indicators.get('macd_hist','?')}",
            f"RSI6:{indicators.get('rsi6','?')} RSI12:{indicators.get('rsi12','?')} RSI24:{indicators.get('rsi24','?')}",
            f"KDJ: K={indicators.get('kdj_k','?')} D={indicators.get('kdj_d','?')} J={indicators.get('kdj_j','?')}",
            f"BOLL: U={indicators.get('boll_upper','?')} M={indicators.get('boll_mid','?')} L={indicators.get('boll_lower','?')}",
            f"ATR14:{indicators.get('atr14','?')}",
            "",
            "只输出一行JSON，无其他文字:",
            '{"trend":"趋势分析30字内","capital":"资金分析30字内","risk":"风险分析30字内","advice":"操作建议30字内","buy":"120-130","target":"140-150","stop":"110"}',
        ])

        client = OpenAI(api_key=api_key, base_url="https://api.deepseek.com")
        response = client.chat.completions.create(
            model="deepseek-chat",
            messages=[{"role": "user", "content": prompt}],
            temperature=0.3, max_tokens=512,
        )

        text = response.choices[0].message.content.strip()
        if "```" in text:
            text = text.split("```")[1]
            if text.startswith("json"):
                text = text[4:]
            text = text.split("```")[0]
        start = text.find("{")
        end = text.rfind("}") + 1
        if start >= 0 and end > start:
            text = text[start:end]

        result = json.loads(text)
        logger.info(f"DeepSeek分析 {code}: {result.get('advice', '')[:30]}")
        return result
    except Exception as e:
        logger.warning(f"DeepSeek分析 {code} 失败: {e}")
        return None


def generate_analysis(code: str) -> Dict:
    """
    生成单只股票的分析报告

    参数:
        code: 股票代码

    返回:
        {trend_analysis, capital_analysis, risk_analysis,
         position_advice, buy_range, target_range, stop_loss,
         indicators, scores}
    """
    db = SessionLocal()
    try:
        # 获取基础信息
        basic = db.query(StockBasic).filter(StockBasic.code == code).first()

        # 获取K线数据
        klines = (
            db.query(StockDailyK)
            .filter(StockDailyK.code == code)
            .order_by(desc(StockDailyK.trade_date))
            .limit(200)
            .all()
        )
        if len(klines) < 30:
            return {"error": f"数据不足: 仅{len(klines)}天K线，需要至少30天"}

        klines_asc = list(reversed(klines))
        df = pd.DataFrame([{
            "open": float(r.open or 0),
            "high": float(r.high or 0),
            "low": float(r.low or 0),
            "close": float(r.close or 0),
            "volume": int(r.volume or 0),
        } for r in klines_asc])

        # 计算指标和评分
        indicators = calc_all(df)
        summary = indicators_summary(indicators, -1)
        scores = calc_five_dim_scores(df)
        close = summary.get("close")
        name = basic.name if basic else code

        # === 优先 DeepSeek AI 分析 ===
        ai_result = deepseek_analyze(code, name, scores, summary, df)
        if ai_result:
            pos = _generate_position_advice(scores, summary)
            return {
                "code": code,
                "name": name,
                "calc_date": str(klines_asc[-1].trade_date) if klines_asc else None,
                "close": close,
                "source": "deepseek",
                "trend_analysis": ai_result.get("trend", ""),
                "capital_analysis": ai_result.get("capital", ""),
                "risk_analysis": ai_result.get("risk", ""),
                "position_advice": ai_result.get("advice", pos["advice"]),
                "position_pct": pos["position_pct"],
                "buy_range": ai_result.get("buy", pos["buy_range"]),
                "target_range": ai_result.get("target", pos["target_range"]),
                "stop_loss": ai_result.get("stop", pos["stop_loss"]),
                "indicators": {
                    "ma5": summary.get("ma5"), "ma10": summary.get("ma10"),
                    "ma20": summary.get("ma20"), "ma60": summary.get("ma60"),
                    "macd_dif": summary.get("macd_dif"), "macd_dea": summary.get("macd_dea"),
                    "macd_hist": summary.get("macd_hist"),
                    "rsi6": summary.get("rsi6"), "rsi12": summary.get("rsi12"),
                    "rsi24": summary.get("rsi24"),
                    "kdj_k": summary.get("kdj_k"), "kdj_d": summary.get("kdj_d"),
                    "kdj_j": summary.get("kdj_j"),
                    "boll_upper": summary.get("boll_upper"), "boll_mid": summary.get("boll_mid"),
                    "boll_lower": summary.get("boll_lower"),
                    "atr14": summary.get("atr14"),
                },
                "scores": {
                    "total": scores["total_score"], "trend": scores["trend_score"],
                    "capital": scores["capital_score"], "valuation": scores["valuation_score"],
                    "sentiment": scores["sentiment_score"], "risk": scores["risk_score"],
                },
            }

        # === 降级：规则引擎 ===
        atr_pct = _atr_pct(summary.get("atr14"), close)

        trend_analysis = (
            f"【均线系统】{_ma_status(summary, close)}。"
            f"【MACD】{_macd_status(summary)}。"
            f"【RSI】{_rsi_status(summary)}。"
            f"【KDJ】{_kdj_status(summary)}。"
            f"综合趋势评分: {scores['trend_score']}/30。"
        )

        capital_analysis = (
            f"【成交量】{_vol_status(summary, close)}。"
            f"【活跃度】ATR={summary.get('atr14', '?')} (占股价{atr_pct}%)。"
            f"【资金面】MA5成交量={summary.get('vol_ma5', '?')}, "
            f"MA20成交量={summary.get('vol_ma20', '?')}。"
            f"综合资金评分: {scores['capital_score']}/25。"
        )

        risk_analysis = (
            f"【布林带】{_boll_status(summary, close)}。"
            f"【波动率】ATR14={summary.get('atr14', '?')}，布林带宽={summary.get('boll_width', '?')}%。"
            f"【RSI24】={summary.get('rsi24', '?')} (长期强弱)。"
            f"综合风险评分: {scores['risk_score']}/15。"
        )

        pos = _generate_position_advice(scores, summary)

        return {
            "code": code,
            "name": name,
            "calc_date": str(klines_asc[-1].trade_date) if klines_asc else None,
            "close": close,
            "source": "rule_engine",
            "trend_analysis": trend_analysis,
            "capital_analysis": capital_analysis,
            "risk_analysis": risk_analysis,
            "position_advice": pos["advice"],
            "position_pct": pos["position_pct"],
            "buy_range": pos["buy_range"],
            "target_range": pos["target_range"],
            "stop_loss": pos["stop_loss"],
            "indicators": {
                "ma5": summary.get("ma5"),
                "ma10": summary.get("ma10"),
                "ma20": summary.get("ma20"),
                "ma60": summary.get("ma60"),
                "macd_dif": summary.get("macd_dif"),
                "macd_dea": summary.get("macd_dea"),
                "macd_hist": summary.get("macd_hist"),
                "rsi6": summary.get("rsi6"),
                "rsi12": summary.get("rsi12"),
                "rsi24": summary.get("rsi24"),
                "kdj_k": summary.get("kdj_k"),
                "kdj_d": summary.get("kdj_d"),
                "kdj_j": summary.get("kdj_j"),
                "boll_upper": summary.get("boll_upper"),
                "boll_mid": summary.get("boll_mid"),
                "boll_lower": summary.get("boll_lower"),
                "atr14": summary.get("atr14"),
            },
            "scores": {
                "total": scores["total_score"],
                "trend": scores["trend_score"],
                "capital": scores["capital_score"],
                "valuation": scores["valuation_score"],
                "sentiment": scores["sentiment_score"],
                "risk": scores["risk_score"],
            },
        }
    except Exception as e:
        return {"error": str(e)}
    finally:
        db.close()
