// === L1 캐시: 메모리 LRU Map (강의 단위, 최대 50개) ===
class LRUCache {
  constructor(max = 50) {
    this.max = max;
    this.map = new Map();
  }

  get(key) {
    if (!this.map.has(key)) return undefined;
    const val = this.map.get(key);
    this.map.delete(key);
    this.map.set(key, val);
    return val;
  }

  set(key, val) {
    if (this.map.has(key)) this.map.delete(key);
    this.map.set(key, val);
    if (this.map.size > this.max) {
      const oldest = this.map.keys().next().value;
      this.map.delete(oldest);
    }
  }

  delete(key) {
    this.map.delete(key);
  }

  clear() {
    this.map.clear();
  }
}

const l1Cache = new LRUCache(50);

// === L2 캐시: chrome.storage.local (강의 단위) ===
const L2_PREFIX = 'lec_';

// 강의 캐시 키: "targetLang::section||lecture"
function lectureCacheKey(targetLang, section, lecture) {
  return `${targetLang}::${section || ''}||${lecture || ''}`;
}

async function l2Get(key) {
  const result = await chrome.storage.local.get(L2_PREFIX + key);
  return result[L2_PREFIX + key] || null;
}

async function l2Set(key, value) {
  await chrome.storage.local.set({ [L2_PREFIX + key]: value });
}

async function l2Delete(keys) {
  const storageKeys = keys.map(k => k.startsWith(L2_PREFIX) ? k : L2_PREFIX + k);
  if (storageKeys.length > 0) {
    await chrome.storage.local.remove(storageKeys);
  }
}

async function l2ClearAll() {
  const all = await chrome.storage.local.get(null);
  const cacheKeys = Object.keys(all).filter(k => k.startsWith(L2_PREFIX));
  if (cacheKeys.length > 0) {
    await chrome.storage.local.remove(cacheKeys);
  }
}

// === 구버전 캐시 마이그레이션 (cache_ → lec_ 전환 시 구 데이터 삭제) ===
(async () => {
  const all = await chrome.storage.local.get(null);
  const oldKeys = Object.keys(all).filter(k => k.startsWith('cache_'));
  if (oldKeys.length > 0) {
    await chrome.storage.local.remove(oldKeys);
  }
})();

// === 시스템 프롬프트 생성 ===
function buildBatchSystemPrompt(targetLang, context) {
  let prompt = `You are a subtitle translator. Input lines have format "N|original text". Translate ONLY the text after the pipe to ${targetLang}.
Rules:
- Output format: "N|translated text" (keep the SAME number N, replace only the text part)
- Do NOT include the line number inside the translated text
- Output one line per input line, same order, no extras
- Example: Input "3|Hello world" → Output "3|안녕하세요"`;

  if (context?.section) {
    prompt += `\nContext: Online course. Section: "${context.section}".`;
    if (context.lecture) prompt += ` Lecture: "${context.lecture}".`;
    prompt += ` Use domain-appropriate terminology.`;
  }

  return prompt;
}

// === Provider 설정 ===
async function getProviderConfig() {
  const stored = await chrome.storage.local.get([
    'provider', 'claudeApiKey', 'geminiApiKey', 'apiKey', 'model'
  ]);

  const provider = stored.provider || 'gemini';
  let apiKey, model;

  if (provider === 'gemini') {
    apiKey = stored.geminiApiKey;
    model = (stored.model && stored.model.startsWith('gemini')) ? stored.model : 'gemini-2.5-flash';
  } else {
    apiKey = stored.claudeApiKey || stored.apiKey;
    model = (stored.model && stored.model.startsWith('claude')) ? stored.model : 'claude-haiku-4-5-20251001';
  }

  return { provider, apiKey, model };
}

// === API 호출 ===
async function callClaude(systemPrompt, userText, apiKey, model, maxTokens) {
  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
      'anthropic-dangerous-direct-browser-access': 'true'
    },
    body: JSON.stringify({
      model,
      max_tokens: maxTokens,
      system: systemPrompt,
      messages: [{ role: 'user', content: userText }]
    })
  });

  if (response.status === 429) throw new Error('RATE_LIMIT');
  if (!response.ok) {
    const errBody = await response.text();
    throw new Error(`API_ERROR:${response.status}:${errBody}`);
  }

  const data = await response.json();
  return data.content[0].text.trim();
}

