/* Plain language and a visible time basis for existing money decisions.
   Existing Budget, payment, privacy and account controllers remain authoritative. */
(()=>{
'use strict';
if(!window.L||L.experienceClarity)return;
const E=L.e,B=L.btn,DAY=86400000;
const allowed=state=>!!state?.onboarded&&!state.locked&&!state.closed;
const costs=state=>(state.essentials||[]).filter(x=>x&&!x.archived&&!x.deleted&&Number(x.amount)>0);
const stamp=value=>{
 if(!/^\d{4}-\d{2}-\d{2}$/.test(String(value||'')))return null;
 const tick=Date.parse(value+'T00:00:00Z');return Number.isFinite(tick)&&new Date(tick).toISOString().slice(0,10)===value?tick:null;
};
const shortDate=(value,today)=>new Date(value+'T12:00:00Z').toLocaleDateString('en-GH',{timeZone:'Africa/Accra',day:'numeric',month:'short',...(value.slice(0,4)!==today.slice(0,4)?{year:'numeric'}:{})});
function basis({state=L.state,now=Date.now()}={}){
 if(!allowed(state))return {status:'unavailable',text:'',count:0};
 const count=costs(state).length,tick=Number.isFinite(Number(now))?Number(now):Date.now(),today=new Date(tick).toISOString().slice(0,10);
 if(!count)return {status:'no-budget',text:'Money available now',count};
 const h=state.planHorizon||{},end=stamp(h.date),fallback={status:'saved-costs',text:`After your ${count} saved ${count===1?'cost':'costs'}`,count};
 if(!['date','allowance'].includes(h.mode)||end===null)return fallback;
 if(h.mode==='allowance'&&h.date!==(state.allowance?.date||''))return {status:'changed-allowance',text:'Review your Budget dates',count};
 if(h.date<today)return {status:'ended',text:'Budget period ended',count};
 if(h.mode==='allowance'&&h.date===today)return {status:'allowance-due',text:'Allowance expected today',count};
 // An allowance period ends before expected money arrives; it is never
 // counted as cash available today or an extra day that can be spent.
 const last=new Date(end-(h.mode==='allowance'?DAY:0)).toISOString().slice(0,10);
 return {status:'dated',text:'Through '+shortDate(last,today),count,last,mode:h.mode};
}
const home=L.views.home;
L.views.home=function(...args){
 const html=home.apply(this,args),s=basis();if(s.status==='unavailable')return html;
 const context=`<p class="experience-budget-basis" data-budget-basis data-basis-status="${s.status}">${E(s.text)}</p>`;
 return html.replace(/(<div class="everyday-account-heading"><div><h2>Everyday money<\/h2>)<p>Operational account<\/p>/,'$1'+context);
};
const categoryFields=L.paymentPlanLinkFields;
if(categoryFields)L.paymentPlanLinkFields=function(...args){
 return categoryFields.apply(this,args)
  .replace('<span>Pay from</span>','<span>Count this under</span>')
  .replace('All use your operational account.','Paid from Everyday money.')
  .replace('This budget item is no longer available. Choose a source.','This Budget item is no longer available. Choose another item.')
  .replace('Budget item unavailable · choose a source','Budget item unavailable · choose another item');
};
const review=L.views.paymentReview;
if(review)L.views.paymentReview=function(...args){
 return review.apply(this,args).replace(/(<div class="hibiscus-review-source"><span>)Pay from(<\/span>)/,'$1Count this under$2');
};
const link=L.views.paymentPlanLink;
if(link)L.views.paymentPlanLink=function(...args){return link.apply(this,args)
 .replace('<h1>Pay from</h1>','<h1>Count this under</h1>')
 .replace('<h1>Choose a source</h1>','<h1>Choose a Budget item</h1>');};
const plan=L.views.plan;
L.views.plan=function(...args){
 let html=plan.apply(this,args);if(!allowed(L.state))return html;
 const has=costs(L.state).length>0,label=has?'Update budget':L.state.planDraft?'Continue budget':'Create a budget';
 const action=has?"L.go('planEdit')":'L.buildPlanFromBenefit()';
 html=html.replace(/<div class="plan-hub-actions budget-overview-actions">[\s\S]*?<\/div>/,`<div class="plan-hub-actions budget-overview-actions" data-budget-primary>${B(label,action)}</div>`)
  .replace('<span>Operational account</span>','<span>Everyday money</span>')
  .replace('<span class="eyebrow">Plan</span>','<span class="eyebrow">Budget</span>')
  .replace('<h1>Plan</h1>','<h1>Budget</h1>')
  .replace('<h1>Your plan.</h1>','<h1>Your Budget.</h1>');
 // New-Budget assistance remains available from the same management sheet,
 // without competing with the root's single creation action.
 if(!has&&L.budgetGuide)html=html.replace('<div class="plan-hub-detail-actions">','<div class="plan-hub-detail-actions">'+B('Build with Lumo',"L.go('planEdit')",'text-btn experience-budget-help'));
 return html;
};
for(const route of ['planEdit','essentials']){
 const view=L.views[route];if(!view)continue;
 L.views[route]=function(...args){
  let html=view.apply(this,args);if(!allowed(L.state)||!L.budgetGuide)return html;
  const guideButtons=html.match(/<button\b[^>]*class="[^"]*(?:budget-guide-entry|budget-overview-chat)[^"]*"[^>]*>[\s\S]*?<\/button>/g)||[];
  const preserved=guideButtons.find(button=>button.includes('budget-guide-entry'))||guideButtons[0];
  const handler=preserved?.match(/onclick="([^"]*)"/)?.[1]||"L.budgetGuide.start({mode:'create'})";
  html=html.replace(/<button\b[^>]*class="[^"]*(?:budget-guide-entry|budget-overview-chat)[^"]*"[^>]*>[\s\S]*?<\/button>/g,'');
  const helper=B(L.icon('chat',18)+'<span>'+E(costs(L.state).length?'Adjust with Lumo':'Build with Lumo')+'</span>',handler.replace(/&quot;/g,'"').replace(/&#39;/g,"'"),'secondary experience-budget-assistance');
  return html.replace(/(<div class="actions">)([\s\S]*?)(<\/div>)/,'$1$2'+helper+'$3');
 };
}
const accountInfo=L.views.accountInfo;
if(accountInfo)L.views.accountInfo=function(...args){return accountInfo.apply(this,args)
 .replace('<h3>Lumo operational account</h3>','<h3>Everyday money</h3>')
 .replace('>Copy operational account number<','>Copy Everyday account number<');};
const generatedPhrases=[
 ['All use your operational account.','Paid from Everyday money.'],
 ['returning to your operational account · pending','returning to your Everyday money · pending'],
 ['Funding a box transfers money from your operational account into your Lumo savings account.','Funding a box transfers Everyday money into your Lumo savings account.'],
 ['Your budget applies to your operational account. Money here is separate.','Your Budget applies to Everyday money. Money here is separate.'],
 ['This money becomes available in your operational account only after confirmation.','This money becomes available as Everyday money only after confirmation.'],
 ['This moves sample money from your operational account into savings.','This moves sample Everyday money into savings.'],
 ['The amount is reserved in your operational account while the transfer is checked.','The amount is reserved in your Everyday money while the transfer is checked.'],
 ['Your budget uses your operational account.','Your Budget uses Everyday money.'],
 ['Fund your operational account','Add to your Everyday money'],
 ['Your budget plans what the operational account needs to cover.','Your Budget plans what Everyday money needs to cover.'],
 ['confirmed in your operational account. Sample money.','confirmed as Everyday money. Sample money.'],
 ['added to your operational account.','added to your Everyday money.'],
 ['enter your Lumo operational account number.','enter your Lumo Everyday account number.'],
 ['Your operational balance, minus budget costs still to cover.','Your Everyday money, minus Budget costs still to cover.'],
 ['Your budget applies to operational money. Money Boxes are held separately in your savings account and are not deducted again.','Your Budget applies to Everyday money. Money Boxes are held separately in savings and are not deducted again.'],
 ['This would remain in your operational account after your budget.','This would remain as Everyday money after your Budget.'],
 ['Your budget would use all the remaining operational money.','Your Budget would use all the remaining Everyday money.'],
 ['Move money back to your operational account before using it for a payment.','Move money back to Everyday money before using it for a payment.'],
 ['Move money back to your operational account before using it to cover this gap.','Move money back to Everyday money before using it to cover this gap.'],
 ['is available in your operational account.','is available as Everyday money.'],
 ['funding one moves money from operational to savings.','funding one moves Everyday money into savings.'],
 ['A transfer back moves existing savings into your operational account.','A transfer back moves existing savings into Everyday money.'],
 ['Your budget applies to the operational account.','Your Budget applies to Everyday money.'],
 ['Money Boxes are already held in savings and are not deducted from this operational balance again.','Money Boxes are already held in savings and are not deducted from Everyday money again.'],
 ['Add the costs your operational money needs to cover.','Add the costs your Everyday money needs to cover.'],
 ['Save the costs your operational money needs to cover before using','Save the costs your Everyday money needs to cover before using'],
 ['Review the transfer from your operational account, then approve it separately.','Review the transfer from Everyday money, then approve it separately.']
];
const plainGenerated=value=>typeof value==='string'?generatedPhrases.reduce((text,[from,to])=>text.split(from).join(to),value):value;
const plainLabel=value=>({
 'Operational account':'Everyday money','Operational balance':'Everyday balance','Operational balance available':'Available Everyday money',
 'Operational balance after':'Everyday money after','Projected operational balance':'Projected Everyday balance',
 'Available operational balance':'Available Everyday money','Operational account after purchase':'Everyday money after purchase',
 'To operational account':'To Everyday money','To your operational account':'To your Everyday money',
 'Back in your operational account.':'Back in your Everyday money.'
}[value]||value);
function plainMarkup(html,route){
 // Notes and recipient names remain customer text. Only fixed labels and
 // complete generated phrases are changed, never a global account-word swap.
 const protectedNotes=[];
 html=html.replace(/(<(?:div|p)\b[^>]*class="[^"]*(?:focus-note|receipt-note|payment-note)[^"]*"[^>]*>[\s\S]*?<\/(?:div|p)>|<div><dt>Note<\/dt><dd>[\s\S]*?<\/dd><\/div>|<div><span>Note<\/span><strong>[\s\S]*?<\/strong><\/div>)/g,match=>{const key='@@LUMO_CUSTOM_NOTE_'+protectedNotes.length+'@@';protectedNotes.push(match);return key;});
 const personal=new Set([L.state.profile?.name,L.state.profile?.displayName,L.state.paymentDraft?.name,L.state.paymentDraft?.note,...(L.state.goals||[]).map(x=>x.name),...(L.state.essentials||[]).map(x=>x.name),...(L.state.txs||[]).flatMap(x=>[x.name,x.note]),...(L.state.requests||[]).flatMap(x=>[x.name,x.to,x.note])].filter(x=>typeof x==='string'&&x));
 for(const value of personal){const escaped=E(value);if(!html.includes(escaped))continue;const key='@@LUMO_CUSTOM_NOTE_'+protectedNotes.length+'@@';protectedNotes.push(escaped);html=html.split(/(@@LUMO_CUSTOM_NOTE_\d+@@)/).map(part=>/^@@LUMO_CUSTOM_NOTE_\d+@@$/.test(part)?part:part.split(escaped).join(key)).join('');}
 html=plainGenerated(html)
  .replace(/<(dt|span)>(Operational account|Operational balance|Operational balance available|Operational balance after|Projected operational balance|Available operational balance|Operational account after purchase|To operational account)<\/\1>/g,(_,tag,label)=>`<${tag}>${plainLabel(label)}</${tag}>`)
  .replace(/<p class="small muted">To your operational account<\/p>/g,'<p class="small muted">To your Everyday money</p>')
  .replace('<h1>Back in your operational account.</h1>','<h1>Back in your Everyday money.</h1>')
  .replace(/(<span>(?:From|To)<\/span><strong>)Operational account(<\/strong>)/g,'$1Everyday money$2')
  .replace('Projected operational balance:','Projected Everyday balance:');
 if(route==='balances')html=html.replace('<h2>Operational</h2>','<h2>Everyday money</h2>').replace('They are not deducted from your operational balance again.','They are not deducted from Everyday money again.');
 return html.replace(/@@LUMO_CUSTOM_NOTE_(\d+)@@/g,(_,i)=>protectedNotes[Number(i)]);
}
for(const route of ['balances','accountInfo','goals','goal','allocate','allocationReview','releaseGoal','releaseReview','send','paymentReview','authorize','paymentResult','txDetail','makeRoom','budgetAfterFunding','incomePlan','bankAdd','momoAdd','savingRule','savingMilestones','planBenefit','planExplanation','firstPlanReview','firstBudgetExample','pause']){
 const view=L.views[route];if(!view)continue;
 L.views[route]=function(...args){return plainMarkup(view.apply(this,args),route);};
}
const answer=L.chatAnswer;
if(answer)L.chatAnswer=function(...args){
 const a=answer.apply(this,args);if(!a||typeof a!=='object')return a;
 const result={...a};
 for(const key of ['support','text'])if(typeof result[key]==='string')result[key]=plainGenerated(result[key]);
 if(a.calculation){result.calculation={...a.calculation};if(Array.isArray(a.calculation.rows))result.calculation.rows=a.calculation.rows.map(row=>Array.isArray(row)?[plainLabel(row[0]),...row.slice(1)]:row);if(Array.isArray(a.calculation.notes))result.calculation.notes=a.calculation.notes.map(plainGenerated);}
 return result;
};
const bankText=L.bankDetailsText;
if(bankText)L.bankDetailsText=function(...args){return bankText.apply(this,args).replace('\nOperational account number:','\nEveryday account number:');};
function normaliseInline(){
 const hint=document.getElementById('payment-plan-hint');if(hint?.textContent==='All use your operational account.')hint.textContent='Paid from Everyday money.';
 const projection=document.getElementById('money-box-projection');
 if(projection){const next=plainGenerated(projection.textContent).replace('Projected operational balance:','Projected Everyday balance:').replace('This amount is more than your available operational balance.','This amount is more than your available Everyday money.');if(next!==projection.textContent)projection.textContent=next;}
}
for(const name of ['approveBudgetPurpose','forgetBudgetPurpose','refreshPaymentProjection']){
 const fn=L[name];if(!fn)continue;L[name]=function(...args){const result=fn.apply(this,args);normaliseInline();return result;};
}
document.addEventListener?.('change',event=>{if(event.target?.id==='payment-essential')normaliseInline();});
// Navigation names the same job as its screen. Keep each route, button and
// retained parent node unchanged, including after a task closes over it.
function syncNames(){
 const nav=document.getElementById('nav');
 for(const button of nav?.querySelectorAll('button')||[]){
  if(button.getAttribute('onclick')!=="L.openTab('plan')")continue;
  const label=button.querySelector('span');if(label)label.textContent='Plan';
  if(button.getAttribute('aria-label')==='Budget')button.setAttribute('aria-label','Plan');
 }
 for(const button of document.querySelectorAll('[aria-label="Back to Budget"]')||[])button.setAttribute('aria-label','Back to Plan');
 normaliseInline();
}
for(const name of ['render','syncChatBanking']){
 const fn=L[name];if(!fn)continue;
 L[name]=function(...args){const result=fn.apply(this,args);syncNames();return result;};
}
const chat=L.views.chat;
if(chat)L.views.chat=function(...args){return chat.apply(this,args).replace('aria-label="Back to Budget"','aria-label="Back to Plan"');};
L.experienceClarity=Object.freeze({version:1,basis,syncNames,plainGenerated,plainMarkup});
syncNames();
})();
