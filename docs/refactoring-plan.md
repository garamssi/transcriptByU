# Udemy Live Translator — 클린 아키텍처 리팩토링 플랜

## 1. 작업 Spec

| 항목 | 값 |
|------|-----|
| 대상 Chrome 버전 | 145 |
| Manifest 버전 | V3 |
| 기술 스택 | Vanilla JS (ES Modules), Chrome Extension APIs |
| 빌드 환경 | 없음 (빌드 도구 미사용, 브라우저 직접 로드) |
| 제약 | 기존 기능 변경/제거 금지, 동작 동일성 유지 |

### 현재 파일 구조

```
transcriptByU/
├── manifest.json          # Manifest V3 설정
├── background.js          # Service Worker (409줄) — 캐시 + API + 메시지 핸들링
├── content.js             # Content Script (705줄) — DOM 감시 + 번역 + UI + 캡션
├── popup.html             # 팝업 UI 마크업
├── popup.js               # 팝업 로직 (476줄) — 설정 관리 + 캐시 다이얼로그 + 스타일 미리보기
├── popup.css              # 팝업 스타일
├── content.css            # Content Script 스타일
├── icons/                 # 확장프로그램 아이콘
└── docs/                  # DOM 구조 참고 문서
```

---

## 2. 현행 아키텍처 분석

### 2.1 현재 구조 요약

3개의 JS 파일이 모든 책임을 갖는 모놀리식 구조:

- **background.js**: LRU 캐시 클래스, L2(storage) 캐시 유틸, 시스템 프롬프트 생성, Provider 설정 로드, Claude/Gemini API 호출, 배치 응답 파싱, 배치 번역 핸들러, 재번역 핸들러, 메시지 라우터
- **content.js**: DOM 셀렉터 상수, 강의 컨텍스트 추출, 스타일 설정 로드/적용, 동적 CSS 생성, 표시 모드 관리, 큐 수집/필터링, 번역 적용/에러 표시, 배치 번역 오케스트레이션, 캡션 치환, MutationObserver 관리(패널/캡션), SPA 네비게이션 대응, 메시지 수신
- **popup.js**: DOM 요소 참조, 설정 CRUD, Provider 전환 UI, 캐시 다이얼로그 전체 로직, 스타일 미리보기

### 2.2 문제점

#### (1) 높은 결합도 — 모든 관심사가 단일 파일에 혼재
- `background.js`에서 캐시 관리, API 호출, 프롬프트 엔지니어링, 메시지 라우팅이 한 파일에 있음
- `content.js`에서 DOM 조작, 비즈니스 로직(번역 오케스트레이션), 스타일 관리, Observer 관리가 한 파일에 있음
- `popup.js`에서 설정 UI, 캐시 관리 UI, 스타일 프리뷰 로직이 한 파일에 있음

#### (2) 책임 불분명
- 번역 비즈니스 로직이 `background.js`(캐시 + API)와 `content.js`(오케스트레이션)에 분산됨
- 설정(storage) 접근이 모든 파일에서 직접 수행됨 (storage 키 하드코딩)
- 에러 메시지 변환이 `content.js`에 위치하지만, 에러 코드는 `background.js`에서 생성됨

#### (3) 의존 방향 위반
- 도메인 로직(캐시 키 생성, 프롬프트 빌드)이 인프라 레이어(Chrome API 호출)와 같은 파일에 존재
- UI 로직(DOM 조작)과 비즈니스 로직(번역 전략)이 `content.js`에서 분리되지 않음

#### (4) 코드 중복
- `hexToRgba()` 함수가 `content.js`와 `popup.js`에 각각 구현됨
- Storage 키 문자열이 여러 파일에 하드코딩됨 (`styleFontSize`, `styleBgColor` 등)
- 에러 처리 패턴이 여러 곳에서 반복됨

#### (5) 테스트 불가능
- 모든 로직이 Chrome API에 직접 의존하므로 단위 테스트가 불가능
- 순수 비즈니스 로직(파싱, 프롬프트 생성, 캐시 전략)을 독립적으로 테스트할 수 없음

---

## 3. 목표 아키텍처

### 3.1 레이어 설계

