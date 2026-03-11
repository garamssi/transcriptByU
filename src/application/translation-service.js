import { CHUNK_SIZE, DEFAULT_TARGET_LANG } from '../domain/constants.js';
import { buildBatchSystemPrompt } from '../domain/prompt-builder.js';
import { parseBatchResponse } from '../domain/response-parser.js';
import { lectureCacheKey } from '../domain/cache-key.js';

/**
 * 번역 유스케이스를 캡슐화하는 서비스
 */
export class TranslationService {
  /**
   * @param {object} deps
   * @param {import('../infrastructure/cache/lru-cache.js').LRUCache} deps.l1Cache - L1 메모리 캐시
   * @param {{ l2Get: Function, l2Set: Function }} deps.l2Cache - L2 스토리지 캐시
   * @param {Function} deps.callApi - API 호출 함수
   * @param {Function} deps.getProviderConfig - Provider 설정 로드 함수
   */
  constructor({ l1Cache, l2Cache, callApi, getProviderConfig }) {
    this.l1Cache = l1Cache;
    this.l2Cache = l2Cache;
    this.callApi = callApi;
    this.getProviderConfig = getProviderConfig;
  }

  /**
   * 배치 번역 (캐시 조회 → 미번역분 API 호출 → 캐시 저장)
   */
  async translateBatch({ texts, targetLang: msgLang, lecture, section }) {
    try {
      const stored = await chrome.storage.local.get(['enabled', 'targetLang']);
      if (stored.enabled === false) return { error: 'DISABLED' };

      const { provider, apiKey, model } = await this.getProviderConfig();
      if (!apiKey) return { error: 'NO_API_KEY' };

      const targetLang = msgLang || stored.targetLang || DEFAULT_TARGET_LANG;
      const context = { lecture: lecture || '', section: section || '' };
      const lKey = lectureCacheKey(targetLang, context.section, context.lecture);

      // 1) 강의 캐시 로드 (L1 → L2)
      let lectureTranslations = this.l1Cache.get(lKey);
      if (!lectureTranslations) {
        const l2Val = await this.l2Cache.l2Get(lKey);
        if (l2Val) {
          lectureTranslations = l2Val;
          this.l1Cache.set(lKey, lectureTranslations);
        } else {
          lectureTranslations = {};
        }
      }

      // 2) 각 텍스트를 캐시에서 조회
      const results = new Array(texts.length).fill(null);
      const uncachedIndices = [];

      for (let i = 0; i < texts.length; i++) {
        const cached = lectureTranslations[texts[i]];
        if (cached) {
          results[i] = { translation: cached, cached: true };
        } else {
          uncachedIndices.push(i);
        }
      }

      // 3) 미번역분: 중복 제거 후 청크 분할 API 호출
      if (uncachedIndices.length > 0) {
        const uniqueTexts = [...new Set(uncachedIndices.map(i => texts[i]))];
        const systemPrompt = buildBatchSystemPrompt(targetLang, context);

        try {
          const newTranslations = await this._translateChunks(uniqueTexts, systemPrompt, provider, apiKey, model);

          // 결과 적용
          for (const i of uncachedIndices) {
            const translation = newTranslations[texts[i]];
            if (translation) {
              results[i] = { translation, cached: false };
            } else {
              results[i] = { error: 'PARSE_ERROR' };
            }
          }

          // 강의 캐시에 병합 저장
          if (Object.keys(newTranslations).length > 0) {
            Object.assign(lectureTranslations, newTranslations);
            this.l1Cache.set(lKey, lectureTranslations);
            await this.l2Cache.l2Set(lKey, lectureTranslations);
          }

        } catch (err) {
          for (const i of uncachedIndices) {
            if (!results[i]) results[i] = { error: err.message };
          }
        }
      }

      return { results };
    } catch (err) {
      return { error: err.message };
    }
  }

  /**
   * 배치 재번역 (캐시 무시, API 호출 후 캐시 덮어쓰기)
   */
  async retranslateBatch({ texts, lang, lecture, section }) {
    try {
      const { provider, apiKey, model } = await this.getProviderConfig();
      if (!apiKey) return { error: 'NO_API_KEY' };

      const targetLang = lang;
      const context = { lecture: lecture || '', section: section || '' };
      const lKey = lectureCacheKey(targetLang, context.section, context.lecture);

      const uniqueTexts = [...new Set(texts)];
      const systemPrompt = buildBatchSystemPrompt(targetLang, context);

      const translationMap = await this._translateChunks(uniqueTexts, systemPrompt, provider, apiKey, model);

      // 결과 배열
      const results = new Array(texts.length).fill(null);
      for (let i = 0; i < texts.length; i++) {
        const translation = translationMap[texts[i]];
        if (translation) {
          results[i] = { translation };
        } else {
          results[i] = { error: 'PARSE_ERROR' };
        }
      }

      // 강의 캐시 덮어쓰기
      if (Object.keys(translationMap).length > 0) {
        this.l1Cache.set(lKey, translationMap);
        await this.l2Cache.l2Set(lKey, translationMap);
      }

      return { results };
    } catch (err) {
      return { error: err.message };
    }
  }

  /**
   * 텍스트 배열을 청크로 분할하여 API 호출 후 결과를 맵으로 반환
   * @private
   */
  async _translateChunks(uniqueTexts, systemPrompt, provider, apiKey, model) {
    const translationMap = {};

    for (let start = 0; start < uniqueTexts.length; start += CHUNK_SIZE) {
      const chunk = uniqueTexts.slice(start, start + CHUNK_SIZE);
      const userText = chunk.map((t, j) => `${j + 1}|${t}`).join('\n');
      const maxTokens = Math.max(4096, chunk.length * 200);

      const responseText = await this.callApi(systemPrompt, userText, provider, apiKey, model, maxTokens);
      const parsed = parseBatchResponse(responseText);

      for (let j = 0; j < chunk.length; j++) {
        const translation = parsed.get(j + 1);
        if (translation) {
          translationMap[chunk[j]] = translation;
        }
      }
    }

    return translationMap;
  }
}