async function callGemini(systemPrompt, userText, apiKey, model, maxTokens) {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;

  // 2.5 모델은 thinking이 기본 활성화 → 번역에 불필요하므로 비활성화
  const genConfig = { maxOutputTokens: maxTokens };
  if (model.includes('2.5')) {
    genConfig.thinkingConfig = { thinkingBudget: 0 };
  }

  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: systemPrompt }] },
      contents: [{ role: 'user', parts: [{ text: userText }] }],
      generationConfig: genConfig
    })
  });

  if (response.status === 429) throw new Error('RATE_LIMIT');
  if (!response.ok) {
    const errBody = await response.text();
    throw new Error(`API_ERROR:${response.status}:${errBody}`);
  }

  const data = await response.json();
  return data.candidates[0].content.parts[0].text.trim();
}

function callApi(systemPrompt, userText, provider, apiKey, model, maxTokens) {
  if (provider === 'gemini') {
    return callGemini(systemPrompt, userText, apiKey, model, maxTokens);
  }
  return callClaude(systemPrompt, userText, apiKey, model, maxTokens);
}

// === 배치 응답 파싱 ===
function parseBatchResponse(responseText) {
  const lines = responseText.split('\n').filter(l => l.trim());
  const result = new Map();

  for (const line of lines) {
    const pipeIdx = line.indexOf('|');
    if (pipeIdx === -1) continue;
    const num = parseInt(line.slice(0, pipeIdx).trim());
    const text = line.slice(pipeIdx + 1).trim();
    if (!isNaN(num) && text) {
      result.set(num, text);
    }
  }

  return result;
}

// ============================================================
// 핵심: 배치 번역 (강의 단위 캐시 → 1회 API → 강의 캐시 업데이트)
// ============================================================
async function handleTranslateBatch({ texts, targetLang: msgLang, lecture, section }) {
  try {
    const stored = await chrome.storage.local.get(['enabled', 'targetLang']);
    if (stored.enabled === false) return { error: 'DISABLED' };

    const { provider, apiKey, model } = await getProviderConfig();
    if (!apiKey) return { error: 'NO_API_KEY' };

    const targetLang = msgLang || stored.targetLang || '한국어';
    const context = { lecture: lecture || '', section: section || '' };
    const lKey = lectureCacheKey(targetLang, context.section, context.lecture);

    // 1) 강의 캐시 로드 (L1 → L2)
    let lectureTranslations = l1Cache.get(lKey);
    if (!lectureTranslations) {
      const l2Val = await l2Get(lKey);
      if (l2Val) {
        lectureTranslations = l2Val;
        l1Cache.set(lKey, lectureTranslations);
      } else {
        lectureTranslations = {};
      }
    }

    // 2) 각 텍스트를 캐시에서 조회
    const results = new Array(texts.length).fill(null);
    const uncachedIndices = [];

    for (let i = 0; i < texts.length; i++) {
      const cached = lectureTranslations[texts[i]];
      if (cached) {
        results[i] = { translation: cached, cached: true };
      } else {
        uncachedIndices.push(i);
      }
    }

    // 3) 미번역분: 중복 제거 후 청크 분할 API 호출
    if (uncachedIndices.length > 0) {
      const uniqueTexts = [...new Set(uncachedIndices.map(i => texts[i]))];
      const systemPrompt = buildBatchSystemPrompt(targetLang, context);
      const CHUNK_SIZE = 30;

      try {
        const newTranslations = {};

        // 청크 분할하여 순차 호출
        for (let start = 0; start < uniqueTexts.length; start += CHUNK_SIZE) {
          const chunk = uniqueTexts.slice(start, start + CHUNK_SIZE);
          const userText = chunk.map((t, j) => `${j + 1}|${t}`).join('\n');
          const maxTokens = Math.max(4096, chunk.length * 200);

          const responseText = await callApi(systemPrompt, userText, provider, apiKey, model, maxTokens);
          const parsed = parseBatchResponse(responseText);

          for (let j = 0; j < chunk.length; j++) {
            const translation = parsed.get(j + 1);
            if (translation) {
              newTranslations[chunk[j]] = translation;
            }
          }
        }

        // 결과 적용
        for (const i of uncachedIndices) {
          const translation = newTranslations[texts[i]];
          if (translation) {
            results[i] = { translation, cached: false };
          } else {
            results[i] = { error: 'PARSE_ERROR' };
          }
        }

        // 강의 캐시에 병합 저장 (1회 storage.set)
        if (Object.keys(newTranslations).length > 0) {
          Object.assign(lectureTranslations, newTranslations);
          l1Cache.set(lKey, lectureTranslations);
          await l2Set(lKey, lectureTranslations);
        }

      } catch (err) {
        for (const i of uncachedIndices) {
          if (!results[i]) results[i] = { error: err.message };
        }
      }
    }

    return { results };
  } catch (err) {
    return { error: err.message };
  }
}

