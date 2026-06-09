import urllib.request, json

url = 'http://127.0.0.1:8000/api/market/enrich-industry'
data = json.dumps({}).encode()
req = urllib.request.Request(url, data=data, headers={'Content-Type': 'application/json'}, method='POST')
r = urllib.request.urlopen(req, timeout=120)
d = json.loads(r.read())
print(d)
