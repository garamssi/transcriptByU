const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const LOCALES_DIR = path.join(__dirname, '..', 'locales');
const localeFiles = fs.readdirSync(LOCALES_DIR).filter((f) => f.endsWith('.json'));
const locales = Object.fromEntries(
  localeFiles.map((f) => [path.basename(f, '.json'), require(path.join(LOCALES_DIR, f))]),
);

function flatten(obj, prefix = '', out = {}) {
  for (const [k, v] of Object.entries(obj)) {
    const key = prefix ? `${prefix}.${k}` : k;
    if (v && typeof v === 'object' && !Array.isArray(v)) flatten(v, key, out);
    else out[key] = v;
  }
  return out;
}

const en = locales.en;
const enKeys = Object.keys(flatten(en)).sort();

for (const [name, catalog] of Object.entries(locales)) {
  if (name === 'en') continue;
  test(`en.json 과 ${name}.json 의 키 세트가 동일`, () => {
    const keys = Object.keys(flatten(catalog)).sort();
    assert.deepStrictEqual(enKeys.filter((k) => !keys.includes(k)), [], `${name}.json 누락 키`);
    assert.deepStrictEqual(keys.filter((k) => !enKeys.includes(k)), [], 'en.json 누락 키(추가 키 존재)');
  });
}

test('모든 로케일의 모든 값이 비어있지 않은 문자열', () => {
  for (const [name, catalog] of Object.entries(locales)) {
    for (const [k, v] of Object.entries(flatten(catalog))) {
      assert.ok(typeof v === 'string' && v.length, `${name}.${k}`);
    }
  }
});
