import test from 'node:test';
import assert from 'node:assert/strict';
import { createEmptyState, applyAction } from '../dist/js/model.js';
import { renderPayments, bindPayments } from '../dist/js/payments.js';
import { CAMPUS_BILLERS, prepareServicePayment } from '../dist/js/payment-catalog.js';
import { parentRoute, safeRoute } from '../dist/js/navigation.js';
import { merchantIdFromCode } from '../dist/js/qr-decoder.js';

const routeFor = (page, rest = {}) => ({ section: 'pay', page, ...rest });
const fieldsFor = (id = 'school-fees', overrides = {}) => ({ biller: CAMPUS_BILLERS[id][0].id, reference: '00123456', amountText: '25.50', ...overrides });
function payloadFor(id = 'school-fees', values = fieldsFor(id)) {
  const result = prepareServicePayment(id, values); assert.equal(result.ok, true, result.message);
  const p = result.payment;
  return { paymentKind: 'service', serviceId: id, recipient: p.recipient, merchant: p.recipient.name, amount: p.amount,
    category: p.category, rail: p.rail, serviceFields: { ...p.serviceFields }, reference: p.reference, bundleName: p.bundleName,
    billerName: p.billerName, hubTab: 'bills', idempotencyKey: `campus-${id}` };
}

function harness(id = 'school-fees', values = fieldsFor(id)) {
  const state = createEmptyState({ name: 'Ama' }); state.onboardingDone = true; state.wallet = 1000000; state.buffer = 0;
  const draft = { servicePayment: { [id]: { ...values } } };
  let route = routeFor('service', { id }), cleanup;
  const auth = [], actions = [], sheets = [], routes = [], nodes = new Map(), handlers = {};
  const fields = Object.entries(values).map(([key, value]) => ({ dataset: { serviceField: key }, value }));
  const error = { textContent: '', hidden: true };
  const node = name => {
    if (!nodes.has(name)) nodes.set(name, { disabled: false, handlers: {}, addEventListener(type, listener) { this.handlers[type] = listener; } });
    return nodes.get(name);
  };
  const actionName = selector => selector.match(/^\[data-action="([^"]+)"\]$/)?.[1];
  const root = { isConnected: true,
    querySelectorAll: () => fields,
    querySelector: selector => selector === '.service-error' ? error : null,
    addEventListener(type, listener) { handlers[type] = listener; },
    removeEventListener(type, listener) { if (handlers[type] === listener) delete handlers[type]; },
  };
  const ctx = { state, draft, get route() { return route; },
    $(selector) { if (selector === '.payment-service') return root; if (selector === '#payment-error') return error; const name = actionName(selector); return name ? node(name) : null; },
    $$(selector) { const name = actionName(selector); return name ? [node(name)] : []; },
    setCapture() {}, saveDraft() {}, closeSheet() {}, toast() {}, refresh() {},
    go(next, options) { route = next; routes.push({ route: next, options }); },
    finish(next) { route = next; routes.push({ route: next, finish: true }); },
    auth(options) { auth.push(options); },
    act(type, payload) { actions.push({ type, payload }); return applyAction(state, type, payload); },
    sheet(html, bind, options = {}) {
      const buttons = new Map();
      const modal = { querySelector(selector) { const name = actionName(selector); if (!buttons.has(name)) buttons.set(name, {}); return buttons.get(name); } };
      sheets.push({ html, options, buttons }); bind(modal);
    },
  };
  const bind = () => { cleanup?.(); nodes.clear(); renderPayments(ctx, route); cleanup = bindPayments(ctx, route); };
  bind();
  return { ctx, state, draft, fields, auth, actions, sheets, routes, error, bind,
    get route() { return route; },
    serviceClick(action) { handlers.click?.({ target: { closest: () => ({ dataset: { serviceAction: action }, disabled: false }) } }); },
    click(action) { node(action).handlers.click?.(); },
    cleanup() { cleanup?.(); },
  };
}

