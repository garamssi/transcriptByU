import test from 'node:test';
import assert from 'node:assert';
import { buildBatchSystemPrompt } from '../src/domain/prompt-builder.js';
import { isAlreadyTargetLanguage } from '../src/domain/language-detect.js';
import { lectureCacheKey } from '../src/domain/cache-key.js';

test('buildBatchSystemPrompt takes a code, emits englishName + endonym', () => {
  const p = buildBatchSystemPrompt('ja', {});
  assert.ok(p.includes('Japanese') && p.includes('日本語'));
});
test('buildBatchSystemPrompt falls back for unknown code', () => {
  const p = buildBatchSystemPrompt('zz', {});
  assert.ok(p.includes('Korean')); // DEFAULT_TARGET_CODE
});
test('buildBatchSystemPrompt supports new target language Spanish', () => {
  const p = buildBatchSystemPrompt('es', {});
  assert.ok(p.includes('Spanish') && p.includes('Español'));
});
test('isAlreadyTargetLanguage uses target code script', () => {
  assert.strictEqual(isAlreadyTargetLanguage('こんにちは', 'ja'), true);
  assert.strictEqual(isAlreadyTargetLanguage('こんにちは', 'ko'), false);
  assert.strictEqual(isAlreadyTargetLanguage('안녕하세요', 'ko'), true);
  assert.strictEqual(isAlreadyTargetLanguage('Hello', 'zz'), false); // 미지원 코드 → 항상 번역
});
test('isAlreadyTargetLanguage never skips on ambiguous (shared) scripts like latin', () => {
  // REGRESSION: English source is latin-script; es/fr/pt/de/id are also latin-script.
  // A naive script-match would wrongly skip translation, leaving English untranslated.
  assert.strictEqual(isAlreadyTargetLanguage('Hello, world.', 'es'), false);
  assert.strictEqual(isAlreadyTargetLanguage('Hola mundo', 'fr'), false);
  // Distinctive (1:1) scripts still correctly skip.
  assert.strictEqual(isAlreadyTargetLanguage('안녕하세요', 'ko'), true);
  assert.strictEqual(isAlreadyTargetLanguage('こんにちは', 'ja'), true);
});
test('isAlreadyTargetLanguage exact-skips when sourceCode === targetCode', () => {
  assert.strictEqual(isAlreadyTargetLanguage('anything', 'en', 'en'), true);
  assert.strictEqual(isAlreadyTargetLanguage('anything', 'ko', 'en'), false);
});
test('lectureCacheKey uses the code verbatim', () => {
  assert.strictEqual(lectureCacheKey('ko', 'c', 's', 'l'), 'ko::c||s||l');
});
