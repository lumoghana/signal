/* Signal money journeys. Decorative composition only: native controls,
   financial facts, approval states, drafts and authentication stay intact. */
(()=>{
'use strict';
if(!window.L||L.signalPayments)return;
const groups={
 payment:['pay','sendOptions','send','bill','paymentReview','authorize','paymentResult','paymentCancel','paymentPlanLink','paymentRecovery','everydayPayments','everydayRepeatChoice'],
 funding:['addMoney','momoAdd','bankAdd','budgetAfterFunding'],
 records:['activity','pending','txDetail','requests','requestCreate','requestDetail','requestConfirm'],
 collection:['collectionPayoutRail','monoGroupDraftReplace'],
 qr:['campusPay','myQr']
};
const families=new Map(Object.entries(groups).flatMap(([family,routes])=>routes.map(route=>[route,family])));
function family(route){
 if(families.has(route))return families.get(route);
 if(/^groupMoney|^shared/.test(route))return 'collection';
 if(/^virtualCard/.test(route)||route==='cardsHome')return 'cards';
 if(/^merchant|^settlement/.test(route))return 'merchant';
 return null;
}
const lux='<img class="signal-finance-lux signal-avatar-2d" src="/brand/lumo-avatar-icon-512.png" width="512" height="512" alt="" aria-hidden="true" decoding="async">';
function hero(html,token,kind){
 const pattern=new RegExp('<(div|section)\\b([^>]*\\bclass="([^"]*\\b'+token+'\\b[^"]*)"[^>]*)>');
 return html.replace(pattern,(opening,tag,attributes,classes)=>'<'+tag+attributes.replace('class="'+classes+'"','class="'+classes+' signal-finance-hero signal-finance-hero-'+kind+'"')+'>'+lux);
}
const decorate=L.decorateView;
L.decorateView=function(html,route){
 let out=decorate?decorate.call(this,html,route):html;
 const kind=family(route);if(!kind)return out;
 // A marker on an existing element supplies inspectable route coverage without
 // adding a wrapper or changing retained task, form or scrolling structure.
 out=out.replace(/^(\s*)<([a-z][\w:-]*)\b/i,(_,space,tag)=>space+'<'+tag+' data-signal-payment-family="'+kind+'"');
 if(route==='pay')out=hero(out,'focus-pay-heading','pay');
 if(route==='addMoney'&&out.includes('funding-choices'))out=hero(out,'page-heading','funding');
 if(route==='groupMoneyHome')out=hero(out,'page-heading','collect');
 if(route==='cardsHome'||route==='virtualCards'){
  if(out.includes('class="vc-empty"'))out=hero(out,'vc-empty','cards');
  else if(out.includes('class="vc-list"'))out=out.replace('<div class="vc-list">','<div class="signal-cards-caption" aria-hidden="true"><span>For your online spending.</span>'+lux+'</div><div class="vc-list">');
 }
 return out;
};
L.signalPayments=Object.freeze({version:1,family,routes:Object.freeze([...families.keys()])});
})();
