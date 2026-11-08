/** Pure route relationships. Navigation never changes financial state. */
import { ONBOARDING_STEPS, canonicalOnboardingStep, safeOnboardingStep } from './onboarding-model.js';
import { evaluatePayment } from './model.js';
import { safeActivationStep } from './activation-model.js';
import { TOUR_SCHEMA, safeTourStep } from './tour-model.js';
import { getPaymentService, getServiceHubTab } from './payment-catalog.js';
import { recipientLookupMatches } from './recipient-lookup.js';
import { canReadGroup } from './group-ledger.js';
import { hasAcceptedSetupTerms } from './setup-terms-model.js';

const HOME = Object.freeze({ section: 'home', page: 'home' });
const WELCOME_PAGES = new Set(['home', 'explore']);
const PAYMENT_STEPS = new Set(['recipient', 'recipient-confirm', 'amount', 'review', 'pause']);
const MAIN_SECTIONS = new Set(['home', 'activity', 'pay', 'boxes', 'plan', 'groups']);
const PAGES = {
  home: new Set(['home']),
  activity: new Set(['home', 'insights', 'upcoming']),
  pay: new Set(['home', 'recipient', 'recipient-confirm', 'conversation', 'amount', 'review', 'pause', 'status', 'transaction', 'collect', 'scan', 'fund', 'fund-status', 'service', 'recipients-list', 'cards', 'requests', 'request-detail', 'splits', 'split-detail', 'funding-detail']),
  boxes: new Set(['home', 'create', 'detail', 'edit', 'hack', 'hacks', 'archive', 'transfer']),
  plan: new Set(['home', 'create', 'periods', 'guided']),
  life: new Set(['overview', 'ious', 'iou-detail', 'iou-create', 'recovery', 'groups', 'group-detail', 'group-chat', 'group-create', 'story', 'settings', 'help', 'account-security', 'account-login-setup', 'account-access', 'account-recovery', 'account-devices', 'account-statements', 'account-support', 'account-support-new', 'account-support-detail', 'account-privacy', 'account-close']),
  chat: new Set(['home']),
  learn: new Set(['home','library','start','lesson','practice','progress','preferences','review','game','play','rewards','money-iq']),
};

const copy = value => ({ ...value });
const home = () => copy(HOME);
const hasRoute = value => !!value && typeof value === 'object' && !Array.isArray(value) && typeof value.section === 'string';
const cleanId = value => value === undefined || value === null ? '' : String(value);

function normalize(route) {
  if (!hasRoute(route)) return home();
  const next = { ...route };
  if (next.section === 'groups') {
    next.section = 'life';
    next.page = ({ home: 'groups', detail: 'group-detail', chat: 'group-chat', create: 'group-create' })[next.page || 'home'] || next.page;
  }
  if (next.section === 'welcome') return { ...next, page: ['impact', 'impact-extra'].includes(next.page) ? 'explore' : WELCOME_PAGES.has(next.page) ? next.page : 'home' };
  if (next.section === 'terms') return { section: 'terms' };
  if (next.section === 'tour') return { section: 'tour', step: safeTourStep(next.step) };
  if (next.section === 'activation') return { section: 'activation', step: ['account-created', 'fund', 'purpose', 'ready'].includes(next.step) ? next.step : 'account-created' };
  if (next.section === 'onboarding') return { ...next, step: canonicalOnboardingStep(next.step) || 'name' };
  if (!PAGES[next.section]) return home();
  const fallback = next.section === 'life' ? 'overview' : 'home';
  next.page = PAGES[next.section].has(next.page || fallback) ? (next.page || fallback) : fallback;
  if (next.section === 'pay' && next.page === 'scan') next.mode = next.mode === 'code' ? 'code' : 'scan';
  if (next.section === 'activity' && next.page === 'insights' && next.month !== undefined && !/^\d{4}-(0[1-9]|1[0-2])$/.test(next.month)) delete next.month;
  if (next.section === 'pay' && next.page === 'home' && next.hubTab) next.hubTab = ['campus', 'bills'].includes(next.hubTab) ? next.hubTab : 'send';
  if (next.section === 'pay' && next.page === 'recipients-list') next.list = next.list === 'favourites' ? 'favourites' : 'recent';
  if (next.section === 'life' && ['group-create', 'iou-create', 'recovery'].includes(next.page)) {
    next.step = Math.max(0, Math.floor(Number(next.step) || 0));
    if (next.page === 'group-create') next.step = Math.min(4, next.step);
  }
  if (['boxes', 'plan'].includes(next.section) && next.page === 'create') next.step ||= 'name';
  if (next.id !== undefined) next.id = cleanId(next.id);
  return next;
}

