/* Calendar and command behavior against the actual edition script order. The
   harness intentionally does not pretend to verify a physical phone keyboard. */
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {createHarness}=require('./helpers/task-sheet-dom.cjs');
const root=path.resolve(__dirname,'../dist');
const scripts=require('./helpers/shipped-entry.cjs').scripts(require('node:path').resolve(__dirname,'..'));
if(!scripts.includes('chat-everyday.js'))scripts.push('chat-everyday.js');
const clone=x=>JSON.parse(JSON.stringify(x));
let passed=0,failed=0;
const check=(name,fn)=>{try{fn();passed++;console.log('PASS '+name);}catch(error){failed++;process.exitCode=1;console.error('FAIL '+name+'\n'+error.stack);}};
const now=Date.parse('2026-10-23T12:00:00Z');
const tx=(id,date,amount,extra={})=>({id,date,type:'out',status:'success',amount,fee:0,name:'Akua’s Kitchen',category:'Food',method:'Campus Pay',...extra});
function fixture(options={}){const h=createHarness({clock:true,modules:scripts,...options});h.L.explore();h.L.route='home';h.L.params={};h.L.history=[];h.L.render();h.flush();return h;}
function ledger(h){return clone({balance:h.L.state.balance,accounts:h.L.state.accounts,essentials:h.L.state.essentials,goals:h.L.state.goals,txs:h.L.state.txs});}
function ask(h,q){h.set('chatText',q);h.submit(h.document.getElementById('view').querySelector('.chat-entry'));h.flush();return h.L.state.chats.at(-1);}
function answer(h,q,options={}){return h.L.chatAnswer(q,{now,...options});}
function clean(h){assert.deepEqual(h.errors,[]);}

check('Ghana calendar windows include exact UTC boundaries and Monday weeks',()=>{
 const h=fixture();h.L.state.txs=[
  tx('last-month','2026-09-30T23:59:59.999Z',1),tx('month-start','2026-10-01T00:00:00Z',2),
  tx('last-week-start','2026-10-12T00:00:00Z',3),tx('last-week-end','2026-10-18T23:59:59.999Z',4),
  tx('week-start','2026-10-19T00:00:00Z',5),tx('yesterday-start','2026-10-22T00:00:00Z',6),
  tx('yesterday-end','2026-10-22T23:59:59.999Z',7),tx('today-start','2026-10-23T00:00:00Z',8),
  tx('today-now','2026-10-23T12:00:00Z',9),tx('future','2026-10-23T12:00:00.001Z',100)];
 const summary=period=>h.L.dailySpendingSummary({period,now});
 assert.equal(summary('today').total,17);assert.equal(summary('yesterday').total,13);
 assert.equal(summary('thisWeek').total,35);assert.equal(summary('lastWeek').total,7);
 assert.equal(summary('thisMonth').total,44);assert.equal(summary('lastMonth').total,1);
 assert.equal(summary('thisWeek').start,Date.parse('2026-10-19T00:00:00Z'));assert.equal(summary('lastWeek').end,Date.parse('2026-10-18T23:59:59.999Z'));
 assert.equal(summary('today').end,now);clean(h);
});

check('completed spending includes fees, and excludes held, failed, incoming and internal money',()=>{
 const h=fixture(),date='2026-10-23T10:00:00Z';
 h.L.state.txs=[tx('food',date,20,{fee:.5}),tx('transport',date,10,{category:'Transport',name:'Ride & Go'}),tx('pending',date,500,{status:'pending'}),tx('failed',date,500,{status:'failed'}),tx('reversed',date,500,{status:'reversed'}),tx('refund',date,500,{type:'in'}),tx('internal',date,500,{internalTransfer:true}),tx('box',date,500,{boxId:'goal-laptop'}),tx('method',date,500,{method:'Money Box transfer'}),tx('bad',date,Infinity),tx('fee',date,1,{fee:-1})];
 const before=ledger(h),s=h.L.dailySpendingSummary({period:'today',now});
 assert.equal(s.total,30.5);assert.equal(s.count,2);assert.deepEqual(clone(s.categories),[['Food',20.5],['Transport',10]]);
 assert.equal(h.L.dailySpendingSummary({period:'today',now,category:'food'}).total,20.5);assert.equal(h.L.dailySpendingSummary({period:'today',now,merchant:'Akua'}).count,1);assert.deepEqual(ledger(h),before);clean(h);
});

