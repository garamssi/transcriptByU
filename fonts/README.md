# fonts/ — 로컬 폰트 배치

MV3 CSP 때문에 폰트를 CDN에서 못 불러옵니다. 아래 woff2 파일을 **이 폴더에 정확한 파일명**으로 넣으세요.
`fonts.css`의 `@font-face`가 이 파일명을 참조합니다. 파일이 없으면 시스템 폰트로 자동 폴백됩니다(레이아웃은 정상).

## 필요한 파일 (파일명 그대로)

```
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

## 다운로드

- Pretendard (OFL 1.1): https://github.com/orioncactus/pretendard/releases
  → 릴리스의 `Pretendard-x.x.x.zip` → `public/static/`의 woff2 사용
- JetBrains Mono (OFL 1.1): https://www.jetbrains.com/lp/mono/
  → woff2 변환이 필요하면 https://gwfh.mranftl.com/fonts/jetbrains-mono

## 콘텐츠 스크립트(영상 위 자막)에서 폰트를 쓰려면

`manifest.json`의 `web_accessible_resources`에 `fonts/*.woff2`가 이미 등록되어 있습니다.
콘텐츠 스크립트에서 주입하는 CSS의 `@font-face src`는
`chrome.runtime.getURL("fonts/Pretendard-Bold.woff2")`로 경로를 만들어 넣으세요.
(이 연결은 콘텐츠 오버레이 단계에서 적용 예정)
