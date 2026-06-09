"""
AKShare 数据获取服务

VPN 模式下直连（强制禁用代理），无 VPN 时通过 HTTP_PROXY 环境变量使用 Clash 7897 代理。
"""
import os
# 强制清空代理（VPN 模式下直连，避免代理拒绝东财连接）
for _k in ("HTTP_PROXY", "HTTPS_PROXY", "http_proxy", "https_proxy",
           "HTTP_PROXY_USER", "HTTP_PROXY_PASS",
           "HTTPS_PROXY_USER", "HTTPS_PROXY_PASS"):
    os.environ.pop(_k, None)
import signal
import pandas as pd
import requests
from typing import List, Dict, Optional
from functools import wraps

_PROXY = {
    "http": os.getenv("HTTP_PROXY") or os.getenv("http_proxy") or os.getenv("HTTPS_PROXY") or os.getenv("https_proxy") or "",
    "https": os.getenv("HTTPS_PROXY") or os.getenv("https_proxy") or os.getenv("HTTP_PROXY") or os.getenv("http_proxy") or "",
}
if not _PROXY.get("http"):
    _PROXY = {}
if not _PROXY.get("https"):
    _PROXY.pop("https", None)
_PROXY = {k: v for k, v in _PROXY.items() if v}

# ============================================================
# Monkey-patch: 给 requests.Session 添加默认超时（不影响代理）
# ============================================================
_original_send = requests.Session.send


def _patched_send(self, request, **kwargs):
    if kwargs.get("timeout") is None:
        kwargs["timeout"] = 15
    return _original_send(self, request, **kwargs)


requests.Session.send = _patched_send

# 强制所有 Session 实例禁用 WinINET 系统代理（VPN 直连模式）
_orig_init = requests.Session.__init__
def _pached_init(self, *args, **kwargs):
    _orig_init(self, *args, **kwargs)
    self.trust_env = False
requests.Session.__init__ = _pached_init

# 全局 socket 超时兜底
import socket
socket.setdefaulttimeout(15)

import akshare as ak


def _with_timeout(timeout: int = 15):
    """装饰器：给同步函数添加超时保护，防止永久阻塞 FastAPI 线程池"""
    def decorator(func):
        @wraps(func)
        def wrapper(*args, **kwargs):
            import concurrent.futures
            with concurrent.futures.ThreadPoolExecutor(max_workers=1) as executor:
                future = executor.submit(func, *args, **kwargs)
                try:
                    return future.result(timeout=timeout)
                except concurrent.futures.TimeoutError:
                    raise TimeoutError(f"{func.__name__} 执行超时（>{timeout}s），数据源不可用")
        return wrapper
    return decorator


def _http_get(url: str, headers: dict = None, timeout: int = 10) -> requests.Response:
    """HTTP GET（强制禁用所有代理直连，适配 VPN 模式）"""
    session = requests.Session()
    session.trust_env = False  # 禁用 WinINET 系统代理
    kwargs = {"timeout": timeout}
    if headers:
        kwargs["headers"] = headers
    return session.get(url, **kwargs)


