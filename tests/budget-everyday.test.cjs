/* Shared Budget behavior: optional purpose learning, reviewed fresh cycles and
   confirmed-credit proposals. Uses the actual prototype and DOM controller. */
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {createHarness}=require('./helpers/task-sheet-dom.cjs');
const dist=path.resolve(__dirname,'../dist');
const modules=require('./helpers/shipped-entry.cjs').scripts(require('node:path').resolve(__dirname,'..'));
if(!modules.includes('budget-everyday.js'))modules.push('budget-everyday.js');
let count=0;
const check=(name,fn)=>{fn();console.log('PASS '+name);count++;};
const copy=x=>JSON.parse(JSON.stringify(x));
const view=h=>h.document.getElementById('view');
const clean=h=>assert.deepEqual(h.errors,[]);
function fixture(testing=false){
 const h=createHarness({clock:true,testing,modules}),{L}=h;L.explore();
 Object.assign(L.state,{balance:600,txs:[],paymentDraft:null,categoryRules:[],budgetPurposeRules:[],budgetCycleDraft:null,budgetCycle:null,budgetCycles:[],budgetIncomeReview:null,budgetPrompt:null,onboardingFunding:null,fundingDraft:null,bankFunding:null,planDraft:null,
 essentials:[{id:'food',name:'Food',amount:200,paid:0},{id:'transport',name:'Transport',amount:100,paid:0},{id:'study',name:'Study',amount:50,paid:0}],goals:[{id:'laptop',name:'Laptop',allocated:100,target:3500,boxVersion:2}],planSaved:true,planHorizon:{mode:'unspecified',date:''}});
 L.route='home';L.params={};L.history=[];L.save();L.render();h.flush();return h;
}
const start=(h,amount=80)=>{h.L.pickMerchant('AK01');h.flush();h.set('payment-amount',amount);};
function pay(h,outcome='Completed'){
 const {L}=h;L.preparePayment();h.flush();
 if(L.route==='pause'){h.advance(3900);view(h).querySelector('[data-pause-hold]').click();h.advance(90);h.flush();}else L.continuePayment();
 assert.equal(L.route,'authorize');h.set('payment-pin','123456');if(L.testMode)h.set('payment-outcome',outcome);L.authorizePayment();h.flush();return L.state.txs[0];
}
function bank(h,amount){const {L}=h;L.openFunding();L.startBankFunding();h.set('bank-test-amount',amount);L.simulateBankReceipt();h.flush();return L.state.txs[0];}
check('known merchant suggests one matching Budget item without changing purpose, coverage or money',()=>{
 const h=fixture(),{L}=h;start(h);const before=copy({balance:L.state.balance,costs:L.state.essentials});
 assert.equal(L.state.paymentDraft.essentialId,'');assert.equal(L.budgetEveryday.suggestion().id,'food');assert.match(view(h).textContent,/Use & remember/);
 assert.deepEqual(copy({balance:L.state.balance,costs:L.state.essentials}),before);assert.equal(L.state.budgetPurposeRules.length,0);clean(h);
});
check('ambiguous or mixed Budget labels abstain and a category-only correction never fulfils a cost',()=>{
 const h=fixture(),{L}=h;L.state.essentials.push({id:'food-other',name:'Lunch',amount:50,paid:0});start(h);
 assert.equal(L.budgetEveryday.suggestion(),null);L.state.essentials=[{id:'combined',name:'Food and transport',amount:350,paid:0}];L.render();assert.equal(L.budgetEveryday.suggestion(),null);
 L.chooseDraftCategory('Food');assert.equal(L.state.paymentDraft.essentialId,'');assert.equal(L.balances().essentials,350);clean(h);
});
check('one tap opts into source learning, but only confirmed payment saves it; linked expense counts once',()=>{
 const h=fixture(),{L}=h;start(h);assert.equal(L.acceptBudgetPurpose('food'),true);assert.equal(L.state.paymentDraft.essentialId,'food');assert.equal(L.state.budgetPurposeRules.length,0);
 const t=pay(h);assert.equal(t.status,'success');assert.equal(L.state.balance,520);assert.equal(L.balances().essentials,270);assert.equal(L.balances().room,250);
 assert.equal(L.state.budgetPurposeRules.length,1);assert.equal(L.state.budgetPurposeRules[0].approvedTxId,t.id);
 L.finishPayment();h.flushHistory();start(h,40);assert.equal(L.state.paymentDraft.essentialId,'food');assert.match(view(h).textContent,/Your saved choice/);
 h.set('payment-essential','');L.render();assert.equal(L.state.paymentDraft.essentialId,'');assert.equal(h.document.getElementById('payment-amount').value,'40');clean(h);
});
check('cancellation and failed payment do not save a rule; pending learns only after confirmed success',()=>{
 for(const outcome of ['Failed','Pending']){
  const h=fixture(true),{L}=h;start(h);L.acceptBudgetPurpose('food');const t=pay(h,outcome);assert.equal(L.state.budgetPurposeRules.length,0);assert.equal(L.state.balance,600);
  if(outcome==='Pending'){L.resolveTx(t.id,'success');assert.equal(L.state.budgetPurposeRules.length,1);assert.equal(L.state.balance,520);L.resolveTx(t.id,'success');assert.equal(L.state.balance,520);}
  else{L.resolveTx(t.id,'success');assert.equal(L.state.budgetPurposeRules.length,0);}
  clean(h);
 }
 const h=fixture(),{L}=h;start(h);L.acceptBudgetPurpose('food');L.finishPayment();assert.equal(L.state.budgetPurposeRules.length,0);assert.equal(L.state.balance,600);clean(h);
});
check('ordinary source selection remains editable and is not remembered without consent',()=>{
 const h=fixture(),{L}=h;start(h);h.set('payment-essential','food');assert.match(view(h).textContent,/Remember this source/);pay(h);assert.equal(L.state.budgetPurposeRules.length,0);clean(h);
});
check('saved source is not applied when exhausted, deleted, renamed, ended or ambiguous',()=>{
 for(const kind of ['exhausted','deleted','renamed','ended','ambiguous']){
  const h=fixture(),{L}=h;start(h);L.acceptBudgetPurpose('food');pay(h);L.finishPayment();h.flushHistory();
  const r=L.state.budgetPurposeRules[0];
  if(kind==='exhausted')L.markEssentialCoveredOutside('food');
  if(kind==='deleted')L.state.essentials=L.state.essentials.filter(x=>x.id!=='food');
  if(kind==='renamed')L.state.essentials[0].name='Shopping';
  if(kind==='ended')L.state.planHorizon={mode:'date',date:'2020-01-01'};
  if(kind==='ambiguous')L.state.budgetPurposeRules.push({...r,sourceId:'transport',sourceName:'transport'});
  start(h,40);assert.equal(L.state.paymentDraft.essentialId,'',kind);clean(h);
 }
});
check('fresh-cycle flow is reachable in Plan and retains entered dates and amounts after close',()=>{
 const h=fixture(),{L}=h;L.go('plan');assert.match(view(h).textContent,/Use this budget again/);L.openBudgetCycle();assert.equal(L.taskSheet.active,true);assert.equal(L.route,'budgetCycle');
 h.set('cycle-amount-0','220.50');const draft=L.state.budgetCycleDraft;L.back();h.flushHistory();L.openBudgetCycle();assert.equal(L.state.budgetCycleDraft,draft);assert.equal(h.document.getElementById('cycle-amount-0').value,'220.50');assert.equal(L.state.balance,600);clean(h);
});
check('cycle confirmation creates fresh IDs, preserves history and savings, and prevents old coverage carrying over',()=>{
 const h=fixture(),{L}=h;start(h);L.acceptBudgetPurpose('food');const paid=pay(h);L.finishPayment();h.flushHistory();const funds=copy({balance:L.state.balance,goals:L.state.goals}),oldIds=L.state.essentials.map(x=>x.id),txs=copy(L.state.txs),rule=L.state.budgetPurposeRules[0];
 L.openBudgetCycle();L.reviewBudgetCycle();assert.equal(L.route,'budgetCycleReview');assert.equal(L.state.essentials[0].id,'food');L.confirmBudgetCycle();h.flush();
 assert.equal(L.state.budgetCycleDraft,null);assert(L.state.essentials.every(x=>!oldIds.includes(x.id)));assert.equal(L.balances().essentials,350);assert.equal(L.state.essentials[0].paid,0);
 assert.deepEqual(copy(L.state.txs),txs);assert.deepEqual(copy({balance:L.state.balance,goals:L.state.goals}),funds);assert.equal(L.state.budgetCycles[0].costs[0].id,'food');assert.equal(paid.essentialId,'food');
 assert.notEqual(L.state.budgetPurposeRules[0].sourceId,rule.sourceId);assert.equal(L.state.budgetPurposeRules[0].approvedTxId,paid.id);clean(h);
});
check('a pending linked payment blocks fresh-cycle confirmation, preserving its costs and held balance',()=>{
 const h=fixture(true),{L}=h;start(h);L.acceptBudgetPurpose('food');pay(h,'Pending');L.finishPayment();h.flushHistory();const before=copy({essentials:L.state.essentials,balance:L.state.balance,txs:L.state.txs});
 L.openBudgetCycle();L.reviewBudgetCycle();assert.equal(L.route,'budgetCycle');assert.match(view(h).textContent,/still pending/);L.confirmBudgetCycle();assert.deepEqual(copy({essentials:L.state.essentials,balance:L.state.balance,txs:L.state.txs}),before);clean(h);
});
check('incomplete setup drafts stay recoverable and cannot reintroduce old cost IDs through a fresh cycle',()=>{
 const h=fixture(),{L}=h;L.state.planDraft={step:'firstEssentials',essentials:copy(L.state.essentials),goals:[],allowance:copy(L.state.allowance),planHorizon:copy(L.state.planHorizon),essentialFields:{name:'Laundry',amount:'40'}};const saved=copy(L.state.planDraft);
 L.openBudgetCycle();L.reviewBudgetCycle();assert.equal(L.route,'budgetCycle');assert.match(view(h).textContent,/Finish your saved budget setup/);assert.deepEqual(copy(L.state.planDraft),saved);assert.equal(L.state.essentials[0].id,'food');L.resumeBudgetSetupDraft();assert.equal(L.route,'firstEssentials');assert(L.state.budgetCycleDraft);clean(h);
});
check('invalid dates, fractional pennies and stale budget edits cannot replace the active budget',()=>{
 const h=fixture(),{L}=h;L.openBudgetCycle();h.set('cycle-end','2020-01-01');L.reviewBudgetCycle();assert.equal(L.route,'budgetCycle');assert.match(view(h).textContent,/end date/);
 h.set('cycle-end',L.state.budgetCycleDraft.start);h.set('cycle-amount-0','10.001');L.reviewBudgetCycle();assert.match(view(h).textContent,/decimal places/);
 h.set('cycle-amount-0','200');L.reviewBudgetCycle();assert.equal(L.route,'budgetCycleReview');L.state.essentials[0].amount=201;L.confirmBudgetCycle();assert.equal(L.state.essentials[0].amount,201);assert.match(view(h).textContent,/budget changed/);clean(h);
});
check('confirmed incoming allocation proposal never moves or locks money and uses existing savings action',()=>{
 const h=fixture(),{L}=h;L.savingRules={cta:id=>`<button type="button" data-saving="${id}">Review a saving</button>`};const t=bank(h,600);assert.equal(L.route,'bankAdd');L.fundingDone();assert.equal(L.route,'budgetAfterFunding');
 assert.match(view(h).textContent,/Your saved budget stays in place/);assert.match(view(h).textContent,/Review a saving/);const before=copy({balance:L.state.balance,goals:L.state.goals,essentials:L.state.essentials});
 L.keepIncomeBudget();h.flushHistory();assert.equal(L.route,'home');assert.equal(t.budgetPromptHandled,true);assert.deepEqual(copy({balance:L.state.balance,goals:L.state.goals,essentials:L.state.essentials}),before);clean(h);
});
check('routine top-ups do not repeat setup after active Budget reviewed; ended periods still offer review',()=>{
 const h=fixture(),{L}=h;bank(h,100);L.fundingDone();L.keepIncomeBudget();h.flushHistory();const t=bank(h,5);L.fundingDone();h.flushHistory();assert.equal(L.route,'home');assert.equal(t.budgetPromptHandled,true);
 L.state.planHorizon={mode:'date',date:'2020-01-01'};const second=bank(h,20);L.fundingDone();assert.equal(L.route,'budgetAfterFunding');assert.match(view(h).textContent,/Review a fresh budget/);assert.notEqual(second.budgetPromptHandled,true);clean(h);
});
check('unconfirmed income and internal box movement cannot open allocation, and payment top-ups retain payment return',()=>{
 const h=fixture(),{L}=h;for(const status of ['pending','failed']){L.state.txs.unshift({id:status,type:'in',status,amount:100});assert.equal(L.openIncomePlan(status),false);}
 L.state.txs.unshift({id:'box',type:'in',status:'success',amount:100,internal:true});assert.equal(L.openIncomePlan('box'),false);
 L.state.txs.unshift({id:'repay',type:'in',status:'success',amount:100,sharedExpenseRepayment:true});assert.equal(L.openIncomePlan('repay'),false);
 L.state.paymentDraft={id:'retain',method:'lumo',name:'Abena',recipient:'abena',destination:'@abena.a',amount:80,fee:0,note:''};L.openFunding('paymentReview');L.startBankFunding();h.set('bank-test-amount','50');L.simulateBankReceipt();L.fundingDone();h.flushHistory();assert(['paymentReview','pause'].includes(L.route));assert.equal(L.state.paymentDraft.id,'retain');assert.equal(L.state.paymentDraft.amount,80);clean(h);
});
check('first-ever funding still offers the existing resumable progressive budget setup',()=>{
 const h=fixture(),{L}=h;L.state.essentials=[];L.state.planSaved=false;L.state.planDraft={step:'firstEssentials',essentials:[],goals:[],allowance:{amount:0,date:''},planHorizon:{mode:'unspecified',date:''}};L.beginFirstFunding();L.startBankFunding();h.set('bank-test-amount',600);L.simulateBankReceipt();assert.equal(L.route,'budgetAfterFunding');assert.match(view(h).textContent,/Continue budget/);L.beginFundedBudget();assert.equal(L.route,'firstEssentials');assert(L.state.planDraft);clean(h);
});
check('discarding a fresh-period draft cannot restore its fields into the next draft',()=>{
 const h=fixture(),{L}=h;L.openBudgetCycle();h.flush();const first=L.state.budgetCycleDraft.id;h.set('cycle-amount-0','175');h.set('cycle-include-1',false);L.closeTask();h.flushHistory();h.flush();L.openBudgetCycle();h.flush();assert.equal(L.state.budgetCycleDraft.id,first);assert.equal(h.document.getElementById('cycle-amount-0').value,'175');
 L.discardBudgetCycle();h.flush();L.openBudgetCycle();h.flush();assert.notEqual(L.state.budgetCycleDraft.id,first);assert.equal(h.document.getElementById('cycle-amount-0').value,'200');assert.equal(h.document.getElementById('cycle-include-1').checked,true);assert.equal(L.state.essentials[0].amount,200);clean(h);
});
console.log(count+' Budget daily-use checks passed.');
