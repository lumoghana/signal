import test from 'node:test';
import assert from 'node:assert/strict';
import { createEmptyState } from '../dist/js/model.js';
import { safeRoute } from '../dist/js/navigation.js';
import { confirmFunding } from './helpers/activation-funding.js';
import { acceptSetupTerms, hasAcceptedSetupTerms } from '../dist/js/setup-terms-model.js';
import {
  ONBOARDING_STEPS, LIVENESS_PROMPTS, SAMPLE_CARD_NUMBER, createOnboardingDraft,
  updateOnboardingField, completeOnboardingStep, recordSelfieCapture,
  beginIdentityVerification, resolveIdentityVerification, confirmIdentityDetails,
  setOnboardingLogin, buildOnboardingState,
} from '../dist/js/onboarding-model.js';
import {
  createActivationDraft, activationEverydayAccount, acknowledgeCreatedAccount, fundActivation,
  addActivationBudgetItem, saveActivationBudget, completeActivation, deferActivationFunding,
} from '../dist/js/activation-model.js';

const ok = result => { assert.equal(result.ok, true, result.message); return result; };
const pin = '1234';
const credential = { version: 1, algorithm: 'PBKDF2-SHA-256', iterations: 210000, salt: 'ab'.repeat(16), verifier: 'cd'.repeat(32) };
function verifiedDraft({ accepted = true } = {}) {
  const draft = createOnboardingDraft();
  if (accepted) ok(acceptSetupTerms(draft, { accepted: true }));
  for (const step of ONBOARDING_STEPS) {
    if (step === 'name') updateOnboardingField(draft, 'name', 'Ama');
    if (step === 'code') updateOnboardingField(draft, 'code', '123456');
    if (step === 'card-number') updateOnboardingField(draft, 'ghanaCardNumber', SAMPLE_CARD_NUMBER);
    if (step === 'selfie') {
      updateOnboardingField(draft, 'consent', true);
      for (const prompt of LIVENESS_PROMPTS) ok(recordSelfieCapture(draft, prompt));
      const { attemptId } = ok(beginIdentityVerification(draft));
      ok(resolveIdentityVerification(draft, { success: true, attemptId }));
    }
    if (step === 'identity-review') ok(confirmIdentityDetails(draft));
    if (step === 'login') ok(setOnboardingLogin(draft, { username: 'ama.sequence', credential }));
    if (step === 'pin') updateOnboardingField(draft, 'pin', pin);
    if (step === 'pin-confirm') updateOnboardingField(draft, 'pinConfirm', pin);
    ok(completeOnboardingStep(draft, step));
  }
  return draft;
}

test('terms precede identity, and accepting them never bypasses the earlier identity steps', () => {
  const state = createEmptyState(), onboarding = createOnboardingDraft(), draft = { onboarding };
  const before = structuredClone(state);
  for (const step of ['name', 'card-number', 'identity-review', 'pin-confirm']) {
    assert.deepEqual(safeRoute({ section: 'onboarding', step }, state, draft), { section: 'terms' });
  }
  assert.equal(hasAcceptedSetupTerms(onboarding), false);
  assert.equal(acceptSetupTerms(onboarding, { accepted: false }).ok, false);
  assert.deepEqual(state, before);
  ok(acceptSetupTerms(onboarding, { accepted: true }));
  assert.deepEqual(safeRoute({ section: 'onboarding', step: 'identity-review' }, state, draft), { section: 'onboarding', step: 'name' });
  assert.equal(buildOnboardingState(onboarding).ok, false);
  assert.equal(onboarding.verified, false);
  assert.deepEqual(state, before);
});

test('even complete identity proof cannot create an account without current setup acceptance', () => {
  const onboarding = verifiedDraft({ accepted: false }), before = structuredClone(onboarding);
  const refused = buildOnboardingState(onboarding);
  assert.equal(refused.ok, false);
  assert.match(refused.message, /terms/i);
  assert.deepEqual(onboarding, before);
  ok(acceptSetupTerms(onboarding, { accepted: true }));
  const { state } = ok(buildOnboardingState(onboarding));
  assert.equal(hasAcceptedSetupTerms(state), true);
  assert.equal(state.onboardingDone, true);
  assert.equal(state.wallet, 0);
  assert.equal(state.transactions.length, 0);
  assert.equal(state.accounts.filter(account => account.type === 'operational').length, 1);
  assert.equal(state.accounts.filter(account => account.type === 'savings').length, 1);
});

test('account-created acknowledgement precedes funding, and confirmed funding precedes a plan', () => {
  const { state } = ok(buildOnboardingState(verifiedDraft()));
  const activation = createActivationDraft({ state }), draft = { activation }, visitor = createEmptyState();
  assert.equal(activation.step, 'account-created');
  const operational = activationEverydayAccount(activation);
  assert.equal(operational.type, 'operational');
  assert.match(operational.demoNumber, /^\d+$/);
  assert.equal(operational.accountNumber, undefined, 'a prototype demo reference must never become a bank-issued account number');
  assert.equal(state.accounts.find(account => account.type === 'operational').demoNumber, undefined, 'creating an isolated activation must not rewrite the source account');
  for (const step of ['fund', 'purpose', 'ready']) {
    assert.deepEqual(safeRoute({ section: 'activation', step }, visitor, draft), { section: 'activation', step: 'account-created' });
  }
  const before = structuredClone(activation.state);
  assert.equal(fundActivation(activation, { amount: 10000, source: 'Mobile money' }).ok, false);
  assert.equal(deferActivationFunding(activation).ok, false);
  assert.equal(addActivationBudgetItem(activation, { name: 'Food', amount: 6000 }).ok, false);
  assert.deepEqual(activation.state, before);

  ok(acknowledgeCreatedAccount(activation));
  assert.deepEqual(activation.state, before, 'acknowledgement never funds or plans money');
  assert.deepEqual(safeRoute({ section: 'activation', step: 'ready' }, visitor, draft), { section: 'activation', step: 'fund' });
  ok(confirmFunding(activation, { amount: 10000, source: 'Mobile money' }));
  assert.deepEqual(safeRoute({ section: 'activation', step: 'ready' }, visitor, draft), { section: 'activation', step: 'purpose' });
  assert.equal(completeActivation(activation).ok, false);
  ok(addActivationBudgetItem(activation, { name: 'Food', amount: 6000 }));
  ok(saveActivationBudget(activation));
  assert.deepEqual(safeRoute({ section: 'activation', step: 'ready' }, visitor, draft), { section: 'activation', step: 'ready' });
  const completed = ok(completeActivation(activation));
  assert.equal(completed.state.wallet, 10000);
  assert.equal(completed.state.budget.items[0].amount, 6000);
  assert.equal(completed.state.transactions.filter(tx => tx.type === 'income').length, 1);
  assert.equal(completed.state.termsAcceptance.version, state.termsAcceptance.version);
});
