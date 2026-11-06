const INTERACTIVE = 'input,textarea,select,button,a,summary,form,label,[role="button"],[role="slider"],[contenteditable]:not([contenteditable="false"]),[data-no-home-swipe],[data-horizontal-scroll]';
const EDITABLE = 'input,textarea,select,[contenteditable]:not([contenteditable="false"])';
const asElement = node => node?.nodeType === 3 ? node.parentElement : node;
const validPoint = point => Number.isFinite(point?.clientX) && Number.isFinite(point?.clientY);

/** Only the Home drawer responds here. Passive touches preserve app/chat navigation and native scrolling. */
export function bindHomeMovesGesture({
  target,
  isOpen = () => false,
  onChange,
  document: doc = globalThis.document,
  now = () => Date.now(),
} = {}) {
  if (!target?.addEventListener || typeof onChange !== 'function') return () => {};
  let alive = true, gesture = null;
  const opened = () => !!(typeof isOpen === 'function' ? isOpen() : isOpen);
  const reset = () => { gesture = null; };
  const inside = node => !!node && (!target.contains || target.contains(node));
  const current = () => alive && target.isConnected !== false && !target.hidden && !target.inert && !doc?.hidden && target.getAttribute?.('aria-hidden') !== 'true' && !target.closest?.('[inert],[hidden]');
  const blockedDocument = () => {
    if (doc?.querySelector?.('[aria-modal="true"]:not([hidden]),dialog[open]')) return true;
    const selection = doc?.getSelection?.() || doc?.defaultView?.getSelection?.();
    return !!selection && (selection.isCollapsed === false || String(selection).trim().length > 0);
  };
  const context = node => {
    const element = asElement(node);
    if (!inside(element) || element.isContentEditable || element.matches?.(EDITABLE) || element.closest?.('[inert],[hidden],[data-no-home-swipe]')) return null;
    const toggle = element.closest?.('[data-home-moves-toggle]');
    if (toggle && inside(toggle)) return { toggle: true, content: null, element };
    if (element.closest?.(INTERACTIVE)) return null;
    const content = element.closest?.('[data-home-moves]');
    return { toggle: false, content: inside(content) ? content : null, element };
  };
  const validOrigin = origin => origin.element.isConnected !== false && inside(origin.element) && !origin.element.closest?.('[inert],[hidden]');
  const atTop = origin => {
    if (origin.toggle) return true;
    if (!origin.content || origin.content.isConnected === false) return false;
    // A nested scrolling list also keeps a downward gesture while reading older activity.
    for (let node = origin.element; node && node !== target; node = node.parentElement) {
      if (Number(node.scrollTop) > 1) return false;
      if (node === origin.content) break;
    }
    return Number(origin.content.scrollTop || 0) <= 1;
  };
  const start = event => {
    reset();
    if (!current() || blockedDocument() || event.touches?.length !== 1) return;
    const origin = context(event.target), point = event.touches[0], rect = target.getBoundingClientRect?.();
    if (!origin || !validPoint(point)) return;
    const left = rect?.left ?? rect?.x ?? 0, width = rect?.width || target.clientWidth || 0;
    if (!width || point.clientX - left < 20 || point.clientX - left > width - 20) return;
    if (Number.isFinite(rect?.top) && Number.isFinite(rect?.height) && rect.height > 0 && (point.clientY < rect.top + 6 || point.clientY > rect.top + rect.height - 6)) return;
    gesture = { id: point.identifier, x: point.clientX, y: point.clientY, at: now(), open: opened(), origin, axis: null, canClose: atTop(origin) };
  };
  const move = event => {
    if (!gesture) return;
    if (!current() || blockedDocument() || !validOrigin(gesture.origin) || opened() !== gesture.open || event.touches?.length !== 1) return reset();
    const point = event.touches[0];
    if (!validPoint(point) || point.identifier !== gesture.id) return reset();
    if (gesture.axis) return;
    const dx = Math.abs(point.clientX - gesture.x), dy = Math.abs(point.clientY - gesture.y);
    if (Math.max(dx, dy) < 12) return;
    if (dx > dy * 1.5) gesture.axis = 'horizontal';
    else if (dy > dx * 1.5) gesture.axis = 'vertical';
  };
  const end = event => {
    const finished = gesture; reset();
    if (!finished || !current() || blockedDocument() || !validOrigin(finished.origin) || opened() !== finished.open || event.touches?.length || event.changedTouches?.length !== 1) return;
    const point = event.changedTouches[0];
    if (!validPoint(point) || point.identifier !== finished.id) return;
    const elapsed = now() - finished.at, dx = point.clientX - finished.x, dy = point.clientY - finished.y;
    if (elapsed < 0 || elapsed > 900 || finished.axis === 'horizontal' || Math.abs(dy) < 56 || Math.abs(dy) <= Math.abs(dx) * 1.5) return;
    if (dy < 0 && !finished.open) onChange(true, { gesture: true });
    else if (dy > 0 && finished.open && finished.canClose && atTop(finished.origin)) onChange(false, { gesture: true });
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
