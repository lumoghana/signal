import test from 'node:test';
import assert from 'node:assert/strict';
import {webcrypto} from 'node:crypto';
import {parseGuestAmount,normalizeGuestPhone,parseGuestLocation,guestReceiptURL,lumoCheckoutURL,createGuestJournal,createGuestAPI,createGuestCheckout,renderGuestCheckout} from '../dist/public-checkout.js';

const token='a'.repeat(64),otherToken='b'.repeat(64),shopId='11111111-1111-4111-8111-111111111111',requestId='22222222-2222-4222-8222-222222222222';
const location=`https://lumo-connected-pilot.vercel.app/checkout.html?link=${token}`;
const quote=overrides=>({ok:true,sandbox:true,currency:'GHS',fee:0,provider:{mode:'sandbox',name:'Lumo MoMo test provider',live:false},networks:['mtn','telecel','airteltigo'],link:{id:requestId,publicToken:token,shopId,shopName:'Night Market counter',merchantName:'Akua’s Kitchen',description:'Order 24',amount:2500,expiresAt:'2027-12-31T22:00:00Z',status:'open',kind:'request',requestId,...overrides}});
const storage=()=>{const values=new Map();return {values,getItem:key=>values.get(key)||null,setItem:(key,value)=>values.set(key,String(value)),removeItem:key=>values.delete(key)}};
const deferred=()=>{let resolve,reject;const promise=new Promise((yes,no)=>{resolve=yes;reject=no});return {promise,resolve,reject}};
function fixture({current=quote(),stored=storage(),apiOverride,online=()=>true,url=location,onChange=()=>{}}={}){
 const calls=[],records=new Map();let q=current;
 const respond=record=>({ok:true,sandbox:true,provider:{mode:'sandbox',live:false},currency:'GHS',fee:0,attempt:structuredClone(record)});
 async function api(operation,payload){
  calls.push({operation,payload:structuredClone(payload)});
  if(apiOverride){const overridden=await apiOverride(operation,payload,{records,respond,getQuote:()=>q});if(overridden!==undefined)return overridden;}
  if(operation==='quote')return structuredClone(q);
  if(operation==='initiate'){
   const record={id:payload.attemptId,status:'pending',reference:'LM-GUEST-1',providerReference:null,amount:q.link.amount??payload.amount,currency:'GHS',fee:0,phoneMasked:'024•••4567',network:payload.network,shopId:q.link.shopId,merchantId:'33333333-3333-4333-8333-333333333333',createdAt:new Date().toISOString(),expiresAt:null,receipt:null};records.set(record.id,record);return respond(record);
  }
  const record=records.get(payload.attemptId);if(!record)throw Object.assign(Error('Payment reference is not available yet. Check again.'),{code:'ATTEMPT_NOT_FOUND'});
  if(operation==='sandboxResult'){
   record.status={approve:'confirmed',decline:'declined',delay:'pending',cancel:'cancelled'}[payload.outcome];
   if(record.status==='confirmed')record.receipt={reference:record.reference,amount:record.amount,currency:'GHS',merchantName:q.link.merchantName,shopName:q.link.shopName,shopId:q.link.shopId,confirmedAt:new Date().toISOString(),providerReference:'MOMO-TEST-1',refunds:[]};
  }
  return respond(record);
 }
 const checkout=createGuestCheckout({api,location:url,journal:createGuestJournal(stored),crypto:webcrypto,online,onChange});
 return {checkout,calls,records,stored,setQuote:value=>{q=value},respond,api};
}
async function review(f){await f.checkout.start();f.checkout.chooseMoMo();await f.checkout.reviewPayment({phone:'0241234567',network:'mtn'});assert.equal(f.checkout.view().phase,'review');}
async function initiate(f){await review(f);await f.checkout.initiate();assert.equal(f.checkout.view().phase,'pending');return f.checkout.view().reference;}

