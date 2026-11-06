import test from 'node:test';
import assert from 'node:assert/strict';
import { bindPayments, renderPayments, cancelRecipientEditOnExit } from '../dist/js/payments.js';
import { createEmptyState, applyAction } from '../dist/js/model.js';
import { safeRoute, parentRoute, routeKey } from '../dist/js/navigation.js';
import { createRouter } from '../dist/js/router.js';
import { validateRecipientLookup, resolveDemoRecipient, recipientLookupMatches } from '../dist/js/recipient-lookup.js';

class Element {
  constructor(value = '', dataset = {}) {
    this.value = value; this.dataset = dataset; this.isConnected = true; this.disabled = false;
    this.hidden = false; this.textContent = ''; this.innerHTML = ''; this.handlers = new Map();
    this.classList = { toggle() {}, add() {}, remove() {} }; this.attributes = new Map();
  }
  addEventListener(name, handler) { const list = this.handlers.get(name) || []; list.push(handler); this.handlers.set(name, list); }
  removeEventListener(name, handler) { this.handlers.set(name, (this.handlers.get(name) || []).filter(item => item !== handler)); }
  setAttribute(name, value) { this.attributes.set(name, value); }
  removeAttribute(name) { this.attributes.delete(name); }
  focus() {}
  fire(name, target = this) { for (const handler of this.handlers.get(name) || []) handler({ target, currentTarget: this, preventDefault() {} }); }
  click() { if (!this.disabled) this.fire('click'); }
}

const pay = (page, rest = {}) => ({ section: 'pay', page, ...rest });
const action = name => `[data-action="${name}"]`;

function lookup(payment, { accepted = false } = {}) {
  const checked = validateRecipientLookup(payment.rail, payment.recipientForms[payment.rail]);
  assert.equal(checked.ok, true);
  const result = resolveDemoRecipient(checked.request);
  assert.equal(result.ok, true);
  payment.recipientLookup = { key: checked.key, request: checked.request, recipient: result.recipient, confirmed: accepted };
  payment.recipient = accepted ? { ...result.recipient } : null;
  return result.recipient;
}

function confirmedPayment(rail = 'momo') {
  const form = rail === 'bank' ? { number: '0123456789', bank: 'Ecobank Ghana' } : { number: '0555550124' };
  const payment = { rail, amount: 2550, amountText: '25.50', category: 'Other', note: 'Lunch split', lookupRequired: true,
    idempotencyKey: 'recipient-integration-payment', recipientForms: { [rail]: form } };
  lookup(payment, { accepted: true });
  payment.amountBackTo = pay('recipient-confirm', { backTo: pay('recipient', { backTo: pay('home') }) });
  return payment;
}

function harness({ payment, route = pay('home') } = {}) {
  const state = createEmptyState({ name: 'Ama' }); state.onboardingDone = true; state.wallet = 100000; state.buffer = 0;
  const draft = payment ? { payment } : {}, routes = [], actions = [], auth = [], sheets = [];
  let current = route, cleanup, capture, nodes = new Map(), root;
  const node = (selector, value = '') => { const el = new Element(value); nodes.set(selector, el); return el; };
  const ctx = { state, draft, get route() { return current; },
    $(selector) { return nodes.get(selector) || null; },
    $$(selector) { const element = nodes.get(selector); return element ? [element] : []; },
    setCapture(fn) { capture = fn; }, saveDraft() {}, closeSheet() {}, toast() {},
    go(next, options) { capture?.(); capture = null; current = safeRoute(next, state, draft); routes.push({ route: current, options }); },
    finish(next) { this.go(next, { finish: true }); },
    refresh() { capture?.(); },
    auth(options) { auth.push(options); },
    act(type, payload) { actions.push({ type, payload }); return applyAction(state, type, payload); },
    sheet(html, bind, options = {}) {
      const items = new Map(), el = { querySelector(selector) { if (!items.has(selector)) items.set(selector, new Element()); return items.get(selector); } };
      sheets.push({ html, options, items }); bind?.(el);
    },
  };
  const bind = () => {
    cleanup?.(); for (const el of nodes.values()) el.isConnected = false;
    nodes = new Map(); root = new Element();
    for (const name of ['pay-cancel-edit', 'pay-cancel', 'pay-edit-recipient', 'pay-review-next', 'pay-amount-next', 'pay-new']) node(action(name));
    if (current.page === 'home') nodes.set('.payments-hub', root);
    if (current.page === 'recipients-list') nodes.set('.payment-extras-page', root);
    if (['recipient', 'recipient-confirm'].includes(current.page) && ['momo', 'bank'].includes(draft.payment?.rail)) {
      nodes.set('.account-recipient', root); const form = draft.payment.recipientForms?.[draft.payment.rail] || {};
      node('#recipient-lookup-form'); node('[name="recipientNumber"]', form.number || '');
      if (draft.payment.rail === 'bank') node('[name="recipientBank"]', form.bank || '');
      for (const selector of ['[data-recipient-confirm]', '[data-recipient-edit]', '[data-recipient-find]', '[data-recipient-demo]', '#recipient-error', '[data-recipient-status]', '.recipient-loading-dots']) node(selector);
      root.querySelector = selector => nodes.get(selector) || null;
    }
    if (current.page === 'amount') node('#payment-amount', draft.payment.amountText || '');
    cleanup = bindPayments(ctx, current);
  };
  bind();
  return { state, draft, ctx, routes, actions, auth, sheets, bind,
    get route() { return current; },
    go(next) { ctx.go(next); bind(); },
    click(selector) { nodes.get(selector)?.click(); },
    delegated(dataset) { root.fire('click', { closest: () => new Element('', dataset) }); },
    changeNumber(value) { nodes.get('[name="recipientNumber"]').value = value; nodes.get('#recipient-lookup-form').fire('input'); },
    close() { cleanup?.(); },
  };
}

