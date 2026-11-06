import test from 'node:test';
import assert from 'node:assert/strict';
import { webcrypto } from 'node:crypto';
import { getSummary, saveState } from '../dist/js/model.js';
import { createLoginCredential, derivePasswordProof } from '../dist/js/login-credentials.js';
import { renderOnboarding } from '../dist/js/onboarding.js';
import { ONBOARDING_SCHEMA, ONBOARDING_STEPS, LIVENESS_PROMPTS, SAMPLE_CARD_NUMBER, SAMPLE_IDENTITY_DETAILS, beginIdentityVerification, resolveIdentityVerification, cancelIdentityVerification, confirmIdentityDetails, createOnboardingDraft, normalizeOnboardingDraft, persistableOnboardingDraft, updateOnboardingField, validateIdentityNumber, validateOnboardingStep, completeOnboardingStep, recordSelfieCapture, resetCameraCaptures, resetLiveness, firstIncompleteOnboardingStep, safeOnboardingStep, canonicalOnboardingStep, setOnboardingLogin, buildOnboardingState } from '../dist/js/onboarding-model.js';

const demoCredential = { version: 1, algorithm: 'PBKDF2-SHA-256', iterations: 210000, salt: 'ab'.repeat(16), verifier: 'cd'.repeat(32) };
const okay = result => { assert.equal(result.ok, true, result.message); return result; };
function captureAll(draft) { for (const prompt of LIVENESS_PROMPTS) okay(recordSelfieCapture(draft, prompt)); }
function verify(draft, success = true) { const { attemptId } = okay(beginIdentityVerification(draft)); return okay(resolveIdentityVerification(draft, { success, attemptId })); }
function through(draft, last) {
  for (const step of ONBOARDING_STEPS) {
    if (step === 'name') updateOnboardingField(draft, 'name', 'Ama');
    if (step === 'code') updateOnboardingField(draft, 'code', '123456');
    if (step === 'card-number') updateOnboardingField(draft, 'ghanaCardNumber', SAMPLE_CARD_NUMBER);
    if (step === 'selfie') { updateOnboardingField(draft, 'consent', true); captureAll(draft); verify(draft); }
    if (step === 'identity-review') okay(confirmIdentityDetails(draft));
    if (step === 'login') okay(setOnboardingLogin(draft, { username: 'ama.campus', credential: demoCredential }));
    if (step === 'pin') updateOnboardingField(draft, 'pin', '1234');
    if (step === 'pin-confirm') updateOnboardingField(draft, 'pinConfirm', '1234');
    okay(completeOnboardingStep(draft, step));
    if (step === last) break;
  }
  return draft;
}
function cameraReady() { const draft = through(createOnboardingDraft(), 'card-number'); updateOnboardingField(draft, 'consent', true); return draft; }

test('signup gives name, phone, card number, selfies and review their own guarded pages', () => {
  const draft = createOnboardingDraft();
  assert.equal(ONBOARDING_SCHEMA, 8); assert.equal(draft.schema, ONBOARDING_SCHEMA);
  assert.deepEqual(ONBOARDING_STEPS, ['name', 'phone', 'code', 'card-number', 'selfie', 'identity-review', 'login', 'pin', 'pin-confirm']);
  assert.equal(firstIncompleteOnboardingStep(draft), 'name'); assert.equal(draft.currentStep, 'name');
  assert.equal(safeOnboardingStep(undefined, 'pin'), 'name'); assert.equal(safeOnboardingStep({}, 'selfie'), 'name');
  assert.equal(completeOnboardingStep(draft, 'pin').ok, false); assert.equal(buildOnboardingState(draft).ok, false);
  assert.equal(createOnboardingDraft({ preview: true }).preview, true);
  for (const field of ['card', 'income', 'date', 'buffer']) assert.equal(Object.hasOwn(draft, field), false);
});

test('the name page validates only the display name, independently of the phone page', () => {
  const draft = createOnboardingDraft(); draft.phone = '';
  for (const value of ['', 'A', '123', '*&', 'A'.repeat(41)]) { updateOnboardingField(draft, 'name', value); assert.ok(validateOnboardingStep(draft, 'name')); }
  updateOnboardingField(draft, 'name', 'Ama');
  assert.equal(validateOnboardingStep(draft, 'name'), ''); assert.equal(okay(completeOnboardingStep(draft, 'name')).next, 'phone');
  assert.equal(firstIncompleteOnboardingStep(draft), 'phone');
});

