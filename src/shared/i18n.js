// 경량 UI i18n 런타임 (순수: I/O·chrome API 없음).
// 카탈로그는 setCatalogs로 주입, 저장/로딩은 호출측(팝업/콘텐츠)이 담당한다.

let catalogs = {};
let locale = 'en';

export function setCatalogs(c) {
  catalogs = c || {};
}

export function setLocale(loc) {
  locale = (loc && catalogs[loc]) ? loc : 'en';
}

export function getLocale() {
  return locale;
}

function lookup(catalog, key) {
  if (!catalog) return undefined;
  return key.split('.').reduce((o, k) => (o == null ? undefined : o[k]), catalog);
}

export function t(key, params) {
  let val = lookup(catalogs[locale], key);
  if (val == null) val = lookup(catalogs.en, key);
  if (val == null) return key;
  if (params) {
    val = String(val).replace(/\{(\w+)\}/g, (m, p) =>
      Object.prototype.hasOwnProperty.call(params, p) ? String(params[p]) : m);
  }
  return val;
}

export function applyI18n(root = document) {
  root.querySelectorAll('[data-i18n]').forEach((el) => {
    el.textContent = t(el.getAttribute('data-i18n'));
  });
  root.querySelectorAll('[data-i18n-placeholder]').forEach((el) => {
    el.setAttribute('placeholder', t(el.getAttribute('data-i18n-placeholder')));
  });
  root.querySelectorAll('[data-i18n-title]').forEach((el) => {
    el.setAttribute('title', t(el.getAttribute('data-i18n-title')));
  });
}
