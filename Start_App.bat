@echo off
setlocal
cd /d "%~dp0"
title Khoi dong He thong Dich thuat (Next.js + Chrome)

echo ===================================================================
echo   KHOI DONG HE THONG DICH THUAT (TRANSLATION WORKSPACE & SMART AUDIT)
echo ===================================================================
echo.

powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0launch_chrome.ps1"

echo.
echo ===================================================================
echo   Chuc mung! Ung dung da duoc ket noi thanh cong len Chrome.
echo   - Web URL:    http://localhost:3000
echo   - Antigravity: Da san sang cho lenh /browser
echo ===================================================================
echo.
pause

