const { test } = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');

function load(relative, require) {
  const source = readFileSync(path.join(__dirname, '..', relative), 'utf8');
  const { outputText } = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } });
  const context = { exports: {}, require };
  vm.runInNewContext(outputText, context);
  return context.exports;
}
const { untilNextKoreanDay } = load('src/utils/koreanDay.ts');
const bookUtils = load('src/utils/bookUtils.ts');
const { aiSearchHref, authReturnParams, resolveAiSearchEntry } = load('src/utils/aiSearchEntry.ts', (name) => {
  assert.equal(name, './bookUtils');
  return bookUtils;
});

test('an open home refreshes at midnight in Korea regardless of device timezone', () => {
  assert.equal(untilNextKoreanDay(Date.parse('2026-11-26T14:59:59.900Z')), 100);
  assert.equal(untilNextKoreanDay(Date.parse('2026-11-27T00:00:00+09:00')), 86_400_000);
});

test('the selected question stays editable and survives the login return flow', () => {
  const prompt = '우주에 대해 더 알고 싶어. 어떤 책부터 읽어볼까?';
  const route = aiSearchHref(prompt);
  assert.equal(route.pathname, '/ai-books');
  const auth = authReturnParams('ai-books', route.params.prompt);
  const restored = resolveAiSearchEntry(auth.prompt, { status: 'SUCCEEDED', query: '이전 조건' });
  assert.equal(restored.job, null);
  assert.equal(restored.query, prompt);
});

test('selecting a daily topic preserves an ongoing search until it finishes', () => {
  for (const status of ['QUEUED', 'RUNNING']) {
    const previous = { status, query: '이미 진행 중인 조건' };
    const selected = resolveAiSearchEntry('다음에 읽을 우주 이야기', previous);
    assert.equal(selected.job, previous);
    assert.equal(selected.query, previous.query);
    assert.equal(selected.deferredPrompt, '다음에 읽을 우주 이야기');
  }
});
