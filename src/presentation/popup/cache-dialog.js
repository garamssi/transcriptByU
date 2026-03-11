import { escapeHtml } from '../../shared/utils.js';

/**
 * 캐시 관리 다이얼로그를 초기화한다.
 * @param {object} elements - DOM 요소들
 */
export function initCacheDialog({
  openCacheDialogBtn, cacheDialogOverlay, closeCacheDialogBtn,
  cacheList, cacheBadge, cacheCount,
  cacheSelectAll, cacheDeleteSelected, cacheDeleteAll,
}) {
  let cacheItems = [];

  // 초기 배지 업데이트
  loadCacheBadge();

  async function loadCacheBadge() {
    const res = await chrome.runtime.sendMessage({ type: 'GET_CACHE_LIST' });
    const count = res?.items?.length || 0;
    cacheBadge.textContent = count > 0 ? count : '';
  }

  async function openCacheDialog() {
    cacheDialogOverlay.classList.add('open');
    cacheList.innerHTML = '<div class="cache-empty"><svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/></svg>로딩 중...</div>';
    cacheSelectAll.checked = false;
    cacheDeleteSelected.disabled = true;

    const res = await chrome.runtime.sendMessage({ type: 'GET_CACHE_LIST' });
    cacheItems = res?.items || [];
    renderCacheList();
  }

  function renderCacheList() {
    const totalLines = cacheItems.reduce((sum, item) => sum + (item.count || 0), 0);
    cacheCount.textContent = `${cacheItems.length}개 강의 / ${totalLines}줄`;
    cacheBadge.textContent = cacheItems.length > 0 ? cacheItems.length : '';

    if (cacheItems.length === 0) {
      cacheList.innerHTML = '<div class="cache-empty"><svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M21 16V8a2 2 0 00-1-1.73l-7-4a2 2 0 00-2 0l-7 4A2 2 0 003 8v8a2 2 0 001 1.73l7 4a2 2 0 002 0l7-4A2 2 0 0021 16z"/></svg>캐시가 비어 있습니다</div>';
      cacheDeleteAll.disabled = true;
      return;
    }

    cacheDeleteAll.disabled = false;
    cacheList.innerHTML = cacheItems.map((item, i) => {
      const title = item.lecture || '(제목 없음)';
      const sectionHtml = item.section
        ? `<div class="cache-item-section">${escapeHtml(item.section)}</div>`
        : '';
      return `
      <div class="cache-item" data-index="${i}">
        <input type="checkbox" class="cache-check" data-index="${i}" />
        <div class="cache-item-content">
          <div class="cache-item-lecture">${escapeHtml(title)}</div>
          ${sectionHtml}
          <div class="cache-item-meta">
            <span class="cache-item-tag">${item.count}개 자막</span>
            <span class="cache-item-tag">${escapeHtml(item.lang)}</span>
          </div>
        </div>
      </div>`;
    }).join('');

    updateDeleteBtn();
  }

  function getCheckedKeys() {
    const checks = cacheList.querySelectorAll('.cache-check:checked');
    return Array.from(checks).map(cb => cacheItems[cb.dataset.index].key);
  }

  function updateDeleteBtn() {
    const checked = cacheList.querySelectorAll('.cache-check:checked').length;
    cacheDeleteSelected.disabled = checked === 0;
    cacheSelectAll.checked = checked > 0 && checked === cacheItems.length;
  }

  // === 이벤트 바인딩 ===
  openCacheDialogBtn.addEventListener('click', openCacheDialog);

  closeCacheDialogBtn.addEventListener('click', () => {
    cacheDialogOverlay.classList.remove('open');
  });

  cacheDialogOverlay.addEventListener('click', (e) => {
    if (e.target === cacheDialogOverlay) {
      cacheDialogOverlay.classList.remove('open');
    }
  });

  cacheSelectAll.addEventListener('change', () => {
    const checks = cacheList.querySelectorAll('.cache-check');
    checks.forEach(cb => { cb.checked = cacheSelectAll.checked; });
    updateDeleteBtn();
  });

  cacheList.addEventListener('change', (e) => {
    if (e.target.classList.contains('cache-check')) {
      updateDeleteBtn();
    }
  });

  cacheList.addEventListener('click', (e) => {
    if (e.target.classList.contains('cache-check')) return;
    const item = e.target.closest('.cache-item');
    if (!item) return;
    const cb = item.querySelector('.cache-check');
    if (cb) {
      cb.checked = !cb.checked;
      updateDeleteBtn();
    }
  });

  cacheDeleteSelected.addEventListener('click', async () => {
    const keys = getCheckedKeys();
    if (keys.length === 0) return;
    await chrome.runtime.sendMessage({ type: 'DELETE_CACHE_ITEMS', keys });
    cacheItems = cacheItems.filter(item => !keys.includes(item.key));
    renderCacheList();
    cacheSelectAll.checked = false;
  });

  cacheDeleteAll.addEventListener('click', async () => {
    await chrome.runtime.sendMessage({ type: 'CLEAR_CACHE' });
    cacheItems = [];
    renderCacheList();
    cacheSelectAll.checked = false;
  });
}
