/* Lumo customer experience. Preview services and balances remain simulated. */
(()=>{
const key='lumo-signal-edition-v1';
const fresh=()=>({version:1,onboarded:false,locked:false,profile:{name:'Kwame Mensah',phone:'',campus:'University of Ghana',studentId:'',pin:'',account:'9300123456',handle:'kwame.m'},setup:{step:'phone'},balance:0,txs:[],allowance:{amount:0,date:'',source:'Family'},essentials:[],goals:[],requests:[],notifications:[],prefs:{push:false,payment:true,insights:true,marketing:false},cases:[],feedback:[],missions:[],role:'student',merchant:{approved:false,name:'Akua’s Kitchen',balance:640,collections:[],settlements:[]}});
let storedRaw=null,storageReadFailed=false,state;try{storedRaw=localStorage.getItem(key);}catch{storageReadFailed=true;}try{state=JSON.parse(storedRaw);}catch{}const unreadable=!!storedRaw&&(!state||state.version!==1);if(!state||state.version!==1)state=fresh();
const paths={drop:'<path d="M12 2s-7 8-7 13a7 7 0 0 0 14 0c0-5-7-13-7-13Z"/>',tv:'<rect x="3" y="6" width="18" height="14" rx="3"/><path d="m8 2 4 4 4-4M8 23h8"/>',wifi:'<path d="M2 8a16 16 0 0 1 20 0M5 12a11 11 0 0 1 14 0m-11 4a6 6 0 0 1 8 0"/><circle cx="12" cy="20" r="1"/>',home:'<path d="m3 10 9-7 9 7v10a1 1 0 0 1-1 1h-5v-7H9v7H4a1 1 0 0 1-1-1z"/>',arrowUp:'<path d="M12 20V4m-7 7 7-7 7 7"/>',arrowDown:'<path d="M12 4v16m-7-7 7 7 7-7"/>',plus:'<path d="M12 5v14M5 12h14"/>',arrowRight:'<path d="M4 12h16m-6-6 6 6-6 6"/>',arrowLeft:'<path d="M20 12H4m6-6-6 6 6 6"/>',chevron:'<path d="m9 5 7 7-7 7"/>',chat:'<path d="M21 11.5a8.5 8.5 0 0 1-9 8.5H4l-2 2V11.5a9.5 9.5 0 0 1 19 0Z"/><path d="M7 10h10M7 14h6"/>',plan:'<rect x="4" y="4" width="16" height="17" rx="3"/><path d="M8 2v4m8-4v4M8 11h8m-8 5h5"/>',grid:'<rect x="3" y="3" width="7" height="7" rx="2"/><rect x="14" y="3" width="7" height="7" rx="2"/><rect x="3" y="14" width="7" height="7" rx="2"/><rect x="14" y="14" width="7" height="7" rx="2"/>',user:'<circle cx="12" cy="8" r="4"/><path d="M4 22v-3a8 8 0 0 1 16 0v3"/>',bell:'<path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9M10 21h4"/>',check:'<path d="m5 12 4 4L20 5"/>',close:'<path d="m6 6 12 12M6 18 18 6"/>',clock:'<circle cx="12" cy="12" r="9"/><path d="M12 6v6l4 2"/>',scan:'<path d="M8 3H3v5m13-5h5v5M3 16v5h5m13-5v5h-5M3 12h18"/>',bank:'<path d="m2 8 10-6 10 6H2Zm2 3v7m5-7v7m6-7v7m5-7v7M2 22h20"/>',phone:'<rect x="6" y="2" width="12" height="20" rx="3"/><path d="M10 18h4"/>',shield:'<path d="m12 2 9 4v6c0 5-9 10-9 10S3 17 3 12V6Z"/><path d="m8 12 3 3 5-6"/>',help:'<circle cx="12" cy="12" r="9"/><path d="M9.3 9a2.8 2.8 0 1 1 4.5 2.4c-1.5.7-1.8 1.4-1.8 2.6m0 3h.01"/>',gift:'<rect x="3" y="8" width="18" height="4" rx="1"/><path d="M5 12v9h14v-9M12 8v13"/><path d="M12 8S4 8 5 4c1-4 7 0 7 4Zm0 0s8 0 7-4c-1-4-7 0-7 4Z"/>',target:'<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5"/><circle cx="12" cy="12" r="1"/>',bolt:'<path d="m13 2-9 12h7l-1 8L21 9h-8z"/>',receipt:'<path d="M5 2v20l3-2 4 2 4-2 3 2V2l-3 2-4-2-4 2z"/><path d="M9 9h6m-6 5h6"/>',settings:'<circle cx="12" cy="12" r="4"/><path d="m9 2-1 3-3 1-3 3 2 3-2 3 3 3 3 1 1 3h6l1-3 3-1 3-3-2-3 2-3-3-3-3-1-1-3Z"/>',download:'<path d="M12 3v12m-5-5 5 5 5-5M4 16v5h16v-5"/>',copy:'<rect x="8" y="8" width="13" height="13" rx="2"/><path d="M16 8V3H3v13h5"/>',lock:'<rect x="4" y="10" width="16" height="12" rx="3"/><path d="M8 10V6a4 4 0 0 1 8 0v4"/>',eye:'<path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12Z"/><circle cx="12" cy="12" r="3"/>',search:'<circle cx="10" cy="10" r="7"/><path d="m15 15 6 6"/>',send:'<path d="m22 2-7 20-4-9L2 9Zm0 0L11 13"/>',more:'<circle cx="5" cy="12" r="1"/><circle cx="12" cy="12" r="1"/><circle cx="19" cy="12" r="1"/>',card:'<rect x="2" y="4" width="20" height="16" rx="3"/><path d="M2 9h20M6 15h4"/>',refresh:'<path d="M20 8a8 8 0 0 0-14-3L3 8m0-5v5h5m-4 8a8 8 0 0 0 14 3l3-3m0 5v-5h-5"/>',logout:'<path d="M9 3H3v18h6m6-5 5-4-5-4M8 12h12"/>'};
window.L={state,views:{},route:'welcome',params:{},history:[],e:s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])),icon:(n,size=24)=>`<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths[n]||paths.grid}</svg>`};
// One cedi format for balances, projections, receipts and explanations.
// Fixed two decimals make pesewas and aligned comparisons explicit everywhere.
L.moneyParts=value=>{
 const input=Number(value),amount=Number.isFinite(input)?Math.round(input*100)/100:0;
 const [whole,fraction]=Math.abs(amount).toLocaleString('en-GH',{minimumFractionDigits:2,maximumFractionDigits:2}).split('.');
 return {sign:amount<0?'−':'',currency:'GH₵',whole,fraction};
};
L.formatMoney=value=>{const p=L.moneyParts(value);return p.sign+p.currency+p.whole+'.'+p.fraction;};
L.money=L.formatMoney;
L.clarityRing=()=>'<span class="clarity-ring" aria-hidden="true"></span>';
L.testMode=new URLSearchParams(globalThis.location?.search||'').get('testing')==='1';
const tabRoots=['home','plan','chat','pay','more'];
L.id=prefix=>prefix+'-'+Date.now().toString(36)+'-'+Math.random().toString(36).slice(2,6);
// Only this core owns browser persistence. Every save checks the previously
// observed value; an old tab cannot overwrite a newer committed snapshot.
// Web Locks additionally give real browser tabs one active editing owner.
const cloneState=value=>JSON.parse(JSON.stringify(value));
let lastStored=storedRaw,blockedReason=storageReadFailed?'unavailable':unreadable?'unreadable':'',batchDepth=0,batchDirty=false,batchError=null;
let revision=Math.max(0,Number(state._persistenceMeta?.revision)||0),lastSavedAt=String(state._persistenceMeta?.savedAt||'');
let writerMode=globalThis.navigator?.locks?.request?'pending':'revision',releaseWriter=null,leaseSequence=0,acquiringWriter=null;
const changed=()=>{try{window.dispatchEvent?.(new Event('lumopersistencechange'));}catch{}};
const persistenceError=message=>{const e=Error(message||'This change could not be saved. Review it again before continuing.');e.name='PersistenceError';return e;};
function reason(){return blockedReason||(writerMode==='pending'?'opening':writerMode==='readonly'||writerMode==='released'?'another-tab':'');}
function ensureCurrent(){
 if(reason())return false;
 try{if(localStorage.getItem(key)!==lastStored){blockedReason='stale';changed();return false;}}
 catch{blockedReason='unavailable';changed();return false;}
 return true;
}
function commit(){
 if(!ensureCurrent())return false;
 L.reconcileEssentialCoverage?.();
 // A render that changes no saved facts is not a new commit or conflict.
 try{if(JSON.stringify(L.state)===lastStored)return true;}catch{blockedReason='save-failed';changed();return false;}
 const prior=L.state._persistenceMeta,next={revision:revision+1,savedAt:new Date().toISOString()};
 try{
  L.state._persistenceMeta=next;const raw=JSON.stringify(L.state);localStorage.setItem(key,raw);
  lastStored=raw;revision=next.revision;lastSavedAt=next.savedAt;blockedReason='';
  L.platform?.markSaved?.(lastSavedAt);changed();return true;
 }catch{
  if(prior===undefined)delete L.state._persistenceMeta;else L.state._persistenceMeta=prior;
  blockedReason='save-failed';L.toast?.('Your browser could not save progress. Keep this tab open.');changed();return false;
 }
}
function requireFinancialConnection(label){
 if(globalThis.navigator?.onLine===false||document.querySelector?.('meta[name="lumo-shell-offline"]'))throw persistenceError('Reconnect before '+String(label||'moving money').toLowerCase()+'. Nothing was sent.');
 if(L.platform?.requireOnline?.(label||'This money action')===false)throw persistenceError('Reconnect before continuing. Your draft is kept; nothing was sent.');
}
function transaction(fn,{financial=false,label='Save this change'}={}){
 if(typeof fn!=='function')throw TypeError('A transaction needs an action.');
 if(batchDepth){try{if(!ensureCurrent())throw persistenceError('Resolve the saved-progress warning before continuing.');if(financial)requireFinancialConnection(label);return fn();}catch(error){batchError=error;throw error;}}
 if(!ensureCurrent())throw persistenceError(reason()==='another-tab'?'Use your other Lumo tab, or close it and load the latest progress here.':'Resolve the saved-progress warning before continuing.');
 if(financial)requireFinancialConnection(label);
 const before=cloneState(L.state);batchDepth++;batchDirty=false;batchError=null;
 try{
  const result=fn();if(batchError)throw batchError;batchDepth--;
  if((batchDirty||JSON.stringify(before)!==JSON.stringify(L.state))&&!commit())throw persistenceError('This change could not be saved. Nothing from this attempt was committed. Review it again.');
  return result;
 }catch(error){batchDepth=0;batchDirty=false;L.state=before;changed();throw error;}
 finally{batchDepth=0;batchDirty=false;batchError=null;}
}
function acquireWriter(){
 if(!globalThis.navigator?.locks?.request){writerMode='revision';changed();return Promise.resolve(true);}
 if(writerMode==='writer')return Promise.resolve(true);
 if(acquiringWriter)return acquiringWriter;
 const sequence=++leaseSequence;writerMode='pending';changed();
 let resolveAcquired;const acquired=new Promise(resolve=>{resolveAcquired=value=>{if(acquiringWriter===acquired)acquiringWriter=null;resolve(value);};});acquiringWriter=acquired;
 try{navigator.locks.request('lumo-demo-writer:'+key,{mode:'exclusive',ifAvailable:true},lock=>{
  if(sequence!==leaseSequence){resolveAcquired(false);return;}
  if(!lock){writerMode='readonly';changed();resolveAcquired(false);return;}
  writerMode='writer';changed();resolveAcquired(true);
  const held=new Promise(resolve=>{releaseWriter=resolve;});
  // Boot migrations and a pending initial render are saved only after ownership.
  setTimeout(()=>{if(!reason())L.render?.();},0);
  return held;
 }).catch(()=>{if(sequence===leaseSequence){writerMode='revision';changed();resolveAcquired(true);setTimeout(()=>L.render?.(),0);}});}
 catch{writerMode='revision';changed();resolveAcquired(true);}
 return acquired;
}
L.persistence=Object.freeze({
 version:1,ensureCurrent,transaction,
 status:()=>Object.freeze({blocked:!!reason(),reason:reason(),lastSavedAt,revision,saveFailed:blockedReason==='save-failed',writerMode}),
 retrySave(){if(!['save-failed','unavailable'].includes(blockedReason))return false;blockedReason='';const ok=commit();changed();return ok;},
 requestWriter:acquireWriter,
 reloadLatest(){
  if(typeof location.reload==='function'){location.reload();return true;}
  try{const raw=localStorage.getItem(key),next=JSON.parse(raw);if(!next||next.version!==1)return false;L.state=next;lastStored=raw;revision=Number(next._persistenceMeta?.revision)||0;lastSavedAt=next._persistenceMeta?.savedAt||'';blockedReason='';changed();return true;}catch{return false;}
 },
 resetUnreadable(){if(!['unreadable','unavailable'].includes(blockedReason)||!confirm('Reset the saved demo on this browser? This cannot recover unreadable sample records.'))return false;L.state=fresh();blockedReason='';return commit();},
 release(){leaseSequence++;acquiringWriter=null;releaseWriter?.();releaseWriter=null;writerMode='released';changed();}
});
L.save=()=>{if(!ensureCurrent())return false;L.reconcileEssentialCoverage?.();if(batchDepth){batchDirty=true;return true;}return commit();};
window.addEventListener?.('storage',event=>{if(event.key===key||event.key===null){if(event.newValue!==lastStored){blockedReason='stale';changed();}}});
window.addEventListener?.('pagehide',()=>L.persistence.release());
window.addEventListener?.('pageshow',()=>{if(writerMode==='released')acquireWriter();});
if(writerMode==='pending')acquireWriter();
L.value=id=>(document.getElementById(id)?.value||'').trim();
L.header=(title,sub='')=>`<div class="topline">${tabRoots.includes(L.route)?'<span class="wordmark wordmark-small" aria-hidden="true"><img class="actual-wordmark lumo-wordmark-asset" src="/brand/Lumo-Wordmark-Black.svg" alt="Lumo"></span>':`<button type="button" class="icon-btn" onclick="L.back()" aria-label="Go back">${L.icon('arrowLeft')}</button>`}<span class="eyebrow">${tabRoots.includes(L.route)?({home:'Home',plan:'Plan',chat:'Chats',pay:'Pay',more:'You'}[L.route]):'LUMO'}</span><button type="button" class="icon-btn" onclick="L.go('help',{returnTo:L.route,returnParams:L.params})" aria-label="Get help">${L.icon('help',21)}</button></div><div class="page-heading"><h1>${L.e(title)}</h1>${sub?`<p class="muted">${sub}</p>`:''}</div>`;
L.btn=(label,js,cls='primary')=>`<button type="button" class="${cls}" onclick="${js.replace(/"/g,'&quot;')}">${label}</button>`;
L.row=(label,sub,icon,js,end='')=>`<button type="button" class="row" onclick="${js.replace(/"/g,'&quot;')}"><span class="row-icon">${L.icon(icon)}</span><span class="row-copy"><strong>${L.e(label)}</strong>${sub?`<small>${L.e(sub)}</small>`:''}</span><span class="row-end">${end||L.icon('chevron',18)}</span></button>`;
L.field=(label,id,placeholder='',type='text',value='')=>`<label class="field" for="${id}"><span>${L.e(label)}</span><input class="input" id="${id}" name="${id}" type="${type}" placeholder="${L.e(placeholder)}" value="${L.e(value)}" ${type==='number'?'inputmode="decimal" min="0" max="1000000" step="0.01"':type==='tel'?'inputmode="tel" autocomplete="tel-national"':type==='password'?'autocomplete="off" inputmode="numeric"':'autocomplete="off"'}></label>`;
L.toast=msg=>{const el=document.getElementById('toast');if(el){el.textContent=msg;el.classList.add('show');clearTimeout(L.toastTimer);L.toastTimer=setTimeout(()=>el.classList.remove('show'),3400);}};
L.error=(msg,fieldId)=>{const el=document.getElementById('error');if(el){el.setAttribute('role','alert');el.setAttribute('tabindex','-1');el.textContent=msg;const field=fieldId&&document.getElementById(fieldId);if(field){field.setAttribute('aria-invalid','true');const descriptions=new Set(String(field.getAttribute('aria-describedby')||'').split(/\s+/).filter(Boolean));descriptions.add('error');field.setAttribute('aria-describedby',[...descriptions].join(' '));field.focus?.();}else el.focus?.({preventScroll:true});el.scrollIntoView?.({block:'nearest',behavior:window.matchMedia?.('(prefers-reduced-motion: reduce)').matches?'auto':'smooth'});}else L.toast(msg);};
// Clear only the transient error relationship; permanent field hints remain.
L.clearFieldError=field=>{if(field?.getAttribute?.('aria-invalid')!=='true')return;field.removeAttribute('aria-invalid');const descriptions=String(field.getAttribute('aria-describedby')||'').split(/\s+/).filter(token=>token&&token!=='error');if(descriptions.length)field.setAttribute('aria-describedby',descriptions.join(' '));else field.removeAttribute('aria-describedby');};
L.download=(name,txt,type='text/plain')=>{const url=URL.createObjectURL(new Blob([txt],{type}));const a=document.createElement('a');a.href=url;a.download=name;document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);};
L.copy=async txt=>{try{await navigator.clipboard.writeText(txt);L.toast('Copied.');}catch{L.toast('Copy is unavailable. Press and hold the details to copy.');}};
const coverageCash=n=>Math.round(Math.max(0,Number(n)||0)*100)/100;
// Coverage comes from current confirmed transactions, never a capped per-payment
// snapshot. Pending money is reserved separately and does not become paid twice.
L.confirmedEssentialPaid=(id,state=L.state)=>(state.txs||[]).filter(t=>t.type==='out'&&t.status==='success'&&t.essentialId===id).reduce((sum,t)=>{
 const refunds=(state.txs||[]).filter(r=>r.type==='in'&&r.status==='success'&&r.originalId===t.id).reduce((n,r)=>n+coverageCash(r.amount),0);
 return coverageCash(sum+Math.max(0,coverageCash(t.amount)-Math.max(coverageCash(t.refunded),refunds)));
},0);
L.reconcileEssentialCoverage=(state=L.state)=>{for(const essential of state.essentials||[]){const confirmed=L.confirmedEssentialPaid(essential.id,state);if(essential.coverageVersion!==1){
 // Legacy paid includes linked payments and any amount marked paid elsewhere.
 // Preserve only the unexplained remainder; migration never changes money.
 essential.externalPaid=coverageCash(Math.max(0,coverageCash(essential.paid)-Math.min(coverageCash(essential.amount),confirmed)));
 essential.coverageVersion=1;
 }essential.externalPaid=coverageCash(essential.externalPaid);essential.paid=Math.min(coverageCash(essential.amount),coverageCash(essential.externalPaid+confirmed));}};
