// === Storage Keys ===
export const STORAGE_KEYS = {
  PROVIDER: 'provider',
  CLAUDE_API_KEY: 'claudeApiKey',
  GEMINI_API_KEY: 'geminiApiKey',
  CLAUDE_CODE_URL: 'claudeCodeUrl',
  API_KEY: 'apiKey', // legacy
  MODEL: 'model', // legacy
  CLAUDE_MODEL: 'claudeModel',
  GEMINI_MODEL: 'geminiModel',
  CLAUDE_CODE_MODEL: 'claudeCodeModel',
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
export const CHUNK_SIZE = 40;
export const DEFAULT_TARGET_LANG = '한국어';
export const DEFAULT_PROVIDER = 'claude-code';

// === DOM Selectors (Udemy) ===
export const SELECTORS = {
  panel: '[data-purpose="transcript-panel"]',
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
  'claude-code': [
    { value: 'claude-sonnet-4-6', label: 'Sonnet 4.6 (빠름)' },
    { value: 'claude-opus-4-6', label: 'Opus 4.6 (고품질)' },
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
