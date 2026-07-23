import { SELECTORS, STYLE_CHANGE_KEYS, STORAGE_KEYS } from './src/domain/constants.js';
import { loadStyle, updateDynamicStyles } from './src/presentation/content/style-manager.js';
import {
  initPanelFinder, scheduleTranslation, removeAllTranslations,
  applyDisplayModeAll, retranslateAll, getLectureContext,
} from './src/presentation/content/transcript-manager.js';
import { initCaptionFinder } from './src/presentation/content/caption-manager.js';
import { setupNavigationHandler } from './src/presentation/content/navigation-handler.js';
import { initVttBridge, setActiveLang } from './src/presentation/content/vtt-bridge.js';
import { setBadgeEnabled, setBadgeLang } from './src/presentation/content/badge-manager.js';
import { resolveCode } from './src/domain/languages.js';
import en from './locales/en.json';
import ko from './locales/ko.json';
import ja from './locales/ja.json';
import { setCatalogs, setLocale } from './src/shared/i18n.js';

setCatalogs({ en, ko, ja });

// === storage 변경 감지 → 즉시 스타일 반영 ===
chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== 'local') return;

  if (changes[STORAGE_KEYS.ENABLED]) {
    setBadgeEnabled(changes[STORAGE_KEYS.ENABLED].newValue);
    if (changes[STORAGE_KEYS.ENABLED].newValue === false) {
      removeAllTranslations();
      return;
    }
    const panel = document.querySelector(SELECTORS.panel);
    if (panel) scheduleTranslation(panel);
  }

  if (changes[STORAGE_KEYS.TARGET_LANG]) {
    const code = resolveCode(changes[STORAGE_KEYS.TARGET_LANG].newValue);
    setActiveLang(code);
    setBadgeLang(code);
  }

  if (changes[STORAGE_KEYS.UI_LANG]) {
    setLocale(changes[STORAGE_KEYS.UI_LANG].newValue);
    setBadgeLang(); // 대상언어 유지, UI 로케일만 반영해 재렌더
  }

  const hasStyleChange = Object.keys(changes).some(k => STYLE_CHANGE_KEYS.has(k));
  if (hasStyleChange) {
    loadStyle().then(() => {
      updateDynamicStyles();
      applyDisplayModeAll();
    });
  }
});

// === 팝업 메시지 수신 ===
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'RETRANSLATE_ALL') {
    retranslateAll().then(sendResponse);
    return true;
  }

  if (message.type === 'GET_LECTURE_INFO') {
    sendResponse(getLectureContext());
  }
});

// === SPA 네비게이션 대응 ===
setupNavigationHandler();

// === 시작 ===
console.log('[UdemyTranslator] content script loaded');

// VTT 브릿지는 스타일·스토리지와 무관하므로 가장 먼저 등록한다.
// 리스너를 최대한 이르게 올려 인터셉터 메시지 유실을 줄이고, BRIDGE_READY 로
// 이미 버퍼된 VTT 를 즉시 재전송받는다.
initVttBridge();

loadStyle().then(async () => {
  console.log('[UdemyTranslator] style loaded, initializing...');
  updateDynamicStyles();
  const s = await chrome.storage.local.get([STORAGE_KEYS.ENABLED, STORAGE_KEYS.TARGET_LANG, STORAGE_KEYS.UI_LANG]);
  setLocale(s[STORAGE_KEYS.UI_LANG]); // 배지 문구 생성보다 먼저 (값 없으면 'en')
  setActiveLang(resolveCode(s[STORAGE_KEYS.TARGET_LANG]));
  setBadgeLang(resolveCode(s[STORAGE_KEYS.TARGET_LANG]));
  setBadgeEnabled(s[STORAGE_KEYS.ENABLED]);
  initPanelFinder();
  initCaptionFinder();
}).catch(err => {
  console.error('[UdemyTranslator] loadStyle failed:', err);
});
