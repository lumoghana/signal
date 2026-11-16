import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createD1} from '../scripts/d1-adapter.mjs';
import {handleAPI} from '../server/api.js';
import {readNetwork} from '../server/network.js';

const signupPayload=(suffix='one')=>({
 name:'Campus Kitchen '+suffix,ownerName:'Akua Test '+suffix,phone:'0245550100',businessType:'sole-trader',destination:'Sandbox Bank · 123456',verification:{phone:true,identity:true,face:true},
 shop:{name:'Night Market '+suffix,area:'Night Market',category:'Food & drinks',lat:5.6509,lng:-0.1878},
 attemptId:crypto.randomUUID(),credentials:{username:'owner.'+suffix,password:'OwnerTest1234'}
});
function setup(){
 const DB=createD1();DB.exec(readFileSync(new URL('../drizzle/0000_shared_sandbox.sql',import.meta.url),'utf8'));DB.exec(readFileSync(new URL('../drizzle/0001_sharded_state.sql',import.meta.url),'utf8'));
 const env={DB};
 function client(){
  const cookies=new Map();
  return {
   async call(path,body,method=body===undefined?'GET':'POST'){
    const headers={'X-Lumo-Request':'1','Origin':'https://lumo.test','cf-connecting-ip':'test-'+crypto.randomUUID()};
    if(body!==undefined)headers['Content-Type']='application/json';
    if(cookies.size)headers.Cookie=[...cookies].map(([k,v])=>k+'='+v).join('; ');
    const res=await handleAPI(new Request('https://lumo.test'+path,{method,headers,...(body===undefined?{}:{body:JSON.stringify(body)})}),env);
    for(const cookie of res.headers.getSetCookie()){const pair=cookie.split(';')[0],i=pair.indexOf('=');cookies.set(pair.slice(0,i),pair.slice(i+1))}
    const data=await res.json();return {status:res.status,data,cookies:res.headers.getSetCookie()};
   }
  };
 }
 return {env,client,close:()=>DB.close()};
}

test('shared signup is atomic, uses global identifiers and never exposes credential hashes',async()=>{
 const t=setup();try{
  const a=t.client(),b=t.client(),first=await a.call('/api/signup',signupPayload('one')),second=await b.call('/api/signup',signupPayload('two'));
  assert.equal(first.status,201);assert.equal(second.status,201);assert.ok(first.data.recoveryKey.startsWith('LUMO-'));
  assert.notEqual(first.data.state.business.id,second.data.state.business.id);
  assert.notEqual(first.data.state.business.accountNumber,second.data.state.business.accountNumber);
  assert.notEqual(first.data.state.shops[0].code,second.data.state.shops[0].code);
  assert.doesNotMatch(JSON.stringify(first.data),/"password"|"tokenHash"|"recoveryHash"|"salt"/);
  assert.ok(first.cookies[0].includes('HttpOnly'));assert.ok(first.cookies[0].includes('Secure'));
  const duplicate=await b.call('/api/signup',signupPayload('one'));assert.equal(duplicate.status,400);
  const {state}=await readNetwork(t.env);assert.equal(Object.keys(state.businesses).length,2);
  const directory=await t.client().call('/api/directory');assert.equal(directory.data.shops.length,0,'new shops remain private until explicitly published');
 }finally{t.close()}
});

test('invitations work on another client and staff see only assigned shop data',async()=>{
 const t=setup();try{
  const owner=t.client(),staff=t.client(),other=t.client(),reg=await owner.call('/api/signup',signupPayload('access')),otherReg=await other.call('/api/signup',signupPayload('other'));
  const shopId=reg.data.state.shops[0].id,testKey=reg.data.state.shops[0].testAcceptanceToken;
  const invite=await owner.call('/api/invitations',{name:'Kojo Test',phone:'0555550101',role:'cashier',shopIds:[shopId]});assert.equal(invite.status,201);
  const token=invite.data.invitation.token,lookup=await staff.call('/api/invitations/'+token);assert.equal(lookup.status,200);assert.equal(lookup.data.invitation.name,'Kojo Test');
  const accepted=await staff.call('/api/invitations/accept',{token,username:'kojo.access',password:'CashierTest123'});assert.equal(accepted.status,201);assert.equal(accepted.data.session.role,'cashier');
  assert.equal(accepted.data.state.business.destination,undefined);assert.equal(accepted.data.state.openingBalance,0);
  assert.deepEqual(accepted.data.state.shops.map(s=>s.id),[shopId]);assert.equal(accepted.data.invitations.length,0);
  const forbidden=await staff.call('/api/action',{type:'UPDATE_BUSINESS',payload:{name:'Hijack'}});assert.equal(forbidden.status,400);
  const directPay=await staff.call('/api/action',{type:'PAY',payload:{shopId,amount:2000}});assert.equal(directPay.status,403);
  const cross=await staff.call('/api/action',{type:'CREATE_REQUEST',payload:{shopId:otherReg.data.state.shops[0].id,amount:1000}});assert.equal(cross.status,404);
  const id=accepted.data.user.id,suspend=await owner.call('/api/users/'+id,{active:false});assert.equal(suspend.status,200);
  const expired=await staff.call('/api/session');assert.equal(expired.data.session,null);
 }finally{t.close()}
});

test('concurrent shared payments preserve both receipts, debit once, and credit refunds to the same student wallet',async()=>{
 const t=setup();try{
  const owner=t.client(),student=t.client(),reg=await owner.call('/api/signup',signupPayload('money')),shopId=reg.data.state.shops[0].id,testKey=reg.data.state.shops[0].testAcceptanceToken;
  const opened=await student.call('/api/student/open',{name:'Campus Student'});assert.equal(opened.data.student.balance,0);
  const funding=await student.call('/api/student/fund',{amount:10000,confirmSandbox:true,attemptId:'fund-one'});assert.equal(funding.data.student.balance,10000);
  const repeatFunding=await student.call('/api/student/fund',{amount:10000,confirmSandbox:true,attemptId:'fund-one'});assert.equal(repeatFunding.data.student.balance,10000);
  const [a,b]=await Promise.all([
   student.call('/api/payments',{shopId,testKey,amount:1000,attemptId:'payment-a',method:'qr'}),
   student.call('/api/payments',{shopId,testKey,amount:2000,attemptId:'payment-b',method:'code'})
  ]);
  assert.equal(a.status,201);assert.equal(b.status,201);
  let view=await owner.call('/api/session');assert.equal(view.data.metrics.balance,3000);assert.equal(view.data.state.transactions.length,2);
  let wallet=await student.call('/api/student');assert.equal(wallet.data.student.balance,7000);
  const retry=await student.call('/api/payments',{shopId,testKey,amount:1000,attemptId:'payment-a',method:'qr'});assert.equal(retry.data.replayed,true);
  wallet=await student.call('/api/student');assert.equal(wallet.data.student.balance,7000);
  const refund=await owner.call('/api/action',{type:'REFUND',payload:{transactionId:a.data.payment.id,amount:1000,reason:'Test return',attemptId:'refund-one'}});
  assert.equal(refund.status,200);assert.equal(refund.data.entity.status,'paid');
  wallet=await student.call('/api/student');assert.equal(wallet.data.student.balance,8000);assert.equal(wallet.data.student.entries[0].type,'refund');
  view=await owner.call('/api/session');assert.equal(view.data.metrics.balance,2000);
  const close=await owner.call('/api/action',{type:'CLOSE_DAY',payload:{shopId}});assert.equal(close.status,200);assert.equal(close.data.metrics.balance,2000);assert.equal(close.data.metrics.currentNet,0);
 }finally{t.close()}
});

test('concurrent insufficient-fund payments cannot overdraw a student wallet',async()=>{
 const t=setup();try{
  const owner=t.client(),student=t.client(),reg=await owner.call('/api/signup',signupPayload('funds')),shopId=reg.data.state.shops[0].id,testKey=reg.data.state.shops[0].testAcceptanceToken;
  await student.call('/api/student/open',{name:'Student'});
  await student.call('/api/student/fund',{amount:1500,confirmSandbox:true});
  const results=await Promise.all([1,2].map(i=>student.call('/api/payments',{shopId,testKey,amount:1000,attemptId:'attempt-'+i})));
  assert.deepEqual(results.map(x=>x.status).sort(),[201,409]);
  const wallet=await student.call('/api/student');assert.equal(wallet.data.student.balance,500);
  const view=await owner.call('/api/session');assert.equal(view.data.metrics.balance,1000);assert.equal(view.data.state.transactions.length,1);
 }finally{t.close()}
});

test('payment requests resolve across clients and retried paid requests do not debit again',async()=>{
 const t=setup();try{
  const owner=t.client(),student=t.client(),reg=await owner.call('/api/signup',signupPayload('qr')),shopId=reg.data.state.shops[0].id,testKey=reg.data.state.shops[0].testAcceptanceToken;
  const created=await owner.call('/api/action',{type:'CREATE_REQUEST',payload:{shopId,amount:2500,description:'Lunch'}});assert.equal(created.status,200);
  const requestId=created.data.entity.id,quote=await student.call('/api/payments/quote?requestId='+requestId+'&testKey='+testKey);assert.equal(quote.data.request.amount,2500);assert.equal(quote.data.shop.id,shopId);
  await student.call('/api/student/open',{name:'Student'});await student.call('/api/student/fund',{amount:5000,confirmSandbox:true});
  const paid=await student.call('/api/payments',{shopId,testKey,requestId,amount:2500,attemptId:'request-pay'});assert.equal(paid.status,201);
  const retry=await student.call('/api/payments',{shopId,testKey,requestId,amount:2500,attemptId:'request-pay'});assert.equal(retry.data.replayed,true);
  const replay=await student.call('/api/payments',{shopId,testKey,requestId,amount:2500,attemptId:'another-attempt'});assert.equal(replay.status,409);
  const wallet=await student.call('/api/student');assert.equal(wallet.data.student.balance,2500);
 }finally{t.close()}
});

