/* Shared budget presentation and savings-link safety. No layout claims. */
const assert=require('node:assert/strict');
const {createHarness}=require('./helpers/task-sheet-dom.cjs');
let passed=0;
const check=(name,fn)=>{fn();passed++;console.log('PASS '+name);};
function fixture(){
 const h=createHarness({modules:['core.js','two-account-engine.js','pause-engine.js','plan-impact.js','payments.js','app.js','decision-system.js','clarity-pause.js']});
 const {L}=h;
 Object.assign(L.state,{onboarded:true,locked:false,balance:600,txs:[],essentials:[{id:'food',name:'Food and transport',amount:350,paid:0}],goals:[{id:'laptop',name:'Laptop',target:3500,allocated:0}]});
 delete L.state.accounts;L.ensureAccounts();
 L.state.paymentDraft={id:'draft',method:'lumo',name:'Abena',destination:'@abena',amount:280,fee:0,checked:true};
 return h;
}
check('Budget comparison gives the current operational shortfall without a zero goal row',()=>{
 const {L}=fixture();
 const p=L.planImpactSummary(L.state.paymentDraft),comparison=L.pauseComparison(p),html=L.pauseComparisonMarkup(p);
 assert.equal(comparison.label,'Budget coverage');
 assert.equal(comparison.before,350);assert.equal(comparison.after,320);
 assert(html.includes('Budget shortfall'));assert(html.includes('GH₵30.00'));
 assert(!html.includes('Money set aside for goals'));assert(!html.includes('Goal allocations'));
 assert(html.includes('Projected operational balance'));assert(html.includes('These figures are a preview. Nothing has been sent.'));
});
check('Compact entry copy shares the same shortfall and budget vocabulary',()=>{
 const {L}=fixture();
 const p=L.planImpactSummary(L.state.paymentDraft);
 assert.equal(L.entryConsequenceText(p),'GH₵30.00 short for your budget');
 assert.equal(L.entryConsequenceText(L.planImpactSummary({...L.state.paymentDraft,amount:140})),'GH₵110.00 left after budget');
});
check('A payment can link to an existing budget item using the current label',()=>{
 const {L}=fixture(),html=L.paymentPlanLinkFields(L.state.paymentDraft);
 assert(html.includes('<span>Pay from</span>'));assert(html.includes('Left after budget · '));
 assert(html.includes('value="food"'));assert(html.includes('All use your operational account.'));
});
check('A Money Box transfer cannot fulfil a budget item through the UI or a direct action',()=>{
 const {L}=fixture();
 L.state.paymentDraft={...L.state.paymentDraft,method:'box',boxId:'laptop',boxDirection:'in',essentialId:''};
 const before=JSON.stringify(L.state),route=L.route;
 assert.equal(L.paymentPlanLinkFields(L.state.paymentDraft),'');
 L.openPaymentPlanLink();L.savePaymentPlanLink();
 assert.equal(L.route,route);assert.equal(JSON.stringify(L.state),before);
 const comparison=L.pauseComparisonMarkup(L.planImpactSummary(L.state.paymentDraft));
 assert(comparison.includes('Transfer amount'));assert(comparison.includes('After transfer · projected'));assert(comparison.includes('Nothing has been moved.'));
});
check('Budget-item editing retains the working field IDs with customer-facing budget language',()=>{
 const {L}=fixture();L.params={id:'food'};
 const edit=L.views.essentialEdit(),list=L.views.essentials();
 assert(edit.includes('Edit budget item'));assert(edit.includes('id="essName"'));assert(edit.includes('Save budget item'));
 assert(edit.includes('Saving a budget item doesn’t pay anyone or move money.'));
 assert(list.includes('Your budget items'));assert(list.includes('Add a budget item'));
});
console.log(passed+' budget presentation and link checks passed.');
