/* Full shipped-index regressions for natural intent, dated analytical answers,
   savings flow/balance separation and long recurring conversations. */
'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {createHarness}=require('./helpers/task-sheet-dom.cjs');
const DAY=86400000,copy=x=>JSON.parse(JSON.stringify(x));
const settle=h=>{h.flushHistory();h.flush();};
const view=h=>h.document.getElementById('view');
function fixture(){
 const h=createHarness({clock:true,deferHistory:true}),L=h.L;L.explore();
 const now=h.context.Date.now();
 Object.assign(L.state,{balance:1000,txs:[],chats:[],paymentDraft:null,planSaved:true,essentials:[{id:'food',name:'Food',amount:200,paid:0,externalPaid:0,coverageVersion:1}],goals:[{id:'laptop',name:'Laptop',target:1000,allocated:200,date:new h.context.Date(now+20*DAY).toISOString().slice(0,10),boxVersion:2}],allowance:{amount:1000,date:new h.context.Date(now+14*DAY).toISOString().slice(0,10)},planHorizon:{mode:'date',date:new h.context.Date(now+14*DAY).toISOString().slice(0,10)}});
 L.openBankingChat();settle(h);return h;
}
const financial=L=>JSON.stringify({balance:L.state.balance,accounts:L.state.accounts,txs:L.state.txs,essentials:L.state.essentials,goals:L.state.goals,paymentDraft:L.state.paymentDraft,virtualCards:L.state.virtualCards,groupMoney:L.state.groupMoney});
const answer=(h,q,options={})=>{h.L.params={};return h.L.chatAnswer(q,options);};
const ask=(h,q)=>{h.set('chatText',q);h.L.askChat();settle(h);return h.L.state.chats.at(-1);};
const row=(h,id,amount,extra={})=>({id,name:'Campus meal',type:'out',status:'success',amount,fee:0,category:'Food',date:new h.context.Date(h.context.Date.now()-3600000).toISOString(),...extra});
const clean=h=>assert.deepEqual(h.errors,[]);

test('duration mixed with spending words receives a truthful runway answer, never history totals',()=>{
 const h=fixture(),L=h.L;L.state.txs=[row(h,'meal',50)];const before=financial(L);
 for(const q of ['How long will my money last at my current spending rate?','At my current spending rate, when will I run out?','How long can my balance last with my spending this week?','Will my money last until allowance with my current spending behaviour?']){
  const r=answer(h,q);assert.equal(r.intent,'runway',q);assert(!/^You spent/.test(r.text));assert.match(r.text,/not (?:a )?forecast|don’t forecast|can’t promise/);assert(r.calculation);assert(r.checkedAt);
 }
 assert.equal(financial(L),before);clean(h);
});

test('savings period answers separate confirmed additions, transfers back, net flow and current balance',()=>{
 const h=fixture(),L=h.L,week=L.chatAnalytics.calendarRange({period:'thisWeek'},h.context.Date.now());
 const date=new h.context.Date(Math.min(h.context.Date.now(),week.start+3600000)).toISOString();
 const move=(id,amount,direction='in',extra={})=>row(h,id,amount,{date,type:'internal',internalTransfer:true,boxId:'laptop',boxDirection:direction,...extra});
 L.state.txs=[move('manual',50),move('hack',10,'in',{savingsHack:true}),move('back',20,'out'),move('pending',100,'in',{status:'pending'}),move('failed',200,'in',{status:'failed'}),move('unposted-reversal',300,'in',{status:'reversed'}),move('migration',400,'in',{migration:true}),move('old',500,'in',{date:new h.context.Date(week.start-1).toISOString()})];
 const before=financial(L);
 for(const q of ['How much did I save this week?','How much have I saved this week?','How much have I put aside this week?','How much did I transfer into my Money Box this week?']){
  const r=answer(h,q);assert.equal(r.intent,'savings-period',q);assert.match(r.headline,/60\.00 added/);assert.match(r.support,/20\.00 transferred back.*40\.00/);assert.match(r.support,/not your current savings balance/);assert.equal(r.answerScope.start,week.start);assert(r.answerDateLabel);assert(r.answerPeriodLabel);
 }
 const stock=answer(h,'How much is in my Money Boxes?');assert.equal(stock.intent,'savings');assert.match(stock.headline,/200\.00 is saved/);assert.equal(financial(L),before);clean(h);
});

