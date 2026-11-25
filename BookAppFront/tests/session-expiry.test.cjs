const { test } = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');

function load(name) {
  const source = readFileSync(path.join(__dirname, '../src/utils', name + '.ts'), 'utf8');
  const { outputText } = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS } });
  const context = { exports: {}, require, TextDecoder };
  vm.runInNewContext(outputText, context);
  return context.exports;
}

test('reads the expiration of existing JWTs and leaves unrecognized tokens to the server', () => {
  const { sessionExpiresAt } = load('sessionExpiry');
  const payload = exp => Buffer.from(JSON.stringify({ sub: '한글', exp })).toString('base64url');
  assert.equal(sessionExpiresAt('header.' + payload(18000) + '.signature'), 18000000);
  for (const invalid of ['old-token', 'header.' + payload(null) + '.signature', 'a.***.b']) {
    assert.equal(sessionExpiresAt(invalid), null);
  }
});

test('credential errors, timeouts, network and server failures show the matching login message', () => {
  const { signInErrorMessage } = load('apiErrorHandler');
  const error = (status, code) => ({ isAxiosError: true, response: { status, data: { code } } });
  assert.match(signInErrorMessage(error(401, 'INVALID_LOGIN')), /비밀번호/);
  assert.doesNotMatch(signInErrorMessage(error(401, 'SESSION_EXPIRED')), /비밀번호/);
  assert.match(signInErrorMessage(error(503)), /서버/);
  assert.match(signInErrorMessage({ isAxiosError: true, code: 'ECONNABORTED' }), /늦어지고/);
  assert.match(signInErrorMessage({ isAxiosError: true }), /네트워크/);
});
