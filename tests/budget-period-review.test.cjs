/* End-of-period comparison stays factual and prepares only existing drafts. */
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {createHarness}=require('./helpers/task-sheet-dom.cjs');
const dist=path.join(__dirname,'../dist');
const modules=require('./helpers/shipped-entry.cjs').scripts(require('node:path').resolve(__dirname,'..')).filter(f=>fs.existsSync(path.join(dist,f)));
if(!modules.includes('budget-period-review.js'))modules.push('budget-period-review.js');
let count=0;const check=(name,fn)=>{fn();count++;console.log('PASS '+name);};
const copy=x=>JSON.parse(JSON.stringify(x));
const view=h=>h.document.getElementById('view');
const clean=h=>assert.deepEqual(h.errors,[]);
const today=()=>new Date().toISOString().slice(0,10);
const date=n=>new Date(Date.parse(today()+'T00:00:00Z')+n*86400000).toISOString().slice(0,10);
const now=()=>Date.parse(today()+'T12:00:00Z');
function tx(id,patch={}){return {id,type:'out',status:'success',date:date(-3)+'T10:00:00Z',amount:80,fee:0,category:'Food',name:'Campus lunch',...patch};}
function fixture(patch={}){
 const h=createHarness({clock:true,modules}),{L}=h;L.explore();L.ensureAccounts();
 Object.assign(L.state,{balance:500,txs:[],paymentDraft:null,chats:[],planDraft:null,budgetCycleDraft:null,budgetHistoryDraft:null,budgetGuideSession:null,planSaved:true,firstBudgetPayoff:null,
  essentials:[{id:'food',name:'Food',budgetCategory:'food',amount:250,paid:0,externalPaid:0,coverageVersion:1},{id:'transport',name:'Transport',budgetCategory:'transport',amount:100,paid:0,externalPaid:0,coverageVersion:1}],
  goals:[{id:'laptop',name:'Laptop',allocated:100,target:3000,boxVersion:2}],allowance:{amount:0,date:'',source:'Family'},planHorizon:{mode:'date',date:date(-1)},budgetCycle:{id:'past',start:date(-7),end:date(-1)},budgetPeriodRecord:null,budgetPeriodReviewDraft:null,...patch});
 L.openTab('plan');h.flush();return h;
}
const facts=L=>JSON.stringify([L.state.balance,L.state.essentials,L.state.goals,L.state.txs,L.state.paymentDraft,L.state.planHorizon,L.state.planSaved,L.state.budgetCycle]);
function click(h,label){const b=view(h).querySelectorAll('button').find(x=>x.textContent.trim()===label);assert(b,'Visible '+label+' on '+h.L.route);b.click();h.flush();h.flushHistory();h.flush();}
function startNext(h,mode='keep'){const {L}=h;L.budgetPeriodReview.open();h.flush();assert.equal(L.budgetPeriodReview.next(mode),true);h.flush();h.set('budget-next-start',today());h.set('budget-next-end',date(6));return L.budgetPeriodReview.prepareNext();}

