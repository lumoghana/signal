import test from 'node:test';
import assert from 'node:assert/strict';
import { applyAction, createDemoState } from '../dist/js/model.js';
import { renderGroupChat, bindGroupChat } from '../dist/js/group-chat.js';
import { groupChatTimeline, unreadGroupCount } from '../dist/js/group-chat-model.js';

class Surface {
  constructor() { this.listeners = new Map(); this.elements = new Map(); this.dataset = {}; this.isConnected = true; this.disabled = false; this.value = ''; this.checked = false; this.hidden = false; this.scrollHeight = 1000; this.clientHeight = 400; this.scrollTop = 0; this.style = { setProperty() {}, removeProperty() {} }; }
  addEventListener(name, fn) { if (!this.listeners.has(name)) this.listeners.set(name, new Set()); this.listeners.get(name).add(fn); }
  removeEventListener(name, fn) { this.listeners.get(name)?.delete(fn); }
  querySelector(selector) { return this.elements.get(selector) || null; }
  closest(selector) { return selector === 'button' ? this : null; }
  scrollTo({ top }) { this.scrollTop = Math.max(0, Math.min(top, this.scrollHeight - this.clientHeight)); }
  emit(name, values = {}) { const event = { target: this, prevented: false, preventDefault() { this.prevented = true; }, ...values }; [...(this.listeners.get(name) || [])].forEach(fn => fn(event)); return event; }
}
const route = () => ({ section: 'life', page: 'group-chat', id: 'group-project-printing' });
function sample() { const state = createDemoState(); applyAction(state, 'ensureProjectPrintingDemo', {}); return state; }
const financial = state => JSON.stringify({ wallet: state.wallet, budget: state.budget, boxes: state.boxes, transactions: state.transactions, groups: state.groups.map(group => ({ balance: group.balance, members: group.members.map(({ id, amount, role, status }) => ({ id, amount, role, status })), contributions: group.contributions, payouts: group.payouts })) });