test('recovery requires the private key, invalidates sessions, and username recovery avoids public demo bypass',async()=>{
 const t=setup();try{
  const owner=t.client(),other=t.client(),reg=await owner.call('/api/signup',signupPayload('recover')),key=reg.data.recoveryKey;
  const challenge=await other.call('/api/auth/recovery/start',{username:'owner.recover'});assert.equal(challenge.data.method,'recovery-key');
  const wrong=await other.call('/api/auth/recovery/complete',{challengeId:challenge.data.challengeId,recoveryKey:'123456',newPassword:'RecoveredTest123'});assert.equal(wrong.status,403);
  const recovered=await other.call('/api/auth/recovery/complete',{challengeId:challenge.data.challengeId,recoveryKey:key,newPassword:'RecoveredTest123'});assert.equal(recovered.status,200);
  const revoked=await owner.call('/api/session');assert.equal(revoked.data.session,null);
  const previous=await other.call('/api/auth/login',{username:'owner.recover',password:'OwnerTest1234'});assert.equal(previous.status,401);
  const current=await other.call('/api/auth/login',{username:'owner.recover',password:'RecoveredTest123'});assert.equal(current.status,200);
  const named=await other.call('/api/auth/username',{phone:'0245550100',recoveryKey:key});assert.equal(named.data.username,'owner.recover');
  const repeat=await other.call('/api/auth/recovery/complete',{challengeId:challenge.data.challengeId,recoveryKey:key,newPassword:'RecoveredAgain123'});assert.equal(repeat.status,403);
 }finally{t.close()}
});

test('settlement and destination changes require a single-use current-password proof',async()=>{
 const t=setup();try{
  const owner=t.client(),reg=await owner.call('/api/signup',signupPayload('settle')),shopId=reg.data.state.shops[0].id,testKey=reg.data.state.shops[0].testAcceptanceToken;
  const simulated=await owner.call('/api/simulate',{shopId,amount:10000,payer:'Sandbox customer',status:'paid'});assert.equal(simulated.status,200);
  const blocked=await owner.call('/api/action',{type:'SETTLE',payload:{amount:2000,attemptId:'settlement-proof-one'}});assert.equal(blocked.status,403);assert.equal(blocked.data.code,'STEP_UP_REQUIRED');
  const proof=await owner.call('/api/auth/step-up',{currentPassword:'OwnerTest1234',purpose:'settlement'});assert.equal(proof.status,200);
  const settled=await owner.call('/api/action',{type:'SETTLE',payload:{amount:2000,attemptId:'settlement-proof-one'},stepUpProof:proof.data.proof});assert.equal(settled.status,200);
  const replay=await owner.call('/api/action',{type:'SETTLE',payload:{amount:2000,attemptId:'settlement-proof-one'},stepUpProof:proof.data.proof});assert.equal(replay.status,200);assert.equal(replay.data.replayed,true);assert.equal(replay.data.entity.id,settled.data.entity.id);
  const newPayout=await owner.call('/api/action',{type:'SETTLE',payload:{amount:2000,attemptId:'settlement-proof-two'},stepUpProof:proof.data.proof});assert.equal(newPayout.status,403);assert.equal(newPayout.data.code,'STEP_UP_REQUIRED');
 }finally{t.close()}
});

test('receiving phones enforce assignment, suspension and owner revocation',async()=>{
 const t=setup();try{
  const owner=t.client(),staff=t.client(),reg=await owner.call('/api/signup',signupPayload('phone')),shopId=reg.data.state.shops[0].id,testKey=reg.data.state.shops[0].testAcceptanceToken;
  const invite=await owner.call('/api/invitations',{name:'Cashier',phone:'0555550100',role:'cashier',shopIds:[shopId]});
  const join=await staff.call('/api/invitations/accept',{token:invite.data.invitation.token,username:'cashier.phone',password:'CashierTest123'});
  const paired=await staff.call('/api/devices',{deviceId:'test-phone',label:'Night Market receiving phone',shopId});assert.equal(paired.status,200);
  const tested=await staff.call('/api/devices/test-phone',{action:'test',soundReady:true});assert.ok(tested.data.device.testedAt);
  const revoked=await owner.call('/api/devices/test-phone',{action:'revoke'});assert.equal(revoked.data.device.enabled,false);
  const heartbeat=await staff.call('/api/devices/test-phone',{action:'heartbeat'});assert.equal(heartbeat.status,401);
  await owner.call('/api/users/'+join.data.user.id,{active:false});
  const pairAgain=await staff.call('/api/devices',{deviceId:'new-phone',label:'New phone',shopId});assert.equal(pairAgain.status,401);
 }finally{t.close()}
});

test('ownership handover changes roles, preserves business money and revokes both old sessions',async()=>{
 const t=setup();try{
  const owner=t.client(),staff=t.client(),reg=await owner.call('/api/signup',signupPayload('transfer')),shopId=reg.data.state.shops[0].id,testKey=reg.data.state.shops[0].testAcceptanceToken;
  const invite=await owner.call('/api/invitations',{name:'New Owner',phone:'0555550102',role:'manager',shopIds:[shopId]});
  const join=await staff.call('/api/invitations/accept',{token:invite.data.invitation.token,username:'new.owner',password:'NewOwnerTest123'});
  const result=await owner.call('/api/auth/transfer',{targetUserId:join.data.user.id,currentPassword:'OwnerTest1234',confirmation:'TRANSFER',acceptResponsibility:true});assert.equal(result.status,200);
  assert.equal((await staff.call('/api/session')).data.session,null);
  const newOwner=await staff.call('/api/login',{username:'new.owner',password:'NewOwnerTest123'});assert.equal(newOwner.data.session.role,'owner');
  const oldOwner=await owner.call('/api/login',{username:'owner.transfer',password:'OwnerTest1234'});assert.equal(oldOwner.data.session.role,'manager');assert.equal(oldOwner.data.state.business.destination,undefined);
 }finally{t.close()}
});

test('public writes require same-origin proof and errors do not expose raw internals',async()=>{
 const t=setup();try{
  const evil=await handleAPI(new Request('https://lumo.test/api/signup',{method:'POST',headers:{Origin:'https://evil.test','Content-Type':'application/json','X-Lumo-Request':'1'},body:JSON.stringify(signupPayload('evil'))}),t.env);assert.equal(evil.status,403);
  const missing=await handleAPI(new Request('https://lumo.test/api/signup',{method:'POST',headers:{'Content-Type':'application/json'},body:'{}'}),t.env);assert.equal(missing.status,403);
  const unknown=await t.client().call('/api/missing');assert.equal(unknown.status,404);
 }finally{t.close()}
});

test('authenticated legacy migration preserves history, is idempotent and keeps the shared account identity',async()=>{
 const t=setup();try{
  const source=t.client(),reg=await source.call('/api/signup',signupPayload('legacysource')),shopId=reg.data.state.shops[0].id,testKey=reg.data.state.shops[0].testAcceptanceToken;
  await source.call('/api/simulate',{shopId,amount:3456,payer:'Imported test customer',status:'paid'});
  const before=await source.call('/api/session'),snapshot=structuredClone(before.data.state);delete snapshot.shopReadiness;
  const target=t.client(),created=await target.call('/api/signup',signupPayload('migrated'));
  const payload={snapshot,currentPassword:'OwnerTest1234',attemptId:'import-once',confirmImport:true};
  const result=await target.call('/api/migrate',payload);
  assert.equal(result.status,200,JSON.stringify(result.data));assert.equal(result.data.metrics.balance,3456);assert.equal(result.data.state.transactions.length,1);
  assert.equal(result.data.state.business.accountNumber,created.data.state.business.accountNumber);
  assert.notEqual(result.data.state.shops[0].id,shopId);assert.notEqual(result.data.state.shops[0].code,before.data.state.shops[0].code);
  assert.equal(result.data.state.transactions[0].shopId,result.data.state.shops[0].id);
  const replay=await target.call('/api/migrate',payload);assert.equal(replay.data.replayed,true);assert.equal(replay.data.state.transactions.length,1);
 }finally{t.close()}
});

test('regenerating a private recovery key invalidates its predecessor and pending challenges',async()=>{
 const t=setup();try{
  const owner=t.client(),reg=await owner.call('/api/signup',signupPayload('rotate')),oldKey=reg.data.recoveryKey;
  const pending=await owner.call('/api/auth/recovery/start',{username:'owner.rotate'});
  const bad=await owner.call('/api/auth/recovery-key',{currentPassword:'WrongPassword123'});assert.equal(bad.status,403);
  const rotated=await owner.call('/api/auth/recovery-key',{currentPassword:'OwnerTest1234'});assert.equal(rotated.status,200);assert.notEqual(rotated.data.recoveryKey,oldKey);
  const old=await owner.call('/api/auth/username',{phone:'0245550100',recoveryKey:oldKey});assert.equal(old.status,403);
  const fresh=await owner.call('/api/auth/username',{phone:'0245550100',recoveryKey:rotated.data.recoveryKey});assert.equal(fresh.data.username,'owner.rotate');
  const stale=await owner.call('/api/auth/recovery/complete',{challengeId:pending.data.challengeId,recoveryKey:rotated.data.recoveryKey,newPassword:'RecoveredRotate123'});assert.equal(stale.status,403);
 }finally{t.close()}
});

