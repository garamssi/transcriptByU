import { ApiError, fetchErrorCode, classifyClaudeHttpError, extractClaudeText } from '../../domain/api-error.js';
import { API_REQUEST_TIMEOUT_MS } from '../../domain/constants.js';

/**
 * Claude API 호출 (1회). 재시도·대기는 RequestScheduler 가 담당한다.
 * @param {string} systemPrompt - 시스템 프롬프트
 * @param {string} userText - 사용자 입력
 * @param {string} apiKey - API 키
 * @param {string} model - 모델 ID
 * @param {number} maxTokens - 최대 토큰 수
 * @returns {Promise<string>} 응답 텍스트
 * @throws {ApiError}
 */
export async function callClaude(systemPrompt, userText, apiKey, model, maxTokens) {
  let response;
  try {
    response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
        'anthropic-dangerous-direct-browser-access': 'true'
      },
      body: JSON.stringify({
        model,
        max_tokens: maxTokens,
        system: systemPrompt,
        messages: [{ role: 'user', content: userText }]
      }),
      signal: AbortSignal.timeout(API_REQUEST_TIMEOUT_MS),
    });
  } catch (e) {
    throw new ApiError(fetchErrorCode(e), { detail: e?.message });
  }

  if (!response.ok) {
    throw classifyClaudeHttpError(response.status, await response.text(), response.headers.get('retry-after'));
  }

  // 5.x 모델은 thinking이 기본으로 켜져 있어 content 앞에 thinking 블록이 올 수 있다 → text 블록만 모은다.
  return extractClaudeText(await response.json());
}
