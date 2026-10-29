(() => {
  // src/domain/constants.js
  var STORAGE_KEYS = {
    PROVIDER: "provider",
    CLAUDE_API_KEY: "claudeApiKey",
    GEMINI_API_KEY: "geminiApiKey",
    CLAUDE_CODE_URL: "claudeCodeUrl",
    // legacy: 단일 프로바이더 시절 키. 아직 마이그레이션/폴백에서 읽힘(settings-controller,
    // storage-adapter) — 제거하면 업그레이드 전 사용자의 저장된 키/모델이 유실된다.
    API_KEY: "apiKey",
    MODEL: "model",
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
    STYLE_EXPANDED: "styleExpanded",
    UI_LANG: "uiLang"
  };
  var L1_MAX_SIZE = 50;
  var MAX_SCRIPT_CHARS = 15e4;
  var AUTO_RETRY_BASE_MS = 3e4;
  var AUTO_RETRY_MAX_DELAY_MS = 5 * 6e4;
  var AUTO_RETRY_MAX_ATTEMPTS = 6;
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
  var OVERLAY_FONTS = [
    [400, "Pretendard-Regular.woff2"],
    [500, "Pretendard-Medium.woff2"],
    [600, "Pretendard-SemiBold.woff2"],
    [700, "Pretendard-Bold.woff2"]
  ];
  function buildFontFaces() {
    if (typeof chrome === "undefined" || !chrome.runtime?.getURL) return "";
    return OVERLAY_FONTS.map(
      ([w, file]) => `@font-face{font-family:"Pretendard";font-weight:${w};font-display:swap;src:url("${chrome.runtime.getURL("fonts/" + file)}") format("woff2");}`
    ).join("\n");
  }
  function updateDynamicStyles() {
    let styleEl = document.getElementById("udemy-translator-dynamic-style");
    if (!styleEl) {
      styleEl = document.createElement("style");
      styleEl.id = "udemy-translator-dynamic-style";
      document.head.appendChild(styleEl);
    }
    const bgCaption = currentStyle.bgEnabled ? `background-color: ${hexToRgba(currentStyle.bgColor, currentStyle.bgOpacity)} !important;` : "";
    styleEl.textContent = `
    ${buildFontFaces()}
    /* \uBC88\uC5ED\uB41C cue-text \uC2A4\uD0C0\uC77C (\uD2B8\uB79C\uC2A4\uD06C\uB9BD\uD2B8 \uD328\uB110).
       \uAE00\uC790 \uD06C\uAE30\uB294 \uC720\uB370\uBBF8 \uAE30\uBCF8\uAC12 \uC720\uC9C0 (\uC2AC\uB77C\uC774\uB354\uB294 \uBE44\uB514\uC624 \uCEA1\uC158\uC5D0\uB9CC \uC801\uC6A9).
       \uAE00\uC790\uC0C9\uC740 \uAE30\uBCF8\uC801\uC73C\uB85C \uC720\uB370\uBBF8 \uAE30\uBCF8\uC0C9 \uC0AC\uC6A9, \uC0AC\uC6A9\uC790\uAC00 \uCF30\uC744 \uB54C\uB9CC \uC624\uBC84\uB77C\uC774\uB4DC */
    ${SELECTORS.cueText}[data-original] {
      ${currentStyle.panelColorEnabled ? `color: ${currentStyle.panelColor} !important;` : ""}
    }
    /* \uBE44\uB514\uC624 \uBC88\uC5ED \uCEA1\uC158 \u2014 \uC5B4\uB450\uC6B4 \uBC30\uACBD + \uBC1D\uC740 \uAE00\uC528 + \uC88C\uCE21 \uBCF4\uB77C \uC561\uC13C\uD2B8 \uBC14 (\uC2DC\uC548 SS2) */
    ${CAPTION_SELECTOR} {
      font-family: "Pretendard", system-ui, -apple-system, sans-serif !important;
      font-size: ${currentStyle.fontSize * 1.5}px !important;
      font-weight: 600 !important;
      color: ${currentStyle.fontColor} !important;
      opacity: 1 !important;
      padding: 7px 18px !important;
      border-radius: 6px !important;
      border-left: 3px solid #B26BFF !important;
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
    /* \uCEA1\uC158 both \uBAA8\uB4DC: \uC6D0\uBCF8 \uC790\uB9C9 \u2014 \uC791\uC740 \uC5B4\uB450\uC6B4 pill (\uC2DC\uC548 SS2) */
    .caption-original {
      font-family: "Pretendard", system-ui, -apple-system, sans-serif !important;
      display: inline-block;
      font-size: ${Math.round(currentStyle.fontSize * 1.3)}px !important;
      font-weight: 400 !important;
      color: rgba(255, 255, 255, 0.72) !important;
      background: rgba(0, 0, 0, 0.72) !important;
      padding: 5px 14px !important;
      border-radius: 6px !important;
      margin-top: 8px;
    }
  `;
  }

  // src/domain/languages.js
  var LANGUAGES = {
    en: { code: "en", endonym: "English", englishName: "English", script: "latin" },
    ko: { code: "ko", endonym: "\uD55C\uAD6D\uC5B4", englishName: "Korean", script: "hangul" },
    ja: { code: "ja", endonym: "\u65E5\u672C\u8A9E", englishName: "Japanese", script: "japanese" },
    zh: { code: "zh", endonym: "\u4E2D\u6587", englishName: "Chinese", script: "chinese" },
    es: { code: "es", endonym: "Espa\xF1ol", englishName: "Spanish", script: "latin" },
    pt: { code: "pt", endonym: "Portugu\xEAs", englishName: "Portuguese", script: "latin" },
    fr: { code: "fr", endonym: "Fran\xE7ais", englishName: "French", script: "latin" },
    de: { code: "de", endonym: "Deutsch", englishName: "German", script: "latin" },
    ru: { code: "ru", endonym: "\u0420\u0443\u0441\u0441\u043A\u0438\u0439", englishName: "Russian", script: "cyrillic" },
    ar: { code: "ar", endonym: "\u0627\u0644\u0639\u0631\u0628\u064A\u0629", englishName: "Arabic", script: "arabic" },
    hi: { code: "hi", endonym: "\u0939\u093F\u0928\u094D\u0926\u0940", englishName: "Hindi", script: "devanagari" },
    id: { code: "id", endonym: "Bahasa Indonesia", englishName: "Indonesian", script: "latin" }
  };
  var DEFAULT_TARGET_CODE = "ko";
  var ENDONYM_TO_CODE = { "English": "en", "\uD55C\uAD6D\uC5B4": "ko", "\u65E5\u672C\u8A9E": "ja", "\u4E2D\u6587": "zh" };
  function scriptOf(code) {
    return LANGUAGES[code]?.script || null;
  }
  function isDistinctiveScript(script) {
    if (!script) return false;
    let n = 0;
    for (const l of Object.values(LANGUAGES)) if (l.script === script) n++;
    return n === 1;
  }
  function resolveCode(value, fallback = DEFAULT_TARGET_CODE) {
    if (!value) return fallback;
    if (LANGUAGES[value]) return value;
    return ENDONYM_TO_CODE[value] || fallback;
  }

  // src/domain/language-detect.js
  var RE_HANGUL = /\p{Script=Hangul}/u;
  var RE_KANA = /\p{Script=Hiragana}|\p{Script=Katakana}/u;
  var RE_HAN = /\p{Script=Han}/u;
  var RE_LATIN = /[A-Za-z]/;
  function dominantScript(text) {
    let hangul = 0, kana = 0, han = 0, latin = 0, total = 0;
    for (const ch of text) {
      if (RE_HANGUL.test(ch)) {
        hangul++;
        total++;
      } else if (RE_KANA.test(ch)) {
        kana++;
        total++;
      } else if (RE_HAN.test(ch)) {
        han++;
        total++;
      } else if (RE_LATIN.test(ch)) {
        latin++;
        total++;
      }
    }
    if (total === 0) return "none";
    if (kana > 0) return "japanese";
    if (hangul / total >= 0.5) return "hangul";
    if (han / total >= 0.5) return "chinese";
    if (latin / total >= 0.5) return "latin";
    return "mixed";
  }
  function isAlreadyTargetLanguage(text, targetCode, sourceCode) {
    if (!text) return false;
    if (sourceCode && sourceCode === targetCode) return true;
    const expected = scriptOf(targetCode);
    if (!expected || !isDistinctiveScript(expected)) return false;
    return dominantScript(text) === expected;
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

  // src/infrastructure/cache/lru-cache.js
  var LRUCache = class {
    constructor(max = L1_MAX_SIZE) {
      this.max = max;
      this.map = /* @__PURE__ */ new Map();
    }
    get(key) {
      if (!this.map.has(key)) return void 0;
      const val = this.map.get(key);
      this.map.delete(key);
      this.map.set(key, val);
      return val;
    }
    set(key, val) {
      if (this.map.has(key)) this.map.delete(key);
      this.map.set(key, val);
      if (this.map.size > this.max) {
        const oldest = this.map.keys().next().value;
        this.map.delete(oldest);
      }
    }
    delete(key) {
      this.map.delete(key);
    }
    clear() {
      this.map.clear();
    }
  };

  // src/domain/sentence-units.js
  var MAX_UNIT_CUES = 3;
  var MAX_UNIT_CHARS = 200;
  var ABBREVIATIONS = /* @__PURE__ */ new Set(["mr", "mrs", "ms", "dr", "vs", "etc", "e.g", "i.e", "jr", "sr"]);
  var NUMBER_ABBREVIATIONS = /* @__PURE__ */ new Set(["no", "fig", "st", "vol", "p"]);
  function sentenceEnds(text) {
    const ends = [];
    const re = /[.?!]+["')\]]*(?=\s|$)/g;
    let m;
    while (m = re.exec(text)) {
      const end = m.index + m[0].length;
      const before = text.slice(0, m.index).match(/([A-Za-z.]+)$/)?.[1]?.toLowerCase();
      const next = text.slice(end).match(/^\s+(\S)/)?.[1];
      if (m[0][0] === "." && before && ABBREVIATIONS.has(before)) continue;
      if (m[0][0] === "." && before && NUMBER_ABBREVIATIONS.has(before) && next && /\d/.test(next)) continue;
      if (next && /[a-z]/.test(next)) continue;
      ends.push(end);
    }
    return ends;
  }
  function buildSentenceUnits(lines) {
    const starts = [];
    let text = "";
    for (const line of lines) {
      if (text) text += " ";
      starts.push(text.length);
      text += line;
    }
    const cueSpan = (i) => [starts[i], starts[i] + lines[i].length];
    const sentences = [];
    let s = 0;
    for (const e of [...sentenceEnds(text), text.length]) {
      const start = text.slice(s, e).search(/\S/);
      if (start !== -1 && e > s) sentences.push([s + start, e]);
      s = e;
    }
    const overlap = (a, b) => Math.max(0, Math.min(a[1], b[1]) - Math.max(a[0], b[0]));
    const sentCues = sentences.map(() => []);
    const cueOwner = lines.map((_, i) => {
      let best = -1, bestLen = 0;
      sentences.forEach((sent, k) => {
        const len = overlap(cueSpan(i), sent);
        if (len > bestLen) {
          best = k;
          bestLen = len;
        }
      });
      return best;
    });
    cueOwner.forEach((k, i) => {
      if (k !== -1) sentCues[k].push(i);
    });
    sentences.forEach((sent, k) => {
      if (sentCues[k].length > 0) return;
      let best = -1, bestLen = 0;
      lines.forEach((_, i) => {
        const len = overlap(cueSpan(i), sent);
        if (len > bestLen) {
          best = i;
          bestLen = len;
        }
      });
      if (best !== -1) sentCues[k].push(best);
    });
    const units = [];
    const unitCues = [];
    sentences.forEach((sent, k) => {
      const cues = sentCues[k];
      if (cues.length === 0) return;
      const len = sent[1] - sent[0];
      const groups = Math.max(Math.ceil(cues.length / MAX_UNIT_CUES), cues.length > 1 ? Math.ceil(len / MAX_UNIT_CHARS) : 1);
      const per = Math.ceil(cues.length / Math.min(groups, cues.length));
      for (let g = 0; g < cues.length; g += per) {
        const part = cues.slice(g, g + per);
        const from = g === 0 ? sent[0] : Math.max(sent[0], cueSpan(part[0])[0]);
        const to = g + per >= cues.length ? sent[1] : Math.min(sent[1], cueSpan(part[part.length - 1])[1]);
        units.push(text.slice(from, to).trim());
        unitCues.push(part);
      }
    });
    const cueUnits = lines.map(() => []);
    unitCues.forEach((cues, u) => cues.forEach((i) => cueUnits[i].push(u)));
    return { units, cueUnits, unitCues };
  }

  // src/presentation/content/vtt-bridge.js
  var buckets = new LRUCache();
  var processedUrls = /* @__PURE__ */ new Set();
  var inFlight = /* @__PURE__ */ new Set();
  var pendingRequests = /* @__PURE__ */ new Map();
  var requestSeq = 0;
  var lectureScripts = new LRUCache();
  function setLectureScript(lines, source, times) {
    const id = currentLectureId();
    const existing = lectureScripts.get(id);
    if (existing && (existing.source === "vtt" || source === "dom")) return;
    const keep = lines.map((l, i) => !!l && l !== lines[i - 1]);
    const deduped = lines.filter((_, i) => keep[i]);
    if (deduped.length === 0) return;
    const positions = /* @__PURE__ */ new Map();
    deduped.forEach((l, i) => {
      if (!positions.has(l)) positions.set(l, []);
      positions.get(l).push(i);
    });
    lectureScripts.set(id, {
      lines: deduped,
      source,
      positions,
      seg: buildSentenceUnits(deduped),
      times: times ? times.filter((_, i) => keep[i]) : null
    });
    emitProgress();
  }
  var progressListeners = /* @__PURE__ */ new Set();
  function onProgress(listener) {
    progressListeners.add(listener);
  }
  function getProgress(key = currentLectureKey()) {
    const entry = scriptEntry(key);
    if (!entry) return null;
    const bucket = buckets.get(key);
    const track = tracker.get(key);
    const units = new Set(entry.seg.units);
    let done = 0, failed = 0, gaveUp = 0;
    for (const u of units) {
      const state = track?.get(u)?.state;
      if (bucket?.has(u) || state === "done") done++;
      else if (state === "failed") failed++;
      else if (state === "gaveUp") gaveUp++;
    }
    return { total: units.size, done, failed, gaveUp };
  }
  function emitProgress() {
    const p = getProgress();
    for (const l of progressListeners) {
      try {
        l(p);
      } catch (_) {
      }
    }
  }
  var scriptEntry = (key) => lectureScripts.get(key.slice(key.indexOf("::") + 2));
  function resolveCueIndices(cueTexts, key = currentLectureKey()) {
    const entry = scriptEntry(key);
    let cursor = 0;
    return cueTexts.map((text, n) => {
      const ps = entry?.positions.get(text);
      if (!ps) return void 0;
      if (n > 0 && text === cueTexts[n - 1] && cursor > 0) return cursor - 1;
      const i = ps.find((p) => p >= cursor) ?? ps[0];
      cursor = i + 1;
      return i;
    });
  }
  var lastCaptionIndex = 0;
  function resolveCaptionIndex(entry, text) {
    const ps = entry.positions.get(text);
    if (!ps) return void 0;
    let i = ps[0];
    if (ps.length > 1) {
      const video = document.querySelector("video");
      if (entry.times && video) {
        const t2 = video.currentTime;
        const dist = (p) => {
          const [s, e] = entry.times[p];
          return t2 < s ? s - t2 : t2 > e ? t2 - e : 0;
        };
        i = ps.reduce((best, p) => dist(p) < dist(best) ? p : best, ps[0]);
      } else {
        i = ps.find((p) => p >= lastCaptionIndex) ?? ps[0];
      }
    }
    lastCaptionIndex = i;
    return i;
  }
  function unitsForCues(cueTexts, key = currentLectureKey(), indices = resolveCueIndices(cueTexts, key)) {
    const entry = scriptEntry(key);
    const units = /* @__PURE__ */ new Set();
    cueTexts.forEach((text, n) => {
      const i = indices[n];
      const us = i === void 0 ? [] : entry.seg.cueUnits[i];
      if (us.length === 0) units.add(text);
      else us.forEach((u) => units.add(entry.seg.units[u]));
    });
    return [...units];
  }
  function vttSeconds(ts) {
    return ts.split(":").reduce((acc, part) => acc * 60 + parseFloat(part.replace(",", ".")), 0);
  }
  function scriptFor(key) {
    const script = scriptEntry(key)?.lines;
    if (!script) return void 0;
    const chars = script.reduce((n, l) => n + l.length + 1, 0);
    if (chars > MAX_SCRIPT_CHARS) {
      console.warn(`[UdemyTranslator:VTT] transcript too long for context (${chars} chars) \u2014 translating with references only`);
      return void 0;
    }
    return script;
  }
  var currentLang = DEFAULT_TARGET_CODE;
  function setActiveLang(lang2) {
    if (lang2) currentLang = lang2;
  }
  function getActiveLang() {
    return currentLang;
  }
  function currentLectureKey() {
    return `${currentLang}::${currentLectureId()}`;
  }
  function currentLectureId() {
    const m = location.pathname.match(/\/course\/([^/]+)\/learn\/lecture\/(\d+)/);
    return m ? `${m[1]}/${m[2]}` : location.pathname;
  }
  function getOrCreateBucket(key) {
    let bucket = buckets.get(key);
    if (!bucket) {
      bucket = /* @__PURE__ */ new Map();
      buckets.set(key, bucket);
    }
    return bucket;
  }
  function looksLikeSubtitles(cues) {
    if (cues.length === 0) return false;
    const imageLike = cues.filter((c) => /#xywh=|\.(jpe?g|png|webp)(\?|#|$)/i.test(c.text)).length;
    return imageLike / cues.length < 0.5;
  }
  function initVttBridge() {
    window.addEventListener("message", async (event) => {
      if (event.source !== window) return;
      if (event.data?.type !== "UDEMY_VTT_CAPTURED") return;
      const { vttText, url } = event.data;
      if (processedUrls.has(url)) return;
      processedUrls.add(url);
      console.log(`[UdemyTranslator:VTT] captured: ${url}`);
      try {
        const cues = parseVtt(vttText);
        if (cues.length === 0) {
          console.warn("[UdemyTranslator:VTT] no cues parsed");
          return;
        }
        if (!looksLikeSubtitles(cues)) {
          console.log(`[UdemyTranslator:VTT] skipped non-subtitle VTT (thumbnail/sprite): ${url.substring(0, 80)}`);
          return;
        }
        setLectureScript(cues.map((c) => c.text), "vtt", cues.map((c) => [vttSeconds(c.startTime), vttSeconds(c.endTime)]));
        const units = unitsForCues(cues.map((c) => c.text));
        console.log(`[UdemyTranslator:VTT] ${cues.length} cues \u2192 ${units.length} sentence units`);
        await requestTranslations(units);
        document.dispatchEvent(new Event("vtt-translations-ready"));
      } catch (err) {
        console.error(`[UdemyTranslator:VTT] error: ${err.message}`);
      }
    });
    chrome.runtime.onMessage.addListener((message) => {
      if (message?.type !== "TRANSLATE_PARTIAL") return;
      const key = pendingRequests.get(message.requestId);
      if (!key) return;
      const bucket = getOrCreateBucket(key);
      for (const [text, translation] of Object.entries(message.translations || {})) {
        if (translation) bucket.set(text, translation);
      }
      if (key === currentLectureKey()) {
        document.dispatchEvent(new Event("vtt-translations-ready"));
        emitProgress();
      }
    });
    window.postMessage({ type: "UDEMY_VTT_BRIDGE_READY" }, window.location.origin);
  }
  var CONTEXT_WAIT_MS = 2e3;
  var CONTEXT_POLL_MS = 150;
  var contextWaits = /* @__PURE__ */ new Map();
  async function waitForLectureContext() {
    const id = currentLectureId();
    let wait = contextWaits.get(id);
    if (!wait) {
      wait = (async () => {
        const deadline = Date.now() + CONTEXT_WAIT_MS;
        let ctx = getLectureContext();
        while ((!ctx.lecture || !ctx.section) && Date.now() < deadline) {
          await new Promise((r) => setTimeout(r, CONTEXT_POLL_MS));
          ctx = getLectureContext();
        }
      })();
      contextWaits.set(id, wait);
    }
    await wait;
    return getLectureContext();
  }
  async function requestTranslations(texts, { force = false } = {}) {
    const empty = { count: 0, fresh: 0, failedTexts: [], error: null };
    const uniqueTexts = [...new Set(texts)].filter(Boolean);
    if (uniqueTexts.length === 0) return empty;
    const { targetLang } = await chrome.storage.local.get("targetLang");
    const targetCode = resolveCode(targetLang);
    currentLang = targetCode;
    const key = currentLectureKey();
    const marker = (t2) => `${key} ${t2}`;
    const toSend = uniqueTexts.filter((t2) => !inFlight.has(marker(t2)));
    if (toSend.length === 0) return empty;
    toSend.forEach((t2) => inFlight.add(marker(t2)));
    const track = trackerFor(key);
    toSend.forEach((t2) => track.set(t2, { attempts: track.get(t2)?.attempts || 0, state: "pending" }));
    const ctx = await waitForLectureContext();
    if (currentLectureKey() !== key) {
      toSend.forEach((t2) => {
        inFlight.delete(marker(t2));
        track.delete(t2);
      });
      return empty;
    }
    const requestId = `${Date.now().toString(36)}-${++requestSeq}`;
    pendingRequests.set(requestId, key);
    let response;
    try {
      response = await chrome.runtime.sendMessage({
        type: "TRANSLATE_BATCH",
        requestId,
        texts: toSend,
        script: scriptFor(key),
        targetCode,
        course: ctx.course,
        lecture: ctx.lecture,
        section: ctx.section,
        force
      });
    } catch (err) {
      response = { error: { code: "DISCONNECTED", message: err?.message } };
    } finally {
      toSend.forEach((t2) => inFlight.delete(marker(t2)));
      pendingRequests.delete(requestId);
    }
    const error = response?.error || null;
    const results = response?.results || [];
    const bucket = getOrCreateBucket(key);
    let cachedCount = 0;
    let freshCount = 0;
    const failedTexts = [];
    let failCode = null;
    for (let i = 0; i < toSend.length; i++) {
      const r = results[i];
      if (r?.translation && r.error) {
        bucket.set(toSend[i], r.translation);
        failedTexts.push(toSend[i]);
        failCode = failCode || r.error;
        track.set(toSend[i], { state: "done" });
      } else if (r?.translation) {
        bucket.set(toSend[i], r.translation);
        if (r.cached) cachedCount++;
        else freshCount++;
        track.set(toSend[i], { state: "done" });
      } else if (r?.skipped) {
        track.set(toSend[i], { state: "done" });
      } else {
        const code = r?.error || error?.code || "UNKNOWN";
        failedTexts.push(toSend[i]);
        failCode = failCode || code;
        markFailed(track, toSend[i], code, error?.retryAfterMs);
      }
    }
    const resultError = error || (failCode ? { code: failCode } : null);
    if (error) {
      console.error(`[UdemyTranslator:VTT] translation error: ${error.code}${error.message ? ` \u2014 ${error.message}` : ""}`);
    }
    console.log(`[UdemyTranslator:VTT] ${freshCount + cachedCount}/${toSend.length} translations stored (cache hit: ${cachedCount}, fresh: ${freshCount}, failed: ${failedTexts.length})`);
    scheduleRetry();
    emitStatus({ key, error, failedCount: failedTexts.length, okCount: freshCount + cachedCount });
    if (key === currentLectureKey()) emitProgress();
    return { count: freshCount + cachedCount, fresh: freshCount, failedTexts, error: resultError };
  }
  var tracker = /* @__PURE__ */ new Map();
  var retryTimer = null;
  var statusListeners = /* @__PURE__ */ new Set();
  var NO_AUTO_RETRY = /* @__PURE__ */ new Set(["QUOTA_DAILY", "AUTH", "BAD_REQUEST", "NOT_RUNNING", "BLOCKED", "DISABLED", "NO_API_KEY"]);
  function trackerFor(key) {
    let m = tracker.get(key);
    if (!m) {
      m = /* @__PURE__ */ new Map();
      tracker.set(key, m);
    }
    return m;
  }
  function markFailed(track, text, code, retryAfterMs) {
    const attempts = (track.get(text)?.attempts || 0) + 1;
    if (NO_AUTO_RETRY.has(code) || attempts >= AUTO_RETRY_MAX_ATTEMPTS) {
      track.set(text, { state: "gaveUp", attempts, code });
      return;
    }
    const backoff = Math.min(AUTO_RETRY_BASE_MS * 2 ** (attempts - 1), AUTO_RETRY_MAX_DELAY_MS);
    track.set(text, { state: "failed", attempts, code, nextRetryAt: Date.now() + Math.max(backoff, retryAfterMs || 0) });
  }
  function isRequestable(text, key = currentLectureKey()) {
    return !tracker.get(key)?.has(text);
  }
  function resetTracking(texts, key = currentLectureKey()) {
    const track = tracker.get(key);
    if (!track) return;
    for (const t2 of texts) track.delete(t2);
  }
  function resetFailures() {
    const now = Date.now();
    for (const track of tracker.values()) {
      for (const [text, s] of track) {
        if (s.state === "failed" || s.state === "gaveUp") {
          track.set(text, { state: "failed", attempts: 0, code: s.code, nextRetryAt: now });
        }
      }
    }
    scheduleRetry();
  }
  function onRequestStatus(listener) {
    statusListeners.add(listener);
  }
  function emitStatus(status) {
    for (const l of statusListeners) {
      try {
        l(status);
      } catch (_) {
      }
    }
  }
  function scheduleRetry() {
    clearTimeout(retryTimer);
    retryTimer = null;
    const track = tracker.get(currentLectureKey());
    if (!track) return;
    let earliest = Infinity;
    for (const s of track.values()) {
      if (s.state === "failed" && s.nextRetryAt < earliest) earliest = s.nextRetryAt;
    }
    if (earliest === Infinity) return;
    retryTimer = setTimeout(retryDue, Math.max(0, earliest - Date.now()));
  }
  async function retryDue() {
    retryTimer = null;
    const track = tracker.get(currentLectureKey());
    if (!track) return;
    const now = Date.now();
    const due = [...track.entries()].filter(([, s]) => s.state === "failed" && s.nextRetryAt <= now).map(([text]) => text);
    if (due.length === 0) {
      scheduleRetry();
      return;
    }
    console.log(`[UdemyTranslator:VTT] auto-retry: ${due.length} failed texts`);
    try {
      const { count } = await requestTranslations(due);
      if (count > 0) document.dispatchEvent(new Event("vtt-translations-ready"));
    } catch (err) {
      console.error(`[UdemyTranslator:VTT] auto-retry error: ${err?.message || err}`);
    }
  }
  function getDiagnostics(captionText) {
    const key = currentLectureKey();
    const entry = scriptEntry(key);
    const bucket = buckets.get(key);
    const track = tracker.get(key);
    const states = {};
    track?.forEach((s) => {
      states[s.state] = (states[s.state] || 0) + 1;
    });
    const unitInfo = (u) => ({
      text: entry.seg.units[u].slice(0, 120),
      translated: !!bucket?.has(entry.seg.units[u]),
      state: track?.get(entry.seg.units[u])?.state || null
    });
    const positions = captionText && entry ? entry.positions.get(captionText) || null : null;
    const head = captionText ? captionText.split(" ").slice(0, 3).join(" ") : "";
    return {
      lectureKey: key,
      vttUrlsProcessed: [...processedUrls].map((u) => u.slice(0, 140)),
      script: entry ? {
        source: entry.source,
        lines: entry.lines.length,
        hasTimes: !!entry.times,
        first3: entry.lines.slice(0, 3),
        units: entry.seg.units.length,
        unitsTranslated: entry.seg.units.filter((u) => bucket?.has(u)).length
      } : null,
      bucketSize: bucket?.size || 0,
      trackerStates: states,
      caption: captionText ? {
        exactMatchPositions: positions,
        unitsAtFirstMatch: positions ? entry.seg.cueUnits[positions[0]].map(unitInfo) : [],
        bucketHasCaptionTextItself: !!bucket?.has(captionText),
        scriptLinesStartingSimilarly: entry && head ? entry.lines.map((l, i) => [i, l]).filter(([, l]) => l.includes(head)).slice(0, 5) : []
      } : null
    };
  }
  function getVttTranslation(text, key = currentLectureKey(), { panel = false, index } = {}) {
    const bucket = buckets.get(key);
    if (!bucket) return null;
    const entry = scriptEntry(key);
    const i = index ?? (entry && (panel ? entry.positions.get(text)?.[0] : resolveCaptionIndex(entry, text)));
    const us = i === void 0 ? [] : entry.seg.cueUnits[i];
    if (us.length === 0) return bucket.get(text) || null;
    const parts = [];
    for (const u of us) {
      const tr = bucket.get(entry.seg.units[u]);
      if (!tr) return null;
      if (!panel || entry.seg.unitCues[u][0] === i) parts.push(tr);
    }
    return parts.join(" ");
  }
  function clearVttStore() {
    processedUrls.clear();
    tracker.clear();
    clearTimeout(retryTimer);
    retryTimer = null;
    lastCaptionIndex = 0;
    emitProgress();
  }

  // src/shared/i18n.js
  var catalogs = {};
  var locale = "en";
  function setCatalogs(c) {
    catalogs = c || {};
  }
  function setLocale(loc) {
    locale = loc && catalogs[loc] ? loc : "en";
  }
  function getLocale() {
    return locale;
  }
  function lookup(catalog, key) {
    if (!catalog) return void 0;
    return key.split(".").reduce((o, k) => o == null ? void 0 : o[k], catalog);
  }
  function t(key, params) {
    let val = lookup(catalogs[locale], key);
    if (val == null) val = lookup(catalogs.en, key);
    if (val == null) return key;
    if (params) {
      val = String(val).replace(/\{(\w+)\}/g, (m, p) => Object.prototype.hasOwnProperty.call(params, p) ? String(params[p]) : m);
    }
    return val;
  }

  // src/shared/language-name.js
  function languageName(targetCode, uiCode) {
    try {
      return new Intl.DisplayNames([uiCode], { type: "language" }).of(targetCode) || targetCode;
    } catch {
      return targetCode;
    }
  }

  // src/presentation/content/badge-manager.js
  var MARK_SVG = '<svg viewBox="0 0 100 100" aria-hidden="true"><rect x="4" y="4" width="92" height="92" rx="26" fill="#8B3DF5"/><path d="M31 26 L31 52 A19 19 0 0 0 69 52 L69 26" fill="none" stroke="#fff" stroke-width="12" stroke-linecap="round"/><rect x="30" y="74" width="40" height="9" rx="4.5" fill="#fff"/><rect x="30" y="74" width="15" height="9" rx="4.5" fill="#3DF5C8"/></svg>';
  var badgeEl = null;
  var anchorEl = null;
  var lang = DEFAULT_TARGET_CODE;
  var enabled = true;
  var errorCode = null;
  var progress = null;
  function progressState() {
    if (!progress?.total) return "working";
    if (progress.done >= progress.total) return "done";
    if (progress.gaveUp > 0 && progress.done + progress.gaveUp >= progress.total) return "partial";
    return "working";
  }
  function badgeText() {
    if (errorCode) {
      const key = `badge.error.${errorCode}`;
      const msg = t(key);
      return msg === key ? t("badge.error.generic") : msg;
    }
    const name = languageName(lang, getLocale());
    const state = progressState();
    if (state === "done") return t("badge.done", { lang: name });
    if (state === "partial") return t("badge.partial", { lang: name, failed: progress.gaveUp });
    if (progress?.total) {
      const percent = Math.min(99, Math.floor(progress.done / progress.total * 100));
      return t("badge.translatingProgress", { lang: name, percent });
    }
    return t("badge.translatingTo", { lang: name });
  }
  function render() {
    if (!badgeEl) return;
    badgeEl.querySelector(".utb-text").textContent = badgeText();
    const state = errorCode ? "error" : progressState();
    badgeEl.classList.toggle("utb-error", state === "error");
    badgeEl.classList.toggle("utb-done", state === "done");
    badgeEl.classList.toggle("utb-partial", state === "partial");
  }
  function build() {
    const el = document.createElement("div");
    el.className = "udemy-translator-badge";
    el.innerHTML = `${MARK_SVG}<span class="utb-text"></span><span class="utb-dot"></span>`;
    badgeEl = el;
    render();
    return el;
  }
  function mountTarget() {
    if (anchorEl && anchorEl.offsetParent) return anchorEl.offsetParent;
    const video = document.querySelector("video");
    return video?.parentElement || null;
  }
  function setBadgeProgress(p) {
    progress = p;
    render();
  }
  function setBadgeLang(l) {
    if (l) lang = l;
    render();
  }
  function setBadgeError(code) {
    errorCode = code || null;
    render();
  }
  function setBadgeEnabled(v) {
    enabled = v !== false;
    if (!enabled) hideBadge();
    else if (anchorEl) showBadge(anchorEl);
  }
  function showBadge(anchor) {
    if (anchor) anchorEl = anchor;
    if (!enabled) return;
    const target = mountTarget();
    if (!target) return;
    if (!badgeEl) badgeEl = build();
    if (badgeEl.parentElement !== target) target.appendChild(badgeEl);
    badgeEl.style.display = "inline-flex";
  }
  function hideBadge() {
    if (badgeEl) badgeEl.style.display = "none";
  }
  function removeBadge() {
    if (badgeEl) {
      badgeEl.remove();
      badgeEl = null;
    }
    anchorEl = null;
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
  var appliedText = /* @__PURE__ */ new WeakMap();
  var normalize = (s) => s.replace(/\s+/g, " ").trim();
  var lookupLog = [];
  function logLookup(entry) {
    lookupLog.push({ at: (/* @__PURE__ */ new Date()).toISOString().slice(11, 23), ...entry });
    if (lookupLog.length > 20) lookupLog.shift();
  }
  function getCaptionDebug() {
    const liveEl = document.querySelector(CAPTION_SELECTOR);
    return {
      observedElementIsLive: !!currentCaptionEl && currentCaptionEl === liveEl,
      observedElementConnected: !!currentCaptionEl?.isConnected,
      liveElementHtml: liveEl ? liveEl.outerHTML.slice(0, 400) : null,
      applied: liveEl ? appliedText.get(liveEl) || null : null,
      recentLookups: [...lookupLog]
    };
  }
  function getCaptionCacheEntry(text) {
    return translationMapCache.has(text) ? translationMapCache.get(text) : null;
  }
  function ownTextNodes(captionEl) {
    const nodes = [];
    const walker = document.createTreeWalker(captionEl, NodeFilter.SHOW_TEXT, {
      acceptNode: (n) => n.parentElement?.closest(".caption-original") ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT
    });
    while (walker.nextNode()) nodes.push(walker.currentNode);
    return nodes;
  }
  function writeCaption(captionEl, nodes, mainText, subText) {
    if (mainText != null) {
      nodes.forEach((n, i) => {
        const v = i === 0 ? mainText : "";
        if (n.nodeValue !== v) n.nodeValue = v;
      });
    }
    let origLine = captionEl.querySelector(".caption-original");
    if (subText) {
      if (!origLine) {
        origLine = document.createElement("div");
        origLine.className = "caption-original";
        captionEl.appendChild(origLine);
      }
      if (origLine.textContent !== subText) origLine.textContent = subText;
    } else if (origLine) {
      origLine.remove();
    }
  }
  function replaceCaptionText(captionEl) {
    if (!captionEl) return;
    const nodes = ownTextNodes(captionEl);
    const raw = normalize(nodes.map((n) => n.nodeValue).join(""));
    const applied = appliedText.get(captionEl);
    const ours = !!applied && raw === applied.translated;
    const originalText = ours ? applied.original : raw;
    const restore = () => {
      withObserverPaused(() => writeCaption(captionEl, nodes, ours ? originalText : null, null));
      appliedText.delete(captionEl);
    };
    if (!originalText) {
      restore();
      return;
    }
    if (currentStyle.displayMode === "original") {
      hideBadge();
      restore();
      return;
    }
    const fromTranscript = getVttTranslation(originalText);
    const translated = fromTranscript || translationMapCache.get(originalText);
    logLookup({ text: originalText.slice(0, 120), via: fromTranscript ? "transcript" : translated ? "panelCache" : null });
    if (!translated) {
      restore();
      if (isAlreadyTargetLanguage(originalText, getActiveLang())) hideBadge();
      else showBadge(captionEl);
      return;
    }
    showBadge(captionEl);
    withObserverPaused(() => {
      writeCaption(
        captionEl,
        nodes,
        translated,
        currentStyle.displayMode === "both" ? originalText : null
      );
    });
    appliedText.set(captionEl, { original: originalText, translated: normalize(translated) });
  }
  function refreshCaption() {
    if (currentCaptionEl) replaceCaptionText(currentCaptionEl);
  }
  function withObserverPaused(fn) {
    if (captionObserver) captionObserver.disconnect();
    fn();
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
  document.addEventListener("vtt-translations-ready", () => {
    if (currentCaptionEl) replaceCaptionText(currentCaptionEl);
  });
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
    removeBadge();
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
      cueTextSpan.textContent = cueTextSpan.dataset.translated ?? cueTextSpan.dataset.original;
      if (originalEl) originalEl.style.display = "none";
    } else {
      cueTextSpan.textContent = cueTextSpan.dataset.translated ?? cueTextSpan.dataset.original;
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
      const text = (textSpan.dataset.original || textSpan.textContent).replace(/\s+/g, " ").trim();
      if (!text) return;
      const container = cue.closest('[class*="cue-container"]') || cue;
      items.push({ text, container, textSpan });
    });
    return items;
  }
  function getUntranslatedCues(cueItems) {
    const key = currentLectureKey();
    const indices = resolveCueIndices(cueItems.map(({ text }) => text), key);
    cueItems.forEach((item, n) => {
      item.index = indices[n];
    });
    return cueItems.filter(({ text, textSpan, container, index }) => {
      if (textSpan.dataset.original) return false;
      const parent = textSpan.closest("p") || textSpan.parentElement;
      const origEl = parent.querySelector(`.${ORIGINAL_CLASS}`);
      if (origEl) return false;
      const panelText = getVttTranslation(text, key, { panel: true, index });
      if (panelText !== null) {
        applyTranslation(textSpan, container, panelText, getVttTranslation(text, key, { index }));
        return false;
      }
      return true;
    });
  }
  function applyTranslation(textSpan, container, translation, captionText = translation) {
    if (!textSpan.dataset.original) {
      textSpan.dataset.original = textSpan.textContent.trim();
    }
    textSpan.dataset.translated = translation;
    updateCaptionCache(textSpan.dataset.original.replace(/\s+/g, " ").trim(), captionText);
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
    let toRequest = [];
    try {
      const cueItems = collectCues(panel);
      setLectureScript(cueItems.map(({ text }) => text), "dom");
      const untranslated = getUntranslatedCues(cueItems);
      toRequest = unitsForCues(untranslated.map(({ text }) => text), currentLectureKey(), untranslated.map(({ index }) => index)).filter((text) => text && isRequestable(text));
      const captionEl = document.querySelector(CAPTION_SELECTOR);
      if (captionEl) replaceCaptionText(captionEl);
    } finally {
      resumeObserver();
      isApplying = false;
    }
    if (toRequest.length > 0) {
      console.log(`[UdemyTranslator] auto-translate: requesting ${toRequest.length} sentence units`);
      requestTranslations(toRequest).then(({ count }) => {
        if (count > 0) scheduleTranslation(panel);
      }).catch((err) => {
        console.error("[UdemyTranslator] auto-translate request failed:", err?.message || err);
      });
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
    if (!panel) return { count: 0, failed: 0, error: null };
    const cueItems = collectCues(panel);
    if (cueItems.length === 0) return { count: 0, failed: 0, error: null };
    setLectureScript(cueItems.map(({ text }) => text), "dom");
    const texts = unitsForCues(cueItems.map(({ text }) => text));
    resetTracking(texts);
    const { fresh, failedTexts, error } = await requestTranslations(texts, { force: true });
    if (fresh > 0) {
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
      applyVttTranslations(panel);
    }
    return { count: fresh, failed: failedTexts.length, error: error?.code || null };
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
    setBadgeError(null);
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

  // locales/en.json
  var en_default = {
    popup: {
      subtitle: "Live subtitle translation",
      statusWaiting: "Waiting",
      toggleTitle: "Enable/disable translation",
      aiProvider: "AI Provider",
      selected: "\u2713 Selected",
      apiKey: "API Key",
      showPassword: "Show password",
      proxyUrl: "Proxy server URL",
      save: "Save",
      saved: "Saved!",
      invalidKey: "Invalid characters in key \u2014 re-enter in English mode",
      retranslate: "Re-translate",
      retranslating: "Re-translating...",
      retranslateDone: "{count} re-translated!",
      openUdemy: "Please open a Udemy course page",
      statusChecking: "{provider} \u2014 checking connection...",
      statusReady: "{provider} ready",
      statusNotRunning: "{provider} not running \u2014 run `node proxy-server/server.js` in a terminal",
      statusNeedKey: "Enter your {provider} API key",
      enableOn: "Translation on",
      enableOff: "Translation off",
      retranslateFailed: "Retranslate failed \xB7 {reason}",
      retranslatePartial: "{count} retranslated \xB7 {failed} failed",
      retranslateBlocked: "Daily limit reached \xB7 available after {time}"
    },
    settings: {
      model: "Model",
      targetLang: "Translation",
      displayMode: "Display",
      uiLang: "Language"
    },
    displayModeOptions: {
      translation: "Translation only",
      both: "Original + Translation",
      original: "Original only"
    },
    style: {
      heading: "Subtitle style",
      fontSize: "Font size",
      fontColor: "Text color",
      bgColor: "Background color",
      bgOpacity: "Background opacity",
      panelColor: "Panel text color",
      use: "On",
      none: "None",
      udemyDefault: "Udemy default",
      preview: "Preview",
      previewText: "Translated subtitle preview"
    },
    cache: {
      title: "Cache",
      manage: "Manage cache",
      savedSubtitles: "Saved translations",
      search: "Search title (course \xB7 section \xB7 lesson)",
      selectAll: "Select all",
      deleteSelected: "Delete selected",
      deleteAll: "Delete all",
      loading: "Loading...",
      empty: "Cache is empty",
      noResults: "No results",
      back: "Back",
      count: "{total} items",
      selectedCount: "{selected} selected / {total} total",
      subtitleCount: "{count} subtitles",
      noCourse: "(unknown course)",
      noSection: "(no section)",
      noTitle: "(untitled)",
      delCourse: "Delete all cache for this course",
      delSection: "Delete cache for this section",
      delLesson: "Delete cache for this lesson"
    },
    badge: {
      translatingTo: "Translating to {lang}",
      translatingProgress: "Translating to {lang} {percent}%",
      done: "\u2713 {lang} translation complete",
      partial: "{lang} done \xB7 {failed} sentences failed",
      error: {
        RATE_LIMIT: "Rate limited \xB7 retrying soon",
        QUOTA_DAILY: "Daily limit reached",
        AUTH: "API key error",
        BAD_REQUEST: "Request error \xB7 check settings",
        NOT_RUNNING: "Proxy not running",
        NO_API_KEY: "No API key",
        generic: "Translation error \xB7 retrying"
      }
    },
    model: {
      tier: {
        fastCheap: "fast / cheap",
        fast: "fast",
        balanced: "balanced",
        recommended: "recommended",
        highQuality: "high quality"
      }
    },
    log: {
      button: "Error log",
      title: "Error log",
      subtitle: "Last 10 \xB7 errors and slow requests",
      empty: "No recent errors",
      emptySub: "Problems during translation will show up here",
      copy: "Copy",
      copied: "Copied",
      clear: "Clear",
      count: "{total} entries",
      detail: "Details",
      lines: "{count} lines",
      failedLines: "{failed}/{lines} lines failed",
      took: "took {sec}s",
      repeated: "repeated \xD7{count}",
      waited: "waited {sec}s",
      retryAfter: "retry after {sec}s",
      noLecture: "(no lecture info)",
      summaryErrors: "{count} errors",
      summaryWarns: "{count} warnings",
      blockedBanner: "{provider} daily limit reached \u2014 resumes at {time}",
      code: {
        RATE_LIMIT: "Rate limit exceeded",
        QUOTA_DAILY: "Daily limit reached",
        AUTH: "API key error",
        BAD_REQUEST: "Request rejected",
        SERVER: "AI server error",
        TIMEOUT: "Request timed out",
        NETWORK: "Network error",
        EMPTY_RESPONSE: "Empty response",
        BLOCKED: "Blocked by safety filter",
        MAX_TOKENS: "Response too long",
        PARSE_ERROR: "Some lines failed",
        NOT_RUNNING: "Proxy not running",
        DISCONNECTED: "Extension disconnected",
        SLOW: "Slow request",
        UNKNOWN: "Unknown error"
      },
      hint: {
        RATE_LIMIT: "Hit the per-minute limit. Retrying automatically with longer gaps.",
        QUOTA_DAILY: "Today's request quota is used up. Translation resumes when the quota resets.",
        AUTH: "The API key is invalid or lacks permission. Please check your key.",
        BAD_REQUEST: "The request was rejected. Please check the model setting.",
        SERVER: "The AI server is temporarily unstable. Retrying automatically.",
        TIMEOUT: "The response took too long. Retrying automatically.",
        NETWORK: "Please check your internet connection. Retrying automatically.",
        EMPTY_RESPONSE: "Received an empty response. Retrying automatically.",
        BLOCKED: "Lines blocked by the safety filter are left in the original language.",
        MAX_TOKENS: "The response was cut off. The batch was split and resent.",
        PARSE_ERROR: "Some lines couldn't be matched to the result. Retrying automatically.",
        NOT_RUNNING: "The Claude Code proxy is not running. Start it from a terminal.",
        DISCONNECTED: "Lost connection to the extension. Retrying automatically.",
        SLOW: "The response was slow. If this keeps happening, you may be near a rate limit.",
        UNKNOWN: "An unexpected error occurred. See the details below."
      }
    }
  };

  // locales/ko.json
  var ko_default = {
    popup: {
      subtitle: "\uC2E4\uC2DC\uAC04 \uC790\uB9C9 \uBC88\uC5ED",
      statusWaiting: "\uB300\uAE30 \uC911",
      toggleTitle: "\uBC88\uC5ED \uD65C\uC131\uD654/\uBE44\uD65C\uC131\uD654",
      aiProvider: "AI \uC81C\uACF5\uC790",
      selected: "\u2713 \uC120\uD0DD\uB428",
      apiKey: "API \uD0A4",
      showPassword: "\uBE44\uBC00\uBC88\uD638 \uD45C\uC2DC",
      proxyUrl: "\uD504\uB85D\uC2DC \uC11C\uBC84 URL",
      save: "\uC800\uC7A5",
      saved: "\uC800\uC7A5 \uC644\uB8CC!",
      invalidKey: "\uD0A4\uC5D0 \uD55C\uAE00 \uB4F1 \uC798\uBABB\uB41C \uBB38\uC790\uAC00 \uC788\uC5B4\uC694 \u2014 \uC601\uBB38 \uC785\uB825\uC73C\uB85C \uB2E4\uC2DC \uC785\uB825",
      retranslate: "\uC7AC\uBC88\uC5ED",
      retranslating: "\uC7AC\uBC88\uC5ED \uC911...",
      retranslateDone: "{count}\uAC74 \uC7AC\uBC88\uC5ED \uC644\uB8CC!",
      openUdemy: "Udemy \uD398\uC774\uC9C0\uB97C \uC5F4\uC5B4\uC8FC\uC138\uC694",
      statusChecking: "{provider} \uC5F0\uACB0 \uD655\uC778 \uC911...",
      statusReady: "{provider} \uC900\uBE44\uB428",
      statusNotRunning: "{provider} \uBBF8\uC2E4\uD589 \u2014 \uD130\uBBF8\uB110\uC5D0\uC11C node proxy-server/server.js \uC2E4\uD589 \uD544\uC694",
      statusNeedKey: "{provider} API \uD0A4\uB97C \uC785\uB825\uD558\uC138\uC694",
      enableOn: "\uBC88\uC5ED \uCF1C\uC9D0",
      enableOff: "\uBC88\uC5ED \uAEBC\uC9D0",
      retranslateFailed: "\uC7AC\uBC88\uC5ED \uC2E4\uD328 \xB7 {reason}",
      retranslatePartial: "{count}\uAC74 \uC7AC\uBC88\uC5ED \xB7 {failed}\uAC74 \uC2E4\uD328",
      retranslateBlocked: "\uC77C\uC77C \uD55C\uB3C4 \uCD08\uACFC \xB7 {time} \uC774\uD6C4 \uAC00\uB2A5"
    },
    settings: {
      model: "\uBAA8\uB378",
      targetLang: "\uBC88\uC5ED \uC5B8\uC5B4",
      displayMode: "\uD45C\uC2DC \uBAA8\uB4DC",
      uiLang: "\uD654\uBA74 \uC5B8\uC5B4"
    },
    displayModeOptions: {
      translation: "\uBC88\uC5ED\uB9CC",
      both: "\uC6D0\uBCF8 + \uBC88\uC5ED (\uB3D9\uC2DC)",
      original: "\uC6D0\uBCF8\uB9CC"
    },
    style: {
      heading: "\uBC88\uC5ED \uC790\uB9C9 \uC2A4\uD0C0\uC77C",
      fontSize: "\uAE00\uC790 \uD06C\uAE30",
      fontColor: "\uAE00\uC790 \uC0C9\uC0C1",
      bgColor: "\uBC30\uACBD \uC0C9\uC0C1",
      bgOpacity: "\uBC30\uACBD \uD22C\uBA85\uB3C4",
      panelColor: "\uD328\uB110 \uAE00\uC790\uC0C9",
      use: "\uC0AC\uC6A9",
      none: "\uC5C6\uC74C",
      udemyDefault: "\uC720\uB370\uBBF8 \uAE30\uBCF8",
      preview: "\uBBF8\uB9AC\uBCF4\uAE30",
      previewText: "\uBC88\uC5ED\uB41C \uC790\uB9C9 \uBBF8\uB9AC\uBCF4\uAE30"
    },
    cache: {
      title: "\uCE90\uC2DC",
      manage: "\uCE90\uC2DC \uAD00\uB9AC",
      savedSubtitles: "\uC800\uC7A5\uB41C \uBC88\uC5ED \uC790\uB9C9",
      search: "\uC81C\uBAA9 \uAC80\uC0C9 (\uCF54\uC2A4\xB7\uC139\uC158\xB7\uB808\uC2A8)",
      selectAll: "\uC804\uCCB4 \uC120\uD0DD",
      deleteSelected: "\uC120\uD0DD \uC0AD\uC81C",
      deleteAll: "\uC804\uCCB4 \uC0AD\uC81C",
      loading: "\uB85C\uB529 \uC911...",
      empty: "\uCE90\uC2DC\uAC00 \uBE44\uC5B4 \uC788\uC2B5\uB2C8\uB2E4",
      noResults: "\uAC80\uC0C9 \uACB0\uACFC\uAC00 \uC5C6\uC2B5\uB2C8\uB2E4",
      back: "\uB4A4\uB85C",
      count: "{total}\uAC1C \uD56D\uBAA9",
      selectedCount: "{selected}\uAC1C \uC120\uD0DD / \uC804\uCCB4 {total}\uAC1C",
      subtitleCount: "{count}\uAC1C \uC790\uB9C9",
      noCourse: "(\uCF54\uC2A4 \uBBF8\uC0C1)",
      noSection: "(\uC139\uC158 \uC5C6\uC74C)",
      noTitle: "(\uC81C\uBAA9 \uC5C6\uC74C)",
      delCourse: "\uC774 \uCF54\uC2A4 \uCE90\uC2DC \uC804\uCCB4 \uC0AD\uC81C",
      delSection: "\uC774 \uC139\uC158 \uCE90\uC2DC \uC0AD\uC81C",
      delLesson: "\uC774 \uB808\uC2A8 \uCE90\uC2DC \uC0AD\uC81C"
    },
    badge: {
      translatingTo: "{lang} \uBC88\uC5ED \uC911",
      translatingProgress: "{lang} \uBC88\uC5ED \uC911 {percent}%",
      done: "\u2713 {lang} \uBC88\uC5ED \uC644\uB8CC",
      partial: "{lang} \uBC88\uC5ED \uC644\uB8CC \xB7 {failed}\uBB38\uC7A5 \uC2E4\uD328",
      error: {
        RATE_LIMIT: "\uC694\uCCAD \uD55C\uB3C4 \xB7 \uC7A0\uC2DC \uD6C4 \uC7AC\uC2DC\uB3C4",
        QUOTA_DAILY: "\uC77C\uC77C \uD55C\uB3C4 \uCD08\uACFC",
        AUTH: "API \uD0A4 \uC624\uB958",
        BAD_REQUEST: "\uC694\uCCAD \uC624\uB958 \xB7 \uC124\uC815 \uD655\uC778",
        NOT_RUNNING: "\uD504\uB85D\uC2DC \uBBF8\uC2E4\uD589",
        NO_API_KEY: "API \uD0A4 \uC5C6\uC74C",
        generic: "\uBC88\uC5ED \uC624\uB958 \xB7 \uC7AC\uC2DC\uB3C4 \uC911"
      }
    },
    model: {
      tier: {
        fastCheap: "\uBE60\uB984/\uC800\uB834",
        fast: "\uBE60\uB984",
        balanced: "\uADE0\uD615",
        recommended: "\uAD8C\uC7A5",
        highQuality: "\uACE0\uD488\uC9C8"
      }
    },
    log: {
      button: "\uC624\uB958 \uB85C\uADF8",
      title: "\uC624\uB958 \uB85C\uADF8",
      subtitle: "\uCD5C\uADFC 10\uAC74 \xB7 \uBC88\uC5ED \uC624\uB958\uC640 \uB290\uB9B0 \uC694\uCCAD",
      empty: "\uCD5C\uADFC \uC624\uB958\uAC00 \uC5C6\uC5B4\uC694",
      emptySub: "\uBC88\uC5ED \uC911 \uBB38\uC81C\uAC00 \uC0DD\uAE30\uBA74 \uC5EC\uAE30\uC5D0 \uAE30\uB85D\uB3FC\uC694",
      copy: "\uBCF5\uC0AC",
      copied: "\uBCF5\uC0AC\uB428",
      clear: "\uBE44\uC6B0\uAE30",
      count: "{total}\uAC74",
      detail: "\uC0C1\uC138 \uBA54\uC2DC\uC9C0",
      lines: "{count}\uC904",
      failedLines: "{failed}/{lines}\uC904 \uC2E4\uD328",
      took: "{sec}\uCD08 \uC18C\uC694",
      repeated: "{count}\uD68C \uBC18\uBCF5",
      waited: "\uB300\uAE30 {sec}\uCD08",
      retryAfter: "{sec}\uCD08 \uD6C4 \uC7AC\uC2DC\uB3C4 \uAD8C\uC7A5",
      noLecture: "(\uAC15\uC758 \uC815\uBCF4 \uC5C6\uC74C)",
      summaryErrors: "\uC624\uB958 {count}",
      summaryWarns: "\uACBD\uACE0 {count}",
      blockedBanner: "{provider} \uC77C\uC77C \uD55C\uB3C4 \uCD08\uACFC \u2014 {time}\uC5D0 \uB2E4\uC2DC \uC2DC\uC791\uB3FC\uC694",
      code: {
        RATE_LIMIT: "\uBD84\uB2F9 \uC694\uCCAD \uD55C\uB3C4 \uCD08\uACFC",
        QUOTA_DAILY: "\uC77C\uC77C \uD55C\uB3C4 \uCD08\uACFC",
        AUTH: "API \uD0A4 \uC624\uB958",
        BAD_REQUEST: "\uC694\uCCAD \uAC70\uBD80\uB428",
        SERVER: "AI \uC11C\uBC84 \uC624\uB958",
        TIMEOUT: "\uC751\uB2F5 \uC2DC\uAC04 \uCD08\uACFC",
        NETWORK: "\uB124\uD2B8\uC6CC\uD06C \uC624\uB958",
        EMPTY_RESPONSE: "\uBE48 \uC751\uB2F5",
        BLOCKED: "\uC548\uC804 \uD544\uD130 \uCC28\uB2E8",
        MAX_TOKENS: "\uC751\uB2F5 \uAE38\uC774 \uCD08\uACFC",
        PARSE_ERROR: "\uC77C\uBD80 \uC904 \uBC88\uC5ED \uC2E4\uD328",
        NOT_RUNNING: "\uD504\uB85D\uC2DC \uBBF8\uC2E4\uD589",
        DISCONNECTED: "\uD655\uC7A5 \uC5F0\uACB0 \uB04A\uAE40",
        SLOW: "\uB290\uB9B0 \uC694\uCCAD",
        UNKNOWN: "\uC54C \uC218 \uC5C6\uB294 \uC624\uB958"
      },
      hint: {
        RATE_LIMIT: "\uBD84\uB2F9 \uC694\uCCAD \uD55C\uB3C4\uC5D0 \uAC78\uB838\uC5B4\uC694. \uAC04\uACA9\uC744 \uB298\uB824 \uC790\uB3D9\uC73C\uB85C \uB2E4\uC2DC \uC2DC\uB3C4\uD574\uC694.",
        QUOTA_DAILY: "\uC624\uB298 \uC4F8 \uC218 \uC788\uB294 \uC694\uCCAD\uC744 \uBAA8\uB450 \uC37C\uC5B4\uC694. \uD55C\uB3C4\uAC00 \uCD08\uAE30\uD654\uB418\uBA74 \uB2E4\uC2DC \uBC88\uC5ED\uD560 \uC218 \uC788\uC5B4\uC694.",
        AUTH: "API \uD0A4\uAC00 \uC798\uBABB\uB410\uAC70\uB098 \uAD8C\uD55C\uC774 \uC5C6\uC5B4\uC694. \uD0A4\uB97C \uB2E4\uC2DC \uD655\uC778\uD574 \uC8FC\uC138\uC694.",
        BAD_REQUEST: "\uC694\uCCAD\uC774 \uAC70\uBD80\uB410\uC5B4\uC694. \uBAA8\uB378 \uC124\uC815\uC744 \uD655\uC778\uD574 \uC8FC\uC138\uC694.",
        SERVER: "AI \uC11C\uBC84\uAC00 \uC77C\uC2DC\uC801\uC73C\uB85C \uBD88\uC548\uC815\uD574\uC694. \uC790\uB3D9\uC73C\uB85C \uB2E4\uC2DC \uC2DC\uB3C4\uD574\uC694.",
        TIMEOUT: "\uC751\uB2F5\uC774 \uB108\uBB34 \uC624\uB798 \uAC78\uB838\uC5B4\uC694. \uC790\uB3D9\uC73C\uB85C \uB2E4\uC2DC \uC2DC\uB3C4\uD574\uC694.",
        NETWORK: "\uC778\uD130\uB137 \uC5F0\uACB0\uC744 \uD655\uC778\uD574 \uC8FC\uC138\uC694. \uC790\uB3D9\uC73C\uB85C \uB2E4\uC2DC \uC2DC\uB3C4\uD574\uC694.",
        EMPTY_RESPONSE: "\uB0B4\uC6A9 \uC5C6\uB294 \uC751\uB2F5\uC744 \uBC1B\uC558\uC5B4\uC694. \uC790\uB3D9\uC73C\uB85C \uB2E4\uC2DC \uC2DC\uB3C4\uD574\uC694.",
        BLOCKED: "\uC548\uC804 \uD544\uD130\uC5D0 \uAC78\uB9B0 \uC904\uC740 \uBC88\uC5ED\uD558\uC9C0 \uC54A\uACE0 \uC6D0\uBB38\uC73C\uB85C \uB0A8\uACA8\uC694.",
        MAX_TOKENS: "\uC751\uB2F5\uC774 \uAE38\uC5B4 \uC798\uB838\uC5B4\uC694. \uBB36\uC74C\uC744 \uB098\uB220 \uB2E4\uC2DC \uBCF4\uB0C8\uC5B4\uC694.",
        PARSE_ERROR: "\uC77C\uBD80 \uC904\uC744 \uBC88\uC5ED \uACB0\uACFC\uC640 \uB9DE\uCD94\uC9C0 \uBABB\uD588\uC5B4\uC694. \uC790\uB3D9\uC73C\uB85C \uB2E4\uC2DC \uC2DC\uB3C4\uD574\uC694.",
        NOT_RUNNING: "Claude Code \uD504\uB85D\uC2DC\uAC00 \uAEBC\uC838 \uC788\uC5B4\uC694. \uD130\uBBF8\uB110\uC5D0\uC11C \uD504\uB85D\uC2DC\uB97C \uC2E4\uD589\uD574 \uC8FC\uC138\uC694.",
        DISCONNECTED: "\uD655\uC7A5 \uD504\uB85C\uADF8\uB7A8\uACFC \uC5F0\uACB0\uC774 \uB04A\uACBC\uC5B4\uC694. \uC790\uB3D9\uC73C\uB85C \uB2E4\uC2DC \uC2DC\uB3C4\uD574\uC694.",
        SLOW: "\uC751\uB2F5\uC774 \uB2A6\uAC8C \uC654\uC5B4\uC694. \uACC4\uC18D\uB418\uBA74 \uC694\uCCAD \uD55C\uB3C4\uC5D0 \uAC00\uAE4C\uC6CC\uC9C4 \uAC83\uC77C \uC218 \uC788\uC5B4\uC694.",
        UNKNOWN: "\uC608\uC0C1\uD558\uC9C0 \uBABB\uD55C \uC624\uB958\uC608\uC694. \uC0C1\uC138 \uBA54\uC2DC\uC9C0\uB97C \uD655\uC778\uD574 \uC8FC\uC138\uC694."
      }
    }
  };

  // locales/ja.json
  var ja_default = {
    popup: {
      subtitle: "\u30EA\u30A2\u30EB\u30BF\u30A4\u30E0\u5B57\u5E55\u7FFB\u8A33",
      statusWaiting: "\u5F85\u6A5F\u4E2D",
      toggleTitle: "\u7FFB\u8A33\u306E\u6709\u52B9\u5316\u30FB\u7121\u52B9\u5316",
      aiProvider: "AI\u30D7\u30ED\u30D0\u30A4\u30C0\u30FC",
      selected: "\u2713 \u9078\u629E\u4E2D",
      apiKey: "API\u30AD\u30FC",
      showPassword: "\u30D1\u30B9\u30EF\u30FC\u30C9\u3092\u8868\u793A",
      proxyUrl: "\u30D7\u30ED\u30AD\u30B7\u30B5\u30FC\u30D0\u30FCURL",
      save: "\u4FDD\u5B58",
      saved: "\u4FDD\u5B58\u3057\u307E\u3057\u305F\uFF01",
      invalidKey: "\u30AD\u30FC\u306B\u7121\u52B9\u306A\u6587\u5B57\u304C\u3042\u308A\u307E\u3059 \u2014 \u534A\u89D2\u82F1\u6570\u5B57\u3067\u518D\u5165\u529B",
      retranslate: "\u518D\u7FFB\u8A33",
      retranslating: "\u518D\u7FFB\u8A33\u4E2D...",
      retranslateDone: "{count}\u4EF6\u3092\u518D\u7FFB\u8A33\u3057\u307E\u3057\u305F\uFF01",
      openUdemy: "Udemy\u306E\u30B3\u30FC\u30B9\u30DA\u30FC\u30B8\u3092\u958B\u3044\u3066\u304F\u3060\u3055\u3044",
      statusChecking: "{provider} \u2014 \u63A5\u7D9A\u78BA\u8A8D\u4E2D...",
      statusReady: "{provider} \u6E96\u5099\u5B8C\u4E86",
      statusNotRunning: "{provider} \u672A\u8D77\u52D5 \u2014 \u30BF\u30FC\u30DF\u30CA\u30EB\u3067 node proxy-server/server.js \u3092\u5B9F\u884C\u3057\u3066\u304F\u3060\u3055\u3044",
      statusNeedKey: "{provider}\u306EAPI\u30AD\u30FC\u3092\u5165\u529B\u3057\u3066\u304F\u3060\u3055\u3044",
      enableOn: "\u7FFB\u8A33\u30AA\u30F3",
      enableOff: "\u7FFB\u8A33\u30AA\u30D5",
      retranslateFailed: "\u518D\u7FFB\u8A33\u5931\u6557 \xB7 {reason}",
      retranslatePartial: "{count}\u4EF6\u518D\u7FFB\u8A33 \xB7 {failed}\u4EF6\u5931\u6557",
      retranslateBlocked: "1\u65E5\u306E\u4E0A\u9650\u306B\u5230\u9054 \xB7 {time}\u4EE5\u964D\u306B\u5229\u7528\u53EF\u80FD"
    },
    settings: {
      model: "\u30E2\u30C7\u30EB",
      targetLang: "\u7FFB\u8A33\u8A00\u8A9E",
      displayMode: "\u8868\u793A\u30E2\u30FC\u30C9",
      uiLang: "\u753B\u9762\u8A00\u8A9E"
    },
    displayModeOptions: {
      translation: "\u7FFB\u8A33\u306E\u307F",
      both: "\u539F\u6587 + \u7FFB\u8A33(\u540C\u6642\u8868\u793A)",
      original: "\u539F\u6587\u306E\u307F"
    },
    style: {
      heading: "\u7FFB\u8A33\u5B57\u5E55\u306E\u30B9\u30BF\u30A4\u30EB",
      fontSize: "\u6587\u5B57\u30B5\u30A4\u30BA",
      fontColor: "\u6587\u5B57\u8272",
      bgColor: "\u80CC\u666F\u8272",
      bgOpacity: "\u80CC\u666F\u306E\u4E0D\u900F\u660E\u5EA6",
      panelColor: "\u30D1\u30CD\u30EB\u306E\u6587\u5B57\u8272",
      use: "\u4F7F\u7528",
      none: "\u306A\u3057",
      udemyDefault: "Udemy\u30C7\u30D5\u30A9\u30EB\u30C8",
      preview: "\u30D7\u30EC\u30D3\u30E5\u30FC",
      previewText: "\u7FFB\u8A33\u5B57\u5E55\u306E\u30D7\u30EC\u30D3\u30E5\u30FC"
    },
    cache: {
      title: "\u30AD\u30E3\u30C3\u30B7\u30E5",
      manage: "\u30AD\u30E3\u30C3\u30B7\u30E5\u7BA1\u7406",
      savedSubtitles: "\u4FDD\u5B58\u6E08\u307F\u306E\u7FFB\u8A33\u5B57\u5E55",
      search: "\u30BF\u30A4\u30C8\u30EB\u691C\u7D22(\u30B3\u30FC\u30B9\xB7\u30BB\u30AF\u30B7\u30E7\u30F3\xB7\u30EC\u30C3\u30B9\u30F3)",
      selectAll: "\u3059\u3079\u3066\u9078\u629E",
      deleteSelected: "\u9078\u629E\u3092\u524A\u9664",
      deleteAll: "\u3059\u3079\u3066\u524A\u9664",
      loading: "\u8AAD\u307F\u8FBC\u307F\u4E2D...",
      empty: "\u30AD\u30E3\u30C3\u30B7\u30E5\u306F\u7A7A\u3067\u3059",
      noResults: "\u691C\u7D22\u7D50\u679C\u304C\u3042\u308A\u307E\u305B\u3093",
      back: "\u623B\u308B",
      count: "{total}\u4EF6",
      selectedCount: "{selected}\u4EF6\u9078\u629E / \u5168{total}\u4EF6",
      subtitleCount: "\u5B57\u5E55{count}\u4EF6",
      noCourse: "(\u30B3\u30FC\u30B9\u4E0D\u660E)",
      noSection: "(\u30BB\u30AF\u30B7\u30E7\u30F3\u306A\u3057)",
      noTitle: "(\u30BF\u30A4\u30C8\u30EB\u306A\u3057)",
      delCourse: "\u3053\u306E\u30B3\u30FC\u30B9\u306E\u30AD\u30E3\u30C3\u30B7\u30E5\u3092\u3059\u3079\u3066\u524A\u9664",
      delSection: "\u3053\u306E\u30BB\u30AF\u30B7\u30E7\u30F3\u306E\u30AD\u30E3\u30C3\u30B7\u30E5\u3092\u524A\u9664",
      delLesson: "\u3053\u306E\u30EC\u30C3\u30B9\u30F3\u306E\u30AD\u30E3\u30C3\u30B7\u30E5\u3092\u524A\u9664"
    },
    badge: {
      translatingTo: "{lang}\u306B\u7FFB\u8A33\u4E2D",
      translatingProgress: "{lang}\u306B\u7FFB\u8A33\u4E2D {percent}%",
      done: "\u2713 {lang}\u306E\u7FFB\u8A33\u5B8C\u4E86",
      partial: "{lang}\u306E\u7FFB\u8A33\u5B8C\u4E86 \xB7 {failed}\u6587\u5931\u6557",
      error: {
        RATE_LIMIT: "\u30EA\u30AF\u30A8\u30B9\u30C8\u5236\u9650 \xB7 \u307E\u3082\u306A\u304F\u518D\u8A66\u884C",
        QUOTA_DAILY: "1\u65E5\u306E\u4E0A\u9650\u306B\u5230\u9054",
        AUTH: "API\u30AD\u30FC\u30A8\u30E9\u30FC",
        BAD_REQUEST: "\u30EA\u30AF\u30A8\u30B9\u30C8\u30A8\u30E9\u30FC \xB7 \u8A2D\u5B9A\u3092\u78BA\u8A8D",
        NOT_RUNNING: "\u30D7\u30ED\u30AD\u30B7\u672A\u8D77\u52D5",
        NO_API_KEY: "API\u30AD\u30FC\u672A\u8A2D\u5B9A",
        generic: "\u7FFB\u8A33\u30A8\u30E9\u30FC \xB7 \u518D\u8A66\u884C\u4E2D"
      }
    },
    model: {
      tier: {
        fastCheap: "\u9AD8\u901F\u30FB\u4F4E\u30B3\u30B9\u30C8",
        fast: "\u9AD8\u901F",
        balanced: "\u30D0\u30E9\u30F3\u30B9",
        recommended: "\u63A8\u5968",
        highQuality: "\u9AD8\u54C1\u8CEA"
      }
    },
    log: {
      button: "\u30A8\u30E9\u30FC\u30ED\u30B0",
      title: "\u30A8\u30E9\u30FC\u30ED\u30B0",
      subtitle: "\u6700\u65B010\u4EF6 \xB7 \u7FFB\u8A33\u30A8\u30E9\u30FC\u3068\u9045\u3044\u30EA\u30AF\u30A8\u30B9\u30C8",
      empty: "\u6700\u8FD1\u306E\u30A8\u30E9\u30FC\u306F\u3042\u308A\u307E\u305B\u3093",
      emptySub: "\u7FFB\u8A33\u4E2D\u306B\u554F\u984C\u304C\u8D77\u304D\u308B\u3068\u3053\u3053\u306B\u8A18\u9332\u3055\u308C\u307E\u3059",
      copy: "\u30B3\u30D4\u30FC",
      copied: "\u30B3\u30D4\u30FC\u3057\u307E\u3057\u305F",
      clear: "\u30AF\u30EA\u30A2",
      count: "{total}\u4EF6",
      detail: "\u8A73\u7D30\u30E1\u30C3\u30BB\u30FC\u30B8",
      lines: "{count}\u884C",
      failedLines: "{failed}/{lines}\u884C\u5931\u6557",
      took: "{sec}\u79D2\u304B\u304B\u308A\u307E\u3057\u305F",
      repeated: "{count}\u56DE\u7E70\u308A\u8FD4\u3057",
      waited: "{sec}\u79D2\u5F85\u6A5F",
      retryAfter: "{sec}\u79D2\u5F8C\u306B\u518D\u8A66\u884C\u63A8\u5968",
      noLecture: "(\u30EC\u30AF\u30C1\u30E3\u30FC\u60C5\u5831\u306A\u3057)",
      summaryErrors: "\u30A8\u30E9\u30FC {count}",
      summaryWarns: "\u8B66\u544A {count}",
      blockedBanner: "{provider} \u306E1\u65E5\u306E\u4E0A\u9650\u306B\u5230\u9054 \u2014 {time}\u306B\u518D\u958B\u3057\u307E\u3059",
      code: {
        RATE_LIMIT: "\u5206\u9593\u30EA\u30AF\u30A8\u30B9\u30C8\u4E0A\u9650\u8D85\u904E",
        QUOTA_DAILY: "1\u65E5\u306E\u4E0A\u9650\u306B\u5230\u9054",
        AUTH: "API\u30AD\u30FC\u30A8\u30E9\u30FC",
        BAD_REQUEST: "\u30EA\u30AF\u30A8\u30B9\u30C8\u62D2\u5426",
        SERVER: "AI\u30B5\u30FC\u30D0\u30FC\u30A8\u30E9\u30FC",
        TIMEOUT: "\u5FDC\u7B54\u30BF\u30A4\u30E0\u30A2\u30A6\u30C8",
        NETWORK: "\u30CD\u30C3\u30C8\u30EF\u30FC\u30AF\u30A8\u30E9\u30FC",
        EMPTY_RESPONSE: "\u7A7A\u306E\u5FDC\u7B54",
        BLOCKED: "\u5B89\u5168\u30D5\u30A3\u30EB\u30BF\u30FC\u3067\u30D6\u30ED\u30C3\u30AF",
        MAX_TOKENS: "\u5FDC\u7B54\u306E\u9577\u3055\u8D85\u904E",
        PARSE_ERROR: "\u4E00\u90E8\u306E\u884C\u306E\u7FFB\u8A33\u306B\u5931\u6557",
        NOT_RUNNING: "\u30D7\u30ED\u30AD\u30B7\u672A\u8D77\u52D5",
        DISCONNECTED: "\u62E1\u5F35\u6A5F\u80FD\u3068\u306E\u63A5\u7D9A\u5207\u308C",
        SLOW: "\u9045\u3044\u30EA\u30AF\u30A8\u30B9\u30C8",
        UNKNOWN: "\u4E0D\u660E\u306A\u30A8\u30E9\u30FC"
      },
      hint: {
        RATE_LIMIT: "\u5206\u9593\u306E\u4E0A\u9650\u306B\u9054\u3057\u307E\u3057\u305F\u3002\u9593\u9694\u3092\u7A7A\u3051\u3066\u81EA\u52D5\u3067\u518D\u8A66\u884C\u3057\u307E\u3059\u3002",
        QUOTA_DAILY: "\u4ECA\u65E5\u306E\u30EA\u30AF\u30A8\u30B9\u30C8\u4E0A\u9650\u3092\u4F7F\u3044\u5207\u308A\u307E\u3057\u305F\u3002\u4E0A\u9650\u304C\u30EA\u30BB\u30C3\u30C8\u3055\u308C\u308B\u3068\u518D\u958B\u3057\u307E\u3059\u3002",
        AUTH: "API\u30AD\u30FC\u304C\u7121\u52B9\u304B\u6A29\u9650\u304C\u3042\u308A\u307E\u305B\u3093\u3002\u30AD\u30FC\u3092\u78BA\u8A8D\u3057\u3066\u304F\u3060\u3055\u3044\u3002",
        BAD_REQUEST: "\u30EA\u30AF\u30A8\u30B9\u30C8\u304C\u62D2\u5426\u3055\u308C\u307E\u3057\u305F\u3002\u30E2\u30C7\u30EB\u8A2D\u5B9A\u3092\u78BA\u8A8D\u3057\u3066\u304F\u3060\u3055\u3044\u3002",
        SERVER: "AI\u30B5\u30FC\u30D0\u30FC\u304C\u4E00\u6642\u7684\u306B\u4E0D\u5B89\u5B9A\u3067\u3059\u3002\u81EA\u52D5\u3067\u518D\u8A66\u884C\u3057\u307E\u3059\u3002",
        TIMEOUT: "\u5FDC\u7B54\u306B\u6642\u9593\u304C\u304B\u304B\u308A\u3059\u304E\u307E\u3057\u305F\u3002\u81EA\u52D5\u3067\u518D\u8A66\u884C\u3057\u307E\u3059\u3002",
        NETWORK: "\u30A4\u30F3\u30BF\u30FC\u30CD\u30C3\u30C8\u63A5\u7D9A\u3092\u78BA\u8A8D\u3057\u3066\u304F\u3060\u3055\u3044\u3002\u81EA\u52D5\u3067\u518D\u8A66\u884C\u3057\u307E\u3059\u3002",
        EMPTY_RESPONSE: "\u7A7A\u306E\u5FDC\u7B54\u3092\u53D7\u3051\u53D6\u308A\u307E\u3057\u305F\u3002\u81EA\u52D5\u3067\u518D\u8A66\u884C\u3057\u307E\u3059\u3002",
        BLOCKED: "\u5B89\u5168\u30D5\u30A3\u30EB\u30BF\u30FC\u306B\u8A72\u5F53\u3057\u305F\u884C\u306F\u539F\u6587\u306E\u307E\u307E\u6B8B\u3057\u307E\u3059\u3002",
        MAX_TOKENS: "\u5FDC\u7B54\u304C\u9014\u4E2D\u3067\u5207\u308C\u307E\u3057\u305F\u3002\u5206\u5272\u3057\u3066\u518D\u9001\u3057\u307E\u3057\u305F\u3002",
        PARSE_ERROR: "\u4E00\u90E8\u306E\u884C\u3092\u7FFB\u8A33\u7D50\u679C\u3068\u5BFE\u5FDC\u4ED8\u3051\u3067\u304D\u307E\u305B\u3093\u3067\u3057\u305F\u3002\u81EA\u52D5\u3067\u518D\u8A66\u884C\u3057\u307E\u3059\u3002",
        NOT_RUNNING: "Claude Code \u30D7\u30ED\u30AD\u30B7\u304C\u8D77\u52D5\u3057\u3066\u3044\u307E\u305B\u3093\u3002\u30BF\u30FC\u30DF\u30CA\u30EB\u3067\u8D77\u52D5\u3057\u3066\u304F\u3060\u3055\u3044\u3002",
        DISCONNECTED: "\u62E1\u5F35\u6A5F\u80FD\u3068\u306E\u63A5\u7D9A\u304C\u5207\u308C\u307E\u3057\u305F\u3002\u81EA\u52D5\u3067\u518D\u8A66\u884C\u3057\u307E\u3059\u3002",
        SLOW: "\u5FDC\u7B54\u304C\u9045\u308C\u307E\u3057\u305F\u3002\u7D9A\u304F\u5834\u5408\u306F\u30EA\u30AF\u30A8\u30B9\u30C8\u4E0A\u9650\u306B\u8FD1\u3044\u53EF\u80FD\u6027\u304C\u3042\u308A\u307E\u3059\u3002",
        UNKNOWN: "\u4E88\u671F\u3057\u306A\u3044\u30A8\u30E9\u30FC\u3067\u3059\u3002\u8A73\u7D30\u3092\u78BA\u8A8D\u3057\u3066\u304F\u3060\u3055\u3044\u3002"
      }
    }
  };

  // content.src.js
  setCatalogs({ en: en_default, ko: ko_default, ja: ja_default });
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== "local") return;
    if (changes[STORAGE_KEYS.ENABLED]) {
      setBadgeEnabled(changes[STORAGE_KEYS.ENABLED].newValue);
      if (changes[STORAGE_KEYS.ENABLED].newValue === false) {
        removeAllTranslations();
        return;
      }
      const panel = document.querySelector(SELECTORS.panel);
      if (panel) scheduleTranslation(panel);
    }
    const RETRY_ON_CHANGE = [
      STORAGE_KEYS.PROVIDER,
      STORAGE_KEYS.GEMINI_API_KEY,
      STORAGE_KEYS.CLAUDE_API_KEY,
      STORAGE_KEYS.CLAUDE_CODE_URL,
      STORAGE_KEYS.GEMINI_MODEL,
      STORAGE_KEYS.CLAUDE_MODEL,
      STORAGE_KEYS.CLAUDE_CODE_MODEL
    ];
    if (changes[STORAGE_KEYS.ENABLED]?.newValue !== false && [STORAGE_KEYS.ENABLED, ...RETRY_ON_CHANGE].some((k) => changes[k] && changes[k].oldValue !== changes[k].newValue)) {
      setBadgeError(null);
      resetFailures();
    }
    if (changes[STORAGE_KEYS.TARGET_LANG]) {
      const code = resolveCode(changes[STORAGE_KEYS.TARGET_LANG].newValue);
      setActiveLang(code);
      setBadgeLang(code);
    }
    if (changes[STORAGE_KEYS.UI_LANG]) {
      setLocale(changes[STORAGE_KEYS.UI_LANG].newValue);
      setBadgeLang();
    }
    const hasStyleChange = Object.keys(changes).some((k) => STYLE_CHANGE_KEYS.has(k));
    if (hasStyleChange) {
      loadStyle().then(() => {
        updateDynamicStyles();
        applyDisplayModeAll();
        refreshCaption();
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
  onRequestStatus(({ key, error, failedCount, okCount }) => {
    if (key !== currentLectureKey()) return;
    if (error && error.code !== "PARSE_ERROR" && error.code !== "DISABLED") setBadgeError(error.code);
    else if (failedCount === 0 || okCount > 0) setBadgeError(null);
  });
  onProgress(setBadgeProgress);
  window.addEventListener("message", (event) => {
    if (event.source !== window || event.data?.type !== "UDEMY_TRANSLATOR_DIAG") return;
    const norm = (s) => (s || "").replace(/\s+/g, " ").trim();
    const captionDebug = getCaptionDebug();
    const capEl = document.querySelector(CAPTION_SELECTOR);
    const shown = capEl ? norm([...capEl.childNodes].filter((n) => !n.classList?.contains("caption-original")).map((n) => n.textContent).join("")) : "";
    const captionText = captionDebug.applied && norm(captionDebug.applied.translated) === shown ? captionDebug.applied.original : shown;
    const panel = document.querySelector(SELECTORS.panel);
    const activeSpan = panel?.querySelector(`p[data-purpose="transcript-cue-active"] ${SELECTORS.cueText}`);
    const activeRowText = activeSpan ? norm(activeSpan.dataset.original || activeSpan.textContent) : null;
    const video = document.querySelector("video");
    const report = {
      version: chrome.runtime.getManifest().version,
      path: location.pathname,
      displayMode: currentStyle.displayMode,
      videoTime: video ? Number(video.currentTime.toFixed(2)) : null,
      captionShownText: shown,
      captionOriginalText: captionText,
      panel: panel ? {
        rows: panel.querySelectorAll(SELECTORS.cueAll).length,
        activeRowText,
        activeRowEqualsCaption: activeRowText === captionText
      } : null,
      panelCacheForCaption: getCaptionCacheEntry(captionText),
      captionElement: captionDebug,
      ...getDiagnostics(captionText)
    };
    console.log(`[UdemyTranslator:DIAG]
${JSON.stringify(report, null, 2)}`);
  });
  setupNavigationHandler();
  console.log("[UdemyTranslator] content script loaded");
  initVttBridge();
  loadStyle().then(async () => {
    console.log("[UdemyTranslator] style loaded, initializing...");
    updateDynamicStyles();
    const s = await chrome.storage.local.get([STORAGE_KEYS.ENABLED, STORAGE_KEYS.TARGET_LANG, STORAGE_KEYS.UI_LANG]);
    setLocale(s[STORAGE_KEYS.UI_LANG]);
    setActiveLang(resolveCode(s[STORAGE_KEYS.TARGET_LANG]));
    setBadgeLang(resolveCode(s[STORAGE_KEYS.TARGET_LANG]));
    setBadgeEnabled(s[STORAGE_KEYS.ENABLED]);
    initPanelFinder();
    initCaptionFinder();
  }).catch((err) => {
    console.error("[UdemyTranslator] loadStyle failed:", err);
  });
})();
