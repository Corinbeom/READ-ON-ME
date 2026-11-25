const { test } = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');
const axios = require('axios');

function loadApi() {
  const alerts = [];
  const source = readFileSync(path.join(__dirname, '../src/services/api.ts'), 'utf8');
  const { outputText } = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS } });
  const context = {
    exports: {}, __DEV__: true, process: { env: {} }, URL,
    require(name) {
      if (name === 'axios') return axios;
      if (name === '@react-native-async-storage/async-storage') return { default: { getItem: async () => null } };
      if (name === 'react-native') return { Platform: { OS: 'web' } };
      if (name === 'expo-constants') return { default: { expoConfig: { hostUri: 'localhost:8081' } } };
      if (name.endsWith('readingStatus')) return { ReadingStatus: {} };
      if (name.endsWith('/alert')) return { default: (...args) => alerts.push(args) };
      if (name.endsWith('apiErrorHandler')) return { handleApiError: () => 'API failure' };
      throw new Error(`Unexpected import ${name}`);
    },
  };
  vm.runInNewContext(outputText, context);
  return { ...context.exports, alerts };
}

function failRequests(api) {
  api.defaults.adapter = async (config) => {
    throw new axios.AxiosError('Service unavailable', 'ERR_BAD_RESPONSE', config, undefined,
      { status: 503, statusText: 'Unavailable', data: {}, headers: {}, config });
  };
}

test('a cancelled request rejects without showing a global error alert', async () => {
  const { api, bookApi, alerts } = loadApi();
  api.defaults.adapter = async (config) => { throw new axios.CanceledError('Superseded search', config); };
  await assert.rejects(bookApi.searchBooks({ query: '1984' }), axios.isCancel);
  assert.equal(alerts.length, 0);
});

test('a search handled on its screen rejects for inline recovery without a duplicate alert', async () => {
  const { api, bookApi, alerts } = loadApi();
  failRequests(api);
  await assert.rejects(bookApi.searchBooks({ query: '1984' }, { handleErrorLocally: true }),
    (error) => error.response.status === 503);
  assert.equal(alerts.length, 0);
});

test('search consumers without local error handling retain the existing global alert', async () => {
  const { api, bookApi, alerts } = loadApi();
  failRequests(api);
  await assert.rejects(bookApi.searchBooks({ query: '1984' }));
  assert.equal(alerts.length, 1);
});


test('library sections handle their own errors without changing default callers', async () => {
  const { api, bookApi, reviewApi, userApi, alerts } = loadApi();
  failRequests(api);
  const options = { signal: new AbortController().signal, handleErrorLocally: true };
  for (const request of [bookApi.getUserLibrary, reviewApi.getMyReviews, userApi.getReadingKeywords]) {
    await assert.rejects(request(options));
  }
  assert.equal(alerts.length, 0);
  await assert.rejects(bookApi.getUserLibrary());
  assert.equal(alerts.length, 1);
});

test('library status writes can recover inline without duplicate global alerts', async () => {
  const { api, bookApi, alerts } = loadApi();
  failRequests(api);
  await assert.rejects(bookApi.updateBookStatus(12, 'READING', { handleErrorLocally: true }));
  assert.equal(alerts.length, 0);
  await assert.rejects(bookApi.updateBookStatus(12, 'READING'));
  assert.equal(alerts.length, 1);
});

test('home list requests handle errors inline without changing their default consumers', async () => {
  const { api, bookApi, recommendationApi, alerts } = loadApi();
  failRequests(api);
  const options = { signal: new AbortController().signal, handleErrorLocally: true };
  await assert.rejects(bookApi.getPopularBooksFromLibrary(30, options));
  await assert.rejects(recommendationApi.getRecommendations(options));
  await assert.rejects(bookApi.getBooksByIds([1], options));
  assert.equal(alerts.length, 0);
  await assert.rejects(bookApi.getPopularBooksFromLibrary());
  await assert.rejects(recommendationApi.getRecommendations());
  await assert.rejects(bookApi.getBooksByIds([1]));
  assert.equal(alerts.length, 3);
});

test('notification, review, and first ISBN save failures can be retried inline', async () => {
  const { api, notificationApi, reviewApi, bookApi, alerts } = loadApi();
  failRequests(api);
  const options = { handleErrorLocally: true };
  await assert.rejects(notificationApi.getNotifications(options));
  await assert.rejects(reviewApi.getReviewsByBook(12, 'latest', options));
  await assert.rejects(bookApi.updateBookStatusByIsbn('9788925588735', 'READING', options));
  assert.equal(alerts.length, 0);
});

test('only an explicit expired-session response notifies the session owner with the rejected bearer', async () => {
  const { api, observeSessionExpiry, alerts } = loadApi();
  const rejected = [];
  const stop = observeSessionExpiry(token => rejected.push(token));
  for (const [status, code, bearer] of [
    [401, 'SESSION_EXPIRED', 'previous-session'], [401, 'INVALID_LOGIN', null],
    [403, 'FORBIDDEN', 'valid-session'], [503, 'UNAVAILABLE', 'valid-session'],
  ]) {
    api.defaults.adapter = async config => {
      throw new axios.AxiosError('fixture', undefined, config, undefined,
        { status, data: { code }, headers: {}, config });
    };
    await assert.rejects(api.get('/api/users/profile', {
      headers: bearer ? { Authorization: 'Bearer ' + bearer } : {},
    }));
  }
  stop();
  assert.deepEqual(rejected, ['previous-session']);
  assert.deepEqual(alerts, []);
});
