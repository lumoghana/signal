import test from 'node:test';
import assert from 'node:assert/strict';
import { renderAccountRecipient, bindAccountRecipient } from '../dist/js/payment-recipient.js';
import { resolveDemoRecipient, validateRecipientLookup } from '../dist/js/recipient-lookup.js';

class Element extends EventTarget {
  constructor(value = '') {
    super(); this.value = value; this.isConnected = true; this.disabled = false; this.hidden = true;
    this.textContent = ''; this.innerHTML = ''; this.attributes = new Map(); this.focused = false;
    this.classList = { toggle() {} };
  }
  setAttribute(name, value) { this.attributes.set(name, value); }
  removeAttribute(name) { this.attributes.delete(name); }
  focus() { this.focused = true; }
  click() { this.dispatchEvent(new Event('click')); }
}

function found(payment) {
  const checked = validateRecipientLookup(payment.rail, payment.recipientForms[payment.rail]);
  const result = resolveDemoRecipient(checked.request);
  assert.equal(result.ok, true);
  return { key: checked.key, request: checked.request, recipient: result.recipient, confirmed: false };
}

function harness({ rail = 'momo', number = '0245550182', bank = '', confirm = false, editing = false, origin } = {}) {
  const payment = { rail, recipient: null, recipientForms: { [rail]: { number, ...(rail === 'bank' ? { bank } : {}) } }, amount: 2550, note: 'Lunch', lookupRequired: true };
  if (origin) payment.flowOrigin = origin;
  if (confirm) payment.recipientLookup = found(payment);
  const route = { section: 'pay', page: confirm ? 'recipient-confirm' : 'recipient', ...(editing ? { edit: true } : {}) };
  const root = new Element(), nodes = new Map(), routes = [], tasks = [];
  const node = (selector, value = '') => { const el = new Element(value); nodes.set(selector, el); return el; };
  const form = node('#recipient-lookup-form');
  const input = node('[name="recipientNumber"]', number);
  const bankInput = rail === 'bank' ? node('[name="recipientBank"]', bank) : null;
  const primary = node('[data-recipient-find]');
  const error = node('#recipient-error'), status = node('[data-recipient-status]');
  node('.recipient-loading-dots'); const demo = node('[data-recipient-demo]');
  const accept = node('[data-recipient-confirm]'), edit = node('[data-recipient-edit]');
  root.querySelector = selector => nodes.get(selector) || null;
  let saves = 0, cancels = 0, disposals = 0, confirmations = 0, active;
  const controller = {
    run(request) {
      return new Promise(resolve => { active = { request, resolve }; tasks.push(active); });
    },
    cancel() { cancels += 1; active?.resolve(null); active = null; },
    dispose() { disposals += 1; this.cancel(); },
  };
  const state = { wallet: 90000, transactions: [] }, beforeState = JSON.stringify(state);
  const ctx = { draft: { payment }, route,
    $(selector) { return selector === '.account-recipient' ? root : null; },
    saveDraft() { saves += 1; }, setCapture() {},
    go(next, options) { routes.push({ route: next, options }); },
    confirmAccountRecipient() { confirmations += 1; },
    get state() { throw new Error('Recipient setup cannot read balances.'); },
    act() { throw new Error('Recipient setup cannot execute money actions.'); },
  };
  const cleanup = bindAccountRecipient(ctx, route, { createLookup: () => controller });
  return { ctx, payment, route, root, form, input, bankInput, primary, error, status, accept, edit, demo, tasks, routes, state, beforeState, cleanup,
    submit() { form.dispatchEvent(new Event('submit', { cancelable: true })); },
    changeNumber(value) { input.value = value; form.dispatchEvent(new Event('input')); },
    changeBank(value) { bankInput.value = value; form.dispatchEvent(new Event('change')); },
    respond(index = tasks.length - 1, result = resolveDemoRecipient(tasks[index].request)) { tasks[index].resolve(result); },
    get saves() { return saves; }, get cancels() { return cancels; }, get disposals() { return disposals; }, get confirmations() { return confirmations; },
  };
}

const flush = () => new Promise(resolve => setImmediate(resolve));

