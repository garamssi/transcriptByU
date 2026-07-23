# 언어 도메인 리팩터 (Language Registry) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax.

**Goal:** 번역 "언어"를 코드 식별자 기반 단일 레지스트리(도메인 엔티티)로 승격하고, 프롬프트·스킵·캐시·드롭다운·배지를 그 투영으로 바꾸며, 목표어를 명시적 요청 파라미터로 흐르게 하고 application의 chrome.storage 직접 접근을 포트 주입으로 대체한다.

**Architecture:** `src/domain/languages.js`가 단일 진리원(코드 `en/ko/ja/zh`). 소비처는 전부 파생. 목표어는 content가 1회 해석해 `TRANSLATE_BATCH` 메시지에 실어 보냄. 배지 언어명은 `Intl.DisplayNames`. 레거시 엔도님은 `resolveCode` shim으로 흡수, 캐시는 자연 만료.

**Tech Stack:** Vanilla ESM, Chrome MV3, Node 22 `node:test`, esbuild(콘텐츠 번들), `Intl.DisplayNames`.

## Global Constraints

- 범위 = ①+② 코어. `sourceCode`는 파라미터 경로만 배선(원본 자동감지 유지). ③(트랙 srclang·Detector)·ICU plural은 범위 밖.
- **식별자 = BCP-47 코드**(`en/ko/ja/zh`). 저장/표시 문자열(엔도님)과 분리.
- 새 npm 의존성·루트 package.json 금지. 테스트는 `node --test`(디렉토리 인자 `node --test tests/`는 이 Node에서 오작동 → 인자 없이). ESM 모듈의 테스트는 `.mjs`(`src/package.json`이 type=module).
- `content.js`는 빌드 산출물 — content 소스 변경 후 `npx esbuild content.src.js --bundle --outfile=content.js` 재번들하고 둘 다 커밋.
- 도메인(`src/domain/*`)은 순수 유지 — `chrome.*`·`Intl` 금지. `Intl.DisplayNames`는 `src/shared/language-name.js`.
- 캐시 마이그레이션 코드 없음(자연 만료). 캐시 목록은 코드→엔도님 **표시만** 변환.
- 브랜치: 현재 체크아웃된 `feat/ui-language-i18n`에서 계속(미병합 i18n 위 스택).
- 커밋 트레일러(정확히): `Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>`

---

## File Structure

**신규**: `src/domain/languages.js`, `src/shared/language-name.js`, `tests/languages.test.mjs`, `tests/language-name.test.mjs`, `tests/language-domain.test.mjs`
**수정(도메인)**: `prompt-builder.js`, `language-detect.js`, `cache-key.js`, `constants.js`(DEFAULT_TARGET_LANG 제거)
**수정(앱/인프라)**: `translation-service.js`, `storage-adapter.js`, `background.js`
**수정(콘텐츠, +재번들)**: `content.src.js`, `vtt-bridge.js`, `transcript-manager.js`, `badge-manager.js` (`caption-manager.js`는 변경 불필요 — 확인만)
**수정(팝업)**: `popup.html`, `settings-controller.js`, `cache-dialog.js`
**수정(데이터/문서)**: `locales/en.json`·`ko.json`·`ja.json`(langNames 제거), `locales/GLOSSARY.md`

---

## Task 1: 언어 레지스트리 (`src/domain/languages.js`)

**Files:** Create `src/domain/languages.js`; Test `tests/languages.test.mjs`

**Interfaces — Produces:**
- `LANGUAGES` (code→{code,endonym,englishName,script}), `TARGET_CODES=['ko','ja','zh']`, `UI_CODES=['en','ko','ja']`, `DEFAULT_TARGET_CODE='ko'`
- `byCode(code)`, `isValidTargetCode(code)`, `scriptOf(code)`, `resolveCode(value, fallback?)`, `ENDONYM_TO_CODE`

