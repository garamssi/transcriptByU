import test from 'node:test';
import assert from 'node:assert';
import { buildSentenceUnits, MAX_UNIT_CUES } from '../src/domain/sentence-units.js';

const lines = [
  'So with that, the create operation is',
  "done. Now in this lecture, we're going to",
  'focus on the READ operation, which means',
  'we need to build a REST API that can fetch',
  'the account details along with the',
  'customer details based on the mobile',
  'number that the client sends. Perfect. So',
  "let's use e.g. the String dot format method.",
  'Bye.',
];

test('큐를 문장 단위로 묶고, 큐는 가장 많이 차지한 문장을 보여 준다', () => {
  const { units, cueUnits } = buildSentenceUnits(lines);
  assert.strictEqual(units[0], 'So with that, the create operation is done.');
  assert.deepStrictEqual(cueUnits[0], [0]);
  // "done. Now in ..." 은 다음 문장이 더 많이 차지 → 다음 문장 번역을 보여 준다
  assert.ok(units[cueUnits[1][0]].startsWith('Now in this lecture'));
});

test('긴 문장은 MAX_UNIT_CUES 개 이하 큐로 나누고, 원문을 빠짐없이 덮는다', () => {
  const { units, unitCues } = buildSentenceUnits(lines);
  assert.ok(unitCues.every(c => c.length <= MAX_UNIT_CUES));
  const joined = units.join(' ').replace(/\s+/g, ' ');
  assert.strictEqual(joined, lines.join(' ').replace(/\s+/g, ' '));
});

test('큐 안에 들어간 짧은 문장은 그 큐에 함께 붙고, 약어(e.g.)에서 끊지 않는다', () => {
  const { units, cueUnits } = buildSentenceUnits(lines);
  assert.ok(cueUnits[6].map(u => units[u]).includes('Perfect.'));
  assert.ok(units.includes("So let's use e.g. the String dot format method."));
  assert.deepStrictEqual(cueUnits[8].map(u => units[u]), ['Bye.']);
});

test('모든 큐가 최소 하나의 단위를 보여 준다', () => {
  const { cueUnits } = buildSentenceUnits(lines);
  assert.ok(cueUnits.every(u => u.length > 0));
});

test('문장부호 없는 자막(자동 생성)도 큐 경계에서 나뉜다', () => {
  const noPunct = Array.from({ length: 10 }, (_, i) => `word${i} and some more words here`);
  const { units, unitCues } = buildSentenceUnits(noPunct);
  assert.ok(units.length >= Math.ceil(10 / MAX_UNIT_CUES));
  assert.ok(unitCues.every(c => c.length <= MAX_UNIT_CUES));
});
