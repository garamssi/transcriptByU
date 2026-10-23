import { ApiError, ERROR_CODES, redactSecrets } from '../../domain/api-error.js';
import { CLAUDE_CODE_TIMEOUT_MS } from '../../domain/constants.js';

/**
 * Claude Code 프록시 서버 API 호출
 * @param {string} systemPrompt - 시스템 프롬프트
 * @param {string} userText - 사용자 입력
 * @param {string} baseUrl - 프록시 서버 URL (예: http://localhost:3456)
 * @returns {Promise<string>} 응답 텍스트
 */
export async function callClaudeCode(systemPrompt, userText, baseUrl, model) {
  const url = `${baseUrl.replace(/\/+$/, '')}/translate`;

  let response;
  try {
    response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ systemPrompt, userText, model }),
      signal: AbortSignal.timeout(CLAUDE_CODE_TIMEOUT_MS),
    });
  } catch (e) {
    if (e?.name === 'TimeoutError' || e?.name === 'AbortError') {
      throw new ApiError(ERROR_CODES.TIMEOUT, { detail: e.message });
    }
    throw new ApiError(ERROR_CODES.NOT_RUNNING, { detail: e?.message });
  }

  if (!response.ok) {
    const detail = redactSecrets(await response.text()).slice(0, 500);
    const code = response.status >= 500 ? ERROR_CODES.SERVER : ERROR_CODES.BAD_REQUEST;
    throw new ApiError(code, { status: response.status, detail });
  }

  const data = await response.json();
  const text = typeof data?.result === 'string' ? data.result.trim() : '';
  if (!text) throw new ApiError(ERROR_CODES.EMPTY_RESPONSE, { detail: 'empty result' });
  return text;
}

/**
 * Claude Code 프록시 서버 연결 상태를 확인한다.
 * @param {string} baseUrl - 프록시 서버 URL
 * @returns {Promise<boolean>} 연결 가능 여부
 */
export async function checkClaudeCodeConnection(baseUrl) {
  try {
    const response = await fetch(`${baseUrl.replace(/\/+$/, '')}/health`, {
      signal: AbortSignal.timeout(3000),
    });
    return response.ok;
  } catch {
    return false;
  }
}
