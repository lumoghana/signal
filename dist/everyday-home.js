/* Everyday account hierarchy. Shared account, Budget and privacy authorities
   still supply every figure and destination. This module owns Home only. */
(()=>{
'use strict';
if(!window.L||L.everydayHomeHierarchy)return;
const E=L.e,B=L.btn,M=L.money,previous=L.views.home;
const allowed=()=>!!L.state.onboarded&&!L.state.locked&&!L.state.closed;
function element(html,opening){
 const start=html.indexOf(opening);if(start<0)return '';
 const tags=/<\/?div\b[^>]*>/g;tags.lastIndex=start;let depth=0,match;
 while((match=tags.exec(html))){depth+=match[0].startsWith('</')?-1:1;if(depth===0)return html.slice(start,tags.lastIndex);}
 return '';
}
const value=(key,amount,large=false)=>L.privateMoney(key,amount,large);
const button=(label,icon,action,cls)=>B(L.icon(icon,19)+'<span>'+label+'</span>',action,cls);
L.views.home=function(...args){
 const inherited=previous.apply(this,args);if(!allowed())return inherited;
 const s=L.state,b=L.balances(),a=L.accountBalances(),has=L.hasMeaningfulPlan(s),budget=L.budgetStateSummary?.(s);
 const boxes=(s.goals||[]).filter(box=>!box.archived&&!box.deleted).length;
 const primaryAmount=has?b.room:a.available,primaryId=has?'overview-room':'overview-balance';
 const primaryKey=has?'room':'available',wide=Math.abs(primaryAmount)>=1000,huge=Math.abs(primaryAmount)>=10000000;
 const start=s.planDraft?.step||'planSetup';
 const budgetAction=has?(budget?.ended?"L.go('planPeriod')":"L.spendingOutlook.open()"):`L.go('${E(start)}')`;
 const detailsAction=has&&!budget?.ended?"L.budgetReadability?.rememberItems(true);L.openTab('plan')":budgetAction;
 const budgetLabel=has?(budget?.ended?'Review budget dates':'See budget details'):s.planDraft?'Continue your budget':'Add a budget';
 const privacy=L.balancePrivacyControl(true,has?'overview-room overview-balance overview-savings':'overview-balance overview-savings');
 const header=element(inherited,'<div class="home-greeting"'),greeting=element(inherited,'<div class="accounts-welcome"');
 const campus=element(inherited,'<div class="notice pilot-campus-note"')||(!L.isLegonUniversity?.(s.profile.campus)&&s.profile.campus?'<p class="notice pilot-campus-note">Built for Legon first. Some campus features may be limited here.</p>':'');
 const art=L.campusArt?.draw(b.available?'home':'clarity','home')||'';
 const context=has?`<div class="everyday-available-context${Math.abs(b.available)>=10000?' has-wide-context':''}"><span>Available balance</span><strong id="overview-balance">${value('available',a.available)}</strong></div>`:'';
 const pending=a.held?`<button type="button" class="everyday-pending" onclick="L.go('pending')">${L.icon('clock',14)}<span>Payment in progress</span>${L.icon('chevron',14)}</button>`:'';
 const gap=has&&b.gap?`<button type="button" class="everyday-gap" onclick="L.go('makeRoom')">Your Budget needs attention ${L.icon('chevron',14)}</button>`:'';
 const migration=Number(s.accounts?.migration?.unfunded)>0?`<p class="notice everyday-migration">${M(s.accounts.migration.unfunded)} of an old allocation could not move into savings. ${B('Review boxes',"L.go('goals')",'text-btn')}</p>`:'';
 return `<section class="accounts-home home-refined home-minimal home-restored edition-home everyday-account-home" data-illustrated-screen="home"><h1 class="sr-only">Home</h1>${header}${greeting}${campus}<section class="account-card account-operational everyday-money-card${has?' has-budget':''}${wide?' has-wide-amount':''}${huge?' has-huge-amount':''}" aria-label="Everyday money"><div class="everyday-account-heading"><div><h2>Everyday money</h2><p>Operational account</p></div>${privacy}</div><div class="everyday-money-main"><button type="button" class="everyday-primary-money account-room" ${has&&!budget?.ended?'data-spending-outlook-entry':''} onclick="${has?budgetAction:"L.go('balances')"}" aria-label="${has?'Left after budget. See calculation':'Available balance. See account breakdown'}"><span class="everyday-primary-label">${has?'Left after budget':'Available balance'}</span><strong id="${primaryId}">${value(primaryKey,primaryAmount,true)}</strong></button><div class="everyday-home-art accounts-home-art">${art}</div></div>${context}<button type="button" class="everyday-budget-link" onclick="${detailsAction}"><span>${budgetLabel}${!has&&s.planDraft?'<small>Your progress is saved.</small>':''}</span>${L.icon('chevron',16)}</button>${gap}${pending}${button('Add money','plus',"L.openFunding('home')",'everyday-add-money')}</section><section class="account-card account-savings everyday-boxes-card" aria-label="Money Boxes"><button type="button" class="everyday-boxes-open" onclick="L.go('goals')" aria-label="Money Boxes. See your savings account"><span class="everyday-boxes-icon" aria-hidden="true">${L.icon('target',23)}</span><span class="everyday-boxes-copy"><strong class="everyday-boxes-title">Money Boxes</strong><small>Savings account</small><strong class="everyday-savings-amount${Math.abs(a.savings)>=10000?' has-wide-savings':''}" id="overview-savings">${value('savings',a.savings)}</strong><small class="everyday-boxes-count">${boxes} ${boxes===1?'Money Box':'Money Boxes'}</small></span>${L.icon('chevron',17)}</button></section><div class="everyday-home-actions" role="group" aria-label="Quick actions">${button('Request money','arrowDown','L.newRequest()','secondary')}${button('Transfers','arrowUp',"L.go('sendOptions')",'secondary home-transfers')}</div>${migration}</section>`;
};
L.everydayHomeHierarchy=Object.freeze({edition:'everyday',homeActions:['Request money','Transfers'],amountIds:['overview-room','overview-balance','overview-savings']});
})();