/** Identity is the visible destination; origin/return metadata does not create duplicates. */
export function routeKey(route) {
  const r = normalize(route);
  return JSON.stringify([r.section, r.page || '', r.id || '', r.step ?? '', r.filter || '', r.section === 'pay' && r.page === 'home' ? r.hubTab || 'send' : '', r.page === 'recipients-list' ? r.list : '', r.page === 'scan' ? r.mode : '', r.section === 'activity' && r.page === 'insights' ? r.month || '' : '']);
}

export function sectionForRoute(route) {
  const r = normalize(route);
  if (r.section === 'life' && r.page.startsWith('group')) return 'groups';
  return MAIN_SECTIONS.has(r.section) ? r.section : 'home';
}

/** Label the supplied destination. For a Back label, pass parentRoute(current). */
export function routeLabel(route) {
  const r = normalize(route);
  if (r.section === 'learn') return ({home:'Money IQ',library:'More with Lux',start:'Your learning journey',lesson:'Money lesson',practice:'Money practice',progress:'Your progress',preferences:'Learning preferences',review:'Knowledge check',game:'Campus Run',play:'Campus mission',rewards:'Lux looks','money-iq':'Money IQ'})[r.page] || 'Learn with Lux';
  if (r.section === 'welcome') return 'Welcome';
  if (r.section === 'terms') return 'Setup terms';
  if (r.section === 'tour') return 'Lumo tour';
  if (r.section === 'activation') return 'First steps';
  if (r.section === 'onboarding') return 'Previous step';
  if (r.section === 'chat') return 'Ask Lux';
  if (r.section === 'home') return 'Home';
  if (r.section === 'pay' && r.page === 'service') return getPaymentService(r.id)?.name || 'Payments';
  if (r.section === 'pay' && r.page === 'cards') return 'Virtual cards';
  if (r.section === 'pay' && ['requests','request-detail','splits','split-detail','funding-detail'].includes(r.page)) return ({requests:'Money requests','request-detail':'Request',splits:'Expense splits','split-detail':'Split expense','funding-detail':'Add money'})[r.page];
  if (r.section === 'pay' && r.page === 'recipients-list') return r.list === 'favourites' ? 'Favourites' : 'Recent payments';
  if (r.section === 'activity') return ({ insights: 'Insights', upcoming: 'Upcoming' })[r.page] || 'Activity';
  if (r.section === 'pay') return ({ conversation: 'Payment conversation', recipient: 'Recipient', 'recipient-confirm': 'Your person', amount: 'Amount', review: 'Review payment', pause: 'Pause', status: 'Payment result', transaction: 'Payment details', collect: 'Collect', scan: 'Scan', fund: 'Add money', 'fund-status': 'Your money' })[r.page] || 'Payments';
  if (r.section === 'boxes') return ({ detail: 'Money Box', edit: 'Money Box', hack: 'Savings Hack', create: 'Previous step', hacks:'Savings Hacks', archive:'Archived boxes', transfer:'Box transfer' })[r.page] || 'Money Boxes';
  if (r.section === 'plan') return ({create:'Previous step',periods:'Budget periods',guided:'Build my budget'})[r.page] || 'Plan';
  if (r.section === 'life' && r.page.startsWith('account-')) return ({'account-security':'Security','account-login-setup':'Sign-in details','account-access':'Welcome back','account-recovery':'Recover access','account-devices':'Devices','account-statements':'Statements','account-support':'Your reports','account-support-new':'Get help','account-support-detail':'Report','account-privacy':'Privacy','account-close':'Account closure'})[r.page] || 'Settings';
  return ({ overview: 'All your money', ious: 'IOUs', 'iou-detail': 'IOU', 'iou-create': 'Previous step', recovery: r.step ? 'Previous step' : 'Recovery', groups: 'Groups', 'group-detail': 'Group', 'group-chat': 'Group chat', 'group-create': 'Previous step', story: 'Money Story', settings: 'Settings', help: 'Help' })[r.page] || 'Home';
}

