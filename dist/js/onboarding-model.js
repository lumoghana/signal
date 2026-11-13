import { createEmptyState } from './model.js';
import { normalizeUsername, validUsername, validLoginCredential } from './login-credentials.js';
import { hasAcceptedSetupTerms, normalizeSetupTermsAcceptance } from './setup-terms-model.js';

/** Camera capture is local; number lookup and identity verification remain simulated. */
export const ONBOARDING_SCHEMA = 8;
export const ONBOARDING_STEPS = Object.freeze(['name', 'phone', 'code', 'card-number', 'selfie', 'identity-review', 'login', 'pin', 'pin-confirm']);
export const LIVENESS_PROMPTS = Object.freeze(['centre', 'turn', 'blink']);
export const SAMPLE_CARD_NUMBER = 'GHA-000000000-0';
export const SAMPLE_IDENTITY_DETAILS = Object.freeze({ fullName: 'Ama Mensah', dateOfBirth: '2005-04-15', nationality: 'Ghanaian', sex: 'Female' });
export const DEMO_CODE_LIFETIME = 5 * 60 * 1000;
export const DEMO_CODE_COOLDOWN = 30 * 1000;
export const DEMO_CODE_ATTEMPTS = 5;
const object = value => !!value && typeof value === 'object' && !Array.isArray(value);
const text = value => typeof value === 'string' ? value : '';
const fail = message => ({ ok: false, message });
const good = (message, extra = {}) => ({ ok: true, message, ...extra });
const indexOf = step => ONBOARDING_STEPS.indexOf(step);
const fields = new Set(['name', 'phone', 'code', 'ghanaCardNumber', 'consent', 'pin', 'pinConfirm']);
const numberKey = value => text(value).trim().toUpperCase();
const safeLogin = login => ({ username: normalizeUsername(login.username), credential: Object.fromEntries(['version', 'algorithm', 'iterations', 'salt', 'verifier'].map(key => [key, login.credential[key]])) });
const phoneKey = value => {
  if (typeof value !== 'string' || !/^[+\d\s()-]+$/.test(value)) return '';
  const digits = value.replace(/\D/g, '');
  if (/^0\d{9}$/.test(digits)) return digits;
  return /^233\d{9}$/.test(digits) ? '0' + digits.slice(3) : '';
};
const validName = value => (text(value).trim().match(/\p{L}/gu) || []).length >= 2 && text(value).trim().length <= 40;
const active = draft => object(draft) && draft.schema === ONBOARDING_SCHEMA && !draft.completed
  && object(draft.liveness) && Array.isArray(draft.liveness.completed) && Array.isArray(draft.completedSteps);
const facePassed = draft => draft.selfieCaptured === true && draft.liveness?.passed === true
  && draft.liveness.completed?.length === LIVENESS_PROMPTS.length
  && LIVENESS_PROMPTS.every((prompt, index) => draft.liveness.completed[index] === prompt)
  && !validateIdentityNumber(draft.ghanaCardNumber) && draft.capturedNumber === numberKey(draft.ghanaCardNumber);

/** Format validation only. It does not check a number with the NIA. */
export function validateIdentityNumber(value) {
  return /^GHA-\d{9}-\d$/.test(numberKey(value)) ? '' : 'Use the format GHA-000000000-0, or use the demo number.';
}

export function createOnboardingDraft({ preview = false } = {}) {
  return {
    schema: ONBOARDING_SCHEMA, captureMode: 'live-camera', name: '', phone: '024 000 0000',
    code: '', phoneVerified: false, verifiedPhone: '', otp: { issuedAt: 0, expiresAt: 0, attempts: 0, lockedUntil: 0, phone: '' }, ghanaCardNumber: '', capturedNumber: '',
    consent: false, liveness: { completed: [], passed: false }, selfieCaptured: false,
    captureResumeNotice: false, verified: false, verificationStatus: 'idle', verificationAttempt: 0,
    verificationRecord: null, identityConfirmed: false, campus: 'Your campus', login: null, pin: '', pinConfirm: '',
    completedSteps: [], preview: !!preview, completed: false, currentStep: 'name', termsAcceptance: null,
  };
}

