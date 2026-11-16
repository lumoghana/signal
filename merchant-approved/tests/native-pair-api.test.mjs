import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,readdirSync} from 'node:fs';
import {createD1} from '../scripts/d1-adapter.mjs';
import {handleAPI} from '../server/api.js';

const origin='https://merchant.example.test';
function harness(){
 const DB=createD1();
 for(const name of readdirSync(new URL('../drizzle/',import.meta.url)).filter(name=>name.endsWith('.sql')).sort())DB.exec(readFileSync(new URL('../drizzle/'+name,import.meta.url),'utf8'));
 const calls=[];
 function client({native=false}={}){
  const cookies=new Map();
  const call=async(path,{method='GET',body,proof=true}={})=>{
   const headers=new Headers({Accept:'application/json','cf-connecting-ip':native?'native-pair-device':'merchant-pair-browser'});
   if(native)headers.set('User-Agent','Lumo-Test-Android/2.4.3');else headers.set('Origin',origin);
   if(proof)headers.set('X-Lumo-Request','1');
   if(body!==undefined)headers.set('Content-Type','application/json');
   if(cookies.size)headers.set('Cookie',[...cookies].map(([name,value])=>name+'='+value).join('; '));
   const request=new Request(origin+path,{method,headers,...(body===undefined?{}:{body:JSON.stringify(body)})});
   calls.push({native,path,method,hasOrigin:request.headers.has('Origin'),proof:request.headers.get('X-Lumo-Request')});
   const response=await handleAPI(request,{DB});
   for(const cookie of response.headers.getSetCookie()){const pair=cookie.split(';')[0],separator=pair.indexOf('=');cookies.set(pair.slice(0,separator),pair.slice(separator+1))}
   const result=await response.json();
   if(!response.ok)throw Object.assign(new Error(typeof result.error==='string'?result.error:result.error?.message||result.message||'Request failed'),{status:response.status,code:result.code||result.error?.code});
   return result;
  };
  return {call,cookies};
 }
 return {client,calls,close:()=>DB.close()};
}
async function merchant(client,suffix){
 const registered=await client.call('/api/signup',{method:'POST',body:{
  attemptId:'native-pair-signup-'+suffix,name:'Native Pair Kitchen',ownerName:'Akua Test',phone:'0245550100',businessType:'sole-trader',destination:'Sandbox Bank · 123456',
  verification:{phone:true,identity:true,face:true},shop:{name:'Night Market Test Counter',area:'Night Market',category:'Food & drinks',lat:5.6509,lng:-.1878},
  credentials:{username:'native.pair.'+suffix,password:'NativePairTest1234'}
 }});
 return registered.state.shops[0];
}
const post=(client,path,body)=>client.call(path,{method:'POST',body});
const quotePath=(shop,requestId)=>'/api/payments/quote?'+new URLSearchParams({shopId:shop.id,testKey:shop.testAcceptanceToken,...(requestId?{requestId}:{})});

test('native HTTP uses its own student cookie and explicit test funding without an Origin header',async()=>{
 const h=harness();
 try{
  const owner=h.client(),native=h.client({native:true});
  await merchant(owner,'wallet');
  assert.equal((await native.call('/api/student')).student,null);
  await assert.rejects(()=>native.call('/api/student/open',{method:'POST',body:{name:'Native Pair Student'},proof:false}),error=>error.status===403&&error.code==='REQUEST_PROOF_REQUIRED');
  const opened=await post(native,'/api/student/open',{name:'Native Pair Student'}),walletId=opened.student.id;
  assert.equal(opened.student.balance,0);assert.equal(native.cookies.has('lumo_student'),true);assert.equal(native.cookies.has('lumo_session'),false);
  assert.equal((await native.call('/api/student')).student.id,walletId,'A later native request must resume the same HTTP cookie wallet');
  await assert.rejects(()=>post(native,'/api/student/fund',{walletId,amount:5000,attemptId:'native-unconfirmed-funding'}),/test funds/);
  assert.equal((await native.call('/api/student')).student.balance,0);
  await assert.rejects(()=>post(native,'/api/student/fund',{walletId:'another-wallet',amount:5000,confirmSandbox:true,attemptId:'native-wrong-wallet-funding'}),error=>error.code==='WALLET_CHANGED');
  await post(native,'/api/student/fund',{walletId,amount:5000,confirmSandbox:true,attemptId:'native-explicit-funding'});
  assert.equal((await native.call('/api/student')).student.balance,5000);
  assert.equal((await owner.call('/api/session')).metrics.balance,0,'Test funding must not credit the merchant');
  for(let i=0;i<9;i++)await post(native,'/api/student/fund',{walletId,amount:100000,confirmSandbox:true,attemptId:'native-limit-funding-'+i});
  await post(native,'/api/student/fund',{walletId,amount:95000,confirmSandbox:true,attemptId:'native-limit-remainder'});
  await assert.rejects(()=>post(native,'/api/student/fund',{walletId,amount:1,confirmSandbox:true,attemptId:'native-over-limit-funding'}),error=>error.status===400&&error.code==='TEST_WALLET_LIMIT');
  const full=(await native.call('/api/student')).student;assert.equal(full.balance,1000000);assert.equal(full.entries.some(row=>row.attemptId==='native-over-limit-funding'),false);
  assert.ok(h.calls.filter(call=>call.native).every(call=>call.hasOrigin===false));
  assert.ok(h.calls.filter(call=>call.native&&call.method==='POST'&&call.path==='/api/student/fund').every(call=>call.proof==='1'));
 }finally{h.close()}
});

