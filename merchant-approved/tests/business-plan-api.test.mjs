import test from 'node:test';
import assert from 'node:assert/strict';
import {harness,setup,action,unlock} from './cashier-fixture.mjs';
import {readNetwork,updateNetwork} from '../server/network.js';

async function change(client,operation,payload,{mutationId,expectedRevision}={}){
 const view=(await client.call('/api/session')).data;
 return client.call('/api/business-plan',{operation,payload,mutationId:mutationId||'plan-'+crypto.randomUUID(),expectedRevision:expectedRevision??view.state.businessPlan?.revision??0});
}
test('owner planning changes persist and replay once without moving funds or closing a shop day',async()=>{
 const h=harness();try{
  const {owner,phone,shop}=await setup(h),before=(await owner.call('/api/session')).data;
  assert.equal((await owner.call('/api/business-plan')).status,200);
  const first=await change(owner,'reserve',{amount:30000},{mutationId:'plan-owner-reserve',expectedRevision:0});assert.equal(first.status,200);assert.equal(first.data.state.businessPlan.stockReserve.amount,30000);
  const replay=await change(owner,'reserve',{amount:30000},{mutationId:'plan-owner-reserve',expectedRevision:0});assert.equal(replay.data.replayed,true);assert.equal(replay.data.state.businessPlan.revision,1);
  assert.equal((await change(owner,'reserve',{amount:40000},{mutationId:'plan-owner-reserve',expectedRevision:0})).data.code,'PLAN_REFERENCE_CONFLICT');
  const added=await change(owner,'upsertExpense',{title:'Stock order',amount:20000,category:'stock',status:'planned',shopId:shop.id});assert.equal(added.status,200);assert.equal(added.data.state.businessPlanSummary.totalCommitments,30000);
  const after=(await owner.call('/api/session')).data;assert.equal(after.metrics.balance,before.metrics.balance);assert.deepEqual(after.state.transactions,before.state.transactions);assert.deepEqual(after.state.closings,before.state.closings);assert.deepEqual(after.state.refunds,before.state.refunds);
  assert.equal(after.state.businessPlan._attempts,undefined);assert.equal((await phone.call('/api/business-plan')).status,403);
  const raw=(await readNetwork(h.env)).state.businesses[before.state.business.id];assert.ok(raw.businessPlan._attempts['plan-owner-reserve']);
 }finally{h.close();}
});

test('manager planning is opt-in and limited to enabled assigned shops without account balances',async()=>{
 const h=harness();try{
  const {owner,shop}=await setup(h),invite=await owner.call('/api/invitations',{name:'Shop Manager',phone:'0555550188',role:'manager',shopIds:[shop.id]});
  const manager=h.client(),accepted=await manager.call('/api/invitations/accept',{token:invite.data.invitation.token,username:'plan.manager.'+crypto.randomUUID().slice(0,8),password:'ManagerTest12345'});assert.equal(accepted.status,201);
  assert.equal((await change(manager,'upsertExpense',{title:'Manager expense',amount:1000,category:'expense',status:'planned',shopId:shop.id})).status,403);
  await change(owner,'upsertExpense',{title:'Owner private commitment',amount:6000,category:'expense',status:'planned',shopId:null});
  await change(owner,'setManagerAccess',{shopIds:[shop.id]});
  const saved=await change(manager,'upsertExpense',{title:'Packaging',amount:1000,category:'expense',status:'planned',shopId:shop.id});assert.equal(saved.status,200);
  assert.equal(saved.data.state.businessPlanSummary.available,null);assert.equal(saved.data.state.businessPlanSummary.afterPlan,null);assert.deepEqual(saved.data.state.businessPlan.expenses.map(row=>row.title),['Packaging']);
  assert.equal((await change(manager,'reserve',{amount:20000})).status,403);
  assert.equal((await change(manager,'setManagerAccess',{shopIds:[shop.id]})).status,403);
  assert.equal((await change(manager,'upsertExpense',{title:'Business wide',amount:1000,category:'expense',status:'planned',shopId:null})).status,403);
  assert.equal((await change(manager,'upsertExpense',{title:'Other merchant',amount:1000,category:'expense',status:'planned',shopId:'unknown-shop'})).status,403);
  await change(owner,'setManagerAccess',{shopIds:[]});const revoked=(await manager.call('/api/session')).data;assert.equal(revoked.state.businessPlan,undefined);assert.equal(revoked.state.businessPlanAccess.canView,false);
 }finally{h.close();}
});

