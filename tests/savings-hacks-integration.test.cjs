/* Savings hacks share real payment, funding and protected Money Box journeys.
   All records are isolated sample ledgers from the shipped application. */
'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path');
const {createHarness}=require('./helpers/task-sheet-dom.cjs');
const shipped=require('./helpers/shipped-entry.cjs').scripts(require('node:path').resolve(__dirname,'..'));
const additions=['savings-hacks-engine.js','savings-hacks-ui.js'];
const modules=[...shipped.filter(file=>!additions.includes(file)),...additions];
const view=h=>h.document.getElementById('view');
const clean=h=>assert.deepEqual(h.errors,[]);
const settle=h=>{h.flushHistory();h.flush();};
let passed=0;
const check=(name,fn)=>{fn();passed++;console.log('PASS '+name);};
function fixture(){
 const h=createHarness({clock:true,testing:true,modules}),{L}=h;L.explore();L.ensureAccounts();
 Object.assign(L.state,{balance:800,txs:[],paymentDraft:null,essentials:[{id:'food',name:'Food',budgetCategory:'food',amount:250,paid:0,externalPaid:0,coverageVersion:1},{id:'transport',name:'Transport',budgetCategory:'transport',amount:100,paid:0,externalPaid:0,coverageVersion:1}],goals:[{id:'laptop',name:'Laptop',target:1000,allocated:100,boxVersion:2}],chats:[],allowance:{amount:0,date:''},planSaved:true,planHorizon:{mode:'date',date:'2099-01-07'}});
 delete L.state.savingHacks;delete L.state.savingPrompts;
 L.route='home';L.params={};L.history=[];L.render();settle(h);clean(h);return h;
}
const internal=L=>L.state.txs.filter(t=>t.internalTransfer&&t.boxId);
const auto=L=>internal(L).filter(t=>t.savingsHack===true||String(t.draftId||'').startsWith('SH:'));
function rule(h,kind='spend',options={}){
 const result=h.L.savingsHacks.configure({boxId:'laptop',kind,value:kind==='roundup'?5:kind==='income'?10:5,monthlyCap:500,minBalance:50,consent:true,...options});
 assert.equal(result.ok,true,result.message);return result.rule;
}
function submit(h){const button=view(h).querySelector('button[type="submit"]');assert(button,'Current mounted form has submit action');button.click();settle(h);}
function payment(h,amount=80,{linked=false}={}){
 const {L}=h;L.openTab('pay');settle(h);L.pickMerchant('AK01');settle(h);
 h.set('payment-amount',amount);if(h.document.getElementById('payment-essential'))h.set('payment-essential',linked?'food':'');
 submit(h);assert.equal(L.route,'paymentReview');return L.state.paymentDraft;
}
function authorise(h,outcome='Completed',{wrongFirst=false}={}){
 const {L}=h;L.continuePayment();settle(h);
 if(L.route==='pause'){h.advance(3900);const hold=view(h).querySelector('[data-pause-hold]');assert(hold);hold.click();h.advance(90);settle(h);}
 assert.equal(L.route,'authorize');
 if(wrongFirst){h.set('payment-pin','000000');submit(h);assert.equal(L.route,'authorize');assert.equal(L.state.txs.length,0);assert.equal(L.state.balance,800);assert.equal(L.state.goals[0].allocated,100);}
 h.set('payment-pin','123456');h.set('payment-outcome',outcome);submit(h);assert.equal(L.route,'paymentResult');clean(h);
 return L.state.txs.find(t=>t.id===L.state.paymentDraft.submittedTxId);
}

check('a configured spending hack keeps the real merchant review and fresh PIN before either movement',()=>{
 const h=fixture(),{L}=h;rule(h);assert.equal(L.state.txs.length,0);assert.equal(L.state.balance,800);assert.equal(L.state.goals[0].allocated,100);
 const draft=payment(h);assert.equal(L.state.txs.length,0);const t=authorise(h,'Completed',{wrongFirst:true});
 assert.equal(t.type,'out');assert.equal(t.status,'success');assert.equal(t.amount,80);assert.equal(t.draftId,draft.id);assert.equal(L.params.id,t.id);assert.equal(L.state.paymentDraft.submittedTxId,t.id);
 assert.equal(auto(L).length,1);assert.equal(auto(L)[0].amount,4);assert.equal(auto(L)[0].savingsHackSourceTxId,t.id);assert.equal(L.state.balance,716);assert.equal(L.state.goals[0].allocated,104);assert.equal(L.spendingSummary({days:7}).total,80);
 L.authorizePayment();L.savingsHacks.processConfirmed(t.id);assert.equal(auto(L).length,1);assert.equal(L.state.txs.length,2);assert.equal(L.state.paymentDraft.submittedTxId,t.id);clean(h);
});

