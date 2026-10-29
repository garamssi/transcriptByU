// claude CLI 호출 파라미터 생성 (플랫폼별 분기 + 모델 검증)
// server.js 에서 사용. 이 모듈은 side effect 가 없어 단위 테스트가 쉽다.

const MODEL_PATTERN = /^[A-Za-z0-9._:-]+$/;

function assertValidModel(model) {
  if (model && !MODEL_PATTERN.test(model)) {
    throw new Error(`INVALID_MODEL: ${model}`);
  }
}

// 반환: { command, args, options, stdinInput }
// 프롬프트는 모든 플랫폼에서 stdin 으로 전달한다. 강의 전체 대본이 들어가 프롬프트가
// 커지면 argv 한 인자의 길이 제한(Linux 128KB 등)에 걸리고, argv 는 프로세스 목록에도 노출된다.
// - Windows: claude.cmd 실행을 위해 shell:true (프롬프트가 argv 에 없어 인젝션 위험 없음)
function buildClaudeInvocation({ prompt, model, isWindows, timeout }) {
  assertValidModel(model);
  const modelArgs = model ? ['--model', model] : [];
  const options = { timeout, stdio: ['pipe', 'pipe', 'pipe'] };
  if (isWindows) options.shell = true;

  return {
    command: 'claude',
    args: ['-p', ...modelArgs],
    options,
    stdinInput: prompt,
  };
}

module.exports = { assertValidModel, buildClaudeInvocation, MODEL_PATTERN };
