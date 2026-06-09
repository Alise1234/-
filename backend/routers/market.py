"""
行情数据 API 路由
"""
from fastapi import APIRouter, Query
from typing import Optional, Dict, List, Any
from services.akshare_service import get_spot_data, get_stock_daily

router = APIRouter(prefix="/api/market", tags=["行情数据"])


# ---- Admin 内部接口：Express行业同步使用 ----
_admin = APIRouter(prefix="/api/admin", tags=["管理"])

@_admin.post("/set-industry/{code}")
async def set_industry(code: str, industry: str):
    """Express行业同步：写入单只股票行业"""
    from database import SessionLocal
    from models import StockBasic
    from datetime import datetime
    db = SessionLocal()
    try:
        db.query(StockBasic).filter(StockBasic.code == code).update(
            {'industry': industry, 'updated_at': datetime.now()}, synchronize_session=False
        )
        db.commit()
        return {"success": True, "code": code, "industry": industry}
    except Exception as e:
        db.rollback()
        return {"success": False, "error": str(e)}
    finally:
        db.close()

# 全市场行情缓存（避免每次请求都实时调AKShare，27秒→0.1秒）
_spot_cache: Dict[str, Any] = {"data": None, "ts": 0}
_SPOT_CACHE_TTL = 300  # 5分钟刷新一次


@router.get("/spot")
async def get_all_stocks(
    limit: int = Query(20, ge=1, le=500, description="返回数量"),
    search: Optional[str] = Query(None, description="搜索代码或名称"),
):
    """获取沪深京 A 股实时行情（60秒内存缓存）"""
    import time
    global _spot_cache
    now = time.time()
    if _spot_cache["data"] is not None and (now - _spot_cache["ts"]) < _SPOT_CACHE_TTL:
        data = _spot_cache["data"]
    else:
        try:
            data = get_spot_data()
            try:
                from database import SessionLocal
                from models import StockBasic
                db = SessionLocal()
                try:
                    basics = db.query(StockBasic.code, StockBasic.industry).all()
                    industry_map = {b.code: b.industry for b in basics if b.industry}
                    for s in data:
                        c = str(s.get("代码") or s.get("f12") or "").zfill(6)
                        if c in industry_map:
                            s["板块"] = industry_map[c]
                            s["行业"] = industry_map[c]
                except Exception as dbe:
                    print(f"[行情] 关联股票行业信息失败: {dbe}")
                finally:
                    db.close()
            except Exception as e:
                print(f"[行情] 引入行业数据失败: {e}")
            _spot_cache = {"data": data, "ts": now}
        except Exception as e:
            if _spot_cache["data"] is not None:
                data = _spot_cache["data"]
            else:
                return {"success": False, "error": str(e), "data": []}

    if search:
        search_lower = search.lower()
        filtered_data = []
        for s in data:
            code = str(s.get("代码") or s.get("f12") or "")
            name = str(s.get("名称") or s.get("f14") or "")
            if search_lower in code.lower() or search_lower in name.lower():
                filtered_data.append(s)
        data = filtered_data

    return {
        "success": True,
        "count": min(len(data), limit),
        "total": len(data),
        "data": data[:limit],
        "cached": now - _spot_cache["ts"] < _SPOT_CACHE_TTL if _spot_cache["data"] else False,
    }


@router.get("/daily/{code}")
async def get_daily_kline(
    code: str,
    start_date: Optional[str] = Query(None, description="开始日期 YYYYMMDD"),
    end_date: Optional[str] = Query(None, description="结束日期 YYYYMMDD"),
    adjust: str = Query("qfq", description="复权类型: qfq/hfq/''"),
):
    """获取单只股票历史日K线"""
    try:
        data = get_stock_daily(code, start_date, end_date, adjust)
        return {
            "success": True,
            "code": code,
            "count": len(data),
            "data": data,
        }
    except Exception as e:
        return {
            "success": False,
            "code": code,
            "error": str(e),
            "data": [],
        }


_indices_cache: Dict[str, Any] = {"data": None, "ts": 0}


