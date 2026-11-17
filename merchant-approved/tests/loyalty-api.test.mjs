import test from 'node:test';
import assert from 'node:assert/strict';
import {harness,setup,action,unlock} from './cashier-fixture.mjs';
import {readNetwork,updateNetwork} from '../server/network.js';

const ref=()=> 'loyalty-test-'+crypto.randomUUID();
const programme=shopId=>({name:'Kitchen regulars',colour:'#c9f64a',earning:'visits',minimumSpend:2000,target:2,onePerDay:false,shopIds:[shopId],reward:{type:'discount',name:'GH5 off',value:500,cost:500,minimumSpend:2000,expiryDays:30},budgetLimit:10000});
async function query(client,values={}){return client.call('/api/loyalty'+(Object.keys(values).length?'?'+new URLSearchParams(values):''));}
async function change(client,operation,payload,options={}){
 const context=(await client.call('/api/session')).data;
 const guards=context.counter?{shopId:context.counter.shopId,counterId:context.counter.id,staffId:context.counter.staffId,shiftId:context.counter.shiftId||''}:{};
 const current=await query(client,guards);
 const body={operation,payload:{...payload,...(context.counter?{counterStaffId:context.counter.staffId,counterShiftId:context.counter.shiftId}: {})},mutationId:options.mutationId||ref(),expectedRevision:options.expectedRevision??current.data.loyalty?.revision??0};
 return client.call('/api/loyalty',body);
}
async function enroll(owner,shopId,name='Member One'){
 const result=await change(owner,'enrollMember',{name,phone:'0240000678',shopId,membershipConsent:true,marketingConsent:false});
 assert.equal(result.status,200,JSON.stringify(result.data));return result.data.entity.memberId;
}
async function pay(owner,shopId,memberId,amount=2500){
 const request=await change(owner,'prepareCollection',{memberId,shopId,grossAmount:amount});assert.equal(request.status,200,JSON.stringify(request.data));
 const paid=await owner.call('/api/simulate',{payload:{shopId,amount,requestId:request.data.entity.id,payer:'Confirmed test member',status:'paid'}});assert.equal(paid.status,200,JSON.stringify(paid.data));
 return {request:request.data.entity,payment:paid.data.entity};
}
async function prepare(h){const f=await setup(h);const saved=await change(f.owner,'saveProgramme',programme(f.shop.id));assert.equal(saved.status,200,JSON.stringify(saved.data));const memberId=await enroll(f.owner,f.shop.id);return {...f,memberId};}

test('loyalty configuration, enrollment and request association stay separate from ordinary snapshots and money',async()=>{
 const h=harness();try{
  const {owner,shop,memberId}=await prepare(h),before=(await owner.call('/api/session')).data;
  assert.equal(before.state.loyalty,undefined);assert.doesNotMatch(JSON.stringify(before),/0240000678|consentedAt|loyalty-event|_attempts/);
  const mutationId=ref(),first=await change(owner,'prepareCollection',{memberId,shopId:shop.id,grossAmount:2500},{mutationId});assert.equal(first.status,200,JSON.stringify(first.data));
  const replay=await change(owner,'prepareCollection',{memberId,shopId:shop.id,grossAmount:2500},{mutationId,expectedRevision:0});assert.equal(replay.status,200);assert.equal(replay.data.replayed,true);assert.equal(replay.data.entity.id,first.data.entity.id);
  const after=(await owner.call('/api/session')).data;assert.equal(after.state.requests.length,before.state.requests.length+1);assert.equal(after.metrics.balance,before.metrics.balance);assert.equal(after.state.transactions.length,before.state.transactions.length);assert.equal(after.state.loyalty,undefined);
  const raw=(await readNetwork(h.env)).state.businesses[after.state.business.id];assert.equal(raw.loyalty.collections[0].requestId,first.data.entity.id);assert.equal(raw.loyalty.links.length,1);
 }finally{h.close();}
});

