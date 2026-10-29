import { SELECTORS, CAPTION_SELECTOR } from '../../domain/constants.js';
import { isAlreadyTargetLanguage } from '../../domain/language-detect.js';
import { currentStyle } from './style-manager.js';
import { getVttTranslation, getActiveLang } from './vtt-bridge.js';
import { showBadge, hideBadge, removeBadge } from './badge-manager.js';

let captionFinderObserver = null;
let currentCaptionEl = null;

// 캡션 감시자는 하나만 두고 감시 대상만 바꿔 붙인다. 콜백은 특정 요소에 묶지 않고 항상 현재 요소를 칠한다.
// (예전엔 요소마다 새 감시자를 만들었는데, 강의 이동 후 옛 감시자가 withObserverPaused 로 새 요소에
//  다시 붙어 '사라진 옛 요소'를 칠하고, 그 과정의 disconnect 로 새 감시자의 기록까지 버려
//  영상 자막이 영어로 남았다.)
const OBSERVE_OPTS = { childList: true, characterData: true, subtree: true };
const captionObserver = new MutationObserver(() => {
  if (currentCaptionEl) replaceCaptionText(currentCaptionEl);
});

// === 번역 맵 캐시: applyTranslation() 시점에 업데이트, DOM 스캔 불필요 ===
const translationMapCache = new Map();

export function updateCaptionCache(original, translated) {
  translationMapCache.set(original, translated);
}

export function clearCaptionCache() {
  translationMapCache.clear();
}

// 캡션 요소별로 마지막에 써 넣은 { original, translated } — 우리가 쓴 번역을
// 다음 원문으로 오인하지 않고, 표시 모드 전환 시 원문을 복원하는 데 쓴다.
const appliedText = new WeakMap();

// 대본/VTT 키와 같은 정규화(공백·줄바꿈 → 공백 1개) — 여러 줄 큐도 번역을 찾게 한다
const normalize = s => s.replace(/\s+/g, ' ').trim();

// 진단용: 최근 영상 자막 조회 기록(최대 20건). 자막이 원문으로 남는 원인을 실제 화면 데이터로 확인한다.
const lookupLog = [];
function logLookup(entry) {
  lookupLog.push({ at: new Date().toISOString().slice(11, 23), ...entry });
  if (lookupLog.length > 20) lookupLog.shift();
}

/** 진단 정보: 현재 캡션 요소 상태와 최근 조회 기록 */
export function getCaptionDebug() {
  const liveEl = document.querySelector(CAPTION_SELECTOR);
  return {
    observedElementIsLive: !!currentCaptionEl && currentCaptionEl === liveEl,
    observedElementConnected: !!currentCaptionEl?.isConnected,
    liveElementHtml: liveEl ? liveEl.outerHTML.slice(0, 400) : null,
    applied: liveEl ? appliedText.get(liveEl) || null : null,
    recentLookups: [...lookupLog],
  };
}

export function getCaptionCacheEntry(text) {
  return translationMapCache.has(text) ? translationMapCache.get(text) : null;
}

// Udemy(React)가 소유한 텍스트 노드들(.caption-original 안은 제외).
function ownTextNodes(captionEl) {
  const nodes = [];
  const walker = document.createTreeWalker(captionEl, NodeFilter.SHOW_TEXT, {
    acceptNode: n => n.parentElement?.closest('.caption-original')
      ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT,
  });
  while (walker.nextNode()) nodes.push(walker.currentNode);
  return nodes;
}

// React 텍스트 노드를 교체(textContent/innerHTML)하면 React 는 떨어져 나간 옛 노드에
// 다음 큐를 써서 화면 자막이 첫 번역에 멈춘다. 그래서 노드는 그대로 두고 nodeValue 만 바꾼다.
// 값이 같으면 쓰지 않는다 — 불필요한 변이가 observer 를 다시 깨우는 루프를 막는다.
// mainText 가 null 이면 React 텍스트는 그대로 두고 원문 줄만 정리한다.
function writeCaption(captionEl, nodes, mainText, subText) {
  if (mainText != null) {
    nodes.forEach((n, i) => {
      const v = i === 0 ? mainText : '';
      if (n.nodeValue !== v) n.nodeValue = v;
    });
  }
  let origLine = captionEl.querySelector('.caption-original');
  if (subText) {
    if (!origLine) {
      origLine = document.createElement('div');
      origLine.className = 'caption-original';
      captionEl.appendChild(origLine);
    }
    if (origLine.textContent !== subText) origLine.textContent = subText;
  } else if (origLine) {
    origLine.remove();
  }
}

