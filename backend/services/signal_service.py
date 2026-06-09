"""
信号中心

每日生成:
  top10_buy      买入推荐（评分最高 + 技术面确认）
  top10_sell     卖出警告（评分最低/触发止损/超买）
  rebalance      调仓建议（持仓 vs 推荐 对比）
"""
from typing import Dict, List, Optional
from sqlalchemy import desc, asc
from database import SessionLocal
from models import StockBasic, StockScore, StockIndicator, PortfolioPosition


def _safe_float(val, default=0.0):
    if val is None:
        return default
    return float(val)


def top_buy_signals(limit: int = 10, min_score: int = 75) -> List[Dict]:
    """
    Top-N 买入推荐

    条件:
      - total_score >= min_score
      - ma20 > ma60 (多头)
      - macd_hist > 0 (MACD 多头)
      - rsi12 between 30-75 (非超买非超卖)
      - 无持仓
    """
    db = SessionLocal()
    try:
        holding_codes = {
            r[0] for r in
            db.query(PortfolioPosition.code).filter(PortfolioPosition.status == "holding").all()
        }

        candidates = (
            db.query(StockScore, StockBasic)
            .join(StockBasic, StockScore.code == StockBasic.code)
            .filter(StockScore.total_score >= min_score)
            .order_by(desc(StockScore.total_score))
            .limit(limit * 5)
            .all()
        )

        results = []
        for score, basic in candidates:
            code = score.code
            if code in holding_codes:
                continue

            ind = (
                db.query(StockIndicator)
                .filter(StockIndicator.code == code)
                .order_by(desc(StockIndicator.trade_date))
                .first()
            )
            if not ind:
                continue

            ma20 = _safe_float(ind.ma20)
            ma60 = _safe_float(ind.ma60)
            macd_hist = _safe_float(ind.macd_hist)
            rsi12 = _safe_float(ind.rsi12, 50)

            if ma20 <= ma60:
                continue
            if macd_hist <= 0:
                continue
            if rsi12 >= 75 or rsi12 <= 30:
                continue

            results.append({
                "code": code,
                "name": basic.name,
                "score": score.total_score,
                "close": _safe_float(score.close) if score.close else _safe_float(ind.ma5),
                "ma20": round(ma20, 2),
                "ma60": round(ma60, 2),
                "macd_hist": round(macd_hist, 4),
                "rsi12": round(rsi12, 1),
                "signal": "BUY",
                "reason": f"评分{score.total_score}, 多头排列, MACD金叉",
            })

            if len(results) >= limit:
                break

        return results
    finally:
        db.close()


def top_sell_signals(limit: int = 10, max_score: int = 50) -> List[Dict]:
    """
    Top-N 卖出警告

    条件:
      - total_score <= max_score   OR
      - rsi12 >= 85 (严重超买)    OR
      - ma5 < ma20 且 macd 死叉
    """
    db = SessionLocal()
    try:
        # 低评分
        low = (
            db.query(StockScore, StockBasic)
            .join(StockBasic, StockScore.code == StockBasic.code)
            .filter(StockScore.total_score <= max_score)
            .order_by(asc(StockScore.total_score))
            .limit(limit * 2)
            .all()
        )

        results = []
        seen = set()

        for score, basic in low:
            code = score.code
            seen.add(code)
            ind = (
                db.query(StockIndicator)
                .filter(StockIndicator.code == code)
                .order_by(desc(StockIndicator.trade_date))
                .first()
            )
            rsi12 = _safe_float(ind.rsi12, 50) if ind else 50
            results.append({
                "code": code,
                "name": basic.name,
                "score": score.total_score,
                "close": _safe_float(score.close) if score.close else 0,
                "rsi12": round(rsi12, 1),
                "signal": "SELL",
                "reason": f"评分过低({score.total_score})",
            })

        # 超买
        if len(results) < limit:
            candidates = (
                db.query(StockIndicator, StockBasic)
                .join(StockBasic, StockIndicator.code == StockBasic.code)
                .filter(StockIndicator.rsi12 >= 85)
                .order_by(desc(StockIndicator.rsi12))
                .limit(limit)
                .all()
            )
            for ind, basic in candidates:
                if ind.code in seen:
                    continue
                seen.add(ind.code)
                results.append({
                    "code": ind.code,
                    "name": basic.name,
                    "score": None,
                    "close": _safe_float(ind.ma5),
                    "rsi12": round(_safe_float(ind.rsi12), 1),
                    "signal": "SELL",
                    "reason": f"RSI严重超买({round(_safe_float(ind.rsi12),1)})",
                })

        return results[:limit]
    finally:
        db.close()


def rebalance_suggestions() -> List[Dict]:
    """
    调仓建议

    对当前持仓逐一检查:
      - score < 50 → 建议减仓
      - score 70-80 → 维持
      - score >= 85 → 建议加仓
      - 触发止损 → 强制卖出
    """
    db = SessionLocal()
    try:
        positions = (
            db.query(PortfolioPosition)
            .filter(PortfolioPosition.status == "holding")
            .filter(PortfolioPosition.quantity > 0)
            .all()
        )

        suggestions = []
        for pos in positions:
            score = (
                db.query(StockScore)
                .filter(StockScore.code == pos.code)
                .order_by(desc(StockScore.calc_date))
                .first()
            )
            ind = (
                db.query(StockIndicator)
                .filter(StockIndicator.code == pos.code)
                .order_by(desc(StockIndicator.trade_date))
                .first()
            )

            total = score.total_score if score else 50
            profit_pct = float(pos.profit_pct) if pos.profit_pct else 0
            rsi12 = _safe_float(ind.rsi12, 50) if ind else 50

            action = "HOLD"
            reason = ""
            target_pct = None

            if total < 50:
                action = "REDUCE"
                reason = f"评分{total}偏低"
                target_pct = 0
            elif total >= 85:
                action = "ADD"
                reason = f"评分{total}优秀"
                target_pct = min(20, 100 - total)
            elif profit_pct > 30:
                action = "REDUCE"
                reason = f"盈利{profit_pct:.1f}%丰厚, 建议减仓锁定"
                target_pct = max(0, pos.quantity // 2)
            elif profit_pct < -8:
                action = "SELL"
                reason = f"亏损{profit_pct:.1f}%触及止损线"
                target_pct = 0
            elif rsi12 > 85:
                action = "REDUCE"
                reason = f"RSI={rsi12:.0f}超买"
                target_pct = max(0, pos.quantity // 3)

            if action != "HOLD":
                suggestions.append({
                    "code": pos.code,
                    "name": pos.name or pos.code,
                    "action": action,
                    "current_pct": round(float(pos.market_value or 0) / 1000000 * 100, 2),
                    "profit_pct": round(profit_pct, 1),
                    "score": total,
                    "reason": reason,
                    "target_pct": target_pct,
                })

        return suggestions
    finally:
        db.close()


def daily_signal_report() -> Dict:
    """每日信号报告"""
    return {
        "buy_signals": top_buy_signals(10),
        "sell_signals": top_sell_signals(10),
        "rebalance": rebalance_suggestions(),
    }
