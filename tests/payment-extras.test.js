import test from 'node:test';
import assert from 'node:assert/strict';
import { createDemoState, applyAction } from '../dist/js/model.js';
import { renderPaymentExtras, bindPaymentExtras } from '../dist/js/payment-extras.js';

const person = { id: 'kofi', name: 'Kofi Mensah', number: '024 555 0182' };
function harness(page = 'cards', overrides = {}) {
  const state = createDemoState(), draft = {}, routes = [], payments = [], authentications = [], actions = [];
  const handlers = {};
  const root = { isConnected: true, addEventListener: (name, handler) => handlers[name] = handler, removeEventListener: name => delete handlers[name] };
  let refreshes = 0;
  const ctx = { state, draft, paymentContacts: [person], $: () => root, go: route => routes.push(route), startPayment: (...args) => payments.push(args), auth: value => authentications.push(value), act: (type, payload) => { actions.push({ type, payload }); return applyAction(state, type, payload); }, refresh: () => refreshes++, saveDraft() {}, setCapture() {}, toast() {}, ...overrides };
  const route = { section: 'pay', page, list: 'recent', backTo: { section: 'pay', page: 'home', hubTab: 'send' } };
  const cleanup = bindPaymentExtras(ctx, route);
  return { ctx, state, draft, route, routes, payments, authentications, actions, root, cleanup, get refreshes() { return refreshes; }, click(dataset) { handlers.click?.({ target: { closest: () => ({ dataset, disabled: false }) } }); } };
}

test('card creation and freezing require authentication and never create funds', () => {
  const h = harness(), beforeWallet = h.state.wallet;
  h.click({ extraAction: 'create-card' });
  assert.equal(h.state.virtualCard, null);
  assert.equal(h.actions.length, 0);
  h.authentications.at(-1).onSuccess();
  assert.equal(h.state.virtualCard.last4, '4242');
  assert.equal(h.state.wallet, beforeWallet);
  h.click({ extraAction: 'toggle-card' });
  assert.equal(h.state.virtualCard.status, 'active');
  h.authentications.at(-1).onSuccess();
  assert.equal(h.state.virtualCard.status, 'frozen');
  assert.equal(h.state.wallet, beforeWallet);
  assert.equal(h.state.transactions.length, 6);
  h.cleanup();
});

test('cancelled or detached card authentication does not apply an action', () => {
  const h = harness();
  h.click({ extraAction: 'create-card' });
  h.authentications.at(-1).onCancel();
  assert.equal(h.actions.length, 0);
  h.click({ extraAction: 'create-card' });
  h.cleanup(); h.authentications.at(-1).onSuccess();
  assert.equal(h.actions.length, 0);
  assert.equal(h.state.virtualCard, null);
});

test('card and recent views respect hidden balances and make the sample boundary explicit', () => {
  const h = harness();
  applyAction(h.state, 'createDemoVirtualCard');
  h.state.settings.hideBalance = true;
  const html = renderPaymentExtras(h.ctx, h.route);
  assert.match(html, /No live card is issued/);
  assert.match(html, /DEMO •••• 4242/);
  assert.match(html, /••••\.••/);
  assert.doesNotMatch(html, /GH₵2,480/);
  const recent = renderPaymentExtras(h.ctx, { ...h.route, page: 'recipients-list', list: 'recent' });
  assert.doesNotMatch(recent, /GH₵25\.00/);
  h.cleanup();
});

test('Pay again uses saved recipient metadata and never guesses a bank account from a contact', () => {
  const h = harness('recipients-list');
  h.state.transactions = [
    { id: 'stored', type: 'payment', merchant: 'Kofi', rail: 'momo', recipient: { name: 'Kofi', number: '0241112222' }, amount: 2000, status: 'success' },
    { id: 'known', type: 'payment', merchant: person.name, rail: 'lumo', amount: 3000, status: 'success' },
    { id: 'unknown-bank', type: 'payment', merchant: person.name, rail: 'bank', amount: 4000, status: 'success' },
  ];
  const before = JSON.stringify(h.state);
  h.click({ extraRepeat: 'stored' }); h.click({ extraRepeat: 'known' }); h.click({ extraRepeat: 'unknown-bank' });
  assert.deepEqual(h.payments, [[{ name: 'Kofi', number: '0241112222' }, 'momo'], [{ ...person }, 'lumo']]);
  assert.equal(JSON.stringify(h.state), before);
  const html = renderPaymentExtras(h.ctx, h.route);
  assert.doesNotMatch(html, /data-extra-repeat="unknown-bank"/);
  h.click({ extraTransaction: 'unknown-bank' });
  assert.equal(h.routes.at(-1).id, 'unknown-bank');
  assert.deepEqual(h.routes.at(-1).backTo, h.route);
  h.cleanup();
});

test('saved favourites start a payment with their exact rail and destination', () => {
  const h = harness('recipients-list');
  const result = applyAction(h.state, 'savePaymentFavorite', { rail: 'bank', recipient: { name: 'Esi', number: '1234567890', bank: 'GCB Bank' } });
  assert.equal(result.ok, true, result.message);
  const before = JSON.stringify(h.state);
  h.click({ extraFavourite: result.id });
  assert.deepEqual(h.payments, [[{ name: 'Esi', number: '1234567890', bank: 'GCB Bank' }, 'bank']]);
  assert.equal(JSON.stringify(h.state), before);
  h.cleanup();
});
