# UI 언어 옵션 (i18n) 설계

- **날짜**: 2026-07-23
- **상태**: 승인됨 (구현 플랜 작성 대기)
- **대상**: Udemy AI 번역기 확장 프로그램의 **UI 표기 언어**를 사용자가 선택할 수 있게 한다.

---

## 1. 목표

확장의 **UI 패널(기능을 사용하기 위한 인터페이스) 표기 언어**를 사용자가 옵션으로 전환할 수 있게 한다. 현재 UI는 한국어로 하드코딩되어 있다. 이를 **한국어 / 영어 2개 로케일**로 전환 가능하게 만들고, **기본값은 영어**로 한다.

핵심 원칙:
- **한글 하드코딩 제거** — 모든 사용자 표기 문자열은 처음부터 카탈로그(JSON)에서 꺼내 표현한다. HTML/JS에 표기 문자열 리터럴을 두지 않는다.
- **즉시 전환** — 옵션에서 언어를 바꾸면 새로고침 없이 바로 반영된다.
- **선택 유지** — 선택한 언어는 저장되어 다음에도 유지된다.

## 2. 비목표 / 범위 경계 (명시적 제외)

다음은 이 작업의 대상이 **아니다**:

- ❌ **자막 번역 콘텐츠** — "무슨 언어로 자막을 번역할지"는 앱의 기능이며 UI 언어와 무관하다.
- ❌ **번역 대상 언어 드롭다운의 옵션 라벨**(`한국어` / `日本語` / `中文`) — 언어 선택기 관례에 따라 **엔도님(자기 언어 표기) 그대로 유지**한다.
- ❌ `DEFAULT_TARGET_LANG`(`'한국어'`) 등 번역 파이프라인 데이터.
- ❌ 코드 주석 / JSDoc — 개발자용, 사용자에게 보이지 않음.
- ❌ 프롬프트 빌더 / 언어 감지 / 응답 파서 등 내부 로직 문자열.
- ❌ `proxy-server/*` 서버 로그, `docs/export/*` 스토어 마케팅 HTML.
- ❌ `console.log` 등 디버그 로그.

## 3. 요구사항 (합의된 결정)

| 항목 | 결정 |
|---|---|
| 지원 언어 | 한국어(`ko`) + 영어(`en`) 2개. 구조는 로케일 추가가 쉽게 하되 사전은 2개만 채운다. |
| 기본값 | **항상 영어(`en`)**. 첫 실행 시 저장값이 없으면 `en`. |
| 대상 표면 | (1) 팝업 설정 패널, (2) 영상 위 "번역 중" 배지. |
| 전환 방식 | 팝업 내 셀렉트 박스로 선택, **즉시 반영**. |
| 지속성 | `chrome.storage.local`에 저장, 재방문 시 유지. |
| 셀렉트 위치 | **설정 카드 스택의 맨 아래**(모델/번역언어/표시모드 다음), 지구본 아이콘. |

## 4. 접근법 결정

**채택: JSON 카탈로그 + 경량 `t()` 런타임 + `data-i18n` 바인딩 + `uiLang` 저장키.**

`chrome.i18n`(네이티브)을 **쓰지 않는** 이유: 네이티브 API는 로케일이 *브라우저 UI 언어*로 고정되어, 사용자가 드롭다운으로 런타임 전환하는 기능을 제공하지 않는다. "영어 기본 + 선택 토글 + 즉시 전환" 요구를 충족하려면 어차피 커스텀 레이어가 필요하므로 네이티브의 이점이 없다.

문자열을 **JS 객체가 아니라 JSON 파일**로 두는 이유: 데이터(문구)와 코드(런타임)를 분리하여, 코드 수정 없이 문구만 편집/검수/추가할 수 있게 한다. content 번들은 esbuild가 JSON을 동기 인라인하므로 런타임 비용이 없다.

## 5. 아키텍처

### 5.1 파일 구성

```
locales/
  en.json              ← 영어 문구 (기본, 단일 소스 오브 트루스)
  ko.json              ← 한국어 문구 (en.json과 동일 키 세트)
src/shared/
  i18n.js              ← 순수 런타임 (I/O·chrome API 없음)
  i18n.test.js         ← 단위 테스트
```

### 5.2 런타임 API (`src/shared/i18n.js`)

`i18n.js`는 **순수 모듈**이다 — JSON을 직접 import하지 않고, `chrome.*`도 호출하지 않는다. 카탈로그는 주입받고, 저장/로딩 배선은 진입점(팝업/콘텐츠)이 담당한다. 이렇게 하면 Node에서 카탈로그를 평범한 객체로 주입해 단위 테스트할 수 있고, "JSON을 어떻게 로드하느냐"라는 표면별 차이를 런타임 밖으로 격리한다.

