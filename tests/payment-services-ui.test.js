import test from 'node:test';
import assert from 'node:assert/strict';
import { bindPaymentService, renderPaymentService } from '../dist/js/payment-services.js';

function harness(id, values = {}, extra = {}) {
  const handlers = {}, calls = [], routes = [], error = { textContent: '' };
  let captureCurrent = null;
  const fields = Object.entries(values).map(([key, value]) => ({ dataset: { serviceField: key }, value }));
  const root = { isConnected: true, querySelectorAll: () => fields, querySelector: selector => selector === '.service-error' ? error : null,
    addEventListener(type, callback) { handlers[type] = callback; }, removeEventListener(type, callback) { if (handlers[type] === callback) delete handlers[type]; } };
  const draft = { servicePayment: { [id]: { network: 'MTN', bundle: 'weekly', ...values } }, ...extra.draft };
  const route = { section: 'pay', page: 'service', id, ...extra.route };
  const ctx = { draft, $: () => root, saveDraft() {}, setCapture(fn) { captureCurrent = fn; }, refresh() { captureCurrent?.(); },
    startServicePayment(payment) { calls.push(payment); }, go(route, options) { captureCurrent?.(); routes.push({ route, options }); },
    get state() { throw new Error('Service setup cannot read or change balances.'); }, act() { throw new Error('Service setup cannot debit money.'); } };
  const cleanup = bindPaymentService(ctx, route);
  return { draft, route, ctx, calls, routes, error, cleanup, fields, click(dataset) { const button = { dataset, disabled: false }; handlers.click?.({ target: { closest: () => button } }); return button; }, capture() { captureCurrent?.(); } };
}

test('a service reaches review only after validation, and repeated clicks cannot prepare twice', () => {
  const h = harness('electricity', { reference: '', amountText: '20.25' });
  h.click({ serviceAction: 'review' });
  assert.equal(h.calls.length, 0);
  assert.match(h.error.textContent, /demo reference/);
  h.fields.find(field => field.dataset.serviceField === 'reference').value = '0123456789';
  h.click({ serviceAction: 'review' }); h.click({ serviceAction: 'review' });
  assert.equal(h.calls.length, 1);
  assert.equal(h.calls[0].amount, 2025);
  assert.equal(h.calls[0].serviceFields.reference, '0123456789');
  assert.equal(h.calls[0].rail, 'bill');
  h.cleanup();
});

test('programmatic airtime presets survive the app capturing the old form before refresh', () => {
  const h = harness('airtime', { phone: '024 000 0000', amountText: '' });
  h.click({ serviceAmount: '2000' });
  assert.equal(h.draft.servicePayment.airtime.amountText, '20.00');
  assert.equal(h.draft.servicePayment.airtime.phone, '024 000 0000');
  h.cleanup();
});

test('cancelling a service edit restores its form and returns to review without changing the accepted payment', () => {
  const payment = { serviceId: 'water', amount: 1000, serviceFields: { reference: 'GW12345', amountText: '10.00' } };
  const before = structuredClone(payment);
  const h = harness('water', { reference: 'GW99999', amountText: '99.00' }, { route: { edit: true }, draft: { payment } });
  h.click({ serviceAction: 'exit' });
  assert.deepEqual(payment, before);
  assert.deepEqual(h.draft.servicePayment.water, before.serviceFields);
  assert.deepEqual(h.routes.at(-1), { route: { section: 'pay', page: 'review' }, options: { replace: true } });
  h.cleanup();
});

test('service cancellation returns to its matching hub tab and detached forms cannot act', () => {
  for (const [id, hubTab] of [['gobe-spot', 'campus'], ['airtime', 'bills']]) {
    const h = harness(id);
    h.click({ serviceAction: 'exit' });
    assert.deepEqual(h.routes[0].route, { section: 'pay', page: 'home', hubTab });
    h.cleanup(); h.click({ serviceAction: 'review' });
    assert.equal(h.calls.length, 0);
  }
});

test('top-up setup uses explicit illustrative bundles without reading account balances', () => {
  const h = harness('data', { network: 'MTN', phone: '024 000 0000' });
  const html = renderPaymentService(h.ctx, h.route);
  assert.match(html, /Illustrative bundles and prices only/);
  assert.match(html, /Demo weekly bundle/);
  h.click({ serviceAction: 'review' });
  assert.equal(h.calls[0].amount, 2000);
  assert.equal(h.calls[0].bundleName, 'Demo weekly bundle');
  h.cleanup();
});
