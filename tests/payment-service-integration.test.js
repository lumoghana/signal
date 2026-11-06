import test from 'node:test';
import assert from 'node:assert/strict';
import { createEmptyState, applyAction } from '../dist/js/model.js';
import { renderPayments, bindPayments } from '../dist/js/payments.js';
import { parentRoute, safeRoute } from '../dist/js/navigation.js';
import { prepareServicePayment } from '../dist/js/payment-catalog.js';

function harness(id, values) {
  const state = createEmptyState({ name: 'Ama' }); state.onboardingDone = true; state.wallet = 100000; state.buffer = 0;
  const draft = { servicePayment: { [id]: { network: 'MTN', bundle: 'weekly', ...values } } };
  let route = { section: 'pay', page: 'service', id }, capture = null, cleanup = null;
  const routes = [], auth = [], actions = [], sheets = [], serviceHandlers = {}, nodes = new Map(), error = { textContent: '', hidden: true };
  const fields = Object.entries(draft.servicePayment[id]).map(([key, value]) => ({ dataset: { serviceField: key }, value }));
  const serviceRoot = { isConnected: true, querySelectorAll: () => fields, querySelector: selector => selector === '.service-error' ? error : null,
    addEventListener(type, callback) { serviceHandlers[type] = callback; }, removeEventListener(type, callback) { if (serviceHandlers[type] === callback) delete serviceHandlers[type]; } };
  const node = action => { if (!nodes.has(action)) nodes.set(action, { disabled: false, listeners: {}, addEventListener(type, cb) { this.listeners[type] = cb; } }); return nodes.get(action); };
  const actionFor = selector => selector.match(/^\[data-action="([^"]+)"\]$/)?.[1];
  const ctx = { state, draft, get route() { return route; },
    $(selector) { if (selector === '.payment-service') return serviceRoot; if (selector === '#payment-error') return error; const action = actionFor(selector); return action ? node(action) : null; },
    $$(selector) { const action = actionFor(selector); return action ? [node(action)] : []; },
    setCapture(fn) { capture = fn; }, saveDraft() {}, closeSheet() {}, toast() {}, refresh() {},
    go(next, options) { route = next; routes.push({ route: next, options }); }, finish(next) { route = next; routes.push({ route: next, finish: true }); },
    auth(value) { auth.push(value); }, act(type, payload) { actions.push({ type, payload }); return applyAction(state, type, payload); },
    sheet(html, bind) { const buttons = new Map(); const modal = { querySelector(selector) { const action = actionFor(selector); if (!buttons.has(action)) buttons.set(action, {}); return buttons.get(action); } }; sheets.push({ html, buttons }); bind(modal); },
  };
  const bind = () => { cleanup?.(); nodes.clear(); renderPayments(ctx, route); cleanup = bindPayments(ctx, route); };
  bind();
  return { state, draft, ctx, fields, routes, auth, actions, sheets, error, get route() { return route; }, bind,
    serviceClick(action) { serviceHandlers.click({ target: { closest: () => ({ dataset: { serviceAction: action }, disabled: false }) } }); },
    click(action) { node(action).listeners.click(); }, capture() { capture?.(); }, cleanup() { cleanup?.(); },
  };
}

test('data setup prepares the canonical fixed bundle, then authenticates before a single debit and keeps the Bills return tab', () => {
  const h = harness('data', { phone: '024 000 0000', amountText: '0.01', bundle: 'weekly' });
  const before = JSON.stringify(h.state);
  h.serviceClick('review');
  assert.equal(h.route.page, 'review'); assert.equal(h.draft.payment.amount, 2000);
  assert.equal(h.draft.payment.bundleName, 'Demo weekly bundle'); assert.equal(h.draft.payment.hubTab, 'bills');
  assert.equal(JSON.stringify(h.state), before);
  h.bind(); h.click('pay-review-next');
  assert.equal(h.auth.length, 1); assert.equal(h.actions.length, 0); assert.equal(JSON.stringify(h.state), before);
  h.auth[0].onSuccess(); h.auth[0].onSuccess();
  assert.equal(h.state.wallet, 98000); assert.equal(h.state.transactions.length, 1);
  const tx = h.state.transactions[0];
  assert.equal(tx.serviceId, 'data'); assert.equal(tx.reference, '0240000000'); assert.equal(tx.amount, 2000);
  assert.equal(tx.bundleName, 'Demo weekly bundle'); assert.equal(tx.hubTab, 'bills');
  assert.equal(h.route.page, 'status');
  const html = renderPayments(h.ctx, h.route);
  assert.match(html, /Payment made. Awaiting delivery/); assert.doesNotMatch(html, /All done/); assert.match(html, /No real bill was settled or top-up delivered/);
  h.bind(); h.click('pay-done');
  assert.deepEqual(h.route, { section: 'pay', page: 'home', hubTab: 'bills' });
  h.cleanup();
});

