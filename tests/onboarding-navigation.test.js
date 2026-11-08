import test from 'node:test';
import assert from 'node:assert/strict';
import { createDemoState, createEmptyState } from '../dist/js/model.js';
import {
  ONBOARDING_STEPS, LIVENESS_PROMPTS, SAMPLE_CARD_NUMBER, createOnboardingDraft,
  completeOnboardingStep, recordSelfieCapture, resetCameraCaptures, resetLiveness,
  beginIdentityVerification, resolveIdentityVerification, confirmIdentityDetails, setOnboardingLogin
} from '../dist/js/onboarding-model.js';
import { acceptSetupTerms } from '../dist/js/setup-terms-model.js';
import { parentRoute, safeRoute, compactTrail, routeKey } from '../dist/js/navigation.js';
const demoCredential = { version: 1, algorithm: 'PBKDF2-SHA-256', iterations: 210000, salt: 'ab'.repeat(16), verifier: 'cd'.repeat(32) };
const signup = step => ({ section: 'onboarding', step });
const home = { section: 'home', page: 'home' };
const okay = result => { assert.equal(result.ok, true, result.message); return result; };
const complete = (draft, step) => okay(completeOnboardingStep(draft, step));
function reachCard(preview = false) {
  const draft = createOnboardingDraft({ preview }); okay(acceptSetupTerms(draft, { accepted: true })); draft.name = 'Ama';
  complete(draft, 'name'); complete(draft, 'phone');
  draft.code = '123456'; complete(draft, 'code'); return draft;
}
function reachSelfie(preview = false) {
  const draft = reachCard(preview); draft.ghanaCardNumber = SAMPLE_CARD_NUMBER;
  complete(draft, 'card-number'); draft.consent = true; return draft;
}
function reachReview(preview = false) {
  const draft = reachSelfie(preview);
  for (const prompt of LIVENESS_PROMPTS) okay(recordSelfieCapture(draft, prompt));
  const { attemptId } = okay(beginIdentityVerification(draft));
  okay(resolveIdentityVerification(draft, { success: true, attemptId }));
  complete(draft, 'selfie'); return draft;
}
function reachPin(preview = false) {
  const draft = reachReview(preview); okay(confirmIdentityDetails(draft));
  complete(draft, 'identity-review'); okay(setOnboardingLogin(draft, { username: 'ama.campus', credential: demoCredential })); complete(draft, 'login'); return draft;
}

test('later browser entries cannot bypass separate name, phone, code or card pages', () => {
  const state = createEmptyState();
  assert.deepEqual(safeRoute(signup('pin'), state), { section: 'terms' });
  const draft = createOnboardingDraft(); okay(acceptSetupTerms(draft, { accepted: true })); draft.name = 'Ama'; complete(draft, 'name');
  assert.deepEqual(safeRoute(signup('selfie'), state, { onboarding: draft }), signup('phone'));
  assert.deepEqual(safeRoute(signup('unknown-step'), state, { onboarding: draft }), signup('phone'));
  assert.deepEqual(safeRoute(signup('name'), state, { onboarding: draft }), signup('name'));
  complete(draft, 'phone');
  assert.deepEqual(safeRoute(signup('identity-review'), state, { onboarding: draft }), signup('code'));
  draft.code = '123456'; complete(draft, 'code');
  assert.deepEqual(safeRoute(signup('selfie'), state, { onboarding: draft }), signup('card-number'));
  draft.ghanaCardNumber = SAMPLE_CARD_NUMBER; complete(draft, 'card-number');
  assert.deepEqual(safeRoute(signup('pin'), state, { onboarding: draft }), signup('selfie'));
});

test('nine focused pages have distinct identities and direct previous destinations', () => {
  assert.deepEqual(ONBOARDING_STEPS, ['name', 'phone', 'code', 'card-number', 'selfie', 'identity-review', 'login', 'pin', 'pin-confirm']);
  assert.equal(new Set(ONBOARDING_STEPS.map(step => routeKey(signup(step)))).size, ONBOARDING_STEPS.length);
  for (let index = 1; index < ONBOARDING_STEPS.length; index++) assert.deepEqual(parentRoute(signup(ONBOARDING_STEPS[index])), signup(ONBOARDING_STEPS[index - 1]));
  assert.deepEqual(parentRoute(signup('name')), { section: 'terms' });
});

test('legacy combined and card-photo routes resolve to focused pages without dead screens', () => {
  const state = createEmptyState(), draft = reachPin();
  const aliases = {
    details: 'name', identity: 'card-number', privacy: 'card-number',
    'card-front': 'card-number', 'card-back': 'card-number',
    'face-intro': 'selfie', 'face-check': 'selfie', 'identity-result': 'identity-review',
    income: 'pin', campus: 'pin', buffer: 'pin', date: 'pin', accounts: 'pin', ready: 'pin'
  };
  const before = JSON.stringify({ state, draft });
  for (const [oldStep, newStep] of Object.entries(aliases)) {
    assert.deepEqual(safeRoute(signup(oldStep), state, { onboarding: draft }), signup(newStep));
    assert.equal(routeKey(signup(oldStep)), routeKey(signup(newStep)));
  }
  assert.equal(JSON.stringify({ state, draft }), before, 'route migration does not alter answers or money');
});