test('a native fixed-request payment enforces its amount, credits the merchant once and recovers a lost response',async()=>{
 const h=harness();
 try{
  const owner=h.client(),native=h.client({native:true}),shop=await merchant(owner,'fixed');
  const created=await post(owner,'/api/action',{type:'CREATE_REQUEST',payload:{shopId:shop.id,amount:2500,description:'Lunch bill'}}),request=created.entity;
  await assert.rejects(()=>native.call('/api/payments/quote?'+new URLSearchParams({shopId:shop.id,requestId:request.id})),error=>error.status===404);
  const quote=await native.call(quotePath(shop,request.id));
  assert.equal(quote.shop.id,shop.id);assert.equal(quote.request.id,request.id);assert.equal(quote.request.amount,2500);assert.equal(quote.request.description,'Lunch bill');assert.equal(quote.listingStatus,'test-only');
  const walletId=(await post(native,'/api/student/open',{name:'Native Fixed Student'})).student.id;
  const payload={walletId,shopId:shop.id,requestId:request.id,testKey:shop.testAcceptanceToken,amount:quote.request.amount,method:'request',attemptId:'native-fixed-stable-attempt'};
  await assert.rejects(()=>post(native,'/api/payments',payload),error=>error.code==='INSUFFICIENT_FUNDS');
  assert.equal((await native.call('/api/student')).student.balance,0);assert.equal((await owner.call('/api/session')).state.transactions.length,0);
  await post(native,'/api/student/fund',{walletId,amount:5000,confirmSandbox:true,attemptId:'native-fixed-funding'});
  await assert.rejects(()=>post(native,'/api/payments',{...payload,amount:100,attemptId:'native-forged-amount'}),/amount must match/);
  let business=await owner.call('/api/session');assert.equal(business.metrics.balance,0);assert.equal(business.state.transactions.length,0);assert.equal((await native.call('/api/student')).student.balance,5000);

  // The server commits, but the native transport never receives the response.
  await assert.rejects(async()=>{await post(native,'/api/payments',payload);throw new DOMException('Connection lost after commit','NetworkError')},error=>error.name==='NetworkError');
  business=await owner.call('/api/session');const receipt=business.state.transactions[0];
  assert.equal(business.state.transactions.length,1);assert.equal(business.metrics.balance,2500);assert.equal(receipt.status,'paid');assert.equal(receipt.amount,2500);assert.equal(receipt.requestId,request.id);
  assert.equal(receipt.studentWalletId,walletId);assert.equal(receipt.shopId,shop.id);
  await assert.rejects(()=>native.call(quotePath(shop,request.id)),error=>error.code==='REQUEST_UNAVAILABLE');

  const wallet=(await native.call('/api/student')).student,entry=wallet.entries.find(row=>row.attemptId===payload.attemptId);
  assert.equal(wallet.balance,2500);assert.equal(entry.transactionId,receipt.id);assert.equal(entry.reference,receipt.reference);assert.equal(entry.status,'paid');assert.equal(entry.amount,-2500);assert.ok(entry.confirmedAt);
  const replay=await post(native,'/api/payments',payload);
  assert.equal(replay.replayed,true);assert.equal(replay.attemptId,payload.attemptId);assert.equal(replay.payment.id,receipt.id);assert.equal(replay.payment.reference,receipt.reference);assert.equal(replay.student.balance,2500);
  await assert.rejects(()=>post(native,'/api/payments',{...payload,attemptId:'native-second-charge-attempt'}),error=>error.code==='REQUEST_UNAVAILABLE');
  assert.equal((await owner.call('/api/session')).state.transactions.length,1);assert.equal((await native.call('/api/student')).student.entries.filter(row=>row.type==='merchant-payment').length,1);
  assert.ok(h.calls.filter(call=>call.native&&call.path==='/api/payments').every(call=>call.hasOrigin===false&&call.proof==='1'));
 }finally{h.close()}
});

test('native static shop QR accepts a customer amount while keeping the private shop and wallet binding',async()=>{
 const h=harness();
 try{
  const owner=h.client(),native=h.client({native:true}),shop=await merchant(owner,'static');
  const quote=await native.call(quotePath(shop));assert.equal(quote.request,null);assert.equal(quote.shop.id,shop.id);
  assert.equal((await owner.call('/api/directory')).shops.some(row=>row.id===shop.id),false);
  await assert.rejects(()=>native.call('/api/payments/quote?'+new URLSearchParams({shopId:shop.id,testKey:'f'.repeat(64)})),error=>error.status===404);
  const walletId=(await post(native,'/api/student/open',{name:'Native Static Student'})).student.id;
  await post(native,'/api/student/fund',{walletId,amount:10000,confirmSandbox:true,attemptId:'native-static-funding'});
  const payment={walletId,shopId:shop.id,testKey:shop.testAcceptanceToken,amount:1234,method:'qr',attemptId:'native-static-payment-one'};
  await assert.rejects(()=>post(native,'/api/payments',{...payment,walletId:'another-wallet'}),error=>error.code==='WALLET_CHANGED');
  const first=await post(native,'/api/payments',payment);
  const second=await post(native,'/api/payments',{...payment,amount:567,attemptId:'native-static-payment-two'});
  assert.equal(first.attemptId,payment.attemptId);assert.equal(second.attemptId,'native-static-payment-two');
  assert.equal(first.payment.amount,1234);assert.equal(first.payment.requestId,null);assert.equal(second.payment.amount,567);assert.equal(second.payment.requestId,null);
  const business=await owner.call('/api/session'),wallet=(await native.call('/api/student')).student;
  assert.equal(business.metrics.balance,1801);assert.equal(wallet.balance,8199);assert.equal(business.state.transactions.length,2);
  for(const returned of [first.payment,second.payment]){const received=business.state.transactions.find(row=>row.id===returned.id);assert.equal(received.reference,returned.reference);assert.equal(received.shopId,shop.id)}
 }finally{h.close()}
});
