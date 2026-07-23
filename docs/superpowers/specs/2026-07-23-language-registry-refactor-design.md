# 언어 도메인 리팩터 (Language Registry) 설계

- **날짜**: 2026-07-23
- **상태**: 승인 대기 (사용자 검토용)
- **성격**: root-cause 구조 리팩터 (Clean Architecture). "무조건 돌아가게"가 아니라 언어를 1급 도메인 개념으로 승격.

---

## 1. 목표

번역 "언어"를 **도메인 엔티티 + 단일 레지스트리**로 만들고, 프롬프트·스킵·캐시·드롭다운·배지를 전부 그 **투영(projection)** 으로 바꾼다. 목표어는 **명시적 요청 파라미터**로 흐르게 하고, application 계층이 `chrome.storage`를 직접 만지지 않도록 **포트로 주입**한다.

## 2. Root Cause (제거 대상)

1. "어떤 언어가 존재하는가"의 **단일 진리원 부재** — 지식이 4곳에 중복(`popup.html`, `prompt-builder.langMap`, `language-detect.TARGET_SCRIPT`, 카탈로그 `langNames`).
2. **식별자 = 표시 문자열(엔도님 "한국어")** — 신원과 표시가 결합, 캐시 키까지 엔도님.
3. **목표어가 storage 사이드채널로 흐름** — `TRANSLATE_BATCH` 메시지에 targetLang 없음(`vtt-bridge.js:150-156`), background가 storage를 직접 읽음(`translation-service.js:30,36`), 이중 읽기(vtt-bridge:134 + background).
4. **계층 위반** — application(`translateBatch`)이 `chrome.storage.local.get`을 인라인 호출.
5. **langNames가 (UI로케일 × 목표어) 매트릭스** — O(N×M) 수기 유지.

## 3. 확정된 결정 (사용자)

- **범위 = ①+② 코어**: 레지스트리 + 코드 식별자 + 명시적 targetCode 배선 + `Intl.DisplayNames` + 마이그레이션. `sourceCode`는 **파라미터 경로만 배선**하고 원본은 기존대로 자동 감지. **③(자막 트랙 srclang 캡처 + Detector 포트)은 후속 스펙으로 연기.**
- **캐시 마이그레이션 = 자연 만료**: 코드 기반 새 키로 전환, 기존 엔도님 키는 방치(LRU/만료). 사용자당 1회 재번역 비용 수용. 캐시 키 마이그레이션 코드는 작성하지 않음.
- **식별자 = BCP-47 코드** (`en`/`ko`/`ja`/`zh`).

## 4. 아키텍처

### 4.1 도메인 — 언어 레지스트리 (신규 `src/domain/languages.js`, 순수)

```js
export const LANGUAGES = {
  en: { code: 'en', endonym: 'English', englishName: 'English',  script: 'latin'    },
  ko: { code: 'ko', endonym: '한국어',  englishName: 'Korean',   script: 'hangul'   },
  ja: { code: 'ja', endonym: '日本語',  englishName: 'Japanese', script: 'japanese' },
  zh: { code: 'zh', endonym: '中文',    englishName: 'Chinese',  script: 'chinese'  },
};

export const TARGET_CODES = ['ko', 'ja', 'zh'];   // 목표어로 노출
export const UI_CODES     = ['en', 'ko', 'ja'];   // UI 언어로 노출
export const DEFAULT_TARGET_CODE = 'ko';

// legacy 엔도님 → 코드 (마이그레이션 + 하위호환 shim)
export const ENDONYM_TO_CODE = { 'English': 'en', '한국어': 'ko', '日本語': 'ja', '中文': 'zh' };

export function byCode(code)            { return LANGUAGES[code] || null; }
export function isValidTargetCode(code) { return TARGET_CODES.includes(code); }
export function scriptOf(code)          { return LANGUAGES[code]?.script || null; }

/** 코드면 그대로, 레거시 엔도님이면 코드로, 미상이면 fallback. */
export function resolveCode(value, fallback = DEFAULT_TARGET_CODE) {
  if (!value) return fallback;
  if (LANGUAGES[value]) return value;
  return ENDONYM_TO_CODE[value] || fallback;
}
```
> **언어 추가 = 여기 한 항목**(+ UI 언어면 `UI_CODES` 등록 + 카탈로그 파일). 목표어면 `TARGET_CODES` 등록.

### 4.2 포트 & 의존성 역전

- **`getSettings()` 주입(infra)**: `translateBatch`의 인라인 `chrome.storage.local.get(['enabled','targetLang'])` 제거. `storage-adapter.js`에 `getSettings()` 추가 → `{ enabled }` 반환. 기존 `getProviderConfig` 주입과 동일 패턴.
- **use case 입력 명시화**: `translateBatch({ texts, targetCode, sourceCode?, course, lecture, section })`. 목표어는 **composition root(content `requestTranslations`)** 에서 1회 해석해 메시지에 실어 보낸다.
- 도메인은 순수 유지 — `Intl.DisplayNames`(표시 관심사)는 **`src/shared/language-name.js`** 헬퍼로 분리(도메인 밖).

