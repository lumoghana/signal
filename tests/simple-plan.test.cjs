/* Two-step planning through the shipped index and mounted task controller.
   These checks establish behavior and saved facts, not rendered phone fit. */
const assert=require('node:assert/strict');
const vm=require('node:vm');
const {createHarness}=require('./helpers/task-sheet-dom.cjs');
const copy=value=>JSON.parse(JSON.stringify(value));
const KEY='lumo-minna-edition-v1';
let passed=0;
const check=(name,run)=>{run();passed++;console.log('PASS '+name);};
const view=h=>h.document.getElementById('view');
const savedFacts=L=>copy({balance:L.state.balance,txs:L.state.txs,allowance:L.state.allowance,essentials:L.state.essentials,goals:L.state.goals,planHorizon:L.state.planHorizon,planSaved:L.state.planSaved,paymentDraft:L.state.paymentDraft});
const clean=h=>assert.deepEqual(h.errors,[],'No actual-index rendering or interaction errors');
function fixture(patch={}){
 const h=createHarness(),{L}=h;L.explore();
 Object.assign(L.state,{balance:600,txs:[],essentials:[],goals:[],allowance:{amount:0,date:'',source:'Family'},planHorizon:{mode:'unspecified',date:''},planDraft:null,planSaved:false,paymentDraft:null,chats:[],...patch});
 L.balances();L.route='home';L.params={};L.history=[];L.save();L.render();h.flush();return h;
}
function action(h,code){const button=view(h).querySelectorAll('button').find(el=>el.getAttribute('onclick')===code);assert(button,'Working '+code+' action on '+h.L.route);button.focus();button.click();h.flush();return button;}
function start(h){h.L.openPlanBenefit();h.flush();assert.equal(h.L.route,'planBenefit');action(h,'L.buildPlanFromBenefit()');assert.equal(h.L.route,'firstEssentials');assert(h.L.taskSheet.active);return view(h);}
// The lightweight DOM dispatches events but does not evaluate inline input
// attributes. Execute the shipped handler, rather than call a guessed API.
function type(h,id,value){const field=h.set(id,value),handler=field.getAttribute('oninput');assert(handler,'Live input handler on '+id);vm.runInContext(handler,h.context);h.flush();return field;}
function cost(h,name,amount){type(h,'firstEssName',name);type(h,'firstEssAmount',amount);}
function review(h){action(h,'L.reviewFirstPlanCosts()');assert.equal(h.L.route,'firstPlanReview');return view(h);}
function reviewValue(h,label){
 const term=view(h).querySelectorAll('dt').find(el=>el.textContent===label);
 if(term)return term.parentElement.querySelector('dd')?.textContent;
 const conclusion=view(h).querySelector('[data-plan-preview]');assert(conclusion?.querySelector('span')?.textContent===label,'Visible review fact '+label);return conclusion.querySelector('strong')?.textContent;
}
function close(h){h.document.querySelector('.task-sheet-close').click();h.flush();}
function resume(h){h.L.openPlanBenefit();h.flush();assert.equal(h.L.route,'firstEssentials');}
function reload(persisted){const h=createHarness();h.L.state=copy(persisted);h.L.route='home';h.L.params={};h.L.history=[];h.L.render();h.flush();return h;}

