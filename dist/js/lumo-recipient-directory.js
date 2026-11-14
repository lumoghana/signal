import {esc,icon} from './ui.js';
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export function lumoDirectoryPeople(reply,owner){
 if(!reply?.ok||!Array.isArray(reply.people)||reply.people.length>20)throw Error(reply?.message||'Lumo could not load your people. Try again.');
 const ids=new Set();return reply.people.map(p=>{
  if(!p||!UUID.test(p.id)||p.userId!==p.id||p.id===owner||ids.has(p.id)||p.rail!=='lumo'||typeof p.handle!=='string'||!/^[a-z0-9][a-z0-9._-]{2,29}$/.test(p.handle)||typeof p.name!=='string'||!p.name.trim()||p.name.length>80||/[\u0000-\u001f\u007f]/.test(p.name))throw Error('Lumo could not verify that people list. Try again.');
  ids.add(p.id);return{id:p.id,userId:p.id,handle:p.handle,name:p.name,rail:'lumo'};
 });
}
export function renderLumoRecipientDirectory(payment){
 return `<label class="search-field">${icon('search',19)}<input class="input" id="recipient-search" type="search" maxlength="80" placeholder="Search name or @username" autocomplete="off" autocapitalize="none" spellcheck="false" aria-label="Search Lumo users" aria-controls="lumo-people" value="${esc(payment.recipientSearch||'')}"></label><p class="muted small" id="lumo-people-status" role="status" aria-live="polite">Loading people on Lumo…</p><div class="panel contacts-list" id="lumo-people" aria-label="Registered Lumo users"></div><button type="button" class="text-button" id="lumo-people-retry" hidden>Try again</button><p class="error" id="payment-error" role="alert" hidden></p><p class="muted small">Registered Lumo accounts. Check the name and @username before continuing.</p>`;
}
// A page render is not a new search. Keep in-flight work/results in memory,
// scoped to the authenticated owner and this exact payment draft.
const directories=new WeakMap();
function directory(ctx,payment){
 const key=ctx.shared||ctx,owner=ctx.shared?.user?.id,epoch=ctx.shared?.authVersion??0;
 let value=directories.get(key);
 if(!value||value.payment!==payment||value.owner!==owner||value.epoch!==epoch){
  value={payment,owner,epoch,query:payment.recipientSearch||'',people:[],selected:null,status:'idle',error:'',hasMore:false,serial:0,busy:false,pending:null,listeners:new Set()};directories.set(key,value);
 }
 return value;
}
/** Changes only destination selection. Every transfer still needs review and PIN. */
export function bindLumoRecipientDirectory(ctx,route,{onContinue,delay=250}={}){
 const payment=ctx.draft.payment,root=ctx.$('.pay-recipient'),input=ctx.$('#recipient-search'),list=ctx.$('#lumo-people'),status=ctx.$('#lumo-people-status'),retry=ctx.$('#lumo-people-retry'),error=ctx.$('#payment-error'),next=ctx.$('[data-action="pay-recipient-next"]');
 if(!root||!input||!list||!status||!next)return()=>{};
 const view=directory(ctx,payment),owner=view.owner;let alive=true,timer=null;
 const current=()=>ctx.draft.payment===payment&&payment.rail==='lumo'&&ctx.shared?.user?.id===owner&&ctx.connected===true&&directory(ctx,payment)===view;
 const valid=()=>alive&&root.isConnected!==false&&current();
 const notify=()=>{for(const listener of [...view.listeners])listener();};
 const message=text=>{view.error=text;notify();};
 function draw(){
  if(!valid())return;
  if(input.value!==view.query)input.value=view.query;
  input.disabled=view.busy;next.disabled=view.busy||!view.selected&&view.query.trim().replace(/^@/,'').length<2;next.setAttribute('aria-busy',view.busy?'true':'false');
  if(error){error.textContent=view.error;error.hidden=!view.error;}
  retry.hidden=view.status!=='error';list.setAttribute('aria-busy',view.status==='loading'?'true':'false');
  const rows=view.people.map(p=>`<button type="button" class="row${view.selected?.id===p.id?' selected':''}" data-lumo-person="${esc(p.id)}" aria-pressed="${view.selected?.id===p.id}"><span class="person-avatar violet" aria-hidden="true">${esc(p.name.charAt(0).toUpperCase())}</span><span class="row-copy"><span class="row-title">${esc(p.name)}</span><span class="row-sub">@${esc(p.handle)} · Lumo</span></span><span class="row-right">${icon(view.selected?.id===p.id?'check':'chevron')}</span></button>`).join('');
  if(list.innerHTML!==rows)list.innerHTML=rows;
  status.textContent=view.status==='loading'?'Finding people on Lumo…':view.status==='error'?view.error:view.status==='short'?'Type at least two letters of their name or @username.':view.selected?`Selected ${view.selected.name} · @${view.selected.handle}.`:view.people.length?view.hasMore?'Showing the first 20 people. Type a name or @username to narrow it down.':`${view.people.length} ${view.people.length===1?'person':'people'} on Lumo${view.query.trim()?' matched':' to choose from'}.`:view.query.trim()?'No registered Lumo user matches. Check the @username or full phone number.':'No other registered Lumo users are available yet.';
 }
 async function load(token){
  if(!current()||token!==view.serial)return;
  if(view.pending?.token===token)return view.pending.promise;
  view.status='loading';view.error='';notify();
  const query=view.query.trim();
  const promise=(async()=>{
   try{const result=await ctx.shared.searchPeople(query);if(!current()||token!==view.serial)return;view.people=lumoDirectoryPeople(result,owner);view.hasMore=result.hasMore===true;view.status='loaded';}
   catch(failure){if(!current()||token!==view.serial)return;view.people=[];view.status='error';view.error=failure.message||'Lumo could not load your people. Try again.';}
   finally{if(current()&&token===view.serial){view.pending=null;notify();}}
  })();view.pending={token,promise};return promise;
 }
 function search(){
  if(!valid()||view.busy)return;clearTimeout(timer);const token=++view.serial;view.selected=null;view.people=[];view.pending=null;view.error='';view.query=input.value;payment.recipientSearch=view.query;ctx.saveDraft?.();
  if(view.query.trim().replace(/^@/,'').length===1){view.status='short';notify();return;}
  view.status='loading';notify();timer=setTimeout(()=>{timer=null;void load(token);},delay);
 }
 function choose(event){
  const button=event.target.closest?.('[data-lumo-person]');if(!valid()||view.busy||!button)return;const person=view.people.find(p=>p.id===button.dataset.lumoPerson);if(!person)return;
  ++view.serial;clearTimeout(timer);view.pending=null;view.selected=person;view.query='@'+person.handle;view.status='loaded';payment.recipientSearch=view.query;ctx.saveDraft?.();message('');
 }
 async function proceed(){
  if(!valid()||view.busy)return;const query=view.selected?.handle||input.value.trim();view.query=input.value;if(query.replace(/^@/,'').length<2){message('Choose a person or enter their exact Lumo username.');return;}
  const person=view.selected,token=++view.serial;clearTimeout(timer);view.busy=true;message('');
  try{const result=await ctx.shared.resolve(query);if(!valid()||view.serial!==token)return;if(!result?.ok)throw Error(result?.message||'Choose a person from the matches, or check their exact @username.');
   const p=result.recipient;const verified=lumoDirectoryPeople({ok:true,people:[{...p,id:p?.id||p?.userId,userId:p?.userId||p?.id,rail:'lumo'}]},owner)[0];
   if(person&&person.id!==verified.id)throw Error('That username changed. Search again and check the person before continuing.');
   onContinue({...verified,number:'@'+verified.handle,emoji:verified.name.charAt(0).toUpperCase(),network:'Lumo'});
  }catch(failure){if(valid()&&view.serial===token)message(failure.message||'Lumo could not verify this recipient. Try again.');}
  finally{if(current()&&view.serial===token){view.busy=false;notify();}}
 }
 const retryLoad=()=>{if(valid()){clearTimeout(timer);void load(++view.serial);}};
 view.listeners.add(draw);input.addEventListener('input',search);list.addEventListener('click',choose);retry?.addEventListener('click',retryLoad);next.addEventListener('click',proceed);draw();
 if(view.status==='idle')void load(++view.serial);
 // A debounced search whose old DOM was replaced still needs exactly one load.
 else if(view.status==='loading'&&!view.pending)void load(view.serial);
 return()=>{alive=false;clearTimeout(timer);view.listeners.delete(draw);input.removeEventListener('input',search);list.removeEventListener('click',choose);retry?.removeEventListener('click',retryLoad);next.removeEventListener('click',proceed);};
}