check('date ranges validate calendar dates and never include future transactions',()=>{
 const h=fixture();h.L.state.txs=[tx('a','2026-10-20T00:00:00Z',25),tx('b','2026-10-21T23:59:59.999Z',30),tx('c','2026-10-22T00:00:00Z',60)];
 assert.equal(h.L.dailySpendingSummary({period:'range',start:'2026-10-20',end:'2026-10-21',now}).total,55);
 assert.equal(h.L.dailySpendingSummary({period:'range',start:'2026-02-30',end:'2026-03-01',now}).valid,false);
 assert.equal(h.L.dailySpendingSummary({period:'range',start:'2026-10-22',end:'2026-10-20',now}).valid,false);
 assert.equal(h.L.dailySpendingSummary({period:'range',start:'2026-12-01',end:'2026-12-02',now}).valid,false);
 assert.match(answer(h,'Show spending from 2026-10-20 to 2026-10-21').headline,/55/);assert.match(answer(h,'Show spending on 2026-02-30').headline,/dates/);clean(h);
});

check('natural calendar Chat, merchant search and comparisons use the same totals',()=>{
 const h=fixture();h.L.state.txs=[tx('old','2026-10-15T12:00:00Z',60),tx('akua','2026-10-22T12:00:00Z',25),tx('ride','2026-10-23T10:00:00Z',10,{name:'Ride & Go',category:'Transport'})];
 const a=answer(h,'Show my payment to Akua yesterday');assert.match(a.headline,/25/);assert.equal(a.intent,'calendarSpending');assert.deepEqual(clone(a.calendarTxIds),['akua']);assert.match(a.contextLabel,/Yesterday/);assert(a.calculation);
 const b=answer(h,'Did I spend more this week than last week?');assert.match(b.headline,/25.*less/);assert.match(b.support,/35/);assert.match(b.support,/60/);assert.match(b.support,/in progress/);
 const c=answer(h,'How much did I spend on transport today?');assert.match(c.headline,/10/);assert.equal(c.calendarQuery.category,'Transport');clean(h);
});

check('explicit date comparisons compare individual dates or paired ranges, with clear labels',()=>{
 const h=fixture();h.L.state.txs=[tx('a','2026-10-20T12:00:00Z',20),tx('b','2026-10-21T12:00:00Z',100),tx('c','2026-10-22T12:00:00Z',30),tx('d','2026-10-23T10:00:00Z',40)];
 let r=answer(h,'Compare spending on 2026-10-20 and 2026-10-22');assert.match(r.headline,/10.*less/);assert.deepEqual(clone(r.calendarTxIds),['a','c']);assert.doesNotMatch(r.support,/150/);
 r=answer(h,'Compare spending from 2026-10-20 to 2026-10-21 versus 2026-10-22 to 2026-10-23');assert.match(r.headline,/50.*more/);assert.match(r.support,/120/);assert.match(r.support,/70/);
 r=answer(h,'Compare spending today with 2026-10-20');assert.match(r.headline,/20.*more/);r=answer(h,'Show my payments to Akua');assert.equal(r.intent,'calendarSpending');assert.match(r.headline,/190/);clean(h);
});

check('Chat payment commands resolve known merchants and budget sources without moving money',()=>{
 const h=fixture();h.L.openBankingChat();h.flush();const before=ledger(h),reply=ask(h,'Pay Akua GH₵25 from Food');
 assert.equal(reply.intent,'bankingDraft');assert.equal(reply.bankingProposal.targetId,'AK01');assert.equal(reply.bankingProposal.sourceId,'ess-food');assert.deepEqual(ledger(h),before);assert.equal(h.L.state.paymentDraft,undefined);
 h.L.chatOpenAnswer(h.L.state.chats.length-1);h.flush();assert.equal(h.L.route,'send');assert.equal(h.L.taskSheet.parentRoute,'chat');
 const d=h.L.state.paymentDraft;assert.equal(d.amount,'25');assert.equal(d.name,'Akua’s Kitchen');assert.equal(d.essentialId,'ess-food');assert.equal(d.checked,true);assert.equal(d.reviewFingerprint,undefined);assert.equal(d.submittedTxId,undefined);assert.equal(h.document.getElementById('payment-amount').value,'25');assert.deepEqual(ledger(h),before);clean(h);
});

