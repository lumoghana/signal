import test from 'node:test';
import assert from 'node:assert/strict';
import { createDemoState, createEmptyState, getSummary } from '../dist/js/model.js';
import { getConversationalAnswer } from '../dist/js/chat-language.js';
import { getMoneyAnswer } from '../dist/js/money-answers.js';
import { installPreparedChatAction, isFinancialAnswerStale } from '../dist/js/chat-action-model.js';

const now = new Date('2026-11-05T12:00:00Z');
const ask = (state, question, messages = []) => getConversationalAnswer(state, question, { now, messages });
const prose = answer => [answer.title, ...answer.paragraphs].join(' ');
const noDraft = answer => {
  assert.equal(answer.context.topic, 'clarify');
  assert.equal(answer.actions?.some(action => action.prepare), false);
  assert.equal(answer.stats, undefined);
};
const tx = (id, amount, category, at, rest = {}) => ({ id, type: 'payment', direction: 'out', rail: 'momo', status: 'success', amount, category, at, ...rest });

test('negated, corrected and multiple recipients require a fresh unambiguous message', () => {
  const state = createDemoState(), before = JSON.stringify(state);
  for (const question of [
    'Send 50 to Akosua, not Kofi', 'Send 50 to Akosua instead of Kofi',
    'Send 50 to Kofi or Efua', 'Send 50 to Kofi and Akosua',
    "Don't send 50 to Kofi", 'Do not send 50 to Kofi',
    'Pay GH₵50 to Kofi and GH₵20 to Akosua',
    'Pay 25 to Gobe Spot and ECG', 'Pay 25 to Gobe Spot and Kofi',
    'Send 50 to Kofi and Kojo', 'Send 50 to Kofi & Kojo', 'Send 50 to Kofi if my allowance arrives',
  ]) noDraft(ask(state, question));
  assert.equal(JSON.stringify(state), before);
});

test('multiple savings destinations and percentage commands cannot become fixed-amount drafts', () => {
  const state = createDemoState(); state.boxes[0].name = 'Laptop'; state.boxes[1].name = 'Trip';
  noDraft(ask(state, 'Move 20 to Laptop and Trip'));
  noDraft(ask(state, 'Save 20 percent to Laptop'));
  noDraft(ask(state, 'Save 20% to Laptop'));
});

test('shared first names are ambiguous, full names disambiguate, repeated account records do not', () => {
  const state = createDemoState();
  state.paymentFavorites = [{ rail: 'lumo', recipient: { id: 'other-kofi', name: 'Kofi Asante', number: '0551234567' } }];
  noDraft(ask(state, 'Send 50 to Kofi'));
  assert.equal(ask(state, 'Send 50 to Kofi Asante').actions[0].prepare.recipient.name, 'Kofi Asante');
  assert.equal(ask(state, 'Send 50 to Kofi Mensah').actions[0].prepare.recipient.name, 'Kofi Mensah');
  state.paymentFavorites.push({ rail: 'lumo', recipient: { id: 'saved-kofi', name: 'Kofi Mensah', number: '0245550182' } });
  state.transactions.push(tx('old-kofi', 100, 'Other', '2026-11-01T10:00:00Z', { rail: 'lumo', recipient: { name: 'Kofi Mensah', number: '024 555 0182' } }));
  assert.equal(ask(state, 'Send 50 to Kofi Mensah').actions[0].prepare.amount, 5000);
});

test('pesewa commands preserve exact units through an editable draft without authorising money', () => {
  const state = createDemoState(), before = JSON.stringify(state);
  for (const [question, expected] of [
    ['Send 20 pesewas to Kofi', 20], ['Pay Kofi 125 pesewas', 125],
    ['Send 2.55 cedis to Kofi', 255], ['Pay Gɔbɛ Spot 50 pesewas', 50],
  ]) {
    const answer = ask(state, question), ctx = { state, draft: {}, go(route) { this.route = route; }, saveDraft() {}, closeSheet() {} };
    assert.equal(answer.actions[0].prepare.amount, expected, question);
    assert.equal(installPreparedChatAction(ctx, answer.actions[0]), true);
    assert.equal(ctx.draft.payment.amount, expected);
    assert.equal(ctx.route.page, 'review');
    assert.equal(ctx.draft.payment.completed, undefined);
    assert.match(answer.paragraphs.join(' '), /review|Review/);
  }
  for (const question of ['Send 0.5 pesewas to Kofi', 'Pay Kofi GH₵1.001', 'Pay Kofi GH₵1,23']) {
    assert.equal(ask(state, question).actions?.some(action => action.prepare), false);
  }
  assert.equal(JSON.stringify(state), before);
});

