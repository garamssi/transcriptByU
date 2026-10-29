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
        // 시스템 프롬프트(규칙 + 강의 전체 대본)는 같은 강의의 청크 요청마다 동일하다 →
        // 프롬프트 캐시(5분)로 두 번째 청크부터 입력을 캐시 읽기(약 0.1배 단가)로 처리한다.
        system: [{ type: 'text', text: systemPrompt, cache_control: { type: 'ephemeral' } }],
        messages: [{ role: 'user', content: userText }],
        // 5.5 모델은 thinking 이 기본으로 켜져 있다. 자막 번역엔 깊은 추론이 필요 없어 effort 를
        // 낮춰 지연·비용을 줄인다(thinking 자체는 5.5 에서 끌 수 없음).
        output_config: { effort: 'low' },
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
