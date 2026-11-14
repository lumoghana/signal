// Public merchant collections have their own transport. No consumer session,
// registered phone number or wallet is read by this checkout.
const CONFIG = Object.freeze({url:'https://iwutbrljiiodamtyoorg.supabase.co',key:'sb_publishable_4dmChQek8k-opkVhO4N_KA_TCGVjWi6'});
const CONSUMER_ORIGIN='https://lumo-connected-pilot.vercel.app';
const TOKEN=/^[a-f0-9]{64}$/;
const UUID=/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
const JOURNAL_KEY='lumo-guest-checkout-references-v1';
const NETWORKS=Object.freeze({mtn:'MTN MoMo',telecel:'Telecel Cash',airteltigo:'AT Money'});
const STATUSES=new Set(['pending','processing','confirmed','declined','cancelled','expired','failed','reversed']);
const TERMINAL=new Set(['confirmed','declined','cancelled','expired','failed','reversed']);
const E=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const clone=value=>JSON.parse(JSON.stringify(value));
const money=value=>`GH₵${((Number(value)||0)/100).toLocaleString('en-GH',{minimumFractionDigits:2,maximumFractionDigits:2})}`;
const problem=(message,code='CHECKOUT_UNAVAILABLE',extra={})=>Object.assign(new Error(message),{code,...extra});
const safeStorage=()=>{try{return globalThis.localStorage}catch{return null}};
const refundStatus=value=>({'sandbox-completed':'Returned · test money',confirmed:'Returned',completed:'Returned',pending:'Pending',requested:'Requested',declined:'Declined'}[value]||'Pending');
const readableDate=value=>{const date=new Date(value);return Number.isFinite(date.valueOf())?date.toLocaleString('en-GH',{day:'numeric',month:'short',hour:'2-digit',minute:'2-digit'}):'Not recorded'};

