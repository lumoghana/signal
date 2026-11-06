import test from 'node:test';
import assert from 'node:assert/strict';
import { createEmptyState, applyAction } from '../dist/js/model.js';
import { getConversationalAnswer } from '../dist/js/chat-language.js';
import { getMoneyAnswer } from '../dist/js/money-answers.js';

const now = new Date('2026-11-02T08:00:00Z');
const account = () => {
  const state = createEmptyState({ name: 'Ama Mensah' });
  state.wallet = 20000; state.buffer = 1000;
  state.budget = { created: true, items: [
    { id: 'food', name: 'Food', amount: 5000, spent: 0, due: '2026-11-10' },
    { id: 'transport', name: 'Transport', amount: 2000, spent: 0, due: '2026-11-10' },
  ] };
  return state;
};
const ask = (state, question, messages = []) => getConversationalAnswer(state, question, { messages, now });
const conversation = (question, answer) => [{ role: 'user', text: question }, { role: 'assistant', ...answer }];
const prose = answer => answer.paragraphs.join(' ');
const stat = (answer, label) => answer.stats?.find(item => item.label === label)?.value;

test('greetings, identity, thanks and unknown topics are warm without exposing hidden money', () => {
  const state = account(); state.settings.hideBalance = true;
  for (const question of ['Hi Lux!', 'Hey', 'Thank you', 'Who are you?', 'You good?', 'Tell me a joke']) {
    const before = JSON.stringify(state), answer = ask(state, question);
    assert.doesNotMatch(JSON.stringify(answer), /GH₵|200\.00|120\.00/);
    assert.ok(answer.followUps.length > 0);
    assert.equal(JSON.stringify(state), before);
  }
  assert.match(ask(state, 'Who are you?').title, /Lux/);
  assert.match(ask(state, 'Hi Lux!').title, /Ama/);
});

test('a price follow-up keeps the food plan and a category follow-up keeps the last amount', () => {
  const state = account(), before = JSON.stringify(state);
  const first = ask(state, 'Can I spend GH₵50 on lunch?');
  const second = ask(state, 'What about 80?', conversation('Can I spend GH₵50 on lunch?', first));
  assert.equal(second.context.topic, 'afford'); assert.equal(second.context.amount, 8000);
  assert.equal(second.context.subject, 'lunch'); assert.equal(stat(second, 'Considering'), 'GH₵80.00');
  assert.match(prose(second), /Food plan has GH₵50\.00 left/);
  assert.match(prose(second), /would go GH₵30\.00 beyond/);
  const third = ask(state, 'And transport?', conversation('What about 80?', second));
  assert.equal(third.context.amount, 8000); assert.equal(third.context.subject, 'transport');
  assert.match(prose(third), /Transport plan has GH₵20\.00 left/);
  assert.match(prose(third), /would go GH₵60\.00 beyond/);
  const gobe = ask(state, 'Can I spend GH₵80 on gɔbɛ?');
  assert.equal(gobe.context.subject, 'gɔbɛ');
  assert.match(prose(gobe), /Food plan has GH₵50\.00 left/);
  assert.match(prose(gobe), /would go GH₵30\.00 beyond/);
  assert.equal(JSON.stringify(state), before);
});

test('casual gobe questions ask for the actual cost and accept a number-only answer', () => {
  const state = account();
  for (const question of ['Can I grab gobe?', 'Can I afford gɔbɛ?', 'I’m hungry']) {
    const first = ask(state, question);
    assert.equal(first.context.topic, 'afford'); assert.equal(first.context.amount, null);
    assert.doesNotMatch(prose(first), /gɔbɛ costs|price is/i);
    const answer = ask(state, '25', conversation(question, first));
    assert.equal(answer.context.amount, 2500);
    assert.match(prose(answer), /Food plan/);
  }
});

test('decimals and pesewas retain exact value while malformed or non-positive prices get no check', () => {
  const state = account();
  for (const [question, expected] of [['Can I spend GH₵2.55 on lunch?', 255], ['Can I spend 50 pesewas on food?', 50], ['Can I save 25.75 cedis?', 2575]]) {
    assert.equal(ask(state, question).context.amount, expected, question);
  }
  for (const value of ['-1', '0', '1.001', '1e3', 'NaN', 'Infinity', '1,23']) {
    const answer = ask(state, `Can I spend GH₵${value} on lunch?`);
    assert.equal(answer.context.amount, null, value);
    assert.equal(answer.stats, undefined, value);
    assert.match(answer.title, /clear amount/, value);
  }
});

