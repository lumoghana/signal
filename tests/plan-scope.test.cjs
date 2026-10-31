/* Plan provenance beside its derived figure. Counts describe known inputs,
   never certify that the student has entered every cost. No browser fit claim. */
const assert=require('node:assert/strict');
const {createHarness}=require('./helpers/task-sheet-dom.cjs');
let passed=0;
const check=(name,run)=>{run();passed++;console.log('PASS '+name);};
const view=h=>h.document.getElementById('view');
function fixture(overrides={}){
 const h=createHarness(),{L}=h;L.explore();
 Object.assign(L.state,{balance:600,txs:[],paymentDraft:null,essentials:[{id:'food',name:'Food',amount:50,paid:0}],goals:[],allowance:{amount:0,date:''},planDraft:null,planSaved:true,chats:[],...overrides});
 L.route='home';L.params={};L.history=[];L.render();h.flush();return h;
}
const scope=h=>view(h).querySelector('[data-plan-scope]');
const clean=h=>assert.deepEqual(h.errors,[]);
function click(h,label){const b=view(h).querySelectorAll('button').find(x=>x.textContent.trim()===label);assert(b,'Visible '+label+' on '+h.L.route);b.click();h.flush();}

check('one saved cost qualifies the GH₵550 plan figure on Home and My plan',()=>{
 const h=fixture(),{L}=h,before=JSON.stringify([L.state.balance,L.state.txs,L.state.essentials,L.state.goals]);
 assert.equal(scope(h).textContent,'Based on your 1 saved cost.');assert.equal(L.balances().room,550);
 assert(view(h).querySelector('#overview-room').textContent.includes('550.00'));
 L.openTab('plan');h.flush();assert.equal(scope(h).textContent,'Based on your 1 saved cost.');
 assert.equal(JSON.stringify([L.state.balance,L.state.txs,L.state.essentials,L.state.goals]),before);clean(h);
});
check('multiple costs and committed goals are counted without including unallocated targets or expected income',()=>{
 const h=fixture({essentials:[{id:'food',name:'Food',amount:200,paid:0},{id:'transport',name:'Transport',amount:150,paid:0}],goals:[{id:'laptop',name:'Laptop',target:3000,allocated:100},{id:'trip',name:'Trip',target:500,allocated:0}],allowance:{amount:1000,date:'2099-01-01'}}),{L}=h;
 const summary=L.planScopeSummary();assert.equal(summary.costCount,2);assert.equal(summary.goalCount,1);
 assert.equal(scope(h).textContent,'Based on your 2 saved costs and 1 goal.');assert.equal(L.balances().room,150);clean(h);
});
check('fully paid and pending-linked costs stay part of saved scope rather than implying fewer entered costs',()=>{
 const h=fixture({essentials:[{id:'food',name:'Food',amount:50,paid:50},{id:'transport',name:'Transport',amount:100,paid:0}],txs:[{id:'pending',type:'out',status:'pending',amount:100,fee:0,essentialId:'transport',date:new Date().toISOString()}]});
 assert.equal(h.L.planScopeSummary().costCount,2);assert.equal(scope(h).textContent,'Based on your 2 saved costs.');assert.equal(h.L.balances().essentials,0);clean(h);
});
check('a goal-only plan explicitly says no costs are saved',()=>{
 const h=fixture({essentials:[],goals:[{id:'laptop',name:'Laptop',target:3000,allocated:100}]}),{L}=h;
 assert.equal(scope(h).textContent,'Based on 1 goal only · no costs saved.');assert.equal(L.balances().room,500);clean(h);
});
check('invalid and zero totals never inflate the provenance count or mutate input records',()=>{
 const h=fixture(),state={essentials:[{amount:0},{amount:-5},{amount:'NaN'},{amount:Infinity},null,{amount:50,paid:50}],goals:[{allocated:0},{allocated:-1},{allocated:Infinity},null,{allocated:'100'}]};
 const before=JSON.stringify(state),summary=h.L.planScopeSummary(state);assert.equal(summary.costCount,1);assert.equal(summary.goalCount,1);assert.equal(JSON.stringify(state),before);
 assert.equal(h.L.planScopeSummary({essentials:null,goals:null}).label,'No saved costs or money set aside yet.');clean(h);
});
check('privacy hides both monetary figures while the nonfinancial scope remains readable',()=>{
 const h=fixture(),{L}=h,before=JSON.stringify([L.state.balance,L.state.txs,L.state.essentials]);
 L.hidePrivateMoney();assert.equal(scope(h).textContent,'Based on your 1 saved cost.');
 for(const el of view(h).querySelectorAll('[data-private-value]')){assert(el.textContent.includes('•••••'));assert(!/600|550/.test(el.textContent));}
 L.toggleBalancePrivacy();assert(view(h).querySelector('#overview-room').textContent.includes('550.00'));assert.equal(JSON.stringify([L.state.balance,L.state.txs,L.state.essentials]),before);clean(h);
});
check('first review labels the draft inputs before saving without changing the account or saved plan',()=>{
 const h=fixture({essentials:[],goals:[],planSaved:false}),{L}=h;L.go('firstEssentials');h.flush();h.set('firstEssName','Food');h.set('firstEssAmount',50);click(h,'Review my plan');
 assert.equal(L.route,'firstPlanReview');assert.equal(scope(h).textContent,'Based on 1 cost in this draft.');assert.equal(L.state.essentials.length,0);assert.equal(L.state.balance,600);
 click(h,'Save my plan');assert.equal(L.route,'home');assert.equal(scope(h).textContent,'Based on your 1 saved cost.');assert.equal(L.balances().room,550);assert.equal(L.state.balance,600);clean(h);
});
check('a future income period appears only when available, while an older selection stays visible for correction',()=>{
 const h=fixture(),{L}=h;L.go('firstEssentials');h.flush();
 assert.equal(view(h).querySelector('option[value="allowance"]'),null);
 L.state.planDraft.allowance={amount:1000,date:'2099-01-01'};L.render();h.flush();
 assert(view(h).querySelector('option[value="allowance"]'));assert(!view(h).querySelector('option[value="allowance"]').disabled);
 L.state.planDraft.planHorizon={mode:'allowance',date:'2099-01-01'};L.state.planDraft.allowance.date='';L.render();h.flush();
 const stale=view(h).querySelector('option[value="allowance"]');assert(stale);assert(stale.disabled);assert(stale.hasAttribute('selected'));assert(stale.textContent.includes('needs updating'));
 h.set('firstEssName','Data');h.set('firstEssAmount',20);click(h,'Review my plan');assert.equal(L.route,'firstEssentials');assert(view(h).querySelector('#error').textContent.includes('future plan date'));assert.equal(L.state.balance,600);clean(h);
});
console.log(passed+' known-plan scope checks passed.');
