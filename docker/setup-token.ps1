#!/usr/bin/env pwsh
# Claude Code 프록시용 장기 토큰(1년) 발급 — Windows 11
#   1) claude setup-token 실행 (브라우저에서 로그인·승인 → 터미널에 토큰 표시)
#   2) 표시된 토큰을 붙여넣으면 docker\secrets\claude.env 에 저장 (git 에 올라가지 않는 폴더)
#   3) run.ps1 로 프록시 컨테이너를 다시 띄워 토큰을 적용
# 실행법: docker\setup-token.bat 더블클릭
#        또는 powershell -ExecutionPolicy Bypass -File .\docker\setup-token.ps1
# 토큰은 1년 뒤 만료됩니다. 만료되면 이 스크립트를 다시 실행하세요.

$ErrorActionPreference = 'Stop'
$PSNativeCommandUseErrorActionPreference = $false
$Host.UI.RawUI.WindowTitle = 'Claude Code Proxy - 장기 토큰 발급'

# 프로젝트 루트로 이동 (docker/ 의 상위)
Set-Location (Split-Path -Parent $PSScriptRoot)

$SecretDir = 'docker\secrets'
$EnvFile = Join-Path $SecretDir 'claude.env'

Write-Host '========================================'
Write-Host '  Claude Code 장기 토큰 발급 (1년 유효)'
Write-Host '========================================'

if (-not (Get-Command claude -ErrorAction SilentlyContinue)) {
    Write-Host 'ERROR: claude CLI 를 찾을 수 없습니다. 설치 후 다시 실행하세요:' -ForegroundColor Red
    Write-Host '       npm install -g @anthropic-ai/claude-code' -ForegroundColor Red
    Read-Host '종료하려면 Enter'
    exit 1
}

Write-Host ''
Write-Host '[1/3] 브라우저가 열리면 Claude 계정으로 로그인하고 승인하세요.'
Write-Host '      (Pro / Max / Team / Enterprise 구독이 필요합니다)'
Write-Host ''
claude setup-token
if ($LASTEXITCODE -ne 0) {
    Write-Host 'ERROR: 토큰 발급이 완료되지 않았습니다.' -ForegroundColor Red
    Read-Host '종료하려면 Enter'
    exit 1
}

Write-Host ''
Write-Host '[2/3] 위에 표시된 토큰(sk-ant-oat 로 시작)을 복사해 붙여넣고 Enter 를 누르세요.'
$secure = Read-Host '      토큰 (입력 내용은 화면에 표시되지 않습니다)' -AsSecureString
$bstr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secure)
try {
    $token = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($bstr).Trim()
} finally {
    [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($bstr)
}
if (-not $token) {
    Write-Host 'ERROR: 토큰이 비어 있습니다.' -ForegroundColor Red
    Read-Host '종료하려면 Enter'
    exit 1
}
if ($token -notmatch '^sk-ant-') {
    Write-Host '      [!] sk-ant- 로 시작하지 않습니다. 복사가 맞는지 확인하세요. (그대로 저장합니다)' -ForegroundColor Yellow
}

New-Item -ItemType Directory -Force -Path $SecretDir | Out-Null
$envAbs = Join-Path (Get-Location) $EnvFile
# docker --env-file 은 BOM 을 값의 일부로 읽으므로 BOM 없는 UTF-8 로 쓴다.
[IO.File]::WriteAllText($envAbs, "CLAUDE_CODE_OAUTH_TOKEN=$token`n", (New-Object System.Text.UTF8Encoding($false)))
$token = $null
# 현재 사용자만 읽고 쓸 수 있게 권한을 좁힌다.
icacls $envAbs /inheritance:r /grant:r "$($env:USERNAME):(R,W)" | Out-Null
Write-Host "      -> $EnvFile 저장 완료"

Write-Host ''
Write-Host '[3/3] 프록시 컨테이너를 장기 토큰으로 다시 띄웁니다...'
& (Join-Path $PSScriptRoot 'run.ps1')
