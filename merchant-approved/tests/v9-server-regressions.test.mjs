import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,readdirSync} from 'node:fs';
import {createD1} from '../scripts/d1-adapter.mjs';
import {handleAPI} from '../server/api.js';
import {readNetwork} from '../server/network.js';
import {createBusiness,reduceBusiness} from '../dist/domain.js';

const password='OwnerTest1234';
const signup=tag=>({attemptId:crypto.randomUUID(),name:'V9 Test '+tag,ownerName:'Sample Owner',phone:'0245550100',businessType:'sole-trader',destination:'Sandbox bank',verification:{phone:true,identity:true,face:true},shop:{name:'Night Market '+tag,area:'Night Market',category:'Food',lat:5.6509,lng:-.1878},credentials:{username:'v9.owner.'+tag,password}});
function fixture(){
 const DB=createD1();for(const file of readdirSync(new URL('../drizzle/',import.meta.url)).filter(name=>name.endsWith('.sql')).sort())DB.exec(readFileSync(new URL('../drizzle/'+file,import.meta.url),'utf8'));
 const env={DB};
 const client=()=>{const cookies=new Map();return {async call(path,body){const headers={'X-Lumo-Request':'1',Origin:'https://v9-test.example','cf-connecting-ip':crypto.randomUUID(),Cookie:[...cookies].map(([key,value])=>key+'='+value).join('; ')};if(body!==undefined)headers['Content-Type']='application/json';const response=await handleAPI(new Request('https://v9-test.example'+path,{method:body===undefined?'GET':'POST',headers,...(body===undefined?{}:{body:JSON.stringify(body)})}),env);for(const cookie of response.headers.getSetCookie()){const pair=cookie.split(';')[0],index=pair.indexOf('=');cookies.set(pair.slice(0,index),pair.slice(index+1))}return {status:response.status,data:await response.json()}}}};
 return {env,client,close:()=>DB.close()};
}
function sourceSnapshot(){
 let state=createBusiness(signup('legacy'));
 const shopId=state.shops[0].id;
 state=reduceBusiness(state,'PAY',{shopId,amount:1000,payer:'First legacy payer',attemptId:'first'},{role:'student'}).state;
 state=reduceBusiness(state,'PAY',{shopId,amount:1000,payer:'Second legacy payer',attemptId:'second'},{role:'student'}).state;
 return state;
}
const importBody=snapshot=>({snapshot,currentPassword:password,attemptId:crypto.randomUUID(),confirmImport:true});

test('import rejects duplicate identifiers and dangling financial links without consuming the target business',async()=>{
 const f=fixture();try{
  const owner=f.client(),registered=await owner.call('/api/signup',signup('invalidimport'));assert.equal(registered.status,201);
  const cases=[];
  const duplicate=sourceSnapshot();duplicate.transactions[1].id=duplicate.transactions[0].id;cases.push(duplicate);
  const crossKind=sourceSnapshot();crossKind.audit[0].id=crossKind.transactions[0].id;cases.push(crossKind);
  const dangling=sourceSnapshot();dangling.refunds.push({id:'dangling-refund',transactionId:'missing-payment',shopId:dangling.shops[0].id,amount:100,status:'paid',createdAt:new Date().toISOString(),paidAt:new Date().toISOString(),reason:'Missing original',payer:'Legacy'});cases.push(dangling);
  const wrongType=sourceSnapshot();wrongType.transactions[0].requestId=wrongType.transactions[1].id;cases.push(wrongType);
  const brokenClosing=sourceSnapshot();brokenClosing.closings.push({id:'bad-close',shopId:brokenClosing.shops[0].id,createdAt:new Date().toISOString(),businessDay:'2026-11-12',transactionIds:['missing-payment'],refundIds:[],gross:1000,refunds:0,net:1000,count:1,pending:0});cases.push(brokenClosing);
  for(const snapshot of cases){const rejected=await owner.call('/api/migrate',importBody(snapshot));assert.equal(rejected.status,400,JSON.stringify(rejected.data));const current=await owner.call('/api/session');assert.equal(current.data.metrics.balance,0);assert.equal(current.data.state.transactions.length,0);assert.equal(Object.keys((await readNetwork(f.env)).state.importAttempts).length,0);}
 }finally{f.close()}
});