check('send and Money Box commands open editable existing flows and default to after-budget money',()=>{
 const h=fixture();h.L.openBankingChat();h.flush();const before=ledger(h);let r=ask(h,'Send GH₵20 to Ama');assert.equal(r.bankingProposal.targetId,'ama');assert.equal(r.bankingProposal.sourceId,'');
 h.L.chatOpenAnswer(h.L.state.chats.length-1);h.flush();assert.equal(h.L.state.paymentDraft.recipient,'ama');assert.equal(h.L.state.paymentDraft.amount,'20');assert.equal(h.L.state.paymentDraft.essentialId,'');assert.deepEqual(ledger(h),before);
 h.L.leavePayment();h.L.discardPayment();h.flush();
 r=ask(h,'Put GH₵50 in my laptop box');assert.equal(r.bankingProposal.targetId,'goal-laptop');h.L.chatOpenAnswer(h.L.state.chats.length-1);h.flush();assert.equal(h.L.route,'allocate');assert.equal(h.L.state.paymentDraft.boxId,'goal-laptop');assert.equal(h.L.state.paymentDraft.amount,'50');assert.equal(h.document.getElementById('allocation').value,'50');assert.deepEqual(ledger(h),before);clean(h);
});

check('one missing amount is clarified, without borrowing an unrelated earlier amount',()=>{
 const h=fixture();h.L.openBankingChat();h.flush();const before=ledger(h);ask(h,'Can I spend GH₵80?');let r=ask(h,'Pay Akua from Food');assert.equal(r.intent,'bankingClarification');assert.equal(r.bankingPending.missing,'amount');assert(!r.bankingProposal);assert.equal((r.headline.match(/\?/g)||[]).length,1);
 r=ask(h,'25');assert.equal(r.bankingProposal.amount,25);assert.equal(r.bankingProposal.targetId,'AK01');assert.equal(r.bankingProposal.sourceId,'ess-food');assert.deepEqual(ledger(h),before);
 ask(h,'Pay Ama');r=ask(h,'Where did my money go?');assert.notEqual(r.intent,'bankingDraft');assert.equal(h.L.params.pendingBanking,undefined);r=ask(h,'40');assert.notEqual(r.intent,'bankingDraft');assert.deepEqual(ledger(h),before);clean(h);
});

check('unknown and ambiguous recipients ask once and choices complete the same proposal',()=>{
 const h=fixture();h.L.openBankingChat();h.flush();let r=ask(h,'Send GH₵20');assert.equal(r.intent,'bankingClarification');assert.equal(r.bankingPending.missing,'target');assert(r.bankingPending.choices.length>=3);
 h.L.chatOpenAnswer(h.L.state.chats.length-1);h.flush();assert.equal(h.L.route,'chatBankingChoice');assert.equal(h.L.taskSheet.parentRoute,'chat');const i=r.bankingPending.choices.findIndex(c=>c.id==='ama');h.L.chatChooseBankingDetail(h.L.state.chats.length-1,i);h.flush();assert.equal(h.L.route,'chat');r=h.L.state.chats.at(-1);assert.equal(r.bankingProposal.amount,20);assert.equal(r.bankingProposal.targetId,'ama');assert.equal(h.L.state.paymentDraft,undefined);
 r=ask(h,'Pay Person Who Does Not Exist GH₵25');assert.equal(r.intent,'bankingClarification');assert(!r.bankingProposal);assert(!h.L.state.paymentDraft);
 h.L.state.goals.push({id:'laptop-other',name:'Laptop repairs',target:300,allocated:0});r=ask(h,'Put GH₵50 in my laptop box');assert.equal(r.intent,'bankingClarification');assert.equal(r.bankingPending.choices.length,2);clean(h);
});

