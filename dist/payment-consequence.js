/* One prospective consequence stays visible through Review and authorisation.
   The existing plan engine calculates it; existing guards still authorise it. */
(()=>{
'use strict';
if(!window.L||L.paymentConsequence)return;
const E=L.e,M=L.money;
const permitted=s=>!!s?.onboarded&&!s.locked&&!s.closed;
const validMoney=n=>Number.isFinite(Number(n))&&Number(n)>=0&&Math.abs(Number(n)*100-Math.round(Number(n)*100))<.000001;
const validDate=value=>/^\d{4}-\d{2}-\d{2}$/.test(String(value||''))&&Number.isFinite(Date.parse(value+'T12:00:00Z'))&&new Date(value+'T12:00:00Z').toISOString().slice(0,10)===value;
const currentState=state=>{
 // Reconcile only a local coverage cache, just as the existing outlook does.
 // Preparing this explanation must not change a saved cost or bank balance.
 const facts={...state,essentials:(state.essentials||[]).map(x=>({...x}))};
 L.reconcileEssentialCoverage?.(facts);return facts;
};
const summary=(d=L.state.paymentDraft,state=L.state,now=Date.now())=>{
 if(!permitted(state)||!d||d.submittedTxId||!validMoney(d.amount)||Number(d.amount)<.01||Number(d.amount)>5000||!validMoney(d.fee||0)||!L.planImpactSummary)return null;
 // A virtual-card purchase already spends card money. Only card top-ups use
 // Everyday money in this journey and can have an Everyday consequence.
 if(d.fundingAccount==='virtual-card'||d.cardPurchase)return null;
 const box=d.method==='box',withdrawal=box&&(d.boxDirection||d.direction)==='out',topUp=['virtualCard','virtualCardCreate'].includes(d.method);
 if(box&&!(state.goals||[]).some(g=>g.id===d.boxId&&!g.archived&&!g.deleted))return null;
 if(d.essentialId&&!(state.essentials||[]).some(c=>c.id===d.essentialId&&!c.archived&&!c.deleted))return null;
 const facts=currentState(state),impact=L.planImpactSummary(d,facts,now);
 if(!impact?.valid||![impact.after,impact.room,impact.totalGap].every(Number.isFinite))return null;
 const budget=L.budgetStateSummary?.(facts,now),hasBudget=budget?.hasBudget??impact.hasPlan;
 const horizon=facts.planHorizon||{},today=new Date(now).toISOString().slice(0,10),changedAllowance=horizon.mode==='allowance'&&horizon.date!==(facts.allowance?.date||'');
 const basis=L.experienceClarity?.basis?.({state:facts,now});
 const periodStatus=basis?.status||(!hasBudget?'no-budget':changedAllowance?'changed-allowance':budget?.ended?'ended':horizon.mode==='allowance'&&validDate(horizon.date)&&horizon.date<=today?'allowance-due':['date','allowance'].includes(horizon.mode)&&validDate(horizon.date)?'dated':'saved-costs');
 const datesNeedReview=['ended','changed-allowance','allowance-due'].includes(periodStatus),dated=periodStatus==='dated';
 const kind=box?'transfer':topUp?'top-up':'payment',label='After this '+kind;
 const base={kind,label,tone:'covered',hasBudget,datesNeedReview,periodStatus,availableBefore:impact.available,availableAfter:impact.after,room:impact.room,shortfall:impact.totalGap,fee:impact.fee,impact};
 if(!impact.canPay)return {...base,tone:'funding',label:'Before you can '+(box?'transfer':topUp?'top up':'pay'),text:M(impact.fundingShortfall)+' more needed.'};
 // Transfers back increase Everyday availability; they are not new spending
 // and should never be presented as drawing down the Everyday account.
 if(withdrawal)return {...base,text:M(impact.after)+' available in Everyday money.'};
 if(impact.totalGap>0)return {...base,tone:'shortfall',text:M(impact.totalGap)+' of '+(impact.goalGap>0?'saved commitments':dated?'your budget':'saved costs')+' would be uncovered.'};
 if(!hasBudget)return {...base,tone:'unknown',text:M(impact.after)+' available'+(box||topUp?' in Everyday money':'')+' · no budget set.'};
 const suffix=dated?'left after budget':'after saved costs';
 return {...base,tone:datesNeedReview?'unknown':'covered',text:M(impact.room)+' '+suffix+(box||topUp?' in Everyday money':'')+'.'};
};
const markup=info=>`<p class="payment-consequence" data-payment-consequence data-consequence-tone="${E(info.tone)}" role="note" aria-label="${E(info.label+'. '+info.text)}"><span>${E(info.label)}</span><strong>${E(info.text)}</strong>${info.datesNeedReview?'<small>Budget dates need review.</small>':''}</p>`;
for(const route of ['paymentReview','authorize']){
 const view=L.views[route];if(typeof view!=='function')continue;
 L.views[route]=function(...args){
  const html=view.apply(this,args),d=L.state.paymentDraft,info=summary(d);
  if(!info||html.includes('data-payment-consequence'))return html;
  // Only actual review/PIN surfaces receive a consequence. Closed requests,
  // unavailable recipients and result screens keep their existing messages.
  if(route==='paymentReview'){
   if(!/class="(?:focus-review|virtual-card-flow virtual-card-review|box-transfer-review)"/.test(html))return html;
   return html.replace(/<div class="actions">/,markup(info)+'<div class="actions">');
  }
  if(!html.includes('id="payment-pin"')&&!html.includes('class="biometric-prompt"'))return html;
  const choice=/<div class="biometric-choice">|<section class="biometric-prompt"|<form\b/;
  return html.replace(choice,match=>markup(info)+match);
 };
}
L.paymentConsequence=Object.freeze({summary});
})();
