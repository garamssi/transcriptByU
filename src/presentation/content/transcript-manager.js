import { SELECTORS, LECTURE_SELECTORS, ORIGINAL_CLASS, SETTLE_DELAY_MS, CAPTION_SELECTOR, STORAGE_KEYS } from '../../domain/constants.js';
import { currentStyle } from './style-manager.js';
import { replaceCaptionText } from './caption-manager.js';
import { getVttTranslation } from './vtt-bridge.js';

let observer = null;
let panelFinderObserver = null;
let currentPanel = null;
let settleTimer = null;
let observerPaused = false;

// === 강의 컨텍스트 추출 ===
export function getLectureContext() {
  const result = { lecture: '', section: '' };
  const lectureEl = document.querySelector(LECTURE_SELECTORS.currentItem);
  if (lectureEl) result.lecture = lectureEl.textContent.trim();

  const currentLi = document.querySelector('li[aria-current="true"]');
  if (currentLi) {
    const sectionPanel = currentLi.closest(LECTURE_SELECTORS.sectionPanel);
    if (sectionPanel) {
      const titleEl = sectionPanel.querySelector(LECTURE_SELECTORS.sectionTitle);
      if (titleEl) result.section = titleEl.textContent.trim();
    }
  }
  return result;
}

// === 표시 모드 적용 ===
export function applyDisplayMode(container) {
  const cueTextSpan = container.querySelector(SELECTORS.cueText);
  if (!cueTextSpan) return;
  const parent = cueTextSpan.closest('p') || cueTextSpan.parentElement;
  const originalEl = parent.querySelector(`.${ORIGINAL_CLASS}`);
  const hasTranslation = cueTextSpan.dataset.original;

  if (!hasTranslation) return;

  if (currentStyle.displayMode === 'original') {
    cueTextSpan.textContent = cueTextSpan.dataset.original;
    if (originalEl) originalEl.style.display = 'none';
  } else if (currentStyle.displayMode === 'translation') {
    cueTextSpan.textContent = cueTextSpan.dataset.translated || cueTextSpan.dataset.original;
    if (originalEl) originalEl.style.display = 'none';
  } else {
    cueTextSpan.textContent = cueTextSpan.dataset.translated || cueTextSpan.dataset.original;
    if (originalEl) originalEl.style.display = '';
  }
}

export function applyDisplayModeAll() {
  const panel = document.querySelector(SELECTORS.panel);
  if (!panel) return;
  observerPaused = true;
  panel.querySelectorAll(SELECTORS.cueAll).forEach(cue => {
    const container = cue.closest('[class*="cue-container"]') || cue;
    applyDisplayMode(container);
  });
  observerPaused = false;
}

// === 원본 표시 span 생성/가져오기 (both 모드용) ===
function getOrCreateOriginalEl(textSpan) {
  const next = textSpan.nextElementSibling;
  if (next?.classList.contains(ORIGINAL_CLASS)) return next;

  const parent = textSpan.closest('p') || textSpan.parentElement;
  const existing = parent.querySelectorAll(`.${ORIGINAL_CLASS}`);
  if (existing.length > 1) {
    for (let i = 1; i < existing.length; i++) existing[i].remove();
  }
  if (existing.length > 0) return existing[0];

  const el = document.createElement('span');
  el.className = ORIGINAL_CLASS;
  textSpan.after(el);
  return el;
}

// === 패널의 모든 큐 수집 ===
export function collectCues(panel) {
  const cues = panel.querySelectorAll(SELECTORS.cueAll);
  const items = [];
  cues.forEach(cue => {
    const textSpan = cue.querySelector(SELECTORS.cueText);
    if (!textSpan) return;
    const text = textSpan.dataset.original || textSpan.textContent.trim();
    if (!text) return;
    const container = cue.closest('[class*="cue-container"]') || cue;
    items.push({ text, container, textSpan });
  });
  return items;
}

// === 미번역 큐만 필터링 (VTT 번역 적용 포함) ===
export function getUntranslatedCues(cueItems) {
  return cueItems.filter(({ text, textSpan, container }) => {
    if (textSpan.dataset.original) return false;
    const parent = textSpan.closest('p') || textSpan.parentElement;
    const origEl = parent.querySelector(`.${ORIGINAL_CLASS}`);
    if (origEl) return false;

    const vttTranslation = getVttTranslation(text);
    if (vttTranslation) {
      applyTranslation(textSpan, container, vttTranslation);
      return false;
    }
    return true;
  });
}

