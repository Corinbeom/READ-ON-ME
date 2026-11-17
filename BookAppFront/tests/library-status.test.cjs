const { test } = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');
const { configureStore } = require('@reduxjs/toolkit');
const target = { userId: 7, bookId: 12 };
const ReadingStatus = { TO_READ: 'TO_READ', READING: 'READING', COMPLETED: 'COMPLETED' };
const emptyLibrary = () => ({ data: { readingBooks: [], toReadBooks: [], completedBooks: [] } });
function deferred() {
  let resolve, reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}
function setup() {
  const calls = { load: 0, save: [] };
  const handlers = { load: async () => emptyLibrary(), save: async () => ({ data: {} }) };
  const api = { getUserLibrary: (options) => {
    assert.equal(options.handleErrorLocally, true);
    calls.load++;
    return handlers.load();
  }, updateBookStatus: (bookId, status, options) => {
    assert.equal(options.handleErrorLocally, true);
    calls.save.push({ bookId, status });
    return handlers.save();
  } };
  const source = readFileSync(path.join(__dirname, '../src/store/libraryStatusSlice.ts'), 'utf8');
  const { outputText } = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } });
  const context = { exports: {}, require(name) {
    if (name === '@reduxjs/toolkit') return require('@reduxjs/toolkit');
    if (name.endsWith('/api')) return { bookApi: api };
    if (name.endsWith('/readingStatus')) return { ReadingStatus };
    throw new Error('Unexpected import '+name);
  } };
  vm.runInNewContext(outputText, context);
  const auth = { isAuthenticated: true, user: { id: target.userId } };
  const store = configureStore({ reducer: { libraryStatus: context.exports.default, auth: (state = auth, action) => {
    if (action.type === 'auth/logout') return { isAuthenticated: false, user: null };
    if (action.type === 'qa/login') return { isAuthenticated: true, user: { id: action.payload } };
    return state;
  } } });
  return { store, calls, handlers, ...context.exports, entry: (arg = target) => store.getState().libraryStatus.entries[context.exports.libraryStatusKey(arg)] };
}

test('initial lookup distinguishes an empty library from an unavailable or invalid response', async () => {
  const qa = setup();
  qa.handlers.load = async () => { throw new Error('503'); };
  await qa.store.dispatch(qa.fetchLibraryStatus(target));
  assert.equal(qa.entry().loaded, false);
  assert.equal(qa.entry().error, 'load');
  await qa.store.dispatch(qa.saveLibraryStatus({ ...target, status: 'TO_READ' }));
  assert.equal(qa.calls.save.length, 0);
  qa.handlers.load = async () => ({ data: {} });
  await qa.store.dispatch(qa.fetchLibraryStatus(target));
  assert.equal(qa.entry().error, 'load');
  qa.handlers.load = async () => emptyLibrary();
  await qa.store.dispatch(qa.fetchLibraryStatus(target));
  assert.equal(qa.entry().loaded, true);
  assert.equal(qa.entry().status, null);
  assert.equal(qa.entry().error, null);
});

test('saving changes the confirmed selection and success feedback only after server acknowledgement', async () => {
  const qa = setup();
  await qa.store.dispatch(qa.fetchLibraryStatus(target));
  const pending = deferred();
  qa.handlers.save = () => pending.promise;
  const save = qa.store.dispatch(qa.saveLibraryStatus({ ...target, status: 'TO_READ' }));
  assert.equal(qa.entry().saving, true);
  assert.equal(qa.entry().requestedStatus, 'TO_READ');
  assert.equal(qa.entry().status, null);
  assert.equal(qa.entry().saved, false);
  assert.equal(qa.store.getState().libraryStatus.revision, 0);
  pending.resolve({ data: {} });
  await save;
  assert.equal(qa.entry().status, 'TO_READ');
  assert.equal(qa.store.getState().libraryStatus.revision, 1);
  assert.equal(qa.entry().saved, true);
  assert.equal(qa.entry().saving, false);
});

test('rapid duplicate taps and taps on the current selection do not issue extra writes', async () => {
  const qa = setup();
  await qa.store.dispatch(qa.fetchLibraryStatus(target));
  const pending = deferred();
  qa.handlers.save = () => pending.promise;
  const save = qa.store.dispatch(qa.saveLibraryStatus({ ...target, status: 'READING' }));
  await qa.store.dispatch(qa.saveLibraryStatus({ ...target, status: 'COMPLETED' }));
  await qa.store.dispatch(qa.fetchLibraryStatus(target));
  assert.equal(qa.calls.load, 1);
  assert.equal(qa.calls.save.length, 1);
  pending.resolve({ data: {} });
  await save;
  await qa.store.dispatch(qa.saveLibraryStatus({ ...target, status: 'READING' }));
  assert.equal(qa.calls.save.length, 1);
});

