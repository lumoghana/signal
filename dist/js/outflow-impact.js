import { evaluatePayment, getSummary } from './model.js';
import { cash, esc } from './ui.js';

/** Personal outflow review only. The caller keeps its own PIN and ledger journey. */
export function reviewOutflowImpact(ctx, options = {}) {
  const { amount, fee = 0, category = 'Other', budgetItemId, iouId, merchant = '', recipient,
    title = 'A quick look at your plan.', actionLabel = 'Continue', onContinue, onEdit } = options;
  const payload = { amount, fee, category, budgetItemId, iouId, merchant, recipient };
  const impact = evaluatePayment(ctx.state, payload), summary = getSummary(ctx.state);
  if (!impact.allowed) { ctx.toast(impact.reason); return false; }
  const shortfall = Math.max(0, -impact.rawAfterSpendable);
  const baselineShortfall = impact.baselineShortfall ?? Math.max(0, summary.planned + (ctx.state.buffer || 0) - summary.available);
  const additionalShortfall = impact.additionalShortfall ?? Math.max(0, shortfall - baselineShortfall);
  const shortfallNote = !shortfall ? '' : baselineShortfall > 0
    ? `Your plan already has a ${cash(baselineShortfall)} gap. ${additionalShortfall > 0 ? `This payment adds ${cash(additionalShortfall)} to that gap.` : 'This payment leaves that gap unchanged.'}`
    : `This uses ${cash(shortfall)} from your plan or cushion.`;
  let continued = false;
  ctx.sheet(`<section class="outflow-impact"><p class="eyebrow">${impact.needed ? 'Lumo Pause' : 'Your plan'}</p><h2>${esc(title)}</h2>${impact.needed ? `<p class="outflow-impact-reason">${esc(impact.reason)}</p>` : '<p class="muted">Here’s where this leaves your Everyday money.</p>'}<dl><div><dt>Moving out of Everyday</dt><dd>${esc(cash(amount + fee))}</dd></div><div><dt>Everyday after</dt><dd>${esc(cash(impact.afterAvailable))}</dd></div><div><dt>Still in your plan</dt><dd>${esc(cash(impact.afterPlanned))}</dd></div><div><dt>Your cushion</dt><dd>${esc(cash(Math.max(0, ctx.state.buffer || 0)))}</dd></div><div><dt>Left after plan</dt><dd>${esc(cash(impact.afterSpendable))}</dd></div></dl>${shortfallNote ? `<p class="notice">${esc(shortfallNote)}</p>` : ''}<p class="muted small">${summary.planned ? 'Your other plans stay in place. ' : ''}Your PIN is still required. No money has moved.</p><div class="stack"><button type="button" class="button" data-outflow-continue>${esc(actionLabel)}</button><button type="button" class="button ghost" data-outflow-edit>${onEdit ? 'Edit amount' : 'Keep my money here'}</button></div></section>`, root => {
    root.querySelector('[data-outflow-continue]').addEventListener('click', () => {
      if (continued) return;
      const fresh = evaluatePayment(ctx.state, payload);
      if (!fresh.allowed) { ctx.toast(fresh.reason); return; }
      if (fresh.afterAvailable !== impact.afterAvailable || fresh.afterPlanned !== impact.afterPlanned || fresh.reason !== impact.reason) return reviewOutflowImpact(ctx, options);
      continued = true; ctx.closeSheet(); onContinue?.(fresh);
    });
    root.querySelector('[data-outflow-edit]').addEventListener('click', () => { if (continued) return; continued = true; ctx.closeSheet(); onEdit?.(); });
  });
  return true;
}
