import { SELECTORS, LECTURE_SELECTORS, ORIGINAL_CLASS, SETTLE_DELAY_MS, CAPTION_SELECTOR, STORAGE_KEYS, CHUNK_SIZE, OLLAMA_CHUNK_SIZE } from '../../domain/constants.js';
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

// === 텍스트→큐 매핑 구축 (동일 텍스트가 여러 큐에 있을 수 있음) ===
function buildTextToCueMap(cueItems) {
  const map = new Map();
  for (const item of cueItems) {
    if (!map.has(item.text)) map.set(item.text, []);
    map.get(item.text).push(item);
  }
  return map;
}

// === 청크 단위 결과를 즉시 DOM에 반영 ===
function applyChunkResults(chunkTexts, response, textToCues) {
  if (!response || response.error) {
    const errMsg = errorToMessage(response?.error || 'UNKNOWN');
    observerPaused = true;
    for (const text of chunkTexts) {
      for (const { textSpan, container } of (textToCues.get(text) || [])) {
        applyError(textSpan, container, errMsg);
      }
    }
    observerPaused = false;
    return;
  }

  const results = response.results || [];
  observerPaused = true;
  for (let i = 0; i < chunkTexts.length; i++) {
    const result = results[i];
    for (const { textSpan, container } of (textToCues.get(chunkTexts[i]) || [])) {
      if (result?.translation) {
        applyTranslation(textSpan, container, result.translation);
      } else {
        applyError(textSpan, container, errorToMessage(result?.error));
      }
    }
  }
  observerPaused = false;

  // 캡션도 즉시 갱신
  const captionEl = document.querySelector(CAPTION_SELECTOR);
  if (captionEl) replaceCaptionText(captionEl);
}

// === 핵심: 청크 단위 비동기 번역 (먼저 온 결과부터 DOM 반영) ===
async function translateAllCues(panel) {
  if (isBatchTranslating) return;
  isBatchTranslating = true;

  const cueItems = collectCues(panel);
  const untranslated = getUntranslatedCues(cueItems);
  console.log(`[UdemyTranslator] translateAllCues: total=${cueItems.length}, untranslated=${untranslated.length}`);

  if (untranslated.length === 0) {
    isBatchTranslating = false;
    return;
  }

  const uniqueTexts = [...new Set(untranslated.map(c => c.text))];
  const textToCues = buildTextToCueMap(untranslated);

  // 로딩 표시
  observerPaused = true;
  for (const { textSpan, container } of untranslated) {
    applyLoading(textSpan, container, '번역 중...');
  }
  observerPaused = false;

  // 프로바이더에 따른 청크 사이즈 결정
  const { provider } = await chrome.storage.local.get(STORAGE_KEYS.PROVIDER);
  const chunkSize = (provider || 'ollama') === 'ollama' ? OLLAMA_CHUNK_SIZE : CHUNK_SIZE;

  // 청크 분할
  const chunks = [];
  for (let i = 0; i < uniqueTexts.length; i += chunkSize) {
    chunks.push(uniqueTexts.slice(i, i + chunkSize));
  }

  const ctx = getLectureContext();
  console.log(`[UdemyTranslator] ${uniqueTexts.length} texts → ${chunks.length} chunks (size=${chunkSize})`);

  // 청크별로 순차 전송, 결과 도착 즉시 DOM 반영
  for (let idx = 0; idx < chunks.length; idx++) {
    const chunk = chunks[idx];
    try {
      const response = await chrome.runtime.sendMessage({
        type: 'TRANSLATE_BATCH',
        texts: chunk,
        lecture: ctx.lecture,
        section: ctx.section
      });
      applyChunkResults(chunk, response, textToCues);
      console.log(`[UdemyTranslator] Chunk ${idx + 1}/${chunks.length} applied`);
    } catch (err) {
      observerPaused = true;
      for (const text of chunk) {
        for (const { textSpan, container } of (textToCues.get(text) || [])) {
          applyError(textSpan, container, '⚠ 연결 오류');
        }
      }
      observerPaused = false;
    }
  }

  isBatchTranslating = false;

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

// === 전체 재번역 (캐시 삭제 후 처음부터 다시 번역) ===
export async function retranslateAll() {
  console.log('[UdemyTranslator] retranslateAll() called');
  const panel = document.querySelector(SELECTORS.panel);
  if (!panel) return { count: 0 };

  const cueItems = collectCues(panel);
  if (cueItems.length === 0) return { count: 0 };

  const stored = await chrome.storage.local.get([STORAGE_KEYS.TARGET_LANG]);
  const lang = stored[STORAGE_KEYS.TARGET_LANG] || '한국어';
  const ctx = getLectureContext();

  // 1) 현재 강의 캐시 삭제 (L1 + L2)
  await chrome.runtime.sendMessage({
    type: 'CLEAR_LECTURE_CACHE',
    lang,
    lecture: ctx.lecture,
    section: ctx.section
  });
  console.log('[UdemyTranslator] retranslateAll: lecture cache cleared');

  // 2) DOM에서 번역 상태 초기화 (원본 복원)
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

  // 3) 일반 번역 흐름으로 전체 재번역
  await translateAllCues(panel);

  const translated = collectCues(panel).filter(({ textSpan }) => textSpan.dataset.original);
  const count = translated.length;
  console.log(`[UdemyTranslator] retranslateAll: ${count} items translated`);
  return { count };
}

// === Observer 정리 (네비게이션 시 호출) ===
export function cleanup() {
  if (observer) observer.disconnect();
  if (panelFinderObserver) panelFinderObserver.disconnect();
  currentPanel = null;
  clearTimeout(settleTimer);
  isBatchTranslating = false;
}
