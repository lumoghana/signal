import {getMerchantLuxAnswer,merchantLuxContext,merchantLuxStale,privateMerchantQuestion} from './lux-brain.js';
const clean=q=>String(q||'').trim().slice(0,400);
const E=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

/** Private conversation lifecycle, independent of any particular DOM render. */
export function createMerchantLuxConversation({getState,getActor,getShopId,getIdentity,isConnected,request,onChange=()=>{}}){
 let view={messages:[],pending:false,input:'',mode:'local'},key='',generation=0,running=null;
 const identity=()=>{const a=getActor();return JSON.stringify([getIdentity(),a?.id||a?.userId,a?.role,a?.shopIds,getState()?.business?.id,getShopId(),isConnected()]);};
 function reset(){generation++;running?.abort();running=null;view={messages:[],pending:false,input:'',mode:isConnected()?'unknown':'local'};}
 function sync(){const next=identity();if(next!==key){reset();key=next;}return view;}
 async function ask(question,{previous}={}){
  sync();const q=clean(question);if(!q||view.pending)return false;
  const context=merchantLuxContext(view.messages);if(previous)context.previous=previous;
  const conversation=view,owner=key,run=++generation,controller=new AbortController();running=controller;
  const valid=()=>run===generation&&view===conversation&&owner===identity()&&!controller.signal.aborted;
  const sensitive=privateMerchantQuestion(q);
  view.messages.push({id:`lux-${run}-u`,role:'user',text:sensitive?'Private detail omitted.':q});view.input='';view.pending=true;onChange();
  try{
   let answer,result;
   if(isConnected()&&!sensitive){result=await request(q,context,controller.signal);if(!valid())return false;if(!result?.ok||!result.answer)throw Error(result?.message||'I couldn’t refresh those records. Please try again.');answer=result.answer;view.mode=result.mode||'recorded';}
   else{answer=getMerchantLuxAnswer(getState(),q,{actor:getActor(),shopId:getShopId(),context,mode:'local'});view.mode='local';}
   if(!valid())return false;view.messages.push({id:`lux-${run}-a`,role:'assistant',text:[answer.title,...(answer.paragraphs||[])].join('\n\n'),answer,question:sensitive?'':(answer.sourceQuestion||q)});
   while(view.messages.length>60)view.messages.shift();
  }catch(error){
   if(!valid())return false;const answer={title:'Let’s try that again.',paragraphs:[error.message||'I couldn’t refresh your merchant records. Please try again.'],stats:[],actions:[],followUps:[q],kind:'clarify'};view.messages.push({id:`lux-${run}-a`,role:'assistant',text:answer.paragraphs[0],answer,question:q});
  }finally{if(valid()){view.pending=false;running=null;onChange();}}
  return true;
 }
 return{sync,ask,clear(){sync();reset();onChange();},setInput(value){sync().input=String(value||'').slice(0,400);},getView:()=>sync()};
}

function answerHTML(message,_index,state,actor){const index=E(message.id);
 const a=message.answer;if(!a)return`<div class="chat-bubble assistant"><p>${E(message.text)}</p></div>`;
 const stale=merchantLuxStale(state,a,{actor}),checked=a.checkedAt&&Number.isFinite(Date.parse(a.checkedAt))?new Date(a.checkedAt).toLocaleString('en-GH',{timeZone:'Africa/Accra',day:'numeric',month:'short',hour:'2-digit',minute:'2-digit'}):'';
 const actions=Array.isArray(a.actions)?a.actions.slice(0,3):[];
 const button=(item,i,secondary=false)=>`<button type="button" class="btn ${secondary?'secondary':'primary'}" data-action="lux-open" data-index="${index}" data-option="${i}">${E(item.label)} <span aria-hidden="true">→</span></button>`;
 return`<article class="lux-answer"><div class="lux-speaker"><img src="./assets/lux-chat-2d.webp" width="28" height="28" alt=""><span>Lux</span></div><div class="chat-bubble assistant"><div class="lux-answer-scope">${E(a.scope||'Your authorised records')}</div>${a.title?`<h2>${E(a.title)}</h2>`:''}${(a.paragraphs||[]).map(p=>`<p>${E(p)}</p>`).join('')}${a.stats?.length?`<div class="lux-stats">${a.stats.slice(0,4).map(s=>`<div><span>${E(s.label)}</span><strong>${E(s.value)}</strong></div>`).join('')}</div>`:''}${a.basis?.length?`<details class="lux-basis"><summary>How Lux worked this out</summary>${a.basis.map(p=>`<p>${E(p)}</p>`).join('')}</details>`:''}${checked?`<div class="lux-checked${stale?' is-stale':''}">${stale?'Your records changed. Recheck this earlier answer.':`Checked ${E(checked)}`}<button type="button" data-action="lux-recheck" data-index="${index}">${stale?'Recheck with current records':'Check again'}</button></div>`:''}${actions.length?`<div class="lux-next-actions">${button(actions[0],0)}${actions.length>1?`<details><summary>More options</summary>${actions.slice(1).map((x,i)=>button(x,i+1,true)).join('')}</details>`:''}</div>`:''}</div></article>`;
}

