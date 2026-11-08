import test from 'node:test';
import assert from 'node:assert/strict';
import { bindExplore } from '../dist/js/explore-playback.js';
import { EXPLORE_SCENES } from '../dist/js/explore-model.js';

function element(dataset = {}) {
  const attributes = new Map(), properties = new Map();
  return {
    dataset, textContent: '', innerHTML: '', hidden: false, disabled: false,
    style: { setProperty: (key, value) => properties.set(key, value), getPropertyValue: key => properties.get(key) },
    setAttribute: (key, value) => attributes.set(key, value),
    getAttribute: key => attributes.get(key) ?? null,
    removeAttribute: key => attributes.delete(key),
    querySelector: () => null,
  };
}

function eventTarget() {
  const listeners = new Map();
  return {
    listeners,
    addEventListener(name, fn) { if (!listeners.has(name)) listeners.set(name, new Set()); listeners.get(name).add(fn); },
    removeEventListener(name, fn) { listeners.get(name)?.delete(fn); if (!listeners.get(name)?.size) listeners.delete(name); },
    emit(name, event = {}) { for (const fn of [...(listeners.get(name) || [])]) fn(event); },
  };
}

function clock() {
  let time = 0, sequence = 0;
  const pending = new Map(), callbacks = [];
  return {
    pending, callbacks, now: () => time,
    elapseWithoutTimers(ms) { time += ms; },
    setTimeout(fn, delay) { const id = ++sequence; pending.set(id, { fn, at: time + delay }); callbacks.push(fn); return id; },
    clearTimeout(id) { pending.delete(id); },
    advance(ms) {
      const end = time + ms;
      for (;;) {
        const next = [...pending].filter(([, item]) => item.at <= end).sort((a, b) => a[1].at - b[1].at)[0];
        if (!next) break;
        time = next[1].at; pending.delete(next[0]); next[1].fn();
      }
      time = end;
    },
  };
}

function harness({ reducedMotion = false, hidden = false } = {}) {
  const time = clock(), doc = { ...eventTarget(), hidden }, nodes = new Map();
  const root = { ...element(), ...eventTarget(), isConnected: true, ownerDocument: doc };
  const stage = element(); stage.innerHTML = 'Initial sample home';
  nodes.set('[data-explore-stage]', stage);
  for (const name of ['live', 'controls', 'count']) nodes.set(`[data-explore-${name}]`, element());
  const controls = new Map();
  for (const name of ['previous', 'toggle', 'next', 'skip', 'replay']) {
    const button = element({ exploreControl: name }); controls.set(name, button);
    nodes.set(`[data-explore-control="${name}"]`, button);
  }
  let focused = 0;
  nodes.set('[data-explore-end-title]', { focus() { focused++; } });
  const scenes = EXPLORE_SCENES.map((_, index) => {
    const button = element({ exploreScene: String(index) }), fill = element();
    button.querySelector = selector => selector === '[data-explore-fill]' ? fill : null;
    button.fill = fill; return button;
  });
  const members = new Set([...controls.values(), ...scenes]);
  root.contains = button => members.has(button);
  root.querySelector = selector => nodes.get(selector) || null;
  root.querySelectorAll = selector => selector === '[data-explore-scene]' ? scenes : [];
  const forbidden = name => () => { throw new Error(`Explore must not call ${name}`); };
  const ctx = {
    $: selector => selector === '.lumo-explore' ? root : null,
    go: forbidden('navigation'), act: forbidden('financial actions'), finishTour: forbidden('signup'),
    beginSignup: forbidden('signup'), saveDraft: forbidden('draft persistence'),
    get state() { throw new Error('Explore must not read member money'); },
    get draft() { throw new Error('Explore must not change member drafts'); },
  };
  const cleanup = bindExplore(ctx, { now: time.now, setTimeout: time.setTimeout, clearTimeout: time.clearTimeout, reducedMotion });
  return {
    root, doc, stage, nodes, controls, scenes, time, cleanup,
    get count() { return nodes.get('[data-explore-count]').textContent; },
    get focused() { return focused; },
    click(name) { root.emit('click', { target: { closest: () => controls.get(name) } }); },
    select(index) { root.emit('click', { target: { closest: () => scenes[index] } }); },
    visibility(value) { doc.hidden = value; doc.emit('visibilitychange'); },
  };
}

