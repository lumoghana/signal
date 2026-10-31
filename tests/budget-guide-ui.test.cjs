/* Guided Budget controls through the shipped screen adapters. */
const assert=require('node:assert/strict');
const {createHarness}=require('./helpers/task-sheet-dom.cjs');
const clone=x=>JSON.parse(JSON.stringify(x));
let count=0;const check=(name,fn)=>{fn();count++;console.log('PASS '+name);};
const view=h=>h.document.getElementById('view');
const facts=L=>JSON.stringify([L.state.balance,L.state.essentials,L.state.goals,L.state.txs,L.state.paymentDraft,L.state.allowance,L.state.planHorizon]);
function fixture(patch={}){
 const h=createHarness({clock:true}),{L}=h;L.explore();L.ensureAccounts();
 Object.assign(L.state,{balance:500,txs:[],chats:[],paymentDraft:null,planSaved:false,planDraft:null,budgetCycleDraft:null,budgetHistoryDraft:null,budgetGuideSession:null,firstBudgetPayoff:null,
  essentials:[],goals:[{id:'laptop',name:'Laptop',target:3000,allocated:100,boxVersion:2}],allowance:{amount:0,date:'',source:'Family'},planHorizon:{mode:'unspecified',date:''},...patch});
 L.openTab('plan');L.go('planBenefit');h.flush();return h;
}
function click(h,label){const b=view(h).querySelectorAll('button').find(x=>x.textContent.trim()===label);assert(b,'Working '+label+' on '+h.L.route);b.click();h.flush();return b;}
const clean=h=>assert.deepEqual(h.errors,[]);
check('the Budget introduction explains its job and offers guided or direct entry',()=>{
 const h=fixture(),before=facts(h.L),root=view(h);assert.match(root.textContent,/Everyday money needs to cover/);assert.match(root.textContent,/doesn’t move or lock/);
 assert.equal(root.querySelectorAll('button').filter(b=>b.textContent==='Build it with Lumo').length,1);assert.equal(root.querySelectorAll('button').filter(b=>b.textContent==='Enter it myself').length,1);
 assert.equal(facts(h.L),before);clean(h);
});
check('direct entry retains the existing editor and replaces decoration with a working Chat handoff',()=>{
 const h=fixture(),before=facts(h.L);click(h,'Enter it myself');assert.equal(h.L.route,'firstEssentials');assert(view(h).querySelector('.budget-guide-handoff'));
 assert.equal(view(h).querySelector('.simple-plan-art'),null);assert(view(h).querySelectorAll('button').some(b=>b.textContent.trim()==='Continue in Chat'));
 assert(h.document.getElementById('firstEssName'));assert(h.document.getElementById('firstEssAmount'));assert.equal(facts(h.L),before);clean(h);
});
check('guided entry opens the full conversation with one compact draft toolbar',()=>{
 const h=fixture(),before=facts(h.L);click(h,'Build it with Lumo');assert.equal(h.L.route,'chat');assert(h.L.state.planDraft);assert(h.L.state.budgetGuideSession);
 assert.equal(h.document.querySelectorAll('[role="dialog"]').length,0);assert.equal(view(h).querySelectorAll('.budget-guide-toolbar').length,1);assert.equal(view(h).querySelectorAll('.chat-tools').length,0);
 assert.equal(h.document.getElementById('nav').hidden,true);assert(h.document.getElementById('chat-thread'));assert(h.document.getElementById('chatText'));assert.equal(h.document.getElementById('chatText').getAttribute('aria-label'),'Your Budget reply');assert.equal(facts(h.L),before);clean(h);
});
check('form handoff brings entered cost and period into the same unsaved draft',()=>{
 const h=fixture(),{L}=h,before=facts(L);click(h,'Enter it myself');h.set('firstEssName','Food');h.set('firstEssAmount','250');h.set('firstPlanPeriodMode','date');L.changePlanPeriod();h.flush();h.set('firstPlanPeriodDate','2099-01-07');
 const draft=L.state.planDraft;click(h,'Continue in Chat');assert.equal(L.route,'chat');assert.equal(L.state.planDraft,draft);
 const represented=draft.essentials.filter(x=>x.name==='Food');assert(represented.length===1&&represented[0].amount===250||draft.essentialFields?.name==='Food'&&Number(draft.essentialFields.amount)===250,'Typed Food remains available exactly once');
 assert.equal(draft.planHorizon.date,'2099-01-07');assert.equal(facts(L),before);assert.equal(L.state.essentials.length,0);clean(h);
});
check('pausing guidance restores ordinary Chat and offers a working resume control',()=>{
 const h=fixture(),{L}=h;click(h,'Build it with Lumo');const draft=L.state.planDraft,before=facts(L);
 const pause=view(h).querySelector('[aria-label="Pause Budget guidance"]');assert(pause);pause.click();h.flush();assert.equal(L.route,'chat');assert.equal(L.budgetGuide.active(),false);
 assert.equal(view(h).querySelectorAll('.budget-guide-toolbar').length,0);assert.equal(view(h).querySelectorAll('.chat-tools').length,1);click(h,'Continue Budget draft');assert(L.budgetGuide.active());assert.equal(L.state.planDraft,draft);assert.equal(view(h).querySelectorAll('.budget-guide-toolbar').length,1);assert.equal(facts(L),before);clean(h);
});
check('View draft returns to the existing form and keeps the same draft',()=>{
 const h=fixture(),{L}=h;click(h,'Build it with Lumo');const draft=L.state.planDraft,before=facts(L);click(h,'View draft');assert.equal(L.route,'firstEssentials');assert.equal(L.state.planDraft,draft);assert(h.document.getElementById('firstEssName'));assert.equal(facts(L),before);clean(h);
});
check('Chat actions can start guided budgeting without stacked sheets or money movement',()=>{
 const h=fixture(),{L}=h,before=facts(L);L.openTab('chat');h.flush();L.openChatBankingActions();h.flush();assert.equal(h.document.querySelectorAll('[role="dialog"]').length,1);click(h,'Build a Budget with LumoTalk through your costs, then review.');
 assert.equal(L.route,'chat');assert(L.budgetGuide.active());assert.equal(h.document.querySelectorAll('[role="dialog"]').length,0);assert.equal(facts(L),before);clean(h);
});
check('public, locked and closed views do not expose guided draft controls',()=>{
 for(const patch of [{onboarded:false},{locked:true},{closed:true}]){const h=fixture(),{L}=h;Object.assign(L.state,patch);const before=facts(L);assert.doesNotMatch(L.views.planBenefit(),/Build it with Lumo/);assert.doesNotMatch(L.views.firstEssentials(),/Continue in Chat/);assert.doesNotMatch(L.views.chatBankingActions(),/Build a Budget with Lumo/);assert.equal(L.budgetGuide.start({mode:'create'}),false);assert.equal(facts(L),before);clean(h);}
});
check('confirmed first funding offers guided or manual setup and each path preserves its credit',()=>{
 for(const guided of [true,false]){const h=fixture(),{L}=h;L.openTab('home');h.flush();L.state.txs=[{id:'first-credit',type:'in',status:'success',amount:500,fee:0,name:'Sample allowance',date:new Date().toISOString()}];L.state.budgetPrompt={txId:'first-credit',done:false,hasBudget:false};L.save();L.go('budgetAfterFunding');h.flush();
  assert(view(h).querySelectorAll('button').some(b=>b.textContent==='Build it with Lumo'));assert(view(h).querySelectorAll('button').some(b=>b.textContent==='Enter it myself'));click(h,guided?'Build it with Lumo':'Enter it myself');
  assert.equal(L.route,guided?'chat':'firstEssentials');assert.equal(L.state.budgetPrompt.done,true);assert.equal(L.state.txs[0].budgetPromptHandled,true);assert.equal(L.state.balance,500);assert.equal(L.state.txs.length,1);assert.equal(L.state.txs[0].status,'success');assert.equal(L.state.goals[0].allocated,100);assert.equal(L.state.essentials.length,0);clean(h);
 }
});
check('pending funding and existing saved Budgets keep their existing next action',()=>{
 for(const existing of [false,true]){const h=fixture(),{L}=h;L.openTab('home');h.flush();if(existing){L.state.essentials=[{id:'food',name:'Food',amount:350,paid:0,externalPaid:0,coverageVersion:1}];L.state.planSaved=true;}L.state.txs=[{id:'incoming',type:'in',status:existing?'success':'pending',amount:500,fee:0,name:'Sample allowance',date:new Date().toISOString()}];L.state.budgetPrompt={txId:'incoming',done:false,hasBudget:existing};L.save();L.go('budgetAfterFunding');h.flush();assert(!view(h).querySelectorAll('button').some(b=>b.textContent==='Build it with Lumo'));if(existing)assert(view(h).querySelectorAll('button').some(b=>b.textContent==='Adjust my budget'));else assert.match(view(h).textContent,/Add money first/);clean(h);}
});
check('continuing with a different named cost cannot discard the cost already entered in the form',()=>{
 const h=fixture(),{L}=h;click(h,'Enter it myself');h.set('firstEssName','Food');h.set('firstEssAmount','250');click(h,'Continue in Chat');h.set('chatText','Transport 100 for seven days');L.askChat();h.flush();
 const d=L.state.planDraft,food=d.essentials.filter(x=>x.name==='Food');assert(food.length===1&&food[0].amount===250||d.essentialFields?.name==='Food'&&Number(d.essentialFields.amount)===250,'The known Food total remains available');assert.equal(L.state.essentials.length,0);assert.equal(L.state.balance,500);clean(h);
});
check('the estimate prompt treats a short daily amount as a rate and asks for its days',()=>{
 const h=fixture(),{L}=h,before=facts(L);click(h,'Enter it myself');h.set('firstEssName','Food');h.set('firstEssAmount','250');click(h,'Continue in Chat');click(h,'Help me estimate');
 h.set('chatText','30');L.askChat();h.flush();h.set('chatText','Seven days');L.askChat();h.flush();const food=L.state.planDraft.essentials.filter(x=>x.name==='Food');assert.equal(food.length,1);assert.equal(food[0].amount,210);assert.equal(facts(L),before);clean(h);
});
check('guided review exposes the understood items and retains the existing explicit Save authority',()=>{
 const h=fixture(),{L}=h,before=facts(L);click(h,'Build it with Lumo');h.set('chatText','Food 250 and transport 100 for seven days');L.askChat();h.flush();click(h,'Review Budget');assert.equal(L.route,'firstPlanReview');
 const group=view(h).querySelector('.budget-guide-review-items');assert(group);assert.match(group.textContent,/Food/);assert.match(group.textContent,/GH₵250.00/);assert.match(group.textContent,/Transport/);assert.match(group.textContent,/GH₵100.00/);assert.equal(group.closest('details'),null);const detail=view(h).querySelector('.budget-guide-review-calculation');assert(detail);assert.equal(detail.hasAttribute('open'),false);assert(detail.querySelector('.first-plan-math'));assert.equal(facts(L),before);const save=view(h).querySelectorAll('button').find(b=>b.textContent==='Save my budget');assert(save);assert.equal(save.getAttribute('onclick'),'L.saveFirstPlan()');save.click();h.flush();assert.equal(L.state.essentials.length,2);assert.equal(L.state.essentials[0].amount,250);assert.equal(L.state.essentials[1].amount,100);assert.equal(L.state.balance,500);assert.equal(L.state.goals[0].allocated,100);assert.equal(L.state.txs.length,0);clean(h);
 const manual=fixture();click(manual,'Enter it myself');manual.set('firstEssName','Food');manual.set('firstEssAmount','250');manual.L.reviewFirstPlanCosts();manual.flush();assert.equal(manual.L.route,'firstPlanReview');assert.equal(view(manual).querySelector('.budget-guide-review-items'),null);assert.equal(view(manual).querySelector('.first-plan-math').closest('details'),null);clean(manual);
});
console.log(count+' guided Budget screen checks passed.');
