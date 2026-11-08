import test from 'node:test';
import assert from 'node:assert/strict';
import { createRouter } from '../dist/js/router.js';
import { routeKey, sectionForRoute, parentRoute, safeRoute } from '../dist/js/navigation.js';
import { confirmFunding } from './helpers/activation-funding.js';

const home = { section: 'home', page: 'home' };
const groups = { section: 'life', page: 'groups' };
const pay = { section: 'pay', page: 'home' };
const rootFor = r => sectionForRoute(r) === 'groups' ? groups : { section: sectionForRoute(r), page: 'home' };

function harness({ initialRoute = home, saved, normalizer = r => r, nativeEntries } = {}) {
  let native = nativeEntries ? structuredClone(nativeEntries) : saved ? saved.entries.slice(0, saved.cursor + 1).map((entry, index) => ({ lumoNav: 2, generation: saved.generation, index, route: entry.route, kind: 'page' })) : [null];
  let pointer = native.length - 1;
  const popQueue = [], deltas = [], renders = [];
  const history = {
    get state() { return native[pointer]; },
    pushState(state) { native = native.slice(0, pointer + 1); native.push(structuredClone(state)); pointer += 1; },
    replaceState(state) { native[pointer] = structuredClone(state); },
    go(delta) {
      deltas.push(delta);
      const target = pointer + delta;
      if (target < 0 || target >= native.length) throw new Error(`Invalid native rewind ${delta}`);
      popQueue.push(target);
    },
  };
  const router = createRouter({ initialRoute, saved, history, normalize: normalizer, parent: parentRoute, key: routeKey, rootFor, onNavigate: (route, info) => renders.push({ route, ...info }) });
  const flush = () => {
    let safety = 30;
    while (popQueue.length) {
      if (!safety--) throw new Error('History loop');
      pointer = popQueue.shift();
      const state = history.state;
      if (state?.kind === 'page') router.receive(state);
    }
  };
  return { router, history, flush, renders, deltas, get native() { return native; }, get pointer() { return pointer; } };
}

test('initialise replaces current native state and restores a saved route and scroll', () => {
  const saved = { generation: 'existing-tab', cursor: 1, entries: [{ route: home, scroll: 0 }, { route: groups, scroll: 256 }] };
  const h = harness({ saved });
  h.router.initialise();
  assert.equal(h.history.state.index, 1);
  assert.equal(h.history.state.generation, 'existing-tab');
  assert.deepEqual(h.renders.at(-1), { route: groups, scroll: 256, restore: true });
  const snapshot = h.router.snapshot();
  snapshot.entries[1].route.page = 'mutated';
  assert.equal(h.router.current.page, 'groups');
});

test('native Back then Forward restore indexed destinations and each saved list position', () => {
  const h = harness(); h.router.initialise();
  h.router.go(groups); h.router.setScroll(380);
  const detail = { section: 'life', page: 'group-detail', id: 'weekend' };
  h.router.go(detail); h.router.setScroll(90);
  h.history.go(-1); h.flush();
  assert.deepEqual(h.renders.at(-1), { route: groups, scroll: 380, restore: true });
  h.history.go(1); h.flush();
  assert.deepEqual(h.renders.at(-1), { route: detail, scroll: 90, restore: true });
  assert.equal(h.router.index, 2);
});

test('reloading while a modal is open restores its base page and the next Back reaches the parent once', () => {
  const detail = { section: 'life', page: 'group-detail', id: 'trip' };
  const saved = { generation: 'modal-reload', cursor: 2, entries: [{ route: home, scroll: 0 }, { route: groups, scroll: 180 }, { route: detail, scroll: 420 }] };
  const h = harness({ saved });
  h.history.pushState({ ...h.history.state, kind: 'modal' });
  h.router.initialise();
  assert.equal(h.deltas.at(-1), -1);
  assert.equal(h.renders.length, 0, 'restore waits for the real base-page popstate');
  h.flush();
  assert.deepEqual(h.renders.at(-1), { route: detail, scroll: 420, restore: true });
  h.history.go(-1); h.flush();
  assert.deepEqual(h.router.current, groups);
  assert.equal(h.renders.at(-1).scroll, 180);
});

