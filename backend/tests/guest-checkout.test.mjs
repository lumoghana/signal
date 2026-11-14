import test from 'node:test';
import assert from 'node:assert/strict';
import {createGuestCheckout,guestHash,validateGuestProviderResult} from '../supabase/functions/lumo-approved/guest-checkout.mjs';
import {createApprovedHandler} from '../supabase/functions/lumo-approved/handler.mjs';
const token='a'.repeat(64),secret='b'.repeat(64),id='guest-attempt-123';
const quote={ok:true,sandbox:true,currency:'GHS',fee:0,provider:{mode:'sandbox',name:'Lumo MoMo test provider',live:false},link:{amount:1200,status:'open'}};
const request=()=>new Request('https://gateway.test',{headers:{'x-forwarded-for':'203.0.113.1'}});
function fixture(result=quote){const calls=[];const checkout=createGuestCheckout({serviceRpc:async(name,args)=>{calls.push({name,args});return typeof result==='function'?result(args):structuredClone(result);}});return {calls,checkout};}
const valid=()=>({action:'guestCheckout',operation:'initiate',link:token,amount:1200,phone:'+233 24 123 4567',network:'mtn',attemptId:id,recoveryToken:secret});

test('public quote uses only a public link and service rate hash',async()=>{
 const f=fixture();assert.deepEqual(await f.checkout({action:'guestCheckout',operation:'quote',link:token},request()),quote);
 const {name,args}=f.calls[0];assert.equal(name,'lumo_guest_checkout');assert.equal(args.p_operation,'quote');assert.equal(args.p_payload.link,token);assert.match(args.p_payload.rateKey,/^[a-f0-9]{64}$/);assert.ok(!JSON.stringify(args).includes('203.0.113.1'));assert.equal(args.p_payload.phone,undefined);
});
test('guest entry normalizes its own phone and uses the server lookup rather than a caller network',async()=>{
 const f=fixture();await f.checkout(valid(),request());const payload=f.calls[0].args.p_payload;
 assert.equal(payload.phone,'0241234567');assert.equal(payload.network,'telecel','The synthetic directory intentionally maps this MTN-looking prefix to Telecel.');assert.equal(payload.amount,1200);assert.equal(payload.attemptId,id);
 assert.equal(payload.recoveryHash,await guestHash('lumo-guest-recovery-v1:'+secret));assert.ok(!JSON.stringify(payload).includes(secret));
});
test('legacy, missing, and unsupported caller networks cannot choose the guest provider route',async()=>{
 for(const network of ['mtn','airteltigo','unknown',undefined]){
  const f=fixture();await f.checkout({...valid(),network},request());
  assert.equal(f.calls[0].args.p_payload.network,'telecel');assert.equal(f.calls[0].args.p_payload.phone,'0241234567');
 }
});
test('guest number lookup first validates the public link and returns masked, explicitly synthetic details',async()=>{
 const f=fixture(),out=await f.checkout({action:'guestCheckout',operation:'lookup',link:token,phone:'+233 (24) 123-4567'},request());
 assert.equal(f.calls.length,1);assert.equal(f.calls[0].name,'lumo_guest_checkout');assert.equal(f.calls[0].args.p_operation,'lookup');
 assert.deepEqual(Object.keys(f.calls[0].args.p_payload).sort(),['link','rateKey']);
 assert.equal(out.payer.network,'telecel');assert.equal(out.payer.networkLabel,'Telecel Cash');assert.equal(out.payer.phoneMasked,'••••••4567');assert.equal(out.payer.registeredName,'Test customer 4567');
 assert.equal(out.payer.lookupSource,'sandbox-directory');assert.equal(out.payer.providerMode,'sandbox');assert.equal(out.payer.networkVerified,false);assert.equal(out.payer.nameVerified,false);assert.equal(out.payer.phone,undefined);
 const denied=fixture({ok:false,code:'LINK_UNAVAILABLE',noMutation:true});await assert.rejects(denied.checkout({action:'guestCheckout',operation:'lookup',link:token,phone:'not a phone'},request()),{code:'LINK_UNAVAILABLE'});
});
test('public QR destination resolution forwards only validated shop and request identities',async()=>{
 const shopId='10000000-0000-4000-8000-000000000001',requestId='20000000-0000-4000-8000-000000000001',f=fixture();
 await f.checkout({action:'guestCheckout',operation:'resolve',shopId,requestId},request());const args=f.calls[0].args;
 assert.equal(args.p_operation,'resolve');assert.equal(args.p_payload.shopId,shopId);assert.equal(args.p_payload.requestId,requestId);assert.match(args.p_payload.rateKey,/^[a-f0-9]{64}$/);assert.equal(args.p_payload.phone,undefined);
 for(const patch of [{shopId:'not-a-shop-uuid'},{requestId:'not-a-request-uuid'},{profile:{phone:'0551234567'}},{phone:'0241234567'}])await assert.rejects(f.checkout({action:'guestCheckout',operation:'resolve',shopId,requestId,...patch},request()),{code:'INVALID_INPUT'});
 assert.equal(f.calls.length,1);
});
for(const [title,patch] of [
 ['missing own phone',{phone:undefined}],['invalid phone',{phone:'0312345678'}],['fractional pesewas',{amount:1200.1}],['zero amount',{amount:0}],['above pilot limit',{amount:1000001}],['string amount',{amount:'1200'}],['weak receipt secret',{recoveryToken:'123456'}],['weak attempt reference',{attemptId:'x'}],['invalid link',{link:'x'}],['unexpected payer profile',{profile:{phone:'0555555555'}}],['unexpected consumer wallet',{walletId:'wallet-other'}],['untrusted provider result',{providerResult:{status:'approved'}}]
])test('rejects '+title+' before creating any attempt',async()=>{const f=fixture();await assert.rejects(f.checkout({...valid(),...patch},request()),error=>error.code==='INVALID_INPUT'&&error.noMutation===true);assert.equal(f.calls.length,0);});
test('status needs its private recovery proof and never accepts a number in a URL',async()=>{
 const f=fixture();await f.checkout({action:'guestCheckout',operation:'status',attemptId:id,recoveryToken:secret},request());assert.equal(f.calls[0].args.p_operation,'status');assert.equal(f.calls[0].args.p_payload.phone,undefined);assert.match(f.calls[0].args.p_payload.recoveryHash,/^[a-f0-9]{64}$/);
 await assert.rejects(f.checkout({action:'guestCheckout',operation:'status',attemptId:id},request()),{code:'INVALID_INPUT'});
});
for(const outcome of ['approve','decline','delay','cancel'])test('sandbox '+outcome+' forwards only its stored-attempt capability',async()=>{const f=fixture();await f.checkout({action:'guestCheckout',operation:'sandboxResult',attemptId:id,recoveryToken:secret,outcome},request());const payload=f.calls[0].args.p_payload;assert.equal(payload.outcome,outcome);assert.equal(payload.amount,undefined);assert.equal(payload.currency,undefined);assert.equal(payload.merchantId,undefined);});
test('a caller cannot choose the provider amount, destination or claim a live callback',async()=>{
 const f=fixture();for(const extra of [{amount:1},{currency:'USD'},{shopId:'other'},{operation:'providerCallback'}])await assert.rejects(f.checkout({action:'guestCheckout',operation:'sandboxResult',attemptId:id,recoveryToken:secret,outcome:'approve',...extra},request()),{code:'INVALID_INPUT'});assert.equal(f.calls.length,0);
});
for(const code of ['AMOUNT_CHANGED','REQUEST_PROCESSING','IDEMPOTENCY_CONFLICT','RECOVERY_REQUIRED','PAYMENT_FINAL','RATE_LIMITED'])test('preserves authority failure '+code+' without returning a receipt',async()=>{const f=fixture({ok:false,code,noMutation:true});await assert.rejects(f.checkout(valid(),request()),error=>error.code===code&&error.noMutation===true&&(code!=='RATE_LIMITED'||error.status===429));});
test('an unknown network outcome is never represented as a successful payment',async()=>{const f=fixture(()=>{throw Object.assign(new Error('Connection interrupted'),{code:'SERVICE_UNAVAILABLE'});});await assert.rejects(f.checkout(valid(),request()),{code:'SERVICE_UNAVAILABLE'});});
test('provider adapter requires matching reference, amount, currency, merchant and shop',()=>{
 const attempt={providerReference:'GM-one',amount:1200,currency:'GHS',merchantId:'merchant-one',shopId:'shop-one',providerMode:'sandbox'};
 const result={...attempt,reference:'GM-one',status:'approved'};delete result.providerReference;
 assert.equal(validateGuestProviderResult(result,attempt),true);
 for(const patch of [{reference:'GM-other'},{amount:1201},{currency:'USD'},{merchantId:'merchant-other'},{shopId:'shop-other'},{providerMode:'live'},{status:'settled'}])assert.equal(validateGuestProviderResult({...result,...patch},attempt),false);
});
test('guest checkout ignores any signed-in browser bearer identity and never loads a wallet',async()=>{
 const calls=[];const handler=createApprovedHandler({supabaseUrl:'https://supabase.test',serviceRoleKey:'service-test',allowedOrigins:['https://checkout.test'],fetch:async(url,options)=>{calls.push({url,body:JSON.parse(options.body)});assert.equal(new URL(url).pathname,'/rest/v1/rpc/lumo_guest_checkout');return new Response(JSON.stringify(quote),{headers:{'Content-Type':'application/json'}});}});
 const response=await handler(new Request('https://gateway.test',{method:'POST',headers:{'Content-Type':'application/json',Origin:'https://checkout.test',Authorization:'Bearer consumer-token'},body:JSON.stringify({action:'guestCheckout',operation:'quote',link:token})}));assert.equal(response.status,200);assert.equal((await response.json()).provider.live,false);assert.equal(calls.length,1);
});

 test('legacy caller network cannot override the server lookup, and number-only clients work',async()=>{
  for(const network of [undefined,'mtn','unknown']){const f=fixture();await f.checkout({...valid(),network},request());assert.equal(f.calls[0].args.p_payload.network,'telecel');}
 });
 test('lookup validates destination first and never returns payer details for an unavailable link',async()=>{
  const f=fixture({ok:false,code:'LINK_UNAVAILABLE'});await assert.rejects(f.checkout({action:'guestCheckout',operation:'lookup',link:token,phone:'0241234567'},request()),{code:'LINK_UNAVAILABLE'});
 });