function explicitParent(route) {
  for (const candidate of [route.backTo, route.returnTo]) {
    if (hasRoute(candidate) && routeKey(candidate) !== routeKey(route)) return normalize(candidate);
  }
  return null;
}

function createParent(route, steps, root) {
  if (route.step !== 'review' && (route.edit || route.editing || route.mode === 'edit')) return { section: route.section, page: 'create', step: 'review' };
  const index = steps.indexOf(route.step);
  return index > 0 ? { section: route.section, page: 'create', step: steps[index - 1] } : root;
}

export function parentRoute(route, state = {}, draft = {}) {
  const r = normalize(route), explicit = explicitParent(r);
  if (explicit) return explicit;
  if (r.section === 'welcome' && r.page !== 'home') return { section: 'welcome', page: 'home' };
  if (r.section === 'terms') return { section: 'welcome' };
  if (r.section === 'learn') return ['home','start'].includes(r.page) ? home() : {section:'learn',page:['play','rewards'].includes(r.page)?'game':'home'};
  if (r.section === 'tour') return r.step > 0 ? { section: 'tour', step: r.step - 1 } : draft.tour?.replay ? draft.tour.returnTo || { section: 'life', page: 'settings' } : { section: 'welcome' };
  if (r.section === 'activation') return r.step === 'ready' ? { section: 'activation', step: 'purpose' } : r.step === 'purpose' ? { section: 'activation', step: 'fund' } : r.step === 'fund' ? { section: 'activation', step: 'account-created' } : { section: 'welcome' };
  if (r.section === 'onboarding') {
    const index = ONBOARDING_STEPS.indexOf(r.step);
    return index > 0 ? { section: 'onboarding', step: ONBOARDING_STEPS[index - 1] } : { section: 'terms' };
  }
  if (r.section === 'boxes') {
    if (['hacks','archive'].includes(r.page)) return {section:'boxes',page:'home'};
    if (r.page === 'transfer') return r.boxId?{section:'boxes',page:'detail',id:r.boxId}:{section:'boxes',page:'home'};
    if (r.page === 'create') return createParent(r, ['name', 'target', 'date', 'partner', 'review'], { section: 'boxes', page: 'home' });
    if (['hack', 'edit'].includes(r.page)) return r.id ? { section: 'boxes', page: 'detail', id: r.id } : { section: 'boxes', page: 'home' };
    return r.page === 'detail' ? { section: 'boxes', page: 'home' } : home();
  }
  if (r.section === 'plan') return r.page === 'create' ? createParent(r, ['name', 'amount', 'date', 'review'], { section: 'plan', page: 'home' }) : ['periods','guided'].includes(r.page)?{section:'plan',page:'home'}:home();
  if (r.section === 'activity') return r.page === 'home' ? home() : { section: 'activity', page: 'home' };
  if (r.section === 'pay') {
    if (r.page === 'request-detail') return {section:'pay',page:'requests'};
    if (r.page === 'split-detail') return {section:'pay',page:'splits'};
    if (['requests','splits','funding-detail'].includes(r.page)) return {section:'pay',page:'home'};
    if (r.page === 'service') return { section: 'pay', page: 'home', hubTab: getServiceHubTab(r.id) };
    if (['cards', 'recipients-list'].includes(r.page)) return { section: 'pay', page: 'home', hubTab: 'send' };
    if (r.page === 'recipient-confirm') return { section: 'pay', page: 'recipient', backTo: draft.payment?.flowOrigin || { section: 'pay', page: 'home' } };
    if (r.page === 'amount') {
      if (draft.payment?.lookupRequired) return { section: 'pay', page: 'recipient-confirm', backTo: { section: 'pay', page: 'recipient' } };
      const person = draft.payment?.recipient;
      const id = r.id || (typeof person === 'object' ? person?.id : '');
      return person || r.id ? { section: 'pay', page: 'conversation', ...(id ? { id: cleanId(id) } : {}) } : { section: 'pay', page: 'recipient' };
    }
    if (r.page === 'review') return draft.payment?.serviceId ? { section: 'pay', page: 'service', id: draft.payment.serviceId } : { section: 'pay', page: 'amount' };
    if (r.page === 'pause') return { section: 'pay', page: 'review' };
    return r.page === 'home' ? home() : { section: 'pay', page: 'home' };
  }
  if (r.section === 'life') {
    if (['account-devices','account-login-setup'].includes(r.page)) return {section:'life',page:'account-security'};
    if (r.page === 'account-recovery') return state.onboardingDone ? {section:'life',page:state.account?.signedOut?'account-access':'account-security'} : {section:'welcome'};
    if (r.page === 'account-support-detail' || r.page === 'account-support-new') return {section:'life',page:'account-support'};
    if (r.page.startsWith('account-')) return {section:'life',page:'settings'};
    if (r.page === 'iou-create') {
      const record = draft.iouCreate;
      const filter = record?.type || r.filter || 'owedToMe';
      if (record?.edit && r.step <= 1) return record.id ? { section: 'life', page: 'iou-detail', id: cleanId(record.id), filter } : { section: 'life', page: 'ious', filter };
      return r.step > 0 ? { section: 'life', page: 'iou-create', step: r.step - 1, filter } : { section: 'life', page: 'ious', filter };
    }
    if (r.page === 'group-create') {
      const reviewStep = Number.isSafeInteger(r.reviewStep) ? r.reviewStep : 4;
      if (r.step !== reviewStep && (r.edit || r.editing || r.mode === 'edit')) return { section: 'life', page: 'group-create', step: reviewStep };
      return r.step > 0 ? { section: 'life', page: 'group-create', step: r.step - 1 } : { section: 'life', page: 'groups' };
    }
    if (r.page === 'group-detail') return { section: 'life', page: 'groups' };
    if (r.page === 'group-chat') return { section: 'life', page: 'group-detail', id: r.id };
    if (r.page === 'iou-detail') {
      const item = state.ious?.find(iou => cleanId(iou.id) === r.id);
      return { section: 'life', page: 'ious', filter: item?.type || r.filter || 'owedToMe' };
    }
    if (r.page === 'recovery' && r.step > 0) return { section: 'life', page: 'recovery', step: r.step - 1 };
  }
  return home();
}