test('autoplay visits every feature and finishes without opening signup or touching member data', () => {
  const h = harness();
  assert.equal(h.count, `1 / ${EXPLORE_SCENES.length}`);
  assert.equal(h.root.dataset.paused, 'false');
  for (let index = 0; index < EXPLORE_SCENES.length; index++) {
    assert.equal(h.scenes[index].getAttribute('aria-current'), 'step');
    h.time.advance(EXPLORE_SCENES[index].duration);
    if (index < EXPLORE_SCENES.length - 1) assert.equal(h.count, `${index + 2} / ${EXPLORE_SCENES.length}`);
  }
  assert.equal(h.root.dataset.complete, 'true');
  assert.equal(h.count, 'All clear.');
  assert.equal(h.nodes.get('[data-explore-controls]').hidden, true);
  assert.equal(h.controls.get('skip').hidden, true);
  assert.equal(h.time.pending.size, 0);
  assert.equal(h.focused, 1);
  assert.match(h.nodes.get('[data-explore-live]').textContent, /Tour finished/);
  const end = h.stage.innerHTML; h.time.advance(60000);
  assert.equal(h.stage.innerHTML, end);
  h.cleanup();
});

test('pause keeps elapsed viewing time and resume continues the unfinished feature', () => {
  const h = harness(), duration = EXPLORE_SCENES[0].duration;
  h.time.advance(1600); h.click('toggle');
  assert.equal(h.root.dataset.paused, 'true');
  assert.equal(h.controls.get('toggle').getAttribute('aria-label'), 'Play tour');
  assert.equal(h.time.pending.size, 0);
  h.time.advance(10000); assert.equal(h.count, `1 / ${EXPLORE_SCENES.length}`);
  h.click('toggle');
  assert.equal(h.controls.get('toggle').getAttribute('aria-label'), 'Pause tour');
  h.time.advance(duration - 1600 - 1); assert.equal(h.count, `1 / ${EXPLORE_SCENES.length}`);
  h.time.advance(1); assert.equal(h.count, `2 / ${EXPLORE_SCENES.length}`);
  h.cleanup();
});

test('pausing after a delayed animation frame keeps the displayed feature aligned with progress', () => {
  const h = harness();
  h.time.elapseWithoutTimers(EXPLORE_SCENES[0].duration + 25);
  h.click('toggle');
  assert.equal(h.count, `2 / ${EXPLORE_SCENES.length}`);
  assert.equal(h.root.dataset.paused, 'true');
  assert.match(h.stage.innerHTML, /data-explore-scene-view="plan"/);
  assert.equal(h.time.pending.size, 0);
  h.cleanup();
});

test('manual navigation pauses on the chosen feature until the viewer explicitly presses Play', () => {
  const h = harness(); h.time.advance(1000); h.click('next');
  assert.equal(h.count, `2 / ${EXPLORE_SCENES.length}`);
  assert.equal(h.root.dataset.paused, 'true');
  assert.equal(h.root.dataset.manual, 'true');
  assert.equal(h.time.pending.size, 0);
  h.time.advance(20000); assert.equal(h.count, `2 / ${EXPLORE_SCENES.length}`);
  h.select(4); assert.equal(h.count, `5 / ${EXPLORE_SCENES.length}`);
  assert.match(h.nodes.get('[data-explore-live]').textContent, /Money Boxes/);
  assert.equal(h.root.dataset.paused, 'true');
  h.click('previous'); assert.equal(h.count, `4 / ${EXPLORE_SCENES.length}`);
  h.click('toggle'); h.time.advance(EXPLORE_SCENES[3].duration);
  assert.equal(h.count, `5 / ${EXPLORE_SCENES.length}`);
  h.cleanup();
});

