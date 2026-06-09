@echo off
chcp 65001 >nul
title A股AI选股系统 — 数据库初始化

echo.
echo =============================================
echo   数据库初始化向导
echo =============================================
echo.

:: ------- 0. 读取 .env 中的数据库配置 -------
for /f "usebackq tokens=1,2 delims==" %%a in (`findstr /C:"DATABASE_URL" "%~dp0.env" 2^>nul`) do (
    if "%%a"=="DATABASE_URL" set DATABASE_URL=%%b
)

if not defined DATABASE_URL (
    set DATABASE_URL=postgresql://postgres:postgres@localhost:5432/a_stock
)

echo 当前数据库: %DATABASE_URL%
echo.

:: ------- 1. 创建数据库 -------
echo [步骤1] 创建数据库 a_stock（如已存在则跳过）...
for /f "tokens=2 delims=/" %%h in ("%DATABASE_URL%") do set DB_HOST_PORT=%%h
for /f "tokens=1 delims=@" %%a in ("%DB_HOST_PORT%") do set DB_CREDS=%%a
for /f "tokens=2 delims=@" %%a in ("%DB_HOST_PORT%") do set DB_HOST_STR=%%a

:: 解析主机端口
for /f "tokens=1 delims=:" %%a in ("%DB_HOST_STR%") do set DB_HOST=%%a
for /f "tokens=2 delims=:" %%a in ("%DB_HOST_STR%") do set DB_PORT=%%a

:: 解析用户名密码
for /f "tokens=1 delims=:" %%a in ("%DB_CREDS%") do set DB_USER=%%a
for /f "tokens=2 delims=:" %%a in ("%DB_CREDS%") do set DB_PASS=%%a

echo   主机: %DB_HOST%:%DB_PORT%
echo   用户: %DB_USER%
echo.

:: 创建数据库
set PGPASSWORD=%DB_PASS%
psql -h %DB_HOST% -p %DB_PORT% -U %DB_USER% -c "CREATE DATABASE a_stock;" >nul 2>&1
if %errorlevel% equ 0 (
    echo   [OK] 数据库 a_stock 已创建（或已存在）
) else (
    echo   [跳过] 数据库可能已存在，继续...
)

:: ------- 2. 执行 init.sql -------
echo.
echo [步骤2] 执行 init.sql 建表脚本...
set PGPASSWORD=%DB_PASS%
psql -h %DB_HOST% -p %DB_PORT% -U %DB_USER% -d a_stock -f "%~dp0backend\init.sql" >nul 2>&1
if %errorlevel% equ 0 (
    echo   [OK] 所有表已创建（stock_basic, stock_daily_k, stock_indicator, stock_score, ai_analysis）
) else (
    echo   [错误] 建表失败，请检查 PostgreSQL 连接配置
    echo   提示: 确保 psql 命令可用，或手动运行: psql -h localhost -U postgres -d a_stock -f backend\init.sql
)

:: ------- 3. 用 Python 建表（SQLAlchemy） -------
echo.
echo [步骤3] 使用 SQLAlchemy 同步建表（确保与 models.py 一致）...
python -c "import sys; sys.path.insert(0, '.'); from backend.database import init_db; init_db(); print('[OK] SQLAlchemy 建表完成')" 2>nul
if %errorlevel% neq 0 (
    echo   [警告] SQLAlchemy 建表失败，尝试检查 backend/main.py 启动时的自动建表...
)

echo.
echo =============================================
echo   数据库初始化完成！
echo   下一步: 运行数据初始化脚本
echo   python backend\scripts\init_data.py --full --start 20250101
echo =============================================
echo.
pause
