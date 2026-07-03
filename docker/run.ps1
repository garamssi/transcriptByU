#!/usr/bin/env pwsh
# Claude Code 프록시 서버 (Docker) — Windows 11
#   1) %USERPROFILE%\.claude\.credentials.json 를 docker\secrets 로 복사
#      (macOS 의 Keychain 추출을 대체 — Windows 는 자격증명이 파일로 저장됨)
#   2) 이미지 빌드
#   3) 컨테이너 실행 (자격증명 마운트, 백그라운드 + 자동 재시작)
# 실행법:
#   powershell -ExecutionPolicy Bypass -File .\docker\run.ps1

$ErrorActionPreference = 'Stop'

# PowerShell 7.3+ 에서 네이티브 명령(docker)의 비정상 종료코드가 예외로 승격되지 않도록
# 한다. 아래의 $LASTEXITCODE 기반 오류 처리가 의도대로 동작하게 함. WinPS 5.1 에선 무시됨.
$PSNativeCommandUseErrorActionPreference = $false

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
#    주의: WinPS 5.1 에서는 native 명령의 stderr 가 EAP='Stop' 과 만나 "종료성 오류"로
#    승격된다. docker info 는 정상일 때도 경고를 stderr 로 내보내므로, 예전처럼
#    `docker info *> $null` 을 try/catch 로 감싸면 docker 가 멀쩡해도 catch 로 빠져
#    "명령을 찾을 수 없습니다" 가 잘못 출력됐다. 존재 확인은 Get-Command 으로, 데몬 확인은
#    EAP 를 잠시 낮춰 종료코드만 본다. (WinPS 5.1 / PowerShell 7 모두 안전)
if (-not (Get-Command docker -ErrorAction SilentlyContinue)) {
    Write-Host 'ERROR: docker 명령을 찾을 수 없습니다. Docker Desktop 을 설치하세요.' -ForegroundColor Red
    Read-Host '종료하려면 Enter'
    exit 1
}
$prevEAP = $ErrorActionPreference
$ErrorActionPreference = 'Continue'
docker info 2>&1 | Out-Null
$dockerDaemonOk = ($LASTEXITCODE -eq 0)
$ErrorActionPreference = $prevEAP
if (-not $dockerDaemonOk) {
    Write-Host 'ERROR: Docker Desktop 이 실행 중이 아닙니다. 먼저 Docker Desktop 을 실행하세요.' -ForegroundColor Red
    Read-Host '종료하려면 Enter'
    exit 1
}

# 1) 호스트 자격증명 파일 자동 탐색 + 복사
Write-Host '[1/3] claude 로그인 자격증명 확보...'

# claude CLI 설치 여부(진단용). Docker 방식은 컨테이너 안 claude 를 쓰므로 호스트 claude 가
# 없어도 "자격증명 파일"만 있으면 되지만, 파일이 없을 때 안내를 정확히 하기 위해 확인한다.
$claudeInstalled = [bool](Get-Command claude -ErrorAction SilentlyContinue)
if ($claudeInstalled) {
    Write-Host '      -> claude CLI 감지됨'
} else {
    Write-Host '      -> (참고) 호스트에 claude CLI 가 없습니다. Docker 방식은 자격증명 파일만 있으면 됩니다.' -ForegroundColor DarkGray
}

# 자격증명 후보 경로(우선순위): CLAUDE_CONFIG_DIR > %USERPROFILE%\.claude > $HOME\.claude
$credCandidates = @()
if ($env:CLAUDE_CONFIG_DIR) { $credCandidates += (Join-Path $env:CLAUDE_CONFIG_DIR '.credentials.json') }
if ($env:USERPROFILE)       { $credCandidates += (Join-Path $env:USERPROFILE '.claude\.credentials.json') }
if ($HOME)                  { $credCandidates += (Join-Path $HOME '.claude\.credentials.json') }
$credCandidates = $credCandidates | Select-Object -Unique

