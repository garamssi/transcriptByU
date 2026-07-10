# Udemy Live Translator — 리뉴얼 패키지

프리미엄 다크 방향 리뉴얼 결과물입니다. (팝업 방향 1c, 아이콘 다크 툴바 기준)

## 폴더 구성

```
export/
├─ CLAUDE_CODE_PROMPT.md     ← Claude Code에 붙여넣을 작업 프롬프트
├─ FONTS.md                  ← 폰트 다운로드 + 번들 가이드 (필독)
├─ icons/                    ← 확장 아이콘 (그대로 manifest에 사용)
│   ├─ icon16.png  icon32.png  icon48.png  icon128.png  icon512.png
│   └─ mark.svg   mark-16.svg  (벡터 원본)
├─ store/                    ← 크롬 웹스토어 소개 이미지 (1280×800)
│   ├─ screenshot-1-1280x800.png   (히어로)
│   ├─ screenshot-2-1280x800.png   (실사용 자막)
│   ├─ screenshot-3-1280x800.png   (제공자·설정)
│   └─ screenshot-4-1280x800.png   (캐시)
├─ slides/                   ← 위 스토어 이미지의 원본 HTML (1280×800, 편집/재캡처용)
│   └─ store-1..4-*.html
└─ design/                   ← 팝업/캐시 디자인 시안 원본
    ├─ Popup.dc.html
    ├─ Cache Manager.dc.html
    └─ support.js            (시안 프리뷰 실행용)
```

## 사용 순서

1. **FONTS.md** 를 먼저 읽고 Pretendard / JetBrains Mono 를 다운로드해 확장에 번들.
2. **CLAUDE_CODE_PROMPT.md** 를 Claude Code에 붙여넣어 UI 교체 작업 진행.
3. **icons/** PNG 를 `manifest.json` 아이콘으로 교체.
4. **store/** PNG 를 크롬 웹스토어 스크린샷으로 업로드 (1280×800 규격).

## 참고

- 스토어 "실사용 자막" 이미지는 목업 강의 화면입니다. 실제 Udemy 캡처가 있으면 `slides/store-2-in-action.html` 의 영상 영역만 교체 후 재캡처하세요.
- 색/구조 토큰은 CLAUDE_CODE_PROMPT.md 상단 디자인 시스템 섹션에 정리돼 있습니다.
