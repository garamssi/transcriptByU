const test = require('node:test');
const assert = require('node:assert');
const { readFileSync } = require('node:fs');
const path = require('node:path');
const en = require('../locales/en.json');
const ko = require('../locales/ko.json');

const html = readFileSync(path.join(__dirname, '..', 'popup.html'), 'utf8');

function flatten(obj, prefix = '', out = {}) {
  for (const [k, v] of Object.entries(obj)) {
    const key = prefix ? `${prefix}.${k}` : k;
    if (v && typeof v === 'object' && !Array.isArray(v)) flatten(v, key, out);
    else out[key] = v;
  }
  return out;
}
const enKeys = new Set(Object.keys(flatten(en)));
const koKeys = new Set(Object.keys(flatten(ko)));

test('popup.html 의 모든 data-i18n* 키가 양 카탈로그에 존재', () => {
  const re = /data-i18n(?:-placeholder|-title)?="([^"]+)"/g;
  const keys = [...html.matchAll(re)].map((m) => m[1]);
  assert.ok(keys.length > 20, `data-i18n 키가 너무 적음: ${keys.length}`);
  for (const k of keys) {
    assert.ok(enKeys.has(k), `키 '${k}' 가 en.json 에 없음`);
    assert.ok(koKeys.has(k), `키 '${k}' 가 ko.json 에 없음`);
  }
});
