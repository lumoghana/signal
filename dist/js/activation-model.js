import { applyAction, budgetCategoryKey } from './model.js';

export const ACTIVATION_CATEGORIES = Object.freeze([
  { name: 'Food & groceries', emoji: '🍲' },
  { name: 'Transport', emoji: '🚌' },
  { name: 'Data & airtime', emoji: '📱' },
  { name: 'Fees & essentials', emoji: '📚' },
  { name: 'Good times', emoji: '✨' },
]);
const positive = n => Number.isSafeInteger(n) && n > 0 && n <= 1000000000;
const fail = message => ({ ok: false, message });
const good = message => ({ ok: true, message });
const uid = () => globalThis.crypto?.randomUUID?.() || `activation-${Date.now()}-${Math.random().toString(36).slice(2)}`;
const active = d => d && !d.completed && d.state?.onboardingDone === true;
const funded = d => {
  if (d?.funded !== true || !positive(d.state?.wallet)) return false;
  const transaction = d.state.transactions?.find(t => t.id === d.fundingTransactionId && t.type === 'income' && t.status === 'success' && positive(t.amount));
  if (!transaction) return false;
  // Older confirmed drafts had no request object. New requests additionally bind
  // the visible receipt to this exact credited amount and rail.
  const attempt = d.fundingAttempt;
  if (!attempt) return true;
  const receipt = attempt.receipt;
  return attempt.status === 'confirmed' && receipt?.status === 'confirmed' && receipt.mode === 'simulation'
    && receipt.attemptId === attempt.id && receipt.accountNumber === attempt.accountNumber
    && receipt.amount === attempt.amount && receipt.source === attempt.source && receipt.rail === attempt.rail
    && transaction.amount === attempt.amount && transaction.rail === attempt.rail;
};
// Old, genuinely funded drafts already passed the former arrival screen. A wallet
// balance or a requested route alone is never enough to bypass the new first step.
const legacyFunded = d => d?.accountAcknowledged === undefined && funded(d);
const acknowledged = d => (!!activationEverydayAccountNumber(d) && d?.accountAcknowledged === true) || legacyFunded(d);
const planned = d => funded(d) && d.budgetSaved === true && d.state.budget?.created === true && d.state.budget.items?.length > 0
  && d.state.budget.items.every(i => positive(i.amount) && i.spent === 0)
  && d.state.budget.items.reduce((sum, i) => sum + i.amount, 0) + (d.state.buffer || 0) <= d.state.wallet;
const validNumber = value => typeof value === 'string' && /^\d{6,24}$/.test(value.trim()) ? value.trim() : '';
const hasNumberField = (account, key) => !!account && Object.hasOwn(account, key);
function initializeExampleNumber(state) {
  const operational = (Array.isArray(state?.accounts) ? state.accounts : []).find(account => account?.type === 'operational');
  if (operational?.status === 'simulated-ready' && !hasNumberField(operational, 'accountNumber') && !hasNumberField(operational, 'demoNumber')) operational.demoNumber = '000000000001';
}

/** Isolated from the existing account, including when signup is previewed. */
export function createActivationDraft({ state, preview = false } = {}) {
  if (!state?.onboardingDone || state.wallet !== 0 || state.budget?.created) throw new Error('Start activation with a new empty account.');
  const isolatedState = structuredClone(state);
  // One persisted example belongs to the simulated operational record. Never
  // manufacture a live number, borrow the Savings number, or change the source.
  initializeExampleNumber(isolatedState);
  return { schema: 1, state: isolatedState, preview: !!preview, step: 'account-created', accountAcknowledged: false, funding: { source: 'Mobile money', amountText: '', phone: isolatedState.profile?.phone || '' }, fundingAttempt: null, fundingHistory: [],
    keepBackText: '0', items: [], category: '', categoryName: '', amountText: '', due: new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 10),
    error: '', funded: false, budgetSaved: false, fundingKey: uid(), fundingTransactionId: '', completed: false };
}

