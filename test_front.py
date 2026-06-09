import urllib.request, json

url = 'http://127.0.0.1:3000/api/market/spot?limit=5'
r = urllib.request.urlopen(url, timeout=10)
d = json.loads(r.read())
stocks = d.get('data', [])
print(f'总数: {len(stocks)}')
for i, s in enumerate(stocks[:5]):
    print(f'  [{i}] 代码={s.get("代码")} 名称={s.get("名称")} 涨跌幅={s.get("涨跌幅")}')
