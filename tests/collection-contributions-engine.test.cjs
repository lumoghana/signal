/* Actual-index collection contributions: own money uses the native executor. */
'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {createHarness}=require('./helpers/task-sheet-dom.cjs');
const settle=h=>{h.flushHistory();h.flush();};
function fixture(){
 const h=createHarness({clock:true,deferHistory:true,testing:true}),L=h.L;L.explore();L.ensureAccounts();
 Object.assign(L.state,{balance:600,txs:[],essentials:[],goals:[],requests:[],paymentDraft:null,groupMoney:undefined});L.route='home';L.params={};L.history=[];L.save();settle(h);
 return {h,L,G:L.groupMoney,C:L.collectionContributions};
}
function collection(f,{id='pot',target='1200',accept=true}={}){
 const r=f.G.createCollection({title:'Class trip '+id,target,deadline:new f.h.context.Date(f.h.context.Date.now()+14*86400000).toISOString().slice(0,10),members:[{id:'self',name:'You',isOwner:true},{id:'abena',name:'Abena'},{id:'kojo',name:'Kojo'}],mandateApproval:'named',mandateApproverIds:['self','abena','kojo'],mandateRequiredApprovals:2,acceptMandate:true,idempotencyKey:id});assert(r.ok,r.error);
 if(accept)for(const p of r.item.people.filter(p=>p.id!=='self'))assert(f.G.acceptMandate({itemId:r.item.id,personId:p.id,version:r.item.mandate.version,sample:true}).ok);
 return r.item;
}
function review(f,g,amount='50'){
 const result=f.C.start(g.id);assert(result.ok,result.error);f.L.go('send',{method:'collection'});settle(f.h);f.h.set('payment-amount',amount);f.L.preparePayment();settle(f.h);assert(['paymentReview','pause'].includes(f.L.route));return f.L.state.paymentDraft;
}
function auth(f){if(f.L.route==='paymentReview'){f.L.continuePayment();settle(f.h);}if(f.L.route==='pause'){f.h.advance(3900);const hold=f.h.document.getElementById('view').querySelector('[data-pause-hold]');assert(hold);hold.click();f.h.advance(90);settle(f.h);}assert.equal(f.L.route,'authorize');}
function pay(f,g,amount='50',outcome='Completed'){
 review(f,g,amount);auth(f);f.h.set('payment-pin','123456');f.h.set('payment-outcome',outcome);f.L.authorizePayment();settle(f.h);assert.equal(f.L.route,'paymentResult');return f.L.state.txs.find(t=>t.collectionContribution);
}
const clean=f=>assert.deepEqual(f.h.errors,[]);

test('native PIN confirms one personal debit and one exact pot credit, with an immutable reference',()=>{
 const f=fixture(),g=collection(f);review(f,g);assert.equal(f.L.state.balance,600);assert.equal(f.G.summary(g).balanceCents,0);auth(f);
 f.h.set('payment-pin','000000');f.L.authorizePayment();settle(f.h);assert.equal(f.L.state.txs.length,0);assert.equal(f.L.state.balance,600);assert.equal(f.G.summary(g).balanceCents,0);
 const pin=f.h.set('payment-pin','123456');f.L.authorizePayment();settle(f.h);const t=f.L.state.txs[0];assert.equal(pin.value,'');assert.equal(t.status,'success');assert.equal(t.category,'Transfers');assert.equal(t.method,'Collection contribution');assert.equal(t.internalTransfer,undefined);assert.equal(t.type,'out');
 assert.equal(f.L.state.balance,550);assert.equal(f.L.accountBalances().total,550);assert.equal(f.G.summary(g).balanceCents,5000);assert.equal(g.payments[0].personalTxId,t.id);assert.equal(t.collectionPaymentId,g.payments[0].id);assert.equal(t.collectionBalanceAfterCents,5000);
 const snapshot=JSON.stringify({balance:f.L.state.balance,txs:f.L.state.txs,payments:g.payments});f.L.authorizePayment();settle(f.h);assert.equal(JSON.stringify({balance:f.L.state.balance,txs:f.L.state.txs,payments:g.payments}),snapshot);clean(f);
});

test('biometric demo uses its existing scoped ticket and never retrieves or fills a PIN',()=>{
 const f=fixture(),g=collection(f);review(f,g);auth(f);let reads=0;Object.defineProperty(f.L.state.profile,'pin',{get(){reads++;return '123456';},enumerable:false,configurable:true});
 assert.equal(f.L.biometricPayment.open(),true);assert.equal(f.h.document.getElementById('payment-pin'),null);assert.equal(f.L.biometricPayment.approve(),true);settle(f.h);
 assert.equal(reads,0);assert.equal(f.L.state.balance,550);assert.equal(f.G.summary(g).balanceCents,5000);assert.equal(f.L.biometricPayment.approve(),false);assert.equal(f.L.state.txs.length,1);clean(f);
});

