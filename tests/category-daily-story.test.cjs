/* Mounted daily-story correction: one optional answer, exact displayed dates,
   no financial consent, Budget fulfilment or future-recipient learning. */
const assert=require('node:assert/strict');
const {createHarness}=require('./helpers/task-sheet-dom.cjs');
const clone=x=>JSON.parse(JSON.stringify(x));
const view=h=>h.document.getElementById('view');
const clean=h=>assert.deepEqual(h.errors,[]);
const DAY=86400000;
let count=0;
function check(name,fn){fn();count++;console.log('PASS '+name);}
function fixture(){
 const h=createHarness({clock:true}),{L}=h;L.explore();L.ensureAccounts();
 Object.assign(L.state,{balance:500,txs:[],essentials:[{id:'food',name:'Food',amount:250,paid:0},{id:'transport',name:'Transport',amount:100,paid:0}],goals:[{id:'laptop',name:'Laptop',allocated:100,target:1000,boxVersion:2}],paymentDraft:null,categoryRules:[],firstBudgetPayoff:null,planHorizon:{mode:'unspecified',date:''},planSaved:true});
 L.route='home';L.params={};L.history=[];L.save();L.render();h.flush();return h;
}
function tx(h,id,extra={}){return {id,name:'Abena Asante',type:'out',status:'success',amount:40,fee:0,method:'Lumo transfer',category:'Uncategorised',categoryMeta:{source:'unknown',confidence:'unknown',version:1},date:new h.context.Date().toISOString(),...extra};}
const money=L=>clone({balance:L.state.balance,accounts:L.state.accounts,essentials:L.state.essentials,goals:L.state.goals,paymentDraft:L.state.paymentDraft,txs:L.state.txs.map(({id,status,type,amount,fee,essentialId,date})=>({id,status,type,amount,fee,essentialId,date}))});
function click(h,label,root=view(h)){const b=root.querySelectorAll('button').find(b=>b.textContent.trim()===label);assert(b,'Visible '+label+' on '+h.L.route);b.focus();b.click();h.flush();return b;}
function open(h,params={period:'today'}){h.L.go('dailyMoneyStory',params);h.flush();return view(h).querySelector('[data-daily-category-prompt]');}

