"""
风控系统

止损:
  fixed_stop      固定百分比止损
  atr_stop        ATR 动态止损
  trailing_stop   移动止损（从最高点回落）
  time_stop       时间止损（持仓N日不涨）

止盈:
  fixed_take       固定百分比止盈
  trailing_take    移动止盈（从最高点回落）
  rsi_take         RSI 超买止盈

仓位:
  kelly_position   凯利公式
  risk_position    基于风险的仓位
  single_limit     单票上限
  sector_limit     行业上限

风控检查:
  check_portfolio_risk  组合整体风控
  check_position_risk   单票风控
"""
import numpy as np
from typing import Dict, List, Optional, Tuple
from decimal import Decimal


# ============================================================
#  止损
# ============================================================

def fixed_stop(buy_price: float, stop_pct: float = 8.0) -> float:
    """固定百分比止损"""
    return round(buy_price * (1 - stop_pct / 100), 2)


def atr_stop(buy_price: float, atr14: float, multiplier: float = 2.0) -> float:
    """ATR 止损：买入价 - N倍ATR"""
    if atr14 <= 0:
        return fixed_stop(buy_price, 5.0)
    return round(buy_price - multiplier * atr14, 2)


def trailing_stop(peak_price: float, current_price: float,
                  trail_pct: float = 5.0) -> Tuple[float, bool]:
    """
    移动止损：从最高点回落 N% 触发

    返回: (止损价, 是否触发)
    """
    stop = round(peak_price * (1 - trail_pct / 100), 2)
    triggered = current_price <= stop
    return stop, triggered


def time_stop(hold_days: int, max_days: int = 20,
              profit_pct: float = 0) -> Tuple[bool, str]:
    """
    时间止损：持仓超过 N 日且不涨

    返回: (是否触发, 原因)
    """
    if hold_days > max_days * 2 and profit_pct <= -10:
        return True, f"持仓{hold_days}天亏损{profit_pct:.1f}%，强制止损"
    if hold_days > max_days and profit_pct < 2:
        return True, f"持仓{hold_days}天仅盈利{profit_pct:.1f}%，效率过低"
    if hold_days > max_days * 1.5 and profit_pct < 0:
        return True, f"持仓{hold_days}天仍亏损，时间成本过高"
    return False, ""


# ============================================================
#  止盈
# ============================================================

def fixed_take(buy_price: float, take_pct: float = 15.0) -> float:
    """固定百分比止盈"""
    return round(buy_price * (1 + take_pct / 100), 2)


def trailing_take(peak_price: float, buy_price: float,
                  trail_pct: float = 5.0) -> Tuple[float, bool]:
    """
    移动止盈：从最高点回落 N% 锁定利润

    返回: (止盈价, 是否触发)
    """
    if peak_price <= buy_price:
        return fixed_take(buy_price, 15.0), False
    stop = round(peak_price * (1 - trail_pct / 100), 2)
    triggered = peak_price >= buy_price * 1.10  # 至少盈利10%才启用
    return stop, triggered


def rsi_take(rsi: float, profit_pct: float) -> Tuple[bool, str]:
    """RSI 超买止盈"""
    if rsi > 85:
        return True, f"RSI={rsi:.0f} 严重超买，建议止盈"
    if rsi > 75 and profit_pct > 15:
        return True, f"RSI={rsi:.0f} 偏高且盈利{profit_pct:.1f}%，可部分止盈"
    if rsi > 70 and profit_pct > 30:
        return True, f"RSI={rsi:.0f} 盈利丰厚{profit_pct:.1f}%，建议减仓"
    return False, ""


# ============================================================
#  仓位控制
# ============================================================

def kelly_position(win_rate: float, profit_loss_ratio: float,
                   fraction: float = 0.5) -> float:
    """
    凯利公式（半凯利）

    参数:
        win_rate: 胜率 (0-1)
        profit_loss_ratio: 盈亏比 (平均盈利/平均亏损)
        fraction: 凯利比例 (0.5=半凯利)

    返回: 建议仓位百分比
    """
    if win_rate <= 0 or profit_loss_ratio <= 0:
        return 10.0
    q = 1 - win_rate
    kelly = (win_rate * profit_loss_ratio - q) / profit_loss_ratio
    kelly = max(0, kelly)
    return round(kelly * fraction * 100, 1)


