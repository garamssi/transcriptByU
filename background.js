import { LRUCache } from './src/infrastructure/cache/lru-cache.js';
import { l2Get, l2Set, l2Delete } from './src/infrastructure/cache/storage-cache.js';
import { callApi } from './src/infrastructure/api/api-client.js';
import { getProviderConfig } from './src/infrastructure/chrome/storage-adapter.js';
import { TranslationService } from './src/application/translation-service.js';
import { CacheService } from './src/application/cache-service.js';

// === 인스턴스 생성 ===
const l1Cache = new LRUCache();

const translationService = new TranslationService({
  l1Cache,
  l2Cache: { l2Get, l2Set, l2Delete },
  callApi,
  getProviderConfig,
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
    translationService.translateBatch(message).then(sendResponse);
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
