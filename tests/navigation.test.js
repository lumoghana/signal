import test from 'node:test';
import assert from 'node:assert/strict';
import { routeKey, sectionForRoute, routeLabel, parentRoute, safeRoute, compactTrail } from '../dist/js/navigation.js';
import { createDemoState, applyAction, evaluatePayment } from '../dist/js/model.js';

const home = { section: 'home', page: 'home' };
const groups = { section: 'life', page: 'groups' };
const boxHome = { section: 'boxes', page: 'home' };
const payHome = { section: 'pay', page: 'home' };

test('groups remain a main section throughout setup and detail, while labels describe destinations', () => {
  assert.equal(sectionForRoute({ section: 'life', page: 'group-create', step: 2 }), 'groups');
  assert.equal(sectionForRoute({ section: 'life', page: 'group-detail', id: 'weekend' }), 'groups');
  assert.equal(routeLabel(groups), 'Groups');
  assert.equal(sectionForRoute({ section: 'life', page: 'ious' }), 'home');
  assert.equal(routeKey({ section: 'groups', page: 'home' }), routeKey(groups));
});

test('group setup moves through logical previous steps and exits directly to Groups', () => {
  assert.deepEqual(parentRoute({ section: 'life', page: 'group-create', step: 0 }), groups);
  assert.deepEqual(parentRoute({ section: 'life', page: 'group-create', step: 2 }), { section: 'life', page: 'group-create', step: 1 });
  assert.deepEqual(parentRoute({ section: 'life', page: 'group-create', step: 1, edit: true }), { section: 'life', page: 'group-create', step: 4 });
  assert.deepEqual(parentRoute({ section: 'life', page: 'group-detail', id: 'weekend' }), groups);
});

test('an explicit return destination survives entry from Chat or a different section', () => {
  const chat = { section: 'chat', page: 'home' };
  assert.deepEqual(parentRoute({ section: 'life', page: 'recovery', returnTo: chat }), chat);
  assert.deepEqual(parentRoute({ section: 'pay', page: 'transaction', id: 'receipt', returnTo: { section: 'activity', page: 'home' } }), { section: 'activity', page: 'home' });
  assert.deepEqual(parentRoute({ section: 'boxes', page: 'create', step: 'target', backTo: boxHome, returnTo: chat }), boxHome);
});

test('goal review edits return to review rather than creating an edit loop', () => {
  assert.deepEqual(parentRoute({ section: 'boxes', page: 'create', step: 'target', edit: true }), { section: 'boxes', page: 'create', step: 'review' });
  assert.deepEqual(parentRoute({ section: 'boxes', page: 'create', step: 'review', edit: true }), { section: 'boxes', page: 'create', step: 'partner' });
  assert.deepEqual(parentRoute({ section: 'boxes', page: 'create', step: 'date' }), { section: 'boxes', page: 'create', step: 'target' });
  assert.deepEqual(parentRoute({ section: 'boxes', page: 'hack', id: 'laptop' }), { section: 'boxes', page: 'detail', id: 'laptop' });
  assert.deepEqual(parentRoute({ section: 'plan', page: 'create', step: 'amount', edit: true }), { section: 'plan', page: 'create', step: 'review' });
});

test('IOU detail returns to the correct incoming or outgoing list', () => {
  const state = createDemoState();
  assert.deepEqual(parentRoute({ section: 'life', page: 'iou-detail', id: 'iou-kwame' }, state), { section: 'life', page: 'ious', filter: 'owedByMe' });
  assert.deepEqual(parentRoute({ section: 'life', page: 'iou-detail', id: 'iou-akos' }, state), { section: 'life', page: 'ious', filter: 'owedToMe' });
});

test('IOU creation has a previous step, filtered exit and direct return from editing', () => {
  const draft = { iouCreate: { type: 'owedByMe', name: 'Kofi' } };
  assert.deepEqual(parentRoute({ section: 'life', page: 'iou-create', step: 0 }, {}, draft), { section: 'life', page: 'ious', filter: 'owedByMe' });
  assert.deepEqual(parentRoute({ section: 'life', page: 'iou-create', step: 3 }, {}, draft), { section: 'life', page: 'iou-create', step: 2, filter: 'owedByMe' });
  assert.deepEqual(parentRoute({ section: 'life', page: 'iou-create', step: 1 }, {}, { iouCreate: { edit: true, id: 'iou-kwame', type: 'owedByMe' } }), { section: 'life', page: 'iou-detail', id: 'iou-kwame', filter: 'owedByMe' });
  assert.deepEqual(safeRoute({ section: 'life', page: 'iou-create', step: 2, filter: 'owedByMe' }, createDemoState(), {}), { section: 'life', page: 'ious', filter: 'owedByMe' });
  assert.equal(safeRoute({ section: 'life', page: 'iou-create', step: 2 }, createDemoState(), draft).page, 'iou-create');
  assert.equal(draft.iouCreate.name, 'Kofi');
});

