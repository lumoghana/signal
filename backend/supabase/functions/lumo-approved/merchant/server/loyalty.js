import {APIError,phone,audit} from './network.js';
import {normalizeLoyalty,loyaltyRulesForMember,loyaltyMemberBalance,loyaltyBudgetUsed,loyaltyMetrics,loyaltyTerms,LOYALTY_CONSENT_VERSION,LOYALTY_LIMITS} from '../dist/loyalty-model.js';

const clone=value=>structuredClone(value),list=value=>Array.isArray(value)?value:[];
const canonical=value=>JSON.stringify(value&&typeof value==='object'?Array.isArray(value)?value.map(v=>JSON.parse(canonical(v))):Object.fromEntries(Object.keys(value).filter(k=>value[k]!==undefined).sort().map(k=>[k,JSON.parse(canonical(value[k]))])):value);
const fail=(message,code='LOYALTY_INVALID',status=400)=>{throw new APIError(message,status,code);};
const stamp=value=>{const time=value===undefined?Date.now():typeof value==='number'?value:Date.parse(value);if(!Number.isFinite(time))fail('Choose a valid loyalty time.');return new Date(time).toISOString();};
const uid=prefix=>prefix+'-'+crypto.randomUUID();
const text=(value,label,max=100)=>{if(typeof value!=='string'||!value.trim()||value.trim().length>max||/[\u0000-\u001f<>]/.test(value))fail(`${label} is required and must be ${max} characters or fewer.`);return value.trim();};
const money=(value,zero=false)=>{if(!Number.isSafeInteger(value)||value<(zero?0:1)||value>9999999999)fail('Use an amount in whole pesewas within the loyalty limit.','LOYALTY_AMOUNT');return value;};
const own=(object,key)=>Object.prototype.hasOwnProperty.call(object,key);
function keys(value,allowed){if(!value||typeof value!=='object'||Array.isArray(value)||Object.keys(value).some(key=>!allowed.includes(key)))fail('Use only the supported loyalty fields.');}
function allowedShops(b,c){if(c.locked)fail('Unlock this counter before opening loyalty.','COUNTER_LOCKED',423);return c.counter?[c.counter.shopId]:c.user.role==='owner'?b.shops.map(s=>s.id):list(c.user.shopIds);}
function access(b,c){
 if(!c?.user||c.user.businessId!==b.business.id||!['owner','manager','cashier'].includes(c.user.role))fail('This loyalty programme belongs to another business.','LOYALTY_FORBIDDEN',403);
 const shopIds=allowedShops(b,c).filter(id=>b.shops.some(s=>s.id===id));
 const canAdjust=!c.counter&&(c.user.role==='owner'||c.user.role==='manager'&&shopIds.some(id=>list(b.loyalty?.managerShopIds).includes(id)));
 return {canConfigure:!c.counter&&c.user.role==='owner',canEnroll:true,canAdjust,canRecordExternal:canAdjust,canExport:!c.counter&&c.user.role==='owner',canViewReports:!c.counter&&c.user.role!=='cashier',canListMembers:!c.counter&&c.user.role!=='cashier',allowedShopIds:shopIds,adjustShopIds:c.counter?[]:c.user.role==='owner'?shopIds:c.user.role==='manager'?shopIds.filter(id=>list(b.loyalty?.managerShopIds).includes(id)):[]};
}
function shop(b,c,id){if(typeof id!=='string'||!allowedShops(b,c).includes(id)||!b.shops.some(s=>s.id===id))fail('Choose a shop within your loyalty access.','LOYALTY_SHOP_FORBIDDEN',403);return id;}
function owner(b,c){if(!access(b,c).canConfigure)fail('Only the owner can change the loyalty programme.','OWNER_REQUIRED',403);}
function manager(b,c,id){shop(b,c,id);if(c.counter||c.user.role!=='owner'&&!(c.user.role==='manager'&&list(b.loyalty?.managerShopIds).includes(id)))fail('Ask the owner to approve loyalty adjustments for this shop.','LOYALTY_ADJUST_FORBIDDEN',403);}
function memberFor(l,id){const member=l.members.find(m=>m.id===id);if(!member)fail('Choose a member of this merchant’s programme.','LOYALTY_MEMBER_NOT_FOUND',404);return member;}
function ruleFor(l,m){const rule=loyaltyRulesForMember(l,m);if(!rule)fail('This member’s saved programme terms are unavailable.','LOYALTY_RULES_UNAVAILABLE',409);return rule;}
function participating(l,m,id){const rule=ruleFor(l,m);if(!rule.shopIds.includes(id))fail('This shop does not participate in the member’s programme terms.','LOYALTY_SHOP_EXCLUDED',403);return rule;}
function operatorStamp(b,c){const current=list(b.shifts).find(s=>s.shopId===c.counter?.shopId&&s.staffId==='access-'+c.user.id&&s.status==='open');return [c.user.id,c.session?.id||'',c.counter?.id||'',c.counter?(c.counterShiftId||current?.id||''):''].join(':');}
function append(l,entry){if(l.ledger.some(row=>row.id===entry.id))return false;l.ledger.push(entry);return true;}
const capacityMessage='New loyalty earning and setup are paused at this prototype’s history capacity. Existing rewards, cancellations and refund adjustments are preserved. Export the records and contact support.';
function capacityReached(b,l){return l.ledger.length>=LOYALTY_LIMITS.events-500||l.collections.length>=LOYALTY_LIMITS.collections-500||l.rewards.length>=LOYALTY_LIMITS.rewards-200||Object.keys(l._attempts).length>=LOYALTY_LIMITS.attempts-200||Object.keys(l._consumerAttempts||{}).length>=5800||new TextEncoder().encode(JSON.stringify(l)).byteLength>450000||new TextEncoder().encode(JSON.stringify({...b,loyalty:l})).byteLength>1100000;}
function log(l,type,m,shopId,at,detail={}){return append(l,{id:uid('loyalty-event'),type,memberId:m?.id||null,shopId:shopId||null,units:0,createdAt:at,...detail});}
function review(l,m,shopId,at,sourceId,reason){if(!l.reviews.some(r=>r.sourceId===sourceId&&r.memberId===m.id))l.reviews.push({id:uid('loyalty-review'),memberId:m.id,shopId,sourceId,reason,state:'open',createdAt:at});}
function statusAt(l,at){return [...list(l.programme?.statusHistory)].reverse().find(row=>row.changedAt<=at)?.status||'active';}
function activeMember(l,m){if(m.active===false)fail('This member is inactive. Ask the owner to restore membership.','LOYALTY_MEMBER_INACTIVE',409);}
function issueRewards(l,m,rule,sourceId,shopId,at){
 let count=Math.floor(Math.max(0,loyaltyMemberBalance(l,m.id))/rule.target),index=0;
 while(count-->0){
  if(l.rewards.length>=LOYALTY_LIMITS.rewards)fail('This prototype loyalty programme has reached its reward history capacity. Export the records and contact support.','LOYALTY_CAPACITY',409);
  if(loyaltyBudgetUsed(l)+rule.reward.cost>l.programme.budgetLimit)break;
  const id=uid('loyalty-reward');l.rewards.push({id,memberId:m.id,ruleVersion:rule.version,...clone(rule.reward),state:'available',sourceId,earnedShopId:shopId,earnedAt:at,expiresAt:new Date(Date.parse(at)+rule.reward.expiryDays*86400000).toISOString(),collectionId:null});
  append(l,{id:'issued-'+id,type:'reward-earned',memberId:m.id,ruleVersion:rule.version,shopId,units:-rule.target,rewardId:id,sourceId,createdAt:at});index++;
 }
 return index;
}
function revokeUnfundedProgress(l,m,rule,shopId,at,sourceId,report=true){
 for(const reward of l.rewards.filter(r=>r.memberId===m.id&&r.state==='available').reverse()){
  if(loyaltyMemberBalance(l,m.id)>=0)break;
  reward.state='revoked';reward.revokedAt=at;reward.revokeReason='The qualifying payment was returned.';
  append(l,{id:'revoked-'+reward.id,type:'reward-revoked',memberId:m.id,ruleVersion:rule.version,shopId,units:rule.target,rewardId:reward.id,sourceId,createdAt:at});
 }
 if(report&&loyaltyMemberBalance(l,m.id)<0)review(l,m,shopId,at,sourceId,'A returned purchase funded a reward already held or redeemed. Progress needs owner review; no wallet debit was made.');
}
function award(l,m,rule,link,desired,at){
 const current=l.ledger.filter(row=>row.linkId===link.id&&['earn','refund-adjustment'].includes(row.type)).reduce((n,row)=>n+row.units,0),delta=desired-current;
 if(!delta)return false;
 if(delta>0){
  if(link.earningClosed)return false;
  if(l.capacityPaused){link.earningState='capacity-paused';link.earningClosed=true;return false;}
  if(statusAt(l,at)!=='active'||m.active===false){link.earningState='paused';link.earningClosed=true;log(l,'earning-paused',m,link.shopId,at,{linkId:link.id,sourceId:link.transactionId||link.externalSaleId,reason:'Programme earning or membership was paused.'});return false;}
  const rewards=Math.floor(Math.max(0,loyaltyMemberBalance(l,m.id)+delta)/rule.target);
  if(l.rewards.length+rewards>LOYALTY_LIMITS.rewards-100){l.capacityPaused=true;l.capacityMessage=capacityMessage;link.earningState='capacity-paused';link.earningClosed=true;return false;}
  if(loyaltyBudgetUsed(l)+rewards*rule.reward.cost>l.programme.budgetLimit){link.earningState='budget-paused';link.earningClosed=true;log(l,'earning-paused',m,link.shopId,at,{linkId:link.id,sourceId:link.transactionId||link.externalSaleId,reason:'The reward budget could not cover this earning.'});return false;}
 }
 append(l,{id:(delta>0?'earn-':'refund-')+link.id+'-'+desired,type:delta>0?'earn':'refund-adjustment',memberId:m.id,ruleVersion:rule.version,shopId:link.shopId,units:delta,linkId:link.id,sourceId:link.transactionId||link.externalSaleId,createdAt:at,source:link.source});
 link.earningState='recorded';
 if(delta>0)issueRewards(l,m,rule,link.id,link.shopId,at);else revokeUnfundedProgress(l,m,rule,link.shopId,at,link.id);
 return true;
}
function eligibleUnits(l,m,rule,link,amount,at){
 if(amount<rule.minimumSpend||link.rewardId)return 0;
 if(rule.earning==='spend')return amount;
 if(rule.onePerDay){const day=at.slice(0,10);const prior=l.links.find(row=>row.id!==link.id&&row.memberId===m.id&&row.paid&&row.qualifyingDay===day&&l.ledger.filter(event=>event.linkId===row.id&&['earn','refund-adjustment'].includes(event.type)).reduce((n,e)=>n+e.units,0)>0);if(prior)return 0;link.qualifyingDay=day;}
 return 1;
}

