import { hexToRgba } from '../../shared/utils.js';

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
