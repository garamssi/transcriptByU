/**
 * HTML 엔티티를 브라우저 내장 DOM 파서로 디코딩한다.
 */
const _decoder = document.createElement('textarea');
function decodeHtmlEntities(str) {
  _decoder.innerHTML = str;
  return _decoder.value;
}

/**
 * WebVTT 텍스트를 파싱하여 큐 배열을 반환한다.
 * @param {string} vttText - WebVTT 원문
 * @returns {Array<{ startTime: string, endTime: string, text: string }>}
 */
export function parseVtt(vttText) {
  const cleaned = vttText.replace(/^\uFEFF/, '');
  const blocks = cleaned.split(/\n\s*\n/).filter(b => b.trim());
  const cues = [];

  for (const block of blocks) {
    const lines = block.trim().split('\n');

    let timestampIdx = -1;
    for (let i = 0; i < lines.length; i++) {
      if (lines[i].includes('-->')) {
        timestampIdx = i;
        break;
      }
    }
    if (timestampIdx === -1) continue;

    const timeParts = lines[timestampIdx].split('-->');
    if (timeParts.length < 2) continue;

    const startTime = timeParts[0].trim();
    const endTime = timeParts[1].trim().split(/\s/)[0];

    const textLines = lines.slice(timestampIdx + 1);
    const raw = textLines
      .join(' ')
      .replace(/<[^>]+>/g, '')
      .replace(/\s+/g, ' ')
      .trim();

    const text = decodeHtmlEntities(raw);

    if (text) {
      cues.push({ startTime, endTime, text });
    }
  }

  return cues;
}
