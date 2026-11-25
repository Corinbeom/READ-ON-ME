const { test } = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');

const source = readFileSync(path.join(__dirname, '../src/utils/aiSearchTiming.ts'), 'utf8');
const { outputText } = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS } });
const context = { exports: {} };
vm.runInNewContext(outputText, context);
const { startSearchTiming } = context.exports;

test('matches the clicked job, terminal fetch and first visible result using one clock', () => {
  const trace = startSearchTiming(1000);
  trace.accepted('job', 1200);
  trace.terminal('old', 1210, 1230);
  assert.equal(trace.displayed('job', undefined, 1250), null);
  trace.terminal('job', 1300, 1350);
  assert.equal(trace.displayed('old', 1290, 1380), null);
  assert.deepEqual({ ...trace.displayed('job', 1290, 1380) }, {
    submit_ms: 200, signal_ms: 290, fetch_start_ms: 300, fetch_end_ms: 350, display_ms: 380,
  });
  assert.equal(trace.displayed('job', 1290, 1420), null);
});

test('polling without an applicable signal keeps the signal offset absent', () => {
  for (const signal of [undefined, 999, 1400]) {
    const trace = startSearchTiming(1000);
    trace.accepted('job', 1050);
    trace.terminal('job', 1200, 1250);
    assert.equal(trace.displayed('job', signal, 1300).signal_ms, null);
  }
});
