import test from 'node:test';
import assert from 'node:assert/strict';
import { createEmptyState, getSummary } from '../dist/js/model.js';
import { createActivationDraft, restoreActivationDraft, acknowledgeCreatedAccount, requestActivationFunding, checkActivationFunding, retryActivationFunding, fundActivation, activationFundingStatus, normalizeActivationMobile, safeActivationStep, deferActivationFunding, addActivationBudgetItem } from '../dist/js/activation-model.js';
import { simulateActivationFundingReceipt, readDemoActivationFundingReceipt } from '../dist/js/activation-funding-demo.js';

const ok = r => { assert.equal(r.ok, true, r.message); return r; };
function draft() {
  const state = createEmptyState({ name: 'Ama', phone: '0240000000' }); state.onboardingDone = true;
  state.accounts = [{ type: 'operational', holderName: 'Ama Mensah', status: 'simulated-ready' }, { type: 'savings', accountNumber: '999999999999', status: 'ready' }];
  const d = createActivationDraft({ state }); ok(acknowledgeCreatedAccount(d)); return d;
}
const financial = d => JSON.stringify(d.state);
const request = (d, source = 'Mobile money') => ok(requestActivationFunding(d, { amount: 10000, source, phone: '0240000000', now: 1000 }));
function receipt(d, outcome = 'confirmed') { return ok(simulateActivationFundingReceipt(d, { outcome, now: 2000 })).receipt; }

test('both funding rails wait for a separate receipt and repeated checks never invent money', () => {
  for (const source of ['Mobile money', 'Bank transfer']) {
    const d = draft(), before = financial(d); request(d, source);
    assert.equal(activationFundingStatus(d), 'pending');
    assert.equal(d.fundingAttempt.source, source); assert.equal(d.fundingAttempt.amount, 10000);
    assert.equal(d.fundingAttempt.accountNumber, '000000000001');
    assert.notEqual(d.fundingAttempt.accountNumber, '999999999999');
    assert.equal(readDemoActivationFundingReceipt(d), null);
    for (const now of [1500, 2000, 60000]) {
      assert.equal(ok(checkActivationFunding(d, { now })).status, 'pending');
      assert.equal(financial(d), before);
      assert.equal(safeActivationStep(d, 'purpose'), 'fund');
      assert.equal(safeActivationStep(d, 'ready'), 'fund');
      assert.equal(getSummary(d.state).available, 0);
    }
    assert.equal(fundActivation(d, { amount: 10000, source }).ok, false);
    assert.equal(addActivationBudgetItem(d, { name: 'Food', amount: 1000 }).ok, false);
    assert.equal(deferActivationFunding(d).ok, false);
    assert.equal(financial(d), before);
  }
});

test('mobile-money requests validate Ghana numbers without restricting bank transfers to a phone', () => {
  for (const input of ['0240000000', '024 000 0000', '+233 24 000 0000', '233240000000']) assert.equal(normalizeActivationMobile(input), '0240000000');
  for (const input of ['', '123', '024000000', '02400000000', '0340000000', 'letters']) {
    assert.equal(normalizeActivationMobile(input), '');
    const d = draft(), before = JSON.stringify(d);
    assert.equal(requestActivationFunding(d, { amount: 10000, source: 'Mobile money', phone: input }).ok, false);
    assert.equal(JSON.stringify(d), before);
  }
  const d = draft(); ok(requestActivationFunding(d, { amount: 10000, source: 'Bank transfer' }));
  assert.equal(d.fundingAttempt.phone, ''); assert.equal(d.state.wallet, 0);
});

test('an outstanding request has a stable identity and blocks a second amount, phone or rail', () => {
  const d = draft(); request(d); const before = JSON.stringify(d), id = d.fundingAttempt.id;
  assert.equal(ok(requestActivationFunding(d, { amount: 10000, source: 'Mobile money', phone: '+233240000000' })).attemptId, id);
  assert.equal(JSON.stringify(d), before);
  for (const payload of [{ amount: 20000, source: 'Mobile money', phone: '0240000000' }, { amount: 10000, source: 'Mobile money', phone: '0550000000' }, { amount: 10000, source: 'Bank transfer' }]) {
    assert.equal(requestActivationFunding(d, payload).ok, false); assert.equal(JSON.stringify(d), before);
  }
  assert.equal(retryActivationFunding(d).ok, false); assert.equal(JSON.stringify(d), before);
});

