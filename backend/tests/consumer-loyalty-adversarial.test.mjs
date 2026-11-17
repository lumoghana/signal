import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {consumerLoyaltyFixture} from './fixtures/consumer-loyalty-fixture.mjs';
const ref=()=>crypto.randomUUID(),hash=value=>createHash('sha256').update(value).digest('hex');
const joining=(view,shopId)=>({shopId,ruleVersion:view.ruleVersion,consentVersion:view.consentVersion,membershipConsent:true,marketingConsent:false});
async function join(f,who=f.actor('Ama'),attemptId=ref()){
 const preview=await f.call(who,'programme',{shopId:f.owner.shopId});
 const result=await f.call(who,'join',joining(preview.loyalty.programme,f.owner.shopId),attemptId);
 return {who,result,id:result.entity.membershipId};
}
async function enroll(f,name='Existing private member'){
 const r=await f.change('enrollMember',{name,phone:'0240000789',shopId:f.owner.shopId,membershipConsent:true,marketingConsent:false});assert.equal(r.ok,true,JSON.stringify(r));return r.entity.memberId;
}
async function grant(f,memberId,code='LC1-'+crypto.randomUUID().replaceAll('-','').toUpperCase()+crypto.randomUUID().replaceAll('-','').slice(0,16).toUpperCase()){
 const r=await f.change('createLinkGrant',{memberId,shopId:f.owner.shopId,claimHash:hash(code)});assert.equal(r.ok,true,JSON.stringify(r));return {code,result:r};
}
async function reward(f,who,id){f.pay(who);f.pay(who);const view=await f.call(who,'detail',{membershipId:id});assert.equal(view.loyalty.membership.rewards[0].state,'available');return view.loyalty.membership.rewards[0];}

test('a static membership card cannot claim a customer; private linking previews pinned terms without identity',async()=>{
 const f=await consumerLoyaltyFixture(),id=await enroll(f),raw=f.read().state.businesses[f.owner.businessId].loyalty.members.find(m=>m.id===id),who=f.actor('Claimant');
 await assert.rejects(f.call(who,'programme',{claimCode:raw.code}),e=>e.code==='LOYALTY_CLAIM_INVALID');
 assert.equal((await f.change('saveProgramme',f.rule({target:9}))).ok,true);
 const {code}=await grant(f,id),preview=(await f.call(who,'programme',{claimCode:code})).loyalty.programme;
 assert.equal(preview.ruleVersion,1);assert.equal(preview.rules.target,2);assert.equal(preview.claim,true);
 assert.doesNotMatch(JSON.stringify(preview),/Existing private member|0240000789/);
 const result=await f.call(who,'claim',{claimCode:code,...joining(preview,f.owner.shopId)},ref()).catch(e=>e);
 // Claim has a different field contract from joining a public programme.
 assert.equal(result.code,'INVALID_INPUT');
 const claimed=await f.call(who,'claim',{claimCode:code,ruleVersion:preview.ruleVersion,consentVersion:preview.consentVersion,membershipConsent:true,marketingConsent:false},ref());
 assert.equal(claimed.loyalty.membership.ruleVersion,1);assert.equal(claimed.loyalty.membership.target,2);
 const stored=f.read().state.businesses[f.owner.businessId].loyalty;assert.equal(stored._claimGrants[0].hash,hash(code));assert.doesNotMatch(JSON.stringify(stored),new RegExp(code));
 const session=await f.merchantApi(f.owner,'/api/session');assert.doesNotMatch(JSON.stringify(session),new RegExp(code+'|'+hash(code)+'|'+who.identity.userId));
 await assert.rejects(f.call(f.actor('Attacker'),'claim',{claimCode:code,ruleVersion:1,consentVersion:preview.consentVersion,membershipConsent:true,marketingConsent:false},ref()),e=>e.code==='LOYALTY_CLAIM_INVALID');
});

