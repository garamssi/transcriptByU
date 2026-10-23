/**
 * API 오류 분류 (순수: I/O·chrome API 없음).
 * 프로바이더별 HTTP 오류·응답 이상을 공통 코드로 정규화해서,
 * 재시도 여부·대기 시간·사용자 표시를 한곳에서 판단할 수 있게 한다.
 */

export const ERROR_CODES = Object.freeze({
  RATE_LIMIT: 'RATE_LIMIT',         // 분당 요청/토큰 한도 초과 (잠시 후 회복)
  QUOTA_DAILY: 'QUOTA_DAILY',       // 일일 한도 소진 (태평양 시간 자정에 초기화)
  AUTH: 'AUTH',                     // API 키 오류·권한 없음
  BAD_REQUEST: 'BAD_REQUEST',       // 잘못된 요청(모델 ID 등 설정 문제)
  SERVER: 'SERVER',                 // 5xx·과부하
  TIMEOUT: 'TIMEOUT',               // 응답 시간 초과
  NETWORK: 'NETWORK',               // 네트워크 연결 실패
  EMPTY_RESPONSE: 'EMPTY_RESPONSE', // 본문 없는 응답
  BLOCKED: 'BLOCKED',               // 안전 필터 차단 (같은 입력 재시도 무의미)
  MAX_TOKENS: 'MAX_TOKENS',         // 출력 토큰 한도 도달 (청크 분할로 대응)
  PARSE_ERROR: 'PARSE_ERROR',       // 응답은 왔지만 일부 줄 매칭 실패
  NOT_RUNNING: 'NOT_RUNNING',       // Claude Code 로컬 프록시 미실행
  DISCONNECTED: 'DISCONNECTED',     // 확장 백그라운드와 연결 끊김
  UNKNOWN: 'UNKNOWN',
});

const C = ERROR_CODES;

/** 남은 청크를 보내도 같은 결과가 나오는 오류 — 즉시 중단한다. */
const FATAL = new Set([C.QUOTA_DAILY, C.AUTH, C.BAD_REQUEST, C.NOT_RUNNING, C.RATE_LIMIT]);
/** 잠시 후 같은 요청을 다시 보내면 성공할 수 있는 오류 — 자동 재시도 대상. */
const TRANSIENT = new Set([
  C.RATE_LIMIT, C.SERVER, C.TIMEOUT, C.NETWORK, C.EMPTY_RESPONSE,
  C.PARSE_ERROR, C.MAX_TOKENS, C.DISCONNECTED, C.UNKNOWN,
]);

export class ApiError extends Error {
  /**
   * @param {string} code - ERROR_CODES 값
   * @param {object} [opts]
   * @param {number} [opts.status] - HTTP 상태 코드
   * @param {number} [opts.retryAfterMs] - 서버가 권장한 대기 시간
   * @param {string} [opts.detail] - 원본 오류 메시지(로그용)
   */
  constructor(code, { status, retryAfterMs, detail } = {}) {
    super(code);
    this.name = 'ApiError';
    this.code = code;
    this.status = status;
    this.retryAfterMs = retryAfterMs;
    this.detail = detail;
  }
}

export const isFatalCode = (code) => FATAL.has(code);
export const isTransientCode = (code) => TRANSIENT.has(code);

/** 임의의 throw 값을 ApiError 로 정규화한다. */
export function toApiError(err) {
  if (err instanceof ApiError) return err;
  if (err?.name === 'TimeoutError' || err?.name === 'AbortError') {
    return new ApiError(C.TIMEOUT, { detail: err.message });
  }
  if (err instanceof TypeError && /fetch|network/i.test(err.message)) {
    return new ApiError(C.NETWORK, { detail: err.message });
  }
  return new ApiError(C.UNKNOWN, { detail: err?.message || String(err) });
}

/**
 * Google RPC Duration 문자열("43s", "1.5s")을 ms 로 변환한다.
 * @returns {number|undefined}
 */
export function parseDurationMs(value) {
  if (typeof value !== 'string') return undefined;
  const m = value.trim().match(/^(\d+(?:\.\d+)?)s$/);
  return m ? Math.round(parseFloat(m[1]) * 1000) : undefined;
}

/**
 * HTTP Retry-After 헤더(초 또는 HTTP 날짜)를 ms 로 변환한다.
 * @returns {number|undefined}
 */
export function parseRetryAfterHeader(value, now = Date.now()) {
  if (!value) return undefined;
  const sec = Number(value);
  if (Number.isFinite(sec)) return Math.max(0, Math.round(sec * 1000));
  const at = Date.parse(value);
  return Number.isFinite(at) ? Math.max(0, at - now) : undefined;
}

/**
 * 다음 태평양 시간(America/Los_Angeles) 자정의 epoch ms.
 * Gemini 일일 한도(RPD)가 이 시각에 초기화된다.
 */
export function nextPacificMidnight(now = Date.now()) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Los_Angeles', hourCycle: 'h23',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
  }).formatToParts(new Date(now));
  const get = (type) => Number(parts.find(p => p.type === type)?.value || 0);
  const elapsedMs = ((get('hour') % 24) * 3600 + get('minute') * 60 + get('second')) * 1000 + (now % 1000);
  return now - elapsedMs + 24 * 3600 * 1000;
}

