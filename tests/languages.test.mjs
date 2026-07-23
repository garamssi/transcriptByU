import test from 'node:test';
import assert from 'node:assert';
import { LANGUAGES, TARGET_CODES, UI_CODES, DEFAULT_TARGET_CODE, byCode, isValidTargetCode, scriptOf, resolveCode } from '../src/domain/languages.js';

test('every LANGUAGES entry has code/endonym/englishName/script and code matches key', () => {
  for (const [k, v] of Object.entries(LANGUAGES)) {
    assert.strictEqual(v.code, k);
    for (const f of ['endonym', 'englishName', 'script']) assert.ok(typeof v[f] === 'string' && v[f], `${k}.${f}`);
  }
});
test('TARGET_CODES and UI_CODES are all valid codes; ko is default target', () => {
  for (const c of [...TARGET_CODES, ...UI_CODES]) assert.ok(LANGUAGES[c], c);
  assert.strictEqual(DEFAULT_TARGET_CODE, 'ko');
});
test('byCode / scriptOf / isValidTargetCode', () => {
  assert.strictEqual(byCode('ja').englishName, 'Japanese');
  assert.strictEqual(byCode('nope'), null);
  assert.strictEqual(scriptOf('ko'), 'hangul');
  assert.strictEqual(scriptOf('nope'), null);
  assert.ok(isValidTargetCode('zh'));
  assert.ok(!isValidTargetCode('en'));
});
test('resolveCode: code passthrough / endonym→code / unknown→fallback', () => {
  assert.strictEqual(resolveCode('ko'), 'ko');
  assert.strictEqual(resolveCode('한국어'), 'ko');
  assert.strictEqual(resolveCode('日本語'), 'ja');
  assert.strictEqual(resolveCode(undefined), 'ko');
  assert.strictEqual(resolveCode('xx'), 'ko');
  assert.strictEqual(resolveCode('xx', 'ja'), 'ja');
});
