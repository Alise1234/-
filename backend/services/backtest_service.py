"""
回测引擎 V4.0 — 底层切换到 QuantEngine

保留旧 API 兼容:
  - run_backtest(df, strategy, initial_capital, stop_loss, take_profit)
  - buy / sell / buy_pct
  - STRATEGY_MAP

新增:
  - 止损止盈参数真实生效
  - 增强绩效指标（卡尔玛/盈亏比/月度热力）
  - 真实基准曲线替代假直线
"""
import pandas as pd
import numpy as np
from typing import Dict, List, Tuple, Optional
from datetime import date

from services.quant_engine import (
    QuantEngine, BacktestConfig,
    buy_lots as _buy_lots,
    trade_cost as _trade_cost,
    STRATEGY_REGISTRY,
)

# 全局引擎
_engine = QuantEngine()

# 交易成本配置
COMMISSION_RATE   = 0.00025
COMMISSION_MIN    = 5.0
STAMP_DUTY_RATE   = 0.0005
TRANSFER_FEE_RATE = 0.00001


def set_cost_config(commission=0.00025, commission_min=5.0, stamp_duty=0.0005, transfer_fee=0.00001):
    global COMMISSION_RATE, COMMISSION_MIN, STAMP_DUTY_RATE, TRANSFER_FEE_RATE
    COMMISSION_RATE = commission; COMMISSION_MIN = commission_min
    STAMP_DUTY_RATE = stamp_duty; TRANSFER_FEE_RATE = transfer_fee


def _cost(price, shares, is_sell=False):
    return _trade_cost(price, shares, is_sell)


def buy(cash, price, shares=100):
    fee = _trade_cost(price, int(shares / 100) * 100, False)
    total = (int(shares / 100) * 100) * price + fee
    if total > cash: return cash, 0
    return round(cash - total, 2), int(shares / 100) * 100


def sell(cash, price, shares):
    return _engine._sell(cash, price, shares)


def buy_pct(cash, price, pct=1.0):
    return _buy_lots(cash, price, pct)


# ============================================================
#  主回测入口（兼容旧接口 + 新参数）
# ============================================================
def run_backtest(
    df: pd.DataFrame,
    strategy: str = "ma_cross",
    initial_capital: float = 100_000,
    stop_loss_pct: float = -5.0,
    take_profit_pct: float = 15.0,
    position_pct: float = 1.0,
) -> Dict:
    """
    运行回测 V4.0

    参数:
      df:              K线数据 (必须含 close, high, low, open, volume)
      strategy:        策略名 (ma_cross / macd / score / boll_break / dual_ma)
      initial_capital: 初始资金
      stop_loss_pct:   止损百分比 (负值, 如 -5.0)
      take_profit_pct: 止盈百分比 (正值, 如 15.0)
      position_pct:    仓位比例 (0-1)

    返回:
      {"metrics": {...}, "trades": [...], "equity_curve": [...], "strategy": "..."}
    """
    if len(df) < 30:
        return {
            "metrics": {"error": f"数据不足: 至少30天，当前{len(df)}天"},
            "trades": [],
            "strategy": strategy,
        }

    if strategy not in STRATEGY_REGISTRY:
        return {
            "metrics": {"error": f"未知策略: {strategy}，可选: {list(STRATEGY_REGISTRY.keys())}"},
            "trades": [],
            "strategy": strategy,
        }

    config = BacktestConfig(
        strategy=strategy,
        initial_capital=initial_capital,
        stop_loss_pct=stop_loss_pct,
        take_profit_pct=take_profit_pct,
        position_pct=position_pct,
    )

    result = _engine.backtest(df.copy(), strategy, config)

    # 保持旧返回格式兼容
    return {
        "metrics": result["metrics"],
        "trades": result["trades"],
        "equity_curve": result.get("equity_curve", []),
        "benchmark_curve": result.get("benchmark_curve", []),
        "strategy": strategy,
    }


# ============================================================
#  旧策略函数（保留兼容）
# ============================================================
def score_strategy(df, initial_capital=100000, stop_loss=-5, take_profit=15):
    return run_backtest(df, "score", initial_capital, stop_loss, take_profit)


def ma_cross_strategy(df, initial_capital=100000, stop_loss=-5, take_profit=15):
    return run_backtest(df, "ma_cross", initial_capital, stop_loss, take_profit)


def macd_strategy(df, initial_capital=100000, stop_loss=-5, take_profit=15):
    return run_backtest(df, "macd", initial_capital, stop_loss, take_profit)


# 策略注册表（向后兼容）
STRATEGY_MAP = {
    "ma_cross": ma_cross_strategy,
    "macd": macd_strategy,
    "score": score_strategy,
    "boll_break": lambda df, cap=100000, sl=-5, tp=15: run_backtest(df, "boll_break", cap, sl, tp),
    "dual_ma":   lambda df, cap=100000, sl=-5, tp=15: run_backtest(df, "dual_ma", cap, sl, tp),
}


def calc_metrics(df_trades, initial_capital, final_equity, days):
    """旧 calc_metrics 兼容（不再使用，保留避免硬依赖报错）"""
    from services.quant_engine import compute_metrics
    records = []
    # 简单适配
    return {
        "win_rate": 0, "max_drawdown": 0, "annual_return": 0,
        "sharpe_ratio": 0, "total_trades": 0, "profit_trades": 0,
        "loss_trades": 0, "final_equity": float(initial_capital),
    }
