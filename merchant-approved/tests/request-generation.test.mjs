import test from 'node:test';
import assert from 'node:assert/strict';
import {createBusiness, reduceBusiness, ledger} from '../dist/domain.js';

const now = '2026-11-12T12:00:00.000Z';
const owner = {role: 'owner', userId: 'owner-one'};
function setup() {
 const state = createBusiness({name: 'Campus Kitchen', ownerName: 'Test Owner', phone: '0240000000', businessType: 'Sole trader', destination: 'Test destination', verification: {identity: true, face: true}, shop: {name: 'Night Market', area: 'Legon', category: 'Food', lat: 5.65, lng: -.18}}, {now});
 const shopId = state.shops[0].id;
 state.staff.push({id: 'cashier-one', role: 'cashier', name: 'Cashier One', shopId, active: true});
 return {state, shopId, cashier: {role: 'cashier', shopId, staffId: 'cashier-one'}};
}
const act = (state, type, payload, actor = owner, at = now) => reduceBusiness(state, type, payload, actor, {now: at});

test('a paused or closed shop cannot create a payment QR request', () => {
 for (const flag of ['accepting', 'open']) {
  const {state, shopId, cashier} = setup();
  state.shops[0][flag] = false;
  const before = structuredClone(state);
  for (const actor of [owner, cashier]) assert.throws(() => act(state, 'CREATE_REQUEST', {shopId, amount: 2500, attemptId: 'paused-attempt'}, actor), /not accepting payments/);
  assert.deepEqual(state, before);
 }
});

test('request retries retain the original QR and expiry, including after expiry or cancellation', () => {
 const {state, shopId, cashier} = setup();
 const payload = {shopId, amount: 2500, description: 'Lunch', attemptId: 'same-qr-attempt'};
 const first = act(state, 'CREATE_REQUEST', payload, cashier);
 const retry = act(first.state, 'CREATE_REQUEST', payload, cashier, '2026-11-12T12:01:00.000Z');
 assert.equal(retry.changed, false);
 assert.deepEqual(retry.entity, first.entity);
 assert.equal(retry.state.requests.length, 1);
 const expired = act(retry.state, 'CREATE_REQUEST', payload, cashier, '2026-11-12T13:00:00.000Z');
 assert.equal(expired.changed, false);
 assert.equal(expired.entity.expiresAt, '2026-11-12T12:15:00.000Z');
 const cancelled = act(first.state, 'CANCEL_REQUEST', {id: first.entity.id}, cashier);
 cancelled.state.shops[0].accepting = false;
 const replay = act(cancelled.state, 'CREATE_REQUEST', payload, cashier);
 assert.equal(replay.changed, false);
 assert.equal(replay.entity.status, 'cancelled');
 assert.equal(replay.state.requests.length, 1);
 assert.deepEqual(replay.state, cancelled.state);
});

test('a paid request retry returns its original outcome without creating another request or changing money', () => {
 const {state, shopId} = setup();
 const payload = {shopId, amount: 2500, attemptId: 'paid-qr-attempt'};
 const first = act(state, 'CREATE_REQUEST', payload);
 const paid = act(first.state, 'PAY', {shopId, amount: 2500, requestId: first.entity.id}, {role: 'student'});
 const balance = ledger(paid.state);
 const replay = act(paid.state, 'CREATE_REQUEST', payload);
 assert.equal(replay.changed, false);
 assert.equal(replay.entity.id, first.entity.id);
 assert.equal(replay.entity.status, 'paid');
 assert.equal(replay.state.requests.length, 1);
 assert.deepEqual(ledger(replay.state), balance);
});

test('request references cannot be reused for a different amount, description, shop or operator', () => {
 let {state, shopId, cashier} = setup();
 const payload = {shopId, amount: 2500, description: 'Lunch', attemptId: 'bound-attempt'};
 const first = act(state, 'CREATE_REQUEST', payload, cashier);
 state = first.state;
 const otherShop = {...state.shops[0], id: 'second-shop', name: 'Pentagon', code: 'LUM102'};
 state.shops.push(otherShop);
 state.staff.push({id: 'cashier-two', role: 'cashier', name: 'Cashier Two', shopId, active: true});
 const before = structuredClone(state);
 for (const changed of [{amount: 2501}, {description: 'Dinner'}]) assert.throws(() => act(state, 'CREATE_REQUEST', {...payload, ...changed}, cashier), /different request or operator/);
 assert.throws(() => act(state, 'CREATE_REQUEST', {...payload, shopId: otherShop.id}, owner), /different request or operator/);
 assert.throws(() => act(state, 'CREATE_REQUEST', payload, {...cashier, staffId: 'cashier-two'}), /different request or operator/);
 assert.throws(() => act(state, 'CREATE_REQUEST', payload, owner), /different request or operator/);
 assert.deepEqual(state, before);
 const ownerFirst = act(state, 'CREATE_REQUEST', {...payload, attemptId: 'owner-attempt'});
 assert.throws(() => act(ownerFirst.state, 'CREATE_REQUEST', {...payload, attemptId: 'owner-attempt'}, {role: 'owner', userId: 'owner-two'}), /different request or operator/);
});

test('legacy request callers remain supported while invalid attempt references are rejected', () => {
 const {state, shopId} = setup();
 const payload = {shopId, amount: 2500};
 const first = act(state, 'CREATE_REQUEST', payload);
 const second = act(first.state, 'CREATE_REQUEST', payload);
 assert.equal(second.state.requests.length, 2);
 assert.notEqual(second.entity.id, first.entity.id);
 assert.equal(Object.hasOwn(first.entity, 'attemptId'), false);
 for (const attemptId of ['', ' '.repeat(3), 'x'.repeat(121)]) assert.throws(() => act(state, 'CREATE_REQUEST', {...payload, attemptId}), /attempt reference/);
});
