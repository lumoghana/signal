import test from 'node:test';
import assert from 'node:assert/strict';
import {createBusiness,reduceBusiness} from '../dist/domain.js';
import {createReporting,renderReport,csvRows,filterPayments} from '../dist/reporting.js';

const owner={role:'owner',userId:'original-owner-user'};
function ownedBusiness(){
 let state=createBusiness({name:'Owner Counter',ownerName:'Original Owner',phone:'0245550100',businessType:'sole-trader',destination:'Sandbox bank',verification:{identity:true,face:true},shop:{name:'Night Market',area:'Night Market',category:'Food & drinks',lat:5.6509,lng:-.1878}},{now:'2026-11-11T07:00:00Z'});
 const shopId=state.shops[0].id;
 const act=(type,payload,now,actor=owner)=>{const out=reduceBusiness(state,type,payload,actor,{now});state=out.state;return out.entity};
 const shift=act('START_SHIFT',{shopId},'2026-11-11T08:00:00Z');
 const request=act('CREATE_REQUEST',{shopId,amount:2500},'2026-11-11T08:01:00Z');
 const payment=act('PAY',{shopId,requestId:request.id,amount:2500,payer:'Test Student',attemptId:'owner-cashflow'},'2026-11-11T08:02:00Z',{role:'student'});
 act('END_SHIFT',{id:shift.id},'2026-11-11T09:00:00Z');
 return {state,shopId,shiftId:shift.id,payment};
}

test('an owner-operated sale appears in both operator selectors and selecting it exports its receipt without needing a refund',()=>{
 const {state,payment}=ownedBusiness();assert.equal(state.refunds.length,0);
 let exported;
 const reporting=createReporting({getState:()=>state,onExport:rows=>exported=rows});
 reporting.handleClick('reporting-activity-all');reporting.handleClick('reporting-report-all');
 for(const html of [reporting.renderActivity(),reporting.renderReport()])assert.match(html,new RegExp('<option value="'+payment.staffId+'"[^>]*>Original Owner</option>'));
 reporting.handleChange({dataset:{reporting:'activity'},name:'staffId',value:payment.staffId});
 assert.deepEqual(reporting.getFilteredPayments().map(row=>row.id),[payment.id]);
 reporting.handleClick('reporting-export-activity');assert.equal(exported.length,2);assert.equal(exported[1][3],'Original Owner');
 reporting.handleChange({dataset:{reporting:'report'},name:'staffId',value:payment.staffId});
 reporting.handleClick('reporting-export-report');assert.equal(exported.length,2);assert.equal(exported[1][3],'Original Owner');
});

test('ownership handover preserves the historical owner name on shifts, shift selector, cashflow and payment export',()=>{
 const {state,payment}=ownedBusiness();state.business.ownerName='Replacement Owner';
 const html=renderReport({state,filters:{period:'all'}});
 const section=html.slice(html.indexOf('<h2 class="panel-title">Shifts & handovers</h2>'),html.indexOf('<h2 class="panel-title">Needs attention now</h2>'));
 assert.match(section,/Original Owner/);assert.doesNotMatch(section,/Replacement Owner/);
 assert.match(html,new RegExp('<option value="'+state.shifts[0].id+'"[^>]*>Original Owner ·'));
 assert.equal(csvRows(filterPayments(state,{staffId:payment.staffId}),state)[1][3],'Original Owner');
});

test('a saved shift name is enough to preserve historical attribution when an older receipt has no name snapshot',()=>{
 const {state,payment}=ownedBusiness();state.business.ownerName='Replacement Owner';state.shifts[0].staffName='Original Owner';delete state.transactions[0].staffName;delete state.transactions[0].performedBy;
 const html=renderReport({state,filters:{period:'all'}});
 assert.match(html,new RegExp('<option value="'+payment.staffId+'"[^>]*>Original Owner</option>'));
 assert.equal(csvRows(state.transactions,state)[1][3],'Original Owner');
 const cashflow=html.slice(html.indexOf('<h2 class="panel-title">Cashier / operator cash flow</h2>'),html.indexOf('<h2 class="panel-title">Shifts & handovers</h2>'));assert.match(cashflow,/Original Owner/);assert.doesNotMatch(cashflow,/historical name unavailable/);
});

