import { esc, cash, icon } from './ui.js';
import { budgetCategoryKey } from './model.js';
import {
  ACTIVATION_CATEGORIES, safeActivationStep, fundActivation,
  addActivationBudgetItem, saveActivationBudget
} from './activation-model.js';

const renderedActivationSteps = new WeakMap();
const parseAmount = value => /^\d+(\.\d{0,2})?$/.test(String(value ?? '').trim()) ? Math.round(Number(value) * 100) : NaN;
const planned = items => (items || []).reduce((sum, item) => sum + Math.max(0, item.amount - (item.spent || 0)), 0);
const routeFor = step => ({ section: 'activation', step });
const amountField = (value, id, label, field = id === 'activation-funding' ? 'funding.amountText' : 'amountText') => `<label class="activation-money" for="${id}"><span>${esc(label)}</span><div><span aria-hidden="true">GH₵</span><input id="${id}" data-activation-field="${field}" aria-label="${esc(label)} in Ghana cedis" inputmode="decimal" autocomplete="off" placeholder="0.00" value="${esc(value)}" maxlength="12"></div></label>`;
const usedCategory = (d, name) => d.items.some(item => budgetCategoryKey(item.name) === budgetCategoryKey(name));

export function renderActivation(ctx, route) {
  const d = ctx.draft.activation, step = safeActivationStep(d, route.step), ready = step === 'ready';
  const labels = ['Add money', 'Give it a purpose', 'Ready to go'];
  const index = ['fund', 'purpose', 'ready'].indexOf(step);
  const arrivalKey = step + (step === 'fund' && d.state.wallet > 0 ? ':funded' : '');
  const entering = renderedActivationSteps.get(d) !== arrivalKey;
  renderedActivationSteps.set(d, arrivalKey);
  let body = '', title = '', description = '', primary = '', action = '';
  if (step === 'fund') {
    title = 'Your first<br>money move.';
    description = 'Start with a little. Let’s give your Lumo something to work with.';
    body = `<div class="activation-sources" aria-label="Choose how to add money">${[['Mobile money', 'phone', 'Mobile money'], ['Bank transfer', 'bank', 'Bank transfer']].map(([value, symbol, label]) => `<button type="button" data-activation-source="${value}" aria-pressed="${d.funding.source === value}">${icon(symbol, 22)}<span>${label}</span>${d.funding.source === value ? icon('check', 16) : ''}</button>`).join('')}</div>${d.state.wallet > 0 ? `<p class="activation-added">${icon('check', 16)} ${cash(d.state.wallet)} already added</p>` : ''}${amountField(d.funding.amountText, 'activation-funding', 'How much are we starting with?')}<div class="activation-presets" aria-label="Suggested amounts">${[5000, 10000, 20000].map(amount => `<button type="button" data-activation-amount="${amount}" aria-pressed="${parseAmount(d.funding.amountText) === amount}">${cash(amount, { decimals: false })}</button>`).join('')}</div><p class="activation-demo-note">This is a demo top-up. No real money leaves your bank or mobile money account.</p>`;
    if (d.state.wallet > 0) {
      title = 'Money in.<br>Nice first move.';
      description = 'Your first top-up is here. Now let’s give it a purpose.';
      body = `<div class="activation-win" aria-hidden="true">${icon('check', 47)}<span>FIRST TOP-UP. IN.</span></div><div class="activation-balance"><span>Added to your Everyday account</span><strong>${cash(d.state.wallet)}</strong></div><p class="activation-demo-note">Your demo top-up is complete. Your money is ready for the essentials ahead.</p>`;
    }
    primary = d.state.wallet > 0 ? 'Give this money a purpose' : 'Add demo money'; action = d.state.wallet > 0 ? 'continue-purpose' : 'fund';
  } else if (step === 'purpose') {
    title = 'Give it a purpose.';
    description = 'Food, data, transport. Start with what this money needs to cover.';
    const allocated = planned(d.items), buffer = parseAmount(d.keepBackText || '0'), left = Math.max(0, d.state.wallet - allocated - (Number.isFinite(buffer) ? buffer : 0));
    const custom = d.category === 'custom' || !!d.categoryName, hasSelection = !!(d.category || d.categoryName);
    body = `<div class="activation-balance"><span>Ready to plan</span><strong>${cash(left)}</strong>${allocated ? `<small>${cash(allocated)} already given a purpose</small>` : ''}</div><div class="activation-categories" aria-label="Choose a budget category">${ACTIVATION_CATEGORIES.map(c => `<button type="button" data-activation-category="${esc(c.name)}" aria-pressed="${d.category === c.name}" ${usedCategory(d, c.name) ? 'disabled' : ''}><span>${esc(c.emoji)}</span>${esc(c.name)}${usedCategory(d, c.name) ? icon('check', 14) : ''}</button>`).join('')}<button type="button" data-activation-category="custom" aria-pressed="${custom}"><span>✨</span>Something else</button></div>${custom ? `<label class="activation-label" for="activation-category-name">Name your essential<input class="input" id="activation-category-name" data-activation-field="categoryName" value="${esc(d.categoryName)}" placeholder="What matters to you?" maxlength="40" autocomplete="off"></label>` : ''}${hasSelection ? `${amountField(d.amountText, 'activation-allocation', `How much for ${custom ? 'this essential' : d.category}?`)}<div class="activation-purpose-tools"><button type="button" class="activation-text-button" data-activation-action="add-item">${icon('plus', 16)} Add this essential</button></div>` : ''}${d.items.length ? `<div class="activation-plan-list" aria-label="Your budget so far">${d.items.map((item, itemIndex) => `<div><span class="activation-item-name"><span>${esc(item.emoji || '📌')}</span>${esc(item.name)}</span><strong>${cash(item.amount)}</strong><button type="button" class="icon-button" data-activation-remove="${itemIndex}" aria-label="Remove ${esc(item.name)}">${icon('close', 15)}</button></div>`).join('')}</div>` : ''}<details class="activation-optional" ${d.keepBackText ? 'open' : ''}><summary>A little cushion<span>Optional</span></summary>${amountField(d.keepBackText || '', 'activation-keep-back', 'Keep a little back · optional', 'keepBackText')}<p class="activation-demo-note">For the unexpected. It stays in Everyday, outside your flexible money.</p></details><label class="activation-label activation-date" for="activation-due">This money needs to last until<input class="input" id="activation-due" type="date" data-activation-field="due" min="${new Date().toISOString().slice(0, 10)}" value="${esc(d.due)}"></label>`;
    primary = 'Save my budget'; action = 'save-budget';
  } else {
    title = 'You’re ready.';
    description = 'You’ve put money in and given it a plan. That’s your first win.';
    const totalPlanned = planned(d.state.budget?.items), buffer = d.state.buffer || 0;
    body = `<div class="activation-win" aria-hidden="true">${icon('check', 47)}<span>FIRST MOVE. MADE.</span></div><dl class="activation-summary"><div><dt>Money added</dt><dd>${cash(d.state.wallet)}</dd></div><div><dt>Given a purpose</dt><dd>${cash(totalPlanned)}</dd></div>${buffer ? `<div><dt>Kept back</dt><dd>${cash(buffer)}</dd></div>` : ''}<div><dt>Free for what’s next</dt><dd>${cash(Math.max(0, d.state.wallet - totalPlanned - buffer))}</dd></div></dl><p class="activation-demo-note">Your budget keeps the essentials in view. Your money stays in your Everyday account.</p>`;
    primary = 'Meet my Lumo'; action = 'complete';
  }
  return `<section class="activation-page activation-step-${step}${entering ? ' activation-enter' : ''}" aria-label="Your first Lumo money move"><header class="activation-header">${index > 0 ? `<button class="icon-button" type="button" data-activation-action="back" aria-label="Previous setup step">${icon('back', 21)}</button>` : '<span class="activation-header-spacer"></span>'}<div><span>${labels[index]}</span><small>${index + 1} of 3</small></div><button class="icon-button" type="button" data-activation-action="exit" aria-label="Exit setup">${icon('close', 20)}</button></header><div class="activation-progress" aria-label="Money setup progress">${labels.map((label, i) => `<span class="${i <= index ? 'done' : ''}" title="${label}"></span>`).join('')}</div><main class="activation-main"><span class="activation-kicker">${d.preview ? 'SIGNUP PREVIEW' : ''}</span><h1>${title}</h1><p class="activation-description">${description}</p><form id="activation-form" novalidate>${body}<p class="error activation-error" role="alert">${esc(d.error || '')}</p></form></main><footer class="activation-footer"><button class="button" type="button" data-activation-action="${action}">${primary}</button>${step === 'fund' && !d.funded && d.state.wallet === 0 ? '<button type="button" class="activation-text-button activation-defer" data-activation-action="defer">Waiting for my money</button><small>Your verified account can wait. Add money and plan when it arrives.</small>' : ''}</footer></section>`;
}

