const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const path=require('node:path');
const root=path.resolve(__dirname,'..');
let count=0;
const check=(name,run)=>{run();count++;console.log('PASS '+name);};
function harness(saved){
 const fields=new Map();let stored=saved?JSON.stringify(saved):null;
 const document={getElementById:id=>fields.get(id)||null,addEventListener(){},querySelector:()=>null};
 const ctx={document,console,Date,Math,URLSearchParams,setTimeout:()=>0,clearTimeout(){},location:{search:'?testing=1'},localStorage:{getItem:()=>stored,setItem:(_,value)=>stored=value}};
 ctx.window=ctx;ctx.addEventListener=()=>{};vm.createContext(ctx);
 for(const file of ['core.js','pause-engine.js','plan-impact.js','mobile-network.js','payments.js'])vm.runInContext(fs.readFileSync(path.join(root,'dist',file),'utf8'),ctx,{filename:file});
 const L=ctx.L;L.go=(route,params={})=>{L.beforeNavigate?.(route,params);L.route=route;L.params=params;};L.render=()=>{};L.toast=()=>{};
 L.state.onboarded=true;L.state.locked=false;L.state.profile.pin='123456';
 const set=(id,value)=>{const field={id,value:String(value),type:'text'};fields.set(id,field);return field;};
 return {L,set,fields,ctx,stored:()=>JSON.parse(stored)};
}
function account(extra={}){
 const h=harness();Object.assign(h.L.state,{balance:1000,txs:[],goals:[],essentials:[{id:'food',name:'Food & groceries',amount:100,paid:0}],...extra});return h;
}
function out(L,amount=80,status='pending',extra={}){return L.addTx({type:'out',name:'Akua’s Kitchen',category:'Food',essentialId:'food',amount,fee:0,status,...extra});}
for(const order of [[0,1],[1,0]])check('Overlapping pending completion '+order.join('→')+' and either refund retain the other payment',()=>{
 for(const refundedIndex of [0,1]){
  const {L}=account();const t=[out(L),out(L)];
  assert.equal(L.state.balance,1000);assert.equal(L.state.essentials[0].paid,0);
  assert.equal(L.balances().held,160);assert.equal(L.balances().essentials,0);
  order.forEach(index=>L.settlePayment(t[index].id,'success'));
  assert.equal(L.state.balance,840);assert.equal(L.state.essentials[0].paid,100);
  L.settlePayment(t[0].id,'success');assert.equal(L.state.balance,840);
  L.refundPayment(t[refundedIndex].id);
  assert.equal(L.state.balance,920);assert.equal(L.state.essentials[0].paid,80);assert.equal(L.balances().essentials,20);
  const length=L.state.txs.length;L.refundPayment(t[refundedIndex].id);assert.equal(L.state.txs.length,length);assert.equal(L.state.balance,920);
  L.refundPayment(t[1-refundedIndex].id);assert.equal(L.state.balance,1000);assert.equal(L.state.essentials[0].paid,0);assert.equal(L.balances().essentials,100);
 }
});
check('Failed or reversed pending payments release holds without creating coverage',()=>{
 const {L}=account();const one=out(L),two=out(L,20);
 L.settlePayment(one.id,'failed');L.resolveTx(two.id,'reversed');
 assert.equal(L.state.balance,1000);assert.equal(L.balances().held,0);assert.equal(L.state.essentials[0].paid,0);assert.equal(L.balances().essentials,100);
});
check('Confirmed linked principal covers once and fees never cover an essential',()=>{
 const {L}=account();const t=out(L,80,'success',{fee:2,draftId:'same'});
 assert.equal(L.state.balance,918);assert.equal(L.state.essentials[0].paid,80);
 assert.equal(out(L,80,'success',{fee:2,draftId:'same'}).id,t.id);assert.equal(L.state.balance,918);
 L.refundPayment(t.id);assert.equal(L.state.balance,1000);assert.equal(L.state.essentials[0].paid,0);
});
check('Outside coverage stays separate through later linked completions and refunds',()=>{
 const {L}=account();L.state.essentials[0].paid=40;L.reconcileEssentialCoverage();
 const t=out(L,80);assert.equal(L.state.essentials[0].paid,40);assert.equal(L.balances().essentials,0);
 L.settlePayment(t.id,'success');assert.equal(L.state.essentials[0].paid,100);assert.equal(L.state.essentials[0].externalPaid,40);
 L.refundPayment(t.id);assert.equal(L.state.essentials[0].paid,40);assert.equal(L.balances().essentials,60);assert.equal(L.state.balance,1000);
});
check('Marking the remaining cost paid outside changes planning without adding wallet money',()=>{
 const {L}=account();const t=out(L,80,'success');L.markEssentialCoveredOutside('food');L.save();
 assert.equal(L.state.balance,920);assert.equal(L.state.essentials[0].externalPaid,20);assert.equal(L.state.essentials[0].paid,100);
 L.refundPayment(t.id);assert.equal(L.state.balance,1000);assert.equal(L.state.essentials[0].paid,20);assert.equal(L.balances().essentials,80);
});
check('Legacy capped refund corruption migrates from confirmed history and preserves all funds',()=>{
 const base=account().L.state;base.balance=920;base.essentials[0].paid=20;
 base.txs=[{id:'first',type:'out',status:'reversed',amount:80,essentialId:'food',essentialCovered:80,refunded:80},{id:'second',type:'out',status:'success',amount:80,essentialId:'food',essentialCovered:80},{id:'refund',type:'in',status:'success',amount:80,originalId:'first'}];
 const {L,stored}=harness(base);assert.equal(L.balances().essentials,20);assert.equal(L.state.essentials[0].paid,80);assert.equal(L.state.essentials[0].externalPaid,0);assert.equal(L.state.balance,920);
 L.save();const again=harness(stored()).L;assert.equal(again.balances().essentials,20);assert.equal(again.state.balance,920);
});
check('Legacy coverage unexplained by linked history becomes explicit outside coverage',()=>{
 const base=account().L.state;base.balance=940;base.essentials[0].paid=100;base.txs=[{id:'old',type:'out',status:'success',amount:60,essentialId:'food'}];
 const {L}=harness(base);L.reconcileEssentialCoverage();assert.equal(L.state.essentials[0].externalPaid,40);L.refundPayment('old');assert.equal(L.state.essentials[0].paid,40);assert.equal(L.state.balance,1000);
});
check('A confirmed refund record removes linked coverage even if the original status arrives later',()=>{
 const {L}=account();const t=out(L,80,'success');L.addTx({type:'in',name:'Refund',amount:80,status:'success',originalId:t.id});
 assert.equal(L.state.essentials[0].paid,0);assert.equal(L.state.balance,1000);
});
check('Merchant matching suggests Food without silently assigning it',()=>{
 const {L}=account();L.pickMerchant('AK01');const source=L.views.send();
 assert.equal(L.state.paymentDraft.essentialId,'');assert(source.includes('<span>Pay from</span>'));assert(source.includes('All use your operational account.'));
 assert(source.includes('<option value="" selected>Left after budget · '));
 assert(source.indexOf('id="payment-amount"')<source.indexOf('id="payment-essential"'));assert(source.indexOf('id="payment-essential"')<source.indexOf('id="payment-note"'));
});
check('A planned lunch is linked explicitly, survives editing, and avoids a false plan shortfall',()=>{
 const {L,set,fields}=account({balance:100});L.pickMerchant('AK01');set('payment-amount','80');set('payment-note','Lunch');set('payment-essential','food');L.preparePayment();
 assert.equal(L.state.paymentDraft.essentialId,'food');assert.equal(L.pauseEngine.evaluate(L.state.paymentDraft).planImpact,null);
 L.editPayment();assert(L.views.send().includes('value="food" selected'));L.savePaymentFields();assert.equal(L.state.paymentDraft.note,'Lunch');
 fields.clear();L.openPaymentPlanLink();assert.equal(L.route,'paymentPlanLink');set('payment-essential','');L.savePaymentPlanLink();assert.equal(L.route,'paymentReview');assert.equal(L.state.paymentDraft.essentialId,'');
 assert.equal(L.pauseEngine.evaluate(L.state.paymentDraft).planImpact.gapAfter,80);
});
check('Plan correction from Pause retains recipient and amount and requires fresh review',()=>{
 const {L,set}=account({balance:100});L.pickMerchant('AK01');set('payment-amount',80);set('payment-note','Lunch');set('payment-essential','');L.preparePayment();L.continuePayment();assert.equal(L.route,'pause');
 L.openPaymentPlanLink();assert.equal(L.route,'paymentPlanLink');assert(L.views.paymentPlanLink().includes('Choose a source'));
 set('payment-essential','food');L.savePaymentPlanLink();assert.equal(L.route,'paymentReview');assert.equal(L.state.paymentDraft.name,'Akua’s Kitchen');assert.equal(Number(L.state.paymentDraft.amount),80);assert.equal(L.state.paymentDraft.note,'Lunch');assert.equal(L.state.paymentDraft.reviewFingerprint,undefined);assert.equal(L.pauseEngine.evaluate(L.state.paymentDraft).planImpact,null);
});
check('Bills show the same visible optional plan choice before the note',()=>{
 const {L}=account({essentials:[{id:'data',name:'Data for the week',amount:40,paid:0}]});L.startBill('data');Object.assign(L.state.paymentDraft,{checked:true,provider:'MTN',destination:'0241230123',amount:40,product:'3 GB'});
 const source=L.views.bill();assert(source.includes('<span>Pay from</span>'));assert(source.includes('Data for the week · '));assert(source.indexOf('id="payment-essential"')<source.indexOf('id="payment-note"'));assert.equal(L.state.paymentDraft.essentialId,'');
});
check('Customer Pause correction rechecks the plan, authorizes once, and refunds the correct coverage',()=>{
 const {L,set,fields,ctx}=account({balance:100});
 // Use the customer-facing Pause composition and its actual action alongside
 // real payment/engine functions; drawing is unrelated to this money-flow check.
 L.illustration=kind=>`<div data-art="${kind}"></div>`;L.balanceNumber=L.money;
 vm.runInContext(fs.readFileSync(path.join(root,'dist/focus.js'),'utf8'),ctx,{filename:'focus.js'});
 L.pickMerchant('AK01');set('payment-amount',40);set('payment-note','Lunch');set('payment-essential','');L.preparePayment();fields.clear();L.continuePayment();
 assert.equal(L.route,'pause');assert.equal(L.pauseEngine.evaluate(L.state.paymentDraft).selected.code,'plan_essentials');
 const pause=L.views.pause();assert(pause.includes('This covers a budget item'));assert(pause.includes('L.openPaymentPlanLink()'));assert.equal(L.state.pauseEvents.filter(x=>x.action==='shown').length,1);
 L.openPaymentPlanLink();assert.equal(L.route,'paymentPlanLink');assert.equal(L.state.pauseEvents.filter(x=>x.action==='delay_payment').length,0,'Correcting a plan is not abandoning the payment');
 set('payment-essential','food');L.savePaymentPlanLink();fields.clear();assert.equal(L.route,'paymentReview');assert.equal(L.state.balance,100);assert.equal(L.state.essentials[0].paid,0);
 const review=L.views.paymentReview();assert(review.includes('Budget item: Food &amp; groceries'));assert.equal(L.pauseEngine.evaluate(L.state.paymentDraft).triggered,false);
 L.continuePayment();assert.equal(L.route,'authorize');set('payment-pin','123456');set('payment-outcome','Completed');L.authorizePayment();
 assert.equal(L.route,'paymentResult');assert.equal(L.state.balance,60);assert.equal(L.state.essentials[0].paid,40);assert.equal(L.balances().essentials,60);assert.equal(L.balances().gap,0);
 const payment=L.state.txs.find(t=>t.type==='out');assert.equal(payment.essentialId,'food');assert.equal(payment.note,'Lunch');const length=L.state.txs.length;
 L.authorizePayment();assert.equal(L.state.txs.length,length);assert.equal(L.state.balance,60);assert.equal(L.state.pauseEvents.filter(x=>x.action==='delay_payment').length,0);
 L.refundPayment(payment.id);assert.equal(L.state.balance,100);assert.equal(L.state.essentials[0].paid,0);assert.equal(L.balances().essentials,100);
});
console.log(count+' payment integrity checks passed.');
