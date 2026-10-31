/* A Budget is visible where it is managed. Totals describe commitments, not an
   account balance. Deleting commitments never deletes payments or moves money. */
(()=>{
'use strict';
if(!window.L||L.budgetOverview)return;
const E=L.e,M=L.money,B=L.btn,J=value=>E(JSON.stringify(value));
const clone=value=>JSON.parse(JSON.stringify(value));
const cash=value=>Math.round((Number(value)||0)*100)/100;
const allowed=()=>!!L.state.onboarded&&!L.state.locked&&!L.state.closed;
const live=()=> (L.state.essentials||[]).filter(x=>x&&!x.archived&&!x.deleted&&Number(x.amount)>0);
const grouped=()=>L.budgetCategories.group(live());
const mark=()=>JSON.stringify([L.state.essentials,L.state.planHorizon,!!L.state.planSaved]);
const pending=ids=>(L.state.txs||[]).some(t=>t.type==='out'&&t.status==='pending'&&ids.has(t.essentialId));
let deletion=null;
function summary(){
 const b=L.balances(),position=L.pauseEngine?.planPosition?.({amount:0,fee:0},L.state),groups=grouped().map(g=>({...g,remaining:cash(g.items.reduce((sum,x)=>sum+(position?.essentials.find(r=>r.id===x.id)?.before??Math.max(0,Number(x.amount)-Number(x.paid||0))),0))}));
 return {total:L.budgetCategories.total(live()),remaining:b.essentials,room:b.room,gap:b.gap,groups};
}
const privateAmount=(key,n,large=false)=>L.privateMoney?L.privateMoney(key,n,large):large?L.balanceNumber(n):M(n);
const periodLine=()=>{
 const raw=String(L.state.planHorizon?.date||''),date=/^\d{4}-\d{2}-\d{2}$/.test(raw)?new Date(raw+'T12:00:00Z'):null;
 const valid=date&&!Number.isNaN(date.getTime())&&date.toISOString().slice(0,10)===raw;
 const today=new Date().toISOString().slice(0,10),label=valid?(raw<today?'Ended ':'Through ')+date.toLocaleDateString('en-GH',{timeZone:'UTC',day:'numeric',month:'short',...(raw.slice(0,4)!==today.slice(0,4)?{year:'numeric'}:{})}):'Add dates';
 return B(E(label)+L.icon('chevron',14),"L.go('planPeriod')",'text-btn budget-overview-period').replace('<button ','<button aria-label="'+E(valid?'Change Budget period · '+label:'Add Budget dates')+'" ');
};
const chatAction=(has=false)=>B(has?'Adjust with Lumo':'Build with Lumo',"L.budgetGuide.start({mode:'create'})",'secondary budget-overview-chat');
const viewButton=g=>`<button type="button" class="budget-overview-item" onclick="L.budgetOverview.openCategory(${J(g.id)})" aria-label="View ${E(g.name)} Budget, ${E(M(g.total))}"><span><strong>${E(g.name)}</strong>${g.remaining<g.total?`<small>${M(g.remaining)} still to cover</small>`:''}</span><span class="budget-overview-item-amount">${M(g.total)}${L.icon('chevron',16)}</span></button>`;
function itemList(z){return z.groups.length?`<div class="budget-overview-items" aria-label="Your Budget items">${z.groups.map(viewButton).join('')}</div>`:'';}
const deleteButton=(label,scope,id='')=>B(label,`L.budgetOverview.requestDelete({scope:${J(scope)},id:${J(id)}})`,'text-btn budget-delete-action');
const tools=(has)=>`<details class="plan-hub-details budget-overview-tools"><summary>${has?'Budget tools':'How it works'} ${L.icon('chevron',16)}</summary><div class="plan-hub-detail-actions">${has?`${L.row('Budget period',L.planPeriodActionLabel(),'plan',"L.go('planPeriod')")}${L.row(L.budgetEveryday?.cycleStatus().ended?'Start your next budget':'Use this budget again',L.state.budgetCycleDraft?'Continue your saved period draft':L.budgetEveryday?.cycleStatus().label||'Review dates and amounts','plan','L.openBudgetCycle()')}${L.row('See the calculation','Uses only your saved Budget costs','help',"L.go('planExplanation')")}${L.row('Expected money','Excluded until it arrives','arrowDown',"L.go('allowance')")}${L.state.firstBudgetPayoff?.status==='ready'&&!L.budgetStateSummary().ended?L.row('Try a spending example','See what your budget changes','help','L.openFirstBudgetExample()')+B('Not now','L.dismissFirstBudgetExample()','text-btn'):''}`:B('What is a Budget?',"L.openPlanBenefit()",'text-btn')}${B('Suggest from my spending','L.budgetHistory.open()','text-btn budget-history-entry')}${has&&L.budgetPeriodReview&&!L.budgetEveryday?.cycleStatus().ended?B('Review this period','L.budgetPeriodReview.open()','text-btn budget-period-review-entry'):''}${has?deleteButton('Delete entire Budget','all'):''}</div></details>`;
function budgetSection(){
 const z=summary(),has=z.groups.length>0;
 return `<section class="plan-budget-section budget-overview-section" aria-labelledby="plan-budget-title"><div class="plan-section-heading"><span class="plan-section-icon" aria-hidden="true">${L.icon('plan',22)}</span><div><h2 id="plan-budget-title">Budget</h2><span>Operational account</span></div></div><div class="budget-summary plan-hub-summary budget-overview-summary"><div class="budget-overview-total-label"><span>Total Budget</span>${has?periodLine():''}</div><strong class="plan-hub-amount" data-budget-total>${L.balanceNumber(z.total)}</strong>${has?`<div class="budget-overview-context${z.remaining===z.total?' budget-overview-context-single':''}">${z.remaining!==z.total?`<span>Still to cover<strong>${M(z.remaining)}</strong></span>`:''}<span>Left after Budget<strong>${privateAmount('room',z.room)}</strong></span></div>${z.gap?`<p class="plan-hub-shortfall">${L.icon('help',16)} ${M(z.gap)} of your Budget is uncovered.</p>`:''}`:'<p class="plan-hub-empty">Choose what your Everyday money needs to cover.</p>'}</div>${has&&L.budgetPeriodReview&&L.budgetEveryday?.cycleStatus().ended?B('Review this period','L.budgetPeriodReview.open()','text-btn budget-period-review-entry'):''}<div class="plan-hub-actions budget-overview-actions">${has?B('Edit budget',"L.go('planEdit')")+chatAction(true):L.state.planDraft?B('Continue budget',"L.buildPlanFromBenefit()")+chatAction(false):B('Build with Lumo',"L.budgetGuide.start({mode:'create'})",'primary budget-overview-chat')+B('Create a budget',"L.buildPlanFromBenefit()",'secondary')}</div>${itemList(z)}${tools(has)}</section>`;
}
const plan=L.views.plan;
L.views.plan=function(...args){
 let html=plan.apply(this,args);if(!allowed())return html;
 html=html.replace('class="plan-hub account-budget-page"','class="plan-hub account-budget-page budget-overview-page"');
 html=html.replace(/<section class="plan-budget-section"[\s\S]*?<\/section>/,budgetSection());
 // The existing Money Boxes destination remains separate, using its own account.
 html=html.replace(/<strong class="plan-hub-amount">([\s\S]*?)<\/strong>(?=<p class="plan-hub-facts">)/,()=>`<strong class="plan-hub-amount">${privateAmount('savings',L.accountBalances().savings,true)}</strong>`);
 return html;
};
function editList(title='Edit your Budget'){
 const z=summary(),has=z.groups.length>0;
 return `<section class="budget-overview-edit">${L.header(title,has?'Choose an item to change.':'Start with the costs you know.')}<div class="budget-overview-edit-total"><span>Total Budget</span><strong>${M(z.total)}</strong></div>${itemList(z)}<div class="actions">${z.groups.length<7?B(has?'Add a budget item':'Create a budget',has?"L.go('essentialEdit')":"L.buildPlanFromBenefit()"):''}${chatAction(has)}</div>${z.groups.length===7?'<p class="small muted">All seven categories are in your Budget. Choose an item above to change it.</p>':''}<details class="optional-fields"><summary>Period and other options</summary>${L.row('Budget period',L.planPeriodActionLabel(),'plan',"L.go('planPeriod')")}${L.row('Expected money','An estimate, not money received','arrowDown',"L.go('allowance')")}${has?deleteButton('Delete entire Budget','all'):''}</details>${B('Close','L.taskSheet?.active?L.closeTask():L.back()','text-btn')}</section>`;
}
L.views.planEdit=()=>editList();
L.views.essentials=()=>editList('Your Budget items');
function openCategory(id){
 if(!allowed()||!grouped().some(g=>g.id===id))return false;
 L.go('budgetCategory',{id});return true;
}
L.views.budgetCategory=()=>{
 const g=summary().groups.find(g=>g.id===L.params.id);
 if(!g)return `${L.header('This Budget item is no longer available.')}<div class="actions">${B('Back to Budget',"L.go('plan')")}</div>`;
 const rows=g.items.map(x=>`<div class="budget-category-original"><div><span>${E(x.name)}</span><strong>${M(x.amount)}</strong></div>${x.date?`<p class="small muted">Due ${E(x.date)}</p>`:''}<div class="budget-category-original-actions">${B('Edit',`L.go('essentialEdit',{id:${J(x.id)}})`,'secondary')}${deleteButton('Delete item','item',x.id)}</div></div>`).join('');
 return `<section class="budget-category-detail">${L.header(g.name,'Budget item · Operational account')}<div class="budget-overview-edit-total"><span>Total Budget for ${E(g.name)}</span><strong>${M(g.total)}</strong></div><p class="small muted">${M(g.remaining)} still to cover. This is a planned cost, not a separate balance.</p>${rows}${B('Add a named cost',`L.go('essentialEdit',{obligationCategory:${J(g.id)}})`,'secondary')}${g.items.length>1?`<p class="small muted">These costs share one category total. Each keeps its own payment history.</p>${deleteButton('Delete this category','group',g.id)}`:''}<div id="error" role="alert" aria-live="polite"></div>${B('Done','L.taskSheet?.active?L.back():L.go(\'plan\')','text-btn')}</section>`;
};
function currentDeletion(){if(deletion?.account!==L.state)deletion=null;return deletion;}
function requestDelete({scope='item',id=''}={}){
 if(!allowed())return false;
 const all=live(),items=scope==='all'?(L.state.essentials||[]):scope==='group'?(grouped().find(g=>g.id===id)?.items||[]):all.filter(x=>x.id===id);
 if(!items.length)return L.toast('That Budget item is no longer available.'),false;
 const ids=new Set(items.map(x=>x.id));
 if(pending(ids))return L.error('A payment linked to this Budget is still pending. Wait for its result before deleting.'),false;
 const category=scope==='group'?grouped().find(g=>g.id===id):null;
 deletion={account:L.state,scope,ids:[...ids],name:scope==='all'?'your entire Budget':scope==='group'?category.name:items[0].name,signature:mark(),total:L.budgetCategories.total(items),returnRoute:L.route,returnParams:clone(L.params||{})};
 L.go('budgetDelete');return true;
}
const hasDrafts=()=>!!(L.state.planDraft||L.state.budgetGuideSession&&L.state.budgetGuideSession.status!=='saved'||L.state.budgetCycleDraft||L.state.budgetHistoryDraft||L.state.planPeriodDraft||L.state.budgetPeriodReviewDraft);
L.views.budgetDelete=()=>{
 const d=currentDeletion();if(!d)return `${L.header('Nothing has been deleted.')}<div class="actions">${B('Back to Budget',"L.go('plan')")}</div>`;
 const all=d.scope==='all';
 return `<section class="budget-delete-confirmation">${L.header(all?'Delete your entire Budget?':`Delete ${d.name}?`)}<p>${all?'All Budget items will be removed.':`${E(d.name)} will be removed from your Budget.`} No money moves. Your payments and Money Boxes stay as they are.</p>${hasDrafts()?'<p class="small notice">Your unfinished Budget drafts and suggestions will also be cleared so they cannot bring deleted items back.</p>':''}<div id="error" role="alert" aria-live="polite"></div><div class="actions">${B(all?'Delete Budget':'Delete item','L.budgetOverview.confirmDelete()','primary budget-delete-confirm')}${B('Keep my Budget','L.budgetOverview.cancelDelete()','secondary')}</div></section>`;
};
function cancelDelete(){const d=currentDeletion();deletion=null;if(d)return L.go(d.returnRoute,d.returnParams);return L.taskSheet?.active?L.closeTask():L.go('plan');}
function retireDrafts(){
 const guide=L.state.budgetGuideSession?.draftId;
 if(guide)for(const r of L.state.chats||[])if(r.guideDraftId===guide){for(const key of ['action','route','secondaryAction','secondaryRoute','guideChoices'])delete r[key];r.guideComplete=true;}
 for(const key of ['planDraft','budgetGuideSession','budgetCycleDraft','budgetHistoryDraft','planPeriodDraft','budgetPeriodReviewDraft'])L.state[key]=null;
 for(const route of ['firstEssentials','firstPlanReview','planSetup','planPeriod','budgetCycle','budgetCycleReview','budgetHistory'])L.clearFormDraft?.(route,{});
}
function confirmDelete(){
 const d=currentDeletion();if(!allowed()||!d||L.route!=='budgetDelete')return false;
 const ids=new Set(d.ids);
 if(d.signature!==mark())return L.error('Your Budget changed while this was open. Close this sheet and review it before deleting.'),false;
 if(pending(ids))return L.error('A linked payment is now pending. Wait for its result before deleting.'),false;
 const s=L.state;retireDrafts();for(const id of [...ids,''])L.clearFormDraft?.('essentialEdit',{id});s.essentials=(s.essentials||[]).filter(x=>!ids.has(x.id));
 s.budgetPurposeRules=(s.budgetPurposeRules||[]).filter(r=>!ids.has(r.sourceId));
 s.budgetIncomeReview=null;s.firstBudgetPayoff=null;
 if(!live().length){s.planSaved=false;s.planHorizon={mode:'unspecified',date:''};s.budgetCycle=null;s.budgetPeriodRecord=null;}else s.planSaved=true;
 const pay=s.paymentDraft;
 if(pay&&!pay.submittedTxId&&ids.has(pay.essentialId)){
  L.setPaymentSource('',pay);
  for(const key of ['budgetPurposeProof','budgetPurposeCheckedKey','budgetPurposeDeclinedKey','pauseOffer','pauseExposureSignature'])delete pay[key];
 }
 deletion=null;L.save();L.go('plan');L.toast(d.scope==='all'?'Budget deleted. No money moved.':'Budget item deleted. No money moved.');return true;
}
L.removeEssential=()=>requestDelete({scope:'item',id:L.params.id});
const essentialEdit=L.views.essentialEdit;
L.views.essentialEdit=function(...args){if(L.params.id&&!live().some(x=>x.id===L.params.id))return `<section>${L.header('This Budget item was removed.')}<p>Open your Budget to choose another item.</p><div class="actions">${B('Open Budget',"L.go('plan')")}</div></section>`;return essentialEdit.apply(this,args).replace(/>Remove from budget<\/button>/g,'>Delete item</button>');};
L.taskSheet?.register('budgetCategory',{family:'plan',treatment:'detail',label:'Budget item'});
L.taskSheet?.register('budgetDelete',{family:'plan',treatment:'confirmation',label:'Delete Budget'});
L.budgetOverview={summary,openCategory,requestDelete,confirmDelete,cancelDelete};
})();
