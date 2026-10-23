import test from 'node:test';
import assert from 'node:assert';
import { TranslationService } from '../src/application/translation-service.js';
import { LRUCache } from '../src/infrastructure/cache/lru-cache.js';
import { ApiError, ERROR_CODES as C } from '../src/domain/api-error.js';
import { CHUNK_SIZE } from '../src/domain/constants.js';

// 입력 "N|원문" 줄을 "N|T:원문" 으로 번역하는 가짜 API
function echoTranslate(userText) {
  return userText.split('\n').slice(1).map(l => {
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
  assert.strictEqual(ok, CHUNK_SIZE);
  assert.ok(res.results.slice(CHUNK_SIZE).every(r => r.error === C.RATE_LIMIT));
  assert.strictEqual(Object.keys(l2.get(L2_KEY)).length, CHUNK_SIZE);
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
    const n = userText.split('\n').length - 1;
    sizes.push(n);
    if (n > 30) throw new ApiError(C.MAX_TOKENS);
    return echoTranslate(userText);
  });
  const res = await service.translateBatch(req(lines(CHUNK_SIZE)));
  assert.ok(!res.error);
  assert.ok(res.results.every(r => r.translation));
  assert.deepStrictEqual(sizes, [60, 30, 30]);
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
