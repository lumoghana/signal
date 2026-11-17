import test from 'node:test';
import assert from 'node:assert/strict';
import {mutateLoyalty,reconcileLoyalty,loyaltyProjection,bindLoyaltyCollection,releaseLoyaltyCollection} from '../server/loyalty.js';
import {loyaltyMemberBalance,LOYALTY_LIMITS} from '../dist/loyalty-model.js';

const START=Date.parse('2026-11-17T10:00:00.000Z');
const makeContext=(id,role='owner',shops=['s1','s2'],session='session-'+id)=>({session:{id:session},user:{id,businessId:'business-one',role,shopIds:shops,active:true}});
function fixture(){
 const b={business:{id:'business-one'},openingBalance:50000,shops:[{id:'s1',name:'Night Market',open:true,accepting:true},{id:'s2',name:'Pentagon',open:true,accepting:true}],transactions:[],requests:[],refunds:[],shifts:[]};
 const n={businesses:{'business-one':b},audit:[]},owner=makeContext('owner');let serial=0,time=START;
 const run=(operation,payload,context=owner,extra={})=>mutateLoyalty(n,context,{operation,payload,mutationId:extra.mutationId||'adversarial-'+(++serial),expectedRevision:extra.expectedRevision??b.loyalty?.revision??0},{now:extra.now??++time});
 const programme=extra=>({name:'Kitchen regulars',colour:'#c9f64a',earning:'visits',minimumSpend:2000,target:1,onePerDay:false,shopIds:['s1','s2'],reward:{type:'discount',name:'Five cedis off',value:500,cost:500,minimumSpend:2000,expiryDays:1},budgetLimit:10000,...extra});
 const enroll=(name='Ama',context=owner,shopId='s1',extra={})=>run('enrollMember',{name,phone:'0240000001',shopId,membershipConsent:true,marketingConsent:false},context,extra).entity.memberId;
 const paid=(id,amount=2000,shopId='s1',at=START+10000)=>{const row={id,shopId,amount,status:'paid',confirmedAt:new Date(at).toISOString(),createdAt:new Date(at).toISOString(),reference:'REF-'+id};b.transactions.push(row);return row;};
 const attach=(memberId,transactionId,shopId='s1',context=owner)=>run('attachPayment',{memberId,transactionId,shopId},context,{now:START+20000});
 return {b,n,owner,run,programme,enroll,paid,attach};
}

test('mutation receipts cannot recover a former shop member after staff reassignment',()=>{
 const h=fixture();h.run('saveProgramme',h.programme());
 const staff=makeContext('cashier','cashier',['s1']),memberId=h.enroll('Private member',staff,'s1',{mutationId:'enroll-private-shop-one'});
 const code=h.b.loyalty.members.find(m=>m.id===memberId).code;
 const before=loyaltyProjection(h.b,staff,{mutationId:'enroll-private-shop-one'});assert.equal(before.mutationReceipt.found,true);
 const moved=makeContext('cashier','cashier',['s2']);
 const after=loyaltyProjection(h.b,moved,{mutationId:'enroll-private-shop-one'});
 assert.equal(after.mutationReceipt.found,false);assert.equal(JSON.stringify(after).includes(code),false);assert.equal(JSON.stringify(after).includes('Private member'),false);
});

test('a new login cannot reconcile or replay a previous login mutation reference',()=>{
 const h=fixture();h.run('saveProgramme',h.programme());
 const old=makeContext('cashier','cashier',['s1'],'old-session'),fresh=makeContext('cashier','cashier',['s1'],'fresh-session');
 const payload={name:'Fresh login check',phone:'0240000001',shopId:'s1',membershipConsent:true,marketingConsent:false};
 h.run('enrollMember',payload,old,{mutationId:'enroll-bound-session'});
 assert.equal(loyaltyProjection(h.b,fresh,{mutationId:'enroll-bound-session'}).mutationReceipt.found,false);
 assert.throws(()=>h.run('enrollMember',payload,fresh,{mutationId:'enroll-bound-session'}),e=>e.code==='LOYALTY_REFERENCE_CONFLICT');
 assert.equal(h.b.loyalty.members.length,1);
});