check('a planned payment fulfils its own Budget line once while automatic saving stays separate',()=>{
 const h=fixture(),{L}=h;rule(h);payment(h,80,{linked:true});const t=authorise(h);
 assert.equal(t.essentialId,'food');assert.equal(L.state.essentials[0].paid,80);assert.equal(auto(L).length,1);assert.equal(auto(L)[0].essentialId,undefined);assert.equal(L.state.goals[0].allocated,104);
 assert.equal(L.balances().essentials,270);assert.equal(L.balances().room,446);assert.equal(L.spendingSummary({days:7}).total,80);
 L.savingsHacks.processConfirmed(t.id);assert.equal(L.state.essentials[0].paid,80);assert.equal(auto(L).length,1);clean(h);
});

check('pending merchant money is reserved first and its confirmed callback saves only once',()=>{
 const h=fixture(),{L}=h;rule(h,'roundup');payment(h,23.40);const t=authorise(h,'Pending');
 assert.equal(t.status,'pending');assert.equal(auto(L).length,0);assert.equal(L.state.balance,800);assert.equal(L.accountBalances().available,776.6);assert.equal(L.state.goals[0].allocated,100);
 L.settlePayment(t.id,'success');settle(h);assert.equal(t.status,'success');assert.equal(auto(L).length,1);assert.equal(auto(L)[0].amount,1.60);assert.equal(L.state.balance,775);assert.equal(L.state.goals[0].allocated,101.6);
 L.settlePayment(t.id,'success');L.resolveTx(t.id,'success');L.savingsHacks.processConfirmed(t.id);assert.equal(auto(L).length,1);assert.equal(L.state.txs.length,2);clean(h);
});

check('failed merchant payments do not create savings and remain ordinary retryable payments',()=>{
 const h=fixture(),{L}=h;rule(h);payment(h);const t=authorise(h,'Failed');
 assert.equal(t.status,'failed');assert.equal(auto(L).length,0);assert.equal(L.state.balance,800);assert.equal(L.state.goals[0].allocated,100);assert.equal(L.spendingSummary({days:7}).total,0);
 const submitted=L.state.paymentDraft.id;L.retryPayment(t.id);settle(h);assert.equal(L.route,'send');assert.notEqual(L.state.paymentDraft.id,submitted);assert.equal(L.state.paymentDraft.amount,80);assert.equal(L.state.paymentDraft.name,t.name);assert(!L.state.paymentDraft.submittedTxId);assert.equal(auto(L).length,0);clean(h);
});

check('bank funding keeps its incoming reference when an income hack posts a second internal receipt',()=>{
 const h=fixture(),{L}=h;rule(h,'income');L.openFunding('home');L.startBankFunding();settle(h);h.set('bank-test-amount',300);L.simulateBankReceipt();settle(h);
 const ref=L.state.bankFunding.txId,t=L.state.txs.find(x=>x.id===ref);assert(t);assert.equal(t.type,'in');assert.equal(t.status,'success');assert.equal(t.amount,300);assert.equal(t.draftId,L.state.bankFunding.id);assert.equal(L.route,'bankAdd');
 assert.equal(auto(L).length,1);assert.equal(auto(L)[0].amount,30);assert.notEqual(auto(L)[0].id,ref);assert.equal(L.state.balance,1070);assert.equal(L.state.goals[0].allocated,130);assert(view(h).textContent.includes(ref));
 L.simulateBankReceipt();L.savingsHacks.processConfirmed(ref);assert.equal(L.state.bankFunding.txId,ref);assert.equal(auto(L).length,1);assert.equal(L.state.txs.length,2);clean(h);
});

