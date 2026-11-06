/** Indexed page history. Modal checkpoints occupy one physical native entry only. */
const HOME = { section: 'home', page: 'home' };
const isRoute = value => !!value && typeof value === 'object' && !Array.isArray(value) && typeof value.section === 'string';
const clone = value => JSON.parse(JSON.stringify(value));
const newGeneration = () => globalThis.crypto?.randomUUID?.() || `lumo-${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
const scrollValue = value => Number.isFinite(Number(value)) ? Math.max(0, Number(value)) : 0;

function transient(route) {
  return ['welcome', 'onboarding', 'activation', 'tour'].includes(route.section)
    || (['boxes', 'plan'].includes(route.section) && route.page === 'create')
    || (route.section === 'pay' && ['recipient', 'recipient-confirm', 'amount', 'review', 'pause', 'status', 'fund-status', 'fund'].includes(route.page))
    || (route.section === 'life' && ['group-create', 'iou-create', 'recovery'].includes(route.page));
}

export function createRouter({ initialRoute = HOME, saved, history, onNavigate = () => {}, normalize = value => value, parent = () => HOME, key = value => JSON.stringify(value), rootFor = () => HOME } = {}) {
  if (!history || !['pushState', 'replaceState', 'go'].every(name => typeof history[name] === 'function')) throw new TypeError('A native history adapter is required.');
  const normal = value => {
    let result;
    try { result = normalize(clone(isRoute(value) ? value : HOME)); } catch { result = HOME; }
    return clone(isRoute(result) ? result : HOME);
  };
  // A completed draft may normalize an old setup page to a root. Its historical
  // identity must stay stable until that native entry is actually revisited.
  const identity = value => key(clone(isRoute(value) ? value : HOME));
  const same = (a, b) => identity(a) === identity(b);
  const validSaved = saved && typeof saved.generation === 'string' && saved.generation.length > 0
    && Array.isArray(saved.entries) && saved.entries.length > 0
    && saved.entries.every(entry => entry && isRoute(entry.route))
    && Number.isInteger(saved.cursor) && saved.cursor >= 0 && saved.cursor < saved.entries.length;
  // A new tab can receive a copy of the opener's sessionStorage without its
  // physical history. Only rewind saved indexes when this browser entry proves
  // it belongs to that exact history generation and position.
  const nativeAnchor = history.state;
  const matchingHistory = validSaved && nativeAnchor?.lumoNav === 2
    && nativeAnchor.generation === saved.generation && nativeAnchor.index === saved.cursor
    && ['page', 'modal'].includes(nativeAnchor.kind);
  let generation = matchingHistory ? saved.generation : newGeneration();
  // Preserve historical identities. A draft cleared just before reload must not
  // turn every old wizard entry into an apparently genuine section root.
  const savedCurrent = validSaved ? saved.entries[saved.cursor] : null;
  let entries = matchingHistory ? saved.entries.map(entry => ({ route: clone(entry.route), scroll: scrollValue(entry.scroll) }))
    : [{ route: savedCurrent ? clone(savedCurrent.route) : normal(initialRoute), scroll: savedCurrent ? scrollValue(savedCurrent.scroll) : 0 }];
  let cursor = matchingHistory ? saved.cursor : 0;
  if (validSaved && !same(entries[cursor].route, normal(entries[cursor].route))) entries[cursor].scroll = 0;
  let pending = null;
  const queue = [];

  const pageState = () => ({ lumoNav: 2, generation, index: cursor, route: normal(entries[cursor].route), kind: 'page' });
  const modalAbovePage = () => history.state?.kind === 'modal';
  const notify = restore => onNavigate(normal(entries[cursor].route), { scroll: entries[cursor].scroll, restore });
  const replaceNative = () => history.replaceState(pageState(), '');

  function drain() {
    if (!pending && queue.length) perform(queue.shift());
  }

  function pushed(route, consumeModal = false) {
    entries = entries.slice(0, cursor + 1);
    entries.push({ route: normal(route), scroll: 0 });
    cursor += 1;
    if (consumeModal) replaceNative();
    else history.pushState(pageState(), '');
  }

  function replaced(route, { notifyNow = true, restore = false, truncateForward = false } = {}) {
    const next = normal(route), unchanged = same(next, entries[cursor].route);
    if (truncateForward) entries = entries.slice(0, cursor + 1);
    entries[cursor] = { route: next, scroll: unchanged ? entries[cursor].scroll : 0 };
    replaceNative();
    if (notifyNow) notify(restore || unchanged);
  }

  function rewind(operation, index, extra = modalAbovePage() ? 1 : 0) {
    const delta = index - cursor - extra;
    pending = { ...operation, expectedIndex: index };
    if (!delta) completePending();
    else history.go(delta);
  }

  function canonicalRoot(route) {
    const result = normal(rootFor(clone(route)));
    return transient(result) ? normal(HOME) : result;
  }

  function finishPlan(operation) {
    const target = normal(operation.target), canonical = canonicalRoot(target);
    let anchor = -1;
    for (let i = cursor; i >= 0; i -= 1) if (same(entries[i].route, canonical)) { anchor = i; break; }
    // An older section root reached through an unfinished task is not safe ancestry.
    if (anchor > 0 && entries.slice(0, anchor + 1).some(entry => transient(entry.route))) anchor = -1;
    const forceHome = anchor < 0;
    if (forceHome) anchor = 0;
    const needsFreshPush = anchor < entries.length - 1 || modalAbovePage();
    rewind({ ...operation, target, canonical, forceHome, needsFreshPush }, anchor);
  }

  function completePending() {
    const operation = pending;
    if (!operation) return;
    pending = null;
    cursor = operation.expectedIndex;
    if (operation.type === 'override') {
      replaced(operation.target, { restore: true });
    } else if (operation.type === 'replace') {
      replaced(operation.target, { truncateForward: operation.fromModal });
    } else {
      entries = entries.slice(0, cursor + 1);
      if (operation.forceHome) replaced(HOME, { notifyNow: false });
      let safeParent = operation.root ? operation.canonical : normal(parent(clone(operation.target)));
      if (transient(safeParent)) safeParent = operation.canonical;
      if (same(operation.target, operation.canonical)) safeParent = operation.canonical;
      if (!same(entries[cursor].route, safeParent) && !same(safeParent, operation.target)) pushed(safeParent);
      if (!same(entries[cursor].route, operation.target) || operation.needsFreshPush) pushed(operation.target);
      else replaced(operation.target, { notifyNow: false });
      notify(false);
    }
    drain();
  }

  function perform(operation) {
    if (pending) { queue.push(operation); return; }
    if (operation.type === 'finish') { finishPlan(operation); return; }
    const target = normal(operation.target);
    let earlier = -1;
    for (let i = cursor - 1; i >= 0; i -= 1) if (same(entries[i].route, target)) { earlier = i; break; }
    if (earlier >= 0) { rewind({ type: 'override', target }, earlier); return; }
    const fromModal = modalAbovePage();
    if (operation.replace || same(entries[cursor].route, target)) {
      if (fromModal) rewind({ type: 'replace', target, fromModal: true }, cursor, 1);
      else { replaced(target); drain(); }
      return;
    }
    pushed(target, fromModal);
    notify(false);
    drain();
  }

  function go(next, { replace = false, finish = false, root = false } = {}) {
    const target = normal(next);
    // Re-selecting the current root still emits a render, without growing history.
    if (root && !pending && same(target, entries[cursor].route) && cursor === entries.length - 1 && !modalAbovePage()) {
      replaced(target);
      return;
    }
    perform({ type: finish || root ? 'finish' : 'page', target, replace, root });
  }

  function back() {
    const destination = normal(parent(normal(entries[cursor].route)));
    go(destination, { replace: true });
  }

  function resetFromNative(state) {
    const trusted = state?.lumo === true || state?.lumoNav === 2;
    const route = normal(trusted && isRoute(state.route) ? state.route : HOME);
    pending = null;
    queue.length = 0;
    entries = [{ route, scroll: 0 }];
    cursor = 0;
    generation = newGeneration();
    replaceNative();
    notify(true);
  }

  function receive(state) {
    if (state?.kind === 'modal') return false;
    const valid = state?.lumoNav === 2 && state.generation === generation
      && state.kind === 'page' && Number.isInteger(state.index)
      && state.index >= 0 && state.index < entries.length;
    if (!valid) { resetFromNative(state); return false; }
    cursor = state.index;
    if (pending) {
      if (cursor === pending.expectedIndex) completePending();
      else history.go(pending.expectedIndex - cursor);
    } else {
      entries[cursor].route = normal(entries[cursor].route);
      replaceNative();
      notify(true);
      drain();
    }
    return true;
  }

  return {
    get current() { return normal(entries[cursor].route); },
    get index() { return cursor; },
    setScroll(value) { entries[cursor].scroll = scrollValue(value); },
    go,
    back,
    receive,
    snapshot() { return { entries: clone(entries), cursor, generation }; },
    initialise() {
      if (modalAbovePage() && (!validSaved || matchingHistory)) rewind({ type: 'replace', target: entries[cursor].route, fromModal: true }, cursor, 1);
      else { replaceNative(); notify(true); }
    },
  };
}
