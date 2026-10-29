import { CHUNK_SIZE, FIRST_CHUNK_SIZE, SLOW_REQUEST_MS } from '../domain/constants.js';
import { DEFAULT_TARGET_CODE } from '../domain/languages.js';
import { buildBatchSystemPrompt } from '../domain/prompt-builder.js';
import { parseBatchResponse } from '../domain/response-parser.js';
import { lectureCacheKey } from '../domain/cache-key.js';
import { isAlreadyTargetLanguage } from '../domain/language-detect.js';
import { ERROR_CODES, isFatalCode, toApiError } from '../domain/api-error.js';

// MAX_TOKENS·BLOCKED 청크를 반으로 나눠 다시 보내는 최대 깊이 (60 → 30 → 15)
const MAX_SPLIT_DEPTH = 2;

/**
 * 번역 유스케이스를 캡슐화하는 서비스
 */
export class TranslationService {
  /**
   * @param {object} deps
   * @param {import('../infrastructure/cache/lru-cache.js').LRUCache} deps.l1Cache - L1 메모리 캐시
   * @param {{ l2Get: Function, l2Set: Function }} deps.l2Cache - L2 스토리지 캐시
   * @param {Function} deps.callApi - API 호출 함수 (마지막 인자로 { onRetry } 훅을 받는다)
   * @param {Function} deps.getProviderConfig - Provider 설정 로드 함수
   * @param {Function} deps.getSettings - 번역 게이트 설정 로드 함수
   * @param {Function} [deps.logError] - 오류 로그 기록 함수
   * @param {number} [deps.interChunkDelayMs] - 클라우드 재시도 전 대기 (테스트에서 0)
   * @param {() => number} [deps.now]
   */
  constructor({ l1Cache, l2Cache, callApi, getProviderConfig, getSettings, logError = () => {}, interChunkDelayMs = 1000, now = Date.now }) {
    this.l1Cache = l1Cache;
    this.l2Cache = l2Cache;
    this.callApi = callApi;
    this.getProviderConfig = getProviderConfig;
    this.getSettings = getSettings;
    this.logError = logError;
    this.cloudRetryDelayMs = interChunkDelayMs;
    this.now = now;
  }

