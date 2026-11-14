import test from 'node:test';
import assert from 'node:assert/strict';
import {calculateBusinessPlan,businessPlanProjection,normalizeBusinessPlan} from '../dist/business-plan-model.js';

const expense=(id,amount,values={})=>({id,title:id,amount,shopId:'one',category:'expense',status:'planned',funding:'unpaid',...values});
const snapshot=(plan={})=>({business:{id:'business',name:'Shop owner'},shops:[{id:'one'},{id:'two'}],openingBalance:120000,transactions:[{id:'pending-in',status:'processing',amount:99000}],refunds:[{id:'paid-out',status:'paid',amount:5000,shopId:'one'},{id:'refund-hold',status:'requested',amount:10000,shopId:'two'}],settlements:[{id:'payout-hold',status:'processing',amount:5000,fee:0}],businessPlan:{stockReserve:{amount:30000},expenses:[],managerShopIds:[],...plan}});

test('business plan starts with authoritative funds after holds, then subtracts only planning commitments',()=>{
 const state=snapshot({expenses:[expense('stock-later',30000,{category:'stock'}),expense('rent',10000)]});
 const result=calculateBusinessPlan(state);
 assert.equal(result.ledgerBalance,115000);assert.equal(result.ledgerHolds,15000);assert.equal(result.available,100000);
 assert.equal(result.stockCommitment,30000);assert.equal(result.otherCommitments,10000);assert.equal(result.afterPlan,60000);
 assert.equal(result.estimate,true);assert.equal(result.currency,'GHS');assert.match(result.coverage,/All shops/);
 assert.equal(state.transactions[0].amount,99000,'calculating does not mutate ledger records');
});

test('one business stock reserve covers stock expenses across shops without double counting',()=>{
 const plan={expenses:[expense('shop-one-stock',10000,{category:'stock'}),expense('shop-two-stock',15000,{category:'stock',shopId:'two'}),expense('packaging',10000)]};
 let result=calculateBusinessPlan(snapshot(plan));assert.equal(result.totalCommitments,40000);assert.equal(result.afterPlan,60000);
 plan.expenses.push(expense('extra-stock',20000,{category:'stock',shopId:'two'}));
 result=calculateBusinessPlan(snapshot(plan));assert.equal(result.stockCoveredCommitments,45000);assert.equal(result.stockCommitment,45000);assert.equal(result.afterPlan,45000);
});

test('recorded ledger and external expenses do not silently deduct funds or commitments again',()=>{
 const result=calculateBusinessPlan(snapshot({expenses:[expense('paid-refund-record',5000,{status:'recorded',funding:'ledger',ledgerReference:'paid-out'}),expense('external-cash',7000,{status:'recorded',funding:'external'})]}));
 assert.equal(result.available,100000);assert.equal(result.totalCommitments,30000);assert.equal(result.afterPlan,70000);
 assert.equal(result.externalRecordedTotal,7000);assert.equal(result.excludedLedgerExpenses.length,1);assert.equal(result.recordedExpenses.length,2);
 assert.match(result.explanation,/paid outside this Lumo account/);assert.match(result.explanation,/never pays anyone/);
});

test('selected-shop and manager summaries never present an incomplete account estimate',()=>{
 const state=snapshot({expenses:[expense('one-only',12000),expense('two-private',34000,{shopId:'two'}),expense('owner-private',60000,{shopId:null})],managerShopIds:['one']});
 const shop=calculateBusinessPlan(state,{shopId:'one'});assert.equal(shop.available,null);assert.equal(shop.stockReserve,null);assert.equal(shop.afterPlan,null);assert.equal(shop.totalCommitments,12000);
 const projection=businessPlanProjection(state,{role:'manager',shopIds:['one','two']});
 assert.deepEqual(projection.businessPlan.expenses.map(row=>row.id),['one-only']);assert.deepEqual(projection.businessPlanAccess.allowedShopIds,['one']);
 assert.equal(projection.businessPlanSummary.available,null);assert.equal(projection.businessPlanSummary.ledgerBalance,null);assert.equal(projection.businessPlanSummary.afterPlan,null);
 assert.equal(projection.businessPlan._attempts,undefined);
 const cashier=businessPlanProjection(state,{role:'cashier',shopIds:['one']});assert.equal(cashier.businessPlan,undefined);assert.equal(cashier.businessPlanSummary,undefined);assert.equal(cashier.businessPlanAccess.canView,false);
});

test('upcoming expenses use optional dates and a negative estimate remains an explicit shortfall',()=>{
 const result=calculateBusinessPlan(snapshot({expenses:[expense('undated',50000),expense('due',20000,{dueDate:'2026-11-14'}),expense('late',60000,{dueDate:'2026-11-13'})]}),{now:'2026-11-14T12:00:00Z'});
 assert.deepEqual(result.upcomingExpenses.map(row=>[row.id,row.overdue]),[['late',true],['due',false],['undated',false]]);assert.equal(result.afterPlan,-60000);
});

test('malformed financial records fail closed instead of producing understated estimates',()=>{
 for(const amount of [-1,1.25,Number.MAX_SAFE_INTEGER+1,'100'])assert.throws(()=>calculateBusinessPlan(snapshot({expenses:[expense('bad',amount)]})),/invalid/);
 assert.throws(()=>normalizeBusinessPlan({stockReserve:{amount:0.25}}),/invalid/);
 assert.throws(()=>calculateBusinessPlan({...snapshot(),openingBalance:NaN}),/invalid/);
 assert.throws(()=>calculateBusinessPlan({...snapshot(),refunds:[{status:'requested',amount:.1}]}),/invalid/);
 assert.throws(()=>calculateBusinessPlan(snapshot({expenses:[expense('a',Number.MAX_SAFE_INTEGER),expense('b',Number.MAX_SAFE_INTEGER)]})),/safe calculation/);
 assert.throws(()=>calculateBusinessPlan(snapshot({expenses:[expense('same',100),expense('same',100)]})),/duplicated/);
 const malformed=snapshot({expenses:[expense('bad',.25)]});
 assert.equal(businessPlanProjection(malformed,{role:'cashier',shopIds:['one']}).businessPlanAccess.canView,false);
 assert.equal(businessPlanProjection(malformed,{role:'manager',shopIds:['one']}).businessPlanAccess.canView,false);
});
