import { esc, cash, icon } from './ui.js';
import { budgetCategoryKey } from './model.js';
import { bindActivationConfetti } from './activation-confetti.js';
import { renderActivationFunding } from './activation-funding-view.js';
import { readDemoActivationFundingReceipt, simulateActivationFundingReceipt } from './activation-funding-demo.js';
import {
  ACTIVATION_CATEGORIES, safeActivationStep, requestActivationFunding, checkActivationFunding, retryActivationFunding, activationFundingStatus,
  addActivationBudgetItem, saveActivationBudget, acknowledgeCreatedAccount, activationEverydayAccount, activationEverydayAccountNumber
} from './activation-model.js';

const renderedActivationSteps = new WeakMap();
const parseAmount = value => /^\d+(\.\d{0,2})?$/.test(String(value ?? '').trim()) ? Math.round(Number(value) * 100) : NaN;
const planned = items => (items || []).reduce((sum, item) => sum + Math.max(0, item.amount - (item.spent || 0)), 0);
const routeFor = step => ({ section: 'activation', step });
const amountField = (value, id, label, field = id === 'activation-funding' ? 'funding.amountText' : 'amountText') => `<label class="activation-money" for="${id}"><span>${esc(label)}</span><div><span aria-hidden="true">GH₵</span><input id="${id}" data-activation-field="${field}" aria-label="${esc(label)} in Ghana cedis" inputmode="decimal" autocomplete="off" placeholder="0.00" value="${esc(value)}" maxlength="12"></div></label>`;
const usedCategory = (d, name) => d.items.some(item => budgetCategoryKey(item.name) === budgetCategoryKey(name));
const copyIcon = '<svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.65" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="8" y="8" width="12" height="13" rx="2"></rect><path d="M16 8V5a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h3"></path></svg>';
function everydayDetails(d) {
  const account = activationEverydayAccount(d), number = activationEverydayAccountNumber(d);
  const holder = typeof account?.holderName === 'string' ? account.holderName.trim().slice(0, 120) : '';
  return { account, holder, number, example: account?.status === 'simulated-ready' };
}
function renderAccountArrival(d, entering) {
  const details = everydayDetails(d), firstName = details.holder.split(/\s+/)[0];
  const confirmed = !!details.number;
  const greeting = confirmed ? `Your ${details.example ? 'sample ' : ''}account is ready${firstName ? `, ${esc(firstName)}` : ''}.` : 'One last confirmation.';
  const title = confirmed ? '<span>Money just</span><span>got personal.</span>' : '<span>Your account details</span><span>are on the way.</span>';
  const promise = confirmed ? 'Intelligent banking,<br>made for your life.' : 'Your identity setup is complete. Your GCB Bank account details need confirmation.';
  const boundary = details.example ? 'Example number · No live account. Do not transfer real money.' : !confirmed ? 'No account number is shown until it is confirmed by the bank.' : '';
  return `<section class="activation-page activation-step-account-created${entering ? ' activation-enter' : ''}" aria-label="Your GCB Everyday account">
    ${confirmed ? '<canvas class="activation-arrival-confetti" data-activation-confetti aria-hidden="true"></canvas>' : ''}
    <header class="activation-arrival-header"><span class="activation-arrival-wordmark" aria-label="Lumo">lumo</span><button class="icon-button" type="button" data-activation-action="exit" aria-label="Exit setup">${icon('close', 20)}</button></header>
    <main class="activation-arrival-story"><p class="activation-arrival-greeting">${greeting}</p><h1>${title}</h1><p class="activation-arrival-promise">${promise}</p></main>
    <footer class="activation-footer activation-arrival-footer"><div class="activation-arrival-account"><p class="activation-arrival-account-label">Everyday account${details.example ? '<span>Sample account</span>' : ''}</p><div class="activation-account-number-row">${confirmed ? `<output class="activation-account-number" data-activation-account-number tabindex="-1" aria-label="${details.example ? 'Example ' : ''}Everyday account number ${esc(details.number)}">${esc(details.number)}</output><button type="button" class="activation-copy-number" data-activation-action="copy-account-number" aria-label="Copy ${details.example ? 'example ' : ''}account number">${copyIcon}</button>` : '<span class="activation-account-unavailable">Account number not available yet</span>'}</div><p class="activation-arrival-bank">${details.holder ? `${esc(details.holder)} · ` : ''}Powered by GCB Bank</p><p class="activation-copy-feedback" data-activation-copy-feedback role="status" aria-live="polite"></p></div><p class="error activation-error" role="alert">${esc(d.error || '')}</p><button class="button" type="button" data-activation-action="acknowledge-account"${confirmed ? '' : ' disabled'}><span>Add money</span><span aria-hidden="true">→</span></button>${boundary ? `<p class="activation-account-demo-boundary">${boundary}</p>` : ''}</footer>
  </section>`;
}

