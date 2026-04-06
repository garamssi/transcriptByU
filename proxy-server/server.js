const http = require('node:http');
const { spawn, execFileSync } = require('node:child_process');

const PORT = process.env.PORT || 3456;
const CLI_TIMEOUT = 120_000;

// === Claude CLI 호출 (비동기, shell injection 방지) ===

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

// === CORS 헤더 ===

function setCors(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
}

// === JSON 응답 ===

function sendJson(res, status, data) {
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(data));
}

// === 요청 body 읽기 ===

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on('data', (c) => chunks.push(c));
    req.on('end', () => {
      try {
        resolve(JSON.parse(Buffer.concat(chunks).toString()));
      } catch (e) {
        reject(new Error('INVALID_JSON'));
      }
    });
    req.on('error', reject);
  });
}

// === HTTP 서버 ===

const server = http.createServer(async (req, res) => {
  setCors(res);

  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  const url = req.url.split('?')[0];

  // --- Health check ---
  if (req.method === 'GET' && url === '/health') {
    return sendJson(res, 200, { status: 'ok' });
  }

  // --- 번역 엔드포인트 ---
  if (req.method === 'POST' && url === '/translate') {
    const start = Date.now();
    try {
      const { systemPrompt, userText, model } = await readBody(req);
      const prompt = `${systemPrompt}\n\n${userText}`;
      console.log(`[translate] model: ${model || 'default'}, prompt: ${prompt.length} chars`);

      const result = await callClaude(prompt, model);
      const elapsed = ((Date.now() - start) / 1000).toFixed(1);
      console.log(`[translate] done in ${elapsed}s, response: ${result.length} chars`);

      return sendJson(res, 200, { result });
    } catch (err) {
      console.error(`[translate] error: ${err.message}`);
      return sendJson(res, 500, { error: err.message });
    }
  }

  sendJson(res, 404, { error: 'Not found' });
});

// === 시작 ===

try {
  const version = execFileSync('claude', ['--version'], { encoding: 'utf-8', timeout: 5000 }).trim();
  console.log(`Claude CLI: ${version}`);
} catch {
  console.error('WARNING: claude CLI를 찾을 수 없습니다. PATH를 확인하세요.');
}

server.listen(PORT, () => {
  console.log(`Claude Code 프록시 서버 실행 중: http://localhost:${PORT}`);
  console.log(`  /health     — 헬스체크`);
  console.log(`  /translate  — 번역`);
});
