"""
新闻消息服务 V1.0
数据源: akshare stock_news_em (东方财富实时新闻)
筛选: 按行业关键词 + 个股代码 过滤
输出: 标注利好/利空/中性的结构化新闻流
"""
import logging
from typing import Dict, List, Optional
from datetime import datetime, timedelta

logger = logging.getLogger(__name__)

# 利好/利空关键词
POSITIVE_KEYS = ["增长", "预增", "利好", "突破", "中标", "订单", "涨价", "扩产", "回购",
                 "增持", "分红", "降息", "宽松", "放松", "获批", "签约", "创新高"]
NEGATIVE_KEYS = ["下降", "预亏", "利空", "减持", "亏损", "违约", "爆雷", "立案", "调查",
                 "退市", "跌停", "暴跌", "加息", "收紧", "制裁", "限制", "暂停"]

# 行业关键词映射
SECTOR_KEYWORDS = {
    "半导体": ["芯片", "半导体", "晶圆", "光刻", "封装", "EDA", "中芯", "寒武纪"],
    "AI算力": ["人工智能", "AI", "大模型", "算力", "GPU", "服务器", "数据中心"],
    "新能源汽车": ["新能源", "锂电", "电车", "光伏", "储能", "风电", "宁德"],
    "消费": ["茅台", "白酒", "食品", "家电", "零售", "餐饮", "旅游"],
    "金融": ["银行", "券商", "保险", "利率", "LPR", "降准", "央行"],
    "医药": ["医药", "生物", "疫苗", "器械", "创新药", "CXO"],
    "地产基建": ["房地产", "基建", "建材", "钢铁", "水泥"],
}


def _get_ak():
    try:
        import akshare as ak
        return ak
    except ImportError:
        return None


def fetch_market_news(limit: int = 30) -> List[Dict]:
    """
    拉取最新市场新闻

    返回: [{time, title, source, sentiment, tags, related_stocks}]
    """
    ak = _get_ak()
    if not ak:
        return _empty_news()

    try:
        raw = ak.stock_news_em()
        if raw is None or len(raw) == 0:
            return _empty_news()

        news_list = []
        for i in range(min(limit * 3, len(raw))):
            row = raw.iloc[i]
            title = str(row.get("标题", row.get("title", "")))
            if not title:
                continue

            sentiment = _classify_sentiment(title)
            tags = _extract_tags(title)
            related = _extract_stock_codes(title)

            news_list.append({
                "time": str(row.get("发布时间", row.get("time", datetime.now().strftime("%H:%M")))),
                "title": title,
                "source": str(row.get("来源", row.get("source", ""))),
                "sentiment": sentiment,
                "tags": tags[:3],
                "related_stocks": related[:3],
            })

            if len(news_list) >= limit:
                break

        return news_list
    except Exception as e:
        logger.warning(f"新闻拉取失败: {e}")
        return _empty_news()


def fetch_news_by_stock(code: str, limit: int = 10) -> List[Dict]:
    """按股票代码过滤新闻"""
    all_news = fetch_market_news(limit * 3)
    result = []
    for n in all_news:
        if code in n.get("related_stocks", []) or code in n["title"]:
            result.append(n)
            if len(result) >= limit:
                break
    return result


def _classify_sentiment(title: str) -> str:
    pos = sum(1 for k in POSITIVE_KEYS if k in title)
    neg = sum(1 for k in NEGATIVE_KEYS if k in title)
    if pos > neg:
        return "positive"
    elif neg > pos:
        return "negative"
    return "neutral"


def _extract_tags(title: str) -> List[str]:
    tags = []
    for sector, keywords in SECTOR_KEYWORDS.items():
        if any(k in title for k in keywords):
            tags.append(sector)
    return tags if tags else ["综合"]


def _extract_stock_codes(title: str) -> List[str]:
    """从标题中提取股票代码（6位数字）"""
    import re
    codes = re.findall(r'\b(\d{6})\b', title)
    # 过滤无效代码
    valid = []
    for c in codes:
        if c.startswith(("60", "00", "30", "68")):
            valid.append(c)
    return valid


def _empty_news() -> List[Dict]:
    return [{"time": "--", "title": "新闻数据加载中，请确认 akshare 已安装且网络可达",
             "source": "system", "sentiment": "neutral", "tags": ["系统"], "related_stocks": []}]
