// Isolated metadata CAS + canonical journal fixture. Money assertions that require
// PostgreSQL triggers run separately in verification/consumer-loyalty-2.13.0.
import assert from 'node:assert/strict';
import {createMerchantHandler} from '../../supabase/functions/lumo-approved/merchant/handler.mjs';
import {createConsumerLoyalty} from '../../supabase/functions/lumo-approved/consumer-loyalty.mjs';
import {emptyNetwork} from '../../supabase/functions/lumo-approved/merchant/server/network.js';
const uuid=()=>crypto.randomUUID(),clone=x=>structuredClone(x);
export async function consumerLoyaltyFixture(){
 let state=emptyNetwork(),revision=0,ledger=[],requests=[],commits=0,retries=0,beforeCommit=null,offset=0,commitOutcome=null;
 const users=new Map(),balances={},stamp=()=>ledger.map(row=>row.id).join(',');
 const now=()=>Date.now()+offset;
 const serviceRpc=async(name,p)=>{
  if(name==='lumo_approved_merchant_read')return {ok:true,state:clone(state),revision,ledger:clone(ledger),requests:clone(requests),balances:clone(balances),ledgerStamp:stamp()};
  if(name==='lumo_approved_merchant_access'){const b=Object.values(state.businesses).find(b=>b.shops.some(s=>s.id===p.p_shop));return b?{ok:true}:{ok:false,code:'SHOP_UNAVAILABLE'};}
  assert.equal(name,'lumo_approved_merchant_commit');
  if(beforeCommit){const fn=beforeCommit;beforeCommit=null;fn();}
  if(p.p_revision!==revision||p.p_ledger_stamp!==stamp()){retries++;return {ok:false,code:'CONCURRENT_UPDATE'};}
  assert.equal(p.p_money_authorized,false,'consumer fixture cannot authorize refunds');
  for(const b of Object.values(p.p_state.businesses)){
   balances[b.business.id]||={balance:0,accountId:uuid()};
   for(const r of b.requests){
    assert.match(r.id,/^[a-f0-9-]{36}$/);
    const old=requests.find(v=>v.id===r.id);
    if(old){assert.equal(r.amount,old.amount);assert.equal(r.expiresAt,old.expiresAt);if(old.status!=='paid')old.status=r.status;}
    else requests.push({...clone(r),createdBySharedUserId:p.p_state.users.find(u=>u.id===r.createdByUserId)?._sharedUserId});
   }
  }
  state=clone(p.p_state);commits++;revision++;if(commitOutcome){const mode=commitOutcome;commitOutcome=null;if(mode==='throw')throw new TypeError('Synthetic response lost after commit');return mode==='empty'?{}:null;}return {ok:true,revision};
 };
 const merchant=createMerchantHandler({serviceRpc,prototypeFaceOnly:true}),consumer=createConsumerLoyalty({serviceRpc,now});
 const merchantApi=(who,path,body)=>merchant({identity:who?.identity||null,body:{action:'merchant',path,method:body===undefined?'GET':'POST',body:body||{},merchantToken:who?.token}});
 const actor=(name,{personal=true,status='active'}={})=>{
  const userId=uuid(),identity={userId,sessionId:uuid(),user:{email:name+'@pilot.lumo.invalid'}},account={id:uuid(),userId,displayName:name,handle:name,kind:'consumer',status,balance:100000,currency:'GHS'};
  const row={identity,account,personal,live:true};users.set(userId,row);return row;
 };
 const repo=who=>({service:async name=>{assert.equal(name,'load');return who.live?{ok:true,account:clone(who.account),phone:'0240000001',state:null}:{ok:false,code:'SESSION_REVOKED'};},resolve:async query=>who.personal&&who.account.status==='active'&&query===who.identity.userId?{ok:true,recipient:{id:who.identity.userId,userId:who.identity.userId}}:{ok:false,code:'RECIPIENT_NOT_FOUND'}});
 const call=(who,operation,payload={},attemptId)=>consumer({body:{action:'loyalty',operation,payload,...(attemptId?{attemptId}:{})},identity:who.identity,repo:repo(who)});
 const owner=actor('synthetic_owner',{personal:false});
 const signup=await merchantApi(owner,'/api/signup',{name:'Synthetic Kitchen',ownerName:'Fixture owner',phone:'0240000001',businessType:'sole-trader',destination:'Test destination',verification:{identity:true,face:true},shop:{name:'Night Market',area:'Legon',category:'Food',lat:5.65,lng:-.18},credentials:{username:'synthetic_owner',password:'Fixture-only-password-2026'},attemptId:'signup-'+uuid()});
 assert.equal(signup.ok,true,JSON.stringify(signup));owner.token=signup.merchantToken;owner.businessId=signup.state.business.id;owner.shopId=signup.state.shops[0].id;
 const change=async(operation,payload,{attemptId='merchant-'+uuid(),expectedRevision}={})=>{
  const current=await merchantApi(owner,'/api/loyalty');assert.equal(current.ok,true,JSON.stringify(current));
  return merchantApi(owner,'/api/loyalty',{operation,payload,mutationId:attemptId,expectedRevision:expectedRevision??current.loyalty.revision});
 };
 const rule=overrides=>({name:'Kitchen Regulars',colour:'#d6f675',earning:'visits',minimumSpend:2000,target:2,onePerDay:false,shopIds:[owner.shopId],reward:{type:'discount',name:'Five cedis off',value:500,cost:500,minimumSpend:2000,expiryDays:30},budgetLimit:10000,...overrides});
 assert.equal((await change('saveProgramme',rule())).ok,true);state.businesses[owner.businessId].shops[0].published=true;
 const read=()=>({state:clone(state),ledger:clone(ledger),requests:clone(requests),revision,commits,retries});
 const pay=(who,{amount=2500,requestId=null,shopId=owner.shopId,at=now(),canonicalNow=now(),...extra}={})=>{
  const b=Object.values(state.businesses).find(b=>b.shops.some(s=>s.id===shopId));assert.ok(b);
  if(requestId){const r=requests.find(r=>r.id===requestId);assert.ok(r&&r.amount===amount&&r.status==='open'&&Date.parse(r.expiresAt)>canonicalNow);r.status='paid';}
  const receipt={id:uuid(),reference:'FIXTURE-'+uuid(),type:'merchant_payment',amount,merchantId:b.business.id,shopId,requestId,actorUserId:who.identity.userId,payerAccountId:who.account.id,payerName:'Canonical masked payer',createdAt:new Date(at).toISOString(),...extra};
  ledger.push(receipt);balances[b.business.id].balance+=amount;return clone(receipt);
 };
 const refund=(payment,amount=payment.amount)=>{ledger.push({id:uuid(),reference:'RETURN-'+uuid(),type:'refund',amount,merchantId:payment.merchantId,shopId:payment.shopId,requestId:payment.requestId,originalPaymentId:payment.id,refundId:uuid(),createdAt:new Date(now()).toISOString()});};
 return {owner,actor,call,change,rule,merchantApi,pay,refund,read,now,advance:ms=>{offset+=ms;},mutate:fn=>fn(state,requests,ledger),race:fn=>{beforeCommit=fn;},commitOutcome:mode=>{commitOutcome=mode;},repo};
}
