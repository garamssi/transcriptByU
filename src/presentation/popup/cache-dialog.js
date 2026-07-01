import { escapeHtml } from '../../shared/utils.js';

/**
 * 캐시 관리 다이얼로그를 초기화한다.
 * 화면 전환식(드릴인): 코스 목록 → 섹션 목록 → 레슨 목록.
 * @param {object} elements - DOM 요소들
 */
export function initCacheDialog({
  openCacheDialogBtn, cacheDialogOverlay, closeCacheDialogBtn,
  cacheList, cacheBadge, cacheCount,
  cacheSelectAll, cacheDeleteSelected, cacheDeleteAll,
}) {
  let cacheItems = [];
  // 현재 화면: level = 'courses' | 'sections' | 'lectures'
  let view = { level: 'courses', course: null, section: null };

  const collator = new Intl.Collator(undefined, { numeric: true, sensitivity: 'base' });
  const cmp = (a, b) => collator.compare(a || '', b || '');
  const attr = (s) => escapeHtml(s).replace(/"/g, '&quot;');
  const courseOf = (it) => it.course || '(코스 미상)';
  const sectionOf = (it) => it.section || '(섹션 없음)';

  const chevron = '<svg class="cache-row-chevron" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="9 18 15 12 9 6"/></svg>';
  const trashSvg = '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6"/></svg>';
  const backSvg = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="15 18 9 12 15 6"/></svg>';

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
    view = { level: 'courses', course: null, section: null };
    cacheSelectAll.checked = false;
    cacheDeleteSelected.disabled = true;

    const res = await chrome.runtime.sendMessage({ type: 'GET_CACHE_LIST' });
    cacheItems = res?.items || [];
    render();
  }

  // === 현재 뷰 데이터 helpers ===
  function courseNames() {
    return [...new Set(cacheItems.map(courseOf))].sort(cmp);
  }
  function sectionNames(course) {
    return [...new Set(cacheItems.filter(it => courseOf(it) === course).map(sectionOf))].sort(cmp);
  }
  function lecturesIn(course, section) {
    return cacheItems
      .filter(it => courseOf(it) === course && sectionOf(it) === section)
      .sort((a, b) => cmp(a.lecture, b.lecture));
  }
  const countInCourse = (course) => cacheItems.filter(it => courseOf(it) === course).length;
  const countInSection = (course, section) => cacheItems.filter(it => courseOf(it) === course && sectionOf(it) === section).length;

  // 삭제 등으로 현재 뷰가 유효하지 않으면 상위로 되돌린다.
  function normalizeView() {
    if (view.level === 'lectures' && countInSection(view.course, view.section) === 0) {
      view = { level: 'sections', course: view.course, section: null };
    }
    if (view.level === 'sections' && countInCourse(view.course) === 0) {
      view = { level: 'courses', course: null, section: null };
    }
  }

  const trashBtn = (dataAttrs, title) => `<button class="cache-row-del" ${dataAttrs} title="${title}">${trashSvg}</button>`;

  function render() {
    normalizeView();
    cacheBadge.textContent = cacheItems.length > 0 ? cacheItems.length : '';

    if (cacheItems.length === 0) {
      cacheList.innerHTML = '<div class="cache-empty"><svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M21 16V8a2 2 0 00-1-1.73l-7-4a2 2 0 00-2 0l-7 4A2 2 0 003 8v8a2 2 0 001 1.73l7 4a2 2 0 002 0l7-4A2 2 0 0021 16z"/></svg>캐시가 비어 있습니다</div>';
      cacheDeleteAll.disabled = true;
      cacheSelectAll.checked = false;
      cacheSelectAll.disabled = true;
      cacheDeleteSelected.disabled = true;
      cacheCount.textContent = '0개 항목';
      return;
    }
    cacheDeleteAll.disabled = false;

    if (view.level === 'courses') cacheList.innerHTML = renderCourses();
    else if (view.level === 'sections') cacheList.innerHTML = renderSections();
    else cacheList.innerHTML = renderLectures();

    cacheList.scrollTop = 0;
    // 선택 도구는 레슨 화면에서만 활성화
    cacheSelectAll.disabled = view.level !== 'lectures';
    updateFooter();
  }

  function navBar(crumb) {
    return `<div class="cache-nav">
      <button class="cache-back">${backSvg}<span>뒤로</span></button>
      <span class="cache-breadcrumb" title="${attr(crumb)}">${escapeHtml(crumb)}</span>
    </div>`;
  }

  function renderCourses() {
    return courseNames().map(course => `
      <div class="cache-row" data-nav="course" data-course="${attr(course)}">
        <span class="cache-row-title">${escapeHtml(course)}</span>
        <span class="cache-group-count">${countInCourse(course)}</span>
        ${trashBtn(`data-course="${attr(course)}"`, '이 코스 캐시 전체 삭제')}
        ${chevron}
      </div>`).join('');
  }

  function renderSections() {
    let html = navBar(view.course);
    html += sectionNames(view.course).map(section => `
      <div class="cache-row" data-nav="section" data-course="${attr(view.course)}" data-section="${attr(section)}">
        <span class="cache-row-title">${escapeHtml(section)}</span>
        <span class="cache-group-count">${countInSection(view.course, section)}</span>
        ${trashBtn(`data-course="${attr(view.course)}" data-section="${attr(section)}"`, '이 섹션 캐시 삭제')}
        ${chevron}
      </div>`).join('');
    return html;
  }

  function renderLectures() {
    let html = navBar(`${view.course} › ${view.section}`);
    html += lecturesIn(view.course, view.section).map(item => {
      const title = item.lecture || '(제목 없음)';
      return `
      <div class="cache-item" data-key="${attr(item.key)}">
        <input type="checkbox" class="cache-check" data-key="${attr(item.key)}" />
        <div class="cache-item-content">
          <div class="cache-item-lecture">${escapeHtml(title)}</div>
          <div class="cache-item-meta">
            <span class="cache-item-tag">${item.count}개 자막</span>
            <span class="cache-item-tag">${escapeHtml(item.lang)}</span>
          </div>
        </div>
        <button class="cache-item-del" data-key="${attr(item.key)}" title="이 레슨 캐시 삭제">${trashSvg}</button>
      </div>`;
    }).join('');
    return html;
  }

  function getCheckedKeys() {
    return Array.from(cacheList.querySelectorAll('.cache-check:checked')).map(cb => cb.dataset.key);
  }

  function updateFooter() {
    const total = cacheItems.length;
    const checked = cacheList.querySelectorAll('.cache-check:checked').length;
    const visible = cacheList.querySelectorAll('.cache-check').length;
    cacheDeleteSelected.disabled = checked === 0;
    cacheSelectAll.checked = view.level === 'lectures' && visible > 0 && checked === visible;
    cacheCount.textContent = checked > 0 ? `${checked}개 선택 / 전체 ${total}개` : `${total}개 항목`;
  }

  async function deleteKeys(keys) {
    if (!keys || keys.length === 0) return;
    await chrome.runtime.sendMessage({ type: 'DELETE_CACHE_ITEMS', keys });
    const removed = new Set(keys);
    cacheItems = cacheItems.filter(item => !removed.has(item.key));
    cacheSelectAll.checked = false;
    render();
  }

  // === 이벤트 바인딩 ===
  openCacheDialogBtn.addEventListener('click', openCacheDialog);

  closeCacheDialogBtn.addEventListener('click', () => {
    cacheDialogOverlay.classList.remove('open');
  });

  cacheDialogOverlay.addEventListener('click', (e) => {
    if (e.target === cacheDialogOverlay) cacheDialogOverlay.classList.remove('open');
  });

  cacheSelectAll.addEventListener('change', () => {
    cacheList.querySelectorAll('.cache-check').forEach(cb => { cb.checked = cacheSelectAll.checked; });
    updateFooter();
  });

  cacheList.addEventListener('change', (e) => {
    if (e.target.classList.contains('cache-check')) updateFooter();
  });

  cacheList.addEventListener('click', async (e) => {
    // 뒤로가기
    if (e.target.closest('.cache-back')) {
      if (view.level === 'lectures') view = { level: 'sections', course: view.course, section: null };
      else if (view.level === 'sections') view = { level: 'courses', course: null, section: null };
      cacheSelectAll.checked = false;
      render();
      return;
    }

    // 그룹(코스/섹션) 삭제
    const rowDel = e.target.closest('.cache-row-del');
    if (rowDel) {
      e.stopPropagation();
      const { course, section } = rowDel.dataset;
      const keys = cacheItems.filter(it => {
        if (section !== undefined) return courseOf(it) === course && sectionOf(it) === section;
        return courseOf(it) === course;
      }).map(it => it.key);
      await deleteKeys(keys);
      return;
    }

    // 레슨 개별 삭제
    const itemDel = e.target.closest('.cache-item-del');
    if (itemDel) {
      e.stopPropagation();
      await deleteKeys([itemDel.dataset.key]);
      return;
    }

    // 코스/섹션 행 클릭 → 하위 화면으로 전환
    const navRow = e.target.closest('.cache-row');
    if (navRow) {
      if (navRow.dataset.nav === 'course') {
        view = { level: 'sections', course: navRow.dataset.course, section: null };
      } else if (navRow.dataset.nav === 'section') {
        view = { level: 'lectures', course: navRow.dataset.course, section: navRow.dataset.section };
      }
      cacheSelectAll.checked = false;
      render();
      return;
    }

    // 체크박스 직접 클릭은 그대로 둠
    if (e.target.classList.contains('cache-check')) return;

    // 레슨 행 클릭 시 체크박스 토글
    const itemRow = e.target.closest('.cache-item');
    if (itemRow) {
      const cb = itemRow.querySelector('.cache-check');
      if (cb) { cb.checked = !cb.checked; updateFooter(); }
    }
  });

  cacheDeleteSelected.addEventListener('click', async () => {
    await deleteKeys(getCheckedKeys());
  });

  cacheDeleteAll.addEventListener('click', async () => {
    await chrome.runtime.sendMessage({ type: 'CLEAR_CACHE' });
    cacheItems = [];
    view = { level: 'courses', course: null, section: null };
    cacheSelectAll.checked = false;
    render();
  });
}
