import {esc,cash,icon,row} from './ui.js';

/** The original partner phone sheet, scoped to this signed-in partner's inbox. */
export async function openPartnerInbox(ctx){
  const result=await ctx.shared.readPartnerInbox();
  if(!result.ok){ctx.toast(result.message);return;}
  const requests=ctx.shared.partnerRequests;
  ctx.sheet(`<h2>Partner requests</h2><p>A little backup for someone you trust.</p><div class="panel">${requests.map(request=>row({emoji:icon('users'),title:request.boxName||'Money Box',sub:`${request.ownerName} · ${request.status.replaceAll('-',' ')}`,action:`partner-inbox:${request.id}`})).join('')||'<p class="muted" style="padding:16px">No partner requests yet.</p>'}</div>`,el=>{
    el.querySelectorAll('[data-action^="partner-inbox:"]').forEach(button=>button.onclick=()=>openRequest(ctx,button.dataset.action.slice(14)));
  });
}

function openRequest(ctx,id){
  const request=ctx.shared.partnerRequests.find(item=>item.id===id);
  if(!request)return ctx.toast('This partner request is no longer available.');
  const invitation=request.kind!=='release',pending=invitation?['awaiting-partner','invited','pending'].includes(request.status):['pending','support-pending'].includes(request.status);
  const operation=request.requestKind==='withdrawal'?`Move ${cash(request.amount)} back to Everyday`:request.requestKind==='change-partner'?'Change accountability partner':request.requestKind==='remove-protection'?'Remove partner protection':'Support this Money Box';
  const ready=typeof request.code==='string'&&/^\d{6}$/.test(request.code);
  const title=ready?'You’re on their side.':pending?'A little backup for a big goal.':'This request is '+request.status.replaceAll('-',' ')+'.';
  ctx.sheet(`<div class="partner-phone-simulation"><span class="eyebrow">Accountability partner</span><h2>${esc(title)}</h2><p><strong>${esc(request.ownerName)}</strong> asked you to support <strong>${esc(request.boxName||'their Money Box')}</strong>.</p>${invitation?'':`<div class="bp-request-summary"><span>Request</span><strong>${esc(operation)}</strong></div>`}<p>You cannot access their balance, budgets or other boxes. They still confirm every money move with their own PIN.</p>${ready?`<div class="partner-phone-code"><small>Share this code for this exact request</small><strong>${esc(request.code)}</strong></div><p class="muted">${invitation?'This first code confirms your number and acceptance. It cannot release money.':'This code applies only to the request above. It cannot approve a different amount or another move.'}</p>`:pending?`<label class="partner-role-consent"><input type="checkbox" data-partner-inbox-consent><span>${invitation?'I agree to be the accountability partner for this Money Box.':'I have reviewed this exact request and agree to approve it.'}</span></label><p class="error" role="alert" data-partner-inbox-error></p><button class="button" data-partner-inbox-accept>${invitation?'Accept request':'Approve and show code'}</button><button class="button text" data-partner-inbox-decline>Decline request</button>`:`<p class="muted">${request.status==='active'?'Your partner role is active. A fresh code will be needed for each request.':'No money moves from viewing this request.'}</p>`}<button class="button secondary" data-partner-inbox-back>All partner requests</button></div>`,el=>{
    let busy=false;
    const respond=async decision=>{
      if(busy||!el.isConnected)return;
      const error=el.querySelector('[data-partner-inbox-error]');
      if(decision==='accepted'&&!el.querySelector('[data-partner-inbox-consent]')?.checked){error.textContent='Review this request and confirm your agreement first.';return;}
      busy=true;el.querySelectorAll('button').forEach(button=>button.disabled=true);
      const result=await ctx.shared.respondPartner(id,decision);
      if(!el.isConnected)return;
      if(!result.ok){busy=false;el.querySelectorAll('button').forEach(button=>button.disabled=false);error.textContent=result.message;return;}
      openRequest(ctx,id);
    };
    el.querySelector('[data-partner-inbox-accept]')?.addEventListener('click',()=>void respond('accepted'));
    el.querySelector('[data-partner-inbox-decline]')?.addEventListener('click',()=>void respond('declined'));
    el.querySelector('[data-partner-inbox-back]').onclick=()=>void openPartnerInbox(ctx);
  });
}