test('payment rail entry asks for lookup details without accepting a typed name or choosing a network', () => {
  for (const rail of ['momo', 'bank']) {
    const h = harness(), before = JSON.stringify(h.state);
    try {
      h.delegated({ hubAction: rail });
      assert.equal(h.route.page, 'recipient');
      assert.equal(h.draft.payment.rail, rail); assert.equal(h.draft.payment.lookupRequired, true);
      assert.equal(h.draft.payment.recipient, null);
      const html = renderPayments(h.ctx, h.route);
      assert.doesNotMatch(html, /name="recipientName"|name="recipientNetwork"/);
      assert.equal(html.includes('name="recipientBank"'), rail === 'bank');
      assert.equal(JSON.stringify(h.state), before); assert.equal(h.actions.length, 0);
    } finally { h.close(); }
  }
});

test('a saved bank recipient prefills its exact bank and leading-zero account, then requires a fresh name lookup', () => {
  const h = harness({ route: pay('recipients-list', { list: 'favourites' }) });
  try {
    h.state.paymentFavorites = [{ id: 'saved-bank', rail: 'bank', recipient: { name: 'Old saved label', number: '0123456789', bank: 'Ecobank Ghana' } }];
    const before = JSON.stringify(h.state);
    h.delegated({ extraFavourite: 'saved-bank' });
    assert.equal(h.route.page, 'recipient');
    assert.equal(h.draft.payment.recipient, null);
    assert.deepEqual(h.draft.payment.recipientForms.bank, { number: '0123456789', bank: 'Ecobank Ghana' });
    assert.equal(h.draft.payment.lookupRequired, true);
    assert.doesNotMatch(renderPayments(h.ctx, h.route), /Old saved label/);
    assert.equal(JSON.stringify(h.state), before); assert.equal(h.actions.length, 0);
  } finally { h.close(); }
});

test('only the returned recipient confirmation prepares an amount step, with the lookup retained in its back path', () => {
  for (const rail of ['momo', 'bank']) {
    const payment = confirmedPayment(rail); payment.recipient = null; payment.recipientLookup.confirmed = false;
    const h = harness({ payment, route: pay('recipient-confirm', { backTo: pay('recipient', { backTo: pay('home') }) }) });
    const before = JSON.stringify(h.state), key = payment.idempotencyKey;
    try {
      h.click('[data-recipient-confirm]'); h.click('[data-recipient-confirm]');
      assert.equal(h.routes.length, 1); assert.equal(h.route.page, 'amount');
      assert.equal(recipientLookupMatches(payment, { confirmed: true }), true);
      assert.equal(payment.recipient.name, rail === 'bank' ? 'Esi Boateng' : 'Akosua Owusu');
      assert.equal(payment.recipient.number, rail === 'bank' ? '0123456789' : '0555550124');
      assert.equal(payment.idempotencyKey, key); assert.equal(payment.amount, 2550);
      assert.equal(parentRoute(h.route, h.state, h.draft).page, 'recipient-confirm');
      assert.equal(parentRoute(parentRoute(h.route, h.state, h.draft), h.state, h.draft).page, 'recipient');
      assert.equal(JSON.stringify(h.state), before); assert.equal(h.actions.length, 0);
    } finally { h.close(); }
  }
});

