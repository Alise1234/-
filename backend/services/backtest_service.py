"""
回测引擎

支持三种策略:
  score_strategy   — 五维评分策略
  ma_cross_strategy — MA金叉死叉策略
  macd_strategy    — MACD金叉死叉策略
"""
import pandas as pd
import numpy as np
from typing import Dict, List, Optional, Tuple
from datetime import date, timedelta

from services.indicator_service import calc_all
from services.score_service import calc_five_dim_scores

# ============================================================
#  交易成本（A股现行标准，可配置）
# ============================================================
COMMISSION_RATE = 0.00025    # 佣金费率 0.025%（双边）
COMMISSION_MIN = 5.0          # 最低佣金 5元/笔
STAMP_DUTY_RATE = 0.0005     # 印花税 0.05%（仅卖出）
TRANSFER_FEE_RATE = 0.00001  # 过户费 0.001%（双边）


def set_cost_config(commission: float = 0.00025, commission_min: float = 5.0,
                    stamp_duty: float = 0.0005, transfer_fee: float = 0.00001):
    """全局配置交易成本参数"""
    global COMMISSION_RATE, COMMISSION_MIN, STAMP_DUTY_RATE, TRANSFER_FEE_RATE
    COMMISSION_RATE = commission
    COMMISSION_MIN = commission_min
    STAMP_DUTY_RATE = stamp_duty
    TRANSFER_FEE_RATE = transfer_fee


def _cost(price: float, shares: int, is_sell: bool = False) -> float:
    """计算单笔交易成本"""
    amount = price * shares
    commission = max(amount * COMMISSION_RATE, COMMISSION_MIN)
    stamp = amount * STAMP_DUTY_RATE if is_sell else 0
    transfer = amount * TRANSFER_FEE_RATE
    return round(commission + stamp + transfer, 2)


def buy(cash: float, price: float, shares: int = 100) -> Tuple[float, int]:
    """买入（A股100股整数倍，含佣金+过户费）"""
    lots = int(shares / 100) * 100
    fee = _cost(price, lots, is_sell=False)
    total = lots * price + fee
    if total > cash or lots == 0:
        return cash, 0
    return round(cash - total, 2), lots


def sell(cash: float, price: float, shares: int) -> Tuple[float, int]:
    """卖出（含佣金+印花税+过户费）"""
    fee = _cost(price, shares, is_sell=True)
    return round(cash + shares * price - fee, 2), 0


def buy_pct(cash: float, price: float, pct: float = 1.0) -> Tuple[float, int]:
    """按仓位百分比买入（>=1手=100股，买不起则返回0）"""
    target_amount = cash * pct
    lots = int(target_amount / price / 100) * 100
    if lots == 0:
        return cash, 0  # 资金不足以购买1手
    return buy(cash, price, lots)


def calc_metrics(
    df_trades: pd.DataFrame,
    initial_capital: float,
    final_equity: float,
    days: int,
) -> Dict:
    """计算回测指标"""
    trades = df_trades[df_trades["action"] != "hold"].copy()

    if trades.empty:
        return {
            "win_rate": 0.0, "max_drawdown": 0.0,
            "annual_return": 0.0, "sharpe_ratio": 0.0,
            "total_trades": 0, "profit_trades": 0, "loss_trades": 0,
            "final_equity": float(initial_capital),
        }

    profits = []
    buy_price = None
    for _, row in trades.iterrows():
        if row["action"] == "buy" and buy_price is None:
            buy_price = row["price"]
        elif row["action"] == "sell" and buy_price is not None:
            profits.append(row["price"] / buy_price - 1)
            buy_price = None

    total_trades = len(profits)
    if total_trades == 0:
        return {
            "win_rate": 0.0, "max_drawdown": 0.0,
            "annual_return": 0.0, "sharpe_ratio": 0.0,
            "total_trades": 0, "profit_trades": 0, "loss_trades": 0,
            "final_equity": float(final_equity),
        }

    profit_trades = sum(1 for p in profits if p > 0)
    loss_trades = sum(1 for p in profits if p <= 0)
    win_rate = round(profit_trades / total_trades * 100, 2)

    # CAGR: (1+R)^(252/days)-1（252交易日/年）
    TRADING_DAYS = 252.0
    total_return = final_equity / initial_capital - 1
    if days > 0 and total_return > -1:
        annual_return = round(((1 + total_return) ** (TRADING_DAYS / days) - 1) * 100, 2)
    else:
        annual_return = 0.0

    # 最大回撤
    equities = df_trades["equity"].values
    if len(equities) > 0:
        peak = np.maximum.accumulate(equities)
        drawdowns = (equities - peak) / peak * 100
        max_drawdown = round(float(abs(drawdowns.min())), 2)
    else:
        max_drawdown = 0.0

    # 夏普比率
    if len(equities) >= 2:
        daily_returns = np.diff(equities) / equities[:-1]
        mean_ret = np.mean(daily_returns)
        std_ret = np.std(daily_returns, ddof=1)
        sharpe = round(float(mean_ret / std_ret * np.sqrt(252)), 2) if std_ret > 0 else 0.0
    else:
        sharpe = 0.0

    return {
        "win_rate": win_rate,
        "max_drawdown": max_drawdown,
        "annual_return": annual_return,
        "sharpe_ratio": sharpe,
        "total_trades": total_trades,
        "profit_trades": profit_trades,
        "loss_trades": loss_trades,
        "final_equity": round(float(final_equity), 2),
        "total_return_pct": round(float(total_return * 100), 2),
        "cost_config": {
            "commission_rate": COMMISSION_RATE,
            "commission_min": COMMISSION_MIN,
            "stamp_duty_rate": STAMP_DUTY_RATE,
            "transfer_fee_rate": TRANSFER_FEE_RATE,
        },
    }


