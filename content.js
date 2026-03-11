import { SELECTORS, STYLE_CHANGE_KEYS, STORAGE_KEYS } from './src/domain/constants.js';
import { loadStyle, updateDynamicStyles } from './src/presentation/content/style-manager.js';
import {
  initPanelFinder, scheduleTranslation, removeAllTranslations,
  applyDisplayModeAll, retranslateAll, getLectureContext,
} from './src/presentation/content/transcript-manager.js';
import { initCaptionFinder } from './src/presentation/content/caption-manager.js';
import { setupNavigationHandler } from './src/presentation/content/navigation-handler.js';

// === storage 변경 감지 → 즉시 스타일 반영 ===
chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== 'local') return;

  if (changes[STORAGE_KEYS.ENABLED]) {
    if (changes[STORAGE_KEYS.ENABLED].newValue === false) {
      removeAllTranslations();
      return;
    }
    const panel = document.querySelector(SELECTORS.panel);
    if (panel) scheduleTranslation(panel);
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
loadStyle().then(() => {
  updateDynamicStyles();
  initPanelFinder();
  initCaptionFinder();
});