test('returning to a review rewinds an edit loop without adding a new page', () => {
  const h = harness(); h.router.initialise();
  const boxes = { section: 'boxes', page: 'home' }, review = { section: 'boxes', page: 'create', step: 'review' };
  h.router.go(boxes); h.router.go(review); h.router.setScroll(160);
  h.router.go({ section: 'boxes', page: 'create', step: 'target', edit: true });
  const count = h.native.length, rendered = h.renders.length;
  h.router.go(review);
  assert.equal(h.renders.length, rendered, 'wait for the actual popstate before rendering');
  h.flush();
  assert.equal(h.native.length, count);
  assert.equal(h.router.index, 2);
  assert.deepEqual(h.renders.at(-1), { route: review, scroll: 160, restore: true });
});

test('logical Back returns directly to a group parent and retains overview scroll', () => {
  const h = harness(); h.router.initialise();
  h.router.go(groups); h.router.setScroll(270);
  h.router.go({ section: 'life', page: 'group-detail', id: 'trip' });
  h.router.back(); h.flush();
  assert.deepEqual(h.router.current, groups);
  assert.equal(h.renders.at(-1).scroll, 270);
  const isolated = harness({ initialRoute: { section: 'life', page: 'group-detail', id: 'trip' } });
  isolated.router.initialise(); isolated.router.back();
  assert.deepEqual(isolated.router.current, groups);
  assert.equal(isolated.native.length, 1, 'a missing parent replaces rather than growing a loop');
});

test('finishing group creation removes old steps from actual native Forward history', () => {
  const h = harness(); h.router.initialise(); h.router.go(groups);
  for (let step = 0; step <= 3; step += 1) h.router.go({ section: 'life', page: 'group-create', step });
  const detail = { section: 'life', page: 'group-detail', id: 'created' }, before = h.renders.length;
  h.router.go(detail, { finish: true });
  assert.equal(h.renders.length, before);
  h.flush();
  assert.equal(h.renders.length, before + 1, 'the intermediate rewind does not flash on screen');
  assert.deepEqual(h.native.map(s => s.route), [home, groups, detail]);
  h.history.go(-1); h.flush(); h.history.go(1); h.flush();
  assert.deepEqual(h.router.current, detail);
  assert.equal(h.native.some(s => s.route?.page === 'group-create'), false);
});

test('finishing a resumed review does not mistake its newly invalid draft for a real Groups root', () => {
  const state = { onboardingDone: true, groups: [] }, draft = { groupCreate: { name: 'Legon trip' } };
  const h = harness({ normalizer: r => safeRoute(r, state, draft) });
  h.router.initialise(); h.router.go(groups);
  h.router.go({ section: 'life', page: 'group-create', step: 3 });
  state.groups.push({ id: 'created' });
  draft.groupCreate = null;
  const detail = { section: 'life', page: 'group-detail', id: 'created' };
  h.router.go(detail, { finish: true }); h.flush();
  assert.deepEqual(h.native.map(s => s.route), [home, groups, detail]);
  h.history.go(-1); h.flush();
  assert.deepEqual(h.router.current, groups);
  h.history.go(-1); h.flush();
  assert.deepEqual(h.router.current, home, 'one more Back reaches Home, not a disguised setup page');
});

test('reload after committing a group preserves historical wizard identities until finish prunes native history', () => {
  for (const steps of [[0, 1, 2, 3], [3]]) {
    const detail = { section: 'life', page: 'group-detail', id: 'created' };
    const state = { onboardingDone: true, groups: [{ id: 'created' }] }, draft = { groupCreate: null };
    const routes = [home, groups, ...steps.map(step => ({ section: 'life', page: 'group-create', step }))];
    const saved = { generation: `committed-before-finish-${steps.length}`, cursor: routes.length - 1, entries: routes.map(route => ({ route, scroll: 90 })) };
    const h = harness({ saved, normalizer: r => safeRoute(r, state, draft) });
    h.router.initialise();
    assert.deepEqual(h.router.current, groups, 'the displayed current route is normalized safely');
    assert.equal(h.renders.at(-1).scroll, 0, 'a different displayed destination starts at its top');
    assert.equal(h.router.snapshot().entries[2].route.page, 'group-create', 'the stored task identity remains available for pruning');
    h.router.go(detail, { finish: true }); h.flush();
    assert.deepEqual(h.native.map(s => s.route), [home, groups, detail]);
    h.history.go(-1); h.flush();
    assert.deepEqual(h.router.current, groups);
    h.history.go(-1); h.flush();
    assert.deepEqual(h.router.current, home);
  }
});

