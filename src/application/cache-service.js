import { L2_PREFIX } from '../domain/constants.js';
import { l2ClearAll } from '../infrastructure/cache/storage-cache.js';

/**
 * 캐시 관리 서비스
 */
export class CacheService {
  /**
   * @param {import('../infrastructure/cache/lru-cache.js').LRUCache} l1Cache
   */
  constructor(l1Cache) {
    this.l1Cache = l1Cache;
  }

  /**
   * 모든 캐시를 클리어한다 (L1 + L2).
   */
  async clearAll() {
    this.l1Cache.clear();
    await l2ClearAll();
  }

  /**
   * 선택된 캐시 항목들을 삭제한다.
   * @param {string[]} keys - storage 키 배열
   */
  async deleteItems(keys) {
    if (keys.length === 0) return;
    await chrome.storage.local.remove(keys);
    for (const key of keys) {
      this.l1Cache.delete(key.slice(L2_PREFIX.length));
    }
  }

  /**
   * 캐시 목록을 조회한다.
   * @returns {Promise<{ items: Array }>}
   */
  async getList() {
    const all = await chrome.storage.local.get(null);
    const items = [];
    for (const [key, value] of Object.entries(all)) {
      if (!key.startsWith(L2_PREFIX)) continue;
      const raw = key.slice(L2_PREFIX.length);
      const langSep = raw.indexOf('::');
      if (langSep === -1) continue;
      const lang = raw.slice(0, langSep);
      const rest = raw.slice(langSep + 2);
      // 형식: course||section||lecture (구형 section||lecture 도 허용)
      const parts = rest.split('||');
      let course = '', section = '', lecture = '';
      if (parts.length >= 3) {
        course = parts[0];
        section = parts[1];
        lecture = parts.slice(2).join('||');
      } else {
        section = parts[0] || '';
        lecture = parts.slice(1).join('||');
      }
      const count = (typeof value === 'object' && value !== null) ? Object.keys(value).length : 0;

      items.push({ key, lang, course, section, lecture, count });
    }
    return { items };
  }
}
