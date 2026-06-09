"""
技术指标计算服务
基于 pandas/numpy 实现 MACD/RSI/BOLL/KDJ/MA

输入: pd.DataFrame, 至少包含 [open, high, low, close, volume]
输出: Dict[str, pd.Series]
"""
import pandas as pd
import numpy as np
from typing import Dict, Optional


def calc_ma(close: pd.Series, periods: list = None) -> Dict[str, pd.Series]:
    """
    简单移动平均线
    """
    if periods is None:
        periods = [5, 10, 20, 60]
    result = {}
    for p in periods:
        result[f"ma{p}"] = close.rolling(window=p).mean()
    return result


def calc_macd(close: pd.Series, fast: int = 12, slow: int = 26, signal: int = 9) -> Dict[str, pd.Series]:
    """
    MACD 指标 (EMA 实现)
    返回: dif, dea, macd_hist
    """
    ema_fast = close.ewm(span=fast, adjust=False).mean()
    ema_slow = close.ewm(span=slow, adjust=False).mean()
    dif = ema_fast - ema_slow
    dea = dif.ewm(span=signal, adjust=False).mean()
    macd_hist = 2 * (dif - dea)

    return {
        "macd_dif": dif.round(4),
        "macd_dea": dea.round(4),
        "macd_hist": macd_hist.round(4),
    }


def calc_rsi(close: pd.Series, periods: list = None) -> Dict[str, pd.Series]:
    """
    RSI 相对强弱指标 (Wilder's smoothing)
    """
    if periods is None:
        periods = [6, 12, 24]

    result = {}
    for p in periods:
        delta = close.diff()
        gain = delta.where(delta > 0, 0.0)
        loss = (-delta).where(delta < 0, 0.0)
        avg_gain = gain.ewm(alpha=1.0 / p, adjust=False).mean()
        avg_loss = loss.ewm(alpha=1.0 / p, adjust=False).mean()
        rs = avg_gain / avg_loss.replace(0, np.nan)
        rsi = 100 - (100 / (1 + rs))
        result[f"rsi{p}"] = rsi.round(2)
    return result


def calc_boll(df: pd.DataFrame, period: int = 20, std: int = 2) -> Dict[str, pd.Series]:
    """
    布林带
    返回: boll_upper, boll_mid, boll_lower, boll_width, boll_pct_b
    """
    close = df["close"]
    mid = close.rolling(window=period).mean()
    std_dev = close.rolling(window=period).std()
    upper = mid + std * std_dev
    lower = mid - std * std_dev
    width = (upper - lower) / mid * 100  # 带宽百分比
    pct_b = (close - lower) / (upper - lower)  # %B 指标

    return {
        "boll_upper": upper.round(2),
        "boll_mid": mid.round(2),
        "boll_lower": lower.round(2),
        "boll_width": width.round(2),
        "boll_pct_b": pct_b.round(4),
    }


def calc_kdj(df: pd.DataFrame, n: int = 9) -> Dict[str, pd.Series]:
    """
    KDJ 随机指标
    返回: kdj_k, kdj_d, kdj_j
    """
    high_n = df["high"].rolling(window=n).max()
    low_n = df["low"].rolling(window=n).min()
    close = df["close"]

    rsv = ((close - low_n) / (high_n - low_n + 1e-10)) * 100

    k = rsv.ewm(com=2, adjust=False).mean()  # 1/3 smooth
    d = k.ewm(com=2, adjust=False).mean()
    j = 3 * k - 2 * d

    return {
        "kdj_k": k.round(2),
        "kdj_d": d.round(2),
        "kdj_j": j.round(2),
    }


def calc_vol_ma(volume: pd.Series, periods: list = None) -> Dict[str, pd.Series]:
    """成交量均线"""
    if periods is None:
        periods = [5, 20]
    result = {}
    for p in periods:
        result[f"vol_ma{p}"] = volume.rolling(window=p).mean()
    return result


def calc_atr(df: pd.DataFrame, period: int = 14) -> pd.Series:
    """ATR 平均真实波幅"""
    high, low, close = df["high"], df["low"], df["close"]
    tr = pd.concat([
        high - low,
        (high - close.shift()).abs(),
        (low - close.shift()).abs(),
    ], axis=1).max(axis=1)
    return tr.ewm(span=period, adjust=False).mean().round(4)


def calc_all(df: pd.DataFrame) -> Dict[str, pd.Series]:
    """
    一键计算全部技术指标

    参数:
        df: pd.DataFrame
            必须包含列: [open, high, low, close, volume]
            索引: 日期 (升序)

    返回:
        dict: 所有指标 Series 的字典，键名统一命名
    """
    close = df["close"]
    volume = df["volume"]

    result = {}

    # MA 均线
    result.update(calc_ma(close))

    # MACD
    result.update(calc_macd(close))

    # RSI
    result.update(calc_rsi(close))

    # BOLL
    result.update(calc_boll(df))

    # KDJ
    result.update(calc_kdj(df))

    # 成交量均线
    result.update(calc_vol_ma(volume))

    # ATR
    result["atr14"] = calc_atr(df)

    return result


def indicators_summary(indicators: Dict[str, pd.Series], idx: int = -1) -> Dict:
    """
    取最新一条指标数据，返回可 JSON 序列化的摘要

    参数:
        indicators: calc_all() 的返回值
        idx: 取哪一行，-1 为最新

    返回:
        dict: 最新指标值
    """
    summary = {}
    for key, series in indicators.items():
        val = series.iloc[idx]
        summary[key] = None if pd.isna(val) else round(float(val), 4)
    return summary