test('failed writes preserve the previous selection and can retry the same intended status', async () => {
  const qa = setup();
  qa.handlers.load = async () => ({ data: { ...emptyLibrary().data, readingBooks: [{ id: 12 }] } });
  await qa.store.dispatch(qa.fetchLibraryStatus(target));
  qa.handlers.save = async () => { throw new Error('Network timeout'); };
  await qa.store.dispatch(qa.saveLibraryStatus({ ...target, status: 'COMPLETED' }));
  assert.equal(qa.entry().status, 'READING');
  assert.equal(qa.entry().saved, false);
  assert.equal(qa.entry().error, 'save');
  assert.equal(qa.store.getState().libraryStatus.revision, 0);
  assert.equal(qa.entry().requestedStatus, 'COMPLETED');
  await qa.store.dispatch(qa.saveLibraryStatus({ ...target, status: 'TO_READ' }));
  assert.equal(qa.calls.save.length, 1);
  qa.handlers.save = async () => ({ data: {} });
  await qa.store.dispatch(qa.saveLibraryStatus({ ...target, status: 'COMPLETED' }));
  assert.equal(qa.entry().status, 'COMPLETED');
  assert.equal(qa.entry().saved, true);
  assert.equal(qa.entry().error, null);
});

test('a timed-out write can be reconciled by reading the actual server state instead of claiming failure', async () => {
  const qa = setup();
  await qa.store.dispatch(qa.fetchLibraryStatus(target));
  qa.handlers.save = async () => { throw new Error('Response lost after commit'); };
  await qa.store.dispatch(qa.saveLibraryStatus({ ...target, status: 'TO_READ' }));
  qa.handlers.load = async () => ({ data: { ...emptyLibrary().data, toReadBooks: [{ id: 12 }] } });
  await qa.store.dispatch(qa.fetchLibraryStatus(target));
  assert.equal(qa.entry().status, 'TO_READ');
  assert.equal(qa.entry().error, null);
  assert.equal(qa.entry().requestedStatus, null);
});

test('lookup must complete before a write can begin', async () => {
  const qa = setup();
  const pending = deferred();
  qa.handlers.load = () => pending.promise;
  const load = qa.store.dispatch(qa.fetchLibraryStatus(target));
  await qa.store.dispatch(qa.saveLibraryStatus({ ...target, status: 'TO_READ' }));
  assert.equal(qa.calls.save.length, 0);
  pending.resolve(emptyLibrary());
  await load;
});

test('responses for another book cannot replace the visible book selection', async () => {
  const qa = setup();
  const late = deferred();
  qa.handlers.load = () => late.promise;
  const first = qa.store.dispatch(qa.fetchLibraryStatus(target));
  const other = { ...target, bookId: 13 };
  qa.handlers.load = async () => ({ data: { ...emptyLibrary().data, completedBooks: [{ id: 13 }] } });
  await qa.store.dispatch(qa.fetchLibraryStatus(other));
  late.resolve({ data: { ...emptyLibrary().data, readingBooks: [{ id: 12 }] } });
  await first;
  assert.equal(qa.entry(other).status, 'COMPLETED');
  assert.equal(qa.entry().status, 'READING');
});

test('logout clears private selections and ignores late writes even after the same user logs back in', async () => {
  const qa = setup();
  await qa.store.dispatch(qa.fetchLibraryStatus(target));
  const late = deferred();
  qa.handlers.save = () => late.promise;
  const save = qa.store.dispatch(qa.saveLibraryStatus({ ...target, status: 'READING' }));
  qa.store.dispatch({ type: 'auth/logout' });
  await qa.store.dispatch(qa.fetchLibraryStatus(target));
  assert.equal(qa.calls.load, 1);
  assert.equal(qa.entry(), undefined);
  qa.store.dispatch({ type: 'qa/login', payload: target.userId });
  await qa.store.dispatch(qa.fetchLibraryStatus(target));
  late.resolve({ data: {} });
  await save;
  assert.equal(qa.entry().status, null);
  assert.equal(qa.entry().saved, false);
  await qa.store.dispatch(qa.saveLibraryStatus({ userId: 88, bookId: 12, status: 'READING' }));
  assert.equal(qa.calls.save.length, 1);
});
