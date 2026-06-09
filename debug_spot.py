import urllib.request, json

r = urllib.request.urlopen('http://127.0.0.1:8000/api/market/spot?limit=2', timeout=10)
d = json.loads(r.read())
print('success:', d.get('success'))
print('count:', d.get('count'))
print('data len:', len(d.get('data', [])))
if d.get('data'):
    print('first:', d['data'][0])
print('error:', d.get('error', ''))
