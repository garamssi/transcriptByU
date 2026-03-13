# Udemy Live Translator — 비즈니스 플로우 가이드

## 프로젝트 아키텍처 개요

```
Chrome Browser
  popup.js (설정 UI) ──chrome.runtime.sendMessage──→ background.js (Service Worker)
                      ←──── sendResponse ────────────┘       │
                                                              │ fetch()
  content.js (Udemy 페이지) ──chrome.runtime.sendMessage──→   │
                             ←──── sendResponse ──────────┘   ▼
                                                      Ollama / Claude / Gemini API
```

### 3개의 실행 컨텍스트

| 컨텍스트 | 파일 | 역할 |
|----------|------|------|
| Service Worker | `background.js` | API 호출, 캐시 관리, 메시지 라우팅 |
| Content Script | `content.js` (번들) | Udemy DOM 감시, 청크 분할, 자막 치환, 스타일 적용 |
| Popup | `popup.js` | 사용자 설정 UI, 캐시 관리 다이얼로그 |

### 3개의 AI 프로바이더

| 프로바이더 | 청크 사이즈 | 엔드포인트 | 특징 |
|-----------|-----------|-----------|------|
| Ollama (기본) | 5 | `localhost:11434/api/chat` | 로컬, 무제한, 재시도 2회, 딜레이 없음 |
| Gemini | 100 | `generativelanguage.googleapis.com` | 클라우드, 분당 제한, 재시도 없음, 1초 딜레이 |
| Claude | 100 | `api.anthropic.com` | 클라우드, 분당 제한, 재시도 없음, 1초 딜레이 |


## 1. 자동 번역 플로우 (핵심)

사용자가 Udemy 강의 페이지를 열면 자동으로 실행된다.

```
[Udemy 강의 페이지 접속]
    ▼
content.js 초기화
  1. loadStyle() → chrome.storage에서 스타일 로드
  2. updateDynamicStyles() → <style> 태그 주입
  3. initPanelFinder() → 트랜스크립트 패널 감시 시작
  4. initCaptionFinder() → 비디오 캡션 감시 시작
  5. setupNavigationHandler() → SPA 이동 대응
    ▼
Panel Finder (MutationObserver on document.body)
  [data-purpose="transcript-panel"] 감시
  → 패널 발견 시 initPanel(panel) 호출
    ▼
initPanel(panel)
  1. scheduleTranslation(panel) → 1.5초 디바운스
  2. MutationObserver 설정 (childList, subtree)
     → 새 cue-container 추가 감지 시 재스케줄링
    ▼ (1.5초 후)
translateAllCues(panel) — 청크 단위 비동기 번역
  1. collectCues(panel) → 패널 내 모든 자막 큐 수집
  2. getUntranslatedCues() → 미번역 큐만 필터
  3. 중복 제거 → uniqueTexts = [...new Set(texts)]
  4. 로딩 표시 → 각 큐에 "번역 중..." span 추가
  5. 프로바이더별 청크 사이즈 결정 (Ollama: 5, Cloud: 100)
  6. 청크 분할 → content.js에서 직접 분할
  7. 각 청크를 개별 TRANSLATE_BATCH 메시지로 전송
  8. 청크 결과 도착 즉시 DOM 반영 (전체 완료를 기다리지 않음)
```


## 2. 청크 단위 비동기 처리 (핵심 개선)

기존: 전체 텍스트를 한 번에 보내고 모든 청크 완료 후 한꺼번에 DOM 반영
현재: 청크별로 개별 전송, 먼저 완료된 청크부터 즉시 DOM에 표시

```
[Content Script — translateAllCues()]
  uniqueTexts (예: 120줄)
    ▼
  프로바이더 확인 → chrome.storage에서 provider 읽기
  청크 분할 (Ollama: 5줄씩 = 24개 청크, Cloud: 100줄씩 = 2개 청크)
    ▼
  for (각 청크) {
    chrome.runtime.sendMessage({ type: 'TRANSLATE_BATCH', texts: chunk })
      ▼ 응답 수신 즉시
    applyChunkResults() → 해당 청크의 큐들만 DOM에 반영
    캡션도 즉시 갱신
  }
    ▼
  Ollama 예시 (5줄 × 24청크):
    ~4초 후 → 1~5줄 번역 표시
    ~8초 후 → 6~10줄 번역 표시
    ...사용자는 처음 몇 줄을 바로 볼 수 있음

  Cloud 예시 (100줄 × 2청크):
    ~2초 후 → 1~100줄 번역 표시
    ~4초 후 → 101~120줄 번역 표시
```