/** Read only the bank's operational record, never the Savings account. */
export function activationEverydayAccount(d) {
  return (Array.isArray(d?.state?.accounts) ? d.state.accounts : []).find(account => account?.type === 'operational') || null;
}

/** A supplied bank number takes precedence, including when it needs correction. */
export function activationEverydayAccountNumber(d) {
  const account = activationEverydayAccount(d);
  if (!account) return '';
  if (hasNumberField(account, 'accountNumber')) return validNumber(account.accountNumber);
  return account.status === 'simulated-ready' ? validNumber(account.demoNumber) : '';
}

/** Called once when restoring a saved wizard, never from a renderer or route guard. */
export function restoreActivationDraft(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input) || input.schema !== 1 || input.state?.onboardingDone !== true) return null;
  const restored = structuredClone(input);
  initializeExampleNumber(restored.state);
  return restored;
}

/** Viewing account details does not fund, replace or reset an account. */
export function acknowledgeCreatedAccount(d) {
  if (!active(d)) return fail('This setup is already complete.');
  const number = activationEverydayAccountNumber(d), wasLegacyFunded = legacyFunded(d);
  if (!number && !wasLegacyFunded) return fail('Your Everyday account number must be confirmed before you continue.');
  if (d.accountAcknowledged === true) return good('Your account details have already been acknowledged.');
  // A legacy funded wizard may retain its proven checkpoint without fabricating
  // account details or converting its inferred acknowledgement into a false one.
  if (!number && wasLegacyFunded) return good('Your previously funded setup can continue.');
  d.accountAcknowledged = true;
  if (!wasLegacyFunded) d.step = 'fund';
  d.error = '';
  return good('Your account details are acknowledged. Add money when you’re ready.');
}

export function safeActivationStep(d, requested) {
  if (!acknowledged(d)) return 'account-created';
  if (requested === 'account-created' && activationEverydayAccountNumber(d)) return 'account-created';
  if (!funded(d)) return 'fund';
  if (planned(d)) return ['fund', 'purpose'].includes(requested) ? requested : 'ready';
  return requested === 'fund' ? 'fund' : 'purpose';
}

/** Display a receipt only when its matching successful ledger entry exists. */
export function activationFundingStatus(d) {
  if (funded(d)) return 'confirmed';
  return ['pending', 'failed', 'expired'].includes(d?.fundingAttempt?.status) ? d.fundingAttempt.status : 'idle';
}

export function normalizeActivationMobile(value) {
  const digits = String(value || '').trim().replace(/[\s()+-]/g, '');
  const local = digits.startsWith('233') ? '0' + digits.slice(3) : digits;
  return /^0[25]\d{8}$/.test(local) ? local : '';
}

/** Creating a request never credits money or permits planning. */
export function requestActivationFunding(d, { amount, source, phone, now = Date.now() } = {}) {
  if (!active(d)) return fail('This setup is already complete.');
  if (!acknowledged(d)) return fail('Review your account details before adding money.');
  if (funded(d)) return { ...good('Your money is already here.'), status: 'confirmed' };
  if (!positive(amount)) return fail('Choose an amount above zero to start with.');
  if (!['Mobile money', 'Bank transfer'].includes(source)) return fail('Choose mobile money or a bank transfer.');
  const mobile = source === 'Mobile money' ? normalizeActivationMobile(phone) : '';
  if (source === 'Mobile money' && !mobile) return fail('Enter a valid Ghana mobile money number.');
  const current = d.fundingAttempt;
  if (current?.status === 'pending') {
    if (current.amount === amount && current.source === source && current.phone === mobile && current.accountNumber === activationEverydayAccountNumber(d)) return { ...good('This request is already waiting for confirmation.'), status: 'pending', attemptId: current.id, alreadyPending: true };
    return fail('Check the current request before starting another one.');
  }
  if (current) return fail('Review this funding result before trying again.');
  const id = uid(), createdAt = Number.isFinite(now) ? now : Date.now();
  d.fundingAttempt = { id, status: 'pending', amount, source, rail: source === 'Mobile money' ? 'momo' : 'bank', accountNumber: activationEverydayAccountNumber(d), phone: mobile, reference: 'LUMO-' + id.replace(/[^a-z0-9]/gi, '').slice(-10).toUpperCase(), createdAt, lastCheckedAt: null, receipt: null, demoReceipt: null };
  d.funding = { ...d.funding, source, phone: mobile || d.funding?.phone || '', amountText: (amount / 100).toFixed(2) };
  d.step = 'fund'; d.error = '';
  return { ...good('Waiting for the money to reach your Everyday account.'), status: 'pending', attemptId: id };
}