test('direct own sample receipts and unreviewed ledger writes cannot bypass payment authorisation',()=>{
 const f=fixture(),g=collection(f);assert.equal(f.G.recordSamplePayment({itemId:g.id,personId:'self',amount:'50',reference:'unguarded'}).ok,false);
 const r=f.C.start(g.id,'50');assert(r.ok);assert.throws(()=>f.L.addTx({draftId:r.draft.id,type:'out',name:g.title,amount:50,fee:0,status:'success',collectionContribution:true}),/authorise/);
 f.L.go('authorize');settle(f.h);f.h.set('payment-pin','123456');f.L.authorizePayment();settle(f.h);assert.equal(f.L.state.balance,600);assert.equal(f.L.state.txs.length,0);assert.equal(f.G.summary(g).receivedCents,0);clean(f);
});

test('new collection membership, target, available money and local identity gate review',()=>{
 const f=fixture(),g=collection(f,{accept:false});assert.equal(f.C.start(g.id).ok,false);
 for(const p of g.people.filter(p=>p.id!=='self'))assert(f.G.acceptMandate({itemId:g.id,personId:p.id,version:g.mandate.version,sample:true}).ok);
 const started=f.C.start(g.id,'50');assert(started.ok);assert.equal(f.C.start(g.id).draft.id,started.draft.id,'Repeated entry keeps the same unsubmitted draft');
 started.draft.collectionPersonId='abena';assert.equal(f.C.quote().ok,false);started.draft.collectionPersonId='self';started.draft.amount='600.01';assert.equal(f.C.quote().ok,false);started.draft.amount='1200.01';assert.equal(f.C.quote().ok,false);assert.equal(f.L.state.balance,600);assert.equal(f.G.summary(g).balanceCents,0);clean(f);
});

test('changed amount, destination, mandate, target capacity or available funds invalidates a reviewed authorisation',()=>{
 for(const mutate of [
  (f,g,d)=>{d.amount=51;},(f,g,d)=>{d.collectionPersonId='abena';},(f,g,d)=>{d.destination='OTHER';},
  (f,g,d)=>{g.mandateFingerprint='changed';},(f,g,d)=>{f.L.state.balance=590;},
  (f,g,d)=>{assert(f.G.recordSamplePayment({itemId:g.id,personId:'abena',amount:'1',reference:'changed-capacity'}).ok);}
 ]){const f=fixture(),g=collection(f),d=review(f,g);auth(f);const received=f.G.summary(g).receivedCents;mutate(f,g,d);const balanceBeforeAuthorisation=f.L.state.balance;f.h.set('payment-pin','123456');f.L.authorizePayment();settle(f.h);assert.equal(f.L.state.txs.length,0);assert.equal(f.L.state.balance,balanceBeforeAuthorisation);assert.equal(g.payments.filter(p=>p.personalTxId).length,0);assert.equal(f.L.route,'paymentReview');assert(f.G.summary(g).receivedCents>=received);clean(f);}
});

test('an invalid high-value contribution recovers to its warning instead of looping through Pause',()=>{
 for(const mutate of [(f,g)=>{g.mandateFingerprint='invalid';},(f,g)=>{assert(f.G.recordSamplePayment({itemId:g.id,personId:'abena',amount:'1200',reference:'target-met'}).ok);}]){
  const f=fixture(),g=collection(f);review(f,g,'500');assert.equal(f.L.route,'pause');auth(f);mutate(f,g);f.h.set('payment-pin','123456');f.L.authorizePayment();settle(f.h);
  assert.equal(f.L.route,'paymentReview');assert.equal(f.L.state.balance,600);assert.equal(f.L.state.txs.length,0);assert.equal(f.C.current(),false);assert.equal(f.C.quote().ok,false);assert(f.h.document.getElementById('view').textContent.includes(f.C.quote().error));clean(f);
 }
});

test('Pending holds Everyday money and target space without crediting the pot or allowing cancellation',()=>{
 const f=fixture(),g=collection(f,{target:'10000'}),t=pay(f,g,'500','Pending');assert.equal(f.L.state.balance,600);assert.equal(f.L.balances().available,100);assert.equal(f.G.summary(g).receivedCents,0);assert.equal(f.C.pendingCents(g.id),50000);
 assert.equal(f.G.cancel(g.id).ok,false);assert.equal(f.G.refund(g.id).ok,false);assert.equal(f.G.recordSamplePayment({itemId:g.id,personId:'abena',amount:'9600',reference:'oversubscribed'}).ok,false,'Large sample receipts respect pending personal contributions');
 assert(f.G.recordSamplePayment({itemId:g.id,personId:'abena',amount:'9500',reference:'other-member'}).ok);assert.equal(f.G.summary(g).receivedCents,950000);assert.equal(f.L.state.balance,600);
 f.h.advance(15*86400000);f.L.resolveTx(t.id,'success');assert.equal(f.L.state.balance,100);assert.equal(f.G.summary(g).receivedCents,1000000);assert.equal(g.payments.filter(p=>p.personalTxId===t.id).length,1);f.L.resolveTx(t.id,'success');assert.equal(f.L.state.balance,100);clean(f);
});

