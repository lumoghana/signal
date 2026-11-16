import test from 'node:test';
import assert from 'node:assert/strict';
import {filterPayments,paymentDate,paymentTradingDay,refundDate,paginate,csvRows,createReporting,renderReport,reportExceptions,validateDateRange} from '../dist/reporting.js';

const state={business:{cutoff:'00:00'},shops:[{id:'a',name:'Night Market'},{id:'b',name:'Pentagon'}],staff:[{id:'kojo',name:'Kojo',shopId:'a'},{id:'ama',name:'Ama',shopIds:['a','b']}],shifts:[{id:'shift-a',shopId:'a',staffId:'kojo',startedAt:'2026-11-11T08:00:00Z',status:'open'}],transactions:[
 {id:'late',reference:'LM1',shopId:'a',staffId:'kojo',shiftId:'shift-a',payer:'Student One',amount:1000,status:'paid',createdAt:'2026-11-10T23:59:00Z',confirmedAt:'2026-11-11T00:02:00Z',method:'qr'},
 {id:'old',reference:'LM2',shopId:'a',staffId:'ama',payer:'Student Two',amount:2000,status:'paid',createdAt:'2026-11-10T11:00:00Z'},
 {id:'pending',reference:'LM3',shopId:'b',staffId:'ama',payer:'Student Three',amount:3000,status:'processing',createdAt:'2026-11-11T09:00:00Z'},
 {id:'unassigned',reference:'LM4',shopId:'a',payer:'Student Four',amount:2500,status:'paid',createdAt:'2026-11-11T10:00:00Z'}
],refunds:[{id:'r',transactionId:'old',shopId:'a',amount:500,status:'paid',createdAt:'2026-11-10T12:00:00Z',approvedAt:'2026-11-11T09:00:00Z'}],closings:[]};
test('confirmed receipt filters use the confirmation date and processing uses request date',()=>{
 const selected=filterPayments(state,{from:'2026-11-11',to:'2026-11-11'});
 assert.deepEqual(selected.map(row=>row.id),['unassigned','pending','late']);
 assert.equal(paymentDate(state.transactions[0]),'2026-11-11T00:02:00Z');
 assert.equal(filterPayments(state,{from:'2026-11-10',to:'2026-11-10'}).length,1);
});
test('combined shop, cashier, shift, status and search filters cannot widen the selection',()=>{
 const selected=filterPayments(state,{shopId:'a',staffId:'kojo',shiftId:'shift-a',status:'paid',search:'10.00',from:'2026-11-11',to:'2026-11-11'});
 assert.deepEqual(selected.map(row=>row.id),['late']);
 assert.equal(filterPayments(state,{shopId:'b',staffId:'kojo'}).length,0);
 assert.deepEqual(filterPayments(state,{staffId:'unattributed'}).map(row=>row.id),['unassigned']);
});
test('pagination exposes all matching receipts and clamps stale page numbers',()=>{
 const rows=Array.from({length:151},(_,id)=>({id}));
 assert.equal(paginate(rows,1,25).items.length,25);
 assert.equal(paginate(rows,7,25).items[0].id,150);
 assert.equal(paginate(rows,99,25).page,7);
 assert.deepEqual(paginate([],99,25),{items:[],page:1,pageSize:25,pageCount:1,total:0,from:0,to:0});
});
test('activity export exactly matches filters across every page',()=>{
 const many={...state,transactions:Array.from({length:151},(_,i)=>({...state.transactions[0],id:'t'+i,reference:'R'+i}))};
 let captured;
 const reporting=createReporting({getState:()=>many,onExport:(rows,name)=>{captured={rows,name}}});
 reporting.handleClick('reporting-activity-all');
 reporting.handleChange({dataset:{reporting:'activity'},name:'staffId',value:'kojo'});
 reporting.handleClick('reporting-next');
 assert.match(reporting.renderActivity(),/26–50 of 151/);
 reporting.handleClick('reporting-export-activity');
 assert.equal(captured.rows.length,152);
 assert.equal(captured.name,'lumo-filtered-payments.csv');
 const direct=csvRows(filterPayments(many,{staffId:'kojo'}),many);
 assert.deepEqual(captured.rows,direct);
});
test('completed refunds enter the date returned and report exports include those refunds',()=>{
 assert.equal(refundDate(state.refunds[0]),'2026-11-11T09:00:00Z');
 const html=renderReport({state,filters:{from:'2026-11-11',to:'2026-11-11'},formatMoney:value=>`money:${value}`});
 assert.match(html,/money:3500/);assert.match(html,/money:500/);assert.match(html,/money:3000/);
 let exported;
 const reporting=createReporting({getState:()=>state,onExport:rows=>{exported=rows}});
 for(const name of ['from','to'])reporting.handleChange({dataset:{reporting:'report'},name,value:'2026-11-11'});
 reporting.handleClick('reporting-export-report');
 assert.equal(exported.filter(row=>row[0]==='Completed refund').length,1);
 assert.equal(exported.find(row=>row[0]==='Completed refund')[4],'-5.00');
 const cashierHtml=renderReport({state,filters:{from:'2026-11-11',to:'2026-11-11',staffId:'ama'},formatMoney:value=>`money:${value}`});
 assert.doesNotMatch(cashierHtml,/money:-500/);
 const legacyHtml=renderReport({state,filters:{from:'2026-11-11',to:'2026-11-11',staffId:'unattributed'},formatMoney:value=>`money:${value}`});
 assert.match(legacyHtml,/money:2000/);
 assert.doesNotMatch(cashierHtml,/money:3500/);
});
test('invalid or inverted dates return a recoverable empty result and prevent export',()=>{
 assert.ok(validateDateRange('2026-11-12','2026-11-11'));
 assert.ok(validateDateRange('2026-02-30','2026-11-11'));
 assert.equal(filterPayments(state,{from:'2026-11-12',to:'2026-11-11'}).length,0);
 let called=false;
 const reporting=createReporting({getState:()=>state,onExport:()=>{called=true}});
 reporting.handleChange({dataset:{reporting:'activity'},name:'from',value:'2026-11-12'});
 reporting.handleChange({dataset:{reporting:'activity'},name:'to',value:'2026-11-11'});
 reporting.handleClick('reporting-export-activity');
 assert.equal(called,false);assert.match(reporting.renderActivity(),/start date must be on or before/);
});
test('merchant scope constrains a changed shop filter and row callbacks preserve receipt IDs',()=>{
 let opened;
 const reporting=createReporting({getState:()=>state,getScope:()=> 'a',isOwner:()=>false,onOpenTransaction:id=>{opened=id}});
 reporting.handleClick('reporting-activity-all');
 reporting.handleChange({dataset:{reporting:'activity'},name:'shopId',value:'b'});
 assert.equal(reporting.getFilteredPayments().some(payment=>payment.shopId==='b'),false);
 reporting.handleClick('reporting-payment',{dataset:{id:'late'}});assert.equal(opened,'late');
});
test('exception report distinguishes overdue closes, aged processing and active shifts',()=>{
 const exceptions=reportExceptions(state,null,Date.parse('2026-11-11T23:00:00Z'));
 assert.equal(exceptions.lateClose.length,1);
 assert.equal(exceptions.agedPending.length,1);
 assert.equal(exceptions.staleShifts.length,1);
 const scoped=reportExceptions(state,'a',Date.parse('2026-11-11T23:00:00Z'));
 assert.equal(scoped.agedPending.length,0);
});
test('an established zero-sales shop still needs a closing report and a newly created shop does not',()=>{
 const zero={business:{cutoff:'04:00',registeredAt:'2026-11-01T00:00:00Z'},shops:[{id:'old',name:'Old shop',open:true,createdAt:'2026-11-01T00:00:00Z'},{id:'new',name:'New shop',open:true,createdAt:'2026-11-11T08:00:00Z'}],transactions:[],closings:[]};
 const exceptions=reportExceptions(zero,null,Date.parse('2026-11-11T23:00:00Z'));
 assert.deepEqual(exceptions.lateClose.map(shop=>shop.id),['old']);
 zero.closings.push({id:'closed',shopId:'old',businessDate:'2026-11-10',createdAt:'2026-11-11T03:50:00Z'});
 assert.equal(reportExceptions(zero,null,Date.parse('2026-11-11T23:00:00Z')).lateClose.length,0);
});
test('Today follows each shop current trading day before midnight cutoffs and exports those same days',()=>{
 const network={business:{cutoff:'00:00'},shops:[{id:'a',name:'Night Market',cutoff:'04:00'},{id:'b',name:'Pentagon',cutoff:'00:00'}],transactions:[
  {id:'a-now',reference:'A',shopId:'a',status:'paid',amount:1000,createdAt:'2026-11-10T23:59:00Z',confirmedAt:'2026-11-11T01:00:00Z'},
  {id:'a-old',reference:'A-OLD',shopId:'a',status:'paid',amount:2000,createdAt:'2026-11-10T02:00:00Z'},
  {id:'b-now',reference:'B',shopId:'b',status:'paid',amount:3000,createdAt:'2026-11-11T00:30:00Z'},
  {id:'b-old',reference:'B-OLD',shopId:'b',status:'paid',amount:4000,createdAt:'2026-11-10T23:00:00Z'}
 ],refunds:[{id:'r',shopId:'a',transactionId:'a-now',amount:500,status:'paid',createdAt:'2026-11-10T23:50:00Z',approvedAt:'2026-11-11T01:30:00Z'}],staff:[],shifts:[],closings:[]};
 const now=Date.parse('2026-11-11T02:00:00Z'),selected=filterPayments(network,{period:'today',now});
 assert.deepEqual(selected.map(payment=>payment.id),['a-now','b-now']);
 assert.equal(paymentTradingDay(network,selected[0]),'2026-11-10');
 assert.equal(paymentTradingDay(network,selected[1]),'2026-11-11');
 assert.deepEqual(filterPayments(network,{from:'2026-11-10',to:'2026-11-10'}).map(payment=>payment.id),['a-now','b-old']);
 const html=renderReport({state:network,filters:{period:'today',now},formatMoney:value=>`money:${value}`});
 assert.match(html,/money:4000/);assert.match(html,/money:500/);assert.match(html,/money:3500/);
 const rows=csvRows(selected,network),dayIndex=rows[0].indexOf('Trading day Ghana');
 assert.equal(rows[1][dayIndex],'2026-11-10');assert.equal(rows[2][dayIndex],'2026-11-11');
});