export function bindActivation(ctx, route) {
  const root = ctx.$('.activation-page'), d = ctx.draft.activation;
  if (!root || !d) return () => {};
  let alive = true, busy = false;
  const step = safeActivationStep(d, route.step);
  const current = () => alive && root.isConnected && ctx.draft.activation === d;
  const capture = () => {
    if (!current()) return;
    root.querySelectorAll('[data-activation-field]').forEach(input => {
      if (input.dataset.activationField === 'funding.amountText') d.funding.amountText = input.value;
      else d[input.dataset.activationField] = input.value;
    });
    ctx.saveDraft?.();
  };
  ctx.setCapture?.(capture);
  const refresh = () => { ctx.setCapture?.(null); ctx.saveDraft?.(); ctx.refresh(); };
  const error = message => { d.error = message; const el = root.querySelector('.activation-error'); if (el) el.textContent = message; ctx.saveDraft?.(); };
  const go = next => { d.step = next; d.error = ''; ctx.setCapture?.(null); ctx.saveDraft?.(); ctx.go(routeFor(next)); };
  const addItem = () => {
    const name = String(d.category === 'custom' ? d.categoryName : d.categoryName || d.category || '').trim();
    const selected = ACTIVATION_CATEGORIES.find(c => c.name === name);
    const result = addActivationBudgetItem(d, { name, emoji: selected?.emoji || '📌', amount: parseAmount(d.amountText) });
    if (!result.ok) { error(result.message); return false; }
    d.category = ''; d.categoryName = ''; d.amountText = ''; d.error = '';
    return true;
  };
  const input = event => {
    capture();
    if (step === 'purpose') { d.budgetSaved = false; d.step = 'purpose'; ctx.saveDraft?.(); }
    if (event.target.dataset.activationField === 'categoryName' && event.target.value) {
      d.category = 'custom';
      root.querySelectorAll('[data-activation-category]').forEach(button => button.setAttribute('aria-pressed', 'false'));
    }
  };
  const click = event => {
    const button = event.target.closest('button');
    if (!current() || !button || button.disabled || busy) return;
    capture();
    if (button.dataset.activationSource) { d.funding.source = button.dataset.activationSource; return refresh(); }
    if (button.dataset.activationAmount) { d.funding.amountText = (Number(button.dataset.activationAmount) / 100).toFixed(2); return refresh(); }
    if (button.dataset.activationCategory) { d.category = button.dataset.activationCategory; d.categoryName = ''; d.budgetSaved = false; d.step = 'purpose'; return refresh(); }
    if (button.dataset.activationRemove !== undefined) { d.items.splice(Number(button.dataset.activationRemove), 1); d.budgetSaved = false; d.step = 'purpose'; d.error = ''; return refresh(); }
    const action = button.dataset.activationAction;
    if (action === 'exit') return ctx.exitActivation();
    if (action === 'defer') { busy = true; button.disabled = true; return ctx.deferActivationFunding(); }
    if (action === 'back') return go(step === 'ready' ? 'purpose' : 'fund');
    if (action === 'continue-purpose') return go('purpose');
    if (action === 'fund') {
      const result = fundActivation(d, { amount: parseAmount(d.funding.amountText), source: d.funding.source });
      if (!result.ok) return error(result.message);
      d.funding.amountText = '';
      return go('purpose');
    }
    if (action === 'add-item') { if (addItem()) refresh(); return; }
    if (action === 'save-budget') {
      if ((d.category || d.categoryName || d.amountText) && !addItem()) return;
      const result = saveActivationBudget(d, { items: d.items, due: d.due, buffer: parseAmount(d.keepBackText || '0') });
      if (!result.ok) return error(result.message);
      return go('ready');
    }
    if (action === 'complete') { busy = true; button.disabled = true; ctx.completeActivation(); }
  };
  const submit = event => { event.preventDefault(); root.querySelector('.activation-footer .button')?.click(); };
  root.addEventListener('input', input); root.addEventListener('change', input); root.addEventListener('click', click);
  root.querySelector('form')?.addEventListener('submit', submit);
  return () => { alive = false; ctx.setCapture?.(null); root.removeEventListener('input', input); root.removeEventListener('change', input); root.removeEventListener('click', click); root.querySelector('form')?.removeEventListener('submit', submit); };
}
