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
// 번역 오류 상태 (null 이면 정상). 오류 중에는 배지를 빨간 점 + 원인 문구로 바꾼다.
let errorCode = null;
// 강의 번역 진행률 { total, done, failed, gaveUp } (대본을 모르면 null)
let progress = null;

/** 진행 상태: 'working' | 'done' | 'partial' (재시도까지 포기한 문장이 남은 채 끝남) */
function progressState() {
  if (!progress?.total) return 'working';
  if (progress.done >= progress.total) return 'done';
  if (progress.gaveUp > 0 && progress.done + progress.gaveUp >= progress.total) return 'partial';
  return 'working';
}

function badgeText() {
  if (errorCode) {
    const key = `badge.error.${errorCode}`;
    const msg = t(key);
    return msg === key ? t('badge.error.generic') : msg;
  }
  const name = languageName(lang, getLocale());
  const state = progressState();
  if (state === 'done') return t('badge.done', { lang: name });
  if (state === 'partial') return t('badge.partial', { lang: name, failed: progress.gaveUp });
  if (progress?.total) {
    // 99% 에서 멈춘 것처럼 보이지 않게 내림 처리(전부 끝나야 '완료')
    const percent = Math.min(99, Math.floor((progress.done / progress.total) * 100));
    return t('badge.translatingProgress', { lang: name, percent });
  }
  return t('badge.translatingTo', { lang: name });
}

function render() {
  if (!badgeEl) return;
  badgeEl.querySelector('.utb-text').textContent = badgeText();
  const state = errorCode ? 'error' : progressState();
  badgeEl.classList.toggle('utb-error', state === 'error');
  badgeEl.classList.toggle('utb-done', state === 'done');
  badgeEl.classList.toggle('utb-partial', state === 'partial');
}

function build() {
  const el = document.createElement('div');
  el.className = 'udemy-translator-badge';
  el.innerHTML = `${MARK_SVG}<span class="utb-text"></span><span class="utb-dot"></span>`;
  badgeEl = el;
  render();
  return el;
}

// 배지를 붙일 위치 컨텍스트: 캡션의 offsetParent(플레이어 영역) 우선, 없으면 video 부모
function mountTarget() {
  if (anchorEl && anchorEl.offsetParent) return anchorEl.offsetParent;
  const video = document.querySelector('video');
  return video?.parentElement || null;
}

/**
 * 강의 번역 진행률을 배지에 반영한다 (번역 중 N% / 완료 / 일부 실패).
 * @param {{ total: number, done: number, failed: number, gaveUp: number } | null} p
 */
export function setBadgeProgress(p) {
  progress = p;
  render();
}

export function setBadgeLang(l) {
  if (l) lang = l;
  render();
}

/**
 * 번역 오류 상태를 배지에 표시한다. null 이면 정상 상태로 되돌린다.
 * @param {string|null} code - ERROR_CODES 값
 */
export function setBadgeError(code) {
  errorCode = code || null;
  render();
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
