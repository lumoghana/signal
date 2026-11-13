import test from 'node:test';
import assert from 'node:assert/strict';
import {createBusiness,reduceBusiness} from '../dist/domain.js';
import {createOperations,operationExceptions} from '../dist/operations.js';
import {csvRows,renderReport,filterPayments} from '../dist/reporting.js';

function business(){return createBusiness({name:'Mobile Operations Review',ownerName:'Counter Owner',phone:'0245550100',businessType:'sole-trader',destination:'Test destination',verification:{identity:true,face:true},shop:{name:'Night Market',area:'Night Market',category:'Food',lat:5.65,lng:-.18}},{businessId:'mobile-business',shopId:'mobile-shop'})}
function harness(role='owner',userId='mobile-owner',sample=false){
 let state=business();
 const sid=state.shops[0].id;
 if(role!=='owner')state.staff.push({id:'mobile-cashier',name:'Counter Cashier',phone:'0245550101',role,shopId:sid,shopIds:[sid],active:true,authUserId:sample?undefined:userId});
 const actor={role,...(!sample?{userId}:{}),...(role!=='owner'?{staffId:'mobile-cashier',shopId:sid}:{})};
 const calls=[];
 const config={getState:()=>state,getSession:()=>sample?null:{...actor,shopIds:[sid]},getRole:()=>role,getShopId:()=>sid,getStaffId:()=>role==='owner'?'':'mobile-cashier',act:async(type,payload)=>{calls.push({type,payload});const result=reduceBusiness(state,type,payload,actor);state=result.state;return result.entity}};
 const controller=createOperations(config);
 return {controller,config,actor,sid,calls,get state(){return state},apply(type,payload,as=actor){const result=reduceBusiness(state,type,payload,as);state=result.state;return result.entity}};
}
function form(kind,values){return {dataset:{operationsForm:kind},values,querySelector(){return null}}}
async function withForms(task){const saved=globalThis.FormData;globalThis.FormData=class{constructor(value){this.values=value.values}*[Symbol.iterator](){yield* Object.entries(this.values)}};try{await task()}finally{globalThis.FormData=saved}}

test('refund exceptions open the owner approval queue rather than a payment listing',async()=>{
 const state=business();state.refunds=[{id:'refund-one',shopId:state.shops[0].id,status:'requested'}];
 assert.equal(operationExceptions(state).find(value=>value.type==='refund').action,'approvals');
 const calls=[];const owner=createOperations({getState:()=>state,getSession:()=>({role:'owner',userId:'owner'}),onApprovals:()=>calls.push('approvals'),onNavigate:page=>calls.push(page)});
 await owner.handleClick('ops-exception',{dataset:{kind:'approvals'}});
 assert.deepEqual(calls,['approvals']);
 const cashier=createOperations({getState:()=>state,getSession:()=>({role:'cashier',userId:'cashier',shopIds:[state.shops[0].id]}),onApprovals:()=>calls.push('unauthorized')});
 await cashier.handleClick('ops-exception',{dataset:{kind:'approvals'}});
 assert.deepEqual(calls,['approvals']);assert.match(cashier.render('shop-operations'),/Only the business owner/);
});

test('owner can start a canonical self-shift, retain a handover draft and end it through the controller',async()=>withForms(async()=>{
 const h=harness();
 assert.match(h.controller.render('shop-operations'),/Start my shift/);
 await h.controller.handleClick('ops-start-shift');
 assert.equal(h.state.shifts[0].staffId,'owner-mobile-owner');
 assert.match(h.controller.render('shop-operations'),/Your shift is open/);
 assert.match(h.controller.render('shop-operations'),/End my shift/);
 await h.controller.handleChange({name:'note',value:'Receiving phone checked; stock ready.'});
 h.apply('PAY',{shopId:h.sid,amount:1250,payer:'Test Student',status:'paid',method:'qr'},{role:'student'});
 assert.match(h.controller.render('shop-operations'),/Receiving phone checked; stock ready\./);
 await h.controller.handleSubmit(form('shift',{id:h.state.shifts[0].id,note:'Receiving phone checked; stock ready.'}));
 assert.equal(h.state.shifts[0].status,'closed');assert.equal(h.state.shifts[0].note,'Receiving phone checked; stock ready.');
 assert.equal(h.state.shifts[0].gross,0,'Static QR receipts stay at shop level while the owner shift is open');
 assert.match(h.controller.render('shop-operations'),/Start my shift/);
}));

test('sample owner self-shift uses the same business-based identity as the domain',async()=>withForms(async()=>{
 const h=harness('owner','',true);h.controller.render('shop-operations');await h.controller.handleClick('ops-start-shift');
 assert.equal(h.state.shifts[0].staffId,'owner-mobile-business');
 await h.controller.handleChange({name:'note',value:'Sample handover'});assert.match(h.controller.render('shop-operations'),/Sample handover/);
 await h.controller.handleSubmit(form('shift',{id:h.state.shifts[0].id,note:'Sample handover'}));assert.equal(h.state.shifts[0].status,'closed');
}));

test('sample staff shift uses explicit staff identity, not the first owner-derived roster entry',async()=>{
 const h=harness('cashier','',true);await h.controller.handleClick('ops-start-shift');
 assert.equal(h.state.shifts[0].staffId,'mobile-cashier');
 assert.match(h.controller.render('shop-operations'),/Your shift is open/);
 await h.controller.handleChange({name:'note',value:'Cashier own draft'});assert.match(h.controller.render('shop-operations'),/Cashier own draft/);
});

test('owner sees an existing shift in another shop instead of starting a second one',async()=>{
 const h=harness();const second=h.apply('ADD_SHOP',{name:'Pentagon',area:'Pentagon',category:'Food',lat:5.66,lng:-.18});
 h.apply('START_SHIFT',{shopId:second.id});
 const html=h.controller.render('shop-operations');assert.match(html,/Your shift is open at Pentagon/);assert.doesNotMatch(html,/data-action="ops-start-shift"/);
});

test('reports label static receipts at shop level and preserve dynamic owner shift attribution',()=>{
 const h=harness();h.apply('START_SHIFT',{shopId:h.sid});
 const staticPayment=h.apply('PAY',{shopId:h.sid,amount:1250,payer:'Shop QR Student',status:'paid',method:'qr'},{role:'student'});
 const request=h.apply('CREATE_REQUEST',{shopId:h.sid,amount:2500,description:'Owner checkout'});
 const dynamic=h.apply('PAY',{shopId:h.sid,requestId:request.id,amount:2500,payer:'Request Student',status:'paid',method:'qr'},{role:'student'});
 assert.equal(staticPayment.staffId,null);assert.equal(staticPayment.shiftId,null);assert.equal(dynamic.staffId,'owner-mobile-owner');assert.equal(dynamic.shiftId,h.state.shifts[0].id);
 const rows=csvRows([staticPayment,dynamic],h.state);assert.equal(rows[1][3],'Shop-level receipt · no cashier assigned');assert.equal(rows[1][4],'Unassigned');assert.equal(rows[2][3],'Counter Owner');assert.equal(rows[2][4],h.state.shifts[0].id);
 const report=renderReport({state:h.state,filters:{period:'all'}});assert.match(report,/Shop-level activity · no cashier assigned/);assert.match(report,/Static shop QR receipts stay at shop level/);
 assert.equal(filterPayments(h.state,{period:'all',staffId:'unattributed'}).length,1,'Existing unattributed filter identifiers remain compatible');
});