L.markEssentialCoveredOutside=id=>{L.reconcileEssentialCoverage();const essential=L.state.essentials.find(x=>x.id===id);if(!essential)return;essential.externalPaid=coverageCash(Math.max(0,Number(essential.amount)-L.confirmedEssentialPaid(id)));L.reconcileEssentialCoverage();};
L.balances=()=>{L.reconcileEssentialCoverage();const s=L.state;const held=s.txs.filter(t=>t.status==='pending'&&t.fundingAccount!=='virtual-card'&&(t.type==='out'||t.internalTransfer&&(t.boxDirection==='in'||t.cardDirection==='in'))).reduce((a,t)=>a+Number(t.amount)+Number(t.fee||0),0);if(L.pauseEngine?.planPosition){const p=L.pauseEngine.planPosition({amount:0,fee:0},s);return {current:s.balance,held:coverageCash(held),available:p.available,essentials:p.essentialsBefore,allocated:p.allocated,room:p.roomBefore,gap:p.totalGapBefore};}const available=coverageCash(Math.max(0,s.balance-held));const essentials=coverageCash(s.essentials.reduce((a,x)=>{const progress=s.txs.filter(t=>t.essentialId===x.id&&t.type==='out'&&t.status==='pending').reduce((v,t)=>v+Number(t.amount),0);return a+Math.max(0,Number(x.amount)-Number(x.paid||0)-progress);},0));const allocated=s.accounts?.version===2?0:coverageCash(s.goals.reduce((a,x)=>a+Number(x.allocated||0),0));const room=available-essentials-allocated;return {current:s.balance,held:coverageCash(held),available,essentials,allocated,room:coverageCash(Math.max(0,room)),gap:coverageCash(Math.max(0,-room))};};
L.addTx=data=>transaction(()=>{if(L.state.closed||L.state.locked)throw Error('Sign in to an open demo account before paying');L.reconcileEssentialCoverage();if(data.draftId){const old=L.state.txs.find(t=>t.draftId===data.draftId&&['pending','success'].includes(t.status));if(old)return old;}const tx={id:L.id('LM'),date:new Date().toISOString(),fee:0,category:'Other',...data};tx.amount=Number(tx.amount);tx.fee=Number(tx.fee||0);if(!Number.isFinite(tx.amount)||!Number.isFinite(tx.fee)||!(tx.amount>0)||tx.fee<0)throw Error('Invalid amount');if(tx.type==='out'&&['pending','success'].includes(tx.status)&&tx.amount+tx.fee>L.balances().available+.001)throw Error('Not enough available money');if(tx.status==='success')L.state.balance=coverageCash(L.state.balance+(tx.type==='in'?tx.amount:-(tx.amount+tx.fee)));L.state.txs.unshift(tx);L.save();return tx;},{financial:true,label:'Complete this sample payment'});
L.resolveTx=(id,status)=>transaction(()=>{const tx=L.state.txs.find(t=>t.id===id);if(!tx||tx.status!=='pending')return tx;if(!['success','failed','reversed'].includes(status))return tx;L.reconcileEssentialCoverage();if(status==='success')L.state.balance=coverageCash(L.state.balance+(tx.type==='in'?tx.amount:-(tx.amount+tx.fee)));tx.status=status;tx.updatedAt=new Date().toISOString();L.save();return tx;},{financial:true,label:'Confirm this sample payment status'});
// Route drafts stay in memory and never include PINs or verification codes.
const formRoutes=new Set(['allowance','essentialEdit','goalEdit','allocate','releaseGoal','feedback','chat','storyTx']);
const formDrafts=new Map();
const formKey=(route=L.route,params=L.params)=>route+'|'+(params.id||'');
L.captureFormDraft=()=>{if(!formRoutes.has(L.route))return;const fields=[...document.getElementById('view')?.querySelectorAll('input,select,textarea')||[]].filter(e=>e.id&&e.type!=='password'&&!/pin|verification|otp|password/i.test(e.id));if(fields.length)formDrafts.set(formKey(),fields.map(e=>({id:e.id,value:e.value,checked:e.checked})));};
L.clearFormDraft=(route=L.route,params=L.params)=>formDrafts.delete(formKey(route,params));
L.finishForm=(route,params={})=>{L.clearFormDraft();L.skipFormCapture=true;try{L.go(route,params);}finally{L.skipFormCapture=false;}};
L.moneyInput=(value,min=0,max=1000000)=>{const n=Number(value);return Number.isFinite(n)&&n>=min&&n<=max&&Math.abs(n*100-Math.round(n*100))<.000001?Math.round(n*100)/100:null;};
L.restoreFormDraft=()=>{for(const field of formDrafts.get(formKey())||[]){const el=document.getElementById(field.id);if(el){el.value=field.value;if(typeof field.checked==='boolean')el.checked=field.checked;}}};
L.syncBrowser=mode=>{if(!window.history?.replaceState)return;const snapshot={lumo:true,route:L.route,params:L.params,stack:L.history};try{window.history[mode==='push'?'pushState':'replaceState'](snapshot,'');L.browserReady=true;}catch{}};
L.go=(route,params={})=>{if(!L.views[route]){L.toast('This screen is unavailable. Please try again.');return;}if(route===L.route&&JSON.stringify(params)===JSON.stringify(L.params)){L.render();return;}if(!L.skipFormCapture)L.captureFormDraft();L.beforeNavigate?.(route,params);L.syncBrowser('replace');const changed=route!==L.route;if(changed)L.history.push({route:L.route,params:L.params});L.route=route;L.params=params;L.routeChanging=true;L.render();L.routeChanging=false;L.syncBrowser(changed?'push':'replace');};
L.openTab=route=>{if(!tabRoots.includes(route))return;if(route===L.route)return;L.captureFormDraft();L.beforeNavigate?.(route,{});L.syncBrowser('replace');L.history=[];L.route=route;L.params={};L.routeChanging=true;L.render();L.routeChanging=false;L.syncBrowser('push');};
L.back=()=>{if(window.history?.state?.lumo&&L.history.length&&window.history.length>1){window.history.back();return;}const prev=L.history.pop();L.captureFormDraft();L.beforeNavigate?.(prev?.route||'home',prev?.params||{});if(prev){L.route=prev.route;L.params=prev.params;L.render();}else {L.route=L.state.onboarded?'home':'welcome';L.params={};L.render();}};
window.addEventListener('popstate',event=>{if(!event.state?.lumo)return;L.captureFormDraft();L.beforeNavigate?.(event.state.route,event.state.params||{});L.route=event.state.route;L.params=event.state.params||{};L.history=event.state.stack||[];L.render();});
L.guard=()=>{
 if(!L.testMode&&['testing','sampleConfirm','resetConfirm','pauseDemo','pauseLog'].includes(L.route)){L.route=L.state.onboarded?'home':'welcome';L.params={};}
 const open=['welcome','phone','otp','identity','livecheck','identityResult','campus','campusInterest','campusInterestSaved','campusStatus','pilotUnavailable','pin','confirmPin','accountReview','accountReady','applicationCorrection','applicationStatus','setupChoice','setupProgress','signin','recovery','recoveryOwnership','recoveryReplacement','recoveryStatus','privacyNotice','help','supportCase','testing','feedback','resetConfirm','sampleConfirm'];
 const records=['accountInfo','statements','dataExport','privacy','closeAccount','help','supportCase','caseDetail','testing','feedback','resetConfirm','sampleConfirm','welcome','actionConfirm'];
 const access=['signin','recovery','recoveryOwnership','recoveryReplacement','recoveryStatus','privacyNotice'];
 const signupOnly=['phone','otp','identity','livecheck','identityResult','campus','campusInterest','campusInterestSaved','campusStatus','pilotUnavailable','pin','confirmPin','accountReview','applicationCorrection','applicationStatus','setupChoice','setupProgress'];
 const recovering=L.state.setup?.recovery;
 const recoveryAllowed=(['phone','otp'].includes(L.route)&&recovering&&['recovery','replacement'].includes(L.params.purpose||L.state.setup?.otpPurpose))||(['pin','confirmPin'].includes(L.route)&&L.params.mode==='recovery'&&recovering?.status==='approved');
 if(L.state.onboarded&&signupOnly.includes(L.route)&&!recoveryAllowed){L.route=L.state.locked?'signin':'home';L.params={};}
 // Authentication is resolved before the closed-account destination. Public
 // Help never makes a saved private case or a retained account record public.
 if((L.state.locked||(!L.state.onboarded&&!L.route.startsWith('merchant')&&!['settlements','settlementDetail'].includes(L.route)))&&!open.includes(L.route)){
  L.state.setup=L.state.setup||{};L.state.setup.signinReturn=L.state.closed?'accountInfo':['pause','authorize'].includes(L.route)?'paymentReview':L.route;L.state.setup.signinReturnParams=L.state.closed?{}:L.params;L.route='signin';L.params={};return;
 }
 if(L.state.closed&&!records.includes(L.route)&&!access.includes(L.route)&&!recoveryAllowed){L.route=L.state.locked?'signin':'accountInfo';L.params={};}
};L.render=()=>{
 L.guard();const el=document.getElementById('view');if(!el)return;const inTask=!!L.taskSheet?.active;const keepChatFocus=L.route==='chat'&&!L.routeChanging&&document.activeElement?.id==='chatText';
 try{el.innerHTML=`<div class="screen screen-${L.route}">${L.decorateView?L.decorateView(L.views[L.route]?.()||'',L.route):(L.views[L.route]?.()||'<p>Open Lumo from Home.</p>')}</div>`;}catch(err){console.error(err);el.innerHTML=L.header('Let’s try that again','Your progress is saved.')+L.btn('Go to Home',"L.openTab('home')");}
 // A task owns only its outlet. Keep the mounted page and navigation intact.
 if(!inTask)document.getElementById('app')?.setAttribute('data-route',L.route);
 const nav=document.getElementById('nav');if(nav&&!inTask){nav.hidden=!tabRoots.includes(L.route)||!L.state.onboarded||L.state.locked||L.state.closed;nav.innerHTML=tabRoots.map((r,i)=>`<button type="button" class="nav-item ${L.route===r?'active':''}" onclick="L.openTab('${r}')" ${L.route===r?'aria-current="page"':''}>${L.icon(['home','plan','chat','grid','user'][i],23)}<span>${['Home','Plan','Chats','Pay','You'][i]}</span></button>`).join('');}
 const strip=document.querySelector('.demo-strip');if(strip)strip.hidden=!L.testMode;
 L.restoreFormDraft();const error=document.getElementById('error');if(error)error.setAttribute('role','alert');
 window.scrollTo?.(0,0);el.scrollTo?.(0,0);
 const heading=el.querySelector('h1')||el.querySelector('.screen');if(heading){heading.setAttribute('tabindex','-1');if(!keepChatFocus)heading.focus?.({preventScroll:true});}if(keepChatFocus)document.getElementById('chatText')?.focus?.({preventScroll:true});
 if(L.route==='chat'){const thread=el.querySelector('.chat-thread');if(thread)thread.scrollTop=thread.scrollHeight;}
 L.save();L.motion?.();if(!L.routeChanging)L.syncBrowser('replace');
};
document.getElementById('view')?.addEventListener?.('input',event=>L.clearFieldError(event.target));
L.reset=()=>{formDrafts.clear();L.state=fresh();L.save();L.history=[];L.route='welcome';L.params={};L.render();};
L.explore=()=>{formDrafts.clear();const s=fresh();s.onboarded=true;s.profile={...s.profile,phone:'0241230123',studentId:'10901234',pin:'123456'};s.balance=920;s.allowance={amount:1200,date:new Date(Date.now()+10*86400000).toISOString().slice(0,10),source:'Family'};s.essentials=[{id:'ess-food',name:'Food & groceries',amount:180,paid:0,date:new Date(Date.now()+5*86400000).toISOString().slice(0,10)},{id:'ess-transport',name:'Transport to lectures',amount:100,paid:0,date:new Date(Date.now()+8*86400000).toISOString().slice(0,10)},{id:'ess-data',name:'Data for the week',amount:40,paid:0,date:new Date(Date.now()+2*86400000).toISOString().slice(0,10)}];s.goals=[{id:'goal-laptop',name:'My next laptop',target:3500,allocated:200,emoji:'⌘'}];s.txs=[{id:'LM-sample-1',date:new Date().toISOString(),type:'out',name:'Akua’s Kitchen',amount:35,fee:0,status:'success',category:'Food',method:'Campus Pay',note:'Lunch on campus'},{id:'LM-sample-2',date:new Date(Date.now()-86400000).toISOString(),type:'out',name:'MTN Data',amount:45,fee:0,status:'success',category:'Data',method:'Data',delivery:'delivered'},{id:'LM-sample-3',date:new Date(Date.now()-2*86400000).toISOString(),type:'in',name:'Allowance from Mum',amount:1000,fee:0,status:'success',category:'Allowance',method:'Bank transfer'}];L.state=s;L.save();L.history=[];L.route='home';L.params={};L.render();};
L.art=()=>`<svg viewBox="0 0 360 170" class="money-art" aria-hidden="true"><defs><pattern id="weave" width="16" height="16" patternUnits="userSpaceOnUse"><path d="M0 0h8v8H0zm8 8h8v8H8z" fill="#b5e96a"/><path d="m0 8 8 8m0-16 8 8" stroke="#27352a" stroke-width="1.5"/></pattern></defs><ellipse cx="184" cy="154" rx="150" ry="7" fill="#eaece5"/><path d="M280 151V58c0-14 34-14 34 0v93" fill="#e6e9df"/><path d="M273 67h48m-42 18h36m-36 19h36" stroke="#c2c8b9"/><path d="m78 151 14-67 61 1 21 66" fill="url(#weave)" stroke="#20271f" stroke-width="2"/><path d="M106 86V60c-19-9-17-41 4-45 32-5 43 30 19 45v27" fill="#fafaf7" stroke="#20271f" stroke-width="2"/><path d="M93 35c1-26 38-29 44-3l-18-4-5 11-8-8-9 7" fill="#27352a"/><path d="m111 48 5 2 5-2m-20 3 5 1m17-12h2" fill="none" stroke="#27352a" stroke-width="2"/><path d="m145 97 21 28 40-23" fill="none" stroke="#27352a" stroke-width="11" stroke-linecap="round"/><rect x="197" y="72" width="31" height="48" rx="6" transform="rotate(12 197 72)" fill="#fafaf7" stroke="#27352a" stroke-width="2"/><path d="m205 88 6 6 9-10" fill="none" stroke="#27352a" stroke-width="2"/><path d="m58 103-7 15m197-78 8-8m-2 27h12" stroke="#27352a" stroke-width="2" stroke-linecap="round"/><circle cx="239" cy="30" r="13" fill="#b5e96a"/><path d="m234 30 4 4 6-8" fill="none" stroke="#27352a" stroke-width="2"/></svg>`;
})();
