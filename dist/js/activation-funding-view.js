import { cash, esc, icon } from './ui.js';
import { activationEverydayAccount, activationEverydayAccountNumber, activationFundingStatus } from './activation-model.js';

const phoneField = d => `<label class="activation-label activation-funding-phone" for="activation-momo-phone">MoMo number<input class="input" type="tel" inputmode="tel" autocomplete="tel" id="activation-momo-phone" data-activation-field="funding.phone" value="${esc(d.funding.phone ?? d.state.profile?.phone ?? '')}" placeholder="024 000 0000" maxlength="20"></label>`;
const presets = d => `<div class="activation-presets" aria-label="Suggested amounts">${[5000,10000,20000].map(amount => `<button type="button" data-activation-amount="${amount}" aria-pressed="${Number(d.funding.amountText)*100===amount}">${cash(amount,{decimals:false})}</button>`).join('')}</div>`;
const demoControls = attempt => `<details class="activation-provider-demo"><summary>Demo controls</summary><p>No provider is connected. Choose a sample outcome, then let Lumo check it automatically or tap to check.</p><div>${[['confirmed','Simulate money received'],['failed','Simulate declined'],['expired','Simulate request expired']].map(([outcome,label])=>`<button type="button" data-activation-demo-outcome="${outcome}"${attempt.demoReceipt?' disabled':''}>${label}</button>`).join('')}</div><p data-activation-demo-feedback role="status">${attempt.demoReceipt?'Sample outcome ready for the next check.':''}</p></details>`;
const transferDetails = d => {
  const attempt=d.fundingAttempt,account=activationEverydayAccount(d),number=activationEverydayAccountNumber(d);
  return `<dl class="activation-transfer-details"><div><dt>Bank</dt><dd>GCB Bank</dd></div><div><dt>Account name</dt><dd>${esc(account?.holderName||'Your Everyday account')}</dd></div><div><dt>${account?.status==='simulated-ready'?'Example account number':'Everyday account number'}</dt><dd class="activation-transfer-number"><output data-activation-account-number tabindex="-1">${esc(number)}</output><button type="button" data-activation-action="copy-account-number" aria-label="Copy Everyday account number">Copy</button></dd></div><div><dt>Reference</dt><dd class="activation-transfer-reference">${esc(attempt.reference)}</dd></div></dl><p class="activation-copy-feedback" data-activation-copy-feedback role="status" aria-live="polite"></p>`;
};

export function renderActivationFunding(d, amountField) {
  const status=activationFundingStatus(d),attempt=d.fundingAttempt,momo=attempt?.source==='Mobile money';
  if(status==='confirmed') return {
    status,title:'Money in.<br>Nice first move.',description:'Your money has reached Everyday. Now let’s give it a plan.',
    body:`<div class="activation-win" aria-hidden="true">${icon('check',47)}<span>FIRST TOP-UP. IN.</span></div><div class="activation-balance"><span>Received in your Everyday account</span><strong>${cash(d.state.wallet)}</strong></div><p class="activation-funding-confirmed">${icon('check',16)} Receipt confirmed</p><p class="activation-demo-note">Confirmed demo top-up. No real money moved.</p>`,
    primary:'Give it a plan',action:'continue-purpose'
  };
  if(status==='pending') return {
    status,title:momo?'Approve it<br>on your phone.':'Send it.<br>We’ll watch for it.',
    description:momo?'Approve the MoMo prompt on your phone. Enter your MoMo PIN there.':'Transfer from your banking app to the Everyday account below, using this reference.',
    body:`<div class="activation-funding-amount"><strong>${cash(attempt.amount)}</strong><span>${momo?`From MoMo · ${esc(attempt.phone)}`:'To your GCB Everyday account'}</span></div>${momo?'':transferDetails(d)}<div class="activation-funding-watch"><span class="activation-funding-spinner" aria-hidden="true"></span><span>${momo?'Waiting for MoMo confirmation':'Waiting for your transfer'}</span></div><p class="activation-funding-check-note" data-activation-funding-status role="status" aria-live="polite">${attempt.manualCheckRequested?'Not here yet. We haven’t received confirmation. Please don’t send it again.':'We check automatically while this page is open.'}</p><p class="activation-demo-note">${momo?'Prototype: no real prompt is sent.':'Example account only. Do not transfer real money.'} Use Demo controls to try a confirmation.</p>${demoControls(attempt)}`,
    primary:attempt.manualCheckRequested?'Check again':momo?'I’ve approved it':'I’ve sent it',action:'check-funding'
  };
  if(status==='failed'||status==='expired') return {
    status,title:status==='expired'?'That request<br>has expired.':'That didn’t<br>go through.',
    description:status==='expired'?'The provider returned an expired request. No money has been confirmed in Everyday.':'The provider declined this request. No money has been added to Lumo.',
    body:`<div class="activation-funding-amount"><strong>${cash(attempt.amount)}</strong><span>${esc(attempt.source)}</span></div><p class="activation-demo-note">If you were debited, check with your provider before paying again.</p><p class="activation-demo-note">Simulated provider result · No real money moved.</p>`,
    primary:'Try again',action:'retry-funding'
  };
  const source=d.funding.source;
  return {
    status,title:'Your first<br>money move.',description:'Start with a little. We’ll confirm it arrives before you plan it.',
    body:`<div class="activation-sources" aria-label="Choose how to add money">${[['Mobile money','phone'],['Bank transfer','bank']].map(([value,symbol])=>`<button type="button" data-activation-source="${value}" aria-pressed="${source===value}">${icon(symbol,22)}<span>${value}</span>${source===value?icon('check',16):''}</button>`).join('')}</div>${source==='Mobile money'?phoneField(d):''}${amountField(d.funding.amountText,'activation-funding','How much are we starting with?')}${presets(d)}<p class="activation-demo-note">Demo funding. No real request or transfer is made.</p>`,
    primary:source==='Mobile money'?'Send demo MoMo prompt':'Get transfer details',action:'fund'
  };
}
