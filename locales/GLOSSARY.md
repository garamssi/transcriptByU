# UI 번역 용어집 & 스타일 가이드 (i18n Glossary)

이 문서는 `locales/*.json`을 **번역할 때의 선택 기준**을 규정한다. 문자열의 원본(source of truth)은 `en.json`이며, 이 문서는 문자열을 중복 보관하지 않는다 — "무엇을 어떤 단어·톤으로 옮기는가"만 고정한다.

새 언어를 추가할 때 이 문서가 번역자(사람 또는 LLM)의 **브리프**가 된다. 목적: (1) 언어 간 일관성, (2) 원문(영어) 일관성, (3) 무엇을 번역하지 않을지.

관련: 설계 `docs/superpowers/specs/2026-07-23-ui-language-i18n-design.md`, 런타임 `src/shared/i18n.js`.

---

## 1. 번역 금지 (Do-Not-Translate)

아래는 **모든 언어에서 원형 그대로** 둔다.

- **브랜드/고유명사**: `Claude`, `Claude Code`, `Gemini`, `Anthropic`, `Google`, `Udemy`
- **모델명**: `Haiku 4.5`, `Sonnet 5`, `Opus 4.8`, `Flash-Lite 3.1`, `Flash 3.5`, `3.1 Pro` (등급 설명어 `fast/balanced/…`는 번역 대상 — §3 참고)
- **기술어**: `API`(약어), `URL`, `VTT`, `node`, `proxy-server/server.js` 같은 명령/경로
- **언어 선택기 엔도님**: `English`, `한국어`, `日本語`, `中文` — 언어 자기 이름은 **어느 UI 언어에서도 그대로**(번역 대상 언어 드롭다운 `#targetLang`, 화면 언어 드롭다운 `#uiLang`의 옵션 라벨).
- **플레이스홀더 토큰**: `{count}` `{total}` `{selected}` `{provider}` `{lang}` — 번역·변형 금지, **위치만** 언어 어순에 맞게 이동.
- **기호**: `✓`, `·`(가운뎃점), `...`(말줄임)

---

## 2. 핵심 용어 대응표

한 개념은 한 단어로. 새 언어는 **열만 추가**한다. (동의어 중 하나로 고정 — 예: person/human은 하나로.)

| 개념 (concept) | en | ko | (ja) | (zh) |
|---|---|---|---|---|
| translation / translate | Translation / translate | 번역 | | |
| subtitle | subtitle | 자막 | | |
| cache | Cache | 캐시 | | |
| provider | Provider | 제공자 | | |
| model | Model | 모델 | | |
| display (mode) | Display | 표시 | | |
| original (text) | Original | 원본 | | |
| background | Background | 배경 | | |
| opacity | opacity | 투명도 | | |
| text color | Text color | 글자 색상 | | |
| font size | Font size | 글자 크기 | | |
| panel | Panel | 패널 | | |
| preview | Preview | 미리보기 | | |
| course | course | 코스 | | |
| section | section | 섹션 | | |
| lesson | lesson | 레슨 | | |
| save | Save | 저장 | | |
| delete | Delete | 삭제 | | |
| select | Select | 선택 | | |
| search | Search | 검색 | | |
| ready | ready | 준비됨 | | |
| language (UI) | Language | 화면 언어 | | |
| on / enabled | on | 켜짐 (토글) / 사용 (스위치) | | |
| off / disabled | off | 꺼짐 | | |

> 참고: ko에서 `on`은 문맥별로 다르다 — 토글 헤드라인은 `켜짐/꺼짐`(enableOn/Off), 개별 스위치 라벨은 `사용`(style.use). 새 언어도 이 둘을 구분할지 판단.

---

## 3. 모델 등급 설명어 (`model.tier.*`)

모델명 뒤 괄호에 붙는 등급어. 번역 대상.

| tier 키 | en | ko |
|---|---|---|
| fastCheap | fast / cheap | 빠름/저렴 |
| fast | fast | 빠름 |
| balanced | balanced | 균형 |
| recommended | recommended | 권장 |
| highQuality | high quality | 고품질 |

렌더 형태: `{모델명} ({등급어})` — 예 `Sonnet 5 (balanced)` / `Sonnet 5 (균형)`.

