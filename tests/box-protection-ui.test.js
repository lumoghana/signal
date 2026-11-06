import test from 'node:test';
import assert from 'node:assert/strict';
import { createDemoState, applyAction } from '../dist/js/model.js';
import { getPartnerRequestView, hasBoxProtection, protectionSummary, ensureBoxProtectionState, makeBoxProtection } from '../dist/js/box-protection.js';
import { openBoxProtection, openProtectedBoxWithdrawal } from '../dist/js/box-protection-ui.js';

class Element {
  constructor(tag = '', attrs = '') { this.tag = tag; this.attrs = attrs; this.listeners = new Map(); this.isConnected = true; this.checked = false; this.disabled = / disabled/.test(attrs); this.value = attrs.match(/value="([^"]*)"/)?.[1] || ''; this.textContent = ''; }
  addEventListener(name, handler) { if (!this.listeners.has(name)) this.listeners.set(name, new Set()); this.listeners.get(name).add(handler); }
  setAttribute(name, value) { this[name] = value; }
  emit(name, extra = {}) { const event = { target: this, preventDefault() {}, ...extra }; for (const handler of this.listeners.get(name) || []) handler(event); }
  click() { if (!this.disabled) this.emit('click'); }
}
class Sheet extends Element {
  constructor(html) { super(); this.html = html; this.controls = []; this.error = new Element(); for (const match of html.matchAll(/<(button|input|form)\b([^>]*)>/g)) this.controls.push(new Element(match[1], match[2])); }
  querySelector(selector) {
    if (selector === '.bp-error') return this.error;
    const match = selector.match(/^\[([^=\]]+)(?:="([^"]*)")?\]$/);
    if (!match) return null;
    return this.controls.find(control => match[2] === undefined ? new RegExp(`(?:^|\\s)${match[1]}(?:\\s|$)`).test(control.attrs) : control.attrs.includes(`${match[1]}="${match[2]}"`)) || null;
  }
  detach() { this.isConnected = false; this.controls.forEach(control => { control.isConnected = false; }); }
}
function setup({ protectedBox = true, accepted = true, balance = 5000 } = {}) {
  const state = createDemoState();
  const created = applyAction(state, 'createBox', { name: 'Next semester laptop', target: 100000 });
  assert.equal(created.ok, true, created.message); const box = created.box;
  if(protectedBox)assert.equal(applyAction(state,'requestBoxProtection',{boxId:box.id,partner:{name:'Esi',phone:'0241234567'},pin:'1234'}).ok,true);
  if (balance) assert.equal(applyAction(state, 'contributeBox', { id: box.id, amount: balance }).ok, true);
  if (protectedBox && accepted) assert.equal(applyAction(state, 'respondBoxPartnerInvite', { boxId: box.id, invitationId: box.protection.invitationId, decision: 'accepted' }).ok, true);
  const ctx = { state, draft: {}, route: { section: 'boxes', page: 'detail', id: box.id }, current: null, html: [], calls: [], toasts: [], authPending: null, refreshes: 0,
    act(type, payload) { this.calls.push({ type, payload }); return applyAction(this.state, type, payload); },
    sheet(html, bind) { this.current?.detach(); this.current = new Sheet(html); this.html.push(html); bind?.(this.current); },
    closeSheet() { this.current?.detach(); }, saveDraft() {}, refresh() { this.refreshes++; }, toast(text) { this.toasts.push(text); },
    auth(options) { this.closeSheet(); this.authPending = options; },
  };
  return { state, box, ctx,
    click(action) { const element = ctx.current.querySelector(`[data-bp="${action}"]`); assert.ok(element, `button ${action}`); element.click(); },
    field(name, value) { const element = ctx.current.querySelector(`[name="${name}"]`); assert.ok(element, `field ${name}`); element.value = value; element.emit('input'); return element; },
    submit(attr) { const form = ctx.current.querySelector(`[${attr}]`); assert.ok(form, attr); form.emit('submit'); },
    pin() { assert.ok(ctx.authPending, 'PIN must be requested explicitly'); const callback = ctx.authPending.onSuccess; ctx.authPending = null; callback(); },
  };
}
function requestWithdrawal(h, amount = '10') { openProtectedBoxWithdrawal(h.ctx, h.box); h.field('protectedAmount', amount); h.submit('data-bp-amount-form'); return h.box.protectionRequests[0]; }
function partnerApprove(h, request) { h.click('partner-view'); h.click('issue'); const code = getPartnerRequestView(h.box, request).code; assert.match(h.ctx.current.html, new RegExp(code)); h.click('owner'); h.field('partnerCode', code); h.submit('data-bp-code-form'); assert.equal(request.status, 'approved'); }

