import urllib.request, json

tests = [
    (3000, 'GET', '/api/market/spot?limit=3'),
    (3000, 'GET', '/api/market/indices'),
    (3000, 'GET', '/api/market/sectors'),
    (3000, 'GET', '/api/market/sentiment'),
    (3000, 'GET', '/api/portfolio/positions'),
    (3000, 'GET', '/api/portfolio/summary'),
    (8000, 'GET', '/api/market/indices'),
    (8000, 'GET', '/api/market/sectors'),
    (8000, 'GET', '/api/market/sentiment'),
    (8000, 'GET', '/api/portfolio/positions'),
]

print("=" * 70)
print("全面 API 测试")
print("=" * 70)
for port, method, path in tests:
    url = f"http://127.0.0.1:{port}{path}"
    try:
        if method == 'GET':
            r = urllib.request.urlopen(url, timeout=10)
        else:
            r = urllib.request.urlopen(urllib.request.Request(url, method='POST'), timeout=10)
        d = json.loads(r.read())
        if isinstance(d, list):
            print(f"[OK]  [:{port}] {path} => list[{len(d)}]")
        elif d.get("success") is True:
            cnt = d.get("count", len(d.get("data",[])))
            print(f"[OK]  [:{port}] {path} => count={cnt}")
            if 'fearGreedIndex' in d:
                print(f"       fearGreed={d['fearGreedIndex']} phase={d.get('phase')} boardRatio={d.get('boardRatio')}")
            if 'meta' in d:
                print(f"       meta={d['meta']}")
        elif d.get("success") is False:
            print(f"[FAIL][:{port}] {path} => {d.get('error','')[:80]}")
        else:
            print(f"[???][:{port}] {path} => {str(d)[:80]}")
    except Exception as e:
        print(f"[ERR] [:{port}] {path} => {type(e).__name__}: {str(e)[:80]}")