test('named Money Box balances and saving periods retain their box scope, ambiguity and inactive recovery',()=>{
 const h=fixture(),L=h.L,date=new h.context.Date().toISOString();L.state.goals.push({id:'trip',name:'Trip',target:500,allocated:300,boxVersion:2});
 L.state.txs=[['laptop',20,'in'],['laptop',5,'out'],['trip',300,'in']].map(([boxId,amount,boxDirection],i)=>row(h,'move'+i,amount,{date,type:'internal',internalTransfer:true,boxId,boxDirection}));const before=financial(L);
 for(const q of ['How much did I save in Laptop this week?','How much have I saved in my Laptop Money Box today?']){
  const r=answer(h,q);assert.equal(r.intent,'savings-period');assert.match(r.headline,/20\.00 added to Laptop/);assert.match(r.support,/5\.00 transferred back.*15\.00/);assert.equal(r.answerScope.query.boxId,'laptop');assert.equal(r.params.id,'laptop');assert.equal(L.chatSnapshotStatus(r),'');L.state.txs[2].amount+=1;assert.equal(L.chatSnapshotStatus(r),'','An unrelated box cannot age this answer');L.state.txs[0].amount+=1;assert.match(L.chatSnapshotStatus(r),/Earlier answer/);L.state.txs[0].amount-=1;L.state.txs[2].amount-=1;
 }
 const stock=answer(h,'How much is saved in Laptop?');assert.match(stock.headline,/200\.00 is saved in Laptop/);assert.equal(stock.params.id,'laptop');assert.equal(answer(h,'How much did I save today?').calculation.rows[0][1],L.money(320));
 L.state.goals.push({id:'duplicate',name:'Laptop',target:500,allocated:10,boxVersion:2});for(const q of ['How much did I save in Laptop this week?','How much is saved in Laptop?']){const r=answer(h,q);assert.equal(r.intent,'savings-choice');assert.match(r.headline,/Which Money Box/);assert(!r.calculation);}
 L.state.goals.at(-1).archived=true;assert.equal(answer(h,'How much did I save in Laptop this week?').answerScope.query.boxId,'laptop','An archived duplicate cannot shadow the active exact match');L.state.goals[0].archived=true;assert.match(answer(h,'How much did I save in Laptop this week?').headline,/no longer active/);L.state.goals[0].deleted=true;assert.match(answer(h,'How much is saved in Laptop?').headline,/no longer active/);
 L.state.goals=L.state.goals.filter(g=>g.id!=='duplicate');delete L.state.goals[0].archived;delete L.state.goals[0].deleted;assert.equal(financial(L),before);clean(h);
});

test('confirmed transfer reversals net correctly and migration is never new saving',()=>{
 const h=fixture(),L=h.L,at=new h.context.Date(h.context.Date.now()-3600000).toISOString();
 L.state.txs=[row(h,'original',50,{date:at,type:'internal',internalTransfer:true,boxId:'laptop',boxDirection:'in',status:'reversed',reversalId:'return'}),row(h,'return',50,{date:at,type:'internal',internalTransfer:true,boxId:'laptop',boxDirection:'out',originalId:'original'}),row(h,'import',200,{date:at,type:'internal',internalTransfer:true,boxId:'laptop',boxDirection:'in',migration:true})];
 const r=answer(h,'How much did I save today?');assert.equal(r.intent,'savings-period');assert.equal(r.calculation.rows[2][1],L.money(0));assert.equal(r.calculation.rows[0][1],L.money(50));assert.equal(r.calculation.rows[1][1],L.money(50));clean(h);
});

