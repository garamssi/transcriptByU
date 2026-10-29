import test from 'node:test';
import assert from 'node:assert';
import { ERROR_LOG_KEY, ERROR_LOG_MAX } from '../src/domain/constants.js';

const store = {};
globalThis.chrome = { storage: { local: {
  get: async (k) => ({ [k]: store[k] }),
  set: async (o) => Object.assign(store, o),
} } };
const { appendErrorLog } = await import('../src/infrastructure/chrome/error-log.js');
const base = { level: 'error', code: 'NETWORK', provider: 'gemini', model: 'm', course: 'c', section: 's', lecture: 'l' };

test('같은 오류가 반복되면 새 카드 대신 기존 항목의 횟수를 올리고 맨 위로 올린다', async () => {
  await appendErrorLog({ ...base });
  await appendErrorLog({ ...base, code: 'TIMEOUT' });
  const firstId = store[ERROR_LOG_KEY][1].id;
  await appendErrorLog({ ...base, durationMs: 123 });
  const list = store[ERROR_LOG_KEY];
  assert.strictEqual(list.length, 2);
  assert.strictEqual(list[0].code, 'NETWORK');
  assert.strictEqual(list[0].count, 2);
  assert.strictEqual(list[0].id, firstId); // 같은 카드로 갱신되도록 id 유지
  assert.strictEqual(list[0].durationMs, 123); // 최신 값으로 갱신
});

test('강의가 다르면 합치지 않고, 최대 개수를 지킨다', async () => {
  for (let i = 0; i < ERROR_LOG_MAX + 3; i++) await appendErrorLog({ ...base, lecture: `l${i}` });
  assert.strictEqual(store[ERROR_LOG_KEY].length, ERROR_LOG_MAX);
  assert.strictEqual(store[ERROR_LOG_KEY][0].lecture, `l${ERROR_LOG_MAX + 2}`);
});

test('합치는 기준은 첫 발생 시각부터 10분이다(반복될 때마다 창이 늘어나지 않음)', async () => {
  store[ERROR_LOG_KEY] = [];
  const realNow = Date.now;
  let now = 1_000_000;
  Date.now = () => now;
  try {
    await appendErrorLog({ ...base, lecture: 'w' });
    now += 6 * 60_000; await appendErrorLog({ ...base, lecture: 'w' }); // 6분: 합침
    now += 6 * 60_000; await appendErrorLog({ ...base, lecture: 'w' }); // 첫 발생 12분: 새 항목
  } finally {
    Date.now = realNow;
  }
  const ws = store[ERROR_LOG_KEY].filter(e => e.lecture === 'w');
  assert.strictEqual(ws.length, 2);
  assert.strictEqual(ws[1].count, 2);
  assert.strictEqual(ws[1].firstTs, 1_000_000);
});
