"""
FastAPI 应用入口
A股AI选股系统 — 后端服务
"""
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from routers import market, analysis, backtest, screener, portfolio, ai, risk, signal
from database import init_db
from config import HOST, PORT, CORS_ORIGINS
from apscheduler.schedulers.background import BackgroundScheduler
from apscheduler.triggers.cron import CronTrigger
import logging

app = FastAPI(
    title="A股AI选股系统",
    description="A股量化选股后端服务，提供行情数据、技术指标、五维评分等API",
    version="0.1.0",
)

# CORS 跨域配置（允许前端调用）
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# 注册路由
app.include_router(market.router)
app.include_router(analysis.router)
app.include_router(backtest.router)
app.include_router(screener.router)
app.include_router(portfolio.router)
app.include_router(ai.router)
app.include_router(risk.router)
app.include_router(signal.router)
app.include_router(market._admin)


@app.get("/")
async def root():
    """服务健康检查"""
    return {
        "status": "running",
        "service": "A股AI选股系统",
        "version": "0.1.0",
    }


@app.on_event("startup")
async def startup():
    """应用启动时初始化数据库表 + 启动定时任务调度器"""
    try:
        init_db()
        print("[OK] 数据库表初始化完成")
    except Exception as e:
        print(f"[WARN] 数据库连接失败: {e}")

    # 后台预热 spot 缓存（避免首次请求等30秒）
    # 注意：akshare 首次调用会下载大量元数据（可能超过15秒），不在主线程阻塞
    try:
        import threading
        def _warm_spot():
            import time
            try:
                from services.akshare_service import get_spot_data
                from routers.market import _spot_cache
                data = get_spot_data()
                _spot_cache["data"] = data
                _spot_cache["ts"] = time.time()
                print(f"[OK] Spot缓存已预热: {len(data)} 条")
            except Exception as e:
                print(f"[WARN] Spot预热失败（不影响服务）: {e}")
        threading.Thread(target=_warm_spot, daemon=True).start()
    except Exception as e:
        print(f"[WARN] Spot预热线程启动失败: {e}")

    # APScheduler: 交易日 15:30 自动执行增量更新
    try:
        from scheduler.daily_job import run_incremental, update_stock_basic
        scheduler = BackgroundScheduler(timezone="Asia/Shanghai")
        # 周一至周五 18:00 执行增量更新（K线+指标+评分）
        scheduler.add_job(
            run_incremental,
            CronTrigger(day_of_week="mon-fri", hour=15, minute=30),
            id="daily_update",
            name="每日增量更新",
            replace_existing=True,
        )
        # 每周六 02:00 更新股票基础信息
        scheduler.add_job(
            update_stock_basic,
            CronTrigger(day_of_week="sat", hour=2, minute=0),
            id="weekly_basic",
            name="每周股票列表更新",
            replace_existing=True,
        )
        scheduler.start()
        print("[OK] 定时任务调度器已启动 (交易日15:30增量更新, 周六02:00股票列表)")
    except Exception as e:
        print(f"[WARN] 定时任务调度器启动失败: {e}")


if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host=HOST, port=PORT, reload=True)