test('finishing a detail without its section in history inserts safe parent ancestry', () => {
  const h = harness(); h.router.initialise();
  h.router.go({ section: 'chat', page: 'home' });
  h.router.go({ section: 'life', page: 'iou-create', step: 3 });
  const detail = { section: 'life', page: 'iou-detail', id: 'new-iou' };
  h.router.go(detail, { finish: true }); h.flush();
  assert.deepEqual(h.native.map(s => s.route), [home, { section: 'life', page: 'ious', filter: 'owedToMe' }, detail]);
});

test('finishing a payment removes review and Pause while keeping its result available', () => {
  const h = harness(); h.router.initialise(); h.router.go(pay);
  for (const page of ['recipient', 'amount', 'review', 'pause']) h.router.go({ section: 'pay', page });
  const result = { section: 'pay', page: 'status', id: 'paid' };
  h.router.go(result, { finish: true }); h.flush();
  assert.deepEqual(h.native.map(s => s.route), [home, pay, result]);
  h.router.back(); h.flush();
  assert.deepEqual(h.router.current, pay);
});

test('a new destination consumes a modal checkpoint instead of adding another history entry', () => {
  const h = harness(); h.router.initialise(); h.router.go(groups);
  h.history.pushState({ ...h.history.state, kind: 'modal' });
  const detail = { section: 'life', page: 'group-detail', id: 'trip' };
  h.router.go(detail);
  assert.equal(h.native.length, 3);
  assert.equal(h.history.state.kind, 'page');
  assert.equal(h.router.index, 2);
  assert.deepEqual(h.native.map(s => s.route), [home, groups, detail]);
});

test('rewinding from a modal subtracts its one extra physical history entry', () => {
  const h = harness(); h.router.initialise(); h.router.go(groups);
  h.router.go({ section: 'life', page: 'group-detail', id: 'trip' });
  h.history.pushState({ ...h.history.state, kind: 'modal' });
  h.router.go(groups);
  assert.equal(h.deltas.at(-1), -2);
  h.flush();
  assert.equal(h.router.index, 1);
  assert.deepEqual(h.router.current, groups);
});

test('replacing a page under a modal rewinds one then replaces the real base page', () => {
  const h = harness(); h.router.initialise(); h.router.go(pay);
  h.history.pushState({ ...h.history.state, kind: 'modal' });
  const collect = { section: 'pay', page: 'collect' };
  h.router.go(collect, { replace: true });
  assert.equal(h.deltas.at(-1), -1);
  h.flush();
  assert.equal(h.router.index, 1);
  assert.equal(h.pointer, 1);
  assert.deepEqual(h.history.state.route, collect);
});

test('finishing from a modal rewinds its physical checkpoint and emits only the result', () => {
  const h = harness(); h.router.initialise(); h.router.go(groups);
  h.router.go({ section: 'life', page: 'group-create', step: 3 });
  h.history.pushState({ ...h.history.state, kind: 'modal' });
  const detail = { section: 'life', page: 'group-detail', id: 'new' }, before = h.renders.length;
  h.router.go(detail, { finish: true });
  assert.equal(h.deltas.at(-1), -2);
  h.flush();
  assert.equal(h.renders.length, before + 1);
  assert.deepEqual(h.native.map(s => s.route), [home, groups, detail]);
});

test('same-target navigation always notifies and closes a modal without creating a duplicate page', () => {
  const h = harness(); h.router.initialise(); h.router.go(groups);
  const before = h.renders.length;
  h.router.go(groups, { root: true });
  assert.equal(h.renders.length, before + 1);
  assert.equal(h.native.length, 2);
  h.history.pushState({ ...h.history.state, kind: 'modal' });
  h.router.go(groups); h.flush();
  assert.equal(h.router.index, 1);
  assert.deepEqual(h.router.current, groups);
});

test('root navigation clears an unfinished task from Back and Forward while preserving data outside the router', () => {
  const draft = { groupCreate: { name: 'Legon trip', target: 50000 } };
  const h = harness(); h.router.initialise(); h.router.go(groups);
  h.router.go({ section: 'life', page: 'group-create', step: 2 });
  h.router.go(home, { root: true }); h.flush();
  assert.equal(h.native.some(s => s.route?.page === 'group-create'), false);
  assert.deepEqual(h.router.current, home);
  assert.equal(draft.groupCreate.name, 'Legon trip');
});

