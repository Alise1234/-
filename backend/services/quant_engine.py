"""
统一量化引擎 QuantEngine V4.0

设计原则:
  1. 策略即插即用 — Strategy 基类统一接口
  2. 止损/止盈/仓位 — 每个策略强制内建
  3. 成本真实 — 佣金+印花税+过户费
  4. 指标完整 — CAGR/夏普/卡尔玛/最大回撤/盈亏比/月度热力
  5. 基准真实 — 从数据库拉沪深300逐日数据

用法:
  engine = QuantEngine()
  result = engine.backtest("600519", "ma_cross", capital=100000, stop_loss=5, take_profit=15)
"""

import pandas as pd
import numpy as np
import logging
import re
from typing import Dict, List, Optional, Tuple, Any
from abc import ABC, abstractmethod
from dataclasses import dataclass, field

logger = logging.getLogger(__name__)


# ============================================================
#  交易成本常量（A股 2026 现行）
# ============================================================
COMMISSION_RATE = 0.00025       # 佣金 0.025%
COMMISSION_MIN  = 5.0           # 最低佣金 5元
STAMP_DUTY_RATE = 0.0005        # 印花税 0.05%（卖）
TRANSFER_FEE    = 0.00001       # 过户费 0.001%


def trade_cost(price: float, shares: int, is_sell: bool = False) -> float:
    """单边交易成本"""
    amt = price * shares
    c = max(amt * COMMISSION_RATE, COMMISSION_MIN)
    s = amt * STAMP_DUTY_RATE if is_sell else 0
    t = amt * TRANSFER_FEE
    return round(c + s + t, 2)


def buy_lots(cash: float, price: float, pct: float = 1.0) -> Tuple[float, int]:
    """买入: 按可用资金百分比，100股整数倍"""
    if price <= 0:
        return cash, 0
    target = cash * pct
    lots = int(target / price / 100) * 100
    if lots < 100:
        return cash, 0
    fee = trade_cost(price, lots, is_sell=False)
    if lots * price + fee > cash:
        return cash, 0
    return round(cash - lots * price - fee, 2), lots


@dataclass
class BacktestConfig:
    """回测配置"""
    code: str = ""
    strategy: str = "ma_cross"
    initial_capital: float = 100_000
    stop_loss_pct: float = -5.0       # 负值=百分比止损
    take_profit_pct: float = 15.0     # 正-值=百分比止盈
    position_pct: float = 1.0         # 仓位比例
    start_date: Optional[str] = None
    end_date: Optional[str] = None


@dataclass
class TradeRecord:
    """单笔交易记录"""
    date: str = ""
    price: float = 0.0
    action: str = "hold"           # buy / sell / stop_loss / take_profit / hold
    cash: float = 0.0
    shares: int = 0
    equity: float = 0.0
    return_pct: float = 0.0


# ============================================================
#  策略基类
# ============================================================
class Strategy(ABC):
    """策略基类 — 所有策略继承此类"""
    name: str = "base"
    label: str = "基础策略"

    def __init__(self, stop_loss_pct: float = -5.0, take_profit_pct: float = 15.0, position_pct: float = 1.0):
        self.stop_loss_pct = stop_loss_pct
        self.take_profit_pct = take_profit_pct
        self.position_pct = position_pct

    @abstractmethod
    def generate_signal(self, df: pd.DataFrame, idx: int) -> str:
        """生成信号: 'buy' | 'sell' | 'hold'"""
        ...

    def check_risk(self, entry_price: float, current_price: float, holding: bool) -> str:
        """风控检测: 'stop_loss' | 'take_profit' | 'ok'"""
        if not holding or entry_price <= 0:
            return "ok"
        pnl_pct = (current_price / entry_price - 1) * 100
        if self.stop_loss_pct < 0 and pnl_pct <= self.stop_loss_pct:
            return "stop_loss"
        if self.take_profit_pct > 0 and pnl_pct >= self.take_profit_pct:
            return "take_profit"
        return "ok"


