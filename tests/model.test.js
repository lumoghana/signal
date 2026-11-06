import test from 'node:test';
import assert from 'node:assert/strict';
import { createDemoState, createEmptyState, getSummary, evaluatePayment, applyAction, loadState, saveState, STORAGE_KEY } from '../dist/js/model.js';

const run = (s, type, payload) => { const r = applyAction(s, type, payload); assert.equal(r.ok, true, r.message); return r; };

test('demo shows actual money separately from expected money and group funds', () => {
  const s = createDemoState();
  const q = getSummary(s);
  assert.deepEqual({ available: q.available, planned: q.planned, spendable: q.spendable, savings: q.savings, total: q.total, expected: q.expected }, { available: 248000, planned: 110000, spendable: 128000, savings: 74000, total: 322000, expected: 159000 });
  assert.equal(s.groups[0].balance, 90000);
});

test('incoming IOUs do not affect spending until actually received, including partial repayment', () => {
  const s = createDemoState(), before = getSummary(s);
  run(s, 'createIOU', { name: 'Kojo', type: 'owedToMe', amount: 7000, due: '2026-11-02' });
  assert.equal(getSummary(s).available, before.available);
  assert.equal(getSummary(s).planned, before.planned);
  assert.equal(getSummary(s).expected, before.expected + 7000);
  const iou = s.ious.at(-1);
  const receipt = run(s, 'fund', {amount:3000,source:iou.name});
  run(s, 'settleIOU', { id: iou.id, amount: 3000, receiptTransactionId:receipt.id });
  assert.equal(s.wallet, before.available + 3000);
  assert.equal(iou.paid, 3000);
  assert.equal(iou.status, 'open');
  assert.equal(getSummary(s).expected, before.expected + 4000);
  const finalReceipt = run(s, 'fund', {amount:4000,source:iou.name});
  run(s, 'settleIOU', { id: iou.id,receiptTransactionId:finalReceipt.id });
  assert.equal(iou.status, 'settled');
  assert.equal(s.wallet, before.available + 7000);
  assert.equal(applyAction(s, 'settleIOU', { id: iou.id }).ok, false);
});

test('outgoing due IOUs reserve actual money and settlement releases the obligation once', () => {
  const s = createDemoState();
  const before = getSummary(s);
  const { iou } = run(s, 'createIOU', { name: 'Adwoa', type: 'owedByMe', amount: 8000, due: s.income.nextDate });
  assert.equal(getSummary(s).planned, before.planned + 8000);
  assert.equal(getSummary(s).spendable, before.spendable - 8000);
  run(s, 'settleIOU', { id: iou.id });
  assert.equal(getSummary(s).planned, before.planned);
  assert.equal(getSummary(s).spendable, before.spendable - 8000);
});

test('editing an IOU total down to money already repaid closes it without moving more funds', () => {
  const s = createDemoState(), iou = s.ious[0];
  const receipt = run(s, 'fund', {amount:3000,source:iou.name});
  run(s, 'settleIOU', { id: iou.id, amount: 3000, receiptTransactionId:receipt.id });
  const wallet = s.wallet;
  run(s, 'createIOU', { id: iou.id, amount: 3000 });
  assert.equal(iou.status, 'settled'); assert.equal(iou.paid, iou.amount);
  assert.equal(s.wallet, wallet);
  assert.equal(applyAction(s, 'settleIOU', { id: iou.id }).ok, false);
});

test('a budget reserves funds without moving wallet or savings', () => {
  const s = createEmptyState(); s.wallet = 100000;
  run(s, 'createBudget', { items: [{ name: 'Food', amount: 30000, due: '2026-11-12' }] });
  assert.equal(s.wallet, 100000);
  assert.equal(getSummary(s).savings, 0);
  assert.equal(getSummary(s).spendable, 60000);
});

