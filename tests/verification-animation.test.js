import test from 'node:test';
import assert from 'node:assert/strict';
import { createVerificationAnimation } from '../dist/js/verification-animation.js';

function clock() {
  let now = 0, next = 0;
  const pending = new Map(), history = new Map();
  return {
    pending, history,
    schedule(callback, delay) { const id = ++next; const task = { callback, at: now + delay }; pending.set(id, task); history.set(id, task); return id; },
    unschedule(id) { pending.delete(id); },
    advance(milliseconds) {
      const end = now + milliseconds;
      while (true) {
        const nextTask = [...pending].filter(([, task]) => task.at <= end).sort((a, b) => a[1].at - b[1].at)[0];
        if (!nextTask) break;
        const [id, task] = nextTask; pending.delete(id); now = task.at; task.callback();
      }
      now = end;
    },
  };
}

function setup(extra = {}) {
  const time = clock(), events = [];
  const animation = createVerificationAnimation({ ...time, onStage: stage => events.push(stage), onComplete: () => events.push('complete'), ...extra });
  return { animation, time, events };
}

test('verification animation progresses through its stages and cannot complete early', () => {
  const { animation, time, events } = setup();
  assert.equal(animation.running, false);
  assert.equal(typeof animation.start(), 'number');
  assert.equal(animation.running, true); assert.deepEqual(events, [0]);
  time.advance(899); assert.deepEqual(events, [0]);
  time.advance(1); assert.deepEqual(events, [0, 1]);
  time.advance(900); assert.deepEqual(events, [0, 1, 2]);
  time.advance(999); assert.equal(animation.running, true); assert.deepEqual(events, [0, 1, 2]);
  time.advance(1); assert.equal(animation.running, false); assert.deepEqual(events, [0, 1, 2, 'complete']);
  assert.equal(time.pending.size, 0);
  for (const task of time.history.values()) task.callback();
  assert.deepEqual(events, [0, 1, 2, 'complete'], 'delivered callbacks cannot finish a completed run twice');
});

test('cancellation releases pending timers and ignores callbacks delivered after cancellation', () => {
  const { animation, time, events } = setup();
  animation.start(); time.advance(900);
  const stale = [...time.history.values()];
  animation.cancel(); animation.cancel();
  assert.equal(animation.running, false); assert.equal(time.pending.size, 0);
  for (const task of stale) task.callback();
  time.advance(10000);
  assert.deepEqual(events, [0, 1]);
});

test('a replacement run owns its own stages and completion even if old callbacks arrive late', () => {
  const { animation, time, events } = setup();
  const oldToken = animation.start(); time.advance(900);
  const stale = [...time.history.values()];
  const newToken = animation.start();
  assert.notEqual(newToken, oldToken); assert.equal(time.pending.size, 3);
  stale.forEach(task => task.callback());
  assert.deepEqual(events, [0, 1, 0]); assert.equal(animation.running, true);
  time.advance(2800);
  assert.deepEqual(events, [0, 1, 0, 1, 2, 'complete']); assert.equal(time.pending.size, 0);
});

test('disposal is permanent and suppresses every outstanding callback', () => {
  const { animation, time, events } = setup();
  animation.start(); const stale = [...time.history.values()];
  animation.dispose(); animation.dispose();
  stale.forEach(task => task.callback());
  assert.equal(animation.start(), false); assert.equal(animation.running, false);
  assert.equal(time.pending.size, 0); assert.deepEqual(events, [0]);
});

test('an animation can be started again after a normal completion', () => {
  const { animation, time, events } = setup();
  const first = animation.start(); time.advance(2800);
  const second = animation.start(); assert.notEqual(second, first); time.advance(2800);
  assert.deepEqual(events, [0, 1, 2, 'complete', 0, 1, 2, 'complete']);
  assert.equal(animation.running, false); assert.equal(time.pending.size, 0);
});

test('cancellation inside the initial stage never allocates later timers', () => {
  const time = clock(); let animation;
  animation = createVerificationAnimation({ ...time, onStage: () => animation.cancel() });
  animation.start();
  assert.equal(animation.running, false); assert.equal(time.pending.size, 0);
});

test('a throwing stage cancels the remaining visual work and reports its error', () => {
  const time = clock(), events = [], failure = new Error('stage rendering failed');
  const animation = createVerificationAnimation({ ...time, onStage: stage => { events.push(stage); if (stage === 1) throw failure; }, onComplete: () => events.push('complete') });
  animation.start(); const stale = [...time.history.values()];
  assert.throws(() => time.advance(900), error => error === failure);
  assert.equal(animation.running, false); assert.equal(time.pending.size, 0);
  stale.forEach(task => task.callback());
  assert.deepEqual(events, [0, 1]);
});

test('a throwing initial stage does not leave a running animation behind', () => {
  const time = clock(), failure = new Error('initial render failed');
  const animation = createVerificationAnimation({ ...time, onStage: () => { throw failure; } });
  assert.throws(() => animation.start(), error => error === failure);
  assert.equal(animation.running, false); assert.equal(time.pending.size, 0);
});
