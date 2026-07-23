# UI 언어 옵션 (i18n) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 확장의 UI 표기 언어(팝업 패널 + 영상 배지)를 사용자가 한국어/영어로 선택 전환할 수 있게 한다. 기본값 영어, 즉시 전환, 하드코딩 제거.

**Architecture:** JSON 카탈로그(`locales/en.json`·`ko.json`) + 순수 런타임 `src/shared/i18n.js`(`t()`/`applyI18n()`) + `data-i18n` 속성 바인딩 + `uiLang` 저장키. 카탈로그는 표면별로 로드해 `setCatalogs`로 주입한다(팝업=import attributes, 콘텐츠=esbuild 인라인, 테스트=객체 주입).

**Tech Stack:** Vanilla ESM(브라우저/esbuild), Chrome MV3, Node 22 내장 테스트러너(`node:test`), esbuild 0.28(콘텐츠 번들).

## Global Constraints

- 새 npm 의존성 추가 금지(npm install 불필요 유지). 테스트는 Node 내장 `node:test`로 직접 실행. **유일한 예외**: 의존성 없는 `src/package.json` (`{"type":"module"}`) — Node가 `src/*.js`를 ESM으로 인식해 `.mjs` 테스트 실행 시 `MODULE_TYPELESS_PACKAGE_JSON` 경고를 제거한다(브라우저/esbuild 무영향, `proxy-server` CJS 무영향). **루트** package.json은 금지(넣으면 proxy-server CJS 테스트가 깨짐).
- `src/` 코드는 ESM(`import`/`export`), 기존 `proxy-server/*.test.js`는 CommonJS. `i18n.js`는 ESM이므로 그 단위테스트는 `.mjs`.
- `content.js`는 빌드 산출물이다 — `content.src.js` 수정 후 반드시 `npx esbuild content.src.js --bundle --outfile=content.js`로 재번들하고 둘 다 커밋한다.
- 테스트 파일은 배포 zip에 포함되지 않도록 **최상위 `tests/`** 에 둔다(빌드는 include 방식이라 `tests/`를 복사하지 않음).
- 기본 로케일 = `'en'`. `setLocale`은 미지원 값이면 `'en'`으로 폴백.
- **변경 금지**: 번역 대상 언어 옵션(`한국어`/`日本語`/`中文`) 라벨·값, `<select>` `option` 의 `value` 속성, `MODELS` 의 `value`, 코드 주석/JSDoc, 프롬프트·언어감지·파서 로직, `DEFAULT_TARGET_LANG`, `proxy-server`, `docs/export`, `console.*` 로그.
- import attributes(`with { type: 'json' }`)는 Chrome 123+/Node 22+ 필요(팝업 전용). 콘텐츠 측은 attribute 없는 평문 `import`로 esbuild가 인라인.
- 커밋 메시지 트레일러: `Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>`

---

## File Structure

**신규**
- `locales/en.json` — 영어 카탈로그(단일 소스 오브 트루스)
- `locales/ko.json` — 한국어 카탈로그(en과 동일 키 세트)
- `src/shared/i18n.js` — 순수 i18n 런타임
- `tests/i18n.test.mjs` — i18n 런타임 단위테스트(ESM)
- `tests/catalog-parity.test.js` — 카탈로그 키 정합성(CJS)
- `tests/constants.test.mjs` — MODELS/STORAGE_KEYS ↔ 카탈로그 검증(ESM)
- `tests/popup-i18n.test.js` — popup.html data-i18n 키 존재 검증(CJS)

**수정**
- `src/domain/constants.js` — `UI_LANG` 키 추가, `MODELS` 라벨 → `name`+`tier` 분리
- `popup.html` — 표기 문자열 → `data-i18n*` 키, 언어 선택 카드 추가, `<html lang>`
- `popup.js` — 카탈로그 등록 + 로케일 초기화 + `applyI18n`
- `src/presentation/popup/settings-controller.js` — 동적 `t()`, 모델 라벨 조립, 언어 셀렉트 핸들러
- `src/presentation/popup/cache-dialog.js` — 동적 `t()`
- `src/presentation/content/badge-manager.js` — 배지 `t()` + `langNames`
- `content.src.js` (+ 재번들된 `content.js`) — 카탈로그 등록 + `onChanged` uiLang 분기 + 시작 시 로케일 로드
- `build-extension.sh` — `locales/` 스테이징 + 테스트파일 배제 안전장치

---

## Task 1: i18n 런타임 (`src/shared/i18n.js`)

**Files:**
- Create: `src/shared/i18n.js`
- Test: `tests/i18n.test.mjs`

**Interfaces:**
- Consumes: 없음(순수 모듈).
- Produces:
  - `setCatalogs(catalogs: Record<string, object>): void` — 로케일→카탈로그 맵 등록
  - `setLocale(locale: string): void` — 현재 로케일 설정(미지원 값 → `'en'`)
  - `getLocale(): string` — 현재 로케일
  - `t(key: string, params?: Record<string, any>): string` — 점경로 조회 + `{param}` 치환, 현재 로케일 → en 폴백 → 키 문자열 반환
  - `applyI18n(root?: { querySelectorAll(sel): Iterable<Element> }): void` — `[data-i18n]`→textContent, `[data-i18n-placeholder]`→placeholder, `[data-i18n-title]`→title

- [ ] **Step 1: 실패하는 테스트 작성** — `tests/i18n.test.mjs`

