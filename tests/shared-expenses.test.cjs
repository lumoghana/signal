/* Mounted same-device shared-cost tasks against the shipped ledger and sheet
   controller. This tests accounting, idempotency and navigation, not geometry. */
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {createHarness}=require('./helpers/task-sheet-dom.cjs');
const index=fs.readFileSync(path.resolve(__dirname,'../dist/index.html'),'utf8');
const modules=require('./helpers/shipped-entry.cjs').scripts(require('node:path').resolve(__dirname,'..'));
if(!modules.includes('shared-expenses.js'))modules.push('shared-expenses.js');
let passed=0;
const check=(name,fn)=>{fn();passed++;console.log('PASS '+name);};
const view=h=>h.document.getElementById('view');
const clean=h=>assert.deepEqual(h.errors,[],'No rendering fallback');
function fixture(amount=90.01,fee=1){
 const h=createHarness({clock:true,testing:true,modules}),{L}=h;L.explore();L.ensureAccounts();
 Object.assign(L.state,{balance:600,txs:[],requests:[],paymentDraft:null,chats:[],essentials:[],goals:[],sharedExpenses:undefined});
 const payment=L.addTx({draftId:'shared-original',type:'out',status:'success',name:'Akua’s Kitchen',amount,fee,category:'Food',method:'Campus Pay',note:'Lunch together'});
 L.route='home';L.params={};L.history=[];L.save();L.render();h.flush();return {h,L,payment};
}
// These fixtures reopen unfinished splits saved by the earlier release. New
// receipt/Collect entry uses the current group journey, verified separately.
function start(f){
 const {L,h,payment}=f;L.state.sharedExpenses=L.state.sharedExpenses||{groups:[],draft:null,receiptDraft:null};const store=L.state.sharedExpenses,existing=store.groups.find(g=>g.txId===payment.id);
 if(existing){L.startSharedExpense(payment.id);h.flush();return store.draft;}
 let d=store.draft;if(!d||d.txId!==payment.id||d.createdGroupId){const total=L.sharedExpenses.netCents(payment),each=Math.floor(total/3);d={id:L.id('SG'),txId:payment.id,totalCents:total,title:String(payment.note||payment.name),mode:'equal',ownerAmount:((each+total-each*3)/100).toFixed(2),friends:[{id:L.id('SS'),name:'',amount:(each/100).toFixed(2)},{id:L.id('SS'),name:'',amount:(each/100).toFixed(2)}],stage:'form'};store.draft=d;}
 L.go(d.stage==='review'?'sharedSplitReview':'sharedSplit',{id:d.id,txId:d.txId});h.flush();return d;
}
function names(f){f.h.set('shared-name-0','Abena');f.h.set('shared-name-1','Kojo');f.L.captureSharedSplit();}
function create(f){start(f);names(f);f.L.reviewSharedExpense();f.h.flush();f.L.createSharedExpense();f.h.flush();clean(f.h);return f.L.state.sharedExpenses.groups[0];}
function receipt(f,g,s,amount){f.L.prepareSharedReceipt(g.id,s.id);f.h.flush();f.h.set('shared-received-amount',amount);f.L.simulateSharedReceipt();f.h.flush();clean(f.h);return f.L.state.sharedExpenses.receiptDraft;}
check('only confirmed external outgoing payments are eligible and refunds reduce the split basis',()=>{
 const f=fixture(),{L,payment}=f;assert(L.sharedExpenses.eligible(payment));
 for(const change of [{status:'pending'},{status:'failed'},{status:'reversed'},{type:'in'},{type:'internal',internalTransfer:true},{internal:true}])assert(!L.sharedExpenses.eligible({...payment,...change}));
 L.state.txs.unshift({id:'partial-refund',originalId:payment.id,type:'in',status:'success',amount:10});payment.refunded=10;
 assert.equal(L.sharedExpenses.netCents(payment),8001,'Same refund represented twice is subtracted once');
 const d=start(f);assert.equal(d.totalCents,8001);clean(f.h);
});
check('equal shares allocate indivisible cents once and exclude the owner from requests',()=>{
 const f=fixture(),{L,h}=f,balance=L.state.balance,g=create(f);
 assert.equal(g.ownerCents,3001);assert.equal(g.shares.length,2);assert(g.shares.every(s=>s.amountCents===3000));
 assert.equal(g.ownerCents+g.shares.reduce((sum,s)=>sum+s.amountCents,0),9001);
 assert.equal(L.state.requests.length,2);assert(L.state.requests.every(r=>r.from==='self'&&r.amount===30&&r.sharedGroupId===g.id));
 assert.equal(L.state.balance,balance,'Creating and displaying a request cannot credit money');assert.equal(L.state.txs.length,1);
 assert.equal(L.sharedExpenses.summary(g).dueCents,6000);assert.equal(L.sharedExpenses.summary(g).status,'waiting');
 assert(view(h).textContent.includes('Unpaid shares are not part of your available balance.'));clean(h);
});
check('custom amounts require exact cents, distinct friend names, a valid sum and at most five friends',()=>{
 const f=fixture(),{L}=f,d=start(f);names(f);L.setSharedSplitMode('custom');
 d.ownerAmount='20.01';d.friends[0].amount='25';d.friends[1].amount='45';assert.equal(L.sharedExpenses.validate(d),'');
 d.friends[1].amount='44.99';assert.match(L.sharedExpenses.validate(d),/add up/);
 d.friends[1].amount='45.001';assert.match(L.sharedExpenses.validate(d),/two decimals/);
 d.friends[1].amount='-1';assert.match(L.sharedExpenses.validate(d),/two decimals/);
 d.friends[1].amount='45';d.friends[1].name='  ABENA ';assert.match(L.sharedExpenses.validate(d),/appear once/);
 d.friends[1].name=L.state.profile.name;assert.match(L.sharedExpenses.validate(d),/already included/);
 d.friends[1].name='Kojo';while(d.friends.length<5)L.addSharedFriend();L.addSharedFriend();assert.equal(d.friends.length,5);
 d.friends.push({id:'extra',name:'Extra',amount:0});assert.match(L.sharedExpenses.validate(d),/one and five/);clean(f.h);
});
check('unequal shares with a zero share create only positive individual requests and no money',()=>{
 const f=fixture(),{L,h}=f;start(f);names(f);L.setSharedSplitMode('custom');h.flush();
 h.set('shared-owner','50.01');h.set('shared-amount-0','40');h.set('shared-amount-1','0');L.reviewSharedExpense();h.flush();L.createSharedExpense();h.flush();
 const g=L.state.sharedExpenses.groups[0];assert.equal(g.ownerCents,5001);assert.equal(g.shares.length,1);assert.equal(L.state.requests.length,1);assert.equal(L.state.requests[0].amount,40);assert.equal(L.state.txs.length,1);clean(h);
});
check('repeated creation and reopening retain one group and one set of requests',()=>{
 const f=fixture(),{L,h,payment}=f,g=create(f),before=JSON.stringify(L.state.requests);L.createSharedExpense();L.startSharedExpense(payment.id);h.flush();
 assert.equal(L.route,'sharedGroup');assert.equal(L.params.id,g.id);assert.equal(L.state.sharedExpenses.groups.length,1);assert.equal(JSON.stringify(L.state.requests),before);clean(h);
});
check('an unsent split survives close and resumes with input, focus and parent position retained',()=>{
 const f=fixture(),{L,h}=f,parent=view(h);parent.scrollTop=87;start(f);names(f);h.set('shared-title','Hall dinner');L.captureSharedSplit();
 assert(L.taskSheet.active);assert(parent.inert);assert.equal(h.document.querySelectorAll(L.signalEdition?'.task-sheet[role="region"]':'[role="dialog"]').length,1);
 L.closeTask();h.flushHistory();h.flush();assert.equal(L.route,'home');assert.equal(view(h),parent);assert.equal(parent.scrollTop,87);assert(!parent.inert);assert.equal(L.state.requests.length,0);
 start(f);assert.equal(h.document.getElementById('shared-title').value,'Hall dinner');assert.equal(h.document.getElementById('shared-name-0').value,'Abena');assert.equal(L.state.txs.length,1);clean(h);
});
check('a new receipt opens the canonical split while an earlier unfinished split remains unchanged',()=>{
 const f=fixture(90,0),{L,h}=f;const first=start(f);names(f);h.set('shared-title','First dinner');L.captureSharedSplit();L.closeTask();h.flushHistory();h.flush();
 const before=JSON.stringify(first),second=L.addTx({draftId:'second-shared-original',type:'out',status:'success',name:'Campus Print',amount:60,fee:0,category:'Study',method:'Campus Pay'});
 L.startSharedExpense(second.id);h.flush();assert.equal(L.route,'groupMoneySplit');assert.equal(L.state.groupMoney.draft.sourceTxId,second.id);assert.equal(L.state.groupMoney.draft.title,'Campus Print');assert.equal(L.state.groupMoney.draft.total,'60.00');assert.equal(JSON.stringify(L.state.sharedExpenses.draft),before);assert.equal(L.state.requests.length,0);clean(h);
});
check('resumed split mode and friend changes replace stale cached fields with the current draft',()=>{
 const f=fixture(90,0),{L,h}=f;start(f);names(f);L.setSharedSplitMode('custom');h.flush();h.set('shared-owner','50');h.set('shared-amount-0','20');h.set('shared-amount-1','20');L.captureSharedSplit();
 L.closeTask();h.flushHistory();h.flush();start(f);L.setSharedSplitMode('equal');h.flush();
 assert.equal(h.document.getElementById('shared-owner').value,'30.00');assert.equal(h.document.getElementById('shared-amount-0').value,'30.00');
 L.removeSharedFriend(0);h.flush();assert.equal(L.state.sharedExpenses.draft.friends[0].name,'Kojo');assert.equal(h.document.getElementById('shared-name-0').value,'Kojo');assert.equal(h.document.getElementById('shared-owner').value,'45.00');
 L.addSharedFriend();h.flush();assert.equal(h.document.getElementById('shared-name-0').value,'Kojo');assert.equal(h.document.getElementById('shared-name-1').value,'');assert.equal(h.document.getElementById('shared-owner').value,'30.00');assert.equal(h.document.getElementById('shared-amount-0').value,'30.00');assert.equal(L.state.requests.length,0);clean(h);
});
check('sample receipt forms retain their own amount without leaking it to another friend or receipt',()=>{
 const f=fixture(90,0),{L,h}=f,g=create(f),first=g.shares[0],second=g.shares[1];
 L.prepareSharedReceipt(g.id,first.id);h.flush();const reference=L.state.sharedExpenses.receiptDraft.reference;h.set('shared-received-amount','10');L.captureSharedReceipt();L.closeTask();h.flushHistory();h.flush();
 L.prepareSharedReceipt(g.id,first.id);h.flush();assert.equal(L.params.reference,reference);assert.equal(h.document.getElementById('shared-received-amount').value,'10');L.closeTask();h.flushHistory();h.flush();
 L.prepareSharedReceipt(g.id,second.id);h.flush();assert.notEqual(L.params.reference,reference);assert.equal(h.document.getElementById('shared-received-amount').value,'30.00');assert.equal(L.state.sharedExpenses.receiptDraft.shareId,second.id);
 h.set('shared-received-amount','5');L.simulateSharedReceipt();h.flush();L.prepareSharedReceipt(g.id,second.id);h.flush();assert.equal(h.document.getElementById('shared-received-amount').value,'25.00');assert.equal(L.sharedExpenses.summary(g).receivedCents,500);clean(h);
});
check('partial confirmed repayments credit once per reference and settle the exact outstanding shares',()=>{
 const f=fixture(90,0),{L,h}=f,g=create(f),balance=L.state.balance,s=g.shares[0];
 const first=receipt(f,g,s,'10'),firstReference=first.reference,firstTx=first.txId;
 assert.equal(L.state.balance,balance+10);assert.equal(L.sharedExpenses.summary(g).status,'partial');assert.equal(L.sharedExpenses.summary(g).dueCents,5000);assert.equal(L.state.requests.find(r=>r.id===s.requestId).status,'waiting');
 L.simulateSharedReceipt();h.flush();assert.equal(L.state.balance,balance+10);assert.equal(L.state.txs.length,2);
 const second=receipt(f,g,s,'20');assert.notEqual(second.reference,firstReference);assert.equal(L.state.balance,balance+30);assert.equal(L.state.requests.find(r=>r.id===s.requestId).status,'paid');assert.equal(L.sharedExpenses.summary(g).dueCents,3000);
 L.state.sharedExpenses.receiptDraft={groupId:g.id,shareId:s.id,reference:firstReference,amount:'10'};L.simulateSharedReceipt();h.flush();assert.equal(L.state.sharedExpenses.receiptDraft.txId,firstTx);assert.equal(L.state.balance,balance+30);assert.equal(L.state.txs.length,3);
 receipt(f,g,g.shares[1],'30');assert.equal(L.state.balance,balance+60);assert.equal(L.sharedExpenses.summary(g).status,'settled');assert.equal(L.sharedExpenses.summary(g).dueCents,0);
 assert.equal(L.state.txs.filter(t=>t.sharedGroupId===g.id).length,3);assert(L.state.txs.filter(t=>t.sharedGroupId===g.id).every(t=>t.requestId&&t.sampleReceiptReference&&t.status==='success'));clean(h);
});
check('a partial request can be cancelled and renewed for only the remaining share',()=>{
 const f=fixture(90,0),{L,h}=f,g=create(f),s=g.shares[0],old=s.requestId;receipt(f,g,s,10);const balance=L.state.balance;
 L.closeRequest(old,'cancelled');h.flush();assert.equal(L.state.requests.find(r=>r.id===old).status,'cancelled');
 L.renewSharedRequest(g.id,s.id);h.flush();assert.notEqual(s.requestId,old);const fresh=L.state.requests.find(r=>r.id===s.requestId);assert.equal(fresh.amount,20);assert.equal(L.state.balance,balance);
 L.simRequestCredit(old);h.flush();assert.equal(L.route,'sharedGroup');assert.equal(L.state.balance,balance);
 L.simRequestCredit(fresh.id);h.flush();assert.equal(L.route,'sharedReceive');assert.equal(L.state.sharedExpenses.receiptDraft.amount,'20.00');clean(h);
});
check('invalid amounts, stale originals and closed requests cannot create extra credits',()=>{
 const f=fixture(90,0),{L,h,payment}=f,g=create(f),s=g.shares[0],balance=L.state.balance;L.prepareSharedReceipt(g.id,s.id);h.flush();
 for(const invalid of ['0','-1','30.01','1.001']){h.set('shared-received-amount',invalid);L.simulateSharedReceipt();h.flush();assert.equal(L.state.balance,balance);assert.equal(L.state.txs.length,1);}
 payment.refunded=1;h.set('shared-received-amount','10');L.simulateSharedReceipt();h.flush();assert.equal(L.state.balance,balance);assert.match(view(h).querySelector('#error').textContent,/original payment changed/);
 payment.refunded=0;L.state.requests.find(r=>r.id===s.requestId).status='cancelled';L.simulateSharedReceipt();h.flush();assert.equal(L.state.balance,balance);assert.match(view(h).querySelector('#error').textContent,/request is closed/);clean(h);
});
check('pending and failed incoming records are not received shares or spendable money',()=>{
 const f=fixture(90,0),{L,h}=f,g=create(f),s=g.shares[0],balance=L.state.balance;
 for(const status of ['pending','failed'])L.addTx({draftId:'unconfirmed-'+status,type:'in',status,name:s.name,amount:10,fee:0,category:'Transfers',requestId:s.requestId,sharedGroupId:g.id,sharedShareId:s.id,sharedExpenseRepayment:true});
 assert.equal(L.state.balance,balance);assert.equal(L.sharedExpenses.summary(g).receivedCents,0);assert.equal(L.sharedExpenses.summary(g).status,'waiting');
 L.go('sharedGroup',{id:g.id});h.flush();assert(view(h).textContent.includes('GH₵60.00 still unpaid'));clean(h);
});
check('creation rechecks a reviewed payment and refuses locked accounts without moving money',()=>{
 const f=fixture(),{L,h,payment}=f;start(f);names(f);L.reviewSharedExpense();h.flush();const before=L.state.balance;payment.status='pending';L.createSharedExpense();h.flush();assert.equal(L.state.sharedExpenses.groups.length,0);assert.equal(L.state.requests.length,0);assert.equal(L.state.balance,before);
 payment.status='success';L.state.locked=true;L.createSharedExpense();assert.equal(L.state.sharedExpenses.groups.length,0);assert.equal(L.state.balance,before);clean(h);
});
check('receipt, Chat Actions and requests provide entries without a cross-device payable claim',()=>{
 const f=fixture(),{L,h,payment}=f;L.go('txDetail',{id:payment.id});h.flush();assert(view(h).textContent.includes('Split this payment'));
 L.go('requests');h.flush();assert(view(h).textContent.includes('Shared costs'));L.closeTask();h.flush();L.go('chatBankingActions');h.flush();assert(view(h).textContent.includes('Shared costs'));
 const g=create(f);let copied='';L.copy=text=>{copied=text;};L.copySharedSummary(g.id);assert.match(copied,/not a payable link/);assert.match(copied,/no real money/);assert(!copied.includes('https://'));assert.equal(L.state.txs.length,1);clean(h);
});
console.log(passed+' shared-cost accounting and interaction checks passed.');
