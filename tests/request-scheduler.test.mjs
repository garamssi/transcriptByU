import test from 'node:test';
import assert from 'node:assert';
import { RequestScheduler } from '../src/application/request-scheduler.js';
import { ApiError, ERROR_CODES as C } from '../src/domain/api-error.js';

// 가짜 시계: sleep 하면 시간이 그만큼 흐른다.
function fakeClock() {
  let t = 1_000_000;
  const slept = [];
  return {
    now: () => t,
    sleep: async (ms) => { slept.push(ms); t += ms; },
    slept,
  };
}

const gemini = { provider: 'gemini', model: 'gemini-3.8-flash' };

test('짧은 429 는 권장 시간만큼 기다렸다가 재시도해 성공', async () => {
  const clock = fakeClock();
  const s = new RequestScheduler({ now: clock.now, sleep: clock.sleep });
  let calls = 0;
  const retries = [];
  const text = await s.run(gemini, async () => {
    calls++;
    if (calls === 1) throw new ApiError(C.RATE_LIMIT, { retryAfterMs: 5000 });
    return 'ok';
  }, { onRetry: (code, ms) => retries.push([code, ms]) });
  assert.strictEqual(text, 'ok');
  assert.strictEqual(calls, 2);
  assert.deepStrictEqual(retries, [[C.RATE_LIMIT, 5000]]);
  assert.ok(clock.slept.includes(5000));
});

test('긴 429 는 기다리지 않고 바로 RATE_LIMIT, 다음 요청도 API 호출 없이 즉시 실패', async () => {
  const clock = fakeClock();
  const s = new RequestScheduler({ now: clock.now, sleep: clock.sleep });
  await assert.rejects(
    s.run(gemini, async () => { throw new ApiError(C.RATE_LIMIT, { retryAfterMs: 60_000 }); }),
    (e) => e.code === C.RATE_LIMIT && e.retryAfterMs === 60_000 && !e.local,
  );
  let called = false;
  await assert.rejects(
    s.run(gemini, async () => { called = true; return 'x'; }),
    (e) => e.code === C.RATE_LIMIT && e.local === true,
  );
  assert.strictEqual(called, false);
  assert.ok(clock.slept.every(ms => ms <= 20_000));
});

test('일일 한도는 차단 기록 후 같은 모델 요청을 막고, reset 하면 풀린다', async () => {
  const clock = fakeClock();
  const s = new RequestScheduler({ now: clock.now, sleep: clock.sleep });
  await assert.rejects(
    s.run(gemini, async () => { throw new ApiError(C.QUOTA_DAILY, { retryAfterMs: 3_600_000 }); }),
    { code: C.QUOTA_DAILY },
  );
  let calls = 0;
  await assert.rejects(s.run(gemini, async () => { calls++; return 'x'; }), (e) => e.code === C.QUOTA_DAILY && e.local);
  // 다른 모델은 영향 없음
  assert.strictEqual(await s.run({ provider: 'gemini', model: 'gemini-3.5-flash-lite' }, async () => 'lite'), 'lite');
  await s.reset();
  assert.strictEqual(await s.run(gemini, async () => { calls++; return 'y'; }), 'y');
  assert.strictEqual(calls, 1);
});

test('5xx 는 최대 2회 재시도, AUTH 는 재시도 없음', async () => {
  const clock = fakeClock();
  const s = new RequestScheduler({ now: clock.now, sleep: clock.sleep });
  let calls = 0;
  await assert.rejects(s.run(gemini, async () => { calls++; throw new ApiError(C.SERVER, { status: 503 }); }), { code: C.SERVER });
  assert.strictEqual(calls, 3);
  calls = 0;
  await assert.rejects(s.run(gemini, async () => { calls++; throw new ApiError(C.AUTH); }), { code: C.AUTH });
  assert.strictEqual(calls, 1);
});

test('클라우드 요청은 직렬화된다 (동시 실행 없음)', async () => {
  const s = new RequestScheduler({ minIntervalMs: 0, sleep: async () => {} });
  let running = 0;
  let maxRunning = 0;
  const task = async () => {
    running++;
    maxRunning = Math.max(maxRunning, running);
    await new Promise(r => setTimeout(r, 5));
    running--;
    return 'ok';
  };
  await Promise.all([s.run(gemini, task), s.run(gemini, task), s.run(gemini, task)]);
  assert.strictEqual(maxRunning, 1);
});

test('claude-code 는 스케줄러를 그대로 통과 (병렬 허용)', async () => {
  const s = new RequestScheduler();
  let running = 0;
  let maxRunning = 0;
  const task = async () => {
    running++;
    maxRunning = Math.max(maxRunning, running);
    await new Promise(r => setTimeout(r, 5));
    running--;
    return 'ok';
  };
  await Promise.all([1, 2, 3].map(() => s.run({ provider: 'claude-code', model: 'm' }, task)));
  assert.strictEqual(maxRunning, 3);
});