```js
import test from 'node:test';
import assert from 'node:assert';
import { setCatalogs, setLocale, getLocale, t, applyI18n } from '../src/shared/i18n.js';

const EN = { greeting: 'Hello {name}', nested: { deep: 'Deep EN' }, only: 'EN only' };
const KO = { greeting: '안녕 {name}', nested: { deep: '깊음 KO' } };

test('t: 현재 로케일에서 flat 키 조회 + 보간', () => {
  setCatalogs({ en: EN, ko: KO });
  setLocale('ko');
  assert.strictEqual(t('greeting', { name: '가람' }), '안녕 가람');
});

test('t: 점경로로 중첩 객체 탐색', () => {
  setCatalogs({ en: EN, ko: KO });
  setLocale('ko');
  assert.strictEqual(t('nested.deep'), '깊음 KO');
});

test('t: 복수 보간 + 미지정 파라미터는 원형 유지', () => {
  setCatalogs({ en: { s: '{a} and {b} and {c}' }, ko: {} });
  setLocale('en');
  assert.strictEqual(t('s', { a: '1', b: '2' }), '1 and 2 and {c}');
});

test('t: 현재 로케일에 없으면 en 폴백', () => {
  setCatalogs({ en: EN, ko: KO });
  setLocale('ko');
  assert.strictEqual(t('only'), 'EN only');
});

test('t: 어디에도 없으면 키 문자열 반환', () => {
  setCatalogs({ en: EN, ko: KO });
  setLocale('en');
  assert.strictEqual(t('does.not.exist'), 'does.not.exist');
});

test('setLocale: 미지원 로케일은 en 폴백', () => {
  setCatalogs({ en: EN, ko: KO });
  setLocale('fr');
  assert.strictEqual(getLocale(), 'en');
});

test('applyI18n: 가짜 root의 textContent/placeholder/title 채움', () => {
  setCatalogs({ en: { a: 'Label A', b: 'PH B', c: 'Title C' }, ko: {} });
  setLocale('en');
  const label = { attrs: { 'data-i18n': 'a' }, textContent: '', getAttribute(n) { return this.attrs[n]; }, setAttribute() {} };
  const input = { attrs: { 'data-i18n-placeholder': 'b' }, placeholder: '', getAttribute(n) { return this.attrs[n]; }, setAttribute(n, v) { if (n === 'placeholder') this.placeholder = v; } };
  const btn = { attrs: { 'data-i18n-title': 'c' }, title: '', getAttribute(n) { return this.attrs[n]; }, setAttribute(n, v) { if (n === 'title') this.title = v; } };
  const root = {
    querySelectorAll(sel) {
      if (sel === '[data-i18n]') return [label];
      if (sel === '[data-i18n-placeholder]') return [input];
      if (sel === '[data-i18n-title]') return [btn];
      return [];
    },
  };
  applyI18n(root);
  assert.strictEqual(label.textContent, 'Label A');
  assert.strictEqual(input.placeholder, 'PH B');
  assert.strictEqual(btn.title, 'Title C');
});
```

- [ ] **Step 2: 테스트 실패 확인**

Run: `node --test tests/i18n.test.mjs`
Expected: FAIL — `Cannot find module '../src/shared/i18n.js'` (아직 미작성)

- [ ] **Step 3: 최소 구현** — `src/shared/i18n.js`

```js
// 경량 UI i18n 런타임 (순수: I/O·chrome API 없음).
// 카탈로그는 setCatalogs로 주입, 저장/로딩은 호출측(팝업/콘텐츠)이 담당한다.

let catalogs = {};
let locale = 'en';

export function setCatalogs(c) {
  catalogs = c || {};
}

export function setLocale(loc) {
  locale = (loc && catalogs[loc]) ? loc : 'en';
}

export function getLocale() {
  return locale;
}

function lookup(catalog, key) {
  if (!catalog) return undefined;
  return key.split('.').reduce((o, k) => (o == null ? undefined : o[k]), catalog);
}

export function t(key, params) {
  let val = lookup(catalogs[locale], key);
  if (val == null) val = lookup(catalogs.en, key);
  if (val == null) return key;
  if (params) {
    val = String(val).replace(/\{(\w+)\}/g, (m, p) =>
      Object.prototype.hasOwnProperty.call(params, p) ? String(params[p]) : m);
  }
  return val;
}

export function applyI18n(root = document) {
  root.querySelectorAll('[data-i18n]').forEach((el) => {
    el.textContent = t(el.getAttribute('data-i18n'));
  });
  root.querySelectorAll('[data-i18n-placeholder]').forEach((el) => {
    el.setAttribute('placeholder', t(el.getAttribute('data-i18n-placeholder')));
  });
  root.querySelectorAll('[data-i18n-title]').forEach((el) => {
    el.setAttribute('title', t(el.getAttribute('data-i18n-title')));
  });
}
```

- [ ] **Step 4: 테스트 통과 확인**

Run: `node --test tests/i18n.test.mjs`
Expected: PASS — `# pass 7`, `# fail 0`

- [ ] **Step 5: 커밋**

