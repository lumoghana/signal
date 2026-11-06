import test from 'node:test';
import assert from 'node:assert/strict';
import { bindQrScreen, renderQrScreen } from '../dist/js/qr-screen.js';

class Element extends EventTarget {
  constructor(dataset = {}) { super(); this.dataset = dataset; this.hidden = false; this.isConnected = true; this.value = ''; this.disabled = false; this.textContent = ''; this.classes = new Set(); this.classList = { toggle: (name, on) => on ? this.classes.add(name) : this.classes.delete(name), remove: name => this.classes.delete(name) }; }
  click() { this.dispatchEvent(new Event('click')); }
}
function setup(route = { section: 'pay', page: 'scan', mode: 'scan', returnTo: { section: 'home', page: 'home' } }, options = {}) {
  const nodes = Object.fromEntries(['close', 'status', 'retry', 'frame', 'video', 'file', 'upload', 'person', 'merchant', 'edit', 'share', 'copy'].map(id => [`[data-qr-${id}]`, new Element()]));
  const tabs = [new Element({ qrMode: 'scan' }), new Element({ qrMode: 'code' })], root = new Element();
  root.querySelector = selector => nodes[selector] || null;
  root.querySelectorAll = () => tabs;
  const doc = new Element(); doc.hidden = false;
  const calls = { starts: 0, stops: 0, disposed: 0, go: [], payments: [], merchants: [], back: 0, person: 0 }, scanner = { start: async () => { calls.starts += 1; scanner.active = true; return true; }, stop: () => { calls.stops += 1; scanner.active = false; }, dispose: () => { calls.disposed += 1; }, active: false };
  let scannerCallbacks;
  const ctx = { $: () => root, state: { profile: { name: 'Ama Owusu' } }, draft: {}, back: () => { calls.back += 1; }, go: (...args) => calls.go.push(args), openQrPayment: value => calls.payments.push(value), openQrMerchant: id => calls.merchants.push(id), findQrPerson: () => { calls.person += 1; }, qrCodeMarkup: () => '<svg data-real-code></svg>', ...options.ctx };
  const cleanup = bindQrScreen(ctx, route, { document: doc, createScanner: callbacks => { scannerCallbacks = callbacks; return scanner; }, decodeFile: options.decodeFile });
  return { ctx, root, doc, nodes, tabs, calls, scanner, cleanup, get scannerCallbacks() { return scannerCallbacks; } };
}
const tick = () => new Promise(resolve => setImmediate(resolve));

test('Scan renders the direct camera frame and every payment fallback without an intermediate chooser', () => {
  const html = renderQrScreen({ state: { profile: {} }, draft: {}, qrCodeMarkup: () => { throw new Error('Scan should not need a personal code'); } }, { mode: 'scan' });
  assert.match(html, /Scan QR code to pay/); assert.match(html, /data-qr-video/);
  assert.match(html, /Upload QR file/); assert.match(html, /Find a Lumo person/); assert.match(html, /Enter merchant code/);
  assert.match(html, /data-qr-mode="scan"/); assert.match(html, /data-qr-mode="code"/);
});

test('My code contains the actual request SVG, escaped customer name, amount and share controls', () => {
  const html = renderQrScreen({ state: { profile: { name: '<Ama>' } }, draft: { collect: { amount: 2550, note: 'Lunch & water' } }, qrCodeMarkup: () => '<svg data-real-code></svg>' }, { mode: 'code' });
  assert.match(html, /<svg data-real-code>/); assert.match(html, /&lt;Ama&gt;/); assert.match(html, /GH₵25\.50/); assert.match(html, /Lunch &amp; water/);
  assert.match(html, /Share my code/); assert.match(html, /Copy payment link/); assert.doesNotMatch(html, /data-qr-video/);
});

test('switching tabs stops capture and preserves the originating page with replace navigation', async () => {
  const route = { section: 'pay', page: 'scan', mode: 'scan', returnTo: { section: 'plan', page: 'home' } }, x = setup(route);
  await tick(); x.tabs[1].click();
  assert.equal(x.calls.starts, 1);
  assert.deepEqual(x.calls.go, [[{ ...route, mode: 'code' }, { replace: true }]]);
  assert.equal(x.scanner.active, false);
  x.cleanup(); assert.equal(x.calls.disposed, 1);
});

test('hiding the page stops capture; My code never requests a camera', async () => {
  const x = setup(); await tick(); x.doc.hidden = true; x.doc.dispatchEvent(new Event('visibilitychange'));
  assert.equal(x.scanner.active, false); assert.equal(x.nodes['[data-qr-retry]'].hidden, false);
  x.cleanup(); const code = setup({ section: 'pay', page: 'scan', mode: 'code' }); await tick();
  assert.equal(code.calls.starts, 0); code.cleanup();
});

test('a pending QR photo cannot navigate after the screen has been left', async () => {
  let finish; const x = setup(undefined, { decodeFile: () => new Promise(resolve => { finish = resolve; }) });
  x.nodes['[data-qr-file]'].files = [{ type: 'image/png', size: 100 }];
  x.nodes['[data-qr-file]'].dispatchEvent(new Event('change'));
  x.cleanup(); finish('merchant:GOBE'); await tick();
  assert.deepEqual(x.calls.payments, []); assert.deepEqual(x.calls.merchants, []);
});

test('a decoded local photo routes the known campus merchant without performing a payment', async () => {
  const x = setup(undefined, { decodeFile: async () => 'lumo:merchant:GOBE' });
  x.nodes['[data-qr-file]'].files = [{ type: 'image/png', size: 100 }];
  x.nodes['[data-qr-file]'].dispatchEvent(new Event('change')); await tick();
  assert.deepEqual(x.calls.merchants, ['gobe-spot']); assert.deepEqual(x.calls.payments, []);
  assert.equal(x.scanner.active, false); x.cleanup();
});
