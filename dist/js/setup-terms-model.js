/** The prototype setup agreement is separate from camera and identity-data consent. */
export const SETUP_TERMS_VERSION = '2026-11-08.1';
const object = value => !!value && typeof value === 'object' && !Array.isArray(value);

/** Accept a draft or its direct acceptance record. Stale versions require a fresh decision. */
export function normalizeSetupTermsAcceptance(input) {
  const record = object(input) && Object.hasOwn(input, 'termsAcceptance') ? input.termsAcceptance : input;
  if (!object(record) || record.version !== SETUP_TERMS_VERSION || typeof record.acceptedAt !== 'string') return null;
  const date = new Date(record.acceptedAt);
  if (!Number.isFinite(date.getTime()) || date.toISOString() !== record.acceptedAt) return null;
  return { version: SETUP_TERMS_VERSION, acceptedAt: record.acceptedAt };
}

export function hasAcceptedSetupTerms(input) {
  return normalizeSetupTermsAcceptance(input) !== null;
}

/** Only the user's explicit acceptance records this version. Resuming never erases answers. */
export function acceptSetupTerms(onboardingDraft, { accepted, now = Date.now() } = {}) {
  if (!object(onboardingDraft) || onboardingDraft.completed === true) return { ok: false, message: 'Start or resume your Lumo setup first.' };
  if (accepted !== true) return { ok: false, message: 'Accept the setup terms before continuing.' };
  if (!['string', 'number'].includes(typeof now) && !(now instanceof Date)) return { ok: false, message: 'A valid acceptance time is needed.' };
  const date = new Date(now);
  if (!Number.isFinite(date.getTime())) return { ok: false, message: 'A valid acceptance time is needed.' };
  const acceptance = { version: SETUP_TERMS_VERSION, acceptedAt: date.toISOString() };
  onboardingDraft.termsAcceptance = acceptance;
  return { ok: true, message: 'Setup terms accepted.', acceptance: { ...acceptance } };
}
