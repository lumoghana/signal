import {esc,cash,icon,row} from './ui.js';

const sessions=new WeakMap();
const identity=ctx=>JSON.stringify([ctx.connected===true,ctx.shared?.user?.id||'',ctx.shared?.authVersion??null,ctx.shared?.recoveryScope??null]);
const routeKey=route=>JSON.stringify([route?.section,route?.page,route?.step,route?.id]);
const statusText=request=>String(request.status||'unavailable').replaceAll('-',' ');
const codeReady=request=>typeof request.code==='string'&&/^[0-9]{6}$/.test(request.code)&&['accepted','code-issued'].includes(request.status)&&Number.isFinite(Date.parse(request.expiresAt))&&Date.parse(request.expiresAt)>Date.now();
const isExpired=request=>['expired','locked','superseded','cancelled'].includes(request.status)||Number.isFinite(Date.parse(request.expiresAt))&&Date.parse(request.expiresAt)<=Date.now()&&!['consumed','active','approved','declined','denied'].includes(request.status);

function begin(ctx){
 const token={},actor=identity(ctx),origin=ctx.route,originKey=routeKey(origin),state=ctx.state;
 sessions.set(ctx,token);
 const valid=()=>sessions.get(ctx)===token&&ctx.route===origin&&routeKey(ctx.route)===originKey&&ctx.state===state&&identity(ctx)===actor;
 return {valid,actor,token,show(html,bind){
  if(!valid())return;
  ctx.sheet(html,el=>{
   const current=()=>valid()&&el.isConnected!==false;
   bind?.(el,current);
  });
 }};
}
function stale(ctx,flow,el){
 if(flow.valid()&&el?.isConnected!==false)return false;
 if(sessions.get(ctx)===flow.token&&identity(ctx)!==flow.actor&&el?.isConnected!==false)ctx.closeSheet();
 return true;
}
function unavailable(ctx,flow,message){
 flow.show(`<h2>Partner requests</h2><p class="notice">${esc(message)}</p><button class="button secondary" data-partner-inbox-back>All partner requests</button>`,(el,current)=>{
  el.querySelector('[data-partner-inbox-back]')?.addEventListener('click',()=>{if(current())void openPartnerInbox(ctx);});
 });
}

/** Opens only the current account's inbox; an optional ID opens that exact request. */
export async function openPartnerInbox(ctx,requestId=''){
 const flow=begin(ctx);let loading;
 flow.show('<h2>Partner requests</h2><p class="muted" role="status">Checking your current partner requests…</p>',el=>{loading=el;});
 let result;try{result=await ctx.shared.readPartnerInbox();}catch{result={ok:false,message:'Your partner requests could not refresh. Try again.'};}
 if(stale(ctx,flow,loading))return;
 if(!result?.ok){unavailable(ctx,flow,result?.message||'Your partner requests could not refresh. Try again.');return;}
 if(requestId){showRequest(ctx,flow,String(requestId));return;}
 showInbox(ctx,flow);
}
export function openPartnerRequest(ctx,id){return openPartnerInbox(ctx,id);}

function showInbox(ctx,flow){
 const requests=Array.isArray(ctx.shared.partnerRequests)?ctx.shared.partnerRequests:[];
 flow.show(`<h2>Partner requests</h2><p>A little backup for someone you trust.</p><div class="panel">${requests.map(request=>row({emoji:icon('users'),title:request.boxName||'Money Box',sub:`${request.ownerName||'Lumo member'} · ${isExpired(request)?'expired':statusText(request)}`,action:`partner-inbox:${request.id}`})).join('')||'<p class="muted" style="padding:16px">No partner requests yet.</p>'}</div><button class="button secondary" data-partner-inbox-refresh>Refresh requests</button>`,(el,current)=>{
  el.querySelectorAll('[data-action^="partner-inbox:"]').forEach(button=>button.addEventListener('click',()=>{if(current())showRequest(ctx,flow,button.dataset.action.slice(14));}));
  el.querySelector('[data-partner-inbox-refresh]')?.addEventListener('click',()=>{if(current())void openPartnerInbox(ctx);});
 });
}

