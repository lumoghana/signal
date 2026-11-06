import test from 'node:test';
import assert from 'node:assert/strict';
import { createEmptyState, applyAction, evaluatePayment, getSummary } from '../dist/js/model.js';
import { getPauseAlternatives, renderPauseAlternatives } from '../dist/js/pause-intelligence.js';
import { renderPayments, paymentReceiptText } from '../dist/js/payments.js';
import { reviewOutflowImpact } from '../dist/js/outflow-impact.js';
import { addFavourite } from '../dist/js/payment-extras.js';
import { resolveDemoRecipient } from '../dist/js/recipient-lookup.js';

const day = offset => new Date(Date.now() + offset * 86400000).toISOString().slice(0, 10);
function account({ wallet = 100000, food = 60000, buffer = 10000 } = {}) {
  const state = createEmptyState({ name: 'Ama' });
  state.onboardingDone = true; state.wallet = wallet; state.buffer = buffer;
  state.income.nextDate = day(10);
  state.budget.created = true; state.budget.items = [{ id: 'food', name: 'Food', amount: food, spent: 0 }];
  return state;
}
const act = (state, type, payload) => { const result = applyAction(state, type, payload); assert.equal(result.ok, true, result.message); return result; };

test('a smaller planned payment is never suggested when reducing it retains the same plan shortfall', () => {
  const state = account({ wallet: 60000 }), draft = { amount: 20000, fee: 0, category: 'Food' };
  const before = JSON.stringify(state), original = evaluatePayment(state, draft);
  assert.equal(original.rawAfterSpendable, -10000);
  assert.equal(evaluatePayment(state, { ...draft, amount: 10000 }).rawAfterSpendable, -10000);
  const alternatives = getPauseAlternatives(state, draft, original);
  assert.equal(alternatives.safeAmount, 0); assert.equal(alternatives.shortfall, 10000);
  assert.doesNotMatch(renderPauseAlternatives(state, draft, original), /data-pause-safe/);
  assert.equal(JSON.stringify(state), before);
});

test('a smaller suggestion recalculates fees, category allocation and every Pause condition', () => {
  const state = account({ wallet: 10000, food: 5000, buffer: 1000 });
  state.budget.endDate = day(0); state.income.nextDate = day(0);
  const draft = { amount: 6000, fee: 50, category: 'Other' }, values = getPauseAlternatives(state, draft);
  assert.equal(values.safeAmount, 3950);
  const suggested = evaluatePayment(state, { ...draft, amount: values.safeAmount });
  assert.equal(suggested.allowed, true); assert.equal(suggested.needed, false);
  assert.equal(suggested.rawAfterSpendable, 0); assert.equal(values.safeSpendable, suggested.afterSpendable);
});

test('alternatives never alter a catalogue checkout or a fixed money request', () => {
  const state = account({ wallet: 10000, food: 5000, buffer: 1000 });
  for (const fixed of [{ serviceId: 'data' }, { requestId: 'incoming-request' }]) {
    const values = getPauseAlternatives(state, { amount: 6000, fee: 50, ...fixed });
    assert.equal(values.safeAmount, 0); assert.equal(values.shortfall, 2050);
  }
});

test('a repeated-recipient Pause explains the actual trigger while retaining the PIN journey', () => {
  const state = account({ food: 0, buffer: 0 });
  state.transactions = [1, 2].map(index => ({ id: `recent-${index}`, type: 'payment', status: 'success', direction: 'out', amount: 6000, merchant: 'Kofi', recipient: { name: 'Kofi' }, rail: 'lumo', at: new Date(Date.now() - index * 60000).toISOString() }));
  const draft = { amount: 1000, category: 'Other', recipient: { name: 'Kofi' }, rail: 'lumo' };
  const check = evaluatePayment(state, draft), before = JSON.stringify(state);
  assert.equal(check.historySignals[0].id, 'repeat-recipient'); assert.equal(check.needed, true);
  const html = renderPayments({ state, draft: { payment: draft } }, { section: 'pay', page: 'pause' });
  assert.ok(html.includes(check.reason)); assert.match(html, /Continue payment/);
  assert.equal(JSON.stringify(state), before);
});

