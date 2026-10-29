import { MODELS } from '../../domain/constants.js';
import { sanitizeApiKey } from '../../domain/api-error.js';

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
    apiKey = sanitizeApiKey(stored.geminiApiKey);
    model = stored.geminiModel || stored.model || 'gemini-3.8-flash';
  } else if (provider === 'claude-code') {
    apiKey = stored.claudeCodeUrl || 'http://localhost:3456';
    model = stored.claudeCodeModel || 'claude-sonnet-5-5';
  } else {
    // 저장 시 검사가 생기기 전에 저장된 키에도 공백·제로폭 문자가 섞여 있을 수 있어 읽을 때도 정리한다.
    apiKey = sanitizeApiKey(stored.claudeApiKey || stored.apiKey);
    model = stored.claudeModel || stored.model || 'claude-haiku-5-5';
  }

  // 목록에서 사라진 구버전 모델이 저장돼 있으면 첫 옵션으로(팝업 settings-controller의 정규화와 동일).
  // 팝업을 다시 열지 않은 사용자도 폐기된 ID나 thinking 설정이 맞지 않는 구세대 모델로 요청하지 않게 한다.
  const models = MODELS[provider];
  if (models && !models.some(m => m.value === model)) model = models[0].value;

  return { provider, apiKey, model };
}

/**
 * 번역 게이트 설정을 로드한다.
 * @returns {Promise<{ enabled: boolean }>}
 */
export async function getSettings() {
  const s = await chrome.storage.local.get(['enabled']);
  return { enabled: s.enabled !== false };
}