test('confirmed sales award once; discounted QR is held until payment or authoritative cancellation',async()=>{
 const h=harness();try{
  const {owner,shop,memberId}=await prepare(h);await pay(owner,shop.id,memberId);await pay(owner,shop.id,memberId);
  const first=(await query(owner,{memberId})).data.loyalty;assert.equal(first.member.rewards.length,1);const reward=first.member.rewards[0];assert.equal(reward.state,'available');
  const before=(await owner.call('/api/session')).data.metrics.balance;
  const prepared=await change(owner,'prepareCollection',{memberId,shopId:shop.id,grossAmount:2500,rewardId:reward.id});assert.equal(prepared.status,200,JSON.stringify(prepared.data));assert.equal(prepared.data.entity.amount,2000);assert.equal(prepared.data.entity.grossAmount,2500);assert.equal(prepared.data.entity.discount,500);
  assert.equal((await change(owner,'prepareCollection',{memberId,shopId:shop.id,grossAmount:2500,rewardId:reward.id})).status,409);
  const cancelled=await action(owner,'CANCEL_REQUEST',{id:prepared.data.entity.id});assert.equal(cancelled.status,200);assert.equal((await query(owner,{memberId})).data.loyalty.member.rewards[0].state,'available');
  assert.equal((await owner.call('/api/simulate',{payload:{shopId:shop.id,amount:2000,requestId:prepared.data.entity.id,payer:'Stale QR',status:'paid'}})).status,400);
  const again=await change(owner,'prepareCollection',{memberId,shopId:shop.id,grossAmount:2500,rewardId:reward.id});assert.equal(again.status,200);assert.notEqual(again.data.entity.id,prepared.data.entity.id);
  const paid=await owner.call('/api/simulate',{payload:{shopId:shop.id,amount:2000,requestId:again.data.entity.id,payer:'Current QR',status:'paid'}});assert.equal(paid.status,200);
  const result=(await query(owner,{memberId})).data.loyalty;assert.equal(result.member.rewards[0].state,'redeemed');assert.equal(result.metrics.discountsGiven,500);assert.equal(result.member.progress,0);assert.equal((await owner.call('/api/session')).data.metrics.balance,before+2000);
  const repeated=(await query(owner,{memberId})).data.loyalty;assert.equal(repeated.metrics.redeemedRewards,1);assert.equal(repeated.member.history.filter(e=>e.type==='reward-redeemed').length,1);
 }finally{h.close();}
});

test('unlocked counter needs its exact operator and shift and never receives a member directory or phone',async()=>{
 const h=harness();try{
  const {owner,phone,shop,staff,memberId}=await prepare(h);assert.equal((await query(phone,{shopId:shop.id})).status,423);
  await unlock(phone,staff[0]);const view=(await phone.call('/api/session')).data;
  const params={shopId:shop.id,counterId:view.counter.id,staffId:view.counter.staffId,shiftId:view.counter.shiftId||'',memberId};
  assert.equal((await query(phone,{...params,staffId:'access-somebody-else'})).status,409);
  const found=await query(phone,params);assert.equal(found.status,200,JSON.stringify(found.data));assert.equal(found.data.loyalty.members.length,0);assert.equal(found.data.loyalty.member.phone,undefined);assert.equal(found.data.state.loyalty,undefined);assert.doesNotMatch(JSON.stringify(found.data),/0240000678|"_attempts"/);
  const denied=await phone.call('/api/loyalty',{operation:'prepareCollection',payload:{memberId,shopId:shop.id,grossAmount:2500,counterStaffId:'old-cashier',counterShiftId:view.counter.shiftId},mutationId:ref(),expectedRevision:found.data.loyalty.revision});assert.equal(denied.status,409);
  const mutationId=ref(),collection=await change(phone,'prepareCollection',{memberId,shopId:shop.id,grossAmount:2500},{mutationId});assert.equal(collection.status,200,JSON.stringify(collection.data));assert.equal(collection.data.entity.counterId,view.counter.id);
  assert.equal((await change(phone,'setBudget',{amount:90000,shopId:shop.id})).status,403);
  assert.equal((await change(phone,'recordExternalSale',{memberId,shopId:shop.id,amount:2500,method:'cash',reference:'CASHIER-CANNOT-ATTEST',confirmed:true})).status,403);
  assert.equal((await phone.call('/api/counter/lock',{endShift:true,counterStaffId:view.counter.staffId,counterShiftId:view.counter.shiftId})).status,200);assert.equal((await unlock(phone,staff[1])).status,200);assert.equal((await query(phone,params)).status,409);
  const next=(await phone.call('/api/session')).data,nextParams={shopId:shop.id,counterId:next.counter.id,staffId:next.counter.staffId,shiftId:next.counter.shiftId||'',mutationId};
  assert.equal((await query(phone,nextParams)).data.loyalty.mutationReceipt.found,false);
  await phone.call('/api/counter/lock',{});assert.equal((await query(phone,params)).status,423);
 }finally{h.close();}
});

