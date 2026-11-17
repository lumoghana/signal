import test from 'node:test';
import assert from 'node:assert/strict';
import {mutateLoyalty,reconcileLoyalty,loyaltyProjection,bindLoyaltyCollection,releaseLoyaltyCollection} from '../server/loyalty.js';
import {loyaltyMemberBalance,loyaltyBudgetUsed,loyaltyTerms} from '../dist/loyalty-model.js';

const DAY=86400000,START=Date.parse('2026-11-17T08:00:00Z');
const rule=overrides=>({name:'Kitchen regulars',colour:'#c9f64a',earning:'visits',minimumSpend:1000,target:2,onePerDay:false,shopIds:['s1','s2'],reward:{type:'discount',name:'GH₵5 off',value:500,cost:500,minimumSpend:1000,expiryDays:30},budgetLimit:10000,...overrides});
function fixture(options={}){
 const b={business:{id:'b1',name:'Kitchen'},shops:[{id:'s1',name:'Night Market'},{id:'s2',name:'Pentagon'}],transactions:[],requests:[],refunds:[],shifts:[],closings:[]},n={businesses:{b1:b},audit:[]};
 const c={user:{id:'owner',businessId:'b1',role:'owner',shopIds:['s1','s2']},session:{id:'owner-session'}};let seq=0,now=START;
 const run=(operation,payload,context=c,extra={})=>mutateLoyalty(n,context,{operation,payload,mutationId:'test-mutation-'+(++seq),expectedRevision:b.loyalty?.revision||0,...extra},{now});
 run('saveProgramme',rule(options));now+=60000;const enrolled=run('enrollMember',{name:'Ama Mensah',phone:'0240000001',shopId:'s1',membershipConsent:true,marketingConsent:false});
 const memberId=enrolled.entity.id;
 const paid=(id,amount=1000,shopId='s1',at=now+60000)=>{const t={id,amount,shopId,status:'paid',createdAt:new Date(at).toISOString(),confirmedAt:new Date(at).toISOString()};b.transactions.push(t);now=Math.max(now,at);return t;};
 const attach=(id,amount=1000,shopId='s1',at)=>{paid(id,amount,shopId,at);return run('attachPayment',{memberId,transactionId:id,shopId});};
 return {b,n,c,run,paid,attach,memberId,get now(){return now;},set now(value){now=value;}};
}

