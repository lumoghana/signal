import test from 'node:test';
import assert from 'node:assert/strict';
import { SETUP_TERMS_VERSION, hasAcceptedSetupTerms, normalizeSetupTermsAcceptance, acceptSetupTerms } from '../dist/js/setup-terms-model.js';
import { createOnboardingDraft, normalizeOnboardingDraft, persistableOnboardingDraft, buildOnboardingState, ONBOARDING_STEPS, LIVENESS_PROMPTS, SAMPLE_CARD_NUMBER, completeOnboardingStep, recordSelfieCapture, beginIdentityVerification, resolveIdentityVerification, confirmIdentityDetails, setOnboardingLogin } from '../dist/js/onboarding-model.js';
import { createEmptyState, createDemoState } from '../dist/js/model.js';
import { createActivationDraft, safeActivationStep } from '../dist/js/activation-model.js';
import { safeRoute, parentRoute, routeLabel, routeKey, compactTrail, chatReturnRoute } from '../dist/js/navigation.js';

const acceptedAt = '2026-11-08T12:00:00.000Z';
const terms = { section: 'terms' }, home = { section: 'home', page: 'home' };
const okay = result => { assert.equal(result.ok, true, result.message); return result; };
const signup = step => ({ section: 'onboarding', step });
const credential = { version: 1, algorithm: 'PBKDF2-SHA-256', iterations: 210000, salt: 'ab'.repeat(16), verifier: 'cd'.repeat(32) };
function completedIdentity({ accepted = true } = {}) {
  const draft = createOnboardingDraft();
  if (accepted) okay(acceptSetupTerms(draft, { accepted: true, now: acceptedAt }));
  draft.name = 'Ama';
  for (const step of ONBOARDING_STEPS) {
    if (step === 'code') draft.code = '123456';
    if (step === 'card-number') draft.ghanaCardNumber = SAMPLE_CARD_NUMBER;
    if (step === 'selfie') {
      draft.consent = true;
      for (const prompt of LIVENESS_PROMPTS) okay(recordSelfieCapture(draft, prompt));
      const { attemptId } = okay(beginIdentityVerification(draft));
      okay(resolveIdentityVerification(draft, { success: true, attemptId }));
    }
    if (step === 'identity-review') okay(confirmIdentityDetails(draft));
    if (step === 'login') okay(setOnboardingLogin(draft, { username: 'ama.campus', credential }));
    if (step === 'pin') draft.pin = '1234';
    if (step === 'pin-confirm') draft.pinConfirm = '1234';
    okay(completeOnboardingStep(draft, step));
  }
  return draft;
}

test('terms require an explicit acceptance and valid timestamp without clearing resumed answers', () => {
  const draft = createOnboardingDraft(); draft.name = 'Ama';
  okay(completeOnboardingStep(draft, 'name'));
  const before = structuredClone(draft);
  for (const accepted of [undefined, false, 'true', 1, {}, []]) {
    assert.equal(acceptSetupTerms(draft, { accepted, now: acceptedAt }).ok, false);
    assert.deepEqual(draft, before);
  }
  for (const now of [null, false, {}, NaN, Infinity, '', 'invalid']) {
    assert.equal(acceptSetupTerms(draft, { accepted: true, now }).ok, false);
    assert.deepEqual(draft, before);
  }
  const result = okay(acceptSetupTerms(draft, { accepted: true, now: acceptedAt }));
  assert.deepEqual(draft, { ...before, termsAcceptance: { version: SETUP_TERMS_VERSION, acceptedAt } });
  assert.notEqual(result.acceptance, draft.termsAcceptance);
  assert.equal(draft.consent, false, 'accepting setup terms never accepts camera or identity-data consent');
});

test('current acceptance can be read from a draft or a direct record while stale or malformed records fail', () => {
  const record = { version: SETUP_TERMS_VERSION, acceptedAt };
  assert.equal(hasAcceptedSetupTerms(record), true);
  assert.equal(hasAcceptedSetupTerms({ termsAcceptance: record }), true);
  for (const value of [null, undefined, [], 'accepted', true, {}, { ...record, version: 'older-version' }, { ...record, acceptedAt: 'invalid' }, { ...record, acceptedAt: '2026-11-08' }, { termsAcceptance: null }, { termsAcceptance: { ...record, acceptedAt: 1 } }]) {
    assert.equal(hasAcceptedSetupTerms(value), false);
    assert.equal(normalizeSetupTermsAcceptance(value), null);
  }
  const clone = normalizeSetupTermsAcceptance(record); assert.deepEqual(clone, record); assert.notEqual(clone, record);
});

