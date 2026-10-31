/* Service-level tests: a UI shortcut cannot bypass scoped partner approval. */
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {createHarness}=require('./helpers/task-sheet-dom.cjs');
const root=path.resolve(__dirname,'../dist');
const scripts=require('./helpers/shipped-entry.cjs').scripts(require('node:path').resolve(__dirname,'..')).filter(m=>m!=='money-box-protection-ui.js'&&fs.existsSync(path.join(root,m)));
if(!scripts.includes('money-box-protection.js'))scripts.push('money-box-protection.js');
let passed=0;
const check=(name,fn)=>{fn();passed++;console.log('PASS '+name);};
function fixture(){
 const h=createHarness({clock:true,testing:true,modules:scripts}),{L}=h;L.explore();L.ensureAccounts();
 Object.assign(L.state,{balance:600,txs:[],paymentDraft:null,essentials:[{id:'food',name:'Food',amount:350,paid:0}],goals:[{id:'laptop',name:'Laptop',target:1000,allocated:100,boxVersion:2}]});delete L.state.moneyBoxProtection;
 return {...h,p:L.boxProtection};
}
function protect(h,phone='0241112222') {const i=h.p.beginInvite('laptop',{phone});h.p.acceptInvitation(i.id,i.code);return h.p.get('laptop');}
function draft(h,amount=80,id='D1'){return h.L.state.paymentDraft={id,method:'box',boxId:'laptop',boxDirection:'out',amount};}
function request(h,d){return h.p.requestApproval({boxId:d.boxId,kind:'withdrawal',draftId:d.id,amount:d.amount});}
function approve(h,d){const c=request(h,d);h.p.approve(c.id,c.code);return c;}
function send(h,d,status='success'){return h.L.transferMoneyBox({id:d.boxId,direction:'out',amount:d.amount,draftId:d.id,status});}
check('existing boxes remain unprotected and optional invitations create no money',()=>{
 const h=fixture();assert.equal(h.p.get('laptop').status,'off');const total=h.L.accountBalances().total;
 const i=h.p.beginInvite('laptop',{phone:'+233241112222'});assert.equal(h.p.get('laptop').status,'invited');assert.equal(h.p.get('laptop').invitation.phone,'0241112222');assert.equal(h.L.accountBalances().total,total);
 assert(h.p.sampleMessage(i.id).includes('No SMS sent'));assert(h.p.sampleMessage(i.id).includes('cannot access'));h.p.cancelInvitation('laptop');assert.equal(h.p.get('laptop').status,'off');
});
check('own number and an invalid partner number are refused, including changed ownership during invitation',()=>{
 const h=fixture();assert.throws(()=>h.p.beginInvite('laptop',{phone:'+233241230123'}),/someone else/);assert.throws(()=>h.p.beginInvite('laptop',{phone:'123'}),/valid Ghana/);
 const i=h.p.beginInvite('laptop',{phone:'0241112222'});h.L.state.profile.phone=i.phone;assert.throws(()=>h.p.acceptInvitation(i.id,i.code),/someone else/);assert.equal(h.p.get('laptop').status,'invited');
});
check('partner acceptance activates protection; direct, addTx and reversal withdrawals cannot bypass it',()=>{
 const h=fixture();const deposit=h.L.transferMoneyBox({id:'laptop',direction:'in',amount:20,draftId:'deposit'});protect(h);assert.equal(h.p.get('laptop').status,'active');
 assert.throws(()=>send(h,draft(h)),/Partner approval/);assert.throws(()=>h.L.addTx({type:'internal',boxId:'laptop',boxDirection:'out',amount:10,draftId:'bypass',status:'success'}),/Partner approval/);
 assert.throws(()=>h.L.reverseMoneyBoxTransfer(deposit.id),/Partner approval/);assert.equal(h.L.state.goals[0].allocated,120);assert.equal(h.L.state.balance,580);assert.equal(h.L.state.txs.length,1);
});
check('partner approval alone is insufficient and the customer PIN issues a scoped submission grant',()=>{
 const h=fixture();protect(h);const d=draft(h),c=approve(h,d);assert(h.p.validWithdrawal(d));assert.throws(()=>send(h,d),/own Lumo PIN/);assert.throws(()=>h.p.authorizeWithdrawal(d,'000000'),/PIN did not match/);assert.equal(h.L.authPolicy.status().failures,1);
 h.p.authorizeWithdrawal(d,'123456');const t=send(h,d);assert.equal(h.L.state.balance,680);assert.equal(h.L.state.goals[0].allocated,20);assert.equal(t.protectionApproval.id,c.id);assert.equal(h.p.getChallenge(c.id).status,'consumed');assert(!h.p.validWithdrawal(d));
 assert.equal(send(h,d).id,t.id);assert.equal(h.L.state.txs.length,1,'Repeated submit returns the same transaction before consumed-code check');
});
check('the request identifies its actual amount and box; amount, draft and box changes invalidate approval',()=>{
 const h=fixture();protect(h);const d=draft(h),c=approve(h,d);const message=h.p.sampleMessage(c.id);assert(message.includes('GH₵80.00'));assert(message.includes('Laptop'));assert(message.includes('this request only'));
 h.p.authorizeWithdrawal(d,'123456');d.amount=70;assert(!h.p.validWithdrawal(d));assert.throws(()=>send(h,d),/Partner approval/);d.amount=80;d.id='D2';assert(!h.p.validWithdrawal(d));assert.throws(()=>send(h,d),/Partner approval/);d.id='D1';d.boxId='other';assert(!h.p.validWithdrawal(d));assert.equal(h.L.state.txs.length,0);
});
check('expiry, attempt limits and resending never release money and invalidate old codes',()=>{
 const h=fixture();protect(h);const d=draft(h),c=request(h,d);assert.throws(()=>request(h,d),/Wait/);
 for(let n=0;n<5;n++)assert.throws(()=>h.p.approve(c.id,'000000'),/code/);assert.equal(h.p.getChallenge(c.id).status,'locked');
 const fresh=request(h,d);assert.notEqual(fresh.code,c.code);assert.equal(h.p.getChallenge(c.id).status,'superseded');assert.throws(()=>h.p.approve(c.id,c.code),/new partner code/);
 h.advance(300001);assert.throws(()=>h.p.approve(fresh.id,fresh.code),/expired/);const again=request(h,d);h.p.approve(again.id,again.code);h.p.authorizeWithdrawal(d,'123456');h.advance(60001);assert.throws(()=>send(h,d),/Partner approval/);assert.equal(h.L.state.txs.length,0);
});
check('pending reserves savings once and settlement uses captured approval without a new code',()=>{
 const h=fixture();protect(h);const d=draft(h),c=approve(h,d);h.p.authorizeWithdrawal(d,'123456');const t=send(h,d,'pending');
 assert.equal(h.L.moneyBoxAvailable('laptop'),20);assert.equal(h.L.state.balance,600);assert.equal(h.L.state.goals[0].allocated,100);assert.equal(h.p.getChallenge(c.id).status,'consumed');
 h.advance(400000);h.L.resolveTx(t.id,'success');assert.equal(h.L.state.balance,680);assert.equal(h.L.state.goals[0].allocated,20);h.L.resolveTx(t.id,'success');assert.equal(h.L.state.txs.length,1);
});
check('failed transfers consume their request; a new attempt needs a fresh code',()=>{
 const h=fixture();protect(h);const d=draft(h);approve(h,d);h.p.authorizeWithdrawal(d,'123456');send(h,d,'failed');assert.equal(h.L.state.balance,600);assert.equal(h.L.moneyBoxAvailable('laptop'),100);
 const next=draft(h,80,'D2');assert.throws(()=>send(h,next),/Partner approval/);const c=approve(h,next);h.p.authorizeWithdrawal(next,'123456');send(h,next);assert.equal(h.p.getChallenge(c.id).status,'consumed');assert.equal(h.L.state.balance,680);
});
check('depositing remains available and does not require partner approval',()=>{
 const h=fixture();protect(h);h.L.transferMoneyBox({id:'laptop',direction:'in',amount:20,draftId:'topup'});assert.equal(h.L.state.balance,580);assert.equal(h.L.state.goals[0].allocated,120);
});
check('protection removal needs its own approved change request and invalidates withdrawal approvals',()=>{
 const h=fixture();protect(h);const d=draft(h),w=approve(h,d);assert.throws(()=>h.p.applyChange(w.id),/fresh partner/);
 assert.throws(()=>h.p.beginInvite('laptop',{phone:'0242223333'}),/approve changing/);
 const c=h.p.requestApproval({boxId:'laptop',kind:'change',remove:true});assert.throws(()=>h.p.applyChange(c.id),/fresh partner/);h.p.approve(c.id,c.code);h.p.applyChange(c.id);assert.equal(h.p.get('laptop').status,'off');assert.equal(h.p.getChallenge(w.id).status,'superseded');assert.throws(()=>h.p.applyChange(c.id),/fresh partner/);
});
check('changing partners retains old protection until the new partner accepts',()=>{
 const h=fixture();protect(h);const old=h.p.get('laptop');const c=h.p.requestApproval({boxId:'laptop',kind:'change',newPhone:'0242223333'});h.p.approve(c.id,c.code);const i=h.p.applyChange(c.id);
 assert.equal(h.p.get('laptop').phone,old.phone);assert.equal(h.p.get('laptop').status,'active');assert.throws(()=>send(h,draft(h)),/Partner approval/);
 h.p.acceptInvitation(i.id,i.code);assert.equal(h.p.get('laptop').phone,'0242223333');assert.equal(h.p.get('laptop').revision,old.revision+1);assert.equal(h.p.getChallenge(c.id).status,'consumed');
});
check('expired or locked replacement invitations can be resent only for the same approved partner',()=>{
 const h=fixture();protect(h);const c=h.p.requestApproval({boxId:'laptop',kind:'change',newPhone:'0242223333'});h.p.approve(c.id,c.code);const old=h.p.applyChange(c.id);
 assert.throws(()=>h.p.resendInvitation('laptop'),/Wait/);h.advance(600001);assert.throws(()=>h.p.acceptInvitation(old.id,old.code),/expired/);
 const fresh=h.p.resendInvitation('laptop');assert.notEqual(fresh.id,old.id);assert.notEqual(fresh.code,old.code);assert.equal(fresh.phone,'0242223333');assert.equal(h.p.get('laptop').phone,'0241112222');assert.throws(()=>h.p.acceptInvitation(old.id,old.code),/unavailable/);
 for(let n=0;n<5;n++)assert.throws(()=>h.p.acceptInvitation(fresh.id,'000000'),/code/);assert.equal(h.p.get('laptop').invitation.status,'locked');
 const replacement=h.p.resendInvitation('laptop');assert.equal(replacement.phone,'0242223333');h.p.acceptInvitation(replacement.id,replacement.code);assert.equal(h.p.get('laptop').phone,'0242223333');assert.throws(()=>h.p.resendInvitation('laptop'),/no pending invitation/);
});
check('support request alone never approves or unlocks; verified simulated approval stays scoped and requires PIN',()=>{
 const h=fixture();protect(h);const d=draft(h),c=request(h,d),s=h.p.requestSupport(c.id);assert.equal(s.status,'pending');assert(s.simulation);assert.equal(h.p.requestSupport(c.id).id,s.id);assert(!h.p.validWithdrawal(d));assert.throws(()=>send(h,d),/Partner approval/);
 assert.throws(()=>h.p.simulateSupportDecision(s.id,'approved',false),/identity check/);assert(!h.p.validWithdrawal(d));h.p.simulateSupportDecision(s.id,'approved',true);assert(h.p.validWithdrawal(d));assert.throws(()=>send(h,d),/own Lumo PIN/);h.p.authorizeWithdrawal(d,'123456');const t=send(h,d);assert.equal(t.protectionApproval.approvedBy,'verified-support');assert.throws(()=>h.p.simulateSupportDecision(s.id,'approved',true),/already/);
});
check('rejected support leaves protection active and money untouched',()=>{
 const h=fixture();protect(h);const d=draft(h),c=request(h,d),s=h.p.requestSupport(c.id);h.p.simulateSupportDecision(s.id,'rejected',true);assert.equal(h.p.getSupport(s.id).status,'rejected');assert.equal(h.p.get('laptop').status,'active');assert(!h.p.validWithdrawal(d));assert.equal(h.L.state.balance,600);assert.equal(h.L.state.goals[0].allocated,100);
});
check('owner phone changing to the partner cannot approve or submit; verified support can rescue the scoped request',()=>{
 const h=fixture();protect(h);const d=draft(h),c=approve(h,d);h.p.authorizeWithdrawal(d,'123456');h.L.state.profile.phone=h.p.get('laptop').phone;assert(!h.p.validWithdrawal(d));assert.throws(()=>h.p.approve(c.id,c.code),/own number/);assert.throws(()=>send(h,d),/Partner approval/);
 const s=h.p.requestSupport(c.id);h.p.simulateSupportDecision(s.id,'approved',true);h.p.authorizeWithdrawal(d,'123456');send(h,d);assert.equal(h.L.state.balance,680);
});
check('locked sessions cannot approve, alter protection or move savings',()=>{
 const h=fixture();protect(h);const d=draft(h),c=request(h,d);h.L.state.locked=true;assert.throws(()=>h.p.approve(c.id,c.code),/Sign in/);assert.throws(()=>h.p.requestSupport(c.id),/Sign in/);assert.throws(()=>h.p.cancelInvitation('laptop'),/Sign in/);assert.throws(()=>send(h,d),/Sign in/);assert.equal(h.L.state.balance,600);
});
console.log(passed+' Money Box protection service checks passed.');