export function canonicalOnboardingStep(requested) {
  if (ONBOARDING_STEPS.includes(requested)) return requested;
  if (requested === 'details') return 'name';
  if (['identity', 'privacy', 'card-front', 'card-back'].includes(requested)) return 'card-number';
  if (['face-intro', 'face-check'].includes(requested)) return 'selfie';
  if (requested === 'identity-result') return 'identity-review';
  if (['campus', 'income', 'date', 'buffer', 'accounts', 'ready'].includes(requested)) return 'pin';
  return null;
}

export function normalizeOnboardingDraft(input) {
  const source = object(input) ? input : {};
  const draft = createOnboardingDraft({ preview: source.preview === true });
  draft.termsAcceptance = normalizeSetupTermsAcceptance(source);
  for (const key of ['name', 'phone', 'campus']) if (typeof source[key] === 'string') draft[key] = source[key];
  if (source.schema !== ONBOARDING_SCHEMA) {
    // Preserve accepted introductions and a bound demo OTP, never older identity proof.
    if ([2, 3, 4, 5, 6, 7].includes(source.schema)) {
      const done = Array.isArray(source.completedSteps) ? source.completedSteps : [];
      const acceptedCode = source.phoneVerified === true && source.code === '123456'
        && !!phoneKey(draft.phone) && source.verifiedPhone === phoneKey(draft.phone);
      const combined = [4, 5].includes(source.schema) && done.includes('details');
      const acceptedName = validName(draft.name) && (combined || done.includes('name') || acceptedCode);
      const acceptedPhone = acceptedName && !!phoneKey(draft.phone) && (combined || done.includes('phone') || acceptedCode);
      if (acceptedName) draft.completedSteps.push('name');
      if (acceptedPhone) draft.completedSteps.push('phone');
      if (acceptedPhone && acceptedCode) {
        draft.code = '123456'; draft.phoneVerified = true; draft.verifiedPhone = phoneKey(draft.phone);
        draft.completedSteps.push('code');
      }
    }
    draft.currentStep = firstIncomplete(draft) || 'pin';
    return draft;
  }
  for (const key of ['code', 'verifiedPhone', 'ghanaCardNumber', 'capturedNumber', 'pin', 'pinConfirm']) draft[key] = text(source[key]);
  if (object(source.login) && validUsername(source.login.username) && validLoginCredential(source.login.credential)) {
    draft.login = safeLogin(source.login);
  }
  for (const key of ['phoneVerified', 'consent', 'selfieCaptured', 'captureResumeNotice', 'verified', 'identityConfirmed', 'completed']) draft[key] = source[key] === true;
  if (object(source.otp)) draft.otp = { issuedAt: Number(source.otp.issuedAt) || 0, expiresAt: Number(source.otp.expiresAt) || 0, attempts: Math.max(0, Math.min(DEMO_CODE_ATTEMPTS, Number(source.otp.attempts) || 0)), lockedUntil: Number(source.otp.lockedUntil) || 0, phone: phoneKey(source.otp.phone) };
  const prompts = Array.isArray(source.liveness?.completed) ? source.liveness.completed : [];
  for (let i = 0; i < LIVENESS_PROMPTS.length && prompts[i] === LIVENESS_PROMPTS[i]; i++) draft.liveness.completed.push(prompts[i]);
  draft.liveness.passed = source.liveness?.passed === true && draft.liveness.completed.length === LIVENESS_PROMPTS.length;
  draft.completedSteps = Array.isArray(source.completedSteps) ? [...new Set(source.completedSteps.filter(step => ONBOARDING_STEPS.includes(step)))] : [];
  draft.verificationStatus = ['idle', 'checking', 'success', 'failed', 'pending', 'attention', 'already-linked'].includes(source.verificationStatus) ? source.verificationStatus : 'idle';
  draft.verificationAttempt = Number.isSafeInteger(source.verificationAttempt) && source.verificationAttempt >= 0 ? source.verificationAttempt : 0;
  if (object(source.verificationRecord)) draft.verificationRecord = { mode: text(source.verificationRecord.mode), cardNumber: text(source.verificationRecord.cardNumber), ...Object.fromEntries(Object.keys(SAMPLE_IDENTITY_DETAILS).map(key => [key, text(source.verificationRecord[key])])) };
  draft.currentStep = canonicalOnboardingStep(source.currentStep) || 'name';
  return draft;
}

