# Udemy 자막 실시간 번역 확장

Udemy 강의를 볼 때 자막을 원하는 언어로 실시간 번역해서 자막 패널과 영상 위에 겹쳐 보여주는 크롬 확장입니다. 번역은 Google Gemini, Anthropic Claude API, 또는 컴퓨터에 설치한 Claude Code CLI 중 하나로 처리합니다.

Chromium 계열 브라우저(크롬, 엣지)에서 동작하며 Manifest V3 기반입니다.

## 동작 방식

강의 재생 페이지에서 자막(WebVTT)을 가로채 번역 요청을 보내고 받은 번역을 자막 패널과 영상 캡션에 덮어씁니다. 한 번 번역한 강의는 캐시에 저장해 다시 볼 때 그대로 불러옵니다.

번역을 어디서 처리할지는 세 가지 중에 고릅니다.

- **Gemini** — Google API 키만 넣으면 됩니다. 서버를 따로 띄울 필요가 없습니다.
- **Claude (API)** — Anthropic API 키만 넣으면 됩니다. 이것도 서버가 필요 없습니다.
- **Claude Code (로컬)** — 컴퓨터에 설치한 `claude` CLI로 번역합니다. 별도 API 키 없이 Claude Code 로그인으로 동작하지만 브라우저 확장과 CLI를 이어 줄 작은 프록시 서버를 localhost에 띄워야 합니다.

앞의 두 개는 키만 넣으면 끝이라 설정이 제일 간단합니다. 세 번째(Claude Code)가 이 문서에서 자세히 다루는 localhost 실행입니다.

번역 대상 언어는 한국어, 일본어, 중국어를 비롯해 스페인어·포르투갈어·프랑스어·독일어·러시아어·아랍어·힌디어·인도네시아어까지 고를 수 있고 팝업 UI 표기 언어도 영어·한국어·일본어 중에 선택할 수 있습니다.

## 확장 설치

1. 이 저장소를 내려받습니다. `git clone` 하거나 zip으로 받아 압축을 풉니다.
2. 브라우저에서 `chrome://extensions` (엣지는 `edge://extensions`)를 엽니다.
3. 오른쪽 위 **개발자 모드**를 켭니다.
4. **압축해제된 확장 프로그램을 로드합니다**를 눌러 이 저장소 폴더를 고릅니다.
5. Udemy 강의 재생 페이지(주소에 `/learn/`이 들어가는 페이지)를 열고, 툴바의 확장 아이콘을 눌러 설정 팝업을 엽니다.

웹스토어 업로드용 zip이 필요하면 아래 "빌드와 개발"을 보세요.

## 제공자 설정

팝업 위쪽에서 제공자를 고릅니다.

- **Gemini**: Gemini 탭을 고르고 API 키를 넣은 뒤 저장합니다. 키는 Google AI Studio에서 발급합니다.
- **Claude**: Claude 탭을 고르고 Anthropic API 키(`sk-ant-...`)를 넣은 뒤 저장합니다.
- **Claude Code**: 기본값입니다. 프록시 서버 URL은 `http://localhost:3456`으로 두고, 아래 절차대로 로컬 서버를 띄웁니다.

같은 팝업에서 모델, 번역 대상 언어, 표시 모드(번역만 / 원본+번역 / 원본만), 자막 글꼴·색·배경 등도 조절합니다.

## Claude Code 로컬 프록시 실행

이 방식은 확장이 직접 외부 API로 요청하지 않고 컴퓨터에 설치된 `claude` CLI로 번역합니다. 브라우저 확장과 터미널 CLI는 서로 직접 통신할 수 없기 때문에, 그 사이에 작은 HTTP 서버(`proxy-server/server.js`)를 `localhost:3456`에 띄워 다리를 놓습니다. 이 서버가 확장의 번역 요청을 받아 내부적으로 `claude -p`를 돌리고 결과를 돌려줍니다.

### 먼저 설치할 것 (Mac·Windows 공통)

