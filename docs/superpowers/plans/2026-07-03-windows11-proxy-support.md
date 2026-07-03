# Windows 11 프록시 서버 지원 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Claude Code 로컬 프록시 서버를 Windows 11에서 직접 실행/Docker 두 방식으로 동작하게 하되, 기존 macOS 동작은 보존한다.

**Architecture:** `proxy-server/server.js`의 claude CLI 호출 로직을 순수 헬퍼 모듈(`claude-invocation.js`)로 추출해 플랫폼 분기를 단위 테스트 가능하게 만든다. Windows에서는 `claude.cmd` 실행을 위해 `shell:true`를 쓰되 프롬프트는 stdin으로 전달해 인젝션을 막는다. 실행 런처는 macOS `.command`와 병렬로 Windows용 `.ps1`을 신규 추가한다.

**Tech Stack:** Node.js v22 (내장 모듈만, npm 의존성 없음), `node:test` 러너, PowerShell 5+/7 (Windows), Docker Desktop (Windows, WSL2 백엔드).

## Global Constraints

- npm 의존성 추가 금지 — `proxy-server`에는 `package.json`이 없고 node 내장 모듈만 사용한다.
- macOS/Linux(비-Windows) 실행 경로의 동작은 **byte-for-byte 보존**한다. 회귀 테스트로 증명한다.
- 기존 파일 수정/삭제 금지: `docs/start-proxy.command`, `docker/run.command`, `docker/Dockerfile`, `docker/entrypoint.sh`, 확장 프로그램 전체(`content.js`, `popup.*`, `src/**`, `manifest.json`).
- Windows 자격증명 위치: `%USERPROFILE%\.claude\.credentials.json` (단, `CLAUDE_CONFIG_DIR` 설정 시 그 경로 하위의 `.credentials.json`).
- Windows에서 claude 호출: `shell:true` 필수(CVE-2024-27980로 `.cmd`를 shell 없이 실행 불가). 프롬프트는 argv가 아닌 **stdin**으로 전달.
- 모델 값 검증 정규식: `/^[A-Za-z0-9._:-]+$/`. 불일치 시 호출 거부.
- Windows 런처는 순수 PowerShell(`.ps1`). 이 개발기(macOS)에는 `pwsh`가 없어 `.ps1`은 정적 검토만 가능하며, 실제 실행 검증은 Windows 11에서 사용자가 수행한다.

## File Structure

- `proxy-server/claude-invocation.js` (신규) — 순수 헬퍼: `assertValidModel`, `buildClaudeInvocation`. side effect 없음.
- `proxy-server/claude-invocation.test.js` (신규) — `node:test` 단위 테스트.
- `proxy-server/server.js` (수정) — 헬퍼를 사용하도록 `callClaude` 재작성 + 버전 체크 `shell` 플래그. 비-Windows 동작 불변.
- `docs/start-proxy.ps1` (신규) — 직접 실행 런처 (Windows 11).
- `docker/run.ps1` (신규) — Docker 런처 (Windows 11).
- `docs/windows-setup.md` (신규) — 한글 설치/실행 가이드.

---

### Task 1: claude 호출 헬퍼 모듈 추출 + 단위 테스트

**Files:**
- Create: `proxy-server/claude-invocation.js`
- Test: `proxy-server/claude-invocation.test.js`

**Interfaces:**
- Produces:
  - `assertValidModel(model: string | undefined | null): void` — `model`이 truthy이고 `/^[A-Za-z0-9._:-]+$/`에 불일치하면 `Error('INVALID_MODEL: ...')`를 던진다. falsy면 통과.
  - `buildClaudeInvocation({ prompt: string, model?: string, isWindows: boolean, timeout: number }): { command: string, args: string[], options: object, stdinInput: string | null }` — 플랫폼에 맞는 spawn 파라미터를 반환. 내부에서 `assertValidModel(model)` 호출.
  - `MODEL_PATTERN: RegExp`

- [ ] **Step 1: Write the failing test**

Create `proxy-server/claude-invocation.test.js`:

