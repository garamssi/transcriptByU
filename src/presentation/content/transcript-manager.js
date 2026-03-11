import { SELECTORS, LECTURE_SELECTORS, ORIGINAL_CLASS, SETTLE_DELAY_MS, CAPTION_SELECTOR, STORAGE_KEYS } from '../../domain/constants.js';
import { errorToMessage } from '../../domain/error-messages.js';
import { currentStyle } from './style-manager.js';
import { replaceCaptionText } from './caption-manager.js';

let observer = null;
let panelFinderObserver = null;
let currentPanel = null;
let isBatchTranslating = false;
let settleTimer = null;
let observerPaused = false;

export function getObserverPaused() { return observerPaused; }
export function setObserverPaused(val) { observerPaused = val; }

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

// === 미번역 큐만 필터링 ===
export function getUntranslatedCues(cueItems) {
  return cueItems.filter(({ textSpan }) => {
    if (textSpan.dataset.original) return false;
    const parent = textSpan.closest('p') || textSpan.parentElement;
    const origEl = parent.querySelector(`.${ORIGINAL_CLASS}`);
    if (origEl) return false;
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
  originalEl.classList.remove('loading', 'error');

  applyDisplayMode(container);
}

export function applyLoading(textSpan, container, msg) {
  const originalEl = getOrCreateOriginalEl(textSpan);
  originalEl.textContent = msg;
  originalEl.classList.add('loading');
  originalEl.classList.remove('error');
}

export function applyError(textSpan, container, errorMsg) {
  const originalEl = getOrCreateOriginalEl(textSpan);
  originalEl.textContent = errorMsg;
  originalEl.classList.remove('loading');
  originalEl.classList.add('error');
}

function applyErrorToAll(cueItems, error) {
  observerPaused = true;
  const msg = errorToMessage(error);
  for (const { textSpan, container } of cueItems) {
    if (error === 'DISABLED') {
      if (textSpan.dataset.original) {
        textSpan.textContent = textSpan.dataset.original;
        delete textSpan.dataset.original;
        delete textSpan.dataset.translated;
      }
      const parent = textSpan.closest('p') || textSpan.parentElement;
      parent.querySelectorAll(`.${ORIGINAL_CLASS}`).forEach(el => el.remove());
    } else {
      applyError(textSpan, container, msg);
    }
  }
  observerPaused = false;
}

// === 핵심: 중복 제거 후 배치 번역 ===
async function translateAllCues(panel) {
  if (isBatchTranslating) return;
  isBatchTranslating = true;

  const cueItems = collectCues(panel);
  const untranslated = getUntranslatedCues(cueItems);

  if (untranslated.length === 0) {
    isBatchTranslating = false;
    return;
  }

  const uniqueTexts = [...new Set(untranslated.map(c => c.text))];

  observerPaused = true;
  for (const { textSpan, container } of untranslated) {
    applyLoading(textSpan, container, '번역 중...');
  }
  observerPaused = false;

  try {
    const ctx = getLectureContext();
    const response = await chrome.runtime.sendMessage({
      type: 'TRANSLATE_BATCH',
      texts: uniqueTexts,
      lecture: ctx.lecture,
      section: ctx.section
    });

    if (!response) {
      isBatchTranslating = false;
      return;
    }

    if (response.error) {
      applyErrorToAll(untranslated, response.error);
      isBatchTranslating = false;
      return;
    }

    const resultMap = new Map();
    const results = response.results || [];
    for (let i = 0; i < uniqueTexts.length; i++) {
      resultMap.set(uniqueTexts[i], results[i] || { error: 'NO_RESULT' });
    }

    const firstError = results.find(r => r?.error);
    if (firstError?.error === 'RATE_LIMIT') {
      applyErrorToAll(untranslated, 'RATE_LIMIT');
      isBatchTranslating = false;
      return;
    }

    observerPaused = true;
    for (const { text, textSpan, container } of untranslated) {
      const result = resultMap.get(text);
      if (result?.translation) {
        applyTranslation(textSpan, container, result.translation);
      } else {
        applyError(textSpan, container, errorToMessage(result?.error));
      }
    }
    observerPaused = false;

  } catch (err) {
    observerPaused = true;
    for (const { textSpan, container } of untranslated) {
      applyError(textSpan, container, '⚠ 연결 오류');
    }
    observerPaused = false;
  }

  isBatchTranslating = false;

  const captionEl = document.querySelector(CAPTION_SELECTOR);
  if (captionEl) replaceCaptionText(captionEl);

  const remaining = getUntranslatedCues(collectCues(panel));
  if (remaining.length > 0) {
    scheduleTranslation(panel);
  }
}

// === 디바운스된 번역 스케줄링 ===
export function scheduleTranslation(panel) {
  clearTimeout(settleTimer);
  settleTimer = setTimeout(() => {
    const untranslated = getUntranslatedCues(collectCues(panel));
    if (untranslated.length > 0) {
      translateAllCues(panel);
    }
  }, SETTLE_DELAY_MS);
}

// === 패널 초기화 ===
function initPanel(panel) {
  if (currentPanel === panel && observer) return;

  if (observer) observer.disconnect();
  currentPanel = panel;

  scheduleTranslation(panel);

  observer = new MutationObserver((mutations) => {
    if (observerPaused || isBatchTranslating) return;

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
  const panel = document.querySelector(SELECTORS.panel);
  if (!panel) return { count: 0 };

  const cueItems = collectCues(panel);
  if (cueItems.length === 0) return { count: 0 };

  const uniqueTexts = [...new Set(cueItems.map(c => c.text))];

  observerPaused = true;
  for (const { textSpan, container } of cueItems) {
    applyLoading(textSpan, container, '재번역 중...');
  }
  observerPaused = false;

  const { targetLang } = await chrome.storage.local.get(STORAGE_KEYS.TARGET_LANG);
  const lang = targetLang || '한국어';
  const ctx = getLectureContext();

  try {
    const response = await chrome.runtime.sendMessage({
      type: 'RETRANSLATE_BATCH',
      texts: uniqueTexts,
      lang,
      lecture: ctx.lecture,
      section: ctx.section
    });

    if (response?.error) {
      applyErrorToAll(cueItems, response.error);
      return { count: 0 };
    }

    const retransMap = new Map();
    const results = response?.results || [];
    for (let i = 0; i < uniqueTexts.length; i++) {
      if (results[i]?.translation) {
        retransMap.set(uniqueTexts[i], results[i].translation);
      }
    }

    let count = 0;
    observerPaused = true;
    for (const { text, textSpan, container } of cueItems) {
      const translation = retransMap.get(text);
      if (translation) {
        applyTranslation(textSpan, container, translation);
        count++;
      } else {
        applyError(textSpan, container, '⚠ 번역 오류');
      }
    }
    observerPaused = false;

    const captionEl = document.querySelector(CAPTION_SELECTOR);
    if (captionEl) replaceCaptionText(captionEl);

    return { count };
  } catch (_) {
    applyErrorToAll(cueItems, '연결 오류');
    return { count: 0 };
  }
}

// === Observer 정리 (네비게이션 시 호출) ===
export function cleanup() {
  if (observer) observer.disconnect();
  if (panelFinderObserver) panelFinderObserver.disconnect();
  currentPanel = null;
  clearTimeout(settleTimer);
  isBatchTranslating = false;
}