test('failed sign-in attempts are rate limited even though their credential checks reject',async()=>{
 const t=setup();try{
  let result;
  for(let i=0;i<21;i++){
   const req=new Request('https://lumo.test/api/login',{method:'POST',headers:{Origin:'https://lumo.test','Content-Type':'application/json','X-Lumo-Request':'1','cf-connecting-ip':'same-test-address'},body:JSON.stringify({username:'unknown.user',password:'IncorrectTest123'})});
   result=await handleAPI(req,t.env);
  }
  assert.equal(result.status,429);
 }finally{t.close()}
});

test('a pending request blocks a second wallet debit until the merchant resolves it',async()=>{
 const t=setup();try{
  const owner=t.client(),student=t.client(),reg=await owner.call('/api/signup',signupPayload('pending')),shopId=reg.data.state.shops[0].id,testKey=reg.data.state.shops[0].testAcceptanceToken;
  const request=await owner.call('/api/action',{type:'CREATE_REQUEST',payload:{shopId,amount:1500,description:'Pending demo request'}});
  const requestId=request.data.entity.id;
  const pending=await owner.call('/api/simulate',{shopId,requestId,amount:1500,payer:'Demo customer',status:'processing'});assert.equal(pending.status,200);
  await student.call('/api/student/open',{name:'Student'});await student.call('/api/student/fund',{amount:3000,confirmSandbox:true});
  const paid=await student.call('/api/payments',{shopId,testKey,requestId,amount:1500,attemptId:'pending-duplicate'});assert.equal(paid.status,409);assert.equal(paid.data.code,'REQUEST_PROCESSING');
  assert.equal((await student.call('/api/student')).data.student.balance,3000);
  assert.equal((await owner.call('/api/session')).data.metrics.balance,0);
 }finally{t.close()}
});

test('a funding retry at the wallet cap returns the committed entry without reapplying the cap',async()=>{
 const t=setup();try{
  const student=t.client();await student.call('/api/student/open',{name:'Cap tester'});
  for(let i=0;i<10;i++){const fund=await student.call('/api/student/fund',{amount:100000,confirmSandbox:true,attemptId:'cap-'+i});assert.equal(fund.status,200)}
  const repeat=await student.call('/api/student/fund',{amount:100000,confirmSandbox:true,attemptId:'cap-9'});assert.equal(repeat.status,200);assert.equal(repeat.data.student.balance,1000000);
  const over=await student.call('/api/student/fund',{amount:1,confirmSandbox:true,attemptId:'cap-over'});assert.equal(over.status,400);
 }finally{t.close()}
});

test('a manager can update the second assigned shop without gaining access to unassigned shops',async()=>{
 const t=setup();try{
  const owner=t.client(),manager=t.client(),reg=await owner.call('/api/signup',signupPayload('multishop')),first=reg.data.state.shops[0].id;
  const second=await owner.call('/api/action',{type:'ADD_SHOP',payload:{name:'Pentagon Counter',area:'Pentagon',category:'Food & drinks',lat:5.6535,lng:-0.1845}});
  assert.equal(second.status,200);const secondId=second.data.entity.id;
  const third=await owner.call('/api/action',{type:'ADD_SHOP',payload:{name:'Akuafo Counter',area:'Akuafo',category:'Food & drinks',lat:5.649,lng:-0.1936}});const thirdId=third.data.entity.id;
  const invite=await owner.call('/api/invitations',{name:'Manager',phone:'0555550110',role:'manager',shopIds:[first,secondId]});
  await manager.call('/api/invitations/accept',{token:invite.data.invitation.token,username:'manager.multishop',password:'ManagerTest123'});
  const edited=await manager.call('/api/action',{type:'UPDATE_SHOP',payload:{id:secondId,accepting:false,hours:'4 pm – 2 am',cutoff:'03:00'}});
  assert.equal(edited.status,200);assert.equal(edited.data.state.shops.find(s=>s.id===secondId).accepting,false);assert.equal(edited.data.state.shops.find(s=>s.id===secondId).cutoff,'03:00');
  const blocked=await manager.call('/api/action',{type:'UPDATE_SHOP',payload:{id:thirdId,accepting:false}});assert.equal(blocked.status,403);
  assert.equal(edited.data.state.shops.length,2);
 }finally{t.close()}
});

test('partial refunds are idempotent across concurrent retries, reject changed payloads and replay the current approved result',async()=>{
 const t=setup();try{
  const owner=t.client(),cashier=t.client(),student=t.client(),reg=await owner.call('/api/signup',signupPayload('refundretry')),shopId=reg.data.state.shops[0].id,testKey=reg.data.state.shops[0].testAcceptanceToken;
  await student.call('/api/student/open',{name:'Refund tester'});await student.call('/api/student/fund',{amount:10000,confirmSandbox:true});
  const payment=await student.call('/api/payments',{shopId,testKey,amount:5000,attemptId:'sale'});
  const payload={type:'REFUND',payload:{transactionId:payment.data.payment.id,amount:1000,reason:'One partial refund',attemptId:'refund-stable'}};
  const [first,retry]=await Promise.all([owner.call('/api/action',payload),owner.call('/api/action',payload)]);
  assert.equal(first.status,200);assert.equal(retry.status,200);assert.equal(first.data.entity.id,retry.data.entity.id);
  assert.equal((await student.call('/api/student')).data.student.balance,6000);
  assert.equal((await owner.call('/api/session')).data.state.refunds.length,1);
  const changed=await owner.call('/api/action',{...payload,payload:{...payload.payload,amount:2000}});assert.equal(changed.status,409);
  const invite=await owner.call('/api/invitations',{name:'Cashier',phone:'0555550131',role:'cashier',shopIds:[shopId]});
  await cashier.call('/api/invitations/accept',{token:invite.data.invitation.token,username:'refund.cashier',password:'CashierTest123'});
  const requested={type:'REFUND',payload:{transactionId:payment.data.payment.id,amount:500,reason:'Cashier return',attemptId:'cashier-return'}};
  const request=await cashier.call('/api/action',requested);assert.equal(request.data.entity.status,'requested');
  await owner.call('/api/action',{type:'APPROVE_REFUND',payload:{id:request.data.entity.id,approve:true}});
  const afterApproval=await cashier.call('/api/action',requested);assert.equal(afterApproval.data.replayed,true);assert.equal(afterApproval.data.entity.status,'paid');assert.equal(afterApproval.data.entity.id,request.data.entity.id);
  assert.equal((await student.call('/api/student')).data.student.balance,6500);
 }finally{t.close()}
});

test('lost-phone revocation invalidates the bound session while ordinary mute leaves access intact',async()=>{
 const t=setup();try{
  const owner=t.client(),staff=t.client(),reg=await owner.call('/api/signup',signupPayload('lostphone')),shopId=reg.data.state.shops[0].id,testKey=reg.data.state.shops[0].testAcceptanceToken;
  const invite=await owner.call('/api/invitations',{name:'Cashier',phone:'0555550132',role:'cashier',shopIds:[shopId]});
  const joined=await staff.call('/api/invitations/accept',{token:invite.data.invitation.token,username:'lost.cashier',password:'CashierTest123'});
  const pair=await staff.call('/api/devices',{deviceId:'lost-phone-session',label:'Shop phone',shopId});assert.equal(pair.data.device.sessionId,joined.data.session.id);
  await staff.call('/api/devices/lost-phone-session',{action:'test',soundReady:true});
  const muted=await staff.call('/api/devices/lost-phone-session',{action:'disable'});assert.ok(muted.data.session);assert.equal(muted.data.device.soundReady,false);
  assert.ok((await staff.call('/api/session')).data.session);
  const revoked=await owner.call('/api/devices/lost-phone-session',{action:'revoke'});assert.equal(revoked.status,200);assert.ok(revoked.data.session,'owner revoking another phone stays signed in');
  assert.equal((await staff.call('/api/session')).data.session,null);
  const bypass=await staff.call('/api/devices',{deviceId:'new-id-same-cookie',label:'Attempted replacement',shopId});assert.equal(bypass.status,401);
  await owner.call('/api/devices',{deviceId:'owners-current-phone',label:'Owner phone',shopId});
  const own=await owner.call('/api/devices/owners-current-phone',{action:'revoke'});assert.equal(own.data.session,null,'revoking this sign-in clears its auth bundle immediately');
 }finally{t.close()}
});

test('quotes reject a suspended request creator and settlements cannot override the saved destination',async()=>{
 const t=setup();try{
  const owner=t.client(),staff=t.client(),student=t.client(),reg=await owner.call('/api/signup',signupPayload('quoteguard')),shopId=reg.data.state.shops[0].id,testKey=reg.data.state.shops[0].testAcceptanceToken;
  const invite=await owner.call('/api/invitations',{name:'Cashier',phone:'0555550133',role:'cashier',shopIds:[shopId]});
  const joined=await staff.call('/api/invitations/accept',{token:invite.data.invitation.token,username:'quote.cashier',password:'CashierTest123'});
  const qr=await staff.call('/api/action',{type:'CREATE_REQUEST',payload:{shopId,amount:1000}});
  assert.equal((await student.call('/api/payments/quote?requestId='+qr.data.entity.id+'&testKey='+testKey)).status,200);
  await owner.call('/api/users/'+joined.data.user.id,{active:false});
  const quote=await student.call('/api/payments/quote?requestId='+qr.data.entity.id+'&testKey='+testKey);assert.equal(quote.status,409);assert.equal(quote.data.code,'REQUEST_STAFF_CHANGED');
  await owner.call('/api/simulate',{shopId,amount:5000,payer:'Demo',status:'paid'});
  const proof=await owner.call('/api/auth/step-up',{currentPassword:'OwnerTest1234',purpose:'settlement'});
  const override=await owner.call('/api/action',{type:'SETTLE',payload:{amount:1000,destination:'Different target',attemptId:'saved-destination-check'},stepUpProof:proof.data.proof});
  assert.equal(override.status,403);assert.equal(override.data.code,'DESTINATION_MISMATCH');
  const valid=await owner.call('/api/action',{type:'SETTLE',payload:{amount:1000,attemptId:'saved-destination-check'},stepUpProof:proof.data.proof});assert.equal(valid.status,200);assert.equal(valid.data.entity.destination,reg.data.state.business.destination);
 }finally{t.close()}
});

