import test from 'node:test';
import assert from 'node:assert/strict';
import { createEmptyState, applyAction } from '../dist/js/model.js';
import { getMoneyAnswer } from '../dist/js/money-answers.js';
import { getLuxAnswer } from '../dist/js/lux-brain.js';

const DAY = 86400000;
const record = state => {
  const result = applyAction(state, 'createExternalBalance', { type: 'cash', name: 'Pocket cash', balance: 10000 });
  assert.equal(result.ok, true); return result.externalBalance;
};
const prose = answer => [answer.title, ...answer.paragraphs].join(' ');

test('all-money answers label stale totals as estimates using the caller time and offer a balance check', () => {
  const s = createEmptyState(), account = record(s), now = new Date(), old = new Date(now.getTime() - 4 * DAY).toISOString();
  account.confirmedAt = old; account.updatedAt = old;
  const answer = getMoneyAnswer(s, 'All my money', now);
  assert.match(prose(answer), /recorded estimate|estimate from your recorded money/);
  assert.match(prose(answer), /1 outside balance needs a check/);
  assert.match(prose(answer), new RegExp(old.slice(0, 10)));
  assert.equal(answer.stats.at(-1).label, 'Recorded estimate');
  assert.deepEqual(answer.actions[0].route, { section: 'life', page: 'money-check' });
  const earlier = getMoneyAnswer(s, 'What is my cash balance?', new Date(Date.parse(old) + 2 * DAY));
  assert.doesNotMatch(prose(earlier), /estimate|needs a check/);
  assert.equal(earlier.stats.at(-1).label, 'All recorded money');
});

test('a quick movement keeps an old confirmation stale and absolute confirmation clears the estimate warning', () => {
  const s = createEmptyState(), account = record(s), old = new Date(Date.now() - 5 * DAY).toISOString();
  account.confirmedAt = old; account.updatedAt = old;
  const moved = applyAction(s, 'externalMovement', { id: account.id, direction: 'out', amount: 2500, expectedRevision: account.revision, expectedUpdatedAt: account.updatedAt, idempotencyKey: 'freshness-movement' });
  assert.equal(moved.ok, true); assert.equal(account.confirmedAt, old); assert.notEqual(account.updatedAt, old);
  for (const answer of [getMoneyAnswer(s, 'What is my cash balance?'), getLuxAnswer(s, 'All my money')]) {
    assert.match(prose(answer), /1 outside balance needs a check/);
    assert.match(prose(answer), new RegExp(old.slice(0, 10)));
    assert.equal(answer.stats.at(-1).label, 'Recorded estimate');
    assert.equal(answer.stats.at(-1).value, 'GH₵75.00');
  }
  const confirmed = applyAction(s, 'confirmExternalBalance', { id: account.id, balance: 7500, expectedRevision: account.revision, expectedUpdatedAt: account.updatedAt, idempotencyKey: 'freshness-check' });
  assert.equal(confirmed.ok, true);
  const checked = getMoneyAnswer(s, 'All my money');
  assert.doesNotMatch(prose(checked), /estimate|needs a check/);
  assert.equal(checked.stats.at(-1).label, 'All recorded money');
  assert.equal(s.wallet, 0);
});