/** Rebuild only from trusted server-side payment/refund records. */
export function reconcileLoyalty(b,{now}={}){
 if(!b.loyalty)return false;
 const at=stamp(now),l=normalizeLoyalty(b.loyalty),before=canonical(l);
 if(capacityReached(b,l)){l.capacityPaused=true;l.capacityMessage=capacityMessage;}
 // Only shared-ledger hydration supplies this private actor field. Group-funded
 // purchases belong to the authorised purchaser, never the group account owner.
 if(!l.capacityPaused)for(const transaction of list(b.transactions)){
  if(transaction.status!=='paid'||!transaction._loyaltyActorUserId||l.links.some(link=>link.transactionId===transaction.id||transaction.requestId&&link.requestId===transaction.requestId))continue;
  const paidAt=transaction.confirmedAt||transaction.createdAt;
  const member=l.members.find(m=>m._consumerUserId===transaction._loyaltyActorUserId&&Date.parse(m._consumerLinkedAt)<=Date.parse(paidAt));
  if(!member||!loyaltyRulesForMember(l,member)?.shopIds.includes(transaction.shopId))continue;
  memberLink(l,member,transaction.shopId,{transactionId:transaction.id,requestId:transaction.requestId||null,createdAt:paidAt,by:'consumer:'+member._consumerUserId});
 }

 for(const reward of l.rewards)if(reward.state==='available'&&Date.parse(reward.expiresAt)<=Date.parse(at)){reward.state='expired';reward.expiredAt=at;log(l,'reward-expired',memberFor(l,reward.memberId),reward.earnedShopId,at,{rewardId:reward.id});}
 for(const collection of l.collections){
  if(!collection.requestId||collection.state!=='held')continue;
  const paid=list(b.transactions).find(t=>t.requestId===collection.requestId&&t.status==='paid');
  const reward=collection.rewardId&&l.rewards.find(r=>r.id===collection.rewardId),request=list(b.requests).find(r=>r.id===collection.requestId);
  if(paid){
   collection.state='paid';collection.transactionId=paid.id;collection.paidAt=paid.confirmedAt||paid.createdAt;
   if(reward){reward.state='redeemed';reward.redeemedAt=collection.paidAt;reward.redeemedShopId=collection.shopId;reward.actualDiscount=collection.discount;log(l,'reward-redeemed',memberFor(l,reward.memberId),collection.shopId,collection.paidAt,{rewardId:reward.id,collectionId:collection.id,amount:collection.discount,by:collection.by});}
  }else if(request&&['cancelled','expired','failed'].includes(request.status)&&!list(b.transactions).some(t=>t.requestId===request.id&&t.status==='processing'))releaseIn(l,collection,at);
 }
 const ordered=[...l.links].sort((left,right)=>String(sourceDate(businessSource(b,l,left))||left.createdAt).localeCompare(String(sourceDate(businessSource(b,l,right))||right.createdAt))||left.id.localeCompare(right.id));
 const sources=[];
 for(const link of ordered){
  const m=l.members.find(m=>m.id===link.memberId);if(!m)continue;
  const rule=loyaltyRulesForMember(l,m);if(!rule)continue;
  const source=businessSource(b,l,link);if(!source||source.status!=='paid')continue;
  if(!rule.shopIds.includes(link.shopId))continue;
  const paidAt=sourceDate(source),refunded=link.source==='external'?source.refunded||0:list(b.refunds).filter(r=>r.transactionId===source.id&&r.status==='paid').reduce((n,r)=>n+r.amount,0);
  const amount=Math.max(0,source.amount-refunded);
  link.paid=true;link.paidAmount=source.amount;link.refunded=refunded;link.paidAt=paidAt;
  if(link.source==='connected')link.transactionId=source.id;
  if(refunded>0&&link.rewardId)review(l,m,link.shopId,at,'discount-return-'+link.id,'A discounted purchase was returned. The consumed reward is retained as used; no coupon cash payout or automatic replacement was made.');
  // An unpaid QR can be made before enrollment; only the actual confirmed
  // purchase time determines whether it belongs to this membership.
  const afterJoining=Date.parse(paidAt)>=Date.parse(m.createdAt);
  if(!afterJoining){link.earningState='pre-membership';link.earningClosed=true;}
  sources.push({link,m,rule,amount:afterJoining?amount:0,paidAt,refunded});
 }
 // Reverse lost eligibility first. This frees returned reward commitments and
 // daily-visit slots before evaluating another valid purchase from that day.
 for(const item of sources){const {link,m,rule,amount}=item;
  const desired=amount<rule.minimumSpend||link.rewardId?0:rule.earning==='spend'?amount:1;
  const credited=l.ledger.filter(row=>row.linkId===link.id&&['earn','refund-adjustment'].includes(row.type)).reduce((n,row)=>n+row.units,0);
  if(desired<credited)award(l,m,rule,link,desired,at);
 }
 for(const {link,m,rule,amount,paidAt,refunded} of sources)award(l,m,rule,link,eligibleUnits(l,m,rule,link,amount,paidAt),refunded?at:paidAt);
 for(const member of l.members)if(loyaltyMemberBalance(l,member.id)<0){const rule=loyaltyRulesForMember(l,member);if(rule)revokeUnfundedProgress(l,member,rule,member.joinedShopId,at,'balance-'+member.id,false);}
 if(canonical(l)!==before){l.revision++;l.updatedAt=at;b.loyalty=l;return true;}return false;
}
function sourceDate(source){return source?.confirmedAt||source?.createdAt||'';}
function businessSource(b,l,link){return link.source==='external'?l.externalSales.find(s=>s.id===link.externalSaleId):list(b.transactions).find(t=>t.id===link.transactionId||link.requestId&&t.requestId===link.requestId);}
function releaseIn(l,collection,at){
 if(collection.state!=='held')return false;collection.state='released';collection.releasedAt=at;
 const reward=l.rewards.find(r=>r.id===collection.rewardId);
 if(reward?.state==='held'&&reward.collectionId===collection.id){reward.state=Date.parse(reward.expiresAt)<=Date.parse(at)?'expired':'available';reward.collectionId=null;log(l,'reward-released',memberFor(l,reward.memberId),collection.shopId,at,{rewardId:reward.id,collectionId:collection.id});}
 return true;
}
export function releaseLoyaltyCollection(b,requestId,{now}={}){
 if(!b.loyalty)return false;const l=b.loyalty,request=list(b.requests).find(r=>r.id===requestId);
 if(!request||!['cancelled','expired','failed'].includes(request.status)||list(b.transactions).some(t=>t.requestId===requestId&&['paid','processing'].includes(t.status)))return false;
 let changed=false;for(const collection of l.collections.filter(c=>c.requestId===requestId))changed=releaseIn(l,collection,stamp(now))||changed;
 if(changed){l.revision++;l.updatedAt=stamp(now);}return changed;
}
function memberLink(l,m,shopId,{requestId=null,transactionId=null,externalSaleId=null,source='connected',createdAt,by,rewardId=null}={}){
 const previous=l.links.find(link=>transactionId&&link.transactionId===transactionId||requestId&&link.requestId===requestId||externalSaleId&&link.externalSaleId===externalSaleId);
 if(previous){if(previous.memberId!==m.id)fail('This sale already belongs to another loyalty member.','LOYALTY_SALE_BOUND',409);return previous;}
 const link={id:uid('loyalty-link'),memberId:m.id,shopId,requestId,transactionId,externalSaleId,source,createdAt,by,rewardId};l.links.push(link);return link;
}
export function prepareLoyaltyCollection(b,c,payload,{now,mutationId}={}){
 const l=b.loyalty,m=memberFor(l,payload.memberId),shopId=shop(b,c,payload.shopId),rule=participating(l,m,shopId),at=stamp(now);activeMember(l,m);
 const grossAmount=money(payload.grossAmount);let reward=null,discount=0;
 if(payload.rewardId){
  reward=l.rewards.find(r=>r.id===payload.rewardId&&r.memberId===m.id);
  if(!reward||reward.type!=='discount'||reward.state!=='available'||Date.parse(reward.expiresAt)<=Date.parse(at))fail('This discount reward is no longer available.','LOYALTY_REWARD_UNAVAILABLE',409);
  if(grossAmount<reward.minimumSpend)fail('This sale is below the reward’s minimum purchase.','LOYALTY_MINIMUM_NOT_MET');
  discount=reward.value;if(discount>=grossAmount)fail('A discounted collection must leave a positive amount to pay.','LOYALTY_AMOUNT');
 }
 if(!reward&&l.collections.length>=LOYALTY_LIMITS.collections-500)fail('This prototype has reached its loyalty collection history capacity.','LOYALTY_CAPACITY',409);
 const collection={id:uid('loyalty-collection'),memberId:m.id,shopId,grossAmount,discount,amount:grossAmount-discount,rewardId:reward?.id||null,description:payload.description?text(payload.description,'Collection note',100):'Loyalty member purchase',state:'held',requestId:null,createdAt:at,expiresAt:new Date(Date.parse(at)+15*60000).toISOString(),by:c.user.id,mutationId};
 if(reward){reward.state='held';reward.collectionId=collection.id;}
 l.collections.push(collection);return collectionEntity(collection);
}
export function bindLoyaltyCollection(b,request,prepared){
 const l=b.loyalty,collection=l?.collections.find(row=>row.id===(prepared.collectionId||prepared.id));
 if(!collection||!request?.id||request.shopId!==collection.shopId||request.amount!==collection.amount||request.status!=='open')fail('The loyalty collection does not match its payment request.','LOYALTY_REQUEST_MISMATCH',409);
 if(collection.requestId&&collection.requestId!==request.id)fail('This reward is already held for another collection.','LOYALTY_REQUEST_MISMATCH',409);
 if(l.collections.some(row=>row.id!==collection.id&&row.requestId===request.id))fail('This payment request already belongs to another loyalty collection.','LOYALTY_REQUEST_MISMATCH',409);
 collection.requestId=request.id;collection.expiresAt=request.expiresAt;
 memberLink(l,memberFor(l,collection.memberId),collection.shopId,{requestId:request.id,createdAt:collection.createdAt,by:collection.by,rewardId:collection.rewardId});return collectionEntity(collection);
}
function collectionEntity(c){return {id:c.id,collectionId:c.id,requestId:c.requestId,memberId:c.memberId,shopId:c.shopId,grossAmount:c.grossAmount,discount:c.discount,amount:c.amount,description:c.description,expiresAt:c.expiresAt,state:c.state};}
function entityFor(l,saved){if(saved.operation==='prepareCollection'){const collection=l.collections.find(c=>c.id===saved.entity.id);return collection?collectionEntity(collection):clone(saved.entity);}return clone(saved.entity);}
function memberVisibleAt(l,member,shopIds){return shopIds.includes(member.joinedShopId)||l.links.some(link=>link.memberId===member.id&&shopIds.includes(link.shopId))||l.rewards.some(reward=>reward.memberId===member.id&&reward.state==='redeemed'&&shopIds.includes(reward.redeemedShopId));}
function attemptAllowed(b,c,l,saved){
 if(!saved||saved.operator!==operatorStamp(b,c)||saved.sessionId!==(c.session?.id||null))return false;
 const rights=access(b,c),id=saved.shopId;
 if(id&&!rights.allowedShopIds.includes(id)||saved.requiredOwner&&!rights.canConfigure||saved.requiredAdjust&&(!rights.canAdjust||c.user.role!=='owner'&&!l.managerShopIds.includes(id)))return false;
 const member=saved.entity.memberId&&l.members.find(m=>m.id===saved.entity.memberId);
 return !member||c.user.role==='owner'||memberVisibleAt(l,member,rights.allowedShopIds);
}
function validateRule(payload,b,l,at){
 keys(payload,['name','colour','earning','minimumSpend','target','onePerDay','shopIds','reward','budgetLimit']);
 const name=text(payload.name,'Programme name',80),colour=payload.colour||'#c9f64a';if(!/^#[a-fA-F0-9]{6}$/.test(colour))fail('Choose a six-digit programme colour.');
 if(!['visits','spend'].includes(payload.earning))fail('Choose visits or qualifying spending.');
 if(!Array.isArray(payload.shopIds)||!payload.shopIds.length||payload.shopIds.some(id=>!b.shops.some(s=>s.id===id)))fail('Choose participating shops from this business.');
 const target=money(payload.target);if(payload.earning==='visits'&&target>100)fail('Use between 1 and 100 qualifying visits.');
 if(typeof payload.onePerDay!=='boolean')fail('Choose whether visits are limited to one per day.');
 keys(payload.reward,['type','name','value','cost','minimumSpend','expiryDays']);const reward=clone(payload.reward);
 if(!['discount','item'].includes(reward.type))fail('Choose a discount or a staff-fulfilled item.');reward.name=text(reward.name,'Reward name',100);
 reward.cost=money(reward.type==='discount'?reward.value:reward.cost);reward.value=reward.type==='discount'?money(reward.value):0;reward.minimumSpend=money(reward.minimumSpend,true);
 if(reward.type==='discount'&&(reward.minimumSpend<=reward.value))fail('The reward minimum purchase must be greater than its discount.');
 if(reward.type==='item'&&reward.minimumSpend!==0)fail('Free-item rewards are handed over without a new purchase. Set their minimum purchase to zero.');
 if(!Number.isSafeInteger(reward.expiryDays)||reward.expiryDays<1||reward.expiryDays>365)fail('Choose a reward expiry of 1–365 days.');
 const budgetLimit=money(payload.budgetLimit);if(budgetLimit<loyaltyBudgetUsed(l))fail('The reward budget cannot be below existing reward costs and commitments.','LOYALTY_BUDGET_COMMITTED');
 if(budgetLimit<reward.cost)fail('The budget must cover at least one reward.','LOYALTY_BUDGET_COMMITTED');
 return {name,colour,budgetLimit,rule:{version:l.ruleVersions.length+1,earning:payload.earning,minimumSpend:money(payload.minimumSpend),target,onePerDay:payload.onePerDay,shopIds:[...new Set(payload.shopIds)],reward,createdAt:at}};
}

export function mutateLoyalty(network,context,input,{now}={}){
 const original=network.businesses?.[context?.user?.businessId];if(!original)fail('Sign in to this merchant before managing loyalty.','LOYALTY_FORBIDDEN',403);
 access(original,context);keys(input,['operation','payload','mutationId','expectedRevision']);
 const operation=input.operation,payload=input.payload||{},mutationId=input.mutationId,at=stamp(now);
 if(typeof mutationId!=='string'||!/^[A-Za-z0-9_.:-]{10,120}$/.test(mutationId))fail('Keep a stable loyalty request reference.','LOYALTY_REFERENCE_REQUIRED');
 const b=clone(original);reconcileLoyalty(b,{now:at});const l=normalizeLoyalty(b.loyalty),operator=operatorStamp(b,context),fingerprint=canonical({operation,payload,operator});
 b.loyalty=l;const saved=own(l._attempts,mutationId)?l._attempts[mutationId]:null;
 if(saved){if(saved.fingerprint!==fingerprint)fail('This loyalty reference was used with different details or another operator.','LOYALTY_REFERENCE_CONFLICT',409);if(!attemptAllowed(b,context,l,saved))fail('Your access changed after this loyalty request.','LOYALTY_FORBIDDEN',403);return {unchanged:true,entity:entityFor(l,saved),replayed:true};}
 if(input.expectedRevision!==l.revision)fail('Loyalty changed. Refresh before saving these details.','LOYALTY_CHANGED',409);
 const admission=['saveProgramme','enrollMember','attachPayment','attachRequest','recordExternalSale'].includes(operation)||operation==='prepareCollection'&&!payload.rewardId||operation==='adjustProgress'&&payload.units>0;
 if(admission&&(l.capacityPaused||capacityReached(b,l)))fail(capacityMessage,'LOYALTY_CAPACITY',409);
 let entity={id:null};
 if(operation==='saveProgramme'){
  owner(b,context);const config=validateRule(payload,b,l,at);l.ruleVersions.push(config.rule);
  l.programme={id:l.programme?.id||uid('loyalty-programme'),businessId:b.business.id,name:config.name,colour:config.colour,status:l.programme?.status||'active',statusHistory:l.programme?.statusHistory||[{status:'active',changedAt:at}],currentVersion:config.rule.version,budgetLimit:config.budgetLimit,createdAt:l.programme?.createdAt||at,updatedAt:at};entity={id:l.programme.id,ruleVersion:config.rule.version};
 }else{
  if(!l.programme)fail('The owner needs to create a loyalty programme first.','LOYALTY_NOT_CONFIGURED',409);
  if(operation==='setPaused'){keys(payload,['paused']);owner(b,context);if(typeof payload.paused!=='boolean')fail('Choose whether earning is paused.');l.programme.status=payload.paused?'paused':'active';l.programme.statusHistory=[...list(l.programme.statusHistory),{status:l.programme.status,changedAt:at}];entity={id:l.programme.id};}
  else if(operation==='setBudget'){keys(payload,['amount']);owner(b,context);const amount=money(payload.amount);if(amount<loyaltyBudgetUsed(l))fail('Keep enough budget for existing rewards.','LOYALTY_BUDGET_COMMITTED');l.programme.budgetLimit=amount;entity={id:l.programme.id};}
  else if(operation==='setManagerAccess'){keys(payload,['shopIds']);owner(b,context);if(!Array.isArray(payload.shopIds)||payload.shopIds.some(id=>!b.shops.some(s=>s.id===id)))fail('Choose manager shops from this business.');l.managerShopIds=[...new Set(payload.shopIds)];entity={id:l.programme.id};}
  else if(operation==='enrollMember'){
   keys(payload,['name','phone','shopId','membershipConsent','marketingConsent']);const shopId=shop(b,context,payload.shopId);
   if(l.programme.status!=='active')fail('New membership is paused with this programme.','LOYALTY_PAUSED',409);
   const rule=l.ruleVersions.find(r=>r.version===l.programme.currentVersion);if(!rule.shopIds.includes(shopId))fail('This shop is not participating in the programme.','LOYALTY_SHOP_EXCLUDED',403);
   if(payload.membershipConsent!==true||typeof payload.marketingConsent!=='boolean')fail('Record membership consent and a separate marketing choice.','LOYALTY_CONSENT_REQUIRED');
   if(l.members.length>=LOYALTY_LIMITS.members)fail('This prototype supports up to 500 programme members. Export the records and contact support.','LOYALTY_CAPACITY',409);
   const code='LC-'+Array.from(crypto.getRandomValues(new Uint8Array(10)),x=>x.toString(16).padStart(2,'0')).join('').toUpperCase();
   const member={id:uid('loyalty-member'),code,name:text(payload.name,'Member name',80),phone:payload.phone?phone(payload.phone):null,marketingConsent:payload.marketingConsent,consentVersion:LOYALTY_CONSENT_VERSION,consentedAt:at,consentedBy:context.user.id,active:true,joinedShopId:shopId,ruleVersion:rule.version,createdAt:at,updatedAt:at};l.members.push(member);log(l,'member-enrolled',member,shopId,at,{by:context.user.id});entity={id:member.id,memberId:member.id,code};
  }else if(operation==='createLinkGrant'){
   keys(payload,['memberId','shopId','claimHash']);const m=memberFor(l,payload.memberId),shopId=shop(b,context,payload.shopId);activeMember(l,m);participating(l,m,shopId);
   if(m._consumerUserId)fail('This membership is already linked to a Lumo account.','LOYALTY_ALREADY_LINKED',409);
   if(!/^[a-f0-9]{64}$/.test(payload.claimHash||''))fail('Use a fresh private linking code.','LOYALTY_CLAIM_INVALID');
   if(l._claimGrants.length>=1000)fail('This prototype has reached its linking-code history limit. Contact support.','LOYALTY_CAPACITY',409);
   if(l._claimGrants.some(g=>g.hash===payload.claimHash))fail('Create a new private linking code.','LOYALTY_CLAIM_INVALID',409);
   for(const grant of l._claimGrants)if(grant.memberId===m.id&&!grant.usedAt&&!grant.revokedAt)grant.revokedAt=at;
   const grant={id:uid('loyalty-claim'),memberId:m.id,shopId,hash:payload.claimHash,createdAt:at,expiresAt:new Date(Date.parse(at)+10*60000).toISOString(),by:context.user.id};l._claimGrants.push(grant);
   log(l,'link-code-created',m,shopId,at,{by:context.user.id});entity={id:grant.id,grantId:grant.id,memberId:m.id,expiresAt:grant.expiresAt};
  }else if(operation==='updateMember'){
   keys(payload,['memberId','name','phone','marketingConsent','active']);owner(b,context);const member=memberFor(l,payload.memberId);
   if(own(payload,'name'))member.name=text(payload.name,'Member name',80);if(own(payload,'phone'))member.phone=payload.phone?phone(payload.phone):null;
   if(own(payload,'marketingConsent')){if(typeof payload.marketingConsent!=='boolean')fail('Record an explicit marketing choice.');member.marketingConsent=payload.marketingConsent;}
   if(own(payload,'active')){if(typeof payload.active!=='boolean')fail('Choose a valid membership state.');member.active=payload.active;}
   member.updatedAt=at;log(l,'member-updated',member,member.joinedShopId,at,{by:context.user.id});entity={id:member.id,memberId:member.id,code:member.code};
  }else if(['attachPayment','attachRequest'].includes(operation)){
   keys(payload,['memberId','transactionId','requestId','shopId']);const m=memberFor(l,payload.memberId),shopId=shop(b,context,payload.shopId);activeMember(l,m);participating(l,m,shopId);
   const source=operation==='attachPayment'?list(b.transactions).find(t=>t.id===payload.transactionId):list(b.requests).find(r=>r.id===payload.requestId);
   if(!source||source.shopId!==shopId||operation==='attachPayment'&&source.status!=='paid'||operation==='attachRequest'&&source.status!=='open')fail('Choose an available confirmed sale or open request from this shop.','LOYALTY_SALE_UNAVAILABLE',409);
   if(operation==='attachPayment'&&Date.parse(source.confirmedAt||source.createdAt)<Date.parse(m.createdAt))fail('Purchases before membership cannot earn rewards.','LOYALTY_PRE_MEMBERSHIP');
   const link=memberLink(l,m,shopId,{requestId:operation==='attachRequest'?source.id:source.requestId||null,transactionId:operation==='attachPayment'?source.id:null,createdAt:at,by:context.user.id});entity={id:link.id,memberId:m.id};
  }else if(operation==='prepareCollection'){
   keys(payload,['memberId','shopId','grossAmount','rewardId','description']);entity=prepareLoyaltyCollection(b,context,payload,{now:at,mutationId});
  }else if(operation==='recordExternalSale'){
   keys(payload,['memberId','shopId','amount','method','reference','confirmed']);const m=memberFor(l,payload.memberId),shopId=shop(b,context,payload.shopId);manager(b,context,shopId);activeMember(l,m);participating(l,m,shopId);
   if(payload.confirmed!==true||!['cash','external-momo'].includes(payload.method))fail('Confirm the external sale and its payment method.');
   const reference=text(payload.reference,'External sale reference',100);if(l.externalSales.some(s=>s.reference===reference))fail('This external sale reference was already recorded.','LOYALTY_EXTERNAL_DUPLICATE',409);
   const sale={id:uid('loyalty-sale'),memberId:m.id,shopId,amount:money(payload.amount),refunded:0,returns:[],method:payload.method,reference,status:'paid',createdAt:at,confirmedAt:at,by:context.user.id,merchantAttested:true};l.externalSales.push(sale);memberLink(l,m,shopId,{externalSaleId:sale.id,source:'external',createdAt:at,by:context.user.id});entity={id:sale.id,saleId:sale.id,memberId:m.id};
  }else if(operation==='refundExternalSale'){
   keys(payload,['saleId','shopId','amount','reason']);const shopId=shop(b,context,payload.shopId);manager(b,context,shopId);const sale=l.externalSales.find(s=>s.id===payload.saleId&&s.shopId===shopId);if(!sale)fail('Choose an external sale in this shop.','LOYALTY_SALE_UNAVAILABLE',404);
   const amount=money(payload.amount);if(amount>sale.amount-sale.refunded)fail('The recorded return exceeds the remaining external sale.','LOYALTY_REFUND_EXCEEDS');sale.refunded+=amount;sale.returns.push({id:uid('loyalty-return'),amount,reason:text(payload.reason,'Return reason',200),createdAt:at,by:context.user.id});entity={id:sale.id,saleId:sale.id,memberId:sale.memberId};
  }else if(operation==='adjustProgress'){
   keys(payload,['memberId','shopId','units','reason']);const m=memberFor(l,payload.memberId),shopId=shop(b,context,payload.shopId),rule=participating(l,m,shopId);manager(b,context,shopId);
   if(!Number.isSafeInteger(payload.units)||payload.units===0||Math.abs(payload.units)>9999999999)fail('Use a non-zero whole progress adjustment.');const reason=text(payload.reason,'Adjustment reason',200);
   if(payload.units>0&&loyaltyBudgetUsed(l)+Math.floor(Math.max(0,loyaltyMemberBalance(l,m.id)+payload.units)/rule.target)*rule.reward.cost>l.programme.budgetLimit)fail('Increase the reward budget before this adjustment.','LOYALTY_BUDGET_COMMITTED');
   log(l,'manual-adjustment',m,shopId,at,{units:payload.units,reason,by:context.user.id});if(payload.units>0)issueRewards(l,m,rule,'manual-'+mutationId,shopId,at);else revokeUnfundedProgress(l,m,rule,shopId,at,'manual-'+mutationId);entity={id:m.id,memberId:m.id};
  }else if(operation==='fulfilItem'){
   keys(payload,['memberId','rewardId','shopId','reason']);const m=memberFor(l,payload.memberId),shopId=shop(b,context,payload.shopId);activeMember(l,m);participating(l,m,shopId);
   const reward=l.rewards.find(r=>r.id===payload.rewardId&&r.memberId===m.id);if(!reward||reward.type!=='item'||reward.state!=='available'||Date.parse(reward.expiresAt)<=Date.parse(at))fail('This item reward is no longer available.','LOYALTY_REWARD_UNAVAILABLE',409);
   reward.state='redeemed';reward.redeemedAt=at;reward.redeemedShopId=shopId;log(l,'item-fulfilled',m,shopId,at,{rewardId:reward.id,reason:text(payload.reason||'Reward item handed over','Fulfilment note',200),by:context.user.id});entity={id:reward.id,rewardId:reward.id,memberId:m.id};
  }else if(operation==='resolveReview'){
   keys(payload,['reviewId','reason']);const item=l.reviews.find(r=>r.id===payload.reviewId);if(!item)fail('This review was not found.','LOYALTY_REVIEW_NOT_FOUND',404);manager(b,context,item.shopId);item.state='resolved';item.resolvedAt=at;item.resolvedBy=context.user.id;item.resolution=text(payload.reason,'Review resolution',200);entity={id:item.id,reviewId:item.id};
  }else fail('Choose a supported loyalty action.','LOYALTY_ACTION');
 }
 b.loyalty=l;reconcileLoyalty(b,{now:at});const final=b.loyalty;final.revision++;final.updatedAt=at;
 final._attempts[mutationId]={operation,fingerprint,operator,userId:context.user.id,sessionId:context.session?.id||null,shopId:payload.shopId||(operation==='resolveReview'?final.reviews.find(r=>r.id===payload.reviewId)?.shopId:null)||null,requiredOwner:['saveProgramme','setPaused','setBudget','setManagerAccess','updateMember'].includes(operation),requiredAdjust:['adjustProgress','recordExternalSale','refundExternalSale','resolveReview'].includes(operation),entity:clone(entity),createdAt:at};
 original.loyalty=final;audit(network,'LOYALTY_'+operation.toUpperCase(),b.business.id,context.user.id,{entityId:entity.id});
 return {entity,replayed:false};
}

export function loyaltyProjection(b,context,query={}){
 const rights=access(b,context),l=normalizeLoyalty(b.loyalty),scope=context.user.role==='owner'&&!context.counter?null:rights.allowedShopIds;
 if(query.shopId)shop(b,context,query.shopId);
 const allowed=new Set(query.shopId?[query.shopId]:rights.allowedShopIds),visibleMember=m=>context.user.role==='owner'||memberVisibleAt(l,m,[...allowed]);
 const selected=query.code?l.members.find(m=>m.code===String(query.code).trim().toUpperCase()):query.memberId?l.members.find(m=>m.id===query.memberId):null;
 const fullOwner=context.user.role==='owner'&&!context.counter;
 const safeReward=reward=>fullOwner?clone(reward):Object.fromEntries(['id','type','name','value','minimumSpend','state','expiresAt','earnedAt','ruleVersion'].filter(key=>reward[key]!==undefined).map(key=>[key,reward[key]]));
 const safeRule=rule=>{const result=clone(rule);if(!fullOwner){delete result.reward.cost;result.shopIds=result.shopIds.filter(id=>rights.allowedShopIds.includes(id));}return result;};
 const memberSummary=m=>{const rule=ruleFor(l,m);return {id:m.id,code:m.code,name:m.name,consumerLinked:!!m._consumerUserId,phone:fullOwner?m.phone:undefined,phoneMasked:m.phone?'••••'+m.phone.slice(-4):'',marketingConsent:m.marketingConsent,active:m.active,joinedShopId:fullOwner||rights.allowedShopIds.includes(m.joinedShopId)?m.joinedShopId:null,ruleVersion:m.ruleVersion,createdAt:m.createdAt,progress:loyaltyMemberBalance(l,m.id),target:rule.target,earning:rule.earning,rules:safeRule(rule),rewards:l.rewards.filter(r=>r.memberId===m.id).map(safeReward)};};
 const selectedAllowed=selected&&(visibleMember(selected)||query.code&&rights.allowedShopIds.some(id=>ruleFor(l,selected).shopIds.includes(id)));
 if(selected&&!selectedAllowed)fail('This membership is outside your assigned shops.','LOYALTY_MEMBER_FORBIDDEN',403);
 const summary=selectedAllowed?memberSummary(selected):null;
 if(summary){summary.history=l.ledger.filter(row=>row.memberId===selected.id&&(scope===null||allowed.has(row.shopId))).slice(-100).reverse().map(clone);summary.externalSales=l.externalSales.filter(s=>s.memberId===selected.id&&(scope===null||allowed.has(s.shopId))).map(s=>({id:s.id,shopId:s.shopId,amount:s.amount,refunded:s.refunded,method:s.method,reference:s.reference,createdAt:s.createdAt}));}
 const term=typeof query.query==='string'?query.query.trim().toLowerCase():'';
 const matches=rights.canListMembers?l.members.filter(visibleMember).filter(m=>!term||[m.name,m.code,context.user.role==='owner'?m.phone:''].some(v=>String(v||'').toLowerCase().includes(term))):[];
 const pageSize=query.pageSize===undefined?500:Number(query.pageSize),page=query.page===undefined?1:Number(query.page);
 if(!Number.isSafeInteger(pageSize)||pageSize<1||pageSize>500||!Number.isSafeInteger(page)||page<1||page>10000)fail('Choose a valid loyalty page.','LOYALTY_PAGE');
 const members=matches.slice((page-1)*pageSize,page*pageSize).map(memberSummary);
 const programme=l.programme?{...clone(l.programme),budgetUsed:loyaltyBudgetUsed(l),budgetRemaining:Math.max(0,l.programme.budgetLimit-loyaltyBudgetUsed(l))}:null;
 if(programme&&!rights.canConfigure){delete programme.budgetLimit;delete programme.budgetUsed;delete programme.budgetRemaining;}
 const rule=l.ruleVersions.find(r=>r.version===l.programme?.currentVersion)||null;
 const result={revision:l.revision,access:rights,programme,rules:rule?{...safeRule(rule),terms:loyaltyTerms(rule)}:null,shops:b.shops.filter(s=>rights.allowedShopIds.includes(s.id)).map(s=>({id:s.id,name:s.name})),members,member:summary,page,pageSize,memberCount:matches.length,totalMatches:matches.length,totalMembers:rights.canListMembers?l.members.filter(visibleMember).length:0,capacityPaused:l.capacityPaused,capacityMessage:l.capacityMessage,
  metrics:rights.canViewReports?loyaltyMetrics(l,{shopIds:query.shopId?[query.shopId]:scope}):null,
  activity:rights.canViewReports?l.ledger.filter(row=>scope===null||allowed.has(row.shopId)).slice(-100).reverse().map(clone):[],reviews:rights.canViewReports?l.reviews.filter(row=>scope===null||allowed.has(row.shopId)).map(clone):[],managerShopIds:rights.canConfigure?[...l.managerShopIds]:[]};
 if(rights.canConfigure)result.ruleVersions=l.ruleVersions.map(clone);
 if(query.mutationId){
  const saved=own(l._attempts,query.mutationId)?l._attempts[query.mutationId]:null;
  const value=saved&&entityFor(l,saved),receiptMember=value?.memberId&&l.members.find(m=>m.id===value.memberId);
  const visible=!receiptMember||visibleMember(receiptMember);
  const safeEntity=value&&Object.fromEntries(['id','memberId','code','grantId','requestId','collectionId','shopId','amount','grossAmount','discount','expiresAt','state','rewardId','saleId','reviewId','ruleVersion'].filter(key=>value[key]!==undefined).map(key=>[key,value[key]]));
  result.mutationReceipt=attemptAllowed(b,context,l,saved)&&visible?{found:true,operation:saved.operation,entity:safeEntity}:{found:false};
 }
 return result;
}
