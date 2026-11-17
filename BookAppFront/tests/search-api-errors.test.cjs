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