test('MoMo asks for only the number; bank asks for account number and an explicit bank', () => {
  for (const rail of ['momo', 'bank']) {
    const h = harness({ rail });
    try {
      const html = renderAccountRecipient(h.ctx, h.route);
      assert.match(html, /name="recipientNumber"/);
      assert.doesNotMatch(html, /name="recipientName"|name="recipientNetwork"/);
      assert.match(html, /Demo lookup/);
      assert.equal((html.match(/<input\b/g) || []).length, 1);
      if (rail === 'momo') assert.doesNotMatch(html, /<select\b|name="recipientBank"/);
      else { assert.match(html, /name="recipientBank"/); assert.match(html, /option value="">Choose their bank/); }
    } finally { h.cleanup(); }
  }
});

test('confirmation gives the returned name, number and network or bank together, with demo identity clear', () => {
  for (const example of [
    { rail: 'momo', number: '0555550124', displayedNumber: '055 555 0124', name: 'Akosua Owusu', institution: 'Telecel Cash' },
    { rail: 'bank', number: '0123456789', bank: 'Ecobank Ghana', name: 'Esi Boateng', institution: 'Ecobank Ghana' },
  ]) {
    const h = harness({ ...example, confirm: true });
    try {
      const html = renderAccountRecipient(h.ctx, h.route);
      for (const value of [example.name, example.displayedNumber || example.number, example.institution, 'Registered account name', 'Demo lookup · sample account details', 'Yes, that’s right', 'Edit details']) assert.ok(html.includes(value), value);
      assert.doesNotMatch(html, /<input\b|<select\b/);
      assert.equal(h.payment.recipient, null);
    } finally { h.cleanup(); }
  }
});

test('grouped MoMo display leaves the accepted lookup and entered destination unchanged', () => {
  for (const number of ['0245550182', '+233245550182', '233245550182']) {
    const h = harness({ number, confirm: true });
    try {
      const before = structuredClone(h.payment);
      const html = renderAccountRecipient(h.ctx, h.route);
      assert.match(html, /<dd>024 555 0182<\/dd>/);
      assert.deepEqual(h.payment, before);
      assert.equal(h.payment.recipientForms.momo.number, number);
      assert.equal(h.payment.recipientLookup.request.number, '0245550182');
      h.accept.click();
      assert.equal(h.confirmations, 1);
      assert.equal(h.payment.recipientLookup.recipient.number, '0245550182');
    } finally { h.cleanup(); }
  }
});

test('bank confirmation preserves the exact leading-zero account number rather than applying phone grouping', () => {
  const h = harness({ rail: 'bank', number: '0123456789', bank: 'Ecobank Ghana', confirm: true });
  try {
    const before = structuredClone(h.payment);
    const html = renderAccountRecipient(h.ctx, h.route);
    assert.match(html, /<dd>0123456789<\/dd>/);
    assert.doesNotMatch(html, /012 345 6789/);
    assert.deepEqual(h.payment, before);
    h.accept.click();
    assert.equal(h.confirmations, 1);
    assert.equal(h.payment.recipientLookup.request.number, '0123456789');
  } finally { h.cleanup(); }
});

test('lookup must finish before confirmation and never accepts the recipient or moves money by itself', async () => {
  const h = harness();
  try {
    h.submit(); h.submit();
    assert.equal(h.tasks.length, 1);
    assert.equal(h.primary.disabled, true);
    assert.match(h.status.textContent, /Finding your person/);
    assert.equal(h.routes.length, 0); assert.equal(h.payment.recipient, null);
    h.respond(); await flush();
    assert.equal(h.primary.disabled, false);
    assert.equal(h.payment.recipientLookup.recipient.name, 'Kofi Mensah');
    assert.equal(h.payment.recipientLookup.confirmed, false);
    assert.equal(h.payment.recipient, null); assert.equal(h.confirmations, 0);
    assert.equal(h.routes[0].route.page, 'recipient-confirm');
    assert.equal(h.routes[0].route.backTo.page, 'recipient');
    assert.equal(JSON.stringify(h.state), h.beforeState);
  } finally { h.cleanup(); }
});

