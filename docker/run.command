#!/bin/bash
#
# Claude Code 프록시 서버를 Docker 로 실행합니다.
#   1) 맥 Keychain 에서 claude 로그인(OAuth) 토큰을 꺼내 credentials 파일로 저장
#   2) 이미지 빌드
#   3) 컨테이너 실행 (credentials 파일을 마운트해 "내 로컬 로그인" 을 그대로 사용)
#
set -e

echo -ne "\033]0;Claude Code Proxy (Docker)\007"

# 프로젝트 루트로 이동 (docker/ 의 상위)
cd "$(dirname "$0")/.." || exit 1

IMAGE="claude-proxy"
CONTAINER="claude-proxy"
PORT=3456
SECRET_DIR="docker/secrets"
CRED_FILE="$SECRET_DIR/credentials.json"

echo "========================================"
echo "  Claude Code 프록시 서버 (Docker)"
echo "========================================"

# 1) Keychain 에서 OAuth 토큰 추출
echo "[1/3] Keychain 에서 claude 로그인 토큰 추출..."
mkdir -p "$SECRET_DIR"
if ! security find-generic-password -s "Claude Code-credentials" -w > "$CRED_FILE" 2>/dev/null; then
  echo "ERROR: Keychain 에서 'Claude Code-credentials' 를 찾지 못했습니다." >&2
  echo "       호스트에서 'claude' 로그인이 되어 있는지 확인하세요." >&2
  exit 1
fi
chmod 600 "$CRED_FILE"
echo "      -> $CRED_FILE 저장 완료"

# 2) 이미지 빌드
echo "[2/3] 이미지 빌드... (최초 1회만 오래 걸립니다)"
docker build -f docker/Dockerfile -t "$IMAGE" .

# 3) 컨테이너 실행 (백그라운드 + 자동 재시작)
echo "[3/3] 컨테이너 실행..."
# 기존 컨테이너 정리
docker rm -f "$CONTAINER" >/dev/null 2>&1 || true

# --restart unless-stopped : 재부팅/데몬 재시작 시 컨테이너 자동 복구.
#   (Docker Desktop 이 로그인 시 자동 시작되도록 함께 설정해야 완성됨)
# -d : 백그라운드 실행 → 이 창을 닫아도 서버는 계속 동작.
# credentials 는 읽기/쓰기 마운트해 토큰 자동 갱신이 호스트에도 반영되도록 함.
docker run -d \
  --name "$CONTAINER" \
  --restart unless-stopped \
  -p "$PORT:3456" \
  -v "$(pwd)/$CRED_FILE:/root/.claude/.credentials.json" \
  "$IMAGE" >/dev/null

echo "      -> 컨테이너 기동 중..."
for i in $(seq 1 15); do
  if curl -s http://localhost:$PORT/health >/dev/null 2>&1; then break; fi
  sleep 2
done

echo ""
echo "========================================"
if curl -s http://localhost:$PORT/health >/dev/null 2>&1; then
  echo "  ✅ 프록시 서버 실행 중: http://localhost:$PORT"
  echo "     (백그라운드 동작 — 이 창을 닫아도 유지됩니다)"
  echo "     재부팅 시 Docker Desktop 과 함께 자동으로 다시 뜹니다."
else
  echo "  ⚠️  기동 확인 실패. 로그를 확인하세요:"
  echo "     docker logs $CONTAINER"
fi
echo "----------------------------------------"
echo "  중지:   docker stop $CONTAINER"
echo "  로그:   docker logs -f $CONTAINER"
echo "========================================"
echo ""
echo "실시간 로그를 봅니다. (Ctrl+C 로 로그 보기만 종료 — 서버는 계속 실행)"
echo ""
docker logs -f "$CONTAINER"
