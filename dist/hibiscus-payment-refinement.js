/* Mobbin-led review presentation. The retained payment quote, source linking,
   Pause clock and confirmed-result controllers remain the only authority. */
(()=>{
'use strict';
if(!window.L||L.hibiscusPaymentRefinement)return;
const review=L.views.paymentReview;
L.views.paymentReview=function(...args){
 let html=review.apply(this,args),d=L.state.paymentDraft;
 if(!d||d.submittedTxId||d.method==='box'||!html.includes('class="focus-review"'))return html;
 const essential=(L.state.essentials||[]).find(item=>item.id===d.essentialId&&!item.deleted&&!item.archived);
 const source=essential?`Budget item · ${essential.name}`:L.hasMeaningfulPlan(L.state)?'Left after Budget':'Everyday money';
 html=html.replace('<div class="focus-receipt">',`<div class="focus-receipt"><div class="hibiscus-review-source"><span>Pay from</span><strong>${L.e(source)}</strong></div>`);
 // The chosen source is a review fact, not another amount to deduct.
 if(essential){
  html=html.replace(`<p>Budget item: ${L.e(essential.name)}</p>`,'');
  if(!d.product&&!d.note)html=html.replace('<details class="focus-details"><summary>Payment details</summary></details>','');
 }
 return html;
};
// This receipt action opens Activity; the sheet arrow returns to its caller.
const receipt=L.views.txDetail;
if(receipt)L.views.txDetail=function(...args){return receipt.apply(this,args).replace('>Back to activity<','>View activity<');};
L.hibiscusPaymentRefinement={version:2};
})();