function exists(state, collection, id) {
  return !!id && (!Array.isArray(state[collection]) || state[collection].some(item => cleanId(item.id) === id));
}

function outsideFlow(route, fallback) {
  const explicit = explicitParent(route);
  if (!explicit) return fallback;
  const transient = (explicit.section === route.section && explicit.page === route.page) || (explicit.section === 'pay' && PAYMENT_STEPS.has(explicit.page));
  return transient ? fallback : explicit;
}

/** The conversation is a separate screen; returning keeps the app's own task state. */
export function chatReturnRoute(route, state = {}, draft = {}) {
  let candidate = route?.returnTo || draft.chatReturnTo || home();
  if (!hasRoute(candidate) || ['chat','welcome','terms','onboarding','activation','tour'].includes(candidate.section)) candidate = home();
  if (candidate.section === 'pay' && candidate.edit && ['recipient','recipient-confirm'].includes(candidate.page)) candidate = { section: 'pay', page: 'review' };
  const checked = safeRoute(candidate, state, draft);
  return checked.section === 'chat' ? safeRoute(home(), state, draft) : checked;
}

function committedPayment(state, payment) {
  if (!payment) return null;
  const entry = payment.idempotencyKey && Object.hasOwn(state._appliedActions || {}, payment.idempotencyKey) ? state._appliedActions[payment.idempotencyKey]?.result : null;
  const id = entry?.transaction?.id || entry?.id || payment.transactionId || payment.completedTransactionId;
  if (id && (entry?.ok || payment.completed || payment.committed)) return cleanId(id);
  return payment.completed || payment.committed ? true : null;
}