check('comparison is pure and uses original saved totals, recorded amounts and fees',()=>{
 const h=fixture({txs:[tx('lunch',{amount:80,fee:2,essentialId:'food'}),tx('ride',{amount:40,category:'Transport',essentialId:'transport'})]}),{L}=h,before=JSON.stringify(L.state),s=L.budgetPeriodReview.summary({now:now()});
 assert(s.ready);assert.equal(s.planned,350);assert.equal(s.recorded,122);assert.equal(s.rows.find(x=>x.categoryId==='food').planned,250);assert.equal(s.rows.find(x=>x.categoryId==='food').recorded,82);assert.equal(s.rows.find(x=>x.categoryId==='food').difference,-168);assert.equal(JSON.stringify(L.state),before);clean(h);
});
check('incoming, Money Box movements, failed and fully refunded payments are excluded',()=>{
 const h=fixture({txs:[tx('good',{amount:50}),tx('in',{type:'in',amount:500}),tx('box',{internalTransfer:true,amount:100}),tx('failed',{status:'failed',amount:90}),tx('reversed',{status:'reversed',amount:30}),tx('refunded',{amount:60,refunded:60}),tx('refund-pair',{amount:70}),tx('credit-refund',{type:'in',originalId:'refund-pair',amount:70}),tx('outside',{date:date(-10)+'T10:00:00Z',amount:999}),tx('future',{date:date(2)+'T10:00:00Z',amount:999})]}),s=h.L.budgetPeriodReview.summary({now:now()});
 assert.equal(s.recorded,50);assert.equal(s.included.length,1);assert.equal(s.included[0].id,'good');clean(h);
});
check('pending and uncategorised spending are visible without being assigned or counted twice',()=>{
 const h=fixture({txs:[tx('food',{amount:40}),tx('unknown',{amount:30,fee:1,category:'Uncategorised'}),tx('hold',{status:'pending',amount:50,fee:2,category:'Transport',essentialId:'transport'})]}),{L}=h,s=L.budgetPeriodReview.summary({now:now()});
 assert.equal(s.recorded,71);assert.equal(s.categorised,40);assert.equal(s.unknown,31);assert.equal(s.pending,52);assert.equal(s.rows.find(x=>x.categoryId==='transport').recorded,0);assert.equal(s.rows.find(x=>x.categoryId==='transport').pending,52);
 L.budgetPeriodReview.open();h.flush();assert.match(view(h).textContent,/GH₵31.00 still needs a category/);assert.match(view(h).textContent,/GH₵52.00 is pending and is not counted as spending/);assert.match(view(h).textContent,/Spending elsewhere may be missing/);clean(h);
});
check('linked custom items and deliberate corrections use seven shared categories',()=>{
 const h=fixture({essentials:[{id:'custom',name:'My lecture needs',budgetCategory:'study-fees',amount:100,paid:0},{id:'a',name:'Lunch',amount:80,paid:0},{id:'b',name:'Groceries',amount:70,paid:0}],txs:[tx('book',{essentialId:'custom',category:'Other',amount:40,categoryMeta:{source:'budget-source',budgetCategory:'study-fees'}}),tx('customer',{essentialId:'a',category:'Transport',amount:20,categoryMeta:{source:'customer',confidence:'confirmed'}})]}),{L}=h,s=L.budgetPeriodReview.summary({now:now()});
 assert.equal(s.rows.find(x=>x.categoryId==='food').planned,150);assert.equal(s.rows.find(x=>x.categoryId==='study-fees').recorded,40);assert.equal(s.rows.find(x=>x.categoryId==='transport').recorded,20);assert.equal(L.state.essentials.length,3);clean(h);
});
check('recorded category snapshots survive a later saved Budget category edit',()=>{
 const h=fixture({essentials:[{id:'food',name:'My costs',budgetCategory:'transport',amount:250,paid:0}],txs:[tx('old-food',{essentialId:'food',category:'Food',amount:80,categoryMeta:{source:'budget-source',budgetCategory:'food'},budgetSource:{type:'budget-line',id:'food',name:'Food'}}),tx('corrected',{essentialId:'food',category:'Study',amount:20,categoryMeta:{source:'customer',confidence:'confirmed',budgetCategory:'food'},budgetSource:{type:'budget-line',id:'food',name:'Food'}})]}),s=h.L.budgetPeriodReview.summary({now:now()});
 assert.equal(s.rows.find(x=>x.categoryId==='food').recorded,80);assert.equal(s.rows.find(x=>x.categoryId==='transport').recorded,0);assert.equal(s.rows.find(x=>x.categoryId==='study-fees').recorded,20);clean(h);
});
check('date boundaries are inclusive and future-dated transactions are not actual spending',()=>{
 const h=fixture({planHorizon:{mode:'date',date:date(3)},txs:[tx('start',{date:date(-7)+'T00:00:00Z',amount:10}),tx('before',{date:date(-8)+'T23:59:59Z',amount:999}),tx('now',{date:today()+'T11:59:59Z',amount:20}),tx('later-today',{date:today()+'T18:00:00Z',amount:999}),tx('future',{date:date(1)+'T10:00:00Z',amount:999})]}),s=h.L.budgetPeriodReview.summary({now:now()});
 assert.equal(s.recorded,30);assert.equal(s.throughDate,today());assert.equal(s.ended,false);assert.equal(s.endDate,date(3));clean(h);
});
check('missing historic start is never inferred and entered review dates do not change the Budget',()=>{
 const h=fixture({budgetCycle:null,budgetPeriodRecord:null}),{L}=h,before=facts(L);assert.equal(L.budgetPeriodReview.summary().reason,'dates');L.budgetPeriodReview.open();h.flush();assert.equal(L.route,'budgetReviewDates');assert.equal(h.document.getElementById('budget-review-start').value,'');assert.equal(L.state.budgetPeriodRecord,null);
 h.set('budget-review-start',date(-7));h.set('budget-review-end',date(-1));click(h,'Show comparison');assert.equal(L.route,'budgetPeriodReview');assert.match(view(h).textContent,/Selected review dates/);assert.equal(facts(L),before);assert.equal(L.state.budgetPeriodReviewDraft.chosen,true);clean(h);
});
check('invalid and future review dates stay editable and preserve the account',()=>{
 const h=fixture({budgetCycle:null}),{L}=h,before=facts(L);L.budgetPeriodReview.open();h.flush();
 for(const [start,end]of [['2026-02-30','2026-03-01'],[date(-1),date(-7)],[date(2),date(3)]]){h.set('budget-review-start',start);h.set('budget-review-end',end);assert.equal(L.budgetPeriodReview.saveDates(),false);assert.equal(L.route,'budgetReviewDates');assert.equal(facts(L),before);}clean(h);
});
check('a new explicitly saved Budget records its real start and existing historic Budgets do not acquire one on render',()=>{
 const h=fixture({essentials:[],planSaved:false,budgetCycle:null,planHorizon:{mode:'unspecified',date:''}}),{L}=h;L.go('firstEssentials');h.flush();h.set('firstEssName','Food');h.set('firstEssAmount','100');L.reviewFirstPlanCosts();h.flush();assert.equal(L.state.budgetPeriodRecord,null);L.saveFirstPlan();h.flush();assert.equal(L.state.budgetPeriodRecord.start,today());assert.equal(L.state.budgetPeriodRecord.source,'created');assert(L.state.budgetPeriodRecord.costIds.includes(L.state.essentials[0].id));
 const old=fixture({budgetCycle:null}),before=JSON.stringify(old.L.state);old.L.budgetPeriodReview.summary();old.L.views.plan();assert.equal(old.L.state.budgetPeriodRecord,null);assert.equal(JSON.stringify(old.L.state),before);clean(h);clean(old);
});
check('keep requires explicit next dates and only prepares the established reviewed cycle',()=>{
 const h=fixture(),{L}=h,before=facts(L);L.budgetPeriodReview.open();h.flush();click(h,'Keep these amounts');assert.equal(L.route,'budgetReviewNext');assert.equal(h.document.getElementById('budget-next-end').value,'');assert.equal(L.budgetPeriodReview.prepareNext(),false);assert.equal(facts(L),before);
 h.set('budget-next-end',date(6));click(h,'Review next Budget');assert.equal(L.route,'budgetCycleReview');assert.equal(L.state.budgetCycleDraft.start,today());assert.equal(L.state.budgetCycleDraft.end,date(6));assert.equal(L.state.budgetCycleDraft.costs.reduce((n,x)=>n+Number(x.amount),0),350);assert.equal(facts(L),before);clean(h);
});
check('adjust opens the same editable next-period draft without committing it',()=>{
 const h=fixture(),{L}=h,before=facts(L);assert.equal(startNext(h,'adjust'),true);h.flush();assert.equal(L.route,'budgetCycle');assert.equal(h.document.getElementById('cycle-amount-0').value,'250');assert.equal(L.state.budgetCycleDraft.reviewed,false);assert.equal(facts(L),before);clean(h);
});
check('a pending linked payment blocks renewal even if it arrived after opening the review',()=>{
 const h=fixture(),{L}=h;L.budgetPeriodReview.open();h.flush();L.budgetPeriodReview.next('keep');h.flush();h.set('budget-next-end',date(6));L.state.txs.push(tx('hold',{status:'pending',amount:20,essentialId:'food'}));const before=facts(L);assert.equal(L.budgetPeriodReview.prepareNext(),false);assert.equal(L.state.budgetCycleDraft,null);assert.equal(facts(L),before);assert.match(view(h).textContent,/changed|pending/);clean(h);
});
check('changed transactions or saved Budget invalidate an older comparison until refresh',()=>{
 for(const changeBudget of [false,true]){const h=fixture({txs:[tx('meal',{amount:50})]}),{L}=h;L.budgetPeriodReview.open();h.flush();if(changeBudget)L.state.essentials[0].amount=300;else L.state.txs[0].amount=70;const before=facts(L);assert.equal(L.budgetPeriodReview.next('keep'),false);assert.equal(L.state.budgetCycleDraft,null);assert.equal(facts(L),before);L.budgetPeriodReview.refresh();h.flush();assert.equal(L.budgetPeriodReview.next('keep'),true);clean(h);}
});
check('unfinished setup, history and cycle drafts are kept rather than overwritten',()=>{
 for(const name of ['planDraft','budgetHistoryDraft','budgetCycleDraft']){const h=fixture(),{L}=h;L.state[name]=name==='planDraft'?{step:'firstEssentials',essentials:[],goals:[],allowance:{amount:0,date:''},planHorizon:{mode:'unspecified',date:''}}:name==='budgetHistoryDraft'?{id:'history',rows:[]}:{id:'cycle',start:today(),end:date(6),costs:[]};const before=JSON.stringify(L.state[name]);L.budgetPeriodReview.open();h.flush();assert.equal(L.budgetPeriodReview.next('keep'),false);assert.equal(JSON.stringify(L.state[name]),before);assert.match(view(h).textContent,/draft/);clean(h);}
});
check('close and device Back preserve review date inputs without changing saved planning data',()=>{
 for(const back of [false,true]){const h=fixture({budgetCycle:null}),{L}=h,before=facts(L);L.budgetPeriodReview.open();h.flush();h.set('budget-review-start',date(-5));if(back){h.history.back();h.flush();h.flushHistory();}else if(L.signalEdition){const control=h.document.querySelector('.task-sheet-back');assert(control&&!control.hidden);control.click();h.flush();h.flushHistory();h.flush();}else click(h,'Close');assert.equal(L.route,'plan');assert.equal(L.state.budgetPeriodReviewDraft.start,date(-5));assert.equal(facts(L),before);clean(h);}
});
check('confirmed next period archives prior real start, records its new start and cannot be confirmed twice',()=>{
 const h=fixture({budgetCycle:null,budgetPeriodRecord:{start:date(-7),costIds:['food','transport'],source:'created'}}),{L}=h,before=copy([L.state.balance,L.state.goals,L.state.txs]);assert.equal(startNext(h,'keep'),true);h.flush();L.confirmBudgetCycle();h.flush();assert.equal(L.state.budgetCycles.at(-1).start,date(-7));assert.equal(L.state.budgetPeriodRecord.start,today());assert.equal(L.state.budgetPeriodReviewDraft,null);assert.equal(L.state.essentials.reduce((n,x)=>n+x.amount,0),350);assert.deepEqual(copy([L.state.balance,L.state.goals,L.state.txs]),before);const saved=JSON.stringify(L.state.essentials);L.confirmBudgetCycle();assert.equal(JSON.stringify(L.state.essentials),saved);clean(h);
});
check('locked, closed and public callers cannot read account facts or prepare periods',()=>{
 for(const patch of [{locked:true},{closed:true},{onboarded:false}]){const h=fixture(),{L}=h;Object.assign(L.state,patch);const before=facts(L);assert.equal(L.budgetPeriodReview.summary().ready,false);assert.equal(L.budgetPeriodReview.summary().recorded,0);assert.equal(L.budgetPeriodReview.open(),false);assert.equal(L.budgetPeriodReview.next('keep'),false);assert.equal(L.budgetPeriodReview.prepareNext(),false);assert.equal(L.views.budgetPeriodReview(),'');assert.equal(facts(L),before);clean(h);}
});
console.log(count+' dated Budget review checks passed.');
