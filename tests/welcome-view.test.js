import test from 'node:test';
import assert from 'node:assert/strict';
import { renderWelcome } from '../dist/js/welcome-view.js';
import { createEmptyState } from '../dist/js/model.js';
import { renderAccount } from '../dist/js/account-ui.js';
import { safeRoute } from '../dist/js/navigation.js';

const count = (html, action) => (html.match(new RegExp(`data-action="${action}"`, 'g')) || []).length;
const text = html => html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
const heading = html => text(html.match(/<h[12]\b[^>]*>([\s\S]*?)<\/h[12]>/)?.[1] || '');
const assertExample = html => assert.match(text(html), /sample account.*no real money/i, 'tour money must be explicitly identified as a sample');
const assertNoSignupGate = html => {
  assert.equal(count(html, 'start'), 0, 'Explore should demonstrate the promise without routing to signup');
  assert.equal(count(html, 'welcome-signin'), 0);
  assert.doesNotMatch(html, /<form\b|type="(?:password|tel|email)"/i);
};

test('welcome presents the approved photo and message with clear start, Explore and sign-in entries', () => {
  const html = renderWelcome();
  assert.equal(heading(html), 'Your money. Made clear.');
  assert.match(text(html), /See how today’s choices could affect your money tomorrow\./);
  assert.match(html, /src="\/assets\/student-warm-welcome\.png"/);
  assert.match(html, /aria-label="Lumo">lumo<\/span>/);
  assert.doesNotMatch(html, /lumo\.|class="dot"|orbit/);
  assert.equal(count(html, 'start'), 1);
  assert.equal(count(html, 'welcome-explore'), 1);
  assert.equal(count(html, 'welcome-signin'), 1);
  assert.equal(count(html, 'demo'), 0, 'opening Explore must not start or replace a demo account');
  assert.doesNotMatch(html, /GH₵|welcome-clarity-(?:amount|example|breakdown)|<form\b/);
  assert.match(text(html), /Interactive prototype · No real money\./);
});

test('signup preview keeps a single return to the saved account and suppresses illustrative demo routes', () => {
  for (const page of ['home', 'explore', 'impact', 'impact-extra']) {
    const html = renderWelcome({ preview: true, resume: true, page });
    assert.equal(count(html, 'signup-preview-exit'), 1);
    assert.equal(count(html, 'start'), 1);
    assert.equal(count(html, 'welcome-explore'), 0);
    assert.equal(count(html, 'welcome-impact'), 0);
    assert.equal(count(html, 'welcome-impact-extra'), 0);
    assert.equal(count(html, 'demo'), 0);
    assert.equal(count(html, 'welcome-signin'), 0);
    assert.match(text(html), /Back to my Lumo/);
    assert.match(text(html), /Continue signup/);
    assert.match(text(html), /Live camera · Demo verification · Your account stays safe\./);
    assert.doesNotMatch(html, /GH₵/);
  }
});

test('a saved tour takes precedence over resumed signup without creating a second start action', () => {
  for (const [options, label] of [
    [{ resume: true }, 'Continue signup'],
    [{ resume: true, touring: true }, 'Continue the tour'],
    [{ touring: true }, 'Continue the tour'],
    [{ preview: true, resume: true, touring: true }, 'Continue the tour'],
  ]) {
    const frozen = Object.freeze(options), html = renderWelcome(frozen);
    assert.match(html, new RegExp(`data-action="start">${label}`));
    assert.equal(count(html, 'start'), 1);
  }
  assert.equal(count(renderWelcome({ showSignIn: false }), 'welcome-signin'), 0);
});

test('Explore opens the labelled animated feature tour without a signup gate or demo reset', () => {
  const html = renderWelcome({ page: 'explore' }), copy = text(html);
  assertExample(html);
  assert.match(html, /class="lumo-explore/);
  assert.match(copy, /A quick look inside/);
  assert.equal((html.match(/data-explore-scene="\d+"/g) || []).length, 6);
  for (const control of ['skip', 'previous', 'toggle', 'next']) assert.match(html, new RegExp(`data-explore-control="${control}"`));
  assert.equal(count(html, 'welcome-impact'), 0);
  assert.equal(count(html, 'welcome-impact-extra'), 0);
  assert.equal(count(html, 'demo'), 0);
  assert.doesNotMatch(copy, /An invite to Osu|Tonight can fit|That leaves a gap/);
  assertNoSignupGate(html);
});

test('legacy example pages render the new tour rather than stranding a saved visitor in the removed story', () => {
  const tour = renderWelcome({ page: 'explore' });
  for (const page of ['impact', 'impact-extra']) {
    const html = renderWelcome({ page });
    assert.equal(html, tour);
    assertExample(html);
    assertNoSignupGate(html);
  }
});

test('every entry page has an accessible heading and the welcome image has a useful description', () => {
  for (const page of ['home', 'explore', 'impact', 'impact-extra']) {
    const html = renderWelcome({ page });
    const label = html.match(/<section\b[^>]*aria-labelledby="([^"]+)"/)?.[1];
    assert.ok(label, `${page} should name its section with the visible heading`);
    assert.match(html, new RegExp(`<h1\\b[^>]*id="${label}"`));
    assert.equal((html.match(/<h1\b/g) || []).length, 1);
  }
  assert.match(renderWelcome(), /<img\b[^>]*alt="[^"]*student[^"]*phone[^"]*"/i);
});

test('rendering every welcome page is read-only and independent of private account information', () => {
  const state = createEmptyState({ name: 'PRIVATE_NAME_9384', phone: '0249999384', campus: 'PRIVATE_CAMPUS_9384' });
  state.wallet = 983475;
  state.income = { amount: 765432, nextDate: '2099-12-31' };
  const before = structuredClone(state);
  Object.freeze(state.profile);
  Object.freeze(state.income);
  Object.freeze(state);
  for (const page of ['home', 'explore', 'impact', 'impact-extra']) {
    const options = Object.freeze({ page, state });
    const html = renderWelcome(options);
    assert.doesNotMatch(html, /PRIVATE_NAME_9384|0249999384|PRIVATE_CAMPUS_9384|2099-12-31|9,?834\.75|7,?654\.32/);
  }
  assert.deepEqual(state, before);
});

test('the welcome sign-in destination honours the existing no-saved-account guard', () => {
  const state = createEmptyState(), destination = { section: 'life', page: 'account-access' };
  assert.deepEqual(safeRoute(destination, state, {}), destination);
  const html = renderAccount({ state, draft: {} }, destination);
  assert.match(html, /No saved account/);
  assert.match(html, /data-account-resume-signup/);
  assert.doesNotMatch(html, /data-account-form="signin"|data-account-biometric-login/);
  assert.equal(state.onboardingDone, false);
});
