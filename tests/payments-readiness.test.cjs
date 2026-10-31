/* Adversarial journeys use every script from the actual shipped index. */
'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {createHarness}=require('./helpers/task-sheet-dom.cjs');
const settle=h=>{h.flushHistory();h.flush();};
const view=h=>h.document.getElementById('view');
const savedRaw=h=>{const entry=[...h.store.entries()].find(([key])=>/^lumo-.+-edition-v1$/.test(key));assert(entry,'Current edition storage exists');return entry[1];};
function fixture(options={}){const h=createHarness({clock:true,testing:true,deferHistory:true,...options});h.L.explore();h.L.ensureAccounts();Object.assign(h.L.state,{balance:1000,txs:[],essentials:[],goals:[],virtualCards:[],paymentDraft:null});h.L.save();h.L.go('home');settle(h);return h;}
function seed(h){h.L.startSend('lumo');settle(h);h.L.pickPerson('abena');settle(h);h.set('payment-amount','47.50');h.set('payment-note','Keep my lunch draft');h.L.leavePayment();settle(h);h.L.keepPaymentLater();settle(h);return JSON.stringify(h.L.state.paymentDraft);}
function toPin(h){h.L.preparePayment();settle(h);if(h.L.route==='paymentReview'){h.L.continuePayment();settle(h);}if(h.L.route==='pause'){h.advance(3900);view(h).querySelector('[data-pause-hold]').click();h.advance(90);settle(h);}assert.equal(h.L.route,'authorize');}
function click(h,text){const b=view(h).querySelectorAll('button').find(b=>b.textContent.trim()===text);assert(b,text+' on '+h.L.route);b.click();settle(h);return b;}
function card(h){const c=h.L.virtualCards.issue({name:'My online card',draftId:'fixture-issue'});h.L.virtualCards.fund({cardId:c.id,amount:100,draftId:'fixture-topup'});return c;}
function lifecycle(h,c,action,amount){h.L.virtualCardUI.manage(c.id);settle(h);if(action==='return')h.set('vc-return-amount',amount);h.L.virtualCardUI.requestLifecycle(action,c.id);settle(h);assert.equal(h.L.route,'virtualCardAuthorize');assert.equal(h.document.getElementById('vc-pin'),null);click(h,'Continue to PIN');assert(h.document.getElementById('vc-pin'));}
function approve(h,pin='123456'){h.set('vc-pin',pin);h.L.virtualCardUI.approve();settle(h);}
const clean=h=>assert.deepEqual(h.errors,[]);

test('saved payment is protected at every new rail, bill, merchant, request and card entry',()=>{
 const entries=[['MoMo',L=>L.startSend('momo'),'momo'],['bank',L=>L.startSend('bank'),'bank'],...['airtime','data','electricity','water','tv','internet'].map(k=>[k,L=>L.startBill(k),'bill']),['merchant',L=>L.pickMerchant('AK01'),'campus'],['new card',L=>L.openVirtualCardCreation(),'virtualCardCreate'],['card funding',(L,c)=>L.openVirtualCardFunding(c.id),'virtualCard'],['request',L=>L.payRequest('incoming'),'request']];
 for(const [name,entry,method]of entries){const h=fixture(),c=card(h);h.L.state.requests=[{id:'incoming',status:'waiting',from:'other',to:'self',name:'Kojo',handle:'@kojo.o',amount:20,note:'Lunch'}];const before=seed(h);entry(h.L,c);settle(h);assert.equal(h.L.route,'everydayRepeatChoice',name);assert.equal(JSON.stringify(h.L.state.paymentDraft),before,name);h.L.replaceEverydayDraft();settle(h);assert.equal(h.L.state.paymentDraft.method,method,name);assert.notEqual(h.L.state.paymentDraft.note,'Keep my lunch draft',name);const id=h.L.state.paymentDraft.id;h.L.replaceEverydayDraft();settle(h);assert.equal(h.L.state.paymentDraft.id,id,'double replacement '+name);clean(h);}
});

