/** Optional pilot feedback. Experience events never confirm money movement. */
const TYPES = new Set(['onboarding_started', 'onboarding_completed', 'feature_used']);
const FEATURES = new Set(['essentials', 'money_box', 'money_chat', 'pause']);
const uuid = () => globalThis.crypto?.randomUUID?.() || null;
const safeReference = value => typeof value === 'string' && /^[A-Za-z0-9_.:-]{1,160}$/.test(value);

export function pilotFeatureForAction(type) {
  if (['createBudget', 'updateBudget', 'startBudgetPeriod', 'reuseBudgetPeriod'].includes(type)) return 'essentials';
  if (['createBox', 'contributeBox', 'withdrawBox'].includes(type)) return 'money_box';
  return null;
}

export function createPilotExperience({service, storage = globalThis.localStorage, now = Date.now, newId = uuid} = {}) {
  let context = null, contextAt = 0, pending = null, activeScope = '', sent = new Set();
  const scope = () => service?.connected && service?.signedIn && service?.user?.id ? `${service.user.id}:${service.authVersion}` : '';
  function current() {
    const next = scope();
    if (next !== activeScope) { activeScope = next; context = null; contextAt = 0; pending = null; sent = new Set(); }
    return next;
  }
  const key = () => context?.pilotId && service?.user?.id ? `lumo-pilot-feedback-v1:${service.user.id}:${context.pilotId}` : null;
  const preference = () => { try { return JSON.parse(storage?.getItem(key()) || 'null') || {}; } catch { return {}; } };
  function savePreference(value) { const id = key(); if (id) try { storage?.setItem(id, JSON.stringify(value)); } catch {} }
  async function getContext({force = false} = {}) {
    const owner = current(); if (!owner) return null;
    if (!force && context && now() - contextAt < 300000) return {...context};
    if (pending?.owner === owner) return pending.promise;
    const operation = {owner, promise: null};
    operation.promise = (async () => {
      let result; try { result = await service.businessRequest({action: 'context'}); } catch { return null; }
      if (current() !== owner || !result?.ok || !result.data || typeof result.data.pilotId !== 'string') return null;
      context = {...result.data}; contextAt = now(); return {...context};
    })().finally(() => { if (pending === operation) pending = null; });
    pending = operation; return operation.promise;
  }
  function eligible() {
    current(); const saved = preference();
    return !!(context?.configured && context.telemetryEnabled && context.surveyEligible && !context.surveyAnswered && !saved.submitted && !saved.dismissed);
  }
  async function record(type, {reference, feature, once = false} = {}) {
    const owner = current();
    if (!owner || !TYPES.has(type) || reference !== undefined && !safeReference(reference) || feature !== undefined && !FEATURES.has(feature) || type === 'feature_used' && !FEATURES.has(feature)) return false;
    const config = await getContext();
    if (current() !== owner || !config?.configured || !config.telemetryEnabled) return false;
    const dedupe = `${type}:${reference || ''}:${feature || ''}`;
    if (once && sent.has(dedupe)) return true;
    const id = newId(); if (!id) return false;
    if (once) sent.add(dedupe);
    const event = {id, type, occurredAt: new Date(now()).toISOString(), platform: 'web', ...(reference ? {reference} : {}), ...(feature ? {feature} : {})};
    try { const result = await service.businessRequest({action: 'experience', event}); if (current() !== owner) return false; return result?.ok === true; } catch { return false; }
  }
  function dismiss() { current(); savePreference({...preference(), dismissed: true}); }
  async function submit(response) {
    const owner = current(); const config = await getContext();
    if (!owner || current() !== owner || !config?.configured || !config.telemetryEnabled || !config.surveyEligible || !Number.isInteger(response?.rating) || response.rating < 1 || response.rating > 5 || typeof response.id !== 'string' || typeof (response.comment ?? '') !== 'string' || (response.comment || '').length > 500) return {ok: false, code: 'UNAVAILABLE', message: 'This check-in is not available. You can keep using Lumo.'};
    let result; try { result = await service.businessRequest({action: 'survey', response: {id: response.id, rating: response.rating, comment: (response.comment || '').trim(), platform: 'web'}}); } catch { result = {ok: false}; }
    if (current() !== owner) return {ok: false, code: 'ACCOUNT_CHANGED', message: 'Your account changed. Reopen feedback from your current account.'};
    if (result?.ok) { savePreference({submitted: true}); context.surveyAnswered = true; return {ok: true}; }
    return {ok: false, code: result?.code || 'UNAVAILABLE', message: 'We could not confirm your feedback was saved. Retry to check the same response, or close this check-in.'};
  }
  return {getContext, eligible, record, dismiss, submit, identity: current};
}
