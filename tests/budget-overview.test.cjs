/* Budget management uses the actual shipped financial and sheet controllers. */
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {createHarness}=require('./helpers/task-sheet-dom.cjs');
const dist=path.resolve(__dirname,'../dist');
const modules=require('./helpers/shipped-entry.cjs').scripts(require('node:path').resolve(__dirname,'..'));
for(const file of ['budget-categories.js','budget-overview.js'])if(!modules.includes(file))modules.push(file);
const copy=x=>JSON.parse(JSON.stringify(x));
const view=h=>h.document.getElementById('view');
let count=0;const check=(name,fn)=>{fn();count++;console.log('PASS '+name);};
function fixture(patch={}){
 const h=createHarness({clock:true,modules}),{L}=h;L.explore();L.ensureAccounts();
 Object.assign(L.state,{balance:520,txs:[{id:'paid-food',name:'Lunch',type:'out',status:'success',amount:80,fee:0,essentialId:'food',date:new Date().toISOString()}],chats:[],paymentDraft:null,planDraft:null,budgetGuideSession:null,budgetCycleDraft:null,budgetHistoryDraft:null,
 essentials:[{id:'food',name:'Food',amount:200,paid:80,externalPaid:0,coverageVersion:1},{id:'transport',name:'Transport',amount:100,paid:0,externalPaid:0,coverageVersion:1},{id:'study',name:'Study',amount:50,paid:0,externalPaid:0,coverageVersion:1}],goals:[{id:'laptop',name:'Laptop',target:3000,allocated:100,boxVersion:2}],planSaved:true,planHorizon:{mode:'unspecified',date:''},...patch});
 L.openTab('plan');h.flush();return h;
}
const money=h=>copy([h.L.state.balance,h.L.state.goals,h.L.state.txs]);
const clean=h=>assert.deepEqual(h.errors,[]);
check('Plan shows the original Budget total and keeps item progress in a collapsed disclosure',()=>{
 const h=fixture(),{L}=h,z=L.budgetOverview.summary();assert.equal(z.total,350);assert.equal(z.remaining,270);assert.equal(z.room,250);
 const total=view(h).querySelector('[data-budget-total]');assert(total);assert.match(total.textContent,/350/);assert.doesNotMatch(total.textContent,/250/);
 const list=view(h).querySelector('.budget-overview-items');assert(list);const disclosure=list.closest('details');assert(disclosure);assert.equal(disclosure.hasAttribute('open'),false);assert(disclosure.hasAttribute('data-budget-items-disclosure'));assert.equal(list.querySelectorAll('.budget-overview-item').length,3);
 assert.match(list.textContent,/Food/);assert.match(list.textContent,/200/);assert.match(list.textContent,/120/);assert.match(view(h).textContent,/Left after Budget/);clean(h);
});
check('each category opens an editable detail in one retained native task',()=>{
 const h=fixture(),{L}=h,before=money(h),food=L.budgetOverview.summary().groups.find(x=>x.items.some(r=>r.id==='food'));
 L.budgetOverview.openCategory(food.id);h.flush();assert.equal(L.route,'budgetCategory');assert.equal(L.taskSheet.parentRoute,'plan');assert.equal(h.document.querySelectorAll(h.L.signalEdition?'.task-sheet[role="region"]':'[role="dialog"]').length,1);
 assert.match(view(h).textContent,/Delete item/);const edit=view(h).querySelectorAll('button').find(x=>x.textContent==='Edit');assert(edit);edit.click();h.flush();assert.equal(L.route,'essentialEdit');assert.equal(L.params.id,'food');assert.equal(h.document.querySelectorAll(h.L.signalEdition?'.task-sheet[role="region"]':'[role="dialog"]').length,1);assert.deepEqual(money(h),before);clean(h);
});
check('cancel, backdrop close and device back never delete or authorise',()=>{
 for(const method of ['cancel','close','back']){
  const h=fixture(),{L}=h,before=copy(L.state.essentials),funds=money(h);L.budgetOverview.requestDelete({scope:'item',id:'food'});h.flush();assert.equal(L.route,'budgetDelete');
  if(method==='cancel')L.budgetOverview.cancelDelete();else if(method==='close')L.closeTask();else h.history.back();h.flush();h.flushHistory();
  assert.deepEqual(copy(L.state.essentials),before);assert.deepEqual(money(h),funds);assert.notEqual(L.route,'authorize');assert.equal(L.budgetOverview.confirmDelete(),false);clean(h);
 }
});
check('item deletion removes only its commitment and retains the original transaction link',()=>{
 const h=fixture(),{L}=h,before=money(h);L.state.budgetPurposeRules=[{sourceId:'food',key:'lunch'},{sourceId:'transport',key:'bus'}];
 L.budgetOverview.requestDelete({scope:'item',id:'food'});h.flush();assert.equal(L.state.essentials.length,3);assert.equal(L.budgetOverview.confirmDelete(),true);h.flush();h.flushHistory();
 assert.deepEqual(L.state.essentials.map(x=>x.id),['transport','study']);assert.equal(L.state.planSaved,true);assert.equal(L.budgetOverview.summary().total,150);assert.equal(L.budgetOverview.summary().room,370);assert.equal(L.state.budgetPurposeRules.length,1);assert.equal(L.state.txs[0].essentialId,'food');assert.deepEqual(money(h),before);assert.equal(L.budgetOverview.confirmDelete(),false);clean(h);
});
check('deleting an entire Budget clears drafts only after explicit confirmation, preserving all money and history',()=>{
 const h=fixture(),{L}=h,before=money(h);L.state.planDraft={essentials:copy(L.state.essentials),essentialFields:{name:'Other',amount:'20'}};L.state.budgetGuideSession={draftId:'guide'};L.state.chats=[{q:'Food 200',guideDraftId:'guide',action:'Review Budget',route:'budgetGuideReview',guideChoices:[['Food','Food']]}];L.state.budgetCycleDraft={id:'cycle'};L.state.budgetHistoryDraft={id:'history'};L.state.planPeriodDraft={mode:'date',date:'2099-01-01'};
 L.budgetOverview.requestDelete({scope:'all'});h.flush();assert(L.state.planDraft);assert.match(view(h).textContent,/unfinished Budget drafts/);assert(L.state.budgetGuideSession);assert.equal(L.budgetOverview.confirmDelete(),true);h.flush();h.flushHistory();
 assert.equal(L.state.essentials.length,0);assert.equal(L.state.planSaved,false);assert.equal(L.state.planDraft,null);assert.equal(L.state.budgetGuideSession,null);assert.equal(L.state.budgetHistoryDraft,null);assert.equal(L.state.budgetCycleDraft,null);assert.equal(L.state.planPeriodDraft,null);assert.equal(L.state.chats.length,1);assert.equal(L.state.chats[0].route,undefined);assert.deepEqual(money(h),before);assert.equal(L.budgetOverview.summary().room,520);clean(h);
});
check('linked pending payment blocks initial deletion and is rechecked at confirmation',()=>{
 for(const late of [false,true]){
  const h=fixture(),{L}=h,before=copy(L.state.essentials);if(late){L.budgetOverview.requestDelete({scope:'all'});h.flush();}
  L.state.txs.push({id:'pending',type:'out',status:'pending',amount:20,essentialId:'food'});
  if(late)assert.equal(L.budgetOverview.confirmDelete(),false);else assert.equal(L.budgetOverview.requestDelete({scope:'item',id:'food'}),false);
  assert.deepEqual(copy(L.state.essentials),before);assert.match(view(h).textContent,/pending/);clean(h);
 }
});
check('a change while deletion is open must be reviewed again',()=>{
 const h=fixture(),{L}=h;L.budgetOverview.requestDelete({scope:'all'});h.flush();L.state.essentials[0].amount=230;assert.equal(L.budgetOverview.confirmDelete(),false);assert.equal(L.state.essentials.length,3);assert.equal(L.state.essentials[0].amount,230);assert.match(view(h).textContent,/Budget changed/);clean(h);
});
check('an unsubmitted payment keeps its fields but can no longer use a deleted source or review',()=>{
 const h=fixture(),{L}=h;L.state.paymentDraft={id:'keep',method:'campus',name:'Lunch',destination:'AK01',checked:true,amount:'80',fee:0,essentialId:'food',reviewFingerprint:'old',pauseAcceptedSignature:'old',budgetPurposeProof:{sourceId:'food'}};
 L.budgetOverview.requestDelete({scope:'item',id:'food'});h.flush();L.budgetOverview.confirmDelete();h.flush();const d=L.state.paymentDraft;assert.equal(d.id,'keep');assert.equal(d.amount,'80');assert.equal(d.name,'Lunch');assert.equal(d.essentialId,'');assert.equal(d.reviewFingerprint,undefined);assert.equal(d.pauseAcceptedSignature,undefined);assert.equal(d.budgetPurposeProof,undefined);clean(h);
});
check('new and returning students have one Budget action and guided help in management',()=>{
 for(const empty of [false,true]){const h=fixture(empty?{essentials:[],planSaved:false}:{}),{L}=h,before=money(h),actions=view(h).querySelector('[data-budget-primary]');assert(actions);const buttons=actions.querySelectorAll('button');assert.equal(buttons.length,1);assert.equal(buttons[0].textContent,empty?'Create a budget':'Update budget');buttons[0].click();h.flush();assert.equal(L.route,empty?'firstEssentials':'planEdit');assert.deepEqual(money(h),before);
 const guided=fixture(empty?{essentials:[],planSaved:false}:{});const entry=view(guided).querySelectorAll('button').find(b=>b.textContent.trim()===(empty?'Build with Lumo':'Update budget'));assert(entry);entry.click();guided.flush();assert.equal(guided.L.route,'planEdit');const chat=view(guided).querySelector('.experience-budget-assistance');assert(chat);assert.equal(chat.textContent.trim(),empty?'Build with Lumo':'Adjust with Lumo');chat.click();guided.flush();assert.equal(guided.L.route,'chat');assert(guided.L.budgetGuide.active());clean(h);clean(guided);}
});
check('legacy duplicate categories stay visible as one line while preserving every original item',()=>{
 const h=fixture({essentials:[{id:'a',name:'Food',amount:70,paid:0},{id:'b',name:'Lunch',amount:30,paid:0}]}),{L}=h,z=L.budgetOverview.summary();assert.equal(z.groups.length,1);assert.equal(z.total,100);assert.equal(z.groups[0].items.length,2);assert.equal(L.state.essentials.length,2);L.budgetOverview.openCategory(z.groups[0].id);h.flush();assert.match(view(h).textContent,/Food/);assert.match(view(h).textContent,/Lunch/);assert.equal(view(h).querySelectorAll('.budget-category-original').length,2);clean(h);
});
check('returning through an old item route cannot restore its cached amount after deletion',()=>{
 const h=fixture(),{L}=h;L.go('essentialEdit',{id:'food'});h.flush();h.set('essAmount','999');L.removeEssential();h.flush();L.budgetOverview.confirmDelete();h.flush();h.flushHistory();L.go('essentialEdit',{id:'food'});h.flush();assert.equal(h.document.getElementById('essAmount'),null);assert.match(view(h).textContent,/was removed/);assert.equal(L.state.essentials.some(x=>x.id==='food'),false);clean(h);
});
check('guided review shows full category totals while retaining the remaining-cost calculation',()=>{
 const h=fixture(),{L}=h;L.budgetGuide.start({mode:'create',silent:true});L.budgetGuide.review();h.flush();assert.equal(L.route,'firstPlanReview');
 assert.equal(view(h).querySelector('.first-plan-conclusion>strong').textContent,'GH₵350.00');assert.match(view(h).querySelector('.budget-review-room').textContent,/GH₵250.00 left/);
 const list=view(h).querySelector('.budget-guide-review-items');assert.equal(list.querySelector('strong').textContent,'GH₵200.00');assert.match(list.textContent,/GH₵120.00 still to cover/);assert.equal(L.state.essentials[0].amount,200);assert.equal(L.state.balance,520);clean(h);
});
console.log(count+' Budget overview and deletion checks passed.');