```js
const test = require('node:test');
const assert = require('node:assert');
const { assertValidModel, buildClaudeInvocation } = require('./claude-invocation');

test('assertValidModel: 유효한 모델명은 통과', () => {
  assert.doesNotThrow(() => assertValidModel('claude-sonnet-5'));
  assert.doesNotThrow(() => assertValidModel('claude-3.5:beta_1'));
  assert.doesNotThrow(() => assertValidModel(undefined));
  assert.doesNotThrow(() => assertValidModel(''));
});

test('assertValidModel: 쉘 메타문자가 든 모델명은 거부', () => {
  assert.throws(() => assertValidModel('foo & calc'), /INVALID_MODEL/);
  assert.throws(() => assertValidModel('a;rm -rf'), /INVALID_MODEL/);
  assert.throws(() => assertValidModel('$(whoami)'), /INVALID_MODEL/);
});

test('buildClaudeInvocation: 비-Windows는 프롬프트를 argv로 전달(현행 동작)', () => {
  const inv = buildClaudeInvocation({ prompt: 'hello world', model: 'claude-sonnet-5', isWindows: false, timeout: 1000 });
  assert.strictEqual(inv.command, 'claude');
  assert.deepStrictEqual(inv.args, ['-p', 'hello world', '--model', 'claude-sonnet-5']);
  assert.strictEqual(inv.stdinInput, null);
  assert.deepStrictEqual(inv.options.stdio, ['ignore', 'pipe', 'pipe']);
  assert.strictEqual(inv.options.shell, undefined);
  assert.strictEqual(inv.options.timeout, 1000);
});

test('buildClaudeInvocation: Windows는 프롬프트를 stdin으로 전달 + shell:true', () => {
  const inv = buildClaudeInvocation({ prompt: 'hello world', model: 'claude-sonnet-5', isWindows: true, timeout: 1000 });
  assert.strictEqual(inv.command, 'claude');
  assert.deepStrictEqual(inv.args, ['-p', '--model', 'claude-sonnet-5']);
  assert.ok(!inv.args.includes('hello world'), '프롬프트가 argv에 노출되면 안 됨');
  assert.strictEqual(inv.stdinInput, 'hello world');
  assert.strictEqual(inv.options.shell, true);
  assert.deepStrictEqual(inv.options.stdio, ['pipe', 'pipe', 'pipe']);
});

test('buildClaudeInvocation: model 미지정 시 --model 없음', () => {
  const win = buildClaudeInvocation({ prompt: 'x', isWindows: true, timeout: 1 });
  assert.deepStrictEqual(win.args, ['-p']);
  const mac = buildClaudeInvocation({ prompt: 'x', isWindows: false, timeout: 1 });
  assert.deepStrictEqual(mac.args, ['-p', 'x']);
});

test('buildClaudeInvocation: 잘못된 model 은 예외', () => {
  assert.throws(() => buildClaudeInvocation({ prompt: 'x', model: 'a|b', isWindows: false, timeout: 1 }), /INVALID_MODEL/);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test proxy-server/claude-invocation.test.js`
Expected: FAIL — `Cannot find module './claude-invocation'`

- [ ] **Step 3: Write minimal implementation**

Create `proxy-server/claude-invocation.js`:

```js
// claude CLI 호출 파라미터 생성 (플랫폼별 분기 + 모델 검증)
// server.js 에서 사용. 이 모듈은 side effect 가 없어 단위 테스트가 쉽다.

const MODEL_PATTERN = /^[A-Za-z0-9._:-]+$/;

function assertValidModel(model) {
  if (model && !MODEL_PATTERN.test(model)) {
    throw new Error(`INVALID_MODEL: ${model}`);
  }
}

// 반환: { command, args, options, stdinInput }
// - 비-Windows: 프롬프트를 argv 로 전달(현행 동작 그대로), stdinInput = null
// - Windows: claude.cmd 실행을 위해 shell:true, 프롬프트는 stdin 으로 전달(인젝션 방지)
function buildClaudeInvocation({ prompt, model, isWindows, timeout }) {
  assertValidModel(model);
  const modelArgs = model ? ['--model', model] : [];

  if (isWindows) {
    return {
      command: 'claude',
      args: ['-p', ...modelArgs],
      options: { timeout, stdio: ['pipe', 'pipe', 'pipe'], shell: true },
      stdinInput: prompt,
    };
  }

  return {
    command: 'claude',
    args: ['-p', prompt, ...modelArgs],
    options: { timeout, stdio: ['ignore', 'pipe', 'pipe'] },
    stdinInput: null,
  };
}

module.exports = { assertValidModel, buildClaudeInvocation, MODEL_PATTERN };
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test proxy-server/claude-invocation.test.js`
Expected: PASS — 6 tests pass, 0 fail.