test('a protected withdrawal needs the partner code and a separate PIN, and repeated callbacks cannot duplicate it', () => {
  const h = setup(), wallet = h.state.wallet, saved = h.box.balance;
  const request = requestWithdrawal(h); assert.equal(request.status, 'pending'); assert.equal(h.state.wallet, wallet);
  partnerApprove(h, request); assert.equal(h.ctx.authPending, null); assert.equal(h.box.balance, saved);
  assert.doesNotMatch(h.ctx.current.html, /bp-code-card/);
  h.click('pin'); const stale = h.ctx.authPending.onSuccess; h.pin(); stale();
  assert.equal(h.box.balance, saved - 1000); assert.equal(h.state.wallet, wallet + 1000); assert.equal(request.status, 'consumed');
  assert.equal(h.state.transactions.filter(tx => tx.protectionRequestId === request.id).length, 1); assert.equal(h.ctx.refreshes, 1);
});

test('wrong codes persist attempts without opening PIN and lockout offers a fresh request', () => {
  const h = setup(), request = requestWithdrawal(h), saved = h.box.balance;
  h.click('partner-view'); h.click('issue'); h.click('owner');
  for (let index = 0; index < 5; index++) { h.field('partnerCode', '000000'); h.submit('data-bp-code-form'); assert.equal(h.ctx.authPending, null); }
  assert.equal(request.status, 'locked'); assert.equal(request.attempts, 5); assert.equal(h.box.balance, saved); assert.match(h.ctx.current.html, /Start a fresh request/); assert.doesNotMatch(h.ctx.current.html, /data-bp="pin"/);
});

test('an expired approved request offers a new request without asking for a pointless PIN', () => {
  const h = setup(), request = requestWithdrawal(h); partnerApprove(h, request); request.expiresAt = '2020-01-01T00:00:00Z';
  openProtectedBoxWithdrawal(h.ctx, h.box); assert.match(h.ctx.current.html, /expired/); assert.doesNotMatch(h.ctx.current.html, /data-bp="pin"/); assert.equal(h.ctx.authPending, null);
});

test('partner-facing approval exposes only the goal and exact request, without account totals or other goals', () => {
  const h = setup(), request = requestWithdrawal(h);
  h.click('partner-view'); const html = h.ctx.current.html;
  assert.match(html, /Participant simulation · Partner view/); assert.match(html, /Next semester laptop/); assert.match(html, /GH₵10.00/);
  assert.doesNotMatch(html, /GH₵2,430.00|GH₵50.00|GH₵1,000.00|December escape|Allowance from Mum/);
  h.click('issue'); const code = getPartnerRequestView(h.box, request).code; assert.match(h.ctx.current.html, new RegExp(code)); h.click('owner'); assert.doesNotMatch(h.ctx.current.html, new RegExp(code));
});

test('a pending invitation clearly leaves normal controls available until the partner accepts', () => {
  const h = setup({ accepted: false }), wallet = h.state.wallet;
  openBoxProtection(h.ctx, h.box); assert.match(h.ctx.current.html, /Invitation waiting. Protection is not active/);
  assert.match(h.ctx.current.html, /normal Money Box withdrawal controls stay available/);
  assert.match(h.ctx.current.html, /data-bp="cancel-invite"/);
  assert.doesNotMatch(h.ctx.current.html, /data-bp="remove"|data-bp="change"|data-bp-code-form/);
  assert.equal(hasBoxProtection(h.box), false);
  h.click('invite-view'); h.click('accept');
  assert.equal(h.box.protection.status, 'active'); assert.equal(h.state.wallet, wallet); assert.equal(hasBoxProtection(h.box), true);
  assert.match(h.ctx.current.html, /Partner protection is on/);
  requestWithdrawal(h); assert.match(h.ctx.current.html, /Code from your partner/);
});

