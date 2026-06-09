"""
每日定时更新任务

功能:
  1. update_daily_kline()  — 更新全市场日K线
  2. update_indicators()   — 计算技术指标并入库
  3. update_scores()       — 计算五维评分并入库
  4. update_stock_basic()  — 更新股票基础信息
  5. run_full_cycle()      — 全量更新
  6. run_incremental()     — 增量更新（最近5天）
"""
import sys
import os
import logging
from datetime import datetime, date, timedelta
from typing import List, Dict

import pandas as pd
from sqlalchemy import text

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from database import SessionLocal, engine
from models import StockBasic, StockDailyK, StockIndicator, StockScore
from services.akshare_service import get_spot_data, get_stock_daily
from services.indicator_service import calc_all, indicators_summary
from services.score_service import calc_five_dim_scores

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
logger = logging.getLogger(__name__)

BATCH_SIZE = 20  # 每批处理的股票数量


# ============================================================
#  1. 股票基础信息更新
# ============================================================
def update_stock_basic():
    """
    从 AKShare 获取全市场股票列表，更新/插入 stock_basic
    每天运行一次即可
    """
    logger.info("开始更新 stock_basic ...")
    try:
        data = get_spot_data()
    except Exception as e:
        logger.error(f"获取股票列表失败: {e}")
        return

    db = SessionLocal()
    try:
        count_new, count_update = 0, 0

        for row in data:
            raw_code = str(row.get("代码", row.get("f12", "")))
            for prefix in ("sh", "sz", "bj", "SH", "SZ", "BJ"):
                if raw_code.startswith(prefix):
                    raw_code = raw_code[len(prefix):]
                    break
            code = raw_code.zfill(6)
            name = str(row.get("名称", row.get("f14", "")))
            if not code or not name:
                continue

            industry = str(row.get("行业", row.get("f18", "")) or "").strip()
            market_code = str(row.get("市场", row.get("f13", "")) or "").strip()
            # f13: 0=深圳, 1=上海, 2=北京
            market_map = {"0": "SZ", "1": "SH", "2": "BJ"}

            existing = db.query(StockBasic).filter(StockBasic.code == code).first()
            if existing:
                existing.name = name
                if industry:
                    existing.industry = industry
                if market_code in market_map:
                    existing.market = market_map[market_code]
                existing.updated_at = datetime.now()
                count_update += 1
            else:
                mkt = market_map.get(market_code, "")
                db.add(StockBasic(code=code, name=name, industry=industry or None, market=mkt or None))
                count_new += 1

        db.commit()
        logger.info(f"stock_basic 更新完毕: 新增 {count_new}, 更新 {count_update}")
    except Exception as e:
        db.rollback()
        logger.error(f"stock_basic 更新失败: {e}")
    finally:
        db.close()


# ============================================================
#  2. 日K线数据更新（增量 + 全量双模式）
# ============================================================

def sync_index_kline():
    """同步四大指数日K线（沪深300用于回测基准）"""
    logger.info("同步指数K线 ...")
    try:
        import akshare as ak
        index_map = {"000001": "sh000001", "399001": "sz399001", "399006": "sz399006", "000300": "sh000300"}
        db = SessionLocal()
        total = 0
        for code, symbol in index_map.items():
            try:
                df = ak.stock_zh_index_daily(symbol=symbol)
                for _, row in df.iterrows():
                    td = row['date'] if hasattr(row['date'], 'date') else pd.Timestamp(row['date']).date()
                    existing = db.query(StockDailyK).filter(
                        StockDailyK.code == code, StockDailyK.trade_date == td
                    ).first()
                    if existing: continue
                    db.add(StockDailyK(code=code, trade_date=td,
                        open=float(row['open']), high=float(row['high']),
                        low=float(row['low']), close=float(row['close']),
                        volume=int(row['volume'])))
                    total += 1
            except Exception as e:
                logger.warning(f"  指数 {code} 同步失败: {e}")
        db.commit()
        logger.info(f"指数K线同步完成: {total} 条")
    except Exception as e:
        logger.warning(f"指数同步失败: {e}")
    finally:
        db.close()


