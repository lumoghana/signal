'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const {createHarness}=require('./helpers/task-sheet-dom.cjs');
const clone=value=>JSON.parse(JSON.stringify(value));
const date=(h,n=0)=>new h.context.Date(h.context.Date.now()+n*86400000).toISOString().slice(0,10);
function fixture(balance=500){
 const h=createHarness({testing:true,clock:true}),{L}=h;L.explore();L.ensureAccounts();
 Object.assign(L.state,{balance,txs:[],paymentDraft:null,essentials:[{id:'food',name:'Food',amount:250,paid:0,externalPaid:0,coverageVersion:1},{id:'transport',name:'Transport',amount:100,paid:0,externalPaid:0,coverageVersion:1}],goals:[{id:'laptop',name:'Laptop',allocated:100,target:3000,boxVersion:2}],allowance:{amount:1200,date:date(h,4)},planHorizon:{mode:'allowance',date:date(h,4)},planSaved:true});
 L.openTab('home');L.render();h.flush();return h;
}
const debt=(h,fields={})=>h.L.moneyLife.createDebt({direction:'owe',person:'Abena Asante',amount:100,dueDate:date(h,1),...fields},h.L.id('audit-iou'));
const recovery=h=>{const input={reviewDate:date(h,4),adjustments:{},pauseSavings:false};return h.L.moneyLife.applyRecovery(input,h.L.moneyLife.recoveryQuote(input).signature,h.L.id('audit-recovery'));};
const income=(h,amount,extra={})=>{h.advance(1000);return h.L.addTx({type:'in',name:'Support received',amount,status:'success',...extra});};
const clean=h=>assert.deepEqual(h.errors,[]);
const money=L=>JSON.stringify([L.state.balance,L.state.txs,L.state.essentials,L.state.goals]);

test('an incoming IOU due tomorrow remains expected and changes no available funds, costs, Pause, daily guide or savings room',()=>{
 const h=fixture(),{L}=h,G=L.moneyLife,draft={method:'lumo',checked:true,name:'Kojo',destination:'@kojo.o',amount:100,fee:0};
 const position=JSON.stringify([L.balances(),L.pauseEngine.planPosition(draft),L.pauseEngine.evaluate(draft),L.spendingOutlook.summary()]),before=money(L),total=G.holdings().total;
 const d=debt(h,{direction:'owed',amount:10000});
 assert.equal(G.holdings().expectedIOUs,10000);assert.equal(G.holdings().total,total);assert.equal(money(L),before);
 assert.equal(JSON.stringify([L.balances(),L.pauseEngine.planPosition(draft),L.pauseEngine.evaluate(draft),L.spendingOutlook.summary()]),position);
 assert.equal(G.recoveryQuote({reviewDate:date(h,4),adjustments:{}}).spare,150);
 L.go('iouDetail',{id:d.id});h.flush();assert.match(L.views.iouDetail(),/Still expected/);assert.match(L.views.iouDetail(),/due date does not make it available/);
 L.state.balance=200;assert.equal(G.recoveryQuote({reviewDate:date(h,4),adjustments:{}}).gap,150,'expected receivables cannot cover a gap');clean(h);
});

test('only confirmed incoming principal becomes available, partial IOU receipt reduces expectation once and pending is excluded',()=>{
 const h=fixture(),{L}=h,G=L.moneyLife,d=debt(h,{direction:'owed'}),initial=L.balances().available;
 const request=G.request(d.id,d.revision),pending=income(h,30,{status:'pending',requestId:request.id});
 assert.equal(L.balances().available,initial);assert.equal(G.holdings().expectedIOUs,100);assert.equal(G.get(d.id).pending,30);
 L.resolveTx(pending.id,'success');assert.equal(L.balances().available,initial+30);assert.equal(G.holdings().expectedIOUs,70);assert.equal(G.get(d.id).paid,30);
 L.resolveTx(pending.id,'success');assert.equal(L.balances().available,initial+30);clean(h);
});

test('a GH1 receipt against a GH250 gap records progress, stays active and never shows recovery success',()=>{
 const h=fixture(200),{L}=h,G=L.moneyLife;debt(h);const r=recovery(h),t=income(h,1),before=money(L);
 const result=G.finishRecovery(r.id,t.id);assert.equal(result.status,'active');assert.equal(result.currentGap,249);assert.equal(result.received,1);assert.equal(money(L),before);
 L.go('recoveryPlan');h.flush();const html=L.views.recoveryPlan();assert.match(html,/Some money arrived/);assert.match(html,/249\.00/);assert.doesNotMatch(html,/breathing room|commitments are covered/);
 G.finishRecovery(r.id,t.id);assert.equal(G.activeRecovery().receiptIds.length,1);assert.equal(G.activeRecovery().received,1);assert.equal(G.recoveryCredits(r.id).length,0);clean(h);
});