```js
setCatalogs({ en, ko })   // 로케일 → 카탈로그 맵 등록
setLocale(locale)         // 현재 로케일 설정 (인메모리). 미지원/누락 시 'en'으로 폴백
getLocale()               // 현재 로케일 반환
t(key, params)            // 점(dot) 키 조회 → {param} 치환 → 반환
                          //   조회 순서: 현재 로케일 → en 폴백 → 키 문자열 그대로 반환
applyI18n(root = document)// [data-i18n](textContent),
                          // [data-i18n-placeholder](placeholder),
                          // [data-i18n-title](title) 요소를 순회하여 채운다
```

- **점 키 조회**: `t('cache.empty')` → `catalog.cache.empty`.
- **보간**: 카탈로그 문자열의 `{name}` 토큰을 `params.name`으로 치환. 예: `t('popup.retranslateDone', { count: 3 })`.
- **폴백**: 현재 로케일에 키가 없으면 `en`에서 찾고, 그래도 없으면 키 문자열을 그대로 반환(개발 중 누락 즉시 눈에 띔).

### 5.3 카탈로그 등록 (표면별 로딩)

`i18n.js`가 JSON을 직접 import하지 않으므로, 각 진입점이 자기 방식으로 로드해 `setCatalogs`로 등록한다. 이로써 esbuild의 import-attribute 호환성 이슈를 회피하고 브라우저 네이티브 요구사항을 동시에 만족한다.

- **팝업(`popup.js`, 번들 아님·네이티브 ESM)**: 브라우저는 JSON 모듈에 attribute를 요구한다.
  ```js
  import en from './locales/en.json' with { type: 'json' };
  import ko from './locales/ko.json' with { type: 'json' };
  setCatalogs({ en, ko });
  ```
- **콘텐츠(`content.src.js`, esbuild 번들)**: esbuild 기본 JSON 로더가 인라인한다(attribute 불필요).
  ```js
  import en from './locales/en.json';
  import ko from './locales/ko.json';
  setCatalogs({ en, ko });
  ```
- **테스트(`i18n.test.js`, Node)**: 평범한 객체를 주입.
  ```js
  setCatalogs({ en: { a: 'A {x}' }, ko: { a: '가 {x}' } });
  ```

## 6. 메시지 카탈로그 설계

### 6.1 구조 (중첩 점 키 + `{param}` 보간)

`en.json` 예시(대표 키만; 전체 문자열 인벤토리는 구현 플랜에서 파일별로 열거):

```jsonc
{
  "popup": {
    "subtitle": "Live subtitle translation",
    "save": "Save",
    "saved": "Saved!",
    "retranslate": "Re-translate",
    "retranslating": "Re-translating…",
    "retranslateDone": "{count} re-translated!",
    "openUdemy": "Please open a Udemy course page",
    "statusWaiting": "Waiting",
    "statusChecking": "{provider} — checking connection…",
    "statusReady": "{provider} ready",
    "statusNotRunning": "{provider} not running — run `node proxy-server/server.js` in a terminal",
    "statusNeedKey": "Enter your {provider} API key",
    "aiProvider": "AI Provider",
    "selected": "Selected",
    "proxyUrl": "Proxy server URL",
    "apiKey": "API Key"
  },
  "settings": {
    "model": "Model",
    "targetLang": "Translation",
    "displayMode": "Display",
    "uiLang": "Language",
    "displayMode.translation": "Translation only",
    "displayMode.both": "Original + Translation",
    "displayMode.original": "Original only"
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
    "loading": "Loading…",
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
  "badge": { "translatingTo": "Translating to {lang}" },
  "model": {
    "tier": {
      "fastCheap": "fast / cheap",
      "fast": "fast",
      "balanced": "balanced",
      "recommended": "recommended",
      "highQuality": "high quality"
    }
  },
  "langNames": { "한국어": "Korean", "日本語": "Japanese", "中文": "Chinese" }
}
```

`ko.json`은 동일 키에 한국어 값. 예: `badge.translatingTo` = `"{lang} 번역 중"`, `langNames`는 `{ "한국어": "한국어", "日本語": "일본어", "中文": "중국어" }`.

### 6.2 까다로운 케이스

