const E=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const UUID=()=>globalThis.crypto?.randomUUID?.()||`share-${Date.now()}-${Math.random().toString(36).slice(2)}`;
const ORIGIN='https://lumo-connected-pilot.vercel.app';
const money=value=>`GH₵${(value/100).toFixed(2)}`;

// A checkout capability deliberately intended for public sharing. Account,
// test-acceptance and session credentials never belong in these URLs.
export function publicCheckoutURL(value) {
 const url=new URL(String(value||''));
 if(url.origin!==ORIGIN||url.pathname!=='/checkout.html'||url.username||url.password||url.hash||[...url.searchParams.keys()].some(key=>key!=='link')||url.searchParams.getAll('link').length!==1||!/^[a-f0-9]{64}$/.test(url.searchParams.get('link')||''))throw Error('Lumo did not return a public checkout link. Reopen this request before sharing.');
 return url.href;
}

export function paymentShareMessage(link) {
 const purpose=String(link.description||'').trim(),identity=[link.merchantName,link.shopName].filter(Boolean).join(' · ');
 return `${identity}${purpose?`\n${purpose}`:''}\n${Number.isSafeInteger(link.amount)?`Pay ${money(link.amount)}`:'Choose your amount at checkout'}\nPay with Lumo or mobile money.\n${publicCheckoutURL(link.url)}`;
}

export function shareTargets(message,url) {
 const body=String(message||'').trim(),checkout=publicCheckoutURL(url),text=body.split(/\s+/).includes(checkout)?body:`${body}\n${checkout}`;
 return {text,whatsapp:`https://wa.me/?text=${encodeURIComponent(text)}`,email:`mailto:?subject=${encodeURIComponent('Payment link')}&body=${encodeURIComponent(text)}`};
}

