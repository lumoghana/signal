/* Funded card creation is one customer choice and one confirmed movement. */
'use strict';
const assert=require('node:assert/strict');
const {createHarness}=require('./helpers/task-sheet-dom.cjs');
let passed=0;
const check=(name,fn)=>{fn();passed++;console.log('PASS '+name);};
const settle=h=>{h.flushHistory();h.flush();};
const view=h=>h.document.getElementById('view');
function fixture(options={}){
 const h=createHarness({clock:true,testing:true,...options}),L=h.L;L.explore();
 Object.assign(L.state,{balance:500,txs:[],chats:[],virtualCards:[],paymentDraft:null,virtualCardUiDraft:null,
  essentials:[{id:'food',name:'Food',budgetCategory:'food',amount:250,paid:0,externalPaid:0,coverageVersion:1},{id:'transport',name:'Transport',budgetCategory:'transport',amount:100,paid:0,externalPaid:0,coverageVersion:1}],
  goals:[{id:'laptop',name:'Laptop',allocated:100,target:3000,boxVersion:2}],planSaved:true});
 L.save();L.openTab('home');L.render();settle(h);return h;
}
function create(h,amount=80,name='Online shopping'){
 h.L.virtualCardUI.create();settle(h);h.set('vc-name',name);h.set('payment-amount',String(amount));h.L.virtualCardUI.requestCreate();settle(h);
}
function auth(h){
 if(h.L.route==='pause'){h.advance(3900);view(h).querySelector('[data-pause-hold]').click();h.advance(90);settle(h);}else{h.L.continuePayment();settle(h);}
 assert.equal(h.L.route,'authorize');
}
function confirm(h,outcome='Completed'){
 h.set('payment-pin','123456');h.set('payment-outcome',outcome);h.L.authorizePayment();settle(h);assert.equal(h.L.route,'paymentResult');return h.L.state.txs[0];
}
const clean=h=>assert.deepEqual(h.errors,[]);