test('unknown legacy owner shift names remain explicit rather than being attributed to the new owner',()=>{
 const {state,shopId}=ownedBusiness();state.business.ownerName='Replacement Owner';state.transactions=[];state.refunds=[];
 const shift={id:'legacy-shift',shopId,staffId:'owner-long-gone',startedAt:'2026-11-11T08:00:00Z',endedAt:'2026-11-11T09:00:00Z',status:'closed',by:'user-long-gone',transactionIds:[],refundIds:[]};state.shifts=[shift];
 let html=renderReport({state,filters:{period:'all'}});
 assert.match(html,/<option value="owner-long-gone"[^>]*>Business owner \(historical name unavailable\)<\/option>/);
 assert.doesNotMatch(html,/Replacement Owner/);
 shift.by='Earlier Human Owner';html=renderReport({state,filters:{period:'all'}});assert.match(html,/Earlier Human Owner/);assert.doesNotMatch(html,/Replacement Owner/);
});

test('removed operators and shift-only operators remain selectable without exposing actors outside the assigned shop',()=>{
 const {state,shopId}=ownedBusiness();const second={...state.shops[0],id:'other-shop',name:'Pentagon'};state.shops.push(second);
 state.staff=[];state.transactions.push({...state.transactions[0],id:'retired-sale',reference:'RETIRED',staffId:'retired-staff',staffName:'Retired Operator',shiftId:null});
 state.transactions.push({...state.transactions[0],id:'other-sale',reference:'OTHER',shopId:second.id,staffId:'other-staff',staffName:'Other Shop Operator',shiftId:null});
 state.shifts.push({id:'shift-without-sale',shopId,staffId:'former-manager',staffName:'Former Manager',startedAt:'2026-11-11T10:00:00Z',status:'open'});
 const reporting=createReporting({getState:()=>state,getScope:()=>shopId,isOwner:()=>false});
 reporting.handleClick('reporting-activity-all');const activity=reporting.renderActivity(),report=reporting.renderReport();
 for(const html of [activity,report]){assert.match(html,/<option value="retired-staff"[^>]*>Retired Operator<\/option>/);assert.match(html,/<option value="former-manager"[^>]*>Former Manager<\/option>/);assert.doesNotMatch(html,/Other Shop Operator/)}
 reporting.handleChange({dataset:{reporting:'activity'},name:'staffId',value:'retired-staff'});assert.deepEqual(reporting.getFilteredPayments().map(row=>row.id),['retired-sale']);
});

test('a late shop allocation is selected by its booked shop day while original confirmation and allocation evidence stay visible and exported',()=>{
 const {state}=ownedBusiness();const payment=state.transactions[0];
 Object.assign(payment,{createdAt:'2026-11-10T01:00:00Z',confirmedAt:'2026-11-10T01:00:00Z',tradingDay:'2026-11-11',tradingCutoff:'03:00',priorPeriodAllocation:true,allocationReceiptTradingDay:'2026-11-09',assignedAt:'2026-11-11T09:00:00Z'});
 assert.deepEqual(filterPayments(state,{from:'2026-11-11',to:'2026-11-11'}).map(row=>row.id),[payment.id]);
 assert.equal(filterPayments(state,{from:'2026-11-09',to:'2026-11-09'}).length,0);
 const html=renderReport({state,filters:{from:'2026-11-11',to:'2026-11-11'}});assert.match(html,/Includes GH₵25\.00 in late shop allocations booked into this period/);
 let reportRows;const reporting=createReporting({getState:()=>state,onExport:rows=>reportRows=rows});reporting.handleClick('reporting-activity-all');
 assert.match(reporting.renderActivity(),/Late shop allocation · original shop day 2026-11-09/);
 for(const name of ['from','to'])reporting.handleChange({dataset:{reporting:'report'},name,value:'2026-11-11'});
 reporting.handleClick('reporting-export-report');
 const activityRows=csvRows([payment],state);
 for(const rows of [activityRows,reportRows]){
  assert.equal(rows[1][rows[0].indexOf('Collection adjustment')],'Late shop allocation');
  assert.equal(rows[1][rows[0].indexOf('Original shop trading day')],'2026-11-09');
  assert.equal(rows[1][rows[0].indexOf('Allocated at UTC')],'2026-11-11T09:00:00Z');
 }
 assert.equal(activityRows[1][activityRows[0].indexOf('Confirmed at UTC')],'2026-11-10T01:00:00Z');
 assert.equal(reportRows[1][reportRows[0].indexOf('Event timestamp UTC')],'2026-11-10T01:00:00Z');
});
