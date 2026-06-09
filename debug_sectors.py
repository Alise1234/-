import urllib.request, json

url = 'http://127.0.0.1:3000/api/market/sectors'
r = urllib.request.urlopen(url, timeout=10)
d = json.loads(r.read())
print('count:', d.get('count'))
print('meta:', d.get('meta'))
for s in d.get('data', []):
    print(f'  {s["name"]}: count={s.get("stockCount")} pct={s.get("changePct")}')