- [ ] **Step 1: 실패 테스트** — `tests/languages.test.mjs`
```js
import test from 'node:test';
import assert from 'node:assert';
import { LANGUAGES, TARGET_CODES, UI_CODES, DEFAULT_TARGET_CODE, byCode, isValidTargetCode, scriptOf, resolveCode } from '../src/domain/languages.js';

test('every LANGUAGES entry has code/endonym/englishName/script and code matches key', () => {
  for (const [k, v] of Object.entries(LANGUAGES)) {
    assert.strictEqual(v.code, k);
    for (const f of ['endonym', 'englishName', 'script']) assert.ok(typeof v[f] === 'string' && v[f], `${k}.${f}`);
  }
});
test('TARGET_CODES and UI_CODES are all valid codes; ko is default target', () => {
  for (const c of [...TARGET_CODES, ...UI_CODES]) assert.ok(LANGUAGES[c], c);
  assert.strictEqual(DEFAULT_TARGET_CODE, 'ko');
});
test('byCode / scriptOf / isValidTargetCode', () => {
  assert.strictEqual(byCode('ja').englishName, 'Japanese');
  assert.strictEqual(byCode('nope'), null);
  assert.strictEqual(scriptOf('ko'), 'hangul');
  assert.strictEqual(scriptOf('nope'), null);
  assert.ok(isValidTargetCode('zh'));
  assert.ok(!isValidTargetCode('en'));
});
test('resolveCode: code passthrough / endonym→code / unknown→fallback', () => {
  assert.strictEqual(resolveCode('ko'), 'ko');
  assert.strictEqual(resolveCode('한국어'), 'ko');
  assert.strictEqual(resolveCode('日本語'), 'ja');
  assert.strictEqual(resolveCode(undefined), 'ko');
  assert.strictEqual(resolveCode('xx'), 'ko');
  assert.strictEqual(resolveCode('xx', 'ja'), 'ja');
});
```
- [ ] **Step 2: 실패 확인** — Run `node --test tests/languages.test.mjs` → FAIL (module not found)
- [ ] **Step 3: 구현** — `src/domain/languages.js`
```js
export const LANGUAGES = {
  en: { code: 'en', endonym: 'English', englishName: 'English',  script: 'latin'    },
  ko: { code: 'ko', endonym: '한국어',  englishName: 'Korean',   script: 'hangul'   },
  ja: { code: 'ja', endonym: '日本語',  englishName: 'Japanese', script: 'japanese' },
  zh: { code: 'zh', endonym: '中文',    englishName: 'Chinese',  script: 'chinese'  },
};

export const TARGET_CODES = ['ko', 'ja', 'zh'];
export const UI_CODES = ['en', 'ko', 'ja'];
export const DEFAULT_TARGET_CODE = 'ko';

export const ENDONYM_TO_CODE = { 'English': 'en', '한국어': 'ko', '日本語': 'ja', '中文': 'zh' };

export function byCode(code) { return LANGUAGES[code] || null; }
export function isValidTargetCode(code) { return TARGET_CODES.includes(code); }
export function scriptOf(code) { return LANGUAGES[code]?.script || null; }

/** 코드면 그대로, 레거시 엔도님이면 코드로, 미상이면 fallback. */
export function resolveCode(value, fallback = DEFAULT_TARGET_CODE) {
  if (!value) return fallback;
  if (LANGUAGES[value]) return value;
  return ENDONYM_TO_CODE[value] || fallback;
}
```
- [ ] **Step 4: 통과 확인** — Run `node --test tests/languages.test.mjs` → `# pass 4`
- [ ] **Step 5: 커밋**
```bash
git add src/domain/languages.js tests/languages.test.mjs
git commit -m "$(cat <<'EOF'
feat(domain): 언어 레지스트리(코드 식별자 단일 진리원) 추가

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 2: 언어명 헬퍼 (`src/shared/language-name.js`)

**Files:** Create `src/shared/language-name.js`; Test `tests/language-name.test.mjs`

**Interfaces — Produces:** `languageName(targetCode, uiCode): string` — `Intl.DisplayNames` 기반, 실패 시 코드 문자열 폴백.

- [ ] **Step 1: 실패 테스트** — `tests/language-name.test.mjs`
```js
import test from 'node:test';
import assert from 'node:assert';
import { languageName } from '../src/shared/language-name.js';

