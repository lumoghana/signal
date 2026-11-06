import test from 'node:test';
import assert from 'node:assert/strict';
import { createDemoState, applyAction, getSummary } from '../dist/js/model.js';
import { hasBoxProtection } from '../dist/js/box-protection.js';

const partner = { name: 'Esi Owusu', phone: '0241112222' };
const run = (state, type, payload = {}) => {
  const result = applyAction(state, type, payload);
  assert.equal(result.ok, true, `${type}: ${result.message}`);
  return result;
};
function fixture({ locked = true } = {}) {
  const state = createDemoState();
  const { box } = run(state, 'createBox', { name: 'Next semester printing', target: 80000 });
  run(state, 'contributeBox', { boxId: box.id, amount: 10000 });
  if (locked) run(state, 'updateBox', { boxId: box.id, locked: true });
  run(state, 'requestBoxProtection', { boxId: box.id, partner, pin: '1234' });
  run(state, 'respondBoxPartnerInvite', {
    boxId: box.id, invitationId: box.protection.invitationId, decision: 'accepted',
  });
  assert.equal(box.locked, locked, 'Accepting a partner must retain the independent personal lock.');
  assert.equal(hasBoxProtection(box), true);
  return { state, box };
}
function request(state, box, amount = 2000) {
  return run(state, 'requestBoxRelease', { boxId: box.id, kind: 'withdrawal', amount }).requestId;
}
function approve(state, box, requestId) {
  const { code } = run(state, 'issueBoxPartnerCode', { boxId: box.id, requestId });
  const result = run(state, 'verifyBoxPartnerCode', { boxId: box.id, requestId, code });
  assert.equal(result.authorized, true);
  return box.protectionRequests.find(item => item.id === requestId);
}
function money(state) {
  return structuredClone({ wallet: state.wallet, boxes: state.boxes.map(({ id, balance }) => ({ id, balance })), transactions: state.transactions });
}
function mandate(box) {
  return structuredClone({ protection: box.protection, pendingProtection: box.pendingProtection,
    revision: box.protectionRevision, requests: box.protectionRequests,
    activeRequestId: box.activeProtectionRequestId, audit: box.protectionAudit });
}
function blocked(state, type, payload) {
  const before = money(state);
  const result = applyAction(state, type, payload);
  assert.equal(result.ok, false, `${type} must be blocked`);
  assert.deepEqual(money(state), before, 'A blocked action must not move money or rewrite transfer history.');
  return result;
}

test('unlocking a funded Box after partner acceptance preserves the mandate and still needs fresh approval plus the owner PIN', () => {
  const { state, box } = fixture();
  const total = getSummary(state).total, wallet = state.wallet, balance = box.balance;
  const requestId = request(state, box), savedMandate = mandate(box), history = money(state);

  run(state, 'updateBox', { boxId: box.id, locked: false });
  assert.equal(box.locked, false);
  assert.equal(hasBoxProtection(box), true, 'Personal unlocking cannot remove accountability protection.');
  assert.deepEqual(mandate(box), savedMandate, 'Unlocking must retain the partner, revision, pending request and audit history.');
  assert.deepEqual(money(state), history);
  blocked(state, 'withdrawBox', { boxId: box.id, amount: 2000, pin: '1234' });
  blocked(state, 'withdrawBox', { boxId: box.id, amount: 2000, requestId, pin: '1234' });
  const approved = approve(state, box, requestId);
  blocked(state, 'withdrawBox', { boxId: box.id, amount: 2000, requestId });
  blocked(state, 'withdrawBox', { boxId: box.id, amount: 2000, requestId, pin: '0000' });
  blocked(state, 'withdrawBox', { boxId: box.id, amount: 2100, requestId, pin: '1234' });
  assert.equal(approved.status, 'approved');

  const transfer = run(state, 'withdrawBox', { boxId: box.id, amount: 2000, requestId,
    pin: '1234', idempotencyKey: 'unlocked-partner-transfer' });
  assert.equal(approved.status, 'consumed');
  assert.equal(transfer.transaction.protectionRequestId, requestId);
  assert.equal(state.wallet, wallet + 2000);
  assert.equal(box.balance, balance - 2000);
  assert.equal(getSummary(state).total, total);
  assert.equal(hasBoxProtection(box), true);
});

