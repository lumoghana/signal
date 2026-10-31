/* Collection payouts use the existing recipient rails and biometric/PIN surface.
   The source is the group account; request authorisation never posts a personal debit. */
(()=>{
'use strict';
if(!window.L||!L.groupMoney||L.collectionPayoutRails)return;
const G=L.groupMoney,E=L.e,B=L.btn,M=L.money,J=JSON.stringify;
const isPayout=d=>!!d&&d.collectionPayout===true;
const draft=()=>L.state.paymentDraft;
const session=()=>L.state.onboarded&&!L.state.locked&&!L.state.closed;
const methods={lumo:'Lumo',momo:'Mobile Money',bank:'Bank transfer'};
const error='<div id="error" role="alert"></div>';
const boundary='<p class="gm-boundary">Same-device preview · No real money moves</p>';
const line=(label,value)=>`<div class="summary-line"><span>${E(label)}</span><strong>${E(value)}</strong></div>`;
let review=null,submitting=false;
const itemFor=d=>G.get(d?.collectionId);
const clearPIN=()=>{const pin=document.getElementById('payment-pin');if(pin)pin.value='';};
const retire=()=>{if(review?.quote?.token)G.discardRailPayoutReview?.(review.quote.token);review=null;clearPIN();};
const latest=d=>!!review&&review.state===L.state&&review.draft===d&&G.railPayoutCurrent?.(d,review.quote.token);
const from=d=>{const item=itemFor(d),s=item&&G.summary(item);return `<div class="cpr-source"><span>From collection</span><strong>${E(item?.title||'Collection unavailable')}</strong>${s?`<small>${M(s.availableCents/100)} available for payouts</small>`:''}</div>`;};
const rule=d=>{const m=G.mandateSummary(itemFor(d));return m?`${m.requiredApprovals} of ${m.approverCount} ${m.approval==='named'?'named approvers':'members'}`:'Agreed mandate approvals';};
const consent=d=>`<p class="cpr-consent">${E(rule(d))} must approve these exact details. Authorising reserves the full cost in the collection. Payment is submitted automatically when the required approvals are complete.</p>`;
function capture(){
 const d=draft();if(!isPayout(d)||d.submittedTxId||L.route!=='send')return;
 const amount=document.getElementById('payment-amount'),purpose=document.getElementById('payment-note'),reference=document.getElementById('gm-proposal-supportingReference');
 if(amount)d.amount=amount.value;if(purpose)d.note=purpose.value.slice(0,120);if(reference)d.supportingReference=reference.value.slice(0,240);
 d.purpose=d.note||'';d.itemId=d.collectionId;d.key=d.id;L.save();
}
function start(id,{replaceDraft}={}){
 const item=G.get(id),m=G.mandateSummary(item),s=item&&G.summary(item),a=item&&G.access(item);
 if(!session()||!a?.canPropose||!m?.allAccepted||!s||s.availableCents<=0||['cancelled','refunded'].includes(s.status))return L.toast('The organiser requests payouts after everyone accepts the mandate and the collection has funds.');
 const old=draft(),same=isPayout(old)&&!old.submittedTxId&&old.collectionId===id;
 if(old&&!old.submittedTxId&&!same&&replaceDraft!==old){if(L.requestPaymentReplacement?.(()=>start(id,{replaceDraft:old}),'collection-payout:'+id,{resume:false,keepLabel:'Continue saved payment',replaceLabel:'Start this collection payout',recipientName:item.title}))return;replaceDraft=old;}
 if(!same){const key=L.id('payout');L.state.paymentDraft={id:key,key,paymentEntryKey:'collection-payout:'+id,collectionPayout:true,collectionId:id,itemId:id,method:'',amount:'',fee:0,note:'',purpose:'',supportingReference:'',essentialId:''};}
 retire();L.save();const d=draft();L.go(d.method?'send':'collectionPayoutRail',d.method?{method:d.method}:{id});
}
function choose(method){
 const d=draft();if(!session()||!isPayout(d)||d.submittedTxId||!methods[method]||L.route!=='collectionPayoutRail')return;
 if(d.method!==method){for(const key of ['name','destination','recipient','provider','checked','inputNumber','searchQuery','collectionProposalId','reviewFingerprint'])delete d[key];d.method=method;if(method==='bank')d.provider='GCB Bank';d.inputNumber='';d.fee=L.paymentFee(method,Number(d.amount)||0);}
 retire();L.save();L.go('send',{method});
}
function rails(){const d=draft();if(!isPayout(d))return L.views.groupMoneyHome();return `<section class="cpr-flow">${L.header('How should it be paid?')}${from(d)}<div class="cpr-rails">${Object.entries(methods).map(([key,label])=>B(`<span>${E(label)}</span>${L.icon('chevron',18)}`,`L.collectionPayoutRails.choose('${key}')`,'secondary cpr-rail')).join('')}</div>${consent(d)}${B('Back to collection','L.collectionPayoutRails.leave()','text-btn')}${boundary}</section>`;}
function leave({discard=false}={}){
 const d=draft();if(!isPayout(d))return;capture();const id=d.collectionId;retire();if(discard)L.state.paymentDraft=null;L.save();L.gm.open(id);
}
function changeRail(){const d=draft();if(!isPayout(d)||d.submittedTxId)return;capture();retire();L.go('collectionPayoutRail',{id:d.collectionId});}
function recover(message){retire();if(!session())return L.go(L.state.onboarded?'signin':'welcome');L.go('paymentReview');L.error(message||'The collection or payout changed. Review it again before authorising.');}
const fields=L.paymentPlanLinkFields;
L.paymentPlanLinkFields=function(d,...args){return isPayout(d)?'':fields.call(this,d,...args);};
const source=L.paymentSourceInfo;
L.paymentSourceInfo=function(d,...args){return isPayout(d)?{type:'collection',id:d.collectionId,name:itemFor(d)?.title||'Collection account'}:source.call(this,d,...args);};
const needsPause=L.paymentNeedsPause;
L.paymentNeedsPause=function(d,...args){return isPayout(d)?false:needsPause.call(this,d,...args);};
const projection=L.refreshPaymentProjection;
L.refreshPaymentProjection=function(...args){if(isPayout(draft()))return;return projection?.apply(this,args);};
const saveFields=L.savePaymentFields;
L.savePaymentFields=function(...args){const result=saveFields.apply(this,args);if(isPayout(draft()))capture();return result;};
const prepare=L.preparePayment;
L.preparePayment=function(...args){
 const d=draft();if(!isPayout(d))return prepare.apply(this,args);if(!session()||d.submittedTxId)return;
 capture();const amount=G.cents(d.amount);if(amount===null||amount<1||amount>500000)return L.error('Enter GH₵0.01 to GH₵5,000.00, with no more than two decimals.','payment-amount');
 if(!String(d.note||'').trim())return L.error('Tell the group what this payout is for.','payment-note');
 d.fee=L.paymentFee(d.method,Number(d.amount));retire();L.save();L.go('paymentReview');
};
const next=L.continuePayment;
L.continuePayment=function(...args){const d=draft();if(!isPayout(d))return next.apply(this,args);if(L.route!=='paymentReview'||!latest(d))return recover('The collection or payout changed. Read the latest review before authorising.');d.reviewFingerprint=J([d.id,d.collectionId,d.method,d.name,d.destination,d.provider,d.amount,d.fee,d.note,d.supportingReference||'',d.attachment||null,review.quote.requiredApprovals]);L.save();L.go('authorize');};
const current=L.paymentAuthorizationCurrent;
L.paymentAuthorizationCurrent=function(d,...args){return isPayout(d)?session()&&L.route==='authorize'&&!d.submittedTxId&&latest(d):current.call(this,d,...args);};
const authorise=L.authorizePayment;
L.authorizePayment=function(biometricProof,...args){
 const d=draft();if(!isPayout(d))return authorise.call(this,biometricProof,...args);if(submitting)return false;
 if(L.route!=='authorize'||!latest(d))return recover();
 const pin=document.getElementById('payment-pin')?.value||'';clearPIN();submitting=true;
 let result;try{result=G.authorizeRailPayout({draft:d,reviewToken:review.quote.token,pin,biometricProof});}finally{submitting=false;clearPIN();}
 if(!result.ok){if(result.needsReview)return recover(result.error);if(!session()){retire();L.go(L.state.onboarded?'signin':'welcome');return;}L.error(result.error,'payment-pin');return false;}
 const id=result.item.id,proposalId=result.proposal.id;retire();L.go('groupMoneyProposalDetail',{id,proposalId});return true;
};
const edit=L.editPayment;
L.editPayment=function(...args){const d=draft();if(!isPayout(d))return edit.apply(this,args);if(d.submittedTxId)return L.go('groupMoneyProposalDetail',{id:d.collectionId,proposalId:d.collectionSubmittedProposalId||d.submittedTxId});retire();L.go(d.method?'send':'collectionPayoutRail',d.method?{method:d.method}:{id:d.collectionId});};
const openPlan=L.openPaymentPlanLink;
L.openPaymentPlanLink=function(...args){if(isPayout(draft()))return L.toast('This payout uses the collection account.');return openPlan.apply(this,args);};
const send=L.views.send;
L.views.send=function(...args){let html=send.apply(this,args);const d=draft();if(!isPayout(d)||d.submittedTxId)return html;
 const attachment=`<details class="gm-supporting-proof"><summary>Supporting proof · ${d.attachment?'File added':d.supportingReference?'Reference added':'optional'}</summary><label class="field" for="gm-proposal-supportingReference"><span>Invoice or supporting reference (optional)</span><input class="input" id="gm-proposal-supportingReference" maxlength="240" value="${E(d.supportingReference||'')}" oninput="L.collectionPayoutRails.capture()"></label><label class="field" for="gm-proposal-attachment"><span>Attach an invoice or receipt</span><input class="input" id="gm-proposal-attachment" type="file" accept="image/png,image/jpeg,application/pdf" onchange="L.collectionEvidence.add(this)"></label><p class="gm-quiet">PNG, JPG or PDF · Up to 200 KB · Saved only in this preview.</p>${d.attachment?`<p class="gm-proof-selected"><strong>${E(d.attachment.name)}</strong></p>${B('Remove supporting file','L.collectionEvidence.remove()','text-btn')}`:''}</details>`;
 html=html.replace(/(<section\b[^>]*)(>)/,'$1 class="cpr-flow"$2').replaceAll('Review payment','Review payout').replaceAll('Note (optional)','Purpose').replace('id="payment-note"','required id="payment-note"').replace('maxlength="120"','maxlength="120"');
 html=html.replace(/(<form\b[^>]*>)/,`$1${from(d)}${B('Change payment method','L.collectionPayoutRails.changeRail()','text-btn')}`);
 html=html.replace(/(<button\b[^>]*onclick="L\.leavePayment\(\)")/,attachment+'$1');
 return html;
};
const reviewView=L.views.paymentReview;
L.views.paymentReview=function(...args){const d=draft();if(!isPayout(d)||d.submittedTxId)return reviewView.apply(this,args);
 if(review?.quote?.token)G.discardRailPayoutReview?.(review.quote.token);
 const result=G.prepareRailPayout(d),q=result.quote||{},item=itemFor(d);review=result.ok?{state:L.state,draft:d,quote:q}:null;
 const value=Number.isSafeInteger(q.amountCents)?q.amountCents/100:Number(d.amount)||0,fee=Number.isSafeInteger(q.feeCents)?q.feeCents/100:Number(d.fee)||0;
 return `<section class="cpr-flow cpr-review">${L.header(d.collectionProposalId?'Review payout retry':'Review payout')}<div class="focus-payment-title"><span class="eyebrow">${E(methods[d.method]||'Collection payout')}</span><h1>${M(value)}</h1><p>to <strong>${E(d.name||'Recipient unavailable')}</strong></p><small>${E([d.provider,d.destination].filter(Boolean).join(' · '))}</small></div><div class="receipt">${line('From collection',item?.title||'Unavailable')}${line('Collection account',item?.collectionAccount?.reference||'Unavailable')}${line('Purpose',d.note||'')}${line('Amount',M(value))}${line('Fee',M(fee))}${line('Total from collection',M(value+fee))}${Number.isSafeInteger(q.balanceAfterCents)?line('Collection balance after payout',M(q.balanceAfterCents/100)):''}</div>${d.attachment||d.supportingReference?`<details class="gm-supporting-proof"><summary>Supporting proof</summary>${d.supportingReference?`<p>${E(d.supportingReference)}</p>`:''}${d.attachment?`<p>${E(d.attachment.name)}</p>`:''}</details>`:''}${d.collectionProposalId?'<p class="cpr-consent">This retries the same authorised recipient and amount using the original payment reference. The existing mandate approvals remain attached.</p>':consent(d)}${!result.ok?`<p class="warning">${E(result.error||'Review the latest collection details.')}</p>`:''}${error}<div class="actions">${result.ok?B('Continue to authorise','L.continuePayment()'):''}${B('Edit payout','L.editPayment()','secondary')}${B('Leave for now','L.leavePayment()','text-btn')}</div>${boundary}</section>`;
};
const authView=L.views.authorize;
L.views.authorize=function(...args){const d=draft();if(!isPayout(d)||d.submittedTxId)return authView.apply(this,args);
 let html=authView.apply(this,args);html=html.replaceAll('Confirm payment','Authorise payout request').replaceAll('Enter your PIN to authorise.','Confirm the exact payout before requesting approvals.').replace(/(<button\b[^>]*type="submit"[^>]*>)[\s\S]*?(<\/button>)/,'$1'+(d.collectionProposalId?'Authorise payout retry':'Authorise payout request')+'$2').replaceAll('Approve sample payment','Authorise sample payout request');
 html=html.replace(/<p\b[^>]*data-payment-consequence[\s\S]*?<\/p>/g,'');
 html=html.replace(/<details\b[^>]*>[\s\S]*?id="payment-outcome"[\s\S]*?<\/details>/g,'');
 html=html.replace(/<div class="biometric-choice">|<section class="biometric-prompt"|<form\b/,match=>`${from(d)}<p class="cpr-consent">${E(d.collectionProposalId?'A new payment attempt will use this collection account.':'This authorises the request. Money stays in the collection until its required approvals are complete.')}</p>`+match);
 return html;
};
const cancelView=L.views.paymentCancel;
L.views.paymentCancel=function(...args){if(!isPayout(draft()))return cancelView.apply(this,args);return `<section class="cpr-flow">${L.header('Leave this payout?')}<p>Your draft can wait. No payout request has been submitted.</p><div class="actions">${B('Keep draft & leave','L.collectionPayoutRails.leave()')}${B('Return to payout','L.editPayment()','secondary')}${B('Discard draft','L.collectionPayoutRails.leave({discard:true})','text-btn')}</div>${boundary}</section>`;};
const discard=L.discardPayment;
L.discardPayment=function(...args){if(isPayout(draft()))return leave({discard:true});return discard.apply(this,args);};
const keep=L.keepPaymentLater;
L.keepPaymentLater=function(...args){if(isPayout(draft()))return leave();return keep?.apply(this,args);};
function retry(id,proposalId,{replaceDraft}={}){
 const item=G.get(id),p=G.proposal(id,proposalId),s=G.proposalSummary(id,proposalId);if(!p||!s?.canRetry||!G.access(item)?.canExecute)return;
 const old=draft();if(old&&!old.submittedTxId&&(!isPayout(old)||old.collectionProposalId!==proposalId)&&replaceDraft!==old){if(L.requestPaymentReplacement?.(()=>retry(id,proposalId,{replaceDraft:old}),'collection-payout-retry:'+proposalId,{resume:false,keepLabel:'Continue saved payment',replaceLabel:'Review this payout retry',recipientName:p.recipient}))return;}
 const key=L.id('payout-retry');L.state.paymentDraft={id:key,key,paymentEntryKey:'collection-payout-retry:'+proposalId,collectionPayout:true,collectionId:id,itemId:id,collectionProposalId:proposalId,method:p.method||p.rail?.method,name:p.recipient,destination:p.destination||p.rail?.destination,provider:p.provider||p.rail?.provider,recipient:p.recipientId||p.rail?.recipientKey,checked:true,amount:p.amountCents/100,fee:p.feeCents/100,note:p.purpose,purpose:p.purpose,supportingReference:p.supportingReference||'',...(p.attachment?{attachment:p.attachment}:{}),essentialId:''};retire();L.save();L.go('paymentReview');
}
const startProposal=L.gm.startProposal;
L.gm.startProposal=id=>start(id);
const execute=L.gm.executeProposal;
L.gm.executeProposal=function(id,proposalId,...args){const p=G.proposal(id,proposalId);if(isRailProposal(p))return retry(id,proposalId);return execute.call(this,id,proposalId,...args);};
const isRailProposal=p=>!!p&&p.rail?.version===1;
function routeFacts(p){const row=(label,value)=>`<div><dt>${E(label)}</dt><dd>${E(value)}</dd></div>`;return `<dl class="gm-summary cpr-route-facts">${row('Payment method',methods[p.rail.method]||'Collection payout')}${row('Destination',p.rail.destination)}${p.rail.provider?row('Provider',p.rail.provider):''}</dl>`;}
function block(html,marker,tag='div'){const start=html.indexOf(marker);if(start<0)return '';const re=new RegExp('<\\/?'+tag+'\\b[^>]*>','g');re.lastIndex=start;let depth=0,m;while((m=re.exec(html))){depth+=m[0].startsWith('</')?-1:1;if(!depth)return html.slice(start,re.lastIndex);}return '';}
const decorate=L.decorateView;
L.decorateView=function(html,route){let out=decorate?decorate.call(this,html,route):html;const d=draft();
 if(isPayout(d)&&['send','paymentReview','authorize','paymentCancel'].includes(route)&&!d.submittedTxId){
  for(const marker of ['<div class="payment-balance"','<div id="payment-projection"','<div class="entry-category"']){let part=block(out,marker);if(part)out=out.replace(part,'');}
  out=out.replace(/<p\b[^>]*data-payment-consequence[\s\S]*?<\/p>/g,'');
  if(route==='send'){const note=out.match(/<details class="optional-fields"><summary>Add a note<\/summary>(<label class="field" for="payment-note">[\s\S]*?<\/label>)<\/details>/);if(note){out=out.replace(note[0],'');out=out.replace('<div id="error"',note[1]+'<div id="error"');}}
 }
 if(!['groupMoneyProposalDetail','groupMoneyMember','groupMoneyProposalDecline','groupMoneyPayoutWithdraw'].includes(route))return out;
 const p=G.proposal(L.params.id,L.params.proposalId);if(!isRailProposal(p))return out;
 const s=G.proposalSummary(L.params.id,L.params.proposalId);out=out.replaceAll('<strong>Release</strong>','<strong>Pay</strong>').replaceAll('Waiting for the organiser to release payment.','Payment is submitted automatically when the required approvals are complete.');
 out=out.replace('<div class="gm-body">','<div class="gm-body">'+routeFacts(p));
 if(p.requesterAuthorisation?.method==='sample-organiser')out=out.replace('<div class="gm-body">','<div class="gm-body"><p class="gm-note">Sample organiser authorisation · '+E(p.requesterAuthorisation.name)+'. This example does not use your PIN or claim a real person authorised a payment.</p>');
 if(route==='groupMoneyProposalDetail'){
  out=out.replace(/<button\b[^>]*onclick="L\.gm\.executeProposal\([^\"]*\)"[^>]*>Release payment<\/button>/g,'');
  if(s?.status==='pending')out=out.replace('<div class="gm-actions">',`<p class="cpr-consent">The requester has authorised this exact payout. Its full cost is reserved. It will be submitted automatically after ${s.requiredApprovals} required approvals.</p><div class="gm-actions">`);
 }
 return out;
};
const before=L.beforeNavigate;
L.beforeNavigate=function(route,...args){if(isPayout(draft())){clearPIN();if(!['send','paymentReview','authorize','paymentCancel'].includes(route))retire();}return before?.call(this,route,...args);};
document.addEventListener('input',event=>{if(isPayout(draft())&&['payment-amount','payment-note','gm-proposal-supportingReference'].includes(event.target?.id))capture();});
document.addEventListener('visibilitychange',()=>{if(document.hidden&&isPayout(draft()))retire();});window.addEventListener('pagehide',()=>{if(isPayout(draft()))retire();});window.addEventListener('blur',()=>{if(isPayout(draft()))retire();});
L.views.collectionPayoutRail=rails;
L.taskSheet?.register?.('collectionPayoutRail',{family:'records',treatment:'selection',label:'Payout method'});
L.collectionPayoutRails=Object.freeze({isPayout,start,choose,changeRail,capture,leave,retry,isRailProposal});
})();
