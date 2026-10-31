/* Optional, receipt-led saving prompts. This module never schedules or debits
   money. Every contribution uses the existing review and authorisation flow. */
(()=>{
'use strict';
const E=L.e,M=L.money,B=L.btn,J=JSON.stringify;
const box=id=>(L.state.goals||[]).find(g=>g.id===id&&!g.archived);
const cash=n=>Math.round((Number(n)||0)*100)/100;
const external=t=>!!t&&t.type==='in'&&t.status==='success'&&!t.internalTransfer&&!L.isInternalTransfer?.(t)&&!t.migration&&!t.originalId&&!t.refundOf&&!t.sharedExpenseRepayment&&t.category!=='Refunds'&&Number.isFinite(Number(t.amount))&&Number(t.amount)>0;
const receipt=id=>(L.state.txs||[]).find(t=>t.id===id);
const state=()=>{
 const s=L.state.savingPrompts||(L.state.savingPrompts={version:1,rule:null,handled:{},milestones:{}});
 s.handled=s.handled||{};s.milestones=s.milestones||{};return s;
};
const owned=d=>!!d&&d.method==='box'&&d.boxDirection==='in'&&!!d.savingSourceTxId;
const fingerprint=r=>r?JSON.stringify([r.enabled,r.kind,Number(r.value),r.boxId,r.revision]):'';
const ruleSummary=r=>r?.enabled?`${r.kind==='percent'?cash(r.value)+'%':M(r.value)} → ${box(r.boxId)?.name||'Money Box'}`:'Off · choose when you want a saving prompt';
const amountFor=(r,t)=>r.kind==='percent'?cash(Number(t.amount)*Number(r.value)/100):cash(r.value);
const budgetLimit=()=>{const b=L.balances();return {room:cash(Math.max(0,Math.min(Number(b.room)||0,Number(b.available)||0))),gap:Number(b.gap)||0};};
const friendlyLimit=()=>{const b=budgetLimit();return b.gap?'Your budget is already short. Add money or review it before saving.':b.room>0?`Keep your budget covered. You can save up to ${M(b.room)} from your operational account.`:'Your available money is needed for your budget. No saving transfer has been queued.';};

function validate(input={}){
 if(!['fixed','percent'].includes(input.kind))return {ok:false,field:'saving-kind',message:'Choose a fixed amount or a percentage.'};
 const value=L.moneyInput(input.value,.01,input.kind==='percent'?100:5000);
 if(value===null)return {ok:false,field:'saving-value',message:input.kind==='percent'?'Choose a percentage from 0.01 to 100, using up to two decimal places.':'Choose GH₵0.01 to GH₵5,000.00, using up to two decimal places.'};
 if(!box(input.boxId))return {ok:false,field:'saving-box',message:'Choose an active Money Box for your savings.'};
 return {ok:true,value,kind:input.kind,boxId:input.boxId};
}
function suggestion(txId){
 const s=state(),r=s.rule,t=receipt(txId),g=box(r?.boxId);
 const out={eligible:false,txId,amount:0,boxId:g?.id||'',boxName:g?.name||''};
 if(!r?.enabled)return {...out,reason:'off'};
 if(!external(t))return {...out,reason:'unconfirmed'};
 const handled=s.handled[txId],d=L.state.paymentDraft;
 if(handled){
  const resume=handled.status==='review'&&owned(d)&&d.savingSourceTxId===txId&&d.id===handled.draftId&&!d.submittedTxId&&d.savingRuleFingerprint===fingerprint(r);
  return {...out,reason:resume?'review':'handled',resume,amount:resume?cash(d.amount):cash(handled.amount)};
 }
 if((r.excludedTxIds||[]).includes(txId))return {...out,reason:'before-rule'};
 if(!g)return {...out,reason:'box-unavailable',message:'Choose an active Money Box to keep using your saving prompt.'};
 const valid=validate(r);if(!valid.ok)return {...out,reason:'rule-invalid',message:valid.message};
 const amount=amountFor(r,t),b=budgetLimit();
 if(amount<.01)return {...out,reason:'too-small',message:'This receipt is too small for the chosen saving percentage. Nothing is queued.'};
 if(amount>5000||amount>Number(t.amount)+.001)return {...out,reason:'receipt-limit',message:`This receipt is ${M(t.amount)}. Choose a smaller saving amount; nothing is queued.`};
 if(b.gap||amount>b.room+.001)return {...out,reason:'budget',message:friendlyLimit()};
 return {...out,eligible:true,reason:'ready',amount,receiptAmount:cash(t.amount),room:b.room};
}
function markSkipped(txId){
 const s=state();if(!external(receipt(txId)))return false;
 if(s.handled[txId]&&s.handled[txId].status!=='review')return false;
 s.handled[txId]={...(s.handled[txId]||{}),status:'skipped',at:new Date().toISOString()};L.save();return true;
}
function invalidateOpen(){
 const d=L.state.paymentDraft;if(!owned(d)||d.submittedTxId)return;
 markSkipped(d.savingSourceTxId);L.state.paymentDraft=d.returnPaymentDraft||null;
}
function configure(input={},sourceTxId=''){
 if(L.state.closed||L.state.locked||!L.state.onboarded)return {ok:false,message:'Sign in to change saving prompts.'};
 let checked;if(input.enabled){checked=validate(input);if(!checked.ok)return checked;}
 const s=state(),old=s.rule;invalidateOpen();
 const r={enabled:!!input.enabled,kind:checked?.kind||input.kind||old?.kind||'fixed',value:checked?.value||old?.value||20,boxId:checked?.boxId||input.boxId||old?.boxId||'',revision:L.id('SR'),updatedAt:new Date().toISOString(),excludedTxIds:(L.state.txs||[]).filter(external).map(t=>t.id).filter(id=>id!==sourceTxId)};
 s.rule=r;delete s.edit;L.save();return {ok:true,rule:r};
}
function settings(boxId='',txId=''){
 const active=(L.state.goals||[]).filter(g=>!g.archived);
 if(!active.length){L.go('goals');L.toast('Add a Money Box first, then choose a saving prompt.');return false;}
 const r=state().rule;
 state().edit={enabled:!!r?.enabled,kind:r?.kind||'fixed',value:r?.value||20,boxId:boxId||r?.boxId||active[0].id,txId,returnTo:L.route,returnParams:{...L.params}};
 // Give the shared sheet form cache the same Box/receipt context as this edit.
 // A previously closed Box must not overwrite another Box's selection.
 L.save();L.go('savingRule',{id:state().edit.boxId,txId});return true;
}
function leaveSettings(){
 const edit=state().edit;delete state().edit;L.save();
 // An explicit Cancel, Save or Remove completes this edit. Do not let the
 // sheet's ordinary Back/X draft cache restore a cancelled or completed form.
 if(L.route==='savingRule')L.clearFormDraft?.('savingRule',L.params);
 const capture=L.skipFormCapture;L.skipFormCapture=true;
 try{
  if(edit?.txId&&typeof L.openIncomePlan==='function')return L.openIncomePlan(edit.txId);
  if(edit?.returnTo&&L.views[edit.returnTo]&&edit.returnTo!=='savingRule')return L.go(edit.returnTo,edit.returnParams||{});
  return L.go('goals');
 }finally{L.skipFormCapture=capture;}
}
function saveSettings(){
 const edit=state().edit||{},enabled=!!document.getElementById('saving-enabled')?.checked;
 const input={enabled,kind:L.value('saving-kind'),value:L.value('saving-value'),boxId:L.value('saving-box')};
 // Keep the form and return context available until validation succeeds.
 const result=configure(input,edit.txId);if(!result.ok)return L.error(result.message,result.field);
 state().edit=edit;leaveSettings();L.toast(enabled?'Saving prompt on. You approve each transfer.':'Saving prompt off. Your saved money has not changed.');
}
function removeRule(){
 const edit=state().edit;invalidateOpen();state().rule=null;delete state().edit;L.save();
 if(edit){state().edit=edit;leaveSettings();}else L.go('goals');
 L.toast('Saving prompt removed. Your saved money has not changed.');
}
function open(txId){
 const info=suggestion(txId),d=L.state.paymentDraft;
 if(info.resume){L.go('allocate',{id:d.boxId});return true;}
 if(!info.eligible){L.toast(info.message||'This receipt has no new saving prompt.');return false;}
 if(owned(d)&&!d.submittedTxId){L.go('allocate',{id:d.boxId});L.toast('Finish or cancel your current saving transfer first.');return false;}
 // Existing transfer creation supplies a fresh id and separate review/auth.
 L.startMoneyBoxTransfer(info.boxId,'in');const next=L.state.paymentDraft;
 Object.assign(next,{amount:info.amount,savingSourceTxId:txId,savingRuleFingerprint:fingerprint(state().rule)});
 state().handled[txId]={status:'review',draftId:next.id,amount:info.amount,boxId:info.boxId,at:new Date().toISOString()};L.save();L.render();return true;
}
function skip(txId){
 const d=L.state.paymentDraft;
 if(owned(d)&&!d.submittedTxId&&d.savingSourceTxId===txId){L.cancelMoneyBoxTransfer();return;}
 if(markSkipped(txId)){L.render();L.toast('Skipped for this receipt. Nothing will be moved later.');}
}
function cta(txId){
 const r=state().rule,t=receipt(txId);if(!external(t))return '';
 // Keep the older preference and history without asking for a second manual
 // contribution to a box whose automatic Savings hack is already active.
 if(r?.enabled&&L.savingsHacks?.get?.(r.boxId)?.enabled)return '';
 if(!r?.enabled)return `<div class="saving-prompt-entry">${B('Ask me to save after money arrives',`L.savingRules.settings('',${J(txId)})`,'text-btn')}</div>`;
 const p=suggestion(txId);if(['handled','before-rule'].includes(p.reason))return '';
 if(p.eligible||p.resume)return `<section class="saving-prompt" aria-label="Optional saving prompt"><div><strong>${p.resume?'Your saving transfer is ready to review':`Put ${M(p.amount)} in ${E(p.boxName)}?`}</strong><p>You approve each transfer. Your budget stays covered.</p></div><div class="saving-prompt-actions">${B(p.resume?'Resume review':'Review transfer',`L.savingRules.open(${J(txId)})`,'secondary')}${B('Not now',`L.savingRules.skip(${J(txId)})`,'text-btn')}</div></section>`;
 return p.message?`<section class="saving-prompt saving-prompt-unavailable" aria-label="Saving prompt"><p>${E(p.message)}</p>${B('Edit saving prompt',`L.savingRules.settings('',${J(txId)})`,'text-btn')}</section>`:'';
}
function contributionGuard(d,amount=Number(d?.amount)){
 if(!owned(d))return true;
 const s=state(),r=s.rule,t=receipt(d.savingSourceTxId),h=s.handled[d.savingSourceTxId],g=box(d.boxId),b=budgetLimit();
 if(!r?.enabled||fingerprint(r)!==d.savingRuleFingerprint||!g||g.id!==r.boxId||!external(t)||h?.draftId!==d.id||h?.status!=='review')throw Error('This saving prompt changed. Start a fresh review before moving money.');
 if(L.moneyInput(amount,.01,5000)===null||Number(amount)>Number(t.amount)+.001)throw Error('Choose a saving amount within this received payment.');
 if(b.gap||Number(amount)>b.room+.001)throw Error(friendlyLimit());
 return true;
}
function recordMilestones(t,before){
 // The existing reversal engine adds originalId after posting its inverse
 // movement. Its reserved draft id identifies that return at posting time.
 if(!t||t.status!=='success'||t.boxDirection!=='in'||t.migration||t.originalId||String(t.draftId||'').startsWith('reverse:'))return;
 const g=box(t.boxId);if(!g||!(Number(g.target)>0))return;
 const s=state(),seen=s.milestones[g.id]||(s.milestones[g.id]=[]),target=Number(g.target),now=Number(g.allocated);
 for(const percent of [25,50,75,100])if(Number(before)<target*percent/100-.001&&now>=target*percent/100-.001&&!seen.some(x=>x.percent===percent))seen.push({percent,txId:t.id,at:t.updatedAt||t.date,amount:cash(now),target:cash(target)});
}
function markTransfer(t,d){
 if(!owned(d)||!t)return;
 t.savingSourceTxId=d.savingSourceTxId;t.savingRuleFingerprint=d.savingRuleFingerprint;
 state().handled[d.savingSourceTxId]={status:t.status,transferId:t.id,draftId:t.draftId,amount:t.amount,boxId:t.boxId,at:t.date};
}

L.views.savingRule=()=>{
 const s=state(),r=s.edit||s.rule||{},active=(L.state.goals||[]).filter(g=>!g.archived);
 return L.header('Save a little when money arrives')+`<p class="saving-rule-intro">Choose a prompt, not an automatic debit. After confirmed money arrives, review what to save. Lumo keeps your budget covered.</p><form class="form saving-rule-form" onsubmit="event.preventDefault();L.savingRules.save()"><label class="saving-rule-optin" for="saving-enabled"><input type="checkbox" id="saving-enabled"${r.enabled?' checked':''}><span>Ask me to save after money arrives</span></label><label class="field" for="saving-kind"><span>Suggest</span><select class="input" id="saving-kind"><option value="fixed"${r.kind!=='percent'?' selected':''}>A fixed amount (GH₵)</option><option value="percent"${r.kind==='percent'?' selected':''}>A percentage of money received</option></select></label>${L.field('Amount or percentage','saving-value','20','number',r.value||20).replace('<input ','<input min="0.01" max="5000" step="0.01" ')}<label class="field" for="saving-box"><span>Into this Money Box</span><select class="input" id="saving-box">${active.map(g=>`<option value="${E(g.id)}"${r.boxId===g.id?' selected':''}>${E(g.name)}</option>`).join('')}</select></label><p class="small muted">Each transfer needs your PIN or biometric approval. Skip any receipt. Pausing or removing this prompt leaves your savings untouched.</p><div id="error" role="alert"></div><div class="actions"><button type="submit" class="primary">Save preference</button>${B('Cancel','L.savingRules.close()','secondary')}${s.rule?B('Remove saving prompt','L.savingRules.remove()','text-btn'):''}</div></form><p class="tiny muted">Sample money · No live or automatic payments</p>`;
};
L.views.savingMilestones=()=>{
 const g=box(L.params.id);if(!g)return L.header('Money Box unavailable')+B('View Money Boxes',"L.go('goals')");
 const current=Number(g.allocated)||0,target=Number(g.target)||0,events=state().milestones[g.id]||[],percent=target?Math.min(100,Math.floor(current/target*100)):0;
 return L.header(g.name,'Progress from money actually saved.')+`<div class="saving-milestone-amount"><span>Saved now</span><strong>${L.balanceNumber(current)}</strong>${target?`<p>${percent}% of ${M(target)}</p><div class="progress" role="progressbar" aria-label="${E(g.name)} savings target" aria-valuemin="0" aria-valuemax="${target}" aria-valuenow="${Math.min(current,target)}"><div class="progress-bar" style="width:${percent}%"></div></div>`:'<p>Add a target to track your progress.</p>'}</div>${events.length?`<ul class="saving-milestones">${events.slice().reverse().map(event=>`<li><span aria-hidden="true">${L.icon('check',18)}</span><span><strong>${event.percent}% reached</strong><small>${M(event.amount)} saved at confirmation · ${E(new Date(event.at).toLocaleDateString('en-GB',{day:'numeric',month:'short'}))}</small></span></li>`).join('')}</ul><p class="small muted">Milestones record confirmed contributions. The amount above is what is in your box now.</p>`:'<p class="small muted">New milestones appear when a confirmed contribution takes your savings past 25%, 50%, 75% or your target. Pending transfers do not count.</p>'}<div class="actions">${B('Back to Money Box',`L.go('goal',{id:${J(g.id)}})`,'secondary')}</div>`;
};

const goals=L.views.goals,goal=L.views.goal;
// New customers manage saving per box. Keep an existing manual preference
// available without duplicating the automatic hack attached to that box.
const hasHacks=()=>typeof L.savingsHacks?.get==='function';
const legacyEntry=boxId=>{const r=state().rule;return !hasHacks()||!!(r?.enabled&&(!boxId||r.boxId===boxId)&&!L.savingsHacks.get(r.boxId)?.enabled);};
L.views.goals=()=>goals()+(legacyEntry()?`<section class="saving-rule-link"><div><strong>${hasHacks()?'Manual saving prompt':'Save after money arrives'}</strong><p>${E(ruleSummary(state().rule))}</p></div>${B(state().rule?'Edit':'Set up','L.savingRules.settings()','text-btn')}</section>`:'');
L.views.goal=()=>{
 const html=goal(),g=box(L.params.id);if(!g)return html;
 return html+`<div class="saving-box-tools">${legacyEntry(g.id)?B(hasHacks()?'Manual saving prompt':'Saving prompt',`L.savingRules.settings(${J(g.id)})`,'text-btn'):''}${B('View savings progress',`L.go('savingMilestones',{id:${J(g.id)}})`,'text-btn')}</div>`;
};
// A returning student can finish funding without revisiting Budget setup.
// Keep the optional saving action on the confirmed result itself and its
// receipt, so the eligible prompt never depends on that skipped setup screen.
// Funding during a payment keeps the student's original payment in focus.
function receiptPrompt(html,t,{funding=false}={}){
 if(!external(t)||!state().rule?.enabled||funding&&L.state.fundingReturn==='paymentReview')return html;
 const prompt=cta(t.id);if(!prompt||html.includes('aria-label="Optional saving prompt"'))return html;
 const anchor='<div class="actions">';
 return html.includes(anchor)?html.replace(anchor,prompt+anchor):html+prompt;
}
for(const route of ['momoAdd','bankAdd']){
 const render=L.views[route];
 L.views[route]=function(...args){
  const html=render.apply(this,args),id=route==='momoAdd'?L.state.fundingDraft?.txId:L.state.bankFunding?.txId;
  return receiptPrompt(html,receipt(id),{funding:true});
 };
}
const incomeReceipt=L.views.txDetail;
L.views.txDetail=function(...args){return receiptPrompt(incomeReceipt.apply(this,args),receipt(L.params.id));};
const allocate=L.views.allocate;
L.views.allocate=()=>{
 const html=allocate(),d=L.state.paymentDraft;if(!owned(d))return html;
 const t=receipt(d.savingSourceTxId);
 return html.replace('<form ',`<p class="saving-source-context">Optional saving from ${M(t?.amount||0)} received. Nothing moves until you approve.</p><form `);
};
const review=L.reviewAllocation;
L.reviewAllocation=()=>{
 const d=L.state.paymentDraft;if(owned(d))try{contributionGuard(d,L.value('allocation'));}catch(err){return L.error(err.message,'allocation');}
 return review();
};
const authorise=L.authorizePayment;
L.authorizePayment=function(...args){
 const d=L.state.paymentDraft;
 if(owned(d)&&!d.submittedTxId)try{contributionGuard(d);}catch(err){
  d.reviewFingerprint=null;d.pauseAcceptedSignature=null;L.save();L.go('allocate',{id:d.boxId});L.error(err.message,'allocation');return;
 }
 return authorise.apply(this,args);
};
const transfer=L.transferMoneyBox;
L.transferMoneyBox=function(input={}){
 const prior=(L.state.txs||[]).find(t=>t.draftId===input.draftId&&L.isInternalTransfer?.(t));
 if(prior)return prior;
 const d=L.state.paymentDraft,associated=owned(d)&&d.id===input.draftId;
 if(associated)contributionGuard(d,input.amount);
 const before=Number(box(input.id)?.allocated)||0,t=transfer.call(this,input);
 if(associated)markTransfer(t,d);recordMilestones(t,before);L.save();return t;
};
const resolve=L.resolveTx;
L.resolveTx=function(id,status){
 const old=receipt(id),was=old?.status,before=Number(box(old?.boxId)?.allocated)||0,result=resolve.call(this,id,status),t=receipt(id);
 if(was==='pending'&&t&&t.status!=='pending'&&t.savingSourceTxId){const h=state().handled[t.savingSourceTxId];if(h?.transferId===t.id)h.status=t.status;}
 if(was==='pending'&&t?.status==='success')recordMilestones(t,before);
 L.save();return result;
};
for(const name of ['cancelMoneyBoxTransfer','discardPayment']){
 const original=L[name];L[name]=function(...args){const d=L.state.paymentDraft,result=original?.apply(this,args);if(owned(d)&&!d.submittedTxId&&L.state.paymentDraft?.id!==d.id)markSkipped(d.savingSourceTxId);return result;};
}
const retry=L.retryMoneyBoxTransfer;
L.retryMoneyBoxTransfer=function(id){
 const t=receipt(id),result=retry?.call(this,id),d=L.state.paymentDraft;
 if(t?.savingSourceTxId&&d?.method==='box'&&!d.submittedTxId&&d.id!==t.draftId){
  Object.assign(d,{savingSourceTxId:t.savingSourceTxId,savingRuleFingerprint:fingerprint(state().rule)});
  state().handled[t.savingSourceTxId]={status:'review',draftId:d.id,amount:Number(d.amount),boxId:d.boxId,at:new Date().toISOString()};L.save();L.render();
 }
 return result;
};
document.addEventListener('input',event=>{
 if(L.route!=='savingRule'||!event.target?.id?.startsWith('saving-'))return;
 const s=state(),edit=s.edit||(s.edit={...(s.rule||{})});Object.assign(edit,{enabled:!!document.getElementById('saving-enabled')?.checked,kind:L.value('saving-kind'),value:L.value('saving-value'),boxId:L.value('saving-box')});L.save();
});
document.addEventListener('change',event=>{
 if(L.route!=='savingRule'||event.target?.id!=='saving-kind')return;
 const percent=event.target.value==='percent',input=document.getElementById('saving-value');if(input)input.setAttribute('max',percent?'100':'5000');
});
L.savingRules=Object.freeze({suggestion,cta,open,settings,save:saveSettings,close:leaveSettings,remove:removeRule,skip,configure,validate,hasRule:()=>!!state().rule?.enabled,progress:id=>({saved:Number(box(id)?.allocated)||0,target:Number(box(id)?.target)||0,milestones:[...(state().milestones[id]||[])]})});
L.taskSheet?.register?.('savingRule',{family:'plan',treatment:'edit',label:'Saving prompt'});
L.taskSheet?.register?.('savingMilestones',{family:'plan',treatment:'detail',label:'Savings progress'});
})();
