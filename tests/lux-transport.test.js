import test from 'node:test';
import assert from 'node:assert/strict';
import { createApprovedService } from '../dist/js/approved-service.js';
const owner='11111111-1111-4111-8111-111111111111';
const memory=()=>{const m=new Map();return {getItem:k=>m.get(k)??null,setItem:(k,v)=>m.set(k,v),removeItem:k=>m.delete(k),keys:()=>[...m.keys()]};};
const envelope=()=>({ok:true,sandbox:true,currency:'GHS',account:{userId:owner,id:'33333333-3333-4333-8333-333333333333',balance:1000},state:{wallet:1000}});
const json=data=>({ok:true,status:200,json:async()=>data});
const fixture=fetch=>{const storage=memory();storage.setItem('lumo-approved-session-v1',JSON.stringify({user:{id:owner},access_token:'a.b.c',refresh_token:'test-refresh',expires_at:9999999999}));const snapshots=[];return {storage,snapshots,service:createApprovedService({storage,modeStorage:memory(),fetch,onSnapshot:(s,e)=>snapshots.push([s,e])})};};

test('connected Ask Lux sends no financial state and reuses the normal snapshot path',async()=>{
  const calls=[],f=fixture(async(url,init)=>{const body=JSON.parse(init.body);calls.push({url,body,headers:init.headers});return json(url.includes('/api/lux')?{ok:true,owner,mode:'ai',plan:{task:'afford',amount:3000},answer:{title:'A choice'}}:envelope());});
  const result=await f.service.askLux('GHS 30 lunch?',{questions:[]});assert.equal(result.mode,'ai');assert.equal(calls.length,2);assert.deepEqual(calls[0].body,{question:'GHS 30 lunch?',context:{questions:[]}});assert.equal(calls[0].headers.apikey,undefined);assert.equal(calls[1].body.action,'snapshot');assert.equal(f.snapshots.length,1);assert.equal(f.storage.keys().some(k=>k.includes('pending')),false);
});
test('sign-out during inference discards the answer and does not install an account',async()=>{
  let resolve;const wait=new Promise(r=>resolve=r);const f=fixture(async url=>url.includes('/api/lux')?wait:json({ok:true}));const request=f.service.askLux('What is left?',{questions:[]});await f.service.signOut();resolve(json({ok:true,owner,answer:{title:'old private answer'}}));const result=await request;assert.equal(result.code,'ACCOUNT_CHANGED');assert.equal(result.answer,undefined);assert.equal(f.snapshots.length,0);
});
test('a mismatched response owner is rejected before any snapshot installation',async()=>{
  const f=fixture(async()=>json({ok:true,owner:'different',answer:{title:'wrong account'}}));const r=await f.service.askLux('My balance?',{});assert.equal(r.code,'ACCOUNT_CHANGED');assert.equal(f.snapshots.length,0);
});
test('cleared or aborted chat cannot install an inference result',async()=>{
  let resolve;const wait=new Promise(r=>resolve=r),abort=new AbortController();const f=fixture(async()=>wait);const request=f.service.askLux('My balance?',{},{signal:abort.signal});abort.abort();resolve(json({ok:true,owner,answer:{title:'cancelled'}}));const r=await request;assert.equal(r.code,'CANCELLED');assert.equal(f.snapshots.length,0);
});
test('a failed final money refresh does not present an apparently fresh AI answer',async()=>{
  const f=fixture(async url=>json(url.includes('/api/lux')?{ok:true,owner,answer:{title:'stale answer'}}:{ok:false,code:'UNAVAILABLE'}));const r=await f.service.askLux('My balance?',{});assert.equal(r.code,'RECORDS_UNAVAILABLE');assert.equal(r.answer,undefined);
});
test('a current server projection avoids an unnecessary third account round trip',async()=>{
  let calls=0;const f=fixture(async()=>{calls++;return json({...envelope(),owner,answer:{title:'A current answer'}});});const r=await f.service.askLux('My balance?',{});assert.equal(r.ok,true);assert.equal(calls,1);assert.equal(f.snapshots.length,1);
});