### 4.3 소비처 = 파생 (핵심 변경표)

| 소비처 | 파일 | 지금 | 후 |
|---|---|---|---|
| 프롬프트 | `domain/prompt-builder.js` | `langMap[endonym]` | `byCode(targetCode).englishName` + `.endonym` |
| 스킵 | `domain/language-detect.js` | `TARGET_SCRIPT[endonym]` | `scriptOf(targetCode)` vs `dominantScript`; `sourceCode===targetCode`면 정확 스킵 |
| 캐시 키 | `domain/cache-key.js` | `endonym::…` | `targetCode::…` (동일 형식, 코드) |
| use case | `application/translation-service.js` | storage 직접 읽기 + endonym | `targetCode`/`sourceCode` 파라미터 + `getSettings()` 주입 |
| 목표어 드롭다운 | `popup.html`+`settings-controller.js` | 하드코딩 옵션 | `TARGET_CODES` 순회 렌더(value=code, text=endonym) |
| UI 언어 드롭다운 | `popup.html`+`settings-controller.js` | 하드코딩 옵션 | `UI_CODES` 순회 렌더 |
| 배지/언어명 | `content/badge-manager.js` + 카탈로그 | `t('langNames.'+endonym)` | `languageName(targetCode, getLocale())` (Intl) → 카탈로그 `langNames` **제거** |
| 캐시 목록 표시 | `popup/cache-dialog.js` | `item.lang`(엔도님) | `byCode(item.lang)?.endonym ?? item.lang` (코드→엔도님 표시) |

## 5. 명시적 요청 배선 (사이드채널 제거)

- **`vtt-bridge.requestTranslations`** (composition root):
  ```js
  const { targetLang } = await chrome.storage.local.get('targetLang');
  const targetCode = resolveCode(targetLang);       // 코드로 1회 해석
  if (targetCode) currentLang = targetCode;         // 버킷 키도 코드 기반 (currentLectureKey: `${currentLang}::…`)
  // ...
  sendMessage({ type:'TRANSLATE_BATCH', texts:toSend, targetCode, course, lecture, section });
  ```
  → storage 읽기 1회, 버킷 키와 번역 언어가 같은 값에서 파생(이중 읽기·불일치 창 제거).
- **`background.js`**: 메시지를 그대로 `translateBatch(message)`로 전달(이제 `message.targetCode` 존재). TranslationService에 `getSettings` 주입 추가.
- **`translation-service.translateBatch`**:
  ```js
  async translateBatch({ texts, targetCode, sourceCode, course, lecture, section }) {
    const { enabled } = await this.getSettings();
    if (enabled === false) return { error:'DISABLED' };
    const { provider, apiKey, model } = await this.getProviderConfig();
    if (!apiKey) return { error:'NO_API_KEY' };
    const target = targetCode || DEFAULT_TARGET_CODE;   // 방어적 기본값
    const lKey = lectureCacheKey(target, course, section, lecture);
    // skip: isAlreadyTargetLanguage(texts[i], target, sourceCode)
    // prompt: buildBatchSystemPrompt(target, context)
  }
  ```
- **`content.src.js`** 시작/onChanged: `setActiveLang(resolveCode(stored.targetLang))`, `setBadgeLang(resolveCode(...))` (코드 전달). onChanged `TARGET_LANG` 분기도 `resolveCode` 적용.
- **`transcript-manager.retranslateAll`**: `CLEAR_LECTURE_CACHE` 메시지의 `lang`을 `resolveCode(stored.targetLang)` 코드로 전송. `clearLectureCache({ lang→targetCode })`도 코드 사용.

## 6. 언어명 지역화 — `Intl.DisplayNames` (langNames 제거)

`src/shared/language-name.js` (신규):
```js
export function languageName(targetCode, uiCode) {
  try {
    return new Intl.DisplayNames([uiCode], { type: 'language' }).of(targetCode) || targetCode;
  } catch {
    return targetCode;
  }
}
```
- `badge-manager.badgeText()`: `t('badge.translatingTo', { lang: languageName(lang /*=code*/, getLocale()) })`. `getLocale`는 `shared/i18n.js`에서 import.
- **카탈로그 `langNames` 키를 en/ko/ja 전부에서 제거** — 세 파일 동일 제거라 parity 유지.

## 7. 마이그레이션 (기존 사용자)

