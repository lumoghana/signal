import test from 'node:test';
import assert from 'node:assert/strict';
import {createConsumerRewards} from '../dist/js/consumer-rewards.js';
import {startLoyaltyPayment,prepareConsumerLoyaltyPayment,bindPayments} from '../dist/js/payments.js';
import {createEmptyState} from '../dist/js/model.js';
import {savePaymentRecovery} from '../dist/js/payment-recovery.js';
import {consumerLoyaltyFixture} from '../backend/tests/fixtures/consumer-loyalty-fixture.mjs';

// Actual shipped web controllers and shared metadata handlers use isolated
// canonical journals here. PostgreSQL posting/trigger checks run separately.
test('consumer join, canonical earning, prepared reward payment and merchant refund stay one programme across both apps',async()=>{
 const f=await consumerLoyaltyFixture(),buyer=f.actor('synthetic_student'),shopId=f.owner.shopId,identity=buyer.identity.userId,storageValues=new Map(),storage={getItem:k=>storageValues.get(k)||null,setItem:(k,v)=>storageValues.set(k,v),removeItem:k=>storageValues.delete(k)};
 const api=(operation,payload,options={})=>f.call(buyer,operation,payload,options.attemptId);
 const ui=createConsumerRewards({getUserId:()=>identity,getIdentity:()=>identity+':session-one',isAuthenticated:()=>true,storage,now:f.now,api});
 ui.open({shopId});assert.equal(await ui.refresh(),true);assert.match(ui.render(),/Join this programme/);assert.equal(await ui.handleSubmit({kind:'join',values:{membershipConsent:true,marketingConsent:false}}),true);
 let membership=ui.getView().loyalty.membership;assert.ok(membership?.id);assert.equal(membership.progress,0);assert.match(ui.render(),/Your membership card/);assert.match(ui.render(),/not a payment QR/);
 f.pay(buyer,{amount:2500});f.pay(buyer,{amount:2500});await ui.refresh({membershipId:membership.id});membership=ui.getView().loyalty.membership;const reward=membership.rewards.find(r=>r.state==='available');assert.ok(reward);assert.equal(membership.progress,0);
 const state=createEmptyState();state.onboardingDone=true;state.wallet=100000;state.buffer=0;const handlers=new Map(),messages=[];let route={section:'pay',page:'rewards',membershipId:membership.id},paid;
 const ctx={connected:true,state,draft:{},get route(){return route;},shared:{authVersion:1,user:{id:identity},signedIn:true,loyalty:api,quote:async values=>{
  const n=f.read(),b=n.state.businesses[f.owner.businessId],shop=b.shops.find(s=>s.id===values.shopId),r=values.requestId?n.requests.find(r=>r.id===values.requestId):null,c=r?b.loyalty.collections.find(c=>c.requestId===r.id):null;
  return {ok:true,merchant:{name:b.business.name},shop:{...shop},...(r?{request:r}:{}),...(c?{loyalty:{membershipId:c.memberId,grossAmount:c.grossAmount,discount:c.discount,amount:c.amount,rewardId:c.rewardId}}:{})};
 }},$(selector){return selector==='#payment-error'?{hidden:true,textContent:''}:null;},$$(selector){return [{addEventListener(type,fn){handlers.set(selector+':'+type,fn);}}];},saveDraft(){},savePaymentRecovery:p=>savePaymentRecovery(identity,p,storage),setCapture(){},refresh(){},closeSheet(){},toast:m=>messages.push(m),go:r=>{route=r;},finish:r=>{route=r;},auth:async({onSuccess})=>onSuccess(),actAsync:async(type,payload)=>{assert.equal(type,'payment');paid=f.pay(buyer,{amount:payload.amount,requestId:payload.requestId});return {ok:true,transaction:{id:paid.id,type:'payment',status:'success',amount:paid.amount,shopId}};}};
 await startLoyaltyPayment(ctx,{membership,reward,shopId});assert.equal(route.page,'amount');ctx.draft.payment.amount=2500;ctx.draft.payment.amountText='25.00';const prepared=await prepareConsumerLoyaltyPayment(ctx,ctx.draft.payment);assert.equal(prepared.ok,true);assert.equal(ctx.draft.payment.amount,2000);assert.equal(ctx.draft.payment.loyaltyApplied.discount,500);assert.equal(route.page,'review');assert.equal(f.read().ledger.filter(r=>r.requestId===prepared.requestId).length,0,'preparing cannot post money');
 bindPayments(ctx,route);await handlers.get('[data-action="pay-review-next"]:click')();await new Promise(resolve=>setImmediate(resolve));assert.equal(paid.requestId,prepared.requestId);assert.equal(paid.amount,2000);assert.equal(ctx.draft.payment.completed,true);
 await ui.refresh({membershipId:membership.id});membership=ui.getView().loyalty.membership;assert.equal(membership.rewards.find(r=>r.id===reward.id).state,'redeemed');assert.equal(membership.collections.find(c=>c.requestId===prepared.requestId).state,'paid');assert.match(ui.render(),/Used/);
 f.refund(paid);await ui.refresh({membershipId:membership.id});assert.equal(ui.getView().loyalty.membership.rewards.find(r=>r.id===reward.id).state,'redeemed','refunding net sale cannot restore a used coupon or pay its value');
 const merchant=await f.merchantApi(f.owner,'/api/loyalty');assert.equal(merchant.ok,true);assert.equal(merchant.loyalty.members.some(m=>m.id===membership.id),true);assert.equal(merchant.loyalty.reviews.filter(r=>r.state==='open').length,1);assert.equal(f.read().ledger.filter(r=>r.type==='merchant_payment'&&r.requestId===prepared.requestId).length,1);assert.equal(f.read().ledger.filter(r=>r.type==='refund'&&r.originalPaymentId===paid.id).length,1);ui.reset();
});