- [ ] **Step 5: Commit**

```bash
git add proxy-server/claude-invocation.js proxy-server/claude-invocation.test.js
git commit -m "feat: claude 호출 헬퍼 추출(플랫폼 분기·모델 검증) + 테스트

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 2: server.js 에 헬퍼 연결 (Windows 분기)

**Files:**
- Modify: `proxy-server/server.js` (상단 require 추가, `callClaude` 재작성, 버전 체크 `shell` 플래그)

**Interfaces:**
- Consumes: Task 1의 `buildClaudeInvocation`.
- Produces: 외부 인터페이스 변화 없음. `/health`, `/translate` 동작 동일. 비-Windows에서는 기존과 동일한 spawn 호출이 이뤄진다.

- [ ] **Step 1: 상단에 require 와 플랫폼 상수 추가**

`proxy-server/server.js` 2번째 줄 다음(`const { spawn, execFileSync } = require('node:child_process');` 아래)에 추가:

기존:
```js
const http = require('node:http');
const { spawn, execFileSync } = require('node:child_process');
```
변경:
```js
const http = require('node:http');
const { spawn, execFileSync } = require('node:child_process');
const { buildClaudeInvocation } = require('./claude-invocation');

const isWindows = process.platform === 'win32';
```

- [ ] **Step 2: `callClaude` 함수를 헬퍼 사용으로 재작성**

기존 `callClaude` 전체(현재 32~61행):
```js
function callClaude(prompt, model) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    const errChunks = [];

    const args = ['-p', prompt];
    if (model) args.push('--model', model);

    const proc = spawn('claude', args, {
      timeout: CLI_TIMEOUT,
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    proc.stdout.on('data', (d) => chunks.push(d));
    proc.stderr.on('data', (d) => errChunks.push(d));

    proc.on('error', (err) => {
      reject(new Error(`CLI_NOT_FOUND: ${err.message}`));
    });

    proc.on('close', (code) => {
      if (code !== 0) {
        const stderr = Buffer.concat(errChunks).toString().trim();
        reject(new Error(`CLI_EXIT_${code}: ${stderr}`));
      } else {
        resolve(Buffer.concat(chunks).toString().trim());
      }
    });
  });
}
```
변경:
```js
function callClaude(prompt, model) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    const errChunks = [];

    let invocation;
    try {
      invocation = buildClaudeInvocation({ prompt, model, isWindows, timeout: CLI_TIMEOUT });
    } catch (err) {
      reject(err); // INVALID_MODEL 등은 /translate catch 에서 500 으로 응답
      return;
    }

    const proc = spawn(invocation.command, invocation.args, invocation.options);

    proc.stdout.on('data', (d) => chunks.push(d));
    proc.stderr.on('data', (d) => errChunks.push(d));

    proc.on('error', (err) => {
      reject(new Error(`CLI_NOT_FOUND: ${err.message}`));
    });

    proc.on('close', (code) => {
      if (code !== 0) {
        const stderr = Buffer.concat(errChunks).toString().trim();
        reject(new Error(`CLI_EXIT_${code}: ${stderr}`));
      } else {
        resolve(Buffer.concat(chunks).toString().trim());
      }
    });

    // Windows 경로: 프롬프트를 stdin 으로 전달(인젝션 방지). 비-Windows 는 stdinInput=null.
    if (invocation.stdinInput !== null) {
      proc.stdin.write(invocation.stdinInput);
      proc.stdin.end();
    }
  });
}
```

- [ ] **Step 3: 버전 체크에 `shell` 플래그 추가**

기존(현재 145행 부근):
```js
  const version = execFileSync('claude', ['--version'], { encoding: 'utf-8', timeout: 5000 }).trim();