test('saving follow-ups stay savings checks rather than becoming spending permissions', () => {
  const state = account(), first = ask(state, 'Can I save GH₵50?');
  const answer = ask(state, 'What about 20 instead?', conversation('Can I save GH₵50?', first));
  assert.equal(answer.context.topic, 'saving'); assert.equal(answer.context.amount, 2000);
  assert.match(prose(answer), /Putting GH₵20\.00 into a Money Box/);
  assert.match(prose(answer), /total held money stays the same/);
  assert.equal(answer.actions[0].route.section, 'boxes');
  assert.equal(ask(state, 'Help me save for 2027').context.amount, null);
});

test('a fresh topic or lesson breaks stale affordability context', () => {
  const state = account(), first = ask(state, 'Can I spend GH₵50 on lunch?');
  const messages = conversation('Can I spend GH₵50 on lunch?', first);
  const hello = ask(state, 'Hey Lux!');
  assert.equal(ask(state, 'What about 80?', [...messages, { role: 'assistant', ...hello }]).context.topic, 'clarify');
  assert.equal(ask(state, 'What about 80?', [...messages, { role: 'assistant', kind: 'lesson' }]).context.topic, 'clarify');
  assert.equal(ask(state, 'What about 80?', [{ role: 'assistant', context: { topic: 'afford', amount: '5000' } }]).context.topic, 'afford');
});

test('outside balances and expected IOUs cannot pay a Lumo affordability gap', () => {
  const state = createEmptyState(); state.wallet = 2000; state.buffer = 0;
  const outside = applyAction(state, 'createExternalBalance', { type: 'momo', name: 'Other MoMo', balance: 900000 });
  assert.equal(outside.ok, true);
  state.ious.push({ id: 'future-iou', name: 'Kofi', type: 'owedToMe', status: 'open', amount: 900000, paid: 0, due: '2026-11-03' });
  const before = JSON.stringify(state), answer = ask(state, 'Can I pay GH₵50 with my MoMo balance?');
  assert.equal(answer.title, 'This needs a pause.');
  assert.match(prose(answer), /spending account holds GH₵20\.00/);
  assert.match(prose(answer), /GH₵30\.00 short/);
  assert.match(prose(answer), /recorded outside Lumo stays separate/);
  assert.equal(JSON.stringify(state), before);
});

test('ambiguous approval only offers a review page and never changes recorded money', () => {
  const state = account(), first = ask(state, 'Can I spend GH₵50 on lunch?'), before = JSON.stringify(state);
  for (const question of ['Yes', 'Go ahead', 'Send it', 'Pay it']) {
    const answer = ask(state, question, conversation('Can I spend GH₵50 on lunch?', first));
    assert.equal(answer.context.topic, 'approval');
    assert.match(prose(answer), /doesn’t move money/);
    assert.deepEqual(answer.actions[0].route, { section: 'pay', page: 'home' });
    assert.equal(JSON.stringify(state), before);
  }
});

test('spending questions and their month follow-ups use recorded calendar-month activity', () => {
  const state = account();
  const tx = (amount, at, extra = {}) => ({ type: 'payment', status: 'success', direction: 'out', rail: 'momo', category: 'Food', amount, at, ...extra });
  state.transactions = [tx(2500, '2026-11-02T01:00:00Z'), tx(3500, '2026-10-02T01:00:00Z'), tx(1500, '2026-09-02T01:00:00Z'), tx(8000, '2026-10-02T01:00:00Z', { status: 'pending' })];
  assert.equal(ask(state, 'Where did my money go today?').title, 'GH₵25.00 in completed payments.');
  assert.equal(ask(state, 'How much did I spend this month?').title, 'GH₵25.00 in completed payments.');
  assert.equal(ask(state, 'How much did I spend today?').title, 'GH₵25.00 in completed payments.');
  const october = ask(state, 'Explain my spending for October 2026.');
  assert.equal(october.title, 'GH₵35.00 in completed payments.'); assert.equal(october.context.month, '2026-10');
  const september = ask(state, 'And last month?', conversation('October spending', october));
  assert.equal(september.title, 'GH₵15.00 in completed payments.'); assert.equal(september.context.month, '2026-09');
  assert.deepEqual(september.actions[0].route, { section: 'activity', page: 'insights', month: '2026-09' });
  const future = ask(state, 'And December?', conversation('October spending', october));
  assert.equal(future.context.topic, 'clarify'); assert.match(future.title, /still ahead/);
});