export function parseGuestAmount(value){
 const text=String(value??'').trim();if(!/^\d{1,7}(?:\.\d{1,2})?$/.test(text))return null;
 const [major,minor='']=text.split('.'),amount=Number(major)*100+Number((minor+'00').slice(0,2));
 return Number.isSafeInteger(amount)&&amount>0&&amount<=1000000?amount:null;
}
export function normalizeGuestPhone(value){
 const text=String(value??'').trim().replace(/[\s()-]/g,'').replace(/^(?:\+233|233)/,'0');
 return /^0[25]\d{8}$/.test(text)?text:'';
}
export function parseGuestLocation(value){
 const url=new URL(value,CONSUMER_ORIGIN),link=url.searchParams.get('link')||'';
 if(!TOKEN.test(link))throw problem('This payment link is incomplete. Ask the merchant to share it again.','INVALID_LINK');
 let recovery=null;
 if(url.hash){
  const part=new URLSearchParams(url.hash.slice(1)).get('receipt');
  if(part){const [attemptId,recoveryToken,...extra]=part.split('.');if(extra.length||!UUID.test(attemptId||'')||!TOKEN.test(recoveryToken||''))throw problem('The receipt recovery link is incomplete. Reopen your original payment link.','INVALID_RECEIPT_LINK');recovery={attemptId,recoveryToken,link};}
 }
 return {link,recovery};
}
export function guestReceiptURL(location,journal){
 if(!journal||!UUID.test(journal.attemptId||'')||!TOKEN.test(journal.recoveryToken||''))return '';
 const url=new URL('./checkout.html',location);url.search='';url.searchParams.set('link',journal.link);url.hash=new URLSearchParams({receipt:journal.attemptId+'.'+journal.recoveryToken}).toString();return url.href;
}
export function lumoCheckoutURL(quote){
 const link=quote?.link;if(!UUID.test(link?.shopId||''))return '';
 const url=new URL('/',CONSUMER_ORIGIN);url.searchParams.set('pay',link.shopId);if(link.requestId){if(!UUID.test(link.requestId))return '';url.searchParams.set('request',link.requestId);}return url.href;
}
function secretToken(cryptoApi){
 if(!cryptoApi?.getRandomValues)throw problem('This browser cannot create a secure payment reference. Open the link in your phone’s browser.','SECURE_BROWSER_REQUIRED');
 return [...cryptoApi.getRandomValues(new Uint8Array(32))].map(value=>value.toString(16).padStart(2,'0')).join('');
}
function newAttemptId(cryptoApi){
 if(cryptoApi?.randomUUID)return cryptoApi.randomUUID();
 const bytes=cryptoApi.getRandomValues(new Uint8Array(16));bytes[6]=(bytes[6]&15)|64;bytes[8]=(bytes[8]&63)|128;const s=[...bytes].map(value=>value.toString(16).padStart(2,'0')).join('');return [s.slice(0,8),s.slice(8,12),s.slice(12,16),s.slice(16,20),s.slice(20)].join('-');
}
function validJournal(value,link){return !!value&&value.link===link&&TOKEN.test(link)&&UUID.test(value.attemptId||'')&&TOKEN.test(value.recoveryToken||'')&&(!Object.hasOwn(value,'amount')||Number.isSafeInteger(value.amount)&&value.amount>0)&&Object.keys(value).every(key=>['link','attemptId','recoveryToken','amount','fee','shopId','createdAt'].includes(key));}
export function createGuestJournal(storage=safeStorage()){
 const memory=new Map();
 function readAll(){try{const value=JSON.parse(storage?.getItem(JOURNAL_KEY)||'{}');if(!value||typeof value!=='object'||Array.isArray(value))throw Error('Invalid references');return value}catch{throw problem('This browser could not read its saved payment references. Use your private receipt link or contact the merchant before starting another payment.','REFERENCE_UNAVAILABLE')}}
 function read(link){const value=memory.get(link)||readAll()[link];return validJournal(value,link)?clone(value):null;}
 function save(value){
  if(!validJournal(value,value?.link))throw problem('This payment reference could not be saved safely.','REFERENCE_UNAVAILABLE');
  const record=clone(value);
  try{if(!storage)throw Error('No storage');const saved=readAll();saved[record.link]=record;const keys=Object.keys(saved);for(const key of keys.slice(0,Math.max(0,keys.length-20)))delete saved[key];const encoded=JSON.stringify(saved);storage.setItem(JOURNAL_KEY,encoded);if(storage.getItem(JOURNAL_KEY)!==encoded)throw Error('Reference not saved');memory.set(record.link,record);return true}catch{return false}
 }
 function clear(link){memory.delete(link);try{const saved=readAll();delete saved[link];storage?.setItem(JOURNAL_KEY,JSON.stringify(saved));return !readAll()[link]}catch{return false}}
 return {read,save,clear};
}
export function createGuestAPI({fetch:transport=globalThis.fetch,config=CONFIG}={}){
 return async(operation,payload={})=>{
  let response,data;
  try{response=await transport(config.url+'/functions/v1/lumo-approved',{method:'POST',headers:{'Content-Type':'application/json',Accept:'application/json',apikey:config.key},body:JSON.stringify({action:'guestCheckout',operation,...payload}),signal:AbortSignal.timeout(25000),credentials:'omit',cache:'no-store',redirect:'error'});data=await response.json();}
  catch{throw problem('Lumo could not confirm the response. Your original payment reference is kept. Reconnect and check its status.','CONNECTION_UNCERTAIN',{unknown:true})}
  if(!response.ok||!data?.ok)throw problem(data?.error?.message||data?.error||data?.message||'This checkout could not be completed.',data?.code||'CHECKOUT_UNAVAILABLE',{status:response.status,unknown:response.status>=500,noMutation:data?.noMutation===true});
  return data;
 };
}
function checkedQuote(value){
 const q=value?.link;
 if(value?.ok!==true||value.currency!=='GHS'||!q||!TOKEN.test(q.publicToken||'')||!UUID.test(q.shopId||'')||!q.merchantName||!q.shopName||q.amount!==null&&(!Number.isSafeInteger(q.amount)||q.amount<=0)||!Number.isSafeInteger(value.fee)||value.fee<0)throw problem('Lumo could not verify this payment’s shop, currency or amount. Ask the merchant for a fresh link.','INVALID_QUOTE');
 if(!['open','paid','expired','cancelled','paused','unavailable'].includes(q.status))throw problem('This payment link is unavailable. Ask the merchant for a fresh link.','INVALID_QUOTE');
 if(!['sandbox','live'].includes(value.provider?.mode)||value.provider?.mode==='live'&&value.provider.live!==true)throw problem('The mobile money provider is unavailable.','PROVIDER_UNAVAILABLE');
 return clone(value);
}
function checkedAttempt(value,journal,quote){
 const a=value?.attempt;
 if(value?.ok!==true||!a||a.id!==journal?.attemptId||!STATUSES.has(a.status)||a.currency!=='GHS'||!Number.isSafeInteger(a.amount)||a.amount<=0||journal.amount&&a.amount!==journal.amount||a.fee!==undefined&&(!Number.isSafeInteger(a.fee)||a.fee<0))throw problem('The payment response did not match this checkout. Keep your reference and check again.','RECEIPT_MISMATCH',{unknown:true});
 if(journal.shopId&&a.shopId&&journal.shopId!==a.shopId)throw problem('This payment belongs to another receiving shop. Keep your original reference.','RECEIPT_MISMATCH',{unknown:true});
 if(a.status==='confirmed'){
  const r=a.receipt;
  if(!r||!r.reference||r.currency!=='GHS'||r.amount!==a.amount||!r.confirmedAt||journal.shopId&&r.shopId&&r.shopId!==journal.shopId)throw problem('Lumo has not returned a matching confirmed receipt. Keep your reference and check again.','RECEIPT_MISMATCH',{unknown:true});
 }
 return clone(a);
}