check('the new plan goes costs → review and saves the real plan only on confirmation',()=>{
 const paymentDraft={id:'keep-payment',amount:'12.34',method:'lumo',name:'Ama'},h=fixture({paymentDraft}),{L}=h,before=savedFacts(L);
 h.activations.length=0;start(h);assert.equal(h.activations.length,1,'Start with one cost is one real button click');assert(!h.document.getElementById('firstAllowance'));assert(!h.document.getElementById('firstGoalName'));const progress=view(h).querySelector('[role="progressbar"]');assert(progress);assert.equal(progress.getAttribute('aria-valuemax'),'2');assert.equal(progress.getAttribute('aria-valuenow'),'1');
 cost(h,'Food',200);assert(h.document.getElementById('first-cost-preview').textContent.includes('GH₵400.00'));type(h,'firstEssAmount',160);assert(h.document.getElementById('first-cost-preview').textContent.includes('GH₵440.00'));type(h,'firstEssAmount',200);assert.equal(h.activations.length,1,'Typing is excluded from the button count');assert.equal(L.state.planDraft.essentials.length,0,'The live preview does not add a cost');review(h);assert.equal(h.activations.length,2);assert.equal(view(h).querySelector('[role="progressbar"]').getAttribute('aria-valuenow'),'2');assert.deepEqual(savedFacts(L),before);assert.equal(L.state.planDraft.essentials.length,1);assert.equal(reviewValue(h,'Available balance'),'GH₵600.00');assert.equal(reviewValue(h,'Essentials to cover'),'GH₵200.00');assert.equal(reviewValue(h,'Left after your plan'),'GH₵400.00');
 action(h,'L.saveFirstPlan()');assert.equal(h.activations.length,3,'Benefit Start → Review → Save takes three actual button activations');assert.deepEqual(h.activations.map(item=>item.action),['L.buildPlanFromBenefit()','L.reviewFirstPlanCosts()','L.saveFirstPlan()']);assert.equal(L.route,'home');assert.equal(L.taskSheet.active,false);assert.equal(L.state.planDraft,null);assert.equal(L.state.planSaved,true);assert.equal(L.state.essentials.length,1);assert.equal(L.state.essentials[0].amount,200);assert.equal(L.state.balance,600);assert.equal(L.state.txs.length,0);assert.deepEqual(copy(L.state.paymentDraft),paymentDraft);assert.equal(L.state.allowance.amount,0);assert.equal(L.state.goals.length,0);clean(h);
 const quick=fixture();quick.activations.length=0;start(quick);const suggestion=view(quick).querySelectorAll('button').find(button=>(button.getAttribute('onclick')||'').startsWith('L.firstPlanSelectCost(')&&button.textContent.trim()==='Food');assert(suggestion);suggestion.click();quick.flush();type(quick,'firstEssAmount',200);review(quick);action(quick,'L.saveFirstPlan()');assert.equal(quick.activations.length,4,'Choosing a suggested cost adds exactly one button activation');assert.equal(quick.L.state.essentials[0].name,'Food');assert.equal(quick.L.state.essentials[0].amount,200);clean(quick);
});

check('Food, Transport and Data suggestions fill a name without inventing or committing an amount',()=>{
 const h=fixture(),{L}=h;start(h);assert.equal(h.document.getElementById('firstEssAmount').value,'');h.set('firstEssAmount','125.50');
 for(const name of ['Food','Transport','Data']){const button=view(h).querySelectorAll('button').find(el=>(el.getAttribute('onclick')||'').startsWith('L.firstPlanSelectCost(')&&el.textContent.trim()===name);assert(button,'Visible '+name+' suggestion');button.click();h.flush();assert.equal(h.document.getElementById('firstEssName').value,name);assert.equal(h.document.getElementById('firstEssAmount').value,'125.50');assert.equal(L.state.planDraft.essentials.length,0);assert.equal(L.state.essentials.length,0);}
 assert.equal(L.state.balance,600);assert.equal(L.state.txs.length,0);clean(h);
});

check('empty or invalid costs cannot advance or save a pretend plan',()=>{
 for(const [name,amount] of [['',''],['',20],['Food',''],['Food',0],['Food',-1],['Food','1.234'],['Food','Infinity'],['Food','oops']]){
  const h=fixture(),{L}=h;start(h);cost(h,name,amount);action(h,'L.reviewFirstPlanCosts()');assert.equal(L.route,'firstEssentials');assert(view(h).querySelector('#error').textContent);assert.equal(L.state.planDraft.essentials.length,0);L.saveFirstPlan();h.flush();assert.equal(L.state.planSaved,false);assert(L.state.planDraft);assert.equal(L.state.essentials.length,0);assert.equal(L.state.balance,600);clean(h);
 }
});