test('expense recording validates original ledger links and prevents double allocation without posting money',async()=>{
 const h=harness();try{
  const {owner,shop}=await setup(h),view=(await owner.call('/api/session')).data,businessId=view.state.business.id;
  await updateNetwork(h.env,n=>{const b=n.businesses[businessId];b.openingBalance=20000;b.settlements.push({id:'settled-out',reference:'SETTLED-ONE',amount:5000,fee:0,status:'paid',createdAt:new Date().toISOString()});return {};});
  const values={title:'Debit classification',amount:3000,category:'expense',status:'recorded',funding:'ledger',ledgerReference:'SETTLED-ONE',shopId:null};
  const saved=await change(owner,'upsertExpense',values);assert.equal(saved.status,200);assert.equal(saved.data.state.businessPlanSummary.available,15000);assert.equal(saved.data.state.businessPlanSummary.totalCommitments,0);assert.equal(saved.data.state.businessPlan.expenses[0].ledgerReference,'settled-out');
  assert.equal((await change(owner,'upsertExpense',{...values,title:'Duplicate allocation'})).data.code,'PLAN_LEDGER_OVERALLOCATED');
  assert.equal((await change(owner,'upsertExpense',{...values,amount:500,ledgerReference:'missing-ledger'})).data.code,'PLAN_LEDGER_NOT_FOUND');
  const external=await change(owner,'upsertExpense',{title:'Paid in cash',amount:1000,category:'expense',status:'recorded',funding:'external',shopId:shop.id});assert.equal(external.status,200);assert.equal(external.data.state.businessPlanSummary.available,15000);assert.equal(external.data.state.businessPlanSummary.externalRecordedTotal,1000);assert.equal(external.data.state.settlements.length,1);
 }finally{h.close();}
});

test('concurrent plan edits, malformed amounts and dates are rejected without overwriting a newer plan',async()=>{
 const h=harness();try{
  const {owner,shop}=await setup(h);await change(owner,'reserve',{amount:1000},{expectedRevision:0});
  assert.equal((await change(owner,'reserve',{amount:2000},{expectedRevision:0})).data.code,'PLAN_CHANGED');
  for(const amount of [0,-1,1.25,10000000000])assert.equal((await change(owner,'upsertExpense',{title:'Invalid',amount,category:'expense',status:'planned',shopId:shop.id})).status,400);
  assert.equal((await change(owner,'upsertExpense',{title:'Invalid date',amount:1000,category:'expense',status:'planned',shopId:shop.id,dueDate:'2026-02-31'})).data.code,'INVALID_PLAN_DATE');
  assert.equal((await owner.call('/api/session')).data.state.businessPlan.stockReserve.amount,1000);
 }finally{h.close();}
});

test('cashiers may request review of recent shop-attributed guest receipts without receiving approval powers',async()=>{
 const h=harness();try{
  const {owner,phone,shop,staff}=await setup(h);await unlock(phone,staff[0]);const businessId=(await owner.call('/api/session')).data.state.business.id;
  await updateNetwork(h.env,n=>{const b=n.businesses[businessId],now=new Date().toISOString();for(const [id,extra]of [['guest-recent',{}],['guest-old',{createdAt:new Date(Date.now()-25*3600000).toISOString(),confirmedAt:new Date(Date.now()-25*3600000).toISOString()}],['other-counter',{counterId:'different-counter'}],['other-shop',{shopId:'different-shop'}],['static-unlinked',{source:'qr',attribution:null}]])b.transactions.push({id,shopId:shop.id,payer:'Guest customer',amount:2000,status:'paid',createdAt:now,confirmedAt:now,reference:'REF-'+id,source:'guest-momo',attribution:'shop',staffId:null,requestId:null,counterId:null,...extra});return {};});
  const request=await action(phone,'REFUND',{transactionId:'guest-recent',amount:500,reason:'Customer request',attemptId:'guest-review-request'});assert.equal(request.status,200);assert.equal(request.data.entity.status,'requested');
  for(const id of ['guest-old','other-counter','other-shop','static-unlinked'])assert.equal((await action(phone,'REFUND',{transactionId:id,amount:500,reason:'Not permitted',attemptId:'denied-'+id})).status,403,id);
  assert.equal((await action(phone,'APPROVE_REFUND',{id:request.data.entity.id,approve:true})).status,403);
  const view=(await owner.call('/api/session')).data;assert.equal(view.state.refunds.find(row=>row.id===request.data.entity.id).status,'requested');
 }finally{h.close();}
});