test('editing a fixed bundle reopens the service form and re-canonicalizes its price before review', () => {
  const h = harness('data', { phone: '0240000000', bundle: 'daily' });
  h.serviceClick('review'); h.bind(); h.click('pay-edit-amount');
  assert.equal(h.route.page, 'service'); assert.equal(h.route.id, 'data'); assert.equal(h.route.edit, true);
  assert.equal(h.draft.servicePayment.data.bundle, 'daily');
  h.bind();
  h.draft.servicePayment.data.bundle = 'monthly';
  h.fields.find(field => field.dataset.serviceField === 'bundle').value = 'monthly';
  h.serviceClick('review');
  assert.equal(h.draft.payment.amount, 5000); assert.equal(h.draft.payment.bundleName, 'Demo monthly bundle');
  assert.equal(h.draft.payment.serviceFields.bundle, 'monthly'); assert.equal(h.actions.length, 0);
  assert.equal(h.state.wallet, 100000);
  h.cleanup();
});

test('campus checkout and its receipt retain merchant, category and source tab', () => {
  const h = harness('gobe-spot', { amountText: '25.50', reference: 'Table 4' });
  h.serviceClick('review');
  assert.equal(h.draft.payment.amount, 2550); assert.equal(h.draft.payment.category, 'Food');
  assert.equal(h.draft.payment.reference, 'Table 4'); assert.equal(h.draft.payment.hubTab, 'campus');
  h.bind(); h.click('pay-review-next'); h.auth[0].onSuccess();
  const tx = h.state.transactions[0];
  assert.equal(tx.merchant, 'Gɔbɛ Spot'); assert.equal(tx.category, 'Food'); assert.equal(tx.reference, 'Table 4');
  assert.equal(tx.hubTab, 'campus'); assert.equal(tx.rail, 'campus');
  const detail = renderPayments(h.ctx, { section: 'pay', page: 'transaction', id: tx.id });
  assert.match(detail, /Table 4/); assert.match(detail, /Campus Pay/);
  h.bind(); h.click('pay-done'); assert.equal(h.route.hubTab, 'campus');
  h.cleanup();
});

test('returning from a service Pause keeps review back-navigation inside the service form', () => {
  const h = harness('electricity', { amountText: '900', reference: '0123456789' });
  h.state.buffer = 20000;
  h.state.budget = { created: true, items: [{ id: 'food', name: 'Food', amount: 50000, spent: 0, due: h.state.income.nextDate }] };
  h.serviceClick('review'); h.bind(); h.click('pay-review-next');
  assert.equal(h.route.page, 'pause');
  const review = parentRoute(h.route, h.state, h.draft);
  assert.equal(review.page, 'review');
  const form = parentRoute(review, h.state, h.draft);
  assert.equal(form.page, 'service'); assert.equal(form.id, 'electricity');
  assert.equal(h.actions.length, 0); assert.equal(h.state.wallet, 100000);
  h.cleanup();
});

test('stale generic service entries cannot reopen an unrestricted amount editor', () => {
  const h = harness('data', { phone: '0240000000', bundle: 'weekly' });
  h.serviceClick('review');
  for (const page of ['recipient', 'conversation', 'amount']) {
    const safe = safeRoute({ section: 'pay', page }, h.state, h.draft);
    assert.equal(safe.page, 'review');
    assert.equal(parentRoute(safe, h.state, h.draft).page, 'service');
  }
  h.cleanup();
});

test('resuming a saved service from another checkout restores review and its source form', () => {
  for (const oldPage of ['amount', 'recipient', 'conversation', undefined]) {
    const h = harness('electricity', { reference: '0123456789', amountText: '25' });
    const p = prepareServicePayment('data', { network: 'MTN', phone: '0240000000', bundle: 'weekly' }).payment;
    h.draft.payment = { ...p, serviceId: p.service.id, paymentKind: 'service', hubTab: 'bills', idempotencyKey: 'saved-data',
      ...(oldPage ? { lastRoute: { section: 'pay', page: oldPage } } : {}) };
    h.serviceClick('review');
    assert.equal(h.sheets.length, 1);
    h.sheets[0].buttons.get('service-resume').onclick();
    assert.equal(h.route.page, 'review');
    const form = parentRoute(h.route, h.state, h.draft);
    assert.equal(form.page, 'service'); assert.equal(form.id, 'data');
    assert.equal(h.actions.length, 0); assert.equal(h.state.wallet, 100000);
    h.cleanup();
  }
});
