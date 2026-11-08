import test from 'node:test';
import assert from 'node:assert/strict';
import { EXPLORE_SCENES, EXPLORE_SAMPLE, safeExploreIndex, createExplorePlayback, updateExplorePlayback } from '../dist/js/explore-model.js';

const tick = (state, ms) => updateExplorePlayback(state, { type: 'tick', ms });

test('the quick tour covers the six requested benefits in about half a minute', () => {
  assert.deepEqual(EXPLORE_SCENES.map(scene => scene.id), ['home', 'plan', 'pause', 'chat', 'box', 'partner']);
  const duration = EXPLORE_SCENES.reduce((total, scene) => total + scene.duration, 0);
  assert.ok(duration >= 25000 && duration <= 35000);
  assert.ok(EXPLORE_SCENES.every(scene => scene.duration >= 4000 && scene.copy.length < 90));
});

test('normal playback advances through the app and stops at a voluntary signup end card', () => {
  let state = createExplorePlayback();
  assert.equal(state.paused, false);
  for (let index = 0; index < EXPLORE_SCENES.length; index++) {
    assert.equal(state.index, index);
    assert.equal(state.complete, false);
    state = tick(state, EXPLORE_SCENES[index].duration);
  }
  assert.equal(state.complete, true);
  assert.equal(state.paused, true);
  assert.equal(state.index, EXPLORE_SCENES.length - 1);
  assert.equal(tick(state, 60000), state, 'a completed tour must not loop or advance to signup');
  assert.equal(updateExplorePlayback(state, { type: 'play' }), state);
});

test('a delayed frame retains elapsed time without restarting or skipping completion', () => {
  const firstTwo = EXPLORE_SCENES[0].duration + EXPLORE_SCENES[1].duration;
  const state = tick(createExplorePlayback(), firstTwo + 1234);
  assert.equal(state.index, 2);
  assert.equal(state.elapsed, 1234);
  assert.equal(tick(state, 1e8).complete, true);
});

test('pause freezes progress and resume continues from the exact point', () => {
  const moving = tick(createExplorePlayback(), 1700);
  const paused = updateExplorePlayback(moving, { type: 'pause' });
  assert.equal(tick(paused, 9000), paused);
  assert.equal(paused.elapsed, 1700);
  const resumed = updateExplorePlayback(paused, { type: 'play' });
  const next = tick(resumed, EXPLORE_SCENES[0].duration - 1700);
  assert.equal(next.index, 1);
  assert.equal(next.elapsed, 0);
  assert.equal(moving.paused, false, 'playback actions must not mutate an earlier snapshot');
});

test('manual navigation pauses the tour so a student has time to read the selected feature', () => {
  let state = tick(createExplorePlayback(), 700);
  state = updateExplorePlayback(state, { type: 'select', index: 4 });
  assert.equal(state.index, 4);
  assert.equal(state.elapsed, 0);
  assert.equal(state.paused, true);
  state = updateExplorePlayback(state, { type: 'previous' });
  assert.equal(state.index, 3);
  state = updateExplorePlayback(state, { type: 'next' });
  assert.equal(state.index, 4);
  state = updateExplorePlayback(state, { type: 'select', index: 0 });
  assert.equal(updateExplorePlayback(state, { type: 'previous' }).index, 0);
});

test('Skip finishes locally and Replay explicitly restarts the tour', () => {
  const start = tick(createExplorePlayback(), 123);
  const end = updateExplorePlayback(start, { type: 'finish' });
  assert.equal(end.complete, true);
  const previous = updateExplorePlayback(end, { type: 'previous' });
  assert.equal(previous.index, EXPLORE_SCENES.length - 1);
  assert.equal(previous.complete, false);
  assert.equal(previous.paused, true);
  assert.equal(updateExplorePlayback(previous, { type: 'next' }).complete, true);
  assert.deepEqual(updateExplorePlayback(end, { type: 'replay' }), createExplorePlayback());
});

test('reduced-motion visitors begin in manual mode and retain that preference on replay', () => {
  const state = createExplorePlayback({ reducedMotion: true });
  assert.equal(state.paused, true);
  assert.equal(tick(state, 60000), state);
  const end = updateExplorePlayback(state, { type: 'finish' });
  assert.deepEqual(updateExplorePlayback(end, { type: 'replay' }), state);
  assert.equal(updateExplorePlayback(state, { type: 'next' }).index, 1);
});

test('invalid elapsed times and scene inputs cannot produce an invalid scene or corrupt playback', () => {
  const initial = createExplorePlayback();
  for (const ms of [-1, 0, NaN, Infinity, '5000', null, undefined]) assert.equal(tick(initial, ms), initial);
  for (const index of [undefined, null, '', 'bad', NaN, Infinity, {}, true]) assert.equal(safeExploreIndex(index), 0);
  assert.equal(safeExploreIndex(-100), 0);
  assert.equal(safeExploreIndex(1000), EXPLORE_SCENES.length - 1);
  assert.equal(safeExploreIndex('2.8'), 2);
});

test('the illustrated financial story stays consistent in integer pesewas', () => {
  const s = EXPLORE_SAMPLE;
  for (const key of ['available', 'food', 'transport', 'planned', 'cushion', 'left', 'payment', 'shortfall', 'afterPayment', 'remainingCushion', 'goalSaved', 'goalTarget', 'hackPayment', 'hackPercent', 'hackSaved', 'goalAfter']) assert.ok(Number.isInteger(s[key]), `${key} stays an integer`);
  assert.equal(s.periodLabel, 'Friday');
  assert.equal(s.snapshotLabel, 'Fixed example snapshot');
  assert.equal(s.planned, s.food + s.transport);
  assert.equal(s.left, s.available - s.planned - s.cushion);
  assert.equal(s.left, 25000);
  assert.equal(s.shortfall, s.payment - s.left);
  assert.equal(s.shortfall, 5000);
  assert.equal(s.hackSaved, s.hackPayment * s.hackPercent / 100);
  assert.equal(s.hackSaved, 100, 'the example Savings Hack contributes exactly GH₵1');
  assert.equal(s.goalAfter, s.goalSaved + s.hackSaved);
  assert.equal(s.goalAfter, 25100);
});

test('playback is a read-only presentation with immutable samples and independent visitors', () => {
  assert.ok(Object.isFrozen(EXPLORE_SAMPLE));
  assert.ok(Object.isFrozen(EXPLORE_SCENES));
  assert.ok(EXPLORE_SCENES.every(Object.isFrozen));
  const first = Object.freeze(createExplorePlayback());
  const second = createExplorePlayback();
  const before = structuredClone(second);
  updateExplorePlayback(first, { type: 'next' });
  assert.deepEqual(second, before);
  assert.equal(first.index, 0);
});