test('stale and unconfirmed lookups cannot enter amount, review or Pause through restored navigation', () => {
  const payment = confirmedPayment(), h = harness({ payment });
  const before = JSON.stringify(h.state);
  try {
    payment.recipientLookup.confirmed = false;
    for (const page of ['amount', 'review', 'pause']) assert.equal(safeRoute(pay(page), h.state, h.draft).page, 'recipient-confirm');
    payment.recipientLookup.confirmed = true;
    payment.recipientForms.momo.number = '0205550166';
    for (const page of ['recipient-confirm', 'amount', 'review', 'pause']) assert.equal(safeRoute(pay(page), h.state, h.draft).page, 'recipient');
    delete payment.recipientLookup;
    assert.equal(safeRoute(pay('review'), h.state, h.draft).page, 'recipient');
    assert.equal(JSON.stringify(h.state), before); assert.equal(h.actions.length, 0);
  } finally { h.close(); }
});

test('cancel recipient edit restores its confirmed identity and amount without changing the payment key or ledger', () => {
  const payment = confirmedPayment('bank'), h = harness({ payment, route: pay('review') });
  const before = structuredClone(payment), beforeState = JSON.stringify(h.state);
  try {
    h.click(action('pay-edit-recipient')); assert.equal(h.route.edit, true); h.bind();
    h.changeNumber('1234567890123');
    assert.equal(payment.recipient, null); assert.equal(payment.recipientLookup, undefined);
    h.click(action('pay-cancel-edit'));
    assert.equal(h.route.page, 'review'); assert.equal(h.draft.paymentEditBackup, undefined);
    for (const field of ['rail', 'recipient', 'recipientForms', 'recipientLookup', 'amount', 'amountText', 'amountBackTo', 'idempotencyKey', 'note', 'category']) assert.deepEqual(payment[field], before[field], field);
    assert.equal(recipientLookupMatches(payment, { confirmed: true }), true);
    assert.equal(JSON.stringify(h.state), beforeState); assert.equal(h.actions.length, 0);
  } finally { h.close(); }
});

test('changing the recipient before a pending PIN callback prevents the old approval from moving money', () => {
  const payment = confirmedPayment(), h = harness({ payment, route: pay('review') });
  const before = JSON.stringify(h.state);
  try {
    h.click(action('pay-review-next'));
    assert.equal(h.auth.length, 1); assert.equal(h.actions.length, 0);
    payment.recipientForms.momo.number = '0205550166';
    h.auth[0].onSuccess();
    assert.equal(h.route.page, 'recipient');
    assert.equal(h.actions.length, 0); assert.equal(JSON.stringify(h.state), before);
  } finally { h.close(); }
});

function editingSession() {
  const payment = confirmedPayment('bank'), backup = structuredClone(payment);
  const session = { payment, paymentEditBackup: backup };
  payment.recipientForms.bank.number = '1234567890123'; payment.recipient = null; delete payment.recipientLookup;
  return { session, backup };
}

test('native Back-style exits to Amount or Review restore the accepted payment before safe routing', () => {
  for (const destination of [pay('amount'), pay('review')]) {
    const { session, backup } = editingSession(), state = createEmptyState(); state.onboardingDone = true;
    assert.equal(cancelRecipientEditOnExit(session, pay('recipient', { edit: true }), destination), true);
    assert.deepEqual(session.payment, backup); assert.equal(session.paymentEditBackup, undefined);
    assert.equal(recipientLookupMatches(session.payment, { confirmed: true }), true);
    assert.equal(safeRoute(destination, state, session).page, destination.page);
    assert.equal(cancelRecipientEditOnExit(session, pay('recipient', { edit: true }), destination), false);
  }
});

test('recipient edit details and confirmation preserve changes until a global exit cancels them', () => {
  const { session, backup } = editingSession(), details = pay('recipient', { edit: true }), confirm = pay('recipient-confirm', { edit: true });
  const edited = structuredClone(session.payment);
  assert.equal(cancelRecipientEditOnExit(session, details, confirm), false);
  assert.equal(cancelRecipientEditOnExit(session, confirm, details), false);
  assert.deepEqual(session.payment, edited); assert.deepEqual(session.paymentEditBackup, backup);
  assert.equal(cancelRecipientEditOnExit(session, details, { section: 'home', page: 'home' }), true);
  assert.deepEqual(session.payment, backup); assert.equal(session.paymentEditBackup, undefined);
});

test('accepted edits, unrelated payment keys, and committed payments cannot be restored by stale navigation', () => {
  const from = pay('recipient-confirm', { edit: true }), destination = pay('review');
  const accepted = editingSession(); delete accepted.session.paymentEditBackup;
  assert.equal(cancelRecipientEditOnExit(accepted.session, from, destination), false);
  for (const change of [payment => { payment.idempotencyKey = 'a-different-payment'; }, payment => { payment.completed = true; }]) {
    const { session } = editingSession(); change(session.payment); const before = structuredClone(session);
    assert.equal(cancelRecipientEditOnExit(session, from, destination), false);
    assert.deepEqual(session, before);
  }
  const notEditing = editingSession(), before = structuredClone(notEditing.session);
  assert.equal(cancelRecipientEditOnExit(notEditing.session, pay('amount'), destination), false);
  assert.deepEqual(notEditing.session, before);
});

