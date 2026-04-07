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

      const ctx = getLectureContext();
      const response = await chrome.runtime.sendMessage({
        type: 'TRANSLATE_BATCH',
        texts: uniqueTexts,
        lecture: ctx.lecture,
        section: ctx.section,
      });

      if (response?.error) {
        console.error(`[UdemyTranslator:VTT] translation error: ${response.error}`);
        return;
      }

      const results = response?.results || [];
      for (let i = 0; i < uniqueTexts.length; i++) {
        if (results[i]?.translation) {
          vttTranslationStore.set(uniqueTexts[i], results[i].translation);
        }
      }

      console.log(`[UdemyTranslator:VTT] ${vttTranslationStore.size}/${uniqueTexts.length} translations stored`);
      document.dispatchEvent(new Event('vtt-translations-ready'));
    } catch (err) {
      console.error(`[UdemyTranslator:VTT] error: ${err.message}`);
    } finally {
      vttPending = false;
    }
  });
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
 * VTT 저장소를 초기화한다 (네비게이션 시 호출).
 */
export function clearVttStore() {
  vttTranslationStore.clear();
  processedUrls.clear();
  vttPending = false;
}
