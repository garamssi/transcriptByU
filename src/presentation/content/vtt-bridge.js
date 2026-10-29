import { parseVtt } from '../../infrastructure/vtt/vtt-parser.js';
import { LRUCache } from '../../infrastructure/cache/lru-cache.js';
import { resolveCode, DEFAULT_TARGET_CODE } from '../../domain/languages.js';
import { getLectureContext } from './transcript-manager.js';
import { AUTO_RETRY_BASE_MS, AUTO_RETRY_MAX_ATTEMPTS, AUTO_RETRY_MAX_DELAY_MS } from '../../domain/constants.js';

// 강의별 번역 버킷: lectureKey → Map<원문, 번역>.
// 전역 단일 Map 을 쓰면, A 강의 요청의 늦은 응답이 B 로 이동한 뒤 도착해
// 저장소를 오염시킨다(A→B 이동 중 응답 도착). 강의 키로 버킷을 분리하면
// 저장은 '요청한 강의' 버킷으로, 조회는 '현재 강의' 버킷에서만 이뤄져
// 애초에 섞이지 않는다. 백그라운드 L1 캐시(lectureCacheKey)와 동일한 구조.
// LRUCache 로 담아 오래된 강의는 자동 축출(메모리 상한).
const buckets = new LRUCache();
const processedUrls = new Set();
// 진행 중인 번역 요청 표시(`${lectureKey} ${text}`). VTT 캡처 경로와 DOM
// 자동 경로가 초기 로드 시 같은 강의를 동시에 요청해 API 를 이중 호출(paid provider
// 비용 2배)하는 것을 막는다.
const inFlight = new Set();
// 진행 중인 배치 요청 → 그 요청의 강의 키. 청크별 부분 결과(TRANSLATE_PARTIAL)를
// 요청한 강의 버킷에 바로 채우는 데 쓴다.
const pendingRequests = new Map();
let requestSeq = 0;

// 현재 목표 언어 (캐시 키 구성용). content 스크립트 초기화/설정 변경 시 갱신.
let currentLang = DEFAULT_TARGET_CODE;

/**
 * 캐시 키 계산용 현재 목표 언어를 설정한다.
 * @param {string} lang
 */
export function setActiveLang(lang) {
  if (lang) currentLang = lang;
}

/**
 * 현재 목표 언어를 반환한다 (배지/스킵 판정용).
 * @returns {string}
 */
export function getActiveLang() {
  return currentLang;
}

/**
 * 화면 표시용 인메모리 버킷 키.
 * 강의 제목·섹션은 사이드바 DOM 렌더 타이밍에 따라 초기엔 비어 있을 수 있어,
 * VTT 조기 캡처(저장) 시점과 캡션/패널 조회 시점의 키가 어긋날 수 있다(→ 캡처됐는데
 * 화면 매칭 실패). 그래서 버킷 키는 DOM 이 아니라 항상 존재하는 URL(코스 슬러그 +
 * 강의 ID)로 구성해 저장·조회 키를 타이밍과 무관하게 일치시킨다.
 * (프롬프트 컨텍스트·영속 캐시용 강의 제목은 requestTranslations 가 별도로 전달한다.)
 * @returns {string}
 */
export function currentLectureKey() {
  const m = location.pathname.match(/\/course\/([^/]+)\/learn\/lecture\/(\d+)/);
  const id = m ? `${m[1]}/${m[2]}` : location.pathname;
  return `${currentLang}::${id}`;
}

function getOrCreateBucket(key) {
  let bucket = buckets.get(key);
  if (!bucket) {
    bucket = new Map();
    buckets.set(key, bucket);
  }
  return bucket;
}

/**
 * 파싱된 큐가 '자막'인지 판별한다. Udemy 는 스크럽 썸네일도 WebVTT(text/vtt)로 주는데,
 * 그 큐 텍스트는 이미지 참조(예: "thumb-sprites-0.jpg#xywh=0,0,160,90")다. 이런 VTT 를
 * 번역하면 쓰레기 번역 + API 낭비가 되므로, 이미지 참조 비율이 높으면 자막이 아니라고 본다.
 * @param {Array<{text:string}>} cues
 * @returns {boolean}
 */