test('revoking manager adjustment permission also revokes its old adjustment receipt',()=>{
 const h=fixture();h.run('saveProgramme',h.programme({target:5}));const memberId=h.enroll();
 h.run('setManagerAccess',{shopIds:['s1']});const manager=makeContext('manager','manager',['s1']);
 h.run('adjustProgress',{memberId,shopId:'s1',units:1,reason:'Correction approved by owner'},manager,{mutationId:'manager-original-adjustment'});
 assert.equal(loyaltyProjection(h.b,manager,{mutationId:'manager-original-adjustment'}).mutationReceipt.found,true);
 h.run('setManagerAccess',{shopIds:[]});
 assert.equal(loyaltyProjection(h.b,manager,{mutationId:'manager-original-adjustment'}).mutationReceipt.found,false);
});

test('held reward survives its own expiry and an earning refund while its QR remains payable',()=>{
 const h=fixture();h.run('saveProgramme',h.programme());const memberId=h.enroll();h.paid('earning');h.attach(memberId,'earning');
 const reward=h.b.loyalty.rewards[0],held=h.run('prepareCollection',{memberId,shopId:'s1',grossAmount:2000,rewardId:reward.id},h.owner,{now:START+30000}).entity;
 const request={id:'fixed-discounted-request',shopId:'s1',amount:1500,status:'open',createdAt:new Date(START+30000).toISOString(),expiresAt:new Date(START+4*86400000).toISOString()};h.b.requests.push(request);bindLoyaltyCollection(h.b,request,held);
 h.b.refunds.push({id:'original-fully-returned',transactionId:'earning',shopId:'s1',amount:2000,status:'paid'});
 reconcileLoyalty(h.b,{now:START+2*86400000});
 assert.equal(h.b.loyalty.rewards[0].state,'held');assert.equal(h.b.loyalty.collections[0].state,'held');assert.equal(loyaltyMemberBalance(h.b.loyalty,memberId),-1);assert.equal(h.b.loyalty.reviews.length,1);
 assert.throws(()=>h.run('prepareCollection',{memberId,shopId:'s1',grossAmount:2000,rewardId:reward.id},h.owner,{now:START+2*86400000}),e=>e.code==='LOYALTY_REWARD_UNAVAILABLE');
 h.paid('discount-paid',1500,'s1',START+2*86400000);h.b.transactions.at(-1).requestId=request.id;request.status='paid';reconcileLoyalty(h.b,{now:START+2*86400000+1});
 assert.equal(h.b.loyalty.rewards[0].state,'redeemed');assert.equal(h.b.loyalty.collections[0].state,'paid');assert.equal(loyaltyMemberBalance(h.b.loyalty,memberId),-1);assert.equal(h.b.openingBalance,50000);
});

test('request cancellation cannot release a voucher if its payment is paid or still processing',()=>{
 for(const status of ['paid','processing']){
  const h=fixture();h.run('saveProgramme',h.programme());const memberId=h.enroll();h.paid('earning');h.attach(memberId,'earning');const reward=h.b.loyalty.rewards[0];
  const prepared=h.run('prepareCollection',{memberId,shopId:'s1',grossAmount:2000,rewardId:reward.id},h.owner,{now:START+30000}).entity;
  const req={id:'request-'+status,shopId:'s1',amount:1500,status:'open',expiresAt:new Date(START+60000).toISOString()};h.b.requests.push(req);bindLoyaltyCollection(h.b,req,prepared);
  h.b.transactions.push({id:'outcome-'+status,requestId:req.id,shopId:'s1',amount:1500,status,createdAt:new Date(START+40000).toISOString()});req.status='cancelled';
  assert.equal(releaseLoyaltyCollection(h.b,req.id,{now:START+50000}),false);assert.equal(h.b.loyalty.rewards[0].state,'held');
 }
});

