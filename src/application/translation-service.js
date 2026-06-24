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

      // 3) 미번역분: 중복 제거 후 API 호출
      if (uncachedIndices.length > 0) {
        const uniqueTexts = [...new Set(uncachedIndices.map(i => texts[i]))];
        const systemPrompt = buildBatchSystemPrompt(targetLang, context);

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
   * 프로바이더별 번역 전략 분기.
   * 모든 프로바이더가 CHUNK_SIZE 단위로 청크를 나눠 전송한다.
   * claude-code는 로컬 프록시가 요청을 직렬화하므로 청크 간 딜레이가 불필요하고,
   * cloud(Gemini/Claude)는 rate limit 보호를 위해 청크 간 1초 딜레이를 둔다.
   * @private
   */
  async _translateByProvider(uniqueTexts, systemPrompt, provider, apiKey, model) {
    const interChunkDelayMs = provider === 'claude-code' ? 0 : 1000;
    return this._translateChunked(uniqueTexts, systemPrompt, provider, apiKey, model, interChunkDelayMs);
  }

  /**
   * CHUNK_SIZE 단위로 청크를 나눠 번역하고, 청크별 실패분을 1회 재시도한다.
   * 청킹으로 단일 거대 요청에서 발생하는 응답 잘림·CLI 타임아웃과
   * 그로 인한 대량 재시도(토큰 낭비)를 방지한다.
   * @private
   */
  async _translateChunked(uniqueTexts, systemPrompt, provider, apiKey, model, interChunkDelayMs) {
    const translationMap = {};

    // 청크 분할
    const chunks = [];
    for (let start = 0; start < uniqueTexts.length; start += CHUNK_SIZE) {
      chunks.push(uniqueTexts.slice(start, start + CHUNK_SIZE));
    }

    // 청크 1개 번역 + 실패분 1회 재시도. translationMap은 원문 텍스트를 키로
    // 쓰고 청크끼리 텍스트가 겹치지 않으므로, 병렬 실행해도 키 충돌이 없다.
    const translateChunk = async (chunk) => {
      const maxTokens = Math.max(4096, chunk.length * 400);
      const failed = await this._translateAndParse(chunk, systemPrompt, provider, apiKey, model, maxTokens, translationMap);
      if (failed.length > 0) {
        console.log(`[UdemyTranslator:${provider}] Retrying ${failed.length} failed texts`);
        if (interChunkDelayMs > 0) await new Promise(r => setTimeout(r, interChunkDelayMs));
        const retryMaxTokens = Math.max(4096, failed.length * 400);
        const stillFailed = await this._translateAndParse(failed, systemPrompt, provider, apiKey, model, retryMaxTokens, translationMap);
        if (stillFailed.length > 0) {
          console.warn(`[UdemyTranslator:${provider}] ${stillFailed.length} texts failed after retry`);
        }
      }
    };

    if (interChunkDelayMs === 0) {
      // claude-code: 모든 청크를 병렬 전송 (로컬 프록시가 MAX_CONCURRENT로 큐잉)
      await Promise.all(chunks.map(translateChunk));
    } else {
      // cloud(Gemini/Claude): rate limit 보호를 위해 순차 + 청크 간 딜레이
      for (let i = 0; i < chunks.length; i++) {
        if (i > 0) await new Promise(r => setTimeout(r, interChunkDelayMs));
        await translateChunk(chunks[i]);
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

    // 응답 줄 수가 입력보다 많으면 밀림 가능성 → 전체 실패 처리 (소형 모델 전용, claude-code는 스킵)
    if (provider !== 'claude-code') {
      const rawLineCount = responseText.split('\n').filter(l => l.trim()).length;
      if (rawLineCount > texts.length) {
        console.warn(`[UdemyTranslator:${provider}] Response has ${rawLineCount} lines for ${texts.length} inputs — likely shifted, rejecting all`);
        return [...texts];
      }
    }

    // 중복 번역 감지: 다른 원본인데 같은 번역이면 의심 (소형 모델 전용, claude-code는 스킵)
    // claude-code는 고품질 모델이라 짧은 줄("Right.", "Okay." 등)이 정당하게 같은 번역으로
    // 나오는 경우가 많은데, 이를 의심으로 떨어뜨리면 해당 줄이 캐시에 안 들어가
    // 재방문마다 재번역되는 비결정적 누락이 발생한다. 따라서 claude-code에선 중복 거부를 하지 않는다.
    const suspectNums = new Set();
    if (provider !== 'claude-code') {
      const translationToNum = new Map();
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
