import test from 'node:test';
import assert from 'node:assert/strict';
import { createEmptyState, applyAction, evaluatePayment } from '../dist/js/model.js';
import { renderPayments, bindPayments } from '../dist/js/payments.js';
import { parentRoute } from '../dist/js/navigation.js';

function account() {
  const state = createEmptyState({ name: 'Ama' });
  state.onboardingDone = true; state.wallet = 100000; state.buffer = 10000;
  state.budget = { created: true, items: [
    { id: 'food', name: 'Food', amount: 35000, spent: 0, due: state.income.nextDate },
    { id: 'transport', name: 'Transport', amount: 20000, spent: 0, due: state.income.nextDate },
    { id: 'data', name: 'Data', amount: 10000, spent: 0, due: state.income.nextDate },
  ] };
  return state;
}
function payment(amount = 50000, category = 'Other') {
  return { amount, amountText: String(amount / 100), category, recipient: { id: 'ama', name: 'Ama', number: '0240000000' }, rail: 'momo', idempotencyKey: 'pause-payment-check' };
}

function fakeClock(t) {
  let time = 1000, sequence = 0;
  const intervals = new Map();
  t.mock.method(Date, 'now', () => time);
  t.mock.method(globalThis, 'setInterval', callback => { const id = ++sequence; intervals.set(id, callback); return id; });
  t.mock.method(globalThis, 'clearInterval', id => intervals.delete(id));
  return { intervals, advance(ms) { time += ms; for (const callback of [...intervals.values()]) callback(); } };
}
function harness(t, draft = payment()) {
  const clock = fakeClock(t), state = account(), nodes = new Map(), routes = [], auth = [], actions = [], messages = [];
  for (const action of ['pay-pause-next', 'pay-edit-amount', 'pay-cancel']) nodes.set(action, {
    disabled: action === 'pay-pause-next', isConnected: true, listeners: {}, attributes: new Set(['aria-busy']),
    addEventListener(event, handler) { this.listeners[event] = handler; }, removeAttribute(name) { this.attributes.delete(name); },
  });
  const counter = { textContent: '' };
  const ctx = { state, route: { section: 'pay', page: 'pause' }, draft: { payment: draft },
    $(selector) { if (selector === '.pause-gate') return counter; const action = selector.match(/^\[data-action="([^"]+)"\]$/)?.[1]; return nodes.get(action) || null; },
    $$(selector) { const action = selector.match(/^\[data-action="([^"]+)"\]$/)?.[1]; return nodes.has(action) ? [nodes.get(action)] : []; },
    setCapture() {}, saveDraft() {}, closeSheet() {}, refresh() {}, toast(message) { messages.push(message); },
    go(route, options) { routes.push({ route, options }); }, finish(route) { routes.push({ route, finish: true }); },
    auth(options) { auth.push(options); }, act(type, payload) { actions.push({ type, payload }); return applyAction(state, type, payload); },
  };
  bindPayments(ctx, ctx.route);
  return { ctx, state, clock, nodes, routes, auth, actions, messages, counter, click(action) { nodes.get(action).listeners.click(); } };
}

function impact(html) { return html.match(/class="pause-screen-impact"[^>]*>([\s\S]*?)<\/h2>/)?.[1].replace(/<[^>]+>/g, ''); }

test('Pause gives one precise consequence and honours category allocation and fees', () => {
  for (const example of [
    { amount: 50000, category: 'Other', consequence: 'This payment leaves you GH₵150.50 short for your plan.' },
    { amount: 50000, category: 'Food', consequence: 'You’d have GH₵99.50 left after your plan and breathing room.' },
    { amount: 90000, category: 'Food', consequence: 'This payment leaves you GH₵200.50 short for your plan.' },
    { amount: 10000, category: 'Other', consequence: 'You’d have GH₵149.50 left after your plan and breathing room.' },
    { amount: 40025, category: 'Other', consequence: 'This payment leaves you GH₵50.75 short for your plan.' },
    { amount: 25000, category: 'Other', consequence: 'This payment uses GH₵0.50 of your breathing room.' },
    { amount: 30000, category: 'Other', consequence: 'This payment uses GH₵50.50 of your breathing room.' },
    { amount: 50000, category: 'Other', consequence: 'This payment leaves you GH₵150.50 short for your plan.', buffer: 0 },
  ]) {
    const state = account();
    if (example.buffer !== undefined) state.buffer = example.buffer;
    const before = JSON.stringify(state), d = payment(example.amount, example.category);
    assert.equal(evaluatePayment(state, d).needed, true);
    const html = renderPayments({ state, draft: { payment: d } }, { section: 'pay', page: 'pause' });
    assert.equal(impact(html), example.consequence);
    assert.match(html, /<details class="pause-screen-details"><summary>Payment details<\/summary>/);
    assert.doesNotMatch(html, /<details[^>]*\bopen\b/);
    assert.match(html, /data-action="pay-pause-next" aria-busy="true" disabled>Continue to PIN/);
    assert.match(html, /data-action="pay-edit-amount">Edit amount/);
    assert.equal(JSON.stringify(state), before, 'rendering a decision must not debit, reserve or allocate money');
  }
});

test('Pause distinguishes an existing plan gap from a gap increased by this payment', () => {
  const state = account(); state.wallet = 60000;
  for (const [category, expected] of [
    ['Food', 'After this payment, your plan would still be GH₵50 short.'],
    ['Other', 'Your plan’s existing gap would grow to GH₵150 after this payment.'],
  ]) {
    const d = { ...payment(10000, category), rail: 'lumo' }, before = JSON.stringify(state);
    const html = renderPayments({ state, draft: { payment: d } }, { section: 'pay', page: 'pause' });
    assert.equal(impact(html), expected);
    assert.equal(JSON.stringify(state), before);
  }
});

test('the three-second Pause remains a gate to authentication, never a payment approval', t => {
  const h = harness(t), before = JSON.stringify(h.state), button = h.nodes.get('pay-pause-next');
  h.click('pay-pause-next');
  assert.equal(h.auth.length, 0);
  h.clock.advance(2999); h.click('pay-pause-next');
  assert.equal(h.auth.length, 0); assert.equal(button.disabled, true);
  h.clock.advance(1);
  assert.equal(button.disabled, false); assert.equal(button.attributes.has('aria-busy'), false);
  h.click('pay-pause-next');
  assert.equal(h.auth.length, 1); assert.equal(h.actions.length, 0);
  assert.equal(JSON.stringify(h.state), before, 'continuing opens PIN authentication without moving money');
  h.auth[0].onSuccess();
  assert.equal(h.actions.length, 1); assert.equal(h.actions[0].type, 'payment');
  assert.equal(h.state.wallet, 49950); assert.equal(h.state.transactions[0].fee, 50); assert.equal(h.state.transactions[0].total, 50050); assert.equal(h.state.transactions.length, 1);
  assert.equal(h.routes.at(-1).route.page, 'status');
});

test('editing or cancelling from Pause changes navigation but leaves the ledger alone', t => {
  const h = harness(t), before = JSON.stringify(h.state), original = structuredClone(h.ctx.draft.payment);
  h.click('pay-edit-amount');
  assert.equal(h.routes.at(-1).route.page, 'amount'); assert.equal(h.routes.at(-1).route.edit, true);
  assert.deepEqual(h.ctx.draft.paymentEditBackup.recipient, original.recipient);
  assert.equal(h.ctx.draft.paymentEditBackup.amount, original.amount);
  h.click('pay-cancel');
  assert.deepEqual(h.routes.at(-1), { route: { section: 'pay', page: 'home' }, options: { replace: true } });
  assert.equal(h.auth.length, 0); assert.equal(h.actions.length, 0); assert.equal(JSON.stringify(h.state), before);
  assert.deepEqual(parentRoute({ section: 'pay', page: 'pause' }), { section: 'pay', page: 'review' });
});

test('a detached Pause stops its wait timer without enabling an old action', t => {
  const h = harness(t), button = h.nodes.get('pay-pause-next');
  assert.equal(h.clock.intervals.size, 1);
  button.isConnected = false; h.clock.advance(3000);
  assert.equal(h.clock.intervals.size, 0); assert.equal(button.disabled, true);
  assert.equal(h.auth.length, 0); assert.equal(h.actions.length, 0);
});
