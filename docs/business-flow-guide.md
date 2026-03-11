# Udemy Live Translator — 비즈니스 플로우 가이드

## 프로젝트 아키텍처 개요

```
┌─────────────────────────────────────────────────────────────┐
│  Chrome Browser                                             │
│                                                             │
│  ┌──────────┐    chrome.runtime     ┌────────────────────┐  │
│  │ popup.js │ ───── .sendMessage ──→│   background.js    │  │
│  │ (설정 UI) │←──── sendResponse ───│  (Service Worker)  │  │
│  └──────────┘                       └────────────────────┘  │
│                                        ↑            │       │
│  ┌──────────────┐  chrome.runtime      │            │       │
│  │  content.js  │ ── .sendMessage ─────┘   fetch()  │       │
│  │ (Udemy 페이지)│←── sendResponse ───┘             ↓       │
│  └──────────────┘                    ┌──────────────────┐   │
│                                      │ Claude / Gemini  │   │
│                                      │     API          │   │
│                                      └──────────────────┘   │
└─────────────────────────────────────────────────────────────┘
```

### 3개의 실행 컨텍스트

| 컨텍스트 | 파일 | 역할 |
|----------|------|------|
| **Service Worker** | `background.js` | API 호출, 캐시 관리, 메시지 라우팅 |
| **Content Script** | `content.js` | Udemy DOM 감시, 자막 치환, 스타일 적용 |
| **Popup** | `popup.js` | 사용자 설정 UI, 캐시 관리 다이얼로그 |

---

## 1. 자동 번역 플로우 (핵심 플로우)

사용자가 Udemy 강의 페이지를 열면 자동으로 실행된다.

```
[사용자가 Udemy 강의 페이지 접속]
         │
         ▼
┌─────────────────────────────────────────────────┐
│ content.js 초기화                                │
│                                                  │
│  1. loadStyle() → chrome.storage에서 스타일 로드  │
│  2. updateDynamicStyles() → <style> 태그 주입     │
│  3. initPanelFinder() → 트랜스크립트 패널 감시 시작 │
│  4. initCaptionFinder() → 비디오 캡션 감시 시작    │
│  5. setupNavigationHandler() → SPA 이동 대응       │
└──────────────────────┬──────────────────────────┘
                       │
                       ▼
┌──────────────────────────────────────────────────┐
│ Panel Finder (MutationObserver on document.body)  │
│                                                   │
│  [data-purpose="transcript-panel"] 요소를 감시     │
│  → 패널이 나타나면 initPanel(panel) 호출           │
└──────────────────────┬───────────────────────────┘
                       │
                       ▼
┌──────────────────────────────────────────────────┐
│ initPanel(panel)                                  │
│                                                   │
│  1. scheduleTranslation(panel) → 1.5초 디바운스    │
│  2. MutationObserver 설정 (childList, subtree)     │
│     → 새 cue-container 추가 감지 시 재스케줄링     │
└──────────────────────┬───────────────────────────┘
                       │ (1.5초 후)
                       ▼
┌──────────────────────────────────────────────────┐
│ translateAllCues(panel)                           │
│                                                   │
│  1. collectCues(panel)                            │
│     → 패널 내 모든 자막 큐 수집                    │
│       (cueText span + text + container)           │
│                                                   │
│  2. getUntranslatedCues(cueItems)                 │
│     → data-original 없고 original span 없는 큐 필터│
│                                                   │
│  3. 중복 제거                                      │
│     → uniqueTexts = [...new Set(texts)]           │
│                                                   │
│  4. 로딩 표시                                      │
│     → 각 큐에 "번역 중..." span 추가              │
│                                                   │
│  5. chrome.runtime.sendMessage                     │
│     → { type: 'TRANSLATE_BATCH', texts, ... }     │
└──────────────────────┬───────────────────────────┘
                       │
      ─ ─ ─ ─ ─ ─ ─ ─ ┼ ─ ─ ─ ─ ─ ─ ─ ─
      Content Script    │   Service Worker
      ─ ─ ─ ─ ─ ─ ─ ─ ┼ ─ ─ ─ ─ ─ ─ ─ ─
                       ▼
┌──────────────────────────────────────────────────┐
│ background.js → TranslationService.translateBatch │
│                                                   │
│  1. enabled 체크 → false면 { error: 'DISABLED' }  │
│  2. getProviderConfig() → provider, apiKey, model │
│  3. lectureCacheKey() → "lang::section||lecture"  │
│                                                   │
│  4. 캐시 조회 (2-tier)                             │
│     ┌─ L1 (LRU Map, 메모리) ─ HIT → 즉시 반환    │
│     └─ L2 (chrome.storage)  ─ HIT → L1에 승격     │
│        MISS → API 호출 필요                        │
│                                                   │
│  5. 미번역분만 추출 → 중복 제거                     │
│                                                   │
│  6. 청크 분할 (30개 단위)                           │
│     → 각 청크마다 순차 API 호출                     │
│                                                   │
│  7. 캐시 저장 (L1 + L2 동시)                       │
│                                                   │
│  8. sendResponse({ results })                     │
└──────────────────────┬───────────────────────────┘
                       │
      ─ ─ ─ ─ ─ ─ ─ ─ ┼ ─ ─ ─ ─ ─ ─ ─ ─
      Service Worker    │   Content Script
      ─ ─ ─ ─ ─ ─ ─ ─ ┼ ─ ─ ─ ─ ─ ─ ─ ─
                       ▼
┌──────────────────────────────────────────────────┐
│ 번역 결과 적용                                    │
│                                                   │
│  1. resultMap 구축 (원본텍스트 → 번역결과)         │
│                                                   │
│  2. 각 큐에 applyTranslation() 적용               │
│     → textSpan.dataset.original = 원본 저장       │
│     → textSpan.dataset.translated = 번역 저장     │
│     → textSpan.textContent = 번역 텍스트로 교체    │
│     → original span에 원본 텍스트 표시 (both 모드) │
│                                                   │
│  3. applyDisplayMode() → 표시 모드에 따라 조정     │
│                                                   │
│  4. 비디오 캡션도 즉시 치환                         │
│     → replaceCaptionText(captionEl)               │
│                                                   │
│  5. 번역 중 추가된 새 자막 재확인 → 있으면 재스케줄  │
└──────────────────────────────────────────────────┘
```

