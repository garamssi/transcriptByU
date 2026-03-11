/**
 * HEX 색상 + opacity를 rgba 문자열로 변환한다.
 * @param {string} hex - HEX 색상 (예: '#1e293b')
 * @param {number} opacity - 불투명도 (0~100)
 * @returns {string} rgba 문자열
 */
export function hexToRgba(hex, opacity) {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r}, ${g}, ${b}, ${opacity / 100})`;
}

/**
 * HTML 특수문자를 이스케이프한다.
 * @param {string} str - 입력 문자열
 * @returns {string} 이스케이프된 문자열
 */
export function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}
