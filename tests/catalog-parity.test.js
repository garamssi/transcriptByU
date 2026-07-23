const test = require('node:test');
const assert = require('node:assert');
const en = require('../locales/en.json');
const ko = require('../locales/ko.json');

function flatten(obj, prefix = '', out = {}) {
  for (const [k, v] of Object.entries(obj)) {
    const key = prefix ? `${prefix}.${k}` : k;
    if (v && typeof v === 'object' && !Array.isArray(v)) flatten(v, key, out);
    else out[key] = v;
  }
  return out;
}

test('en.json 과 ko.json 의 키 세트가 동일', () => {
  const ek = Object.keys(flatten(en)).sort();
  const kk = Object.keys(flatten(ko)).sort();
  assert.deepStrictEqual(ek.filter((k) => !kk.includes(k)), [], 'ko.json 누락 키');
  assert.deepStrictEqual(kk.filter((k) => !ek.includes(k)), [], 'en.json 누락 키');
});

test('모든 값이 비어있지 않은 문자열', () => {
  for (const [k, v] of Object.entries(flatten(en))) assert.ok(typeof v === 'string' && v.length, `en.${k}`);
  for (const [k, v] of Object.entries(flatten(ko))) assert.ok(typeof v === 'string' && v.length, `ko.${k}`);
});