function looksLikeSubtitles(cues) {
  if (cues.length === 0) return false;
  const imageLike = cues.filter(c => /#xywh=|\.(jpe?g|png|webp)(\?|#|$)/i.test(c.text)).length;
  return imageLike / cues.length < 0.5;
}

/**
 * VTT postMessage 리스너를 등록한다.
 */
export function initVttBridge() {
  window.addEventListener('message', async (event) => {
    if (event.source !== window) return;
    if (event.data?.type !== 'UDEMY_VTT_CAPTURED') return;

    const { vttText, url } = event.data;

    if (processedUrls.has(url)) return;
    processedUrls.add(url);

    console.log(`[UdemyTranslator:VTT] captured: ${url}`);

    try {
      const cues = parseVtt(vttText);
      if (cues.length === 0) {
        console.warn('[UdemyTranslator:VTT] no cues parsed');
        return;
      }

      // 썸네일 스프라이트 등 자막이 아닌 VTT 는 번역하지 않는다 (내용 기반 최종 판별).
      if (!looksLikeSubtitles(cues)) {
        console.log(`[UdemyTranslator:VTT] skipped non-subtitle VTT (thumbnail/sprite): ${url.substring(0, 80)}`);
        return;
      }

      const uniqueTexts = [...new Set(cues.map(c => c.text))];
      console.log(`[UdemyTranslator:VTT] ${cues.length} cues, ${uniqueTexts.length} unique texts`);

      await requestTranslations(uniqueTexts);
      document.dispatchEvent(new Event('vtt-translations-ready'));
    } catch (err) {
      console.error(`[UdemyTranslator:VTT] error: ${err.message}`);
    }
  });

  // 청크별 부분 결과: 강의 전체 번역이 끝나기 전에 먼저 도착한 청크를 바로 화면에 반영한다.
  chrome.runtime.onMessage.addListener((message) => {
    if (message?.type !== 'TRANSLATE_PARTIAL') return;
    const key = pendingRequests.get(message.requestId);
    if (!key) return;
    const bucket = getOrCreateBucket(key);
    for (const [text, translation] of Object.entries(message.translations || {})) {
      if (translation) bucket.set(text, translation);
    }
    if (key === currentLectureKey()) document.dispatchEvent(new Event('vtt-translations-ready'));
  });

  // 리스너 등록 완료 → 인터셉터에 '준비됨' 신호를 보내, 리스너 등록 전에
  // 캡처돼 버퍼에 쌓인 VTT 를 재전송받는다(최초 로드 레이스 방지).
  window.postMessage({ type: 'UDEMY_VTT_BRIDGE_READY' }, window.location.origin);
}

/**
 * 주어진 원본 텍스트들을 배치 번역 요청하여 해당 강의 버킷에 저장한다.
 * VTT 캡처·DOM 자동 요청·수동 재번역·자동 재시도 네 경로가 공통으로 사용한다. 캐시가 비어 있으면
 * background 의 TranslationService 가 API 를 호출해 새 번역을 만들어 반환한다.
 *
 * 버킷 키는 요청을 보내는 시점(= 그 강의가 현재일 때)에 캡처한다. 따라서 응답이
 * 늦게 도착해 다른 강의로 이동한 뒤여도, 결과는 항상 '요청한 강의' 버킷에 저장된다.
 * 실패한 문장은 요청 추적기에 기록돼 간격을 늘려 가며 자동 재시도된다.
 * @param {string[]} texts - 원본 텍스트 목록
 * @param {{ force?: boolean }} [opts] - force: 캐시를 건너뛰고 새로 번역 (재번역)
 * @returns {Promise<{ count: number, fresh: number, failedTexts: string[], error: object|null }>}
 *   count: 버킷에 채워진 번역 수, fresh: 그중 새로 번역된 수
 */
export async function requestTranslations(texts, { force = false } = {}) {
  const empty = { count: 0, fresh: 0, failedTexts: [], error: null };
  const uniqueTexts = [...new Set(texts)].filter(Boolean);
  if (uniqueTexts.length === 0) return empty;

  // 목표 언어를 스토리지에서 읽어 동기화한다. 키에 lang 이 포함되므로,
  // 초기화 순서/레이스와 무관하게 항상 올바른 언어 키로 저장·조회되게 한다.
  const { targetLang } = await chrome.storage.local.get('targetLang');
  const targetCode = resolveCode(targetLang);
  currentLang = targetCode;

  const ctx = getLectureContext();
  const key = currentLectureKey(); // 요청 시점의 강의 키(URL 기반, 안정적)를 캡처 — 늦은 응답도 이 강의로 저장

  // 이미 요청 진행 중인 텍스트는 제외한다. 완료 처리는 진행 중인 호출이 담당하고,
  // 그 호출이 버킷을 채운 뒤 재스캔(vtt-translations-ready / 자동요청 reschedule)에서
  // 화면에 반영되므로, 여기서 재전송하지 않아도 누락되지 않는다.
  // 진행 중인 호출이 실패하면 그 호출이 추적기에 실패를 기록하므로 재시도도 누락되지 않는다.
  const marker = t => `${key} ${t}`;
  const toSend = uniqueTexts.filter(t => !inFlight.has(marker(t)));
  if (toSend.length === 0) return empty;
  toSend.forEach(t => inFlight.add(marker(t)));
  const track = trackerFor(key);
  toSend.forEach(t => track.set(t, { attempts: track.get(t)?.attempts || 0, state: 'pending' }));

  const requestId = `${Date.now().toString(36)}-${++requestSeq}`;
  pendingRequests.set(requestId, key);

  let response;
  try {
    response = await chrome.runtime.sendMessage({
      type: 'TRANSLATE_BATCH',
      requestId,
      texts: toSend,
      targetCode,
      course: ctx.course,
      lecture: ctx.lecture,
      section: ctx.section,
      force,
    });
  } catch (err) {
    // 서비스 워커 재시작·확장 업데이트 등으로 응답 채널이 끊긴 경우
    response = { error: { code: 'DISCONNECTED', message: err?.message } };
  } finally {
    toSend.forEach(t => inFlight.delete(marker(t)));
    pendingRequests.delete(requestId);
  }

  const error = response?.error || null;
  const results = response?.results || [];
  const bucket = getOrCreateBucket(key);
  let cachedCount = 0;
  let freshCount = 0;
  const failedTexts = [];
  let failCode = null;
  for (let i = 0; i < toSend.length; i++) {
    const r = results[i];
    if (r?.translation && r.error) {
      // 재번역(force) 실패: 기존 번역은 유지하되 실패로 집계한다(자동 재시도는 불필요).
      bucket.set(toSend[i], r.translation);
      failedTexts.push(toSend[i]);
      failCode = failCode || r.error;
      track.set(toSend[i], { state: 'done' });
    } else if (r?.translation) {
      bucket.set(toSend[i], r.translation);
      if (r.cached) cachedCount++;
      else freshCount++;
      track.set(toSend[i], { state: 'done' });
    } else if (r?.skipped) {
      track.set(toSend[i], { state: 'done' });
    } else {
      const code = r?.error || error?.code || 'UNKNOWN';
      failedTexts.push(toSend[i]);
      failCode = failCode || code;
      markFailed(track, toSend[i], code, error?.retryAfterMs);
    }
  }
  // 대표 오류가 없어도(예: 일부 줄 파싱 실패) 호출측이 실패 원인을 알 수 있게 채운다.
  const resultError = error || (failCode ? { code: failCode } : null);

  if (error) {
    console.error(`[UdemyTranslator:VTT] translation error: ${error.code}${error.message ? ` — ${error.message}` : ''}`);
  }
  console.log(`[UdemyTranslator:VTT] ${freshCount + cachedCount}/${toSend.length} translations stored (cache hit: ${cachedCount}, fresh: ${freshCount}, failed: ${failedTexts.length})`);

  scheduleRetry();
  emitStatus({ key, error, failedCount: failedTexts.length, okCount: freshCount + cachedCount });
  return { count: freshCount + cachedCount, fresh: freshCount, failedTexts, error: resultError };
}

// === 요청 추적·자동 재시도 ===
// lectureKey → Map<원문, { state: 'pending'|'done'|'failed'|'gaveUp', attempts, nextRetryAt, code }>
// DOM 자동 경로는 추적기에 없는 문장만 요청한다(이미 진행 중이거나 재시도 대기 중인 문장의
// 중복 요청 방지). 실패한 문장의 재시도는 이 모듈의 타이머가 직접 담당한다.
const tracker = new Map();
let retryTimer = null;
const statusListeners = new Set();

// 자동 재시도해도 소용없는 오류 — 설정을 바꾸거나 한도가 초기화될 때까지 멈춘다.
const NO_AUTO_RETRY = new Set(['QUOTA_DAILY', 'AUTH', 'BAD_REQUEST', 'NOT_RUNNING', 'BLOCKED', 'DISABLED', 'NO_API_KEY']);

function trackerFor(key) {
  let m = tracker.get(key);
  if (!m) {
    m = new Map();
    tracker.set(key, m);
  }
  return m;
}

function markFailed(track, text, code, retryAfterMs) {
  const attempts = (track.get(text)?.attempts || 0) + 1;
  if (NO_AUTO_RETRY.has(code) || attempts >= AUTO_RETRY_MAX_ATTEMPTS) {
    track.set(text, { state: 'gaveUp', attempts, code });
    return;
  }
  const backoff = Math.min(AUTO_RETRY_BASE_MS * 2 ** (attempts - 1), AUTO_RETRY_MAX_DELAY_MS);
  track.set(text, { state: 'failed', attempts, code, nextRetryAt: Date.now() + Math.max(backoff, retryAfterMs || 0) });
}

/** DOM 자동 경로가 이 문장을 새로 요청해도 되는지 (추적 중이면 false). */
export function isRequestable(text, key = currentLectureKey()) {
  return !tracker.get(key)?.has(text);
}

/** 재번역 전에 해당 문장들의 추적 기록을 지워 다시 요청할 수 있게 한다. */
export function resetTracking(texts, key = currentLectureKey()) {
  const track = tracker.get(key);
  if (!track) return;
  for (const t of texts) track.delete(t);
}

/**
 * 설정이 바뀌어(번역 켜기·API 키·프로바이더 변경) 이전 실패가 더는 유효하지 않을 때,
 * 실패·포기 상태의 문장을 모두 즉시 재시도 대상으로 되돌린다.
 */
export function resetFailures() {
  const now = Date.now();
  for (const track of tracker.values()) {
    for (const [text, s] of track) {
      if (s.state === 'failed' || s.state === 'gaveUp') {
        track.set(text, { state: 'failed', attempts: 0, code: s.code, nextRetryAt: now });
      }
    }
  }
  scheduleRetry();
}

/**
 * 요청 결과 상태 구독 (배지 표시용).
 * @param {(s: { key: string, error: object|null, failedCount: number, okCount: number }) => void} listener
 */
export function onRequestStatus(listener) {
  statusListeners.add(listener);
}

function emitStatus(status) {
  for (const l of statusListeners) {
    try { l(status); } catch (_) { /* noop */ }
  }
}

function scheduleRetry() {
  clearTimeout(retryTimer);
  retryTimer = null;
  const track = tracker.get(currentLectureKey());
  if (!track) return;
  let earliest = Infinity;
  for (const s of track.values()) {
    if (s.state === 'failed' && s.nextRetryAt < earliest) earliest = s.nextRetryAt;
  }
  if (earliest === Infinity) return;
  retryTimer = setTimeout(retryDue, Math.max(0, earliest - Date.now()));
}

async function retryDue() {
  retryTimer = null;
  const track = tracker.get(currentLectureKey());
  if (!track) return;
  const now = Date.now();
  const due = [...track.entries()]
    .filter(([, s]) => s.state === 'failed' && s.nextRetryAt <= now)
    .map(([text]) => text);
  if (due.length === 0) {
    scheduleRetry();
    return;
  }
  console.log(`[UdemyTranslator:VTT] auto-retry: ${due.length} failed texts`);
  try {
    const { count } = await requestTranslations(due);
    if (count > 0) document.dispatchEvent(new Event('vtt-translations-ready'));
  } catch (err) {
    console.error(`[UdemyTranslator:VTT] auto-retry error: ${err?.message || err}`);
  }
}

/**
 * 강의 버킷에서 번역을 조회한다.
 * @param {string} text - 원본 텍스트
 * @param {string} [key] - 조회할 강의 키 (기본: 현재 강의)
 * @returns {string|null}
 */
export function getVttTranslation(text, key = currentLectureKey()) {
  const bucket = buckets.get(key);
  return (bucket && bucket.get(text)) || null;
}

/**
 * 네비게이션 시 호출. 강의별 버킷은 키로 분리돼 오염되지 않으므로 유지하고
 * (되돌아오면 즉시 재사용, LRU 로 상한), VTT URL 처리 기록과 요청 추적기만 초기화해
 * 새 강의의 VTT 를 다시 처리하고, 되돌아오면 실패했던 문장도 다시 요청하도록 한다.
 */
export function clearVttStore() {
  processedUrls.clear();
  tracker.clear();
  clearTimeout(retryTimer);
  retryTimer = null;
}