test('guest amounts use integer pesewas and Ghana phone input comes only from the guest',()=>{
 assert.equal(parseGuestAmount('25.01'),2501);assert.equal(parseGuestAmount('000.10'),10);assert.equal(parseGuestAmount('9'),900);
 for(const invalid of ['','0','-1','1.001','1e3','0.001','Infinity','100000000'])assert.equal(parseGuestAmount(invalid),null);
 assert.equal(normalizeGuestPhone('+233 24 123 4567'),'0241234567');assert.equal(normalizeGuestPhone('233551234567'),'0551234567');assert.equal(normalizeGuestPhone('024 123 4567'),'0241234567');
 for(const invalid of ['','123','02412345678','001241234567','0241234567<script>','02012ABC67'])assert.equal(normalizeGuestPhone(invalid),'');
});

test('public links carry only an opaque link; URL amount tampering never sets a fixed payable amount',async()=>{
 const f=fixture({url:location+'&amount=1&phone=0551111111'});await f.checkout.start();const view=f.checkout.view();assert.equal(view.quote.link.amount,2500);assert.equal(view.phone,'');assert.equal(view.amount,'');
 const html=renderGuestCheckout(view);assert.match(html,/GH₵25\.00/);assert.doesNotMatch(html,/name="amount"|0551111111/);assert.match(html,/Fixed by the merchant/);
 for(const invalid of ['https://example.com/checkout.html','https://example.com/?link=bad','https://example.com/?link='+token+'#receipt=broken'])assert.throws(()=>parseGuestLocation(invalid));
});

test('a reusable shop link takes a new amount before review, with no consumer phone prefill',async()=>{
 const f=fixture({current:quote({amount:null,kind:'shop',requestId:null,expiresAt:null})});await f.checkout.start();assert.equal(f.checkout.view().phone,'');f.checkout.chooseMoMo();assert.equal(f.checkout.view().phase,'overview');assert.match(f.checkout.view().error,/Enter an amount/);
 f.checkout.setField('amount','13.29');f.checkout.chooseMoMo();await f.checkout.reviewPayment({phone:'055 123 4567',network:'telecel'});assert.equal(f.checkout.view().review.amount,1329);assert.equal(f.checkout.view().review.total,1329);await f.checkout.initiate();assert.equal(f.calls.find(call=>call.operation==='initiate').payload.amount,1329);
});

test('invalid guest numbers and missing networks never reach provider initiation',async()=>{
 const f=fixture();await f.checkout.start();f.checkout.chooseMoMo();await f.checkout.reviewPayment({phone:'123',network:'mtn'});assert.equal(f.checkout.view().phase,'momo');assert.match(f.checkout.view().error,/own valid Ghana/);
 await f.checkout.reviewPayment({phone:'0241234567',network:''});assert.match(f.checkout.view().error,/Choose the network/);assert.equal(f.calls.filter(call=>call.operation==='initiate').length,0);
});

test('review rechecks authoritative eligibility and initiation rejects changed merchant details or charges',async()=>{
 const f=fixture();await review(f);f.setQuote({...quote(),fee:100});await f.checkout.initiate();assert.equal(f.checkout.view().phase,'momo');assert.match(f.checkout.view().error,/charges changed/);assert.equal(f.calls.filter(call=>call.operation==='initiate').length,0);assert.equal(f.checkout.view().reference,null);
 const closed=fixture();await closed.checkout.start();closed.checkout.chooseMoMo();closed.setQuote(quote({status:'cancelled'}));await closed.checkout.reviewPayment({phone:'0241234567',network:'mtn'});assert.equal(closed.checkout.view().phase,'unavailable');
});

test('only an exact server-confirmed receipt can complete a guest checkout',async()=>{
 const f=fixture(),ref=await initiate(f);assert.equal(f.checkout.view().attempt.status,'pending');assert.doesNotMatch(renderGuestCheckout(f.checkout.view()),/<h1[^>]*>Payment received/);
 await f.checkout.check();assert.equal(f.checkout.view().phase,'pending');await f.checkout.simulate('approve');assert.equal(f.checkout.view().phase,'receipt');assert.match(renderGuestCheckout(f.checkout.view()),/Test payment|No money will be taken/);assert.match(f.checkout.receiptText(),/SANDBOX/);assert.match(f.checkout.receiptText(),/MOMO-TEST-1/);assert.equal(f.checkout.view().attempt.id,ref.attemptId);
});

