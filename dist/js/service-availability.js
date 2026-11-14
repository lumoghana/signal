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
export function availabilityMessage(ctx,rail,provider=''){const problem=unavailableService(ctx,serviceIdForRail(rail),provider);return problem?(problem.message||'This service is temporarily unavailable. Please try again shortly.') : '';}
export function availabilitySignature(capabilities={}){return JSON.stringify((capabilities.serviceAvailability||[]).map(s=>[s.serviceId,s.available,s.message,s.status]));}
const controls=new WeakMap();
/** Update only the affected control, leaving the form, focus and draft intact. */
export function bindAvailabilityControl(ctx,button,{message,disabled=()=>false,notice=null}={}){
 if(!button)return Object.assign(()=>{},{dispose(){}});
 const update=()=>{
  const problem=message?.()||'';
  button.disabled=!!problem||!!disabled();
  button.setAttribute?.('aria-disabled',String(button.disabled));
  button.classList?.toggle('service-temporarily-unavailable',!!problem);
  button.title=problem;
  if(notice){notice.textContent=problem;notice.hidden=!problem;}
  return problem;
 };
 controls.set(button,{shared:ctx.shared,update});button.setAttribute?.('data-service-availability','');update();
 update.dispose=()=>controls.delete(button);return update;
}
export function refreshAvailabilityControls(ctx,roots=[]){
 for(const root of roots)for(const button of root?.querySelectorAll?.('[data-service-availability]')||[]){
  const control=controls.get(button);if(control&&control.shared===ctx.shared)control.update();
 }
}
export function applyAvailabilityControls(ctx,root){
 if(!root?.querySelectorAll)return;
 for(const button of root.querySelectorAll('[data-hub-action]')){
  const action=button.dataset.hubAction,rail=['scan','merchant-code'].includes(action)?'merchant':action;
  const id=serviceIdForRail(rail);if(!id)continue;
  const initiallyDisabled=button.disabled||button.getAttribute?.('aria-disabled')==='true';
  const copy=button.querySelector('.payments-hub-row-copy')||button.querySelector('span:last-of-type')||button;
  const note=document.createElement('small');note.className='service-availability-message';copy.append(note);
  bindAvailabilityControl(ctx,button,{message:()=>availabilityMessage(ctx,rail),disabled:()=>initiallyDisabled,notice:note});
 }
}
