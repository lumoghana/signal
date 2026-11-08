import { cash, esc, icon } from './ui.js';

const money = value => cash(Number.isSafeInteger(value) ? Math.max(0, value) : 0, { decimals: false });
const button = (value, className) => value ? `<button type="button" class="${className}" ${value.attributes || ''}${value.disabled ? ' disabled' : ''}>${esc(value.label)}</button>` : '';

/** One consequence, shared by a payment decision and isolated tour examples. */
export function renderPauseScreen({
  amount = 0, metric = 0, kind = 'reserved', recipient = '', sample = false, tour = false,
  primary, secondary, headerLeft, headerRight, footerNote = '', className = '', ariaLabel = '', reservedFrom = '', alternatives = '', reason = '', consequence,
} = {}) {
  const source = ['plan', 'cushion', 'plan and cushion'].includes(reservedFrom) ? reservedFrom : 'plan or cushion';
  const fallback = kind === 'remaining'
    ? { before: 'You’d have ', strong: money(metric), after: ' left after your plan.' }
    : kind === 'existing-gap'
      ? { before: 'Your plan is already ', strong: `${money(metric)} short`, after: '.' }
      : { before: 'This payment would use ', strong: money(metric), after: ` from your ${source}.` };
  const message = consequence || fallback;
  const context = `${sample ? 'Sample payment' : 'Sending'} · ${money(amount)}${recipient ? ` to ${recipient}` : ''}`;
  const details = !sample && (alternatives || reason) ? `<details class="pause-screen-details"><summary>Payment details</summary><p class="pause-screen-context">${esc(context)}</p>${reason ? `<p class="pause-screen-reason">${esc(reason)}</p>` : ''}${alternatives}</details>` : '';
  return `<section class="pause-screen${sample ? ' pause-screen--sample' : ''}${tour ? ' pause-screen--tour' : ''}${className ? ` ${esc(className)}` : ''}" aria-label="${esc(ariaLabel || 'Lumo Pause Moment')}">
    <header class="pause-screen-header">${headerLeft ? `<button type="button" class="pause-screen-brand pause-screen-back" ${headerLeft.attributes || ''} aria-label="${esc(headerLeft.label)}">${icon('back', 20)}<span aria-hidden="true">lumo</span></button>` : '<span class="pause-screen-brand" aria-label="Lumo">lumo</span>'}${button(headerRight, 'pause-screen-exit')}</header>
    <div class="pause-screen-main"><h1 class="pause-screen-title">Pause.</h1><img class="pause-screen-lux" src="/assets/lux-pause-worried.png" alt="Lux looking concerned and holding up a hand to pause" width="180" height="180" decoding="async"><h2 class="pause-screen-impact" data-tour-feedback tabindex="-1">${esc(message.before || '')}${message.strong ? `<strong>${esc(message.strong)}</strong>` : ''}${esc(message.after || '')}</h2></div>
    <footer class="pause-screen-footer"><div class="pause-screen-actions">${button(primary, 'pause-screen-primary')}${button(secondary, 'pause-screen-secondary')}</div>${sample || footerNote ? `<p class="pause-screen-note">${sample ? `<span>SAMPLE MONEY · ${esc(context)}</span>` : ''}${footerNote ? `<span>${esc(footerNote)}</span>` : ''}</p>` : ''}${details}<span class="pause-gate" role="status" aria-live="polite"></span><p class="pause-screen-error" id="payment-error" role="alert" hidden></p></footer>
  </section>`;
}
