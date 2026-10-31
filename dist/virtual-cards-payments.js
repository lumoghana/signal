/* Card funding reuses Lumo's existing payment quote, Pause, PIN/biometric and
   confirmation sequence. The virtual card engine alone moves card money. */
(()=>{
'use strict';
if(!window.L||!L.virtualCards||L.virtualCardPayments)return;
const E=L.e,M=L.money,B=L.btn,J=JSON.stringify;
const isCreating=d=>d?.method==='virtualCardCreate';
const isFunding=d=>d?.method==='virtualCard'||isCreating(d);
const current=()=>L.state.paymentDraft;
const permitted=()=>L.state.onboarded&&!L.state.locked&&!L.state.closed;
const line=(name,value)=>`<div class="summary-line"><span>${E(name)}</span><strong>${value}</strong></div>`;
const error='<div id="error" role="alert"></div>';
const cardQuote=card=>JSON.stringify([card?.id,card?.name,card?.last4,card?.currency,card?.status,card?.revision]);
const cardFor=d=>L.virtualCards.get(d?.cardId);
const creationQuote=()=>JSON.stringify(L.virtualCards.list().map(card=>[card.id,card.status,card.revision,card.name]));
const cardGuard=(d=current())=>{
 if(!isFunding(d))return true;
 if(!permitted()){L.go(L.state.onboarded?'signin':'welcome');return false;}
 if(isCreating(d)){if(L.virtualCards.totals().count>=2){L.go('virtualCards');L.toast('You already have two cards, including any being created or frozen.');return false;}return true;}
 const card=cardFor(d);
 if(!card||card.status!=='active'){
  L.go('virtualCard',{id:d.cardId});L.toast(card?.status==='frozen'?'Unfreeze this card before adding money.':'This card is not ready for funding.');return false;
 }
 return true;
};
const setQuote=d=>{
 if(isCreating(d)){d.cardName=String(d.cardName||'').trim().slice(0,32);d.name=d.cardName||'Online card '+(L.virtualCards.totals().count+1);d.destination='New virtual card';d.provider='Virtual card';d.essentialId='';d.virtualCardQuote=creationQuote();return;}
 const card=cardFor(d);d.name=card.name;d.destination='Demo card · '+card.last4;
 d.provider='Virtual card';d.essentialId='';d.virtualCardQuote=cardQuote(card);
};
L.openVirtualCardFunding=(id,amount='')=>{
 if(!permitted()){L.go(L.state.onboarded?'signin':'welcome');return;}
 const card=L.virtualCards.get(id);
 if(!card||card.status!=='active'){L.go('virtualCard',{id});L.toast('Choose an active card before adding money.');return;}
 if(L.requestPaymentReplacement?.(()=>L.openVirtualCardFunding(id,amount),'card:'+id))return;
 const previous=current();
 if(!isFunding(previous)||previous.cardId!==id||previous.submittedTxId){
  L.state.paymentDraft={id:L.id('card-topup'),method:'virtualCard',cardId:id,name:card.name,destination:'Demo card · '+card.last4,provider:'Virtual card',checked:true,amount:amount||'',fee:0,essentialId:'',note:'',pinAttempts:0};
 }
 setQuote(current());L.save();L.go('send',{method:'virtualCard'});
};
function creationDraft({retryTxId}={}){
 const previous=current(),failed=retryTxId?L.state.txs.find(t=>t.id===retryTxId&&t.cardCreation&&t.status==='failed'):null;
 if(isCreating(previous)&&!previous.submittedTxId&&!failed)return previous;
 const saved=L.state.virtualCardUiDraft?.create||{},card=failed?L.virtualCards.get(failed.cardId):null;
 L.state.paymentDraft={id:L.id('card-create'),method:'virtualCardCreate',cardName:failed?card?.name||failed.name:saved.name||'',name:'',destination:'New virtual card',provider:'Virtual card',checked:true,amount:failed?failed.amount:saved.amount||'',fee:0,essentialId:'',note:'',pinAttempts:0};
 setQuote(current());return current();
}
L.openVirtualCardCreation=(options={})=>{
 if(!permitted()){L.go(L.state.onboarded?'signin':'welcome');return;}
 if(L.virtualCards.totals().count>=2){L.go('virtualCards');L.toast('You can have up to two virtual cards.');return;}
 if(L.requestPaymentReplacement?.(()=>L.openVirtualCardCreation(options),'card:create',{resume:!options.retryTxId}))return;
 const d=creationDraft(options);
 L.state.virtualCardUiDraft=L.state.virtualCardUiDraft||{};L.state.virtualCardUiDraft.create={draftId:d.id,name:d.cardName,amount:String(d.amount||'')};
 L.save();L.go('virtualCardCreate');
};
L.virtualCardCreationEntry=()=>{
 if(!permitted())return `<section>${L.header('Sign in to create a card')}${B('Sign in',"L.go('signin')")}</section>`;
 if(L.virtualCards.totals().count>=2)return L.views.virtualCards();
 const d=creationDraft();
 return `<section class="virtual-card-flow virtual-card-funding vc-funded-create" data-payment-entry>${L.header('Create your virtual card')}<form class="form" onsubmit="event.preventDefault();L.virtualCardUI.requestCreate()"><label class="field" for="vc-name"><span>Card name <small>Optional</small></span><input id="vc-name" class="input" maxlength="32" autocomplete="off" placeholder="Online card ${L.virtualCards.totals().count+1}" value="${E(d.cardName||'')}" oninput="L.virtualCardUI.capture()"></label><label class="field" for="payment-amount"><span>Initial top-up</span><div class="inline payment-amount-row"><span class="payment-currency" aria-hidden="true">GH₵</span><input id="payment-amount" class="input amount-input" type="number" min="0.01" max="5000" step="0.01" inputmode="decimal" autocomplete="off" required aria-label="Initial card top-up in Ghana cedis" aria-describedby="error" placeholder="0.00" value="${E(d.amount)}" oninput="L.virtualCardUI.capture()"></div></label><p class="vc-funding-source">From Everyday Money. Ready after funding confirms.</p>${error}<button type="submit" class="primary">Review & create</button>${B('Leave for now','L.leavePayment()','text-btn')}</form><p class="preview-boundary">Demo card · No live card or transfer</p></section>`;
};
L.reviewVirtualCardCreation=()=>{
 const d=current();if(!isCreating(d)||!cardGuard(d))return;
 L.virtualCardUI.capture();const name=String(L.value('vc-name')||'').trim(),amount=L.moneyInput(L.value('payment-amount'),.01,5000);
 if(name.length>32)return L.error('Use 32 characters or fewer.','vc-name');
 if(amount===null)return L.error('Add an initial top-up from GH₵0.01 to GH₵5,000.00.','payment-amount');
 if(amount>L.balances().available)return L.error('Choose an initial top-up within your available Everyday Money.','payment-amount');
 d.cardName=name;d.amount=amount;setQuote(d);L.preparePayment();
};
const edit=L.editPayment;
L.editPayment=function(...args){if(!isCreating(current()))return edit.apply(this,args);if(current().submittedTxId)return L.go('paymentResult',{id:current().submittedTxId});L.go('virtualCardCreate');};
const source=L.paymentSourceInfo;
L.paymentSourceInfo=d=>isFunding(d)?{type:'account-transfer',name:'Everyday Money'}:source(d);
const planFields=L.paymentPlanLinkFields;
L.paymentPlanLinkFields=d=>isFunding(d)?'':planFields(d);
const link=L.openPaymentPlanLink;
L.openPaymentPlanLink=function(){if(isFunding(current()))return L.toast('Loading a card moves money. Link a Budget item when a purchase is made.');return link.apply(this,arguments);};
const send=L.views.send;
L.views.send=function(...args){
 const d=current();if(!isFunding(d)||d.submittedTxId)return send.apply(this,args);
 if(isCreating(d))return L.virtualCardCreationEntry();
 const card=cardFor(d);
 if(!card||card.status!=='active')return `<section class="virtual-card-flow"><h1>Card unavailable.</h1><p>Open your card to check its status.</p>${B('View card',`L.go('virtualCard',{id:${J(d.cardId)}})`)}</section>`;
 return `<section class="virtual-card-flow virtual-card-funding" data-payment-entry>${L.header('Add money to card')}<div class="vc-funding-recipient"><span>${L.icon('card',23)}</span><div><strong>${E(card.name)}</strong><small>Demo card · ${E(card.last4)}</small></div></div><form class="form" onsubmit="event.preventDefault();L.preparePayment()"><label class="field" for="payment-amount"><span>Amount to add</span><div class="inline payment-amount-row"><span class="payment-currency" aria-hidden="true">GH₵</span><input id="payment-amount" class="input amount-input" type="number" min="0.01" max="5000" step="0.01" inputmode="decimal" autocomplete="off" required aria-label="Amount to add in Ghana cedis" aria-describedby="error" placeholder="0.00" value="${E(d.amount)}"></div></label><p class="vc-funding-source">From Everyday Money. Your Budget is checked before money moves.</p>${error}<button type="submit" class="primary">Review top-up</button>${B('Leave for now','L.leavePayment()','text-btn')}</form><p class="preview-boundary">Sample money · No live card or transfer</p></section>`;
};
const entryConsequence=L.entryConsequence;
L.entryConsequence=impact=>{
 const html=entryConsequence(impact);return isFunding(current())?html.replace(/(<span class="entry-consequence-label">)[^<]*(<\/span>)/,'$1If you add this to your card$2'):html;
};
const prepare=L.preparePayment;
L.preparePayment=function(...args){
 if(isFunding(current())){if(!cardGuard())return;setQuote(current());}
 return prepare.apply(this,args);
};
const review=L.views.paymentReview;
L.views.paymentReview=function(...args){
 const d=current();if(!isFunding(d)||d.submittedTxId)return review.apply(this,args);
 const creating=isCreating(d),card=creating?{name:d.name,last4:'New card'}:cardFor(d),short=Number(d.amount)>L.balances().available;
 if(!card||!creating&&card.status!=='active')return L.views.send();
 return `<section class="virtual-card-flow virtual-card-review">${L.header(creating?'Review your new card':'Review card top-up')}<div class="focus-payment-title"><span class="eyebrow">${creating?'First top-up':'Add to card'}</span><h1>${L.balanceNumber(d.amount)}</h1><p>${E(card.name)} · ${E(card.last4)}</p></div><div class="receipt">${line('From','Everyday Money')}${line('Amount',M(d.amount))}${line('Demo fee',M(0))}${line('Total to move',M(d.amount))}</div>${short?'<p class="warning">Your available money changed. Edit the amount before continuing.</p>':''}${error}<div class="actions">${!short?B('Continue','L.continuePayment()'):''}${B('Edit amount','L.editPayment()','secondary')}${B('Cancel top-up','L.leavePayment()','text-btn')}</div><p class="preview-boundary">Moving money to a card is not spending. No live transfer.</p></section>`;
};
const continuePayment=L.continuePayment;
L.continuePayment=function(...args){
 const d=current();if(isFunding(d)){if(!cardGuard())return;setQuote(d);}
 return continuePayment.apply(this,args);
};
const pause=L.views.pause;
L.views.pause=function(...args){
 let html=pause.apply(this,args);if(!isFunding(current()))return html;
 html=html.replace(/<button\b[^>]*class="[^"]*pause-link-cost[^\"]*"[^>]*>[\s\S]*?<\/button>/g,'');
 return html.replace('Payment to</span>',(isCreating(current())?'Create card':'Add to card')+'</span>').replace('Total</span>','To move</span>')
  .replaceAll('Cancel payment','Cancel top-up').replaceAll('Nothing sent yet. Authorise on the next step.','Projection only. Your card is funded after authorisation.');
};
const authorizationCurrent=L.paymentAuthorizationCurrent;
L.paymentAuthorizationCurrent=d=>!isFunding(d)?authorizationCurrent(d):isCreating(d)?L.virtualCards.totals().count<2&&d.virtualCardQuote===creationQuote()&&authorizationCurrent(d):!!cardFor(d)&&cardFor(d).status==='active'&&d.virtualCardQuote===cardQuote(cardFor(d))&&authorizationCurrent(d);
const authorize=L.authorizePayment;
L.authorizePayment=function(...args){
 const d=current();if(isFunding(d)&&!d.submittedTxId){
  if(!cardGuard(d))return;
  if(d.virtualCardQuote!==(isCreating(d)?creationQuote():cardQuote(cardFor(d)))){setQuote(d);delete d.reviewFingerprint;delete d.pauseAcceptedSignature;L.go('paymentReview');L.toast('Your card changed. Review it before authorising.');return;}
 }
 try{const out=authorize.apply(this,args);if(isCreating(d)&&!d.submittedTxId&&L.route==='authorize'){const field=document.getElementById('payment-pin');if(field)field.value='';}if(isCreating(d)&&d.submittedTxId){const record=L.state.txs.find(t=>t.id===d.submittedTxId);d.cardId=record?.cardId;if(record?.status!=='failed'&&L.state.virtualCardUiDraft)delete L.state.virtualCardUiDraft.create;L.save();}return out;}catch(e){if(!isFunding(d))throw e;L.go('paymentReview');L.error(e.message||'The card top-up could not be submitted. Review and try again.');}
};
const authorizeView=L.views.authorize;
L.views.authorize=function(...args){
 let html=authorizeView.apply(this,args);if(!isFunding(current()))return html;
 return html.replaceAll('Confirm payment','Confirm card top-up').replaceAll('Authorise payment','Authorise top-up').replaceAll('Approve sample payment','Approve sample top-up').replace(/>Pay (GH₵[^<]+)</,isCreating(current())?'>Create & add $1<':'>Add $1<');
};
const result=L.views.paymentResult;
const tx=id=>(L.state.txs||[]).find(item=>item.id===id);
const status=t=>({success:'Completed',pending:'Pending',failed:'Not completed',reversed:'Reversed'}[t.status]||t.status);
const statusCopy=t=>t.cardDirection==='out'?(t.status==='pending'?'Reserved on the card while the return is checked. Not available in Everyday Money yet. Do not repeat it.':t.status==='success'?'Returned from your card to Everyday Money. This is not income.':'No return completed. Any card reservation has been released.'):t.status==='pending'?'Reserved in Everyday Money while this top-up is checked. It is not on your card yet. Do not repeat it.':t.status==='failed'?'No money moved to the card. Any reservation has been released.':t.status==='reversed'?'The top-up did not complete. Any reservation has been released.':'Moved from Everyday Money to your card. This is not spending.';
L.views.paymentResult=function(...args){
 const t=tx(L.params.id||current()?.submittedTxId);if(!t?.virtualCardTransfer)return result.apply(this,args);
 const card=L.virtualCards.get(t.cardId),title=t.cardDirection==='out'?(t.status==='success'?'Money returned to Everyday Money.':t.status==='pending'?'Return is pending.':'Return not completed.'):t.cardCreation?(t.status==='success'?'Your card is ready and funded.':t.status==='pending'?'Creating and funding your card.':'Your card was not created.'):(t.status==='success'?'Your card is funded.':t.status==='pending'?'Top-up is pending.':t.status==='failed'?'Top-up not completed.':'Top-up reversed.');
 return `<section class="payment-result-compact virtual-card-flow" data-payment-state="${t.status==='success'?'confirmed':E(t.status)}"><div class="result-mark success-mark" aria-hidden="true">${L.icon(t.status==='success'?'check':t.status==='pending'?'clock':'close',32)}</div><h1>${title}</h1><p class="result-context"><strong>${M(t.amount)}</strong> · ${E(card?.name||t.name)}</p><p class="result-explanation">${statusCopy(t)}</p><div class="receipt">${line('Available on this card',M(L.virtualCards.balance(t.cardId).available))}${line('Everyday Money available',M(L.balances().available))}</div><p class="result-reference"><span>Reference</span><strong>${E(t.id)}</strong></p>${L.paymentBudgetResult?.savingMarkup?.(t,{receipt:false})||''}<div class="actions">${t.status==='failed'?B('Review a new attempt',`L.retryPayment(${J(t.id)})`):''}${B('Done','L.finishPayment()',t.status==='failed'?'secondary':'primary')}${B(t.status==='pending'?'Check top-up':'View receipt',`L.go('txDetail',{id:${J(t.id)}})`,'text-btn')}</div><p class="preview-boundary">Simulated result · No live transfer</p></section>`;
};
const finish=L.finishPayment;
L.finishPayment=function(...args){
 const d=current();if(!isFunding(d))return finish.apply(this,args);
 const id=d.cardId||tx(d.submittedTxId)?.cardId;L.state.paymentDraft=null;L.save();L.go(id?'virtualCard':'virtualCards',id?{id}:{});
};
const receipt=L.views.txDetail;
L.views.txDetail=function(...args){
 const t=tx(L.params.id);if(!L.virtualCards.isCardTx(t))return receipt.apply(this,args);
 const card=L.virtualCards.get(t.cardId),funding=!!t.virtualCardTransfer;
 const copy=funding?statusCopy(t):t.status==='pending'?(t.type==='in'?(['closed','replaced'].includes(card?.status)?'The refund is being checked. It will return to Everyday Money after confirmation.':'The refund is being checked. It is not available on your card yet.'):'Reserved on your card while the merchant payment is checked. Everyday Money is not charged again.'):t.status==='failed'?'This attempt did not complete. Any reservation has been released.':t.status==='reversed'?(['closed','replaced'].includes(card?.status)?'The purchase was reversed. The confirmed refund returns to Everyday Money because the original card is closed.':'The purchase was reversed. Any confirmed refund returns to this card.'):t.type==='in'?(t.refundAccount==='operational'?'Refund confirmed to Everyday Money because the original card is closed.':'Refund confirmed to this card. Everyday Money is unchanged.'):'Paid from your virtual card. Everyday Money was not charged again.';
 return `<section class="virtual-card-flow vc-receipt">${L.header(funding?(t.cardDirection==='out'?'Card return receipt':'Card top-up receipt'):t.type==='in'?'Card refund receipt':'Card payment receipt')}<span class="pill">${E(status(t))}</span><h1>${M(t.amount)}</h1><p>${E(t.name)}</p><p class="small muted">${copy}</p><div class="receipt">${line('Card',E(card?.name||'Virtual card')+' · '+E(card?.last4||''))}${line('Available on this card now',M(L.virtualCards.balance(t.cardId).available))}${line('Reference',E(t.id))}${line('Date',E(new Date(t.date).toLocaleString('en-GH')))}${line('Method',funding?(t.cardDirection==='out'?'Virtual card → Everyday Money':'Everyday Money → Virtual card'):E(t.method))}${line('Amount',M(t.amount))}${line('Fee',M(t.fee||0))}${!funding?line('Category',E(t.category||'Other')):''}${t.originalId?line('Original reference',E(t.originalId)):''}</div>${L.paymentBudgetResult?.savingMarkup?.(t,{receipt:true})||''}${error}<div class="actions">${t.status==='pending'?B('Check status',`L.refreshPayment(${J(t.id)})`):B('Save receipt',`L.downloadReceipt(${J(t.id)})`)}${t.virtualCardTransfer&&t.status==='failed'?B('Review a new attempt',`L.retryPayment(${J(t.id)})`,'secondary'):''}${B('View card',`L.go('virtualCard',{id:${J(t.cardId)}})`,'secondary')}${B('Get help',`L.go('supportCase',{txId:${J(t.id)},reference:${J(t.id)}})`,'text-btn')}${B('View activity',"L.go('activity')",'text-btn')}</div>${L.testMode&&t.status==='pending'?`<details class="optional-fields"><summary>Demo result controls</summary><p>Only a confirmed result changes balances.</p>${B('Confirm completed',`L.settlePayment(${J(t.id)},'success')`,'secondary')}${B('Confirm not completed',`L.settlePayment(${J(t.id)},'failed')`,'secondary')}</details>`:''}<p class="preview-boundary">Sample card activity · No live payment</p></section>`;
};
const download=L.downloadReceipt;
L.downloadReceipt=function(id){const t=tx(id);return L.virtualCards.isCardTx(t)?L.receiptDownload(id):download.apply(this,arguments);};
const refund=L.refundPayment;
L.refundPayment=function(id){const t=tx(id);if(!L.virtualCards.isCardTx(t))return refund.apply(this,arguments);if(t.fundingAccount!=='virtual-card'||t.type!=='out')return L.toast('This is a transfer, not a merchant purchase.');try{L.virtualCards.refund({originalId:id,draftId:'refund:'+id});L.go('txDetail',{id});}catch(e){L.error(e.message);}};
const retry=L.retryPayment;
L.retryPayment=function(id){const t=tx(id);if(!L.virtualCards.isCardTx(t))return retry.apply(this,arguments);if(t.cardCreation&&t.status==='failed')return L.openVirtualCardCreation({retryTxId:t.id});if(t.virtualCardTransfer&&t.cardDirection==='out'&&t.status==='failed'){L.virtualCardUI.manage(t.cardId);L.toast('Review a new return from Manage card.');return;}if(t.virtualCardTransfer&&t.status==='failed')return L.openVirtualCardFunding(t.cardId,t.amount);L.go('virtualCard',{id:t.cardId});L.toast('Open the card to review its sample activity.');};
// Totals include card money once. Everyday/Budget and Savings retain their
// existing meanings, and card holds never reserve Everyday Money a second time.
const accountBalances=L.accountBalances;
L.accountBalances=function(state=L.state){const a=accountBalances(state),c=L.virtualCards.totals(state);return {...a,cards:c.balance,cardsHeld:c.held,cardsAvailable:c.available,total:Math.round((a.total+c.balance)*100)/100};};
const balances=L.balances;
L.balances=function(...args){const b=balances.apply(this,args),c=L.virtualCards.totals();return {...b,cards:c.balance,cardsHeld:c.held,cardsAvailable:c.available};};
const balanceView=L.views.balances;
L.views.balances=function(...args){let html=balanceView.apply(this,args);const c=L.virtualCards.totals();if(!c.count)return html;const section=`<h2>Virtual cards</h2><dl class="balance-calculation"><div><dt>Money on cards</dt><dd>${M(c.balance)}</dd></div>${c.held?`<div><dt>Reserved for card purchases</dt><dd>${M(c.held)}</dd></div>`:''}<div><dt>Available on cards</dt><dd>${M(c.available)}</dd></div></dl><p class="small muted">Card money is separate from Everyday Money and Money Boxes. Loading a card is not expenditure.</p>${B('View virtual cards',"L.go('virtualCards')",'text-btn')}`;return html.replace('Two accounts. Clear roles.','Your money, in one view.').replace('<div class="actions">',section+'<div class="actions">');};
const blockers=L.acct?.blockers;
if(blockers)L.acct.blockers=()=>{const items=blockers(),c=L.virtualCards.totals();if(c.balance||c.pendingFunding||L.virtualCards.list().some(card=>card.status==='issuing'))items.push({label:'Virtual card activity to settle',sub:'Return card money and finish pending activity before closing.',route:'virtualCards'});return items;};
const story=L.views.homeMoneyStory;
L.views.homeMoneyStory=function(...args){return story.apply(this,args).replace('pending payments and Money Box transfers aren’t included.','pending payments, Money Box transfers and virtual card top-ups aren’t included.');};
const decorate=L.decorateView;
L.decorateView=function(html,route){
 const content=decorate?decorate.call(this,html,route==='virtualCardCreate'?'send':route):html;
 const cardContext=isFunding(current())&&['virtualCardCreate','send','paymentReview','pause','authorize','paymentResult'].includes(route)||route==='txDetail'&&L.virtualCards.isCardTx(tx(L.params.id));
 return cardContext?content.replace('<span>Available balance</span>','<span>Everyday Money available</span>'):content;
};
const downloadData=L.acct?.downloadData;
if(downloadData)L.acct.downloadData=function(...args){
 const originalDownload=L.download;
 L.download=function(name,content,type){if(name==='Lumo-Demo-Data.json'){const data=JSON.parse(content);data.virtualCards=L.virtualCards.list().map(card=>({...card}));content=JSON.stringify(L.acct.sanitizeExport?L.acct.sanitizeExport(data):data,null,2);}return originalDownload.call(this,name,content,type);};
 try{return downloadData.apply(this,args);}finally{L.download=originalDownload;}
};
const refreshProjection=L.refreshPaymentProjection;
L.refreshPaymentProjection=function(...args){if(L.route!=='virtualCardCreate')return refreshProjection.apply(this,args);const el=document.getElementById('payment-projection');if(el){const impact=L.paymentProjection();el.innerHTML=impact?L.entryConsequence(impact):'<p class="projection-placeholder">Enter an amount to see its effect.</p>';}};
L.virtualCardPayments={cardQuote,isFunding,isCreating,creationQuote};
})();
