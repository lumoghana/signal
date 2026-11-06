import test from 'node:test';
import assert from 'node:assert/strict';
import { bindChatGestures, canOpenChatBySwipe } from '../dist/js/chat-gestures.js';

const point = (x, y, identifier = 1) => ({ clientX: x, clientY: y, identifier });
function harness(initial = { section: 'home', page: 'home' }) {
  const listeners = new Map(), documentListeners = new Map(), opened = [], returned = [];
  let route = initial, time = 0, enabled = true, modal = false, selected = '';
  const target = { isConnected: true, inert: false, clientWidth: 390,
    getBoundingClientRect: () => ({ left: 0, width: 390 }),
    addEventListener(name, fn, options) { assert.equal(options.passive, true); listeners.set(name, fn); },
    removeEventListener(name, fn) { if (listeners.get(name) === fn) listeners.delete(name); },
  };
  const surface = { closest: () => null, matches: () => false, parentElement: target, scrollWidth: 350, clientWidth: 350 };
  const doc = { hidden: false, activeElement: null,
    querySelector: () => modal ? {} : null,
    getSelection: () => ({ isCollapsed: !selected, toString: () => selected }),
    defaultView: { getComputedStyle: element => ({ overflowX: element.overflow || 'visible' }) },
    addEventListener(name, fn) { documentListeners.set(name, fn); },
    removeEventListener(name, fn) { if (documentListeners.get(name) === fn) documentListeners.delete(name); },
  };
  const cleanup = bindChatGestures({ target, getRoute: () => route, isEnabled: () => enabled,
    document: doc, now: () => time, onOpenChat: value => opened.push(value), onReturnApp: value => returned.push(value) });
  const emit = (name, touches, changedTouches = [], origin = surface) => listeners.get(name)?.({ target: origin, touches, changedTouches });
  const swipe = (from = point(260, 250), to = point(100, 252), origin = surface) => {
    emit('touchstart', [from], [], origin); time += 150;
    emit('touchmove', [to], [], origin); emit('touchend', [], [to], origin);
  };
  return { target, surface, doc, opened, returned, listeners, documentListeners, cleanup, emit, swipe,
    set route(value) { route = value; }, set enabled(value) { enabled = value; }, set modal(value) { modal = value; }, set selected(value) { selected = value; }, advance: amount => { time += amount; } };
}

test('read-only app pages permit chat entry, while money approvals and setup forms do not', () => {
  for (const route of [
    { section: 'home' }, { section: 'activity', page: 'insights' }, { section: 'pay', page: 'home', hubTab: 'campus' },
    { section: 'boxes', page: 'detail', id: 'trip' }, { section: 'life', page: 'group-detail', id: 'friends' },
  ]) assert.equal(canOpenChatBySwipe(route), true, JSON.stringify(route));
  for (const route of [
    { section: 'welcome' }, { section: 'onboarding', step: 'selfie' }, { section: 'activation', step: 'fund' },
    { section: 'pay', page: 'recipient' }, { section: 'pay', page: 'recipient-confirm' }, { section: 'pay', page: 'review' },
    { section: 'pay', page: 'pause' }, { section: 'pay', page: 'scan' }, { section: 'pay', page: 'service' },
    { section: 'pay', page: 'amount' }, { section: 'pay', page: 'conversation' }, { section: 'boxes', page: 'create' },
    { section: 'plan', page: 'home', edit: true }, { section: 'life', page: 'recovery' },
  ]) assert.equal(canOpenChatBySwipe(route), false, JSON.stringify(route));
});

test('left opens chat with the origin route; right returns from chat only after touch ends', () => {
  const route = { section: 'activity', page: 'insights', month: '2026-10' }, h = harness(route);
  h.emit('touchstart', [point(270, 200)]); h.emit('touchmove', [point(100, 205)]);
  assert.deepEqual(h.opened, []);
  h.emit('touchend', [], [point(100, 205)]);
  assert.deepEqual(h.opened, [route]); assert.notEqual(h.opened[0], route);
  h.route = { section: 'chat', page: 'home', returnTo: route };
  h.swipe(point(90, 200), point(270, 205));
  assert.equal(h.returned.length, 1); assert.deepEqual(h.returned[0].returnTo, route);
  h.cleanup();
});

