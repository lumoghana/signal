import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,readdirSync} from 'node:fs';
import {createDevices} from '../dist/devices.js';
import {createD1} from '../scripts/d1-adapter.mjs';
import {handleAPI} from '../server/api.js';

function memoryStorage(){const data=new Map();return {data,getItem:key=>data.get(key)||null,setItem:(key,value)=>data.set(key,String(value)),removeItem:key=>data.delete(key)}}
async function actualCounter(){
 const DB=createD1();for(const name of readdirSync(new URL('../drizzle/',import.meta.url)).filter(name=>name.endsWith('.sql')).sort())await DB.exec(readFileSync(new URL('../drizzle/'+name,import.meta.url),'utf8'));
 const cookies=new Map(),storage=memoryStorage(),calls=[],opened=[];let current=null,state={},outage=false,controller;
 async function api(path,options={}){
  calls.push({path,...options});if(outage)throw Error('Connection unavailable');
  const headers={'Content-Type':'application/json','X-Lumo-Request':'1',Origin:'https://speech-test.example','cf-connecting-ip':crypto.randomUUID()};if(cookies.size)headers.Cookie=[...cookies].map(([key,value])=>key+'='+value).join('; ');
  const response=await handleAPI(new Request('https://speech-test.example'+path,{method:options.method||'GET',headers,...(options.body===undefined?{}:{body:JSON.stringify(options.body)})}),{DB});
  for(const value of response.headers.getSetCookie()){const pair=value.split(';')[0],at=pair.indexOf('=');cookies.set(pair.slice(0,at),pair.slice(at+1))}
  const result=await response.json();if(!response.ok)throw Object.assign(Error(result.error),{status:response.status,code:result.code});
  if(Object.hasOwn(result,'session'))current=result.session;if(result.state)state=result.state;return result;
 }
 await api('/api/signup',{method:'POST',body:{attemptId:crypto.randomUUID(),name:'Speech Test Kitchen',ownerName:'Sample Owner',phone:'0245550165',businessType:'sole-trader',destination:'Sandbox destination',verification:{phone:true,identity:true,face:true},shop:{name:'Night Counter',area:'Night Market',category:'Food & drinks',lat:5.6509,lng:-.1878},credentials:{username:'speech.test.owner',password:'SpeechCounter123'}}});
 const shopId=state.shops[0].id,config={storage,api,getState:()=>state,getSession:()=>current,onTestVoice:()=>{},onOpenTransaction:id=>opened.push(id)};
 controller=createDevices(config);await api('/api/devices',{method:'POST',body:{deviceId:controller.getDeviceId(),label:'Audible counter',shopId}});await controller.start();await controller.handleClick('device-test');assert.equal(controller.canAnnounce(shopId),true);
 return {api,storage,calls,opened,config,get controller(){return controller},set controller(next){controller=next},get state(){return state},get session(){return current},shopId,setOutage:value=>{outage=value},setSession:value=>{current=value},close(){controller.stop();DB.close()}};
}
async function payment(f,amount=1375){
 await f.api('/api/student',{method:'POST',body:{name:'Sample Student'}});await f.api('/api/student/fund',{method:'POST',body:{amount:5000,confirmSandbox:true,attemptId:crypto.randomUUID()}});
 await f.api('/api/payments',{method:'POST',body:{shopId:f.shopId,amount,attemptId:crypto.randomUUID(),method:'qr'}});await f.api('/api/session');return f.state.transactions.find(entry=>entry.amount===amount&&entry.status==='paid');
}

