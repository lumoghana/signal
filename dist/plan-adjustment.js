/* A smaller editable amount, verified by the same plan engine as the Pause.
   Choosing it changes a draft and returns to Review. It never accepts or pays. */
(()=>{
'use strict';
const E=L.e,M=L.money;
const cents=value=>Math.round(Number(value)*100);
const editable=d=>d&&!d.submittedTxId&&!d.fixedAmount&&!d.requestId&&!d.merchantSaleId&&!d.bill&&d.checked&&d.name&&d.destination&&['lumo','campus','momo','bank'].includes(d.method);
const hasCosts=s=>L.planScopeSummary?L.planScopeSummary(s).costCount>0:(s.essentials||[]).some(x=>Number.isFinite(Number(x.amount))&&Number(x.amount)>0);
L.planCoveredAmountOption=(d=L.state.paymentDraft,s=L.state)=>{
 if(!editable(d)||!hasCosts(s)||typeof L.paymentFee!=='function'||L.moneyInput(d.amount,.01,5000)===null)return null;
 const original=L.planImpactSummary(d,s);
 if(!original.valid||!original.canPay||!original.hasPlan||original.totalGap<=0)return null;
 const high=Math.min(500000,cents(d.amount)-1);
 if(!Number.isSafeInteger(high)||high<1)return null;
 const quote=minor=>{
  const amount=minor/100,fee=Number(L.paymentFee(d.method,amount));
  if(!Number.isFinite(fee)||fee<0||Math.abs(fee*100-cents(fee))>.000001)return null;
  const impact=L.planImpactSummary({...d,amount,fee},s);
  return impact.valid&&impact.canPay&&impact.totalGap===0?{amount,fee,impact}:null;
 };
 // Current supported methods use fixed, nonnegative fees. Their coverage is
 // monotone in cents, including the engine's fulfilment of a linked cost.
 if(!quote(1))return null;
 let left=1,right=high,best=null;
 while(left<=right){const mid=Math.floor((left+right)/2),candidate=quote(mid);if(candidate){best=candidate;left=mid+1;}else right=mid-1;}
 if(!best)return null;
 // Recheck the returned boundary rather than presenting an unchecked estimate.
 const result=quote(cents(best.amount));if(!result)return null;
 return {...result,signature:L.pauseEngine.signature(d,s)};
};
const pause=L.views.pause;
L.views.pause=()=>{
 const html=pause(),d=L.state.paymentDraft;
 if(L.route!=='pause'||!html.includes('class="pause-decisions"'))return html;
 const option=L.planCoveredAmountOption(d);if(!option)return html;
 const expected=E(JSON.stringify([d.id,option.signature,option.amount,option.fee]));
 const action=`<button type="button" class="text-btn pause-suggested-amount" data-plan-adjustment data-pause-effects aria-hidden="true" inert onclick="L.applyPlanCoveredAmount(${expected})"><span>Use <strong>${M(option.amount)}</strong></span><small>Plan stays covered${option.fee?' · total '+M(option.amount+option.fee):''}</small></button>`;
 return html.replace('<div class="pause-decisions">',action+'<div class="pause-decisions">');
};
L.applyPlanCoveredAmount=expected=>{
 const d=L.state.paymentDraft;
 if(L.route!=='pause'||!L.state.onboarded||L.state.locked||L.state.closed||!Array.isArray(expected)||!editable(d))return;
 const option=L.planCoveredAmountOption(d);
 if(!option||JSON.stringify(expected)!==JSON.stringify([d.id,option.signature,option.amount,option.fee])){
  L.go('paymentReview');L.toast('Your money or plan changed. Review the current figures.');return;
 }
 L.pauseEngine.respond('edit_amount',d);
 Object.assign(d,{amount:option.amount,fee:option.fee});
 for(const key of ['reviewFingerprint','pauseAcceptedSignature','pauseOffer','pauseExposureSignature'])delete d[key];
 L.clearFormDraft?.('send',{method:d.method});L.save();L.go('paymentReview');
 L.toast('Amount updated. Review it before continuing.');
};
})();
