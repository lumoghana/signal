import test from 'node:test';
import assert from 'node:assert/strict';
import { bindActivationConfetti } from '../dist/js/activation-confetti.js';

function environment({ entering = true, reduced = false, hidden = false, width = 390, height = 780 } = {}) {
  const originals = new Map(['requestAnimationFrame', 'cancelAnimationFrame', 'matchMedia', 'devicePixelRatio'].map(key => [key, Object.getOwnPropertyDescriptor(globalThis, key)]));
  const frames = new Map(), documentEvents = new Map(), motionEvents = new Map();
  let id = 0, draws = 0, clears = 0;
  const document = { hidden, addEventListener: (key, callback) => documentEvents.set(key, callback), removeEventListener: key => documentEvents.delete(key) };
  const motion = { matches: reduced, addEventListener: (key, callback) => motionEvents.set(key, callback), removeEventListener: key => motionEvents.delete(key) };
  const context = { setTransform() {}, clearRect() { clears++; }, save() {}, translate() {}, rotate() {}, fillRect() { draws++; }, restore() {} };
  const canvas = { getContext: () => context };
  const root = { isConnected: true, ownerDocument: document, classList: { contains: () => entering }, querySelector: () => canvas, getBoundingClientRect: () => ({ width, height }) };
  Object.defineProperties(globalThis, {
    requestAnimationFrame: { configurable: true, value: callback => { const next = ++id; frames.set(next, callback); return next; } },
    cancelAnimationFrame: { configurable: true, value: key => frames.delete(key) },
    matchMedia: { configurable: true, value: () => motion },
    devicePixelRatio: { configurable: true, value: 5 },
  });
  return {
    root, canvas, document, motion, frames, documentEvents, motionEvents,
    get draws() { return draws; }, get clears() { return clears; },
    tick(time) { const batch = [...frames.values()]; frames.clear(); batch.forEach(callback => callback(time)); },
    restore() { originals.forEach((descriptor, key) => { if (descriptor) Object.defineProperty(globalThis, key, descriptor); else delete globalThis[key]; }); },
  };
}

test('celebration is finite, caps rendering cost and releases listeners after completion', () => {
  const env = environment();
  try {
    const cleanup = bindActivationConfetti(env.root);
    assert.equal(env.frames.size, 1);
    assert.equal(env.canvas.width, 780, 'High device pixel ratios are capped.');
    assert.equal(env.canvas.height, 1560);
    env.tick(100);
    assert.ok(env.draws > 0 && env.draws <= 145);
    env.tick(500);
    assert.equal(env.frames.size, 1);
    env.tick(4500);
    assert.equal(env.frames.size, 0, 'The burst does not schedule another loop.');
    assert.equal(env.documentEvents.size, 0);
    assert.equal(env.motionEvents.size, 0);
    const clears = env.clears;
    cleanup(); cleanup();
    assert.equal(env.clears, clears, 'Cleanup remains safe after the automatic finish.');
  } finally { env.restore(); }
});

test('same-page refresh, reduced motion and a hidden document do not start a celebration', () => {
  for (const options of [{ entering: false }, { reduced: true }, { hidden: true }, { width: 0 }]) {
    const env = environment(options);
    try {
      const cleanup = bindActivationConfetti(env.root);
      assert.equal(env.frames.size, 0);
      assert.equal(env.documentEvents.size, 0);
      assert.equal(env.motionEvents.size, 0);
      cleanup();
    } finally { env.restore(); }
  }
});

test('navigation cleanup cancels pending work and clears the transient decoration', () => {
  const env = environment();
  try {
    const cleanup = bindActivationConfetti(env.root);
    cleanup(); cleanup();
    assert.equal(env.frames.size, 0);
    assert.equal(env.clears, 1);
    assert.equal(env.documentEvents.size, 0);
    assert.equal(env.motionEvents.size, 0);
    env.tick(5000);
    assert.equal(env.draws, 0);
  } finally { env.restore(); }
});

test('backgrounding the page stops the burst and returning does not restart it', () => {
  const env = environment();
  try {
    bindActivationConfetti(env.root);
    env.tick(0);
    env.document.hidden = true;
    env.documentEvents.get('visibilitychange')();
    assert.equal(env.frames.size, 0);
    assert.equal(env.documentEvents.size, 0);
    env.document.hidden = false;
    env.tick(200);
    assert.equal(env.frames.size, 0);
  } finally { env.restore(); }
});

test('enabling reduced motion during the burst immediately cancels it', () => {
  const env = environment();
  try {
    bindActivationConfetti(env.root);
    env.motion.matches = true;
    env.motionEvents.get('change')({ matches: true });
    assert.equal(env.frames.size, 0);
    assert.equal(env.motionEvents.size, 0);
  } finally { env.restore(); }
});

test('a detached page cannot keep its animation running', () => {
  const env = environment();
  try {
    bindActivationConfetti(env.root);
    env.root.isConnected = false;
    env.tick(0);
    assert.equal(env.frames.size, 0);
    assert.equal(env.documentEvents.size, 0);
  } finally { env.restore(); }
});
