/* A transparent, explicit biometric demonstration uses the existing executor.
   Tests cover scopes, expiry, fallback and the independent partner protection. */
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {createHarness}=require('./helpers/task-sheet-dom.cjs');
const scripts=require('./helpers/shipped-entry.cjs').scripts(require('node:path').resolve(__dirname,'..'));
if(!scripts.includes('biometric-auth.js'))scripts.push('biometric-auth.js');
let passed=0;const check=(name,run)=>{run();passed++;console.log('PASS '+name);};
const view=h=>h.document.getElementById('view');
const text=h=>view(h).textContent;
function fixture(options={}){
 const h=createHarness({clock:true,testing:true,modules:scripts,...options}),{L}=h;L.explore();L.ensureAccounts();
 Object.assign(L.state,{balance:500,txs:[],paymentDraft:null,essentials:[{id:'food',name:'Food',amount:250,paid:0},{id:'transport',name:'Transport',amount:100,paid:0}],goals:[{id:'laptop',name:'Laptop',allocated:100,target:3000,boxVersion:2}],chats:[],allowance:{amount:0,date:''}});delete L.state.moneyBoxProtection;delete L.state.moneyBoxProtectionFlow;
 L.route='home';L.params={};L.history=[];L.render();h.flush();return h;
}
function details(h,amount=80){h.L.pickMerchant('AK01');h.set('payment-amount',amount);h.L.preparePayment();h.flush();}
function reachAuth(h){
 const{L}=h;if(L.route==='pause'){h.advance(3900);view(h).querySelector('[data-pause-hold]').click();h.advance(90);h.flush();}else L.continuePayment();h.flush();assert.equal(L.route,'authorize');
}
function biometric(h,outcome='Completed'){
 assert.equal(h.L.biometricPayment.open(),true);assert(text(h).includes('Biometric demo'));assert(!h.document.getElementById('payment-pin'));if(h.L.testMode)h.set('payment-outcome',outcome);const approved=h.L.biometricPayment.approve();h.flush();return approved;
}
function enable(h){const {L}=h;const i=L.boxProtection.beginInvite('laptop',{phone:'0241112222'});L.boxProtection.acceptInvitation(i.id,i.code);}
function boxReview(h,direction='out',amount=80){const {L}=h;L.startMoneyBoxTransfer('laptop',direction);h.set(direction==='out'?'release':'allocation',amount);direction==='out'?L.reviewRelease():L.reviewAllocation();h.flush();assert.equal(L.route,'paymentReview');}
check('authorisation offers an explicit biometric demo alongside the unchanged PIN',()=>{
 const h=fixture();details(h);reachAuth(h);assert(h.document.getElementById('payment-pin'));assert(text(h).includes('Use biometrics'));assert(text(h).includes('Face or fingerprint demo'));assert.equal(h.L.state.txs.length,0);assert.equal(h.L.state.balance,500);
});
check('approval creates exactly one ordinary payment without reading or filling a PIN',()=>{
 const h=fixture(),{L}=h;details(h);reachAuth(h);let pinReads=0;Object.defineProperty(L.state.profile,'pin',{get(){pinReads++;return '123456';},configurable:true,enumerable:false});assert.equal(biometric(h),true);assert.equal(pinReads,0);assert.equal(L.state.balance,420);assert.equal(L.state.txs.length,1);assert.equal(L.state.txs[0].status,'success');assert.equal(L.accountBalances().savings,100);assert.equal(L.biometricPayment.approve(),false);L.authorizePayment({});assert.equal(L.state.txs.length,1);assert.equal(L.state.balance,420);
});
check('cancel returns to the PIN field with no financial or authentication mutation',()=>{
 const h=fixture(),{L}=h;details(h);reachAuth(h);L.biometricPayment.open();assert.equal(L.biometricPayment.cancel(),true);assert.equal(L.route,'authorize');assert(h.document.getElementById('payment-pin'));assert.equal(h.document.activeElement.id,'payment-pin');assert.equal(L.state.balance,500);assert.equal(L.state.txs.length,0);h.set('payment-pin','123456');L.authorizePayment();assert.equal(L.state.txs.length,1);assert.equal(L.state.balance,420);
});
check('an unsuccessful check cannot approve and offers retry or PIN fallback',()=>{
 const h=fixture(),{L}=h;details(h);reachAuth(h);L.biometricPayment.open();L.biometricPayment.fail();assert(text(h).includes('Check wasn’t approved'));assert.equal(L.biometricPayment.approve(),false);assert.equal(L.state.txs.length,0);L.biometricPayment.retry();assert.equal(L.biometricPayment.approve(),true);assert.equal(L.state.txs.length,1);
});
for(const change of ['amount','recipient','balance','account','expired','locked','closed'])check('a '+change+' change invalidates the prompt and cannot authorise a stale payment',()=>{
 const h=fixture(),{L}=h;details(h);reachAuth(h);L.biometricPayment.open();
 if(change==='amount')L.state.paymentDraft.amount=90;
 if(change==='recipient')L.state.paymentDraft.destination='CP02';
 if(change==='balance')L.state.balance=490;
 if(change==='account')L.state=JSON.parse(JSON.stringify(L.state));
 if(change==='expired')h.advance(60001);
 if(change==='locked')L.state.locked=true;
 if(change==='closed')L.state.closed=true;
 assert.equal(L.biometricPayment.approve(),false);assert.equal(L.state.txs.length,0);assert.equal(L.state.balance,change==='balance'?490:500);
});
check('direct calls outside authorisation and forged proof objects cannot replace PIN',()=>{
 const h=fixture(),{L}=h;details(h);assert.equal(L.route,'paymentReview');assert.equal(L.biometricPayment.open(),false);assert.equal(L.biometricPayment.approve(),false);assert.equal(L.biometricPayment.valid({},L.state.paymentDraft),false);reachAuth(h);L.authorizePayment({biometric:true});assert.equal(L.state.txs.length,0);assert(text(h).includes('Enter your 6-digit Lumo PIN'));
});
check('a direct authorisation route cannot bypass the Pause or current review',()=>{
 const h=fixture(),{L}=h;details(h,280);assert.equal(L.route,'pause');L.go('authorize');assert.equal(L.biometricPayment.open(),false);assert.equal(L.biometricPayment.approve(),false);assert.equal(L.state.txs.length,0);assert.equal(L.route,'pause');
});
check('the complete Pause still precedes biometric authorisation',()=>{
 const h=fixture(),{L}=h;details(h,280);assert.equal(L.route,'pause');assert.equal(L.biometricPayment.open(),false);reachAuth(h);assert.equal(biometric(h),true);assert.equal(L.state.balance,220);assert.equal(L.balances().gap,130);
});
for(const outcome of ['Pending','Failed'])check(outcome+' remains a truthful provider state after biometric approval',()=>{
 const h=fixture(),{L}=h;details(h);reachAuth(h);assert.equal(biometric(h,outcome),true);assert.equal(L.state.txs[0].status,outcome.toLowerCase());assert.equal(L.state.balance,500);assert.equal(L.balances().available,outcome==='Pending'?420:500);L.biometricPayment.approve();L.authorizePayment();assert.equal(L.state.txs.length,1);
});
check('bill payment uses the same biometric authorisation and confirmed result logic',()=>{
 const h=fixture(),{L}=h;L.startBill('airtime');h.set('bill-account','0241230123');h.set('payment-amount',30);L.reviewTransactionDetails();assert.equal(L.route,'paymentReview');reachAuth(h);biometric(h);assert.equal(L.state.txs[0].bill,'airtime');assert.equal(L.state.balance,470);assert.equal(L.state.txs[0].delivery,'delivered');
});
for(const direction of ['in','out'])check('Money Box '+direction+' uses the same scoped biometric option',()=>{
 const h=fixture(),{L}=h;boxReview(h,direction);reachAuth(h);biometric(h);assert.equal(L.state.txs.length,1);assert.equal(L.state.txs[0].internalTransfer,true);assert.equal(L.state.balance,direction==='in'?420:580);assert.equal(L.accountBalances().savings,direction==='in'?180:20);assert.equal(L.accountBalances().total,600);
});
check('protected withdrawal still requires fresh partner approval before biometrics',()=>{
 const h=fixture(),{L}=h;enable(h);boxReview(h);L.go('authorize');assert.equal(L.biometricPayment.open(),false);assert.equal(L.state.txs.length,0);assert.equal(L.accountBalances().savings,100);L.go('paymentReview');const c=L.boxProtection.getChallenge(L.state.paymentDraft.boxApprovalId);h.set('partner-verification-code',c.code);L.continuePayment();assert.equal(L.route,'authorize');biometric(h);assert.equal(L.state.balance,580);assert.equal(L.accountBalances().savings,20);assert.equal(L.state.txs[0].protectionApproval.id,c.id);assert.equal(L.boxProtection.getChallenge(c.id).status,'consumed');assert.equal(L.state.txs.length,1);
});
check('changed protected withdrawal amount requires a new code and cannot reuse biometric consent',()=>{
 const h=fixture(),{L}=h;enable(h);boxReview(h);const c=L.boxProtection.getChallenge(L.state.paymentDraft.boxApprovalId);h.set('partner-verification-code',c.code);L.continuePayment();L.biometricPayment.open();L.state.paymentDraft.amount=50;assert.equal(L.biometricPayment.approve(),false);assert.equal(L.state.txs.length,0);assert.equal(L.accountBalances().savings,100);assert.equal(L.boxProtection.validWithdrawal(L.state.paymentDraft),false);
});
check('closing or navigating away from the prompt never authorises',()=>{
 const h=fixture(),{L}=h;details(h);reachAuth(h);L.biometricPayment.open();L.go('help',{returnTo:'authorize'});assert.equal(L.biometricPayment.approve(),false);assert.equal(L.state.txs.length,0);L.go('authorize');assert(h.document.getElementById('payment-pin'));assert.equal(L.state.balance,500);
});
check('backgrounding cancels the visible prompt and restores a working PIN fallback',()=>{
 const h=fixture(),{L}=h;details(h);reachAuth(h);L.biometricPayment.open();h.document.hidden=true;h.document.dispatchEvent(new h.Event('visibilitychange'));h.document.hidden=false;h.document.dispatchEvent(new h.Event('visibilitychange'));assert(h.document.getElementById('payment-pin'));assert.equal(L.biometricPayment.approve(),false);assert.equal(L.state.txs.length,0);h.set('payment-pin','123456');L.authorizePayment();assert.equal(L.state.balance,420);assert.equal(L.state.txs.length,1);
});
check('retry and PIN fallback retain the chosen simulated provider outcome',()=>{
 const h=fixture(),{L}=h;details(h);reachAuth(h);L.biometricPayment.open();h.set('payment-outcome','Pending');L.biometricPayment.fail();L.biometricPayment.retry();assert.equal(h.document.getElementById('payment-outcome').value,'Pending');L.biometricPayment.cancel();assert.equal(h.document.getElementById('payment-outcome').value,'Pending');h.set('payment-pin','123456');L.authorizePayment();assert.equal(L.state.txs[0].status,'pending');assert.equal(L.state.balance,500);
});
console.log(passed+' biometric authorisation checks passed.');
