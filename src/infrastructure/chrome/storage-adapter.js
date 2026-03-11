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
    'provider', 'claudeApiKey', 'geminiApiKey', 'apiKey', 'model'
  ]);

  const provider = stored.provider || 'gemini';
  let apiKey, model;

  if (provider === 'gemini') {
    apiKey = stored.geminiApiKey;
    model = (stored.model && stored.model.startsWith('gemini')) ? stored.model : 'gemini-2.5-flash';
  } else {
    apiKey = stored.claudeApiKey || stored.apiKey;
    model = (stored.model && stored.model.startsWith('claude')) ? stored.model : 'claude-haiku-4-5-20251001';
  }

  return { provider, apiKey, model };
}
