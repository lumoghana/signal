/* Explain why a saved plan helps before opening the optional cost-first setup.
   The labelled example is isolated from accounts, plans and payment drafts. */
(()=>{
'use strict';
const M=value=>(L.planMoney||L.money)(value),B=L.btn;
const steps=new Set(['planSetup','firstEssentials','firstPlanReview']);
const example=Object.freeze({available:600,essentials:350,purchase:280});
let openingSetup=false;
const hasPlan=()=>L.hasMeaningfulPlan();
const draftStep=()=>steps.has(L.state.planDraft?.step)?L.state.planDraft.step:'planSetup';
const destination=()=>!L.state.onboarded?'welcome':L.state.closed?'accountInfo':L.state.locked?'signin':'home';
const go=L.go;
// Existing entry points keep working. An unfinished plan always resumes directly.
L.go=(route,params={})=>{
 if(route==='planSetup'&&!openingSetup&&!L.state.planDraft&&!hasPlan())return go('planBenefit',{});
 return go(route,params);
};
L.openPlanBenefit=()=>{
 if(L.state.planDraft)return L.go(draftStep());
 return L.go(hasPlan()?'plan':'planBenefit');
};
L.buildPlanFromBenefit=()=>{
 if(!L.state.onboarded)return L.onboarding?.start?L.onboarding.start():L.go('welcome');
 openingSetup=true;
 try{return L.go(L.state.planDraft?draftStep():'firstEssentials');}
 finally{openingSetup=false;}
};
L.leavePlanBenefit=()=>L.go(destination());
// This public screen shows only fixed sample figures. Real plan setup retains its guard.
const guard=L.guard;
L.guard=()=>{if(['planBenefit','samplePause'].includes(L.route))return;return guard();};
L.views.planBenefit=()=>{
 const p=L.samplePauseImpact();
 return `<section class="plan-benefit simple-plan-benefit" data-illustrated-screen="planBenefit">
 <div class="topline"><button type="button" class="icon-btn" onclick="L.leavePlanBenefit()" aria-label="Back to ${L.state.onboarded?'Lumo':'the start'}">${L.icon('arrowLeft',22)}</button><span class="eyebrow">HOW YOUR BUDGET WORKS</span><span class="pill">Quick guide</span></div>
 <div class="focus-art plan-benefit-art">${L.illustration('pause')}</div>
 <h1>What is a budget?</h1>
 <p class="plan-benefit-intro">A budget lists what your operational account needs to cover, like food, transport and data.</p>
 <h2 class="plan-benefit-uses-heading">Lumo uses your budget to:</h2>
 <ol class="plan-benefit-uses">
 <li><strong>Show what’s left.</strong><p>Your operational balance, minus budget costs still to cover.</p></li>
 <li><strong>Show what a payment changes.</strong><p>Before you pay, see whether your budget would stay covered or fall short.</p></li>
 </ol>
 <p class="plan-benefit-footnote">Creating a budget doesn’t move or lock your money. Money Boxes are separate in Savings.</p>
 <details class="optional-fields plan-benefit-example"><summary>See an example</summary>
 <p class="small muted">Example only · sample money, not your balance.</p>
 <p class="small">${M(example.available)} in your operational account − ${M(example.essentials)} budget = ${M(p.roomBefore)} left after the budget.</p>
 <p class="small">Considering a ${M(example.purchase)} purchase.</p>
 <p class="plan-benefit-example-consequence">${L.e(p.headline)}</p>
 <dl class="plan-benefit-comparison"><div><dt>Budget to cover</dt><dd>${M(example.essentials)}</dd></div><div><dt>Operational account after purchase</dt><dd>${M(p.after)}</dd></div></dl>
 <p class="small">After the ${M(example.purchase)} purchase: ${M(p.after)} in your operational account, leaving the budget ${M(p.essentialGap)} short.</p>
 </details>
 <div class="actions">${B('Start with one cost','L.buildPlanFromBenefit()')}${B('Maybe later','L.leavePlanBenefit()','text-btn')}</div></section>`;
};
// This early example uses the production projection engine with isolated,
// bundled facts. Viewing it never creates an account, plan or payment draft.
L.samplePauseImpact=()=>L.planImpactSummary({amount:example.purchase,fee:0,method:'campus',name:'Sample purchase'}, {
 accounts:{version:2},balance:example.available,txs:[],allowance:{amount:0,date:''},
 essentials:[{id:'sample-food',name:'Food',amount:200,paid:0},{id:'sample-transport',name:'Transport',amount:150,paid:0}],
 goals:[]
},Date.UTC(2026,9,18,12));
L.views.samplePause=()=>{
 const p=L.samplePauseImpact(),back=L.params.returnTo==='ambassadorWelcome'?'ambassadorWelcome':'welcome',signup=L.params.intent==='signup'&&!L.state.onboarded;
 return `<section class="sample-pause" data-illustrated-screen="samplePause"><div class="topline"><button type="button" class="icon-btn" onclick="L.go('${back}')" aria-label="Back to the start">${L.icon('arrowLeft',22)}</button><span class="eyebrow">A SAMPLE PAUSE</span>${signup?B('Skip example','L.onboarding.start()','text-btn sample-pause-skip'):'<span class="pill">Example only</span>'}</div><p class="sample-pause-intro">Example only · see what a payment would change.</p><p class="sample-starting-point"><strong>${M(p.available)} operational balance.</strong> A ${M(p.essentialsBefore)} budget for food and transport.</p><h1>${L.e(p.headline)}</h1><p class="pause-payment-context">Considering a ${M(example.purchase)} purchase.</p>${L.pauseComparisonMarkup(p)}<p class="sample-pause-boundary">Example money, not your balance. Nothing moves. Add your costs later so Lumo can check a payment against your own budget.</p><div class="actions">${B(L.state.onboarded?'Back to Lumo':'Start sign-up',L.state.onboarded?"L.go(L.state.locked?'signin':'home')":'L.onboarding.start()')}${B('Back to the start',`L.go('${back}')`,'text-btn')}</div></section>`;
};
L.views.planExplanation=()=>{
 const b=L.balances(),row=(label,value)=>`<div><dt>${L.e(label)}</dt><dd>${M(value)}</dd></div>`;
 return `<section class="plan-explanation-page" data-illustrated-screen="planExplanation"><h1>What’s left after your budget?</h1><p>${L.e(L.planScopeSummary?.().label||'Uses only your saved budget.')} Other costs aren’t included.</p><dl class="balance-calculation">${row('Available operational balance',b.available)}${row('Budget still to cover',-b.essentials)}${row('Left after your budget',b.room)}</dl>${b.gap?`<p class="warning">${M(b.gap)} of your budget is uncovered.</p>`:''}<p class="small">This figure uses the costs you saved. Money Boxes are already in your savings account, so they are not deducted here. Expected allowance is included only when it arrives.</p><div class="actions">${B('Done','L.taskSheet?.active?L.closeTask():L.back()')}${B('Edit my budget',"L.go('planEdit')",'secondary')}${B('Account breakdown',"L.go('balances')",'text-btn')}</div></section>`;
};
// Editing stays in the current sheet, so Home or a conversation remains in place.
L.views.planEdit=()=>`<section data-illustrated-screen="planEdit">`+L.header('Edit your budget','Choose what your operational money must cover.')+`<div class="destination-list">${L.row('Budget costs','Edit food, transport or another cost','plan',"L.go('essentials')")}${L.row('Budget period',L.planPeriodActionLabel(),'plan',"L.go('planPeriod')")}${L.row('Expected money','An estimate, not money received','arrowDown',"L.go('allowance')")}</div><div class="actions">${B('Close','L.taskSheet?.active?L.closeTask():L.back()','text-btn')}</div></section>`;

})();
