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
  panelColor: '#1a1a1a',
  panelColorEnabled: false,
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
    STORAGE_KEYS.STYLE_PANEL_COLOR, STORAGE_KEYS.STYLE_PANEL_COLOR_ENABLED,
  ]);
  currentStyle.fontSize = stored[STORAGE_KEYS.STYLE_FONT_SIZE] ?? 14;
  currentStyle.fontColor = stored[STORAGE_KEYS.STYLE_FONT_COLOR] ?? '#ffffff';
  currentStyle.bgColor = stored[STORAGE_KEYS.STYLE_BG_COLOR] ?? '#1e293b';
  currentStyle.bgOpacity = stored[STORAGE_KEYS.STYLE_BG_OPACITY] ?? 80;
  currentStyle.bgEnabled = stored[STORAGE_KEYS.STYLE_BG_ENABLED] ?? true;
  currentStyle.panelColor = stored[STORAGE_KEYS.STYLE_PANEL_COLOR] ?? '#1a1a1a';
  currentStyle.panelColorEnabled = stored[STORAGE_KEYS.STYLE_PANEL_COLOR_ENABLED] ?? false;
  currentStyle.displayMode = stored[STORAGE_KEYS.DISPLAY_MODE] ?? 'translation';
}

// 오버레이용 로컬 폰트(@font-face). CSP상 CDN 불가 → 확장 번들 fonts/*.woff2 를
// web_accessible_resources 로 노출한 뒤 getURL 로 주입한다. 파일이 없으면 시스템 폰트로 폴백.
const OVERLAY_FONTS = [
  [400, 'Pretendard-Regular.woff2'],
  [500, 'Pretendard-Medium.woff2'],
  [600, 'Pretendard-SemiBold.woff2'],
  [700, 'Pretendard-Bold.woff2'],
];

function buildFontFaces() {
  if (typeof chrome === 'undefined' || !chrome.runtime?.getURL) return '';
  return OVERLAY_FONTS.map(([w, file]) =>
    `@font-face{font-family:"Pretendard";font-weight:${w};font-display:swap;` +
    `src:url("${chrome.runtime.getURL('fonts/' + file)}") format("woff2");}`
  ).join('\n');
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
    ? `background-color: ${hexToRgba(currentStyle.bgColor, currentStyle.bgOpacity)} !important;`
    : '';

  styleEl.textContent = `
    ${buildFontFaces()}
    /* 번역된 cue-text 스타일 (트랜스크립트 패널).
       글자 크기는 유데미 기본값 유지 (슬라이더는 비디오 캡션에만 적용).
       글자색은 기본적으로 유데미 기본색 사용, 사용자가 켰을 때만 오버라이드 */
    ${SELECTORS.cueText}[data-original] {
      ${currentStyle.panelColorEnabled ? `color: ${currentStyle.panelColor} !important;` : ''}
    }
    /* 비디오 번역 캡션 — 어두운 배경 + 밝은 글씨 + 좌측 보라 액센트 바 (시안 SS2) */
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
    /* 원본 텍스트 (트랜스크립트 패널 both 모드에서 번역 아래 보조 표시).
       패널 번역 텍스트(유데미 기본 ~16px)의 약 87% 크기로 보조 가독성 확보 */
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
    /* 캡션 both 모드: 원본 자막 — 작은 어두운 pill (시안 SS2) */
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
