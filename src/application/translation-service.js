import { CHUNK_SIZE, OLLAMA_CHUNK_SIZE, DEFAULT_TARGET_LANG } from '../domain/constants.js';
import { buildBatchSystemPrompt, buildOllamaSystemPrompt } from '../domain/prompt-builder.js';
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

      // 3) 미번역분: 중복 제거 후 API 호출
      if (uncachedIndices.length > 0) {
        const uniqueTexts = [...new Set(uncachedIndices.map(i => texts[i]))];
        const systemPrompt = provider === 'ollama'
          ? buildOllamaSystemPrompt(targetLang, context)
          : buildBatchSystemPrompt(targetLang, context);

        try {
          const newTranslations = await this._translateByProvider(uniqueTexts, systemPrompt, provider, apiKey, model);

          for (const i of uncachedIndices) {
            const translation = newTranslations[texts[i]];
            if (translation) {
              results[i] = { translation, cached: false };
            } else {
              results[i] = { error: 'PARSE_ERROR' };
            }
          }

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
   * 특정 강의의 캐시를 삭제한다 (L1 + L2).
   */
  async clearLectureCache({ lang, lecture, section }) {
    const targetLang = lang;
    const context = { lecture: lecture || '', section: section || '' };
    const lKey = lectureCacheKey(targetLang, context.section, context.lecture);

    this.l1Cache.delete(lKey);
    await this.l2Cache.l2Delete(lKey);
  }

  /**
   * 프로바이더별 번역 전략 분기
   * @private
   */
  async _translateByProvider(uniqueTexts, systemPrompt, provider, apiKey, model) {
    if (provider === 'ollama') {
      return this._translateOllama(uniqueTexts, systemPrompt, apiKey, model);
    }
    return this._translateCloud(uniqueTexts, systemPrompt, provider, apiKey, model);
  }

  /**
   * Ollama 전략: 소청크, 딜레이 없음, 실패분 최대 2회 재시도
   * @private
   */
  async _translateOllama(uniqueTexts, systemPrompt, apiKey, model) {
    const translationMap = {};

    for (let start = 0; start < uniqueTexts.length; start += OLLAMA_CHUNK_SIZE) {
      const chunk = uniqueTexts.slice(start, start + OLLAMA_CHUNK_SIZE);
      const maxTokens = Math.max(4096, chunk.length * 400);

      let remaining = chunk;
      const maxRetries = 2;

      for (let attempt = 0; attempt <= maxRetries && remaining.length > 0; attempt++) {
        if (attempt > 0) {
          console.log(`[UdemyTranslator:Ollama] Retry ${attempt}/${maxRetries} for ${remaining.length} texts`);
        }

        const failed = await this._translateAndParse(remaining, systemPrompt, 'ollama', apiKey, model, maxTokens, translationMap);
        remaining = failed;
      }

      if (remaining.length > 0) {
        console.warn(`[UdemyTranslator:Ollama] ${remaining.length} texts failed after retries`);
      }
    }

    return translationMap;
  }

  /**
   * Cloud 전략 (Gemini/Claude): 대청크, 청크 간 1초 딜레이, 실패분 1회 재시도
   * @private
   */
  async _translateCloud(uniqueTexts, systemPrompt, provider, apiKey, model) {
    const translationMap = {};

    for (let start = 0; start < uniqueTexts.length; start += CHUNK_SIZE) {
      const chunk = uniqueTexts.slice(start, start + CHUNK_SIZE);
      const maxTokens = Math.max(4096, chunk.length * 400);

      // 청크 간 1초 딜레이 (rate limit 보호)
      if (start > 0) await new Promise(r => setTimeout(r, 1000));

      const failed = await this._translateAndParse(chunk, systemPrompt, provider, apiKey, model, maxTokens, translationMap);

      // 실패분 1회 재시도
      if (failed.length > 0) {
        console.log(`[UdemyTranslator:${provider}] Retrying ${failed.length} failed texts`);
        await new Promise(r => setTimeout(r, 1000));
        const retryMaxTokens = Math.max(4096, failed.length * 400);
        const stillFailed = await this._translateAndParse(failed, systemPrompt, provider, apiKey, model, retryMaxTokens, translationMap);
        if (stillFailed.length > 0) {
          console.warn(`[UdemyTranslator:${provider}] ${stillFailed.length} texts failed after retry`);
        }
      }
    }

    return translationMap;
  }

  /**
   * 청크를 번역하고 파싱, 실패한 원본 텍스트 배열 반환
   * @private
   */
  async _translateAndParse(texts, systemPrompt, provider, apiKey, model, maxTokens, translationMap) {
    const numberedLines = texts.map((t, j) => `${j + 1}|${t}`).join('\n');
    const userText = `[${texts.length} lines — output exactly ${texts.length} lines]\n${numberedLines}`;
    const responseText = await this.callApi(systemPrompt, userText, provider, apiKey, model, maxTokens);
    console.log(`[UdemyTranslator:${provider}] Raw response:\n${responseText}`);
    const parsed = parseBatchResponse(responseText, texts.length);
    console.log(`[UdemyTranslator:${provider}] Parsed ${parsed.size}/${texts.length} lines`);

    // 응답 줄 수가 입력보다 많으면 밀림 가능성 → 전체 실패 처리
    const rawLineCount = responseText.split('\n').filter(l => l.trim()).length;
    if (rawLineCount > texts.length) {
      console.warn(`[UdemyTranslator:${provider}] Response has ${rawLineCount} lines for ${texts.length} inputs — likely shifted, rejecting all`);
      return [...texts];
    }

    // 중복 번역 감지: 다른 원본인데 같은 번역이면 의심
    const translationToNum = new Map();
    const suspectNums = new Set();
    for (let j = 0; j < texts.length; j++) {
      const translation = parsed.get(j + 1);
      if (!translation) continue;
      const prevNum = translationToNum.get(translation);
      if (prevNum !== undefined && texts[prevNum] !== texts[j]) {
        suspectNums.add(prevNum);
        suspectNums.add(j);
      }
      translationToNum.set(translation, j);
    }
    if (suspectNums.size > 0) {
      console.warn(`[UdemyTranslator:${provider}] Duplicate translations detected at indices: ${[...suspectNums].join(',')}`);
    }

    const failed = [];
    for (let j = 0; j < texts.length; j++) {
      const translation = parsed.get(j + 1);
      if (translation && !suspectNums.has(j)) {
        translationMap[texts[j]] = translation;
      } else {
        failed.push(texts[j]);
      }
    }
    return failed;
  }
}
