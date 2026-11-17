import test from 'node:test';
import assert from 'node:assert/strict';
import {createMerchantHandler} from '../supabase/functions/lumo-approved/merchant/handler.mjs';
import {emptyNetwork} from '../supabase/functions/lumo-approved/merchant/server/network.js';

// Exercise the deployed merchant wrapper and its canonical-journal hydration.
// The RPC double preserves the same revision+ledger-stamp fence and immutable
// fixed-request amount/expiry used by the existing PostgreSQL commit function.
const uuid=()=>crypto.randomUUID(),clone=x=>structuredClone(x),password='Merchant-password-2026';
const identity=handle=>({userId:uuid(),sessionId:uuid(),user:{email:handle+'@pilot.lumo.invalid'}});
function fixture(){
 let state=emptyNetwork(),revision=0,ledger=[],requests=[],balances={},consumerBalance=100000,commits=0,retries=0,beforeCommit=null;
 const attempts=new Map(),refunds=new Set(),stamp=()=>ledger.map(j=>j.id).join(',');
 const serviceRpc=async(name,p)=>{
  if(name==='lumo_approved_merchant_read')return {ok:true,state:clone(state),revision,ledger:clone(ledger),requests:clone(requests),balances:clone(balances),ledgerStamp:stamp()};
  assert.equal(name,'lumo_approved_merchant_commit');
  if(beforeCommit){const fn=beforeCommit;beforeCommit=null;fn();}
  if(p.p_revision!==revision||p.p_ledger_stamp!==stamp()){retries++;return {ok:false,code:'CONCURRENT_UPDATE'};}
  for(const b of Object.values(p.p_state.businesses)){
   balances[b.business.id]||={balance:0,accountId:uuid()};
   for(const r of b.refunds.filter(row=>row.status==='paid'))if(!refunds.has(r.id)&&!ledger.some(j=>j.refundId===r.id)){
    assert.equal(p.p_money_authorized,true,'refund must retain the original shared password authorization');
    const source=ledger.find(j=>j.id===r.transactionId&&j.type==='merchant_payment');assert.ok(source);
    const refunded=ledger.filter(j=>j.originalPaymentId===source.id).reduce((sum,j)=>sum+j.amount,0);assert.ok(refunded+r.amount<=source.amount);
    ledger.push({id:uuid(),reference:'RF'+ledger.length,type:'refund',amount:r.amount,shopId:r.shopId,requestId:source.requestId,originalPaymentId:source.id,merchantId:b.business.id,refundId:r.id,createdAt:new Date().toISOString()});
    refunds.add(r.id);balances[b.business.id].balance-=r.amount;consumerBalance+=r.amount;
   }
   for(const r of b.requests){
    assert.match(r.id,/^[a-f0-9-]{36}$/,'new connected requests use canonical UUIDs');
    const original=requests.find(row=>row.id===r.id);
    if(original){assert.equal(r.amount,original.amount);assert.equal(r.expiresAt,original.expiresAt);original.status=r.status;}
    else requests.push({...clone(r),createdBySharedUserId:p.p_state.users.find(u=>u.id===r.createdByUserId)?._sharedUserId});
   }
  }
  state=clone(p.p_state);commits++;return {ok:true,revision:++revision};
 };
 const handler=createMerchantHandler({serviceRpc,prototypeFaceOnly:true});
 const api=(user,path,body)=>handler({identity:user?.who||null,body:{action:'merchant',path,method:body===undefined?'GET':'POST',body:body||{},merchantToken:user?.token}});
 function pay(shopId,requestId,amount,attemptId=uuid(),canonicalNow=Date.now()){
  if(attempts.has(attemptId))return clone(attempts.get(attemptId));
  const request=requests.find(r=>r.id===requestId);
  if(!request||request.shopId!==shopId||request.amount!==amount||request.status!=='open'||Date.parse(request.expiresAt)<=canonicalNow)return {ok:false,code:'INVALID_REQUEST'};
  const b=Object.values(state.businesses).find(b=>b.shops.some(s=>s.id===shopId));
  const journal={id:uuid(),reference:'PAY'+ledger.length,type:'merchant_payment',amount,shopId,requestId,merchantId:b.business.id,payerName:'Canonical customer',createdAt:new Date().toISOString()};
  ledger.push(journal);balances[b.business.id].balance+=amount;consumerBalance-=amount;request.status='paid';attempts.set(attemptId,journal);return {ok:true,...clone(journal)};
 }
 return {api,pay,read:()=>({state:clone(state),requests:clone(requests),revision,ledger:clone(ledger),balances:clone(balances),consumerBalance,commits,retries}),mutate:fn=>fn(state,requests),race:fn=>{beforeCommit=fn;}};
}
async function ownerSetup(f,handle='loyalty.owner'){
 const who=identity(handle),signup=await f.api({who},'/api/signup',{name:'Kitchen',ownerName:'Akua Owner',phone:'0240000001',businessType:'sole-trader',destination:'Test destination',verification:{identity:true,face:true},shop:{name:'Night Market',area:'Legon',category:'Food',lat:5.65,lng:-.18},credentials:{username:handle,password},attemptId:'signup-'+uuid()});
 assert.equal(signup.ok,true,JSON.stringify(signup));return {who,token:signup.merchantToken,shopId:signup.state.shops[0].id,businessId:signup.state.business.id};
}
async function get(f,user,query={}){return f.api(user,'/api/loyalty'+(Object.keys(query).length?'?'+new URLSearchParams(query):''));}
async function change(f,user,operation,payload,options={}){
 const current=await get(f,user,options.query||{});assert.equal(current.ok,true,JSON.stringify(current));
 return f.api(user,'/api/loyalty',{operation,payload,mutationId:options.mutationId||uuid(),expectedRevision:options.expectedRevision??current.loyalty.revision});
}
async function setup(f){
 const owner=await ownerSetup(f);
 const saved=await change(f,owner,'saveProgramme',{name:'Kitchen regulars',colour:'#c9f64a',earning:'visits',minimumSpend:2000,target:2,onePerDay:false,shopIds:[owner.shopId],reward:{type:'discount',name:'GH5 off',value:500,cost:500,minimumSpend:2000,expiryDays:30},budgetLimit:10000});assert.equal(saved.ok,true,JSON.stringify(saved));
 const enrolled=await change(f,owner,'enrollMember',{name:'Private member',phone:'0240000678',shopId:owner.shopId,membershipConsent:true,marketingConsent:false});assert.equal(enrolled.ok,true,JSON.stringify(enrolled));
 return {owner,memberId:enrolled.entity.memberId};
}
async function purchase(f,owner,memberId){
 const result=await change(f,owner,'prepareCollection',{memberId,shopId:owner.shopId,grossAmount:2500});assert.equal(result.ok,true,JSON.stringify(result));
 const paid=f.pay(owner.shopId,result.entity.id,result.entity.amount);assert.equal(paid.ok,true);return paid;
}
async function earnReward(f,owner,memberId){await purchase(f,owner,memberId);await purchase(f,owner,memberId);const view=await get(f,owner,{memberId});assert.equal(view.loyalty.member.rewards[0].state,'available');return view.loyalty.member.rewards[0];}
async function invite(f,owner,handle,role='cashier'){
 const invitation=await f.api(owner,'/api/invitations',{name:handle,phone:'0240000002',role,shopIds:[owner.shopId]});assert.equal(invitation.ok,true,JSON.stringify(invitation));
 const who=identity(handle),accepted=await f.api({who},'/api/invitations/accept',{token:invitation.invitation.token,username:handle,password});assert.equal(accepted.ok,true,JSON.stringify(accepted));return {who,token:accepted.merchantToken,user:accepted.user};
}

