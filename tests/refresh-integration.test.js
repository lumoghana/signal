import test from 'node:test';
import assert from 'node:assert/strict';
import { bindPayments, renderPayments } from '../dist/js/payments.js';
import { createEmptyState } from '../dist/js/model.js';
import { parentRoute } from '../dist/js/navigation.js';
import { decodeQrPixels, parseQrPayload } from '../dist/js/qr-decoder.js';

class Element extends EventTarget {
  constructor(dataset = {}) {
    super(); this.dataset = dataset; this.isConnected = true; this.hidden = false;
    this.value = ''; this.classList = { toggle() {}, remove() {} };
  }
  click() { this.dispatchEvent(new Event('click')); }
}

function harness(payment, mode = 'scan') {
  const state = createEmptyState({ name: 'Ama' });
  state.onboardingDone = true; state.wallet = 100000;
  const draft = payment ? { payment } : {};
  const origin = { section: 'pay', page: 'scan', mode, returnTo: { section: 'home', page: 'home' } };
  let route = origin, cleanup, refreshes = 0;
  const nodes = new Map(), sheets = [], contact = new Element({ contact: 'kofi' });
  const node = key => { if (!nodes.has(key)) nodes.set(key, new Element()); return nodes.get(key); };
  const qrRoot = new Element();
  qrRoot.querySelector = selector => node(selector);
  qrRoot.querySelectorAll = () => [new Element({ qrMode: 'scan' }), new Element({ qrMode: 'code' })];
  const ctx = {
    state, draft, get route() { return route; },
    $(selector) { return selector === '[data-qr-screen]' ? qrRoot : node(selector); },
    $$(selector) {
      if (selector === '[data-contact]') return [contact];
      return /^\[data-action="[^"]+"\]$/.test(selector) ? [node(selector)] : [];
    },
    setCapture() {}, saveDraft() {}, closeSheet() {}, toast() {},
    refresh() { refreshes += 1; }, go(next) { route = next; },
    sheet(html, bind, options = {}) {
      const buttons = new Map(), sheet = { querySelector(selector) {
        if (!buttons.has(selector)) buttons.set(selector, new Element());
        return buttons.get(selector);
      } };
      sheets.push({ html, options, nodes: buttons }); bind(sheet);
    },
    act() { throw new Error('Navigation must not execute a financial action.'); },
  };
  const bind = () => { cleanup?.(); cleanup = bindPayments(ctx, route); };
  bind();
  return { state, draft, origin, sheets, contact, bind, ctx,
    get route() { return route; }, get refreshes() { return refreshes; },
    findPerson() { node('[data-qr-person]').click(); },
    editRequest() { node('[data-qr-edit]').click(); },
    send() { node('[data-action="pay-conversation-send"]').click(); },
    cleanup() { cleanup?.(); },
  };
}

test('dismissing Find a person pending-payment choice restores the QR screen without changing money or its saved draft', () => {
  const payment = { recipient: { name: 'Saved recipient' }, rail: 'lumo', amount: 2550, note: 'Still deciding', idempotencyKey: 'saved-payment' };
  const h = harness(payment), beforeState = JSON.stringify(h.state), beforeDraft = JSON.stringify(h.draft);
  try {
    h.findPerson();
    assert.equal(h.sheets.length, 1);
    assert.equal(typeof h.sheets[0].options.onClose, 'function');
    h.sheets[0].options.onClose();
    assert.equal(h.refreshes, 1);
    assert.deepEqual(h.route, h.origin);
    assert.equal(JSON.stringify(h.state), beforeState);
    assert.equal(JSON.stringify(h.draft), beforeDraft);
  } finally { h.cleanup(); }
});