test('recovery finishes only when recorded needs are covered and rechecks after later spending or receipt reversal',()=>{
 const h=fixture(200),{L}=h,G=L.moneyLife;debt(h);const r=recovery(h),a=income(h,1);G.finishRecovery(r.id,a.id);const b=income(h,249),balance=L.state.balance;
 G.finishRecovery(r.id,b.id);assert.equal(G.activeRecovery().status,'completed');assert.equal(G.activeRecovery().currentGap,0);assert.equal(L.state.balance,balance);
 L.go('recoveryPlan');h.flush();assert.match(L.views.recoveryPlan(),/reviewed commitments are covered/);
 L.addTx({type:'out',name:'New expense',amount:1,status:'success'});let current=G.activeRecovery();assert.equal(current.status,'active');assert.equal(current.needsReview,true);assert.equal(current.currentGap,1);
 const c=income(h,1);G.finishRecovery(r.id,c.id);assert.equal(G.activeRecovery().status,'completed');
 b.status='reversed';L.state.balance-=249;L.save();current=G.activeRecovery();assert.equal(current.status,'active');assert.equal(current.receiptChanged,true);assert.equal(current.currentGap,249);clean(h);
});

test('legacy false-completed recovery is read as active without mutating records and can be revised',()=>{
 const h=fixture(200),{L}=h,G=L.moneyLife;debt(h);const r=recovery(h),t=income(h,1),raw=L.state.moneyLife.recoveries[0];
 Object.assign(raw,{status:'completed',creditId:t.id,completedAt:new h.context.Date().toISOString()});const before=JSON.stringify(L.state);
 assert.equal(G.activeRecovery().status,'active');assert.equal(G.activeRecovery().currentGap,249);assert.equal(JSON.stringify(L.state),before);
 const replacement=recovery(h);assert.notEqual(replacement.id,r.id);assert.equal(L.state.moneyLife.recoveries.find(x=>x.id===r.id).status,'superseded');
 assert.throws(()=>G.finishRecovery(replacement.id,t.id),/new confirmed/);assert(!G.recoveryCredits(replacement.id).some(x=>x.id===t.id));clean(h);
});

test('recovery accepts already-confirmed IOU receipts as received money but never pending or internal transfers',()=>{
 const h=fixture(200),{L}=h,G=L.moneyLife,d=debt(h,{direction:'owed',amount:200}),r=recovery(h),request=G.request(d.id,d.revision);
 const t=income(h,150,{requestId:request.id});assert.equal(t.iouId,d.id);assert.equal(G.get(d.id).remaining,50);assert(G.recoveryCredits(r.id).some(x=>x.id===t.id));
 G.finishRecovery(r.id,t.id);assert.equal(G.activeRecovery().status,'completed');assert.equal(L.state.balance,350);
 const next=recovery(h),p=income(h,500,{status:'pending'});assert.throws(()=>G.finishRecovery(next.id,p.id),/confirmed/);
 const internal={id:'internal-move',type:'in',name:'Savings transfer',amount:50,status:'success',internalTransfer:true,date:new h.context.Date().toISOString()};L.state.txs.unshift(internal);assert.throws(()=>G.finishRecovery(next.id,internal.id),/confirmed/);clean(h);
});

test('a failed save rolls back partial recovery receipts and completion together',()=>{
 const h=fixture(200),{L}=h,G=L.moneyLife,r=recovery(h),t=income(h,1),before=JSON.stringify(L.state.moneyLife);
 h.context.localStorage.setItem=()=>{throw Error('quota');};assert.throws(()=>G.finishRecovery(r.id,t.id),/saved|committed/);assert.equal(JSON.stringify(L.state.moneyLife),before);assert.equal(L.state.balance,201);clean(h);
});

test('named IOU answers preserve person, direction, partial repayments and explicit aggregate scope',()=>{
 const h=fixture(),{L}=h,G=L.moneyLife,a=debt(h),b=debt(h,{person:'Kojo Owusu',amount:200});debt(h,{direction:'owed',amount:40});
 G.manual(a.id,{amount:20,channel:'cash',date:date(h),key:'part'},a.revision);
 for(const [q,amount]of [['How much do I owe Abena?',80],['What do I owe Abena Asante?',80],['How much do I owe Kojo?',200],['How much does Abena owe me?',40],['How much am I owed by Abena?',40],['Show Abena Asante’s IOUs',80],['What is owed to Abena Asante?',80]]){
  const answer=L.chatAnswer(q);assert.equal(answer.intent,'moneyLife',q);assert.match(answer.headline,new RegExp(amount+'\\.00'));assert.doesNotMatch(answer.headline,/280\.00/);assert(answer.context.moneyLifeScopeId);
 }
 assert.match(L.chatAnswer('How much do I owe?').headline,/280\.00 across/);assert.match(L.chatAnswer('Who owes me?').headline,/40\.00 is owed to you/);
 assert.equal(L.chatAnswer('Can I spend GH₵80 while Abena owes me?').intent,'affordability','A purchase question keeps the native affordability calculation');
 const reply=L.chatAnswer('How much do I owe Abena?');L.state.chats=[{q:'How much do I owe Abena?',...reply}];assert.equal(L.chatOpenAnswer(0),true);h.flush();assert.equal(L.route,'iouHome');assert.match(h.document.getElementById('view').textContent,/Abena/);assert.doesNotMatch(h.document.getElementById('view').textContent,/Kojo/);
 G.updateDebt(b.id,{...b,amount:201},b.revision);assert.match(L.chatSnapshotStatusExtra(reply),/records changed/);clean(h);
});

