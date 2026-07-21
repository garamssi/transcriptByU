import { SELECTORS, LECTURE_SELECTORS, ORIGINAL_CLASS, SETTLE_DELAY_MS, CAPTION_SELECTOR, STORAGE_KEYS } from '../../domain/constants.js';
import { currentStyle } from './style-manager.js';
import { replaceCaptionText, updateCaptionCache, clearCaptionCache } from './caption-manager.js';
import { getVttTranslation, requestTranslations, forgetVttTranslations } from './vtt-bridge.js';

let observer = null;
let panelFinderObserver = null;
let currentPanel = null;
let settleTimer = null;

const PANEL_OBSERVE_OPTS = { childList: true, subtree: true };

function pauseObserver() {
  if (observer) observer.disconnect();
}

function resumeObserver() {
  if (observer && currentPanel) observer.observe(currentPanel, PANEL_OBSERVE_OPTS);
}

// === 강의 컨텍스트 추출 ===
export function getLectureContext() {
  const result = { course: '', lecture: '', section: '' };
  // 코스 식별자: URL 슬러그 (/course/<slug>/learn/...) — 항상 존재, 코스마다 고유
  const courseMatch = location.pathname.match(/\/course\/([^/]+)/);
  if (courseMatch) result.course = courseMatch[1];
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
  pauseObserver();
  panel.querySelectorAll(SELECTORS.cueAll).forEach(cue => {
    const container = cue.closest('[class*="cue-container"]') || cue;
    applyDisplayMode(container);
  });
  resumeObserver();
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

  // 캡션 번역 캐시 업데이트 (DOM 스캔 방지)
  updateCaptionCache(textSpan.dataset.original, translation);

  if (currentStyle.displayMode !== 'original') {
    textSpan.textContent = translation;
  }

  const originalEl = getOrCreateOriginalEl(textSpan);
  originalEl.textContent = textSpan.dataset.original;

  applyDisplayMode(container);
}

// === VTT 번역을 DOM에 적용 ===
let isApplying = false;
// 자동 경로에서 이미 번역 요청한 원본 텍스트 (중복·무한 요청 방지).
// 네비게이션(cleanup) 및 재번역 시 초기화된다.
const autoRequestedTexts = new Set();

function applyVttTranslations(panel) {
  if (isApplying) return;
  isApplying = true;
  pauseObserver();

  let toRequest = [];
  try {
    const cueItems = collectCues(panel);
    // 저장된 VTT 번역을 붙이고, 아직 번역 없는 큐 목록을 돌려받는다.
    const untranslated = getUntranslatedCues(cueItems);

    // 자동 경로가 스스로 번역을 요청한다.
    // (기존에는 VTT 캡처가 채워둔 번역을 '붙이기만' 했으므로, VTT 캡처가
    //  리스너 등록 레이스로 유실되면 자동 번역이 전혀 발사되지 않았다.
    //  이제 패널이 발견되면 미번역 큐를 직접 요청하여 API 를 발사한다.)
    toRequest = untranslated
      .map(({ text }) => text)
      .filter(text => text && !autoRequestedTexts.has(text));

    const captionEl = document.querySelector(CAPTION_SELECTOR);
    if (captionEl) replaceCaptionText(captionEl);
  } finally {
    resumeObserver();
    isApplying = false;
  }

  if (toRequest.length > 0) {
    toRequest.forEach(text => autoRequestedTexts.add(text));
    console.log(`[UdemyTranslator] auto-translate: requesting ${toRequest.length} cues`);
    requestTranslations(toRequest)
      .then(count => {
        // 새 번역이 저장됐으면 재스캔하여 DOM 에 반영한다.
        if (count > 0) scheduleTranslation(panel);
      })
      .catch(err => {
        console.error('[UdemyTranslator] auto-translate request failed:', err?.message || err);
      });
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

  observer.observe(panel, PANEL_OBSERVE_OPTS);
}

// === 트랜스크립트 패널 등장 감시 ===
export function initPanelFinder() {
  if (panelFinderObserver) panelFinderObserver.disconnect();
  currentPanel = null;

  const existing = document.querySelector(SELECTORS.panel);
  console.log('[UdemyTranslator] initPanelFinder, panel:', existing ? 'FOUND' : 'NOT FOUND');
  if (existing) initPanel(existing);

  panelFinderObserver = new MutationObserver((mutations) => {
    const relevant = mutations.some(m =>
      [...m.addedNodes, ...m.removedNodes].some(n =>
        n.nodeType === 1 &&
        (n.matches?.('[data-purpose="transcript-panel"]') ||
         n.querySelector?.('[data-purpose="transcript-panel"]'))
      )
    );
    if (!relevant) return;

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
  pauseObserver();
  document.querySelectorAll(`${SELECTORS.cueText}[data-original]`).forEach(span => {
    span.textContent = span.dataset.original;
    delete span.dataset.original;
    delete span.dataset.translated;
  });
  document.querySelectorAll(`.${ORIGINAL_CLASS}`).forEach(el => el.remove());
  clearCaptionCache();
  resumeObserver();
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

  // 재번역 대상 원본 텍스트(영문)를 DOM 원복 전에 확보한다.
  const texts = cueItems.map(({ text }) => text);

  // 1) 영속 캐시(L1+L2) 삭제 → 다음 TRANSLATE_BATCH 가 API 를 새로 호출하도록 한다.
  await chrome.runtime.sendMessage({
    type: 'CLEAR_LECTURE_CACHE',
    lang,
    course: ctx.course,
    lecture: ctx.lecture,
    section: ctx.section
  });

  // 2) 메모리 VTT 저장소의 기존 번역 폐기 + DOM 원복.
  //    이 단계 없이는 applyVttTranslations 가 오래된 메모리 번역을 다시 붙여
  //    캐시만 지워지고 화면은 그대로인 문제가 발생한다.
  forgetVttTranslations(texts);
  // 자동 요청 기록도 비워 강제 재번역이 API 를 새로 호출하게 한다.
  autoRequestedTexts.clear();

  pauseObserver();
  for (const { textSpan } of cueItems) {
    if (textSpan.dataset.original) {
      textSpan.textContent = textSpan.dataset.original;
      delete textSpan.dataset.original;
      delete textSpan.dataset.translated;
    }
    const parent = textSpan.closest('p') || textSpan.parentElement;
    parent.querySelectorAll(`.${ORIGINAL_CLASS}`).forEach(el => el.remove());
  }
  clearCaptionCache();
  resumeObserver();

  // 3) 캐시가 비었으므로 새 번역을 API 로 재요청한 뒤 DOM 에 적용한다.
  await requestTranslations(texts);
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
  autoRequestedTexts.clear();
  clearCaptionCache();
}