- **배지 문구**: 현재 `` `${targetLang} 번역 중` ``에서 `targetLang`은 대상 언어 엔도님(`한국어`/`日本語`/`中文`)이다. 영어 UI에서 "Translating to 한국어"는 어색하므로 `langNames` 맵으로 표시명을 변환한 뒤 `t('badge.translatingTo', { lang: displayName })`로 조립한다. 어순 차이는 템플릿이 흡수한다(ko: `"{lang} 번역 중"`, en: `"Translating to {lang}"`).
- **모델 라벨 분리**: `constants.js`의 `MODELS`는 라벨에 한국어 등급이 섞여 있다(`'Haiku 4.5 (빠름/저렴)'`). 이를 `{ value, name, tier }` 형태로 분리한다:
  ```js
  { value: 'claude-haiku-4-5-20251001', name: 'Haiku 4.5', tier: 'fastCheap' }
  ```
  옵션 라벨은 렌더 시점에 `` `${name} (${t('model.tier.' + tier)})` ``로 조립한다(팝업 `settings-controller.switchProvider`).
- **번역 대상 언어 옵션**(`한국어`/`日本語`/`中文`): 값·라벨 모두 **변경하지 않는다**(엔도님 유지).

## 7. 문자열 교체 범위 (파일별)

| 파일 | 처리 |
|---|---|
| `popup.html` | 정적 표기 문자열 전부 → `data-i18n` / `data-i18n-placeholder` / `data-i18n-title` 키로 교체(리터럴 제거). `<html lang>`는 기본 `en`. |
| `popup.js` | 초기화 시 카탈로그 등록 + 저장 로케일 적용 + `applyI18n` (§8.1). |
| `src/presentation/popup/settings-controller.js` | 동적 문구(저장/상태/재번역/`없음`/`유데미 기본`/provider 상태) → `t()`. 모델 옵션 라벨 조립. 언어 셀렉트 `change` 핸들러 추가. |
| `src/presentation/popup/cache-dialog.js` | 카운트/빈 상태/검색/뒤로/삭제 title/`(코스 미상)` 등 → `t()`. |
| `src/presentation/content/badge-manager.js` | `` `${lang} 번역 중` `` → `t('badge.translatingTo', { lang })` (+ `langNames` 변환). |
| `src/domain/constants.js` | `MODELS` 라벨을 `name` + `tier`로 분리. |
| `content.src.js` | 카탈로그 등록 + 시작 시 `uiLang` 로드 + `storage.onChanged`에 `uiLang` 분기 추가(§8.2). |
| `build-extension.sh` | 스테이징에 `cp -R locales "$STAGE"/locales` 추가. |

**제외**(§2): 주석/JSDoc, 프롬프트·언어감지·파서 로직, `DEFAULT_TARGET_LANG`, `proxy-server`, `docs`, 콘솔 로그.

## 8. 로딩 & 실시간 전환 흐름

### 8.1 팝업

1. `DOMContentLoaded` 최상단에서 `setCatalogs({ en, ko })`.
2. `chrome.storage.local.get('uiLang')` → `setLocale(uiLang || 'en')`.
3. `applyI18n(document)`로 정적 텍스트 채움.
4. 이후 기존 컨트롤러(`initSettingsController` 등) 초기화 — 동적 문구는 `t()` 사용.
5. **언어 셀렉트 `change`**: `setLocale(value)` → `storage.set({ uiLang: value })` → `applyI18n(document)` 재적용 + 화면에 떠 있는 동적 문구 재렌더(`updateStatus()` 재호출 등). 캐시 다이얼로그는 열 때마다 재렌더되므로 자동 반영.

초기화 순서 보장: 카탈로그 등록·`setLocale`이 `t()`를 쓰는 어떤 코드보다 **먼저** 실행되어야 한다.

### 8.2 콘텐츠 스크립트

1. `content.src.js`가 상단에서 `setCatalogs`(동기, 인라인된 JSON).
2. 기존 시작 블록(`loadStyle().then(...)`)에서 `uiLang` 로드 → `setLocale` → `setBadgeLang(targetLang)`가 `t()`로 배지 문구 생성.
3. 기존 `chrome.storage.onChanged` 리스너에 분기 추가:
   ```js
   if (changes[STORAGE_KEYS.UI_LANG]) {
     setLocale(changes[STORAGE_KEYS.UI_LANG].newValue);
     setBadgeLang(currentTargetLang); // 배지 문구 즉시 재렌더
   }
   ```

## 9. UI: 언어 선택기

- **위치**: `.setting-cards` 스택의 **마지막 카드**(표시 모드 다음).
- **아이콘**: 지구본(globe) SVG.
- **라벨**: `data-i18n="settings.uiLang"`.
- **셀렉트**: `id="uiLang"`, 옵션 = `English`(value `en`) / `한국어`(value `ko`). 옵션 라벨은 각 언어 엔도님으로 **고정 표기**(로케일과 무관하게 English/한국어) — 언어 선택기 관례.