```
src/
├── domain/                    # 순수 비즈니스 로직 (외부 의존 없음)
│   ├── constants.js           # 공유 상수 (storage 키, 셀렉터, 기본값 등)
│   ├── prompt-builder.js      # 시스템 프롬프트 생성
│   ├── response-parser.js     # API 응답 파싱
│   ├── cache-key.js           # 캐시 키 생성
│   └── error-messages.js      # 에러 코드 → 사용자 메시지 변환
│
├── application/               # 유스케이스 / 오케스트레이션
│   ├── translation-service.js # 번역 유스케이스 (캐시 조회 → API 호출 → 캐시 저장)
│   └── cache-service.js       # 캐시 관리 유스케이스 (목록 조회, 삭제, 전체 클리어)
│
├── infrastructure/            # 외부 시스템 어댑터
│   ├── api/
│   │   ├── api-client.js      # Provider 분기 API 호출
│   │   ├── claude-client.js   # Claude API 호출
│   │   └── gemini-client.js   # Gemini API 호출
│   ├── cache/
│   │   ├── lru-cache.js       # L1 메모리 캐시
│   │   └── storage-cache.js   # L2 chrome.storage 캐시
│   └── chrome/
│       └── storage-adapter.js # chrome.storage.local 래퍼 (Provider 설정 로드)
│
├── presentation/              # UI / DOM 조작
│   ├── content/
│   │   ├── transcript-manager.js  # 트랜스크립트 패널 DOM 감시/조작
│   │   ├── caption-manager.js     # 비디오 캡션 치환
│   │   ├── style-manager.js       # 동적 CSS 생성/업데이트
│   │   └── navigation-handler.js  # SPA 네비게이션 대응
│   └── popup/
│       ├── settings-controller.js # 설정 UI 이벤트 핸들링
│       ├── cache-dialog.js        # 캐시 관리 다이얼로그
│       └── style-preview.js       # 스타일 미리보기
│
├── shared/
│   └── utils.js               # 공유 유틸리티 (hexToRgba 등)
│
├── background.js              # Entry point: Service Worker (의존성 조합 + 메시지 라우터 시작)
├── content.js                 # Entry point: Content Script (초기화 + Observer 시작)
└── popup.js                   # Entry point: Popup (DOMContentLoaded 초기화)
```

### 3.2 의존 방향

```
presentation → application → domain
                    ↓
              infrastructure
```

- `domain`: 외부 의존 없음 (순수 함수)
- `application`: domain을 사용하고, infrastructure를 주입받음
- `infrastructure`: Chrome API, fetch 등 외부 시스템 접근
- `presentation`: application을 통해 기능 수행, DOM 직접 조작

### 3.3 설계 원칙

1. **ES Modules 활용**: Manifest V3의 `"type": "module"` 설정으로 `import/export` 사용 (background.js는 이미 module 타입)
2. **content.js 모듈화 전략**: Content Script는 manifest에서 `"type": "module"` 직접 지원 안 됨 → content.js를 진입점으로 두고 동적 import 또는 단일 번들로 구성
3. **popup.js 모듈화**: popup.html에서 `<script type="module">` 사용
4. **빌드 도구 없이** 진행: Chrome 145는 ES Modules를 Content Script에서도 지원하므로 (`"world": "MAIN"` 또는 `import()` 사용), 번들러 없이 모듈 분리 가능

### 3.4 Content Script 모듈화 방안

Chrome 145에서 Content Script의 ES Module 사용:
- manifest.json의 content_scripts에 `"type": "module"` 추가 (Chrome 130+에서 지원)
- 이를 통해 content.js에서 `import` 구문 직접 사용 가능

---

## 4. Phase별 리팩토링 계획

### Phase 1: 프로젝트 구조 세팅 + Domain 레이어 추출

**범위**: 순수 함수들을 domain 레이어로 추출

**변경 대상**:
- 새로 생성: `src/domain/constants.js`, `src/domain/prompt-builder.js`, `src/domain/response-parser.js`, `src/domain/cache-key.js`, `src/domain/error-messages.js`, `src/shared/utils.js`
- 수정: `background.js` — 추출한 함수를 import로 교체
- 수정: `manifest.json` — content_scripts에 `"type": "module"` 추가

**기대 결과**:
- domain 레이어의 모든 함수가 독립 모듈로 존재
- background.js에서 해당 함수들을 import하여 사용
- 기존 동작 동일

### Phase 2: Infrastructure 레이어 추출

**범위**: 외부 시스템 접근 코드를 infrastructure 레이어로 추출

**변경 대상**:
- 새로 생성: `src/infrastructure/api/claude-client.js`, `src/infrastructure/api/gemini-client.js`, `src/infrastructure/cache/lru-cache.js`, `src/infrastructure/cache/storage-cache.js`, `src/infrastructure/chrome/storage-adapter.js`, `src/infrastructure/chrome/message-router.js`
- 수정: `background.js` — 추출한 모듈을 import로 교체

**기대 결과**:
- API 호출, 캐시, Chrome API 접근이 각각 독립 모듈
- background.js가 얇은 진입점으로 변환
- 기존 동작 동일

### Phase 3: Application 레이어 추출

**범위**: 유스케이스 로직을 application 레이어로 추출

**변경 대상**:
- 새로 생성: `src/application/translation-service.js`, `src/application/settings-service.js`
- 수정: `background.js` — handleTranslateBatch, handleRetranslateBatch를 translation-service로 이동
- 수정: `content.js` — 설정 로드를 settings-service 사용으로 교체