test('approved loyalty uses only canonical paid journals, persists UUID net requests and replays missing responses',async()=>{
 const f=fixture(),{owner,memberId}=await setup(f),before=f.read();
 const health=await f.api(null,'/api/health');assert.equal(health.features.merchantLoyalty,'1.0.0');assert.match(health.storage,/Supabase/);
 // A JSON transaction that was never posted must not become a loyalty purchase.
 f.mutate(state=>{state.businesses[owner.businessId].transactions.push({id:uuid(),shopId:owner.shopId,amount:9999,status:'paid',payer:'Untrusted JSON sale',createdAt:new Date().toISOString()});});
 const ordinary=await f.api(owner,'/api/session');assert.equal(ordinary.state.transactions.length,0);assert.equal(ordinary.state.loyalty,undefined);assert.doesNotMatch(JSON.stringify(ordinary),/0240000678|Private member|_attempts|consentedAt/);
 const reward=await earnReward(f,owner,memberId),mutationId=uuid(),payload={memberId,shopId:owner.shopId,grossAmount:2500,rewardId:reward.id};
 const prepared=await change(f,owner,'prepareCollection',payload,{mutationId});assert.equal(prepared.ok,true,JSON.stringify(prepared));assert.equal(prepared.entity.amount,2000);assert.equal(prepared.entity.discount,500);assert.match(prepared.entity.id,/^[a-f0-9-]{36}$/);
 const replay=await change(f,owner,'prepareCollection',payload,{mutationId,expectedRevision:0});assert.equal(replay.ok,true,JSON.stringify(replay));assert.equal(replay.replayed,true);assert.equal(replay.entity.id,prepared.entity.id);
 const receipt=await get(f,owner,{mutationId});assert.equal(receipt.loyalty.mutationReceipt.found,true);assert.equal(receipt.loyalty.mutationReceipt.entity.requestId,prepared.entity.id);
 const held=f.read();assert.equal(held.ledger.length,2);assert.equal(held.consumerBalance,before.consumerBalance-5000);assert.equal(held.balances[owner.businessId].balance,5000);assert.equal(held.requests.filter(r=>r.id===prepared.entity.id).length,1);
 const paid=f.pay(owner.shopId,prepared.entity.id,2000,'loyalty-discount-payment');assert.equal(paid.ok,true);assert.equal(f.pay(owner.shopId,prepared.entity.id,2000,'loyalty-discount-payment').id,paid.id);
 // Normal session reconciliation is sufficient; no loyalty screen must be open.
 const session=await f.api(owner,'/api/session');assert.equal(session.state.transactions.length,3);assert.equal(session.state.loyalty,undefined);
 const view=await get(f,owner,{memberId});assert.equal(view.loyalty.member.rewards[0].state,'redeemed');assert.equal(view.loyalty.metrics.discountsGiven,500);assert.equal(view.loyalty.metrics.redeemedRewards,1);assert.equal(view.loyalty.member.progress,0);assert.equal(f.read().consumerBalance,93000);assert.equal(f.read().balances[owner.businessId].balance,7000);
 assert.equal((await get(f,owner,{memberId})).loyalty.member.history.filter(e=>e.type==='reward-redeemed').length,1);
});

