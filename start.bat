@echo off
chcp 65001 >nul
title A股AI选股系统 — 双轨启动器

echo.
echo =============================================
echo   A股AI选股系统 — 双轨服务启动器
echo =============================================
echo.

:: ------- 设置 Python 3.12 路径 -------
set PYTHON_EXE=%LOCALAPPDATA%\Programs\Python\Python312\python.exe

:: ------- 设置 HTTP/HTTPS 代理（Clash VPN 直连国内财经网站） -------
set HTTP_PROXY=http://127.0.0.1:7897
set HTTPS_PROXY=http://127.0.0.1:7897
set http_proxy=http://127.0.0.1:7897
set https_proxy=http://127.0.0.1:7897

:: ------- 设置工作目录 -------
set ROOT_DIR=%~dp0
cd /d "%ROOT_DIR%"

:: ------- 检查 .env 文件 -------
if not exist ".env" (
    echo [警告] .env 文件不存在，请复制 .env.example 为 .env 并填写配置
)

:: ------- 检查 pip 依赖 -------
echo [1/4] 检查 Python 依赖...
"%PYTHON_EXE%" -m pip show fastapi >nul 2>&1
if %errorlevel% neq 0 (
    echo [提示] 正在安装 Python 依赖...
    "%PYTHON_EXE%" -m pip install -r requirements.txt -q
)

:: ------- 检查 npm 依赖 -------
echo [2/4] 检查 Node.js 依赖...
if not exist "node_modules" (
    echo [提示] 正在安装 Node.js 依赖...
    call npm install
)

:: ------- 启动后端 FastAPI -------
echo [3/4] 启动后端 FastAPI (http://localhost:8000) ...
start "【后端】FastAPI :8000" cmd /k "set HTTP_PROXY=http://127.0.0.1:7897 ^&^& set HTTPS_PROXY=http://127.0.0.1:7897 ^&^& cd /d "%ROOT_DIR%\backend" ^&^& "%PYTHON_EXE%" main.py"

:: 等待后端启动
timeout /t 4 /nobreak >nul

:: ------- 启动前端 Express 网关 -------
echo [4/4] 启动前端网关 (http://localhost:3000) ...
start "【前端】Node网关 :3000" cmd /k "set HTTP_PROXY=http://127.0.0.1:7897 ^&^& set HTTPS_PROXY=http://127.0.0.1:7897 ^&^& cd /d "%ROOT_DIR%" ^&^& npm run dev"

echo.
echo =============================================
echo   服务已启动！
echo   前端界面:  http://localhost:3000
echo   后端API:   http://localhost:8000
echo   API文档:   http://localhost:8000/docs
echo =============================================
echo.
echo 提示: 关闭此窗口不会停止服务，请关闭上面两个命令行窗口来停止
echo.
pause