test('budgeted payment reduces wallet and remaining budget, keeping flexible money consistent', () => {
  const s = createDemoState();
  const before = getSummary(s);
  const preview = evaluatePayment(s, { amount: 2000, category: 'Food' });
  assert.equal(preview.afterSpendable, before.spendable);
  assert.equal(preview.needed, false);
  run(s, 'payment', { recipient: 'Gɔbɛ Spot', amount: 2000, category: 'Food' });
  assert.equal(s.wallet, before.available - 2000);
  assert.equal(getSummary(s).planned, before.planned - 2000);
  assert.equal(getSummary(s).spendable, before.spendable);
});

test('standard conversational budget names match payment categories in both directions', () => {
  const s = createEmptyState(); s.wallet = 100000;
  run(s, 'createBudget', { items: [
    { name: 'Food & groceries', amount: 20000 },
    { name: 'Data & airtime', amount: 10000 },
    { name: 'Fees & essentials', amount: 10000 },
  ] });
  const before = getSummary(s).spendable;
  for (const category of ['Food', 'Data', 'Essentials']) {
    const preview = evaluatePayment(s, { amount: 1000, category });
    assert.equal(preview.budgetAllocation, 1000);
    run(s, 'payment', { recipient: 'Demo merchant', amount: 1000, category });
  }
  assert.equal(getSummary(s).spendable, before);
});

test('category spending records the entire overspend and later payments, not just its consumed reservation', () => {
  const s = createDemoState(), food = s.budget.items.find(i => i.id === 'food');
  const before = getSummary(s);
  const first = run(s, 'payment', { recipient: 'Food seller', amount: 60000, category: 'Food' });
  assert.equal(first.transaction.budgetAllocation, 45000);
  assert.equal(first.transaction.budgetSpentAmount, 60000);
  assert.equal(food.spent, 70000);
  assert.equal(getSummary(s).planned, before.planned - 45000);
  const second = run(s, 'payment', { recipient: 'Food seller', amount: 2000, category: 'Food' });
  assert.equal(second.transaction.budgetAllocation, 0);
  assert.equal(second.transaction.budgetSpentAmount, 2000);
  assert.equal(food.spent, 72000);
  run(s, 'reversePayment', { id: first.id });
  assert.equal(food.spent, 12000);
  assert.equal(getSummary(s).planned, before.planned - 2000);
  run(s, 'reversePayment', { id: second.id });
  assert.equal(food.spent, 10000);
  assert.equal(getSummary(s).planned, before.planned);
  assert.equal(getSummary(s).available, before.available);
});

test('failed pending overspend restores its full spent amount while retaining later successful spending', () => {
  const s = createDemoState(), food = s.budget.items.find(i => i.id === 'food');
  const before = getSummary(s);
  const pending = run(s, 'payment', { recipient: 'Food seller', amount: 60000, category: 'Food', status: 'pending' });
  assert.equal(food.spent, 70000);
  run(s, 'payment', { recipient: 'Food seller', amount: 2000, category: 'Food' });
  assert.equal(food.spent, 72000);
  run(s, 'resolvePayment', { id: pending.id, status: 'failed' });
  assert.equal(food.spent, 12000);
  assert.equal(getSummary(s).planned, before.planned - 2000);
  assert.equal(s.wallet, before.available - 2000);
  assert.equal(applyAction(s, 'resolvePayment', { id: pending.id, status: 'failed' }).ok, false);
  assert.equal(food.spent, 12000);
});

test('an immediately failed overspend records neither actual spend nor reserved allocation', () => {
  const s = createDemoState(), food = s.budget.items.find(i => i.id === 'food');
  const before = getSummary(s);
  const { transaction } = run(s, 'payment', { recipient: 'Food seller', amount: 60000, category: 'Food', status: 'failed' });
  assert.equal(food.spent, 10000);
  assert.equal(transaction.budgetAllocation, 0);
  assert.equal(transaction.budgetSpentAmount, 0);
  assert.deepEqual(getSummary(s), before);
});

