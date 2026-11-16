/** Availability is a presentation hint; the server always rechecks new work. */
export const serviceIdForRail=rail=>({lumo:'lumo_transfer',merchant:'merchant_payment',campus:'merchant_payment',momo:'momo_send',bank:'bank_send',fund:'test_funding'}[rail]||'');
const network=value=>({'mtn momo':'mtn',mtn:'mtn','telecel cash':'telecel',telecel:'telecel','at money':'at',at:'at',airteltigo:'at'}[String(value||'').toLowerCase()]||'');
export function unavailableService(ctx,id,provider=''){
 if(ctx?.connected!==true)return null;
 const rows=ctx.shared?.capabilities?.serviceAvailability;
 if(!Array.isArray(rows))return null;
 const ids=[id,...(provider&&network(provider)?[id+'_'+network(provider)]:[])];
 return rows.find(row=>ids.includes(row.serviceId)&&row.available===false)||null;
}
export function availabilityMessage(ctx,rail,provider=''){return unavailableService(ctx,serviceIdForRail(rail),provider)?.message||'';}
export function availabilitySignature(capabilities={}){return JSON.stringify((capabilities.serviceAvailability||[]).map(s=>[s.serviceId,s.available,s.message,s.status]));}
export function applyAvailabilityControls(ctx,root){
 if(!root?.querySelectorAll)return;
 for(const button of root.querySelectorAll('[data-hub-action]')){
  const action=button.dataset.hubAction,rail=['scan','merchant-code'].includes(action)?'merchant':action;
  const id=serviceIdForRail(rail);if(!id)continue;
  const problem=unavailableService(ctx,id);
  if(!problem)continue;
  button.disabled=true;button.setAttribute('aria-disabled','true');button.title=problem.message;button.classList.add('service-temporarily-unavailable');
  const copy=button.querySelector('.payments-hub-row-copy')||button.querySelector('span:last-of-type')||button;
  const note=document.createElement('small');note.className='service-availability-message';note.textContent=problem.message||'Temporarily unavailable';copy.append(note);
 }
}