check('one creation page includes an optional name, positive initial top-up and live projection',()=>{
 const h=fixture();h.L.virtualCardUI.create();settle(h);assert.equal(h.L.route,'virtualCardCreate');
 assert(h.document.getElementById('vc-name'));assert(h.document.getElementById('payment-amount'));assert(view(h).querySelector('#payment-projection'));
 assert.match(view(h).textContent,/Initial top-up/);assert(!view(h).textContent.includes('Starts at GH₵0.00'));assert.equal(h.L.virtualCards.list().length,0);clean(h);
});
check('blank, zero, negative and excessive initial top-ups cannot issue a card',()=>{
 for(const value of ['',0,-1,500.01,5001,'0.001']){const h=fixture();create(h,value);assert.equal(h.L.route,'virtualCardCreate');assert.equal(h.L.virtualCards.list().length,0);assert.equal(h.L.state.txs.length,0);assert.equal(h.L.state.balance,500);clean(h);}
});
check('GH₵80 creation requires review and separate PIN then creates one funded card',()=>{
 const h=fixture(),L=h.L;create(h);assert.equal(L.route,'paymentReview');assert.equal(L.virtualCards.list().length,0);assert.equal(L.state.balance,500);
 auth(h);assert.equal(L.virtualCards.list().length,0);const t=confirm(h),c=L.virtualCards.get(t.cardId);
 assert(t.cardCreation);assert.equal(c.status,'active');assert.equal(c.balance,80);assert.equal(L.state.balance,420);assert.equal(L.balances().essentials,350);assert.equal(L.balances().room,70);assert.equal(L.accountBalances().savings,100);assert.equal(L.spendingSummary({days:7}).total,0);
 L.authorizePayment();assert.equal(L.virtualCards.list().length,1);assert.equal(L.state.txs.length,1);assert.equal(L.state.balance,420);L.finishPayment();settle(h);assert.equal(L.route,'virtualCard');assert.equal(L.params.id,c.id);clean(h);
});
check('GH₵280 creation retains exact Pause timing and advances on the first valid Continue',()=>{
 const h=fixture(),L=h.L;create(h,280);assert.equal(L.route,'pause');assert.equal(typeof L.state.paymentDraft.amount,'number');assert.equal(L.planImpactSummary(L.state.paymentDraft).totalGap,130);
 const button=view(h).querySelector('[data-pause-hold]');h.advance(3899);assert.equal(button.getAttribute('aria-disabled'),'true');h.advance(1);button.click();h.advance(90);settle(h);assert.equal(L.route,'authorize');assert.equal(L.virtualCards.list().length,0);confirm(h);assert.equal(L.state.balance,220);assert.equal(L.virtualCards.list()[0].balance,280);assert.equal(L.balances().gap,130);clean(h);
});
check('pending creation reserves Everyday Money and never exposes a usable empty card',()=>{
 const h=fixture(),L=h.L;create(h);auth(h);const t=confirm(h,'Pending'),c=L.virtualCards.get(t.cardId);
 assert.equal(c.status,'issuing');assert.equal(c.balance,0);assert.equal(L.virtualCards.totals().count,1);assert.equal(L.state.balance,500);assert.equal(L.balances().available,420);assert.equal(L.balances().room,70);
 assert.throws(()=>L.virtualCards.purchase({cardId:c.id,amount:1}),/not available/);
 L.virtualCards.resolveIssue(c.id,'success');assert.equal(L.virtualCards.get(c.id).status,'active');assert.equal(L.virtualCards.get(c.id).balance,80);assert.equal(L.state.balance,420);L.resolveTx(t.id,'success');assert.equal(L.state.balance,420);assert.equal(L.virtualCards.get(c.id).balance,80);clean(h);
});
check('failed or reversed pending creation releases the hold and frees the card slot',()=>{
 for(const outcome of ['failed','reversed']){const h=fixture(),L=h.L;create(h);auth(h);const t=confirm(h,'Pending');L.resolveTx(t.id,outcome);assert.equal(L.virtualCards.get(t.cardId).status,'failed');assert.equal(L.virtualCards.totals().count,0);assert.equal(L.state.balance,500);assert.equal(L.balances().available,500);assert.equal(L.state.txs.length,1);clean(h);}
});
check('failed creation retry preserves name and amount with a new attempt',()=>{
 const h=fixture(),L=h.L;create(h,80,'My online card');auth(h);const t=confirm(h,'Failed'),old=t.draftId;
 assert.equal(L.virtualCards.totals().count,0);assert.equal(L.state.balance,500);L.retryPayment(t.id);settle(h);
 assert.equal(L.route,'virtualCardCreate');assert.equal(h.document.getElementById('vc-name').value,'My online card');assert.equal(h.document.getElementById('payment-amount').value,'80');assert.notEqual(L.state.paymentDraft.id,old);
 L.virtualCardUI.requestCreate();settle(h);auth(h);confirm(h);assert.equal(L.virtualCards.totals().count,1);assert.equal(L.virtualCards.list()[0].balance,80);assert.equal(L.state.balance,420);clean(h);
});
check('a new card or changed Budget after review cannot bypass fresh review',()=>{
 const h=fixture(),L=h.L;create(h);auth(h);L.state.essentials[0].amount=450;L.save();h.set('payment-pin','123456');L.authorizePayment();settle(h);
 assert.notEqual(L.route,'paymentResult');assert.equal(L.virtualCards.list().length,0);assert.equal(L.state.balance,500);assert.equal(L.state.paymentDraft.amount,80);clean(h);
});
check('the two-card cap is rechecked at commit and preserves existing saved cards',()=>{
 const h=fixture(),L=h.L;create(h);auth(h);
 const a=L.virtualCards.issue({name:'Existing empty card',draftId:'saved-a'}),b=L.virtualCards.issue({name:'Existing frozen card',draftId:'saved-b'});L.virtualCards.freeze(b.id);
 h.set('payment-pin','123456');L.authorizePayment();settle(h);assert.equal(L.route,'virtualCards');assert.equal(L.state.balance,500);assert.equal(L.virtualCards.list().length,2);assert.equal(L.virtualCards.get(a.id).balance,0);assert.equal(L.state.txs.length,0);clean(h);
});
check('cancelling a funded-creation Pause never issues or moves money',()=>{
 const h=fixture(),L=h.L;create(h,280);assert.equal(L.route,'pause');L.pauseAction('cancel_payment');settle(h);assert.equal(L.virtualCards.list().length,0);assert.equal(L.state.balance,500);assert.equal(L.state.txs.length,0);clean(h);
});
check('funded creation supports separately approved biometric demo and reduced-motion Pause',()=>{
 const h=fixture({reducedMotion:true}),L=h.L;create(h,280);assert.equal(L.route,'pause');h.advance(3000);const button=view(h).querySelector('[data-pause-hold]');button.click();h.advance(90);settle(h);assert.equal(L.route,'authorize');assert.equal(L.virtualCards.list().length,0);
 L.biometricPayment.open();settle(h);assert.equal(L.virtualCards.list().length,0);L.biometricPayment.approve();settle(h);assert.equal(L.route,'paymentResult');assert.equal(L.virtualCards.list()[0].balance,280);assert.equal(L.state.balance,220);clean(h);
});
check('the card detail has a visible funding source and direct Freeze action',()=>{
 const h=fixture(),L=h.L,t=L.virtualCards.createFunded({name:'Online shopping',amount:80,draftId:'detail'});L.go('virtualCard',{id:t.cardId});settle(h);
 assert.match(view(h).textContent,/Funded from Everyday Money/);assert(view(h).querySelector('.vc-freeze-direct'));assert(!view(h).querySelector('.vc-face-name'));clean(h);
});
console.log(passed+' funded virtual card creation groups passed.');