test('payment entry has logical previous destinations and results never lead back to execution', () => {
  assert.deepEqual(parentRoute({ section: 'pay', page: 'amount' }, {}, { payment: { recipient: { id: 'kofi', name: 'Kofi' } } }), { section: 'pay', page: 'conversation', id: 'kofi' });
  assert.deepEqual(parentRoute({ section: 'pay', page: 'review' }), { section: 'pay', page: 'amount' });
  assert.deepEqual(parentRoute({ section: 'pay', page: 'pause' }), { section: 'pay', page: 'review' });
  for (const page of ['status', 'transaction', 'fund-status', 'collect', 'scan']) assert.deepEqual(parentRoute({ section: 'pay', page }), payHome);
});

test('a restored Pause stays available only while the current payment still needs it', () => {
  const state = createDemoState();
  const payment = { recipient: { name: 'Kofi' }, amount: 50000, category: 'Other' };
  const route = { section: 'pay', page: 'pause', backTo: { section: 'pay', page: 'review' } };
  const snapshot = JSON.stringify({ state, payment });
  assert.equal(evaluatePayment(state, payment).needed, true);
  assert.deepEqual(safeRoute(route, state, { payment }), route);
  assert.equal(JSON.stringify({ state, payment }), snapshot);
});

test('balance, budget and amount changes send an obsolete Pause back to a clean review', () => {
  const changes = [
    state => { state.wallet = 1000000; },
    state => { state.budget.items.push({ id: 'other', name: 'Other', amount: 50000, spent: 0 }); },
    (state, payment) => { payment.amount = 1000; },
  ];
  for (const change of changes) {
    const state = createDemoState(), payment = { recipient: { name: 'Kofi' }, amount: 50000, category: 'Other' };
    assert.equal(evaluatePayment(state, payment).needed, true);
    change(state, payment);
    assert.equal(evaluatePayment(state, payment).needed, false);
    const snapshot = JSON.stringify({ state, payment });
    const result = safeRoute({ section: 'pay', page: 'pause', backTo: { section: 'pay', page: 'review' }, returnTo: { section: 'pay', page: 'pause' } }, state, { payment });
    assert.deepEqual(result, { section: 'pay', page: 'review' });
    assert.deepEqual(parentRoute(result), { section: 'pay', page: 'amount' }, 'old Pause ancestry cannot make review point back to itself');
    assert.equal(JSON.stringify({ state, payment }), snapshot, 'route restoration must not change money or the draft');
  }
});

test('an old Pause with insufficient funds returns to review instead of bypassing funding', () => {
  const state = createDemoState(), payment = { recipient: { name: 'Kofi' }, amount: 50000, category: 'Other' };
  assert.equal(evaluatePayment(state, payment).needed, true);
  state.wallet = 10000;
  const snapshot = JSON.stringify({ state, payment });
  assert.equal(evaluatePayment(state, payment).allowed, false);
  assert.deepEqual(safeRoute({ section: 'pay', page: 'pause' }, state, { payment }), { section: 'pay', page: 'review' });
  assert.equal(JSON.stringify({ state, payment }), snapshot);
  assert.deepEqual(safeRoute({ section: 'pay', page: 'pause' }, state, { payment: { ...payment, recipient: null } }), { section: 'pay', page: 'recipient' });
  assert.deepEqual(safeRoute({ section: 'pay', page: 'pause' }, state, { payment: { ...payment, amount: 0 } }), { section: 'pay', page: 'amount' });
});

test('stale wizard entries after creation cannot reopen cleared forms', () => {
  const state = createDemoState();
  assert.deepEqual(safeRoute({ section: 'boxes', page: 'create', step: 'review' }, state, { box: null }), boxHome);
  assert.deepEqual(safeRoute({ section: 'plan', page: 'create', step: 'date' }, state, {}), { section: 'plan', page: 'home' });
  assert.deepEqual(safeRoute({ section: 'life', page: 'group-create', step: 2 }, state, {}), groups);
  const draft = { groupCreate: { name: 'Legon trip', target: 20000 } };
  assert.equal(safeRoute({ section: 'life', page: 'group-create', step: 1 }, state, draft).step, 1);
  assert.equal(draft.groupCreate.name, 'Legon trip');
});