// === 캡션 텍스트를 번역으로 치환 ===
export function replaceCaptionText(captionEl) {
  if (!captionEl) return;

  const nodes = ownTextNodes(captionEl);
  const raw = normalize(nodes.map(n => n.nodeValue).join(''));
  const applied = appliedText.get(captionEl);
  // 아직 우리가 쓴 번역이 그대로면 원문은 기록해 둔 것, 아니면 React 가 새 큐를 쓴 것
  const ours = !!applied && raw === applied.translated;
  const originalText = ours ? applied.original : raw;

  // 번역을 쓰지 않는 경로: 우리가 쓴 번역이 남아 있으면 원문으로 되돌리고,
  // React 가 새 큐를 썼으면 그 텍스트는 두고 이전 큐의 원문 줄만 지운다.
  const restore = () => {
    withObserverPaused(() => writeCaption(captionEl, nodes, ours ? originalText : null, null));
    appliedText.delete(captionEl);
  };

  if (!originalText) { restore(); return; }

  if (currentStyle.displayMode === 'original') {
    hideBadge();
    restore();
    return;
  }

  // 영상 자막은 재생 시각으로 큐 위치를 고르는 getVttTranslation 이 우선이다(같은 텍스트의 큐가
  // 강의에 여러 번 나오면 텍스트만으로 찾는 캐시는 다른 문장을 줄 수 있다).
  const fromTranscript = getVttTranslation(originalText);
  const translated = fromTranscript || translationMapCache.get(originalText);
  logLookup({ text: originalText.slice(0, 120), via: fromTranscript ? 'transcript' : translated ? 'panelCache' : null });
  if (!translated) {
    // 번역 없음: 원본이 이미 목표 언어면(백그라운드 스킵 대상, 예: 한국어 자막 → 한국어)
    // '번역 중' 배지를 숨기고, 아직 번역 전인 외국어면 배지를 표시한 채 원본을 유지한다.
    restore();
    if (isAlreadyTargetLanguage(originalText, getActiveLang())) hideBadge();
    else showBadge(captionEl);
    return;
  }

  showBadge(captionEl);
  withObserverPaused(() => {
    writeCaption(captionEl, nodes, translated,
      currentStyle.displayMode === 'both' ? originalText : null);
  });
  // 읽을 때 정규화하므로 비교용으로도 정규화해 저장한다 (전각·연속 공백이 든 번역 대비)
  appliedText.set(captionEl, { original: originalText, translated: normalize(translated) });
}

// 표시 모드 변경 시 다음 큐를 기다리지 않고 현재 자막을 바로 다시 칠한다.
export function refreshCaption() {
  if (currentCaptionEl) replaceCaptionText(currentCaptionEl);
}

// observer를 일시 중지하여 자기 트리거 루프 방지
function withObserverPaused(fn) {
  captionObserver.disconnect();
  fn();
  if (currentCaptionEl) captionObserver.observe(currentCaptionEl, OBSERVE_OPTS);
}

// === 캡션 요소에 MutationObserver 부착 ===
function observeCaption(captionEl) {
  if (currentCaptionEl === captionEl) return;
  // 감시 대상을 먼저 바꾼 뒤 칠한다(칠하는 동안의 일시 정지·재개가 새 요소 기준으로 이뤄지게).
  currentCaptionEl = captionEl;
  captionObserver.disconnect();
  captionObserver.observe(captionEl, OBSERVE_OPTS);
  // 배지 표시/숨김은 replaceCaptionText 가 일원 관리 (번역 모드·번역 유무·같은 언어 반영)
  replaceCaptionText(captionEl);
}

// VTT 번역이 준비되면(네트워크 캡처 완료) 현재 표시 중인 캡션을 즉시 다시 칠한다.
// 패널이 닫혀 있으면 transcript-manager 의 vtt-translations-ready 핸들러는 currentPanel
// 가드로 아무 것도 하지 않으므로, 영상 자막은 여기서 직접 갱신해야 다음 큐를 기다리지 않는다.
document.addEventListener('vtt-translations-ready', () => {
  if (currentCaptionEl) replaceCaptionText(currentCaptionEl);
});

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
  captionObserver.disconnect();
  if (captionFinderObserver) captionFinderObserver.disconnect();
  captionFinderObserver = null;
  currentCaptionEl = null;
  removeBadge();
}