test('concurrent net collections serialize a voucher and canonical cancellation invalidates the cached QR before reuse',async()=>{
 const f=fixture(),{owner,memberId}=await setup(f),reward=await earnReward(f,owner,memberId),current=await get(f,owner,{memberId});
 const make=mutationId=>f.api(owner,'/api/loyalty',{operation:'prepareCollection',payload:{memberId,shopId:owner.shopId,grossAmount:2500,rewardId:reward.id},mutationId,expectedRevision:current.loyalty.revision});
 const results=await Promise.all([make(uuid()),make(uuid())]),ok=results.filter(r=>r.ok);assert.equal(ok.length,1,JSON.stringify(results));assert.equal(results.filter(r=>!r.ok).length,1);
 const original=ok[0].entity,before=f.read();
 const cancelled=await f.api(owner,'/api/action',{type:'CANCEL_REQUEST',payload:{id:original.id}});assert.equal(cancelled.ok,true,JSON.stringify(cancelled));assert.equal(f.read().requests.find(r=>r.id===original.id).status,'cancelled');assert.equal(f.pay(owner.shopId,original.id,2000).ok,false);
 const newCollection=await change(f,owner,'prepareCollection',{memberId,shopId:owner.shopId,grossAmount:2500,rewardId:reward.id});assert.equal(newCollection.ok,true,JSON.stringify(newCollection));assert.notEqual(newCollection.entity.id,original.id);assert.equal(f.pay(owner.shopId,original.id,2000).ok,false);assert.equal(f.pay(owner.shopId,newCollection.entity.id,2000).ok,true);
 const view=await get(f,owner,{memberId});assert.equal(view.loyalty.metrics.redeemedRewards,1);assert.equal(f.read().ledger.length,before.ledger.length+1);assert.equal(f.read().balances[owner.businessId].balance,before.balances[owner.businessId].balance+2000);
});

