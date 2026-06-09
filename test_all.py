import urllib.request, json

tests = [
    (3000, '/api/market/spot?limit=3'),
    (3000, '/api/market/indices'),
    (3000, '/api/market/sectors'),
    (3000, '/api/market/sentiment'),
    (3000, '/api/portfolio/positions'),
]

for port, path in tests:
    url = f"http://127.0.0.1:{port}{path}"
    try:
        r = urllib.request.urlopen(url, timeout=10)
        d = json.loads(r.read())
        if isinstance(d, list):
            print(f"[OK]  :{port}{path} => list[{len(d)}]")
        elif d.get("success") is True:
            cnt = d.get("count", len(d.get("data",[])))
            print(f"[OK]  :{port}{path} => count={cnt}")
        elif d.get("success") is False:
            print(f"[FAIL]:{port}{path} => {d.get('error','')[:80]}")
        else:
            print(f"[???]:{port}{path} => {str(d)[:80]}")
    except Exception as e:
        print(f"[ERR] :{port}{path} => {type(e).__name__}: {e}")
