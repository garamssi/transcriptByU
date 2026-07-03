@echo off
chcp 65001 >nul
REM ============================================================
REM  Claude Code 프록시 서버 (직접 실행) - Windows 11
REM  start-proxy.ps1 을 PowerShell 로 실행합니다.
REM  Docker 없이 node 로 프록시를 직접 띄웁니다.
REM  (.ps1 은 더블클릭으로 실행되지 않으므로 이 .bat 으로 감쌉니다.)
REM ============================================================
title Claude Code Proxy Server

REM "%~dp0" = 이 .bat 이 있는 폴더(docs\). 같은 폴더의 start-proxy.ps1 을 실행한다.
REM start-proxy.ps1 내부에서 프로젝트 루트로 이동하므로 현재 작업 폴더는 상관없다.
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0start-proxy.ps1"

REM start-proxy.ps1 이 정상 실행되면 자체적으로 창을 유지한다(서버 포그라운드 / Read-Host).
REM 여기로 흐름이 돌아왔다면 PowerShell 이 이미 종료된 것이므로, 마지막으로 창을 붙잡아
REM PowerShell 실행 자체가 실패한 경우(스크립트 못 찾음 등)의 오류를 볼 수 있게 한다.
echo.
pause