- **저장된 `targetLang` 엔도님 → 코드**: `resolveCode`가 읽기 시 흡수(엔도님/코드 모두 처리). `settings-controller` 로드 시 `resolveCode` 결과를 셀렉트 값으로 쓰고, 값이 엔도님이었으면 **코드로 재저장(normalize)** 해 storage를 정리.
- **캐시**: 자연 만료(코드 신규 키, 엔도님 구 키 방치). 마이그레이션 코드 없음. 캐시 목록의 `item.lang`은 §4.3대로 코드→엔도님으로 **표시만** 변환.
- `constants.js`의 `DEFAULT_TARGET_LANG`(엔도님)은 `languages.DEFAULT_TARGET_CODE`로 대체(참조처 이관 후 제거). `STORAGE_KEYS`는 그대로.

## 8. 프레젠테이션 — 드롭다운을 레지스트리에서 렌더

- `popup.html`: `<select id="targetLang">`와 `<select id="uiLang">`의 **하드코딩 `<option>` 제거**(빈 select + chevron 유지). JS가 채운다.
- `settings-controller`: `MODELS`로 모델 옵션 렌더하듯, `TARGET_CODES`/`UI_CODES`를 순회해 `<option value=code>endonym</option>` 생성. targetLang 초기값/change는 **코드**로 저장. uiLang은 이미 코드 값이라 동일 흐름(라벨만 레지스트리 endonym).
- **엔도님은 여전히 리터럴 표시**(번역 안 함) — 레지스트리의 `endonym` 속성에서 옴.

## 9. 테스트 (behavior 검증)

- **신규 `tests/languages.test.mjs`**: 레지스트리 무결성(모든 항목 code/endonym/englishName/script), `TARGET_CODES`/`UI_CODES`가 전부 유효 코드, `byCode`/`scriptOf`/`isValidTargetCode`, **`resolveCode`**(코드 통과 / 엔도님→코드 / 미상→fallback).
- **신규 `tests/language-domain.test.mjs`**: `buildBatchSystemPrompt('ja', …)`가 "Japanese (日本語)" 포함 & 미지원 코드는 방어; `isAlreadyTargetLanguage('こんにちは','ja')`=true, `('こんにちは','ko')`=false, `sourceCode===targetCode` 정확 스킵; `lectureCacheKey('ko', …)`가 `ko::…`.
- **회귀**: `tests/catalog-parity.test.js`(langNames 제거 후에도 3로케일 동일)·`tests/popup-i18n.test.js`(영향 없음)·기존 i18n/constants 테스트 green.
- **주의**: 어떤 테스트도 `langNames`를 참조하지 않도록.

## 10. 파일 변경 요약

**신규**: `src/domain/languages.js`, `src/shared/language-name.js`, `tests/languages.test.mjs`, `tests/language-domain.test.mjs`
**수정(도메인/앱/인프라)**: `prompt-builder.js`, `language-detect.js`, `cache-key.js`, `constants.js`(DEFAULT_TARGET_LANG 제거/이관), `translation-service.js`(파라미터+getSettings), `storage-adapter.js`(getSettings), `background.js`(주입+패스스루)
**수정(콘텐츠)**: `content.src.js`, `vtt-bridge.js`, `badge-manager.js`, `caption-manager.js`, `transcript-manager.js` → **content.js 재번들**
**수정(팝업)**: `popup.html`(빈 select), `settings-controller.js`(옵션 렌더+코드 저장+normalize), `cache-dialog.js`(코드→엔도님 표시)
**수정(데이터/문서)**: `locales/en.json`·`ko.json`·`ja.json`(langNames 제거), `locales/GLOSSARY.md`(langNames→Intl, targetLang 값=코드 반영)

## 11. 리스크 & 완화

| 리스크 | 완화 |
|---|---|
| 코드 전환으로 기존 사용자 targetLang/캐시 깨짐 | `resolveCode` 하위호환 shim + settings 재저장 normalize; 캐시는 자연 만료(합의) |
| `Intl.DisplayNames` 미지원/오류 | try/catch → 코드 문자열 폴백. Chrome 81+ 지원(문제없음) |
| 드롭다운을 JS 렌더로 바꾸며 초기 표시 지연 | popup 로드시 즉시 렌더(모델 셀렉트와 동일 경로), FOUC 없음 |
| content.js 재번들 누락 | 플랜에 esbuild + grep 검증 단계 포함 |
| 광범위 변경(≈18파일) 회귀 | 도메인 단위테스트 신설 + 기존 스위트 회귀 + SDD 태스크별 리뷰 |

## 12. 브랜치 전략 (플랜에서 확정)

이 리팩터는 **미병합 `feat/ui-language-i18n` 위에서** i18n 코드를 수정한다(langNames 제거, uiLang 파생). → 그 브랜치에 이어서 하거나, 그 위에 `refactor/language-registry`를 스택. 병합 순서는 실행 단계에서 결정.

## 13. 범위 밖 (후속)

- ③ 원본어: 자막 트랙 `srclang` 캡처 + `LanguageDetector` 포트 (별도 스펙).
- 복수형/성(ICU plural) — `t()` 확장.
- 라틴계 다국어(es/de/fr) 실제 추가 — 레지스트리에 항목만 추가하면 되도록 이번 리팩터가 길을 연다.