/** Keep stale browser entries from reopening completed or missing forms. */
export function safeRoute(route, state = {}, draft = {}) {
  const r = normalize(route);
  if (state.account?.signedOut && !(r.section === 'life' && ['account-access','account-recovery'].includes(r.page))) return {section:'life',page:'account-access'};
  const signupPreview = draft.onboarding?.preview === true && !draft.onboarding?.completed;
  const activation = draft.activation && !draft.activation.completed && draft.activation.state?.onboardingDone === true;
  if (activation && (r.section !== 'welcome' || draft.activation.preview)) return { section: 'activation', step: safeActivationStep(draft.activation, r.section === 'activation' ? r.step : draft.activation.step) };
  if (r.section === 'activation') return state.onboardingDone ? home() : { section: 'welcome' };
  if (r.section === 'tour') {
    const t = draft.tour;
    if (t?.schema === TOUR_SCHEMA && (state.onboardingDone !== true || t.replay || signupPreview)) return r;
    return state.onboardingDone ? home() : draft.onboarding ? hasAcceptedSetupTerms(draft.onboarding) ? { section: 'onboarding', step: safeOnboardingStep(draft.onboarding, draft.onboarding.currentStep) } : { section: 'terms' } : { section: 'welcome' };
  }
  if (state.onboardingDone === false && !['welcome', 'terms', 'onboarding'].includes(r.section) && !(r.section === 'life' && ['account-access','account-recovery'].includes(r.page))) return { section: 'welcome' };
  if (signupPreview && state.onboardingDone === true && r.section === 'welcome' && r.page !== 'home') return { section: 'welcome', page: 'home' };
  if (state.onboardingDone === true && ['welcome', 'terms', 'onboarding'].includes(r.section) && !signupPreview) return home();
  if (r.section === 'onboarding') return hasAcceptedSetupTerms(draft.onboarding) ? { ...r, step: safeOnboardingStep(draft.onboarding, route?.step) } : { section: 'terms' };
  if (r.section === 'pay' && r.page === 'service' && !getPaymentService(r.id)) return { section: 'pay', page: 'home' };
  if (r.section === 'boxes') {
    if (r.page === 'create' && (!draft.box || draft.box.completed || draft.box.createdId)) return outsideFlow(r, { section: 'boxes', page: 'home' });
    if (['detail', 'edit', 'hack'].includes(r.page) && !exists(state, 'boxes', r.id)) return { section: 'boxes', page: 'home' };
  }
  if (r.section === 'plan' && r.page === 'create' && (!draft.plan || draft.plan.completed)) return outsideFlow(r, { section: 'plan', page: 'home' });
  if (r.section === 'life') {
    if (r.page === 'iou-create' && (!draft.iouCreate || draft.iouCreate.completed)) return outsideFlow(r, { section: 'life', page: 'ious', filter: draft.iouCreate?.type || r.filter || 'owedToMe' });
    if (r.page === 'group-create' && (!draft.groupCreate || draft.groupCreate.completed || draft.groupCreate.createdId)) return outsideFlow(r, { section: 'life', page: 'groups' });
    if (r.page === 'group-create' && r.step > 2 && !draft.groupCreate.members?.length) return { section: 'life', page: 'group-create', step: 2 };
    if (['group-detail', 'group-chat'].includes(r.page) && !exists(state, 'groups', r.id)) return { section: 'life', page: 'groups' };
    if (r.page === 'group-chat' && Array.isArray(state.groups)) {
      const group = state.groups.find(g => cleanId(g.id) === r.id);
      if (!group || !canReadGroup(group)) return { section: 'life', page: 'group-detail', id: r.id };
    }
    if (r.page === 'iou-detail' && !exists(state, 'ious', r.id)) return { section: 'life', page: 'ious', filter: r.filter || 'owedToMe' };
  }
  if (r.section === 'pay' && draft.payment?.serviceId && ['recipient', 'recipient-confirm', 'conversation', 'amount'].includes(r.page)) {
    const completed = committedPayment(state, draft.payment);
    if (completed) return typeof completed === 'string' ? { section: 'pay', page: 'status', id: completed } : { section: 'pay', page: 'home' };
    return { section: 'pay', page: 'review', backTo: { section: 'pay', page: 'service', id: draft.payment.serviceId, edit: true } };
  }
  if (r.section === 'pay' && PAYMENT_STEPS.has(r.page)) {
    const payment = draft.payment, completed = committedPayment(state, payment);
    if (completed) return typeof completed === 'string' ? { section: 'pay', page: 'status', id: completed } : { section: 'pay', page: 'home' };
    if (!payment) return outsideFlow(r, { section: 'pay', page: 'home' });
    const details = { section: 'pay', page: 'recipient', ...(r.edit ? { edit: true } : {}), backTo: r.edit ? { section: 'pay', page: 'review' } : payment.flowOrigin || { section: 'pay', page: 'home' } };
    if (r.page === 'recipient-confirm' && !recipientLookupMatches(payment)) return details;
    if (payment.lookupRequired && ['amount', 'review', 'pause'].includes(r.page) && !recipientLookupMatches(payment, { confirmed: true })) return recipientLookupMatches(payment) ? { section: 'pay', page: 'recipient-confirm', ...(r.edit ? { edit: true } : {}), backTo: details } : details;
    if (['amount', 'review', 'pause'].includes(r.page) && !payment.recipient) return { section: 'pay', page: 'recipient' };
    if (['review', 'pause'].includes(r.page) && (!Number.isSafeInteger(payment.amount) || payment.amount <= 0)) return { section: 'pay', page: 'amount' };
    if (r.page === 'pause' && !evaluatePayment(state, payment).needed) return { section: 'pay', page: 'review' };
  }
  return r;
}

