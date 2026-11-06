import test from 'node:test';
import assert from 'node:assert/strict';
import { createDemoState, createEmptyState, applyAction } from '../dist/js/model.js';
import { getMoneyAnswer } from '../dist/js/chat.js';

const run = (state, type, payload) => {
  const result = applyAction(state, type, payload);
  assert.equal(result.ok, true, result.message);
  return result;
};
const stats = answer => Object.fromEntries(answer.stats.map(item => [item.label, item.value]));
const prose = answer => answer.paragraphs.join(' ');

test('all-money chat shows a truthful empty picture and a route to add outside balances', () => {
  const answer = getMoneyAnswer(createEmptyState(), 'How much money do I have?');
  assert.deepEqual(stats(answer), { 'In Lumo': 'GH₵0.00', 'Outside Lumo': 'GH₵0.00', 'All recorded money': 'GH₵0.00' });
  assert.match(prose(answer), /not added outside balances yet/);
  assert.deepEqual(answer.actions[0].route, { section: 'life', page: 'overview' });
});

test('a recorded zero balance is recognised as a manually updated balance', () => {
  const state = createEmptyState();
  run(state, 'createExternalBalance', { type: 'cash', name: 'Pocket cash', balance: 0 });
  const answer = getMoneyAnswer(state, 'What is my cash balance?');
  assert.equal(stats(answer)['Outside Lumo'], 'GH₵0.00');
  assert.match(prose(answer), /manually recorded/);
  assert.doesNotMatch(prose(answer), /not added outside balances/);
});

test('chat totals follow outside cash, bank and MoMo creation, updates and removal', () => {
  const state = createDemoState();
  const cash = run(state, 'createExternalBalance', { type: 'cash', name: 'Pocket cash', balance: 20000 });
  const bank = run(state, 'createExternalBalance', { type: 'bank', name: 'Other bank', balance: 80000 });
  run(state, 'createExternalBalance', { type: 'momo', name: 'MTN MoMo', balance: 50000 });
  assert.deepEqual(stats(getMoneyAnswer(state, 'All my money')), { 'In Lumo': 'GH₵3,220.00', 'Outside Lumo': 'GH₵1,500.00', 'All recorded money': 'GH₵4,720.00' });
  run(state, 'updateExternalBalance', { id: cash.id, balance: 10000 });
  run(state, 'removeExternalBalance', { id: bank.id });
  const answer = getMoneyAnswer(state, 'How much is outside Lumo?');
  assert.deepEqual(stats(answer), { 'In Lumo': 'GH₵3,220.00', 'Outside Lumo': 'GH₵600.00', 'All recorded money': 'GH₵3,820.00' });
  assert.match(prose(answer), /do not increase your Lumo payment balance or left after plan/);
});

test('all-money totals exclude expected income, unpaid IOUs and group collections', () => {
  const state = createDemoState();
  run(state, 'createExternalBalance', { type: 'momo', name: 'MTN MoMo', balance: 50000 });
  const answer = getMoneyAnswer(state, 'What is my total balance?');
  assert.equal(stats(answer)['All recorded money'], 'GH₵3,720.00');
  assert.match(prose(answer), /Expected income, unpaid IOUs and group collections stay separate/);
});

test('MoMo payment questions keep Lumo affordability checks even with a large outside balance', () => {
  const state = createEmptyState();
  state.wallet = 2000;
  state.buffer = 0;
  run(state, 'createExternalBalance', { type: 'momo', name: 'MTN MoMo', balance: 10000000 });
  const answer = getMoneyAnswer(state, 'Can I pay GH₵50 with my MoMo balance?');
  assert.equal(answer.title, 'This needs a pause.');
  assert.match(prose(answer), /spending account holds GH₵20\.00/);
  assert.match(prose(answer), /gap is GH₵30\.00/);
  assert.match(prose(answer), /recorded outside Lumo is separate from this Lumo payment check/);
  assert.equal(stats(answer)['Left after plan now'], 'GH₵20.00');
});

test('outside balances do not inflate savings or recovery guidance', () => {
  const state = createEmptyState();
  state.wallet = 2000;
  state.buffer = 0;
  run(state, 'createExternalBalance', { type: 'bank', name: 'Other bank', balance: 10000000 });
  const saving = getMoneyAnswer(state, 'Can I save GH₵50?');
  assert.equal(saving.title, 'Let’s protect your commitments first.');
  assert.match(prose(saving), /GH₵20\.00 left after plan in Lumo/);
  const recovery = getMoneyAnswer(state, 'My allowance is late');
  assert.match(prose(recovery), /GH₵20\.00 in your spending account/);
  assert.doesNotMatch(prose(recovery), /100,000/);
});
