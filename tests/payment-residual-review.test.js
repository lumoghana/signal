import test from 'node:test';
import assert from 'node:assert/strict';
import { createEmptyState, applyAction, evaluatePayment } from '../dist/js/model.js';
import { renderPayments, bindPayments, cancelRecipientEditOnExit, paymentReceiptText } from '../dist/js/payments.js';
import { getPauseAlternatives } from '../dist/js/pause-intelligence.js';
import { evaluatePauseHistory } from '../dist/js/pause-history.js';
import { prepareServicePayment } from '../dist/js/payment-catalog.js';
import { reviewOutflowImpact } from '../dist/js/outflow-impact.js';

function account() {
  const state = createEmptyState({ name: 'Ama' });
  state.onboardingDone = true; state.wallet = 60000; state.buffer = 10000;
  state.budget.created = true;
  state.budget.items = [{ id: 'food', name: 'Food', amount: 60000, spent: 0 }];
  return state;
}
const act = (state, type, payload) => { const result = applyAction(state, type, payload); assert.equal(result.ok, true, result.message); return result; };

test('Pause names an unchanged pre-existing gap instead of saying a planned payment caused it', () => {
  const state = account(), draft = { amount: 20000, category: 'Food', recipient: { name: 'Food stall' }, rail: 'lumo' };
  const before = JSON.stringify(state), impact = evaluatePayment(state, draft);
  assert.equal(impact.baselineShortfall, 10000); assert.equal(impact.additionalShortfall, 0);
  assert.match(impact.reason, /already has a shortfall/);
  const html = renderPayments({ state, draft: { payment: draft } }, { section: 'pay', page: 'pause' });
  assert.match(html, /Your plan is already/); assert.match(html, /GH₵100<\/strong>/);
  assert.match(html, /This payment leaves that gap unchanged/); assert.doesNotMatch(html, /This payment would use/);
  const alternatives = getPauseAlternatives(state, draft);
  assert.equal(alternatives.baselineShortfall, 10000); assert.equal(alternatives.additionalShortfall, 0);
  assert.equal(alternatives.safeAmount, 0); assert.equal(alternatives.shortfall, 10000);
  assert.equal(JSON.stringify(state), before);
});

test('a new unplanned payment attributes only its added gap while retaining the prior gap', () => {
  const state = account(), draft = { amount: 5000, category: 'Other', recipient: { name: 'Kofi' }, rail: 'lumo' };
  const impact = evaluatePayment(state, draft);
  assert.equal(impact.baselineShortfall, 10000); assert.equal(impact.additionalShortfall, 5000);
  assert.match(impact.reason, /increase the existing shortfall/);
  const html = renderPayments({ state, draft: { payment: draft } }, { section: 'pay', page: 'pause' });
  assert.match(html, /This payment would use/); assert.match(html, /GH₵50<\/strong>/);
  assert.match(html, /already has a GH₵100.00 gap/);
  assert.doesNotMatch(html, /GH₵150<\/strong>/, 'the whole gap is not blamed on this payment');
});

test('other personal outflow reviews separate the baseline gap from the added gap without moving money', () => {
  const state = account(), before = JSON.stringify(state); let html = '';
  const ctx = { state, toast() {}, closeSheet() {}, sheet: (content, bind) => { html = content; bind({ querySelector: () => ({ addEventListener() {} }) }); } };
  reviewOutflowImpact(ctx, { amount: 5000, category: 'Other' });
  assert.match(html, /already has a GH₵100.00 gap/); assert.match(html, /adds GH₵50.00 to that gap/);
  assert.doesNotMatch(html, /This uses GH₵150.00/); assert.equal(JSON.stringify(state), before);
});

test('repeat-service evidence uses the provider and actual account reference, not its shared name', () => {
  const state = createEmptyState(); state.wallet = 100000; state.buffer = 0;
  const service = phone => ({ ...prepareServicePayment('airtime', { network: 'MTN', phone, amountText: '60' }).payment, serviceId: 'airtime', paymentKind: 'service' });
  for (const phone of ['0240000000', '0240000001']) {
    const d = service(phone); act(state, 'payment', { ...d, merchant: d.recipient.name });
  }
  const otherAccount = { ...service('0240000002'), amount: 1000 };
  assert.equal(evaluatePauseHistory(state, otherAccount).signals.some(s => s.id === 'repeat-recipient'), false);
  const firstAccount = service('0240000000'); act(state, 'payment', { ...firstAccount, merchant: firstAccount.recipient.name });
  const sameAccount = { ...service('0240000000'), amount: 1000 };
  const history = evaluatePauseHistory(state, sameAccount);
  assert.equal(history.signals[0].id, 'repeat-recipient'); assert.match(history.reason, /this service account/);
  const html = renderPayments({ state, draft: { payment: sameAccount } }, { section: 'pay', page: 'pause' });
  assert.match(html, /this service account/); assert.doesNotMatch(html, /this person/);
});