# ============================================================
#  五大策略实现
# ============================================================

class MACrossStrategy(Strategy):
    """均线金叉策略: MA5上穿MA20买入, MA5下穿MA20卖出"""
    name = "ma_cross"
    label = "均线金叉策略"

    def __init__(self, fast: int = 5, slow: int = 20, **kwargs):
        super().__init__(**kwargs)
        self.fast = fast
        self.slow = slow

    def generate_signal(self, df: pd.DataFrame, idx: int) -> str:
        if idx < self.slow:
            return "hold"
        close = df["close"]
        ma_f = close.rolling(self.fast).mean()
        ma_s = close.rolling(self.slow).mean()
        if idx < 1:
            return "hold"
        f_now, f_prev = float(ma_f.iloc[idx]), float(ma_f.iloc[idx-1])
        s_now, s_prev = float(ma_s.iloc[idx]), float(ma_s.iloc[idx-1])
        if f_prev <= s_prev and f_now > s_now:
            return "buy"
        if f_prev >= s_prev and f_now < s_now:
            return "sell"
        return "hold"


class MACDStrategy(Strategy):
    """MACD动能策略: DIF上穿DEA买入, DIF下穿DEA卖出"""
    name = "macd"
    label = "MACD动能策略"

    def generate_signal(self, df: pd.DataFrame, idx: int) -> str:
        if idx < 35:
            return "hold"
        close = df["close"]
        ema12 = close.ewm(span=12, adjust=False).mean()
        ema26 = close.ewm(span=26, adjust=False).mean()
        dif = ema12 - ema26
        dea = dif.ewm(span=9, adjust=False).mean()
        d_now, d_prev = float(dif.iloc[idx]), float(dif.iloc[idx-1])
        e_now, e_prev = float(dea.iloc[idx]), float(dea.iloc[idx-1])
        if d_prev <= e_prev and d_now > e_now:
            return "buy"
        if d_prev >= e_prev and d_now < e_now:
            return "sell"
        return "hold"


class ScoreStrategy(Strategy):
    """五维评分策略: total>=80买入, <=50卖出"""
    name = "score"
    label = "五维评分策略"

    def generate_signal(self, df: pd.DataFrame, idx: int) -> str:
        if idx < 60:
            return "hold"
        try:
            from services.score_service import calc_five_dim_scores  # noqa: E402 (lazy import to avoid circular dep)
            scores = calc_five_dim_scores(df.iloc[:idx+1])
            total = scores["total_score"]
            if total >= 80: return "buy"
            if total <= 50: return "sell"
        except Exception as e:
            logger.warning(f"ScoreStrategy: 评分计算失败 idx={idx}: {e}")
        return "hold"


class BollBreakStrategy(Strategy):
    """布林突破策略: 价格>上轨买入, 价格<中轨卖出"""
    name = "boll_break"
    label = "布林突破策略"

    def generate_signal(self, df: pd.DataFrame, idx: int) -> str:
        if idx < 20:
            return "hold"
        close = df["close"]
        mid = close.rolling(20).mean()
        std = close.rolling(20).std()
        upper = mid + 2 * std
        p = float(close.iloc[idx])
        m = float(mid.iloc[idx])
        u = float(upper.iloc[idx])
        if p > u:
            return "buy"
        if p < m:
            return "sell"
        return "hold"


class DualMAStrategy(Strategy):
    """双均线趋势: MA20>MA60且价格>MA10买入, MA20<MA60卖出"""
    name = "dual_ma"
    label = "双均线趋势策略"

    def generate_signal(self, df: pd.DataFrame, idx: int) -> str:
        if idx < 60:
            return "hold"
        close = df["close"]
        ma10 = close.rolling(10).mean()
        ma20 = close.rolling(20).mean()
        ma60 = close.rolling(60).mean()
        p = float(close.iloc[idx])
        m20, m60 = float(ma20.iloc[idx]), float(ma60.iloc[idx])
        m10 = float(ma10.iloc[idx])
        if m20 > m60 and p > m10:
            return "buy"
        if m20 < m60:
            return "sell"
        return "hold"


