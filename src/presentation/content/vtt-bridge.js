import { parseVtt } from '../../infrastructure/vtt/vtt-parser.js';
import { getLectureContext } from './transcript-manager.js';

const vttTranslationStore = new Map();
const processedUrls = new Set();
let vttPending = false;

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
 * 주어진 원본 텍스트들을 배치 번역 요청하여 메모리 저장소에 저장한다.
 * VTT 최초 캡처와 수동 재번역이 공통으로 사용한다. 캐시가 비어 있으면
 * background 의 TranslationService 가 API 를 호출해 새 번역을 만들어 반환한다.
 * @param {string[]} texts - 원본 텍스트 목록
 * @returns {Promise<number>} 저장소에 채워진 번역 수
 */
export async function requestTranslations(texts) {
  const uniqueTexts = [...new Set(texts)].filter(Boolean);
  if (uniqueTexts.length === 0) return 0;

  const ctx = getLectureContext();
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
  let cachedCount = 0;
  let freshCount = 0;
  for (let i = 0; i < uniqueTexts.length; i++) {
    if (results[i]?.translation) {
      vttTranslationStore.set(uniqueTexts[i], results[i].translation);
      if (results[i].cached) cachedCount++;
      else freshCount++;
    }
  }

  console.log(`[UdemyTranslator:VTT] ${freshCount + cachedCount}/${uniqueTexts.length} translations stored (cache hit: ${cachedCount}, fresh: ${freshCount})`);
  return freshCount + cachedCount;
}

/**
 * VTT 번역 저장소에서 번역을 조회한다.
 * @param {string} text - 원본 텍스트
 * @returns {string|null}
 */
export function getVttTranslation(text) {
  return vttTranslationStore.get(text) || null;
}

/**
 * 지정한 원본 텍스트들의 메모리 번역을 폐기한다 (재번역 시 오래된 번역 제거).
 * @param {string[]} texts - 원본 텍스트 목록
 */
export function forgetVttTranslations(texts) {
  for (const text of texts) vttTranslationStore.delete(text);
}

/**
 * VTT 저장소를 초기화한다 (네비게이션 시 호출).
 */
export function clearVttStore() {
  vttTranslationStore.clear();
  processedUrls.clear();
  vttPending = false;
}
