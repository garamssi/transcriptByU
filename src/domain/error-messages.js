/**
 * 에러 코드를 사용자 표시용 메시지로 변환한다.
 * @param {string|undefined} error - 에러 코드
 * @returns {string} 사용자 표시 메시지
 */
export function errorToMessage(error) {
  if (!error) return '⚠ 번역 실패';
  if (error === 'OLLAMA_NOT_RUNNING') return '⚠ Ollama가 실행되지 않음. 터미널에서 "ollama serve"를 실행하세요';
  if (error === 'RATE_LIMIT') return '⚠ API 할당량 초과';
  if (error === 'NO_API_KEY') return '⚠ API 키를 설정하세요';
  if (error === 'DISABLED') return '';
  if (error === 'PARSE_ERROR') return '⚠ 응답 파싱 실패';
  if (error.startsWith('API_ERROR:')) {
    const parts = error.split(':');
    return `⚠ API 오류 (${parts[1]})`;
  }
  return `⚠ ${error}`;
}