test('a failed actual receipt withdraws local and server readiness, persists through refresh and never replays after retesting',async()=>{
 const f=await actualCounter();try{
  const receipt=await payment(f);assert.equal(f.controller.consumePayments(f.state.transactions).length,1);const context=f.controller.announcementContext(receipt);assert.ok(context);
  const failure=f.controller.announcementFailed(receipt,context,'synthesis-failed');
  assert.equal(f.controller.canAnnounce(f.shopId),false,'readiness is withdrawn before the heartbeat completes');assert.equal(f.controller.getReceiverLease(),null);
  assert.equal(await failure,true);await f.api('/api/devices/'+f.controller.getDeviceId(),{method:'POST',body:{action:'heartbeat',soundReady:true}});const service=await f.api('/api/devices');assert.equal(service.devices.find(entry=>entry.id===f.controller.getDeviceId()).soundReady,false,'a delayed ready heartbeat cannot undo the fault latch');assert.equal(service.devices.find(entry=>entry.id===f.controller.getDeviceId()).announcementFailed,true);const owner=await f.api('/api/session');assert.equal(owner.state.shopReadiness.find(entry=>entry.shopId===f.shopId).phoneReady,false);
  assert.match(f.controller.render(),/Check these payment receipts/);assert.match(f.controller.render(),new RegExp(receipt.reference));assert.deepEqual(f.controller.consumePayments(f.state.transactions),[]);
  await f.controller.refresh({heartbeat:true});assert.equal(f.controller.getAnnouncementFailures().length,1);assert.equal(f.controller.canAnnounce(f.shopId),false);
  f.controller.stop();f.controller=createDevices(f.config);await f.controller.start();assert.equal(f.controller.getAnnouncementFailures().length,1,'a refresh retains the receipt warning for the signed-in counter');
  await f.controller.handleClick('device-failure-checked',{dataset:{id:receipt.id}});assert.equal(f.controller.getAnnouncementFailures().length,1,'the warning cannot be cleared instead of retesting sound');
  await f.controller.handleClick('device-failed-receipt',{dataset:{id:receipt.id}});assert.deepEqual(f.opened,[receipt.id]);
  await f.controller.handleClick('device-test');assert.equal(f.controller.canAnnounce(f.shopId),true);assert.equal(f.controller.getAnnouncementFailures()[0].needsRetest,false);assert.deepEqual(f.controller.consumePayments(f.state.transactions),[],'recovery must not speak an old payment as new');
  await f.controller.handleClick('device-failure-checked',{dataset:{id:receipt.id}});assert.deepEqual(f.controller.getAnnouncementFailures(),[]);assert.doesNotMatch(f.controller.render(),/Check these payment receipts/);
 }finally{f.close()}
});

test('a late speech failure after switching identity cannot modify the new account or expose its predecessor’s warning',async()=>{
 const f=await actualCounter();try{
  const receipt=await payment(f),context=f.controller.announcementContext(receipt),count=f.calls.length;
  f.setSession({...f.session,id:'different-session',userId:'different-owner',businessId:'different-business'});
  assert.equal(await f.controller.announcementFailed(receipt,context,'synthesis-failed'),false);assert.equal(f.calls.length,count);assert.deepEqual(f.controller.getAnnouncementFailures(),[]);
 }finally{f.close()}
});

test('revocation and explicit controller stop invalidate an outstanding speech callback',async()=>{
 const f=await actualCounter();try{
  const receipt=await payment(f),context=f.controller.announcementContext(receipt);const records=f.controller.getDevices();f.controller.applyDevices(records.map(entry=>({...entry,revokedAt:new Date().toISOString(),enabled:false,sessionValid:false})),{revision:999999});
  const count=f.calls.length;assert.equal(await f.controller.announcementFailed(receipt,context,'synthesis-failed'),false);assert.equal(f.calls.length,count);assert.deepEqual(f.controller.getAnnouncementFailures(),[]);
  f.controller.stop();assert.equal(await f.controller.announcementFailed(receipt,context,'synthesis-failed'),false);
 }finally{f.close()}
});

test('a failed readiness heartbeat keeps the local warning, and reconnection does not silently unlock sound',async()=>{
 const f=await actualCounter();try{
  const receipt=await payment(f),context=f.controller.announcementContext(receipt);f.setOutage(true);
  assert.equal(await f.controller.announcementFailed(receipt,context,'audio-busy'),true);assert.equal(f.controller.canAnnounce(f.shopId),false);assert.match(f.controller.render(),/could not update this phone/);assert.equal(f.controller.getAnnouncementFailures().length,1);
  f.setOutage(false);await f.controller.refresh({heartbeat:true});assert.equal(f.controller.canAnnounce(f.shopId),false);assert.equal((await f.api('/api/devices')).devices[0].soundReady,false);assert.match(f.controller.render(),/Check these payment receipts/);
  await f.controller.handleClick('device-test');assert.equal(f.controller.canAnnounce(f.shopId),true);assert.equal(f.controller.getAnnouncementFailures().length,1);
 }finally{f.close()}
});

