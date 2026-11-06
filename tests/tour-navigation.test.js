import test from 'node:test';
import assert from 'node:assert/strict';
import { createRouter } from '../dist/js/router.js';
import { routeKey, parentRoute, safeRoute } from '../dist/js/navigation.js';
import { createEmptyState, createDemoState } from '../dist/js/model.js';
import { createOnboardingDraft } from '../dist/js/onboarding-model.js';
import { createActivationDraft } from '../dist/js/activation-model.js';
import { createTourDraft, normalizeTourDraft, shouldOfferTour } from '../dist/js/tour-model.js';

const home = { section: 'home', page: 'home' };
const settings = { section: 'life', page: 'settings' };
const tour = step => ({ section: 'tour', step });
function harness(state, draft, { initial = { section: 'welcome' }, prefix = [], saved } = {}) {
  let native = [...structuredClone(prefix), null], pointer = prefix.length;
  const pending = [], renders = [];
  const history = {
    get state() { return native[pointer]; },
    pushState(value) { native = native.slice(0, pointer + 1); native.push(structuredClone(value)); pointer++; },
    replaceState(value) { native[pointer] = structuredClone(value); },
    go(delta) {
      const next = pointer + delta;
      assert.ok(next >= 0 && next < native.length, `native rewind ${delta} stays within the known history`);
      pending.push(next);
    },
  };
  const router = createRouter({ initialRoute: initial, saved, history, normalize: r => safeRoute(r, state, draft), parent: r => parentRoute(r, state, draft), key: routeKey, rootFor: () => home, onNavigate: r => renders.push(r) });
  const flush = () => {
    let limit = 30;
    while (pending.length) { assert.ok(limit-- > 0, 'navigation terminates'); pointer = pending.shift(); router.receive(history.state); }
  };
  return { router, history, flush, renders, get native() { return native; }, get pointer() { return pointer; } };
}

test('new signup can visit every tour scene without doing sample money actions', () => {
  const state = createEmptyState(), draft = { onboarding: createOnboardingDraft(), tour: createTourDraft() };
  const before = JSON.stringify(state);
  for (const step of [0, 1, 2]) assert.deepEqual(safeRoute(tour(step), state, draft), tour(step));
  assert.deepEqual(safeRoute(tour(500), state, draft), tour(2));
  assert.deepEqual(safeRoute(tour('bad'), state, draft), tour(0));
  assert.equal(JSON.stringify(state), before);
  assert.equal(draft.onboarding.completedSteps.length, 0);
});

test('signed-in accounts can replay, while stale non-preview signup tours return home', () => {
  const state = createDemoState(), draft = { tour: createTourDraft({ replay: true, returnTo: settings }) }, before = JSON.stringify(state);
  assert.deepEqual(safeRoute(tour(1), state, draft), tour(1));
  draft.tour = createTourDraft();
  assert.deepEqual(safeRoute(tour(1), state, draft), home);
  draft.onboarding = createOnboardingDraft({ preview: true });
  assert.deepEqual(safeRoute(tour(1), state, draft), tour(1));
  assert.equal(JSON.stringify(state), before);
});

test('stale skipped or finished tour history cannot reopen a deleted tour draft', () => {
  const state = createEmptyState(), draft = { onboarding: createOnboardingDraft() };
  for (const step of [0, 1, 2]) assert.deepEqual(safeRoute(tour(step), state, draft), { section: 'onboarding', step: 'name' });
  assert.deepEqual(safeRoute(tour(0), state, {}), { section: 'welcome' });
  assert.deepEqual(safeRoute(tour(0), createDemoState(), {}), home);
});

test('tour parent navigation has explicit previous scenes and replay destinations', () => {
  for (const step of [1, 2]) assert.deepEqual(parentRoute(tour(step)), tour(step - 1));
  assert.deepEqual(parentRoute(tour(0)), { section: 'welcome' });
  assert.deepEqual(parentRoute(tour(0), {}, { tour: createTourDraft({ replay: true, returnTo: settings }) }), settings);
});

test('unfinished account activation takes precedence over a stale tour entry', () => {
  const state = createEmptyState(), ready = createEmptyState(); ready.onboardingDone = true;
  const draft = { activation: createActivationDraft({ state: ready }), tour: createTourDraft() };
  assert.deepEqual(safeRoute(tour(2), state, draft), { section: 'activation', step: 'fund' });
});

test('finishing or skipping a first tour prunes its native entries and starts signup directly', () => {
  for (const status of ['completed', 'skipped']) {
    const state = createEmptyState(), draft = { onboarding: createOnboardingDraft(), tour: createTourDraft() };
    const h = harness(state, draft); h.router.initialise();
    for (const step of [0, 1, 2]) h.router.go(tour(step));
    delete draft.tour;
    const record = { schema: 1, status, timestamp: '2026-11-01T12:00:00.000Z' };
    assert.equal(shouldOfferTour({ record, onboarding: draft.onboarding }), false);
    h.router.go({ section: 'onboarding', step: 'name' }, { finish: true }); h.flush();
    assert.deepEqual(h.router.current, { section: 'onboarding', step: 'name' });
    assert.equal(h.native.some(e => e?.route?.section === 'tour'), false);
    h.history.go(-1); h.flush(); h.history.go(1); h.flush();
    assert.deepEqual(h.router.current, { section: 'onboarding', step: 'name' });
  }
});

test('replay exit preserves unrelated browser history and current account money', () => {
  const state = createDemoState(), before = JSON.stringify(state), draft = { tour: createTourDraft({ replay: true, returnTo: settings }) };
  const prefix = [{ unrelated: 'first' }, { unrelated: 'second' }];
  const h = harness(state, draft, { initial: settings, prefix }); h.router.initialise();
  for (const step of [0, 1, 2]) h.router.go(tour(step));
  delete draft.tour; h.router.go(settings, { finish: true }); h.flush();
  assert.deepEqual(h.router.current, settings);
  assert.deepEqual(h.native.slice(0, prefix.length), prefix);
  assert.equal(h.native.some(e => e?.route?.section === 'tour'), false);
  assert.equal(JSON.stringify(state), before);
});

test('session restoration keeps the tour scene and demo flags without creating signup proof', () => {
  const state = createEmptyState(), original = { onboarding: createOnboardingDraft(), tour: createTourDraft() };
  original.tour.step = 1; original.tour.paymentTried = true;
  const draft = JSON.parse(JSON.stringify(original)); draft.tour = normalizeTourDraft(draft.tour);
  const h = harness(state, draft, { initial: tour(draft.tour.step) }); h.router.initialise();
  assert.deepEqual(h.router.current, tour(1)); assert.equal(draft.tour.paymentTried, true);
  assert.deepEqual(draft.onboarding.completedSteps, []); assert.equal(state.wallet, 0);
});
