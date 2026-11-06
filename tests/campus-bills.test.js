import test from 'node:test';
import assert from 'node:assert/strict';
import { CAMPUS_BILLERS, PAYMENT_SERVICES, getPaymentService, getServiceHubTab, isCampusCodeService, prepareServicePayment } from '../dist/js/payment-catalog.js';
import { bindPaymentService, renderPaymentService } from '../dist/js/payment-services.js';

const details = (id = 'school-fees', extra = {}) => ({ biller: CAMPUS_BILLERS[id][0].id, reference: '00123456', amountText: '1234.56', ...extra });

test('campus bills have separate school and hostel catalogues, while existing hall codes remain supported', () => {
  for (const id of ['school-fees', 'hostel-fees', 'hall-dues']) {
    assert.equal(getPaymentService(id).type, 'campus-bill');
    assert.equal(getServiceHubTab(id), 'bills');
    assert.equal(getServiceHubTab(getPaymentService(id)), 'bills');
    assert.equal(isCampusCodeService(id), true);
  }
  assert.equal(getServiceHubTab('gobe-spot'), 'campus');
  assert.equal(isCampusCodeService('electricity'), false);
  assert.equal(isCampusCodeService({ id: 'missing', type: 'campus' }), false);
  assert.equal(new Set(PAYMENT_SERVICES.map(service => service.id)).size, PAYMENT_SERVICES.length);
  for (const catalogue of Object.values(CAMPUS_BILLERS)) {
    assert.ok(catalogue.length > 1);
    for (const biller of catalogue) assert.match(biller.name, /demo/);
  }
  const hall = prepareServicePayment('hall-dues', { reference: '', amountText: '10' });
  assert.equal(hall.ok, true); assert.equal(hall.payment.rail, 'campus'); assert.equal(hall.payment.reference, '');
});

test('school and hostel payments carry exact canonical biller, leading-zero reference and entered amount', () => {
  for (const id of ['school-fees', 'hostel-fees']) {
    const input = Object.freeze(details(id, { billerName: 'Untrusted name', amount: 1, invoiceAmount: 1 }));
    const before = JSON.stringify(input), result = prepareServicePayment(id, input);
    assert.equal(result.ok, true, result.message);
    const payment = result.payment;
    assert.equal(payment.billerName, CAMPUS_BILLERS[id][0].name);
    assert.equal(payment.recipient.name, getPaymentService(id).name);
    assert.equal(payment.recipient.number, '00123456');
    assert.equal(payment.reference, '00123456');
    assert.equal(payment.amount, 123456); assert.equal(payment.rail, 'bill'); assert.equal(payment.category, 'Essentials');
    assert.deepEqual(payment.serviceFields, { biller: CAMPUS_BILLERS[id][0].id, reference: '00123456', amountText: '1234.56' });
    assert.deepEqual(payment.fields, payment.serviceFields);
    assert.equal(JSON.stringify(input), before);
  }
  const slashReference = prepareServicePayment('school-fees', details('school-fees', { reference: ' UG/2026/0001 ', amountText: '0.01' }));
  assert.equal(slashReference.ok, true); assert.equal(slashReference.payment.reference, 'UG/2026/0001'); assert.equal(slashReference.payment.amount, 1);
});

test('a school or hostel must be chosen from its own catalogue before a payment can be prepared', () => {
  for (const id of ['school-fees', 'hostel-fees']) {
    const other = id === 'school-fees' ? 'hostel-fees' : 'school-fees';
    for (const biller of ['', null, '__proto__', 'constructor', 'A made-up school', CAMPUS_BILLERS[other][0].id]) {
      assert.equal(prepareServicePayment(id, details(id, { biller })).ok, false, `${id}: ${biller}`);
    }
  }
});

test('campus student references and amounts are required, bounded and never inferred from a biller', () => {
  for (const id of ['school-fees', 'hostel-fees']) {
    for (const reference of ['', '123', 'a'.repeat(31), '<script>', 'UG 12345', '1234\n5678', '/12345']) {
      assert.equal(prepareServicePayment(id, details(id, { reference })).ok, false, `${id}: ${JSON.stringify(reference)}`);
    }
    for (const amountText of ['', '0', '-1', '1.001', '1e3', 'NaN', 'Infinity']) {
      assert.equal(prepareServicePayment(id, details(id, { amountText })).ok, false, `${id}: ${amountText}`);
    }
    const result = prepareServicePayment(id, details(id, { amountText: '12.05' }));
    assert.equal(result.payment.amount, 1205);
  }
});

