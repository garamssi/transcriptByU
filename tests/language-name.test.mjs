import test from 'node:test';
import assert from 'node:assert';
import { languageName } from '../src/shared/language-name.js';

test('languageName renders in the UI locale', () => {
  assert.strictEqual(languageName('ko', 'en'), 'Korean');   // ICU 표준, 안정적
});
test('languageName returns a non-empty string for valid combos', () => {
  const s = languageName('ja', 'ko');
  assert.ok(typeof s === 'string' && s.length > 0);
});
test('languageName falls back to the code on invalid input', () => {
  assert.strictEqual(languageName('zz-not-a-lang', 'en'), 'zz-not-a-lang');
});