test('only an exact matching receipt can credit the requested account once', () => {
  for (const source of ['Mobile money', 'Bank transfer']) {
    const d = draft(); request(d, source); const confirmation = receipt(d), before = financial(d);
    assert.equal(financial(d), before, 'creating a demo provider event does not credit the account');
    for (const change of [{ attemptId: 'old-request' }, { amount: 10001 }, { accountNumber: '999999999999' }, { source: 'Cash' }, { rail: 'wrong-rail' }, { providerReference: '' }, { mode: 'unverified' }]) {
      const snapshot = JSON.stringify(d);
      assert.equal(checkActivationFunding(d, { receipt: { ...confirmation, ...change } }).ok, false);
      assert.equal(JSON.stringify(d), snapshot);
    }
    ok(checkActivationFunding(d, { receipt: confirmation, now: 2500 }));
    assert.equal(activationFundingStatus(d), 'confirmed'); assert.equal(d.step, 'fund');
    assert.equal(d.state.wallet, 10000); assert.equal(d.state.transactions.length, 1);
    assert.equal(d.state.transactions[0].rail, source === 'Mobile money' ? 'momo' : 'bank');
    const confirmedMoney = financial(d);
    ok(checkActivationFunding(d, { receipt: confirmation })); ok(checkActivationFunding(d));
    ok(fundActivation(d, { amount: 99999, source: 'Other' }));
    assert.equal(financial(d), confirmedMoney);
    assert.equal(safeActivationStep(d, 'fund'), 'fund');
  }
});

test('JSON restoration retains a pending request and its separate provider event without crediting it', () => {
  const d = draft(); request(d); const before = financial(d), id = d.fundingAttempt.id;
  const savedPending = restoreActivationDraft(JSON.parse(JSON.stringify(d)));
  assert.equal(savedPending.fundingAttempt.id, id); assert.equal(activationFundingStatus(savedPending), 'pending');
  assert.equal(ok(checkActivationFunding(savedPending)).status, 'pending'); assert.equal(financial(savedPending), before);
  receipt(savedPending);
  const restoredEvent = restoreActivationDraft(JSON.parse(JSON.stringify(savedPending)));
  assert.equal(financial(restoredEvent), before);
  ok(checkActivationFunding(restoredEvent, { receipt: readDemoActivationFundingReceipt(restoredEvent) }));
  const restoredCredit = restoreActivationDraft(JSON.parse(JSON.stringify(restoredEvent))), wallet = restoredCredit.state.wallet;
  ok(checkActivationFunding(restoredCredit, { receipt: readDemoActivationFundingReceipt(restoredCredit) }));
  assert.equal(restoredCredit.state.wallet, wallet); assert.equal(restoredCredit.state.transactions.length, 1);
});

test('resolved failures preserve zero money and require an explicit retry with a new identity', () => {
  for (const outcome of ['failed', 'expired']) {
    const d = draft(); request(d); const before = financial(d), oldId = d.fundingAttempt.id, oldReceipt = receipt(d, outcome);
    assert.equal(financial(d), before);
    assert.equal(ok(checkActivationFunding(d, { receipt: oldReceipt })).status, outcome);
    assert.equal(activationFundingStatus(d), outcome); assert.equal(financial(d), before);
    assert.equal(safeActivationStep(d, 'purpose'), 'fund');
    assert.equal(requestActivationFunding(d, { amount: 10000, source: 'Bank transfer' }).ok, false);
    ok(retryActivationFunding(d)); assert.equal(activationFundingStatus(d), 'idle');
    assert.equal(d.fundingHistory.length, 1); assert.equal(d.fundingHistory[0].id, oldId);
    request(d, 'Bank transfer'); assert.notEqual(d.fundingAttempt.id, oldId);
    assert.equal(checkActivationFunding(d, { receipt: { ...oldReceipt, status: 'confirmed' } }).ok, false);
    assert.equal(financial(d), before);
    ok(checkActivationFunding(d, { receipt: receipt(d) })); assert.equal(d.state.wallet, 10000); assert.equal(d.state.transactions.length, 1);
  }
});

test('a confirmation flag without its matching money record never unlocks the plan', () => {
  const d = draft(); request(d); d.fundingAttempt.status = 'confirmed';
  assert.equal(activationFundingStatus(d), 'idle'); assert.equal(safeActivationStep(d, 'purpose'), 'fund');
  assert.equal(d.state.wallet, 0); assert.equal(d.state.transactions.length, 0);
});

test('a mismatched ledger amount or rail cannot stand in for the confirmed funding receipt', () => {
  for (const change of [transaction => { transaction.amount += 1; }, transaction => { transaction.rail = 'other'; }]) {
    const d = draft(); request(d); ok(checkActivationFunding(d, { receipt: receipt(d) }));
    change(d.state.transactions[0]);
    assert.notEqual(activationFundingStatus(d), 'confirmed');
    assert.equal(safeActivationStep(d, 'purpose'), 'fund');
    assert.equal(addActivationBudgetItem(d, { name: 'Food', amount: 1000 }).ok, false);
  }
});

test('changing the operational account cannot redirect an existing receipt into another account', () => {
  const d = draft(); request(d); const confirmation = receipt(d), before = financial(d);
  d.state.accounts[0].demoNumber = '100200300400'; const changed = financial(d);
  assert.notEqual(changed, before);
  assert.equal(checkActivationFunding(d, { receipt: confirmation }).ok, false);
  assert.equal(financial(d), changed); assert.equal(d.state.wallet, 0);
});
