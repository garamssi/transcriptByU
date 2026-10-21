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

  // Flash는 thinking이 기본 MEDIUM → 자막 번역엔 불필요하므로 최저 단계로 낮춘다(비용·지연 절감).
  // 3.8 Flash는 thinking을 끌 수 없고 MINIMAL은 에러라 LOW가 최저. Flash-Lite는 기본값이 이미 MINIMAL이라 손대지 않는다.
  const genConfig = { maxOutputTokens: maxTokens };
  if (model.includes('flash') && !model.includes('flash-lite')) {
    genConfig.thinkingConfig = { thinkingLevel: 'LOW' };
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