**기대 결과**:
- 번역 유스케이스가 application 레이어에 캡슐화
- background.js는 메시지 라우팅 + 서비스 초기화만 담당
- 기존 동작 동일

### Phase 4: Presentation 레이어 분리 (content.js)

**범위**: content.js의 DOM 조작/UI 로직을 presentation 레이어로 분리

**변경 대상**:
- 새로 생성: `src/presentation/content/transcript-manager.js`, `src/presentation/content/caption-manager.js`, `src/presentation/content/style-manager.js`, `src/presentation/content/navigation-handler.js`
- 수정: `content.js` — 분리된 모듈을 import하여 초기화 오케스트레이션만 수행

**기대 결과**:
- content.js가 ~50줄 이하의 진입점
- 각 관심사별 독립 모듈
- 기존 동작 동일

### Phase 5: Presentation 레이어 분리 (popup.js)

**범위**: popup.js의 UI 로직을 presentation 레이어로 분리

**변경 대상**:
- 새로 생성: `src/presentation/popup/settings-controller.js`, `src/presentation/popup/cache-dialog.js`, `src/presentation/popup/style-preview.js`
- 수정: `popup.js` — 분리된 모듈을 import하여 초기화만 수행
- 수정: `popup.html` — `<script type="module">` 사용

**기대 결과**:
- popup.js가 ~30줄 이하의 진입점
- 설정 UI, 캐시 다이얼로그, 스타일 프리뷰가 독립 모듈
- 기존 동작 동일

### Phase 6: 최종 정리 및 엔트리포인트 정비

**범위**: 루트 엔트리포인트 정리, 불필요한 코드 제거, manifest 경로 업데이트

**변경 대상**:
- 수정: `manifest.json` — js 경로를 `src/content.js`로 변경, service_worker를 `src/background.js`로 변경
- 수정: `popup.html` — script src를 `src/popup.js`로 변경
- 기존 루트의 `background.js`, `content.js`, `popup.js` → `src/` 하위로 이동 (또는 루트에서 src를 import하는 형태로 유지)

**기대 결과**:
- 깨끗한 프로젝트 구조
- 모든 소스 코드가 `src/` 하위에 위치
- manifest, HTML의 경로가 정확히 반영됨
- 기존 동작 동일

---

## 5. 검증 기준

### 공통 검증 항목 (모든 Phase에서 확인)

- [ ] Chrome에서 확장프로그램 로드 시 에러 없음 (manifest 파싱 성공)
- [ ] Service Worker가 정상 등록됨 (chrome://extensions에서 확인)
- [ ] Content Script가 Udemy 강의 페이지에서 정상 주입됨
- [ ] 팝업이 정상 열림

### Phase별 검증 체크리스트

#### Phase 1 검증
- [ ] background.js에서 domain 모듈 import 성공
- [ ] `buildBatchSystemPrompt()` 호출 결과 동일
- [ ] `parseBatchResponse()` 호출 결과 동일
- [ ] `lectureCacheKey()` 호출 결과 동일
- [ ] 번역 기능 정상 동작

#### Phase 2 검증
- [ ] LRU 캐시 동작 정상 (L1 히트/미스)
- [ ] chrome.storage.local 캐시 동작 정상 (L2 히트/미스)
- [ ] Claude API 호출 정상
- [ ] Gemini API 호출 정상
- [ ] 캐시 클리어 정상 동작

#### Phase 3 검증
- [ ] 배치 번역 (TRANSLATE_BATCH) 정상 동작
- [ ] 재번역 (RETRANSLATE_BATCH) 정상 동작
- [ ] 설정 변경이 즉시 반영됨
- [ ] enabled/disabled 전환 정상

#### Phase 4 검증
- [ ] 트랜스크립트 패널 감지 정상
- [ ] 자막 자동 번역 정상
- [ ] 비디오 캡션 치환 정상
- [ ] 표시 모드 전환 (translation/both/original) 정상
- [ ] SPA 네비게이션 시 Observer 재설정 정상
- [ ] 스타일 변경 즉시 반영

#### Phase 5 검증
- [ ] 팝업 설정 UI 정상 (Provider 전환, 모델 선택, 언어 선택)
- [ ] API 키 저장/불러오기 정상
- [ ] 캐시 다이얼로그 열기/닫기 정상
- [ ] 캐시 목록 조회, 선택 삭제, 전체 삭제 정상
- [ ] 스타일 미리보기 정상
- [ ] 재번역 버튼 정상

#### Phase 6 검증
- [ ] manifest.json 경로 정상
- [ ] 모든 Phase 1~5 검증 항목 재확인
- [ ] 확장프로그램 신규 설치 시 정상 동작
