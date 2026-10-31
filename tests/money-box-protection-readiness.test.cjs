/* Shared credentials and durable protection facts in the shipped prototype. */
'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {createHarness}=require('./helpers/task-sheet-dom.cjs');
const view=h=>h.document.getElementById('view');
const settle=h=>{h.flushHistory();h.flush();};
function fixture(){
 const h=createHarness({clock:true,testing:true}),{L}=h;L.explore();L.ensureAccounts();
 Object.assign(L.state,{balance:600,txs:[],paymentDraft:null,essentials:[{id:'food',name:'Food',amount:350,paid:0}],goals:[{id:'laptop',name:'Laptop',target:1000,allocated:100,boxVersion:2}]});
 delete L.state.moneyBoxProtection;delete L.state.moneyBoxProtectionFlow;L.save();L.go('goals');settle(h);return h;
}
function protect(h){const p=h.L.boxProtection,i=p.beginInvite('laptop',{phone:'0241112222'});p.acceptInvitation(i.id,i.code);return p;}
function withdrawal(h){const {L}=h;L.startMoneyBoxTransfer('laptop','out');settle(h);h.set('release',80);const form=view(h).querySelector('form');assert(form);h.submit(form);settle(h);assert.equal(L.route,'paymentReview');const c=L.boxProtection.getChallenge(L.state.paymentDraft.boxApprovalId);h.set('partner-verification-code',c.code);L.continuePayment();settle(h);assert.equal(L.route,'authorize');return L.state.paymentDraft;}
function failStorage(h){const original=h.context.localStorage.setItem;h.context.localStorage.setItem=()=>{throw Error('QuotaExceededError');};return ()=>{h.context.localStorage.setItem=original;assert.equal(h.L.persistence.retrySave(),true);};}

test('protected API and mounted transfer share one account-level guess limit without double counting',()=>{
 const h=fixture(),{L}=h,p=protect(h),d=withdrawal(h);
 for(let i=0;i<4;i++){assert.throws(()=>p.authorizeWithdrawal(d,'000000'),/PIN did not match/);assert.equal(L.authPolicy.status().failures,i+1);}
 h.set('payment-pin','000000');L.authorizePayment();settle(h);assert.equal(L.route,'signin');assert.equal(L.state.locked,true);assert.equal(L.authPolicy.status().failures,5);assert.equal(L.authPolicy.status().seconds,60);
 assert.equal(L.state.txs.length,0);assert.equal(L.state.balance,600);assert.equal(L.state.goals[0].allocated,100);assert.equal(p.validWithdrawal(d),true,'Partner approval remains a separate approval');
 h.set('signPhone',L.state.profile.phone);h.set('signPin','123456');L.onboarding.signin();settle(h);assert.equal(L.state.locked,true);h.advance(60000);h.set('signPin','123456');L.onboarding.signin();settle(h);assert.equal(L.state.locked,false);assert.equal(L.authPolicy.status().failures,0);assert.deepEqual(h.errors,[]);
});

test('protection API failures roll back every committed fact when storage is full',()=>{
 for(const kind of ['invitation','acceptance','wrong-code','approval','removal','support-request','support-decision']){
  const h=fixture(),{L}=h,p=L.boxProtection;let run;
  if(kind==='invitation')run=()=>p.beginInvite('laptop',{phone:'0241112222'});
  if(kind==='acceptance'){const i=p.beginInvite('laptop',{phone:'0241112222'});run=()=>p.acceptInvitation(i.id,i.code);}
  if(!run){protect(h);const c=p.requestApproval({boxId:'laptop',kind:'change',remove:true});
   if(kind==='wrong-code')run=()=>p.approve(c.id,'000000');
   if(kind==='approval')run=()=>p.approve(c.id,c.code);
   if(kind==='removal'){p.approve(c.id,c.code);run=()=>p.applyChange(c.id);}
   if(kind==='support-request')run=()=>p.requestSupport(c.id);
   if(kind==='support-decision'){const s=p.requestSupport(c.id);run=()=>p.simulateSupportDecision(s.id,'approved',true);}
  }
  L.save();const before=JSON.stringify(L.state),stored=[...h.store.entries()];failStorage(h);
  assert.throws(run,/could not be saved/,kind);assert.equal(JSON.stringify(L.state),before,kind);assert.deepEqual([...h.store.entries()],stored,kind);assert.equal(L.persistence.status().saveFailed,true);assert.deepEqual(h.errors,[]);
 }
});

test('a protected owner PIN cannot issue a usable grant when its approval cannot be saved',()=>{
 const h=fixture(),{L}=h,p=protect(h),d=withdrawal(h),restore=failStorage(h);
 h.set('payment-pin','123456');L.authorizePayment();settle(h);assert.equal(L.state.txs.length,0);assert.equal(L.state.balance,600);assert.equal(L.state.goals[0].allocated,100);assert.equal(L.value('payment-pin'),'');assert.equal(p.validWithdrawal(L.state.paymentDraft),true);
 assert(view(h).textContent.includes('could not be saved')||view(h).textContent.includes('saved-progress warning'));restore();
 assert.throws(()=>L.transferMoneyBox({id:'laptop',direction:'out',amount:80,draftId:d.id}),/Partner approval and your own Lumo PIN/);assert.equal(L.state.txs.length,0);assert.deepEqual(h.errors,[]);
});

test('a protected ledger result and consumed partner approval commit or roll back together',()=>{
 const h=fixture(),{L}=h,p=protect(h),d=withdrawal(h);p.authorizeWithdrawal(d,'123456');const challenge=p.challengeForDraft(d),before=JSON.stringify(L.state),restore=failStorage(h);
 assert.throws(()=>L.transferMoneyBox({id:'laptop',direction:'out',amount:80,draftId:d.id}),/could not be saved/);assert.equal(JSON.stringify(L.state),before);assert.equal(p.getChallenge(challenge.id).status,'approved');restore();
 p.authorizeWithdrawal(L.state.paymentDraft,'123456');const tx=L.transferMoneyBox({id:'laptop',direction:'out',amount:80,draftId:d.id});assert.equal(p.getChallenge(challenge.id).transactionId,tx.id);assert.equal(p.getChallenge(challenge.id).status,'consumed');assert.equal(L.state.balance,680);assert.equal(L.state.goals[0].allocated,20);assert.equal(L.state.txs.length,1);assert.deepEqual(h.errors,[]);
});

test('a failed support decision stays pending and never presents a saved approval',()=>{
 const h=fixture(),{L}=h,p=protect(h);withdrawal(h);L.openMoneyBoxProtectionSupport();settle(h);h.document.getElementById('protection-identity').checked=true;const id=L.state.moneyBoxProtectionFlow.supportId;failStorage(h);L.decideMoneyBoxProtectionSupport('approved');settle(h);
 assert.equal(p.getSupport(id).status,'pending');assert.equal(p.validWithdrawal(L.state.paymentDraft),true,'The separate partner approval was already received');assert(!view(h).textContent.includes('Sample request approved'));assert(view(h).textContent.includes('could not be saved')||view(h).textContent.includes('saved-progress warning'));assert.equal(L.state.txs.length,0);assert.equal(p.get('laptop').status,'active');assert.deepEqual(h.errors,[]);
});