def _parse_sina_index(text: str) -> Optional[Dict[str, Any]]:
    """解析新浪指数实时数据"""
    if '"' not in text:
        return None
    data_str = text.split('"')[1]
    parts = data_str.split(",")
    if len(parts) < 4:
        return None
    name = parts[0]
    price = float(parts[1])
    change = float(parts[2]) if len(parts) > 2 else 0
    change_pct = float(parts[3]) if len(parts) > 3 else 0
    volume_amount = float(parts[5]) if len(parts) > 5 and parts[5] else 0
    return {
        "name": name,
        "price": price,
        "change": change,
        "changePct": change_pct,
        "volume": f"{volume_amount / 1e8:.1f}亿" if volume_amount > 0 else "-",
    }


@router.get("/indices")
async def get_indices():
    """四大指数实时行情（15秒缓存，新浪实时数据源）"""
    import time
    import requests as _req
    global _indices_cache
    now = time.time()
    if _indices_cache["data"] and (now - _indices_cache["ts"]) < 15:
        return _indices_cache["data"]

    INDEX_SYMBOLS = {
        "s_sh000001": ("000001.SH", "上证指数"),
        "s_sz399001": ("399001.SZ", "深证成指"),
        "s_sz399006": ("399006.SZ", "创业板指"),
        "s_sh000300": ("000300.SH", "沪深300"),
    }

    result: List[Dict[str, Any]] = []
    sina_codes = ",".join(INDEX_SYMBOLS.keys())
    sina_url = f"http://hq.sinajs.cn/list={sina_codes}"

    try:
        s = _req.Session()
        s.trust_env = False
        resp = s.get(sina_url, headers={"Referer": "https://finance.sina.com.cn"}, timeout=5)
        resp.encoding = "gbk"
        if resp.status_code == 200:
            lines = resp.text.strip().split("\n")
            for line in lines:
                if "=" not in line:
                    continue
                symbol = line.split("=")[0].replace("var hq_str_", "").strip()
                parsed = _parse_sina_index(line)
                if parsed and symbol in INDEX_SYMBOLS:
                    code, _ = INDEX_SYMBOLS[symbol]
                    parsed["code"] = code
                    if not parsed["name"] or len(parsed["name"]) < 2:
                        parsed["name"] = INDEX_SYMBOLS[symbol][1]
                    result.append(parsed)

        if result:
            _indices_cache = {"data": {"success": True, "data": result}, "ts": now}
            return _indices_cache["data"]
    except Exception:
        pass

    # 新浪失败 → akshare 日线
    try:
        import akshare as ak
        indexes = {"sh000001": "上证指数", "sz399001": "深证成指", "sz399006": "创业板指", "sh000300": "沪深300"}
        codes = {"sh000001": "000001.SH", "sz399001": "399001.SZ", "sz399006": "399006.SZ", "sh000300": "000300.SH"}
        for sym, name in indexes.items():
            try:
                df = ak.stock_zh_index_daily(symbol=sym)
                if len(df) >= 2:
                    close = float(df["close"].iloc[-1])
                    prev = float(df["close"].iloc[-2])
                    result.append({
                        "name": name, "code": codes[sym],
                        "price": close,
                        "change": round(close - prev, 2),
                        "changePct": round((close - prev) / prev * 100, 2),
                        "volume": "-",
                    })
            except Exception:
                pass
    except Exception:
        pass

    if result:
        _indices_cache = {"data": {"success": True, "data": result}, "ts": now}
        return _indices_cache["data"]

    return {"success": False, "error": "所有指数数据源均不可用"}


@router.get("/test/stocks")
async def test_get_stocks():
    """测试接口：获取前20只A股实时行情"""
    try:
        data = get_spot_data()
        return {
            "success": True,
            "count": min(len(data), 20),
            "total": len(data),
            "data": data[:20],
        }
    except Exception as e:
        return {"success": False, "error": str(e), "data": []}


