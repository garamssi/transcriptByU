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

INPUT FORMAT: Each line to translate is "N|original text"
OUTPUT FORMAT: Each line must be "N|translated text"

STRICT RULES:
1. Output EXACTLY the same number of lines as input — no more, no less
2. Keep the SAME number N before the pipe
3. Translate ONLY the text after the pipe to ${langEnglish}
4. Do NOT add any explanation, commentary, or markdown formatting
5. Do NOT wrap output in code blocks
6. Even if input is just 1 line, follow the format exactly
7. ${langEnglish} ONLY, nothing else. NEVER output any other language

LINE ALIGNMENT RULES (each line is shown on screen at its own time — misplaced text is a subtitle out of sync):
- Output line N must contain the translation of what input line N says — nothing from line N-1 or N+1.
- A sentence often continues across lines. Split your translation at the matching point and keep each fragment on its own line, even if the ${langEnglish} word order then feels slightly less natural. Never move a phrase, a verb or a sentence ending to another line.
- If input line N ends one sentence and starts the next, output line N must also end that sentence and start the next.
- Never merge two lines into one and never leave a line empty.

Example of a sentence split across lines (translating to Korean):
Input:
1|Now let's go back to the controller. Inside the
2|fetch method, I'm going to invoke the service layer
3|by passing the mobile number.
Output:
1|이제 컨트롤러로 돌아가겠습니다. fetch 메서드
2|안에서 서비스 계층을 호출하는데,
3|휴대폰 번호를 전달하겠습니다.

CONSISTENCY RULES (the whole lecture must read as one coherent text):
- Use the full transcript below to understand the meaning of each fragment.
- Translate the same term the same way every time. Follow the previous translations given with the request; never switch to a different word for a term already translated.
- Keep technical terms, product names, code identifiers, commands and acronyms (e.g. Spring Boot, Docker, Kubernetes, REST API, @RestController) in their original form.${REGISTER_RULES[lang.code] ? `\n- ${REGISTER_RULES[lang.code]}` : ''}

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
