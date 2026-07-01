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
    STYLE_PANEL_COLOR: "stylePanelColor",
    STYLE_PANEL_COLOR_ENABLED: "stylePanelColorEnabled",
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
    STORAGE_KEYS.STYLE_PANEL_COLOR,
    STORAGE_KEYS.STYLE_PANEL_COLOR_ENABLED,
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
    panelColor: "#1a1a1a",
    panelColorEnabled: false,
    displayMode: "translation"
  };
  async function loadStyle() {
    const stored = await chrome.storage.local.get([
      STORAGE_KEYS.STYLE_FONT_SIZE,
      STORAGE_KEYS.STYLE_FONT_COLOR,
      STORAGE_KEYS.STYLE_BG_COLOR,
      STORAGE_KEYS.STYLE_BG_ENABLED,
      STORAGE_KEYS.STYLE_BG_OPACITY,
      STORAGE_KEYS.DISPLAY_MODE,
      STORAGE_KEYS.STYLE_PANEL_COLOR,
      STORAGE_KEYS.STYLE_PANEL_COLOR_ENABLED
    ]);
    currentStyle.fontSize = stored[STORAGE_KEYS.STYLE_FONT_SIZE] ?? 14;
    currentStyle.fontColor = stored[STORAGE_KEYS.STYLE_FONT_COLOR] ?? "#ffffff";
    currentStyle.bgColor = stored[STORAGE_KEYS.STYLE_BG_COLOR] ?? "#1e293b";
    currentStyle.bgOpacity = stored[STORAGE_KEYS.STYLE_BG_OPACITY] ?? 80;
    currentStyle.bgEnabled = stored[STORAGE_KEYS.STYLE_BG_ENABLED] ?? true;
    currentStyle.panelColor = stored[STORAGE_KEYS.STYLE_PANEL_COLOR] ?? "#1a1a1a";
    currentStyle.panelColorEnabled = stored[STORAGE_KEYS.STYLE_PANEL_COLOR_ENABLED] ?? false;
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
    /* \uBC88\uC5ED\uB41C cue-text \uC2A4\uD0C0\uC77C (\uD2B8\uB79C\uC2A4\uD06C\uB9BD\uD2B8 \uD328\uB110).
       \uAE00\uC790 \uD06C\uAE30\uB294 \uC720\uB370\uBBF8 \uAE30\uBCF8\uAC12 \uC720\uC9C0 (\uC2AC\uB77C\uC774\uB354\uB294 \uBE44\uB514\uC624 \uCEA1\uC158\uC5D0\uB9CC \uC801\uC6A9).
       \uAE00\uC790\uC0C9\uC740 \uAE30\uBCF8\uC801\uC73C\uB85C \uC720\uB370\uBBF8 \uAE30\uBCF8\uC0C9 \uC0AC\uC6A9, \uC0AC\uC6A9\uC790\uAC00 \uCF30\uC744 \uB54C\uB9CC \uC624\uBC84\uB77C\uC774\uB4DC */
    ${SELECTORS.cueText}[data-original] {
      ${currentStyle.panelColorEnabled ? `color: ${currentStyle.panelColor} !important;` : ""}
    }
    /* \uBE44\uB514\uC624 \uCEA1\uC158 \uC2A4\uD0C0\uC77C \u2014 \uC5B4\uB450\uC6B4 \uBC30\uACBD + \uBC1D\uC740 \uAE00\uC528 */
    ${CAPTION_SELECTOR} {
      font-size: ${currentStyle.fontSize * 1.5}px !important;
      color: ${currentStyle.fontColor} !important;
      opacity: 1 !important;
      ${bgCaption}
    }
    /* \uC6D0\uBCF8 \uD14D\uC2A4\uD2B8 (\uD2B8\uB79C\uC2A4\uD06C\uB9BD\uD2B8 \uD328\uB110 both \uBAA8\uB4DC\uC5D0\uC11C \uBC88\uC5ED \uC544\uB798 \uBCF4\uC870 \uD45C\uC2DC).
       \uD328\uB110 \uBC88\uC5ED \uD14D\uC2A4\uD2B8(\uC720\uB370\uBBF8 \uAE30\uBCF8 ~16px)\uC758 \uC57D 87% \uD06C\uAE30\uB85C \uBCF4\uC870 \uAC00\uB3C5\uC131 \uD655\uBCF4 */
    .${ORIGINAL_CLASS} {
      font-size: 14px !important;
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

  // src/infrastructure/vtt/vtt-parser.js
  var _decoder = document.createElement("textarea");
  function decodeHtmlEntities(str) {
    _decoder.innerHTML = str;
    return _decoder.value;
  }
  function parseVtt(vttText) {
    const cleaned = vttText.replace(/^\uFEFF/, "");
    const blocks = cleaned.split(/\n\s*\n/).filter((b) => b.trim());
    const cues = [];
    for (const block of blocks) {
      const lines = block.trim().split("\n");
      let timestampIdx = -1;
      for (let i = 0; i < lines.length; i++) {
        if (lines[i].includes("-->")) {
          timestampIdx = i;
          break;
        }
      }
      if (timestampIdx === -1) continue;
      const timeParts = lines[timestampIdx].split("-->");
      if (timeParts.length < 2) continue;
      const startTime = timeParts[0].trim();
      const endTime = timeParts[1].trim().split(/\s/)[0];
      const textLines = lines.slice(timestampIdx + 1);
      const raw = textLines.join(" ").replace(/<[^>]+>/g, "").replace(/\s+/g, " ").trim();
      const text = decodeHtmlEntities(raw);
      if (text) {
        cues.push({ startTime, endTime, text });
      }
    }
    return cues;
  }

  // src/presentation/content/vtt-bridge.js
  var vttTranslationStore = /* @__PURE__ */ new Map();
  var processedUrls = /* @__PURE__ */ new Set();
  var vttPending = false;
  function initVttBridge() {
    window.addEventListener("message", async (event) => {
      if (event.source !== window) return;
      if (event.data?.type !== "UDEMY_VTT_CAPTURED") return;
      const { vttText, url } = event.data;
      if (processedUrls.has(url)) return;
      processedUrls.add(url);
      console.log(`[UdemyTranslator:VTT] captured: ${url}`);
      vttPending = true;
      try {
        const cues = parseVtt(vttText);
        if (cues.length === 0) {
          console.warn("[UdemyTranslator:VTT] no cues parsed");
          return;
        }
        const uniqueTexts = [...new Set(cues.map((c) => c.text))];
        console.log(`[UdemyTranslator:VTT] ${cues.length} cues, ${uniqueTexts.length} unique texts`);
        await requestTranslations(uniqueTexts);
        document.dispatchEvent(new Event("vtt-translations-ready"));
      } catch (err) {
        console.error(`[UdemyTranslator:VTT] error: ${err.message}`);
      } finally {
        vttPending = false;
      }
    });
  }
  async function requestTranslations(texts) {
    const uniqueTexts = [...new Set(texts)].filter(Boolean);
    if (uniqueTexts.length === 0) return 0;
    const ctx = getLectureContext();
    const response = await chrome.runtime.sendMessage({
      type: "TRANSLATE_BATCH",
      texts: uniqueTexts,
      course: ctx.course,
      lecture: ctx.lecture,
      section: ctx.section
    });
    if (response?.error) {
      console.error(`[UdemyTranslator:VTT] translation error: ${response.error}`);
      return 0;
    }
    const results = response?.results || [];
    let cachedCount = 0;
    let freshCount = 0;
    for (let i = 0; i < uniqueTexts.length; i++) {
      if (results[i]?.translation) {
        vttTranslationStore.set(uniqueTexts[i], results[i].translation);
        if (results[i].cached) cachedCount++;
        else freshCount++;
      }
    }
    console.log(`[UdemyTranslator:VTT] ${freshCount + cachedCount}/${uniqueTexts.length} translations stored (cache hit: ${cachedCount}, fresh: ${freshCount})`);
    return freshCount + cachedCount;
  }
  function getVttTranslation(text) {
    return vttTranslationStore.get(text) || null;
  }
  function forgetVttTranslations(texts) {
    for (const text of texts) vttTranslationStore.delete(text);
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
  var translationMapCache = /* @__PURE__ */ new Map();
  function updateCaptionCache(original, translated) {
    translationMapCache.set(original, translated);
  }
  function clearCaptionCache() {
    translationMapCache.clear();
  }
  function replaceCaptionText(captionEl) {
    if (!captionEl) return;
    if (currentStyle.displayMode === "original") return;
    const subSpan = captionEl.querySelector(".caption-original");
    const originalText = subSpan ? captionEl.childNodes[0]?.textContent?.trim() || captionEl.textContent.trim() : captionEl.textContent.trim();
    if (!originalText) return;
    const translated = translationMapCache.get(originalText) || getVttTranslation(originalText);
    if (!translated) return;
    if (captionObserver) captionObserver.disconnect();
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
    if (captionObserver && currentCaptionEl) {
      captionObserver.observe(currentCaptionEl, {
        childList: true,
        characterData: true,
        subtree: true
      });
    }
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
  var settleTimer = null;
  var PANEL_OBSERVE_OPTS = { childList: true, subtree: true };
  function pauseObserver() {
    if (observer) observer.disconnect();
  }
  function resumeObserver() {
    if (observer && currentPanel) observer.observe(currentPanel, PANEL_OBSERVE_OPTS);
  }
  function getLectureContext() {
    const result = { course: "", lecture: "", section: "" };
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
    pauseObserver();
    panel.querySelectorAll(SELECTORS.cueAll).forEach((cue) => {
      const container = cue.closest('[class*="cue-container"]') || cue;
      applyDisplayMode(container);
    });
    resumeObserver();
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
    updateCaptionCache(textSpan.dataset.original, translation);
    if (currentStyle.displayMode !== "original") {
      textSpan.textContent = translation;
    }
    const originalEl = getOrCreateOriginalEl(textSpan);
    originalEl.textContent = textSpan.dataset.original;
    applyDisplayMode(container);
  }
  var isApplying = false;
  function applyVttTranslations(panel) {
    if (isApplying) return;
    isApplying = true;
    pauseObserver();
    try {
      const cueItems = collectCues(panel);
      getUntranslatedCues(cueItems);
      const captionEl = document.querySelector(CAPTION_SELECTOR);
      if (captionEl) replaceCaptionText(captionEl);
    } finally {
      resumeObserver();
      isApplying = false;
    }
  }
  document.addEventListener("vtt-translations-ready", () => {
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
      const hasNewCue = mutations.some(
        (m) => m.type === "childList" && Array.from(m.addedNodes).some(
          (n) => n.nodeType === 1 && (n.matches?.('[class*="cue-container"]') || n.querySelector?.('[data-purpose="cue-text"]'))
        )
      );
      if (hasNewCue) {
        scheduleTranslation(panel);
      }
    });
    observer.observe(panel, PANEL_OBSERVE_OPTS);
  }
  function initPanelFinder() {
    if (panelFinderObserver) panelFinderObserver.disconnect();
    currentPanel = null;
    const existing = document.querySelector(SELECTORS.panel);
    console.log("[UdemyTranslator] initPanelFinder, panel:", existing ? "FOUND" : "NOT FOUND");
    if (existing) initPanel(existing);
    panelFinderObserver = new MutationObserver((mutations) => {
      const relevant = mutations.some(
        (m) => [...m.addedNodes, ...m.removedNodes].some(
          (n) => n.nodeType === 1 && (n.matches?.('[data-purpose="transcript-panel"]') || n.querySelector?.('[data-purpose="transcript-panel"]'))
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
  function removeAllTranslations() {
    pauseObserver();
    document.querySelectorAll(`${SELECTORS.cueText}[data-original]`).forEach((span) => {
      span.textContent = span.dataset.original;
      delete span.dataset.original;
      delete span.dataset.translated;
    });
    document.querySelectorAll(`.${ORIGINAL_CLASS}`).forEach((el) => el.remove());
    clearCaptionCache();
    resumeObserver();
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
    const texts = cueItems.map(({ text }) => text);
    await chrome.runtime.sendMessage({
      type: "CLEAR_LECTURE_CACHE",
      lang,
      course: ctx.course,
      lecture: ctx.lecture,
      section: ctx.section
    });
    forgetVttTranslations(texts);
    pauseObserver();
    for (const { textSpan } of cueItems) {
      if (textSpan.dataset.original) {
        textSpan.textContent = textSpan.dataset.original;
        delete textSpan.dataset.original;
        delete textSpan.dataset.translated;
      }
      const parent = textSpan.closest("p") || textSpan.parentElement;
      parent.querySelectorAll(`.${ORIGINAL_CLASS}`).forEach((el) => el.remove());
    }
    clearCaptionCache();
    resumeObserver();
    await requestTranslations(texts);
    applyVttTranslations(panel);
    const translated = collectCues(panel).filter(({ textSpan }) => textSpan.dataset.original);
    return { count: translated.length };
  }
  function cleanup2() {
    if (observer) observer.disconnect();
    if (panelFinderObserver) panelFinderObserver.disconnect();
    currentPanel = null;
    clearTimeout(settleTimer);
    clearCaptionCache();
  }

  // src/presentation/content/navigation-handler.js
  function onNavigate() {
    clearVttStore();
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
    initVttBridge();
    initPanelFinder();
    initCaptionFinder();
  }).catch((err) => {
    console.error("[UdemyTranslator] loadStyle failed:", err);
  });
})();
