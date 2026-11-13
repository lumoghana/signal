import './legacy-d1-transport.mjs';
import assert from 'node:assert/strict';
import test from 'node:test';
import {createBusiness} from '../dist/domain.js';

class Storage{constructor(){this.data=new Map()}getItem(key){return this.data.get(key)??null}setItem(key,value){this.data.set(key,String(value))}removeItem(key){this.data.delete(key)}}
globalThis.localStorage=new Storage();
const Shared=await import('../dist/shared.js');
const Auth=await import('../dist/account.js');
const Store=await import('../dist/store.js');
const originalFetch=globalThis.fetch;
const payload={name:'Saved Campus Kitchen',ownerName:'Akua Test',phone:'0245550100',businessType:'sole-trader',destination:'Sandbox Bank',verification:{phone:true,identity:true,face:true},shop:{name:'Night Market',area:'Night Market',category:'Food',lat:5.6509,lng:-.1878}};
const state=()=>createBusiness(payload);
const sharedState=()=>{const value=state();value.business={...value.business,id:'business-2000',sandbox:true,verificationStatus:'approved-sandbox',accountNumber:'9900200000'};value.shops[0].id='shop-2000';value.shops[0].code='LUM2000';return value};
const session=()=>({id:'owner-session',userId:'owner',businessId:'business-2000',role:'owner',shopIds:['shop-2000'],username:'saved.owner',name:'Akua Test',expiresAt:new Date(Date.now()+3600000).toISOString()});
const bundle=value=>({session:session(),user:{id:'owner'},state:value,users:[],sessions:[],invitations:[],audit:[],devices:[],revision:100});
function authenticate(value=sharedState(),current=session()){const authEpoch=Shared.beginAuthTransition('test');Shared.applyResponse({...bundle(value),session:current},{authEpoch,unlockOnSuccess:true})}

test('cached expiry locally locks the account immediately instead of waiting for polling',()=>{
 authenticate(sharedState(),{...session(),expiresAt:new Date(Date.now()-1000).toISOString()});assert.equal(Auth.getSession(),null);assert.equal(Shared.getCache().session,null);assert.equal(Shared.isLocallyLocked(),true);
});

test('offline sign-out locally locks the account while leaving server revocation retryable',async()=>{
 try{authenticate();globalThis.fetch=async()=>{throw Error('Disconnected')};const result=await Auth.signOut();assert.equal(result.localOnly,true);assert.equal(Auth.getSession(),null);assert.equal(Shared.isLocallyLocked(),true);assert.match(result.message,/retry when you reconnect/)}finally{globalThis.fetch=originalFetch}
});

test('ordinary shared records cannot be passed through legacy setup',async()=>{
 const value=sharedState();Store.replaceRegisteredState(value,{activate:true,notify:false});assert.equal(Auth.canMigrateLegacyBusiness(value),false);
 await assert.rejects(Auth.initializeOwner({username:'saved.owner',password:'OwnerTest123',confirmImport:true}),/already shared/);assert.equal(Auth.hasPendingLegacyImport(),false);
});

test('legacy import preserves its browser backup through network failure and resumes in the same shared account',async()=>{
 try{
  const legacy=state();legacy.business.storageOrigin='browser-legacy';legacy.transactions=[{id:'legacy-payment',shopId:legacy.shops[0].id,amount:1500,status:'paid',payer:'Sample Student',createdAt:new Date().toISOString(),reference:'LEGACY-REF'}];Store.replaceRegisteredState(legacy,{activate:true,notify:false});Shared.lockLocal('test-start');
  assert.equal(Auth.canMigrateLegacyBusiness(legacy),true);await assert.rejects(Auth.initializeOwner({username:'saved.owner',password:'OwnerTest123'}),/Confirm/);assert.equal(Auth.hasPendingLegacyImport(),false);
  const calls=[];let failImport=true;
  globalThis.fetch=async(path,options={})=>{
   const body=JSON.parse(options.body||'{}');calls.push({path,body});
   if(path==='/api/signup')return Response.json({...bundle(sharedState()),recoveryKey:'PrivateSampleKey'});
   if(path==='/api/migrate'){if(failImport)throw Error('Response interrupted');const imported=sharedState();imported.transactions=body.snapshot.transactions;return Response.json({...bundle(imported),revision:101})}
   if(path==='/api/auth/login')return Response.json(bundle(sharedState()));
   throw Error('Unexpected route '+path);
  };
  await assert.rejects(Auth.initializeOwner({username:'saved.owner',password:'OwnerTest123',confirmImport:true}),/interrupted/);
  const pending=Auth.getPendingLegacyImport();assert.equal(pending.targetBusinessId,'business-2000');assert.equal(Auth.hasPendingLegacyImport(),true);
  const backup=JSON.parse(localStorage.getItem('lumo-merchant-legacy-import-v1'));assert.equal(backup.snapshot.transactions[0].reference,'LEGACY-REF');assert.ok(!JSON.stringify(backup).includes('OwnerTest123'));
  failImport=false;await Auth.resumeLegacyImport({currentPassword:'OwnerTest123',confirmImport:true});assert.equal(Auth.hasPendingLegacyImport(),false);assert.equal(calls.filter(value=>value.path==='/api/signup').length,1);
  const imports=calls.filter(value=>value.path==='/api/migrate');assert.equal(imports.length,2);assert.equal(imports[0].body.attemptId,imports[1].body.attemptId);assert.equal(Store.getState().transactions[0].reference,'LEGACY-REF');
 }finally{globalThis.fetch=originalFetch}
});