function showRequest(ctx,flow,id,updated){
 if(!flow.valid())return;
 const request=updated?.id===id?updated:ctx.shared.partnerRequests?.find(item=>item.id===id);
 if(!request){unavailable(ctx,flow,'This partner request is no longer available. Refresh the list to see current requests.');return;}
 const invitation=request.kind!=='release',expired=isExpired(request),pending=!expired&&(invitation?['awaiting-partner','invited','pending'].includes(request.status):['pending','support-pending'].includes(request.status));
 const operation=request.requestKind==='withdrawal'?`Move ${cash(request.amount)} back to Everyday`:request.requestKind==='change-partner'?'Change accountability partner':request.requestKind==='remove-protection'?'Remove partner protection':'Support this Money Box';
 const ready=codeReady(request),title=expired?'This code has expired.':ready?'You’re on their side.':pending?'A little backup for a big goal.':'This request is '+statusText(request)+'.';
 flow.show(`<div class="partner-phone-simulation"><span class="eyebrow">Accountability partner</span><h2>${esc(title)}</h2><p><strong>${esc(request.ownerName||'A Lumo member')}</strong> asked you to support <strong>${esc(request.boxName||'their Money Box')}</strong>.</p>${invitation?'':`<div class="bp-request-summary"><span>Request</span><strong>${esc(operation)}</strong></div>`}<p>You cannot access their balance, budgets or other boxes. They still confirm every money move with their own PIN.</p>${ready?`<div class="partner-phone-code"><small>Share this code for this exact request</small><strong>${esc(request.code)}</strong></div><button class="button secondary" data-partner-inbox-copy>Copy code</button><p class="muted">${invitation?'This first code confirms your number and acceptance. It cannot release money.':'This code applies only to the request above. It cannot approve a different amount or another move.'}</p><p class="muted">Use it before ${esc(new Date(request.expiresAt).toLocaleTimeString([], {hour:'2-digit',minute:'2-digit'}))}.</p>`:expired?'<p class="notice">Ask the owner for a fresh invitation or request. An expired code cannot confirm this step.</p>':pending?`<label class="partner-role-consent"><input type="checkbox" data-partner-inbox-consent><span>${invitation?'I agree to be the accountability partner for this Money Box.':'I have reviewed this exact request and agree to approve it.'}</span></label><button class="button" data-partner-inbox-accept>${invitation?'Accept request':'Approve and show code'}</button><button class="button text" data-partner-inbox-decline>Decline request</button>`:`<p class="muted">${request.status==='active'?'Your partner role is active. A fresh code will be needed for each request.':'No money moves from viewing this request.'}</p>`}<p class="error" role="alert" data-partner-inbox-error></p><button class="button secondary" data-partner-inbox-refresh>Check this request</button><button class="button secondary" data-partner-inbox-back>All partner requests</button></div>`,(el,current)=>{
  let busy=false;const error=el.querySelector('[data-partner-inbox-error]');
  const respond=async decision=>{
   if(busy||!current())return;
   if(isExpired(request)){showRequest(ctx,flow,id);return;}
   if(decision==='accepted'&&!el.querySelector('[data-partner-inbox-consent]')?.checked){error.textContent='Review this request and confirm your agreement first.';return;}
   busy=true;const controls=[...el.querySelectorAll('button')].map(node=>({node,disabled:node.disabled}));controls.forEach(({node})=>node.disabled=true);error.textContent='Saving your response…';
   let result;try{result=await ctx.shared.respondPartner(id,decision);}catch{result={ok:false,message:'Your response could not be confirmed. Try again with the same choice.'};}
   if(stale(ctx,flow,el))return;
   if(!result?.ok){busy=false;controls.forEach(({node,disabled})=>node.disabled=disabled);error.textContent=result?.message||'Your response could not be confirmed. Try again with the same choice.';return;}
   const matching=Array.isArray(result.inbox)?result.inbox.find(item=>item.id===id):ctx.shared.partnerRequests?.find(item=>item.id===id);
   if(!matching){unavailable(ctx,flow,'Your response was recorded. Refresh the list to see the current request.');return;}
   showRequest(ctx,flow,id,matching);
  };
  el.querySelector('[data-partner-inbox-accept]')?.addEventListener('click',()=>void respond('accepted'));
  el.querySelector('[data-partner-inbox-decline]')?.addEventListener('click',()=>void respond('declined'));
  el.querySelector('[data-partner-inbox-copy]')?.addEventListener('click',async()=>{
   if(!current())return;
   if(!codeReady(request)){showRequest(ctx,flow,id);return;}
   try{if(typeof globalThis.navigator?.clipboard?.writeText!=='function')throw Error();await globalThis.navigator.clipboard.writeText(request.code);if(current())ctx.toast('Code copied. Share it only with the person who made this request.');}
   catch{if(current())error.textContent='Copy is unavailable. Share the six digits shown above with the owner.';}
  });
  el.querySelector('[data-partner-inbox-refresh]')?.addEventListener('click',()=>{if(current())void openPartnerInbox(ctx,id);});
  el.querySelector('[data-partner-inbox-back]')?.addEventListener('click',()=>{if(current())showInbox(ctx,flow);});
 });
}
