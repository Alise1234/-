"""
回测 API 路由 V4.0
"""
from fastapi import APIRouter, Query
from typing import Optional
import pandas as pd

from services.akshare_service import get_stock_daily
from services.quant_engine import STRATEGY_REGISTRY, engine as quant_engine

router = APIRouter(prefix="/api/backtest", tags=["回测"])


@router.get("/run")
async def run(
    code: str = Query(..., description="股票代码, 如 600519"),
    strategy: str = Query("ma_cross", description=f"策略: {list(STRATEGY_REGISTRY.keys())}"),
    start_date: Optional[str] = Query(None, description="开始日期 YYYYMMDD"),
    end_date: Optional[str] = Query(None, description="结束日期 YYYYMMDD"),
    capital: float = Query(100000, ge=10000, description="初始资金"),
    stop_loss: float = Query(-5.0, le=0, description="止损百分比 (负值)"),
    take_profit: float = Query(15.0, ge=0, description="止盈百分比 (正值)"),
    position: float = Query(1.0, ge=0.1, le=1.0, description="仓位比例"),
):
    """
    运行回测 V4.0 — 止损止盈真实生效

    示例:
      GET /api/backtest/run?code=600519&strategy=macd&stop_loss=-5&take_profit=15
    """
    if strategy not in STRATEGY_REGISTRY:
        return {
            "success": False,
            "error": f"未知策略: {strategy}, 可选: {list(STRATEGY_REGISTRY.keys())}",
        }

    # 拉 K 线
    try:
        raw = get_stock_daily(
            code, start_date=start_date or "20200101",
            end_date=end_date or None, adjust="qfq",
        )
    except Exception as e:
        return {"success": False, "error": f"获取K线失败: {str(e)}"}

    if not raw:
        return {"success": False, "error": "无K线数据"}

    # 构建 DataFrame
    df = pd.DataFrame([
        {
            "open":   float(r.get("开盘", r.get("open", 0)) or 0),
            "high":   float(r.get("最高", r.get("high", 0)) or 0),
            "low":    float(r.get("最低", r.get("low", 0)) or 0),
            "close":  float(r.get("收盘", r.get("close", 0)) or 0),
            "volume": int(r.get("成交量", r.get("volume", 0)) or 0),
            "date":   str(r.get("日期", r.get("trade_date", r.get("date", "")))),
        }
        for r in raw
    ])
    df = df[::-1].reset_index(drop=True)  # AKShare 倒序→升序
    df = df[df["close"] > 0]

    if len(df) < 30:
        return {"success": False, "error": f"数据不足: 需要至少30天K线，当前{len(df)}天"}

    # 运行回测
    from services.backtest_service import run_backtest
    try:
        result = run_backtest(
            df, strategy=strategy,
            initial_capital=capital,
            stop_loss_pct=stop_loss,
            take_profit_pct=take_profit,
            position_pct=position,
        )
    except Exception as e:
        return {"success": False, "error": f"回测执行失败: {str(e)}"}

    # 沪深300基准（延迟计算，优先用引擎结果）
    bench_curve = result.get("benchmark_curve", [])
    if not bench_curve:
        try:
            bench_curve = _fetch_benchmark(raw)
        except Exception:
            pass

    return {
        "success": True,
        "code": code,
        "strategy": strategy,
        "strategy_label": STRATEGY_REGISTRY.get(strategy, type("X",(),{"label":strategy})()).label,
        "initial_capital": capital,
        "config": {
            "stop_loss_pct": stop_loss,
            "take_profit_pct": take_profit,
            "position_pct": position,
        },
        "days": len(df),
        "date_range": {
            "start": str(raw[-1].get("日期", raw[-1].get("trade_date", ""))) if raw else "",
            "end": str(raw[0].get("日期", raw[0].get("trade_date", ""))) if raw else "",
        },
        "metrics": result["metrics"],
        "benchmark_curve": bench_curve,
        "equity_curve": result.get("equity_curve", []),
        "trades": result["trades"],
    }


def _fetch_benchmark(raw: list) -> list:
    """回退方案：从数据库拉沪深300"""
    try:
        from database import SessionLocal
        from models import StockDailyK
        df_dates = sorted(set(
            str(r.get("日期", r.get("trade_date", "")))
            for r in raw if r.get("日期") or r.get("trade_date")
        ))
        if len(df_dates) < 2:
            return []
        db = SessionLocal()
        rows = db.query(StockDailyK).filter(
            StockDailyK.code == "000300",
            StockDailyK.trade_date >= df_dates[0],
            StockDailyK.trade_date <= df_dates[-1],
        ).order_by(StockDailyK.trade_date.asc()).all()
        db.close()
        if len(rows) >= 2:
            bench_start = float(rows[0].close)
            return [
                {"date": str(r.trade_date),
                 "value": round(100000 * (float(r.close) / bench_start), 2)}
                for r in rows
            ]
    except Exception:
        pass
    return []


@router.get("/strategies")
async def list_strategies():
    """列出所有可用策略"""
    return {
        "success": True,
        "strategies": {
            k: v.label for k, v in STRATEGY_REGISTRY.items()
        },
    }
