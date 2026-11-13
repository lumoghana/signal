import test from 'node:test';
import assert from 'node:assert/strict';
import {createSettlementAttempts} from '../dist/settlement-attempts.js';
class Storage{data=new Map();getItem(k){return this.data.get(k)??null}setItem(k,v){this.data.set(k,String(v))}removeItem(k){this.data.delete(k)}}
function lockManager(){
 const tails=new Map();
 return {request(name,options,callback){const previous=tails.get(name)||Promise.resolve(),next=previous.catch(()=>{}).then(callback);tails.set(name,next);return next.finally(()=>{if(tails.get(name)===next)tails.delete(name)})}};
}
const make=(storage,id,locks)=>createSettlementAttempts(storage,()=>id,{locks});

test('a settlement keeps its immutable original payload after timeout, reload and destination changes',async()=>{
 const storage=new Storage(),locks=lockManager(),first=make(storage,'settle-1',locks);
 const original=await first.begin('business','owner',{amount:2000,destination:'Original saved bank'});assert.equal(original.submitted,false);
 await first.markSubmitted('business','owner',original.attemptId);
 const reloaded=make(storage,'settle-2',locks),pending=await reloaded.begin('business','owner',{amount:3000,destination:'Changed bank'});
 assert.deepEqual(pending,{...original,submitted:true});assert.equal(reloaded.read('other-business','owner'),null);assert.equal(reloaded.read('business','other-owner'),null);
 assert.equal(await reloaded.clear('business','owner','wrong-reference'),false);assert.ok(reloaded.read('business','owner'));
 assert.equal(await reloaded.clear('business','owner',original.attemptId),true);assert.equal(reloaded.read('business','owner'),null);
 assert.equal((await reloaded.begin('business','owner',{amount:3000,destination:'Changed bank'})).attemptId,'settle-2');
});
test('a payout is never submitted without a saved retry reference',async()=>{
 const blocked={getItem(){return null},setItem(){throw new DOMException('Quota exceeded','QuotaExceededError')},removeItem(){}};
 const attempts=make(blocked,'settle-blocked',lockManager());await assert.rejects(attempts.begin('business','owner',{amount:100,destination:'Saved bank'}),/No new settlement was sent/);
 const good=make(new Storage(),'reference',lockManager());await good.begin('business','owner',{amount:100,destination:'Saved bank'});
 await assert.rejects(good.markSubmitted('business','owner','another-reference'),/saved settlement changed/);
});
test('concurrent tabs create one shared intent and cancellation cannot erase another tab’s submission',async()=>{
 const storage=new Storage(),locks=lockManager(),tabA=make(storage,'intent-A',locks),tabB=make(storage,'intent-B',locks),payload={amount:2000,destination:'Saved bank'};
 const [a,b]=await Promise.all([tabA.begin('business','owner',payload),tabB.begin('business','owner',payload)]);assert.equal(a.attemptId,b.attemptId);
 const [submitted,cancelled]=await Promise.all([tabB.markSubmitted('business','owner',b.attemptId),tabA.cancelDraft('business','owner',a.attemptId)]);
 assert.equal(submitted.submitted,true);assert.equal(cancelled,false);assert.equal(tabA.read('business','owner').attemptId,a.attemptId);
 assert.equal((await tabA.begin('business','owner',{amount:2500,destination:'New bank'})).attemptId,a.attemptId);
});
test('cancellation winning the lock prevents a stale tab from submitting its deleted draft',async()=>{
 const storage=new Storage(),locks=lockManager(),tabA=make(storage,'intent-A',locks),tabB=make(storage,'intent-B',locks),payload={amount:2000,destination:'Saved bank'};
 const a=await tabA.begin('business','owner',payload);const cancelled=tabA.cancelDraft('business','owner',a.attemptId),submission=tabB.markSubmitted('business','owner',a.attemptId);
 assert.equal(await cancelled,true);await assert.rejects(submission,/saved settlement changed/);assert.equal(tabB.read('business','owner'),null);
 assert.equal((await tabB.begin('business','owner',payload)).attemptId,'intent-B');
});
test('a stale completion cannot clear a newer intent and an unspecified clear never erases one',async()=>{
 const storage=new Storage(),locks=lockManager(),a=make(storage,'intent-A',locks),b=make(storage,'intent-B',locks),payload={amount:2000,destination:'Saved bank'};
 const original=await a.begin('business','owner',payload);await a.markSubmitted('business','owner',original.attemptId);await a.clear('business','owner',original.attemptId);
 const next=await b.begin('business','owner',payload);assert.equal(await a.clear('business','owner',original.attemptId),false);await assert.rejects(a.clear('business','owner'),/original settlement reference/);assert.equal(b.read('business','owner').attemptId,next.attemptId);
});
test('unsupported cross-tab coordination fails closed without writing a payout reference',async()=>{
 const storage=new Storage(),a=make(storage,'unsafe',{request:null});await assert.rejects(a.begin('business','owner',{amount:2000,destination:'Saved bank'}),/cannot coordinate settlements safely across tabs/);assert.equal(storage.data.size,0);
});
test('an unreadable saved payout cannot be overwritten with a new reference',async()=>{
 const storage=new Storage(),a=make(storage,'new-reference',lockManager());storage.setItem('lumo-pending-settlement-v1:business:owner','damaged-json');assert.equal(a.read('business','owner'),null);
 await assert.rejects(a.begin('business','owner',{amount:2000,destination:'Saved bank'}),/could not be read safely/);assert.equal(storage.getItem('lumo-pending-settlement-v1:business:owner'),'damaged-json');
});

