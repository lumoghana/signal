import test from 'node:test';
import assert from 'node:assert/strict';
import { createEmptyState, createDemoState } from '../dist/js/model.js';
import { getConversationalAnswer } from '../dist/js/chat-language.js';
import { getMoneyAnswer, getSpendingPeriod } from '../dist/js/money-answers.js';
import { financialSnapshotKey, getPreparedChatAction, installPreparedChatAction, isFinancialAnswerStale } from '../dist/js/chat-action-model.js';
import { evaluatePauseHistory, getPauseAlternatives, renderPauseAlternatives } from '../dist/js/pause-intelligence.js';
import { renderChat } from '../dist/js/chat.js';

const now = new Date('2026-11-02T12:00:00Z');
const tx = (amount, at, extra = {}) => ({ id: at, type: 'payment', direction: 'out', status: 'success', rail: 'lumo', merchant: 'Kofi Mensah', category: 'Food', amount, at, ...extra });
const ask = (state, question) => getConversationalAnswer(state, question, { now });
const prose = answer => [answer.title, ...(answer.paragraphs || [])].join(' ');

test('last week is the previous Monday to Sunday, and never includes today or older records', () => {
  const state = createEmptyState();
  state.transactions = [tx(2500, '2026-11-02T00:00:00Z'), tx(3500, '2026-10-26T00:00:00Z'), tx(1500, '2026-11-01T23:59:59Z'), tx(7500, '2026-10-13T12:00:00Z'), tx(9000, '2026-10-30T12:00:00Z', { status: 'pending' }), tx(9500, '2026-10-30T13:00:00Z', { status: 'reversed' })];
  const answer = ask(state, 'How much did I spend last week?');
  assert.equal(answer.title, 'GH₵50.00 in completed payments.');
  assert.match(prose(answer), /Monday to Sunday/);
  assert.equal(ask(state, 'How much did I spend this week?').title, 'GH₵25.00 in completed payments.');
});

test('custom date ranges include the full final day and years never turn into prices', () => {
  const state = createEmptyState();
  state.transactions = [tx(1000, '2026-10-01T00:00:00Z'), tx(2000, '2026-10-15T23:59:59Z'), tx(3000, '2026-10-16T00:00:00Z')];
  for (const question of ['What did I spend from 2026-10-01 to 2026-10-15?', 'What did I spend between 1 October 2026 and 15 October 2026?']) {
    const answer = ask(state, question);
    assert.equal(answer.context.topic, 'spending');
    assert.equal(answer.title, 'GH₵30.00 in completed payments.');
  }
  assert.equal(getSpendingPeriod('from 2026-02-30 to 2026-03-01', now).unsupported, true);
  assert.equal(getSpendingPeriod('from 2026-10-20 to 2026-10-01', now).unsupported, true);
  assert.equal(getSpendingPeriod('from 2027-01-01 to 2027-02-01', now).unsupported, true);
});

test('unknown periods request dates rather than silently answering all history', () => {
  const state = createDemoState(); state.transactions = [tx(7500, '2026-10-13T12:00:00Z')];
  const answer = ask(state, 'How much did I spend last semester?');
  assert.match(answer.title, /Which dates/);
  assert.doesNotMatch(prose(answer), /GH₵75|recorded history/);
});

test('rolling periods and year boundaries use exact UTC dates', () => {
  const period = getSpendingPeriod('last 7 days', new Date('2026-01-03T00:01:00Z'));
  assert.equal(period.start, '2025-12-28'); assert.equal(period.end, '2026-01-04');
  const week = getSpendingPeriod('last week', new Date('2026-01-01T12:00:00Z'));
  assert.equal(week.start, '2025-12-22'); assert.equal(week.end, '2025-12-29');
});

test('saving period analysis separates saved money, withdrawals and personal spending', () => {
  const state = createEmptyState();
  state.transactions = [tx(3000, '2026-10-27T12:00:00Z', { type: 'saving', rail: 'internal' }), tx(1000, '2026-10-28T12:00:00Z', { type: 'withdrawal', direction: 'in', rail: 'internal' }), tx(9900, '2026-10-28T13:00:00Z'), tx(2000, '2026-10-29T12:00:00Z', { type: 'saving', rail: 'internal', status: 'pending' })];
  const answer = ask(state, 'How much did I save last week?');
  assert.equal(answer.stats.find(stat => stat.label === 'Added to savings').value, 'GH₵30.00');
  assert.equal(answer.stats.find(stat => stat.label === 'Net transfers').value, 'GH₵20.00');
  assert.match(prose(answer), /internal moves, not spending or income/);
});

