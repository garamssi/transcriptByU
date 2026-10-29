import { LRUCache } from './src/infrastructure/cache/lru-cache.js';
import { l2Get, l2Set, l2Delete } from './src/infrastructure/cache/storage-cache.js';
import { callApi } from './src/infrastructure/api/api-client.js';
import { getProviderConfig, getSettings } from './src/infrastructure/chrome/storage-adapter.js';
import { appendErrorLog } from './src/infrastructure/chrome/error-log.js';
import { TranslationService } from './src/application/translation-service.js';
import { CacheService } from './src/application/cache-service.js';
import { RequestScheduler } from './src/application/request-scheduler.js';
import { API_BLOCK_KEY, STORAGE_KEYS } from './src/domain/constants.js';

// === 일일 한도 차단 저장소 (chrome.storage.session: 서비스 워커가 재시작돼도 유지, 브라우저 종료 시 초기화) ===
const sessionBlockStore = {
  async get(key) {
    const s = await chrome.storage.session.get(API_BLOCK_KEY);
    return s[API_BLOCK_KEY]?.[key] || null;
  },
  async set(key, value) {
    const s = await chrome.storage.session.get(API_BLOCK_KEY);
    await chrome.storage.session.set({ [API_BLOCK_KEY]: { ...(s[API_BLOCK_KEY] || {}), [key]: value } });
  },
  async clear() {
    await chrome.storage.session.remove(API_BLOCK_KEY);
  },
};

// === 인스턴스 생성 ===
const l1Cache = new LRUCache();

// 모든 탭·경로의 API 호출을 프로바이더별 대기열 하나로 모아 간격·재시도·차단을 관리한다.
const scheduler = new RequestScheduler({
  blockStore: sessionBlockStore,
  // 확장 API 호출은 서비스 워커의 유휴 타이머를 초기화한다 → 긴 요청 중 종료 방지
  keepAlive: () => { chrome.runtime.getPlatformInfo().catch(() => {}); },
});

const scheduledCallApi = (systemPrompt, userText, provider, apiKey, model, maxTokens, hooks) =>
  scheduler.run({ provider, model }, () => callApi(systemPrompt, userText, provider, apiKey, model, maxTokens), hooks);

const translationService = new TranslationService({
  l1Cache,
  l2Cache: { l2Get, l2Set, l2Delete },
  callApi: scheduledCallApi,
  getProviderConfig,
  getSettings,
  logError: appendErrorLog,
});

// API 키·프로바이더가 바뀌면 이전 설정의 차단·쿨다운은 의미가 없으므로 초기화한다.
const RESET_SCHEDULER_KEYS = [
  STORAGE_KEYS.PROVIDER, STORAGE_KEYS.GEMINI_API_KEY, STORAGE_KEYS.CLAUDE_API_KEY, STORAGE_KEYS.CLAUDE_CODE_URL,
];
chrome.storage.onChanged.addListener((changes, area) => {
  if (area === 'local' && RESET_SCHEDULER_KEYS.some(k => k in changes)) {
    scheduler.reset().catch(() => {});
  }
});

const cacheService = new CacheService(l1Cache);

// === 구버전 캐시 마이그레이션 (cache_ → lec_ 전환 시 구 데이터 삭제) ===
(async () => {
  const all = await chrome.storage.local.get(null);
  const oldKeys = Object.keys(all).filter(k => k.startsWith('cache_'));
  if (oldKeys.length > 0) {
    await chrome.storage.local.remove(oldKeys);
  }
})();

// === 메시지 리스너 ===
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'TRANSLATE_BATCH') {
    // 청크가 끝날 때마다 요청한 탭(프레임)에 먼저 보내, 강의 전체 완료 전에도 자막이 바뀌게 한다.
    const tabId = sender.tab?.id;
    const onPartial = tabId != null && message.requestId
      ? (translations) => chrome.tabs.sendMessage(tabId, { type: 'TRANSLATE_PARTIAL', requestId: message.requestId, translations },
        { frameId: sender.frameId }).catch(() => {})
      : undefined;
    translationService.translateBatch(message, onPartial).then(sendResponse);
    return true;
  }

  if (message.type === 'CLEAR_LECTURE_CACHE') {
    translationService.clearLectureCache(message).then(() => sendResponse({ success: true }));
    return true;
  }

  if (message.type === 'CLEAR_CACHE') {
    cacheService.clearAll().then(() => sendResponse({ success: true }));
    return true;
  }

  if (message.type === 'GET_CACHE_LIST') {
    cacheService.getList().then(sendResponse);
    return true;
  }

  if (message.type === 'DELETE_CACHE_ITEMS') {
    cacheService.deleteItems(message.keys || []).then(() => sendResponse({ success: true }));
    return true;
  }

  if (message.type === 'PING') {
    sendResponse({ pong: true });
    return false;
  }
});