test('capture, verification and details confirmation guard separate destinations', () => {
  const state = createEmptyState(), draft = reachSelfie();
  for (const prompt of LIVENESS_PROMPTS) {
    okay(recordSelfieCapture(draft, prompt));
    assert.deepEqual(safeRoute(signup('identity-review'), state, { onboarding: draft }), signup('selfie'));
    assert.deepEqual(safeRoute(signup('pin'), state, { onboarding: draft }), signup('selfie'));
  }
  const { attemptId } = okay(beginIdentityVerification(draft));
  assert.deepEqual(safeRoute(signup('pin'), state, { onboarding: draft }), signup('selfie'));
  okay(resolveIdentityVerification(draft, { success: true, attemptId }));
  assert.equal(draft.identityConfirmed, false);
  assert.deepEqual(safeRoute(signup('identity-review'), state, { onboarding: draft }), signup('selfie'));
  complete(draft, 'selfie');
  assert.deepEqual(safeRoute(signup('identity-review'), state, { onboarding: draft }), signup('identity-review'));
  assert.deepEqual(safeRoute(signup('pin'), state, { onboarding: draft }), signup('identity-review'));
  okay(confirmIdentityDetails(draft)); complete(draft, 'identity-review');
  assert.deepEqual(safeRoute(signup('pin'), state, { onboarding: draft }), signup('login'));
  okay(setOnboardingLogin(draft, { username: 'ama.campus', credential: demoCredential })); complete(draft, 'login');
  assert.deepEqual(safeRoute(signup('pin'), state, { onboarding: draft }), signup('pin'));
});

test('confirmation has a distinct page and cannot open before accepting the first PIN', () => {
  const state = createEmptyState(), draft = reachPin();
  assert.notEqual(routeKey(signup('pin')), routeKey(signup('pin-confirm')));
  assert.deepEqual(parentRoute(signup('pin-confirm')), signup('pin'));
  assert.deepEqual(safeRoute(signup('pin-confirm'), state, { onboarding: draft }), signup('pin'));
  draft.pin = '1234'; complete(draft, 'pin');
  assert.deepEqual(safeRoute(signup('pin-confirm'), state, { onboarding: draft }), signup('pin-confirm'));
  assert.equal(completeOnboardingStep(draft, 'pin-confirm').ok, false);
  draft.pinConfirm = '1234'; complete(draft, 'pin-confirm');
  assert.deepEqual(safeRoute(signup('pin-confirm'), state, { onboarding: draft }), signup('pin-confirm'));
});

test('a selfie retake returns to camera while preserving the accepted card number', () => {
  const state = createEmptyState(), draft = reachPin(); okay(resetLiveness(draft));
  assert.equal(draft.ghanaCardNumber, SAMPLE_CARD_NUMBER); assert.equal(draft.consent, true);
  assert.deepEqual(draft.completedSteps, ['name', 'phone', 'code', 'card-number']);
  assert.deepEqual(safeRoute(signup('pin'), state, { onboarding: draft }), signup('selfie'));
  assert.deepEqual(safeRoute(signup('identity-review'), state, { onboarding: draft }), signup('selfie'));
  assert.deepEqual(safeRoute(signup('card-number'), state, { onboarding: draft }), signup('card-number'));
});

test('media loss rewinds to the card page without repeating the accepted hello', () => {
  const state = createEmptyState(), draft = reachPin(); okay(resetCameraCaptures(draft));
  assert.equal(draft.ghanaCardNumber, ''); assert.equal(draft.verificationRecord, null); assert.equal(draft.phoneVerified, true);
  assert.deepEqual(draft.completedSteps, ['name', 'phone', 'code']);
  for (const target of ['selfie', 'identity-review', 'pin']) assert.deepEqual(safeRoute(signup(target), state, { onboarding: draft }), signup('card-number'));
  assert.deepEqual(safeRoute(signup('code'), state, { onboarding: draft }), signup('code'));
});

test('a failed verification remains at selfies and cannot open returned details', () => {
  const state = createEmptyState(), draft = reachSelfie();
  for (const prompt of LIVENESS_PROMPTS) okay(recordSelfieCapture(draft, prompt));
  const { attemptId } = okay(beginIdentityVerification(draft));
  okay(resolveIdentityVerification(draft, { success: false, attemptId }));
  for (const target of ['identity-review', 'pin']) assert.deepEqual(safeRoute(signup(target), state, { onboarding: draft }), signup('selfie'));
});

test('the paged signup preview preserves the signed-in financial account', () => {
  const state = createDemoState(), before = JSON.stringify(state), draft = reachCard(true);
  assert.deepEqual(safeRoute({ section: 'welcome' }, state, { onboarding: draft }), { section: 'welcome', page: 'home' });
  assert.deepEqual(safeRoute(signup('card-number'), state, { onboarding: draft }), signup('card-number'));
  assert.deepEqual(safeRoute(signup('pin'), state, { onboarding: draft }), signup('card-number'));
  assert.deepEqual(safeRoute(home, state, { onboarding: draft }), home);
  assert.equal(JSON.stringify(state), before);
});

test('completed or absent previews cannot reopen signup through old browser entries', () => {
  const state = createDemoState(), draft = createOnboardingDraft({ preview: true }); draft.completed = true;
  for (const route of [{ section: 'welcome' }, ...ONBOARDING_STEPS.map(signup), signup('details'), signup('card-front'), signup('identity')]) {
    assert.deepEqual(safeRoute(route, state, { onboarding: draft }), home);
    assert.deepEqual(safeRoute(route, state, {}), home);
  }
});

test('finishing a paged preview removes every signup page from the prior trail', () => {
  const settings = { section: 'life', page: 'settings' };
  const trail = compactTrail([home, settings, { section: 'welcome' }, ...ONBOARDING_STEPS.map(signup)], settings, { finish: true });
  assert.deepEqual(trail, [home]); assert.equal(trail.some(route => ['welcome', 'onboarding'].includes(route.section)), false);
});
