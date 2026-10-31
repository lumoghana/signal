/* Final durable boundary and recovery UI. Core alone reads saved state. */
(()=>{
'use strict';
if(!window.L?.persistence)return;
// Enclose the final feature chain, including automatic savings and the Budget
// result, so a receipt cannot describe an incompletely committed payment.
for(const name of ['addTx','resolveTx']){
 const original=L[name];if(typeof original!=='function')continue;
 L[name]=function(...args){return L.persistence.transaction(()=>original.apply(this,args),{financial:true,label:name==='addTx'?'Complete this sample payment':'Confirm this sample payment status'});};
}
let shown='',previousFocus=null,previousInert=new Map();
const content={
 opening:['Opening saved progress','Checking which Lumo tab can save changes. Your draft stays here.'],
 'another-tab':['Lumo is open in another tab','Use that tab to continue. To continue here, close the other tab, then check again. This prevents two tabs changing the same sample money.'],
 stale:['Newer progress is saved','Another tab changed this demo. Load the latest progress before continuing. Any unfinished edits on this screen will be replaced.'],
 'save-failed':['This change could not be saved','The attempt was stopped. Keep this tab open and check saving again. Nothing will be sent or retried automatically.'],
 unavailable:['Saved progress is unavailable','This browser is not allowing access to saved progress. Keep this tab open. Allow site storage, then check again.'],
 unreadable:['Saved progress could not be opened','The saved demo is unreadable. Keep a copy of unfinished details before resetting this browser’s sample. Resetting cannot recover its records.']
};
const escape=s=>L.e(String(s||''));
function sync(){
 const status=L.persistence.status(),reason=status.reason;let overlay=document.getElementById('persistence-recovery');
 if(!status.blocked){
  if(overlay){overlay.remove();for(const [node,inert]of previousInert)if(node.isConnected!==false)node.inert=inert;previousInert.clear();const focus=previousFocus?.isConnected!==false?previousFocus:document.getElementById('view')?.querySelector('h1');previousFocus=null;shown='';focus?.focus?.({preventScroll:true});}
  return;
 }
 if(!overlay){
  previousFocus=document.activeElement;
  overlay=document.createElement('section');overlay.id='persistence-recovery';overlay.className='persistence-recovery';overlay.setAttribute('role','dialog');overlay.setAttribute('aria-modal','true');overlay.setAttribute('aria-labelledby','persistence-title');overlay.setAttribute('aria-describedby','persistence-copy');overlay.setAttribute('tabindex','-1');
  overlay.addEventListener('keydown',event=>{if(event.key==='Tab'){const controls=[...overlay.querySelectorAll('button:not(:disabled),textarea')];if(!controls.length){event.preventDefault();overlay.focus();return;}const first=controls[0],last=controls[controls.length-1];if(event.shiftKey&&(document.activeElement===first||document.activeElement===overlay)){event.preventDefault();last.focus();}else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first.focus();}}});
  document.body.append(overlay);
 }
 // Task outlets may be replaced while a transaction unwinds. Cover all app
 // children, preserving each pre-existing inert value for native task focus.
 const app=document.getElementById('app');if(app&&!previousInert.has(app)){previousInert.set(app,!!app.inert);app.inert=true;}
 if(shown===reason)return;shown=reason;
 const [title,copy]=content[reason]||content.unavailable;
 const time=status.lastSavedAt?new Date(status.lastSavedAt).toLocaleString('en-GH',{dateStyle:'medium',timeStyle:'short'}):'';
 let actions='';
 if(reason==='another-tab')actions='<button type="button" class="primary" onclick="L.persistenceRecovery.checkTab(this)">Check again</button>';
 if(['save-failed','unavailable'].includes(reason))actions='<button type="button" class="primary" onclick="L.persistenceRecovery.retry(this)">Check saving again</button>';
 if(reason==='stale'||reason==='another-tab')actions+='<button type="button" class="secondary" onclick="L.persistenceRecovery.reload()">Load latest progress</button>';
 if(reason==='unreadable')actions='<button type="button" class="secondary" onclick="L.persistence.resetUnreadable()">Reset this browser’s demo</button>';
 if(reason!=='opening')actions+='<button type="button" class="text-btn" onclick="L.persistenceRecovery.details()">Keep unfinished details</button>';
 overlay.innerHTML='<div class="persistence-panel"><span class="eyebrow">Saved progress</span><h1 id="persistence-title">'+escape(title)+'</h1><p id="persistence-copy">'+escape(copy)+'</p>'+(time?'<p class="muted persistence-saved">Last saved on this browser: '+escape(time)+'.</p>':'')+'<div class="persistence-actions">'+actions+'</div><p id="persistence-result" role="status" aria-live="polite"></p><div id="persistence-details"></div></div>';
 overlay.focus?.({preventScroll:true});
}
L.persistenceRecovery=Object.freeze({
 sync,
 async checkTab(button){button.disabled=true;await L.persistence.requestWriter();shown='';sync();if(L.persistence.status().blocked){const result=document.getElementById('persistence-result');if(result)result.textContent='The other tab is still active, or newer progress needs loading.';}},
 retry(button){button.disabled=true;const ok=L.persistence.retrySave();if(ok){sync();L.toast('Saving is available again. Review your details before continuing.');}else{button.disabled=false;shown='';sync();}},
 reload(){if(confirm('Load the latest saved progress? Unfinished edits on this screen will be replaced. Copy the details first if you need them.'))L.persistence.reloadLatest();},
 details(){
  // An explicit small projection, never raw state, PINs, auth, evidence or cases.
  const drafts=[L.state.paymentDraft,L.state.groupMoney?.contributionDraft,L.state.groupMoney?.payoutDraft].filter(Boolean);
  const lines=['Unfinished Lumo sample details — check against current saved progress before trying again.'];
  for(const draft of drafts){const safe={};for(const key of ['amount','fee','name','recipientName','note','purpose','method','rail','collectionId'])if(['string','number'].includes(typeof draft[key]))safe[key]=String(draft[key]).slice(0,240);if(Object.keys(safe).length)lines.push(JSON.stringify(safe,null,2));}
  if(lines.length===1)lines.push('No supported unfinished payment details are available.');
  const host=document.getElementById('persistence-details');if(!host)return;host.innerHTML='<label class="field" for="persistence-copy-details"><span>Copy these details somewhere safe</span><textarea id="persistence-copy-details" readonly rows="7"></textarea></label>';
  const field=document.getElementById('persistence-copy-details');field.value=lines.join('\n\n');field.focus();field.select?.();
 }
});
const render=L.render;L.render=function(...args){try{return render.apply(this,args);}finally{sync();}};
window.addEventListener?.('lumopersistencechange',sync);
// A retained native task must not take keyboard focus behind this recovery UI.
window.addEventListener?.('keydown',event=>{
 const overlay=document.getElementById('persistence-recovery');if(!overlay)return;
 if(event.key==='Escape'){event.preventDefault();event.stopImmediatePropagation();return;}
 if(event.key!=='Tab')return;
 event.stopImmediatePropagation();
 const controls=[...overlay.querySelectorAll('button:not(:disabled),textarea')],first=controls[0],last=controls[controls.length-1];
 if(!first){event.preventDefault();overlay.focus();return;}
 if(event.shiftKey&&(document.activeElement===first||document.activeElement===overlay)){event.preventDefault();last.focus();}
 else if(!event.shiftKey&&(document.activeElement===last||document.activeElement===overlay)){event.preventDefault();first.focus();}
},true);
window.addEventListener?.('focusin',event=>{
 const overlay=document.getElementById('persistence-recovery');if(!overlay)return;
 event.stopImmediatePropagation();if(!overlay.contains(event.target))overlay.focus?.({preventScroll:true});
},true);
sync();
})();
