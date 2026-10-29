import { CHUNK_SIZE, FIRST_CHUNK_SIZE, SLOW_REQUEST_MS, REFERENCE_MAX_LINES } from '../domain/constants.js';
import { DEFAULT_TARGET_CODE } from '../domain/languages.js';
import { buildBatchSystemPrompt, buildBatchUserText } from '../domain/prompt-builder.js';
import { parseBatchResponse } from '../domain/response-parser.js';
import { lectureCacheKey } from '../domain/cache-key.js';
import { isAlreadyTargetLanguage } from '../domain/language-detect.js';
import { ERROR_CODES, isFatalCode, toApiError } from '../domain/api-error.js';

// MAX_TOKENS·BLOCKED 청크를 반으로 나눠 다시 보내는 최대 깊이 (30 → 15 → 8)
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
    // 번역 중인 문장(강의 캐시 키 + 원문) → 결과 Promise. 같은 강의를 연 다른 탭이나
    // 번역 도중 새로고침한 페이지가 같은 문장을 다시 요청해도 API 를 중복 호출하지 않고 기다린다.
    this.inFlight = new Map();
  }

  /**
   * 배치 번역 (캐시 조회 → 미번역분 API 호출 → 청크별 캐시 저장)
   * @param {object} req
   * @param {boolean} [req.force] - 캐시를 건너뛰고 새로 번역한다(재번역). 실패한 줄은 기존 번역을 유지한다.
   * @param {string[]} [req.script] - 강의 전체 대본(원문, 순서대로). 모든 청크에 공통 문맥으로 넣어 번역을 통일한다.
   * @param {(entries: Record<string,string>) => void} [onPartial] - 청크가 끝날 때마다 그 번역을 바로 알린다
   *   (전체 완료를 기다리지 않고 화면에 먼저 반영하기 위함)
   * @returns {Promise<{ results?: Array, error?: { code: string, retryAfterMs?: number, message?: string } }>}
   *   results[i] = { translation, cached } | { skipped: true } | { error: code }
   *   error = 일부/전체 실패 시 대표 오류 (재시도·표시 판단용)
   */
  async translateBatch({ texts, targetCode, sourceCode, course, lecture, section, script, force = false }, onPartial) {
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
      //    다른 요청이 이미 번역 중인 문장은 보내지 않고 그 결과를 기다린다(재번역 제외).
      const uniqueTexts = [...new Set(uncachedIndices.map(i => texts[i]))];
      // 진행 중 표시를 등록하기 전에 만든다 — 여기서 throw 하면 등록된 표시가 영영 풀리지 않는다.
      const systemPrompt = buildBatchSystemPrompt(target, context, script);
      const flightKey = t => `${lKey}\n${t}`;
      const waiting = force ? [] : uniqueTexts.filter(t => this.inFlight.has(flightKey(t)));
      const toTranslate = force ? uniqueTexts : uniqueTexts.filter(t => !this.inFlight.has(flightKey(t)));
      const deferreds = new Map();
      if (!force) {
        for (const t of toTranslate) {
          let resolve;
          const promise = new Promise(r => { resolve = r; });
          deferreds.set(t, resolve);
          this.inFlight.set(flightKey(t), promise);
        }
      }
      const settle = (t, result) => {
        const resolve = deferreds.get(t);
        if (!resolve) return;
        deferreds.delete(t);
        if (this.inFlight.get(flightKey(t))) this.inFlight.delete(flightKey(t));
        resolve(result);
      };

      // 참고 번역: 이 강의에서 이미 확정된 번역(캐시) + 이번 요청에서 앞 청크가 낸 번역.
      // 다음 청크가 같은 용어·문체를 이어 쓰게 한다. 재번역은 기존 번역에 끌려가지 않도록 비운다.
      const references = new Map(force ? [] : Object.entries(lectureTranslations));
      const job = {
        systemPrompt,
        references,
        provider, apiKey, model, context,
        // 동시 요청(다중 자막 트랙 등 동일 강의·상이 텍스트)이 각자 로드한 캐시 객체를
        // 서로 덮어쓰지 않도록, 저장 직전 L1 최신본에 병합한다. get→assign→set 은
        // await 없이 동기 실행이라 원자적이며, 나중에 저장하는 요청이 먼저 저장된 번역을
        // 흡수하므로 lost update 가 발생하지 않는다.
        // L1 에서 빠졌으면(번역 중 팝업에서 캐시 삭제 등) 처음 로드한 맵 대신 L2 현재값을 기준으로 삼아
        // 삭제된 캐시를 되살리지 않는다. await 뒤에 L1 을 다시 확인하므로 병합의 원자성은 유지된다.
        persist: async (entries) => {
          let latest = null;
          try {
            latest = this.l1Cache.get(lKey);
            if (!latest) {
              const fromL2 = (await this.l2Cache.l2Get(lKey)) || {};
              latest = this.l1Cache.get(lKey) || fromL2;
            }
            Object.assign(latest, entries);
            this.l1Cache.set(lKey, latest);
          } catch (err) {
            console.warn('[UdemyTranslator] cache persist failed:', err?.message || err);
          }
          // L1 에 들어간 뒤에 진행 중 표시를 푼다. 먼저 풀면 그 사이 들어온 요청이 캐시도
          // 진행 중 표시도 못 보고 같은 문장을 다시 번역한다.
          for (const [t, tr] of Object.entries(entries)) {
            references.set(t, tr);
            settle(t, { translation: tr });
          }
          try { onPartial?.(entries); } catch (_) { /* 알림 실패는 번역에 영향 주지 않음 */ }
          try {
            if (latest) await this.l2Cache.l2Set(lKey, latest);
          } catch (err) {
            // 저장 실패가 이미 받은 번역까지 버리게 하지 않는다.
            console.warn('[UdemyTranslator] cache persist failed:', err?.message || err);
          }
        },
      };
      // 기다리던 문장이 풀리면 한 번에 모아 알린다(한 줄씩 보내면 탭 메시지·화면 재스캔이 줄 수만큼 발생).
      // 소유 요청이 한 청크를 동기적으로 settle 하므로, 그 반응들이 끝난 뒤 마이크로태스크 하나로 모인다.
      let waitedBatch = null;
      const waited = Promise.all(waiting.map(t => this.inFlight.get(flightKey(t)).then(r => {
        if (r.translation) {
          if (!waitedBatch) {
            waitedBatch = {};
            queueMicrotask(() => {
              const batch = waitedBatch;
              waitedBatch = null;
              try { onPartial?.(batch); } catch (_) { /* noop */ }
            });
          }
          waitedBatch[t] = r.translation;
        }
        return [t, r];
      })));
      let chunked;
      try {
        chunked = toTranslate.length > 0
          ? await this._translateChunked(toTranslate, job)
          : { translations: {}, failures: new Map(), error: null };
      } finally {
        // 성공하지 못한 문장은 기다리던 다른 요청에 실패로 알린다(그쪽은 자체 재시도 경로를 탄다).
        // 대기 시간(retryAfterMs)도 넘겨, 기다린 쪽이 한도 대기 전에 재시도하지 않게 한다.
        for (const t of [...deferreds.keys()]) {
          const code = chunked?.failures.get(t) || ERROR_CODES.UNKNOWN;
          const retryAfterMs = chunked?.error?.code === code ? chunked.error.retryAfterMs : undefined;
          settle(t, { code, retryAfterMs });
        }
      }
      const { translations, failures } = chunked;
      let { error } = chunked;
      for (const [t, r] of await waited) {
        if (r.translation) translations[t] = r.translation;
        else {
          failures.set(t, r.code || ERROR_CODES.UNKNOWN);
          if (!error) error = { code: r.code || ERROR_CODES.UNKNOWN, retryAfterMs: r.retryAfterMs };
        }
      }

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
      // 아직 반영하지 않은 번역만 결과·캐시에 넣고 화면에 알린다(청크끼리 원문이 겹치지 않음).
      const commit = async () => {
        const fresh = Object.fromEntries(Object.entries(chunkResult).filter(([t]) => !(t in translations)));
        Object.assign(translations, fresh);
        if (Object.keys(fresh).length > 0) await job.persist(fresh);
      };
      try {
        let failed = await this._translateAndParse(chunk, job, chunkResult);
        if (failed.length > 0) {
          // 성공한 줄은 재시도를 기다리지 않고 먼저 반영한다(첫 청크의 한두 줄 실패가 첫 화면을 늦추지 않게).
          await commit();
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
        await commit();
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
      await commit();
    };

    if (job.provider === 'claude-code') {
      // 첫 청크(작은 청크)를 먼저 끝내 첫 화면을 앞당기고, 그 번역을 참고로 삼아 나머지를 병렬로 보낸다.
      // 전부 동시에 보내면 청크끼리 서로의 번역을 못 봐 같은 용어가 청크마다 달라진다.
      // 청크마다 오류를 내부에서 처리하므로 하나가 실패해도 나머지 결과는 유지된다.
      await translateChunk(chunks[0]);
      await Promise.all(chunks.slice(1).map(c => translateChunk(c)));
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
      // 재시도(한도 대기 등) 없이 오래 걸린 건 응답 생성 시간이라 정상이다(Claude Code 는 청크당 10~30초).
      // 재시도가 끼었으면 10초, 아니면 프로바이더별 정상 범위를 넘을 때만 '느린 요청'으로 남긴다.
      const slowMs = retries.length > 0 ? SLOW_REQUEST_MS
        : job.provider === 'claude-code' ? Math.max(60_000, lineCount * 2000) : Math.max(SLOW_REQUEST_MS * 2, lineCount * 1000);
      if (durationMs >= slowMs) {
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
  /**
   * 청크에 함께 보낼 참고 번역: 가장 최근에 확정된 것부터 REFERENCE_MAX_LINES 개.
   * (이번 청크의 원문은 제외 — 재번역 중 옛 번역을 그대로 베끼지 않게)
   * @private
   */
  _pickReferences(job, texts) {
    if (!job.references?.size) return [];
    const skip = new Set(texts);
    const picked = [];
    const entries = [...job.references];
    for (let i = entries.length - 1; i >= 0 && picked.length < REFERENCE_MAX_LINES; i--) {
      if (!skip.has(entries[i][0])) picked.push(entries[i]);
    }
    return picked.reverse();
  }

  async _translateAndParse(texts, job, out) {
    const { provider } = job;
    const maxTokens = Math.max(4096, texts.length * 400);
    const userText = buildBatchUserText(texts, this._pickReferences(job, texts));
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
