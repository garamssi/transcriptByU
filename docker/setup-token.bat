@echo off
chcp 65001 >nul
REM ============================================================
REM  Claude Code 프록시용 장기 토큰(1년) 발급 런처 - Windows 11
REM  setup-token.ps1 을 PowerShell 로 실행합니다. (토큰 발급 -> 저장 -> 프록시 재시작)
REM ============================================================
title Claude Code Proxy - Long-lived token

powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0setup-token.ps1"

echo.
pause