test('publication is deliberate, requires a live tested receiver, and keeps closed published shops discoverable',async()=>{
 const t=setup();try{
  const owner=t.client(),visitor=t.client(),reg=await owner.call('/api/signup',signupPayload('publish')),shopId=reg.data.state.shops[0].id,testKey=reg.data.state.shops[0].testAcceptanceToken;
  assert.equal((await visitor.call('/api/directory')).data.shops.length,0);
  assert.equal((await visitor.call('/api/payments/quote?shopId='+shopId+'&testKey='+testKey)).status,200,'explicit unguessable test QR supports the first test payment');
  const early=await owner.call('/api/action',{type:'UPDATE_SHOP',payload:{id:shopId,published:true}});assert.equal(early.status,409);
  await owner.call('/api/action',{type:'UPDATE_ACTIVATION',payload:{shopId,locationConfirmed:true,qrReady:true,ownerOperated:true}});
  await owner.call('/api/devices',{deviceId:'publish-phone',label:'Counter phone',shopId});
  await owner.call('/api/devices/publish-phone',{action:'test',soundReady:true});
  const published=await owner.call('/api/action',{type:'UPDATE_SHOP',payload:{id:shopId,published:true}});assert.equal(published.status,200,JSON.stringify(published.data));assert.equal(published.data.state.transactions.length,0,'publishing is not blocked by the first-payment step');
  assert.equal(published.data.state.shopReadiness[0].phoneReady,true);
  await owner.call('/api/action',{type:'UPDATE_SHOP',payload:{id:shopId,open:false,accepting:false}});
  const closed=await visitor.call('/api/directory');assert.equal(closed.data.shops.length,1);assert.equal(closed.data.shops[0].open,false);assert.equal(closed.data.shops[0].accepting,false);
  assert.equal((await visitor.call('/api/payments/quote?shopId='+shopId)).status,409);
  await owner.call('/api/action',{type:'UPDATE_SHOP',payload:{id:shopId,published:false}});
  assert.equal((await visitor.call('/api/directory')).data.shops.length,0);
 }finally{t.close()}
});

test('signup uncertain retry returns one business and session without disclosing or invalidating the first recovery key',async()=>{
 const t=setup();try{
  const owner=t.client(),payload=signupPayload('signupretry'),first=await owner.call('/api/signup',payload);
  const second=await owner.call('/api/signup',payload);assert.equal(second.status,200);assert.equal(second.data.replayed,true);assert.equal(second.data.state.business.id,first.data.state.business.id);
  assert.equal(second.data.recoveryKey,undefined);assert.equal(second.data.recoveryKeyAvailable,false);
  const named=await owner.call('/api/auth/username',{phone:'0245550100',recoveryKey:first.data.recoveryKey});assert.equal(named.status,200,'first recovery key was not rotated by a harmless retry');
  const changed=await owner.call('/api/signup',{...payload,name:'Different business'});assert.equal(changed.status,409);
  const wrong=await owner.call('/api/signup',{...payload,credentials:{...payload.credentials,password:'WrongPassword123'}});assert.equal(wrong.status,409);
  assert.equal(Object.keys((await readNetwork(t.env)).state.businesses).length,1);
 }finally{t.close()}
});

test('migration rejects anonymous and arbitrary-field requests without consuming shared business capacity',async()=>{
 const t=setup();try{
  const anonymous=t.client(),base={snapshot:{openingBalance:0,business:{name:'Bad',ownerName:'Bad',phone:'0245550100',destination:'Sandbox'},shops:[{id:'legacy',name:'Counter',lat:5.65,lng:-.18}],extra:'x'.repeat(1000000)},attemptId:'malicious-import',currentPassword:'OwnerTest1234',confirmImport:true};
  assert.equal((await anonymous.call('/api/migrate',base)).status,401);
  const owner=t.client();await owner.call('/api/signup',signupPayload('strictimport'));
  const rejected=await owner.call('/api/migrate',base);assert.equal(rejected.status,400);assert.match(rejected.data.error,/unsupported/i);
  const state=(await readNetwork(t.env)).state;assert.equal(Object.keys(state.businesses).length,1);assert.ok(!JSON.stringify(state).includes('x'.repeat(1000)));
 }finally{t.close()}
});

test('legacy global storage migrates atomically, preserves its backup and active accounts',async()=>{
 const DB=createD1();await DB.exec(readFileSync(new URL('../drizzle/0000_shared_sandbox.sql',import.meta.url),'utf8'));await DB.exec(readFileSync(new URL('../drizzle/0001_sharded_state.sql',import.meta.url),'utf8'));
 const source=setup();try{
  const owner=source.client(),reg=await owner.call('/api/signup',signupPayload('oldstorage')),shopId=reg.data.state.shops[0].id,testKey=reg.data.state.shops[0].testAcceptanceToken;
  await owner.call('/api/simulate',{shopId,amount:3476,payer:'Preserved history',status:'paid'});
  const legacy=(await readNetwork(source.env)).state;
  await DB.prepare('INSERT INTO lumo_network (id, revision, document, updated_at) VALUES (?, ?, ?, ?)').bind('network',40,JSON.stringify(legacy),new Date().toISOString()).run();
  const migrated=await readNetwork({DB});assert.equal(migrated.revision,40);assert.equal(migrated.state.businesses[reg.data.state.business.id].transactions[0].amount,3476);
  assert.equal(migrated.state.users.length,1);assert.equal(migrated.state.sessions.length,1);
  const backup=await DB.prepare('SELECT document FROM lumo_network WHERE id = ?').bind('network').first();const saved=JSON.parse(backup.document);assert.equal(saved.version,2);assert.equal(saved._storageMigrated,'sharded-v2');assert.equal(Object.keys(saved.businesses).length,1);
  assert.ok((await DB.prepare('SELECT COUNT(*) AS count FROM lumo_records').first()).count>0);
  assert.equal((await DB.prepare('SELECT COUNT(*) AS count FROM lumo_commit_guard').first()).count,0);
 }finally{source.close();DB.close()}
});

test('a failed shard commit guard leaves wallet and merchant untouched before a safe retry',async()=>{
 const t=setup();try{
  const owner=t.client(),student=t.client(),reg=await owner.call('/api/signup',signupPayload('guard')),shopId=reg.data.state.shops[0].id,testKey=reg.data.state.shops[0].testAcceptanceToken;
  await student.call('/api/student/open',{name:'Guard tester'});await student.call('/api/student/fund',{amount:5000,confirmSandbox:true});
  const original=t.env.DB.batch;let injected=false,checked=false;
  t.env.DB.batch=async statements=>{
   if(!injected){injected=true;await t.env.DB.prepare('UPDATE lumo_records SET revision = revision + 1 WHERE id = ?').bind('wallet:'+Object.keys((await readNetwork(t.env)).state.wallets)[0]).run();const failed=await original(statements);assert.equal(failed[0].meta.changes,0);const state=(await readNetwork(t.env)).state;assert.equal(state.businesses[reg.data.state.business.id].transactions.length,0);assert.equal(Object.values(state.wallets)[0].balance,5000);checked=true;return failed}
   return original(statements);
  };
  const pay=await student.call('/api/payments',{shopId,testKey,amount:1000,attemptId:'guard-pay'});assert.equal(pay.status,201);assert.ok(checked);
  const after=(await readNetwork(t.env)).state;assert.equal(after.businesses[reg.data.state.business.id].transactions.length,1);assert.equal(Object.values(after.wallets)[0].balance,4000);
  assert.equal((await t.env.DB.prepare('SELECT COUNT(*) AS count FROM lumo_commit_guard').first()).count,0);
 }finally{t.close()}
});

test('independent merchant shards can exceed the former global ceiling without blocking another merchant payment',async()=>{
 const t=setup();try{
  const first=t.client(),second=t.client(),student=t.client(),a=await first.call('/api/signup',signupPayload('largeone')),b=await second.call('/api/signup',signupPayload('largetwo'));
  const {updateNetwork}=await import('../server/network.js');
  await updateNetwork(t.env,n=>{
   for(const id of [a.data.state.business.id,b.data.state.business.id])n.businesses[id].tickets=Array.from({length:1000},(_,i)=>({id:'ticket-'+id+'-'+i,subject:'Imported support history',message:'x'.repeat(900),status:'resolved',createdAt:new Date().toISOString(),shopId:n.businesses[id].shops[0].id}));
   return {};
  });
  const total=(await t.env.DB.prepare("SELECT SUM(length(document)) AS total FROM lumo_records WHERE kind = 'business'").first()).total;assert.ok(total>1800000);
  await student.call('/api/student/open',{name:'Isolation tester'});await student.call('/api/student/fund',{amount:5000,confirmSandbox:true});
  const pay=await student.call('/api/payments',{shopId:a.data.state.shops[0].id,testKey:a.data.state.shops[0].testAcceptanceToken,amount:1000,attemptId:'still-available'});assert.equal(pay.status,201);
  await assert.rejects(()=>updateNetwork(t.env,n=>{n.businesses[b.data.state.business.id].tickets[0].message='x'.repeat(1600000);return {}}),/allowance/);
  const again=await student.call('/api/payments',{shopId:a.data.state.shops[0].id,testKey:a.data.state.shops[0].testAcceptanceToken,amount:1000,attemptId:'still-isolated'});assert.equal(again.status,201);
 }finally{t.close()}
});