test('references persist before initiation, but raw guest phone and account credentials never enter the journal',async()=>{
 const f=fixture();await initiate(f);const content=[...f.stored.values.values()].join('');assert.match(content,/recoveryToken/);assert.doesNotMatch(content,/0241234567|mtn|password|access_token|refresh_token|wallet/i);assert.equal(f.checkout.view().phone,'');
 const first=f.checkout.view().reference;assert.ok(first.recoveryToken.length===64&&first.attemptId);assert.ok(f.calls.find(call=>call.operation==='initiate').payload.phone==='0241234567');
});

test('a browser without safe reference storage cannot initiate a charge',async()=>{
 const stored={getItem(){return null},setItem(){throw Error('No storage')},removeItem(){}};const f=fixture({stored});await review(f);await f.checkout.initiate();assert.match(f.checkout.view().error,/No charge was started/);assert.equal(f.checkout.view().reference,null);assert.equal(f.calls.filter(call=>call.operation==='initiate').length,0);
});

test('repeated taps during an unresolved initiation send only one provider request',async()=>{
 const pending=deferred();let ready;const begun=new Promise(resolve=>{ready=resolve});const f=fixture({apiOverride(operation){if(operation==='initiate'){ready();return pending.promise}}});await review(f);const sending=f.checkout.initiate();await begun;await f.checkout.initiate();assert.equal(f.calls.filter(call=>call.operation==='initiate').length,1);
 const ref=f.checkout.view().reference;pending.resolve({ok:true,sandbox:true,provider:{mode:'sandbox',live:false},attempt:{id:ref.attemptId,status:'pending',reference:'LM-1',amount:2500,currency:'GHS',fee:0,shopId,receipt:null}});await sending;assert.equal(f.checkout.view().phase,'pending');
});

test('an interrupted response keeps the original reference and blocks another charge',async()=>{
 const f=fixture({apiOverride(operation){if(operation==='initiate')throw Object.assign(Error('Response interrupted. Keep your reference.'),{unknown:true})}});await review(f);await f.checkout.initiate();const first=f.checkout.view().reference;assert.ok(first);assert.equal(f.checkout.view().phase,'pending');await f.checkout.restart();assert.equal(f.checkout.view().reference.attemptId,first.attemptId);f.checkout.chooseMoMo();assert.equal(f.checkout.view().phase,'pending');assert.equal(f.calls.filter(call=>call.operation==='initiate').length,1);
});

test('reopening a payment recovers its own receipt without signup or a phone number',async()=>{
 const f=fixture(),ref=await initiate(f);await f.checkout.simulate('approve');const recovered=createGuestCheckout({api:f.api,location,journal:createGuestJournal(f.stored),crypto:webcrypto});await recovered.start();assert.equal(recovered.view().phase,'receipt');assert.equal(recovered.view().reference.attemptId,ref.attemptId);assert.equal(recovered.view().phone,'');assert.equal(f.calls.filter(call=>call.operation==='initiate').length,1);
});

test('private recovery URLs use a fragment and do not contain guest contact or merchant credentials',async()=>{
 const f=fixture(),ref=await initiate(f),url=guestReceiptURL(location,ref),parsed=parseGuestLocation(url);assert.equal(parsed.recovery.attemptId,ref.attemptId);assert.equal(parsed.recovery.recoveryToken,ref.recoveryToken);assert.equal(new URL(url).search,'?link='+token);assert.doesNotMatch(url,/phone|pin|password|session|testKey/i);
 const withFragment=createGuestCheckout({api:f.api,location:url,journal:createGuestJournal(storage()),crypto:webcrypto});await withFragment.start();assert.equal(withFragment.view().attempt.id,ref.attemptId);
});