test('an unrecorded essential plan cannot produce a positive affordability claim', () => {
  const state = createEmptyState(); state.wallet = 10000; state.buffer = 0;
  const answer = ask(state, 'Can I spend GH₵90 on lunch?');
  assert.match(answer.title, /essentials/);
  assert.match(prose(answer), /cannot tell you this is affordable from balance alone/);
  assert.doesNotMatch(answer.title, /There’s room|fits/);
  assert.equal(answer.actions[0].route.section, 'plan');
});

test('Lux prepares a named editable payment without touching money or authorising it', () => {
  const state = createDemoState(), before = structuredClone(state);
  const answer = ask(state, 'Pay Kofi GH₵25 for Food');
  assert.equal(answer.actions[0].prepare.amount, 2500);
  assert.equal(answer.actions[0].prepare.recipient.name, 'Kofi Mensah');
  assert.equal(answer.actions[0].prepare.category, 'Food');
  const ctx = { state, draft: {}, go(route) { this.route = route; }, saveDraft() {}, closeSheet() {}, act() { assert.fail('Chat cannot act on the ledger'); } };
  assert.equal(installPreparedChatAction(ctx, answer.actions[0]), true);
  assert.deepEqual(ctx.route, { section: 'pay', page: 'review' });
  assert.equal(ctx.draft.payment.amount, 2500); assert.equal(ctx.draft.payment.completed, undefined);
  assert.deepEqual(state, before);
});

test('account-rail drafts must recheck the recipient instead of trusting an old name', () => {
  const state = createDemoState(); state.paymentFavorites = [{ id: 'fav', rail: 'momo', recipient: { name: 'Esi Doe', number: '0241234567', network: 'MTN' } }];
  const answer = getPreparedChatAction(state, 'Send GH₵30 to Esi');
  const ctx = { state, draft: {}, go(route) { this.route = route; }, saveDraft() {}, closeSheet() {} };
  installPreparedChatAction(ctx, answer.actions[0]);
  assert.equal(ctx.route.page, 'recipient'); assert.equal(ctx.draft.payment.recipient, null);
  assert.equal(ctx.draft.payment.lookupRequired, true);
  assert.equal(ctx.draft.payment.recipientForms.momo.number, '0241234567');
});

test('existing payment drafts require an explicit replacement choice', () => {
  const state = createDemoState(), original = { amount: 1500, recipient: { name: 'Other person' } };
  const ctx = { state, draft: { payment: original }, sheet(html) { this.html = html; }, go() { assert.fail('Wait for the draft choice'); } };
  installPreparedChatAction(ctx, ask(state, 'Pay Kofi GH₵25').actions[0]);
  assert.equal(ctx.draft.payment, original); assert.match(ctx.html, /Keep my existing draft/);
});

test('named Money Box transfers prepare the existing review and PIN sheet', () => {
  const state = createDemoState(); state.boxes[0].name = 'Laptop';
  const before = structuredClone(state), answer = ask(state, 'Move GH₵20 to Laptop');
  const ctx = { state, draft: {}, go(route) { this.route = route; }, saveDraft() {} };
  assert.equal(installPreparedChatAction(ctx, answer.actions[0]), true);
  assert.deepEqual(ctx.draft.boxTransferIntent, { boxId: state.boxes[0].id, amount: 2000, direction: 'save' });
  assert.equal(ctx.route.page, 'detail'); assert.deepEqual(state, before);
});

test('financial answers show a checked time and become stale when their source money changes', () => {
  const state = createDemoState(), message = { id: 'a', role: 'assistant', ...ask(state, 'What is my available balance?') };
  assert.equal(message.checkedAt, now.toISOString());
  assert.equal(isFinancialAnswerStale(state, message, now), false);
  const first = financialSnapshotKey(state); state.wallet -= 100;
  assert.notEqual(financialSnapshotKey(state), first); assert.equal(isFinancialAnswerStale(state, message, now), true);
  const html = renderChat({ state, draft: { chat: { messages: [message] } } });
  assert.match(html, /This earlier answer needs a recheck/); assert.match(html, /data-chat-recheck="a"/);
});

test('private financial snapshot contains card balances but no PIN or identity data', () => {
  const state = createDemoState(); state.settings.pin = 'secret-pin'; state.identity = { cardNumber: 'private-id' };
  state.virtualCards = [{ id: 'card', status: 'active', balance: 2000, pan: 'secret-card', cvv: 'secret-cvv' }];
  const key = financialSnapshotKey(state);
  assert.match(key, /2000/); assert.doesNotMatch(key, /secret-pin|private-id|secret-card|secret-cvv/);
});

