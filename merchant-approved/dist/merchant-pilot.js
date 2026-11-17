/** Visible receipt observations are diagnostics, never payment confirmation or timing proof. */
export function createMerchantReceiptReporter({request, identity, now = Date.now, newId = () => globalThis.crypto?.randomUUID?.()} = {}) {
  let owner = '', context = null, contextAt = 0, loading = null, seen = new Set(), pending = new Set();
  const current = () => { const next = identity?.() || ''; if (next !== owner) {owner = next; context = null; loading = null; contextAt = 0; seen = new Set(); pending = new Set();} return next; };
  async function configured(scope) {
    if (context && now() - contextAt < 300000) return context;
    if (loading?.scope === scope) return loading.promise;
    const run = {scope, promise: null};
    run.promise = (async () => { let result; try {result = await request({action: 'context'});} catch {return null;} if (current() !== scope || !result?.ok) return null; context = result.data; contextAt = now(); return context; })().finally(() => {if (loading === run) loading = null;});
    loading = run; return run.promise;
  }
  return {
    async observe(reference) {
      const scope = current();
      if (!scope || typeof reference !== 'string' || !/^[A-Za-z0-9_.:-]{1,160}$/.test(reference) || seen.has(reference) || pending.has(reference)) return false;
      pending.add(reference);
      try {
        const config = await configured(scope);
        if (current() !== scope || !config?.configured || !config.telemetryEnabled) return false;
        const id = newId(); if (!id) return false;
        const result = await request({action: 'experience', event: {id, type: 'merchant_receipt_displayed', occurredAt: new Date(now()).toISOString(), platform: 'merchant', reference}});
        if (current() !== scope || !result?.ok) return false;
        seen.add(reference); if (seen.size > 256) seen.delete(seen.values().next().value);
        return true;
      } catch {return false;} finally {if (current() === scope) pending.delete(reference);}
    }
  };
}

export function startMerchantReceiptObservations({reporter, active, root = globalThis.document, Observer = globalThis.IntersectionObserver, Mutations = globalThis.MutationObserver} = {}) {
  if (!root || !Observer || !Mutations) return () => {};
  const watched = new WeakMap(); let frame = null, stopped = false;
  function visible(node) {
    if (stopped || !active() || root.visibilityState !== 'visible' || !node.isConnected || node.closest('[hidden],[inert]')) return false;
    const style = globalThis.getComputedStyle(node); if (style.visibility === 'hidden' || style.display === 'none' || Number(style.opacity) === 0) return false;
    const rect = node.getBoundingClientRect();
    return rect.width > 0 && rect.height > 0 && rect.bottom > 0 && rect.right > 0 && rect.top < globalThis.innerHeight && rect.left < globalThis.innerWidth;
  }
  const observer = new Observer(entries => {for (const entry of entries) if (entry.isIntersecting && visible(entry.target)) void reporter.observe(entry.target.dataset.pilotReceipt);}, {threshold: 0.5});
  function scan() {
    frame = null; if (stopped) return;
    for (const node of [...root.querySelectorAll('[data-pilot-receipt]')].slice(0,100)) if (watched.get(node) !== node.dataset.pilotReceipt) {watched.set(node, node.dataset.pilotReceipt); observer.unobserve(node); observer.observe(node);}
  }
  const schedule = () => {if (!stopped && frame === null) frame = requestAnimationFrame(scan);};
  const mutation = new Mutations(schedule); mutation.observe(root.body, {childList: true, subtree: true, attributes: true, attributeFilter: ['data-pilot-receipt','hidden','inert']});
  const foreground = () => {if (root.visibilityState === 'visible') for (const node of [...root.querySelectorAll('[data-pilot-receipt]')].slice(0,20)) if (visible(node)) void reporter.observe(node.dataset.pilotReceipt);};
  root.addEventListener('visibilitychange', foreground); schedule();
  return () => {stopped = true; if (frame !== null) cancelAnimationFrame(frame); observer.disconnect(); mutation.disconnect(); root.removeEventListener('visibilitychange', foreground);};
}
