/**
 * Gemini API 호출
 * @param {string} systemPrompt - 시스템 프롬프트
 * @param {string} userText - 사용자 입력
 * @param {string} apiKey - API 키
 * @param {string} model - 모델 ID
 * @param {number} maxTokens - 최대 토큰 수
 * @returns {Promise<string>} 응답 텍스트
 */
export async function callGemini(systemPrompt, userText, apiKey, model, maxTokens) {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;

  // 2.5 모델은 thinking이 기본 활성화 → 번역에 불필요하므로 비활성화
  const genConfig = { maxOutputTokens: maxTokens };
  if (model.includes('2.5')) {
    genConfig.thinkingConfig = { thinkingBudget: 0 };
  }

  const body = JSON.stringify({
    systemInstruction: { parts: [{ text: systemPrompt }] },
    contents: [{ role: 'user', parts: [{ text: userText }] }],
    generationConfig: genConfig
  });

  const maxRetries = 3;
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body
    });

    if (response.status === 429) {
      if (attempt >= maxRetries) throw new Error('RATE_LIMIT');
      const waitSec = Math.min(15 * (2 ** attempt), 120);
      console.log(`[Gemini] Rate limited, waiting ${waitSec}s (attempt ${attempt + 1}/${maxRetries})`);
      await new Promise(r => setTimeout(r, waitSec * 1000));
      continue;
    }

    if (!response.ok) {
      const errBody = await response.text();
      throw new Error(`API_ERROR:${response.status}:${errBody}`);
    }

    const data = await response.json();
    return data.candidates[0].content.parts[0].text.trim();
  }
}
