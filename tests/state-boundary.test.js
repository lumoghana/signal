import test from 'node:test';
import assert from 'node:assert/strict';
import {reconcileState,commitAction} from '../dist/js/state-boundary.js';
test('failed durable save never changes money, records or an existing view reference',()=>{
 const state={wallet:1000,groups:[{id:'a',messages:[]}]} ,group=state.groups[0];
 const result=commitAction({state,type:'pay',apply:s=>{s.wallet-=500;s.groups[0].messages.push({id:'one',text:'Paid'});return {ok:true};},persistence:{commit:()=>({ok:false,message:'Storage full',reason:'save-failed'})}});
 assert.equal(result.ok,false);assert.equal(state.wallet,1000);assert.equal(state.groups[0],group);assert.deepEqual(group.messages,[]);
});
test('successful save installs one immutable result while preserving task record identity',()=>{
 const state={wallet:1000,groups:[{id:'a',messages:[]}]},group=state.groups[0],array=state.groups;
 const result=commitAction({state,type:'pay',apply:s=>{s.wallet-=500;s.groups[0].messages.push({id:'one',text:'Paid'});return {ok:true};},persistence:{commit:s=>({ok:true,state:{...s,_storageRevision:2}})}});
 assert.equal(result.ok,true);assert.equal(state.wallet,500);assert.equal(state.groups,array);assert.equal(state.groups[0],group);assert.equal(group.messages.length,1);assert.equal(state._storageRevision,2);
});
test('reconciliation removes obsolete fields and retains reordered record identities',()=>{const old={items:[{id:'a',old:true},{id:'b',n:1}]},a=old.items[0],b=old.items[1];reconcileState(old,{items:[{id:'b',n:2},{id:'a',n:3}]});assert.equal(old.items[0],b);assert.equal(old.items[1],a);assert.equal(a.old,undefined);assert.equal(b.n,2);});
