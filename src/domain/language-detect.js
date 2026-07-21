/**
 * 원본 텍스트가 이미 목표 언어로 되어 있는지 스크립트(문자 체계) 기반으로 추정한다.
 *
 * 목표 언어와 자막 언어가 같으면(예: 한국어 자막 → 한국어 번역) 번역을 건너뛰기 위한
 * 판정. 번역 API 호출을 아끼고, 같은 언어를 굳이 재작성해 자막이 어색해지는 것을 막는다.
 *
 * 지원 목표 언어: 한국어 / 日本語 / 中文 (popup 의 targetLang 옵션과 일치).
 * 그 외(미지원) 목표 언어는 항상 번역 대상으로 본다.
 */

// 목표 언어 → 기대되는 대표 스크립트 카테고리
const TARGET_SCRIPT = {
  '한국어': 'hangul',
  '日本語': 'japanese',
  '中文': 'chinese',
};

const RE_HANGUL = /\p{Script=Hangul}/u;
const RE_KANA = /\p{Script=Hiragana}|\p{Script=Katakana}/u;
const RE_HAN = /\p{Script=Han}/u;
const RE_LATIN = /[A-Za-z]/;

/**
 * 텍스트의 지배적 문자 체계를 반환한다.
 * 숫자·기호·공백은 분모에서 제외하고, '글자'만으로 비율을 계산한다.
 * @param {string} text
 * @returns {'hangul'|'japanese'|'chinese'|'latin'|'mixed'|'none'}
 */
export function dominantScript(text) {
  let hangul = 0, kana = 0, han = 0, latin = 0, total = 0;
  for (const ch of text) {
    if (RE_HANGUL.test(ch)) { hangul++; total++; }
    else if (RE_KANA.test(ch)) { kana++; total++; }
    else if (RE_HAN.test(ch)) { han++; total++; }
    else if (RE_LATIN.test(ch)) { latin++; total++; }
    // 그 외(숫자/기호/공백/이모지 등)는 비율 계산에서 제외
  }

  if (total === 0) return 'none';
  // 카나가 하나라도 있으면 일본어로 확정 (한자만으로는 중국어와 구분 불가)
  if (kana > 0) return 'japanese';
  if (hangul / total >= 0.5) return 'hangul';
  if (han / total >= 0.5) return 'chinese';
  if (latin / total >= 0.5) return 'latin';
  return 'mixed';
}

/**
 * 텍스트가 이미 목표 언어로 되어 있는지 여부.
 * @param {string} text - 원본(자막) 텍스트
 * @param {string} targetLang - 번역 목표 언어 (예: '한국어')
 * @returns {boolean} 같은 언어라 번역이 불필요하면 true
 */
export function isAlreadyTargetLanguage(text, targetLang) {
  if (!text) return false;
  const expected = TARGET_SCRIPT[targetLang];
  if (!expected) return false; // 미지원 목표 언어 → 항상 번역
  return dominantScript(text) === expected;
}