check('a MoMo top-up triggers income saving after confirmation without replacing its funding draft',()=>{
 const h=fixture(),{L}=h;rule(h,'income');L.openFunding('home');L.startMomoFunding();settle(h);h.set('funding-amount',300);h.document.getElementById('funding-owned').checked=true;L.reviewMomoFunding();L.requestMomoFunding();settle(h);
 const ref=L.state.fundingDraft.txId,t=L.state.txs.find(x=>x.id===ref);assert(t);assert.equal(t.status,'pending');assert.equal(auto(L).length,0);assert.equal(L.state.balance,800);assert.equal(L.state.goals[0].allocated,100);
 L.fundingOutcome('success');settle(h);assert.equal(t.status,'success');assert.equal(L.state.fundingDraft.txId,ref);assert.equal(t.draftId,L.state.fundingDraft.id);assert.equal(L.route,'momoAdd');assert(view(h).textContent.includes(ref));
 assert.equal(auto(L).length,1);assert.equal(auto(L)[0].amount,30);assert.equal(L.state.balance,1070);assert.equal(L.state.goals[0].allocated,130);
 L.fundingOutcome('success');L.savingsHacks.processConfirmed(ref);assert.equal(auto(L).length,1);assert.equal(L.state.txs.length,2);clean(h);
});

check('a confirmed refund never triggers the incoming hack or silently withdraws earlier savings',()=>{
 const h=fixture(),{L}=h;rule(h);payment(h);const t=authorise(h);assert.equal(auto(L).length,1);
 rule(h,'income');const before=L.state.goals[0].allocated;L.refundPayment(t.id);settle(h);
 assert.equal(t.status,'reversed');const refund=L.state.txs.find(x=>x.originalId===t.id);assert(refund);assert.equal(refund.category,'Refunds');assert.equal(refund.amount,80);
 assert.equal(auto(L).length,1);assert.equal(L.state.goals[0].allocated,before);assert.equal(L.state.balance,796);assert.equal(L.spendingSummary({days:7}).total,0);
 L.savingsHacks.processConfirmed(refund.id);L.refundPayment(t.id);assert.equal(auto(L).length,1);assert.equal(L.state.txs.length,3);clean(h);
});

for(const failure of ['before-ledger','after-ledger'])check(failure+' saving errors cannot fail, duplicate or misidentify the completed merchant payment',()=>{
 const h=fixture(),{L}=h;rule(h);const transfer=L.transferMoneyBox;
 L.transferMoneyBox=function(input){if(failure==='before-ledger')throw Error('Sample transfer unavailable');const t=transfer(input);throw Error('Sample post-ledger response unavailable');};
 payment(h);const t=authorise(h);
 assert.equal(t.type,'out');assert.equal(t.status,'success');assert.equal(t.amount,80);assert.equal(L.params.id,t.id);assert.equal(L.state.paymentDraft.submittedTxId,t.id);
 if(failure==='before-ledger'){
  assert.equal(auto(L).length,0);assert.equal(L.state.balance,720);assert.equal(L.state.goals[0].allocated,100);assert.equal(L.savingsHacks.history('laptop')[0].status,'skipped');
 }else{
  assert.equal(auto(L).length,1);assert.equal(L.state.balance,716);assert.equal(L.state.goals[0].allocated,104);const event=L.savingsHacks.history('laptop')[0];assert.equal(event.status,'saved','History follows the actual confirmed internal ledger');assert.equal(event.amount,4);assert.equal(event.transferId,auto(L)[0].id);
 }
 L.savingsHacks.processConfirmed(t.id);assert.equal(auto(L).length,failure==='before-ledger'?0:1);clean(h);
});

