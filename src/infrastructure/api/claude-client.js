/**
 * Claude API 호출
 * @param {string} systemPrompt - 시스템 프롬프트
 * @param {string} userText - 사용자 입력
 * @param {string} apiKey - API 키
 * @param {string} model - 모델 ID
 * @param {number} maxTokens - 최대 토큰 수
 * @returns {Promise<string>} 응답 텍스트
 */
export async function callClaude(systemPrompt, userText, apiKey, model, maxTokens) {
  const response = await fetch('https://api.anthropic.com/v1/messages', {
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
    })
  });

  if (response.status === 429) throw new Error('RATE_LIMIT');
  if (!response.ok) {
    const errBody = await response.text();
    throw new Error(`API_ERROR:${response.status}:${errBody}`);
  }

  const data = await response.json();
  return data.content[0].text.trim();
}