```
변경:
```js
  const version = execFileSync('claude', ['--version'], { encoding: 'utf-8', timeout: 5000, shell: isWindows }).trim();
```

- [ ] **Step 4: 문법 검사**

Run: `node --check proxy-server/server.js`
Expected: 출력 없음, 종료 코드 0 (문법 오류 없음).

- [ ] **Step 5: 헬퍼 테스트 회귀 실행**

Run: `node --test proxy-server/claude-invocation.test.js`
Expected: PASS — 6 tests pass.

- [ ] **Step 6: 서버 기동 스모크 테스트 (비-Windows 회귀)**

Run:
```bash
node proxy-server/server.js & SERVER_PID=$!
sleep 1
curl -s http://localhost:3456/health
echo ""
kill $SERVER_PID 2>/dev/null
```
Expected: `{"status":"ok"}` 출력. (claude CLI 미설치여도 /health 는 응답해야 함 — 서버 기동/모듈 로드 정상 확인.)

- [ ] **Step 7: Commit**

```bash
git add proxy-server/server.js
git commit -m "feat: server.js Windows 분기(shell+stdin) 및 모델 검증 연결

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 3: 직접 실행 런처 `docs/start-proxy.ps1`

**Files:**
- Create: `docs/start-proxy.ps1`

**Interfaces:**
- Consumes: `proxy-server/server.js` (Task 2 결과). 프로젝트 루트에서 `node proxy-server\server.js` 실행.
- Produces: 사용자가 실행하는 진입점. 후속 태스크 의존 없음.

- [ ] **Step 1: 스크립트 작성**

Create `docs/start-proxy.ps1`:

```powershell
#!/usr/bin/env pwsh
# Claude Code 프록시 서버 (직접 실행) — Windows 11
# 실행법:
#   powershell -ExecutionPolicy Bypass -File .\docs\start-proxy.ps1
#   또는 파일 우클릭 > "PowerShell에서 실행"

$ErrorActionPreference = 'Stop'

# 창 제목
$Host.UI.RawUI.WindowTitle = 'Claude Code Proxy Server'

# 스크립트 위치 기준 프로젝트 루트로 이동 (docs/ 의 상위)
Set-Location (Split-Path -Parent $PSScriptRoot)

# node 존재 확인 (PowerShell 은 PATH 를 상속하므로 nvm 로딩 불필요)
if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
    Write-Host 'ERROR: node 를 찾을 수 없습니다. Node.js 를 설치하고 PATH 에 추가하세요.' -ForegroundColor Red
    Read-Host '종료하려면 Enter 키를 누르세요'
    exit 1
}

# 기존 프록시 서버(포트 3456) 종료
$listeners = Get-NetTCPConnection -LocalPort 3456 -State Listen -ErrorAction SilentlyContinue
if ($listeners) {
    Write-Host '기존 프록시 서버 종료 중...'
    $listeners | Select-Object -ExpandProperty OwningProcess -Unique | ForEach-Object {
        Stop-Process -Id $_ -Force -ErrorAction SilentlyContinue
    }
    Start-Sleep -Seconds 1
}

Write-Host '========================================'
Write-Host '  Claude Code 프록시 서버'
Write-Host '  종료하려면 Ctrl+C 또는 창 닫기'
Write-Host '========================================'
Write-Host ''

# 서버 실행 (포그라운드)
node proxy-server\server.js

# 서버가 종료되어도 창 유지
Write-Host ''
Write-Host '========================================'
Write-Host '  서버가 종료되었습니다.'
Write-Host '========================================'
Read-Host '종료하려면 Enter 키를 누르세요'
```

- [ ] **Step 2: 정적 검증 (macOS에서 가능한 범위)**