check('the spending detail keeps its optional category question without restoring a Home card',()=>{
 const h=fixture(),{L}=h;L.state.txs=[tx(h,'meal')];L.render();h.flush();
 assert.equal(view(h).querySelector('.home-story-insight'),null);assert.match(L.dailyInsights.insight().headline,/needs a category/);
 open(h);
 assert.equal(L.route,'dailyMoneyStory');assert.equal(L.taskSheet.active,true);assert.equal(h.document.querySelectorAll(L.signalEdition?'.task-sheet[role="region"]':'[role="dialog"]').length,1);
 const prompt=view(h).querySelector('[data-daily-category-prompt]');assert(prompt);assert.equal(prompt.querySelectorAll('.category-chip').length,3);assert.match(prompt.textContent,/Food/);assert.match(prompt.textContent,/Transport/);assert.match(prompt.textContent,/Something else/);
 const before=money(L);view(h).scrollTop=37;click(h,'Food',prompt);
 assert.equal(L.state.txs[0].category,'Food');assert.equal(L.state.txs[0].categoryMeta.source,'customer');assert.equal(L.state.categoryRules.length,0);assert.deepEqual(money(L),before);assert.equal(L.route,'dailyMoneyStory');assert.equal(view(h).scrollTop,37);assert(!view(h).querySelector('[data-daily-category-prompt]'));assert.equal(h.document.activeElement,view(h).querySelector('.daily-story-details summary'));
 const exit=h.document.querySelector(L.signalEdition?'.task-sheet-back':'.task-sheet-close');assert(exit&&!exit.hidden);exit.click();h.flush();assert.equal(L.route,'home');assert.equal(view(h).querySelector('.home-story-insight'),null);assert.match(L.dailyInsights.insight().headline,/Food took GH₵40\.00 today/);assert.deepEqual(money(L),before);clean(h);
});
check('the quick question only includes completed external unreversed payments',()=>{
 const h=fixture(),{L}=h;L.state.txs=[tx(h,'pending',{status:'pending'}),tx(h,'failed',{status:'failed'}),tx(h,'income',{type:'in'}),tx(h,'internal',{internalTransfer:true}),tx(h,'internal-flag',{internal:true}),tx(h,'box',{boxId:'laptop'}),tx(h,'refunded',{refunded:40}),tx(h,'refund-linked',{refundId:'refund'}),tx(h,'refund-record',{originalId:'old'}),tx(h,'reversed',{status:'reversed'})];
 assert.equal(open(h),null);for(const t of L.state.txs)assert.equal(L.quickDailyStoryCategory(t.id,'Food'),false);assert(L.state.txs.every(t=>t.category==='Uncategorised'));clean(h);
});
check('today and yesterday questions use exact Ghana calendar boundaries',()=>{
 const h=fixture(),{L}=h,now=h.context.Date.now(),d=new h.context.Date(now),start=Date.UTC(d.getUTCFullYear(),d.getUTCMonth(),d.getUTCDate());
 L.state.txs=[tx(h,'yesterday',{date:new Date(start-1).toISOString()}),tx(h,'today',{date:new Date(start).toISOString()}),tx(h,'future',{date:new Date(now+10000).toISOString()})];
 assert.equal(open(h).getAttribute('data-tx-id'),'today');L.go('dailyMoneyStory',{period:'yesterday'});h.flush();assert.equal(view(h).querySelector('[data-daily-category-prompt]').getAttribute('data-tx-id'),'yesterday');assert.equal(L.quickDailyStoryCategory('today','Food'),false);assert.equal(L.quickDailyStoryCategory('future','Food'),false);clean(h);
});
check('weekly and saved historical ranges never offer a payment outside the displayed dates',()=>{
 const h=fixture(),{L}=h,now=h.context.Date.now(),d=new h.context.Date(now),day=Date.UTC(d.getUTCFullYear(),d.getUTCMonth(),d.getUTCDate()),week=day-((d.getUTCDay()+6)%7)*DAY;
 L.state.txs=[tx(h,'before-week',{date:new Date(week-1).toISOString()}),tx(h,'in-week',{date:new Date(week).toISOString()}),tx(h,'last-week',{date:new Date(week-3*DAY).toISOString()})];
 assert.equal(open(h,{period:'thisWeek'}).getAttribute('data-tx-id'),'in-week');
 const params={period:'thisWeek',start:week-7*DAY,end:week-2*DAY};L.go('dailyMoneyStory',params);h.flush();assert.equal(view(h).querySelector('[data-daily-category-prompt]').getAttribute('data-tx-id'),'last-week');assert.equal(L.quickDailyStoryCategory('in-week','Food'),false);assert.equal(L.quickDailyStoryCategory('before-week','Food'),false);clean(h);
});
check('Not now skips the question for this calendar view without categorising or learning',()=>{
 const h=fixture(),{L}=h;L.state.txs=[tx(h,'one'),tx(h,'two')];const prompt=open(h),before=clone(L.state.txs),financial=money(L);click(h,'Not now',prompt);assert(!view(h).querySelector('[data-daily-category-prompt]'));L.render();h.flush();assert(!view(h).querySelector('[data-daily-category-prompt]'));assert.deepEqual(clone(L.state.txs),before);assert.deepEqual(money(L),financial);assert.equal(L.state.categoryRules.length,0);assert(view(h).querySelector('.daily-story-details'));clean(h);
});
check('Something else uses the existing chooser and returns to the same dates and position',()=>{
 const h=fixture(),{L}=h;L.state.txs=[tx(h,'one')];const prompt=open(h,{period:'today'}),before=money(L);view(h).scrollTop=53;click(h,'Something else',prompt);assert.equal(L.route,'categoryEdit');assert.equal(h.document.querySelectorAll(L.signalEdition?'.task-sheet[role="region"]':'[role="dialog"]').length,1);click(h,'Gifts');h.flushHistory();h.flush();assert.equal(L.route,'dailyMoneyStory');assert.equal(L.params.period,'today');assert.equal(view(h).scrollTop,53);assert.equal(L.state.txs[0].category,'Gifts');assert.equal(L.state.categoryRules.length,0);assert.deepEqual(money(L),before);assert(!view(h).querySelector('[data-daily-category-prompt]'));clean(h);
});
check('declining the full chooser returns without changing the category or the story scope',()=>{
 const h=fixture(),{L}=h;L.state.txs=[tx(h,'one')];const prompt=open(h),before=clone(L.state.txs);view(h).scrollTop=22;click(h,'Something else',prompt);click(h,'Not now');h.flushHistory();h.flush();assert.equal(L.route,'dailyMoneyStory');assert.equal(L.params.period,'today');assert.equal(view(h).scrollTop,22);assert(view(h).querySelector('[data-daily-category-prompt]'));assert.deepEqual(clone(L.state.txs),before);clean(h);
});
check('without grounded choices the prompt offers the full chooser rather than fabricated predictions',()=>{
 const h=fixture(),{L}=h;L.state.essentials=[];L.state.txs=[tx(h,'one')];const prompt=open(h);assert.equal(prompt.querySelectorAll('.category-chip').length,1);assert.equal(prompt.querySelector('.category-chip').textContent,'Something else');assert.equal(L.state.txs[0].categoryMeta.confidence,'unknown');clean(h);
});
check('stale, unavailable and locked-account controls cannot categorise another payment',()=>{
 const h=fixture(),{L}=h;L.state.txs=[tx(h,'one')];open(h);L.state.txs[0].status='pending';assert.equal(L.quickDailyStoryCategory('one','Food'),false);assert.equal(L.openDailyStoryCategory('one'),false);L.state.txs[0].status='success';L.state.locked=true;assert.equal(L.quickDailyStoryCategory('one','Food'),false);assert.equal(L.dismissDailyStoryCategory('one'),false);L.state.locked=false;L.state.txs=[];assert.equal(L.quickDailyStoryCategory('one','Food'),false);assert.equal(L.state.categoryRules.length,0);clean(h);
});
check('unrelated categories and repeated taps never count a Budget item twice or create another transaction',()=>{
 const h=fixture(),{L}=h;L.state.txs=[tx(h,'linked',{essentialId:'food',budgetSource:{type:'budget-line',id:'food',name:'Food'}})];const prompt=open(h),before=money(L);click(h,'Transport',prompt);assert.equal(L.state.txs[0].essentialId,'food');assert.equal(L.state.txs[0].budgetSource.name,'Food');assert.equal(L.state.txs[0].category,'Transport');assert.equal(L.quickDailyStoryCategory('linked','Food'),false);assert.equal(L.state.categoryRules.length,0);assert.deepEqual(money(L),before);clean(h);
});
console.log(count+' daily-story category checks passed.');
