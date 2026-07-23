const test = require('node:test');
const assert = require('node:assert');
const { readFileSync, readdirSync } = require('node:fs');
const path = require('node:path');

const LOCALES_DIR = path.join(__dirname, '..', 'locales');
const html = readFileSync(path.join(__dirname, '..', 'popup.html'), 'utf8');

function flatten(obj, prefix = '', out = {}) {
  for (const [k, v] of Object.entries(obj)) {
    const key = prefix ? `${prefix}.${k}` : k;
    if (v && typeof v === 'object' && !Array.isArray(v)) flatten(v, key, out);
    else out[key] = v;
  }
  return out;
}

// 모든 로케일 카탈로그를 동적으로 로드 (새 로케일 파일은 자동 포함).
const locales = readdirSync(LOCALES_DIR)
  .filter((f) => f.endsWith('.json'))
  .map((f) => ({
    name: f,
    keys: new Set(Object.keys(flatten(JSON.parse(readFileSync(path.join(LOCALES_DIR, f), 'utf8'))))),
  }));

// popup.html 의 data-i18n* 키 추출
const re = /data-i18n(?:-placeholder|-title)?="([^"]+)"/g;
const htmlKeys = [...html.matchAll(re)].map((m) => m[1]);

test('로케일 파일이 최소 2개 로드됨', () => {
  assert.ok(locales.length >= 2, `로케일 파일이 너무 적음: ${locales.length}`);
});

test('popup.html 의 모든 data-i18n* 키가 모든 로케일 카탈로그에 존재', () => {
  assert.ok(htmlKeys.length > 20, `data-i18n 키가 너무 적음: ${htmlKeys.length}`);
  for (const { name, keys } of locales) {
    for (const k of htmlKeys) {
      assert.ok(keys.has(k), `키 '${k}' 가 ${name} 에 없음`);
    }
  }
});
