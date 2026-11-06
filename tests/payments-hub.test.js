import test from 'node:test';
import assert from 'node:assert/strict';
import { renderPaymentsHub, bindPaymentsHub, paymentHubTab } from '../dist/js/payments-hub.js';
import { PAYMENT_SERVICES } from '../dist/js/payment-catalog.js';

const context = () => ({ state: { wallet: 12345, settings: { hideBalance: false }, externalBalances: [{ balance: 9000000 }], income: { amount: 8000000 } }, draft: {} });

test('Send money keeps a single hub and separates the campus and bill catalogues', () => {
  const ctx = context(), html = renderPaymentsHub(ctx, {});
  assert.match(html, /GH₵123\.45/);
  assert.doesNotMatch(html, /GH₵90,000|GH₵80,000/);
  assert.equal((html.match(/data-hub-tab=/g) || []).length, 3);
  for (const action of ['recent', 'favourites', 'lumo', 'momo', 'bank', 'cards', 'requests', 'activity', 'ious']) assert.match(html, new RegExp(`data-hub-action="${action}"`));
  assert.doesNotMatch(html, /data-service-id=/);
});

test('the balance privacy setting applies to the Payments balance too', () => {
  const ctx = context(); ctx.state.settings.hideBalance = true;
  const html = renderPaymentsHub(ctx, { hubTab: 'send' });
  assert.match(html, /••••\.••/);
  assert.doesNotMatch(html, /GH₵123\.45/);
});

test('Campus Pay and Bills render their own actionable catalogue entries', () => {
  const ctx = context();
  for (const tab of ['campus', 'bills']) {
    const html = renderPaymentsHub(ctx, { hubTab: tab });
    for (const service of PAYMENT_SERVICES) assert.equal(html.includes(`data-service-id="${service.id}"`), tab === 'campus' ? service.type === 'campus' : service.type !== 'campus');
    assert.doesNotMatch(html, /data-hub-action="cards"/);
  }
  assert.equal(paymentHubTab('unknown'), 'send');
});

function binder(tab = 'send', draft = {}) {
  const ctx = context(), routes = [], starts = [], handlers = {};
  ctx.draft = draft;
  let resumed = 0;
  const root = { isConnected: true, addEventListener(name, fn) { handlers[name] = fn; }, removeEventListener(name, fn) { if (handlers[name] === fn) delete handlers[name]; } };
  Object.assign(ctx, { $: () => root, go: (...args) => routes.push(args), startPayment: (...args) => starts.push(args), resumePayment: () => resumed++ });
  const cleanup = bindPaymentsHub(ctx, { hubTab: tab });
  return { ctx, root, routes, starts, cleanup, get resumed() { return resumed; }, click(dataset, disabled = false) { handlers.click?.({ target: { closest: () => ({ dataset, disabled }) } }); } };
}

test('rail actions start the selected transfer and hub navigation preserves the origin', () => {
  const h = binder();
  for (const rail of ['lumo', 'momo', 'bank']) h.click({ hubAction: rail });
  assert.deepEqual(h.starts, [[null, 'lumo'], [null, 'momo'], [null, 'bank']]);
  h.click({ hubAction: 'recent' });
  assert.deepEqual(h.routes.at(-1)[0], { section: 'pay', page: 'recipients-list', list: 'recent', backTo: { section: 'pay', page: 'home', hubTab: 'send' } });
  h.click({ hubTab: 'bills' });
  assert.deepEqual(h.routes.at(-1), [{ section: 'pay', page: 'home', hubTab: 'bills' }, { replace: true }]);
  h.cleanup();
});

test('catalogue routes return to their tab and detached or unknown actions do nothing', () => {
  const h = binder('campus');
  h.click({ hubAction: 'service', serviceId: 'gobe-spot' });
  assert.deepEqual(h.routes.at(-1)[0], { section: 'pay', page: 'service', id: 'gobe-spot', backTo: { section: 'pay', page: 'home', hubTab: 'campus' } });
  h.click({ hubAction: 'service', serviceId: 'missing' }); assert.equal(h.routes.length, 1);
  h.click({ hubAction: 'resume' }); assert.equal(h.resumed, 1);
  h.click({ hubAction: 'cards' }, true); assert.equal(h.routes.length, 1);
  h.cleanup(); h.click({ hubAction: 'cards' }); assert.equal(h.routes.length, 1);
});

