import test from 'node:test';
import assert from 'node:assert/strict';
import {readNetwork} from '../../merchant-approved/server/network.js';
import {harness,setup} from '../../merchant-approved/tests/cashier-fixture.mjs';
test('shared Edge boundary validates the approval identity while exposing only the active cashier and never owner powers',async()=>{
 const {createMerchantHandler,hydrateMerchantNetwork}=await import('../supabase/functions/lumo-approved/merchant/handler.mjs');
 const h=harness();try{const {phone,owner:ownerClient,staff,shop}=await setup(h),initial=(await readNetwork(h.env)).state;const owner=initial.users.find(u=>u.role==='owner');owner._sharedUserId='shared-owner';for(const person of initial.users.filter(u=>u.role==='cashier'))person._sharedUserId='shared-'+person.id;
 for(const session of initial.sessions.filter(s=>s.counterId)){session._counterSharedUserId='shared-owner';session._counterSharedSessionId='shared-login';}
 let state=structuredClone(initial),revision=1;const serviceRpc=async(name,args)=>{if(name==='lumo_approved_merchant_read')return {ok:true,state:structuredClone(state),revision,ledger:[],balances:{},requests:[],ledgerStamp:'test'};if(name==='lumo_approved_merchant_commit'){assert.equal(args.p_actor,'shared-owner');assert.equal(args.p_session,'shared-login');if(args.p_revision!==revision)return {ok:false,code:'CONCURRENT_UPDATE'};state=structuredClone(args.p_state);return {ok:true,revision:++revision};}throw Error(name);};
 const handle=createMerchantHandler({serviceRpc}),merchantToken=phone.cookies.get('lumo_session'),identity={userId:'shared-owner',sessionId:'shared-login',user:{email:owner.username+'@lumo.test'}};
 const call=(path,body,who=identity)=>handle({body:{path,method:body===undefined?'GET':'POST',body:body||{},merchantToken},identity:who});
 assert.equal((await call('/api/counter')).counter.locked,true);
 assert.equal((await call('/api/counter',undefined,null)).counter.locked,true);
 const normalToken=ownerClient.cookies.get('lumo_session');const noOwnerJWT=await handle({body:{path:'/api/session',method:'GET',merchantToken:normalToken},identity:null});assert.equal(noOwnerJWT.ok,false);assert.equal(noOwnerJWT.status,401);
 const badToken=await handle({body:{path:'/api/session',method:'GET',merchantToken:'a'.repeat(64)},identity:null});assert.equal(badToken.ok,false);assert.equal(badToken.status,401);
 const unlocked=await call('/api/counter/unlock',{userId:staff[0].id,pin:staff[0].pin});assert.equal(unlocked.ok,true);assert.equal(unlocked.session.userId,staff[0].id);assert.equal(unlocked.metrics,null);assert.equal(unlocked.counterTransport,true);const noJWTView=await call('/api/session',undefined,null);assert.equal(noJWTView.session.userId,staff[0].id);assert.equal(noJWTView.metrics,null);
 const forged=await call('/api/session',undefined,{...identity,userId:'shared-'+staff[0].id});assert.equal(forged.ok,false);assert.equal(forged.code,'FORBIDDEN');
 assert.equal((await call('/api/auth/step-up',{currentPassword:'OwnerTest12345'})).code,'COUNTER_ONLY');assert.equal((await call('/api/action',{type:'APPROVE_REFUND',payload:{approve:true,counterStaffId:unlocked.counter.staffId,counterShiftId:unlocked.counter.shiftId}})).code,'CASHIER_ACTION_FORBIDDEN');
 const request=(await call('/api/action',{type:'CREATE_REQUEST',payload:{shopId:shop.id,amount:2200,attemptId:'edge-request',counterStaffId:unlocked.counter.staffId,counterShiftId:unlocked.counter.shiftId}},null)).entity;assert.ok(request.counterId);assert.equal(request.staffId,staff[0].staffId);
 const canonical=hydrateMerchantNetwork({state,ledger:[{id:'journal-one',merchantId:owner.businessId,shopId:shop.id,requestId:request.id,type:'merchant_payment',amount:2200,createdAt:new Date().toISOString(),reference:'LM-EDGE'}],requests:[]});const receipt=canonical.businesses[owner.businessId].transactions[0];assert.equal(receipt.counterId,request.counterId);assert.equal(receipt.shiftId,request.shiftId);assert.equal(receipt.staffId,staff[0].staffId);
 const pair=await handle({body:{path:'/api/counter/setup',method:'POST',merchantToken:normalToken,body:{deviceId:'fresh-edge-phone',shopId:shop.id,label:'Fresh approved phone',mode:'dedicated',staffUserId:staff[1].id}},identity});assert.equal(pair.ok,true);assert.equal(pair.counterTransport,true);
 const stored=state.sessions.find(session=>session.counterId===pair.counter.id);assert.equal(stored._counterSharedUserId,'shared-owner');assert.equal(stored._counterSharedSessionId,'shared-login');
 const pairedNoJWT=await handle({body:{path:'/api/counter/unlock',method:'POST',merchantToken:normalToken,body:{userId:staff[1].id,pin:staff[1].pin}},identity:null});assert.equal(pairedNoJWT.ok,true);assert.equal(pairedNoJWT.session.userId,staff[1].id);
 }finally{h.close()}
});