test('changing a destination cancels its in-flight lookup and a later response cannot restore stale identity', async () => {
  const h = harness();
  try {
    h.submit();
    h.changeNumber('0205550166');
    assert.equal(h.primary.disabled, false); assert.equal(h.payment.recipientLookup, undefined);
    h.respond(0); await flush();
    assert.equal(h.routes.length, 0); assert.equal(h.payment.recipientLookup, undefined);
    h.submit(); h.respond(1); await flush();
    assert.equal(h.payment.recipientLookup.recipient.name, 'Efua Asante');
    assert.equal(h.payment.recipientLookup.recipient.network, 'Telecel Cash');
    assert.equal(h.routes.length, 1); assert.equal(h.cancels, 1);
  } finally { h.cleanup(); }
});

test('changing the chosen bank invalidates an old bank/account lookup, and bank is never defaulted silently', async () => {
  const h = harness({ rail: 'bank', number: '0123456789' });
  try {
    h.submit();
    assert.equal(h.tasks.length, 0); assert.equal(h.error.hidden, false);
    assert.match(h.error.textContent, /Choose the bank/); assert.equal(h.bankInput.focused, true);
    h.changeBank('Ecobank Ghana'); h.submit();
    h.changeBank('GCB Bank'); h.respond(0); await flush();
    assert.equal(h.routes.length, 0); assert.equal(h.payment.recipientLookup, undefined);
  } finally { h.cleanup(); }
});

test('a failed lookup leaves details editable and allows a successful retry without financial action', async () => {
  const h = harness({ number: '0240000000' });
  try {
    h.submit(); h.respond(); await flush();
    assert.equal(h.error.hidden, false); assert.match(h.error.textContent, /taking a break/);
    assert.equal(h.primary.disabled, false); assert.equal(h.payment.recipientLookup, undefined);
    h.demo.click();
    assert.equal(h.input.value, '0245550182'); assert.equal(h.error.hidden, true);
    h.submit(); h.respond(); await flush();
    assert.equal(h.routes[0].route.page, 'recipient-confirm');
    assert.equal(h.payment.recipient, null); assert.equal(JSON.stringify(h.state), h.beforeState);
  } finally { h.cleanup(); }
});

test('leaving a lookup disposes work and detached controls or late responses cannot navigate', async () => {
  const h = harness();
  h.submit(); h.root.isConnected = false; h.cleanup(); h.respond(); await flush();
  h.submit(); h.demo.click();
  assert.equal(h.disposals, 1); assert.equal(h.routes.length, 0); assert.equal(h.tasks.length, 1);
  assert.equal(h.payment.recipientLookup, undefined);
});

test('only an explicit current confirmation can continue, duplicate or detached clicks are ignored', () => {
  const h = harness({ confirm: true });
  try {
    h.accept.click(); h.accept.click();
    assert.equal(h.confirmations, 1); assert.equal(h.accept.disabled, true);
    assert.equal(h.payment.recipient, null); assert.equal(JSON.stringify(h.state), h.beforeState);
  } finally { h.cleanup(); }
  const stale = harness({ confirm: true });
  stale.root.isConnected = false; stale.accept.click(); stale.edit.click(); stale.cleanup();
  assert.equal(stale.confirmations, 0); assert.equal(stale.routes.length, 0);
});

test('stale confirmation returns to details and an edit keeps its review origin', () => {
  const stale = harness({ confirm: true });
  try {
    stale.payment.recipientForms.momo.number = '0205550166'; stale.accept.click();
    assert.equal(stale.confirmations, 0); assert.equal(stale.routes[0].route.page, 'recipient');
    assert.equal(stale.routes[0].options.replace, true);
  } finally { stale.cleanup(); }
  const edit = harness({ rail: 'bank', number: '0123456789', bank: 'Ecobank Ghana', confirm: true, editing: true });
  try {
    edit.edit.click();
    assert.deepEqual(edit.routes[0], { route: { section: 'pay', page: 'recipient', edit: true, backTo: { section: 'pay', page: 'review' } }, options: { replace: true } });
  } finally { edit.cleanup(); }
});
