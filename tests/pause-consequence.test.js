import test from 'node:test';
import assert from 'node:assert/strict';
import { createEmptyState, evaluatePayment } from '../dist/js/model.js';
import { getPauseConsequence } from '../dist/js/pause-consequence.js';

function account() {
  const state = createEmptyState({ name: 'Ama' });
  state.onboardingDone = true;
  state.wallet = 100000;
  state.buffer = 10000;
  state.budget = { ...state.budget, created: true, items: [
    { id: 'food', name: 'Food', amount: 45000, spent: 0 },
    { id: 'transport', name: 'Transport', amount: 20000, spent: 0 },
  ] };
  return state;
}
const payment = extra => ({ amount: 30000, fee: 0, category: 'Other', rail: 'lumo', ...extra });
const text = value => value.before + value.strong + value.after;

test('the focused consequence includes the fee and only newly used breathing room', () => {
  const state = account(), before = structuredClone(state);
  assert.equal(text(getPauseConsequence(state, payment())), 'This payment uses GH₵50 of your breathing room.');
  assert.equal(text(getPauseConsequence(state, payment({ fee: 50 }))), 'This payment uses GH₵50.50 of your breathing room.');
  assert.deepEqual(state, before);

  state.wallet = 70000; // GH₵50 of GH₵100 breathing room was already uncovered.
  assert.equal(text(getPauseConsequence(state, payment({ amount: 2500 }))), 'This payment uses GH₵25 of your breathing room.');
});

test('a new plan gap is quantified without inventing an affected item or income date', () => {
  const state = account();
  state.income.amount = 99999999;
  const message = getPauseConsequence(state, payment({ amount: 50000, fee: 50 }));
  assert.equal(message.strong, 'GH₵150.50 short');
  assert.equal(text(message), 'This payment leaves you GH₵150.50 short for your plan.');
  assert.doesNotMatch(text(message), /food|transport|Friday|income/i);
});

test('a baseline gap is not blamed entirely on the new payment', () => {
  const state = account(); state.wallet = 50000;
  assert.equal(text(getPauseConsequence(state, payment({ amount: 10000 }))), 'Your plan’s existing gap would grow to GH₵250 after this payment.');
  assert.equal(text(getPauseConsequence(state, payment({ amount: 10000, category: 'Food' }))), 'After this payment, your plan would still be GH₵150 short.');
});

test('planned category spending releases its allocation before assessing the consequence', () => {
  const state = account();
  assert.equal(text(getPauseConsequence(state, payment({ category: 'Food' }))), 'You’d have GH₵250 left after your plan and breathing room.');
  state.wallet = 70000;
  assert.equal(text(getPauseConsequence(state, payment({ category: 'Food' }))), 'After this payment, your breathing room would still be GH₵50 short.');
  state.buffer = 0;
  assert.equal(text(getPauseConsequence(state, payment({ category: 'Food' }))), 'You’d have GH₵50 left after your plan.');
});

test('missing essentials plans and invalid inputs cannot produce a safe-to-spend claim', () => {
  const state = account(); state.budget.created = false;
  assert.equal(text(getPauseConsequence(state, payment())), 'You’d have GH₵700 left, with no essentials plan to compare it with.');
  for (const [input, draft] of [[{}, payment()], [account(), { amount: 30000 }], [account(), payment({ fee: -1 })]]) {
    const message = text(getPauseConsequence(input, draft));
    assert.match(message, /cannot calculate/);
    assert.doesNotMatch(message, /GH₵|covered|safe/i);
  }
});

test('an unfunded payment is never described as having negative money left', () => {
  assert.equal(text(getPauseConsequence(account(), payment({ amount: 100000, fee: 50 }))), 'This payment and its fee exceed your available money by GH₵0.50.');
});

test('an evaluation supplies a missing fee, but never overrides the actual financial model', () => {
  const state = account();
  assert.equal(text(getPauseConsequence(state, { amount: 30000, category: 'Other' }, { fee: 50, afterAvailable: 99999999 })), 'This payment uses GH₵50.50 of your breathing room.');
});

test('a covered payment shows its actual history trigger while a new financial gap stays primary', () => {
  const state = account(), recipient = { name: 'Ama', number: '0244444444' };
  state.transactions = [1, 2].map(id => ({
    id: `recent-${id}`, type: 'payment', direction: 'out', status: 'success', rail: 'lumo',
    amount: 2000, fee: 0, recipient, at: new Date().toISOString(),
  }));
  const draft = payment({ amount: 2000, recipient });
  const check = evaluatePayment(state, draft);
  assert.equal(check.needed, true);
  assert.ok(check.historySignals.some(signal => signal.id === 'repeat-recipient'));
  assert.match(check.reason, /already made 2 payments/);
  assert.deepEqual(getPauseConsequence(state, draft, check), { before: check.reason, strong: '', after: '' });

  const larger = payment({ amount: 50000, recipient });
  const largerCheck = evaluatePayment(state, larger);
  assert.ok(largerCheck.historySignals.length > 0);
  assert.equal(text(getPauseConsequence(state, larger, largerCheck)), 'This payment leaves you GH₵150 short for your plan.');
});
