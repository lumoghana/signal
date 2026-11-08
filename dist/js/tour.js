import { cash, icon } from './ui.js';
import { safeTourStep, updateTourDemo, TOUR_SAMPLE as sample } from './tour-model.js';

const money = amount => cash(amount, { decimals: false });
const sceneNames = ['Pause', 'Money Boxes', 'Ask Lux'];
const reply = () => `You’ve got <strong>${money(sample.leftAfterPlan)}</strong> left after your plan and cushion. What’s the move?`;

function pause() {
  return `<main class="lm-main lm-pause-main"><h1 class="lm-pause-title">Pause.</h1><img class="lm-pause-lux" src="/assets/lux-pause-worried.png" width="180" height="180" alt="A worried Lux raising a hand to pause" decoding="async"><p class="lm-intro">When a payment could squeeze your plan, see it before you decide.</p></main>`;
}

function saving(d) {
  const amount = d.saved ? sample.goalAfter : sample.goalSaved;
  return `<main class="lm-main"><h1>Save as<br><span class="lm-accent">you spend.</span></h1><p class="lm-intro">Switch on a Savings Hack.<br>Let the little things add up.</p><div class="lm-goal-wrap" data-savings-stage><span class="lm-example">EXAMPLE MONEY</span><div class="lm-goal"><div class="lm-goal-head">${icon('box', 27)}<span>My next laptop</span></div><strong class="lm-saved" data-saved-total data-tour-feedback tabindex="-1">${money(amount)}</strong><span class="lm-target">of ${money(sample.goalTarget)}</span><div class="lm-track" role="progressbar" aria-label="Example laptop savings" aria-valuenow="${amount / 100}" aria-valuemin="0" aria-valuemax="${sample.goalTarget / 100}"><div class="lm-track-fill" style="width:${amount / sample.goalTarget * 100}%"></div></div><div class="lm-rule"><div><strong>${sample.hackPercent}% Savings Hack</strong><small>From your Everyday balance</small></div><span class="lm-rule-on">On</span></div></div><div class="lm-payment"><span>${money(sample.hackPayment)} airtime</span><span class="lm-payment-controls"><span class="lm-payment-status" data-payment-status>${d.saved ? 'Paid ✓' : 'Sample payment'}</span><button type="button" class="lm-demo-play lm-demo-play--inline" data-tour-demo="save" aria-label="Replay Savings Hack">${icon('repeat',16)}</button></span></div><p class="lm-result" data-savings-result>${d.saved ? `${money(sample.hackSaved)} into your laptop fund.` : 'Your plan comes first.'}</p><p class="lm-spare">Only when there’s money to spare.</p><span class="lm-saving-token" aria-hidden="true">+${money(sample.hackSaved)}</span></div><span class="tour-sr-only" data-savings-live role="status" aria-live="polite"></span></main>`;
}
function lux(d) {
  return `<main class="lm-main lm-lux-main" data-lux-stage><img class="lm-lux" src="/assets/lux-chat-2d.webp" width="160" height="160" alt="Lux, your personal money buddy" decoding="async"><h1>Your money.<br><span class="lm-accent">Let’s talk.</span></h1><p class="lm-intro">Ask Lux about your spending,<br>plans and goals.</p><div class="lm-chat" aria-label="Example conversation about your Lumo money"><span class="lm-example">EXAMPLE CHAT</span><div class="lm-message lm-message-you">What can I spend?</div><div class="lm-answer-slot"><div class="lm-typing" aria-hidden="true"><i></i><i></i><i></i></div><div class="lm-message lm-message-lux" data-tour-feedback tabindex="-1"><span class="lm-speaker">Lux</span>${reply()}</div></div></div><button type="button" class="lm-demo-play" data-tour-demo="lux-reply">${d.luxReplied ? 'Replay Lux’s reply' : 'Play Lux’s reply'}</button><span class="tour-sr-only" data-lux-live role="status" aria-live="polite"></span></main>`;
}

export function renderTour(ctx, route) {
  const d = ctx.draft.tour || {}, step = safeTourStep(route.step);
  return `<section class="tour-page tour-page--fresh tour-scene-${step}${step === 0 ? ' tour-page--pause' : ''}" aria-label="The Lumo tour"><header class="lm-head"><span class="wordmark" aria-label="Lumo">lumo</span><button type="button" class="lm-skip" data-tour-action="skip">Skip</button></header>${[pause, saving, lux][step](d)}<footer class="lm-foot"><div class="lm-progress-row"><button type="button" class="lm-back" data-tour-action="back" aria-label="${step === 0 ? d.replay ? 'Back to Lumo' : 'Back to welcome' : 'Previous tour scene'}">${icon('back', 20)}</button><nav class="lm-dots" aria-label="Tour scenes">${sceneNames.map((name, index) => `<button type="button" data-tour-step="${index}" aria-label="${name}, scene ${index + 1} of 3"${index === step ? ' aria-current="step"' : ''}><span></span></button>`).join('')}</nav><span class="lm-count">${step + 1} of 3</span></div><button type="button" class="button lm-next" data-tour-action="${step === 2 ? 'finish' : 'next'}">${step === 2 ? d.replay ? 'Back to Lumo' : 'Make it mine' : 'Next'} ${icon('arrow', 18)}</button><p class="lm-note">Interactive prototype · No real money.</p></footer></section>`;
}