export function renderActivation(ctx, route) {
  const d = ctx.draft.activation, step = safeActivationStep(d, route.step), ready = step === 'ready';
  const labels = ['Your account', 'Add money', 'Give it a purpose', 'Ready to go'];
  const index = ['account-created', 'fund', 'purpose', 'ready'].indexOf(step);
  const arrivalKey = step + (step === 'fund' && d.state.wallet > 0 ? ':funded' : '');
  const entering = renderedActivationSteps.get(d) !== arrivalKey;
  renderedActivationSteps.set(d, arrivalKey);
  if (step === 'account-created') return renderAccountArrival(d, entering);
  let body = '', title = '', description = '', primary = '', action = '', fundingStage = null;
  if (step === 'fund') {
    fundingStage = renderActivationFunding(d, amountField);
    ({ body, title, description, primary, action } = fundingStage);
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
  return `<section class="activation-page activation-step-${step}${fundingStage ? ` activation-funding-${fundingStage.status}` : ''}${entering ? ' activation-enter' : ''}" aria-label="Your first Lumo money move"><header class="activation-header">${index > 0 ? `<button class="icon-button" type="button" data-activation-action="back" aria-label="Previous setup step">${icon('back', 21)}</button>` : '<span class="activation-header-spacer"></span>'}<div><span>${labels[index]}</span><small>${index + 1} of 4</small></div><button class="icon-button" type="button" data-activation-action="exit" aria-label="Exit setup">${icon('close', 20)}</button></header><div class="activation-progress" aria-label="Money setup progress">${labels.map((label, i) => `<span class="${i <= index ? 'done' : ''}" title="${label}"></span>`).join('')}</div><main class="activation-main"><span class="activation-kicker">${d.preview ? 'SIGNUP PREVIEW' : ''}</span><h1>${title}</h1><p class="activation-description">${description}</p><form id="activation-form" novalidate>${body}<p class="error activation-error" role="alert">${esc(d.error || '')}</p></form></main><footer class="activation-footer"><button class="button" type="button" data-activation-action="${action}">${primary}</button>${step === 'fund' && activationFundingStatus(d) === 'idle' && d.state.wallet === 0 ? '<button type="button" class="activation-text-button activation-defer" data-activation-action="defer">Waiting for my money</button><small>Your verified account can wait. Add money and plan when it arrives.</small>' : ''}</footer></section>`;
}

export function bindActivation(ctx, route) {
  const root = ctx.$('.activation-page'), d = ctx.draft.activation;
  if (!root || !d) return () => {};
  let alive = true, busy = false;
  const step = safeActivationStep(d, route.step);
  const stopConfetti = step === 'account-created' ? bindActivationConfetti(root) : () => {};
  const current = () => alive && root.isConnected && ctx.draft.activation === d;
  const fundingDocument = root.ownerDocument || globalThis.document;
  let fundingTimer = 0, checkingFunding = false;
  const capture = () => {
    if (!current()) return;
    root.querySelectorAll('[data-activation-field]').forEach(input => {
      if (['funding.amountText', 'funding.phone'].includes(input.dataset.activationField)) d.funding[input.dataset.activationField.slice(8)] = input.value;
      else d[input.dataset.activationField] = input.value;
    });
    ctx.saveDraft?.();
  };
  ctx.setCapture?.(capture);
  const refresh = () => { ctx.setCapture?.(null); ctx.saveDraft?.(); ctx.refresh(); };
  const error = message => { d.error = message; const el = root.querySelector('.activation-error'); if (el) el.textContent = message; ctx.saveDraft?.(); };
  const fundingMessage = message => { const el = root.querySelector('[data-activation-funding-status]'); if (el && el.textContent !== message) el.textContent = message; };
  const scheduleFundingCheck = () => {
    clearTimeout(fundingTimer); fundingTimer = 0;
    if (current() && step === 'fund' && activationFundingStatus(d) === 'pending' && fundingDocument && !fundingDocument.hidden) fundingTimer = setTimeout(() => { fundingTimer = 0; void checkFunding(); }, 4000);
  };
  const checkFunding = async ({ manual = false } = {}) => {
    if (!current() || step !== 'fund' || activationFundingStatus(d) !== 'pending' || checkingFunding || fundingDocument?.hidden) return;
    checkingFunding = true;
    const attemptId = d.fundingAttempt.id, button = root.querySelector('[data-activation-action="check-funding"]');
    if (manual) { d.fundingAttempt.manualCheckRequested = true; ctx.saveDraft?.(); if (button) button.disabled = true; fundingMessage('Checking for confirmation…'); }
    try {
      const receipt = await Promise.resolve(readDemoActivationFundingReceipt(d));
      if (!current() || fundingDocument?.hidden || d.fundingAttempt?.id !== attemptId) return;
      const result = checkActivationFunding(d, { receipt });
      ctx.saveDraft?.();
      if (!result.ok) { fundingMessage('We couldn’t confirm it yet. We’ll keep checking. Please don’t send it again.'); return; }
      if (result.status !== 'pending') { refresh(); return; }
      fundingMessage(d.fundingAttempt.manualCheckRequested ? 'Not here yet. We haven’t received confirmation. Please don’t send it again.' : 'Still waiting for confirmation. We’re checking automatically.');
      if (manual && button) button.textContent = 'Check again';
    } catch {
      if (current()) fundingMessage('We couldn’t check just now. We’ll try again. Please don’t send it again.');
    } finally {
      checkingFunding = false;
      if (current() && button) button.disabled = false;
      scheduleFundingCheck();
    }
  };
  const fundingVisibility = () => { clearTimeout(fundingTimer); fundingTimer = 0; if (!fundingDocument?.hidden) void checkFunding(); };
  if (step === 'fund' && activationFundingStatus(d) === 'pending') { fundingDocument?.addEventListener?.('visibilitychange', fundingVisibility); scheduleFundingCheck(); }
  const copyFeedback = message => { if (!current()) return; const el = root.querySelector('[data-activation-copy-feedback]'); if (el) el.textContent = message; };
  const copyNumber = async button => {
    const { number, example } = everydayDetails(d);
    if (!number) { copyFeedback('The account number is not available yet.'); return; }
    button.disabled = true;
    try {
      if (typeof globalThis.navigator?.clipboard?.writeText !== 'function') throw new Error('Clipboard unavailable');
      await globalThis.navigator.clipboard.writeText(number);
      copyFeedback(`${example ? 'Example account' : 'Account'} number copied.`);
    } catch {
      if (current()) {
        const numberElement = root.querySelector('[data-activation-account-number]');
        try {
          const selection = globalThis.getSelection?.(), range = globalThis.document?.createRange?.();
          if (numberElement && selection && range) { range.selectNodeContents(numberElement); selection.removeAllRanges(); selection.addRange(range); numberElement.focus?.({ preventScroll: true }); copyFeedback('Account number selected. Choose Copy to copy it.'); }
          else copyFeedback('Select the account number above and copy it.');
        } catch { copyFeedback('Select the account number above and copy it.'); }
      }
    } finally { if (current()) button.disabled = false; }
  };
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
    if (button.dataset.activationSource) { if (activationFundingStatus(d) !== 'idle') return; d.funding.source = button.dataset.activationSource; return refresh(); }
    if (button.dataset.activationAmount) { if (activationFundingStatus(d) !== 'idle') return; d.funding.amountText = (Number(button.dataset.activationAmount) / 100).toFixed(2); return refresh(); }
    if (button.dataset.activationDemoOutcome) {
      const result = simulateActivationFundingReceipt(d, { outcome: button.dataset.activationDemoOutcome });
      if (!result.ok) return error(result.message);
      ctx.saveDraft?.();
      root.querySelectorAll('[data-activation-demo-outcome]').forEach(control => { control.disabled = true; });
      const message = root.querySelector('[data-activation-demo-feedback]');
      if (message) message.textContent = 'Sample outcome ready. Lumo will check it automatically.';
      return;
    }
    if (button.dataset.activationCategory) { d.category = button.dataset.activationCategory; d.categoryName = ''; d.budgetSaved = false; d.step = 'purpose'; return refresh(); }
    if (button.dataset.activationRemove !== undefined) { d.items.splice(Number(button.dataset.activationRemove), 1); d.budgetSaved = false; d.step = 'purpose'; d.error = ''; return refresh(); }
    const action = button.dataset.activationAction;
    if (action === 'exit') return ctx.exitActivation();
    if (action === 'copy-account-number') return copyNumber(button);
    if (action === 'acknowledge-account') {
      const result = acknowledgeCreatedAccount(d);
      if (!result.ok) return error(result.message);
      return go('fund');
    }
    if (action === 'defer') { busy = true; button.disabled = true; return ctx.deferActivationFunding(); }
    if (action === 'back') return go(step === 'ready' ? 'purpose' : step === 'purpose' ? 'fund' : 'account-created');
    if (action === 'continue-purpose') return go('purpose');
    if (action === 'check-funding') return checkFunding({ manual: true });
    if (action === 'retry-funding') { const result = retryActivationFunding(d); if (!result.ok) return error(result.message); return refresh(); }
    if (action === 'fund') {
      const result = requestActivationFunding(d, { amount: parseAmount(d.funding.amountText), source: d.funding.source, phone: d.funding.phone ?? d.state.profile?.phone });
      if (!result.ok) return error(result.message);
      return refresh();
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
  return () => { alive = false; clearTimeout(fundingTimer); fundingDocument?.removeEventListener?.('visibilitychange', fundingVisibility); stopConfetti(); ctx.setCapture?.(null); root.removeEventListener('input', input); root.removeEventListener('change', input); root.removeEventListener('click', click); root.querySelector('form')?.removeEventListener('submit', submit); };
}