test('strict migration preserves canonical reconciliation, closed shifts and legacy trading dates with remapped payment links',async()=>{
 const t=setup();try{
  const {createBusiness,reduceBusiness}=await import('../dist/domain.js');let snapshot=createBusiness(signupPayload('canonical'));
  const shopId=snapshot.shops[0].id,actor={role:'owner',userId:'local-owner'};
  snapshot=reduceBusiness(snapshot,'START_SHIFT',{shopId},actor).state;
  snapshot=reduceBusiness(snapshot,'PAY',{shopId,amount:1000,payer:'First student'},{role:'student'}).state;
  snapshot=reduceBusiness(snapshot,'PAY',{shopId,amount:1000,payer:'Second student'},{role:'student'}).state;
  snapshot.transactions[1].reference=snapshot.transactions[0].reference;
  snapshot=reduceBusiness(snapshot,'SAVE_RECONCILIATION',{source:'Canonical statement',rows:[{reference:snapshot.transactions[0].reference,amount:1000},{reference:snapshot.transactions[0].id,amount:1000}]},actor).state;
  snapshot=reduceBusiness(snapshot,'END_SHIFT',{id:snapshot.shifts[0].id},actor).state;
  snapshot=reduceBusiness(snapshot,'CLOSE_DAY',{shopId},actor).state;
  const legacyDate=snapshot.closings[0].businessDay;snapshot.closings[0].businessDate=legacyDate;delete snapshot.closings[0].businessDay;
  assert.ok(Object.hasOwn(snapshot.shifts[0],'lateConfirmedCount'));assert.equal(snapshot.reconciliations[0].counts['ambiguous-reference'],1);
  const target=t.client();await target.call('/api/signup',signupPayload('canonicaltarget'));
  const result=await target.call('/api/migrate',{snapshot,attemptId:'canonical-import',currentPassword:'OwnerTest1234',confirmImport:true});
  assert.equal(result.status,200,JSON.stringify(result.data));assert.equal(result.data.metrics.balance,2000);
  const imported=result.data.state,comparison=imported.reconciliations[0];assert.equal(imported.shifts[0].lateConfirmedCount,0);assert.equal(imported.closings[0].businessDay,legacyDate);
  assert.equal(comparison.counts['ambiguous-reference'],1);assert.equal(comparison.results.length,2);assert.equal(comparison.mismatches,1);
  for(const list of [comparison.rows,comparison.results])for(const row of list)if(row.paymentId){assert.ok(imported.transactions.some(tx=>tx.id===row.paymentId));assert.equal(row.transactionId,row.paymentId)}
  assert.equal(comparison.results[1].reference,snapshot.transactions[0].id,'original statement evidence stays unchanged');
 }finally{t.close()}
});

test('payment retry references validate code, account and selected shop without rejecting a paid-request replay',async()=>{
 const t=setup();try{
  const ownerA=t.client(),ownerB=t.client(),student=t.client(),a=await ownerA.call('/api/signup',signupPayload('selectorone')),b=await ownerB.call('/api/signup',signupPayload('selectortwo'));
  const shopA=a.data.state.shops[0],shopB=b.data.state.shops[0];await student.call('/api/student/open',{name:'Selector tester'});await student.call('/api/student/fund',{amount:5000,confirmSandbox:true});
  const first=await student.call('/api/payments',{code:shopA.code,testKey:shopA.testAcceptanceToken,amount:1000,attemptId:'selector-attempt'});assert.equal(first.status,201);
  for(const selector of [{code:shopB.code},{accountNumber:b.data.state.business.accountNumber},{accountNumber:a.data.state.business.accountNumber,selectedShopId:shopB.id}]){
   const retry=await student.call('/api/payments',{...selector,amount:1000,attemptId:'selector-attempt'});assert.equal(retry.status,409);assert.equal(retry.data.code,'IDEMPOTENCY_MISMATCH');assert.equal(retry.data.payment,undefined);
  }
  const matching=await student.call('/api/payments',{code:' '+shopA.code.toLowerCase()+' ',amount:1000,attemptId:'selector-attempt'});assert.equal(matching.data.replayed,true);assert.equal(matching.data.payment.id,first.data.payment.id);
  const conflicting=await student.call('/api/payments',{shopId:shopA.id,testKey:shopA.testAcceptanceToken,code:shopB.code,amount:1000,attemptId:'new-conflict'});assert.equal(conflicting.status,409);assert.equal(conflicting.data.code,'RECIPIENT_MISMATCH');
  assert.equal((await student.call('/api/student')).data.student.balance,4000);
  const qr=await ownerA.call('/api/action',{type:'CREATE_REQUEST',payload:{shopId:shopA.id,amount:500}});
  const paid=await student.call('/api/payments',{shopId:shopA.id,testKey:shopA.testAcceptanceToken,requestId:qr.data.entity.id,amount:500,attemptId:'paid-qr'});
  const replay=await student.call('/api/payments',{shopId:shopA.id,testKey:shopA.testAcceptanceToken,requestId:qr.data.entity.id,amount:500,attemptId:'paid-qr'});assert.equal(replay.data.payment.id,paid.data.payment.id);assert.equal(replay.data.replayed,true);
 }finally{t.close()}
});

test('a reassigned manager cannot use refund replay to read a former shop entity',async()=>{
 const t=setup();try{
  const owner=t.client(),manager=t.client(),reg=await owner.call('/api/signup',signupPayload('refundscope')),shop1=reg.data.state.shops[0].id;
  const added=await owner.call('/api/action',{type:'ADD_SHOP',payload:{name:'New shop',area:'Pentagon',category:'Food',lat:5.65,lng:-.18}}),shop2=added.data.entity.id;
  const invite=await owner.call('/api/invitations',{name:'Manager',phone:'0555550140',role:'manager',shopIds:[shop1]});
  const joined=await manager.call('/api/invitations/accept',{token:invite.data.invitation.token,username:'scope.manager',password:'ManagerTest123'});
  const payment=await owner.call('/api/simulate',{shopId:shop1,amount:2000,payer:'Private former-shop payer',status:'paid'});
  const payload={transactionId:payment.data.entity.id,amount:500,reason:'Private former-shop reason',attemptId:'former-shop-refund'};
  assert.equal((await manager.call('/api/action',{type:'REFUND',payload})).status,200);
  await owner.call('/api/users/'+joined.data.user.id,{shopIds:[shop2]});await manager.call('/api/login',{username:'scope.manager',password:'ManagerTest123'});
  const replay=await manager.call('/api/action',{type:'REFUND',payload:{...payload,shopId:shop2}});assert.equal(replay.status,403);assert.equal(replay.data.entity,undefined);assert.doesNotMatch(JSON.stringify(replay.data),/Private former-shop/);
 }finally{t.close()}
});

test('expired rate-record cleanup is bounded and cannot make authentication permanently too large',async()=>{
 const t=setup();try{
  const owner=t.client();await owner.call('/api/signup',signupPayload('rategc'));const {updateNetwork}=await import('../server/network.js');
  for(let start=0;start<2001;start+=500)await updateNetwork(t.env,n=>{for(let i=start;i<Math.min(start+500,2001);i++)n.rateLimits['expired-'+i]={count:1,startedAt:Date.now()-7200000,windowMs:60000};return {}});
  const login=await t.client().call('/api/login',{username:'owner.rategc',password:'OwnerTest1234'});assert.equal(login.status,200);
  const again=await t.client().call('/api/login',{username:'owner.rategc',password:'OwnerTest1234'});assert.equal(again.status,200);
  const state=(await readNetwork(t.env)).state;assert.ok(Object.keys(state.rateLimits).filter(k=>k.startsWith('expired-')).length<2001);
 }finally{t.close()}
});

test('recovery retention keeps newest own challenges and never evicts another account to make room',async()=>{
 const t=setup();try{
  const a=t.client(),b=t.client(),regA=await a.call('/api/signup',signupPayload('recovera')),regB=await b.call('/api/signup',signupPayload('recoverb')),before=await a.call('/api/auth/recovery/start',{username:'owner.recovera'});
  const {updateNetwork}=await import('../server/network.js');
  await updateNetwork(t.env,n=>{for(let i=0;i<450;i++)n.recoveries.push({id:'old-recovery-'+i,userId:regB.data.user.id,userVersion:1,createdAt:new Date(Date.now()-60000-i).toISOString(),expiresAt:new Date(Date.now()+240000).toISOString(),usedAt:null});return {}});
  const latest=await b.call('/api/auth/recovery/start',{username:'owner.recoverb'});assert.equal(latest.status,200);
  const state=(await readNetwork(t.env)).state;assert.ok(state.recoveries.some(r=>r.id===latest.data.challengeId));assert.ok(state.recoveries.some(r=>r.id===before.data.challengeId));assert.ok(state.recoveries.filter(r=>r.userId===regB.data.user.id).length<451);
  const count=state.recoveries.length;await a.call('/api/auth/recovery/start',{username:'unknown.recovery'});
  assert.equal((await readNetwork(t.env)).state.recoveries.length,count);
 }finally{t.close()}
});


