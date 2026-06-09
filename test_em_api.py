import urllib.request, json, time
time.sleep(2)

# Express 3000 的 spot
try:
    r = urllib.request.urlopen('http://127.0.0.1:3000/api/market/spot?limit=3', timeout=8)
    d = json.loads(r.read())
    print('Express /spot: success=' + str(d.get('success')) + ' count=' + str(d.get('count', len(d.get('data', []))))
except Exception as e:
    print('Express FAIL:', type(e).__name__, e)

# Python 8000 的 spot（通过 Express 获取）
try:
    r2 = urllib.request.urlopen('http://127.0.0.1:8000/api/market/spot?limit=3', timeout=15)
    d2 = json.loads(r2.read())
    print('Python /spot: success=' + str(d2.get('success')) + ' count=' + str(d2.get('count', len(d2.get('data', []))))
except Exception as e:
    print('Python /spot FAIL:', type(e).__name__, e)
