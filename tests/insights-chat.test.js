import test from 'node:test';
import assert from 'node:assert/strict';
import { createEmptyState } from '../dist/js/model.js';
import { getMoneyAnswer, getSpendingPeriod } from '../dist/js/chat.js';
import { getMonthlyInsights } from '../dist/js/insights.js';

const now = new Date('2026-11-02T06:00:00Z');
const tx = (amount, at, overrides = {}) => ({ type: 'payment', direction: 'out', status: 'success', amount, at, rail: 'momo', category: 'Food', ...overrides });

test('a named month uses its own calendar range and label across years and leap days', () => {
  assert.deepEqual(getSpendingPeriod('Explain my spending for October 2026.', now), { label: 'in October 2026', month: '2026-10', start: '2026-10-01', end: '2026-11-01', through: null });
  assert.equal(getSpendingPeriod('Spending in December 2025', now).end, '2026-01-01');
  const state = createEmptyState();
  state.transactions = [tx(500, '2024-01-31T23:59:59Z'), tx(1500, '2024-02-01T00:00:00Z'), tx(2500, '2024-02-29T23:59:59Z'), tx(9000, '2024-03-01T00:00:00Z')];
  const answer = getMoneyAnswer(state, 'Explain my spending for February 2024.', now);
  assert.equal(answer.title, 'GH₵40.00 in completed payments.');
  assert.match(answer.paragraphs[0], /2 payments in February 2024/);
  assert.deepEqual(answer.actions[0].route, { section: 'activity', page: 'insights', month: '2024-02' });
});

test('an Insights chat question reports exactly the selected month’s completed spending', () => {
  const state = createEmptyState();
  state.transactions = [tx(1200, '2026-10-01T00:00:00Z'), tx(2300, '2026-10-31T23:59:59Z'), tx(9900, '2026-11-01T00:00:00Z'), tx(700, '2026-10-15T00:00:00Z', { status: 'pending' }), tx(800, '2026-10-15T00:00:00Z', { status: 'reversed' }), tx(900, '2026-10-15T00:00:00Z', { type: 'saving', rail: 'internal' }), tx(1000, '2026-10-15T00:00:00Z', { rail: 'internal' })];
  const insights = getMonthlyInsights(state, '2026-10', now), answer = getMoneyAnswer(state, 'Explain my spending for October 2026.', now);
  assert.equal(insights.spent, 3500);
  assert.equal(answer.title, 'GH₵35.00 in completed payments.');
  assert.match(answer.paragraphs[0], /2 payments in October 2026/);
});

test('today, this month and named current month retain the correct current period', () => {
  const state = createEmptyState();
  state.transactions = [tx(1000, '2026-10-31T12:00:00Z'), tx(2000, '2026-11-01T12:00:00Z'), tx(3000, '2026-11-02T18:00:00Z'), tx(9900, '2026-11-03T00:00:00Z')];
  assert.equal(getMoneyAnswer(state, 'Where did my money go today?', now).title, 'GH₵30.00 in completed payments.');
  assert.equal(getMoneyAnswer(state, 'Where did my money go this month?', now).title, 'GH₵50.00 in completed payments.');
  assert.equal(getMoneyAnswer(state, 'Explain my spending for November 2026.', now).title, 'GH₵50.00 in completed payments.');
});

test('empty named months cannot silently answer a different month or the entire history', () => {
  const state = createEmptyState(); state.transactions = [tx(9900, '2026-11-01T00:00:00Z')];
  assert.equal(getMoneyAnswer(state, 'Explain my spending for October 2026.', now).title, 'No completed payments in October 2026.');
});