check('own virtual card funding and Money Box transfers are not spending or new income triggers',()=>{
 const h=fixture(),{L}=h;rule(h);const cardFunding=L.virtualCards.createFunded({name:'Research card',amount:100,draftId:'integration-card',status:'success'});
 assert.equal(cardFunding.internalTransfer,true);assert.equal(cardFunding.virtualCardTransfer,true);L.savingsHacks.processConfirmed(cardFunding.id);assert.equal(auto(L).length,0);
 rule(h,'income');const toBox=L.transferMoneyBox({id:'laptop',direction:'in',amount:20,draftId:'integration-box-in'});L.savingsHacks.processConfirmed(toBox.id);
 const fromBox=L.transferMoneyBox({id:'laptop',direction:'out',amount:10,draftId:'integration-box-out'});L.savingsHacks.processConfirmed(fromBox.id);
 assert.equal(auto(L).length,0);assert.equal(L.state.goals[0].allocated,110);assert.equal(L.state.balance,690);clean(h);
});

check('saving during a protected-box journey does not weaken partner approval or the owners PIN for withdrawals',()=>{
 const h=fixture(),{L}=h;L.go('goalEdit');settle(h);h.set('sh-kind','spend');h.set('sh-value',5);h.set('sh-cap',100);h.set('sh-buffer',50);h.set('goalName','Protected field trip');h.set('goalTarget',1000);
 const consent=h.document.getElementById('sh-consent');assert(consent);consent.checked=true;consent.dispatchEvent(new h.Event('change'));
 const protect=h.document.getElementById('goalProtect');assert(protect);protect.checked=true;L.toggleMoneyBoxProtectionFields();h.set('goalPartner','0241112222');L.saveGoal();settle(h);
 const g=L.state.goals.find(x=>x.name==='Protected field trip');assert(g);assert.equal(g.allocated,0);assert.equal(L.route,'boxProtectionInvite');assert.equal(L.savingsHacks.get(g.id).enabled,true);assert.equal(L.state.txs.length,0);
 const invitation=L.boxProtection.get(g.id).invitation;h.set('invitation-verification-code',invitation.code);L.acceptMoneyBoxInvitation();L.finishMoneyBoxProtection(g.id);settle(h);
 assert.equal(L.boxProtection.get(g.id).status,'active');payment(h);authorise(h);assert.equal(g.allocated,4);
 L.finishPayment();settle(h);L.startMoneyBoxTransfer(g.id,'out');h.set('release',4);submit(h);assert.equal(L.route,'paymentReview');
 const challenge=L.boxProtection.getChallenge(L.state.paymentDraft.boxApprovalId);assert(challenge);assert.equal(challenge.status,'pending');
 L.continuePayment();assert.equal(L.route,'paymentReview');assert.equal(g.allocated,4);
 h.set('partner-verification-code',challenge.code);L.continuePayment();settle(h);assert.equal(L.route,'authorize');h.set('payment-pin','000000');submit(h);assert.equal(L.route,'authorize');assert.equal(g.allocated,4);
 h.set('payment-pin','123456');h.set('payment-outcome','Completed');submit(h);assert.equal(g.allocated,0);assert.equal(auto(L).length,1);assert.equal(L.boxProtection.getChallenge(challenge.id).status,'consumed');clean(h);
});

check('an active automatic hack replaces its old receipt prompt without deleting the prior preference',()=>{
 const h=fixture(),{L}=h;
 const old=L.savingRules.configure({enabled:true,kind:'fixed',value:20,boxId:'laptop'});assert.equal(old.ok,true);
 const prior=JSON.stringify(L.state.savingPrompts.rule);rule(h,'income');
 const first=L.addTx({type:'in',name:'Sample allowance',amount:300,fee:0,status:'success',category:'Top ups',method:'GIP incoming'});
 L.go('txDetail',{id:first.id});settle(h);
 assert.equal(auto(L).length,1);assert.equal(auto(L)[0].amount,30);
 assert.equal(L.savingRules.cta(first.id),'','The same receipt cannot ask for another manual saving while automatic saving is active');
 assert(!view(h).textContent.includes('Review transfer'));
 assert.equal(JSON.stringify(L.state.savingPrompts.rule),prior,'The legacy preference and its consent history are retained');
 L.savingsHacks.pause('laptop');
 const later=L.addTx({type:'in',name:'Later sample allowance',amount:100,fee:0,status:'success',category:'Top ups',method:'GIP incoming'});
 L.go('txDetail',{id:later.id});settle(h);
 assert.equal(auto(L).length,1);assert(L.savingRules.cta(later.id).includes('Review transfer'));
 assert(view(h).textContent.includes('Review transfer'),'Pausing automatic saving restores the existing optional prompt for a future eligible receipt');
 assert.equal(JSON.stringify(L.state.savingPrompts.rule),prior);assert.equal(L.state.goals[0].allocated,130);clean(h);
});

