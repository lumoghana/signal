import test from 'node:test';
import assert from 'node:assert/strict';
import { createDemoState, applyAction, loadState, saveState, STORAGE_KEY } from '../dist/js/model.js';
import { hasBoxProtection, getPartnerRequestView, protectionSummary } from '../dist/js/box-protection.js';

const partner = { name: 'Esi', phone: '024 111 2222' };
const replacement = { name: 'Adwoa', phone: '+233 20 555 1234' };
function commit(state, type, payload = {}) {
  const result = applyAction(state, type, payload);
  assert.equal(result.ok, true, `${type}: ${result.message}`);
  return result;
}
function fixture({ accepted = true, funded = true } = {}) {
  const state = createDemoState();
  const { box } = commit(state, 'createBox', { name: 'Next semester', target: 80000 });
  // Exercise retained existing-box invitations, separate from the new creation gate.
  commit(state,'requestBoxProtection',{boxId:box.id,partner,pin:'1234'});
  const act = (type, payload = {}) => commit(state, type, { boxId: box.id, ...payload });
  if (accepted) act('respondBoxPartnerInvite', { invitationId: box.protection.invitationId, decision: 'accepted' });
  if (funded) act('contributeBox', { amount: 10000 });
  return { state, box, act };
}
function money(state) {
  return JSON.stringify({ wallet: state.wallet, boxes: state.boxes.map(({ id, balance }) => ({ id, balance })), transactions: state.transactions,
    budget: state.budget, ious: state.ious, groups: state.groups, outside: state.externalBalances });
}
function requestAndCode(f, kind = 'withdrawal', extra = { amount: 2000 }) {
  const { requestId } = f.act('requestBoxRelease', { kind, ...extra });
  const result = f.act('issueBoxPartnerCode', { requestId });
  assert.match(result.code, /^\d{6}$/);
  return { requestId, code: result.code };
}
function approve(f, grant) {
  const result = f.act('verifyBoxPartnerCode', grant);
  assert.equal(result.authorized, true);
}
function expectBlocked(f, type, payload) {
  const before = money(f.state), result = applyAction(f.state, type, { boxId: f.box.id, ...payload });
  assert.equal(result.ok, false, `${type} should be blocked`);
  assert.equal(money(f.state), before, `${type} must not change recorded money`);
  return result;
}

test('a protected Money Box needs a fresh amount-bound approval and the owner PIN for each transfer', () => {
  const f = fixture(), before = money(f.state), grant = requestAndCode(f);
  assert.equal(money(f.state), before, 'Requesting or issuing a code does not move money.');
  expectBlocked(f, 'withdrawBox', { amount: 2000, requestId: grant.requestId, pin: '1234' });
  assert.equal(f.act('verifyBoxPartnerCode', { ...grant, idempotencyKey: 'one-code-verification' }).authorized, true);
  assert.equal(money(f.state), before, 'A verified code alone is not a payment.');
  expectBlocked(f, 'withdrawBox', { amount: 3000, requestId: grant.requestId, pin: '1234' });
  expectBlocked(f, 'withdrawBox', { amount: 2000, requestId: grant.requestId, pin: '0000' });
  const start = f.state.wallet;
  const paid = f.act('withdrawBox', { amount: 2000, requestId: grant.requestId, pin: '1234', idempotencyKey: 'one-authorised-transfer' });
  assert.equal(f.state.wallet, start + 2000); assert.equal(f.box.balance, 8000);
  const after = money(f.state);
  f.act('withdrawBox', { amount: 2000, requestId: grant.requestId, pin: '1234', idempotencyKey: 'one-authorised-transfer' });
  assert.equal(money(f.state), after);
  assert.equal(f.state.transactions.filter(tx => tx.id === paid.transaction.id).length, 1);
  expectBlocked(f, 'withdrawBox', { amount: 2000, requestId: grant.requestId, pin: '1234', idempotencyKey: 'different-reference' });
  expectBlocked(f, 'verifyBoxPartnerCode', { ...grant, idempotencyKey: 'one-code-verification' });
  const next = requestAndCode(f, 'withdrawal', { amount: 1000 });
  assert.notEqual(next.requestId, grant.requestId);
  expectBlocked(f, 'withdrawBox', { amount: 1000, requestId: next.requestId, pin: '1234' });
  assert.equal(hasBoxProtection(f.box), true, 'The first approval never unlocks the whole box.');
});

