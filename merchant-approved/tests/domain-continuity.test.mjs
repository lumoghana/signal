import test from 'node:test';
import assert from 'node:assert/strict';
import {createBusiness,reduceBusiness,metricsFor,ledger,applyAutomaticClosings,financialTradingDay} from '../dist/domain.js';

const owner={role:'owner',userId:'original-owner-user'},student={role:'student'};
function business({cutoff='03:00',mode='automatic'}={}){
 let state=createBusiness({name:'Continuity Kitchen',ownerName:'Original Owner',phone:'0245550100',businessType:'sole-trader',destination:'Saved bank destination',verification:{identity:true,face:true},shop:{name:'Night Counter',area:'Night Market',category:'Food',lat:5.65,lng:-.18,cutoff,closeMode:mode}},{now:'2026-11-10T10:00:00Z'});
 const shopId=state.shops[0].id;
 return {shopId,get state(){return state},replace(value){state=value},act(type,payload,at='2026-11-11T12:00:00Z',actor=owner){const result=reduceBusiness(state,type,payload,actor,{now:at});state=result.state;return result},close(at){const result=applyAutomaticClosings(state,at);state=result.state;return result}};
}

test('allocating a confirmed account receipt uses its shop trading day and resets that shop at the first cutoff',()=>{
 const b=business(),paid=b.act('PAY',{amount:1000,method:'account',payer:'Student',attemptId:'unallocated-one'},'2026-11-11T01:00:00Z',student).entity;
 assert.equal(paid.shopId,null);assert.equal(paid.tradingDay,'2026-11-11');
 const before=ledger(b.state),assigned=b.act('ASSIGN_PAYMENT',{id:paid.id,shopId:b.shopId},'2026-11-11T01:05:00Z').entity;
 assert.equal(assigned.confirmedAt,paid.confirmedAt);assert.equal(assigned.createdAt,paid.createdAt);
 assert.equal(assigned.tradingDay,'2026-11-10');assert.equal(assigned.tradingCutoff,'03:00');assert.equal(assigned.allocationSourceTradingDay,'2026-11-11');assert.equal(assigned.allocationSourceCutoff,'00:00');assert.equal(assigned.allocationReceiptTradingDay,'2026-11-10');assert.equal(assigned.priorPeriodAllocation,false);
 assert.equal(metricsFor(b.state,b.shopId,{now:'2026-11-11T01:06:00Z'}).todayGross,1000);assert.deepEqual(ledger(b.state),before);
 const closed=b.close('2026-11-11T03:01:00Z');assert.equal(closed.closings.length,1);assert.equal(closed.closings[0].gross,1000);assert.deepEqual(closed.closings[0].transactionIds,[paid.id]);assert.equal(metricsFor(b.state,b.shopId).currentNet,0);assert.deepEqual(ledger(b.state),before);
 assert.equal(b.close('2026-11-11T03:05:00Z').changed,false);
});

test('late allocation is an explicit open-period adjustment and never rewrites an earlier zero-sales closing',()=>{
 const b=business(),paid=b.act('PAY',{amount:1000,method:'account',payer:'Student'},'2026-11-11T01:00:00Z',student).entity;
 b.close('2026-11-11T03:01:00Z');const archived=structuredClone(b.state.closings[0]);assert.equal(archived.gross,0);
 const before=ledger(b.state),allocated=b.act('ASSIGN_PAYMENT',{id:paid.id,shopId:b.shopId},'2026-11-11T04:05:00Z').entity;
 assert.deepEqual(b.state.closings[0],archived);assert.equal(allocated.confirmedAt,'2026-11-11T01:00:00Z');assert.equal(allocated.priorPeriodAllocation,true);assert.equal(allocated.allocationReceiptTradingDay,'2026-11-10');assert.equal(allocated.tradingDay,'2026-11-11');
 const current=metricsFor(b.state,b.shopId,{now:'2026-11-11T04:06:00Z'});assert.equal(current.currentGross,1000);assert.equal(current.todayGross,1000);assert.equal(current.priorPeriodAllocations,1000);assert.deepEqual(ledger(b.state),before);
 const next=b.close('2026-11-12T03:01:00Z').closings[0];assert.equal(next.businessDay,'2026-11-11');assert.equal(next.gross,1000);assert.equal(next.priorPeriodAllocations,1000);assert.match(next.adjustmentNote,/receipts allocated.*earlier collection period/);assert.equal(metricsFor(b.state,b.shopId).currentNet,0);assert.deepEqual(b.state.closings.find(close=>close.id===archived.id),archived);assert.deepEqual(ledger(b.state),before);
});

