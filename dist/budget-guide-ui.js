/* A second way into the same Budget draft. The guide and existing review
   controller own state; this adapter only presents their working controls. */
(()=>{
'use strict';
if(!window.L||L.budgetGuideUI)return;
const E=L.e,B=L.btn;
const allowed=()=>L.state.onboarded&&!L.state.locked&&!L.state.closed;
const chatButton=(label,mode='create',extra='')=>B(`${L.icon('chat',18)}<span>${E(label)}</span>`,`L.budgetGuide.start({mode:'${mode}'})`,'text-btn budget-guide-entry '+extra);
const benefit=L.views.planBenefit;
L.views.planBenefit=function(...args){
 let html=benefit.apply(this,args);if(!allowed())return html;
 html=html.replace('class="plan-benefit simple-plan-benefit"','class="plan-benefit simple-plan-benefit budget-guide-start"');
 html=html.replace(/<p class="plan-benefit-intro">[\s\S]*?<\/p>/,'<p class="plan-benefit-intro">Tell Lumo what your Everyday money needs to cover, like food, transport and data.</p>');
 html=html.replace(/<h2 class="plan-benefit-uses-heading">[\s\S]*?<\/ol>/,'<p class="budget-guide-benefit">Then, before you pay, see what stays covered and what would change.</p>');
 html=html.replace(/<div class="actions">[\s\S]*?<\/div>(?=<\/section>)/,`<div class="actions budget-guide-start-actions">${B('Build it with Lumo',"L.budgetGuide.start({mode:'create'})")}${B('Enter it myself','L.buildPlanFromBenefit()','secondary')}${B('Maybe later','L.leavePlanBenefit()','text-btn')}</div>`);
 return html;
};
const first=L.views.firstEssentials;
L.views.firstEssentials=function(...args){
 const html=first.apply(this,args);if(!allowed())return html;
 // A working handoff replaces transactional decoration rather than adding
 // another block above the form. The existing costs and tools stay available.
 const entry=`<div class="budget-guide-handoff">${chatButton('Continue in Chat','create')}<span class="small muted">Your entries come with you.</span></div>`;
 return html.replace(/<div class="simple-plan-art">[\s\S]*?<\/figure><\/div>/,entry);
};
const review=L.views.firstPlanReview;
L.views.firstPlanReview=function(...args){
 let html=review.apply(this,args);if(!allowed()||!L.state.planDraft?.guideId)return html;
 // Let the student check what the conversation understood before saving.
 // The original fields, arithmetic and Save handler stay authoritative.
 let calculation='',extras='';
 html=html.replace(/<dl class="first-plan-math">[\s\S]*?<\/dl>/,match=>{calculation=match;return '';});
 html=html.replace(/<details class="optional-fields"><summary>Your costs · [\s\S]*?<\/summary>([\s\S]*?)<\/details>/,(_,items)=>`<div class="budget-guide-review-items" role="group" aria-label="Budget items to save">${items}</div>`);
 html=html.replace(/<details class="optional-fields"><summary>Expected money · optional<\/summary>[\s\S]*?<\/details>/,match=>{extras=match;return '';});
 html=html.replace('<div id="error"',`${calculation?`<details class="optional-fields budget-guide-review-calculation"><summary>See calculation</summary>${calculation}</details>`:''}${extras}<div id="error"`);
 return html;
};
const planEdit=L.views.planEdit;
L.views.planEdit=function(...args){
 const html=planEdit.apply(this,args);if(!allowed())return html;
 return html.replace('<div class="actions">','<div class="actions">'+chatButton('Help me adjust my Budget'));
};
const funded=L.views.budgetAfterFunding;
L.views.budgetAfterFunding=function(...args){
 const html=funded.apply(this,args);
 if(!allowed()||L.hasMeaningfulPlan()||!html.includes('class="funding-budget-prompt"'))return html;
 if(L.state.planDraft)return html.replace(/(<button\b[^>]*onclick="L\.beginFundedBudget\(\)"[^>]*>[\s\S]*?<\/button>)/,(_,button)=>button+chatButton('Continue in Chat'));
 return html.replace(/<div class="actions">[\s\S]*?<\/div>(?=\s*<\/section>)/,`<div class="actions">${B('Build it with Lumo',"L.budgetGuide.start({mode:'create'})")}${B('Enter it myself','L.beginFundedBudget()','secondary')}${B('Do later','L.deferFundedBudget()','text-btn')}</div>`);
};
const menu=L.views.chatBankingActions;
L.views.chatBankingActions=function(...args){
 const html=menu.apply(this,args);if(!allowed())return html;
 return html.replace('<section aria-label="Your plan and spending">','<section aria-label="Your plan and spending">'+`<button type="button" class="chat-banking-action-item" onclick="L.budgetGuide.start({mode:'create'})">${L.icon('chat',23)}<span><strong>Build a Budget with Lumo</strong><small>Talk through your costs, then review.</small></span>${L.icon('chevron',18)}</button>`);
};
const chat=L.views.chat;
L.views.chat=function(...args){
 let html=chat.apply(this,args);if(!allowed()||!L.state.budgetGuideSession)return html;
 const s=L.budgetGuide?.summary?.();if(!s?.hasDraft)return html;
 const active=L.budgetGuide.active();
 if(active){
  html=html.replace(/(<button\b[^>]*class=")text-btn("[^>]*>Review Budget<\/button>)/g,'$1primary budget-guide-review-action$2');
  html=html.replace(/<button\b[^>]*>Edit in the form<\/button>/g,'');
  html=html.replace(/(<button\b[^>]*class=")chip("[^>]*>Add another item<\/button>)/g,'$1text-btn budget-guide-add-item$2');
  const toolbar=`<div class="budget-guide-toolbar" role="group" aria-label="Your unsaved Budget"><span>Budget draft${s.count?' · '+s.count+' item'+(s.count===1?'':'s'):''}</span>${B('View draft','L.budgetGuide.returnToForm()','text-btn')}${B(L.icon('close',18),'L.budgetGuide.pause()','icon-btn').replace('<button ','<button aria-label="Pause Budget guidance" ')}</div>`;
  html=html.replace(/<div class="chat-tools">[\s\S]*?<\/div>(?=<form class="chat-entry")/,toolbar);
  html=html.replace('aria-label="Ask your money" placeholder="Ask your money…"','aria-label="Your Budget reply" placeholder="Tell Lumo about your costs…"');
  html=html.replace(/<p class="tiny muted chat-boundary">[\s\S]*?<\/p>/,'<p class="tiny muted chat-boundary">Draft only · Review before saving. No money moves.</p>');
 }else{
  html=html.replace('<div class="chat-tools">',`<div class="budget-guide-resume">${B('Continue Budget draft','L.budgetGuide.resume()','text-btn')}</div><div class="chat-tools">`);
 }
 return html;
};
L.budgetGuideUI=true;
})();
