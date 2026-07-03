#!/usr/bin/env pwsh
# Claude Code 프록시 서버 (Docker) — Windows 11
#   1) %USERPROFILE%\.claude\.credentials.json 를 docker\secrets 로 복사
#      (macOS 의 Keychain 추출을 대체 — Windows 는 자격증명이 파일로 저장됨)
#   2) 이미지 빌드
#   3) 컨테이너 실행 (자격증명 마운트, 백그라운드 + 자동 재시작)
# 실행법:
#   powershell -ExecutionPolicy Bypass -File .\docker\run.ps1

$ErrorActionPreference = 'Stop'
$Host.UI.RawUI.WindowTitle = 'Claude Code Proxy (Docker)'

# 프로젝트 루트로 이동 (docker/ 의 상위)
Set-Location (Split-Path -Parent $PSScriptRoot)

$Image = 'claude-proxy'
$Container = 'claude-proxy'
$Port = 3456
$SecretDir = 'docker\secrets'
$CredFile = Join-Path $SecretDir 'credentials.json'

Write-Host '========================================'
Write-Host '  Claude Code 프록시 서버 (Docker)'
Write-Host '========================================'

# 0) Docker 설치 및 데몬 구동 확인
try {
    docker info *> $null
} catch {
    Write-Host 'ERROR: docker 명령을 찾을 수 없습니다. Docker Desktop 을 설치하세요.' -ForegroundColor Red
    Read-Host '종료하려면 Enter'
    exit 1
}
if ($LASTEXITCODE -ne 0) {
    Write-Host 'ERROR: Docker Desktop 이 실행 중이 아닙니다. 먼저 Docker Desktop 을 실행하세요.' -ForegroundColor Red
    Read-Host '종료하려면 Enter'
    exit 1
}

# 1) 호스트 자격증명 파일 복사
Write-Host '[1/3] claude 로그인 자격증명 확보...'
$base = if ($env:CLAUDE_CONFIG_DIR) { $env:CLAUDE_CONFIG_DIR } else { Join-Path $env:USERPROFILE '.claude' }
$src = Join-Path $base '.credentials.json'
if (-not (Test-Path $src)) {
    Write-Host "ERROR: 자격증명 파일이 없습니다: $src" -ForegroundColor Red
    Write-Host '       호스트에서 claude 로그인이 되어 있는지 확인하세요.' -ForegroundColor Red
    Read-Host '종료하려면 Enter'
    exit 1
}
New-Item -ItemType Directory -Force -Path $SecretDir | Out-Null
Copy-Item -Path $src -Destination $CredFile -Force
Write-Host "      -> $CredFile 저장 완료"

# 2) 이미지 빌드
Write-Host '[2/3] 이미지 빌드... (최초 1회만 오래 걸립니다)'
docker build -f docker/Dockerfile -t $Image .
if ($LASTEXITCODE -ne 0) {
    Write-Host 'ERROR: 이미지 빌드 실패' -ForegroundColor Red
    Read-Host '종료하려면 Enter'
    exit 1
}

# 3) 컨테이너 실행 (기존 정리 후 백그라운드 실행)
Write-Host '[3/3] 컨테이너 실행...'
docker rm -f $Container *> $null

# credentials 절대경로. Windows 절대경로(C:\...)의 드라이브 콜론과 -v 구분자 콜론이
# 겹치지만 Docker Desktop 이 드라이브 문자를 인식한다. 마운트 실패 시 windows-setup.md 의
# 대안(포워드 슬래시) 참고.
$credAbs = (Resolve-Path $CredFile).Path
docker run -d `
    --name $Container `
    --restart unless-stopped `
    -p "${Port}:3456" `
    -v "${credAbs}:/root/.claude/.credentials.json" `
    $Image | Out-Null
if ($LASTEXITCODE -ne 0) {
    Write-Host 'ERROR: 컨테이너 실행 실패' -ForegroundColor Red
    Read-Host '종료하려면 Enter'
    exit 1
}

Write-Host '      -> 컨테이너 기동 중...'
$ok = $false
for ($i = 0; $i -lt 15; $i++) {
    try {
        Invoke-WebRequest -UseBasicParsing "http://localhost:$Port/health" -TimeoutSec 2 *> $null
        $ok = $true
        break
    } catch {
        Start-Sleep -Seconds 2
    }
}

Write-Host ''
Write-Host '========================================'
if ($ok) {
    Write-Host "  [OK] 프록시 서버 실행 중: http://localhost:$Port"
    Write-Host '     (백그라운드 동작 — 이 창을 닫아도 유지됩니다)'
    Write-Host '     재부팅 시 Docker Desktop 과 함께 자동으로 다시 뜹니다.'
} else {
    Write-Host '  [!] 기동 확인 실패. 로그를 확인하세요:' -ForegroundColor Yellow
    Write-Host "     docker logs $Container"
}
Write-Host '----------------------------------------'
Write-Host "  중지:   docker stop $Container"
Write-Host "  로그:   docker logs -f $Container"
Write-Host '========================================'
Write-Host ''
Write-Host '실시간 로그를 봅니다. (Ctrl+C 로 로그 보기만 종료 — 서버는 계속 실행)'
Write-Host ''
docker logs -f $Container
