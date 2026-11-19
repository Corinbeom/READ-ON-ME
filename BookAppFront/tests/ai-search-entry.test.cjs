const { test } = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');

function loadUtility(name, require) {
  const source = readFileSync(path.join(__dirname, `../src/utils/${name}.ts`), 'utf8');
  const { outputText } = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } });
  const context = { exports: {}, require, URLSearchParams };
  vm.runInNewContext(outputText, context);
  return context.exports;
}
const entry = loadUtility('aiSearchEntry', (name) => {
  assert.equal(name, './bookUtils');
  return loadUtility('bookUtils');
});
const { normalizeAiPrompt, aiSearchHref, authReturnParams, authReturnHref, resolveAiSearchEntry } = entry;
const { isKakaoStartForOrigin, saveKakaoFlow, consumeKakaoCallback } = loadUtility('kakaoLogin', (name) => {
  assert.equal(name, './aiSearchEntry');
  return entry;
});

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

test('the exact book edition survives both steps of the signup and login roundtrip', () => {
  const isbn = '9791198363503';
  const signup = authReturnParams('book-detail', 'unrelated AI prompt', isbn);
  const login = authReturnParams(signup.returnTo, signup.prompt, signup.isbn);
  assert.equal(login.returnTo, 'book-detail');
  assert.equal(login.isbn, isbn);
  assert.equal(login.prompt, undefined);
});

test('book detail returns require a single canonical ISBN-13 with a valid checksum', () => {
  for (const isbn of [undefined, '', '9791198363504', '1198363509', ['9791198363503'], '/book/9791198363503', '9791198363503?next=/search']) {
    assert.equal(authReturnParams('book-detail', '', isbn).returnTo, undefined);
  }
  assert.equal(authReturnParams('https://example.com/', '', '9791198363503').returnTo, undefined);
});

const state = 'a'.repeat(64);
const verifier = 'b'.repeat(64);
const isbn = '9791198363503';

function callbackStorage(returnParams, expiresAt = 2000) {
  const items = new Map();
  const storage = {
    getItem: key => items.get(key) ?? null,
    setItem: (key, value) => items.set(key, value),
    removeItem: key => items.delete(key),
  };
  saveKakaoFlow(storage, { state, verifier, expiresAt, returnParams });
  return storage;
}

test('Kakao callback preserves the exact book on a matching, one-time login', () => {
  const storage = callbackStorage({ returnTo: 'book-detail', isbn });
  assert.equal(consumeKakaoCallback(storage, '?state=' + 'c'.repeat(64) + '&code=bad', 1000), null);
  const query = '?state=' + state + '&code=example';
  const result = consumeKakaoCallback(storage, query, 1000);
  assert.equal(result.exchange.verifier, verifier);
  const destination = authReturnHref(result.returnParams);
  assert.equal(destination.pathname, '/book/[isbn]');
  assert.equal(destination.params.isbn, isbn);
  assert.equal(consumeKakaoCallback(storage, query, 1000), null);
});

test('login returns to the operations screen through the fixed return destination', () => {
  const destination = authReturnParams('operations', 'unrelated prompt');
  assert.equal(authReturnHref(destination), '/operations');
  const result = consumeKakaoCallback(callbackStorage(destination), '?state=' + state + '&code=example', 1000);
  assert.equal(authReturnHref(result.returnParams), '/operations');
});

test('Kakao cancellation keeps the return destination while expired or untrusted input cannot sign in', () => {
  const cancel = consumeKakaoCallback(callbackStorage({ returnTo: 'my-library' }),
    '?state=' + state + '&error=access_denied', 1000);
  assert.equal(cancel.cancelled, true);
  assert.equal(authReturnHref(cancel.returnParams), '/my-library');
  assert.equal(cancel.exchange, null);
  assert.equal(consumeKakaoCallback(callbackStorage({}, 500), '?state=' + state + '&code=example', 1000), null);
  const duplicate = consumeKakaoCallback(callbackStorage({ returnTo: 'https://example.test' }),
    '?state=' + state + '&code=first&code=second', 1000);
  assert.equal(duplicate.exchange, null);
  assert.equal(authReturnHref(duplicate.returnParams), '/');
});

test('Kakao authorization only starts with the configured callback on the current web origin', () => {
  const origin = 'https://web.example.test';
  const start = { state, javascript_key: 'public', redirect_uri: origin + '/auth/kakao/callback', expires_in_seconds: 600 };
  assert.equal(isKakaoStartForOrigin(start, origin), true);
  assert.equal(isKakaoStartForOrigin({ ...start, redirect_uri: 'https://other.example.test/auth/kakao/callback' }, origin), false);
  assert.equal(isKakaoStartForOrigin({ ...start, redirect_uri: start.redirect_uri + '?redirect=x' }, origin), false);
});