/** 로그에 남기기 전에 API 키 등 비밀값을 가린다. */
export function redactSecrets(text) {
  if (!text) return '';
  return String(text)
    .replace(/([?&]key=)[^&\s"']+/gi, '$1***')
    .replace(/\bAIza[0-9A-Za-z_-]{20,}/g, 'AIza***')
    .replace(/\bsk-ant-[0-9A-Za-z_-]+/g, 'sk-ant-***');
}

function safeJson(text) {
  try { return JSON.parse(text); } catch { return null; }
}

/**
 * Gemini HTTP 오류 응답을 분류한다.
 * 429 본문의 QuotaFailure.violations[].quotaId 에 "PerDay" 가 있으면 일일 한도 소진으로 본다.
 * @param {number} status
 * @param {string} bodyText
 * @returns {ApiError}
 */
export function classifyGeminiHttpError(status, bodyText, now = Date.now()) {
  const body = safeJson(bodyText);
  const err = body?.error || {};
  const details = Array.isArray(err.details) ? err.details : [];
  const detail = redactSecrets(err.message || bodyText || '').slice(0, 500);

  if (status === 429) {
    const violations = details
      .filter(d => String(d['@type'] || '').endsWith('QuotaFailure'))
      .flatMap(d => d.violations || []);
    const perDay = violations.some(v => /PerDay/i.test(v.quotaId || '') || /per.?day/i.test(v.quotaMetric || ''));
    if (perDay) {
      return new ApiError(C.QUOTA_DAILY, { status, retryAfterMs: nextPacificMidnight(now) - now, detail });
    }
    const retryInfo = details.find(d => String(d['@type'] || '').endsWith('RetryInfo'));
    return new ApiError(C.RATE_LIMIT, { status, retryAfterMs: parseDurationMs(retryInfo?.retryDelay), detail });
  }

  const reasons = details.map(d => d.reason).filter(Boolean);
  if (status === 401 || status === 403 || reasons.includes('API_KEY_INVALID')) {
    return new ApiError(C.AUTH, { status, detail });
  }
  if (status === 408) return new ApiError(C.TIMEOUT, { status, detail });
  if (status >= 500) return new ApiError(C.SERVER, { status, detail });
  if (status >= 400) return new ApiError(C.BAD_REQUEST, { status, detail });
  return new ApiError(C.UNKNOWN, { status, detail });
}

/**
 * Gemini generateContent 응답에서 번역 텍스트를 꺼낸다.
 * 후보가 없거나(프롬프트 차단) 본문이 비면(안전 필터·토큰 한도) 원인별 ApiError 를 던진다.
 * @param {object} data - 응답 JSON
 * @returns {string}
 */
export function extractGeminiText(data) {
  const blockReason = data?.promptFeedback?.blockReason;
  const candidate = data?.candidates?.[0];
  if (!candidate) {
    throw new ApiError(blockReason ? C.BLOCKED : C.EMPTY_RESPONSE, { detail: blockReason || 'no candidates' });
  }
  const parts = candidate.content?.parts || [];
  // thinking 요약(thought: true)은 제외하고 text 파트를 모두 이어 붙인다.
  const text = parts.filter(p => typeof p.text === 'string' && !p.thought).map(p => p.text).join('').trim();
  const reason = candidate.finishReason;
  if (text && reason !== 'MAX_TOKENS') return text;
  if (reason === 'MAX_TOKENS') throw new ApiError(C.MAX_TOKENS, { detail: `finishReason=${reason}` });
  if (['SAFETY', 'RECITATION', 'BLOCKLIST', 'PROHIBITED_CONTENT', 'SPII'].includes(reason)) {
    throw new ApiError(C.BLOCKED, { detail: `finishReason=${reason}` });
  }
  throw new ApiError(C.EMPTY_RESPONSE, { detail: `finishReason=${reason || 'none'}` });
}

/**
 * Claude Messages API HTTP 오류를 분류한다.
 * @param {number} status
 * @param {string} bodyText
 * @param {string|null} retryAfter - retry-after 헤더 값
 */
export function classifyClaudeHttpError(status, bodyText, retryAfter, now = Date.now()) {
  const body = safeJson(bodyText);
  const detail = redactSecrets(body?.error?.message || bodyText || '').slice(0, 500);
  const retryAfterMs = parseRetryAfterHeader(retryAfter, now);
  if (status === 429) return new ApiError(C.RATE_LIMIT, { status, retryAfterMs, detail });
  if (status === 401 || status === 403) return new ApiError(C.AUTH, { status, detail });
  if (status === 408) return new ApiError(C.TIMEOUT, { status, detail });
  if (status >= 500) return new ApiError(C.SERVER, { status, retryAfterMs, detail }); // 529 overloaded 포함
  if (status >= 400) return new ApiError(C.BAD_REQUEST, { status, detail });
  return new ApiError(C.UNKNOWN, { status, detail });
}

/**
 * Claude Messages API 응답에서 텍스트를 꺼낸다.
 * thinking 블록이 앞에 올 수 있으므로 text 블록만 모은다.
 */
export function extractClaudeText(data) {
  const text = (data?.content || [])
    .filter(b => b.type === 'text' && typeof b.text === 'string')
    .map(b => b.text).join('').trim();
  if (data?.stop_reason === 'max_tokens') throw new ApiError(C.MAX_TOKENS, { detail: 'stop_reason=max_tokens' });
  if (text) return text;
  if (data?.stop_reason === 'refusal') throw new ApiError(C.BLOCKED, { detail: 'stop_reason=refusal' });
  throw new ApiError(C.EMPTY_RESPONSE, { detail: `stop_reason=${data?.stop_reason || 'none'}` });
}
