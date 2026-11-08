import { cash, icon } from './ui.js';
import { EXPLORE_SCENES, EXPLORE_SAMPLE as sample, safeExploreIndex } from './explore-model.js';
import { renderSavingsHackTerms } from './savings-hack-disclosure.js';

const money = value => cash(value, { decimals: false });
const labels = ['Your money', 'Your plan', 'Pause Moment', 'Ask Lux', 'Money Boxes', 'Accountability partner'];
const amount = (value, className = '') => `<span class="explore-money ${className}"><span class="explore-currency">GH₵</span>${money(value).replace('GH₵', '').trim()}</span>`;
const nav = active => `<div class="explore-ui-nav" aria-hidden="true">${[['home', 'Home'], ['chat', 'Ask Lux'], ['more', 'Menu']].map(([glyph, label]) => `<span class="${active === label ? 'is-active' : ''}">${icon(glyph, 18)}<small>${label}</small></span>`).join('')}</div>`;
const top = title => `<div class="explore-ui-top"><span>${title}</span><span class="explore-ui-top-icon" aria-hidden="true">${icon('more', 19)}</span></div>`;

function home() {
  return `<div class="explore-app-ui explore-home-ui">${top('Everyday')}
    <div class="explore-home-balance explore-focus"><div class="explore-balance-line">${amount(sample.left)}<span class="explore-plus" aria-hidden="true">${icon('plus', 21)}</span></div><p>Left after plan</p><span class="explore-focus-dot" aria-hidden="true"></span></div>
    <div class="explore-home-summary"><div><small>Available balance</small>${amount(sample.available)}</div><span>View budget ${icon('chevron', 14)}</span></div>
    <div class="explore-home-hint"><span></span><small>Your money, with the bigger picture.</small></div>${nav('Home')}
  </div>`;
}

function plan() {
  return `<div class="explore-app-ui explore-plan-ui">${top('Your plan')}
    <p class="explore-ui-eyebrow">Until Friday</p><div class="explore-plan-total">${amount(sample.planned)}<small>set aside in your plan</small></div>
    <div class="explore-plan-rows explore-focus"><div class="explore-plan-row explore-plan-food"><span class="explore-row-icon">${icon('food', 19)}</span><span>Food</span><strong>${money(sample.food)}</strong></div><div class="explore-plan-row explore-plan-transport"><span class="explore-row-icon">${icon('bus', 19)}</span><span>Transport</span><strong>${money(sample.transport)}</strong></div><span class="explore-focus-dot" aria-hidden="true"></span></div>
    <div class="explore-cushion"><span>${icon('heart', 17)} Breathing room</span><strong>${money(sample.cushion)}</strong></div>
    <p class="explore-ui-note">Still in Everyday. Given a purpose.</p>${nav('Home')}
  </div>`;
}

function pause() {
  return `<div class="explore-app-ui explore-pause-ui">${top('Lumo Pause Moment')}
    <div class="explore-pause-title">Pause.</div>
    <img src="/assets/lux-pause-worried.png" width="180" height="180" alt="A worried Lux raising a hand to pause" class="explore-pause-lux" decoding="async">
    <div class="explore-pause-impact explore-focus"><p>This payment uses <strong>${money(sample.shortfall)}</strong> of your breathing room until ${sample.periodLabel}.</p><span class="explore-focus-dot" aria-hidden="true"></span></div>
    <div class="explore-pause-context">Sample payment · ${money(sample.payment)}</div>
    <div class="explore-pause-choices" aria-label="Preview of your choices"><span class="explore-choice-primary">Continue to PIN</span><span>Edit amount</span></div>
  </div>`;
}