export function createGuestCheckout({api=createGuestAPI(),location=globalThis.location?.href||CONSUMER_ORIGIN+'/checkout.html',journal=createGuestJournal(),crypto:cryptoApi=globalThis.crypto,onChange=()=>{},online=()=>globalThis.navigator?.onLine!==false}={}){
 let link='',fragment=null,quote=null,provider=null,attempt=null,reference=null,phase='loading',busy=false,error='',notice='',amount='',phone='',network='',generation=0,disposed=false;
 let review=null,copyReceipt=false,resuming=false,backgroundPending=null;
 const emit=()=>{if(!disposed)onChange(view())};
 const active=n=>!disposed&&n===generation;
 function view(){return clone({link,quote,provider,attempt,reference,phase,busy,error,notice,amount,phone:['momo','review'].includes(phase)?phone:'',network,review,copyReceipt,resuming,online:online(),recoveryURL:reference?guestReceiptURL(location,reference):''});}
 function usable(q=quote){return q?.link?.status==='open'&&(!q.link.expiresAt||Date.parse(q.link.expiresAt)>Date.now());}
 function payable(){return quote?.link?.amount??parseGuestAmount(amount);}
 const scope=q=>JSON.stringify([q?.link?.id,q?.link?.shopId,q?.link?.merchantName,q?.link?.shopName,q?.link?.amount,q?.link?.requestId,q?.currency,q?.fee]);
 async function loadQuote(){const value=checkedQuote(await api('quote',{link}));if(value.link.publicToken!==link)throw problem('The merchant link changed. Ask for a fresh link.','LINK_CHANGED');return value;}
 function installAttempt(value){attempt=checkedAttempt(value,reference,quote);provider=value.provider||quote?.provider||(value.sandbox===true?{mode:'sandbox',live:false}:null);phase=attempt.status==='confirmed'?'receipt':TERMINAL.has(attempt.status)?'result':'pending';phone='';review=null;resuming=false;error='';}
 async function perform(work,{quiet=false}={}){
  if(busy||disposed)return;
  const epoch=generation,before=quiet?JSON.stringify(view()):null;busy=true;if(!quiet){error='';notice='';emit();}
  try{return await work(epoch)}catch(failure){if(active(epoch)){error=failure?.message||'Lumo could not complete that request.';if(reference&&(failure?.unknown||['RECEIPT_MISMATCH','ATTEMPT_NOT_FOUND','CHECKOUT_ATTEMPT_NOT_FOUND'].includes(failure.code)))phase='pending';}return null}
  finally{if(active(epoch)){busy=false;if(!quiet||before!==JSON.stringify(view()))emit()}}
 }
 async function start(){
  generation++;const epoch=generation;phase='loading';busy=true;error='';emit();
  try{({link,recovery:fragment}=parseGuestLocation(location));reference=fragment||journal.read(link);if(fragment&&!journal.save(fragment))notice='This browser cannot save your receipt reference. Keep this receipt link before leaving.';
   let quoteError=null;try{quote=await loadQuote();provider=quote.provider}catch(failure){quoteError=failure;}
   if(!active(epoch))return;
   if(reference){try{installAttempt(await api('status',{attemptId:reference.attemptId,recoveryToken:reference.recoveryToken}));if(!reference.amount){reference={...reference,amount:attempt.amount,fee:attempt.fee||0,shopId:attempt.shopId};journal.save(reference);}if(quoteError)notice='Your original payment reference is available. Shop details could not be refreshed.';return;}catch(failure){if(active(epoch)){phase='pending';error=failure.message;return;}}}
   if(quoteError)throw quoteError;phase=usable()?'overview':'unavailable';
  }catch(failure){if(active(epoch)){phase='unavailable';error=failure.message}}
  finally{if(active(epoch)){busy=false;emit()}}
 }
 function setField(name,value){
  if(busy||reference&&['pending','receipt'].includes(phase))return;
  if(name==='amount'&&quote?.link?.amount===null)amount=String(value||'').slice(0,16);
  if(name==='phone')phone=String(value||'').slice(0,22);
  if(name==='network')network=Object.hasOwn(NETWORKS,value)?value:'';
 }
 function chooseMoMo(){if(!usable()||reference)return;if(!payable()){error='Enter an amount from GH₵0.01 to GH₵10,000.00.';emit();return;}phase='momo';error='';emit();}
 function back(){if(busy||reference&&!resuming)return;phase=phase==='review'?'momo':resuming?'pending':'overview';review=null;error='';if(phase==='pending'){resuming=false;phone='';network='';}emit();}
 function resumeOriginal(){if(busy||!reference||attempt)return;resuming=true;phase='momo';phone='';network='';error='';notice='Enter the same number and network to resume your original request. Its payment reference will stay the same.';emit();}
 async function reviewPayment(values={}){
  setField('phone',values.phone??phone);setField('network',values.network??network);
  const normalized=normalizeGuestPhone(phone);
  if(!normalized){error='Enter your own valid Ghana mobile money number.';emit();return;}
  if(!Object.hasOwn(NETWORKS,network)){error='Choose the network for your mobile money number.';emit();return;}
  phone=normalized;
  return perform(async epoch=>{const fresh=await loadQuote();if(!active(epoch))return;quote=fresh;if(!usable()){phase='unavailable';return;}const selected=resuming?reference.amount:payable();if(!selected||selected>1000000)throw problem('Enter an amount from GH₵0.01 to GH₵10,000.00.','INVALID_AMOUNT');if(resuming&&(fresh.link.shopId!==reference.shopId||fresh.link.amount!==null&&fresh.link.amount!==reference.amount||fresh.fee!==reference.fee))throw problem('The original request details changed. Keep your original reference and check its status.','QUOTE_CHANGED');review={amount:selected,fee:fresh.fee,total:selected+fresh.fee,scope:scope(fresh)};phase='review';});
 }
 async function initiate(){
  if(phase!=='review'||!review||reference&&!resuming)return;
  if(!online()){error='Reconnect before starting a payment. No new request has been sent.';emit();return;}
  return perform(async epoch=>{
   const fresh=await loadQuote();if(!active(epoch))return;
   if(!usable(fresh)){quote=fresh;phase='unavailable';return;}
   if(scope(fresh)!==review.scope){quote=fresh;review=null;phase='momo';throw problem('The merchant details or charges changed. Review them again before paying.','QUOTE_CHANGED');}
   quote=fresh;const intended=resuming?reference:{link,attemptId:newAttemptId(cryptoApi),recoveryToken:secretToken(cryptoApi),amount:review.amount,fee:review.fee,shopId:fresh.link.shopId,createdAt:new Date().toISOString()};
   if(!journal.save(intended))throw problem('This browser could not safely save your payment reference. No charge was started. Open the link in your phone’s browser and try again.','REFERENCE_UNAVAILABLE');
   reference=intended;const enteredPhone=phone;phone='';phase='pending';emit();
   try{const result=await api('initiate',{link,amount:intended.amount,phone:enteredPhone,network,attemptId:intended.attemptId,recoveryToken:intended.recoveryToken});if(active(epoch))installAttempt(result);}
   catch(failure){if(active(epoch)&&!resuming&&failure.noMutation===true&&['INVALID_INPUT','AMOUNT_CHANGED','LINK_UNAVAILABLE','SHOP_UNAVAILABLE','REQUEST_PROCESSING'].includes(failure.code)&&journal.clear(link)){reference=null;attempt=null;review=null;phase=['LINK_UNAVAILABLE','SHOP_UNAVAILABLE'].includes(failure.code)?'unavailable':'overview';}throw failure;}
  });
 }
 async function check({background=false}={}){
  if(!reference||disposed)return;
  if(backgroundPending){if(background)return;await backgroundPending;if(!disposed)return check();return;}
  const operation=perform(async epoch=>{const result=await api('status',{attemptId:reference.attemptId,recoveryToken:reference.recoveryToken});if(active(epoch))installAttempt(result);},{quiet:background});
  if(!background)return operation;
  backgroundPending=operation;try{return await operation}finally{if(backgroundPending===operation)backgroundPending=null;}
 }
 async function simulate(outcome){
  if(backgroundPending){await backgroundPending;if(!disposed)return simulate(outcome);return;}
  if(!reference||!attempt||!['pending','processing'].includes(attempt.status)||quote?.provider?.mode!=='sandbox'||!['approve','decline','delay','cancel'].includes(outcome))return;
  return perform(async epoch=>{const result=await api('sandboxResult',{attemptId:reference.attemptId,recoveryToken:reference.recoveryToken,outcome});if(active(epoch))installAttempt(result);});
 }
 async function restart(){
  if(reference&&!TERMINAL.has(attempt?.status))return;
  if(attempt?.status==='confirmed'&&quote?.link?.kind!=='shop')return;
  const previous=reference;return perform(async epoch=>{const fresh=await loadQuote();if(!active(epoch))return;quote=fresh;if(!usable()){phase='unavailable';return;}if(previous&&!journal.clear(link))throw problem('This browser could not clear the completed payment reference. Keep your receipt and reopen the link in your browser.','REFERENCE_UNAVAILABLE');reference=null;attempt=null;phone='';network='';amount='';review=null;copyReceipt=false;phase='overview';});
 }
 function receiptText(){const r=attempt?.receipt;if(attempt?.status!=='confirmed'||!r)return '';const refunds=Array.isArray(r.refunds)?r.refunds:[];return ['Lumo merchant receipt',quote?.provider?.mode==='sandbox'?'SANDBOX · Test money. No mobile money was charged.':'',r.merchantName,r.shopName,money(r.amount),readableDate(r.confirmedAt),'Reference: '+r.reference,'Mobile money reference: '+r.providerReference,...refunds.map(refund=>`Refund ${money(refund.amount)} · ${refundStatus(refund.status)} · ${refund.reference||refund.providerReference||''}`)].filter(Boolean).join('\n');}
 return {start,view,setField,chooseMoMo,back,resumeOriginal,reviewPayment,initiate,check,simulate,restart,receiptText,toggleReceiptCopy(){copyReceipt=!copyReceipt;emit()},setNotice(value){notice=value;emit()},dispose(){disposed=true;generation++},isPending:()=>!busy&&reference&&['pending','processing'].includes(attempt?.status),refreshOnline(){emit()}};
}