test('a pending invitation can be cancelled or declined without PIN or a release approval', () => {
  for (const decision of ['cancel', 'decline']) {
    const h = setup({ accepted: false }), wallet = h.state.wallet, saved = h.box.balance;
    openBoxProtection(h.ctx, h.box);
    if (decision === 'cancel') h.click('cancel-invite');
    else { h.click('invite-view'); h.click('decline'); }
    assert.equal(h.box.protection.status, decision === 'cancel' ? 'cancelled' : 'declined');
    assert.equal(hasBoxProtection(h.box), false); assert.equal(h.ctx.authPending, null);
    assert.equal(h.state.wallet, wallet); assert.equal(h.box.balance, saved);
    assert.match(h.ctx.current.html, /data-bp="invite-new"/);
    assert.doesNotMatch(h.ctx.current.html, /data-bp="remove"|data-bp-code-form/);
  }
});

test('verified support is explicit and does not move money until the owner confirms with PIN', () => {
  const h = setup(), wallet = h.state.wallet, saved = h.box.balance, request = requestWithdrawal(h);
  h.click('support'); assert.equal(request.status, 'support-pending'); h.click('support-view'); h.click('approve'); assert.equal(request.status, 'support-pending'); assert.match(h.ctx.current.error.textContent, /verification/);
  h.ctx.current.querySelector('[name="supportIdentityVerified"]').checked = true; h.click('approve');
  assert.equal(request.status, 'approved'); assert.equal(h.state.wallet, wallet); assert.equal(h.box.balance, saved); assert.equal(h.ctx.authPending, null); assert.match(h.ctx.current.html, /verified support/);
  h.click('pin'); h.pin(); assert.equal(h.state.wallet, wallet + 1000); assert.equal(request.approvedBy, 'verified-support');
});

test('changing a partner consumes its approval and invites the replacement while retaining savings', () => {
  const h = setup(), saved = h.box.balance;
  openBoxProtection(h.ctx, h.box); h.click('change'); h.field('partnerName', 'Adwoa'); h.field('partnerPhone', '+233 27 123 4567'); h.submit('data-bp-partner-form');
  const request = h.box.protectionRequests[0]; assert.equal(request.kind, 'change-partner'); assert.equal(h.box.protection.partner.name, 'Esi');
  partnerApprove(h, request); h.click('pin'); h.pin(); assert.equal(request.status, 'consumed'); assert.equal(h.box.protection.partner.name, 'Esi'); assert.equal(h.box.protection.status, 'active'); assert.equal(h.box.pendingProtection.partner.name, 'Adwoa'); assert.equal(h.box.balance, saved);
  openBoxProtection(h.ctx, h.box); assert.match(h.ctx.current.html, /current partner remains active/); h.click('invite-view'); assert.match(h.ctx.current.html, /Adwoa/); h.click('accept'); assert.equal(h.box.protection.partner.name, 'Adwoa'); assert.equal(h.box.protection.status, 'active');
});

test('removal requires specific approval and owner PIN; a support request alone leaves protection intact', () => {
  const h = setup(), wallet = h.state.wallet, saved = h.box.balance;
  openBoxProtection(h.ctx, h.box); h.click('remove'); h.click('request'); const request = h.box.protectionRequests[0];
  h.click('support'); assert.equal(hasBoxProtection(h.box), true); h.click('support-view'); h.ctx.current.querySelector('[name="supportIdentityVerified"]').checked = true; h.click('approve'); assert.equal(hasBoxProtection(h.box), true);
  h.click('pin'); h.pin(); assert.equal(request.status, 'consumed'); assert.equal(hasBoxProtection(h.box), false); assert.equal(h.box.balance, saved); assert.equal(h.state.wallet, wallet);
});

test('unprotected existing boxes can invite after validation and PIN without changing money', () => {
  const h = setup({ protectedBox: false }), wallet = h.state.wallet, saved = h.box.balance;
  openBoxProtection(h.ctx, h.box); h.field('partnerName', 'Esi'); h.field('partnerPhone', 'bad'); h.submit('data-bp-partner-form'); assert.equal(h.ctx.authPending, null); assert.match(h.ctx.current.error.textContent, /Ghana phone/);
  h.field('partnerPhone', '024 123 4567'); h.submit('data-bp-partner-form'); h.pin(); assert.equal(h.box.protection.partner.phone, '0241234567'); assert.equal(h.box.protection.status, 'invited'); assert.equal(hasBoxProtection(h.box), false); assert.equal(h.state.wallet, wallet); assert.equal(h.box.balance, saved);
});

