#!/bin/bash
# =============================================
# A股AI选股系统 — 双轨服务启动脚本 (Linux/macOS)
# =============================================
set -e

ROOT_DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$ROOT_DIR"

echo ""
echo "============================================="
echo "  A股AI选股系统 — 双轨服务启动器"
echo "============================================="
echo ""

# 检查 .env
if [ ! -f ".env" ]; then
    echo "[警告] .env 文件不存在，请复制 .env.example 为 .env 并填写配置"
fi

# 检查 Python 依赖
echo "[1/4] 检查 Python 依赖..."
if ! python3 -c "import fastapi" 2>/dev/null; then
    echo "[提示] 正在安装 Python 依赖..."
    pip3 install -r backend/requirements.txt -q
fi

# 检查 npm 依赖
echo "[2/4] 检查 Node.js 依赖..."
if [ ! -d "node_modules" ]; then
    echo "[提示] 正在安装 Node.js 依赖..."
    npm install
fi

# 启动后端 FastAPI
echo "[3/4] 启动后端 FastAPI (http://localhost:8000) ..."
python3 backend/main.py &
BACKEND_PID=$!

# 等待后端启动
sleep 3

# 启动前端 Express 网关
echo "[4/4] 启动前端网关 (http://localhost:3000) ..."
npm run dev &
FRONTEND_PID=$!

echo ""
echo "============================================="
echo "  服务已启动！"
echo "  前端界面:  http://localhost:3000"
echo "  后端API:   http://localhost:8000"
echo "  API文档:   http://localhost:8000/docs"
echo "============================================="
echo ""
echo "提示: 按 Ctrl+C 可停止所有服务"
echo ""

# 等待任意子进程退出
trap "kill $BACKEND_PID $FRONTEND_PID 2>/dev/null; exit" SIGINT SIGTERM
wait
