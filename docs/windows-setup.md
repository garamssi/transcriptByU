# Windows 11 실행 가이드

macOS의 `.command` 대신 Windows에서는 PowerShell 스크립트(`.ps1`)로 프록시 서버를 실행합니다. **직접 실행**과 **Docker** 두 방식이 있습니다.

## 공통 사전 준비

- 호스트에서 `claude` 로그인이 완료돼 있어야 합니다. (자격증명은 `%USERPROFILE%\.claude\.credentials.json`에 저장됩니다.)
- 확장 프로그램 설정은 그대로 둡니다: provider = **claude-code**, URL = `http://localhost:3456` (기본값).

## 가장 간단한 방법: `.bat` 더블클릭 (권장)

`.ps1` 파일은 더블클릭으로 실행되지 않지만, 함께 제공되는 `.bat` 런처는 더블클릭으로 바로 실행됩니다. 별도 명령 입력이나 실행 정책(ExecutionPolicy) 설정이 필요 없습니다.

- 직접 실행: **`docs\start-proxy.bat`** 더블클릭
- Docker: **`docker\run.bat`** 더블클릭

각 `.bat`은 옆에 있는 같은 이름의 `.ps1`을 PowerShell로 실행해 주는 얇은 런처입니다. 아래의 명령어 실행 방법은 `.bat` 대신 직접 실행하고 싶을 때 참고하세요.

## .ps1 직접 실행 안내 (ExecutionPolicy)

`.bat` 없이 `.ps1`을 직접 실행하려면 아래 중 하나로 실행하세요. (`.ps1`은 더블클릭으로는 실행되지 않습니다.)

- 파일 우클릭 → **"PowerShell에서 실행"**
- 또는 PowerShell 창에서:
  ```powershell
  powershell -ExecutionPolicy Bypass -File .\docs\start-proxy.ps1
  ```
- 매번 입력이 번거로우면 현재 사용자 정책을 한 번만 완화할 수 있습니다(선택):
  ```powershell
  Set-ExecutionPolicy -Scope CurrentUser -ExecutionPolicy RemoteSigned
  ```

---

## 방식 A. 직접 실행 (Node.js 필요, Docker 불필요)

**사전 준비:** Node.js 설치(호스트 버전과 맞춤, v22 권장).

**`docs\start-proxy.bat` 더블클릭** — 또는 명령으로 직접 실행하려면:

```powershell
powershell -ExecutionPolicy Bypass -File .\docs\start-proxy.ps1
```

- 포트 3456을 쓰는 기존 서버가 있으면 자동 종료 후 새로 실행합니다.
- 창을 닫거나 Ctrl+C를 누르면 서버가 종료됩니다.

## 방식 B. Docker (권장, 안정적)

**사전 준비:** Docker Desktop 설치 및 실행(WSL2 백엔드 권장).

**`docker\run.bat` 더블클릭** — 또는 명령으로 직접 실행하려면:

```powershell
powershell -ExecutionPolicy Bypass -File .\docker\run.ps1
```

- `%USERPROFILE%\.claude\.credentials.json`을 `docker\secrets\`로 복사한 뒤 그 사본을 컨테이너에 마운트해 "내 로컬 로그인"을 그대로 사용합니다. (호스트에서 다시 로그인했다면 `run.ps1`을 다시 실행해야 갱신됩니다.)
- 백그라운드(`-d`)로 실행되어 창을 닫아도 서버가 유지되고, 재부팅 시 Docker Desktop과 함께 자동으로 다시 뜹니다.
- 중지: `docker stop claude-proxy` / 로그: `docker logs -f claude-proxy`

### Docker 볼륨 경로 문제 시

`-v "C:\...\credentials.json:/root/.claude/.credentials.json"`에서 마운트가 안 되면, `run.ps1`의 해당 줄을 포워드 슬래시 형식으로 바꿔 시도하세요. 예: `C:\Users\me\...` → `C:/Users/me/...`.

---

## 두 방식 중 무엇을 쓸까?

- **Docker (권장):** 백그라운드 상시 실행, 재부팅 자동 복구, 환경 격리.
- **직접 실행:** Docker 없이 간편하지만 창을 열어 둬야 하고 Node.js가 필요합니다.
