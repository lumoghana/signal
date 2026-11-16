import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,readdirSync} from 'node:fs';
import {createD1} from '../scripts/d1-adapter.mjs';
import {handleAPI} from '../server/api.js';
import {createSettlementAttempts} from '../dist/settlement-attempts.js';

class Storage {
 data=new Map();
 getItem(key){return this.data.get(key)??null}
 setItem(key,value){this.data.set(key,String(value))}
 removeItem(key){this.data.delete(key)}
}
function lockManager(){
 const queues=new Map();
 return {async request(name,options,callback){
  if(typeof options==='function')callback=options;
  const previous=queues.get(name)||Promise.resolve();let release;
  const held=new Promise(resolve=>{release=resolve}),tail=previous.then(()=>held);queues.set(name,tail);
  await previous;
  try{return await callback({name,mode:'exclusive'})}
  finally{release();if(queues.get(name)===tail)queues.delete(name)}
 }};
}
async function setup(){
 const DB=createD1();
 for(const file of readdirSync(new URL('../drizzle/',import.meta.url)).filter(name=>name.endsWith('.sql')).sort())await DB.exec(readFileSync(new URL('../drizzle/'+file,import.meta.url),'utf8'));
 const cookies=new Map(),calls=[];
 async function api(path,body){
  const headers={Origin:'https://settlement-race.test','X-Lumo-Request':'1','Content-Type':'application/json','cf-connecting-ip':'settlement-race-'+crypto.randomUUID()};
  if(cookies.size)headers.Cookie=[...cookies].map(([key,value])=>key+'='+value).join('; ');
  const response=await handleAPI(new Request('https://settlement-race.test'+path,{method:body===undefined?'GET':'POST',headers,...(body===undefined?{}:{body:JSON.stringify(body)})}),{DB});
  for(const cookie of response.headers.getSetCookie()){const pair=cookie.split(';')[0],index=pair.indexOf('=');cookies.set(pair.slice(0,index),pair.slice(index+1))}
  const data=await response.json();calls.push({path,type:body?.type,status:response.status});return {status:response.status,data};
 }
 const password='TwoTabTestOwner123';
 const signup=await api('/api/signup',{attemptId:'two-tab-api-signup',name:'Two Tab Campus Counter',ownerName:'Two Tab Test Owner',phone:'0245550100',destination:'Saved sandbox bank',businessType:'sole-trader',verification:{identity:true,face:true,phone:true},shop:{name:'Night Counter',area:'Night Market',category:'Food & drinks',lat:5.6509,lng:-.1878},credentials:{username:'two.tab.api.owner',password}});
 assert.equal(signup.status,201);
 const scope=[signup.data.session.businessId,signup.data.session.userId],shopId=signup.data.state.shops[0].id;
 const funded=await api('/api/simulate',{payload:{shopId,amount:10000,payer:'Sandbox Student',method:'qr',status:'paid',attemptId:'two-tab-api-funding'}});assert.equal(funded.status,200);
 return {api,calls,scope,password,close:()=>DB.close()};
}
const wire=record=>({attemptId:record.attemptId,amount:record.amount,destination:record.destination});

test('cancelling an older confirmation cannot erase another tab’s committed settlement after its response is lost',async()=>{
 const client=await setup();try{
  const storage=new Storage(),locks=lockManager();let serial=0;
  const tabA=createSettlementAttempts(storage,()=> 'tab-a-intent-'+ ++serial,{locks}),tabB=createSettlementAttempts(storage,()=> 'tab-b-intent',{locks});
  const original=await tabA.begin(...client.scope,{amount:2000,destination:'Saved sandbox bank'});
  const resumed=await tabB.begin(...client.scope,{amount:2000,destination:'Saved sandbox bank'});assert.equal(resumed.attemptId,original.attemptId);
  const submitting=await tabB.markSubmitted(...client.scope,resumed.attemptId);
  const proof=await client.api('/api/auth/step-up',{currentPassword:client.password,purpose:'settlement'});assert.equal(proof.status,200);
  await assert.rejects(async()=>{
   const committed=await client.api('/api/action',{type:'SETTLE',payload:wire(submitting),stepUpProof:proof.data.proof});assert.equal(committed.status,200);
   throw new TypeError('The settlement committed but its response was lost');
  },/response was lost/);
  assert.equal(tabB.read(...client.scope).submitted,true);
  assert.equal(await tabA.cancelDraft(...client.scope,original.attemptId),false,'an old password-dialog cancellation must preserve another tab’s submitted intent');
  const retry=await tabA.begin(...client.scope,{amount:3000,destination:'A newly edited destination'});
  assert.equal(retry.attemptId,original.attemptId);assert.equal(retry.amount,2000);assert.equal(retry.destination,'Saved sandbox bank');
  const proofCount=client.calls.filter(call=>call.path==='/api/auth/step-up').length;
  const result=await client.api('/api/action',{type:'SETTLE',payload:wire(retry)});
  assert.equal(result.status,200);assert.equal(result.data.replayed,true);assert.equal(result.data.metrics.reserved,2000);assert.equal(result.data.state.settlements.length,1);assert.equal(result.data.entity.attemptId,original.attemptId);
  assert.equal(client.calls.filter(call=>call.path==='/api/auth/step-up').length,proofCount,'retrieving a committed outcome does not require a new payout authorization');
  await tabA.clear(...client.scope,result.data.entity.attemptId);
  const next=await tabB.begin(...client.scope,{amount:3000,destination:'Saved sandbox bank'});assert.notEqual(next.attemptId,original.attemptId);assert.equal(next.submitted,false);
  const ledger=await client.api('/api/session');assert.equal(ledger.data.state.settlements.length,1);assert.equal(ledger.data.metrics.reserved,2000,'a newly prepared draft cannot reserve money before submission');
 }finally{client.close()}
});

test('two concurrent tabs share one draft and a cancelled draft cannot subsequently reach the settlement API',async()=>{
 const client=await setup();try{
  const storage=new Storage(),locks=lockManager();
  const tabA=createSettlementAttempts(storage,()=> 'first-tab-reference',{locks}),tabB=createSettlementAttempts(storage,()=> 'second-tab-reference',{locks});
  const [first,second]=await Promise.all([
   tabA.begin(...client.scope,{amount:2000,destination:'Saved sandbox bank'}),
   tabB.begin(...client.scope,{amount:3000,destination:'Saved sandbox bank'})
  ]);
  assert.equal(first.attemptId,second.attemptId);assert.equal(first.amount,second.amount);
  assert.equal(await tabA.cancelDraft(...client.scope,first.attemptId),true);
  await assert.rejects(tabB.markSubmitted(...client.scope,second.attemptId),/saved settlement changed/i);
  assert.equal(client.calls.filter(call=>call.type==='SETTLE').length,0);
  const ledger=await client.api('/api/session');assert.equal(ledger.data.state.settlements.length,0);assert.equal(ledger.data.metrics.reserved,0);
 }finally{client.close()}
});