다음을 육안 확인한다(체크리스트):
- `Set-Location (Split-Path -Parent $PSScriptRoot)` — `docs/`의 상위(프로젝트 루트)로 이동하는가.
- `node proxy-server\server.js` 경로가 정확한가(루트 기준 상대경로).
- 포트 종료 로직에 `-ErrorAction SilentlyContinue`가 있어 점유 프로세스가 없어도 오류 없이 지나가는가.
- 모든 `exit`/종료 경로에 `Read-Host`(창 유지)가 있는가.

(선택) `pwsh`가 설치돼 있으면 파싱 검증:
Run: `pwsh -NoProfile -Command "[System.Management.Automation.Language.Parser]::ParseFile((Resolve-Path ./docs/start-proxy.ps1), [ref]$null, [ref]$null) > $null; 'PARSE_OK'"`
Expected: `PARSE_OK` (구문 오류 없음). pwsh 미설치 시 이 단계는 건너뛰고 Windows 실검증으로 대체.

- [ ] **Step 3: Commit**

```bash
git add docs/start-proxy.ps1
git commit -m "feat: Windows 11 직접 실행 런처 start-proxy.ps1 추가

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 4: Docker 런처 `docker/run.ps1`

**Files:**
- Create: `docker/run.ps1`

**Interfaces:**
- Consumes: `docker/Dockerfile`, `docker/entrypoint.sh` (변경 없음). 호스트 `%USERPROFILE%\.claude\.credentials.json`.
- Produces: 사용자가 실행하는 Docker 진입점.

- [ ] **Step 1: 스크립트 작성**

Create `docker/run.ps1`:

```powershell
#!/usr/bin/env pwsh
# Claude Code 프록시 서버 (Docker) — Windows 11
#   1) %USERPROFILE%\.claude\.credentials.json 를 docker\secrets 로 복사
#      (macOS 의 Keychain 추출을 대체 — Windows 는 자격증명이 파일로 저장됨)
#   2) 이미지 빌드
#   3) 컨테이너 실행 (자격증명 마운트, 백그라운드 + 자동 재시작)
# 실행법:
#   powershell -ExecutionPolicy Bypass -File .\docker\run.ps1

$ErrorActionPreference = 'Stop'
$Host.UI.RawUI.WindowTitle = 'Claude Code Proxy (Docker)'

# 프로젝트 루트로 이동 (docker/ 의 상위)
Set-Location (Split-Path -Parent $PSScriptRoot)

$Image = 'claude-proxy'
$Container = 'claude-proxy'
$Port = 3456
$SecretDir = 'docker\secrets'
$CredFile = Join-Path $SecretDir 'credentials.json'

Write-Host '========================================'
Write-Host '  Claude Code 프록시 서버 (Docker)'
Write-Host '========================================'

# 0) Docker 설치 및 데몬 구동 확인
try {
    docker info *> $null
} catch {
    Write-Host 'ERROR: docker 명령을 찾을 수 없습니다. Docker Desktop 을 설치하세요.' -ForegroundColor Red
    Read-Host '종료하려면 Enter'
    exit 1
}
if ($LASTEXITCODE -ne 0) {
    Write-Host 'ERROR: Docker Desktop 이 실행 중이 아닙니다. 먼저 Docker Desktop 을 실행하세요.' -ForegroundColor Red
    Read-Host '종료하려면 Enter'
    exit 1
}

# 1) 호스트 자격증명 파일 복사
Write-Host '[1/3] claude 로그인 자격증명 확보...'
$base = if ($env:CLAUDE_CONFIG_DIR) { $env:CLAUDE_CONFIG_DIR } else { Join-Path $env:USERPROFILE '.claude' }
$src = Join-Path $base '.credentials.json'
if (-not (Test-Path $src)) {
    Write-Host "ERROR: 자격증명 파일이 없습니다: $src" -ForegroundColor Red
    Write-Host '       호스트에서 claude 로그인이 되어 있는지 확인하세요.' -ForegroundColor Red
    Read-Host '종료하려면 Enter'
    exit 1
}
New-Item -ItemType Directory -Force -Path $SecretDir | Out-Null
Copy-Item -Path $src -Destination $CredFile -Force
Write-Host "      -> $CredFile 저장 완료"

