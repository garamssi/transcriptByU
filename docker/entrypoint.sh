#!/bin/sh
set -e

CRED="$HOME/.claude/.credentials.json"

# 인증 파일이 없으면 명확히 안내하고 종료
if [ ! -f "$CRED" ]; then
  echo "ERROR: 인증 파일이 없습니다: $CRED" >&2
  echo "       docker/run.command 를 실행하면 호스트 Keychain 에서 토큰을 추출해 마운트합니다." >&2
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
