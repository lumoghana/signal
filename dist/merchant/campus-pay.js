const E=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const money=value=>`GH₵${(Number(value||0)/100).toLocaleString('en-GH',{minimumFractionDigits:2,maximumFractionDigits:2})}`;
const array=value=>Array.isArray(value)?value:[];
const displayDate=value=>value&&Number.isFinite(new Date(value).getTime())?new Date(value).toLocaleString('en-GH',{timeZone:'Africa/Accra',day:'numeric',month:'short',hour:'2-digit',minute:'2-digit'}):'Just now';
const icon=name=>`<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${({close:'<path d="m6 6 12 12M6 18 18 6"/>',check:'<path d="m5 12 4 4L19 6"/>',wallet:'<path d="M3 7V5a2 2 0 0 1 2-2h13v4M3 7h18v14H3zM15 11h6v6h-6z"/>',shop:'<path d="M3 10h18M4 10v11h16V10M2 10l3-7h14l3 7M9 21v-7h6v7"/>',arrow:'<path d="M5 12h14m-5-5 5 5-5 5"/>',clock:'<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',back:'<path d="M19 12H5m5-5-5 5 5 5"/>',shield:'<path d="m12 2 9 4v6c0 6-9 10-9 10S3 18 3 12V6z"/><path d="m8 12 3 3 5-6"/>'})[name]||''}</svg>`;
const btn=(label,action,style='secondary',extra='')=>`<button class="btn ${style}" type="button" data-action="campus-pay-${action}" ${extra}>${label}</button>`;
const PENDING_KEY='lumo-campus-payment-attempt-v1';
const FUND_KEY='lumo-campus-funding-attempt-v1';
// These server errors occur only before a new attempt can debit the wallet.
// Unknown conflicts and transport failures keep the reference for safe checking.
const NO_DEBIT_CODES=new Set(['SHOP_PAUSED','REQUEST_STAFF_CHANGED','REQUEST_EXCEEDS_LIMIT','REQUEST_UNAVAILABLE','RECIPIENT_MISMATCH','MERCHANT_NOT_FOUND']);
const rejectedBeforeDebit=error=>Number.isInteger(error?.status)&&error.status>=400&&error.status<500&&NO_DEBIT_CODES.has(error.code);
export function parseCampusAmount(value,{funding=false}={}){
 const text=String(value??'').trim();
 if(!/^\d+(?:\.\d{1,2})?$/.test(text))throw new Error('Enter an amount in cedis, with no more than two decimal places.');
 const [whole,fraction='']=text.split('.'),amount=Number(whole)*100+Number(fraction.padEnd(2,'0'));
 const limit=funding?100000:1000000;
 if(!Number.isSafeInteger(amount)||amount<=0||amount>limit)throw new Error(`Use an amount between GH₵0.01 and ${funding?'GH₵1,000.00 per test-money addition':'GH₵10,000.00 per demo payment'}.`);
 return amount;
}
const storageFailure=()=>Object.assign(new Error('This browser could not safely save the payment reference. No new payment or test-money addition was sent. Enable browser storage and try again.'),{code:'PENDING_STORAGE_UNAVAILABLE'});
const recordId=value=>value?.payload?.attemptId||value?.attemptId;
function readAttempt(key,valid,{strict=false}={}){
 try{const storage=globalThis.sessionStorage;if(!storage?.getItem)throw storageFailure();const raw=storage.getItem(key);if(!raw)return null;const value=JSON.parse(raw);if(!valid(value))throw storageFailure();return value}catch(e){if(strict)throw storageFailure();return null}
}
const validPayment=value=>Boolean(value?.payload?.attemptId&&value.payload.shopId);
const validFund=value=>Boolean(value?.attemptId&&Number.isSafeInteger(value.amount));
const readPending=options=>readAttempt(PENDING_KEY,validPayment,options);
const readFund=options=>readAttempt(FUND_KEY,validFund,options);
function saveAttempt(key,value,read){
 try{
  const storage=globalThis.sessionStorage;if(!storage?.setItem||!storage?.getItem)throw storageFailure();
  const existing=read({strict:true});if(existing&&recordId(existing)!==recordId(value))throw storageFailure();
  const encoded=JSON.stringify(value);storage.setItem(key,encoded);if(storage.getItem(key)!==encoded)throw storageFailure();
 }catch{throw storageFailure()}
}
const writePending=value=>saveAttempt(PENDING_KEY,value,readPending);
const writeFund=value=>saveAttempt(FUND_KEY,value,readFund);
function clearAttempt(key,reference,read){
 if(!reference)return false;
 try{const existing=read({strict:true});if(existing&&recordId(existing)===reference){globalThis.sessionStorage.removeItem(key);return globalThis.sessionStorage.getItem(key)===null}return !existing}catch{return false}
}
const newId=()=>globalThis.crypto?.randomUUID?.()||`attempt-${Date.now()}-${Math.random().toString(36).slice(2)}`;
export function createCampusPay(config={}){
 let active=false,view='wallet',busy=false,error='',notice='',student=null,quote=null,intent=null,attempt=null,receipt=null,lastStage='',amount='',name='',fundAmount='25.00',fundAttempt=readFund(),generation=0,blockedRequest=null;
 let historyRows=[],historyMeta={nextCursor:null,total:0,limit:25},historyWallet=null,historyBusy=false,historyEpoch=0,historyRequest=0;
 let requestOrder=0,coreWallet=null,coreRevision=-1,coreOrder=-1;const responseOrders=new WeakMap();
 if(fundAttempt)fundAmount=(fundAttempt.amount/100).toFixed(2);
 const api=async(path,options)=>{const order=++requestOrder,result=await config.api(path,options);if(result&&typeof result==='object')responseOrders.set(result,order);return result};
 const history=()=>historyRows.slice();
 const balance=()=>Number(student?.balance??student?.wallet?.balance??0);
 const redraw=()=>{config.onRender?.();if(lastStage!==view){lastStage=view;globalThis.requestAnimationFrame?.(()=>{const node=globalThis.document?.querySelector?.('.campus-pay-modal [autofocus]')||globalThis.document?.querySelector?.('#campus-pay-heading');node?.focus?.({preventScroll:true})})}};
 const message=e=>e?.message||'We could not complete that request. Please try again.';
 function clearPayment(reference){clearAttempt(PENDING_KEY,reference,readPending);if(attempt?.payload?.attemptId===reference)attempt=null}
 function clearFunding(reference){clearAttempt(FUND_KEY,reference,readFund);if(fundAttempt?.attemptId===reference)fundAttempt=null}
 function restorePayment(){const saved=readPending();attempt=attempt?.submitted?attempt:saved?.submitted?saved:null}
 const attemptWallet=record=>record?.walletId||record?.payload?.walletId||null;
 function walletChanged(record,kind='payment'){
  const error=new Error(attemptWallet(record)?'This saved request belongs to a different student wallet. No request was sent from the current wallet.':'This older saved request has no wallet identity. It cannot be retried safely from this wallet.');
  error.code='WALLET_CHANGED';error.savedRequest={record,kind};return error;
 }
 function requireWallet(record,kind='payment'){
  const expected=attemptWallet(record);if(!expected||expected!==student?.id)throw walletChanged(record,kind);return expected;
 }
 function showWalletChanged(failure,record=attempt,kind='payment'){
  blockedRequest=failure?.savedRequest||{record,kind};view='wallet-changed';error=message(failure);notice='';busy=false;redraw();
 }
 function checkSavedWallets(){
  if(attempt?.submitted)requireWallet(attempt);
  if(fundAttempt){
   // A legacy funding entry in this wallet is an authoritative completed outcome,
   // but an unbound saved request must never be submitted as a new addition.
   if(!attemptWallet(fundAttempt)&&history().some(entry=>entry.type==='test-funding'&&entry.attemptId===fundAttempt.attemptId))clearFunding(fundAttempt.attemptId);
   else requireWallet(fundAttempt,'funding');
  }
 }

 const entryKey=item=>item.id||[item.type,item.reference,item.transactionId,item.createdAt,item.amount].join('|');
 const setStudent=(result,{appendHistory=false,preserveHistory=false}={})=>{
  const incoming=result?.student!==undefined?result.student:result?.wallet||result?.balance!==undefined?result:undefined;
  if(incoming===undefined)return student;
  const walletId=incoming?.id||null,sameWallet=historyWallet===walletId;
  // A cursor page may extend this wallet's history, but can never switch wallets.
  if(appendHistory&&(!walletId||walletId!==student?.id||!sameWallet))return student;
  const revision=Number.isSafeInteger(result?.revision)?result.revision:null,order=responseOrders.get(result)||0;
  const newWallet=coreWallet!==walletId;
  const acceptCore=newWallet?order>=coreOrder:(revision===null?coreRevision<0&&order>=coreOrder:revision>coreRevision||revision===coreRevision&&order>=coreOrder);
  if(acceptCore){student=incoming;name=student?.name||name;coreWallet=walletId;coreRevision=revision??-1;coreOrder=order;}
  const rows=array(result?.entries||incoming?.entries||incoming?.transactions||incoming?.activity);
  const meta=result?.history||incoming?.historyPage||incoming?.history;
  const page=meta&&typeof meta==='object'&&!Array.isArray(meta)?{nextCursor:meta.nextCursor||null,total:Number(meta.total)||rows.length,limit:Number(meta.limit)||25}:{nextCursor:null,total:rows.length,limit:25};
  // A delayed old head must not discard a newer head or its pagination state.
  if(!acceptCore&&!appendHistory)return student;
  if(!appendHistory&&(!preserveHistory||!sameWallet)){
   historyRows=[];historyEpoch++;
  }
  const keepTail=preserveHistory&&sameWallet&&historyRows.length>0;
  const byId=new Map(historyRows.map(entry=>[entryKey(entry),entry]));
  for(const entry of rows)if(acceptCore||!byId.has(entryKey(entry)))byId.set(entryKey(entry),entry);
  historyRows=[...byId.values()].sort((a,b)=>String(b.createdAt||b.confirmedAt||'').localeCompare(String(a.createdAt||a.confirmedAt||''))||String(entryKey(b)).localeCompare(String(entryKey(a))));
  historyWallet=walletId;
  if(appendHistory){
   // Cursor position comes from the requested tail; balance and total can be newer.
   historyMeta={...historyMeta,nextCursor:page.nextCursor,total:Math.max(historyMeta.total,page.total,historyRows.length),limit:page.limit};
  }else if(keepTail){
   historyMeta={...historyMeta,total:Math.max(page.total,historyRows.length)};
  }else historyMeta={...page,total:Math.max(page.total,historyRows.length)};
  return student;
 };
 const setError=e=>{error=message(e);notice='';busy=false;redraw()};
 const summary=()=>quote||attempt?.context||{};
 const shop=()=>summary().shop||{};
 const business=()=>summary().business||{};
 const label=()=>`${business().name||'Merchant'} · ${shop().name||'Shop'}`;
 const exactAmount=()=>Number(quote?.request?.amount??quote?.amount??0);
 const currentReceipt=result=>result?.payment||result?.receipt||result?.transaction||result;
 function knownReceipt(){if(attemptWallet(attempt)&&attemptWallet(attempt)!==student?.id)return null;const entry=history().find(item=>item.type==='merchant-payment'&&item.attemptId===attempt?.payload?.attemptId&&item.shopId===attempt?.payload?.shopId&&Math.abs(item.amount)===attempt?.payload?.amount);return entry?{...entry,amount:Math.abs(entry.amount)}:null}
 async function fetchStudent(current=generation,options={}){const result=await api('/api/student');if(current===generation)setStudent(result,options);return student}
 function resolveReceipt(value){
  if(!value)return false;
  const status=String(value.status||'');
  if(['paid','confirmed','completed'].includes(status)){
   quote ||= attempt?.context;receipt=value;view='success';error='';notice='';clearPayment(attempt?.payload?.attemptId);intent=null;return true;
  }
  if(['failed','declined','cancelled'].includes(status)){
   receipt=value;view='failed';error='';notice='';clearPayment(attempt?.payload?.attemptId);return true;
  }
  return false;
 }
 async function open(target,options={}){
  const shopId=typeof target==='string'?target:target?.id||target?.shopId;
  if(!shopId)throw new Error('Choose a merchant shop before paying.');
  const current=++generation;active=true;busy=true;historyBusy=false;view='loading';error='';notice='';receipt=null;quote=null;lastStage='';blockedRequest=null;
  intent={shopId,requestId:options.requestId||null,method:options.method||'qr',testKey:options.testKey||target?.testAcceptanceToken||null};amount='';
  restorePayment();
  if(attempt){intent={shopId:attempt.payload.shopId,requestId:attempt.payload.requestId,method:attempt.payload.method,testKey:attempt.payload.testKey||attempt.context?.testKey||null};quote=attempt.context;notice='Check your earlier payment before starting another purchase.';}
  redraw();
  try{
   const studentResult=await api('/api/student');if(current!==generation)return;setStudent(studentResult);
   if(attempt&&resolveReceipt(knownReceipt())){busy=false;redraw();return}
   checkSavedWallets();
   if(attempt?.submitted){view=student?'pending':'create';busy=false;redraw();return}
   const params=new URLSearchParams({shopId});if(intent.requestId)params.set('requestId',intent.requestId);if(intent.testKey)params.set('testKey',intent.testKey);
   const result=await api('/api/payments/quote?'+params);if(current!==generation)return;quote=result;
   if(!quote?.shop?.id||!quote?.business?.name)throw new Error('This merchant could not be verified. Check the shop code or ask for a fresh QR.');
   if(quote.shop.id!==shopId)throw new Error('The payment quote belongs to a different shop. Ask for a fresh QR.');
   if(intent.requestId&&(quote.request?.id!==intent.requestId||!Number.isSafeInteger(quote.request.amount)||quote.request.amount<=0))throw new Error('This fixed-amount request could not be verified. Ask the merchant for a fresh QR.');
   if(exactAmount())amount=(exactAmount()/100).toFixed(2);
   view=student?'pay':'create';busy=false;redraw();
  }catch(e){if(current!==generation)return;if(e?.code==='WALLET_CHANGED'){showWalletChanged(e);return}view='unavailable';setError(e)}
 }
 async function openWallet(){
  const current=++generation;active=true;busy=true;historyBusy=false;view='loading';error='';notice='';lastStage='';blockedRequest=null;
  restorePayment();
  if(attempt){intent={shopId:attempt.payload.shopId,requestId:attempt.payload.requestId,method:attempt.payload.method,testKey:attempt.payload.testKey||attempt.context?.testKey||null};quote=attempt.context;}
  else{intent=null;quote=null;}
  redraw();try{const result=await api('/api/student');if(current!==generation)return;setStudent(result);if(attempt)resolveReceipt(knownReceipt());checkSavedWallets();view=student?'wallet':'create';busy=false;redraw()}catch(e){if(current!==generation)return;if(e?.code==='WALLET_CHANGED'){showWalletChanged(e);return}view='unavailable';setError(e)}
 }
 function hide(){generation++;active=false;error='';notice='';busy=false;historyBusy=false;lastStage='';redraw()}
 function merchantCard(){
  const q=summary(),s=q.shop||{},b=q.business||{};
  return `<section class="campus-merchant-card"><span class="campus-merchant-icon">${icon('shop')}</span><span><strong>${E(b.name||'Verified merchant quote')}</strong><small>${E(s.name||'Shop')}${s.area?' · '+E(s.area):''}</small>${s.code?`<span class="campus-shop-code">${E(s.code)}</span>`:''}</span><span class="badge success">Shop matched</span></section>`;
 }
 function walletStrip(){return `<div class="campus-wallet-strip"><span>${icon('wallet')}<span><strong>Student demo wallet</strong><small>${E(student?.name||'Test student')} · test money</small></span></span><strong>${money(balance())}</strong></div>`}
 function field(label,name,value='',extra=''){return `<label class="field"><span class="label">${label}</span><input class="input" name="${name}" value="${E(value)}" ${extra}></label>`}
 function messages(){return `${error?`<div class="campus-error" role="alert">${icon('shield')}<span>${E(error)}</span></div>`:''}${notice?`<div class="campus-notice" role="status">${E(notice)}</div>`:''}`}
 function createScreen(){
  return {title:'Try Campus Pay.',body:`${intent?merchantCard():''}<div class="campus-intro"><span class="campus-wallet-symbol">${icon('wallet')}</span><h3>An empty test wallet.<br>A complete payment journey.</h3><p>Choose a display name to create a student demo wallet. It starts at zero. You can add test money yourself before making a payment.</p></div><form data-form="campus-pay" data-campus-form="create" id="campus-pay-create">${field('Demo display name','name',name,'required minlength="2" maxlength="60" autocomplete="nickname" placeholder="e.g. Campus Tester" autofocus')}${messages()}<p class="notice">This is a shared sandbox wallet, separate from your real Lumo account. No real money or identity verification is involved.</p></form>`,footer:`${btn('Cancel','close') }<button class="btn primary" type="submit" form="campus-pay-create" ${busy?'disabled':''}>${busy?'Creating…':'Create demo wallet'} ${icon('arrow')}</button>`};
 }
 function payScreen(){
  const fixed=exactAmount(),accepting=shop().accepting!==false&&shop().open!==false;
  return {title:'Pay the right counter.',body:`${merchantCard()}${walletStrip()}<form data-form="campus-pay" data-campus-form="amount" id="campus-pay-amount">${field('Amount · GH₵','amount',amount,`required type="text" inputmode="decimal" maxlength="12" ${fixed?'readonly aria-readonly="true"':'autofocus'} placeholder="0.00"`)}${fixed?'<p class="hint">Amount locked by the merchant’s payment request.</p>':'<p class="hint">Confirm the price with the merchant before continuing.</p>'}${!accepting?'<div class="campus-error" role="alert">This shop has paused payments. Ask the merchant before continuing.</div>':''}${messages()}<div class="campus-payment-facts"><span>Demo payment fee<strong>${money(0)}</strong></span><span>Confirmation<strong>After the server confirms</strong></span></div></form>`,footer:`${btn('My demo wallet','wallet')}<button class="btn primary" type="submit" form="campus-pay-amount" ${busy||!accepting?'disabled':''}>Review payment ${icon('arrow')}</button>`};
 }
 function reviewScreen(){
  const value=attempt?.payload?.amount||0,after=balance()-value;
  return {title:'One final check.',body:`${merchantCard()}<div class="campus-review-amount"><small>You are paying</small><strong>${money(value)}</strong><span>Student demo wallet · test money</span></div><div class="detail-list"><div class="detail-row"><span>Shop code</span><strong>${E(shop().code||'Matched by shop ID')}</strong></div><div class="detail-row"><span>Payment fee</span><strong>${money(0)}</strong></div><div class="detail-row"><span>Wallet balance</span><strong>${money(balance())}</strong></div><div class="detail-row"><span>After payment</span><strong class="${after<0?'negative':''}">${money(after)}</strong></div></div>${after<0?'<div class="campus-notice">Your demo wallet needs more test money before this payment can complete.</div>':''}${messages()}<p class="notice">Confirm only when the merchant and shop match. The merchant receives a confirmed receipt after the demo wallet is debited.</p>`,footer:`${btn('Edit amount','edit', 'secondary',busy||attempt?.submitted?'disabled':'')}${after<0?btn('Add test money','fund','primary',busy?'disabled':''):btn(busy?'Confirming…':'Confirm demo payment '+icon('arrow'),'confirm','primary',busy?'disabled':'')}`};
 }
 function pendingScreen(){
  return {title:'Checking this payment.',body:`${merchantCard()}<div class="campus-result-icon pending">${icon('clock')}</div><h3 class="campus-result-title">We have not confirmed the outcome yet.</h3><p class="campus-result-copy">Keep this payment reference while we check. Do not start another payment for the same purchase.</p><div class="campus-review-amount compact"><strong>${money(attempt?.payload?.amount)}</strong></div>${messages()}<p class="notice">Checking again reuses the same payment attempt, so a retry cannot debit the wallet twice.</p>`,footer:`${btn('Close','close')}${btn(busy?'Checking…':'Check payment status','confirm','primary',busy?'disabled':'')}`};
 }
 function successScreen(){
  const value=receipt?.amount??0;
  return {title:'Payment confirmed.',body:`<div class="campus-result-icon success">${icon('check')}</div><div class="campus-success-amount">${money(value)}</div><p class="campus-result-copy">The demo wallet was debited and the merchant received this confirmed payment.</p>${merchantCard()}<div class="detail-list"><div class="detail-row"><span>Reference</span><strong class="campus-reference">${E(receipt?.reference||receipt?.id||'Confirmed receipt')}</strong></div><div class="detail-row"><span>Status</span><strong>Confirmed</strong></div><div class="detail-row"><span>Fee</span><strong>${money(receipt?.fee||0)}</strong></div><div class="detail-row"><span>Confirmed</span><strong>${displayDate(receipt?.confirmedAt||receipt?.createdAt)}</strong></div><div class="detail-row"><span>Demo wallet balance</span><strong>${money(balance())}</strong></div></div><p class="notice">The receiving phone announces this receipt only when its shop connection and sound are enabled.</p>`,footer:`${btn('View demo wallet','wallet')}${btn('Done','close','primary')}`};
 }
 function failedScreen(){
  return {title:'Payment did not complete.',body:`<div class="campus-result-icon failed">${icon('close')}</div><h3 class="campus-result-title">No success confirmation was issued.</h3><p class="campus-result-copy">Check your demo wallet activity before trying a new payment. A failed receipt is never announced as money received.</p>${messages()}${receipt?.reference?`<p class="campus-reference">${E(receipt.reference)}</p>`:''}`,footer:`${btn('View demo wallet','wallet')}${btn('Close','close','primary')}`};
 }
 function eventDetails(item){
  const type=String(item.type||item.kind||item.direction||'').toLowerCase();
  const debit=type.includes('payment')||type.includes('purchase')||type==='debit'||item.direction==='debit'||Number(item.amount)<0;
  const title=type.includes('refund')?'Refund received':type.includes('fund')||type.includes('topup')?'Test money added':debit?item.businessName||item.merchantName||'Merchant payment':item.description||'Demo wallet activity';
  return {debit,title,amount:Math.abs(Number(item.amount)||0)};
 }
 function walletScreen(){
  const rows=history();
  return {title:'Your student demo wallet.',body:`<section class="campus-wallet-card"><span>TEST MONEY</span><strong>${money(balance())}</strong><p>${E(student?.name||'Student demo wallet')}</p>${btn('Add test money','fund','primary')}</section>${messages()}<div class="campus-wallet-actions">${btn('Refresh activity','refresh-wallet','ghost small')}${intent?btn('Continue to payment','resume','secondary small'):''}</div><h3 class="campus-history-title">Demo activity</h3>${rows.length?`<div class="campus-history">${rows.map(item=>{const event=eventDetails(item);return `<article><span class="campus-history-icon ${event.debit?'debit':'credit'}">${icon(event.debit?'shop':'wallet')}</span><span><strong>${E(event.title)}</strong><small>${E(item.shopName||item.description||item.reference||'')}${item.reference&&item.description?' · '+E(item.reference):''}</small><small>${displayDate(item.confirmedAt||item.createdAt)}</small></span><span><strong class="${event.debit?'':'positive'}">${event.debit?'−':'+'}${money(event.amount)}</strong>${item.status?`<small>${E(({paid:'Confirmed',completed:'Confirmed',confirmed:'Confirmed',processing:'Processing',failed:'Failed'})[item.status]||item.status)}</small>`:''}</span></article>`}).join('')}</div>`:'<div class="campus-empty"><p>No activity yet. Add test money, then pay a campus merchant to follow the complete journey.</p></div>'}<div class="campus-history-pagination"><span>${rows.length} of ${historyMeta.total} activity entries shown</span>${historyMeta.nextCursor?btn(historyBusy?'Loading…':'Load older activity','history-more','secondary small',historyBusy?'disabled':''):rows.length<historyMeta.total?btn('Refresh new activity','refresh-wallet','secondary small'):'<small>All activity loaded</small>'}</div><p class="notice">Sandbox records are stored on the shared service. This wallet does not connect to real Lumo money, a bank or mobile money.</p>`,footer:`${btn('Merchant sign in','merchant')}${btn('Done','close','primary')}`};
 }
 function fundScreen(){
  return {title:'Add test money.',body:`${walletStrip()}<p class="campus-result-copy">This creates demo funds for testing a campus payment. It does not charge a bank account, mobile money wallet or real Lumo account.</p><form data-form="campus-pay" data-campus-form="fund" id="campus-pay-fund">${field('Test money to add · GH₵','fundAmount',fundAmount,`required type="text" inputmode="decimal" maxlength="12" ${fundAttempt?'readonly':'autofocus'}`)}<p class="hint">GH₵0.01–GH₵1,000.00 per addition. The server enforces its demo wallet limits.</p>${fundAttempt?'<p class="hint">Check the previous addition before changing its amount. Retrying uses the same reference.</p>':''}${messages()}</form>`,footer:`${btn('Back to wallet','wallet')}<button class="btn primary" type="submit" form="campus-pay-fund" ${busy?'disabled':''}>${busy?'Adding…':fundAttempt?'Check test-money addition':'Add test money'}</button>`};
 }
 function walletChangedScreen(){
  const saved=blockedRequest?.record||attempt||fundAttempt,reference=recordId(saved),value=saved?.payload?.amount??saved?.amount;
  return {title:'Your student wallet changed.',body:`<div class="campus-result-icon pending">${icon('shield')}</div>${messages()}${Number.isSafeInteger(value)?`<div class="campus-review-amount compact"><strong>${money(value)}</strong></div>`:''}<p class="campus-result-copy">Return to the original student wallet before checking this saved request. Ask the merchant to check their receipt list for this amount before paying again.</p>${reference?`<div class="detail-list"><div class="detail-row"><span>Saved support reference</span><strong class="campus-reference">${E(reference)}</strong></div></div>`:''}<p class="notice">The reference has been kept. This screen never pays or adds test money from a replacement wallet. An older reference without a wallet identity must be checked with the merchant before a new purchase.</p>`,footer:`${btn('Close','close')}${btn('Recheck original wallet','retry','primary',busy?'disabled':'')}`};
 }
 function unavailableScreen(){return {title:'Payment is unavailable.',body:`<div class="campus-result-icon failed">${icon('shield')}</div>${messages()}<p class="campus-result-copy">Check the shop code or ask the merchant for a fresh QR. We have not shown a payment success.</p>`,footer:`${btn('Close','close')}${btn('Try again','retry','primary',busy?'disabled':'')}`}}
 function renderModal(){
  if(!active)return null;
  return ({create:createScreen,pay:payScreen,review:reviewScreen,pending:pendingScreen,success:successScreen,failed:failedScreen,wallet:walletScreen,fund:fundScreen,'wallet-changed':walletChangedScreen,unavailable:unavailableScreen})[view]?.()||{title:'Opening Campus Pay…',body:'<div class="campus-loading" role="status"><span></span><p>Checking the shared demo wallet and merchant.</p></div>',footer:btn('Close','close')};
 }
 function render(){
  const content=renderModal();if(!content)return '';
  return `<div class="modal-backdrop campus-pay-backdrop" data-action="campus-pay-backdrop"><section class="modal campus-pay-modal" role="dialog" aria-modal="true" aria-labelledby="campus-pay-heading"><header class="modal-header"><div><span class="campus-kicker">LUMO CAMPUS PAY · SANDBOX</span><h2 id="campus-pay-heading" tabindex="-1">${content.title}</h2></div><button class="icon-btn close-btn" data-action="campus-pay-close" aria-label="Close Campus Pay">${icon('close')}</button></header><div class="modal-body">${content.body}</div><footer class="modal-footer">${content.footer||''}</footer></section></div>`;
 }
 async function submitPayment(){
  if(busy||!attempt)return;
  const current=generation,original=attempt,payload={...attempt.payload};let submitted=false;
  busy=true;error='';notice='';redraw();
  try{
   // The cookie can expire or change while the review stays open. Check the
   // current server wallet, then bind the mutation too for the GET/POST gap.
   await fetchStudent(current,{preserveHistory:true});if(current!==generation)return;
   const walletId=requireWallet(original);payload.walletId=walletId;
   const saved={...original,walletId,payload,submitted:true};writePending(saved);attempt=saved;submitted=true;
   const result=await api('/api/payments',{method:'POST',body:payload,expectedWalletId:walletId});
   if(result?.student?.id!==walletId)throw walletChanged(saved);
   if(current!==generation){if(['paid','confirmed','completed','failed','declined','cancelled'].includes(currentReceipt(result)?.status))clearPayment(payload.attemptId);return;}
   requireWallet(saved);setStudent(result,{preserveHistory:true});
   const value=currentReceipt(result);
   try{await fetchStudent(current,{preserveHistory:true});if(current===generation){requireWallet(saved);checkSavedWallets()}}catch(e){if(e?.code==='WALLET_CHANGED')throw e}
   if(current!==generation)return;
   if(!resolveReceipt(value)){view='pending';notice='This receipt is still processing. It is not confirmed money yet.';}
   busy=false;redraw();if(view==='success')config.toast?.('Demo payment confirmed.');
  }catch(e){
   const rejected=rejectedBeforeDebit(e);
   if(rejected)clearPayment(payload.attemptId);
   if(current!==generation)return;
   if(e?.code==='WALLET_CHANGED'||e?.code==='STUDENT_REQUIRED'){showWalletChanged(e?.code==='WALLET_CHANGED'?e:walletChanged(original),original);return}
   error=message(e);busy=false;
   if(e?.code==='PENDING_STORAGE_UNAVAILABLE'){view=original.submitted?'pending':'review';}
   else if(e?.code==='INSUFFICIENT_FUNDS'){const reviewAttempt=attempt;clearPayment(payload.attemptId);attempt={...reviewAttempt,submitted:false};view='review';}
   else if(rejected){attempt=null;view='unavailable';notice='The server rejected this request before any wallet debit. You can choose another merchant or ask for a fresh QR.';}
   else view=submitted||original.submitted?'pending':'review';
   redraw();
  }
 }
 async function handleSubmit(form){
  if(busy||view==='wallet-changed')return true;
  const p=Object.fromEntries(new FormData(form)),kind=form.dataset?.campusForm;
  if(kind==='create'){
   name=String(p.name||'').trim();if(name.length<2||name.length>60){setError(new Error('Use a display name between 2 and 60 characters.'));return true}
   const current=generation;busy=true;error='';redraw();try{const result=await api('/api/student/open',{method:'POST',body:{name}});if(current!==generation)return true;setStudent(result);if(!student)throw new Error('The demo wallet could not be created.');checkSavedWallets();view=attempt?.submitted?'pending':intent?'pay':'wallet';busy=false;redraw()}catch(e){if(current===generation){if(e?.code==='WALLET_CHANGED')showWalletChanged(e);else setError(e)}}return true;
  }
  if(kind==='amount'){
   try{
    amount=String(p.amount||amount);const entered=parseCampusAmount(amount),fixed=exactAmount();
    if(fixed&&entered!==fixed)throw new Error('The amount must match the shop’s payment request.');
    if(!quote?.shop?.id)throw new Error('Get a fresh merchant quote before paying.');
    if(!student?.id)throw new Error('Open your student wallet before reviewing a payment.');
    attempt={walletId:student.id,payload:{walletId:student.id,shopId:intent.shopId,requestId:intent.requestId||undefined,amount:entered,attemptId:newId(),method:intent.method,...(quote.testKey||intent.testKey?{testKey:quote.testKey||intent.testKey}:{})},context:quote,submitted:false};
    view='review';error='';notice='';redraw();
   }catch(e){setError(e)}return true;
  }
  if(kind==='fund'){
   const current=generation;let requestReference=null,nextAttempt=null,sent=false;
   try{
    fundAmount=String(p.fundAmount||fundAmount);const value=parseCampusAmount(fundAmount,{funding:true});
    if(fundAttempt&&fundAttempt.amount!==value)throw new Error('Check the previous test-money addition before changing its amount.');
    nextAttempt=fundAttempt||{walletId:student?.id,amount:value,attemptId:newId(),confirmSandbox:true};
    busy=true;error='';redraw();await fetchStudent(current,{preserveHistory:true});if(current!==generation)return true;
    const walletId=requireWallet(nextAttempt,'funding');writeFund(nextAttempt);fundAttempt=nextAttempt;
    const payload={...fundAttempt};requestReference=payload.attemptId;sent=true;
    const result=await api('/api/student/fund',{method:'POST',body:payload,expectedWalletId:walletId});
    if(result?.student?.id!==walletId)throw walletChanged(nextAttempt,'funding');
    if(current!==generation){clearFunding(requestReference);return true}
    requireWallet(nextAttempt,'funding');setStudent(result,{preserveHistory:true});clearFunding(requestReference);
    notice=`${money(value)} in test money was added.`;view=attempt?.submitted?'pending':intent?'pay':'wallet';busy=false;redraw();
   }catch(e){
    if(current!==generation)return true;
    if(e?.code==='WALLET_CHANGED'||e?.code==='STUDENT_REQUIRED'){showWalletChanged(e?.code==='WALLET_CHANGED'?e:walletChanged(nextAttempt,'funding'),nextAttempt,'funding');return true}
    const definitive=sent&&Number.isInteger(e?.status)&&e.status>=400&&e.status<500&&e.status!==408&&typeof e.code==='string'&&!['CONCURRENT_UPDATE','REQUEST_TIMEOUT','TIMEOUT','AUTH_CHANGED','LOCAL_LOCKED','NETWORK_ERROR'].includes(e.code);
    if(definitive)clearFunding(requestReference);
    setError(e)
   }return true;
  }
  return false;
 }
 async function handleClick(action,element,event){
  const name=String(action).replace(/^campus-pay-/,'');
  if(name==='backdrop'){if(event?.target&&event.target!==element)return true;hide();return true}
  if(name==='close'){hide();return true}
  if(name==='merchant'){hide();config.onReturnMerchant?.();return true}
  if(view==='wallet-changed'&&!['retry','refresh-wallet'].includes(name))return true;
  if(name==='confirm'){await submitPayment();return true}
  if(name==='edit'){if(!busy&&!attempt?.submitted){view='pay';attempt=null;error='';redraw()}return true}
  if(name==='fund'){if(!student){view='create';redraw();return true}view='fund';error='';notice='';redraw();return true}
  if(name==='wallet'){view=student?'wallet':'create';error='';notice='';redraw();return true}
  if(name==='refresh-wallet'){
   if(busy)return true;const current=generation;historyEpoch++;historyRequest++;historyBusy=false;busy=true;error='';redraw();try{await fetchStudent(current);if(current!==generation)return true;busy=false;notice='Demo wallet activity is up to date.';if(attempt?.submitted)resolveReceipt(knownReceipt());checkSavedWallets();redraw()}catch(e){if(current===generation){if(e?.code==='WALLET_CHANGED')showWalletChanged(e);else setError(e)}}return true;
  }
  if(name==='history-more'){
   if(busy||historyBusy||!historyMeta.nextCursor)return true;
   const current=generation,walletId=student?.id,cursor=historyMeta.nextCursor,epoch=historyEpoch,request=++historyRequest;
   historyBusy=true;error='';redraw();
   try{const result=await api('/api/student?'+new URLSearchParams({cursor,limit:'25'}));if(current!==generation||epoch!==historyEpoch||request!==historyRequest)return true;if(student?.id!==walletId||result.student?.id!==walletId)throw new Error('The demo wallet changed. Refresh its activity before continuing.');setStudent(result,{appendHistory:true});historyBusy=false;redraw()}catch(e){if(current===generation&&epoch===historyEpoch&&request===historyRequest){historyBusy=false;error=message(e);redraw()}}
   return true;
  }
  if(name==='resume'){try{checkSavedWallets();view=attempt?.submitted?'pending':intent?'pay':'wallet';error='';notice='';redraw()}catch(e){showWalletChanged(e)}return true}
  if(name==='retry'){if(intent)await open(intent.shopId,{requestId:intent.requestId,method:intent.method,testKey:intent.testKey});else await openWallet();return true}
  return false;
 }
 function handleChange(element){
  if(element?.name==='name'){name=element.value;return true}
  if(element?.name==='amount'){amount=element.value;return true}
  if(element?.name==='fundAmount'){fundAmount=element.value;return true}
  return false;
 }
 return {open,openWallet,render,renderModal,isActive:()=>active,hide,handleClick,handleSubmit,handleChange};
}
