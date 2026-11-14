import test from 'node:test';
import assert from 'node:assert/strict';
import {readNetwork} from '../server/network.js';
import {harness,setup,action,unlock} from './cashier-fixture.mjs';
test('counter approval replaces owner access with a locked scoped session, stores salted PINs, and permits only cashier collections',async()=>{
 const h=harness();try{const {owner,phone,staff,shop,paired}=await setup(h);assert.equal(paired.data.session.role,'cashier');assert.equal(paired.data.counter.locked,true);assert.equal(paired.data.state.business.name,'Campus Kitchen');assert.deepEqual(paired.data.state.transactions,[]);assert.equal(paired.data.counter.shopName,'Night Market');assert.deepEqual(paired.data.sessions,[]);assert.equal(paired.data.metrics,null);
 assert.equal((await action(phone,'CREATE_REQUEST',{shopId:shop.id,amount:500})).data.code,'COUNTER_LOCKED');
 assert.equal((await phone.call('/api/counter/pin',{userId:staff[0].id,pin:'963852'})).status,403);
 const opened=await unlock(phone,staff[0]);assert.equal(opened.status,200);assert.equal(opened.data.session.userId,staff[0].id);assert.equal(opened.data.counter.staffId,staff[0].staffId);assert.ok(opened.data.counter.shiftId);assert.equal(opened.data.state.business.accountNumber,'');assert.deepEqual(opened.data.state.closings,[]);assert.deepEqual(opened.data.state.settlements,[]);assert.equal(opened.data.state.counterDevices,undefined);
 for(const type of ['SETTLE','APPROVE_REFUND','UPDATE_BUSINESS','UPDATE_SHOP','CLOSE_DAY','ADD_STAFF'])assert.equal((await action(phone,type,{shopId:shop.id,attemptId:'forbidden-'+type,approve:true})).status,403,type);
 assert.equal((await phone.call('/api/invitations',{name:'Hijack'})).data.code,'COUNTER_ONLY');
 assert.equal((await owner.call('/api/session')).data.session.role,'owner');
 const {state}=await readNetwork(h.env);assert.ok(state.users.find(u=>u.id===staff[0].id).cashierPin.hash);assert.doesNotMatch(JSON.stringify(opened.data),/"cashierPin"|"tokenHash"|"salt"|"recoveryHash"|"stepUpHash"/);assert.equal(state.users.some(u=>u.cashierPin?.pin),false);
 }finally{h.close()}
});

test('shared handover preserves pending requests and late receipt attribution without resetting the shop day or money',async()=>{
 const h=harness();try{const {owner,phone,staff,shop,student,counter}=await setup(h);await unlock(phone,staff[0]);
 const a=(await action(phone,'CREATE_REQUEST',{shopId:shop.id,amount:2500,attemptId:'ama-request'})).data.entity;assert.equal(a.counterId,counter.id);assert.equal(a.staffId,staff[0].staffId);assert.ok(a.shiftId);
 const locked=await phone.call('/api/counter/lock',{endShift:true,note:'Customer is still paying',counterStaffId:staff[0].staffId,counterShiftId:a.shiftId});assert.equal(locked.data.counter.locked,true);assert.deepEqual(locked.data.state.requests,[]);
 const bopen=await unlock(phone,staff[1]);assert.equal(bopen.status,200);assert.ok(bopen.data.state.requests.some(r=>r.id===a.id));
 const stale=await phone.call('/api/action',{type:'CREATE_REQUEST',payload:{shopId:shop.id,amount:2500,attemptId:'stale-old-cashier',counterStaffId:staff[0].staffId,counterShiftId:a.shiftId}});assert.equal(stale.status,409);assert.equal(stale.data.code,'COUNTER_OPERATOR_CHANGED');
 const staleHandover=await phone.call('/api/counter/lock',{endShift:true,counterStaffId:staff[0].staffId,counterShiftId:a.shiftId});assert.equal(staleHandover.data.code,'COUNTER_OPERATOR_CHANGED');assert.equal((await phone.call('/api/counter')).data.counter.staffId,staff[1].staffId);
 const help=await action(phone,'ADD_TICKET',{shopId:shop.id,subject:'Counter sound',message:'Please check this counter phone.'});assert.equal(help.status,200);
 const b=(await action(phone,'CREATE_REQUEST',{shopId:shop.id,amount:2500,attemptId:'kojo-request'})).data.entity;assert.notEqual(a.shiftId,b.shiftId);
 await student.call('/api/student/open',{name:'Test customer'});await student.call('/api/student/fund',{amount:10000,confirmSandbox:true});
 const payment=await student.call('/api/payments',{shopId:shop.id,testKey:shop.testAcceptanceToken,requestId:a.id,amount:2500,attemptId:'late-ama-payment'});assert.equal(payment.status,201);
 const visible=(await phone.call('/api/session')).data;assert.equal(visible.state.transactions.length,1);assert.equal(visible.state.transactions[0].requestId,a.id);assert.equal(visible.state.transactions[0].staffId,staff[0].staffId);assert.equal(visible.state.transactions[0].shiftId,a.shiftId);assert.equal(visible.state.requests.find(r=>r.id===b.id).status,'open');
 const ownerState=(await owner.call('/api/session')).data;assert.equal(ownerState.metrics.balance,2500);assert.equal(ownerState.state.closings.length,0);assert.equal(ownerState.state.shifts.find(s=>s.id===a.shiftId).status,'closed');
 const refund=await action(phone,'REFUND',{transactionId:visible.state.transactions[0].id,amount:500,reason:'Wrong item',attemptId:'receipt-refund'});assert.equal(refund.status,200);assert.equal(refund.data.entity.status,'requested');assert.equal((await owner.call('/api/session')).data.metrics.balance,2500);
 }finally{h.close()}
});