test('compound amounts and rates ask for one total instead of silently checking a partial cost', () => {
  const state = createDemoState(), before = JSON.stringify(state);
  const first = ask(state, 'Can I spend 50 on lunch?');
  for (const question of [
    'Can I spend 50 and save 20?', 'Can I spend 50 and save the rest?',
    'Can I afford to spend 2 days on campus at 50 cedis a day?',
    'Can I pay 30 each?', 'Can I spend 50 per day?', 'Save 20 cedis and 50 pesewas',
  ]) {
    noDraft(ask(state, question));
    noDraft(getMoneyAnswer(state, question, now));
  }
  noDraft(ask(state, 'What about 20 for 3 days?', [{ role: 'assistant', ...first }]));
  assert.equal(JSON.stringify(state), before);
});

test('spending combines exact category and date filters, fees and card refunds, with excluded statuses separate', () => {
  const state = createEmptyState();
  state.transactions = [
    tx('data-now', 2000, 'Data', '2026-11-03T10:00:00Z', { fee: 50 }),
    tx('food-now', 2500, 'Food', '2026-11-05T10:00:00Z'),
    tx('data-card', 1000, 'Data', '2026-11-05T10:00:00Z', { type: 'card-purchase', rail: 'card', refunded: 500 }),
    tx('old-data', 8000, 'Data', '2026-10-28T10:00:00Z'),
    ...['pending', 'failed', 'reversed'].map(status => tx(status, 9000, 'Data', '2026-11-04T10:00:00Z', { status })),
    tx('internal', 9000, 'Data', '2026-11-04T10:00:00Z', { rail: 'internal', type: 'saving' }),
  ];
  const before = JSON.stringify(state), data = ask(state, 'How much did I spend on data this week?');
  assert.equal(data.title, 'GH₵25.50 on Data.');
  assert.deepEqual(data.stats, [{ label: 'Data', value: 'GH₵25.50' }]);
  assert.match(prose(data), /this week/);
  assert.equal(ask(state, 'How much did I spend on food today?').title, 'GH₵25.00 on Food.');
  assert.equal(ask(state, 'What did I spend on airtime last week?').title, 'GH₵80.00 on Data.');
  assert.equal(ask(state, 'What did I spend on data from 2026-11-03 to 2026-11-05?').title, 'GH₵25.50 on Data.');
  assert.equal(JSON.stringify(state), before);
});

test('category scope survives month follow-ups and a new category replaces it', () => {
  const state = createEmptyState();
  state.transactions = [tx('nov', 2000, 'Data', '2026-11-03T10:00:00Z'), tx('oct', 3000, 'Data', '2026-10-03T10:00:00Z'), tx('food', 4000, 'Food', '2026-10-04T10:00:00Z')];
  const data = ask(state, 'How much did I spend on data this month?');
  const october = ask(state, 'And last month?', [{ role: 'assistant', ...data }]);
  assert.equal(october.title, 'GH₵30.00 on Data.');
  assert.equal(october.context.month, '2026-10');
  assert.equal(ask(state, 'And food?', [{ role: 'assistant', ...october }]).title, 'GH₵40.00 on Food.');
});

