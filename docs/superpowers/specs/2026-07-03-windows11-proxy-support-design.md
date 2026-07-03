# Windows 11 프록시 서버 지원 설계

- 작성일: 2026-07-03
- 대상: Claude Code 로컬 프록시 서버 (`proxy-server/server.js`)의 Windows 11 실행 지원
- 상태: 승인됨 (구현 대기)

## 1. 배경

현재 프록시 서버는 두 가지 방식으로 실행되며, 실행 런처가 모두 macOS 전용(`.command`)이다.

1. **직접 실행**: `docs/start-proxy.command` → `node proxy-server/server.js`
2. **Docker**: `docker/run.command` → 이미지 빌드 후 컨테이너 실행

macOS에서는 테스트 완료됐으나, 두 런처와 `server.js`에 Windows에서 동작하지 않는 부분이 있다. 확장 프로그램(콘텐츠 스크립트/팝업)은 `http://localhost:3456`(기본값)으로 붙으므로 OS와 무관하며 **변경 대상이 아니다**.

### 확인된 사실 (검증 완료)

1. **Windows 자격증명 위치**: `%USERPROFILE%\.claude\.credentials.json` 파일. (Windows Credential Manager 아님. `CLAUDE_CONFIG_DIR` 설정 시 그 경로 하위.) macOS의 Keychain(`security find-generic-password -s "Claude Code-credentials"`) 추출은 Windows에서 불필요하고 불가능.
2. **`spawn` 제약**: Windows에서 `claude`는 `claude.cmd`(배치 shim)로 설치됨. CVE-2024-27980 패치 이후 Node는 `shell:true` 없이 `.cmd`/`.bat` 실행을 거부(EINVAL). 따라서 Windows에서는 `shell:true` 필요.
3. **stdin 동작**: `claude -p`는 파이프된 stdin을 프롬프트로 읽음. 프롬프트를 argv 대신 stdin으로 전달하면 `shell:true` 하에서도 shell 인젝션이 발생하지 않음.

## 2. 목표와 비목표

### 목표
- Windows 11에서 **직접 실행**과 **Docker** 두 방식 모두 동작.
- 기존 macOS `.command` 파일과 동작을 **보존**(수정/삭제 없음).
- Windows 전용 신규 파일을 기존 파일과 병렬 네이밍으로 추가.

### 비목표
- 확장 프로그램 코드 변경 (불필요).
- macOS 실행 경로의 동작 변경 (byte-for-byte 보존).
- WSL/Git Bash 경유 실행 지원 (네이티브 PowerShell/Docker Desktop만 대상).

## 3. 산출물

### 신규 파일 (3개)

| 파일 | 대응 macOS 파일 | 역할 |
|---|---|---|
| `docs/start-proxy.ps1` | `docs/start-proxy.command` | 직접 실행 런처 (Windows 11) |
| `docker/run.ps1` | `docker/run.command` | Docker 런처 (Windows 11) |
| `docs/windows-setup.md` | — | 한글 설치/실행 가이드 |

### 수정 파일 (1개, 가감식)

| 파일 | 변경 성격 |
|---|---|
| `proxy-server/server.js` | Windows 분기 **추가**. 비-Windows 경로는 현행 동작 그대로 보존. |

### 변경 없음
`docker/Dockerfile`, `docker/entrypoint.sh`(컨테이너는 Linux라 Windows 분기 미사용), 기존 `.command` 2개, 확장 프로그램 전체.

## 4. 상세 설계

### 4.1 `proxy-server/server.js` (Windows 분기 추가)

플랫폼 감지 상수 추가:

```js
const isWindows = process.platform === 'win32';
```

**`callClaude(prompt, model)`**
- **비-Windows (현행 유지)**: `spawn('claude', ['-p', prompt, ...(model?['--model',model]:[])], { timeout, stdio: ['ignore','pipe','pipe'] })`
- **Windows**: `spawn('claude', ['-p', ...(model?['--model',model]:[])], { timeout, stdio: ['pipe','pipe','pipe'], shell: true })` 후 `proc.stdin.write(prompt); proc.stdin.end();`
  - 프롬프트는 argv가 아닌 **stdin**으로 전달 → `shell:true` 하에서도 인젝션 없음.
- stdout/stderr 수집, `error`/`close` 처리 로직은 공통 유지.

**모델 값 검증 (양 플랫폼 공통, 안전장치)**
- `model`이 존재하고 `/^[A-Za-z0-9._:-]+$/`에 맞지 않으면 `callClaude`에서 에러를 던진다 → 기존 `/translate` catch 핸들러가 처리 → 500 + `{ error }` 응답(기존 오류 처리 흐름과 동일).
- `shell:true`에서 argv로 들어가는 `--model <model>` 인젝션 차단. macOS에서도 무해.

**버전 체크**
- `execFileSync('claude', ['--version'], { encoding:'utf-8', timeout:5000, shell: isWindows })`
- macOS는 `shell:false`(현행과 동일), Windows만 `shell:true`.

불변식: 비-Windows 실행 결과와 로그는 기존과 동일해야 한다.

### 4.2 `docs/start-proxy.ps1` (직접 실행 런처)

기존 `start-proxy.command` 흐름을 Windows 관용구로 이식.