# 2) 이미지 빌드
Write-Host '[2/3] 이미지 빌드... (최초 1회만 오래 걸립니다)'
docker build -f docker/Dockerfile -t $Image .
if ($LASTEXITCODE -ne 0) {
    Write-Host 'ERROR: 이미지 빌드 실패' -ForegroundColor Red
    Read-Host '종료하려면 Enter'
    exit 1
}

# 3) 컨테이너 실행 (기존 정리 후 백그라운드 실행)
Write-Host '[3/3] 컨테이너 실행...'
docker rm -f $Container *> $null

# credentials 절대경로. Windows 절대경로(C:\...)의 드라이브 콜론과 -v 구분자 콜론이
# 겹치지만 Docker Desktop 이 드라이브 문자를 인식한다. 마운트 실패 시 windows-setup.md 의
# 대안(포워드 슬래시) 참고.
$credAbs = (Resolve-Path $CredFile).Path
docker run -d `
    --name $Container `
    --restart unless-stopped `
    -p "${Port}:3456" `
    -v "${credAbs}:/root/.claude/.credentials.json" `
    $Image | Out-Null
if ($LASTEXITCODE -ne 0) {
    Write-Host 'ERROR: 컨테이너 실행 실패' -ForegroundColor Red
    Read-Host '종료하려면 Enter'
    exit 1
}

Write-Host '      -> 컨테이너 기동 중...'
$ok = $false
for ($i = 0; $i -lt 15; $i++) {
    try {
        Invoke-WebRequest -UseBasicParsing "http://localhost:$Port/health" -TimeoutSec 2 *> $null
        $ok = $true
        break
    } catch {
        Start-Sleep -Seconds 2
    }
}

Write-Host ''
Write-Host '========================================'
if ($ok) {
    Write-Host "  [OK] 프록시 서버 실행 중: http://localhost:$Port"
    Write-Host '     (백그라운드 동작 — 이 창을 닫아도 유지됩니다)'
    Write-Host '     재부팅 시 Docker Desktop 과 함께 자동으로 다시 뜹니다.'
} else {
    Write-Host '  [!] 기동 확인 실패. 로그를 확인하세요:' -ForegroundColor Yellow
    Write-Host "     docker logs $Container"
}
Write-Host '----------------------------------------'
Write-Host "  중지:   docker stop $Container"
Write-Host "  로그:   docker logs -f $Container"
Write-Host '========================================'
Write-Host ''
Write-Host '실시간 로그를 봅니다. (Ctrl+C 로 로그 보기만 종료 — 서버는 계속 실행)'
Write-Host ''
docker logs -f $Container
```

- [ ] **Step 2: 정적 검증 (macOS에서 가능한 범위)**

체크리스트 육안 확인:
- 자격증명 소스 경로가 `CLAUDE_CONFIG_DIR` 우선, 없으면 `%USERPROFILE%\.claude\.credentials.json`인가.
- `docker build -f docker/Dockerfile -t claude-proxy .` — 기존 `run.command`와 동일한 빌드 명령/경로인가.
- `docker run` 옵션이 기존 `run.command`와 동등한가: `-d --restart unless-stopped -p 3456:3456 -v <cred>:/root/.claude/.credentials.json`.
- 각 실패 지점(`docker` 없음/데몬 정지/자격증명 없음/빌드 실패/실행 실패)에서 `Read-Host` 후 `exit 1` 하는가.
- 헬스체크가 `Invoke-WebRequest`로 최대 15회 재시도하는가.

(선택) `pwsh` 설치 시 파싱 검증:
Run: `pwsh -NoProfile -Command "[System.Management.Automation.Language.Parser]::ParseFile((Resolve-Path ./docker/run.ps1), [ref]$null, [ref]$null) > $null; 'PARSE_OK'"`
Expected: `PARSE_OK`. pwsh 미설치 시 Windows 실검증으로 대체.

- [ ] **Step 3: Commit**