---

## 2. API 호출 플로우

```
TranslationService._translateChunks()
         │
         ▼
┌─────────────────────────────────────────┐
│ 입력 텍스트를 30개씩 청크 분할            │
│                                          │
│  chunk = ["Hello", "World", ...]         │
│  userText = "1|Hello\n2|World\n..."      │
│  maxTokens = max(4096, chunk.length*200) │
└──────────────────────┬──────────────────┘
                       │
                       ▼
┌─────────────────────────────────────────┐
│ buildBatchSystemPrompt(targetLang, ctx)  │
│                                          │
│  "You are a subtitle translator.         │
│   Input lines have format 'N|text'.      │
│   Translate ONLY the text after pipe     │
│   to {targetLang}..."                    │
│                                          │
│  + 강의 컨텍스트 (section, lecture)       │
└──────────────────────┬──────────────────┘
                       │
                       ▼
┌─────────────────────────────────────────┐
│ callApi() → Provider 분기               │
│                                          │
│  ┌─ provider === 'gemini'                │
│  │   → callGemini()                      │
│  │     POST generativelanguage.google... │
│  │     thinkingBudget: 0 (2.5 모델)     │
│  │                                       │
│  └─ provider === 'claude'                │
│      → callClaude()                      │
│        POST api.anthropic.com/v1/messages│
│        anthropic-dangerous-direct-       │
│        browser-access: true              │
└──────────────────────┬──────────────────┘
                       │
                       ▼
┌─────────────────────────────────────────┐
│ parseBatchResponse(responseText)         │
│                                          │
│  응답: "1|안녕하세요\n2|세계\n..."        │
│  → Map { 1 → "안녕하세요", 2 → "세계" } │
│  → { "Hello": "안녕하세요",              │
│      "World": "세계" }                   │
└─────────────────────────────────────────┘
```

---

## 3. 캐시 시스템

```
┌─────────────────────────────────────────────────────────┐
│                    캐시 2-tier 구조                       │
│                                                          │
│  ┌────────────────────────────────────────┐              │
│  │ L1: LRU Memory Cache (최대 50개 강의)   │ ← 빠름     │
│  │                                         │              │
│  │  Key: "한국어::Section Name||Lecture"    │              │
│  │  Val: { "Hello": "안녕", ... }          │              │
│  │                                         │              │
│  │  특징: Service Worker 종료 시 소멸       │              │
│  └────────────────┬───────────────────────┘              │
│                   │ MISS                                  │
│                   ▼                                       │
│  ┌────────────────────────────────────────┐              │
│  │ L2: chrome.storage.local (영구 저장)    │ ← 느림     │
│  │                                         │              │
│  │  Key: "lec_한국어::Section||Lecture"     │              │
│  │  Val: { "Hello": "안녕", ... }          │              │
│  │                                         │              │
│  │  특징: unlimitedStorage, 브라우저 재시작  │              │
│  │        후에도 유지됨                     │              │
│  └────────────────────────────────────────┘              │
│                                                          │
│  캐시 키 생성: lectureCacheKey(lang, section, lecture)    │
│  → "한국어::Section 1: Introduction||Lecture 3: Setup"   │
└─────────────────────────────────────────────────────────┘

캐시 히트 흐름:
  L1 HIT → 즉시 반환 (메모리 접근)
  L1 MISS → L2 조회
    L2 HIT → L1에 승격 후 반환
    L2 MISS → API 호출 → L1 + L2 동시 저장
```

