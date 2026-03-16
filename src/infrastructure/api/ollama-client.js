/**
 * Ollama API 호출
 * @param {string} systemPrompt - 시스템 프롬프트
 * @param {string} userText - 사용자 입력
 * @param {string} baseUrl - Ollama 서버 URL (예: http://localhost:11434)
 * @param {string} model - 모델 ID
 * @returns {Promise<string>} 응답 텍스트
 */
export async function callOllama(systemPrompt, userText, baseUrl, model) {
  const url = `${baseUrl.replace(/\/+$/, '')}/api/chat`;

  let response;
  try {
    response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userText }
        ],
        stream: false,
        keep_alive: '30m',
        options: {
          num_ctx: 4096,
          temperature: 0,
          num_predict: 1024
        }
      })
    });
  } catch (e) {
    throw new Error('OLLAMA_NOT_RUNNING');
  }

  if (!response.ok) {
    const errBody = await response.text();
    throw new Error(`API_ERROR:${response.status}:${errBody}`);
  }

  const data = await response.json();
  return data.message.content.trim();
}

/**
 * Ollama 서버 연결 상태를 확인한다.
 * @param {string} baseUrl - Ollama 서버 URL
 * @returns {Promise<boolean>} 연결 가능 여부
 */
export async function checkOllamaConnection(baseUrl) {
  try {
    const response = await fetch(`${baseUrl.replace(/\/+$/, '')}/api/tags`, {
      signal: AbortSignal.timeout(3000)
    });
    return response.ok;
  } catch {
    return false;
  }
}