## 3. API 호출 플로우 (프로바이더별 분기)

```
[Background — TranslationService.translateBatch()]
  1. enabled 체크 → false면 { error: 'DISABLED' }
  2. getProviderConfig() → provider, apiKey, model
  3. 캐시 조회 (2-tier: L1 메모리 → L2 chrome.storage)
  4. 미번역분 추출 → 중복 제거
  5. _translateByProvider() → 프로바이더별 전략 분기
    ▼
┌─────────────────────────────────────────────────────────┐
│ Ollama 전략 (_translateOllama)                          │
│  - 청크 사이즈: 5줄                                      │
│  - 청크 간 딜레이: 없음 (로컬이라 rate limit 없음)         │
│  - 실패 재시도: 최대 2회 (원본 텍스트로 정확히 재전송)      │
│  - 재시도 대상: 파싱 실패한 텍스트만 선별하여 재시도         │
├─────────────────────────────────────────────────────────┤
│ Cloud 전략 (_translateCloud) — Gemini / Claude          │
│  - 청크 사이즈: 100줄                                    │
│  - 청크 간 딜레이: 1초 (rate limit 보호)                  │
│  - 실패 재시도: 없음 (API 할당량 소모 방지)               │
└─────────────────────────────────────────────────────────┘
    ▼
[_translateAndParse() — 공통 번역+파싱 로직]
  1. 텍스트를 N|text 형식으로 변환
     "1|Welcome back.\n2|Keep learning..."
  2. buildBatchSystemPrompt(targetLang, context)
     - 언어 강제: "Korean ONLY, nothing else"
     - 강의 컨텍스트 포함 (section, lecture)
  3. callApi() → 프로바이더별 분기
    ▼
[callApi() 프로바이더 분기]
  ollama  → callOllama(systemPrompt, userText, baseUrl, model)
             POST {baseUrl}/api/chat (stream: false)
  gemini  → callGemini(systemPrompt, userText, apiKey, model, maxTokens)
             POST generativelanguage.googleapis.com
             2.5 모델: thinkingBudget: 0
  claude  → callClaude(systemPrompt, userText, apiKey, model, maxTokens)
             POST api.anthropic.com/v1/messages
    ▼
[parseBatchResponse(responseText, expectedCount)]
  1차: N|text 형식 파싱 → Map { 1 → "다시 오신...", 2 → "계속..." }
  2차 fallback: N| 형식 없지만 줄 수 일치 시 → 순서대로 매칭
    ▼
  성공한 텍스트 → translationMap에 저장
  실패한 텍스트 → failed 배열로 반환 (Ollama만 재시도)
    ▼
[캐시 저장]
  L1 (LRU 메모리, 최대 50개 강의) + L2 (chrome.storage, 영구) 동시 저장
    ▼
[Content Script로 결과 반환]
  { results: [{ translation: "...", cached: false }, ...] }
```


## 4. 번역 결과 DOM 적용

```
[applyChunkResults() — 청크 결과 수신 즉시 호출]
    ▼
textToCues 맵으로 동일 텍스트의 모든 큐에 일괄 적용
    ▼
각 큐에 applyTranslation() 적용
  1. textSpan.dataset.original = 원본 저장
  2. textSpan.dataset.translated = 번역 저장
  3. textSpan.textContent = 번역 텍스트로 교체
  4. original span에 원본 텍스트 표시 (both 모드)
    ▼
applyDisplayMode() → 표시 모드에 따라 조정
  - translation: 번역만 표시
  - both: 원본 + 번역 동시 표시
  - original: 원본만 표시
    ▼
비디오 캡션도 즉시 치환 (청크마다 갱신)
  replaceCaptionText(captionEl)
    ▼
모든 청크 완료 후 → 미번역 잔여분 확인 → 있으면 재스케줄
```


## 5. 캐시 시스템