test('one confirmed sale cannot be rebound or credited twice, and refund earning uses remaining paid amount',()=>{
 const h=fixture();h.run('saveProgramme',h.programme({earning:'spend',minimumSpend:100,target:10000}));const one=h.enroll('One'),two=h.enroll('Two');h.paid('partial',15000);h.b.refunds.push({id:'partial-return',transactionId:'partial',shopId:'s1',amount:6000,status:'paid'});
 const payload={memberId:one,transactionId:'partial',shopId:'s1'};h.run('attachPayment',payload,h.owner,{mutationId:'attach-one-original',now:START+20000});
 assert.equal(loyaltyMemberBalance(h.b.loyalty,one),9000);assert.equal(h.b.loyalty.rewards.length,0);
 h.run('attachPayment',payload,h.owner,{mutationId:'attach-one-original',now:START+20000});assert.equal(loyaltyMemberBalance(h.b.loyalty,one),9000);
 assert.throws(()=>h.attach(two,'partial'),e=>e.code==='LOYALTY_SALE_BOUND');
 assert.equal(h.b.loyalty.links.length,1);assert.equal(h.b.loyalty.ledger.filter(e=>e.type==='earn').length,1);
});

test('new programme terms do not change existing member progress or reward value',()=>{
 const h=fixture();h.run('saveProgramme',h.programme());const old=h.enroll('Original terms');
 h.run('saveProgramme',h.programme({target:2,reward:{type:'discount',name:'Ten cedis off',value:1000,cost:1000,minimumSpend:3000,expiryDays:30}}));const fresh=h.enroll('New terms');
 h.paid('old-rule');h.attach(old,'old-rule');h.paid('new-rule');h.attach(fresh,'new-rule');
 assert.equal(h.b.loyalty.members.find(m=>m.id===old).ruleVersion,1);assert.equal(h.b.loyalty.members.find(m=>m.id===fresh).ruleVersion,2);
 assert.equal(h.b.loyalty.rewards.find(r=>r.memberId===old).value,500);assert.equal(h.b.loyalty.rewards.some(r=>r.memberId===fresh),false);assert.equal(loyaltyMemberBalance(h.b.loyalty,fresh),1);
 h.run('setPaused',{paused:true});const reward=h.b.loyalty.rewards.find(r=>r.memberId===old);const prepared=h.run('prepareCollection',{memberId:old,shopId:'s1',grossAmount:2000,rewardId:reward.id}).entity;assert.equal(prepared.amount,1500);
});

test('cashier cross-shop reward lookup exposes eligibility without internal costs or source identifiers',()=>{
 const h=fixture();h.run('saveProgramme',h.programme({reward:{type:'item',name:'A free drink',value:0,cost:713,minimumSpend:0,expiryDays:30}}));const memberId=h.enroll();h.paid('private-original-payment');h.attach(memberId,'private-original-payment');
 const ownerView=loyaltyProjection(h.b,h.owner,{memberId});assert.equal(ownerView.member.rewards[0].cost,713);
 const code=h.b.loyalty.members[0].code,staff=makeContext('other-shop-cashier','cashier',['s2']),view=loyaltyProjection(h.b,staff,{shopId:'s2',code});
 assert.equal(view.member.id,memberId);assert.equal(view.member.rewards[0].name,'A free drink');assert.equal(view.member.rewards[0].state,'available');
 assert.equal(view.member.rewards[0].cost,undefined);assert.equal(view.member.rewards[0].sourceId,undefined);assert.equal(view.member.rewards[0].collectionId,undefined);assert.equal(view.member.rewards[0].earnedShopId,undefined);
 assert.equal(view.member.rules.reward.cost,undefined);assert.equal(view.rules.reward.cost,undefined);assert.equal(view.member.phone,undefined);assert.equal(view.member.history.length,0);
 assert.equal(view.programme.budgetLimit,undefined);assert.equal(view.metrics,null);
});

