import test from 'node:test';
import assert from 'node:assert/strict';
import { applyAction, createEmptyState, getSummary } from '../dist/js/model.js';
import { renderPlanning } from '../dist/js/planning.js';
import { openHackEditor } from '../dist/js/planning-parity-ui.js';
import { renderSavingsHackDisclosure } from '../dist/js/savings-hack-disclosure.js';
import { prepareServicePayment } from '../dist/js/payment-catalog.js';

const day = n => new Date(Date.now() + n * 86400000).toISOString().slice(0, 10);
const act = (state, type, payload = {}) => {
  const result = applyAction(state, type, payload);
  assert.equal(result.ok, true, result.message);
  return result;
};
const text = html => html.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
function fixture(hack = { type: 'fixed', value: 1000 }) {
  const state = createEmptyState();
  state.wallet = 100000; state.buffer = 0; state.income.nextDate = day(14); state.onboardingDone = true;
  const box = act(state, 'createBox', { name: 'Next laptop', target: 50000, hack }).box;
  return { state, box };
}

test('the compact disclosure expands before activation and distinguishes local fees from unconfirmed live pricing', () => {
  const html = renderSavingsHackDisclosure(), copy = text(html);
  assert.match(copy, /Your plan comes first/);
  assert.match(html, /<details class="planning-details"><summary[^>]*>How this works<\/summary>/);
  assert.doesNotMatch(html, /<details[^>]*\bopen\b/);
  for (const phrase of ['Expected allowance', 'money owed to you', 'Money Boxes do not count', 'no catch-up charge', 'Rule activity', 'Pause or Cancel', 'Payment fees are separate']) assert.ok(copy.includes(phrase), phrase);
  assert.match(copy, /prototype applies no fee.*Live charges, if any, must be confirmed and shown before activation/);
  assert.doesNotMatch(copy, /always free|free forever/);
  assert.match(copy, /No live standing order is created/);
});

test('the legacy hack page presents the explanation before Save my hack without changing a rule', () => {
  const { state, box } = fixture(), before = structuredClone(state);
  const html = renderPlanning({ state, draft: {} }, { section: 'boxes', page: 'hack', id: box.id });
  assert.ok(html.indexOf('data-savings-hack-disclosure') > 0);
  assert.ok(html.indexOf('data-savings-hack-disclosure') < html.indexOf('data-action="p:hack-save"'));
  assert.deepEqual(state, before);
});

for (const setup of [false, true]) test(`the active ${setup ? 'new-box setup' : 'saved-rule editor'} includes the same disclosure before submitting`, () => {
  const { state, box } = fixture({ type: 'percent', value: 5 }), before = structuredClone(state);
  const form = { elements: { type: { value: 'percent' }, value: {}, frequency: {}, nextRun: {}, cap: {}, floor: {} } };
  const panels = { '[data-hack-value]': {}, '[data-hack-schedule]': {} };
  let html = '';
  const ctx = { state, draft: {}, sheet(markup, bind) { html = markup; bind({ querySelector: selector => selector === 'form' ? form : panels[selector] }); } };
  openHackEditor(ctx, box, { setup });
  assert.ok(html.includes(renderSavingsHackDisclosure()));
  assert.ok(html.indexOf('data-savings-hack-disclosure') < html.indexOf('type="submit"'));
  assert.match(html, setup ? /Use this rule/ : /Save my rule/);
  assert.deepEqual(state, before, 'Reading a disclosure cannot enable or charge a rule.');
});

test('the explained spare-money check protects plans, due IOUs and breathing room and never catches up a skipped event', () => {
  const { state, box } = fixture();
  state.wallet = 12000; state.buffer = 1000;
  act(state, 'createBudget', { items: [{ id: 'food', name: 'Food', amount: 5000 }], endDate: day(14) });
  act(state, 'createIOU', { name: 'Esi', type: 'owedByMe', amount: 3000, due: day(2) });
  act(state, 'setExpectedIncome', { amount: 1000000, date: day(14) });
  act(state, 'payment', { merchant: 'Dinner', amount: 2500 });
  assert.equal(getSummary(state).spendable, 500);
  assert.equal(box.balance, 0);
  assert.equal(state.savingsHistory[0].status, 'skipped');
  assert.match(state.savingsHistory[0].reason, /plan and protected balance/);
  act(state, 'fund', { amount: 1000 });
  assert.equal(box.balance, 0, 'Later funding cannot collect an earlier skipped payment contribution.');
  act(state, 'payment', { merchant: 'Water', amount: 500 });
  assert.equal(box.balance, 1000, 'Only the new payment creates its own contribution.');
  assert.equal(getSummary(state).spendable, 0);
});

test('payment-based rules run at confirmed success, while a later payment reversal leaves earlier saving in the box', () => {
  const { state, box } = fixture();
  act(state, 'payment', { merchant: 'Failed payment', amount: 1000, status: 'failed' });
  const pending = act(state, 'payment', { merchant: 'Pending payment', amount: 1000, status: 'pending' }).transaction;
  assert.equal(box.balance, 0);
  act(state, 'resolvePayment', { id: pending.id, status: 'success' });
  assert.equal(box.balance, 1000);
  act(state, 'reversePayment', { id: pending.id });
  assert.equal(box.balance, 1000);
  assert.equal(state.wallet, 99000);
  assert.match(text(renderSavingsHackDisclosure()), /Reversing a payment does not undo a Savings Hack already saved/);
});

test('percentage savings exclude the payment fee and the internal saving move has no prototype fee', () => {
  const { state, box } = fixture({ type: 'percent', value: 5 });
  act(state, 'payment', { merchant: 'Lunch', amount: 2000, fee: 50 });
  assert.equal(box.balance, 100);
  assert.equal(state.wallet, 97850);
  const contribution = state.transactions.find(tx => tx.category === 'Savings Hack');
  assert.equal(contribution.fee ?? 0, 0);
  assert.equal(contribution.amount, 100);
});

test('the qualifying-payment explanation matches person and service payments but not demo cards or internal moves', () => {
  for (const rail of ['lumo', 'momo', 'bank']) {
    const { state, box } = fixture();
    act(state, 'payment', { merchant: 'Esi', amount: 2000, rail });
    assert.equal(box.balance, 1000, rail);
  }
  const service = prepareServicePayment('airtime', { network: 'MTN', phone: '0240000000', amountText: '20' }).payment;
  const one = fixture();
  act(one.state, 'payment', { ...service, merchant: service.recipient.name, paymentKind: 'service', serviceId: 'airtime' });
  assert.equal(one.box.balance, 1000);
  const two = fixture();
  const card = act(two.state, 'createDemoVirtualCard').card;
  act(two.state, 'cardFund', { cardId: card.id, amount: 5000 });
  act(two.state, 'cardPurchase', { cardId: card.id, merchant: 'Online shop', amount: 2000 });
  assert.equal(two.box.balance, 0, 'Card purchases do not invoke payment-based saving rules.');
  act(two.state, 'contributeBox', { id: two.box.id, amount: 1000 });
  assert.equal(two.box.balance, 1000, 'The internal contribution does not recursively save another amount.');
});