---

## 4. 비디오 캡션 치환 플로우

Udemy의 비디오 캡션은 트랜스크립트 패널과 별개의 DOM 요소이다.
트랜스크립트의 `cue-text` span을 번역으로 교체하면 캡션에도 자동 반영되는 구조이나,
캡션 요소가 동적으로 생성/파괴되므로 별도 감시가 필요하다.

```
┌──────────────────────────────────────────┐
│ initCaptionFinder()                       │
│                                           │
│  MutationObserver on document.body        │
│  → [data-purpose="captions-cue-text"]     │
│    요소 출현 감시                          │
└────────────────────┬─────────────────────┘
                     │ 캡션 요소 발견
                     ▼
┌──────────────────────────────────────────┐
│ observeCaption(captionEl)                 │
│                                           │
│  1. replaceCaptionText() 즉시 실행        │
│  2. MutationObserver 부착                 │
│     (childList, characterData, subtree)   │
│     → 캡션 텍스트 변경 시마다 실행         │
└────────────────────┬─────────────────────┘
                     │
                     ▼
┌──────────────────────────────────────────┐
│ replaceCaptionText(captionEl)             │
│                                           │
│  1. displayMode === 'original' → 스킵    │
│                                           │
│  2. 캡션의 원본 텍스트 추출                │
│                                           │
│  3. buildTranslationMap()                 │
│     → 트랜스크립트 패널의 data-translated  │
│       속성에서 원본→번역 맵 구축           │
│                                           │
│  4. 원본 텍스트로 번역 조회                │
│                                           │
│  5. 표시 모드에 따라 치환                  │
│     - translation: 번역만 표시             │
│     - both: 번역 + 원본(작게) 표시         │
└──────────────────────────────────────────┘
```

---

## 5. 재번역 플로우

팝업에서 "현재 자막 재번역" 버튼을 클릭하면 실행된다.

```
[팝업: 재번역 버튼 클릭]
         │
         ▼
popup.js → chrome.tabs.sendMessage
           { type: 'RETRANSLATE_ALL' }
         │
         ▼
content.js → retranslateAll()
  1. 패널의 모든 큐 수집 (이미 번역된 것 포함)
  2. "재번역 중..." 로딩 표시
  3. chrome.runtime.sendMessage
     { type: 'RETRANSLATE_BATCH', texts, lang }
         │
         ▼
background.js → TranslationService.retranslateBatch()
  1. 캐시 무시 → 모든 텍스트를 API로 재호출
  2. 결과로 기존 캐시 덮어쓰기
  3. sendResponse({ results })
         │
         ▼
content.js
  1. 모든 큐에 새 번역 적용
  2. 비디오 캡션도 즉시 치환
  3. 팝업에 완료 건수 반환
```

---

## 6. 설정 변경 실시간 반영 플로우

```
[팝업에서 설정 변경]
  (스타일, 표시 모드, enabled 등)
         │
         ▼
popup.js → chrome.storage.local.set({ key: value })
         │
         ▼  (chrome.storage.onChanged 이벤트)
         │
content.js 수신
  │
  ├── enabled → false
  │     → removeAllTranslations()
  │       (원본 복원, 번역 span 제거)
  │
  ├── enabled → true
  │     → scheduleTranslation(panel)
  │       (새로 번역 시작)
  │
  └── 스타일/모드 변경
        → loadStyle()
        → updateDynamicStyles()
          (<style> 태그 재생성)
        → applyDisplayModeAll()
          (모든 큐의 표시 모드 재적용)
```

---

## 7. SPA 네비게이션 대응

Udemy는 SPA(Single Page Application)이므로 강의 간 이동 시 페이지가 새로고침되지 않는다.

