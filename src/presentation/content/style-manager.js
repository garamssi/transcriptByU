import { SELECTORS, CAPTION_SELECTOR, ORIGINAL_CLASS, STORAGE_KEYS } from '../../domain/constants.js';
import { hexToRgba } from '../../shared/utils.js';

/**
 * 동적 CSS 생성 및 스타일 설정 관리
 */

// 현재 스타일/모드 설정
export const currentStyle = {
  fontSize: 14,
  fontColor: '#ffffff',
  bgColor: '#1e293b',
  bgOpacity: 80,
  bgEnabled: true,
  displayMode: 'translation'
};

/**
 * storage에서 스타일 설정을 로드한다.
 */
export async function loadStyle() {
  const stored = await chrome.storage.local.get([
    STORAGE_KEYS.STYLE_FONT_SIZE, STORAGE_KEYS.STYLE_FONT_COLOR,
    STORAGE_KEYS.STYLE_BG_COLOR, STORAGE_KEYS.STYLE_BG_ENABLED,
    STORAGE_KEYS.STYLE_BG_OPACITY, STORAGE_KEYS.DISPLAY_MODE,
  ]);
  currentStyle.fontSize = stored[STORAGE_KEYS.STYLE_FONT_SIZE] ?? 14;
  currentStyle.fontColor = stored[STORAGE_KEYS.STYLE_FONT_COLOR] ?? '#ffffff';
  currentStyle.bgColor = stored[STORAGE_KEYS.STYLE_BG_COLOR] ?? '#1e293b';
  currentStyle.bgOpacity = stored[STORAGE_KEYS.STYLE_BG_OPACITY] ?? 80;
  currentStyle.bgEnabled = stored[STORAGE_KEYS.STYLE_BG_ENABLED] ?? true;
  currentStyle.displayMode = stored[STORAGE_KEYS.DISPLAY_MODE] ?? 'translation';
}

/**
 * 동적 스타일시트를 생성/갱신한다.
 */
export function updateDynamicStyles() {
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
