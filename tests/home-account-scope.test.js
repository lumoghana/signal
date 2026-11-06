import test from 'node:test';
import assert from 'node:assert/strict';
import { createEmptyState, applyAction, getSummary } from '../dist/js/model.js';
import { homeTransactions, renderHome } from '../dist/js/home-overview.js';

const run = (state, action, payload = {}) => {
  const result = applyAction(state, action, payload);
  assert.equal(result.ok, true, `${action}: ${result.message}`);
  return result;
};
const account = () => {
  const state = createEmptyState(); state.onboardingDone = true; state.wallet = 10000; state.settings.hideBalance = false;
  const cardId = run(state, 'createDemoVirtualCard').id;
  run(state, 'cardFund', { cardId, amount: 5000 });
  return { state, cardId };
};

test('Everyday history includes its card funding and return, but excludes purchases and active-card refunds', () => {
  const { state, cardId } = account(), beforePurchase = state.wallet;
  const purchase = run(state, 'cardPurchase', { cardId, amount: 1000, merchant: 'Student subscription' }).transaction;
  assert.equal(state.wallet, beforePurchase);
  const refund = run(state, 'cardRefund', { cardId, transactionId: purchase.id, amount: 1000 }).transaction;
  assert.equal(state.wallet, beforePurchase);
  assert.equal(refund.refundDestination, cardId);
  assert.equal(state.virtualCards.find(card => card.id === cardId).balance, 5000);
  assert.deepEqual(homeTransactions(state, 'everyday').map(tx => [tx.type, tx.direction, tx.amount]), [['card-transfer', 'out', 5000]]);
  run(state, 'cardReturn', { cardId, amount: 2000 });
  assert.equal(state.wallet, 7000);
  assert.deepEqual(homeTransactions(state, 'everyday').map(tx => [tx.type, tx.direction, tx.amount]), [['card-transfer', 'in', 2000], ['card-transfer', 'out', 5000]]);
  assert.equal(getSummary(state).available, 7000);
  const home = renderHome({ state, draft: { homeMovesOpen: true } });
  assert.ok(!home.includes(`root-tx:${purchase.id}`));
  assert.ok(!home.includes(`root-tx:${refund.id}`));
});

test('a refund from a closed card that actually credits Everyday stays in Everyday history', () => {
  const { state, cardId } = account();
  const purchase = run(state, 'cardPurchase', { cardId, amount: 5000, merchant: 'Campus online order' }).transaction;
  run(state, 'cardClose', { cardId });
  const beforeRefund = state.wallet;
  const refund = run(state, 'cardRefund', { cardId, transactionId: purchase.id, amount: 1000 }).transaction;
  assert.equal(refund.refundDestination, 'Everyday');
  assert.equal(state.wallet, beforeRefund + 1000);
  assert.deepEqual(homeTransactions(state, 'everyday').map(tx => [tx.type, tx.direction, tx.amount]), [['card-refund', 'in', 1000], ['card-transfer', 'out', 5000]]);
  const home = renderHome({ state, draft: { homeMovesOpen: true } });
  assert.ok(home.includes(`root-tx:${refund.id}`));
  assert.ok(!home.includes(`root-tx:${purchase.id}`));
});

test('another simulated group member’s contribution never enters personal Everyday history', () => {
  const state = createEmptyState(); state.wallet = 10000;
  const groupId = run(state, 'ensureProjectPrintingDemo').id;
  assert.equal(homeTransactions(state, 'everyday').length, 0);
  run(state, 'setGroupParticipant', { groupId, memberId: 'esi' });
  run(state, 'contributeGroup', { groupId, amount: 1000 });
  assert.equal(state.wallet, 10000);
  assert.equal(homeTransactions(state, 'everyday').length, 0);
  run(state, 'setGroupParticipant', { groupId, memberId: 'me' });
  const own = run(state, 'contributeGroup', { groupId, amount: 1000 }).transaction;
  assert.equal(state.wallet, 9000);
  assert.deepEqual(homeTransactions(state, 'everyday').map(tx => tx.id), [own.id]);
  assert.equal(getSummary(state).available, 9000);
  assert.equal(homeTransactions(state, 'savings').length, 0);
});