test('wrong codes, exhausted attempts, expired approvals and superseded requests never release savings', () => {
  const f = fixture(), before = money(f.state), first = requestAndCode(f);
  const wrong = first.code === '000000' ? '111111' : '000000';
  for (let index = 0; index < 5; index++) {
    const result = f.act('verifyBoxPartnerCode', { requestId: first.requestId, code: wrong });
    assert.equal(result.authorized, false);
  }
  expectBlocked(f, 'verifyBoxPartnerCode', first);
  const second = requestAndCode(f);
  const stored = f.box.protectionRequests.find(request => request.id === second.requestId);
  stored.expiresAt = '2000-01-01T00:00:00.000Z';
  assert.equal(f.act('verifyBoxPartnerCode', second).authorized, false);
  const third = requestAndCode(f); approve(f, third);
  const fourth = requestAndCode(f, 'withdrawal', { amount: 1500 });
  expectBlocked(f, 'withdrawBox', { amount: 2000, requestId: third.requestId, pin: '1234' });
  approve(f, fourth);
  f.box.protectionRequests.find(request => request.id === fourth.requestId).expiresAt = '2000-01-01T00:00:00.000Z';
  expectBlocked(f, 'withdrawBox', { amount: 1500, requestId: fourth.requestId, pin: '1234' });
  assert.equal(money(f.state), before);
});

test('pending and declined invitations do not activate protection and cannot impersonate acceptance', () => {
  const f = fixture({ accepted: false }), wallet = f.state.wallet;
  expectBlocked(f, 'requestBoxRelease', { kind: 'withdrawal', amount: 2500 });
  expectBlocked(f, 'respondBoxPartnerInvite', { decision: 'accepted' });
  expectBlocked(f, 'requestBoxProtection', { partner: replacement, pin: '1234' });
  f.act('withdrawBox', { amount: 2500 });
  f.act('respondBoxPartnerInvite', { invitationId: f.box.protection.invitationId, decision: 'declined' });
  assert.equal(hasBoxProtection(f.box), false);
  f.act('withdrawBox', { amount: 2500 });
  assert.equal(f.box.balance, 5000); assert.equal(f.state.wallet, wallet + 5000);
  assert.equal(f.box.protectionAudit.filter(entry => entry.type === 'partner-declined').length, 1);
});

test('an accepted mandate still needs verified support approval and a PIN for exactly one operation', () => {
  const f = fixture(), before = money(f.state);
  const request = f.act('requestBoxRelease', { kind: 'withdrawal', amount: 2500 });
  f.act('requestBoxSupportReview', { requestId: request.requestId });
  expectBlocked(f, 'withdrawBox', { amount: 2500, requestId: request.requestId, pin: '1234' });
  expectBlocked(f, 'verifyBoxSupport', { requestId: request.requestId, identityVerified: false, decision: 'approved' });
  assert.equal(money(f.state), before);
  const approval = f.act('verifyBoxSupport', { requestId: request.requestId, identityVerified: true, decision: 'approved' });
  assert.equal(approval.authorized, true);
  expectBlocked(f, 'withdrawBox', { amount: 3000, requestId: request.requestId, pin: '1234' });
  f.act('withdrawBox', { amount: 2500, requestId: request.requestId, pin: '1234' });
  assert.equal(f.box.balance, 7500); assert.equal(hasBoxProtection(f.box), true);
  expectBlocked(f, 'withdrawBox', { amount: 2500, requestId: request.requestId, pin: '1234' });
  assert.ok(f.box.protectionAudit.some(entry => entry.type === 'verified-support-approved'));
});

test('partner changes and protection removal require their own approval and cannot use generic box edits or deletion', () => {
  const f = fixture({ funded: false }), originalInvitation = f.box.protection.invitationId, before = money(f.state);
  expectBlocked(f, 'deleteBox', {});
  for (const payload of [{ protection: null }, { accountabilityPartner: null }, { accountabilityPartner: replacement }]) expectBlocked(f, 'updateBox', payload);
  const protection = structuredClone(f.box.protection);
  f.act('updateBox', { locked: false });
  assert.deepEqual(f.box.protection, protection, 'The personal lock does not change the partner mandate.');
  const change = requestAndCode(f, 'change-partner', { partner: replacement });
  expectBlocked(f, 'completeBoxProtectionChange', { requestId: change.requestId, pin: '1234' });
  approve(f, change);
  f.act('completeBoxProtectionChange', { requestId: change.requestId, pin: '1234' });
  assert.equal(f.box.protection.partner.phone, '0241112222'); assert.equal(f.box.protection.status, 'active'); assert.equal(f.box.pendingProtection.partner.phone, '0205551234'); assert.equal(f.box.pendingProtection.status, 'invited');
  expectBlocked(f, 'respondBoxPartnerInvite', { invitationId: originalInvitation, decision: 'accepted' });
  f.act('respondBoxPartnerInvite', { invitationId: f.box.pendingProtection.invitationId, decision: 'accepted' });
  assert.equal(f.box.protection.partner.phone, '0205551234'); assert.equal(f.box.pendingProtection, null);
  const remove = requestAndCode(f, 'remove-protection', {}); approve(f, remove);
  expectBlocked(f, 'completeBoxProtectionChange', { requestId: remove.requestId, pin: '0000' });
  f.act('completeBoxProtectionChange', { requestId: remove.requestId, pin: '1234' });
  assert.equal(hasBoxProtection(f.box), false); assert.equal(money(f.state), before);
  assert.ok(f.box.protectionAudit.some(entry => entry.type === 'partner-changed'));
  assert.ok(f.box.protectionAudit.some(entry => entry.type === 'protection-removed'));
  f.act('deleteBox'); assert.equal(f.state.boxes.some(box => box.id === f.box.id), false);
});