test('Failed releases funds without a pot credit; retry gets a new native payment and authenticates again',()=>{
 const f=fixture(),g=collection(f),first=pay(f,g,'50','Pending');f.L.resolveTx(first.id,'failed');assert.equal(f.L.state.balance,600);assert.equal(f.L.balances().available,600);assert.equal(f.G.summary(g).receivedCents,0);
 const next=pay(f,g,'50','Completed');assert.notEqual(next.id,first.id);assert.equal(f.L.state.balance,550);assert.equal(f.G.summary(g).receivedCents,5000);f.L.resolveTx(first.id,'success');assert.equal(f.L.state.balance,550);assert.equal(f.G.summary(g).receivedCents,5000);clean(f);
});

test('a pending payment rejects changed destination or ledger fields and never overdraws missing reserved money',()=>{
 for(const mutate of [(f,g,t)=>{t.amount=60;},(f,g,t)=>{t.id='changed';},(f,g,t)=>{g.title='Changed';},(f,g,t)=>{f.L.state.balance=10;}]){
  const f=fixture(),g=collection(f),t=pay(f,g,'50','Pending');mutate(f,g,t);const balanceBeforeResult=f.L.state.balance;assert.throws(()=>f.L.resolveTx(t.id,'success'));assert.equal(f.G.summary(g).receivedCents,0);assert.equal(t.status,'pending');assert.equal(f.L.state.balance,balanceBeforeResult);clean(f);
 }
});

test('generic refunds cannot mint personal money and group cancellation returns only the unspent proportion once',()=>{
 const f=fixture();let g=collection(f),t=pay(f,g,'100');f.L.refundPayment(t.id);assert.equal(f.L.state.balance,500);assert.equal(f.G.summary(g).balanceCents,10000);assert.throws(()=>f.L.addTx({type:'in',amount:100,status:'success',originalId:t.id,collectionRefund:true,draftId:'forged-refund'}),/group/);g=f.G.get(g.id);t=f.L.state.txs.find(x=>x.id===t.id);
 assert(f.G.recordSamplePayment({itemId:g.id,personId:'abena',amount:'100',reference:'other-source'}).ok);
 const p=f.G.createProposal({itemId:g.id,recipient:'Transport',purpose:'Deposit',amount:'50',idempotencyKey:'spend'}).proposal;
 for(const personId of ['self','abena'])assert(f.G.approveProposal({itemId:g.id,proposalId:p.id,personId,version:p.mandateVersion,fingerprint:p.fingerprint,...(personId==='self'?{}:{sample:true})}).ok);
 const q=f.G.preparePayout({itemId:g.id,proposalId:p.id}).quote;assert(f.G.executeSampleProposal({itemId:g.id,proposalId:p.id,reviewToken:q.token,pin:'123456',outcome:'Completed'}).ok);
 assert(f.G.cancel(g.id).ok);const result=f.G.refund(g.id);assert(result.ok,result.error);assert.equal(f.L.state.balance,575);assert.equal(f.G.summary(g).balanceCents,0);assert.equal(t.status,'success');assert.equal(t.refunded,75);assert.equal(f.L.state.txs.filter(t=>t.collectionRefund).length,1);
 const before=JSON.stringify(f.L.state);assert(f.G.refund(g.id).ok);assert.equal(JSON.stringify(f.L.state),before);clean(f);
});

test('a payment copied to another pot cannot refund or credit that other destination',()=>{
 const f=fixture(),a=collection(f,{id:'a'}),t=pay(f,a),b=collection(f,{id:'b'});assert(f.G.recordSamplePayment({itemId:b.id,personId:'abena',amount:'200',reference:'b-other'}).ok);b.payments.push(JSON.parse(JSON.stringify(a.payments[0])));assert(f.G.cancel(b.id).ok);const before=f.L.state.balance;assert.equal(f.G.refund(b.id).ok,false);assert.equal(f.L.state.balance,before);assert.equal(f.G.summary(a).balanceCents,5000);assert.equal(t.status,'success');clean(f);
});