test('a Ghanaian phone must be accepted on its own page before the demo code', () => {
  const draft = through(createOnboardingDraft(), 'name');
  for (const value of ['', '0200', '024.000.0000', '+1 212 555 0100']) { updateOnboardingField(draft, 'phone', value); assert.ok(validateOnboardingStep(draft, 'phone')); }
  updateOnboardingField(draft, 'phone', '+233 24 000 0000');
  assert.equal(okay(completeOnboardingStep(draft, 'phone')).next, 'code');
  assert.equal(completeOnboardingStep(draft, 'code').ok, false); assert.equal(draft.phoneVerified, false);
});

test('wrong OTP fails atomically and the accepted code is bound to the current phone', () => {
  const draft = through(createOnboardingDraft(), 'phone'); updateOnboardingField(draft, 'code', '654321');
  const before = JSON.stringify(draft);
  assert.equal(completeOnboardingStep(draft, 'code').ok, false); assert.equal(JSON.stringify(draft), before); assert.equal(draft.phoneVerified, false);
  updateOnboardingField(draft, 'code', '123456');
  assert.equal(okay(completeOnboardingStep(draft, 'code')).next, 'card-number');
  assert.equal(draft.verifiedPhone, '0240000000'); assert.equal(firstIncompleteOnboardingStep(draft), 'card-number');
});

test('the Ghana Card page checks format without asking for camera consent or claiming NIA verification', () => {
  for (const value of ['', '123456789', 'GHA-12345678-1', 'GHA-123456789-12', 'USA-123456789-1', null, undefined, {}]) assert.ok(validateIdentityNumber(value));
  for (const value of [SAMPLE_CARD_NUMBER, 'GHA-123456789-1', ' gha-123456789-1 ']) assert.equal(validateIdentityNumber(value), '');
  const draft = through(createOnboardingDraft(), 'code'); updateOnboardingField(draft, 'ghanaCardNumber', SAMPLE_CARD_NUMBER);
  assert.equal(draft.consent, false); assert.equal(okay(completeOnboardingStep(draft, 'card-number')).next, 'selfie');
  assert.deepEqual(draft.liveness.completed, []); assert.equal(draft.verificationRecord, null);
});

test('captures require accepted name, phone, OTP and the separate card-number page', () => {
  const draft = through(createOnboardingDraft(), 'code');
  updateOnboardingField(draft, 'ghanaCardNumber', SAMPLE_CARD_NUMBER); updateOnboardingField(draft, 'consent', true);
  const before = JSON.stringify(draft);
  assert.equal(recordSelfieCapture(draft, 'centre').ok, false); assert.equal(beginIdentityVerification(draft).ok, false); assert.equal(JSON.stringify(draft), before);
  okay(completeOnboardingStep(draft, 'card-number')); okay(recordSelfieCapture(draft, 'centre'));
});

test('camera consent is required on the selfie page and never bypassed by an accepted card number', () => {
  const draft = through(createOnboardingDraft(), 'card-number');
  assert.equal(recordSelfieCapture(draft, 'centre').ok, false); assert.equal(beginIdentityVerification(draft).ok, false);
  updateOnboardingField(draft, 'consent', true); okay(recordSelfieCapture(draft, 'centre'));
  assert.equal(draft.captureResumeNotice, false);
});

test('three capture acknowledgements run in order and cannot complete the selfie page before verification', () => {
  const draft = cameraReady();
  for (const prompt of ['turn', 'blink', 'unknown']) { const before = JSON.stringify(draft); assert.equal(recordSelfieCapture(draft, prompt).ok, false); assert.equal(JSON.stringify(draft), before); }
  assert.equal(okay(recordSelfieCapture(draft, 'centre')).nextPrompt, 'turn'); assert.equal(recordSelfieCapture(draft, 'centre').ok, false);
  assert.equal(okay(recordSelfieCapture(draft, 'turn')).nextPrompt, 'blink'); assert.equal(draft.selfieCaptured, false);
  assert.equal(completeOnboardingStep(draft, 'selfie').ok, false);
  assert.equal(okay(recordSelfieCapture(draft, 'blink')).nextPrompt, null); assert.equal(draft.selfieCaptured, true);
  assert.equal(recordSelfieCapture(draft, 'blink').ok, false); assert.equal(completeOnboardingStep(draft, 'selfie').ok, false);
  assert.equal(safeOnboardingStep(draft, 'pin'), 'selfie');
});

