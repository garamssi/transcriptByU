import { STYLE_DEFAULTS, MODELS, STORAGE_KEYS } from '../../domain/constants.js';
import { checkClaudeCodeConnection } from '../../infrastructure/api/claude-code-client.js';
import { t, applyI18n, setLocale, getLocale } from '../../shared/i18n.js';

/**
 * 설정 UI를 초기화한다.
 * @param {Function} $ - DOM element getter
 * @param {Function} updatePreview - 스타일 미리보기 업데이트 함수
 */
export async function initSettingsController($, updatePreview) {
  const claudeApiKeyInput = $('claudeApiKey');
  const geminiApiKeyInput = $('geminiApiKey');
  const claudeCodeUrlInput = $('claudeCodeUrl');
  const claudePanel = $('claudePanel');
  const geminiPanel = $('geminiPanel');
  const claudeCodePanel = $('claudeCodePanel');
  const saveBtn = $('saveKey');
  const saveKeyText = $('saveKeyText');
  const saveStatus = $('saveStatus');
  const enableToggle = $('enableToggle');
  const modelSelect = $('model');
  const targetLangSelect = $('targetLang');
  const displayModeSelect = $('displayMode');
  const statusDot = $('statusDot');
  const statusText = $('statusText');

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
  const panelColorPicker = $('stylePanelColor');
  const panelColorHex = $('panelColorHex');
  const panelColorEnabledCheck = $('panelColorEnabled');

  // 접기/펼치기
  const styleToggle = $('styleToggle');
  const styleContent = $('styleContent');

  let currentProvider = 'claude';

  // === 저장된 설정 불러오기 ===
  const stored = await chrome.storage.local.get([
    STORAGE_KEYS.PROVIDER, STORAGE_KEYS.CLAUDE_API_KEY, STORAGE_KEYS.GEMINI_API_KEY, STORAGE_KEYS.CLAUDE_CODE_URL, STORAGE_KEYS.API_KEY,
    STORAGE_KEYS.ENABLED, STORAGE_KEYS.MODEL,
    STORAGE_KEYS.CLAUDE_MODEL, STORAGE_KEYS.GEMINI_MODEL, STORAGE_KEYS.CLAUDE_CODE_MODEL,
    STORAGE_KEYS.TARGET_LANG, STORAGE_KEYS.DISPLAY_MODE,
    STORAGE_KEYS.STYLE_FONT_SIZE, STORAGE_KEYS.STYLE_FONT_COLOR, STORAGE_KEYS.STYLE_BG_COLOR,
    STORAGE_KEYS.STYLE_BG_ENABLED, STORAGE_KEYS.STYLE_BG_OPACITY, STORAGE_KEYS.STYLE_EXPANDED,
    STORAGE_KEYS.STYLE_PANEL_COLOR, STORAGE_KEYS.STYLE_PANEL_COLOR_ENABLED,
  ]);

  // 하위 호환: 기존 apiKey → claudeApiKey 마이그레이션
  if (stored[STORAGE_KEYS.API_KEY] && !stored[STORAGE_KEYS.CLAUDE_API_KEY]) {
    stored[STORAGE_KEYS.CLAUDE_API_KEY] = stored[STORAGE_KEYS.API_KEY];
    await chrome.storage.local.set({ [STORAGE_KEYS.CLAUDE_API_KEY]: stored[STORAGE_KEYS.API_KEY] });
  }

  currentProvider = stored[STORAGE_KEYS.PROVIDER] || 'claude-code';
  if (stored[STORAGE_KEYS.CLAUDE_API_KEY]) claudeApiKeyInput.value = stored[STORAGE_KEYS.CLAUDE_API_KEY];
  if (stored[STORAGE_KEYS.GEMINI_API_KEY]) geminiApiKeyInput.value = stored[STORAGE_KEYS.GEMINI_API_KEY];
  claudeCodeUrlInput.value = stored[STORAGE_KEYS.CLAUDE_CODE_URL] || 'http://localhost:3456';
  enableToggle.checked = stored[STORAGE_KEYS.ENABLED] !== false;
  if (stored[STORAGE_KEYS.TARGET_LANG]) targetLangSelect.value = stored[STORAGE_KEYS.TARGET_LANG];
  if (stored[STORAGE_KEYS.DISPLAY_MODE]) displayModeSelect.value = stored[STORAGE_KEYS.DISPLAY_MODE];

  // provider UI 초기화
  const savedModelForProvider = getProviderModelKey(currentProvider);
  switchProvider(currentProvider, stored[savedModelForProvider] || stored[STORAGE_KEYS.MODEL]);
  await saveProviderModel();

  // 스타일 설정 불러오기
  const fontSize = stored[STORAGE_KEYS.STYLE_FONT_SIZE] ?? STYLE_DEFAULTS.fontSize;
  const fontColor = stored[STORAGE_KEYS.STYLE_FONT_COLOR] ?? STYLE_DEFAULTS.fontColor;
  const bgColor = stored[STORAGE_KEYS.STYLE_BG_COLOR] ?? STYLE_DEFAULTS.bgColor;
  const bgEnabled = stored[STORAGE_KEYS.STYLE_BG_ENABLED] ?? STYLE_DEFAULTS.bgEnabled;
  const bgOpacity = stored[STORAGE_KEYS.STYLE_BG_OPACITY] ?? STYLE_DEFAULTS.bgOpacity;
  const panelColor = stored[STORAGE_KEYS.STYLE_PANEL_COLOR] ?? STYLE_DEFAULTS.panelColor;
  const panelColorEnabled = stored[STORAGE_KEYS.STYLE_PANEL_COLOR_ENABLED] ?? STYLE_DEFAULTS.panelColorEnabled;

  fontSizeSlider.value = fontSize;
  fontSizeValue.textContent = `${fontSize}px`;
  fontColorPicker.value = fontColor;
  fontColorHex.textContent = fontColor;
  bgColorPicker.value = bgColor;
  bgEnabledCheck.checked = bgEnabled;
  bgOpacitySlider.value = bgOpacity;
  bgOpacityValue.textContent = `${bgOpacity}%`;
  panelColorPicker.value = panelColor;
  panelColorEnabledCheck.checked = panelColorEnabled;
  updatePanelColorHex();
  updateBgVisibility();
  updatePreview();

  // 스타일 섹션 접기/펼치기 상태
  if (stored[STORAGE_KEYS.STYLE_EXPANDED]) {
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

  // === 프로바이더별 모델 키 ===
  function getProviderModelKey(provider) {
    const keys = { claude: STORAGE_KEYS.CLAUDE_MODEL, gemini: STORAGE_KEYS.GEMINI_MODEL, 'claude-code': STORAGE_KEYS.CLAUDE_CODE_MODEL };
    return keys[provider];
  }

  async function saveProviderModel() {
    await chrome.storage.local.set({
      [STORAGE_KEYS.PROVIDER]: currentProvider,
      [getProviderModelKey(currentProvider)]: modelSelect.value,
    });
  }

  // === Provider 전환 ===
  function switchProvider(provider, savedModel) {
    currentProvider = provider;

    document.querySelectorAll('.provider-tab').forEach(tab => {
      tab.classList.toggle('active', tab.dataset.provider === provider);
    });

    claudePanel.classList.toggle('hidden', provider !== 'claude');
    geminiPanel.classList.toggle('hidden', provider !== 'gemini');
    claudeCodePanel.classList.toggle('hidden', provider !== 'claude-code');

    const models = MODELS[provider];
    modelSelect.innerHTML = models.map(m =>
      `<option value="${m.value}">${m.name} (${t('model.tier.' + m.tier)})</option>`
    ).join('');

    if (savedModel && models.some(m => m.value === savedModel)) {
      modelSelect.value = savedModel;
    }
  }

  // Provider 탭 클릭
  document.querySelectorAll('.provider-tab').forEach(tab => {
    tab.addEventListener('click', async () => {
      const provider = tab.dataset.provider;
      if (provider === currentProvider) return;
      // 전환 전: 현재 프로바이더의 모델을 저장된 값으로 복원
      const prevModelKey = getProviderModelKey(provider);
      const prevStored = await chrome.storage.local.get(prevModelKey);
      switchProvider(provider, prevStored[prevModelKey]);
      await saveProviderModel();
      updateStatus();
    });
  });

  // === 이벤트 리스너 ===

  // 스타일 섹션 토글
  styleToggle.addEventListener('click', (e) => {
    e.preventDefault();
    const isOpen = styleContent.classList.toggle('open');
    styleToggle.setAttribute('aria-expanded', String(isOpen));
    chrome.storage.local.set({ [STORAGE_KEYS.STYLE_EXPANDED]: isOpen });
  });

  // API 키 저장
  saveBtn.addEventListener('click', async () => {
    if (currentProvider === 'claude-code') {
      const url = claudeCodeUrlInput.value.trim() || 'http://localhost:3456';
      await chrome.storage.local.set({ [STORAGE_KEYS.CLAUDE_CODE_URL]: url });
    } else {
      const keyInput = currentProvider === 'claude' ? claudeApiKeyInput : geminiApiKeyInput;
      const key = keyInput.value.trim();
      if (!key) return;

      const storageKey = currentProvider === 'claude' ? STORAGE_KEYS.CLAUDE_API_KEY : STORAGE_KEYS.GEMINI_API_KEY;
      await chrome.storage.local.set({ [storageKey]: key });
    }

    saveKeyText.textContent = '';
    saveStatus.textContent = t('popup.saved');
    updateStatus();
    setTimeout(() => {
      saveKeyText.textContent = t('popup.save');
      saveStatus.textContent = '';
    }, 2000);
  });

  // 비밀번호 표시 토글
  document.querySelectorAll('.toggle-vis-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const targetId = btn.dataset.target;
      const input = $(targetId);
      if (input) input.type = input.type === 'password' ? 'text' : 'password';
    });
  });

  enableToggle.addEventListener('change', async () => {
    await chrome.storage.local.set({ [STORAGE_KEYS.ENABLED]: enableToggle.checked });
  });

  modelSelect.addEventListener('change', async () => {
    await saveProviderModel();
  });

  targetLangSelect.addEventListener('change', async () => {
    await chrome.storage.local.set({ [STORAGE_KEYS.TARGET_LANG]: targetLangSelect.value });
  });

  displayModeSelect.addEventListener('change', async () => {
    await chrome.storage.local.set({ [STORAGE_KEYS.DISPLAY_MODE]: displayModeSelect.value });
  });

  // 화면 언어(UI locale) 셀렉트
  const uiLangSelect = $('uiLang');
  uiLangSelect.value = getLocale(); // popup.js가 이미 setLocale 완료
  uiLangSelect.addEventListener('change', async () => {
    setLocale(uiLangSelect.value);
    await chrome.storage.local.set({ [STORAGE_KEYS.UI_LANG]: uiLangSelect.value });
    applyI18n(document);                                  // 정적 텍스트
    switchProvider(currentProvider, modelSelect.value);    // 모델 라벨 재조립(선택 유지)
    updateStatus();                                        // 상태 문구
    updateBgVisibility();                                  // 배경 hex/None
    updatePanelColorHex();                                 // 패널색 hex/기본
  });

  // 스타일 컨트롤
  fontSizeSlider.addEventListener('input', async () => {
    const val = parseInt(fontSizeSlider.value);
    fontSizeValue.textContent = `${val}px`;
    await chrome.storage.local.set({ [STORAGE_KEYS.STYLE_FONT_SIZE]: val });
    updatePreview();
  });

  fontColorPicker.addEventListener('input', async () => {
    const val = fontColorPicker.value;
    fontColorHex.textContent = val;
    await chrome.storage.local.set({ [STORAGE_KEYS.STYLE_FONT_COLOR]: val });
    updatePreview();
  });

  bgColorPicker.addEventListener('input', async () => {
    const val = bgColorPicker.value;
    await chrome.storage.local.set({ [STORAGE_KEYS.STYLE_BG_COLOR]: val });
    updateBgVisibility();
    updatePreview();
  });

  bgEnabledCheck.addEventListener('change', async () => {
    await chrome.storage.local.set({ [STORAGE_KEYS.STYLE_BG_ENABLED]: bgEnabledCheck.checked });
    updateBgVisibility();
    updatePreview();
  });

  bgOpacitySlider.addEventListener('input', async () => {
    const val = parseInt(bgOpacitySlider.value);
    bgOpacityValue.textContent = `${val}%`;
    await chrome.storage.local.set({ [STORAGE_KEYS.STYLE_BG_OPACITY]: val });
    updatePreview();
  });

  panelColorPicker.addEventListener('input', async () => {
    await chrome.storage.local.set({ [STORAGE_KEYS.STYLE_PANEL_COLOR]: panelColorPicker.value });
    updatePanelColorHex();
  });

  panelColorEnabledCheck.addEventListener('change', async () => {
    await chrome.storage.local.set({ [STORAGE_KEYS.STYLE_PANEL_COLOR_ENABLED]: panelColorEnabledCheck.checked });
    updatePanelColorHex();
  });

  // === 현재 자막 재번역 ===
  const retranslateBtn = $('retranslateBtn');
  const retranslateText = $('retranslateText');

  retranslateBtn.addEventListener('click', async () => {
    retranslateBtn.disabled = true;
    retranslateText.textContent = t('popup.retranslating');
    retranslateBtn.classList.add('btn-loading');

    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (isUdemyCourseTab(tab)) {
        const res = await chrome.tabs.sendMessage(tab.id, { type: 'RETRANSLATE_ALL' });
        const count = res?.count || 0;
        retranslateText.textContent = t('popup.retranslateDone', { count });
      } else {
        retranslateText.textContent = t('popup.openUdemy');
      }
    } catch (_) {
      retranslateText.textContent = t('popup.openUdemy');
    }

    setTimeout(() => {
      retranslateBtn.disabled = false;
      retranslateBtn.classList.remove('btn-loading');
      retranslateText.textContent = t('popup.retranslate');
    }, 2500);
  });

  // === 헬퍼 ===

  function updateBgVisibility() {
    const on = bgEnabledCheck.checked;
    bgColorHex.textContent = on ? bgColorPicker.value : t('style.none');
    bgOpacityGroup.style.display = on ? '' : 'none';
  }

  function updatePanelColorHex() {
    panelColorHex.textContent = panelColorEnabledCheck.checked
      ? panelColorPicker.value
      : t('style.udemyDefault');
  }

  async function updateStatus() {
    const providerNames = { claude: 'Claude', gemini: 'Gemini', 'claude-code': 'Claude Code' };
    const providerName = providerNames[currentProvider] || currentProvider;

    if (currentProvider === 'claude-code') {
      statusDot.className = 'status-dot';
      statusText.textContent = t('popup.statusChecking', { provider: providerName });

      const ccUrl = claudeCodeUrlInput.value.trim() || 'http://localhost:3456';
      const connected = await checkClaudeCodeConnection(ccUrl);

      if (connected) {
        statusDot.className = 'status-dot connected';
        statusText.textContent = t('popup.statusReady', { provider: providerName });
      } else {
        statusDot.className = 'status-dot error';
        statusText.textContent = t('popup.statusNotRunning', { provider: providerName });
      }
    } else {
      const keyInput = currentProvider === 'claude' ? claudeApiKeyInput : geminiApiKeyInput;
      const hasKey = keyInput.value.trim().length > 0;
      if (!hasKey) {
        statusDot.className = 'status-dot error';
        statusText.textContent = t('popup.statusNeedKey', { provider: providerName });
      } else {
        statusDot.className = 'status-dot connected';
        statusText.textContent = t('popup.statusReady', { provider: providerName });
      }
    }
  }

  function isUdemyCourseTab(tab) {
    return tab?.url?.startsWith('https://www.udemy.com/course/');
  }
}
