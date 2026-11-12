import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { installExperienceClarity } from '../dist/js/experience-clarity.js';

test('first-budget keyboard footer keeps its hint above two readable action columns', () => {
  const css = readFileSync(new URL('../dist/experience-clarity.css', import.meta.url), 'utf8');
  const scope = '\\.lumo-keyboard-open \\.activation-step-purpose ';
  const rule = selector => css.match(new RegExp(`${scope}${selector}\\{([^}]+)\\}`))?.[1] || '';
  assert.match(rule('\\.activation-footer'), /display:grid;grid-template-columns:minmax\(0,1fr\) minmax\(0,1fr\)/);
  assert.match(rule('\\.activation-budget-actions'), /display:contents/);
  assert.match(rule('\\.activation-budget-actions>p'), /grid-column:1\/-1/);
  const controls = rule('\\.activation-footer>\\.button,\\.lumo-keyboard-open \\.activation-step-purpose \\.activation-add-essential');
  assert.match(controls, /min-height:48px/);
  assert.match(controls, /font-size:13px;line-height:1\.3/);
});

function eventTarget(properties = {}) {
  const listeners = new Map();
  return Object.assign(properties, {
    addEventListener(type, listener) {
      if (!listeners.has(type)) listeners.set(type, new Set());
      listeners.get(type).add(listener);
    },
    removeEventListener(type, listener) { listeners.get(type)?.delete(listener); },
    emit(type) { for (const listener of listeners.get(type) || []) listener(); },
    listenerCount() { return [...listeners.values()].reduce((count, set) => count + set.size, 0); }
  });
}

function classes() {
  const values = new Set();
  return {
    add: value => values.add(value),
    contains: value => values.has(value),
    toggle(value, enabled) { if (enabled) values.add(value); else values.delete(value); }
  };
}

function editor(properties = {}) {
  return Object.assign({
    matches: () => true, disabled: false, readOnly: false, isConnected: true,
    parentElement: null, closest: () => null,
    getBoundingClientRect: () => ({ top: 20, bottom: 72 })
  }, properties);
}

function withPage(run) {
  const names = ['window', 'document', 'requestAnimationFrame', 'cancelAnimationFrame', 'MutationObserver', 'getComputedStyle', 'localStorage'];
  const previous = new Map(names.map(name => [name, Object.getOwnPropertyDescriptor(globalThis, name)]));
  const frames = new Map(), properties = new Map();
  let nextFrame = 1, observer, welcome = null, cleanup;
  const viewport = eventTarget({ height: 800, offsetTop: 0 });
  const window = eventTarget({ innerHeight: 800, innerWidth: 390, visualViewport: viewport });
  const body = { matches: () => false };
  const app = { getBoundingClientRect: () => ({ top: viewport.offsetTop, bottom: viewport.offsetTop + viewport.height }) };
  const view = {};
  const page = { style: { setProperty: (name, value) => properties.set(name, value) }, classList: classes() };
  const document = eventTarget({
    documentElement: page, body, activeElement: body,
    getElementById: id => id === 'app' ? app : id === 'view' ? view : null,
    querySelector: () => welcome
  });
  Object.assign(globalThis, {
    window, document,
    requestAnimationFrame: callback => { const id = nextFrame++; frames.set(id, callback); return id; },
    cancelAnimationFrame: id => frames.delete(id),
    MutationObserver: class {
      constructor(callback) { observer = this; this.callback = callback; this.disconnected = false; }
      observe() {}
      disconnect() { this.disconnected = true; }
    },
    getComputedStyle: element => ({ overflowY: element.overflowY || 'visible' }),
    localStorage: { getItem() { throw new Error('Storage unavailable'); }, setItem() { throw new Error('Storage unavailable'); } }
  });
  const fixture = {
    window, document, viewport, page, properties,
    install() { cleanup = installExperienceClarity(); this.flush(); },
    flush() {
      while (frames.size) {
        const callbacks = [...frames.values()]; frames.clear();
        for (const callback of callbacks) callback();
      }
    },
    resize(height, { layoutHeight = height, width = window.innerWidth, offsetTop = 0 } = {}) {
      window.innerHeight = layoutHeight; window.innerWidth = width;
      viewport.height = height; viewport.offsetTop = offsetTop;
      viewport.emit('resize'); this.flush();
    },
    focus(element) { document.activeElement = element; document.emit('focusin'); this.flush(); },
    blur() { document.activeElement = body; document.emit('focusout'); this.flush(); },
    get open() { return page.classList.contains('lumo-keyboard-open'); },
    setWelcome(root) { welcome = root; observer?.callback(); this.flush(); },
    dispose() { cleanup?.(); cleanup = null; },
    get observer() { return observer; },
    get pendingFrames() { return frames.size; }
  };
  try { run(fixture); }
  finally {
    fixture.dispose();
    for (const [name, descriptor] of previous) {
      if (descriptor) Object.defineProperty(globalThis, name, descriptor);
      else delete globalThis[name];
    }
  }
}

