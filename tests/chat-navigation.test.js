import test from 'node:test';
import assert from 'node:assert/strict';
import { chatReturnRoute, parentRoute, routeKey, safeRoute } from '../dist/js/navigation.js';
import { createRouter } from '../dist/js/router.js';
import { createDemoState } from '../dist/js/model.js';
import { cancelRecipientEditOnExit } from '../dist/js/payments.js';

const home = { section: 'home', page: 'home' };
const payHome = { section: 'pay', page: 'home' };
const clone = value => structuredClone(value);
const payment = () => ({
  rail: 'lumo', recipient: { id: 'kofi', name: 'Kofi Mensah', number: '@kofi' },
  amount: 2500, amountText: '25', category: 'Food', note: 'Lunch',
  idempotencyKey: 'chat-navigation-payment',
});

test('Chat return defaults to Home and rejects invalid or looping origins', () => {
  const state = createDemoState();
  const invalid = [null, [], '', { section: 'missing' }, { section: 'chat', page: 'home' },
    { section: 'welcome' }, { section: 'onboarding', step: 'pin' },
    { section: 'activation' }, { section: 'tour', step: 0 }];
  assert.deepEqual(chatReturnRoute({}, state), home);
  for (const returnTo of invalid) {
    assert.deepEqual(chatReturnRoute({ section: 'chat', returnTo }, state), home);
  }
  assert.deepEqual(chatReturnRoute({}, state, { chatReturnTo: { section: 'chat' } }), home);
  assert.deepEqual(chatReturnRoute({ returnTo: home }, state, { chatReturnTo: payHome }), home);
});

test('Chat keeps the selected Insights month and an existing savings Box', () => {
  const state = createDemoState();
  const insights = { section: 'activity', page: 'insights', month: '2026-10' };
  const box = { section: 'boxes', page: 'detail', id: state.boxes[0].id };
  const before = JSON.stringify(state);
  assert.deepEqual(chatReturnRoute({ returnTo: insights }, state), insights);
  assert.deepEqual(chatReturnRoute({}, state, { chatReturnTo: box }), box);
  assert.deepEqual(chatReturnRoute({ returnTo: { ...box, id: 'removed-box' } }, state), { section: 'boxes', page: 'home' });
  assert.equal(JSON.stringify(state), before);
});

test('an unfinished payment returns to its amount page without changing the draft or money', () => {
  const state = createDemoState(), draft = { payment: payment() };
  const amount = { section: 'pay', page: 'amount', backTo: { section: 'pay', page: 'conversation', id: 'kofi' } };
  const before = JSON.stringify({ state, draft });
  assert.deepEqual(chatReturnRoute({ returnTo: amount }, state, draft), amount);
  assert.equal(JSON.stringify({ state, draft }), before);
});

test('a payment completed during Chat returns to its result instead of payment execution', () => {
  const state = createDemoState();
  const draft = { payment: { ...payment(), completed: true, transactionId: 'tx-finished' } };
  const before = JSON.stringify({ state, draft });
  for (const page of ['amount', 'review', 'pause']) {
    assert.deepEqual(chatReturnRoute({ returnTo: { section: 'pay', page } }, state, draft), { section: 'pay', page: 'status', id: 'tx-finished' });
  }
  delete draft.payment.transactionId;
  assert.deepEqual(chatReturnRoute({ returnTo: { section: 'pay', page: 'review' } }, state, draft), payHome);
  draft.payment.transactionId = 'tx-finished';
  assert.equal(JSON.stringify({ state, draft }), before);
});

test('cleared forms return from Chat to a usable parent', () => {
  const state = createDemoState();
  const cases = [
    [{ section: 'boxes', page: 'create', step: 'review' }, { section: 'boxes', page: 'home' }],
    [{ section: 'plan', page: 'create', step: 'amount' }, { section: 'plan', page: 'home' }],
    [{ section: 'pay', page: 'amount' }, payHome],
    [{ section: 'life', page: 'group-create', step: 2 }, { section: 'life', page: 'groups' }],
  ];
  for (const [returnTo, expected] of cases) assert.deepEqual(chatReturnRoute({ returnTo }, state, {}), expected);
});

