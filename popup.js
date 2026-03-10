const $ = (id) => document.getElementById(id);

const STYLE_DEFAULTS = {
  fontSize: 14,
  fontColor: '#ffffff',
  bgColor: '#1e293b',
  bgOpacity: 80,
  bgEnabled: true,
  displayMode: 'translation'
};

const MODELS = {
  claude: [
    { value: 'claude-haiku-4-5-20251001', label: 'Haiku 4.5 (빠름/저렴)' },
    { value: 'claude-sonnet-4-6', label: 'Sonnet 4.6 (고품질)' }
  ],
  gemini: [
    { value: 'gemini-2.5-flash', label: 'Flash 2.5 (빠름/저렴)' },
    { value: 'gemini-2.0-flash', label: 'Flash 2.0 (빠름/저렴)' },
    { value: 'gemini-2.5-pro', label: '2.5 Pro (고품질)' }
  ]
};

document.addEventListener('DOMContentLoaded', async () => {
  const claudeApiKeyInput = $('claudeApiKey');
  const geminiApiKeyInput = $('geminiApiKey');
  const claudePanel = $('claudePanel');
  const geminiPanel = $('geminiPanel');
  const saveBtn = $('saveKey');
  const saveKeyText = $('saveKeyText');
  const saveStatus = $('saveStatus');
  const enableToggle = $('enableToggle');
  const modelSelect = $('model');
  const targetLangSelect = $('targetLang');
  const displayModeSelect = $('displayMode');
  const statusDot = $('statusDot');
  const statusText = $('statusText');

  // 캐시 다이얼로그
  const openCacheDialogBtn = $('openCacheDialog');
  const cacheDialogOverlay = $('cacheDialogOverlay');
  const closeCacheDialogBtn = $('closeCacheDialog');
  const cacheList = $('cacheList');
  const cacheBadge = $('cacheBadge');
  const cacheCount = $('cacheCount');
  const cacheSelectAll = $('cacheSelectAll');
  const cacheDeleteSelected = $('cacheDeleteSelected');
  const cacheDeleteAll = $('cacheDeleteAll');

  // 스타일 컨트롤
  const fontSizeSlider = $('styleFontSize');
  const fontSizeValue = $('fontSizeValue');
  const fontColorPicker = $('styleFontColor');
  const fontColorHex = $('fontColorHex');
  const bgColorPicker = $('styleBgColor');
  const bgColorHex = $('bgColorHex');
  const bgEnabledCheck = $('bgEnabled');
  const bgOpacitySlider = $('styleBgOpacity');
  const bgOpacityValue = $('bgOpacityValue');
  const bgOpacityGroup = $('bgOpacityGroup');
  const preview = $('stylePreview');

  // 접기/펼치기
  const styleToggle = $('styleToggle');
  const styleContent = $('styleContent');

  // 현재 선택된 provider
  let currentProvider = 'claude';

  // 저장된 설정 불러오기
  const stored = await chrome.storage.local.get([
    'provider', 'claudeApiKey', 'geminiApiKey', 'apiKey',
    'enabled', 'model', 'targetLang', 'displayMode',
    'styleFontSize', 'styleFontColor', 'styleBgColor', 'styleBgEnabled', 'styleBgOpacity',
    'styleExpanded'
  ]);

  // 하위 호환: 기존 apiKey → claudeApiKey 마이그레이션
  if (stored.apiKey && !stored.claudeApiKey) {
    stored.claudeApiKey = stored.apiKey;
    await chrome.storage.local.set({ claudeApiKey: stored.apiKey });
  }

  currentProvider = stored.provider || 'gemini';
  if (stored.claudeApiKey) claudeApiKeyInput.value = stored.claudeApiKey;
  if (stored.geminiApiKey) geminiApiKeyInput.value = stored.geminiApiKey;
  enableToggle.checked = stored.enabled !== false;
  if (stored.targetLang) targetLangSelect.value = stored.targetLang;
  if (stored.displayMode) displayModeSelect.value = stored.displayMode;

  // provider UI 초기화 + storage에 현재 provider/model 확정 저장
  switchProvider(currentProvider, stored.model);
  await chrome.storage.local.set({ provider: currentProvider, model: modelSelect.value });

  // 스타일 설정 불러오기
  const fontSize = stored.styleFontSize ?? STYLE_DEFAULTS.fontSize;
  const fontColor = stored.styleFontColor ?? STYLE_DEFAULTS.fontColor;
  const bgColor = stored.styleBgColor ?? STYLE_DEFAULTS.bgColor;
  const bgEnabled = stored.styleBgEnabled ?? STYLE_DEFAULTS.bgEnabled;
  const bgOpacity = stored.styleBgOpacity ?? STYLE_DEFAULTS.bgOpacity;

  fontSizeSlider.value = fontSize;
  fontSizeValue.textContent = `${fontSize}px`;
  fontColorPicker.value = fontColor;
  fontColorHex.textContent = fontColor;
  bgColorPicker.value = bgColor;
  bgEnabledCheck.checked = bgEnabled;
  bgOpacitySlider.value = bgOpacity;
  bgOpacityValue.textContent = `${bgOpacity}%`;
  updateBgVisibility();
  updatePreview();

  // 스타일 섹션 접기/펼치기 상태
  if (stored.styleExpanded) {
    styleToggle.setAttribute('aria-expanded', 'true');
    styleContent.classList.add('open');
  } else {
    styleToggle.setAttribute('aria-expanded', 'false');
  }

  updateStatus();

  // === 현재 강의 정보 표시 ===
  const lectureInfo = $('lectureInfo');
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (isUdemyCourseTab(tab)) {
      chrome.tabs.sendMessage(tab.id, { type: 'GET_LECTURE_INFO' }, (res) => {
        if (chrome.runtime.lastError || !res) return;
        const parts = [];
        if (res.section) parts.push(res.section);
        if (res.lecture) parts.push(res.lecture);
        if (parts.length > 0) {
          lectureInfo.textContent = parts.join(' › ');
          lectureInfo.title = parts.join(' › ');
        }
      });
    }
  } catch (_) {}

  // === Provider 전환 ===
  function switchProvider(provider, savedModel) {
    currentProvider = provider;

    // 탭 활성화
    document.querySelectorAll('.provider-tab').forEach(tab => {
      tab.classList.toggle('active', tab.dataset.provider === provider);
    });

    // 패널 전환
    claudePanel.classList.toggle('hidden', provider !== 'claude');
    geminiPanel.classList.toggle('hidden', provider !== 'gemini');

    // 모델 옵션 업데이트
    const models = MODELS[provider];
    modelSelect.innerHTML = models.map(m =>
      `<option value="${m.value}">${m.label}</option>`
    ).join('');

    // 저장된 모델이 현재 provider 모델 목록에 있으면 선택
    if (savedModel && models.some(m => m.value === savedModel)) {
      modelSelect.value = savedModel;
    }
  }

  // Provider 탭 클릭
  document.querySelectorAll('.provider-tab').forEach(tab => {
    tab.addEventListener('click', async () => {
      const provider = tab.dataset.provider;
      if (provider === currentProvider) return;
      switchProvider(provider);
      await chrome.storage.local.set({ provider, model: modelSelect.value });
      updateStatus();
    });
  });

  // === 이벤트 리스너 ===

  // 스타일 섹션 토글
  styleToggle.addEventListener('click', (e) => {
    e.preventDefault();
    const isOpen = styleContent.classList.toggle('open');
    styleToggle.setAttribute('aria-expanded', String(isOpen));
    chrome.storage.local.set({ styleExpanded: isOpen });
  });

  // API 키 저장
  saveBtn.addEventListener('click', async () => {
    const keyInput = currentProvider === 'claude' ? claudeApiKeyInput : geminiApiKeyInput;
    const key = keyInput.value.trim();
    if (!key) return;

    const storageKey = currentProvider === 'claude' ? 'claudeApiKey' : 'geminiApiKey';
    await chrome.storage.local.set({ [storageKey]: key });

    // 하위 호환: claude인 경우 apiKey도 동기화
    if (currentProvider === 'claude') {
      await chrome.storage.local.set({ apiKey: key });
    }

    saveKeyText.textContent = '';
    saveStatus.textContent = '저장 완료!';
    updateStatus();
    setTimeout(() => {
      saveKeyText.textContent = '저장';
      saveStatus.textContent = '';
    }, 2000);
  });

  // 비밀번호 표시 토글 (이벤트 위임)
  document.querySelectorAll('.toggle-vis-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const targetId = btn.dataset.target;
      const input = $(targetId);
      if (input) input.type = input.type === 'password' ? 'text' : 'password';
    });
  });

  enableToggle.addEventListener('change', async () => {
    await chrome.storage.local.set({ enabled: enableToggle.checked });
  });

  modelSelect.addEventListener('change', async () => {
    await chrome.storage.local.set({ model: modelSelect.value });
  });

  targetLangSelect.addEventListener('change', async () => {
    await chrome.storage.local.set({ targetLang: targetLangSelect.value });
  });

  displayModeSelect.addEventListener('change', async () => {
    await chrome.storage.local.set({ displayMode: displayModeSelect.value });
  });

  // 스타일 컨트롤
  fontSizeSlider.addEventListener('input', async () => {
    const val = parseInt(fontSizeSlider.value);
    fontSizeValue.textContent = `${val}px`;
    await chrome.storage.local.set({ styleFontSize: val });
    updatePreview();
  });

  fontColorPicker.addEventListener('input', async () => {
    const val = fontColorPicker.value;
    fontColorHex.textContent = val;
    await chrome.storage.local.set({ styleFontColor: val });
    updatePreview();
  });

  bgColorPicker.addEventListener('input', async () => {
    const val = bgColorPicker.value;
    await chrome.storage.local.set({ styleBgColor: val });
    updateBgVisibility();
    updatePreview();
  });

  bgEnabledCheck.addEventListener('change', async () => {
    await chrome.storage.local.set({ styleBgEnabled: bgEnabledCheck.checked });
    updateBgVisibility();
    updatePreview();
  });

  bgOpacitySlider.addEventListener('input', async () => {
    const val = parseInt(bgOpacitySlider.value);
    bgOpacityValue.textContent = `${val}%`;
    await chrome.storage.local.set({ styleBgOpacity: val });
    updatePreview();
  });

  // === 현재 자막 재번역 ===
  const retranslateBtn = $('retranslateBtn');
  const retranslateText = $('retranslateText');

  retranslateBtn.addEventListener('click', async () => {
    retranslateBtn.disabled = true;
    retranslateText.textContent = '재번역 중...';
    retranslateBtn.classList.add('btn-loading');

    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (isUdemyCourseTab(tab)) {
        const res = await chrome.tabs.sendMessage(tab.id, { type: 'RETRANSLATE_ALL' });
        const count = res?.count || 0;
        retranslateText.textContent = `${count}건 재번역 완료!`;
      } else {
        retranslateText.textContent = 'Udemy 페이지를 열어주세요';
      }
    } catch (_) {
      retranslateText.textContent = 'Udemy 페이지를 열어주세요';
    }

    setTimeout(() => {
      retranslateBtn.disabled = false;
      retranslateBtn.classList.remove('btn-loading');
      retranslateText.textContent = '현재 자막 재번역';
    }, 2500);
  });

  // === 캐시 다이얼로그 ===
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

  function escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
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

  // 행 클릭으로 체크박스 토글
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

  // === 헬퍼 함수 ===

  function updateBgVisibility() {
    const on = bgEnabledCheck.checked;
    bgColorHex.textContent = on ? bgColorPicker.value : '없음';
    bgOpacityGroup.style.display = on ? '' : 'none';
  }

  function hexToRgba(hex, opacity) {
    const r = parseInt(hex.slice(1, 3), 16);
    const g = parseInt(hex.slice(3, 5), 16);
    const b = parseInt(hex.slice(5, 7), 16);
    return `rgba(${r}, ${g}, ${b}, ${opacity / 100})`;
  }

  function updatePreview() {
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
  }

  function updateStatus() {
    const keyInput = currentProvider === 'claude' ? claudeApiKeyInput : geminiApiKeyInput;
    const hasKey = keyInput.value.trim().length > 0;
    const providerName = currentProvider === 'claude' ? 'Claude' : 'Gemini';
    if (!hasKey) {
      statusDot.className = 'status-dot error';
      statusText.textContent = `${providerName} API 키를 입력하세요`;
    } else {
      statusDot.className = 'status-dot connected';
      statusText.textContent = `${providerName} 준비됨`;
    }
  }

  function isUdemyCourseTab(tab) {
    return tab?.url?.startsWith('https://www.udemy.com/course/');
  }


});
