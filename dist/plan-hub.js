/* One Plan destination, two distinct jobs. Budget checks operational money;
   Money Boxes hold savings. Navigation and financial authority stay unchanged. */
(()=>{
'use strict';
const E=L.e,M=L.money,B=L.btn;
const top=()=>`<div class="topline plan-hub-top"><span class="wordmark wordmark-small"><img class="actual-wordmark lumo-wordmark-asset" src="/brand/Lumo-Wordmark-Black.svg" alt="Lumo"></span><span class="eyebrow">Plan</span>${B(L.icon('help',21),"L.go('help',{returnTo:'plan'})",'icon-btn').replace('<button ','<button aria-label="Get help" ')}</div>`;
const setupSteps=new Set(['planSetup','firstEssentials','firstPlanReview']);
L.views.plan=()=>{
 const s=L.state,b=L.balances(),a=L.accountBalances(),has=L.hasMeaningfulPlan(s);
 const boxes=s.goals.filter(box=>!box.archived),count=boxes.length;
 const start=setupSteps.has(s.planDraft?.step)?s.planDraft.step:'planSetup';
 const budgetActions=has
  ?`${B('Edit budget',"L.go('planEdit')")}${B('Add a budget item',"L.go('essentialEdit')",'secondary')}`
  :`${B(s.planDraft?'Continue budget':'Create a budget',`L.go('${E(start)}')`)}`;
 const budgetSummary=has
  ?`<div class="budget-summary plan-hub-summary"><span>Left after budget</span><strong class="plan-hub-amount">${L.balanceNumber(b.room)}</strong><p class="plan-hub-facts">${M(b.essentials)} of everyday costs still to cover.</p>${b.gap?`<p class="plan-hub-shortfall">${L.icon('help',16)} ${M(b.gap)} of your budget is uncovered.</p>`:''}</div>`
  :`<p class="plan-hub-empty">Cover food, transport and other costs.</p>`;
 return `<section class="plan-hub account-budget-page" data-illustrated-screen="plan">
 ${top()}<div class="plan-hub-heading"><h1>Your plan.</h1></div>
 <section class="plan-budget-section" aria-labelledby="plan-budget-title">
 <div class="plan-section-heading"><span class="plan-section-icon" aria-hidden="true">${L.icon('plan',22)}</span><div><h2 id="plan-budget-title">Budget</h2><span>Operational account</span></div></div>
 ${budgetSummary}<div class="plan-hub-actions">${budgetActions}</div>
 <details class="plan-hub-details"><summary>${has?'Budget details':'Budget tools'} ${L.icon('chevron',16)}</summary><div class="plan-hub-detail-actions">${has?`${L.row('Budget period',L.planPeriodActionLabel(),'plan',"L.go('planPeriod')")}${L.row('See the calculation','Uses only your saved budget costs','help',"L.go('planExplanation')")}${L.row('Expected money','Excluded until it arrives','arrowDown',"L.go('allowance')")}`:B('How it works',"L.openPlanBenefit()",'text-btn')}</div></details>
 </section>
 <section class="plan-boxes-section budget-savings-link" aria-labelledby="plan-boxes-title">
 <div class="plan-section-heading"><span class="plan-section-icon" aria-hidden="true">${L.icon('target',22)}</span><div><h2 id="plan-boxes-title">Money Boxes</h2><span>Savings account</span></div></div>
 <div class="plan-hub-summary plan-boxes-summary"><strong class="plan-hub-amount">${L.balanceNumber(a.savings)}</strong><p class="plan-hub-facts">${count?`${count} Money Box${count===1?'':'es'}${a.savingsHeld?' · transfer in progress':''}`:'A laptop, a trip or a little backup.'}</p></div>
 <div class="plan-hub-actions">${count?B('View Money Boxes',"L.go('goals')",'secondary'):''}${B(count?'Add a box':'Create a Money Box',"L.go('goalEdit')",'secondary')}</div>

 </section></section>`;
};
})();
