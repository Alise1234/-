"""
信号中心 API
"""
from fastapi import APIRouter, Query
from services.signal_service import top_buy_signals, top_sell_signals, daily_signal_report

router = APIRouter(prefix="/api/signal", tags=["信号中心"])


@router.get("/buy")
async def buy_signals(limit: int = Query(10, ge=1, le=50)):
    """买入推荐"""
    data = top_buy_signals(limit=limit)
    return {"success": True, "count": len(data), "data": data}


@router.get("/sell")
async def sell_signals(limit: int = Query(10, ge=1, le=50)):
    """卖出警告"""
    data = top_sell_signals(limit=limit)
    return {"success": True, "count": len(data), "data": data}


@router.get("/rebalance")
async def rebalance():
    """调仓建议"""
    data = daily_signal_report()["rebalance"]
    return {"success": True, "count": len(data), "data": data}


@router.get("/daily")
async def daily_report():
    """每日完整信号报告"""
    report = daily_signal_report()
    return {"success": True, **report}