test('amount keeps optional plan controls collapsed and never duplicates the money input', () => {
  const state = account(), draft = { amount: 2500, category: 'Food', recipient: { name: 'Kofi' }, rail: 'lumo' };
  const html = renderPayments({ state, draft: { payment: draft } }, { section: 'pay', page: 'amount' });
  assert.match(html, /<details class="payment-optional-details" >/);
  assert.equal((html.match(/id="payment-amount"/g) || []).length, 1);
  assert.match(html, /class="payment-remember-choice"/);
});

test('card transfers are not spending; purchases, holds, declines and partial refunds update the original plan once', () => {
  const state = account(), initial = getSummary(state).total;
  const card = act(state, 'createDemoVirtualCard', {}).id;
  act(state, 'cardFund', { cardId: card, amount: 20000, idempotencyKey: 'fund-card' });
  assert.equal(state.budget.items[0].spent, 0); assert.equal(getSummary(state).total, initial);
  const purchase = act(state, 'cardPurchase', { cardId: card, amount: 5000, merchant: 'Lunch online', category: 'Food', idempotencyKey: 'buy' });
  assert.equal(state.wallet, 80000); assert.equal(state.budget.items[0].spent, 5000);
  assert.equal(act(state, 'cardPurchase', { cardId: card, amount: 5000, merchant: 'Lunch online', category: 'Food', idempotencyKey: 'buy' }).duplicate, true);
  assert.equal(state.budget.items[0].spent, 5000);
  const pending = act(state, 'cardPurchase', { cardId: card, amount: 3000, merchant: 'Campus snacks', category: 'Food', status: 'pending' });
  assert.equal(state.budget.items[0].spent, 8000); assert.equal(getSummary(state).pendingCardHolds, 3000); assert.equal(getSummary(state).total, initial - 5000);
  act(state, 'cardResolvePurchase', { cardId: card, transactionId: pending.id, status: 'failed' });
  assert.equal(state.budget.items[0].spent, 5000);
  assert.equal(applyAction(state, 'cardResolvePurchase', { cardId: card, transactionId: pending.id, status: 'failed' }).ok, false);
  act(state, 'cardRefund', { cardId: card, transactionId: purchase.id, amount: 2000, idempotencyKey: 'partial-refund' });
  assert.equal(state.budget.items[0].spent, 3000); assert.equal(getSummary(state).total, initial - 3000);
  assert.equal(act(state, 'cardRefund', { cardId: card, transactionId: purchase.id, amount: 2000, idempotencyKey: 'partial-refund' }).duplicate, true);
  assert.equal(state.budget.items[0].spent, 3000);
});

test('an old card failure and refund change their archived plan while leaving current spending intact', () => {
  const state = account(), oldPeriod = state.budget.periodId, card = act(state, 'createDemoVirtualCard', {}).id;
  act(state, 'cardFund', { cardId: card, amount: 30000 });
  const pending = act(state, 'cardPurchase', { cardId: card, amount: 5000, merchant: 'Old lunch', category: 'Food', status: 'pending' });
  const paid = act(state, 'cardPurchase', { cardId: card, amount: 4000, merchant: 'Old meal', category: 'Food' });
  act(state, 'startBudgetPeriod', { startDate: day(0), endDate: day(30) });
  act(state, 'cardPurchase', { cardId: card, amount: 3000, merchant: 'New lunch', category: 'Food' });
  act(state, 'cardResolvePurchase', { cardId: card, transactionId: pending.id, status: 'failed' });
  act(state, 'cardRefund', { cardId: card, transactionId: paid.id, amount: 2000 });
  assert.equal(state.budget.items[0].spent, 3000);
  assert.equal(state.budgetHistory.find(period => period.periodId === oldPeriod).items[0].spent, 2000);
});