function decodeRenderedCode(html) {
  const svg = html.match(/<div class="qr-code-art"[^>]*>(<svg[\s\S]*?<\/svg>)/)?.[1];
  assert.ok(svg, 'My code renders a request QR');
  const size = Number(svg.match(/viewBox="0 0 (\d+) \d+"/)?.[1]);
  const path = svg.match(/<path d="([^"]+)" stroke="transparent" fill="black"/)?.[1];
  assert.ok(size && path, 'The request QR contains actual modules');
  const pixels = new Uint8ClampedArray(size * size * 4).fill(255);
  for (const match of path.matchAll(/M(\d+),(\d+)l(\d+),0/g)) {
    const [left, top, cell] = match.slice(1).map(Number);
    for (let y = top; y < top + cell; y += 1) for (let x = left; x < left + cell; x += 1) {
      const offset = (y * size + x) * 4;
      pixels[offset] = 0; pixels[offset + 1] = 0; pixels[offset + 2] = 0;
    }
  }
  return decodeQrPixels(pixels, size, size);
}

test('My code rejects over-limit and over-precision amounts, while its maximum request scans back correctly', () => {
  const h = harness(undefined, 'code'), beforeState = JSON.stringify(h.state);
  const windowDescriptor = Object.getOwnPropertyDescriptor(globalThis, 'window');
  try {
    h.editRequest();
    assert.equal(h.sheets.length, 1);
    const fields = h.sheets[0].nodes;
    const amount = fields.get('[name="collectAmount"]') || new Element();
    const note = fields.get('[name="collectNote"]') || new Element();
    fields.set('[name="collectAmount"]', amount); fields.set('[name="collectNote"]', note);
    const beforeDraft = JSON.stringify(h.draft);
    for (const value of ['1000000.01', '1.001']) {
      amount.value = value; note.value = 'Not yet saved';
      fields.get('[data-action="collect-save"]').click();
      assert.equal(JSON.stringify(h.draft), beforeDraft, value);
      assert.equal(h.refreshes, 0);
      assert.equal(fields.get('#collect-error').hidden, false);
    }
    amount.value = '1000000.00'; note.value = 'Maximum request';
    fields.get('[data-action="collect-save"]').click();
    assert.equal(h.draft.collect.amount, 100000000);
    assert.equal(h.refreshes, 1);
    const origin = 'https://lumo.example';
    Object.defineProperty(globalThis, 'window', { configurable: true, value: { location: { origin, pathname: '/' } } });
    const decoded = decodeRenderedCode(renderPayments(h.ctx, h.route));
    assert.ok(decoded, 'The actual rendered request can be decoded');
    assert.deepEqual(parseQrPayload(decoded, { origin }), {
      ok: true, payment: { type: 'person', name: 'Ama', amount: 100000000, note: 'Maximum request' },
    });
    assert.equal(JSON.stringify(h.state), beforeState);
  } finally {
    if (windowDescriptor) Object.defineProperty(globalThis, 'window', windowDescriptor);
    else delete globalThis.window;
    h.cleanup();
  }
});

test('QR Find a person keeps the scanner as the parent through contact, conversation and amount navigation', () => {
  const h = harness(), beforeState = JSON.stringify(h.state);
  try {
    h.findPerson();
    assert.equal(h.route.page, 'recipient');
    assert.deepEqual(parentRoute(h.route, h.state, h.draft), h.origin);
    h.bind(); h.contact.click();
    assert.equal(h.route.page, 'conversation');
    assert.deepEqual(parentRoute(h.route, h.state, h.draft), h.origin);
    h.bind(); h.send();
    assert.equal(h.route.page, 'amount');
    const conversation = parentRoute(h.route, h.state, h.draft);
    assert.equal(conversation.page, 'conversation');
    assert.deepEqual(parentRoute(conversation, h.state, h.draft), h.origin);
    assert.deepEqual(h.draft.payment.flowOrigin, h.origin);
    assert.equal(h.draft.payment.recipient.name, 'Kofi Mensah');
    assert.equal(h.sheets.length, 0);
    assert.equal(JSON.stringify(h.state), beforeState);
  } finally { h.cleanup(); }
});
