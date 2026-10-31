/* Everyday shortcuts use known demo recipients and the existing payment engine.
   A repeat is a new editable draft, never another submission of an old receipt. */
(()=>{
'use strict';
if(!window.L||L.everydayPayments)return;
const E=L.e,M=L.money,B=L.btn;
// The same deliberately small, bundled catalogue used by payments.js and QR.
const merchants=Object.freeze([
 {id:'AK01',name:'Akua’s Kitchen',detail:'Food · Night market, Legon',category:'Food'},
 {id:'CP02',name:'Campus Print',detail:'Printing · Balme Library',category:'Study'},
 {id:'RB03',name:'Ride & Go',detail:'Transport · Main gate',category:'Transport'}
]);
const people=Object.freeze([
 {id:'abena',name:'Abena Asante',handle:'@abena.a'},
 {id:'kojo',name:'Kojo Owusu',handle:'@kojo.o'},
 {id:'ama',name:'Ama Boateng',handle:'@ama.b'}
]);
const merchant=id=>merchants.find(item=>item.id===String(id||''));
const tx=id=>(L.state.txs||[]).find(item=>item.id===id);
const prefs=()=>{const s=L.state;s.everydayPayments=s.everydayPayments||{};if(!Array.isArray(s.everydayPayments.favourites))s.everydayPayments.favourites=[];return s.everydayPayments;};
const favourites=()=>prefs().favourites.filter(id=>!!merchant(id));
const openAccount=()=>!!L.state.onboarded&&!L.state.closed&&!L.state.locked;
const normalPhone=value=>String(value||'').replace(/[\s-]/g,'').replace(/^\+233/,'0');
const blocked=value=>value&&(value.recipientBlocked||value.recipientClosed||value.blocked||value.closed||['blocked','closed','unavailable'].includes(value.recipientStatus));
const currentDescriptor=t=>{
 const d=t?.paymentDraft;
 if(!d||t.type!=='out'||d.method==='box'||t.internal||t.requestId||t.merchantSaleId||d.requestId||d.merchantSaleId||blocked(t)||blocked(d))return null;
 if(d.method==='campus'){
  const item=merchant(d.merchantId||d.destination);if(!item)return null;
  return {method:'campus',id:item.id,name:item.name,detail:item.detail,key:'campus:'+item.id};
 }
 if(d.method==='lumo'){
  const item=people.find(item=>item.id===d.recipient&&item.handle===d.destination);if(!item)return null;
  return {method:'lumo',id:item.id,name:item.name,detail:item.handle,key:'lumo:'+item.id};
 }
 if(d.method==='momo'&&normalPhone(d.destination||d.inputNumber)==='0241234567')return {method:'momo',id:'0241234567',name:'Abena Asante',detail:'Mobile money · 024 123 4567',key:'momo:0241234567'};
 if(d.method==='bank'&&String(d.destination||d.inputNumber)==='102345678901'&&d.provider==='GCB Bank')return {method:'bank',id:'102345678901',name:'Kwesi Osei',detail:'GCB Bank · 102345678901',key:'bank:102345678901'};
 if(d.method==='bill'&&['airtime','data'].includes(d.bill)&&/^0[235][0-9]{8}$/.test(normalPhone(d.destination)))return {method:'bill',id:normalPhone(d.destination),bill:d.bill,name:d.bill==='data'?'Data bundle':'Airtime',detail:normalPhone(d.destination),key:d.bill+':'+normalPhone(d.destination)};
 return null;
};
const canRepeat=t=>!!currentDescriptor(t)&&t.status==='success'&&!t.refunded&&!t.refundId&&!['pending','failed'].includes(t.delivery);
const pendingFor=t=>{const key=currentDescriptor(t)?.key;return key?(L.state.txs||[]).find(item=>item.status==='pending'&&currentDescriptor(item)?.key===key):null;};
const recent=()=>{
 const seen=new Set();
 return [...(L.state.txs||[])].sort((a,b)=>new Date(b.date)-new Date(a.date)).filter(t=>{if(!canRepeat(t))return false;const key=currentDescriptor(t).key;if(seen.has(key))return false;seen.add(key);return true;}).slice(0,5);
};
const activeSource=id=>(L.state.essentials||[]).find(item=>item.id===id&&!item.archived&&!item.deleted);
const sourceLabel=t=>t.paymentDraft?.essentialId?(activeSource(t.paymentDraft.essentialId)?.name||'Choose a current Budget item'):'Left after budget';
const safeId=value=>E(String(value||''));
const line=(label,value)=>`<div class="everyday-summary-line"><span>${E(label)}</span><strong>${E(value)}</strong></div>`;
const date=t=>{const value=new Date(t.date);return Number.isNaN(value.getTime())?'Previous payment':value.toLocaleDateString('en-GB',{day:'numeric',month:'short'});};
const star=id=>`<button type="button" class="everyday-star" aria-label="${favourites().includes(id)?'Remove '+E(merchant(id).name)+' from':'Add '+E(merchant(id).name)+' to'} favourites" aria-pressed="${favourites().includes(id)}" onclick="L.toggleMerchantFavourite('${id}')"><span aria-hidden="true">${favourites().includes(id)?'★':'☆'}</span></button>`;
const merchantRow=item=>`<div class="everyday-merchant-row"><button type="button" class="everyday-payment-row" onclick="L.chooseEverydayMerchant('${item.id}')"><span class="everyday-row-icon" aria-hidden="true">${L.icon('scan',20)}</span><span><strong>${E(item.name)}</strong><small>${E(item.detail)}</small></span>${L.icon('chevron',17)}</button>${star(item.id)}</div>`;
const shortcuts=()=>`<div class="everyday-shortcuts" aria-label="Everyday payments"><button type="button" onclick="L.openEverydayPayments('recent')">${L.icon('clock',17)} Recent</button><button type="button" onclick="L.openEverydayPayments('favourites')"><span aria-hidden="true">☆</span> Favourites</button></div>`;
L.openEverydayPayments=(filter='recent')=>L.go('everydayPayments',{filter:filter==='favourites'?'favourites':'recent'});
L.toggleMerchantFavourite=id=>{
 if(!openAccount()||!merchant(id))return false;
 const p=prefs(),on=favourites().includes(id);p.favourites=on?p.favourites.filter(value=>value!==id):[...favourites(),id];L.save();L.render();L.toast(on?'Removed from favourites.':'Saved to favourites on this device.');return !on;
};
const requireReplacement=(action,key,context={})=>L.requestPaymentReplacement(action,key,context);
L.chooseEverydayMerchant=id=>{
 if(!openAccount()||!merchant(id))return false;
 const action=()=>{if(!openAccount()||!merchant(id))return false;L.pickMerchant(id);L.state.paymentDraft.everydayKey='merchant:'+id;L.save();return true;};
 if(requireReplacement(action,'merchant:'+id))return false;return action();
};
const createRepeat=(id,retry=false)=>{
 const original=tx(id),descriptor=currentDescriptor(original);
 if(!openAccount()||!descriptor)return false;
 // A provider result can arrive while the saved-draft choice is open. Check
 // again at the moment of replacement, before touching the current draft.
 const waiting=original.status==='pending'||original.delivery==='pending'?original:pendingFor(original);
 if(waiting){L.openPaymentRecovery(waiting.id);L.toast('A payment to this recipient is still pending. Check it before paying again.');return false;}
 if(retry?original.status!=='failed':!canRepeat(original))return false;
 const previous=original.paymentDraft,amount=Number(original.amount);
 if(!Number.isFinite(amount)||amount<=0||amount>5000)return false;
 // Start through the current entry functions. Only non-authorisation fields
 // are copied; recipient checks, fees, category inference and the quote run anew.
 if(descriptor.method==='campus')L.pickMerchant(descriptor.id);
 else if(descriptor.method==='lumo'){L.startSend('lumo','');L.pickPerson(descriptor.id);}
 else if(descriptor.method==='bill')L.startBill(descriptor.bill);
 else L.startSend(descriptor.method,'');
 const d=L.state.paymentDraft;
 if(!d||d.submittedTxId)return false;
 d.everydayKey=(retry?'retry:':'repeat:')+id;d.repeatOf=id;d.note=String(previous.note||'').slice(0,120);
 if(descriptor.method!=='bill'||descriptor.bill==='airtime')d.amount=amount;
 if(['momo','bank'].includes(descriptor.method)){
  d.inputNumber=descriptor.id;d.checked=false;
  if(descriptor.method==='bank')d.provider='GCB Bank';
 }else if(descriptor.method==='bill'){
  d.destination=descriptor.id;d.checked=false;
  // Data always starts from the current catalogue, never a stale receipt price.
  if(descriptor.bill==='data')d.repeatProductNotice='Choose a current bundle. Previous prices are not reused.';
 }
 const previousSource=String(previous.essentialId||''),source=previousSource&&activeSource(previousSource)?previousSource:'';
 L.setPaymentSource(source,d);
 d.repeatSourceChanged=!!previousSource&&!source;
 // The source was deliberately selected on the original payment. No old
 // category choice or inferred category is copied into this new decision.
 L.save();L.render();return true;
};
const requestRepeat=(id,retry=false)=>{
 const t=tx(id);if(!t||!openAccount())return false;
 if(t.status==='pending'||t.delivery==='pending'){L.openPaymentRecovery(id);L.toast('This payment is still pending. Check it before paying again.');return false;}
 const pending=pendingFor(t);
 if(pending){L.openPaymentRecovery(pending.id);L.toast('A payment to this recipient is still pending. Check it before paying again.');return false;}
 if((retry?t.status!=='failed':!canRepeat(t))||!currentDescriptor(t)){L.toast('Start a new payment and check the recipient again. This saved payment cannot be repeated.');return false;}
 const key=(retry?'retry:':'repeat:')+id;
 if(requireReplacement(()=>createRepeat(id,retry),key))return false;
 return createRepeat(id,retry);
};
L.repeatEverydayPayment=id=>requestRepeat(id,false);
const previousRetry=L.retryPayment;
L.retryPayment=id=>{
 const t=tx(id);
 // Other existing bill, request, collection and Money Box recovery journeys
 // retain their specialised validation rather than becoming generic repeats.
 if(t?.paymentDraft?.method==='box'||t?.requestId||t?.merchantSaleId||t?.paymentDraft?.requestId||t?.paymentDraft?.merchantSaleId||t?.paymentDraft?.method==='bill'&&!['airtime','data'].includes(t.paymentDraft.bill))return previousRetry?.(id);
 return requestRepeat(id,true);
};
L.views.everydayPayments=()=>{
 const filter=L.params.filter==='favourites'?'favourites':'recent',items=recent(),saved=favourites();
 const pending=(L.state.txs||[]).filter(t=>t.type==='out'&&t.status==='pending'&&t.paymentDraft?.method!=='box');
 const tabs=`<div class="everyday-filter" aria-label="Saved payments"><button type="button" aria-pressed="${filter==='recent'}" onclick="L.openEverydayPayments('recent')">Recent</button><button type="button" aria-pressed="${filter==='favourites'}" onclick="L.openEverydayPayments('favourites')">Favourites</button></div>`;
 const recentHtml=items.length?items.map(t=>{const item=currentDescriptor(t);return `<button type="button" class="everyday-payment-row" onclick="L.repeatEverydayPayment('${safeId(t.id)}')"><span class="everyday-row-icon" aria-hidden="true">${L.icon(item.method==='campus'?'scan':item.method==='bill'?'phone':'user',20)}</span><span><strong>${E(item.name)}</strong><small>${E(date(t))} · ${M(t.amount)} · ${E(sourceLabel(t))}</small></span>${L.icon('chevron',17)}</button>`;}).join(''):'<div class="everyday-empty"><h2>Your next time, made easier.</h2><p>Completed payments to known recipients appear here. Choose a campus favourite to get started.</p></div>';
 const favHtml=saved.length?saved.map(id=>merchantRow(merchant(id))).join(''):`<div class="everyday-empty"><h2>Keep your regulars close.</h2><p>Tap a star to save a campus merchant. It won’t send money.</p></div>${merchants.map(merchantRow).join('')}`;
 return `<section class="everyday-payments"><h1>${filter==='recent'?'Pay someone again':'Your campus favourites'}</h1><p class="everyday-intro">${filter==='recent'?'Choose a payment, then check or change the amount.':'Known sample merchants. Always review before paying.'}</p>${tabs}<div class="everyday-payment-list">${filter==='recent'?recentHtml:favHtml}</div>${filter==='recent'&&pending.length?`<div class="everyday-pending-preview"><h2>Still being checked</h2>${pending.slice(0,2).map(t=>L.row(t.name,M(t.amount)+' · Same reference, no second payment','clock',`L.openPaymentRecovery('${safeId(t.id)}')`)).join('')}</div>`:''}${filter==='favourites'&&saved.length?`<details class="everyday-more"><summary>All 3 sample merchants</summary>${merchants.filter(item=>!saved.includes(item.id)).map(merchantRow).join('')||'<p>All sample merchants are in your favourites.</p>'}</details>`:''}<p class="preview-boundary">Sample money · No live payments or merchant lookup</p></section>`;
};
L.openPaymentRecovery=id=>{if(tx(id))L.go('paymentRecovery',{id});};
L.checkEverydayPayment=id=>{
 const t=tx(id);if(!t||!openAccount())return false;
 // Like the existing refreshPayment simulation, this records a check of the
 // same reference only. Keep this surface and its Back position unchanged.
 t.lastChecked=new Date().toISOString();L.save();L.render();
 L.toast(t.status==='pending'?'Still being checked. No second payment was sent.':t.delivery==='pending'?'Delivery is still pending. No second charge.':'Status is up to date.');return true;
};
L.simulateEverydayPayment=(id,status)=>{
 if(!L.testMode||!openAccount()||!['success','failed'].includes(status)||tx(id)?.status!=='pending')return false;
 L.settlePayment(id,status);L.go('paymentRecovery',{id});return true;
};
L.canRetryPayment=id=>{const t=tx(id);return !!(openAccount()&&t?.status==='failed'&&currentDescriptor(t)&&!pendingFor(t));};
L.views.paymentRecovery=()=>{
 const t=tx(L.params.id);if(!t)return '<section class="everyday-recovery"><h1>Payment not found.</h1>'+B('Back to activity',"L.go('activity')")+'</section>';
 const pending=t.status==='pending',failed=t.status==='failed',deliveryPending=t.status==='success'&&t.delivery==='pending',deliveryFailed=t.status==='success'&&t.delivery==='failed',canRetry=L.canRetryPayment(t.id);
 const title=pending?'Still being checked.':failed?'Payment not completed.':deliveryPending?'Payment confirmed. Delivery pending.':deliveryFailed?'Payment confirmed. Delivery needs help.':t.status==='success'?'Payment confirmed.':'Payment status';
 const explanation=pending?(t.type==='in'?'This money is waiting for confirmed receipt. It is not available to spend yet.':'The amount is reserved. No second payment has been sent.'):failed?(canRetry?'No money was sent. Review a fresh attempt when you’re ready.':'No money was sent. Your receipt has the recorded details.'):deliveryPending?'You have paid once. We’re still checking the service delivery. Please don’t buy it again yet.':deliveryFailed?'The payment completed, but the service was not delivered. Ask for help with this reference.':'This is the recorded result for this reference.';
 return `<section class="everyday-recovery"><span class="everyday-status-symbol" aria-hidden="true">${L.icon(pending||deliveryPending?'clock':failed||deliveryFailed?'help':'check',27)}</span><h1>${E(title)}</h1><p>${E(explanation)}</p><div class="everyday-recovery-context">${line('Payment',M(t.amount)+(t.type==='in'?' from ':' to ')+t.name)}${line('Reference',t.id)}${t.lastChecked?line('Last checked',new Date(t.lastChecked).toLocaleTimeString('en-GB',{hour:'2-digit',minute:'2-digit'})):''}</div><div id="error" role="alert"></div><div class="actions">${pending||deliveryPending?B('Check status',`L.checkEverydayPayment('${safeId(t.id)}')`):canRetry?B('Review a new attempt',`L.retryPayment('${safeId(t.id)}')`):deliveryFailed?B('Get delivery help',`L.go('supportCase',{txId:'${safeId(t.id)}',reference:'${safeId(t.id)}',returnRoute:'paymentRecovery',returnParams:{id:'${safeId(t.id)}'}})`):B('View receipt',`L.go('txDetail',{id:'${safeId(t.id)}'})`)}${deliveryFailed?B('View receipt',`L.go('txDetail',{id:'${safeId(t.id)}'})`,'secondary'):B('Get help',`L.go('supportCase',{txId:'${safeId(t.id)}',reference:'${safeId(t.id)}',returnRoute:'paymentRecovery',returnParams:{id:'${safeId(t.id)}'}})`,'secondary')}${B('Back to activity',"L.go('activity')",'text-btn')}</div>${L.testMode&&pending?`<details class="everyday-simulation"><summary>Simulation controls</summary><p>Checking status does not choose an outcome. These controls simulate a provider confirmation.</p>${B('Simulate confirmed payment',`L.simulateEverydayPayment('${safeId(t.id)}','success')`,'secondary')}${B('Simulate failed payment',`L.simulateEverydayPayment('${safeId(t.id)}','failed')`,'secondary')}</details>`:''}<p class="preview-boundary">Simulated status · No live provider check</p></section>`;
};
const wrapView=(route,transform)=>{const previous=L.views[route];if(previous)L.views[route]=()=>transform(previous());};
wrapView('pay',html=>html.replace(/(<div class="pay-tabs"[^>]*>[\s\S]*?<\/div>)/,'$1'+shortcuts()));
wrapView('campusPay',html=>L.params.qrScan||L.params.qrSample?html:html.replace(/(<div class="section-head"><h2>Around campus<\/h2><\/div>)/,shortcuts()+'$1'));
const repeatHint=html=>{
 const d=L.state.paymentDraft;if(!d?.repeatOf||d.submittedTxId)return html;
 const text=d.repeatSourceChanged?'Your previous Budget item is no longer available. Choose a source, or use Left after budget.':d.repeatProductNotice||'';
 if(!text)return html;
 const hint=`<p class="everyday-repeat-hint" role="status">${E(text)}</p>`;
 return html.replace(/(<form\b[^>]*>)/,'$1'+hint);
};
wrapView('send',repeatHint);wrapView('bill',repeatHint);
wrapView('txDetail',html=>{
 const t=tx(L.params.id);if(!t||t.paymentDraft?.method==='box')return html;
 const item=currentDescriptor(t),code=item?.method==='campus'?item.id:null;
 const content=`<section class="everyday-receipt-shortcuts" aria-label="Payment shortcuts">${canRepeat(t)?B('Pay this recipient again',`L.repeatEverydayPayment('${safeId(t.id)}')`,'secondary'):''}${code?`<button type="button" class="text-btn everyday-save-favourite" aria-pressed="${favourites().includes(code)}" onclick="L.toggleMerchantFavourite('${code}')"><span aria-hidden="true">${favourites().includes(code)?'★':'☆'}</span> ${favourites().includes(code)?'Saved to favourites':'Save merchant to favourites'}</button>`:''}${t.status==='pending'||t.status==='failed'||['pending','failed'].includes(t.delivery)?B('Payment status & help',`L.openPaymentRecovery('${safeId(t.id)}')`,'secondary'):''}</section>`;
 return content==='<section class="everyday-receipt-shortcuts" aria-label="Payment shortcuts"></section>'?html:html+content;
});
L.everydayPayments={merchants:()=>merchants.map(item=>({...item})),merchant:id=>{const item=merchant(id);return item?{...item}:null;},recent:()=>recent().map(t=>t.id),canRepeat:id=>canRepeat(tx(id)),descriptor:id=>currentDescriptor(tx(id))};
L.taskSheet?.register('everydayPayments',{family:'payment',treatment:'selection',label:'Everyday payments'});
L.taskSheet?.register('everydayRepeatChoice',{family:'payment',treatment:'confirmation',label:'Saved payment'});
L.taskSheet?.register('paymentRecovery',{family:'records',treatment:'detail',label:'Payment status'});
})();
