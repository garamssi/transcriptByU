#!/usr/bin/env bash
#
# 크롬 웹스토어 업로드용 확장 프로그램 zip 을 만든다.
#
#   사용법:  ./build-extension.sh
#   결과:    udemy-ai-translator-<manifest.version>.zip  (저장소 루트, manifest 가 zip 루트)
#
# 하는 일:
#   1) content.src.js → content.js 재번들 (항상 최신 소스 반영)
#   2) 런타임 파일만 스테이징 (INCLUDE 방식: 아래 목록만 담음)
#   3) manifest 가 참조하는 파일이 모두 포함됐는지 검증
#   4) 버전 번호로 zip 생성
#
# 포함: manifest / background.js / content.js / vtt-interceptor.js / content.css /
#       popup.html·popup.css·popup.js / fonts.css / icons/ / fonts/*.woff2 / src/(.js 모듈)
# 제외: content.src.js(빌드 입력), docs·docker·proxy-server, README, *.zip, .git 등
#
# 요구: node, npx(esbuild)  — 프로젝트는 esbuild 로 content.js 를 번들한다.

set -euo pipefail

# 스크립트 위치 = 저장소 루트로 이동 (어디서 실행하든 동일하게 동작)
cd "$(dirname "$0")"
ROOT="$(pwd)"

STAGE="$(mktemp -d)"
trap 'rm -rf "$STAGE"' EXIT

echo "▶ content.js 번들…"
npx esbuild content.src.js --bundle --outfile=content.js

VERSION="$(node -e "process.stdout.write(require('./manifest.json').version)")"
OUT="$ROOT/udemy-ai-translator-$VERSION.zip"
echo "▶ 버전: $VERSION"

echo "▶ 런타임 파일 스테이징…"
cp manifest.json background.js content.js vtt-interceptor.js content.css \
   popup.html popup.css popup.js fonts.css "$STAGE"/
cp -R icons "$STAGE"/icons
mkdir -p "$STAGE"/fonts
cp fonts/*.woff2 "$STAGE"/fonts/
# background.js·popup.js 는 번들이 아니라 src/ 를 런타임에 ES 모듈로 로드하므로 src 전체 포함
cp -R src "$STAGE"/src

echo "▶ manifest 참조 파일 검증…"
node -e '
const fs = require("fs");
const m = require("./manifest.json");
const stage = process.argv[1];
const refs = [];
(m.content_scripts || []).forEach(c => {
  (c.js || []).forEach(j => refs.push(j));
  (c.css || []).forEach(x => refs.push(x));
});
if (m.background && m.background.service_worker) refs.push(m.background.service_worker);
if (m.action && m.action.default_popup) refs.push(m.action.default_popup);
Object.values((m.action && m.action.default_icon) || {}).forEach(i => refs.push(i));
Object.values(m.icons || {}).forEach(i => refs.push(i));
let ok = true;
[...new Set(refs)].forEach(r => {
  if (!fs.existsSync(stage + "/" + r)) { ok = false; console.error("  ❌ 누락:", r); }
});
if (!ok) { console.error("→ manifest 참조 파일이 패키지에 없음"); process.exit(1); }
console.log("  ✅ manifest 참조 파일 전부 포함");
' "$STAGE"

echo "▶ zip 생성…"
rm -f "$OUT"
find "$STAGE" -name ".DS_Store" -delete
( cd "$STAGE" && zip -r -X -q "$OUT" . -x "*.DS_Store" )

echo "✅ 완료: $OUT ($(du -h "$OUT" | cut -f1), $(unzip -l "$OUT" | tail -1 | awk '{print $2}') files)"
