/* One plan calculation and one clear explanation for Pause and Lumo Chats. */
(()=>{
'use strict';
const cash=n=>Math.round(Number(n||0)*100)/100;
const positive=n=>Math.max(0,cash(n));
// One currency form across account figures, projections, receipts and Chat.
// Formatting belongs to core; this alias keeps existing callers compatible.
L.planMoney=L.money;
L.planImpactSummary=(draftOrAmount=L.state.paymentDraft,state=L.state,now=Date.now())=>{
 const d=draftOrAmount&&typeof draftOrAmount==='object'?{...draftOrAmount}:{amount:Number(draftOrAmount),fee:0};
 const q=L.pauseEngine.evaluate(d,state,now);
 const valid=q.valid!==false;
 const p=L.pauseEngine.planPosition(valid?d:{amount:0,fee:0},state);
 const twoAccounts=state.accounts?.version===2,withdrawing=d.method==='box'&&(d.boxDirection||d.direction)==='out';
 const sourceBox=(state.goals||[]).find(box=>box.id===d.boxId),boxHeld=(state.txs||[]).filter(t=>t.internalTransfer&&t.boxId===d.boxId&&t.boxDirection==='out'&&t.status==='pending').reduce((sum,t)=>sum+Number(t.amount||0),0),boxAvailable=positive(Number(sourceBox?.allocated||0)-boxHeld);
 const canPay=valid&&(withdrawing?Number(d.amount)<=boxAvailable:p.after>=0);
 const essentialExtraGap=positive(p.essentialGap-p.essentialGapBefore),goalExtraGap=positive(p.goalGap-p.goalGapBefore);
 const remaining=p.essentials.filter(x=>x.after>0),names=remaining.map(x=>x.name.trim().toLowerCase());
 // One remaining cost can be named safely. Several costs stay a shared bucket,
 // so the explanation never attributes an aggregate gap to one of them.
 const singleEssential=remaining.length===1&&remaining[0].name.trim().length<=36?remaining[0].name.trim():'';
 const bucketLabel=singleEssential||(names.length===2&&names.includes('food')&&names.includes('transport')?'Food and transport':twoAccounts?'Your budget':'Essentials');
 const singleGoal=p.goals.length===1&&p.goals[0].name.trim().length<=36?p.goals[0].name.trim():'';
 const goalName=singleGoal||'';
 const goalSubject=goalName?`Money set aside for ${goalName}`:'Money set aside for goals';
 const essentialsLabel=p.essentialGap?`${bucketLabel} short by ${L.planMoney(p.essentialGap)}`:`${bucketLabel} covered`;
 const goalLabel=p.goalGap?`${goalSubject} short by ${L.planMoney(p.goalGap)}`:`${goalSubject} covered`;
 const essentialsExplanation=p.essentialsAfter?`${L.planMoney(Math.max(0,p.after))} would remain for ${L.planMoney(p.essentialsAfter)} ${twoAccounts?'still in your budget':'of planned essentials'}.`:twoAccounts?'No unpaid budget costs would remain.':'No unpaid essentials would remain after this payment.';
 const goalExplanation=p.allocated?(p.goalGap?`${goalSubject}: ${L.planMoney(p.goalGap)} uncovered after essentials.`:`${goalSubject} stays covered after essentials.`):'';
 const savedCosts=(state.essentials||[]).some(x=>!x.archived&&!x.deleted&&Number(x.amount)>0);
 const hasPlan=savedCosts||p.essentialsBefore>0||p.allocated>0;
 const fundingShortfall=withdrawing?positive(Number(d.amount)-boxAvailable):positive(-p.after);
 // Spare room is a factual result, not a new warning threshold. Interruption
 // still depends exclusively on pauseEngine.evaluate's existing rules.
 const headline=!valid?'Enter an amount to see its effect.':!canPay?withdrawing?`${L.planMoney(fundingShortfall)} more needed in this Money Box.`:`${L.planMoney(fundingShortfall)} more needed to make this payment.`:p.essentialGap?`${bucketLabel} would be ${L.planMoney(p.essentialGap)} short.`:p.goalGap?`${goalSubject} would be ${L.planMoney(p.goalGap)} short.`:hasPlan?`Your ${twoAccounts?'budget':'plan'} stays covered. ${p.room>0?`${L.planMoney(p.room)} spare.`:'No spare room.'}`:twoAccounts?'No budget to check yet.':'No saved costs to check yet.';
 const roomExplanation=twoAccounts?(p.room>0?'This would remain in your operational account after your budget.':'Your budget would use all the remaining operational money.'):(p.room>0?'This is what would remain after your saved essentials and money set aside for goals.':'Your saved essentials and money set aside for goals would use all the remaining money.');
 const consequenceTone=!valid?'unknown':!canPay?'funding':!hasPlan?'unknown':p.totalGap>0?'shortfall':'covered';
 const extraGap=positive(p.totalGap-p.totalGapBefore);
 return {...p,valid,canPay,hasPlan,amount:valid?Number(d.amount):0,fee:valid?Number(d.fee||0):0,fundingShortfall,
  essentialExtraGap,goalExtraGap,extraGap,headline,essentialsLabel,essentialsExplanation,goalLabel,goalExplanation,bucketLabel,goalName,roomExplanation,consequenceTone,
  projectionLabel:twoAccounts?'Projected operational balance':'Projected balance after payment',
  commitmentExplanation:twoAccounts?'Your budget applies to operational money. Money Boxes are held separately in your savings account and are not deducted again.':'Money set aside for goals stays in your account. Only the payment total leaves your account.',
  totalExplanation:`Total ${twoAccounts?'budget':'plan'} shortfall: ${L.planMoney(p.totalGap)}.`,
  changeExplanation:p.totalGapBefore?`${L.planMoney(p.totalGapBefore)} was already uncovered. This payment adds ${L.planMoney(extraGap)} to that gap.`:'',
  engineDecision:q};
};
})();