# ============================================================
#  策略定义
# ============================================================

def score_strategy(df: pd.DataFrame, initial_capital: float = 100000) -> Dict:
    """综合评分策略"""
    close = df["close"]
    cash = initial_capital
    shares = 0
    records = []

    for i in range(60, len(df)):
        price = float(close.iloc[i])

        try:
            cur_scores = calc_five_dim_scores(df.iloc[:i + 1])
            total = cur_scores["total_score"]
        except Exception:
            total = 50

        action = "hold"
        if total >= 80 and shares == 0:
            cash, shares = buy_pct(cash, price, 1.0)
            action = "buy"
        elif total <= 60 and shares > 0:
            cash, shares = sell(cash, price, shares)
            action = "sell"

        equity = cash + shares * price
        records.append({
            "date": i, "price": price, "action": action,
            "cash": cash, "shares": shares, "equity": equity, "score": total,
        })

    final_equity = records[-1]["equity"] if records else initial_capital
    df_trades = pd.DataFrame(records)
    metrics = calc_metrics(df_trades, initial_capital, final_equity, len(records))
    return {"metrics": metrics, "trades": records, "strategy": "score_strategy"}


def ma_cross_strategy(df: pd.DataFrame, initial_capital: float = 100000) -> Dict:
    """MA金叉死叉策略"""
    close = df["close"]
    ma5 = close.rolling(5).mean()
    ma20 = close.rolling(20).mean()
    cash = initial_capital
    shares = 0
    records = []

    for i in range(21, len(df)):
        price = float(close.iloc[i])
        action = "hold"

        ma5_now, ma5_prev = float(ma5.iloc[i]), float(ma5.iloc[i - 1])
        ma20_now, ma20_prev = float(ma20.iloc[i]), float(ma20.iloc[i - 1])

        gold_cross = ma5_prev <= ma20_prev and ma5_now > ma20_now
        death_cross = ma5_prev >= ma20_prev and ma5_now < ma20_now

        if gold_cross and shares == 0:
            cash, shares = buy_pct(cash, price, 1.0)
            action = "buy"
        elif death_cross and shares > 0:
            cash, shares = sell(cash, price, shares)
            action = "sell"

        equity = cash + shares * price
        records.append({
            "date": i, "price": price, "action": action,
            "cash": cash, "shares": shares, "equity": equity,
            "ma5": ma5_now, "ma20": ma20_now,
        })

    final_equity = records[-1]["equity"] if records else initial_capital
    df_trades = pd.DataFrame(records)
    metrics = calc_metrics(df_trades, initial_capital, final_equity, len(records))
    return {"metrics": metrics, "trades": records, "strategy": "ma_cross_strategy"}


def macd_strategy(df: pd.DataFrame, initial_capital: float = 100000) -> Dict:
    """MACD金叉死叉策略"""
    indicators = calc_all(df)
    dif = indicators["macd_dif"]
    dea = indicators["macd_dea"]
    close = df["close"]
    cash = initial_capital
    shares = 0
    records = []

    for i in range(35, len(df)):
        price = float(close.iloc[i])
        action = "hold"

        dif_now, dif_prev = float(dif.iloc[i]), float(dif.iloc[i - 1])
        dea_now, dea_prev = float(dea.iloc[i]), float(dea.iloc[i - 1])

        gold_cross = dif_prev <= dea_prev and dif_now > dea_now
        death_cross = dif_prev >= dea_prev and dif_now < dea_now

        if gold_cross and shares == 0:
            cash, shares = buy_pct(cash, price, 1.0)
            action = "buy"
        elif death_cross and shares > 0:
            cash, shares = sell(cash, price, shares)
            action = "sell"

        equity = cash + shares * price
        records.append({
            "date": i, "price": price, "action": action,
            "cash": cash, "shares": shares, "equity": equity,
            "dif": dif_now, "dea": dea_now,
        })

    final_equity = records[-1]["equity"] if records else initial_capital
    df_trades = pd.DataFrame(records)
    metrics = calc_metrics(df_trades, initial_capital, final_equity, len(records))
    return {"metrics": metrics, "trades": records, "strategy": "macd_strategy"}


STRATEGY_MAP = {
    "score": score_strategy,
    "ma_cross": ma_cross_strategy,
    "macd": macd_strategy,
}


def run_backtest(
    df: pd.DataFrame,
    strategy: str = "score",
    initial_capital: float = 100000,
) -> Dict:
    """运行回测"""
    if len(df) < 60:
        return {
            "metrics": {"error": f"数据不足: 至少60天, 当前{len(df)}天"},
            "trades": [], "strategy": strategy,
        }
    fn = STRATEGY_MAP.get(strategy)
    if fn is None:
        return {
            "metrics": {"error": f"未知策略: {strategy}"},
            "trades": [], "strategy": strategy,
        }
    return fn(df.copy(), initial_capital)
