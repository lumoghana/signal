/* Mounted outlook journeys, separate account arithmetic and date boundaries. */
const assert=require('node:assert/strict');
const {createHarness}=require('./helpers/task-sheet-dom.cjs');
let count=0;const check=(name,fn)=>{fn();count++;console.log('PASS '+name);};
const DAY=86400000,date=offset=>new Date(Date.parse(new Date().toISOString().slice(0,10)+'T00:00:00Z')+offset*DAY).toISOString().slice(0,10);
const view=h=>h.document.getElementById('view');
const funds=L=>JSON.stringify([L.state.balance,L.state.goals,L.state.txs,L.state.paymentDraft,L.state.essentials,L.state.allowance,L.state.planHorizon]);
function fixture(patch={},options={}){
 const h=createHarness({clock:true,...options}),{L}=h;L.explore();L.ensureAccounts();
 Object.assign(L.state,{balance:490,txs:[],chats:[],paymentDraft:null,planSaved:true,planDraft:null,firstBudgetPayoff:null,
  essentials:[{id:'food',name:'Food and transport',amount:350,paid:0,externalPaid:0,coverageVersion:1}],
  goals:[{id:'laptop',name:'Laptop',allocated:100,target:3000,boxVersion:2}],
  allowance:{amount:800,date:date(7),source:'Family'},planHorizon:{mode:'date',date:date(6)},...patch});
 L.openTab('home');L.render();h.flush();assert.deepEqual(h.errors,[]);return h;
}
function click(h,label){const button=view(h).querySelectorAll('button').find(b=>b.textContent.trim()===label);assert(button,'Visible '+label+' on '+h.L.route);button.click();h.flush();}
function ask(h,q){h.L.openTab('chat');h.flush();h.set('chatText',q);h.L.askChat();h.flush();return h.L.state.chats.at(-1);}
check('seven inclusive Budget days divide only GH140 outside covered costs into GH20 per day',()=>{
 const {L}=fixture(),before=funds(L),s=L.spendingOutlook.summary();
 assert.equal(s.status,'ready');assert.equal(s.days,7);assert.equal(s.available,490);assert.equal(s.budget,350);assert.equal(s.room,140);assert.equal(s.perDay,20);assert.equal(s.remainder,0);assert.equal(s.last,date(6));assert.equal(funds(L),before);assert.equal(L.accountBalances().savings,100);
});
check('allowance period ends before expected income day and never includes its amount',()=>{
 const {L}=fixture({planHorizon:{mode:'allowance',date:date(7)}}),s=L.spendingOutlook.summary();
 assert.equal(s.days,7);assert.equal(s.last,date(6));assert.equal(s.perDay,20);assert.match(s.counting,/day before/);L.state.allowance.amount=90000;assert.equal(L.spendingOutlook.summary().perDay,20);
});
check('the last explicit Budget day is one day and an allowance expected today has no daily projection',()=>{
 const {L}=fixture({planHorizon:{mode:'date',date:date(0)}});assert.equal(L.spendingOutlook.summary().days,1);assert.equal(L.spendingOutlook.summary().perDay,140);
 L.state.planHorizon={mode:'allowance',date:date(0)};L.state.allowance.date=date(0);const s=L.spendingOutlook.summary();assert.equal(s.status,'allowance-due');assert.equal(s.ready,false);assert(!('perDay'in s));
});
check('missing, expired, changed and invalid dates offer review without inventing a daily figure',()=>{
 for(const [period,allowance,status]of [[{mode:'unspecified',date:''},date(7),'missing-period'],[{mode:'date',date:date(-1)},date(7),'ended'],[{mode:'allowance',date:date(7)},date(8),'changed-allowance'],[{mode:'date',date:'2026-02-30'},date(7),'missing-period']]){
  const {L}=fixture({planHorizon:period,allowance:{amount:800,date:allowance}}),s=L.spendingOutlook.summary();assert.equal(s.status,status);assert(!s.ready);assert(!('perDay'in s));assert.equal(s.route,'planPeriod');
 }
});
check('a shortfall leads with the actual gap and no daily spending suggestion',()=>{
 const {L}=fixture({balance:320}),s=L.spendingOutlook.summary();assert.equal(s.status,'gap');assert.equal(s.gap,30);assert.match(s.headline,/GH₵30.00/);assert(!('perDay'in s));assert.equal(s.route,'makeRoom');
});
check('no saved Budget asks for costs even when savings and an allowance exist',()=>{
 const {L}=fixture({essentials:[],planSaved:false}),s=L.spendingOutlook.summary();assert.equal(s.status,'no-budget');assert.equal(s.route,'plan');assert(!('perDay'in s));assert(!L.views.home().includes('home-spending-outlook'));
});
check('rounding never suggests spending a pesewa more than the actual room',()=>{
 const {L}=fixture({balance:490.05}),s=L.spendingOutlook.summary();assert.equal(s.room,140.05);assert.equal(s.perDay,20);assert.equal(s.remainder,.05);assert(s.perDay*s.days<=s.room);
 L.spendingOutlook.open();assert.match(L.views.spendingOutlook(),/Rounding remainder/);assert.match(L.views.spendingOutlook(),/GH₵0.05/);
});
check('an extra successful GH80 reduces daily extras while a linked payment fulfils the saved cost once',()=>{
 for(const linked of [false,true]){const {L}=fixture();L.addTx({id:'paid80',type:'out',status:'success',amount:80,fee:0,name:'Lunch',...(linked?{essentialId:'food'}:{})});const s=L.spendingOutlook.summary();assert.equal(s.available,410);assert.equal(s.budget,linked?270:350);assert.equal(s.room,linked?140:60);assert.equal(s.perDay,linked?20:8.57);assert.equal(L.accountBalances().savings,100);}
});
check('pending extra and linked amounts reserve funds without double deducting planned spending',()=>{
 for(const linked of [false,true]){const {L}=fixture({txs:[{id:'pending80',type:'out',status:'pending',amount:80,fee:0,date:new Date().toISOString(),...(linked?{essentialId:'food'}:{})}]}),s=L.spendingOutlook.summary();assert.equal(s.available,410);assert.equal(s.budget,linked?270:350);assert.equal(s.room,linked?140:60);assert.equal(s.perDay,linked?20:8.57);assert.equal(L.state.balance,490);}
});
check('a stale loaded coverage cache is reconciled in a pure snapshot before the first quote',()=>{
 const {L}=fixture();L.state.balance=410;L.state.txs.push({id:'loaded80',type:'out',status:'success',amount:80,fee:0,essentialId:'food'});L.state.essentials[0].paid=0;const before=funds(L),s=L.spendingOutlook.summary();assert.equal(s.budget,270);assert.equal(s.room,140);assert.equal(s.perDay,20);assert.equal(funds(L),before);
});
check('refunds and paid-outside coverage follow the ledger without altering the source records',()=>{
 const {L}=fixture();L.state.balance=430;L.state.essentials[0].externalPaid=20;L.state.txs=[{id:'paid80',type:'out',status:'success',amount:80,fee:0,essentialId:'food',refunded:20},{id:'refund20',type:'in',status:'success',amount:20,originalId:'paid80'}];const before=funds(L),s=L.spendingOutlook.summary();assert.equal(s.budget,270);assert.equal(s.room,160);assert.equal(funds(L),before);
});
check('Home keeps the daily guide behind the breakdown and the eye hides every displayed amount',()=>{
 const h=fixture(),{L}=h;const button=view(h).querySelector('[data-spending-outlook-entry]');assert(button);
 assert.equal(button.textContent,L.signalEdition?'₵140':'GH₵140.00');assert.match(view(h).querySelector('.everyday-budget-link').textContent,/View budget/);assert.doesNotMatch(button.textContent,/20\.00|\/day/);
 assert.equal(view(h).querySelectorAll('.account-room').length,1);L.hidePrivateMoney();
 assert.doesNotMatch(button.outerHTML,/20\.00|140\.00/);assert.equal(button.getAttribute('aria-label'),L.monoDesign?'Left after planned costs. See calculation':'Left after budget. See calculation');
 assert.match(view(h).querySelector('.everyday-budget-link').textContent,/View budget/);L.showPrivateMoney();assert.equal(button.textContent,L.signalEdition?'₵140':'GH₵140.00');
});
check('the outlook opens one destination and Back restores Home position and its trigger',()=>{
 const h=fixture({},{deferHistory:true}),{L}=h,before=funds(L),parent=view(h),trigger=parent.querySelector('[data-spending-outlook-entry]');parent.scrollTop=123;trigger.focus();trigger.click();h.flush();assert.equal(L.route,'spendingOutlook');assert.equal(L.taskSheet.parentRoute,'home');assert.equal(h.document.querySelectorAll(L.signalEdition?'.task-sheet[role="region"]':'[role="dialog"]').length,1);assert.match(view(h).textContent,/GH₵20.00/);assert(view(h).querySelectorAll('button').some(b=>b.textContent==='See full balance breakdown'));const exit=h.document.querySelector(L.signalEdition?'.task-sheet-back':'.task-sheet-close');assert(exit&&!exit.hidden);exit.click();h.flushHistory();h.flush();assert.equal(L.route,'home');assert.equal(view(h),parent);assert.equal(parent.scrollTop,123);assert.equal(h.document.activeElement,trigger);assert.equal(funds(L),before);assert.deepEqual(h.errors,[]);
});
check('locked, closed and pre-account callers cannot read or open an outlook',()=>{
 for(const patch of [{locked:true},{closed:true},{onboarded:false}]){const {L}=fixture();Object.assign(L.state,patch);const before=funds(L),s=L.spendingOutlook.summary();assert.equal(s.status,'unavailable');assert(!('available'in s));assert.equal(L.spendingOutlook.open(),false);assert.equal(funds(L),before);assert.doesNotMatch(L.views.spendingOutlook(),/GH₵/);}
});
check('adequately dated Chat answers use the same room and daily calculation and offer the detail sheet',()=>{
 const h=fixture(),{L}=h,before=funds(L),a=ask(h,'How long will my money last?');assert.equal(a.intent,'runway');assert.match(a.headline,/GH₵140.00 for extras over 7 days/);assert.match(a.support,/GH₵20.00 a day/);assert.match(a.support,/other costs may be missing/);assert.match(a.support,/Guide only/);assert.match(a.calculation.notes.join(' '),/can’t promise/);assert.match(a.calculation.notes.join(' '),/Expected allowance is not received money/);assert.equal(a.route,'spendingOutlook');click(h,'See spending outlook');assert.equal(L.route,'spendingOutlook');assert.equal(L.taskSheet.parentRoute,'chat');click(h,'Done');assert.equal(L.route,'chat');assert.equal(funds(L),before);assert.deepEqual(h.errors,[]);
});
check('missing allowance follow-up remains a date-confirmation conversation rather than a fabricated outlook',()=>{
 const h=fixture({allowance:{amount:800,date:'',source:'Family'}}),{L}=h,a=ask(h,'How long will my money last?');assert.equal(a.route,'chatDatePicker');assert.equal(a.context.pendingPlanning.kind,'allowance-date');assert(!a.outlookDate);const b=ask(h,date(7));assert.equal(b.route,'chatSaveDate');assert.equal(L.state.allowance.date,'');assert.deepEqual(h.errors,[]);
});
check('a daily Chat guide is marked historical after Ghana midnight and Check again uses the new day',()=>{
 const h=fixture(),{L}=h,a=ask(h,'How long will my money last?');assert.equal(a.outlookDate,date(0));const oldHeadline=a.headline;h.advance(DAY);L.render();h.flush();assert.match(view(h).textContent,/Earlier daily guide/);assert(view(h).querySelectorAll('button').some(b=>b.textContent==='Check again'));assert.equal(L.state.chats[0].headline,oldHeadline);click(h,'Check again');assert.equal(L.state.chats.length,2);assert.match(L.state.chats[1].headline,/over 6 days/);assert.match(L.state.chats[1].support,/GH₵23.33 a day/);assert.deepEqual(h.errors,[]);
});
check('Chat names the actual Budget end and exposes uncovered dates before a later expected allowance',()=>{
 const h=fixture({allowance:{amount:800,date:date(10),source:'Family'}}),a=ask(h,'How long will my money last?'),end=new Date(date(6)+'T12:00:00Z').toLocaleDateString('en-GH',{day:'numeric',month:'short',year:'numeric',timeZone:'Africa/Accra'});assert(a.support.includes('Budget through '+end));assert.match(a.support,/Costs after that Budget date aren’t included/);assert.match(a.support,/Guide only/);assert.match(a.calculation.notes.join(' '),/can’t promise/);assert.equal(a.route,'spendingOutlook');
});
check('ordinary daily-guide questions share GH20 a day instead of the aggregate Budget room',()=>{
 for(const q of ['How much can I spend a day?','How much money do I have per day?','What is my daily spending guide?','What can I spend per day?','Show me my spending outlook']){const h=fixture(),a=ask(h,q);assert.equal(a.intent,'runway');assert.equal(a.route,'spendingOutlook');assert.match(a.headline,/GH₵20.00 a day for extras/);assert.match(a.support,/GH₵140.00 for extras over 7 days/);assert(!a.context.pendingPlanning);}
});
check('a direct daily question offers the missing period or Budget action without making up an amount',()=>{
 for(const patch of [{planHorizon:{mode:'unspecified',date:''}},{essentials:[],planSaved:false}]){const h=fixture(patch),a=ask(h,'How much can I spend a day?');assert.equal(a.route,patch.essentials?'plan':'planPeriod');assert(!a.outlookDate);assert.doesNotMatch(a.headline,/GH₵/);assert(!a.context.pendingPlanning);}
 const h=fixture({allowance:{amount:800,date:'',source:'Family'}}),a=ask(h,'What is my daily spending guide?');assert.equal(a.route,'spendingOutlook');assert.match(a.headline,/GH₵20.00 a day/);assert(!a.context.pendingPlanning);
});
check('daily wording never shadows an amount affordability or historical spending question',()=>{
 for(const q of ['Can I spend GH₵80 a day?','How much can I spend a day if I buy GH₵80 of food?']){const h=fixture(),a=ask(h,q);assert.notEqual(a.route,'spendingOutlook');assert(!a.outlookDate);}
 const h=fixture(),a=ask(h,'What did I spend today?');assert.equal(a.intent,'calendarSpending');assert(!a.outlookDate);
});
check('an explicit daily guide does not describe an expired allowance date as the next expected income',()=>{
 const h=fixture({allowance:{amount:800,date:date(-2),source:'Family'}}),a=ask(h,'How much can I spend a day?');assert.equal(a.route,'spendingOutlook');assert.match(a.headline,/GH₵20.00 a day/);assert.match(a.support,/saved allowance date.*has passed/);assert.doesNotMatch(a.support,/Next allowance expected/);
});
console.log(count+' spending outlook checks passed.');
