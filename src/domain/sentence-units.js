/**
 * 문장 단위 번역 (순수 함수: DOM·chrome API 없음).
 *
 * 자막 큐는 문장을 짧게 끊은 조각이라, 줄마다 번역하면 어순이 다른 언어(영→한)에서
 * 말이 앞뒤 줄로 밀린다. 그래서 큐를 문장(번역 단위)으로 묶어 통째로 번역하고,
 * 영상에서 각 큐가 보일 때는 그 큐가 속한 문장의 번역을 보여 준다.
 * 큐가 바뀌는 시점(= 영상 시간)은 그대로라, 문장이 시작되는 큐부터 그 문장 번역이 뜬다.
 */

// 한 번역 단위가 덮는 최대 큐 수·글자 수. 이보다 긴 문장은 큐 경계에서 나눈다
// (긴 문장 번역이 말보다 너무 앞서 뜨지 않게 — 3큐 ≈ 6~9초).
export const MAX_UNIT_CUES = 3;
export const MAX_UNIT_CHARS = 200;

const ABBREVIATIONS = new Set(['mr', 'mrs', 'ms', 'dr', 'vs', 'etc', 'e.g', 'i.e', 'jr', 'sr']);
// 숫자가 이어질 때만 약어("No. 5", "Fig. 3") — 대답 "No." 는 문장 끝이다.
const NUMBER_ABBREVIATIONS = new Set(['no', 'fig', 'st', 'vol', 'p']);

/** 문장 끝 위치(끝 문자 다음 인덱스)들. 약어·소수점·다음 글자가 소문자인 경우는 끝으로 보지 않는다. */
function sentenceEnds(text) {
  const ends = [];
  const re = /[.?!]+["')\]]*(?=\s|$)/g;
  let m;
  while ((m = re.exec(text))) {
    const end = m.index + m[0].length;
    const before = text.slice(0, m.index).match(/([A-Za-z.]+)$/)?.[1]?.toLowerCase();
    const next = text.slice(end).match(/^\s+(\S)/)?.[1];
    if (m[0][0] === '.' && before && ABBREVIATIONS.has(before)) continue;
    if (m[0][0] === '.' && before && NUMBER_ABBREVIATIONS.has(before) && next && /\d/.test(next)) continue;
    if (next && /[a-z]/.test(next)) continue; // "e.g. this" 처럼 소문자로 이어지면 같은 문장
    ends.push(end);
  }
  return ends;
}

/**
 * 큐 목록(순서대로)을 번역 단위로 묶는다.
 * @param {string[]} lines - 큐 원문(공백 정규화된 상태)
 * @returns {{ units: string[], cueUnits: number[][], unitCues: number[][] }}
 *   units[u]: 번역 단위 원문, cueUnits[i]: 큐 i 가 보여 줄 단위들(순서대로),
 *   unitCues[u]: 단위 u 가 표시되는 큐들
 */
export function buildSentenceUnits(lines) {
  // 1) 큐를 이어 붙인 전체 텍스트와 큐별 위치
  const starts = [];
  let text = '';
  for (const line of lines) {
    if (text) text += ' ';
    starts.push(text.length);
    text += line;
  }
  const cueSpan = i => [starts[i], starts[i] + lines[i].length];

  // 2) 문장 구간
  const sentences = [];
  let s = 0;
  for (const e of [...sentenceEnds(text), text.length]) {
    const start = text.slice(s, e).search(/\S/);
    if (start !== -1 && e > s) sentences.push([s + start, e]);
    s = e;
  }

  // 3) 큐마다 가장 많은 글자를 차지한 문장에 배정한다. 어느 큐에서도 다수가 아닌 짧은 문장은
  //    가장 많이 걸친 큐에 함께 붙인다(그 큐는 두 문장을 함께 보여 준다).
  const overlap = (a, b) => Math.max(0, Math.min(a[1], b[1]) - Math.max(a[0], b[0]));
  const sentCues = sentences.map(() => []);
  const cueOwner = lines.map((_, i) => {
    let best = -1, bestLen = 0;
    sentences.forEach((sent, k) => {
      const len = overlap(cueSpan(i), sent);
      if (len > bestLen) { best = k; bestLen = len; }
    });
    return best;
  });
  cueOwner.forEach((k, i) => { if (k !== -1) sentCues[k].push(i); });
  sentences.forEach((sent, k) => {
    if (sentCues[k].length > 0) return;
    let best = -1, bestLen = 0;
    lines.forEach((_, i) => {
      const len = overlap(cueSpan(i), sent);
      if (len > bestLen) { best = i; bestLen = len; }
    });
    if (best !== -1) sentCues[k].push(best);
  });

  // 4) 너무 긴 문장은 큐 경계에서 MAX_UNIT_CUES 개 이하로 고르게 나눈다
  const units = [];
  const unitCues = [];
  sentences.forEach((sent, k) => {
    const cues = sentCues[k];
    if (cues.length === 0) return;
    const len = sent[1] - sent[0];
    const groups = Math.max(Math.ceil(cues.length / MAX_UNIT_CUES), cues.length > 1 ? Math.ceil(len / MAX_UNIT_CHARS) : 1);
    const per = Math.ceil(cues.length / Math.min(groups, cues.length));
    for (let g = 0; g < cues.length; g += per) {
      const part = cues.slice(g, g + per);
      // 첫 조각은 문장 시작부터, 마지막 조각은 문장 끝까지(다른 문장의 큐에 걸친 앞뒤 꼬리 포함)
      const from = g === 0 ? sent[0] : Math.max(sent[0], cueSpan(part[0])[0]);
      const to = g + per >= cues.length ? sent[1] : Math.min(sent[1], cueSpan(part[part.length - 1])[1]);
      units.push(text.slice(from, to).trim());
      unitCues.push(part);
    }
  });

  const cueUnits = lines.map(() => []);
  unitCues.forEach((cues, u) => cues.forEach(i => cueUnits[i].push(u)));
  return { units, cueUnits, unitCues };
}
