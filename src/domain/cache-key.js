/**
 * 강의 캐시 키를 생성한다. 형식: "targetCode::course||section||lecture"
 * @param {string} targetCode - 번역 대상 언어 코드 (예: 'ko')
 * @param {string} [course] - 코스(강좌) 식별자
 * @param {string} [section] - 섹션 이름
 * @param {string} [lecture] - 강의(레슨) 이름
 * @returns {string} 캐시 키
 */
export function lectureCacheKey(targetCode, course, section, lecture) {
  return `${targetCode}::${course || ''}||${section || ''}||${lecture || ''}`;
}