test('a silently discarded initial reference fails before a payout can become sendable',async()=>{
 const storage=new Storage();storage.setItem=()=>{};
 const attempts=make(storage,'discarded-reference',lockManager());let sent=false;
 await assert.rejects(async()=>{const pending=await attempts.begin('business','owner',{amount:2000,destination:'Saved bank'});await attempts.markSubmitted('business','owner',pending.attemptId);sent=true},/could not save.*No new settlement was sent/);
 assert.equal(sent,false);assert.equal(attempts.read('business','owner'),null);
});

test('a dropped submitted-state write rejects before send and leaves only a cancellable unsent draft',async()=>{
 const storage=new Storage(),locks=lockManager(),tabA=make(storage,'original',locks),tabB=make(storage,'replacement',locks);
 const draft=await tabA.begin('business','owner',{amount:2000,destination:'Saved bank'}),save=storage.setItem.bind(storage);let sent=0;
 storage.setItem=(key,value)=>{if(JSON.parse(value).submitted!==true)save(key,value)};
 await assert.rejects(async()=>{await tabA.markSubmitted('business','owner',draft.attemptId);sent++},/could not save.*No new settlement was sent/);
 assert.equal(sent,0);assert.equal(tabA.read('business','owner').submitted,false);
 assert.equal(await tabB.cancelDraft('business','owner',draft.attemptId),true,'Only an intent that was never sent is cancelled');
 storage.setItem=save;
 const next=await tabB.begin('business','owner',{amount:2000,destination:'Saved bank'});assert.equal(next.attemptId,'replacement');
 await tabB.markSubmitted('business','owner',next.attemptId);sent++;
 assert.equal(sent,1);assert.equal(await tabA.cancelDraft('business','owner',next.attemptId),false);
});

test('a mutated stored payload or failed readback cannot certify submission',async()=>{
 const storage=new Storage(),attempts=make(storage,'immutable',lockManager()),pending=await attempts.begin('business','owner',{amount:2000,destination:'Original bank'}),save=storage.setItem.bind(storage);
 storage.setItem=(key,value)=>{const changed=JSON.parse(value);changed.destination='Mutated bank';save(key,JSON.stringify(changed))};
 await assert.rejects(attempts.markSubmitted('business','owner',pending.attemptId),/could not save.*No new settlement was sent/);
 assert.equal(attempts.read('business','owner').submitted,true,'The failed write is treated conservatively, never as a deletable draft');
 assert.equal(await attempts.cancelDraft('business','owner',pending.attemptId),false);

 const secondStorage=new Storage(),second=make(secondStorage,'readback',lockManager()),get=secondStorage.getItem.bind(secondStorage);
 // Fail only the readback, after the initial absence check and write.
 let readCalls=0;secondStorage.getItem=key=>{if(++readCalls===2)throw Error('Read denied');return get(key)};
 await assert.rejects(second.begin('business','owner',{amount:2000,destination:'Saved bank'}),/could not save.*No new settlement was sent/);
});

test('silent deletion failure never claims a draft or confirmed retry reference was cleared',async()=>{
 const storage=new Storage(),attempts=make(storage,'retained',lockManager()),pending=await attempts.begin('business','owner',{amount:2000,destination:'Saved bank'});
 storage.removeItem=()=>{};
 await assert.rejects(attempts.cancelDraft('business','owner',pending.attemptId),/could not clear/);
 assert.equal(attempts.read('business','owner').attemptId,pending.attemptId);
 await attempts.markSubmitted('business','owner',pending.attemptId);
 await assert.rejects(attempts.clear('business','owner',pending.attemptId),/could not clear/);
 assert.equal(attempts.read('business','owner').submitted,true);
 assert.equal((await attempts.begin('business','owner',{amount:3000,destination:'Different bank'})).attemptId,pending.attemptId);
});
