import { hexToRgba } from '../../shared/utils.js';

// 미리보기 문구는 화면 언어가 아니라 번역 언어로 보여준다 (실제 자막이 그 언어로 나오므로).
const PREVIEW_TEXT = {
  ko: '번역된 자막 미리보기',
  ja: '翻訳字幕のプレビュー',
  zh: '翻译字幕预览',
  es: 'Vista previa de subtítulos traducidos',
  pt: 'Prévia da legenda traduzida',
  fr: 'Aperçu des sous-titres traduits',
  de: 'Vorschau der übersetzten Untertitel',
  ru: 'Предпросмотр переведённых субтитров',
  ar: 'معاينة الترجمة',
  hi: 'अनुवादित उपशीर्षक का पूर्वावलोकन',
  id: 'Pratinjau subtitle terjemahan',
};

export function setPreviewLang(preview, code) {
  preview.textContent = PREVIEW_TEXT[code] || PREVIEW_TEXT.ko;
  preview.lang = code;
}

/**
 * 캡션 스타일 미리보기를 초기화한다.
 * @param {object} elements - DOM 요소들
 */
export function initStylePreview({ fontSizeSlider, fontColorPicker, bgEnabledCheck, bgOpacitySlider, bgColorPicker, preview }) {
  return function updatePreview() {
    const size = parseInt(fontSizeSlider.value);
    const color = fontColorPicker.value;
    preview.style.fontSize = `${size}px`;
    preview.style.color = color;
    if (bgEnabledCheck.checked) {
      const opacity = parseInt(bgOpacitySlider.value);
      preview.style.backgroundColor = hexToRgba(bgColorPicker.value, opacity);
      preview.style.padding = '2px 6px';
      preview.style.borderRadius = '3px';
      preview.style.display = 'inline-block';
    } else {
      preview.style.backgroundColor = 'transparent';
      preview.style.padding = '0';
      preview.style.display = 'block';
    }
  };
}