test('a receipt remains recoverable when merchant link details cannot be refreshed',async()=>{
 const f=fixture();await initiate(f);await f.checkout.simulate('approve');const recoverAPI=(operation,payload)=>operation==='quote'?Promise.reject(Error('Shop unavailable')):f.api(operation,payload);
 const recovered=createGuestCheckout({api:recoverAPI,location,journal:createGuestJournal(f.stored),crypto:webcrypto});await recovered.start();assert.equal(recovered.view().phase,'receipt');assert.match(renderGuestCheckout(recovered.view()),/Test payment/);assert.match(recovered.view().notice,/could not be refreshed/);
});

test('wrong receipt amount, currency, attempt or destination never displays a success state',async()=>{
 for(const tamper of [a=>{a.amount=1},a=>{a.currency='USD'},a=>{a.id='44444444-4444-4444-8444-444444444444'},a=>{a.shopId='55555555-5555-4555-8555-555555555555'},a=>{a.receipt.amount=1},a=>{a.receipt.shopId='55555555-5555-4555-8555-555555555555'}]){
  let malformed=false;const f=fixture({apiOverride(operation,payload,{records,respond}){if(operation==='status'&&malformed){const a=structuredClone(records.get(payload.attemptId));a.status='confirmed';a.receipt={reference:'LM-1',amount:2500,currency:'GHS',shopId,merchantName:'Akua’s Kitchen',shopName:'Night Market counter',confirmedAt:new Date().toISOString(),providerReference:'MOMO1'};tamper(a);return respond(a)}}});await initiate(f);malformed=true;await f.checkout.check();assert.equal(f.checkout.view().phase,'pending');assert.match(f.checkout.view().error,/did not match|another receiving shop|matching confirmed receipt/);
 }
});

test('only explicit sandbox provider outcomes change a waiting payment',async()=>{
 for(const [outcome,status,phase] of [['delay','pending','pending'],['decline','declined','result'],['cancel','cancelled','result']]){const f=fixture();await initiate(f);await f.checkout.simulate(outcome);assert.equal(f.checkout.view().attempt.status,status);assert.equal(f.checkout.view().phase,phase);assert.equal(f.checkout.view().attempt.receipt,null);}
 const live=fixture({current:{...quote(),sandbox:false,provider:{mode:'live',live:true}}});await initiate(live);await live.checkout.simulate('approve');assert.equal(live.calls.some(call=>call.operation==='sandboxResult'),false);
});

test('late provider reversals show the original provider and reversal references without a merchant success receipt',async()=>{
 const f=fixture({apiOverride(operation,payload,{records,respond}){if(operation==='sandboxResult'){const a=records.get(payload.attemptId);Object.assign(a,{status:'reversed',providerReference:'PROVIDER-ORIGINAL',reversalReference:'RETURN-ORIGINAL',reversal:{amount:2500,status:'completed'},receipt:null});return respond(a)}}});await initiate(f);await f.checkout.simulate('approve');assert.equal(f.checkout.view().phase,'result');const html=renderGuestCheckout(f.checkout.view());assert.match(html,/Payment reversed|merchant was not credited/);assert.match(html,/PROVIDER-ORIGINAL/);assert.match(html,/RETURN-ORIGINAL/);assert.doesNotMatch(html,/Payment received\./);
});

test('paid, expired, cancelled and paused links cannot start a new guest payment',async()=>{
 for(const status of ['paid','expired','cancelled','paused']){const f=fixture({current:quote({status})});await f.checkout.start();assert.equal(f.checkout.view().phase,'unavailable');f.checkout.chooseMoMo();await f.checkout.initiate();assert.equal(f.calls.filter(call=>call.operation==='initiate').length,0);assert.match(renderGuestCheckout(f.checkout.view()),/cannot be paid again|fresh payment link|paused payments|cancelled|expired/);}
});

