"""
智能选股聚合 API V1.0
一次返回: 排名 + 宏观 + 资金 + 新闻 + 龙头
GET /api/screener/v2/overview
"""
from fastapi import APIRouter, Query
from typing import Optional, Dict, List
from datetime import datetime
import logging

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/screener/v2", tags=["智能选股"])


@router.get("/overview")
async def get_overview(
    industry: Optional[str] = Query(None, description="行业筛选"),
    min_score: int = Query(75, ge=0, le=100),
    exclude_st: bool = Query(True),
    sort_by: str = Query("total_score", description="排序字段"),
    limit: int = Query(30, ge=10, le=100),
):
    """智能选股全景数据 — 一屏全量"""
    result = {
        "macro": _get_macro(),
        "rankings": _get_rankings(industry, min_score, exclude_st, sort_by, limit),
        "sector_flow": _get_sector_flow(),
        "leaders": _get_leaders(),
        "news": _get_news(),
        "alerts": _get_alerts(),
        "updated_at": datetime.now().strftime("%H:%M:%S"),
    }
    return {"success": True, "data": result}


def _get_macro() -> Dict:
    """宏观脉搏"""
    macro = {
        "indices": [],
        "sentiment": {},
        "northbound_net": 0,
        "margin_balance": 0,
        "total_turnover": 0,
    }

    # 指数
    try:
        from services.akshare_service import get_spot_data
        # 简化: 从数据库缓存取
    except Exception:
        pass

    # 北向资金
    try:
        from services.score_service import _fetch_northbound
        ak = _get_ak_import()
        if ak:
            nb_data = _fetch_northbound(ak, "000300")  # 用沪深300代理
            if "northbound_market_active" in nb_data:
                macro["northbound_net"] = nb_data.get("northbound_net_5d", 0)
    except Exception:
        pass

    # 融资融券
    try:
        from services.capital_flow_service import fetch_margin_summary
        margin = fetch_margin_summary()
        macro["margin_balance"] = margin.get("total_margin_balance", 0)
    except Exception:
        pass

    return macro


def _get_rankings(industry: str = None, min_score: int = 75,
                   exclude_st: bool = True, sort_by: str = "total_score",
                   limit: int = 30) -> List[Dict]:
    """七维评分排名"""
    try:
        from database import SessionLocal
        from models import StockScore, StockBasic
        from sqlalchemy import desc
        db = SessionLocal()

        query = db.query(StockScore, StockBasic).join(
            StockBasic, StockScore.code == StockBasic.code
        ).filter(StockScore.total_score >= min_score)

        if exclude_st:
            query = query.filter(~StockBasic.name.ilike("%ST%"))

        if industry:
            query = query.filter(StockBasic.industry == industry)

        query = query.order_by(desc(getattr(StockScore, sort_by, StockScore.total_score))).limit(limit)
        rows = query.all()
        db.close()

        rankings = []
        for score, basic in rows:
            rankings.append({
                "code": score.code,
                "name": basic.name or score.code,
                "total_score": score.total_score or 0,
                "valuation": score.valuation_score or 0,
                "earnings_quality": getattr(score, "earnings_quality_score", 0) or 0,
                "growth": getattr(score, "growth_score", 0) or 0,
                "trend": score.trend_score or 0,
                "momentum": getattr(score, "momentum_score", 0) or 0,
                "health": getattr(score, "health_score", 0) or 0,
                "consensus": getattr(score, "consensus_score", 0) or 0,
                "risk": score.risk_score if hasattr(score, "risk_score") else 0,
                "signal": "BUY" if (score.total_score or 0) >= 80 else ("HOLD" if (score.total_score or 0) >= 60 else "SELL"),
                "price": float(score.close or 0) if score.close else 0,
                "change_pct": 0,
            })
        return rankings
    except Exception as e:
        logger.warning(f"排名查询失败: {e}")
        return []


def _get_sector_flow() -> List[Dict]:
    """板块资金流向"""
    try:
        from services.capital_flow_service import fetch_sector_fund_flow
        return fetch_sector_fund_flow()[:10]
    except Exception:
        return []


def _get_leaders() -> List[Dict]:
    """龙头梯队"""
    try:
        from database import SessionLocal
        from models import StockBasic, StockIndicator
        db = SessionLocal()
        # 简化: 取价格最高的前5只最近有连板记录的股票
        rows = db.query(StockBasic).filter(
            StockBasic.consecutive_boards > 0 if hasattr(StockBasic, "consecutive_boards") else True
        ).order_by(StockBasic.market_cap.desc()).limit(10).all()
        db.close()

        leaders = []
        for r in rows:
            boards = getattr(r, "consecutive_boards", 0) or 0
            if boards > 0:
                leaders.append({
                    "code": r.code,
                    "name": r.name,
                    "boards": boards,
                    "market_cap": float(getattr(r, "market_cap", 0) or 0),
                })
        leaders.sort(key=lambda x: x["boards"], reverse=True)
        return leaders[:8]
    except Exception:
        return []


def _get_news() -> List[Dict]:
    """实时新闻"""
    try:
        from services.news_service import fetch_market_news
        return fetch_market_news(15)
    except Exception:
        return []


def _get_alerts() -> List[Dict]:
    """风险预警"""
    alerts = []
    try:
        from database import SessionLocal
        from models import StockScore, StockBasic, StockIndicator
        db = SessionLocal()

        # 超买预警: RSI > 80
        try:
            rows = db.query(StockIndicator, StockBasic).join(
                StockBasic, StockIndicator.code == StockBasic.code
            ).filter(StockIndicator.rsi12 > 80).limit(5).all()
            for ind, basic in rows:
                alerts.append({
                    "type": "超买",
                    "code": ind.code,
                    "name": basic.name or ind.code,
                    "reason": f"RSI12={ind.rsi12:.0f} 严重超买",
                })
        except Exception:
            pass

        # 低分预警: 评分 < 40
        try:
            rows = db.query(StockScore, StockBasic).join(
                StockBasic, StockScore.code == StockBasic.code
            ).filter(StockScore.total_score < 40).limit(5).all()
            for score, basic in rows:
                if len(alerts) < 10:
                    alerts.append({
                        "type": "低分",
                        "code": score.code,
                        "name": basic.name or score.code,
                        "reason": f"总评分{score.total_score} 低于安全线",
                    })
        except Exception:
            pass

        db.close()
    except Exception:
        pass

    return alerts[:10]


def _get_ak_import():
    try:
        import akshare as ak
        return ak
    except ImportError:
        return None