function clearIdentityResult(draft) {
  draft.verificationAttempt = Number.isSafeInteger(draft.verificationAttempt) && draft.verificationAttempt < Number.MAX_SAFE_INTEGER ? draft.verificationAttempt + 1 : 1;
  draft.verificationStatus = 'idle'; draft.verificationRecord = null; draft.identityConfirmed = false; draft.verified = false;
  draft.completedSteps = draft.completedSteps.filter(step => indexOf(step) < indexOf('selfie'));
}
function validVerificationRecord(draft) {
  const record = draft.verificationRecord;
  return draft.verificationStatus === 'success' && object(record) && record.mode === 'simulation'
    && record.cardNumber === numberKey(draft.ghanaCardNumber) && record.cardNumber === draft.capturedNumber
    && Object.entries(SAMPLE_IDENTITY_DETAILS).every(([key, value]) => record[key] === value);
}

function invalidateFrom(draft, step) {
  const index = indexOf(step);
  draft.completedSteps = draft.completedSteps.filter(done => indexOf(done) >= 0 && indexOf(done) < index);
  if (index <= indexOf('code')) { draft.phoneVerified = false; draft.verifiedPhone = ''; }
  if (index <= indexOf('selfie')) {
    draft.liveness = { completed: [], passed: false }; draft.selfieCaptured = false;
    draft.capturedNumber = ''; clearIdentityResult(draft);
  }
  draft.completed = false;
}

export function updateOnboardingField(draft, key, value) {
  if (!active(draft) || !fields.has(key) || Object.is(draft[key], value)) return draft;
  const previous = draft[key];
  draft[key] = key === 'ghanaCardNumber' ? numberKey(value) : value;
  if (key === 'phone' && phoneKey(previous) !== phoneKey(value)) { invalidateFrom(draft, 'phone'); draft.otp = { issuedAt: 0, expiresAt: 0, attempts: 0, lockedUntil: 0, phone: '' }; }
  else if (key === 'code') invalidateFrom(draft, 'code');
  else if (key === 'ghanaCardNumber' && numberKey(previous) !== numberKey(value)) invalidateFrom(draft, 'card-number');
  else if (key === 'consent' && value !== true) invalidateFrom(draft, 'selfie');
  else if (key === 'pin' || key === 'pinConfirm') {
    invalidateFrom(draft, key === 'pin' ? 'pin' : 'pin-confirm');
    if (key === 'pin') draft.pinConfirm = '';
  } else if (key === 'name') draft.completedSteps = draft.completedSteps.filter(step => step !== 'name');
  return draft;
}

/** Accept a derived verifier only; raw passwords never belong to a signup draft. */
export function setOnboardingLogin(draft, { username, credential } = {}) {
  if (!active(draft) || earlierError(draft, 'login')) return fail('Confirm your details before setting up sign-in.');
  const name = normalizeUsername(username);
  if (!validUsername(name)) return fail('Choose 3–30 letters, numbers, dots, underscores or hyphens.');
  if (!validLoginCredential(credential)) return fail('Create a demo password before continuing.');
  invalidateFrom(draft, 'login');
  draft.login = safeLogin({ username: name, credential });
  draft.pin = ''; draft.pinConfirm = '';
  return good('Your sign-in details are ready.');
}

