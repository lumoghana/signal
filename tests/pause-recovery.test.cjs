/* Mounted recovery choices retain the existing decision, funding and consent.
   Geometry and device keyboards are checked separately in browser QA. */
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path');
const {createHarness}=require('./helpers/task-sheet-dom.cjs');
let checks=0;const check=(name,run)=>{run();checks++;console.log('PASS '+name);};
const source=path.resolve(__dirname,'../dist');
const modules=require('./helpers/shipped-entry.cjs').scripts(require('node:path').resolve(__dirname,'..'));
if(!modules.includes('pause-recovery.js'))modules.splice(modules.includes('minna-edition.js')?modules.indexOf('minna-edition.js'):modules.length,0,'pause-recovery.js');
const view=h=>h.document.getElementById('view');
const financial=L=>JSON.stringify([L.state.balance,L.state.essentials,L.state.goals,L.state.txs]);
const clean=h=>assert.deepEqual(h.errors,[]);
function fixture(options={}){
 const h=createHarness({clock:true,testing:true,modules,...options}),{L}=h;L.explore();L.ensureAccounts();
 Object.assign(L.state,{balance:500,txs:[],essentials:[{id:'food',name:'Food',amount:200,paid:0},{id:'transport',name:'Transport',amount:150,paid:0}],goals:[{id:'laptop',name:'Laptop',allocated:100,target:3000,boxVersion:2}],allowance:{amount:0,date:''},paymentDraft:null,chats:[],fundingDraft:null,bankFunding:null,fundingReturn:null});
 L.openTab('home');h.flush();return h;
}
function start(h,amount=280,linked=''){
 const {L}=h;L.pickMerchant('AK01');h.set('payment-amount',amount);h.set('payment-essential',linked);L.preparePayment();h.flush();return L.state.paymentDraft;
}
function fund(h){const button=view(h).querySelector('[data-pause-recovery-fund]');assert(button);h.advance(900);button.click();h.flush();assert.equal(h.L.route,'addMoney');}
function momo(h){const {L}=h;L.startMomoFunding();h.flush();h.set('funding-amount',L.state.fundingDraft.amount);const owned=h.document.getElementById('funding-owned');owned.checked=true;L.reviewMomoFunding();h.flush();assert.equal(L.state.fundingDraft.stage,'review');L.requestMomoFunding();h.flush();assert.equal(L.state.txs.length,1);assert.equal(L.state.txs[0].status,'pending');return L.state.txs[0];}
check('all three projected choices use the shared authority without changing saved money',()=>{
 const h=fixture(),{L}=h,d=start(h),before=financial(L),s=L.pauseRecovery.summary();
 assert.equal(s.lower.amount,150);assert.equal(s.lower.impact.room,0);assert.equal(s.lower.impact.after,350);
 assert.equal(s.funding.amount,130);assert.equal(s.funding.impact.available,630);assert.equal(s.funding.impact.after,350);assert.equal(s.funding.impact.totalGap,0);assert.equal(s.funding.impact.room,0);
 assert.equal(s.impact.amount,280);assert.equal(s.impact.after,220);assert.equal(s.impact.totalGap,130);assert.equal(L.state.paymentDraft,d);assert.equal(financial(L),before);
 assert.equal(view(h).querySelectorAll('[data-plan-adjustment]').length,1);assert.equal(view(h).querySelectorAll('.pause-recovery-options').length,1);
 const comparison=view(h).querySelector('.pause-recovery-calculation');assert(comparison.textContent.includes('Continue with GH₵280.00'));assert(comparison.textContent.includes('Only after the extra money is confirmed received'));clean(h);
});
check('the two alternatives reveal at ring arrival and keep the original dwell and hold',()=>{
 const h=fixture(),{L}=h;start(h);const options=view(h).querySelector('.pause-recovery-options'),hold=view(h).querySelector('[data-pause-hold]');
 assert.equal(options.getAttribute('aria-hidden'),'true');assert(options.inert);h.advance(899);assert.equal(options.getAttribute('aria-hidden'),'true');h.advance(1);assert.equal(options.getAttribute('aria-hidden'),'false');assert(!options.inert);
 hold.click();h.advance(90);assert.equal(L.route,'pause');h.advance(2910);assert.equal(hold.getAttribute('data-pause-ready'),'true');hold.click();h.advance(89);assert.equal(L.route,'pause');h.advance(1);assert.equal(L.route,'authorize');assert.equal(L.state.txs.length,0);clean(h);
});
check('the smaller choice changes only the original draft and returns to current review',()=>{
 const h=fixture(),{L}=h,d=start(h),before=financial(L);h.advance(900);view(h).querySelector('[data-plan-adjustment]').click();h.flush();assert.equal(L.route,'paymentReview');assert.equal(L.state.paymentDraft.id,d.id);assert.equal(d.amount,150);assert.equal(d.pauseAcceptedSignature,undefined);assert.equal(financial(L),before);clean(h);
});
check('funding starts with the same payment, no acceptance, no ledger movement and a suggested new wallet amount',()=>{
 const h=fixture(),{L}=h,d=start(h),before=financial(L);fund(h);assert.equal(L.state.paymentDraft,d);assert.equal(d.amount,280);assert.equal(L.state.fundingReturn,'paymentReview');assert.equal(d.pauseAcceptedSignature,undefined);assert.equal(financial(L),before);
 assert(view(h).textContent.includes('Your GH₵280.00 payment is kept.'));L.startMomoFunding();h.flush();assert.equal(L.state.fundingDraft.amount,130);assert.equal(h.document.getElementById('funding-amount').value,'130');assert.equal(financial(L),before);clean(h);
});
check('confirmed wallet funding returns to the unchanged original payment and still requires separate authorisation',()=>{
 const h=fixture(),{L}=h,d=start(h);fund(h);momo(h);assert.equal(L.state.balance,500);L.fundingOutcome('success');h.flush();assert.equal(L.state.balance,630);assert.equal(L.route,'momoAdd');assert.equal(L.state.txs.filter(t=>t.type==='out').length,0);L.fundingDone();h.flush();assert.equal(L.route,'paymentReview');assert.equal(L.state.paymentDraft.id,d.id);assert.equal(d.amount,280);assert.equal(L.planImpactSummary(d).totalGap,0);assert.equal(L.state.pauseRecoveryFunding,undefined);
 L.continuePayment();h.flush();assert.equal(L.route,'authorize');assert.equal(L.state.balance,630);h.set('payment-pin','123456');h.set('payment-outcome','Completed');L.authorizePayment();h.flush();assert.equal(L.state.balance,350);assert.equal(L.balances().room,0);assert.equal(L.accountBalances().savings,100);assert.equal(L.state.txs.filter(t=>t.type==='out').length,1);L.authorizePayment();assert.equal(L.state.txs.filter(t=>t.type==='out').length,1);clean(h);
});
for(const outcome of ['pending','failed'])check(outcome+' incoming money never covers the Budget or pays the saved draft',()=>{
 const h=fixture(),{L}=h,d=start(h);fund(h);momo(h);if(outcome==='failed')L.fundingOutcome('failed');L.fundingDone();h.flush();assert.equal(L.route,'pause');assert.equal(L.state.balance,500);assert.equal(L.state.paymentDraft.id,d.id);assert.equal(d.amount,280);assert.equal(L.planImpactSummary(d).totalGap,130);assert.equal(L.state.txs.filter(t=>t.type==='out').length,0);assert.equal(view(h).querySelector('[data-pause-hold]').getAttribute('aria-disabled'),'true');clean(h);
});
check('bank funding prefills a new empty sample form and confirms no payment by itself',()=>{
 const h=fixture(),{L}=h,d=start(h);fund(h);L.startBankFunding();h.flush();assert.equal(L.state.bankFunding.amount,130);assert.equal(h.document.getElementById('bank-test-amount').value,'130');L.simulateBankReceipt();h.flush();assert.equal(L.state.balance,630);assert.equal(L.state.txs.length,1);L.fundingDone();h.flush();assert.equal(L.route,'paymentReview');assert.equal(L.state.paymentDraft.id,d.id);assert.equal(d.amount,280);assert.equal(L.state.txs.filter(t=>t.type==='out').length,0);clean(h);
});
check('an existing unfinished wallet and bank amount are preserved rather than overwritten by the quote',()=>{
 for(const method of ['wallet','bank']){
  const h=fixture(),{L}=h;start(h);if(method==='wallet')L.state.fundingDraft={id:'kept-wallet',amount:75,number:'0241230123',owned:true,stage:'form'};else L.state.bankFunding={id:'kept-bank',amount:42};
  fund(h);if(method==='wallet'){L.startMomoFunding();assert.equal(L.state.fundingDraft.id,'kept-wallet');assert.equal(L.state.fundingDraft.amount,75);assert.equal(L.state.fundingDraft.owned,true);}else{L.startBankFunding();assert.equal(L.state.bankFunding.id,'kept-bank');assert.equal(L.state.bankFunding.amount,42);}assert.equal(L.state.txs.length,0);clean(h);
 }
});
check('an existing pending top-up is resumed once and is not replaced with another request',()=>{
 const h=fixture(),{L}=h;start(h);L.state.fundingDraft={id:'pending-wallet',amount:75,number:'0241230123',owned:true,stage:'approval',txId:'incoming'};L.state.txs.push({id:'incoming',draftId:'pending-wallet',type:'in',status:'pending',amount:75,fee:0,date:new Date().toISOString()});
 fund(h);L.startMomoFunding();h.flush();assert.equal(L.state.fundingDraft.id,'pending-wallet');assert.equal(L.state.fundingDraft.amount,75);assert.equal(L.state.txs.length,1);assert.equal(L.state.balance,500);clean(h);
});
check('changed money or Budget after opening funding refreshes the explanation and only a new blank form',()=>{
 const h=fixture(),{L}=h;start(h);fund(h);L.state.essentials[0].amount=250;L.render();h.flush();assert(view(h).textContent.includes('GH₵180.00 more is currently needed'));assert(!view(h).textContent.includes('GH₵130.00 more is currently needed'));L.startMomoFunding();h.flush();assert.equal(L.state.fundingDraft.amount,180);h.set('funding-amount',75);L.state.balance=490;L.go('addMoney');h.flush();assert(view(h).textContent.includes('GH₵190.00 more is currently needed'));L.startMomoFunding();h.flush();assert.equal(L.state.fundingDraft.amount,'75');assert.equal(L.state.txs.length,0);clean(h);
});
check('confirmed funding from elsewhere removes the stale suggestion without implying a payment completed',()=>{
 const h=fixture(),{L}=h;start(h);fund(h);L.addTx({draftId:'elsewhere',type:'in',name:'Received money',amount:200,fee:0,status:'success',category:'Top ups'});L.render();h.flush();assert(view(h).textContent.includes('Your payment now fits your saved Budget'));assert(!view(h).textContent.includes('GH₵130.00 more'));L.startBankFunding();h.flush();assert.equal(L.state.bankFunding.amount,undefined);L.fundingDone();h.flush();assert.equal(L.route,'paymentReview');assert.equal(L.state.paymentDraft.amount,280);assert.equal(L.state.txs.filter(t=>t.type==='out').length,0);clean(h);
});
check('funding cancellation keeps the original amount, source and all saved financial records',()=>{
 const h=fixture(),{L}=h,d=start(h,500,'food'),before=financial(L);assert.equal(L.route,'pause');fund(h);L.startBankFunding();h.flush();L.fundingDone();h.flush();assert.equal(L.route,'pause');assert.equal(L.state.paymentDraft.id,d.id);assert.equal(d.amount,500);assert.equal(d.essentialId,'food');assert.equal(financial(L),before);clean(h);
});
for(const change of ['balance','amount','recipient','locked','submitted'])check('a '+change+' change invalidates the old funding action without replacing saved input',()=>{
 const h=fixture(),{L}=h;start(h);h.advance(900);const old=view(h).querySelector('[data-pause-recovery-fund]');
 if(change==='balance')L.state.balance=490;if(change==='amount')L.state.paymentDraft.amount=290;if(change==='recipient')L.state.paymentDraft.destination='CP02';if(change==='locked')L.state.locked=true;if(change==='submitted')L.state.paymentDraft.submittedTxId='done';
 const before=financial(L);old.click();h.flush();assert.notEqual(L.route,'addMoney');assert.equal(L.state.pauseRecoveryFunding,undefined);assert.equal(financial(L),before);clean(h);
});
check('fees, pending planned money and an existing Budget gap use total confirmed funding needed',()=>{
 const h=fixture(),{L}=h;const draft={id:'quote',method:'bank',amount:280,fee:1,checked:true,name:'Ama',destination:'1234567890'};let s=L.pauseRecovery.summary(draft);assert.equal(s.lower.amount,149);assert.equal(s.funding.amount,131);assert.equal(s.funding.impact.after,350);
 L.state.txs=[{id:'pendingFood',type:'out',status:'pending',amount:40,fee:0,essentialId:'food'}];s=L.pauseRecovery.summary(draft);assert.equal(s.lower.amount,149);assert.equal(s.funding.amount,131);assert.equal(s.funding.impact.essentialsAfter,310);assert.equal(s.funding.impact.after,310);
 L.state.balance=300;L.state.txs=[];s=L.pauseRecovery.summary({...draft,amount:100});assert.equal(s.lower,null);assert.equal(s.impact.totalGapBefore,50);assert.equal(s.funding.amount,151);assert.equal(s.funding.impact.totalGap,0);clean(h);
});
check('fixed requests keep their amount and receive funding comparison without a repricing action',()=>{
 const h=fixture(),{L}=h;start(h);L.state.paymentDraft.fixedAmount=true;L.render();h.flush();assert.equal(view(h).querySelector('[data-plan-adjustment]'),null);assert(view(h).querySelector('[data-pause-recovery-fund]'));assert(!view(h).querySelector('.pause-recovery-calculation').textContent.includes('Use GH₵'));const before=financial(L);fund(h);assert.equal(L.state.paymentDraft.amount,280);assert.equal(financial(L),before);clean(h);
});
check('covered and linked ordinary payments retain the existing noninterrupting decision',()=>{
 for(const [amount,source]of [[80,''],[140,''],[80,'food']]){const h=fixture(),{L}=h;start(h,amount,source);assert.equal(L.route,'paymentReview');assert.equal(L.pauseRecovery.summary(),null);assert.equal(view(h).querySelector('.pause-recovery-options'),null);assert.equal(L.state.txs.length,0);clean(h);}
});
check('reduced motion reveals all alternatives immediately while retaining the three-second decision',()=>{
 const h=fixture({reducedMotion:true}),{L}=h;start(h);const options=view(h).querySelector('.pause-recovery-options');assert.equal(options.getAttribute('aria-hidden'),'false');assert(!options.inert);const hold=view(h).querySelector('[data-pause-hold]');hold.click();h.advance(90);assert.equal(L.route,'pause');h.advance(2910);hold.click();h.advance(90);assert.equal(L.route,'authorize');assert.equal(L.state.txs.length,0);clean(h);
});
console.log(checks+' Pause recovery comparison checks passed.');