```
조회 순서:
  L1 (LRU Memory Cache, 최대 50개 강의) → 즉시 반환
    ▼ MISS
  L2 (chrome.storage.local, 영구 저장) → L1에 승격 후 반환
    ▼ MISS
  API 호출 → L1 + L2 동시 저장

캐시 키: lectureCacheKey(lang, section, lecture)
  → "한국어::Section 1: Introduction||Lecture 3: Setup"

L2 키 접두사: "lec_"
  → "lec_한국어::Section 1||Lecture 3"
```


## 6. 비디오 캡션 치환

```
initCaptionFinder()
  MutationObserver on document.body
  → [data-purpose="captions-cue-text"] 요소 출현 감시
    ▼ 캡션 요소 발견
observeCaption(captionEl)
  1. replaceCaptionText() 즉시 실행
  2. MutationObserver 부착 (childList, characterData, subtree)
     → 캡션 텍스트 변경 시마다 실행
    ▼
replaceCaptionText(captionEl)
  1. displayMode === 'original' → 스킵
  2. 캡션의 원본 텍스트 추출
  3. buildTranslationMap() → 트랜스크립트 패널의 data-translated에서 맵 구축
  4. 원본 텍스트로 번역 조회 → 치환
```


## 7. 재번역 플로우 (청크 단위 비동기)

```
[팝업: 재번역 버튼 클릭]
    ▼
popup.js → chrome.tabs.sendMessage({ type: 'RETRANSLATE_ALL' })
    ▼
content.js → retranslateAll()
  1. 패널의 모든 큐 수집 (이미 번역된 것 포함)
  2. "재번역 중..." 로딩 표시
  3. 프로바이더별 청크 사이즈로 분할
  4. 각 청크를 개별 RETRANSLATE_BATCH 메시지로 전송
  5. 청크 결과 도착 즉시 DOM 반영
    ▼
background.js → TranslationService.retranslateBatch()
  1. 캐시 무시 → 프로바이더별 전략으로 API 재호출
  2. 결과로 기존 캐시 덮어쓰기
  3. sendResponse({ results })
    ▼
content.js
  1. 청크별로 큐에 새 번역 즉시 적용
  2. 비디오 캡션도 청크마다 즉시 치환
  3. 모든 청크 완료 후 팝업에 완료 건수 반환
```


## 8. 설정 변경 실시간 반영

```
[팝업에서 설정 변경]
    ▼
popup.js → chrome.storage.local.set({ key: value })
    ▼ chrome.storage.onChanged 이벤트
content.js 수신
  ├── enabled → false → removeAllTranslations() (원본 복원, 번역 span 제거)
  ├── enabled → true  → scheduleTranslation(panel) (새로 번역 시작)
  └── 스타일/모드 변경 → loadStyle() → updateDynamicStyles() → applyDisplayModeAll()
```


## 9. 프로바이더 전환 흐름

```
[팝업에서 프로바이더 탭 클릭 (Ollama → Gemini 등)]
    ▼
switchProvider(provider)
  1. 현재 프로바이더의 모델을 프로바이더별 키에 저장 (ollamaModel, geminiModel, claudeModel)
  2. 새 프로바이더의 모델 목록을 드롭다운에 렌더링
  3. 이전에 저장된 모델이 있으면 복원
  4. UI 패널 전환 (API 키 / 서버 URL 입력)
    ▼
saveProviderModel()
  chrome.storage.local.set({ provider, {provider}Model })
    ▼
다음 번역 시 getProviderConfig()가 새 프로바이더 설정 로드
  → 올바른 API 클라이언트 + 전략(청크/재시도)으로 호출
```


## 10. SPA 네비게이션 대응

```
[사용자가 다른 강의로 이동]
    ▼
navigation-handler.js
  ├── Navigation API (Chrome 최신) → navigation.addEventListener('navigate')
  └── Fallback (구 브라우저) → history.pushState/replaceState 래핑
    ▼
onNavigate()
  1. 모든 Observer 해제 (transcript, panel finder, caption)
  2. 상태 초기화 (currentPanel, isBatchTranslating, settleTimer)
  3. 1초 후 재초기화 → initPanelFinder() + initCaptionFinder()
```


## 11. 에러 처리

