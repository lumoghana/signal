/* A confirmed payment closes the same Budget story shown before authorisation.
   Snapshots are captured only after the existing ledger changes real demo state. */
(()=>{
'use strict';
if(!window.L||L.paymentBudgetResult)return;
const E=L.e,M=L.money;
const clone=value=>JSON.parse(JSON.stringify(value));
const allowed=()=>!!L.state.onboarded&&!L.state.locked&&!L.state.closed;
const get=value=>typeof value==='string'?(L.state.txs||[]).find(t=>t.id===value):value;
const internal=t=>!!(L.isInternalTransfer?.(t)||t?.internal||t?.internalTransfer||t?.boxId||t?.method==='Money Box transfer');
const eligible=t=>!!(t&&t.type==='out'&&t.status==='success'&&t.fundingAccount!=='virtual-card'&&!internal(t)&&!t.refundId&&!t.refundOf&&!t.originalId&&!t.reversed&&!(Number(t.refunded)>0));
const proof=t=>JSON.stringify([t.id,t.draftId||'',t.type,Number(t.amount),Number(t.fee||0),t.essentialId||'']);
const recipient=d=>JSON.stringify([d.method,d.name,d.destination||'',d.provider||'',d.recipient||'',d.bill||'',d.product||'',d.requestId||'',d.merchantSaleId||'']);
const editCandidate=()=>{
 const d=L.state.paymentDraft;
 return allowed()&&L.route==='pause'&&d&&!d.submittedTxId&&d.method!=='box'&&Number(d.amount)>0?{draftId:d.id,recipient:recipient(d),amount:Number(d.amount)}:null;
};
function rememberEdit(candidate){
 const d=L.state.paymentDraft;if(!candidate||!d||d.id!==candidate.draftId||d.submittedTxId||recipient(d)!==candidate.recipient)return;
 const previous=d.budgetResultEdit;
 if(!previous||previous.draftId!==d.id||previous.recipient!==candidate.recipient)d.budgetResultEdit={draftId:d.id,recipient:candidate.recipient,fromAmount:candidate.amount};
 L.save();
}
const editPayment=L.editPayment;
L.editPayment=function(...args){const c=editCandidate(),result=editPayment.apply(this,args);if(c&&['send','bill'].includes(L.route))rememberEdit(c);return result;};
const lower=L.applyPlanCoveredAmount;
if(lower)L.applyPlanCoveredAmount=function(...args){const c=editCandidate(),result=lower.apply(this,args);if(c&&L.route==='paymentReview'&&Number(L.state.paymentDraft?.amount)!==c.amount)rememberEdit(c);return result;};
function capture(t,ownedDraft){
 if(!allowed()||!eligible(t)||t.budgetResult||!L.pauseEngine?.planPosition)return false;
 // The ledger has already applied the debit and reconciled confirmed coverage.
 // Asking for zero additional spending describes that state without subtracting
 // this transaction a second time or treating savings as a commitment again.
 L.reconcileEssentialCoverage?.();
 const position=L.pauseEngine.planPosition({amount:0,fee:0},L.state);
 const saved=(L.state.essentials||[]).filter(x=>x&&!x.archived&&!x.deleted&&Number(x.amount)>0);
 const selected=saved.find(x=>x.id===t.essentialId),line=position.essentials.find(x=>x.id===t.essentialId);
 const snapshot={version:1,txId:t.id,proof:proof(t),capturedAt:new Date().toISOString(),hasBudget:saved.length>0,automaticSavingPending:true,
  available:position.available,room:position.roomBefore,gap:position.totalGapBefore,remaining:position.essentialsBefore,
  ...(selected&&line?{selectedCost:{id:selected.id,name:selected.name,remaining:line.before}}:{})};
 const d=ownedDraft||t.paymentDraft,c=d?.budgetResultEdit;
 if(c&&d.id===t.draftId&&c.draftId===d.id&&c.recipient===recipient(d)&&d.name===t.name&&Number(d.amount)===Number(t.amount)&&Number(d.fee||0)===Number(t.fee||0)&&Number.isFinite(c.fromAmount)&&c.fromAmount>0&&c.fromAmount!==Number(t.amount))snapshot.editedFromAmount=c.fromAmount;
 t.budgetResult=snapshot;L.save();return true;
}
// The outer Savings Hacks controller completes confirmed-event processing
// after the source debit. Finalise this new snapshot once, against its exact
// posted transfers, rather than mixing pre-saving room with a current balance.
function reconcileSavings(value,events=[]){
 const t=get(value),s=t?.budgetResult;
 if(!allowed()||!t||t.status!=='success'||!['in','out'].includes(t.type)||internal(t))return false;
 const budgetPending=!!s&&s.automaticSavingPending===true&&s.proof===proof(t);
 if(s&&!budgetPending)return false;
 if(!budgetPending&&(t.automaticSavingResult||!events.length))return false;
 const transfers=[],skipped=[],seen=new Set();
 for(const event of events){
  if(event?.sourceTxId!==t.id||!event.boxId)continue;
  const box=(L.state.goals||[]).find(g=>g.id===event.boxId),name=String(box?.name||'Money Box');
  if(event.status==='saved'){
   const transfer=get(event.transferId);
   if(!transfer||seen.has(transfer.id)||transfer.status!=='success'||!transfer.internalTransfer||transfer.boxDirection!=='in'||transfer.boxId!==event.boxId||transfer.savingsHackSourceTxId!==t.id||Number(transfer.amount)!==Number(event.amount)||!(Number(transfer.amount)>0))continue;
   seen.add(transfer.id);transfers.push({transferId:transfer.id,boxId:event.boxId,name,amount:Number(transfer.amount)});
  }else if(event.status==='skipped')skipped.push({boxId:event.boxId,name,reason:String(event.reason||'limits')});
 }
 const saving={version:1,saved:transfers,skipped,total:Math.round(transfers.reduce((sum,r)=>sum+r.amount,0)*100)/100};
 if(!budgetPending){t.automaticSavingResult={...saving,txId:t.id,proof:proof(t),capturedAt:new Date().toISOString()};L.save();return true;}
 const p=L.pauseEngine.planPosition({amount:0,fee:0},L.state);
 s.availableBeforeSaving=s.available;s.roomBeforeSaving=s.room;
 Object.assign(s,{available:p.available,room:p.roomBefore,gap:p.totalGapBefore,remaining:p.essentialsBefore,automaticSavingPending:false,automaticSavingFinalisedAt:new Date().toISOString(),automaticSaving:saving});
 L.save();return true;
}
const addTx=L.addTx;
L.addTx=function(data){
 const ids=new Set((L.state.txs||[]).map(t=>t.id)),d=L.state.paymentDraft;
 const owned=d&&d.id===data?.draftId?d:null,result=addTx.apply(this,arguments);
 if(result&&!ids.has(result.id)&&result.status==='success')capture(result,owned);
 return result;
};
const resolve=L.resolveTx;
L.resolveTx=function(id,status){
 const previous=get(id)?.status,result=resolve.apply(this,arguments);
 if(previous==='pending'&&status==='success'&&result?.status==='success')capture(result);
 return result;
};
function summary(value){
 const t=get(value),s=t?.budgetResult;
 if(!allowed()||!eligible(t)||!s||s.version!==1||s.txId!==t.id||s.proof!==proof(t)||!s.hasBudget)return null;
 if(![s.available,s.room,s.gap,s.remaining].every(n=>Number.isFinite(n)&&n>=0))return null;
 const selected=s.selectedCost;
 if(selected&&(!selected.id||typeof selected.name!=='string'||!Number.isFinite(selected.remaining)||selected.remaining<0))return null;
 const headline=s.gap>0?`${M(s.gap)} of your Budget is uncovered.`:selected?selected.remaining>0?`${selected.name}: ${M(selected.remaining)} still to cover.`:`${selected.name} is covered.`:`${M(s.room)} left after Budget.`;
 const support=s.gap===0&&selected?`${M(s.room)} left after Budget.`:'';
 const edit=Number.isFinite(s.editedFromAmount)&&s.editedFromAmount>0?`You changed ${M(s.editedFromAmount)} to ${M(t.amount)}.`:'';
 return {...clone(s),headline,support,edit};
}
function markup(value,{receipt=false}={}){
 const s=summary(value),saving=savingSummary(value);if(!s&&!saving)return '';
 const savingUI=savingMarkup(value,{receipt});
 return (s?`<section class="payment-budget-result${receipt?' payment-budget-receipt':''}" aria-label="Budget after this payment" data-payment-budget-result data-budget-result-id="${E(s.txId)}"><p class="payment-budget-result-label">${receipt?'At payment confirmation':saving?.total>0?'After payment and automatic saving':'After this payment'}</p><p class="payment-budget-result-headline">${E(s.headline)}</p>${s.support?`<p class="payment-budget-result-support">${E(s.support)}</p>`:''}${s.edit?`<p class="payment-budget-result-edit">${E(s.edit)}</p>`:''}${savingUI}</section>`:savingUI);
}
function savingMarkup(value,{receipt=false}={}){
 const saving=savingSummary(value);if(!saving)return '';
 const reason=key=>({'monthly-cap':'Monthly limit reached','budget-or-buffer':'Budget or balance buffer protected','target-reached':'Target reached','no-change':'No roundup needed','transfer-unavailable':'Transfer unavailable','instruction-unavailable':'Instruction unavailable'}[key]||'Saved limits protected');
 return `<div class="payment-auto-saving" data-payment-saving-result>${receipt?'<p class="small muted">Automatic saving at confirmation</p>':''}<p><strong>${saving.total>0?M(saving.total)+' saved automatically':'Automatic saving skipped'}</strong></p><details><summary>Saving details</summary>${saving.saved.map(r=>`<p>${E(r.name)} <strong>${M(r.amount)}</strong></p>`).join('')}${saving.skipped.map(r=>`<p>${E(r.name)} · ${E(reason(r.reason))}</p>`).join('')}<p class="small muted">${saving.total>0?'From Everyday money into your Money Boxes under your saved instructions.':'No saving moved. Your saved limits remain in place.'} ${saving.refunded?'The later payment refund did not move this saved money.':saving.sourceType==='in'?'Separate from the amount received.':'Separate from the amount paid.'}</p></details></div>`;
}
function savingSummary(value){
 const t=get(value),s=t?.budgetResult,standalone=t?.automaticSavingResult,a=standalone||s?.automaticSaving;
 if(!allowed()||!t||!['in','out'].includes(t.type)||!['success','reversed'].includes(t.status)||(standalone?standalone.txId!==t.id||standalone.proof!==proof(t):s?.proof!==proof(t)||s.automaticSavingPending!==false)||a?.version!==1||!Array.isArray(a.saved)||!Array.isArray(a.skipped)||!a.saved.length&&!a.skipped.length)return null;
 if(!Number.isFinite(a.total)||a.total<0||a.saved.some(r=>!r.transferId||!r.boxId||!Number.isFinite(r.amount)||r.amount<=0))return null;
 return {...clone(a),sourceType:t.type,refunded:t.status==='reversed'||!!t.refundId||Number(t.refunded)>0};
}
const result=L.views.paymentResult;
L.views.paymentResult=function(...args){const html=result.apply(this,args),ui=markup(L.params.id||L.state.paymentDraft?.submittedTxId);return ui?html.replace('<p class="result-reference">',ui+'<p class="result-reference">'):html;};
const receipt=L.views.txDetail;
L.views.txDetail=function(...args){const html=receipt.apply(this,args),ui=markup(L.params.id,{receipt:true});return ui?html.replace('<div class="receipt">',ui+'<div class="receipt">'):html;};
L.paymentBudgetResult={summary,markup,savingSummary,savingMarkup,reconcileSavings};
})();