test('leaving an unaccepted recipient edit for Chat restores the accepted payment and returns to Review', () => {
  const state = createDemoState();
  const accepted = payment();
  const draft = {
    payment: { ...accepted, recipient: { id: 'akosua', name: 'Akosua' }, amount: 9000 },
    paymentEditBackup: clone(accepted),
  };
  const editor = { section: 'pay', page: 'recipient', edit: true, backTo: { section: 'pay', page: 'review' } };
  const chat = { section: 'chat', page: 'home', returnTo: editor };
  const moneyBefore = JSON.stringify(state);
  assert.equal(cancelRecipientEditOnExit(draft, editor, chat), true);
  assert.deepEqual(draft.payment, accepted);
  assert.equal(draft.paymentEditBackup, undefined);
  assert.deepEqual(chatReturnRoute(chat, state, draft), { section: 'pay', page: 'review' });
  assert.equal(JSON.stringify(state), moneyBefore);
});

function navigationHarness(state, draft) {
  let native = [null], pointer = 0, rendered = home;
  const pendingNative = [];
  const history = {
    get state() { return native[pointer]; },
    pushState(value) { native = native.slice(0, pointer + 1); native.push(clone(value)); pointer += 1; },
    replaceState(value) { native[pointer] = clone(value); },
    go(delta) { pendingNative.push(pointer + delta); },
  };
  const router = createRouter({
    initialRoute: home, history,
    normalize: route => safeRoute(route, state, draft),
    parent: route => parentRoute(route, state, draft), key: routeKey,
    rootFor: route => ({ section: route.section, page: 'home' }),
    onNavigate(next) { rendered = next; },
  });
  function flush() {
    while (pendingNative.length) {
      pointer = pendingNative.shift();
      assert.ok(pointer >= 0 && pointer < native.length, 'router stays inside native app history');
      router.receive(history.state);
    }
  }
  function go(next, options) { router.go(next, options); flush(); }
  function openChat() {
    const returnTo = chatReturnRoute({ returnTo: rendered }, state, draft);
    draft.chatReturnTo = returnTo;
    go({ section: 'chat', page: 'home', returnTo });
  }
  function returnToApp() { go(chatReturnRoute(rendered, state, draft), { replace: true }); }
  router.initialise();
  return { router, go, openChat, returnToApp, get current() { return rendered; },
    nativeBack() { history.go(-1); flush(); }, nativeForward() { history.go(1); flush(); } };
}

test('opening Chat and swiping back keeps the exact app page, typed conversation and history', () => {
  const state = createDemoState();
  const draft = { chat: { input: 'Can I afford lunch?', messages: [{ role: 'user', text: 'How is my week looking?' }] } };
  const nav = navigationHarness(state, draft);
  const insights = { section: 'activity', page: 'insights', month: '2026-10' };
  const moneyBefore = JSON.stringify(state), conversationBefore = JSON.stringify(draft.chat);
  nav.go(insights);
  nav.openChat();
  assert.deepEqual(nav.current, { section: 'chat', page: 'home', returnTo: insights });
  nav.returnToApp();
  assert.deepEqual(nav.current, insights);
  nav.nativeBack();
  assert.deepEqual(nav.current, home);
  nav.nativeForward();
  assert.deepEqual(nav.current, insights);
  nav.openChat();
  nav.returnToApp();
  assert.deepEqual(nav.current, insights);
  assert.equal(nav.router.snapshot().entries.length, 3, 'reopening Chat reuses its forward entry');
  assert.equal(JSON.stringify(draft.chat), conversationBefore);
  assert.equal(JSON.stringify(state), moneyBefore);
});

test('Chat history restores a payment amount draft without paying or losing its input', () => {
  const state = createDemoState();
  const draft = { payment: payment(), chat: { input: 'What does this leave me?', messages: [] } };
  const nav = navigationHarness(state, draft);
  const amount = { section: 'pay', page: 'amount' };
  const moneyBefore = JSON.stringify(state), paymentBefore = JSON.stringify(draft.payment);
  nav.go(payHome);
  nav.go(amount);
  nav.openChat();
  nav.returnToApp();
  assert.deepEqual(nav.current, amount);
  nav.nativeBack();
  assert.deepEqual(nav.current, payHome);
  nav.nativeForward();
  assert.deepEqual(nav.current, amount);
  assert.equal(JSON.stringify(draft.payment), paymentBefore);
  assert.equal(draft.chat.input, 'What does this leave me?');
  assert.equal(JSON.stringify(state), moneyBefore);
});
