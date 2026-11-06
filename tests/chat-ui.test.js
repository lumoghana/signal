import test from 'node:test';
import assert from 'node:assert/strict';
import { createDemoState, createEmptyState } from '../dist/js/model.js';
import { bindChat, renderChat, recoverInterruptedChat } from '../dist/js/chat.js';
import { getConversationalAnswer } from '../dist/js/chat-language.js';

class Surface {
  constructor() {
    this.listeners = new Map(); this.elements = new Map(); this.dataset = {};
    this.isConnected = true; this.disabled = false; this.value = '';
    this.scrollHeight = 1000; this.clientHeight = 400; this.scrollTop = 0;
    this.style = { setProperty() {}, removeProperty() {} };
  }
  addEventListener(name, listener) { if (!this.listeners.has(name)) this.listeners.set(name, new Set()); this.listeners.get(name).add(listener); }
  removeEventListener(name, listener) { this.listeners.get(name)?.delete(listener); }
  querySelector(selector) { return this.elements.get(selector) || null; }
  closest(selector) { return selector === 'button' ? this : null; }
  scrollTo({ top }) { this.scrollTop = Math.min(Math.max(0, top), this.scrollHeight - this.clientHeight); }
  emit(name, values = {}) {
    const event = { target: this, prevented: false, preventDefault() { this.prevented = true; }, ...values };
    [...(this.listeners.get(name) || [])].forEach(listener => listener(event));
    return event;
  }
}
function runtime(t, { state = createDemoState(), chat = {} } = {}) {
  const timers = new Map(), frames = new Map(); let next = 1;
  t.mock.method(globalThis, 'setTimeout', callback => { const handle = next++; timers.set(handle, callback); return handle; });
  t.mock.method(globalThis, 'clearTimeout', handle => timers.delete(handle));
  const oldRaf = globalThis.requestAnimationFrame, oldCancel = globalThis.cancelAnimationFrame;
  globalThis.requestAnimationFrame = callback => { const handle = next++; frames.set(handle, callback); return handle; };
  globalThis.cancelAnimationFrame = handle => frames.delete(handle);
  t.after(() => { if (oldRaf) globalThis.requestAnimationFrame = oldRaf; else delete globalThis.requestAnimationFrame; if (oldCancel) globalThis.cancelAnimationFrame = oldCancel; else delete globalThis.cancelAnimationFrame; });
  const root = new Surface(), input = new Surface(), send = new Surface(), form = new Surface(), thread = new Surface();
  input.value = chat.input || ''; input.scrollHeight = 46;
  root.elements = new Map([['#chat-input', input], ['.chat-send', send], ['#chat-form', form], ['#chat-thread', thread]]);
  const ctx = {
    state, draft: { chat }, route: { section: 'chat', page: 'home' },
    saved: 0, refreshed: 0, navigated: [], currentSheet: null,
    $: selector => selector === '[data-chat-view]' ? root : null,
    saveDraft() { this.saved++; }, refresh() { this.refreshed++; },
    go(...args) { this.navigated.push(args); },
    act() { assert.fail('Chat must not execute a financial action'); },
    sheet(_html, bind) {
      const sheet = new Surface(), clear = new Surface(), keep = new Surface();
      sheet.elements = new Map([['[data-chat-clear]', clear], ['[data-chat-keep]', keep]]);
      this.currentSheet = { sheet, clear, keep, html:_html }; bind(sheet);
    },
    closeSheet() { if (this.currentSheet) this.currentSheet.sheet.isConnected = false; },
  };
  const click = dataset => { const button = new Surface(); button.dataset = dataset; root.emit('click', { target: button }); return button; };
  const type = text => { input.value = text; input.emit('input'); };
  const flushFrames = () => { const queued = [...frames.values()]; frames.clear(); queued.forEach(callback => callback()); };
  const reply = () => { const queued = [...timers.values()]; timers.clear(); queued.forEach(callback => callback()); };
  return { ctx, root, input, send, form, thread, timers, frames, click, type, flushFrames, reply };
}

