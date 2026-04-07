import { SELECTORS, CAPTION_SELECTOR } from '../../domain/constants.js';
import { currentStyle } from './style-manager.js';
import { getVttTranslation } from './vtt-bridge.js';

let captionObserver = null;
let captionFinderObserver = null;
let currentCaptionEl = null;

// === 번역 맵 캐시: applyTranslation() 시점에 업데이트, DOM 스캔 불필요 ===
const translationMapCache = new Map();

export function updateCaptionCache(original, translated) {
  translationMapCache.set(original, translated);
}

export function clearCaptionCache() {
  translationMapCache.clear();
}

// === 캡션 텍스트를 번역으로 치환 ===
export function replaceCaptionText(captionEl) {
  if (!captionEl) return;
  if (currentStyle.displayMode === 'original') return;

  const subSpan = captionEl.querySelector('.caption-original');
  const originalText = subSpan
    ? captionEl.childNodes[0]?.textContent?.trim() || captionEl.textContent.trim()
    : captionEl.textContent.trim();
  if (!originalText) return;

  const translated = translationMapCache.get(originalText) || getVttTranslation(originalText);
  if (!translated) return;

  // observer를 일시 중지하여 자기 트리거 루프 방지
  if (captionObserver) captionObserver.disconnect();

  if (currentStyle.displayMode === 'both') {
    captionEl.innerHTML = '';
    captionEl.appendChild(document.createTextNode(translated));
    const origLine = document.createElement('div');
    origLine.className = 'caption-original';
    origLine.textContent = originalText;
    captionEl.appendChild(origLine);
  } else {
    captionEl.textContent = translated;
  }

  // observer 재연결
  if (captionObserver && currentCaptionEl) {
    captionObserver.observe(currentCaptionEl, {
      childList: true, characterData: true, subtree: true
    });
  }
}

// === 캡션 요소에 MutationObserver 부착 ===
function observeCaption(captionEl) {
  if (currentCaptionEl === captionEl && captionObserver) return;

  if (captionObserver) captionObserver.disconnect();
  currentCaptionEl = captionEl;

  replaceCaptionText(captionEl);

  captionObserver = new MutationObserver(() => {
    replaceCaptionText(captionEl);
  });

  captionObserver.observe(captionEl, {
    childList: true,
    characterData: true,
    subtree: true
  });
}

// === 캡션 요소 동적 감시 ===
export function initCaptionFinder() {
  if (captionFinderObserver) captionFinderObserver.disconnect();
  currentCaptionEl = null;

  const existing = document.querySelector(CAPTION_SELECTOR);
  if (existing) observeCaption(existing);

  captionFinderObserver = new MutationObserver((mutations) => {
    const relevant = mutations.some(m =>
      Array.from(m.addedNodes).some(n =>
        n.nodeType === 1 &&
        (n.matches?.(CAPTION_SELECTOR) || n.querySelector?.(CAPTION_SELECTOR))
      )
    );
    if (!relevant) return;

    const captionEl = document.querySelector(CAPTION_SELECTOR);
    if (captionEl) observeCaption(captionEl);
  });

  captionFinderObserver.observe(document.body, {
    childList: true,
    subtree: true
  });
}

// === Observer 정리 (네비게이션 시 호출) ===
export function cleanup() {
  if (captionObserver) captionObserver.disconnect();
  if (captionFinderObserver) captionFinderObserver.disconnect();
  currentCaptionEl = null;
}
