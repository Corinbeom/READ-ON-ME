const { test } = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');

const source = readFileSync(path.join(__dirname, '../src/utils/aiSearchEntry.ts'), 'utf8');
const { outputText } = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS } });
const context = { exports: {} };
vm.runInNewContext(outputText, context);
const { normalizeAiPrompt, aiSearchHref, authReturnParams, resolveAiSearchEntry } = context.exports;

test('route prompts accept Korean text and repeated params but obey the input length limit', () => {
  assert.equal(normalizeAiPrompt(['  위로가 되는 책  ', '다른 조건']), '위로가 되는 책');
  assert.equal(normalizeAiPrompt(undefined), '');
  assert.equal(normalizeAiPrompt({ prompt: 'wrong type' }), '');
  assert.equal(normalizeAiPrompt('가'.repeat(600)).length, 500);
  assert.equal(aiSearchHref('위로 & 성장?').params.prompt, '위로 & 성장?');
});

test('authentication preserves the recommendation condition and rejects arbitrary return destinations', () => {
  const flow = authReturnParams('ai-books', '  짧은 에세이  ');
  assert.equal(flow.prompt, '짧은 에세이');
  assert.equal(aiSearchHref(flow.prompt).pathname, '/ai-books');
  for (const destination of [undefined, '/my-library', 'https://example.com', '//example.com']) {
    assert.equal(authReturnParams(destination, '조건').returnTo, undefined);
  }
});

test('ordinary entry resumes the previous recommendation instead of clearing it', () => {
  const previous = { id: 'existing', status: 'SUCCEEDED', query: '기존 조건' };
  const entry = resolveAiSearchEntry('', previous);
  assert.equal(entry.job, previous);
  assert.equal(entry.query, '기존 조건');
  assert.equal(entry.deferredPrompt, '');
});

test('selecting an example opens an editable draft even when completed results exist', () => {
  for (const status of ['SUCCEEDED', 'FAILED']) {
    const entry = resolveAiSearchEntry('새 조건', { status, query: '기존 조건' });
    assert.equal(entry.job, null);
    assert.equal(entry.query, '새 조건');
    assert.equal(entry.deferredPrompt, '');
  }
  assert.equal(resolveAiSearchEntry('새 조건', null).query, '새 조건');
});

test('a new example never replaces a queued or running search', () => {
  for (const status of ['QUEUED', 'RUNNING']) {
    const previous = { id: 'in-flight', status, query: '기존 조건' };
    const entry = resolveAiSearchEntry('새 조건', previous);
    assert.equal(entry.job, previous);
    assert.equal(entry.query, '기존 조건');
    assert.equal(entry.deferredPrompt, '새 조건');
  }
});

test('reopening the same pending condition resumes it without offering a duplicate search', () => {
  const entry = resolveAiSearchEntry('같은 조건', { status: 'RUNNING', query: '같은 조건' });
  assert.equal(entry.deferredPrompt, '');
  assert.equal(entry.job.status, 'RUNNING');
});


test('library authentication returns to the shelf without carrying an unrelated AI prompt', () => {
  const flow = authReturnParams('my-library', 'AI 조건');
  assert.equal(flow.returnTo, 'my-library');
  assert.equal(flow.prompt, undefined);
});
