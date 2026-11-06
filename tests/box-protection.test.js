import test from 'node:test';
import assert from 'node:assert/strict';
import { createDemoState, applyAction, getSummary, loadState, STORAGE_KEY } from '../dist/js/model.js';
import { hasBoxProtection, protectionSummary, validatePartnerDetails, getPartnerRequestView, getBoxSupportRequestView } from '../dist/js/box-protection.js';
const partner = { name: 'Esi', phone: '+233 24 123 4567' };
const run = (state, action, payload) => { const result = applyAction(state, action, payload); assert.equal(result.ok, true, result.message); return result; };
function setup() {
  const state = createDemoState();
  const result = run(state, 'createBox', { name: 'Next semester', target: 100000 });
  // Retained pending-invitation records from the existing-box protection journey.
  run(state,'requestBoxProtection',{boxId:result.id,partner,pin:'1234'});
  const box = state.boxes.find(box => box.id === result.id); run(state, 'contributeBox', { id: box.id, amount: 30000 });
  return { state, box };
}
const invite = (state, box, decision = 'accepted') => run(state, 'respondBoxPartnerInvite', { boxId: box.id, invitationId: box.protection.invitationId, decision });
function approve(state, box, kind = 'withdrawal', extra = {}) {
  const { requestId } = run(state, 'requestBoxRelease', { boxId: box.id, kind, ...(kind === 'withdrawal' ? { amount: 1000 } : {}), ...extra });
  const { code } = run(state, 'issueBoxPartnerCode', { boxId: box.id, requestId });
  const result = run(state, 'verifyBoxPartnerCode', { boxId: box.id, requestId, code }); assert.equal(result.authorized, true);
  return { requestId, code };
}

test('optional setup validates a distinct Ghanaian partner and never changes money', () => {
  const state = createDemoState(), before = getSummary(state);
  assert.deepEqual(validatePartnerDetails(partner, state.profile.phone), { ok: true, partner: { name: 'Esi', phone: '0241234567' } });
  assert.equal(validatePartnerDetails({ name: 'Me', phone: state.profile.phone }, state.profile.phone).ok, false);
  const { id } = run(state, 'createBox', { name: 'Protected books', target: 50000 });
  run(state,'requestBoxProtection',{boxId:id,partner,pin:'1234'});
  assert.deepEqual(getSummary(state), before); const box = state.boxes.find(box => box.id === id);
  assert.equal(hasBoxProtection(box), false); assert.equal(protectionSummary(box).status, 'invited');
  const plain = run(state, 'createBox', { name: 'Plain books', target: 50000 }).box; assert.equal(hasBoxProtection(plain), false);
  for (const value of [{ name: '', phone: partner.phone }, { name: 'Esi', phone: 'bad' }, { name: 'Me', phone: state.profile.phone }]) {
    const snapshot = JSON.stringify(state); assert.equal(applyAction(state, 'createBox', { name: 'Nope', target: 50000, accountabilityPartner: value }).ok, false); assert.equal(JSON.stringify(state), snapshot);
  }
});

test('an existing-box invitation does not lock withdrawals before acceptance or after decline', () => {
  const { state, box } = setup(), wallet = state.wallet, balance = box.balance;
  assert.equal(hasBoxProtection(box), false);
  assert.equal(applyAction(state, 'requestBoxRelease', { boxId: box.id, kind: 'withdrawal', amount: 1000 }).ok, false);
  run(state, 'withdrawBox', { id: box.id, amount: 1000 });
  assert.equal(state.wallet, wallet + 1000); assert.equal(box.balance, balance - 1000);
  invite(state, box, 'declined'); assert.equal(hasBoxProtection(box), false);
  run(state, 'withdrawBox', { id: box.id, amount: 1000 });
  assert.equal(state.wallet, wallet + 2000); assert.equal(box.balance, balance - 2000);
});