function issueDemoCode(draft, now = Date.now()) {
  draft.otp = { issuedAt: now, expiresAt: now + DEMO_CODE_LIFETIME, attempts: 0, lockedUntil: 0, phone: phoneKey(draft.phone) };
  draft.code = ''; draft.phoneVerified = false; draft.verifiedPhone = '';
}
export function demoCodeError(draft, now = Date.now()) {
  if (draft.phoneVerified && draft.verifiedPhone === phoneKey(draft.phone)) return '';
  const otp = draft.otp;
  if (!otp || otp.phone !== phoneKey(draft.phone) || !otp.expiresAt) return 'Request a fresh demo code for this number.';
  if (otp.lockedUntil > now) return 'A few tries too many. Wait a minute, then request a fresh demo code.';
  if (otp.attempts >= DEMO_CODE_ATTEMPTS) return 'Request a fresh demo code before trying again.';
  if (otp.expiresAt <= now) return 'That demo code has expired. Request a fresh one.';
  return '';
}
export function resendOnboardingCode(draft, { now = Date.now() } = {}) {
  if (!active(draft) || !phoneKey(draft.phone) || earlierError(draft, 'code')) return fail('Confirm your demo number before requesting a code.');
  if (draft.otp?.lockedUntil > now) return fail('Wait a minute before requesting another demo code.');
  if (draft.otp?.issuedAt && now - draft.otp.issuedAt < DEMO_CODE_COOLDOWN && draft.otp.expiresAt > now) return fail('Give it 30 seconds before requesting another demo code.');
  invalidateFrom(draft, 'code'); issueDemoCode(draft, now);
  return good('Fresh demo code: 123456. No SMS was sent.');
}
/** The UI records attempts separately so route validation never changes state. */
export function attemptOnboardingCode(draft, { now = Date.now() } = {}) {
  if (!active(draft) || earlierError(draft, 'code')) return fail('Confirm your name and number first.');
  const unavailable = demoCodeError(draft, now);
  if (unavailable) return fail(unavailable);
  if (draft.code === '123456') return good('Demo code accepted.');
  draft.otp.attempts += 1;
  if (draft.otp.attempts >= DEMO_CODE_ATTEMPTS) { draft.otp.lockedUntil = now + 60 * 1000; return fail('A few tries too many. Wait a minute, then request a fresh demo code.'); }
  return fail('Use 123456 for this demo. ' + (DEMO_CODE_ATTEMPTS - draft.otp.attempts) + ' tries left.');
}
export function expireOnboardingCode(draft) {
  if (!active(draft) || draft.phoneVerified || !draft.otp?.issuedAt) return fail('Request a demo code first.');
  draft.otp.expiresAt = Date.now() - 1;
  return good('Expired-code scenario selected. Request a fresh demo code to continue.');
}

export function validateOnboardingStep(draft, step) {
  if (!object(draft) || !ONBOARDING_STEPS.includes(step)) return 'Start setup from your name.';
  if (step === 'name' && !validName(draft.name)) return 'Use a name with at least two letters, up to 40 characters.';
  if (step === 'phone' && !phoneKey(draft.phone)) return 'Use a Ghanaian demo number, like 024 000 0000.';
  if (step === 'code') {
    const otpError = demoCodeError(draft);
    if (otpError) return otpError;
    if (draft.code !== '123456' || !phoneKey(draft.phone)) return 'Use 123456 for this simulated text message.';
  }
  if (step === 'card-number') return validateIdentityNumber(draft.ghanaCardNumber);
  if (['selfie', 'identity-review'].includes(step)) {
    const numberError = validateIdentityNumber(draft.ghanaCardNumber);
    if (numberError) return numberError;
    if (draft.consent !== true) return 'Confirm that the camera is live and verification is simulated.';
    if (!facePassed(draft)) return 'Capture all three guided selfies before continuing.';
    if (!validVerificationRecord(draft)) return draft.verificationStatus === 'checking' ? 'Wait for Ghana Card demo verification to finish.' : 'Complete Ghana Card demo verification before continuing.';
    if (step === 'identity-review' && draft.identityConfirmed !== true) return 'Confirm the returned Ghana Card details before setting up sign-in.';
  }
  if (step === 'login' && (!object(draft.login) || !validUsername(draft.login.username) || !validLoginCredential(draft.login.credential))) return 'Create your username and demo password before continuing.';
  if (step === 'pin' && (typeof draft.pin !== 'string' || !/^\d{4}$/.test(draft.pin))) return 'Use four digits for your test transaction PIN.';
  if (step === 'pin-confirm' && (typeof draft.pin !== 'string' || !/^\d{4}$/.test(draft.pin) || draft.pinConfirm !== draft.pin)) return 'Confirm the same four-digit transaction PIN.';
  return '';
}

function proofValid(draft, step) {
  if (!draft.completedSteps?.includes(step) || validateOnboardingStep(draft, step)) return false;
  if (step === 'code') return draft.phoneVerified === true && draft.verifiedPhone === phoneKey(draft.phone);
  if (step === 'identity-review') return draft.verified === true;
  return true;
}
function firstIncomplete(draft) { return ONBOARDING_STEPS.find(step => !proofValid(draft, step)) || null; }
function earlierError(draft, step) {
  return ONBOARDING_STEPS.slice(0, indexOf(step)).some(previous => !proofValid(draft, previous)) ? 'Finish the earlier setup step before continuing.' : '';
}

export function firstIncompleteOnboardingStep(input) { return firstIncomplete(normalizeOnboardingDraft(input)); }
export function safeOnboardingStep(input, requested) {
  const draft = normalizeOnboardingDraft(input), first = firstIncomplete(draft), target = canonicalOnboardingStep(requested);
  if (!target) return first || 'pin';
  return first && indexOf(target) > indexOf(first) ? first : target;
}

