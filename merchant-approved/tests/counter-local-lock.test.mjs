import test from 'node:test';
import assert from 'node:assert/strict';
import {createCounterLocalLock} from '../dist/counter-local-lock.js';

class Storage {
  values = new Map();
  getItem(key) { return this.values.get(key) ?? null; }
  setItem(key, value) { this.values.set(key, String(value)); }
  removeItem(key) { this.values.delete(key); }
}
const counter = {id: 'counter-one', shopId: 'shop-one', businessId: 'business-one'};
const session = {id: 'session-one', counterId: counter.id, businessId: counter.businessId, userId: 'cashier-one', shopIds: [counter.shopId], expiresAt: '2099-01-01T00:00:00Z'};

test('an immediate local lock survives reload without storing PINs, receipts or financial data', () => {
  const storage = new Storage(), client = createCounterLocalLock({storage});
  assert.equal(client.isLocked(counter, session), false);
  assert.deepEqual(client.lock(counter, session), {locked: true, pendingServerLock: true, persistent: true});
  assert.equal(createCounterLocalLock({storage}).isLocked(counter, session), true);
  const saved = JSON.parse([...storage.values.values()][0]);
  assert.deepEqual(Object.keys(saved.locks[0]).sort(), ['businessId', 'counterId', 'locked', 'sessionId', 'shopId']);
});

test('changing effective cashier identity during server lock cannot remove the local lock', () => {
  const client = createCounterLocalLock({storage: new Storage()});
  client.lock(counter, session);
  assert.equal(client.isLocked(counter, {...session, userId: 'locked-counter-one'}), true);
  assert.equal(client.clear(counter, {...session, userId: 'cashier-two'}).locked, false);
});

test('another tab observes a persisted lock while clearing it cannot silently unlock a tab with its own lock', () => {
  const storage = new Storage(), first = createCounterLocalLock({storage}), otherTab = createCounterLocalLock({storage});
  assert.equal(otherTab.isLocked(counter, session), false);
  first.lock(counter, session);
  assert.equal(otherTab.isLocked(counter, session), true);
  assert.equal(otherTab.clear(counter, session).locked, false);
  assert.equal(first.isLocked(counter, session), true);
});

test('old owner sessions, other counters, businesses and shops cannot inherit or clear a counter lock', () => {
  const client = createCounterLocalLock({storage: new Storage()});
  client.lock(counter, session);
  for (const other of [{...session, counterId: null}, {...session, id: 'session-two'}, {...session, businessId: 'another-business'}, {...session, shopIds: ['other-shop']}]) {
    assert.equal(client.isLocked(counter, other), false);
    client.clear(counter, other);
    assert.equal(client.isLocked(counter, session), true);
  }
  assert.equal(client.isLocked({...counter, id: 'counter-two'}, {...session, counterId: 'counter-two'}), false);
  assert.equal(client.isLocked({...counter, shopId: 'shop-two'}, {...session, shopIds: ['shop-two']}), false);
});

test('offline storage failure still locks this live screen and a failed removal cannot silently unlock it', () => {
  const storage = new Storage();
  storage.setItem = () => { throw Error('Storage unavailable'); };
  const client = createCounterLocalLock({storage});
  assert.deepEqual(client.lock(counter, session), {locked: true, pendingServerLock: true, persistent: false});
  assert.equal(client.isLocked(counter, session), true);
  storage.removeItem = () => { throw Error('Storage unavailable'); };
  assert.equal(client.clear(counter, session).locked, true);
});

test('damaged lock storage stays closed until the caller completes a verified server unlock', () => {
  const storage = new Storage(); storage.setItem('lumo-counter-screen-lock-v1', 'broken JSON');
  const client = createCounterLocalLock({storage});
  assert.equal(client.isLocked(counter, session), true);
  assert.equal(client.clear(counter, session).locked, false);
  assert.equal(client.isLocked(counter, {...session, counterId: null}), false);
});

test('expired sessions require account sign-in and reset clears only the lock namespace', () => {
  const storage = new Storage(), client = createCounterLocalLock({storage, now: () => Date.parse('2026-11-14T12:00:00Z')});
  storage.setItem('unrelated-app-key', 'kept'); client.lock(counter, session);
  const expired = {...session, expiresAt: '2026-11-14T11:59:59Z'};
  assert.equal(client.isLocked(counter, expired), false);
  assert.throws(() => client.lock(counter, expired), error => error.code === 'COUNTER_IDENTITY_REQUIRED');
  assert.equal(client.reset(), true);
  assert.equal(storage.getItem('unrelated-app-key'), 'kept');
  assert.equal(client.isLocked(counter, session), false);
});