test('reward history capacity pauses new earning instead of breaking ordinary paid-sale reconciliation',()=>{
 const h=fixture();h.run('saveProgramme',h.programme());const memberId=h.enroll();
 h.b.requests.push({id:'unpaid-at-cap',shopId:'s1',amount:2000,status:'open',createdAt:new Date(START+10000).toISOString(),expiresAt:new Date(START+90000).toISOString()});
 h.run('attachRequest',{memberId,requestId:'unpaid-at-cap',shopId:'s1'},h.owner,{now:START+20000});
 const oldReward={memberId,ruleVersion:1,type:'discount',name:'Old expired reward',value:500,cost:500,minimumSpend:2000,expiryDays:1,state:'expired',earnedShopId:'s1',earnedAt:new Date(START-3*86400000).toISOString(),expiresAt:new Date(START-2*86400000).toISOString()};
 h.b.loyalty.rewards=Array.from({length:LOYALTY_LIMITS.rewards},(_,i)=>({...oldReward,id:'expired-history-'+i}));
 h.paid('paid-at-cap');h.b.transactions.at(-1).requestId='unpaid-at-cap';h.b.requests[0].status='paid';
 assert.doesNotThrow(()=>reconcileLoyalty(h.b,{now:START+30000}));
 assert.equal(h.b.loyalty.rewards.length,LOYALTY_LIMITS.rewards);assert.equal(h.b.transactions.at(-1).status,'paid');assert.equal(h.b.openingBalance,50000);
 assert.equal(loyaltyMemberBalance(h.b.loyalty,memberId),0,'capacity cannot grant unfunded progress while leaving the confirmed sale intact');
});

test('soft event and attempt capacity cannot discard a canonical refund adjustment',()=>{
 const h=fixture();h.run('saveProgramme',h.programme({target:5}));const memberId=h.enroll();h.paid('refunded-at-cap');h.attach(memberId,'refunded-at-cap');
 while(h.b.loyalty.ledger.length<LOYALTY_LIMITS.events)h.b.loyalty.ledger.push({id:'archived-event-'+h.b.loyalty.ledger.length,type:'historical-note',memberId,shopId:'s1',units:0,createdAt:new Date(START).toISOString()});
 for(let i=Object.keys(h.b.loyalty._attempts).length;i<LOYALTY_LIMITS.attempts;i++)h.b.loyalty._attempts['old-attempt-'+i]={operation:'historical-note',fingerprint:'old',operator:'old',entity:{id:null},createdAt:new Date(START).toISOString()};
 const beforeEvents=h.b.loyalty.ledger.length;h.b.refunds.push({id:'cap-refund',transactionId:'refunded-at-cap',shopId:'s1',amount:2000,status:'paid'});
 assert.doesNotThrow(()=>reconcileLoyalty(h.b,{now:START+30000}));assert.equal(loyaltyMemberBalance(h.b.loyalty,memberId),0);assert.ok(h.b.loyalty.ledger.length>=beforeEvents);assert.equal(h.b.refunds[0].status,'paid');assert.equal(h.b.openingBalance,50000);
});

test('a fully returned visit does not permanently consume the one qualifying visit for that day',()=>{
 const h=fixture();h.run('saveProgramme',h.programme({target:5,onePerDay:true}));const memberId=h.enroll();
 h.paid('first-day-visit',2000,'s1',START+10000);h.attach(memberId,'first-day-visit');
 h.paid('second-day-visit',2000,'s1',START+15000);h.attach(memberId,'second-day-visit');
 assert.equal(loyaltyMemberBalance(h.b.loyalty,memberId),1);
 h.b.refunds.push({id:'first-day-visit-refund',transactionId:'first-day-visit',shopId:'s1',amount:2000,status:'paid'});
 reconcileLoyalty(h.b,{now:START+40000});assert.equal(loyaltyMemberBalance(h.b.loyalty,memberId),1,'the remaining paid visit is the single qualifying visit');
 assert.equal(h.b.loyalty.rewards.length,0);assert.equal(h.b.openingBalance,50000);
});

test('one reconciliation restores a qualifying visit when an out-of-order credited visit is returned',()=>{
 const h=fixture();h.run('saveProgramme',h.programme({target:5,onePerDay:true}));const memberId=h.enroll();
 h.paid('earlier-uncredited-visit',2000,'s1',START+10000);h.paid('later-credited-visit',2000,'s1',START+15000);
 h.attach(memberId,'later-credited-visit');h.attach(memberId,'earlier-uncredited-visit');
 assert.equal(loyaltyMemberBalance(h.b.loyalty,memberId),1);
 h.b.refunds.push({id:'returned-later-visit',transactionId:'later-credited-visit',shopId:'s1',amount:2000,status:'paid'});
 reconcileLoyalty(h.b,{now:START+40000});
 assert.equal(loyaltyMemberBalance(h.b.loyalty,memberId),1,'the first complete refund reconciliation must preserve the other qualifying visit');
 assert.equal(h.b.loyalty.ledger.filter(row=>row.linkId===h.b.loyalty.links.find(link=>link.transactionId==='earlier-uncredited-visit').id).reduce((n,row)=>n+row.units,0),1);
});