test('receipt association cannot reassign a sale, cross a business or let a counter claim another counter receipt',async()=>{
 const h=harness();try{
  const {owner,phone,shop,staff,memberId}=await prepare(h);const otherMember=await enroll(owner,shop.id,'Member Two');
  const {payment}=await pay(owner,shop.id,memberId);
  assert.equal((await change(owner,'attachPayment',{memberId:otherMember,shopId:shop.id,transactionId:payment.id})).status,409);
  const outsider=h.client();assert.equal((await outsider.call('/api/loyalty')).status,401);
  await unlock(phone,staff[0]);const foreign=crypto.randomUUID();await updateNetwork(h.env,n=>{const b=n.businesses[(n.users.find(u=>u.id===staff[0].id)).businessId],at=new Date().toISOString();b.transactions.push({id:foreign,shopId:shop.id,counterId:'a-different-counter',payer:'Other counter',amount:2500,status:'paid',createdAt:at,confirmedAt:at,requestId:null});return {};});
  assert.equal((await change(phone,'attachPayment',{memberId,shopId:shop.id,transactionId:foreign})).status,403);
  assert.equal((await query(owner,{shopId:'other-business-shop',memberId})).status,404);
  assert.equal((await owner.call('/api/loyalty?memberId='+memberId+'&memberId=duplicate')).status,400);
 }finally{h.close();}
});

test('refunded sales reconcile loyalty during the normal refund and session path without resetting at close',async()=>{
 const h=harness();try{
  const {owner,shop,memberId}=await prepare(h);const first=await pay(owner,shop.id,memberId);await pay(owner,shop.id,memberId);
  const earned=(await query(owner,{memberId})).data.loyalty;assert.equal(earned.member.rewards[0].state,'available');
  const returned=await action(owner,'REFUND',{transactionId:first.payment.id,amount:2500,reason:'Returned purchase',attemptId:ref()});assert.equal(returned.status,200,JSON.stringify(returned.data));
  const after=(await query(owner,{memberId})).data.loyalty;assert.equal(after.member.rewards[0].state,'revoked');assert.equal(after.member.progress,1);
  const closed=await action(owner,'CLOSE_DAY',{shopId:shop.id});assert.equal(closed.status,200);const final=(await query(owner,{memberId})).data.loyalty;assert.equal(final.member.progress,1);assert.equal(final.member.rewards[0].state,'revoked');
 }finally{h.close();}
});

test('external records and their returns remain labelled separately and never create a money payment',async()=>{
 const h=harness();try{
  const {owner,shop,memberId}=await prepare(h),before=(await owner.call('/api/session')).data;
  const recorded=await change(owner,'recordExternalSale',{memberId,shopId:shop.id,amount:2500,method:'cash',reference:'CASH-ONE',confirmed:true});assert.equal(recorded.status,200,JSON.stringify(recorded.data));
  const duplicate=await change(owner,'recordExternalSale',{memberId,shopId:shop.id,amount:2500,method:'cash',reference:'CASH-ONE',confirmed:true});assert.equal(duplicate.status,409);
  const view=(await query(owner,{memberId})).data.loyalty;assert.equal(view.metrics.externalRecordedSales,2500);assert.equal(view.metrics.confirmedPurchases,0);
  const returned=await change(owner,'refundExternalSale',{saleId:recorded.data.entity.saleId,shopId:shop.id,amount:2500,reason:'Cash returned outside Lumo'});assert.equal(returned.status,200);
  const after=(await owner.call('/api/session')).data;assert.deepEqual(after.state.transactions,before.state.transactions);assert.equal(after.metrics.balance,before.metrics.balance);assert.equal((await query(owner,{memberId})).data.loyalty.metrics.externalRecordedSales,0);
 }finally{h.close();}
});