test('ledger-stamp retry cannot cancel a paid discounted collection or release its used voucher',async()=>{
 const f=fixture(),{owner,memberId}=await setup(f),reward=await earnReward(f,owner,memberId);
 const prepared=await change(f,owner,'prepareCollection',{memberId,shopId:owner.shopId,grossAmount:2500,rewardId:reward.id});assert.equal(prepared.ok,true);
 f.race(()=>assert.equal(f.pay(owner.shopId,prepared.entity.id,2000).ok,true));
 const cancelled=await f.api(owner,'/api/action',{type:'CANCEL_REQUEST',payload:{id:prepared.entity.id}});assert.equal(cancelled.ok,false);assert.ok(f.read().retries>=1);assert.equal(f.read().requests.find(r=>r.id===prepared.entity.id).status,'paid');
 const view=await get(f,owner,{memberId});assert.equal(view.loyalty.member.rewards[0].state,'redeemed');assert.equal((await change(f,owner,'prepareCollection',{memberId,shopId:owner.shopId,grossAmount:2500,rewardId:reward.id})).ok,false);assert.equal(f.read().ledger.length,3);
});

test('shared refund authorization and canonical balance remain intact while loyalty reverses progress and reviews discounted returns',async()=>{
 const f=fixture(),{owner,memberId}=await setup(f),reward=await earnReward(f,owner,memberId);
 const prepared=await change(f,owner,'prepareCollection',{memberId,shopId:owner.shopId,grossAmount:2500,rewardId:reward.id});const paid=f.pay(owner.shopId,prepared.entity.id,2000);assert.equal(paid.ok,true);await f.api(owner,'/api/session');
 const denied=await f.api(owner,'/api/action',{type:'REFUND',payload:{transactionId:paid.id,amount:2000,reason:'Return',attemptId:uuid()}});assert.equal(denied.ok,false);assert.equal(denied.code,'STEP_UP_REQUIRED');assert.equal(f.read().ledger.length,3);
 const verified={...owner,who:{...owner.who,passwordVerified:true}},stepup=await f.api(verified,'/api/auth/step-up',{purpose:'refund',currentPassword:password});assert.equal(stepup.ok,true,JSON.stringify(stepup));
 const payload={transactionId:paid.id,amount:2000,reason:'Discounted purchase returned',attemptId:uuid(),stepUpProof:stepup.proof};
 const returned=await f.api(owner,'/api/action',{type:'REFUND',payload});assert.equal(returned.ok,true,JSON.stringify(returned));assert.equal((await f.api(owner,'/api/action',{type:'REFUND',payload})).entity.id,returned.entity.id);
 const view=await get(f,owner,{memberId});assert.equal(view.loyalty.member.rewards[0].state,'redeemed');assert.equal(view.loyalty.reviews.length,1);assert.match(view.loyalty.reviews[0].reason,/consumed reward.*used/);assert.equal(f.read().ledger.filter(j=>j.type==='refund').length,1);assert.equal(f.read().balances[owner.businessId].balance,5000);assert.equal(f.read().consumerBalance,95000);
 const closed=await f.api(owner,'/api/action',{type:'CLOSE_DAY',payload:{shopId:owner.shopId}});assert.equal(closed.ok,true);assert.equal(closed.entity.net,5000);assert.equal((await get(f,owner,{memberId})).loyalty.metrics.redeemedRewards,1);
});