def get_spot_data() -> List[Dict]:
    """
    获取沪深京 A 股实时行情

    优先：直连东方财富 API（通过代理）
    降级：新浪财经接口（通过代理）
    """
    # 方案1：东方财富实时行情
    try:
        url = "https://push2.eastmoney.com/api/qt/clist/get?pn=1&pz=200&po=3&np=1&ut=bd1d9ddb04089700cf9c27f6f7426219&fltt=2&invt=2&wbp2f=|0|0|0|web&fid=f3&fs=m:0+t:6,m:0+t:80,m:1+t:2,m:1+t:23,m:0+t:81+s:2048&fields=f1,f2,f3,f4,f5,f6,f7,f8,f9,f10,f11,f12,f13,f14,f15,f16,f17,f18,f20,f21,f23,f24,f25,f22,f115,f62,f128"
        resp = _http_get(url, headers={
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
            "Referer": "https://finance.eastmoney.com/",
            "Accept": "application/json, text/plain, */*",
        }, timeout=12)
        resp.raise_for_status()
        json_data = resp.json()
        if json_data and json_data.get("data") and json_data["data"].get("diff"):
            raw = list(json_data["data"]["diff"].values())
            result = [
                {
                    "代码": item.get("f12"),
                    "名称": item.get("f14"),
                    "最新价": str(item.get("f2", "")),
                    "涨跌幅": str(item.get("f3", "")),
                    "涨跌额": str(item.get("f4", "")),
                    "成交量": str(item.get("f5", "")),
                    "成交额": str(item.get("f6", "")),
                    "振幅": str(item.get("f7", "")),
                    "最高": str(item.get("f15", "")),
                    "最低": str(item.get("f16", "")),
                    "今开": str(item.get("f17", "")),
                    "昨收": str(item.get("f18", "")),
                    "量比": str(item.get("f11", "")),
                    "换手率": str(item.get("f8", "")),
                    "市盈率": str(item.get("f9", "")),
                    "市净率": str(item.get("f10", "")),
                    "f12": str(item.get("f12", "")),
                    "f14": str(item.get("f14", "")),
                    "f2": str(item.get("f2", "")),
                    "f3": str(item.get("f3", "")),
                    "f4": str(item.get("f4", "")),
                }
                for item in raw
                if item.get("f12")
            ]
            if result:
                return result
    except Exception as e:
        print(f"[行情] 东方财富接口失败: {e}")

    # 方案2：新浪财经全市场接口（gbk 编码，稳定可靠）
    try:
        sina_url = (
            "http://vip.stock.finance.sina.com.cn/quotes_service/api/json_v2.php/"
            "Market_Center.getHQNodeDataSimple?page=1&num=200&sort=symbol"
            "&asc=1&node=hs_a&symbol=&_s_r_a=page"
        )
        resp2 = _http_get(sina_url, headers={
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
            "Referer": "https://finance.sina.com.cn/",
            "Accept": "application/json, text/javascript, */*",
        }, timeout=12)
        resp2.raise_for_status()
        text = resp2.content.decode("utf-8", errors="replace")
        # 清理 JSONP 包装
        import re as _re
        text = _re.sub(r'^(?:var \w+=|[^(]+\()[",\s]*', '', text)
        text = _re.sub(r'\);?\s*$', '', text)
        raw_data = json.loads(text) if text.strip().startswith("[") else []
        if isinstance(raw_data, list) and raw_data:
            result = [
                {
                    "代码": str(item.get("symbol") or item.get("code") or ""),
                    "名称": str(item.get("name") or ""),
                    "最新价": str(item.get("trade") or item.get("pricechange") or "0"),
                    "涨跌幅": str(item.get("changepercent") or 0),
                    "涨跌额": str(item.get("pricechange") or 0),
                    "成交量": str(item.get("volume") or 0),
                    "成交额": str(item.get("amount") or 0),
                    "最高": str(item.get("high") or 0),
                    "最低": str(item.get("low") or 0),
                    "今开": str(item.get("open") or 0),
                    "昨收": str(item.get("settlement") or 0),
                    "f12": str(item.get("symbol") or item.get("code") or ""),
                    "f14": str(item.get("name") or ""),
                    "f2": str(item.get("trade") or 0),
                    "f3": str(item.get("changepercent") or 0),
                    "f4": str(item.get("pricechange") or 0),
                    "f5": str(item.get("volume") or 0),
                }
                for item in raw_data
                if item.get("symbol") or item.get("code")
            ]
            if result:
                return result
    except Exception as e:
        print(f"[行情] 新浪全市场接口失败: {e}")

    raise Exception("所有实时行情数据源均不可用，请检查代理设置")


def _code_to_sina_symbol(code: str) -> str:
    """将代码转为新浪格式: 600519 → sh600519"""
    code = str(code).zfill(6)
    if code.startswith(("6", "9")):
        return f"sh{code}"
    elif code.startswith(("0", "3")):
        return f"sz{code}"
    elif code.startswith(("4", "8")):
        return f"bj{code}"
    return f"sh{code}"


def get_stock_daily(code: str, start_date: str = None, end_date: str = None,
                    adjust: str = "qfq") -> List[Dict]:
    """
    获取单只股票历史日K线数据（双数据源）

    优先: stock_zh_a_hist (东方财富, 复权数据更准)
    降级: stock_zh_a_daily (新浪)
    """
    from datetime import datetime
    if start_date is None:
        start_date = "20200101"
    if end_date is None:
        end_date = datetime.now().strftime("%Y%m%d")

    # 东方财富
    try:
        df = ak.stock_zh_a_hist(
            symbol=code, period="daily",
            start_date=start_date, end_date=end_date, adjust=adjust,
        )
        df = df.where(pd.notnull(df), None)
        return df.to_dict(orient="records")
    except Exception:
        pass

    # 降级：新浪
    try:
        symbol = _code_to_sina_symbol(code)
        df = ak.stock_zh_a_daily(
            symbol=symbol, adjust=adjust,
            start_date=start_date, end_date=end_date,
        )
        df = df.where(pd.notnull(df), None)
        return df.to_dict(orient="records")
    except Exception as e:
        raise Exception(f"AKShare 获取 {code} 日K线失败（所有数据源）: {str(e)}")