test('large discretionary and planned-money purchases trigger an informative pause', () => {
  const s = createDemoState();
  const large = evaluatePayment(s, { amount: 30000, category: 'Shopping' });
  assert.equal(large.needed, true); assert.ok(large.daysImpact > 0);
  const planned = evaluatePayment(s, { amount: 200000, category: 'Other' });
  assert.equal(planned.needed, true); assert.ok(planned.rawAfterSpendable < 0);
  const impossible = evaluatePayment(s, { amount: s.wallet + 1 });
  assert.equal(impossible.allowed, false); assert.equal(impossible.needed, false);
});

test('expired plan coverage suspends daily guide independently of expected income', () => {
  const s = createDemoState(), before = getSummary(s);
  s.income.nextDate = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
  assert.equal(getSummary(s).daysLeft,before.daysLeft,'late income must not silently rewrite plan coverage');
  s.budget.endDate = s.income.nextDate;
  const after = getSummary(s);
  assert.equal(after.daysLeft, 0); assert.equal(after.dailyAllowance, 0);
  assert.equal(after.available, before.available); assert.equal(after.savings, before.savings);
  assert.equal(after.expected, before.expected);
  s.budget.endDate = new Date().toISOString().slice(0, 10);
  assert.equal(getSummary(s).daysLeft, 1);
});

test('failed payment does not debit money or consume budget; pending holds once and failed resolution releases it', () => {
  const s = createDemoState(); const original = getSummary(s);
  run(s, 'payment', { recipient: 'Test merchant', category: 'Food', amount: 4000, status: 'failed' });
  assert.deepEqual(getSummary(s), original);
  const { transaction } = run(s, 'payment', { recipient: 'Test merchant', category: 'Food', amount: 4000, status: 'pending' });
  assert.equal(s.wallet, original.available - 4000);
  assert.equal(getSummary(s).planned, original.planned - 4000);
  run(s, 'resolvePayment', { id: transaction.id, status: 'failed' });
  assert.equal(s.wallet, original.available);
  assert.equal(getSummary(s).planned, original.planned);
  assert.equal(applyAction(s, 'resolvePayment', { id: transaction.id, status: 'failed' }).ok, false);
});

test('idempotency protects both payment and savings and rejects changed payload reuse', () => {
  const s = createDemoState(); const wallet = s.wallet;
  const p = { recipient: 'Kojo', amount: 10000, category: 'Other', idempotencyKey: 'payment-one' };
  const a = run(s, 'payment', p), b = run(s, 'payment', p);
  assert.equal(a.id, b.id); assert.equal(b.duplicate, true); assert.equal(s.wallet, wallet - 10000);
  assert.equal(applyAction(s, 'payment', { ...p, amount: 20000 }).ok, false);
  run(s, 'reversePayment', { id: a.id });
  assert.equal(s.wallet, wallet);
  assert.equal(applyAction(s, 'reversePayment', { id: a.id }).ok, false);
});

test('savings transfers conserve total owned money and locks prevent withdrawal', () => {
  const s = createDemoState(); const total = getSummary(s).total;
  const box = s.boxes[0]; const original = box.balance;
  run(s, 'contributeBox', { id: box.id, amount: 5000, idempotencyKey: 'save-once' });
  run(s, 'contributeBox', { id: box.id, amount: 5000, idempotencyKey: 'save-once' });
  assert.equal(box.balance, original + 5000); assert.equal(getSummary(s).total, total);
  run(s, 'updateBox', { id: box.id, locked: true });
  assert.equal(applyAction(s, 'withdrawBox', { id: box.id, amount: 1000 }).ok, false);
  run(s, 'updateBox', { id: box.id, locked: false });
  run(s, 'withdrawBox', { id: box.id, amount: 5000 });
  assert.equal(box.balance, original); assert.equal(getSummary(s).total, total);
  assert.equal(applyAction(s, 'deleteBox', { id: box.id }).ok, false);
});

