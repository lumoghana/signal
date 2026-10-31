/* Three payment stages: details → review OR Pause → PIN and result.
   Navigation is shorter; validation, the Pause rules and the ledger are unchanged. */
(()=>{
'use strict';
const E=L.e,M=L.money;
const go=L.go;
L.go=function(route,params={}){
 const d=L.state.paymentDraft;
 // Every existing return to review uses this selector, including request
 // payments, corrected plan links, retries, funding returns and stale quotes.
 // openPause owns the guard and fresh review fingerprint before entering Pause.
 if(route==='paymentReview'&&d&&d.boxDirection!=='out'&&!d.submittedTxId&&L.state.onboarded&&!L.state.locked&&!L.state.closed){
  const p=L.planImpactSummary(d);
  if(p.valid&&p.canPay&&L.paymentNeedsPause(d))return L.openPause();
 }
 return go.call(this,route,params);
};
const pause=L.views.pause;
L.views.pause=()=>{
 let html=pause();const d=L.state.paymentDraft;
 if(!d||d.submittedTxId||!html.includes('class="pause-payment-context"'))return html;
 const context=[d.provider,d.destination].filter(Boolean).join(' · ');
 const facts=`<p class="pause-payment-context"><span class="projection-tag">${d.method==='box'?'Transfer to':'Payment to'}</span> <strong>${E(d.name)}</strong>${context?`<small>${E(context)}</small>`:''}</p><div class="decision-payment-summary${Number(d.fee||0)===0?' is-zero-fee':''}" aria-label="Payment to review">${Number(d.fee||0)>0?`<span>Amount <strong>${M(d.amount)}</strong></span>`:''}<span>Fee <strong>${M(d.fee||0)}</strong></span><span>${d.method==='box'?'To transfer':'Total'} <strong>${M(Number(d.amount)+Number(d.fee||0))}</strong></span></div>${d.product?`<p class="decision-product">${E(d.product)}</p>`:''}`;
 html=html.replace(/<p class="pause-payment-context">[\s\S]*?<\/p>/,facts);
 // Back returns to entered details, never to a redundant ordinary review.
 if(d.method==='box')html=html.replaceAll('Cancel payment','Cancel transfer').replace('Nothing sent yet. Authorise on the next step.','Nothing moved yet. Authorise on the next step.');
 return html.replaceAll("L.go('paymentReview')",'L.editPayment()');
};
const decorate=L.decorateView;
L.decorateView=(html,route)=>{
 html=decorate?decorate(html,route):html;
 const d=L.state.paymentDraft;
 // Pay from is a visible native selector on the details surface. Selecting a
 // budget purpose must not require opening another shelf or a fourth stage.
 let step=0,label='',steps=3;
 if(['send','bill'].includes(route)&&d&&!d.submittedTxId){step=1;label='Details';}
 if(['paymentReview','pause'].includes(route)&&d&&!d.submittedTxId){step=2;label=route==='pause'?'Your choice':'Review';}
 if(route==='authorize'&&d&&!d.submittedTxId){step=3;label='Authorise';}
 if(route==='momoAdd'){
  const f=L.state.fundingDraft;step=f?.txId?3:f?.stage==='review'?2:1;
  label=step===1?'Wallet & amount':step===2?'Review':'Result';
 }
 if(route==='requestCreate'){steps=2;step=L.state.requestDraft?.stage==='review'?2:1;label=step===1?'Request details':'Review';}
 if(!step)return html;
 return `<div class="transaction-stage" aria-label="Step ${step} of ${steps}: ${E(label)}"><span>${step} of ${steps} <strong>${E(label)}</strong></span><span class="transaction-stage-dots" aria-hidden="true">${Array.from({length:steps},(_,i)=>i+1).map(n=>`<i${n<=step?' class="is-complete"':''}></i>`).join('')}</span></div>`+html;
};
})();
