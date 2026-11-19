/**
 * 리뷰 요청 규칙 (순수: I/O·chrome API 없음).
 *
 * - 번역한 강의가 5·10·15개째일 때 한 번씩, 최대 3번 묻는다.
 * - 말풍선의 버튼(리뷰 남기기·다시 보지 않기)을 누르면 다시는 묻지 않는다.
 * - 물을 차례가 됐는데 아직 못 물었으면(말풍선을 띄울 자리가 없었음) 그동안 본 강의는 세지 않는다.
 *   그래서 한 번 묻고 나면 다음 차례까지 항상 강의 5개가 더 필요하다(밀린 차례가 연달아 나오지 않는다).
 *
 * 상태는 번역 캐시와 별도로 저장하므로 캐시를 지워도 초기화되지 않는다.
 */

export const REVIEW_MILESTONES = [5, 10, 15];

/**
 * @typedef {object} ReviewState
 * @property {string[]} lectures - 번역한 강의 ID (중복 없이)
 * @property {number} shown - 말풍선을 띄운 횟수
 * @property {boolean} answered - 말풍선의 버튼을 눌렀는지
 */

/** 저장된 값(없거나 깨졌을 수 있음)을 정상 상태로 만든다. @returns {ReviewState} */
export function normalizeReviewState(raw) {
  return {
    lectures: Array.isArray(raw?.lectures) ? raw.lectures : [],
    shown: Number.isInteger(raw?.shown) ? raw.shown : 0,
    answered: raw?.answered === true,
  };
}

/** 더 물을 일이 없는지 (답했거나 3번을 다 썼다). */
export const isFinished = (state) => state.answered || state.shown >= REVIEW_MILESTONES.length;

/** 지금 물을 차례인지. */
export const shouldPrompt = (state) =>
  !isFinished(state) && state.lectures.length >= REVIEW_MILESTONES[state.shown];

// 아래 전이 함수는 바뀐 게 없으면 받은 객체를 그대로 돌려준다(호출측이 저장 여부를 판단).

/** 번역한 강의를 기록한다. 같은 강의는 한 번만 세고, 물을 차례가 와 있는 동안은 세지 않는다. */
export function recordLecture(state, lectureId) {
  if (!lectureId || isFinished(state) || shouldPrompt(state) || state.lectures.includes(lectureId)) return state;
  return { ...state, lectures: [...state.lectures, lectureId] };
}

/** 말풍선을 한 번 띄웠다. */
export const markShown = (state) => ({ ...state, shown: state.shown + 1 });

/** 말풍선의 버튼을 눌렀다 — 다시는 묻지 않는다. */
export const markAnswered = (state) => (state.answered ? state : { ...state, answered: true });

/**
 * 크롬 웹스토어의 이 확장 리뷰 페이지. 스토어 항목 ID 를 고정해 둔다 — chrome.runtime.id 로 만들면
 * 폴더에서 직접 불러온(개발용) 확장은 ID 가 달라 빈 리뷰 페이지(empty-title)가 열린다.
 */
export const REVIEW_URL = 'https://chromewebstore.google.com/detail/cijgikgpgjapgehkfeogenpegnppbama/reviews';