test('two counters with the same amount stay isolated and a static shop QR never completes a pending counter request',async()=>{
 const h=harness();try{const {owner,phone,staff,shop,student}=await setup(h);await unlock(phone,staff[0]);const first=(await action(phone,'CREATE_REQUEST',{shopId:shop.id,amount:1500,attemptId:'first-counter'})).data.entity;
 const creds=(await readNetwork(h.env)).state.users.find(u=>u.role==='owner');const second=h.client();await second.call('/api/auth/login',{username:creds.username,password:'OwnerTest12345'});await second.call('/api/counter/setup',{deviceId:'second-counter-phone',shopId:shop.id,label:'Till two',mode:'shared'});await unlock(second,staff[1]);const secondRequest=(await action(second,'CREATE_REQUEST',{shopId:shop.id,amount:1500,attemptId:'second-counter'})).data.entity;
 await student.call('/api/student/open',{name:'Static payer'});await student.call('/api/student/fund',{amount:5000,confirmSandbox:true});await student.call('/api/payments',{shopId:shop.id,testKey:shop.testAcceptanceToken,amount:1500,attemptId:'static-qr'});
 let view=(await phone.call('/api/session')).data;assert.equal(view.state.transactions.length,0);assert.equal(view.state.shopQRReceipts.length,1);assert.equal(view.state.shopQRReceipts[0].unattributed,true);assert.equal(view.state.shopQRReceipts[0].staffId,undefined);assert.equal(view.state.requests[0].id,first.id);assert.equal(view.state.requests[0].status,'open');assert.equal((await action(phone,'CANCEL_REQUEST',{id:secondRequest.id})).status,403);
 await student.call('/api/payments',{shopId:shop.id,testKey:shop.testAcceptanceToken,requestId:secondRequest.id,amount:1500,attemptId:'second-counter-paid'});view=(await phone.call('/api/session')).data;assert.equal(view.state.transactions.length,0);assert.equal((await second.call('/api/session')).data.state.transactions[0].requestId,secondRequest.id);assert.equal((await owner.call('/api/session')).data.metrics.balance,3000);
 }finally{h.close()}
});

test('PIN failures persist across rejected responses, dedicated phones restrict staff, and revocation blocks future access',async()=>{
 const h=harness();try{const {owner,phone,staff,counter}=await setup(h,'dedicated');assert.equal((await unlock(phone,staff[1])).status,403);
 for(let i=0;i<4;i++)assert.equal((await unlock(phone,staff[0],'999998')).status,403);
 assert.equal((await unlock(phone,staff[0])).data.code,'PIN_RATE_LIMITED');
 const revoked=await owner.call('/api/counter/revoke',{counterId:counter.id});assert.equal(revoked.status,200);assert.equal((await phone.call('/api/session')).data.session,null);assert.equal((await unlock(phone,staff[0])).status,403);
 }finally{h.close()}
});

test('suspended cashier and changed PIN immediately lock existing counters while receiving sound stays bound to current staff',async()=>{
 const h=harness();try{const {owner,phone,staff}=await setup(h);let unlocked=await unlock(phone,staff[0]);const device=unlocked.data.devices[0];assert.equal(device.userId,staff[0].id);assert.equal(device.sessionId,unlocked.data.session.id);assert.equal(device.sessionValid,true);assert.equal(device.soundReady,false);
 await owner.call('/api/users/'+staff[0].id,{active:false});assert.equal((await phone.call('/api/session')).data.counter.locked,true);assert.equal((await unlock(phone,staff[0])).status,403);
 await unlock(phone,staff[1]);await owner.call('/api/counter/pin',{userId:staff[1].id,pin:'963852'});assert.equal((await phone.call('/api/session')).data.counter.locked,true);assert.equal((await unlock(phone,staff[1])).status,403);unlocked=await unlock(phone,{...staff[1],pin:'963852'});assert.equal(unlocked.status,200);
 }finally{h.close()}
});





test('PIN guessing is limited across approved phones for the same cashier',async()=>{
 const h=harness();try{const {owner,phone,staff,shop}=await setup(h,'dedicated'),network=(await readNetwork(h.env)).state,ownerUser=network.users.find(u=>u.role==='owner'),second=h.client();await second.call('/api/auth/login',{username:ownerUser.username,password:'OwnerTest12345'});assert.equal((await second.call('/api/counter/setup',{deviceId:'second-guessing-phone',shopId:shop.id,label:'Other approved till',mode:'dedicated',staffUserId:staff[0].id})).status,200);
 for(let i=0;i<3;i++)assert.equal((await unlock(phone,staff[0],'888887')).status,403);for(let i=0;i<2;i++)assert.equal((await unlock(second,staff[0],'888887')).status,403);
 assert.equal((await unlock(second,staff[0])).data.code,'PIN_RATE_LIMITED');assert.equal((await unlock(phone,staff[0])).data.code,'PIN_RATE_LIMITED');assert.equal((await owner.call('/api/session')).data.session.role,'owner');
 }finally{h.close()}
});
