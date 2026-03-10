# Udemy 자막 번역 Chrome 익스텐션 구현 플랜

## 아키텍처

```
[popup.js] API 키 입력/저장 → chrome.storage.local
[content.js] 자막 감지 (MutationObserver) → chrome.runtime.sendMessage
[background.js] Claude API 호출 + 캐시 → fetch → Claude API (Haiku 4.5)
```

## 파일 구조

```
udemy-translator/
├── manifest.json
├── popup.html
├── popup.css
├── popup.js
├── background.js
├── content.js
├── content.css
└── icons/
    ├── icon16.png
    ├── icon48.png
    └── icon128.png
```

## 자막 DOM 구조 분석 (subtitleStructure 참고)

### 안정적인 셀렉터 (`data-purpose` 기반, 해시 접미사 없음)

| 용도 | 셀렉터 |
|------|--------|
| 트랜스크립트 패널 | `[data-purpose="transcript-panel"]` |
| 각 자막 큐 (비활성) | `p[data-purpose="transcript-cue"]` |
| 현재 재생 중인 큐 (활성) | `p[data-purpose="transcript-cue-active"]` |
| 자막 텍스트 | `span[data-purpose="cue-text"]` |

### 활성 자막 감지 방법

- 활성 큐: `data-purpose` 값이 `transcript-cue` → `transcript-cue-active`로 변경됨
- 하이라이트 텍스트: `span[data-purpose="cue-text"]`에 `transcript--highlight-cue--*` 클래스 추가됨
- **MutationObserver 감시 대상**: `[data-purpose="transcript-panel"]`의 `attributes` 변경 (subtree)
- **변경 감지 기준**: `p` 요소의 `data-purpose` 속성이 `transcript-cue-active`로 바뀌는 시점

### 번역 표시 방법

- 활성 큐의 `div.transcript--cue-container` 내부에 번역 `<span>` 추가
- 비활성으로 바뀌어도 번역 텍스트 유지 (스크롤 시 이전 번역도 볼 수 있도록)

---

## 구현 체크리스트

### Step 1: 프로젝트 기본 설정
- [ ] manifest.json 완성 (`run_at: document_idle`, `type: module` 추가)
- [ ] icons 폴더 생성 및 기본 아이콘 추가

### Step 2: 팝업 UI (API 키 입력)
- [ ] popup.html - API 키 입력 필드, 저장 버튼, ON/OFF 토글
- [ ] popup.css - 팝업 스타일
- [ ] popup.js - API 키 `chrome.storage.local` 저장/불러오기, 토글 상태 관리

### Step 3: Background Service Worker
- [ ] background.js 기본 구조 - 메시지 리스너 (`chrome.runtime.onMessage`)
- [ ] Claude API 호출 함수 (`fetch` → `https://api.anthropic.com/v1/messages`)
- [ ] 시스템 프롬프트 설정 (번역문만 출력하도록)
- [ ] 에러 처리 (API 키 없음, 네트워크 오류, 잘못된 응답)

### Step 4: Content Script - 자막 감지
- [ ] `[data-purpose="transcript-panel"]` 요소 탐색 (없으면 재시도)
- [ ] MutationObserver 설정 (`attributes`, `subtree: true`)
- [ ] `data-purpose="transcript-cue-active"` 변경 감지
- [ ] 활성 큐 텍스트 추출 + 이전 텍스트와 비교 (중복 방지)
- [ ] 300ms 디바운스 적용

### Step 5: Content Script - 번역 표시
- [ ] background.js에 번역 요청 (`chrome.runtime.sendMessage`)
- [ ] 번역 결과를 활성 큐 컨테이너 하단에 `<span>` 으로 삽입
- [ ] 이전 번역 유지 (비활성 큐에도 번역 텍스트 표시)

### Step 6: 스타일링
- [ ] content.css - 번역 텍스트 스타일 (색상 구분, 폰트, 간격)
- [ ] 로딩 표시 (번역 중 ... 애니메이션)

### Step 7: 캐시 시스템
- [ ] L1 캐시 - background.js 메모리 Map (최대 500개, LRU)
- [ ] L2 캐시 - chrome.storage.local 영구 저장 (강의별, unlimitedStorage)
- [ ] 캐시 히트 시 API 호출 스킵

### Step 8: 안정성 개선
- [ ] Rate limit 대응 (429 에러 시 재시도 큐)
- [ ] Service Worker 비활성화 대응 (재연결 로직)
- [ ] 페이지 네비게이션 대응 (SPA 라우팅 시 Observer 재설정)
- [ ] 자막 없는 강의 처리 (트랜스크립트 패널 미존재 시)

### Step 9: UX 개선
- [ ] 팝업에서 번역 상태 표시 (연결됨/끊김/번역 중)
- [ ] 번역 ON/OFF 단축키 지원
- [ ] 모델 선택 옵션 (Haiku / Sonnet)
- [ ] 번역 언어 선택 (기본: 한국어)
- [ ] 캐시 삭제 기능 (전체 삭제 / 현재 강의만 삭제)

---

## 기술 결정 사항

| 항목 | 결정 | 이유 |
|------|------|------|
| 자막 셀렉터 | `data-purpose` 속성 사용 | 해시 접미사 없어 DOM 변경에 안정적 |
| API 호출 위치 | background.js | CORS 우회 + API 키 보안 |
| 기본 모델 | Haiku 4.5 | 비용 효율 (~$0.07/시간), 자막 번역에 충분 |
| 디바운스 | 300ms | DOM mutation 묶기 + 체감 지연 최소화 |
| API 키 저장 | chrome.storage.local | 클라우드 동기화 방지 (보안) |
| 캐시 | 메모리 Map + storage | 같은 자막 재호출 방지 |

## 예상 비용 (Haiku 4.5 기준)

- 자막 1줄: ~20 input + ~30 output 토큰
- 1시간 강의 (~600줄): **~$0.07** (캐시 적용 시)

## 위험 요소

| 위험 | 대응 |
|------|------|
| Udemy DOM 변경 | `data-purpose` 우선 사용 (안정적), fallback 셀렉터 준비 |
| API 과다 호출 | 디바운스 + 캐시 + 이전 요청 취소 |
| Service Worker 종료 | 재연결 로직 |