(() => {
  const SELECTORS = {
    panel: '[data-purpose="transcript-panel"]',
    cueActive: 'p[data-purpose="transcript-cue-active"]',
    cueAll: 'p[data-purpose="transcript-cue"], p[data-purpose="transcript-cue-active"]',
    cueText: 'span[data-purpose="cue-text"]'
  };

  const LECTURE_SELECTORS = {
    currentItem: 'li[aria-current="true"] span[data-purpose="item-title"]',
    sectionPanel: 'div[data-purpose^="section-panel-"]',
    sectionTitle: 'span.ud-accordion-panel-title',
  };

  const CAPTION_SELECTOR = '[data-purpose="captions-cue-text"]';
  const ORIGINAL_CLASS = 'udemy-translator-original';
  const SETTLE_DELAY_MS = 1500;

  let observer = null;
  let panelFinderObserver = null;
  let captionObserver = null;
  let captionFinderObserver = null;
  let currentPanel = null;
  let isBatchTranslating = false;
  let settleTimer = null;
  let observerPaused = false;

  // 현재 스타일/모드 설정
  let currentStyle = {
    fontSize: 14,
    fontColor: '#ffffff',
    bgColor: '#1e293b',
    bgOpacity: 80,
    bgEnabled: true,
    displayMode: 'translation'
  };

  // === 강의 컨텍스트 추출 ===
  function getLectureContext() {
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

  // === 설정 로드 ===
  async function loadStyle() {
    const stored = await chrome.storage.local.get([
      'styleFontSize', 'styleFontColor', 'styleBgColor', 'styleBgEnabled', 'styleBgOpacity', 'displayMode'
    ]);
    currentStyle.fontSize = stored.styleFontSize ?? 14;
    currentStyle.fontColor = stored.styleFontColor ?? '#ffffff';
    currentStyle.bgColor = stored.styleBgColor ?? '#1e293b';
    currentStyle.bgOpacity = stored.styleBgOpacity ?? 80;
    currentStyle.bgEnabled = stored.styleBgEnabled ?? true;
    currentStyle.displayMode = stored.displayMode ?? 'translation';
  }

  // === 동적 스타일시트 ===
  function hexToRgba(hex, opacity) {
    const r = parseInt(hex.slice(1, 3), 16);
    const g = parseInt(hex.slice(3, 5), 16);
    const b = parseInt(hex.slice(5, 7), 16);
    return `rgba(${r}, ${g}, ${b}, ${opacity / 100})`;
  }

  function updateDynamicStyles() {
    let styleEl = document.getElementById('udemy-translator-dynamic-style');
    if (!styleEl) {
      styleEl = document.createElement('style');
      styleEl.id = 'udemy-translator-dynamic-style';
      document.head.appendChild(styleEl);
    }

    const bgCaption = currentStyle.bgEnabled
      ? `background-color: ${hexToRgba(currentStyle.bgColor, currentStyle.bgOpacity)} !important; padding: 4px 10px !important; border-radius: 4px !important;`
      : '';

    styleEl.textContent = `
      /* 번역된 cue-text 스타일 (트랜스크립트 패널) — 흰 배경이므로 검은 글씨 */
      ${SELECTORS.cueText}[data-original] {
        font-size: ${currentStyle.fontSize}px !important;
        color: #1a1a1a !important;
      }
      /* 비디오 캡션 스타일 — 어두운 배경 + 밝은 글씨 */
      ${CAPTION_SELECTOR} {
        font-size: ${currentStyle.fontSize * 1.5}px !important;
        color: ${currentStyle.fontColor} !important;
        opacity: 1 !important;
        ${bgCaption}
      }
      /* 원본 텍스트 (both 모드에서 보조 표시) */
      .${ORIGINAL_CLASS} {
        font-size: 11px !important;
        color: #999 !important;
        display: block;
        margin-top: 2px;
      }
      .${ORIGINAL_CLASS}.loading {
        color: #999 !important;
        font-style: italic;
      }
      .${ORIGINAL_CLASS}.error {
        color: #e74c3c !important;
      }
      /* 캡션 both 모드: 원본 텍스트 (번역 아래 작게 표시) */
      .caption-original {
        font-size: ${Math.round(currentStyle.fontSize * 1.1)}px !important;
        color: rgba(255, 255, 255, 0.6) !important;
        margin-top: 4px;
      }
    `;
  }

  // === 표시 모드 적용 ===
  // cue-text: 번역된 텍스트 (= 비디오 캡션)
  // ORIGINAL_CLASS span: 원본 텍스트 (both 모드에서만 표시)
  function applyDisplayMode(container) {
    const cueTextSpan = container.querySelector(SELECTORS.cueText);
    if (!cueTextSpan) return;
    const parent = cueTextSpan.closest('p') || cueTextSpan.parentElement;
    const originalEl = parent.querySelector(`.${ORIGINAL_CLASS}`);
    const hasTranslation = cueTextSpan.dataset.original;

    if (!hasTranslation) return;

    if (currentStyle.displayMode === 'original') {
      // 원본만: cue-text를 원본으로 복원, 원본 span 숨김
      cueTextSpan.textContent = cueTextSpan.dataset.original;
      if (originalEl) originalEl.style.display = 'none';
    } else if (currentStyle.displayMode === 'translation') {
      // 번역만: cue-text는 번역, 원본 span 숨김
      cueTextSpan.textContent = cueTextSpan.dataset.translated || cueTextSpan.dataset.original;
      if (originalEl) originalEl.style.display = 'none';
    } else {
      // both: cue-text는 번역 (→ 캡션에 번역 표시), 원본 span 표시
      cueTextSpan.textContent = cueTextSpan.dataset.translated || cueTextSpan.dataset.original;
      if (originalEl) originalEl.style.display = '';
    }
  }

  function applyDisplayModeAll() {
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
  // textSpan의 nextSibling으로 관리 → container가 달라져도 항상 동일 span 참조
  function getOrCreateOriginalEl(textSpan) {
    // textSpan 바로 뒤에 있는지 확인
    const next = textSpan.nextElementSibling;
    if (next?.classList.contains(ORIGINAL_CLASS)) return next;

    // 부모 안에서 탐색 (혹시 다른 위치에 있을 경우)
    const parent = textSpan.closest('p') || textSpan.parentElement;
    const existing = parent.querySelectorAll(`.${ORIGINAL_CLASS}`);
    // 중복 span이 있으면 첫 번째만 남기고 제거
    if (existing.length > 1) {
      for (let i = 1; i < existing.length; i++) existing[i].remove();
    }
    if (existing.length > 0) return existing[0];

    // 없으면 생성 — textSpan 바로 뒤에 삽입
    const el = document.createElement('span');
    el.className = ORIGINAL_CLASS;
    textSpan.after(el);
    return el;
  }

  // === 패널의 모든 큐 수집 ===
  function collectCues(panel) {
    const cues = panel.querySelectorAll(SELECTORS.cueAll);
    const items = [];
    cues.forEach(cue => {
      const textSpan = cue.querySelector(SELECTORS.cueText);
      if (!textSpan) return;
      // 원본 텍스트: data-original이 있으면 그것이 진짜 원본
      const text = textSpan.dataset.original || textSpan.textContent.trim();
      if (!text) return;
      const container = cue.closest('[class*="cue-container"]') || cue;
      items.push({ text, container, textSpan });
    });
    return items;
  }

  // === 미번역 큐만 필터링 ===
  function getUntranslatedCues(cueItems) {
    return cueItems.filter(({ textSpan }) => {
      // 이미 번역 완료
      if (textSpan.dataset.original) return false;
      // 에러/로딩 상태인 cue는 이미 시도된 것 → 제외 (무한 재시도 방지)
      const parent = textSpan.closest('p') || textSpan.parentElement;
      const origEl = parent.querySelector(`.${ORIGINAL_CLASS}`);
      if (origEl) return false;
      // 아직 아무 처리도 안 된 새 cue만 대상
      return true;
    });
  }

  // === 번역 결과를 큐에 적용 ===
  function applyTranslation(textSpan, container, translation) {
    // 원본 저장
    if (!textSpan.dataset.original) {
      textSpan.dataset.original = textSpan.textContent.trim();
    }
    textSpan.dataset.translated = translation;


    // cue-text를 번역으로 교체 (→ 비디오 캡션 자동 반영)
    if (currentStyle.displayMode !== 'original') {
      textSpan.textContent = translation;
    }

    // both 모드: 원본 텍스트 span 추가
    const originalEl = getOrCreateOriginalEl(textSpan);
    originalEl.textContent = textSpan.dataset.original;
    originalEl.classList.remove('loading', 'error');

    applyDisplayMode(container);
  }

  function applyLoading(textSpan, container, msg) {
    const originalEl = getOrCreateOriginalEl(textSpan);
    originalEl.textContent = msg;
    originalEl.classList.add('loading');
    originalEl.classList.remove('error');
  }

  function applyError(textSpan, container, errorMsg) {
    const originalEl = getOrCreateOriginalEl(textSpan);
    originalEl.textContent = errorMsg;
    originalEl.classList.remove('loading');
    originalEl.classList.add('error');
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

    // 1) 중복 제거
    const uniqueTexts = [...new Set(untranslated.map(c => c.text))];

    // 2) 로딩 표시
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

      // 3) 결과 맵
      const resultMap = new Map();
      const results = response.results || [];
      for (let i = 0; i < uniqueTexts.length; i++) {
        resultMap.set(uniqueTexts[i], results[i] || { error: 'NO_RESULT' });
      }

      // rate limit 체크
      const firstError = results.find(r => r?.error);
      if (firstError?.error === 'RATE_LIMIT') {
        applyErrorToAll(untranslated, 'RATE_LIMIT');
        isBatchTranslating = false;
        return;
      }

      // 4) 번역 적용
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

    // 현재 표시 중인 캡션도 즉시 치환
    const captionEl = document.querySelector(CAPTION_SELECTOR);
    if (captionEl) replaceCaptionText(captionEl);

    // 번역 중 추가된 새 자막 재확인
    const remaining = getUntranslatedCues(collectCues(panel));
    if (remaining.length > 0) {
      scheduleTranslation(panel);
    }
  }

  function errorToMessage(error) {
    if (!error) return '⚠ 번역 실패';
    if (error === 'RATE_LIMIT') return '⚠ API 할당량 초과';
    if (error === 'NO_API_KEY') return '⚠ API 키를 설정하세요';
    if (error === 'DISABLED') return '';
    if (error === 'PARSE_ERROR') return '⚠ 응답 파싱 실패';
    if (error.startsWith('API_ERROR:')) {
      const parts = error.split(':');
      return `⚠ API 오류 (${parts[1]})`;
    }
    return `⚠ ${error}`;
  }

  function applyErrorToAll(cueItems, error) {
    observerPaused = true;
    const msg = errorToMessage(error);
    for (const { textSpan, container } of cueItems) {
      if (error === 'DISABLED') {
        // 비활성화: 원본 복원, 원본 span 제거
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

  // === 패널 초기화 ===
  function initPanel(panel) {
    // 이미 같은 패널을 감시 중이면 스킵
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
  function initPanelFinder() {
    if (panelFinderObserver) panelFinderObserver.disconnect();
    currentPanel = null;

    // 이미 있으면 바로 초기화
    const existing = document.querySelector(SELECTORS.panel);
    if (existing) initPanel(existing);

    panelFinderObserver = new MutationObserver(() => {
      const panel = document.querySelector(SELECTORS.panel);
      if (panel) {
        initPanel(panel);
      } else if (currentPanel) {
        // 패널이 사라짐 (탭 전환 등)
        if (observer) observer.disconnect();
        currentPanel = null;
      }
    });

    panelFinderObserver.observe(document.body, {
      childList: true,
      subtree: true
    });
  }

  // === 디바운스된 번역 스케줄링 ===
  function scheduleTranslation(panel) {
    clearTimeout(settleTimer);
    settleTimer = setTimeout(() => {
      const untranslated = getUntranslatedCues(collectCues(panel));
      if (untranslated.length > 0) {
        translateAllCues(panel);
      }
    }, SETTLE_DELAY_MS);
  }

  // === storage 변경 감지 → 즉시 스타일 반영 ===
  const STYLE_KEYS = new Set([
    'styleFontSize', 'styleFontColor', 'styleBgColor', 'styleBgEnabled', 'styleBgOpacity', 'displayMode', 'enabled'
  ]);

  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== 'local') return;

    // enabled 변경
    if (changes.enabled) {
      if (changes.enabled.newValue === false) {
        removeAllTranslations();
        return;
      }
      // false → true: 재번역 트리거
      const panel = document.querySelector(SELECTORS.panel);
      if (panel) scheduleTranslation(panel);
    }

    // 스타일 관련 키가 변경되었으면 즉시 반영
    const hasStyleChange = Object.keys(changes).some(k => STYLE_KEYS.has(k));
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

  // === 전체 재번역 ===
  async function retranslateAll() {
    const panel = document.querySelector(SELECTORS.panel);
    if (!panel) return { count: 0 };

    const cueItems = collectCues(panel);
    if (cueItems.length === 0) return { count: 0 };

    const uniqueTexts = [...new Set(cueItems.map(c => c.text))];

    // 로딩 표시
    observerPaused = true;
    for (const { textSpan, container } of cueItems) {
      applyLoading(textSpan, container, '재번역 중...');
    }
    observerPaused = false;

    const { targetLang } = await chrome.storage.local.get('targetLang');
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

      // 현재 표시 중인 캡션도 즉시 치환
      const captionEl = document.querySelector(CAPTION_SELECTOR);
      if (captionEl) replaceCaptionText(captionEl);

      return { count };
    } catch (_) {
      applyErrorToAll(cueItems, '연결 오류');
      return { count: 0 };
    }
  }

  // === 모든 번역 제거 (원본 복원) ===
  function removeAllTranslations() {
    observerPaused = true;
    // 원본 텍스트 복원
    document.querySelectorAll(`${SELECTORS.cueText}[data-original]`).forEach(span => {
      span.textContent = span.dataset.original;
      delete span.dataset.original;
      delete span.dataset.translated;
    });
    // 원본 표시 span 제거
    document.querySelectorAll(`.${ORIGINAL_CLASS}`).forEach(el => el.remove());
    observerPaused = false;
  }

  // === 비디오 캡션 번역 치환 ===
  let currentCaptionEl = null;
  let captionReplacePaused = false;

  // 번역 맵 구축: 원본 텍스트 → 번역 텍스트 (트랜스크립트 패널 기반)
  function buildTranslationMap() {
    const map = new Map();
    document.querySelectorAll(`${SELECTORS.cueText}[data-translated]`).forEach(span => {
      if (span.dataset.original && span.dataset.translated) {
        map.set(span.dataset.original.trim(), span.dataset.translated);
      }
    });
    return map;
  }

  // 캡션 텍스트를 번역으로 치환
  function replaceCaptionText(captionEl) {
    if (!captionEl || captionReplacePaused) return;
    if (currentStyle.displayMode === 'original') return;

    // 캡션 내부에서 원본 텍스트 추출 (both 모드 서브 span 제외)
    const subSpan = captionEl.querySelector('.caption-original');
    const originalText = subSpan
      ? captionEl.childNodes[0]?.textContent?.trim() || captionEl.textContent.trim()
      : captionEl.textContent.trim();
    if (!originalText) return;

    const translationMap = buildTranslationMap();
    const translated = translationMap.get(originalText);
    if (!translated) return;

    captionReplacePaused = true;
    if (currentStyle.displayMode === 'both') {
      // both 모드: 번역 + 원본을 함께 표시
      captionEl.innerHTML = '';
      captionEl.appendChild(document.createTextNode(translated));
      const origLine = document.createElement('div');
      origLine.className = 'caption-original';
      origLine.textContent = originalText;
      captionEl.appendChild(origLine);
    } else {
      // translation 모드: 번역만
      captionEl.textContent = translated;
    }
    captionReplacePaused = false;
  }

  // 캡션 요소에 MutationObserver 부착
  function observeCaption(captionEl) {
    // 이미 같은 요소를 감시 중이면 스킵
    if (currentCaptionEl === captionEl && captionObserver) return;

    if (captionObserver) captionObserver.disconnect();
    currentCaptionEl = captionEl;

    // 초기 치환
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

  // 캡션 요소가 동적으로 생성/제거되므로 document에서 감시
  function initCaptionFinder() {
    if (captionFinderObserver) captionFinderObserver.disconnect();
    currentCaptionEl = null;

    // 이미 있으면 바로 감시 시작
    const existing = document.querySelector(CAPTION_SELECTOR);
    if (existing) observeCaption(existing);

    captionFinderObserver = new MutationObserver((mutations) => {
      // 캡션 관련 변경만 필터링
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

  // === SPA 네비게이션 대응 ===
  function onNavigate() {
    if (observer) observer.disconnect();
    if (panelFinderObserver) panelFinderObserver.disconnect();
    if (captionObserver) captionObserver.disconnect();
    if (captionFinderObserver) captionFinderObserver.disconnect();
    currentPanel = null;
    currentCaptionEl = null;
    clearTimeout(settleTimer);
    isBatchTranslating = false;
    setTimeout(() => {
      initPanelFinder();
      initCaptionFinder();
    }, 1000);
  }

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

  // === 시작 ===
  loadStyle().then(() => {
    updateDynamicStyles();
    initPanelFinder();
    initCaptionFinder();
  });
})();