test('campus fees keep the selected biller and student reference through Review, PIN and one debit', () => {
  for (const id of ['school-fees', 'hostel-fees']) {
    const h = harness(id), before = JSON.stringify(h.state);
    try {
      h.serviceClick('review');
      assert.equal(h.route.page, 'review'); assert.equal(h.draft.payment.amount, 2550);
      assert.equal(h.draft.payment.reference, '00123456'); assert.equal(h.draft.payment.billerName, CAMPUS_BILLERS[id][0].name);
      assert.equal(h.draft.payment.serviceFields.biller, CAMPUS_BILLERS[id][0].id); assert.equal(h.draft.payment.hubTab, 'bills');
      assert.ok(renderPayments(h.ctx, h.route).includes(CAMPUS_BILLERS[id][0].name), 'Review identifies the chosen school or hostel');
      assert.equal(JSON.stringify(h.state), before);
      h.bind(); h.click('pay-review-next');
      assert.equal(h.auth.length, 1); assert.equal(h.actions.length, 0); assert.equal(JSON.stringify(h.state), before);
      h.auth[0].onSuccess(); h.auth[0].onSuccess();
      assert.equal(h.actions.length, 1); assert.equal(h.state.wallet, 997450); assert.equal(h.state.transactions.length, 1);
      const receipt = h.state.transactions[0];
      assert.equal(receipt.billerName, CAMPUS_BILLERS[id][0].name); assert.equal(receipt.reference, '00123456');
      assert.equal(receipt.serviceFields.biller, CAMPUS_BILLERS[id][0].id); assert.equal(receipt.hubTab, 'bills');
      assert.ok(renderPayments(h.ctx, routeFor('transaction', { id: receipt.id })).includes(CAMPUS_BILLERS[id][0].name), 'The receipt retains the selected biller');
      assert.equal(h.route.page, 'status');
      h.bind(); h.click('pay-done'); assert.deepEqual(h.route, routeFor('home', { hubTab: 'bills' }));
    } finally { h.cleanup(); }
  }
});

test('a changed, missing or invented fee destination fails atomically before any financial state changes', () => {
  const original = payloadFor();
  for (const mutate of [
    p => { p.serviceFields.biller = CAMPUS_BILLERS['school-fees'][1].id; },
    p => { p.serviceFields.biller = 'unknown-school'; },
    p => { p.serviceFields.biller = CAMPUS_BILLERS['hostel-fees'][0].id; },
    p => { p.billerName = 'A different institution'; },
    p => { delete p.billerName; },
    p => { p.serviceFields.reference = ''; p.reference = ''; p.recipient.number = ''; },
    p => { p.serviceFields.reference = '<script>'; p.reference = '<script>'; p.recipient.number = '<script>'; },
  ]) {
    const state = createEmptyState(); state.wallet = 1000000;
    const before = JSON.stringify(state), payload = structuredClone(original); mutate(payload);
    const result = applyAction(state, 'payment', payload);
    assert.equal(result.ok, false); assert.equal(JSON.stringify(state), before);
  }
  const state = createEmptyState(); state.wallet = 1000000;
  const paid = applyAction(state, 'payment', original); assert.equal(paid.ok, true);
  const repeated = applyAction(state, 'payment', original); assert.equal(repeated.ok, true); assert.equal(repeated.duplicate, true);
  assert.equal(state.wallet, 997450); assert.equal(state.transactions.length, 1);
});

test('an unfinished different payment is preserved until the campus fee replacement is chosen', () => {
  const h = harness('hostel-fees'), saved = { rail: 'lumo', recipient: { name: 'Kofi', number: '@kofi' }, amount: 1900, idempotencyKey: 'saved-lunch', note: 'Still deciding' };
  h.draft.payment = saved;
  const before = JSON.stringify(h.state), savedBefore = structuredClone(saved);
  try {
    h.serviceClick('review');
    assert.equal(h.sheets.length, 1); assert.equal(h.draft.payment, saved); assert.deepEqual(saved, savedBefore);
    assert.equal(h.route.page, 'service'); assert.equal(h.actions.length, 0); assert.equal(JSON.stringify(h.state), before);
    h.sheets[0].buttons.get('service-replace').onclick();
    assert.equal(h.route.page, 'review'); assert.equal(h.draft.payment.serviceId, 'hostel-fees');
    assert.equal(h.draft.payment.billerName, CAMPUS_BILLERS['hostel-fees'][0].name);
    assert.equal(h.actions.length, 0); assert.equal(JSON.stringify(h.state), before);
  } finally { h.cleanup(); }
});

