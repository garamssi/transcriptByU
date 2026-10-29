#!/bin/sh
set -e

CRED="$HOME/.claude/.credentials.json"

# 인증: 장기 토큰(CLAUDE_CODE_OAUTH_TOKEN, `claude setup-token` 으로 발급)이 있으면 그것을 쓴다.
# 없으면 마운트된 로그인 자격증명 파일이 있어야 한다.
if [ -n "$CLAUDE_CODE_OAUTH_TOKEN" ]; then
  echo "(container) auth: long-lived token (CLAUDE_CODE_OAUTH_TOKEN)"
elif [ ! -f "$CRED" ]; then
  echo "ERROR: 인증 파일이 없습니다: $CRED" >&2
  echo "       docker/setup-token.bat(Windows) 로 장기 토큰을 발급하거나," >&2
  echo "       docker/run.command(macOS) 로 호스트 로그인을 마운트하세요." >&2
  exit 1
fi

# claude CLI 최초 실행 시 온보딩 프롬프트를 건너뛰기 위한 최소 설정
if [ ! -f "$HOME/.claude.json" ]; then
  echo '{"hasCompletedOnboarding":true}' > "$HOME/.claude.json"
fi

# 컨테이너 안 claude 버전 확인 (실패해도 서버는 뜨도록)
claude --version 2>/dev/null && echo "(container) claude CLI ready" || \
  echo "WARNING: 컨테이너 안 claude CLI 확인 실패" >&2

exec "$@"