test('rotating or expiring a private claim code invalidates it before an account can claim',async()=>{
 const f=await consumerLoyaltyFixture(),id=await enroll(f),one=await grant(f,id),two=await grant(f,id),who=f.actor('Ama');
 await assert.rejects(f.call(who,'programme',{claimCode:one.code}),e=>e.code==='LOYALTY_CLAIM_INVALID');
 assert.equal((await f.call(who,'programme',{claimCode:two.code})).loyalty.programme.claim,true);
 f.advance(11*60000);await assert.rejects(f.call(who,'programme',{claimCode:two.code}),e=>e.code==='LOYALTY_CLAIM_INVALID');
 assert.equal(f.read().state.businesses[f.owner.businessId].loyalty.members.find(m=>m.id===id)._consumerUserId,undefined);
});

test('join requires exactly the displayed rule version and separate explicit consent',async()=>{
 const f=await consumerLoyaltyFixture(),who=f.actor('Ama'),preview=(await f.call(who,'programme',{shopId:f.owner.shopId})).loyalty.programme;
 assert.equal((await f.change('saveProgramme',f.rule({target:4}))).ok,true);
 await assert.rejects(f.call(who,'join',joining(preview,f.owner.shopId),ref()),e=>e.code==='LOYALTY_TERMS_CHANGED');
 const current=(await f.call(who,'programme',{shopId:f.owner.shopId})).loyalty.programme;
 const payload=joining(current,f.owner.shopId);delete payload.marketingConsent;
 await assert.rejects(f.call(who,'join',payload,ref()),e=>e.code==='LOYALTY_TERMS_CHANGED');
 const accepted=await f.call(who,'join',joining(current,f.owner.shopId),ref());assert.equal(accepted.loyalty.membership.ruleVersion,2);assert.equal(accepted.loyalty.membership.marketingConsent,false);
});

test('automatic earning follows canonical actor, ignores guest and pre-link purchases, and reconciles once',async()=>{
 const f=await consumerLoyaltyFixture(),who=f.actor('Ama');f.pay(who,{at:Date.now()-60000});const {id}=await join(f,who);
 f.pay(who,{payerAccountId:crypto.randomUUID(),approvedGroupId:'shared-funds'});
 f.pay(who,{guestCollectionId:crypto.randomUUID(),providerMode:'sandbox'});
 const first=(await f.call(who,'detail',{membershipId:id})).loyalty.membership;assert.equal(first.progress,1);assert.equal(first.rewards.length,0);
 const again=(await f.call(who,'detail',{membershipId:id})).loyalty.membership;assert.equal(again.progress,1);assert.equal(again.history.filter(e=>e.type==='earn').length,1);
 const stored=f.read().state.businesses[f.owner.businessId].loyalty;assert.equal(stored.links.length,1);
});

test('membership records and lost-response receipts remain owned across a fresh session',async()=>{
 const f=await consumerLoyaltyFixture(),who=f.actor('Ama'),attemptId=ref(),{id}=await join(f,who,attemptId),other=f.actor('Kojo');
 who.identity.sessionId=crypto.randomUUID();const receipt=await f.call(who,'recover',{attemptId});assert.equal(receipt.loyalty.mutationReceipt.found,true);assert.equal(receipt.loyalty.mutationReceipt.entity.membershipId,id);
 const hidden=await f.call(other,'recover',{attemptId});assert.equal(hidden.loyalty.mutationReceipt.found,false);assert.equal(hidden.loyalty.memberships.length,0);
 await assert.rejects(f.call(other,'detail',{membershipId:id}),e=>e.code==='LOYALTY_MEMBERSHIP_UNAVAILABLE');
 await assert.rejects(f.call(f.actor('Cashier',{personal:false}),'join',{shopId:f.owner.shopId,ruleVersion:1,consentVersion:'2026-11-17.merchant-loyalty.1',membershipConsent:true,marketingConsent:false},ref()),e=>e.code==='PERSONAL_ACCOUNT_REQUIRED');
});

test('revoked consumer sessions are terminal authentication errors, never mislabelled merchant staff',async()=>{
 const f=await consumerLoyaltyFixture(),{who}=await join(f);who.live=false;
 await assert.rejects(f.call(who,'list'),e=>e.code==='SESSION_REVOKED'&&e.status===401);
});