test('prototype history capacity still honours an existing earned discount',()=>{
 const h=fixture();h.run('saveProgramme',h.programme());const memberId=h.enroll();h.paid('earned-before-cap');h.attach(memberId,'earned-before-cap');
 const reward=h.b.loyalty.rewards[0];h.b.loyalty.capacityPaused=true;
 const prepared=h.run('prepareCollection',{memberId,shopId:'s1',grossAmount:2000,rewardId:reward.id},h.owner,{now:START+30000}).entity;
 assert.equal(prepared.amount,1500);assert.equal(h.b.loyalty.rewards[0].state,'held');
 assert.throws(()=>h.run('prepareCollection',{memberId,shopId:'s1',grossAmount:2000},h.owner,{now:START+30001}),e=>e.code==='LOYALTY_CAPACITY');
 assert.equal(h.b.openingBalance,50000);
});

test('same-operator cross-shop item fulfilment remains recoverable without exposing former-shop records',()=>{
 const h=fixture();h.run('saveProgramme',h.programme({reward:{type:'item',name:'A free drink',value:0,cost:300,minimumSpend:0,expiryDays:30}}));const memberId=h.enroll();h.paid('item-earned-at-original-shop');h.attach(memberId,'item-earned-at-original-shop');
 const rewardId=h.b.loyalty.rewards[0].id,staff=makeContext('shop-two-cashier','cashier',['s2']),mutationId='cross-shop-item-fulfilled';
 const payload={memberId,rewardId,shopId:'s2',reason:'Item handed to the member'};
 assert.equal(loyaltyProjection(h.b,staff,{shopId:'s2',code:h.b.loyalty.members[0].code}).member.id,memberId);
 h.run('fulfilItem',payload,staff,{mutationId});
 const receipt=loyaltyProjection(h.b,staff,{shopId:'s2',mutationId}).mutationReceipt;
 assert.equal(receipt.found,true);assert.equal(receipt.entity.rewardId,rewardId);
 const replay=h.run('fulfilItem',payload,staff,{mutationId});assert.equal(replay.replayed,true);
 assert.equal(h.b.loyalty.ledger.filter(row=>row.type==='item-fulfilled').length,1);
 const moved=makeContext('shop-two-cashier','cashier',['s1']);assert.equal(loyaltyProjection(h.b,moved,{mutationId}).mutationReceipt.found,false);
});

test('a new member can link an already-created unpaid QR and earn only after post-enrollment payment',()=>{
 const h=fixture();h.run('saveProgramme',h.programme({target:5}));
 const request={id:'created-before-member-joined',shopId:'s1',amount:2000,status:'open',createdAt:new Date(START+2).toISOString(),expiresAt:new Date(START+60000).toISOString()};h.b.requests.push(request);
 const memberId=h.enroll('Joined at checkout',h.owner,'s1',{now:START+10000});
 h.run('attachRequest',{memberId,requestId:request.id,shopId:'s1'},h.owner,{now:START+20000});assert.equal(loyaltyMemberBalance(h.b.loyalty,memberId),0);
 h.paid('paid-after-joining',2000,'s1',START+30000);h.b.transactions.at(-1).requestId=request.id;request.status='paid';reconcileLoyalty(h.b,{now:START+40000});assert.equal(loyaltyMemberBalance(h.b.loyalty,memberId),1);
 h.paid('historical-pre-membership-payment',2000,'s1',START+5000);
 assert.throws(()=>h.run('attachPayment',{memberId,transactionId:'historical-pre-membership-payment',shopId:'s1'},h.owner,{now:START+50000}),e=>e.code==='LOYALTY_PRE_MEMBERSHIP');
});
