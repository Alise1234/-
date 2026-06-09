"""
全量数据初始化脚本

功能:
  1. stock_basic 写入全部A股
  2. stock_daily 写入 2020-01-01 至今历史K线
  3. 断点续传
  4. PostgreSQL bulk insert
  5. 进度条
  6. 每100只 commit
  7. 失败股票 → failed_stocks.log
"""
import sys
import os
import logging
from datetime import datetime, date, timedelta
from typing import List, Dict, Set

import pandas as pd
from sqlalchemy import text

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from database import SessionLocal, engine
from models import StockBasic, StockDailyK
from services.akshare_service import get_spot_data, get_stock_daily

# ===== 配置 =====
KLINE_START_DATE = "20250101"  # K线起始日
BATCH_COMMIT = 100             # 每 N 只股票 commit 一次
BULK_SIZE = 500                # 每条 K 线 bulk insert 批次
LOG_FAILED = os.path.join(os.path.dirname(__file__), "..", "failed_stocks.log")

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
    handlers=[logging.StreamHandler(), logging.FileHandler(LOG_FAILED, mode="w")],
)
logger = logging.getLogger(__name__)


# ============================================================
#  工具函数
# ============================================================

def _strip_code_prefix(raw: str) -> str:
    """sh600519 → 600519"""
    raw = str(raw).strip()
    for pfx in ("sh", "sz", "bj", "SH", "SZ", "BJ"):
        if raw.startswith(pfx):
            raw = raw[len(pfx):]
            break
    return raw.zfill(6)


def _done_codes(start_date_str: str) -> Set[str]:
    """查询已有K线数据的股票（起始日之后）"""
    db = SessionLocal()
    try:
        cutoff = datetime.strptime(start_date_str, "%Y%m%d").date()
        rows = (
            db.query(StockDailyK.code)
            .filter(StockDailyK.trade_date <= cutoff + timedelta(days=7))
            .distinct()
            .all()
        )
        return {r[0] for r in rows}
    finally:
        db.close()


# ============================================================
#  主流程
# ============================================================

def sync_stock_basic() -> int:
    """全量写入 stock_basic"""
    logger.info("=== 同步 stock_basic ===")
    try:
        data = get_spot_data()
    except Exception as e:
        logger.error(f"获取股票列表失败: {e}")
        return 0

    db = SessionLocal()
    try:
        count_new, count_update = 0, 0

        for row in data:
            code = _strip_code_prefix(row.get("代码", row.get("f12", "")))
            name = str(row.get("名称", row.get("f14", "")))
            if not code or not name or len(code) != 6:
                continue

            existing = db.query(StockBasic).filter(StockBasic.code == code).first()
            if existing:
                existing.name = name
                existing.updated_at = datetime.now()
                count_update += 1
            else:
                db.add(StockBasic(code=code, name=name))
                count_new += 1

        db.commit()
        logger.info(f"stock_basic: 新增 {count_new}, 更新 {count_update}")
        return count_new + count_update
    except Exception as e:
        db.rollback()
        logger.error(f"stock_basic 写入失败: {e}")
        return 0
    finally:
        db.close()


