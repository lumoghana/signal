/* Cross-surface Budget management. Uses the actual shipped module order and
   financial engine rather than reimplementing their arithmetic. */
const assert=require('node:assert/strict');
const {createHarness}=require('./helpers/task-sheet-dom.cjs');
const copy=x=>JSON.parse(JSON.stringify(x));
const root=h=>h.document.getElementById('view');
let count=0;const check=(name,fn)=>{fn();count++;console.log('PASS '+name);};
function fixture(patch={}){
 const h=createHarness({clock:true}),{L}=h;L.explore();L.ensureAccounts();
 Object.assign(L.state,{balance:500,txs:[],chats:[],planSaved:true,planDraft:null,budgetCycleDraft:null,budgetHistoryDraft:null,budgetGuideSession:null,firstBudgetPayoff:null,paymentDraft:null,
  essentials:[{id:'food',name:'Food',amount:250,paid:0,externalPaid:0,coverageVersion:1},{id:'transport',name:'Transport',amount:100,paid:0,externalPaid:0,coverageVersion:1}],
  goals:[{id:'laptop',name:'Laptop',allocated:100,target:3000,boxVersion:2}],allowance:{amount:600,date:'2099-01-01',source:'Family'},planHorizon:{mode:'unspecified',date:''},...patch});
 L.openTab('plan');h.flushHistory();h.flush();return h;
}
const clean=h=>assert.deepEqual(h.errors,[]);
const money=L=>copy({balance:L.state.balance,goals:L.state.goals,transactions:L.state.txs,allowance:L.state.allowance,paymentDraft:L.state.paymentDraft});
const saved=L=>JSON.stringify([L.state.essentials,L.state.planSaved,L.state.planHorizon]);
function ask(h,q){h.set('chatText',q);h.L.askChat();h.flushHistory();h.flush();return h.L.state.chats.at(-1);}
function beginChat(h){const entry=root(h).querySelectorAll('button').find(b=>b.textContent.trim()===(h.L.state.essentials.length?'Update budget':'Build with Lumo'));assert(entry,'Budget management entry');entry.click();h.flushHistory();h.flush();assert.equal(h.L.route,'planEdit');const help=root(h).querySelector('.experience-budget-assistance');assert(help,'Guidance remains in Budget management');help.click();h.flushHistory();h.flush();assert.equal(h.L.route,'chat');}

