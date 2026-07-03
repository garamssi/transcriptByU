#!/usr/bin/env pwsh
# Claude Code 프록시 서버 (직접 실행) — Windows 11
# 실행법:
#   powershell -ExecutionPolicy Bypass -File .\docs\start-proxy.ps1
#   또는 파일 우클릭 > "PowerShell에서 실행"

$ErrorActionPreference = 'Stop'

# 창 제목
$Host.UI.RawUI.WindowTitle = 'Claude Code Proxy Server'

# 스크립트 위치 기준 프로젝트 루트로 이동 (docs/ 의 상위)
Set-Location (Split-Path -Parent $PSScriptRoot)

# node 존재 확인 (PowerShell 은 PATH 를 상속하므로 nvm 로딩 불필요)
if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
    Write-Host 'ERROR: node 를 찾을 수 없습니다. Node.js 를 설치하고 PATH 에 추가하세요.' -ForegroundColor Red
    Read-Host '종료하려면 Enter 키를 누르세요'
    exit 1
}

# 기존 프록시 서버(포트 3456) 종료
$listeners = Get-NetTCPConnection -LocalPort 3456 -State Listen -ErrorAction SilentlyContinue
if ($listeners) {
    Write-Host '기존 프록시 서버 종료 중...'
    $listeners | Select-Object -ExpandProperty OwningProcess -Unique | ForEach-Object {
        Stop-Process -Id $_ -Force -ErrorAction SilentlyContinue
    }
    Start-Sleep -Seconds 1
}

Write-Host '========================================'
Write-Host '  Claude Code 프록시 서버'
Write-Host '  종료하려면 Ctrl+C 또는 창 닫기'
Write-Host '========================================'
Write-Host ''

# 서버 실행 (포그라운드)
node proxy-server\server.js

# 서버가 종료되어도 창 유지
Write-Host ''
Write-Host '========================================'
Write-Host '  서버가 종료되었습니다.'
Write-Host '========================================'
Read-Host '종료하려면 Enter 키를 누르세요'
