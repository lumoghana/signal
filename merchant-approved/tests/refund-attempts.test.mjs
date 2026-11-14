import test from 'node:test';
import assert from 'node:assert/strict';
import {createRefundAttempts} from '../dist/refund-attempts.js';
class Storage{data=new Map();getItem(k){return this.data.get(k)??null}setItem(k,v){this.data.set(k,String(v))}removeItem(k){this.data.delete(k)}}
function lockManager(){
 const tails=new Map();
 return {request(name,options,callback){const previous=tails.get(name)||Promise.resolve(),next=previous.catch(()=>{}).then(callback);tails.set(name,next);return next.finally(()=>{if(tails.get(name)===next)tails.delete(name)})}};
}
const make=(storage,id,locks)=>createRefundAttempts(storage,()=>id,{locks});
const payload={transactionId:'payment',amount:2500,reason:'Customer request'};

test('uncertain refund retry after reload keeps its exact amount, reason and reference',async()=>{
 const storage=new Storage(),locks=lockManager(),first=await make(storage,'attempt-1',locks).begin('business','owner',payload);
 const reloaded=make(storage,'attempt-2',locks);
 assert.deepEqual(reloaded.read('business','owner','payment'),first);
 assert.deepEqual(await reloaded.begin('business','owner',{...payload,amount:500,reason:'Changed reason'}),first);
 assert.equal(reloaded.read('other-business','owner','payment'),null);assert.equal(reloaded.read('business','other-owner','payment'),null);assert.equal(reloaded.read('business','owner','other-payment'),null);
 assert.equal(await reloaded.clear('business','owner','payment',first.attemptId),true);assert.equal(reloaded.read('business','owner','payment'),null);
 assert.equal((await reloaded.begin('business','owner',{...payload,amount:500})).attemptId,'attempt-2');
});
test('concurrent tabs prepare one immutable shared refund reference',async()=>{
 const storage=new Storage(),locks=lockManager(),a=make(storage,'attempt-a',locks),b=make(storage,'attempt-b',locks);
 const [first,second]=await Promise.all([a.begin('business','owner',payload),b.begin('business','owner',{...payload,amount:1000,reason:'Different payload'})]);
 assert.deepEqual(first,second);assert.equal(storage.data.size,1);
});
test('a delayed completion cannot erase a newer unresolved partial refund',async()=>{
 const storage=new Storage(),locks=lockManager(),a=make(storage,'attempt-a',locks),b=make(storage,'attempt-b',locks);
 const first=await a.begin('business','owner',payload);assert.equal(await a.clear('business','owner','payment',first.attemptId),true);
 const second=await b.begin('business','owner',{...payload,amount:1000});
 assert.equal(await a.clear('business','owner','payment',first.attemptId),false);
 assert.deepEqual(b.read('business','owner','payment'),second);
 assert.deepEqual(await a.begin('business','owner',payload),second);
 await assert.rejects(a.clear('business','owner','payment'),/original refund reference/);
 assert.equal(b.read('business','owner','payment').attemptId,second.attemptId);
});
test('overlapping stale completion and new begin retain the new reference regardless of lock ordering',async()=>{
 for(const staleFirst of [true,false]){
  const storage=new Storage(),locks=lockManager(),a=make(storage,'attempt-a',locks),b=make(storage,'attempt-b',locks);
  const first=await a.begin('business','owner',payload);await a.clear('business','owner','payment',first.attemptId);
  const operations=staleFirst?[()=>a.clear('business','owner','payment',first.attemptId),()=>b.begin('business','owner',payload)]:[()=>b.begin('business','owner',payload),()=>a.clear('business','owner','payment',first.attemptId)];
  await Promise.all(operations.map(operation=>operation()));assert.equal(a.read('business','owner','payment').attemptId,'attempt-b');
 }
});
test('refund creation fails before sending when storage is denied or silently discards writes',async()=>{
 for(const storage of [{getItem(){return null},setItem(){throw new DOMException('Denied','SecurityError')}},{getItem(){return null},setItem(){}}]){
  await assert.rejects(make(storage,'unsafe',lockManager()).begin('business','owner',payload),/could not save the refund reference.*No new refund was sent/);
 }
});
test('unreadable or malformed saved refund cannot be overwritten with a fresh reference',async()=>{
 const key='lumo-pending-refund-v1:business:owner:payment';
 for(const raw of ['damaged-json',JSON.stringify({attemptId:'old',transactionId:'payment',amount:'100',reason:'Old refund'})]){
  const storage=new Storage();storage.setItem(key,raw);const a=make(storage,'new',lockManager());
  assert.equal(a.read('business','owner','payment'),null);await assert.rejects(a.begin('business','owner',payload),/could not be read safely/);assert.equal(storage.getItem(key),raw);
 }
});
test('unsupported browser coordination cannot create or clear a refund reference',async()=>{
 const storage=new Storage(),a=make(storage,'unsafe',{request:null});
 await assert.rejects(a.begin('business','owner',payload),/cannot coordinate refunds safely across tabs/);await assert.rejects(a.clear('business','owner','payment','unsafe'),/cannot coordinate refunds safely across tabs/);assert.equal(storage.data.size,0);
});