test('stale final callbacks cannot move money after navigation, account replacement or a superseding request', () => {
  for (const change of ['route', 'state', 'request']) {
    const h = setup(), wallet = h.state.wallet, request = requestWithdrawal(h); partnerApprove(h, request); h.click('pin');
    if (change === 'route') h.ctx.route = { section: 'home', page: 'home' };
    else if (change === 'state') h.ctx.state = JSON.parse(JSON.stringify(h.state));
    else applyAction(h.state, 'requestBoxRelease', { boxId: h.box.id, kind: 'withdrawal', amount: 500 });
    h.pin(); assert.equal(h.state.wallet, wallet, change); assert.equal(h.box.balance, 5000, change);
  }
});

test('detached partner controls cannot issue or approve a replacement request', () => {
  const h = setup(), request = requestWithdrawal(h); h.click('partner-view'); const old = h.ctx.current.querySelector('[data-bp="issue"]');
  openBoxProtection(h.ctx, h.box); old.click(); assert.equal(request.status, 'pending'); assert.equal(request.code, undefined);
});


test('recovery-required protection uses verified support without exposing a pretend partner view', () => {
  const h = setup(), wallet = h.state.wallet; h.box.protection = { status: 'active', partner: { phone: 'damaged' } }; ensureBoxProtectionState(h.state);
  openBoxProtection(h.ctx, h.box); assert.match(h.ctx.current.html, /Partner details need review/); assert.doesNotMatch(h.ctx.current.html, /data-bp="invite-view"/);
  requestWithdrawal(h); assert.doesNotMatch(h.ctx.current.html, /data-bp="partner-view"/); h.click('support'); h.click('support-view');
  assert.match(h.ctx.current.html, /Verified support/); assert.doesNotMatch(h.ctx.current.html, /GH₵2,430.00|GH₵50.00|GH₵1,000.00/);
  h.ctx.current.querySelector('[name="supportIdentityVerified"]').checked = true; h.click('approve'); h.click('pin'); h.pin();
  assert.equal(h.state.wallet, wallet + 1000); assert.equal(hasBoxProtection(h.box), true);
});

test('an old partner invitation control cannot accept a replacement invitation', () => {
  const h = setup({ accepted: false }); openBoxProtection(h.ctx, h.box); h.click('invite-view');
  h.box.protection = makeBoxProtection({ name: 'Adwoa', phone: '0271234567' }, 2);
  h.click('accept'); assert.equal(h.box.protection.status, 'invited'); assert.equal(h.box.protection.partner.name, 'Adwoa'); assert.equal(hasBoxProtection(h.box), false);
  assert.match(h.ctx.current.error.textContent, /no longer current/);
});

test('Back from adding optional protection closes the sheet instead of reopening the same form', () => {
  const h = setup({ protectedBox: false }); openBoxProtection(h.ctx, h.box); h.click('manage'); assert.equal(h.ctx.current.isConnected, false); assert.equal(hasBoxProtection(h.box), false);
});


test('an approved partner request explains an independent goal lock before asking for a pointless PIN', () => {
  const h = setup(), request = requestWithdrawal(h), wallet = h.state.wallet; partnerApprove(h, request);
  assert.equal(applyAction(h.state, 'updateBox', { id: h.box.id, locked: true }).ok, true);
  openProtectedBoxWithdrawal(h.ctx, h.box);
  assert.match(h.ctx.current.html, /Your goal lock is still on/);
  assert.doesNotMatch(h.ctx.current.html, /data-bp="pin"/);
  assert.equal(h.ctx.authPending, null); assert.equal(request.status, 'approved');
  h.click('goal-lock'); assert.equal(h.state.wallet, wallet);
  assert.equal(applyAction(h.state, 'updateBox', { id: h.box.id, locked: false }).ok, true);
  openProtectedBoxWithdrawal(h.ctx, h.box);
  assert.match(h.ctx.current.html, /data-bp="pin"/);
  h.click('pin'); h.pin();
  assert.equal(h.state.wallet, wallet + request.amount); assert.equal(request.status, 'consumed');
  assert.equal(hasBoxProtection(h.box), true);
});
