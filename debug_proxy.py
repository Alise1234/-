import urllib.request

# 测试新浪单页最大数量
urls = [
    ('Simple num=5000', 'http://vip.stock.finance.sina.com.cn/quotes_service/api/json_v2.php/Market_Center.getHQNodeDataSimple?page=1&num=5000&sort=changepercent&asc=0&node=hs_a&symbol=&_s_r_a=page'),
    ('Data num=5000', 'http://vip.stock.finance.sina.com.cn/quotes_service/api/json_v2.php/Market_Center.getHQNodeData?page=1&num=5000&sort=symbol&asc=1&node=hs_a&symbol=&_s_r_a=page'),
]

for name, url in urls:
    try:
        req = urllib.request.Request(url, headers={
            'User-Agent': 'Mozilla/5.0',
            'Referer': 'https://finance.sina.com.cn',
        })
        r = urllib.request.urlopen(req, timeout=10)
        raw = r.read()
        print(f'[OK] {name}: {len(raw)} bytes')
        # 解析 JSONP
        text = raw.decode('utf-8', errors='replace')
        import re
        text2 = re.sub(r'^(?:var \w+=|[^(]+\()[",\s]*', '', text)
        text2 = re.sub(r'\);?\s*$', '', text2)
        data = __import__('json').loads(text2) if text2.strip().startswith('[') else []
        print(f'    items={len(data)}, first={str(data[0])[:100] if data else "empty"}')
        # 统计各板块
        codes = [str(d.get('symbol','')) for d in data]
        print(f'    沪6:{sum(1 for c in codes if c.startswith("sh") and not c.startswith("sh688"))} '
              f'科创68:{sum(1 for c in codes if c.startswith("sh688"))} '
              f'深00:{sum(1 for c in codes if c.startswith("sz") and c[2] in "012")} '
              f'创业30:{sum(1 for c in codes if c.startswith("sz30"))} '
              f'北8/4/9:{sum(1 for c in codes if c.startswith("bj") or c.startswith("sh8") or c.startswith("sh4"))} ')
    except Exception as e:
        print(f'[FAIL] {name}: {type(e).__name__} {e}')
    print()