test('successful verification and confirmed details open login before the transaction PIN', () => {
  const draft = cameraReady(); captureAll(draft);
  const { attemptId } = okay(beginIdentityVerification(draft));
  assert.equal(draft.verificationStatus, 'checking'); assert.equal(draft.verificationRecord, null);
  assert.equal(confirmIdentityDetails(draft).ok, false); assert.equal(completeOnboardingStep(draft, 'selfie').ok, false);
  okay(resolveIdentityVerification(draft, { success: true, attemptId }));
  assert.deepEqual(draft.verificationRecord, { mode: 'simulation', cardNumber: SAMPLE_CARD_NUMBER, ...SAMPLE_IDENTITY_DETAILS });
  assert.equal(draft.identityConfirmed, false); assert.equal(draft.verified, false);
  assert.equal(confirmIdentityDetails(draft).ok, false, 'successful result still needs the selfie completion boundary');
  assert.equal(okay(completeOnboardingStep(draft, 'selfie')).next, 'identity-review');
  assert.equal(safeOnboardingStep(draft, 'pin'), 'identity-review'); assert.equal(completeOnboardingStep(draft, 'identity-review').ok, false);
  okay(confirmIdentityDetails(draft)); assert.equal(okay(completeOnboardingStep(draft, 'identity-review')).next, 'login');
  assert.equal(draft.verified, true); assert.equal(safeOnboardingStep(draft, 'pin'), 'login');
});

test('verification cannot start early and a failed check keeps review and PIN locked', () => {
  const draft = cameraReady();
  for (const prompt of LIVENESS_PROMPTS) { const before = JSON.stringify(draft); assert.equal(beginIdentityVerification(draft).ok, false); assert.equal(JSON.stringify(draft), before); okay(recordSelfieCapture(draft, prompt)); }
  const first = okay(beginIdentityVerification(draft)); okay(resolveIdentityVerification(draft, { success: false, attemptId: first.attemptId }));
  assert.equal(draft.verificationStatus, 'failed'); assert.equal(draft.verificationRecord, null);
  assert.equal(confirmIdentityDetails(draft).ok, false); assert.equal(completeOnboardingStep(draft, 'selfie').ok, false);
  assert.equal(safeOnboardingStep(draft, 'identity-review'), 'selfie');
  const second = okay(beginIdentityVerification(draft)); assert.notEqual(second.attemptId, first.attemptId);
  const before = JSON.stringify(draft); assert.equal(resolveIdentityVerification(draft, { success: true, attemptId: first.attemptId }).ok, false); assert.equal(JSON.stringify(draft), before);
  okay(resolveIdentityVerification(draft, { success: true, attemptId: second.attemptId })); okay(completeOnboardingStep(draft, 'selfie')); okay(confirmIdentityDetails(draft));
});

test('retakes and number, consent or phone edits reject pending verification responses', () => {
  for (const mutate of [draft => resetLiveness(draft), draft => updateOnboardingField(draft, 'ghanaCardNumber', 'GHA-123456789-1'), draft => updateOnboardingField(draft, 'consent', false), draft => updateOnboardingField(draft, 'phone', '020 000 0000'), draft => resetCameraCaptures(draft)]) {
    const draft = cameraReady(); captureAll(draft); const { attemptId } = okay(beginIdentityVerification(draft));
    mutate(draft); const before = JSON.stringify(draft);
    assert.equal(draft.verificationStatus, 'idle'); assert.equal(draft.verificationRecord, null); assert.equal(draft.identityConfirmed, false);
    assert.equal(resolveIdentityVerification(draft, { success: true, attemptId }).ok, false); assert.equal(JSON.stringify(draft), before);
    assert.equal(confirmIdentityDetails(draft).ok, false); assert.equal(buildOnboardingState(draft).ok, false);
  }
});

test('cancelled verification restarts with retained photos without accepting a stale callback', () => {
  const draft = cameraReady(); captureAll(draft);
  const first = okay(beginIdentityVerification(draft)); okay(cancelIdentityVerification(draft, first.attemptId));
  assert.equal(draft.selfieCaptured, true); assert.equal(draft.ghanaCardNumber, SAMPLE_CARD_NUMBER); assert.equal(draft.completedSteps.includes('card-number'), true);
  const next = okay(beginIdentityVerification(draft)), before = JSON.stringify(draft);
  assert.equal(cancelIdentityVerification(draft, first.attemptId).ok, false); assert.equal(resolveIdentityVerification(draft, { success: true }).ok, false);
  assert.equal(resolveIdentityVerification(draft, { success: true, attemptId: first.attemptId }).ok, false); assert.equal(JSON.stringify(draft), before);
  okay(resolveIdentityVerification(draft, { success: true, attemptId: next.attemptId })); const succeeded = JSON.stringify(draft);
  assert.equal(resolveIdentityVerification(draft, { success: false, attemptId: next.attemptId }).ok, false); assert.equal(JSON.stringify(draft), succeeded);
});