# ============================================================
# 板块热度 API
# ============================================================
@router.get("/sectors")
async def get_sectors():
    """
    获取各行业板块综合分析数据

    返回字段:
      name             - 板块名称
      changePct       - 板块当日涨跌幅 (%)
      netInflow       - 主力净流入估算（亿元）
      volumePct       - 成交额占比 (%)
      leaders         - 龙头股票名称列表
      status          - HOT | STABLE | COOL
      momentumScore   - 轮动评分 (0-100)
      alpha           - Alpha 超额收益 (%)
      rank            - 综合排名
      strength        - 强度标签
      capitalTrend    - 资金趋势
      historicalChange - 近5日累计涨跌幅
      beatCount       - 跑赢大盘天数 (近5日)
      marketAvgPct    - 大盘平均涨跌幅
      stockCount      - 成分股数量
    """
    from datetime import date, timedelta
    from sqlalchemy import text
    from database import engine

    try:
        today = date.today()
        recent5 = today - timedelta(days=7)
        # 取数据库最新交易日（周末/节假日自动取最近交易日）
        with engine.connect() as conn:
            latest_date_row = conn.execute(text("SELECT MAX(trade_date) FROM stock_daily_k")).fetchone()
            latest_date = latest_date_row[0] if latest_date_row else today

            def classify_sector(code: str) -> str:
                c = str(code or "").zfill(6)
                if c.startswith(("8", "4", "92")):
                    return "北交所"
                if c.startswith("68"):
                    return "科创板"
                if c.startswith("30"):
                    return "创业板"
                if c.startswith("002"):
                    return "中小板"
                if c.startswith(("000", "001")):
                    return "深市主板"
                if c.startswith("6"):
                    return "沪市主板"
                return "深市主板"

            # 1. 当日板块聚合（按代码前缀分类）
            rows = conn.execute(
                text("""
                    SELECT
                        COALESCE(b.industry, k.code) AS industry,
                        COUNT(DISTINCT k.code) AS stock_count,
                        AVG(k.pct_change) AS avg_change,
                        SUM(k.amount) AS total_amount,
                        ARRAY_AGG(k.code ORDER BY k.pct_change DESC NULLS LAST) FILTER (WHERE k.pct_change IS NOT NULL) AS top_codes
                    FROM stock_daily_k k
                    LEFT JOIN stock_basic b ON k.code = b.code
                    WHERE k.trade_date = :latest_date
                      AND k.amount > 0
                    GROUP BY COALESCE(b.industry, k.code)
                    ORDER BY avg_change DESC
                    LIMIT 50
                """),
                {"latest_date": latest_date}
            ).fetchall()

            # 用前缀分类重分组
            sector_map: Dict[str, Dict[str, Any]] = {}
            for row in rows:
                raw_name = str(row[0] or "其它")
                # 如果是6位代码，说明 industry 为 NULL，用代码前缀分类
                if len(raw_name) == 6 and raw_name.isdigit():
                    sector_name = classify_sector(raw_name)
                else:
                    sector_name = raw_name

                if sector_name not in sector_map:
                    sector_map[sector_name] = {"stocks": [], "total_amount": 0.0}
                sector_map[sector_name]["stocks"].append({
                    "code": raw_name if len(raw_name) == 6 else "",
                    "change": float(row[2] or 0),
                    "amount": float(row[3] or 0),
                })
                sector_map[sector_name]["total_amount"] += float(row[3] or 0)

            # 重新计算各板块聚合数据
            total_amount = sum(v["total_amount"] for v in sector_map.values())
            if total_amount <= 0:
                total_amount = 1.0

            all_codes = [str(r[0] or "") for r in rows if len(str(r[0] or "")) == 6]
            all_codes_str = "', '".join(all_codes)

            # 2. 近5日板块累计涨幅
            hist_rows = conn.execute(
                text(f"""
                    SELECT
                        k.code,
                        AVG(k.pct_change) AS avg_change
                    FROM stock_daily_k k
                    WHERE k.trade_date >= :recent5
                      AND k.amount > 0
                      AND k.code IN ('{all_codes_str}')
                    GROUP BY k.code
                """),
                {"recent5": recent5}
            ).fetchall()
            code_hist: Dict[str, float] = {str(r[0]): round(float(r[1] or 0), 2) for r in hist_rows}

            # 3. 大盘平均涨跌幅
            market_avg_row = conn.execute(
                text("""
                    SELECT AVG(pct_change) FROM stock_daily_k
                    WHERE trade_date = :latest_date AND amount > 0
                """),
                {"latest_date": latest_date}
            ).fetchone()
            market_avg = round(float(market_avg_row[0] or 0), 2) if market_avg_row else 0.0

            # 4. 各板块跑赢大盘天数（按日聚合）
            beat_rows = conn.execute(
                text(f"""
                    SELECT
                        k.code,
                        k.trade_date,
                        AVG(k.pct_change) AS avg_change
                    FROM stock_daily_k k
                    WHERE k.trade_date >= :recent5
                      AND k.amount > 0
                      AND k.code IN ('{all_codes_str}')
                    GROUP BY k.code, k.trade_date
                    ORDER BY k.code, k.trade_date
                """),
                {"recent5": recent5}
            ).fetchall()

            code_beat: Dict[str, int] = {}
            for code, td, chg in beat_rows:
                c = str(code or "")
                if c not in code_beat:
                    code_beat[c] = 0
                if float(chg or 0) > market_avg:
                    code_beat[c] += 1

            # 5. 龙头股（名称）
            name_rows = conn.execute(
                text(f"""
                    SELECT k.code, b.name
                    FROM stock_daily_k k
                    LEFT JOIN stock_basic b ON k.code = b.code
                    WHERE k.trade_date = :latest_date
                      AND k.amount > 0
                      AND k.code IN ('{all_codes_str}')
                    ORDER BY k.pct_change DESC
                    LIMIT 200
                """),
                {"latest_date": latest_date}
            ).fetchall()
            code_to_name: Dict[str, str] = {str(r[0]): str(r[1] or "") for r in name_rows}

        # 6. 汇总所有板块数据
        sectors = []
        for sector_name, info in sector_map.items():
            stocks = info["stocks"]
            cnt = len(stocks)
            avg_chg = sum(s["change"] for s in stocks) / cnt if cnt > 0 else 0.0
            amt = info["total_amount"]

            vol_pct_val = round((amt / total_amount) * 100, 2)
            net_inflow_val = round(avg_chg * 0.5 * cnt * 0.1, 1)
            hist_chg = sum(code_hist.get(s["code"], 0) for s in stocks) / cnt if cnt > 0 else 0.0
            beat_cnt = sum(code_beat.get(s["code"], 0) for s in stocks) / cnt if cnt > 0 else 0
            alpha_val = round(avg_chg - market_avg, 2)

            momentum = round(
                0.35 * max(0, avg_chg + 3) / 6 * 100 +
                0.25 * max(0, hist_chg + 5) / 10 * 100 +
                0.20 * min(100, max(0, beat_cnt) / 5 * 100) +
                0.20 * min(100, max(0, net_inflow_val + 20) / 40 * 100),
                1
            )

            if momentum >= 80:
                strength = "极强"
            elif momentum >= 60:
                strength = "强势"
            elif momentum >= 40:
                strength = "中性"
            elif momentum >= 20:
                strength = "弱势"
            else:
                strength = "极弱"

            capital_trend = "流入" if net_inflow_val > 5 else ("流出" if net_inflow_val < -5 else "平稳")
            status = "HOT" if avg_chg >= 1.5 else ("COOL" if avg_chg <= -1.5 else "STABLE")

            # 取该板块涨幅前3的股票名称作为龙头
            top_stocks = sorted(stocks, key=lambda x: x["change"], reverse=True)[:3]
            leaders = [code_to_name.get(s["code"], s["code"]) for s in top_stocks if s["code"] and code_to_name.get(s["code"])]

            sectors.append({
                "name": sector_name,
                "changePct": round(avg_chg, 2),
                "netInflow": net_inflow_val,
                "volumePct": vol_pct_val,
                "leaders": leaders,
                "status": status,
                "momentumScore": momentum,
                "alpha": alpha_val,
                "rank": 0,
                "strength": strength,
                "capitalTrend": capital_trend,
                "historicalChange": round(hist_chg, 2),
                "beatCount": round(beat_cnt, 1),
                "marketAvgPct": market_avg,
                "stockCount": cnt,
            })

        # 按轮动评分排序并赋排名
        sectors.sort(key=lambda x: x["momentumScore"], reverse=True)
        for i, s in enumerate(sectors):
            s["rank"] = i + 1

        up_count = sum(1 for s in sectors if s["changePct"] > 0)
        down_count = len(sectors) - up_count

        return {
            "success": True,
            "count": len(sectors),
            "data": sectors,
            "meta": {
                "upSectors": up_count,
                "downSectors": down_count,
                "totalSectors": len(rows),
                "marketAvgPct": market_avg,
            },
        }
    except Exception as e:
        return {"success": False, "error": str(e), "data": []}


