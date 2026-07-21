/**
 * chrome.storage.local 래퍼
 * Provider 설정을 로드하는 유틸리티
 */

/**
 * Provider 설정을 로드한다.
 * @returns {Promise<{ provider: string, apiKey: string, model: string }>}
 */
export async function getProviderConfig() {
  const stored = await chrome.storage.local.get([
    'provider',
    'claudeApiKey', 'geminiApiKey', 'claudeCodeUrl',
    'claudeModel', 'geminiModel', 'claudeCodeModel',
    // legacy: 구버전(단일 프로바이더) 설정. 아래 claude 분기에서 claude* 값이 없을 때만
    // 폴백으로 쓰인다 — 업그레이드 전 사용자 호환용이므로 제거 금지.
    'apiKey', 'model'
  ]);

  const provider = stored.provider || 'claude-code';
  let apiKey, model;

  if (provider === 'gemini') {
    apiKey = stored.geminiApiKey;
    model = stored.geminiModel || stored.model || 'gemini-3.5-flash';
  } else if (provider === 'claude-code') {
    apiKey = stored.claudeCodeUrl || 'http://localhost:3456';
    model = stored.claudeCodeModel || 'claude-sonnet-5';
  } else {
    apiKey = stored.claudeApiKey || stored.apiKey;
    model = stored.claudeModel || stored.model || 'claude-haiku-4-5-20251001';
  }

  return { provider, apiKey, model };
}