test('saving dates are calendar-valid and vague future saving is clarified, not counted',()=>{
 const h=fixture();
 for(const q of ['How much did I save this year?','How much did I save from 2026-02-30 to 2026-10-01?','How much did I save in the last 1000 days?'])assert.equal(answer(h,q).intent,'savings-period-choice',q);
 const future=answer(h,'Can I save GH₵100 this week?');assert.equal(future.intent,'savings-planning');assert.match(future.text,/Nothing has moved|Nothing has moved/i);assert(!future.answerScope);clean(h);
});

test('goal deadlines use an exact requested date and required pace, never an invented forecast',()=>{
 const h=fixture(),L=h.L,before=financial(L);
 const vague=answer(h,'Will I reach my savings goal by December?');assert.equal(vague.intent,'goalGuide');assert.match(vague.headline,/exact date/);assert(!vague.calculation);
 for(const q of ['Will I reach my savings goal by 2026-12-31?','Can I reach Laptop by 31 December 2026?','Will my Laptop savings target be ready by December 31, 2026?']){
  const r=answer(h,q);assert.equal(r.intent,'goalGuide',q);assert.match(r.headline,/a week/);assert.match(r.support,/not a prediction/);assert(r.calculation.rows.some(([k,v])=>k==='Target date'&&v==='31 Dec 2026'));assert(r.answerDateLabel);
 }
 const overdue=answer(h,'Can I reach Laptop by 2026-01-01?');assert.match(overdue.headline,/date has passed/);assert(!overdue.calculation.rows.some(([k])=>k==='Required weekly pace'));
 const soon=answer(h,'Can I reach Laptop by '+new h.context.Date(h.context.Date.now()).toISOString().slice(0,10)+'?');assert.match(soon.headline,/800\.00 a day/);assert(soon.calculation.rows.some(([k])=>k==='Required daily pace'));
 const amount=answer(h,'Can I save GH₵100 by 2026-12-31?');assert.match(amount.headline,/Which saving amount/);assert(!amount.calculation);const foreign=answer(h,'Can I save $100 by 2026-12-31?');assert.match(foreign.headline,/Ghana cedis/);assert(!foreign.calculation);
 assert.equal(financial(L),before);clean(h);
});

test('multiple goal choices and inactive boxes never produce a silently selected or inconsistent count',()=>{
 const h=fixture(),L=h.L;
 L.state.goals.push({id:'old',name:'Old trip',target:500,allocated:0,archived:true},{id:'deleted',name:'Removed',target:500,allocated:0,deleted:true},{id:'complete',name:'Completed box',target:100,allocated:100});
 const stock=answer(h,'How much is in my Money Boxes?');assert.match(stock.headline,/across 2 Money Boxes/);
 const choice=answer(h,'Am I on track for my savings goal?');assert.match(choice.headline,/Which Money Box/);assert.equal(choice.route,'goals');clean(h);
});

test('ordinary and calendar spending snapshots mark changed payments and offer a fresh recheck',()=>{
 const h=fixture(),L=h.L;L.state.txs=[row(h,'a',40)];
 for(const q of ['Where did my money go in the last 7 days?','How much did I spend today?']){
  const r=ask(h,q),index=L.state.chats.length-1,original=copy(r);assert(r.answerScope);assert(r.answerDateLabel);assert.equal(L.chatSnapshotStatus(r),'');
  L.state.txs.push(row(h,'new-'+index,30));L.render();settle(h);assert.match(L.chatSnapshotStatus(r),/Earlier answer/);assert(view(h).querySelector(`[data-chat-turn-index="${index}"] .chat-recheck`));
  h.set('chatText','Keep this question');const before=financial(L);assert.equal(L.chatCheckAgain(index),true);settle(h);assert.equal(h.document.getElementById('chatText').value,'Keep this question');assert.equal(financial(L),before);assert.deepEqual(copy(r),original);assert.notEqual(L.state.chats.at(-1).answerSourceMark,r.answerSourceMark);
 }
 clean(h);
});