test('returned record and capture binding cannot be transplanted to another identity', () => {
  const original = through(createOnboardingDraft(), 'selfie');
  for (const record of [{ ...original.verificationRecord, fullName: 'Other person' }, { ...original.verificationRecord, cardNumber: 'GHA-123456789-1' }, { ...original.verificationRecord, mode: 'nia' }]) {
    const draft = { ...original, identityConfirmed: false, verificationRecord: record };
    assert.equal(confirmIdentityDetails(draft).ok, false); assert.ok(validateOnboardingStep(draft, 'selfie'));
  }
  assert.ok(validateOnboardingStep({ ...original, ghanaCardNumber: 'GHA-123456789-1' }, 'selfie'));
  const malformed = normalizeOnboardingDraft({ ...original, liveness: { completed: ['centre', 'blink'], passed: true } });
  assert.deepEqual(malformed.liveness.completed, ['centre']); assert.equal(safeOnboardingStep(malformed, 'pin'), 'selfie');
});

test('changing the card number revokes its accepted page and every later proof', () => {
  const draft = through(createOnboardingDraft(), 'pin-confirm'); updateOnboardingField(draft, 'ghanaCardNumber', 'GHA-123456789-1');
  assert.deepEqual(draft.completedSteps, ['name', 'phone', 'code']); assert.deepEqual(draft.liveness.completed, []);
  assert.equal(draft.verificationRecord, null); assert.equal(draft.identityConfirmed, false); assert.equal(draft.verified, false);
  assert.equal(firstIncompleteOnboardingStep(draft), 'card-number'); assert.equal(buildOnboardingState(draft).ok, false); assert.equal(draft.phoneVerified, true);
});

test('retaking selfies preserves the separate accepted number page and camera agreement', () => {
  const draft = through(createOnboardingDraft(), 'pin-confirm'); okay(resetLiveness(draft));
  assert.equal(draft.ghanaCardNumber, SAMPLE_CARD_NUMBER); assert.equal(draft.consent, true);
  assert.deepEqual(draft.completedSteps, ['name', 'phone', 'code', 'card-number']); assert.equal(draft.currentStep, 'selfie');
  assert.equal(firstIncompleteOnboardingStep(draft), 'selfie'); assert.equal(draft.verificationRecord, null); assert.equal(draft.identityConfirmed, false);
  assert.equal(recordSelfieCapture(draft, 'blink').ok, false); captureAll(draft); verify(draft); okay(completeOnboardingStep(draft, 'selfie'));
});

test('equivalent number formatting keeps proof while withdrawing consent revokes selfies onward', () => {
  const draft = through(createOnboardingDraft(), 'identity-review'); updateOnboardingField(draft, 'ghanaCardNumber', ' gha-000000000-0 ');
  assert.equal(draft.selfieCaptured, true); assert.equal(draft.verified, true);
  updateOnboardingField(draft, 'consent', false);
  assert.equal(draft.verified, false); assert.deepEqual(draft.completedSteps, ['name', 'phone', 'code', 'card-number']); assert.equal(firstIncompleteOnboardingStep(draft), 'selfie');
});

test('phone changes retain the name page but invalidate OTP, card and subsequent checks', () => {
  const draft = through(createOnboardingDraft(), 'identity-review'); updateOnboardingField(draft, 'phone', '+233 24 000 0000');
  assert.equal(draft.phoneVerified, true); assert.equal(draft.verified, true);
  updateOnboardingField(draft, 'phone', '020 000 0000');
  assert.deepEqual(draft.completedSteps, ['name']); assert.equal(firstIncompleteOnboardingStep(draft), 'phone'); assert.equal(draft.phoneVerified, false);
  assert.equal(draft.verificationRecord, null); okay(completeOnboardingStep(draft, 'phone')); assert.equal(firstIncompleteOnboardingStep(draft), 'code');
});

test('display-name edits return to that page without pretending the legal identity changed', () => {
  const draft = through(createOnboardingDraft(), 'pin-confirm'); updateOnboardingField(draft, 'name', 'A');
  assert.equal(firstIncompleteOnboardingStep(draft), 'name'); assert.equal(draft.phoneVerified, true); assert.equal(draft.verified, true);
  assert.equal(buildOnboardingState(draft).ok, false); updateOnboardingField(draft, 'name', 'Senam'); okay(completeOnboardingStep(draft, 'name'));
  assert.equal(firstIncompleteOnboardingStep(draft), null); const { state } = okay(buildOnboardingState(draft));
  assert.equal(state.profile.name, 'Senam'); assert.equal(state.profile.legalName, SAMPLE_IDENTITY_DETAILS.fullName);
});

