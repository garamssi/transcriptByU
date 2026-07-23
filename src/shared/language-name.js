/**
 * 목표 언어 코드를 현재 UI 로케일로 표기한다 (배지 등 표시용).
 * 도메인이 아니라 표시(presentation) 관심사이므로 shared 에 둔다.
 * @param {string} targetCode - 표시할 언어 코드 (예: 'ko')
 * @param {string} uiCode - 표기 기준 UI 로케일 코드 (예: 'ja')
 * @returns {string} 지역화된 언어명, 실패 시 targetCode 그대로
 */
export function languageName(targetCode, uiCode) {
  try {
    return new Intl.DisplayNames([uiCode], { type: 'language' }).of(targetCode) || targetCode;
  } catch {
    return targetCode;
  }
}