test('keyboard layout survives a transient blur and refocus in a resized layout viewport', () => withPage(page => {
  page.install();
  page.focus(editor());
  page.resize(465);
  assert.equal(page.open, true);
  assert.equal(page.properties.get('--visible-app-height'), '465px');

  // Android can report the already reduced innerHeight between two fields.
  page.blur();
  assert.equal(page.open, true, 'keep pinned actions in the visible viewport during focus transfer');
  page.focus(editor());
  assert.equal(page.open, true, 'retain the full-height reference for the second field');

  page.blur();
  page.resize(800);
  assert.equal(page.open, false, 'restore the ordinary layout after the keyboard closes');
}));

test('a reduced visual viewport exposes height and pan offset when the layout viewport does not resize', () => withPage(page => {
  page.install();
  page.focus(editor());
  page.resize(465, { layoutHeight: 800, width: 820, offsetTop: 95 });
  assert.equal(page.open, true);
  assert.equal(page.properties.get('--visible-app-height'), '465px');
  assert.equal(page.properties.get('--visible-app-offset-top'), '95px');
  page.blur(); page.focus(editor());
  assert.equal(page.open, true);
  page.resize(800, { width: 820 });
  assert.equal(page.open, false);
}));

test('ordinary unfocused window resizing and orientation establish a fresh baseline', () => withPage(page => {
  page.install();
  page.resize(600);
  page.focus(editor());
  assert.equal(page.open, false, 'an ordinary window resize is not a keyboard');
  page.resize(400, { width: 840 });
  assert.equal(page.open, false, 'do not compare landscape height with the portrait baseline');
  page.resize(245, { width: 840 });
  assert.equal(page.open, true, 'a subsequent landscape keyboard is still detected');
}));

test('scrolling reveals the entire editor above a pinned footer without horizontal movement', () => withPage(page => {
  const scrolls = [];
  const footer = { contains: () => false, getBoundingClientRect: () => ({ top: 390, bottom: 465, height: 75 }) };
  const scope = { querySelector: () => footer };
  const scroll = {
    overflowY: 'auto', scrollHeight: 900, clientHeight: 465,
    getBoundingClientRect: () => ({ top: 0, bottom: 465 }),
    scrollBy: options => scrolls.push(options)
  };
  page.install();
  page.document.activeElement = editor({
    parentElement: scroll, closest: () => scope,
    getBoundingClientRect: () => ({ top: 428, bottom: 480 })
  });
  page.resize(465);
  assert.deepEqual(scrolls, [{ top: 100, left: 0, behavior: 'auto' }]);
}));

test('read-only and disabled fields do not activate a keyboard layout', () => withPage(page => {
  page.install();
  page.focus(editor({ readOnly: true })); page.resize(465, { layoutHeight: 800 });
  assert.equal(page.open, false);
  page.focus(editor({ disabled: true }));
  assert.equal(page.open, false);
}));

test('first meeting celebrates only once per session when local storage is unavailable', () => withPage(page => {
  const first = { dataset: {}, classList: classes() };
  const next = { dataset: {}, classList: classes() };
  page.setWelcome(first); page.install();
  assert.equal(first.classList.contains('first-meet-enter'), true);
  page.setWelcome(next);
  assert.equal(next.classList.contains('first-meet-enter'), false, 'returning to a new welcome DOM must not replay the reward');
}));

test('cleanup removes viewport and focus observers and cancels pending updates', () => withPage(page => {
  page.install();
  page.document.emit('focusin');
  assert.equal(page.pendingFrames, 1);
  page.dispose();
  assert.equal(page.pendingFrames, 0);
  assert.equal(page.document.listenerCount(), 0);
  assert.equal(page.window.listenerCount(), 0);
  assert.equal(page.viewport.listenerCount(), 0);
  assert.equal(page.observer.disconnected, true);
}));
