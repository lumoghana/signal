import test from 'node:test';
import assert from 'node:assert/strict';
import { createDemoState, createEmptyState, applyAction, loadState, saveState, STORAGE_KEY, favoriteRecipientKey } from '../dist/js/model.js';
import { prepareServicePayment } from '../dist/js/payment-catalog.js';

const run = (s, type, value = {}) => { const result = applyAction(s, type, value); assert.equal(result.ok, true, result.message); return result; };
const financial = s => JSON.stringify({ wallet: s.wallet, buffer: s.buffer, budget: s.budget, boxes: s.boxes, transactions: s.transactions, groups: s.groups });

test('saved favourites preserve destination details and canonical duplicate contacts are not added twice', () => {
  const state = createDemoState(), before = financial(state);
  const { favorite } = run(state, 'savePaymentFavorite', { rail: 'momo', recipient: { name: 'Esi', number: '+233 24 111 2222', network: 'MTN MoMo' } });
  assert.equal(favorite.recipient.number, '0241112222');
  assert.equal(favorite.recipient.network, 'MTN MoMo');
  const duplicate = run(state, 'savePaymentFavorite', { rail: 'momo', recipient: { name: 'Esi Mensah', number: '024 111 2222' } });
  assert.equal(duplicate.duplicate, true); assert.equal(duplicate.favorite.id, favorite.id); assert.equal(state.paymentFavorites.length, 1);
  const bank = run(state, 'savePaymentFavorite', { rail: 'bank', recipient: { name: 'Esi', number: '1234567890', bank: 'GCB Bank' } });
  assert.notEqual(favoriteRecipientKey(bank.favorite), favoriteRecipientKey(favorite));
  run(state, 'savePaymentFavorite', { rail: 'lumo', recipient: { name: 'Kofi', id: 'kofi' } });
  run(state, 'removePaymentFavorite', { id: favorite.id });
  assert.equal(state.paymentFavorites.length, 2);
  assert.equal(financial(state), before);
});

test('invalid favourites fail atomically and cannot overwrite an existing destination', () => {
  const state = createEmptyState();
  const first = run(state, 'savePaymentFavorite', { rail: 'bank', recipient: { name: 'Kofi', number: '1234567890', bank: 'GCB Bank' } });
  const second = run(state, 'savePaymentFavorite', { rail: 'bank', recipient: { name: 'Ama', number: '2222222222', bank: 'GCB Bank' } });
  for (const payload of [
    { rail: 'bill', recipient: { name: 'Kofi' } },
    { rail: 'lumo', recipient: null },
    { rail: 'lumo', recipient: { name: 'K' } },
    { rail: 'momo', recipient: { name: 'Kofi', number: '123' } },
    { rail: 'bank', recipient: { name: 'Kofi', number: '1234567890' } },
    { rail: 'bank', recipient: { name: 'Kofi', number: '123abc890', bank: 'GCB Bank' } },
    { id: second.id, rail: 'bank', recipient: first.favorite.recipient },
    { id: 'unknown', rail: 'lumo', recipient: { name: 'Kofi' } },
  ]) {
    const before = JSON.stringify(state);
    assert.equal(applyAction(state, 'savePaymentFavorite', payload).ok, false);
    assert.equal(JSON.stringify(state), before);
  }
});

test('demo virtual card creation and freeze never issue credentials or move funds', () => {
  const state = createDemoState(), before = financial(state);
  assert.equal(applyAction(state, 'setDemoVirtualCardFrozen', { frozen: true }).ok, false);
  const created = run(state, 'createDemoVirtualCard', { idempotencyKey: 'create-demo-card' });
  assert.deepEqual(Object.keys(created.virtualCard).sort(), ['createdAt', 'id', 'last4', 'status']);
  assert.equal(created.virtualCard.last4, '4242'); assert.equal(created.virtualCard.status, 'active');
  const repeat = run(state, 'createDemoVirtualCard'); assert.equal(repeat.duplicate, true); assert.deepEqual(repeat.virtualCard, created.virtualCard);
  assert.equal(run(state, 'createDemoVirtualCard', { idempotencyKey: 'create-demo-card' }).duplicate, true);
  assert.equal(run(state, 'setDemoVirtualCardFrozen', { frozen: true }).virtualCard.status, 'frozen');
  const snapshot = JSON.stringify(state);
  assert.equal(applyAction(state, 'setDemoVirtualCardFrozen', { frozen: 'false' }).ok, false);
  assert.equal(JSON.stringify(state), snapshot);
  assert.equal(run(state, 'setDemoVirtualCardFrozen', { frozen: false }).virtualCard.status, 'active');
  assert.equal(financial(state), before);
});

