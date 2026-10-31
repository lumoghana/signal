/* Signal planning and personal-money composition. Existing views remain the
   source of every amount, qualifier, field, action and financial decision. */
(()=>{
'use strict';
if(!window.L||!L.signalEdition||L.signalPlanning)return;
const routes={};
const add=(family,names)=>names.split(' ').filter(Boolean).forEach(name=>{routes[name]=family;});
add('plan','plan essentials essentialEdit planEdit planSetup firstEssentials firstGoal firstPlanReview firstBudgetExample planBenefit planExplanation planPeriod planDraftRestart budgetCategory budgetDelete budgetEstimate budgetHistory budgetCycle budgetCycleReview budgetPeriodReview budgetReviewNext budgetReviewDates incomePlan budgetAfterFunding spendingOutlook makeRoom allowance missions');
add('boxes','goals goal goalEdit savingsHackOverview allocate releaseGoal allocationReview releaseReview savingRule savingMilestones boxProtectionInvite boxProtectionChange boxProtectionSupport');
add('story','moneyStoryHome homeMoneyStory story dailyMoneyStory storyTx categoryEdit categorySort categoryMatch');
add('iou','iouHome iouForm iouReview iouDetail iouRecord iouRecordReview iouClose iouCorrect iouPayment iouRequestReview iouReceipt iouReceiptReview');
add('holdings','allMoney balances moneySource moneySourceReview moneySourceRemove');
add('recovery','recoveryStart recoveryAdjust recoveryReview recoveryPlan recoveryComplete');
const roots=new Set(['plan','goals','goal','moneyStoryHome','homeMoneyStory','story','iouHome','allMoney','recoveryStart','recoveryPlan']);
const art=()=>'<span class="signal-planning-art" data-signal-planning-art aria-hidden="true"><img class="signal-avatar-2d" src="/brand/lumo-avatar-icon-512.png" alt="" width="512" height="512" decoding="async"></span>';
function panel(html,token,extra){
 let changed=false;
 return html.replace(/<(div|section)\b([^>]*?)class="([^"]+)"([^>]*)>/g,(whole,tag,before,classes,after)=>{
  if(changed||!classes.split(/\s+/).includes(token))return whole;
  changed=true;
  return `<${tag}${before}class="${classes} ${extra}"${after}>${art()}`;
 });
}
function wrapIOU(html){
 const start=html.indexOf('<div class="ml-two"');
 if(start<0)return html;
 const tags=/<\/?div\b[^>]*>/g;tags.lastIndex=start;
 let depth=0,match;
 while((match=tags.exec(html))){
  depth+=match[0].startsWith('</')?-1:1;
  if(depth===0)return html.slice(0,start)+'<section class="signal-iou-overview">'+html.slice(start,tags.lastIndex)+art()+'</section>'+html.slice(tags.lastIndex);
 }
 return html;
}
const decorate=L.decorateView;
L.decorateView=function(html,route){
 let out=decorate?decorate.call(this,html,route):html;
 if(!routes[route]||out.includes('data-signal-planning-art'))return out;
 if(route==='plan')out=panel(out,'budget-overview-summary','signal-plan-sculpture');
 if(route==='goals'||route==='goal')out=panel(out,'hero','signal-boxes-sculpture');
 if(['moneyStoryHome','homeMoneyStory','story'].includes(route))out=out.replace(/(<strong\b[^>]*class="[^"]*\bms-total\b[^"]*"[^>]*>[\s\S]*?<\/strong>)/,'<div class="signal-story-total-stage">$1'+art()+'</div>');
 if(route==='iouHome')out=wrapIOU(out);
 if(route==='allMoney')out=panel(out,'ml-money','signal-holdings-sculpture');
 if(route==='recoveryPlan')out=panel(out,'ml-money','signal-recovery-sculpture');
 return out;
};
function sync(){
 const family=routes[L.route];
 if(!family)return;
 for(const screen of document.querySelectorAll('.screen-'+L.route)){
  screen.classList.add('signal-family-'+family);
  screen.classList.toggle('signal-family-root',roots.has(L.route));
  screen.classList.toggle('signal-family-work',!roots.has(L.route));
  screen.setAttribute('data-signal-family',family);
 }
}
const render=L.render;
L.render=function(...args){const result=render.apply(this,args);sync();return result;};
L.signalPlanning=Object.freeze({version:1,routes:Object.freeze({...routes}),sync});
sync();
})();
