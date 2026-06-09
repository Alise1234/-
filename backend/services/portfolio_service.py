"""
投资组合管理服务
"""
import logging
from datetime import date, datetime
from typing import Dict, List, Optional
from decimal import Decimal

from sqlalchemy import func

from database import SessionLocal
from models import PortfolioPosition, StockBasic, StockScore
from services.akshare_service import get_spot_data

logger = logging.getLogger(__name__)

INITIAL_CASH = Decimal("1000000")  # 初始资金 100万


def _code_price_map() -> Dict[str, Decimal]:
    """获取全市场最新价格（兼容东财和新浪两种数据源，超时保护）"""
    import concurrent.futures
    try:
        # 用独立线程+超时保护，防止 spot 数据源卡死
        with concurrent.futures.ThreadPoolExecutor(max_workers=1) as executor:
            future = executor.submit(_fetch_price_map)
            return future.result(timeout=12)  # 12秒硬超时
    except (concurrent.futures.TimeoutError, TimeoutError):
        logger.warning("获取实时价格超时（>12s），跳过价格更新")
        return {}
    except Exception as e:
        logger.warning(f"获取实时价格失败: {e}")
        return {}


def _fetch_price_map() -> Dict[str, Decimal]:
    """实际执行价格获取（在独立线程中运行）"""
    data = get_spot_data()
    result = {}
    for row in data:
        # 新浪: 代码="sh600519", 东财: f12="600519"
        raw_code = str(row.get("代码", "")).strip() or str(row.get("f12", "")).strip()
        # 去掉前缀: sh600519 → 600519, sz000001 → 000001, bj920000 → 920000
        for prefix in ("sh", "sz", "bj"):
            if raw_code.lower().startswith(prefix):
                raw_code = raw_code[len(prefix):]
                break
        code = raw_code.zfill(6)
        price = row.get("最新价") or row.get("f2", 0)
        if code and price:
            try:
                result[code] = Decimal(str(price))
            except Exception:
                pass
    return result


def create_position(db, code: str, name: str, buy_date: date,
                    buy_price: Decimal, quantity: int,
                    score: int = 0) -> PortfolioPosition:
    """创建新持仓"""
    pos = PortfolioPosition(
        code=code,
        name=name,
        buy_date=buy_date,
        buy_price=buy_price,
        current_price=buy_price,
        quantity=quantity,
        market_value=buy_price * quantity,
        profit_amount=Decimal("0"),
        profit_pct=Decimal("0"),
        score=score,
        status="holding",
    )
    db.add(pos)
    return pos


