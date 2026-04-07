import { cleanup as cleanupTranscript, initPanelFinder } from './transcript-manager.js';
import { cleanup as cleanupCaption, initCaptionFinder } from './caption-manager.js';
import { clearVttStore } from './vtt-bridge.js';

/**
 * SPA 네비게이션 대응: Observer 해제 후 재초기화
 */
function onNavigate() {
  clearVttStore();
  cleanupTranscript();
  cleanupCaption();
  setTimeout(() => {
    initPanelFinder();
    initCaptionFinder();
  }, 1000);
}

/**
 * SPA 네비게이션 이벤트 리스너를 등록한다.
 */
export function setupNavigationHandler() {
  if (typeof navigation !== 'undefined') {
    navigation.addEventListener('navigate', onNavigate);
  } else {
    window.addEventListener('popstate', onNavigate);
    window.addEventListener('hashchange', onNavigate);

    const origPushState = history.pushState.bind(history);
    const origReplaceState = history.replaceState.bind(history);
    history.pushState = function (...args) {
      origPushState(...args);
      onNavigate();
    };
    history.replaceState = function (...args) {
      origReplaceState(...args);
      onNavigate();
    };
  }
}
