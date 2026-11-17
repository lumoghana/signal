import test from 'node:test';
import assert from 'node:assert/strict';
import {createApprovedHandler} from '../supabase/functions/lumo-approved/handler.mjs';
import {createConsumerLoyalty} from '../supabase/functions/lumo-approved/consumer-loyalty.mjs';
import {emptyNetwork} from '../supabase/functions/lumo-approved/merchant/server/network.js';
import {normalizeLoyalty,LOYALTY_CONSENT_VERSION} from '../supabase/functions/lumo-approved/merchant/dist/loyalty-model.js';

const user='10000000-0000-4000-8000-000000000001',other='10000000-0000-4000-8000-000000000002',owner='10000000-0000-4000-8000-000000000003';
const session='20000000-0000-4000-8000-000000000001',business='30000000-0000-4000-8000-000000000001',shop='40000000-0000-4000-8000-000000000001';
const clone=x=>structuredClone(x),json=x=>new Response(JSON.stringify(x),{headers:{'Content-Type':'application/json'}});
function fixture(){
 let state=emptyNetwork(),revision=0,personal=true,live=true,lostCommit=false,commits=0;const calls=[];
 const rule={version:1,earning:'visits',minimumSpend:2000,target:5,onePerDay:false,shopIds:[shop],reward:{type:'discount',name:'Five cedis off',value:500,cost:500,minimumSpend:2000,expiryDays:30}};
 state.businesses[business]={business:{id:business,name:'Private Kitchen'},shops:[{id:shop,name:'Night Market',published:true,accepting:true,open:true}],requests:[],transactions:[],refunds:[],shifts:[],audit:[],loyalty:normalizeLoyalty({programme:{id:'programme-a',name:'Kitchen Regulars',colour:'#c9f64a',status:'active',currentVersion:1,budgetLimit:10000,statusHistory:[{status:'active',changedAt:'2026-01-01T00:00:00Z'}]},ruleVersions:[rule],members:[{id:'private-other-membership',name:'Other customer private contact',phone:'0249999999',code:'LC-OTHER-PRIVATE',active:true,joinedShopId:shop,ruleVersion:1,createdAt:'2026-01-01T00:00:00Z',_consumerUserId:other,_consumerAccountId:'50000000-0000-4000-8000-000000000002',_consumerLinkedAt:'2026-01-01T00:00:00Z'}]})};
 state.users=[{id:'merchant-owner',businessId:business,role:'owner',active:true,_sharedUserId:owner}];
 const request=(operation,payload={},attemptId,actor=user)=>{const token=['x',Buffer.from(JSON.stringify({sub:actor,session_id:session})).toString('base64url'),'x'].join('.');return new Request('https://pilot.example/functions/v1/lumo-approved',{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+token},body:JSON.stringify({action:'loyalty',operation,payload,...(attemptId?{attemptId}:{})})});};
 const handler=createApprovedHandler({supabaseUrl:'https://project.supabase.co',serviceRoleKey:'fixture-service-key',fetch:async(url,options)=>{
  const path=new URL(url).pathname,body=options.body?JSON.parse(options.body):null;calls.push({path,body});
  const actor=body?.p_payload?.actor||body?.p_actor||(()=>{try{return JSON.parse(Buffer.from(options.headers.Authorization.split(' ')[1].split('.')[1],'base64url').toString()).sub}catch{return user}})();
  if(path==='/auth/v1/user')return json({id:actor,app_metadata:{lumo_pilot:true}});
  if(path==='/rest/v1/rpc/lumo_approved_service'){
   assert.equal(body.p_payload.actor,actor);
   if(body.p_command==='load')return live?json({ok:true,account:{id:'50000000-0000-4000-8000-'+actor.slice(-12),userId:actor,displayName:'Signed in customer',balance:0},state:null}):json({ok:false,code:'SESSION_REVOKED'});
   if(body.p_command==='resolve')return json(personal?{ok:true,recipient:{userId:actor,id:actor}}:{ok:false,code:'RECIPIENT_NOT_FOUND'});
  }
  if(path==='/rest/v1/rpc/lumo_approved_merchant_read')return json({ok:true,state:clone(state),revision,ledger:[],requests:[],balances:{},ledgerStamp:''});
  if(path==='/rest/v1/rpc/lumo_approved_merchant_commit'){
   assert.equal(body.p_actor,user);assert.equal(body.p_money_authorized,false);assert.equal(body.p_revision,revision);state=clone(body.p_state);revision++;commits++;if(lostCommit){lostCommit=false;return new Response('interrupted JSON acknowledgement',{status:200});}return json({ok:true,revision});
  }
  throw Error('Unexpected HTTP path '+path);
 }});
 const call=async(...args)=>{const response=await handler(request(...args));return {response,data:await response.json()};};
 return {handler,request,call,calls,getState:()=>clone(state),commits:()=>commits,setPersonal:value=>personal=value,setLive:value=>live=value,loseNextCommit:()=>lostCommit=true};
}

