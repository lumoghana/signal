import test from 'node:test';
import assert from 'node:assert/strict';
import { RECIPIENT_BANKS, DEMO_MOMO_ACCOUNTS, DEMO_LOOKUP_UNAVAILABLE_NUMBER, normalizeMomoNumber, normalizeBankAccount, validateRecipientLookup, resolveDemoRecipient, recipientLookupMatches, createRecipientLookup } from '../dist/js/recipient-lookup.js';

test('MoMo formatting normalizes Ghanaian local and international numbers without guessing a network', () => {
  for (const value of ['0245550182', '024 555 0182', '(024) 555-0182', '+233 24 555 0182', '233245550182']) assert.equal(normalizeMomoNumber(value), '0245550182', value);
  for (const value of ['', null, 245550182, '245550182', '024555018', '02455501822', '+2330245550182', '++233245550182', '(0245550182', '0245550182)', '024 555 x182', '-0245550182', '0245550182\nscript']) assert.equal(normalizeMomoNumber(value), '', String(value));
  const checked = validateRecipientLookup('momo', { number: '+233 55 555 0124', network: 'MTN MoMo', name: 'Untrusted' });
  assert.deepEqual(checked.request, { rail: 'momo', number: '0555550124' });
  const result = resolveDemoRecipient(checked.request);
  assert.equal(result.recipient.network, 'Telecel Cash'); assert.equal(result.recipient.name, 'Akosua Owusu');
});

test('bank identifiers retain leading zeroes and a chosen supported bank is required', () => {
  assert.equal(normalizeBankAccount('0123 456-789'), '0123456789');
  for (const value of ['', null, 12345678, '1234567', '12345678901234567', '123abc45678', '+0123456789', '-0123456789', '01234.56789']) assert.equal(normalizeBankAccount(value), '', String(value));
  for (const bank of ['ecobank', 'Ecobank Ghana']) assert.deepEqual(validateRecipientLookup('bank', { number: '0123456789', bank }).request, { rail: 'bank', number: '0123456789', bank: 'Ecobank Ghana' });
  assert.equal(validateRecipientLookup('bank', { number: '0123456789' }).field, 'bank');
  assert.equal(validateRecipientLookup('bank', { number: '0123456789', bank: 'Other Ghanaian bank' }).ok, false);
  assert.equal(validateRecipientLookup('bank', { number: 'wrong', bank: 'GCB Bank' }).field, 'number');
  assert.equal(validateRecipientLookup('lumo', { number: '0245550182' }).ok, false);
  for (const malformed of [null, [], '0123456789', 1234567890]) assert.equal(validateRecipientLookup('bank', malformed).ok, false);
  assert.notEqual(validateRecipientLookup('bank', { number: '0123456789', bank: 'gcb' }).key, validateRecipientLookup('bank', { number: '0123456789', bank: 'ecobank' }).key);
});

test('only explicit demo fixtures resolve and the receiving bank is part of a bank account identity', () => {
  for (const fixture of DEMO_MOMO_ACCOUNTS) {
    const result = resolveDemoRecipient({ rail: 'momo', number: fixture.number });
    assert.deepEqual(result.recipient, { ...fixture, emoji: fixture.name.charAt(0), lookupSource: 'demo' });
    result.recipient.name = 'Changed locally';
    assert.equal(resolveDemoRecipient({ rail: 'momo', number: fixture.number }).recipient.name, fixture.name);
  }
  for (const bank of RECIPIENT_BANKS) {
    const result = resolveDemoRecipient({ rail: 'bank', number: bank.example, bank: bank.label });
    assert.equal(result.ok, true); assert.equal(result.recipient.bank, bank.label); assert.equal(result.recipient.number, bank.example); assert.equal(result.recipient.lookupSource, 'demo');
  }
  assert.equal(resolveDemoRecipient({ rail: 'bank', number: '1234567890123', bank: 'Ecobank Ghana' }).code, 'not_found');
  for (const number of ['0245550183', '0205550167', '0555550125']) assert.equal(resolveDemoRecipient({ rail: 'momo', number }).code, 'not_found');
  assert.equal(resolveDemoRecipient({ rail: 'momo', number: DEMO_LOOKUP_UNAVAILABLE_NUMBER }).code, 'unavailable');
  assert.equal(resolveDemoRecipient(null).ok, false);
});

function readyPayment(rail = 'momo') {
  const form = rail === 'momo' ? { number: '055 555 0124' } : { number: '0123456789', bank: 'ecobank' };
  const checked = validateRecipientLookup(rail, form), { recipient } = resolveDemoRecipient(checked.request);
  return { rail, recipientForms: { [rail]: form }, recipientLookup: { key: checked.key, request: checked.request, recipient }, recipient: null };
}