function runtime(t, state = sample()) {
  const timers = new Map(), frames = new Map(); let serial = 0;
  t.mock.method(globalThis, 'setTimeout', fn => { const id = ++serial; timers.set(id, fn); return id; });
  t.mock.method(globalThis, 'clearTimeout', id => timers.delete(id));
  const oldRaf = globalThis.requestAnimationFrame, oldCancel = globalThis.cancelAnimationFrame;
  globalThis.requestAnimationFrame = fn => { const id = ++serial; frames.set(id, fn); return id; }; globalThis.cancelAnimationFrame = id => frames.delete(id);
  t.after(() => { if (oldRaf) globalThis.requestAnimationFrame = oldRaf; else delete globalThis.requestAnimationFrame; if (oldCancel) globalThis.cancelAnimationFrame = oldCancel; else delete globalThis.cancelAnimationFrame; });
  const root = new Surface(), input = new Surface(), send = new Surface(), form = new Surface(), thread = new Surface(), notice = new Surface(); input.scrollHeight = 44;
  root.elements = new Map([['#group-chat-input', input], ['.gc-send', send], ['#group-chat-form', form], ['#group-chat-thread', thread], ['.gc-new-messages', notice]]);
  const ctx = { state, route: route(), draft: {}, saved: 0, refreshed: 0, navigated: [], actions: [], toasts: [], currentSheet: null,
    $: selector => selector === '[data-group-chat-view]' ? root : null,
    saveDraft() { this.saved++; }, refresh() { this.refreshed++; }, go(...args) { this.navigated.push(args); }, toast(message) { this.toasts.push(message); },
    act(type, payload) { this.actions.push({ type, payload }); return applyAction(this.state, type, payload); },
    sheet(html, bind) { if (this.currentSheet) this.currentSheet.root.isConnected = false; const sheet = new Surface(), nodes = new Map(); const selectors = [...html.matchAll(/\b(data-gc-[a-z-]+)(?:="([^"]*)")?/g)].map(match => `[${match[1]}${match[2] !== undefined ? `="${match[2]}"` : ''}]`); for (const match of html.matchAll(/\bname="([^"]+)"/g)) selectors.push(`[name="${match[1]}"]`); for (const selector of selectors) { const node = new Surface(); nodes.set(selector, node); sheet.elements.set(selector, node); } this.currentSheet = { root: sheet, nodes, html }; bind(sheet); },
    closeSheet() { if (this.currentSheet) this.currentSheet.root.isConnected = false; },
  };
  const click = dataset => { const button = new Surface(); button.dataset = dataset; root.emit('click', { target: button }); return button; };
  const type = text => { input.value = text; input.emit('input'); };
  const flushFrames = () => { const queued = [...frames.values()]; frames.clear(); queued.forEach(fn => fn()); };
  const deliver = () => { const queued = [...timers.values()]; timers.clear(); queued.forEach(fn => fn()); };
  const group = state.groups.find(group => group.id === route().id);
  const draft = () => ctx.draft.groupChats[group.id][group.participantId || 'me'];
  return { ctx, root, input, send, form, thread, notice, timers, frames, click, type, flushFrames, deliver, group, draft };
}

test('group chat uses the shared goal and human names without private account data', () => {
  const state = sample(), html = renderGroupChat({ state, draft: {} }, route());
  assert.match(html, /Project Printing group chat/);
  assert.match(html, /data-gc-action="overview" aria-label="Back to group overview"/);
  assert.match(html, /data-gc-action="home" aria-label="Home"/);
  assert.match(html, /Local participant simulation/);
  assert.match(html, /GH₵120.*collected of GH₵180/);
  assert.match(html, /GH₵60 remaining/);
  assert.match(html, /Esi|Kofi|Senam/);
  assert.match(html, /No live messages between devices/);
  assert.doesNotMatch(html, /GH₵2,480|My next laptop|IOU|Pause|lux-chat-2d/);
  assert.match(html, /class="gc-system/);
  assert.match(html, /datetime=/);
});

test('invited and removed participants cannot render any conversation or money history', () => {
  const state = sample(), group = state.groups.find(group => group.id === route().id);
  group.participantId = 'senam'; group.members.find(member => member.id === 'senam').status = 'invited';
  const invited = renderGroupChat({ state, draft: {} }, route());
  assert.match(invited, /Accept your invitation/);
  assert.doesNotMatch(invited, /Printing quote|GH₵120|group-chat-input|Lumo update/);
  group.members.find(member => member.id === 'senam').status = 'removed';
  const removed = renderGroupChat({ state, draft: {} }, route());
  assert.match(removed, /no longer has access/);
  assert.doesNotMatch(removed, /Printing quote|GH₵120|group-chat-input|Lumo update/);
});

test('sending is visible, the next draft stays editable, and repeated submit cannot duplicate it', t => {
  const env = runtime(t), dispose = bindGroupChat(env.ctx, route()); t.after(dispose);
  const before = financial(env.ctx.state), initial = env.group.chat.messages.length;
  env.type('I’ve paid. Please check.'); env.form.emit('submit'); env.form.emit('submit');
  assert.equal(env.group.chat.messages.length, initial + 1);
  assert.equal(env.group.chat.messages.at(-1).status, 'sending');
  env.type('The final PDF is ready too.');
  assert.equal(env.draft().input, 'The final PDF is ready too.');
  const html = renderGroupChat(env.ctx, route());
  assert.match(html, /Sending…/); assert.doesNotMatch(html.match(/<textarea[^>]+>/)[0], /disabled|readonly/);
  env.deliver();
  assert.equal(env.group.chat.messages.at(-1).status, 'sent');
  assert.equal(env.draft().input, 'The final PDF is ready too.');
  assert.equal(financial(env.ctx.state), before);
});

test('a failed send retries the same message once and leaves money unchanged', t => {
  const env = runtime(t), dispose = bindGroupChat(env.ctx, route()); t.after(dispose);
  const before = financial(env.ctx.state); env.draft().failNext = true;
  env.type('Can we use the updated cover page?'); env.form.emit('submit'); env.deliver();
  const message = env.group.chat.messages.at(-1), id = message.id, count = env.group.chat.messages.length;
  assert.equal(message.status, 'failed'); assert.match(renderGroupChat(env.ctx, route()), /Try again/);
  env.click({ gcRetry: id }); env.click({ gcRetry: id }); env.deliver();
  assert.equal(env.group.chat.messages.length, count);
  assert.equal(env.group.chat.messages.at(-1).id, id);
  assert.equal(env.group.chat.messages.at(-1).status, 'sent');
  assert.equal(financial(env.ctx.state), before);
});

test('pending delivery finishes after leaving without reopening chat or moving money', t => {
  const env = runtime(t), dispose = bindGroupChat(env.ctx, route());
  env.type('The printer closes at 5.'); env.form.emit('submit');
  const refreshed = env.ctx.refreshed, before = financial(env.ctx.state);
  env.ctx.route = { section: 'home', page: 'home' }; dispose(); env.root.isConnected = false; env.deliver();
  assert.equal(env.group.chat.messages.at(-1).status, 'sent');
  assert.equal(env.ctx.refreshed, refreshed); assert.deepEqual(env.ctx.navigated, []);
  assert.equal(financial(env.ctx.state), before);
});

test('an old delivery timer cannot change a replacement account state with matching message IDs', t => {
  const env = runtime(t), dispose = bindGroupChat(env.ctx, route()); t.after(dispose);
  env.type('Still pending before reset'); env.form.emit('submit');
  const id = env.group.chat.messages.at(-1).id;
  env.ctx.state = structuredClone(env.ctx.state); env.deliver();
  assert.equal(env.ctx.state.groups.find(group => group.id === env.group.id).chat.messages.find(message => message.id === id).status, 'sending');
});

test('compact viewport resize recalculates the textarea limit for keyboard space', t => {
  const env = runtime(t), viewport = new Surface(); viewport.height = 350; viewport.offsetTop = 0;
  env.root.parentElement = { clientHeight: 800 }; env.root.getBoundingClientRect = () => ({ top: 0 }); env.input.scrollHeight = 200;
  const oldViewport = globalThis.visualViewport, oldComputed = globalThis.getComputedStyle;
  globalThis.visualViewport = viewport;
  globalThis.getComputedStyle = () => ({ maxHeight: env.root.dataset.gcTight === 'true' ? '66px' : env.root.dataset.gcCompact === 'true' ? '84px' : '116px' });
  t.after(() => { if (oldViewport) globalThis.visualViewport = oldViewport; else delete globalThis.visualViewport; if (oldComputed) globalThis.getComputedStyle = oldComputed; else delete globalThis.getComputedStyle; });
  const dispose = bindGroupChat(env.ctx, route()); t.after(dispose);
  assert.equal(env.root.dataset.gcCompact, 'true'); assert.equal(env.root.dataset.gcTight, 'true');
  assert.equal(env.input.style.height, '66px'); assert.equal(env.input.style.overflowY, 'auto');
  viewport.height = 480; viewport.emit('resize'); assert.equal(env.input.style.height, '84px');
  viewport.height = 700; viewport.emit('resize'); assert.equal(env.root.dataset.gcCompact, 'false'); assert.equal(env.input.style.height, '116px');
});

test('a connection banner shrinking the parent keeps the composer inside the view without a viewport resize', t => {
  const env = runtime(t), viewport = new Surface(), parent = { clientHeight: 844 };
  viewport.height = 844; viewport.offsetTop = 0;
  env.root.parentElement = parent;
  let top = 0, resize, observed, disconnected = false;
  const properties = new Map();
  env.root.getBoundingClientRect = () => ({ top });
  env.root.style.setProperty = (name, value) => properties.set(name, value);
  const oldViewport = globalThis.visualViewport, oldObserver = globalThis.ResizeObserver;
  globalThis.visualViewport = viewport;
  globalThis.ResizeObserver = class {
    constructor(callback) { resize = callback; }
    observe(element) { observed = element; }
    disconnect() { disconnected = true; }
  };
  t.after(() => {
    if (oldViewport) globalThis.visualViewport = oldViewport; else delete globalThis.visualViewport;
    if (oldObserver) globalThis.ResizeObserver = oldObserver; else delete globalThis.ResizeObserver;
  });
  const dispose = bindGroupChat(env.ctx, route());
  assert.equal(observed, parent);
  assert.equal(properties.get('--group-chat-height'), '844px');
  env.type('Keep my draft while offline.');
  parent.clientHeight = 790; top = 54; resize();
  assert.equal(properties.get('--group-chat-height'), '790px');
  assert.equal(env.draft().input, 'Keep my draft while offline.');
  parent.clientHeight = 450; top = 54; resize();
  assert.equal(properties.get('--group-chat-height'), '450px');
  assert.equal(env.root.dataset.gcCompact, 'true');
  dispose(); assert.equal(disconnected, true);
  const oldHeight = properties.get('--group-chat-height');
  parent.clientHeight = 800; resize();
  assert.equal(properties.get('--group-chat-height'), oldHeight, 'a detached screen must not respond to old layout callbacks');
});

test('changing the simulation actor cannot deliver another person’s pending message', t => {
  const env = runtime(t), dispose = bindGroupChat(env.ctx, route());
  env.type('Ama’s pending message'); env.form.emit('submit'); const id = env.group.chat.messages.at(-1).id;
  applyAction(env.ctx.state, 'setGroupParticipant', { groupId: env.group.id, memberId: 'esi' }); env.deliver();
  assert.equal(env.group.chat.messages.find(message => message.id === id).status, 'sending');
  dispose(); applyAction(env.ctx.state, 'setGroupParticipant', { groupId: env.group.id, memberId: 'me' });
  const disposeAgain = bindGroupChat(env.ctx, route()); t.after(disposeAgain); env.deliver();
  assert.equal(env.group.chat.messages.find(message => message.id === id).status, 'sent');
});

test('composer text, reply, scroll and delivery outcomes are isolated by group participant', t => {
  const env = runtime(t); let dispose = bindGroupChat(env.ctx, route());
  env.type('Ama’s draft'); env.draft().reply = { id: 'project-printing-message-1', senderName: 'Esi', text: 'Printing quote' }; env.draft().scrollTop = 55;
  dispose(); applyAction(env.ctx.state, 'setGroupParticipant', { groupId: env.group.id, memberId: 'esi' }); env.input.value = '';
  dispose = bindGroupChat(env.ctx, route()); env.type('Esi’s separate draft'); assert.equal(env.draft().reply, undefined);
  dispose(); applyAction(env.ctx.state, 'setGroupParticipant', { groupId: env.group.id, memberId: 'me' });
  const html = renderGroupChat(env.ctx, route());
  assert.match(html, /Ama’s draft/); assert.doesNotMatch(html, /Esi’s separate draft/); assert.match(html, /Replying to Esi/);
  assert.equal(env.draft().scrollTop, 55);
});

test('reading older messages preserves position and unread until jumping to latest', t => {
  const env = runtime(t), badge = new Surface(); let removed = false; badge.remove = () => { removed = true; }; env.root.elements.set('[data-group-tab="chat"] .group-unread', badge);
  const dispose = bindGroupChat(env.ctx, route()); t.after(dispose); env.flushFrames();
  assert.equal(unreadGroupCount(env.ctx.state, env.group), 0);
  assert.equal(removed, true); assert.equal(env.ctx.refreshed, 0);
  env.thread.scrollTop = 70; env.thread.emit('scroll');
  assert.equal(env.draft().followTail, false);
  renderGroupChat(env.ctx, route());
  const message = { id: 'new-other', senderId: 'esi', senderName: 'Esi', text: 'The printer is ready.', status: 'sent', at: new Date().toISOString(), clientId: 'new-other' }; env.group.chat.messages.push(message);
  assert.match(renderGroupChat(env.ctx, route()), /data-gc-action="latest">/);
  dispose(); const rebind = bindGroupChat(env.ctx, route()); t.after(rebind); env.flushFrames();
  assert.equal(env.thread.scrollTop, 70);
  assert.equal(unreadGroupCount(env.ctx.state, env.group), 1);
  env.click({ gcAction: 'latest' }); env.flushFrames();
  assert.equal(env.thread.scrollTop, 600);
  assert.equal(unreadGroupCount(env.ctx.state, env.group), 0);
});

test('message completion beneath an options sheet keeps its controls usable after a view refresh', t => {
  const env = runtime(t), dispose = bindGroupChat(env.ctx, route());
  env.type('The quote is in the group details.'); env.form.emit('submit');
  env.click({ gcAction: 'options' }); const sheet = env.ctx.currentSheet;
  env.deliver(); dispose();
  sheet.nodes.get('[data-gc-mute]').checked = true; sheet.nodes.get('[data-gc-mute]').emit('change');
  assert.equal(env.group.chat.preferences.me.muted, true);
  sheet.root.isConnected = false; sheet.nodes.get('[data-gc-mute]').checked = false; sheet.nodes.get('[data-gc-mute]').emit('change');
  assert.equal(env.group.chat.preferences.me.muted, true);
});

test('Enter sends while multiline and IME keep editing, then cleanup blocks detached handlers', t => {
  const env = runtime(t), dispose = bindGroupChat(env.ctx, route()); env.type('Hello group');
  assert.equal(env.input.emit('keydown', { key: 'Enter', shiftKey: true }).prevented, false);
  env.input.emit('compositionstart'); assert.equal(env.input.emit('keydown', { key: 'Enter' }).prevented, false); env.input.emit('compositionend');
  assert.equal(env.input.emit('keydown', { key: 'Enter', isComposing: true }).prevented, false);
  assert.equal(env.input.emit('keydown', { key: 'Enter' }).prevented, true);
  const length = env.group.chat.messages.length, handler = [...env.root.listeners.get('click')][0]; dispose();
  env.type('Detached'); env.form.emit('submit'); handler({ target: { closest: () => ({ dataset: { gcAction: 'home' } }) } }); handler({ target: null });
  assert.equal(env.group.chat.messages.length, length); assert.deepEqual(env.ctx.navigated, []);
});

test('message actions keep reply context and reports local without touching the financial ledger', t => {
  const env = runtime(t), dispose = bindGroupChat(env.ctx, route()); t.after(dispose);
  const before = financial(env.ctx.state), original = env.group.chat.messages.find(message => message.senderId === 'esi');
  env.click({ gcMessage: original.id }); env.ctx.currentSheet.nodes.get('[data-gc-sheet-reply]').emit('click');
  assert.equal(env.draft().reply.id, original.id); env.type('Yes, that works.'); env.form.emit('submit'); env.deliver();
  assert.equal(env.group.chat.messages.at(-1).reply.text, original.text);
  env.click({ gcMessage: original.id }); env.ctx.currentSheet.nodes.get('[data-gc-sheet-report]').emit('click');
  env.ctx.currentSheet.nodes.get('[name="reportReason"]').value = 'Misleading payment claim'; env.ctx.currentSheet.nodes.get('[data-gc-report-form]').emit('submit');
  assert.equal(env.group.chat.reports.length, 1); assert.equal(env.group.chat.reports[0].status, 'stored-locally');
  assert.equal(financial(env.ctx.state), before);
});

test('conversation mute is separate from money notifications and group Lux stays private', t => {
  const env = runtime(t), dispose = bindGroupChat(env.ctx, route()); t.after(dispose);
  env.click({ gcAction: 'options' }); const sheet = env.ctx.currentSheet;
  sheet.nodes.get('[data-gc-mute]').checked = true; sheet.nodes.get('[data-gc-mute]').emit('change');
  sheet.nodes.get('[data-gc-financial]').checked = false; sheet.nodes.get('[data-gc-financial]').emit('change');
  assert.deepEqual(env.group.chat.preferences.me, { muted: true, financialNotifications: false });
  const count = env.group.chat.messages.length; sheet.nodes.get('[data-gc-lux]').emit('click');
  assert.match(env.ctx.currentSheet.html, /Private · Only you/); assert.match(env.ctx.currentSheet.html, /aren’t posted in the chat/);
  env.ctx.currentSheet.nodes.get('[data-gc-lux-question="0"]').emit('click');
  assert.match(env.ctx.currentSheet.html, /GH₵60.00 still needed/);
  assert.doesNotMatch(env.ctx.currentSheet.html, /GH₵2,480|My next laptop/);
  assert.equal(env.group.chat.messages.length, count);
});

test('all member content is escaped and deletion cannot create a system confirmation', () => {
  const state = sample(), group = state.groups.find(group => group.id === route().id);
  group.name = '<img src=x onerror=bad()>'; group.chat.messages.push({ id: 'x', clientId: 'x', senderId: 'esi', senderName: '<script>bad()</script>', text: '<img src=x onerror=bad()> approved', at: new Date().toISOString(), status: 'sent', reply: { id: 'x2', senderName: '<b>sender</b>', text: '</blockquote><iframe>bad</iframe>' } });
  const html = renderGroupChat({ state, draft: {} }, route());
  assert.doesNotMatch(html, /<script>|<iframe>|<b>sender<|<img src=x/);
  assert.match(html, /&lt;img src=x onerror=bad\(\)&gt; approved/);
  assert.equal(group.balance, 12000); assert.equal(group.payouts.length, 0);
  assert.equal(groupChatTimeline(state, group).filter(message => message.kind === 'system').length, 5);
});

test('a covered target offers Request payout only to the current designated approver with available funds', () => {
  const state = sample(), group = state.groups.find(group => group.id === route().id), ctx = { state, draft: {} };
  assert.equal(applyAction(state, 'settleGroupContribution', { groupId: group.id, contributionId: 'printing-senam', outcome: 'success' }).ok, true);
  assert.equal(applyAction(state, 'contributeGroup', { groupId: group.id, amount: 3000 }).ok, true);
  assert.match(renderGroupChat(ctx, route()), /data-gc-action="request-payout"/);
  applyAction(state, 'setGroupParticipant', { groupId: group.id, memberId: 'senam' });
  assert.doesNotMatch(renderGroupChat(ctx, route()), /data-gc-action="request-payout"/);
  applyAction(state, 'setGroupParticipant', { groupId: group.id, memberId: 'me' });
  assert.equal(applyAction(state, 'requestPayout', { groupId: group.id, amount: 18000, recipient: 'Balme Library prints', rail: 'Lumo', destination: '@balme', note: 'Six reports' }).ok, true);
  const html = renderGroupChat(ctx, route()); assert.doesNotMatch(html, /data-gc-action="request-payout"/); assert.match(html, /Review payout/);
});