function transient(route) {
  const r = normalize(route);
  return ['welcome', 'terms', 'onboarding', 'activation', 'tour'].includes(r.section)
    || (['boxes', 'plan'].includes(r.section) && r.page === 'create')
    || (r.section === 'pay' && (PAYMENT_STEPS.has(r.page) || ['status', 'fund-status', 'fund'].includes(r.page)))
    || (r.section === 'life' && ['group-create', 'iou-create', 'recovery'].includes(r.page));
}

/** A prior-destination trail, excluding next. Root navigation starts a fresh trail. */
export function compactTrail(trail, next, { finish = false, root = false } = {}) {
  if (root) return [];
  const target = normalize(next), targetKey = routeKey(target);
  let compact = [];
  for (const route of Array.isArray(trail) ? trail : []) {
    if (!hasRoute(route)) continue;
    const r = normalize(route), key = routeKey(r);
    if (finish && transient(r)) continue;
    const old = compact.findIndex(item => routeKey(item) === key);
    if (old >= 0) compact = compact.slice(0, old);
    compact.push(r);
  }
  const targetIndex = compact.findIndex(item => routeKey(item) === targetKey);
  if (targetIndex >= 0) return compact.slice(0, targetIndex);
  if (finish) {
    const parent = parentRoute(target), parentKey = routeKey(parent);
    const index = compact.findIndex(item => routeKey(item) === parentKey);
    if (index >= 0) compact = compact.slice(0, index + 1);
    else if (parentKey !== targetKey && !transient(parent)) compact.push(parent);
  }
  return compact;
}
