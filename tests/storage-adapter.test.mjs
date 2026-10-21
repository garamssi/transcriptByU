import test from 'node:test';
import assert from 'node:assert';
import { MODELS } from '../src/domain/constants.js';
import { getProviderConfig } from '../src/infrastructure/chrome/storage-adapter.js';

const withStored = (stored) => {
  globalThis.chrome = { storage: { local: { get: async () => stored } } };
};

test('목록에 없는 구버전 모델은 첫 옵션으로 정규화', async () => {
  withStored({ provider: 'gemini', geminiModel: 'gemini-2.5-flash' });
  assert.strictEqual((await getProviderConfig()).model, MODELS.gemini[0].value);
});

test('목록에 있는 모델과 미설정 기본값은 그대로', async () => {
  withStored({ provider: 'claude', claudeModel: 'claude-opus-5-5' });
  assert.strictEqual((await getProviderConfig()).model, 'claude-opus-5-5');
  for (const provider of Object.keys(MODELS)) {
    withStored({ provider });
    const { model } = await getProviderConfig();
    assert.ok(MODELS[provider].some(m => m.value === model), `${provider} 기본값 ${model}이 목록에 없음`);
  }
});