test('visit awards are server-derived, one-use and unchanged by repeated reconciliation',()=>{
 const f=fixture();f.attach('p1');assert.equal(loyaltyMemberBalance(f.b.loyalty,f.memberId),1);f.attach('p2');
 assert.equal(f.b.loyalty.rewards.length,1);assert.equal(loyaltyMemberBalance(f.b.loyalty,f.memberId),0);
 const prior=JSON.stringify(f.b.loyalty);assert.equal(reconcileLoyalty(f.b,{now:f.now}),false);assert.equal(JSON.stringify(f.b.loyalty),prior);
});
test('cumulative spending retains remainder and can earn multiple funded rewards',()=>{
 const f=fixture({earning:'spend',minimumSpend:100,target:2500});f.attach('p1',6000);
 assert.equal(f.b.loyalty.rewards.length,2);assert.equal(loyaltyMemberBalance(f.b.loyalty,f.memberId),1000);assert.equal(loyaltyBudgetUsed(f.b.loyalty),1000);
});
test('daily visit limit spans shops and does not duplicate on repeat pulls',()=>{
 const f=fixture({onePerDay:true,target:3});f.attach('p1',1000,'s1');f.attach('p2',2000,'s2');
 assert.equal(loyaltyMemberBalance(f.b.loyalty,f.memberId),1);f.attach('p3',1000,'s2',START+DAY+60000);
 assert.equal(loyaltyMemberBalance(f.b.loyalty,f.memberId),2);assert.equal(reconcileLoyalty(f.b,{now:f.now}),false);
});
test('pending, failed and pre-membership sales never earn',()=>{
 const f=fixture();for(const status of ['processing','failed']){f.b.transactions.push({id:status,shopId:'s1',status,amount:5000,createdAt:new Date(f.now).toISOString()});assert.throws(()=>f.run('attachPayment',{memberId:f.memberId,transactionId:status,shopId:'s1'}),{code:'LOYALTY_SALE_UNAVAILABLE'});}
 f.paid('old',2000,'s1',START-1);assert.throws(()=>f.run('attachPayment',{memberId:f.memberId,transactionId:'old',shopId:'s1'}),{code:'LOYALTY_PRE_MEMBERSHIP'});assert.equal(f.b.loyalty.ledger.some(e=>e.type==='earn'),false);
});
test('idempotent requests bind exact original details, actor and session',()=>{
 const f=fixture();const input={operation:'enrollMember',payload:{name:'Kojo',shopId:'s1',membershipConsent:true,marketingConsent:false},mutationId:'stable-enrollment-123',expectedRevision:f.b.loyalty.revision};
 const first=mutateLoyalty(f.n,f.c,input,{now:f.now}),second=mutateLoyalty(f.n,f.c,input,{now:f.now});assert.equal(second.replayed,true);assert.equal(second.entity.id,first.entity.id);assert.equal(f.b.loyalty.members.length,2);
 assert.throws(()=>mutateLoyalty(f.n,f.c,{...input,payload:{...input.payload,name:'Someone else'}},{now:f.now}),{code:'LOYALTY_REFERENCE_CONFLICT'});
 assert.throws(()=>mutateLoyalty(f.n,{...f.c,session:{id:'fresh'}},input,{now:f.now}),{code:'LOYALTY_REFERENCE_CONFLICT'});
});
test('programme changes protect existing member terms and only new members join the new version',()=>{
 const f=fixture();f.attach('p1');f.run('saveProgramme',rule({target:10,reward:{type:'discount',name:'Ten off',value:1000,cost:1000,minimumSpend:2000,expiryDays:20}}));
 f.attach('p2');assert.equal(f.b.loyalty.rewards[0].value,500);assert.equal(f.b.loyalty.members[0].ruleVersion,1);
 const next=f.run('enrollMember',{name:'Kojo',shopId:'s2',membershipConsent:true,marketingConsent:false});assert.equal(f.b.loyalty.members.find(m=>m.id===next.entity.id).ruleVersion,2);
});
test('budget exhaustion stops new earning without wiping progress or existing vouchers',()=>{
 const f=fixture({budgetLimit:500});f.attach('p1');f.attach('p2');assert.equal(f.b.loyalty.rewards.length,1);f.attach('p3');f.attach('p4');
 assert.equal(f.b.loyalty.rewards.length,1);assert.equal(loyaltyMemberBalance(f.b.loyalty,f.memberId),1);assert.equal(f.b.loyalty.links.find(l=>l.transactionId==='p4').earningState,'budget-paused');
 f.run('setBudget',{amount:1000});assert.equal(f.b.loyalty.rewards.length,1);assert.equal(loyaltyMemberBalance(f.b.loyalty,f.memberId),1);f.attach('p5');assert.equal(f.b.loyalty.rewards.length,2);
});
test('pause preserves rewards, paid-during-pause does not backfill, and earlier paid receipts retain eligibility',()=>{
 const f=fixture();f.attach('p1');f.now+=60000;const early=f.paid('early',1000,'s1',f.now);f.now+=60000;f.run('setPaused',{paused:true});
 f.run('attachPayment',{memberId:f.memberId,transactionId:early.id,shopId:'s1'});assert.equal(f.b.loyalty.rewards.length,1);
 f.attach('paused',1000,'s1',f.now+60000);assert.equal(f.b.loyalty.links.find(l=>l.transactionId==='paused').earningState,'paused');f.now+=60000;f.run('setPaused',{paused:false});assert.equal(loyaltyMemberBalance(f.b.loyalty,f.memberId),0);
});
test('partial refunds use remaining paid amount and full refunds revoke unused rewards only once',()=>{
 const f=fixture({earning:'spend',target:2500,minimumSpend:100});f.attach('p1',3000);assert.equal(f.b.loyalty.rewards.length,1);
 f.b.refunds.push({id:'r1',transactionId:'p1',amount:500,status:'paid'});reconcileLoyalty(f.b,{now:f.now});assert.equal(loyaltyMemberBalance(f.b.loyalty,f.memberId),0);assert.equal(f.b.loyalty.rewards[0].state,'available');
 f.b.refunds.push({id:'r2',transactionId:'p1',amount:2500,status:'paid'});reconcileLoyalty(f.b,{now:f.now});assert.equal(f.b.loyalty.rewards[0].state,'revoked');assert.equal(loyaltyMemberBalance(f.b.loyalty,f.memberId),0);assert.equal(loyaltyBudgetUsed(f.b.loyalty),0);assert.equal(reconcileLoyalty(f.b,{now:f.now}),false);
});
test('discount collection holds one voucher, paid confirmation consumes it and discounted-sale returns go to review',()=>{
 const f=fixture();f.attach('p1');f.attach('p2');const reward=f.b.loyalty.rewards[0],prepared=f.run('prepareCollection',{memberId:f.memberId,shopId:'s1',grossAmount:2000,rewardId:reward.id}).entity;
 assert.equal(prepared.amount,1500);const request={id:'request1',shopId:'s1',amount:1500,status:'open',expiresAt:prepared.expiresAt};f.b.requests.push(request);bindLoyaltyCollection(f.b,request,prepared);
 assert.throws(()=>f.run('prepareCollection',{memberId:f.memberId,shopId:'s1',grossAmount:2000,rewardId:reward.id}),{code:'LOYALTY_REWARD_UNAVAILABLE'});
 f.paid('paid-discount',1500);f.b.transactions.at(-1).requestId=request.id;reconcileLoyalty(f.b,{now:f.now});assert.equal(f.b.loyalty.rewards[0].state,'redeemed');assert.equal(loyaltyMemberBalance(f.b.loyalty,f.memberId),0);
 f.b.refunds.push({id:'return-discount',transactionId:'paid-discount',amount:1500,status:'paid'});reconcileLoyalty(f.b,{now:f.now});assert.equal(f.b.loyalty.rewards[0].state,'redeemed');assert.equal(f.b.loyalty.reviews.filter(r=>r.sourceId.startsWith('discount-return')).length,1);assert.equal(reconcileLoyalty(f.b,{now:f.now}),false);
});
test('held reward survives earning refund until canonical cancellation, then becomes revoked',()=>{
 const f=fixture();f.attach('p1');f.attach('p2');const prepared=f.run('prepareCollection',{memberId:f.memberId,shopId:'s1',grossAmount:2000,rewardId:f.b.loyalty.rewards[0].id}).entity;
 const request={id:'request1',shopId:'s1',amount:prepared.amount,status:'open',expiresAt:prepared.expiresAt};f.b.requests.push(request);bindLoyaltyCollection(f.b,request,prepared);
 f.b.refunds.push({id:'r1',transactionId:'p1',amount:1000,status:'paid'});reconcileLoyalty(f.b,{now:f.now});assert.equal(f.b.loyalty.rewards[0].state,'held');assert.equal(f.b.loyalty.reviews.length,1);
 assert.equal(releaseLoyaltyCollection(f.b,'request1',{now:f.now}),false);request.status='cancelled';assert.equal(releaseLoyaltyCollection(f.b,'request1',{now:f.now}),true);reconcileLoyalty(f.b,{now:f.now});assert.equal(f.b.loyalty.rewards[0].state,'revoked');assert.equal(f.b.loyalty.reviews.length,1);
});
test('external cash records are owner/delegated-manager attestations and their returns do not touch funds',()=>{
 const f=fixture(),cashier={user:{id:'cashier',businessId:'b1',role:'cashier',shopIds:['s1']},session:{id:'cashier-session'}};
 const sale={memberId:f.memberId,shopId:'s1',amount:2000,method:'cash',reference:'cash-001',confirmed:true};assert.throws(()=>f.run('recordExternalSale',sale,cashier),{code:'LOYALTY_ADJUST_FORBIDDEN'});
 const before=JSON.stringify(f.b.transactions),entity=f.run('recordExternalSale',sale).entity;assert.equal(JSON.stringify(f.b.transactions),before);assert.equal(loyaltyMemberBalance(f.b.loyalty,f.memberId),1);
 assert.throws(()=>f.run('recordExternalSale',sale),{code:'LOYALTY_EXTERNAL_DUPLICATE'});f.run('refundExternalSale',{saleId:entity.id,shopId:'s1',amount:2000,reason:'Customer returned this order'});assert.equal(loyaltyMemberBalance(f.b.loyalty,f.memberId),0);assert.equal(f.b.loyalty.externalSales[0].refunded,2000);
});
test('free item fulfilment is non-money, attributed, and single use',()=>{
 const f=fixture({target:1,reward:{type:'item',name:'A free drink',value:0,cost:300,minimumSpend:0,expiryDays:5}});f.attach('p1');const reward=f.b.loyalty.rewards[0],before=JSON.stringify(f.b.transactions);f.run('fulfilItem',{memberId:f.memberId,rewardId:reward.id,shopId:'s2',reason:'Drink handed over'});assert.equal(JSON.stringify(f.b.transactions),before);assert.equal(f.b.loyalty.rewards[0].redeemedShopId,'s2');assert.throws(()=>f.run('fulfilItem',{memberId:f.memberId,rewardId:reward.id,shopId:'s1'}),{code:'LOYALTY_REWARD_UNAVAILABLE'});
});
test('free-item terms cannot promise a minimum purchase that handover cannot enforce',()=>{
 const f=fixture();assert.throws(()=>f.run('saveProgramme',rule({reward:{type:'item',name:'Free drink with purchase',value:0,cost:300,minimumSpend:1000,expiryDays:5}})),/minimum purchase to zero/);
});
test('cashier exact card lookup has public eligibility, no cost, contact or other shop history',()=>{
 const f=fixture();f.attach('p1');f.attach('p2');const member=f.b.loyalty.members[0],cashier={user:{id:'cashier',businessId:'b1',role:'cashier',shopIds:['s2']},session:{id:'cashier-session'}};
 const result=loyaltyProjection(f.b,cashier,{code:member.code});assert.equal(result.members.length,0);assert.equal(result.member.phone,undefined);assert.equal(result.member.rules.reward.cost,undefined);assert.equal(result.member.rewards[0].cost,undefined);assert.equal(result.member.rewards[0].sourceId,undefined);assert.equal(result.member.history.length,0);assert.equal(result.metrics,null);assert.equal(result.programme.budgetLimit,undefined);
});
test('member consent is explicit and marketing never defaults on',()=>{
 const f=fixture();const before=f.b.loyalty.members.length;assert.throws(()=>f.run('enrollMember',{name:'Kojo',shopId:'s1',marketingConsent:false}),{code:'LOYALTY_CONSENT_REQUIRED'});assert.throws(()=>f.run('enrollMember',{name:'Kojo',shopId:'s1',membershipConsent:true}),{code:'LOYALTY_CONSENT_REQUIRED'});assert.equal(f.b.loyalty.members.length,before);assert.equal(f.b.loyalty.members[0].marketingConsent,false);
});
test('owner register pagination and full export pages declare their exact count',()=>{
 const f=fixture();f.run('enrollMember',{name:'Kojo',shopId:'s2',membershipConsent:true,marketingConsent:false});const first=loyaltyProjection(f.b,f.c,{page:1,pageSize:1}),second=loyaltyProjection(f.b,f.c,{page:2,pageSize:1});assert.equal(first.memberCount,2);assert.equal(second.members.length,1);assert.notEqual(first.members[0].id,second.members[0].id);assert.equal(loyaltyProjection(f.b,f.c,{pageSize:500}).members.length,2);
});
test('programme and exact customer money-shaped fields are validated without mutation',()=>{
 const f=fixture();for(const bad of [rule({target:1.5}),rule({shopIds:['other']}),rule({reward:{type:'discount',name:'Free everything',value:1000,cost:1000,minimumSpend:1000,expiryDays:30}})]){const before=JSON.stringify(f.b.loyalty);assert.throws(()=>f.run('saveProgramme',bad));assert.equal(JSON.stringify(f.b.loyalty),before);}
 assert.match(loyaltyTerms(f.b.loyalty.ruleVersions[0]),/Reward purchases do not earn/);
});
test('prototype-shaped mutation references are treated only as owned stored keys',()=>{
 const f=fixture();assert.deepEqual(loyaltyProjection(f.b,f.c,{mutationId:'constructor'}).mutationReceipt,{found:false});assert.deepEqual(loyaltyProjection(f.b,f.c,{mutationId:'__proto__'}).mutationReceipt,{found:false});
 const input={operation:'setPaused',payload:{paused:true},mutationId:'constructor',expectedRevision:f.b.loyalty.revision};mutateLoyalty(f.n,f.c,input,{now:f.now});assert.equal(loyaltyProjection(f.b,f.c,{mutationId:'constructor'}).mutationReceipt.found,true);assert.equal(mutateLoyalty(f.n,f.c,input,{now:f.now}).replayed,true);
});