test('saving hacks only run on confirmed spending and cannot use reserved funds', () => {
  const s = createDemoState(); const box = s.boxes[0]; const balance = box.balance;
  const { transaction } = run(s, 'payment', { recipient: 'Food seller', amount: 2550, category: 'Food', status: 'pending' });
  assert.equal(box.balance, balance);
  run(s, 'resolvePayment', { id: transaction.id, status: 'success' });
  assert.equal(box.balance, balance + 50);
  assert.equal(applyAction(s, 'resolvePayment', { id: transaction.id, status: 'success' }).ok, false);
  s.wallet = getSummary(s).planned + s.buffer;
  const before = box.balance;
  run(s, 'payment', { recipient: 'Shop', amount: 50, category: 'Other' });
  assert.equal(box.balance, before);
});

test('payment refunds preserve separately saved hack money and total personal money', () => {
  const s = createDemoState(), before = getSummary(s), box = s.boxes[0], initialBox = box.balance;
  const { transaction } = run(s, 'payment', { recipient: 'Food seller', amount: 2550, category: 'Food' });
  assert.equal(box.balance, initialBox + 50);
  run(s, 'reversePayment', { id: transaction.id });
  assert.equal(s.wallet, before.available - 50);
  assert.equal(box.balance, initialBox + 50);
  assert.equal(getSummary(s).total, before.total);
  assert.equal(getSummary(s).planned, before.planned);
  assert.equal(s.transactions.filter(t => t.parentPaymentId === transaction.id).length, 1);
});

test('group contributions leave personal money and payouts require distinct authorised approvals', () => {
  const s = createDemoState(), group = s.groups[0], before = getSummary(s);
  run(s, 'contributeGroup', { id: group.id, amount: 5000 });
  assert.equal(s.wallet, before.available - 5000); assert.equal(group.balance, 95000);
  assert.equal(getSummary(s).total, before.total - 5000);
  const { payout } = run(s, 'requestPayout', { id: group.id, amount: 20000, recipient: 'Ama Mensah', rail: 'bank', bank:'GCB Bank', destination:'1234567890123' });
  assert.equal(group.balance, 95000);
  assert.equal(applyAction(s, 'executePayout', { id: group.id, payoutId: payout.id }).ok, false);
  run(s, 'reviewPayout', { id:group.id, payoutId:payout.id });
  run(s, 'approvePayout', { id: group.id, payoutId: payout.id, approverId: 'me' });
  assert.equal(applyAction(s, 'approvePayout', { id: group.id, payoutId: payout.id, approverId: 'me' }).ok, false);
  assert.equal(applyAction(s, 'approvePayout', { id: group.id, payoutId: payout.id, approverId: 'akos' }).ok, false);
  assert.equal(applyAction(s, 'approvePayout', { id: group.id, payoutId: payout.id, approverId: 'senam' }).ok, false);
  run(s, 'setGroupParticipant', { id: group.id, memberId: 'senam' });
  run(s, 'reviewPayout', { id:group.id, payoutId:payout.id });
  run(s, 'approvePayout', { id: group.id, payoutId: payout.id, approverId: 'senam' });
  run(s, 'executePayout', { id: group.id, payoutId: payout.id });
  assert.equal(payout.status, 'processing'); assert.equal(group.balance, 95000);
  run(s, 'settleGroupPayout', { id: group.id, payoutId: payout.id, outcome: 'success' });
  assert.equal(group.balance, 74900); assert.equal(s.wallet, before.available - 5000);
  assert.equal(applyAction(s, 'executePayout', { id: group.id, payoutId: payout.id }).ok, false);
});

test('competing payout requests cannot overcommit collection funds', () => {
  const s = createDemoState(), group = s.groups[0];
  run(s, 'requestPayout', { id: group.id, amount: 80000, recipient: 'Hostel' });
  assert.equal(applyAction(s, 'requestPayout', { id: group.id, amount: 20000, recipient: 'Bus' }).ok, false);
});