function scheduled(h){
 const startDate=new Date(h.context.Date.now()+86400000).toISOString().slice(0,10);
 rule(h,'fixed',{value:10,cadence:'daily',startDate});
 return Date.parse(h.L.savingsHacks.get('laptop').nextRunAt);
}
function showDue(h,at){h.advance(at-h.context.Date.now());h.document.visibilityState='visible';h.document.dispatchEvent(new h.Event('visibilitychange'));settle(h);}

check('a due schedule refreshes the read-only Money Box amount and its actual saving activity',()=>{
 const h=fixture(),{L}=h,at=scheduled(h);L.go('goal',{id:'laptop'});settle(h);
 assert(view(h).textContent.includes('100.00'));view(h).scrollTop=85;
 showDue(h,at);
 assert.equal(L.route,'goal');assert.equal(L.params.id,'laptop');assert.equal(L.state.goals[0].allocated,110);assert.equal(L.state.balance,790);
 assert(view(h).textContent.includes('110.00'),'The already-open Box shows the current confirmed balance');
 assert(view(h).textContent.includes('Saved automatically'));assert.equal(view(h).scrollTop,85);
 assert.equal(auto(L).length,1);clean(h);
});

check('a due schedule preserves edited fields and typed PINs while the payment quote still requires a fresh review',()=>{
 const edit=fixture(),editAt=scheduled(edit);edit.L.go('goalEdit',{id:'laptop'});settle(edit);
 edit.set('goalName','My unfinished laptop name');edit.set('goalTarget',1234);const name=edit.document.getElementById('goalName');
 showDue(edit,editAt);assert.equal(edit.L.route,'goalEdit');assert.equal(edit.document.getElementById('goalName'),name);assert.equal(name.value,'My unfinished laptop name');assert.equal(edit.document.getElementById('goalTarget').value,'1234');assert.equal(edit.L.state.goals[0].name,'Laptop');assert.equal(edit.L.state.goals[0].allocated,110);clean(edit);
 const h=fixture(),{L}=h,at=scheduled(h);payment(h);L.continuePayment();settle(h);assert.equal(L.route,'authorize');h.set('payment-pin','123');const pin=h.document.getElementById('payment-pin');
 showDue(h,at);assert.equal(L.route,'authorize');assert.equal(h.document.getElementById('payment-pin'),pin);assert.equal(pin.value,'123');assert.equal(auto(L).length,1);assert.equal(L.state.balance,790);
 h.set('payment-pin','123456');h.set('payment-outcome','Completed');submit(h);
 assert.equal(L.route,'paymentReview','The scheduled movement invalidates the earlier payment quote');assert.equal(L.state.txs.filter(t=>t.type==='out').length,0);assert.equal(L.state.balance,790);
 L.continuePayment();settle(h);assert.equal(L.route,'authorize');assert.equal(h.document.getElementById('payment-pin').value,'','A new review does not retain the prior PIN');
 h.set('payment-pin','123456');h.set('payment-outcome','Completed');submit(h);assert.equal(L.route,'paymentResult');assert.equal(L.state.txs.filter(t=>t.type==='out'&&t.status==='success').length,1);assert.equal(L.state.balance,710);assert.equal(L.state.goals[0].allocated,110);assert.equal(auto(L).length,1);clean(h);
});