test('a relative period ages at a day or cutoff boundary even without any ledger edit',()=>{
 const h=fixture(),L=h.L,now=h.context.Date.now();L.state.txs=[row(h,'old',30,{date:new h.context.Date(now-6.5*DAY).toISOString()})];
 const r=answer(h,'Where did my money go in the last 7 days?');assert.equal(L.chatSnapshotStatus(r),'');const before=financial(L);h.context.Date.now=()=>now+2*DAY;
 assert.equal(L.spendingSummary({days:7}).total,0);assert.match(L.chatSnapshotStatus(r),/Earlier answer.*period/);assert.equal(financial(L),before);clean(h);
});

test('a rolling-window transaction crossing its exact cutoff is detected within the same day',()=>{
 const h=fixture(),L=h.L,now=h.context.Date.now();L.state.txs=[row(h,'boundary',30,{date:new h.context.Date(now-7*DAY+5*60000).toISOString()})];
 const r=answer(h,'Where did my money go in the last 7 days?');assert.equal(L.chatSnapshotStatus(r),'');h.context.Date.now=()=>now+10*60000;assert.equal(L.spendingSummary({days:7}).total,0);assert.match(L.chatSnapshotStatus(r),/Earlier answer/);clean(h);
});

test('natural named-goal progress answers its confirmed progress and does not hijack unrelated distance questions',()=>{
 const h=fixture(),L=h.L,before=financial(L);
 for(const q of ['How close am I to Laptop?','What progress have I made on my savings?','What is left to save for Laptop?']){const r=answer(h,q);assert.equal(r.intent,'savings');assert.match(r.headline,/20%/);assert.match(r.support,/800\.00.*to go/);assert.equal(r.params.id,'laptop');}
 assert.equal(answer(h,'How far is Legon from Tema?').intent,'unsupported');assert.equal(financial(L),before);clean(h);
});

test('absolute calendar comparisons keep exact scope and become earlier only when relevant figures change',()=>{
 const h=fixture(),L=h.L,now=h.context.Date.now(),a=new h.context.Date(now-3*DAY).toISOString().slice(0,10),b=new h.context.Date(now-2*DAY).toISOString().slice(0,10);
 L.state.txs=[row(h,'a',30,{date:a+'T12:00:00Z'}),row(h,'b',50,{date:b+'T12:00:00Z'})];
 const r=answer(h,`Compare spending on ${a} and ${b}`);assert.equal(r.intent,'calendarSpending');assert(r.answerScope.comparison);assert.equal(L.chatSnapshotStatus(r),'');h.context.Date.now=()=>now+3*DAY;assert.equal(L.chatSnapshotStatus(r),'');L.state.txs[1].amount=55;assert.match(L.chatSnapshotStatus(r),/Earlier answer/);clean(h);
});

test('merchant history honors an explicit rolling period and does not turn a merchant name into a category',()=>{
 const h=fixture(),L=h.L,now=h.context.Date.now();
 L.state.txs=[row(h,'recent',30,{name:'Food House',category:'Shopping'}),row(h,'old',100,{name:'Food House',category:'Food',date:new h.context.Date(now-10*DAY).toISOString()}),row(h,'other',70,{name:'Other shop',category:'Food'})];
 for(const q of ['How much did I spend at Food House in the last 7 days?','Where did my money go at Food House in the last 7 days?']){
  const r=answer(h,q);assert.equal(r.intent,'calendarSpending');assert.equal(r.calendarQuery.merchant,'Food House');assert.equal(r.calendarQuery.category,'');assert.equal(r.context.days,7);assert.match(r.headline,/30\.00/);assert.deepEqual(copy(r.calendarTxIds),['recent']);assert.equal(r.answerScope.start,now-7*DAY);
 }
 const fourteen=answer(h,'Show payments to Food House in the last 14 days');assert.match(fourteen.headline,/130\.00/);assert.equal(fourteen.answerScope.relative,true);assert.equal(fourteen.answerScope.start,now-14*DAY);h.context.Date.now=()=>now+8*DAY;assert.match(L.chatSnapshotStatus(fourteen),/Earlier answer/);clean(h);
});

