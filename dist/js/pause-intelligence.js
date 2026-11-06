import { cash, esc } from './ui.js';
import { evaluatePayment, getSummary } from './model.js';
export { evaluatePauseHistory } from './pause-history.js';

const cents = value => Number.isSafeInteger(value) ? Math.max(0, value) : 0;

export function getPauseAlternatives(state, draft = {}, evaluation = {}) {
  const amount = cents(draft.amount), fee = cents(draft.fee ?? evaluation.fee);
  // A smaller planned payment releases less of its category allocation too.
  // Re-evaluate the complete draft rather than adding the reduction to old room.
  const check = evaluatePayment(state, { ...draft, amount, fee });
  const summary = getSummary(state);
  const shortfall = Math.max(0, -check.rawAfterSpendable, amount + fee - cents(state.wallet));
  const baselineShortfall = check.baselineShortfall ?? Math.max(0, summary.planned + cents(state.buffer) - summary.available);
  const additionalShortfall = check.additionalShortfall ?? Math.max(0, shortfall - baselineShortfall);
  let safeAmount = 0, safeCheck = null;
  if (shortfall > 0 && amount > 1 && !draft.serviceId && !draft.requestId) {
    let low = 1, high = amount - 1;
    while (low <= high) {
      const candidate = Math.floor((low + high) / 2);
      const impact = evaluatePayment(state, { ...draft, amount: candidate, fee });
      if (impact.allowed && impact.rawAfterSpendable >= 0 && !impact.needed) {
        safeAmount = candidate; safeCheck = impact; low = candidate + 1;
      } else high = candidate - 1;
    }
  }
  return { amount, fee, shortfall, baselineShortfall, additionalShortfall, safeAmount, currentAvailable: cents(state.wallet), afterAvailable: check.afterAvailable, afterSpendable: check.afterSpendable, safeAvailable: safeCheck?.afterAvailable ?? null, safeSpendable: safeCheck?.afterSpendable ?? null };
}

/** Keep the full-page Pause brief; details live in an optional sheet. */
export function renderPauseAlternatives(state, draft, evaluation) {
  const choices = getPauseAlternatives(state, draft, evaluation);
  return `<div class="pause-alternatives">${choices.safeAmount > 0 && choices.safeAmount < choices.amount ? `<button type="button" class="text-button" data-pause-safe>Try ${esc(cash(choices.safeAmount))}</button>` : ''}<button type="button" class="text-button" data-pause-compare>Compare options</button>${choices.shortfall > 0 ? `<button type="button" class="text-button" data-pause-fund>Add ${esc(cash(choices.shortfall))}</button>` : ''}</div>`;
}

export function bindPauseAlternatives(ctx, root, { draft = ctx.draft.payment, evaluation = {}, onFund } = {}) {
  if (!root || !draft) return () => {};
  const removers = [], bind = (selector, fn) => root.querySelectorAll(selector).forEach(button => { button.addEventListener('click', fn); removers.push(() => button.removeEventListener('click', fn)); });
  const values = () => getPauseAlternatives(ctx.state, draft, evaluation);
  const safe = () => { const v = values(); if (!v.safeAmount || v.safeAmount >= draft.amount) return; draft.amount = v.safeAmount; draft.amountText = (v.safeAmount / 100).toFixed(2); draft.idempotencyKey = `payment-${crypto.randomUUID?.() || Date.now()}`; ctx.saveDraft?.(); ctx.closeSheet(); ctx.go({ section: 'pay', page: 'review' }); };
  const fund = () => { const v = values(); if (v.shortfall > 0) onFund?.(v.shortfall); };
  bind('[data-pause-safe]', safe); bind('[data-pause-fund]', fund);
  bind('[data-pause-compare]', () => { const v = values(); ctx.sheet(`<p class="eyebrow">Your call</p><h2>See both options.</h2><div class="panel"><p>Pay ${esc(cash(v.amount))}${v.fee ? ` + ${esc(cash(v.fee))} fee` : ''}</p><p class="muted">${esc(cash(Math.max(0, v.afterAvailable)))} in Everyday · ${esc(cash(v.afterSpendable))} left after plan.</p>${v.baselineShortfall > 0 ? `<p class="muted">Your plan already has a ${esc(cash(v.baselineShortfall))} gap. ${v.additionalShortfall > 0 ? `This payment adds ${esc(cash(v.additionalShortfall))} to that gap.` : 'This payment leaves that gap unchanged.'}</p>` : ''}${v.safeAmount > 0 && v.safeAmount < v.amount ? `<hr><p>Try ${esc(cash(v.safeAmount))}</p><p class="muted">${esc(cash(v.safeAvailable))} in Everyday · ${esc(cash(v.safeSpendable))} left after plan.</p>` : ''}</div>${v.shortfall > 0 ? `<p class="muted">Adding ${esc(cash(v.shortfall))} would cover ${v.baselineShortfall > 0 ? 'the remaining plan gap after this payment' : 'this payment while protecting your current plan and keep-back'}. Only received money counts.</p>` : '<p class="muted">You can edit the amount or return to review. A PIN is still required before any payment.</p>'}<div class="stack">${v.safeAmount > 0 && v.safeAmount < v.amount ? `<button type="button" class="button" data-choice-safe>Review ${esc(cash(v.safeAmount))}</button>` : ''}${v.shortfall > 0 ? `<button type="button" class="button secondary" data-choice-fund>Add ${esc(cash(v.shortfall))}</button>` : ''}<button type="button" class="button ghost" data-choice-close>Back to my payment</button></div>`, sheet => { sheet.querySelector('[data-choice-safe]')?.addEventListener('click', safe); sheet.querySelector('[data-choice-fund]')?.addEventListener('click', fund); sheet.querySelector('[data-choice-close]')?.addEventListener('click', () => ctx.closeSheet()); }); });
  return () => removers.forEach(remove => remove());
}
