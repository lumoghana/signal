import test from 'node:test';
import assert from 'node:assert/strict';
import {createApprovedService} from '../dist/js/approved-service.js';
import {locksFor} from './helpers/web-locks.js';

const KEY='lumo-approved-session-v1';
const memory=()=>{const values=new Map();return {getItem:key=>values.get(key)??null,setItem:(key,value)=>values.set(key,String(value)),removeItem:key=>values.delete(key),values};};
const session=id=>({access_token:id+'-access',refresh_token:id+'-refresh',expires_at:9999999999,user:{id}});
function fixture({signedIn=true,handler=()=>Response.json({ok:true,removed:true,templateEnrolled:false})}={}){
 const storage=memory(),calls=[];if(signedIn)storage.setItem(KEY,JSON.stringify(session('original-owner')));
 const service=createApprovedService({storage,modeStorage:memory(),lockManager:locksFor(storage),fetch:async(url,options)=>{const call={url,options,body:JSON.parse(options.body)};calls.push(call);return handler(call);}});
 return {service,storage,calls};
}

test('face removal is always authenticated and cannot install sessions or store password proofs',async()=>{
 const h=fixture({handler:()=>Response.json({ok:true,removed:true,templateEnrolled:false,session:session('injected'),state:{wallet:123}})}),before=h.storage.getItem(KEY);
 assert.equal((await h.service.passwordRecoveryRequest('faceRemove',{module:'admin',currentPassword:'SyntheticCurrent123'},{authenticated:false})).removed,true);
 assert.equal(h.calls.length,1);const call=h.calls[0];assert.match(call.url,/\/functions\/v1\/lumo-access$/);assert.equal(call.options.headers.Authorization,'Bearer original-owner-access');assert.equal(call.body.module,'consumer');assert.equal(call.body.operation,'faceRemove');assert.equal(call.body.currentPassword,'SyntheticCurrent123');assert.equal(call.options.credentials,'omit');assert.equal(call.options.cache,'no-store');assert.equal(call.options.redirect,'error');assert.equal(h.storage.getItem(KEY),before);assert.doesNotMatch([...h.storage.values.values()].join(''),/SyntheticCurrent123|injected/);h.service.dispose();
});

test('face removal without a session fails before network access even when a caller marks it public',async()=>{
 const h=fixture({signedIn:false});assert.equal((await h.service.passwordRecoveryRequest('faceRemove',{currentPassword:'SyntheticCurrent123'},{authenticated:false})).code,'AUTH_REQUIRED');assert.equal(h.calls.length,0);h.service.dispose();
});

test('a face-removal response arriving after an account change cannot authorize the new account',async()=>{
 let release;const h=fixture({handler:()=>new Promise(resolve=>{release=resolve;})});
 const pending=h.service.passwordRecoveryRequest('faceRemove',{currentPassword:'SyntheticCurrent123'},{authenticated:true});h.storage.setItem(KEY,JSON.stringify(session('new-owner')));release(Response.json({ok:true,removed:true,templateEnrolled:false}));assert.equal((await pending).code,'ACCOUNT_CHANGED');assert.equal(JSON.parse(h.storage.getItem(KEY)).user.id,'new-owner');h.service.dispose();
});