1. 창 제목 설정: `$Host.UI.RawUI.WindowTitle = "Claude Code Proxy Server"`
2. 프로젝트 루트로 이동: `Set-Location (Split-Path -Parent $PSScriptRoot)` (docs/의 상위)
3. `node` 존재 확인: `Get-Command node -ErrorAction SilentlyContinue` 없으면 안내 후 종료. (nvm 로딩 불필요 — PowerShell은 PATH 상속.)
4. 포트 3456 기존 프로세스 종료:
   - `Get-NetTCPConnection -LocalPort 3456 -State Listen -ErrorAction SilentlyContinue | Select-Object -Expand OwningProcess -Unique | ForEach-Object { Stop-Process -Id $_ -Force -ErrorAction SilentlyContinue }`
5. 배너 출력 후 `node proxy-server\server.js` 실행.
6. 서버 종료 후 창 유지: `Read-Host "종료하려면 Enter 키를 누르세요"`.

### 4.3 `docker/run.ps1` (Docker 런처)

기존 `run.command` 흐름 이식. **핵심 차이: Keychain 추출 → 자격증명 파일 복사.**

1. 창 제목 설정, 프로젝트 루트로 이동.
2. 사전 점검: `docker info` 성공 여부로 Docker Desktop 구동 확인. 실패 시 안내 후 종료.
3. **[1/3] 자격증명 확보**:
   - 소스 경로: `$base = if ($env:CLAUDE_CONFIG_DIR) { $env:CLAUDE_CONFIG_DIR } else { Join-Path $env:USERPROFILE '.claude' }`; `$src = Join-Path $base '.credentials.json'`
   - `$src` 없으면 "호스트에서 claude 로그인 확인" 안내 후 종료.
   - `docker\secrets\` 생성 후 `$src` → `docker\secrets\credentials.json` 복사.
4. **[2/3] 이미지 빌드**: `docker build -f docker/Dockerfile -t claude-proxy .`
5. **[3/3] 컨테이너 실행**:
   - `docker rm -f claude-proxy`(무시 가능 오류)
   - `$cred = (Resolve-Path .\docker\secrets\credentials.json).Path`
   - `docker run -d --name claude-proxy --restart unless-stopped -p 3456:3456 -v "${cred}:/root/.claude/.credentials.json" claude-proxy`
   - **주의**: Windows 절대경로의 드라이브 문자 콜론(`C:\`)과 `-v` 구분자 콜론이 겹치는 알려진 이슈가 있음. Docker Desktop이 드라이브 문자를 인식하지만, 실제 Windows에서 검증 필요. 실패 시 대안(포워드 슬래시 형식)을 가이드에 명시.
6. 헬스체크 폴링: `Invoke-WebRequest -UseBasicParsing http://localhost:3456/health`를 try/catch로 최대 ~15회 재시도.
7. 상태 출력 후 `docker logs -f claude-proxy`.

### 4.4 `docs/windows-setup.md` (한글 가이드)

- **사전 준비**: 직접 실행=Node.js(호스트 버전과 맞춤), Docker 방식=Docker Desktop. 공통=`claude` 로그인 완료.
- **첫 실행 시 ExecutionPolicy**: `.ps1`은 더블클릭으로 실행되지 않음. 권장 실행법:
  - `powershell -ExecutionPolicy Bypass -File .\docs\start-proxy.ps1`
  - 또는 우클릭 → "PowerShell에서 실행".
- **두 방식 선택 가이드**: Docker 방식 권장(안정성), 직접 실행은 Docker 없이 간편.
- **확장 설정**: provider=claude-code, URL=`http://localhost:3456`(기본값, 변경 불필요).
- Docker 볼륨 경로 문제 시 대안 형식 안내.

## 5. 오류 처리

- **직접 실행**: node 미설치, 포트 점유(자동 종료 시도), claude CLI 미발견(`server.js`가 `CLI_NOT_FOUND`/버전 경고 출력) 각각 안내.
- **Docker**: Docker Desktop 미구동, 자격증명 파일 없음, 빌드 실패, 헬스체크 실패(`docker logs` 안내) 각각 처리.
- **server.js**: 잘못된 `model` 값은 검증에서 거부. Windows spawn 실패 시 기존 `error` 핸들러가 `CLI_NOT_FOUND` 반환.

## 6. 검증 계획

macOS(현 개발기)에서 가능한 검증:
- `server.js` 비-Windows 경로 회귀: 기존 `start-proxy.command`로 번역 요청 정상 동작(동작 불변 확인).
- 모델 값 검증 로직 단위 확인.
- PowerShell 스크립트 정적 검토(문법/명령 존재성). PSScriptAnalyzer 사용 가능 시 적용.

실제 Windows 11 환경에서 필요한 검증(사용자 협조):
- `docs/start-proxy.ps1`로 직접 실행 → 번역 성공.
- `docker/run.ps1`로 Docker 실행 → 헬스체크 통과 및 번역 성공.
- Docker 볼륨 경로(드라이브 문자 콜론) 정상 마운트 확인.

## 7. 미해결/위험 요소

- Docker `-v` 볼륨 경로의 Windows 드라이브 콜론 이슈는 실제 환경 검증 전까지 가정. 가이드에 대안 명시로 완화.
- `server.js`의 Windows stdin 경로는 검증된 CLI 동작에 기반하나, 실제 Windows에서 최종 확인 필요.