export function completeOnboardingStep(draft, step) {
  if (!active(draft)) return fail('This setup is already complete. Return to Lumo to continue.');
  if (!ONBOARDING_STEPS.includes(step)) return fail('Choose a valid setup step.');
  const error = earlierError(draft, step) || validateOnboardingStep(draft, step);
  if (error) return fail(error);
  if (step === 'phone' && !draft.phoneVerified && (draft.otp?.phone !== phoneKey(draft.phone) || draft.otp.expiresAt <= Date.now() && draft.otp.lockedUntil <= Date.now())) issueDemoCode(draft);
  if (step === 'code') { draft.phoneVerified = true; draft.verifiedPhone = phoneKey(draft.phone); }
  if (step === 'identity-review') draft.verified = true;
  if (!draft.completedSteps.includes(step)) draft.completedSteps.push(step);
  const next = ONBOARDING_STEPS[indexOf(step) + 1] || null;
  draft.currentStep = next || 'pin-confirm';
  return good('Step complete.', { next });
}

/** Call only after a successful live camera snapshot. No biometric detection is performed. */
export function recordSelfieCapture(draft, prompt) {
  if (!active(draft) || earlierError(draft, 'selfie')) return fail('Confirm your details and demo code before starting the camera check.');
  const numberError = validateIdentityNumber(draft.ghanaCardNumber);
  if (numberError) return fail(numberError);
  if (draft.consent !== true) return fail('Confirm camera consent before taking your selfies.');
  if (LIVENESS_PROMPTS[draft.liveness.completed.length] !== prompt) return fail('Follow the selfie prompts in order.');
  if (draft.capturedNumber && draft.capturedNumber !== numberKey(draft.ghanaCardNumber)) return fail('Your card number changed. Retake the selfie check.');
  draft.capturedNumber = numberKey(draft.ghanaCardNumber);
  draft.liveness.completed.push(prompt);
  draft.liveness.passed = draft.liveness.completed.length === LIVENESS_PROMPTS.length;
  draft.selfieCaptured = draft.liveness.passed;
  draft.captureResumeNotice = false;
  return good('Guided selfie captured.', { nextPrompt: LIVENESS_PROMPTS[draft.liveness.completed.length] || null });
}


/** Begin a simulated lookup only after all three camera captures. The token binds delayed results. */
export function beginIdentityVerification(draft) {
  if (!active(draft) || earlierError(draft, 'selfie')) return fail('Confirm your details and demo code before verification.');
  if (draft.consent !== true || !facePassed(draft)) return fail('Complete all three guided selfies before Ghana Card demo verification.');
  clearIdentityResult(draft);
  draft.verificationStatus = 'checking';
  return good('Checking the Ghana Card demo record.', { attemptId: draft.verificationAttempt });
}

/** This returns a fictional record, never a real NIA result. */
export function resolveIdentityVerification(draft, { success = true, outcome, attemptId } = {}) {
  if (!active(draft) || draft.verificationStatus !== 'checking' || attemptId !== draft.verificationAttempt || typeof success !== 'boolean' || outcome !== undefined && !['success', 'failed', 'pending', 'attention', 'already-linked'].includes(outcome)) return fail('This verification attempt is no longer current.');
  if (earlierError(draft, 'selfie') || draft.consent !== true || !facePassed(draft)) return fail('Your details changed. Start the identity check again.');
  draft.identityConfirmed = false; draft.verified = false;
  const status = outcome || (success ? 'success' : 'failed');
  draft.verificationStatus = status;
  draft.verificationRecord = status === 'success' ? { mode: 'simulation', cardNumber: numberKey(draft.ghanaCardNumber), ...SAMPLE_IDENTITY_DETAILS } : null;
  const messages = { success: 'Demo verification complete. Review the returned sample details.', failed: 'The demo check could not be completed. Try again.', pending: 'Your demo verification is still pending. Check its status before continuing.', attention: 'This demo record needs another look. Check your details before retrying.', 'already-linked': 'This sample identity is linked to an existing demo account. Use account recovery rather than creating a second account.' };
  return good(messages[status], { success: status === 'success', outcome: status });
}

