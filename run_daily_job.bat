@echo off
chcp 65001 >nul
:: =============================================
:: A股AI选股系统 — 每日增量更新调度脚本
:: 用途: Windows 任务计划程序，每天 16:00 自动执行
:: =============================================
:: 在「任务计划程序」中创建任务:
::   操作: 启动程序
::   程序: cmd
::   参数: /c "C:\完整路径\run_daily_job.bat"
::   触发器: 每天 16:00
:: =============================================

chcp 65001 >nul
setlocal enabledelayedexpansion

set "ROOT_DIR=%~dp0"
cd /d "%ROOT_DIR%"

set "LOG_DIR=%ROOT_DIR%logs"
if not exist "%LOG_DIR%" mkdir "%LOG_DIR%"

set "LOG_FILE=%LOG_DIR%\daily_job_%date:~0,4%%date:~5,2%%date:~8,2%.log"
set "FAILED_LOG=%ROOT_DIR%backend\failed_stocks.log"

echo [%date% %time%] ===== 每日增量更新开始 ===== >> "%LOG_FILE%" 2>&1

:: 方式A: 增量更新（每日收盘后推荐）
python backend\scheduler\daily_job.py --inc >> "%LOG_FILE%" 2>&1

set "EXIT_CODE=%errorlevel%"

if %EXIT_CODE% neq 0 (
    echo [%date% %time%] [错误] 增量更新失败，exit code=%EXIT_CODE% >> "%LOG_FILE%" 2>&1
) else (
    echo [%date% %time%] ===== 增量更新完成 ===== >> "%LOG_FILE%" 2>&1
)

:: 如果增量失败超过3次，尝试全量更新
set "FAIL_COUNT_FILE=%LOG_DIR%\fail_count.txt"
if %EXIT_CODE% neq 0 (
    if exist "%FAIL_COUNT_FILE%" (
        set /p FAIL_COUNT=<"%FAIL_COUNT_FILE%"
    ) else (
        set "FAIL_COUNT=0"
    )
    set /a FAIL_COUNT+=1
    echo %FAIL_COUNT% > "%FAIL_COUNT_FILE%"
    if !FAIL_COUNT! geq 3 (
        echo [%date% %time%] [警告] 连续失败3次，执行全量更新 >> "%LOG_FILE%" 2>&1
        python backend\scheduler\daily_job.py --full >> "%LOG_FILE%" 2>&1
        echo 0 > "%FAIL_COUNT_FILE%"
    )
) else (
    echo 0 > "%FAIL_COUNT_FILE%"
)

endlocal