test('import maps full long identifiers without collisions and both original payments remain refundable',async()=>{
 const f=fixture();try{
  const owner=f.client();await owner.call('/api/signup',signup('longids'));const snapshot=sourceSnapshot(),prefix='x'.repeat(180);snapshot.transactions[0].id=prefix+'A';snapshot.transactions[1].id=prefix+'B';
  const payload=importBody(snapshot),imported=await owner.call('/api/migrate',payload);assert.equal(imported.status,200,JSON.stringify(imported.data));assert.equal(imported.data.metrics.balance,2000);const ids=imported.data.state.transactions.map(payment=>payment.id);assert.equal(new Set(ids).size,2);assert.ok(ids.every(id=>id.length<100));
  const replay=await owner.call('/api/migrate',payload);assert.equal(replay.status,200);assert.equal(replay.data.replayed,true);assert.deepEqual(replay.data.state.transactions.map(payment=>payment.id),ids);
  for(const id of ids){const refund=await owner.call('/api/action',{type:'REFUND',payload:{transactionId:id,amount:1000,reason:'Legacy return',attemptId:crypto.randomUUID()}});assert.equal(refund.status,200,JSON.stringify(refund.data));assert.equal(refund.data.entity.status,'paid');}
  assert.equal((await owner.call('/api/session')).data.metrics.balance,0);
 }finally{f.close()}
});

test('funding and payments require numeric integer amounts and enforce the originating wallet when provided',async()=>{
 const f=fixture();try{
  const owner=f.client(),student=f.client(),registration=await owner.call('/api/signup',signup('amounts')),shopId=registration.data.state.shops[0].id,testKey=registration.data.state.shops[0].testAcceptanceToken;
  const opened=await student.call('/api/student/open',{name:'Strict Amount Student'}),walletId=opened.data.student.id;
  await student.call('/api/student/fund',{amount:5000,walletId,confirmSandbox:true,attemptId:'good-fund'});
  for(const amount of [true,false,[],[1000],{},null,'1000',0,-1,1.5]){
   assert.equal((await student.call('/api/student/fund',{amount,confirmSandbox:true,attemptId:crypto.randomUUID()})).status,400);
   assert.equal((await student.call('/api/payments',{shopId,testKey,amount,attemptId:crypto.randomUUID()})).status,400);
  }
  for(const path of ['/api/student/fund','/api/payments']){const wrong=await student.call(path,{shopId,amount:1000,walletId:'different-wallet',confirmSandbox:true,attemptId:crypto.randomUUID()});assert.equal(wrong.status,409);assert.equal(wrong.data.code,'WALLET_CHANGED');}
  assert.equal((await student.call('/api/student')).data.student.balance,5000);assert.equal((await owner.call('/api/session')).data.state.transactions.length,0);
  const paid=await student.call('/api/payments',{shopId,testKey,amount:1000,walletId,attemptId:'good-payment'});assert.equal(paid.status,201);assert.equal(paid.data.student.balance,4000);
 }finally{f.close()}
});

