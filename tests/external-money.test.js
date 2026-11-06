import test from 'node:test';
import assert from 'node:assert/strict';
import { createEmptyState, createDemoState, getSummary, evaluatePayment, applyAction, loadState, saveState, STORAGE_KEY } from '../dist/js/model.js';

const run = (state, action, payload) => {
  const result = applyAction(state, action, payload);
  assert.equal(result.ok, true, result.message);
  return result;
};
const ledger = state => {
  const { externalBalances, externalBalanceHistory, _appliedActions, ...rest } = state;
  return JSON.stringify(rest);
};
const lumoSummary = state => {
  const { outsideTotal, allMoneyTotal, ...rest } = getSummary(state);
  return rest;
};
const withStorage = callback => {
  const previous = globalThis.localStorage, values = new Map();
  globalThis.localStorage = { getItem: key => values.get(key), setItem: (key, value) => values.set(key, value) };
  try { callback(values); }
  finally { if (previous === undefined) delete globalThis.localStorage; else globalThis.localStorage = previous; }
};

test('new and demo states have no invented outside money', () => {
  for (const state of [createEmptyState(), createDemoState()]) {
    assert.deepEqual(state.externalBalances, []);
    assert.equal(getSummary(state).outsideTotal, 0);
    assert.equal(getSummary(state).allMoneyTotal, getSummary(state).total);
  }
});

test('cash, bank and MoMo snapshots can be created, edited and removed without touching the Lumo ledger', () => {
  const state = createDemoState(), before = ledger(state), summary = lumoSummary(state);
  const cash = run(state, 'createExternalBalance', { type: 'cash', name: '  In my wallet  ', balance: 4500 });
  const bank = run(state, 'createExternalBalance', { type: 'bank', name: 'Ecobank savings', balance: 100000 });
  const momo = run(state, 'createExternalBalance', { type: 'momo', name: 'MTN MoMo', balance: 999 });
  assert.equal(cash.externalBalance.name, 'In my wallet');
  assert.equal(new Set(state.externalBalances.map(item => item.id)).size, 3);
  assert.ok(state.externalBalances.every(item => Number.isFinite(Date.parse(item.updatedAt))));
  assert.equal(getSummary(state).outsideTotal, 105499);
  assert.equal(getSummary(state).allMoneyTotal, 427499);
  assert.equal(getSummary(state).total, 322000);
  assert.equal(ledger(state), before);
  assert.deepEqual(lumoSummary(state), summary);

  const oldTime = '2020-01-01T00:00:00.000Z';
  bank.externalBalance.updatedAt = oldTime;
  const edit = run(state, 'updateExternalBalance', { id: bank.id, type: 'momo', name: 'Telecel Cash', balance: 0 });
  assert.equal(edit.externalBalance.type, 'momo');
  assert.equal(edit.externalBalance.name, 'Telecel Cash');
  assert.equal(edit.externalBalance.balance, 0);
  assert.notEqual(edit.externalBalance.updatedAt, oldTime);
  assert.equal(getSummary(state).outsideTotal, 5499);
  run(state, 'removeExternalBalance', { id: cash.id });
  run(state, 'removeExternalBalance', { id: bank.id });
  run(state, 'removeExternalBalance', { id: momo.id });
  assert.deepEqual(state.externalBalances, []);
  assert.equal(state.externalBalanceHistory.length, 7);
  assert.equal(state.externalBalanceHistory.filter(e=>e.type==='removed').length, 3);
  assert.equal(ledger(state), before);
  assert.deepEqual(lumoSummary(state), summary);
});

test('outside funds never raise Lumo payment availability, flexible money or the daily guide', () => {
  const state = createEmptyState(), before = lumoSummary(state);
  run(state, 'createExternalBalance', { type: 'bank', name: 'Other bank', balance: 10000000000 });
  assert.equal(getSummary(state).allMoneyTotal, 10000000000);
  assert.deepEqual(lumoSummary(state), before);
  assert.equal(evaluatePayment(state, { amount: 100 }).allowed, false);
  const snapshot = JSON.stringify(state);
  assert.equal(applyAction(state, 'payment', { recipient: 'Kojo', amount: 100 }).ok, false);
  assert.equal(JSON.stringify(state), snapshot);
});

test('normalised duplicates are rejected while separately labelled accounts and different types are allowed', () => {
  const state = createEmptyState();
  const first = run(state, 'createExternalBalance', { type: 'momo', name: 'MTN - MoMo', balance: 1000 });
  run(state, 'createExternalBalance', { type: 'bank', name: 'mtn momo', balance: 2000 });
  const second = run(state, 'createExternalBalance', { type: 'momo', name: 'MTN work', balance: 3000 });
  const snapshot = JSON.stringify(state);
  assert.equal(applyAction(state, 'createExternalBalance', { type: 'momo', name: '  mtn momo  ', balance: 1000 }).ok, false);
  assert.equal(applyAction(state, 'updateExternalBalance', { id: second.id, name: 'MTN MoMo', balance: 0 }).ok, false);
  assert.equal(JSON.stringify(state), snapshot);
  run(state, 'updateExternalBalance', { id: first.id, name: 'MTN - MoMo', balance: 0 });
  assert.equal(state.externalBalances[0].balance, 0);
});

