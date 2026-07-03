// claude CLI 호출 파라미터 생성 (플랫폼별 분기 + 모델 검증)
// server.js 에서 사용. 이 모듈은 side effect 가 없어 단위 테스트가 쉽다.

const MODEL_PATTERN = /^[A-Za-z0-9._:-]+$/;

function assertValidModel(model) {
  if (model && !MODEL_PATTERN.test(model)) {
    throw new Error(`INVALID_MODEL: ${model}`);
  }
}

// 반환: { command, args, options, stdinInput }
// - 비-Windows: 프롬프트를 argv 로 전달(현행 동작 그대로), stdinInput = null
// - Windows: claude.cmd 실행을 위해 shell:true, 프롬프트는 stdin 으로 전달(인젝션 방지)
function buildClaudeInvocation({ prompt, model, isWindows, timeout }) {
  assertValidModel(model);
  const modelArgs = model ? ['--model', model] : [];

  if (isWindows) {
    return {
      command: 'claude',
      args: ['-p', ...modelArgs],
      options: { timeout, stdio: ['pipe', 'pipe', 'pipe'], shell: true },
      stdinInput: prompt,
    };
  }

  return {
    command: 'claude',
    args: ['-p', prompt, ...modelArgs],
    options: { timeout, stdio: ['ignore', 'pipe', 'pipe'] },
    stdinInput: null,
  };
}

module.exports = { assertValidModel, buildClaudeInvocation, MODEL_PATTERN };