function matchingFundingReceipt(d, receipt) {
  const attempt = d?.fundingAttempt;
  return !!attempt && !!receipt && receipt.mode === 'simulation' && receipt.attemptId === attempt.id
    && receipt.accountNumber === attempt.accountNumber && receipt.accountNumber === activationEverydayAccountNumber(d)
    && receipt.amount === attempt.amount && receipt.source === attempt.source && receipt.rail === attempt.rail
    && typeof receipt.providerReference === 'string' && /^[a-z0-9-]{6,100}$/i.test(receipt.providerReference)
    && ['confirmed', 'failed', 'expired'].includes(receipt.status);
}

/** Only a separately confirmed, matching provider result can credit this prototype. */
export function fundActivation(d, { receipt } = {}) {
  if (!active(d)) return fail('This setup is already complete.');
  if (!acknowledged(d)) return fail('Review your account details before adding money.');
  if (funded(d)) return { ...good('Your money is already here.'), status: 'confirmed', id: d.fundingTransactionId };
  const attempt = d.fundingAttempt;
  if (!matchingFundingReceipt(d, receipt) || receipt.status !== 'confirmed' || attempt.status !== 'pending') return fail('Wait for a matching confirmation that the money reached your account.');
  const result = applyAction(d.state, 'fund', { amount: attempt.amount, source: attempt.source, rail: attempt.rail, note: 'Confirmed simulated first top-up', idempotencyKey: 'activation-funding-' + attempt.id });
  if (!result.ok) return result;
  attempt.status = 'confirmed'; attempt.receipt = structuredClone(receipt);
  d.funded = true; d.fundingTransactionId = result.id; d.step = 'fund'; d.error = '';
  return { ...result, status: 'confirmed' };
}

/** A manual or automatic check is not evidence that money has arrived. */
export function checkActivationFunding(d, { receipt = null, now = Date.now() } = {}) {
  if (!active(d)) return fail('This setup is already complete.');
  if (!acknowledged(d)) return fail('Review your account details before adding money.');
  if (funded(d)) return { ...good('Your money is already here.'), status: 'confirmed', id: d.fundingTransactionId };
  const attempt = d.fundingAttempt;
  if (!attempt) return fail('Start a funding request before checking its status.');
  if (!receipt) {
    attempt.lastCheckedAt = Number.isFinite(now) ? now : Date.now();
    return { ...good(attempt.status === 'pending' ? 'Still waiting for confirmation. Do not send it again.' : 'This request has not been confirmed.'), status: attempt.status };
  }
  if (!matchingFundingReceipt(d, receipt) || attempt.status !== 'pending') return fail('This confirmation does not match the current funding request.');
  if (receipt.status === 'confirmed') {
    const result = fundActivation(d, { receipt });
    if (result.ok) attempt.lastCheckedAt = Number.isFinite(now) ? now : Date.now();
    return result;
  }
  attempt.status = receipt.status; attempt.receipt = structuredClone(receipt); attempt.lastCheckedAt = Number.isFinite(now) ? now : Date.now();
  d.step = 'fund'; d.error = '';
  return { ...good(receipt.status === 'expired' ? 'The request expired without a confirmed payment.' : 'The payment was not completed.'), status: receipt.status };
}

