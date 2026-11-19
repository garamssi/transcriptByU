#!/bin/bash
#
# Claude Code 프록시용 장기 토큰(1년) 발급 — macOS  (Windows 는 setup-token.bat)
#   1) claude setup-token 실행 (브라우저에서 로그인·승인 → 터미널에 토큰 표시)
#   2) 표시된 토큰을 붙여넣으면 docker/secrets/claude.env 에 저장 (git 에 올라가지 않는 폴더)
#   3) run.command 로 프록시 컨테이너를 다시 띄워 토큰을 적용
#
# 사용법: 더블클릭 하거나  bash docker/setup-token.command
# 토큰은 1년 뒤 만료됩니다. 만료되면 이 스크립트를 다시 실행하세요.
# (Keychain 로그인 토큰은 몇 시간마다 만료돼 refresh-creds.command 가 필요하지만, 장기 토큰은 그렇지 않습니다.)
#
set -uo pipefail

echo -ne "\033]0;Claude Code Proxy - 장기 토큰 발급\007"

# 프로젝트 루트로 이동 (docker/ 의 상위)
cd "$(dirname "$0")/.." || { echo "ERROR: 프로젝트 루트로 이동 실패"; exit 1; }

# nvm 로드 (Finder 더블클릭 시 PATH 에 claude 가 없는 문제 방지)
export NVM_DIR="$HOME/.nvm"
[ -s "$NVM_DIR/nvm.sh" ] && \. "$NVM_DIR/nvm.sh"

SECRET_DIR="docker/secrets"
ENV_FILE="$SECRET_DIR/claude.env"

echo "========================================"
echo "  Claude Code 장기 토큰 발급 (1년 유효)"
echo "========================================"

if ! command -v claude >/dev/null 2>&1; then
  echo "ERROR: claude CLI 를 찾을 수 없습니다. 설치 후 다시 실행하세요:" >&2
  echo "       npm install -g @anthropic-ai/claude-code" >&2
  exit 1
fi

echo ""
echo "[1/3] 브라우저가 열리면 Claude 계정으로 로그인하고 승인하세요."
echo "      (Pro / Max / Team / Enterprise 구독이 필요합니다)"
echo ""
if ! claude setup-token; then
  echo "ERROR: 토큰 발급이 완료되지 않았습니다." >&2
  exit 1
fi

echo ""
echo "[2/3] 위에 표시된 토큰(sk-ant-oat 로 시작)을 복사해 붙여넣고 Enter 를 누르세요."
read -r -s -p "      토큰 (입력 내용은 화면에 표시되지 않습니다): " TOKEN
echo ""
TOKEN="$(printf '%s' "$TOKEN" | tr -d '[:space:]')"
if [ -z "$TOKEN" ]; then
  echo "ERROR: 토큰이 비어 있습니다." >&2
  exit 1
fi
case "$TOKEN" in
  sk-ant-*) ;;
  *) echo "      [!] sk-ant- 로 시작하지 않습니다. 복사가 맞는지 확인하세요. (그대로 저장합니다)" ;;
esac

mkdir -p "$SECRET_DIR"
# 처음부터 본인만 읽을 수 있는 권한으로 만든다.
(umask 077 && printf 'CLAUDE_CODE_OAUTH_TOKEN=%s\n' "$TOKEN" > "$ENV_FILE")
chmod 600 "$ENV_FILE"
unset TOKEN
echo "      -> $ENV_FILE 저장 완료"

echo ""
echo "[3/3] 프록시 컨테이너를 장기 토큰으로 다시 띄웁니다..."
exec bash docker/run.command