test('only successful recent transactions can trigger a repeated-recipient Pause', () => {
  const state = createEmptyState(); state.wallet = 100000; state.buffer = 0; state.income.nextDate = '2026-11-12';
  state.transactions = [tx(5000, '2026-11-02T11:55:00Z'), tx(5000, '2026-11-02T11:58:00Z')];
  const payload = { amount: 5000, recipient: { name: 'Kofi Mensah' } };
  const before = JSON.stringify(state), history = evaluatePauseHistory(state, payload, { now });
  assert.equal(history.show, true); assert.equal(history.signals[0].id, 'repeat-recipient'); assert.match(history.reason, /2 payments/);
  state.transactions[0].status = 'pending'; assert.equal(evaluatePauseHistory(state, payload, { now }).show, false);
  state.transactions[0].status = 'success'; assert.equal(JSON.stringify(state), before);
});

test('late-night Pause requires both a high unplanned amount and a meaningful wallet share', () => {
  const state = createEmptyState(); state.wallet = 100000; state.buffer = 0; state.income.nextDate = '2026-11-12';
  const late = new Date('2026-11-02T23:30:00Z');
  assert.equal(evaluatePauseHistory(state, { amount: 500 }, { now: late }).show, false);
  assert.equal(evaluatePauseHistory(state, { amount: 15000 }, { now: late }).show, true);
  assert.equal(evaluatePauseHistory(state, { amount: 15000 }, { now }).show, false);
});

test('Pause alternatives calculate the exact shortfall and preserve a separate authorisation', () => {
  const state = createEmptyState(); state.wallet = 10000; state.buffer = 1000; state.income.nextDate = '2026-11-05';
  state.budget.items = [{ id: 'food', name: 'Food', amount: 5000, spent: 0 }];
  const values = getPauseAlternatives(state, { amount: 6000, fee: 50 }, { afterPlanned: 5000, rawAfterSpendable: -2050 });
  assert.equal(values.shortfall, 2050); assert.equal(values.safeAmount, 3950); assert.equal(values.safeSpendable, 0);
  const html = renderPauseAlternatives(state, { amount: 6000, fee: 50 }, { afterPlanned: 5000, rawAfterSpendable: -2050 });
  assert.match(html, /Try GH₵39\.50/); assert.match(html, /Add GH₵20\.50/); assert.doesNotMatch(html, /Approve|Send now/);
});

test('Lux prepares a campus merchant and asks for required bill references without inventing them', () => {
  const state = createDemoState(), before = structuredClone(state);
  const merchant = ask(state, 'Pay GH₵25 to Gɔbɛ Spot');
  const ctx = { state, draft: {}, go(route) { this.route = route; }, saveDraft() {}, closeSheet() {} };
  installPreparedChatAction(ctx, merchant.actions[0]);
  assert.equal(ctx.route.page, 'review'); assert.equal(ctx.draft.payment.serviceId, 'gobe-spot');
  assert.equal(ctx.draft.payment.amount, 2500); assert.equal(ctx.draft.payment.recipient.name, 'Gɔbɛ Spot');
  const bill = ask(state, 'Pay ECG GH₵20');
  const billContext = { ...ctx, draft: {} };
  installPreparedChatAction(billContext, bill.actions[0]);
  assert.equal(billContext.route.page, 'service'); assert.equal(billContext.route.id, 'electricity');
  assert.equal(billContext.draft.servicePayment.electricity.amountText, '20.00');
  assert.equal(billContext.draft.servicePayment.electricity.reference, '');
  assert.deepEqual(state, before);
});

test('chat spending includes card purchases net of linked refunds and actual payment fees once', () => {
  const state = createEmptyState();
  state.transactions = [tx(1000, '2026-10-28T12:00:00Z', { fee: 50 }), tx(5000, '2026-10-29T12:00:00Z', { type: 'card-purchase', rail: 'card', refunded: 2000 }), tx(2000, '2026-10-30T12:00:00Z', { type: 'card-refund', direction: 'in', rail: 'card' }), tx(9900, '2026-10-30T13:00:00Z', { type: 'card-transfer', rail: 'internal' })];
  const answer = ask(state, 'How much did I spend last week?');
  assert.equal(answer.title, 'GH₵40.50 in completed payments.');
});

test('yesterday’s money guidance asks for a recheck even if no ledger record changed', () => {
  const state = createDemoState(), answer = ask(state, 'How much can I spend today?');
  assert.equal(isFinancialAnswerStale(state, answer, now), false);
  assert.equal(isFinancialAnswerStale(state, answer, new Date('2026-11-03T00:01:00Z')), true);
});
