/* Optional biometric authorisation demonstration.
   This static preview does not capture biometrics or claim native device trust.
   A real app must replace the explicit demo approval with a bank-verified,
   transaction-bound device challenge. PIN and payment guards remain shared. */
(()=>{
'use strict';
const E=L.e,B=L.btn,M=L.money;
const receipts=new WeakMap();
let prompt=null,submitting=false;
const ttl=60*1000;
const draft=()=>L.state.paymentDraft;
const session=()=>L.route==='authorize'&&L.state.onboarded&&!L.state.locked&&!L.state.closed;
const protectedWithdrawal=d=>d?.method==='box'&&d.boxDirection==='out'&&L.boxProtection?.get(d.boxId)?.status==='active';
const ready=d=>session()&&!!d&&!d.submittedTxId&&(L.moneyBoxAuthorizationCurrent?L.moneyBoxAuthorizationCurrent(d):L.paymentAuthorizationCurrent?.(d))&&(!protectedWithdrawal(d)||L.boxProtection.validWithdrawal(d));
const scope=d=>{
 const p=d?.boxId?L.boxProtection?.get(d.boxId):null;
 return JSON.stringify([
  d?.id,d?.method,d?.amount,d?.fee,d?.name,d?.destination,d?.provider,d?.essentialId,d?.budgetSource,d?.category,d?.categoryChoice,d?.note,d?.product,d?.bill,d?.requestId,d?.merchantSaleId,d?.boxId,d?.boxDirection,d?.reviewFingerprint,d?.boxQuote,d?.pauseAcceptedSignature,d?.boxApprovalId,
  L.state.balance,L.balances(),L.accountBalances?.(),L.state.essentials,L.state.goals,L.state.profile?.account,L.state.profile?.phone,L.state.profile?.handle,
  [p?.status,p?.revision,p?.phone],L.pauseEngine?.signature(d)
 ]);
};
const same=record=>!!record&&record.account===L.state&&record.draft===draft()&&session()&&!record.draft.submittedTxId&&record.expires>Date.now()&&record.scope===scope(record.draft);
const reset=()=>{prompt=null;};
const captureControls=record=>{if(!record)return;record.outcome=L.value('payment-outcome')||record.outcome;record.delivery=L.value('delivery-outcome')||record.delivery;};
const restoreControls=record=>{for(const [id,value]of [['payment-outcome',record?.outcome],['delivery-outcome',record?.delivery]]){const el=document.getElementById(id);if(el&&value)el.value=value;}};
const returnToReview=()=>{reset();if(L.state.locked||L.state.closed||!L.state.onboarded){L.render();return;}L.go('paymentReview');L.toast('Your payment changed. Review it before authorising.');};
const icon='<svg width="30" height="30" viewBox="0 0 32 32" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M10 3H5a2 2 0 0 0-2 2v5m19-7h5a2 2 0 0 1 2 2v5M3 22v5a2 2 0 0 0 2 2h5m12 0h5a2 2 0 0 0 2-2v-5M11 12v2m10-2v2m-5 0v5h-2m-3 3c3 2 7 2 10 0"/></svg>';
function sampleControls(record){
 if(!L.testMode)return '';
 const select=(id,label,value,values)=>`<label class="field" for="${id}"><span>${E(label)}</span><select class="input" id="${id}">${values.map(v=>`<option${value===v?' selected':''}>${E(v)}</option>`).join('')}</select></label>`;
 return `<details class="notice small biometric-test-controls"><summary>Tester controls</summary>${select('payment-outcome','Payment result',record.outcome,['Completed','Pending','Failed'])}${record.draft.bill?select('delivery-outcome','Product delivery',record.delivery,['Delivered','Pending','Failed']):''}${B('Try an unsuccessful biometric check','L.biometricPayment.fail()','text-btn')}<p>No live payment or biometric check is sent.</p></details>`;
}
const view=L.views.authorize;
L.views.authorize=()=>{
 let html=view();const d=draft();
 if(!d||d.submittedTxId||!html.includes('id="payment-pin"'))return html;
 if(prompt&&!same(prompt))reset();
 if(!prompt){
  const alternative=`<div class="biometric-choice">${B(icon+'<span>Use biometrics <small>Demo</small></span>','L.biometricPayment.open()','primary biometric-entry')}<p class="tiny muted">Face or fingerprint demo. You can also use your PIN below.</p></div>`;
  return html.replace(/<form\b/,alternative+'<form');
 }
 const failed=prompt.failed;
 const surface=`<section class="biometric-prompt" aria-labelledby="biometric-title"><div class="biometric-status${failed?' is-failed':''}" aria-hidden="true">${failed?L.icon('close',28):icon}</div><h2 id="biometric-title" tabindex="-1">${failed?'Check wasn’t approved.':'Approve with biometrics'}</h2><p class="small">${failed?'Try the sample check again or use your PIN.':'Face or fingerprint can confirm this payment in the real app.'}</p><p class="biometric-disclosure small">Biometric demo · No face or fingerprint is captured.</p><div id="error" role="alert"></div>${sampleControls(prompt)}<div class="actions">${failed?B('Try again','L.biometricPayment.retry()'):B(d.method==='box'?'Approve sample transfer':'Approve sample payment','L.biometricPayment.approve()')}${B('Use PIN instead','L.biometricPayment.cancel()','secondary')}${B('Back to review',"L.go('paymentReview')",'text-btn')}</div></section>`;
 return html.replace(/<form\b[^>]*>[\s\S]*?<\/form>/,surface);
};
const api={
 open(){
  if(submitting)return false;const d=draft();
  if(!ready(d)){if(session()&&d&&!d.submittedTxId)returnToReview();return false;}
  const field=document.getElementById('payment-pin');if(field)field.value='';
  prompt={account:L.state,draft:d,scope:scope(d),expires:Date.now()+ttl,outcome:L.value('payment-outcome')||'Completed',delivery:L.value('delivery-outcome')||'Delivered',failed:false};
  L.render();document.getElementById('biometric-title')?.focus?.({preventScroll:true});return true;
 },
 cancel(){if(!prompt)return false;const previous=prompt;captureControls(previous);reset();L.render();restoreControls(previous);document.getElementById('payment-pin')?.focus?.({preventScroll:true});return true;},
 fail(){if(!same(prompt))return false;captureControls(prompt);prompt.failed=true;L.render();document.getElementById('biometric-title')?.focus?.({preventScroll:true});return true;},
 retry(){if(!same(prompt))return false;captureControls(prompt);prompt.failed=false;L.render();document.getElementById('biometric-title')?.focus?.({preventScroll:true});return true;},
 approve(){
  if(submitting||!prompt||prompt.failed)return false;
  if(!same(prompt)||!ready(prompt.draft)){returnToReview();return false;}
  const record=prompt,ticket={};reset();submitting=true;
  receipts.set(ticket,{...record,expires:Date.now()+5000});
  try{L.authorizePayment(ticket);}finally{receipts.delete(ticket);submitting=false;}
  return !!record.draft.submittedTxId;
 },
 valid(ticket,d){const receipt=ticket&&typeof ticket==='object'?receipts.get(ticket):null;return same(receipt)&&receipt.draft===d&&ready(d);},
 consume(ticket,d){const valid=api.valid(ticket,d);if(ticket&&typeof ticket==='object')receipts.delete(ticket);return valid;}
};
L.biometricPayment=Object.freeze(api);
const before=L.beforeNavigate;
L.beforeNavigate=function(route,...args){if(route!=='authorize')reset();return before?.call(this,route,...args);};
const render=L.render;
L.render=function(...args){if(prompt&&!same(prompt))reset();return render.apply(this,args);};
const invalidateVisiblePrompt=()=>{const visible=!!prompt;reset();if(visible&&L.route==='authorize')L.render();};
window.addEventListener('pagehide',invalidateVisiblePrompt);
window.addEventListener('pageshow',()=>{if(L.route==='authorize'&&!prompt&&document.querySelector('.biometric-prompt'))L.render();});
document.addEventListener('visibilitychange',()=>{if(document.hidden)invalidateVisiblePrompt();});
})();