test('an edit confirmation rewind keeps the new lookup while a later user Back restores the original recipient', () => {
  const state = createEmptyState(); state.onboardingDone = true;
  const session = { payment: confirmedPayment() };
  let native = [null], pointer = 0, rendered = { section: 'home', page: 'home' }, pendingPageNavigation = false;
  const queue = [], seenPops = [];
  const history = {
    get state() { return native[pointer]; },
    pushState(value) { native = native.slice(0, pointer + 1); native.push(structuredClone(value)); pointer += 1; },
    replaceState(value) { native[pointer] = structuredClone(value); },
    go(delta) { queue.push(pointer + delta); },
  };
  const router = createRouter({ initialRoute: rendered, history, normalize: route => safeRoute(route, state, session),
    parent: route => parentRoute(route, state, session), key: routeKey,
    rootFor: route => ({ section: route.section, page: 'home' }),
    onNavigate(route) { rendered = route; pendingPageNavigation = false; },
  });
  const go = (next, options) => {
    cancelRecipientEditOnExit(session, rendered, next); pendingPageNavigation = true; router.go(next, options);
  };
  const flush = () => {
    while (queue.length) {
      pointer = queue.shift(); seenPops.push(structuredClone(history.state.route));
      // Application-initiated rewinds already checked their intended destination.
      if (!pendingPageNavigation) cancelRecipientEditOnExit(session, rendered, history.state.route);
      router.receive(history.state);
    }
  };
  // A resumed tab can start at confirmation without retaining the earlier form.
  router.initialise(); go(pay('home')); go(pay('recipient-confirm')); go(pay('amount')); go(pay('review'));
  const original = structuredClone(session.payment);
  session.paymentEditBackup = structuredClone(original);
  go(pay('recipient', { edit: true, backTo: pay('review') }), { replace: true });
  session.payment.recipientForms.momo.number = '0205550166'; lookup(session.payment);
  go(pay('recipient-confirm', { edit: true, backTo: pay('recipient', { edit: true, backTo: pay('review') }) }));
  assert.equal(queue.length, 1, 'confirmation uses the existing native entry');
  flush();
  assert.equal(seenPops.at(-1).page, 'recipient-confirm'); assert.equal(seenPops.at(-1).edit, undefined);
  assert.equal(rendered.page, 'recipient-confirm'); assert.equal(rendered.edit, true);
  assert.equal(session.payment.recipientLookup.recipient.name, 'Efua Asante');
  assert.ok(session.paymentEditBackup, 'the intermediate native entry cannot cancel the intended edit destination');
  history.go(-1); flush();
  assert.deepEqual(session.payment, original); assert.equal(session.paymentEditBackup, undefined);
});

test('a cancelled recipient edit resumes the original Review rather than a stranded editing checkpoint', () => {
  for (const exit of ['cancel', 'global']) {
    const payment = confirmedPayment(), h = harness({ payment, route: pay('review') });
    const original = structuredClone(payment), before = JSON.stringify(h.state);
    try {
      h.click(action('pay-edit-recipient')); h.bind(); h.changeNumber('0205550166');
      // The old editor can be captured immediately before a real navigation exit.
      payment.lastRoute = { ...h.route };
      if (exit === 'cancel') h.click(action('pay-cancel-edit'));
      else {
        h.ctx.setCapture(null);
        assert.equal(cancelRecipientEditOnExit(h.draft, h.route, pay('home')), true);
      }
      assert.equal(payment.lastRoute.page, 'review'); assert.equal(payment.lastRoute.edit, undefined);
      h.go(pay('home')); h.delegated({ hubAction: 'resume' });
      assert.equal(h.route.page, 'review'); assert.equal(h.route.edit, undefined);
      assert.deepEqual(payment.recipient, original.recipient); assert.equal(payment.amount, original.amount);
      assert.equal(payment.idempotencyKey, original.idempotencyKey); assert.equal(h.draft.paymentEditBackup, undefined);
      assert.equal(JSON.stringify(h.state), before); assert.equal(h.actions.length, 0);
    } finally { h.close(); }
  }
  const legacy = confirmedPayment(); legacy.lastRoute = pay('recipient', { edit: true });
  const h = harness({ payment: legacy });
  try {
    h.delegated({ hubAction: 'resume' });
    assert.equal(h.route.page, 'review'); assert.equal(h.route.edit, undefined);
    assert.equal(h.draft.paymentEditBackup, undefined);
  } finally { h.close(); }
});