test('confirmed bill payment is not labelled delivered until its delivery record confirms it', () => {
  const state = account();
  const tx = { id: 'topup', type: 'payment', merchant: 'MTN Data', serviceId: 'data', status: 'success', amount: 2000, delivery: { status: 'pending' } };
  state.transactions.push(tx); const ctx = { state, draft: {} }, route = { section: 'pay', page: 'status', id: tx.id };
  let html = renderPayments(ctx, route); assert.match(html, /Awaiting delivery/); assert.doesNotMatch(html, /All done/);
  tx.delivery.status = 'failed'; html = renderPayments(ctx, route); assert.match(html, /Delivery needs help/); assert.match(html, /Get help with this payment/); assert.match(html, /Don’t pay again/);
  tx.delivery.status = 'delivered'; html = renderPayments(ctx, route); assert.match(html, /Demo service delivered/); assert.match(html, /All done/);
});

test('shared personal outflow review cannot authorise money and ignores repeated continue taps', () => {
  const state = account(), handlers = {}, continued = [], sheets = [], errors = [];
  const root = { querySelector: selector => ({ addEventListener: (name, handler) => { handlers[selector] = handler; } }) };
  const ctx = { state, toast: message => errors.push(message), closeSheet() {}, sheet: (html, bind) => { sheets.push(html); bind(root); } };
  const before = JSON.stringify(state);
  assert.equal(reviewOutflowImpact(ctx, { amount: 40000, merchant: 'Project Printing', onContinue: impact => continued.push(impact) }), true);
  assert.match(sheets[0], /Lumo Pause/); assert.match(sheets[0], /Your PIN is still required/);
  handlers['[data-outflow-continue]'](); handlers['[data-outflow-continue]']();
  assert.equal(continued.length, 1); assert.equal(JSON.stringify(state), before);
  assert.equal(reviewOutflowImpact(ctx, { amount: 200000 }), false); assert.equal(errors.length, 1);
});

function favouriteForm(createLookup = () => ({ run: request => Promise.resolve(resolveDemoRecipient(request)), cancel() {}, dispose() {} })) {
  const node = value => ({ value, hidden: false, disabled: false, textContent: '', innerHTML: '', handlers: {}, addEventListener(name, handler) { this.handlers[name] = handler; }, setAttribute() {}, removeAttribute() {} });
  const state = account(), actions = [], nodes = new Map();
  for (const [name, value] of Object.entries({ favouriteRail: 'lumo', favouriteName: 'A made-up name', favouriteNumber: '0555550124', favouriteBank: 'GCB Bank' })) nodes.set(`[name="${name}"]`, node(value));
  for (const selector of ['.error', '[data-favourite-result]', '[data-favourite-feedback]', '[type="submit"]', '[data-favourite-name]', '[data-favourite-destination]', '[data-favourite-bank]', '[data-favourite-demo]']) nodes.set(selector, node());
  const form = node(); form.querySelector = selector => nodes.get(selector);
  const root = { isConnected: true, querySelector: selector => selector === 'form' ? form : nodes.get(selector), querySelectorAll: () => [] };
  let html = '', onClose;
  const ctx = { state, paymentContacts: [], sheet: (value, bind, options) => { html = value; onClose = options.onClose; bind(root); }, act: (type, payload) => { actions.push({ type, payload }); return applyAction(state, type, payload); }, closeSheet: () => onClose(), setCapture() {}, refresh() {}, toast() {} };
  addFavourite(ctx, { createLookup });
  return { state, actions, nodes, form, root, get html() { return html; }, close: () => onClose(), rail(value) { const field = nodes.get('[name="favouriteRail"]'); field.value = value; field.handlers.change(); }, submit: () => form.handlers.submit({ preventDefault() {} }) };
}