## 10. 지속성 & 기본값

- `STORAGE_KEYS.UI_LANG = 'uiLang'` 추가(`src/domain/constants.js`).
- 저장값 없음 → `'en'`.
- `setLocale`은 미지원 로케일 값이 들어와도 `'en'`으로 안전 폴백.
- `<html lang>`는 정적으로 `en`(선택적으로 전환 시 갱신 — 낮은 우선순위).

## 11. 빌드

- `content.js`는 esbuild가 `content.src.js`를 번들할 때 JSON을 **인라인**하므로, 콘텐츠 측은 별도 로케일 파일 배포가 불필요하다.
- 팝업은 네이티브 ESM import(attribute)로 `locales/*.json`을 로드하므로 **패키지에 `locales/` 포함 필요**.
  - 팝업은 확장 페이지이므로 `web_accessible_resources` 등록은 **불필요**(웹페이지 노출용이 아님).
- `build-extension.sh` 스테이징에 `cp -R locales "$STAGE"/locales` 한 줄 추가.

## 12. 테스트

- **`src/shared/i18n.test.js`** (Node, 기존 `proxy-server/*.test.js`와 동일 방식):
  - `t()` 점 키 조회.
  - `{param}` 보간(단일/복수/누락 파라미터).
  - 현재 로케일 누락 키 → `en` 폴백 → 키 문자열 반환.
  - `setLocale` 미지원 값 → `en` 폴백.
  - `applyI18n`이 `data-i18n*` 속성을 채우는지(jsdom 또는 최소 DOM 스텁).
- **키 정합성 테스트**: `en.json`과 `ko.json`의 (평탄화된) 키 세트가 **완전히 동일**한지 검증(양쪽 누락 방지).
- **수동 검증 체크리스트**:
  - 기본 설치 시 UI가 영어.
  - 팝업에서 EN↔KO 전환 즉시 반영(정적 라벨 + 상태/카운트 등 동적).
  - 영상 배지 문구가 UI 언어에 맞게 전환.
  - 팝업 재오픈·페이지 새로고침 후 선택 유지.
  - `번역 언어` 드롭다운 옵션은 엔도님 유지(변하지 않음).

## 13. 파일 변경 요약

**신규**
- `locales/en.json`
- `locales/ko.json`
- `src/shared/i18n.js`
- `src/shared/i18n.test.js`

**수정**
- `popup.html` (문자열 → `data-i18n` 키, `<html lang>`)
- `popup.js` (카탈로그 등록 + 로케일 초기화 + `applyI18n`)
- `src/presentation/popup/settings-controller.js` (동적 `t()`, 모델 라벨 조립, 언어 셀렉트 핸들러)
- `src/presentation/popup/cache-dialog.js` (동적 `t()`)
- `src/presentation/content/badge-manager.js` (배지 `t()` + `langNames`)
- `content.src.js` (카탈로그 등록 + `onChanged` uiLang 분기)
- `src/domain/constants.js` (`UI_LANG` 키, `MODELS` name+tier 분리)
- `build-extension.sh` (`locales/` 스테이징)

## 14. 리스크 & 완화

| 리스크 | 완화 |
|---|---|
| esbuild가 import-attribute JSON을 처리 못 할 가능성 | 콘텐츠 측은 attribute 없는 평문 `import`(esbuild 기본 JSON 로더) 사용. attribute는 팝업(브라우저 네이티브)만 사용. `i18n.js`는 JSON을 import하지 않음. |
| 언어 전환 시 동적 문구가 안 바뀜(정적만 바뀜) | 전환 핸들러에서 `applyI18n` + 동적 렌더 함수 재호출 명시(§8.1). |
| `en.json`/`ko.json` 키 불일치로 누락 | 키 정합성 테스트로 CI/로컬에서 차단(§12). |
| 배지의 대상언어명이 영어 UI에서 어색 | `langNames` 매핑으로 표시명 변환(§6.2). |
| 하드코딩 잔존(교체 누락) | 검수 시 대상 파일에 남은 한글 `grep`으로 확인(§12 수동 + 리뷰). |

## 15. 향후 (범위 밖)

- 로케일 추가(일본어/중국어 UI 등)는 `locales/<lang>.json` 추가 + 셀렉트 옵션 추가만으로 가능하도록 구조를 유지한다(이번엔 채우지 않음).
- 첫 실행 시 브라우저 언어 자동 감지(현재는 항상 영어 기본) — 필요 시 후속.
