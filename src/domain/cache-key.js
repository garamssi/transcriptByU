/**
 * 강의 캐시 키를 생성한다.
 * 형식: "targetLang::section||lecture"
 * @param {string} targetLang - 번역 대상 언어
 * @param {string} [section] - 섹션 이름
 * @param {string} [lecture] - 강의 이름
 * @returns {string} 캐시 키
 */
export function lectureCacheKey(targetLang, section, lecture) {
  return `${targetLang}::${section || ''}||${lecture || ''}`;
}
