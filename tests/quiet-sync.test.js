import test from 'node:test';
import assert from 'node:assert/strict';
import {stableSnapshot} from '../dist/js/quiet-sync.js';
test('reordered snapshot object keys do not cause a consumer redraw',()=>{
 assert.equal(stableSnapshot([{wallet:2500,account:{status:'active',id:'a'}}]),stableSnapshot([{account:{id:'a',status:'active'},wallet:2500}]));
});
test('balance, receipt, account restriction and message changes remain observable',()=>{
 const state={wallet:2500,account:{status:'active'},transactions:[],messages:[]};
 for(const update of [{wallet:2400},{account:{status:'closed'}},{transactions:[{id:'paid',amount:100}]},{messages:[{id:'new',text:'Paid'}]}])assert.notEqual(stableSnapshot(state),stableSnapshot({...state,...update}));
 assert.notEqual(stableSnapshot([1,2]),stableSnapshot([2,1]));
});

import {consumerViewSnapshot,canRenderConsumerBackground} from '../dist/js/quiet-sync.js';
test('account device heartbeat metadata is quiet while revocations and expiry remain visible',()=>{
 const state={wallet:2500,account:{status:'active',devices:[{id:'phone',lastSeenAt:'old',status:'active',expiresAt:'future'}]}};
 const heartbeat=structuredClone(state);heartbeat.account.devices[0].lastSeenAt='new';assert.equal(consumerViewSnapshot(state,[]),consumerViewSnapshot(heartbeat,[]));
 for(const field of ['status','expiresAt','id']){const changed=structuredClone(state);changed.account.devices[0][field]='changed';assert.notEqual(consumerViewSnapshot(state,[]),consumerViewSnapshot(changed,[]));}
});
test('every active consumer task defers background remount even after blur',()=>{
 const routes=[['pay','recipient'],['pay','amount'],['pay','review'],['pay','pause'],['pay','scan'],['pay','service'],['pay','home'],['onboarding','identity'],['activation','fund'],['plan','create'],['boxes','create'],['life','account-support-new'],['chat','home'],['learn','money-iq']];
 for(const [section,page] of routes){const form=section==='life';assert.equal(canRenderConsumerBackground({section,page},{form}),false,section+'/'+page);}
 for(const [section,page] of [['home','home'],['activity','home'],['pay','transaction'],['pay','status'],['life','group-chat'],['boxes','home'],['plan','home']])assert.equal(canRenderConsumerBackground({section,page}),true,section+'/'+page);
 assert.equal(canRenderConsumerBackground({section:'home',page:'home'},{overlay:true}),false);
 assert.equal(canRenderConsumerBackground({section:'life',page:'group-chat'},{focused:true}),false);
});