def fast_incremental_kline():
    """
    快速增量：通过 Express 的 Sina 行情接口获取全市场数据
    不依赖 AKShare，不受代理影响
    """
    logger.info("快速增量K线: 从Express行情接口更新今日行情 ...")
    try:
        import urllib.request, json
        req = urllib.request.Request('http://127.0.0.1:3000/api/market/spot?limit=5000')
        req.add_header('User-Agent', 'Mozilla/5.0')
        with urllib.request.urlopen(req, timeout=35) as resp:
            raw = json.loads(resp.read())
            data = raw.get('data', raw) if isinstance(raw, dict) else raw
    except Exception as e:
        logger.error(f"获取spot数据失败: {e}")
        return

    today = date.today()
    db = SessionLocal()
    inserted = 0
    try:
        for row in data:
            raw_code = str(row.get("代码", row.get("f12", "")))
            for prefix in ("sh", "sz", "bj", "SH", "SZ", "BJ"):
                if raw_code.startswith(prefix):
                    raw_code = raw_code[len(prefix):]
                    break
            code = raw_code.zfill(6)
            if not code:
                continue

            # 跳过已存在的
            existing = db.query(StockDailyK).filter(
                StockDailyK.code == code, StockDailyK.trade_date == today
            ).first()
            if existing:
                continue

            try:
                db.add(StockDailyK(
                    code=code,
                    trade_date=today,
                    open=float(row.get("今开", 0) or 0),
                    high=float(row.get("最高", 0) or 0),
                    low=float(row.get("最低", 0) or 0),
                    close=float(row.get("最新价", 0) or 0),
                    volume=int(float(row.get("成交量", 0) or 0)),
                    amount=float(row.get("成交额", 0) or 0),
                    amplitude=float(row.get("振幅", 0) or 0),
                    pct_change=float(row.get("涨跌幅", 0) or 0),
                    turnover=float(row.get("换手率", 0) or 0) if row.get("换手率") else None,
                    pe=float(row.get("市盈率", 0) or 0) if row.get("市盈率") else None,
                    pb=float(row.get("市净率", 0) or 0) if row.get("市净率") else None,
                ))
                inserted += 1
            except Exception:
                pass

        db.commit()
        logger.info(f"快速增量完成: {inserted} 条今日K线入库")
    except Exception as e:
        db.rollback()
        logger.error(f"快速增量失败: {e}")
    finally:
        db.close()


# ============================================================
def update_daily_kline(codes: List[str] = None, start_date: str = None):
    """
    更新日K线数据（增量模式：跳过已有最新数据的股票）

    参数:
        codes: 要更新的股票代码列表，None=全市场
        start_date: 起始日期 YYYYMMDD，默认最近5天
    """
    if start_date is None:
        start_date = (date.today() - timedelta(days=5)).strftime("%Y%m%d")

    if codes is None:
        db = SessionLocal()
        # 只取最新K线日期不是今天的股票，大幅减少API调用
        today_str = date.today()
        rows = db.execute(text("""
            SELECT b.code FROM stock_basic b
            WHERE NOT EXISTS (
                SELECT 1 FROM stock_daily_k k
                WHERE k.code = b.code AND k.trade_date = :today
            )
        """), {"today": today_str}).fetchall()
        db.close()
        codes = [r[0] for r in rows]
        logger.info(f"需要更新K线的股票: {len(codes)}/{5523} (已有今日数据的跳过)")

    if not codes:
        logger.info("所有股票K线已是最新，无需更新")
        return

    logger.info(f"开始更新 {len(codes)} 只股票日K线 (起始: {start_date})")
    db = SessionLocal()
    try:
        total_inserted = 0

        for i, code in enumerate(codes):
            try:
                data = get_stock_daily(code, start_date=start_date)
            except Exception as e:
                logger.warning(f"  获取 {code} K线失败: {e}")
                continue

            for row in data:
                trade_date_str = row.get("日期", row.get("trade_date", ""))
                if not trade_date_str:
                    continue
                try:
                    td = datetime.strptime(str(trade_date_str), "%Y-%m-%d").date()
                except ValueError:
                    continue

                existing = db.query(StockDailyK).filter(
                    StockDailyK.code == code,
                    StockDailyK.trade_date == td,
                ).first()
                if existing:
                    continue

                try:
                    db.add(StockDailyK(
                        code=code,
                        trade_date=td,
                        open=row.get("开盘", row.get("open")),
                        high=row.get("最高", row.get("high")),
                        low=row.get("最低", row.get("low")),
                        close=row.get("收盘", row.get("close")),
                        volume=row.get("成交量", row.get("volume")),
                        amount=row.get("成交额", row.get("amount")),
                        amplitude=row.get("振幅", row.get("amplitude")),
                        pct_change=row.get("涨跌幅", row.get("pct_change")),
                        turnover=row.get("换手率", row.get("turnover")),
                    ))
                    total_inserted += 1
                except Exception as e:
                    logger.warning(f"  插入 {code} {td} 失败: {e}")

            if (i + 1) % BATCH_SIZE == 0:
                db.commit()
                logger.info(f"  进度: {i+1}/{len(codes)} (已入库 {total_inserted} 条)")

        db.commit()
        logger.info(f"日K线更新完毕: 共入库 {total_inserted} 条")
    except Exception as e:
        db.rollback()
        logger.error(f"日K线更新失败: {e}")
    finally:
        db.close()


