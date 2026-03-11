/**
 * 배치 번역용 시스템 프롬프트를 생성한다.
 * @param {string} targetLang - 번역 대상 언어
 * @param {{ section?: string, lecture?: string }} [context] - 강의 컨텍스트
 * @returns {string} 시스템 프롬프트
 */
export function buildBatchSystemPrompt(targetLang, context) {
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