test('a pending invitation respects independent locks and can be cancelled without a partner code', () => {
  const { state, box } = setup(), invitationId = box.protection.invitationId;
  run(state, 'updateBox', { id: box.id, locked: true });
  assert.equal(applyAction(state, 'withdrawBox', { id: box.id, amount: 1000 }).ok, false);
  run(state, 'cancelBoxPartnerInvite', { boxId: box.id, invitationId });
  assert.equal(hasBoxProtection(box), false); assert.equal(box.locked, true);
  assert.equal(applyAction(state, 'respondBoxPartnerInvite', { boxId: box.id, invitationId, decision: 'accepted' }).ok, false);
  run(state, 'updateBox', { id: box.id, locked: false });
  run(state, 'withdrawBox', { id: box.id, amount: 1000 });
  run(state, 'requestBoxProtection', { boxId: box.id, partner: { name: 'Adwoa', phone: '0205551234' }, pin: '1234' });
  assert.notEqual(box.protection.invitationId, invitationId);
  assert.equal(hasBoxProtection(box), false);
});

test('an accepted partner code grants only one exact withdrawal and does not replace the owner PIN', () => {
  const { state, box } = setup(); invite(state, box); const before = getSummary(state), balance = box.balance, wallet = state.wallet;
  const { requestId } = approve(state, box);
  for (const payload of [{ amount: 1100, pin: '1234' }, { amount: 1000 }, { amount: 1000, pin: '0000' }]) assert.equal(applyAction(state, 'withdrawBox', { id: box.id, requestId, ...payload }).ok, false);
  const result = run(state, 'withdrawBox', { id: box.id, amount: 1000, requestId, pin: '1234', idempotencyKey: 'release-once' });
  assert.equal(box.balance, balance - 1000); assert.equal(state.wallet, wallet + 1000); assert.equal(getSummary(state).total, before.total);
  assert.equal(result.transaction.protectionRequestId, requestId); assert.equal(result.transaction.protectionApprovedBy, 'partner');
  assert.equal(applyAction(state, 'withdrawBox', { id: box.id, amount: 1000, requestId, pin: '1234', idempotencyKey: 'release-once' }).duplicate, true);
  assert.equal(applyAction(state, 'withdrawBox', { id: box.id, amount: 1000, requestId, pin: '1234', idempotencyKey: 'different-release' }).ok, false);
  assert.equal(box.balance, balance - 1000);
});

test('new requests supersede old codes and fresh withdrawals receive different codes', () => {
  const { state, box } = setup(); invite(state, box);
  const first = approve(state, box);
  const { requestId } = run(state, 'requestBoxRelease', { boxId: box.id, kind: 'withdrawal', amount: 2000 });
  const second = run(state, 'issueBoxPartnerCode', { boxId: box.id, requestId }); assert.notEqual(second.code, first.code);
  assert.equal(applyAction(state, 'withdrawBox', { id: box.id, amount: 1000, requestId: first.requestId, pin: '1234' }).ok, false);
  assert.equal(applyAction(state, 'verifyBoxPartnerCode', { boxId: box.id, requestId, code: first.code }).authorized, false);
  assert.equal(box.protectionRequests.find(request => request.id === first.requestId).status, 'superseded');
});

test('wrong-code attempt limits are persistent actions and a cached verification cannot reopen an approval', () => {
  const { state, box } = setup(); invite(state, box);
  const { requestId } = run(state, 'requestBoxRelease', { boxId: box.id, kind: 'withdrawal', amount: 1000 });
  const { code } = run(state, 'issueBoxPartnerCode', { boxId: box.id, requestId });
  for (let i = 0; i < 5; i++) { const result = run(state, 'verifyBoxPartnerCode', { boxId: box.id, requestId, code: code === '000000' ? '999999' : '000000', idempotencyKey: 'same-attempt-reference' }); assert.equal(result.authorized, false); assert.equal(result.attempts, i + 1); }
  assert.equal(box.protectionRequests[0].status, 'locked'); assert.equal(applyAction(state, 'verifyBoxPartnerCode', { boxId: box.id, requestId, code }).ok, false);
  const second = approve(state, box); const verify = { boxId: box.id, requestId: second.requestId, code: second.code, idempotencyKey: 'verify-cache' };
  assert.equal(applyAction(state, 'verifyBoxPartnerCode', verify).ok, false, 'A second verification cannot recreate a consumed code.');
});

