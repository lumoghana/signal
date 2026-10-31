/* Compare proposed choices through the existing plan engine. Alternatives edit
   a draft or open funding; only the existing authorisation can move money out. */
(()=>{
'use strict';
if(!window.L||L.pauseRecovery)return;
const E=L.e,M=L.money,B=L.btn;
const minor=n=>Math.round(Number(n)*100),cash=n=>minor(n)/100;
const accountReady=()=>L.state.onboarded&&!L.state.locked&&!L.state.closed;
const paymentMark=d=>JSON.stringify([d?.id,d?.method,d?.name,d?.destination,Number(d?.amount),Number(d?.fee||0),d?.essentialId||'',d?.bill||'',d?.requestId||'',d?.boxId||'',d?.boxDirection||'']);
const activeDraft=()=>{const d=L.state.paymentDraft;return d&&!d.submittedTxId?d:null;};
function summary(d=activeDraft(),state=L.state){
 if(!d||d.submittedTxId||typeof L.planImpactSummary!=='function')return null;
 const impact=L.planImpactSummary(d,state);
 if(!impact.valid||!impact.canPay||!impact.hasPlan||impact.totalGap<=0)return null;
 const amount=cash(impact.totalGap);
 if(!Number.isFinite(amount)||amount<=0)return null;
 const candidate={...state,balance:cash(Number(state.balance)+amount)};
 const funded=L.planImpactSummary(d,candidate);
 if(!funded.valid||!funded.canPay||funded.totalGap!==0)return null;
 const lower=L.planCoveredAmountOption?.(d,state)||null;
 return {impact,lower,funding:{amount,impact:funded,withinLimit:amount<=5000},signature:L.pauseEngine.signature(d,state),paymentMark:paymentMark(d)};
}
const expected=(d,s)=>[d.id,s.signature,s.funding.amount];
const position=p=>p.totalGap?`${M(p.totalGap)} of Budget uncovered`:`Budget covered · ${M(p.room)} outside it`;
const choicesMarkup=s=>`<section class="pause-recovery-calculation" aria-label="Compare proposed choices"><h3>Compare choices · projected</h3><dl>${s.lower?`<div><dt>Use ${E(M(s.lower.amount))}${s.lower.fee?' + '+E(M(s.lower.fee))+' fee':''}</dt><dd>${E(position(s.lower.impact))}</dd></div>`:''}<div><dt>Add ${E(M(s.funding.amount))}, then ${s.impact.amount?'pay '+E(M(s.impact.amount)): 'review'}</dt><dd>${E(position(s.funding.impact))}<small>Only after the extra money is confirmed received.</small></dd></div><div><dt>Continue with ${E(M(s.impact.amount))}${s.impact.fee?' + '+E(M(s.impact.fee))+' fee':''}</dt><dd>${E(position(s.impact))}</dd></div></dl><p>These compare saved Budget costs. Other costs may be missing. Adding money and paying are separate actions.</p></section>`;
const pause=L.views.pause;
L.views.pause=function(...args){
 let html=pause.apply(this,args),d=activeDraft();
 if(L.route!=='pause'||!accountReady()||!d)return html;
 const s=summary(d);if(!s||!html.includes('class="pause-decisions"'))return html;
 const quote=E(JSON.stringify(expected(d,s)));
 const original=html.match(/<button\b[^>]*\bdata-plan-adjustment\b[^>]*>[\s\S]*?<\/button>/)?.[0]||'';
 const lower=original.replace('class="text-btn pause-suggested-amount"','class="text-btn pause-suggested-amount pause-recovery-choice"').replace('<small>','<small class="sr-only">');
 const label=s.funding.withinLimit?'Add '+M(s.funding.amount)+' first':'Add money first';
 const supporting=s.funding.withinLimit?'Budget covered after it arrives':M(s.funding.amount)+' needed · above one top-up limit';
 const add=`<button type="button" class="text-btn pause-recovery-choice pause-recovery-fund" data-pause-recovery-fund onclick="L.openPauseRecoveryFunding(${quote})"><span>${E(label)}</span><small class="sr-only">${E(supporting)}</small></button>`;
 const controls=`<div class="pause-recovery-options${lower?'':' pause-recovery-single'}" data-pause-effects aria-hidden="true" inert aria-label="Other ways forward">${lower}${add}</div>`;
 html=original?html.replace(original,controls):html.replace('<div class="pause-decisions">',controls+'<div class="pause-decisions">');
 // Keep recipient, reference, fee and total together rather than repeating a
 // second receipt below the payment context. The reviewed values stay intact.
 html=html.replace(/(<p class="pause-payment-context">[\s\S]*?<\/p>)(<div class="decision-payment-summary[^"]*"[^>]*>[\s\S]*?<\/div>)/,(_,context,receipt)=>`<div class="pause-recovery-context">${context}${receipt}</div>`);
 return html.replace(/(<details class="pause-calculation"[^>]*>\s*<summary[^>]*>[\s\S]*?<\/summary>)/,(_,opening)=>opening+choicesMarkup(s));
};
L.openPauseRecoveryFunding=quote=>{
 if(L.route!=='pause'||!accountReady())return false;
 const d=activeDraft(),s=summary(d);
 if(!d||!s||!Array.isArray(quote)||JSON.stringify(quote)!==JSON.stringify(expected(d,s))){
  if(d){L.go('paymentReview');L.toast('Your money or Budget changed. Review the current choice.');}return false;
 }
 // A pending or unfinished funding form is kept and reviewed, never replaced.
 L.state.pauseRecoveryFunding={paymentId:d.id,paymentMark:paymentMark(d),amount:s.funding.amount,paymentAmount:Number(d.amount),createdAt:Date.now()};
 L.pauseEngine.respond?.('add_money',d);
 for(const key of ['reviewFingerprint','pauseAcceptedSignature','pauseOffer','pauseExposureSignature'])delete d[key];
 L.openFunding('paymentReview');return true;
};
const fundingContext=()=>{
 const c=L.state.pauseRecoveryFunding,d=activeDraft();
 return c&&d&&accountReady()&&L.state.fundingReturn==='paymentReview'&&c.paymentId===d.id&&c.paymentMark===paymentMark(d)?c:null;
};
const currentFundingNeed=()=>{
 const d=activeDraft(),p=d&&L.planImpactSummary(d);
 return p?.valid?cash(Math.max(0,Number(p.totalGap)||0,Number(p.fundingShortfall)||0)):null;
};
const addMoney=L.views.addMoney;
L.views.addMoney=function(...args){
 const html=addMoney.apply(this,args),c=fundingContext();if(!c)return html;
 const needed=currentFundingNeed(),explanation=needed===null?'Review the payment again if its details have changed.':needed>0?`${E(M(needed))} more is currently needed to cover this payment and your saved Budget.`:'Your payment now fits your saved Budget. Adding more money is optional.';
 const hint=`<p class="pause-recovery-funding-note">Your ${E(M(c.paymentAmount))} payment is kept. ${explanation} Review again after money arrives. Nothing has been sent.</p>`;
 return html.includes('<div class="funding-choices">')?html.replace('<div class="funding-choices">',hint+'<div class="funding-choices">'):hint+html;
};
for(const [name,key] of [['startMomoFunding','fundingDraft'],['startBankFunding','bankFunding']]){
 const start=L[name];L[name]=function(...args){
  const c=fundingContext(),old=L.state[key],result=start.apply(this,args),f=L.state[key];
  const needed=c?currentFundingNeed():null;
  if(c&&needed>0&&needed<=5000&&f&&f!==old&&!f.txId&&(key==='bankFunding'||f.stage==='form')&&!String(f.amount??'').trim()){
   f.amount=needed;L.save();L.render();
  }
  return result;
 };
}
const done=L.fundingDone;
L.fundingDone=function(...args){
 const c=fundingContext(),result=done.apply(this,args);
 if(c&&L.state.pauseRecoveryFunding===c){delete L.state.pauseRecoveryFunding;L.save();}
 return result;
};
L.pauseRecovery={summary};
})();