$src = $credCandidates | Where-Object { Test-Path $_ } | Select-Object -First 1

# 파일을 못 찾았을 때: 이미 만들어 둔 사본(docker\secrets)이 아직 유효하면 그대로 재사용한다.
# (이 PC 의 Claude Code 는 토큰을 파일이 아니라 Windows 자격증명 관리자에 저장했을 수 있음)
$reuseExisting = $false
if (-not $src -and (Test-Path $CredFile)) {
    try {
        $o = (Get-Content $CredFile -Raw | ConvertFrom-Json).claudeAiOauth
        if ($o -and $o.expiresAt) {
            $expE = [DateTimeOffset]::FromUnixTimeMilliseconds([int64]$o.expiresAt).ToLocalTime()
            if ($expE -gt (Get-Date)) {
                Write-Host "      -> 소스 파일은 없지만 기존 사본이 유효합니다 (만료 $($expE.ToString('u'))). 이를 재사용합니다." -ForegroundColor Yellow
                $reuseExisting = $true
            } else {
                Write-Host "      [!] 기존 사본이 만료됨 ($($expE.ToString('u'))). 새 자격증명이 필요합니다." -ForegroundColor Yellow
            }
        }
    } catch { }
}

if (-not $src -and -not $reuseExisting) {
    Write-Host 'ERROR: claude 로그인 자격증명(.credentials.json)을 찾지 못했습니다.' -ForegroundColor Red
    Write-Host '       확인한 파일 위치:' -ForegroundColor Red
    $credCandidates | ForEach-Object { Write-Host "         - $_" -ForegroundColor Red }
    Write-Host ''
    Write-Host '       [원인] 이 PC 의 Claude Code 는 토큰을 파일이 아니라 Windows 자격증명 관리자' -ForegroundColor Yellow
    Write-Host '       (Credential Manager)에 저장했을 수 있습니다. 아래로 엔트리를 확인하세요:' -ForegroundColor Yellow
    Write-Host '         cmdkey /list | findstr /I "Claude Anthropic"' -ForegroundColor Yellow
    if (-not $claudeInstalled) {
        Write-Host '       claude CLI 설치 후 로그인: npm install -g @anthropic-ai/claude-code' -ForegroundColor Yellow
    }
    Read-Host '종료하려면 Enter'
    exit 1
}

if (-not $reuseExisting) {
    Write-Host "      -> 자격증명 발견: $src"

    # 토큰 만료 여부 확인(경고만 — 만료돼도 계속 진행). 파싱 실패해도 무시.
    try {
        $oauth = (Get-Content $src -Raw | ConvertFrom-Json).claudeAiOauth
        if ($oauth -and $oauth.expiresAt) {
            $exp = [DateTimeOffset]::FromUnixTimeMilliseconds([int64]$oauth.expiresAt).ToLocalTime()
            if ($exp -lt (Get-Date)) {
                Write-Host "      [!] 경고: 토큰이 만료됨 ($($exp.ToString('u'))). 호스트에서 재로그인 후 다시 실행을 권장합니다." -ForegroundColor Yellow
            } else {
                Write-Host "      -> 토큰 만료 예정: $($exp.ToString('u'))"
            }
        }
    } catch { }

    New-Item -ItemType Directory -Force -Path $SecretDir | Out-Null
    Copy-Item -Path $src -Destination $CredFile -Force
    Write-Host "      -> $CredFile 저장 완료"
}

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
# 기존 컨테이너 제거. 컨테이너가 없으면 docker 가 stderr 로 경고를 내는데, WinPS 5.1 에서
# EAP='Stop' 과 만나면 종료성 오류가 되어 스크립트가 죽는다. EAP 를 잠시 낮춰 조용히 처리.
$prevEAP = $ErrorActionPreference
$ErrorActionPreference = 'Continue'
docker rm -f $Container 2>&1 | Out-Null
$ErrorActionPreference = $prevEAP

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