check('mounted virtual-card checkout and settlement save separately while funding, failures and refunds never do',()=>{
 const h=fixture(),{L}=h;
 const funding=L.virtualCards.createFunded({name:'Integration checkout card',amount:100,draftId:'integration-card-checkout',status:'success'});
 const cardId=funding.cardId;assert(cardId);assert.equal(L.state.balance,700);assert.equal(L.virtualCards.balance(cardId).balance,100);assert.equal(auto(L).length,0);
 rule(h);
 function checkout(amount,status){
  L.virtualCardUI.openDemo(cardId);settle(h);assert.equal(L.route,'virtualCardDemo');
  h.set('vc-demo-amount',amount);h.set('vc-demo-budget','');h.set('vc-demo-outcome',status);submit(h);
  assert.equal(L.route,'txDetail');const tx=L.state.txs.find(t=>t.id===L.params.id);assert(tx);assert.equal(tx.fundingAccount,'virtual-card');assert.equal(tx.amount,amount);assert.equal(tx.status,status);return tx;
 }
 const completed=checkout(40,'success');
 assert.equal(auto(L).length,1);assert.equal(auto(L)[0].amount,2);assert.equal(auto(L)[0].savingsHackSourceTxId,completed.id);
 assert.equal(L.params.id,completed.id,'The checkout receipt belongs to the original card payment');assert.equal(L.state.paymentDraft,null);
 assert.equal(L.virtualCards.balance(cardId).balance,60);assert.equal(L.state.balance,698);assert.equal(L.state.goals[0].allocated,102);assert.equal(L.spendingSummary({days:7}).total,40);
 assert.equal(L.virtualCards.purchase({cardId,amount:40,draftId:completed.draftId,status:'success'}).id,completed.id);assert.equal(auto(L).length,1);
 const pending=checkout(20,'pending');assert.equal(auto(L).length,1);assert.equal(L.virtualCards.balance(cardId).balance,60);assert.equal(L.virtualCards.balance(cardId).available,40);
 L.virtualCardUI.resolveTransaction(pending.id,'success');settle(h);
 assert.equal(pending.status,'success');assert.equal(L.route,'txDetail');assert.equal(L.params.id,pending.id);assert.equal(auto(L).length,2);assert.equal(auto(L).find(t=>t.savingsHackSourceTxId===pending.id).amount,1);
 L.virtualCards.resolve(pending.id,'success');L.resolveTx(pending.id,'success');L.savingsHacks.processConfirmed(pending.id);
 assert.equal(auto(L).length,2);assert.equal(L.virtualCards.balance(cardId).balance,40);assert.equal(L.state.balance,697);assert.equal(L.state.goals[0].allocated,103);assert.equal(L.spendingSummary({days:7}).total,60);
 checkout(10,'failed');assert.equal(auto(L).length,2);assert.equal(L.virtualCards.balance(cardId).balance,40);assert.equal(L.state.balance,697);
 rule(h,'income');L.virtualCardUI.simulateRefund(completed.id);settle(h);
 const refund=L.state.txs.find(t=>t.id===L.params.id);assert(refund);assert.equal(refund.originalId,completed.id);assert.equal(refund.type,'in');assert.equal(refund.status,'success');assert.equal(completed.status,'reversed');
 assert.equal(auto(L).length,2);assert.equal(L.virtualCards.balance(cardId).balance,80);assert.equal(L.state.balance,697);assert.equal(L.state.goals[0].allocated,103);assert.equal(L.spendingSummary({days:7}).total,20);
 L.savingsHacks.processConfirmed(refund.id);L.savingsHacks.processConfirmed(funding.id);L.virtualCardUI.simulateRefund(completed.id);settle(h);
 assert.equal(auto(L).length,2);assert.equal(L.virtualCards.balance(cardId).balance,80);assert.equal(L.state.balance,697);clean(h);
});