test('a terminal reusable payment may start afresh, while fixed paid requests cannot be reused',async()=>{
 const f=fixture({current:quote({kind:'shop',amount:null,requestId:null,expiresAt:null})});await f.checkout.start();f.checkout.setField('amount','10');f.checkout.chooseMoMo();await f.checkout.reviewPayment({phone:'0241234567',network:'mtn'});await f.checkout.initiate();await f.checkout.simulate('approve');const old=f.checkout.view().reference;await f.checkout.restart();assert.equal(f.checkout.view().phase,'overview');assert.equal(f.checkout.view().reference,null);assert.equal(f.checkout.view().amount,'');assert.equal(createGuestJournal(f.stored).read(token),null);
 const fixed=fixture();await initiate(fixed);await fixed.checkout.simulate('approve');await fixed.checkout.restart();assert.equal(fixed.checkout.view().phase,'receipt');assert.ok(fixed.checkout.view().reference);assert.notEqual(old.attemptId,fixed.checkout.view().reference.attemptId);
});

test('refunds stay on the original guest receipt and never invite a wallet refund',async()=>{
 const f=fixture();await initiate(f);await f.checkout.simulate('approve');const record=[...f.records.values()][0];record.receipt.refunds=[{amount:500,status:'confirmed',reference:'RETURN-MOMO-1'}];await f.checkout.check();const html=renderGuestCheckout(f.checkout.view());assert.match(html,/Refund · Returned/);assert.match(html,/GH₵5\.00/);assert.match(html,/original mobile money transaction/);assert.match(f.checkout.receiptText(),/RETURN-MOMO-1/);
});

test('Lumo account handoff carries shop and fresh request identities without guest details or old approvals',()=>{
 const url=new URL(lumoCheckoutURL(quote()));assert.equal(url.origin,'https://lumo-connected-pilot.vercel.app');assert.equal(url.searchParams.get('pay'),shopId);assert.equal(url.searchParams.get('request'),requestId);assert.deepEqual([...url.searchParams.keys()],['pay','request']);assert.equal(lumoCheckoutURL(quote({shopId:'javascript:alert(1)'})),'');
});

test('public checkout transport omits sessions and credentials and labels uncertain responses conservatively',async()=>{
 const calls=[],api=createGuestAPI({fetch:async(url,options)=>{calls.push({url,options});return new Response(JSON.stringify(quote()),{headers:{'Content-Type':'application/json'}})}});await api('quote',{link:token});assert.equal(calls[0].options.credentials,'omit');assert.equal(calls[0].options.headers.Authorization,undefined);assert.equal(JSON.parse(calls[0].options.body).action,'guestCheckout');assert.doesNotMatch(calls[0].options.body,/phone|password|access_token/);
 const unavailable=createGuestAPI({fetch:async()=>{throw Error('Network')}});await assert.rejects(unavailable('initiate',{}),error=>error.unknown===true&&error.code==='CONNECTION_UNCERTAIN');
});

test('rendered merchant and receipt content is escaped and never includes a mobile money PIN field',async()=>{
 const f=fixture({current:quote({merchantName:'<script>alert(1)</script>',description:'<img src=x onerror=alert(1)>'})});await f.checkout.start();let html=renderGuestCheckout(f.checkout.view());assert.match(html,/&lt;script&gt;/);assert.doesNotMatch(html,/<script>|<img src=x|name="pin"|type="password"/);f.checkout.chooseMoMo();html=renderGuestCheckout(f.checkout.view());assert.match(html,/Never.*PIN|never ask.*PIN/);assert.doesNotMatch(html,/name="pin"|type="password"/);
});

test('a superseded checkout cannot install a late response after disposal',async()=>{
 const pending=deferred();let notifications=0;const checkout=createGuestCheckout({api:()=>pending.promise,location,journal:createGuestJournal(storage()),crypto:webcrypto,onChange:()=>notifications++});const opening=checkout.start();checkout.dispose();const before=notifications;pending.resolve(quote());await opening;assert.equal(notifications,before);
});