test('the partner projection uses verified request records and excludes private balances, goals and account data', () => {
  const f = fixture(), grant = requestAndCode(f), stored = f.box.protectionRequests.find(request => request.id === grant.requestId);
  const view = getPartnerRequestView(f.box, stored);
  assert.equal(view.boxName, 'Next semester'); assert.equal(view.amount, 2000); assert.equal(view.code, grant.code);
  for (const key of ['balance', 'target', 'wallet', 'transactions', 'settings', 'pin', 'budget', 'ious', 'protectionAudit']) assert.equal(Object.hasOwn(view, key), false, key);
  const forged = getPartnerRequestView(f.box, { ...stored, amount: 999999, code: '000000', status: 'approved' });
  assert.deepEqual(forged, view, 'A caller-supplied clone cannot invent amount, code or approval state.');
  assert.equal(Object.hasOwn(protectionSummary(f.box).pendingRequest, 'code'), false);
  assert.equal(getPartnerRequestView(f.box, { ...stored, id: 'foreign-request' }), null);
});

test('refresh preserves protection and its approval history without changing legacy Money Boxes or recorded money', () => {
  const f = fixture(), grant = requestAndCode(f); approve(f, grant);
  const before = money(f.state), legacy = structuredClone(f.state.boxes[0]);
  const descriptor = Object.getOwnPropertyDescriptor(globalThis, 'localStorage'); let raw;
  try {
    Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: { getItem: key => key === STORAGE_KEY ? raw : null, setItem: (key, value) => { if (key === STORAGE_KEY) raw = value; } } });
    assert.equal(saveState(f.state), true);
    const restored = loadState(), box = restored.boxes.find(box => box.id === f.box.id);
    assert.equal(money(restored), before); assert.equal(hasBoxProtection(box), true);
    assert.equal(box.protectionRequests.find(request => request.id === grant.requestId).status, 'approved');
    assert.deepEqual(restored.boxes[0], legacy); assert.equal(hasBoxProtection(restored.boxes[0]), false);
    commit(restored, 'withdrawBox', { boxId: box.id, amount: 2000, requestId: grant.requestId, pin: '1234' });
    assert.equal(box.balance, 8000);
    box.protection = { status: 'damaged', partner: null };
    assert.equal(saveState(restored), true); const recovered = loadState(), damaged = recovered.boxes.find(value => value.id === box.id);
    assert.equal(hasBoxProtection(damaged), true, 'Damaged protection metadata must not silently remove the protection.');
    const savedMoney = money(recovered);
    assert.equal(applyAction(recovered, 'withdrawBox', { boxId: damaged.id, amount: 1000, pin: '1234' }).ok, false);
    assert.equal(money(recovered), savedMoney);
    const recoveryRequest = commit(recovered, 'requestBoxRelease', { boxId: damaged.id, kind: 'withdrawal', amount: 1000 });
    assert.equal(applyAction(recovered, 'issueBoxPartnerCode', { boxId: damaged.id, requestId: recoveryRequest.requestId }).ok, false);
    commit(recovered, 'requestBoxSupportReview', { boxId: damaged.id, requestId: recoveryRequest.requestId });
    commit(recovered, 'verifyBoxSupport', { boxId: damaged.id, requestId: recoveryRequest.requestId, identityVerified: true, decision: 'approved' });
    commit(recovered, 'withdrawBox', { boxId: damaged.id, requestId: recoveryRequest.requestId, amount: 1000, pin: '1234' });
    assert.equal(damaged.balance, 7000);
    assert.equal(hasBoxProtection(damaged), true, 'Recovery approval is for one transfer, not a permanent unlock.');
  } finally { if (descriptor) Object.defineProperty(globalThis, 'localStorage', descriptor); else delete globalThis.localStorage; }
});

