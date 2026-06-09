"""
风控 API 路由
"""
from fastapi import APIRouter, Query
from typing import Optional
from pydantic import BaseModel
from database import SessionLocal
from models import PortfolioPosition, StockIndicator
from sqlalchemy import desc

from services.risk_service import (
    fixed_stop, atr_stop, trailing_stop, time_stop,
    fixed_take, trailing_take, rsi_take,
    kelly_position, risk_position, size_position,
    check_portfolio_risk, check_position_risk, daily_risk_report,
)
from services.portfolio_service import get_portfolio_positions, get_portfolio_summary

router = APIRouter(prefix="/api/risk", tags=["风控"])


class PositionRiskRequest(BaseModel):
    code: str
    buy_price: float
    quantity: int = 100
    hold_days: int = 0


class SizeRequest(BaseModel):
    total_asset: float = 100000
    price: float
    win_rate: float = 0.45
    profit_loss_ratio: float = 2.0
    stop_loss_pct: float = 8.0
    account_risk_pct: float = 2.0


@router.get("/check/position/{code}")
async def check_single_position(code: str):
    """检查单只持仓风控"""
    db = SessionLocal()
    try:
        pos = (
            db.query(PortfolioPosition)
            .filter(PortfolioPosition.code == code)
            .filter(PortfolioPosition.status == "holding")
            .first()
        )
        if not pos:
            return {"success": False, "error": f"无 {code} 持仓"}

        # 取最新指标
        ind = (
            db.query(StockIndicator)
            .filter(StockIndicator.code == code)
            .order_by(desc(StockIndicator.trade_date))
            .first()
        )
        indicators = {}
        if ind:
            indicators = {
                "atr14": float(ind.atr14) if ind.atr14 else None,
                "rsi12": float(ind.rsi12) if ind.rsi12 else None,
                "boll_pct_b": float(ind.boll_pct_b) if ind.boll_pct_b else None,
                "ma20": float(ind.ma20) if ind.ma20 else None,
            }

        result = check_position_risk(
            buy_price=float(pos.buy_price) if pos.buy_price else 0,
            current_price=float(pos.current_price) if pos.current_price else 0,
            quantity=pos.quantity or 0,
            indicators=indicators,
            hold_days=0,
            profit_pct=float(pos.profit_pct) if pos.profit_pct else 0,
        )

        return {"success": True, "code": code, "name": pos.name, **result}
    finally:
        db.close()


@router.get("/check/portfolio")
async def check_portfolio():
    """组合整体风控"""
    summary = get_portfolio_summary()
    positions = get_portfolio_positions()

    report = check_portfolio_risk(
        total_asset=summary["total_asset"],
        market_value=summary["market_value"],
        cash=summary["cash"],
        positions=positions,
    )
    return {"success": True, **report}


@router.get("/report")
async def full_risk_report():
    """每日完整风控报告"""
    summary = get_portfolio_summary()
    positions = get_portfolio_positions()

    # 附带每只持仓的指标
    db = SessionLocal()
    try:
        for pos in positions:
            ind = (
                db.query(StockIndicator)
                .filter(StockIndicator.code == pos["code"])
                .order_by(desc(StockIndicator.trade_date))
                .first()
            )
            if ind:
                pos["indicators"] = {
                    "atr14": float(ind.atr14) if ind.atr14 else None,
                    "rsi12": float(ind.rsi12) if ind.rsi12 else None,
                }
    finally:
        db.close()

    report = daily_risk_report(
        positions, summary["total_asset"],
        summary["market_value"], summary["cash"],
    )
    return {"success": True, "summary": summary, **report}


@router.post("/calc/stop-loss")
async def calc_stop_loss(req: PositionRiskRequest):
    """计算止损价"""
    db = SessionLocal()
    try:
        ind = (
            db.query(StockIndicator)
            .filter(StockIndicator.code == req.code)
            .order_by(desc(StockIndicator.trade_date))
            .first()
        )
        atr = float(ind.atr14) if ind and ind.atr14 else 0
    finally:
        db.close()

    return {
        "success": True,
        "code": req.code,
        "fixed_stop": fixed_stop(req.buy_price, 8.0),
        "atr_stop": atr_stop(req.buy_price, atr, 2.0) if atr > 0 else None,
        "trailing_stop": trailing_stop(req.buy_price, req.buy_price, 5.0)[0],
    }


@router.post("/calc/position-size")
async def calc_position_size(req: SizeRequest):
    """计算建议仓位"""
    result = size_position(
        total_asset=req.total_asset,
        price=req.price,
        win_rate=req.win_rate,
        profit_loss_ratio=req.profit_loss_ratio,
        stop_loss_pct=req.stop_loss_pct,
        account_risk_pct=req.account_risk_pct,
    )
    return {"success": True, **result}


@router.get("/calc/kelly")
async def calc_kelly(
    win_rate: float = Query(0.45, description="胜率"),
    profit_loss_ratio: float = Query(2.0, description="盈亏比"),
):
    """凯利公式计算"""
    return {
        "success": True,
        "kelly_full": kelly_position(win_rate, profit_loss_ratio, 1.0),
        "kelly_half": kelly_position(win_rate, profit_loss_ratio, 0.5),
        "kelly_quarter": kelly_position(win_rate, profit_loss_ratio, 0.25),
    }
