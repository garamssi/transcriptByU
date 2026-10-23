import { ApiError, ERROR_CODES, classifyGeminiHttpError, extractGeminiText } from '../../domain/api-error.js';
import { API_REQUEST_TIMEOUT_MS } from '../../domain/constants.js';

/**
 * Gemini API 호출 (1회). 재시도·대기는 RequestScheduler 가 담당한다.
 * @param {string} systemPrompt - 시스템 프롬프트
 * @param {string} userText - 사용자 입력
 * @param {string} apiKey - API 키
 * @param {string} model - 모델 ID
 * @param {number} maxTokens - 최대 토큰 수
 * @returns {Promise<string>} 응답 텍스트
 * @throws {ApiError}
 */
export async function callGemini(systemPrompt, userText, apiKey, model, maxTokens) {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`;

  // Flash는 thinking이 기본 MEDIUM → 자막 번역엔 불필요하므로 최저 단계로 낮춘다(비용·지연 절감).
  // 3.8 Flash는 thinking을 끌 수 없고 MINIMAL은 에러라 LOW가 최저. Flash-Lite는 기본값이 이미 MINIMAL이라 손대지 않는다.
  const genConfig = { maxOutputTokens: maxTokens };
  if (model.includes('flash') && !model.includes('flash-lite')) {
    genConfig.thinkingConfig = { thinkingLevel: 'LOW' };
  }

  let response;
  try {
    response = await fetch(url, {
      method: 'POST',
      // 키를 URL 쿼리 대신 헤더로 보내 오류 메시지·로그에 키가 섞이지 않게 한다.
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': apiKey },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: systemPrompt }] },
        contents: [{ role: 'user', parts: [{ text: userText }] }],
        generationConfig: genConfig
      }),
      signal: AbortSignal.timeout(API_REQUEST_TIMEOUT_MS),
    });
  } catch (e) {
    const code = e?.name === 'TimeoutError' || e?.name === 'AbortError' ? ERROR_CODES.TIMEOUT : ERROR_CODES.NETWORK;
    throw new ApiError(code, { detail: e?.message });
  }

  if (!response.ok) {
    throw classifyGeminiHttpError(response.status, await response.text());
  }

  return extractGeminiText(await response.json());
}
