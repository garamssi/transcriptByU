import { ERROR_LOG_KEY, ERROR_LOG_SEEN_KEY, ERROR_LOG_MAX } from '../../domain/constants.js';
import { redactSecrets } from '../../domain/api-error.js';

/**
 * 번역 오류 로그 (chrome.storage.local, 최근 ERROR_LOG_MAX 건).
 * 서비스 워커 안에서 동시에 여러 건이 들어와도 서로 덮어쓰지 않도록 쓰기를 직렬화한다.
 */
let writeChain = Promise.resolve();

// 같은 오류(같은 코드·프로바이더·모델·강의)가 이 시간 안에 다시 나면 새 항목 대신 기존 항목의 횟수를 올린다.
// 자동 재시도가 같은 오류를 반복할 때 로그가 같은 카드로 가득 차 진짜 오류가 밀려나지 않게 한다.
const MERGE_WINDOW_MS = 10 * 60_000;
const signature = e => [e.level, e.code, e.provider, e.model, e.course, e.section, e.lecture, e.status].join('');

/**
 * @param {object} entry
 * @param {'error'|'warn'} entry.level
 * @param {string} entry.code - ERROR_CODES 값 또는 'SLOW'
 * @param {string} [entry.message]
 */
export function appendErrorLog(entry) {
  const record = {
    id: `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`,
    ts: Date.now(),
    ...entry,
    message: redactSecrets(entry.message || '').slice(0, 400),
  };
  writeChain = writeChain.then(async () => {
    const stored = await chrome.storage.local.get(ERROR_LOG_KEY);
    const list = Array.isArray(stored[ERROR_LOG_KEY]) ? stored[ERROR_LOG_KEY] : [];
    const sig = signature(record);
    const dup = list.findIndex(e => signature(e) === sig && record.ts - e.ts < MERGE_WINDOW_MS);
    if (dup !== -1) {
      const prev = list.splice(dup, 1)[0];
      // id 를 유지해 화면이 같은 카드를 갱신하게 한다(새 카드로 다시 그리지 않음).
      list.unshift({ ...record, id: prev.id, firstTs: prev.firstTs || prev.ts, count: (prev.count || 1) + 1 });
    } else {
      list.unshift(record);
    }
    await chrome.storage.local.set({ [ERROR_LOG_KEY]: list.slice(0, ERROR_LOG_MAX) });
  }).catch(err => console.warn('[UdemyTranslator] error log write failed:', err?.message || err));
  return writeChain;
}

export async function getErrorLog() {
  const stored = await chrome.storage.local.get([ERROR_LOG_KEY, ERROR_LOG_SEEN_KEY]);
  return {
    entries: Array.isArray(stored[ERROR_LOG_KEY]) ? stored[ERROR_LOG_KEY] : [],
    seenAt: stored[ERROR_LOG_SEEN_KEY] || 0,
  };
}

export async function markErrorLogSeen() {
  await chrome.storage.local.set({ [ERROR_LOG_SEEN_KEY]: Date.now() });
}

export async function clearErrorLog() {
  await chrome.storage.local.remove(ERROR_LOG_KEY);
}
