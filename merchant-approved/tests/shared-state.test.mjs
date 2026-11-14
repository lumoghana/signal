import './legacy-d1-transport.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import {webcrypto} from 'node:crypto';
import {createBusiness} from '../dist/domain.js';
class Storage{constructor(){this.data=new Map()}getItem(k){return this.data.get(k)??null}setItem(k,v){this.data.set(k,String(v))}removeItem(k){this.data.delete(k)}}
const original={fetch:globalThis.fetch,window:globalThis.window,localStorage:globalThis.localStorage,BroadcastChannel:globalThis.BroadcastChannel,sessionStorage:globalThis.sessionStorage};
Object.defineProperty(globalThis,'crypto',{value:webcrypto,configurable:true});
let counter=0;
async function client(storage=new Storage(),tabStorage=new Storage()){
 globalThis.sessionStorage=tabStorage;globalThis.localStorage=storage;globalThis.BroadcastChannel=class{addEventListener(){}postMessage(){}close(){}};globalThis.window={addEventListener(){}};
 return import('../dist/shared.js?guard='+ ++counter);
}
function state(){return createBusiness({name:'Guard Campus Shop',ownerName:'Guard Owner',phone:'0245550100',businessType:'sole-trader',destination:'Demo destination',verification:{identity:true,face:true,phone:true},shop:{name:'Night Counter',area:'Night Market',category:'Food & drinks',lat:5.65,lng:-.18}})}
const owner={id:'session-owner',userId:'owner',businessId:'guard-business',role:'owner',shopIds:[],username:'guard.owner',name:'Guard Owner',expiresAt:'2099-01-01T00:00:00.000Z'};
const bundle=(revision,session=owner)=>({revision,session,user:session?{id:session.userId}:null,state:session?state():null,users:[],invitations:[],sessions:[],audit:[],devices:[]});
const json=(value,status=200)=>new Response(JSON.stringify(value),{status,headers:{'Content-Type':'application/json'}});
test('late responses from an earlier student wallet cannot replace the current shared wallet even at a higher revision',async()=>{
 const shared=await client();let release;
 globalThis.fetch=()=>new Promise(resolve=>{release=resolve});const old=shared.api('/api/student');
 globalThis.fetch=async()=>json({revision:10,student:{id:'wallet-b',balance:5000}});await shared.api('/api/student');
 release(json({revision:11,student:{id:'wallet-a',balance:4000}}));await old;
 assert.equal(shared.getCache().student.id,'wallet-b');assert.equal(shared.getCache().student.balance,5000);assert.equal(shared.getRevisions().student,10);
 globalThis.fetch=async()=>json({revision:12,student:{id:'wallet-b',balance:4500}});await shared.api('/api/student');assert.equal(shared.getCache().student.balance,4500);
});
test('a mutation response for a different wallet is rejected before changing the shared cache',async()=>{
 const shared=await client();shared.applyResponse({revision:1,student:{id:'wallet-a',balance:5000}});
 globalThis.fetch=async()=>json({revision:2,student:{id:'wallet-b',balance:4000},payment:{status:'paid'}});
 await assert.rejects(shared.api('/api/payments',{method:'POST',body:{amount:1000},expectedWalletId:'wallet-a'}),error=>error.code==='WALLET_CHANGED'&&error.status===409);
 assert.equal(shared.getCache().student.id,'wallet-a');assert.equal(shared.getCache().student.balance,5000);
});
test('a stale owner snapshot cannot restore a later signed-out account or roll its identity back',async()=>{
 const shared=await client();shared.applyResponse(bundle(9));shared.applyResponse(bundle(10,null));shared.applyResponse(bundle(9));assert.equal(shared.getCache().session,null);assert.equal(shared.getCache().state,null);
});
test('a delayed real read from the prior auth generation is rejected after local logout',async()=>{
 const shared=await client();shared.applyResponse(bundle(3));let complete;globalThis.fetch=()=>new Promise(resolve=>{complete=resolve});const pending=shared.api('/api/session');shared.lockLocal();complete(json(bundle(3)));await assert.rejects(pending,error=>error.code==='AUTH_CHANGED');assert.equal(shared.getCache().session,null);assert.equal(shared.isLocallyLocked(),true);
});
test('offline signout remains locally locked across reload and only explicit authentication unlocks it',async()=>{
 const storage=new Storage(),shared=await client(storage);shared.applyResponse(bundle(1));const epoch=shared.lockLocal();globalThis.fetch=async()=>{throw Error('Offline')};await assert.rejects(shared.api('/api/auth/logout',{method:'POST',body:{},authEpoch:epoch}));assert.equal(shared.getCache().session,null);
 const reloaded=await client(storage);const called=[];globalThis.fetch=async path=>{called.push(path);throw Error('Offline')};await reloaded.bootstrap();assert.deepEqual(called,['/api/auth/logout']);assert.equal(reloaded.getCache().session,null);assert.equal(reloaded.isLocallyLocked(),true);
 const loginEpoch=reloaded.beginAuthTransition('login');globalThis.fetch=async()=>json(bundle(8));await reloaded.api('/api/auth/login',{method:'POST',body:{username:'guard.owner',password:'TestPassword123'},authEpoch:loginEpoch,unlockOnSuccess:true});assert.equal(reloaded.isLocallyLocked(),false);assert.equal(reloaded.getCache().session.userId,'owner');
});
test('student-wallet authentication errors cannot sign a merchant out',async()=>{
 const shared=await client();shared.applyResponse(bundle(1));globalThis.fetch=async()=>json({error:'Open a student wallet',code:'STUDENT_REQUIRED'},401);await assert.rejects(shared.api('/api/payments',{method:'POST',body:{}}));assert.equal(shared.getCache().session.userId,'owner');
 globalThis.fetch=async()=>json({error:'Session ended',code:'SIGN_IN_REQUIRED'},401);await assert.rejects(shared.api('/api/action',{method:'POST',body:{}}));assert.equal(shared.getCache().session,null);assert.equal(shared.isLocallyLocked(),true);
});
test('response ordering is guarded independently for merchant, student and device snapshots',async()=>{
 const shared=await client();shared.applyResponse({...bundle(5),student:{balance:1000},devices:[{id:'one',enabled:true}]});shared.applyResponse({revision:8,student:{balance:750}});shared.applyResponse({revision:7,devices:[{id:'one',enabled:false}]});shared.applyResponse({...bundle(6),student:{balance:1000},devices:[{id:'one',enabled:true}]});assert.equal(shared.getCache().student.balance,750);assert.equal(shared.getCache().devices[0].enabled,false);assert.equal(shared.getCache().session.userId,'owner');
});
test.after(()=>Object.assign(globalThis,original));

