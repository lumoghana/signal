import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,readdirSync} from 'node:fs';
import {createD1} from '../scripts/d1-adapter.mjs';
import {handleAPI} from '../server/api.js';
import {createRefundAttempts} from '../dist/refund-attempts.js';

class Storage{data=new Map();getItem(key){return this.data.get(key)??null}setItem(key,value){this.data.set(key,String(value))}removeItem(key){this.data.delete(key)}}
function lockManager(){const tails=new Map();return {request(name,options,callback){const previous=tails.get(name)||Promise.resolve(),next=previous.catch(()=>{}).then(callback);tails.set(name,next);return next.finally(()=>{if(tails.get(name)===next)tails.delete(name)})}}}
async function setup(){
 const DB=createD1();for(const name of readdirSync(new URL('../drizzle/',import.meta.url)).filter(name=>name.endsWith('.sql')).sort())await DB.exec(readFileSync(new URL('../drizzle/'+name,import.meta.url),'utf8'));
 function client(){
  const cookies=new Map();
  return async(path,body)=>{
   const headers={Origin:'https://refund-race.test','X-Lumo-Request':'1','Content-Type':'application/json','cf-connecting-ip':'refund-race-'+crypto.randomUUID()};
   if(cookies.size)headers.Cookie=[...cookies].map(([key,value])=>key+'='+value).join('; ');
   const response=await handleAPI(new Request('https://refund-race.test'+path,{method:body===undefined?'GET':'POST',headers,...(body===undefined?{}:{body:JSON.stringify(body)})}),{DB});
   for(const cookie of response.headers.getSetCookie()){const pair=cookie.split(';')[0],i=pair.indexOf('=');cookies.set(pair.slice(0,i),pair.slice(i+1))}
   const data=await response.json();assert.ok(response.ok,JSON.stringify(data));return data;
  };
 }
 const owner=client(),student=client();
 const signup=await owner('/api/signup',{attemptId:'refund-race-signup',name:'Refund Race Kitchen',ownerName:'Refund Test Owner',phone:'0245550100',destination:'Sandbox Bank',businessType:'sole-trader',verification:{identity:true,face:true,phone:true},shop:{name:'Night Counter',area:'Night Market',category:'Food & drinks',lat:5.6509,lng:-.1878},credentials:{username:'refund.race.owner',password:'RefundTestOwner123'}});
 await student('/api/student/open',{name:'Refund Race Student'});await student('/api/student/fund',{amount:10000,confirmSandbox:true,attemptId:'refund-race-fund'});
 const paid=await student('/api/payments',{shopId:signup.state.shops[0].id,testKey:signup.state.shops[0].testAcceptanceToken,amount:10000,method:'qr',attemptId:'refund-race-payment'});
 return {owner,student,scope:[signup.session.businessId,signup.session.userId],payment:paid.payment,close:()=>DB.close()};
}

test('a stale refund success cannot turn two intended partial refunds into three wallet credits',async()=>{
 const h=await setup();try{
  const storage=new Storage(),locks=lockManager();let serial=0;
  const tabA=createRefundAttempts(storage,()=> 'refund-a-'+ ++serial,{locks}),tabB=createRefundAttempts(storage,()=> 'refund-b-'+ ++serial,{locks});
  const payload={transactionId:h.payment.id,amount:1000,reason:'Customer request'};
  const first=await tabA.begin(...h.scope,payload),firstOtherTab=await tabB.begin(...h.scope,payload);assert.equal(firstOtherTab.attemptId,first.attemptId);
  const firstResult=await h.owner('/api/action',{type:'REFUND',payload:first});
  // Tab B has the same success in flight; its completion reaches the UI later.
  const delayedFirst=await h.owner('/api/action',{type:'REFUND',payload:firstOtherTab});assert.equal(delayedFirst.replayed,true);
  assert.equal(await tabA.clear(...h.scope,h.payment.id,firstResult.entity.attemptId),true);
  const second=await tabA.begin(...h.scope,payload);assert.notEqual(second.attemptId,first.attemptId);
  await assert.rejects(async()=>{await h.owner('/api/action',{type:'REFUND',payload:second});throw new TypeError('Committed refund response was lost')},/response was lost/);
  assert.equal(await tabB.clear(...h.scope,h.payment.id,delayedFirst.entity.attemptId),false,'late success must preserve the newer refund reference');
  const retry=await tabA.begin(...h.scope,{...payload,reason:'A changed retry must retain the original reason'});assert.deepEqual(retry,second);
  const retried=await h.owner('/api/action',{type:'REFUND',payload:retry});assert.equal(retried.replayed,true);
  const ledger=await h.owner('/api/session'),wallet=await h.student('/api/student');
  assert.equal(ledger.state.refunds.length,2);assert.equal(ledger.state.refunds.reduce((sum,refund)=>sum+refund.amount,0),2000);assert.equal(wallet.student.balance,2000);assert.equal(wallet.student.entries.filter(entry=>entry.type==='refund').length,2);
  assert.equal(await tabA.clear(...h.scope,h.payment.id,retried.entity.attemptId),true);
 }finally{h.close()}
});

test('two concurrent refund controllers sharing one receipt produce one server refund',async()=>{
 const h=await setup();try{
  const storage=new Storage(),locks=lockManager(),a=createRefundAttempts(storage,()=> 'parallel-a',{locks}),b=createRefundAttempts(storage,()=> 'parallel-b',{locks}),payload={transactionId:h.payment.id,amount:1000,reason:'One customer refund'};
  const [first,second]=await Promise.all([a.begin(...h.scope,payload),b.begin(...h.scope,payload)]);assert.deepEqual(first,second);
  const [one,two]=await Promise.all([h.owner('/api/action',{type:'REFUND',payload:first}),h.owner('/api/action',{type:'REFUND',payload:second})]);
  assert.equal(one.entity.attemptId,two.entity.attemptId);
  assert.equal((await h.owner('/api/session')).state.refunds.length,1);assert.equal((await h.student('/api/student')).student.balance,1000);
 }finally{h.close()}
});
