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
const funded = d => d?.funded === true && positive(d.state?.wallet) && d.state.transactions?.some(t => t.id === d.fundingTransactionId && t.type === 'income' && t.status === 'success');
const planned = d => funded(d) && d.budgetSaved === true && d.state.budget?.created === true && d.state.budget.items?.length > 0
  && d.state.budget.items.every(i => positive(i.amount) && i.spent === 0)
  && d.state.budget.items.reduce((sum, i) => sum + i.amount, 0) + (d.state.buffer || 0) <= d.state.wallet;

/** Isolated from the existing account, including when signup is previewed. */
export function createActivationDraft({ state, preview = false } = {}) {
  if (!state?.onboardingDone || state.wallet !== 0 || state.budget?.created) throw new Error('Start activation with a new empty account.');
  return { schema: 1, state: structuredClone(state), preview: !!preview, step: 'fund', funding: { source: 'Mobile money', amountText: '' },
    keepBackText: '0', items: [], category: '', categoryName: '', amountText: '', due: new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 10),
    error: '', funded: false, budgetSaved: false, fundingKey: uid(), fundingTransactionId: '', completed: false };
}

export function safeActivationStep(d, requested) {
  if (!funded(d)) return 'fund';
  if (planned(d)) return ['fund', 'purpose'].includes(requested) ? requested : 'ready';
  return requested === 'fund' ? 'fund' : 'purpose';
}

export function fundActivation(d, { amount, source } = {}) {
  if (!active(d)) return fail('This setup is already complete.');
  if (funded(d)) { d.step = d.budgetSaved ? 'ready' : 'purpose'; return good('Your money is already here.'); }
  if (!positive(amount)) return fail('Choose an amount above zero to start with.');
  if (!['Mobile money', 'Bank transfer'].includes(source)) return fail('Choose mobile money or a bank transfer.');
  const result = applyAction(d.state, 'fund', { amount, source, rail: source === 'Mobile money' ? 'momo' : 'bank', note: 'Simulated first top-up', idempotencyKey: d.fundingKey });
  if (!result.ok) return result;
  d.funded = true; d.fundingTransactionId = result.id; d.step = 'purpose'; d.error = '';
  return result;
}

export function addActivationBudgetItem(d, { name, emoji = '📌', amount } = {}) {
  if (!active(d) || !funded(d)) return fail('Add money before giving it a purpose.');
  const clean = typeof name === 'string' ? name.trim().replace(/\s+/g, ' ').slice(0, 60) : '';
  if (!clean || !positive(amount)) return fail('Choose an essential and an amount above zero.');
  if (d.items.some(i => budgetCategoryKey(i.name) === budgetCategoryKey(clean))) return fail('That category is already in your budget. Edit its amount instead.');
  if (d.items.reduce((sum, i) => sum + i.amount, 0) + amount > d.state.wallet) return fail('Keep your budget within the money you just added.');
  d.items.push({ id: uid(), name: clean, emoji, amount, spent: 0 }); d.budgetSaved = false; d.error = '';
  return good('Added to your first budget.');
}

export function saveActivationBudget(d, { items = d?.items, due = d?.due, buffer = 0 } = {}) {
  if (!active(d) || !funded(d)) return fail('Add money before creating your first budget.');
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
  if (!active(d) || !planned(d)) return fail('Add money and create your first budget before meeting Lumo.');
  d.state.activation = {status:'ready',fundingDeferred:false};
  d.completed = true;
  return { ok: true, state: structuredClone(d.state), preview: d.preview };
}

/** A verified student can wait for an allowance without inventing a balance. */
export function deferActivationFunding(d) {
  if (!active(d) || funded(d) || d.state.wallet !== 0) return fail('Use your funded setup to finish giving your money a purpose.');
  d.state.activation = {status:'waiting',fundingDeferred:true};
  d.completed = true;
  return {ok:true,state:structuredClone(d.state),preview:d.preview};
}