test('cancelling a payout releases its reservation and members can join without invented funds', () => {
  const s = createDemoState(), group = s.groups[0], wallet = s.wallet;
  const { payout } = run(s, 'requestPayout', { id: group.id, amount: 80000, recipient: 'Hostel', destination: 'Demo account' });
  assert.equal(payout.destination, 'Demo account');
  run(s, 'cancelPayout', { id: group.id, payoutId: payout.id });
  run(s, 'requestPayout', { id: group.id, amount: 80000, recipient: 'Bus' });
  const { member } = run(s, 'addGroupMember', { id: group.id, name: 'Esi', role: 'approver' });
  assert.equal(member.amount, 0); assert.equal(member.status, 'invited'); assert.equal(group.balance, 90000); assert.equal(s.wallet, wallet);
  assert.equal(group.mandate.approvers.length, 4); assert.ok(group.mandate.approvers.includes(member.id)); assert.equal(group.mandate.threshold, 2);
});

test('reversing an outgoing IOU payment restores the open obligation', () => {
  const s = createDemoState();
  const iou = s.ious.find(i => i.type === 'owedByMe');
  const wallet = s.wallet;
  const { transaction } = run(s, 'settleIOU', { id: iou.id });
  assert.equal(iou.status, 'settled');
  run(s, 'reversePayment', { id: transaction.id });
  assert.equal(iou.status, 'open'); assert.equal(iou.paid, 0); assert.equal(s.wallet, wallet);
});

test('all idempotency references including prototype-like names remain safe', () => {
  const s = createDemoState(), wallet = s.wallet;
  for (const idempotencyKey of ['__proto__', 'constructor', 'toString']) {
    run(s, 'fund', { amount: 100, idempotencyKey });
    const repeat = run(s, 'fund', { amount: 100, idempotencyKey });
    assert.equal(repeat.duplicate, true);
  }
  assert.equal(s.wallet, wallet + 300);
});

test('buffer edits update the financial guide without moving funds', () => {
  const s = createDemoState(), before = getSummary(s);
  run(s, 'updateProfile', { buffer: 20000 });
  assert.equal(getSummary(s).available, before.available);
  assert.equal(getSummary(s).spendable, before.spendable - 10000);
  run(s, 'settings', { buffer: 10000 });
  assert.equal(getSummary(s).spendable, before.spendable);
});

test('recovery changes plans without creating income or counting an expected allowance', () => {
  const s = createDemoState(), before = s.wallet;
  run(s, 'recoveryPlan', { nextDate: '2026-11-20', reduceCategories: [{ id: 'food', amount: 20000 }], days: 20 });
  assert.equal(s.wallet, before); assert.equal(s.budget.items[0].amount, 30000);
  assert.equal(s.income.amount, 150000); assert.equal(s.recovery.active, true);
});

test('invalid monetary mutations fail atomically', () => {
  const s = createDemoState();
  for (const amount of [-1, 0, 1.5, Infinity, NaN, '100', 1000000000000]) {
    const before = JSON.stringify(s);
    assert.equal(applyAction(s, 'fund', { amount }).ok, false);
    assert.equal(JSON.stringify(s), before);
  }
  const before = JSON.stringify(s.budget);
  assert.equal(applyAction(s, 'updateBudget', { items: [{ name: 'Good', amount: 100 }, { name: 'Bad', amount: -1 }] }).ok, false);
  assert.equal(JSON.stringify(s.budget), before);
});

test('safe storage survives unavailable, corrupt and full localStorage', () => {
  const previous = globalThis.localStorage;
  try {
    delete globalThis.localStorage;
    assert.equal(loadState().onboardingDone, false); assert.equal(saveState(createDemoState()), false);
    const values = new Map();
    globalThis.localStorage = { getItem: key => values.get(key), setItem: (key, value) => values.set(key, value) };
    assert.equal(saveState(createDemoState()), true); assert.equal(loadState().wallet, 248000);
    values.set(STORAGE_KEY, '{bad'); assert.equal(loadState().wallet, 0);
    values.set(STORAGE_KEY, JSON.stringify({ version: 1, wallet: -1 })); assert.equal(loadState().wallet, 0);
    globalThis.localStorage = { getItem: () => { throw Error('blocked'); }, setItem: () => { throw Error('full'); } };
    assert.equal(loadState().wallet, 0); assert.equal(saveState(createDemoState()), false);
  } finally { if (previous === undefined) delete globalThis.localStorage; else globalThis.localStorage = previous; }
});