test('a rejected protected auth change restores current identity while old requests stay invalidated',async()=>{
 const shared=await client();shared.applyResponse(bundle(4));const oldEpoch=shared.getAuthEpoch(),epoch=shared.beginAuthTransition('password-change');assert.equal(shared.getCache().session,null);
 globalThis.fetch=async()=>json({error:'Your current password is incorrect.'},403);
 await assert.rejects(shared.api('/api/auth/password',{method:'POST',body:{},authEpoch:epoch,unlockOnSuccess:true}),/current password/);
 assert.equal(shared.getCache().session.id,owner.id);assert.equal(shared.isLocallyLocked(),false);assert.notEqual(shared.getAuthEpoch(),oldEpoch);
 await assert.rejects(shared.api('/api/session',{authEpoch:oldEpoch}),error=>error.code==='AUTH_CHANGED');
});
test('an uncertain protected auth change never restores a potentially rotated cookie identity',async()=>{
 const shared=await client();shared.applyResponse(bundle(4));const epoch=shared.beginAuthTransition('password-change');globalThis.fetch=async()=>{throw new TypeError('Connection lost after send')};
 await assert.rejects(shared.api('/api/auth/password',{method:'POST',body:{},authEpoch:epoch,unlockOnSuccess:true}),/Connection lost/);assert.equal(shared.getCache().session,null);assert.equal(shared.isLocallyLocked(),true);
});