# ============================================================
#  3. 技术指标更新
# ============================================================
def update_indicators(codes: List[str] = None):
    """
    从日K线数据计算技术指标，写入 stock_indicator
    """
    if codes is None:
        db = SessionLocal()
        rows = db.query(StockBasic.code).all()
        db.close()
        codes = [r[0] for r in rows]

    logger.info(f"开始计算 {len(codes)} 只股票技术指标")
    db = SessionLocal()
    try:
        total = 0

        for i, code in enumerate(codes):
            try:
                rows = (
                    db.query(StockDailyK)
                    .filter(StockDailyK.code == code)
                    .order_by(StockDailyK.trade_date.desc())
                    .limit(200)
                    .all()
                )
                if len(rows) < 20:
                    continue
                rows = list(reversed(rows))  # 升序排列给指标计算

                df = pd.DataFrame([{
                    "open": float(r.open or 0),
                    "high": float(r.high or 0),
                    "low": float(r.low or 0),
                    "close": float(r.close or 0),
                    "volume": int(r.volume or 0),
                    "trade_date": r.trade_date,
                } for r in rows])

                indicators = calc_all(df)

                last_row = rows[-1]
                existing = db.query(StockIndicator).filter(
                    StockIndicator.code == code,
                    StockIndicator.trade_date == last_row.trade_date,
                ).first()
                if existing:
                    continue

                s = indicators_summary(indicators, idx=-1)
                db.add(StockIndicator(
                    code=code,
                    trade_date=last_row.trade_date,
                    ma5=s.get("ma5"), ma10=s.get("ma10"),
                    ma20=s.get("ma20"), ma60=s.get("ma60"),
                    macd_dif=s.get("macd_dif"), macd_dea=s.get("macd_dea"),
                    macd_hist=s.get("macd_hist"),
                    rsi6=s.get("rsi6"), rsi12=s.get("rsi12"), rsi24=s.get("rsi24"),
                    boll_upper=s.get("boll_upper"), boll_mid=s.get("boll_mid"),
                    boll_lower=s.get("boll_lower"), boll_width=s.get("boll_width"),
                    boll_pct_b=s.get("boll_pct_b"),
                    kdj_k=s.get("kdj_k"), kdj_d=s.get("kdj_d"), kdj_j=s.get("kdj_j"),
                    vol_ma5=s.get("vol_ma5"), vol_ma20=s.get("vol_ma20"),
                    atr14=s.get("atr14"),
                ))
                total += 1
            except Exception as e:
                logger.debug(f"  {code} 指标计算失败: {e}")

            if (i + 1) % BATCH_SIZE == 0:
                db.commit()
                logger.info(f"  进度: {i+1}/{len(codes)} (已计算 {total})")

        db.commit()
        logger.info(f"技术指标更新完毕: {total} 条")
    except Exception as e:
        db.rollback()
        logger.error(f"技术指标更新失败: {e}")
    finally:
        db.close()