check('review, returning to edit and repeated calls retain one cost and its original draft ID',()=>{
 const h=fixture(),{L}=h;start(h);cost(h,'Food',200);review(h);const id=L.state.planDraft.essentials[0].id;L.reviewFirstPlanCosts();h.flush();assert.equal(L.state.planDraft.essentials.length,1);
 L.go('firstEssentials');h.flush();L.firstPlanEditEssential(id);h.flush();assert.equal(h.document.getElementById('firstEssName').value,'Food');assert.equal(h.document.getElementById('firstEssAmount').value,'200');h.set('firstEssAmount','175');review(h);assert.equal(L.state.planDraft.essentials.length,1);assert.equal(L.state.planDraft.essentials[0].id,id);assert.equal(L.state.planDraft.essentials[0].amount,175);assert.equal(reviewValue(h,'Essentials to cover'),'GH₵175.00');assert.equal(L.state.essentials.length,0);L.reviewFirstPlanCosts();h.flush();assert.equal(L.state.planDraft.essentials.length,1);clean(h);
});

check('adding one cost explicitly and reviewing the next does not duplicate either item',()=>{
 const h=fixture(),{L}=h;start(h);cost(h,'Food',200);action(h,'L.firstPlanAddEssential()');const first=L.state.planDraft.essentials[0].id;assert.equal(h.document.getElementById('firstEssName').value,'');assert.equal(h.document.getElementById('firstEssAmount').value,'');cost(h,'Transport',150);review(h);assert.equal(L.state.planDraft.essentials.length,2);assert.equal(new Set(L.state.planDraft.essentials.map(item=>item.id)).size,2);assert.equal(L.state.planDraft.essentials[0].id,first);assert.equal(reviewValue(h,'Essentials to cover'),'GH₵350.00');assert.equal(L.state.essentials.length,0);clean(h);
});

for(const dismissal of ['Close','backdrop','browser Back','Finish later','Help and Back'])check(dismissal+' preserves unfinished costs and date through dismissal and a persisted-state reload',()=>{
 const h=fixture(),{L}=h,before=savedFacts(L);start(h);cost(h,'Weekly food','150.50');assert(h.document.getElementById('first-cost-preview').textContent.includes('GH₵449.50'));h.set('firstPlanPeriodMode','date');L.changePlanPeriod();h.flush();const date=new Date(Date.now()+7*86400000).toISOString().slice(0,10);h.set('firstPlanPeriodDate',date);
 if(dismissal==='Close')close(h);else if(dismissal==='backdrop'){h.document.querySelector('.task-sheet-backdrop').click();h.flush();}else if(dismissal==='Finish later')action(h,'L.firstPlanLeave()');else if(dismissal==='browser Back'){for(let tries=0;L.taskSheet.active&&tries<6;tries++){h.history.back();h.flush();}}else{L.go('help',{returnTo:L.route,returnParams:L.params});h.flush();L.back();h.flush();assert.equal(L.route,'firstEssentials');assert.equal(h.document.getElementById('firstEssName').value,'Weekly food');close(h);}
 assert.equal(L.taskSheet.active,false);assert.equal(L.route,'home');assert.deepEqual(savedFacts(L),before);assert.equal(L.state.planDraft.essentialFields.name,'Weekly food');assert.equal(L.state.planDraft.essentialFields.amount,'150.50');assert.equal(L.state.planDraft.planHorizon.date,date);const persisted=JSON.parse(h.store.get(KEY));assert.equal(persisted.planDraft.essentialFields.name,'Weekly food');resume(h);assert.equal(h.document.getElementById('firstEssName').value,'Weekly food');assert.equal(h.document.getElementById('firstEssAmount').value,'150.50');assert.equal(h.document.getElementById('firstPlanPeriodDate').value,date);close(h);
 const recovered=reload(persisted);resume(recovered);assert.equal(recovered.document.getElementById('firstEssName').value,'Weekly food');assert.equal(recovered.document.getElementById('firstEssAmount').value,'150.50');assert.equal(recovered.document.getElementById('firstPlanPeriodDate').value,date);assert(recovered.document.getElementById('first-cost-preview').textContent.includes('GH₵449.50'),'Restored input contributes to the initial preview without another keystroke');assert.equal(recovered.L.state.planDraft.essentials.length,0,'A restored preview does not commit the unfinished cost');assert.deepEqual(savedFacts(recovered.L),before);clean(h);clean(recovered);
});

