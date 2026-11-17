const { test } = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');

function loadUtility(name) {
  const source = readFileSync(path.join(__dirname, `../src/utils/${name}.ts`), 'utf8');
  const { outputText } = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } });
  const context = { exports: {} };
  vm.runInNewContext(outputText, context);
  return context.exports;
}
const { loadLibraryOverview, libraryBookCount } = loadUtility('libraryOverview');
const { getIsbn13 } = loadUtility('bookUtils');
const emptyLibrary = { readingBooks: [], toReadBooks: [], completedBooks: [] };
const keywords = { keywords: [], analyzed: 0 };
function receivers() {
  const events = { library: [], reviews: [], keywords: [] };
  return {
    events,
    callbacks: Object.fromEntries(Object.keys(events).map((key) => [key, (result) => events[key].push(result)])),
  };
}
function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}

test('saved books render before slower review and keyword requests finish', async () => {
  const slowReviews = deferred();
  const slowKeywords = deferred();
  const { callbacks, events } = receivers();
  const loading = loadLibraryOverview({ library: async () => emptyLibrary,
    reviews: () => slowReviews.promise, keywords: () => slowKeywords.promise }, callbacks, new AbortController().signal);
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(events.library[0].data, emptyLibrary);
  assert.equal(events.reviews.length, 0);
  assert.equal(events.keywords.length, 0);
  slowReviews.resolve([]);
  slowKeywords.resolve(keywords);
  await loading;
});

test('metadata failures do not hide a successfully fetched shelf', async () => {
  const { callbacks, events } = receivers();
  await loadLibraryOverview({ library: async () => emptyLibrary,
    reviews: async () => { throw new Error('Reviews offline'); },
    keywords: async () => { throw new Error('Keywords offline'); } }, callbacks, new AbortController().signal);
  assert.equal(events.library[0].data, emptyLibrary);
  assert.equal(events.library[0].error, '');
  assert.ok(events.reviews[0].error);
  assert.ok(events.keywords[0].error);
});

test('a failed library load is distinct from a successfully empty library', async () => {
  const { callbacks, events } = receivers();
  await loadLibraryOverview({ library: async () => { throw new Error('Library offline'); },
    reviews: async () => [], keywords: async () => keywords }, callbacks, new AbortController().signal);
  assert.equal(events.library[0].data, null);
  assert.ok(events.library[0].error);
  assert.equal(events.reviews[0].data.length, 0);
});

test('a cancelled screen or account cannot receive late responses even if the transport resolves', async () => {
  const late = deferred();
  const controller = new AbortController();
  const { callbacks, events } = receivers();
  const loading = loadLibraryOverview({ library: () => late.promise,
    reviews: async () => [], keywords: async () => keywords }, callbacks, controller.signal);
  controller.abort();
  late.resolve(emptyLibrary);
  await loading;
  assert.equal(events.library.length + events.reviews.length + events.keywords.length, 0);
});

test('a library containing only completed books is not treated as empty', () => {
  assert.equal(libraryBookCount(emptyLibrary), 0);
  assert.equal(libraryBookCount({ ...emptyLibrary, completedBooks: [{ id: 1 }] }), 1);
});

test('shelf DTOs and existing search records resolve valid detail links with ISBN checksum validation', () => {
  assert.equal(getIsbn13({ isbn13: '9780306406157' }), '9780306406157');
  assert.equal(getIsbn13({ isbn: '0306406152 9780306406157' }), '9780306406157');
  assert.equal(getIsbn13({ isbn10: '0-306-40615-2', isbn13: '' }), '9780306406157');
  assert.equal(getIsbn13({ isbn13: '9780306406150' }), '');
  assert.equal(getIsbn13({ isbn13: '' }), '');
});
