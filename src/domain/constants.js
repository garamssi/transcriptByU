// === Storage Keys ===
export const STORAGE_KEYS = {
  PROVIDER: 'provider',
  CLAUDE_API_KEY: 'claudeApiKey',
  GEMINI_API_KEY: 'geminiApiKey',
  CLAUDE_CODE_URL: 'claudeCodeUrl',
  // legacy: 단일 프로바이더 시절 키. 아직 마이그레이션/폴백에서 읽힘(settings-controller,
  // storage-adapter) — 제거하면 업그레이드 전 사용자의 저장된 키/모델이 유실된다.
  API_KEY: 'apiKey',
  MODEL: 'model',
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
  STYLE_PANEL_COLOR: 'stylePanelColor',
  STYLE_PANEL_COLOR_ENABLED: 'stylePanelColorEnabled',
  STYLE_EXPANDED: 'styleExpanded',
  UI_LANG: 'uiLang',
};

// === Cache ===
export const L2_PREFIX = 'lec_';
export const L1_MAX_SIZE = 50;

// === Translation ===
export const CHUNK_SIZE = 60;
export const DEFAULT_TARGET_LANG = '한국어';

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
  panelColor: '#1a1a1a',
  panelColorEnabled: false,
  displayMode: 'translation',
};

// === Model Options ===
export const MODELS = {
  claude: [
    { value: 'claude-haiku-4-5-20251001', name: 'Haiku 4.5', tier: 'fastCheap' },
    { value: 'claude-sonnet-5', name: 'Sonnet 5', tier: 'balanced' },
    { value: 'claude-opus-4-8', name: 'Opus 4.8', tier: 'highQuality' },
  ],
  gemini: [
    { value: 'gemini-3.1-flash-lite', name: 'Flash-Lite 3.1', tier: 'fastCheap' },
    { value: 'gemini-3.5-flash', name: 'Flash 3.5', tier: 'recommended' },
    { value: 'gemini-3.1-pro', name: '3.1 Pro', tier: 'highQuality' },
  ],
  'claude-code': [
    { value: 'claude-sonnet-5', name: 'Sonnet 5', tier: 'fast' },
    { value: 'claude-opus-4-8', name: 'Opus 4.8', tier: 'highQuality' },
  ],
};

// === Style Keys Set (for change detection) ===
export const STYLE_CHANGE_KEYS = new Set([
  STORAGE_KEYS.STYLE_FONT_SIZE,
  STORAGE_KEYS.STYLE_FONT_COLOR,
  STORAGE_KEYS.STYLE_BG_COLOR,
  STORAGE_KEYS.STYLE_BG_ENABLED,
  STORAGE_KEYS.STYLE_BG_OPACITY,
  STORAGE_KEYS.STYLE_PANEL_COLOR,
  STORAGE_KEYS.STYLE_PANEL_COLOR_ENABLED,
  STORAGE_KEYS.DISPLAY_MODE,
  STORAGE_KEYS.ENABLED,
]);