test('entry order protects newer bill/card drafts and continuing same rail resumes details',()=>{
 for(const [first,second]of [['bill','momo'],['merchant','bank'],['create','airtime'],['fund','lumo']]){const h=fixture(),c=card(h),L=h.L;
  if(first==='bill')L.startBill('electricity');if(first==='merchant')L.pickMerchant('CP02');if(first==='create')L.openVirtualCardCreation();if(first==='fund')L.openVirtualCardFunding(c.id);settle(h);h.set('payment-amount',25);if(h.document.getElementById('payment-note'))h.set('payment-note','Unfinished');if(first==='create')L.virtualCardUI.capture();const saved=JSON.stringify(L.state.paymentDraft);
  if(second==='airtime')L.startBill('airtime');else L.startSend(second);settle(h);assert.equal(L.route,'everydayRepeatChoice');assert.equal(JSON.stringify(L.state.paymentDraft),saved);L.keepEverydayDraft();settle(h);assert.equal(JSON.stringify(L.state.paymentDraft),saved);clean(h);
 }
 const h=fixture();seed(h);const before=JSON.stringify(h.L.state.paymentDraft);h.L.startSend('lumo');settle(h);assert.equal(h.L.route,'send');assert.equal(JSON.stringify(h.L.state.paymentDraft),before);assert.equal(h.document.getElementById('payment-amount').value,'47.50');clean(h);
});

test('stale replacement consent cannot replace a changed draft or cross to another account',()=>{
 for(const change of ['draft','account','locked']){const h=fixture();seed(h);h.L.startSend('bank');settle(h);const id=h.L.state.paymentDraft.id;
  if(change==='draft')h.L.state.paymentDraft.note='Newer edit';if(change==='account'){h.L.state=JSON.parse(JSON.stringify(h.L.state));h.L.state.profile.account='another-account';}if(change==='locked')h.L.state.locked=true;
  h.L.replaceEverydayDraft();settle(h);assert.equal(h.L.state.paymentDraft.id,id);assert.equal(h.L.state.paymentDraft.method,'lumo');clean(h);
 }
});

test('editing review cannot reset the account PIN counter and five total failures lock without debit',()=>{
 const h=fixture();h.L.startSend('lumo');h.L.pickPerson('abena');settle(h);h.set('payment-amount',10);toPin(h);
 for(let i=0;i<4;i++){h.set('payment-pin','000000');h.L.authorizePayment();settle(h);}assert.equal(h.L.authPolicy.status().remaining,1);
 h.L.editPayment();settle(h);toPin(h);assert.equal(h.L.authPolicy.status().remaining,1);h.set('payment-pin','000000');h.L.authorizePayment();settle(h);assert.equal(h.L.state.locked,true);assert.equal(h.L.route,'signin');assert.equal(h.L.state.txs.length,0);assert.equal(h.L.state.balance,1000);clean(h);
});

test('card and payment approvals share one account failure policy',()=>{
 const h=fixture(),c=card(h);for(let i=0;i<4;i++){h.L.virtualCardUI.requestFreeze(c.id);settle(h);approve(h,'000000');h.L.go('home');settle(h);}assert.equal(h.L.authPolicy.status().remaining,1);
 h.L.startSend('lumo');h.L.pickPerson('abena');settle(h);h.set('payment-amount',10);toPin(h);h.set('payment-pin','000000');h.L.authorizePayment();settle(h);assert(h.L.state.locked);assert.equal(h.L.virtualCards.get(c.id).status,'active');assert.equal(h.L.state.balance,900);assert.equal(h.L.state.txs.length,1);clean(h);
});