test('revoked receiving phones require an owner sign-in created after revocation for pairing and enable',async()=>{
 const f=fixture();try{
  const a=f.client(),b=f.client(),fresh=f.client(),payload=signup('restore'),registered=await a.call('/api/signup',payload),shopId=registered.data.state.shops[0].id;
  const oldOwner=await b.call('/api/auth/login',{username:payload.credentials.username,password});assert.equal(oldOwner.status,200);
  await a.call('/api/devices',{deviceId:'v9-restored-phone',label:'Owner counter',shopId});
  const revoked=await b.call('/api/devices/v9-restored-phone',{action:'revoke'});assert.equal(revoked.status,200);assert.ok(revoked.data.session);
  for(const [path,body]of [['/api/devices',{deviceId:'v9-restored-phone',label:'Attempt with older owner',shopId}],['/api/devices/v9-restored-phone',{action:'enable'}]]){const denied=await b.call(path,body);assert.equal(denied.status,403,JSON.stringify(denied.data));assert.equal(denied.data.code,'FRESH_OWNER_REQUIRED');}
  const login=await fresh.call('/api/auth/login',{username:payload.credentials.username,password});assert.equal(login.status,200);
  const restored=await fresh.call('/api/devices',{deviceId:'v9-restored-phone',label:'Approved restored counter',shopId});assert.equal(restored.status,200,JSON.stringify(restored.data));assert.equal(restored.data.device.sessionId,login.data.session.id);assert.equal(restored.data.device.revokedAt,null);assert.equal(restored.data.device.soundReady,false);
 }finally{f.close()}
});

test('a sound test cannot clear an announcement failure newer than its captured version',async()=>{
 const f=fixture();try{
  const owner=f.client(),registered=await owner.call('/api/signup',signup('audio')),shopId=registered.data.state.shops[0].id,path='/api/devices/v9-version-phone';
  const paired=await owner.call('/api/devices',{deviceId:'v9-version-phone',label:'Versioned counter',shopId});assert.equal(paired.data.device.failureVersion,0);
  assert.equal((await owner.call(path,{action:'test',soundReady:true,expectedFailureVersion:0})).status,200);
  const failure=await owner.call(path,{action:'heartbeat',soundReady:false,announcementFailed:true});assert.equal(failure.data.device.failureVersion,1);assert.equal(failure.data.device.announcementFailed,true);
  for(const body of [{action:'test',soundReady:true,expectedFailureVersion:0},{action:'test',soundReady:true},{action:'test',soundReady:true,expectedFailureVersion:'1'}]){const stale=await owner.call(path,body);assert.equal(stale.status,409);assert.equal(stale.data.code,'AUDIO_TEST_STALE');}
  const lateReady=await owner.call(path,{action:'heartbeat',soundReady:true});assert.equal(lateReady.data.device.soundReady,false);assert.equal(lateReady.data.device.failureVersion,1);
  const tested=await owner.call(path,{action:'test',soundReady:true,expectedFailureVersion:1});assert.equal(tested.status,200);assert.equal(tested.data.device.soundReady,true);assert.equal(tested.data.device.announcementFailed,false);assert.equal(tested.data.device.failureVersion,1);
  await owner.call(path,{action:'heartbeat',soundReady:false,announcementFailed:true});assert.equal((await owner.call(path,{action:'test',soundReady:true,expectedFailureVersion:1})).status,409);
 }finally{f.close()}
});

test('an already computed sound-test write retries its guard and cannot overwrite a newer failure',async()=>{
 const f=fixture();try{
  const owner=f.client(),registered=await owner.call('/api/signup',signup('audiorace')),shopId=registered.data.state.shops[0].id,path='/api/devices/v9-held-test';
  await owner.call('/api/devices',{deviceId:'v9-held-test',label:'Held test counter',shopId});await owner.call(path,{action:'test',soundReady:true,expectedFailureVersion:0});
  const original=f.env.DB.batch;let release,held=false;
  f.env.DB.batch=async statements=>{if(!held){held=true;await new Promise(resolve=>{release=resolve})}return original(statements)};
  const oldTest=owner.call(path,{action:'test',soundReady:true,expectedFailureVersion:0});
  while(!release)await new Promise(resolve=>setImmediate(resolve));
  const failed=await owner.call(path,{action:'heartbeat',soundReady:false,announcementFailed:true});assert.equal(failed.status,200);assert.equal(failed.data.device.failureVersion,1);
  release();const stale=await oldTest;assert.equal(stale.status,409);assert.equal(stale.data.code,'AUDIO_TEST_STALE');
  const state=await owner.call('/api/devices');assert.equal(state.data.devices[0].announcementFailed,true);assert.equal(state.data.devices[0].soundReady,false);assert.equal(state.data.devices[0].failureVersion,1);
 }finally{f.close()}
});