test('single dates and explicit years retain their scope rather than expanding to a month or all history', () => {
  const state = createEmptyState();
  state.transactions = [tx('day', 1000, 'Data', '2026-10-15T23:59:59Z'), tx('next', 2000, 'Data', '2026-10-16T00:00:00Z'), tx('prior-year', 9000, 'Data', '2025-10-15T12:00:00Z')];
  for (const question of ['What did I spend on data on 2026-10-15?', 'What did I spend on data on 15 October 2026?']) {
    assert.equal(ask(state, question).title, 'GH₵10.00 on Data.', question);
  }
  assert.equal(ask(state, 'What did I spend on data in 2026?').title, 'GH₵30.00 on Data.');
  assert.match(ask(state, 'What did I spend on data last 2 weeks?').title, /Which dates/);
  assert.match(ask(state, 'What did I spend on data last Friday?').title, /Which dates/);
});

test('recorded merchants can be checked; unknown or excluded scopes never substitute a whole-wallet total', () => {
  const state = createEmptyState();
  state.transactions = [tx('gobe', 2500, 'Food', '2026-11-05T10:00:00Z', { merchant: 'Gɔbɛ Spot' }), tx('other', 4000, 'Food', '2026-11-05T10:00:00Z', { merchant: 'Other Cafe' })];
  assert.equal(ask(state, 'What did I spend at Gobe Spot today?').title, 'GH₵25.00 at Gɔbɛ Spot.');
  for (const question of ['What did I spend on rent today?', 'What did I spend excluding food today?', 'What did I spend at Unknown Cafe today?', 'What did I spend on food and rent today?', 'What did I spend on food at Unknown Cafe today?']) {
    const answer = ask(state, question);
    assert.match(answer.title, /Which category or merchant/);
    assert.equal(answer.stats, undefined);
    assert.doesNotMatch(prose(answer), /GH₵65/);
  }
});

test('daily guidance uses the planning or recovery horizon while expected income retains its own date', () => {
  const state = createEmptyState(), today = new Date();
  const after = days => new Date(today.getTime() + days * 86400000).toISOString().slice(0, 10);
  state.wallet = 20000; state.budget = { created: true, endDate: after(7), items: [] };
  state.income.nextDate = after(-2); state.income.amount = 10000;
  const daily = getMoneyAnswer(state, 'How much can I spend today?', today), summary = getSummary(state);
  assert.equal(daily.title, 'Here is your daily guide.');
  assert.match(prose(daily), new RegExp(String(summary.daysLeft) + ' days'));
  assert.doesNotMatch(prose(daily), /until your next recorded income|income date needs updating/);
  assert.match(prose(getMoneyAnswer(state, 'When is my next allowance?', today)), /expected/);
  state.recovery = { active: true, checkInDate: after(3) };
  assert.equal(getSummary(state).guidanceDate, after(3));
  assert.match(prose(getMoneyAnswer(state, 'How much can I spend today?', today)), /3 days/);
});

test('All Money explains unresolved holds once and financial answers become stale when their source changes', () => {
  const state = createEmptyState(); state.wallet = 10000;
  state.virtualCards = [{ id: 'card', status: 'active', balance: 2000 }];
  state.transactions = [
    tx('payment-hold', 1000, 'Food', '2026-11-05T10:00:00Z', { status: 'pending', fee: 50, walletDebited: true }),
    tx('card-hold', 500, 'Food', '2026-11-05T10:00:00Z', { type: 'card-purchase', rail: 'card', status: 'pending', held: true }),
    tx('group-hold', 3000, 'Other', '2026-11-05T10:00:00Z', { type: 'contribution', status: 'pending', walletDebited: true }),
  ];
  const answer = ask(state, 'Show all my money');
  assert.equal(answer.stats.find(stat => stat.label === 'In Lumo').value, 'GH₵165.50');
  assert.match(prose(answer), /GH₵10\.50 is held for pending payments/);
  assert.match(prose(answer), /GH₵5\.00 is held for pending card purchases/);
  assert.match(prose(answer), /GH₵30\.00 is held for pending group contributions/);
  assert.equal(isFinancialAnswerStale(state, answer, now), false);
  state.transactions[1].held = false;
  assert.equal(isFinancialAnswerStale(state, answer, now), true);
  const spending = ask(state, 'Where did my money go?');
  state.transactions[0].status = 'success';
  assert.equal(isFinancialAnswerStale(state, spending, now), true);
});
