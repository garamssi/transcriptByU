const test = require('node:test');
const assert = require('node:assert');
const { assertValidModel, buildClaudeInvocation } = require('./claude-invocation');

test('assertValidModel: 유효한 모델명은 통과', () => {
  assert.doesNotThrow(() => assertValidModel('claude-sonnet-5'));
  assert.doesNotThrow(() => assertValidModel('claude-3.5:beta_1'));
  assert.doesNotThrow(() => assertValidModel(undefined));
  assert.doesNotThrow(() => assertValidModel(''));
});

test('assertValidModel: 쉘 메타문자가 든 모델명은 거부', () => {
  assert.throws(() => assertValidModel('foo & calc'), /INVALID_MODEL/);
  assert.throws(() => assertValidModel('a;rm -rf'), /INVALID_MODEL/);
  assert.throws(() => assertValidModel('$(whoami)'), /INVALID_MODEL/);
});

test('buildClaudeInvocation: 비-Windows는 프롬프트를 argv로 전달(현행 동작)', () => {
  const inv = buildClaudeInvocation({ prompt: 'hello world', model: 'claude-sonnet-5', isWindows: false, timeout: 1000 });
  assert.strictEqual(inv.command, 'claude');
  assert.deepStrictEqual(inv.args, ['-p', 'hello world', '--model', 'claude-sonnet-5']);
  assert.strictEqual(inv.stdinInput, null);
  assert.deepStrictEqual(inv.options.stdio, ['ignore', 'pipe', 'pipe']);
  assert.strictEqual(inv.options.shell, undefined);
  assert.strictEqual(inv.options.timeout, 1000);
});

test('buildClaudeInvocation: Windows는 프롬프트를 stdin으로 전달 + shell:true', () => {
  const inv = buildClaudeInvocation({ prompt: 'hello world', model: 'claude-sonnet-5', isWindows: true, timeout: 1000 });
  assert.strictEqual(inv.command, 'claude');
  assert.deepStrictEqual(inv.args, ['-p', '--model', 'claude-sonnet-5']);
  assert.ok(!inv.args.includes('hello world'), '프롬프트가 argv에 노출되면 안 됨');
  assert.strictEqual(inv.stdinInput, 'hello world');
  assert.strictEqual(inv.options.shell, true);
  assert.deepStrictEqual(inv.options.stdio, ['pipe', 'pipe', 'pipe']);
});

test('buildClaudeInvocation: model 미지정 시 --model 없음', () => {
  const win = buildClaudeInvocation({ prompt: 'x', isWindows: true, timeout: 1 });
  assert.deepStrictEqual(win.args, ['-p']);
  const mac = buildClaudeInvocation({ prompt: 'x', isWindows: false, timeout: 1 });
  assert.deepStrictEqual(mac.args, ['-p', 'x']);
});

test('buildClaudeInvocation: 잘못된 model 은 예외', () => {
  assert.throws(() => buildClaudeInvocation({ prompt: 'x', model: 'a|b', isWindows: false, timeout: 1 }), /INVALID_MODEL/);
});
