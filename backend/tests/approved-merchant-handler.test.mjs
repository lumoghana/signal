import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createMerchantHandler,hydrateMerchantNetwork} from '../supabase/functions/lumo-approved/merchant/handler.mjs';
import {emptyNetwork} from '../supabase/functions/lumo-approved/merchant/server/network.js';
import {metricsFor} from '../supabase/functions/lumo-approved/merchant/dist/domain.js';
const uuid=()=>crypto.randomUUID(),clone=x=>structuredClone(x),password='Merchant-password-2026';
const identity=handle=>({userId:uuid(),sessionId:uuid(),user:{email:handle+'@pilot.lumo.invalid'}});
function fixture(){
 let state=emptyNetwork(),revision=0,ledger=[],requests=[],balances={},consumerBalance=100000,refundMap=new Map(),attempts=new Map();
 const stamp=()=>ledger.map(j=>j.id).join(',');
 const serviceRpc=async(name,p)=>{
  if(name==='lumo_approved_merchant_read')return {ok:true,state:clone(state),revision,ledger:clone(ledger),requests:clone(requests),balances:clone(balances),ledgerStamp:stamp()};
  assert.equal(name,'lumo_approved_merchant_commit');
  if(p.p_revision!==revision||p.p_ledger_stamp!==stamp())return {ok:false,code:'CONCURRENT_UPDATE'};
  for(const b of Object.values(p.p_state.businesses)){
   balances[b.business.id]||={balance:0,accountId:uuid()};
   for(const r of b.refunds.filter(x=>x.status==='paid'))if(!refundMap.has(r.id)&&!ledger.some(j=>j.id===r.id)){
    assert.equal(p.p_money_authorized,true,'shared posting requires verified original password proof');
    const source=ledger.find(j=>j.id===r.transactionId),j={id:uuid(),reference:'RF'+ledger.length,type:'refund',amount:r.amount,shopId:r.shopId,requestId:source.requestId,originalPaymentId:source.id,merchantId:b.business.id,refundId:r.id,createdAt:new Date().toISOString()};
    ledger.push(j);refundMap.set(r.id,j.id);balances[b.business.id].balance-=r.amount;consumerBalance+=r.amount;
   }
  }
  state=clone(p.p_state);requests=Object.values(state.businesses).flatMap(b=>b.requests.map(r=>({...r,createdBySharedUserId:state.users.find(u=>u.id===r.createdByUserId)?._sharedUserId})));
  return {ok:true,revision:++revision};
 };
 const handler=createMerchantHandler({serviceRpc});
 async function api(who,path,body,token){const result=await handler({identity:who,body:{action:'merchant',path,method:body?'POST':'GET',body:body||{},merchantToken:token}});return result;}
 async function pay(shopId,requestId,amount,attemptId){
  if(attempts.has(attemptId))return clone(attempts.get(attemptId));
  const request=requests.find(r=>r.id===requestId);assert.equal(request?.shopId,shopId);assert.equal(request?.amount,amount);assert.equal(request?.status,'open');
  const b=Object.values(state.businesses).find(b=>b.shops.some(s=>s.id===shopId));
  const journal={id:uuid(),reference:'PAY'+ledger.length,type:'merchant_payment',amount,shopId,requestId,merchantId:b.business.id,payerName:'Connected consumer',createdAt:new Date().toISOString()};
  ledger.push(journal);balances[b.business.id].balance+=amount;consumerBalance-=amount;request.status='paid';attempts.set(attemptId,journal);return clone(journal);
 }
 return {api,pay,read:()=>({state:clone(state),revision,ledger:clone(ledger),balances:clone(balances),consumerBalance}),snapshot:()=>hydrateMerchantNetwork({state,ledger,requests,balances})};
}
async function ownerSetup(f,handle='owner.v7'){
 const who=identity(handle),signup=await f.api(who,'/api/signup',{name:'Approved Kitchen',ownerName:'Akua Owner',phone:'0240000001',businessType:'sole-trader',destination:'Test destination',verification:{identity:true,face:true},shop:{name:'Night Market',area:'Legon',category:'Food',lat:5.65,lng:-.18},credentials:{username:handle,password},attemptId:'signup-'+uuid()});
 assert.equal(signup.ok,true,signup.message);return {who,token:signup.merchantToken,signup,shopId:signup.state.shops[0].id};
}
async function stepup(f,user){const result=await f.api({...user.who,passwordVerified:true},'/api/auth/step-up',{purpose:'refund',currentPassword:password},user.token);assert.equal(result.ok,true,result.message);return result.proof;}
async function invite(f,owner,handle,role,shopIds){
 const invitation=await f.api(owner.who,'/api/invitations',{name:handle,phone:role==='cashier'?'0240000002':'0240000003',role,shopIds},owner.token);assert.equal(invitation.ok,true,invitation.message);
 const who=identity(handle),accepted=await f.api(who,'/api/invitations/accept',{token:invitation.invitation.token,username:handle,password},null);assert.equal(accepted.ok,true,accepted.message);return {who,token:accepted.merchantToken,accepted};
}

