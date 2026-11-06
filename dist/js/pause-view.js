import { cash, esc, icon } from './ui.js';

const money = value => cash(Number.isSafeInteger(value) ? Math.max(0, value) : 0, { decimals: false });
const button = (value, className) => value ? `<button type="button" class="${className}" ${value.attributes || ''}${value.disabled ? ' disabled' : ''}>${esc(value.label)}</button>` : '';

/** Shared presentation for a payment Pause and its isolated sample in the tour. */
export function renderPauseScreen({
  amount = 0, metric = 0, kind = 'reserved', recipient = '', sample = false, tour = false,
  primary, secondary, headerLeft, headerRight, footerNote = '', className = '', ariaLabel = '', reservedFrom = '', alternatives = '', reason = '',
} = {}) {
  const reserved = kind === 'reserved', existingGap = kind === 'existing-gap';
  const source = ['plan', 'cushion', 'plan and cushion'].includes(reservedFrom) ? reservedFrom : 'plan or cushion';
  const metricText = money(metric);
  const size = metricText.length > 12 ? 35 : metricText.length > 10 ? 43 : metricText.length > 8 ? 54 : 70;
  const context = `${sample ? 'Sample payment' : 'Sending'} · ${money(amount)}${recipient ? ` to ${recipient}` : ''}`;
  return `<section class="pause-screen${sample ? ' pause-screen--sample' : ''}${tour ? ' pause-screen--tour' : ''}${className ? ` ${esc(className)}` : ''}" aria-label="${esc(ariaLabel || 'Lumo Pause')}">
    <header class="pause-screen-header">${headerLeft ? `<button type="button" class="pause-screen-back" ${headerLeft.attributes || ''} aria-label="${esc(headerLeft.label)}">${icon('back', 20)}</button>` : '<span class="pause-screen-header-spacer"></span>'}<span>Lumo Pause</span>${button(headerRight, 'pause-screen-exit')}</header>
    <div class="pause-screen-main"><img class="pause-screen-lux" src="/assets/lux-pause-2d.webp" alt="Lux holding up a hand to pause" width="168" height="168" decoding="async"><h1 class="pause-screen-impact" data-tour-feedback tabindex="-1"><span>${reserved ? 'This payment would use' : existingGap ? 'Your plan is already' : 'You’d have'}</span><strong style="--pause-number-size:${size}px">${esc(metricText)}</strong><span>${reserved ? `from your ${source}.` : existingGap ? 'short.' : 'left after your plan.'}</span></h1>${reason ? `<p class="pause-screen-reason">${esc(reason)}</p>` : ''}</div>
    <footer class="pause-screen-footer"><p class="pause-screen-context">${esc(context)}</p>${alternatives}<div class="pause-screen-actions">${button(primary, 'pause-screen-primary')}${button(secondary, 'pause-screen-secondary')}</div>${sample || footerNote ? `<p class="pause-screen-note">${sample ? '<span>SAMPLE MONEY</span>' : ''}${footerNote ? `<span>${esc(footerNote)}</span>` : ''}</p>` : ''}<span class="pause-gate" role="status" aria-live="polite"></span><p class="pause-screen-error" id="payment-error" role="alert" hidden></p></footer>
  </section>`;
}
