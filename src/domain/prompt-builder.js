/**
 * 배치 번역용 시스템 프롬프트를 생성한다.
 * @param {string} targetLang - 번역 대상 언어
 * @param {{ section?: string, lecture?: string }} [context] - 강의 컨텍스트
 * @returns {string} 시스템 프롬프트
 */
export function buildBatchSystemPrompt(targetLang, context) {
  const langMap = { '한국어': 'Korean', '日本語': 'Japanese', '中文': 'Chinese' };
  const langEnglish = langMap[targetLang] || targetLang;

  let prompt = `You are a subtitle translator. Translate each line to ${langEnglish} (${targetLang}).

INPUT FORMAT: Each line is "N|original text"
OUTPUT FORMAT: Each line must be "N|translated text"

STRICT RULES:
1. Output EXACTLY the same number of lines as input — no more, no less
2. Keep the SAME number N before the pipe
3. Translate ONLY the text after the pipe to ${langEnglish}
4. Do NOT add any explanation, commentary, or markdown formatting
5. Do NOT wrap output in code blocks
6. Even if input is just 1 line, follow the format exactly
7. ${langEnglish} ONLY, nothing else. NEVER output any other language

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

  return prompt;
}

/**
 * Ollama 전용 경량 시스템 프롬프트를 생성한다.
 * 토큰 수를 최소화하여 로컬 LLM 추론 속도를 높인다.
 * @param {string} targetLang - 번역 대상 언어
 * @param {{ section?: string, lecture?: string }} [context] - 강의 컨텍스트
 * @returns {string} 시스템 프롬프트
 */
export function buildOllamaSystemPrompt(targetLang, context) {
  const langMap = { '한국어': 'Korean', '日本語': 'Japanese', '中文': 'Chinese' };
  const langEnglish = langMap[targetLang] || targetLang;

  let prompt = `Translate each line to ${langEnglish}. Format: "N|text" in, "N|translated" out. No extra text.`;

  if (context?.section) {
    prompt += ` Course: "${context.section}"`;
    if (context.lecture) prompt += `, "${context.lecture}"`;
    prompt += `.`;
  }

  return prompt;
}