test('v1 migration and damaged optional preferences preserve the existing financial ledger', () => {
  const state = createDemoState(), before = financial(state);
  delete state.paymentFavorites; delete state.virtualCard;
  const previous = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
  let stored = JSON.stringify(state);
  Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: { getItem: key => key === STORAGE_KEY ? stored : null, setItem: (_, value) => stored = value } });
  try {
    const migrated = loadState();
    assert.equal(financial(migrated), before); assert.deepEqual(migrated.paymentFavorites, []); assert.equal(migrated.virtualCard, null);
    run(migrated, 'savePaymentFavorite', { rail: 'lumo', recipient: { name: 'Kofi', id: 'kofi' } }); run(migrated, 'createDemoVirtualCard');
    assert.equal(saveState(migrated), true);
    assert.equal(loadState().paymentFavorites[0].recipient.name, 'Kofi'); assert.equal(loadState().virtualCard.last4, '4242');
    migrated.paymentFavorites = [null, { id: 'bad', rail: 'momo', recipient: { name: 'Bad number', number: '123' } }];
    migrated.virtualCard = { id: 'demo-virtual', status: 'active', last4: '4242', createdAt: 'invalid', pan: 'not allowed' };
    stored = JSON.stringify(migrated);
    const repaired = loadState();
    assert.equal(financial(repaired), before); assert.deepEqual(repaired.paymentFavorites, []); assert.equal(repaired.virtualCard.last4, '4242'); assert.equal(repaired.virtualCard.pan, undefined); assert.equal(repaired.virtualCards.length, 1); assert.equal(repaired.virtualCards[0].balance, 0);
  } finally {
    if (previous) Object.defineProperty(globalThis, 'localStorage', previous); else delete globalThis.localStorage;
  }
});

function servicePayload(id = 'data', fields = { network: 'MTN', phone: '0240000000', bundle: 'weekly' }) {
  const prepared = prepareServicePayment(id, fields); assert.equal(prepared.ok, true, prepared.message);
  const p = prepared.payment;
  return { paymentKind: 'service', serviceId: id, serviceFields: p.serviceFields || p.fields, recipient: p.recipient, merchant: p.recipient.name, amount: p.amount, category: p.category, rail: p.rail, reference: p.reference, bundleName: p.bundleName, hubTab: id === 'gobe-spot' ? 'campus' : 'bills' };
}

test('service payments preserve canonical receipt data and repeated confirmations debit only once', () => {
  const state = createDemoState(), before = state.wallet, payload = { ...servicePayload(), idempotencyKey: 'demo-data-payment' };
  const { transaction } = run(state, 'payment', payload);
  assert.equal(state.wallet, before - 2000);
  assert.equal(transaction.serviceId, 'data'); assert.equal(transaction.reference, '0240000000'); assert.equal(transaction.bundleName, 'Demo weekly bundle');
  assert.deepEqual(transaction.recipient, payload.recipient); assert.deepEqual(transaction.serviceFields, payload.serviceFields);
  assert.equal(transaction.paymentKind, 'service'); assert.equal(transaction.hubTab, 'bills');
  assert.equal(run(state, 'payment', payload).duplicate, true); assert.equal(state.wallet, before - 2000);
});

test('tampered service prices and destinations fail before any wallet, budget or savings mutation', () => {
  const payload = servicePayload();
  for (const change of [
    { amount: 1 }, { category: 'Food' }, { rail: 'lumo' }, { reference: 'different' }, { bundleName: 'Cheaper plan' }, { merchant: 'Different merchant' },
    { recipient: { ...payload.recipient, number: '0200000000' } }, { serviceFields: { ...payload.serviceFields, bundle: 'monthly' } },
    { serviceFields: null }, { paymentKind: 'person' }, { serviceId: 'unknown' }, { reference: {} },
  ]) {
    const state = createDemoState(), before = JSON.stringify(state);
    assert.equal(applyAction(state, 'payment', { ...payload, ...change }).ok, false);
    assert.equal(JSON.stringify(state), before);
  }
  const state = createDemoState();
  const alteredText = { ...payload, serviceFields: { ...payload.serviceFields, amountText: '0.01' } };
  const result = run(state, 'payment', alteredText);
  assert.equal(result.transaction.amount, 2000, 'catalogue owns the demo bundle price');
  assert.equal(result.transaction.serviceFields.amountText, '20.00');
});

test('legacy person payments retain normalized recipient details without changing payment accounting', () => {
  const state = createDemoState(), before = state.wallet;
  const { transaction } = run(state, 'payment', { recipient: { name: 'Kofi', number: '024 555 0182', id: 'kofi', secret: 'not copied' }, rail: 'lumo', amount: 1000 });
  assert.equal(state.wallet, before - 1000); assert.equal(transaction.recipient.name, 'Kofi'); assert.equal(transaction.recipient.secret, undefined);
  assert.equal(transaction.serviceFields, undefined);
});

test('an older in-session activation ledger still accepts funding and payments before persistent migration', () => {
  const state = createEmptyState(); delete state.paymentFavorites; delete state.virtualCard;
  run(state, 'fund', { amount: 10000 });
  run(state, 'payment', { recipient: 'Kofi', amount: 1000 });
  assert.equal(state.wallet, 9000);
  assert.equal(state.paymentFavorites, undefined, 'financial actions do not rewrite unrelated preferences');
  run(state, 'savePaymentFavorite', { rail: 'lumo', recipient: { name: 'Kofi' } });
  assert.equal(state.paymentFavorites.length, 1);
});
