/* Merchant loyalty projections. No money movements or browser storage. */
const clone=value=>structuredClone(value);
const list=value=>Array.isArray(value)?value:[];
export const LOYALTY_CONSENT_VERSION='2026-11-17.merchant-loyalty.1';
export const LOYALTY_LIMITS=Object.freeze({members:500,events:6000,rewards:3000,collections:3000,attempts:6000});
export function normalizeLoyalty(value){
 const raw=value&&typeof value==='object'&&!Array.isArray(value)?clone(value):{};
 return {version:1,revision:Number.isSafeInteger(raw.revision)?raw.revision:0,programme:raw.programme||null,
  ruleVersions:list(raw.ruleVersions),members:list(raw.members),links:list(raw.links),collections:list(raw.collections),externalSales:list(raw.externalSales),
  ledger:list(raw.ledger),rewards:list(raw.rewards),reviews:list(raw.reviews),managerShopIds:list(raw.managerShopIds),_attempts:raw._attempts&&typeof raw._attempts==='object'?raw._attempts:{},_claimGrants:list(raw._claimGrants),_consumerAttempts:raw._consumerAttempts&&typeof raw._consumerAttempts==='object'?raw._consumerAttempts:{},updatedAt:raw.updatedAt||null,capacityPaused:raw.capacityPaused===true,capacityMessage:raw.capacityMessage||''};
}
export function loyaltyRulesForMember(value,member){return list(value?.ruleVersions).find(rule=>rule.version===member?.ruleVersion)||null;}
export function loyaltyMemberBalance(value,memberId){
 const total=list(value?.ledger).filter(entry=>entry.memberId===memberId).reduce((n,entry)=>n+(Number.isSafeInteger(entry.units)?entry.units:0),0);
 if(!Number.isSafeInteger(total))throw Error('Loyalty progress exceeds the safe limit.');return total;
}
export function loyaltyBudgetUsed(value){
 const total=list(value?.rewards).filter(reward=>!['expired','revoked'].includes(reward.state)).reduce((n,reward)=>n+reward.cost,0);
 if(!Number.isSafeInteger(total))throw Error('Loyalty commitments exceed the safe limit.');return total;
}
export function loyaltyTerms(rule){
 if(!rule)return '';
 const cash=amount=>'GH₵'+(amount/100).toFixed(2);
 const earning=rule.earning==='visits'?`${rule.target} purchases of ${cash(rule.minimumSpend)} or more`:`${cash(rule.target)} in qualifying spending (minimum ${cash(rule.minimumSpend)} per purchase)`;
 const reward=rule.reward.type==='item'?rule.reward.name:`${cash(rule.reward.value)} off a purchase of ${cash(rule.reward.minimumSpend)} or more`;
 return `Collect ${earning} to earn ${reward}. ${rule.earning==='visits'&&rule.onePerDay?'One qualifying visit per day. ':''}Rewards expire ${rule.reward.expiryDays} days after earning. Reward purchases do not earn new progress. New earning pauses if the programme is paused or its reward budget is exhausted. Existing members keep the terms they joined under.`;
}
export function loyaltyMetrics(value,{shopIds=null}={}){
 const allowed=shopIds?new Set(shopIds):null,visible=entry=>!allowed||allowed.has(entry.shopId);
 const purchases=list(value.links).filter(link=>link.paid&&visible(link)),rewards=list(value.rewards),redemptions=rewards.filter(reward=>reward.state==='redeemed'&&visible({shopId:reward.redeemedShopId}));
 const members=allowed?list(value.members).filter(member=>allowed.has(member.joinedShopId)||purchases.some(p=>p.memberId===member.id)):list(value.members);
 const net=purchases.reduce((n,entry)=>n+Math.max(0,(entry.paidAmount||0)-(entry.refunded||0)),0);
 const counts=new Map();for(const purchase of purchases)if((purchase.paidAmount||0)>(purchase.refunded||0))counts.set(purchase.memberId,(counts.get(purchase.memberId)||0)+1);
 const outstanding=rewards.filter(reward=>['available','held'].includes(reward.state)&&(!allowed||allowed.has(reward.earnedShopId)));
 const issued=rewards.filter(reward=>!allowed||allowed.has(reward.earnedShopId));
 return {members:members.length,activeMembers:members.filter(m=>m.active!==false).length,memberSales:net,confirmedPurchases:purchases.filter(p=>p.source==='connected').length,
  repeatMembers:[...counts.values()].filter(n=>n>1).length,averagePurchase:purchases.length?Math.round(net/purchases.length):0,
  issuedRewards:issued.length,redeemedRewards:redemptions.length,outstandingRewards:outstanding.length,
  rewardCostUsed:redemptions.reduce((n,r)=>n+r.cost,0),outstandingCost:outstanding.reduce((n,r)=>n+r.cost,0),
  discountsGiven:redemptions.filter(r=>r.type==='discount').reduce((n,r)=>n+(r.actualDiscount||r.value),0),
  externalRecordedSales:purchases.filter(p=>p.source==='external').reduce((n,p)=>n+Math.max(0,(p.paidAmount||0)-(p.refunded||0)),0),
  reviewCount:list(value.reviews).filter(r=>r.state==='open'&&visible(r)).length,
  ...(!allowed?{budgetLimit:value.programme?.budgetLimit||0,budgetUsed:loyaltyBudgetUsed(value),budgetRemaining:Math.max(0,(value.programme?.budgetLimit||0)-loyaltyBudgetUsed(value))}:{})};
}