check('ambiguous, foreign, excessive and malformed amounts cannot create executable proposals',()=>{
 const h=fixture(),before=ledger(h);
 for(const q of ['Pay Akua GH₵25 or 30','Pay Akua about GH₵25','Pay Akua GH₵-25','Send USD20 to Ama','Send €20 to Ama','Send 20USD to Ama','Pay Akua GH₵1,000,000','Pay Akua GH₵1000000000000000000000000','Pay Akua GH₵0','Pay Akua GH₵25.123','Pay Akua GH₵20 and GH₵30']){const r=answer(h,q);assert.equal(r.intent,'bankingClarification',q);assert(!r.bankingProposal,q);}
 assert.equal(answer(h,'Pay Akua GH₵5,000').bankingProposal.amount,5000);assert.equal(answer(h,'Pay Akua GH₵0.01').bankingProposal.amount,.01);assert.deepEqual(ledger(h),before);clean(h);
});

check('cancellation and unrelated follow-ups clear a clarification without changing saved funds',()=>{
 const h=fixture();h.L.openBankingChat();h.flush();const before=ledger(h);ask(h,'Pay Akua');let r=ask(h,'cancel');assert.equal(r.intent,'bankingCancelled');assert.equal(h.L.params.pendingBanking,undefined);assert.deepEqual(ledger(h),before);
 ask(h,'Pay Akua');r=ask(h,'How long will my money last?');assert.notEqual(r.intent,'bankingDraft');assert.equal(h.L.params.pendingBanking,undefined);assert.doesNotMatch(r.text,/good till Friday|guarantee/i);clean(h);
});

check('old proposals, removed sources and duplicate taps never bypass review and approval',()=>{
 const h=fixture();h.L.openBankingChat();h.flush();const before=ledger(h);let r=ask(h,'Pay Akua GH₵25 from Food'),index=h.L.state.chats.length-1;
 h.L.state.essentials.find(c=>c.id==='ess-food').archived=true;assert.equal(h.L.openChatBankingDraft(index),false);assert(!h.L.state.paymentDraft);delete h.L.state.essentials.find(c=>c.id==='ess-food').archived;
 h.advance(16*60*1000);assert.equal(h.L.openChatBankingDraft(index),false);assert(!h.L.state.paymentDraft);
 r=ask(h,'Send GH₵20 to Ama');index=h.L.state.chats.length-1;h.L.chatOpenAnswer(index);h.flush();const id=h.L.state.paymentDraft.id;h.L.chatOpenAnswer(index);h.flush();assert.equal(h.L.route,'chatBankingReplace');assert.equal(h.L.state.paymentDraft.id,id);assert.deepEqual(ledger(h),before);assert.equal(h.L.paymentAuthorizationCurrent(),false);clean(h);
});

check('an unfinished draft is kept until replacing it is explicitly chosen',()=>{
 const h=fixture();h.L.openBankingChat();h.flush();ask(h,'Send GH₵20 to Ama');h.L.chatOpenAnswer(0);h.flush();const old=clone(h.L.state.paymentDraft),before=ledger(h);h.L.leavePayment();h.L.keepPaymentLater();h.flush();ask(h,'Pay Akua GH₵30 from Food');const index=h.L.state.chats.length-1;h.L.chatOpenAnswer(index);h.flush();assert.equal(h.L.route,'chatBankingReplace');assert.deepEqual(clone(h.L.state.paymentDraft),old);
 h.L.closeTask();h.flush();assert.equal(h.L.route,'chat');assert.deepEqual(clone(h.L.state.paymentDraft),old);h.L.chatOpenAnswer(index);h.flush();assert.equal(h.L.openChatBankingDraft(index,true),true);h.flush();assert.equal(h.L.route,'send');assert.equal(h.L.state.paymentDraft.merchantId,'AK01');assert.equal(h.L.state.paymentDraft.amount,'30');assert.deepEqual(ledger(h),before);clean(h);
});

