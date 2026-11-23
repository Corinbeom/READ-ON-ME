const { test } = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');

const source = readFileSync(path.join(__dirname, '../src/utils/readingKeywordShare.ts'), 'utf8');
const { outputText } = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
});
const context = { exports: {}, URL };
vm.runInNewContext(outputText, context);
const { storyKeywordUrl, parseStoryKeywords } = context.exports;

test('a story URL keeps punctuation and Unicode in the selected keywords after router decoding', () => {
  const keywords = ['가족, 세대', '한글 100%25', '과학+기술'];
  const url = new URL(storyKeywordUrl('https://example.test/library', keywords));

  assert.equal(url.pathname, '/reading-keywords');
  assert.deepEqual([...url.searchParams.keys()], ['tags']);
  assert.deepEqual([...parseStoryKeywords(decodeURIComponent(url.searchParams.get('tags')))], keywords);
});

test('tampered story links cannot submit internal labels, extra tags, or control characters', () => {
  for (const value of ['garbled', '{"tags":["가족"]}', '["가족", "user_added"]',
    '["가족","번역","현실주의","성장"]', JSON.stringify(['가족\x00']), JSON.stringify(['책'.repeat(101)])]) {
    assert.deepEqual([...parseStoryKeywords(value)], []);
  }
});

test('older story links merge English and Korean labels and omit unmapped tags', () => {
  assert.deepEqual([...parseStoryKeywords(JSON.stringify(['SF소설', '과학소설', 'unmapped']))], ['과학소설']);
});