const action=(label,name,kind='secondary',extra='')=>`<button type="button" class="checkout-button ${kind}" data-checkout-action="${name}" ${extra}>${label}</button>`;
const backButton=()=>'<button type="button" class="checkout-back" data-checkout-action="back">‹ Back</button>';
function shopCard(q){return `<div class="checkout-shop"><span class="checkout-shop-mark" aria-hidden="true">⌑</span><div><strong>${E(q?.link?.merchantName||'Merchant')}</strong><p>${E(q?.link?.shopName||'Receiving shop')}</p>${q?.link?.description?`<small>${E(q.link.description)}</small>`:''}</div></div>`;}
function sandbox(q){return q?.provider?.mode==='sandbox'?'<div class="checkout-sandbox"><i aria-hidden="true"></i><span><strong>Test payment.</strong> Mobile money is not connected. You can try a clearly labelled sandbox approval. No money will be taken from your phone.</span></div>':'';}
function fees(amount,fee){return `<dl class="checkout-summary"><div><dt>Payment</dt><dd>${money(amount)}</dd></div><div><dt>Checkout charge</dt><dd>${money(fee)}</dd></div><div class="checkout-total"><dt>Total</dt><dd>${money(amount+fee)}</dd></div></dl>`;}
function recover(view){return `<details class="checkout-expand"><summary>Having trouble in WhatsApp or Instagram?</summary><p>Use your app’s menu to open this page in Chrome, Safari or your usual phone browser. Keep your receipt link when a payment has already started.</p>${view.recoveryURL?`<a href="${E(view.recoveryURL)}" target="_blank" rel="noopener noreferrer">Open this payment’s recovery link</a><p>Keep this private. It lets its holder view this payment’s status and receipt.</p>`:''}</details>`;}
function recoveryActions(view){return view.reference?`<div class="checkout-receipt-actions">${action('Keep receipt link','copy-recovery')}${action('Check payment','check','secondary',view.busy?'disabled':'')}</div><p class="checkout-footnote">Keep the receipt link private. You can reopen it without a Lumo account.</p>`:'';}
export function renderGuestCheckout(view){
 const q=view.quote||(view.provider?{provider:view.provider}:null),a=view.attempt,busy=view.busy,off=view.online===false;
 const feedback=`${view.error?`<div class="checkout-error" role="alert">${E(view.error)}</div>`:''}${view.notice?`<div class="checkout-notice" role="status">${E(view.notice)}</div>`:''}${off?'<div class="checkout-notice" role="status">You’re offline. Reconnect to check an authoritative payment status. Your payment reference is kept.</div>':''}`;
 let body='';
 if(view.phase==='loading')body='<section class="checkout-loading"><span class="checkout-spinner" aria-hidden="true"></span><h1>Opening this payment.</h1><p>Checking the receiving shop and amount.</p></section>';
 if(view.phase==='overview'){
  const fixed=q.link.amount!==null,lumo=lumoCheckoutURL(q);
  body=`<div class="checkout-title"><div class="checkout-eyebrow">Pay with clarity</div><h1>One payment.<br>The right shop.</h1></div>${shopCard(q)}${sandbox(q)}${feedback}<section class="checkout-panel"><p class="checkout-eyebrow">${fixed?'Amount requested':'Amount to pay'}</p>${fixed?`<div class="checkout-amount">${money(q.link.amount)}</div><div class="checkout-amount-caption">▣ Fixed by the merchant</div>`:`<label class="checkout-amount-field"><span>GH₵</span><input name="amount" inputmode="decimal" autocomplete="off" value="${E(view.amount)}" placeholder="0.00" aria-label="Amount to pay in Ghana cedis" maxlength="10"></label>`}${q.link.expiresAt?`<div class="checkout-meta"><span>◷</span><span>Valid until ${E(readableDate(q.link.expiresAt))}</span></div>`:'<div class="checkout-meta">Reusable shop link · review each payment</div>'}</section><div class="checkout-actions">${action('Pay with mobile money','choose-momo','primary',busy||off?'disabled':'')}${lumo?`<a class="checkout-button" href="${E(lumo)}">Pay with my Lumo account</a>`:''}</div><p class="checkout-footnote">You don’t need Lumo to pay with mobile money.<br>Never enter a mobile money PIN on this page.</p>${recover(view)}`;
 }
 if(view.phase==='momo')body=`${backButton()}<div class="checkout-title"><div class="checkout-eyebrow">Mobile money</div><h1>Your number.<br>Your approval.</h1><p>Use the number you want to pay from.</p></div>${shopCard(q)}${sandbox(q)}${feedback}<form class="checkout-form" data-checkout-form="momo"><label class="checkout-field"><span>Your mobile money number</span><input name="phone" type="tel" inputmode="tel" autocomplete="off" placeholder="e.g. 024 123 4567" value="${E(view.phone)}" maxlength="22" required><small>Enter your own number. Lumo will never ask for your mobile money PIN.</small></label><label class="checkout-field"><span>Mobile money network</span><select name="network" required><option value="">Choose your network</option>${Object.entries(NETWORKS).map(([value,label])=>`<option value="${value}" ${view.network===value?'selected':''}>${label}</option>`).join('')}</select></label><button type="submit" class="checkout-button primary" ${busy||off?'disabled':''}>${busy?'Checking details…':'Review payment'}</button></form>${recover(view)}`;
 if(view.phase==='review')body=`${backButton()}<div class="checkout-title"><div class="checkout-eyebrow">Review payment</div><h1>Check before<br>you pay.</h1></div>${shopCard(q)}${sandbox(q)}${feedback}<dl class="checkout-summary"><div><dt>Paying from</dt><dd>${E(view.phone)}</dd></div><div><dt>Network</dt><dd>${E(NETWORKS[view.network]||view.network)}</dd></div></dl>${fees(view.review.amount,view.review.fee)}<div class="checkout-actions">${action(view.resuming?'Resume original request':q.provider?.mode==='sandbox'?'Start test payment':'Send approval to my phone','initiate','primary',busy||off?'disabled':'')}</div><p class="checkout-footnote">${q.provider?.mode==='sandbox'?'The next screen lets you simulate a mobile money provider outcome. No mobile money prompt will be sent.':'Approve only through your provider’s usual process on your phone. Keep this page open to see the result.'}</p>${recover(view)}`;
 if(view.phase==='pending'){
  const test=q?.provider?.mode==='sandbox'&&a&&['pending','processing'].includes(a.status);
  body=`<section class="checkout-status"><div class="checkout-status-mark"><span class="checkout-spinner" aria-hidden="true"></span></div><div class="checkout-eyebrow">${a?.status==='processing'?'Provider is checking':'Awaiting confirmation'}</div><h1>${a?'Waiting for a clear answer.':'Check your original payment.'}</h1><p>${test?'This is a sandbox payment. Choose a test provider result below.':'Lumo has not confirmed this payment. Don’t start another payment for this purchase while its outcome is unknown.'}</p>${view.reference?.amount?`<div class="checkout-amount">${money(view.reference.amount)}</div>`:''}${a?.phoneMasked?`<p>${E(NETWORKS[a.network]||a.network)} · ${E(a.phoneMasked)}</p>`:''}</section>${feedback}${a?.reference?`<p class="checkout-reference">Reference ${E(a.reference)}</p>`:`<p class="checkout-reference">Request ${E(view.reference?.attemptId)}</p>`}<div class="checkout-actions">${action(busy?'Checking…':'Check payment status','check','primary',busy||off?'disabled':'')}</div>${!a?`<div class="checkout-actions">${action('Resume original request','resume','secondary',busy||off||!view.reference?.amount?'disabled':'')}</div>`:''}${recoveryActions(view)}${test?`<section class="checkout-simulation"><h2>Sandbox provider controls</h2><p>These controls simulate provider responses for testing. A production checkout uses a verified provider response.</p><div class="checkout-simulation-grid">${[['approve','Approve test payment'],['delay','Keep it pending'],['decline','Decline payment'],['cancel','Cancel test payment']].map(([result,label])=>action(label,'sandbox-'+result,'secondary',busy||off?'disabled':'')).join('')}</div></section>`:''}${recover(view)}`;
 }
 if(view.phase==='receipt'){
  const r=a.receipt,refunds=Array.isArray(r.refunds)?r.refunds:[];
  body=`<section class="checkout-status"><div class="checkout-status-mark confirmed" aria-hidden="true">✓</div><span class="checkout-state-badge confirmed">Confirmed by ${q?.provider?.mode==='sandbox'?'the test provider':'the payment provider'}</span><h1 style="margin-top:20px">Payment received.</h1><div class="checkout-amount">${money(r.amount)}</div><p>${E(r.merchantName)}<br>${E(r.shopName)}</p></section>${sandbox(q)}${feedback}<dl class="checkout-summary"><div><dt>Receipt reference</dt><dd>${E(r.reference)}</dd></div><div><dt>Confirmed</dt><dd>${E(readableDate(r.confirmedAt))}</dd></div><div><dt>Mobile money reference</dt><dd>${E(r.providerReference)}</dd></div>${a.phoneMasked?`<div><dt>Paid from</dt><dd>${E(a.phoneMasked)}</dd></div>`:''}${refunds.map(refund=>`<div><dt>Refund · ${E(refundStatus(refund.status))}</dt><dd>${money(refund.amount)}${refund.reference?`<br><small>${E(refund.reference)}</small>`:''}</dd></div>`).join('')}</dl><div class="checkout-receipt-actions">${action('Keep receipt link','copy-recovery')}${action('Copy receipt','copy-receipt')}</div>${view.copyReceipt?'<p class="checkout-notice">Copy the receipt details below.</p><pre class="checkout-receipt-copy" tabindex="0" data-receipt-copy></pre>':''}<div class="checkout-receipt-help"><p>Need a refund? Contact the merchant with this receipt reference. Any approved return goes back through the original mobile money transaction. You do not need a Lumo wallet.</p></div><div class="checkout-actions">${q?.link?.kind==='shop'?action('Make another payment','restart'):''}<a class="checkout-button ghost" href="${CONSUMER_ORIGIN}/">Explore Lumo when you’re ready</a></div><p class="checkout-footnote">Your receipt stays available without signing up.</p>${recover(view)}`;
 }
 if(view.phase==='result'){
  const title={declined:'Payment declined.',cancelled:'Payment cancelled.',expired:'This payment expired.',failed:'Payment did not complete.',reversed:'Payment reversed.'}[a?.status]||'Payment not confirmed.';
  body=`<section class="checkout-status"><div class="checkout-status-mark" aria-hidden="true">${a?.status==='cancelled'?'×':'!'}</div><div class="checkout-eyebrow">${E(a?.status||'Not completed')}</div><h1>${title}</h1><p>${a?.status==='reversed'?'The provider returned this payment because the shop or request could no longer receive it. The merchant was not credited.':'The provider has not confirmed a successful collection. Check your phone before deciding whether to retry.'}</p>${a?.amount?`<div class="checkout-amount">${money(a.amount)}</div>`:''}</section>${sandbox(q)}${feedback}<p class="checkout-reference">Reference ${E(a?.reference||view.reference?.attemptId)}</p>${a?.status==='reversed'?`<dl class="checkout-summary"><div><dt>Provider reference</dt><dd>${E(a.providerReference)}</dd></div><div><dt>Reversal reference</dt><dd>${E(a.reversalReference||a.reversal?.reference)}</dd></div></dl>`:''}<div class="checkout-actions">${action('Check status again','check','secondary',busy||off?'disabled':'')}${action('Return to checkout','restart','primary',busy||off?'disabled':'')}</div>${recoveryActions(view)}${recover(view)}`;
 }
 if(view.phase==='unavailable'){
  const status=q?.link?.status,title={paid:'This request has been paid.',expired:'This payment link expired.',cancelled:'This request was cancelled.',paused:'This shop has paused payments.'}[status]||'This link is unavailable.';
  body=`<section class="checkout-status"><div class="checkout-status-mark" aria-hidden="true">◷</div><div class="checkout-eyebrow">Merchant payment</div><h1>${title}</h1><p>${status==='paid'?'A completed one-off request cannot be paid again. If you paid from this browser, reopen your private receipt link.':'Ask the merchant to check the shop or share a fresh payment link.'}</p></section>${q?.link?shopCard(q):''}${feedback}<div class="checkout-actions">${action('Check link again','reload','secondary',busy||off?'disabled':'')}<a class="checkout-button ghost" href="${CONSUMER_ORIGIN}/">Explore Lumo</a></div>${recover(view)}`;
 }
 return `<header class="checkout-brand"><a href="${CONSUMER_ORIGIN}/" aria-label="Explore Lumo">lumo</a><span>Merchant checkout</span></header>${body}<footer class="checkout-footnote">Powered by Lumo</footer>`;
}

