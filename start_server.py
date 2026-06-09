import sys
import os
import uvicorn

# 动态获取当前目录下的 backend，防止硬编码本地绝对路径导致报错
backend_dir = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'backend')
if os.path.exists(backend_dir):
    sys.path.insert(0, backend_dir)

uvicorn.run('main:app', host='0.0.0.0', port=8000, reload=False)
