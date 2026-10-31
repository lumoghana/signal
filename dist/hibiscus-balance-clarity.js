/* Explain the two Home figures before asking for a Budget date. Financial
   values come unchanged from the existing spending-outlook authority. */
(()=>{
'use strict';
if(!window.L||!L.spendingOutlook||L.hibiscusBalanceClarity)return;
const E=L.e,M=L.money;
const view=L.views.spendingOutlook;
L.views.spendingOutlook=function(...args){
 let html=view.apply(this,args);
 const s=L.spendingOutlook.summary();
 if(s.status==='unavailable'||!s.hasBudget)return html;
 const facts=`<div class="balance-meaning" data-balance-meaning><h1>How your balances fit.</h1><p>Available balance is money in your Everyday account. Left after Budget allows for the saved costs still to cover.</p><dl class="balance-meaning-figures"><div><dt>Available balance</dt><dd>${M(s.available)}</dd></div><div><dt>Budget still to cover</dt><dd>${M(-s.budget)}</dd></div><div class="balance-meaning-result"><dt>Left after Budget</dt><dd>${M(s.room)}</dd></div></dl>${s.gap?`<p class="balance-meaning-gap">${L.icon('help',17)} No spare money. ${E(M(s.gap))} of your Budget is uncovered.</p>`:''}<p class="balance-meaning-note">Both figures describe the same money. A Budget does not move or lock it. Money Boxes and card balances are separate.</p></div>`;
 if(s.ready)html=html.replace(`<h1>${M(s.perDay)}</h1>`,`<h2>${M(s.perDay)}</h2>`);
 else html=html.replace(`<h1>${E(s.headline)}</h1>`,`<h2>${E(s.headline)}</h2>`);
 return html.replace(/(<section class="spending-outlook"[^>]*>)/,'$1'+facts);
};
L.hibiscusBalanceClarity=true;
})();