test('settlement retries reserve once across concurrency, destination changes and later outcome updates',async()=>{
 const t=setup();try{
  const owner=t.client(),reg=await owner.call('/api/signup',signupPayload('settleretry')),shopId=reg.data.state.shops[0].id,testKey=reg.data.state.shops[0].testAcceptanceToken,destination=reg.data.state.business.destination;
  await owner.call('/api/simulate',{shopId,amount:10000,payer:'Settlement tester',status:'paid'});
  const proof=await owner.call('/api/auth/step-up',{currentPassword:'OwnerTest1234',purpose:'settlement'}),payload={amount:2000,destination,attemptId:'one-payout-despite-lost-response'};
  const [first,retry]=await Promise.all([owner.call('/api/action',{type:'SETTLE',payload,stepUpProof:proof.data.proof}),owner.call('/api/action',{type:'SETTLE',payload,stepUpProof:proof.data.proof})]);
  assert.equal(first.status,200);assert.equal(retry.status,200);assert.equal(first.data.entity.id,retry.data.entity.id);
  let view=await owner.call('/api/session');assert.equal(view.data.state.settlements.length,1);assert.equal(view.data.metrics.reserved,2000);assert.equal(view.data.metrics.available,8000);
  for(const changed of [{...payload,amount:2001},{...payload,destination:'A different saved target'}]){
   const mismatch=await owner.call('/api/action',{type:'SETTLE',payload:changed});assert.equal(mismatch.status,409);assert.equal(mismatch.data.code,'IDEMPOTENCY_MISMATCH');
  }
  const destinationProof=await owner.call('/api/auth/step-up',{currentPassword:'OwnerTest1234',purpose:'destination'});
  assert.equal((await owner.call('/api/action',{type:'UPDATE_BUSINESS',payload:{destination:'Updated sandbox bank destination'},stepUpProof:destinationProof.data.proof})).status,200);
  const resumed=await owner.call('/api/action',{type:'SETTLE',payload});assert.equal(resumed.status,200);assert.equal(resumed.data.replayed,true);assert.equal(resumed.data.entity.destination,destination);assert.equal(resumed.data.entity.id,first.data.entity.id);
  assert.equal((await owner.call('/api/action',{type:'RESOLVE_SETTLEMENT',payload:{id:first.data.entity.id,status:'failed'}})).status,200);
  const failed=await owner.call('/api/action',{type:'SETTLE',payload});assert.equal(failed.status,200);assert.equal(failed.data.entity.status,'failed');assert.equal(failed.data.metrics.reserved,0);assert.equal(failed.data.state.settlements.length,1);
  assert.equal((await owner.call('/api/action',{type:'SETTLE',payload:{amount:2000,destination,attemptId:'fresh-payout-without-proof'}})).data.code,'DESTINATION_MISMATCH');
  const noProof=await owner.call('/api/action',{type:'SETTLE',payload:{amount:2000,attemptId:'fresh-payout-without-proof'}});assert.equal(noProof.status,403);assert.equal(noProof.data.code,'STEP_UP_REQUIRED');
  const missingRef=await owner.call('/api/action',{type:'SETTLE',payload:{amount:2000}});assert.equal(missingRef.status,400);
  view=await owner.call('/api/session');assert.equal(view.data.metrics.balance,10000);assert.equal(view.data.state.settlements.length,1);
 }finally{t.close()}
});

test('settlement replay is owner-only and its reference never exposes another business payout',async()=>{
 const t=setup();try{
  const owner=t.client(),staff=t.client(),other=t.client(),reg=await owner.call('/api/signup',signupPayload('settlescope')),shopId=reg.data.state.shops[0].id,testKey=reg.data.state.shops[0].testAcceptanceToken;
  await owner.call('/api/simulate',{shopId,amount:5000,payer:'Settlement scope tester',status:'paid'});
  const proof=await owner.call('/api/auth/step-up',{currentPassword:'OwnerTest1234',purpose:'settlement'}),payload={amount:1000,destination:reg.data.state.business.destination,attemptId:'business-payout-reference'};
  const first=await owner.call('/api/action',{type:'SETTLE',payload,stepUpProof:proof.data.proof});assert.equal(first.status,200);
  const invitation=await owner.call('/api/invitations',{name:'Payout cashier',phone:'0555550171',role:'cashier',shopIds:[shopId]});await staff.call('/api/invitations/accept',{token:invitation.data.invitation.token,username:'payout.cashier',password:'PayoutCashier123'});
  const forbidden=await staff.call('/api/action',{type:'SETTLE',payload});assert.equal(forbidden.status,403);assert.equal(forbidden.data.code,'OWNER_REQUIRED');assert.equal(forbidden.data.entity,undefined);
  await other.call('/api/signup',signupPayload('settleother'));
  const unrelated=await other.call('/api/action',{type:'SETTLE',payload});assert.equal(unrelated.status,403);assert.equal(unrelated.data.code,'STEP_UP_REQUIRED');assert.equal(unrelated.data.entity,undefined);
  assert.equal((await owner.call('/api/session')).data.metrics.reserved,1000);
 }finally{t.close()}
});

test('public account lookup cannot enumerate or select unpublished sibling shops while exact QRs remain testable',async()=>{
 const t=setup();try{
  const owner=t.client(),publicClient=t.client(),reg=await owner.call('/api/signup',signupPayload('privatechoices')),first=reg.data.state.shops[0];
  async function add(name){return (await owner.call('/api/action',{type:'ADD_SHOP',payload:{name,area:'Pentagon',category:'Other',lat:5.6535,lng:-.1845}})).data.entity}
  const privateShop=await add('Private unfinished counter'),second=await add('Published second counter');
  for(const shop of [first,second]){
   await owner.call('/api/action',{type:'UPDATE_ACTIVATION',payload:{shopId:shop.id,locationConfirmed:true,qrReady:true,ownerOperated:true}});
   const deviceId='published-choice-phone-'+shop.id;await owner.call('/api/devices',{deviceId,shopId:shop.id,label:'Test counter phone'});await owner.call('/api/devices/'+deviceId,{action:'test',soundReady:true});
   const published=await owner.call('/api/action',{type:'UPDATE_SHOP',payload:{id:shop.id,published:true}});assert.equal(published.status,200);
  }
  const number=reg.data.state.business.accountNumber,quote=await publicClient.call('/api/payments/quote?accountNumber='+number);
  assert.equal(quote.status,200);assert.deepEqual(new Set(quote.data.shops.map(shop=>shop.id)),new Set([first.id,second.id]));assert.doesNotMatch(JSON.stringify(quote.data),/Private unfinished/);
  const hidden=await publicClient.call('/api/payments/quote?accountNumber='+number+'&selectedShopId='+privateShop.id);assert.equal(hidden.status,404);assert.equal(hidden.data.code,'MERCHANT_NOT_FOUND');assert.doesNotMatch(JSON.stringify(hidden.data),/Private unfinished/);
  const hiddenExact=await publicClient.call('/api/payments/quote?shopId='+privateShop.id);assert.equal(hiddenExact.status,404);const exact=await publicClient.call('/api/payments/quote?shopId='+privateShop.id+'&testKey='+privateShop.testAcceptanceToken);assert.equal(exact.status,200);assert.equal(exact.data.listingStatus,'test-only');assert.equal(exact.data.shop.id,privateShop.id);
  const allPrivate=t.client(),privateReg=await allPrivate.call('/api/signup',signupPayload('allprivatechoices'));
  assert.equal((await publicClient.call('/api/payments/quote?accountNumber='+privateReg.data.state.business.accountNumber)).status,404);
  assert.equal((await publicClient.call('/api/payments/quote?shopId='+privateReg.data.state.shops[0].id)).status,404);assert.equal((await publicClient.call('/api/payments/quote?shopId='+privateReg.data.state.shops[0].id+'&testKey='+privateReg.data.state.shops[0].testAcceptanceToken)).status,200);
 }finally{t.close()}
});

test('invitation acceptance resumes a committed response exactly once without reissuing the private key',async()=>{
 const t=setup();try{
  const owner=t.client(),staff=t.client(),resumedClient=t.client(),reg=await owner.call('/api/signup',signupPayload('inviteresume')),shopId=reg.data.state.shops[0].id,testKey=reg.data.state.shops[0].testAcceptanceToken;
  const invite=await owner.call('/api/invitations',{name:'Resumable cashier',phone:'0555550172',role:'cashier',shopIds:[shopId]}),payload={token:invite.data.invitation.token,username:'resume.cashier',password:'ResumeCashier123'};
  const first=await staff.call('/api/invitations/accept',payload);assert.equal(first.status,201);assert.ok(first.data.recoveryKey);assert.equal(first.data.recoveryKeyAvailable,true);
  const before=(await readNetwork(t.env)).state.users.find(user=>user.id===first.data.user.id).recoveryHash;
  const lookup=await resumedClient.call('/api/invitations/'+payload.token);assert.equal(lookup.data.invitation.status,'accepted');assert.equal(lookup.data.invitation.retryAllowed,true);assert.equal(lookup.data.invitation.username,undefined);
  const retry=await resumedClient.call('/api/invitations/accept',payload);assert.equal(retry.status,200);assert.equal(retry.data.replayed,true);assert.equal(retry.data.user.id,first.data.user.id);assert.notEqual(retry.data.session.id,first.data.session.id);assert.equal(retry.data.recoveryKey,undefined);assert.equal(retry.data.recoveryKeyAvailable,false);assert.equal(retry.data.keyUnavailable,true);assert.equal(retry.data.recoveryAction,'regenerate');
  const network=(await readNetwork(t.env)).state;assert.equal(network.users.filter(user=>user.businessId===reg.data.state.business.id).length,2);assert.equal(network.users.find(user=>user.id===first.data.user.id).recoveryHash,before);
  for(const bad of [{...payload,username:'another.cashier'},{...payload,password:'IncorrectPassword123'}]){const rejected=await t.client().call('/api/invitations/accept',bad);assert.equal(rejected.status,409);assert.equal(rejected.data.code,'INVITATION_ACCEPTED');assert.equal(rejected.data.session,undefined)}
 }finally{t.close()}
});

