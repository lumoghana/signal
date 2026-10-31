/* Confirmed Budget effects use the shipped ledger once, and remain historical. */
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {createHarness}=require('./helpers/task-sheet-dom.cjs');
const root=path.join(__dirname,'../dist'),shipped=require('./helpers/shipped-entry.cjs').scripts(require('node:path').resolve(__dirname,'..'));
const modules=shipped.includes('payment-budget-result.js')?shipped:[...shipped,'payment-budget-result.js'];
let count=0;const check=(name,fn)=>{fn();count++;console.log('PASS '+name);};
const clone=x=>JSON.parse(JSON.stringify(x));
const view=h=>h.document.getElementById('view');
const clean=h=>assert.deepEqual(h.errors,[]);
function fixture(options={}){
 const h=createHarness({clock:true,modules,...options}),{L}=h;L.explore();L.ensureAccounts();
 Object.assign(L.state,{balance:500,txs:[],paymentDraft:null,chats:[],categoryRules:[],budgetPurposeRules:[],planDraft:null,budgetGuideSession:null,
  essentials:[{id:'food',name:'Food',amount:250,paid:0,externalPaid:0,coverageVersion:1},{id:'transport',name:'Transport',amount:100,paid:0,externalPaid:0,coverageVersion:1}],
  goals:[{id:'laptop',name:'Laptop',target:3000,allocated:100,boxVersion:2}],allowance:{amount:0,date:'',source:'Family'},planHorizon:{mode:'unspecified',date:''},planSaved:true,pauseEvents:[]});
 L.openTab('pay');L.save();h.flush();return h;
}
function begin(h,amount=80,source=''){
 h.L.pickMerchant('AK01');h.set('payment-amount',String(amount));if(h.document.getElementById('payment-essential'))h.set('payment-essential',source);h.L.preparePayment();h.flush();return h.L.state.paymentDraft;
}
function authorise(h,outcome='Completed'){
 const {L}=h;
 if(L.route==='pause'){h.advance(3900);view(h).querySelector('[data-pause-hold]').click();h.advance(90);h.flush();}
 else L.continuePayment();
 h.flush();assert.equal(L.route,'authorize');h.set('payment-pin','123456');if(L.testMode)h.set('payment-outcome',outcome);L.authorizePayment();h.flush();
 assert.equal(L.route,'paymentResult');clean(h);return L.state.txs.find(t=>t.id===L.state.paymentDraft.submittedTxId);
}
check('a new confirmed extra payment shows the engine’s remaining room without another subtraction',()=>{
 const h=fixture(),{L}=h;begin(h);assert.equal(L.state.txs.length,0);assert.equal(view(h).querySelector('[data-payment-budget-result]'),null);
 const t=authorise(h),s=L.paymentBudgetResult.summary(t);assert(t.budgetResult);assert.equal(s.room,70);assert.equal(s.available,420);assert.equal(s.remaining,350);assert.equal(s.gap,0);assert.equal(s.hasBudget,true);
 assert.equal(L.state.balance,420);assert.equal(L.accountBalances().savings,100);assert.equal(L.state.txs.length,1);assert.match(view(h).querySelector('[data-payment-budget-result]').textContent,/After this paymentGH₵70.00 left after Budget/);clean(h);
});
check('linked spending fulfils the chosen cost once and reports its exact confirmed remainder',()=>{
 const h=fixture(),{L}=h;begin(h,80,'food');const t=authorise(h),s=L.paymentBudgetResult.summary(t);
 assert.equal(L.state.essentials[0].paid,80);assert.equal(L.balances().essentials,270);assert.equal(s.selectedCost.id,'food');assert.equal(s.selectedCost.remaining,170);assert.equal(s.room,150);
 assert.match(s.headline,/Food: GH₵170.00 still to cover/);assert.match(s.support,/GH₵150.00 left after Budget/);assert.equal(L.state.balance,420);clean(h);
});
check('the confirmed shortfall stays the result headline instead of a reassuring zero room',()=>{
 const h=fixture(),{L}=h;begin(h,280);const t=authorise(h),s=L.paymentBudgetResult.summary(t);assert.equal(s.gap,130);assert.equal(s.room,0);assert.match(s.headline,/GH₵130.00 of your Budget is uncovered/);assert.doesNotMatch(s.headline,/\bcovered\.|left after/);clean(h);
});
check('a snapshot remains the same after later payments and saved Budget edits',()=>{
 const h=fixture(),{L}=h;begin(h);const first=authorise(h),snapshot=JSON.stringify(first.budgetResult);L.finishPayment();h.flush();begin(h,20);authorise(h);
 L.state.essentials[0].amount=200;L.save();L.go('txDetail',{id:first.id});h.flush();assert.equal(JSON.stringify(first.budgetResult),snapshot);assert.equal(L.paymentBudgetResult.summary(first).room,70);assert.match(view(h).querySelector('[data-payment-budget-result]').textContent,/At payment confirmationGH₵70.00 left after Budget/);clean(h);
});
check('duplicate submission and resolving success again cannot refresh an earlier snapshot',()=>{
 const h=fixture(),{L}=h;const d=begin(h),t=authorise(h),before=JSON.stringify(t.budgetResult);L.state.essentials[0].amount=100;L.authorizePayment();L.resolveTx(t.id,'success');
 const repeated=L.addTx({draftId:d.id,type:'out',name:d.name,amount:80,fee:0,status:'success'});assert.equal(repeated.id,t.id);assert.equal(JSON.stringify(t.budgetResult),before);assert.equal(L.state.txs.length,1);assert.equal(L.state.balance,420);clean(h);
});
check('pending and failed outcomes never receive confirmed Budget effects',()=>{
 for(const outcome of ['Pending','Failed']){const h=fixture({testing:true}),{L}=h;begin(h);const t=authorise(h,outcome);assert.equal(t.budgetResult,undefined);assert.equal(L.paymentBudgetResult.summary(t),null);assert.equal(view(h).querySelector('[data-payment-budget-result]'),null);assert.equal(L.state.balance,500);clean(h);}
});
check('actual pending-to-success resolution captures once after funds and coverage settle',()=>{
 const h=fixture({testing:true}),{L}=h;begin(h,80,'food');const t=authorise(h,'Pending');assert.equal(L.state.balance,500);L.resolveTx(t.id,'success');
 const s=L.paymentBudgetResult.summary(t);assert.equal(s.available,420);assert.equal(s.room,150);assert.equal(s.selectedCost.remaining,170);assert.equal(L.state.essentials[0].paid,80);const before=JSON.stringify(t.budgetResult);L.state.balance=1000;L.resolveTx(t.id,'success');assert.equal(JSON.stringify(t.budgetResult),before);clean(h);
});
check('old successful transactions and repeated add calls do not invent historical snapshots',()=>{
 const h=fixture(),{L}=h;const old={id:'old',draftId:'old-draft',type:'out',status:'success',amount:50,fee:0,name:'Earlier lunch',date:'2026-01-01T10:00:00Z'};L.state.txs=[old];L.addTx({...old});assert.equal(old.budgetResult,undefined);assert.equal(L.paymentBudgetResult.summary(old),null);L.go('txDetail',{id:old.id});h.flush();assert.equal(view(h).querySelector('[data-payment-budget-result]'),null);clean(h);
});
check('confirmed incoming money and internal savings movements are excluded',()=>{
 const h=fixture(),{L}=h;const credit=L.addTx({type:'in',status:'success',amount:100,name:'Allowance'});assert.equal(credit.budgetResult,undefined);
 const internal=L.transferMoneyBox({id:'laptop',direction:'in',amount:20,draftId:'box-move',status:'success'});assert.equal(internal.budgetResult,undefined);L.go('paymentResult',{id:internal.id});h.flush();assert.equal(view(h).querySelector('[data-payment-budget-result]'),null);clean(h);
});
check('a reversed or refunded payment suppresses its old effect while preserving the snapshot',()=>{
 const h=fixture(),{L}=h;begin(h);const t=authorise(h),before=clone(t.budgetResult);L.refundPayment(t.id);h.flush();assert.equal(t.status,'reversed');assert.equal(L.paymentBudgetResult.summary(t),null);assert.equal(view(h).querySelector('[data-payment-budget-result]'),null);assert.deepEqual(clone(t.budgetResult),before);assert.equal(L.state.balance,500);clean(h);
});
check('confirmed payment with pending product delivery keeps the truthful separate delivery state',()=>{
 const h=fixture({testing:true}),{L}=h;L.startBill('electricity');h.set('bill-provider','ECG Prepaid');h.set('bill-account','12345678901');h.set('payment-amount','80');L.preparePayment();L.continuePayment();h.flush();h.set('payment-pin','123456');h.set('payment-outcome','Completed');h.set('delivery-outcome','Pending');L.authorizePayment();h.flush();const t=L.state.txs[0];
 assert.equal(t.status,'success');assert.equal(t.delivery,'pending');assert(L.paymentBudgetResult.summary(t));assert.match(view(h).textContent,/Paid. Delivery is pending/);assert.match(view(h).textContent,/Please don’t buy it again/);clean(h);
});
check('Pause amount edits are factual only after the same recipient’s transaction confirms',()=>{
 const h=fixture(),{L}=h;begin(h,280);L.pauseAction('edit_amount');h.flush();assert.equal(L.route,'send');h.set('payment-amount','150');L.preparePayment();h.flush();assert.equal(L.state.txs.length,0);const t=authorise(h),s=L.paymentBudgetResult.summary(t);assert.equal(s.editedFromAmount,280);assert.match(s.edit,/You changed GH₵280.00 to GH₵150.00/);assert.doesNotMatch(s.edit,/saved|saving/);clean(h);
});
check('the covered-amount alternative also reports its confirmed change with the same Budget result',()=>{
 const h=fixture(),{L}=h,d=begin(h,280),q=L.planCoveredAmountOption(d);assert(q);L.applyPlanCoveredAmount([d.id,q.signature,q.amount,q.fee]);h.flush();assert.equal(L.route,'paymentReview');const t=authorise(h),s=L.paymentBudgetResult.summary(t);assert.equal(s.editedFromAmount,280);assert.equal(s.gap,0);assert.equal(s.room,0);clean(h);
});
check('amount edits do not leak across a different recipient or retry draft',()=>{
 const h=fixture(),{L}=h;begin(h,280);L.pauseAction('edit_amount');h.flush();L.pickMerchant('CP02');h.flush();assert.equal(L.route,'everydayRepeatChoice');L.replaceEverydayDraft();h.flush();h.set('payment-amount','80');L.preparePayment();h.flush();const t=authorise(h);assert.equal(L.paymentBudgetResult.summary(t).editedFromAmount,undefined);clean(h);
 const retry=fixture({testing:true}),R=retry.L;begin(retry,280);R.pauseAction('edit_amount');retry.flush();retry.set('payment-amount','150');R.preparePayment();retry.flush();const failed=authorise(retry,'Failed'),oldId=failed.draftId;R.retryPayment(failed.id);retry.flush();assert.notEqual(R.state.paymentDraft.id,oldId);const completed=authorise(retry);assert.equal(R.paymentBudgetResult.summary(completed).editedFromAmount,undefined);assert.equal(R.state.txs.length,2);clean(retry);
});
check('changed monetary identity and private account states cannot expose a stale effect',()=>{
 const h=fixture(),{L}=h;begin(h);const t=authorise(h);t.amount=81;assert.equal(L.paymentBudgetResult.summary(t),null);t.amount=80;
 for(const field of ['locked','closed']){L.state[field]=true;assert.equal(L.paymentBudgetResult.summary(t),null);L.state[field]=false;}L.state.onboarded=false;assert.equal(L.paymentBudgetResult.summary(t),null);clean(h);
});
check('without saved Budget costs the result does not label the account balance as spending room',()=>{
 const h=fixture(),{L}=h;L.state.essentials=[];L.state.planSaved=false;begin(h);const t=authorise(h);assert.equal(t.budgetResult.hasBudget,false);assert.equal(L.paymentBudgetResult.summary(t),null);assert.equal(view(h).querySelector('[data-payment-budget-result]'),null);clean(h);
});
console.log(count+' confirmed payment Budget result checks passed.');
