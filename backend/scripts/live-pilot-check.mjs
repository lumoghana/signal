import assert from 'node:assert/strict';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {randomBytes,randomInt,randomUUID} from 'node:crypto';
import {LumoClient} from '../src/client.mjs';

// Explicit integration check: creates three labelled test accounts and posts test money.
// It sends no emails/SMS and never prints credentials. Keep verification/private out of Git.
let stdin='';for await(const chunk of process.stdin)stdin+=chunk;
const {publishableKey}=JSON.parse(stdin);
assert.ok(publishableKey?.startsWith('sb_publishable_'));
const {supabaseUrl:url}=JSON.parse(await readFile(new URL('../deployment.json',import.meta.url),'utf8'));
const suffix=randomBytes(4).toString('hex'),identities=[],checks=[];
const check=(condition,name)=>{assert.ok(condition,name);checks.push(name);};
const storage=()=>{const map=new Map();return {getItem:key=>map.get(key)||null,setItem:(key,value)=>map.set(key,value),removeItem:key=>map.delete(key)};};
async function raw(command,payload,session){
  const response=await fetch(url+'/rest/v1/rpc/lumo_rpc',{method:'POST',headers:{apikey:publishableKey,Authorization:'Bearer '+session.access_token,'Content-Type':'application/json'},body:JSON.stringify({p_command:command,p_payload:payload}),signal:AbortSignal.timeout(20000)});
  const value=await response.json();assert.ok(response.ok,'RPC transport');return value;
}
async function register(letter,name){
  const credentials={handle:'qa_'+letter+'_'+suffix,displayName:name,password:randomBytes(24).toString('base64url'),pin:String(randomInt(100000,1000000))};
  const response=await fetch(url+'/functions/v1/lumo-pilot-auth/register',{method:'POST',headers:{apikey:publishableKey,'Content-Type':'application/json'},body:JSON.stringify(credentials),signal:AbortSignal.timeout(30000)});
  const session=await response.json();assert.ok(response.ok,session.error?.code||'register failed');
  check(session.sandbox===true&&session.contactVerified===false,'registration is test-only without contact verification');
  const client=new LumoClient({url,publishableKey,pendingStorage:storage()});await client.restoreSession(session);
  const account=(await client.command('account.get',{})).account;
  check(account.balance===0&&account.userId===session.user.id,'fresh zero account is bound to Auth identity');
  identities.push({...credentials,userId:session.user.id,accountId:account.id});
  await mkdir(new URL('../verification/private/',import.meta.url),{recursive:true,mode:0o700});
  await writeFile(new URL('../verification/private/http-identities.json',import.meta.url),JSON.stringify(identities),{mode:0o600});
  return {client,session,credentials,account};
}
const a=await register('a','QA Consumer A'),b=await register('b','QA Consumer B'),m=await register('m','QA Merchant Owner');
const funded=await a.client.command('wallet.fund',{amount:10000,confirmSandbox:true});
check(funded.account.balance===10000,'explicit funding credits only A');
const transfer=await a.client.command('transfer',{recipientHandle:b.credentials.handle,amount:5000,pin:a.credentials.pin});
check(transfer.account.balance===5000,'consumer transfer debits A');
check((await b.client.command('account.get',{})).account.balance===5000,'consumer transfer credits B');
const created=await m.client.command('merchant.create',{businessName:'QA Shared Kitchen',shopName:'QA Night Market',attemptId:randomUUID()}),shopId=created.shop.id;
const request=await m.client.command('request.create',{shopId,amount:2000,note:'QA fixed payment',attemptId:randomUUID()});
const requestId=request.request.id,quote=await b.client.command('payment.quote',{shopId,requestId});
check(quote.request.amount===2000,'fixed quote contains server amount');
await assert.rejects(()=>b.client.command('payment.pay',{shopId,requestId,amount:1000,pin:b.credentials.pin}),e=>e.code==='AMOUNT_LOCKED');checks.push('fixed amount tampering rejected');
const fixed=await b.client.command('payment.pay',{shopId,requestId,amount:2000,pin:b.credentials.pin});
check(fixed.account.balance===3000,'fixed payment debits B');
const staticPay=await a.client.command('payment.pay',{shopId,amount:1000,pin:a.credentials.pin});
check(staticPay.account.balance===4000,'static QR accepts customer amount');
const merchant=(await m.client.command('merchant.get',{})).merchants.find(x=>x.id===created.merchant.id);
check(merchant.balance===3000&&merchant.activity.some(x=>x.reference===fixed.receipt.reference),'merchant sees matching receipt and credited balance');
await m.client.command('payment.refund',{paymentId:fixed.receipt.id,amount:2000,pin:m.credentials.pin});
await m.client.command('payment.refund',{paymentId:staticPay.receipt.id,amount:500,pin:m.credentials.pin});
check((await b.client.command('account.get',{})).account.balance===5000,'full refund returns money to original B');
check((await a.client.command('account.get',{})).account.balance===4500,'partial refund returns money to original A');
await assert.rejects(()=>m.client.command('payment.refund',{paymentId:fixed.receipt.id,amount:1,pin:m.credentials.pin}),e=>e.code==='REFUND_EXCEEDS_PAYMENT');checks.push('cumulative refund ceiling enforced');
const closed=await m.client.command('merchant.close',{shopId,attemptId:randomUUID()});
check(closed.balance===500,'shop close retains merchant funds');
check((await m.client.command('merchant.get',{})).merchants[0].shops[0].netCollected===0,'shop close resets trading counter');

