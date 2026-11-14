import test from 'node:test';
import assert from 'node:assert/strict';
import {createBusiness,reduceBusiness} from '../dist/domain.js';
import {renderReport,reportExceptions,filterPayments,csvRows,createReporting,paymentTradingDay,refundTradingDay} from '../dist/reporting.js';

function business({cutoff='00:00',created='2026-11-10T06:00:00Z'}={}){
 let state=createBusiness({name:'Reporting Kitchen',ownerName:'Akua Owner',phone:'0245550100',businessType:'sole-trader',destination:'Sandbox',verification:{identity:true,face:true},shop:{name:'Reporting Counter',area:'Night Market',category:'Food',lat:5.65,lng:-.18,cutoff}},{now:created});
 const shopId=state.shops[0].id;
 state.staff=[{id:'cashier-a',name:'Cashier A',role:'cashier',shopId,active:true},{id:'manager-b',name:'Manager B',role:'manager',shopId,active:true}];
 return {shopId,get state(){return state},act(type,payload={},actor={role:'owner',userId:'owner-user'},now='2026-11-11T12:00:00Z',options={}){const result=reduceBusiness(state,type,payload,actor,{now,...options});state=result.state;return result.entity}};
}
const stats=html=>Object.fromEntries([...html.matchAll(/<div class="stat-label">([^<]+)<\/div><div class="stat-value">value:([^<]+)/g)].map(match=>[match[1],Number(match[2])]));
function report(state,filters){return renderReport({state,filters,formatMoney:value=>'value:'+value})}

test('actual automatic domain closing is archived on its canonical businessDay and missed-close alerts use that day',()=>{
 const b=business({cutoff:'04:00'});
 b.act('PAY',{shopId:b.shopId,amount:1000,status:'paid',payer:'Student'},{role:'student'},'2026-11-10T10:00:00Z');
 const close=b.act('CLOSE_DAY',{shopId:b.shopId},{role:'owner'},'2026-11-11T04:00:00Z',{automatic:true});
 assert.equal(close.businessDay,'2026-11-10');assert.equal(close.businessDate,undefined);
 const correct=report(b.state,{from:'2026-11-10',to:'2026-11-10'}),next=report(b.state,{from:'2026-11-11',to:'2026-11-11'});
 assert.match(correct,/Archived closings<\/h2><span class="badge neutral">1 reports/);
 assert.match(correct,/Trading day 2026-11-10/);
 assert.match(next,/Archived closings<\/h2><span class="badge neutral">0 reports/);
 assert.equal(reportExceptions(b.state,null,Date.parse('2026-11-12T08:00:00Z')).lateClose.length,1);
});

test('changing a cutoff cannot move recorded payments, refunds or legacy closing membership into another report day',()=>{
 const b=business(),payment=b.act('PAY',{shopId:b.shopId,amount:10000,status:'paid',payer:'Student'},{role:'student'},'2026-11-11T02:00:00Z');
 const refund=b.act('REFUND',{transactionId:payment.id,amount:2000,reason:'Return'},{role:'owner',userId:'owner-user'},'2026-11-11T02:30:00Z');
 b.act('CLOSE_DAY',{shopId:b.shopId},{role:'owner'},'2026-11-11T03:00:00Z');
 b.act('UPDATE_SHOP',{id:b.shopId,cutoff:'04:00'},{role:'owner'},'2026-11-11T05:00:00Z');
 assert.equal(paymentTradingDay(b.state,b.state.transactions.find(row=>row.id===payment.id)),'2026-11-11');
 assert.equal(refundTradingDay(b.state,b.state.refunds.find(row=>row.id===refund.id)),'2026-11-11');
 assert.deepEqual(stats(report(b.state,{from:'2026-11-11',to:'2026-11-11'})),{'Confirmed collections':10000,'Completed refunds':2000,'Net collections':8000});
 assert.equal(filterPayments(b.state,{from:'2026-11-10',to:'2026-11-10'}).length,0);
 const legacy=structuredClone(b.state);for(const payment of legacy.transactions){delete payment.tradingDay;delete payment.tradingCutoff}for(const refund of legacy.refunds){delete refund.tradingDay;delete refund.tradingCutoff}
 assert.equal(paymentTradingDay(legacy,legacy.transactions[0]),'2026-11-11');
 assert.equal(refundTradingDay(legacy,legacy.refunds[0]),'2026-11-11');
 const rows=csvRows(filterPayments(legacy,{from:'2026-11-11',to:'2026-11-11'}),legacy);
 assert.equal(rows[1][rows[0].indexOf('Trading day Ghana')],'2026-11-11');
});

