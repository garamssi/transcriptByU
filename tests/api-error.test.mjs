import test from 'node:test';
import assert from 'node:assert';
import {
  ERROR_CODES as C, classifyGeminiHttpError, extractGeminiText, classifyClaudeHttpError,
  extractClaudeText, nextPacificMidnight, parseDurationMs, redactSecrets, isFatalCode,
  sanitizeApiKey, hasInvalidKeyChars, fetchErrorCode, toApiError,
} from '../src/domain/api-error.js';

const gemini429 = (quotaId, retryDelay = '43s') => JSON.stringify({
  error: {
    code: 429, status: 'RESOURCE_EXHAUSTED', message: 'You exceeded your current quota',
    details: [
      { '@type': 'type.googleapis.com/google.rpc.QuotaFailure', violations: [{ quotaId, quotaMetric: 'generativelanguage.googleapis.com/generate_content_free_tier_requests' }] },
      { '@type': 'type.googleapis.com/google.rpc.RetryInfo', retryDelay },
    ],
  },
});

test('Gemini 429 분당 한도 → RATE_LIMIT + RetryInfo 대기시간', () => {
  const e = classifyGeminiHttpError(429, gemini429('GenerateRequestsPerMinutePerProjectPerModel-FreeTier', '12.5s'));
  assert.strictEqual(e.code, C.RATE_LIMIT);
  assert.strictEqual(e.retryAfterMs, 12500);
});

test('Gemini 429 일일 한도 → QUOTA_DAILY + 태평양 자정까지 대기', () => {
  const now = Date.UTC(2026, 9, 23, 3, 0, 0); // PDT 기준 10/22 20:00
  const e = classifyGeminiHttpError(429, gemini429('GenerateRequestsPerDayPerProjectPerModel-FreeTier'), now);
  assert.strictEqual(e.code, C.QUOTA_DAILY);
  assert.strictEqual(e.retryAfterMs, 4 * 3600 * 1000); // PDT 자정 = 07:00 UTC
  assert.ok(isFatalCode(e.code));
});

test('Gemini HTTP 상태별 분류', () => {
  assert.strictEqual(classifyGeminiHttpError(503, '{"error":{"message":"overloaded"}}').code, C.SERVER);
  assert.strictEqual(classifyGeminiHttpError(403, '{}').code, C.AUTH);
  const invalidKey = JSON.stringify({ error: { message: 'API key not valid', details: [{ reason: 'API_KEY_INVALID' }] } });
  assert.strictEqual(classifyGeminiHttpError(400, invalidKey).code, C.AUTH);
  assert.strictEqual(classifyGeminiHttpError(404, 'not json').code, C.BAD_REQUEST);
});

test('Gemini 응답 추출: thought 파트 제외·여러 파트 결합', () => {
  const text = extractGeminiText({ candidates: [{ finishReason: 'STOP', content: { parts: [{ text: 'thinking', thought: true }, { text: '1|안녕' }, { text: '\n2|하세요' }] } }] });
  assert.strictEqual(text, '1|안녕\n2|하세요');
});

test('Gemini 비정상 응답은 원인별 오류 (TypeError 아님)', () => {
  assert.throws(() => extractGeminiText({ promptFeedback: { blockReason: 'SAFETY' } }), { code: C.BLOCKED });
  assert.throws(() => extractGeminiText({}), { code: C.EMPTY_RESPONSE });
  assert.throws(() => extractGeminiText({ candidates: [{ finishReason: 'MAX_TOKENS', content: { parts: [{ text: '1|잘린' }] } }] }), { code: C.MAX_TOKENS });
  assert.throws(() => extractGeminiText({ candidates: [{ finishReason: 'SAFETY' }] }), { code: C.BLOCKED });
});

test('Claude 오류 분류·응답 추출', () => {
  const rl = classifyClaudeHttpError(429, '{"error":{"message":"rate"}}', '30');
  assert.strictEqual(rl.code, C.RATE_LIMIT);
  assert.strictEqual(rl.retryAfterMs, 30000);
  assert.strictEqual(classifyClaudeHttpError(529, '{}', null).code, C.SERVER);
  assert.strictEqual(classifyClaudeHttpError(401, '{}', null).code, C.AUTH);
  assert.strictEqual(extractClaudeText({ content: [{ type: 'thinking' }, { type: 'text', text: ' 1|a ' }] }), '1|a');
  assert.throws(() => extractClaudeText({ content: [{ type: 'thinking' }] }), { code: C.EMPTY_RESPONSE });
  assert.throws(() => extractClaudeText({ content: [{ type: 'text', text: 'x' }], stop_reason: 'max_tokens' }), { code: C.MAX_TOKENS });
});

test('유틸: 기간 파싱·비밀값 가림·태평양 자정', () => {
  assert.strictEqual(parseDurationMs('2s'), 2000);
  assert.strictEqual(parseDurationMs('bad'), undefined);
  assert.strictEqual(redactSecrets('url?key=AIzaSyABCDEFGHIJKLMNOPQRSTUV&x=1'), 'url?key=***&x=1');
  assert.strictEqual(redactSecrets('k AIzaSyABCDEFGHIJKLMNOPQRSTUVWX'), 'k AIza***');
  const now = Date.UTC(2026, 0, 15, 10, 30, 0); // PST 02:30
  assert.strictEqual(nextPacificMidnight(now), Date.UTC(2026, 0, 16, 8, 0, 0));
});

test('API 키: 공백·제로폭 제거, 비 ASCII 헤더 오류는 AUTH', () => {
  assert.strictEqual(sanitizeApiKey(' AIza​key\n'), 'AIzakey');
  assert.strictEqual(hasInvalidKeyChars('AIza키'), true);
  assert.strictEqual(hasInvalidKeyChars('AIzaSy-_0'), false);
  const headerErr = new TypeError("Failed to execute 'fetch' on 'WorkerGlobalScope': Failed to read the 'headers' property from 'RequestInit': String contains non ISO-8859-1 code point.");
  assert.strictEqual(fetchErrorCode(headerErr), C.AUTH);
  assert.strictEqual(toApiError(headerErr).code, C.AUTH);
  assert.strictEqual(fetchErrorCode(new TypeError('Failed to fetch')), C.NETWORK);
});