check('keyboard draft, calculations and full-screen conversation survive new detail sheets',()=>{
 const h=fixture({reducedMotion:true});h.L.openBankingChat();h.flush();const r=ask(h,'How much did I spend today?');assert(r.calculation);h.set('chatText','Keep this question');h.L.chatOpenAnswer(h.L.state.chats.length-1);h.flush();assert.equal(h.L.route,'chatCalendarPayments');assert.equal(h.L.taskSheet.parentRoute,'chat');assert.equal(h.document.getElementById('nav').hidden,true);h.L.closeTask();h.flush();assert.equal(h.L.route,'chat');assert.equal(h.document.getElementById('chatText').value,'Keep this question');assert.equal(h.document.getElementById('nav').hidden,false);assert(h.document.getElementById('chat-thread'));clean(h);
});

check('Chat-launched payments preserve success, pending and failure outcomes and duplicate protection',()=>{
 for(const outcome of ['Completed','Pending','Failed']){
  const h=fixture({testing:true});h.L.openBankingChat();h.flush();const available=h.L.balances().available,balance=h.L.state.balance,count=h.L.state.txs.length,spent=h.L.dailySpendingSummary({period:'today'}).total;
  ask(h,'Pay Akua GH₵80 from Food');h.L.chatOpenAnswer(h.L.state.chats.length-1);h.flush();h.L.preparePayment();h.flush();assert.equal(h.L.route,'paymentReview');assert.equal(h.L.state.balance,balance);h.L.continuePayment();h.flush();assert.equal(h.L.route,'authorize');assert.equal(h.L.state.txs.length,count);
  h.set('payment-pin','123456');h.set('payment-outcome',outcome);h.submit(h.document.getElementById('view').querySelector('form'));h.flush();assert.equal(h.L.route,'paymentResult');assert.equal(h.L.state.txs.length,count+1);const result=h.L.state.txs.find(t=>t.id===h.L.params.id);
  assert.equal(result.status,{Completed:'success',Pending:'pending',Failed:'failed'}[outcome]);assert.equal(h.L.state.balance,balance-(outcome==='Completed'?80:0));assert.equal(h.L.balances().available,available-(outcome==='Failed'?0:80));assert.equal(h.L.dailySpendingSummary({period:'today'}).total,spent+(outcome==='Completed'?80:0));
  h.L.authorizePayment();h.flush();assert.equal(h.L.state.txs.length,count+1);assert.equal(h.L.state.balance,balance-(outcome==='Completed'?80:0));clean(h);
 }
});

check('a changed budget invalidates the old payment quote before PIN submission',()=>{
 const h=fixture({testing:true});h.L.openBankingChat();h.flush();ask(h,'Send GH₵20 to Ama');h.L.chatOpenAnswer(h.L.state.chats.length-1);h.flush();h.L.preparePayment();h.L.continuePayment();h.flush();assert.equal(h.L.route,'authorize');const balance=h.L.state.balance,count=h.L.state.txs.length;
 h.L.state.essentials[0].amount+=10;h.set('payment-pin','123456');h.submit(h.document.getElementById('view').querySelector('form'));h.flush();assert.equal(h.L.route,'paymentReview');assert.equal(h.L.state.balance,balance);assert.equal(h.L.state.txs.length,count);clean(h);
});

check('a meaningful Chat-launched trade-off still passes through Pause before separate authentication',()=>{
 const h=fixture({testing:true});h.L.openBankingChat();h.flush();ask(h,'Pay Akua GH₵500');h.L.chatOpenAnswer(h.L.state.chats.length-1);h.flush();const balance=h.L.state.balance,count=h.L.state.txs.length;h.L.preparePayment();h.L.continuePayment();h.flush();assert.equal(h.L.route,'pause');assert.equal(h.L.state.balance,balance);assert.equal(h.L.state.txs.length,count);
 h.L.resumeFromPause();h.advance(100);assert.equal(h.L.route,'pause');h.advance(5000);h.L.resumeFromPause();h.advance(100);h.flush();assert.equal(h.L.route,'authorize');assert.equal(h.L.state.balance,balance);assert.equal(h.L.state.txs.length,count);clean(h);
});

console.log(`${passed} passed; ${failed} failed`);