check('optional expected income and a zero-allocation goal return to review without changing the saved plan early',()=>{
 const h=fixture(),{L}=h,before=savedFacts(L);start(h);cost(h,'Food',100);review(h);L.go('planSetup',{returnTo:'firstPlanReview'});h.flush();h.set('firstAllowance',500);const date=new Date(Date.now()+10*86400000).toISOString().slice(0,10);h.set('firstDate',date);action(h,'L.firstPlanAllowance()');assert.equal(L.route,'firstPlanReview');assert.deepEqual(savedFacts(L),before);assert.equal(L.state.planDraft.allowance.amount,500);assert.equal(L.state.planDraft.allowance.date,date);
 L.go('firstGoal',{returnTo:'firstPlanReview'});h.flush();h.set('firstGoalName','Laptop');h.set('firstGoalTarget',3500);h.set('firstGoalAllocation',0);action(h,'L.firstPlanGoal()');assert.equal(L.route,'firstPlanReview');assert.deepEqual(savedFacts(L),before);assert.equal(L.state.planDraft.goals[0].allocated,0);action(h,'L.saveFirstPlan()');assert.equal(L.state.allowance.amount,500);assert.equal(L.state.allowance.date,date);assert.equal(L.state.goals[0].name,'Laptop');assert.equal(L.state.goals[0].allocated,0);assert.equal(L.state.balance,600);assert.equal(L.balances().available,600);assert.equal(L.balances().room,500);assert.equal(L.state.txs.length,0);clean(h);
});

check('a zero-funded student can save a real uncovered cost without receiving invented money',()=>{
 const h=fixture({balance:0}),{L}=h;start(h);cost(h,'Transport',100);review(h);assert.equal(reviewValue(h,'Available balance'),'GH₵0.00');assert.equal(reviewValue(h,'Essentials to cover'),'GH₵100.00');assert.equal(reviewValue(h,'Left after your plan'),'GH₵0.00');assert(view(h).querySelector('.warning')?.textContent.includes('GH₵100.00'));action(h,'L.saveFirstPlan()');assert.equal(L.route,'home');assert.equal(L.state.balance,0);assert.equal(L.state.txs.length,0);assert.equal(L.state.allowance.amount,0);assert.equal(L.balances().gap,100);assert.equal(L.state.essentials[0].amount,100);clean(h);
});

check('existing essential metadata and unchanged goals survive an underfunded plan edit',()=>{
 const date=new Date(Date.now()+8*86400000).toISOString().slice(0,10),h=fixture({balance:100,planSaved:true,allowance:{amount:800,date,source:'Family'},planHorizon:{mode:'date',date},essentials:[{id:'saved-food',name:'Food',amount:200,paid:25,externalPaid:25,coverageVersion:1,date}],goals:[{id:'laptop',name:'Laptop',target:3000,allocated:60,emoji:'⌘'},{id:'books',name:'Books',target:500,allocated:40,emoji:'book'}]}),{L}=h;
 const original=savedFacts(L);L.go('firstEssentials');h.flush();cost(h,'Data',25);review(h);assert(view(h).querySelector('.warning'));assert.equal(reviewValue(h,'Set aside for goals'),'GH₵100.00');assert.deepEqual(savedFacts(L),original);
 L.go('firstGoal');h.flush();action(h,'L.firstPlanGoal()');assert.equal(L.route,'firstPlanReview','An unchanged existing goal can return to review even when underfunded');assert.deepEqual(copy(L.state.planDraft.goals),original.goals);
 action(h,'L.saveFirstPlan()');assert.equal(L.route,'home');assert.equal(L.state.essentials.length,2);assert.deepEqual(copy(L.state.essentials.find(item=>item.id==='saved-food')),original.essentials[0]);assert.deepEqual(copy(L.state.goals),original.goals);assert.deepEqual(copy(L.state.allowance),original.allowance);assert.deepEqual(copy(L.state.planHorizon),original.planHorizon);assert.equal(L.state.balance,100);assert.equal(L.state.txs.length,0);assert.equal(L.balances().gap,200);clean(h);
});

