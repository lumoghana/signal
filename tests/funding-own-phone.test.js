import test from 'node:test';
import assert from 'node:assert/strict';
import { createEmptyState, applyAction } from '../dist/js/model.js';
import { openFunding } from '../dist/js/payments.js';

const own = '0245550182', other = '0557770182';
const inputTag = (html, name) => html.match(new RegExp(`<input\\b(?=[^>]*\\bname="${name}")[^>]*>`))?.[0] || '';
function node(value = '') {
  return { value, listeners: {}, hidden: true, textContent: '', addEventListener(type, handler) { this.listeners[type] = handler; } };
}
function harness({ phone = own, restored = null } = {}) {
  const state = createEmptyState({ name: 'Ama', phone });
  state.onboardingDone = true;
  const h = { state, html: '', auth: [], actions: [], messages: [], routes: [], nodes: new Map() };
  const ctx = { state, route: { section: 'home', page: 'home' }, draft: {}, saveDraft() {}, setCapture() {}, closeSheet() {},
    auth(options) { h.auth.push(options); }, toast(message) { h.messages.push(message); }, finish(route) { h.routes.push(route); },
    go(route) { h.routes.push(route); }, act(type, payload) { h.actions.push({ type, payload }); return applyAction(state, type, payload); },
    sheet(html, bind) {
      h.html = html;
      h.nodes = new Map();
      for (const name of ['fundAmount', 'fundNumber']) {
        const tag = inputTag(html, name);
        if (tag) h.nodes.set(`[name="${name}"]`, node(tag.match(/\bvalue="([^"]*)"/)?.[1] || ''));
      }
      for (const action of ['fund-continue', 'fund-history', 'fund-copy', 'fund-share']) {
        if (html.includes(`data-action="${action}"`)) h.nodes.set(`[data-action="${action}"]`, node());
      }
      h.nodes.set('#fund-error', node());
      const sourceButtons = [...html.matchAll(/data-fund-source="([^"]+)"/g)].map(match => ({ ...node(), dataset: { fundSource: match[1] } }));
      h.sourceButtons = sourceButtons;
      bind({ querySelector: selector => h.nodes.get(selector) || null, querySelectorAll: selector => selector === '[data-fund-source]' ? sourceButtons : [] });
    },
  };
  h.ctx = ctx;
  h.amount = value => { const input = h.nodes.get('[name="fundAmount"]'); input.value = value; input.listeners.input?.(); };
  h.submit = () => h.nodes.get('[data-action="fund-continue"]').onclick();
  openFunding(ctx, restored);
  return h;
}

test('MoMo top-up displays only the registered phone and replaces a restored foreign number', () => {
  const restored = { source: 'MTN MoMo', number: other, amountText: '25', idempotencyKey: 'stale-phone', returnTo: { section: 'home', page: 'home' } };
  const h = harness({ phone: '+233 24 555 0182', restored });
  const phone = inputTag(h.html, 'fundNumber');
  assert.match(phone, /\breadonly\b/i);
  assert.match(phone, new RegExp(`value="${own}"`));
  assert.doesNotMatch(phone, new RegExp(other));
  assert.equal(h.ctx.draft.funding.number, own);
  assert.equal(h.nodes.get('[name="fundNumber"]').listeners.input, undefined);
  assert.doesNotMatch(inputTag(h.html, 'fundAmount'), /\breadonly\b/i);
  assert.equal(h.state.fundingAttempts.length, 0);
});

test('altering the displayed MoMo number cannot redirect the authorised top-up', () => {
  const h = harness(), before = h.state.wallet;
  h.nodes.get('[name="fundNumber"]').value = other;
  h.amount('25.50');
  h.ctx.draft.funding.number = other;
  h.submit();
  assert.equal(h.auth.length, 1);
  assert.equal(h.actions.length, 0, 'review still requires PIN authorisation');
  assert.equal(h.ctx.draft.funding.number, own);
  h.auth[0].onSuccess();
  assert.equal(h.actions.length, 1);
  assert.equal(h.actions[0].type, 'startFundingAttempt');
  assert.equal(h.actions[0].payload.number, own);
  assert.equal(h.actions[0].payload.amount, 2550);
  assert.equal(h.state.fundingAttempts[0].number, own);
  assert.equal(h.state.fundingAttempts[0].status, 'pending');
  assert.equal(h.state.wallet, before, 'requesting funding must not credit the wallet');
});

test('switching sources and returning from cancelled PIN keeps the phone bound to the account', () => {
  const h = harness();
  h.amount('40');
  h.nodes.get('[name="fundNumber"]').value = other;
  h.sourceButtons.find(button => button.dataset.fundSource === 'Bank transfer').listeners.click();
  assert.equal(h.nodes.has('[name="fundNumber"]'), false);
  h.sourceButtons.find(button => button.dataset.fundSource === 'MTN MoMo').listeners.click();
  assert.equal(h.nodes.get('[name="fundNumber"]').value, own);
  h.submit();
  h.ctx.draft.funding.number = other;
  h.auth[0].onCancel();
  assert.match(inputTag(h.html, 'fundNumber'), /\breadonly\b/i);
  assert.equal(h.nodes.get('[name="fundNumber"]').value, own);
  assert.equal(h.nodes.get('[name="fundAmount"]').value, '40');
  assert.equal(h.actions.length, 0);
});

test('missing or invalid registered phones cannot use a demo fallback or open MoMo authorisation', () => {
  for (const phone of ['', 'not-a-phone']) {
    const h = harness({ phone });
    assert.doesNotMatch(inputTag(h.html, 'fundNumber'), /value="0240000000"/);
    h.amount('10');
    h.nodes.get('[name="fundNumber"]').value = other;
    h.submit();
    assert.equal(h.auth.length, 0);
    assert.equal(h.actions.length, 0);
    assert.equal(h.state.fundingAttempts.length, 0);
    assert.equal(h.nodes.get('#fund-error').hidden, false);
  }
});

test('a missing phone does not block tracking a bank transfer', () => {
  const h = harness({ phone: '' }), before = h.state.wallet;
  h.sourceButtons.find(button => button.dataset.fundSource === 'Bank transfer').listeners.click();
  h.amount('60'); h.submit();
  assert.equal(h.auth.length, 1);
  h.auth[0].onSuccess();
  assert.equal(h.actions[0].payload.rail, 'bank');
  assert.equal(h.state.fundingAttempts[0].rail, 'bank');
  assert.equal(h.state.fundingAttempts[0].number, '');
  assert.equal(h.state.wallet, before);
});
