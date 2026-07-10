# 폰트 가이드 — Udemy Live Translator

이 디자인은 **두 가지 폰트**만 사용합니다.

| 용도 | 폰트 | 두께 |
|---|---|---|
| 본문·UI 전체 (한글 포함) | **Pretendard** | 400 / 500 / 600 / 700 / 800 |
| 숫자·값 뱃지·코드·모노 라벨 | **JetBrains Mono** | 400 / 500 / 600 / 700 |

둘 다 **오픈소스(무료, 상업적 사용 가능)** 입니다.

- Pretendard — SIL Open Font License 1.1
- JetBrains Mono — SIL Open Font License 1.1

---

## ⚠️ 중요: 크롬 확장은 폰트를 CDN에서 못 불러옵니다

시안 HTML은 편의상 CDN(`jsdelivr`, `fonts.googleapis.com`)에서 폰트를 불러오지만, **크롬 확장(MV3)은 CSP 때문에 원격 폰트/CSS 로드가 차단**됩니다. 따라서 확장에 넣을 때는 **반드시 폰트 파일을 다운로드해서 확장 폴더에 번들**하고 로컬 `@font-face`로 선언해야 합니다.

## 1. 다운로드

### Pretendard
- 공식 릴리스: https://github.com/orioncactus/pretendard/releases
- 릴리스에서 `Pretendard-x.x.x.zip` 다운로드 → 압축 해제 → `public/static/` 안의 `woff2` 파일 사용
- 필요한 굵기만 복사: `Pretendard-Regular.woff2`, `-Medium.woff2`, `-SemiBold.woff2`, `-Bold.woff2`, `-ExtraBold.woff2`
- (용량 최적화가 필요하면 동적 서브셋 버전 `Pretendard-dynamic-subset`도 있음)

### JetBrains Mono
- 공식: https://www.jetbrains.com/lp/mono/  →  "Download" 버튼
- 또는 Google Fonts: https://fonts.google.com/specimen/JetBrains+Mono  →  "Get font"
- `woff2` 변환이 필요하면 https://gwfh.mranftl.com/fonts/jetbrains-mono 에서 woff2로 받을 수 있음
- 필요한 굵기: `Regular`, `Medium`, `SemiBold`, `Bold`

## 2. 확장 폴더에 배치

```
extension/
  fonts/
    Pretendard-Regular.woff2
    Pretendard-Medium.woff2
    Pretendard-SemiBold.woff2
    Pretendard-Bold.woff2
    Pretendard-ExtraBold.woff2
    JetBrainsMono-Regular.woff2
    JetBrainsMono-Medium.woff2
    JetBrainsMono-SemiBold.woff2
    JetBrainsMono-Bold.woff2
```

## 3. @font-face 선언 (fonts.css)

```css
/* Pretendard */
@font-face{font-family:"Pretendard";font-weight:400;font-display:swap;
  src:url("../fonts/Pretendard-Regular.woff2") format("woff2");}
@font-face{font-family:"Pretendard";font-weight:500;font-display:swap;
  src:url("../fonts/Pretendard-Medium.woff2") format("woff2");}
@font-face{font-family:"Pretendard";font-weight:600;font-display:swap;
  src:url("../fonts/Pretendard-SemiBold.woff2") format("woff2");}
@font-face{font-family:"Pretendard";font-weight:700;font-display:swap;
  src:url("../fonts/Pretendard-Bold.woff2") format("woff2");}
@font-face{font-family:"Pretendard";font-weight:800;font-display:swap;
  src:url("../fonts/Pretendard-ExtraBold.woff2") format("woff2");}

/* JetBrains Mono */
@font-face{font-family:"JetBrains Mono";font-weight:400;font-display:swap;
  src:url("../fonts/JetBrainsMono-Regular.woff2") format("woff2");}
@font-face{font-family:"JetBrains Mono";font-weight:500;font-display:swap;
  src:url("../fonts/JetBrainsMono-Medium.woff2") format("woff2");}
@font-face{font-family:"JetBrains Mono";font-weight:600;font-display:swap;
  src:url("../fonts/JetBrainsMono-SemiBold.woff2") format("woff2");}
@font-face{font-family:"JetBrains Mono";font-weight:700;font-display:swap;
  src:url("../fonts/JetBrainsMono-Bold.woff2") format("woff2");}

body{font-family:"Pretendard",system-ui,-apple-system,sans-serif;}
```

## 4. manifest.json — 콘텐츠 스크립트에서 폰트 쓰려면

영상 위 자막 오버레이에도 폰트를 쓰려면 폰트 파일을 웹 접근 가능 리소스로 등록:

```json
"web_accessible_resources": [
  { "resources": ["fonts/*.woff2"], "matches": ["*://*.udemy.com/*"] }
]
```

콘텐츠 스크립트에서 주입하는 CSS의 `@font-face` `src`는
`chrome.runtime.getURL("fonts/Pretendard-Bold.woff2")` 로 경로를 만들어 넣습니다.

---

### 요약
1. Pretendard + JetBrains Mono woff2 다운로드
2. `extension/fonts/`에 넣기
3. `fonts.css`에 로컬 `@font-face` 선언 (CDN 절대 금지)
4. 콘텐츠 스크립트용으로는 `web_accessible_resources` + `getURL()`