test('PIN and confirmation are separate gates and changes revoke the appropriate completion', () => {
  const draft = through(createOnboardingDraft(), 'login');
  for (const pin of ['', '4321']) {
    updateOnboardingField(draft, 'pin', pin);
    assert.ok(validateOnboardingStep(draft, 'pin')); assert.equal(completeOnboardingStep(draft, 'pin').ok, false);
  }
  updateOnboardingField(draft, 'pin', '1234');
  assert.equal(validateOnboardingStep(draft, 'pin'), '');
  assert.equal(completeOnboardingStep(draft, 'pin-confirm').ok, false, 'confirmation cannot skip accepting the first PIN');
  assert.equal(okay(completeOnboardingStep(draft, 'pin')).next, 'pin-confirm');
  assert.equal(firstIncompleteOnboardingStep(draft), 'pin-confirm');
  assert.equal(buildOnboardingState(draft).ok, false, 'one accepted PIN field does not finish signup');
  for (const pinConfirm of ['', '4321']) {
    updateOnboardingField(draft, 'pinConfirm', pinConfirm);
    assert.ok(validateOnboardingStep(draft, 'pin-confirm')); assert.equal(completeOnboardingStep(draft, 'pin-confirm').ok, false);
    assert.equal(draft.completedSteps.includes('pin'), true, 'editing confirmation preserves the accepted PIN');
  }
  updateOnboardingField(draft, 'pinConfirm', '1234'); assert.equal(okay(completeOnboardingStep(draft, 'pin-confirm')).next, null);
  assert.equal(firstIncompleteOnboardingStep(draft), null);
  updateOnboardingField(draft, 'pinConfirm', '4321'); assert.equal(firstIncompleteOnboardingStep(draft), 'pin-confirm');
  updateOnboardingField(draft, 'pinConfirm', '1234'); okay(completeOnboardingStep(draft, 'pin-confirm'));
  updateOnboardingField(draft, 'pin', '12'); assert.equal(draft.pinConfirm, ''); assert.equal(firstIncompleteOnboardingStep(draft), 'pin');
  assert.equal(draft.completedSteps.includes('pin-confirm'), false);
});

test('sign-in credentials form a separate guarded step before transaction authorisation', () => {
  const draft = through(createOnboardingDraft(), 'identity-review');
  assert.equal(safeOnboardingStep(draft, 'pin'), 'login');
  draft.pin = '1234';
  assert.equal(completeOnboardingStep(draft, 'pin').ok, false, 'the transaction PIN cannot substitute for a login password');
  assert.equal(setOnboardingLogin(createOnboardingDraft(), { username: 'ama.campus', credential: demoCredential }).ok, false);
  assert.equal(setOnboardingLogin(draft, { username: 'a', credential: demoCredential }).ok, false);
  assert.equal(setOnboardingLogin(draft, { username: 'ama.campus', credential: { ...demoCredential, verifier: '' } }).ok, false);
  okay(setOnboardingLogin(draft, { username: ' Ama.Campus ', credential: demoCredential }));
  assert.equal(draft.login.username, 'ama.campus'); assert.equal(draft.pin, '');
  assert.equal(okay(completeOnboardingStep(draft, 'login')).next, 'pin');
  assert.equal(safeOnboardingStep(draft, 'pin'), 'pin');
});

test('signup stores a derived password verifier without any raw password or extra credential fields', async () => {
  const draft = through(createOnboardingDraft(), 'identity-review');
  const password = 'OnlyFictional!26';
  const credential = await createLoginCredential(password, { crypto: webcrypto });
  okay(setOnboardingLogin(draft, { username: 'ama.campus', credential: { ...credential, password } }));
  okay(completeOnboardingStep(draft, 'login'));
  draft.password = password; draft.login.password = password;
  const saved = persistableOnboardingDraft(draft);
  assert.equal(JSON.stringify(saved).includes(password), false);
  assert.equal(saved.login.credential.verifier, credential.verifier);
  const normal = normalizeOnboardingDraft(draft);
  assert.equal(JSON.stringify(normal).includes(password), false);
  const complete = through(createOnboardingDraft(), 'pin-confirm'); complete.login = saved.login;
  const { state } = okay(buildOnboardingState(complete));
  assert.equal(state.account.login.username, 'ama.campus');
  assert.equal(await derivePasswordProof(password, state.account.login.credential, { crypto: webcrypto }), credential.verifier);
  assert.equal(JSON.stringify(state).includes(password), false);
  assert.equal(state.settings.pin, '1234');
});

