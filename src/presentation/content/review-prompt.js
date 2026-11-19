/**
 * 리뷰 요청 말풍선 — '번역 완료' 배지에 붙는다(배지의 자식 요소, 영상 안에서 공간이 넓은 쪽으로 편다).
 * 언제 묻는지는 domain/review-prompt.js 의 규칙이 정한다. 말풍선은 세 조건이 모두 맞을 때 뜬다.
 *   - 물을 차례다 (번역한 강의 5·10·15개째)
 *   - '번역 완료' 배지가 화면에 보인다
 *   - 사용자가 이 탭을 보고 있다 (안 보는 탭에서 띄우면 못 본 채 한 번을 써 버린다)
 * 조건을 바꾸는 사건 — 강의 번역 완료, 배지 표시 변화, 탭 전환 — 은 어떤 순서로도 올 수 있어서
 * (재생 전에 번역이 끝나기도, 번역 중에 배지가 먼저 뜨기도 한다), 사건마다 같은 절차
 * (저장된 상태를 읽고 → 바꾸고 → 저장)를 한 줄로 세워 실행한다.
 */

import { t } from '../../shared/i18n.js';
import {
  recordLecture, shouldPrompt, isFinished, markShown, markAnswered, REVIEW_URL,
} from '../../domain/review-prompt.js';
import { getReviewState, saveReviewState } from '../../infrastructure/chrome/review-store.js';
import { doneBadge, onDoneBadgeChange } from './badge-manager.js';

const AUTO_HIDE_MS = 10_000;
const FADE_MS = 200;

let promptEl = null;
// 더 물을 일이 없으면(답했거나 3번을 다 씀) 이후 사건은 저장소를 읽지 않고 넘긴다.
let finished = false;
// 상태 갱신을 직렬화한다 — 읽고 쓰는 사이에 다른 갱신이 끼어 서로 덮어쓰지 않게.
let queue = Promise.resolve();

/**
 * 저장된 상태에 전이 함수를 적용한다 (읽기 → 바꾸기 → 바뀌었으면 저장).
 * @param {(state: import('../../domain/review-prompt.js').ReviewState) => object} transition
 * @returns {Promise<void>} 이 갱신이 끝나면 풀린다
 */
function update(transition) {
  queue = queue.then(async () => {
    const stored = await getReviewState();
    const next = transition(stored);
    if (next !== stored) await saveReviewState(next);
    finished = isFinished(next);
  }).catch(err => console.warn('[UdemyTranslator] review prompt failed:', err?.message || err));
  return queue;
}

/** 물을 차례이고 말풍선을 실제로 띄웠으면 노출 횟수를 올린다. */
const promptIfDue = (state) => (shouldPrompt(state) && show() ? markShown(state) : state);

/** 배지 표시 변화·탭 전환을 구독한다. content 스크립트 시작 시 한 번 호출한다. */
export function initReviewPrompt() {
  // 배지가 사라지면(강의 이동·오류·숨김) 말풍선도 치우고, 나타나면 물을 차례인지 본다.
  onDoneBadgeChange((badge) => {
    if (!badge) hideReviewPrompt();
    else if (!finished) update(promptIfDue);
  });
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible' && !finished && doneBadge()) update(promptIfDue);
  });
}

/**
 * 강의 하나의 번역이 끝났을 때 호출한다.
 * @param {string} lectureId - 강의 식별자(코스 슬러그/강의 번호)
 */
export function onLectureTranslated(lectureId) {
  if (finished) return queue;
  return update(state => promptIfDue(recordLecture(state, lectureId)));
}

/** 배지가 보이고 사용자가 이 탭을 보고 있으면 배지에 말풍선을 붙인다. @returns {boolean} 띄웠는지 */
function show() {
  const badge = doneBadge();
  if (!badge || promptEl || document.visibilityState !== 'visible') return false;

  const el = document.createElement('div');
  el.className = 'udemy-translator-review';
  el.setAttribute('role', 'dialog');
  // 남은 시간 고리: AUTO_HIDE_MS 동안 줄어드는 CSS 애니메이션이고, 다 줄어들면(animationend) 말풍선을 치운다.
  // 고리가 곧 타이머라 화면에 보이는 남은 시간과 실제로 사라지는 시점이 어긋날 수 없다.
  // 마우스를 올린 동안은 CSS 가 애니메이션을 멈춘다(누르러 가는 중에 사라지지 않게) — 떼면 이어서 줄어든다.
  el.style.setProperty('--utr-life', `${AUTO_HIDE_MS}ms`);
  el.innerHTML = '<svg class="utr-ring" viewBox="0 0 20 20" aria-hidden="true">' +
    '<circle class="utr-ring-track" cx="10" cy="10" r="8"/>' +
    '<circle class="utr-ring-left" cx="10" cy="10" r="8" pathLength="100"/></svg>' +
    '<p class="utr-title"></p><p class="utr-body"></p>' +
    '<div class="utr-actions"><button type="button" class="utr-btn utr-primary"></button>' +
    '<button type="button" class="utr-btn utr-ghost"></button></div>';
  el.querySelector('.utr-title').textContent = t('review.title');
  el.querySelector('.utr-body').textContent = t('review.body');
  const [writeBtn, neverBtn] = el.querySelectorAll('button');
  writeBtn.textContent = t('review.write');
  neverBtn.textContent = t('review.never');

  const answer = () => {
    update(markAnswered);
    hideReviewPrompt();
  };
  writeBtn.addEventListener('click', () => {
    window.open(REVIEW_URL, '_blank', 'noopener');
    answer();
  });
  neverBtn.addEventListener('click', answer);
  // 말풍선 클릭이 플레이어로 전달돼 영상이 재생/일시정지되지 않게 한다.
  for (const type of ['click', 'dblclick', 'mousedown', 'pointerdown']) {
    el.addEventListener(type, e => e.stopPropagation());
  }
  el.querySelector('.utr-ring-left').addEventListener('animationend', hideReviewPrompt);

  // 배지는 자막 영역에 붙으므로 보통 영상 아래쪽, 조작 막대 바로 위에 있다. 아래로 펴면 조작 막대에
  // 가려지고 영상 밖으로 잘리므로, 영상 안에서 공간이 더 넓은 쪽(위 또는 아래)으로 편다.
  const video = document.querySelector('video')?.getBoundingClientRect();
  const at = badge.getBoundingClientRect();
  el.classList.toggle('utr-up', !!video && video.bottom - at.bottom < at.top - video.top);

  badge.appendChild(el);
  promptEl = el;
  return true;
}

function hideReviewPrompt() {
  const el = promptEl;
  if (!el) return;
  promptEl = null;
  el.classList.add('utr-leaving');
  setTimeout(() => el.remove(), FADE_MS);
}