  /**
   * 배치 번역 (캐시 조회 → 미번역분 API 호출 → 청크별 캐시 저장)
   * @param {object} req
   * @param {boolean} [req.force] - 캐시를 건너뛰고 새로 번역한다(재번역). 실패한 줄은 기존 번역을 유지한다.
   * @param {(entries: Record<string,string>) => void} [onPartial] - 청크가 끝날 때마다 그 번역을 바로 알린다
   *   (전체 완료를 기다리지 않고 화면에 먼저 반영하기 위함)
   * @returns {Promise<{ results?: Array, error?: { code: string, retryAfterMs?: number, message?: string } }>}
   *   results[i] = { translation, cached } | { skipped: true } | { error: code }
   *   error = 일부/전체 실패 시 대표 오류 (재시도·표시 판단용)
   */
  async translateBatch({ texts, targetCode, sourceCode, course, lecture, section, force = false }, onPartial) {
    try {
      const { enabled } = await this.getSettings();
      if (enabled === false) return { error: { code: 'DISABLED' } };

      const { provider, apiKey, model } = await this.getProviderConfig();
      if (!apiKey) return { error: { code: 'NO_API_KEY' } };

      const target = targetCode || DEFAULT_TARGET_CODE;
      const context = { course: course || '', lecture: lecture || '', section: section || '' };
      const lKey = lectureCacheKey(target, context.course, context.section, context.lecture);

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

      // 2) 각 텍스트를 조회
      //    - 이미 목표 언어면(예: 한국어 자막 → 한국어) 번역하지 않고 스킵
      //    - 그 외에는 캐시 조회(force 면 건너뜀), 없으면 API 대상으로 수집
      const results = new Array(texts.length).fill(null);
      const uncachedIndices = [];
      let skippedCount = 0;

      for (let i = 0; i < texts.length; i++) {
        if (isAlreadyTargetLanguage(texts[i], target, sourceCode)) {
          results[i] = { skipped: true };
          skippedCount++;
          continue;
        }
        const cached = force ? null : lectureTranslations[texts[i]];
        if (cached) {
          results[i] = { translation: cached, cached: true };
        } else {
          uncachedIndices.push(i);
        }
      }

      if (skippedCount > 0) {
        console.log(`[UdemyTranslator] ${skippedCount}/${texts.length} lines already in ${target} — skipped`);
      }

      if (uncachedIndices.length === 0) return { results };

      // 3) 미번역분: 중복 제거 후 청크 단위 API 호출. 성공한 청크는 즉시 캐시에 병합 저장한다.
      const uniqueTexts = [...new Set(uncachedIndices.map(i => texts[i]))];
      const job = {
        systemPrompt: buildBatchSystemPrompt(target, context),
        provider, apiKey, model, context,
        // 동시 요청(다중 자막 트랙 등 동일 강의·상이 텍스트)이 각자 로드한 캐시 객체를
        // 서로 덮어쓰지 않도록, 저장 직전 L1 최신본에 병합한다. get→assign→set 은
        // await 없이 동기 실행이라 원자적이며, 나중에 저장하는 요청이 먼저 저장된 번역을
        // 흡수하므로 lost update 가 발생하지 않는다.
        // L1 에서 빠졌으면(번역 중 팝업에서 캐시 삭제 등) 처음 로드한 맵 대신 L2 현재값을 기준으로 삼아
        // 삭제된 캐시를 되살리지 않는다. await 뒤에 L1 을 다시 확인하므로 병합의 원자성은 유지된다.
        persist: async (entries) => {
          try { onPartial?.(entries); } catch (_) { /* 알림 실패는 번역에 영향 주지 않음 */ }
          try {
            let latest = this.l1Cache.get(lKey);
            if (!latest) {
              const fromL2 = (await this.l2Cache.l2Get(lKey)) || {};
              latest = this.l1Cache.get(lKey) || fromL2;
            }
            Object.assign(latest, entries);
            this.l1Cache.set(lKey, latest);
            await this.l2Cache.l2Set(lKey, latest);
          } catch (err) {
            // 저장 실패가 이미 받은 번역까지 버리게 하지 않는다.
            console.warn('[UdemyTranslator] cache persist failed:', err?.message || err);
          }
        },
      };
      const { translations, failures, error } = await this._translateChunked(uniqueTexts, job);

      for (const i of uncachedIndices) {
        const translation = translations[texts[i]];
        if (translation) {
          results[i] = { translation, cached: false };
          continue;
        }
        const code = failures.get(texts[i]) || ERROR_CODES.PARSE_ERROR;
        const previous = lectureTranslations[texts[i]];
        // 재번역(force)에 실패한 줄은 기존 번역을 그대로 돌려줘 화면에서 사라지지 않게 한다.
        results[i] = previous ? { translation: previous, cached: true, error: code } : { error: code };
      }

      return error ? { results, error } : { results };
    } catch (err) {
      const e = toApiError(err);
      return { error: { code: e.code, message: e.detail || e.message } };
    }
  }

  /**
   * 특정 강의의 캐시를 삭제한다 (L1 + L2).
   */
  async clearLectureCache({ lang, course, lecture, section }) {
    const target = lang;
    const context = { course: course || '', lecture: lecture || '', section: section || '' };
    const lKey = lectureCacheKey(target, context.course, context.section, context.lecture);

    this.l1Cache.delete(lKey);
    await this.l2Cache.l2Delete(lKey);
  }