# ============================================================
# 大盘情绪 API
# ============================================================
@router.get("/sentiment")
async def get_market_sentiment():
    """
    获取大盘市场情绪数据

    计算逻辑:
      - 基于全市场涨跌家数比推算恐慌/贪婪指数
      - 基于涨停/跌停家数估算短线情绪
      - 基于全市场成交额估算流动性
    """
    from datetime import date
    from sqlalchemy import text
    from database import engine

    try:
        today = date.today()

        with engine.connect() as conn:
            stats = conn.execute(
                text("""
                    SELECT
                        COUNT(*) FILTER (WHERE pct_change > 9.5) AS limit_up,
                        COUNT(*) FILTER (WHERE pct_change < -9.5) AS limit_down,
                        COUNT(*) FILTER (WHERE pct_change > 0) AS up_count,
                        COUNT(*) FILTER (WHERE pct_change < 0) AS down_count,
                        SUM(amount) AS total_amount,
                        AVG(pct_change) AS market_avg_pct
                    FROM stock_daily_k
                    WHERE trade_date = :today AND amount > 0
                """),
                {"today": today}
            ).fetchone()

        limit_up = int(stats[0] or 0)
        limit_down = int(stats[1] or 0)
        up_count = int(stats[2] or 0)
        down_count = int(stats[3] or 0)
        total_amount = float(stats[4] or 0)
        market_avg_pct = float(stats[5] or 0)
        total = up_count + down_count

        board_ratio = round((up_count / max(total, 1)) * 100, 1)

        # 恐慌/贪婪指数计算
        fear_greed = 50.0
        if limit_up >= 50:
            fear_greed += 15
        elif limit_up >= 30:
            fear_greed += 10
        elif limit_up >= 15:
            fear_greed += 5

        if limit_down >= 30:
            fear_greed -= 15
        elif limit_down >= 15:
            fear_greed -= 8

        amount_billion = total_amount / 1e8
        if amount_billion >= 15000:
            fear_greed += 10
        elif amount_billion >= 10000:
            fear_greed += 5
        elif amount_billion <= 5000:
            fear_greed -= 10
        elif amount_billion <= 7000:
            fear_greed -= 5

        fear_greed = max(0.0, min(100.0, fear_greed))

        if fear_greed >= 75:
            phase = "狂热期"
            description = "两市交易额突破1.5万亿，板块悉数井喷，情绪面临极度超买，短线投机难度上升，注意高位分歧风险。"
        elif fear_greed >= 60:
            phase = "启动期"
            description = "科技及半导体主力大资金强行点火，高度板梯队完好，增量买气开始缓慢溢出，建议积极关注最热龙一做试错。"
        elif fear_greed >= 40:
            phase = "退潮期"
            description = "主力高位兑现撤退，龙头亏钱效应显现，市场进入震荡分化期，资金向防御板块切换。"
        else:
            phase = "冰点期"
            description = "空头力量宣泄极致，全盘交易额缩水至7000亿以下。两市仅余少数大妖股抱团，绝望冰点处酝酿短线转势。"

        return {
            "success": True,
            "phase": phase,
            "fearGreedIndex": int(fear_greed),
            "limitUpCount": limit_up,
            "limitDownCount": limit_down,
            "boardRatio": board_ratio,
            "totalTurnover": round(amount_billion, 0),
            "description": description,
            "marketAvgPct": round(market_avg_pct, 2),
        }
    except Exception as e:
        return {"success": False, "error": str(e)}


