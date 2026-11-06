import { cash, icon } from './ui.js';
import { safeTourStep, updateTourDemo } from './tour-model.js';
import { renderPauseScreen } from './pause-view.js';

const money = amount => cash(amount, { decimals: false });
const sceneNames = ['Clarity', 'Pause', 'Progress'];
const copy = [
  { title: 'See what’s yours<br>to spend.', body: 'Your balance is one number. What’s left after your essentials is another.' },
  { title: 'See what a payment<br>means before<br>you make it.', body: 'When a payment could squeeze your plan, Lumo helps you see it. You decide.' },
  { title: 'Make room for<br>what’s next.', body: 'A little for today. A little for the laptop, the trip, the thing you’re working towards.' },
];

function clarity(d) {
  return `<div class="tour-demo tour-clarity ${d.essentialsShown ? 'is-revealed' : ''}"><div class="tour-demo-top"><span>${icon('bank', 17)} Everyday</span><span>${money(100000)} in</span></div><div class="tour-demo-number" data-tour-feedback tabindex="-1" aria-live="polite" aria-atomic="true"><span>${d.essentialsShown ? 'Left after plan' : 'Available balance'}</span><strong>${money(d.essentialsShown ? 35000 : 100000)}</strong></div>${d.essentialsShown ? `<div class="tour-essentials"><div><span><i class="tour-food"></i>Food</span><strong>${money(35000)}</strong></div><div><span><i class="tour-transport"></i>Transport</span><strong>${money(20000)}</strong></div><div><span><i class="tour-data"></i>Data</span><strong>${money(10000)}</strong></div></div><p class="tour-demo-result">${icon('check', 15)} Essentials covered. Your next move, clearer.</p>` : `<div class="tour-plan-hint"><span>Food. Transport. Data.</span><p>Let’s see what this money needs to cover.</p></div><button type="button" class="tour-try" data-tour-demo="essentials">See what’s left ${icon('arrow', 17)}</button>`}</div>`;
}

function pause(d) {
  return renderPauseScreen({
    amount: d.smallerPayment ? 20000 : 50000,
    metric: 15000,
    kind: d.smallerPayment ? 'remaining' : 'reserved',
    reservedFrom: 'plan',
    recipient: 'Ama', sample: true, tour: true,
    className: 'tour-page tour-scene-1', ariaLabel: 'The Lumo tour',
    headerLeft: { label: 'Previous tour scene', attributes: 'data-tour-action="back"' },
    headerRight: { label: 'Skip', attributes: 'data-tour-action="skip"' },
    primary: d.smallerPayment
      ? { label: 'Next', attributes: 'data-tour-action="next"' }
      : { label: `Try ${money(20000)}`, attributes: 'data-tour-demo="smaller-payment"' },
    secondary: d.smallerPayment ? undefined : { label: 'Next', attributes: 'data-tour-action="next"' },
    footerNote: '2 of 3',
  });
}

function saving(d) {
  const amount = d.saved ? 25000 : 20000;
  return `<div class="tour-demo tour-saving ${d.saved ? 'is-saved' : ''}"><div class="tour-box-icon" aria-hidden="true">${icon('box', 31)}</div><div class="tour-box-name">My next laptop</div><div class="tour-demo-number" data-tour-feedback tabindex="-1" aria-live="polite" aria-atomic="true"><strong>${money(amount)}</strong><span>of ${money(150000)}</span></div><div class="tour-savings-track" role="progressbar" aria-label="Sample laptop savings" aria-valuemin="0" aria-valuemax="1500" aria-valuenow="${amount / 100}"><span style="width:${amount / 150000 * 100}%"></span></div><p class="tour-saving-caption">${d.saved ? 'One little move closer.' : 'Small moves have somewhere to go.'}</p><button type="button" class="tour-try" data-tour-demo="save" ${d.saved ? 'disabled' : ''}>${d.saved ? `${icon('check', 17)} ${money(5000)} added to this sample` : `Try saving ${money(5000)} ${icon('plus', 17)}`}</button></div>`;
}

export function renderTour(ctx, route) {
  const d = ctx.draft.tour, step = safeTourStep(route.step), scene = copy[step];
  if (step === 1) return pause(d);
  return `<section class="tour-page tour-scene-${step}" aria-label="The Lumo tour"><header class="tour-header"><span class="wordmark" aria-label="Lumo">lumo<span class="dot"></span></span><button type="button" class="tour-skip" data-tour-action="skip">Skip ${icon('close', 15)}</button></header><div class="tour-main"><div class="tour-kicker"><span>${sceneNames[step]}</span><span>${step + 1} of 3</span></div><h1>${scene.title}</h1><p class="tour-description">${scene.body}</p><div class="tour-stage"><span class="tour-sample-label">SAMPLE MONEY</span>${[clarity, pause, saving][step](d)}</div></div><footer class="tour-footer"><nav class="tour-dots" aria-label="Tour scenes">${sceneNames.map((name, index) => `<button type="button" data-tour-step="${index}" aria-label="${name}, scene ${index + 1} of 3" ${index === step ? 'aria-current="step"' : ''}><span></span></button>`).join('')}</nav><div class="tour-navigation">${step > 0 ? `<button type="button" class="tour-back icon-button" data-tour-action="back" aria-label="Previous tour scene">${icon('back', 21)}</button>` : ''}<button type="button" class="button" data-tour-action="${step === 2 ? 'finish' : 'next'}">${step === 2 ? d.replay ? 'Back to Lumo' : 'Make it mine' : 'Next'} ${icon('arrow', 18)}</button></div></footer></section>`;
}

export function bindTour(ctx, route) {
  const root = ctx.$('.tour-page'), d = ctx.draft.tour, step = safeTourStep(route.step);
  if (!root || !d) return () => {};
  d.step = step; ctx.saveDraft?.();
  let alive = true, finished = false;
  const valid = () => alive && !finished && root.isConnected && ctx.draft.tour === d;
  const go = next => { d.step = safeTourStep(next); ctx.setCapture?.(null); ctx.saveDraft?.(); ctx.go({ section: 'tour', step: d.step }); };
  const click = event => {
    const button = event.target.closest('button');
    if (!valid() || !button || button.disabled) return;
    if (button.dataset.tourStep !== undefined) return go(Number(button.dataset.tourStep));
    if (button.dataset.tourDemo) {
      if (button.dataset.tourDemo === 'smaller-payment') updateTourDemo(d, 'payment');
      if (updateTourDemo(d, button.dataset.tourDemo)) {
        ctx.setCapture?.(null); ctx.saveDraft?.(); ctx.refresh();
        ctx.$('.tour-page [data-tour-feedback]')?.focus?.({ preventScroll: true });
      }
      return;
    }
    if (button.dataset.tourAction === 'skip' || button.dataset.tourAction === 'finish') {
      finished = true; button.disabled = true; ctx.finishTour({ skipped: button.dataset.tourAction === 'skip' }); return;
    }
    if (button.dataset.tourAction === 'back') return go(step - 1);
    if (button.dataset.tourAction === 'next') return go(step + 1);
  };
  root.addEventListener('click', click);
  return () => { alive = false; root.removeEventListener('click', click); };
}