test('resuming an interrupted original request reuses its attempt ID and private recovery capability',async()=>{
 let interrupted=true;
 const f=fixture({apiOverride(operation){if(operation==='initiate'&&interrupted){interrupted=false;throw Object.assign(Error('No reply arrived.'),{unknown:true})}}});
 await review(f);await f.checkout.initiate();const original=f.checkout.view().reference;
 f.checkout.resumeOriginal();assert.equal(f.checkout.view().phase,'momo');await f.checkout.reviewPayment({phone:'0241234567',network:'mtn'});await f.checkout.initiate();
 const sent=f.calls.filter(call=>call.operation==='initiate');assert.equal(sent.length,2);assert.equal(sent[0].payload.attemptId,original.attemptId);assert.equal(sent[1].payload.attemptId,original.attemptId);assert.equal(sent[0].payload.recoveryToken,sent[1].payload.recoveryToken);assert.equal(f.checkout.view().phase,'pending');
});

test('only a definitive no-mutation initiation rejection releases the new local reference',async()=>{
 const f=fixture({apiOverride(operation){if(operation==='initiate')throw Object.assign(Error('Another payment is still waiting for this request.'),{code:'REQUEST_PROCESSING',noMutation:true})}});
 await review(f);await f.checkout.initiate();assert.equal(f.checkout.view().reference,null);assert.equal(f.checkout.view().phase,'overview');assert.match(f.checkout.view().error,/still waiting/);assert.equal(createGuestJournal(f.stored).read(token),null);
});

test('corrupt stored references cannot silently become permission to start another payment',async()=>{
 const saved=storage();saved.setItem('lumo-guest-checkout-references-v1','{broken');const f=fixture({stored:saved});await f.checkout.start();assert.equal(f.checkout.view().phase,'unavailable');assert.match(f.checkout.view().error,/saved payment references/);assert.equal(f.calls.filter(call=>call.operation==='initiate').length,0);
});


test('background guest status checks do not replay loading or unchanged pending UI',async()=>{
 const changes=[];const f=fixture({onChange:view=>changes.push(view)});await initiate(f);const before=changes.length;
 for(let i=0;i<4;i++)await f.checkout.check({background:true});assert.equal(changes.length,before);
 const record=[...f.records.values()][0];record.status='processing';await f.checkout.check({background:true});assert.equal(changes.length,before+1);assert.equal(changes.at(-1).busy,false);
 record.status='confirmed';record.receipt={reference:record.reference,amount:record.amount,currency:'GHS',shopId,merchantName:'Shop',shopName:'Counter',confirmedAt:new Date().toISOString(),providerReference:'TEST-ONLY'};await f.checkout.check({background:true});assert.equal(changes.at(-1).phase,'receipt');assert.equal(changes.at(-1).busy,false);
});

test('only one background check runs and a failure remains visible without restarting payment',async()=>{
 const wait=deferred();let hold=false;const changes=[];const f=fixture({onChange:view=>changes.push(view),apiOverride(operation){if(operation==='status'&&hold)return wait.promise}});await initiate(f);hold=true;const ref=f.checkout.view().reference.attemptId,before=changes.length;
 const checking=f.checkout.check({background:true});await f.checkout.check({background:true});assert.equal(changes.length,before);wait.reject(Error('Connection interrupted'));await checking;assert.equal(changes.at(-1).error,'Connection interrupted');assert.equal(f.checkout.view().reference.attemptId,ref);assert.equal(f.calls.filter(call=>call.operation==='initiate').length,1);
});


test('an explicit guest action waits for a quiet status check instead of being silently discarded',async()=>{
 const wait=deferred();let hold=false;const f=fixture({apiOverride(operation){if(operation==='status'&&hold)return wait.promise}});const ref=await initiate(f);hold=true;
 const polling=f.checkout.check({background:true}),approving=f.checkout.simulate('approve');assert.equal(f.calls.filter(call=>call.operation==='sandboxResult').length,0);
 hold=false;wait.resolve(f.respond(f.records.get(ref.attemptId)));await polling;await approving;assert.equal(f.calls.filter(call=>call.operation==='sandboxResult').length,1);assert.equal(f.checkout.view().phase,'receipt');
});
