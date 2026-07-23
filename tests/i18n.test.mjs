import test from 'node:test';
import assert from 'node:assert';
import { setCatalogs, setLocale, getLocale, t, applyI18n } from '../src/shared/i18n.js';

const EN = { greeting: 'Hello {name}', nested: { deep: 'Deep EN' }, only: 'EN only' };
const KO = { greeting: '안녕 {name}', nested: { deep: '깊음 KO' } };

test('t: 현재 로케일에서 flat 키 조회 + 보간', () => {
  setCatalogs({ en: EN, ko: KO });
  setLocale('ko');
  assert.strictEqual(t('greeting', { name: '가람' }), '안녕 가람');
});

test('t: 점경로로 중첩 객체 탐색', () => {
  setCatalogs({ en: EN, ko: KO });
  setLocale('ko');
  assert.strictEqual(t('nested.deep'), '깊음 KO');
});

test('t: 복수 보간 + 미지정 파라미터는 원형 유지', () => {
  setCatalogs({ en: { s: '{a} and {b} and {c}' }, ko: {} });
  setLocale('en');
  assert.strictEqual(t('s', { a: '1', b: '2' }), '1 and 2 and {c}');
});

test('t: 현재 로케일에 없으면 en 폴백', () => {
  setCatalogs({ en: EN, ko: KO });
  setLocale('ko');
  assert.strictEqual(t('only'), 'EN only');
});

test('t: 어디에도 없으면 키 문자열 반환', () => {
  setCatalogs({ en: EN, ko: KO });
  setLocale('en');
  assert.strictEqual(t('does.not.exist'), 'does.not.exist');
});

test('setLocale: 미지원 로케일은 en 폴백', () => {
  setCatalogs({ en: EN, ko: KO });
  setLocale('fr');
  assert.strictEqual(getLocale(), 'en');
});

test('applyI18n: 가짜 root의 textContent/placeholder/title 채움', () => {
  setCatalogs({ en: { a: 'Label A', b: 'PH B', c: 'Title C' }, ko: {} });
  setLocale('en');
  const label = { attrs: { 'data-i18n': 'a' }, textContent: '', getAttribute(n) { return this.attrs[n]; }, setAttribute() {} };
  const input = { attrs: { 'data-i18n-placeholder': 'b' }, placeholder: '', getAttribute(n) { return this.attrs[n]; }, setAttribute(n, v) { if (n === 'placeholder') this.placeholder = v; } };
  const btn = { attrs: { 'data-i18n-title': 'c' }, title: '', getAttribute(n) { return this.attrs[n]; }, setAttribute(n, v) { if (n === 'title') this.title = v; } };
  const root = {
    querySelectorAll(sel) {
      if (sel === '[data-i18n]') return [label];
      if (sel === '[data-i18n-placeholder]') return [input];
      if (sel === '[data-i18n-title]') return [btn];
      return [];
    },
  };
  applyI18n(root);
  assert.strictEqual(label.textContent, 'Label A');
  assert.strictEqual(input.placeholder, 'PH B');
  assert.strictEqual(btn.title, 'Title C');
});
