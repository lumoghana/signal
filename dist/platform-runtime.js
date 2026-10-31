/* Connection, safe shell updates and saved-state status. No financial authority,
   provider queue, extra persistence reader or automatic payment retry. */
(()=>{
'use strict';
if(!window.L)return;
let online=(typeof navigator.onLine==='boolean'?navigator.onLine:true)&&!document.querySelector?.('meta[name="lumo-shell-offline"]');
let reconnectedAt='',lastSavedAt='',registration=null,updateReady=false,shellReady=false,reconnecting=false,updateRequested=false;
let controlledBefore=!!navigator.serviceWorker?.controller;
let connectionCheck=0;
const protectedActions=new Set(['L.authorizePayment','L.addTx','L.resolveTx','L.confirmAllocation','L.confirmRelease','L.simulateBankReceipt','L.simRequestCredit']);
const alteredControls=new Map();
const iso=value=>{const date=value instanceof Date?value:new Date(value);return Number.isFinite(date.getTime())?date.toISOString():'';};
const persistence=()=>{try{return L.persistence?.status?.()||{};}catch{return {};}};
const clock=at=>{try{return new Date(at).toLocaleTimeString('en-GH',{hour:'2-digit',minute:'2-digit'});}catch{return '';}};
const state=()=>Object.freeze({online,lastSavedAt:persistence().lastSavedAt||lastSavedAt,reconnectedAt,shellReady,updateReady,reconnecting});
const message=()=>{
 const saved=state().lastSavedAt,when=saved?' Last saved on this browser at '+clock(saved)+'.':'';
 if(reconnecting)return 'Checking the connection. Your draft is kept. Nothing will be sent automatically.'+when;
 if(!online)return 'You’re offline. View saved sample records and keep your draft. Money actions need a connection.'+when;
 if(reconnectedAt)return 'Connection available again. Review your details before trying a money action. Nothing was sent automatically.'+when;
 return '';
};
const node=()=>document.getElementById('view')?.querySelector?.('.screen')||document.getElementById('view');
function restoreControls(){
 for(const [control,previous] of alteredControls){
  if(control.isConnected!==false){control.disabled=previous.disabled;if(previous.aria===null)control.removeAttribute('aria-disabled');else control.setAttribute('aria-disabled',previous.aria);if(previous.described===null)control.removeAttribute('aria-describedby');else control.setAttribute('aria-describedby',previous.described);}
 }
 alteredControls.clear();
}
const namesIn=source=>[...protectedActions].some(name=>String(source||'').includes(name+'(')||String(source||'').includes(name+' ('));
function syncControls(){
 restoreControls();if(online)return;
 const root=document.getElementById('view');if(!root)return;
 for(const control of root.querySelectorAll('button,input[type=submit]')){
  const form=control.closest?.('form'),submits=control.type==='submit'||control.getAttribute('type')==='submit';
  if(!namesIn(control.getAttribute('onclick'))&&!(submits&&namesIn(form?.getAttribute('onsubmit'))))continue;
  alteredControls.set(control,{disabled:!!control.disabled,aria:control.getAttribute('aria-disabled'),described:control.getAttribute('aria-describedby')});
  control.disabled=true;control.setAttribute('aria-disabled','true');
  const ids=new Set(String(control.getAttribute('aria-describedby')||'').split(/\s+/).filter(Boolean));ids.add('platform-connection-status');control.setAttribute('aria-describedby',[...ids].join(' '));
 }
}
function sync(){
 const root=node();if(!root)return;
 const text=message();let status=root.querySelector?.('#platform-connection-status');
 if(text){
  if(!status){status=document.createElement('section');status.id='platform-connection-status';status.className='platform-connection-status';status.setAttribute('role','status');status.setAttribute('aria-live','polite');status.setAttribute('aria-atomic','true');const copy=document.createElement('p');copy.className='platform-status-copy';status.append(copy);root.prepend(status);}
  const copy=status.querySelector('.platform-status-copy');if(copy.textContent!==text)copy.textContent=text;
  status.setAttribute('data-connection',online?'restored':'offline');
  let action=status.querySelector('button');const kind=online?'dismiss':'retry';
  if(action?.getAttribute('data-action')!==kind){action?.remove();action=document.createElement('button');action.type='button';action.className='platform-status-dismiss';action.setAttribute('data-action',kind);action.addEventListener('click',()=>{if(online){reconnectedAt='';sync();}else checkConnection();});status.append(action);}
  action.textContent=online?'Got it':reconnecting?'Checking connection…':'Try connection again';action.disabled=reconnecting;
 }else status?.remove?.();
 let update=root.querySelector?.('#platform-update-status');
 if(updateReady){
  if(!update){update=document.createElement('section');update.id='platform-update-status';update.className='platform-update-status';update.setAttribute('role','status');const copy=document.createElement('p');copy.textContent='An updated preview is ready. Finish or save your draft before reloading.';const button=document.createElement('button');button.type='button';button.className='platform-update-button';button.textContent='Reload updated preview';button.addEventListener('click',applyUpdate);update.append(copy,button);root.prepend(update);}
 }else update?.remove?.();
 document.getElementById('app')?.setAttribute?.('data-connection',online?'online':'offline');syncControls();
}
function requireOnline(label='This money action'){
 if(online)return true;
 sync();const text=String(label||'This money action')+' needs a connection. Your draft is kept; nothing was sent.';
 if(document.getElementById('error'))L.error?.(text);else L.toast?.(text);
 return false;
}
function hasUnfinishedWork(){
 if(L.taskSheet?.active)return true;
 if(String(document.getElementById('chatText')?.value||'').trim())return true;
 const draft=L.state?.paymentDraft;
 return !!(draft&&!draft.submittedTxId)||!!L.platformHasUnfinishedWork?.();
}
function applyUpdate(){
 if(!updateReady)return false;
 if(hasUnfinishedWork()){L.toast?.('Finish or leave your current task before reloading. Your draft has not been discarded.');return false;}
 if(persistence().blocked){L.toast?.('Resolve the saved-progress warning before reloading.');return false;}
 updateRequested=true;if(registration?.waiting)registration.waiting.postMessage({type:'LUMO_ACTIVATE_UPDATE'});else location.reload();return true;
}
async function checkConnection(){
 if(reconnecting)return false;const token=++connectionCheck;online=false;reconnecting=true;sync();let timeout,abort;
 try{
  if(typeof fetch!=='function')throw Error('Connection check unavailable');
  if(typeof AbortController==='function')abort=new AbortController();
  const response=await Promise.race([fetch('/manifest.webmanifest?lumo-connection-check=1',{cache:'no-store',credentials:'same-origin',...(abort?{signal:abort.signal}:{})}),new Promise((_,reject)=>{timeout=setTimeout(()=>{abort?.abort();reject(Error('Connection check timed out'));},8000);})]);
  if(!response.ok)throw Error('App origin unavailable');
  const manifest=await response.json();if(typeof manifest.name!=='string'||typeof manifest.start_url!=='string')throw Error('Unexpected connection response');
  if(token!==connectionCheck||navigator.onLine===false)return false;
  // The safe cached-shell marker is an early-boot money guard. Retire it only
  // after this verified origin response, never on an optimistic online event.
  document.querySelector?.('meta[name="lumo-shell-offline"]')?.remove?.();
  online=true;reconnectedAt=new Date().toISOString();return true;
 }catch{if(token===connectionCheck){online=false;reconnectedAt='';}return false;}
 finally{clearTimeout(timeout);if(token===connectionCheck){reconnecting=false;sync();}}
}
function observeRegistration(value){
 registration=value;shellReady=!!navigator.serviceWorker?.controller;
 if(value.waiting){updateReady=true;sync();}
 value.addEventListener?.('updatefound',()=>{const installing=value.installing;installing?.addEventListener?.('statechange',()=>{if(installing.state==='installed'){shellReady=true;if(navigator.serviceWorker?.controller){updateReady=true;sync();}}});});
 return value;
}
async function registerShell(){
 if(!('serviceWorker' in navigator)||!window.isSecureContext)return {supported:false};
 try{return observeRegistration(await navigator.serviceWorker.register('/sw.js',{scope:'/',updateViaCache:'none'}));}
 catch{L.toast?.('Offline preview setup is unavailable. Keep a connection when reopening Lumo.');return {supported:true,ready:false};}
}
const api={
 requireOnline,canMoveMoney:()=>online&&!persistence().blocked,connection:state,
 markSaved(value){const at=iso(value||Date.now());if(at)lastSavedAt=at;sync();},
 registerMoneyActions(names=[]){for(const name of names)if(/^L\.[A-Za-z_$][\w$]*(?:\.[A-Za-z_$][\w$]*)*$/.test(name))protectedActions.add(name);syncControls();},
 registerShell,applyUpdate,checkConnection,sync
};
L.platform=Object.freeze(api);
const render=L.render;L.render=function(...args){const result=render.apply(this,args);sync();return result;};
window.addEventListener('offline',()=>{connectionCheck++;online=false;reconnecting=false;reconnectedAt='';sync();});
window.addEventListener('online',()=>{checkConnection();});
document.addEventListener?.('visibilitychange',()=>{if(!document.hidden){const available=typeof navigator.onLine==='boolean'?navigator.onLine:true;if(!available){connectionCheck++;online=false;reconnecting=false;reconnectedAt='';}else if(!online&&!reconnecting)checkConnection();sync();}});
navigator.serviceWorker?.addEventListener?.('controllerchange',()=>{
 shellReady=true;
 // A user-requested update is the only reload path. Initial activation is calm.
 if(updateRequested&&!hasUnfinishedWork()&&!persistence().blocked){updateReady=false;location.reload();}
 else{if(controlledBefore)updateReady=true;controlledBefore=true;sync();}
});
sync();
})();
