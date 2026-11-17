const { test } = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');
const source = readFileSync(path.join(__dirname, '../src/utils/searchResults.ts'), 'utf8');
const { outputText } = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS } });
const context = { exports: {} };
vm.runInNewContext(outputText, context);
const { searchResultView } = context.exports;
const result = { query: '1984', books: [{ isbn: '9780451524935', title: '1984' }] };

test('an initial search has no prior results to retain', () => {
  const view = searchResultView('loading', '1984', null);
  assert.equal(view.books.length, 0);
  assert.equal(view.retaining, false);
});
test('refreshing the same query keeps the existing books until a replacement arrives', () => {
  const view = searchResultView('loading', '1984', result);
  assert.equal(view.books, result.books);
  assert.equal(view.retaining, true);
});
test('a different query never presents the previous query books as its results', () => {
  for (const status of ['loading', 'success', 'error']) {
    const view = searchResultView(status, '듄', result);
    assert.equal(view.books.length, 0);
    assert.equal(view.retaining, false);
  }
});
test('failed same-query refresh retains the last confirmed result for inline recovery', () => {
  const view = searchResultView('error', '1984', result);
  assert.equal(view.books, result.books);
  assert.equal(view.retaining, true);
});
test('editing or clearing input returns to discovery without leaking the cached result into previews', () => {
  const view = searchResultView('idle', '1984', result);
  assert.equal(view.books.length, 0);
  assert.equal(view.retaining, false);
});
test('successful empty results replace previous books and are distinct from a refresh', () => {
  const view = searchResultView('success', '1984', { query: '1984', books: [] });
  assert.equal(view.books.length, 0);
  assert.equal(view.retaining, false);
});
