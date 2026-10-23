import { escapeHtml } from '../../shared/utils.js';
import { t, getLocale } from '../../shared/i18n.js';
import { API_BLOCK_KEY, ERROR_LOG_KEY } from '../../domain/constants.js';
import { getErrorLog, markErrorLogSeen, clearErrorLog } from '../../infrastructure/chrome/error-log.js';

const PROVIDER_NAMES = { claude: 'Claude', gemini: 'Gemini', 'claude-code': 'Claude Code' };

const ICONS = {
  error: '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>',
  warn: '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>',
  slow: '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>',
  lock: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>',
  ok: '<svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M22 11.1V12a10 10 0 1 1-5.9-9.1"/><polyline points="22 4 12 14 9 11"/></svg>',
};

/** 로그 항목의 시각적 종류: error | warn | slow */
const kindOf = (e) => (e.code === 'SLOW' ? 'slow' : e.level === 'warn' ? 'warn' : 'error');

const attr = (s) => escapeHtml(s).replace(/"/g, '&quot;');

const seconds = (ms) => (ms / 1000).toFixed(ms < 10_000 ? 1 : 0);

function codeLabel(code) {
  const key = `log.code.${code}`;
  const v = t(key);
  return v === key ? code : v;
}

function relativeTime(ts) {
  const diffSec = Math.round((ts - Date.now()) / 1000);
  const rtf = new Intl.RelativeTimeFormat(getLocale(), { numeric: 'auto' });
  const abs = Math.abs(diffSec);
  if (abs < 60) return rtf.format(diffSec, 'second');
  if (abs < 3600) return rtf.format(Math.round(diffSec / 60), 'minute');
  if (abs < 86400) return rtf.format(Math.round(diffSec / 3600), 'hour');
  return rtf.format(Math.round(diffSec / 86400), 'day');
}

function absoluteTime(ts) {
  return new Date(ts).toLocaleString(getLocale(), { dateStyle: 'medium', timeStyle: 'medium' });
}

/** 차단 해제 시각: 오늘이면 시:분, 아니면 날짜 포함 */
export function formatResumeTime(ts) {
  const d = new Date(ts);
  const sameDay = d.toDateString() === new Date().toDateString();
  return d.toLocaleString(getLocale(), sameDay
    ? { hour: '2-digit', minute: '2-digit' }
    : { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}

/**
 * 현재 유효한 일일 한도 차단 목록을 읽는다.
 * @returns {Promise<Array<{ provider: string, model: string, until: number }>>}
 */
export async function getActiveBlocks() {
  try {
    const s = await chrome.storage.session.get(API_BLOCK_KEY);
    const now = Date.now();
    return Object.entries(s[API_BLOCK_KEY] || {})
      .filter(([, v]) => v?.until > now)
      .map(([key, v]) => {
        const sep = key.indexOf(':');
        return { provider: key.slice(0, sep), model: key.slice(sep + 1), until: v.until };
      });
  } catch {
    return [];
  }
}

/**
 * 오류 로그 다이얼로그를 초기화한다.
 * @param {object} elements - DOM 요소들
 */
export function initErrorLogDialog({
  openBtn, overlay, closeBtn, list, badge, banner, summary, count, copyBtn, copyText, clearBtn,
}) {
  let entries = [];
  let seenAt = 0;
  let isOpen = false;

  refreshBadge();

  // 백그라운드가 새 로그를 쓰면 배지·열린 화면을 바로 갱신한다.
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === 'local' && changes[ERROR_LOG_KEY]) {
      if (isOpen) load(false);
      else refreshBadge();
    }
  });

  async function refreshBadge() {
    const log = await getErrorLog();
    const unread = log.entries.filter(e => e.ts > log.seenAt && kindOf(e) === 'error').length;
    badge.textContent = unread > 0 ? String(unread) : '';
    openBtn.classList.toggle('has-errors', unread > 0);
  }

  async function open() {
    isOpen = true;
    overlay.classList.add('open');
    await load(true);
    await markErrorLogSeen();
    badge.textContent = '';
    openBtn.classList.remove('has-errors');
  }

  function close() {
    isOpen = false;
    overlay.classList.remove('open');
    // 다음에 열 때 '새 항목' 표시 기준을 지금으로 맞춘다.
    seenAt = Date.now();
  }

  async function load(resetSeen) {
    const log = await getErrorLog();
    entries = log.entries;
    if (resetSeen) seenAt = log.seenAt;
    await renderBanner();
    render();
  }

  async function renderBanner() {
    const blocks = await getActiveBlocks();
    if (blocks.length === 0) {
      banner.hidden = true;
      banner.innerHTML = '';
      return;
    }
    banner.hidden = false;
    banner.innerHTML = blocks.map(b => `${ICONS.lock}<span>${escapeHtml(t('log.blockedBanner', {
      provider: `${PROVIDER_NAMES[b.provider] || b.provider} · ${b.model}`,
      time: formatResumeTime(b.until),
    }))}</span>`).join('');
  }

  function render() {
    const errors = entries.filter(e => kindOf(e) === 'error').length;
    const warns = entries.length - errors;
    count.textContent = t('log.count', { total: entries.length });
    copyBtn.disabled = entries.length === 0;
    clearBtn.disabled = entries.length === 0;

    summary.innerHTML = entries.length === 0 ? '' : [
      errors ? `<span class="log-sum-chip is-error"><i></i>${escapeHtml(t('log.summaryErrors', { count: errors }))}</span>` : '',
      warns ? `<span class="log-sum-chip is-warn"><i></i>${escapeHtml(t('log.summaryWarns', { count: warns }))}</span>` : '',
    ].join('');

    if (entries.length === 0) {
      list.innerHTML = `<div class="cache-empty log-empty">${ICONS.ok}<span>${escapeHtml(t('log.empty'))}</span><small>${escapeHtml(t('log.emptySub'))}</small></div>`;
      return;
    }

    list.innerHTML = entries.map((e, i) => renderCard(e, i)).join('');
    list.scrollTop = 0;
  }

  function renderCard(e, index) {
    const kind = kindOf(e);
    const isNew = e.ts > seenAt;
    const lecture = [e.section, e.lecture].filter(Boolean).join(' › ') || t('log.noLecture');

    const chips = [`<span class="log-chip log-chip--code">${escapeHtml(e.code)}</span>`];
    if (e.provider) {
      chips.push(`<span class="log-chip">${escapeHtml(`${PROVIDER_NAMES[e.provider] || e.provider}${e.model ? ` · ${e.model}` : ''}`)}</span>`);
    }
    if (e.failed && e.lines) chips.push(`<span class="log-chip">${escapeHtml(t('log.failedLines', { failed: e.failed, lines: e.lines }))}</span>`);
    else if (e.lines) chips.push(`<span class="log-chip">${escapeHtml(t('log.lines', { count: e.lines }))}</span>`);
    if (e.status) chips.push(`<span class="log-chip">HTTP ${escapeHtml(String(e.status))}</span>`);
    if (e.durationMs) chips.push(`<span class="log-chip">${escapeHtml(t('log.took', { sec: seconds(e.durationMs) }))}</span>`);
    if (e.waitMs) chips.push(`<span class="log-chip">${escapeHtml(t('log.waited', { sec: seconds(e.waitMs) }))}</span>`);
    if (e.retryAfterMs && e.code === 'RATE_LIMIT') {
      chips.push(`<span class="log-chip">${escapeHtml(t('log.retryAfter', { sec: Math.ceil(e.retryAfterMs / 1000) }))}</span>`);
    }

    const hintKey = `log.hint.${e.code}`;
    const hint = t(hintKey);
    const detail = e.message
      ? `<details class="log-card-detail"><summary>${escapeHtml(t('log.detail'))}</summary><pre>${escapeHtml(e.message)}</pre></details>`
      : '';

    return `
      <article class="log-card is-${kind}${isNew ? ' is-new' : ''}" style="animation-delay:${Math.min(index, 9) * 30}ms">
        <div class="log-card-ic">${ICONS[kind]}</div>
        <div class="log-card-main">
          <div class="log-card-top">
            <span class="log-card-title">${isNew ? '<span class="log-new-dot"></span>' : ''}${escapeHtml(codeLabel(e.code))}</span>
            <time class="log-card-time" title="${attr(absoluteTime(e.ts))}">${escapeHtml(relativeTime(e.ts))}</time>
          </div>
          <div class="log-card-lecture" title="${attr(lecture)}">${escapeHtml(lecture)}</div>
          <div class="log-card-meta">${chips.join('')}</div>
          ${hint !== hintKey ? `<p class="log-card-hint">${escapeHtml(hint)}</p>` : ''}
          ${detail}
        </div>
      </article>`;
  }

  /** 다른 사람에게 그대로 붙여넣을 수 있는 텍스트 형식 */
  function toPlainText() {
    return entries.map(e => {
      const head = `[${new Date(e.ts).toISOString()}] ${e.level?.toUpperCase() || 'ERROR'} ${e.code}`;
      const fields = [
        e.provider && `provider=${e.provider}`,
        e.model && `model=${e.model}`,
        e.status && `status=${e.status}`,
        e.lines && `lines=${e.lines}`,
        e.failed && `failed=${e.failed}`,
        e.durationMs && `duration=${e.durationMs}ms`,
        e.waitMs && `wait=${e.waitMs}ms`,
        e.retryAfterMs && `retryAfter=${e.retryAfterMs}ms`,
      ].filter(Boolean).join(' ');
      const lecture = [e.course, e.section, e.lecture].filter(Boolean).join(' › ');
      return [head, fields, lecture && `lecture: ${lecture}`, e.message && `message: ${e.message}`]
        .filter(Boolean).join('\n  ');
    }).join('\n\n');
  }

  // === 이벤트 바인딩 ===
  openBtn.addEventListener('click', open);
  closeBtn.addEventListener('click', close);
  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) close();
  });

  copyBtn.addEventListener('click', async () => {
    try {
      await navigator.clipboard.writeText(toPlainText());
      copyText.textContent = t('log.copied');
      copyBtn.classList.add('is-done');
      setTimeout(() => {
        copyText.textContent = t('log.copy');
        copyBtn.classList.remove('is-done');
      }, 1500);
    } catch (err) {
      console.warn('[UdemyTranslator] copy failed:', err?.message || err);
    }
  });

  clearBtn.addEventListener('click', async () => {
    await clearErrorLog();
    entries = [];
    render();
  });
}