test('Story recheck preserves exact merchant/category/period rather than becoming an all-spending answer',()=>{
 const h=fixture(),L=h.L;L.state.txs=[row(h,'akua',30,{name:'Akua Kitchen'}),row(h,'other',70,{name:'Other shop'})];
 h.set('chatText','Keep the Story question draft');L.captureFormDraft();L.go('homeMoneyStory',{days:7,category:'Food',merchant:'Akua Kitchen',breakdown:'merchants'});settle(h);L.moneyStoryAnalytics.ask();settle(h);const index=L.state.chats.length-1,old=L.state.chats[index];assert.equal(old.intent,'money-story-insight');assert.match(old.headline,/30\.00/);assert.equal(h.document.getElementById('chatText').value,'Keep the Story question draft');
 L.state.txs.push(row(h,'akua2',20,{name:'Akua Kitchen'}));assert.match(L.chatSnapshotStatus(old),/Earlier answer/);assert.equal(L.chatCheckAgain(index),true);settle(h);const fresh=L.state.chats.at(-1);assert.equal(fresh.intent,'money-story-insight');assert.match(fresh.headline,/50\.00/);assert.equal(fresh.params.merchant,'Akua Kitchen');assert.equal(fresh.params.category,'Food');assert.equal(fresh.params.days,7);assert.equal(old.params.merchant,'Akua Kitchen');clean(h);
});

test('legacy analytical answers and damaged saved scopes are dated honestly without render errors',()=>{
 const h=fixture(),L=h.L;
 for(const r of [{q:'Where did it go?',intent:'spending',text:'An old total'},{q:'What did I spend today?',intent:'calendarSpending',calculation:{rows:[],notes:[]}}, {q:'Saved story',intent:'money-story-insight',answerScope:{version:1,kind:'calendar',query:null},checkedAt:'invalid'}])assert.match(L.chatSnapshotStatus(r),/Saved answer/);
 clean(h);
});

test('long Chat and searchable history render bounded pages and open the exact older answer with the draft intact',()=>{
 const h=fixture(),L=h.L;L.state.chats=Array.from({length:240},(_,i)=>({q:`Question ${i}${i===7?' UNIQUE-NEEDLE':''}`,text:'A saved answer',intent:'unsupported'}));L.render();settle(h);
 assert.equal(view(h).querySelectorAll('[data-chat-turn-index]').length,40);assert(view(h).querySelector('[data-chat-turn-index="239"]'));h.set('chatText','Do not lose my draft');L.captureFormDraft();const before=financial(L);
 L.go('hibiscusChatHistory');settle(h);assert.equal(view(h).querySelectorAll('.hibiscus-chat-history-list li').length,30);h.set('chatHistorySearch','UNIQUE-NEEDLE');assert.equal(L.hibiscusChat.searchHistory(),true);settle(h);assert.equal(view(h).querySelectorAll('.hibiscus-chat-history-list li').length,1);
 assert.equal(L.hibiscusChat.openSaved(7),true);settle(h);h.advance(17);settle(h);assert.equal(L.route,'chat');assert.equal(h.document.getElementById('chatText').value,'Do not lose my draft');assert(view(h).querySelector('[data-chat-turn-index="7"]'));assert.equal(view(h).querySelectorAll('[data-chat-turn-index]').length,40);assert.equal(financial(L),before);assert.equal(L.state.chats.length,240);
 assert.equal(L.chatThreadWindow.next(),true);settle(h);assert.equal(h.document.getElementById('chatText').value,'Do not lose my draft');assert.equal(view(h).querySelectorAll('[data-chat-turn-index]').length,40);clean(h);
});
