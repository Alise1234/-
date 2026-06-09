import urllib.request, json, sys, os

# 清理代理
for _k in ("HTTP_PROXY", "HTTPS_PROXY", "http_proxy", "https_proxy"):
    os.environ.pop(_k, None)
os.environ["HTTP_PROXY"] = "http://127.0.0.1:7897".strip()
os.environ["HTTPS_PROXY"] = "http://127.0.0.1:7897".strip()

print(f"HTTP_PROXY = {os.environ.get('HTTP_PROXY')!r}")

# 测试1: 新浪
print("\n=== 测试1: 新浪财经 ===")
try:
    url = "http://vip.stock.finance.sina.com.cn/quotes_service/api/json_v2.php/Market_Center.getHQNodeDataSimple?page=1&num=5&sort=symbol&asc=1&node=hs_a&symbol=&_s_r_a=page"
    r = urllib.request.urlopen(url, timeout=10)
    print(f"新浪: {r.status}")
except Exception as e:
    print(f"新浪失败: {e}")

# 测试2: 东财
print("\n=== 测试2: 东财 ===")
try:
    import akshare as ak
    df = ak.stock_board_industry_name_em()
    print(f"东财行业板块数: {len(df)}")
except Exception as e:
    print(f"东财失败: {e}")

# 测试3: akshare stock_info
print("\n=== 测试3: AKShare stock_info ===")
try:
    import akshare as ak2
    df2 = ak2.stock_info_a_code_name()
    print(f"股票基本信息: {len(df2)} 条")
except Exception as e:
    print(f"失败: {e}")
