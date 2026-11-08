import test from 'node:test';
import assert from 'node:assert/strict';
import { createDemoState, createEmptyState } from '../dist/js/model.js';
import { createOnboardingDraft } from '../dist/js/onboarding-model.js';
import { safeRoute, parentRoute, routeKey, compactTrail } from '../dist/js/navigation.js';

const pages = ['home', 'explore'];
const welcome = page => ({ section: 'welcome', page });
const home = { section: 'home', page: 'home' };

test('new students can explore every welcome example without changing their account or signup answers', () => {
  const state = createEmptyState();
  const draft = { onboarding: createOnboardingDraft() };
  draft.onboarding.name = 'Ama';
  const before = JSON.stringify({ state, draft });

  for (const page of pages) assert.deepEqual(safeRoute(welcome(page), state, draft), welcome(page));

  assert.equal(new Set(pages.map(page => routeKey(welcome(page)))).size, pages.length);
  assert.equal(JSON.stringify({ state, draft }), before);
});

test('missing and unknown welcome destinations return to the welcome page', () => {
  const state = createEmptyState();
  for (const page of [undefined, null, '', 'payment', 'constructor', 1]) {
    assert.deepEqual(safeRoute(welcome(page), state), welcome('home'));
    assert.equal(routeKey(welcome(page)), routeKey(welcome('home')));
  }
});

test('the animated tour returns directly to welcome without relying on browser history', () => {
  assert.deepEqual(parentRoute(welcome('explore')), welcome('home'));
  assert.deepEqual(parentRoute(welcome('impact')), welcome('home'));
  assert.deepEqual(parentRoute(welcome('impact-extra')), welcome('home'));

  assert.deepEqual(compactTrail(pages.map(welcome), welcome('explore')), [welcome('home')]);
});

test('saved accounts cannot reopen the new-student example through an old welcome route', () => {
  const state = createDemoState();
  const before = JSON.stringify(state);
  for (const page of pages) assert.deepEqual(safeRoute(welcome(page), state), home);
  assert.equal(JSON.stringify(state), before);
});

test('signup previews on existing accounts retain Welcome but cannot expose the replacement-demo example', () => {
  const state = createDemoState();
  const draft = { onboarding: createOnboardingDraft({ preview: true }) };
  const before = JSON.stringify({ state, draft });

  for (const page of pages) assert.deepEqual(safeRoute(welcome(page), state, draft), welcome('home'));
  assert.deepEqual(safeRoute({ section: 'onboarding', step: 'name' }, state, draft), { section: 'terms' });
  assert.equal(JSON.stringify({ state, draft }), before);

  const newStudent = createEmptyState();
  assert.deepEqual(safeRoute(welcome('explore'), newStudent, draft), welcome('explore'));
});

test('completing a saved-account signup preview restores the existing account guard', () => {
  const state = createDemoState();
  const draft = { onboarding: createOnboardingDraft({ preview: true }) };
  draft.onboarding.completed = true;
  for (const page of pages) assert.deepEqual(safeRoute(welcome(page), state, draft), home);
});

test('signed-out accounts still require account access, including during a signup preview', () => {
  const state = createDemoState();
  state.account = { ...state.account, signedOut: true };
  const draft = { onboarding: createOnboardingDraft({ preview: true }) };
  const before = JSON.stringify({ state, draft });
  for (const page of pages) {
    assert.deepEqual(safeRoute(welcome(page), state, draft), { section: 'life', page: 'account-access' });
  }
  assert.equal(JSON.stringify({ state, draft }), before);
});

test('finishing signup removes all welcome example pages from the prior trail', () => {
  const settings = { section: 'life', page: 'settings' };
  const trail = [home, settings, ...pages.map(welcome), { section: 'onboarding', step: 'name' }];
  assert.deepEqual(compactTrail(trail, settings, { finish: true }), [home]);
});

test('old decision-example destinations resolve to the animated tour', () => {
  const state = createEmptyState();
  for (const page of ['impact', 'impact-extra']) {
    assert.deepEqual(safeRoute(welcome(page), state), welcome('explore'));
    assert.equal(routeKey(welcome(page)), routeKey(welcome('explore')));
  }
});