check('Budget page shows original total while spent coverage only changes remaining and left-after',()=>{
 const h=fixture(),{L}=h;
 L.addTx({id:'food-paid',type:'out',status:'success',name:'Lunch',amount:80,fee:0,essentialId:'food',method:'Campus Pay'});L.openTab('plan');h.flush();
 const b=L.budgetOverview.summary();assert.equal(b.total,350);assert.equal(b.remaining,270);assert.equal(b.room,150);
 assert.match(root(h).textContent,/Total budget/i);assert(root(h).querySelectorAll('button').some(x=>/Food/.test(x.textContent)));assert(root(h).querySelectorAll('button').some(x=>/Transport/.test(x.textContent)));
 assert.equal(L.state.balance,420);assert.equal(L.accountBalances().savings,100);clean(h);
});
check('grouping legacy items retains names, IDs, amounts and coverage while showing at most seven rows',()=>{
 const h=fixture({essentials:[{id:'food-a',name:'Lunch',amount:180,paid:0},{id:'food-b',name:'Groceries',amount:70,paid:0},{id:'travel',name:'Trotro',amount:100,paid:0},{id:'unknown',name:'Cousin contribution',amount:20,paid:0}]}),{L}=h,before=saved(L),groups=L.budgetCategories.group(L.state.essentials);
 assert(groups.length<=7);assert.equal(groups.reduce((n,g)=>n+g.total,0),370);assert.equal(groups.flatMap(g=>g.items).length,4);assert.equal(saved(L),before);clean(h);
});
check('archived, deleted and zero-value historical rows do not inflate the visible Budget total',()=>{
 const h=fixture({essentials:[{id:'food',name:'Food',amount:250,paid:0},{id:'old',name:'Transport',amount:100,paid:0,archived:true},{id:'removed',name:'Books',amount:90,deleted:true},{id:'zero',name:'Other',amount:0}]}),{L}=h,before=saved(L),b=L.budgetOverview.summary();
 assert.equal(b.total,250);assert.equal(b.groups.flatMap(g=>g.items).length,1);assert.equal(saved(L),before);clean(h);
});
check('new and returning students have a working guided Budget entry without losing their saved facts',()=>{
 for(const existing of [false,true]){const h=fixture(existing?{}:{essentials:[],planSaved:false}),{L}=h,before=saved(L),fin=money(L);
  assert.equal(root(h).querySelector('[data-budget-primary]').querySelectorAll('button').length,1,'One primary Budget action before management assistance');
  beginChat(h);assert.equal(saved(L),before);assert.deepEqual(money(L),fin);assert(L.budgetGuide.active());assert.equal(L.state.planDraft.essentials.length,existing?2:0);clean(h);
 }
});
check('dismissing a whole-Budget deletion preserves saved Budget, drafts and financial state',()=>{
 const h=fixture(),{L}=h;beginChat(h);ask(h,'Change Food to 300');L.openTab('plan');h.flush();const draft=copy(L.state.planDraft),before=saved(L),fin=money(L);
 L.budgetOverview.requestDelete({scope:'all'});h.flush();assert.equal(L.route,'budgetDelete');assert.equal(saved(L),before);
 L.budgetOverview.cancelDelete();h.flushHistory();h.flush();assert.equal(saved(L),before);assert.deepEqual(copy(L.state.planDraft),draft);assert.deepEqual(money(L),fin);clean(h);
});
check('confirmed deletion of one item retains other costs and all payment history',()=>{
 const h=fixture(),{L}=h;L.addTx({id:'food-paid',type:'out',status:'success',name:'Lunch',amount:80,fee:0,essentialId:'food',method:'Campus Pay'});L.openTab('plan');h.flush();const fin=money(L);
 L.budgetOverview.requestDelete({scope:'item',id:'food'});h.flush();L.budgetOverview.confirmDelete();h.flushHistory();h.flush();
 assert.equal(L.state.essentials.some(x=>x.id==='food'),false);assert.equal(L.state.essentials.find(x=>x.id==='transport').amount,100);assert.deepEqual(money(L),fin);assert.equal(L.state.txs[0].essentialId,'food');assert.equal(L.budgetOverview.summary().total,100);clean(h);
});
check('deleting a selected source releases only its unsubmitted payment link, without submitting or losing the amount',()=>{
 const h=fixture(),{L}=h;L.pickMerchant('AK01');h.flush();h.set('payment-amount','80');h.set('payment-essential','food');L.savePaymentFields();const pay=L.state.paymentDraft,id=pay.id;
 L.openTab('plan');h.flush();L.budgetOverview.requestDelete({scope:'item',id:'food'});h.flush();L.budgetOverview.confirmDelete();h.flushHistory();h.flush();
 assert.equal(L.state.paymentDraft.id,id);assert.equal(Number(L.state.paymentDraft.amount),80);assert.equal(L.state.paymentDraft.essentialId,'');assert.equal(L.state.paymentDraft.submittedTxId,undefined);assert.equal(L.state.txs.length,0);assert.equal(L.state.balance,500);assert.equal(L.accountBalances().savings,100);clean(h);
});
check('a pending linked payment arriving after the delete dialog blocks confirmation',()=>{
 const h=fixture(),{L}=h;L.budgetOverview.requestDelete({scope:'all'});h.flush();
 L.state.txs.push({id:'late-hold',type:'out',status:'pending',name:'Lunch',amount:80,fee:0,essentialId:'food'});const before=saved(L),fin=money(L);
 L.budgetOverview.confirmDelete();h.flushHistory();h.flush();assert.equal(saved(L),before);assert.deepEqual(money(L),fin);assert.match(root(h).textContent,/pending/i);clean(h);
});
check('unrelated and incoming pending records do not block deleting an unlinked Budget item',()=>{
 const h=fixture({txs:[{id:'other-pay',type:'out',status:'pending',amount:20,fee:0,essentialId:'unrelated-cost'},{id:'incoming',type:'in',status:'pending',amount:100,essentialId:'transport'}]}),{L}=h,fin=money(L);
 L.budgetOverview.requestDelete({scope:'item',id:'transport'});h.flush();assert.equal(L.route,'budgetDelete');L.budgetOverview.confirmDelete();h.flushHistory();h.flush();assert.equal(L.state.essentials.some(x=>x.id==='transport'),false);assert.deepEqual(money(L),fin);clean(h);
});
check('locked, closed and public sessions cannot open or commit a Budget deletion',()=>{
 for(const patch of [{locked:true},{closed:true},{onboarded:false}]){const h=fixture(),{L}=h;L.budgetOverview.requestDelete({scope:'all'});h.flush();Object.assign(L.state,patch);const before=saved(L),fin=money(L);
  L.budgetOverview.confirmDelete();h.flushHistory();h.flush();assert.equal(saved(L),before);assert.deepEqual(money(L),fin);L.budgetOverview.requestDelete({scope:'all'});assert.equal(saved(L),before);clean(h);
 }
});
check('a saved edit arriving after the delete dialog cannot be discarded by an old confirmation',()=>{
 const h=fixture(),{L}=h;L.budgetOverview.requestDelete({scope:'all'});h.flush();L.state.essentials[0].amount=400;const before=saved(L),fin=money(L);
 L.budgetOverview.confirmDelete();h.flushHistory();h.flush();assert.equal(saved(L),before);assert.deepEqual(money(L),fin);assert.match(root(h).textContent,/changed/i);clean(h);
});
check('deleting the whole Budget retires unsaved proposals and cannot resurrect deleted costs',()=>{
 const h=fixture(),{L}=h;beginChat(h);ask(h,'Change Food to 300');const oldChoice=L.state.chats.length-1;
 L.state.budgetCycleDraft={id:'cycle-draft',costs:[{previousId:'food',name:'Food',amount:'350',include:true}]};L.state.budgetHistoryDraft={id:'history-draft',rows:[{name:'Food',amount:'350',include:true}]};L.openTab('plan');h.flush();const fin=money(L);
 L.budgetOverview.requestDelete({scope:'all'});h.flush();assert.match(root(h).textContent,/draft/i);L.budgetOverview.confirmDelete();h.flushHistory();h.flush();
 assert.equal(L.state.essentials.length,0);assert.equal(L.state.planSaved,false);assert.equal(L.state.planDraft,null);assert.equal(L.state.budgetCycleDraft,null);assert.equal(L.state.budgetHistoryDraft,null);assert.equal(L.state.budgetGuideSession,null);assert.deepEqual(money(L),fin);
 assert.equal(L.budgetGuide.choose(oldChoice,'Transport'),false);L.saveFirstPlan();L.confirmBudgetCycle();assert.equal(L.state.essentials.length,0);assert.deepEqual(money(L),fin);clean(h);
});
check('stale confirmation calls after a completed deletion cannot remove a newly saved Budget',()=>{
 const h=fixture(),{L}=h;L.budgetOverview.requestDelete({scope:'all'});h.flush();L.budgetOverview.confirmDelete();h.flushHistory();h.flush();L.state.essentials=[{id:'replacement',name:'Food',amount:30,paid:0}];L.state.planSaved=true;const before=saved(L),fin=money(L);
 L.budgetOverview.confirmDelete();h.flushHistory();h.flush();assert.equal(saved(L),before);assert.deepEqual(money(L),fin);clean(h);
});
check('seven fixed category slots leave no eighth free-form item through the manual editor',()=>{
 const h=fixture({essentials:[],planSaved:false}),{L}=h;assert.equal(L.budgetCategories.list.length,7);
 for(const category of L.budgetCategories.list){L.go('essentialEdit');h.flush();h.set('essName',category.name);h.set('essAmount','10');L.saveEssential();h.flushHistory();h.flush();}
 assert.equal(L.state.essentials.length,7);assert.equal(L.budgetOverview.summary().total,70);L.go('essentialEdit');h.flush();const before=saved(L);h.set('essName','Unexpected eighth item');h.set('essAmount','15');L.saveEssential();h.flushHistory();h.flush();assert.equal(saved(L),before);assert.equal(L.state.essentials.length,7);clean(h);
});
check('a category-only edit persists a changed slot without changing money or an existing item ID',()=>{
 const h=fixture({essentials:[{id:'custom-food',name:'Lunch',amount:100,paid:0}]}),{L}=h,fin=money(L);
 L.go('essentialEdit',{id:'custom-food'});h.flush();h.set('essName','Transport');L.saveEssential();h.flushHistory();h.flush();const x=L.state.essentials[0];
 assert.equal(x.id,'custom-food');assert.equal(x.amount,100);assert.equal(x.budgetCategory,'transport');assert.equal(L.budgetCategories.resolve(x).id,'transport');assert.deepEqual(money(L),fin);clean(h);
});
check('a spending-based Budget merges related transaction categories into no more than seven student lines',()=>{
 const h=fixture({essentials:[],planSaved:false}),{L}=h,DAY=86400000,today=Date.parse(new Date().toISOString().slice(0,10)+'T00:00:00Z'),monday=today-((new Date(today).getUTCDay()+6)%7)*DAY;
 L.state.accounts.createdAt=new Date(today-60*DAY).toISOString();
 for(let week=1;week<=4;week++)for(const category of ['Food','Transport','Study','Data','Phone','Shopping','Bills','Rent','Gifts','Repayment'])L.state.txs.push({id:week+'-'+category,date:new Date(monday-week*7*DAY+12*3600000).toISOString(),type:'out',status:'success',amount:10,fee:0,category,name:category+' campus'});
 const fin=money(L);L.budgetHistory.open();h.flush();L.budgetHistory.useDraft();h.flush();assert.equal(L.route,'firstPlanReview');
 const rows=L.state.planDraft.essentials;assert(rows.length<=7);assert.equal(new Set(rows.map(r=>L.budgetCategories.resolve(r).id)).size,rows.length);assert.equal(rows.reduce((n,r)=>n+r.amount,0),100);assert.deepEqual(money(L),fin);clean(h);
});
check('a fresh period can consolidate legacy duplicates while archiving their original covered amounts',()=>{
 const h=fixture({essentials:[{id:'lunch',name:'Lunch',amount:180,paid:80,externalPaid:80,coverageVersion:1},{id:'grocery',name:'Groceries',amount:70,paid:0,externalPaid:0,coverageVersion:1}]}),{L}=h,fin=money(L);
 L.openBudgetCycle();h.flush();L.reviewBudgetCycle();h.flush();assert.equal(L.route,'budgetCycleReview');L.confirmBudgetCycle();h.flushHistory();h.flush();
 const groups=L.budgetCategories.group(L.state.essentials);assert.equal(groups.length,1);assert.equal(L.state.essentials.length,1);assert.equal(L.state.essentials[0].amount,250);assert.equal(L.state.essentials[0].paid,0);
 const archived=L.state.budgetCycles.at(-1).costs;assert.equal(archived.length,2);assert.equal(archived.find(x=>x.id==='lunch').paid,80);assert.deepEqual(money(L),fin);clean(h);
});
console.log(count+' cross-surface Budget management checks passed.');
