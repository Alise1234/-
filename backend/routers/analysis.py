"""
分析 API 路由（评分查询、指标查询、AI报告）
"""
from fastapi import APIRouter, Query
from sqlalchemy import desc, func, and_
from database import SessionLocal
from models import StockScore, StockIndicator
from services.score_service import calc_five_dim_scores
from services.indicator_service import calc_all, indicators_summary
from services.akshare_service import get_stock_daily
from services.ai_analysis_service import generate_analysis
import pandas as pd

router = APIRouter(prefix="/api/analysis", tags=["分析"])


@router.get("/scores/batch")
async def get_batch_scores(codes: str = Query(..., description="逗号分隔的股票代码，如 600519,000001,300750")):
    """
    批量获取多只股票最新五维评分（前端行情页用，避免 N+1 请求）
    优先读数据库，数据库无数据返回 null
    """
    code_list = list(dict.fromkeys(
        [c.strip().zfill(6) for c in codes.split(",") if c.strip()]
    ))[:100]  # 去重，最多100只

    db = SessionLocal()
    try:
        # 一次性查出所有 code 的最新评分
        from sqlalchemy import and_
        # 子查询：每个 code 的最新 calc_date
        latest_dates = (
            db.query(StockScore.code, func.max(StockScore.calc_date).label("max_date"))
            .filter(StockScore.code.in_(code_list))
            .group_by(StockScore.code)
            .subquery()
        )
        rows = (
            db.query(StockScore)
            .join(latest_dates, and_(
                StockScore.code == latest_dates.c.code,
                StockScore.calc_date == latest_dates.c.max_date,
            ))
            .all()
        )
        score_map = {}
        for r in rows:
            score_map[r.code] = {
                "total_score": r.total_score,
                "trend_score": r.trend_score,
                "capital_score": r.capital_score,
                "valuation_score": r.valuation_score,
                "sentiment_score": r.sentiment_score,
                "risk_score": r.risk_score,
                "calc_date": str(r.calc_date),
            }

        # 按传入顺序返回
        result = [{"code": c, **score_map[c]} if c in score_map else {"code": c, "total_score": None}
                  for c in code_list]

        return {"success": True, "count": len(result), "data": result}
    except Exception as e:
        return {"success": False, "error": str(e)}
    finally:
        db.close()


@router.get("/scores/{code}")
async def get_stock_scores(code: str):
    """
    获取单只股票最新五维评分
    优先读数据库，数据库无数据时实时计算
    """
    db = SessionLocal()
    try:
        row = (
            db.query(StockScore)
            .filter(StockScore.code == code)
            .order_by(desc(StockScore.calc_date))
            .first()
        )
        db.close()

        if row:
            return {
                "success": True,
                "code": code,
                "source": "db",
                "data": {
                    # 前端五维评分字段名
                    "valuation_score": row.valuation_score,
                    "profitability_score": row.valuation_score,  # PE/PB估值可代理盈利能力
                    "technical_score": row.trend_score,
                    "capital_score": row.capital_score,
                    "prosperity_score": row.sentiment_score,
                    # 原始六维字段（保留供扩展）
                    "total_score": row.total_score,
                    "trend_score": row.trend_score,
                    "sentiment_score": row.sentiment_score,
                    "risk_score": row.risk_score,
                    "close": float(row.close) if row.close else None,
                    "calc_date": str(row.calc_date),
                },
            }

        # 无缓存，实时计算
        raw = get_stock_daily(code, start_date=(pd.Timestamp.now() - pd.Timedelta(days=200)).strftime("%Y%m%d"))
        if not raw:
            return {"success": False, "error": "无K线数据"}

        df = pd.DataFrame([{
            "open": float(r.get("开盘", r.get("open", 0)) or 0),
            "high": float(r.get("最高", r.get("high", 0)) or 0),
            "low": float(r.get("最低", r.get("low", 0)) or 0),
            "close": float(r.get("收盘", r.get("close", 0)) or 0),
            "volume": int(r.get("成交量", r.get("volume", 0)) or 0),
            "trade_date": pd.to_datetime(r.get("日期", r.get("trade_date", None))),
        } for r in raw])
        df = df.dropna(subset=["trade_date"]).sort_values("trade_date").reset_index(drop=True)
        computed = calc_five_dim_scores(df)
        # 映射到前端五维评分字段名，同时保留原始字段供内部使用
        scores = {
            "valuation_score": computed["valuation_score"],
            "profitability_score": computed["valuation_score"],  # PE/PB估值可代理盈利能力
            "technical_score": computed["trend_score"],
            "capital_score": computed["capital_score"],
            "prosperity_score": computed["sentiment_score"],
            # 同时输出原始六维字段供扩展使用
            "total_score": computed["total_score"],
            "trend_score": computed["trend_score"],
            "sentiment_score": computed["sentiment_score"],
            "risk_score": computed["risk_score"],
            "details": computed.get("details", {}),
        }
        return {
            "success": True,
            "code": code,
            "source": "realtime",
            "data": scores,
        }
    except Exception as e:
        return {"success": False, "code": code, "error": str(e)}


