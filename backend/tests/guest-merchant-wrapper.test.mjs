import test from 'node:test';
import assert from 'node:assert/strict';
import {readNetwork,hashToken} from '../../merchant-approved/server/network.js';
import {harness,setup} from '../../merchant-approved/tests/cashier-fixture.mjs';
import {createMerchantHandler} from '../supabase/functions/lumo-approved/merchant/handler.mjs';

test('a fresh merchant sign-in enriches with its issued cookie, never the empty incoming token',async()=>{
 const h=harness();try{
  await setup(h);let network=(await readNetwork(h.env)).state,revision=1;
  const owner=network.users.find(user=>user.role==='owner');owner._sharedUserId='00000000-0000-4000-8000-000000000001';
  let summaryHash=null;
  const serviceRpc=async(name,args)=>{
   if(name==='lumo_approved_merchant_read')return {ok:true,state:structuredClone(network),revision,ledgerStamp:'test',ledger:[],requests:[],balances:{}};
   if(name==='lumo_approved_merchant_commit'){network=structuredClone(args.p_state);return {ok:true,revision:++revision};}
   if(name==='lumo_guest_merchant'){
    summaryHash=args.p_merchant_token_hash;
    assert.ok(network.sessions.some(session=>session.tokenHash===summaryHash&&!session.revokedAt),'summary must use the new authenticated cookie');
    return {ok:true,paymentLinks:[],guestCollections:[]};
   }
   throw Error(name);
  };
  const handler=createMerchantHandler({serviceRpc,commerceEnabled:true});
  const response=await handler({body:{path:'/api/auth/login',method:'POST',body:{username:owner.username,password:'OwnerTest12345'}},identity:{userId:owner._sharedUserId,sessionId:'00000000-0000-4000-8000-000000000002',user:{email:owner.username+'@pilot.lumo.invalid'}}});
  assert.equal(response.ok,true,response.error);assert.match(response.merchantToken,/^[a-f0-9]{64}$/);
  assert.equal(summaryHash,await hashToken(response.merchantToken));assert.notEqual(summaryHash,await hashToken(''));
  assert.deepEqual(response.state.paymentLinks,[]);assert.deepEqual(response.state.guestCollections,[]);
 }finally{h.close()}
});

test('a newly registered merchant receives its recovery and enriched workspace with the issued cookie',async()=>{
 const h=harness();try{
  await setup(h);let network=(await readNetwork(h.env)).state,revision=1;
  const actor='00000000-0000-4000-8000-000000000011',username='guest.signup.'+crypto.randomUUID().slice(0,8);let summaryHash=null;
  const serviceRpc=async(name,args)=>{
   if(name==='lumo_approved_merchant_read')return {ok:true,state:structuredClone(network),revision,ledgerStamp:'test',ledger:[],requests:[],balances:{}};
   if(name==='lumo_approved_merchant_commit'){network=structuredClone(args.p_state);return {ok:true,revision:++revision};}
   if(name==='lumo_guest_merchant'){summaryHash=args.p_merchant_token_hash;const session=network.sessions.find(session=>session.tokenHash===summaryHash&&!session.revokedAt);assert.ok(session);assert.equal(network.users.find(user=>user.id===session.userId)._sharedUserId,actor);return {ok:true,paymentLinks:[],guestCollections:[]};}
   throw Error(name);
  };
  const handler=createMerchantHandler({serviceRpc,commerceEnabled:true});
  const response=await handler({body:{path:'/api/signup',method:'POST',body:{attemptId:crypto.randomUUID(),name:'Guest signup QA',ownerName:'Guest owner QA',phone:'0245550199',businessType:'sole-trader',destination:'Test bank',verification:{phone:true,identity:true,face:true},shop:{name:'Guest shop QA',area:'Legon',category:'Food',lat:5.65,lng:-.18},credentials:{username,password:'NewMerchantTest12345'}}},identity:{userId:actor,sessionId:'00000000-0000-4000-8000-000000000012',user:{email:username+'@pilot.lumo.invalid'}}});
  assert.equal(response.ok,true,response.error);assert.equal(response.status,201);assert.equal(response.user.username,username);assert.ok(response.recoveryKey);assert.equal(summaryHash,await hashToken(response.merchantToken));assert.deepEqual(response.state.paymentLinks,[]);
 }finally{h.close()}
});
