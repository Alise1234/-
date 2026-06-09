"""
测试更多可能的数据源域名
"""
import urllib.request

test_urls = [
    ("cninfo", "https://www.cninfo.com.cn/"),
    ("eastmoney datacenter", "https://datacenter.eastmoney.com/"),
    ("eastmoney api", "https://datacenter.eastmoney.com/securities/api/data/v1/get?reportName=RPT_F10_BASIC_ORGINFO&columns=SECURITY_CODE,ORG_TYPE&pageNumber=1&pageSize=3"),
    ("eastmoney industry", "https://datacenter.eastmoney.com/securities/api/data/v1/get?reportName=RPT_SECTOR_F10INFO&columns=SECURITY_CODE,INDUSTRY_NAME&pageNumber=1&pageSize=3"),
    ("sse 财报", "https://www.sse.com.cn/"),
    ("szse", "https://www.szse.cn/"),
    ("xueqiu", "https://xueqiu.com/"),
    ("eastmoney quote", "https://quote.eastmoney.com/"),
    ("10jqka", "https://www.10jqka.com.cn/"),
    ("ths", "https://www.ths.com.cn/"),
]

for name, url in test_urls:
    try:
        req = urllib.request.Request(url[:80], headers={"User-Agent": "Mozilla/5.0"})
        proxy_handler = urllib.request.ProxyHandler({})
        opener = urllib.request.build_opener(proxy_handler)
        resp = opener.open(req, timeout=6)
        print(f"  OK  {name}: {resp.status}")
    except Exception as e:
        print(f"  ERR {name}: {str(e)[:70]}")
