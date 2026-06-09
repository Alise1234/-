import urllib.request, json, sys

endpoints = [
    '/api/market/indices',
    '/api/market/sectors',
    '/api/market/sentiment',
    '/api/market/stocks',
    '/api/analysis/scores/000001',
]
for ep in endpoints:
    try:
        r = urllib.request.urlopen('http://127.0.0.1:8000' + ep, timeout=5)
        d = json.loads(r.read())
        cnt = len(d.get('data', [])) if isinstance(d.get('data'), list) else '?'
        print(f"OK {ep}: success={d.get('success','?')}, count={cnt}")
    except Exception as e:
        print(f"FAIL {ep}: {e}", file=sys.stderr)
