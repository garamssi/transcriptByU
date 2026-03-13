// === Storage Keys ===
export const STORAGE_KEYS = {
  PROVIDER: 'provider',
  CLAUDE_API_KEY: 'claudeApiKey',
  GEMINI_API_KEY: 'geminiApiKey',
  OLLAMA_URL: 'ollamaUrl',
  API_KEY: 'apiKey', // legacy
  MODEL: 'model', // legacy
  CLAUDE_MODEL: 'claudeModel',
  GEMINI_MODEL: 'geminiModel',
  OLLAMA_MODEL: 'ollamaModel',
  ENABLED: 'enabled',
  TARGET_LANG: 'targetLang',
  DISPLAY_MODE: 'displayMode',
  STYLE_FONT_SIZE: 'styleFontSize',
  STYLE_FONT_COLOR: 'styleFontColor',
  STYLE_BG_COLOR: 'styleBgColor',
  STYLE_BG_ENABLED: 'styleBgEnabled',
  STYLE_BG_OPACITY: 'styleBgOpacity',
  STYLE_EXPANDED: 'styleExpanded',
};

// === Cache ===
export const L2_PREFIX = 'lec_';
export const L1_MAX_SIZE = 50;

// === Translation ===
export const CHUNK_SIZE = 100;
export const OLLAMA_CHUNK_SIZE = 5;
export const DEFAULT_TARGET_LANG = '한국어';
export const DEFAULT_PROVIDER = 'ollama';

// === DOM Selectors (Udemy) ===
export const SELECTORS = {
  panel: '[data-purpose="transcript-panel"]',
  cueActive: 'p[data-purpose="transcript-cue-active"]',
  cueAll: 'p[data-purpose="transcript-cue"], p[data-purpose="transcript-cue-active"]',
  cueText: 'span[data-purpose="cue-text"]',
};

export const LECTURE_SELECTORS = {
  currentItem: 'li[aria-current="true"] span[data-purpose="item-title"]',
  sectionPanel: 'div[data-purpose^="section-panel-"]',
  sectionTitle: 'span.ud-accordion-panel-title',
};

export const CAPTION_SELECTOR = '[data-purpose="captions-cue-text"]';
export const ORIGINAL_CLASS = 'udemy-translator-original';

// === Timing ===
export const SETTLE_DELAY_MS = 1500;

// === Style Defaults ===
export const STYLE_DEFAULTS = {
  fontSize: 14,
  fontColor: '#ffffff',
  bgColor: '#1e293b',
  bgOpacity: 80,
  bgEnabled: true,
  displayMode: 'translation',
};

// === Model Options ===
export const MODELS = {
  claude: [
    { value: 'claude-haiku-4-5-20251001', label: 'Haiku 4.5 (빠름/저렴)' },
    { value: 'claude-sonnet-4-6', label: 'Sonnet 4.6 (고품질)' },
  ],
  gemini: [
    { value: 'gemini-2.5-flash', label: 'Flash 2.5 (빠름/저렴)' },
    { value: 'gemini-2.0-flash', label: 'Flash 2.0 (빠름/저렴)' },
    { value: 'gemini-2.5-pro', label: '2.5 Pro (고품질)' },
  ],
  ollama: [
    { value: 'exaone3.5:7.8b', label: 'EXAONE 3.5 7.8B' },
    { value: 'qwen2.5:7b', label: 'Qwen 2.5 7B' },
    { value: 'llama3.1', label: 'Llama 3.1' },
    { value: 'gemma2', label: 'Gemma 2' },
    { value: 'mistral', label: 'Mistral' },
  ],
};

// === Style Keys Set (for change detection) ===
export const STYLE_CHANGE_KEYS = new Set([
  STORAGE_KEYS.STYLE_FONT_SIZE,
  STORAGE_KEYS.STYLE_FONT_COLOR,
  STORAGE_KEYS.STYLE_BG_COLOR,
  STORAGE_KEYS.STYLE_BG_ENABLED,
  STORAGE_KEYS.STYLE_BG_OPACITY,
  STORAGE_KEYS.DISPLAY_MODE,
  STORAGE_KEYS.ENABLED,
]);
