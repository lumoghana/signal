const editable = element => element?.matches?.('textarea,input:not([type="checkbox"]):not([type="radio"]):not([type="button"]):not([type="submit"]):not([type="date"])') && !element.disabled && !element.readOnly;
let firstMeetSeen = false;

/** Resize the app to the space above a mobile keyboard; keep the complete editor visible. */
export function installExperienceClarity() {
  if (!globalThis.document || !globalThis.window) return () => {};
  const page = document.documentElement, viewport = window.visualViewport;
  let baseline = Math.max(window.innerHeight, viewport?.height || 0), width = window.innerWidth;
  let keyboardObserved = false;
  let frame = 0, stopped = false;
  const timers = new Set();
  const reveal = () => {
    const input = document.activeElement;
    if (!editable(input) || !input.isConnected) return;
    const app = document.getElementById('app'), scope = input.closest('.activation-page,.onb-page,.onboarding-page,.page,.sheet');
    const bounds = input.getBoundingClientRect(), appBounds = app?.getBoundingClientRect();
    let top = Math.max(viewport?.offsetTop || 0, appBounds?.top || 0) + 10;
    let bottom = Math.min((viewport?.offsetTop || 0) + (viewport?.height || window.innerHeight), appBounds?.bottom || Infinity) - 10;
    const footer = scope?.querySelector('.activation-footer,.onb-footer,.bottom-action');
    if (footer && !footer.contains(input)) {
      const rect = footer.getBoundingClientRect();
      if (rect.height && rect.bottom > top && rect.top < bottom) bottom = Math.min(bottom, rect.top - 10);
    }
    let scroll = input.parentElement;
    while (scroll && scroll !== document.body) {
      const style = getComputedStyle(scroll);
      if (/(auto|scroll)/.test(style.overflowY) && scroll.scrollHeight > scroll.clientHeight + 1) break;
      scroll = scroll.parentElement;
    }
    if (!scroll || scroll === document.body) return;
    const rect = scroll.getBoundingClientRect();
    top = Math.max(top, rect.top + 6); bottom = Math.min(bottom, rect.bottom - 6);
    if (bottom <= top) return;
    const delta = bounds.bottom > bottom ? bounds.bottom - bottom : bounds.top < top ? bounds.top - top : 0;
    if (Math.abs(delta) > 1) scroll.scrollBy({ top: delta, left: 0, behavior: 'auto' });
  };
  const update = () => {
    frame = 0; if (stopped) return;
    const visible = viewport?.height || window.innerHeight;
    const focused = !!editable(document.activeElement);
    if (Math.abs(window.innerWidth - width) > 80) {
      width = window.innerWidth; baseline = Math.max(window.innerHeight, visible); keyboardObserved = false;
    }
    // A focusout can precede focusin while the keyboard remains open. Keep its
    // full-height reference until the viewport has recovered, rather than
    // mistaking the next field for a page without a keyboard.
    if (!focused && !keyboardObserved) baseline = Math.max(window.innerHeight, visible);
    else baseline = Math.max(baseline, window.innerHeight, visible);
    const contracted = baseline - visible > 110;
    if (focused && contracted) keyboardObserved = true;
    else if (!contracted) keyboardObserved = false;
    page.style.setProperty('--visible-app-height', `${Math.round(visible)}px`);
    page.style.setProperty('--visible-app-offset-top', `${Math.max(0, Math.round(viewport?.offsetTop || 0))}px`);
    page.classList.toggle('lumo-keyboard-open', contracted && (focused || keyboardObserved));
    reveal();
  };
  const schedule = () => { if (!frame && !stopped) frame = requestAnimationFrame(update); };
  const focus = () => {
    schedule();
    for (const delay of [80, 240, 460]) {
      const id = setTimeout(() => { timers.delete(id); schedule(); }, delay); timers.add(id);
    }
  };
  const welcome = () => {
    const root = document.querySelector('.welcome[data-first-meet="true"]');
    if (!root || root.dataset.celebrationChecked) return;
    root.dataset.celebrationChecked = 'true';
    let seen = firstMeetSeen;
    try { seen ||= localStorage.getItem('lumo-first-meet-v1') === 'seen'; localStorage.setItem('lumo-first-meet-v1', 'seen'); } catch { /* Keep the in-memory session marker when storage is unavailable. */ }
    firstMeetSeen = true;
    if (!seen) root.classList.add('first-meet-enter');
  };
  const observer = new MutationObserver(() => { welcome(); schedule(); });
  const view = document.getElementById('view'); if (view) observer.observe(view, { childList: true });
  window.addEventListener('resize', schedule); viewport?.addEventListener('resize', schedule); viewport?.addEventListener('scroll', schedule);
  document.addEventListener('focusin', focus); document.addEventListener('focusout', focus);
  welcome(); schedule();
  return () => {
    stopped = true; if (frame) cancelAnimationFrame(frame); timers.forEach(clearTimeout); observer.disconnect();
    window.removeEventListener('resize', schedule); viewport?.removeEventListener('resize', schedule); viewport?.removeEventListener('scroll', schedule);
    document.removeEventListener('focusin', focus); document.removeEventListener('focusout', focus);
  };
}