---

## 4. 언어별 톤·격식 & 표기

- **English**: 문장은 sentence case(제목식 Title Case 금지). 버튼/짧은 라벨은 명령형·간결(`Save`, `Delete selected`, `Re-translate`). 라벨 끝에 마침표 없음. 느낌표는 성공 메시지에만(`Saved!`). 상태는 형용사/명사구(`ready`, `Waiting`).
- **한국어**: 간결 존댓말. 지시는 `…하세요/…해 주세요`(openUdemy, statusNeedKey). 상태는 `…중/…됨/…완료`(대기 중·준비됨·저장 완료). 토글 상태는 `켜짐/꺼짐`. 과한 `…습니다`체는 UI 라벨에선 피함.
- **(예정) 日本語**: です/ます 정중체, UI 라벨은 체언止め 허용(예: `翻訳`). 속어 금지.
- **(예정) 中文(简体)**: 简体字, 중립·정중. 句号 사용 최소.
- **공통 표기**: 말줄임은 `...`(ASCII 3점, 현행 `Loading...`/`재번역 중...`에 맞춤). 구분자는 `·`.

---

## 5. 플레이스홀더 · 구조 규칙

- `{param}` 토큰은 **그대로 유지**, 어순에 따라 위치만 이동. 예: 영어 `{count} subtitles` ↔ 한국어 `{count}개 자막`(수사+분류사+명사).
- 키 구조는 **중첩 dot 키** 그대로. 새 언어는 `en.json`을 복제해 **값만** 교체(키·중첩·토큰·기호 보존).
- `langNames`는 "번역 대상 언어 엔도님 → 해당 UI 언어로의 표시명" 맵이다(배지용). 예: en에선 `한국어→Korean`, ko에선 `한국어→한국어`. 새 UI 언어 파일도 이 세 키(`한국어`/`日本語`/`中文`)에 그 언어로의 표시명을 넣어야 배지가 옳게 나온다.

---

## 6. 알려진 한계 · 결정 필요 (객관적 기록)

- **복수형/성(gender) 미지원**: `t()`는 단순 치환만 한다. 그래서 영어 `{count} subtitles`는 `count=1`일 때 "1 subtitles"로 문법상 어색하다(현재 수용). 러시아어·아랍어·폴란드어 등 복수 범주가 여러 개인 언어를 추가하면 어색해진다. → **선택**: 단순형 수용, 또는 `t()`를 ICU plural로 확장.
- **"Udemy" 표기 불일치**: 대부분 `Udemy`(라틴)인데 `style.udemyDefault`의 ko 값만 `유데미 기본`으로 음차돼 있다. → **권장**: 브랜드는 `Udemy`로 통일(ko를 `Udemy 기본`으로). 새 언어는 음차하지 말 것. (문자열 수정은 별도 작업.)
- **parity 테스트 범위**: `tests/catalog-parity.test.js`는 현재 **en↔ko만** 비교한다. 세 번째 언어를 추가하면 그 파일도 **모든 로케일**을 비교하도록 확장해야 누락이 잡힌다.

---

## 7. 새 언어 추가 체크리스트 (SDD 태스크로 실행 권장)

1. `en.json` → `locales/<lang>.json` 복제, 이 문서 기준으로 **값만** 번역(키·토큰·기호·`langNames` 세 키 유지).
2. `popup.js`에 import(attributes) 추가 + `content.src.js`에 import(plain) 추가 → 양쪽 `setCatalogs({ en, ko, <lang> })`.
3. `popup.html`의 `<select id="uiLang">`에 `<option value="<lang>">{엔도님}</option>` 추가(엔도님은 번역 금지).
4. `content.src.js` 변경 시 `npx esbuild content.src.js --bundle --outfile=content.js`로 재번들.
5. `tests/catalog-parity.test.js`를 전 로케일 비교로 확장, `node --test`로 검증(참고: `node --test tests/`는 이 Node에서 오작동 — 인자 없이 실행).
6. 브라우저에서 전환·표기 수동 확인.

> `setLocale`은 카탈로그에 등록된 로케일이면 그대로 쓰고, 아니면 `'en'`으로 폴백한다 — 즉 2번에서 등록만 하면 새 로케일이 활성화 가능해진다.
