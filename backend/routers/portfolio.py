"""
投资组合 API 路由
"""
from fastapi import APIRouter, Query
from typing import Optional
from pydantic import BaseModel

from services.portfolio_service import (
    buy_stock, sell_stock, update_position_prices,
    get_portfolio_positions, get_portfolio_summary,
)

router = APIRouter(prefix="/api/portfolio", tags=["投资组合"])


class BuyRequest(BaseModel):
    code: str
    quantity: int = 100
    price: Optional[float] = None


class SellRequest(BaseModel):
    code: str
    quantity: Optional[int] = None
    price: Optional[float] = None


@router.post("/buy")
async def buy(req: BuyRequest):
    """买入股票"""
    return buy_stock(code=req.code, quantity=req.quantity, price=req.price)


@router.post("/sell")
async def sell(req: SellRequest):
    """卖出股票"""
    return sell_stock(code=req.code, quantity=req.quantity, price=req.price)


@router.get("/positions")
async def positions():
    """获取持仓列表"""
    data = get_portfolio_positions()
    return {"success": True, "count": len(data), "data": data}


@router.get("/summary")
async def summary(refresh: bool = False):
    """组合汇总统计 (refresh=true 时拉取实时价格, 默认用缓存价)"""
    data = get_portfolio_summary(refresh=refresh)
    return {"success": True, **data}


@router.post("/refresh")
async def refresh_prices():
    """刷新持仓实时价格"""
    return update_position_prices()