| 에러 | 원인 | 표시 |
|------|------|------|
| `RATE_LIMIT` | API 429 응답 | "API 할당량 초과" |
| `API_ERROR:{status}` | API 4xx/5xx | "API 오류 ({status})" |
| `NO_API_KEY` | API 키 미설정 | "API 키를 설정하세요" |
| `PARSE_ERROR` | 응답 N\|text 파싱 실패 (Ollama: 재시도 후에도 실패) | "응답 파싱 실패" |
| `DISABLED` | 번역 비활성화 | 원본 복원 (에러 표시 없음) |
| 네트워크 오류 | fetch 실패 | "연결 오류" |

### 파싱 실패 복구 전략

```
parseBatchResponse(responseText, expectedCount)
  1차: N|text 형식으로 파싱
    ▼ 결과 0건 && 줄 수 == expectedCount
  2차 fallback: 줄 순서대로 매칭 (모델이 N| 형식을 안 지킨 경우)
    ▼ 여전히 실패한 텍스트가 있으면
  Ollama: 실패한 원본 텍스트만 추출하여 최대 2회 재시도
  Cloud:  재시도 없음 (rate limit 보호)
```


## 12. 메시지 프로토콜

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

**참고**: 청크 분할은 content.js에서 수행. 각 TRANSLATE_BATCH/RETRANSLATE_BATCH는 청크 단위(Ollama: 5줄, Cloud: 100줄)로 전송되며, background는 받은 텍스트를 그대로 처리.


## 13. 모듈 의존성

```
background.js
  ├── application/TranslationService
  │     ├── _translateOllama() — Ollama 전략 (소청크, 재시도)
  │     ├── _translateCloud()  — Cloud 전략 (대청크, 딜레이)
  │     ├── _translateAndParse() — 공통 번역+파싱
  │     ├── domain/constants (CHUNK_SIZE, OLLAMA_CHUNK_SIZE)
  │     ├── domain/prompt-builder
  │     ├── domain/response-parser
  │     └── domain/cache-key
  ├── application/CacheService
  │     └── infrastructure/cache/storage-cache
  └── infrastructure/
        ├── cache/lru-cache
        ├── api/api-client → claude-client, gemini-client, ollama-client
        └── chrome/storage-adapter

content.js (번들: content.src.js + imports)
  ├── domain/constants (CHUNK_SIZE, OLLAMA_CHUNK_SIZE)
  └── presentation/content/
        ├── style-manager
        ├── transcript-manager
        │     ├── translateAllCues() — 청크 단위 비동기 번역
        │     ├── retranslateAll() — 청크 단위 비동기 재번역
        │     ├── applyChunkResults() — 청크 결과 즉시 DOM 반영
        │     ├── buildTextToCueMap() — 텍스트→큐 매핑
        │     └── caption-manager
        ├── caption-manager
        └── navigation-handler

popup.js
  └── presentation/popup/
        ├── settings-controller → domain/constants
        ├── cache-dialog
        └── style-preview
```


## 14. 프로바이더별 설정 저장 구조

```
chrome.storage.local:
  provider      → "ollama" | "gemini" | "claude"
  ollamaUrl     → "http://localhost:11434"
  ollamaModel   → "exaone3.5:7.8b"
  geminiApiKey   → "AIzaSy..."
  geminiModel    → "gemini-2.5-flash"
  claudeApiKey   → "sk-ant-api03-..."
  claudeModel    → "claude-haiku-4-5-20251001"
  enabled        → true/false
  targetLang     → "한국어"
  displayMode    → "translation" | "both" | "original"
```


## 15. 프로바이더별 전략 비교

| | Ollama (로컬) | Gemini / Claude (클라우드) |
|---|---|---|
| 청크 사이즈 | 5줄 | 100줄 |
| 청크 간 딜레이 | 없음 | 1초 |
| 실패 재시도 | 최대 2회 (원본 텍스트 재전송) | 없음 (rate limit 보호) |
| 파서 fallback | O (줄 순서 매칭) | O (줄 순서 매칭) |
| 청크 분할 위치 | content.js | content.js |
| 번역 전략 메서드 | `_translateOllama()` | `_translateCloud()` |
| 예상 소요시간 (120줄) | ~96초 (24청크 × ~4초) | ~4초 (2청크 × ~2초) |
| DOM 반영 방식 | 5줄씩 점진적 표시 | 100줄 단위 즉시 표시 |
