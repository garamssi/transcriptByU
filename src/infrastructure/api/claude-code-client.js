import { ApiError, ERROR_CODES, redactSecrets, classifyClaudeCodeHttpError } from '../../domain/api-error.js';
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
    // 어느 주소로 보내다 실패했는지 로그에 남긴다(프록시 URL 설정 오류와 프록시 중단을 구분).
    const detail = `POST ${url} — ${e?.name || 'Error'}: ${e?.message || e}`;
    if (e?.name === 'TimeoutError' || e?.name === 'AbortError') {
      throw new ApiError(ERROR_CODES.TIMEOUT, { detail });
    }
    throw new ApiError(ERROR_CODES.NOT_RUNNING, { detail });
  }

  if (!response.ok) {
    const body = redactSecrets(await response.text());
    const err = classifyClaudeCodeHttpError(response.status, body);
    err.detail = `POST ${url} — ${body}`.slice(0, 500);
    throw err;
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
