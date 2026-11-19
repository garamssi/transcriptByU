import test from 'node:test';
import assert from 'node:assert';
import {
  normalizeReviewState, recordLecture, shouldPrompt, isFinished, markShown, markAnswered,
} from '../src/domain/review-prompt.js';

const record = (state, from, to) => {
  for (let i = from; i <= to; i++) state = recordLecture(state, `c/${i}`);
  return state;
};

test('강의 5·10·15개째에 최대 3번 묻고, 같은 강의는 한 번만 센다', () => {
  let s = record(normalizeReviewState(undefined), 1, 4);
  s = recordLecture(s, 'c/4'); // 같은 강의 재방문
  assert.strictEqual(shouldPrompt(s), false);
  s = record(s, 5, 5);
  assert.strictEqual(shouldPrompt(s), true);
  s = markShown(s);
  assert.strictEqual(shouldPrompt(record(s, 6, 9)), false);
  s = record(s, 6, 10);
  assert.strictEqual(shouldPrompt(s), true);
  s = record(markShown(s), 11, 15);
  assert.strictEqual(shouldPrompt(s), true);
  s = record(markShown(s), 16, 40);
  assert.strictEqual(isFinished(s), true); // 3번 다 무시 → 끝
  assert.strictEqual(shouldPrompt(s), false);
  assert.strictEqual(s.lectures.length, 15);
});

test('못 물은 채 강의를 많이 봐도, 한 번 물은 뒤 다음 차례까지는 강의 5개가 더 필요하다', () => {
  // 말풍선을 띄울 자리가 없는 채로(자막을 끄고 대본만 봄) 강의 12개를 봤다
  let s = record(normalizeReviewState(null), 1, 12);
  assert.strictEqual(shouldPrompt(s), true);
  assert.strictEqual(s.lectures.length, 5); // 차례가 와 있는 동안은 세지 않는다
  s = markShown(s);
  assert.strictEqual(shouldPrompt(s), false); // 밀린 차례가 연달아 나오지 않는다
  assert.strictEqual(shouldPrompt(record(s, 13, 16)), false);
  assert.strictEqual(shouldPrompt(record(s, 13, 17)), true);
});

test('한 번 답하면 다시 묻지 않고 기록도 하지 않는다', () => {
  let s = record(normalizeReviewState(null), 1, 5);
  s = record(markAnswered(s), 6, 20);
  assert.strictEqual(shouldPrompt(s), false);
  assert.strictEqual(s.lectures.length, 5);
});

test('바뀐 게 없으면 같은 객체를 돌려준다(불필요한 저장 방지)', () => {
  const s = record(normalizeReviewState(null), 1, 2);
  assert.strictEqual(recordLecture(s, 'c/1'), s);
  const answered = markAnswered(s);
  assert.strictEqual(markAnswered(answered), answered);
});