check('an existing allocated goal can be reviewed without inventing a cost',()=>{
 const h=fixture({planSaved:true,goals:[{id:'laptop',name:'Laptop',target:3000,allocated:100}]}),{L}=h;L.go('firstEssentials');h.flush();review(h);assert.equal(L.state.planDraft.essentials.length,0);assert.equal(reviewValue(h,'Set aside for goals'),'GH₵100.00');action(h,'L.saveFirstPlan()');assert.equal(L.state.essentials.length,0);assert.equal(L.state.goals[0].allocated,100);assert.equal(L.balances().room,500);clean(h);
});

for(const status of ['success','failed'])check('a linked payment resolving '+status+' while the draft is open keeps current coverage and counts it once',()=>{
 const h=fixture({planSaved:true,essentials:[{id:'food',name:'Food',amount:200,paid:0},{id:'transport',name:'Transport',amount:150,paid:0}],goals:[{id:'laptop',name:'Laptop',target:3000,allocated:100}]}),{L}=h;
 const tx=L.addTx({type:'out',status:'pending',amount:80,fee:0,name:'Lunch',essentialId:'food',category:'Food'});L.go('firstEssentials');h.flush();review(h);assert.equal(reviewValue(h,'Available balance'),'GH₵520.00');assert.equal(reviewValue(h,'Essentials to cover'),'GH₵270.00');assert.equal(reviewValue(h,'Left after your plan'),'GH₵150.00');
 L.resolveTx(tx.id,status);L.render();h.flush();const available=status==='success'?520:600,essentials=status==='success'?270:350;assert.equal(reviewValue(h,'Available balance'),L.money(available));assert.equal(reviewValue(h,'Essentials to cover'),L.money(essentials));assert.equal(reviewValue(h,'Left after your plan'),'GH₵150.00');action(h,'L.saveFirstPlan()');assert.equal(L.state.txs.length,1);assert.equal(L.state.balance,available);assert.equal(L.balances().available,available);assert.equal(L.balances().essentials,essentials);assert.equal(L.balances().room,150);assert.equal(L.state.essentials.find(item=>item.id==='food').paid,status==='success'?80:0);clean(h);
});

check('a new allocation is revalidated when available money changes before plan confirmation',()=>{
 const h=fixture(),{L}=h;start(h);cost(h,'Food',100);review(h);L.go('firstGoal',{returnTo:'firstPlanReview'});h.flush();h.set('firstGoalName','Laptop');h.set('firstGoalTarget',3000);h.set('firstGoalAllocation',100);action(h,'L.firstPlanGoal()');assert.equal(L.route,'firstPlanReview');assert.equal(L.state.goals.length,0);
 L.addTx({type:'out',status:'success',amount:450,fee:0,name:'Separate confirmed payment',category:'Transfers'});L.render();h.flush();action(h,'L.saveFirstPlan()');assert.equal(L.route,'firstPlanReview');assert(L.state.planDraft);assert.equal(L.state.planSaved,false);assert.equal(L.state.goals.length,0);assert.equal(L.state.essentials.length,0);assert.equal(L.state.balance,150);assert.equal(L.state.txs.length,1);assert(view(h).querySelector('#error').textContent);
 L.go('firstGoal',{returnTo:'firstPlanReview'});h.flush();h.set('firstGoalAllocation',50);action(h,'L.firstPlanGoal()');action(h,'L.saveFirstPlan()');assert.equal(L.route,'home');assert.equal(L.state.planDraft,null);assert.equal(L.state.goals[0].allocated,50);assert.equal(L.state.balance,150);assert.equal(L.state.txs.length,1);assert.equal(L.balances().room,0);clean(h);
});

console.log(passed+' simple plan checks passed. No rendered-browser or phone-fit claims.');
