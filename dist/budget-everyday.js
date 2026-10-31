/* Everyday Budget reuse and explicit payment-purpose learning.
   The existing financial engine owns funds, coverage, fees and authorisation. */
(()=>{
'use strict';
if(!window.L||L.budgetEveryday)return;
const E=L.e,M=L.money,B=L.btn;
const clone=x=>JSON.parse(JSON.stringify(x));
const cash=x=>Math.round((Number(x)||0)*100)/100;
const norm=x=>String(x||'').trim().toLowerCase().replace(/\s+/g,' ');
const today=()=>new Date().toISOString().slice(0,10);
const dateOK=x=>/^\d{4}-\d{2}-\d{2}$/.test(String(x||''))&&!Number.isNaN(Date.parse(x+'T12:00:00Z'))&&new Date(x+'T12:00:00Z').toISOString().slice(0,10)===x;
const dateName=x=>dateOK(x)?new Date(x+'T12:00:00Z').toLocaleDateString('en-GB',{day:'numeric',month:'short',year:'numeric'}):'No end date';
const costs=()=> (L.state.essentials||[]).filter(x=>!x.archived&&!x.deleted&&Number(x.amount)>0);
const signature=()=>JSON.stringify(costs().map(x=>[x.id,norm(x.name),cash(x.amount),x.budgetCategory||'',!!x.namedObligation,x.date||'']));
const tx=id=>(L.state.txs||[]).find(t=>t.id===id);
const externalCredit=t=>!!(t&&t.type==='in'&&t.status==='success'&&!t.internal&&!t.originalId&&!t.sharedExpenseRepayment&&t.category!=='Refunds'&&!L.isInternalTransfer?.(t));
const remaining=id=>{
 L.reconcileEssentialCoverage?.();
 const position=L.pauseEngine?.planPosition?.({amount:0,fee:0},L.state);
 const cost=costs().find(x=>x.id===id);
 return position?.essentials.find(x=>x.id===id)?.before??Math.max(0,cash(cost?.amount)-cash(cost?.paid));
};
const rules=()=>Array.isArray(L.state.budgetPurposeRules)?L.state.budgetPurposeRules:[];
const keyFor=d=>L.categoryRecipientKey?.(d)||'';
const activeRule=r=>r&&costs().some(x=>x.id===r.sourceId&&norm(x.name)===r.sourceName);
const periodEnded=()=>dateOK(L.state.planHorizon?.date)&&L.state.planHorizon.date<today();
const validRule=r=>activeRule(r)&&!periodEnded()&&remaining(r.sourceId)>0;
const categoryFor=name=>{
 const fixed=L.budgetCategories?.resolve(name);if(fixed)return fixed.id;
 const n=norm(name&&typeof name==='object'?name.name:name),known=['Food','Transport','Study','Data','Phone','Shopping','Bills','Rent','Gifts','Repayment','Transfers','Other'];
 const exact=known.find(x=>norm(x)===n);if(exact)return exact;
 const tests={Food:/\b(food|lunch|dinner|breakfast|groceries|meal|waakye)\b/,Transport:/\b(transport|trotro|taxi|bus|ride|fare)\b/,Study:/\b(study|print|printing|books|stationery)\b/,Data:/\b(data|internet|wifi|broadband)\b/,Phone:/\b(airtime|phone)\b/,Shopping:/\b(shopping|clothes|sneakers)\b/,Bills:/\b(bills|electricity|utilities|water)\b/,Rent:/\b(rent|hostel|accommodation)\b/};
 const found=Object.entries(tests).filter(([,re])=>re.test(n));return found.length===1?found[0][0]:null;
};
const suggestion=(d=L.state.paymentDraft)=>{
 if(!d||d.submittedTxId||d.method==='box'||d.essentialId||periodEnded()||d.budgetPurposeDeclinedKey===keyFor(d))return null;
 const p=L.predictCategory?.(d);
 // Description/history/category rules are useful for sorting, not proof that a
 // payment fulfils a particular commitment. A known merchant can only suggest.
 if(!p||!['merchant','biller'].includes(p.source))return null;
 const matches=costs().filter(x=>categoryFor(x)===categoryFor(p.category)&&remaining(x.id)>0);
 return matches.length===1?{id:matches[0].id,name:matches[0].name,category:p.category,key:keyFor(d),remaining:remaining(matches[0].id)}:null;
};
const applyRemembered=d=>{
 if(!d||d.submittedTxId||d.method==='box'||d.essentialId)return false;
 const key=keyFor(d);if(!key||d.budgetPurposeDeclinedKey===key||d.budgetPurposeCheckedKey===key)return false;
 const matches=rules().filter(r=>r.key===key&&validRule(r));if(matches.length!==1)return false;
 const r=matches[0];
 const source=costs().find(x=>x.id===r.sourceId);
 if(d.categoryChoiceKey===key&&d.categoryChoice&&categoryFor(d.categoryChoice)!==categoryFor(source))return false;
 if(!L.setPaymentSource(r.sourceId,d))return false;
 d.budgetPurposeCheckedKey=key;
 d.budgetPurposeProof={key,sourceId:r.sourceId,sourceName:r.sourceName,remember:true,mode:'saved'};
 L.save();return true;
};
const purposeHint=d=>{
 const proof=d?.budgetPurposeProof;
 if(proof&&proof.sourceId===d.essentialId&&proof.key===keyFor(d))return `<span>${proof.mode==='saved'?'Your saved choice.':'Chosen for this payment.'}</span> <button type="button" class="budget-inline-action" onclick="L.forgetBudgetPurpose()">${proof.remember?'Don’t remember':'Remember next time'}</button>`;
 if(d?.essentialId)return `<button type="button" class="budget-inline-action" onclick="L.approveBudgetPurpose()">Remember this source</button>`;
 const s=suggestion(d);return s?`<button type="button" class="budget-inline-action" aria-label="Use and remember ${E(s.name)} as this merchant’s Budget source" onclick="L.acceptBudgetPurpose('${E(s.id)}')">Use &amp; remember: ${E(s.name)}</button>`:null;
};
const sourceStateHint=d=>{
 const c=costs().find(x=>x.id===d?.essentialId),status=L.budgetStateSummary?.();if(!c)return status?.ended?`${E(status.qualifier)} `:'';
 const held=cash((L.state.txs||[]).filter(t=>t.type==='out'&&t.status==='pending'&&t.essentialId===c.id).reduce((sum,t)=>sum+Number(t.amount||0),0));
 return remaining(c.id)===0?`${E(c.name)} ${held?`has ${M(held)} pending`:'is used up'}. This payment uses money left after Budget. `:status?.ended?`${E(status.qualifier)} `:'';
};
const refreshPurpose=()=>{const d=L.state.paymentDraft,h=document.getElementById('payment-plan-hint');if(h){const hint=sourceStateHint(d)+(purposeHint(d)||'');h.innerHTML=hint||'All use your operational account.';h.classList.toggle('budget-purpose-hint',!!hint);}};
L.acceptBudgetPurpose=id=>{
 const d=L.state.paymentDraft,s=suggestion(d);if(!s||s.id!==id)return false;
 L.savePaymentFields?.();if(!L.setPaymentSource(id,d))return false;
 d.budgetPurposeProof={key:keyFor(d),sourceId:id,sourceName:norm(s.name),remember:true,mode:'suggestion'};
 L.save();L.render();return true;
};
L.approveBudgetPurpose=()=>{
 const d=L.state.paymentDraft,c=costs().find(x=>x.id===d?.essentialId),key=keyFor(d);
 if(!d||d.submittedTxId||!c||!key||d.method==='box')return false;
 d.budgetPurposeProof={key,sourceId:c.id,sourceName:norm(c.name),remember:true,mode:'manual'};
 L.save();refreshPurpose();return true;
};
L.forgetBudgetPurpose=()=>{
 const d=L.state.paymentDraft;if(!d||d.submittedTxId)return;
 const key=keyFor(d),proof=d.budgetPurposeProof;
 if(proof&&!proof.remember)return L.approveBudgetPurpose();
 L.state.budgetPurposeRules=rules().filter(r=>r.key!==key);
 if(proof)proof.remember=false;
 d.budgetPurposeDeclinedKey=key;L.save();refreshPurpose();
};
const fields=L.paymentPlanLinkFields;
L.paymentPlanLinkFields=function(d){applyRemembered(d);const html=fields?.apply(this,arguments)||'',hint=sourceStateHint(d)+(purposeHint(d)||'');return hint?html.replace(/<p class="small muted" id="payment-plan-hint">[\s\S]*?<\/p>/,`<p class="small muted budget-purpose-hint" id="payment-plan-hint">${hint}</p>`):html;};
document.addEventListener('change',event=>{
 if(event.target?.id!=='payment-essential'||document.getElementById('payment-essential')!==event.target||!['send','bill','paymentPlanLink'].includes(L.route))return;
 const d=L.state.paymentDraft;if(!d||d.submittedTxId)return;
 delete d.budgetPurposeProof;d.budgetPurposeDeclinedKey=keyFor(d);L.save();refreshPurpose();
});
const rememberConfirmed=t=>{
 const p=t?.budgetPurposeProof;
 if(!t||t.type!=='out'||t.status!=='success'||!p?.remember||!p.key||t.essentialId!==p.sourceId||!activeRule(p))return false;
 // Proof is bound to the reviewed draft and recipient, never just a category.
 if(t.categoryRecipientKey&&t.categoryRecipientKey!==p.key)return false;
 const next=rules().filter(r=>r.key!==p.key);
 next.push({key:p.key,sourceId:p.sourceId,sourceName:p.sourceName,approvedTxId:t.id,updatedAt:new Date().toISOString()});
 L.state.budgetPurposeRules=next.slice(-100);L.save();return true;
};
const addTx=L.addTx;
L.addTx=function(data){
 const d=L.state.paymentDraft,p=d?.budgetPurposeProof;
 const proof=data.type==='out'&&data.draftId===d?.id&&p&&p.sourceId===data.essentialId&&p.key===keyFor(d)?clone(p):null;
 const result=addTx.call(this,proof?{...data,budgetPurposeProof:proof}:data);rememberConfirmed(result);return result;
};
const resolveTx=L.resolveTx;
L.resolveTx=function(id,status){const result=resolveTx.apply(this,arguments);if(status==='success')rememberConfirmed(result);return result;};

const cycleStatus=()=>{const h=L.state.planHorizon||{},end=dateOK(h.date)?h.date:'';return {hasBudget:costs().length>0,start:L.state.budgetCycle?.start||'',end,ended:!!end&&end<today(),active:!end||end>=today(),unspecified:!end,label:end?'Through '+dateName(end):'No end date yet'};};
const pendingCosts=()=>{const ids=new Set(costs().map(x=>x.id));return (L.state.txs||[]).some(t=>t.type==='out'&&t.status==='pending'&&ids.has(t.essentialId));};
const newEnd=()=>{const d=new Date(today()+'T12:00:00Z');d.setUTCDate(d.getUTCDate()+6);return d.toISOString().slice(0,10);};
const cycleRows=()=>L.budgetCategories?L.budgetCategories.group(costs()).flatMap(g=>{
 const named=g.items.filter(x=>x.namedObligation),ordinary=g.items.filter(x=>!x.namedObligation);
 const base=ordinary.length?[{previousId:ordinary.length===1?ordinary[0].id:'',previousIds:ordinary.map(x=>x.id),name:g.name,budgetCategory:g.id,amount:String(cash(ordinary.reduce((n,x)=>n+Number(x.amount),0))),include:true}]:[];
 return [...base,...named.map(x=>({previousId:x.id,previousIds:[x.id],name:x.name,budgetCategory:g.id,amount:String(x.amount),include:true,namedObligation:true,date:''}))];
}):costs().map(x=>({previousId:x.id,name:x.name,amount:String(cash(x.amount)),include:true}));
L.openBudgetCycle=()=>{
 if(!costs().length)return L.go(L.state.planDraft?'firstEssentials':'planSetup');
 if(!L.state.budgetCycleDraft)L.state.budgetCycleDraft={id:L.id('BC'),budgetCategoryVersion:1,baseSignature:signature(),start:today(),end:newEnd(),costs:cycleRows()};
 L.save();L.go('budgetCycle',{id:L.state.budgetCycleDraft.id});
};
const captureCycle=()=>{
 const d=L.state.budgetCycleDraft;if(!d)return;
 for(const key of ['start','end']){const f=document.getElementById('cycle-'+key);if(f)d[key]=f.value;}
 d.costs.forEach((c,i)=>{const a=document.getElementById('cycle-amount-'+i),include=document.getElementById('cycle-include-'+i),due=document.getElementById('cycle-due-'+i);if(a)c.amount=a.value;if(include)c.include=!!include.checked;if(due&&c.namedObligation)c.date=due.value;});
 L.save();
};
const validateCycle=()=>{
 const issue=(message,field)=>({message,field}),d=L.state.budgetCycleDraft;if(!d)return issue('Open your budget to start a new period.');
 if(L.state.planDraft)return issue('Finish your saved budget setup before starting a fresh period. Your setup draft is unchanged.');
 if(d.baseSignature!==signature())return issue('Your budget changed. Discard this period draft and start again when ready. Your active budget is unchanged.');
 if(pendingCosts())return issue('A budget payment is still pending. Wait for its result before starting a fresh period.');
  if(!dateOK(d.start)||!dateOK(d.end)||d.end<d.start||d.end<today())return issue('Choose a start and end date. The end date must be today or later.',!dateOK(d.start)?'cycle-start':'cycle-end');
  if(d.start>today())return issue('This budget replaces your current one now. Choose today or an earlier start date, or keep this draft until you are ready.','cycle-start');
 const selected=d.costs.filter(c=>c.include);if(L.budgetCategories){const fixed=selected.map(c=>L.budgetCategories.resolve(c)),ordinary=selected.filter(c=>!c.namedObligation).map(c=>L.budgetCategories.resolve(c)?.id);if(fixed.some(c=>!c)||new Set(ordinary).size!==ordinary.length||selected.length>30)return issue('Keep one category total plus distinct named costs, up to 30 items.');const duplicate=selected.find(c=>selected.some(x=>x!==c&&x.budgetCategory===c.budgetCategory&&norm(x.name)===norm(c.name)));if(duplicate)return issue('Give each named cost in a category a different name.');}if(!selected.length)return issue('Keep at least one budget item.','cycle-include-0');
 const invalid=d.costs.findIndex(c=>c.include&&(!String(c.amount).trim()||!Number.isFinite(Number(c.amount))||Number(c.amount)<0.01||Number(c.amount)>1000000||Math.abs(Number(c.amount)*100-Math.round(Number(c.amount)*100))>0.000001));
 if(invalid>=0)return issue('Enter a positive amount with no more than 2 decimal places for each item.','cycle-amount-'+invalid);
 const invalidDate=d.costs.findIndex(c=>c.include&&c.namedObligation&&c.date&&!dateOK(c.date));if(invalidDate>=0)return issue('Choose a valid due date for this named cost, or leave it empty.','cycle-due-'+invalidDate);
 return null;
};
L.reviewBudgetCycle=()=>{captureCycle();const issue=validateCycle();if(issue)return L.error(issue.message,issue.field);L.state.budgetCycleDraft.reviewed=true;L.save();L.go('budgetCycleReview',{id:L.state.budgetCycleDraft.id});};
const currentReview=()=>({signature:signature(),through:L.state.planHorizon?.date||'',at:new Date().toISOString()});
L.confirmBudgetCycle=()=>{
 const issue=validateCycle();if(issue)return L.error(issue.message);
 const d=L.state.budgetCycleDraft;if(!d.reviewed)return L.go('budgetCycle',{id:d.id});
 const previous=clone(costs()),next=d.costs.filter(c=>c.include).map(c=>({id:L.id('ess'),name:c.namedObligation?c.name:L.budgetCategories?.resolve(c)?.name||c.name,budgetCategory:L.budgetCategories?.resolve(c)?.id,...(c.namedObligation?{namedObligation:true,date:c.date||''}:{}),amount:cash(c.amount),paid:0,externalPaid:0,coverageVersion:1,cycleId:d.id,previousCostId:c.previousId,previousCostIds:c.previousIds||[c.previousId].filter(Boolean)}));
 // Old confirmed payments retain their old IDs; they cannot fulfil fresh costs.
 const archive={id:L.state.budgetCycle?.id||L.id('BC-old'),start:L.state.budgetCycle?.start||'',end:L.state.planHorizon?.date||'',closedAt:new Date().toISOString(),costs:previous};
 L.state.budgetCycles=[...(L.state.budgetCycles||[]),archive];
 L.state.budgetPurposeRules=rules().flatMap(r=>{const c=next.find(x=>x.previousCostId===r.sourceId&&x.previousCostIds.length===1&&(norm(x.name)===r.sourceName||L.budgetCategories&&categoryFor(x.name)===categoryFor(r.sourceName)));return c?[{...r,sourceId:c.id,sourceName:norm(c.name)}]:[];});
 L.state.essentials=next;L.state.planHorizon={mode:'date',date:d.end};L.state.budgetCycle={id:d.id,start:d.start,end:d.end};L.state.planSaved=true;L.state.budgetCycleDraft=null;
 L.state.budgetIncomeReview=currentReview();L.save();L.go('plan');L.toast('Fresh budget saved. No money moved.');
};
L.discardBudgetCycle=()=>{L.state.budgetCycleDraft=null;L.save();L.go('plan');};
L.resumeBudgetSetupDraft=()=>{const step=L.state.planDraft?.step;L.go(['planSetup','firstEssentials','firstGoal','firstPlanReview'].includes(step)?step:'firstEssentials');};
const error='<div id="error" role="alert" aria-live="polite"></div>';
L.views.budgetCycle=()=>{
 const d=L.state.budgetCycleDraft;if(!d)return `${L.header('Use this budget again')}<p>No fresh period has been started.</p>${B('Choose a period','L.openBudgetCycle()')}`;
 return `<section class="budget-everyday budget-cycle">${L.header('Use this budget again','Review the dates and full item amounts.')}<p class="small muted">Applies now when you confirm. Keep a draft if you want to start later.</p><form class="form" onsubmit="event.preventDefault();L.reviewBudgetCycle()">${L.state.planDraft?`<div class="notice small">Finish your existing setup first. Both drafts are kept.${B('Continue saved setup','L.resumeBudgetSetupDraft()','text-btn')}</div>`:''}<div class="budget-cycle-dates"><label class="field" for="cycle-start"><span>From</span><input class="input" id="cycle-start" type="date" value="${E(d.start)}" max="${today()}" required></label><label class="field" for="cycle-end"><span>Through</span><input class="input" id="cycle-end" type="date" value="${E(d.end)}" min="${today()}" required></label></div><div class="budget-cycle-items">${d.costs.map((c,i)=>`<div class="budget-cycle-item"><label class="budget-cycle-choose" for="cycle-include-${i}"><input id="cycle-include-${i}" type="checkbox" ${c.include?'checked':''}><span>${E(c.name)}</span></label><label class="field" for="cycle-amount-${i}"><span class="sr-only">${E(c.name)} amount in Ghana cedis</span><div class="inline"><span class="payment-currency">GH₵</span><input class="input" id="cycle-amount-${i}" type="number" inputmode="decimal" min="0.01" max="1000000" step="0.01" value="${E(c.amount)}"></div></label>${c.namedObligation?`<label class="field budget-cycle-obligation-date" for="cycle-due-${i}"><span>Due date for ${E(c.name)} · optional</span><input class="input" id="cycle-due-${i}" type="date" value="${E(c.date||'')}"></label>`:''}</div>`).join('')}</div>${d.costs.some(c=>c.namedObligation)?'<p class="small muted">Named costs stay separate. Review their due dates; earlier dates are not carried forward.</p>':''}<p class="small muted">A fresh period starts each selected item at its full amount. Previous payments stay in Activity. Unspent amounts are not added again.</p>${error}<div class="actions"><button class="primary" type="submit">Review fresh budget</button>${B('Keep draft for later',"L.go('plan')",'secondary')}${B('Discard this draft','L.discardBudgetCycle()','text-btn')}</div></form></section>`;
};
L.views.budgetCycleReview=()=>{
 const d=L.state.budgetCycleDraft;if(!d)return L.views.plan();const selected=d.costs.filter(c=>c.include),total=cash(selected.reduce((sum,c)=>sum+Number(c.amount),0));
 const items=`<div class="receipt">${selected.map(c=>`<div class="summary-line"><span>${E(c.name)}</span><strong>${M(c.amount)}</strong>${c.namedObligation&&c.date?`<small>Due ${E(dateName(c.date))}</small>`:''}</div>`).join('')}</div>`;
 return `<section class="budget-everyday budget-cycle-review" data-illustrated-screen="budgetCycleReview" aria-label="Review fresh Budget"><p class="small muted">${E(dateName(d.start))} – ${E(dateName(d.end))}</p><div class="budget-conclusion"><span>Budget for this period</span><strong>${M(total)}</strong></div>${selected.length>2?`<details class="optional-fields"><summary>Budget items · ${selected.length}</summary>${items}<p class="small muted">Each item starts at its full amount. Previous payments stay in Activity.</p></details>`:items}<p class="small">This replaces your current budget. No money moves.</p>${d.namedCostsReplaced?'<p class="small notice">These category totals replace your named costs and their due dates.</p>':''}${L.state.planDraft?'<p class="small muted">Your unfinished setup draft is kept separately.</p>':''}${error}<div class="actions">${B('Start this budget','L.confirmBudgetCycle()')}${B('Edit dates or amounts',`L.go('budgetCycle',{id:${JSON.stringify(d.id)}})`,'secondary')}${B('Keep draft for later',"L.go('plan')",'text-btn')}</div></section>`;
};
const editCycle=event=>{if(L.route==='budgetCycle'&&/^cycle-/.test(event.target?.id||'')&&document.getElementById(event.target.id)===event.target){if(L.state.budgetCycleDraft)L.state.budgetCycleDraft.reviewed=false;captureCycle();}};
document.addEventListener('input',editCycle);document.addEventListener('change',editCycle);
const plan=L.views.plan;
L.views.plan=function(){const html=plan.apply(this,arguments);if(!costs().length)return html;const status=cycleStatus(),row=L.row(status.ended?'Start your next budget':'Use this budget again',L.state.budgetCycleDraft?'Continue your saved period draft':status.label,'plan','L.openBudgetCycle()');return html.replace('<div class="plan-hub-detail-actions">','<div class="plan-hub-detail-actions">'+row);};

const incomeCandidate=()=> (L.state.txs||[]).find(t=>externalCredit(t)&&!t.budgetPromptHandled)||null;
const incomeTx=()=>tx(L.route==='budgetAfterFunding'?L.state.budgetPrompt?.txId:L.params?.txId||L.state.incomePlanTxId);
const reviewedActive=()=>{const r=L.state.budgetIncomeReview,s=cycleStatus();return !!r&&r.signature===signature()&&r.through===(L.state.planHorizon?.date||'')&&!s.ended;};
const handleIncome=t=>{if(!externalCredit(t))return false;t.budgetPromptHandled=true;if(L.state.budgetPrompt?.txId===t.id)L.state.budgetPrompt.done=true;if(L.state.onboardingFunding)L.state.onboardingFunding.done=true;L.state.budgetIncomeReview={...currentReview(),txId:t.id};L.state.fundingReturn=null;L.save();return true;};
L.openIncomePlan=id=>{const t=tx(id);if(!externalCredit(t))return false;L.state.incomePlanTxId=t.id;L.save();L.go('incomePlan',{txId:t.id});return true;};
L.keepIncomeBudget=()=>{if(!handleIncome(incomeTx()))return;L.go('home');};
L.adjustIncomeBudget=()=>{if(!handleIncome(incomeTx()))return;L.go(costs().length?'planEdit':L.state.planDraft?'firstEssentials':'planSetup');};
L.renewIncomeBudget=()=>{if(!handleIncome(incomeTx()))return;L.openBudgetCycle();};
const incomeView=t=>{
 if(!externalCredit(t))return `<section>${L.header('Money has not arrived yet.')}<p>A pending transfer is not available money.</p>${B('See incoming activity',"L.go('activity',{filter:'in'})")}</section>`;
 const b=L.balances(),status=cycleStatus();
 return `<section class="budget-everyday income-plan">${L.header('Money arrived.')}<p class="small">${M(t.amount)} confirmed in your operational account. Sample money.</p><div class="budget-conclusion"><span>Left after your current budget</span><strong>${M(b.room)}</strong></div><p class="small">Your saved budget stays in place. ${M(b.essentials)} of everyday costs remain. Adding money doesn’t restart it.</p><div class="actions">${status.ended?B('Review a fresh budget','L.renewIncomeBudget()'):B('Keep my budget','L.keepIncomeBudget()')}${B('Adjust my budget','L.adjustIncomeBudget()','secondary')}</div>${L.savingRules?.cta(t.id)||''}<details class="optional-fields"><summary>What does this do?</summary><p class="small">Your budget plans what the operational account needs to cover. It doesn’t move or lock money. Moving money to a Money Box has its own review and authorisation.</p>${!status.ended?B('Use this budget for a fresh period','L.renewIncomeBudget()','text-btn'):B('Keep current budget for now','L.keepIncomeBudget()','text-btn')}</details><p class="preview-boundary">No live payments or bank connections.</p></section>`;
};
L.views.incomePlan=()=>incomeView(incomeTx());
const afterFunding=L.views.budgetAfterFunding;
L.views.budgetAfterFunding=function(){const t=tx(L.state.budgetPrompt?.txId);return costs().length&&externalCredit(t)?incomeView(t):afterFunding.apply(this,arguments);};
const beginFunded=L.beginFundedBudget,deferFunded=L.deferFundedBudget;
L.beginFundedBudget=function(){const t=tx(L.state.budgetPrompt?.txId);if(costs().length&&externalCredit(t))L.state.budgetIncomeReview={...currentReview(),txId:t.id};return beginFunded.apply(this,arguments);};
L.deferFundedBudget=function(){const t=tx(L.state.budgetPrompt?.txId);if(costs().length&&externalCredit(t))L.state.budgetIncomeReview={...currentReview(),txId:t.id};return deferFunded.apply(this,arguments);};
const fundingDone=L.fundingDone;
L.fundingDone=function(){const t=tx(L.route==='bankAdd'?L.state.bankFunding?.txId:L.route==='momoAdd'?L.state.fundingDraft?.txId:null);if(externalCredit(t)&&costs().length&&reviewedActive()&&L.state.fundingReturn!=='paymentReview'&&!(L.state.onboardingFunding&&!L.state.onboardingFunding.done)){t.budgetPromptHandled=true;L.save();}return fundingDone.apply(this,arguments);};
// First funding still uses the existing progressive setup. Subsequent credits
// can be reviewed deliberately from this route; no incoming credit moves savings.
L.budgetEveryday={suggestion,cycleStatus,incomeCandidate,reviewedActive,remaining};
const pauseView=L.views.pause;
L.views.pause=function(...args){
 const html=pauseView.apply(this,args),status=L.budgetStateSummary?.();
 return status?.ended&&!L.state.paymentDraft?.submittedTxId?html.replace('<div class="pause-decision-consequence"',`<p class="small muted" data-budget-period>${E(status.qualifier)}</p><div class="pause-decision-consequence"`):html;
};
L.taskSheet?.register('firstBudgetExample',{family:'plan',treatment:'detail',label:'Your Budget in action'});
L.taskSheet?.register('budgetCycle',{family:'plan',treatment:'edit',label:'Fresh budget'});
L.taskSheet?.register('budgetCycleReview',{family:'plan',treatment:'confirmation',label:'Review budget'});
L.taskSheet?.register('incomePlan',{family:'funding',treatment:'confirmation',label:'Money arrived'});
})();