test('Skip stops playback at the end and Replay begins a fresh first feature', () => {
  const h = harness(); h.time.advance(1000); h.click('skip');
  assert.equal(h.root.dataset.complete, 'true');
  assert.equal(h.time.pending.size, 0);
  h.click('replay');
  assert.equal(h.root.dataset.complete, 'false');
  assert.equal(h.root.dataset.paused, 'false');
  assert.equal(h.count, `1 / ${EXPLORE_SCENES.length}`);
  assert.equal(h.nodes.get('[data-explore-controls]').hidden, false);
  assert.equal(h.controls.get('previous').disabled, true);
  h.time.advance(EXPLORE_SCENES[0].duration - 1); assert.equal(h.count, `1 / ${EXPLORE_SCENES.length}`);
  h.time.advance(1); assert.equal(h.count, `2 / ${EXPLORE_SCENES.length}`);
  h.cleanup();
});

test('backgrounding pauses the animation and returning resumes without counting hidden time', () => {
  const h = harness(); h.time.advance(1400); h.visibility(true);
  assert.equal(h.root.dataset.paused, 'true'); assert.equal(h.time.pending.size, 0);
  h.time.advance(30000); assert.equal(h.count, `1 / ${EXPLORE_SCENES.length}`);
  h.visibility(false); assert.equal(h.root.dataset.paused, 'false');
  h.time.advance(EXPLORE_SCENES[0].duration - 1400);
  assert.equal(h.count, `2 / ${EXPLORE_SCENES.length}`);
  h.click('toggle'); h.visibility(true); h.time.advance(20000); h.visibility(false);
  assert.equal(h.root.dataset.paused, 'true', 'returning must respect an explicit user pause');
  assert.equal(h.time.pending.size, 0);
  h.cleanup();
});

test('a tour opened in a background tab waits for the tab to become visible', () => {
  const h = harness({ hidden: true });
  assert.equal(h.root.dataset.paused, 'true'); assert.equal(h.time.pending.size, 0);
  h.time.advance(30000); assert.equal(h.count, `1 / ${EXPLORE_SCENES.length}`);
  h.visibility(false); h.time.advance(EXPLORE_SCENES[0].duration);
  assert.equal(h.count, `2 / ${EXPLORE_SCENES.length}`);
  h.cleanup();
});

test('keyboard focus pauses the tour so its controls do not move away while being read', () => {
  const h = harness(); h.root.emit('keydown', { key: 'Tab' });
  assert.equal(h.root.dataset.paused, 'true'); assert.equal(h.time.pending.size, 0);
  h.time.advance(60000); assert.equal(h.count, `1 / ${EXPLORE_SCENES.length}`);
  h.cleanup();
});

test('reduced-motion starts with static manual scenes and replay respects that preference', () => {
  const h = harness({ reducedMotion: true });
  assert.equal(h.root.dataset.paused, 'true'); assert.equal(h.time.pending.size, 0);
  h.time.advance(60000); assert.equal(h.count, `1 / ${EXPLORE_SCENES.length}`);
  h.click('next'); assert.equal(h.count, `2 / ${EXPLORE_SCENES.length}`);
  h.click('skip'); h.click('replay');
  assert.equal(h.count, `1 / ${EXPLORE_SCENES.length}`);
  assert.equal(h.root.dataset.paused, 'true'); assert.equal(h.time.pending.size, 0);
  h.cleanup();
});

test('cleanup removes listeners and timers and stale queued events cannot alter an abandoned tour', () => {
  const h = harness(); h.time.advance(800);
  const staleTick = h.time.callbacks.at(-1);
  assert.ok(h.time.pending.size > 0); assert.ok(h.root.listeners.size > 0); assert.ok(h.doc.listeners.size > 0);
  h.cleanup();
  assert.equal(h.time.pending.size, 0); assert.equal(h.root.listeners.size, 0); assert.equal(h.doc.listeners.size, 0);
  const before = { html: h.stage.innerHTML, count: h.count, dataset: { ...h.root.dataset } };
  h.time.advance(60000); staleTick(); h.click('skip'); h.visibility(true); h.root.emit('keydown', { key: 'Tab' });
  assert.deepEqual({ html: h.stage.innerHTML, count: h.count, dataset: { ...h.root.dataset } }, before);
  assert.equal(h.time.pending.size, 0);
  h.cleanup();
});

test('detaching the view stops queued autoplay from changing another route', () => {
  const h = harness(), before = h.count;
  h.root.isConnected = false; h.time.advance(60000);
  assert.equal(h.count, before); assert.equal(h.time.pending.size, 0);
  h.click('next'); assert.equal(h.count, before);
  h.cleanup();
});