test('login and transaction PIN pages clearly explain their separate jobs', () => {
  const draft = through(createOnboardingDraft(), 'identity-review');
  const ctx = { draft: { onboarding: draft } };
  const login = renderOnboarding(ctx, { step: 'login' });
  assert.match(login, /username and password for signing in/);
  assert.match(login, /Never use a real password/);
  assert.match(login, /data-onb-login="password"/);
  assert.doesNotMatch(login, /data-onb-field="password"/);
  assert.match(renderOnboarding(ctx, { step: 'pin' }), /Your password is for signing in/);
  assert.match(renderOnboarding(ctx, { step: 'pin-confirm' }), /authorise money moves/);
});

test('older separate-page drafts preserve only accepted name, phone and bound OTP', () => {
  for (const schema of [2, 3, 6, 7]) {
    const migrated = normalizeOnboardingDraft({ schema, name: 'Senam', phone: '020 000 0000', completedSteps: ['name', 'phone', 'code'], code: '123456', phoneVerified: true, verifiedPhone: '0200000000', preview: true, consent: true, verified: true, pin: '1234', ghanaCardNumber: SAMPLE_CARD_NUMBER, campus: 'KNUST' });
    assert.equal(migrated.schema, 8); assert.deepEqual(migrated.completedSteps, ['name', 'phone', 'code']); assert.equal(migrated.currentStep, 'card-number');
    assert.equal(migrated.preview, true); assert.equal(migrated.campus, 'KNUST'); assert.equal(migrated.phoneVerified, true);
    assert.equal(migrated.consent, false); assert.equal(migrated.ghanaCardNumber, ''); assert.equal(migrated.pin, ''); assert.equal(migrated.verified, false);
  }
});

test('schema 4 and 5 combined details migrate into accepted individual pages without reusing identity proof', () => {
  for (const schema of [4, 5]) {
    const legacy = { schema, name: 'Ama', phone: '024 000 0000', completedSteps: ['details', 'code', 'identity', 'pin'], code: '123456', phoneVerified: true, verifiedPhone: '0240000000', preview: true, consent: true, ghanaCardNumber: SAMPLE_CARD_NUMBER, selfieCaptured: true, liveness: { completed: [...LIVENESS_PROMPTS], passed: true }, verificationStatus: 'success', verificationRecord: { mode: 'simulation', cardNumber: SAMPLE_CARD_NUMBER, ...SAMPLE_IDENTITY_DETAILS }, identityConfirmed: true, pin: '1234' };
    const draft = normalizeOnboardingDraft(legacy);
    assert.deepEqual(draft.completedSteps, ['name', 'phone', 'code']); assert.equal(draft.currentStep, 'card-number'); assert.equal(draft.preview, true);
    assert.equal(draft.verificationStatus, 'idle'); assert.equal(draft.verificationRecord, null); assert.equal(draft.selfieCaptured, false); assert.equal(draft.identityConfirmed, false);
    assert.equal(draft.ghanaCardNumber, ''); assert.equal(draft.pin, '');
    const unbound = normalizeOnboardingDraft({ ...legacy, verifiedPhone: '0200000000' });
    assert.deepEqual(unbound.completedSteps, ['name', 'phone']); assert.equal(unbound.phoneVerified, false);
  }
});

test('unaccepted and unknown legacy answers remain editable without claiming completed pages', () => {
  for (const source of [{ name: 'Ama', phone: '024 000 0000', preview: true, verified: true }, { schema: 5, name: 'Ama', phone: '024 000 0000', completedSteps: [] }]) {
    const draft = normalizeOnboardingDraft(source); assert.equal(draft.name, 'Ama'); assert.deepEqual(draft.completedSteps, []); assert.equal(draft.consent, false); assert.equal(safeOnboardingStep(draft, 'pin'), 'name');
  }
  const invalidName = normalizeOnboardingDraft({ schema: 5, name: 'A', phone: '024 000 0000', code: '123456', phoneVerified: true, verifiedPhone: '0240000000', completedSteps: ['details', 'code'] });
  assert.deepEqual(invalidName.completedSteps, []);
});

test('current-schema normalization preserves live proof and does not mutate its source', () => {
  const original = through(createOnboardingDraft(), 'pin-confirm'), before = JSON.stringify(original), draft = normalizeOnboardingDraft(original);
  assert.deepEqual(draft.liveness.completed, [...LIVENESS_PROMPTS]); assert.equal(draft.selfieCaptured, true); assert.equal(firstIncompleteOnboardingStep(draft), null);
  assert.equal(safeOnboardingStep(draft, 'ready'), 'pin'); assert.notEqual(draft.liveness, original.liveness); assert.notEqual(draft.verificationRecord, original.verificationRecord);
  assert.equal(JSON.stringify(original), before);
});