test('expired partner codes and approved grants cannot move money', () => {
  const { state, box } = setup(); invite(state, box);
  const { requestId } = run(state, 'requestBoxRelease', { boxId: box.id, kind: 'withdrawal', amount: 1000 }); run(state, 'issueBoxPartnerCode', { boxId: box.id, requestId });
  const request = box.protectionRequests[0], code = request.code; request.expiresAt = '2000-01-01T00:00:00Z';
  assert.equal(run(state, 'verifyBoxPartnerCode', { boxId: box.id, requestId, code }).authorized, false); assert.equal(request.status, 'expired');
  const approval = approve(state, box); box.protectionRequests[0].expiresAt = '2000-01-01T00:00:00Z';
  assert.equal(applyAction(state, 'withdrawBox', { id: box.id, amount: 1000, requestId: approval.requestId, pin: '1234' }).ok, false);
});

test('support requests leave funds locked until explicit verification, approval and owner PIN', () => {
  const { state, box } = setup(); invite(state, box); const wallet = state.wallet, balance = box.balance;
  const { requestId } = run(state, 'requestBoxRelease', { boxId: box.id, kind: 'withdrawal', amount: 1000 });
  run(state, 'requestBoxSupportReview', { boxId: box.id, requestId });
  assert.equal(applyAction(state, 'verifyBoxSupport', { boxId: box.id, requestId, decision: 'approved' }).ok, false);
  assert.equal(applyAction(state, 'withdrawBox', { id: box.id, amount: 1000, requestId, pin: '1234' }).ok, false);
  assert.equal(state.wallet, wallet); assert.equal(box.balance, balance);
  assert.equal(run(state, 'verifyBoxSupport', { boxId: box.id, requestId, decision: 'approved', identityVerified: true }).authorized, true);
  run(state, 'withdrawBox', { id: box.id, amount: 1000, requestId, pin: '1234' });
  assert.equal(box.balance, balance - 1000); assert.equal(box.protectionRequests[0].approvedBy, 'verified-support');
});

test('changing or removing a partner requires its own approval and invalidates old invitations', () => {
  const { state, box } = setup(); invite(state, box); const originalInvite = box.protection.invitationId;
  const changed = approve(state, box, 'change-partner', { partner: { name: 'Kofi', phone: '0201234567' } });
  assert.equal(applyAction(state, 'completeBoxProtectionChange', { boxId: box.id, requestId: changed.requestId }).ok, false);
  run(state, 'completeBoxProtectionChange', { boxId: box.id, requestId: changed.requestId, pin: '1234' }); assert.equal(box.protection.status, 'active'); assert.equal(box.protection.partner.name, 'Esi'); assert.equal(box.pendingProtection.status, 'invited'); assert.equal(box.pendingProtection.partner.name, 'Kofi');
  assert.equal(applyAction(state, 'respondBoxPartnerInvite', { boxId: box.id, invitationId: originalInvite, decision: 'accepted' }).ok, false);
  assert.equal(applyAction(state, 'respondBoxPartnerInvite', { boxId: box.id, decision: 'accepted' }).ok, false); run(state, 'respondBoxPartnerInvite', { boxId: box.id, invitationId: box.pendingProtection.invitationId, decision: 'accepted' }); assert.equal(box.protection.partner.name, 'Kofi');
  const removed = approve(state, box, 'remove-protection'); run(state, 'completeBoxProtectionChange', { boxId: box.id, requestId: removed.requestId, pin: '1234' });
  assert.equal(hasBoxProtection(box), false); assert.ok(box.protectionAudit.some(event => event.type === 'protection-removed'));
  assert.equal(applyAction(state, 'completeBoxProtectionChange', { boxId: box.id, requestId: removed.requestId, pin: '1234' }).ok, false);
});