test('card return has separate review and PIN, returns once and is not income or spending',()=>{
 const h=fixture(),c=card(h);lifecycle(h,c,'return',40);assert.equal(h.L.state.balance,900);approve(h,'000000');assert.equal(h.L.state.balance,900);approve(h);const t=h.L.state.txs[0];assert.equal(h.L.route,'txDetail');assert.equal(t.cardDirection,'out');assert.equal(h.L.state.balance,940);assert.equal(h.L.virtualCards.balance(c.id).available,60);h.L.virtualCardUI.approve();assert.equal(h.L.state.balance,940);assert.equal(h.L.spendingSummary({days:7}).total,0);assert.match(view(h).textContent,/Returned.*Everyday Money/);clean(h);
});

test('pending return holds only card money and settles or fails once',()=>{
 for(const result of ['success','failed']){const h=fixture(),c=card(h),t=h.L.virtualCards.returnFunds({cardId:c.id,amount:60,draftId:'return-pending',status:'pending'});assert.equal(h.L.state.balance,900);assert.equal(h.L.balances().available,900);assert.equal(h.L.virtualCards.balance(c.id).balance,100);assert.equal(h.L.virtualCards.balance(c.id).available,40);assert.throws(()=>h.L.virtualCards.returnFunds({cardId:c.id,amount:41,draftId:'overdraw'}));h.L.resolveTx(t.id,result);h.L.resolveTx(t.id,result);assert.equal(h.L.state.balance,result==='success'?960:900);assert.equal(h.L.virtualCards.balance(c.id).balance,result==='success'?40:100);clean(h);}
});

test('closing and replacement return funds, preserve records and free exactly one live slot',()=>{
 for(const action of ['close','replace']){const h=fixture(),c=card(h),other=h.L.virtualCards.issue({draftId:'other',name:'Other'});assert.equal(h.L.virtualCards.totals().count,2);lifecycle(h,c,action);assert.equal(h.L.state.balance,900);approve(h);assert.equal(h.L.state.balance,1000);assert.equal(h.L.virtualCards.get(c.id).balance,0);assert.equal(h.L.virtualCards.get(c.id).status,action==='close'?'closed':'replaced');assert.equal(h.L.virtualCards.totals().count,action==='close'?1:2);assert(h.L.virtualCards.get(other.id));assert.equal(h.L.virtualCards.history().length,1);assert.throws(()=>h.L.virtualCards.fund({cardId:c.id,amount:1,draftId:'closed-fund'}));assert.throws(()=>h.L.virtualCards.purchase({cardId:c.id,amount:1,draftId:'closed-buy'}));h.L.go('virtualCard',{id:c.id});settle(h);assert.match(view(h).textContent,/cannot make new payments/);assert(!view(h).querySelector('button[onclick*="requestReveal"]'));h.L.go('virtualCards');settle(h);assert.match(view(h).textContent,/Closed cards/);clean(h);}
});

test('pending purchase, top-up, refund or return prevents card closure and replacement',()=>{
 for(const kind of ['purchase','topup','refund','return']){const h=fixture(),c=card(h),api=h.L.virtualCards;if(kind==='purchase')api.purchase({cardId:c.id,amount:20,draftId:'pending',status:'pending'});if(kind==='topup')api.fund({cardId:c.id,amount:20,draftId:'pending',status:'pending'});if(kind==='return')api.returnFunds({cardId:c.id,amount:20,draftId:'pending',status:'pending'});if(kind==='refund'){const t=api.purchase({cardId:c.id,amount:20,draftId:'buy'});api.refund({originalId:t.id,draftId:'pending',status:'pending'});}const before=JSON.stringify([h.L.state.balance,h.L.state.txs,h.L.state.virtualCards]);for(const action of ['close','replace'])assert.throws(()=>api[action]({cardId:c.id,draftId:action}),/pending/i);assert.equal(JSON.stringify([h.L.state.balance,h.L.state.txs,h.L.state.virtualCards]),before);clean(h);}
});

