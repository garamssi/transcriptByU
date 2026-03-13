/**
 * 배치 번역 API 응답을 파싱한다.
 * "N|translated text" 형식의 줄들을 Map<number, string>으로 변환한다.
 * N| 형식이 없는 경우 줄 순서로 fallback 매칭한다.
 * @param {string} responseText - API 응답 텍스트
 * @param {number} [expectedCount] - 예상 줄 수 (fallback 매칭에 사용)
 * @returns {Map<number, string>} 번호 → 번역 텍스트 맵
 */
export function parseBatchResponse(responseText, expectedCount) {
  // 마크다운 코드블록 제거 (```...```)
  let cleaned = responseText.replace(/```[\s\S]*?```/g, (match) => {
    return match.replace(/^```\w*\n?/, '').replace(/\n?```$/, '');
  });
  cleaned = cleaned.replace(/^```\w*$/gm, '');

  const lines = cleaned.split('\n').filter(l => l.trim());
  const result = new Map();

  // 1차: N|text 형식으로 파싱
  for (const line of lines) {
    const trimmed = line.trim();
    const pipeIdx = trimmed.indexOf('|');
    if (pipeIdx === -1) continue;
    const num = parseInt(trimmed.slice(0, pipeIdx).trim());
    const text = trimmed.slice(pipeIdx + 1).trim();
    if (!isNaN(num) && num > 0 && text) {
      result.set(num, text);
    }
  }

  // 2차 fallback: N| 형식이 하나도 없지만 줄 수가 맞으면 순서대로 매칭
  if (result.size === 0 && expectedCount && lines.length === expectedCount) {
    for (let i = 0; i < lines.length; i++) {
      const text = lines[i].trim();
      if (text) result.set(i + 1, text);
    }
  }

  return result;
}