test('invalid balances, types, labels and missing records fail atomically', () => {
  const state = createDemoState();
  const entry = run(state, 'createExternalBalance', { type: 'cash', name: 'Pocket cash', balance: 0 });
  for (const balance of [-1, 0.5, Infinity, NaN, '100', null, undefined, 10000000001]) {
    for (const action of ['createExternalBalance', 'updateExternalBalance']) {
      const snapshot = JSON.stringify(state);
      assert.equal(applyAction(state, action, { id: entry.id, type: 'bank', name: 'Other account', balance }).ok, false);
      assert.equal(JSON.stringify(state), snapshot);
    }
  }
  for (const payload of [{ type: 'crypto' }, { type: null }, { name: '   ' }, { name: 100 }, { name: null }]) {
    const snapshot = JSON.stringify(state);
    assert.equal(applyAction(state, 'updateExternalBalance', { id: entry.id, balance: 0, ...payload }).ok, false);
    assert.equal(JSON.stringify(state), snapshot);
  }
  for (const action of ['updateExternalBalance', 'removeExternalBalance']) {
    const snapshot = JSON.stringify(state);
    assert.equal(applyAction(state, action, { id: 'missing', balance: 0 }).ok, false);
    assert.equal(JSON.stringify(state), snapshot);
  }
});

test('external action replay cannot duplicate records, replace newer balances or refresh their timestamp', () => {
  const state = createEmptyState();
  const create = { type: 'cash', name: 'Pocket cash', balance: 500, idempotencyKey: 'cash-create' };
  const first = run(state, 'createExternalBalance', create);
  assert.equal(run(state, 'createExternalBalance', create).duplicate, true);
  assert.equal(state.externalBalances.length, 1);
  const update = { id: first.id, balance: 200, idempotencyKey: 'cash-update' };
  run(state, 'updateExternalBalance', update);
  const timestamp = state.externalBalances[0].updatedAt;
  run(state, 'updateExternalBalance', { id: first.id, balance: 100 });
  state.externalBalances[0].updatedAt = '2020-01-01T00:00:00.000Z';
  const replay = run(state, 'updateExternalBalance', update);
  assert.equal(replay.duplicate, true);
  assert.equal(replay.externalBalance.balance, 200);
  assert.equal(replay.externalBalance.updatedAt, timestamp);
  assert.equal(state.externalBalances[0].balance, 100);
  assert.equal(state.externalBalances[0].updatedAt, '2020-01-01T00:00:00.000Z');
  run(state, 'updateExternalBalance', { id: first.id, balance: 100 });
  assert.notEqual(state.externalBalances[0].updatedAt, '2020-01-01T00:00:00.000Z');
  assert.ok(Number.isFinite(Date.parse(state.externalBalances[0].updatedAt)));
  const snapshot = JSON.stringify(state);
  assert.equal(applyAction(state, 'updateExternalBalance', { ...update, balance: 300 }).ok, false);
  assert.equal(JSON.stringify(state), snapshot);
  const remove = { id: first.id, idempotencyKey: 'cash-remove' };
  run(state, 'removeExternalBalance', remove);
  assert.equal(run(state, 'removeExternalBalance', remove).duplicate, true);
  assert.deepEqual(state.externalBalances, []);
});

test('old v1 storage gains an empty outside ledger and preserves every existing balance and history record', () => withStorage(values => {
  const legacy = createDemoState();
  delete legacy.externalBalances;
  legacy.settings.hideBalance = false;
  legacy._appliedActions = { previous: { signature: 'kept', result: { ok: true } } };
  values.set(STORAGE_KEY, JSON.stringify(legacy));
  const restored = loadState();
  assert.deepEqual(restored, { ...legacy, externalBalances: [] });
  assert.equal(saveState(restored), true);
  assert.deepEqual(loadState(), restored);
}));

test('external balances survive storage and malformed explicit data is not silently migrated', () => withStorage(values => {
  const state = createDemoState();
  run(state, 'createExternalBalance', { type: 'momo', name: 'MTN personal', balance: 12345 });
  assert.equal(saveState(state), true);
  assert.deepEqual(loadState(), state);
  for (const externalBalances of [null, {}, [{ ...state.externalBalances[0], balance: -1 }], [{ ...state.externalBalances[0], updatedAt: 'not-a-date' }], [state.externalBalances[0], { ...state.externalBalances[0], id: 'another-id' }]]) {
    const bad = { ...state, externalBalances };
    assert.equal(saveState(bad), false);
    values.set(STORAGE_KEY, JSON.stringify(bad));
    assert.equal(loadState().wallet, 0);
  }
}));
