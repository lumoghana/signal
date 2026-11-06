/** Horizontal chat navigation never approves a payment or modifies account state. */
const APP_PAGES = Object.freeze({
  home: new Set(['home']),
  activity: new Set(['home', 'insights', 'upcoming']),
  pay: new Set(['home', 'transaction', 'recipients-list', 'cards']),
  boxes: new Set(['home', 'detail']),
  plan: new Set(['home']),
  groups: new Set(['home', 'detail', 'chat']),
  life: new Set(['overview', 'ious', 'iou-detail', 'groups', 'group-detail', 'group-chat', 'story', 'settings', 'help']),
});
const INTERACTIVE = 'input,textarea,select,button,a,summary,form,label,[role="slider"],[role="button"],[contenteditable]:not([contenteditable="false"]),[data-no-chat-swipe],.chips,.chat-actions,.chat-quick-actions,[data-horizontal-scroll]';
const EDITABLE = 'input,textarea,select,[contenteditable]:not([contenteditable="false"])';

export function canOpenChatBySwipe(route) {
  if (!route || route.edit || route.editing || route.mode === 'edit') return false;
  const pages = APP_PAGES[route.section];
  const page = route.page || (route.section === 'life' ? 'overview' : 'home');
  return !!pages && pages.has(page);
}

const identity = route => JSON.stringify([route?.section, route?.page || '', route?.id || '', route?.step ?? '', route?.hubTab || '', route?.filter || '', route?.month || '', !!route?.edit]);
const asElement = node => node?.nodeType === 3 ? node.parentElement : node;
const editable = node => !!node && (node.isContentEditable === true || !!node.matches?.(EDITABLE));

/** Passive touch listeners preserve vertical scrolling, taps, text editing and native edges. */
export function bindChatGestures({
  target,
  getRoute,
  isEnabled = () => true,
  onOpenChat,
  onReturnApp,
  document: doc = globalThis.document,
  now = () => Date.now(),
} = {}) {
  if (!target?.addEventListener || typeof getRoute !== 'function') return () => {};
  let alive = true, gesture = null;
  const reset = () => { gesture = null; };
  const current = () => alive && target.isConnected !== false && !doc?.hidden && isEnabled();
  const blockedDocument = () => {
    if (target.inert) return true;
    if (doc?.querySelector?.('[aria-modal="true"]:not([hidden]),dialog[open]')) return true;
    const selected = doc?.getSelection?.() || doc?.defaultView?.getSelection?.();
    return !!selected && (selected.isCollapsed === false || String(selected).trim().length > 0);
  };
  const blockedTarget = node => {
    const element = asElement(node);
    if (!element || editable(element) || element.closest?.(INTERACTIVE) || element.closest?.('[inert]')) return true;
    // A locally scrollable strip keeps its own horizontal touch interaction.
    for (let item = element; item && item !== target; item = item.parentElement) {
      if (item.scrollWidth > item.clientWidth + 2) {
        const overflow = doc?.defaultView?.getComputedStyle?.(item)?.overflowX;
        if (overflow === 'auto' || overflow === 'scroll') return true;
      }
    }
    return false;
  };
  const start = event => {
    reset();
    if (!current() || event.touches?.length !== 1 || blockedDocument() || blockedTarget(event.target)) return;
    const route = getRoute(), fromChat = route?.section === 'chat' && (!route.page || route.page === 'home');
    if (!fromChat && !canOpenChatBySwipe(route)) return;
    const point = event.touches[0], rect = target.getBoundingClientRect?.();
    const left = rect?.left ?? rect?.x ?? 0, width = rect?.width || target.clientWidth || 0;
    const relative = point.clientX - left;
    if (!width || relative < 20 || relative > width - 20) return;
    gesture = { id: point.identifier, x: point.clientX, y: point.clientY, at: now(), axis: null, route: { ...route }, key: identity(route), fromChat };
  };
  const move = event => {
    if (!gesture) return;
    if (!current() || event.touches?.length !== 1 || blockedDocument() || identity(getRoute()) !== gesture.key) return reset();
    const point = event.touches[0];
    if (point.identifier !== gesture.id) return reset();
    if (gesture.axis) return;
    const dx = Math.abs(point.clientX - gesture.x), dy = Math.abs(point.clientY - gesture.y);
    if (Math.max(dx, dy) >= 12) gesture.axis = dx > dy * 1.5 ? 'horizontal' : 'vertical';
  };
  const end = event => {
    const finished = gesture; reset();
    if (!finished || !current() || event.touches?.length || blockedDocument() || identity(getRoute()) !== finished.key) return;
    const point = Array.from(event.changedTouches || []).find(touch => touch.identifier === finished.id);
    if (!point) return;
    const duration = now() - finished.at, dx = point.clientX - finished.x, dy = point.clientY - finished.y;
    if (duration < 0 || duration > 900 || finished.axis === 'vertical' || Math.abs(dx) < 72 || Math.abs(dx) <= Math.abs(dy) * 1.5) return;
    if (finished.fromChat && dx > 0) onReturnApp?.(finished.route);
    else if (!finished.fromChat && dx < 0 && canOpenChatBySwipe(getRoute())) onOpenChat?.(finished.route);
  };
  const options = { passive: true };
  target.addEventListener('touchstart', start, options);
  target.addEventListener('touchmove', move, options);
  target.addEventListener('touchend', end, options);
  target.addEventListener('touchcancel', reset, options);
  doc?.addEventListener?.('visibilitychange', reset, options);
  return () => {
    if (!alive) return;
    alive = false; reset();
    target.removeEventListener('touchstart', start, options);
    target.removeEventListener('touchmove', move, options);
    target.removeEventListener('touchend', end, options);
    target.removeEventListener('touchcancel', reset, options);
    doc?.removeEventListener?.('visibilitychange', reset, options);
  };
}
