/* Actual shipped script order and mounted forms. No physical-keyboard claims. */
const assert=require('node:assert/strict');
const {createHarness}=require('./helpers/task-sheet-dom.cjs');
let passed=0;
const check=(name,fn)=>{fn();passed++;console.log('PASS '+name);};
function fixture(options={}){
 const h=createHarness({clock:true,...options}),{L}=h;L.explore();
 // The legacy GH₵600 total now holds GH₵500 operational + GH₵100 savings.
 // Money Boxes are already funded, so only the GH₵350 budget reduces room.
 Object.assign(L.state,{balance:500,txs:[],paymentDraft:null,essentials:[{id:'food',name:'Food',amount:250,paid:0},{id:'transport',name:'Transport',amount:100,paid:0}],goals:[{id:'laptop',name:'Laptop',target:3000,allocated:100,boxVersion:2}],chats:[],allowance:{amount:0,date:''}});
 assert.equal(L.accountBalances().savings,100);assert.equal(L.accountBalances().total,600);assert.equal(L.balances().room,150);
 L.route='pay';L.params={};L.history=[];L.render();h.flush();return h;
}
const view=h=>h.document.getElementById('view');
function submit(h){const b=view(h).querySelector('button[type="submit"]');assert(b);b.click();h.flush();}
function pin(h,outcome='Completed'){
 if(h.L.route==='pause'){h.advance(3900);view(h).querySelector('[data-pause-hold]').click();h.advance(90);h.flush();}
 else {assert.equal(h.L.route,'paymentReview');h.L.continuePayment();h.flush();}
 assert.equal(h.L.route,'authorize');assert(view(h).querySelector('.transaction-stage').textContent.includes('3 of 3'));
 h.set('payment-pin','123456');if(h.L.testMode)h.set('payment-outcome',outcome);submit(h);
 assert.equal(h.L.route,'paymentResult');assert.deepEqual(h.errors,[]);
}
for(const [amount,available,room,essGap,goalGap]of [[80,420,70,0,0],[140,360,10,0,0],[280,220,0,130,0]])check('Campus Pay '+amount+' has one decision stage and agrees with Chat and final account',()=>{
 const h=fixture(),{L}=h;L.pickMerchant('AK01');h.set('payment-amount',amount);h.set('payment-essential','');
 assert(view(h).querySelector('.transaction-stage').textContent.includes('1 of 3'));
 const preview=L.paymentProjection(),chat=L.chatAnswer('Can I spend GH₵'+amount+'?');assert.equal(preview.after,available);assert.equal(preview.room,room);assert.equal(preview.essentialGap,essGap);assert.equal(preview.goalGap,goalGap);assert(chat.text.includes(L.money(essGap||goalGap||room)));
 submit(h);assert.equal(L.route,amount===280?'pause':'paymentReview');assert.equal(L.state.balance,500);assert.equal(L.state.txs.length,0);
 assert(view(h).querySelector('.transaction-stage').textContent.includes('2 of 3'));
 if(amount===280){assert(!L.history.some(x=>x.route==='paymentReview'));const facts=view(h).querySelector('.decision-payment-summary').textContent;assert(facts.includes('Fee'));assert(facts.includes('GH₵0.00'));assert(facts.includes('Total'));assert(facts.includes('GH₵280.00'));assert(view(h).textContent.includes('AK01'));}
 pin(h);assert.equal(L.balances().available,available);assert.equal(L.balances().room,room);assert.equal(L.balances().gap,essGap+goalGap);assert.equal(L.accountBalances().savings,100);assert.equal(L.state.txs.length,1);
 L.authorizePayment();assert.equal(L.state.txs.length,1);
});
check('linked cost still fulfils essentials once through the three-stage path',()=>{
 const h=fixture(),{L}=h;L.pickMerchant('AK01');h.set('payment-amount',80);h.set('payment-essential','food');submit(h);pin(h);
 assert.equal(L.balances().available,420);assert.equal(L.balances().essentials,270);assert.equal(L.balances().allocated,0);assert.equal(L.accountBalances().savings,100);assert.equal(L.balances().room,150);
});
check('Lumo recipient and amount share details; recipient choice retains entered values',()=>{
 const h=fixture(),{L}=h;L.startSend('lumo');assert(h.document.getElementById('payment-person'));assert(h.document.getElementById('payment-amount'));h.set('payment-amount',80);h.set('payment-note','Lunch');L.pickPerson('abena');
 assert.equal(h.document.getElementById('payment-amount').value,'80');assert.equal(h.document.getElementById('payment-note').value,'Lunch');submit(h);assert.equal(L.route,'paymentReview');assert(view(h).textContent.includes('Abena Asante'));pin(h);assert.equal(L.state.balance,420);
});
for(const [method,number,provider,fee]of [['momo','0241234567','MTN MoMo',.5],['bank','102345678901','GCB Bank',1]])check(method+' checks destination and amount together then includes fee on Pause',()=>{
 const h=fixture(),{L}=h;L.startSend(method);assert(h.document.getElementById('recipient-number'));assert(h.document.getElementById('payment-amount'));
 if(method==='bank')h.set('recipient-provider',provider);else assert.equal(h.document.getElementById('recipient-provider'),null);h.set('recipient-number',number);h.set('payment-amount',280);submit(h);assert.equal(L.route,'pause');assert.equal(L.state.paymentDraft.checked,true);assert.equal(L.state.paymentDraft.fee,fee);assert.equal(L.state.paymentDraft.provider,provider);assert(view(h).querySelector('.decision-payment-summary').textContent.includes(L.money(fee)));assert(view(h).textContent.includes(number));pin(h);assert.equal(L.state.balance,220-fee);
});
check('invalid lookup stays in details with amount retained and no transaction',()=>{
 const h=fixture(),{L}=h;L.startSend('momo');assert.equal(h.document.getElementById('recipient-provider'),null);h.set('recipient-number','0249999999');h.set('payment-amount',80);submit(h);assert.equal(L.route,'send');assert.equal(h.document.getElementById('payment-amount').value,'80');assert.equal(L.state.txs.length,0);assert.equal(L.state.balance,500);assert(view(h).querySelector('#error').textContent.includes('Network lookup unavailable'));
});
for(const kind of ['airtime','data','electricity','water','tv','internet'])check(kind+' account, package or amount are one details stage',()=>{
 const h=fixture(),{L}=h;L.startBill(kind);if(['electricity','tv','internet'].includes(kind))h.set('bill-provider',({electricity:'ECG Prepaid',tv:'DStv',internet:'Telecel Broadband'})[kind]);else assert.equal(h.document.getElementById('bill-provider'),null,'Machine-known provider needs no selector');h.set('bill-account',['airtime','data'].includes(kind)?'0241230123':'12345678901');
 if(['data','tv','internet'].includes(kind)){h.set('bill-package','0');L.selectBillPackage();}else h.set('payment-amount',80);
 submit(h);assert.equal(L.route,'paymentReview');assert.equal(L.state.paymentDraft.checked,true);assert.equal(L.state.paymentDraft.provider,({airtime:'MTN',data:'MTN',electricity:'ECG Prepaid',water:'Ghana Water',tv:'DStv',internet:'Telecel Broadband'})[kind]);assert(!L.history.some(x=>x.route==='pause'));pin(h);assert.equal(L.state.txs.length,1);assert.equal(L.state.txs[0].bill,kind);
});
check('plan edits, fixed request payments and stale quotes all use the same decision selector',()=>{
 // GH₵240 affects the budget as extra spending, but fits when linked. GH₵280
 // also exceeds half this operational balance and retains a behavioral Pause.
 const h=fixture(),{L}=h;L.pickMerchant('AK01');h.set('payment-amount',240);submit(h);assert.equal(L.route,'pause');L.openPaymentPlanLink();h.set('payment-essential','food');L.savePaymentPlanLink();assert.equal(L.route,'paymentReview');L.continuePayment();assert.equal(L.route,'authorize');
 const stale=fixture();stale.L.pickMerchant('AK01');stale.set('payment-amount',80);submit(stale);stale.L.continuePayment();stale.L.state.essentials[0].amount=500;stale.set('payment-pin','123456');submit(stale);assert.equal(stale.L.route,'pause');assert.equal(stale.L.state.txs.length,0);assert.equal(stale.L.state.balance,500);assert.equal(stale.L.accountBalances().savings,100);
 const a=fixture();a.L.state.requests=[{id:'request',status:'waiting',name:'Abena',handle:'@abena',to:'self',from:'abena',amount:280,expires:new Date(Date.now()+86400000).toISOString()}];a.L.payRequest('request');assert.equal(a.L.route,'pause');assert(a.document.getElementById('view').textContent.includes('GH₵280.00'));
});
for(const outcome of ['Pending','Failed'])check(outcome+' result is truthful and repeated submission cannot create a second payment',()=>{
 const h=fixture({testing:true}),{L}=h;L.pickMerchant('AK01');h.set('payment-amount',80);submit(h);pin(h,outcome);assert.equal(L.state.txs[0].status,outcome.toLowerCase());assert.equal(L.state.balance,500);assert.equal(L.balances().available,outcome==='Pending'?420:500);L.authorizePayment();assert.equal(L.state.txs.length,1);assert.equal(L.state.balance,500);assert.equal(L.accountBalances().savings,100);
});
check('insufficient account money remains a blocked review, never a Pause or authorisation',()=>{
 const h=fixture(),{L}=h;L.pickMerchant('AK01');h.set('payment-amount',700);submit(h);assert.equal(L.route,'paymentReview');assert(view(h).textContent.includes('200.00 more needed'));L.continuePayment();assert.equal(L.route,'paymentReview');assert.equal(L.state.txs.length,0);
});
console.log(passed+' three-stage journey checks passed.');
