/**
 * 배치 번역 API 응답을 파싱한다.
 * "N|translated text" 형식의 줄들을 Map<number, string>으로 변환한다.
 * @param {string} responseText - API 응답 텍스트
 * @returns {Map<number, string>} 번호 → 번역 텍스트 맵
 */
export function parseBatchResponse(responseText) {
  const lines = responseText.split('\n').filter(l => l.trim());
  const result = new Map();

  for (const line of lines) {
    const pipeIdx = line.indexOf('|');
    if (pipeIdx === -1) continue;
    const num = parseInt(line.slice(0, pipeIdx).trim());
    const text = line.slice(pipeIdx + 1).trim();
    if (!isNaN(num) && text) {
      result.set(num, text);
    }
  }

  return result;
}