# 策略注册表
STRATEGY_REGISTRY: Dict[str, type] = {
    "ma_cross":   MACrossStrategy,
    "macd":       MACDStrategy,
    "score":      ScoreStrategy,
    "boll_break": BollBreakStrategy,
    "dual_ma":    DualMAStrategy,
}


# ============================================================
#  绩效指标计算
# ============================================================
def compute_metrics(records: List[TradeRecord], initial_capital: float) -> Dict[str, Any]:
    """从交易记录计算全套绩效指标"""
    if not records:
        return _empty_metrics(initial_capital)

    n = len(records)
    final_equity = records[-1].equity
    total_return = final_equity / initial_capital - 1

    # 计算交易日数（去 hold 日）
    equities = np.array([r.equity for r in records])
    days = len(equities)

    # 年化收益 (252交易日)
    if days > 1 and total_return > -1:
        annual_return = round(((1 + total_return) ** (252.0 / days) - 1) * 100, 2)
    else:
        annual_return = 0.0

    # 最大回撤
    peak = np.maximum.accumulate(equities)
    drawdowns = (equities - peak) / peak * 100
    max_dd = round(float(abs(drawdowns.min())), 2)

    # 卡尔玛比率
    calmar = round(annual_return / max_dd, 2) if max_dd > 0 else 0.0

    # 夏普比率
    if len(equities) >= 5:
        daily_ret = np.diff(equities) / (equities[:-1] + 1e-10)
        # 过滤掉买入日（equity 跳变）
        clean_ret = daily_ret[np.abs(daily_ret) < 0.3]  # 过滤 >30% 单日波动
        if len(clean_ret) >= 3:
            mean_r = np.mean(clean_ret)
            std_r = np.std(clean_ret, ddof=1)
            sharpe = round(float(mean_r / std_r * np.sqrt(252)), 2) if std_r > 0 else 0.0
        else:
            sharpe = 0.0
    else:
        sharpe = 0.0

    # 交易统计
    trades = [r for r in records if r.action in ("buy", "sell", "stop_loss", "take_profit")]
    buy_actions = [r for r in trades if r.action == "buy"]
    sell_actions = [r for r in trades if r.action != "buy"]

    # 配对买卖计算盈亏比
    profits = []
    entry_price = None
    for r in trades:
        if r.action == "buy":
            entry_price = r.price
        elif entry_price and r.action in ("sell", "stop_loss", "take_profit"):
            profits.append(r.price / entry_price - 1)
            entry_price = None

    total_trades = len(profits)
    if total_trades > 0:
        win_trades = sum(1 for p in profits if p > 0)
        loss_trades = sum(1 for p in profits if p <= 0)
        win_rate = round(win_trades / total_trades * 100, 2)
        avg_win = round(np.mean([p for p in profits if p > 0]) * 100, 2) if win_trades else 0
        avg_loss = round(abs(np.mean([p for p in profits if p <= 0])) * 100, 2) if loss_trades else 0
        profit_factor = round(avg_win / avg_loss, 2) if avg_loss > 0 else 99.0
    else:
        win_trades = loss_trades = 0
        win_rate = 0.0
        avg_win = avg_loss = 0.0
        profit_factor = 0.0

    # 止损/止盈触发次数
    stop_count = sum(1 for r in trades if r.action == "stop_loss")
    tp_count = sum(1 for r in trades if r.action == "take_profit")

    # 最长连续亏损
    max_consecutive_loss = 0
    cur_loss = 0
    for p in profits:
        if p <= 0:
            cur_loss += 1
            max_consecutive_loss = max(max_consecutive_loss, cur_loss)
        else:
            cur_loss = 0

    # 月度收益
    monthly = _compute_monthly(records, initial_capital)

    return {
        "total_return_pct": round(total_return * 100, 2),
        "annual_return": annual_return,
        "sharpe_ratio": sharpe,
        "calmar_ratio": calmar,
        "max_drawdown": max_dd,
        "win_rate": win_rate,
        "profit_factor": profit_factor,
        "total_trades": total_trades,
        "profit_trades": win_trades,
        "loss_trades": loss_trades,
        "avg_win_pct": avg_win,
        "avg_loss_pct": avg_loss,
        "max_consecutive_loss": max_consecutive_loss,
        "stop_loss_count": stop_count,
        "take_profit_count": tp_count,
        "final_equity": round(final_equity, 2),
        "monthly_returns": monthly,
        "cost_config": {
            "commission_rate": COMMISSION_RATE,
            "commission_min": COMMISSION_MIN,
            "stamp_duty_rate": STAMP_DUTY_RATE,
        },
    }


