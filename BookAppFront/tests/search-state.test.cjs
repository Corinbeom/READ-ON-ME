const { test } = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');

function loadUtility(name) {
  const source = readFileSync(path.join(__dirname, `../src/utils/${name}.ts`), 'utf8');
  const { outputText } = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS } });
  const context = { exports: {}, AbortController };
  vm.runInNewContext(outputText, context);
  return context.exports;
}
const recent = loadUtility('recentSearches');
const { createLatestBookRequest } = loadUtility('latestBookRequest');
const plain = (value) => JSON.parse(JSON.stringify(value));
function memoryStorage(initial = null) {
  let value = initial;
  return {
    getItem: async () => value,
    setItem: async (_key, next) => { value = next; },
    removeItem: async () => { value = null; },
    read: () => value,
  };
}

test('recent queries are trimmed, deduplicated, and capped at eight with the latest first', async () => {
  const storage = memoryStorage();
  const history = recent.createRecentSearches(storage);
  for (let i = 0; i < 10; i++) await history.add(`책 ${i}`);
  await history.add('  책 5  ');
  assert.deepEqual(plain(history.getSnapshot().items), ['책 5', '책 9', '책 8', '책 7', '책 6', '책 4', '책 3', '책 2']);
  const restored = recent.createRecentSearches(storage);
  await restored.load();
  assert.deepEqual(plain(restored.getSnapshot().items), JSON.parse(storage.read()));
});

test('untrusted device history cannot introduce non-string or duplicate entries', () => {
  assert.deepEqual(plain(recent.sanitizeRecentSearches(['  Dune ', 42, null, {}, 'dune', '', '1984'])), ['Dune', '1984']);
  assert.equal(recent.sanitizeRecentSearches(['가'.repeat(600)])[0].length, recent.MAX_SEARCH_LENGTH);
  assert.deepEqual(plain(recent.sanitizeRecentSearches({ books: ['1984'] })), []);
});

test('malformed stored history recovers and can be replaced by a new successful search', async () => {
  const storage = memoryStorage('{broken JSON');
  const history = recent.createRecentSearches(storage);
  await history.load();
  assert.equal(history.getSnapshot().loaded, true);
  assert.equal(history.getSnapshot().items.length, 0);
  await history.add('1984');
  assert.deepEqual(JSON.parse(storage.read()), ['1984']);
});

test('late hydration and queued writes cannot resurrect a cleared search history', async () => {
  const storage = memoryStorage();
  let resolveRead;
  storage.getItem = () => new Promise((resolve) => { resolveRead = resolve; });
  const history = recent.createRecentSearches(storage);
  const loaded = history.load();
  const added = history.add('1984');
  const cleared = history.clear();
  resolveRead('["예전 검색"]');
  await Promise.all([loaded, added, cleared]);
  assert.equal(history.getSnapshot().items.length, 0);
  assert.equal(storage.read(), null);
});

test('deleting one query preserves the others across reloads', async () => {
  const storage = memoryStorage('["1984","Dune"]');
  const history = recent.createRecentSearches(storage);
  await history.remove('1984');
  const restored = recent.createRecentSearches(storage);
  await restored.load();
  assert.deepEqual(plain(restored.getSnapshot().items), ['Dune']);
});

test('device storage failures do not block the current session or later writes', async () => {
  let fails = true;
  const storage = memoryStorage();
  const save = storage.setItem;
  storage.setItem = async (...args) => {
    if (fails) throw new Error('Device storage unavailable');
    return save(...args);
  };
  const history = recent.createRecentSearches(storage);
  await history.add('1984');
  assert.equal(history.getSnapshot().items[0], '1984');
  assert.ok(history.getSnapshot().error);
  fails = false;
  await history.add('Dune');
  assert.equal(history.getSnapshot().error, '');
  assert.deepEqual(JSON.parse(storage.read()), ['Dune', '1984']);
});

test('a superseded autocomplete or search request is aborted and cannot publish late results', () => {
  const requests = createLatestBookRequest();
  const oldPreview = requests.begin();
  const search = requests.begin();
  assert.equal(oldPreview.signal.aborted, true);
  assert.equal(oldPreview.isCurrent(), false);
  assert.equal(search.isCurrent(), true);
  requests.cancel();
  assert.equal(search.signal.aborted, true);
  assert.equal(search.isCurrent(), false);
  assert.equal(requests.begin().isCurrent(), true);
});