test('approved counter loyalty guards its current operator, private data and owner-only attestation',async()=>{
 const f=fixture(),{owner,memberId}=await setup(f),staff=await invite(f,owner,'loyalty.staff'),staff2=await invite(f,owner,'loyalty.staff2');
 for(const person of [staff,staff2])assert.equal((await f.api(owner,'/api/counter/pin',{userId:person.user.id,pin:person===staff?'147258':'258369'})).ok,true);
 const paired=await f.api(owner,'/api/counter/setup',{deviceId:'loyalty-counter',shopId:owner.shopId,label:'Loyalty till',mode:'shared'});assert.equal(paired.ok,true);const counter={token:owner.token};
 assert.equal((await get(f,counter,{shopId:owner.shopId})).status,423);
 const unlocked=await f.api(counter,'/api/counter/unlock',{userId:staff.user.id,pin:'147258'});assert.equal(unlocked.ok,true,JSON.stringify(unlocked));
 const query={shopId:owner.shopId,counterId:unlocked.counter.id,staffId:unlocked.counter.staffId,shiftId:unlocked.counter.shiftId},view=await get(f,counter,{...query,memberId});assert.equal(view.ok,true,JSON.stringify(view));assert.equal(view.loyalty.members.length,0);assert.equal(view.loyalty.member.phone,undefined);assert.equal(view.state.loyalty,undefined);assert.doesNotMatch(JSON.stringify(view),/0240000678|_attempts|tokenHash|_sharedUserId/);
 const mutationId=uuid(),payload={shopId:owner.shopId,memberId,grossAmount:2500,counterStaffId:query.staffId,counterShiftId:query.shiftId};
 const prepared=await f.api(counter,'/api/loyalty',{operation:'prepareCollection',payload,mutationId,expectedRevision:view.loyalty.revision});assert.equal(prepared.ok,true,JSON.stringify(prepared));assert.equal(prepared.entity.counterId,query.counterId);
 const deny=await f.api(counter,'/api/loyalty',{operation:'recordExternalSale',payload:{memberId,shopId:owner.shopId,amount:2500,method:'cash',reference:'not-authorized',confirmed:true,counterStaffId:query.staffId,counterShiftId:query.shiftId},mutationId:uuid(),expectedRevision:prepared.loyalty.revision});assert.equal(deny.status,403);
 assert.equal((await f.api(counter,'/api/counter/lock',{endShift:true,counterStaffId:query.staffId,counterShiftId:query.shiftId})).ok,true);
 const second=await f.api(counter,'/api/counter/unlock',{userId:staff2.user.id,pin:'258369'});assert.equal(second.ok,true);assert.equal((await get(f,counter,query)).code,'COUNTER_OPERATOR_CHANGED');
 const receipt=await get(f,counter,{shopId:owner.shopId,counterId:second.counter.id,staffId:second.counter.staffId,shiftId:second.counter.shiftId,mutationId});assert.equal(receipt.loyalty.mutationReceipt.found,false);
});


test('expired loyalty collections commit canonical cancellation before releasing a voucher, including a fast-Edge clock race',async()=>{
 const realNow=Date.now;
 try{
  const f=fixture(),{owner,memberId}=await setup(f),reward=await earnReward(f,owner,memberId);
  const prepared=await change(f,owner,'prepareCollection',{memberId,shopId:owner.shopId,grossAmount:2500,rewardId:reward.id});assert.equal(prepared.ok,true);
  Date.now=()=>realNow()+16*60000;
  const released=await get(f,owner,{memberId});assert.equal(released.ok,true,JSON.stringify(released));assert.equal(released.loyalty.member.rewards[0].state,'available');
  assert.equal(f.read().requests.find(r=>r.id===prepared.entity.id).status,'cancelled');assert.equal(f.pay(owner.shopId,prepared.entity.id,2000,uuid(),realNow()).ok,false);
  const again=await change(f,owner,'prepareCollection',{memberId,shopId:owner.shopId,grossAmount:2500,rewardId:reward.id});assert.equal(again.ok,true,JSON.stringify(again));assert.notEqual(again.entity.id,prepared.entity.id);
  Date.now=realNow;
  const f2=fixture(),other=await setup(f2),reward2=await earnReward(f2,other.owner,other.memberId),prepared2=await change(f2,other.owner,'prepareCollection',{memberId:other.memberId,shopId:other.owner.shopId,grossAmount:2500,rewardId:reward2.id});
  const databaseNow=realNow();Date.now=()=>realNow()+16*60000;
  f2.race(()=>assert.equal(f2.pay(other.owner.shopId,prepared2.entity.id,2000,uuid(),databaseNow).ok,true));
  const raced=await get(f2,other.owner,{memberId:other.memberId});assert.equal(raced.ok,true,JSON.stringify(raced));assert.equal(raced.loyalty.member.rewards[0].state,'redeemed');assert.equal(f2.read().requests.find(r=>r.id===prepared2.entity.id).status,'paid');assert.ok(f2.read().retries>=1);assert.equal(f2.read().ledger.length,3);
 }finally{Date.now=realNow;}
});