test('saved copies remove every raw identity value, photo and result while keeping accepted intro pages', () => {
  const original = through(createOnboardingDraft({ preview: true }), 'pin-confirm'), raw = 'PRIVATE-JPEG-data:image/jpeg;base64,abc';
  original.photo = raw; original.captureUrl = 'blob:private'; original.liveness.frames = [raw];
  const before = JSON.stringify(original), saved = persistableOnboardingDraft(original), serialized = JSON.stringify(saved);
  for (const secret of [SAMPLE_CARD_NUMBER, SAMPLE_IDENTITY_DETAILS.dateOfBirth, SAMPLE_IDENTITY_DETAILS.fullName, raw, 'blob:']) assert.equal(serialized.includes(secret), false);
  assert.deepEqual(saved.completedSteps, ['name', 'phone', 'code']); assert.equal(saved.currentStep, 'card-number'); assert.equal(saved.captureResumeNotice, true);
  assert.equal(saved.verificationRecord, null); assert.equal(saved.verificationStatus, 'idle'); assert.equal(saved.verificationAttempt, 0); assert.equal(saved.identityConfirmed, false);
  assert.equal(saved.phoneVerified, true); assert.equal(saved.preview, true); assert.equal(JSON.stringify(original), before);
  assert.equal(safeOnboardingStep(normalizeOnboardingDraft(JSON.parse(serialized)), 'pin'), 'card-number');
  original.completed = true; const complete = persistableOnboardingDraft(original);
  assert.equal(complete.ghanaCardNumber, ''); assert.equal(complete.capturedNumber, ''); assert.equal(complete.selfieCaptured, false); assert.equal(complete.verificationRecord, null);
});

test('pending, successful and failed verification records are all excluded from resume storage', () => {
  for (const status of ['checking', 'success', 'failed']) {
    const original = cameraReady(); captureAll(original); const { attemptId } = okay(beginIdentityVerification(original));
    if (status !== 'checking') okay(resolveIdentityVerification(original, { success: status === 'success', attemptId }));
    if (status === 'success') { okay(completeOnboardingStep(original, 'selfie')); okay(confirmIdentityDetails(original)); }
    const before = JSON.stringify(original), saved = persistableOnboardingDraft(original), serialized = JSON.stringify(saved);
    assert.equal(serialized.includes(SAMPLE_CARD_NUMBER), false); assert.equal(serialized.includes(SAMPLE_IDENTITY_DETAILS.fullName), false);
    assert.equal(saved.verificationStatus, 'idle'); assert.equal(saved.verificationRecord, null); assert.equal(saved.identityConfirmed, false); assert.equal(JSON.stringify(original), before);
  }
});

test('exit clears the raw number even before captures and rewinds only the identity portion', () => {
  const draft = cameraReady(); assert.equal(okay(resetCameraCaptures(draft)).reset, true);
  assert.deepEqual(draft.completedSteps, ['name', 'phone', 'code']); assert.equal(draft.currentStep, 'card-number'); assert.equal(draft.phoneVerified, true);
  assert.equal(draft.ghanaCardNumber, ''); assert.equal(draft.capturedNumber, ''); assert.equal(firstIncompleteOnboardingStep(draft), 'card-number');
  const before = JSON.stringify(draft); assert.equal(okay(resetCameraCaptures(draft)).reset, false); assert.equal(JSON.stringify(draft), before);
});

test('legacy routes have stable focused replacements and still clamp to the earliest missing proof', () => {
  const draft = through(createOnboardingDraft(), 'code');
  assert.equal(canonicalOnboardingStep('details'), 'name'); assert.equal(safeOnboardingStep(draft, 'details'), 'name');
  for (const step of ['identity', 'privacy', 'card-front', 'card-back']) { assert.equal(canonicalOnboardingStep(step), 'card-number'); assert.equal(safeOnboardingStep(draft, step), 'card-number'); }
  for (const step of ['face-intro', 'face-check']) { assert.equal(canonicalOnboardingStep(step), 'selfie'); assert.equal(safeOnboardingStep(draft, step), 'card-number'); }
  assert.equal(canonicalOnboardingStep('identity-result'), 'identity-review');
  for (const step of ['income', 'campus', 'buffer', 'accounts', 'ready']) { assert.equal(canonicalOnboardingStep(step), 'pin'); assert.equal(safeOnboardingStep(draft, step), 'card-number'); }
  assert.equal(canonicalOnboardingStep('not-a-screen'), null);
});

