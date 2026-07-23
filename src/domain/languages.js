export const LANGUAGES = {
  en: { code: 'en', endonym: 'English', englishName: 'English',  script: 'latin'    },
  ko: { code: 'ko', endonym: '한국어',  englishName: 'Korean',   script: 'hangul'   },
  ja: { code: 'ja', endonym: '日本語',  englishName: 'Japanese', script: 'japanese' },
  zh: { code: 'zh', endonym: '中文',    englishName: 'Chinese',  script: 'chinese'  },
  es: { code: 'es', endonym: 'Español',           englishName: 'Spanish',    script: 'latin'      },
  pt: { code: 'pt', endonym: 'Português',          englishName: 'Portuguese', script: 'latin'      },
  fr: { code: 'fr', endonym: 'Français',           englishName: 'French',     script: 'latin'      },
  de: { code: 'de', endonym: 'Deutsch',            englishName: 'German',     script: 'latin'      },
  ru: { code: 'ru', endonym: 'Русский',            englishName: 'Russian',    script: 'cyrillic'   },
  ar: { code: 'ar', endonym: 'العربية',            englishName: 'Arabic',     script: 'arabic'     },
  hi: { code: 'hi', endonym: 'हिन्दी',              englishName: 'Hindi',      script: 'devanagari' },
  id: { code: 'id', endonym: 'Bahasa Indonesia',   englishName: 'Indonesian', script: 'latin'      },
};

export const TARGET_CODES = ['ko', 'ja', 'zh', 'es', 'pt', 'fr', 'de', 'ru', 'ar', 'hi', 'id'];
export const UI_CODES = ['en', 'ko', 'ja'];
export const DEFAULT_TARGET_CODE = 'ko';

export const ENDONYM_TO_CODE = { 'English': 'en', '한국어': 'ko', '日本語': 'ja', '中文': 'zh' };

export function byCode(code) { return LANGUAGES[code] || null; }
export function isValidTargetCode(code) { return TARGET_CODES.includes(code); }
export function scriptOf(code) { return LANGUAGES[code]?.script || null; }

/** true if exactly one registry language uses this script (so a script match ⇒ that language). */
export function isDistinctiveScript(script) {
  if (!script) return false;
  let n = 0;
  for (const l of Object.values(LANGUAGES)) if (l.script === script) n++;
  return n === 1;
}

/** 코드면 그대로, 레거시 엔도님이면 코드로, 미상이면 fallback. */
export function resolveCode(value, fallback = DEFAULT_TARGET_CODE) {
  if (!value) return fallback;
  if (LANGUAGES[value]) return value;
  return ENDONYM_TO_CODE[value] || fallback;
}
