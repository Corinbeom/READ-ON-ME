const { test } = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');

function loadUtility(name, require) {
  const source = readFileSync(path.join(__dirname, `../src/utils/${name}.ts`), 'utf8');
  const { outputText } = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } });
  const context = { exports: {}, AbortController, require };
  vm.runInNewContext(outputText, context);
  return context.exports;
}
const deviceHistory = loadUtility('deviceHistory');
const recent = loadUtility('recentSearches', (name) => {
  assert.equal(name, './deviceHistory');
  return deviceHistory;
});
const { createRecentBooks, MAX_RECENT_BOOKS, RECENT_BOOKS_KEY } = loadUtility('recentBooks', (name) => {
  if (name === './deviceHistory') return deviceHistory;
  assert.equal(name, './bookUtils');
  return loadUtility('bookUtils');
});
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

const sampleBooks = ['9791161571188', '9791198363503', '9791165341909', '9780306406157',
  '9780451524935', '9788936434267', '9791161571379'].map((isbn13, index) => ({
  isbn13, title: `책 ${index}`, authors: '저자', thumbnail: 'https://example.com/cover.png',
}));

test('recent books preserve edition identity, revisit order and the six-book limit across restart', async () => {
  const storage = memoryStorage();
  const history = createRecentBooks(storage);
  for (const book of sampleBooks) await history.add(book);
  await history.add(sampleBooks[2]);
  assert.equal(JSON.stringify(JSON.parse(storage.read())).includes('저자'), false);
  const restored = createRecentBooks(storage);
  await restored.load();
  assert.equal(restored.getSnapshot().items.length, MAX_RECENT_BOOKS);
  assert.deepEqual(plain(restored.getSnapshot().items).map(book => book.isbn13),
    [2, 6, 5, 4, 3, 1].map(index => sampleBooks[index].isbn13));
});

test('legacy book history restores only valid, distinct ISBNs and ignores archived metadata', async () => {
  const valid = { ...sampleBooks[0], thumbnail: 'file:///tmp/cover.png', userId: 17, contents: 'private metadata' };
  const storage = memoryStorage(JSON.stringify([null, { ...sampleBooks[1], isbn13: '9791198363504' }, valid, valid]));
  const history = createRecentBooks(storage);
  await history.load();
  assert.deepEqual(plain(history.getSnapshot().items), [{ isbn13: valid.isbn13, title: '', authors: '', thumbnail: '' }]);
});

test('the home history uses details from this session and clears an ISBN-only placeholder title', async () => {
  const book = sampleBooks[0];
  const storage = memoryStorage(JSON.stringify([book.isbn13]));
  const history = createRecentBooks(storage);
  await history.add({ ...book, title: book.isbn13, thumbnail: '' });
  assert.equal(history.getSnapshot().items[0].title, '');
  await history.add(book);
  assert.deepEqual(plain(history.getSnapshot().items), [book]);
  assert.deepEqual(JSON.parse(storage.read()), [book.isbn13]);
  await history.add({ ...book, title: book.isbn13, thumbnail: '' });
  assert.deepEqual(plain(history.getSnapshot().items), [book]);
  await history.add({ ...book, title: '1984' });
  assert.equal(history.getSnapshot().items[0].title, '1984');
});

test('deleting viewed books after a pending write also clears storage and keeps search terms', async () => {
  const stored = new Map([[recent.RECENT_SEARCHES_KEY, '["1984"]']]);
  const storage = {
    getItem: async key => stored.get(key) ?? null,
    setItem: async (key, value) => { stored.set(key, value); },
    removeItem: async key => { stored.delete(key); },
  };
  const history = createRecentBooks(storage);
  await Promise.all([history.add(sampleBooks[0]), history.clear()]);
  assert.equal(history.getSnapshot().items.length, 0);
  assert.equal(stored.has(RECENT_BOOKS_KEY), false);
  assert.equal(stored.get(recent.RECENT_SEARCHES_KEY), '["1984"]');
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

test('recent cards recover an ISBN-only or unavailable detail using the same catalog edition', async () => {
  const [book, other] = sampleBooks;
  let detail = { ...book, title: book.isbn13 };
  let searches = 0;
  const signal = new AbortController().signal;
  const api = {
    getBookDetail: async () => {
      if (!detail) throw new Error('temporary outage');
      return { data: detail };
    },
    searchBooks: async (params, opts) => {
      searches++;
      assert.equal(params.target, 'isbn');
      assert.equal(params.query, book.isbn13);
      assert.equal(opts.signal, signal);
      assert.ok(opts.handleErrorLocally);
      return { data: { documents: [
        { isbn: other.isbn13, title: '다른 판본', thumbnail: other.thumbnail },
        { isbn: book.isbn13, title: book.title, authors: [book.authors], thumbnail: book.thumbnail },
      ] } };
    },
  };
  const { restoreRecentEdition } = loadUtility('../services/catalogEdition', name => {
    if (name === './api') return { bookApi: api };
    if (name === '../utils/bookUtils') return loadUtility('bookUtils');
    assert.equal(name, '../utils/recentBooks');
    return loadUtility('recentBooks', dep => dep === './deviceHistory' ? deviceHistory : loadUtility('bookUtils'));
  });
  assert.deepEqual(plain(await restoreRecentEdition(book.isbn13, signal)), book);
  detail = null;
  assert.deepEqual(plain(await restoreRecentEdition(book.isbn13, signal)), book);
  detail = book;
  assert.deepEqual(plain(await restoreRecentEdition(book.isbn13, signal)), book);
  assert.equal(searches, 2);
});