test('languageName renders in the UI locale', () => {
  assert.strictEqual(languageName('ko', 'en'), 'Korean');   // ICU 표준, 안정적
});
test('languageName returns a non-empty string for valid combos', () => {
  const s = languageName('ja', 'ko');
  assert.ok(typeof s === 'string' && s.length > 0);
});
test('languageName falls back to the code on invalid input', () => {
  assert.strictEqual(languageName('zz-not-a-lang', 'en'), 'zz-not-a-lang');
});
```
- [ ] **Step 2: 실패 확인** — Run `node --test tests/language-name.test.mjs` → FAIL
- [ ] **Step 3: 구현** — `src/shared/language-name.js`
```js
/**
 * 목표 언어 코드를 현재 UI 로케일로 표기한다 (배지 등 표시용).
 * 도메인이 아니라 표시(presentation) 관심사이므로 shared 에 둔다.
 * @param {string} targetCode - 표시할 언어 코드 (예: 'ko')
 * @param {string} uiCode - 표기 기준 UI 로케일 코드 (예: 'ja')
 * @returns {string} 지역화된 언어명, 실패 시 targetCode 그대로
 */
export function languageName(targetCode, uiCode) {
  try {
    return new Intl.DisplayNames([uiCode], { type: 'language' }).of(targetCode) || targetCode;
  } catch {
    return targetCode;
  }
}
```
- [ ] **Step 4: 통과 확인** — Run `node --test tests/language-name.test.mjs` → `# pass 3`
- [ ] **Step 5: 커밋**
```bash
git add src/shared/language-name.js tests/language-name.test.mjs
git commit -m "$(cat <<'EOF'
feat(shared): Intl.DisplayNames 기반 언어명 헬퍼 추가

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 3: 도메인 투영을 코드 기반으로 (prompt-builder / language-detect / cache-key)

**Files:** Modify `src/domain/prompt-builder.js`, `src/domain/language-detect.js`, `src/domain/cache-key.js`; Test `tests/language-domain.test.mjs`

**Interfaces:**
- Consumes: `byCode`, `scriptOf`, `DEFAULT_TARGET_CODE` (Task 1)
- Produces (signature 변경): `buildBatchSystemPrompt(targetCode, context)`, `isAlreadyTargetLanguage(text, targetCode, sourceCode?)`, `lectureCacheKey(targetCode, course, section, lecture)`

> 참고: 이 시그니처 변경 후 호출자(translation-service·content)는 Task 4~5에서 코드로 맞춘다. 그 사이 런타임 통합은 어긋나지만 단위 테스트는 green이며 최종(Task 5~6)에 정합. 통합은 Task 8 수동 검증.

- [ ] **Step 1: 실패 테스트** — `tests/language-domain.test.mjs`
```js
import test from 'node:test';
import assert from 'node:assert';
import { buildBatchSystemPrompt } from '../src/domain/prompt-builder.js';
import { isAlreadyTargetLanguage } from '../src/domain/language-detect.js';
import { lectureCacheKey } from '../src/domain/cache-key.js';

test('buildBatchSystemPrompt takes a code, emits englishName + endonym', () => {
  const p = buildBatchSystemPrompt('ja', {});
  assert.ok(p.includes('Japanese') && p.includes('日本語'));
});
test('buildBatchSystemPrompt falls back for unknown code', () => {
  const p = buildBatchSystemPrompt('zz', {});
  assert.ok(p.includes('Korean')); // DEFAULT_TARGET_CODE
});
test('isAlreadyTargetLanguage uses target code script', () => {
  assert.strictEqual(isAlreadyTargetLanguage('こんにちは', 'ja'), true);
  assert.strictEqual(isAlreadyTargetLanguage('こんにちは', 'ko'), false);
  assert.strictEqual(isAlreadyTargetLanguage('안녕하세요', 'ko'), true);
  assert.strictEqual(isAlreadyTargetLanguage('Hello', 'zz'), false); // 미지원 코드 → 항상 번역
});
test('isAlreadyTargetLanguage exact-skips when sourceCode === targetCode', () => {
  assert.strictEqual(isAlreadyTargetLanguage('anything', 'en', 'en'), true);
  assert.strictEqual(isAlreadyTargetLanguage('anything', 'ko', 'en'), false);
});
test('lectureCacheKey uses the code verbatim', () => {
  assert.strictEqual(lectureCacheKey('ko', 'c', 's', 'l'), 'ko::c||s||l');
});
```
- [ ] **Step 2: 실패 확인** — Run `node --test tests/language-domain.test.mjs` → FAIL (still endonym-based)
- [ ] **Step 3: prompt-builder.js 교체** — 상단 import 추가 + 함수 앞부분 교체
```js
import { byCode, DEFAULT_TARGET_CODE } from './languages.js';