  /**
   * 첫 청크는 FIRST_CHUNK_SIZE, 이후 CHUNK_SIZE 단위로 나눠 번역한다.
   * - 청크마다 오류를 따로 처리하고, 성공한 청크는 바로 persist 한다.
   * - 남은 청크도 같은 결과가 나올 오류(일일 한도·키 오류·긴 쿨다운)면 즉시 중단한다.
   * - claude-code 는 로컬 프록시가 큐잉하므로 병렬, 클라우드는 스케줄러가 간격을 조절하므로 순차.
   * @private
   * @returns {Promise<{ translations: Record<string,string>, failures: Map<string,string>, error: object|null }>}
   */
  async _translateChunked(uniqueTexts, job) {
    const translations = {};
    const failures = new Map();
    let firstError = null;
    let stopped = false;

    const chunks = [uniqueTexts.slice(0, FIRST_CHUNK_SIZE)];
    for (let start = FIRST_CHUNK_SIZE; start < uniqueTexts.length; start += CHUNK_SIZE) {
      chunks.push(uniqueTexts.slice(start, start + CHUNK_SIZE));
    }

    const fail = (texts, apiErr) => {
      for (const t of texts) if (!translations[t]) failures.set(t, apiErr.code);
      if (!firstError || (isFatalCode(apiErr.code) && !isFatalCode(firstError.code))) {
        firstError = { code: apiErr.code, retryAfterMs: apiErr.retryAfterMs, message: apiErr.detail };
      }
      if (isFatalCode(apiErr.code)) stopped = true;
    };

    const translateChunk = async (chunk, depth = 0) => {
      if (stopped) {
        for (const t of chunk) failures.set(t, firstError?.code || ERROR_CODES.UNKNOWN);
        return;
      }
      const chunkResult = {};
      try {
        let failed = await this._translateAndParse(chunk, job, chunkResult);
        if (failed.length > 0) {
          console.log(`[UdemyTranslator:${job.provider}] Retrying ${failed.length} failed texts`);
          if (job.provider !== 'claude-code' && this.cloudRetryDelayMs > 0) {
            await new Promise(r => setTimeout(r, this.cloudRetryDelayMs));
          }
          failed = await this._translateAndParse(failed, job, chunkResult);
          if (failed.length > 0) {
            console.warn(`[UdemyTranslator:${job.provider}] ${failed.length} texts failed after retry`);
            for (const t of failed) failures.set(t, ERROR_CODES.PARSE_ERROR);
            this._log(job, { level: 'warn', code: ERROR_CODES.PARSE_ERROR, lines: chunk.length, failed: failed.length });
          }
        }
      } catch (raw) {
        const err = toApiError(raw);
        Object.assign(translations, chunkResult);
        if (Object.keys(chunkResult).length > 0) await job.persist(chunkResult);
        // 출력 한도 초과·안전 필터는 같은 입력을 다시 보내도 같으므로, 반으로 나눠 범위를 좁힌다.
        const splittable = err.code === ERROR_CODES.MAX_TOKENS || err.code === ERROR_CODES.BLOCKED;
        const rest = chunk.filter(t => !chunkResult[t]);
        if (splittable && rest.length > 1 && depth < MAX_SPLIT_DEPTH) {
          const mid = Math.ceil(rest.length / 2);
          await translateChunk(rest.slice(0, mid), depth + 1);
          await translateChunk(rest.slice(mid), depth + 1);
          return;
        }
        fail(rest, err);
        // 스케줄러가 API 를 호출하지 않고 바로 돌려보낸 경우(차단·쿨다운)는 로그를 남기지 않는다.
        if (!err.local) {
          this._log(job, {
            level: 'error', code: err.code, status: err.status, lines: rest.length,
            retryAfterMs: err.retryAfterMs, durationMs: err.durationMs, message: err.detail,
          });
        }
        return;
      }
      Object.assign(translations, chunkResult);
      if (Object.keys(chunkResult).length > 0) await job.persist(chunkResult);
    };

    if (job.provider === 'claude-code') {
      // 청크마다 오류를 내부에서 처리하므로 하나가 실패해도 나머지 결과는 유지된다.
      await Promise.all(chunks.map(c => translateChunk(c)));
    } else {
      for (const chunk of chunks) await translateChunk(chunk);
    }

    return { translations, failures, error: firstError };
  }

  /**
   * API 1회 호출 + 느린 요청·재시도 기록.
   * @private
   */
  async _call(job, userText, maxTokens, lineCount) {
    let startedAt = this.now();
    const retries = [];
    try {
      const text = await this.callApi(job.systemPrompt, userText, job.provider, job.apiKey, job.model, maxTokens, {
        onStart: () => { startedAt = this.now(); },
        onRetry: (code, waitMs) => retries.push({ code, waitMs }),
      });
      const durationMs = this.now() - startedAt;
      if (durationMs >= SLOW_REQUEST_MS) {
        const waitMs = retries.reduce((s, r) => s + r.waitMs, 0);
        const reasons = [...new Set(retries.map(r => r.code))].join(', ');
        this._log(job, {
          level: 'warn', code: 'SLOW', lines: lineCount, durationMs, waitMs,
          message: retries.length ? `retried ${retries.length}x (${reasons})` : '',
        });
      }
      return text;
    } catch (raw) {
      const err = toApiError(raw);
      err.durationMs = this.now() - startedAt;
      throw err;
    }
  }

  _log(job, entry) {
    try {
      this.logError({
        provider: job.provider,
        model: job.model,
        course: job.context.course,
        section: job.context.section,
        lecture: job.context.lecture,
        ...entry,
      });
    } catch (_) { /* 로그 실패는 번역에 영향 주지 않음 */ }
  }

  /**
   * 청크를 번역하고 파싱, 성공분은 out 에 채우고 실패한 원본 텍스트 배열 반환
   * @private
   */
  async _translateAndParse(texts, job, out) {
    const { provider } = job;
    const maxTokens = Math.max(4096, texts.length * 400);
    const numberedLines = texts.map((t, j) => `${j + 1}|${t}`).join('\n');
    const userText = `[${texts.length} lines — output exactly ${texts.length} lines]\n${numberedLines}`;
    const responseText = await this._call(job, userText, maxTokens, texts.length);
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
        out[texts[j]] = translation;
      } else {
        failed.push(texts[j]);
      }
    }
    return failed;
  }
}