// Separate clients/storage allow simultaneous requests to reach separate backend transactions.
const secondA=new LumoClient({url,publishableKey,pendingStorage:storage()});await secondA.restoreSession(a.session);
const competing=await Promise.allSettled([
  a.client.command('transfer',{recipientHandle:b.credentials.handle,amount:3000,pin:a.credentials.pin}),
  secondA.command('transfer',{recipientHandle:b.credentials.handle,amount:3000,pin:a.credentials.pin}),
]);
check(competing.filter(x=>x.status==='fulfilled').length===1&&competing.filter(x=>x.status==='rejected'&&x.reason.code==='INSUFFICIENT_FUNDS').length===1,'simultaneous spending accepts one and rejects the unaffordable second');
check((await a.client.command('account.get',{})).account.balance===1500,'concurrent spend leaves exact A balance');

let drop=true;
const lost=new LumoClient({url,publishableKey,pendingStorage:storage(),fetch:async(resource,options)=>{
  const response=await fetch(resource,options);
  if(drop&&String(resource).endsWith('/rpc/lumo_rpc')&&JSON.parse(options.body).p_command==='transfer'){drop=false;await response.arrayBuffer();throw new TypeError('simulated response loss after server response');}
  return response;
}});await lost.restoreSession(a.session);
await assert.rejects(()=>lost.command('transfer',{recipientHandle:b.credentials.handle,amount:100,pin:a.credentials.pin}),e=>e.code==='NETWORK_ERROR');checks.push('committed response loss retains original request');
const recovered=await lost.recoverPending();
check(recovered.receipt.amount===100&&(await lost.getPending())===null,'lookup recovers exact original receipt without another charge');
check((await a.client.command('account.get',{})).account.balance===1400,'lost response charged exactly once');

const secondRequest=await m.client.command('request.create',{shopId,amount:100,attemptId:randomUUID()});
const fixedRace=await Promise.allSettled([
  a.client.command('payment.pay',{shopId,requestId:secondRequest.request.id,amount:100,pin:a.credentials.pin}),
  b.client.command('payment.pay',{shopId,requestId:secondRequest.request.id,amount:100,pin:b.credentials.pin}),
]);
check(fixedRace.filter(x=>x.status==='fulfilled').length===1&&fixedRace.filter(x=>x.status==='rejected'&&x.reason.code==='REQUEST_UNAVAILABLE').length===1,'simultaneous fixed QR payment credits merchant once');
const altered=await raw('transfer',{recipientHandle:b.credentials.handle,amount:1,pin:a.credentials.pin,attemptId:transfer.attemptId},a.session);
check(altered.code==='IDEMPOTENCY_MISMATCH','same reference cannot change payment amount');
const privateLookup=await m.client.command('attempt.lookup',{attemptId:transfer.attemptId});
check(privateLookup.found===false,'another account cannot recover a private payment attempt');
const finalA=(await a.client.command('account.get',{})).account.balance,finalB=(await b.client.command('account.get',{})).account.balance,finalM=(await m.client.command('merchant.get',{})).merchants[0].balance;
check(finalA+finalB+finalM===10000,'test funds conserved across consumers and merchant');
const report={checkedAt:new Date().toISOString(),projectId:'iwutbrljiiodamtyoorg',checks:checks.map(name=>({name,passed:true})),finalBalances:{consumerA:finalA,consumerB:finalB,merchant:finalM},unit:'integer pesewas',realAuthHttp:true,simultaneousBackendRequests:true,phoneRuntimeTested:false,qaIdentitiesRemainForUiChecks:true};
await writeFile(new URL('../verification/live-pilot-http.json',import.meta.url),JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify({liveHttpChecks:checks.length,passed:true,conserved:finalA+finalB+finalM}));