1. **Node.js** — v22를 권장합니다. [nodejs.org](https://nodejs.org)에서 LTS를 설치하거나, Mac이면 nvm으로 설치해도 됩니다. 설치 후 `node --version`으로 확인합니다.
2. **Claude Code CLI**:
   ```
   npm install -g @anthropic-ai/claude-code
   ```
   설치 후 `claude --version`으로 확인합니다.
3. **claude 로그인** — 터미널에서 `claude`를 한 번 실행하고 안내에 따라 로그인합니다(브라우저로 OAuth). 이 로그인이 되어 있어야 프록시가 번역을 돌릴 수 있습니다.

프록시 서버는 Node 내장 모듈만 쓰기 때문에 `proxy-server`에서 `npm install`을 할 필요가 없습니다. 위 세 가지만 되어 있으면 됩니다.

실행 방식은 두 가지입니다. 간단하게 쓰려면 **직접 실행**을, 창을 닫아도 백그라운드로 계속 떠 있길 원하면 **Docker**를 쓰세요.

### macOS

**직접 실행**

- Finder에서 `docs/start-proxy.command`를 더블클릭합니다. 터미널이 열리며 서버가 뜹니다. 창을 닫거나 Ctrl+C를 누르면 종료됩니다. 3456 포트를 쓰는 기존 서버가 있으면 자동으로 정리하고 다시 띄웁니다.
- 터미널에서 직접 돌려도 됩니다.
  ```
  node proxy-server/server.js
  ```
- nvm으로 node를 설치했는데 더블클릭 시 "node를 찾을 수 없다"고 나오면, `start-proxy.command`가 nvm을 로드하도록 되어 있으니 그 스크립트를 쓰거나 터미널에서 직접 실행하세요.

**Docker** (백그라운드 상시 실행)

- Docker Desktop을 설치하고 실행한 뒤 `docker/run.command`를 더블클릭합니다.
- 이 스크립트는 macOS 키체인에서 claude 로그인 토큰을 꺼내 `docker/secrets/credentials.json`으로 저장하고 이미지를 빌드한 다음(최초 1회는 오래 걸립니다), 컨테이너를 백그라운드로 띄웁니다. 창을 닫아도 유지되고 재부팅하면 Docker Desktop과 함께 다시 뜹니다.
- 로그인 토큰이 만료되면 `docker/refresh-creds.command`를 실행해 갱신합니다.
- 중지는 `docker stop claude-proxy`, 로그는 `docker logs -f claude-proxy`.

### Windows

**직접 실행**

- `docs/start-proxy.bat`을 더블클릭합니다. `.ps1` 파일은 더블클릭으로 실행되지 않지만 같은 이름의 `.bat` 런처가 대신 실행해 줍니다. 실행 정책(ExecutionPolicy)을 따로 만질 필요가 없습니다.
- 명령으로 직접 실행하려면 PowerShell에서:
  ```
  powershell -ExecutionPolicy Bypass -File .\docs\start-proxy.ps1
  ```
- 3456 포트를 쓰는 기존 서버가 있으면 자동 종료 후 다시 띄웁니다. 창을 닫거나 Ctrl+C로 종료합니다.
- claude 로그인 자격증명은 `%USERPROFILE%\.claude\.credentials.json`에 저장됩니다.

**Docker** (백그라운드 상시 실행)

- Docker Desktop(WSL2 백엔드 권장)을 설치·실행한 뒤 `docker/run.bat`을 더블클릭합니다. 또는 `powershell -ExecutionPolicy Bypass -File .\docker\run.ps1`.
- `%USERPROFILE%\.claude\.credentials.json`을 컨테이너에 마운트해 로컬 로그인을 그대로 씁니다. 호스트에서 다시 로그인했다면 `run.ps1`을 다시 실행해 갱신합니다.
- 볼륨 마운트가 안 되면 `run.ps1`의 경로를 포워드 슬래시 형식(`C:/Users/...`)으로 바꿔 시도하세요.
- 중지는 `docker stop claude-proxy`, 로그는 `docker logs -f claude-proxy`.

Windows 세부 안내는 `docs/windows-setup.md`에 더 있습니다.

### 실행 확인

서버가 떴는지는 헬스체크로 확인합니다.

```
curl http://localhost:3456/health
```

`{"status":"ok"}`가 나오면 정상입니다. 확장 팝업의 상태 표시도 "Claude Code 준비됨"으로 바뀝니다. "미실행"으로 보이면 서버가 안 떠 있거나 포트가 다릅니다.

## 문제 해결

- **`claude`를 찾을 수 없음**: `claude --version`이 되는지, npm 전역 설치 경로가 PATH에 잡혀 있는지 확인합니다. 서버 시작 로그에도 경고가 찍힙니다.
- **포트 3456이 사용 중**: 그 포트를 쓰는 프로세스를 종료하거나, 다른 포트로 띄웁니다. 예: `PORT=4000 node proxy-server/server.js`. 이때 확장 팝업의 프록시 URL도 같은 포트로 맞춰야 합니다.
- **상태가 계속 "미실행"**: 서버가 떠 있는지(`/health`), claude 로그인이 유효한지 확인합니다. Docker로 돌린다면 토큰이 만료됐을 수 있으니 갱신합니다(mac은 `docker/refresh-creds.command`, Windows는 호스트에서 재로그인 후 `run` 스크립트 재실행).
- **자막이 안 뜸**: 강의 재생 페이지(주소에 `/learn/lecture/`가 있는 페이지)인지, 그 강의에 자막 트랙이 있는지 확인합니다.

## 빌드와 개발

- **배포용 zip 생성**: `./build-extension.sh` — `content.js`를 esbuild로 다시 번들하고 런타임 파일만 담아 웹스토어 업로드용 zip을 만듭니다. Node와 npx(esbuild)가 필요합니다.
- **테스트**: `node --test` — 도메인·i18n·캐시 로직의 단위 테스트입니다. (디렉토리 인자 없이 그냥 `node --test`로 실행하세요.)
- **소스 구조 주의**: `content.js`는 `content.src.js`에서 번들된 산출물입니다. 콘텐츠 스크립트를 고칠 때는 `content.src.js`와 `src/presentation/content/*`를 수정한 뒤 다시 번들해야 합니다.
  ```
  npx esbuild content.src.js --bundle --outfile=content.js
  ```
  `build-extension.sh`를 돌리면 이 번들 과정도 함께 처리됩니다.

## 저장·개인정보

API 키와 설정, 번역 캐시는 브라우저의 `chrome.storage.local`에만 저장되고 별도 서버로 전송되지 않습니다. Claude Code 방식에서 번역 텍스트는 로컬 프록시를 거쳐 claude CLI로만 전달됩니다. 자세한 내용은 `docs/privacy-policy.md`를 참고하세요.