test('HTTP consumer rewards is authenticated and projects no other membership, contacts or merchant funds',async()=>{
 const f=fixture(),reply=await f.call('list');assert.equal(reply.response.status,200);assert.equal(reply.data.ok,true);assert.deepEqual(reply.data.loyalty.memberships,[]);assert.doesNotMatch(JSON.stringify(reply.data),/Other customer|0249999999|LC-OTHER|budgetLimit|_consumer|service-key/);
 const unsigned=new Request('https://pilot.example/functions/v1/lumo-approved',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action:'loyalty',operation:'list',payload:{}})});const response=await f.handler(unsigned);assert.equal(response.status,401);assert.equal((await response.json()).code,'AUTH_REQUIRED');
});

test('consumer rewards rejects forged actor fields and merchant staff without a personal account',async()=>{
 const f=fixture();const forged=await f.call('list',{actor:other});assert.equal(forged.response.status,400);assert.equal(forged.data.code,'INVALID_INPUT');assert.equal(f.commits(),0);
 f.setPersonal(false);const staff=await f.call('list');assert.equal(staff.response.status,403);assert.equal(staff.data.code,'PERSONAL_ACCOUNT_REQUIRED');assert.equal(f.commits(),0);
});

test('terminal revoked consumer session remains a 401 so clients clear private state',async()=>{
 const f=fixture();f.setLive(false);const reply=await f.call('list');assert.equal(reply.response.status,401);assert.equal(reply.data.code,'SESSION_REVOKED');assert.equal(f.calls.some(c=>c.path.endsWith('lumo_approved_merchant_read')),false);
});

test('lost commit acknowledgement stays uncertain and the original account recovers the same join receipt',async()=>{
 const f=fixture(),attempt='consumer-join-original-http',payload={shopId:shop,ruleVersion:1,consentVersion:LOYALTY_CONSENT_VERSION,membershipConsent:true,marketingConsent:false};
 f.loseNextCommit();const lost=await f.call('join',payload,attempt);assert.equal(lost.response.status,503);assert.equal(lost.response.headers.get('X-Lumo-No-Mutation'),'false');assert.equal(f.commits(),1);
 const recovered=await f.call('recover',{attemptId:attempt});assert.equal(recovered.data.loyalty.mutationReceipt.found,true);assert.equal(recovered.data.loyalty.mutationReceipt.operation,'join');const id=recovered.data.loyalty.mutationReceipt.entity.membershipId;
 const replay=await f.call('join',payload,attempt);assert.equal(replay.data.replayed,true);assert.equal(replay.data.entity.membershipId,id);assert.equal(f.commits(),1);assert.equal(f.getState().businesses[business].loyalty.members.filter(m=>m._consumerUserId===user).length,1);
 const foreign=await f.call('recover',{attemptId:attempt},undefined,other);assert.equal(foreign.data.loyalty.mutationReceipt.found,false);assert.doesNotMatch(JSON.stringify(foreign.data),new RegExp(id));
});

test('joining an already owned programme is a semantic no-op, not a merchant history write',async()=>{
 const f=fixture(),payload={shopId:shop,ruleVersion:1,consentVersion:LOYALTY_CONSENT_VERSION,membershipConsent:true,marketingConsent:false};const first=await f.call('join',payload,'consumer-first-join');assert.equal(first.data.ok,true);const before=f.commits();for(let n=0;n<5;n++){const reply=await f.call('join',payload,'consumer-extra-join-'+n);assert.equal(reply.data.entity.membershipId,first.data.entity.membershipId);}assert.equal(f.commits(),before);
});

test('a bearer cashier discount explains its amount without exposing another member or reward id',async()=>{
 const requestId=crypto.randomUUID(),network=emptyNetwork();network.businesses[business]={business:{id:business,name:'Kitchen'},shops:[{id:shop,name:'Shop'}],requests:[{id:requestId,shopId:shop,amount:2000,status:'open'}],transactions:[],refunds:[],loyalty:normalizeLoyalty({members:[{id:'private-membership',_consumerUserId:other}],collections:[{id:'private-collection',requestId,memberId:'private-membership',grossAmount:2500,discount:500,amount:2000,rewardId:'private-reward'}]})};
 const helper=createConsumerLoyalty({serviceRpc:async()=>({ok:true,state:network,revision:0,ledger:[],requests:[],balances:{},ledgerStamp:''})});const result=await helper.assertRequest({userId:user,sessionId:session},requestId);assert.deepEqual(result,{grossAmount:2500,discount:500,amount:2000});assert.doesNotMatch(JSON.stringify(result),/private-/);
 const own=await helper.assertRequest({userId:other,sessionId:session},requestId);assert.equal(own.membershipId,'private-membership');assert.equal(own.rewardId,'private-reward');
});