test('normalization and safe resume storage preserve current terms separately from volatile identity proof', () => {
  const draft = completedIdentity(), before = JSON.stringify(draft);
  for (const normalize of [normalizeOnboardingDraft, persistableOnboardingDraft]) {
    const copy = normalize(JSON.parse(before));
    assert.deepEqual(copy.termsAcceptance, draft.termsAcceptance);
    assert.notEqual(copy.termsAcceptance, draft.termsAcceptance);
    assert.equal(copy.name, 'Ama'); assert.equal(copy.phoneVerified, true);
    assert.equal(hasAcceptedSetupTerms(copy), true);
  }
  assert.equal(JSON.stringify(draft), before);
  assert.equal(normalizeOnboardingDraft({ ...draft, termsAcceptance: { version: 'old', acceptedAt } }).termsAcceptance, null);
  assert.equal(persistableOnboardingDraft({ ...draft, termsAcceptance: { version: 'old', acceptedAt } }).termsAcceptance, null);
});

test('a complete identity setup cannot create an account without accepting the current terms', () => {
  const draft = completedIdentity({ accepted: false }), before = JSON.stringify(draft);
  assert.equal(buildOnboardingState(draft).ok, false);
  assert.equal(JSON.stringify(draft), before);
  draft.termsAcceptance = { version: 'old-version', acceptedAt };
  assert.equal(buildOnboardingState(draft).ok, false);
  assert.equal(draft.completed, false);
  okay(acceptSetupTerms(draft, { accepted: true, now: acceptedAt }));
  const { state } = okay(buildOnboardingState(draft));
  assert.deepEqual(state.termsAcceptance, { version: SETUP_TERMS_VERSION, acceptedAt });
  assert.notEqual(state.termsAcceptance, draft.termsAcceptance);
  assert.equal(state.wallet, 0); assert.equal(state.boxes.length, 0); assert.equal(draft.completed, true);
  assert.equal(acceptSetupTerms(draft, { accepted: true }).ok, false, 'completed signup is not silently reopened');
});

test('every unaccepted signup route including aliases leads to the standalone terms gate', () => {
  const state = createEmptyState(), draft = { onboarding: createOnboardingDraft() };
  draft.onboarding.name = 'Ama'; okay(completeOnboardingStep(draft.onboarding, 'name'));
  const before = JSON.stringify({ state, draft });
  for (const step of [...ONBOARDING_STEPS, 'details', 'identity', 'privacy', 'card-front', 'ready', 'unknown']) assert.deepEqual(safeRoute(signup(step), state, draft), terms);
  assert.deepEqual(safeRoute(signup('name'), state), terms);
  assert.deepEqual(safeRoute(terms, state, draft), terms);
  assert.equal(JSON.stringify({ state, draft }), before);
  okay(acceptSetupTerms(draft.onboarding, { accepted: true, now: acceptedAt }));
  assert.deepEqual(safeRoute(signup('pin'), state, draft), signup('phone'), 'acceptance preserves and resumes the completed name');
  assert.deepEqual(safeRoute(terms, state, draft), terms, 'accepted terms can be reviewed without an automatic next step');
  draft.onboarding.termsAcceptance.version = 'old';
  assert.deepEqual(safeRoute(signup('phone'), state, draft), terms);
});

test('preview, signed-out and active-account guards keep their account boundaries at the terms gate', () => {
  const state = createDemoState(), draft = { onboarding: createOnboardingDraft({ preview: true }) }, before = JSON.stringify(state);
  assert.deepEqual(safeRoute(terms, state, draft), terms);
  assert.deepEqual(safeRoute(signup('pin'), state, draft), terms);
  okay(acceptSetupTerms(draft.onboarding, { accepted: true, now: acceptedAt }));
  assert.deepEqual(safeRoute(signup('name'), state, draft), signup('name'));
  assert.equal(JSON.stringify(state), before);
  assert.deepEqual(safeRoute(terms, state, {}), home);
  draft.onboarding.completed = true;
  assert.deepEqual(safeRoute(terms, state, draft), home);
  state.account = { ...state.account, signedOut: true };
  assert.deepEqual(safeRoute(terms, state, draft), { section: 'life', page: 'account-access' });
});

test('unfinished activation keeps precedence over terms and signup browser entries', () => {
  const state = createEmptyState(), pending = createEmptyState(); pending.onboardingDone = true;
  const draft = { onboarding: createOnboardingDraft(), activation: createActivationDraft({ state: pending }) };
  const expected = { section: 'activation', step: safeActivationStep(draft.activation, draft.activation.step) };
  for (const route of [terms, signup('name'), signup('pin')]) assert.deepEqual(safeRoute(route, state, draft), expected);
});

test('terms are a distinct transient route before the nine identity steps with clear Back destinations', () => {
  assert.equal(ONBOARDING_STEPS.length, 9); assert.equal(ONBOARDING_STEPS.includes('terms'), false);
  assert.notEqual(routeKey(terms), routeKey(signup('name')));
  assert.deepEqual(parentRoute(signup('name')), terms);
  assert.deepEqual(parentRoute(terms), { section: 'welcome' });
  assert.equal(routeLabel(terms), 'Setup terms');
  assert.equal(compactTrail([terms, signup('name'), signup('pin')], home, { finish: true }).some(route => ['terms', 'onboarding'].includes(route.section)), false);
  assert.deepEqual(chatReturnRoute({ section: 'chat', returnTo: terms }, createDemoState()), home);
});