test('Ask Lumo introduces Lux without exposing money and gives Home a clear route', () => {
  const state = createDemoState(); state.profile.name = 'Ama Mensah';
  const html = renderChat({ state, draft: { chat: {} } });
  assert.match(html, /class="chat-page is-new-conversation"/);
  assert.match(html, /lux-chat-2d.webp" width="148" height="148" alt="Lux, your Lumo money buddy"/);
  assert.match(html, /Hey Ama\.<br>Let’s talk money\./);
  assert.match(html, /data-chat-action="home" aria-label="Home"/);
  assert.match(html, /Swipe right to your app/);
  assert.equal((html.match(/data-chat-question=/g) || []).length, 4);
  assert.doesNotMatch(html, /GH₵|chat-live-summary|page-head|back-button|class="page /);
});

test('names, drafted questions, replies and follow-ups remain escaped HTML', () => {
  const state = createDemoState(); state.profile.name = '<img/onerror=alert(1)>';
  const intro = renderChat({ state, draft: { chat: { input: '</textarea><script>bad()</script>' } } });
  assert.match(intro, /Hey &lt;img\/onerror=alert\(1\)&gt;/);
  assert.match(intro, /&lt;\/textarea&gt;&lt;script&gt;bad\(\)&lt;\/script&gt;/);
  assert.doesNotMatch(intro, /<script>|<img\/onerror/);
  const html = renderChat({ state, draft: { chat: { messages: [
    { id: 'u', role: 'user', text: '<script>hello</script>' },
    { id: 'a" onmouseover="bad()', role: 'assistant', title: '<b>Unsafe</b>', paragraphs: ['<img src=x onerror=bad()>'], stats: [{ label: '<input>', value: '<iframe>' }], actions: [{ label: '<u>Open</u>', route: { section: 'plan' } }], followUps: ['" onclick="bad()'] },
  ] } } });
  assert.doesNotMatch(html, /<script>|<b>Unsafe|<iframe>|<input>|<u>Open|data-message-id="a" onmouseover/);
  assert.match(html, /data-chat-question="&quot; onclick=&quot;bad\(\)"/);
});

test('pending questions keep the composer editable and disable duplicate sends', t => {
  const env = runtime(t), dispose = bindChat(env.ctx); t.after(dispose);
  env.type('Can I pay GH₵50 for lunch?'); env.form.emit('submit');
  env.form.emit('submit'); env.click({ chatQuestion: 'What is my balance?' });
  assert.equal(env.ctx.draft.chat.messages.length, 1);
  assert.equal(env.ctx.draft.chat.pending, true);
  const html = renderChat(env.ctx), textarea = html.match(/<textarea[^>]*>/)[0];
  assert.doesNotMatch(textarea, /disabled|readonly/);
  assert.match(html, /class="chat-send" aria-label="Send question" disabled/);
  env.type('And can I save some?');
  assert.equal(env.ctx.draft.chat.input, 'And can I save some?');
  assert.equal(env.send.disabled, true);
  env.reply();
  assert.equal(env.ctx.draft.chat.pending, false);
  assert.equal(env.ctx.draft.chat.input, 'And can I save some?');
  assert.deepEqual(env.ctx.draft.chat.messages.map(message => message.role), ['user', 'assistant']);
  assert.ok(env.ctx.draft.chat.messages[1].context);
  assert.ok(env.ctx.draft.chat.messages[1].followUps.length);
});

test('a reply reads current recorded money and finishes after leaving without navigation', t => {
  const state = createEmptyState(); state.wallet = 2000; state.buffer = 0;
  const env = runtime(t, { state }), dispose = bindChat(env.ctx);
  env.type('Can I pay GH₵50 for lunch?'); env.form.emit('submit');
  state.wallet = 10000;
  const expected = getConversationalAnswer(state, 'Can I pay GH₵50 for lunch?', { messages: [] });
  const financialSnapshot = structuredClone(state), refreshes = env.ctx.refreshed;
  env.ctx.route = { section: 'home', page: 'home' }; dispose(); env.root.isConnected = false;
  env.reply();
  assert.equal(env.ctx.refreshed, refreshes);
  assert.equal(env.ctx.navigated.length, 0);
  assert.equal(env.ctx.draft.chat.pending, false);
  assert.deepEqual(env.ctx.draft.chat.messages[1].stats, expected.stats);
  assert.deepEqual(env.ctx.draft.chat.messages[1].paragraphs, expected.paragraphs);
  assert.deepEqual(state, financialSnapshot);
});

test('clear conversation can cancel a pending reply without resurrecting it or changing money', t => {
  const env = runtime(t), dispose = bindChat(env.ctx); t.after(dispose);
  const financialSnapshot = structuredClone(env.ctx.state);
  env.type('How much money do I have?'); env.form.emit('submit');
  const staleCallback = [...env.timers.values()][0];
  env.click({ chatAction: 'options' }); env.ctx.currentSheet.clear.emit('click');
  assert.equal(env.ctx.draft.chat.pending, false);
  assert.deepEqual(env.ctx.draft.chat.messages, []);
  assert.equal(env.timers.size, 0);
  staleCallback();
  assert.deepEqual(env.ctx.draft.chat.messages, []);
  assert.deepEqual(env.ctx.state, financialSnapshot);
});

test('leaving removes handlers and detached controls cannot send or navigate', t => {
  const env = runtime(t), dispose = bindChat(env.ctx);
  env.type('Hello'); env.click({ chatAction: 'options' });
  const staleRootClick = [...env.root.listeners.get('click')][0];
  const staleClear = [...env.ctx.currentSheet.clear.listeners.get('click')][0];
  const conversation = env.ctx.draft.chat, saved = env.ctx.saved;
  dispose();
  assert.ok(env.ctx.saved > saved);
  assert.equal(env.root.listeners.get('click').size, 0);
  assert.equal(env.ctx.currentSheet.clear.listeners.get('click').size, 0);
  env.form.emit('submit'); env.click({ chatAction: 'home' });
  staleRootClick({ target: { closest: () => ({ dataset: { chatQuestion: 'Hello' } }) } });
  staleClear();
  assert.equal(env.ctx.draft.chat, conversation);
  assert.deepEqual(conversation.messages, []);
  assert.equal(env.ctx.navigated.length, 0);
  assert.equal(env.timers.size, 0);
});

test('Enter sends, Shift+Enter and IME confirmation preserve editing', t => {
  const env = runtime(t), dispose = bindChat(env.ctx); t.after(dispose);
  env.type('Hello Lux');
  assert.equal(env.input.emit('keydown', { key: 'Enter', shiftKey: true }).prevented, false);
  env.input.emit('compositionstart');
  assert.equal(env.input.emit('keydown', { key: 'Enter' }).prevented, false);
  env.input.emit('compositionend');
  assert.equal(env.input.emit('keydown', { key: 'Enter', isComposing: true }).prevented, false);
  assert.equal(env.ctx.draft.chat.messages.length, 0);
  assert.equal(env.input.emit('keydown', { key: 'Enter' }).prevented, true);
  assert.equal(env.ctx.draft.chat.messages[0].text, 'Hello Lux');
  env.reply();
});

test('scrolling through older messages keeps that position when typing or reopening', t => {
  const env = runtime(t, { chat: { messages: [{ id: 'u', role: 'user', text: 'Hello' }], input: '', scrollTop: 170, followTail: false } });
  const dispose = bindChat(env.ctx); t.after(dispose); env.flushFrames();
  assert.equal(env.thread.scrollTop, 170);
  env.thread.scrollTop = 90; env.thread.emit('scroll'); env.type('A new question');
  assert.equal(env.thread.scrollTop, 90);
  assert.equal(env.ctx.draft.chat.scrollTop, 90);
  assert.equal(env.ctx.draft.chat.followTail, false);
});

test('reload recovers a pending contextual answer once and retains the next draft', () => {
  const state = createDemoState(), financialSnapshot = structuredClone(state);
  const first = getConversationalAnswer(state, 'Can I pay GH₵25 for lunch?');
  const stored = { messages: [{ id: 'a1', role: 'assistant', ...first }, { id: 'u2', role: 'user', text: 'What about GH₵40?' }], input: 'A question for afterwards', pending: true };
  const recovered = recoverInterruptedChat(state, stored);
  assert.equal(recovered.messages.length, 3);
  assert.equal(recovered.input, 'A question for afterwards');
  assert.equal(recovered.pending, false);
  assert.equal(recovered.messages[2].context.topic, 'afford');
  assert.equal(recovered.messages[2].context.amount, 4000);
  assert.ok(recovered.messages[2].followUps.length);
  assert.deepEqual(recoverInterruptedChat(state, recovered), recovered);
  assert.deepEqual(state, financialSnapshot);
  assert.equal(stored.messages.length, 2);
});

test('Home, response links and lessons route safely without modifying financial state', t => {
  const env = runtime(t, { chat: { messages: [{ id: 'answer', role: 'assistant', actions: [{ label: 'Your plan', route: { section: 'plan', page: 'home' } }] }] } });
  const financialSnapshot = structuredClone(env.ctx.state), dispose = bindChat(env.ctx); t.after(dispose);
  assert.doesNotThrow(() => env.root.emit('click', { target: {} }));
  assert.doesNotThrow(() => env.root.emit('click', { target: null }));
  env.click({ chatAction: 'home' });
  assert.deepEqual(env.ctx.navigated[0], [{ section: 'home', page: 'home' }, { root: true }]);
  env.click({ chatRoute: 'answer:0' });
  assert.deepEqual(env.ctx.navigated[1], [{ section: 'plan', page: 'home' }]);
  env.click({ chatAction: 'lesson' });
  const lesson = env.ctx.draft.chat.messages.at(-1);
  env.click({ chatAnswer: `${lesson.id}:1` });
  assert.equal(lesson.answer, 1);
  assert.match(renderChat(env.ctx), /You’ve got it\./);
  env.click({ chatAnswer: `${lesson.id}:0` });
  assert.equal(lesson.answer, 1);
  assert.deepEqual(env.ctx.state, financialSnapshot);
});

test('private chat follows parent height changes from offline banners and the keyboard without losing its draft', t => {
  const oldViewport=globalThis.visualViewport,oldObserver=globalThis.ResizeObserver;
  let observed=null,notify=null,disconnected=false;
  const viewport=new Surface();viewport.height=844;viewport.offsetTop=0;
  globalThis.visualViewport=viewport;
  globalThis.ResizeObserver=class { constructor(callback){notify=callback;} observe(node){observed=node;} disconnect(){disconnected=true;} };
  t.after(()=>{if(oldViewport)globalThis.visualViewport=oldViewport;else delete globalThis.visualViewport;if(oldObserver)globalThis.ResizeObserver=oldObserver;else delete globalThis.ResizeObserver;});
  const env=runtime(t),properties=new Map();env.root.parentElement={clientHeight:844};env.root.getBoundingClientRect=()=>({top:0});
  env.root.style={setProperty:(key,value)=>properties.set(key,value),removeProperty:key=>properties.delete(key)};
  const dispose=bindChat(env.ctx);
  assert.equal(observed,env.root.parentElement);assert.equal(properties.get('--chat-viewport-height'),'844px');
  env.type('Keep this question');env.root.parentElement.clientHeight=790;notify();
  assert.equal(properties.get('--chat-viewport-height'),'790px');
  viewport.height=450;viewport.emit('resize');assert.equal(properties.get('--chat-viewport-height'),'450px');
  assert.equal(env.ctx.draft.chat.input,'Keep this question');
  dispose();assert.equal(disconnected,true);assert.equal(properties.has('--chat-viewport-height'),false);
});

test('chat options describe session persistence without promising permanent browser history', t => {
  const env=runtime(t),dispose=bindChat(env.ctx);t.after(dispose);env.click({chatAction:'options'});
  assert.match(env.ctx.currentSheet.html,/Kept for this tab’s session/);
  assert.match(env.ctx.currentSheet.html,/closing the tab can remove it/);
  assert.doesNotMatch(env.ctx.currentSheet.html,/until you clear it or remove browser data/);
});