test('ownership handover sends its protected request under the current auth transition and ends local access',async()=>{
 try{authenticate();let sent=false;globalThis.fetch=async(path,options)=>{assert.equal(path,'/api/auth/transfer');assert.equal(JSON.parse(options.body).confirmation,'TRANSFER');sent=true;return Response.json({success:true,session:null,revision:101})};await Auth.transferOwner({targetUserId:'staff',currentPassword:'OwnerTest123',confirmation:'TRANSFER',acceptResponsibility:true});assert.equal(sent,true);assert.equal(Auth.getSession(),null);assert.equal(Shared.isLocallyLocked(),true)}finally{globalThis.fetch=originalFetch}
});

test('online sign-out removes this device merchant cache and memory while preserving server records and retry references',async()=>{
 const sensitive=sharedState();sensitive.transactions=[{id:'private-payment',shopId:sensitive.shops[0].id,amount:7725,status:'paid',payer:'Private payer on shared shop phone',createdAt:new Date().toISOString(),reference:'PRIVATE-CACHE-REF'}];authenticate(sensitive);
 const backup='lumo-merchant-legacy-import-v1',retry='lumo-pending-refund-v1:business-2000:owner:private-payment';localStorage.setItem(backup,JSON.stringify({snapshot:{business:{id:'saved-browser-copy'}},attemptId:'keep-backup'}));localStorage.setItem(retry,JSON.stringify({attemptId:'unresolved-refund'}));
 assert.match(localStorage.getItem('lumo-merchant-registered-v1'),/Private payer/);
 try{globalThis.fetch=async()=>Response.json({success:true,session:null,state:null,revision:102});const result=await Auth.signOut();assert.equal(result.localOnly,false);assert.equal(Auth.getSession(),null);assert.equal(localStorage.getItem('lumo-merchant-registered-v1'),null);assert.equal(Store.hasRegistration(),false);assert.notEqual(Store.getState().business.id,'business-2000');assert.ok(!JSON.stringify(Store.getState()).includes('Private payer'));assert.equal(Shared.getCache().state,null);assert.ok(localStorage.getItem(backup));assert.ok(localStorage.getItem(retry));}
 finally{globalThis.fetch=originalFetch;localStorage.removeItem(backup);localStorage.removeItem(retry)}
});

test('server revocation clears the cached merchant and a delayed authorised snapshot cannot restore it',()=>{
 const sensitive=sharedState();sensitive.transactions=[{id:'revoked-private',shopId:sensitive.shops[0].id,amount:7725,status:'paid',payer:'Revoked private payer',createdAt:new Date().toISOString(),reference:'REVOKED-CACHE'}];authenticate(sensitive);const priorEpoch=Shared.getAuthEpoch();
 Shared.applyResponse({session:null,state:null,user:null,revision:103});assert.equal(localStorage.getItem('lumo-merchant-registered-v1'),null);assert.equal(Store.hasRegistration(),false);assert.ok(!JSON.stringify(Store.getState()).includes('Revoked private payer'));
 Shared.lockLocal('revoked');assert.throws(()=>Shared.applyResponse(bundle(sensitive),{authEpoch:priorEpoch}),error=>error.code==='AUTH_CHANGED');assert.equal(localStorage.getItem('lumo-merchant-registered-v1'),null);assert.equal(Shared.getCache().session,null);
});
