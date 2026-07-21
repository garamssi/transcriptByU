import { parseVtt } from '../../infrastructure/vtt/vtt-parser.js';
import { LRUCache } from '../../infrastructure/cache/lru-cache.js';
import { lectureCacheKey } from '../../domain/cache-key.js';
import { DEFAULT_TARGET_LANG } from '../../domain/constants.js';
import { getLectureContext } from './transcript-manager.js';

// 강의별 번역 버킷: lectureKey → Map<원문, 번역>.
// 전역 단일 Map 을 쓰면, A 강의 요청의 늦은 응답이 B 로 이동한 뒤 도착해
// 저장소를 오염시킨다(A→B 이동 중 응답 도착). 강의 키로 버킷을 분리하면
// 저장은 '요청한 강의' 버킷으로, 조회는 '현재 강의' 버킷에서만 이뤄져
// 애초에 섞이지 않는다. 백그라운드 L1 캐시(lectureCacheKey)와 동일한 구조.
// LRUCache 로 담아 오래된 강의는 자동 축출(메모리 상한).
const buckets = new LRUCache();
const processedUrls = new Set();
let vttPending = false;

// 현재 목표 언어 (캐시 키 구성용). content 스크립트 초기화/설정 변경 시 갱신.
let currentLang = DEFAULT_TARGET_LANG;

/**
 * 캐시 키 계산용 현재 목표 언어를 설정한다.
 * @param {string} lang
 */
export function setActiveLang(lang) {
  if (lang) currentLang = lang;
}

/**
 * 주어진 강의 컨텍스트로 버킷 키를 만든다.
 * @param {{course:string, section:string, lecture:string}} ctx
 * @returns {string}
 */
function bucketKey(ctx) {
  return lectureCacheKey(currentLang, ctx.course, ctx.section, ctx.lecture);
}

/**
 * 현재 표시 중인 강의의 버킷 키.
 * @returns {string}
 */
export function currentLectureKey() {
  return bucketKey(getLectureContext());
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

    vttPending = true;
    try {
      const cues = parseVtt(vttText);
      if (cues.length === 0) {
        console.warn('[UdemyTranslator:VTT] no cues parsed');
        return;
      }

      const uniqueTexts = [...new Set(cues.map(c => c.text))];
      console.log(`[UdemyTranslator:VTT] ${cues.length} cues, ${uniqueTexts.length} unique texts`);

      await requestTranslations(uniqueTexts);
      document.dispatchEvent(new Event('vtt-translations-ready'));
    } catch (err) {
      console.error(`[UdemyTranslator:VTT] error: ${err.message}`);
    } finally {
      vttPending = false;
    }
  });

  // 리스너 등록 완료 → 인터셉터에 '준비됨' 신호를 보내, 리스너 등록 전에
  // 캡처돼 버퍼에 쌓인 VTT 를 재전송받는다(최초 로드 레이스 방지).
  window.postMessage({ type: 'UDEMY_VTT_BRIDGE_READY' }, window.location.origin);
}

/**
 * 주어진 원본 텍스트들을 배치 번역 요청하여 해당 강의 버킷에 저장한다.
 * VTT 최초 캡처와 수동 재번역이 공통으로 사용한다. 캐시가 비어 있으면
 * background 의 TranslationService 가 API 를 호출해 새 번역을 만들어 반환한다.
 *
 * 버킷 키는 요청을 보내는 시점(= 그 강의가 현재일 때)에 캡처한다. 따라서 응답이
 * 늦게 도착해 다른 강의로 이동한 뒤여도, 결과는 항상 '요청한 강의' 버킷에 저장된다.
 * @param {string[]} texts - 원본 텍스트 목록
 * @returns {Promise<number>} 저장소에 채워진 번역 수
 */
export async function requestTranslations(texts) {
  const uniqueTexts = [...new Set(texts)].filter(Boolean);
  if (uniqueTexts.length === 0) return 0;

  // 목표 언어를 스토리지에서 읽어 동기화한다. 키에 lang 이 포함되므로,
  // 초기화 순서/레이스와 무관하게 항상 올바른 언어 키로 저장·조회되게 한다.
  const { targetLang } = await chrome.storage.local.get('targetLang');
  if (targetLang) currentLang = targetLang;

  const ctx = getLectureContext();
  const key = bucketKey(ctx); // 요청 시점의 강의 키를 캡처 (응답이 늦어도 이 강의로 저장)

  const response = await chrome.runtime.sendMessage({
    type: 'TRANSLATE_BATCH',
    texts: uniqueTexts,
    course: ctx.course,
    lecture: ctx.lecture,
    section: ctx.section,
  });

  if (response?.error) {
    console.error(`[UdemyTranslator:VTT] translation error: ${response.error}`);
    return 0;
  }

  const results = response?.results || [];
  const bucket = getOrCreateBucket(key);
  let cachedCount = 0;
  let freshCount = 0;
  for (let i = 0; i < uniqueTexts.length; i++) {
    if (results[i]?.translation) {
      bucket.set(uniqueTexts[i], results[i].translation);
      if (results[i].cached) cachedCount++;
      else freshCount++;
    }
  }

  console.log(`[UdemyTranslator:VTT] ${freshCount + cachedCount}/${uniqueTexts.length} translations stored (cache hit: ${cachedCount}, fresh: ${freshCount})`);
  return freshCount + cachedCount;
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
 * 지정한 원본 텍스트들의 메모리 번역을 폐기한다 (재번역 시 오래된 번역 제거).
 * @param {string[]} texts - 원본 텍스트 목록
 * @param {string} [key] - 대상 강의 키 (기본: 현재 강의)
 */
export function forgetVttTranslations(texts, key = currentLectureKey()) {
  const bucket = buckets.get(key);
  if (!bucket) return;
  for (const text of texts) bucket.delete(text);
}

/**
 * 네비게이션 시 호출. 강의별 버킷은 키로 분리돼 오염되지 않으므로 유지하고
 * (되돌아오면 즉시 재사용, LRU 로 상한), VTT URL 처리 기록만 초기화해
 * 새 강의의 VTT 를 다시 처리하도록 한다.
 */
export function clearVttStore() {
  processedUrls.clear();
  vttPending = false;
}