// === 번역 결과를 큐에 적용 ===
export function applyTranslation(textSpan, container, translation) {
  if (!textSpan.dataset.original) {
    textSpan.dataset.original = textSpan.textContent.trim();
  }
  textSpan.dataset.translated = translation;

  if (currentStyle.displayMode !== 'original') {
    textSpan.textContent = translation;
  }

  const originalEl = getOrCreateOriginalEl(textSpan);
  originalEl.textContent = textSpan.dataset.original;

  applyDisplayMode(container);
}

// === VTT 번역을 DOM에 적용 ===
function applyVttTranslations(panel) {
  const cueItems = collectCues(panel);
  observerPaused = true;
  const untranslated = getUntranslatedCues(cueItems);
  observerPaused = false;

  if (untranslated.length === 0) {
    const captionEl = document.querySelector(CAPTION_SELECTOR);
    if (captionEl) replaceCaptionText(captionEl);
  }
}

// === VTT 번역 완료 시 재스캔 ===
document.addEventListener('vtt-translations-ready', () => {
  if (currentPanel) scheduleTranslation(currentPanel);
});

// === 디바운스된 VTT 적용 스케줄링 ===
export function scheduleTranslation(panel) {
  clearTimeout(settleTimer);
  settleTimer = setTimeout(() => {
    applyVttTranslations(panel);
  }, SETTLE_DELAY_MS);
}

// === 패널 초기화 ===
function initPanel(panel) {
  if (currentPanel === panel && observer) return;

  if (observer) observer.disconnect();
  currentPanel = panel;

  scheduleTranslation(panel);

  observer = new MutationObserver((mutations) => {
    if (observerPaused) return;

    const hasNewCue = mutations.some(m =>
      m.type === 'childList' &&
      Array.from(m.addedNodes).some(n =>
        n.nodeType === 1 &&
        (n.matches?.('[class*="cue-container"]') ||
         n.querySelector?.('[data-purpose="cue-text"]'))
      )
    );

    if (hasNewCue) {
      scheduleTranslation(panel);
    }
  });

  observer.observe(panel, {
    childList: true,
    subtree: true
  });
}

// === 트랜스크립트 패널 등장 감시 ===
export function initPanelFinder() {
  if (panelFinderObserver) panelFinderObserver.disconnect();
  currentPanel = null;

  const existing = document.querySelector(SELECTORS.panel);
  console.log('[UdemyTranslator] initPanelFinder, panel:', existing ? 'FOUND' : 'NOT FOUND');
  if (existing) initPanel(existing);

  panelFinderObserver = new MutationObserver(() => {
    const panel = document.querySelector(SELECTORS.panel);
    if (panel) {
      initPanel(panel);
    } else if (currentPanel) {
      if (observer) observer.disconnect();
      currentPanel = null;
    }
  });

  panelFinderObserver.observe(document.body, {
    childList: true,
    subtree: true
  });
}

// === 모든 번역 제거 (원본 복원) ===
export function removeAllTranslations() {
  observerPaused = true;
  document.querySelectorAll(`${SELECTORS.cueText}[data-original]`).forEach(span => {
    span.textContent = span.dataset.original;
    delete span.dataset.original;
    delete span.dataset.translated;
  });
  document.querySelectorAll(`.${ORIGINAL_CLASS}`).forEach(el => el.remove());
  observerPaused = false;
}

// === 전체 재번역 ===
export async function retranslateAll() {
  console.log('[UdemyTranslator] retranslateAll() called');
  const panel = document.querySelector(SELECTORS.panel);
  if (!panel) return { count: 0 };

  const cueItems = collectCues(panel);
  if (cueItems.length === 0) return { count: 0 };

  const stored = await chrome.storage.local.get([STORAGE_KEYS.TARGET_LANG]);
  const lang = stored[STORAGE_KEYS.TARGET_LANG] || '한국어';
  const ctx = getLectureContext();

  await chrome.runtime.sendMessage({
    type: 'CLEAR_LECTURE_CACHE',
    lang,
    lecture: ctx.lecture,
    section: ctx.section
  });

  observerPaused = true;
  for (const { textSpan } of cueItems) {
    if (textSpan.dataset.original) {
      textSpan.textContent = textSpan.dataset.original;
      delete textSpan.dataset.original;
      delete textSpan.dataset.translated;
    }
    const parent = textSpan.closest('p') || textSpan.parentElement;
    parent.querySelectorAll(`.${ORIGINAL_CLASS}`).forEach(el => el.remove());
  }
  observerPaused = false;

  applyVttTranslations(panel);

  const translated = collectCues(panel).filter(({ textSpan }) => textSpan.dataset.original);
  return { count: translated.length };
}

// === Observer 정리 (네비게이션 시 호출) ===
export function cleanup() {
  if (observer) observer.disconnect();
  if (panelFinderObserver) panelFinderObserver.disconnect();
  currentPanel = null;
  clearTimeout(settleTimer);
}
