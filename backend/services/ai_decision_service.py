"""
AI 决策引擎 — DeepSeek 驱动 + 规则引擎降级

输入: 五维评分 + 技术指标 + 持仓状态
输出: BUY/SELL/HOLD + 置信度 + 仓位百分比 + 理由
"""
import json
import os
import logging
from typing import Dict, List, Optional

logger = logging.getLogger(__name__)

# ============================================================
#  Rule Engine (降级方案，无外部依赖)
# ============================================================

def _rule_decide(
    scores: Dict, indicators: Dict, code: str,
    current_position: Optional[Dict] = None,
) -> Dict:
    """基于评分和指标的规则决策"""
    total = scores.get("total_score", 50)
    trend = scores.get("trend_score", 0)
    risk = scores.get("risk_score", 0)

    if current_position and current_position.get("quantity", 0) > 0:
        profit_pct = current_position.get("profit_pct", 0)
        if total <= 50:
            return {"action": "SELL", "confidence": 70,
                    "position_pct": 0, "reason": f"评分过低({total}), 建议卖出"}
        if profit_pct > 20:
            return {"action": "SELL", "confidence": 75,
                    "position_pct": 0, "reason": f"盈利{profit_pct:.1f}%, 建议止盈"}
        if profit_pct < -8:
            return {"action": "SELL", "confidence": 85,
                    "position_pct": 0, "reason": f"亏损{profit_pct:.1f}%, 建议止损"}
        if total >= 80:
            return {"action": "HOLD", "confidence": 80,
                    "position_pct": 50, "reason": f"评分优秀({total}), 继续持有"}
        return {"action": "HOLD", "confidence": 60,
                "position_pct": 30, "reason": f"观望, 评分{total}"}

    if total >= 85 and trend >= 25 and risk >= 10:
        return {"action": "BUY", "confidence": 85,
                "position_pct": 30, "reason": f"综合评分优秀({total}), 趋势强劲"}
    if total >= 75 and trend >= 20:
        return {"action": "BUY", "confidence": 70,
                "position_pct": 20, "reason": f"评分良好({total}), 可适度介入"}
    if total >= 65:
        return {"action": "HOLD", "confidence": 50,
                "position_pct": 10, "reason": f"评分中等({total}), 轻仓试探"}
    return {"action": "HOLD", "confidence": 40,
            "position_pct": 0, "reason": f"评分偏低({total}), 暂不参与"}


# ============================================================
#  Prompt Builder
# ============================================================

def _build_prompt(
    code: str, name: str,
    scores: Dict, indicators: Dict,
    market_context: str = "",
    current_position: Optional[Dict] = None,
) -> str:
    """构建紧凑提示词"""
    pos_text = "无"
    if current_position and current_position.get("quantity", 0) > 0:
        pos_text = (
            f"持有{current_position.get('quantity', 0)}股"
            f"成本{current_position.get('buy_price', 0):.1f}"
            f"盈亏{current_position.get('profit_pct', 0):.1f}%"
        )

    return "\n".join([
        f"股: {code} {name} 收盘: {indicators.get('close', '?')}",
        f"总评: {scores.get('total_score','?')}/100",
        f"趋势: {scores.get('trend_score','?')}/30 资金: {scores.get('capital_score','?')}/25",
        f"估值: {scores.get('valuation_score','?')}/15 情绪: {scores.get('sentiment_score','?')}/15 风险: {scores.get('risk_score','?')}/15",
        f"MA5:{indicators.get('ma5','?')} MA20:{indicators.get('ma20','?')} MA60:{indicators.get('ma60','?')}",
        f"MACD: DIF={indicators.get('macd_dif','?')} DEA={indicators.get('macd_dea','?')} HIST={indicators.get('macd_hist','?')}",
        f"RSI6:{indicators.get('rsi6','?')} RSI12:{indicators.get('rsi12','?')}",
        f"KDJ: K={indicators.get('kdj_k','?')} D={indicators.get('kdj_d','?')} J={indicators.get('kdj_j','?')}",
        f"持仓: {pos_text}",
        "",
        "只输出一行JSON，无其他文字:",
        '{"action":"BUY或SELL或HOLD","confidence":0-100,"pos":0-100,"reason":"中文理由10字"}',
    ])


# ============================================================
#  DeepSeek AI Decision (统一入口)
# ============================================================

def deepseek_decide(
    code: str, name: str,
    scores: Dict, indicators: Dict,
    model: str = "deepseek-chat",
    market_context: str = "",
    current_position: Optional[Dict] = None,
) -> Dict:
    """
    DeepSeek AI 决策（通过 OpenAI 兼容 API）
    失败时自动降级为规则引擎
    """
    api_key = os.getenv("DEEPSEEK_API_KEY")
    if not api_key:
        logger.info("DeepSeek API Key 未配置，使用规则引擎")
        result = _rule_decide(scores, indicators, code, current_position)
        result["source"] = "rule_engine(no_key)"
        return result

    try:
        from openai import OpenAI

        client = OpenAI(
            api_key=api_key,
            base_url=os.getenv("DEEPSEEK_BASE_URL", "https://api.deepseek.com"),
            timeout=15.0,
        )
        prompt = _build_prompt(code, name, scores, indicators,
                               market_context, current_position)

        response = client.chat.completions.create(
            model=model,
            messages=[{"role": "user", "content": prompt}],
            temperature=0.3,
            max_tokens=256,
        )

        text = response.choices[0].message.content.strip()
        # JSON 提取容错
        start = text.find("{")
        end = text.rfind("}") + 1
        if start >= 0 and end > start:
            text = text[start:end]

        result = json.loads(text)
        if "pos" in result and "position_pct" not in result:
            result["position_pct"] = result.pop("pos")
        result["source"] = f"deepseek({model})"
        result["tokens_used"] = response.usage.total_tokens if response.usage else None
        logger.info(f"DeepSeek {code}: {result.get('action')} conf={result.get('confidence')}")
        return result

    except Exception as e:
        logger.warning(f"DeepSeek调用失败: {e}")
        result = _rule_decide(scores, indicators, code, current_position)
        result["source"] = "rule_engine(fallback)"
        result["fallback_reason"] = str(e)[:80]
        return result


# 兼容旧 import
gemini_decide = deepseek_decide


def batch_decide(stocks: List[Dict], model: str = "deepseek-chat") -> List[Dict]:
    """批量 AI 决策"""
    results = []
    for stock in stocks:
        code = stock.get("code", "")
        name = stock.get("name", "")
        scores = stock.get("scores", {})
        indicators = stock.get("indicators", {})
        pos = stock.get("position")

        decision = deepseek_decide(
            code, name, scores, indicators,
            model=model, current_position=pos,
        )
        results.append({"code": code, "name": name, **decision})
    return results
