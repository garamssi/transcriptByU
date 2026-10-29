import test from 'node:test';
import assert from 'node:assert';
import { TranslationService } from '../src/application/translation-service.js';
import { LRUCache } from '../src/infrastructure/cache/lru-cache.js';
import { ApiError, ERROR_CODES as C } from '../src/domain/api-error.js';
import { CHUNK_SIZE, FIRST_CHUNK_SIZE } from '../src/domain/constants.js';

// 입력 "N|원문" 줄을 "N|T:원문" 으로 번역하는 가짜 API (참고 번역 블록은 무시)
const numbered = (userText) => userText.split('\n').filter(l => /^\d+\|/.test(l));
function echoTranslate(userText) {
  return numbered(userText).map(l => {
    const i = l.indexOf('|');
    return `${l.slice(0, i)}|T:${l.slice(i + 1)}`;
  }).join('\n');
}

function makeService(callApi, { provider = 'gemini', stored = {} } = {}) {
  const l2 = new Map(Object.entries(stored));
  const logs = [];
  const service = new TranslationService({
    l1Cache: new LRUCache(),
    l2Cache: {
      l2Get: async (k) => l2.get(k) || null,
      l2Set: async (k, v) => { l2.set(k, { ...v }); },
      l2Delete: async (k) => { l2.delete(k); },
    },
    callApi,
    getProviderConfig: async () => ({ provider, apiKey: 'k', model: 'm' }),
    getSettings: async () => ({ enabled: true }),
    logError: (e) => logs.push(e),
    interChunkDelayMs: 0,
  });
  return { service, l2, logs };
}

const lines = (n, prefix = 'line') => Array.from({ length: n }, (_, i) => `${prefix} ${i + 1} text`);
const req = (texts, extra = {}) => ({ texts, targetCode: 'ko', sourceCode: 'en', course: 'c', section: 's', lecture: 'l', ...extra });
const L2_KEY = 'ko::c||s||l';

test('한 청크가 실패해도 앞서 성공한 청크는 결과·캐시에 남는다', async () => {
  let call = 0;
  const { service, l2, logs } = makeService(async (_sp, userText) => {
    call++;
    if (call === 2) throw new ApiError(C.RATE_LIMIT, { retryAfterMs: 60_000, status: 429 });
    return echoTranslate(userText);
  });
  const texts = lines(CHUNK_SIZE * 2);
  const res = await service.translateBatch(req(texts));

  assert.strictEqual(res.error.code, C.RATE_LIMIT);
  assert.strictEqual(res.error.retryAfterMs, 60_000);
  const ok = res.results.filter(r => r.translation).length;
  assert.strictEqual(ok, FIRST_CHUNK_SIZE);
  assert.ok(res.results.slice(FIRST_CHUNK_SIZE).every(r => r.error === C.RATE_LIMIT));
  assert.strictEqual(Object.keys(l2.get(L2_KEY)).length, FIRST_CHUNK_SIZE);
  assert.strictEqual(logs.length, 1);
  assert.strictEqual(logs[0].code, C.RATE_LIMIT);
});

test('치명적 오류(일일 한도) 후 남은 청크는 보내지 않는다', async () => {
  let call = 0;
  const { service } = makeService(async () => {
    call++;
    throw new ApiError(C.QUOTA_DAILY, { retryAfterMs: 1000 });
  });
  const res = await service.translateBatch(req(lines(CHUNK_SIZE * 3)));
  assert.strictEqual(call, 1);
  assert.strictEqual(res.error.code, C.QUOTA_DAILY);
  assert.ok(res.results.every(r => r.error === C.QUOTA_DAILY));
});

test('MAX_TOKENS 청크는 반으로 나눠 다시 보낸다', async () => {
  const sizes = [];
  const { service } = makeService(async (_sp, userText) => {
    const n = numbered(userText).length;
    sizes.push(n);
    if (n > CHUNK_SIZE / 2) throw new ApiError(C.MAX_TOKENS);
    return echoTranslate(userText);
  });
  const res = await service.translateBatch(req(lines(FIRST_CHUNK_SIZE + CHUNK_SIZE)));
  assert.ok(!res.error);
  assert.ok(res.results.every(r => r.translation));
  assert.deepStrictEqual(sizes, [FIRST_CHUNK_SIZE, CHUNK_SIZE, CHUNK_SIZE / 2, CHUNK_SIZE / 2]);
});

test('재번역(force)은 캐시를 건너뛰고, 실패한 줄은 기존 번역을 유지한다', async () => {
  const texts = ['a', 'b'];
  const stored = { [L2_KEY]: { a: 'OLD_A', b: 'OLD_B' } };
  // a 만 번역하고 b 는 응답에서 빠뜨린다 (재시도해도 마찬가지) → b 는 파싱 실패
  const { service, l2 } = makeService(async (_sp, userText) => (userText.includes('|a') ? '1|NEW_A' : ''), { stored });
  const res = await service.translateBatch(req(texts, { force: true }));
  assert.deepStrictEqual(res.results[0], { translation: 'NEW_A', cached: false });
  assert.strictEqual(res.results[1].translation, 'OLD_B');
  assert.strictEqual(res.results[1].error, C.PARSE_ERROR);
  assert.deepStrictEqual(l2.get(L2_KEY), { a: 'NEW_A', b: 'OLD_B' });
});

