/* Collection contributions use the existing payment review, Pause and native
   PIN/biometric authorisation. Other-member records remain explicit samples. */
(()=>{
'use strict';
if(!window.L||!L.groupMoney||!L.collectionContributions||L.collectionContributionUI)return;
const C=L.collectionContributions,G=L.groupMoney,E=L.e,M=L.money,B=L.btn,J=JSON.stringify;
const current=()=>L.state.paymentDraft;
const permitted=()=>L.state.onboarded&&!L.state.locked&&!L.state.closed;
const isContribution=d=>C.isContribution(d);
const itemFor=d=>G.get(d?.collectionId);
const tx=id=>(L.state.txs||[]).find(row=>row.id===id);
const error='<div id="error" role="alert"></div>';
const boundary='<p class="preview-boundary cc-boundary">Sample money · No live bank payment</p>';
const line=(label,value)=>`<div class="summary-line"><span>${E(label)}</span><strong>${E(value)}</strong></div>`;
const amount=d=>Number(d?.amount)||0;
const itemTitle=(d,item)=>item?.title||d?.name||'Your collection';
const collectionButton=(id,label='Back to collection',cls='secondary')=>B(label,`L.gm.open(${E(J(id))})`,cls);
const pendingFor=id=>(L.state.txs||[]).find(row=>row.collectionContribution&&row.collectionId===id&&row.status==='pending');
const localId=item=>G.access(item).localPersonId||'self';

 function beginContribution(id,initialAmount,replaceDraft){
 const result=C.start(id,initialAmount===undefined?'':initialAmount,{replaceDraft});
 if(!result.ok){L.toast(result.error||'Open this collection and review its status.');return;}
 L.go('send',{method:'collection'});
 }
 L.openCollectionContribution=(id,initialAmount)=>{
 if(!permitted()){L.go(L.state.onboarded?'signin':'welcome');return;}
 const pending=pendingFor(id);if(pending){L.go('txDetail',{id:pending.id});return;}
 const old=current(),same=isContribution(old)&&old.collectionId===id&&!old.submittedTxId;
 if(!same&&old&&!old.submittedTxId&&L.requestPaymentReplacement?.(()=>beginContribution(id,initialAmount,old),'collection:'+id,{resume:false,keepLabel:'Continue saved payment',replaceLabel:'Start this contribution',recipientName:itemFor({collectionId:id})?.title||'Collection'}))return;
 beginContribution(id,initialAmount,same?undefined:old);
};
function leave({discard=false}={}){
 const d=current();if(!isContribution(d))return;
 L.savePaymentFields?.();const id=d.collectionId;
 if(discard){L.pauseEngine?.respond('cancel_payment');L.state.paymentDraft=null;}
 L.save();L.gm.open(id);
}
function done(id){
 const record=C.receipt(id);if(!record)return;
 if(isContribution(current())&&current().submittedTxId===record.tx.id)L.state.paymentDraft=null;
 L.save();if(record.item)L.gm.open(record.item.id);else L.go('groupMoneyList',{filter:'collection'});
}
function capture(){
 const d=current();if(!isContribution(d)||d.submittedTxId||L.route!=='send')return;
 const field=document.getElementById('payment-amount');if(field)d.amount=field.value;
 const note=document.getElementById('payment-note');if(note)d.note=note.value.slice(0,120);
 L.save();L.refreshPaymentProjection?.();
}
function sampleOther(id){
 const item=G.get(id),a=item&&G.access(item),f=item&&G.summary(item);
 if(!item||!a?.isOrganiser||!f?.canReceive)return;
 const person=item.people.find(person=>person.id!==a.localPersonId);
 if(person)L.gm.showSample(id,person.id);
}

const source=L.paymentSourceInfo;
L.paymentSourceInfo=d=>isContribution(d)?{type:'after-budget',name:'Everyday money'}:source(d);
const fields=L.paymentPlanLinkFields;
L.paymentPlanLinkFields=d=>isContribution(d)?'':fields(d);
const openPlan=L.openPaymentPlanLink;
L.openPaymentPlanLink=function(...args){
 if(isContribution(current()))return L.toast('This contribution uses Everyday money. Your planned costs remain in your budget.');
 return openPlan.apply(this,args);
};
const edit=L.editPayment;
L.editPayment=function(...args){
 const d=current();if(!isContribution(d))return edit.apply(this,args);
 if(d.submittedTxId)return L.go('paymentResult',{id:d.submittedTxId});
 L.go('send',{method:'collection'});
};
const finish=L.finishPayment;
L.finishPayment=function(...args){const d=current();if(isContribution(d)&&d.submittedTxId)return done(d.submittedTxId);return finish.apply(this,args);};
const discard=L.discardPayment;
L.discardPayment=function(...args){if(isContribution(current()))return leave({discard:true});return discard.apply(this,args);};
const pauseAction=L.pauseAction;
L.pauseAction=function(action,...args){if(action==='cancel_payment'&&isContribution(current()))return leave({discard:true});return pauseAction.call(this,action,...args);};
const retry=L.retryPayment;
L.retryPayment=function(id,...args){const r=C.receipt(id);if(!r)return retry.call(this,id,...args);if(r.tx.status!=='failed')return;if(!r.item)return L.error('This collection is no longer available. Contact support with this payment reference.');L.openCollectionContribution(r.item.id,r.tx.amount);};
const settlePayment=L.settlePayment;
L.settlePayment=function(id,status,...args){
 if(!tx(id)?.collectionContribution)return settlePayment.call(this,id,status,...args);
 try{return settlePayment.call(this,id,status,...args);}
 catch(error){
  if(permitted())L.go('txDetail',{id});else L.go(L.state.onboarded?'signin':'welcome');
  L.error(error.message||'This contribution could not be confirmed. Keep the same reference and contact support.');
 }
};

const send=L.views.send;
L.views.send=function(...args){
 const d=current();if(!isContribution(d)||d.submittedTxId)return send.apply(this,args);
 const item=itemFor(d),f=item&&G.summary(item);
 if(!item)return `<section class="collection-contribution-flow">${L.header('Collection unavailable')}<p>Return to your collections to check this pot.</p>${B('Your collections',"L.go('groupMoneyList',{filter:'collection'})")}</section>`;
 return `<section class="collection-contribution-flow" data-payment-entry>${L.header('Contribute to collection')}<div class="cc-destination"><span aria-hidden="true">${L.icon('target',23)}</span><div><strong>${E(item.title)}</strong><small>Group collection account</small></div></div><form class="form" onsubmit="event.preventDefault();L.preparePayment()"><label class="field" for="payment-amount"><span>Your contribution</span><div class="inline payment-amount-row"><span class="payment-currency" aria-hidden="true">GH₵</span><input class="input amount-input" id="payment-amount" type="number" min="0.01" max="5000" step="0.01" inputmode="decimal" autocomplete="off" aria-describedby="cc-source error" required placeholder="0.00" value="${E(d.amount??'')}" oninput="L.collectionContributionUI.capture()"></div></label><p class="cc-source" id="cc-source">From your Everyday money · ${M(L.balances().available)} available</p><p class="cc-target">${M((f?.remainingCents||0)/100)} left to reach the target</p>${error}<button type="submit" class="primary">Review contribution</button>${B('Leave for now','L.leavePayment()','text-btn')}</form>${boundary}</section>`;
};
const review=L.views.paymentReview;
L.views.paymentReview=function(...args){
 const d=current();if(!isContribution(d)||d.submittedTxId)return review.apply(this,args);
 const q=C.review(d),item=itemFor(d),value=Number.isSafeInteger(q.amountCents)?q.amountCents/100:amount(d),total=Number.isSafeInteger(q.totalCents)?q.totalCents/100:value;
 const available=Number.isSafeInteger(q.availableCents)?q.availableCents/100:L.balances().available,after=Number.isSafeInteger(q.balanceAfterCents)?q.balanceAfterCents/100:available-total;
 const impact=L.paymentImpact?.(d),short=total>available;
 return `<section class="collection-contribution-flow cc-review">${L.header('Review contribution')}<div class="focus-payment-title"><span class="eyebrow">Your contribution</span><h1>${L.balanceNumber(value)}</h1><p>${E(q.title||itemTitle(d,item))}</p></div><div class="receipt">${line('From','Your Everyday money')}${line('To',q.title||itemTitle(d,item))}${line('Collection account',q.reference||item?.collectionAccount?.reference||'Sample collection account')}${line('Amount',M(value))}${line('Fee',M((q.feeCents||0)/100))}${line('Total to pay',M(total))}${line('Everyday money after',M(after))}</div>${impact&&L.pauseReview?L.pauseReview(d,impact):''}${!q.ok?`<p class="warning">${E(q.error||'The collection or your available money changed. Review this contribution again.')}</p>`:''}${error}<div class="actions">${q.ok?B('Continue','L.continuePayment()'):short?B('Add money',"L.openFunding('paymentReview')") :''}${B('Edit amount','L.editPayment()','secondary')}${B('Cancel contribution','L.leavePayment()','text-btn')}</div><p class="cc-consent">Your Everyday money is charged only after authorisation and confirmation. The contribution then appears against your name.</p>${boundary}</section>`;
};
const pause=L.views.pause;
L.views.pause=function(...args){let html=pause.apply(this,args);if(!isContribution(current()))return html;C.review(current());return html.replace(/<button\b[^>]*class="[^"]*pause-link-cost[^\"]*"[^>]*>[\s\S]*?<\/button>/g,'').replaceAll('Cancel payment','Cancel contribution');};
const cancel=L.views.paymentCancel;
L.views.paymentCancel=function(...args){
 if(!isContribution(current()))return cancel.apply(this,args);
 return `<section class="collection-contribution-flow">${L.header('Leave this contribution?')}<p>Your draft can wait. No money has been sent.</p><div class="actions">${B('Keep draft & leave','L.collectionContributionUI.leave()')}${B('Return to contribution','L.editPayment()','secondary')}${B('Discard draft',"L.collectionContributionUI.leave({discard:true})",'text-btn')}</div>${boundary}</section>`;
};
const stateLabel=t=>({success:'Completed',pending:'Processing',failed:'Not completed',reversed:'Returned'}[t.status]||t.status);
function receiptView(record,{detail=false}={}){
 const {item,tx:t}=record,collectionName=t.collectionName||item?.title||'Collection',pending=t.status==='pending',failed=t.status==='failed',success=t.status==='success',reversed=t.status==='reversed';
 const returned=Math.max(0,Number(t.refunded)||0),partial=success&&returned>0,refunds=(L.state.txs||[]).filter(row=>row.collectionRefund&&row.originalId===t.id&&row.status==='success'),refundReferences=refunds.map(row=>row.id).join(', ');
 const title=pending?'Contribution processing':failed?'Contribution not completed':reversed?'Contribution returned':partial?'Contribution partly returned':'Contribution made';
 const explanation=pending?'This amount is reserved in your Everyday money. It is added to the collection only after confirmation. Please do not contribute again.':failed?'Nothing was added to the collection. Any reservation in your Everyday money has been released.':reversed?'The confirmed refund has returned to your Everyday money.':partial?`${M(returned)} has returned to your Everyday money under the collection’s refund rules. The original contribution stays in your history.`:`Your Everyday money was charged and your contribution was added to ${collectionName}.`;
 const refundFacts=returned>0?line('Confirmed returned',M(returned))+line('Net paid',M(Math.max(0,Number(t.amount)+Number(t.fee||0)-returned)))+(refundReferences?line(refunds.length===1?'Refund reference':'Refund references',refundReferences):''):'';
 const testControls=pending&&L.testMode?`<details class="optional-fields"><summary>Tester controls</summary><p>Simulate a confirmed provider result. No live payment is sent.</p>${B('Confirm completed',`L.settlePayment(${E(J(t.id))},'success')`,'secondary')}${B('Confirm not completed',`L.settlePayment(${E(J(t.id))},'failed')`,'secondary')}</details>`:'';
 const category=detail&&success?`<details class="screen-explainer"><summary>Spending category</summary><label class="field" for="tx-category"><span>Category</span><select class="input" id="tx-category">${[...new Set([t.category||'Transfers','Food','Transport','Study','Shopping','Phone','Data','Bills','Transfers','Other'])].map(value=>`<option${value===t.category?' selected':''}>${E(value)}</option>`).join('')}</select></label>${B('Save category',`L.correctCategory(${E(J(t.id))})`,'secondary')}</details>`:'';
 return `<section class="collection-contribution-flow cc-result" data-payment-state="${success?'confirmed':E(t.status)}">${L.header(detail?'Contribution receipt':title)}<div class="result-mark" aria-hidden="true">${L.icon(pending?'clock':failed?'close':reversed?'arrowDown':'check',32)}</div>${detail?`<h2>${E(title)}</h2>`:''}<p class="cc-result-amount">${M(t.amount)} · ${E(collectionName)}</p><p class="cc-result-copy">${E(explanation)}</p><div class="receipt">${line('Status',partial?'Part returned':stateLabel(t))}${line('From','Your Everyday money')}${line('To',collectionName)}${line('Collection account',t.collectionReference||item?.collectionAccount?.reference||'Sample collection account')}${line(returned>0?'Original contribution':'Amount',M(t.amount))}${line('Fee',M(t.fee||0))}${line('Total',M(Number(t.amount)+Number(t.fee||0)))}${refundFacts}${line('Everyday money available now',M(L.balances().available))}${item?line('Collection balance now',M(G.summary(item).balanceCents/100)):line('Collection','Unavailable · review your original receipt')}${line('Reference',t.id)}${detail?line('Date',new Date(t.date).toLocaleString('en-GH')):''}</div>${error}${category}<div class="actions">${pending?B('Check contribution status',`L.refreshPayment(${E(J(t.id))})`):failed?B('Review a new attempt',`L.retryPayment(${E(J(t.id))})`):detail?B('Save receipt',`L.downloadReceipt(${E(J(t.id))})`):B('View receipt',`L.go('txDetail',{id:${E(J(t.id))}})`)}${B('Back to collection',`L.collectionContributionUI.done(${E(J(t.id))})`,'secondary')}${detail?B('View activity',"L.go('activity')",'text-btn'):''}${pending||failed?B('Get help',`L.go('supportCase',{txId:${E(J(t.id))},reference:${E(J(t.id))}})`,'text-btn'):''}</div>${testControls}<p class="cc-refund-note">Collection refunds follow the group’s mandate. A support request does not refund this payment.</p>${boundary}</section>`;
}
const result=L.views.paymentResult;
L.views.paymentResult=function(...args){const id=L.params.id||current()?.submittedTxId,record=C.receipt(id);return record?receiptView(record):result.apply(this,args);};
const details=L.views.txDetail;
L.views.txDetail=function(...args){const record=C.receipt(L.params.id);return record?receiptView(record,{detail:true}):details.apply(this,args);};

// The ordinary action always funds the local member. Recording another
// member's example remains a separate, explicitly labelled organiser tool.
const showSample=L.gm.showSample;
L.gm.showSample=function(id,personId){const item=G.get(id);if(item?.type==='collection'&&(!personId||personId===localId(item)))return L.openCollectionContribution(id);return showSample.apply(this,arguments);};
const recordSample=L.gm.recordSample;
L.gm.recordSample=function(...args){const d=L.state.groupMoney?.sampleDraft,item=d&&G.get(d.itemId);if(item?.type==='collection'&&d.personId===localId(item)){const field=document.getElementById('gm-sample-amount');return L.openCollectionContribution(item.id,field?.value??d.amount);}return recordSample.apply(this,args);};
const sampleView=L.views.groupMoneySample;
L.views.groupMoneySample=function(...args){
 const d=L.state.groupMoney?.sampleDraft,item=d&&G.get(d.itemId);if(item?.type!=='collection')return sampleView.apply(this,args);
 const a=G.access(item);if(!a.isOrganiser||d.personId===a.localPersonId)return `<section class="collection-contribution-flow">${L.header('Your contribution')}<p>Pay from your Everyday money after reviewing and authorising the amount.</p><div class="actions">${B('Review your contribution',`L.openCollectionContribution(${E(J(item.id))},${E(J(d.amount))})`)}${collectionButton(item.id)}</div>${boundary}</section>`;
 let html=sampleView.apply(this,args),options=item.people.filter(person=>person.id!==a.localPersonId).map(person=>`<option value="${E(person.id)}"${person.id===d.personId?' selected':''}>${E(person.name)}</option>`).join('');
 html=html.replace(/(<select\b[^>]*id="gm-sample-person"[^>]*>)[\s\S]*?(<\/select>)/,`$1${options}$2`).replaceAll('Try a sample payment','Record another member’s sample');
 return html;
};
function divBlock(html,marker){const start=html.indexOf(marker);if(start<0)return '';const tags=/<\/?div\b[^>]*>/g;tags.lastIndex=start;let depth=0,match;while((match=tags.exec(html))){depth+=match[0].startsWith('</')?-1:1;if(!depth)return html.slice(start,tags.lastIndex);}return '';}
function contributionAction(item){
 const a=G.access(item),m=G.mandateSummary(item),f=G.summary(item);if(!a.canView)return '';
 const pending=pendingFor(item.id);
 let reason='';if(!m?.valid)reason=m?.legacy?'This earlier collection needs a new agreed mandate before accepting contributions.':'Review this collection’s mandate before contributing.';
 else if(['cancelled','refunded'].includes(f.status))reason='This collection is closed to contributions.';
 else if(f.expired||f.status==='expired')reason='The contribution deadline has passed.';
 else if(f.remainingCents<=0)reason='The collection target has been reached.';
 else if(!m.allAccepted)reason=`Contributions open after everyone accepts the mandate · ${m.acceptedCount} of ${m.memberCount} accepted.`;
 else if(!a.canContribute||!f.canReceive)reason='Contributions are not available for this collection.';
 const action=pending?B('View pending contribution',`L.go('txDetail',{id:${E(J(pending.id))}})`):reason?`<button type="button" class="primary" disabled aria-describedby="cc-contribution-reason">Contribute</button>`:B('Contribute',`L.openCollectionContribution(${E(J(item.id))})`);
 return `<section class="cc-contribution-action" aria-label="Your contribution">${action}<p${reason?' id="cc-contribution-reason"':''}>${E(pending?'Check the existing payment before contributing again.':reason||'Pay from your Everyday money. Review and authorise before money moves.')}</p></section>`;
}
const decorate=L.decorateView;
L.decorateView=function(html,route){
 let out=decorate?decorate.call(this,html,route):html;if(!permitted())return out;
 if(route==='groupMoneyMember'&&out.includes('class="gm-page"'))return out.replace('<div class="gm-body">','<div class="gm-body"><p class="cc-member-preview-note">This preview covers mandate decisions. Open the collection to contribute from your own Everyday money.</p>');
 if(route!=='groupMoneyDetail'||!out.includes('class="gm-page"'))return out;
 const item=G.get(L.params.id);if(item?.type!=='collection')return out;
 out=out.replace(/<button\b[^>]*onclick="L\.gm\.showSample\([^\"]*\)"[^>]*>[\s\S]*?<\/button>/g,'');
 const hero=divBlock(out,'<div class="gm-hero">'),action=contributionAction(item);if(hero)out=out.replace(hero,hero+action);else out=out.replace('<div class="gm-body">','<div class="gm-body">'+action);
 const a=G.access(item),f=G.summary(item);if(a.isOrganiser&&f.canReceive&&item.people.some(person=>person.id!==a.localPersonId))out=out.replace('<div class="gm-actions">',`<div class="gm-actions">${B('Record another member’s sample',`L.collectionContributionUI.sampleOther(${E(J(item.id))})`,'text-btn')}`);
 return out;
};
L.collectionContributionUI={capture,leave,done,sampleOther,contributionAction};
})();