test('a failed atomic save restores the debit and pot together and requires a fresh review',()=>{
 const f=fixture(),g=collection(f);review(f,g);auth(f);const save=f.h.context.localStorage.setItem;f.h.context.localStorage.setItem=()=>{throw Error('Quota');};f.h.set('payment-pin','123456');f.L.authorizePayment();settle(f.h);
 assert.equal(f.L.state.balance,600);assert.equal(f.L.state.txs.length,0);assert.equal(f.G.summary(f.G.get(g.id)).receivedCents,0);assert.equal(f.L.route,'paymentReview');f.h.context.localStorage.setItem=save;assert.equal(f.L.persistence.status().saveFailed,true);assert(f.L.persistence.retrySave());auth(f);f.h.set('payment-pin','123456');f.L.authorizePayment();settle(f.h);assert.equal(f.L.state.balance,550);assert.equal(f.G.summary(f.G.get(g.id)).receivedCents,5000);clean(f);
});

test('pending contribution confirmation saves its personal debit and collection receipt in one recoverable commit',()=>{
 const f=fixture(),g=collection(f),t=pay(f,g,'50','Pending'),before=JSON.stringify(f.L.state),save=f.h.context.localStorage.setItem;
 f.h.context.localStorage.setItem=()=>{throw Error('Quota');};assert.throws(()=>f.L.resolveTx(t.id,'success'),/could not be saved/);assert.equal(JSON.stringify(f.L.state),before);assert.equal(f.L.state.txs.find(x=>x.id===t.id).status,'pending');assert.equal(f.L.state.balance,600);assert.equal(f.G.summary(g.id).receivedCents,0);assert.equal(f.L.balances().available,550);
 f.h.context.localStorage.setItem=save;assert.throws(()=>f.L.resolveTx(t.id,'success'));assert(f.L.persistence.retrySave());f.L.resolveTx(t.id,'success');assert.equal(f.L.state.balance,550);assert.equal(f.G.summary(g.id).receivedCents,5000);assert.equal(f.G.get(g.id).payments.filter(x=>x.personalTxId===t.id).length,1);f.L.resolveTx(t.id,'success');assert.equal(f.L.state.balance,550);clean(f);
});

test('a failed group refund rolls back original-source credit and pot records together before retry',()=>{
 const f=fixture(),g=collection(f),t=pay(f,g,'50');assert(f.G.cancel(g.id).ok);const before=JSON.stringify(f.L.state),save=f.h.context.localStorage.setItem;f.h.context.localStorage.setItem=()=>{throw Error('Quota');};assert.equal(f.G.refund(g.id).ok,false);assert.equal(JSON.stringify(f.L.state),before);assert.equal(f.L.state.balance,550);assert.equal(f.G.summary(g.id).balanceCents,5000);assert.equal(f.L.state.txs.filter(x=>x.collectionRefund).length,0);
 f.h.context.localStorage.setItem=save;assert.equal(f.G.refund(g.id).ok,false);assert(f.L.persistence.retrySave());assert(f.G.refund(g.id).ok);assert.equal(f.L.state.balance,600);assert.equal(f.G.summary(g.id).balanceCents,0);assert.equal(f.L.state.txs.filter(x=>x.collectionRefund&&x.originalId===t.id).length,1);assert(f.G.refund(g.id).ok);assert.equal(f.L.state.balance,600);clean(f);
});

test('a nested refund error cannot leave an earlier source returned while another source failed',()=>{
 const f=fixture(),g=collection(f);pay(f,g,'50');assert(f.G.recordSamplePayment({itemId:g.id,personId:'abena',amount:'50',reference:'other-source'}).ok);assert(f.G.cancel(g.id).ok);const before=JSON.stringify(f.L.state),id=f.L.id;let refunds=0;f.L.id=prefix=>{if(prefix==='GR'&&++refunds===2)throw Error('Second refund source failed');return id(prefix);};const result=f.G.refund(g.id);assert.equal(result.ok,false);assert.equal(JSON.stringify(f.L.state),before);assert.equal(f.L.state.balance,550);assert.equal(f.G.summary(g.id).balanceCents,10000);assert.equal(f.G.get(g.id).refunds.length,0);f.L.id=id;assert(f.G.refund(g.id).ok);assert.equal(f.L.state.balance,600);assert.equal(f.G.summary(g.id).balanceCents,0);clean(f);
});

test('closed and locked profiles cannot initiate, settle or receive a collection refund',()=>{
 for(const state of ['closed','locked']){const f=fixture(),g=collection(f),t=pay(f,g,'50','Pending');f.L.state[state]=true;assert.equal(f.C.start(g.id).ok,false);assert.throws(()=>f.L.resolveTx(t.id,'success'),/Sign in/);assert.equal(f.G.refund(g.id).ok,false);assert.equal(f.L.state.balance,600);assert.equal(g.payments.length,0);clean(f);}
});
