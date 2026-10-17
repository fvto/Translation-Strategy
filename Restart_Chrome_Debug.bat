@echo off
setlocal
cd /d "%~dp0"
title Khoi dong lai Chrome voi Remote Debugging
echo ===================================================================
echo   KHOI DONG LAI CHROME VOI REMOTE DEBUGGING CHO ANTIGRAVITY
echo ===================================================================
echo.
echo [1] Dang dong cac tien trinh Chrome debug cu (khong tat Chrome ca nhan)...
powershell -NoProfile -Command "Get-CimInstance Win32_Process -Filter \"name = 'chrome.exe'\" | Where-Object { $_.CommandLine -like '*chrome-dev-profile*' } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }"
powershell -NoProfile -Command "Get-NetTCPConnection -LocalPort 9222 -ErrorAction SilentlyContinue | ForEach-Object { Stop-Process -Id $_.OwningProcess -Force -ErrorAction SilentlyContinue }"
ping 127.0.0.1 -n 2 >nul

echo [2] Dang mo lai Chrome debug...
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0launch_chrome.ps1"

echo.
echo ===================================================================
echo   Hoan tat! Chrome debug da san sang tai cong 9222.
echo   Ban co the quay lai Antigravity va go: /browser
echo ===================================================================
echo.
pause