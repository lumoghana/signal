/* Network lookup is metadata, never recipient verification or payment consent. */
const assert=require('node:assert/strict');
const {createHarness}=require('./helpers/task-sheet-dom.cjs');
let passed=0;
async function check(name,fn){await fn();passed++;console.log('PASS '+name);}
const view=h=>h.document.getElementById('view');
function fixture(options={}){
 const h=createHarness({clock:true,...options}),{L}=h;L.explore();
 Object.assign(L.state,{balance:600,txs:[],paymentDraft:null,essentials:[{id:'food',name:'Food and transport',amount:350,paid:0}],goals:[{id:'laptop',name:'Laptop',allocated:100,target:3500}],categoryRules:[],chats:[]});
 L.route='pay';L.params={};L.history=[];L.render();h.flush();return h;
}
function submit(h){view(h).querySelector('button[type="submit"]').click();h.flush();}
const clean=h=>assert.deepEqual(h.errors,[]);
const next=async()=>{await Promise.resolve();await Promise.resolve();};
(async()=>{
await check('MoMo asks only for wallet number and amount, then checks the network automatically',()=>{
 const h=fixture(),{L}=h;L.startSend('momo');assert(!h.document.getElementById('recipient-provider'));h.set('payment-amount',80);h.set('payment-note','Lunch');h.set('recipient-number','0241234567');
 assert.equal(L.state.paymentDraft.provider,'MTN MoMo');assert.equal(L.mobileNetwork.inspect(L.state.paymentDraft).status,'resolved');assert(view(h).querySelector('[data-mobile-network-status]').textContent.includes('Sample lookup'));
 submit(h);assert.equal(L.route,'paymentReview');assert.equal(L.state.paymentDraft.name,'Abena Asante');assert.equal(L.state.paymentDraft.provider,'MTN MoMo');assert.equal(Number(L.state.paymentDraft.amount),80);assert.equal(L.state.paymentDraft.note,'Lunch');assert.equal(L.state.balance,600);assert.equal(L.state.txs.length,0);L.continuePayment();assert.equal(L.route,'authorize');clean(h);
});
await check('the sample portability response wins over the number prefix',()=>{
 const h=fixture(),{L}=h;L.startBill('airtime');h.set('bill-account','0241230002');assert.equal(L.state.paymentDraft.provider,'Telecel');assert.equal(L.mobileNetwork.inspect(L.state.paymentDraft).operator,'telecel');h.set('bill-account','0241234567');assert.equal(L.state.paymentDraft.provider,'MTN');clean(h);
});
await check('airtime and data use the detected network and international/local formats agree',()=>{
 for(const bill of ['airtime','data']){const h=fixture(),{L}=h;L.startBill(bill);assert(!h.document.getElementById('bill-provider'));h.set('bill-account','+233201234567');if(bill==='airtime')h.set('payment-amount',40);submit(h);assert.equal(L.route,'paymentReview');assert.equal(L.state.paymentDraft.provider,'Telecel');assert(L.state.paymentDraft.name.includes('Telecel'));assert.equal(L.mobileNetwork.normalize('+233 20 123 4567'),'0201234567');assert.equal(L.mobileNetwork.normalize('233201234567'),'0201234567');assert.equal(L.state.txs.length,0);clean(h);}
});
await check('changing or clearing a number discards the old carrier and reviewed signature',()=>{
 const h=fixture(),{L}=h;L.startBill('airtime');h.set('bill-account','0241234567');const d=L.state.paymentDraft;d.checked=true;d.reviewFingerprint='old';d.pauseAcceptedSignature='old';h.set('bill-account','0201234567');assert.equal(d.provider,'Telecel');assert.equal(d.checked,false);assert.equal(d.reviewFingerprint,undefined);assert.equal(d.pauseAcceptedSignature,undefined);h.set('bill-account','');assert.equal(d.provider,undefined);assert.equal(L.mobileNetwork.inspect(d).status,'empty');assert.equal(L.state.balance,600);clean(h);
});
await check('funding reuses the registered wallet and does not infer ownership from network detection',()=>{
 const h=fixture(),{L}=h;L.openFunding();L.startMomoFunding();assert(!h.document.getElementById('funding-network'));assert.equal(h.document.getElementById('funding-number').type,'hidden');assert(view(h).querySelector('.registered-wallet').textContent.includes(L.state.profile.phone));assert.equal(L.state.fundingDraft.network,'MTN MoMo');h.set('funding-amount',100);submit(h);assert.equal(L.state.fundingDraft.stage,'form');assert.equal(L.state.txs.length,0);assert(view(h).querySelector('#error').textContent.includes('registered to you'));
 h.set('funding-number','0201234567');h.document.getElementById('funding-owned').checked=true;submit(h);assert.equal(L.state.fundingDraft.number,L.state.profile.phone);assert.equal(L.state.fundingDraft.stage,'review');L.requestMomoFunding();assert.equal(L.state.balance,700);assert.equal(L.state.txs.length,1);L.requestMomoFunding();assert.equal(L.state.txs.length,1);clean(h);
});
await check('pending funding preserves its submitted wallet snapshot after the profile changes',()=>{
 const h=fixture({testing:true}),{L}=h;L.state.profile.phone='0201234567';L.openFunding();L.startMomoFunding();h.set('funding-amount',100);h.document.getElementById('funding-owned').checked=true;submit(h);L.requestMomoFunding();const f=L.state.fundingDraft,t=L.state.txs[0];assert.equal(t.status,'pending');assert.equal(f.network,'Telecel Cash');assert.equal(t.method,'Telecel Cash');L.state.profile.phone='0271234567';L.startMomoFunding();assert.equal(L.state.fundingDraft,f);assert.equal(f.number,'0201234567');assert.equal(f.network,'Telecel Cash');assert.equal(t.destination,'0201234567');assert.equal(L.state.balance,600);clean(h);
});
await check('a number changed between funding review and submission returns for fresh review',()=>{
 const h=fixture(),{L}=h;L.openFunding();L.startMomoFunding();h.set('funding-amount',100);h.document.getElementById('funding-owned').checked=true;submit(h);L.state.profile.phone='0271234567';L.requestMomoFunding();assert.equal(L.state.fundingDraft.stage,'form');assert.equal(L.state.fundingDraft.number,'0271234567');assert.equal(L.state.fundingDraft.owned,false);assert.equal(h.document.getElementById('funding-owned').checked,false);assert.equal(L.state.txs.length,0);assert.equal(L.state.balance,600);clean(h);
});
await check('the only Water provider is derived while genuine bank/service choices remain',()=>{
 const h=fixture(),{L}=h;L.startBill('water');assert(!h.document.getElementById('bill-provider'));assert(view(h).textContent.includes('Ghana Water'));h.set('bill-account','12345678901');h.set('payment-amount',40);submit(h);assert.equal(L.state.paymentDraft.provider,'Ghana Water');assert.equal(L.route,'paymentReview');L.startSend('bank');assert(h.document.getElementById('recipient-provider'));L.startBill('electricity');assert(h.document.getElementById('bill-provider'));L.startBill('tv');assert(h.document.getElementById('bill-provider'));clean(h);
});
await check('an unknown number stays unresolved and cannot silently use the previous network',()=>{
 const h=fixture(),{L}=h;L.startBill('airtime');h.set('bill-account','0241234567');h.set('payment-amount',40);h.set('payment-note','Top up');h.set('bill-account','0249999999');assert.equal(L.state.paymentDraft.provider,undefined);submit(h);assert.equal(L.route,'bill');assert.equal(L.state.txs.length,0);assert.equal(h.document.getElementById('payment-amount').value,'40');assert.equal(h.document.getElementById('payment-note').value,'Top up');assert(view(h).querySelector('[data-mobile-network-status]').textContent.includes('Try again'));clean(h);
});
await check('out-of-order lookup responses cannot restore a stale carrier or advance the form',async()=>{
 const h=fixture(),{L}=h;L.startBill('airtime');const pending={};L.mobileNetwork.useAdapter(number=>new Promise(resolve=>pending[number]=resolve));h.set('bill-account','0241234567');h.set('payment-amount',40);submit(h);assert.equal(L.route,'bill');h.set('bill-account','0201234567');pending['0201234567']({number:'0201234567',operator:'telecel'});await next();assert.equal(L.state.paymentDraft.provider,'Telecel');pending['0241234567']({number:'0241234567',operator:'mtn'});await next();assert.equal(L.state.paymentDraft.provider,'Telecel');assert.equal(L.route,'bill');assert.equal(L.state.txs.length,0);submit(h);assert.equal(L.route,'paymentReview');clean(h);
});
await check('Review may await a lookup once; completing it never pays or skips PIN',async()=>{
 const h=fixture(),{L}=h;L.startSend('momo');let resolve;L.mobileNetwork.useAdapter(number=>new Promise(done=>resolve=result=>done({...result,number})));h.set('recipient-number','0241234567');h.set('payment-amount',80);submit(h);submit(h);assert.equal(L.route,'send');assert.equal(L.state.txs.length,0);resolve({operator:'mtn'});await next();h.flush();assert.equal(L.route,'paymentReview');assert.equal(L.state.paymentDraft.provider,'MTN MoMo');assert.equal(L.state.balance,600);assert.equal(L.state.txs.length,0);L.continuePayment();assert.equal(L.route,'authorize');clean(h);
});
await check('failed and mismatched lookup responses require retry, preserve fields and never infer success',async()=>{
 const h=fixture(),{L}=h;L.startBill('airtime');L.mobileNetwork.useAdapter(()=>Promise.reject(Error('timeout')));h.set('bill-account','0241234567');h.set('payment-amount',40);submit(h);await next();assert.equal(L.route,'bill');assert.equal(L.state.paymentDraft.provider,undefined);assert.equal(L.state.txs.length,0);
 L.mobileNetwork.useAdapter(number=>({number:'0201234567',operator:'mtn'}));L.retryMobileNetwork();assert.equal(L.mobileNetwork.inspect(L.state.paymentDraft).status,'unavailable');assert.equal(L.state.paymentDraft.provider,undefined);
 L.mobileNetwork.useAdapter(number=>({number,operator:'mtn'}));L.retryMobileNetwork();assert.equal(L.state.paymentDraft.provider,'MTN');assert.equal(h.document.getElementById('payment-amount').value,'40');submit(h);assert.equal(L.route,'paymentReview');clean(h);
});
await check('a lookup finishing after dismissal cannot navigate or authorise a draft',async()=>{
 const h=fixture(),{L}=h;L.startSend('momo');let done;L.mobileNetwork.useAdapter(number=>new Promise(resolve=>done=()=>resolve({number,operator:'mtn'})));h.set('recipient-number','0241234567');h.set('payment-amount',80);submit(h);L.leavePayment();assert.equal(L.route,'paymentCancel');done();await next();assert.equal(L.route,'paymentCancel');assert.equal(L.state.txs.length,0);assert.equal(L.state.balance,600);clean(h);
});
await check('a changed provider after review cannot be authorised from an old quote',()=>{
 const h=fixture(),{L}=h;L.startSend('momo');h.set('recipient-number','0241234567');h.set('payment-amount',80);submit(h);L.continuePayment();assert.equal(L.route,'authorize');L.state.paymentDraft.provider='Telecel Cash';h.set('payment-pin','123456');submit(h);assert.equal(L.route,'paymentReview');assert.equal(L.state.txs.length,0);assert.equal(L.state.balance,600);clean(h);
});
console.log(passed+' automatic network and reduced-input checks passed.');
})().catch(error=>{console.error(error);process.exitCode=1;});
