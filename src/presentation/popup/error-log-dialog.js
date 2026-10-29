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
      if (isOpen) scheduleLoad();
      else refreshBadge();
    }
  });

  async function refreshBadge() {
    const log = await getErrorLog();
    const unread = log.entries.filter(e => e.ts > log.seenAt && kindOf(e) === 'error').length;
    badge.textContent = unread > 0 ? String(unread) : '';
    openBtn.classList.toggle('has-errors', unread > 0);
  }

  // 열린 상태에서 로그가 연달아 쓰이면(청크마다 한 건) 짧게 모아 한 번만 다시 그린다.
  let loadTimer = null;
  function scheduleLoad() {
    clearTimeout(loadTimer);
    loadTimer = setTimeout(() => load(false), 150);
  }

  let timeTimer = null;

  async function open() {
    isOpen = true;
    overlay.classList.add('open');
    await load(true);
    await markErrorLogSeen();
    badge.textContent = '';
    openBtn.classList.remove('has-errors');
    // '방금 전' 같은 상대 시각만 제자리에서 갱신한다(카드는 다시 그리지 않음).
    clearInterval(timeTimer);
    timeTimer = setInterval(refreshTimes, 30_000);
  }

  function close() {
    isOpen = false;
    overlay.classList.remove('open');
    clearTimeout(loadTimer);
    clearInterval(timeTimer);
    // 다음에 열 때 '새 항목' 표시 기준을 지금으로 맞춘다.
    seenAt = Date.now();
  }

  // 비동기 로드가 겹쳐 늦게 끝난 옛 결과가 새 결과를 덮어쓰지 않게 한다.
  let loadSeq = 0;
  async function load(initial) {
    const seq = ++loadSeq;
    const [log, blocks] = await Promise.all([getErrorLog(), getActiveBlocks()]);
    if (seq !== loadSeq) return;
    entries = log.entries;
    if (initial) seenAt = log.seenAt;
    renderBanner(blocks);
    render(initial);
  }

  // 내용이 같으면 DOM 을 건드리지 않는다(높이·위치가 흔들리지 않게).
  const lastHtml = new WeakMap();
  function setHtml(el, html) {
    if (lastHtml.get(el) !== html) {
      el.innerHTML = html;
      lastHtml.set(el, html);
    }
  }

  function renderBanner(blocks) {
    banner.hidden = blocks.length === 0;
    setHtml(banner, blocks.map(b => `${ICONS.lock}<span>${escapeHtml(t('log.blockedBanner', {
      provider: `${PROVIDER_NAMES[b.provider] || b.provider} · ${b.model}`,
      time: formatResumeTime(b.until),
    }))}</span>`).join(''));
  }

  // 카드 id → { el, version }. 새 로그가 와도 기존 카드는 그대로 두고, 바뀐 카드만 고치고,
  // 새 카드만 등장 애니메이션을 준다(전체를 다시 그리면 모든 카드가 깜빡이고 스크롤·펼친 상세가 초기화된다).
  const cards = new Map();

  function render(initial) {
    const errors = entries.filter(e => kindOf(e) === 'error').length;
    const warns = entries.length - errors;
    count.textContent = t('log.count', { total: entries.length });
    copyBtn.disabled = entries.length === 0;
    clearBtn.disabled = entries.length === 0;

    setHtml(summary, entries.length === 0 ? '' : [
      errors ? `<span class="log-sum-chip is-error"><i></i>${escapeHtml(t('log.summaryErrors', { count: errors }))}</span>` : '',
      warns ? `<span class="log-sum-chip is-warn"><i></i>${escapeHtml(t('log.summaryWarns', { count: warns }))}</span>` : '',
    ].join(''));

    if (entries.length === 0) {
      cards.clear();
      setHtml(list, `<div class="cache-empty log-empty">${ICONS.ok}<span>${escapeHtml(t('log.empty'))}</span><small>${escapeHtml(t('log.emptySub'))}</small></div>`);
      return;
    }
    // 빈 상태 화면이 떠 있었으면 걷어낸다(카드는 아래에서 개별로 붙인다).
    if (lastHtml.get(list)) {
      list.innerHTML = '';
      lastHtml.delete(list);
    }

    // 스크롤해서 보고 있던 카드가 새 카드 추가 뒤에도 같은 자리에 보이도록 기준 카드를 기억한다.
    const anchor = list.scrollTop > 0
      ? [...cards.values()].map(c => c.el).find(el => el.offsetTop + el.offsetHeight > list.scrollTop)
      : null;
    const anchorOffset = anchor ? anchor.offsetTop - list.scrollTop : 0;

    const alive = new Set(entries.map(e => e.id));
    for (const [id, c] of cards) {
      if (!alive.has(id)) {
        c.el.remove();
        cards.delete(id);
      }
    }

    let prev = null;
    entries.forEach((e, i) => {
      const version = `${e.ts}|${e.count || 1}|${e.ts > seenAt}`;
      let c = cards.get(e.id);
      if (!c) {
        const el = document.createElement('article');
        el.addEventListener('animationend', () => el.classList.remove('is-entering'), { once: true });
        el.classList.add('is-entering');
        el.style.animationDelay = initial ? `${Math.min(i, 9) * 30}ms` : '0ms';
        fillCard(el, e);
        c = { el, version };
        cards.set(e.id, c);
      } else if (c.version !== version) {
        fillCard(c.el, e); // 반복 횟수·시각만 바뀐 카드는 제자리에서 갱신(애니메이션 없음)
        c.version = version;
      }
      const ref = prev ? prev.nextSibling : list.firstChild;
      if (c.el !== ref) list.insertBefore(c.el, ref);
      prev = c.el;
    });

    if (anchor && anchor.isConnected) list.scrollTop = anchor.offsetTop - anchorOffset;
    else if (initial) list.scrollTop = 0;
  }

  /** 카드 내용을 채운다. 펼쳐 둔 '상세'는 갱신 후에도 펼친 상태를 유지한다. */
  function fillCard(el, e) {
    const kind = kindOf(e);
    const isNew = e.ts > seenAt;
    const wasOpen = el.querySelector('details')?.open;
    const entering = el.classList.contains('is-entering');
    el.className = `log-card is-${kind}${isNew ? ' is-new' : ''}${entering ? ' is-entering' : ''}`;
    el.innerHTML = cardInner(e, kind, isNew);
    if (wasOpen) {
      const d = el.querySelector('details');
      if (d) d.open = true;
    }
  }

  function cardInner(e, kind, isNew) {
    const lecture = [e.section, e.lecture].filter(Boolean).join(' › ') || t('log.noLecture');

    const chips = [`<span class="log-chip log-chip--code">${escapeHtml(e.code)}</span>`];
    if (e.count > 1) chips.push(`<span class="log-chip log-chip--count">${escapeHtml(t('log.repeated', { count: e.count }))}</span>`);
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
        <div class="log-card-ic">${ICONS[kind]}</div>
        <div class="log-card-main">
          <div class="log-card-top">
            <span class="log-card-title">${isNew ? '<span class="log-new-dot"></span>' : ''}${escapeHtml(codeLabel(e.code))}</span>
            <time class="log-card-time" data-ts="${e.ts}" title="${attr(absoluteTime(e.ts))}">${escapeHtml(relativeTime(e.ts))}</time>
          </div>
          <div class="log-card-lecture" title="${attr(lecture)}">${escapeHtml(lecture)}</div>
          <div class="log-card-meta">${chips.join('')}</div>
          ${hint !== hintKey ? `<p class="log-card-hint">${escapeHtml(hint)}</p>` : ''}
          ${detail}
        </div>`;
  }

  function refreshTimes() {
    list.querySelectorAll('time[data-ts]').forEach(el => {
      const text = relativeTime(Number(el.dataset.ts));
      if (el.textContent !== text) el.textContent = text;
    });
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
        e.count > 1 && `repeated=${e.count}`,
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
