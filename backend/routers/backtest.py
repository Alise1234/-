"""
回测 API 路由
"""
from fastapi import APIRouter, Query
from typing import Optional
import pandas as pd

from services.akshare_service import get_stock_daily
from services.backtest_service import run_backtest, STRATEGY_MAP

router = APIRouter(prefix="/api/backtest", tags=["回测"])


@router.get("/run")
async def run(
    code: str = Query(..., description="股票代码, 如 600519"),
    strategy: str = Query("score", description=f"策略: {list(STRATEGY_MAP.keys())}"),
    start_date: Optional[str] = Query(None, description="开始日期 YYYYMMDD"),
    end_date: Optional[str] = Query(None, description="结束日期 YYYYMMDD"),
    capital: float = Query(100000, ge=10000, description="初始资金"),
):
    """
    运行回测

    示例:
      GET /api/backtest/run?code=600519&strategy=macd
      GET /api/backtest/run?code=000001&strategy=ma_cross&start_date=20240101&end_date=20250601&capital=200000
    """
    if strategy not in STRATEGY_MAP:
        return {
            "success": False,
            "error": f"未知策略: {strategy}, 可选: {list(STRATEGY_MAP.keys())}",
        }

    try:
        raw = get_stock_daily(
            code,
            start_date=start_date or "20200101",
            end_date=end_date or None,
            adjust="qfq",
        )
    except Exception as e:
        return {"success": False, "error": f"获取K线失败: {str(e)}"}

    if not raw:
        return {"success": False, "error": "无K线数据"}

    # 构建 DataFrame
    df = pd.DataFrame([
        {
            "open": float(r.get("开盘", r.get("open", 0)) or 0),
            "high": float(r.get("最高", r.get("high", 0)) or 0),
            "low": float(r.get("最低", r.get("low", 0)) or 0),
            "close": float(r.get("收盘", r.get("close", 0)) or 0),
            "volume": int(r.get("成交量", r.get("volume", 0)) or 0),
        }
        for r in raw
    ])
    df = df[::-1].reset_index(drop=True)  # AKShare 返回倒序，反转为升序
    df = df[df["close"] > 0]

    if len(df) < 60:
        return {"success": False, "error": f"数据不足: 需要至少60天K线，当前{len(df)}天"}

    try:
        result = run_backtest(df, strategy=strategy, initial_capital=capital)
    except Exception as e:
        return {"success": False, "error": f"回测执行失败: {str(e)}"}

    # 真实沪深300基准收益（用K线数据的首尾日期查询指数）
    try:
        from database import SessionLocal
        from models import StockDailyK
        from sqlalchemy import func
        db = SessionLocal()
        df_dates = sorted(set(str(r.get("date", r.get("日期", r.get("trade_date", "")))) for r in raw if r.get("date") or r.get("日期") or r.get("trade_date")))
        if len(df_dates) >= 2:
            bench_rows = db.query(StockDailyK).filter(
                StockDailyK.code == '000300',
                StockDailyK.trade_date >= df_dates[0],
                StockDailyK.trade_date <= df_dates[-1],
            ).order_by(StockDailyK.trade_date.asc()).all()
            if len(bench_rows) >= 2:
                bench_start = float(bench_rows[0].close)
                bench_end = float(bench_rows[-1].close)
                bench_return = round((bench_end / bench_start - 1) * 100, 2)
            else:
                bench_return = None
        else:
            bench_return = None
        db.close()
    except Exception:
        bench_return = None

    return {
        "success": True,
        "code": code,
        "strategy": strategy,
        "initial_capital": capital,
        "days": len(df),
        "date_range": {
            "start": str(raw[-1].get("日期", raw[-1].get("trade_date", ""))) if raw else "",
            "end": str(raw[0].get("日期", raw[0].get("trade_date", ""))) if raw else "",
        },
        "metrics": result["metrics"],
        "benchmark_return": bench_return,
        "trades": [
            t for t in result["trades"] if t["action"] != "hold"
        ][-20:],  # 最近20笔交易
    }


@router.get("/strategies")
async def list_strategies():
    """列出所有可用策略"""
    return {
        "success": True,
        "strategies": {
            "score": "综合评分策略: total_score>=80买入, <=60卖出",
            "ma_cross": "MA金叉死叉: MA5上穿MA20买入, MA5下穿MA20卖出",
            "macd": "MACD金叉死叉: DIF上穿DEA买入, DIF下穿DEA卖出",
        },
    }