test('refund after closure or replacement credits Everyday once with original purchase reference',()=>{
 for(const action of ['close','replace']){const h=fixture(),c=card(h),api=h.L.virtualCards,p=api.purchase({cardId:c.id,amount:40,draftId:'buy'});const result=api[action]({cardId:c.id,draftId:'end'});assert.equal(h.L.state.balance,960);const r=api.refund({originalId:p.id,draftId:'late-refund',status:'pending'});assert.equal(h.L.state.balance,960);api.resolve(r.id,'success');api.resolve(r.id,'success');assert.equal(h.L.state.balance,1000);assert.equal(api.balance(c.id).balance,0);assert.equal(r.refundAccount,'operational');assert.equal(r.originalId,p.id);assert.equal(api.refund({originalId:p.id,draftId:'late-refund'}).id,r.id);assert.equal(h.L.spendingSummary({days:7}).total,0);h.L.go('txDetail',{id:r.id});settle(h);assert.match(view(h).textContent,/Refund confirmed to Everyday Money/);assert.equal(result.replacement?api.balance(result.replacement.id).balance:0,0);clean(h);}
});

test('lifecycle review invalidates changed cards and save failures roll balances and slots back',()=>{
 const h=fixture(),c=card(h);lifecycle(h,c,'replace');h.L.virtualCards.purchase({cardId:c.id,amount:10,draftId:'changed',status:'pending'});approve(h);assert.equal(h.L.virtualCards.get(c.id).status,'active');assert.equal(h.L.state.balance,900);assert.equal(h.L.virtualCards.totals().count,1);
 h.L.resolveTx(h.L.state.txs[0].id,'failed');const before=JSON.stringify([h.L.state.balance,h.L.state.txs,h.L.state.virtualCards]),write=h.context.localStorage.setItem;h.context.localStorage.setItem=()=>{throw Error('quota');};assert.throws(()=>h.L.virtualCards.replace({cardId:c.id,draftId:'quota'}),/could not be saved|not committed/);h.context.localStorage.setItem=write;assert.equal(h.L.persistence.retrySave(),true);assert.equal(JSON.stringify([h.L.state.balance,h.L.state.txs,h.L.state.virtualCards]),before);const r=h.L.virtualCards.replace({cardId:c.id,draftId:'quota'});const b=h.L.state.balance;assert.equal(h.L.virtualCards.replace({cardId:c.id,draftId:'quota'}).replacement.id,r.replacement.id);assert.equal(h.L.state.balance,b);clean(h);
});

test('QR has a person-picker fallback, stops capture and retains saved-draft protection',()=>{
 const h=fixture();seed(h);h.L.qr.open();settle(h);const fallback=view(h).querySelectorAll('button').find(b=>b.textContent.trim()==='Find a Lumo person');assert(fallback);fallback.click();settle(h);assert.equal(h.L.route,'send');assert.equal(h.document.getElementById('payment-amount').value,'47.50');clean(h);
});

test('receipt sharing and download preserve status and exact reference with escaped portable HTML',async()=>{
 const h=fixture(),L=h.L,t=L.addTx({type:'out',name:'<script>recipient</script>',amount:10,fee:.5,status:'pending',method:'Mobile money',destination:'0241234567'});let shared,download;L.download=(name,body,type)=>download={name,body,type};L.go('txDetail',{id:t.id});settle(h);assert(view(h).querySelectorAll('button').some(b=>b.textContent.trim()==='Share receipt')===false,'Pending status keeps status action');L.receiptDownload(t.id);assert.match(download.name,/\.html$/);assert.match(download.body,/&lt;script&gt;/);assert(!download.body.includes('<script>recipient'));assert.match(download.body,/Payment being checked/);assert(download.body.includes(t.id));h.context.navigator.share=async data=>shared=data;await L.shareReceipt(t.id);assert(shared.text.includes(t.id));assert.match(shared.text,/Pending is not confirmation/);assert.match(shared.text,/Fee: GH₵0.50/);h.context.navigator.share=async()=>{throw Object.assign(Error('cancel'),{name:'AbortError'});};download=null;await L.shareReceipt(t.id);assert.equal(download,null);h.context.navigator.share=async()=>{throw Error('unavailable');};await L.shareReceipt(t.id);assert(download);assert.equal(L.state.balance,1000);clean(h);
});