@router.get("/indicators/{code}")
async def get_stock_indicators(code: str):
    """
    获取单只股票最新技术指标
    """
    db = SessionLocal()
    try:
        row = (
            db.query(StockIndicator)
            .filter(StockIndicator.code == code)
            .order_by(desc(StockIndicator.trade_date))
            .first()
        )
        db.close()

        if row:
            return {
                "success": True,
                "code": code,
                "source": "db",
                "data": {
                    "trade_date": str(row.trade_date),
                    "ma5": float(row.ma5) if row.ma5 else None,
                    "ma10": float(row.ma10) if row.ma10 else None,
                    "ma20": float(row.ma20) if row.ma20 else None,
                    "ma60": float(row.ma60) if row.ma60 else None,
                    "macd_dif": float(row.macd_dif) if row.macd_dif else None,
                    "macd_dea": float(row.macd_dea) if row.macd_dea else None,
                    "macd_hist": float(row.macd_hist) if row.macd_hist else None,
                    "rsi6": float(row.rsi6) if row.rsi6 else None,
                    "rsi12": float(row.rsi12) if row.rsi12 else None,
                    "rsi24": float(row.rsi24) if row.rsi24 else None,
                    "boll_upper": float(row.boll_upper) if row.boll_upper else None,
                    "boll_mid": float(row.boll_mid) if row.boll_mid else None,
                    "boll_lower": float(row.boll_lower) if row.boll_lower else None,
                    "kdj_k": float(row.kdj_k) if row.kdj_k else None,
                    "kdj_d": float(row.kdj_d) if row.kdj_d else None,
                    "kdj_j": float(row.kdj_j) if row.kdj_j else None,
                    "atr14": float(row.atr14) if row.atr14 else None,
                },
            }

        # 实时计算
        raw = get_stock_daily(code, start_date=(pd.Timestamp.now() - pd.Timedelta(days=200)).strftime("%Y%m%d"))
        if not raw:
            return {"success": False, "error": "无K线数据"}

        df = pd.DataFrame([{
            "open": float(r.get("开盘", r.get("open", 0)) or 0),
            "high": float(r.get("最高", r.get("high", 0)) or 0),
            "low": float(r.get("最低", r.get("low", 0)) or 0),
            "close": float(r.get("收盘", r.get("close", 0)) or 0),
            "volume": int(r.get("成交量", r.get("volume", 0)) or 0),
            "trade_date": pd.to_datetime(r.get("日期", r.get("trade_date", None))),
        } for r in raw])
        df = df.dropna(subset=["trade_date"]).sort_values("trade_date").reset_index(drop=True)

        indicators = calc_all(df)
        summary = indicators_summary(indicators, idx=-1)
        return {
            "success": True,
            "code": code,
            "source": "realtime",
            "data": summary,
        }
    except Exception as e:
        return {"success": False, "code": code, "error": str(e)}


@router.get("/top")
async def get_top_scores(limit: int = Query(20, ge=1, le=100)):
    """
    获取评分最高的 N 只股票
    """
    db = SessionLocal()
    try:
        rows = (
            db.query(StockScore)
            .order_by(desc(StockScore.total_score))
            .limit(limit)
            .all()
        )
        return {
            "success": True,
            "count": len(rows),
            "data": [
                {
                    "code": r.code,
                    "calc_date": str(r.calc_date),
                    "total_score": r.total_score,
                    "trend_score": r.trend_score,
                    "capital_score": r.capital_score,
                    "valuation_score": r.valuation_score,
                    "sentiment_score": r.sentiment_score,
                    "risk_score": r.risk_score,
                }
                for r in rows
            ],
        }
    except Exception as e:
        return {"success": False, "error": str(e)}
    finally:
        db.close()


@router.get("/report/{code}")
async def get_analysis_report(code: str):
    """
    获取单只股票 AI 分析报告

    包含: 趋势分析、资金分析、风险分析、持仓建议、买卖区间、止损位
    """
    result = generate_analysis(code)
    if "error" in result:
        return {"success": False, "code": code, "error": result["error"]}
    return {"success": True, **result}