test('invitation retries use current assignments and cannot revive suspended access',async()=>{
 const t=setup();try{
  const owner=t.client(),staff=t.client(),reg=await owner.call('/api/signup',signupPayload('invitechanges')),oldShop=reg.data.state.shops[0].id;
  const added=await owner.call('/api/action',{type:'ADD_SHOP',payload:{name:'Reassigned counter',area:'Pentagon',category:'Other',lat:5.65,lng:-.18}}),newShop=added.data.entity.id;
  const invite=await owner.call('/api/invitations',{name:'Changing cashier',phone:'0555550173',role:'cashier',shopIds:[oldShop]}),payload={token:invite.data.invitation.token,username:'changed.cashier',password:'ChangedCashier123'},joined=await staff.call('/api/invitations/accept',payload);
  await owner.call('/api/users/'+joined.data.user.id,{shopIds:[newShop]});
  const replay=await t.client().call('/api/invitations/accept',payload);assert.equal(replay.status,200);assert.deepEqual(replay.data.session.shopIds,[newShop]);assert.deepEqual(replay.data.state.shops.map(shop=>shop.id),[newShop]);assert.doesNotMatch(JSON.stringify(replay.data.state.shops),new RegExp(oldShop));
  await owner.call('/api/users/'+joined.data.user.id,{active:false});const suspended=await t.client().call('/api/invitations/accept',payload);assert.equal(suspended.status,403);assert.equal(suspended.data.code,'INVITATION_ACCESS_CHANGED');assert.equal(suspended.data.session,undefined);
 }finally{t.close()}
});

test('invalid account status values cannot suspend the owner or partly mutate its profile',async()=>{
 const t=setup();try{
  const owner=t.client(),reg=await owner.call('/api/signup',signupPayload('ownertypes')),ownerId=reg.data.user.id;
  for(const active of [0,null,1,'false','true','',[],{}]){
   const invalid=await owner.call('/api/users/'+ownerId,{name:'Must not be saved',active});assert.equal(invalid.status,400);assert.equal(invalid.data.code,'INVALID_ACCOUNT_STATUS');
   const view=await owner.call('/api/session');assert.equal(view.data.session.userId,ownerId);assert.equal(view.data.user.active,true);assert.equal(view.data.user.name,reg.data.user.name);
  }
  const explicit=await owner.call('/api/users/'+ownerId,{active:false});assert.equal(explicit.status,400);
  const unchanged=await owner.call('/api/users/'+ownerId,{active:true});assert.equal(unchanged.status,200);assert.equal(unchanged.data.user.active,true);
  const login=await t.client().call('/api/auth/login',{username:'owner.ownertypes',password:'OwnerTest1234'});assert.equal(login.status,200);
 }finally{t.close()}
});

test('strict import preserves new allocation audit fields, period adjustments, shift names and settlement attempts',async()=>{
 const t=setup();try{
  const {createBusiness,reduceBusiness,applyAutomaticClosings}=await import('../dist/domain.js');
  let snapshot=createBusiness({...signupPayload('allocationlegacy'),shop:{...signupPayload('allocationlegacy').shop,cutoff:'03:00',closeMode:'automatic'}},{now:'2026-11-10T10:00:00.000Z'});
  const shopId=snapshot.shops[0].id,owner={role:'owner',userId:'local-allocation-owner'};
  const act=(type,payload,now)=>{const result=reduceBusiness(snapshot,type,payload,owner,{now});snapshot=result.state;return result.entity};
  let result=reduceBusiness(snapshot,'PAY',{amount:1000,method:'account',payer:'Legacy account receipt',attemptId:'unallocated-import'},{role:'student'},{now:'2026-11-11T01:00:00.000Z'});snapshot=result.state;const paymentId=result.entity.id;
  snapshot=applyAutomaticClosings(snapshot,'2026-11-11T03:01:00.000Z').state;
  act('ASSIGN_PAYMENT',{id:paymentId,shopId},'2026-11-11T04:00:00.000Z');
  const shift=act('START_SHIFT',{shopId},'2026-11-11T04:01:00.000Z');act('END_SHIFT',{id:shift.id},'2026-11-11T04:05:00.000Z');
  act('CLOSE_DAY',{shopId},'2026-11-11T04:06:00.000Z');act('SETTLE',{amount:200,attemptId:'legacy-settlement-attempt',destination:snapshot.business.destination},'2026-11-11T04:07:00.000Z');
  assert.equal(snapshot.transactions[0].priorPeriodAllocation,true);assert.equal(snapshot.closings[0].priorPeriodAllocations,1000);assert.ok(snapshot.shifts[0].staffName);assert.ok(snapshot.shifts[0].performedBy);
  const target=t.client();await target.call('/api/signup',signupPayload('allocationtarget'));
  const imported=await target.call('/api/migrate',{snapshot,attemptId:'allocation-audit-import',currentPassword:'OwnerTest1234',confirmImport:true});assert.equal(imported.status,200,JSON.stringify(imported.data));
  const saved=imported.data.state,payment=saved.transactions[0];assert.equal(payment.confirmedAt,'2026-11-11T01:00:00.000Z');assert.equal(payment.allocationSourceTradingDay,snapshot.transactions[0].allocationSourceTradingDay);assert.equal(payment.allocationSourceCutoff,'00:00');assert.equal(payment.allocationReceiptTradingDay,'2026-11-10');assert.equal(payment.priorPeriodAllocation,true);
  assert.equal(saved.closings[0].priorPeriodAllocations,1000);assert.equal(saved.shifts[0].staffName,snapshot.shifts[0].staffName);assert.equal(saved.shifts[0].performedBy,snapshot.shifts[0].performedBy);assert.ok(saved.settlements[0].attemptId.endsWith(':legacy-settlement-attempt'));assert.equal(imported.data.metrics.balance,1000);assert.equal(imported.data.metrics.reserved,200);
 }finally{t.close()}
});

test('API allocation after an automatic cutoff preserves the old close and posts a visible current-period adjustment',async()=>{
 const t=setup();try{
  const {businessDay,reduceBusiness}=await import('../dist/domain.js'),{updateNetwork}=await import('../server/network.js');
  const owner=t.client(),reg=await owner.call('/api/signup',signupPayload('allocateafterauto')),businessId=reg.data.state.business.id,shopId=reg.data.state.shops[0].id,testKey=reg.data.state.shops[0].testAcceptanceToken;
  const boundary=Date.parse(businessDay(Date.now(),'03:00')+'T03:00:00.000Z'),registeredAt=new Date(boundary-17*3600000).toISOString(),confirmedAt=new Date(boundary-2*3600000).toISOString();
  let paymentId;
  await updateNetwork(t.env,n=>{
   const b=n.businesses[businessId];b.business.registeredAt=registeredAt;b.shops[0].createdAt=registeredAt;b.shops[0].createdCutoff='03:00';b.shops[0].cutoff='03:00';b.shops[0].closeMode='automatic';
   const paid=reduceBusiness(b,'PAY',{amount:1000,method:'account',payer:'Late allocation',attemptId:'api-unallocated-cutoff'},{role:'student'},{now:confirmedAt});paymentId=paid.entity.id;n.businesses[businessId]=paid.state;return {};
  });
  const allocated=await owner.call('/api/action',{type:'ASSIGN_PAYMENT',payload:{id:paymentId,shopId}});assert.equal(allocated.status,200,JSON.stringify(allocated.data));
  const tx=allocated.data.entity;assert.equal(tx.confirmedAt,confirmedAt);assert.equal(tx.priorPeriodAllocation,true);assert.equal(tx.tradingDay,businessDay(Date.now(),'03:00'));assert.equal(allocated.data.metrics.balance,1000);assert.equal(allocated.data.metrics.currentNet,1000);assert.equal(allocated.data.state.closings[0].gross,0);assert.equal(allocated.data.state.closings[0].transactionIds.includes(paymentId),false);
  const closed=await owner.call('/api/action',{type:'CLOSE_DAY',payload:{shopId}});assert.equal(closed.status,200);assert.equal(closed.data.entity.gross,1000);assert.equal(closed.data.entity.priorPeriodAllocations,1000);assert.equal(closed.data.metrics.currentNet,0);assert.equal(closed.data.metrics.balance,1000);
 }finally{t.close()}
});

test('concurrent invitation acceptance creates one account and returns its private key only to the creation response',async()=>{
 const t=setup();try{
  const owner=t.client(),reg=await owner.call('/api/signup',signupPayload('inviteconcurrent')),shopId=reg.data.state.shops[0].id,testKey=reg.data.state.shops[0].testAcceptanceToken;
  const invite=await owner.call('/api/invitations',{name:'Concurrent cashier',phone:'0555550174',role:'cashier',shopIds:[shopId]}),payload={token:invite.data.invitation.token,username:'concurrent.cashier',password:'ConcurrentCashier123'};
  const results=await Promise.all([t.client().call('/api/invitations/accept',payload),t.client().call('/api/invitations/accept',payload)]);
  assert.deepEqual(results.map(result=>result.status).sort(),[200,201]);assert.equal(results[0].data.user.id,results[1].data.user.id);assert.equal(results.filter(result=>result.data.recoveryKey).length,1);assert.equal(results.find(result=>result.status===200).data.recoveryKeyAvailable,false);
  const network=(await readNetwork(t.env)).state;assert.equal(network.users.filter(user=>user.businessId===reg.data.state.business.id).length,2);assert.equal(network.invitations.find(entry=>entry.id===invite.data.invitation.id).acceptedBy,results[0].data.user.id);
 }finally{t.close()}
});

