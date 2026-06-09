import requests, time, re

session = requests.Session()
session.trust_env = False

# 试腾讯股票接口（含行业字段）
print("=== 腾讯股票接口（含行业）===")
try:
    url = "https://qt.gtimg.cn/q=sh600519"
    resp = session.get(url, timeout=10, headers={
        "User-Agent": "Mozilla/5.0",
        "Referer": "https://gu.qq.com/",
    })
    print(f"status={resp.status_code}, body={resp.text[:600]}")
    # 解析字段
    parts = resp.text.split("~")
    if len(parts) > 40:
        print(f"字段数: {len(parts)}")
        for i, p in enumerate(parts):
            if p.strip():
                print(f"  [{i}]: {p}")
except Exception as e:
    print(f"失败: {e}")

# 试富途接口
print("\n=== 富途行情 ===")
try:
    url = "https://openapi.futunn.com/futu-quotation-api/quote/get-stock-kl?code=HK.00700&startDate=2024-01-01&endDate=2024-01-02"
    resp = session.get(url, timeout=10, headers={"User-Agent": "Mozilla/5.0"})
    print(f"status={resp.status_code}")
except Exception as e:
    print(f"失败: {e}")

# 试聚合数据
print("\n=== 新浪个股公司信息(含行业) ===")
for stockid in ["600519", "000001", "300750"]:
    try:
        url = f"http://vip.stock.finance.sina.com.cn/corp/go.php/vCI_CorpInfo/stockid/{stockid}.phtml"
        resp = session.get(url, timeout=10, headers={
            "User-Agent": "Mozilla/5.0",
            "Referer": "https://finance.sina.com.cn/",
        })
        if resp.status_code == 200 and len(resp.text) > 100:
            # 找行业
            matches = re.findall(r'所属行业[^>]*>([^<]+)', resp.text)
            if matches:
                print(f"  {stockid}: {matches[0]}")
            else:
                # 找 table 中含行业的
                m = re.search(r'行业.*?([^\s<]{2,15}行业)', resp.text[:20000])
                if m:
                    print(f"  {stockid}: {m.group(1)}")
                else:
                    print(f"  {stockid}: 未找到")
        time.sleep(0.3)
    except Exception as e:
        print(f"  {stockid}: 失败 {e}")
