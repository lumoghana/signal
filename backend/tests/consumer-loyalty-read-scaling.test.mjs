import test from 'node:test';
import assert from 'node:assert/strict';
import {createConsumerLoyalty} from '../supabase/functions/lumo-approved/consumer-loyalty.mjs';

const identity={userId:'10000000-0000-4000-8000-000000000001',sessionId:'20000000-0000-4000-8000-000000000001'};
const requestId='30000000-0000-4000-8000-000000000001';

test('reward quote uses one indexed RPC and forwards verified identity without a whole-network read',async()=>{
 const calls=[],context={grossAmount:2500,discount:500,amount:2000};
 const rewards=createConsumerLoyalty({requestContextEnabled:true,serviceRpc:async(name,args)=>{calls.push({name,args});return {ok:true,loyalty:context};}});
 assert.deepEqual(await rewards.assertRequest(identity,requestId),context);
 assert.deepEqual(calls,[{name:'lumo_approved_reward_request_context',args:{p_actor:identity.userId,p_session:identity.sessionId,p_request:requestId}}]);
 assert.equal(await rewards.assertRequest(identity,null),null);assert.equal(calls.length,1);
});

test('indexed reward quote errors remain closed and never fall back to full private state',async()=>{
 for(const [response,code,status] of [[{ok:false,code:'SESSION_REVOKED'},'SESSION_REVOKED',401],[{ok:false,code:'REQUEST_UNAVAILABLE'},'REQUEST_UNAVAILABLE',403],[{ok:false},'LOYALTY_UNAVAILABLE',503],[{ok:true},'LOYALTY_UNAVAILABLE',503]]){
  const calls=[],rewards=createConsumerLoyalty({requestContextEnabled:true,serviceRpc:async name=>{calls.push(name);return response;}});
  await assert.rejects(rewards.assertRequest(identity,requestId),error=>error.code===code&&error.status===status);
  assert.deepEqual(calls,['lumo_approved_reward_request_context']);
 }
});

test('ordinary requests have no reward context and malformed references make no database call',async()=>{
 let calls=0;const rewards=createConsumerLoyalty({requestContextEnabled:true,serviceRpc:async()=>{calls++;return {ok:true,loyalty:null};}});
 assert.equal(await rewards.assertRequest(identity,requestId),null);assert.equal(calls,1);
 await assert.rejects(rewards.assertRequest(identity,'not-a-request'),error=>error.code==='REQUEST_UNAVAILABLE');assert.equal(calls,1);
});
