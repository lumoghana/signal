// Owner and manager controls. The service converts this sign-in into a
// restricted counter session, so owner tools cannot survive on the shop phone.
const escape=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export function createCounterSetup(config){
 let busy=false,error='',notice='',mode='shared',shopId='',generation=0,counters=[],counterStaff=[],label='',staffUserId='';
 const session=()=>config.getSession();
 const users=()=>[...config.getUsers(),...counterStaff.filter(person=>!config.getUsers().some(user=>user.id===(person.userId||person.id))).map(person=>({...person,id:person.userId||person.id,role:'cashier'}))].filter(user=>user.active!==false&&user.role==='cashier');
 const shops=()=>config.getState().shops||[];
 const allowed=()=>['owner','manager'].includes(session()?.role)&&!session()?.counterId;
 function currentShop(){return shops().find(shop=>shop.id===shopId)||shops().find(shop=>shop.id===config.getShopId())||shops()[0]}
 const staff=()=>users().filter(user=>(user.shopIds||[]).includes(currentShop()?.id));
 function redraw(){config.onChange()}
 function render(){
  if(!allowed())return '';
  const selected=currentShop();
  return `<div class="page-heading"><div><div class="eyebrow">COUNTER PHONES</div><h1 class="page-title">Ready for the shop floor.</h1><p class="subtitle">One shop phone. Each cashier’s own access.</p></div></div>
  ${error?`<div class="callout warning" role="alert">${escape(error)}</div>`:''}${notice?`<div class="callout" role="status">${escape(notice)}</div>`:''}
  <section class="panel"><h2 class="panel-title">1. Set a cashier PIN</h2><p class="muted">Invite your cashiers from Team & access first. Each person needs an active account assigned to this shop.</p>
  <form data-form="counter-pin"><label class="field"><span class="label">Cashier</span><select class="select" name="userId" required><option value="">Choose a cashier</option>${users().map(user=>`<option value="${escape(user.id)}">${escape(user.name)}</option>`).join('')}</select></label>
  <label class="field"><span class="label">New 6-digit cashier PIN</span><input class="input" type="password" name="pin" inputmode="numeric" pattern="[0-9]{6}" minlength="6" maxlength="6" autocomplete="new-password" required></label>
  <label class="field"><span class="label">Confirm PIN</span><input class="input" type="password" name="confirmation" inputmode="numeric" pattern="[0-9]{6}" minlength="6" maxlength="6" autocomplete="new-password" required></label>
  <p class="hint">This PIN unlocks cashier access on an approved counter phone. It cannot authorize a refund or settlement.</p><button class="btn secondary" ${busy||!users().length?'disabled':''}>Save cashier PIN</button></form></section>
  <section class="panel"><h2 class="panel-title">2. Set up this phone</h2><form data-form="counter-setup">
  <label class="field"><span class="label">Shop</span><select class="select" name="counterShop" required>${shops().map(shop=>`<option value="${escape(shop.id)}" ${selected?.id===shop.id?'selected':''}>${escape(shop.name)}</option>`).join('')}</select></label>
  <label class="field"><span class="label">Counter name</span><input class="input" name="label" maxlength="70" required placeholder="e.g. Front counter" value="${escape(label)}"></label>
  <fieldset class="counter-mode-options"><legend class="label">Who uses this phone?</legend>${[['shared','Shared phone','Cashiers switch with their own PIN.'],['dedicated','Dedicated phone','Only the selected cashier can unlock it.']].map(([value,title,description])=>`<label class="radio-card ${mode===value?'selected':''}"><input type="radio" name="counterMode" value="${value}" ${mode===value?'checked':''}><strong>${title}</strong><small>${description}</small></label>`).join('')}</fieldset>
  ${mode==='dedicated'?`<label class="field"><span class="label">Assigned cashier</span><select class="select" name="staffUserId" required><option value="">Choose a cashier</option>${staff().map(user=>`<option value="${escape(user.id)}" ${staffUserId===user.id?'selected':''}>${escape(user.name)}</option>`).join('')}</select></label>`:''}
  <div class="callout">This phone will open Collect and Receipts only. To return to owner or manager tools, sign in again with your own account.</div>
  <label class="field check-line"><input name="approved" type="checkbox" required><span>I am setting up this phone for the shop counter.</span></label>
  <button class="btn primary full" ${busy||!selected||!staff().length?'disabled':''}>${busy?'Setting up…':'Use this as a counter phone'}</button>${!staff().length?'<p class="hint">Assign an active cashier to this shop before continuing.</p>':''}</form></section>${counters.length?`<section class="panel"><h2 class="panel-title">Approved counters</h2><div class="settings-links">${counters.map(counter=>`<div class="counter-approved-row"><div><strong>${escape(counter.label)}</strong><small>${escape(shops().find(shop=>shop.id===counter.shopId)?.name||'Assigned shop')} · ${escape(counter.mode==='shared'?'Shared phone':'Dedicated phone')} · ${counter.revokedAt?'Revoked':counter.locked?'Locked':'In use'}</small></div>${counter.revokedAt?'':`<button class="btn secondary small" data-action="counter-revoke" data-id="${escape(counter.id)}" ${busy?'disabled':''}>Revoke access</button>`}</div>`).join('')}</div></section>`:''}`;
 }
 async function submit(form){
  if(!allowed()||busy)return;
  const input=Object.fromEntries(new FormData(form)),started=++generation;
  error='';notice='';busy=true;redraw();
  try{
   if(form.dataset.form==='counter-pin'){
    if(!/^[0-9]{6}$/.test(input.pin)||input.pin!==input.confirmation)throw Error('Enter the same 6-digit PIN in both fields.');
    await config.api('/api/counter/pin',{method:'POST',body:{userId:input.userId,pin:input.pin}});
    if(started===generation)notice='Cashier PIN saved. Share it privately with that cashier.';
   }else{
    if(input.approved!=='on')throw Error('Confirm this phone is for the shop counter.');
    await config.api('/api/counter/setup',{method:'POST',body:{deviceId:config.getDeviceId(),shopId:input.counterShop,label:input.label,mode:input.counterMode,...(input.counterMode==='dedicated'?{staffUserId:input.staffUserId}:{})}});
    if(started===generation)config.onSetup();
   }
  }catch(failure){if(started===generation)error=failure.message||'Setup could not be completed. Try again.'}
  finally{form.reset();if(started===generation){busy=false;redraw()}}
 }
 async function refresh(){const started=generation;try{const result=await config.api('/api/counter');if(started===generation){counters=result.counters||[];counterStaff=result.counterStaff||[];redraw()}}catch(failure){if(started===generation){error=failure.message;redraw()}}}
 async function click(element){if(element.dataset.action!=='counter-revoke'||busy||!allowed())return;busy=true;error='';const started=generation;redraw();try{await config.api('/api/counter/revoke',{method:'POST',body:{counterId:element.dataset.id}});if(started===generation){notice='Counter access revoked. Its payment records are kept.';await refresh()}}catch(failure){if(started===generation)error=failure.message}finally{if(started===generation){busy=false;redraw()}}}
 function change(element){
  if(element.name==='label')label=element.value;
  if(element.name==='staffUserId')staffUserId=element.value;
  if(element.name==='counterMode'){mode=element.value;error='';redraw()}
  if(element.name==='counterShop'){shopId=element.value;error='';redraw()}
 }
 return {render,refresh,handleClick:click,handleSubmit:submit,handleChange:change,reset(){generation++;busy=false;error='';notice='';shopId='';mode='shared';counters=[];counterStaff=[];label='';staffUserId=''}};
}