/** Local presentation only. This module neither reads nor writes account money. */
export function bindTour(ctx, route) {
  const root = ctx.$('.tour-page'), d = ctx.draft.tour, step = safeTourStep(route.step);
  if (!root || !d) return () => {};
  d.step = step; ctx.saveDraft?.();
  let alive = true, finished = false, busy = false;
  const timers = new Set();
  const valid = () => alive && !finished && root.isConnected && ctx.draft.tour === d;
  const q = selector => root.querySelector?.(selector) || null;
  const text = (selector, value) => { const element = q(selector); if (element) element.textContent = value; };
  const reduced = () => { try { return globalThis.matchMedia?.('(prefers-reduced-motion: reduce)').matches === true; } catch { return false; } };
  const clear = () => { timers.forEach(clearTimeout); timers.clear(); busy = false; };
  const later = (delay, callback) => { const handle = setTimeout(() => { timers.delete(handle); if (!valid()) { clear(); return; } callback(); }, delay); timers.add(handle); };
  const update = action => { updateTourDemo(d, action); ctx.saveDraft?.(); };
  const setBusy = (button, value) => { if (!button) return; button.disabled = value; if (value) button.setAttribute?.('aria-busy', 'true'); else button.removeAttribute?.('aria-busy'); };
  const savedAmount = value => { text('[data-saved-total]', money(value)); q('[role="progressbar"]')?.setAttribute?.('aria-valuenow', String(value / 100)); const fill = q('.lm-track-fill'); if (fill?.style) fill.style.width = `${value / sample.goalTarget * 100}%`; };
  function playSaving() {
    if (!valid() || busy || step !== 1) return;
    clear(); busy = true;
    const stage = q('[data-savings-stage]'), button = q('[data-tour-demo="save"]');
    const hasDOM = !!stage?.classList;
    setBusy(button, true); stage?.classList?.remove('lm-saving-in-flight', 'lm-saving-landed');
    savedAmount(sample.goalSaved); text('[data-savings-live]', ''); text('[data-payment-status]', 'Paying…'); text('[data-savings-result]', 'Your plan comes first.');
    const finish = () => {
      if (!valid()) return;
      busy = false; update('save'); savedAmount(sample.goalAfter);
      stage?.classList?.remove('lm-saving-in-flight'); stage?.classList?.add('lm-saving-landed');
      text('[data-payment-status]', 'Paid ✓'); text('[data-savings-result]', `${money(sample.hackSaved)} into your laptop fund.`);
      text('[data-savings-live]', `Sample only. A ${sample.hackPercent}% Savings Hack moved ${money(sample.hackSaved)} from Everyday after a successful ${money(sample.hackPayment)} airtime purchase. Laptop savings: ${money(sample.goalAfter)}.`);
      setBusy(button, false);
      if (!hasDOM) ctx.refresh?.();
    };
    if (!hasDOM || reduced()) { finish(); return; }
    later(700, () => { text('[data-payment-status]', 'Paid ✓'); text('[data-savings-result]', 'Your Savings Hack takes it from here.'); });
    later(1100, () => stage.classList.add('lm-saving-in-flight'));
    later(2100, finish);
  }
  function playLux() {
    if (!valid() || busy || step !== 2) return;
    clear(); busy = true;
    const stage = q('[data-lux-stage]'), button = q('[data-tour-demo="lux-reply"]');
    const hasDOM = !!stage?.classList;
    setBusy(button, true); text('[data-lux-live]', ''); stage?.classList?.remove('lm-chat-thinking', 'lm-chat-arrived');
    const finish = () => {
      if (!valid()) return;
      busy = false; update('lux-reply'); stage?.classList?.remove('lm-chat-thinking'); stage?.classList?.add('lm-chat-arrived');
      text('[data-lux-live]', `Lux: You’ve got ${money(sample.leftAfterPlan)} left after your plan and cushion. What’s the move?`);
      if (button) button.textContent = 'Replay Lux’s reply'; setBusy(button, false);
      if (!hasDOM) ctx.refresh?.();
    };
    if (!hasDOM || reduced()) { finish(); return; }
    stage.classList.add('lm-chat-thinking'); later(1900, finish);
  }
  const go = next => { clear(); d.step = safeTourStep(next); ctx.setCapture?.(null); ctx.saveDraft?.(); ctx.go({ section: 'tour', step: d.step }); };
  const click = event => {
    const button = event.target.closest('button');
    if (!valid() || !button || button.disabled) return;
    if (button.dataset.tourStep !== undefined) return go(Number(button.dataset.tourStep));
    if (button.dataset.tourDemo === 'save') return playSaving();
    if (button.dataset.tourDemo === 'lux-reply') return playLux();
    if (button.dataset.tourAction === 'skip' || button.dataset.tourAction === 'finish') {
      finished = true; clear(); button.disabled = true; ctx.finishTour({ skipped: button.dataset.tourAction === 'skip' }); return;
    }
    if (button.dataset.tourAction === 'back') {
      if (step > 0) return go(step - 1);
      clear(); ctx.setCapture?.(null); ctx.saveDraft?.();
      if (ctx.back) ctx.back(); else ctx.go(d.replay ? d.returnTo : { section: 'welcome' });
      return;
    }
    if (button.dataset.tourAction === 'next') return go(step + 1);
  };
  root.addEventListener('click', click);
  // Show each short example once; navigation is available throughout the animation.
  if (step === 1 && !d.saved && q('[data-savings-stage]')?.classList) playSaving();
  if (step === 2 && !d.luxReplied && q('[data-lux-stage]')?.classList) playLux();
  return () => { alive = false; clear(); root.removeEventListener('click', click); };
}