/** Explicit participant control; only a confirmed simulated result opens PIN setup. */
export function checkPendingIdentityVerification(draft, { outcome = 'pending' } = {}) {
  if (!active(draft) || draft.verificationStatus !== 'pending' || !['pending', 'success', 'attention'].includes(outcome)) return fail('There is no pending demo verification to check.');
  if (earlierError(draft, 'selfie') || draft.consent !== true || !facePassed(draft)) return fail('Your details changed. Start the identity check again.');
  draft.verificationStatus = 'checking';
  return resolveIdentityVerification(draft, { outcome, attemptId: draft.verificationAttempt });
}

/** Cancel pending work without discarding the photos required for a retry. */
export function cancelIdentityVerification(draft, attemptId) {
  if (!active(draft) || (attemptId !== undefined && attemptId !== draft.verificationAttempt)) return fail('This verification attempt is no longer current.');
  clearIdentityResult(draft);
  return good('Verification cancelled. Your selfies are ready for a retry.');
}

export function confirmIdentityDetails(draft) {
  if (!active(draft) || earlierError(draft, 'identity-review') || draft.consent !== true || !facePassed(draft) || !validVerificationRecord(draft)) return fail('Complete Ghana Card demo verification before confirming the details.');
  draft.identityConfirmed = true;
  return good('Returned sample identity details confirmed.');
}

export function resetCameraCaptures(draft) {
  if (!active(draft)) return fail('This setup is already complete.');
  const hadPhotos = !!draft.liveness.completed.length || draft.selfieCaptured === true || draft.verified === true || draft.verificationStatus !== 'idle' || !!draft.verificationRecord || draft.identityConfirmed === true;
  const reset = hadPhotos || !!draft.ghanaCardNumber || !!draft.capturedNumber || draft.completedSteps.includes('card-number');
  if (reset) {
    invalidateFrom(draft, 'card-number');
    draft.currentStep = 'card-number';
    if (hadPhotos) draft.captureResumeNotice = true;
  }
  draft.ghanaCardNumber = ''; draft.capturedNumber = '';
  return good(reset ? 'Enter your card number and retake your selfies to continue.' : 'No camera captures to reset.', { reset });
}

export function resetLiveness(draft) {
  if (!active(draft)) return fail('This setup is already complete.');
  invalidateFrom(draft, 'selfie'); draft.currentStep = 'selfie';
  return good('Ready to repeat the three selfie prompts.');
}

/** Persist only allowed answers, never the full Ghana Card number or volatile capture proof. */
export function persistableOnboardingDraft(input) {
  const draft = normalizeOnboardingDraft(input);
  if (!draft.completed) resetCameraCaptures(draft);
  else { invalidateFrom(draft, 'card-number'); draft.completed = true; }
  draft.ghanaCardNumber = ''; draft.capturedNumber = ''; draft.verificationRecord = null; draft.verificationStatus = 'idle'; draft.verificationAttempt = 0; draft.identityConfirmed = false;
  return draft;
}

export function buildOnboardingState(draft) {
  if (!active(draft)) return fail('This signup has already been completed.');
  if (!hasAcceptedSetupTerms(draft)) return fail('Accept the current setup terms before creating your demo account.');
  if (firstIncomplete(draft)) return fail('Finish setup before creating the demo account.');
  const state = createEmptyState({ name: draft.name.trim(), phone: draft.phone.trim(), campus: draft.campus });
  state.onboardingDone = true; state.buffer = 0; state.settings.pin = draft.pin;
  state.account ||= {};
  state.account.login = safeLogin(draft.login);
  state.termsAcceptance = normalizeSetupTermsAcceptance(draft);
  state.profile.legalName = draft.verificationRecord.fullName;
  state.verification = { mode: 'simulation', capture: 'live-camera', status: 'complete', method: 'ghana-card-number', liveness: 'guided-camera', sampleIdentity: true, detailsConfirmed: true, completedAt: new Date().toISOString() };
  state.accounts = [
    { id: 'demo-operational', name: 'Everyday account', type: 'operational', holderName: draft.verificationRecord.fullName, status: 'simulated-ready', reference: 'DEMO-OPERATIONAL' },
    { id: 'demo-savings', name: 'Savings account', type: 'savings', holderName: draft.verificationRecord.fullName, status: 'simulated-ready', reference: 'DEMO-SAVINGS' },
  ];
  draft.completed = true;
  return good('Your simulated Lumo account is ready.', { state });
}