export function mountGuestCheckout(root,options={}){
 let timer=null,lastPhase='',lastHTML='',controller;
 const render=view=>{
  const html=renderGuestCheckout(view);root.setAttribute('aria-busy',view.busy?'true':'false');if(html===lastHTML)return;lastHTML=html;
  const focused=root.ownerDocument.activeElement,focusedName=focused?.name,caret=focused?.selectionStart;
  const drafts={};for(const input of root.querySelectorAll('input,select'))if(input.name&&input.name!=='phone')drafts[input.name]=input.value;
  root.innerHTML=html;
  if(view.copyReceipt){const copy=root.querySelector('[data-receipt-copy]');if(copy)copy.textContent=controller.receiptText();}
  if(lastPhase===view.phase)for(const [name,value] of Object.entries(drafts)){const input=root.querySelector(`[name="${name}"]`);if(input)input.value=value;}
  if(lastPhase===view.phase&&focusedName&&focusedName!=='phone'){const input=root.querySelector(`[name="${focusedName}"]`);if(input){input.focus({preventScroll:true});try{input.setSelectionRange(caret,caret)}catch{}}}
  else if(lastPhase!==view.phase){root.ownerDocument.defaultView?.scrollTo({top:0,behavior:'instant'});const title=root.querySelector('h1');if(title){title.tabIndex=-1;title.focus({preventScroll:true});}}
  lastPhase=view.phase;
 };
 controller=createGuestCheckout({...options,onChange:render});
 async function click(event){
  const button=event.target.closest('[data-checkout-action]');if(!button||button.disabled||!root.contains(button))return;
  const name=button.dataset.checkoutAction;
  if(name==='choose-momo'){const amount=root.querySelector('[name="amount"]');if(amount)controller.setField('amount',amount.value);controller.chooseMoMo();}
  if(name==='back')controller.back();
  if(name==='resume')controller.resumeOriginal();
  if(name==='initiate')await controller.initiate();
  if(name==='check')await controller.check();
  if(name==='restart')await controller.restart();
  if(name==='reload')await controller.start();
  if(name.startsWith('sandbox-'))await controller.simulate(name.slice(8));
  if(name==='copy-recovery'){
   const value=controller.view().recoveryURL;if(!value)return;
   try{await navigator.clipboard.writeText(value);controller.setNotice('Receipt link copied. Keep it private so you can check this payment again.');}
   catch{controller.setNotice('Copy and keep this private receipt link: '+value);}
  }
  if(name==='copy-receipt'){
   const value=controller.receiptText();try{await navigator.clipboard.writeText(value);controller.setNotice('Receipt copied.');}catch{controller.toggleReceiptCopy();}
  }
 }
 async function submit(event){const form=event.target;if(form.dataset.checkoutForm!=='momo')return;event.preventDefault();const values=Object.fromEntries(new FormData(form));await controller.reviewPayment(values);}
 function input(event){if(event.target.name)controller.setField(event.target.name,event.target.value);}
 const online=()=>{controller.refreshOnline();if(controller.isPending())controller.check({background:true});};
 root.addEventListener('click',click);root.addEventListener('submit',submit);root.addEventListener('input',input);root.addEventListener('change',input);
 globalThis.addEventListener?.('online',online);globalThis.addEventListener?.('offline',online);
 timer=setInterval(()=>{if(controller.isPending()&&globalThis.navigator?.onLine!==false&&root.ownerDocument.visibilityState!=='hidden')controller.check({background:true});},5000);timer?.unref?.();
 controller.start();
 return {controller,dispose(){clearInterval(timer);controller.dispose();root.removeEventListener('click',click);root.removeEventListener('submit',submit);root.removeEventListener('input',input);root.removeEventListener('change',input);globalThis.removeEventListener?.('online',online);globalThis.removeEventListener?.('offline',online);}};
}
if(typeof document!=='undefined'){const root=document.getElementById('guest-checkout');if(root)mountGuestCheckout(root);}
