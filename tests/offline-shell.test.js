import test from 'node:test';
import assert from 'node:assert/strict';
import { registerOfflineShell, updateOfflineBanner } from '../dist/js/offline-shell.js';

function target() {
  const listeners = new Map();
  return { location: { protocol: 'https:' },
    addEventListener(event, listener) { listeners.set(event, listener); },
    removeEventListener(event, listener) { if (listeners.get(event) === listener) listeners.delete(event); },
    emit(event) { listeners.get(event)?.(); }, listeners };
}
function host() {
  const children = [], ownerDocument = { createElement(tag) { return { tag, attrs: {}, setAttribute(name, value) { this.attrs[name] = value; } }; } };
  return { children, ownerDocument,
    querySelector() { return children.find(child => Object.hasOwn(child.attrs, 'data-offline-banner')) || null; },
    prepend(child) { children.unshift(child); } };
}

test('the offline status remains visible without service worker support and clears when connectivity returns', async () => {
  const page = target(), nav = { onLine: false }, updates = [];
  const result = await registerOfflineShell({ navigator: nav, target: page, onChange: value => updates.push(value) });
  assert.equal(result.reason, 'unsupported'); assert.equal(updates.length, 1); assert.equal(updates[0].offline, true);
  assert.match(updates[0].message, /Demo changes can save on this device/);
  assert.match(updates[0].message, /Bank and MoMo confirmations are unavailable/);
  nav.onLine = true; page.emit('online'); assert.deepEqual(updates.at(-1), { offline: false, message: '' });
  result.cleanup(); assert.equal(page.listeners.size, 0);
});

test('service worker failure does not remove the connectivity warning or its event listeners', async () => {
  const page = target(), nav = { onLine: false, serviceWorker: { async register() { throw new Error('not available'); } } }, updates = [];
  const result = await registerOfflineShell({ navigator: nav, target: page, onChange: value => updates.push(value) });
  assert.equal(result.reason, 'registration-failed'); assert.equal(updates[0].offline, true);
  nav.onLine = true; page.emit('online'); nav.onLine = false; page.emit('offline'); assert.equal(updates.at(-1).offline, true);
  result.cleanup(); assert.equal(page.listeners.size, 0);
});

test('offline shell caching still uses the existing public-only service worker', async () => {
  const page = target(), nav = { onLine: true, serviceWorker: { async register(url, options) { assert.equal(url, '/sw.js'); assert.deepEqual(options, { scope: '/', updateViaCache: 'none' }); return { active: true }; } } };
  const result = await registerOfflineShell({ navigator: nav, target: page }); assert.equal(result.ok, true); result.cleanup();
});

test('a single accessible offline banner persists through repeated notifications and only hides after reconnecting', () => {
  const app = host(); assert.equal(updateOfflineBanner(app, { offline: false }), null);
  const banner = updateOfflineBanner(app, { offline: true });
  assert.equal(banner.hidden, false); assert.equal(banner.attrs.role, 'status'); assert.equal(banner.attrs['aria-live'], 'polite');
  assert.match(banner.textContent, /on this device/); assert.match(banner.textContent, /confirmations are unavailable/);
  assert.equal(updateOfflineBanner(app, { offline: true }), banner); assert.equal(app.children.length, 1); assert.equal(banner.hidden, false);
  updateOfflineBanner(app, { offline: false }); assert.equal(banner.hidden, true);
  updateOfflineBanner(app, { offline: true }); assert.equal(banner.hidden, false); assert.equal(app.children.length, 1);
});