test('a committed payment cannot be reopened for execution through a stale browser entry', () => {
  const state = createDemoState();
  const payment = { recipient: { name: 'Kofi' }, amount: 5000, category: 'Personal', idempotencyKey: 'navigation-finish' };
  const result = applyAction(state, 'payment', payment);
  assert.equal(result.ok, true);
  assert.equal(evaluatePayment(state, payment).needed, false, 'a stale completed payment would otherwise skip Pause and return to review');
  const snapshot = JSON.stringify(state);
  for (const page of ['recipient', 'amount', 'review', 'pause']) {
    assert.deepEqual(safeRoute({ section: 'pay', page }, state, { payment }), { section: 'pay', page: 'status', id: result.id });
  }
  assert.equal(JSON.stringify(state), snapshot, 'navigation must never change financial state');
  assert.deepEqual(safeRoute({ section: 'pay', page: 'review' }, state, { payment: null }), payHome);
});

test('a retry with a new operation key is a new draft rather than the previous failed payment', () => {
  const state = createDemoState();
  const payment = { recipient: { name: 'Kofi' }, amount: 5000, category: 'Personal', status: 'failed', idempotencyKey: 'failed-nav' };
  applyAction(state, 'payment', payment);
  const retry = { ...payment, idempotencyKey: 'retry-nav' };
  assert.equal(safeRoute({ section: 'pay', page: 'review' }, state, { payment: retry }).page, 'review');
});

test('deleted entities and incomplete payment drafts fall back to useful destinations', () => {
  const state = createDemoState();
  assert.deepEqual(safeRoute({ section: 'boxes', page: 'detail', id: 'deleted' }, state), boxHome);
  assert.deepEqual(safeRoute({ section: 'life', page: 'group-detail', id: 'deleted' }, state), groups);
  assert.deepEqual(safeRoute({ section: 'pay', page: 'review' }, state, { payment: { recipient: { name: 'Kofi' }, amount: 0 } }), { section: 'pay', page: 'amount' });
});

test('returning to a review prunes edits instead of adding repeated Back destinations', () => {
  const review = { section: 'boxes', page: 'create', step: 'review' };
  const edit = { section: 'boxes', page: 'create', step: 'target', edit: true };
  const trail = compactTrail([home, boxHome, review, edit], review);
  assert.deepEqual(trail, [home, boxHome]);
  assert.deepEqual(compactTrail([...trail, review], review), trail);
});

test('finishing group creation retains only safe ancestry before the new detail', () => {
  const next = { section: 'life', page: 'group-detail', id: 'new-group' };
  const trail = [home, groups, ...[0, 1, 2, 3, 4].map(step => ({ section: 'life', page: 'group-create', step }))];
  assert.deepEqual(compactTrail(trail, next, { finish: true }), [home, groups]);
  assert.deepEqual(compactTrail(trail, home, { root: true }), []);
});

test('finished payment history removes execution and root navigation clears the old journey', () => {
  const trail = [home, payHome, { section: 'pay', page: 'recipient' }, { section: 'pay', page: 'amount' }, { section: 'pay', page: 'review' }, { section: 'pay', page: 'pause' }];
  assert.deepEqual(compactTrail(trail, { section: 'pay', page: 'status', id: 'paid' }, { finish: true }), [home, payHome]);
  assert.deepEqual(compactTrail(trail, { section: 'plan', page: 'home' }, { root: true }), []);
});

test('finishing an IOU removes its setup screens and preserves the filtered list parent', () => {
  const list = { section: 'life', page: 'ious', filter: 'owedByMe' };
  const detail = { section: 'life', page: 'iou-detail', id: 'new-iou', returnTo: list };
  const trail = [home, list, ...[0, 1, 2, 3].map(step => ({ section: 'life', page: 'iou-create', step, filter: 'owedByMe' }))];
  assert.deepEqual(compactTrail(trail, detail, { finish: true }), [home, list]);
});

test('canonical parents do not depend on an iOS or Android browser history stack', () => {
  const route = { section: 'life', page: 'group-detail', id: 'new-group' };
  assert.deepEqual(parentRoute(route), groups);
  assert.deepEqual(parentRoute({ ...route, returnTo: home }), home);
  assert.equal(routeLabel(parentRoute({ section: 'boxes', page: 'detail', id: 'laptop' })), 'Money Boxes');
});