test('casual late-allowance and tight-money messages stay grounded in held funds', () => {
  const state = account();
  const late = ask(state, 'My allowance hasn’t landed');
  assert.equal(late.context.topic, 'recovery'); assert.match(prose(late), /expected allowance stays outside/);
  const tight = ask(state, 'Chale I am broke');
  assert.equal(tight.context.topic, 'balance'); assert.match(tight.title, /one step/);
  assert.match(prose(tight), /GH₵200\.00 available/);
});

test('the available-money question after outside balances shows spendable funds without asking a price', () => {
  const state = account();
  applyAction(state, 'createExternalBalance', { type: 'momo', name: 'Other MoMo', balance: 900000 });
  const outside = ask(state, 'Show all my money');
  const available = ask(state, 'What can I spend in Lumo?', conversation('Show all my money', outside));
  assert.equal(available.context.topic, 'balance');
  assert.equal(stat(available, 'Available'), 'GH₵200.00');
  assert.equal(stat(available, 'Left after plan'), 'GH₵120.00');
  assert.doesNotMatch(available.title, /cost|amount/);
});

test('cost checks, saving and recovery use short paragraphs while keeping every calculated amount', () => {
  const state = account();
  applyAction(state, 'createExternalBalance', { type: 'momo', name: 'Other MoMo', balance: 900000 });
  const currencies = answer => [...new Set(JSON.stringify(answer).match(/GH₵[\d,]+\.\d{2}/g))].sort();
  for (const question of ['Can I spend GH₵25 on lunch?', 'Can I spend GH₵80 on lunch?', 'Can I spend GH₵180 on transport?', 'Can I spend GH₵250 on lunch?', 'Can I save GH₵20?', 'Can I save GH₵150?', 'Help me save', 'My allowance is late']) {
    const answer = ask(state, question);
    const original = getMoneyAnswer(state, answer.context.canonicalQuestion, now);
    // Stats and explanations retain both the current amounts and the conditional impact.
    assert.deepEqual(currencies({ paragraphs: answer.paragraphs, stats: answer.stats }), currencies({ paragraphs: original.paragraphs, stats: original.stats }), question);
    for (const paragraph of answer.paragraphs) assert.ok(paragraph.split(/\s+/).length <= 26, `${question}: ${paragraph}`);
  }
  const fitting = ask(state, 'Can I spend GH₵25 on lunch?');
  assert.equal(fitting.paragraphs[0], 'Your Food plan would go from GH₵50.00 to GH₵25.00.');
  assert.match(fitting.paragraphs[1], /GH₵175\.00 in spending and GH₵120\.00 left after plan, before any Savings Hacks/);
  const protectedFunds = ask(state, 'Can I spend GH₵180 on transport?');
  assert.match(protectedFunds.paragraphs[0], /GH₵40\.00 from another commitment or your buffer/);
  assert.match(prose(ask(state, 'Can I spend GH₵250 on lunch?')), /Expected money can’t cover a payment today/);
  assert.match(prose(ask(state, 'Can I save GH₵150?')), /would use money already committed or go beyond your Lumo balance/);
});

test('natural allowance guidance and short cost phrases resolve to the grounded checks', () => {
  const state = account();
  for (const question of ['How do I make my allowance last?', 'Help my money last until next week', 'How can I stretch my allowance?']) {
    const answer = ask(state, question);
    assert.equal(answer.context.topic, 'daily', question);
    assert.deepEqual(answer.followUps, ['What’s left in my plan?', 'My allowance is late']);
    assert.match(prose(answer), /GH₵120\.00/);
  }
  for (const question of ['GH₵80 for lunch', '80 cedis for lunch?', '80 on transport']) {
    const answer = ask(state, question);
    assert.equal(answer.context.topic, 'afford', question);
    assert.equal(answer.context.amount, 8000, question);
    assert.match(prose(answer), /plan has GH₵(?:50|20)\.00 left/);
  }
});
