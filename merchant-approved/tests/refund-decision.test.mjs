import test from 'node:test';
import assert from 'node:assert/strict';
import {createBusiness,reduceBusiness,ledger} from '../dist/domain.js';

const owner={role:'owner',userId:'refund-owner'};
const at='2026-11-11T12:00:00.000Z';
function requestedRefund(){
 let state=createBusiness({name:'Refund Decision Counter',ownerName:'Test Owner',phone:'0245550100',businessType:'sole-trader',destination:'Sandbox destination',verification:{identity:true,face:true},shop:{name:'Night Market',area:'Night Market',category:'Food & drinks',lat:5.6509,lng:-.1878}},{now:at});
 const shopId=state.shops[0].id;
 state.staff.push({id:'decision-cashier',role:'cashier',name:'Test Cashier',active:true,shopId});
 const cashier={role:'cashier',shopId,staffId:'decision-cashier'};
 const paid=reduceBusiness(state,'PAY',{shopId,amount:5000,payer:'Test Student',attemptId:'decision-payment'},{role:'student'},{now:at});state=paid.state;
 const request=reduceBusiness(state,'REFUND',{transactionId:paid.entity.id,amount:1000,reason:'Customer request',attemptId:'decision-refund'},cashier,{now:at});
 return {state:request.state,id:request.entity.id,cashier};
}

test('refund approval rejects non-boolean decisions atomically, including a textual false',()=>{
 const {state,id,cashier}=requestedRefund(),before=structuredClone(state),beforeLedger=ledger(state);
 for(const approve of ['false','true',0,1,null,undefined,{},[],new Boolean(false)]){
  assert.throws(()=>reduceBusiness(state,'APPROVE_REFUND',{id,approve},owner,{now:at}),/decision must be true or false/);
  assert.deepEqual(state,before);assert.deepEqual(ledger(state),beforeLedger);
 }
 assert.throws(()=>reduceBusiness(state,'APPROVE_REFUND',{id},owner,{now:at}),/decision must be true or false/);
 assert.throws(()=>reduceBusiness(state,'APPROVE_REFUND',{id,approve:'false'},cashier,{now:at}),/owner/i,'Owner authorization must run before decision validation');
 assert.equal(state.refunds[0].status,'requested');assert.equal(ledger(state).balance,5000);assert.equal(ledger(state).refunded,0);assert.equal(ledger(state).reserved,1000);
});

test('a boolean false declines and releases the refund reservation without debiting funds',()=>{
 const {state,id}=requestedRefund();
 const declined=reduceBusiness(state,'APPROVE_REFUND',{id,approve:false},owner,{now:at});
 assert.equal(declined.entity.status,'rejected');assert.equal(declined.entity.paidAt,null);
 assert.equal(ledger(declined.state).balance,5000);assert.equal(ledger(declined.state).available,5000);assert.equal(ledger(declined.state).refunded,0);assert.equal(ledger(declined.state).reserved,0);
 const repeated=reduceBusiness(declined.state,'APPROVE_REFUND',{id,approve:false},owner,{now:at});assert.equal(repeated.changed,false);assert.deepEqual(ledger(repeated.state),ledger(declined.state));
});

test('a boolean true pays the refund once and cannot be replayed with a coerced decision',()=>{
 const {state,id}=requestedRefund();
 const paid=reduceBusiness(state,'APPROVE_REFUND',{id,approve:true},owner,{now:at});
 assert.equal(paid.entity.status,'paid');assert.equal(paid.entity.paidAt,at);assert.equal(ledger(paid.state).balance,4000);assert.equal(ledger(paid.state).refunded,1000);assert.equal(ledger(paid.state).reserved,0);
 const repeated=reduceBusiness(paid.state,'APPROVE_REFUND',{id,approve:true},owner,{now:at});assert.equal(repeated.changed,false);assert.deepEqual(ledger(repeated.state),ledger(paid.state));
 assert.throws(()=>reduceBusiness(paid.state,'APPROVE_REFUND',{id,approve:'false'},owner,{now:at}),/decision must be true or false/);
 assert.deepEqual(ledger(paid.state),ledger(repeated.state));
});
