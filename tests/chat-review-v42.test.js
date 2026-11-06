import test from 'node:test';
import assert from 'node:assert/strict';
import { createDemoState, createEmptyState, applyAction } from '../dist/js/model.js';
import { getConversationalAnswer } from '../dist/js/chat-language.js';
import { getMoneyAnswer } from '../dist/js/money-answers.js';
import { getPreparedChatAction, readChatAmount } from '../dist/js/chat-action-model.js';

const now = new Date('2026-11-05T12:00:00Z');
const ask = (state, question, previous) => getConversationalAnswer(state, question, { now, messages: previous ? [{ role: 'assistant', ...JSON.parse(JSON.stringify(previous)) }] : [] });
const noCalculation = answer => {
  assert.equal(answer.context.topic, 'clarify');
  assert.equal(answer.stats, undefined);
  assert.equal(answer.actions.some(action => action.prepare), false);
};
const payment = (id, amount, category, at) => ({ id, amount, category, at, type: 'payment', direction: 'out', status: 'success', rail: 'momo' });

test('foreign currencies cannot silently become cedi advice or editable payment drafts', () => {
  const state = createDemoState(), before = JSON.stringify(state);
  for (const currency of ['USD 50', '$50', '50 dollars', 'EUR 50', '£50', '50 naira', '₦50', '50 cents', 'XOF 50']) {
    const parsed = readChatAmount(currency);
    assert.equal(parsed.unsupportedCurrency, true, currency);
    assert.equal(parsed.amount, null, currency);
    for (const question of [`Can I afford ${currency} on lunch?`, `Can I save ${currency}?`, `Send ${currency} to Kofi`]) {
      const answer = ask(state, question);
      noCalculation(answer);
      assert.match(answer.title, /Ghana cedis/, question);
      assert.doesNotMatch(JSON.stringify(answer), /GH₵50\.00/, question);
    }
    noCalculation(getMoneyAnswer(state, `Can I spend ${currency} on lunch?`, now));
    noCalculation(getPreparedChatAction(state, `Send ${currency} to Kofi`));
  }
  assert.equal(readChatAmount('50 pesewas').amount, 50);
  assert.equal(readChatAmount('GHS 50').amount, 5000);
  assert.equal(JSON.stringify(state), before);
});

test('an explicit recipient wins over a Money Box mentioned only as the payment purpose', () => {
  const state = createDemoState(); state.boxes[0].name = 'Laptop';
  const before = JSON.stringify(state);
  const friend = ask(state, 'Transfer 20 to Kofi for Laptop').actions[0].prepare;
  assert.equal(friend.kind, 'payment');
  assert.equal(friend.recipient.name, 'Kofi Mensah');
  const merchant = ask(state, 'Transfer 20 to Gobe Spot for Laptop').actions[0].prepare;
  assert.equal(merchant.kind, 'payment');
  assert.equal(merchant.serviceId, 'gobe-spot');
  const unknown = ask(state, 'Transfer 20 to Kojo for Laptop').actions[0].prepare;
  assert.equal(unknown.kind, 'payment');
  assert.equal(unknown.recipient, null);
  assert.equal(ask(state, 'Transfer 20 to Laptop for Kofi').actions[0].prepare.boxId, state.boxes[0].id);
  assert.equal(JSON.stringify(state), before);
});

test('a person and Money Box with the same destination name require a choice', () => {
  const state = createDemoState(); state.boxes[0].name = 'Kofi';
  noCalculation(ask(state, 'Transfer 20 to Kofi'));
});

test('explicit followup intent replaces a previous saving or spending topic', () => {
  const state = createDemoState(), saving = ask(state, 'Can I save 50?'), spending = ask(state, 'Can I spend 50 on lunch?');
  const lunch = ask(state, 'And can I spend 20 on lunch?', saving);
  assert.equal(lunch.context.topic, 'afford');
  assert.equal(lunch.context.amount, 2000);
  assert.match(lunch.paragraphs.join(' '), /Food plan/);
  const save = ask(state, 'Could I save 20 instead?', spending);
  assert.equal(save.context.topic, 'saving');
  assert.equal(save.context.subject, 'my goal');
  assert.match(save.paragraphs.join(' '), /Money Box/);
  assert.equal(ask(state, 'What about 20 instead?', saving).context.topic, 'saving');
});

test('category followups retain exact week, rolling-day, single-day and custom-range boundaries after persistence', () => {
  const state = createEmptyState();
  state.transactions = [
    payment('data-now', 2000, 'Data', '2026-11-04T12:00:00Z'),
    payment('food-now', 2500, 'Food', '2026-11-04T12:00:00Z'),
    payment('food-yesterday-start', 700, 'Food', '2026-11-04T00:00:00Z'),
    payment('food-old', 10000, 'Food', '2026-10-25T12:00:00Z'),
    payment('food-future', 5000, 'Food', '2026-11-06T00:00:00Z'),
  ];
  for (const period of ['this week', 'last week', 'yesterday', 'last 7 days', 'on 2026-11-04', 'from 2026-10-25 to 2026-11-04']) {
    const original = ask(state, `What did I spend on data ${period}?`);
    const followup = ask(state, 'And food?', original);
    const direct = ask(state, `What did I spend on food ${period}?`);
    assert.equal(followup.title.startsWith('No completed payments'), direct.title.startsWith('No completed payments'), period);
    assert.deepEqual(followup.stats, direct.stats, period);
    assert.equal(followup.context.spendingRange.start, direct.context.spendingRange.start, period);
    assert.equal(followup.context.spendingRange.end, direct.context.spendingRange.end, period);
  }
  const legacy = ask(state, 'What did I spend on data this week?');
  delete legacy.context.spendingRange; legacy.context.period = 'history';
  assert.equal(ask(state, 'And food?', legacy).title, 'GH₵32.00 on Food.');
});

test('spending aliases use the same category identity as normal model payments and do not double count', () => {
  const state = createEmptyState(); state.wallet = 100000;
  assert.equal(applyAction(state, 'createBudget', { items: [{ name: 'Data & airtime', amount: 10000 }, { name: 'Food and groceries', amount: 20000 }] }).ok, true);
  assert.equal(applyAction(state, 'payment', { amount: 3000, category: 'Data & airtime', merchant: 'Bundle' }).ok, true);
  // Use a deterministic historical timestamp independently of the execution date.
  state.transactions[0].at = '2026-11-04T12:00:00Z';
  state.transactions.push(payment('legacy-data', 1500, 'Data', '2026-11-04T13:00:00Z'), payment('food', 8000, 'Food & groceries', '2026-11-04T14:00:00Z'));
  for (const name of ['data', 'airtime', 'Data & airtime']) {
    const answer = ask(state, `What did I spend on ${name} this month?`);
    assert.match(answer.title, /GH₵45\.00/);
    assert.equal(answer.stats.reduce((total, stat) => total + Number(stat.value.replace(/[^\d.]/g, '')), 0), 45);
  }
  assert.match(ask(state, 'What did I spend on food this month?').title, /GH₵80\.00/);
});

test('recurring costs and saving rates require a full total instead of a one-off affordability answer', () => {
  const state = createDemoState(), prior = ask(state, 'Can I spend 50 on lunch?'), before = JSON.stringify(state);
  for (const question of ['Can I save 50 weekly?', 'Can I spend 50 monthly on data?', 'Can I spend 50 cedis every week on food?', 'Can I save 50 a year?', 'What about 20 every month?']) {
    noCalculation(ask(state, question, prior));
    noCalculation(getMoneyAnswer(state, question.replace('What about', 'Can I spend'), now));
  }
  assert.equal(JSON.stringify(state), before);
});