def buy_stock(code: str, quantity: int = 100, price: Optional[float] = None) -> Dict:
    """
    买入股票

    参数:
        code: 股票代码
        quantity: 买入数量（100股整数倍）
        price: 买入价，None则用实时价
    """
    db = SessionLocal()
    try:
        code = str(code).zfill(6)
        lots = max(100, (quantity // 100) * 100)

        # 获取实时价格
        if price is None:
            prices = _code_price_map()
            buy_price = prices.get(code)
            if buy_price is None:
                return {"success": False, "error": f"无法获取 {code} 实时价格"}
        else:
            buy_price = Decimal(str(price))

        # 检查持仓
        existing = (
            db.query(PortfolioPosition)
            .filter(PortfolioPosition.code == code)
            .filter(PortfolioPosition.status == "holding")
            .first()
        )
        if existing:
            # 加仓：计算新均价
            old_cost = existing.buy_price * existing.quantity
            new_cost = buy_price * lots
            total_qty = existing.quantity + lots
            avg_price = (old_cost + new_cost) / total_qty
            existing.buy_price = avg_price
            existing.quantity = total_qty
            existing.market_value = existing.current_price * total_qty
            existing.updated_at = datetime.now()
            trade_type = "add"
        else:
            # 持仓名称
            basic = db.query(StockBasic).filter(StockBasic.code == code).first()
            name = basic.name if basic else code

            existing = create_position(
                db, code, name, date.today(), buy_price, lots
            )
            trade_type = "new"

        db.commit()

        return {
            "success": True,
            "code": code,
            "trade_type": trade_type,
            "buy_price": float(buy_price),
            "quantity": lots,
            "total_cost": round(float(buy_price * lots), 2),
        }
    except Exception as e:
        db.rollback()
        return {"success": False, "error": str(e)}
    finally:
        db.close()


def sell_stock(code: str, quantity: Optional[int] = None, price: Optional[float] = None) -> Dict:
    """
    卖出股票

    参数:
        code: 股票代码
        quantity: 卖出数量，None则全仓卖出
        price: 卖出价，None则用实时价
    """
    db = SessionLocal()
    try:
        code = str(code).zfill(6)

        pos = (
            db.query(PortfolioPosition)
            .filter(PortfolioPosition.code == code)
            .filter(PortfolioPosition.status == "holding")
            .first()
        )
        if not pos:
            return {"success": False, "error": f"无 {code} 持仓"}

        # 获取实时价
        if price is None:
            prices = _code_price_map()
            sell_price = prices.get(code)
            if sell_price is None:
                return {"success": False, "error": f"无法获取 {code} 实时价格"}
        else:
            sell_price = Decimal(str(price))

        sell_qty = quantity if quantity else pos.quantity
        if sell_qty > pos.quantity:
            sell_qty = pos.quantity

        profit = (sell_price - pos.buy_price) * sell_qty
        pct = float((sell_price / pos.buy_price - 1) * 100) if pos.buy_price > 0 else 0

        if sell_qty >= pos.quantity:
            # 全仓卖出
            pos.status = "sold"
            pos.current_price = sell_price
            pos.market_value = Decimal("0")
            pos.profit_amount = profit
            pos.profit_pct = Decimal(str(round(pct, 4)))
            pos.quantity = 0
            pos.updated_at = datetime.now()
        else:
            # 减仓
            pos.quantity -= sell_qty
            pos.market_value = sell_price * pos.quantity
            pos.updated_at = datetime.now()

        db.commit()

        return {
            "success": True,
            "code": code,
            "sell_price": float(sell_price),
            "quantity": sell_qty,
            "profit_amount": round(float(profit), 2),
            "profit_pct": round(pct, 2),
            "remaining_qty": pos.quantity,
        }
    except Exception as e:
        db.rollback()
        return {"success": False, "error": str(e)}
    finally:
        db.close()


def update_position_prices() -> Dict:
    """批量更新所有持仓的实时价格"""
    db = SessionLocal()
    try:
        positions = (
            db.query(PortfolioPosition)
            .filter(PortfolioPosition.status == "holding")
            .all()
        )
        if not positions:
            return {"success": True, "updated": 0}

        prices = _code_price_map()
        updated = 0
        for pos in positions:
            cur_price = prices.get(pos.code)
            if cur_price and pos.quantity > 0:
                pos.current_price = cur_price
                pos.market_value = cur_price * pos.quantity
                pos.profit_amount = (cur_price - pos.buy_price) * pos.quantity
                if pos.buy_price > 0:
                    pos.profit_pct = (cur_price / pos.buy_price - 1) * 100
                pos.updated_at = datetime.now()
                updated += 1

        db.commit()
        return {"success": True, "updated": updated}
    except Exception as e:
        db.rollback()
        return {"success": False, "error": str(e)}
    finally:
        db.close()


def get_portfolio_positions() -> List[Dict]:
    """获取当前持仓列表"""
    db = SessionLocal()
    try:
        positions = (
            db.query(PortfolioPosition)
            .filter(PortfolioPosition.status == "holding")
            .filter(PortfolioPosition.quantity > 0)
            .all()
        )
        return [
            {
                "id": p.id,
                "code": p.code,
                "name": p.name,
                "buy_date": str(p.buy_date) if p.buy_date else None,
                "buy_price": float(p.buy_price) if p.buy_price else 0,
                "current_price": float(p.current_price) if p.current_price else 0,
                "quantity": p.quantity,
                "market_value": float(p.market_value) if p.market_value else 0,
                "profit_amount": round(float(p.profit_amount), 2) if p.profit_amount else 0,
                "profit_pct": round(float(p.profit_pct), 2) if p.profit_pct else 0,
                "score": p.score,
                "status": p.status,
            }
            for p in positions
        ]
    finally:
        db.close()


def get_portfolio_summary(refresh: bool = False) -> Dict:
    """
    组合汇总统计
    refresh=True 时拉取实时价格（慢），默认用数据库缓存价

    返回:
        total_asset, market_value, cash, total_profit, profit_pct,
        position_count, win_count, loss_count, win_rate
    """
    db = SessionLocal()
    try:
        if refresh:
            update_position_prices()

        positions = (
            db.query(PortfolioPosition)
            .filter(PortfolioPosition.status == "holding")
            .filter(PortfolioPosition.quantity > 0)
            .all()
        )

        # 计算持仓市值
        total_cost = Decimal("0")
        total_mv = Decimal("0")
        win_count = 0
        loss_count = 0

        for p in positions:
            total_cost += (p.buy_price or Decimal("0")) * (p.quantity or 0)
            total_mv += (p.market_value or Decimal("0"))
            pct = float(p.profit_pct or 0)
            if pct > 0:
                win_count += 1
            elif pct < 0:
                loss_count += 1

        cash = INITIAL_CASH - total_cost
        total_asset = cash + total_mv
        total_profit = total_mv - total_cost
        pnl_pct = float(total_profit / total_cost * 100) if total_cost > 0 else 0
        total_trades = win_count + loss_count
        win_rate = round(win_count / total_trades * 100, 1) if total_trades > 0 else 0

        return {
            "total_asset": round(float(total_asset), 2),
            "market_value": round(float(total_mv), 2),
            "cash": round(float(cash), 2),
            "total_cost": round(float(total_cost), 2),
            "total_profit": round(float(total_profit), 2),
            "profit_pct": round(pnl_pct, 2),
            "position_count": len(positions),
            "win_count": win_count,
            "loss_count": loss_count,
            "win_rate": win_rate,
        }
    finally:
        db.close()