# ============================================================
# 行业数据补充 API（纯 HTTP 直连新浪行业接口）
# ============================================================
@router.post("/enrich-industry")
async def enrich_industry():
    """
    批量从新浪财经行业板块接口抓取股票行业分类，写入 stock_basic.industry
    用于补充缺失的行业字段，使板块热度 API 返回真实行业数据
    """
    from database import SessionLocal
    from models import StockBasic
    from database import engine
    from sqlalchemy import text
    import time
    import requests

    code_to_industry: Dict[str, str] = {}

    # 新浪行业板块列表（SW 申万一级行业）
    sw_boards = [
        "银行", "非银金融", "房地产", "建筑材料", "建筑装饰",
        "钢铁", "有色金属", "煤炭", "石油石化", "化工",
        "轻工制造", "纺织服装", "家用电器", "食品饮料", "农林牧渔",
        "商贸零售", "社会服务", "医药生物", "汽车", "机械设备",
        "电力设备", "电子", "计算机", "传媒", "通信",
        "公用事业", "交通运输", "环保", "国防军工", "综合",
    ]

    print(f"[行业补充] 开始从新浪获取 {len(sw_boards)} 个行业板块数据...")

    # 直接调新浪 HTTP 接口（禁用系统代理）
    session = requests.Session()
    session.trust_env = False
    headers = {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
        "Referer": "https://finance.sina.com.cn/",
    }

    for i, board_name in enumerate(sw_boards):
        try:
            url = (
                "http://vip.stock.finance.sina.com.cn/quotes_service/api/json_v2.php/"
                f"Market_Center.getHQNodeDataSimple?page=1&num=200&sort=symbol&asc=1&node={board_name}&symbol=&_s_r_a=page"
            )
            resp = session.get(url, timeout=10, headers=headers)
            if resp.status_code != 200:
                continue
            items = resp.json()
            if not isinstance(items, list):
                continue
            for item in items:
                code = str(item.get("symbol", "")).strip()
                # 去掉 sh/sz/bj 前缀
                for pfx in ("sh", "sz", "bj", "SH", "SZ", "BJ"):
                    if code.startswith(pfx):
                        code = code[len(pfx):]
                        break
                if code and len(code) == 6 and code not in code_to_industry:
                    code_to_industry[code] = board_name
            if (i + 1) % 10 == 0:
                print(f"  进度 {i+1}/{len(sw_boards)} (已映射 {len(code_to_industry)} 只)")
            time.sleep(0.2)
        except Exception as e:
            print(f"  板块 [{board_name}] 失败: {e}")
            time.sleep(0.3)
            continue

    print(f"[行业补充] 共映射 {len(code_to_industry)} 只股票")

    # 写入数据库
    db = SessionLocal()
    updated = 0
    try:
        all_stocks = db.query(StockBasic).all()
        for stock in all_stocks:
            code = str(stock.code or "").zfill(6)
            if code in code_to_industry and not stock.industry:
                stock.industry = code_to_industry[code]
                updated += 1
        db.commit()
        print(f"[行业补充] 写入完成，更新 {updated} 条")

        with engine.connect() as conn:
            r = conn.execute(text(
                "SELECT industry, COUNT(*) as cnt FROM stock_basic "
                "WHERE industry IS NOT NULL AND industry != '' "
                "GROUP BY industry ORDER BY cnt DESC LIMIT 10"
            ))
            print("\n行业分布 Top10:")
            for row in r:
                print(f"  {row[0]}: {row[1]} 只")
    except Exception as e:
        db.rollback()
        return {"success": False, "error": f"数据库写入失败: {e}"}
    finally:
        db.close()

    return {"success": True, "mapped": len(code_to_industry), "updated": updated}
