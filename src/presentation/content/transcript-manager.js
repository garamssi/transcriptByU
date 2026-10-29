import { SELECTORS, LECTURE_SELECTORS, ORIGINAL_CLASS, SETTLE_DELAY_MS, CAPTION_SELECTOR } from '../../domain/constants.js';
import { currentStyle } from './style-manager.js';
import { replaceCaptionText, updateCaptionCache, clearCaptionCache } from './caption-manager.js';
import { getVttTranslation, requestTranslations, currentLectureKey, isRequestable, resetTracking, setLectureScript, unitsForCues, resolveCueIndices } from './vtt-bridge.js';

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
    // translated 가 '' 이면 문장이 이어지는 큐 — 번역은 문장 첫 큐에 있으므로 비워 둔다.
    cueTextSpan.textContent = cueTextSpan.dataset.translated ?? cueTextSpan.dataset.original;
    if (originalEl) originalEl.style.display = 'none';
  } else {
    cueTextSpan.textContent = cueTextSpan.dataset.translated ?? cueTextSpan.dataset.original;
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
    // VTT 파서와 같은 방식(연속 공백 → 1칸)으로 정규화해, 같은 문장이 경로마다 다른 키로 중복 요청되지 않게 한다.
    const text = (textSpan.dataset.original || textSpan.textContent).replace(/\s+/g, ' ').trim();
    if (!text) return;
    const container = cue.closest('[class*="cue-container"]') || cue;
    items.push({ text, container, textSpan });
  });
  return items;
}

// === 미번역 큐만 필터링 (VTT 번역 적용 포함) ===
export function getUntranslatedCues(cueItems) {
  const key = currentLectureKey(); // 스캔당 1회만 계산 (현재 강의 버킷)
  // 행 순서대로 대본 위치를 맞춘다(같은 텍스트의 큐가 여러 번 나와도 각 행이 자기 문장을 찾게).
  const indices = resolveCueIndices(cueItems.map(({ text }) => text), key);
  cueItems.forEach((item, n) => { item.index = indices[n]; });
  return cueItems.filter(({ text, textSpan, container, index }) => {
    if (textSpan.dataset.original) return false;
    const parent = textSpan.closest('p') || textSpan.parentElement;
    const origEl = parent.querySelector(`.${ORIGINAL_CLASS}`);
    if (origEl) return false;

    // 패널은 문장 번역을 문장의 첫 큐에만 싣는다('' = 이어지는 큐). 영상 자막용은 문장 전체.
    const panelText = getVttTranslation(text, key, { panel: true, index });
    if (panelText !== null) {
      applyTranslation(textSpan, container, panelText, getVttTranslation(text, key, { index }));
      return false;
    }
    return true;
  });
}

// === 번역 결과를 큐에 적용 ===
export function applyTranslation(textSpan, container, translation, captionText = translation) {
  if (!textSpan.dataset.original) {
    textSpan.dataset.original = textSpan.textContent.trim();
  }
  textSpan.dataset.translated = translation;

  // 캡션 번역 캐시 업데이트 (DOM 스캔 방지) — 영상 자막은 패널과 달리 문장 전체를 보여 준다
  updateCaptionCache(textSpan.dataset.original, captionText);

  if (currentStyle.displayMode !== 'original') {
    textSpan.textContent = translation;
  }

  const originalEl = getOrCreateOriginalEl(textSpan);
  originalEl.textContent = textSpan.dataset.original;

  applyDisplayMode(container);
}

// === VTT 번역을 DOM에 적용 ===
let isApplying = false;

function applyVttTranslations(panel) {
  if (isApplying) return;
  isApplying = true;
  pauseObserver();

  let toRequest = [];
  try {
    const cueItems = collectCues(panel);
    // VTT 를 못 잡은 경우에도 패널 대본을 문맥으로 쓸 수 있게 등록한다(VTT 대본이 있으면 무시됨).
    setLectureScript(cueItems.map(({ text }) => text), 'dom');
    // 저장된 VTT 번역을 붙이고, 아직 번역 없는 큐 목록을 돌려받는다.
    const untranslated = getUntranslatedCues(cueItems);

    // 자동 경로가 스스로 번역을 요청한다.
    // (기존에는 VTT 캡처가 채워둔 번역을 '붙이기만' 했으므로, VTT 캡처가
    //  리스너 등록 레이스로 유실되면 자동 번역이 전혀 발사되지 않았다.
    //  이제 패널이 발견되면 미번역 큐를 직접 요청하여 API 를 발사한다.)
    // 이미 요청 중이거나 실패 후 재시도 대기 중인 문장은 vtt-bridge 의 추적기가 관리하므로 제외한다.
    // 번역은 문장 단위로 요청한다(큐 → 그 큐가 속한 문장들).
    toRequest = unitsForCues(untranslated.map(({ text }) => text), currentLectureKey(), untranslated.map(({ index }) => index))
      .filter(text => text && isRequestable(text));

    const captionEl = document.querySelector(CAPTION_SELECTOR);
    if (captionEl) replaceCaptionText(captionEl);
  } finally {
    resumeObserver();
    isApplying = false;
  }

  if (toRequest.length > 0) {
    console.log(`[UdemyTranslator] auto-translate: requesting ${toRequest.length} sentence units`);
    requestTranslations(toRequest)
      .then(({ count }) => {
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
// 캐시를 먼저 지우지 않는다. 캐시를 건너뛰고(force) 새로 번역한 뒤 성공한 줄만 교체하고,
// 실패한 줄은 기존 번역을 그대로 유지한다(한도 초과 상태에서 눌러도 번역이 사라지지 않게).
export async function retranslateAll() {
  console.log('[UdemyTranslator] retranslateAll() called');
  const panel = document.querySelector(SELECTORS.panel);
  if (!panel) return { count: 0, failed: 0, error: null };

  const cueItems = collectCues(panel);
  if (cueItems.length === 0) return { count: 0, failed: 0, error: null };

  setLectureScript(cueItems.map(({ text }) => text), 'dom');
  const texts = unitsForCues(cueItems.map(({ text }) => text));
  // 실패·포기 상태로 남은 문장도 다시 요청할 수 있게 추적 기록을 지운다.
  resetTracking(texts);

  const { fresh, failedTexts, error } = await requestTranslations(texts, { force: true });

  if (fresh > 0) {
    // 버킷에 새 번역이 들어갔으므로 DOM 을 원문으로 되돌린 뒤 버킷 기준으로 다시 붙인다.
    // (실패한 줄은 버킷에 기존 번역이 남아 있어 그대로 다시 붙는다.)
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
    applyVttTranslations(panel);
  }

  return { count: fresh, failed: failedTexts.length, error: error?.code || null };
}

// === Observer 정리 (네비게이션 시 호출) ===
export function cleanup() {
  if (observer) observer.disconnect();
  if (panelFinderObserver) panelFinderObserver.disconnect();
  currentPanel = null;
  clearTimeout(settleTimer);
  clearCaptionCache();
}
