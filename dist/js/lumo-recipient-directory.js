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
/** Changes only destination selection. Every transfer still needs review and PIN. */
export function bindLumoRecipientDirectory(ctx,route,{onContinue,delay=250}={}){
 const payment=ctx.draft.payment,root=ctx.$('.pay-recipient'),input=ctx.$('#recipient-search'),list=ctx.$('#lumo-people'),status=ctx.$('#lumo-people-status'),retry=ctx.$('#lumo-people-retry'),error=ctx.$('#payment-error'),next=ctx.$('[data-action="pay-recipient-next"]');
 if(!root||!input||!list||!status||!next)return()=>{};
 const owner=ctx.shared?.user?.id;let alive=true,serial=0,timer=null,people=[],selected=null,busy=false;
 const valid=()=>alive&&root.isConnected!==false&&ctx.draft.payment===payment&&payment.rail==='lumo'&&ctx.shared?.user?.id===owner&&ctx.connected===true;
 const message=text=>{if(error){error.textContent=text;error.hidden=!text;}};
 const ready=()=>{next.disabled=busy||!selected&&input.value.trim().replace(/^@/,'').length<2;};
 function rows(){list.innerHTML=people.map(p=>`<button type="button" class="row${selected?.id===p.id?' selected':''}" data-lumo-person="${esc(p.id)}" aria-pressed="${selected?.id===p.id}"><span class="person-avatar violet" aria-hidden="true">${esc(p.name.charAt(0).toUpperCase())}</span><span class="row-copy"><span class="row-title">${esc(p.name)}</span><span class="row-sub">@${esc(p.handle)} · Lumo</span></span><span class="row-right">${icon(selected?.id===p.id?'check':'chevron')}</span></button>`).join('');}
 async function load(token){
  if(!valid()||token!==serial)return;retry.hidden=true;status.textContent='Finding people on Lumo…';list.setAttribute('aria-busy','true');
  try{const result=await ctx.shared.searchPeople(input.value.trim());if(!valid()||token!==serial)return;people=lumoDirectoryPeople(result,owner);rows();status.textContent=people.length?selected?`Selected ${selected.name} · @${selected.handle}.`:result.hasMore?'Showing the first 20 people. Type a name or @username to narrow it down.':`${people.length} ${people.length===1?'person':'people'} on Lumo${input.value.trim()?' matched':' to choose from'}.`:input.value.trim()?'No registered Lumo user matches. Check the @username or full phone number.':'No other registered Lumo users are available yet.';}
  catch(failure){if(!valid()||token!==serial)return;people=[];rows();status.textContent=failure.message||'Lumo could not load your people. Try again.';retry.hidden=false;}
  finally{if(valid()&&token===serial)list.setAttribute('aria-busy','false');}
 }
 function search(){
  if(!valid())return;clearTimeout(timer);const token=++serial;selected=null;people=[];rows();message('');payment.recipientSearch=input.value;ctx.saveDraft?.();ready();
  const term=input.value.trim().replace(/^@/,'');if(term.length===1){status.textContent='Type at least two letters of their name or @username.';retry.hidden=true;list.setAttribute('aria-busy','false');return;}
  status.textContent='Finding people on Lumo…';timer=setTimeout(()=>{void load(token);},delay);
 }
 function choose(event){
  const button=event.target.closest?.('[data-lumo-person]');if(!valid()||busy||!button)return;const person=people.find(p=>p.id===button.dataset.lumoPerson);if(!person)return;
  ++serial;clearTimeout(timer);selected=person;input.value='@'+person.handle;payment.recipientSearch=input.value;ctx.saveDraft?.();message('');rows();status.textContent=`Selected ${person.name} · @${person.handle}.`;list.setAttribute('aria-busy','false');ready();
 }
 async function proceed(){
  if(!valid()||busy)return;const query=selected?.handle||input.value.trim();if(query.replace(/^@/,'').length<2){message('Choose a person or enter their exact Lumo username.');return;}
  const person=selected,token=++serial;clearTimeout(timer);busy=true;input.disabled=true;next.disabled=true;next.setAttribute('aria-busy','true');message('');
  try{const result=await ctx.shared.resolve(query);if(!valid()||serial!==token)return;if(!result?.ok)throw Error(result?.message||'Choose a person from the matches, or check their exact @username.');
   const p=result.recipient;const verified=lumoDirectoryPeople({ok:true,people:[{...p,id:p?.id||p?.userId,userId:p?.userId||p?.id,rail:'lumo'}]},owner)[0];
   if(person&&person.id!==verified.id)throw Error('That username changed. Search again and check the person before continuing.');
   onContinue({...verified,number:'@'+verified.handle,emoji:verified.name.charAt(0).toUpperCase(),network:'Lumo'});
  }catch(failure){if(valid()&&serial===token)message(failure.message||'Lumo could not verify this recipient. Try again.');}
  finally{if(valid()&&serial===token){busy=false;input.disabled=false;next.setAttribute('aria-busy','false');ready();}}
 }
 const retryLoad=()=>{if(valid()){clearTimeout(timer);void load(++serial);}};
 input.addEventListener('input',search);list.addEventListener('click',choose);retry?.addEventListener('click',retryLoad);next.addEventListener('click',proceed);ready();void load(++serial);
 return()=>{alive=false;++serial;clearTimeout(timer);input.removeEventListener('input',search);list.removeEventListener('click',choose);retry?.removeEventListener('click',retryLoad);next.removeEventListener('click',proceed);};
}