function chat() {
  return `<div class="explore-app-ui explore-chat-ui">${top('Ask Lux')}
    <div class="explore-lux-intro"><img src="/assets/lux-chat-2d.webp" width="160" height="160" alt="Lux, your money companion" decoding="async"><span>Your money.<br><strong>Let’s talk.</strong></span></div>
    <div class="explore-question"><span>What can I spend?</span></div>
    <div class="explore-reply-slot"><div class="explore-chat-thinking" aria-hidden="true"><i></i><i></i><i></i></div><div class="explore-chat-reply explore-focus"><small>Lux</small><p data-explore-chat-answer>Based on your plan, you have <strong>${money(sample.left)}</strong> left until ${sample.periodLabel}.</p><span class="explore-focus-dot" aria-hidden="true"></span></div></div>
    <details class="explore-explanation" data-explore-explanation><summary>How Lux worked this out ${icon('chevron', 14)}</summary><div class="explore-explanation-body"><dl class="explore-calculation"><div><dt>Available money</dt><dd data-explore-math="available">${money(sample.available)}</dd></div><div><dt>Planned obligations</dt><dd data-explore-math="planned">− ${money(sample.planned)}</dd></div><div><dt>Breathing room</dt><dd data-explore-math="cushion">− ${money(sample.cushion)}</dd></div><div><dt>Left until ${sample.periodLabel}</dt><dd data-explore-math="left">${money(sample.left)}</dd></div></dl><p>${sample.snapshotLabel}. ${sample.periodLabel} is the end of this example plan. This is not connected to a live balance.</p><form data-explore-example-form><p class="explore-example-form-title">Try different example figures</p>${[['available','Available money',sample.available],['planned','Planned obligations',sample.planned],['cushion','Breathing room',sample.cushion]].map(([name,label,value]) => `<label><span>${label} (GH₵)</span><input name="${name}" value="${value / 100}" type="number" inputmode="decimal" step="0.01" min="0" max="1000000" required></label>`).join('')}<button type="submit">Update example</button><p role="status" data-explore-example-feedback></p></form><p>In your account, Review plan lets you correct your plan and breathing room. This calculator changes this example answer only.</p></div></details>${nav('Ask Lux')}
  </div>`;
}

function box() {
  return `<div class="explore-app-ui explore-box-ui">${top('Money Boxes')}
    <div class="explore-goal-heading">${icon('box', 25)}<span>My next laptop</span></div>
    <div class="explore-goal-total"><span class="explore-goal-before" aria-hidden="true">${money(sample.goalSaved)}</span><span class="explore-goal-after">${money(sample.goalAfter)}</span><small>of ${money(sample.goalTarget)}</small></div>
    <div class="explore-goal-track" aria-label="Example laptop goal: 251 of 1,500 cedis saved"><span></span></div>
    <div class="explore-hack-rule explore-focus"><span class="explore-row-icon">${icon('spark', 20)}</span><span><strong>${sample.hackPercent}% Savings Hack</strong><small>Save as you spend</small></span><span class="explore-on">On</span><span class="explore-focus-dot" aria-hidden="true"></span></div>
    <div class="explore-airtime"><span>${money(sample.hackPayment)} airtime</span><span class="explore-airtime-status"><span class="explore-airtime-paying" aria-hidden="true">Paying…</span><span class="explore-airtime-paid">Paid ${icon('check', 14)}</span></span></div>
    <div class="explore-hack-token" aria-hidden="true">+${money(sample.hackSaved)}</div>
    <p class="explore-hack-result">${money(sample.hackSaved)} into your laptop fund.</p><p class="explore-ui-note">Only when there’s money to spare.</p>
  </div>`;
}

function partner() {
  return `<div class="explore-app-ui explore-partner-ui">${top('My next laptop')}
    <div class="explore-partner-goal"><span class="explore-row-icon">${icon('box', 23)}</span><span><small>Saved for your goal</small>${amount(sample.goalAfter)}</span></div>
    <div class="explore-partner-person"><span class="explore-partner-avatar" aria-hidden="true">E</span><div><strong>Esi</strong><small>Accountability partner</small><small class="explore-partner-accepted">Accepted · Number confirmed</small></div><span class="explore-verified" aria-label="Accepted and confirmed">${icon('check', 17)}</span></div>
    <div class="explore-protection-label">Taking money back to Everyday?</div>
    <div class="explore-partner-proof explore-focus"><div><span class="explore-proof-number">1</span><span>A fresh code from Esi</span>${icon('check', 17)}</div><div><span class="explore-proof-number">2</span><span>Your own PIN</span>${icon('lock', 17)}</div><span class="explore-focus-dot" aria-hidden="true"></span></div>
    <p class="explore-ui-note">Optional. If Esi can’t help, contact Lumo Support.</p>
  </div>`;
}

