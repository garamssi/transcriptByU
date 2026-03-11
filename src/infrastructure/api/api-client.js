import { callClaude } from './claude-client.js';
import { callGemini } from './gemini-client.js';

/**
 * Provider에 따라 적절한 API를 호출한다.
 * @param {string} systemPrompt - 시스템 프롬프트
 * @param {string} userText - 사용자 입력
 * @param {string} provider - 'claude' | 'gemini'
 * @param {string} apiKey - API 키
 * @param {string} model - 모델 ID
 * @param {number} maxTokens - 최대 토큰 수
 * @returns {Promise<string>} 응답 텍스트
 */
export function callApi(systemPrompt, userText, provider, apiKey, model, maxTokens) {
  if (provider === 'gemini') {
    return callGemini(systemPrompt, userText, apiKey, model, maxTokens);
  }
  return callClaude(systemPrompt, userText, apiKey, model, maxTokens);
}
