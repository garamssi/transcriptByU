import { ERROR_LOG_KEY, ERROR_LOG_SEEN_KEY, ERROR_LOG_MAX } from '../../domain/constants.js';
import { redactSecrets } from '../../domain/api-error.js';

/**
 * 번역 오류 로그 (chrome.storage.local, 최근 ERROR_LOG_MAX 건).
 * 서비스 워커 안에서 동시에 여러 건이 들어와도 서로 덮어쓰지 않도록 쓰기를 직렬화한다.
 */
let writeChain = Promise.resolve();

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
    list.unshift(record);
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
