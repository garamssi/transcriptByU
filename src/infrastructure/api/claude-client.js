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
  // 5.x 모델은 thinking이 기본으로 켜져 있어 content 앞에 thinking 블록이 올 수 있다 → text 블록을 찾는다.
  return data.content.find(b => b.type === 'text').text.trim();
}