/** Retry only a resolved request; an outstanding debit must not be duplicated. */
export function retryActivationFunding(d) {
  if (!active(d) || !acknowledged(d)) return fail('Review your account details before adding money.');
  const attempt = d.fundingAttempt;
  if (funded(d) || !attempt || !['failed', 'expired'].includes(attempt.status)) return fail('Check the current request before starting another one.');
  d.fundingHistory = [...(Array.isArray(d.fundingHistory) ? d.fundingHistory : []), structuredClone(attempt)];
  d.fundingAttempt = null; d.step = 'fund'; d.error = '';
  return good('Review your details and try again when you are ready.');
}

export function addActivationBudgetItem(d, { name, emoji = '📌', amount } = {}) {
  if (!active(d) || !acknowledged(d) || !funded(d)) return fail('Review your account details and add money before giving it a purpose.');
  const clean = typeof name === 'string' ? name.trim().replace(/\s+/g, ' ').slice(0, 60) : '';
  if (!clean || !positive(amount)) return fail('Choose an essential and an amount above zero.');
  if (d.items.some(i => budgetCategoryKey(i.name) === budgetCategoryKey(clean))) return fail('That category is already in your budget. Edit its amount instead.');
  if (d.items.reduce((sum, i) => sum + i.amount, 0) + amount > d.state.wallet) return fail('Keep your budget within the money you just added.');
  d.items.push({ id: uid(), name: clean, emoji, amount, spent: 0 }); d.budgetSaved = false; d.error = '';
  return good('Added to your first budget.');
}

export function saveActivationBudget(d, { items = d?.items, due = d?.due, buffer = 0 } = {}) {
  if (!active(d) || !acknowledged(d) || !funded(d)) return fail('Review your account details and add money before creating your first budget.');
  if (!Array.isArray(items) || !items.length || items.some(i => !positive(i.amount) || (i.spent || 0) !== 0)) return fail('Give at least one essential an amount above zero.');
  if (!Number.isSafeInteger(buffer) || buffer < 0) return fail('Choose a keep-back amount of zero or more.');
  if (items.reduce((sum, i) => sum + i.amount, 0) + buffer > d.state.wallet) return fail('Keep your budget within the money you just added.');
  if (typeof due !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(due) || !Number.isFinite(new Date(due + 'T12:00:00Z').getTime()) || new Date(due + 'T12:00:00Z').toISOString().slice(0, 10) !== due || due < new Date().toISOString().slice(0, 10)) return fail('Choose today or a future date for this money.');
  const result = applyAction(d.state, 'createBudget', { items: items.map(i => ({ ...i, due })), buffer });
  if (!result.ok) return result;
  // Plan coverage and an expected allowance are independent choices.
  d.state.budget = { ...d.state.budget, endDate: due };
  d.keepBackText = (buffer / 100).toFixed(2);
  d.items = structuredClone(d.state.budget.items); d.due = due; d.budgetSaved = true; d.step = 'ready'; d.error = '';
  return result;
}

/** Only the app owner can install this isolated account after both choices. */
export function completeActivation(d) {
  if (!active(d) || !acknowledged(d) || !planned(d)) return fail('Review your account details, add money and create your first budget before meeting Lumo.');
  d.state.activation = {status:'ready',fundingDeferred:false};
  d.completed = true;
  return { ok: true, state: structuredClone(d.state), preview: d.preview };
}

/** A verified student can wait for an allowance without inventing a balance. */
export function deferActivationFunding(d) {
  if (!acknowledged(d)) return fail('Review your account details before choosing to add money later.');
  if (!active(d) || funded(d) || d.state.wallet !== 0) return fail('Use your funded setup to finish giving your money a purpose.');
  if (d.fundingAttempt?.status === 'pending') return fail('Wait for this funding request to be resolved before adding money later.');
  d.state.activation = {status:'waiting',fundingDeferred:true};
  d.completed = true;
  return {ok:true,state:structuredClone(d.state),preview:d.preview};
}
