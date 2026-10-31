/* Payment context always shows the current available account money.
   Projections, transaction results and Home's privacy preference stay separate. */
(()=>{
'use strict';
if(!window.L||L.paymentBalance)return;
const routes=Object.freeze(['pay','sendOptions','campusPay','send','bill','paymentReview','pause','paymentPlanLink','authorize','paymentResult','paymentCancel','pending','txDetail','requests','requestCreate','requestDetail','requestConfirm','addMoney','momoAdd','bankAdd']);
const covered=new Set(routes);
const visible=route=>covered.has(route)&&L.state.onboarded&&!L.state.locked&&!L.state.closed;
const markup=()=>{
 const value=L.balances().available,p=L.moneyParts(value);
 const money=`<span class="payment-balance-currency">${L.e(p.sign+p.currency)}</span><span class="payment-balance-number">${L.e(p.whole+'.'+p.fraction)}</span>`;
 return `<div class="payment-balance" data-payment-balance role="group" aria-label="Current available account balance"><span>Available balance</span><strong data-payment-available-value>${money}</strong></div>`;
};
const decorate=L.decorateView;
L.decorateView=function(html,route){
 let content=decorate?decorate.call(this,html,route):html;
 if(!visible(route)||content.includes('data-payment-balance'))return content;
 // The top-up chooser already had a current-balance block. Replace that block
 // with the same compact row used by the other payment screens.
 if(route==='addMoney')content=content.replace(/<div class="funding-balance">[\s\S]*?<\/div>/,'');
 const balance=markup();
 // Headers remain the first item on dedicated pages. In a sheet the existing
 // duplicate header is hidden, leaving this row immediately under its chrome.
 const header=/<div\b[^>]*class="[^"]*\btopline\b[^"]*"[^>]*>[\s\S]*?<\/div>/;
 if(header.test(content))return content.replace(header,match=>match+balance);
 // Compact result screens omit their own header; keep the outcome and all
 // historical receipt facts intact while showing current account context.
 if(/^\s*<section\b/.test(content))return content.replace(/^(\s*<section\b[^>]*>)/,'$1'+balance);
 return balance+content;
};
L.paymentBalance=Object.freeze({routes,visible});
})();
