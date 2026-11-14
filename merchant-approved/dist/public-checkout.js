// Public merchant collections have their own transport. No consumer session,
// registered phone number or wallet is read by this checkout.
const CONFIG = Object.freeze({url:'https://iwutbrljiiodamtyoorg.supabase.co',key:'sb_publishable_4dmChQek8k-opkVhO4N_KA_TCGVjWi6'});
const CONSUMER_ORIGIN='https://lumo-connected-pilot.vercel.app';
const LUMO_DOWNLOAD_URL=CONSUMER_ORIGIN+'/downloads/Lumo-Test-Android.apk';
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
 let text=String(value??'').trim().replace(/[\s()-]/g,'').replace(/^(?:\+233|233)/,'0');
 if(/^[25]\d{8}$/.test(text))text='0'+text;
 return /^0[25]\d{8}$/.test(text)?text:'';
}
export function parseGuestLocation(value){
 const url=new URL(value,CONSUMER_ORIGIN),link=url.searchParams.get('link')||'';
 if(url.searchParams.has('testKey'))throw problem('This private pilot code is for signed-in Lumo users. Ask the merchant for a public payment link.','PRIVATE_LINK');
 let target=null;
 if(link){if(!TOKEN.test(link)||url.searchParams.getAll('link').length!==1||url.searchParams.has('pay')||url.searchParams.has('request'))throw problem('This payment link is incomplete. Ask the merchant to share it again.','INVALID_LINK');}
 else {const shopId=url.searchParams.get('pay'),requestId=url.searchParams.get('request');if(!UUID.test(shopId||'')||url.searchParams.getAll('pay').length!==1||url.searchParams.getAll('request').length>1||requestId!==null&&!UUID.test(requestId))throw problem('This payment link is incomplete. Ask the merchant to share it again.','INVALID_LINK');target={shopId,...(requestId?{requestId}:{})};}
 let recovery=null;
 if(url.hash){
  const part=new URLSearchParams(url.hash.slice(1)).get('receipt');
  if(part){const [attemptId,recoveryToken,...extra]=part.split('.');if(!link||extra.length||!UUID.test(attemptId||'')||!TOKEN.test(recoveryToken||''))throw problem('The receipt recovery link is incomplete. Reopen your original payment link.','INVALID_RECEIPT_LINK');recovery={attemptId,recoveryToken,link};}
 }
 return {link,recovery,...(target?{target}:{})};
}
export function guestReceiptURL(location,journal){
 if(!journal||!UUID.test(journal.attemptId||'')||!TOKEN.test(journal.recoveryToken||''))return '';
 const url=new URL('./checkout.html',location);url.search='';url.searchParams.set('link',journal.link);url.hash=new URLSearchParams({receipt:journal.attemptId+'.'+journal.recoveryToken}).toString();return url.href;
}
export function lumoCheckoutURL(quote){
 const link=quote?.link;if(!UUID.test(link?.shopId||''))return '';
 const url=new URL('/',CONSUMER_ORIGIN);url.searchParams.set('pay',link.shopId);url.searchParams.set('lumo','1');if(link.requestId){if(!UUID.test(link.requestId))return '';url.searchParams.set('request',link.requestId);}return url.href;
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
export function guestAvailabilityMessage(quote,network=''){
 const rows=quote?.serviceAvailability;if(!Array.isArray(rows))return '';
 const normalized=network==='airteltigo'?'at':network;
 const ids=['merchant_payment','momo_collection',...(normalized?['momo_collection_'+normalized]:[])];
 const blocked=rows.find(row=>ids.includes(row.serviceId||row.id)&&row.available===false);
 return blocked?(blocked.message||'Mobile money is temporarily unavailable. Please use another payment method or try again later.'):'';
}
function availabilitySignature(quote){return JSON.stringify((quote?.serviceAvailability||[]).map(row=>[row.serviceId||row.id,row.available,row.status,row.mode,row.message,row.providerMode,row.scheduledStart,row.scheduledEnd]));}
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

function checkedPayer(value,provider){
 const payer=value?.payer;
 if(value?.ok!==true||value.provider?.mode!==provider?.mode||!payer||!Object.hasOwn(NETWORKS,payer.network)||typeof payer.phoneMasked!=='string'||!payer.phoneMasked||payer.phoneMasked.length>30||typeof payer.registeredName!=='string'||!payer.registeredName.trim()||payer.registeredName.length>120)throw problem('We could not check that number. Try again before starting a payment.','INVALID_PAYER');
 if(provider.mode==='sandbox'&&(payer.lookupSource!=='sandbox-directory'||payer.networkVerified!==false||payer.nameVerified!==false))throw problem('The test number lookup could not be verified. Try again.','INVALID_PAYER');
 return clone(payer);
}

export function createGuestCheckout({api=createGuestAPI(),location=globalThis.location?.href||CONSUMER_ORIGIN+'/checkout.html',journal=createGuestJournal(),crypto:cryptoApi=globalThis.crypto,onChange=()=>{},online=()=>globalThis.navigator?.onLine!==false}={}){
 let link='',fragment=null,quote=null,provider=null,attempt=null,reference=null,phase='loading',busy=false,error='',notice='',amount='',phone='',network='',generation=0,disposed=false;
 let review=null,payer=null,copyReceipt=false,resuming=false,backgroundPending=null;
 const emit=()=>{if(!disposed)onChange(view())};
 const active=n=>!disposed&&n===generation;
 function view(){return clone({link,quote,provider,attempt,reference,phase,busy,error,notice,amount,phone:['overview','momo','review'].includes(phase)?phone:'',network,payer,review,copyReceipt,resuming,online:online(),recoveryURL:reference?guestReceiptURL(location,reference):''});}
 function usable(q=quote){return q?.link?.status==='open'&&(!q.link.expiresAt||Date.parse(q.link.expiresAt)>Date.now());}
 function payable(){return quote?.link?.amount??parseGuestAmount(amount);}
 const scope=q=>JSON.stringify([q?.link?.id,q?.link?.shopId,q?.link?.merchantName,q?.link?.shopName,q?.link?.amount,q?.link?.requestId,q?.currency,q?.fee]);
 async function loadQuote(){const value=checkedQuote(await api('quote',{link}));if(value.link.publicToken!==link)throw problem('The merchant link changed. Ask for a fresh link.','LINK_CHANGED');return value;}
 function installAttempt(value){attempt=checkedAttempt(value,reference,quote);provider=value.provider||quote?.provider||(value.sandbox===true?{mode:'sandbox',live:false}:null);phase=attempt.status==='confirmed'?'receipt':TERMINAL.has(attempt.status)?'result':'pending';phone='';payer=null;review=null;resuming=false;error='';}
 async function perform(work,{quiet=false}={}){
  if(busy||disposed)return;
  const epoch=generation,before=quiet?JSON.stringify(view()):null;busy=true;if(!quiet){error='';notice='';emit();}
  try{return await work(epoch)}catch(failure){if(active(epoch)){error=failure?.message||'Lumo could not complete that request.';if(reference&&(failure?.unknown||['RECEIPT_MISMATCH','ATTEMPT_NOT_FOUND','CHECKOUT_ATTEMPT_NOT_FOUND'].includes(failure.code)))phase='pending';}return null}
  finally{if(active(epoch)){busy=false;if(!quiet||before!==JSON.stringify(view()))emit()}}
 }
 async function start(){
  generation++;const epoch=generation;phase='loading';busy=true;error='';emit();
  try{const entry=parseGuestLocation(location);link=entry.link;fragment=entry.recovery;if(entry.target){const resolved=checkedQuote(await api('resolve',entry.target));if(!active(epoch))return;if(resolved.link.shopId!==entry.target.shopId||entry.target.requestId&&resolved.link.requestId!==entry.target.requestId)throw problem('The code does not match this receiving shop. Ask for a fresh code.','INVALID_QUOTE');link=resolved.link.publicToken;}reference=fragment||journal.read(link);if(fragment&&!journal.save(fragment))notice='This browser cannot save your receipt reference. Keep this receipt link before leaving.';
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
  if(name==='phone'){const next=String(value||'').slice(0,22);if(phone!==next){payer=null;network='';}phone=next;}
  if(name==='network')network=Object.hasOwn(NETWORKS,value)?value:'';
 }
 function chooseMoMo(){if(!usable()||reference)return;const unavailable=guestAvailabilityMessage(quote);if(unavailable){error=unavailable;emit();return;}if(!payable()){error='Enter an amount from GH₵0.01 to GH₵10,000.00.';emit();return;}phase='momo';error='';emit();}
 function back(){if(busy||reference&&!resuming)return;phase=phase==='review'?'momo':resuming?'pending':'overview';review=null;payer=null;error='';if(phase==='pending'){resuming=false;phone='';network='';}emit();}
 function resumeOriginal(){if(busy||!reference||attempt)return;resuming=true;phase='momo';phone='';network='';error='';notice='Enter the same number to resume your original request. Its payment reference will stay the same.';emit();}
 async function reviewPayment(values={}){
  if(values.amount!==undefined)setField('amount',values.amount);setField('phone',values.phone??phone);
  const normalized=normalizeGuestPhone(phone);
  if(!normalized){error='Enter your own valid Ghana mobile money number.';emit();return;}
  phone=normalized;
  return perform(async epoch=>{const fresh=await loadQuote();if(!active(epoch))return;quote=fresh;if(!usable()){phase='unavailable';return;}const unavailable=guestAvailabilityMessage(fresh);if(unavailable&&!resuming)throw problem(unavailable,'SERVICE_PAUSED',{noMutation:true});const selected=resuming?reference.amount:payable();if(!selected||selected>1000000)throw problem('Enter an amount from GH₵0.01 to GH₵10,000.00.','INVALID_AMOUNT');if(resuming&&(fresh.link.shopId!==reference.shopId||fresh.link.amount!==null&&fresh.link.amount!==reference.amount||fresh.fee!==reference.fee))throw problem('The original request details changed. Keep your original reference and check its status.','QUOTE_CHANGED');const lookup=await api('lookup',{link,phone:normalized});if(!active(epoch))return;payer=checkedPayer(lookup,fresh.provider);network=payer.network;const networkUnavailable=guestAvailabilityMessage(fresh,network);if(networkUnavailable&&!resuming)throw problem(networkUnavailable,'SERVICE_PAUSED',{noMutation:true});review={amount:selected,fee:fresh.fee,total:selected+fresh.fee,scope:scope(fresh)};phase='review';});
 }
 async function initiate(){
  if(phase!=='review'||!review||!payer||reference&&!resuming)return;
  if(!online()){error='Reconnect before starting a payment. No new request has been sent.';emit();return;}
  return perform(async epoch=>{
   const fresh=await loadQuote();if(!active(epoch))return;
   if(!usable(fresh)){quote=fresh;phase='unavailable';return;}
   if(scope(fresh)!==review.scope){quote=fresh;review=null;phase='momo';throw problem('The merchant details or charges changed. Review them again before paying.','QUOTE_CHANGED');}
   quote=fresh;const unavailable=guestAvailabilityMessage(fresh,network);if(unavailable&&!resuming)throw problem(unavailable,'SERVICE_PAUSED',{noMutation:true});const intended=resuming?reference:{link,attemptId:newAttemptId(cryptoApi),recoveryToken:secretToken(cryptoApi),amount:review.amount,fee:review.fee,shopId:fresh.link.shopId,createdAt:new Date().toISOString()};
   if(!journal.save(intended))throw problem('This browser could not safely save your payment reference. No charge was started. Open the link in your phone’s browser and try again.','REFERENCE_UNAVAILABLE');
   reference=intended;const enteredPhone=phone;phone='';payer=null;phase='pending';emit();
   try{const result=await api('initiate',{link,amount:intended.amount,phone:enteredPhone,attemptId:intended.attemptId,recoveryToken:intended.recoveryToken});if(active(epoch))installAttempt(result);}
   catch(failure){if(active(epoch)&&!resuming&&failure.noMutation===true&&['INVALID_INPUT','AMOUNT_CHANGED','LINK_UNAVAILABLE','SHOP_UNAVAILABLE','REQUEST_PROCESSING','SERVICE_PAUSED'].includes(failure.code)&&journal.clear(link)){reference=null;attempt=null;review=null;phase=['LINK_UNAVAILABLE','SHOP_UNAVAILABLE'].includes(failure.code)?'unavailable':'overview';}throw failure;}
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
  const previous=reference;return perform(async epoch=>{const fresh=await loadQuote();if(!active(epoch))return;quote=fresh;if(!usable()){phase='unavailable';return;}if(previous&&!journal.clear(link))throw problem('This browser could not clear the completed payment reference. Keep your receipt and reopen the link in your browser.','REFERENCE_UNAVAILABLE');reference=null;attempt=null;phone='';network='';payer=null;amount='';review=null;copyReceipt=false;phase='overview';});
 }
 function receiptText(){const r=attempt?.receipt;if(attempt?.status!=='confirmed'||!r)return '';const refunds=Array.isArray(r.refunds)?r.refunds:[];return ['Lumo merchant receipt',quote?.provider?.mode==='sandbox'?'SANDBOX · Test money. No mobile money was charged.':'',r.merchantName,r.shopName,money(r.amount),readableDate(r.confirmedAt),'Reference: '+r.reference,'Mobile money reference: '+r.providerReference,...refunds.map(refund=>`Refund ${money(refund.amount)} · ${refundStatus(refund.status)} · ${refund.reference||refund.providerReference||''}`)].filter(Boolean).join('\n');}
 async function refreshAvailability(){if(disposed||busy||reference||!link)return;const epoch=generation;try{const fresh=await loadQuote();if(active(epoch)){const previous=availabilitySignature(quote),previousMessage=guestAvailabilityMessage(quote,network);quote=fresh;if(previousMessage&&error===previousMessage&&!guestAvailabilityMessage(fresh,network))error='';if(previous!==availabilitySignature(fresh))emit();}}catch{}}
 return {refreshAvailability,start,view,setField,chooseMoMo,back,resumeOriginal,reviewPayment,showInvite(){if(!busy&&phase==='receipt'&&attempt?.status==='confirmed'&&attempt.receipt){phase='invite';emit()}},showReceipt(){if(phase==='invite'&&attempt?.status==='confirmed'){phase='receipt';emit()}},initiate,check,simulate,restart,receiptText,toggleReceiptCopy(){copyReceipt=!copyReceipt;emit()},setNotice(value){notice=value;emit()},dispose(){disposed=true;generation++},isPending:()=>!busy&&reference&&['pending','processing'].includes(attempt?.status),refreshOnline(){emit()}};
}

const action=(label,name,kind='secondary',extra='')=>`<button type="button" class="checkout-button ${kind}" data-checkout-action="${name}" ${extra}>${label}</button>`;
const arrow='<svg viewBox="0 0 24 24" width="20" height="20" fill="none" aria-hidden="true"><path d="M5 12h14m-6-6 6 6-6 6" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>';
const lock='<svg viewBox="0 0 20 20" width="14" height="14" fill="none" aria-hidden="true"><rect x="4.5" y="8.5" width="11" height="8" rx="2" stroke="currentColor"/><path d="M7 8.5V6a3 3 0 0 1 6 0v2.5" stroke="currentColor"/></svg>';
const backButton=(label='Back')=>`<button type="button" class="checkout-back" data-checkout-action="back"><span aria-hidden="true">←</span> ${label}</button>`;
const isTest=q=>q?.provider?.mode==='sandbox';
function shopCard(q){return `<div class="checkout-shop"><span class="checkout-shop-mark" aria-hidden="true"><svg viewBox="0 0 24 24" width="21" height="21" fill="none"><path d="M4 10v10h16V10M3 10l2-6h14l2 6M3 10a3 3 0 0 0 4.5 2.5 3 3 0 0 0 4.5 0 3 3 0 0 0 4.5 0A3 3 0 0 0 21 10M9 20v-5h6v5" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg></span><div><strong>${E(q?.link?.merchantName||'Merchant')}</strong><p>${E(q?.link?.shopName||'Receiving shop')}</p></div></div>`;}
function sandbox(q){return isTest(q)?'<p class="checkout-sandbox">Test money only. No real MoMo is charged.</p>':'';}
function heroAmount(amount,caption='You’re paying'){return `<div class="checkout-pay-amount"><p class="checkout-eyebrow">${caption}</p><div class="checkout-amount">${money(amount)}</div></div>`;}
function amountField(view,q){const fixed=q.link.amount!==null;return fixed?`${heroAmount(q.link.amount)}<p class="checkout-amount-caption">${lock} Amount set by the merchant</p>`:`<label class="checkout-pay-amount checkout-edit-amount"><span class="checkout-eyebrow">How much are you paying?</span><span class="checkout-amount-field"><span>GH₵</span><input name="amount" inputmode="decimal" autocomplete="off" value="${E(view.amount)}" placeholder="0.00" aria-label="Amount to pay in Ghana cedis" maxlength="10" required></span></label>`;}
function phoneField(view){return `<label class="checkout-field"><span>Your MoMo number</span><input name="phone" type="tel" inputmode="tel" autocomplete="tel-national" placeholder="024 123 4567" value="${E(view.phone)}" maxlength="22" required aria-describedby="checkout-phone-help"><small id="checkout-phone-help">We’ll find the network and account name. Never enter a MoMo PIN here.</small></label>`;}
function payerSummary(view){
 const p=view.payer;if(!p)return '';const sample=isTest(view.quote),unverified=!sample&&p.nameVerified!==true;
 return `<dl class="checkout-payer-details"><div><dt>Paying from</dt><dd>${E(p.phoneMasked)}</dd></div><div><dt>Network</dt><dd>${E(p.networkLabel||NETWORKS[p.network])}</dd></div><div><dt>Account name${unverified?' (unverified)':''}</dt><dd>${E(p.registeredName)}</dd></div></dl>${sample?'<p class="checkout-lookup-note">Network and account name are sample test data, not verified customer details.</p>':''}`;
}
function celebration(){return `<div class="checkout-celebration" aria-hidden="true">${Array.from({length:12},(_,i)=>`<i style="--n:${i}"></i>`).join('')}<span class="checkout-success-orbit"></span><img src="./assets/lux-chat-2d.webp" width="104" height="104" alt=""><span class="checkout-success-tick">✓</span><span class="checkout-spark spark-one">✦</span><span class="checkout-spark spark-two">✦</span></div>`;}
function recover(view){return `<details class="checkout-expand checkout-help"><summary>Need a hand?</summary><p>In WhatsApp or Instagram, use the menu to open this page in your phone’s browser. Never enter a MoMo PIN here.</p>${view.recoveryURL?`<a href="${E(view.recoveryURL)}" target="_blank" rel="noopener noreferrer">Open your private receipt link</a><p>Keep this link private. It gives access to your payment status and receipt.</p>`:''}</details>`;}
function recoveryActions(view){return view.reference?`<div class="checkout-receipt-actions">${action('Save receipt link','copy-recovery')}${action('Check payment','check','secondary',view.busy?'disabled':'')}</div><p class="checkout-footnote">Your private receipt link keeps this payment easy to find.</p>`:'';}
function receiptDetails(view){const a=view.attempt,r=a.receipt,refunds=Array.isArray(r.refunds)?r.refunds:[];return `<details class="checkout-expand checkout-receipt-detail"><summary>View your receipt <span aria-hidden="true">↗</span></summary><dl class="checkout-summary"><div><dt>Paid to</dt><dd>${E(r.merchantName)}<br><small>${E(r.shopName)}</small></dd></div><div><dt>Amount</dt><dd>${money(r.amount)}</dd></div><div><dt>Receipt reference</dt><dd>${E(r.reference)}</dd></div><div><dt>Confirmed</dt><dd>${E(readableDate(r.confirmedAt))}</dd></div><div><dt>MoMo reference</dt><dd>${E(r.providerReference)}</dd></div>${a.phoneMasked?`<div><dt>Paid from</dt><dd>${E(a.phoneMasked)}</dd></div>`:''}${refunds.map(refund=>`<div><dt>Refund · ${E(refundStatus(refund.status))}</dt><dd>${money(refund.amount)}${refund.reference?`<br><small>${E(refund.reference)}</small>`:''}</dd></div>`).join('')}</dl><div class="checkout-receipt-actions">${action('Save receipt link','copy-recovery')}${action('Copy receipt','copy-receipt')}</div>${view.copyReceipt?'<p class="checkout-notice">Copy the receipt details below.</p><pre class="checkout-receipt-copy" tabindex="0" data-receipt-copy></pre>':''}<p class="checkout-receipt-help">Need a refund? Give the merchant your receipt reference. Approved refunds return through the original MoMo payment. You don’t need a Lumo account.</p></details>`;}
export function renderGuestCheckout(view){
 const q=view.quote||(view.provider?{provider:view.provider}:null),a=view.attempt,busy=view.busy,off=view.online===false,test=isTest(q);
 const paused=guestAvailabilityMessage(q,view.network);
 const feedback=`${paused&&!view.reference?`<div class="checkout-notice" role="status">${E(paused)}</div>`:''}${view.error?`<div class="checkout-error" role="alert">${E(view.error)}</div>`:''}${view.notice?`<div class="checkout-notice" role="status">${E(view.notice)}</div>`:''}${off?'<div class="checkout-notice" role="status">You’re offline. Reconnect to check this payment. Your original reference is kept.</div>':''}`;
 let body='';
 if(view.phase==='loading')body='<section class="checkout-loading"><span class="checkout-spinner" aria-hidden="true"></span><h1>A moment, please.</h1><p>Getting your payment ready.</p></section>';
 if(view.phase==='overview'||view.phase==='momo'){
  const lumo=lumoCheckoutURL(q),resuming=view.resuming,merchantPaused=q?.serviceAvailability?.some(row=>(row.serviceId||row.id)==='merchant_payment'&&row.available===false);
  body=`<section class="checkout-entry"><h1>Pay ${E(q?.link?.merchantName||'this merchant')}.</h1>${shopCard(q)}${feedback}<form class="checkout-form" data-checkout-form="momo"><div class="checkout-amount-panel">${resuming?heroAmount(view.reference.amount,'Your original payment'):amountField(view,q)}${q.link.description?`<p class="checkout-order-note">${E(q.link.description)}</p>`:''}</div>${phoneField(view)}<div class="checkout-action-group"><button type="submit" class="checkout-button primary" ${busy||off||paused&&!resuming?'disabled':''}>${busy?'Checking your number…':paused&&!resuming?'Mobile money temporarily unavailable':'Continue'}${busy?'<span class="checkout-spinner" aria-hidden="true"></span>':''}</button>${sandbox(q)}<p class="checkout-pin-note">No Lumo account needed.</p></div></form>${lumo&&!resuming?merchantPaused?'<span class="checkout-lumo-option" aria-disabled="true">Lumo payments temporarily unavailable</span>':`<a class="checkout-lumo-option" href="${E(lumo)}">Already with Lumo? Pay from your account ${arrow}</a>`:''}</section>${recover(view)}`;
 }
 if(view.phase==='review')body=`<section class="checkout-review"><h1>Ready to pay?</h1>${shopCard(q)}${feedback}<div class="checkout-review-panel">${heroAmount(view.review.total,'Total to pay')}${payerSummary(view)}<dl class="checkout-summary checkout-fees">${view.review.fee?`<div><dt>Payment</dt><dd>${money(view.review.amount)}</dd></div>`:''}<div><dt>Checkout fee</dt><dd>${money(view.review.fee)}</dd></div></dl></div><div class="checkout-actions">${action(busy?'Sending request…':view.resuming?'Resume original test request':test?`Try paying ${money(view.review.total)}`:`Pay ${money(view.review.total)}`,'initiate','primary',busy||off||paused&&!view.resuming?'disabled':'')}${action('Change number','back','text',busy?'disabled':'')}${sandbox(q)}</div><p class="checkout-footnote">${test?'Next, try the approval step. No prompt is sent to your phone.':'Approve the request on your phone. Your MoMo PIN stays with your provider.'}</p></section>${recover(view)}`;
 if(view.phase==='pending'){
  const simulated=test&&a&&['pending','processing'].includes(a.status);
  body=`<section class="checkout-status checkout-pending"><div class="checkout-status-mark" aria-hidden="true"><svg viewBox="0 0 24 24" width="30" height="30" fill="none"><rect x="6" y="2" width="12" height="20" rx="3" stroke="currentColor" stroke-width="1.6"/><path d="M10 18h4" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/></svg></div><h1>${simulated?'One last step.':a?'Check your phone.':'Let’s check that payment.'}</h1><p>${simulated?'In this pilot, try approving below. No MoMo prompt is sent.':!a?'We could not confirm the outcome. Check this original payment before trying again.':'Approve the request on your phone, then wait for confirmation here.'}</p><div class="checkout-pending-panel">${view.reference?.amount?heroAmount(view.reference.amount,'To '+E(q?.link?.merchantName||'the merchant')):''}${a?.phoneMasked?`<p class="checkout-pending-number">${E(a.phoneMasked)}</p>`:''}</div></section>${feedback}${simulated?`<div class="checkout-actions">${action(busy?'Confirming…':'Approve test payment','sandbox-approve','primary',busy||off?'disabled':'')}${sandbox(q)}</div><details class="checkout-expand checkout-simulation"><summary>Try a different test outcome</summary><div class="checkout-simulation-grid">${[['delay','Keep pending'],['decline','Decline payment'],['cancel','Cancel payment']].map(([result,label])=>action(label,'sandbox-'+result,'secondary',busy||off?'disabled':'')).join('')}</div></details>`:`<div class="checkout-actions">${action(busy?'Checking…':'Check payment status','check','primary',busy||off?'disabled':'')}</div>${sandbox(q)}`}${!a?`<div class="checkout-actions">${action('Resume original request','resume','secondary',busy||off||!view.reference?.amount?'disabled':'')}</div>`:''}<details class="checkout-expand"><summary>Payment reference & help</summary><p class="checkout-reference">${E(a?.reference||view.reference?.attemptId)}</p>${recoveryActions(view)}</details>${recover(view)}`;
 }
 if(view.phase==='receipt'){
  const r=a.receipt;
  body=`<section class="checkout-status checkout-success">${celebration()}<p class="checkout-confirmed"><span aria-hidden="true">✓</span> ${test?'Test payment confirmed':'Payment confirmed'}</p><h1>All sorted.</h1>${heroAmount(r.amount,'Paid to '+E(r.merchantName))}<p class="checkout-success-shop">${E(r.shopName)}</p>${sandbox(q)}</section>${feedback}<section class="checkout-welcome-card" aria-label="You’re invited to Lumo"><h2>Know what’s yours to spend.</h2><p>See what’s left after your plans.<br>Make your next money decision with clarity.</p>${action('Meet Lumo','invite','primary')}<small>Your receipt stays here. Joining is up to you.</small></section>${receiptDetails(view)}${q?.link?.kind==='shop'?`<div class="checkout-restart">${action('Make another payment','restart','text')}</div>`:''}`;
 }
 if(view.phase==='invite'&&a?.status==='confirmed'&&a.receipt){
  body=`<section class="checkout-invite"><div class="checkout-invite-art"><img src="./assets/lux-chat-2d.webp" width="106" height="106" alt="Lux, your Lumo money buddy"></div><h1>Your money.<br>Clear before you spend.</h1><p class="checkout-invite-lead">Meet Lux, your money buddy.<br>Understand what you have, what you’ve planned, and what your next payment could mean.</p><ul class="checkout-benefits"><li><span aria-hidden="true">↗</span><div><strong>See what’s really available.</strong><small>Know what’s left after essentials and the plans you’ve made.</small></div></li><li><span aria-hidden="true">✦</span><div><strong>Ask Lux about your money.</strong><small>Ask where it went or how long it could last.</small></div></li><li><span aria-hidden="true">✓</span><div><strong>Pause when it matters.</strong><small>See what your next payment means before you go ahead.</small></div></li></ul><div class="checkout-invite-actions"><a class="checkout-button primary" href="${LUMO_DOWNLOAD_URL}" download="Lumo-Test-Android.apk">Download Lumo</a><p class="checkout-invite-pilot">Android pilot · Test money · APK download</p><a class="checkout-button ghost" href="${CONSUMER_ORIGIN}/">Try Lumo in your browser</a>${action('Maybe later. Back to my receipt.','receipt','text')}</div></section>${feedback}`;
 }
 if(view.phase==='result'){
  const title={declined:'That didn’t go through.',cancelled:'Payment cancelled.',expired:'This payment expired.',failed:'That didn’t go through.',reversed:'Payment returned.'}[a?.status]||'Let’s check this payment.';
  body=`<section class="checkout-status"><div class="checkout-status-mark" aria-hidden="true">${a?.status==='cancelled'?'×':'!'}</div><p class="checkout-eyebrow">${E(a?.status||'Not completed')}</p><h1>${title}</h1><p>${a?.status==='reversed'?'This shop or request could no longer receive the payment. The provider returned it.':'No successful payment has been confirmed. Check your phone before trying again.'}</p>${a?.amount?`<div class="checkout-amount compact">${money(a.amount)}</div>`:''}</section>${sandbox(q)}${feedback}<p class="checkout-reference">${E(a?.reference||view.reference?.attemptId)}</p>${a?.status==='reversed'?`<dl class="checkout-summary"><div><dt>Provider reference</dt><dd>${E(a.providerReference)}</dd></div><div><dt>Reversal reference</dt><dd>${E(a.reversalReference||a.reversal?.reference)}</dd></div></dl>`:''}<div class="checkout-actions">${action('Check status again','check','secondary',busy||off?'disabled':'')}${action('Back to checkout','restart','primary',busy||off?'disabled':'')}</div>${recoveryActions(view)}${recover(view)}`;
 }
 if(view.phase==='unavailable'){
  const status=q?.link?.status,title={paid:'Already taken care of.',expired:'This link has expired.',cancelled:'This request was cancelled.',paused:'This shop has paused payments.'}[status]||'Let’s get you a fresh link.';
  body=`<section class="checkout-status"><div class="checkout-status-mark" aria-hidden="true">↗</div><p class="checkout-eyebrow">MERCHANT PAYMENT</p><h1>${title}</h1><p>${status==='paid'?'This one-off request has already been paid. Use your private receipt link if you paid from another browser.':'Ask the merchant to show a new QR or share a current payment link.'}</p></section>${q?.link?shopCard(q):''}${feedback}<div class="checkout-actions">${action('Check link again','reload','secondary',busy||off?'disabled':'')}<a class="checkout-button ghost" href="${CONSUMER_ORIGIN}/">Explore Lumo ${arrow}</a></div>${recover(view)}`;
 }
 const titles={loading:'Merchant payment',overview:'Pay a merchant',momo:'Pay a merchant',review:'Review payment',pending:'Confirm payment',receipt:'Payment complete',invite:'Meet Lumo',result:'Payment status',unavailable:'Merchant payment'};
 const back=['review','momo','invite'].includes(view.phase)?`<button type="button" class="checkout-back" data-checkout-action="${view.phase==='invite'?'receipt':'back'}" aria-label="${view.phase==='invite'?'Back to your receipt':'Back'}" ${busy?'disabled':''}><span aria-hidden="true">←</span></button>`:'<span class="checkout-head-spacer"></span>';
 return `<header class="checkout-brand"><a href="${CONSUMER_ORIGIN}/" aria-label="Explore Lumo">lumo</a><span class="checkout-mode">${test?'Test money':'Guest payment'}</span></header><div class="checkout-page-head">${back}<span>${titles[view.phase]||'Merchant payment'}</span><span class="checkout-head-spacer"></span></div><div class="checkout-content" data-checkout-phase="${E(view.phase)}">${body}</div>`;
}

export function mountGuestCheckout(root,options={}){
 let timer=null,lastPhase='',lastHTML='',controller,celebratedAttempt='';
 const render=view=>{
  const html=renderGuestCheckout(view);root.setAttribute('aria-busy',view.busy?'true':'false');if(html===lastHTML)return;lastHTML=html;
  const focused=root.ownerDocument.activeElement,focusedName=focused?.name,caret=focused?.selectionStart;
  const drafts={};for(const input of root.querySelectorAll('input,select'))if(input.name&&input.name!=='phone')drafts[input.name]=input.value;
  root.innerHTML=html;
  if(view.phase==='receipt'&&view.attempt?.status==='confirmed'&&celebratedAttempt!==view.attempt.id){root.querySelector('.checkout-celebration')?.classList.add('is-new');celebratedAttempt=view.attempt.id;}
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
  if(name==='invite')controller.showInvite();
  if(name==='receipt')controller.showReceipt();
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
 timer=setInterval(()=>{if(globalThis.navigator?.onLine===false||root.ownerDocument.visibilityState==='hidden')return;if(controller.isPending())controller.check({background:true});else controller.refreshAvailability();},5000);timer?.unref?.();
 controller.start();
 return {controller,dispose(){clearInterval(timer);controller.dispose();root.removeEventListener('click',click);root.removeEventListener('submit',submit);root.removeEventListener('input',input);root.removeEventListener('change',input);globalThis.removeEventListener?.('online',online);globalThis.removeEventListener?.('offline',online);}};
}
if(typeof document!=='undefined'){let preference='dark';try{preference=localStorage.getItem('lumo-appearance-v1')||'dark'}catch{}const light=preference==='light'||preference==='system'&&globalThis.matchMedia?.('(prefers-color-scheme: light)').matches;document.documentElement.dataset.theme=light?'light':'dark';document.documentElement.style.colorScheme=light?'light':'dark';const root=document.getElementById('guest-checkout');if(root)mountGuestCheckout(root);}
