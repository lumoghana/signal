/* Mounted partner setup, approval and recovery use the shipped payment flow. */
const assert=require('node:assert/strict');
const {createHarness}=require('./helpers/task-sheet-dom.cjs');
let passed=0;
const check=(name,fn)=>{fn();passed++;console.log('PASS '+name);};
function fixture(options={}){
 const h=createHarness({clock:true,testing:true,...options}),{L}=h;L.explore();L.ensureAccounts();
 Object.assign(L.state,{balance:600,txs:[],paymentDraft:null,essentials:[{id:'food',name:'Food',amount:350,paid:0}],goals:[{id:'laptop',name:'Laptop',target:1000,date:'',allocated:100,boxVersion:2}]});delete L.state.moneyBoxProtection;delete L.state.moneyBoxProtectionFlow;
 L.route='plan';L.params={};L.history=[];L.render();h.flush();return h;
}
const view=h=>h.document.getElementById('view');
const text=h=>view(h).textContent;
function toggle(h,on){const el=h.document.getElementById('goalProtect');assert(el);el.checked=on;h.L.toggleMoneyBoxProtectionFields();}
function submit(h){const button=view(h).querySelector('button[type="submit"]');assert(button);button.click();h.flush();}
function enable(h){const {L}=h;L.go('goalEdit',{id:'laptop'});toggle(h,true);h.set('goalPartner','0241112222');L.saveGoal();h.flush();assert.equal(L.route,'boxProtectionInvite');const i=L.boxProtection.get('laptop').invitation;h.set('invitation-verification-code',i.code);L.acceptMoneyBoxInvitation();h.flush();assert.equal(L.boxProtection.get('laptop').status,'active');L.finishMoneyBoxProtection('laptop');h.flush();}
function enter(h,amount=80){h.L.startMoneyBoxTransfer('laptop','out');h.flush();h.set('release',amount);submit(h);assert.equal(h.L.route,'paymentReview');return h.L.boxProtection.getChallenge(h.L.state.paymentDraft.boxApprovalId);}
function codeThenPIN(h,c,outcome='Completed'){h.set('partner-verification-code',c.code);h.L.continuePayment();h.flush();assert.equal(h.L.route,'authorize');h.set('payment-pin','123456');h.set('payment-outcome',outcome);submit(h);assert.equal(h.L.route,'paymentResult');}
check('new Money Box protection is optional and refuses the owner number without creating a box',()=>{
 const h=fixture(),{L}=h;L.go('goalEdit');assert.equal(h.document.getElementById('goalProtect').checked,false);assert.equal(h.document.getElementById('goalPartnerFields').hidden,true);
 h.set('goalName','Rainy day');toggle(h,true);h.set('goalPartner','0241230123');L.saveGoal();assert.equal(L.route,'goalEdit');assert(text(h).includes('different from your own'));assert.equal(L.state.goals.length,1);
 h.set('goalPartner','0241112222');L.saveGoal();h.flush();assert.equal(L.route,'boxProtectionInvite');const g=L.state.goals.find(g=>g.name==='Rainy day');assert(g);assert.equal(g.allocated,0);assert.equal(L.boxProtection.get(g.id).status,'invited');assert(text(h).includes('Until accepted'));assert(text(h).includes('No SMS or call is sent'));assert.equal(L.state.txs.length,0);
});
check('accepting the sample invitation makes protection visibly active without moving money',()=>{
 const h=fixture(),{L}=h;enable(h);assert(text(h).includes('Partner protected'));assert(text(h).includes('2222'));assert(!text(h).includes('transfer it back anytime'));assert.equal(L.state.balance,600);assert.equal(L.state.goals[0].allocated,100);
 L.go('goals');assert(text(h).includes('Partner protected'));assert(!text(h).includes('0241112222'),'Summary masks the partner number');
});
check('withdrawal review creates one scoped code and rerendering does not resend or lose the amount',()=>{
 const h=fixture(),{L}=h;enable(h);const c=enter(h);assert(c);assert.equal(c.amountMinor,8000);assert(text(h).includes('GH₵80.00'));assert(text(h).includes('Partner approval'));assert(text(h).includes('Your own authorisation is still required'));
 L.render();h.flush();assert.equal(L.state.paymentDraft.boxApprovalId,c.id);assert.equal(L.boxProtection.getChallenge(c.id).status,'pending');assert.equal(L.state.moneyBoxProtection.challenges.length,1);assert.equal(L.state.paymentDraft.amount,80);assert.deepEqual(h.errors,[]);
});
check('wrong partner codes and wrong PINs preserve the transfer and never move funds',()=>{
 const h=fixture(),{L}=h;enable(h);const c=enter(h);h.set('partner-verification-code','000000');L.continuePayment();assert.equal(L.route,'paymentReview');assert(text(h).includes('doesn’t match'));assert.equal(L.state.paymentDraft.amount,80);assert.equal(L.state.txs.length,0);
 h.set('partner-verification-code',c.code);L.continuePayment();assert.equal(L.route,'authorize');h.set('payment-pin','000000');submit(h);assert.equal(L.route,'authorize');assert.equal(L.authPolicy.status().failures,1);assert.equal(L.state.txs.length,0);assert.equal(L.state.balance,600);h.set('payment-pin','123456');submit(h);assert.equal(L.route,'paymentResult');assert.equal(L.state.balance,680);assert.equal(L.state.goals[0].allocated,20);
 L.authorizePayment();assert.equal(L.state.txs.length,1);
});
check('editing the withdrawal amount invalidates its old approval and keeps the edited value',()=>{
 const h=fixture(),{L}=h;enable(h);const first=enter(h);h.set('partner-verification-code',first.code);L.continuePayment();L.editPayment();h.flush();assert.equal(h.document.getElementById('release').value,'80');h.set('release',70);submit(h);const next=L.boxProtection.getChallenge(L.state.paymentDraft.boxApprovalId);assert.notEqual(next.id,first.id);assert.equal(next.amountMinor,7000);assert.equal(L.boxProtection.validWithdrawal(L.state.paymentDraft),false);assert.equal(L.state.txs.length,0);codeThenPIN(h,next);assert.equal(L.state.balance,670);assert.equal(L.state.goals[0].allocated,30);
});
check('expired partner approval returns from PIN to review and requests a fresh code explicitly',()=>{
 const h=fixture(),{L}=h;enable(h);const c=enter(h);h.set('partner-verification-code',c.code);L.continuePayment();h.advance(300001);h.set('payment-pin','123456');submit(h);assert.equal(L.route,'paymentReview');assert(text(h).includes('expired'));assert.equal(L.state.txs.length,0);L.refreshMoneyBoxApproval();h.flush();const fresh=L.boxProtection.getChallenge(L.state.paymentDraft.boxApprovalId);assert.notEqual(fresh.id,c.id);codeThenPIN(h,fresh);assert.equal(L.state.balance,680);
});
check('a pending protected transfer holds savings only and does not ask for approval again on settlement',()=>{
 const h=fixture(),{L}=h;enable(h);const c=enter(h);codeThenPIN(h,c,'Pending');assert.equal(L.state.balance,600);assert.equal(L.state.goals[0].allocated,100);assert.equal(L.moneyBoxAvailable('laptop'),20);assert(text(h).includes('Transfer being checked.'));const tx=L.state.txs[0];assert.equal(L.boxProtection.getChallenge(c.id).status,'consumed');h.advance(300001);L.resolveTx(tx.id,'success');assert.equal(L.state.balance,680);assert.equal(L.state.goals[0].allocated,20);
});
check('switching protection off requires approval and preserves the unchecked choice on native back',()=>{
 const h=fixture(),{L}=h;enable(h);L.go('goalEdit',{id:'laptop'});h.set('goalName','Laptop fund');toggle(h,false);L.saveGoal();h.flush();assert.equal(L.route,'boxProtectionChange');assert.equal(L.boxProtection.get('laptop').status,'active');assert.equal(L.state.goals[0].name,'Laptop fund');L.back();h.flushHistory();h.flush();assert.equal(L.route,'goalEdit');assert.equal(h.document.getElementById('goalProtect').checked,false);assert.equal(h.document.getElementById('goalName').value,'Laptop fund');
 h.advance(30001);L.saveGoal();h.flush();const c=L.boxProtection.getChallenge(L.state.moneyBoxProtectionFlow.challengeId);L.confirmMoneyBoxProtectionChange();assert.equal(L.boxProtection.get('laptop').status,'active');h.set('protection-verification-code',c.code);L.confirmMoneyBoxProtectionChange();assert.equal(L.boxProtection.get('laptop').status,'off');assert(text(h).includes('Protection switched off'));assert.equal(L.state.txs.length,0);
});
check('changing partners keeps old protection until acceptance and allows cancelling the new invitation',()=>{
 const h=fixture(),{L}=h;enable(h);L.go('goalEdit',{id:'laptop'});h.set('goalPartner','0242223333');L.saveGoal();h.flush();assert.equal(L.route,'boxProtectionChange');const c=L.boxProtection.getChallenge(L.state.moneyBoxProtectionFlow.challengeId);h.set('protection-verification-code',c.code);L.confirmMoneyBoxProtectionChange();h.flush();assert.equal(L.route,'boxProtectionInvite');assert.equal(L.boxProtection.get('laptop').phone,'0241112222');assert(text(h).includes('current partner stays in place'));L.cancelMoneyBoxInvitation();assert.equal(L.boxProtection.get('laptop').phone,'0241112222');assert.equal(L.boxProtection.get('laptop').status,'active');assert.equal(L.boxProtection.get('laptop').invitation.status,'cancelled');assert.equal(L.state.txs.length,0);
});
check('support request remains locked until a verified sample decision, then the original transfer still needs PIN',()=>{
 const h=fixture(),{L}=h;enable(h);enter(h);L.openMoneyBoxProtectionSupport();h.flush();assert.equal(L.route,'boxProtectionSupport');assert(text(h).includes('GH₵80.00 transfer back'));assert(text(h).includes('does not unlock funds'));assert.equal(L.boxProtection.getSupport(L.state.moneyBoxProtectionFlow.supportId).status,'pending');assert.equal(L.state.txs.length,0);
 L.decideMoneyBoxProtectionSupport('approved');assert(text(h).includes('identity check'));assert.equal(L.boxProtection.validWithdrawal(L.state.paymentDraft),false);h.document.getElementById('protection-identity').checked=true;L.decideMoneyBoxProtectionSupport('approved');h.flush();assert(text(h).includes('Sample request approved'));L.returnFromMoneyBoxSupport();h.flush();assert.equal(L.route,'paymentReview');assert.equal(L.state.paymentDraft.amount,80);assert.equal(L.state.txs.length,0);L.continuePayment();assert.equal(L.route,'authorize');h.set('payment-pin','123456');submit(h);assert.equal(L.state.balance,680);assert.equal(L.state.txs[0].protectionApproval.approvedBy,'verified-support');
});
check('declined support keeps the protection and entered payment, with no dead approval controls',()=>{
 const h=fixture(),{L}=h;enable(h);enter(h);L.openMoneyBoxProtectionSupport();L.decideMoneyBoxProtectionSupport('rejected');h.flush();assert(text(h).includes('Sample request declined'));assert(!text(h).includes('Simulate support approval'));assert.equal(L.state.txs.length,0);L.returnFromMoneyBoxSupport();h.flush();assert.equal(L.route,'paymentReview');assert.equal(L.state.paymentDraft.amount,80);assert.equal(L.boxProtection.validWithdrawal(L.state.paymentDraft),false);
});
check('verified support can approve a protection change without removing it at request time',()=>{
 const h=fixture(),{L}=h;enable(h);L.go('goalEdit',{id:'laptop'});toggle(h,false);L.saveGoal();L.openMoneyBoxProtectionSupport();assert.equal(L.boxProtection.get('laptop').status,'active');h.document.getElementById('protection-identity').checked=true;L.decideMoneyBoxProtectionSupport('approved');L.returnFromMoneyBoxSupport();h.flush();assert.equal(L.route,'boxProtectionChange');assert.equal(L.boxProtection.get('laptop').status,'active');L.confirmMoneyBoxProtectionChange();assert.equal(L.boxProtection.get('laptop').status,'off');assert.equal(L.state.txs.length,0);
});
check('partner recovery during a temporary withdrawal preserves and resumes the original campus payment',()=>{
 const h=fixture(),{L}=h;enable(h);L.pickMerchant('AK01');h.set('payment-amount',80);submit(h);const original={...L.state.paymentDraft};const c=enter(h,20);L.openMoneyBoxProtectionSupport();L.returnFromMoneyBoxSupport();h.flush();codeThenPIN(h,c);L.finishPayment();h.flush();assert.equal(L.state.paymentDraft.id,original.id);assert.equal(L.state.paymentDraft.amount,80);assert.equal(L.state.paymentDraft.name,original.name);assert.equal(L.state.balance,620);
});
check('typed approval codes are not retained when returning to edit or saved as form values',()=>{
 const h=fixture(),{L}=h;enable(h);enter(h);h.set('partner-verification-code','999999');L.editPayment();h.flush();assert.equal(h.document.getElementById('release').value,'80');submit(h);assert.equal(h.document.getElementById('partner-verification-code').value,'');assert(!JSON.stringify(L.state).includes('999999'));assert.deepEqual(h.errors,[]);
});
check('unsaved protection choices survive Help, native back and sheet reopen with the phone field visible',()=>{
 const h=fixture(),{L}=h;L.go('goalEdit');h.set('goalName','Weekend project');h.set('goalTarget',750);h.set('goalDate','2026-12-31');toggle(h,true);h.set('goalPartner','0241112222');
 L.go('help',{returnTo:'goalEdit',returnParams:{}});L.back();h.flushHistory();h.flush();assert.equal(L.route,'goalEdit');assert.equal(h.document.getElementById('goalName').value,'Weekend project');assert.equal(h.document.getElementById('goalProtect').checked,true);assert.equal(h.document.getElementById('goalPartner').value,'0241112222');assert.equal(h.document.getElementById('goalPartnerFields').hidden,false);
 L.closeTask();h.flushHistory();h.flush();L.go('goalEdit');h.flush();assert.equal(h.document.getElementById('goalName').value,'Weekend project');assert.equal(h.document.getElementById('goalTarget').value,'750');assert.equal(h.document.getElementById('goalDate').value,'2026-12-31');assert.equal(h.document.getElementById('goalProtect').checked,true);assert.equal(h.document.getElementById('goalPartnerFields').hidden,false);assert.equal(L.state.goals.length,1);
});
check('returning after replacement acceptance reports protection updated rather than switched off',()=>{
 const h=fixture(),{L}=h;enable(h);L.go('goalEdit',{id:'laptop'});h.set('goalPartner','0242223333');L.saveGoal();const c=L.boxProtection.getChallenge(L.state.moneyBoxProtectionFlow.challengeId);h.set('protection-verification-code',c.code);L.confirmMoneyBoxProtectionChange();const i=L.boxProtection.get('laptop').invitation;h.set('invitation-verification-code',i.code);L.acceptMoneyBoxInvitation();assert.equal(L.boxProtection.get('laptop').phone,'0242223333');L.back();h.flushHistory();h.flush();assert.equal(L.route,'boxProtectionChange');assert(text(h).includes('Protection updated'));assert(!text(h).includes('Protection switched off'));assert.equal(L.state.txs.length,0);
});
check('cancelling an initial invitation leaves the saved box unprotected and can be enabled again',()=>{
 const h=fixture(),{L}=h;L.go('goalEdit',{id:'laptop'});toggle(h,true);h.set('goalPartner','0241112222');L.saveGoal();L.cancelMoneyBoxInvitation();assert.equal(L.boxProtection.get('laptop').status,'off');L.go('goalEdit',{id:'laptop'});assert.equal(h.document.getElementById('goalProtect').checked,false);toggle(h,true);h.set('goalPartner','0241112222');L.saveGoal();assert.equal(L.route,'boxProtectionInvite');assert.equal(L.boxProtection.get('laptop').invitation.status,'pending');assert.equal(L.state.goals[0].allocated,100);
});
check('saving the original partner after backing out of a change clears the abandoned edit choice',()=>{
 const h=fixture(),{L}=h;enable(h);L.go('goalEdit',{id:'laptop'});h.set('goalPartner','0242223333');L.saveGoal();assert.equal(L.route,'boxProtectionChange');L.back();h.flushHistory();h.flush();h.set('goalPartner','0241112222');L.saveGoal();assert.equal(L.route,'goal');assert.equal(L.params.id,'laptop');L.go('goalEdit',{id:'laptop'});assert.equal(h.document.getElementById('goalPartner').value,'0241112222');assert.equal(L.boxProtection.get('laptop').phone,'0241112222');assert.equal(L.state.txs.length,0);
});
console.log(passed+' Money Box protection UI checks passed.');
