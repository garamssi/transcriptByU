/**
 * "번역 중" 배지 — 비디오 플레이어 위 우상단에 표시 (시안 SS2).
 * 캡션 오버레이가 나타날 때 표시하고, 비활성/네비게이션 시 정리한다.
 */

import { t, getLocale } from '../../shared/i18n.js';
import { languageName } from '../../shared/language-name.js';
import { DEFAULT_TARGET_CODE } from '../../domain/languages.js';

const MARK_SVG =
  '<svg viewBox="0 0 100 100" aria-hidden="true">' +
  '<rect x="4" y="4" width="92" height="92" rx="26" fill="#8B3DF5"/>' +
  '<path d="M31 26 L31 52 A19 19 0 0 0 69 52 L69 26" fill="none" stroke="#fff" stroke-width="12" stroke-linecap="round"/>' +
  '<rect x="30" y="74" width="40" height="9" rx="4.5" fill="#fff"/>' +
  '<rect x="30" y="74" width="15" height="9" rx="4.5" fill="#3DF5C8"/>' +
  '</svg>';

let badgeEl = null;
let anchorEl = null;
let lang = DEFAULT_TARGET_CODE;
let enabled = true;

function badgeText() {
  return t('badge.translatingTo', { lang: languageName(lang, getLocale()) });
}

function build() {
  const el = document.createElement('div');
  el.className = 'udemy-translator-badge';
  el.innerHTML = `${MARK_SVG}<span class="utb-text"></span><span class="utb-dot"></span>`;
  el.querySelector('.utb-text').textContent = badgeText();
  return el;
}

// 배지를 붙일 위치 컨텍스트: 캡션의 offsetParent(플레이어 영역) 우선, 없으면 video 부모
function mountTarget() {
  if (anchorEl && anchorEl.offsetParent) return anchorEl.offsetParent;
  const video = document.querySelector('video');
  return video?.parentElement || null;
}

export function setBadgeLang(l) {
  if (l) lang = l;
  if (badgeEl) badgeEl.querySelector('.utb-text').textContent = badgeText();
}

export function setBadgeEnabled(v) {
  enabled = v !== false;
  if (!enabled) hideBadge();
  else if (anchorEl) showBadge(anchorEl);
}

export function showBadge(anchor) {
  if (anchor) anchorEl = anchor;
  if (!enabled) return;
  const target = mountTarget();
  if (!target) return;
  if (!badgeEl) badgeEl = build();
  if (badgeEl.parentElement !== target) target.appendChild(badgeEl);
  badgeEl.style.display = 'inline-flex';
}

export function hideBadge() {
  if (badgeEl) badgeEl.style.display = 'none';
}

export function removeBadge() {
  if (badgeEl) {
    badgeEl.remove();
    badgeEl = null;
  }
  anchorEl = null;
}
