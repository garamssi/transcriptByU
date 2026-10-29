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
// 첫 청크만 작게 보내 첫 번역이 빨리 화면에 뜨게 한다 (나머지는 CHUNK_SIZE)
export const FIRST_CHUNK_SIZE = 15;

// === API 요청 제어 ===
// 응답 대기 상한. 60줄 청크 + thinking 은 수십 초 걸릴 수 있어 넉넉히 둔다
// (대기 중에는 스케줄러가 서비스 워커를 깨워 둔다).
export const API_REQUEST_TIMEOUT_MS = 60_000;
// 서비스 워커 안에서 기다릴 수 있는 최대 시간. 이보다 길면 기다리지 않고
// 즉시 RATE_LIMIT 으로 돌려보내고, 재시도 시점은 content 쪽이 정한다.
export const MAX_INLINE_WAIT_MS = 20_000;
// 클라우드 요청 시작 간격(적응형): 429 를 받으면 늘리고 성공하면 줄인다.
export const MIN_REQUEST_INTERVAL_MS = 1_000;
export const MAX_REQUEST_INTERVAL_MS = 8_000;
// 일일 한도 차단 상태 (chrome.storage.session — 서비스 워커 재시작에도 유지)
export const API_BLOCK_KEY = 'apiBlock';

// === 오류 로그 ===
export const ERROR_LOG_KEY = 'errorLog';
export const ERROR_LOG_SEEN_KEY = 'errorLogSeenAt';
export const ERROR_LOG_MAX = 10;
// 이 시간보다 오래 걸린 요청은 '느린 요청'으로 기록한다.
export const SLOW_REQUEST_MS = 10_000;

// === content 측 자동 재시도 ===
export const AUTO_RETRY_BASE_MS = 30_000;   // 30초 → 1분 → 2분 → 4분 → 5분(상한)
export const AUTO_RETRY_MAX_DELAY_MS = 5 * 60_000;
export const AUTO_RETRY_MAX_ATTEMPTS = 6;
// Claude Code 프록시: CLI 타임아웃(120초) + 프록시 큐 대기 여유
export const CLAUDE_CODE_TIMEOUT_MS = 300_000;

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
    { value: 'claude-haiku-5-5', name: 'Haiku 5.5', tier: 'fastCheap' },
    { value: 'claude-sonnet-5-5', name: 'Sonnet 5.5', tier: 'balanced' },
    { value: 'claude-opus-5-5', name: 'Opus 5.5', tier: 'highQuality' },
  ],
  // Gemini는 Flash 계열만 쓴다. 3.1 Pro는 아직 preview, 최상위 Gemini 4 Argon은 무료 티어가 없고
  // 단가가 Flash의 수 배라 자막 번역 용도에 맞지 않는다. (3.8 Flash-Lite는 TTS 전용이라 텍스트는 3.5가 최신)
  gemini: [
    { value: 'gemini-3.5-flash-lite', name: 'Flash-Lite 3.5', tier: 'fastCheap' },
    { value: 'gemini-3.8-flash', name: 'Flash 3.8', tier: 'recommended' },
  ],
  'claude-code': [
    { value: 'claude-sonnet-5-5', name: 'Sonnet 5.5', tier: 'fast' },
    { value: 'claude-opus-5-5', name: 'Opus 5.5', tier: 'highQuality' },
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