test('allocation after a manual close remains a new period adjustment on the same trading day',()=>{
 const b=business({cutoff:'00:00',mode:'manual'}),paid=b.act('PAY',{amount:1500,method:'account',payer:'Student'},'2026-11-11T09:00:00Z',student).entity;
 const close=b.act('CLOSE_DAY',{shopId:b.shopId},'2026-11-11T10:00:00Z').entity;
 const assigned=b.act('ASSIGN_PAYMENT',{id:paid.id,shopId:b.shopId},'2026-11-11T10:05:00Z').entity;assert.equal(assigned.priorPeriodAllocation,true);assert.equal(assigned.tradingDay,'2026-11-11');assert.equal(b.state.closings[0].gross,0);
 const later=b.act('CLOSE_DAY',{shopId:b.shopId},'2026-11-11T11:00:00Z').entity;assert.notEqual(later.id,close.id);assert.equal(later.gross,1500);assert.equal(later.priorPeriodAllocations,1500);assert.equal(metricsFor(b.state,b.shopId).currentNet,0);assert.equal(ledger(b.state).balance,1500);
});

test('allocating a processing receipt preserves request time and confirmation freezes the correct shop day',()=>{
 const b=business(),pending=b.act('PAY',{amount:1000,method:'account',status:'processing',payer:'Student'},'2026-11-11T01:00:00Z',student).entity;
 const assigned=b.act('ASSIGN_PAYMENT',{id:pending.id,shopId:b.shopId},'2026-11-11T01:05:00Z').entity;
 assert.equal(assigned.recordedTradingDay,'2026-11-10');assert.equal(assigned.recordedCutoff,'03:00');assert.equal(assigned.createdAt,pending.createdAt);assert.equal(ledger(b.state).balance,0);
 const paid=b.act('RESOLVE_PAYMENT',{id:pending.id,status:'paid'},'2026-11-11T02:00:00Z').entity;assert.equal(paid.confirmedAt,'2026-11-11T02:00:00Z');assert.equal(financialTradingDay(b.state,paid),'2026-11-10');
 b.close('2026-11-11T03:01:00Z');assert.equal(metricsFor(b.state,b.shopId).currentNet,0);assert.equal(ledger(b.state).balance,1000);
});