test('approved merchant keeps seven signup stages and no additional PIN page',async()=>{
 const source=await readFile(new URL('../../merchant-approved/dist/signup.js',import.meta.url),'utf8');
 assert.match(source,/stageOrder=\['phone','credentials','business','verify','settlement','shop','review'\]/);
 assert.doesNotMatch(source,/name=["'](?:pin|transactionPin)["']/i);
 const f=fixture(),owner=await ownerSetup(f);assert.match(owner.shopId,/^[a-f0-9-]{36}$/);assert.equal(owner.signup.state.openingBalance,0);assert.ok(owner.signup.recoveryKey);
 assert.doesNotMatch(JSON.stringify(owner.signup),/"password"|"tokenHash"|"_sharedUserId"|"stepUpHash"/);
});

test('canonical fixed request posts once, appears in original collection receipt, refund and close keep exact master balance',async()=>{
 const f=fixture(),owner=await ownerSetup(f),requestPayload={shopId:owner.shopId,amount:20000,description:'Order',attemptId:'request-'+uuid()};
 const request=await f.api(owner.who,'/api/action',{type:'CREATE_REQUEST',payload:requestPayload},owner.token);assert.equal(request.ok,true,request.message);assert.match(request.entity.id,/^[a-f0-9-]{36}$/);
 const repeated=await f.api(owner.who,'/api/action',{type:'CREATE_REQUEST',payload:requestPayload},owner.token);assert.equal(repeated.entity.id,request.entity.id);
 const first=await f.pay(owner.shopId,request.entity.id,20000,'consumer-payment-original');const repeat=await f.pay(owner.shopId,request.entity.id,20000,'consumer-payment-original');assert.equal(first.id,repeat.id);
 const snapshot=await f.api(owner.who,'/api/session',null,owner.token);assert.equal(snapshot.state.transactions.length,1);assert.equal(snapshot.state.transactions[0].id,first.id);assert.equal(metricsFor(snapshot.state).balance,20000);
 const proof=await stepup(f,owner),refundPayload={transactionId:first.id,amount:2500,reason:'Returned item',attemptId:'refund-'+uuid(),stepUpProof:proof};
 const refunded=await f.api(owner.who,'/api/action',{type:'REFUND',payload:refundPayload},owner.token);assert.equal(refunded.ok,true,refunded.message);
 const repeatedRefund=await f.api(owner.who,'/api/action',{type:'REFUND',payload:refundPayload},owner.token);assert.equal(repeatedRefund.entity.id,refunded.entity.id);assert.equal(f.read().ledger.filter(j=>j.type==='refund').length,1);
 const close=await f.api(owner.who,'/api/action',{type:'CLOSE_DAY',payload:{shopId:owner.shopId}},owner.token);assert.equal(close.ok,true,close.message);assert.equal(close.entity.gross,20000);assert.equal(close.entity.refunds,2500);assert.equal(close.entity.net,17500);
 const after=await f.api(owner.who,'/api/session',null,owner.token);assert.equal(metricsFor(after.state).balance,17500);assert.equal(metricsFor(after.state,owner.shopId).currentNet,0);assert.equal(f.read().consumerBalance,82500);
});

test('accepted staff scopes, cashier proposal, cumulative manager limit and receiving-phone session binding remain authoritative',async()=>{
 const f=fixture(),owner=await ownerSetup(f),second=await f.api(owner.who,'/api/action',{type:'ADD_SHOP',payload:{name:'Pentagon',area:'Legon',category:'Food',lat:5.66,lng:-.19}},owner.token);assert.equal(second.ok,true,second.message);
 const cashier=await invite(f,owner,'cashier.v7','cashier',[owner.shopId]),manager=await invite(f,owner,'manager.v7','manager',[owner.shopId]);
 assert.equal(cashier.accepted.state.shops.length,1);assert.equal(cashier.accepted.state.business.destination,undefined);
 const denied=await f.api(cashier.who,'/api/action',{type:'CREATE_REQUEST',payload:{shopId:second.entity.id,amount:100}},cashier.token);assert.equal(denied.ok,false);
 const request=await f.api(owner.who,'/api/action',{type:'CREATE_REQUEST',payload:{shopId:owner.shopId,amount:30000,attemptId:'request-'+uuid()}},owner.token);const paid=await f.pay(owner.shopId,request.entity.id,30000,'consumer-'+uuid());
 const proposal=await f.api(cashier.who,'/api/action',{type:'REFUND',payload:{transactionId:paid.id,amount:1000,reason:'Request owner approval',attemptId:'cashier-refund-'+uuid()}},cashier.token);assert.equal(proposal.ok,true,proposal.message);assert.equal(proposal.entity.status,'requested');assert.equal(f.read().ledger.filter(j=>j.type==='refund').length,0);
 const proof=await stepup(f,manager),partial=await f.api(manager.who,'/api/action',{type:'REFUND',payload:{transactionId:paid.id,amount:8000,reason:'Partial',attemptId:'manager-refund-'+uuid(),stepUpProof:proof}},manager.token);assert.equal(partial.ok,true,partial.message);assert.equal(partial.entity.status,'paid');
 const proof2=await stepup(f,manager),over=await f.api(manager.who,'/api/action',{type:'REFUND',payload:{transactionId:paid.id,amount:2000,reason:'Above cumulative limit',attemptId:'manager-over-'+uuid(),stepUpProof:proof2}},manager.token);assert.equal(over.ok,true,over.message);assert.equal(over.entity.status,'requested');
 const pair=await f.api(cashier.who,'/api/devices',{deviceId:'approved-receiver-1',shopId:owner.shopId,label:'Counter phone'},cashier.token);assert.equal(pair.ok,true,pair.message);assert.equal(pair.device.soundReady,false);
 const tested=await f.api(cashier.who,'/api/devices/approved-receiver-1',{action:'test',soundReady:true,expectedFailureVersion:0},cashier.token);assert.equal(tested.ok,true,tested.message);assert.equal(tested.device?.soundReady??tested.devices.find(d=>d.id==='approved-receiver-1').soundReady,true);
 const changedIdentity=await f.api(manager.who,'/api/session',null,cashier.token);assert.equal(changedIdentity.code,'FORBIDDEN');
 const otherPhone=await f.api(manager.who,'/api/devices/approved-receiver-1',{action:'heartbeat',soundReady:true},manager.token);assert.equal(otherPhone.ok,false);
 const actorState=f.read().state;assert.equal(actorState.users.find(u=>u.username==='cashier.v7')._sharedUserId,cashier.who.userId);assert.equal(actorState.users.find(u=>u.username==='manager.v7')._sharedUserId,manager.who.userId);
});

test('concurrent merchant mutations retry CAS without dropping requests or duplicating the original request',async()=>{
 const f=fixture(),owner=await ownerSetup(f),payloads=[1,2,3].map(n=>({shopId:owner.shopId,amount:n*1000,description:'Order '+n,attemptId:'concurrent-request-'+uuid()}));
 const results=await Promise.all(payloads.map(payload=>f.api(owner.who,'/api/action',{type:'CREATE_REQUEST',payload},owner.token)));
 assert.ok(results.every(r=>r.ok),JSON.stringify(results.map(r=>r.code)));
 const snapshot=await f.api(owner.who,'/api/session',null,owner.token);
 assert.equal(snapshot.state.requests.length,3);assert.equal(new Set(snapshot.state.requests.map(r=>r.id)).size,3);
 const retried=await Promise.all(payloads.map(payload=>f.api(owner.who,'/api/action',{type:'CREATE_REQUEST',payload},owner.token)));
 assert.deepEqual(retried.map(r=>r.entity.id),results.map(r=>r.entity.id));
});

test('merchant SQL locks refund recipients and merchant accounts in the universal UUID order before posting',async()=>{
 const sql=await readFile(new URL('../supabase/migrations/20261113072149_lumo_approved_merchant_v7.sql',import.meta.url),'utf8');
 const lock=sql.indexOf('original_payment.payer_account_id=a.id'),order=sql.indexOf('order by a.id for update;',lock),post=sql.indexOf("lumo_private.post_money(p_actor,'refund'");
 assert.ok(lock>0&&order>lock&&post>order,'consumer recipient and merchant accounts share the canonical account-lock order');
 assert.match(sql,/revoke all on function[^;]*public\.lumo_approved_merchant_read\(uuid,uuid\)[^;]*from public,anon,authenticated/s);
 assert.match(sql,/if not lumo_private\.approved_live\(p_actor,p_session\)/);
});

test('merchant path aliases cannot bypass unsupported credential or simulated money boundaries',async()=>{
 const f=fixture(),owner=await ownerSetup(f);
 for(const path of ['/api/auth/password/','/api/password/','/api/simulate/','/api/action/','/api/recovery/start','/api/recovery/complete','/api/auth/username/recover','/api/ownership/transfer']){
  const result=await f.api(owner.who,path,{type:'PAY',payload:{amount:1000,shopId:owner.shopId},currentPassword:password,newPassword:'Another-password-2026'},owner.token);
  assert.equal(result.ok,false,path+' cannot bypass the connected boundary');
 }
 const stepup=await f.api(owner.who,'/api/step-up/',{currentPassword:password,purpose:'refund'},owner.token);assert.equal(stepup.ok,false);assert.equal(stepup.code,'STEP_UP_REQUIRED');
 for(const path of ['/api/auth/../simulate','/api/%73imulate','/api//simulate']){const r=await f.api(owner.who,path,{amount:1000},owner.token);assert.equal(r.ok,false);}
 assert.equal(f.read().ledger.length,0);
});
