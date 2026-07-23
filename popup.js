import { initStylePreview } from './src/presentation/popup/style-preview.js';
import { initCacheDialog } from './src/presentation/popup/cache-dialog.js';
import { initSettingsController } from './src/presentation/popup/settings-controller.js';
import en from './locales/en.json' with { type: 'json' };
import ko from './locales/ko.json' with { type: 'json' };
import { setCatalogs, setLocale, applyI18n } from './src/shared/i18n.js';
import { STORAGE_KEYS } from './src/domain/constants.js';

const $ = (id) => document.getElementById(id);

document.addEventListener('DOMContentLoaded', async () => {
  // i18n 초기화 (다른 모든 t()/applyI18n 사용보다 먼저)
  setCatalogs({ en, ko });
  const uiLangStored = await chrome.storage.local.get(STORAGE_KEYS.UI_LANG);
  setLocale(uiLangStored[STORAGE_KEYS.UI_LANG]); // 값 없으면 'en' 폴백
  applyI18n(document);

  // 스타일 미리보기 초기화
  const updatePreview = initStylePreview({
    fontSizeSlider: $('styleFontSize'),
    fontColorPicker: $('styleFontColor'),
    bgEnabledCheck: $('bgEnabled'),
    bgOpacitySlider: $('styleBgOpacity'),
    bgColorPicker: $('styleBgColor'),
    preview: $('stylePreview'),
  });

  // 캐시 다이얼로그 초기화
  initCacheDialog({
    openCacheDialogBtn: $('openCacheDialog'),
    cacheDialogOverlay: $('cacheDialogOverlay'),
    closeCacheDialogBtn: $('closeCacheDialog'),
    cacheList: $('cacheList'),
    cacheBadge: $('cacheBadge'),
    cacheCount: $('cacheCount'),
    cacheSearch: $('cacheSearch'),
    cacheSelectAll: $('cacheSelectAll'),
    cacheDeleteSelected: $('cacheDeleteSelected'),
    cacheDeleteAll: $('cacheDeleteAll'),
  });

  // 설정 컨트롤러 초기화
  await initSettingsController($, updatePreview);
});
