import sys, os
sys.path.insert(0, 'd:/a-share-ai-decision/a股ai选股系统2026-6-6/backend')

# 强制禁用代理
for _k in ("HTTP_PROXY", "HTTPS_PROXY", "http_proxy", "https_proxy"):
    os.environ.pop(_k, None)

import requests

# 测试新浪行业接口
print("=== 测试1: 新浪行业板块 ===")
try:
    url = "http://vip.stock.finance.sina.com.cn/quotes_service/api/json_v2.php/Market_Center.getHQNodeDataSimple?page=1&num=5&sort=symbol&asc=1&node=sw_a&symbol=&_s_r_a=page"
    r = requests.get(url, timeout=10, proxies={"http": None, "https": None}, headers={"Referer": "https://finance.sina.com.cn/"})
    print(f"新浪行业: {r.status_code}")
except Exception as e:
    print(f"新浪失败: {e}")

# 测试东财
print("\n=== 测试2: 东财行业板块 ===")
try:
    import akshare as ak
    df = ak.stock_board_industry_name_em()
    print(f"东财成功: {len(df)} 个板块")
    print(df.head(3))
except Exception as e:
    print(f"东财失败: {e}")
