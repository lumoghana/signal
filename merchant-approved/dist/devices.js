const E=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const drawings={phone:'<rect x="6" y="2" width="12" height="20" rx="3"/><path d="M11 18h2"/>',sound:'<path d="m4 9 4 0 5-4v14l-5-4H4zM17 8a6 6 0 0 1 0 8m3-11a10 10 0 0 1 0 14"/>',shield:'<path d="m12 2 9 4v6c0 6-9 10-9 10S3 18 3 12V6z"/><path d="m8 12 3 3 5-6"/>',refresh:'<path d="M20 7a9 9 0 1 0 1 9M20 2v6h-6"/>',check:'<path d="m5 12 4 4L19 6"/>',shop:'<path d="M3 10h18M4 10v11h16V10M2 10l3-7h14l3 7M9 21v-7h6v7"/>',alert:'<path d="m12 3 10 18H2zM12 9v5m0 3v.01"/>',off:'<path d="m3 3 18 18M4 9h4l5-4v8m0 4v2l-5-4H4zM17 8a6 6 0 0 1 1 6"/>'};
const icon=name=>`<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${drawings[name]||drawings.phone}</svg>`;
const button=(text,action,style='secondary',extra='')=>`<button type="button" class="btn ${style}" data-action="device-${action}" ${extra}>${text}</button>`;
const when=value=>value?new Date(value).toLocaleString('en-GB',{day:'numeric',month:'short',hour:'2-digit',minute:'2-digit',timeZone:'Africa/Accra'}):'Not yet';
export function persistentDeviceId(storage=globalThis.localStorage,makeId=()=>globalThis.crypto?.randomUUID?.()||`phone-${Date.now()}-${Math.random().toString(36).slice(2)}`){
 try{const saved=storage?.getItem('lumo-receiving-device-id-v2');if(saved&&/^[a-zA-Z0-9-]{8,100}$/.test(saved))return saved;const id=makeId();storage?.setItem('lumo-receiving-device-id-v2',id);return id}catch{return makeId()}
}
export function deviceCanReceive(device,session,shopId,shops=[]){
 const shop=shops.find(entry=>entry.id===shopId);
 if(!device||!session||!shopId||!shop||shop.businessId&&shop.businessId!==session.businessId)return false;
 if(session.expiresAt&&Date.parse(session.expiresAt)<=Date.now())return false;
 if(device.revokedAt||device.active===false||device.enabled===false||device.sessionValid===false)return false;
 if(device.businessId!==session.businessId||device.userId!==session.userId||device.shopId!==shopId)return false;
 if(device.sessionId&&device.sessionId!==session.id)return false;
 return session.role==='owner'||['manager','cashier'].includes(session.role)&&Array.isArray(session.shopIds)&&session.shopIds.includes(shopId);
}
export function deviceConnection(device,now=Date.now()){
 if(device?.revokedAt||device?.active===false)return 'revoked';
 if(device?.sessionValid===false)return 'signed-out';
 if(device?.enabled===false)return 'muted';
 if(!device?.lastSeen)return 'paired';
 return now-Date.parse(device.lastSeen)<90000?'online':'offline';
}
export function createDevices(config={}){
 const storage=config.storage||(()=>{try{return globalThis.localStorage}catch{return null}})();
 let deviceId=persistentDeviceId(storage);
 const tabId=config.tabId||globalThis.crypto?.randomUUID?.()||`tab-${Date.now()}-${Math.random().toString(36).slice(2)}`;
 const now=config.now||(()=>Date.now()),leaseDuration=12000;
 let devices=[],connection='unknown',busy=false,error='',notice='',label='',selectedShop='',audioUnlocked=false,timer=null,leaseTimer=null,lastIdentity='',seen=new Set(),localBaseline=new Set(),baseline=false,disconnectedAt=null,starting=false,lifecycle=0,authorityVersion=0,lastRevision=-1,announcementFailures=[],failureStorageKey='',failureGeneration=0,testGeneration=0;
 const state=()=>config.getState?.()||{};
 const session=()=>config.getSession?.()||null;
 const shopList=()=>state().shops||[];
 const own=()=>devices.find(device=>device.id===deviceId||device.deviceId===deviceId);
 const failureVersion=device=>Number.isSafeInteger(device?.failureVersion)&&device.failureVersion>=0?device.failureVersion:0;
 const allowed=()=>{const s=session();return s?.role==='owner'?shopList():shopList().filter(shop=>s?.shopIds?.includes(shop.id))};
 const redraw=()=>config.onRender?.();
 function freshOwnerForRevokedPhone(){
  const current=own(),s=session();
  return Boolean(current?.revokedAt&&s?.role==='owner'&&s.businessId===current.businessId&&s.id&&s.id!==current.sessionId&&Number.isFinite(Date.parse(s.createdAt))&&Date.parse(s.createdAt)>Date.parse(current.revokedAt)&&Number.isFinite(Date.parse(s.expiresAt))&&Date.parse(s.expiresAt)>now());
 }
 function canRestorePhone(){const current=own(),s=session();return freshOwnerForRevokedPhone()&&current.userId===s.userId}

 const call=async(path,method='GET',body)=>{if(typeof config.api!=='function')throw Error('The shared device service is unavailable.');return config.api(path,{method,...(body===undefined?{}:{body})})};
 function failureKey(){return 'lumo-device-announcement-failures-v1:'+deviceId+':'+lastIdentity}
 function loadAnnouncementFailures(){
  failureStorageKey=session()?failureKey():'';
  try{const saved=JSON.parse(failureStorageKey&&storage?.getItem(failureStorageKey)||'[]');announcementFailures=Array.isArray(saved)?saved.filter(entry=>entry&&typeof entry.transactionId==='string'&&typeof entry.reference==='string'&&typeof entry.shopId==='string'&&typeof entry.failedAt==='string').slice(-20):[]}catch{announcementFailures=[]}
 }
 function saveAnnouncementFailures(){try{if(failureStorageKey)announcementFailures.length?storage?.setItem(failureStorageKey,JSON.stringify(announcementFailures)):storage?.removeItem(failureStorageKey)}catch{}}
 function clearAnnouncementFailures(){announcementFailures=[];try{if(failureStorageKey)storage?.removeItem(failureStorageKey)}catch{}}
 function receiptKey(){return 'lumo-device-receipts-v3:'+deviceId+':'+(session()?.businessId||'none')}
 function leaseKey(){return 'lumo-receiver-lease-v1:'+deviceId}
 function loadReceipts(){try{const ids=JSON.parse(storage?.getItem(receiptKey())||'[]');return new Set(Array.isArray(ids)?ids:[])}catch{return new Set()}}
 function saveReceipts(){try{const all=new Set([...loadReceipts(),...seen]);storage?.setItem(receiptKey(),JSON.stringify([...all].slice(-1200)));seen=all}catch{}}
 function readLease(){try{const value=JSON.parse(storage?.getItem(leaseKey())||'null');return value&&typeof value.tabId==='string'&&Number.isFinite(value.expiresAt)?value:null}catch{return null}}
 function ownsLease(){const lease=readLease(),s=session();return Boolean(lease&&lease.tabId===tabId&&lease.expiresAt>now()&&lease.businessId===s?.businessId&&lease.userId===s?.userId&&(!lease.sessionId||lease.sessionId===s?.id))}
 function otherReceiver(){const lease=readLease();return Boolean(lease&&lease.tabId!==tabId&&lease.expiresAt>now())}
 function releaseLease(){if(leaseTimer)clearInterval(leaseTimer);leaseTimer=null;try{if(readLease()?.tabId===tabId)storage?.removeItem(leaseKey())}catch{}}
 function stopVoice(){audioUnlocked=false;releaseLease();try{globalThis.window?.speechSynthesis?.cancel()}catch{}}
 function ensureIdentity(){
  const s=session(),identity=[s?.businessId||'',s?.userId||'',s?.id||''].join(':');
  if(identity!==lastIdentity){testGeneration++;stopVoice();if(lastIdentity)clearAnnouncementFailures();lastIdentity=identity;loadAnnouncementFailures();devices=[];connection='unknown';baseline=false;localBaseline=new Set();seen=loadReceipts();lastRevision=-1;authorityVersion++;error='';notice=''}
 }
 function connectivity(next){if(next==='offline'&&connection!=='offline'){disconnectedAt=new Date(now()).toISOString();stopVoice()}connection=next}
 function setConnection(next){if(next==='offline'){connectivity('offline');redraw()}else if(next==='online'&&connection!=='online'){connection='online';redraw()}}
 function getCurrentShop(){return selectedShop||own()?.shopId||config.getShopId?.()||allowed()[0]?.id||''}
 function canAnnounce(shopId){ensureIdentity();return connection==='online'&&audioUnlocked&&!announcementFailures.some(entry=>entry.needsRetest)&&own()?.announcementFailed!==true&&own()?.soundReady!==false&&ownsLease()&&globalThis.navigator?.onLine!==false&&deviceCanReceive(own(),session(),shopId,shopList())}
 function establishBaseline(force=false){
  ensureIdentity();if(baseline&&!force)return;
  (state().transactions||[]).filter(payment=>payment.status==='paid').forEach(payment=>localBaseline.add(payment.reference||payment.id));
  baseline=true;seen=loadReceipts();
 }
 function rememberReceipt(payment){
  ensureIdentity();if(!payment?.id||payment.status!=='paid')return false;
  const key=payment.reference||payment.id;
  if(localBaseline.has(key))return false;
  if(!canAnnounce(payment.shopId)){localBaseline.add(key);return false}
  seen=loadReceipts();if(seen.has(key)){localBaseline.add(key);return false}
  // One receiver lease owns writes. Re-read shared receipts before every claim.
  seen.add(key);saveReceipts();localBaseline.add(key);return ownsLease();
 }
 function consumePayments(payments=[]){
  ensureIdentity();const paid=payments.filter(payment=>payment.status==='paid');
  if(!baseline){paid.forEach(payment=>localBaseline.add(payment.reference||payment.id));baseline=true;seen=loadReceipts();return []}
  return paid.filter(payment=>rememberReceipt(payment));
 }
 function announcementContext(payment){
  ensureIdentity();if(!payment?.id||payment.status!=='paid'||!canAnnounce(payment.shopId))return null;
  const s=session();return Object.freeze({identity:lastIdentity,lifecycle,deviceId,businessId:s.businessId,userId:s.userId,sessionId:s.id||null,shopId:payment.shopId,transactionId:payment.id,reference:payment.reference||payment.id});
 }
 async function announcementFailed(payment,context,reason='speech-failed'){
  ensureIdentity();const current=own(),s=session();
  if(!context||context.identity!==lastIdentity||context.lifecycle!==lifecycle||context.deviceId!==deviceId||context.businessId!==s?.businessId||context.userId!==s?.userId||context.sessionId!==(s?.id||null)||context.shopId!==current?.shopId||context.transactionId!==payment?.id||context.reference!==(payment?.reference||payment?.id)||payment?.status!=='paid'||!deviceCanReceive(current,s,context.shopId,shopList()))return false;
  if(announcementFailures.some(entry=>entry.transactionId===context.transactionId))return false;
  failureGeneration++;testGeneration++;
  announcementFailures.push({transactionId:context.transactionId,reference:context.reference,shopId:context.shopId,failedAt:new Date(now()).toISOString(),needsRetest:true});announcementFailures=announcementFailures.slice(-20);saveAnnouncementFailures();
  // Withdraw readiness before any asynchronous request or cancellation callback.
  devices=devices.map(device=>device.id===current.id?{...device,soundReady:false,announcementFailed:true}:device);stopVoice();
  notice='';error='A confirmed payment could not be announced. Check its receipt below and test this phone again before relying on sound.';redraw();
  try{
   const result=await call('/api/devices/'+encodeURIComponent(current.id),'POST',{action:'heartbeat',soundReady:false,announcementFailed:true});
   ensureIdentity();if(context.identity===lastIdentity&&context.lifecycle===lifecycle&&context.deviceId===deviceId&&deviceCanReceive(own(),session(),context.shopId,shopList()))applyDeviceResult(result);
  }catch{
   ensureIdentity();if(context.identity===lastIdentity&&context.lifecycle===lifecycle){connection='offline';error='A payment announcement failed and Lumo could not update this phone’s status. Check the receipt and connection, then test sound again.';}
  }
  if(context.identity===lastIdentity&&context.lifecycle===lifecycle)redraw();return true;
 }
 function failedAnnouncementsPanel(){
  if(!announcementFailures.length)return '';
  return `<section class="panel devices-failures" aria-label="Failed payment announcements"><div class="panel-heading"><div><h2 class="panel-title">Check these payment receipts</h2><p class="muted text-small">Sound failed for these confirmed receipts. They will not be announced again as new payments.</p></div></div>${announcementFailures.map(entry=>`<article class="devices-failure-row"><span>${icon('alert')}</span><div><strong>${E(entry.reference)}</strong><small>${E(shopList().find(shop=>shop.id===entry.shopId)?.name||'Assigned shop')} · ${when(entry.failedAt)}</small><p>${entry.needsRetest?'Sound needs another test.':'Sound has been retested. Check this receipt before clearing the alert.'}</p></div><div>${config.onOpenTransaction?button('View receipt','failed-receipt','secondary small',`data-id="${E(entry.transactionId)}"`):''}${button('Receipt checked','failure-checked','ghost small',`data-id="${E(entry.transactionId)}" ${entry.needsRetest?'disabled':''}`)}</div></article>`).join('')}</section>`;
 }
 function applyDevices(value,options={}){
  ensureIdentity();const revision=options.revision;
  if(Number.isFinite(revision)&&revision<lastRevision)return false;
  if(Number.isFinite(revision))lastRevision=revision;
  const list=Array.isArray(value)?value:Array.isArray(value?.devices)?value.devices:[];
  const previousConnection=connection,changed=JSON.stringify(devices)!==JSON.stringify(list);devices=list.map(device=>({...device}));authorityVersion++;
  if(options.connection)connectivity(options.connection);else connection='online';
  if(!deviceCanReceive(own(),session(),own()?.shopId,shopList())||audioUnlocked&&(own()?.soundReady===false||own()?.announcementFailed===true))stopVoice();
  if(changed||previousConnection!==connection)redraw();return true;
 }
 function applyDeviceResult(result){
  if(Array.isArray(result?.devices))return applyDevices(result.devices,{revision:result.revision});
  if(result?.device?.id)return applyDevices([...devices.filter(device=>device.id!==result.device.id),result.device],{revision:result.revision});
 }
 async function claimLease(stillCurrent=()=>true){
  const claim=()=>{
   ensureIdentity();if(!stillCurrent()||otherReceiver())return false;
   const s=session();if(!s)return false;
   const lease={tabId,businessId:s.businessId,userId:s.userId,sessionId:s.id||null,expiresAt:now()+leaseDuration};
   try{if(!storage?.setItem)return false;storage.setItem(leaseKey(),JSON.stringify(lease));return ownsLease()}catch{return false}
  };
  const locks=globalThis.navigator?.locks;let claimed;
  if(locks?.request)claimed=await locks.request('lumo-receiver:'+deviceId,{mode:'exclusive'},claim);
  else{claimed=claim();if(claimed)await new Promise(resolve=>setTimeout(resolve,60))}
  if(!claimed||!ownsLease()||!stillCurrent()){if(claimed&&!stillCurrent())releaseLease();return false;}
  if(leaseTimer)clearInterval(leaseTimer);
  leaseTimer=setInterval(()=>{
   if(!ownsLease()||!deviceCanReceive(own(),session(),own()?.shopId,shopList())||connection!=='online'){stopVoice();redraw();return}
   try{const lease=readLease();storage.setItem(leaseKey(),JSON.stringify({...lease,expiresAt:now()+leaseDuration}))}catch{stopVoice();redraw()}
  },4000);leaseTimer?.unref?.();return true;
 }
 async function refresh({heartbeat=false}={}){
  ensureIdentity();if(!session()){devices=[];connectivity('unknown');stopVoice();return}
  const requestVersion=authorityVersion;
  try{
   const result=await call('/api/devices');
   if(Number.isFinite(result?.revision)||requestVersion===authorityVersion)applyDevices(result?.devices||result||[],{revision:result?.revision,connection:'online'});
   if(heartbeat&&own()&&!own().revokedAt&&!otherReceiver()){
    const result=await call('/api/devices/'+encodeURIComponent(own().id||deviceId),'POST',{action:'heartbeat',soundReady:canAnnounce(own().shopId)});
    if(result?.devices)applyDevices(result.devices,{revision:result.revision,connection:'online'});
   }
   error='';
  }catch(e){connectivity('offline');error=e.message||'We cannot reach the receiving-phone service.';redraw()}
 }
 async function run(task,message){if(busy)return;busy=true;error='';notice='';redraw();try{const result=await task();if(result?.devices)applyDevices(result.devices,{revision:result.revision});if(message)notice=message;await refresh()}catch(e){stopVoice();error=e.message||'That action could not be completed.'}finally{busy=false;redraw()}}
 async function start(){ensureIdentity();establishBaseline();if(timer||starting)return;starting=true;const generation=++lifecycle;try{await refresh({heartbeat:true})}finally{starting=false}if(generation!==lifecycle||!session())return;timer=setInterval(()=>{if(session())refresh({heartbeat:true});else{stopVoice();devices=[];redraw()}},20000);timer?.unref?.()}
 function stop(){lifecycle++;testGeneration++;if(timer)clearInterval(timer);timer=null;stopVoice()}
 const browserWindow=globalThis.window;
 browserWindow?.addEventListener?.('storage',event=>{if(event.key===leaseKey()&&!ownsLease()&&audioUnlocked){stopVoice();notice='Another tab is receiving payments on this phone.';redraw()}});
 browserWindow?.addEventListener?.('pagehide',stop);
 browserWindow?.addEventListener?.('offline',()=>setConnection('offline'));
 browserWindow?.addEventListener?.('online',()=>{if(session())refresh({heartbeat:true})});
 function render(){
  ensureIdentity();const s=session();
  if(!s)return `<div class="page-heading"><div><div class="eyebrow">RECEIVING PHONES</div><h1 class="page-title">Keep serving. Hear every payment.</h1><p class="subtitle">Sign in to pair a receiving phone with one of your shops.</p></div></div><div class="callout">${icon('shield')}<span>Receiving-phone access follows the signed-in person and their assigned shops.</span></div>`;
  const current=own(),choices=allowed(),shopId=getCurrentShop(),restorable=canRestorePhone(),replacement=freshOwnerForRevokedPhone(),paired=Boolean(current&&!current.revokedAt&&current.active!==false&&current.sessionValid!==false&&current.userId===s.userId&&current.businessId===s.businessId&&(!current.sessionId||current.sessionId===s.id)),ready=canAnnounce(current?.shopId),shopName=id=>shopList().find(shop=>shop.id===id)?.name||'Shop unavailable';
  return `<div class="devices-workspace"><div class="page-heading"><div><div class="eyebrow">RECEIVING PHONES</div><h1 class="page-title">A clear voice at the right counter.</h1><p class="subtitle">Pair this phone, test its voice and keep an eye on every receiving device.</p></div>${button(icon('refresh')+' Refresh','refresh','secondary',busy?'disabled':'')}</div>${error?`<div class="devices-message error" role="alert">${icon('alert')}<span>${E(error)} Payment success is never inferred while disconnected.</span></div>`:''}${notice?`<div class="devices-message success" role="status">${icon('check')}<span>${E(notice)}</span></div>`:''}${failedAnnouncementsPanel()}<div class="devices-grid"><section class="panel devices-current"><div class="panel-heading"><div><h2 class="panel-title">This receiving phone</h2><p class="muted text-small">Its pairing survives refresh. Your account controls its access.</p></div><span class="badge ${ready?'success':connection==='offline'?'danger':'warning'}">${ready?'Ready to announce':connection==='offline'?'Disconnected':otherReceiver()?'Receiving in another tab':paired?(current.announcementFailed?'Payment sound failed':'Sound needs a tap'):current?.revokedAt?'Revoked':current?.sessionValid===false?'Sign-in needed':'Not paired'}</span></div><div class="devices-status"><span class="devices-orb ${ready?'ready':''}">${icon(ready?'sound':'phone')}</span><div><h3>${paired?E(current.label||'Receiving phone'):'Set up this counter'}</h3><p>${paired?E(shopName(current.shopId)):'Choose the shop this phone serves.'}</p>${paired?`<small>Paired ${when(current.pairedAt||current.createdAt)} · Last voice test ${when(current.testedAt)}</small>`:''}</div></div>${paired?`<div class="devices-action-block">${button(icon('sound')+(ready?' Test voice again':otherReceiver()?' Receiving in another tab':' Tap to enable & test sound'),'test','primary full',busy||otherReceiver()?'disabled':'')}${ready?button('Mute this phone','disable','secondary full',busy?'disabled':''):''}<p class="notice">After a refresh, tap once to allow browser sound. Only one tab on this phone receives announcements. Close the other receiving tab before enabling this one. Keep this tab open. Background and locked-screen delivery require the Android app and phone testing.</p></div>`:`<form class="devices-pair-form" data-form="devices"><label class="field"><span class="label">Phone label</span><input class="input" name="label" required maxlength="70" value="${E(label)}" placeholder="e.g. Night Market counter phone"></label><label class="field"><span class="label">Receiving shop</span><select class="select" name="shopId" required>${choices.map(shop=>`<option value="${E(shop.id)}" ${shop.id===shopId?'selected':''}>${E(shop.name)}</option>`).join('')}</select></label>${current?.revokedAt?restorable?'<label class="field check-line"><input type="checkbox" name="confirmRestore" required><span>I am restoring this revoked phone for my business. I will test its sound before serving.</span></label><p class="notice">This action binds the phone to your fresh owner sign-in. Announcements stay off until the voice test succeeds.</p>':replacement?'<p class="notice">This revoked phone belonged to another team member. Start a new pairing from this owner sign-in to approve it as a replacement.</p>':'<p class="notice">This phone was revoked. A business owner must sign in again before explicitly restoring it or approving a replacement.</p>':''}<button type="submit" class="btn primary full" ${busy||!choices.length||current?.revokedAt&&!restorable?'disabled':''}>${busy?'Pairing…':restorable?'Restore this phone':'Pair this phone'}</button><p class="notice">Pair only a phone used at this counter. No microphone permission is needed.</p><div class="devices-new-pairing"><small>Using a different account on this phone?</small>${button('Start a new phone pairing','new-pairing','ghost small',current?.revokedAt&&!replacement?'disabled':'')}</div></form>`}<div class="devices-health"><span class="dot ${connection==='online'?'online':''}"></span><span>${connection==='online'?'Connected to Lumo':connection==='offline'?'Connection lost. Check the payment list when it returns.':'Checking connection…'}</span></div>${disconnectedAt?`<p class="devices-disconnection-note">Last connection interruption ${when(disconnectedAt)}. Older receipts are not replayed as new payments.</p>`:''}</section><aside class="panel devices-guide"><div class="panel-heading"><h2 class="panel-title">Before you start serving</h2>${icon('shield')}</div><ol><li><strong>Pair the right shop</strong><span>Only payments for that location can be announced here.</span></li><li><strong>Test the exact amount</strong><span>Check the volume in the noise of your counter.</span></li><li><strong>Keep the phone connected</strong><span>A disconnected phone cannot confirm a payment. Use the receipt list to check any missed delivery.</span></li></ol><div class="callout">${icon('check')}<span>Only confirmed receipts announce success. Processing and failed payments stay silent.</span></div></aside></div><section class="panel devices-directory"><div class="panel-heading"><div><h2 class="panel-title">${s.role==='owner'?'Your business receiving phones':'Your receiving phones'}</h2><p class="muted text-small">Revoke a lost phone to end its paired session, then pair the replacement from a fresh sign-in.</p></div><span class="badge neutral">${devices.filter(device=>!device.revokedAt&&device.active!==false).length} paired</span></div>${devices.length?devices.map(device=>{const status=deviceConnection(device),mine=device.id===deviceId||device.deviceId===deviceId;return `<article class="devices-row"><span class="devices-row-icon">${icon(status==='revoked'?'off':'phone')}</span><div><strong>${E(device.label||'Receiving phone')}${mine?' · This phone':''}</strong><span>${E(shopName(device.shopId))}</span><small>Last seen ${when(device.lastSeen)} · Voice tested ${when(device.testedAt)}</small></div><span class="badge ${status==='online'?'success':status==='offline'?'warning':'neutral'}">${status==='online'?'Online':status==='offline'?'Offline':status==='revoked'?'Revoked':status==='signed-out'?'Sign-in needed':status==='muted'?'Muted':'Paired'}</span>${status!=='revoked'&&(s.role==='owner'||device.userId===s.userId)?button('Revoke','revoke','ghost danger small',`data-id="${E(device.id)}" ${busy?'disabled':''}`):''}</article>`}).join(''):'<div class="devices-empty">No receiving phones are paired yet.</div>'}</section><p class="notice">Receiving phones confirm sandbox payments only. No real bank connection or push-notification service is connected.</p></div>`;
 }
 async function handleClick(action,element){
  const a=String(action).replace(/^device-/,'');
  if(a==='failed-receipt'){ensureIdentity();const entry=announcementFailures.find(item=>item.transactionId===element?.dataset?.id);if(entry)config.onOpenTransaction?.(entry.transactionId);return}
  if(a==='failure-checked'){ensureIdentity();const id=element?.dataset?.id;announcementFailures=announcementFailures.filter(entry=>entry.transactionId!==id||entry.needsRetest);saveAnnouncementFailures();redraw();return}
  if(a==='refresh'){await refresh({heartbeat:true});return}
  if(a==='new-pairing'){
   if(!session()||own()?.revokedAt&&!freshOwnerForRevokedPhone()){stopVoice();error='This pairing was revoked or your session ended. A business owner must sign in again before approving a replacement.';redraw();return}
   testGeneration++;stopVoice();clearAnnouncementFailures();deviceId=globalThis.crypto?.randomUUID?.()||`phone-${Date.now()}-${Math.random().toString(36).slice(2)}`;try{storage?.setItem('lumo-receiving-device-id-v2',deviceId)}catch{}
   loadAnnouncementFailures();baseline=false;seen=new Set();selectedShop='';label='';notice='A new pairing is ready for this account. Choose its shop and test the voice. The previous account’s phone record is unchanged.';error='';redraw();return;
  }
  if(a==='test'){
   ensureIdentity();
   if(busy)return;
   const current=own();if(!current){error='Pair this phone before enabling announcements.';redraw();return}
   if(!deviceCanReceive({...current,enabled:true},session(),current.shopId,shopList())){stopVoice();error='This phone no longer has access to that shop. Sign in again or ask the owner to pair it again.';redraw();return}
   if(otherReceiver()){stopVoice();notice='Another tab is already receiving payments on this phone. Close it before enabling this tab.';redraw();return}
   const identity=lastIdentity,generation=lifecycle,wasAnnouncing=canAnnounce(current.shopId),testId=++testGeneration,faultAtStart=failureGeneration,expectedFailureVersion=failureVersion(current);
   const stillCurrent=()=>{ensureIdentity();return identity===lastIdentity&&generation===lifecycle&&testId===testGeneration&&faultAtStart===failureGeneration&&own()?.id===current.id&&failureVersion(own())===expectedFailureVersion};
   const requireCurrent=()=>{if(!stillCurrent())throw Error('The phone or its sound status changed during this test. Play a new voice test before relying on announcements.');};
   busy=true;error='';notice='';redraw();
   try{
    // The explicit test is played in this user gesture. Readiness starts only after it succeeds.
    await config.onTestVoice?.(2500);
    requireCurrent();
    if(!deviceCanReceive({...own(),enabled:true},session(),current.shopId,shopList()))throw Error('This phone no longer has access to that shop. Pair it again from an authorised sign-in.');
    const claimed=await claimLease(stillCurrent);requireCurrent();if(!claimed)throw Error('Another tab is receiving payments, or this browser cannot save a receiver pairing. Close the other tab and try again.');
    // Enabling an already enabled receiver resets its server readiness. Retests
    // preserve the active lease and never pass through that unnecessary mute.
    if(own()?.enabled===false){const enabled=await call('/api/devices/'+encodeURIComponent(current.id),'POST',{action:'enable'});requireCurrent();applyDeviceResult(enabled);requireCurrent();}
    if(!ownsLease()||!deviceCanReceive(own(),session(),current.shopId,shopList()))throw Error('This phone changed during the voice test. Test it again from its current sign-in.');
    requireCurrent();const tested=await call('/api/devices/'+encodeURIComponent(current.id),'POST',{action:'test',soundReady:true,expectedFailureVersion});requireCurrent();applyDeviceResult(tested);requireCurrent();
    await refresh();requireCurrent();if(!ownsLease()||!deviceCanReceive(own(),session(),current.shopId,shopList())||own()?.announcementFailed===true||own()?.soundReady===false)throw Error('This phone could not be authorised to receive announcements.');
    if(!wasAnnouncing)establishBaseline(true);announcementFailures=announcementFailures.map(entry=>({...entry,needsRetest:false}));saveAnnouncementFailures();audioUnlocked=true;connection='online';notice='Voice test completed. This tab is now the receiving counter.';
   }catch(e){
    const heldLease=ownsLease();stopVoice();error=e.message||'Voice could not play. Check your browser sound settings.';
    // A failed audible test cannot leave a stale Ready signal for the owner.
    if((heldLease||wasAnnouncing)&&!otherReceiver()&&identity===lastIdentity&&generation===lifecycle&&deviceCanReceive(own(),session(),current.shopId,shopList()))try{const muted=await call('/api/devices/'+encodeURIComponent(current.id),'POST',{action:'heartbeat',soundReady:false});applyDeviceResult(muted);}catch{}
   }
   finally{busy=false;redraw()}
   return;
  }
  if(a==='disable'){stopVoice();await run(()=>call('/api/devices/'+encodeURIComponent(own()?.id||deviceId),'POST',{action:'disable'}),'Announcements muted on this phone.');return}
  if(a==='revoke'){
   const id=element?.dataset?.id;if(!id)return;
   if(id===own()?.id)stopVoice();
   await run(()=>call('/api/devices/'+encodeURIComponent(id),'POST',{action:'revoke'}),'Receiving phone revoked and its paired session ended. Pair the replacement from a fresh sign-in.');
  }
 }
 async function handleSubmit(form){
  const p=Object.fromEntries(new FormData(form));label=String(p.label||'').trim();selectedShop=String(p.shopId||'');
  if(!session()||own()?.revokedAt&&!canRestorePhone()){stopVoice();error=freshOwnerForRevokedPhone()?'Start a new phone pairing to approve this replacement.':'A business owner must sign in again before restoring a revoked phone.';redraw();return}
  if(own()?.revokedAt&&p.confirmRestore!=='on'){error='Confirm that you are restoring this revoked phone, then pair it and test its sound.';redraw();return}
  if(!label||!allowed().some(shop=>shop.id===selectedShop)){error='Enter a phone label and choose an assigned shop.';redraw();return}
  await run(()=>call('/api/devices','POST',{deviceId,label,shopId:selectedShop}),'Phone paired. Tap Enable & test sound before serving.');
 }
 function handleChange(element){if(element?.name==='label')label=element.value;if(element?.name==='shopId')selectedShop=element.value}
 return {render,handleClick,handleSubmit,handleChange,refresh,start,stop,canAnnounce,getDeviceId:()=>deviceId,hasUnlockedAudio:()=>audioUnlocked,rememberReceipt,consumePayments,applyDevices,update:applyDevices,setConnection,getReceiverLease:()=>readLease(),getTabId:()=>tabId,getDevices:()=>devices.map(device=>({...device})),announcementContext,announcementFailed,clearAnnouncementFailures,getAnnouncementFailures:()=>{ensureIdentity();return announcementFailures.map(entry=>({...entry}))}};
}