```bash
git add src/shared/i18n.js tests/i18n.test.mjs
git commit -m "$(cat <<'EOF'
feat(i18n): 경량 UI i18n 런타임 추가

setCatalogs/setLocale/getLocale/t/applyI18n. 순수 모듈(I/O·chrome API 없음),
점경로 조회 + {param} 보간 + en 폴백. Node 단위테스트 포함.

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 2: 메시지 카탈로그 (`locales/en.json`, `locales/ko.json`)

**Files:**
- Create: `locales/en.json`, `locales/ko.json`
- Test: `tests/catalog-parity.test.js`

**Interfaces:**
- Consumes: 없음(데이터 파일).
- Produces: 두 로케일 카탈로그. 아래 키가 Task 4·6·7·8에서 참조된다.

- [ ] **Step 1: `locales/en.json` 작성**

```json
{
  "popup": {
    "subtitle": "Live subtitle translation",
    "statusWaiting": "Waiting",
    "toggleTitle": "Enable/disable translation",
    "aiProvider": "AI Provider",
    "selected": "✓ Selected",
    "apiKey": "API Key",
    "showPassword": "Show password",
    "proxyUrl": "Proxy server URL",
    "save": "Save",
    "saved": "Saved!",
    "retranslate": "Re-translate",
    "retranslating": "Re-translating...",
    "retranslateDone": "{count} re-translated!",
    "openUdemy": "Please open a Udemy course page",
    "statusChecking": "{provider} — checking connection...",
    "statusReady": "{provider} ready",
    "statusNotRunning": "{provider} not running — run `node proxy-server/server.js` in a terminal",
    "statusNeedKey": "Enter your {provider} API key"
  },
  "settings": {
    "model": "Model",
    "targetLang": "Translation",
    "displayMode": "Display",
    "uiLang": "Language"
  },
  "displayModeOptions": {
    "translation": "Translation only",
    "both": "Original + Translation",
    "original": "Original only"
  },
  "style": {
    "heading": "Subtitle style",
    "fontSize": "Font size",
    "fontColor": "Text color",
    "bgColor": "Background color",
    "bgOpacity": "Background opacity",
    "panelColor": "Panel text color",
    "use": "On",
    "none": "None",
    "udemyDefault": "Udemy default",
    "preview": "Preview",
    "previewText": "Translated subtitle preview"
  },
  "cache": {
    "title": "Cache",
    "manage": "Manage cache",
    "savedSubtitles": "Saved translations",
    "search": "Search title (course · section · lesson)",
    "selectAll": "Select all",
    "deleteSelected": "Delete selected",
    "deleteAll": "Delete all",
    "loading": "Loading...",
    "empty": "Cache is empty",
    "noResults": "No results",
    "back": "Back",
    "count": "{total} items",
    "selectedCount": "{selected} selected / {total} total",
    "subtitleCount": "{count} subtitles",
    "noCourse": "(unknown course)",
    "noSection": "(no section)",
    "noTitle": "(untitled)",
    "delCourse": "Delete all cache for this course",
    "delSection": "Delete cache for this section",
    "delLesson": "Delete cache for this lesson"
  },
  "badge": {
    "translatingTo": "Translating to {lang}"
  },
  "model": {
    "tier": {
      "fastCheap": "fast / cheap",
      "fast": "fast",
      "balanced": "balanced",
      "recommended": "recommended",
      "highQuality": "high quality"
    }
  },
  "langNames": {
    "한국어": "Korean",
    "日本語": "Japanese",
    "中文": "Chinese"
  }
}
```

- [ ] **Step 2: `locales/ko.json` 작성** (en과 동일 키, 한국어 값)

```json
{
  "popup": {
    "subtitle": "실시간 자막 번역",
    "statusWaiting": "대기 중",
    "toggleTitle": "번역 활성화/비활성화",
    "aiProvider": "AI 제공자",
    "selected": "✓ 선택됨",
    "apiKey": "API 키",
    "showPassword": "비밀번호 표시",
    "proxyUrl": "프록시 서버 URL",
    "save": "저장",
    "saved": "저장 완료!",
    "retranslate": "재번역",
    "retranslating": "재번역 중...",
    "retranslateDone": "{count}건 재번역 완료!",
    "openUdemy": "Udemy 페이지를 열어주세요",
    "statusChecking": "{provider} 연결 확인 중...",
    "statusReady": "{provider} 준비됨",
    "statusNotRunning": "{provider} 미실행 — 터미널에서 node proxy-server/server.js 실행 필요",
    "statusNeedKey": "{provider} API 키를 입력하세요"
  },
  "settings": {
    "model": "모델",
    "targetLang": "번역 언어",
    "displayMode": "표시 모드",
    "uiLang": "화면 언어"
  },
  "displayModeOptions": {
    "translation": "번역만",
    "both": "원본 + 번역 (동시)",
    "original": "원본만"
  },
  "style": {
    "heading": "번역 자막 스타일",
    "fontSize": "글자 크기",
    "fontColor": "글자 색상",
    "bgColor": "배경 색상",
    "bgOpacity": "배경 투명도",
    "panelColor": "패널 글자색",
    "use": "사용",
    "none": "없음",
    "udemyDefault": "유데미 기본",
    "preview": "미리보기",
    "previewText": "번역된 자막 미리보기"
  },
  "cache": {
    "title": "캐시",
    "manage": "캐시 관리",
    "savedSubtitles": "저장된 번역 자막",
    "search": "제목 검색 (코스·섹션·레슨)",
    "selectAll": "전체 선택",
    "deleteSelected": "선택 삭제",
    "deleteAll": "전체 삭제",
    "loading": "로딩 중...",
    "empty": "캐시가 비어 있습니다",
    "noResults": "검색 결과가 없습니다",
    "back": "뒤로",
    "count": "{total}개 항목",
    "selectedCount": "{selected}개 선택 / 전체 {total}개",
    "subtitleCount": "{count}개 자막",
    "noCourse": "(코스 미상)",
    "noSection": "(섹션 없음)",
    "noTitle": "(제목 없음)",
    "delCourse": "이 코스 캐시 전체 삭제",
    "delSection": "이 섹션 캐시 삭제",
    "delLesson": "이 레슨 캐시 삭제"
  },
  "badge": {
    "translatingTo": "{lang} 번역 중"
  },
  "model": {
    "tier": {
      "fastCheap": "빠름/저렴",
      "fast": "빠름",
      "balanced": "균형",
      "recommended": "권장",
      "highQuality": "고품질"
    }
  },
  "langNames": {
    "한국어": "한국어",
    "日本語": "일본어",
    "中文": "중국어"
  }
}
```

- [ ] **Step 3: 정합성 테스트 작성** — `tests/catalog-parity.test.js`

```js
const test = require('node:test');
const assert = require('node:assert');
const en = require('../locales/en.json');
const ko = require('../locales/ko.json');

function flatten(obj, prefix = '', out = {}) {
  for (const [k, v] of Object.entries(obj)) {
    const key = prefix ? `${prefix}.${k}` : k;
    if (v && typeof v === 'object' && !Array.isArray(v)) flatten(v, key, out);
    else out[key] = v;
  }
  return out;
}

test('en.json 과 ko.json 의 키 세트가 동일', () => {
  const ek = Object.keys(flatten(en)).sort();
  const kk = Object.keys(flatten(ko)).sort();
  assert.deepStrictEqual(ek.filter((k) => !kk.includes(k)), [], 'ko.json 누락 키');
  assert.deepStrictEqual(kk.filter((k) => !ek.includes(k)), [], 'en.json 누락 키');
});

test('모든 값이 비어있지 않은 문자열', () => {
  for (const [k, v] of Object.entries(flatten(en))) assert.ok(typeof v === 'string' && v.length, `en.${k}`);
  for (const [k, v] of Object.entries(flatten(ko))) assert.ok(typeof v === 'string' && v.length, `ko.${k}`);
});
```

- [ ] **Step 4: 테스트 통과 확인**

Run: `node --test tests/catalog-parity.test.js`
Expected: PASS — `# pass 2`, `# fail 0`

- [ ] **Step 5: 커밋**

```bash
git add locales/en.json locales/ko.json tests/catalog-parity.test.js
git commit -m "$(cat <<'EOF'
feat(i18n): en/ko 메시지 카탈로그 + 키 정합성 테스트 추가

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 3: `constants.js` — UI_LANG 키 + MODELS name/tier 분리

**Files:**
- Modify: `src/domain/constants.js` (STORAGE_KEYS L2-25, MODELS L66-83)
- Test: `tests/constants.test.mjs`

**Interfaces:**
- Consumes: `locales/en.json` (Task 2)
- Produces:
  - `STORAGE_KEYS.UI_LANG === 'uiLang'`
  - `MODELS[provider]` 각 항목이 `{ value, name, tier }` (tier ∈ en.json `model.tier` 키)

- [ ] **Step 1: 다른 곳에서 `MODELS[].label` 을 쓰는지 확인**

Run: `grep -rn "\.label" src/ popup.js background.js content.src.js`
Expected: `src/presentation/popup/settings-controller.js` 한 곳만(switchProvider). 다른 소비자가 있으면 그 파일도 Task 6에서 함께 수정 대상에 추가.

- [ ] **Step 2: 실패하는 테스트 작성** — `tests/constants.test.mjs`

```js
import test from 'node:test';
import assert from 'node:assert';
import { readFileSync } from 'node:fs';
import { MODELS, STORAGE_KEYS } from '../src/domain/constants.js';

const en = JSON.parse(readFileSync(new URL('../locales/en.json', import.meta.url)));