def risk_position(account_risk: float, stop_loss_pct: float) -> float:
    """
    基于风险的仓位：亏损不超过账户N%时能买多少

    参数:
        account_risk: 单笔可承受亏损（占账户百分比）
        stop_loss_pct: 止损距离（百分比）
    """
    if stop_loss_pct <= 0:
        return 5.0
    return round(account_risk / stop_loss_pct * 100, 1)


def single_stock_limit(proposed_pct: float, max_pct: float = 20.0) -> float:
    """单票仓位上限"""
    return min(proposed_pct, max_pct)


def sector_limit(positions_by_sector: Dict[str, float],
                 sector: str, max_sector_pct: float = 30.0) -> float:
    """行业仓位上限：同行业总仓位不超过 N%"""
    current = sum(positions_by_sector.values())
    if current >= max_sector_pct:
        return 0.0
    return round(max_sector_pct - current, 1)


# ============================================================
#  组合风控
# ============================================================

def check_portfolio_risk(
    total_asset: float,
    market_value: float,
    cash: float,
    positions: List[Dict],
    max_position_count: int = 20,
    max_single_pct: float = 20.0,
    max_total_pct: float = 80.0,
    max_drawdown_pct: float = 15.0,
    peak_asset: Optional[float] = None,
) -> Dict:
    """
    组合整体风控检查

    返回:
        {safe, warnings[], alerts[], recommended_cash_pct}
    """
    warnings = []
    alerts = []

    # 总仓位
    position_pct = market_value / total_asset * 100 if total_asset > 0 else 0
    if position_pct > max_total_pct:
        alerts.append(f"总仓位{position_pct:.1f}%超过上限{max_total_pct}%")
    elif position_pct > max_total_pct * 0.9:
        warnings.append(f"总仓位{position_pct:.1f}%接近上限{max_total_pct}%")

    # 持仓数量
    if len(positions) > max_position_count:
        warnings.append(f"持仓{len(positions)}只超过建议上限{max_position_count}只")

    # 现金比例
    cash_pct = cash / total_asset * 100 if total_asset > 0 else 0
    if cash_pct < 10:
        alerts.append(f"现金仅{cash_pct:.1f}%，无加仓空间")
    elif cash_pct < 20:
        warnings.append(f"现金比例{cash_pct:.1f}%偏低")

    # 单票集中度
    for p in positions:
        pct = p.get("market_value", 0) / total_asset * 100 if total_asset > 0 else 0
        if pct > max_single_pct:
            alerts.append(f"{p.get('code')}仓位{pct:.1f}%超过单票上限{max_single_pct}%")

    # 回撤
    if peak_asset and peak_asset > 0:
        drawdown = (1 - total_asset / peak_asset) * 100
        if drawdown > max_drawdown_pct:
            alerts.append(f"组合回撤{drawdown:.1f}%超过{max_drawdown_pct}%警戒线")

    # 盈利/亏损比
    win = sum(1 for p in positions if p.get("profit_pct", 0) > 0)
    loss = sum(1 for p in positions if p.get("profit_pct", 0) < 0)
    if loss > win * 2 and loss > 3:
        warnings.append(f"亏损持仓{loss}只, 盈利{win}只, 比例失衡")

    safe = len(alerts) == 0
    recommended_cash_pct = min(50, max(10, 100 - position_pct + len(alerts) * 5))

    return {
        "safe": safe,
        "warnings": warnings,
        "alerts": alerts,
        "position_pct": round(position_pct, 1),
        "cash_pct": round(cash_pct, 1),
        "recommended_cash_pct": round(recommended_cash_pct, 1),
    }


