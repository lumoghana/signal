/* Tests run the shipped payment engine and sheet controller, with no fake bank.
   The small DOM verifies state/focus/controls, not physical phone rendering. */
const assert=require('node:assert/strict');
const fs=require('node:fs');
const {createHarness}=require('./helpers/task-sheet-dom.cjs');
const scriptOrder=[...fs.readFileSync('dist/index.html','utf8').matchAll(/<script\b[^>]*\bsrc="\/([^"?]+)(?:\?[^" ]*)?"/g)].map(m=>m[1]);
if(!scriptOrder.includes('campus-everyday.js'))scriptOrder.push('campus-everyday.js');
let passed=0,failed=0;
const check=(name,run)=>{try{run();passed++;console.log('PASS '+name);}catch(error){failed++;process.exitCode=1;console.error('FAIL '+name+'\n'+error.stack);}};
const clone=value=>JSON.parse(JSON.stringify(value));
const view=h=>h.document.getElementById('view');
const financial=L=>clone({balance:L.state.balance,txs:L.state.txs,essentials:L.state.essentials,goals:L.state.goals});
const clean=h=>assert.deepEqual(h.errors,[]);
function fixture(options={}){
 const h=createHarness({clock:true,testing:true,modules:scriptOrder,...options});h.L.explore();
 h.L.state.txs=[];h.L.route='home';h.L.params={};h.L.history=[];h.L.render();h.flush();return h;
}
function receipt(h,options={}){
 const t={id:'R-DEMO-1',date:'2026-10-22T12:00:00Z',type:'out',status:'success',name:'Akua’s Kitchen',amount:80,fee:0,method:'Campus Pay',destination:'AK01',category:'Food',paymentDraft:{id:'D-OLD',method:'campus',name:'Akua’s Kitchen',destination:'AK01',merchantId:'AK01',amount:80,fee:0,note:'Lunch',checked:true,essentialId:'',reviewFingerprint:'OLD-QUOTE',pauseAcceptedSignature:'OLD-PAUSE',submittedTxId:'R-DEMO-1',pinAttempts:2,authToken:'old-auth'},...options};
 h.L.state.txs.unshift(t);h.L.save();return t;
}
function complete(h,{amount=80,source='',outcome='Completed'}={}){
 h.L.pickMerchant('AK01');h.flush();h.set('payment-amount',amount);h.set('payment-essential',source);h.L.preparePayment();h.flush();
 if(h.L.route==='pause'){h.advance(3900);h.L.resumeFromPause();h.advance(90);h.flush();}else{h.L.continuePayment();h.flush();}
 assert.equal(h.L.route,'authorize');h.set('payment-pin','123456');h.set('payment-outcome',outcome);h.submit(view(h).querySelector('form'));h.flush();assert.equal(h.L.route,'paymentResult');return h.L.state.txs[0];
}
check('Recent and Favourites are one contextual selection surface, and QR/code remain available',()=>{
 const h=fixture();h.L.openTab('pay');h.flush();assert(view(h).querySelector('.everyday-shortcuts'));
 h.L.go('campusPay');h.flush();assert(view(h).querySelector('.qr-start'));assert(view(h).querySelector('#merchant-code'));assert(view(h).querySelector('.everyday-shortcuts'));
 h.L.openEverydayPayments('favourites');h.flush();assert.equal(h.document.querySelectorAll(h.L.signalEdition?'.task-sheet[role="region"]':'[role="dialog"]').length,1);assert.equal(h.L.taskSheet.baseRoute,'pay');
 assert.equal(view(h).querySelectorAll('.everyday-merchant-row').length,3);assert(!view(h).textContent.includes('live merchant directory'));clean(h);
});
check('Favourites use the real bundled catalogue and persist within existing demo storage',()=>{
 const h=fixture(),before=financial(h.L);h.L.openEverydayPayments('favourites');h.flush();assert.equal(h.L.toggleMerchantFavourite('AK01'),true);
 assert.deepEqual(clone(h.L.state.everydayPayments.favourites),['AK01']);assert.equal(h.L.toggleMerchantFavourite('UNKNOWN'),false);assert.deepEqual(financial(h.L),before);
 assert.equal(h.L.everydayPayments.merchants().length,3);assert.equal(h.L.everydayPayments.merchant('CP02').name,'Campus Print');assert.equal(h.L.everydayPayments.merchant('UNKNOWN'),null);
 h.L.chooseEverydayMerchant('AK01');h.flush();assert.equal(h.L.route,'send');assert.equal(h.L.state.paymentDraft.amount,'');assert.equal(h.L.state.paymentDraft.destination,'AK01');assert.deepEqual(financial(h.L),before);clean(h);
});
check('A receipt repeat starts an editable draft and discards every old authorisation field',()=>{
 const h=fixture(),t=receipt(h),before=financial(h.L);assert.equal(h.L.repeatEverydayPayment(t.id),true);h.flush();
 const d=h.L.state.paymentDraft;assert.equal(h.L.route,'send');assert.notEqual(d.id,t.paymentDraft.id);assert.equal(Number(d.amount),80);assert.equal(d.destination,'AK01');assert.equal(d.repeatOf,t.id);assert.equal(d.note,'Lunch');
 for(const field of ['submittedTxId','reviewFingerprint','pauseAcceptedSignature','authToken'])assert.equal(d[field],undefined,field+' must not be copied');
 assert.deepEqual(financial(h.L),before);h.set('payment-amount',60);h.L.preparePayment();h.flush();assert.equal(h.L.route,'paymentReview');assert.equal(h.L.state.paymentDraft.amount,60);assert.deepEqual(financial(h.L),before);clean(h);
});
check('Known recipients only: unknown, closed and blocked saved recipients cannot open payment entry',()=>{
 const h=fixture(),t=receipt(h),before=financial(h.L);t.paymentDraft.destination='MISSING';t.paymentDraft.merchantId='MISSING';assert.equal(h.L.repeatEverydayPayment(t.id),false);assert(h.L.state.paymentDraft==null);
 t.paymentDraft.destination='AK01';t.paymentDraft.merchantId='AK01';t.paymentDraft.recipientStatus='closed';assert.equal(h.L.repeatEverydayPayment(t.id),false);delete t.paymentDraft.recipientStatus;t.paymentDraft.recipientBlocked=true;assert.equal(h.L.repeatEverydayPayment(t.id),false);
 assert.equal(h.L.state.balance,before.balance);assert.equal(h.L.state.txs.length,before.txs.length);clean(h);
});
check('The previous active Budget source is retained, and a removed source gets one clear prompt',()=>{
 const h=fixture(),id=h.L.state.essentials[0].id,t=receipt(h);t.paymentDraft.essentialId=id;
 assert.equal(h.L.repeatEverydayPayment(t.id),true);h.flush();assert.equal(h.L.state.paymentDraft.essentialId,id);assert.equal(view(h).querySelectorAll('.everyday-repeat-hint').length,0);
 h.L.state.paymentDraft=null;h.L.state.essentials.find(item=>item.id===id).archived=true;
 assert.equal(h.L.repeatEverydayPayment(t.id),true);h.flush();assert.equal(h.L.state.paymentDraft.essentialId,'');assert.equal(view(h).querySelectorAll('.everyday-repeat-hint').length,1);assert(view(h).querySelector('.everyday-repeat-hint').textContent.includes('Choose a source'));clean(h);
});
check('A changed source is revalidated after the draft-replacement choice, not just before it',()=>{
 const h=fixture(),t=receipt(h),source=h.L.state.essentials[0];t.paymentDraft.essentialId=source.id;
 h.L.pickMerchant('CP02');h.flush();h.set('payment-amount',20);const saved=h.L.state.paymentDraft;
 assert.equal(h.L.repeatEverydayPayment(t.id),false);h.flush();assert.equal(h.L.route,'everydayRepeatChoice');assert.equal(h.L.state.paymentDraft,saved);
 source.deleted=true;h.L.replaceEverydayDraft();h.flush();assert.equal(h.L.state.paymentDraft.essentialId,'');assert(view(h).querySelector('.everyday-repeat-hint'));assert.equal(h.document.querySelectorAll(h.L.signalEdition?'.task-sheet[role="region"]':'[role="dialog"]').length,1);clean(h);
});
check('An unfinished payment is not overwritten by a repeat without a choice',()=>{
 const h=fixture(),t=receipt(h);h.L.pickMerchant('CP02');h.flush();h.set('payment-amount',45);h.set('payment-note','Keep this');const d=h.L.state.paymentDraft;
 h.L.repeatEverydayPayment(t.id);h.flush();assert.equal(h.L.route,'everydayRepeatChoice');assert.equal(h.L.state.paymentDraft,d);h.L.keepEverydayDraft();h.flush();assert.equal(h.L.route,'send');assert.equal(h.L.state.paymentDraft,d);assert.equal(h.L.state.paymentDraft.note,'Keep this');assert.equal(h.L.state.paymentDraft.amount,'45');clean(h);
});
check('Recents deduplicate current recipients and exclude pending, failed, internal, refunded and unknown records',()=>{
 const h=fixture();h.L.state.txs=[];receipt(h,{id:'R-OLDER',date:'2026-10-20T12:00:00Z'});receipt(h,{id:'R-NEWER'});receipt(h,{id:'R-PENDING',status:'pending'});receipt(h,{id:'R-FAILED',status:'failed'});receipt(h,{id:'R-REFUND',refunded:80});const unknown=receipt(h,{id:'R-UNKNOWN'});unknown.paymentDraft.merchantId='UNKNOWN';unknown.paymentDraft.destination='UNKNOWN';
 assert.deepEqual(clone(h.L.everydayPayments.recent()),['R-NEWER']);h.L.openEverydayPayments();h.flush();assert(view(h).textContent.includes('Still being checked'));assert(view(h).querySelectorAll('button').some(button=>button.getAttribute('onclick')==="L.openPaymentRecovery('R-PENDING')"));clean(h);
});
check('Pending payment repeat and retry both open its same reference without a second submission',()=>{
 const h=fixture(),t=complete(h,{outcome:'Pending'}),before=financial(h.L);assert.equal(h.L.repeatEverydayPayment(t.id),false);h.flush();assert.equal(h.L.route,'paymentRecovery');assert(view(h).textContent.includes(t.id));
 assert.equal(h.L.retryPayment(t.id),false);h.flush();assert.equal(h.L.state.txs.length,before.txs.length);assert.equal(h.L.state.balance,before.balance);assert.equal(h.L.state.paymentDraft.submittedTxId,t.id);
 h.L.checkEverydayPayment(t.id);h.flush();assert.equal(t.status,'pending');assert.equal(h.L.state.txs.length,before.txs.length);assert.equal(h.L.state.balance,before.balance);assert.equal(h.L.route,'paymentRecovery');assert(t.lastChecked);assert.equal(h.document.querySelectorAll(h.L.signalEdition?'.task-sheet[role="region"]':'[role="dialog"]').length,1);clean(h);
});
check('Status checks do not invent success, and simulation controls require testing mode',()=>{
 const h=fixture({testing:false}),t=receipt(h,{status:'pending'}),before=h.L.state.balance;h.L.openPaymentRecovery(t.id);h.flush();assert(!view(h).querySelector('.everyday-simulation'));
 assert.equal(h.L.simulateEverydayPayment(t.id,'success'),false);h.L.checkEverydayPayment(t.id);h.flush();assert.equal(t.status,'pending');assert.equal(h.L.state.balance,before);assert.equal(h.L.state.txs.length,1);clean(h);
});
check('A recent completed receipt cannot duplicate another pending payment to that recipient',()=>{
 const h=fixture(),completed=receipt(h,{id:'R-COMPLETE'}),pending=receipt(h,{id:'R-WAITING',status:'pending'}),before=financial(h.L);
 assert.equal(h.L.repeatEverydayPayment(completed.id),false);h.flush();assert.equal(h.L.route,'paymentRecovery');assert.equal(h.L.params.id,pending.id);assert.deepEqual(financial(h.L),before);assert(h.L.state.paymentDraft==null);clean(h);
});
check('A newly pending payment is rechecked before replacing a saved draft',()=>{
 const h=fixture(),completed=receipt(h,{id:'R-COMPLETE'});h.L.pickMerchant('CP02');h.flush();h.set('payment-amount',45);h.set('payment-note','My saved print payment');const saved=h.L.state.paymentDraft;
 h.L.repeatEverydayPayment(completed.id);h.flush();assert.equal(h.L.route,'everydayRepeatChoice');const pending=receipt(h,{id:'R-NEW-PENDING',status:'pending'}),before=financial(h.L);
 assert.equal(h.L.replaceEverydayDraft(),false);h.flush();assert.equal(h.L.route,'paymentRecovery');assert.equal(h.L.params.id,pending.id);assert.equal(h.L.state.paymentDraft,saved);assert.equal(saved.note,'My saved print payment');assert.deepEqual(financial(h.L),before);clean(h);
});
check('Refreshing a payment retains its surface and browser Back position',()=>{
 const h=fixture(),t=receipt(h,{status:'pending'});h.L.openPaymentRecovery(t.id);h.flush();const count=h.history.length;
 h.L.checkEverydayPayment(t.id);h.flush();assert.equal(h.history.length,count);assert.equal(h.L.route,'paymentRecovery');h.L.back();h.flushHistory();h.flush();assert.equal(h.L.route,'home');clean(h);
});
check('A simulated provider confirmation settles once, and a later status check cannot charge again',()=>{
 const h=fixture(),t=complete(h,{outcome:'Pending'}),before=h.L.state.balance,count=h.L.state.txs.length;
 assert.equal(h.L.simulateEverydayPayment(t.id,'success'),true);h.flush();assert.equal(t.status,'success');assert.equal(h.L.state.balance,before-80);assert.equal(h.L.simulateEverydayPayment(t.id,'success'),false);h.L.checkEverydayPayment(t.id);h.flush();assert.equal(h.L.state.balance,before-80);assert.equal(h.L.state.txs.length,count);clean(h);
});
check('Failed retry uses a new draft, editable details and a new review/authentication',()=>{
 const h=fixture(),t=complete(h,{outcome:'Failed'}),before=h.L.state.balance,count=h.L.state.txs.length,old=t.paymentDraft.id;
 assert.equal(h.L.retryPayment(t.id),true);h.flush();assert.equal(h.L.route,'send');assert.notEqual(h.L.state.paymentDraft.id,old);assert.equal(h.L.state.paymentDraft.submittedTxId,undefined);assert.equal(h.L.state.balance,before);assert.equal(h.L.state.txs.length,count);
 h.set('payment-amount',55);h.L.preparePayment();h.flush();assert.equal(h.L.route,'paymentReview');h.L.continuePayment();h.flush();assert.equal(h.L.route,'authorize');assert.equal(h.L.state.balance,before);h.set('payment-pin','123456');h.set('payment-outcome','Completed');h.submit(view(h).querySelector('form'));h.flush();assert.equal(h.L.state.balance,before-55);assert.equal(h.L.state.txs.length,count+1);assert.equal(t.status,'failed');
 h.L.authorizePayment();h.flush();assert.equal(h.L.state.balance,before-55);assert.equal(h.L.state.txs.length,count+1);clean(h);
});
check('External repeats re-check the current recipient instead of copying a checked state',()=>{
 const h=fixture(),t=receipt(h);t.paymentDraft={method:'momo',destination:'0241234567',checked:true,amount:80,note:'Share',provider:'OLD NETWORK',essentialId:''};assert.equal(h.L.repeatEverydayPayment(t.id),true);h.flush();const d=h.L.state.paymentDraft;assert.equal(d.method,'momo');assert.equal(d.checked,false);assert.equal(d.inputNumber,'0241234567');assert.notEqual(d.provider,'OLD NETWORK');assert.equal(h.L.route,'send');assert(view(h).querySelector('#recipient-number'));assert.equal(Number(view(h).querySelector('#payment-amount').value),80);clean(h);
});
check('Data repeats use current package selection and never copy a stale product price',()=>{
 const h=fixture(),t=receipt(h,{amount:999});t.paymentDraft={method:'bill',bill:'data',destination:'0241234567',checked:true,amount:999,product:'Discontinued bundle',packageIndex:999,provider:'OLD',essentialId:''};assert.equal(h.L.repeatEverydayPayment(t.id),true);h.flush();const d=h.L.state.paymentDraft;assert.equal(h.L.route,'bill');assert.equal(d.amount,15);assert.equal(d.packageIndex,0);assert(!d.product.includes('Discontinued'));assert.equal(d.checked,false);assert(view(h).querySelector('.everyday-repeat-hint').textContent.includes('current bundle'));clean(h);
});
check('A repeat cannot bypass a changed financial consequence or a closed account',()=>{
 const h=fixture(),t=receipt(h);h.L.repeatEverydayPayment(t.id);h.flush();h.L.preparePayment();h.flush();assert.equal(h.L.route,'paymentReview');h.L.continuePayment();h.flush();assert.equal(h.L.route,'authorize');h.L.state.essentials[0].amount=1000;h.set('payment-pin','123456');h.submit(view(h).querySelector('form'));h.flush();assert.equal(h.L.route,'pause');assert.equal(h.L.state.txs.length,1);assert.equal(h.L.state.txs[0].id,t.id);
 h.L.state.closed=true;const draft=h.L.state.paymentDraft;assert.equal(h.L.repeatEverydayPayment(t.id),false);assert.equal(h.L.state.paymentDraft,draft);clean(h);
});
check('Status help carries the payment reference into the existing support flow',()=>{
 const h=fixture(),t=receipt(h,{status:'failed'});h.L.openPaymentRecovery(t.id);h.flush();const help=view(h).querySelectorAll('button').find(button=>button.textContent==='Get help');assert(help);help.click();h.flush();assert.equal(h.L.route,'supportCase');assert.equal(h.L.params.txId,t.id);assert.equal(h.L.params.reference,t.id);assert.equal(h.document.querySelectorAll(h.L.signalEdition?'.task-sheet[role="region"]':'[role="dialog"]').length,1);clean(h);
});
console.log(`${passed} passed; ${failed} failed`);
