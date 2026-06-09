"""
主力资金追踪服务 V1.0
数据源: akshare + 数据库
覆盖: 融资融券、龙虎榜、板块资金流向
"""
import logging
from typing import Dict, List, Optional
from datetime import datetime

logger = logging.getLogger(__name__)


def _get_ak():
    try:
        import akshare as ak
        return ak
    except ImportError:
        return None


def fetch_margin_summary() -> Dict:
    """
    融资融券汇总（沪市+深市合并）
    返回: {total_margin_balance, margin_change, margin_buy_today}
    """
    ak = _get_ak()
    result = {"total_margin_balance": 0, "margin_change": 0, "margin_buy_today": 0}

    if not ak:
        return result

    # 沪市融资融券
    try:
        sse = ak.stock_margin_sse(start_date="20260101")
        if sse is not None and len(sse) >= 1:
            latest = sse.iloc[-1]
            result["total_margin_balance"] = float(latest.get("融资余额", 0) or 0)
            result["margin_buy_today"] = float(latest.get("融资买入额", 0) or 0)
            if len(sse) >= 2:
                prev = sse.iloc[-2]
                result["margin_change"] = round(
                    float(latest.get("融资余额", 0) or 0) - float(prev.get("融资余额", 0) or 0), 1)
    except Exception as e:
        logger.debug(f"沪市融资数据失败: {e}")

    # 深市融资融券（如果沪市数据不足）
    try:
        szse = ak.stock_margin_detail_sz(date="20260609")
        if szse is not None and len(szse) > 0:
            sz_total = szse["融资余额"].sum() if "融资余额" in szse.columns else 0
            if result["total_margin_balance"] == 0:
                result["total_margin_balance"] = round(float(sz_total), 1)
    except Exception as e:
        logger.debug(f"深市融资数据失败: {e}")

    return result


def fetch_lhb_top(date: str = None) -> List[Dict]:
    """
    龙虎榜活跃股 Top 10
    返回: [{code, name, net_buy, buy_amount, sell_amount, reason}]
    """
    ak = _get_ak()
    if not ak:
        return []

    if date is None:
        date = datetime.now().strftime("%Y%m%d")

    try:
        raw = ak.stock_lhb_detail_em(date=date)
        if raw is None or len(raw) == 0:
            return []

        results = []
        for i in range(min(15, len(raw))):
            row = raw.iloc[i]
            results.append({
                "code": str(row.get("代码", "")),
                "name": str(row.get("名称", "")),
                "net_buy": round(float(row.get("净买额", 0) or 0) / 1e8, 2),  # 转亿
                "buy_amount": round(float(row.get("买入额", 0) or 0) / 1e8, 2),
                "sell_amount": round(float(row.get("卖出额", 0) or 0) / 1e8, 2),
                "reason": str(row.get("上榜原因", "")),
            })

        # 按净买入排序
        results.sort(key=lambda x: x["net_buy"], reverse=True)
        return results[:10]
    except Exception as e:
        logger.warning(f"龙虎榜数据失败: {e}")
        return []


def fetch_sector_fund_flow() -> List[Dict]:
    """
    板块资金流向 Top/Bottom 5
    返回: [{sector, net_inflow, inflow_ratio}]
    """
    ak = _get_ak()
    if not ak:
        return []

    try:
        raw = ak.stock_sector_fund_flow_rank(indicator="今日", sector_type="行业资金流向")
        if raw is None or len(raw) == 0:
            return []

        results = []
        for i in range(min(30, len(raw))):
            row = raw.iloc[i]
            results.append({
                "sector": str(row.get("名称", "")),
                "net_inflow": round(float(row.get("净流入", 0) or 0) / 1e8, 2),
                "inflow_ratio": float(row.get("净流入率", 0) or 0),
            })

        results.sort(key=lambda x: x["net_inflow"], reverse=True)
        return results
    except Exception as e:
        logger.warning(f"板块资金流失败: {e}")
        return []