export function renderExploreScene(index) {
  const step = safeExploreIndex(index), scene = EXPLORE_SCENES[step];
  const info = scene.id === 'box' ? { label: 'Savings Hack rules before activation', body: renderSavingsHackTerms() } : scene.id === 'partner' ? { label: 'Your access if your partner is unavailable', body: `<p><strong>Your money stays yours.</strong> Your partner cannot spend it. In Money Box → Accountability partner, you can request a partner change or removal. A fresh approval and your own PIN are needed.</p><p><strong>Partner unavailable, relationship changed or urgent access?</strong> Contact Lumo Support through the planned toll-free line. Support must verify it is you, review the request and record a decision. Calling does not automatically release money or remove protection.</p><p><strong>Toll-free number to be confirmed.</strong> No call or support request is sent from this tour. The recovery procedure must be confirmed with GCB Bank before launch.</p>` } : null;
  return `<div class="explore-scene explore-scene--${scene.id}" data-explore-scene-view="${scene.id}"><div class="explore-app-caption"><span>${labels[step]}</span><span class="explore-app-indicator" aria-hidden="true"></span></div>${[home, plan, pause, chat, box, partner][step]()}<aside class="explore-tip${info ? ' explore-tip--with-info' : ''}" data-explore-tooltip><span class="explore-tip-pointer" aria-hidden="true"></span><div class="explore-tip-step">${String(step + 1).padStart(2, '0')} <span aria-hidden="true">/</span> ${String(EXPLORE_SCENES.length).padStart(2, '0')}</div><h2>${scene.title}</h2><p>${scene.copy}</p>${info ? `<details class="explore-tip-info" data-explore-explanation><summary aria-label="${info.label}">${icon('info', 20)}<span class="explore-sr-only">${info.label}</span></summary><div class="explore-explanation-body"><h3>${info.label}</h3>${info.body}</div></details>` : ''}</aside></div>`;
}

export function renderExploreEnd() {
  return `<div class="explore-end"><img src="/assets/lux-chat-2d.webp" width="160" height="160" alt="Lux, your money companion" decoding="async"><p class="explore-end-eyebrow">That’s a little of Lumo.</p><h2 data-explore-end-title tabindex="-1">Your money.<br><em>Made clear.</em></h2><p class="explore-end-copy">Bring your own story.</p><div class="explore-end-actions"><button type="button" class="explore-start" data-action="start">Let’s get started ${icon('arrow', 20)}</button><button type="button" class="explore-replay" data-explore-control="replay">${icon('repeat', 17)} Watch again</button><button type="button" class="explore-close" data-action="welcome-tour-close">Back to welcome</button></div><p class="explore-bank-provider">Banking powered by <strong>GCB Bank</strong></p></div>`;
}

export function renderExplore() {
  return `<section class="lumo-explore" aria-labelledby="explore-title" data-paused="false" data-complete="false"><header class="explore-header"><span class="explore-wordmark" aria-label="Lumo">lumo</span><button type="button" class="explore-skip" data-explore-control="skip">Skip</button></header><div class="explore-heading"><h1 id="explore-title">A quick look inside.</h1><p>Sample account · No real money.</p></div><nav class="explore-progress" aria-label="Explore Lumo scenes">${EXPLORE_SCENES.map((scene, index) => `<button type="button" data-explore-scene="${index}" aria-label="${labels[index]}, scene ${index + 1} of ${EXPLORE_SCENES.length}"${index === 0 ? ' aria-current="step"' : ''}><span class="explore-progress-track"><span data-explore-fill style="--explore-progress:0%"></span></span></button>`).join('')}</nav><div class="explore-stage" data-explore-stage>${renderExploreScene(0)}</div><footer class="explore-controls" data-explore-controls><button type="button" data-explore-control="previous" aria-label="Previous scene" disabled>${icon('back', 20)}</button><span class="explore-count" data-explore-count>1 of ${EXPLORE_SCENES.length}</span><button type="button" class="explore-toggle" data-explore-control="toggle" aria-label="Pause tour"><span class="explore-toggle-symbol" aria-hidden="true"><i></i><i></i></span><span data-explore-toggle-label>Pause</span></button><button type="button" data-explore-control="next" aria-label="Next scene">${icon('arrow', 20)}</button></footer><span class="explore-sr-only" data-explore-live role="status" aria-live="polite"></span></section>`;
}