def _empty_metrics(capital: float) -> Dict:
    return {
        "total_return_pct": 0, "annual_return": 0, "sharpe_ratio": 0,
        "calmar_ratio": 0, "max_drawdown": 0, "win_rate": 0,
        "profit_factor": 0, "total_trades": 0, "profit_trades": 0,
        "loss_trades": 0, "avg_win_pct": 0, "avg_loss_pct": 0,
        "max_consecutive_loss": 0, "stop_loss_count": 0,
        "take_profit_count": 0, "final_equity": capital,
        "monthly_returns": [],
    }


def _compute_monthly(records: List[TradeRecord], capital: float) -> List[Dict]:
    """按月聚合收益率"""
    if len(records) < 20:
        return []
    monthly_map: Dict[str, float] = {}
    for r in records:
        month_key = r.date[:7] if len(r.date) >= 7 else ""
        if month_key and r.equity > 0:
            monthly_map[month_key] = r.equity

    result = []
    prev_equity = capital
    for month in sorted(monthly_map.keys()):
        eq = monthly_map[month]
        ret = round((eq / prev_equity - 1) * 100, 2) if prev_equity > 0 else 0
        result.append({"month": month, "return_pct": ret, "equity": round(eq, 2)})
        prev_equity = eq
    return result


# ============================================================
#  QuantEngine
# ============================================================
class QuantEngine:
    """统一量化引擎"""

    def __init__(self):
        self._strategies = STRATEGY_REGISTRY

    @property
    def strategy_names(self) -> List[str]:
        return list(self._strategies.keys())

    def get_strategy_info(self) -> Dict[str, str]:
        return {k: v.label for k, v in self._strategies.items()}

    def backtest(self, df: pd.DataFrame, strategy_name: str,
                 config: Optional[BacktestConfig] = None,
                 **kwargs) -> Dict[str, Any]:
        """
        运行单只股票回测

        参数:
          df:           K线 DataFrame, 必须含 [open, high, low, close, volume]
          strategy_name: 策略 key (ma_cross / macd / score / boll_break / dual_ma)
          config:       回测配置对象 (BacktestConfig)
          **kwargs:     也可直接传 capital / stop_loss_pct / take_profit_pct / position_pct

        返回:
          {"metrics": {...}, "trades": [...], "equity_curve": [...], "strategy": "..."}
        """
        # 合并配置
        if config is None:
            config = BacktestConfig(strategy=strategy_name)
        capital = kwargs.get("capital", config.initial_capital)
        stop_loss = kwargs.get("stop_loss_pct", config.stop_loss_pct)
        take_profit = kwargs.get("take_profit_pct", config.take_profit_pct)
        position = kwargs.get("position_pct", config.position_pct)

        # 实例化策略
        strat_cls = self._strategies.get(strategy_name)
        if strat_cls is None:
            return {"error": f"未知策略: {strategy_name}, 可选: {list(self._strategies.keys())}"}

        strategy = strat_cls(stop_loss_pct=stop_loss, take_profit_pct=take_profit, position_pct=position)

        if len(df) < 30:
            return {"error": f"数据不足: 至少30天, 当前{len(df)}天"}

        # 回测主循环
        close = df["close"].values
        dates = df.index.astype(str).tolist() if hasattr(df.index, 'astype') else [str(i) for i in range(len(df))]
        cash = capital
        shares = 0
        entry_price = 0.0
        records: List[TradeRecord] = []

        for i in range(len(df)):
            price = float(close[i])
            date_str = str(dates[i]) if i < len(dates) else str(i)

            action = "hold"

            # 风控检测（优先级最高）
            if shares > 0 and entry_price > 0:
                risk = strategy.check_risk(entry_price, price, True)
                if risk == "stop_loss":
                    cash, shares = self._sell(cash, price, shares)
                    entry_price = 0.0
                    action = "stop_loss"
                elif risk == "take_profit":
                    cash, shares = self._sell(cash, price, shares)
                    entry_price = 0.0
                    action = "take_profit"

            # 正常信号（仅在未触发风控时）
            if action == "hold":
                sig = strategy.generate_signal(df, i)
                if sig == "buy" and shares == 0:
                    cash, shares = buy_lots(cash, price, position)
                    if shares > 0:
                        entry_price = price
                        action = "buy"
                elif sig == "sell" and shares > 0:
                    cash, shares = self._sell(cash, price, shares)
                    entry_price = 0.0
                    action = "sell"

            equity = cash + shares * price
            records.append(TradeRecord(
                date=date_str, price=round(price, 2), action=action,
                cash=round(cash, 2), shares=shares, equity=round(equity, 2),
            ))

        # 强制平仓（最后一天仍有持仓）
        if shares > 0:
            final_price = float(close[-1])
            cash, shares = self._sell(cash, final_price, shares)
            records.append(TradeRecord(
                date=str(dates[-1]), price=round(final_price, 2), action="sell",
                cash=round(cash, 2), shares=0, equity=round(cash, 2),
            ))

        # 计算指标
        metrics = compute_metrics(records, capital)
        equity_curve = [{"date": r.date, "equity": r.equity, "action": r.action} for r in records]

        # 构建基准（从数据库查询沪深300）
        benchmark_curve = self._get_benchmark(dates[0] if dates else "", dates[-1] if dates else "", capital)

        return {
            "metrics": metrics,
            "trades": [r.__dict__ for r in records if r.action != "hold"][-30:],
            "equity_curve": equity_curve,
            "benchmark_curve": benchmark_curve,
            "strategy": strategy_name,
            "strategy_label": strategy.label,
            "config": {
                "capital": capital,
                "stop_loss_pct": stop_loss,
                "take_profit_pct": take_profit,
                "position_pct": position,
            },
        }

    @staticmethod
    def _sell(cash: float, price: float, shares: int) -> Tuple[float, int]:
        if shares <= 0:
            return cash, 0
        fee = trade_cost(price, shares, is_sell=True)
        return round(cash + shares * price - fee, 2), 0

    @staticmethod
    def _get_benchmark(start_date: str, end_date: str, capital: float) -> List[Dict]:
        """从数据库获取沪深300基准曲线"""
        try:
            from database import SessionLocal
            from models import StockDailyK

            # 统一日期格式: YYYYMMDD
            def _norm_date(d: str) -> str:
                cleaned = re.sub(r'[^0-9]', '', str(d))
                return cleaned[:8] if len(cleaned) >= 8 else cleaned

            start_norm = _norm_date(start_date)
            end_norm = _norm_date(end_date)

            db = SessionLocal()
            rows = db.query(StockDailyK).filter(
                StockDailyK.code == "000300",
                StockDailyK.trade_date >= start_norm,
                StockDailyK.trade_date <= end_norm,
            ).order_by(StockDailyK.trade_date.asc()).all()
            db.close()

            if len(rows) >= 2:
                bench_start = float(rows[0].close)
                return [
                    {"date": str(r.trade_date),
                     "value": round(capital * (float(r.close) / bench_start), 2)}
                    for r in rows
                ]
        except Exception as e:
            logger.warning(f"_get_benchmark 查询失败: {e}")
        return []


# 全局单例
engine = QuantEngine()
