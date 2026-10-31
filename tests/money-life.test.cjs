'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const {createHarness}=require('./helpers/task-sheet-dom.cjs');
const clone=x=>JSON.parse(JSON.stringify(x));
function fixture(){const h=createHarness({testing:true,clock:true}),{L}=h;L.explore();L.ensureAccounts();Object.assign(L.state,{balance:500,txs:[],paymentDraft:null,essentials:[{id:'food',name:'Food',amount:250,paid:0,externalPaid:0,coverageVersion:1},{id:'transport',name:'Transport',amount:100,paid:0,externalPaid:0,coverageVersion:1}],goals:[{id:'laptop',name:'Laptop',allocated:100,target:3000,boxVersion:2}],allowance:{amount:1200,date:date(h,4)},planHorizon:{mode:'allowance',date:date(h,4)},planSaved:true});L.openTab('home');L.render();h.flush();return h;}
const date=(h,days=0)=>new h.context.Date(h.context.Date.now()+days*86400000).toISOString().slice(0,10);
const funds=L=>JSON.stringify([L.state.balance,L.state.txs,L.state.essentials,L.state.goals]);
const debt=(h,fields={})=>h.L.moneyLife.createDebt({direction:'owe',person:'Abena Asante',amount:80,dueDate:date(h,3),contactId:'abena',...fields},h.L.id('test-iou'));
const clean=h=>assert.deepEqual(h.errors,[]);
function pay(h,id,amount=80,outcome='Completed'){
 const {L}=h;L.lifeUI.beginPayment(id,'lumo');h.flush();h.set('payment-amount',amount);h.set('payment-essential','');L.reviewTransactionDetails();h.flush();
 if(L.route==='paymentReview'){L.continuePayment();h.flush();}
 if(L.route==='pause'){h.advance(3900);const b=h.document.querySelector('[data-pause-hold]');assert(b);b.click();h.advance(90);h.flush();}
 assert.equal(L.route,'authorize');h.set('payment-pin','123456');h.set('payment-outcome',outcome);L.authorizePayment();h.flush();assert.equal(L.route,'paymentResult');return L.state.txs[0];
}
test('IOUs in both directions support partial records, corrections, editing, closure, reopening and settlement without moving money',()=>{
 const h=fixture(),{L}=h,G=L.moneyLife,before=funds(L);let a=debt(h),b=debt(h,{direction:'owed',person:'Kojo',amount:60});
 assert.deepEqual(clone(G.totals()),{owe:80,owed:60,pending:0});
 a=G.manual(a.id,{amount:30,channel:'cash',date:date(h),key:'part-one'},a.revision);assert.equal(a.remaining,50);assert.equal(a.status,'partial');
 assert.equal(G.manual(a.id,{amount:30,channel:'cash',date:date(h),key:'part-one'},1).remaining,50,'same operation cannot record twice');
 assert.throws(()=>G.updateDebt(a.id,{...a,amount:20},a.revision),/less than repayments/);
 a=G.correctManual(a.id,a.events[0].id,'Wrong amount',a.revision);assert.equal(a.remaining,80);assert.equal(a.events[0].status,'corrected');
 a=G.manual(a.id,{amount:80,channel:'momo',reference:'M-001',date:date(h),key:'part-two'},a.revision);assert.equal(a.status,'settled');
 b=G.closeDebt(b.id,'Agreed to forgive the unpaid balance',b.revision);assert.equal(b.remaining,60);assert.equal(G.totals().owed,0);
 b=G.reopenDebt(b.id,b.revision);assert.equal(G.totals().owed,60);assert.equal(b.history.at(-1).type,'reopened');assert.equal(funds(L),before);clean(h);
});
test('native authenticated repayment updates the same IOU and ledger atomically once; confirmed refund reopens the unpaid amount',()=>{
 const h=fixture(),{L}=h,d=debt(h),t=pay(h,d.id,30);assert.equal(L.state.balance,470);assert.equal(L.moneyLife.get(d.id).remaining,50);assert.equal(t.iouId,d.id);assert.equal(L.moneyLife.get(d.id).paid,30);
 L.authorizePayment();assert.equal(L.state.balance,470);assert.equal(L.state.txs.length,1);L.refundPayment(t.id);h.flush();assert.equal(L.state.balance,500);assert.equal(L.moneyLife.get(d.id).remaining,80);clean(h);
});
test('pending repayment reserves IOU capacity and money; failed resolution releases both; fresh retry settles once',()=>{
 const h=fixture(),{L}=h,d=debt(h),t=pay(h,d.id,80,'Pending');let q=L.moneyLife.get(d.id);assert.equal(q.remaining,80);assert.equal(q.pending,80);assert.equal(q.payable,0);assert.equal(L.balances().available,420);
 assert.throws(()=>L.moneyLife.manual(d.id,{amount:1,channel:'cash',date:date(h),key:'blocked'},q.revision),/being checked/);
 assert.throws(()=>L.moneyLife.closeDebt(d.id,'Close',q.revision),/being checked/);
 L.resolveTx(t.id,'failed');assert.equal(L.moneyLife.get(d.id).payable,80);assert.equal(L.balances().available,500);
 L.state.paymentDraft=null;L.save();L.go('iouDetail',{id:d.id});h.flush();pay(h,d.id,80);assert.equal(L.moneyLife.get(d.id).remaining,0);assert.equal(L.state.balance,420);clean(h);
});
test('an IOU edit after review blocks approval and a recipient or amount change requires new review',()=>{
 const h=fixture(),{L}=h,d=debt(h);L.lifeUI.beginPayment(d.id,'lumo');h.flush();h.set('payment-amount',30);L.reviewTransactionDetails();h.flush();L.continuePayment();h.flush();assert.equal(L.route,'authorize');
 L.moneyLife.updateDebt(d.id,{...d,amount:100},d.revision);h.set('payment-pin','123456');L.authorizePayment();h.flush();assert.equal(L.state.balance,500);assert.equal(L.state.txs.length,0);assert.equal(L.route,'paymentReview');assert.match(h.document.getElementById('error').textContent,/changed/);clean(h);
});
test('incoming receipts link without double credit; native request receipts settle the debt and cancellation preserves the IOU',()=>{
 const h=fixture(),{L}=h,G=L.moneyLife;let d=debt(h,{direction:'owed',amount:100});const t=L.addTx({type:'in',name:'Abena',amount:40,status:'success'}),balance=L.state.balance;
 d=G.linkCredit(d.id,t.id,d.revision);assert.equal(d.remaining,60);assert.equal(L.state.balance,balance);assert.throws(()=>G.linkCredit(d.id,t.id,d.revision),/unlinked/);
 const r=G.request(d.id,d.revision);assert.equal(r.amount,60);L.simRequestCredit(r.id);h.flush();assert.equal(G.get(d.id).remaining,0);assert.equal(L.state.balance,600);L.simRequestCredit(r.id);assert.equal(L.state.balance,600);
 let other=debt(h,{direction:'owed',person:'Ama',amount:75}),request=G.request(other.id,other.revision);L.closeRequest(request.id,'cancelled');assert.equal(G.get(other.id).remaining,75);clean(h);
});
test('manual partial receipt invalidates an unpaid request and cannot invent Lumo money',()=>{
 const h=fixture(),{L}=h,G=L.moneyLife;let d=debt(h,{direction:'owed'});const r=G.request(d.id,d.revision);d=G.get(d.id);G.manual(d.id,{amount:20,channel:'cash',date:date(h),key:'partial'},d.revision);assert.equal(L.state.requests.find(x=>x.id===r.id).status,'cancelled');L.simRequestCredit(r.id);assert.equal(L.state.balance,500);assert.equal(G.get(d.id).remaining,60);clean(h);
});
test('All Your Money counts accounts, savings and cards once, labels stale manual balances and excludes debts, expected money and group pots',()=>{
 const h=fixture(),{L}=h,G=L.moneyLife,before=funds(L);debt(h,{direction:'owed',amount:5000});debt(h,{amount:900});
 const card=L.virtualCards.issue({name:'Online'});L.virtualCards.fund({cardId:card.id,amount:50,draftId:'card-50'});
 G.saveSource({kind:'momo',name:'MTN wallet',amount:100,asOf:date(h,-2),distinct:true},null,null,'mtn');G.saveSource({kind:'cash',name:'Cash in wallet',amount:30,asOf:date(h),distinct:true},null,null,'cash');
 const summary=G.holdings();assert.equal(summary.total,730);assert.equal(summary.lumo,600);assert.equal(summary.cards,50);assert.equal(summary.savings,100);assert.equal(summary.recorded,130);assert.equal(summary.stale,1);
 assert.throws(()=>G.saveSource({kind:'momo',name:'MTN wallet',amount:50,asOf:date(h),distinct:true}),/already listed/);assert.throws(()=>G.saveSource({kind:'bank',name:'Lumo',amount:50,asOf:date(h),distinct:true}),/already have/);assert.throws(()=>G.saveSource({kind:'cash',name:'Cash',amount:50,asOf:date(h),distinct:false}),/Confirm/);
 const cash=summary.sources.find(x=>x.kind==='cash');G.removeSource(cash.id,cash.revision);assert.equal(G.holdings().total,700);assert.notEqual(funds(L),before,'only the explicitly requested card funding changed funds');clean(h);
});
test('recovery protects costs, counts a linked IOU once, excludes expected money and applies only reviewed changes',()=>{
 const h=fixture(),{L}=h,G=L.moneyLife;L.state.balance=200;debt(h,{amount:50,essentialId:'food'});debt(h,{person:'Kojo',amount:40});const input={reviewDate:date(h,7),adjustments:{transport:{protected:false,amount:20}},pauseSavings:false};const q=G.recoveryQuote(input),allowance=JSON.stringify(L.state.allowance),horizon=JSON.stringify(L.state.planHorizon),money=JSON.stringify([L.state.balance,L.state.goals,L.state.txs]);
 assert.equal(q.costs,270);assert.equal(q.debtExtra,40);assert.equal(q.gap,110);assert.equal(q.reduction,80);assert.equal(q.available,200);
 const r=G.applyRecovery(input,q.signature,'bridge');assert.equal(L.state.essentials.find(x=>x.id==='food').amount,250);assert.equal(L.state.essentials.find(x=>x.id==='transport').amount,20);assert.equal(JSON.stringify(L.state.allowance),allowance);assert.equal(JSON.stringify(L.state.planHorizon),horizon);assert.equal(JSON.stringify([L.state.balance,L.state.goals,L.state.txs]),money);assert.equal(r.startingGap,110);
 assert.equal(G.applyRecovery(input,'already-used','bridge').id,r.id);clean(h);
});
test('recovery changes are rejected after money changes, pending costs are not double counted and new confirmed money can complete recovery',()=>{
 const h=fixture(),{L}=h,G=L.moneyLife;L.addTx({type:'out',name:'Food pending',amount:50,fee:0,status:'pending',essentialId:'food'});const input={reviewDate:date(h,5),adjustments:{},pauseSavings:false},q=G.recoveryQuote(input);assert.equal(q.available,450);assert.equal(q.costs,300);
 L.addTx({type:'in',name:'Money arrived',amount:10,status:'success'});assert.throws(()=>G.applyRecovery(input,q.signature,'stale'),/changed/);
 const quote=G.recoveryQuote(input),r=G.applyRecovery(input,quote.signature,'fresh');h.advance(1000);const t=L.addTx({type:'in',name:'Allowance',amount:300,status:'success'}),balance=L.state.balance;G.finishRecovery(r.id,t.id);assert.equal(G.activeRecovery().status,'completed');assert.equal(L.state.balance,balance);clean(h);
});
test('a failed browser save rolls back the authenticated debit and IOU repayment together',()=>{
 const h=fixture(),{L}=h,d=debt(h);L.lifeUI.beginPayment(d.id,'lumo');h.flush();h.set('payment-amount',30);L.reviewTransactionDetails();h.flush();L.continuePayment();h.flush();h.set('payment-pin','123456');const saved=clone(L.state);h.context.localStorage.setItem=()=>{throw Error('quota');};L.authorizePayment();h.flush();assert.equal(L.state.balance,saved.balance);assert.equal(L.state.txs.length,0);assert.equal(L.moneyLife.get(d.id).remaining,80);assert.equal(L.persistence.status().blocked,true);clean(h);
});
test('Home Pay opens the full Payments root and sidebar entries close into real registered tasks',()=>{
 const h=fixture(),{L}=h;const transfer=h.document.querySelectorAll('.mono-home-actions button').find(x=>(x.querySelector('.signal-action-label')||x).textContent.trim()==='Pay');assert(transfer);transfer.click();h.flush();assert.equal(L.route,'pay');assert.equal(L.taskSheet.active,false);assert(h.document.querySelector('.pay-tabs'));
 L.openTab('home');h.flush();L.openMonoMenu();h.flush();const money=h.document.querySelector('[data-menu-route="allMoney"]');assert(money);money.click();h.flushHistory();h.flush();assert.equal(L.route,'allMoney');assert.equal(L.taskSheet.parentRoute,'home');assert.match(h.document.getElementById('view').textContent,/Recorded so far/);L.closeTask();h.flushHistory();h.flush();assert.equal(L.route,'home');clean(h);
});
test('mounted IOU and balance forms complete review, preserve draft state and use real financial results',()=>{
 const h=fixture(),{L}=h;L.lifeUI.startDebt();h.flush();h.set('iou-person','Kojo');h.set('iou-amount',65);h.set('iou-direction','owed');L.lifeUI.reviewDebt();h.flush();assert.equal(L.route,'iouReview');L.lifeUI.saveDebt();h.flush();assert.equal(L.route,'iouDetail');const d=L.moneyLife.debts()[0];assert.equal(d.person,'Kojo');
 L.lifeUI.startRecord(d.id);h.flush();h.set('iou-repayment',15);L.lifeUI.reviewRecord();h.flush();L.lifeUI.saveRecord();h.flush();assert.equal(L.moneyLife.get(d.id).remaining,50);assert.equal(L.state.balance,500);
 L.lifeUI.startSource();h.flush();h.set('money-name','MTN wallet');h.set('money-amount',120);h.document.getElementById('money-distinct').checked=true;L.lifeUI.reviewSource();h.flush();assert.equal(L.route,'moneySourceReview');L.lifeUI.saveSource();h.flush();assert.equal(L.route,'allMoney');assert.equal(L.moneyLife.holdings().total,720);clean(h);
});
test('mounted recovery is a reviewed three-step journey and Chat only prepares destinations',()=>{
 const h=fixture(),{L}=h,before=funds(L);L.lifeUI.startRecovery();h.flush();assert.equal(L.route,'recoveryStart');L.lifeUI.recoveryNext();h.flush();assert.equal(L.route,'recoveryAdjust');L.lifeUI.protect('transport',false);h.flush();h.set('recovery-cost-transport',50);L.lifeUI.reviewRecovery();h.flush();assert.equal(L.route,'recoveryReview');assert.equal(funds(L),before);L.lifeUI.saveRecovery();h.flush();assert.equal(L.route,'recoveryPlan');assert.equal(L.state.essentials.find(x=>x.id==='transport').amount,50);assert.equal(L.state.balance,500);
 const money=funds(L);for(const [q,r]of [['My allowance is late','recoveryStart'],['Show me all my money','allMoney'],['How much do I owe?','iouHome']])assert.equal(L.chatAnswer(q).route,r);assert.equal(funds(L),money);clean(h);
});
test('IOU payments keep the native Pause clock, exact external fees and separate authorisation',()=>{
 const h=fixture(),{L}=h,d=debt(h,{amount:280});L.lifeUI.beginPayment(d.id,'lumo');h.flush();h.set('payment-amount',280);L.reviewTransactionDetails();h.flush();assert.equal(L.route,'pause');assert(h.document.querySelector('.ml-payment-link'));assert.equal(L.moneyLife.get(d.id).paid,0);h.advance(3900);h.document.querySelector('[data-pause-hold]').click();h.advance(90);h.flush();assert.equal(L.route,'authorize');assert.equal(L.moneyLife.get(d.id).paid,0);h.set('payment-pin','123456');L.authorizePayment();h.flush();assert.equal(L.moneyLife.get(d.id).remaining,0);clean(h);
 for(const method of ['momo','bank']){const h=fixture(),{L}=h,d=debt(h);L.lifeUI.beginPayment(d.id,method);h.flush();L.sampleRecipient();h.set('payment-amount',30);L.reviewTransactionDetails();h.flush();assert.equal(L.route,'paymentReview');L.continuePayment();h.flush();assert.equal(L.route,'authorize');h.set('payment-pin','123456');L.authorizePayment();h.flush();assert.equal(L.route,'paymentResult');assert.equal(L.moneyLife.get(d.id).remaining,50);assert.equal(L.state.balance,method==='bank'?469:469.5);clean(h);}
});
test('recovery can pause standing savings without withdrawing money; save failure rolls back costs and pause together',()=>{
 for(const fail of [false,true]){const h=fixture(),{L}=h,G=L.moneyLife;assert.equal(L.savingsHacks.configure({boxId:'laptop',kind:'spend',value:5,consent:true}).ok,true);const input={reviewDate:date(h,7),adjustments:{transport:{protected:false,amount:20}},pauseSavings:true},q=G.recoveryQuote(input),balance=L.state.balance,saved=L.accountBalances().savings;
  if(fail)h.context.localStorage.setItem=()=>{throw Error('quota');};
  if(fail){assert.throws(()=>G.applyRecovery(input,q.signature,'pause-fail'),/saved|committed/);assert.equal(L.state.essentials.find(x=>x.id==='transport').amount,100);assert.equal(L.savingsHacks.get('laptop').enabled,true);assert.equal(G.activeRecovery(),null);}
  else{const first=G.applyRecovery(input,q.signature,'pause-pass');assert.equal(L.savingsHacks.get('laptop').enabled,false);assert.equal(first.pausedBoxes[0],'laptop');const nextInput={reviewDate:date(h,8),adjustments:{},pauseSavings:false},nextQuote=G.recoveryQuote(nextInput),next=G.applyRecovery(nextInput,nextQuote.signature,'revision');assert.equal(G.activeRecovery().id,next.id);assert.equal(L.state.moneyLife.recoveries.find(x=>x.id===first.id).status,'superseded');assert.throws(()=>G.finishRecovery(first.id,'missing'),/active/);}
  assert.equal(L.state.balance,balance);assert.equal(L.accountBalances().savings,saved);clean(h);
 }
});
test('pending money is held separately in All Your Money and a receipt cannot repay two IOUs',()=>{
 const h=fixture(),{L}=h,G=L.moneyLife,total=G.holdings().total;L.addTx({type:'in',name:'Pending allowance',amount:1200,status:'pending'});L.addTx({type:'out',name:'Pending purchase',amount:50,fee:1,status:'pending'});const q=G.holdings();assert.equal(q.total,total);assert.equal(q.held,51);assert.equal(q.available,449);
 const a=debt(h,{direction:'owed'}),b=debt(h,{direction:'owed',person:'Ama'}),credit=L.addTx({type:'in',name:'Friend',amount:20,status:'success'});G.linkCredit(a.id,credit.id,a.revision);assert.throws(()=>G.linkCredit(b.id,credit.id,b.revision),/unlinked/);assert.equal(G.get(b.id).paid,0);clean(h);
});
