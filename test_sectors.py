import urllib.request, json

url = 'http://127.0.0.1:3000/api/market/sectors'
try:
    r = urllib.request.urlopen(url, timeout=10)
    d = json.loads(r.read())
    print(f"success: {d.get('success')}, count: {d.get('count')}")
    meta = d.get('meta', {})
    print(f"meta: {meta}")
    sectors = d.get('data', [])
    for s in sectors[:3]:
        print(f"  {s.get('name')}: momentumScore={s.get('momentumScore')}, alpha={s.get('alpha')}, strength={s.get('strength')}")
except Exception as e:
    print(f"ERROR: {e}")