test('an old detached choice cannot approve a newer replacement intent',()=>{
 const h=fixture();seed(h);h.L.startSend('bank');settle(h);const stale=view(h).querySelectorAll('button').find(b=>b.textContent.trim()==='Start this new payment');assert(stale);h.L.keepEverydayDraft();settle(h);h.L.startBill('data');settle(h);assert.equal(h.L.route,'everydayRepeatChoice');const before=JSON.stringify(h.L.state.paymentDraft);stale.click();settle(h);assert.equal(h.L.route,'everydayRepeatChoice');assert.equal(JSON.stringify(h.L.state.paymentDraft),before);click(h,'Start this new payment');assert.equal(h.L.state.paymentDraft.bill,'data');clean(h);
});

test('a full card balance above the per-purchase cap can return on closure without stranding money',()=>{
 const h=fixture(),c=card(h),api=h.L.virtualCards;h.L.state.balance=20000;api.fund({cardId:c.id,amount:5000,draftId:'large-one'});api.fund({cardId:c.id,amount:5000,draftId:'large-two'});const total=h.L.state.balance+api.balance(c.id).balance;api.close({cardId:c.id,draftId:'close-all'});assert.equal(api.balance(c.id).balance,0);assert.equal(h.L.state.balance,total);assert.equal(api.totals().count,0);clean(h);
});

test('a late share failure cannot download a receipt after sign-out or an account switch',async()=>{
 for(const change of ['lock','switch']){const h=fixture(),L=h.L,t=L.addTx({type:'out',name:'Recipient',amount:10,status:'success'});let reject,downloads=0;h.context.navigator.share=()=>new Promise((resolve,no)=>reject=no);L.download=()=>downloads++;const sharing=L.shareReceipt(t.id);if(change==='lock')L.state.locked=true;else L.state=JSON.parse(JSON.stringify(L.state));reject(Error('share failed'));await sharing;assert.equal(downloads,0);clean(h);}
});

test('ordinary authorisation rolls a failed browser commit back to the same review draft',()=>{
 const h=fixture(),L=h.L;L.startSend('lumo');L.pickPerson('abena');settle(h);h.set('payment-amount',10);h.set('payment-note','Retain this exact payment');toPin(h);const id=L.state.paymentDraft.id,stored=savedRaw(h),write=h.context.localStorage.setItem;
 h.context.localStorage.setItem=()=>{throw Error('quota');};h.set('payment-pin','123456');assert.doesNotThrow(()=>L.authorizePayment());settle(h);assert.equal(L.route,'paymentReview');assert.equal(L.state.balance,1000);assert.equal(L.state.txs.length,0);assert.equal(L.state.paymentDraft.id,id);assert.equal(L.state.paymentDraft.amount,10);assert.equal(L.state.paymentDraft.note,'Retain this exact payment');assert(!L.state.paymentDraft.submittedTxId);assert.equal(savedRaw(h),stored);assert(L.persistence.status().blocked);
 h.context.localStorage.setItem=write;assert(L.persistence.retrySave());L.continuePayment();settle(h);assert.equal(L.route,'authorize');h.set('payment-pin','123456');L.authorizePayment();settle(h);assert.equal(L.route,'paymentResult');assert.equal(L.state.balance,990);assert.equal(L.state.txs.length,1);clean(h);
});

test('failed card provider settlement keeps the exact pending reservation until retry can save',()=>{
 const h=fixture(),L=h.L,c=card(h),t=L.virtualCards.returnFunds({cardId:c.id,amount:60,draftId:'pending-return',status:'pending'}),write=h.context.localStorage.setItem;L.go('txDetail',{id:t.id});settle(h);h.context.localStorage.setItem=()=>{throw Error('quota');};assert.doesNotThrow(()=>L.settlePayment(t.id,'success'));settle(h);assert.equal(L.route,'txDetail');assert.equal(L.state.txs.find(x=>x.id===t.id).status,'pending');assert.equal(L.state.balance,900);assert.equal(L.virtualCards.balance(c.id).available,40);h.context.localStorage.setItem=write;assert(L.persistence.retrySave());L.settlePayment(t.id,'success');settle(h);assert.equal(L.state.balance,960);assert.equal(L.virtualCards.balance(c.id).available,40);assert.equal(L.state.txs.find(x=>x.id===t.id).status,'success');clean(h);
});