export function buildBatchSystemPrompt(targetCode, context) {
  const lang = byCode(targetCode) || byCode(DEFAULT_TARGET_CODE);
  const langEnglish = lang.englishName;
  const endonym = lang.endonym;

  let prompt = `You are a subtitle translator. Translate each line to ${langEnglish} (${endonym}).
```
(이하 프롬프트 본문·STRICT RULES·Example·context 블록은 기존 그대로 두되, 본문 안 `${langEnglish}` 표현식은 유지. 기존의 `${targetLang}` 참조가 있던 곳은 위 `${endonym}`으로만 대체됨. `langMap` 선언 줄은 삭제.)

- [ ] **Step 4: language-detect.js 교체** — `TARGET_SCRIPT` 상수 삭제, import 추가, 함수 교체 (`dominantScript`는 그대로)
```js
import { scriptOf } from './languages.js';
// ... RE_* 및 dominantScript(text) 는 변경 없음 ...

export function isAlreadyTargetLanguage(text, targetCode, sourceCode) {
  if (!text) return false;
  if (sourceCode && sourceCode === targetCode) return true; // 원본 코드가 알려졌고 목표와 같으면 정확 스킵
  const expected = scriptOf(targetCode);
  if (!expected) return false; // 미지원 코드 → 항상 번역
  return dominantScript(text) === expected;
}
```
- [ ] **Step 5: cache-key.js 교체** — 파라미터 의미를 코드로 (본문 동일)
```js
/**
 * 강의 캐시 키를 생성한다. 형식: "targetCode::course||section||lecture"
 * @param {string} targetCode - 번역 대상 언어 코드 (예: 'ko')
 */
export function lectureCacheKey(targetCode, course, section, lecture) {
  return `${targetCode}::${course || ''}||${section || ''}||${lecture || ''}`;
}
```
- [ ] **Step 6: 통과 확인** — Run `node --test tests/language-domain.test.mjs` → `# pass 5`. 또한 `node --check src/domain/prompt-builder.js src/domain/language-detect.js src/domain/cache-key.js` 클린.
- [ ] **Step 7: 커밋**
```bash
git add src/domain/prompt-builder.js src/domain/language-detect.js src/domain/cache-key.js tests/language-domain.test.mjs
git commit -m "$(cat <<'EOF'
refactor(domain): 프롬프트/스킵/캐시키를 코드 식별자·레지스트리 기반으로

langMap·TARGET_SCRIPT 제거 → byCode/scriptOf 파생. sourceCode===targetCode 정확 스킵 경로 추가.

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 4: application/infra — 명시적 파라미터 + getSettings 주입

**Files:** Modify `src/application/translation-service.js`, `src/infrastructure/chrome/storage-adapter.js`, `background.js`

**Interfaces:**
- Consumes: `DEFAULT_TARGET_CODE`(Task 1), 코드 기반 도메인 함수(Task 3)
- Produces: `translateBatch({ texts, targetCode, sourceCode?, course, lecture, section })`; `getSettings()`→`{enabled}`; TranslationService 생성자에 `getSettings` 주입

- [ ] **Step 1: storage-adapter.js에 getSettings 추가** — 파일 끝에
```js
/**
 * 번역 게이트 설정을 로드한다.
 * @returns {Promise<{ enabled: boolean }>}
 */
export async function getSettings() {
  const s = await chrome.storage.local.get(['enabled']);
  return { enabled: s.enabled !== false };
}
```
- [ ] **Step 2: translation-service.js 수정**
  - 상단 import: `import { CHUNK_SIZE } from '../domain/constants.js';`(DEFAULT_TARGET_LANG 제거) + `import { DEFAULT_TARGET_CODE } from '../domain/languages.js';`
  - 생성자: `constructor({ l1Cache, l2Cache, callApi, getProviderConfig, getSettings })` → `this.getSettings = getSettings;`
  - `translateBatch` 시작부 교체:
```js
  async translateBatch({ texts, targetCode, sourceCode, course, lecture, section }) {
    try {
      const { enabled } = await this.getSettings();
      if (enabled === false) return { error: 'DISABLED' };

      const { provider, apiKey, model } = await this.getProviderConfig();
      if (!apiKey) return { error: 'NO_API_KEY' };

      const target = targetCode || DEFAULT_TARGET_CODE;
      const context = { course: course || '', lecture: lecture || '', section: section || '' };
      const lKey = lectureCacheKey(target, context.course, context.section, context.lecture);
```
  - 스킵 호출부: `if (isAlreadyTargetLanguage(texts[i], target, sourceCode)) {`
  - 프롬프트: `const systemPrompt = buildBatchSystemPrompt(target, context);`
  - 로그의 `${targetLang}` → `${target}`
  - `clearLectureCache({ lang, ... })`는 `lang`을 코드로 받는다고 가정(호출자 Task 5에서 코드 전달) — 내부 `const targetLang = lang;` 를 `const target = lang;` 로 두고 `lectureCacheKey(target, ...)` 사용(변수명만 정리, 동작 동일).
- [ ] **Step 3: background.js 수정** — TranslationService 생성 시 getSettings 주입
```js
import { getProviderConfig, getSettings } from './src/infrastructure/chrome/storage-adapter.js';
// ...
const translationService = new TranslationService({
  l1Cache,
  l2Cache: { l2Get, l2Set, l2Delete },
  callApi,
  getProviderConfig,
  getSettings,
});
```
(메시지 핸들러 `translateBatch(message)`는 변경 없음 — message가 이제 targetCode를 포함.)
- [ ] **Step 4: 검증** — `node --check src/application/translation-service.js src/infrastructure/chrome/storage-adapter.js background.js` 클린. `node --test` → 전체 green(기존 스위트 회귀 없음; translation-service엔 단위테스트 없음).
- [ ] **Step 5: 커밋**
```bash
git add src/application/translation-service.js src/infrastructure/chrome/storage-adapter.js background.js
git commit -m "$(cat <<'EOF'
refactor(app): translateBatch 명시적 targetCode/sourceCode + getSettings 주입

application의 chrome.storage 직접 읽기 제거(계층 위반 해소), 목표어를 요청 파라미터로.

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 5: content 배선 — 코드 해석·메시지 targetCode·재번들 + constants 정리

**Files:** Modify `content.src.js`, `src/presentation/content/vtt-bridge.js`, `src/presentation/content/transcript-manager.js`, `src/domain/constants.js`; Regenerate `content.js`. (`caption-manager.js`는 확인만)

**Interfaces:** Consumes `resolveCode`, `DEFAULT_TARGET_CODE`(Task 1). content가 targetCode를 1회 해석해 `TRANSLATE_BATCH`에 실음.

- [ ] **Step 1: vtt-bridge.js 수정**
  - import: `import { resolveCode, DEFAULT_TARGET_CODE } from '../../domain/languages.js';`(DEFAULT_TARGET_LANG import 제거)
  - `let currentLang = DEFAULT_TARGET_CODE;`
  - `setActiveLang(lang)`: 그대로(`if (lang) currentLang = lang;`) — 호출자가 코드 전달
  - `requestTranslations` 내 storage 읽기부 교체 + 메시지에 targetCode 추가:
```js
  const { targetLang } = await chrome.storage.local.get('targetLang');
  const targetCode = resolveCode(targetLang);
  currentLang = targetCode;
  // ...
  response = await chrome.runtime.sendMessage({
    type: 'TRANSLATE_BATCH',
    texts: toSend,
    targetCode,
    course: ctx.course,
    lecture: ctx.lecture,
    section: ctx.section,
  });
```
- [ ] **Step 2: content.src.js 수정** — import + 코드 해석
  - `import { resolveCode } from './src/domain/languages.js';`
  - 시작 블록: `setActiveLang(resolveCode(s[STORAGE_KEYS.TARGET_LANG]))` / `setBadgeLang(resolveCode(s[STORAGE_KEYS.TARGET_LANG]))`
  - onChanged TARGET_LANG 분기: `const code = resolveCode(changes[STORAGE_KEYS.TARGET_LANG].newValue); setActiveLang(code); setBadgeLang(code);`
- [ ] **Step 3: transcript-manager.js 수정** — retranslateAll의 lang을 코드로
  - `import { resolveCode } from '../../domain/constants.js';` → **아님**. `import { resolveCode } from '../../domain/languages.js';`
  - 기존 `const lang = stored[STORAGE_KEYS.TARGET_LANG] || '한국어';` → `const targetCode = resolveCode(stored[STORAGE_KEYS.TARGET_LANG]);`
  - `CLEAR_LECTURE_CACHE` 메시지 `lang` → `lang: targetCode`
- [ ] **Step 4: caption-manager.js 확인** — `isAlreadyTargetLanguage(originalText, getActiveLang())` 호출은 getActiveLang이 코드를 반환하므로 **변경 불필요**. 파일을 열어 이 한 줄만 확인하고 수정하지 않는다.
- [ ] **Step 5: constants.js 정리** — `DEFAULT_TARGET_LANG` 사용처가 모두 이관됐는지 확인 후 제거
  - Run: `grep -rn "DEFAULT_TARGET_LANG" --include="*.js" src/ content.src.js background.js` → 결과 없어야 함(있으면 그 파일 먼저 이관). 확인되면 `constants.js`에서 `export const DEFAULT_TARGET_LANG = '한국어';` 줄 삭제.
- [ ] **Step 6: 재번들 + 검증**
  - Run: `npx esbuild content.src.js --bundle --outfile=content.js`
  - Run: `node --check content.src.js content.js` 클린
  - Run: `grep -c "targetCode" content.js` → ≥1
  - Run: `node --test` → 전체 green
- [ ] **Step 7: 커밋** (소스 + 번들)
```bash
git add content.src.js content.js src/presentation/content/vtt-bridge.js src/presentation/content/transcript-manager.js src/domain/constants.js
git commit -m "$(cat <<'EOF'
refactor(content): 목표어를 코드로 해석해 TRANSLATE_BATCH에 명시 전달 + 재번들

사이드채널/이중읽기 제거. DEFAULT_TARGET_LANG 제거(레지스트리로 이관).

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 6: 배지 언어명 Intl화 + langNames 제거 + 재번들

**Files:** Modify `src/presentation/content/badge-manager.js`, `locales/en.json`·`ko.json`·`ja.json`, `locales/GLOSSARY.md`; Regenerate `content.js`

**Interfaces:** Consumes `languageName`(Task 2), `getLocale`(shared/i18n), `DEFAULT_TARGET_CODE`(Task 1).

- [ ] **Step 1: badge-manager.js 수정**
  - import 추가: `import { t, getLocale } from '../../shared/i18n.js';`(t는 이미 있으면 getLocale만 추가) + `import { languageName } from '../../shared/language-name.js';` + `import { DEFAULT_TARGET_CODE } from '../../domain/languages.js';`
  - `let lang = DEFAULT_TARGET_CODE;` (기존 `'한국어'` 대체 — 이제 코드)
  - `badgeText()` 교체:
```js
function badgeText() {
  return t('badge.translatingTo', { lang: languageName(lang, getLocale()) });
}
```
  (기존 `langNames.` 조회 로직 삭제. `setBadgeLang(l)`의 `if (l) lang = l;` 유지 — l은 코드.)
- [ ] **Step 2: 카탈로그에서 langNames 제거** — `locales/en.json`·`ko.json`·`ja.json` 각각의 `"langNames": { ... }` 블록 삭제(그 앞 `"badge"` 블록의 닫는 쉼표 정리). 세 파일 동일 제거.
- [ ] **Step 3: GLOSSARY.md 갱신** — §5의 langNames 설명을 "배지 언어명은 `Intl.DisplayNames`로 파생(카탈로그 langNames 없음)"으로, §1의 targetLang 관련은 "targetLang 저장값은 코드(en/ko/ja/zh), 표시는 endonym"으로 정정. (§2/§3 용어표는 유지.)
- [ ] **Step 4: 재번들 + 검증**
  - Run: `npx esbuild content.src.js --bundle --outfile=content.js`
  - Run: `node -e "require('./locales/en.json');require('./locales/ko.json');require('./locales/ja.json')"` 유효
  - Run: `grep -rn "langNames" --include="*.js" --include="*.json" src/ locales/ content.js` → 결과 없어야 함(잔존 참조 0)
  - Run: `node --test` → 전체 green (catalog-parity: 3로케일 동일하게 langNames 빠져 통과)
- [ ] **Step 5: 커밋**
```bash
git add src/presentation/content/badge-manager.js content.js content.src.js locales/en.json locales/ko.json locales/ja.json locales/GLOSSARY.md
git commit -m "$(cat <<'EOF'
refactor(i18n): 배지 언어명을 Intl.DisplayNames로 파생 + 카탈로그 langNames 제거

(UI로케일 × 목표어) 매트릭스 제거. 배지는 코드 + getLocale로 지역화명 생성.

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 7: 팝업 드롭다운을 레지스트리에서 렌더 + 캐시목록 표시 매핑

**Files:** Modify `popup.html`, `src/presentation/popup/settings-controller.js`, `src/presentation/popup/cache-dialog.js`

**Interfaces:** Consumes `LANGUAGES`, `TARGET_CODES`, `UI_CODES`, `byCode`, `resolveCode`(Task 1).

- [ ] **Step 1: popup.html — 두 select의 하드코딩 옵션 제거**
  - `<select id="targetLang">…</select>` 내부 `<option>` 3개 삭제 → `<select id="targetLang"></select>`(select 태그와 형제 chevron svg는 유지).
  - `<select id="uiLang">…</select>` 내부 `<option>` 2~3개 삭제 → 빈 select.
- [ ] **Step 2: settings-controller.js — 옵션 렌더 + 코드 저장 + normalize**
  - import: `import { LANGUAGES, TARGET_CODES, UI_CODES, resolveCode } from '../../domain/languages.js';`
  - 초기화에서 두 select를 렌더(모델 select 렌더와 동일 패턴):
```js
  targetLangSelect.innerHTML = TARGET_CODES.map(c => `<option value="${c}">${LANGUAGES[c].endonym}</option>`).join('');
  const uiLangSelect = $('uiLang');
  uiLangSelect.innerHTML = UI_CODES.map(c => `<option value="${c}">${LANGUAGES[c].endonym}</option>`).join('');
```
  - targetLang 초기값 + normalize: 기존 `if (stored[TARGET_LANG]) targetLangSelect.value = stored[TARGET_LANG];` 교체:
```js
  const targetCode = resolveCode(stored[STORAGE_KEYS.TARGET_LANG]);
  targetLangSelect.value = targetCode;
  if (stored[STORAGE_KEYS.TARGET_LANG] !== targetCode) {
    await chrome.storage.local.set({ [STORAGE_KEYS.TARGET_LANG]: targetCode }); // 레거시 엔도님 → 코드 정규화
  }
```
  - targetLang change 핸들러: 그대로 `targetLangSelect.value`(이제 코드) 저장.
  - uiLang: 초기값 `uiLangSelect.value = getLocale();`(이미 코드) — 렌더가 위에서 되므로 순서상 렌더 후 값 설정. 기존 uiLang change 핸들러 로직 유지.
- [ ] **Step 3: cache-dialog.js — 코드→엔도님 표시**
  - import: `import { byCode } from '../../domain/languages.js';`
  - `item.lang`을 표시하는 두 곳(renderSearch·renderLectures의 `<span class="cache-item-tag">${escapeHtml(item.lang)}</span>`)을:
```js
    <span class="cache-item-tag">${escapeHtml(byCode(item.lang)?.endonym || item.lang)}</span>
```
- [ ] **Step 4: 검증**
  - Run: `node --check popup.js src/presentation/popup/settings-controller.js src/presentation/popup/cache-dialog.js` 클린
  - Run: `node --test` → 전체 green (popup-i18n: data-i18n 키 검사라 영향 없음)
- [ ] **Step 5: 커밋**
```bash
git add popup.html src/presentation/popup/settings-controller.js src/presentation/popup/cache-dialog.js
git commit -m "$(cat <<'EOF'
refactor(popup): 목표어/UI언어 드롭다운을 레지스트리에서 렌더 + 코드 저장/정규화

하드코딩 옵션 제거. 캐시목록은 코드→엔도님 표시 매핑.

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 8: 전체 검증 + 잔존 엔도님/누수 점검

**Files:** (검증 전용; 필요 시 소소한 수정)

- [ ] **Step 1: 전체 테스트** — Run `node --test` → 모든 파일 PASS, `# fail 0`.
- [ ] **Step 2: 잔존 참조 점검**
  - Run: `grep -rn "langNames" --include="*.js" --include="*.json" src/ locales/ content.js` → 0건
  - Run: `grep -rn "DEFAULT_TARGET_LANG\|TARGET_SCRIPT\|langMap" --include="*.js" src/ content.src.js` → 0건(모두 레지스트리로 대체)
  - Run: `grep -rn "'한국어'\|\"한국어\"" --include="*.js" src/ content.src.js background.js | grep -v "\.test\."` → 남는 것은 엔도님 데이터(레지스트리 `languages.js`의 endonym, ENDONYM_TO_CODE)뿐인지 육안 확인. 로직에 하드코딩 엔도님이 남아 있으면 코드/resolveCode로 교체.
- [ ] **Step 3: 번들 최신화 확인** — Run `npx esbuild content.src.js --bundle --outfile=content.js` 후 `git status --short` → `content.js` 변경 없음(이미 최신이면 clean). 변경 있으면 커밋.
- [ ] **Step 4: 빌드 패키지 검증** — Run `./build-extension.sh` → zip 생성. Run `unzip -l udemy-ai-translator-*.zip | grep -E "languages\.js|language-name\.js|locales/"` → `src/domain/languages.js`·`src/shared/language-name.js`·locales 포함 확인(빌드가 `src/`·`locales/` 통째 복사하므로 자동 포함).
- [ ] **Step 5: 수동 검증 게이트 (사용자)** — 서브에이전트는 수행 불가, DEFER로 보고:
  - 신규/기존 사용자 모두 목표어 정상(레거시 엔도님 저장값 → 코드 정규화 후 번역 지속)
  - 목표어 EN 아닌 원본(일본어 자막)도 자동 감지 번역
  - 목표어 전환 시 배지 언어명이 UI 로케일로 표기(예: UI=ja, target=ko → 배지에 "韓国語")
  - 캐시 목록 태그가 코드가 아니라 엔도님(한국어/日本語/中文)으로 표시
  - 목표어/UI언어 드롭다운이 정상 렌더·전환·유지
- [ ] **Step 6: 커밋(있으면)** — 잔존 수정이 있었다면
```bash
git add -A && git commit -m "$(cat <<'EOF'
chore(lang): 리팩터 마감 검증 및 잔존 참조 정리

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Self-Review (플랜 ↔ 스펙 대조)

- **커버리지**: 레지스트리(§4.1)→T1, Intl 헬퍼(§6)→T2, 도메인 투영(§4.3)→T3, 명시 배선+getSettings(§4.2,§5)→T4·T5, langNames 제거(§6)→T6, 드롭다운 렌더+캐시표시(§8,§4.3)→T7, 마이그레이션(§7)→T3(resolveCode)·T5·T7(normalize), 테스트(§9)→T1·T2·T3·T8. 누락 없음.
- **placeholder 스캔**: 코드 단계에 실제 코드 포함, TBD 없음.
- **타입/이름 일관성**: `targetCode`/`sourceCode`/`resolveCode`/`byCode`/`scriptOf`/`DEFAULT_TARGET_CODE`/`languageName`/`getSettings` 시그니처가 정의(T1·T2·T4)↔사용(T3~T7) 일치. 캐시키 형식 `code::course||section||lecture` 일관.
- **정합 창(window)**: T3에서 시그니처 변경 후 T4·T5에서 호출자 정합 — 단위테스트는 각 태스크 green, 통합은 T8 수동. 명시적으로 기록함.
- **`caption-manager`**: 변경 불필요(확인만) — getActiveLang이 코드 반환하면 기존 호출이 그대로 성립.
