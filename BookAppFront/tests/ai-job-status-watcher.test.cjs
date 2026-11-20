const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');
const ts = require('typescript');

const source = readFileSync(path.join(__dirname, '../src/utils/aiJobStatusWatcher.ts'), 'utf8');
const { outputText } = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
});
const settle = () => new Promise(resolve => setImmediate(resolve));

function setupWatcher() {
  const timers = new Map();
  const context = {
    exports: {},
    AbortController,
    setTimeout(callback, delay) {
      const timer = Symbol();
      timers.set(timer, { callback, delay });
      return timer;
    },
    clearTimeout: timer => timers.delete(timer),
  };
  vm.runInNewContext(outputText, context);
  return { watchAiJob: context.exports.watchAiJob, timers };
}

test('checks immediately, checks again when foregrounded, and stops when finished', async () => {
  const { watchAiJob, timers } = setupWatcher();
  let calls = 0;
  const watcher = watchAiJob(async () => ++calls < 2, 6000);
  assert.equal(calls, 1);

  await settle();
  assert.deepEqual([...timers.values()].map(timer => timer.delay), [6000]);
  await watcher.checkNow();
  assert.equal(calls, 2);
  assert.equal(timers.size, 0);
  await watcher.checkNow();
  assert.equal(calls, 2);
});

test('falls back to polling if the stream is unavailable', async () => {
  const { watchAiJob, timers } = setupWatcher();
  let calls = 0;
  const watcher = watchAiJob(async () => ++calls < 2, 3000);
  await settle();
  const [[timer, next]] = timers;
  assert.equal(next.delay, 3000);
  timers.delete(timer);
  next.callback();
  await settle();
  assert.equal(calls, 2);
  assert.equal(timers.size, 0);
  watcher.stop();
});

test('does not overlap checks and aborts the current request on cleanup', async () => {
  const { watchAiJob, timers } = setupWatcher();
  let signal;
  let finish;
  let calls = 0;
  const watcher = watchAiJob(currentSignal => {
    signal = currentSignal;
    calls++;
    return new Promise(resolve => { finish = resolve; });
  }, 6000);

  await watcher.checkNow();
  assert.equal(calls, 1);
  assert.equal(timers.size, 0);
  watcher.stop();
  assert.equal(signal.aborted, true);
  finish(true);
  await settle();
  assert.equal(timers.size, 0);
});
