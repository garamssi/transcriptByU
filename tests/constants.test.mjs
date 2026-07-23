import test from 'node:test';
import assert from 'node:assert';
import { readFileSync } from 'node:fs';
import { MODELS, STORAGE_KEYS } from '../src/domain/constants.js';

const en = JSON.parse(readFileSync(new URL('../locales/en.json', import.meta.url)));

test('STORAGE_KEYS.UI_LANG === "uiLang"', () => {
  assert.strictEqual(STORAGE_KEYS.UI_LANG, 'uiLang');
});

test('모든 MODELS 항목이 value+name+tier, tier는 en.json에 존재', () => {
  for (const [provider, list] of Object.entries(MODELS)) {
    for (const m of list) {
      assert.ok(typeof m.value === 'string' && m.value, `${provider}: value`);
      assert.ok(typeof m.name === 'string' && m.name, `${provider}/${m.value}: name`);
      assert.ok(typeof m.tier === 'string' && m.tier, `${provider}/${m.value}: tier`);
      assert.ok(en.model.tier[m.tier], `${provider}/${m.value}: tier '${m.tier}' 없음`);
    }
  }
});
