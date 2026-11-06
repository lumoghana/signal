/** Durable local snapshot boundary. No private data is uploaded. */
import {esc,icon,btn} from './ui.js';
const copy=value=>JSON.parse(JSON.stringify(value));
const fail=(reason,message)=>({ok:false,reason,message});
export function createPersistence({storage=globalThis.localStorage,key='lumo-up-experience-v1',validate=()=>true,empty=()=>null,migrate=value=>value,ownerId,now=()=>Date.now(),leaseMs=15000}={}) {
  const owner=ownerId||globalThis.crypto?.randomUUID?.()||`tab-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const lockKey=`${key}:writer`,bootAt=now();let expectedRaw=null,revision=0,loaded=false,blocked='',lastSavedAt='',lastState=null;
  const read=()=>storage?.getItem(key)??null;
  const getLock=()=>{try{return JSON.parse(storage?.getItem(lockKey)||'null');}catch{return null;}};
  const status=()=>({blocked:!!blocked,reason:blocked,revision,lastSavedAt,loaded,ownerId:owner});
  function claim(){
    if(!storage)return fail('unavailable','This browser is not allowing saved progress.');
    try{const lock=getLock();if(lock&&lock.owner!==owner&&lock.expiresAt>now())return fail('another-tab','Another Lumo tab is saving this demo.');
      storage.setItem(lockKey,JSON.stringify({owner,expiresAt:now()+leaseMs}));if(getLock()?.owner!==owner)return fail('another-tab','Another tab has the save boundary.');return {ok:true};
    }catch{return fail('unavailable','This browser is not allowing saved progress.');}
  }
  function readState(){
    let raw;try{raw=read();}catch{blocked='unavailable';return fail(blocked,'Saved progress could not be read. Keep this tab open.');}
    let candidate;
    try{candidate=raw===null?empty():JSON.parse(raw);candidate=migrate(candidate)??candidate;if(!validate(candidate))throw new Error('invalid');}
    catch{blocked='unreadable';loaded=false;return fail(blocked,'Saved progress could not be opened. It has not been replaced.');}
    expectedRaw=raw;revision=Number.isSafeInteger(candidate?._storageRevision)?candidate._storageRevision:0;loaded=true;lastState=copy(candidate);lastSavedAt=candidate?._storageSavedAt||'';
    const lock=claim();blocked=lock.ok?'':lock.reason;return {ok:true,state:candidate,reason:blocked,revision};
  }
  function check(){
    if(!loaded)return readState();
    let raw;try{raw=read();}catch{blocked='unavailable';return fail(blocked,'Saved progress is unavailable.');}
    if(raw!==expectedRaw){blocked='stale';return fail(blocked,'Newer progress is saved. Load it before continuing.');}
    const lock=claim();blocked=lock.ok?'':lock.reason;return lock.ok?{ok:true,state:copy(lastState),revision}:lock;
  }
  function commit(candidate){
    if(!loaded){blocked ||= 'unavailable';return fail(blocked,'Open saved progress before changing money.');}
    const checked=check();if(!checked.ok)return checked;
    let next;
    try{next=copy(candidate);if(!validate(next))return fail('invalid','The change did not pass the saved-state checks.');next._storageRevision=revision+1;next._storageSavedAt=new Date(now()).toISOString();next._storageWriter=owner;
      const serialized=JSON.stringify(next);
      // Compare again after serialization; no mutation or success is exposed first.
      if(read()!==expectedRaw){blocked='stale';return fail(blocked,'Another tab saved newer progress.');}
      if(getLock()?.owner!==owner){blocked='another-tab';return fail(blocked,'Another tab is saving this demo.');}
      storage.setItem(key,serialized);
      expectedRaw=serialized;revision=next._storageRevision;lastSavedAt=next._storageSavedAt;lastState=copy(next);blocked='';return {ok:true,state:next,revision};
    }catch{blocked='save-failed';return fail(blocked,'This change could not be saved. Nothing was completed.');}
  }
  function release(){try{if(getLock()?.owner===owner)storage.removeItem(lockKey);}catch{}}
  function reset(candidate){
    // Explicit destructive reset only. Unreadable snapshots never enter here automatically.
    let raw;try{raw=read();}catch{blocked='unavailable';return fail(blocked,'Saved progress is unavailable.');}
    const lock=claim();if(!lock.ok){blocked=lock.reason;return lock;}
    expectedRaw=raw;loaded=true;revision=0;return commit(candidate);
  }
  function receiveStorage(event){if(event?.key!==key&&event?.key!==lockKey)return;if(!loaded)return;try{if(read()!==expectedRaw)blocked='stale';else if(getLock()?.owner!==owner&&getLock()?.expiresAt>now())blocked='another-tab';}catch{blocked='unavailable';}}
  return {load:readState,reload:readState,commit,check,reset,release,status,receiveStorage};
}
export function attachPersistenceEvents(controller,{onChange=()=>{},target=globalThis.window,heartbeatMs=5000}={}) {
  if(!target?.addEventListener)return ()=>{};
  let lastReason=controller.status().reason;
  const notify=()=>{const status=controller.status();if(status.reason!==lastReason){lastReason=status.reason;onChange(status);}};
  const storage=e=>{controller.receiveStorage(e);notify();};
  const leave=()=>controller.release();
  const focus=()=>{controller.check();notify();};
  target.addEventListener('storage',storage);target.addEventListener('pagehide',leave);target.addEventListener('focus',focus);
  const timer=setInterval(()=>{if(globalThis.document?.visibilityState==='hidden')return;controller.check();notify();},heartbeatMs);
  return ()=>{clearInterval(timer);target.removeEventListener('storage',storage);target.removeEventListener('pagehide',leave);target.removeEventListener('focus',focus);controller.release();};
}
const messages={
  'another-tab':['Lumo is open in another tab.','Use that tab to continue. To save here, close the other tab and check again. This keeps two tabs from changing the same sample money.'],
  stale:['Newer progress is saved.','Another tab changed this demo. Load the latest progress before continuing. Your current unfinished details can stay in this tab until you are ready.'],
  'save-failed':['That change was not completed.','Your browser could not save it. Your earlier money and history are unchanged. Check saving, then review and submit the action again yourself.'],
  unavailable:['Saved progress is unavailable.','Keep this tab open. Allow this site to use browser storage, then check again.'],
  unreadable:['Your saved progress needs attention.','Lumo could not read the saved demo. It has not cleared or replaced it. Try loading again, or explicitly reset only if you are ready to lose this browser’s sample.']
};
export function renderPersistenceRecovery(ctx,controller){const status=controller.status(),[title,body]=messages[status.reason]||messages.unavailable;return `<section class="page persistence-page account-page" role="alertdialog" aria-modal="true" aria-labelledby="persistence-title"><span class="account-icon">${icon('lock',36)}</span><span class="eyebrow">SAVED PROGRESS</span><h1 id="persistence-title">${esc(title)}</h1><p>${esc(body)}</p>${status.lastSavedAt?`<p class="muted">Last saved ${esc(new Date(status.lastSavedAt).toLocaleString('en-GH'))}</p>`:''}<p class="error" data-persistence-error role="status"></p><button class="button" data-persistence-check>Check again</button><button class="button secondary" data-persistence-reload>Load latest saved progress</button><button class="text-button" data-persistence-copy>Keep unfinished details</button><div data-persistence-details></div>${status.reason==='unreadable'?'<details class="account-simulation"><summary>Reset this browser’s unreadable demo</summary><p>This removes the saved sample. It cannot recover any money records or chat history.</p><label class="field"><span>Type RESET to start again</span><input class="input" name="persistenceReset" autocomplete="off"></label><button class="button secondary" data-persistence-reset>Reset sample only</button></details>':''}</section>`;}
export function bindPersistenceRecovery(ctx,controller){ctx.$$('[data-persistence-check]').forEach(b=>b.onclick=()=>{const result=controller.check();if(result.ok)ctx.refresh();else{const p=ctx.$('[data-persistence-error]');if(p)p.textContent=result.message;}});ctx.$$('[data-persistence-reload]').forEach(b=>b.onclick=()=>{const result=controller.reload();if(result.ok&&ctx.installLoadedState)ctx.installLoadedState(result.state);else if(result.ok)ctx.refresh();else ctx.toast(result.message);});ctx.$$('[data-persistence-copy]').forEach(b=>b.onclick=()=>{const list=[ctx.draft.payment,ctx.draft.boxMove,ctx.draft.groupPayout].filter(Boolean).map(d=>Object.fromEntries(['amount','fee','name','purpose','note','rail'].filter(k=>['string','number'].includes(typeof d[k])).map(k=>[k,d[k]])));const host=ctx.$('[data-persistence-details]');if(host){host.innerHTML='<label class="field"><span>Copy these unfinished details before reloading</span><textarea readonly class="input persistence-copy"></textarea></label>';host.querySelector('textarea').value=list.length?JSON.stringify(list,null,2):'No supported unfinished money details are available. Your earlier saved records have not been cleared.';}});ctx.$$('[data-persistence-reset]').forEach(b=>b.onclick=()=>{if(ctx.$('[name="persistenceReset"]')?.value!=='RESET'){ctx.toast('Type RESET before clearing this unreadable sample.');return;}ctx.reset?.({demo:false,persistenceReset:true});});return ()=>{};}
