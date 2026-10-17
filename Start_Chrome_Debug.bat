@echo off
setlocal
cd /d "%~dp0"
title Khoi dong Chrome Remote Debugging cho Antigravity
echo ===================================================================
echo   KHOI DONG CHROME VOI CONG REMOTE DEBUGGING CHO ANTIGRAVITY
echo ===================================================================
echo.

powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0launch_chrome.ps1"

echo.
echo ===================================================================
echo   Chrome da san sang cho Antigravity Browser Tool!
echo   Ban co the quay lai khung chat Antigravity va go: /browser
echo ===================================================================
echo.
pause