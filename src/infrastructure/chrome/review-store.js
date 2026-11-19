import { STORAGE_KEYS } from '../../domain/constants.js';
import { normalizeReviewState } from '../../domain/review-prompt.js';

/**
 * 리뷰 요청 상태 (chrome.storage.local — 번역 캐시와 별도 키라 캐시 삭제에 영향받지 않는다).
 *
 * '답했음'은 진행 상황(본 강의·노출 횟수)과 다른 키에 둔다. chrome.storage 에는 트랜잭션이 없어,
 * 한 키에 같이 두면 다른 탭이 예전에 읽어 둔 값을 저장하면서 '답했음'을 지울 수 있다.
 * 따로 두고 true 로만 쓰면(되돌리는 쓰기가 없음) 어떤 순서로 저장돼도 한 번 한 답은 남는다.
 */
export async function getReviewState() {
  const s = await chrome.storage.local.get([STORAGE_KEYS.REVIEW, STORAGE_KEYS.REVIEW_ANSWERED]);
  return normalizeReviewState({ ...s[STORAGE_KEYS.REVIEW], answered: s[STORAGE_KEYS.REVIEW_ANSWERED] });
}

export function saveReviewState({ lectures, shown, answered }) {
  return chrome.storage.local.set({
    [STORAGE_KEYS.REVIEW]: { lectures, shown },
    ...(answered && { [STORAGE_KEYS.REVIEW_ANSWERED]: true }),
  });
}
