import { L2_PREFIX } from '../../domain/constants.js';

/**
 * L2 캐시: chrome.storage.local (강의 단위)
 */

export async function l2Get(key) {
  const result = await chrome.storage.local.get(L2_PREFIX + key);
  return result[L2_PREFIX + key] || null;
}

export async function l2Set(key, value) {
  await chrome.storage.local.set({ [L2_PREFIX + key]: value });
}

export async function l2Delete(keyOrKeys) {
  const keys = Array.isArray(keyOrKeys) ? keyOrKeys : [keyOrKeys];
  const storageKeys = keys.map(k => k.startsWith(L2_PREFIX) ? k : L2_PREFIX + k);
  if (storageKeys.length > 0) {
    await chrome.storage.local.remove(storageKeys);
  }
}

export async function l2ClearAll() {
  const all = await chrome.storage.local.get(null);
  const cacheKeys = Object.keys(all).filter(k => k.startsWith(L2_PREFIX));
  if (cacheKeys.length > 0) {
    await chrome.storage.local.remove(cacheKeys);
  }
}