# ============================================================
#  4. 评分更新
# ============================================================
def update_scores(codes: List[str] = None):
    """
    从技术指标 + K线数据计算五维评分，写入 stock_score
    """
    if codes is None:
        db = SessionLocal()
        rows = db.query(StockBasic.code).all()
        db.close()
        codes = [r[0] for r in rows]

    logger.info(f"开始计算 {len(codes)} 只股票评分")
    db = SessionLocal()
    try:
        total = 0

        for i, code in enumerate(codes):
            try:
                rows = (
                    db.query(StockDailyK)
                    .filter(StockDailyK.code == code)
                    .order_by(StockDailyK.trade_date.desc())
                    .limit(200)
                    .all()
                )
                if len(rows) < 30:
                    continue
                rows = list(reversed(rows))  # 升序排列给评分计算

                df = pd.DataFrame([{
                    "open": float(r.open or 0),
                    "high": float(r.high or 0),
                    "low": float(r.low or 0),
                    "close": float(r.close or 0),
                    "volume": int(r.volume or 0),
                    "turnover": float(r.turnover or 0) if r.turnover else None,
                    "pe": float(r.pe or 0) if r.pe else None,
                    "pb": float(r.pb or 0) if r.pb else None,
                } for r in rows])

                scores = calc_five_dim_scores(df)

                last_date = rows[-1].trade_date
                existing = db.query(StockScore).filter(
                    StockScore.code == code,
                    StockScore.calc_date == last_date,
                ).first()
                if existing:
                    continue

                db.add(StockScore(
                    code=code,
                    calc_date=last_date,
                    total_score=scores["total_score"],
                    trend_score=scores["trend_score"],
                    capital_score=scores["capital_score"],
                    valuation_score=scores["valuation_score"],
                    sentiment_score=scores["sentiment_score"],
                    risk_score=scores["risk_score"],
                    close=scores["details"].get("close"),
                    details=scores["details"],
                ))
                total += 1
            except Exception as e:
                logger.debug(f"  {code} 评分失败: {e}")

            if (i + 1) % BATCH_SIZE == 0:
                db.commit()
                logger.info(f"  进度: {i+1}/{len(codes)} (已评分 {total})")

        db.commit()
        logger.info(f"评分更新完毕: {total} 条")
    except Exception as e:
        db.rollback()
        logger.error(f"评分更新失败: {e}")
    finally:
        db.close()


# ============================================================
#  批量入口
# ============================================================
def backfill_validation():
    """
    回填验证表：将新评分写入 score_validation，自动计算已有未来收益
    """
    logger.info("回填 Alpha 验证数据 ...")
    db = SessionLocal()
    try:
        # 1. 插入新评分（去重）
        db.execute(text("""
            INSERT INTO score_validation (code, score_date, total_score, close_price)
            SELECT s.code, s.calc_date, s.total_score, s.close
            FROM stock_score s
            WHERE s.calc_date >= CURRENT_DATE - INTERVAL '3 days'
            ON CONFLICT (code, score_date) DO NOTHING
        """))
        # 2. 更新已有未来收益
        db.execute(text("""
            UPDATE score_validation sv SET
              return_5d  = sub.ret5,
              return_10d = sub.ret10,
              return_20d = sub.ret20
            FROM (
              SELECT sv2.code, sv2.score_date,
                (MAX(k5.close) - sv2.close_price) / sv2.close_price AS ret5,
                (MAX(k10.close) - sv2.close_price) / sv2.close_price AS ret10,
                (MAX(k20.close) - sv2.close_price) / sv2.close_price AS ret20
              FROM score_validation sv2
              LEFT JOIN LATERAL (
                SELECT k.close FROM stock_daily_k k
                WHERE k.code = sv2.code AND k.trade_date > sv2.score_date
                ORDER BY k.trade_date OFFSET 4 LIMIT 1
              ) k5 ON true
              LEFT JOIN LATERAL (
                SELECT k.close FROM stock_daily_k k
                WHERE k.code = sv2.code AND k.trade_date > sv2.score_date
                ORDER BY k.trade_date OFFSET 9 LIMIT 1
              ) k10 ON true
              LEFT JOIN LATERAL (
                SELECT k.close FROM stock_daily_k k
                WHERE k.code = sv2.code AND k.trade_date > sv2.score_date
                ORDER BY k.trade_date OFFSET 19 LIMIT 1
              ) k20 ON true
              WHERE sv2.return_20d IS NULL
              GROUP BY sv2.code, sv2.score_date, sv2.close_price
            ) sub
            WHERE sv.code = sub.code AND sv.score_date = sub.score_date
        """))
        db.commit()
        logger.info("Alpha 验证数据回填完成")
    except Exception as e:
        db.rollback()
        logger.warning(f"回填验证数据失败: {e}")
    finally:
        db.close()