test('opposite directions, small drags, vertical scrolls and diagonal starts never navigate', () => {
  const h = harness();
  h.swipe(point(100, 200), point(260, 202));
  h.swipe(point(220, 200), point(170, 202));
  h.swipe(point(220, 120), point(190, 300));
  h.emit('touchstart', [point(260, 100)]);
  h.emit('touchmove', [point(245, 125)]); // Locks as vertical before a later horizontal drift.
  h.emit('touchmove', [point(80, 130)]); h.emit('touchend', [], [point(80, 130)]);
  assert.equal(h.opened.length, 0);
  h.route = { section: 'chat' }; h.swipe(); assert.equal(h.returned.length, 0);
  h.cleanup();
});

test('interactive surfaces, text selection, modal overlays and native edges retain their gestures', () => {
  const h = harness();
  for (const tag of ['input', 'textarea', 'button', 'a', 'summary', 'form', 'label', 'slider', 'contenteditable', 'chips']) {
    const interactive = { closest: () => ({}), matches: () => tag === 'textarea', parentElement: h.target };
    h.swipe(undefined, undefined, interactive);
  }
  h.selected = 'a word'; h.swipe(); h.selected = '';
  h.modal = true; h.swipe(); h.modal = false;
  h.swipe(point(380, 200), point(180, 200));
  h.route = { section: 'chat' }; h.swipe(point(12, 200), point(200, 200));
  h.target.inert = true; h.swipe(point(100, 200), point(270, 200));
  assert.equal(h.opened.length, 0); assert.equal(h.returned.length, 0);
  h.cleanup();
});

test('a focused composer does not trap the conversation pane, and its draft is untouched', () => {
  const h = harness({ section: 'chat', page: 'home' }), editor = { value: 'A question I am still writing', matches: () => true };
  h.doc.activeElement = editor;
  h.swipe(point(90, 200), point(270, 205));
  assert.equal(h.returned.length, 1);
  assert.equal(editor.value, 'A question I am still writing');
  h.cleanup();
});

test('a horizontally scrollable strip keeps its movement while the normal conversation surface can swipe', () => {
  const h = harness({ section: 'chat' });
  const strip = { closest: () => null, matches: () => false, parentElement: h.target, scrollWidth: 600, clientWidth: 250, overflow: 'auto' };
  h.swipe(point(90, 200), point(270, 205), strip);
  assert.equal(h.returned.length, 0);
  h.swipe(point(90, 200), point(270, 205)); assert.equal(h.returned.length, 1);
  h.cleanup();
});

test('multitouch, cancelled gestures, long holds and changed touch identities do not commit', () => {
  const h = harness();
  h.emit('touchstart', [point(260, 200)]); h.emit('touchmove', [point(220, 200), point(100, 200, 2)]); h.emit('touchend', [], [point(90, 200)]);
  h.emit('touchstart', [point(260, 200)]); h.emit('touchcancel', []); h.emit('touchend', [], [point(90, 200)]);
  h.emit('touchstart', [point(260, 200)]); h.advance(901); h.emit('touchend', [], [point(90, 200)]);
  h.emit('touchstart', [point(260, 200)]); h.emit('touchend', [], [point(90, 200, 2)]);
  assert.equal(h.opened.length, 0); h.cleanup();
});

test('a stale route, disabled surface, hidden page and disposed handler cannot cause late navigation', () => {
  const h = harness({ section: 'activity', page: 'insights', month: '2026-10' });
  h.emit('touchstart', [point(260, 200)]); h.route = { section: 'activity', page: 'insights', month: '2026-11' }; h.emit('touchend', [], [point(90, 200)]);
  h.emit('touchstart', [point(260, 200)]); h.enabled = false; h.emit('touchend', [], [point(90, 200)]);
  h.enabled = true; h.emit('touchstart', [point(260, 200)]); h.doc.hidden = true; h.documentListeners.get('visibilitychange')(); h.doc.hidden = false; h.emit('touchend', [], [point(90, 200)]);
  h.emit('touchstart', [point(260, 200)]); h.cleanup(); h.emit('touchend', [], [point(90, 200)]);
  assert.equal(h.opened.length, 0); assert.equal(h.listeners.size, 0); assert.equal(h.documentListeners.size, 0);
  h.cleanup();
});

test('mouse movement has no navigation handlers and a route switch into approval cancels a touch', () => {
  const h = harness();
  assert.equal(h.listeners.has('mousedown'), false); assert.equal(h.listeners.has('pointerdown'), false);
  h.emit('touchstart', [point(260, 200)]); h.route = { section: 'pay', page: 'pause' }; h.emit('touchmove', [point(160, 200)]); h.emit('touchend', [], [point(90, 200)]);
  assert.equal(h.opened.length, 0); h.cleanup();
});
