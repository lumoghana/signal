import test from 'node:test';
import assert from 'node:assert/strict';
import { PAYMENT_SERVICES, getPaymentService, prepareServicePayment } from '../dist/js/payment-catalog.js';

const base = () => ({ reference: '123456789', network: 'MTN', phone: '024 000 0000', amountText: '25.50', bundle: 'daily' });
const valid = (id, fields = base()) => {
  const result = prepareServicePayment(id, fields);
  assert.equal(result.ok, true, `${id}: ${result.message}`);
  return result.payment;
};

test('campus, bills and top-ups prepare complete payments for the shared review flow', () => {
  const cases = [
    ['gobe-spot', 'campus', 'Food'],
    ['campus-shuttle', 'campus', 'Transport'],
    ['balme-prints', 'campus', 'Essentials'],
    ['hall-dues', 'campus', 'Essentials'],
    ['electricity', 'bill', 'Essentials'],
    ['water', 'bill', 'Essentials'],
    ['tv', 'bill', 'Essentials'],
    ['airtime', 'airtime', 'Data'],
    ['data', 'data', 'Data'],
  ];
  assert.equal(new Set(PAYMENT_SERVICES.map(service => service.id)).size, PAYMENT_SERVICES.length);
  for (const [id, rail, category] of cases) {
    assert.equal(getPaymentService(id)?.id, id);
    const payment = valid(id);
    assert.equal(payment.service.id, id);
    assert.equal(payment.rail, rail);
    assert.equal(payment.category, category);
    assert.equal(typeof payment.recipient.id, 'string');
    assert.ok(payment.recipient.id.length > 0);
    assert.equal(typeof payment.recipient.name, 'string');
    assert.ok(payment.recipient.name.length > 0);
    assert.ok(Number.isSafeInteger(payment.amount) && payment.amount > 0);
    assert.equal(payment.amount, id === 'data' ? 500 : 2550);
  }
});

test('payment amounts retain cents and reject malformed, excessive or non-positive values', () => {
  assert.equal(valid('gobe-spot', { ...base(), amountText: '0.01', reference: '' }).amount, 1);
  assert.equal(valid('electricity', { ...base(), amountText: '150.25' }).amount, 15025);
  assert.equal(valid('airtime', { ...base(), amountText: '10000000' }).amount, 1000000000);
  for (const amountText of ['', '0', '-1', '1.001', 'NaN', 'Infinity', '2e3', 'abc', '10000000.01']) {
    for (const id of ['gobe-spot', 'electricity', 'airtime']) {
      assert.equal(prepareServicePayment(id, { ...base(), amountText }).ok, false, `${id}: ${amountText}`);
    }
  }
});

test('only data catalog bundles determine their amount, including after client amount edits', () => {
  for (const [bundle, amount] of [['daily', 500], ['weekly', 2000], ['monthly', 5000]]) {
    const payment = valid('data', { ...base(), bundle, amountText: '0.01', amount: 1, bundleName: 'Tampered price' });
    assert.equal(payment.amount, amount);
    assert.equal(typeof payment.bundleName, 'string');
    assert.match(payment.bundleName, /demo/i);
    assert.notEqual(payment.bundleName, 'Tampered price');
  }
  for (const bundle of ['', 'yearly', null, '__proto__', 'constructor']) {
    assert.equal(prepareServicePayment('data', { ...base(), bundle }).ok, false);
  }
});

test('top-ups require a supported network and valid Ghanaian phone number', () => {
  for (const id of ['airtime', 'data']) {
    for (const network of ['MTN', 'Telecel', 'AT']) {
      assert.equal(valid(id, { ...base(), network }).fields.network, network);
    }
    for (const phone of ['0240000000', '024 000 0000', '+233240000000']) {
      const payment = valid(id, { ...base(), phone });
      assert.equal(payment.recipient.number, '0240000000');
      assert.equal(payment.fields.phone, '0240000000');
    }
    for (const network of ['', 'Vodafone', 'Unknown', '__proto__']) {
      assert.equal(prepareServicePayment(id, { ...base(), network }).ok, false);
    }
    for (const phone of ['', '240000000', '024000000', '02400000000', '+234240000000', 'hello0240000000']) {
      assert.equal(prepareServicePayment(id, { ...base(), phone }).ok, false, `${id}: ${phone}`);
    }
  }
});

test('bill references are required and bounded while campus order references are optional', () => {
  for (const id of ['electricity', 'water', 'tv']) {
    assert.equal(valid(id, { ...base(), reference: 'ECG123456' }).reference, 'ECG123456');
    assert.equal(valid(id, { ...base(), reference: 'GW-123456' }).reference, 'GW-123456');
    for (const reference of ['', '1234', '1234567890123456789012345', '<script>']) {
      assert.equal(prepareServicePayment(id, { ...base(), reference }).ok, false, `${id}: ${reference}`);
    }
  }
  for (const id of ['gobe-spot', 'campus-shuttle', 'balme-prints', 'hall-dues']) {
    assert.equal(valid(id, { ...base(), reference: '' }).reference, '');
  }
});

test('preparing payments neither mutates input nor accepts unknown services', () => {
  const fields = Object.freeze(base());
  const before = JSON.stringify(fields);
  valid('airtime', fields);
  valid('data', fields);
  assert.equal(JSON.stringify(fields), before);
  for (const id of ['', 'unknown', '__proto__', 'constructor', null]) {
    assert.equal(Boolean(getPaymentService(id)), false);
    assert.equal(prepareServicePayment(id, fields).ok, false);
  }
});
