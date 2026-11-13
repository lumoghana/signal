import test from 'node:test';
import assert from 'node:assert/strict';
import {createBusiness,reduceBusiness,ledger} from '../dist/domain.js';

const now='2026-11-12T12:00:00.000Z';
const owner={role:'owner',userId:'owner'};
function setup(amount=30000){
 let state=createBusiness({name:'Refund policy kitchen',ownerName:'Test Owner',phone:'0245550101',businessType:'Sole trader',destination:'Sandbox Bank',verification:{identity:true,face:true},shop:{name:'Test counter',area:'Night Market',category:'Food',lat:5.65,lng:-.18}},{now});
 const shopId=state.shops[0].id;
 state.staff[0].authUserId='manager-one';
 state.staff.push({id:'manager-two',authUserId:'manager-two',name:'Second manager',role:'manager',active:true,shopId},{id:'cashier',authUserId:'cashier',name:'Cashier',role:'cashier',active:true,shopId});
 const manager={role:'manager',shopId,staffId:state.staff[0].id,userId:'manager-one'};
 const otherManager={role:'manager',shopId,staffId:'manager-two',userId:'manager-two'};
 const cashier={role:'cashier',shopId,staffId:'cashier',userId:'cashier'};
 const payment=reduceBusiness(state,'PAY',{shopId,amount,payer:'Test customer',staffId:'cashier'},{role:'student'},{now});
 return {state:payment.state,shopId,payment:payment.entity,manager,otherManager,cashier};
}
const apply=(state,type,payload,actor=owner)=>reduceBusiness(state,type,payload,actor,{now});
const payload=(payment,amount,attemptId)=>({transactionId:payment.id,amount,reason:'Customer return',attemptId});

test('splitting a GH₵300 return into three GH₵100 manager requests cannot bypass approval',()=>{
 let {state,payment,manager,otherManager}=setup();
 const first=apply(state,'REFUND',payload(payment,10000,'first'),manager);state=first.state;
 const second=apply(state,'REFUND',payload(payment,10000,'second'),otherManager);state=second.state;
 const third=apply(state,'REFUND',payload(payment,10000,'third'),manager);state=third.state;
 assert.deepEqual([first.entity.status,second.entity.status,third.entity.status],['paid','requested','requested']);
 assert.equal(ledger(state).balance,20000);assert.equal(ledger(state).reserved,20000);assert.equal(ledger(state).available,0);
 assert.throws(()=>apply(state,'REFUND',payload(payment,1,'over-cap'),manager),/amount remaining/);
 assert.equal(second.entity.requestedStaffId,'manager-two');assert.equal(second.entity.staffId,null);
 assert.equal(second.entity.sourceStaffId,'cashier');
 const approved=apply(state,'APPROVE_REFUND',{id:second.entity.id,approve:true},owner);state=approved.state;
 assert.equal(approved.entity.status,'paid');assert.equal(approved.entity.requestedStaffId,'manager-two');assert.equal(approved.entity.staffId,'owner-owner');
 const replay=apply(state,'REFUND',payload(payment,10000,'second'),otherManager);
 assert.equal(replay.changed,false);assert.equal(replay.entity.id,second.entity.id);assert.equal(replay.entity.status,'paid');assert.equal(replay.state.refunds.length,3);
 assert.equal(ledger(replay.state).balance,10000);
});

test('manager allowance includes owner-paid, cashier-requested and processing returns for the same payment',()=>{
 let {state,payment,manager,cashier}=setup();
 state=apply(state,'REFUND',payload(payment,6000,'owner-first'),owner).state;
 const pending=apply(state,'REFUND',payload(payment,3000,'cashier-pending'),cashier);state=pending.state;
 assert.equal(pending.entity.status,'requested');
 state.refunds.find(refund=>refund.id===pending.entity.id).status='processing';
 const exact=apply(state,'REFUND',payload(payment,1000,'manager-exact'),manager);state=exact.state;
 assert.equal(exact.entity.status,'paid','GH₵100 cumulative is within the manager allowance');
 const crossing=apply(state,'REFUND',payload(payment,1,'manager-crossing'),manager);
 assert.equal(crossing.entity.status,'requested');assert.equal(crossing.entity.paidAt,null);
});

test('rejected, failed and cancelled returns do not consume the manager allowance or original-payment cap',()=>{
 let {state,payment,manager,cashier}=setup(10000);
 const request=apply(state,'REFUND',payload(payment,10000,'cashier-rejected'),cashier);state=request.state;
 state=apply(state,'APPROVE_REFUND',{id:request.entity.id,approve:false},owner).state;
 state.refunds.push({...state.refunds[0],id:'failed-return',attemptId:'failed-return',status:'failed'}, {...state.refunds[0],id:'cancelled-return',attemptId:'cancelled-return',status:'cancelled'});
 const accepted=apply(state,'REFUND',payload(payment,10000,'manager-after-rejection'),manager);
 assert.equal(accepted.entity.status,'paid');assert.equal(ledger(accepted.state).balance,0);assert.equal(ledger(accepted.state).reserved,0);
 const rejectedReplay=apply(accepted.state,'REFUND',payload(payment,10000,'cashier-rejected'),cashier);
 assert.equal(rejectedReplay.changed,false);assert.equal(rejectedReplay.entity.status,'rejected');assert.equal(rejectedReplay.state.refunds.length,4);
});

test('the cumulative threshold is isolated to each original payment and owners retain direct approval',()=>{
 let {state,shopId,payment,manager,cashier}=setup(40000);
 state=apply(state,'REFUND',payload(payment,10000,'first-payment-return'),manager).state;
 const secondPayment=apply(state,'PAY',{shopId,amount:20000,payer:'Another customer'},{role:'student'});state=secondPayment.state;
 const secondReturn=apply(state,'REFUND',payload(secondPayment.entity,10000,'second-payment-return'),manager);state=secondReturn.state;
 assert.equal(secondReturn.entity.status,'paid');
 const cashierReturn=apply(state,'REFUND',payload(payment,100,'cashier-small'),cashier);state=cashierReturn.state;
 assert.equal(cashierReturn.entity.status,'requested','Cashiers always require approval even for small returns');
 const ownerReturn=apply(state,'REFUND',payload(payment,20000,'owner-large'),owner);
 assert.equal(ownerReturn.entity.status,'paid');assert.equal(ownerReturn.entity.staffId,'owner-owner');
 assert.throws(()=>apply(ownerReturn.state,'REFUND',payload(payment,10000,'over-remaining'),owner),/amount remaining/);
});
