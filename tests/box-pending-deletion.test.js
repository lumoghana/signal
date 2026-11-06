import test from 'node:test';
import assert from 'node:assert/strict';
import { createEmptyState, applyAction, getSummary, migrateState } from '../dist/js/model.js';

function fixture() {
  const state = createEmptyState({ name: 'Ama' });
  state.onboardingDone = true;
  state.wallet = 100000;
  const act = (type, payload = {}) => {
    const result = applyAction(state, type, payload);
    assert.equal(result.ok, true, `${type}: ${result.message}`);
    return result;
  };
  const box = act('createBox', { name: 'Next semester', target: 50000 }).box;
  return { state, box, act };
}

test('closing an empty box cannot strand a pending deposit, including after refresh', () => {
  const h = fixture();
  const transfer = h.act('contributeBox', { boxId: h.box.id, amount: 10000, status: 'pending' }).transaction;
  const state = migrateState(JSON.parse(JSON.stringify(h.state)));
  const before = JSON.stringify(state);
  const blocked = applyAction(state, 'deleteBox', { boxId: h.box.id });
  assert.equal(blocked.ok, false);
  assert.match(blocked.message, /pending transfer/);
  assert.equal(JSON.stringify(state), before, 'a blocked close must preserve money and records');
  assert.equal(getSummary(state).transferHolds, 10000);
  assert.equal(getSummary(state).total, 100000);

  const result = applyAction(state, 'resolveBoxTransfer', { transactionId: transfer.id, status: 'failed' });
  assert.equal(result.ok, true, result.message);
  assert.equal(state.wallet, 100000);
  assert.equal(getSummary(state).transferHolds, 0);
  assert.equal(applyAction(state, 'deleteBox', { boxId: h.box.id }).ok, true);
  assert.equal(state.transactions.find(tx => tx.id === transfer.id).status, 'failed');
});

test('a blocked close leaves a pending deposit able to confirm exactly once', () => {
  const h = fixture();
  const transfer = h.act('contributeBox', { boxId: h.box.id, amount: 10000, status: 'pending' }).transaction;
  assert.equal(applyAction(h.state, 'deleteBox', { id: h.box.id }).ok, false);
  h.act('resolveBoxTransfer', { transactionId: transfer.id, status: 'success' });
  assert.equal(h.box.balance, 10000);
  assert.equal(h.state.wallet, 90000);
  assert.equal(getSummary(h.state).total, 100000);
  assert.equal(applyAction(h.state, 'resolveBoxTransfer', { transactionId: transfer.id, status: 'success' }).ok, false);
  assert.equal(h.box.balance, 10000);
  assert.equal(applyAction(h.state, 'deleteBox', { id: h.box.id }).ok, false, 'confirmed savings must be moved out before closing');
});

test('a pending full withdrawal cannot make a zero-balance box safe to delete', () => {
  const h = fixture();
  h.act('contributeBox', { boxId: h.box.id, amount: 10000 });
  const transfer = h.act('withdrawBox', { boxId: h.box.id, amount: 10000, status: 'pending' }).transaction;
  assert.equal(h.box.balance, 0);
  assert.equal(h.state.wallet, 90000);
  assert.equal(applyAction(h.state, 'deleteBox', { boxId: h.box.id }).ok, false);
  h.act('resolveBoxTransfer', { transactionId: transfer.id, status: 'failed' });
  assert.equal(h.box.balance, 10000);
  assert.equal(h.state.wallet, 90000);
  assert.equal(getSummary(h.state).total, 100000);
  assert.equal(getSummary(h.state).transferHolds, 0);
  assert.equal(h.state.transactions.find(tx => tx.id === transfer.id).status, 'failed');
});