test('generic protected-box edits preserve protection, and renaming invalidates outstanding codes', () => {
  const { state, box } = setup(); invite(state, box); const { requestId } = approve(state, box);
  for (const payload of [{ protection: null }, { accountabilityPartner: null }, { activeProtectionRequestId: null }]) assert.equal(applyAction(state, 'updateBox', { id: box.id, ...payload }).ok, false);
  const protection = structuredClone(box.protection), audit = structuredClone(box.protectionAudit);
  run(state, 'updateBox', { id: box.id, locked: false });
  assert.deepEqual(box.protection, protection, 'A personal unlock cannot remove or replace partner protection.');
  assert.deepEqual(box.protectionAudit, audit);
  assert.equal(applyAction(state, 'withdrawBox', { id: box.id, amount: 1000, pin: '1234' }).ok, false, 'Unlocking never substitutes for the approved partner request.');
  run(state, 'updateBox', { id: box.id, target: 120000 }); assert.equal(box.protectionRequests[0].status, 'approved');
  run(state, 'updateBox', { id: box.id, name: 'Renamed semester' }); assert.equal(box.protectionRequests[0].status, 'superseded');
  assert.equal(applyAction(state, 'withdrawBox', { id: box.id, amount: 1000, requestId, pin: '1234' }).ok, false);
});

test('partner views resolve canonical records and never expose account data, balances or goal targets', () => {
  const { state, box } = setup(); invite(state, box); const { requestId } = run(state, 'requestBoxRelease', { boxId: box.id, kind: 'withdrawal', amount: 1000 });
  run(state, 'issueBoxPartnerCode', { boxId: box.id, requestId }); const request = box.protectionRequests[0];
  const view = getPartnerRequestView(box, { ...request, amount: 999999, status: 'approved', code: '000000' });
  assert.equal(view.amount, 1000); assert.equal(view.status, 'code-issued'); assert.equal(view.code, request.code);
  for (const key of ['balance', 'wallet', 'target', 'budget', 'profile', 'protectionRequests', 'partner']) assert.equal(Object.hasOwn(view, key), false, key);
  assert.equal(Object.hasOwn(protectionSummary(box), 'code'), false);
});

test('legacy manual locks and Savings Hacks continue to work without a partner', () => {
  const state = createDemoState(), box = state.boxes[0], total = getSummary(state).total;
  run(state, 'updateBox', { id: box.id, locked: true }); assert.equal(applyAction(state, 'withdrawBox', { id: box.id, amount: 1000 }).ok, false);
  run(state, 'updateBox', { id: box.id, locked: false }); run(state, 'withdrawBox', { id: box.id, amount: 1000 });
  assert.equal(getSummary(state).total, total); assert.equal(hasBoxProtection(box), false); assert.equal(box.hack.type, 'roundup');
});

test('malformed saved protection fails closed and verified support can recover without losing balances', () => {
  const state = createDemoState(), box = state.boxes[0], wallet = state.wallet, balance = box.balance;
  box.protection = { status: 'active', partner: null }; const previous = globalThis.localStorage;
  globalThis.localStorage = { getItem: key => key === STORAGE_KEY ? JSON.stringify(state) : null };
  try {
    const restored = loadState(), saved = restored.boxes[0]; assert.equal(hasBoxProtection(saved), true); assert.equal(protectionSummary(saved).status, 'recovery-required');
    assert.equal(restored.wallet, wallet); assert.equal(saved.balance, balance);
    assert.equal(applyAction(restored, 'withdrawBox', { id: saved.id, amount: 1000 }).ok, false);
    const { requestId } = run(restored, 'requestBoxRelease', { boxId: saved.id, kind: 'remove-protection' });
    assert.equal(getPartnerRequestView(saved, saved.protectionRequests[0]), null);
    const supportView = getBoxSupportRequestView(saved, {...saved.protectionRequests[0], kind:'withdrawal', amount:999999}); assert.equal(supportView.kind, 'remove-protection'); assert.equal(Object.hasOwn(supportView, 'amount'), false); assert.equal(Object.hasOwn(supportView, 'balance'), false);
    run(restored, 'requestBoxSupportReview', { boxId: saved.id, requestId });
    run(restored, 'verifyBoxSupport', { boxId: saved.id, requestId, decision: 'approved', identityVerified: true }); run(restored, 'completeBoxProtectionChange', { boxId: saved.id, requestId, pin: '1234' });
    assert.equal(hasBoxProtection(saved), false); assert.equal(restored.wallet, wallet); assert.equal(saved.balance, balance);
  } finally { if (previous === undefined) delete globalThis.localStorage; else globalThis.localStorage = previous; }
});