test('saving a MoMo favourite uses the same registered-name/network lookup and explicit confirmation', async () => {
  const form = favouriteForm(), before = form.state.wallet;
  form.rail('momo');
  assert.equal(form.nodes.get('[data-favourite-name]').hidden, true);
  assert.doesNotMatch(form.html, /favouriteNetwork|Other Ghanaian bank/);
  await form.submit();
  assert.equal(form.actions.length, 0, 'finding the account does not save it without confirmation');
  assert.match(form.nodes.get('[data-favourite-result]').innerHTML, /Akosua Owusu/);
  assert.match(form.nodes.get('[data-favourite-result]').innerHTML, /Telecel Cash/, 'ported number uses the lookup network');
  await form.submit(); await form.submit();
  assert.equal(form.actions.length, 1);
  assert.equal(form.state.paymentFavorites[0].recipient.name, 'Akosua Owusu');
  assert.equal(form.state.paymentFavorites[0].recipient.network, 'Telecel Cash');
  assert.equal(form.state.wallet, before);
});

test('changing favourite account details invalidates the displayed identity; a dismissed lookup cannot save', async () => {
  const form = favouriteForm(); form.rail('momo'); await form.submit();
  const number = form.nodes.get('[name="favouriteNumber"]'); number.value = '0205550166'; number.handlers.input();
  await form.submit(); assert.equal(form.actions.length, 0);
  assert.match(form.nodes.get('[data-favourite-result]').innerHTML, /Efua Asante/);
  let finish;
  const dismissed = favouriteForm(() => ({ run: () => new Promise(resolve => { finish = resolve; }), cancel() {}, dispose() {} }));
  dismissed.rail('momo'); const waiting = dismissed.submit(); dismissed.close(); finish(resolveDemoRecipient({ rail: 'momo', number: '0555550124' })); await waiting;
  assert.equal(dismissed.actions.length, 0); assert.equal(dismissed.nodes.get('[data-favourite-result]').innerHTML, '');
});

test('a bank favourite needs its matching bank and preserves leading-zero account numbers', async () => {
  const form = favouriteForm(); form.rail('bank');
  const number = form.nodes.get('[name="favouriteNumber"]'), bank = form.nodes.get('[name="favouriteBank"]');
  number.value = '0123456789'; number.handlers.input();
  await form.submit();
  assert.equal(form.actions.length, 0); assert.match(form.nodes.get('.error').textContent, /don’t match/);
  bank.value = 'Ecobank Ghana'; bank.handlers.change(); await form.submit(); await form.submit();
  assert.equal(form.actions.length, 1);
  assert.equal(form.state.paymentFavorites[0].recipient.number, '0123456789');
  assert.equal(form.state.paymentFavorites[0].recipient.name, 'Esi Boateng');
  assert.equal(form.state.paymentFavorites[0].recipient.bank, 'Ecobank Ghana');
});

test('outside IOU repayments keep transaction details and shared records distinct from Lumo income', () => {
  for (const rail of ['cash', 'momo', 'bank']) {
    const state = account(), tx = { id: `manual-${rail}`, type: 'iou-manual-receipt', direction: 'in', rail, manual: true, amount: 3000, merchant: 'Kofi', status: 'success', at: new Date().toISOString() };
    state.transactions.push(tx); const before = JSON.stringify(state);
    for (const page of ['transaction', 'status']) {
      const html = renderPayments({ state, draft: {} }, { section: 'pay', page, id: tx.id });
      assert.match(html, /Outside repayment recorded/); assert.match(html, /Lumo balance unchanged/); assert.match(html, /Recorded by you/);
      assert.doesNotMatch(html, /pay-simulate|pay-retry|pay-delivery|pay-split-receipt|Money sent|All done|A little reply/);
    }
    const shared = paymentReceiptText(tx);
    assert.match(shared, /^Outside repayment recorded/); assert.match(shared, /Lumo balance unchanged/);
    assert.doesNotMatch(shared, /^Lumo payment|Payment amount returned/);
    assert.equal(JSON.stringify(state), before);
  }
});