test('a committed mutation with an unreadable response stays uncertain and recovers its exact original outcome',async()=>{
 for(const mode of ['throw','empty','null']){
  const f=await consumerLoyaltyFixture(),who=f.actor('Ama'),preview=(await f.call(who,'programme',{shopId:f.owner.shopId})).loyalty.programme,attemptId=ref();
  f.commitOutcome(mode);await assert.rejects(f.call(who,'join',joining(preview,f.owner.shopId),attemptId),e=>e.noMutation!==true);
  const saved=await f.call(who,'recover',{attemptId});assert.equal(saved.loyalty.mutationReceipt.found,true);assert.equal(saved.loyalty.memberships.length,1);
  const replay=await f.call(who,'join',joining(preview,f.owner.shopId),attemptId);assert.equal(replay.replayed,true);assert.equal(replay.entity.membershipId,saved.loyalty.mutationReceipt.entity.membershipId);
  assert.equal(f.read().state.businesses[f.owner.businessId].loyalty.members.length,1);
 }
});

test('a held consumer discount cannot be redeemed concurrently through a cashier collection',async()=>{
 const f=await consumerLoyaltyFixture(),{who,id}=await join(f),earned=await reward(f,who,id),attemptId=ref();
 const p={membershipId:id,shopId:f.owner.shopId,grossAmount:2500,rewardId:earned.id};
 const held=await f.call(who,'prepare',p,attemptId);assert.equal(held.entity.amount,2000);assert.equal(held.entity.discount,500);assert.equal(f.read().requests.length,1);
 const duplicate=await f.call(who,'prepare',p,attemptId);assert.equal(duplicate.entity.requestId,held.entity.requestId);assert.equal(f.read().requests.length,1);
 const cashier=await f.change('prepareCollection',{memberId:id,shopId:f.owner.shopId,grossAmount:2500,rewardId:earned.id});assert.equal(cashier.ok,false);assert.equal(cashier.code,'LOYALTY_REWARD_UNAVAILABLE');
 const paid=f.pay(who,{requestId:held.entity.requestId,amount:2000});const used=(await f.call(who,'detail',{membershipId:id})).loyalty.membership;
 assert.equal(used.rewards[0].state,'redeemed');f.refund(paid);const returned=(await f.call(who,'detail',{membershipId:id})).loyalty.membership;assert.equal(returned.rewards[0].state,'redeemed');
 assert.equal(returned.history.filter(e=>e.type==='reward-redeemed').length,1);
});

test('a payment winning the cancellation CAS keeps its reward consumed and original request paid',async()=>{
 const f=await consumerLoyaltyFixture(),{who,id}=await join(f),earned=await reward(f,who,id),held=await f.call(who,'prepare',{membershipId:id,shopId:f.owner.shopId,grossAmount:2500,rewardId:earned.id},ref());
 f.race(()=>f.pay(who,{requestId:held.entity.requestId,amount:2000}));
 await assert.rejects(f.call(who,'cancel',{membershipId:id,requestId:held.entity.requestId},ref()),e=>e.code==='REQUEST_PROCESSING');
 const view=(await f.call(who,'detail',{membershipId:id})).loyalty.membership;assert.equal(view.rewards[0].state,'redeemed');assert.equal(f.read().requests.find(r=>r.id===held.entity.requestId).status,'paid');assert.ok(f.read().retries>0);
});

test('terminal repeated cancellation cannot allocate unbounded fresh mutation receipts',async()=>{
 const f=await consumerLoyaltyFixture(),{who,id}=await join(f),earned=await reward(f,who,id),held=await f.call(who,'prepare',{membershipId:id,shopId:f.owner.shopId,grossAmount:2500,rewardId:earned.id},ref()),payload={membershipId:id,requestId:held.entity.requestId};
 await f.call(who,'cancel',payload,ref());const count=Object.keys(f.read().state.businesses[f.owner.businessId].loyalty._consumerAttempts).length;
 for(let i=0;i<12;i++)await f.call(who,'cancel',payload,ref());
 assert.ok(Object.keys(f.read().state.businesses[f.owner.businessId].loyalty._consumerAttempts).length<=count+1,'semantically completed cancellation must not grow request history with arbitrary new references');
 assert.equal((await f.call(who,'detail',{membershipId:id})).loyalty.membership.rewards[0].state,'available');
});