def sync_daily_kline(resume: bool = True) -> Dict:
    """
    全量拉取历史日K线（2020-01-01 至今）

    参数:
        resume: True=跳过已完成的股票（断点续传）

    返回:
        {total_stocks, synced, failed, elapsed_seconds}
    """
    logger.info(f"=== 同步 stock_daily (起始: {KLINE_START_DATE}) ===")

    # 获取股票列表
    db = SessionLocal()
    try:
        codes = [r[0] for r in db.query(StockBasic.code).order_by(StockBasic.code).all()]
    finally:
        db.close()

    if not codes:
        logger.error("stock_basic 为空，请先运行 sync_stock_basic()")
        return {"total_stocks": 0, "synced": 0, "failed": 0, "elapsed_seconds": 0}

    # 断点续传：跳过已完成的
    done = _done_codes(KLINE_START_DATE) if resume else set()
    todo = [c for c in codes if c not in done]
    logger.info(f"总数: {len(codes)}, 已完成: {len(done)}, 待处理: {len(todo)}")

    if not todo:
        logger.info("全部股票已同步完成")
        return {"total_stocks": len(codes), "synced": 0, "failed": 0, "elapsed_seconds": 0}

    # ===== 开始同步 =====
    t0 = datetime.now()
    db = SessionLocal()
    failed_stocks = []
    synced = 0
    total_rows = 0

    try:
        from tqdm import tqdm
    except ImportError:
        def tqdm(it, **kw):
            for i, x in enumerate(it):
                if i % 10 == 0:
                    print(f"\r  进度: {i}/{len(todo)}", end="", flush=True)
                yield x
            print()

    for i, code in enumerate(tqdm(todo, desc="K线同步", unit="只")):
        try:
            # 获取日K线
            rows = get_stock_daily(code, start_date=KLINE_START_DATE)

            if not rows:
                logger.debug(f"  {code} 无数据")
                synced += 1
                continue

            # 转换为 ORM 对象列表（兼容东财英文列名 + 新浪中文列名）
            batch = []
            for row in rows:
                trade_date_str = row.get("日期") or row.get("date") or row.get("trade_date") or ""
                if not trade_date_str:
                    continue
                try:
                    td = datetime.strptime(str(trade_date_str)[:10], "%Y-%m-%d").date()
                except ValueError:
                    try:
                        td = datetime.strptime(str(trade_date_str)[:10], "%Y%m%d").date()
                    except ValueError:
                        continue

                existing = (
                    db.query(StockDailyK)
                    .filter(StockDailyK.code == code, StockDailyK.trade_date == td)
                    .first()
                )
                if existing:
                    continue

                batch.append(StockDailyK(
                    code=code,
                    trade_date=td,
                    open=row.get("开盘") or row.get("open"),
                    high=row.get("最高") or row.get("high"),
                    low=row.get("最低") or row.get("low"),
                    close=row.get("收盘") or row.get("close"),
                    volume=row.get("成交量") or row.get("volume"),
                    amount=row.get("成交额") or row.get("amount"),
                    amplitude=row.get("振幅") or row.get("amplitude"),
                    pct_change=row.get("涨跌幅") or row.get("pct_change"),
                    turnover=row.get("换手率") or row.get("turnover"),
                ))

            # bulk insert
            if batch:
                db.bulk_save_objects(batch)
                total_rows += len(batch)

            synced += 1

        except Exception as e:
            failed_stocks.append(code)
            logger.error(f"  {code} 失败: {e}")
            with open(LOG_FAILED, "a") as f:
                f.write(f"{code}\t{datetime.now()}\t{str(e)[:200]}\n")

        # 每 BATCH_COMMIT 只 commit
        if (i + 1) % BATCH_COMMIT == 0:
            db.commit()
            elapsed = (datetime.now() - t0).total_seconds()
            rate = (i + 1) / elapsed if elapsed > 0 else 0
            eta = (len(todo) - i - 1) / rate if rate > 0 else 0
            logger.info(
                f"  commit @{i+1}/{len(todo)} "
                f"(总{total_rows}行, {rate:.1f}只/s, ETA {eta:.0f}s)"
            )

    # 最终提交
    db.commit()
    elapsed = (datetime.now() - t0).total_seconds()

    # 结果输出
    logger.info("=" * 60)
    logger.info(f"stock_basic 总数: {len(codes)}")
    logger.info(f"新同步股票:     {synced}")
    logger.info(f"失败股票:       {len(failed_stocks)}")
    logger.info(f"K线总行数:      {total_rows}")
    logger.info(f"耗时:           {elapsed:.0f}s ({elapsed/60:.1f}min)")
    if failed_stocks:
        logger.info(f"失败列表:       {LOG_FAILED}")
    logger.info("=" * 60)

    return {
        "total_stocks": len(codes),
        "synced": synced,
        "failed": len(failed_stocks),
        "failed_list": failed_stocks[:50],
        "kline_rows": total_rows,
        "elapsed_seconds": round(elapsed, 1),
    }


# ============================================================
#  入口
# ============================================================
if __name__ == "__main__":
    import argparse

    parser = argparse.ArgumentParser(description="全量数据初始化")
    parser.add_argument("--basic", action="store_true", help="仅同步 stock_basic")
    parser.add_argument("--kline", action="store_true", help="仅同步 stock_daily")
    parser.add_argument("--full", action="store_true", help="全量同步(先basic再kline)")
    parser.add_argument("--no-resume", action="store_true", help="禁用断点续传")
    parser.add_argument("--start", default=KLINE_START_DATE, help="K线起始日期 YYYYMMDD")
    parser.add_argument("--limit", type=int, default=0, help="限制同步股票数量(测试用)")
    args = parser.parse_args()

    KLINE_START_DATE = args.start

    if args.full:
        count = sync_stock_basic()
        print(f"\nstock_basic: {count} 只\n")
        result = sync_daily_kline(resume=not args.no_resume)
        print(f"\n完成: {result}")
    elif args.basic:
        count = sync_stock_basic()
        print(f"\nstock_basic: {count} 只")
    elif args.kline:
        result = sync_daily_kline(resume=not args.no_resume)
        print(f"\n完成: {result}")
    else:
        # 默认: 先 basic 再 kline
        count = sync_stock_basic()
        print(f"\nstock_basic: {count} 只\n")
        result = sync_daily_kline(resume=not args.no_resume)
        print(f"\n完成: {result}")