test('STORAGE_KEYS.UI_LANG === "uiLang"', () => {
  assert.strictEqual(STORAGE_KEYS.UI_LANG, 'uiLang');
});

test('모든 MODELS 항목이 value+name+tier, tier는 en.json에 존재', () => {
  for (const [provider, list] of Object.entries(MODELS)) {
    for (const m of list) {
      assert.ok(typeof m.value === 'string' && m.value, `${provider}: value`);
      assert.ok(typeof m.name === 'string' && m.name, `${provider}/${m.value}: name`);
      assert.ok(typeof m.tier === 'string' && m.tier, `${provider}/${m.value}: tier`);
      assert.ok(en.model.tier[m.tier], `${provider}/${m.value}: tier '${m.tier}' 없음`);
    }
  }
});
```

- [ ] **Step 3: 테스트 실패 확인**

Run: `node --test tests/constants.test.mjs`
Expected: FAIL — `UI_LANG` undefined, `m.name` undefined

- [ ] **Step 4: STORAGE_KEYS에 UI_LANG 추가** — `src/domain/constants.js`

`STYLE_EXPANDED: 'styleExpanded',` 줄 다음(닫는 `};` 앞)에 추가:

```js
  STYLE_EXPANDED: 'styleExpanded',
  UI_LANG: 'uiLang',
};
```

- [ ] **Step 5: MODELS 라벨 → name+tier 분리** — `src/domain/constants.js`

`export const MODELS = { ... };` 블록 전체를 아래로 교체:

```js
export const MODELS = {
  claude: [
    { value: 'claude-haiku-4-5-20251001', name: 'Haiku 4.5', tier: 'fastCheap' },
    { value: 'claude-sonnet-5', name: 'Sonnet 5', tier: 'balanced' },
    { value: 'claude-opus-4-8', name: 'Opus 4.8', tier: 'highQuality' },
  ],
  gemini: [
    { value: 'gemini-3.1-flash-lite', name: 'Flash-Lite 3.1', tier: 'fastCheap' },
    { value: 'gemini-3.5-flash', name: 'Flash 3.5', tier: 'recommended' },
    { value: 'gemini-3.1-pro', name: '3.1 Pro', tier: 'highQuality' },
  ],
  'claude-code': [
    { value: 'claude-sonnet-5', name: 'Sonnet 5', tier: 'fast' },
    { value: 'claude-opus-4-8', name: 'Opus 4.8', tier: 'highQuality' },
  ],
};
```

- [ ] **Step 6: 테스트 통과 확인**

Run: `node --test tests/constants.test.mjs`
Expected: PASS — `# pass 2`

- [ ] **Step 7: 커밋**

