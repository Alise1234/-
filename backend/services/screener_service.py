"""
股票筛选器

筛选条件:
  total_score >= 80
  ma20 > ma60 (多头排列)
  非ST
  rsi12 < 80 (未严重超买)
"""
import pandas as pd
import logging
from typing import List, Dict, Optional
from sqlalchemy import desc

from database import SessionLocal
from models import StockBasic, StockDailyK, StockIndicator, StockScore
from services.indicator_service import calc_all, indicators_summary
from services.score_service import calc_five_dim_scores

logger = logging.getLogger(__name__)


def get_top_stocks(
    db=None,
    limit: int = 20,
    min_score: int = 80,
) -> List[Dict]:
    """
    从数据库获取评分最高的股票，并验证筛选条件

    筛选逻辑:
      1. stock_score.total_score >= min_score
      2. 最新技术指标: ma20 > ma60
      3. 非ST
      4. rsi12 < 80

    返回:
        [{code, name, score, close, ma20, ma60, rsi12, ...}]
    """
    own_db = False
    if db is None:
        db = SessionLocal()
        own_db = True

    try:
        candidates = (
            db.query(StockScore, StockBasic)
            .join(StockBasic, StockScore.code == StockBasic.code)
            .filter(StockScore.total_score >= min_score)
            .filter(StockBasic.is_st == False)
            .order_by(desc(StockScore.total_score))
            .limit(limit * 3)  # 多取一些，后续再精细过滤
            .all()
        )

        results = []
        for score_row, basic in candidates:
            code = score_row.code

            # 取最新技术指标
            ind = (
                db.query(StockIndicator)
                .filter(StockIndicator.code == code)
                .order_by(desc(StockIndicator.trade_date))
                .first()
            )

            if ind is None:
                continue

            # 条件检查
            ma20 = float(ind.ma20) if ind.ma20 else 0
            ma60 = float(ind.ma60) if ind.ma60 else 0
            rsi12 = float(ind.rsi12) if ind.rsi12 else 50

            if ma20 <= ma60:
                continue  # 非多头排列
            if rsi12 >= 80:
                continue  # 超买过滤

            results.append({
                "code": code,
                "name": basic.name,
                "score": score_row.total_score,
                "trend_score": score_row.trend_score,
                "capital_score": score_row.capital_score,
                "valuation_score": score_row.valuation_score,
                "sentiment_score": score_row.sentiment_score,
                "risk_score": score_row.risk_score,
                "close": float(score_row.close) if score_row.close else None,
                "ma20": round(ma20, 2),
                "ma60": round(ma60, 2),
                "rsi12": round(rsi12, 2),
                "calc_date": str(score_row.calc_date),
            })

            if len(results) >= limit:
                break

        return results
    finally:
        if own_db:
            db.close()


def get_top_stocks_realtime(
    limit: int = 20,
    min_score: int = 80,
) -> List[Dict]:
    """
    实时计算模式：从日K线实时计算评分并筛选
    当数据库无缓存时使用
    """
    from services.akshare_service import get_spot_data

    db = SessionLocal()
    try:
        # 获取全市场列表
        spot_data = get_spot_data()
        results = []
        seen = set()

        for row in spot_data:
            if len(results) >= limit:
                break

            raw_code = str(row.get("代码", row.get("f12", "")))
            # 去掉新浪/东财前缀: sh600519→600519, sz000001→000001
            for prefix in ("sh", "sz", "bj", "SH", "SZ", "BJ"):
                if raw_code.startswith(prefix):
                    raw_code = raw_code[len(prefix):]
                    break
            code = raw_code.zfill(6)
            if not code or code in seen:
                continue
            seen.add(code)

            # 取该股票的日K线
            klines = (
                db.query(StockDailyK)
                .filter(StockDailyK.code == code)
                .order_by(desc(StockDailyK.trade_date))
                .limit(200)
                .all()
            )
            if len(klines) < 60:
                continue

            klines_asc = list(reversed(klines))
            df = pd.DataFrame([{
                "open": float(r.open or 0),
                "high": float(r.high or 0),
                "low": float(r.low or 0),
                "close": float(r.close or 0),
                "volume": int(r.volume or 0),
            } for r in klines_asc])

            try:
                scores = calc_five_dim_scores(df)
                ind = calc_all(df)
                summary = indicators_summary(ind, -1)

                total = scores["total_score"]
                if total < min_score:
                    continue

                ma20 = summary.get("ma20", 0) or 0
                ma60 = summary.get("ma60", 0) or 0
                rsi12 = summary.get("rsi12", 50) or 50

                if ma20 <= ma60 or rsi12 >= 80:
                    continue

                results.append({
                    "code": code,
                    "name": str(row.get("名称", row.get("f14", ""))),
                    "score": total,
                    "trend_score": scores["trend_score"],
                    "capital_score": scores["capital_score"],
                    "valuation_score": scores["valuation_score"],
                    "sentiment_score": scores["sentiment_score"],
                    "risk_score": scores["risk_score"],
                    "close": summary.get("close"),
                    "ma20": round(float(ma20), 2),
                    "ma60": round(float(ma60), 2),
                    "rsi12": round(float(rsi12), 2),
                    "calc_date": str(klines_asc[-1].trade_date) if klines_asc else None,
                })
            except Exception as e:
                logger.debug(f"  实时筛选 {code} 失败: {e}")
                continue

        return results
    finally:
        db.close()