// === 배치 재번역 (캐시 무시, 1회 API) ===
async function handleRetranslateBatch({ texts, lang, lecture, section }) {
  try {
    const { provider, apiKey, model } = await getProviderConfig();
    if (!apiKey) return { error: 'NO_API_KEY' };

    const targetLang = lang;
    const context = { lecture: lecture || '', section: section || '' };
    const lKey = lectureCacheKey(targetLang, context.section, context.lecture);

    const uniqueTexts = [...new Set(texts)];
    const systemPrompt = buildBatchSystemPrompt(targetLang, context);
    const CHUNK_SIZE = 30;

    // 청크 분할하여 순차 호출
    const translationMap = {};
    for (let start = 0; start < uniqueTexts.length; start += CHUNK_SIZE) {
      const chunk = uniqueTexts.slice(start, start + CHUNK_SIZE);
      const userText = chunk.map((t, j) => `${j + 1}|${t}`).join('\n');
      const maxTokens = Math.max(4096, chunk.length * 200);

      const responseText = await callApi(systemPrompt, userText, provider, apiKey, model, maxTokens);
      const parsed = parseBatchResponse(responseText);

      for (let j = 0; j < chunk.length; j++) {
        const translation = parsed.get(j + 1);
        if (translation) {
          translationMap[chunk[j]] = translation;
        }
      }
    }

    // 결과 배열
    const results = new Array(texts.length).fill(null);
    for (let i = 0; i < texts.length; i++) {
      const translation = translationMap[texts[i]];
      if (translation) {
        results[i] = { translation };
      } else {
        results[i] = { error: 'PARSE_ERROR' };
      }
    }

    // 강의 캐시 덮어쓰기 (재번역이므로 기존 캐시 교체)
    if (Object.keys(translationMap).length > 0) {
      l1Cache.set(lKey, translationMap);
      await l2Set(lKey, translationMap);
    }

    return { results };
  } catch (err) {
    return { error: err.message };
  }
}

// === 메시지 리스너 ===
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'TRANSLATE_BATCH') {
    handleTranslateBatch(message).then(sendResponse);
    return true;
  }

  if (message.type === 'RETRANSLATE_BATCH') {
    handleRetranslateBatch(message).then(sendResponse);
    return true;
  }

  if (message.type === 'CLEAR_CACHE') {
    l1Cache.clear();
    l2ClearAll().then(() => sendResponse({ success: true }));
    return true;
  }

  if (message.type === 'GET_CACHE_LIST') {
    (async () => {
      const all = await chrome.storage.local.get(null);
      const items = [];
      for (const [key, value] of Object.entries(all)) {
        if (!key.startsWith(L2_PREFIX)) continue;
        const raw = key.slice(L2_PREFIX.length);
        // 키 형식: "targetLang::section||lecture"
        const langSep = raw.indexOf('::');
        if (langSep === -1) continue;
        const lang = raw.slice(0, langSep);
        const rest = raw.slice(langSep + 2);
        const lecSep = rest.indexOf('||');
        const section = lecSep !== -1 ? rest.slice(0, lecSep) : '';
        const lecture = lecSep !== -1 ? rest.slice(lecSep + 2) : rest;
        const count = (typeof value === 'object' && value !== null) ? Object.keys(value).length : 0;

        items.push({ key, lang, section, lecture, count });
      }
      sendResponse({ items });
    })();
    return true;
  }

  if (message.type === 'DELETE_CACHE_ITEMS') {
    (async () => {
      const keys = message.keys || [];
      if (keys.length > 0) {
        await chrome.storage.local.remove(keys);
        for (const key of keys) {
          l1Cache.delete(key.slice(L2_PREFIX.length));
        }
      }
      sendResponse({ success: true });
    })();
    return true;
  }

  if (message.type === 'PING') {
    sendResponse({ pong: true });
    return false;
  }
});