test('switching a school or student reference asks before replacing a saved fee payment', () => {
  for (const change of [{ biller: CAMPUS_BILLERS['school-fees'][1].id }, { reference: '00999999' }, { amountText: '30' }]) {
    const h = harness('school-fees', fieldsFor('school-fees', change)), saved = payloadFor();
    h.draft.payment = saved;
    const before = JSON.stringify(h.state), savedBefore = structuredClone(saved);
    try {
      h.serviceClick('review');
      assert.equal(h.sheets.length, 1); assert.equal(h.route.page, 'service');
      assert.equal(h.draft.payment, saved); assert.deepEqual(saved, savedBefore);
      assert.equal(h.actions.length, 0); assert.equal(JSON.stringify(h.state), before);
      h.sheets[0].buttons.get('service-replace').onclick();
      assert.equal(h.route.page, 'review');
      const expected = prepareServicePayment('school-fees', fieldsFor('school-fees', change)).payment;
      assert.equal(h.draft.payment.billerName, expected.billerName);
      assert.equal(h.draft.payment.reference, expected.reference); assert.equal(h.draft.payment.amount, expected.amount);
      assert.equal(h.actions.length, 0); assert.equal(JSON.stringify(h.state), before);
    } finally { h.cleanup(); }
  }
  const identical = harness(), saved = payloadFor(); identical.draft.payment = saved;
  try {
    identical.serviceClick('review'); assert.equal(identical.sheets.length, 0); assert.equal(identical.route.page, 'review');
    assert.equal(identical.actions.length, 0);
  } finally { identical.cleanup(); }
});

test('a fee payment that reaches reserved money still uses Pause before authentication', () => {
  const h = harness('school-fees', fieldsFor('school-fees', { amountText: '900' }));
  h.state.wallet = 100000; h.state.buffer = 20000;
  h.state.budget = { created: true, items: [{ id: 'food', name: 'Food', amount: 50000, spent: 0, due: h.state.income.nextDate }] };
  const before = JSON.stringify(h.state);
  try {
    h.serviceClick('review'); h.bind(); h.click('pay-review-next');
    assert.equal(h.route.page, 'pause'); assert.equal(h.auth.length, 0); assert.equal(h.actions.length, 0);
    assert.equal(JSON.stringify(h.state), before);
    const review = parentRoute(h.route, h.state, h.draft), form = parentRoute(review, h.state, h.draft);
    assert.equal(review.page, 'review'); assert.equal(form.page, 'service'); assert.equal(form.id, 'school-fees');
  } finally { h.cleanup(); }
});

test('campus bill navigation and the retained HALL code return to Top-ups and bills', () => {
  const state = createEmptyState(); state.onboardingDone = true;
  assert.equal(merchantIdFromCode('HALL'), 'hall-dues');
  for (const id of ['school-fees', 'hostel-fees', merchantIdFromCode('HALL')]) {
    assert.deepEqual(parentRoute(routeFor('service', { id }), state, {}), routeFor('home', { hubTab: 'bills' }));
    const h = id === 'hall-dues' ? harness(id, { reference: '', amountText: '10' }) : harness(id);
    try {
      h.serviceClick('exit'); assert.deepEqual(h.route, routeFor('home', { hubTab: 'bills' }));
      assert.equal(h.actions.length, 0);
    } finally { h.cleanup(); }
  }
  const payment = payloadFor();
  for (const page of ['recipient', 'recipient-confirm', 'conversation', 'amount']) {
    const safe = safeRoute(routeFor(page), state, { payment });
    assert.equal(safe.page, 'review'); assert.equal(parentRoute(safe, state, { payment }).id, 'school-fees');
  }
});
