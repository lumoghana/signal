import test from 'node:test';
import assert from 'node:assert/strict';
import { createEmptyState } from '../dist/js/model.js';
import { getPauseTradeoff } from '../dist/js/pause-intelligence.js';
import { renderPayments } from '../dist/js/payments.js';

function account() {
  const state = createEmptyState({ name: 'Ama' });
  state.onboardingDone = true; state.wallet = 100000; state.buffer = 10000;
  state.budget = { ...state.budget, created: true, items: [
    { id: 'food', name: 'Food', amount: 45000, spent: 0 },
    { id: 'transport', name: 'Transport', amount: 20000, spent: 0 },
  ] };
  return state;
}
const payment = (extra = {}) => ({ amount: 30000, fee: 0, category: 'Other', rail: 'lumo', recipient: { id: 'esi', name: 'Esi' }, ...extra });

test('Pause explains exactly how a funded payment reduces covered breathing room', () => {
  const state = account(), before = structuredClone(state), result = getPauseTradeoff(state, payment());
  assert.equal(result.afterAvailable, 70000);
  assert.equal(result.afterPlanned, 65000);
  assert.equal(result.breathingRoomCovered, 5000);
  assert.equal(result.planGap, 0);
  assert.match(result.copy, /GH₵700 would remain/);
  assert.match(result.copy, /GH₵650 plan stays covered/);
  assert.match(result.copy, /Only GH₵50 of your GH₵100 breathing room/);
  assert.deepEqual(state, before);
});

test('the actual Pause shows the consequence while retaining Edit and gated Continue', () => {
  const state = account(), draft = payment(), before = structuredClone(state);
  const html = renderPayments({ state, draft: { payment: draft } }, { section: 'pay', page: 'pause' });
  assert.match(html, /GH₵700 would remain in Everyday/);
  assert.match(html, /Only GH₵50 of your GH₵100 breathing room/);
  assert.match(html, /data-action="pay-edit-amount"/);
  assert.match(html, /data-action="pay-pause-next" aria-busy="true" disabled/);
  assert.doesNotMatch(html, /which food|cancel your transport/i);
  assert.deepEqual(state, before);
});

test('a known category allocation releases that part of the plan before explaining the outcome', () => {
  const result = getPauseTradeoff(account(), payment({ category: 'Food' }));
  assert.equal(result.afterAvailable, 70000);
  assert.equal(result.afterPlanned, 35000);
  assert.equal(result.breathingRoomCovered, 10000);
  assert.equal(result.flexible, 25000);
  assert.match(result.copy, /GH₵350 plan and GH₵100 breathing room stay covered/);
  assert.match(result.copy, /GH₵250 would be left/);
});

test('fees are included to the pesewa and expected income is never treated as received money', () => {
  const state = account();
  state.income.amount = 900000;
  const result = getPauseTradeoff(state, payment({ fee: 50 }));
  assert.equal(result.afterAvailable, 69950);
  assert.equal(result.breathingRoomCovered, 4950);
  assert.match(result.copy, /GH₵699\.50/);
  assert.match(result.copy, /Only GH₵49\.50 of your GH₵100/);
});

test('a plan shortfall is quantified without inventing which planned item will be cut', () => {
  const result = getPauseTradeoff(account(), payment({ amount: 50000 }));
  assert.equal(result.planGap, 15000);
  assert.equal(result.breathingRoomCovered, 0);
  assert.match(result.copy, /GH₵500 would remain.*GH₵650 is still planned/);
  assert.match(result.copy, /GH₵150 plan gap/);
  assert.match(result.copy, /cannot identify which planned item/);
  assert.doesNotMatch(result.copy, /Food|Transport|Friday/);
});

test('incomplete money, fee or plan data cannot produce fabricated precision or a safe-to-spend claim', () => {
  for (const [state, draft] of [[{}, payment()], [account(), { amount: 30000 }], [account(), payment({ fee: -5 })]]) {
    const result = getPauseTradeoff(state, draft);
    assert.equal(result.known, false);
    assert.match(result.copy, /cannot calculate/);
    assert.doesNotMatch(result.copy, /GH₵/);
  }
  const state = account(); state.budget.created = false;
  const result = getPauseTradeoff(state, payment());
  assert.equal(result.afterAvailable, 70000);
  assert.match(result.copy, /no essentials plan yet/);
  assert.match(result.copy, /cannot tell whether this leaves enough/);
  assert.doesNotMatch(result.copy, /stays covered|stay covered|Friday/);
});

test('the consequence never represents negative available funds as remaining money', () => {
  const result = getPauseTradeoff(account(), payment({ amount: 100000, fee: 50 }));
  assert.equal(result.allowed, false);
  assert.match(result.copy, /exceed your available money by GH₵0\.50/);
  assert.doesNotMatch(result.copy, /would remain/);
});