test('failed accepted-invitation password retries are persistently rate limited before credential checking',async()=>{
 const t=setup();try{
  const owner=t.client(),staff=t.client(),reg=await owner.call('/api/signup',signupPayload('inviteratelimit')),shopId=reg.data.state.shops[0].id,testKey=reg.data.state.shops[0].testAcceptanceToken;
  const invite=await owner.call('/api/invitations',{name:'Rate-limited cashier',phone:'0555550175',role:'cashier',shopIds:[shopId]}),payload={token:invite.data.invitation.token,username:'ratelimited.cashier',password:'RateLimitedCashier123'};
  const accepted=await staff.call('/api/invitations/accept',payload);assert.equal(accepted.status,201);
  const before=(await readNetwork(t.env)).state.users.find(user=>user.id===accepted.data.user.id).recoveryHash,statuses=[];
  for(let i=0;i<22;i++){
   const response=await handleAPI(new Request('https://lumo.test/api/invitations/accept',{method:'POST',headers:{'Content-Type':'application/json','X-Lumo-Request':'1',Origin:'https://lumo.test','cf-connecting-ip':'one-fixed-invitation-guessing-client'},body:JSON.stringify({...payload,password:'WrongButValidLength123'})}),t.env);
   const result=await response.json();statuses.push(response.status);assert.equal(result.code,i<20?'INVITATION_ACCEPTED':'RATE_LIMITED');
  }
  assert.deepEqual(statuses.slice(0,20),Array(20).fill(409));assert.deepEqual(statuses.slice(20),[429,429]);
  const replay=await t.client().call('/api/invitations/accept',payload);assert.equal(replay.status,200);assert.equal(replay.data.user.id,accepted.data.user.id);assert.equal(replay.data.recoveryKey,undefined);assert.equal(replay.data.recoveryKeyAvailable,false);
  const after=(await readNetwork(t.env)).state;assert.equal(after.users.filter(user=>user.businessId===reg.data.state.business.id).length,2);assert.equal(after.users.find(user=>user.id===accepted.data.user.id).recoveryHash,before);
 }finally{t.close()}
});

test('owner key-saving checkpoint survives a fresh session read and ACK is generation-bound and idempotent',async()=>{
 const t=setup();try{
  const owner=t.client(),other=t.client(),reg=await owner.call('/api/signup',signupPayload('keycheckpoint'));
  const reference=reg.data.recoveryKeyReference;assert.ok(reference);assert.equal(reg.data.session.recoveryKeyPending,true);assert.equal(reg.data.session.recoveryKeyReference,reference);
  const refreshed=await owner.call('/api/session');assert.equal(refreshed.data.session.recoveryKeyPending,true);assert.equal(refreshed.data.session.recoveryKeyReference,reference);assert.equal(refreshed.data.recoveryKey,undefined,'Reload never reissues the private key');
  assert.equal((await owner.call('/api/auth/recovery-key/ack',{})).status,400);
  const otherReg=await other.call('/api/signup',signupPayload('keyother'));
  assert.equal((await other.call('/api/auth/recovery-key/ack',{reference})).status,409);
  assert.equal((await owner.call('/api/session')).data.session.recoveryKeyPending,true);
  assert.equal((await other.call('/api/session')).data.session.recoveryKeyReference,otherReg.data.recoveryKeyReference);
  const acknowledged=await owner.call('/api/auth/recovery-key/ack',{reference});assert.equal(acknowledged.status,200);assert.equal(acknowledged.data.acknowledged,true);assert.equal(acknowledged.data.session.recoveryKeyPending,false);assert.equal(acknowledged.data.session.recoveryKeyReference,null);
  const retry=await owner.call('/api/auth/recovery-key/ack',{reference});assert.equal(retry.status,200,'A committed-but-lost ACK can be retried');assert.equal(retry.data.session.recoveryKeyPending,false);
  const {state}=await readNetwork(t.env),user=state.users.find(user=>user.id===reg.data.session.userId);assert.equal(user.recoveryKeyPending,false);assert.ok(user.recoveryKeyAcknowledgedAt);assert.notEqual(user.recoveryHash,reg.data.recoveryKey);
 }finally{t.close()}
});

test('an old tab cannot acknowledge a replaced key and legacy accounts are not given a new checkpoint',async()=>{
 const t=setup();try{
  const first=t.client(),second=t.client(),reg=await first.call('/api/signup',signupPayload('keytabs'));
  await second.call('/api/auth/login',{username:'owner.keytabs',password:'OwnerTest1234'});
  const replaced=await second.call('/api/auth/recovery-key',{currentPassword:'OwnerTest1234'});assert.equal(replaced.status,200);assert.notEqual(replaced.data.recoveryKeyReference,reg.data.recoveryKeyReference);
  const stale=await first.call('/api/auth/recovery-key/ack',{reference:reg.data.recoveryKeyReference});assert.equal(stale.status,409);assert.equal(stale.data.code,'RECOVERY_KEY_CHANGED');
  const latest=await first.call('/api/session');assert.equal(latest.data.session.recoveryKeyPending,true);assert.equal(latest.data.session.recoveryKeyReference,replaced.data.recoveryKeyReference);
  await second.call('/api/auth/recovery-key/ack',{reference:replaced.data.recoveryKeyReference});
  const {updateNetwork}=await import('../server/network.js');await updateNetwork(t.env,n=>{const user=n.users.find(user=>user.id===reg.data.session.userId);delete user.recoveryKeyPending;delete user.recoveryKeyReference;return {data:{}}});
  const legacy=await first.call('/api/session');assert.equal(legacy.status,200);assert.equal(legacy.data.session.recoveryKeyPending,false);assert.equal(legacy.data.session.recoveryKeyReference,null);
 }finally{t.close()}
});

test('new invitation keys stay pending until their exact key generation is acknowledged',async()=>{
 const t=setup();try{
  const owner=t.client(),staff=t.client(),reg=await owner.call('/api/signup',signupPayload('invkeycheckpoint')),shopId=reg.data.state.shops[0].id,testKey=reg.data.state.shops[0].testAcceptanceToken;
  const invite=await owner.call('/api/invitations',{name:'Key Test Cashier',phone:'0555550188',role:'cashier',shopIds:[shopId]});
  const request={token:invite.data.invitation.token,username:'key.checkpoint.cashier',password:'CashierTest123'};
  const first=await staff.call('/api/invitations/accept',request);assert.equal(first.status,201);assert.equal(first.data.session.recoveryKeyPending,true);assert.equal(first.data.recoveryKeyReference,first.data.session.recoveryKeyReference);
  const resumed=await staff.call('/api/invitations/accept',request);assert.equal(resumed.status,200);assert.equal(resumed.data.recoveryKey,undefined);assert.equal(resumed.data.session.recoveryKeyPending,true);assert.equal(resumed.data.session.recoveryKeyReference,first.data.recoveryKeyReference);
  const ack=await staff.call('/api/auth/recovery-key/ack',{reference:first.data.recoveryKeyReference});assert.equal(ack.status,200);assert.equal(ack.data.session.recoveryKeyPending,false);
 }finally{t.close()}
});

test('refund decisions require a JSON boolean before any wallet or refund mutation',async()=>{
 const t=setup();try{
  const owner=t.client(),cashier=t.client(),student=t.client(),reg=await owner.call('/api/signup',signupPayload('refunddec')),shopId=reg.data.state.shops[0].id,testKey=reg.data.state.shops[0].testAcceptanceToken;
  const invite=await owner.call('/api/invitations',{name:'Refund Cashier',phone:'0555550148',role:'cashier',shopIds:[shopId]});
  await cashier.call('/api/invitations/accept',{token:invite.data.invitation.token,username:'refund.decision.cashier',password:'CashierTest123'});
  await student.call('/api/student/open',{name:'Refund Decision Student'});await student.call('/api/student/fund',{amount:5000,confirmSandbox:true,attemptId:'strict-decision-fund'});
  const payment=await student.call('/api/payments',{shopId,testKey,amount:3000,attemptId:'strict-decision-payment',method:'qr'});assert.equal(payment.status,201);
  const requested=await cashier.call('/api/action',{type:'REFUND',payload:{transactionId:payment.data.payment.id,amount:1000,reason:'Customer request',attemptId:'strict-decision-refund'}});assert.equal(requested.status,200);assert.equal(requested.data.entity.status,'requested');const refundId=requested.data.entity.id;
  for(const value of [undefined,null,0,1,'false','true',[],{}]){
   const payload={id:refundId,...(value===undefined?{}:{approve:value})};const rejected=await owner.call('/api/action',{type:'APPROVE_REFUND',payload});assert.equal(rejected.status,400);assert.equal(rejected.data.code,'INVALID_REFUND_DECISION');
   const current=await owner.call('/api/session');assert.equal(current.data.state.refunds.find(refund=>refund.id===refundId).status,'requested');assert.equal(current.data.metrics.refunded,0);assert.equal((await student.call('/api/student')).data.student.balance,2000);
  }
  const declined=await owner.call('/api/action',{type:'APPROVE_REFUND',payload:{id:refundId,approve:false}});assert.equal(declined.status,200);assert.equal(declined.data.entity.status,'rejected');assert.equal((await student.call('/api/student')).data.student.balance,2000);
  const next=await cashier.call('/api/action',{type:'REFUND',payload:{transactionId:payment.data.payment.id,amount:1000,reason:'Customer request',attemptId:'strict-decision-refund-next'}});
  const paid=await owner.call('/api/action',{type:'APPROVE_REFUND',payload:{id:next.data.entity.id,approve:true}});assert.equal(paid.status,200);assert.equal(paid.data.entity.status,'paid');assert.equal((await student.call('/api/student')).data.student.balance,3000);
  const retried=await owner.call('/api/action',{type:'APPROVE_REFUND',payload:{id:next.data.entity.id,approve:true}});assert.equal(retried.status,200);assert.equal((await student.call('/api/student')).data.student.balance,3000);assert.equal(retried.data.metrics.refunded,1000);
 }finally{t.close()}
});
