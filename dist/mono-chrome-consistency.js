/* Monochrome task wording. Native sheets keep their family, treatment, focus,
   history and financial authority; only their displayed context is refined. */
(()=>{
'use strict';
if(!window.L||!L.taskSheet||L.monoChromeConsistency)return;
const normal=value=>String(value||'').normalize('NFKC').replace(/\s+/g,' ').trim().toLowerCase().replace(/[.!?]+$/u,'').trim();
const contributionResult=()=>{
 const d=L.state.paymentDraft,id=L.params?.id||d?.submittedTxId;
 return !!L.collectionContributions?.receipt?.(id);
};
function contextualTitle(){
 const d=L.state.paymentDraft,route=L.route;
 if(route==='paymentResult'&&contributionResult())return 'Contribution result';
 if(d?.collectionPayout===true&&!d.submittedTxId){
  return {send:'Payout details',paymentReview:d.collectionProposalId?'Review payout retry':'Review payout',authorize:d.collectionProposalId?'Authorise payout retry':'Authorise payout request',paymentCancel:'Leave this payout?'}[route]||'';
 }
 if(d?.method==='collection'&&!d.submittedTxId){
  return {send:'Contribution amount',paymentReview:'Review contribution',authorize:'Authorise contribution',paymentCancel:'Leave this contribution?'}[route]||'';
 }
 return '';
}
function sync(){
 if(!document.body.classList.contains('minna-edition')||!L.taskSheet.active)return;
 const title=document.getElementById('task-sheet-title'),layer=title?.closest('.task-sheet-layer');
 if(!title||!layer||layer.getAttribute('data-task-route')!==L.route)return;
 const label=contextualTitle();
 if(label){
  // Existing routes cannot be re-registered. Updating the rendered label
  // preserves every native route registration and its owned close behavior.
  title.textContent=label;
  for(const control of layer.querySelectorAll('.task-sheet-close,.task-sheet-backdrop'))control.setAttribute('aria-label','Close '+label);
 }
 const body=layer.querySelector('.task-sheet-body'),heading=body?.querySelector('.page-heading>h1');
 if(!heading||heading.hasAttribute('data-product-keep-heading'))return;
 // Only these two static aliases and exact contextual labels are title echoes.
 // Named Money Boxes, receipts and user-owned entities stay fully visible.
 const alias={goals:['your money boxes','money boxes'],profile:['your profile','profile']}[L.route];
 const duplicate=alias&&normal(title.textContent)===alias[0]&&normal(heading.textContent)===alias[1]||label&&normal(title.textContent)===normal(heading.textContent);
 if(!duplicate)return;
 heading.classList.add('product-title-echo');heading.setAttribute('data-mono-title-echo','');
 const decorative=element=>element.matches('.scene-art[aria-hidden="true"]');
 if([...heading.parentElement.children].every(element=>element===heading||decorative(element)))heading.parentElement.classList.add('product-title-only');
 if(document.activeElement===heading){title.setAttribute('tabindex','-1');title.focus?.({preventScroll:true});}
}
const render=L.render;
L.render=function(...args){const result=render.apply(this,args);sync();return result;};
L.monoChromeConsistency=Object.freeze({version:1});
sync();
})();
