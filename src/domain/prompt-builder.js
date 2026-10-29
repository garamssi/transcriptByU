import { byCode, DEFAULT_TARGET_CODE } from './languages.js';

// 목표 언어별 문체 고정 — 청크마다 존댓말 수준이 달라지지 않게 한다.
const REGISTER_RULES = {
  ko: 'Use the formal polite lecture style (합니다체, e.g. "~합니다", "~입니다", "~하세요") for EVERY line. Never mix in 해요체 or 반말.',
  ja: 'Use the polite です/ます form for EVERY line. Never mix in plain form.',
};

/**
 * 배치 번역용 시스템 프롬프트를 생성한다.
 * 같은 강의의 모든 청크 요청에서 바이트 단위로 동일해야 한다(프롬프트 캐시 접두사).
 * 그래서 청크마다 달라지는 내용(번역할 줄·앞선 번역)은 buildBatchUserText 에 둔다.
 * @param {string} targetCode - 번역 대상 언어 코드 (예: 'ko')
 * @param {{ section?: string, lecture?: string }} [context] - 강의 컨텍스트
 * @param {string[]} [script] - 강의 전체 대본(원문, 순서대로). 참고용 문맥으로만 쓴다.
 * @returns {string} 시스템 프롬프트
 */
export function buildBatchSystemPrompt(targetCode, context, script) {
  const lang = byCode(targetCode) || byCode(DEFAULT_TARGET_CODE);
  const langEnglish = lang.englishName;
  const endonym = lang.endonym;

  let prompt = `You are a subtitle translator for an online course lecture. Translate each line to ${langEnglish} (${endonym}).

INPUT FORMAT: Each line to translate is "N|original sentence"
OUTPUT FORMAT: Each line must be "N|translated text"

STRICT RULES:
1. Output EXACTLY the same number of lines as input — no more, no less
2. Keep the SAME number N before the pipe
3. Translate ONLY the text after the pipe to ${langEnglish}
4. Do NOT add any explanation, commentary, or markdown formatting
5. Do NOT wrap output in code blocks
6. Even if input is just 1 line, follow the format exactly
7. ${langEnglish} ONLY, nothing else. NEVER output any other language

SENTENCE RULES (each line is shown as the subtitle while that sentence is being spoken):
- Each input line is one complete spoken sentence, or one part of a very long sentence. Translate it completely and naturally as a single subtitle.
- If a line is only part of a long sentence (it does not end with . ? or !), translate just that part so it reads as the natural beginning or continuation of the sentence. Do not pull in words from the neighboring parts.
- Never merge, split, reorder or skip lines.

CONSISTENCY RULES (the whole lecture must read as one coherent text):
- Use the full transcript below to understand the context of each sentence.
- Translate the same term the same way every time. Follow the previous translations given with the request; never switch to a different word for a term already translated.
- Keep technical terms, product names, code identifiers, commands and acronyms (e.g. Spring Boot, Docker, Kubernetes, REST API, @RestController) in their original form.
- Ordinary words are NOT code: translate words like account, customer, details or table by their meaning in this lecture's domain (e.g. a bank account is 계좌 in Korean). Keep only real identifiers (CamelCase names, annotations, method/class names) in their original form.${REGISTER_RULES[lang.code] ? `\n- ${REGISTER_RULES[lang.code]}` : ''}

Example (translating to Korean):
Input:
1|See you in the next lecture.
2|Keep learning and keep growing.

Output:
1|다음 강의에서 뵙겠습니다.
2|계속 배우고 계속 성장하세요.`;

  if (context?.section) {
    prompt += `\n\nContext: Online course. Section: "${context.section}".`;
    if (context.lecture) prompt += ` Lecture: "${context.lecture}".`;
    prompt += ` Use domain-appropriate terminology.`;
  }

  if (Array.isArray(script) && script.length > 0) {
    prompt += `\n\nFULL LECTURE TRANSCRIPT (original language, for context only — do NOT translate or output it):\n<transcript>\n${script.join('\n')}\n</transcript>`;
  }

  return prompt;
}

/**
 * 청크 요청의 사용자 메시지: 앞서 확정된 번역(용어·문체 기준) + 이번에 번역할 줄.
 * 참고 번역은 번호를 붙이지 않고 "|" 도 쓰지 않아 응답 파서와 섞이지 않게 한다.
 * @param {string[]} texts - 이번에 번역할 원문
 * @param {Array<[string, string]>} [references] - [원문, 번역] 쌍
 * @returns {string}
 */
export function buildBatchUserText(texts, references = []) {
  let text = '';
  if (references.length > 0) {
    text += `PREVIOUS TRANSLATIONS in this lecture (reference only — reuse the same terms and style, do NOT output these):\n<previous_translations>\n${references.map(([o, t]) => `${o} => ${t}`).join('\n')}\n</previous_translations>\n\n`;
  }
  const numberedLines = texts.map((t, j) => `${j + 1}|${t}`).join('\n');
  return `${text}[${texts.length} lines — output exactly ${texts.length} lines]\n${numberedLines}`;
}