test('offline entry and financial actions preserve existing drafts and balances',()=>{
 const h=fixture(),c=card(h);seed(h);const before=JSON.stringify(h.L.state.paymentDraft),balance=h.L.state.balance;h.context.navigator.onLine=false;h.emit('offline');for(const action of [()=>h.L.startSend('bank'),()=>h.L.startBill('data'),()=>h.L.pickMerchant('CP02')]){action();settle(h);assert.equal(JSON.stringify(h.L.state.paymentDraft),before);}assert.throws(()=>h.L.virtualCards.returnFunds({cardId:c.id,amount:10,draftId:'offline'}),/connection|Reconnect/);assert.equal(h.L.state.balance,balance);assert.equal(h.L.virtualCards.balance(c.id).balance,100);clean(h);
});

test('an ordinary refund credit and original reversal commit together or neither survives',()=>{
 const h=fixture(),L=h.L,t=L.addTx({type:'out',name:'Merchant',amount:25,fee:1,status:'success',method:'Lumo'}),write=h.context.localStorage.setItem;L.go('txDetail',{id:t.id});settle(h);assert.equal(L.state.balance,974);h.context.localStorage.setItem=()=>{throw Error('quota');};assert.doesNotThrow(()=>L.refundPayment(t.id));settle(h);assert.equal(L.state.balance,974);assert.equal(L.state.txs.length,1);assert.equal(L.state.txs[0].status,'success');assert(!L.state.txs[0].refundId);h.context.localStorage.setItem=write;assert(L.persistence.retrySave());L.refundPayment(t.id);settle(h);assert.equal(L.state.balance,1000);assert.equal(L.state.txs.length,2);assert.equal(L.state.txs.find(x=>x.id===t.id).status,'reversed');L.refundPayment(t.id);settle(h);assert.equal(L.state.balance,1000);assert.equal(L.state.txs.length,2);clean(h);
});

test('incoming request and bank credits cannot commit money without their one-time funding linkage',()=>{
 for(const kind of ['request','bank']){const h=fixture(),L=h.L;let action;
  if(kind==='request'){L.state.requests=[{id:'own-request',from:'self',to:'Kojo',amount:20,note:'Lunch',status:'waiting'}];L.save();L.go('requestDetail',{id:'own-request'});settle(h);action=()=>L.simRequestCredit('own-request');}
  else{L.startBankFunding();settle(h);h.set('bank-test-amount',20);action=()=>L.testBankCredit();}
  const write=h.context.localStorage.setItem;h.context.localStorage.setItem=()=>{throw Error('quota');};assert.doesNotThrow(action);settle(h);assert.equal(L.state.balance,1000);assert.equal(L.state.txs.length,0);if(kind==='request'){assert.equal(L.state.requests[0].status,'waiting');assert(!L.state.requests[0].txId);}else assert(!L.state.bankFunding.txId);
  h.context.localStorage.setItem=write;assert(L.persistence.retrySave());action();settle(h);action();settle(h);assert.equal(L.state.balance,1020);assert.equal(L.state.txs.length,1);clean(h);
 }
});

test('an expired replacement view offers a working resume without a dead confirmation button',()=>{
 const h=fixture();seed(h);const saved=JSON.stringify(h.L.state.paymentDraft);h.L.go('everydayRepeatChoice');settle(h);assert.match(view(h).textContent,/choice expired/);assert(!view(h).querySelectorAll('button').some(b=>b.textContent.trim()==='Start this new payment'));click(h,'Continue saved payment');assert.equal(h.L.route,'send');assert.equal(JSON.stringify(h.L.state.paymentDraft),saved);clean(h);
});