def check_position_risk(
    buy_price: float,
    current_price: float,
    quantity: int,
    indicators: Optional[Dict] = None,
    hold_days: int = 0,
    profit_pct: float = 0,
) -> Dict:
    """
    单票风控检查

    指标:
        indicators = {atr14, rsi12, boll_pct_b, ma20}
    """
    if indicators is None:
        indicators = {}

    result = {
        "action": "HOLD",
        "stop_loss": None,
        "take_profit": None,
        "alerts": [],
        "reason": "",
    }

    price = current_price if current_price > 0 else buy_price
    peak = max(buy_price, price)
    atr = indicators.get("atr14", 0) or 0
    rsi12 = indicators.get("rsi12", 50) or 50

    # 止损检查
    sl_fixed = fixed_stop(buy_price, 8.0)
    sl_atr = atr_stop(buy_price, atr, 2.0) if atr > 0 else sl_fixed
    sl_effective = max(sl_fixed, sl_atr)
    result["stop_loss"] = round(sl_effective, 2)

    if price <= sl_effective:
        result["action"] = "STOP_LOSS"
        result["alerts"].append(f"触发止损: {sl_effective:.2f}")
        result["reason"] = f"当前价{price:.2f}低于止损{sl_effective:.2f}"
        return result

    # 移动止损
    sl_trail, trail_trig = trailing_stop(peak, price, 5.0)
    if trail_trig and peak > buy_price * 1.05:
        result["action"] = "STOP_LOSS"
        result["stop_loss"] = sl_trail
        result["alerts"].append(f"触发移动止损: 从{peak:.2f}回落至{price:.2f}")
        result["reason"] = f"移动止损触发"
        return result

    # 时间止损
    ts_trig, ts_reason = time_stop(hold_days, 20, profit_pct)
    if ts_trig:
        result["action"] = "STOP_LOSS"
        result["alerts"].append(ts_reason)

    # 止盈检查
    tp_fixed = fixed_take(buy_price, 15.0)
    result["take_profit"] = round(tp_fixed, 2)

    if price >= tp_fixed:
        result["action"] = "TAKE_PROFIT"
        result["alerts"].append(f"触发固定止盈: {tp_fixed:.2f}")
        result["reason"] = f"价格{price:.2f}达到止盈{tp_fixed:.2f}"
        return result

    # RSI 止盈
    rsi_trig, rsi_reason = rsi_take(rsi12, profit_pct)
    if rsi_trig:
        result["action"] = "TAKE_PROFIT"
        result["alerts"].append(rsi_reason)
        result["reason"] = rsi_reason

    # 正常：更新移动止损价
    result["stop_loss"] = max(sl_effective, sl_trail)
    if not result["alerts"]:
        result["reason"] = "风控正常"

    return result


def size_position(
    total_asset: float,
    price: float,
    win_rate: float = 0.45,
    profit_loss_ratio: float = 2.0,
    stop_loss_pct: float = 8.0,
    account_risk_pct: float = 2.0,
    max_single_pct: float = 20.0,
    sector_pct: float = 0.0,
    max_sector_pct: float = 30.0,
) -> Dict:
    """
    综合仓位计算

    返回:
        {shares, amount, position_pct, method}
    """
    # 凯利仓位
    kelly_pct = kelly_position(win_rate, profit_loss_ratio, 0.5)

    # 风险仓位
    risk_pct = risk_position(account_risk_pct, stop_loss_pct)

    # 取最保守的
    proposed_pct = min(kelly_pct, risk_pct)

    # 单票上限
    proposed_pct = single_stock_limit(proposed_pct, max_single_pct)

    # 行业上限
    remaining_sector = max_sector_pct - sector_pct
    if remaining_sector <= 0:
        return {"shares": 0, "amount": 0, "position_pct": 0, "method": "sector_full"}

    proposed_pct = min(proposed_pct, remaining_sector)

    amount = total_asset * proposed_pct / 100
    lots = max(0, int(amount / price / 100) * 100)
    actual_amount = lots * price
    actual_pct = actual_amount / total_asset * 100 if total_asset > 0 else 0

    return {
        "shares": lots,
        "amount": round(actual_amount, 2),
        "position_pct": round(actual_pct, 1),
        "kelly_pct": kelly_pct,
        "risk_pct": risk_pct,
    }


def daily_risk_report(
    positions: List[Dict],
    total_asset: float,
    market_value: float,
    cash: float,
) -> Dict:
    """
    每日风控报告
    """
    report = check_portfolio_risk(total_asset, market_value, cash, positions)

    position_alerts = []
    for pos in positions:
        check = check_position_risk(
            buy_price=pos.get("buy_price", 0),
            current_price=pos.get("current_price", 0),
            quantity=pos.get("quantity", 0),
            hold_days=pos.get("hold_days", 0),
            profit_pct=pos.get("profit_pct", 0),
            indicators=pos.get("indicators"),
        )
        if check["action"] in ("STOP_LOSS", "TAKE_PROFIT"):
            position_alerts.append({
                "code": pos.get("code"),
                "name": pos.get("name"),
                "action": check["action"],
                "reason": check["reason"],
                "stop_loss": check["stop_loss"],
                "take_profit": check["take_profit"],
            })

    report["position_alerts"] = position_alerts
    report["alert_count"] = len(report["alerts"]) + len(position_alerts)
    return report
