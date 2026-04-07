(() => {
  // src/domain/constants.js
  var STORAGE_KEYS = {
    PROVIDER: "provider",
    CLAUDE_API_KEY: "claudeApiKey",
    GEMINI_API_KEY: "geminiApiKey",
    CLAUDE_CODE_URL: "claudeCodeUrl",
    API_KEY: "apiKey",
    // legacy
    MODEL: "model",
    // legacy
    CLAUDE_MODEL: "claudeModel",
    GEMINI_MODEL: "geminiModel",
    CLAUDE_CODE_MODEL: "claudeCodeModel",
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
  var SELECTORS = {
    panel: '[data-purpose="transcript-panel"]',
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
    ${SELECTORS.cueText}[data-original] {
      font-size: ${currentStyle.fontSize}px !important;
      color: #1a1a1a !important;
    }
    ${CAPTION_SELECTOR} {
      font-size: ${currentStyle.fontSize * 1.5}px !important;
      color: ${currentStyle.fontColor} !important;
      opacity: 1 !important;
      ${bgCaption}
    }
    .${ORIGINAL_CLASS} {
      font-size: 11px !important;
      color: #999 !important;
      display: block;
      margin-top: 2px;
    }
    .caption-original {
      font-size: ${Math.round(currentStyle.fontSize * 1.1)}px !important;
      color: rgba(255, 255, 255, 0.6) !important;
      margin-top: 4px;
    }
  `;
  }

  // src/infrastructure/vtt/vtt-parser.js
  function decodeHtmlEntities(str) {
    var el = document.createElement("textarea");
    el.innerHTML = str;
    return el.value;
  }
  function parseVtt(vttText) {
    var cleaned = vttText.replace(/^\uFEFF/, "");
    var blocks = cleaned.split(/\n\s*\n/).filter(function(b) { return b.trim(); });
    var cues = [];
    for (var _i = 0; _i < blocks.length; _i++) {
      var block = blocks[_i];
      var lines = block.trim().split("\n");
      var timestampIdx = -1;
      for (var i = 0; i < lines.length; i++) {
        if (lines[i].includes("-->")) { timestampIdx = i; break; }
      }
      if (timestampIdx === -1) continue;
      var timeParts = lines[timestampIdx].split("-->");
      if (timeParts.length < 2) continue;
      var startTime = timeParts[0].trim();
      var endTime = timeParts[1].trim().split(/\s/)[0];
      var textLines = lines.slice(timestampIdx + 1);
      var raw = textLines.join(" ").replace(/<[^>]+>/g, "").replace(/\s+/g, " ").trim();
      var text = decodeHtmlEntities(raw);
      if (text) cues.push({ startTime: startTime, endTime: endTime, text: text });
    }
    return cues;
  }

  // src/presentation/content/vtt-bridge.js
  var vttTranslationStore = /* @__PURE__ */ new Map();
  var processedUrls = /* @__PURE__ */ new Set();
  var vttPending = false;
  function initVttBridge() {
    window.addEventListener("message", async function(event) {
      if (event.source !== window) return;
      if (event.data?.type !== "UDEMY_VTT_CAPTURED") return;
      var vttText = event.data.vttText;
      var url = event.data.url;
      if (processedUrls.has(url)) return;
      processedUrls.add(url);
      console.log("[UdemyTranslator:VTT] captured: " + url);
      vttPending = true;
      try {
        var cues = parseVtt(vttText);
        if (cues.length === 0) { console.warn("[UdemyTranslator:VTT] no cues parsed"); return; }
        var uniqueTexts = [...new Set(cues.map(function(c) { return c.text; }))];
        console.log("[UdemyTranslator:VTT] " + cues.length + " cues, " + uniqueTexts.length + " unique texts");
        var ctx = getLectureContext();
        var response = await chrome.runtime.sendMessage({
          type: "TRANSLATE_BATCH",
          texts: uniqueTexts,
          lecture: ctx.lecture,
          section: ctx.section
        });
        if (response?.error) { console.error("[UdemyTranslator:VTT] translation error: " + response.error); return; }
        var results = response?.results || [];
        for (var i = 0; i < uniqueTexts.length; i++) {
          if (results[i]?.translation) {
            vttTranslationStore.set(uniqueTexts[i], results[i].translation);
          }
        }
        console.log("[UdemyTranslator:VTT] " + vttTranslationStore.size + "/" + uniqueTexts.length + " translations stored");
        document.dispatchEvent(new Event("vtt-translations-ready"));
      } catch (err) {
        console.error("[UdemyTranslator:VTT] error: " + err.message);
      } finally {
        vttPending = false;
      }
    });
  }
  function getVttTranslation(text) {
    return vttTranslationStore.get(text) || null;
  }
  function clearVttStore() {
    vttTranslationStore.clear();
    processedUrls.clear();
    vttPending = false;
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
    const translated = translationMap.get(originalText) || getVttTranslation(originalText);
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
  function cleanupCaption() {
    if (captionObserver) captionObserver.disconnect();
    if (captionFinderObserver) captionFinderObserver.disconnect();
    currentCaptionEl = null;
  }

  // src/presentation/content/transcript-manager.js
  var observer = null;
  var panelFinderObserver = null;
  var currentPanel = null;
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
    return cueItems.filter(({ text, textSpan, container }) => {
      if (textSpan.dataset.original) return false;
      const parent = textSpan.closest("p") || textSpan.parentElement;
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
    applyDisplayMode(container);
  }
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
  document.addEventListener("vtt-translations-ready", function() {
    if (currentPanel) scheduleTranslation(currentPanel);
  });
  function scheduleTranslation(panel) {
    clearTimeout(settleTimer);
    settleTimer = setTimeout(() => {
      applyVttTranslations(panel);
    }, SETTLE_DELAY_MS);
  }
  function initPanel(panel) {
    if (currentPanel === panel && observer) return;
    if (observer) observer.disconnect();
    currentPanel = panel;
    scheduleTranslation(panel);
    observer = new MutationObserver((mutations) => {
      if (observerPaused) return;
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
    await chrome.runtime.sendMessage({
      type: "CLEAR_LECTURE_CACHE",
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
      const parent = textSpan.closest("p") || textSpan.parentElement;
      parent.querySelectorAll(`.${ORIGINAL_CLASS}`).forEach((el) => el.remove());
    }
    observerPaused = false;
    applyVttTranslations(panel);
    const translated = collectCues(panel).filter(({ textSpan }) => textSpan.dataset.original);
    return { count: translated.length };
  }
  function cleanupTranscript() {
    if (observer) observer.disconnect();
    if (panelFinderObserver) panelFinderObserver.disconnect();
    currentPanel = null;
    clearTimeout(settleTimer);
  }

  // src/presentation/content/navigation-handler.js
  function onNavigate() {
    clearVttStore();
    cleanupTranscript();
    cleanupCaption();
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
    initVttBridge();
    initPanelFinder();
    initCaptionFinder();
  }).catch((err) => {
    console.error("[UdemyTranslator] loadStyle failed:", err);
  });
})();