function harness(id, values = {}, editing = false) {
  const handlers = {}, calls = [], routes = [], error = { textContent: '' };
  const fields = Object.entries(values).map(([key, value]) => ({ dataset: { serviceField: key }, value }));
  const root = { isConnected: true,
    querySelectorAll() { return fields; },
    querySelector(selector) { return selector === '.service-error' ? error : null; },
    addEventListener(name, listener) { handlers[name] = listener; },
    removeEventListener(name, listener) { if (handlers[name] === listener) delete handlers[name]; },
  };
  const draft = { servicePayment: { [id]: { ...values } } };
  const ctx = { draft, $: () => root, setCapture() {}, saveDraft() {}, refresh() {},
    startServicePayment(payment) { calls.push(payment); return { ok: true }; },
    go(route, options) { routes.push({ route, options }); },
    get state() { throw new Error('Campus bill setup must not read money.'); },
    act() { throw new Error('Campus bill setup must not execute money actions.'); },
  };
  const route = { section: 'pay', page: 'service', id, ...(editing ? { edit: true } : {}) };
  const cleanup = bindPaymentService(ctx, route);
  return { ctx, draft, route, fields, calls, routes, error, cleanup,
    click(action) { const button = { dataset: { serviceAction: action }, disabled: false }; handlers.click?.({ target: { closest: () => button } }); },
    change() { handlers.change?.(); },
  };
}

test('campus bill forms ask for a labelled demo biller and student reference without claiming an invoice lookup', () => {
  for (const id of ['school-fees', 'hostel-fees']) {
    const ctx = { draft: {} }, html = renderPaymentService(ctx, { section: 'pay', page: 'service', id });
    assert.match(html, /data-service-field="biller"/);
    assert.match(html, /data-service-field="reference"/);
    assert.match(html, /data-service-field="amountText"/);
    assert.match(html, /Demo campus bill/); assert.match(html, /Practice payment only/);
    assert.match(html, /Top-ups & bills/);
    assert.doesNotMatch(html, /Invoice found|verified|Amount due/i);
    assert.equal(ctx.draft.servicePayment[id].biller, '');
    assert.equal(ctx.draft.servicePayment[id].amountText, '');
    for (const biller of CAMPUS_BILLERS[id]) assert.ok(html.includes(`value="${biller.id}"`));
  }
});

test('school form selection is captured and prepares review once, with no money action', () => {
  const h = harness('school-fees', details('school-fees', { biller: '' }));
  try {
    h.click('review'); assert.equal(h.calls.length, 0); assert.match(h.error.textContent, /demo school/);
    h.fields.find(field => field.dataset.serviceField === 'biller').value = CAMPUS_BILLERS['school-fees'][1].id;
    h.change();
    h.click('review'); h.click('review');
    assert.equal(h.calls.length, 1);
    assert.equal(h.calls[0].serviceFields.biller, CAMPUS_BILLERS['school-fees'][1].id);
    assert.equal(h.calls[0].billerName, CAMPUS_BILLERS['school-fees'][1].name);
    assert.equal(h.calls[0].reference, '00123456'); assert.equal(h.calls[0].amount, 123456);
    h.cleanup(); h.click('review'); assert.equal(h.calls.length, 1);
  } finally { h.cleanup(); }
});

test('cancelling a hostel edit restores the accepted biller and reference, then returns to review', () => {
  const accepted = details('hostel-fees'), h = harness('hostel-fees', details('hostel-fees', { biller: CAMPUS_BILLERS['hostel-fees'][1].id, reference: 'CHANGED', amountText: '1' }), true);
  const payment = { serviceId: 'hostel-fees', serviceFields: accepted, amount: 123456 };
  h.draft.payment = payment;
  try {
    const before = structuredClone(payment); h.click('exit');
    assert.deepEqual(payment, before);
    assert.deepEqual(h.draft.servicePayment['hostel-fees'], accepted);
    assert.deepEqual(h.routes[0], { route: { section: 'pay', page: 'review' }, options: { replace: true } });
  } finally { h.cleanup(); }
});