test('operations requested during a rewind are handled sequentially without extra render loops', () => {
  const h = harness(); h.router.initialise(); h.router.go(groups);
  h.router.go({ section: 'life', page: 'group-detail', id: 'trip' });
  const before = h.renders.length;
  h.router.go(groups);
  h.router.go(pay, { root: true });
  h.flush();
  assert.deepEqual(h.router.current, pay);
  assert.equal(h.renders.length, before + 2);
  assert.equal(h.native.some(s => s.route?.page === 'group-detail'), false);
});

test('legacy app state is normalized, but an arbitrary external route state is ignored', () => {
  const h = harness(); h.router.initialise();
  h.router.receive({ unrelated: true, route: { section: 'pay', page: 'review' } });
  assert.deepEqual(h.router.current, home);
  h.router.receive({ lumo: true, route: groups });
  assert.deepEqual(h.router.current, groups);
  assert.equal(h.router.index, 0);
  assert.equal(h.history.state.lumoNav, 2);
});

test('route normalization can reject completed financial drafts without mutating them', () => {
  const state = { onboardingDone: true }, draft = { payment: null };
  const native = { state: null, pushState(s) { this.state = s; }, replaceState(s) { this.state = s; }, go() {} };
  const router = createRouter({ initialRoute: { section: 'pay', page: 'review' }, history: native, normalize: r => safeRoute(r, state, draft), key: routeKey, parent: parentRoute, rootFor });
  router.initialise();
  assert.deepEqual(router.current, pay);
  assert.deepEqual(draft, { payment: null });
});

test('rebasing signup at current Settings keeps external history outside its finish rewind', () => {
  const settings = { section: 'life', page: 'settings' };
  const prefix = [
    { external: 'design-reference' },
    { lumoNav: 2, generation: 'old-visit', index: 8, route: { section: 'welcome' }, kind: 'page' },
    null,
    { external: 'local-layout-check' }
  ];
  const oldSettings = { lumoNav: 2, generation: 'old-visit', index: 17, route: settings, kind: 'page' };
  // The app creates a new router with the current route, without restoring its
  // old logical indexes over the unrelated physical browser entries.
  const h = harness({ initialRoute: settings, nativeEntries: [...prefix, oldSettings] });
  h.router.initialise();
  assert.equal(h.pointer, prefix.length);
  assert.deepEqual(h.deltas, [], 'rebasing replaces the current entry without native navigation');
  assert.deepEqual(h.native.slice(0, prefix.length), prefix);
  assert.equal(h.history.state.index, 0);
  assert.notEqual(h.history.state.generation, oldSettings.generation);
  assert.deepEqual(h.router.current, settings);

  const signupSuffix = [
    { section: 'welcome' },
    { section: 'terms' },
    { section: 'onboarding', step: 'name' },
    { section: 'onboarding', step: 'phone' },
    { section: 'onboarding', step: 'code' },
    { section: 'onboarding', step: 'card-number' },
    { section: 'onboarding', step: 'selfie' },
    { section: 'onboarding', step: 'identity-review' },
    { section: 'onboarding', step: 'pin' }
  ];
  signupSuffix.forEach(route => h.router.go(route));
  assert.equal(h.pointer, prefix.length + signupSuffix.length);
  assert.deepEqual(h.deltas, [], 'entering signup only pushes a fresh contiguous suffix');
  h.router.go(settings, { finish: true });
  assert.deepEqual(h.deltas, [-signupSuffix.length], 'finish rewinds only the known signup suffix');
  h.flush();

  assert.deepEqual(h.native.slice(0, prefix.length), prefix, 'unrelated and old-generation entries are untouched');
  assert.deepEqual(h.native.slice(prefix.length).map(entry => entry.route), [home, settings]);
  assert.deepEqual(h.router.snapshot().entries.map(entry => entry.route), [home, settings]);
  assert.deepEqual(h.router.current, settings);
  assert.equal(h.pointer, prefix.length + 1);
});