def generate_daily_picks(top_n: int = 20):
    """
    生成每日推荐池：从最新评分中筛选优质股票
    条件: total_score>=60, MA20>MA60, 非ST, RSI12<80
    """
    logger.info(f"生成每日推荐池 (Top {top_n}) ...")
    db = SessionLocal()
    try:
        today = date.today()
        db.execute(text("DELETE FROM daily_picks WHERE pick_date = :d"), {"d": today})

        # 筛选条件同 screener：total_score>=60, ma20>ma60, 非ST, rsi12<80
        db.execute(text("""
            INSERT INTO daily_picks (pick_date, rank, code, name, total_score, close_price,
                trend_score, capital_score, valuation_score, sentiment_score, risk_score)
            SELECT :d, ROW_NUMBER() OVER (ORDER BY s.total_score DESC),
                s.code, b.name, s.total_score, s.close,
                s.trend_score, s.capital_score, s.valuation_score, s.sentiment_score, s.risk_score
            FROM stock_score s
            JOIN stock_basic b ON s.code = b.code
            JOIN stock_indicator i ON s.code = i.code AND i.trade_date = (
                SELECT MAX(trade_date) FROM stock_indicator WHERE code = s.code)
            WHERE s.calc_date = (SELECT MAX(calc_date) FROM stock_score WHERE code = s.code)
              AND s.total_score >= 60
              AND (b.is_st IS NULL OR b.is_st = false)
              AND b.name NOT LIKE '%ST%' AND b.name NOT LIKE '%退%'
              AND s.code NOT LIKE '920%' AND s.code NOT LIKE '8%'
              AND i.ma20 > i.ma60
              AND i.rsi12 < 80
            ORDER BY s.total_score DESC
            LIMIT :n
        """), {"d": today, "n": top_n})
        db.commit()

        count = db.execute(text(
            "SELECT COUNT(*) FROM daily_picks WHERE pick_date = :d"
        ), {"d": today}).scalar()
        logger.info(f"推荐池生成完毕: {count} 只")
        return count
    except Exception as e:
        db.rollback()
        logger.warning(f"生成推荐池失败: {e}")
        return 0
    finally:
        db.close()


def update_sim_nav():
    """更新模拟组合净值"""
    db = SessionLocal()
    try:
        today = date.today()
        # 计算组合当日收益（基于持仓权重和个股涨跌幅）
        db.execute(text("""
            INSERT INTO sim_nav (calc_date, portfolio_name, nav, daily_return,
                cumulative_return, holding_count)
            SELECT :d, 'AI精选组合',
                COALESCE(SUM(sp.weight_pct * (k.close / sp.entry_price)), 100.0),
                COALESCE(SUM(sp.weight_pct * ((k.close - k2.close) / k2.close)), 0.0),
                COALESCE(SUM(sp.weight_pct * (k.close / sp.entry_price)), 100.0) - 100.0,
                COUNT(*)
            FROM sim_portfolio sp
            JOIN stock_daily_k k ON sp.code = k.code
            JOIN stock_daily_k k2 ON sp.code = k2.code
            WHERE sp.status = 'holding'
              AND k.trade_date = (SELECT MAX(trade_date) FROM stock_daily_k WHERE code = sp.code)
              AND k2.trade_date = (SELECT MAX(trade_date) FROM stock_daily_k
                                   WHERE code = sp.code AND trade_date < k.trade_date)
            ON CONFLICT (calc_date, portfolio_name) DO NOTHING
        """), {"d": today})
        # 沪深300基准
        db.execute(text("""
            UPDATE sim_nav SET benchmark_return = (
                SELECT (close - LAG(close) OVER (ORDER BY trade_date)) / LAG(close) OVER (ORDER BY trade_date) * 100
                FROM stock_daily_k WHERE code = '000001'
                ORDER BY trade_date DESC LIMIT 1
            )
            WHERE calc_date = :d
        """), {"d": today})
        db.execute(text("""
            UPDATE sim_nav SET alpha = cumulative_return - COALESCE(benchmark_return, 0)
            WHERE calc_date = :d
        """), {"d": today})
        db.commit()
        logger.info("模拟组合净值已更新")
    except Exception as e:
        db.rollback()
        logger.warning(f"更新模拟净值失败: {e}")
    finally:
        db.close()