test('duplicate failure callbacks notify the service once and failure metadata contains no payer, amount or credential data',async()=>{
 const f=await actualCounter();try{
  const receipt=await payment(f),context=f.controller.announcementContext(receipt),before=f.calls.filter(call=>call.body?.action==='heartbeat').length;
  assert.equal(await f.controller.announcementFailed(receipt,context,'synthesis-failed'),true);assert.equal(await f.controller.announcementFailed(receipt,context,'synthesis-failed'),false);
  assert.equal(f.calls.filter(call=>call.body?.action==='heartbeat').length,before+1);assert.equal(f.controller.getAnnouncementFailures().length,1);
  const stored=[...f.storage.data].find(([key])=>key.startsWith('lumo-device-announcement-failures-v1:'))?.[1];assert.ok(stored);assert.doesNotMatch(stored,/Sample Student|Sample Owner|SpeechCounter123|amount|payer|password|recovery/i);
  f.setSession(null);assert.deepEqual(f.controller.getAnnouncementFailures(),[]);assert.equal([...f.storage.data.keys()].some(key=>key.startsWith('lumo-device-announcement-failures-v1:')),false,'identity loss clears private failure metadata');
 }finally{f.close()}
});

function deferred(){let resolve;const promise=new Promise(done=>{resolve=done});return {promise,resolve}}

test('a retest queued after its audio completes cannot clear a newer receipt failure',async()=>{
 const f=await actualCounter(),oldNavigator=Object.getOwnPropertyDescriptor(globalThis,'navigator');let release;
 try{
  Object.defineProperty(globalThis,'navigator',{configurable:true,value:{onLine:true,locks:{request(name,options,claim){return new Promise(resolve=>{release=()=>resolve(claim())})}}}});
  const before=f.calls.filter(call=>call.body?.action==='test').length,retest=f.controller.handleClick('device-test');await new Promise(resolve=>setImmediate(resolve));assert.equal(typeof release,'function','the old audible test is waiting to claim its lease');
  const receipt=await payment(f),context=f.controller.announcementContext(receipt);assert.ok(context);await f.controller.announcementFailed(receipt,context,'synthesis-failed');assert.equal(f.controller.canAnnounce(f.shopId),false);
  release();await retest;
  assert.equal(f.calls.filter(call=>call.body?.action==='test').length,before,'a test completed before the fault must not send a new test acknowledgement');assert.equal(f.controller.canAnnounce(f.shopId),false);assert.equal(f.controller.getAnnouncementFailures()[0].needsRetest,true);
  const server=(await f.api('/api/devices')).devices[0];assert.equal(server.announcementFailed,true);assert.equal(server.soundReady,false);assert.equal(server.failureVersion,1);
  if(oldNavigator)Object.defineProperty(globalThis,'navigator',oldNavigator);else delete globalThis.navigator;
  await f.controller.handleClick('device-test');assert.equal(f.controller.canAnnounce(f.shopId),true);assert.equal(f.controller.getAnnouncementFailures()[0].needsRetest,false);assert.deepEqual(f.controller.consumePayments(f.state.transactions),[]);
 }finally{release?.();if(oldNavigator)Object.defineProperty(globalThis,'navigator',oldNavigator);else delete globalThis.navigator;f.close()}
});

for(const phase of ['before server commit','after server commit'])test('a retest held '+phase+' cannot acknowledge a later receipt fault',async()=>{
 const f=await actualCounter(),gate=deferred(),started=deferred();let held=false;
 try{
  f.config.api=async(path,options={})=>{
   if(options.body?.action==='test'&&!held){held=true;assert.equal(options.body.expectedFailureVersion,0);if(phase==='after server commit'){const result=await f.api(path,options);started.resolve();await gate.promise;return result}started.resolve();await gate.promise;return f.api(path,options)}
   return f.api(path,options);
  };
  const retest=f.controller.handleClick('device-test');await started.promise;
  const receipt=await payment(f),context=f.controller.announcementContext(receipt);assert.ok(context);await f.controller.announcementFailed(receipt,context,'synthesis-failed');
  gate.resolve();await retest;
  const server=(await f.api('/api/devices')).devices[0];assert.equal(server.failureVersion,1);assert.equal(server.announcementFailed,true);assert.equal(server.soundReady,false);assert.equal(f.controller.canAnnounce(f.shopId),false);assert.equal(f.controller.getAnnouncementFailures()[0].needsRetest,true);
  f.config.api=f.api;await f.controller.handleClick('device-test');assert.equal(f.controller.canAnnounce(f.shopId),true);assert.equal(f.controller.getAnnouncementFailures()[0].needsRetest,false);assert.deepEqual(f.controller.consumePayments(f.state.transactions),[]);
 }finally{gate.resolve();f.close()}
});
