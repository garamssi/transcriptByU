(() => {
  // src/domain/constants.js
  var STORAGE_KEYS = {
    PROVIDER: "provider",
    CLAUDE_API_KEY: "claudeApiKey",
    GEMINI_API_KEY: "geminiApiKey",
    OLLAMA_URL: "ollamaUrl",
    API_KEY: "apiKey",
    // legacy
    MODEL: "model",
    // legacy
    CLAUDE_MODEL: "claudeModel",
    GEMINI_MODEL: "geminiModel",
    OLLAMA_MODEL: "ollamaModel",
    ENABLED: "enabled",
    TARGET_LANG: "targetLang",
    DISPLAY_MODE: "displayMode",
    STYLE_FONT_SIZE: "styleFontSize",
    STYLE_FONT_COLOR: "styleFontColor",
    STYLE_BG_COLOR: "styleBgColor",
    STYLE_BG_ENABLED: "styleBgEnabled",
    STYLE_BG_OPACITY: "styleBgOpacity",
    STYLE_EXPANDED: "styleExpanded"
  };
  var CHUNK_SIZE = 40;
  var OLLAMA_CHUNK_SIZE = 10;
  var SELECTORS = {
    panel: '[data-purpose="transcript-panel"]',
    cueActive: 'p[data-purpose="transcript-cue-active"]',
    cueAll: 'p[data-purpose="transcript-cue"], p[data-purpose="transcript-cue-active"]',
    cueText: 'span[data-purpose="cue-text"]'
  };
  var LECTURE_SELECTORS = {
    currentItem: 'li[aria-current="true"] span[data-purpose="item-title"]',
    sectionPanel: 'div[data-purpose^="section-panel-"]',
    sectionTitle: "span.ud-accordion-panel-title"
  };
  var CAPTION_SELECTOR = '[data-purpose="captions-cue-text"]';
  var ORIGINAL_CLASS = "udemy-translator-original";
  var SETTLE_DELAY_MS = 1500;
  var STYLE_CHANGE_KEYS = /* @__PURE__ */ new Set([
    STORAGE_KEYS.STYLE_FONT_SIZE,
    STORAGE_KEYS.STYLE_FONT_COLOR,
    STORAGE_KEYS.STYLE_BG_COLOR,
    STORAGE_KEYS.STYLE_BG_ENABLED,
    STORAGE_KEYS.STYLE_BG_OPACITY,
    STORAGE_KEYS.DISPLAY_MODE,
    STORAGE_KEYS.ENABLED
  ]);

  // src/shared/utils.js
  function hexToRgba(hex, opacity) {
    const r = parseInt(hex.slice(1, 3), 16);
    const g = parseInt(hex.slice(3, 5), 16);
    const b = parseInt(hex.slice(5, 7), 16);
    return `rgba(${r}, ${g}, ${b}, ${opacity / 100})`;
  }

  // src/presentation/content/style-manager.js
  var currentStyle = {
    fontSize: 14,
    fontColor: "#ffffff",
    bgColor: "#1e293b",
    bgOpacity: 80,
    bgEnabled: true,
    displayMode: "translation"
  };
  async function loadStyle() {
    const stored = await chrome.storage.local.get([
      STORAGE_KEYS.STYLE_FONT_SIZE,
      STORAGE_KEYS.STYLE_FONT_COLOR,
      STORAGE_KEYS.STYLE_BG_COLOR,
      STORAGE_KEYS.STYLE_BG_ENABLED,
      STORAGE_KEYS.STYLE_BG_OPACITY,
      STORAGE_KEYS.DISPLAY_MODE
    ]);
    currentStyle.fontSize = stored[STORAGE_KEYS.STYLE_FONT_SIZE] ?? 14;
    currentStyle.fontColor = stored[STORAGE_KEYS.STYLE_FONT_COLOR] ?? "#ffffff";
    currentStyle.bgColor = stored[STORAGE_KEYS.STYLE_BG_COLOR] ?? "#1e293b";
    currentStyle.bgOpacity = stored[STORAGE_KEYS.STYLE_BG_OPACITY] ?? 80;
    currentStyle.bgEnabled = stored[STORAGE_KEYS.STYLE_BG_ENABLED] ?? true;
    currentStyle.displayMode = stored[STORAGE_KEYS.DISPLAY_MODE] ?? "translation";
  }
  function updateDynamicStyles() {
    let styleEl = document.getElementById("udemy-translator-dynamic-style");
    if (!styleEl) {
      styleEl = document.createElement("style");
      styleEl.id = "udemy-translator-dynamic-style";
      document.head.appendChild(styleEl);
    }
    const bgCaption = currentStyle.bgEnabled ? `background-color: ${hexToRgba(currentStyle.bgColor, currentStyle.bgOpacity)} !important; padding: 4px 10px !important; border-radius: 4px !important;` : "";
    styleEl.textContent = `
    /* \uBC88\uC5ED\uB41C cue-text \uC2A4\uD0C0\uC77C (\uD2B8\uB79C\uC2A4\uD06C\uB9BD\uD2B8 \uD328\uB110) \u2014 \uD770 \uBC30\uACBD\uC774\uBBC0\uB85C \uAC80\uC740 \uAE00\uC528 */
    ${SELECTORS.cueText}[data-original] {
      font-size: ${currentStyle.fontSize}px !important;
      color: #1a1a1a !important;
    }
    /* \uBE44\uB514\uC624 \uCEA1\uC158 \uC2A4\uD0C0\uC77C \u2014 \uC5B4\uB450\uC6B4 \uBC30\uACBD + \uBC1D\uC740 \uAE00\uC528 */
    ${CAPTION_SELECTOR} {
      font-size: ${currentStyle.fontSize * 1.5}px !important;
      color: ${currentStyle.fontColor} !important;
      opacity: 1 !important;
      ${bgCaption}
    }
    /* \uC6D0\uBCF8 \uD14D\uC2A4\uD2B8 (both \uBAA8\uB4DC\uC5D0\uC11C \uBCF4\uC870 \uD45C\uC2DC) */
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
    /* \uCEA1\uC158 both \uBAA8\uB4DC: \uC6D0\uBCF8 \uD14D\uC2A4\uD2B8 (\uBC88\uC5ED \uC544\uB798 \uC791\uAC8C \uD45C\uC2DC) */
    .caption-original {
      font-size: ${Math.round(currentStyle.fontSize * 1.1)}px !important;
      color: rgba(255, 255, 255, 0.6) !important;
      margin-top: 4px;
    }
  `;
  }

  // src/domain/error-messages.js
  function errorToMessage(error) {
    if (!error) return "\u26A0 \uBC88\uC5ED \uC2E4\uD328";
    if (error === "RATE_LIMIT") return "\u26A0 API \uD560\uB2F9\uB7C9 \uCD08\uACFC";
    if (error === "NO_API_KEY") return "\u26A0 API \uD0A4\uB97C \uC124\uC815\uD558\uC138\uC694";
    if (error === "DISABLED") return "";
    if (error === "PARSE_ERROR") return "\u26A0 \uC751\uB2F5 \uD30C\uC2F1 \uC2E4\uD328";
    if (error.startsWith("API_ERROR:")) {
      const parts = error.split(":");
      return `\u26A0 API \uC624\uB958 (${parts[1]})`;
    }
    return `\u26A0 ${error}`;
  }

  // src/presentation/content/caption-manager.js
  var captionObserver = null;
  var captionFinderObserver = null;
  var currentCaptionEl = null;
  var captionReplacePaused = false;
  function buildTranslationMap() {
    const map = /* @__PURE__ */ new Map();
    document.querySelectorAll(`${SELECTORS.cueText}[data-translated]`).forEach((span) => {
      if (span.dataset.original && span.dataset.translated) {
        map.set(span.dataset.original.trim(), span.dataset.translated);
      }
    });
    return map;
  }
  function replaceCaptionText(captionEl) {
    if (!captionEl || captionReplacePaused) return;
    if (currentStyle.displayMode === "original") return;
    const subSpan = captionEl.querySelector(".caption-original");
    const originalText = subSpan ? captionEl.childNodes[0]?.textContent?.trim() || captionEl.textContent.trim() : captionEl.textContent.trim();
    if (!originalText) return;
    const translationMap = buildTranslationMap();
    const translated = translationMap.get(originalText);
    if (!translated) return;
    captionReplacePaused = true;
    if (currentStyle.displayMode === "both") {
      captionEl.innerHTML = "";
      captionEl.appendChild(document.createTextNode(translated));
      const origLine = document.createElement("div");
      origLine.className = "caption-original";
      origLine.textContent = originalText;
      captionEl.appendChild(origLine);
    } else {
      captionEl.textContent = translated;
    }
    captionReplacePaused = false;
  }
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
  function initCaptionFinder() {
    if (captionFinderObserver) captionFinderObserver.disconnect();
    currentCaptionEl = null;
    const existing = document.querySelector(CAPTION_SELECTOR);
    if (existing) observeCaption(existing);
    captionFinderObserver = new MutationObserver((mutations) => {
      const relevant = mutations.some(
        (m) => Array.from(m.addedNodes).some(
          (n) => n.nodeType === 1 && (n.matches?.(CAPTION_SELECTOR) || n.querySelector?.(CAPTION_SELECTOR))
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
  function cleanup() {
    if (captionObserver) captionObserver.disconnect();
    if (captionFinderObserver) captionFinderObserver.disconnect();
    currentCaptionEl = null;
  }

  // src/presentation/content/transcript-manager.js
  var observer = null;
  var panelFinderObserver = null;
  var currentPanel = null;
  var isBatchTranslating = false;
  var settleTimer = null;
  var observerPaused = false;
  function getLectureContext() {
    const result = { lecture: "", section: "" };
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
  function applyDisplayMode(container) {
    const cueTextSpan = container.querySelector(SELECTORS.cueText);
    if (!cueTextSpan) return;
    const parent = cueTextSpan.closest("p") || cueTextSpan.parentElement;
    const originalEl = parent.querySelector(`.${ORIGINAL_CLASS}`);
    const hasTranslation = cueTextSpan.dataset.original;
    if (!hasTranslation) return;
    if (currentStyle.displayMode === "original") {
      cueTextSpan.textContent = cueTextSpan.dataset.original;
      if (originalEl) originalEl.style.display = "none";
    } else if (currentStyle.displayMode === "translation") {
      cueTextSpan.textContent = cueTextSpan.dataset.translated || cueTextSpan.dataset.original;
      if (originalEl) originalEl.style.display = "none";
    } else {
      cueTextSpan.textContent = cueTextSpan.dataset.translated || cueTextSpan.dataset.original;
      if (originalEl) originalEl.style.display = "";
    }
  }
  function applyDisplayModeAll() {
    const panel = document.querySelector(SELECTORS.panel);
    if (!panel) return;
    observerPaused = true;
    panel.querySelectorAll(SELECTORS.cueAll).forEach((cue) => {
      const container = cue.closest('[class*="cue-container"]') || cue;
      applyDisplayMode(container);
    });
    observerPaused = false;
  }
  function getOrCreateOriginalEl(textSpan) {
    const next = textSpan.nextElementSibling;
    if (next?.classList.contains(ORIGINAL_CLASS)) return next;
    const parent = textSpan.closest("p") || textSpan.parentElement;
    const existing = parent.querySelectorAll(`.${ORIGINAL_CLASS}`);
    if (existing.length > 1) {
      for (let i = 1; i < existing.length; i++) existing[i].remove();
    }
    if (existing.length > 0) return existing[0];
    const el = document.createElement("span");
    el.className = ORIGINAL_CLASS;
    textSpan.after(el);
    return el;
  }
  function collectCues(panel) {
    const cues = panel.querySelectorAll(SELECTORS.cueAll);
    const items = [];
    cues.forEach((cue) => {
      const textSpan = cue.querySelector(SELECTORS.cueText);
      if (!textSpan) return;
      const text = textSpan.dataset.original || textSpan.textContent.trim();
      if (!text) return;
      const container = cue.closest('[class*="cue-container"]') || cue;
      items.push({ text, container, textSpan });
    });
    return items;
  }
  function getUntranslatedCues(cueItems) {
    return cueItems.filter(({ textSpan }) => {
      if (textSpan.dataset.original) return false;
      const parent = textSpan.closest("p") || textSpan.parentElement;
      const origEl = parent.querySelector(`.${ORIGINAL_CLASS}`);
      if (origEl) return false;
      return true;
    });
  }
  function applyTranslation(textSpan, container, translation) {
    if (!textSpan.dataset.original) {
      textSpan.dataset.original = textSpan.textContent.trim();
    }
    textSpan.dataset.translated = translation;
    if (currentStyle.displayMode !== "original") {
      textSpan.textContent = translation;
    }
    const originalEl = getOrCreateOriginalEl(textSpan);
    originalEl.textContent = textSpan.dataset.original;
    originalEl.classList.remove("loading", "error");
    applyDisplayMode(container);
  }
  function applyLoading(textSpan, container, msg) {
    const originalEl = getOrCreateOriginalEl(textSpan);
    originalEl.textContent = msg;
    originalEl.classList.add("loading");
    originalEl.classList.remove("error");
  }
  function applyError(textSpan, container, errorMsg) {
    const originalEl = getOrCreateOriginalEl(textSpan);
    originalEl.textContent = errorMsg;
    originalEl.classList.remove("loading");
    originalEl.classList.add("error");
  }
  function buildTextToCueMap(cueItems) {
    const map = /* @__PURE__ */ new Map();
    for (const item of cueItems) {
      if (!map.has(item.text)) map.set(item.text, []);
      map.get(item.text).push(item);
    }
    return map;
  }
  function applyChunkResults(chunkTexts, response, textToCues) {
    if (!response || response.error) {
      const errMsg = errorToMessage(response?.error || "UNKNOWN");
      observerPaused = true;
      for (const text of chunkTexts) {
        for (const { textSpan, container } of textToCues.get(text) || []) {
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
      for (const { textSpan, container } of textToCues.get(chunkTexts[i]) || []) {
        if (result?.translation) {
          applyTranslation(textSpan, container, result.translation);
        } else {
          applyError(textSpan, container, errorToMessage(result?.error));
        }
      }
    }
    observerPaused = false;
    const captionEl = document.querySelector(CAPTION_SELECTOR);
    if (captionEl) replaceCaptionText(captionEl);
  }
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
    const uniqueTexts = [...new Set(untranslated.map((c) => c.text))];
    const textToCues = buildTextToCueMap(untranslated);
    observerPaused = true;
    for (const { textSpan, container } of untranslated) {
      applyLoading(textSpan, container, "\uBC88\uC5ED \uC911...");
    }
    observerPaused = false;
    const { provider } = await chrome.storage.local.get(STORAGE_KEYS.PROVIDER);
    const chunkSize = (provider || "ollama") === "ollama" ? OLLAMA_CHUNK_SIZE : CHUNK_SIZE;
    const chunks = [];
    for (let i = 0; i < uniqueTexts.length; i += chunkSize) {
      chunks.push(uniqueTexts.slice(i, i + chunkSize));
    }
    const ctx = getLectureContext();
    console.log(`[UdemyTranslator] ${uniqueTexts.length} texts \u2192 ${chunks.length} chunks (size=${chunkSize})`);
    for (let idx = 0; idx < chunks.length; idx++) {
      const chunk = chunks[idx];
      try {
        const response = await chrome.runtime.sendMessage({
          type: "TRANSLATE_BATCH",
          texts: chunk,
          lecture: ctx.lecture,
          section: ctx.section
        });
        applyChunkResults(chunk, response, textToCues);
        console.log(`[UdemyTranslator] Chunk ${idx + 1}/${chunks.length} applied`);
      } catch (err) {
        observerPaused = true;
        for (const text of chunk) {
          for (const { textSpan, container } of textToCues.get(text) || []) {
            applyError(textSpan, container, "\u26A0 \uC5F0\uACB0 \uC624\uB958");
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
  function scheduleTranslation(panel) {
    clearTimeout(settleTimer);
    settleTimer = setTimeout(() => {
      const untranslated = getUntranslatedCues(collectCues(panel));
      if (untranslated.length > 0) {
        translateAllCues(panel);
      }
    }, SETTLE_DELAY_MS);
  }
  function initPanel(panel) {
    if (currentPanel === panel && observer) return;
    if (observer) observer.disconnect();
    currentPanel = panel;
    scheduleTranslation(panel);
    observer = new MutationObserver((mutations) => {
      if (observerPaused || isBatchTranslating) return;
      const hasNewCue = mutations.some(
        (m) => m.type === "childList" && Array.from(m.addedNodes).some(
          (n) => n.nodeType === 1 && (n.matches?.('[class*="cue-container"]') || n.querySelector?.('[data-purpose="cue-text"]'))
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
  function initPanelFinder() {
    if (panelFinderObserver) panelFinderObserver.disconnect();
    currentPanel = null;
    const existing = document.querySelector(SELECTORS.panel);
    console.log("[UdemyTranslator] initPanelFinder, panel:", existing ? "FOUND" : "NOT FOUND");
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
  function removeAllTranslations() {
    observerPaused = true;
    document.querySelectorAll(`${SELECTORS.cueText}[data-original]`).forEach((span) => {
      span.textContent = span.dataset.original;
      delete span.dataset.original;
      delete span.dataset.translated;
    });
    document.querySelectorAll(`.${ORIGINAL_CLASS}`).forEach((el) => el.remove());
    observerPaused = false;
  }
  async function retranslateAll() {
    console.log("[UdemyTranslator] retranslateAll() called");
    const panel = document.querySelector(SELECTORS.panel);
    if (!panel) return { count: 0 };
    const cueItems = collectCues(panel);
    if (cueItems.length === 0) return { count: 0 };
    const stored = await chrome.storage.local.get([STORAGE_KEYS.TARGET_LANG]);
    const lang = stored[STORAGE_KEYS.TARGET_LANG] || "\uD55C\uAD6D\uC5B4";
    const ctx = getLectureContext();
    // 1) 현재 강의 캐시 삭제 (L1 + L2)
    await chrome.runtime.sendMessage({
      type: "CLEAR_LECTURE_CACHE",
      lang,
      lecture: ctx.lecture,
      section: ctx.section
    });
    console.log("[UdemyTranslator] retranslateAll: lecture cache cleared");
    // 2) DOM에서 번역 상태 초기화 (원본 복원)
    observerPaused = true;
    for (const { textSpan } of cueItems) {
      if (textSpan.dataset.original) {
        textSpan.textContent = textSpan.dataset.original;
        delete textSpan.dataset.original;
        delete textSpan.dataset.translated;
      }
      const parent = textSpan.closest("p") || textSpan.parentElement;
      parent.querySelectorAll(`.${ORIGINAL_CLASS}`).forEach((el) => el.remove());
    }
    observerPaused = false;
    // 3) 일반 번역 흐름으로 전체 재번역
    await translateAllCues(panel);
    const translated = collectCues(panel).filter(({ textSpan }) => textSpan.dataset.original);
    const count = translated.length;
    console.log(`[UdemyTranslator] retranslateAll: ${count} items translated`);
    return { count };
  }
  function cleanup2() {
    if (observer) observer.disconnect();
    if (panelFinderObserver) panelFinderObserver.disconnect();
    currentPanel = null;
    clearTimeout(settleTimer);
    isBatchTranslating = false;
  }

  // src/presentation/content/navigation-handler.js
  function onNavigate() {
    cleanup2();
    cleanup();
    setTimeout(() => {
      initPanelFinder();
      initCaptionFinder();
    }, 1e3);
  }
  function setupNavigationHandler() {
    if (typeof navigation !== "undefined") {
      navigation.addEventListener("navigate", onNavigate);
    } else {
      window.addEventListener("popstate", onNavigate);
      window.addEventListener("hashchange", onNavigate);
      const origPushState = history.pushState.bind(history);
      const origReplaceState = history.replaceState.bind(history);
      history.pushState = function(...args) {
        origPushState(...args);
        onNavigate();
      };
      history.replaceState = function(...args) {
        origReplaceState(...args);
        onNavigate();
      };
    }
  }

  // content.src.js
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== "local") return;
    if (changes[STORAGE_KEYS.ENABLED]) {
      if (changes[STORAGE_KEYS.ENABLED].newValue === false) {
        removeAllTranslations();
        return;
      }
      const panel = document.querySelector(SELECTORS.panel);
      if (panel) scheduleTranslation(panel);
    }
    const hasStyleChange = Object.keys(changes).some((k) => STYLE_CHANGE_KEYS.has(k));
    if (hasStyleChange) {
      loadStyle().then(() => {
        updateDynamicStyles();
        applyDisplayModeAll();
      });
    }
  });
  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.type === "RETRANSLATE_ALL") {
      retranslateAll().then(sendResponse);
      return true;
    }
    if (message.type === "GET_LECTURE_INFO") {
      sendResponse(getLectureContext());
    }
  });
  setupNavigationHandler();
  console.log("[UdemyTranslator] content script loaded");
  loadStyle().then(() => {
    console.log("[UdemyTranslator] style loaded, initializing...");
    updateDynamicStyles();
    initPanelFinder();
    initCaptionFinder();
  }).catch((err) => {
    console.error("[UdemyTranslator] loadStyle failed:", err);
  });
})();