test('replacement invitations preserve the current mandate through decline and cancel, then invalidate its code on acceptance', () => {
  const f = fixture(), before = money(f.state), originalPartner = structuredClone(f.box.protection.partner);
  for (const decision of ['declined', 'cancelled', 'accepted']) {
    const change = requestAndCode(f, 'change-partner', { partner: replacement }); approve(f, change);
    f.act('completeBoxProtectionChange', { requestId: change.requestId, pin: '1234' });
    const invitation = f.box.pendingProtection;
    assert.equal(hasBoxProtection(f.box), true); assert.deepEqual(f.box.protection.partner, originalPartner);
    expectBlocked(f, 'withdrawBox', { amount: 2000 });
    expectBlocked(f, 'updateBox', { pendingProtection: null });
    const oldPartnerGrant = requestAndCode(f); approve(f, oldPartnerGrant);
    if (decision === 'cancelled') f.act('cancelBoxPartnerInvite', { invitationId: invitation.invitationId });
    else f.act('respondBoxPartnerInvite', { invitationId: invitation.invitationId, decision });
    if (decision !== 'accepted') {
      assert.deepEqual(f.box.protection.partner, originalPartner);
      assert.equal(f.box.protectionRequests.find(request => request.id === oldPartnerGrant.requestId).status, 'approved');
      expectBlocked(f, 'respondBoxPartnerInvite', { invitationId: invitation.invitationId, decision: 'accepted' });
    } else {
      assert.equal(f.box.protection.partner.phone, '0205551234'); assert.equal(f.box.pendingProtection, null);
      assert.equal(f.box.protectionRequests.find(request => request.id === oldPartnerGrant.requestId).status, 'superseded');
      expectBlocked(f, 'withdrawBox', { amount: 2000, requestId: oldPartnerGrant.requestId, pin: '1234' });
    }
    assert.equal(money(f.state), before);
  }
  assert.equal(f.box.protectionAudit.filter(entry => entry.type === 'partner-changed').length, 1);
});

test('saved pending and declined invitations migrate without locking savings or discarding old request history', () => {
  const descriptor = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
  try {
    for (const status of ['invited', 'declined', 'cancelled']) {
      const f = fixture({ accepted: false });
      f.box.protection.status = status;
      f.box.protectionRequests.push({ id: 'legacy-pending-release', status: 'pending', kind: 'withdrawal', amount: 1000 });
      f.box.protectionAudit.push({ id: 'legacy-audit', type: 'release-requested', at: '2026-11-01T12:00:00Z' });
      const before = money(f.state), requests = structuredClone(f.box.protectionRequests), audit = structuredClone(f.box.protectionAudit);
      Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: { getItem: key => key === STORAGE_KEY ? JSON.stringify(f.state) : null } });
      const restored = loadState(), saved = restored.boxes.find(box => box.id === f.box.id);
      assert.equal(hasBoxProtection(saved), false, status); assert.equal(protectionSummary(saved).status, status);
      assert.equal(money(restored), before); assert.deepEqual(saved.protectionRequests, requests); assert.deepEqual(saved.protectionAudit, audit);
      commit(restored, 'withdrawBox', { id: saved.id, amount: 1000 });
      assert.equal(saved.balance, 9000); assert.equal(saved.protectionRequests[0].status, 'pending');
    }
  } finally { if (descriptor) Object.defineProperty(globalThis, 'localStorage', descriptor); else delete globalThis.localStorage; }
});

test('damaged invitation-only records never become an accepted savings mandate during refresh', () => {
  const f = fixture({ accepted: false }), descriptor = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
  f.box.protection.partner = null;
  try {
    Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: { getItem: key => key === STORAGE_KEY ? JSON.stringify(f.state) : null } });
    const restored = loadState(), box = restored.boxes.find(box => box.id === f.box.id);
    assert.equal(hasBoxProtection(box), false); assert.equal(protectionSummary(box).invitationNeedsReview, true);
    assert.equal(getPartnerRequestView(box), null);
    commit(restored, 'withdrawBox', { id: box.id, amount: 1000 });
    assert.equal(box.balance, 9000);
  } finally { if (descriptor) Object.defineProperty(globalThis, 'localStorage', descriptor); else delete globalThis.localStorage; }
});

test('an invitation cannot activate after a goal rename but the owner can safely cancel and re-invite', () => {
  const f = fixture({ accepted: false }), invitationId = f.box.protection.invitationId;
  f.act('updateBox', { name: 'New goal name' });
  expectBlocked(f, 'respondBoxPartnerInvite', { invitationId, decision: 'accepted' });
  assert.equal(hasBoxProtection(f.box), false);
  f.act('cancelBoxPartnerInvite', { invitationId });
  f.act('requestBoxProtection', { partner: replacement, pin: '1234' });
  f.act('respondBoxPartnerInvite', { invitationId: f.box.protection.invitationId, decision: 'accepted' });
  assert.equal(hasBoxProtection(f.box), true); expectBlocked(f, 'withdrawBox', { amount: 1000 });
});