export function renderMerchantLux({view,state,actor,connected}){
 const messages=view.messages||[],last=messages.at(-1),follow=!view.pending&&last?.role==='assistant'?last.answer?.followUps||[]:[];
 const starters=['How much did we collect today?','How much remains after my business plan?','Which payments are awaiting confirmation?','How much did we receive through shared links?'];
 const mode=!connected?'Sample money · Recorded-money tools.':view.mode==='recorded'?'Based on confirmed records · Live AI unavailable.':'Based on confirmed Lumo records. You approve every money move.';
 return`<section class="panel lux-panel${messages.length?' has-conversation':''}" aria-label="Ask Lux for Business"><div class="lux-conversation-toolbar"><span>Your Lumo business buddy</span>${messages.length?'<button type="button" class="btn ghost small" data-action="lux-fresh">New chat</button>':''}</div><div class="chat-log" role="log" aria-label="Private merchant money conversation" aria-live="polite" aria-relevant="additions text">${!messages.length?'<div class="lux-welcome"><img src="./assets/lux-chat-2d.webp" width="100" height="100" alt="Lux, your Lumo business buddy"><h2>What would you like to make clearer?</h2><p>Let’s talk collections, stock, payment links, or what needs attention next.</p></div>':''}${messages.map((m,index)=>m.role==='user'?`<div class="chat-bubble user"><p>${E(m.text)}</p></div>`:answerHTML(m,index,state,actor)).join('')}${view.pending?'<div class="lux-thinking" role="status"><img src="./assets/lux-chat-2d.webp" width="28" height="28" alt=""><span>Let’s check your records…</span></div>':''}</div><div class="chat-suggestions">${(messages.length?follow.slice(0,2):starters).map(q=>`<button type="button" class="btn secondary small" data-action="ask-lux" data-question="${E(q)}"${view.pending?' disabled':''}>${E(q)}</button>`).join('')}</div><form data-form="lux" class="chat-compose" autocomplete="off"><label class="sr-only" for="merchant-lux-question">Ask Lux about your business</label><textarea id="merchant-lux-question" class="input" name="question" rows="1" placeholder="What’s the money question?" aria-label="Ask Lux" enterkeyhint="send" required maxlength="400"${view.pending?' disabled':''}>${E(view.input)}</textarea><button type="submit" class="btn primary" aria-label="Send question"${view.pending?' disabled':''}><span aria-hidden="true">↑</span></button></form><p class="lux-mode">${E(mode)}</p><details class="lux-about"><summary>About this conversation</summary><p>Private to this workspace session. It is not sent to staff or a group chat. When live AI is available, it receives your questions and recent question context, not your balances or transaction history. Lumo calculates the figures.</p><p>Outside sales and unrecorded costs are not connected. Recorded plans are estimates and do not pay suppliers. Keep passwords, PINs and identity details out of chat. Refunds, close of day and payouts stay in their normal review and approval screens.</p></details></section>`;
}
