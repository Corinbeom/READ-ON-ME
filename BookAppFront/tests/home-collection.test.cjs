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
const { HOME_COLLECTION } = load('src/constants/homeCollection.ts');
const bookUtils = load('src/utils/bookUtils.ts');
const { getIsbn13 } = bookUtils;
const { aiSearchHref, authReturnParams, resolveAiSearchEntry } = load('src/utils/aiSearchEntry.ts', (name) => {
  assert.equal(name, './bookUtils');
  return bookUtils;
});

test('the editorial collection exposes three distinct, valid detail destinations', () => {
  assert.equal(HOME_COLLECTION.books.length, 3);
  assert.equal(new Set(HOME_COLLECTION.books.map(book => book.isbn)).size, 3);
  for (const book of HOME_COLLECTION.books) {
    assert.equal(getIsbn13({ isbn13: book.isbn }), book.isbn);
    assert.ok(book.title && book.author && book.invitation && book.angle);
  }
});

test('each cover and its recorded description source refer to the same provider edition', () => {
  for (const book of HOME_COLLECTION.books) {
    const source = new URL(book.sourceUrl);
    const cover = new URL(book.thumbnail);
    const image = new URL(cover.searchParams.get('fname'));
    assert.equal(source.protocol, 'https:');
    assert.equal(cover.protocol, 'https:');
    assert.ok(image.pathname.endsWith('/' + source.searchParams.get('bookId')));
  }
});

test('every selection opens its own editable theme and survives the login return flow', () => {
  assert.equal(new Set(HOME_COLLECTION.books.map(book => book.prompt)).size, 3);
  for (const book of HOME_COLLECTION.books) {
    const route = aiSearchHref(book.prompt);
    assert.equal(route.pathname, '/ai-books');
    assert.equal(route.params.prompt, book.prompt);
    const auth = authReturnParams('ai-books', route.params.prompt);
    const restored = resolveAiSearchEntry(auth.prompt, { status: 'SUCCEEDED', query: '이전 조건' });
    assert.equal(restored.job, null);
    assert.equal(restored.query, book.prompt);
  }
});

test('selecting a collection theme preserves an existing search until it finishes', () => {
  for (const status of ['QUEUED', 'RUNNING']) {
    const previous = { status, query: '이미 진행 중인 조건' };
    const selected = resolveAiSearchEntry(HOME_COLLECTION.books[2].prompt, previous);
    assert.equal(selected.job, previous);
    assert.equal(selected.query, previous.query);
    assert.equal(selected.deferredPrompt, HOME_COLLECTION.books[2].prompt);
  }
});