test('finishing account creation, funding and budget removes activation pages from native history', async () => {
  const { createEmptyState } = await import('../dist/js/model.js');
  const { createActivationDraft, acknowledgeCreatedAccount, fundActivation, addActivationBudgetItem, saveActivationBudget, completeActivation } = await import('../dist/js/activation-model.js');
  let state = createEmptyState();
  const draft = {};
  const h = harness({ initialRoute: { section: 'welcome' }, normalizer: r => safeRoute(r, state, draft) });
  h.router.initialise();
  const account = createEmptyState({ phone: '0240000000' }); account.onboardingDone = true;
  account.accounts = [{id:'demo-operational',name:'Everyday account',type:'operational',status:'simulated-ready',reference:'DEMO-OPERATIONAL'}];
  draft.activation = createActivationDraft({ state: account });
  h.router.go({ section: 'activation', step: 'account-created' }, { finish: true }); h.flush();
  assert.deepEqual(h.router.current, { section: 'activation', step: 'account-created' });
  assert.equal(acknowledgeCreatedAccount(draft.activation).ok, true);
  h.router.go({ section: 'activation', step: 'fund' }); h.flush();
  assert.deepEqual(h.router.current, { section: 'activation', step: 'fund' });
  assert.equal(confirmFunding(draft.activation, { amount: 10000, source: 'Mobile money' }).ok, true);
  h.router.go({ section: 'activation', step: 'purpose' }); h.flush();
  addActivationBudgetItem(draft.activation, { name: 'Transport', amount: 6000 }); saveActivationBudget(draft.activation);
  h.router.go({ section: 'activation', step: 'ready' }); h.flush();
  state = completeActivation(draft.activation).state; delete draft.activation;
  h.router.go(home, { finish: true }); h.flush();
  assert.deepEqual(h.router.current, home);
  assert.equal(h.router.snapshot().entries.some(e => ['onboarding', 'activation', 'welcome'].includes(e.route.section)), false);
  assert.equal(h.native.slice(0, h.pointer + 1).some(e => ['onboarding', 'activation', 'welcome'].includes(e.route?.section)), false);
  assert.equal(state.wallet, 10000); assert.equal(state.budget.items[0].amount, 6000);
});

test('a copied session in a new tab retains the current form but never rewinds phantom browser entries', () => {
  const settings={section:'life',page:'settings'},security={section:'life',page:'account-security'},login={section:'life',page:'account-login-setup'};
  const saved={generation:'opener-history',cursor:3,entries:[home,settings,security,login].map((route,index)=>({route,scroll:index*100}))};
  const h=harness({saved,nativeEntries:[null]});h.router.initialise();
  assert.deepEqual(h.router.current,login);assert.equal(h.router.index,0);assert.equal(h.renders.at(-1).scroll,300);
  assert.notEqual(h.history.state.generation,saved.generation);assert.deepEqual(h.deltas,[]);
  h.router.back();h.flush();assert.deepEqual(h.router.current,security);assert.deepEqual(h.deltas,[]);assert.equal(h.pointer,0);
  assert.equal(saved.entries.length,4,'rebasing does not mutate the persisted snapshot or form data');
});

test('a normal reload retains Security ancestry and Back stays with the labelled parent', () => {
  const settings={section:'life',page:'settings'},security={section:'life',page:'account-security'},login={section:'life',page:'account-login-setup'};
  const first=harness();first.router.initialise();first.router.go(settings);first.router.go(security);first.router.setScroll(184);first.router.go(login);
  const saved=first.router.snapshot(),restored=harness({saved});restored.router.initialise();restored.router.back();restored.flush();
  assert.deepEqual(restored.router.current,security);assert.equal(restored.renders.at(-1).scroll,184);assert.equal(restored.router.index,2);
});

test('a stale modal from another history generation is replaced without an external rewind', () => {
  const current={section:'life',page:'account-statements'},saved={generation:'copied-tab',cursor:1,entries:[{route:home,scroll:0},{route:current,scroll:75}]};
  const foreign={lumoNav:2,generation:'different-tab',index:1,route:current,kind:'modal'};
  const h=harness({saved,nativeEntries:[{external:'reference'},foreign]});h.router.initialise();
  assert.deepEqual(h.router.current,current);assert.deepEqual(h.deltas,[]);assert.equal(h.pointer,1);assert.equal(h.history.state.kind,'page');
  assert.deepEqual(h.native[0],{external:'reference'});h.router.back();h.flush();assert.deepEqual(h.router.current,{section:'life',page:'settings'});assert.deepEqual(h.deltas,[]);
});
