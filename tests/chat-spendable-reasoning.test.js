import test from 'node:test';
import assert from 'node:assert/strict';
import { createEmptyState } from '../dist/js/model.js';
import { getMoneyAnswer } from '../dist/js/money-answers.js';
import { getConversationalAnswer } from '../dist/js/chat-language.js';
import { isFinancialAnswerStale } from '../dist/js/chat-action-model.js';
import { safeRoute } from '../dist/js/navigation.js';

const now = new Date('2030-04-10T12:34:00.000Z');
const prose = answer => [answer.title, ...answer.paragraphs].join(' ');
const stat = (answer, label) => answer.stats.find(item => item.label === label)?.value;
function account() {
  const state = createEmptyState();
  state.onboardingDone = true;
  state.wallet = 100000;
  state.buffer = 10000;
  state.income = { amount: 0, nextDate: '' };
  state.budget = { created: true, endDate: '2030-04-17', items: [
    { id: 'food', name: 'Food', amount: 45000, spent: 0 },
    { id: 'transport', name: 'Transport', amount: 20000, spent: 0 },
  ] };
  return state;
}
const ask = (state, question = 'What can I spend?') => getConversationalAnswer(state, question, { now });

test('a general spend question explains recorded room instead of asking for a purchase price', () => {
  const state = account(), before = structuredClone(state);
  for (const question of ['What can I spend?', 'How much can I spend?', 'What money can I use now?', 'What can I spend in Lumo?']) {
    const answer = ask(state, question);
    assert.equal(answer.context.topic, 'balance');
    assert.doesNotMatch(prose(answer), /How much would it cost|Tell me the amount/);
    assert.equal(stat(answer, 'Available'), 'GH₵1,000.00');
    assert.equal(stat(answer, 'Planned commitments'), 'GH₵650.00');
    assert.equal(stat(answer, 'Safety buffer'), 'GH₵100.00');
    assert.equal(stat(answer, 'Left after plan'), 'GH₵250.00');
    assert.match(prose(answer), /recorded plan runs through 17 Apr/);
  }
  assert.equal(stat(getMoneyAnswer(state, 'What can I spend?', now), 'Left after plan'), 'GH₵250.00');
  assert.deepEqual(state, before);
});

test('amount-specific spending checks keep the affordability path', () => {
  const state = account();
  for (const question of ['Can I spend GH₵300 on lunch?', 'Can I spend 300?', 'Could I pay GH₵300?']) {
    const answer = ask(state, question);
    assert.equal(answer.context.topic, 'afford');
    assert.equal(answer.context.amount, 30000);
    assert.doesNotMatch(answer.title, /Here’s the money story/);
  }
});

test('unknown timing never becomes a made-up fourteen-day spending promise', () => {
  const state = account();
  delete state.budget.endDate;
  state.income = { amount: 0, nextDate: '2030-04-24' };
  const answer = ask(state);
  assert.match(prose(answer), /No planning end date is recorded/);
  assert.match(prose(answer), /not a daily spending guide/);
  assert.doesNotMatch(prose(answer), /14 days|until 24 Apr|through 24 Apr|a day/);
  assert.equal(stat(answer, 'Left after plan'), 'GH₵250.00');
  const daily = getMoneyAnswer(state, 'How much can I spend today?', now);
  assert.equal(daily.title, 'Let’s refresh the timing.');
  assert.doesNotMatch(prose(daily), /works out to about|14 days/);
});

test('only a real recorded plan end or expected-income amount and date supports a horizon', () => {
  const state = account();
  delete state.budget.endDate;
  state.income = { amount: 150000, nextDate: '2030-04-19' };
  assert.match(prose(ask(state)), /recorded expected income date is 19 Apr; that money is not included/);
  state.budget.endDate = '2030-04-17';
  assert.match(prose(ask(state)), /recorded plan runs through 17 Apr/);
  assert.doesNotMatch(prose(ask(state)), /expected income date is 19 Apr/);
  state.budget.endDate = '2030-02-30';
  state.income.nextDate = '2030-02-30';
  assert.match(prose(ask(state)), /No planning end date is recorded/);
});

test('expired dates are flagged rather than turning into a positive daily allowance claim', () => {
  const state = account();
  state.budget.endDate = '2030-04-09';
  assert.match(prose(ask(state)), /plan end date, 9 Apr, has passed/);
  assert.doesNotMatch(prose(ask(state)), /recorded plan runs through/);
  delete state.budget.endDate;
  state.income = { amount: 200000, nextDate: '2030-04-08' };
  assert.match(prose(ask(state)), /expected income date, 8 Apr, has passed/);
});

test('expected money, incoming IOUs and Money Boxes cannot inflate spendable money', () => {
  const state = account();
  state.income = { amount: 900000, nextDate: '2030-04-19' };
  state.ious = [{ id: 'incoming', type: 'owedToMe', status: 'open', name: 'Esi', amount: 50000, paid: 0, due: '2030-04-12' }];
  state.boxes = [{ id: 'laptop', name: 'Laptop', balance: 150000, target: 200000, hack: { type: 'none', value: 0 } }];
  const answer = ask(state);
  assert.equal(stat(answer, 'Available'), 'GH₵1,000.00');
  assert.equal(stat(answer, 'Left after plan'), 'GH₵250.00');
  assert.match(prose(answer), /Expected income, unpaid incoming IOUs and Money Boxes stay separate/);
});

test('a plan shortfall remains zero spendable with an explicit explanation and recovery route', () => {
  const state = account();
  state.wallet = 70000;
  const answer = ask(state);
  assert.equal(stat(answer, 'Left after plan'), 'GH₵0.00');
  assert.match(prose(answer), /exceed your available funds by GH₵50\.00/);
  assert.ok(answer.actions.some(action => action.route.section === 'life' && action.route.page === 'recovery'));
  assert.doesNotMatch(prose(answer), /safe to spend|can afford|go ahead/i);
});

test('missing essentials prevent an unqualified spending assurance and offer a working way to correct assumptions', () => {
  const state = account();
  state.budget = { created: false, items: [] };
  const answer = ask(state);
  assert.match(prose(answer), /essentials are not recorded as a plan yet/);
  assert.match(prose(answer), /balance alone cannot tell you what is affordable/);
  const correction = answer.actions.find(action => action.route.section === 'plan');
  assert.ok(correction);
  assert.deepEqual(safeRoute(correction.route, state), { section: 'plan', page: 'home' });
});

test('checked time comes from actual answer generation and the answer becomes stale when assumptions change', () => {
  const state = account(), answer = ask(state);
  assert.equal(answer.checkedAt, now.toISOString());
  assert.equal(isFinancialAnswerStale(state, answer, now), false);
  assert.doesNotMatch(prose(answer), /synced just now|updated just now/i);
  state.buffer += 100;
  assert.equal(isFinancialAnswerStale(state, answer, now), true);
});