test('스케줄러가 바로 돌려보낸 오류(local)는 로그를 남기지 않는다', async () => {
  const { service, logs } = makeService(async () => {
    const e = new ApiError(C.QUOTA_DAILY, { retryAfterMs: 1000 });
    e.local = true;
    throw e;
  });
  const res = await service.translateBatch(req(['x']));
  assert.strictEqual(res.error.code, C.QUOTA_DAILY);
  assert.strictEqual(logs.length, 0);
});

test('느린 요청은 재시도 정보와 함께 SLOW 경고로 기록된다', async () => {
  const { service, logs } = makeService(async (_sp, userText, _p, _k, _m, _mt, hooks) => {
    hooks.onRetry(C.RATE_LIMIT, 12_000);
    return echoTranslate(userText);
  });
  service.now = (() => { let n = 0; return () => (n++ === 0 ? 0 : 15_000); })();
  await service.translateBatch(req(['x']));
  assert.strictEqual(logs.length, 1);
  assert.strictEqual(logs[0].code, 'SLOW');
  assert.strictEqual(logs[0].waitMs, 12_000);
  assert.strictEqual(logs[0].durationMs, 15_000);
});

test('첫 청크는 작게 보내고, 청크마다 부분 결과를 바로 알린다', async () => {
  const sizes = [];
  const { service } = makeService(async (_sp, userText) => {
    sizes.push(numbered(userText).length);
    return echoTranslate(userText);
  });
  const partials = [];
  const texts = lines(FIRST_CHUNK_SIZE + CHUNK_SIZE + 5);
  const res = await service.translateBatch(req(texts), (entries) => partials.push(entries));
  assert.ok(!res.error);
  assert.deepStrictEqual(sizes, [FIRST_CHUNK_SIZE, CHUNK_SIZE, 5]);
  assert.deepStrictEqual(partials.map(p => Object.keys(p).length), [FIRST_CHUNK_SIZE, CHUNK_SIZE, 5]);
  assert.strictEqual(partials[0][texts[0]], `T:${texts[0]}`);
});

test('모든 청크가 같은 시스템 프롬프트(대본 포함)를 쓰고, 앞 청크 번역을 참고로 넘긴다', async () => {
  const systems = [];
  const users = [];
  const { service } = makeService(async (sp, userText) => {
    systems.push(sp);
    users.push(userText);
    return echoTranslate(userText);
  });
  const texts = lines(FIRST_CHUNK_SIZE + 3);
  const res = await service.translateBatch(req(texts, { script: texts }));
  assert.ok(!res.error);
  assert.strictEqual(systems.length, 2);
  assert.strictEqual(systems[0], systems[1]);
  assert.ok(systems[0].includes('<transcript>') && systems[0].includes(texts[FIRST_CHUNK_SIZE + 2]));
  assert.ok(!users[0].includes('<previous_translations>'));
  assert.ok(users[1].includes(`${texts[0]} => T:${texts[0]}`));
});

test('캐시된 번역도 참고로 넘기고, 재번역(force)은 넘기지 않는다', async () => {
  const users = [];
  const stored = { [L2_KEY]: { old: 'OLD' } };
  const { service } = makeService(async (_sp, userText) => {
    users.push(userText);
    return echoTranslate(userText);
  }, { stored });
  await service.translateBatch(req(['new']));
  assert.ok(users[0].includes('old => OLD'));
  await service.translateBatch(req(['old'], { force: true }));
  assert.ok(!users[1].includes('<previous_translations>'));
});

test('같은 문장을 동시에 요청하면 API 는 한 번만 부르고 둘 다 결과를 받는다', async () => {
  let calls = 0;
  let release;
  const gate = new Promise(r => { release = r; });
  const { service } = makeService(async (_sp, userText) => {
    calls++;
    await gate;
    return echoTranslate(userText);
  });
  const partials = [];
  const a = service.translateBatch(req(['x', 'y']));
  await new Promise(r => setTimeout(r, 0));
  const b = service.translateBatch(req(['x', 'y', 'z']), (e) => partials.push(e));
  await new Promise(r => setTimeout(r, 0));
  release();
  const [ra, rb] = await Promise.all([a, b]);
  assert.strictEqual(calls, 2); // a 의 [x,y] 1번 + b 의 [z] 1번
  assert.deepStrictEqual(ra.results.map(r => r.translation), ['T:x', 'T:y']);
  assert.deepStrictEqual(rb.results.map(r => r.translation), ['T:x', 'T:y', 'T:z']);
  // 기다린 문장(x, y)은 한 번에 모아서, 직접 번역한 z 는 따로 알린다
  assert.ok(partials.some(p => p.x === 'T:x' && p.y === 'T:y'));
  assert.strictEqual(partials.length, 2);
  assert.strictEqual(service.inFlight.size, 0);
});

test('기다리던 문장이 실패하면 기다린 쪽도 실패로 받는다', async () => {
  let release;
  const gate = new Promise(r => { release = r; });
  const { service } = makeService(async () => {
    await gate;
    throw new ApiError(C.RATE_LIMIT, { status: 429, retryAfterMs: 60_000 });
  });
  const a = service.translateBatch(req(['x']));
  await new Promise(r => setTimeout(r, 0));
  const b = service.translateBatch(req(['x']));
  await new Promise(r => setTimeout(r, 0));
  release();
  const [, rb] = await Promise.all([a, b]);
  assert.strictEqual(rb.results[0].error, C.RATE_LIMIT);
  assert.strictEqual(rb.error.code, C.RATE_LIMIT);
  assert.strictEqual(rb.error.retryAfterMs, 60_000); // 기다린 쪽도 한도 대기 시간을 지킨다
  assert.strictEqual(service.inFlight.size, 0);
});