test('repeated bank numbers are qualified by bank; phone formatting does not split the same MoMo identity', () => {
  const state = createEmptyState(); state.wallet = 100000; state.buffer = 0;
  const now = new Date();
  state.transactions = [1, 2].map(id => ({ id: String(id), type: 'payment', status: 'success', direction: 'out', amount: 6000, at: now.toISOString(), rail: 'bank', recipient: { name: 'Ama', number: '0123456789', bank: 'GCB Bank' } }));
  const request = { amount: 1000, rail: 'bank', recipient: { name: 'Ama', number: '0123456789', bank: 'Ecobank Ghana' } };
  assert.equal(evaluatePauseHistory(state, request).signals.some(s => s.id === 'repeat-recipient'), false);
  request.recipient.bank = 'GCB Bank'; assert.equal(evaluatePauseHistory(state, request).signals[0].id, 'repeat-recipient');
  for (const tx of state.transactions) { tx.rail = 'momo'; tx.recipient = { name: 'Ama', number: '024 000 0000' }; }
  assert.equal(evaluatePauseHistory(state, { amount: 1000, rail: 'momo', recipient: { name: 'Ama', number: '+233240000000' } }).signals[0].id, 'repeat-recipient');
});

test('external split receipts are records, never Lumo payment confirmations', () => {
  for (const method of ['cash', 'other']) {
    const state = account(), wallet = state.wallet;
    const split = act(state, 'createExpenseSplit', { amount: 6000, purpose: 'Printing', members: [{ id: 'me', name: 'Me', isMe: true }, { id: 'kofi', name: 'Kofi' }] }).split;
    const tx = act(state, 'settleSplitShare', { splitId: split.id, memberId: 'kofi', method }).transaction;
    for (const page of ['transaction', 'status']) {
      const html = renderPayments({ state, draft: {} }, { section: 'pay', page, id: tx.id });
      assert.match(html, /Outside repayment recorded/); assert.match(html, /expense-share repayment/);
      assert.match(html, /Lumo balance unchanged/); assert.doesNotMatch(html, /Money sent|All done|A little reply|pay-simulate/);
    }
    const shared = paymentReceiptText(tx);
    assert.match(shared, /^Outside repayment recorded/); assert.match(shared, /Expense: Printing/);
    assert.match(shared, /Lumo balance unchanged/); assert.doesNotMatch(shared, /^Lumo payment/);
    assert.equal(state.wallet, wallet);
  }
});

function editingHarness() {
  const handlers = new Map(), state = account();
  const payment = { amount: 2000, amountText: '20', category: 'Food', note: 'Lunch', rail: 'lumo', recipient: { id: 'kofi', name: 'Kofi' }, idempotencyKey: 'edit-original' };
  const ctx = { state, draft: { payment }, route: { section: 'pay', page: 'review' }, $: () => null,
    $$: selector => [{ addEventListener: (event, fn) => handlers.set(selector, fn) }],
    setCapture() {}, saveDraft() {}, closeSheet() {}, refresh() {}, go() {}, toast() {}, auth() {} };
  bindPayments(ctx, ctx.route); handlers.get('[data-action="pay-edit-amount"]')();
  return { ctx, handlers, payment };
}

test('Cancel edit restores category, optional budget and remember choice as well as amount and recipient', () => {
  const { ctx, handlers, payment } = editingHarness();
  payment.amount = 3000; payment.category = 'Data'; payment.categoryExplicit = true; payment.budgetItemId = 'data'; payment.rememberCategory = true; payment.note = 'Edited';
  handlers.get('[data-action="pay-cancel-edit"]')();
  assert.equal(payment.amount, 2000); assert.equal(payment.category, 'Food'); assert.equal(payment.note, 'Lunch');
  for (const key of ['categoryExplicit', 'budgetItemId', 'rememberCategory']) assert.equal(Object.hasOwn(payment, key), false);
  assert.equal(payment.idempotencyKey, 'edit-original'); assert.equal(ctx.draft.paymentEditBackup, undefined);
});

test('leaving an unaccepted amount edit also restores the reviewed draft', () => {
  const { ctx, payment } = editingHarness(), backup = structuredClone(ctx.draft.paymentEditBackup);
  payment.category = 'Other'; payment.budgetItemId = 'food';
  assert.equal(cancelRecipientEditOnExit(ctx.draft, { section: 'pay', page: 'amount', edit: true }, { section: 'home', page: 'home' }), true);
  assert.deepEqual(payment, backup); assert.equal(ctx.draft.paymentEditBackup, undefined);
});
