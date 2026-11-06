import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

// Exercise the app's real sheet cleanup against an asynchronous native-history mock.
const source = readFileSync(new URL('../dist/js/app.js', import.meta.url), 'utf8');
const closeSheetSource = source.slice(source.indexOf('function closeSheet()'), source.indexOf('\nfunction userCloseSheet()'));
function harness() {
  const tasks = [], nativeMoves = [];
  const sandbox = { overlayMeta: { previous: null }, overlayCleanup: null, pendingPageNavigation: false, pendingModalPop: false,
    overlays: { innerHTML: 'PIN' }, setInert() {}, queueMicrotask: fn => tasks.push(fn),
    window: { history: { state: { kind: 'modal', index: 5 }, back() { nativeMoves.push('back'); } } },
  };
  vm.createContext(sandbox); vm.runInContext(closeSheetSource, sandbox);
  return { sandbox, nativeMoves, close: sandbox.closeSheet, flush() { while(tasks.length) tasks.shift()(); } };
}

test('PIN success and financial completion may both close a sheet but consume only one modal history entry', () => {
  const h = harness();
  h.close(); h.close(); h.close(); h.flush();
  assert.deepEqual(h.nativeMoves, ['back']);
  assert.equal(h.sandbox.pendingModalPop, true);
  h.sandbox.window.history.state = { kind: 'page', index: 5 };
  h.sandbox.pendingModalPop = false;
  h.close(); h.flush();
  assert.equal(h.nativeMoves.length, 1, 'The group conversation page is retained after the modal returns.');
});

test('replacing a sheet or navigating to another page does not enqueue a stray native Back', () => {
  const h = harness(); h.close(); h.sandbox.overlayMeta = { previous: null }; h.flush();
  assert.equal(h.nativeMoves.length, 0);
  h.close(); h.sandbox.pendingPageNavigation = true; h.flush();
  assert.equal(h.nativeMoves.length, 0);
});
