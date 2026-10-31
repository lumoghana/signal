/* First-Budget explanation only. Existing drafts, fixed categories, review and
   Save controllers still own every commitment and all account balances. */
(()=>{
'use strict';
if(!window.L||L.hibiscusBudgetClarity)return;
const E=L.e,M=L.money;
const allowed=()=>!!L.state.onboarded&&!L.state.locked&&!L.state.closed;
const firstBudget=()=>allowed()&&!L.budgetOverview?.summary?.().groups.length&&!L.state.planDraft;
const plan=L.views.plan;
L.views.plan=function(...args){
 const html=plan.apply(this,args);if(!firstBudget())return html;
 const intro='<div class="budget-start-copy" data-budget-start><h3>Start with one cost.</h3><p>Tell Lumo what this money needs to cover, like food or transport. It checks these costs before you pay.</p><p class="budget-start-note">A Budget doesn’t move or lock your money. Add more items when you’re ready.</p></div>';
 return html.replace(/<div class="budget-summary plan-hub-summary budget-overview-summary">[\s\S]*?<p class="plan-hub-empty">[\s\S]*?<\/p><\/div>/,intro);
};
const benefit=L.views.planBenefit;
L.views.planBenefit=function(...args){
 let html=benefit.apply(this,args);if(!allowed())return html;
 const sample=L.samplePauseImpact();
 html=html.replace(/<p class="plan-benefit-intro">[\s\S]*?<\/p>/,'<p class="plan-benefit-intro">A Budget tells Lumo what your Everyday money needs to cover. Start with one cost, then add more when you’re ready.</p>');
 html=html.replace(/<p class="budget-guide-benefit">[\s\S]*?<\/p>/,'<p class="budget-guide-benefit">Before you pay, Lumo checks whether those costs would stay covered.</p>');
 html=html.replace(/<p class="plan-benefit-footnote">[\s\S]*?<\/p>/,'<p class="plan-benefit-footnote">Saving a Budget doesn’t move or lock your money. Money Boxes are separate savings.</p>');
 const example=`<aside class="budget-clarity-example" data-budget-example aria-label="Budget example, not your money"><span class="budget-clarity-example-label">Example only · not your money</span><p>${M(sample.available)} available − ${M(sample.essentialsBefore)} Budget = <strong>${M(sample.roomBefore)} left.</strong></p><p>Considering an extra ${M(sample.amount)} purchase?</p><strong class="budget-clarity-example-consequence">${E(sample.headline)}</strong></aside>`;
 return html.replace(/<details class="optional-fields plan-benefit-example">[\s\S]*?<\/details>/,example);
};
L.hibiscusBudgetClarity=true;
})();