test('an existing membership links and honours earned rewards while new earning is paused at capacity',async()=>{
 const f=await consumerLoyaltyFixture(),id=await enroll(f),who=f.actor('Ama');assert.equal((await f.change('adjustProgress',{memberId:id,shopId:f.owner.shopId,units:2,reason:'Existing earned visits'})).ok,true);
 f.mutate(state=>{const l=state.businesses[f.owner.businessId].loyalty;l.capacityPaused=true;l.programme.status='paused';});
 const {code}=await grant(f,id),preview=(await f.call(who,'programme',{claimCode:code})).loyalty.programme;
 const linked=await f.call(who,'claim',{claimCode:code,ruleVersion:preview.ruleVersion,consentVersion:preview.consentVersion,membershipConsent:true,marketingConsent:false},ref());assert.equal(linked.loyalty.membership.id,id);assert.equal(linked.loyalty.membership.capacityPaused,true);
 const earned=linked.loyalty.membership.rewards[0],held=await f.call(who,'prepare',{membershipId:id,shopId:f.owner.shopId,grossAmount:2500,rewardId:earned.id},ref());assert.equal(held.entity.amount,2000);assert.equal(held.loyalty.membership.rewards[0].state,'held');
});

test('already owned join is a semantic read and cannot exhaust the merchant receipt register',async()=>{
 const f=await consumerLoyaltyFixture(),{who,id}=await join(f),p=(await f.call(who,'programme',{shopId:f.owner.shopId})).loyalty.programme,before=f.read();
 for(let i=0;i<12;i++){const r=await f.call(who,'join',joining(p,f.owner.shopId),ref());assert.equal(r.entity.membershipId,id);}
 assert.equal(f.read().commits,before.commits);assert.equal(Object.keys(f.read().state.businesses[f.owner.businessId].loyalty._consumerAttempts).length,Object.keys(before.state.businesses[f.owner.businessId].loyalty._consumerAttempts).length);
});

test('expiry releases a consumer hold only after canonical invalidation; payment winning its CAS stays consumed',async()=>{
 for(const payWins of [false,true]){
  const f=await consumerLoyaltyFixture(),{who,id}=await join(f),earned=await reward(f,who,id),held=await f.call(who,'prepare',{membershipId:id,shopId:f.owner.shopId,grossAmount:2500,rewardId:earned.id},ref());
  f.advance(16*60000);if(payWins)f.race(()=>f.pay(who,{requestId:held.entity.requestId,amount:2000,at:Date.now(),canonicalNow:Date.now()}));
  const result=await f.call(who,'detail',{membershipId:id}),request=f.read().requests.find(r=>r.id===held.entity.requestId);
  assert.equal(request.status,payWins?'paid':'cancelled');assert.equal(result.loyalty.membership.rewards[0].state,payWins?'redeemed':'available');if(payWins)assert.ok(f.read().retries>0);
 }
});

test('consumer payloads cannot choose another identity, member name or merchant rule version',async()=>{
 const f=await consumerLoyaltyFixture(),who=f.actor('Ama'),p=(await f.call(who,'programme',{shopId:f.owner.shopId})).loyalty.programme;
 for(const extra of [{userId:ref()},{name:'Forged owner'},{phone:'0249999999'},{_consumerUserId:ref()}])await assert.rejects(f.call(who,'join',{...joining(p,f.owner.shopId),...extra},ref()),e=>e.code==='INVALID_INPUT');
 assert.equal(f.read().state.businesses[f.owner.businessId].loyalty.members.length,0);
});
