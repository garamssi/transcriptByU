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
    'claudeApiKey', 'geminiApiKey', 'ollamaUrl', 'claudeCodeUrl',
    'claudeModel', 'geminiModel', 'ollamaModel', 'claudeCodeModel',
    'apiKey', 'model' // legacy
  ]);

  const provider = stored.provider || 'claude-code';
  let apiKey, model;

  if (provider === 'gemini') {
    apiKey = stored.geminiApiKey;
    model = stored.geminiModel || stored.model || 'gemini-2.5-flash';
  } else if (provider === 'ollama') {
    apiKey = stored.ollamaUrl || 'http://localhost:11434';
    model = stored.ollamaModel || 'exaone3.5:7.8b';
  } else if (provider === 'claude-code') {
    apiKey = stored.claudeCodeUrl || 'http://localhost:3456';
    model = stored.claudeCodeModel || 'claude-sonnet-4-6';
  } else {
    apiKey = stored.claudeApiKey || stored.apiKey;
    model = stored.claudeModel || stored.model || 'claude-haiku-4-5-20251001';
  }

  return { provider, apiKey, model };
}