test('a personal lock blocks even an approved protected withdrawal without consuming the approval, and unlocking can use that same fresh grant once', () => {
  const { state, box } = fixture();
  const requestId = request(state, box), approved = approve(state, box, requestId);
  const savedMandate = mandate(box), wallet = state.wallet, balance = box.balance;
  const result = blocked(state, 'withdrawBox', { boxId: box.id, amount: 2000, requestId, pin: '1234' });
  assert.match(result.message, /unlock|lock/i);
  assert.deepEqual(mandate(box), savedMandate, 'The lock must not consume or supersede the current valid partner approval.');
  assert.equal(approved.status, 'approved');

  run(state, 'updateBox', { boxId: box.id, locked: false });
  assert.deepEqual(mandate(box), savedMandate);
  run(state, 'withdrawBox', { boxId: box.id, amount: 2000, requestId,
    pin: '1234', idempotencyKey: 'same-fresh-grant-after-unlock' });
  const after = money(state);
  const duplicate = run(state, 'withdrawBox', { boxId: box.id, amount: 2000, requestId,
    pin: '1234', idempotencyKey: 'same-fresh-grant-after-unlock' });
  assert.equal(duplicate.duplicate, true);
  assert.deepEqual(money(state), after);
  blocked(state, 'withdrawBox', { boxId: box.id, amount: 2000, requestId,
    pin: '1234', idempotencyKey: 'cannot-reuse-consumed-grant' });
  assert.equal(state.wallet, wallet + 2000);
  assert.equal(box.balance, balance - 2000);
});

test('a locked protected Box cannot retry a failed withdrawal, while unlock preserves a fresh retry approval and the original transfer reference', () => {
  const { state, box } = fixture({ locked: false });
  const firstId = request(state, box); approve(state, box, firstId);
  const failed = run(state, 'withdrawBox', { boxId: box.id, amount: 2000, requestId: firstId,
    pin: '1234', status: 'failed' }).transaction;
  assert.equal(failed.status, 'failed');
  run(state, 'updateBox', { boxId: box.id, locked: true });
  const retryId = request(state, box), approved = approve(state, box, retryId);
  const savedMandate = mandate(box), wallet = state.wallet, balance = box.balance;
  const result = blocked(state, 'retryBoxTransfer', { transactionId: failed.id,
    requestId: retryId, pin: '1234' });
  assert.match(result.message, /unlock|lock/i);
  assert.equal(failed.status, 'failed');
  assert.deepEqual(mandate(box), savedMandate);
  assert.equal(approved.status, 'approved');

  run(state, 'updateBox', { boxId: box.id, locked: false });
  assert.deepEqual(mandate(box), savedMandate);
  blocked(state, 'retryBoxTransfer', { transactionId: failed.id, requestId: retryId, pin: '0000' });
  const retried = run(state, 'retryBoxTransfer', { transactionId: failed.id, requestId: retryId,
    pin: '1234', idempotencyKey: 'locked-retry-after-unlock' });
  assert.equal(retried.transaction.id, failed.id);
  assert.equal(failed.status, 'pending');
  assert.equal(failed.protectionRequestId, retryId);
  assert.equal(approved.status, 'consumed');
  assert.equal(box.balance, balance - 2000);
  assert.equal(state.wallet, wallet, 'A pending retry does not yet credit Everyday.');
  assert.equal(getSummary(state).transferHolds, 2000);
  const pending = money(state);
  assert.equal(run(state, 'retryBoxTransfer', { transactionId: failed.id, requestId: retryId,
    pin: '1234', idempotencyKey: 'locked-retry-after-unlock' }).duplicate, true);
  assert.deepEqual(money(state), pending);
  run(state, 'resolveBoxTransfer', { transactionId: failed.id, status: 'success' });
  assert.equal(state.wallet, wallet + 2000);
  assert.equal(box.balance, balance - 2000);
  assert.equal(getSummary(state).transferHolds, 0);
  assert.equal(state.transactions.filter(item => item.id === failed.id).length, 1);
});

test('unlocking changes neither an expired approval nor the accepted partner and cannot renew a release', () => {
  const { state, box } = fixture();
  const requestId = request(state, box), approved = approve(state, box, requestId);
  approved.expiresAt = '2000-01-01T00:00:00.000Z';
  const savedMandate = mandate(box), before = money(state);
  run(state, 'updateBox', { boxId: box.id, locked: false });
  assert.deepEqual(mandate(box), savedMandate);
  assert.equal(hasBoxProtection(box), true);
  blocked(state, 'withdrawBox', { boxId: box.id, amount: 2000, requestId, pin: '1234' });
  assert.deepEqual(money(state), before);
});