test('lookup matching binds returned identity to current rail, canonical number and chosen bank', () => {
  for (const rail of ['momo', 'bank']) {
    const payment = readyPayment(rail);
    assert.equal(recipientLookupMatches(payment), true); assert.equal(recipientLookupMatches(payment, { confirmed: true }), false);
    for (const change of [
      p => { p.rail = 'lumo'; },
      p => { p.recipientForms[rail].number = '0245550182'; },
      p => { p.recipientLookup.key = 'stale'; },
      p => { p.recipientLookup.request.number = '0245550182'; },
      p => { p.recipientLookup.recipient.number = '0245550182'; },
      p => { p.recipientLookup.recipient.lookupSource = 'live'; },
      p => { p.recipientLookup.recipient.name = '<untrusted>'; },
      ...(rail === 'momo' ? [p => { p.recipientLookup.recipient.network = 'Unknown'; }] : [p => { p.recipientForms.bank.bank = 'GCB Bank'; }, p => { p.recipientLookup.recipient.bank = 'GCB Bank'; }]),
    ]) {
      const changed = structuredClone(payment); change(changed);
      assert.equal(recipientLookupMatches(changed), false);
    }
  }
  assert.equal(recipientLookupMatches(null), false);
  assert.equal(recipientLookupMatches({ rail: 'momo' }), false);
});

test('confirmed lookup matching rejects absent consent and drift in the accepted recipient', () => {
  for (const rail of ['momo', 'bank']) {
    const payment = readyPayment(rail);
    payment.recipientLookup.confirmed = true;
    payment.recipient = { ...payment.recipientLookup.recipient };
    assert.equal(recipientLookupMatches(payment, { confirmed: true }), true);
    for (const key of ['name', 'number', rail === 'momo' ? 'network' : 'bank']) {
      const changed = structuredClone(payment); changed.recipient[key] = 'Something else';
      assert.equal(recipientLookupMatches(changed, { confirmed: true }), false);
    }
    payment.recipientLookup.confirmed = false;
    assert.equal(recipientLookupMatches(payment, { confirmed: true }), false);
  }
});

function clock() {
  let next = 0;
  const pending = new Map(), history = new Map();
  return {
    pending, history,
    schedule(callback, delay) { const id = ++next; pending.set(id, { callback, delay }); history.set(id, callback); return id; },
    cancel(id) { pending.delete(id); },
    fire() { const tasks = [...pending]; pending.clear(); tasks.forEach(([, task]) => task.callback()); },
  };
}
const flush = async () => { await Promise.resolve(); await Promise.resolve(); await Promise.resolve(); };

test('lookup delay completes once and cancellation removes timers without resolving an identity', async () => {
  const time = clock(), controller = createRecipientLookup({ ...time });
  const request = { rail: 'momo', number: '0245550182' };
  const first = controller.run(request);
  assert.equal(controller.running, true); assert.equal([...time.pending.values()][0].delay, 1100);
  controller.cancel(); assert.equal(await first, null); assert.equal(controller.running, false); assert.equal(time.pending.size, 0);
  for (const callback of time.history.values()) callback();
  const second = controller.run(request); time.fire();
  assert.equal((await second).recipient.name, 'Kofi Mensah'); assert.equal(controller.running, false);
});

test('a new lookup cancels the old result, and late provider success or rejection cannot replace it', async () => {
  const time = clock(), providers = [];
  const controller = createRecipientLookup({ ...time, lookup: request => new Promise((resolve, reject) => providers.push({ request, resolve, reject })) });
  const firstRequest = { rail: 'momo', number: '0245550182' };
  const first = controller.run(firstRequest); firstRequest.number = '0205550166';
  time.fire(); await flush();
  assert.equal(providers[0].request.number, '0245550182', 'input mutation cannot change an in-flight lookup');
  const second = controller.run({ rail: 'momo', number: '0555550124' });
  assert.equal(await first, null);
  time.fire(); await flush();
  providers[0].resolve({ ok: true, recipient: { name: 'Stale name' } }); await flush();
  assert.equal(controller.running, true);
  providers[1].resolve(resolveDemoRecipient(providers[1].request));
  assert.equal((await second).recipient.name, 'Akosua Owusu');
  const cancelled = controller.run({ rail: 'momo', number: '0205550166' }); time.fire(); await flush();
  controller.cancel(); assert.equal(await cancelled, null);
  providers[2].reject(new Error('Late failure')); await flush();
  assert.equal(controller.running, false);
});

test('provider failures are recoverable, and disposal permanently suppresses future runs', async () => {
  const time = clock(); let calls = 0;
  const controller = createRecipientLookup({ ...time, lookup: () => { calls++; throw new Error('Offline'); } });
  const first = controller.run({ rail: 'momo', number: '0245550182' }); time.fire();
  assert.equal((await first).code, 'unavailable'); assert.equal(controller.running, false);
  const retry = controller.run({ rail: 'momo', number: '0245550182' }); time.fire();
  assert.equal((await retry).code, 'unavailable'); assert.equal(calls, 2);
  const waiting = controller.run({ rail: 'momo', number: '0245550182' });
  controller.dispose(); controller.dispose(); assert.equal(await waiting, null); assert.equal(time.pending.size, 0);
  assert.equal(await controller.run({ rail: 'momo', number: '0245550182' }), null); assert.equal(calls, 2);
});
