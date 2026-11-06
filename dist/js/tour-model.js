/** Benefit-tour state is separate from account balances, identity and signup proof. */
export const TOUR_SCHEMA = 1;
export const TOUR_STORAGE_KEY = 'lumo-benefit-tour-v1';
const object = value => !!value && typeof value === 'object' && !Array.isArray(value);
const statuses = new Set(['completed', 'skipped']);

export function safeTourStep(input) {
  const value = object(input) ? input.step : input;
  if (!['number', 'string'].includes(typeof value) || (typeof value === 'string' && !value.trim())) return 0;
  const number = Number(value);
  return Number.isFinite(number) ? Math.max(0, Math.min(2, Math.floor(number))) : 0;
}

function safeReturnTo(value, replay) {
  if (object(value) && value.section === 'life' && ['settings', 'help'].includes(value.page)) return { section: 'life', page: value.page };
  if (object(value) && value.section === 'home' && (!value.page || value.page === 'home')) return { section: 'home', page: 'home' };
  return replay ? { section: 'life', page: 'settings' } : null;
}

export function createTourDraft({ replay = false, returnTo = null } = {}) {
  return {
    schema: TOUR_SCHEMA, step: 0, replay: replay === true,
    returnTo: safeReturnTo(returnTo, replay === true),
    essentialsShown: false, paymentTried: false, smallerPayment: false, saved: false,
  };
}

export function normalizeTourDraft(input) {
  const source = object(input) ? input : {};
  const draft = createTourDraft({ replay: source.replay === true, returnTo: source.returnTo });
  if (source.schema !== TOUR_SCHEMA) return draft;
  draft.step = safeTourStep(source.step);
  for (const key of ['essentialsShown', 'paymentTried', 'saved']) draft[key] = source[key] === true;
  draft.smallerPayment = draft.paymentTried && source.smallerPayment === true;
  return draft;
}

/** Demonstrations only set presentation flags. No action receives account state. */
export function updateTourDemo(draft, action) {
  if (!object(draft) || draft.schema !== TOUR_SCHEMA) return false;
  const field = { essentials: 'essentialsShown', payment: 'paymentTried', 'smaller-payment': 'smallerPayment', save: 'saved' };
  if (!Object.hasOwn(field, action) || (action === 'smaller-payment' && draft.paymentTried !== true)) return false;
  draft[field[action]] = true;
  return true;
}

function validRecord(value) {
  if (!object(value) || value.schema !== TOUR_SCHEMA || !statuses.has(value.status) || typeof value.timestamp !== 'string') return null;
  const date = new Date(value.timestamp);
  if (!Number.isFinite(date.getTime()) || date.toISOString() !== value.timestamp) return null;
  return { schema: TOUR_SCHEMA, status: value.status, timestamp: value.timestamp };
}

/** A missing or blocked browser store simply makes the tour eligible again. */
export function loadTourRecord(storage) {
  try {
    const record = JSON.parse((storage ?? globalThis.localStorage)?.getItem(TOUR_STORAGE_KEY) || 'null');
    return validRecord(record);
  } catch { return null; }
}

export function saveTourRecord(status, storage) {
  if (!statuses.has(status)) return false;
  try {
    const destination = storage ?? globalThis.localStorage;
    if (!destination || typeof destination.setItem !== 'function') return false;
    destination.setItem(TOUR_STORAGE_KEY, JSON.stringify({ schema: TOUR_SCHEMA, status, timestamp: new Date().toISOString() }));
    return true;
  } catch { return false; }
}

/** Resuming identity/signup or activation never inserts a new introduction. */
export function shouldOfferTour({ record = null, onboarding = null, activation = null } = {}) {
  return !validRecord(record) && !activation && !(Array.isArray(onboarding?.completedSteps) && onboarding.completedSteps.length > 0) && onboarding?.completed !== true;
}
