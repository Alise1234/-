import urllib.request, json

tests = [
    (8000, '/api/market/spot?limit=3'),
    (8000, '/api/market/indices'),
    (8000, '/api/market/sectors'),
    (8000, '/api/portfolio/positions'),
    (8000, '/api/portfolio/summary'),
    (8000, '/api/market/sentiment'),
]

for port, path in tests:
    url = f"http://127.0.0.1:{port}{path}"
    try:
        r = urllib.request.urlopen(url, timeout=10)
        d = json.loads(r.read())
        if isinstance(d, list):
            print(f"[OK]  Python :{port}{path} => list[{len(d)}]")
        elif d.get("success") is True:
            cnt = d.get("count", len(d.get("data",[])))
            print(f"[OK]  Python :{port}{path} => count={cnt}")
            if 'fearGreedIndex' in d:
                print(f"       fearGreed={d['fearGreedIndex']} phase={d.get('phase')}")
        elif d.get("success") is False:
            print(f"[FAIL] Python :{port}{path} => {d.get('error','')[:80]}")
        else:
            print(f"[???] Python :{port}{path} => {str(d)[:80]}")
    except Exception as e:
        print(f"[ERR] Python :{port}{path} => {type(e).__name__}: {e}")