test('malformed proof never creates an account or bypasses a required page', () => {
  const original = through(createOnboardingDraft(), 'pin-confirm');
  for (const changed of [{ completedSteps: ['name', 'phone', 'code', 'pin'] }, { verified: false }, { consent: false }, { selfieCaptured: false }, { identityConfirmed: false }, { verificationStatus: 'checking' }, { verificationRecord: null }, { ghanaCardNumber: '' }, { verifiedPhone: '0200000000' }, { liveness: { completed: ['blink', 'turn', 'centre'], passed: true } }]) assert.equal(buildOnboardingState({ ...original, ...changed }).ok, false);
});

test('nine accepted pages create two empty accounts once using the confirmed legal name', () => {
  const draft = through(createOnboardingDraft(), 'pin-confirm'), { state } = okay(buildOnboardingState(draft));
  assert.equal(state.onboardingDone, true); assert.equal(state.profile.name, 'Ama'); assert.equal(state.profile.campus, 'Your campus'); assert.equal(state.profile.legalName, SAMPLE_IDENTITY_DETAILS.fullName);
  assert.ok(state.accounts.every(account => account.holderName === SAMPLE_IDENTITY_DETAILS.fullName)); assert.deepEqual(state.accounts.map(account => account.type), ['operational', 'savings']);
  assert.equal(state.verification.sampleIdentity, true); assert.equal(state.verification.detailsConfirmed, true); assert.equal(state.verification.mode, 'simulation'); assert.equal(state.verification.capture, 'live-camera'); assert.equal(state.verification.method, 'ghana-card-number');
  assert.equal(state.settings.pin, '1234'); assert.equal(state.buffer, 0); assert.equal(state.wallet, 0); assert.equal(state.income.amount, 0);
  for (const key of ['boxes', 'externalBalances', 'transactions']) assert.deepEqual(state[key], []);
  const summary = getSummary(state); assert.equal(summary.available, 0); assert.equal(summary.total, 0); assert.equal(summary.expected, 0);
  for (const secret of [SAMPLE_CARD_NUMBER, SAMPLE_IDENTITY_DETAILS.dateOfBirth, 'capturedNumber']) assert.equal(JSON.stringify(state).includes(secret), false);
  const oldStorage = globalThis.localStorage; let saved; globalThis.localStorage = { setItem(key, value) { saved = value; } };
  try { assert.equal(saveState(state), true); assert.ok(saved); } finally { if (oldStorage === undefined) delete globalThis.localStorage; else globalThis.localStorage = oldStorage; }
  assert.equal(draft.completed, true); assert.equal(buildOnboardingState(draft).ok, false); assert.equal(completeOnboardingStep(draft, 'pin').ok, false);
  assert.equal(resetLiveness(draft).ok, false); assert.equal(resetCameraCaptures(draft).ok, false); assert.equal(recordSelfieCapture(draft, 'centre').ok, false);
});

test('missing or malformed draft shapes fail all gated actions safely', () => {
  for (const draft of [undefined, null, {}, { schema: ONBOARDING_SCHEMA }]) {
    assert.equal(completeOnboardingStep(draft, 'name').ok, false); assert.equal(recordSelfieCapture(draft, 'centre').ok, false);
    assert.equal(resetLiveness(draft).ok, false); assert.equal(resetCameraCaptures(draft).ok, false); assert.equal(buildOnboardingState(draft).ok, false);
    assert.equal(beginIdentityVerification(draft).ok, false); assert.equal(resolveIdentityVerification(draft, { success: true, attemptId: 1 }).ok, false); assert.equal(confirmIdentityDetails(draft).ok, false); assert.equal(cancelIdentityVerification(draft).ok, false);
    assert.equal(safeOnboardingStep(draft, 'pin'), 'name');
  }
});


test('personal greetings escape typed names and keep Lux clear of identity checks', () => {
  const d = createOnboardingDraft(); d.name = '<img src=x onerror=alert(1)>';
  const ctx = { draft: { onboarding: d } };
  const phone = renderOnboarding(ctx, { step: 'phone' });
  assert.match(phone, /Nice to meet/);
  assert.match(phone, /&lt;img/);
  assert.doesNotMatch(phone, /<img src=x/);
  assert.match(phone, /aria-hidden="true"><img src="\/assets\/lux-chat-2d.webp"/);
  for (const step of ['selfie', 'identity-review']) assert.doesNotMatch(renderOnboarding(ctx, { step }), /onb-lux-greeting/);
  assert.equal(ONBOARDING_STEPS.length, 9);
});
