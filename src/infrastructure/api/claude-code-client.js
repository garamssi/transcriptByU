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
    });
  } catch (e) {
    throw new Error('CLAUDE_CODE_NOT_RUNNING');
  }

  if (!response.ok) {
    const errBody = await response.text();
    throw new Error(`API_ERROR:${response.status}:${errBody}`);
  }

  const data = await response.json();
  return data.result.trim();
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