```bash
git add src/domain/constants.js tests/constants.test.mjs
git commit -m "$(cat <<'EOF'
refactor(constants): UI_LANG 저장키 추가 + MODELS 라벨 name/tier 분리

모델 옵션 라벨을 로케일별로 조립할 수 있도록 name(고정)+tier(번역키)로 분리.

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 4: `popup.html` — 문자열 키화 + 언어 선택 카드

**Files:**
- Modify: `popup.html`
- Test: `tests/popup-i18n.test.js`

**Interfaces:**
- Consumes: `locales/*.json` 키(Task 2). `settings.uiLang` 라벨, `id="uiLang"` 셀렉트.
- Produces: 모든 표기 문자열이 `data-i18n` / `data-i18n-placeholder` / `data-i18n-title` 로 표현됨. 언어 셀렉트 `#uiLang`(Task 6이 배선).

- [ ] **Step 1: 아래 표대로 `popup.html` 편집**

원칙: 각 요소의 **표기 텍스트/속성값을 제거**하고 지정 `data-i18n*` 속성을 추가한다. `value` 속성과 대상언어 옵션(`한국어`/`日本語`/`中文`)은 건드리지 않는다.

| 현재 (요소/텍스트) | 변경 |
|---|---|
| `<html lang="ko">` | `<html lang="en">` |
| `<p class="header-sub">실시간 자막 번역</p>` | `<p class="header-sub" data-i18n="popup.subtitle"></p>` |
| `<span id="statusText">대기 중</span>` | `<span id="statusText" data-i18n="popup.statusWaiting"></span>` |
| `<label class="master-toggle" title="번역 활성화/비활성화">` | `<label class="master-toggle" data-i18n-title="popup.toggleTitle">` |
| `<div class="block-label">AI 제공자</div>` | `<div class="block-label" data-i18n="popup.aiProvider"></div>` |
| `<span class="provider-check">✓ 선택됨</span>` ×3 | `<span class="provider-check" data-i18n="popup.selected"></span>` ×3 |
| `<label for="claudeApiKey" class="form-label">API Key</label>` | `<label for="claudeApiKey" class="form-label" data-i18n="popup.apiKey"></label>` |
| `<label for="geminiApiKey" class="form-label">API Key</label>` | `<label for="geminiApiKey" class="form-label" data-i18n="popup.apiKey"></label>` |
| `title="비밀번호 표시"` ×2 (toggle-vis-btn) | `data-i18n-title="popup.showPassword"` ×2 |
| `<label for="claudeCodeUrl" class="form-label">프록시 서버 URL</label>` | 추가 `data-i18n="popup.proxyUrl"`, 텍스트 제거 |
| `<span id="saveKeyText">저장</span>` | `<span id="saveKeyText" data-i18n="popup.save"></span>` |
| `<span class="setting-label">모델</span>` | `data-i18n="settings.model"`, 텍스트 제거 |
| `<span class="setting-label">번역 언어</span>` | `data-i18n="settings.targetLang"`, 텍스트 제거 |
| `<span class="setting-label">표시 모드</span>` | `data-i18n="settings.displayMode"`, 텍스트 제거 |
| `<option value="translation">번역만</option>` | `<option value="translation" data-i18n="displayModeOptions.translation"></option>` |
| `<option value="both">원본 + 번역 (동시)</option>` | `<option value="both" data-i18n="displayModeOptions.both"></option>` |
| `<option value="original">원본만</option>` | `<option value="original" data-i18n="displayModeOptions.original"></option>` |
| `<span class="style-head-label">번역 자막 스타일</span>` | `data-i18n="style.heading"`, 텍스트 제거 |
| `<label for="styleFontSize" class="form-label">글자 크기</label>` | `data-i18n="style.fontSize"`, 텍스트 제거 |
| `<label class="form-label">글자 색상</label>` | `data-i18n="style.fontColor"`, 텍스트 제거 |
| `<label class="form-label">배경 색상</label>` | `data-i18n="style.bgColor"`, 텍스트 제거 |
| `<span class="color-hex" id="bgColorHex">없음</span>` | `<span class="color-hex" id="bgColorHex"></span>` (⚠ data-i18n 넣지 말 것 — JS가 hex/None 동적 설정) |
| `<span class="pill-label">사용</span>` (bgEnabled) | `<span class="pill-label" data-i18n="style.use"></span>` |
| `<label for="styleBgOpacity" class="form-label">배경 투명도</label>` | `data-i18n="style.bgOpacity"`, 텍스트 제거 |
| `<label class="form-label">패널 글자색</label>` | `data-i18n="style.panelColor"`, 텍스트 제거 |
| `<span class="color-hex" id="panelColorHex">유데미 기본</span>` | `<span class="color-hex" id="panelColorHex"></span>` (⚠ data-i18n 넣지 말 것 — JS 동적 설정) |
| `<span class="pill-label">사용</span>` (panelColorEnabled) | `<span class="pill-label" data-i18n="style.use"></span>` |
| `<span class="preview-label">미리보기</span>` | `data-i18n="style.preview"`, 텍스트 제거 |
| `<div id="stylePreview" class="preview-text">번역된 자막 미리보기</div>` | `<div id="stylePreview" class="preview-text" data-i18n="style.previewText"></div>` |
| `<span id="retranslateText">재번역</span>` | `<span id="retranslateText" data-i18n="popup.retranslate"></span>` |
| `openCacheDialog` 버튼 안 텍스트 `캐시` | 텍스트를 `<span data-i18n="cache.title"></span>` 로 교체 (svg·cacheBadge span 유지) |
| `<h2>캐시 관리</h2>` | `<h2 data-i18n="cache.manage"></h2>` |
| `<p class="dialog-sub">저장된 번역 자막</p>` | `data-i18n="cache.savedSubtitles"`, 텍스트 제거 |
| `<input type="search" id="cacheSearch" placeholder="제목 검색 (코스·섹션·레슨)" ...>` | `placeholder` 속성 제거 후 `data-i18n-placeholder="cache.search"` 추가 |
| `<span>전체 선택</span>` | `<span data-i18n="cache.selectAll"></span>` |
| `cacheDeleteSelected` 버튼 안 텍스트 `선택 삭제` | 텍스트를 `<span data-i18n="cache.deleteSelected"></span>` 로 교체 (svg 유지) |
| `<span class="cache-count" id="cacheCount">0개</span>` | `<span class="cache-count" id="cacheCount"></span>` (JS가 채움) |
| `<button class="btn-delete-all" id="cacheDeleteAll">전체 삭제</button>` | `<button class="btn-delete-all" id="cacheDeleteAll" data-i18n="cache.deleteAll"></button>` |

- [ ] **Step 2: 언어 선택 카드 추가** — 표시 모드 setting-card 다음(=`.setting-cards` 컨테이너의 마지막 카드로) 아래 블록 삽입:

```html
        <div class="setting-card">
          <span class="setting-ic"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#B26BFF" stroke-width="2"><circle cx="12" cy="12" r="10"/><path d="M2 12h20"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/></svg></span>
          <span class="setting-label" data-i18n="settings.uiLang"></span>
          <div class="setting-select">
            <select id="uiLang">
              <option value="en">English</option>
              <option value="ko">한국어</option>
            </select>
            <svg class="chevron" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="m9 18 6-6-6-6"/></svg>
          </div>
        </div>
```

- [ ] **Step 3: 가드 테스트 작성** — `tests/popup-i18n.test.js`

```js
const test = require('node:test');
const assert = require('node:assert');
const { readFileSync } = require('node:fs');
const path = require('node:path');
const en = require('../locales/en.json');
const ko = require('../locales/ko.json');

const html = readFileSync(path.join(__dirname, '..', 'popup.html'), 'utf8');

function flatten(obj, prefix = '', out = {}) {
  for (const [k, v] of Object.entries(obj)) {
    const key = prefix ? `${prefix}.${k}` : k;
    if (v && typeof v === 'object' && !Array.isArray(v)) flatten(v, key, out);
    else out[key] = v;
  }
  return out;
}
const enKeys = new Set(Object.keys(flatten(en)));
const koKeys = new Set(Object.keys(flatten(ko)));

test('popup.html 의 모든 data-i18n* 키가 양 카탈로그에 존재', () => {
  const re = /data-i18n(?:-placeholder|-title)?="([^"]+)"/g;
  const keys = [...html.matchAll(re)].map((m) => m[1]);
  assert.ok(keys.length > 20, `data-i18n 키가 너무 적음: ${keys.length}`);
  for (const k of keys) {
    assert.ok(enKeys.has(k), `키 '${k}' 가 en.json 에 없음`);
    assert.ok(koKeys.has(k), `키 '${k}' 가 ko.json 에 없음`);
  }
});
```

- [ ] **Step 4: 테스트 통과 확인**

Run: `node --test tests/popup-i18n.test.js`
Expected: PASS — `# pass 1` (실패 시 누락 키 이름이 출력되므로 해당 키를 표에 맞게 교정)

- [ ] **Step 5: 커밋**

```bash
git add popup.html tests/popup-i18n.test.js
git commit -m "$(cat <<'EOF'
feat(i18n): popup.html 표기 문자열 키화 + 화면 언어 선택 카드 추가

모든 표기 텍스트를 data-i18n* 속성으로 대체(하드코딩 제거).
설정 카드 맨 아래에 화면 언어 셀렉트(#uiLang) 추가.

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 5: `popup.js` — 카탈로그 등록 + 로케일 초기화

**Files:**
- Modify: `popup.js`

**Interfaces:**
- Consumes: `setCatalogs/setLocale/applyI18n`(Task 1), `locales/*.json`(Task 2), `STORAGE_KEYS.UI_LANG`(Task 3), `popup.html` data-i18n(Task 4)
- Produces: 팝업 오픈 시 카탈로그 등록 + 저장 로케일 적용 + 정적 텍스트 채움. 이후 컨트롤러가 `t()` 사용.

- [ ] **Step 1: `popup.js` 상단 import 추가** (기존 3개 import 아래)

```js
import { initStylePreview } from './src/presentation/popup/style-preview.js';
import { initCacheDialog } from './src/presentation/popup/cache-dialog.js';
import { initSettingsController } from './src/presentation/popup/settings-controller.js';
import en from './locales/en.json' with { type: 'json' };
import ko from './locales/ko.json' with { type: 'json' };
import { setCatalogs, setLocale, applyI18n } from './src/shared/i18n.js';
import { STORAGE_KEYS } from './src/domain/constants.js';
```

- [ ] **Step 2: DOMContentLoaded 핸들러 최상단에 i18n 초기화 추가**

`document.addEventListener('DOMContentLoaded', async () => {` 바로 다음, `// 스타일 미리보기 초기화` 앞에 삽입:

```js
  // i18n 초기화 (다른 모든 t()/applyI18n 사용보다 먼저)
  setCatalogs({ en, ko });
  const uiLangStored = await chrome.storage.local.get(STORAGE_KEYS.UI_LANG);
  setLocale(uiLangStored[STORAGE_KEYS.UI_LANG]); // 값 없으면 'en' 폴백
  applyI18n(document);
```

- [ ] **Step 3: 정적 검증 (문법)**

Run: `node --check popup.js`
Expected: 출력 없음(성공). 오류 시 import 구문 수정.

> 참고: `with { type: 'json' }` import는 브라우저/Node 22 런타임에서만 완전 검증된다. 실동작은 Task 10 수동 체크리스트에서 확인.

- [ ] **Step 4: 커밋**

```bash
git add popup.js
git commit -m "$(cat <<'EOF'
feat(i18n): popup.js 카탈로그 등록 + 로케일 초기화 + applyI18n

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 6: `settings-controller.js` — 동적 t() + 모델 라벨 + 언어 셀렉트

**Files:**
- Modify: `src/presentation/popup/settings-controller.js`

**Interfaces:**
- Consumes: `t/applyI18n/setLocale/getLocale`(Task 1), `STORAGE_KEYS.UI_LANG`·`MODELS[].name/tier`(Task 3), `#uiLang` 셀렉트(Task 4)
- Produces: 팝업 동적 문구 로케일 반영, 모델 옵션 라벨 로케일 조립, 언어 전환 즉시 반영.

- [ ] **Step 1: import 추가** (파일 상단 기존 import 아래)

```js
import { t, applyI18n, setLocale, getLocale } from '../../shared/i18n.js';
```

- [ ] **Step 2: 모델 옵션 라벨 조립 변경** — `switchProvider` 내부

기존:
```js
    const models = MODELS[provider];
    modelSelect.innerHTML = models.map(m =>
      `<option value="${m.value}">${m.label}</option>`
    ).join('');
```
변경:
```js
    const models = MODELS[provider];
    modelSelect.innerHTML = models.map(m =>
      `<option value="${m.value}">${m.name} (${t('model.tier.' + m.tier)})</option>`
    ).join('');
```

- [ ] **Step 3: 저장/재번역/상태 동적 문구를 t()로 교체**

- API 키 저장 핸들러:
```js
    saveKeyText.textContent = '';
    saveStatus.textContent = t('popup.saved');
    updateStatus();
    setTimeout(() => {
      saveKeyText.textContent = t('popup.save');
      saveStatus.textContent = '';
    }, 2000);
```
- 재번역 핸들러 내부:
```js
    retranslateText.textContent = t('popup.retranslating');
```
```js
        retranslateText.textContent = t('popup.retranslateDone', { count });
      } else {
        retranslateText.textContent = t('popup.openUdemy');
      }
    } catch (_) {
      retranslateText.textContent = t('popup.openUdemy');
    }

    setTimeout(() => {
      retranslateBtn.disabled = false;
      retranslateBtn.classList.remove('btn-loading');
      retranslateText.textContent = t('popup.retranslate');
    }, 2500);
```
- `updateBgVisibility`:
```js
  function updateBgVisibility() {
    const on = bgEnabledCheck.checked;
    bgColorHex.textContent = on ? bgColorPicker.value : t('style.none');
    bgOpacityGroup.style.display = on ? '' : 'none';
  }
```
- `updatePanelColorHex`:
```js
  function updatePanelColorHex() {
    panelColorHex.textContent = panelColorEnabledCheck.checked
      ? panelColorPicker.value
      : t('style.udemyDefault');
  }
```
- `updateStatus` (provider 상태 문자열):
```js
    if (currentProvider === 'claude-code') {
      statusDot.className = 'status-dot';
      statusText.textContent = t('popup.statusChecking', { provider: providerName });

      const ccUrl = claudeCodeUrlInput.value.trim() || 'http://localhost:3456';
      const connected = await checkClaudeCodeConnection(ccUrl);

      if (connected) {
        statusDot.className = 'status-dot connected';
        statusText.textContent = t('popup.statusReady', { provider: providerName });
      } else {
        statusDot.className = 'status-dot error';
        statusText.textContent = t('popup.statusNotRunning', { provider: providerName });
      }
    } else {
      const keyInput = currentProvider === 'claude' ? claudeApiKeyInput : geminiApiKeyInput;
      const hasKey = keyInput.value.trim().length > 0;
      if (!hasKey) {
        statusDot.className = 'status-dot error';
        statusText.textContent = t('popup.statusNeedKey', { provider: providerName });
      } else {
        statusDot.className = 'status-dot connected';
        statusText.textContent = t('popup.statusReady', { provider: providerName });
      }
    }
```

- [ ] **Step 4: 언어 셀렉트 초기값 + 전환 핸들러 추가** — 다른 이벤트 리스너들과 같은 위치(예: `displayModeSelect` 리스너 다음)에 추가

```js
  // 화면 언어(UI locale) 셀렉트
  const uiLangSelect = $('uiLang');
  uiLangSelect.value = getLocale(); // popup.js가 이미 setLocale 완료
  uiLangSelect.addEventListener('change', async () => {
    setLocale(uiLangSelect.value);
    await chrome.storage.local.set({ [STORAGE_KEYS.UI_LANG]: uiLangSelect.value });
    applyI18n(document);                                  // 정적 텍스트
    switchProvider(currentProvider, modelSelect.value);    // 모델 라벨 재조립(선택 유지)
    updateStatus();                                        // 상태 문구
    updateBgVisibility();                                  // 배경 hex/None
    updatePanelColorHex();                                 // 패널색 hex/기본
  });
```

- [ ] **Step 5: 문법 검증**

Run: `node --check src/presentation/popup/settings-controller.js`
Expected: 출력 없음(성공)

- [ ] **Step 6: 전체 테스트 재확인(회귀 없음)**

Run: `node --test tests/`
Expected: 모든 테스트 PASS

- [ ] **Step 7: 커밋**

```bash
git add src/presentation/popup/settings-controller.js
git commit -m "$(cat <<'EOF'
feat(i18n): settings-controller 동적 문구 t() + 모델 라벨 조립 + 언어 셀렉트

화면 언어 전환 시 정적/동적/모델라벨/상태 즉시 재렌더.

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 7: `cache-dialog.js` — 동적 t()

**Files:**
- Modify: `src/presentation/popup/cache-dialog.js`

**Interfaces:**
- Consumes: `t`(Task 1), `cache.*` 키(Task 2)
- Produces: 캐시 다이얼로그 문구 로케일 반영(다이얼로그는 오픈 시마다 재렌더되므로 전환 후 다음 오픈에 자동 반영).

- [ ] **Step 1: import 추가** (기존 `import { escapeHtml }` 아래)

```js
import { t } from '../../shared/i18n.js';
```

- [ ] **Step 2: 하드코딩 문구를 t()로 교체** (해당 라인)

- `courseOf`/`sectionOf`:
```js
  const courseOf = (it) => it.course || t('cache.noCourse');
  const sectionOf = (it) => it.section || t('cache.noSection');
```
- `openCacheDialog` 로딩 표시(innerHTML 내 `로딩 중...`):
```js
    cacheList.innerHTML = '<div class="cache-empty"><svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/></svg>' + t('cache.loading') + '</div>';
```
- `render` 빈 캐시 분기: `캐시가 비어 있습니다` → `' + t('cache.empty') + '`, 그리고 `cacheCount.textContent = '0개 항목';` →
```js
      cacheCount.textContent = t('cache.count', { total: 0 });
```
  (빈 상태 innerHTML의 마지막 텍스트 노드를 `'<...svg...>' + t('cache.empty') + '</div>'` 형태로 교체)
- `renderSearch` 결과 없음: `검색 결과가 없습니다` → `' + t('cache.noResults') + '`
- 자막 개수 태그(`renderSearch`·`renderLectures` 각 1회): `${item.count}개 자막` →
```js
            <span class="cache-item-tag">${t('cache.subtitleCount', { count: item.count })}</span>
```
- 레슨 제목 폴백(`renderSearch`·`renderLectures`): `item.lecture || '(제목 없음)'` → `item.lecture || t('cache.noTitle')`
- 개별 레슨 삭제 title(`renderSearch`·`renderLectures`): `title="이 레슨 캐시 삭제"` → `title="${t('cache.delLesson')}"`
- `navBar` 뒤로: `<span>뒤로</span>` → `<span>${t('cache.back')}</span>`
- `renderCourses` 코스 삭제: `trashBtn(..., '이 코스 캐시 전체 삭제')` → `trashBtn(..., t('cache.delCourse'))`
- `renderSections` 섹션 삭제: `trashBtn(..., '이 섹션 캐시 삭제')` → `trashBtn(..., t('cache.delSection'))`
- `updateFooter` 카운트:
```js
    cacheCount.textContent = selected > 0 ? t('cache.selectedCount', { selected, total }) : t('cache.count', { total });
```

- [ ] **Step 3: 잔존 한글 문자열 리터럴 확인**

Run: `grep -n "[가-힣]" src/presentation/popup/cache-dialog.js`
Expected: 주석 라인만 남음(코드 문자열 리터럴에 한글 없음). 남은 리터럴이 있으면 교체.

- [ ] **Step 4: 문법 검증**

Run: `node --check src/presentation/popup/cache-dialog.js`
Expected: 출력 없음(성공)

- [ ] **Step 5: 커밋**

```bash
git add src/presentation/popup/cache-dialog.js
git commit -m "$(cat <<'EOF'
feat(i18n): cache-dialog 동적 문구 t() 적용

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 8: `badge-manager.js` — 배지 t() + langNames

**Files:**
- Modify: `src/presentation/content/badge-manager.js`

**Interfaces:**
- Consumes: `t`(Task 1), `badge.translatingTo`·`langNames.*` 키(Task 2)
- Produces: `setBadgeLang(l?)` — 인자 있으면 대상언어 갱신, 없으면 현재 대상언어 유지한 채 현재 UI 로케일로 배지 문구 재렌더.

- [ ] **Step 1: import 추가** (파일 상단, MARK_SVG 선언 앞)

```js
import { t } from '../../shared/i18n.js';
```

- [ ] **Step 2: 배지 문구 조립 헬퍼 추가 + build/setBadgeLang 수정**

`let lang = '한국어';` 는 유지. `build()`/`setBadgeLang()`를 아래처럼 변경하고 `badgeText()` 헬퍼 추가:

```js
function badgeText() {
  const nameKey = 'langNames.' + lang;
  const name = t(nameKey);
  // t()가 키를 그대로 돌려주면(미매핑) 원본 엔도님 사용
  const display = name === nameKey ? lang : name;
  return t('badge.translatingTo', { lang: display });
}

function build() {
  const el = document.createElement('div');
  el.className = 'udemy-translator-badge';
  el.innerHTML = `${MARK_SVG}<span class="utb-text"></span><span class="utb-dot"></span>`;
  el.querySelector('.utb-text').textContent = badgeText();
  return el;
}
```

`setBadgeLang` 변경(인자 없으면 현재 대상언어 유지):
```js
export function setBadgeLang(l) {
  if (l) lang = l;
  if (badgeEl) badgeEl.querySelector('.utb-text').textContent = badgeText();
}
```

- [ ] **Step 3: 문법 검증**

Run: `node --check src/presentation/content/badge-manager.js`
Expected: 출력 없음(성공)

- [ ] **Step 4: 커밋**

```bash
git add src/presentation/content/badge-manager.js
git commit -m "$(cat <<'EOF'
feat(i18n): 배지 문구 t() + langNames 매핑 (UI 로케일 반영)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 9: `content.src.js` — 카탈로그 등록 + onChanged uiLang + content.js 재번들

**Files:**
- Modify: `content.src.js`
- Regenerate: `content.js` (esbuild 번들 산출물)

**Interfaces:**
- Consumes: `setCatalogs/setLocale`(Task 1), `locales/*.json`(Task 2), `STORAGE_KEYS.UI_LANG`(Task 3), `setBadgeLang`(Task 8)
- Produces: 콘텐츠 스크립트가 UI 로케일을 로드/추적하고, uiLang 변경 시 배지 즉시 재렌더.

- [ ] **Step 1: import 추가 + 카탈로그 등록** — `content.src.js`

기존 import 블록 끝(`import { setBadgeEnabled, setBadgeLang } ...` 다음)에 추가:
```js
import en from './locales/en.json';
import ko from './locales/ko.json';
import { setCatalogs, setLocale } from './src/shared/i18n.js';

setCatalogs({ en, ko });
```

- [ ] **Step 2: onChanged 리스너에 uiLang 분기 추가** — `TARGET_LANG` 분기 다음에

```js
  if (changes[STORAGE_KEYS.TARGET_LANG]) {
    setActiveLang(changes[STORAGE_KEYS.TARGET_LANG].newValue);
    setBadgeLang(changes[STORAGE_KEYS.TARGET_LANG].newValue);
  }

  if (changes[STORAGE_KEYS.UI_LANG]) {
    setLocale(changes[STORAGE_KEYS.UI_LANG].newValue);
    setBadgeLang(); // 대상언어 유지, UI 로케일만 반영해 재렌더
  }
```

- [ ] **Step 3: 시작 블록에서 UI 로케일 로드** — `loadStyle().then(async () => { ... })` 내부

기존:
```js
  const s = await chrome.storage.local.get([STORAGE_KEYS.ENABLED, STORAGE_KEYS.TARGET_LANG]);
  setActiveLang(s[STORAGE_KEYS.TARGET_LANG]);
  setBadgeLang(s[STORAGE_KEYS.TARGET_LANG]);
  setBadgeEnabled(s[STORAGE_KEYS.ENABLED]);
```
변경:
```js
  const s = await chrome.storage.local.get([STORAGE_KEYS.ENABLED, STORAGE_KEYS.TARGET_LANG, STORAGE_KEYS.UI_LANG]);
  setLocale(s[STORAGE_KEYS.UI_LANG]); // 배지 문구 생성보다 먼저 (값 없으면 'en')
  setActiveLang(s[STORAGE_KEYS.TARGET_LANG]);
  setBadgeLang(s[STORAGE_KEYS.TARGET_LANG]);
  setBadgeEnabled(s[STORAGE_KEYS.ENABLED]);
```

- [ ] **Step 4: content.js 재번들**

Run: `npx esbuild content.src.js --bundle --outfile=content.js`
Expected: 오류 없이 완료. `content.js`에 `translatingTo`/`langNames` 문자열이 인라인됨.

- [ ] **Step 5: 번들에 카탈로그 인라인 확인**

Run: `grep -c "translatingTo" content.js`
Expected: `1` 이상(양수)

- [ ] **Step 6: 문법 검증**

Run: `node --check content.src.js && node --check content.js`
Expected: 출력 없음(성공)

- [ ] **Step 7: 커밋** (소스 + 번들 함께)

```bash
git add content.src.js content.js
git commit -m "$(cat <<'EOF'
feat(i18n): content 카탈로그 등록 + uiLang 변경 시 배지 재렌더 + 재번들

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 10: `build-extension.sh` — locales 패키징 + 전체 검증

**Files:**
- Modify: `build-extension.sh`

**Interfaces:**
- Consumes: 전 태스크 산출물.
- Produces: `locales/`가 배포 zip에 포함되고, 테스트 파일은 배제됨. 확장이 로드 가능한 상태.

- [ ] **Step 1: 스테이징에 locales 복사 추가** — `cp -R src "$STAGE"/src` 다음 줄에

```bash
cp -R src "$STAGE"/src
cp -R locales "$STAGE"/locales
```

- [ ] **Step 2: 테스트 파일 배제 안전장치 추가** — `find "$STAGE" -name ".DS_Store" -delete` 다음 줄에

```bash
find "$STAGE" -name ".DS_Store" -delete
find "$STAGE" -name "*.test.*" -delete
```

- [ ] **Step 3: 전체 테스트 스위트 실행**

Run: `node --test tests/`
Expected: 모든 파일 PASS, `# fail 0`

- [ ] **Step 4: 대상 파일 잔존 한글 리터럴 점검** (주석 제외 육안 확인)

Run: `grep -n "[가-힣]" popup.html src/presentation/popup/settings-controller.js src/presentation/popup/cache-dialog.js src/presentation/content/badge-manager.js`
Expected: 남는 한글은 (a) `popup.html`의 대상언어/화면언어 옵션 엔도님(`한국어`), (b) JS 파일의 주석/기본값(`let lang = '한국어'`)뿐. UI 표기용 리터럴이 남아 있으면 교체.

- [ ] **Step 5: 빌드 실행 + 패키지 검증**

Run: `./build-extension.sh`
Expected: `✅ 완료: ...zip`. 이어서 zip 내 locales 포함 + 테스트 배제 확인:

Run: `unzip -l udemy-ai-translator-*.zip | grep -E "locales/|\.test\."`
Expected: `locales/en.json`·`locales/ko.json` 표시, `.test.` 파일은 **없음**.

- [ ] **Step 6: 수동 검증 체크리스트** (Chrome `chrome://extensions` → 압축해제 로드 또는 zip 로드)

- [ ] 기본 설치 시 팝업 UI가 **영어**로 표시된다.
- [ ] 팝업 "Language" 셀렉트에서 한국어 선택 시 **즉시** 라벨·상태·버튼이 한국어로 바뀐다(새로고침 불필요).
- [ ] 다시 English 선택 시 즉시 영어로 복귀.
- [ ] 캐시 다이얼로그를 열면 선택 언어로 표시(카운트/빈상태/검색 placeholder 포함).
- [ ] 모델 드롭다운 등급 라벨이 언어에 맞게 표시(예: `Sonnet 5 (balanced)` ↔ `Sonnet 5 (균형)`).
- [ ] Udemy 강의 페이지에서 자막 재생 시 배지 문구가 UI 언어에 맞게 표시(`Translating to Korean` ↔ `한국어 번역 중`). 팝업에서 언어 전환 시 배지도 갱신.
- [ ] 팝업 재오픈·페이지 새로고침 후에도 선택한 언어가 유지된다.
- [ ] `번역 언어` 드롭다운 옵션(한국어/日本語/中文)은 그대로 엔도님 유지.

- [ ] **Step 7: 커밋**

```bash
git add build-extension.sh
git commit -m "$(cat <<'EOF'
chore(build): locales 패키징 + 테스트 파일 배제

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Self-Review 결과 (플랜↔스펙 대조)

- **스펙 커버리지**: §5 런타임→T1, §6 카탈로그→T2, §6.2 모델 tier→T3, 배지 langNames→T8, §7 파일별 교체→T4/6/7/8, §8 로딩·전환→T5/6/9, §9 셀렉트 위치→T4, §10 지속성→T3/5/9, §11 빌드→T10, §12 테스트→T1/2/3/4+T10. 누락 없음.
- **placeholder 스캔**: TBD/TODO/"적절히 처리" 없음. 모든 코드 단계에 실제 코드 포함.
- **타입/이름 일관성**: `setCatalogs/setLocale/getLocale/t/applyI18n` 시그니처가 T1 정의 ↔ T5/6/8/9 사용에서 일치. `STORAGE_KEYS.UI_LANG`(=`'uiLang'`), `MODELS[].name/tier`, `setBadgeLang(l?)` 규약 일치. 카탈로그 키(점경로, 리터럴 점 없음)와 참조 일치.
- **스펙 대비 정제**: 스펙 예시 JSON의 `settings.displayMode.translation`(리터럴 점 키)은 점경로 조회와 충돌하므로 `displayModeOptions.*` 중첩 키로 교정함(설계 의도 동일).