```bash
git add docker/run.ps1
git commit -m "feat: Windows 11 Docker 런처 run.ps1 추가

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 5: 한글 가이드 `docs/windows-setup.md`

**Files:**
- Create: `docs/windows-setup.md`

**Interfaces:**
- Consumes: Task 3/4의 `.ps1` 파일명과 실행법.
- Produces: 최종 사용자 문서. 후속 의존 없음.

- [ ] **Step 1: 가이드 작성**

Create `docs/windows-setup.md`:

````markdown
# Windows 11 실행 가이드

macOS의 `.command` 대신 Windows에서는 PowerShell 스크립트(`.ps1`)로 프록시 서버를 실행합니다. **직접 실행**과 **Docker** 두 방식이 있습니다.

## 공통 사전 준비

- 호스트에서 `claude` 로그인이 완료돼 있어야 합니다. (자격증명은 `%USERPROFILE%\.claude\.credentials.json`에 저장됩니다.)
- 확장 프로그램 설정은 그대로 둡니다: provider = **claude-code**, URL = `http://localhost:3456` (기본값).

## .ps1 첫 실행 안내 (ExecutionPolicy)

`.ps1` 파일은 더블클릭으로 실행되지 않습니다. 아래 중 하나로 실행하세요.

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

```powershell
powershell -ExecutionPolicy Bypass -File .\docs\start-proxy.ps1
```

- 포트 3456을 쓰는 기존 서버가 있으면 자동 종료 후 새로 실행합니다.
- 창을 닫거나 Ctrl+C를 누르면 서버가 종료됩니다.

## 방식 B. Docker (권장, 안정적)

**사전 준비:** Docker Desktop 설치 및 실행(WSL2 백엔드 권장).

```powershell
powershell -ExecutionPolicy Bypass -File .\docker\run.ps1
```

- `%USERPROFILE%\.claude\.credentials.json`을 컨테이너로 마운트해 "내 로컬 로그인"을 그대로 사용합니다.
- 백그라운드(`-d`)로 실행되어 창을 닫아도 서버가 유지되고, 재부팅 시 Docker Desktop과 함께 자동으로 다시 뜹니다.
- 중지: `docker stop claude-proxy` / 로그: `docker logs -f claude-proxy`

### Docker 볼륨 경로 문제 시

`-v "C:\...\credentials.json:/root/.claude/.credentials.json"`에서 마운트가 안 되면, `run.ps1`의 해당 줄을 포워드 슬래시 형식으로 바꿔 시도하세요. 예: `C:\Users\me\...` → `//c/Users/me/...`.

---

## 두 방식 중 무엇을 쓸까?

- **Docker (권장):** 백그라운드 상시 실행, 재부팅 자동 복구, 환경 격리.
- **직접 실행:** Docker 없이 간편하지만 창을 열어 둬야 하고 Node.js가 필요합니다.
````

- [ ] **Step 2: 내용 검토**

체크리스트:
- ExecutionPolicy 실행법(우클릭/`-ExecutionPolicy Bypass`)이 명시됐는가.
- 방식 A 실행 명령이 `docs\start-proxy.ps1`, 방식 B가 `docker\run.ps1`로 정확한가.
- 자격증명 경로/확장 설정(URL 기본값)이 설계와 일치하는가.
- Docker 볼륨 경로 대안이 포함됐는가.

- [ ] **Step 3: Commit**

```bash
git add docs/windows-setup.md
git commit -m "docs: Windows 11 실행 가이드 windows-setup.md 추가

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## 최종 검증 (전체 태스크 완료 후)

macOS(현 개발기)에서:
- `node --test proxy-server/claude-invocation.test.js` → 전부 PASS.
- `node --check proxy-server/server.js` → 오류 없음.
- 서버 기동 후 `curl -s http://localhost:3456/health` → `{"status":"ok"}`.
- 기존 `docs/start-proxy.command`로 실행 시 번역 동작이 이전과 동일(회귀 없음).

Windows 11(사용자 협조 필요):
- `docs\start-proxy.ps1` 직접 실행 → 확장에서 번역 성공.
- `docker\run.ps1` 실행 → 헬스체크 통과 → 확장에서 번역 성공.
- Docker 볼륨(드라이브 콜론) 정상 마운트 확인.
