const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');
const ts = require('typescript');

const source = readFileSync(path.join(__dirname, '../src/utils/bookAttribution.ts'), 'utf8');
const context = { exports: {} };
vm.runInNewContext(ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText, context);
const { readBookAttribution } = context.exports;

test('all reviewed descriptions retain a clickable institutional credit', () => {
  const fields = require('../../BookAppAI/evaluation/acquisition-20261123/fields.json');
  for (const field of fields.filter(row => row.field === 'contents')) {
    const result = readBookAttribution(field.value);
    assert.ok(result.source.label.includes('도서관'));
    assert.equal(result.source.href, field.source_ref.split('#')[0]);
    assert.equal(result.description, field.value.split('\n\n출처: ')[0]);
  }
});

test('ordinary descriptions and unrecognized links remain plain text', () => {
  const input = '책 소개\n\n출처: 국립중앙도서관 사서추천도서 보도자료, 2026.10. https://example.org';
  assert.equal(readBookAttribution(input).source, null);
  assert.equal(readBookAttribution(input).description, input);
  assert.equal(readBookAttribution(null).description, '');
});