test('general and clarification Chat actions open real money-life journeys and respect locked accounts',()=>{
 const h=fixture(),{L}=h;debt(h);debt(h,{person:'Abena Boateng',amount:200});
 for(const [q,route]of [['How much do I owe?','iouHome'],['How much do I owe Abena?','iouHome'],['How much do I owe Adjoa?','iouHome'],['Show me all my money','allMoney'],['My allowance is late','recoveryStart']]){
  L.openTab('chat');h.flush();L.state.chats=[{q,...L.chatAnswer(q)}];assert.equal(L.chatOpenAnswer(0),true,q);h.flush();assert.equal(L.route,route,q);L.closeTask();h.flushHistory();h.flush();
 }
 L.state.chats=[{q:'How much do I owe?',...L.chatAnswer('How much do I owe?')}];L.state.locked=true;const before=L.route;assert.equal(L.chatOpenAnswer(0),false);assert.equal(L.route,before);clean(h);
});

test('ambiguous or missing names never receive someone else’s total and closed IOUs stay out of unpaid answers',()=>{
 const h=fixture(),{L}=h,G=L.moneyLife,a=debt(h);debt(h,{person:'Abena Boateng',amount:200});
 const ambiguous=L.chatAnswer('How much do I owe Abena?');assert.match(ambiguous.headline,/Which abena/);assert.doesNotMatch(ambiguous.text,/300\.00/);assert.match(ambiguous.support,/Abena Asante/);assert.match(ambiguous.support,/Abena Boateng/);
 const missing=L.chatAnswer('How much do I owe Adjoa?');assert.match(missing.headline,/No IOU found/);assert.doesNotMatch(missing.text,/300\.00|100\.00|200\.00/);
 G.closeDebt(a.id,'No longer collecting this record',a.revision);const closed=L.chatAnswer('How much do I owe Abena Asante?');assert.match(closed.headline,/0\.00/);assert.match(closed.support,/Current recorded unpaid/);clean(h);
});

test('native authenticated exports retain money-life records after closure and exclude secrets, drafts and removed-source loss',async()=>{
 const h=fixture(),{L}=h,G=L.moneyLife,d=debt(h),r=recovery(h);
 const source=G.saveSource({kind:'momo',name:'MTN wallet',amount:120,asOf:date(h),distinct:true},null,null,'source-op');G.removeSource(source.id,source.revision);
 L.state.moneyLifeDrafts={debt:{person:'UNSAVED DRAFT',pin:'SECRET PIN'}};
 let blobs=[];h.context.URL.createObjectURL=b=>{blobs.push(b);return 'blob:audit'};
 const download=pin=>{L.go('dataExport');h.flush();h.set('authPin',pin);L.acct.downloadData();};
 download('000000');assert.equal(blobs.length,0);download('123456');assert.equal(blobs.length,1);const open=JSON.parse(await blobs[0].text());
 L.state.closed=true;download('123456');assert.equal(blobs.length,2);const closed=JSON.parse(await blobs[1].text());
 assert.deepEqual(closed.moneyLife,open.moneyLife);assert.equal(closed.moneyLife.debts[0].id,d.id);assert.equal(closed.moneyLife.recoveries[0].id,r.id);assert(closed.moneyLife.sources[0].removedAt);assert.equal(closed.moneyLife.sourceHistory.length,2);
 const serial=JSON.stringify(closed.moneyLife);assert.doesNotMatch(serial,/creationKey|"key"|SECRET PIN|UNSAVED DRAFT|123456/);
 L.state.locked=true;assert.throws(()=>G.exportRecords(),/Sign in/);L.acct.downloadData();h.flush();assert.equal(L.route,'signin');assert.equal(blobs.length,2);L.state.locked=false;L.state.onboarded=false;assert.throws(()=>G.exportRecords(),/Sign in/);clean(h);
});
