import { icon } from './ui.js';
import { SETUP_TERMS_VERSION, hasAcceptedSetupTerms } from './setup-terms-model.js';

export function renderSetupTerms(ctx) {
  const accepted = hasAcceptedSetupTerms(ctx.draft.onboarding);
  return `<section class="setup-terms-page" aria-labelledby="setup-terms-title"><header class="setup-terms-header"><button type="button" class="setup-terms-back" data-terms-action="exit" aria-label="Back to welcome">${icon('back', 21)}</button><span aria-label="Lumo" class="setup-terms-brand">lumo</span><span class="setup-terms-header-space"></span></header>
    <main class="setup-terms-main"><p class="setup-terms-kicker">Terms &amp; Conditions</p><h1 id="setup-terms-title">Before we begin.</h1><p class="setup-terms-intro">Your account is with GCB Bank.<br>Your experience is with Lumo.</p>
    <dl class="setup-terms-roles"><div><dt>Your banking account</dt><dd>GCB Bank</dd></div><div><dt>Your everyday experience</dt><dd>Lumo</dd></div></dl>
    <div class="setup-terms-sections"><section><h2>Your money, with GCB Bank.</h2><p>Your account is opened in your name with GCB Bank. GCB Bank provides the banking account and holds your money. Lumo provides the digital experience that helps you understand and manage it.</p></section>
    <section><h2>A digital-only account, through Lumo.</h2><p>You access and manage this account through Lumo: your Everyday money, payments, plans and money insights live in the Lumo experience.</p></section>
    <section><h2>Come to Lumo for everyday help.</h2><p>Lumo is your first point of contact for day-to-day service and support. We help with using the app, payments and account questions, and work with GCB Bank where banking support is needed.</p></section>
    <section><h2>Bank-account disputes go to GCB Bank.</h2><p>The underlying account is with GCB Bank, so you can raise a banking dispute directly with GCB Bank. Lumo can help you escalate it. If you remain dissatisfied after the bank’s response, you can use the Bank of Ghana complaints process.</p><div class="setup-terms-links"><a href="https://www.gcbbank.com.gh/contact" target="_blank" rel="noopener noreferrer">GCB Bank contacts ${icon('arrow', 15)}</a><a href="https://www.bog.gov.gh/supervision-regulation/complaints-procedures/" target="_blank" rel="noopener noreferrer">Bank of Ghana complaints ${icon('arrow', 15)}</a></div></section></div>
    <details class="setup-terms-details"><summary>Using Lumo responsibly ${icon('chevron', 16)}</summary><div><h2>Your choices and security</h2><p>Keep your PIN and sign-in details private. Check the recipient, amount and any displayed fee before confirming a payment. Lux’s guidance uses the information available; check and correct your plan when your circumstances change.</p><h2>Your data and consent</h2><p>Identity verification has its own explanation and consent step for Ghana Card and selfie information. Agreeing here does not replace that separate consent.</p><h2>Fees and optional features</h2><p>Review any applicable charges and feature controls before you confirm or switch them on. Final service terms, fees and the partner-access recovery procedure must be confirmed with GCB Bank before launch.</p></div></details>
    <aside class="setup-terms-prototype"><strong>Prototype terms</strong><p>This preview uses simulated verification, accounts and account numbers. No live bank account is opened. These prototype terms describe the experience being tested; final live-service terms will be confirmed with GCB Bank.</p><small>Version ${SETUP_TERMS_VERSION}</small></aside></main>
    <footer class="setup-terms-footer"><label class="setup-terms-consent"><input type="checkbox" name="setupTerms" ${accepted ? 'checked' : ''}><span>I’ve read and agree to these prototype Terms &amp; Conditions.</span></label><p class="setup-terms-error" role="alert"></p><button type="button" class="setup-terms-continue" data-terms-action="continue" ${accepted ? '' : 'disabled'}>${accepted ? 'Continue setup' : 'Agree and start setup'} ${icon('arrow', 19)}</button></footer></section>`;
}

export function bindSetupTerms(ctx) {
  const root = ctx.$('.setup-terms-page');
  if (!root) return () => {};
  const checkbox = root.querySelector('[name="setupTerms"]');
  const button = root.querySelector('[data-terms-action="continue"]');
  let alive = true, busy = false;
  const change = () => { if (!alive) return; button.disabled = checkbox?.checked !== true; };
  const click = event => {
    const target = event.target.closest('[data-terms-action]');
    if (!alive || !root.isConnected || !target || target.disabled || busy) return;
    if (target.dataset.termsAction === 'exit') return ctx.exitSetupTerms();
    if (target.dataset.termsAction !== 'continue') return;
    if (checkbox?.checked !== true) { root.querySelector('.setup-terms-error').textContent = 'Read and agree to these prototype terms before starting setup.'; return; }
    busy = true; button.disabled = true;
    const result = ctx.completeSetupTerms({ accepted: true });
    if (result?.ok === false) { busy = false; change(); root.querySelector('.setup-terms-error').textContent = result.message; }
  };
  root.addEventListener('change', change); root.addEventListener('click', click);
  return () => { alive = false; root.removeEventListener('change', change); root.removeEventListener('click', click); };
}
