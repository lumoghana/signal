/* Confirmed operational funding → optional budget. No provider claim credits money. */
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {createHarness}=require('./helpers/task-sheet-dom.cjs');
const dist=path.resolve(__dirname,'../dist');
const modules=require('./helpers/shipped-entry.cjs').scripts(require('node:path').resolve(__dirname,'..'));
if(!modules.includes('funding-budget.js'))modules.splice(modules.indexOf('ambassador.js'),0,'funding-budget.js');
let count=0;
const check=(name,fn)=>{fn();console.log('PASS '+name);count++;};
const view=h=>h.document.getElementById('view');
const clean=h=>assert.deepEqual(h.errors,[]);
function fixture(testing=false){
 const h=createHarness({clock:true,testing,modules}),{L}=h;L.explore();
 Object.assign(L.state,{balance:0,txs:[],essentials:[],goals:[],planSaved:false,planDraft:null,paymentDraft:null,fundingDraft:null,bankFunding:null,budgetPrompt:null,onboardingFunding:null});
 L.state.profile.name='Abena Mensah';L.state.profile.phone='0241230123';L.state.profile.account='9300555123';
 L.ensureAccounts?.();L.save();L.route='home';L.params={};L.history=[];L.render();h.flush();return h;
}
function reviewWallet(h,amount){const {L}=h;L.startMomoFunding();h.set('funding-amount',amount);h.document.getElementById('funding-owned').checked=true;L.reviewMomoFunding();assert.equal(L.state.fundingDraft.stage,'review');}
check('new accounts start at two funding choices, with no budget or fake credit',()=>{
 const h=fixture(),{L}=h;L.beginFirstFunding();assert.equal(L.route,'addMoney');
 assert(view(h).textContent.includes('Mobile money'));assert(view(h).textContent.includes('Bank transfer'));
 assert.equal(L.state.onboardingFunding.done,false);assert.equal(L.state.balance,0);assert.equal(L.state.txs.length,0);assert.equal(L.state.budgetPrompt,null);clean(h);
});
check('confirmed first MoMo funding immediately offers an optional budget and credits once',()=>{
 const h=fixture(),{L}=h;L.beginFirstFunding();reviewWallet(h,600);L.requestMomoFunding();
 assert.equal(L.route,'budgetAfterFunding');assert.equal(L.state.balance,600);assert.equal(L.state.txs.length,1);
 assert(view(h).textContent.includes('Build it with Lumo'));assert(view(h).textContent.includes('Enter it myself'));assert(view(h).textContent.includes('Do later'));assert(view(h).textContent.includes('doesn’t move or lock'));
 assert.equal(L.state.budgetPrompt.txId,L.state.fundingDraft.txId);assert.equal(L.state.budgetPrompt.done,false);
 L.requestMomoFunding();assert.equal(L.state.balance,600);assert.equal(L.state.txs.length,1);clean(h);
});
check('wallet approval, pending credit and failure never offer a budget or claim receipt',()=>{
 for(const outcome of ['pending','failed']){
  const h=fixture(true),{L}=h;L.beginFirstFunding();reviewWallet(h,600);L.requestMomoFunding();
  assert.equal(L.state.txs[0].status,'pending');assert.equal(L.route,'momoAdd');L.fundingApproved();assert.equal(L.state.balance,0);
  if(outcome==='failed')L.fundingOutcome('failed');
  assert.equal(L.route,'momoAdd');assert.equal(L.state.budgetPrompt,null);assert.equal(L.state.balance,0);
  assert(!view(h).textContent.includes('Set up budget'));assert(!view(h).textContent.includes('Review budget'));L.fundingDone();h.flushHistory();assert.equal(L.state.budgetPrompt,null);clean(h);
 }
});
check('a confirmed tester result can offer the budget, but never before confirmation',()=>{
 const h=fixture(true),{L}=h;L.beginFirstFunding();reviewWallet(h,600);L.requestMomoFunding();
 assert.equal(L.state.balance,0);L.fundingOutcome('success');assert.equal(L.state.balance,600);assert.equal(L.route,'budgetAfterFunding');clean(h);
});
check('GIP guide exposes the operational receiving account, copy actions and truthful steps',()=>{
 const h=fixture(),{L}=h;L.beginFirstFunding();L.startBankFunding();
 const text=view(h).textContent,number=L.accountBalances?.().operationalNumber||L.state.profile.account;
 for(const expected of ['GCB Bank','Abena Mensah',number,'Transfers','Other bank','GIP','InstantPay','beneficiary','Authorise','confirmed','Sample account','Simulate received money'])assert(text.includes(expected),expected);
 assert(view(h).querySelectorAll('button').some(b=>b.getAttribute('onclick')==='L.copyOperationalNumber()'));assert(view(h).querySelectorAll('button').some(b=>b.getAttribute('onclick')==='L.copyBankDetails()'));
 assert(L.bankDetailsText().includes(number));L.bankSent();assert.equal(L.state.balance,0);assert.equal(L.state.txs.length,0);assert.equal(L.state.budgetPrompt,null);clean(h);
});
check('public bank simulation validates, credits exactly once, then offers optional budgeting',()=>{
 const h=fixture(),{L}=h;L.beginFirstFunding();L.startBankFunding();h.set('bank-test-amount','0');L.simulateBankReceipt();
 assert.equal(L.state.txs.length,0);assert(view(h).querySelector('#error').textContent.includes('0.01'));
 h.set('bank-test-amount','600');L.simulateBankReceipt();assert.equal(L.route,'budgetAfterFunding');assert.equal(L.state.balance,600);assert.equal(L.state.txs.length,1);
 const id=L.state.bankFunding.txId;assert.equal(L.state.budgetPrompt.txId,id);assert.equal(L.state.txs[0].method,'GIP incoming');
 L.simulateBankReceipt();assert.equal(L.state.balance,600);assert.equal(L.state.txs.length,1);assert.equal(L.state.bankFunding.txId,id);clean(h);
});
check('Do later dismisses only the optional budget and does not force the same prompt again',()=>{
 const h=fixture(),{L}=h;L.beginFirstFunding();L.startBankFunding();h.set('bank-test-amount',600);L.simulateBankReceipt();L.deferFundedBudget();h.flushHistory();
 assert.equal(L.route,'home');assert.equal(L.state.budgetPrompt.done,true);assert.equal(L.state.onboardingFunding.done,true);assert.equal(L.state.balance,600);assert.equal(L.state.essentials.length,0);
 L.go('bankAdd');L.fundingDone();h.flushHistory();assert.equal(L.route,'home');assert.equal(L.state.balance,600);assert.equal(L.state.budgetPrompt.done,true);clean(h);
});
check('budget action resumes existing costs and later top-ups offer review without restart',()=>{
 const h=fixture(),{L}=h;L.state.essentials=[{id:'food',name:'Food and transport',amount:350,paid:0}];L.state.planSaved=true;
 L.openFunding();reviewWallet(h,600);L.requestMomoFunding();assert.equal(L.route,'momoAdd');assert(view(h).textContent.includes('Review budget'));
 L.fundingDone();assert.equal(L.route,'budgetAfterFunding');assert(view(h).textContent.includes('Your saved budget stays in place'));
 L.beginFundedBudget();assert.equal(L.route,'planEdit');assert.equal(L.state.essentials[0].amount,350);assert.equal(L.state.planDraft,null);assert.equal(L.state.balance,600);clean(h);
});
check('funding during a payment returns to the preserved payment instead of optional setup',()=>{
 const h=fixture(),{L}=h;L.state.balance=600;L.state.paymentDraft={id:'pay-keep',method:'lumo',name:'Ama',destination:'0241234567',amount:80,fee:0,note:'Lunch'};
 const draft=L.state.paymentDraft;L.openFunding('paymentReview');reviewWallet(h,100);L.requestMomoFunding();
 assert.equal(L.route,'momoAdd');assert(view(h).textContent.includes('Return to payment'));L.fundingDone();h.flushHistory();
 assert(['paymentReview','pause'].includes(L.route));assert.equal(L.state.paymentDraft,draft);assert.equal(L.state.paymentDraft.amount,80);assert.equal(L.state.balance,700);assert.equal(L.state.budgetPrompt,null);clean(h);
});
check('bank amount survives dismissal and reopening without creating or discarding money',()=>{
 const h=fixture(),{L}=h;L.openFunding();L.startBankFunding();h.set('bank-test-amount',125.50);const draft=L.state.bankFunding;
 L.fundingDone();h.flushHistory();L.openFunding();L.startBankFunding();
 assert.equal(L.state.bankFunding,draft);assert.equal(h.document.getElementById('bank-test-amount').value,'125.5');assert.equal(L.state.balance,0);assert.equal(L.state.txs.length,0);clean(h);
});
check('building a first budget uses the existing resumable setup rather than creating costs',()=>{
 const h=fixture(),{L}=h;L.beginFirstFunding();L.startBankFunding();h.set('bank-test-amount',600);L.simulateBankReceipt();L.beginFundedBudget();
 assert.equal(L.route,'firstEssentials');assert.equal(L.state.budgetPrompt.done,true);assert.equal(L.state.balance,600);assert.equal(L.state.essentials.length,0);clean(h);
});
console.log(count+' confirmed funding and optional budget checks passed.');
