#!/bin/bash
#
# claude-proxy 컨테이너의 만료된 크리덴셜을 새로 갱신합니다.
#
#   1) 호스트 claude 를 한 번 호출해 Keychain 토큰의 자동 갱신을 유도(warm-up)
#   2) Keychain 에서 최신 OAuth 토큰을 마운트 파일에 in-place 로 덮어쓰기(">" — inode 유지)
#   3) 새 토큰이 실제로 유효한지(expiresAt > 현재) 검증
#   4) 컨테이너가 새 토큰을 읽도록 restart, 실패하면 recreate 로 폴백
#   5) 컨테이너 안 claude 로 최종 동작 확인
#
# 사용법: 더블클릭 하거나  bash docker/refresh-creds.command
#
set -uo pipefail

# 프로젝트 루트로 이동 (docker/ 의 상위)
cd "$(dirname "$0")/.." || { echo "ERROR: 프로젝트 루트로 이동 실패"; exit 1; }

IMAGE="claude-proxy"
CONTAINER="claude-proxy"
PORT=3456
CRED_FILE="docker/secrets/credentials.json"
KEYCHAIN_SVC="Claude Code-credentials"

echo "========================================"
echo "  claude-proxy 크리덴셜 갱신"
echo "========================================"

# --- 0) 사전 점검 ---
command -v docker   >/dev/null 2>&1 || { echo "ERROR: docker 가 없습니다. Docker Desktop 실행 확인."; exit 1; }
command -v security >/dev/null 2>&1 || { echo "ERROR: macOS security 명령을 찾을 수 없습니다."; exit 1; }
command -v python3  >/dev/null 2>&1 || { echo "ERROR: python3 가 없습니다."; exit 1; }

# --- 1) 호스트 토큰 warm-up (자동 갱신 유도) ---
echo "[1/5] 호스트 claude warm-up (토큰 자동 갱신 유도)..."
if command -v claude >/dev/null 2>&1; then
  claude -p "ping" >/dev/null 2>&1 && echo "      -> 호스트 claude 응답 정상" \
    || echo "      -> WARNING: 호스트 claude 호출 실패(로그인 만료 가능). 계속 진행해 검증합니다."
else
  echo "      -> WARNING: 호스트에 claude CLI 없음. Keychain 값만 사용합니다."
fi

# --- 2) Keychain -> 파일 (in-place, inode 유지) ---
echo "[2/5] Keychain 토큰을 $CRED_FILE 에 덮어쓰기..."
mkdir -p "$(dirname "$CRED_FILE")"
if ! security find-generic-password -s "$KEYCHAIN_SVC" -w > "$CRED_FILE" 2>/dev/null; then
  echo "ERROR: Keychain 에서 '$KEYCHAIN_SVC' 를 찾지 못했습니다."
  echo "       호스트에서 'claude' 로그인이 되어 있는지 확인하세요."
  exit 1
fi
chmod 600 "$CRED_FILE"
echo "      -> 저장 완료"

# --- 3) 토큰 유효성 검증 ---
echo "[3/5] 토큰 유효성 검증..."
VALID=$(python3 - "$CRED_FILE" <<'PY'
import json,sys,time
try:
    d=json.load(open(sys.argv[1]))["claudeAiOauth"]
    e=d.get("expiresAt",0)
    now=int(time.time()*1000)
    if not d.get("accessToken"):
        print("NO_TOKEN"); sys.exit()
    # expiresAt 이 0/누락이면 만료로 간주. 미래면 남은 시간(시간 단위) 출력.
    print("OK %.1f" % ((e-now)/3600000) if e>now else "EXPIRED")
except Exception as ex:
    print("PARSE_ERR %s" % ex)
PY
)
case "$VALID" in
  OK*)
    HRS=$(echo "$VALID" | awk '{print $2}')
    echo "      -> 유효 (약 ${HRS}시간 남음)"
    ;;
  EXPIRED)
    echo "ERROR: 추출한 토큰이 이미 만료 상태입니다(expiresAt <= now)."
    echo "       호스트에서 claude 를 재로그인한 뒤 다시 실행하세요:"
    echo "         claude   # 로그인 프롬프트를 따라 재인증"
    exit 1
    ;;
  *)
    echo "ERROR: 토큰 검증 실패: $VALID"
    exit 1
    ;;
esac

# --- 4) 컨테이너에 반영 (restart -> 실패 시 recreate) ---
reflect_ok() {
  docker exec "$CONTAINER" claude -p "ping" >/dev/null 2>&1
}

echo "[4/5] 컨테이너 반영..."
if docker ps -a --format '{{.Names}}' | grep -qx "$CONTAINER"; then
  docker restart "$CONTAINER" >/dev/null 2>&1 || true
  sleep 2
  if reflect_ok; then
    echo "      -> restart 로 반영 완료"
  else
    echo "      -> restart 로 부족. 컨테이너 recreate..."
    docker rm -f "$CONTAINER" >/dev/null 2>&1 || true
    docker run -d \
      --name "$CONTAINER" \
      --restart unless-stopped \
      -p "$PORT:3456" \
      -v "$(pwd)/$CRED_FILE:/root/.claude/.credentials.json" \
      "$IMAGE" >/dev/null
    sleep 3
  fi
else
  echo "      -> 컨테이너가 없어 새로 실행합니다."
  docker run -d \
    --name "$CONTAINER" \
    --restart unless-stopped \
    -p "$PORT:3456" \
    -v "$(pwd)/$CRED_FILE:/root/.claude/.credentials.json" \
    "$IMAGE" >/dev/null
  sleep 3
fi

# --- 5) 최종 확인 ---
echo "[5/5] 최종 확인..."
OK=0
for i in $(seq 1 10); do
  if reflect_ok; then OK=1; break; fi
  sleep 1
done

echo ""
echo "========================================"
if [ "$OK" = "1" ]; then
  echo "  ✅ 컨테이너 claude 로그인 정상"
  curl -s "http://localhost:$PORT/health" >/dev/null 2>&1 \
    && echo "  ✅ 프록시 헬스체크 정상: http://localhost:$PORT" \
    || echo "  ⚠️  /health 응답 없음 — docker logs $CONTAINER 확인"
else
  echo "  ❌ 컨테이너 claude 가 여전히 로그인 안 됨."
  echo "     직접 원인 확인: docker exec -it $CONTAINER claude -p \"ping\""
  echo "     이미지가 없으면: bash docker/run.command"
fi
echo "========================================"