test('performing refund shift and operator reports reconcile to the actual saved handovers, with original-sale attribution exported separately',()=>{
 const b=business(),a={role:'cashier',staffId:'cashier-a',shopId:b.shopId},manager={role:'manager',staffId:'manager-b',shopId:b.shopId};
 const shiftA=b.act('START_SHIFT',{shopId:b.shopId},a,'2026-11-11T08:00:00Z');
 const payment=b.act('PAY',{shopId:b.shopId,staffId:'cashier-a',amount:10000,status:'paid',payer:'Student'},{role:'student'},'2026-11-11T09:00:00Z');
 b.act('END_SHIFT',{id:shiftA.id},a,'2026-11-11T10:00:00Z');
 const shiftB=b.act('START_SHIFT',{shopId:b.shopId},manager,'2026-11-11T10:10:00Z');
 b.act('REFUND',{transactionId:payment.id,amount:2000,reason:'Returned item'},manager,'2026-11-11T10:20:00Z');
 b.act('END_SHIFT',{id:shiftB.id},manager,'2026-11-11T11:00:00Z');
 const filters={from:'2026-11-11',to:'2026-11-11'};
 for(const id of [shiftA.id,shiftB.id]){const shift=b.state.shifts.find(row=>row.id===id),summary=stats(report(b.state,{...filters,shiftId:id}));assert.equal(summary['Confirmed collections'],shift.gross);assert.equal(summary['Completed refunds'],shift.refunds);assert.equal(summary['Net collections'],shift.net)}
 assert.equal(stats(report(b.state,{...filters,staffId:'manager-b'}))['Net collections'],-2000);
 let exported;const controller=createReporting({getState:()=>b.state,onExport:rows=>{exported=rows}});
 for(const [name,value] of Object.entries({...filters,shiftId:shiftB.id}))controller.handleChange({dataset:{reporting:'report'},name,value});
 controller.handleClick('reporting-export-report');
 const returned=exported.find(row=>row[0]==='Completed refund');assert.ok(returned);assert.equal(returned[exported[0].indexOf('Performed by')],'Manager B');assert.equal(returned[exported[0].indexOf('Performing shift')],shiftB.id);assert.equal(returned[exported[0].indexOf('Original sale cashier')],'Cashier A');assert.equal(returned[exported[0].indexOf('Original sale shift')],shiftA.id);
});

test('owner approval after a requester shift closed is reported as owner cash flow on the return day',()=>{
 const b=business(),a={role:'cashier',staffId:'cashier-a',shopId:b.shopId};
 const shift=b.act('START_SHIFT',{shopId:b.shopId},a,'2026-11-11T08:00:00Z');
 const payment=b.act('PAY',{shopId:b.shopId,staffId:'cashier-a',amount:10000,status:'paid',payer:'Student'},{role:'student'},'2026-11-11T09:00:00Z');
 const requested=b.act('REFUND',{transactionId:payment.id,amount:2000,reason:'Needs approval'},a,'2026-11-11T09:30:00Z');
 b.act('END_SHIFT',{id:shift.id},a,'2026-11-11T10:00:00Z');
 const approved=b.act('APPROVE_REFUND',{id:requested.id,approve:true},{role:'owner',userId:'owner-user'},'2026-11-12T09:00:00Z');
 assert.equal(approved.staffId,'owner-owner-user');assert.equal(approved.requestedStaffId,'cashier-a');assert.equal(approved.shiftId,null);
 const returned=report(b.state,{from:'2026-11-12',to:'2026-11-12',staffId:'owner-owner-user'});
 assert.equal(stats(returned)['Net collections'],-2000);assert.match(returned,/Akua Owner/);
 assert.equal(stats(report(b.state,{from:'2026-11-11',to:'2026-11-12',shiftId:shift.id}))['Net collections'],10000);
});

test('an explicit unassigned refund shift overrides stale legacy handover membership while an absent field retains legitimate fallback',()=>{
 const b=business(),a={role:'cashier',staffId:'cashier-a',shopId:b.shopId};
 const shift=b.act('START_SHIFT',{shopId:b.shopId},a,'2026-11-11T08:00:00Z');
 const payment=b.act('PAY',{shopId:b.shopId,staffId:'cashier-a',amount:10000,status:'paid',payer:'Student'},{role:'student'},'2026-11-11T09:00:00Z');
 b.act('END_SHIFT',{id:shift.id},a,'2026-11-11T10:00:00Z');
 const refund=b.act('REFUND',{transactionId:payment.id,amount:2000,reason:'Owner return'},{role:'owner',userId:'owner-user'},'2026-11-11T11:00:00Z');
 assert.equal(refund.shiftId,null);
 const legacy=structuredClone(b.state);legacy.shifts.find(row=>row.id===shift.id).refundIds.push(refund.id);
 const filters={from:'2026-11-11',to:'2026-11-11'};
 assert.equal(stats(report(legacy,{...filters,shiftId:shift.id}))['Completed refunds'],0);
 assert.equal(stats(report(legacy,{...filters,shiftId:'unassigned'}))['Completed refunds'],2000);
 let exported;const controller=createReporting({getState:()=>legacy,onExport:rows=>{exported=rows}});
 for(const [name,value] of Object.entries(filters))controller.handleChange({dataset:{reporting:'report'},name,value});controller.handleClick('reporting-export-report');
 const returned=exported.find(row=>row[0]==='Completed refund');assert.equal(returned[exported[0].indexOf('Performing shift')],'Unassigned');assert.equal(returned[exported[0].indexOf('Original sale shift')],shift.id);
 const missing=structuredClone(legacy);delete missing.transactions.find(row=>row.id===payment.id).shiftId;
 assert.equal(filterPayments(missing,{...filters,shiftId:shift.id}).length,1);
});
