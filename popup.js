import { initStylePreview } from './src/presentation/popup/style-preview.js';
import { initCacheDialog } from './src/presentation/popup/cache-dialog.js';
import { initSettingsController } from './src/presentation/popup/settings-controller.js';

const $ = (id) => document.getElementById(id);

document.addEventListener('DOMContentLoaded', async () => {
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
    cacheSelectAll: $('cacheSelectAll'),
    cacheDeleteSelected: $('cacheDeleteSelected'),
    cacheDeleteAll: $('cacheDeleteAll'),
  });

  // 설정 컨트롤러 초기화
  await initSettingsController($, updatePreview);
});