test('a quota write failure keeps the newer in-memory lock and persists it in this tab',async()=>{
 const sharedStorage=new Storage(),tabStorage=new Storage();let quota=false;const local={getItem:key=>sharedStorage.getItem(key),setItem(key,value){if(quota)throw new Error('QuotaExceededError');sharedStorage.setItem(key,value)},removeItem:key=>sharedStorage.removeItem(key)};
 const shared=await client(local,tabStorage),loginEpoch=shared.beginAuthTransition('login');shared.applyResponse(bundle(10),{authEpoch:loginEpoch,unlockOnSuccess:true});
 quota=true;const logoutEpoch=shared.lockLocal('quota-test');assert.equal(shared.getAuthEpoch(),logoutEpoch);assert.equal(shared.isLocallyLocked(),true);assert.equal(shared.localLockStatus().kind,'session');assert.equal(shared.localLockStatus().persistent,true);
 let reads=0;globalThis.fetch=async path=>{if(path==='/api/session')reads++;throw new Error('Offline')};await shared.refresh();assert.equal(reads,0);assert.equal(shared.getCache().session,null);
 const reloaded=await client(local,tabStorage);await reloaded.bootstrap();assert.equal(reloaded.isLocallyLocked(),true);assert.equal(reloaded.getAuthEpoch(),logoutEpoch);assert.equal(reloaded.getCache().session,null);assert.equal(reads,0,'reload must retry revocation rather than restore the old server session');
});

test('when both stores reject writes, local logout still blocks memory resurrection and reports its limit',async()=>{
 const sharedStorage=new Storage();let blocked=false;const local={getItem:key=>sharedStorage.getItem(key),setItem(key,value){if(blocked)throw new Error('Quota');sharedStorage.setItem(key,value)},removeItem:key=>sharedStorage.removeItem(key)},tab={getItem(){return null},setItem(){throw new Error('Blocked')},removeItem(){}};
 const shared=await client(local,tab),epoch=shared.beginAuthTransition('login');shared.applyResponse(bundle(1),{authEpoch:epoch,unlockOnSuccess:true});blocked=true;const logoutEpoch=shared.lockLocal();assert.equal(shared.getAuthEpoch(),logoutEpoch);assert.equal(shared.isLocallyLocked(),true);assert.equal(shared.localLockStatus().kind,'memory');assert.equal(shared.localLockStatus().persistent,false);
 globalThis.fetch=async()=>{throw new Error('Offline')};await shared.refresh();assert.equal(shared.getCache().session,null);assert.equal(shared.isLocallyLocked(),true);
});

test('BroadcastChannel propagates a memory-only logout when storage is blocked',async()=>{
 const channels=[];class Channel{constructor(name){this.name=name;this.listeners=[];channels.push(this)}addEventListener(name,fn){if(name==='message')this.listeners.push(fn)}postMessage(value){for(const peer of channels)if(peer!==this&&peer.name===this.name)for(const fn of peer.listeners)queueMicrotask(()=>fn({data:value}))}unref(){}close(){}}
 const denied={getItem(){throw new Error('Blocked')},setItem(){throw new Error('Blocked')},removeItem(){}};globalThis.localStorage=denied;globalThis.sessionStorage=denied;globalThis.window={addEventListener(){}};globalThis.BroadcastChannel=Channel;
 const a=await import('../dist/shared.js?broadcast='+ ++counter),b=await import('../dist/shared.js?broadcast='+ ++counter);a.applyResponse(bundle(1));b.applyResponse(bundle(1));a.lockLocal('other-tab-logout');await new Promise(resolve=>setImmediate(resolve));assert.equal(b.isLocallyLocked(),true);assert.equal(b.getCache().session,null);assert.equal(b.localLockStatus().kind,'memory');assert.equal(b.localLockStatus().crossTab,true);
});

test('readiness checkedAt refreshes cached metadata without replaying a business store update',async()=>{
 const shared=await client(),Store=await import('../dist/store.js'),first=state();first.shopReadiness=[{shopId:first.shops[0].id,phoneReady:true,readyCount:1,phoneCount:1,offlineCount:0,checkedAt:'2026-11-11T10:00:00.000Z',readyUntil:'2026-11-11T10:01:30.000Z'}];shared.applyResponse({...bundle(1),state:first});Store.switchWorkspace('registered');let updates=0;const unsubscribe=Store.subscribe(event=>{if(event.type==='REMOTE_SYNC')updates++});
 try{const next=structuredClone(first);next.shopReadiness[0].checkedAt='2026-11-11T10:00:04.000Z';shared.applyResponse({...bundle(2),state:next});assert.equal(updates,0);assert.equal(shared.getCache().state.shopReadiness[0].checkedAt,next.shopReadiness[0].checkedAt);assert.equal(Store.getState().shopReadiness[0].checkedAt,next.shopReadiness[0].checkedAt);next.shopReadiness[0].readyUntil='2026-11-11T10:02:00.000Z';shared.applyResponse({...bundle(3),state:next});assert.equal(updates,1,'an actual ready-until change must remain observable');}finally{unsubscribe()}
});