test('settlement retry retrieves its original outcome across reservations, destination changes and terminal status',()=>{
 const b=business();b.act('PAY',{shopId:b.shopId,amount:10000,payer:'Student'},'2026-11-11T10:00:00Z',student);
 const request={amount:2000,destination:'Saved bank destination',attemptId:'one-settlement'};
 const first=b.act('SETTLE',request,'2026-11-11T11:00:00Z').entity,before=ledger(b.state);
 const retry=b.act('SETTLE',request,'2026-11-11T11:01:00Z');assert.equal(retry.changed,false);assert.equal(retry.entity.id,first.id);assert.equal(b.state.settlements.length,1);assert.deepEqual(ledger(b.state),before);
 b.act('UPDATE_BUSINESS',{destination:'Replacement saved destination'},'2026-11-11T11:02:00Z');
 assert.equal(b.act('SETTLE',request,'2026-11-11T11:03:00Z').entity.destination,'Saved bank destination');
 assert.equal(b.act('SETTLE',{amount:2000,attemptId:'one-settlement'},'2026-11-11T11:04:00Z').entity.id,first.id);
 const unchanged=structuredClone(b.state);assert.throws(()=>b.act('SETTLE',{...request,amount:3000}),/different settlement/);assert.throws(()=>b.act('SETTLE',{...request,destination:'Replacement saved destination'}),/different settlement/);assert.deepEqual(b.state,unchanged);
 b.act('RESOLVE_SETTLEMENT',{id:first.id,status:'paid'},'2026-11-11T11:05:00Z');const final=ledger(b.state);const old=b.act('SETTLE',request,'2026-11-11T11:06:00Z');assert.equal(old.changed,false);assert.equal(old.entity.status,'paid');assert.deepEqual(ledger(b.state),final);assert.equal(b.state.settlements.length,1);
 const second=b.act('SETTLE',{amount:2000,destination:'Replacement saved destination',attemptId:'another-settlement'},'2026-11-11T11:07:00Z').entity;assert.notEqual(second.id,first.id);assert.notEqual(second.reference,first.reference);assert.equal(ledger(b.state).reserved,2000);
 assert.throws(()=>b.act('SETTLE',{amount:1000,destination:'Unverified different destination',attemptId:'unsafe-new'}),/saved business destination/);
});

test('a failed settlement retry never reserves it again; an explicit new attempt remains possible',()=>{
 const b=business();b.act('PAY',{shopId:b.shopId,amount:5000,payer:'Student'},'2026-11-11T10:00:00Z',student);const p={amount:2000,attemptId:'failed-one'},created=b.act('SETTLE',p).entity;
 b.act('RESOLVE_SETTLEMENT',{id:created.id,status:'failed'});const prior=ledger(b.state),replayed=b.act('SETTLE',p);assert.equal(replayed.changed,false);assert.equal(replayed.entity.status,'failed');assert.deepEqual(ledger(b.state),prior);assert.equal(b.state.settlements.length,1);
 b.act('SETTLE',{...p,attemptId:'retry-as-new-intent'});assert.equal(b.state.settlements.length,2);assert.equal(ledger(b.state).reserved,2000);
});

test('shift snapshots survive owner handover and legacy missing names never borrow the current owner',()=>{
 const b=business(),shift=b.act('START_SHIFT',{shopId:b.shopId},'2026-11-11T09:00:00Z').entity;assert.equal(shift.staffName,'Original Owner');assert.equal(shift.performedBy,'Original Owner');
 b.act('END_SHIFT',{id:shift.id},'2026-11-11T10:00:00Z');b.act('UPDATE_BUSINESS',{ownerName:'New Owner'},'2026-11-11T11:00:00Z');assert.equal(b.state.shifts[0].staffName,'Original Owner');
 const legacy=structuredClone(b.state);delete legacy.shifts[0].staffName;delete legacy.shifts[0].performedBy;
 const normalized=applyAutomaticClosings(legacy,'2026-11-11T11:05:00Z');assert.equal(normalized.state.shifts[0].staffName,'Business owner (historical name unavailable)');assert.equal(normalized.metadataChanged,true);
 assert.equal(applyAutomaticClosings(normalized.state,'2026-11-11T11:05:00Z').metadataChanged,false);
 // A later recovered exact event can improve an unknown legacy label without ever guessing from the new owner.
 const recovered=structuredClone(normalized.state);recovered.transactions.push({id:'historical-receipt',shopId:b.shopId,staffId:shift.staffId,staffName:'Original Owner',shiftId:shift.id,status:'paid',amount:1000,createdAt:'2026-11-11T09:10:00Z',confirmedAt:'2026-11-11T09:10:00Z',tradingDay:'2026-11-11',tradingCutoff:'03:00'});
 const known=applyAutomaticClosings(recovered,'2026-11-11T11:05:00Z');assert.equal(known.state.shifts[0].staffName,'Original Owner');assert.equal(known.state.shifts[0].performedBy,'Original Owner');assert.equal(known.state.business.ownerName,'New Owner');
});
