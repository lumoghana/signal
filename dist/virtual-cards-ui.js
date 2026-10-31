/* Simulated virtual cards. Ordinary drafts persist; PINs, approval prompts and
   temporary detail reveal stay in memory. The card engine owns all money. */
(()=>{
'use strict';
if(!window.L||L.virtualCardUI||!L.virtualCards)return;
const E=L.e,M=L.money,B=L.btn,api=L.virtualCards,TTL=60000;
let auth=null,reveal=null,busy=false,revealTimer=null;
const allowed=()=>!!L.state.onboarded&&!L.state.locked&&!L.state.closed;
const error='<div id="error" role="alert"></div>';
const shell=(title,sub,body)=>`<section class="virtual-card-page">${L.header(title,sub).replace('<div class="page-heading"><h1></h1></div>','')}${body}</section>`;
const disclosure='<p class="vc-disclosure">Virtual card demo · No live card or payment.</p>';
const line=(label,value)=>`<div class="vc-line"><span>${E(label)}</span><strong>${E(value)}</strong></div>`;
const stateLabel=card=>({active:'Ready to use',frozen:'Frozen',issuing:'Creating card',failed:'Not created',closed:'Closed',replaced:'Replaced'}[card.status]||'Unavailable');
const cardGet=id=>api.get(id||L.params.id);
const guard=()=>{if(allowed())return true;L.toast('Sign in to use your virtual cards.');L.go(L.state.locked?'signin':'welcome');return false;};
const unavailable=()=>shell('Card unavailable','This card could not be opened.',`<div class="actions">${B('Back to cards',"L.go('virtualCards')")}</div>`);
const draftStore=()=>{
 const s=L.state;if(!s.virtualCardUiDraft)s.virtualCardUiDraft={};
 return s.virtualCardUiDraft;
};
const scope=()=>JSON.stringify([L.state.profile?.account,L.state.profile?.pin,L.state.closed,L.state.locked,L.state.virtualCards||[],(L.state.txs||[]).filter(t=>t.cardId).map(t=>[t.id,t.status,t.amount,t.cardDirection,t.refundAccount])]);
const authValid=()=>!!auth&&allowed()&&auth.account===L.state&&L.route==='virtualCardAuthorize'&&String(L.params.id||'')===String(auth.id||'')&&auth.expires>Date.now()&&auth.scope===scope();
const revealValid=id=>!!reveal&&allowed()&&reveal.account===L.state&&reveal.id===id&&reveal.expires>Date.now()&&reveal.scope===scope();
const resetSecrets=()=>{auth=null;reveal=null;clearTimeout(revealTimer);revealTimer=null;};
const statusIcon=card=>L.icon(card.status==='active'?'check':card.status==='issuing'?'clock':card.status==='frozen'?'lock':'close',22);
const face=(card,{compact=false}={})=>`<div class="vc-face${compact?' vc-face-small':''}" data-virtual-card="${E(card.id)}"><div class="vc-face-top"><img src="/brand/Lumo-Wordmark-White.svg" alt="Lumo" class="vc-wordmark"><span>Virtual · Demo</span></div><span class="vc-masked-number" aria-label="Demo card ending ${E(card.last4)}">•••• ${E(card.last4)}</span><span class="vc-face-status">${statusIcon(card)} ${E(stateLabel(card))}</span></div>`;
const balanceValue=id=>api.balance(id).available;
function saveDraft(){if(allowed())L.save();}
function capture(){
 if(!allowed()||!['virtualCardCreate','virtualCardManage','virtualCardDemo'].includes(L.route)&&!(L.route==='send'&&L.state.paymentDraft?.method==='virtualCardCreate'))return;
 const store=draftStore(),value=id=>document.getElementById(id)?.value;
 if(L.route==='virtualCardCreate'||L.route==='send'&&L.state.paymentDraft?.method==='virtualCardCreate'){
  const d=store.create||(store.create={draftId:L.id('VC-issue'),name:'',amount:''});
  if(value('vc-name')!==undefined)d.name=String(value('vc-name')).slice(0,32);
  if(value('payment-amount')!==undefined)d.amount=String(value('payment-amount'));
  const pay=L.state.paymentDraft;if(pay?.method==='virtualCardCreate'&&!pay.submittedTxId){pay.cardName=d.name;pay.name=d.name.trim()||'Online card '+(api.totals().count+1);const amount=L.moneyInput(d.amount,.01,5000);pay.amount=amount===null?d.amount:amount;}
 }else if(L.route==='virtualCardManage'){
  const card=cardGet();if(!card)return;
  const d=store.manage||(store.manage={});d[card.id]=d[card.id]||{name:card.name,limit:card.limit};
  if(value('vc-name')!==undefined)d[card.id].name=String(value('vc-name')).slice(0,32);
  if(value('vc-limit')!==undefined)d[card.id].limit=String(value('vc-limit'));
  if(value('vc-return-amount')!==undefined)d[card.id].returnAmount=String(value('vc-return-amount'));
 }else if(L.route==='virtualCardDemo'){
  const card=cardGet();if(!card)return;const d=demoDraft(card.id);
  for(const [id,key]of [['vc-demo-merchant','merchant'],['vc-demo-amount','amount'],['vc-demo-budget','essentialId'],['vc-demo-outcome','outcome']])if(value(id)!==undefined)d[key]=String(value(id));
 }
 saveDraft();
}
function startAuth(action,id='',payload={}){
 if(!guard()||busy||L.platform?.requireOnline?.('Approve a card action')===false)return false;
 auth={action,id,payload,account:L.state,scope:scope(),expires:Date.now()+TTL,attempts:0,biometric:false};
 reveal=null;L.go('virtualCardAuthorize',{id});return true;
}
function requestCreate(){if(!guard())return;capture();return L.reviewVirtualCardCreation?.();}
function requestManage(){
 if(!guard())return;capture();const c=cardGet(),d=draftStore().manage?.[c?.id];if(!c||!d||!['active','frozen'].includes(c.status))return;
 const name=String(d.name||'').trim(),limit=L.moneyInput(d.limit,.01,5000);
 if(!name||name.length>32)return L.error('Enter a card name with 1 to 32 characters.','vc-name');
 if(limit===null)return L.error('Enter a limit from GH₵0.01 to GH₵5,000.00, using up to two decimal places.','vc-limit');
 startAuth('manage',c.id,{name,limit});
}
function requestFreeze(id){const c=cardGet(id);if(!guard()||!c||!['active','frozen'].includes(c.status))return;startAuth('freeze',c.id,{frozen:c.status!=='frozen'});}
function requestReveal(id){const c=cardGet(id);if(!guard()||!c||!['active','frozen'].includes(c.status))return;startAuth('reveal',c.id);}
function requestLifecycle(action,id){
 if(!guard())return false;capture();const card=cardGet(id);if(!card||!['active','frozen'].includes(card.status))return false;
 const facts=api.lifecycle(card.id);let amount=facts.available;
 if(action==='return'){
  amount=L.moneyInput(L.value('vc-return-amount'),.01,facts.available);
  if(amount===null||amount>facts.available)return L.error('Choose an amount within the unheld money on this card.','vc-return-amount');
 }else if(!facts.canClose)return L.error('Pending card activity must finish before you close or replace this card.');
 return startAuth(action,card.id,{amount,draftId:L.id('card-'+action),reviewed:false});
}
function reviewLifecycle(){
 if(!authValid()||!['return','close','replace'].includes(auth.action))return false;
 auth.payload.reviewed=true;L.render();return true;
}
function approve(biometric=false){
 if(busy||!auth)return false;
 if(!authValid()){auth=null;L.toast('This approval expired or the card changed. Check it again.');L.go(L.params.id?'virtualCard':'virtualCards',L.params.id?{id:L.params.id}:{});return false;}
 if(biometric&&!auth.biometric)return false;
 if(['return','close','replace'].includes(auth.action)&&!auth.payload.reviewed)return false;
 if(L.platform?.requireOnline?.('Approve a card action')===false)return false;
 const pin=document.getElementById('vc-pin');
 if(!biometric&&!/^\d{6}$/.test(L.value('vc-pin')))return L.error('Enter your 6-digit Lumo PIN.','vc-pin');
 if(!biometric){
  const result=L.authPolicy?.verify(L.value('vc-pin'),{purpose:'Approve card action'});
  if(pin)pin.value='';
  if(!result)return L.error('Secure approval is unavailable. Reopen Lumo before trying again.','vc-pin');
  if(!result.ok){if(result.locked){auth=null;L.go('signin');L.toast(result.message);return false;}return L.error(result.message,'vc-pin');}
 }
 if(pin)pin.value='';busy=true;const record=auth,outcome=L.value('vc-issue-outcome')||'success';auth=null;
 try{
  if(record.action==='issue'){
   L.toast('Choose an initial top-up before creating your card.');L.openVirtualCardCreation?.();return false;
  }else if(record.action==='reveal'){
   reveal={id:record.id,account:L.state,scope:scope(),expires:Date.now()+TTL};
   L.go('virtualCardDetails',{id:record.id});
   clearTimeout(revealTimer);revealTimer=setTimeout(()=>{reveal=null;if(L.route==='virtualCardDetails')L.render();},TTL);
  }else if(record.action==='manage'){
   api.rename(record.id,record.payload.name);api.setLimit(record.id,record.payload.limit);
   if(draftStore().manage)delete draftStore().manage[record.id];saveDraft();L.go('virtualCard',{id:record.id});L.toast('Card name and online limit updated.');
  }else if(record.action==='return'){
   const t=api.returnFunds({cardId:record.id,amount:record.payload.amount,draftId:record.payload.draftId,status:L.testMode?(L.value('vc-return-outcome')||'success'):'success'});
   if(draftStore().manage?.[record.id])delete draftStore().manage[record.id].returnAmount;saveDraft();L.go('txDetail',{id:t.id});
  }else if(['close','replace'].includes(record.action)){
   const result=api[record.action]({cardId:record.id,draftId:record.payload.draftId});
   L.go('virtualCard',{id:result.replacement?.id||record.id});L.toast(record.action==='replace'?'Old demo card replaced. Its remaining money returned to Everyday Money. The new card starts empty.':'Demo card closed. Remaining money returned to Everyday Money.');
  }else if(record.action==='freeze'){
   api.freeze(record.id,record.payload.frozen);L.go('virtualCard',{id:record.id});L.toast(record.payload.frozen?'Card frozen. New online payments are blocked.':'Card unfrozen.');
  }
  return true;
 }catch(e){L.toast(e.message||'This action could not be completed.');L.go(record.action==='issue'?'virtualCardCreate':'virtualCard',record.id?{id:record.id}:{});return false;}
 finally{busy=false;}
}
const merchants=[
 {id:'study',name:'Study Library',category:'Study',budget:'study-fees',description:'Online course · demo merchant'},
 {id:'music',name:'Stream Music',category:'Shopping',budget:'personal-social',description:'Music subscription · demo merchant'},
 {id:'data',name:'Campus Data',category:'Data',budget:'data-airtime',description:'Online data bundle · demo merchant'}
];
function demoDraft(id){
 const store=draftStore();store.demo=store.demo||{};
 if(!store.demo[id]){const matches=activeBudget().filter(x=>L.budgetCategories?.resolve(x)?.id==='study-fees');store.demo[id]={draftId:L.id('VC-purchase'),merchant:'study',amount:'',essentialId:matches.length===1?matches[0].id:'',outcome:'success'};}
 return store.demo[id];
}
const activeBudget=()=>L.state.essentials.filter(x=>!x.archived&&!x.deleted&&Number(x.amount)>0);
function openDemo(id){if(!guard())return;const c=cardGet(id);if(!c||c.status!=='active'){L.toast('Use an active card for this demo.');return;}demoDraft(c.id);L.go('virtualCardDemo',{id:c.id});}
function chooseMerchant(){capture();const d=demoDraft(L.params.id),m=merchants.find(x=>x.id===d.merchant),matches=activeBudget().filter(x=>L.budgetCategories?.resolve(x)?.id===m?.budget);d.essentialId=matches.length===1?matches[0].id:'';saveDraft();L.render();}
function simulatePurchase(){
 if(!guard()||busy)return;capture();const c=cardGet(),d=demoDraft(c?.id),merchant=merchants.find(x=>x.id===d.merchant);
 const amount=L.moneyInput(d.amount,.01,5000);if(!merchant)return L.error('Choose a demo merchant.','vc-demo-merchant');
 if(amount===null)return L.error('Enter GH₵0.01 to GH₵5,000.00.','vc-demo-amount');
 if(d.essentialId&&!activeBudget().some(x=>x.id===d.essentialId))return L.error('Choose a Budget item that is still available.','vc-demo-budget');
 busy=true;
 try{
  const t=api.purchase({cardId:c.id,name:merchant.name,amount,category:merchant.category,essentialId:d.essentialId,draftId:d.draftId,status:d.outcome});
  delete draftStore().demo[c.id];saveDraft();L.go('txDetail',{id:t.id});
 }catch(e){L.error(e.message||'This sample payment could not be completed.','vc-demo-amount');}
 finally{busy=false;}
}
function simulateRefund(id){
 if(!guard()||busy)return;busy=true;
 try{const t=api.refund({originalId:id,draftId:'vc-refund:'+id,status:'success'});L.go('txDetail',{id:t.id});}
 catch(e){L.toast(e.message||'This sample refund could not be completed.');}
 finally{busy=false;}
}
function resolveTransaction(id,status){if(!guard())return;const t=L.state.txs.find(t=>t.id===id);if(!t||!t.cardId||!['success','failed'].includes(status))return;try{api.resolve(id,status);L.go('txDetail',{id});}catch(e){L.toast(e.message);}}
function resolveIssue(id,status){if(!guard()||!L.testMode)return;try{api.resolveIssue(id,status);L.go('virtualCardStatus',{id});}catch(e){L.toast(e.message);}}
L.views.virtualCards=()=>{
 if(!allowed())return shell('Virtual cards','Sign in to use your cards.',B('Sign in',"L.go('signin')"));
 const cards=api.list(),totals=api.totals();
 const archived=api.history?.()||[];
 const items=cards.map(c=>`<button class="vc-card-row" type="button" onclick="L.go('virtualCard',{id:'${E(c.id)}'})"><span class="vc-row-symbol">${L.icon(c.status==='frozen'?'lock':c.status==='issuing'?'clock':'card',23)}</span><span class="vc-row-copy"><strong>${E(c.name)}</strong><small>•••• ${E(c.last4)} · ${E(stateLabel(c))}</small></span><span class="vc-row-end"><strong>${M(api.balance(c.id).available)}</strong>${L.icon('chevron',18)}</span></button>`).join('');
 return shell('Virtual cards',cards.length?'For online payments. Up to two cards.':'Your online payments, in one place.',`${cards.length?`<div class="vc-list">${items}</div>`:`<div class="vc-empty"><span class="vc-empty-icon">${L.icon('card',34)}</span><h2>Take Lumo online.</h2><p>Create a card with money from Everyday Money, ready for online payments.</p></div>`}<div class="actions">${totals.slotsLeft?B(cards.length?'Create a second card':'Create a virtual card','L.virtualCardUI.create()'):''}${B('Done','L.closeTask()','secondary')}</div>${totals.slotsLeft?'':`<p class="vc-note">Two-card limit reached. Frozen cards count too.</p>`}${archived.length?`<details class="vc-history"><summary>Closed cards · ${archived.length}</summary>${archived.map(c=>L.row(c.name,'•••• '+c.last4+' · '+stateLabel(c),'card',`L.go('virtualCard',{id:'${E(c.id)}'})`)).join('')}</details>`:''}${disclosure}`);
};
L.views.virtualCardCreate=()=>L.virtualCardCreationEntry?.()||unavailable();
L.views.virtualCardAuthorize=()=>{
 if(!authValid())return shell('Approval expired','Review the card before trying again.',B('Back to cards',"L.go('virtualCards')"));
 const lifecycleAction=['return','close','replace'].includes(auth.action);
 if(lifecycleAction){
  const card=cardGet(auth.id),titles={return:'Return card money',close:'Close this card',replace:'Replace this card'},title=titles[auth.action];
  const summary=`<div class="receipt">${line('Card',card?.name+' · •••• '+card?.last4)}${line('To Everyday Money',M(auth.payload.amount))}${line('Fee',M(0))}</div>`;
  const consequence=auth.action==='return'?'Only unheld money moves back. This is not income.':auth.action==='replace'?'The old card stops accepting new payments. Remaining money returns to Everyday Money. Your replacement starts empty. Any later confirmed refund for the old card returns to Everyday Money.':'New payments stop. Remaining money returns to Everyday Money. Any later confirmed refund returns to Everyday Money. Your card records stay available.';
  if(!auth.payload.reviewed)return shell('Review '+title.toLowerCase(),card?.name||'',`${summary}<p class="vc-note">${consequence}</p><div class="actions">${B('Continue to PIN','L.virtualCardUI.reviewLifecycle()')}${B('Back to card',`L.go('virtualCard',{id:'${E(auth.id)}'})`,'secondary')}</div>${disclosure}`);
  const controls=L.testMode&&auth.action==='return'?`<details class="vc-demo-controls"><summary>Sample return result</summary><select id="vc-return-outcome"><option value="success">Completed</option><option value="pending">Pending</option><option value="failed">Failed</option></select></details>`:'';
  const body=auth.biometric?`<h2>Biometric demo</h2><p>No face or fingerprint is captured.</p>${B('Approve sample check','L.virtualCardUI.approve(true)')}${B('Use PIN instead','L.virtualCardUI.biometric(false)','secondary')}`:`<form onsubmit="event.preventDefault();L.virtualCardUI.approve()"><label class="field" for="vc-pin"><span>Your 6-digit Lumo PIN</span><input class="input code-input" id="vc-pin" type="password" inputmode="numeric" autocomplete="off" maxlength="6" required pattern="[0-9]{6}" aria-describedby="error"></label>${error}${controls}<button class="primary" type="submit">${E(title)}</button>${B('Use biometrics · Demo','L.virtualCardUI.biometric(true)','text-btn')}</form>`;
  return shell(title,'Authorise separately.',`${summary}${body}${B('Back without approving',`L.go('virtualCard',{id:'${E(auth.id)}'})`,'text-btn')}${disclosure}`);
 }
 const c=cardGet(auth.id),labels={issue:['Create your card',auth.payload.name||`Online card ${api.totals().count+1}`],reveal:['View card details',c?.name],manage:['Save card changes',auth.payload.name],freeze:[auth.payload.frozen?'Freeze this card?':'Unfreeze this card?',c?.name]},[title,context]=labels[auth.action]||['Approve action',''];
 const summary=auth.action==='manage'?line('Online payment limit',M(auth.payload.limit)):auth.action==='issue'?line('Starting balance',M(0)):'';
 const controls=L.testMode&&auth.action==='issue'?`<details class="vc-demo-controls"><summary>Demo issuance outcome</summary><label class="field" for="vc-issue-outcome"><span>Result</span><select id="vc-issue-outcome"><option value="success">Created</option><option value="pending">Pending</option><option value="failed">Failed</option></select></label></details>`:'';
 const submitLabel=auth.action==='issue'?'Create demo card':auth.action==='reveal'?'View card details':auth.action==='manage'?'Save changes':auth.action==='freeze'?(auth.payload.frozen?'Freeze card':'Unfreeze card'):'Approve action';
 const body=auth.biometric?`<div class="vc-auth-symbol">${L.icon('shield',30)}</div><h2>Biometric demo</h2><p class="vc-note">No face or fingerprint is captured.</p><div class="actions">${B('Approve sample check','L.virtualCardUI.approve(true)')}${B('Use PIN instead','L.virtualCardUI.biometric(false)','secondary')}</div>`:`<form onsubmit="event.preventDefault();L.virtualCardUI.approve()"><label class="field" for="vc-pin"><span>Your Lumo PIN</span><input class="input code-input" id="vc-pin" type="password" inputmode="numeric" autocomplete="off" maxlength="6" required pattern="[0-9]{6}" aria-describedby="error"></label>${error}<button class="primary" type="submit">${E(submitLabel)}</button>${B('Use biometrics · Demo','L.virtualCardUI.biometric(true)','text-btn')}</form>`;
 return shell(title,context||'',`${summary}${controls}${body}<div class="vc-auth-back">${B('Back without approving',auth.action==='issue'?"L.go('virtualCardCreate')":`L.go('virtualCard',{id:'${E(auth.id)}'})`,'text-btn')}</div>${disclosure}`);
};
L.views.virtualCardStatus=()=>{
 const c=cardGet();if(!allowed()||!c)return unavailable();
 const pending=c.status==='issuing',failed=c.status==='failed';
 return shell('', '',`<div class="vc-status"><span class="vc-status-icon">${L.icon(pending?'clock':failed?'close':'check',30)}</span><h1>${pending?'Your card is being created.':failed?'Your card wasn’t created.':'Your card is ready.'}</h1><p>${E(c.name)}${pending?' · Please don’t create it again.':failed?' · No money moved.':` · •••• ${E(c.last4)}`}</p></div><div class="actions">${pending?B('Back to cards',"L.go('virtualCards')"):failed?B('Try again','L.virtualCardUI.create()'):B('Add money',`L.openVirtualCardFunding('${E(c.id)}')`)}${!pending&&!failed?B('View card',`L.go('virtualCard',{id:'${E(c.id)}'})`,'secondary'):''}</div>${L.testMode&&pending?`<details class="vc-demo-controls"><summary>Demo status controls</summary>${B('Confirm creation',`L.virtualCardUI.resolveIssue('${E(c.id)}','success')`,'secondary')}${B('Fail creation',`L.virtualCardUI.resolveIssue('${E(c.id)}','failed')`,'text-btn')}</details>`:''}${disclosure}`);
};
L.views.virtualCard=()=>{
 const c=cardGet();if(!allowed()||!c)return unavailable();if(['issuing','failed'].includes(c.status))return L.views.virtualCardStatus();
 if(['closed','replaced'].includes(c.status))return shell(c.name,stateLabel(c),`<span class="pill">${E(stateLabel(c))}</span><p class="vc-note">This card cannot make new payments. Later confirmed refunds return to Everyday Money. Your original receipts remain available.</p><div class="actions">${c.replacementCardId?B('View replacement',`L.go('virtualCard',{id:'${E(c.replacementCardId)}'})`):''}${c.returnTxId?B('View money returned',`L.go('txDetail',{id:'${E(c.returnTxId)}'})`,'secondary'):''}${B('All card activity',`L.go('activity',{cardId:'${E(c.id)}'})`,'secondary')}${B('Back to cards',"L.go('virtualCards')",'text-btn')}</div>${disclosure}`);
 const b=api.balance(c.id),allTransactions=L.state.txs.filter(t=>t.cardId===c.id).sort((a,b)=>new Date(b.date)-new Date(a.date)),transactions=allTransactions.slice(0,5);
 const history=transactions.map(t=>{const incoming=t.virtualCardTransfer?t.cardDirection!=='out':t.type==='in',kind=t.virtualCardTransfer?(t.cardDirection==='out'?'Returned to Everyday Money':'Card top-up'):t.type==='in'?'Refund':t.category||'Online payment',status=t.status==='pending'?'Being checked':t.status==='failed'?'Not completed':t.status==='reversed'?'Money returned':'Completed';return L.row(t.name,kind+' · '+status,incoming?'arrowDown':'arrowUp',`L.go('txDetail',{id:'${E(t.id)}'})`,(t.status==='success'?(incoming?'+':'−'):'')+M(Number(t.amount)+(incoming?0:Number(t.fee||0))))+(t.status==='success'&&t.fundingAccount==='virtual-card'&&t.type==='out'?`<details class="vc-demo-controls"><summary>Demo tools · ${E(t.name)}</summary>${B('Simulate full refund',`L.virtualCardUI.simulateRefund('${E(t.id)}')`,'secondary')}</details>`:t.status==='pending'?`<details class="vc-demo-controls"><summary>Demo tools · ${E(t.name)}</summary>${B('Confirm sample '+(t.virtualCardTransfer?'top-up':'payment'),`L.virtualCardUI.resolveTransaction('${E(t.id)}','success')`,'secondary')}${B('Fail sample '+(t.virtualCardTransfer?'top-up':'payment'),`L.virtualCardUI.resolveTransaction('${E(t.id)}','failed')`,'text-btn')}</details>`:'');}).join('');
 return shell(c.name,'Funded from Everyday Money',`${face(c)}<div class="vc-money"><span>Available on this card</span><strong>${L.balanceNumber(b.available)}</strong>${b.held?`<small>${M(b.held)} held for pending payments</small>`:''}${b.pendingFunding?`<small>${M(b.pendingFunding)} top-up being checked</small>`:''}</div><div class="vc-main-actions">${c.status==='active'?B('Add money',`L.openVirtualCardFunding('${E(c.id)}')`):B('Unfreeze card',`L.virtualCardUI.requestFreeze('${E(c.id)}')`)}${B('View details',`L.virtualCardUI.requestReveal('${E(c.id)}')`,'secondary')}</div><div class="vc-detail-tools">${c.status==='active'?B('Freeze card',`L.virtualCardUI.requestFreeze('${E(c.id)}')`,'text-btn vc-freeze-direct'):''}<button class="vc-manage" type="button" onclick="L.virtualCardUI.manage('${E(c.id)}')">${L.icon('settings',18)} Manage ${L.icon('chevron',16)}</button></div><details class="vc-history"><summary>Card activity${allTransactions.length?' · '+allTransactions.length:''}</summary>${history||'<p class="vc-note">No card activity yet.</p>'}${allTransactions.length>transactions.length?B('View all card activity',`L.go('activity',{cardId:'${E(c.id)}'})`,'secondary'):''}</details>${c.status==='active'?B('Try an online payment · Demo',`L.virtualCardUI.openDemo('${E(c.id)}')`,'text-btn vc-demo-link'):''}${disclosure}`);
};
L.views.virtualCardDetails=()=>{
 const c=cardGet();if(!allowed()||!c)return unavailable();
 if(!revealValid(c.id))return shell('Card details hidden','Authenticate again to view the demo details.',`<div class="actions">${B('View details',`L.virtualCardUI.requestReveal('${E(c.id)}')`)}${B('Back to card',`L.go('virtualCard',{id:'${E(c.id)}'})`,'secondary')}</div>`);
 return shell('Card details',c.name,`<div class="vc-demo-warning">Demo only. These details cannot make a payment.</div><dl class="vc-details"><div><dt>Card number</dt><dd>DEMO 0000 0000 ${E(c.last4)}</dd></div><div><dt>Expiry</dt><dd>Not issued</dd></div><div><dt>Security code</dt><dd>Not issued</dd></div><div><dt>Currency</dt><dd>GHS · Ghana cedis</dd></div></dl><p class="vc-note">Details hide after one minute or when you leave this view.</p><div class="actions">${B('Hide details',`L.go('virtualCard',{id:'${E(c.id)}'})`)}</div>${disclosure}`);
};
L.views.virtualCardManage=()=>{
 const c=cardGet();if(!allowed()||!c||!['active','frozen'].includes(c.status))return unavailable();
 const store=draftStore();store.manage=store.manage||{};const d=store.manage[c.id]||(store.manage[c.id]={name:c.name,limit:c.limit});
 return shell('Manage card',`•••• ${c.last4} · ${stateLabel(c)}`,`<form onsubmit="event.preventDefault();L.virtualCardUI.requestManage()"><label class="field" for="vc-name"><span>Card name</span><input class="input" id="vc-name" maxlength="32" value="${E(d.name)}" autocomplete="off" required oninput="L.virtualCardUI.capture()"></label><label class="field" for="vc-limit"><span>Limit per online payment · GH₵</span><input class="input" id="vc-limit" type="number" inputmode="decimal" min="0.01" max="5000" step="0.01" value="${E(d.limit)}" required oninput="L.virtualCardUI.capture()"></label>${error}<div class="actions"><button class="primary" type="submit">Save changes</button>${B(c.status==='frozen'?'Unfreeze card':'Freeze card',`L.virtualCardUI.requestFreeze('${E(c.id)}')`,'secondary')}${B('Back to card',`L.go('virtualCard',{id:'${E(c.id)}'})`,'text-btn')}</div></form><section class="vc-lifecycle"><h2>Card money & lifecycle</h2><label class="field" for="vc-return-amount"><span>Return to Everyday Money · GH₵</span><input class="input" id="vc-return-amount" type="number" inputmode="decimal" min="0.01" max="${api.balance(c.id).available}" step="0.01" value="${E(d.returnAmount||'')}" placeholder="0.00" oninput="L.virtualCardUI.capture()" aria-describedby="vc-return-hint error"></label><p class="vc-note" id="vc-return-hint">${M(api.balance(c.id).available)} unheld. Pending payments stay reserved.</p><div class="actions">${B('Review return',`L.virtualCardUI.requestLifecycle('return','${E(c.id)}')`,'secondary')}${B('Replace card',`L.virtualCardUI.requestLifecycle('replace','${E(c.id)}')`,'secondary')}${B('Close card',`L.virtualCardUI.requestLifecycle('close','${E(c.id)}')`,'text-btn')}</div>${api.lifecycle(c.id).pending?'<p class="vc-note">Pending card activity must finish before closing or replacing.</p>':''}</section><p class="vc-note">${c.status==='frozen'?'Freezing does not cancel pending payments or free up a card slot.':'Freeze to block new online payments. Pending payments can still complete.'} The demo maximum is ${M(5000)} per payment.</p>${disclosure}`);
};
L.views.virtualCardDemo=()=>{
 const c=cardGet();if(!allowed()||!c)return unavailable();if(c.status!=='active')return shell('Card frozen','Unfreeze it before trying a sample online payment.',B('Back to card',`L.go('virtualCard',{id:'${E(c.id)}'})`));
 const d=demoDraft(c.id),budget=activeBudget();
 return shell('Online checkout demo','Simulates a merchant outside Lumo.',`<p class="vc-demo-warning">Sample purchase only. Uses this card’s demo balance.</p><form onsubmit="event.preventDefault();L.virtualCardUI.simulatePurchase()"><label class="field" for="vc-demo-merchant"><span>Demo merchant</span><select id="vc-demo-merchant" onchange="L.virtualCardUI.chooseMerchant()">${merchants.map(m=>`<option value="${m.id}"${m.id===d.merchant?' selected':''}>${E(m.name)} · ${E(m.category)}</option>`).join('')}</select></label><label class="field" for="vc-demo-amount"><span>Amount · GH₵</span><input id="vc-demo-amount" type="number" inputmode="decimal" min="0.01" max="5000" step="0.01" value="${E(d.amount)}" required placeholder="0.00" oninput="L.virtualCardUI.capture()"></label>${budget.length?`<label class="field" for="vc-demo-budget"><span>Covers a Budget item <small>Optional</small></span><select id="vc-demo-budget" onchange="L.virtualCardUI.capture()"><option value="">Extra spending</option>${budget.map(x=>`<option value="${E(x.id)}"${x.id===d.essentialId?' selected':''}>${E(x.name)}</option>`).join('')}</select></label>`:''}<label class="field" for="vc-demo-outcome"><span>Simulated result</span><select id="vc-demo-outcome" onchange="L.virtualCardUI.capture()">${[['success','Completed'],['pending','Pending'],['failed','Failed']].map(([v,t])=>`<option value="${v}"${v===d.outcome?' selected':''}>${t}</option>`).join('')}</select></label>${error}<button class="primary" type="submit">Simulate merchant payment</button></form><p class="vc-note">${M(balanceValue(c.id))} available on this card. A merchant checkout does not run inside Lumo, so this demo does not add a pre-purchase Pause.</p>`);
};
for(const [route,treatment,label]of [['virtualCards','selection','Virtual cards'],['virtualCardCreate','edit','Create virtual card'],['virtualCard','detail','Your virtual card'],['virtualCardAuthorize','confirmation','Authorise card action'],['virtualCardStatus','confirmation','Card status'],['virtualCardDetails','detail','Card details'],['virtualCardManage','edit','Manage card'],['virtualCardDemo','form','Online checkout demo']])L.taskSheet?.register(route,{family:'records',treatment,label});
const pay=L.views.pay;
L.views.pay=function(...args){const html=pay.apply(this,args);if(!allowed())return html;const count=api.totals().count;const row=`<div class="vc-pay-entry">${L.row('Virtual cards',count?count+' of 2 cards · Online payments':'Pay online with a Lumo card','card',"L.go('virtualCards')")}</div>`;return html.includes('<div class="pay-utilities">')?html.replace('<div class="pay-utilities">',row+'<div class="pay-utilities">'):html.replace(/<\/section>\s*$/,row+'</section>');};
const chat=L.chatAnswer,openChat=L.chatOpenAnswer,extra=L.chatSnapshotStatusExtra;
const chatCardScope=()=>JSON.stringify([L.state.virtualCards||[],L.state.txs.filter(t=>t.cardId).map(t=>[t.id,t.status,t.amount,t.refunded])]);
L.chatAnswer=function(question,options={}){
 const q=String(question||'').toLowerCase().trim();
 if(!allowed()||!/\b(?:virtual cards?|online cards?|my cards?|card balance|spen[td].*online|online spending|on (?:a |the )?card)\b/.test(q))return chat.apply(this,arguments);
 const proposed=/\b(?:can|could|should|enough|afford|would)\b/.test(q)&&/\b(?:spend|pay|buy|purchase|afford)\b/.test(q),funding=/\b(?:add|load|fund|top[ -]?up)\b/.test(q);
 if(proposed||funding){
  const cards=api.list().filter(c=>['active','frozen'].includes(c.status)),named=cards.filter(c=>q.includes(c.name.toLowerCase())),card=named.length===1?named[0]:cards.length===1?cards[0]:null;
  const tokens=[...q.matchAll(/(?:gh₵|ghs|₵)\s*(\d[\d,.]*)|\b(\d[\d,.]*)\s*(?:cedis?|ghs)\b/gi)].map(m=>(m[1]||m[2]).replace(/\.$/,''));
  if(!tokens.length){const bare=[...q.matchAll(/\b\d[\d,.]*/g)].map(m=>m[0].replace(/\.$/,''));if(bare.length===1)tokens.push(bare[0]);}
  const exact=tokens.length===1&&/^(?:\d+|\d{1,3}(?:,\d{3})+)(?:\.\d{1,2})?$/.test(tokens[0]);
  const amount=exact&&!/\b(?:usd|eur|gbp|dollars?|euros?|pounds?|about|around|roughly|between)\b|[$€£]/.test(q)?L.moneyInput(tokens[0].replace(/,/g,''),.01,5000):null;
  let headline,support;
  if(!card){headline=cards.length?'Which card would you like to use?':'Create a virtual card first.';support=cards.length?'Your cards have separate balances. Choose one to check its funds and online limit.':'You can have up to two, funded from Everyday Money.';}
  else if(card.status==='frozen'){headline=`${card.name} is frozen.`;support='Unfreeze it before adding money or making a new online payment.';}
  else if(amount===null){headline=`${M(api.balance(card.id).available)} is available on ${card.name}.`;support='Tell me one exact amount in Ghana cedis to check it. Foreign-currency charges and rates are not available in this demo.';}
  else if(funding){const impact=L.planImpactSummary({method:'virtualCard',cardId:card.id,name:card.name,amount,fee:0});headline=impact.canPay?impact.headline:`${M(impact.fundingShortfall)} more Everyday Money is needed.`;support=`Adding ${M(amount)} moves money onto ${card.name}; it is not spending. Review and authorise the top-up yourself.`;}
  else{const available=api.balance(card.id).available;headline=amount>Number(card.limit)?`${M(amount)} is above this card’s online limit.`:amount>available?`${M(Math.round((amount-available)*100)/100)} more is needed on ${card.name}.`:`${card.name} has enough for ${M(amount)}.`;support=`${M(available)} available · ${M(card.limit)} limit per payment. This uses card funds already moved from Everyday Money, so that account is not charged again. The final charge may differ if currency conversion or fees apply.`;}
  return {intent:'virtual-cards',headline,support,text:headline+' '+support,action:'Open virtual cards',route:'virtualCards',context:{days:30,category:''},cardSnapshot:chatCardScope()};
 }
 const now=Number(options.now)||Date.now(),days=Number(q.match(/\b(?:last|past)\s+(7|30|90)\s+days?\b/)?.[1]||30),today=/\btoday\b/.test(q),totals=api.totals(),spending=L.spendingSummary({days,now}),txs=spending.txs.filter(t=>t.fundingAccount==='virtual-card'&&(!today||String(t.date).slice(0,10)===new Date(now).toISOString().slice(0,10))),spent=Math.round(txs.reduce((n,t)=>n+Number(t.amount)+Number(t.fee||0),0)*100)/100;
 const spend=/spen[td]|spending/.test(q),unsupportedPeriod=spend&&/\b(?:yesterday|last week|last month|on \w+day|\d{4}-\d{2}-\d{2})\b/.test(q),headline=unsupportedPeriod?'Which spending period should I use?':spend?`${M(spent)} spent online ${today?'today':'in the last '+days+' days'}.`:totals.count?`${M(totals.balance)} on your virtual cards.`:'Create a virtual card for online payments.';
 const support=unsupportedPeriod?'I can check today or the last 7, 30 or 90 days. Tell me which period you want.':spend?'Only completed card purchases count. Card top-ups move your money and are not spending.':totals.count?`${totals.count} of 2 cards. Top-ups come from Everyday Money; Money Boxes stay separate.`:'You can have up to two cards, funded from Everyday Money. This preview issues demo cards only.';
 return {intent:'virtual-cards',headline,support,text:headline+' '+support,action:'Open virtual cards',route:'virtualCards',context:{days:30,category:''},cardSnapshot:chatCardScope()};
};
L.chatOpenAnswer=function(index,secondary=false){const reply=L.state.chats?.[index];if(!secondary&&reply?.intent==='virtual-cards')return guard()&&L.go('virtualCards');return openChat?.apply(this,arguments);};
L.chatSnapshotStatusExtra=reply=>extra?.(reply)||(reply?.cardSnapshot&&reply.cardSnapshot!==chatCardScope()?'Earlier card information. Ask again for the latest balance.':'');
const before=L.beforeNavigate;
L.beforeNavigate=function(route,...args){capture();if(route!=='virtualCardAuthorize')auth=null;if(route!=='virtualCardDetails'){reveal=null;clearTimeout(revealTimer);}return before?.call(this,route,...args);};
const invalidate=()=>{const visible=L.route==='virtualCardDetails'||L.route==='virtualCardAuthorize';resetSecrets();if(visible)L.render();};
window.addEventListener?.('pagehide',resetSecrets);
document.addEventListener?.('visibilitychange',()=>{if(document.hidden)invalidate();});
L.virtualCardUI={capture,requestLifecycle,reviewLifecycle,requestCreate,requestManage,requestFreeze,requestReveal,approve,openDemo,chooseMerchant,simulatePurchase,simulateRefund,resolveIssue,resolveTransaction,
  create(){if(!guard())return;return L.openVirtualCardCreation?.();},
 manage(id){if(!guard())return;L.go('virtualCardManage',{id});},
 biometric(on){if(!authValid())return;auth.biometric=!!on;const field=document.getElementById('vc-pin');if(field)field.value='';L.render();}
};
})();
