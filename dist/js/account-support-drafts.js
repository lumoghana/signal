/** Unsent support text belongs to its report or payment, never to another report. */
const activeBindings = new WeakMap();
const keyFor = route => route.page === 'account-support-detail' ? `update:${route.id || ''}` : route.transactionId ? `transaction:${route.transactionId}` : route.fundingId ? `funding:${route.fundingId}` : 'new';
const clean = values => ({ title: String(values.title || '').slice(0, 100), category: ['payment','question','idea','bug','privacy'].includes(values.category) ? values.category : 'question', body: String(values.body || '').slice(0, 2000) });

export function getSupportDraft(ctx, route) {
  const saved = ctx.draft.accountSupportDrafts?.[keyFor(route)];
  return saved || (keyFor(route) === 'new' ? ctx.draft.accountReport : null) || {};
}

export function clearSupportDraft(ctx, route, { keepCapturing = false } = {}) {
  const binding = activeBindings.get(ctx);
  if (!keepCapturing && binding?.key === keyFor(route)) binding.completed = true;
  if (ctx.draft.accountSupportDrafts) delete ctx.draft.accountSupportDrafts[keyFor(route)];
  if (keyFor(route) === 'new') delete ctx.draft.accountReport;
  ctx.saveDraft?.();
}

export function bindSupportDraft(ctx, route) {
  const form = ctx.$('[data-account-form="support-new"]') || ctx.$('[data-account-form="support-update"]');
  if (!form) return () => {};
  let active = true;
  const binding = { key: keyFor(route), completed: false };
  activeBindings.set(ctx, binding);
  const capture = () => {
    if (!active || binding.completed) return;
    const values = clean(Object.fromEntries(new FormData(form)));
    if (!values.title && !values.body) clearSupportDraft(ctx, route, { keepCapturing: true });
    else { (ctx.draft.accountSupportDrafts ||= {})[keyFor(route)] = values; ctx.saveDraft?.(); }
  };
  form.addEventListener('input', capture);
  form.addEventListener('change', capture);
  form.addEventListener('submit', capture);
  ctx.setCapture?.(capture);
  return () => {
    active = false;
    form.removeEventListener('input', capture);
    form.removeEventListener('change', capture);
    form.removeEventListener('submit', capture);
    if (activeBindings.get(ctx) === binding) activeBindings.delete(ctx);
    ctx.setCapture?.(null);
  };
}