test('every secondary money destination preserves a direct route back to the invoking hub', () => {
  const h = binder(), origin = { section: 'pay', page: 'home', hubTab: 'send' };
  const cases = [
    ['recent', { section: 'pay', page: 'recipients-list', list: 'recent', backTo: origin }],
    ['favourites', { section: 'pay', page: 'recipients-list', list: 'favourites', backTo: origin }],
    ['cards', { section: 'pay', page: 'cards', backTo: origin }],
    ['requests', { section: 'pay', page: 'requests', backTo: origin }],
    ['activity', { section: 'activity', page: 'home', returnTo: origin }],
    ['ious', { section: 'life', page: 'ious', backTo: origin }],
  ];
  const before = structuredClone(h.ctx.state);
  try {
    for (const [action, expected] of cases) {
      h.click({ hubAction: action });
      assert.deepEqual(h.routes.at(-1)[0], expected, action);
    }
    assert.equal(h.starts.length, 0); assert.equal(h.resumed, 0);
    assert.deepEqual(h.ctx.state, before, 'Browsing payment tools must not change money.');
  } finally { h.cleanup(); }
});

test('each campus, top-up and bill catalogue action retains the tab where it was opened', () => {
  for (const tab of ['campus', 'bills']) {
    const h = binder(tab), origin = { section: 'pay', page: 'home', hubTab: tab };
    try {
      for (const service of PAYMENT_SERVICES.filter(service => tab === 'campus' ? service.type === 'campus' : service.type !== 'campus')) {
        h.click({ hubAction: 'service', serviceId: service.id });
        assert.deepEqual(h.routes.at(-1)[0], { section: 'pay', page: 'service', id: service.id, backTo: origin }, service.id);
      }
      assert.equal(h.starts.length, 0, 'Opening a bill form must not start a person transfer.');
    } finally { h.cleanup(); }
  }
});

test('saved payment visibility respects unfinished work and the originating catalogue', () => {
  const cases = [
    [undefined, []],
    [{}, []],
    [{ completed: true, recipient: { name: 'Ama' }, amount: 3000, hubTab: 'bills' }, []],
    [{ recipient: { name: 'Ama' } }, ['send']],
    [{ amount: 3000, hubTab: 'bills' }, ['send', 'bills']],
    [{ recipientForms: { momo: { name: '', number: '024' } }, hubTab: 'campus' }, ['send', 'campus']],
    [{ recipientForms: { bank: { name: '', number: '' } }, hubTab: 'bills' }, []],
  ];
  for (const [payment, visibleTabs] of cases) {
    const ctx = context(); if (payment) ctx.draft.payment = payment;
    const before = structuredClone(ctx);
    for (const tab of ['send', 'campus', 'bills']) {
      assert.equal(renderPaymentsHub(ctx, { hubTab: tab }).includes('data-hub-action="resume"'), visibleTabs.includes(tab), `${tab}: ${JSON.stringify(payment)}`);
    }
    assert.deepEqual(ctx, before, 'Rendering must preserve both saved setup and money records.');
  }
});

test('switching catalogue tabs and resuming do not replace the accepted payment draft', () => {
  const payment = { recipient: { name: 'Ama', number: '0244304593' }, rail: 'momo', amount: 3000, note: 'Printing', idempotencyKey: 'existing-payment-reference', completed: false };
  const h = binder('send', { payment }), before = structuredClone(payment);
  try {
    for (const tab of ['campus', 'bills', 'send']) {
      h.click({ hubTab: tab });
      assert.deepEqual(h.routes.at(-1), [{ section: 'pay', page: 'home', hubTab: tab }, { replace: true }]);
      assert.equal(h.ctx.draft.payment, payment);
      assert.deepEqual(payment, before);
    }
    h.click({ hubAction: 'resume' });
    assert.equal(h.resumed, 1); assert.equal(h.starts.length, 0);
    assert.equal(h.ctx.draft.payment, payment); assert.deepEqual(payment, before);
  } finally { h.cleanup(); }
});

test('a detached hub cannot navigate, restart a transfer or resume saved work', () => {
  const h = binder(); h.root.isConnected = false;
  try {
    h.click({ hubAction: 'lumo' }); h.click({ hubAction: 'resume' });
    h.click({ hubAction: 'requests' }); h.click({ hubTab: 'bills' });
    assert.equal(h.starts.length, 0); assert.equal(h.resumed, 0); assert.equal(h.routes.length, 0);
  } finally { h.cleanup(); }
});