```
[사용자가 다른 강의로 이동]
         │
         ▼
navigation-handler.js
  │
  ├── Navigation API (Chrome 최신)
  │     navigation.addEventListener('navigate')
  │
  └── Fallback (구 브라우저)
        history.pushState / replaceState 래핑
        popstate / hashchange 이벤트
         │
         ▼
onNavigate()
  1. 모든 Observer 해제
     - transcript panel observer
     - panel finder observer
     - caption observer
     - caption finder observer
  2. 상태 초기화
     - currentPanel = null
     - isBatchTranslating = false
     - settleTimer 클리어
  3. 1초 후 재초기화
     - initPanelFinder()
     - initCaptionFinder()
```

---

## 8. 캐시 관리 플로우

```
[팝업: 캐시 관리 다이얼로그 열기]
         │
         ▼
popup.js → chrome.runtime.sendMessage
           { type: 'GET_CACHE_LIST' }
         │
         ▼
background.js → CacheService.getList()
  → chrome.storage.local.get(null)
  → "lec_" 접두사 키만 필터링
  → 키 파싱: lang, section, lecture, count
  → sendResponse({ items })
         │
         ▼
[다이얼로그에 목록 렌더링]
  - 강의별 캐시 항목 표시
  - 자막 수, 언어 태그 표시

[선택 삭제]
  → { type: 'DELETE_CACHE_ITEMS', keys }
  → CacheService.deleteItems()
    → chrome.storage.local.remove()
    → L1 캐시에서도 제거

[전체 삭제]
  → { type: 'CLEAR_CACHE' }
  → CacheService.clearAll()
    → L1 캐시 clear()
    → L2에서 "lec_" 접두사 키 전부 삭제
```

---

## 9. 메시지 프로토콜

### Content Script → Background (chrome.runtime.sendMessage)

| type | 페이로드 | 응답 |
|------|---------|------|
| `TRANSLATE_BATCH` | `{ texts, targetLang?, lecture, section }` | `{ results: [{ translation, cached }] }` 또는 `{ error }` |
| `RETRANSLATE_BATCH` | `{ texts, lang, lecture, section }` | `{ results: [{ translation }] }` 또는 `{ error }` |
| `CLEAR_CACHE` | — | `{ success: true }` |
| `GET_CACHE_LIST` | — | `{ items: [{ key, lang, section, lecture, count }] }` |
| `DELETE_CACHE_ITEMS` | `{ keys: string[] }` | `{ success: true }` |
| `PING` | — | `{ pong: true }` |

### Popup → Content Script (chrome.tabs.sendMessage)

| type | 페이로드 | 응답 |
|------|---------|------|
| `RETRANSLATE_ALL` | — | `{ count: number }` |
| `GET_LECTURE_INFO` | — | `{ lecture, section }` |

---

## 10. 에러 처리 흐름

```
API 호출 실패
  │
  ├── 429 (Rate Limit)
  │     → throw Error('RATE_LIMIT')
  │     → 모든 미번역 큐에 "API 할당량 초과" 표시
  │
  ├── 4xx/5xx
  │     → throw Error('API_ERROR:{status}:{body}')
  │     → "API 오류 ({status})" 표시
  │
  ├── 네트워크 오류
  │     → catch → "연결 오류" 표시
  │
  └── 응답 파싱 실패
        → 특정 줄만 파싱 실패 시 해당 큐에 "응답 파싱 실패" 표시
        → 나머지 성공한 줄은 정상 적용

설정 오류
  ├── API 키 미설정 → { error: 'NO_API_KEY' } → "API 키를 설정하세요"
  └── 번역 비활성화 → { error: 'DISABLED' } → 원본 복원 (에러 표시 없음)
```

---

## 11. 모듈 의존성 그래프

```
background.js
  └── application/
  │     ├── TranslationService
  │     │     ├── domain/constants (CHUNK_SIZE, DEFAULT_TARGET_LANG)
  │     │     ├── domain/prompt-builder
  │     │     ├── domain/response-parser
  │     │     └── domain/cache-key
  │     └── CacheService
  │           ├── domain/constants (L2_PREFIX)
  │           └── infrastructure/cache/storage-cache
  └── infrastructure/
        ├── cache/lru-cache
        ├── cache/storage-cache
        ├── api/api-client → claude-client, gemini-client
        └── chrome/storage-adapter

content.js
  ├── domain/constants
  └── presentation/content/
        ├── style-manager → domain/constants, shared/utils
        ├── transcript-manager → domain/constants, domain/error-messages
        │                        style-manager, caption-manager
        ├── caption-manager → domain/constants, style-manager
        └── navigation-handler → transcript-manager, caption-manager

popup.js
  └── presentation/popup/
        ├── settings-controller → domain/constants
        ├── cache-dialog → shared/utils
        └── style-preview → shared/utils
```