def update_alpha_monitor():
    """
    每日刷新 Alpha 监控面板：十分位收益 + IC + 超额 vs 沪深300
    """
    logger.info("刷新 Alpha 监控面板 ...")
    db = SessionLocal()
    try:
        db.execute(text("DELETE FROM alpha_monitor WHERE calc_date = CURRENT_DATE"))
        # 十分位
        db.execute(text("""
            INSERT INTO alpha_monitor (calc_date, score_group, stock_count,
                avg_return_5d, avg_return_10d, avg_return_20d, win_rate_20d)
            SELECT CURRENT_DATE, 'D'||decile::text, cnt, ret_5d, ret_10d, ret_20d, win_rate
            FROM v_score_decile
        """))
        # IC
        db.execute(text("""
            UPDATE alpha_monitor SET ic_20d = (
                SELECT ic_20d FROM v_score_ic ORDER BY score_date DESC LIMIT 1
            )
            WHERE calc_date = CURRENT_DATE
        """))
        # 超额收益
        db.execute(text("""
            UPDATE alpha_monitor SET alpha_vs_bench = (
                SELECT alpha_20d FROM v_score_excess WHERE quintile = 1
            )
            WHERE calc_date = CURRENT_DATE AND score_group = 'D1'
        """))
        db.commit()
        logger.info("Alpha 监控面板刷新完成 (十分位+IC+超额)")
    except Exception as e:
        db.rollback()
        logger.warning(f"Alpha 监控刷新失败: {e}")
    finally:
        db.close()


def run_full_cycle():
    """
    全量更新（首次运行）
    1. 更新股票列表
    2. 全量拉取日K线（最近1年）
    3. 计算技术指标
    4. 计算五维评分
    """
    logger.info("========== 全量更新开始 ==========")
    t0 = datetime.now()

    update_stock_basic()
    update_daily_kline(start_date=(date.today() - timedelta(days=365)).strftime("%Y%m%d"))
    update_indicators()
    update_scores()
    generate_daily_picks(top_n=20)
    backfill_validation()
    update_alpha_monitor()

    elapsed = (datetime.now() - t0).total_seconds()
    logger.info(f"========== 全量更新完成 (耗时 {elapsed:.0f}s) ==========")


def run_incremental():
    """
    增量更新（每日收盘后运行）
    只更新最近 5 天的 K 线和指标
    """
    logger.info("========== 增量更新开始 ==========")
    t0 = datetime.now()

    sync_index_kline()
    fast_incremental_kline()
    update_indicators()
    update_scores()
    generate_daily_picks(top_n=20)
    update_sim_nav()
    backfill_validation()
    update_alpha_monitor()

    elapsed = (datetime.now() - t0).total_seconds()
    logger.info(f"========== 增量更新完成 (耗时 {elapsed:.0f}s) ==========")


if __name__ == "__main__":
    import argparse
    parser = argparse.ArgumentParser(description="A股AI选股系统 - 定时更新任务")
    parser.add_argument("--full", action="store_true", help="全量更新")
    parser.add_argument("--inc", action="store_true", help="增量更新")
    parser.add_argument("--basic", action="store_true", help="仅更新股票列表")
    parser.add_argument("--kline", action="store_true", help="仅更新K线")
    parser.add_argument("--indicators", action="store_true", help="仅计算指标")
    parser.add_argument("--scores", action="store_true", help="仅计算评分")
    args = parser.parse_args()

    if args.full:
        run_full_cycle()
    elif args.inc:
        run_incremental()
    elif args.basic:
        update_stock_basic()
    elif args.kline:
        update_daily_kline()
    elif args.indicators:
        update_indicators()
    elif args.scores:
        update_scores()
    else:
        # 默认增量
        run_incremental()