check('first-box setup stays optional and later add, edit, cancel and re-add preserve money and audit history',()=>{
 const h=fixture(),{L}=h;
 function tap(label,root=view(h)){const button=root.querySelectorAll('button').find(b=>b.textContent.trim()===label);assert(button,'Mounted action '+label);button.click();settle(h);}
 function consent(){const field=h.document.getElementById('sh-consent');assert(field);field.checked=true;field.dispatchEvent(new h.Event('change'));}
 L.go('firstGoal');settle(h);tap('Create a Money Box');assert.equal(L.route,'goalEdit');assert.equal(h.document.getElementById('sh-kind').value,'manual');
 L.go('firstGoal');L.firstPlanGoal();settle(h);assert.equal(L.route,'goalEdit');assert.equal(h.document.getElementById('sh-kind').value,'manual');
 h.set('goalName','Student project');h.set('goalTarget',1000);tap('Add Money Box');
 const g=L.state.goals.find(x=>x.name==='Student project');assert(g);assert.equal(g.allocated,0);assert.equal(L.savingsHacks.get(g.id),null);assert.equal(L.state.txs.length,0);assert.equal(L.state.balance,800);
 L.go('goal',{id:g.id});settle(h);tap('Add savings hack');assert.equal(L.route,'goalEdit');assert.equal(h.document.getElementById('sh-kind').value,'manual');
 h.set('sh-kind','spend');h.set('sh-value',5);consent();tap('Save changes');const initial=L.savingsHacks.get(g.id);assert.equal(initial.enabled,true);assert.equal(initial.value,5);assert.equal(L.state.txs.length,0);
 payment(h,40);const first=authorise(h);assert.equal(g.allocated,2);assert.equal(L.state.balance,758);assert.equal(auto(L).length,1);assert.equal(auto(L)[0].savingsHackSourceTxId,first.id);
 L.finishPayment();L.go('goal',{id:g.id});settle(h);tap('Edit');assert.equal(h.document.getElementById('sh-consent').checked,false);h.set('sh-value',10);tap('Save changes');
 assert.equal(L.route,'goalEdit');assert.equal(L.savingsHacks.get(g.id).value,5,'An edit without fresh consent cannot change the standing instruction');assert.equal(g.allocated,2);
 consent();tap('Save changes');const edited=L.savingsHacks.get(g.id);assert.equal(edited.value,10);assert.notEqual(edited.revision,initial.revision);assert.equal(g.allocated,2);
 L.go('goal',{id:g.id});settle(h);tap('Cancel hack');assert(view(h).querySelector('[aria-label="Cancel savings hack"]'));assert.equal(L.savingsHacks.get(g.id).enabled,true);tap('Keep hack');assert.equal(L.savingsHacks.get(g.id).enabled,true);assert.equal(L.savingsHacks.history(g.id).length,1);
 tap('Cancel hack');const confirmation=view(h).querySelector('[aria-label="Cancel savings hack"]');assert(confirmation);tap('Cancel hack',confirmation);
 const cancelled=L.savingsHacks.get(g.id);assert.equal(cancelled.enabled,false);assert(cancelled.cancelledAt);assert.equal(cancelled.consent,null);assert.equal(g.allocated,2);assert.equal(L.state.balance,758);assert.equal(auto(L).length,1);
 assert.equal(L.savingsHacks.history(g.id).filter(e=>e.status==='saved').length,1);assert.equal(L.savingsHacks.history(g.id).filter(e=>e.status==='cancelled').length,1);assert(view(h).textContent.includes('Savings hack cancelled'));assert(view(h).textContent.includes('Add savings hack'));
 assert.equal(L.savingsHacks.resume(g.id,{consent:true}).ok,false);L.savingsHacks.cancel(g.id);assert.equal(L.savingsHacks.history(g.id).filter(e=>e.status==='cancelled').length,1);
 payment(h,20);authorise(h);assert.equal(g.allocated,2);assert.equal(L.state.balance,738);assert.equal(auto(L).length,1);
 L.finishPayment();L.go('goal',{id:g.id});settle(h);tap('Add savings hack');assert.equal(h.document.getElementById('sh-kind').value,'manual');h.set('sh-kind','income');h.set('sh-value',10);consent();tap('Save changes');
 const added=L.savingsHacks.get(g.id);assert.equal(added.enabled,true);assert(!added.cancelledAt);assert.notEqual(added.revision,edited.revision);L.savingsHacks.processConfirmed(first.id);assert.equal(auto(L).length,1,'Re-adding never reprocesses past payments');
 L.openFunding('home');L.startBankFunding();settle(h);h.set('bank-test-amount',100);L.simulateBankReceipt();settle(h);
 const incoming=L.state.txs.find(t=>t.id===L.state.bankFunding.txId);assert.equal(incoming.type,'in');assert.equal(incoming.amount,100);assert.equal(auto(L).length,2);assert.equal(g.allocated,12);assert.equal(L.state.balance,828);assert.equal(L.savingsHacks.history(g.id).filter(e=>e.status==='cancelled').length,1);clean(h);
});

console.log(passed+' Savings hack payment/funding integration checks passed.');
