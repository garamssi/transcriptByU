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
#       압축은 zip 을 쓰고, 없으면(Windows Git Bash) PowerShell + .NET ZipFile 로 대체한다.
#       (어느 쪽이든 항목 경로는 / 로 저장되고, 만든 뒤 검증한다.)

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
cp -R locales "$STAGE"/locales

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
find "$STAGE" -name "*.test.*" -delete
if command -v zip >/dev/null 2>&1; then
  # macOS·Linux (또는 zip 이 설치된 Git Bash)
  ( cd "$STAGE" && zip -r -X -q "$OUT" . -x "*.DS_Store" )
else
  # Windows(Git Bash)에는 zip 이 없다 → PowerShell + .NET ZipFile 로 대체.
  # Windows PowerShell 5.1 의 Compress-Archive 는 항목 경로를 'src\app.js' 처럼 역슬래시로 저장해서
  # 웹스토어·macOS 에서 폴더 구조가 깨진다. 항목 이름을 직접 '/' 로 지정해 표준 zip 을 만든다.
  towin() { if command -v cygpath >/dev/null 2>&1; then cygpath -w "$1"; else printf '%s' "$1"; fi; }
  PS="$(command -v pwsh || command -v powershell)" || {
    echo "→ zip 도 PowerShell 도 없어 압축할 수 없음" >&2; exit 1; }
  PS_SCRIPT="$(mktemp -d)/make-zip.ps1"
  cat > "$PS_SCRIPT" <<'PS1'
param([string]$Src, [string]$Out)
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.IO.Compression, System.IO.Compression.FileSystem
$root = (Resolve-Path -LiteralPath $Src).Path.TrimEnd([char]92, [char]47)
$zip = [IO.Compression.ZipFile]::Open($Out, 'Create')
try {
  Get-ChildItem -LiteralPath $root -Recurse -File | Sort-Object FullName | ForEach-Object {
    $name = $_.FullName.Substring($root.Length + 1).Replace([string][char]92, '/')
    [void][IO.Compression.ZipFileExtensions]::CreateEntryFromFile($zip, $_.FullName, $name, 'Optimal')
  }
} finally { $zip.Dispose() }
PS1
  "$PS" -NoProfile -NonInteractive -ExecutionPolicy Bypass -File "$(towin "$PS_SCRIPT")" \
    -Src "$(towin "$STAGE")" -Out "$(towin "$OUT")"
  rm -rf "$(dirname "$PS_SCRIPT")"
fi

echo "▶ zip 검증…"
# 항목 경로에 역슬래시가 있거나 manifest.json 이 루트에 없으면 웹스토어 업로드가 깨진다.
node -e '
const fs = require("fs");
const buf = fs.readFileSync(process.argv[1]);
// zip 끝의 EOCD 레코드 → 중앙 디렉터리를 따라가며 항목 이름을 읽는다 (외부 도구 없이 OS 공통으로 동작).
const eocd = buf.lastIndexOf(Buffer.from([0x50, 0x4b, 0x05, 0x06]));
if (eocd < 0) { console.error("  ❌ zip 형식이 아님"); process.exit(1); }
const count = buf.readUInt16LE(eocd + 10);
const names = [];
for (let i = 0, off = buf.readUInt32LE(eocd + 16); i < count; i++) {
  if (buf.readUInt32LE(off) !== 0x02014b50) { console.error("  ❌ 중앙 디렉터리 손상"); process.exit(1); }
  const nameLen = buf.readUInt16LE(off + 28), extraLen = buf.readUInt16LE(off + 30), commentLen = buf.readUInt16LE(off + 32);
  names.push(buf.toString("utf8", off + 46, off + 46 + nameLen));
  off += 46 + nameLen + extraLen + commentLen;
}
const bad = names.filter(n => n.includes("\\"));
if (bad.length) { console.error("  ❌ 역슬래시 경로:", bad.slice(0, 5).join(", ")); process.exit(1); }
if (!names.includes("manifest.json")) { console.error("  ❌ zip 루트에 manifest.json 없음"); process.exit(1); }
console.log("  ✅ 항목 " + names.filter(n => !n.endsWith("/")).length + "개, 경로 구분자 / , manifest.json 루트");
' "$OUT"

echo "✅ 완료: $OUT ($(du -h "$OUT" | cut -f1))"
