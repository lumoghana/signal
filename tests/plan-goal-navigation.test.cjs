/* User-visible regression checks against the actual shipped script order. */
const assert=require('node:assert/strict');
const {createHarness}=require('./helpers/task-sheet-dom.cjs');
let passed=0;
const view=h=>h.document.getElementById('view');
const check=(name,run)=>{run();passed++;console.log('PASS '+name);};
function fixture(options={}){
 const h=createHarness(options),{L}=h;L.explore();
 Object.assign(L.state,{balance:600,txs:[],paymentDraft:null,essentials:[{id:'food',name:'Food',amount:350,paid:0}],goals:[{id:'laptop',name:'Laptop',target:3500,allocated:100}],allowance:{amount:0,date:''},planDraft:null,planSaved:true,chats:[]});
 L.route='home';L.params={};L.history=[];L.render();h.flush();return h;
}
function click(h,label){const b=view(h).querySelectorAll('button').find(x=>x.textContent.trim()===label);assert(b,'Visible action '+label+' on '+h.L.route);b.click();h.flush();}
const clean=h=>assert.deepEqual(h.errors,[]);
check('Home explanation → Edit my plan opens working editor in the same sheet',()=>{
 const h=fixture(),{L}=h,parent=view(h);L.go('planExplanation');h.flush();const dialog=h.document.querySelector('[role="dialog"]');click(h,'Edit my plan');
 assert.equal(L.route,'planEdit');assert(L.taskSheet.active);assert.equal(h.document.querySelector('[role="dialog"]'),dialog);assert.equal(L.taskSheet.parentRoute,'home');assert(parent.inert);assert(view(h).textContent.includes('Edit your plan'));
 const cost=view(h).querySelectorAll('button').find(x=>x.getAttribute('onclick')==="L.go('essentials')");assert(cost);cost.click();h.flush();assert.equal(L.route,'essentials');
 L.go('essentialEdit',{id:'food'});h.set('essAmount',300);click(h,'Save essential');assert.equal(L.state.essentials[0].amount,300);assert.equal(L.state.balance,600);assert.equal(L.balances().room,200);L.closeTask();h.flush();assert.equal(L.route,'home');assert(!L.taskSheet.active);clean(h);
});
check('My plan and its explanation each have a direct, usable Add a goal action',()=>{
 for(const source of ['plan','planExplanation']){
  const h=fixture(),{L}=h;if(source==='plan')L.openTab('plan');else L.go(source);h.flush();click(h,'Add a goal');assert.equal(L.route,'goalEdit');assert(view(h).querySelector('#goalName'));assert(L.taskSheet.active);assert.equal(h.document.querySelectorAll('[role="dialog"]').length,1);clean(h);
 }
});
check('adding a goal confirms it, offers Add another goal and Close, and cannot submit twice',()=>{
 const h=fixture(),{L}=h;L.openTab('plan');L.go('goalEdit');h.flush();h.set('goalName','Semester books');h.set('goalTarget',500);click(h,'Add goal');
 assert.equal(L.route,'goals');assert.equal(L.state.goals.length,2);const added=L.state.goals.at(-1);assert.equal(added.allocated,0);assert(view(h).querySelector('[role="status"]').textContent.includes('Semester books added.'));assert(!view(h).textContent.includes('Create a goal'));assert(view(h).textContent.includes('Add another goal'));
 L.saveGoal();assert.equal(L.state.goals.length,2,'Stale submit cannot append a second goal');click(h,'Add another goal');assert.equal(L.route,'goalEdit');assert.equal(h.document.getElementById('goalName').value,'');assert.equal(h.document.getElementById('goalTarget').value,'');h.set('goalName','A trip');h.set('goalTarget',800);click(h,'Add goal');assert.equal(L.state.goals.length,3);click(h,'Close');assert.equal(L.route,'plan');assert(!L.taskSheet.active);assert.equal(L.state.balance,600);assert.equal(L.balances().room,150);assert.equal(L.state.txs.length,0);clean(h);
});
check('an existing goal updates once, keeps allocation and has a distinct saved result',()=>{
 const h=fixture(),{L}=h;L.go('goalEdit',{id:'laptop'});h.flush();h.set('goalName','Study laptop');h.set('goalTarget',4000);click(h,'Save changes');assert.equal(L.state.goals.length,1);assert.equal(L.state.goals[0].allocated,100);assert.equal(L.state.goals[0].target,4000);assert(view(h).querySelector('[role="status"]').textContent.includes('Study laptop updated.'));assert.equal(L.state.balance,600);clean(h);
});
check('invalid goal and target below its allocation retain fields for correction',()=>{
 const h=fixture(),{L}=h;L.go('goalEdit');h.flush();h.set('goalName','Books');h.set('goalTarget',0);click(h,'Add goal');assert.equal(L.route,'goalEdit');assert.equal(L.state.goals.length,1);assert.equal(h.document.getElementById('goalName').value,'Books');L.go('goalEdit',{id:'laptop'});h.set('goalTarget',50);click(h,'Save changes');assert.equal(L.route,'goalEdit');assert.equal(L.state.goals[0].target,3500);assert(view(h).querySelector('#error').textContent.includes('Set aside less first'));clean(h);
});
check('browser Back from editor restores explanation; Close restores the original parent and focus',()=>{
 const h=fixture(),{L}=h;const trigger=view(h).querySelector('.home-plan-summary');trigger.focus();trigger.click();h.flush();click(h,'Edit my plan');h.history.back();h.flush();assert.equal(L.route,'planExplanation');assert(L.taskSheet.active);L.closeTask();h.flush();assert.equal(L.route,'home');assert(!L.taskSheet.active);assert.equal(h.document.activeElement?.getAttribute('onclick'),trigger.getAttribute('onclick'));clean(h);
});
check('a goal added while setup is paused remains visible in its calculation and survives saving the older draft',()=>{
 const h=fixture(),{L}=h;L.state.goals=[];L.state.essentials=[];L.state.planSaved=false;L.go('firstEssentials');h.set('firstEssName','Food');h.set('firstEssAmount',350);L.reviewFirstPlanCosts();L.firstPlanLeave();h.flush();
 L.openTab('plan');click(h,'Add a goal');h.set('goalName','New laptop');h.set('goalTarget',3000);click(h,'Add goal');const id=L.state.goals[0].id;click(h,'Close');
 L.go('firstPlanReview');h.flush();assert.equal(L.state.planDraft.goals.length,0,'Projection must not mutate the optional goal editor');click(h,'Save my plan');assert(L.state.goals.some(g=>g.id===id));assert.equal(L.state.essentials.length,1);assert.equal(L.state.balance,600);assert.equal(L.balances().room,250);clean(h);
});
check('later live goals do not retarget unfinished optional goal fields or free their allocation twice',()=>{
 const h=fixture(),{L}=h;L.state.goals=[];L.state.planDraft={step:'firstGoal',allowance:{...L.state.allowance},essentials:[...L.state.essentials],goals:[],goalFields:{name:'Books',target:'500',allocated:'50'},planHorizon:{mode:'unspecified',date:''}};
 L.go('goalEdit');h.set('goalName','Trip');h.set('goalTarget',1000);click(h,'Add goal');const trip=L.state.goals[0];trip.allocated=100;
 L.go('firstGoal');h.flush();assert.equal(h.document.getElementById('firstGoalName').value,'Books');assert.equal(L.state.planDraft.goals.length,0);assert(view(h).textContent.includes('Up to GH₵150.00'));
 L.firstPlanGoal();h.flush();assert.equal(L.route,'firstPlanReview');assert.equal(L.firstPlanPosition().allocated,150);click(h,'Save my plan');assert.equal(L.state.goals.length,2);assert(L.state.goals.some(g=>g.id===trip.id&&g.name==='Trip'&&g.allocated===100));assert(L.state.goals.some(g=>g.name==='Books'&&g.allocated===50));assert.equal(L.balances().room,100);clean(h);
});
check('later saved goal edits, releases and archives cannot be undone by an older setup snapshot',()=>{
 const h=fixture(),{L}=h;L.go('firstEssentials');L.firstPlanLeave();h.flush();
 L.go('goalEdit',{id:'laptop'});h.set('goalName','Updated laptop');h.set('goalTarget',4000);click(h,'Save changes');assert.equal(L.state.planDraft.goals[0].name,'Updated laptop');
 L.go('releaseGoal',{id:'laptop'});h.set('release',20);click(h,'Review change');click(h,'Save change');assert.equal(L.state.planDraft.goals[0].allocated,80);
 L.go('firstPlanReview');click(h,'Save my plan');assert.equal(L.state.goals[0].name,'Updated laptop');assert.equal(L.state.goals[0].allocated,80);
 L.go('firstEssentials');L.firstPlanLeave();h.flush();L.go('goal',{id:'laptop'});click(h,'Archive goal');click(h,'Archive goal');assert.equal(L.state.goals.length,0);assert.equal(L.state.planDraft.goals.length,0);
 L.go('firstPlanReview');click(h,'Save my plan');assert.equal(L.state.goals.length,0);assert.equal(L.state.balance,600);clean(h);
});
console.log(passed+' plan and goal navigation regressions passed.');