export function paymentCardSVG(link,qrSVG) {
 const url=publicCheckoutURL(link.url);
 if(typeof qrSVG!=='string'||!/^\s*<svg\b/.test(qrSVG)||/<(?:script|foreignObject|image)\b|\bon\w+\s*=|\b(?:href|xlink:href)\s*=/i.test(qrSVG))throw Error('The payment card could not be prepared. Copy the link instead.');
 const qr=qrSVG.replace(/<svg\b[^>]*>/,match=>match.replace(/\s(?:width|height|x|y)="[^"]*"/g,'').replace('>',' x="124" y="270" width="472" height="472">'));
 const words=String(link.description||'Payment to '+link.shopName).trim().split(/\s+/),lines=[];
 let line='';for(const word of words){if((line+' '+word).trim().length>39){lines.push(line);line=word}else line=(line+' '+word).trim()}if(line)lines.push(line);
 return `<svg xmlns="http://www.w3.org/2000/svg" width="720" height="1000" viewBox="0 0 720 1000"><rect width="720" height="1000" fill="#191a22"/><rect x="28" y="28" width="664" height="944" rx="32" fill="#24252f"/><text x="64" y="103" font-family="Arial,sans-serif" font-size="46" font-weight="700" fill="#d4f65a">lumo<tspan font-size="16" fill="#f5f5f7"> merchant</tspan></text><text x="64" y="162" font-family="Arial,sans-serif" font-size="26" fill="#f5f5f7">${E(String(link.merchantName||'Lumo merchant').slice(0,43))}</text><text x="64" y="200" font-family="Arial,sans-serif" font-size="20" fill="#b8b9c3">${E(String(link.shopName||'').slice(0,48))}</text><rect x="106" y="252" width="508" height="508" rx="24" fill="white"/>${qr}<text x="360" y="822" text-anchor="middle" font-family="Arial,sans-serif" font-size="38" fill="#f5f5f7">${Number.isSafeInteger(link.amount)?E(money(link.amount)):'Choose amount at checkout'}</text>${lines.slice(0,2).map((text,index)=>`<text x="360" y="${862+index*28}" text-anchor="middle" font-family="Arial,sans-serif" font-size="18" fill="#b8b9c3">${E(text)}</text>`).join('')}<text x="360" y="935" text-anchor="middle" font-family="Arial,sans-serif" font-size="16" fill="#d4f65a">Scan to open secure checkout · Test money</text><metadata>${E(url)}</metadata></svg>`;
}

export async function downloadPaymentCard(link,qrSVG,{document:doc=globalThis.document,Image:ImageType=globalThis.Image,URL:URLs=globalThis.URL}={}) {
 const svg=paymentCardSVG(link,qrSVG),source=URLs.createObjectURL(new Blob([svg],{type:'image/svg+xml'}));
 try{
  const image=new ImageType();await new Promise((resolve,reject)=>{image.onload=resolve;image.onerror=()=>reject(Error('The card could not be saved. Copy the payment link instead.'));image.src=source});
  const canvas=doc.createElement('canvas');canvas.width=720;canvas.height=1000;const context=canvas.getContext('2d');if(!context)throw Error('Card images are not supported in this browser. Copy the link instead.');context.drawImage(image,0,0);
  const blob=await new Promise(resolve=>canvas.toBlob(resolve,'image/png'));if(!blob)throw Error('The card could not be saved. Copy the payment link instead.');
  const download=URLs.createObjectURL(blob),anchor=doc.createElement('a');try{anchor.href=download;anchor.download='lumo-payment-card.png';anchor.click()}finally{setTimeout(()=>URLs.revokeObjectURL(download),1000)}
 }finally{URLs.revokeObjectURL(source)}
}

export function createPaymentLinkSharing(config={}) {
 let source=null,identity='',link=null,busy=false,error='',notice='',message='',pending=null,validity='24h',purpose='',amount='',kind='shop',generation=0,listMode=false,links=[];
 const nav=()=>config.navigator||globalThis.navigator||{};
 const storage=()=>{try{return config.storage===undefined?globalThis.sessionStorage:config.storage}catch{return null}};
 const context=()=>String(config.getIdentity?.()||'sample');
 const key=()=>`lumo-merchant-share-attempt-v1:${identity}:${source?.shop?.id||''}:${source?.request?.id||'online'}`;
 const redraw=()=>config.onChange?.();
 function current(){return source&&identity===context()}
 function request(){return source?.request?(config.getRequest?.(source.request.id)||source.request):null}
 function unavailable(){const r=request();if(r&&(r.status!=='open'||Date.parse(r.expiresAt)<=Date.now()))return r.status==='paid'?'This payment request has already been paid.':r.status==='cancelled'?'This payment request was cancelled.':'This payment request expired. Create a new request before sharing.';return ''}
 function savePending(){try{const target=storage();if(!target)throw Error();if(pending){const value=JSON.stringify(pending);target.setItem(key(),value);if(target.getItem(key())!==value)throw Error()}else target.removeItem(key())}catch{if(pending)throw Error('Allow browser storage before creating this payment link, so an interrupted response can be retrieved safely.')}}
 function open(value={}) {
  generation++;source=value;identity=context();link=null;listMode=false;links=[];busy=false;error='';notice='';message='';pending=null;validity='24h';purpose=String(value.description||value.request?.description||'').slice(0,160);amount=Number.isSafeInteger(value.amount)?(value.amount/100).toFixed(2):'';kind=value.request||value.amount?'fixed':'shop';
  try{const saved=JSON.parse(storage()?.getItem(key())||'null');if(saved?.shopId===value.shop?.id&&typeof saved.attemptId==='string'){pending=saved;purpose=saved.description||'';amount=Number.isSafeInteger(saved.amount)?(saved.amount/100).toFixed(2):'';validity=saved.validity||'24h';kind=saved.amount||saved.requestId?'fixed':'shop'}}catch{}
 }
 async function loadList(selectedId){
  const epoch=generation;busy=true;error='';redraw();try{const result=await config.listLinks?.();if(epoch!==generation||!current())return;links=Array.isArray(result?.links)?result.links:[];if(selectedId){const selected=links.find(item=>item.id===selectedId);if(!selected)throw Error('This link is not available to your account.');link={...selected,url:publicCheckoutURL(selected.url)};message=paymentShareMessage(link);listMode=false}}catch(failure){if(epoch===generation)error=failure.message||'Shared payment links could not be loaded.'}finally{if(epoch===generation&&current()){busy=false;redraw()}}
 }
 function openList(value={},selectedId){open(value);listMode=true;if(!config.isSample?.())void loadList(selectedId)}
 function listView(){return `<div class="payment-share"><p class="hint">Only links available to your account are shown. A shared link is not evidence that a payment was received.</p>${error?`<div class="callout warning" role="alert">${E(error)}</div>`:''}<button class="btn secondary" data-action="share-refresh" ${busy?'disabled':''}>${busy?'Checking links…':'Refresh link status'}</button><div class="share-link-list">${links.length?links.map(item=>{const status=item.status==='open'&&item.expiresAt&&Date.parse(item.expiresAt)<=Date.now()?'expired':item.status;return `<button type="button" class="share-link-row" data-action="share-open" data-id="${E(item.id)}"><span><strong>${E(item.description||item.shopName||'Shop payment link')}</strong><small>${E(item.shopName)} · ${E(status)}</small></span><strong>${Number.isSafeInteger(item.amount)?money(item.amount):'Reusable'}</strong></button>`}).join(''):`<p class="hint">${busy?'Loading your shared links…':'No shared payment links yet. Create one from Collect or Shop QR.'}</p>`}</div></div>`}
 function reset(){generation++;source=null;identity='';link=null;busy=false;error='';notice='';message='';pending=null;listMode=false;links=[]}
 function render() {
  if(!current())return '<p class="muted">Your account or cashier changed. Reopen Share payment link from the current shop.</p>';
  const sample=config.isSample?.(),r=request(),blocked=unavailable(),expired=link?.expiresAt&&Date.parse(link.expiresAt)<=Date.now(),usable=link&&!expired&&link.status==='open';
  if(sample)return '<div class="callout warning">This is a browser-only sample. Sign in to a registered merchant account to create a public payment link that works across phones.</div>';
  if(listMode)return listView();
  if(!link&&source.shop?.published===false)return `<div class="callout warning"><span>${config.canPublish?.()?'Publish this shop before creating a public payment link.':'Ask the owner or shop manager to publish this shop before sharing a public payment link.'} Its counter QR remains separate.</span>${config.canPublish?.()&&config.onPublish?'<button class="btn secondary" data-action="share-publish">Shop publication settings</button>':''}</div>`;
  if(blocked)return `<div class="callout warning" role="status">${E(blocked)}</div>`;
  return `<div class="payment-share"><div class="share-identity"><strong>${E(source.shop?.name||'Your shop')}</strong><small>${E(config.getMerchantName?.()||'Lumo merchant')}</small></div>${error?`<div class="callout warning" role="alert">${E(error)}</div>`:''}${notice?`<p class="share-notice" role="status">${E(notice)}</p>`:''}${link?`
   <div class="share-link-summary"><strong>${Number.isSafeInteger(link.amount)?money(link.amount):'Reusable shop link'}</strong><p>${E(link.description||'Customer chooses an amount at checkout.')}</p><small>${expired?'Expired':link.status!=='open'?E(link.status):link.expiresAt?'Valid until '+E(new Date(link.expiresAt).toLocaleString('en-GH',{day:'numeric',month:'short',hour:'2-digit',minute:'2-digit'})):'Reusable while this shop accepts payments'}</small></div>
   <label class="field"><span class="label">Your share message</span><textarea class="input" name="paymentShareMessage" rows="5" maxlength="2000" aria-describedby="share-message-hint">${E(message)}</textarea></label><p id="share-message-hint" class="hint">Edit the message, choose an app and complete sending there.</p>
   ${nav().share?`<button class="btn primary full" data-action="share-native" ${busy||!usable?'disabled':''}>Share payment link</button>`:''}
   <div class="share-fallbacks"><button class="btn ${nav().share?'secondary':'primary'}" data-action="share-whatsapp" ${busy||!usable?'disabled':''}>WhatsApp</button><button class="btn secondary" data-action="share-email" ${busy||!usable?'disabled':''}>Email</button></div>
   <button class="btn ghost full" data-action="share-copy" ${busy?'disabled':''}>Copy link</button><details class="share-social-help"><summary>Instagram or another app?</summary><p>Use your phone’s Share sheet if the app appears. Otherwise, copy the link for a message or bio, or save a payment card and attach it in the app.</p><button class="btn secondary full" data-action="share-card" ${busy||!usable?'disabled':''}>Save payment card</button></details>
   <label class="field"><span class="label">Public checkout link</span><input class="input share-url" value="${E(link.url)}" readonly aria-label="Public payment link"></label><p class="hint">Works without a Lumo account. Guest mobile money is a labelled sandbox until a provider is connected.</p>`:
   `<form data-form="payment-share"><fieldset class="share-kind-options"><legend class="label">Link type</legend>${r?'<p>Fixed counter request · its existing amount and expiry stay unchanged.</p>':`<label><input type="radio" name="paymentShareKind" value="shop" ${kind==='shop'?'checked':''} ${pending?'disabled':''}> Reusable shop link</label><label><input type="radio" name="paymentShareKind" value="fixed" ${kind==='fixed'?'checked':''} ${pending?'disabled':''}> Fixed amount for an order</label>`}</fieldset>
   ${kind==='fixed'?`<label class="field"><span class="label">Amount · GH₵</span><input class="input" name="paymentShareAmount" inputmode="decimal" type="number" min="0.01" step="0.01" max="10000.00" value="${E(r?(r.amount/100).toFixed(2):amount)}" ${r||pending?'readonly':''} required></label>`:''}
   <label class="field"><span class="label">Description or order reference (optional)</span><input class="input" name="paymentSharePurpose" maxlength="160" value="${E(r?.description||purpose)}" ${r||pending?'readonly':''} placeholder="e.g. Order 204 · printed notes"></label>
   ${kind==='fixed'&&!r?`<label class="field"><span class="label">Online link validity</span><select class="select" name="paymentShareValidity" ${pending?'disabled':''}><option value="24h" ${validity==='24h'?'selected':''}>24 hours</option><option value="7d" ${validity==='7d'?'selected':''}>7 days</option></select></label><p class="hint">For a remote customer. This is a separate one-off link, with its own reference.</p>`:r?`<p class="hint">Expires ${E(new Date(r.expiresAt).toLocaleString('en-GH'))}. Sharing does not extend the counter QR.</p>`:'<p class="hint">Customers enter their amount. Shop-link payments remain shop-attributed.</p>'}
   <p class="hint">Public links require a deliberately published shop. Nothing is sent until you choose a destination and send it yourself.</p><button class="btn primary full" ${busy?'disabled':''}>${busy?'Preparing link…':pending?'Retrieve payment link':'Prepare payment link'}</button></form>`}</div>`;
 }
 async function submit(form) {
  if(!current()||busy||config.isSample?.()||source.shop?.published===false||unavailable())return;
  const values=Object.fromEntries(config.formData?config.formData(form):new FormData(form)),epoch=generation;
  if(!pending){
   const r=request(),fixed=r||kind==='fixed',cents=r?.amount||Math.round(Number(values.paymentShareAmount||amount)*100);
   if(fixed&&(!Number.isSafeInteger(cents)||cents<=0||cents>1000000)){error='Enter an amount from GH₵0.01 to GH₵10,000.00.';redraw();return}
   pending={shopId:source.shop.id,...(r?{requestId:r.id}:fixed?{amount:cents}:{}),description:r?.description||String(values.paymentSharePurpose??purpose).trim().slice(0,160),...(!r&&fixed?{validity:values.paymentShareValidity||validity}:{}),attemptId:UUID()};
   try{savePending()}catch(failure){pending=null;error=failure.message;redraw();return}
  }
  busy=true;error='';notice='';redraw();
  try{
   const result=await config.createLink({...pending});if(epoch!==generation||!current())return;
   const created=result?.link||result;if(!created?.id)throw Error('The service did not confirm this link. Retrieve the same reference.');
   if(created.shopId!==pending.shopId||pending.requestId&&created.requestId!==pending.requestId||Number.isSafeInteger(pending.amount)&&created.amount!==pending.amount||created.currency&&created.currency!=='GHS')throw Error('The returned link does not match the selected shop or amount. Retrieve the original request.');
   const checkout=publicCheckoutURL(created.url);if(created.publicToken&&new URL(checkout).searchParams.get('link')!==created.publicToken)throw Error('The returned checkout reference did not match. Retrieve the original request.');
   link={...created,url:checkout};pending=null;savePending();message=paymentShareMessage(link);
  }catch(failure){if(epoch===generation&&current()){error=failure.message||'The link could not be confirmed. Retrieve the same request when connected.';if([400,403,404,422].includes(failure.status)){pending=null;savePending()}}}
  finally{if(epoch===generation&&current()){busy=false;redraw()}}
 }
 function change(element) {
  if(!current())return false;
  if(element.name==='paymentShareMessage'){message=element.value.slice(0,2000);return true}
  if(pending)return false;
  if(element.name==='paymentShareKind'&&element.checked){kind=element.value==='fixed'?'fixed':'shop';redraw();return true}
  if(element.name==='paymentSharePurpose'){purpose=element.value.slice(0,160);return true}
  if(element.name==='paymentShareAmount'){amount=element.value;return true}
  if(element.name==='paymentShareValidity'){validity=element.value==='7d'?'7d':'24h';return true}
  return false;
 }
 async function click(element) {
  const action=element?.dataset?.action;if(!action?.startsWith('share-'))return false;
  if(!current()||busy)return true;
  if(action==='share-publish'){if(config.canPublish?.())config.onPublish?.(source.shop?.id);return true}
  if(action==='share-refresh'){await loadList();return true}
  if(action==='share-open'){const selected=links.find(item=>item.id===element.dataset.id);if(selected){link={...selected,url:publicCheckoutURL(selected.url)};message=paymentShareMessage(link);listMode=false;redraw()}return true}
  if(!link)return true;
  const epoch=generation,targets=shareTargets(message,link.url);error='';notice='';
  try{
   if(action!=='share-copy'&&(unavailable()||link.status!=='open'||link.expiresAt&&Date.parse(link.expiresAt)<=Date.now()))throw Error('This link is no longer open for payment. Create a new link.');
   if(action==='share-native'){
    if(link.status!=='open'||link.expiresAt&&Date.parse(link.expiresAt)<=Date.now())throw Error('This link is no longer open for payment. Create a new link.');
    const result=nav().share?.({title:[link.merchantName,link.shopName].filter(Boolean).join(' · '),text:targets.text,url:link.url});
    if(!result)throw Error('Use WhatsApp, email or copy the link on this device.');busy=true;redraw();await result;if(epoch===generation)notice='Your link is ready. Check the destination app to finish sharing.';
   }else if(action==='share-whatsapp'||action==='share-email'){
    config.openExternal?.(action==='share-whatsapp'?targets.whatsapp:targets.email);notice=`Continue in ${action==='share-whatsapp'?'WhatsApp':'your email app'} to complete sending. The link remains ready here.`;
   }else if(action==='share-copy'){
    const clipboard=nav().clipboard;if(!clipboard?.writeText)throw Error('Select the public checkout link below and copy it.');await clipboard.writeText(link.url);if(epoch===generation)notice='Payment link copied.';
   }else if(action==='share-card'){
    busy=true;redraw();await (config.downloadCard||downloadPaymentCard)(link,config.qrSvg?.(link.url)||'');if(epoch===generation)notice='The payment card is ready to save. Attach it in your chosen app.';
   }
  }catch(failure){if(epoch===generation){if(failure?.name==='AbortError')notice='Share cancelled. Your payment link is still ready.';else error=failure.message||'Choose another sharing option below.'}}
  finally{if(epoch===generation&&current()){busy=false;redraw()}}
  return true;
 }
 return {open,openList,render,handleSubmit:submit,handleChange:change,handleClick:click,reset,getLink:()=>current()&&link?{...link}:null};
}
