const { test } = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');

// Compile the isolated utility with the existing TypeScript dependency; no native renderer is needed.
function loadAlert(platform = 'web') {
  const nativeCalls = [];
  const source = readFileSync(path.join(__dirname, '../src/utils/alert.ts'), 'utf8');
  const { outputText } = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS } });
  const context = {
    exports: {},
    require: () => ({ Platform: { OS: platform }, Alert: { alert: (...args) => nativeCalls.push(args) } }),
  };
  vm.runInNewContext(outputText, context);
  return { ...context.exports, nativeCalls };
}

test('opening an alert never runs its action; cancel does not run the destructive action', () => {
  const alerts = loadAlert();
  const actions = [];
  alerts.default('삭제', '삭제할까요?', [
    { text: '취소', style: 'cancel', onPress: () => actions.push('cancel') },
    { text: '삭제', style: 'destructive', onPress: () => actions.push('delete') },
  ]);
  assert.deepEqual(actions, []);
  alerts.closeWebAlert(alerts.getWebAlert().id, 0);
  assert.deepEqual(actions, ['cancel']);
  assert.equal(alerts.getWebAlert(), null);
});

test('multiple choices run only the selected action and queued alerts are preserved', () => {
  const alerts = loadAlert();
  const actions = [];
  alerts.default('리뷰 관리', '', [
    { text: '수정', onPress: () => actions.push('edit') },
    { text: '삭제', onPress: () => actions.push('delete') },
    { text: '취소', style: 'cancel' },
  ]);
  const id = alerts.getWebAlert().id;
  alerts.default('다음 알림');
  alerts.closeWebAlert(id, 0);
  alerts.closeWebAlert(id, 1); // A stale double click must not act on the next alert.
  assert.deepEqual(actions, ['edit']);
  assert.equal(alerts.getWebAlert().title, '다음 알림');
  assert.equal(alerts.getWebAlert().buttons[0].text, '확인');
});

test('native calls still use the platform alert and server rendering has no active modal', () => {
  const alerts = loadAlert('ios');
  alerts.default('제목', '내용');
  assert.equal(alerts.nativeCalls.length, 1);
  assert.equal(alerts.getWebAlert(), null);
  assert.equal(alerts.getServerWebAlert(), null);
});
