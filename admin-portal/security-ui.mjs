const clone=value=>JSON.parse(JSON.stringify(value));
/** Staff enrolment and original-reset reconciliation never create replacement Auth writes. */
export function createSecurityConsole({rpc,el,button,field,area,date,openDialog,closeDialog,toast,reload,getStaff,verifyAuthenticator}){
 const actor=()=>String(getStaff()?.id||getStaff()?.userId||getStaff()?.user_id||'');
 const note=text=>el('p',{class:'form-help'},text);
 const role=()=>getStaff()?.role;
 function mutation(title,subtitle,command,payload){
  const by=actor(),reason=area(),form=el('form'),error=el('div',{'aria-live':'polite'}),submit=button('Confirm',null,'btn primary');submit.type='submit';let pending=null,busy=false,unavailable=false;
  form.append(field('Reason and evidence',reason),error,el('div',{class:'form-actions'},button('Back',closeDialog,'btn'),submit));
  form.addEventListener('submit',async event=>{
   event.preventDefault();if(busy||unavailable||!by||actor()!==by||!pending&&!form.reportValidity())return;
   pending||={...clone(payload),reason:reason.value.trim(),requestId:crypto.randomUUID()};busy=true;submit.disabled=true;error.replaceChildren();
   try{await rpc(command,clone(pending));if(actor()!==by)return;closeDialog();toast('The original security operation has been recorded.');reload();}
   catch(caught){if(actor()!==by)return;error.replaceChildren(el('div',{class:'form-error',role:'alert'},caught.message));
    if(caught.code==='RECOVERY_RESOLUTION_UNAVAILABLE'){pending=null;unavailable=true;reason.disabled=true;submit.textContent='Unavailable for this release';error.append(button('Back to current records',()=>{closeDialog();reload();},'btn'));}
    else if(['INVALID_INPUT','REASON_REQUIRED','MFA_REQUIRED','STAFF_MFA_ENROLMENT_REQUIRED','SECOND_ACCESS_ADMIN_REQUIRED','STALE_CONTROL','FORBIDDEN','NOT_FOUND','AUTH_ALREADY_APPLIED','AUTH_OUTCOME_UNCONFIRMED','RESET_IN_PROGRESS'].includes(caught.code)){
     pending=null;reason.disabled=false;submit.textContent='Confirm';error.append(button('Refresh current records',()=>{closeDialog();reload();},'btn'));
     if(caught.code==='MFA_REQUIRED')error.append(button('Verify my authenticator',verifyAuthenticator,'btn'));
    }else{reason.disabled=true;submit.textContent='Check original operation';}
   }
   finally{busy=false;if(actor()===by)submit.disabled=unavailable;}
  });
  openDialog(title,subtitle,form);return form;
 }
 async function renderPolicy(main){
  if(role()!=='super_admin')return;
  const by=actor(),body=el('div',{class:'panel-body'}),wrap=el('section',{class:'panel section-spacer'},el('div',{class:'panel-head'},el('div',{},el('h2',{},'Staff sign-in protection'),note('Connect staff authenticators before changing the requirement.'))),body);main.append(wrap);
  body.append(note('Checking staff enrolment…'));
  try{const data=await rpc('security.policy',{});if(actor()!==by)return;const p=data.policy;if(!p)throw Error('Current security policy could not be confirmed.');body.replaceChildren(
   note(p.mfaEnforced?'Authenticator codes are required by the database policy.':'The current pilot allows password-only access. MFA is not yet required.'),
   note(p.verifiedStaff+' of '+p.activeStaff+' active staff have verified authenticators. '+p.staffToEnrol+' still need enrolment.'),
   button('Connect or verify my authenticator',verifyAuthenticator,'btn'),
   note(p.productionReady?'Two verified access administrators are available.':'Before production, keep two verified access administrators and a governed lost-factor recovery procedure.')
  );
   if(!p.mfaEnforced){const enable=button('Require authenticator codes',()=>mutation('Require staff MFA?','Every active staff member is enrolled. Verify your own authenticator before confirming.','security.mfa.enable',{expectedRevision:p.revision}),'btn primary');enable.disabled=p.readyToEnforce!==true;body.append(enable);if(!p.readyToEnforce)body.append(note('This control stays unavailable until every active staff member is enrolled, including an access administrator.'));}
   if(p.environment!=='production'){const production=button('Require production sign-in policy',()=>mutation('Require production sign-in policy?','This requires MFA and two verified access administrators. There is no portal downgrade.','security.mode.production',{expectedRevision:p.revision}),'btn');production.disabled=p.productionReady!==true;body.append(production);}
  }catch(caught){if(actor()===by)body.replaceChildren(el('div',{class:'form-error',role:'alert'},caught.message),button('Refresh policy',()=>renderPolicy(main),'btn'));}
 }
 async function renderRecovery(main){
  if(!['super_admin','supervisor','risk','support'].includes(role()))return;
  const by=actor(),body=el('div',{class:'panel-body'}),wrap=el('section',{class:'panel section-spacer'},el('div',{class:'panel-head'},el('div',{},el('h2',{},'Original password-reset outcomes'),note('Reconcile independently confirmed Auth results. A second password write is never issued here.'))),body);main.append(wrap);let page=1;
  async function load(){body.replaceChildren(note('Loading original resets…'));try{const data=await rpc('recovery.resets.list',{page,pageSize:25});if(actor()!==by)return;body.replaceChildren();
   if(!data.rows?.length)body.append(note('No uncertain resets are waiting for this review.'));
   for(const r of data.rows||[]){const row=el('div',{class:'quick-row'},el('div',{},el('strong',{},r.module+' · '+r.requestId),note('Account '+r.userId+' · '+r.state+' · '+date(r.createdAt)),note(r.authApplied?'The exact Auth execution marker is confirmed.':'The external outcome is not confirmed. Keep the original guard and investigate.')));
    if(role()!=='support'&&r.authApplied===true)row.append(button('Reconcile confirmed reset',()=>mutation('Finish this original reset?','The exact Auth execution marker is checked again before cleanup.','recovery.resets.reconcile',{resetRequestId:r.requestId,module:r.module}),'btn'));else if(role()!=='support'&&r.requiresAuthMarker===true)row.append(button('Cancel fenced unapplied reset',()=>mutation('Cancel this original reset?','The write fence rejects a delayed original Auth write after cancellation. No replacement password is written.','recovery.resets.cancel',{resetRequestId:r.requestId,module:r.module}),'btn'));else if(!r.authApplied)row.append(note('Legacy unknown writes need governed investigation. They cannot be released by elapsed time.'));body.append(row);}
   const paging=el('div',{class:'form-actions'},note('Page '+page+' · '+data.total+' original resets'));if(page>1)paging.append(button('Previous reset page',()=>{page--;load();},'btn small'));if(page*25<data.total)paging.append(button('Next reset page',()=>{page++;load();},'btn small'));body.append(paging);
  }catch(caught){if(actor()!==by)return;if(caught.code==='RECOVERY_RESOLUTION_UNAVAILABLE'){body.replaceChildren(el('div',{class:'notice',role:'status'},caught.message||'Recovery resolution is not enabled for this release. Keep the original reset reference and use the existing support process.'));return;}body.replaceChildren(note(caught.code==='MFA_REQUIRED'?'Verify your authenticator before viewing recovery records.':caught.message),button('Verify my authenticator',verifyAuthenticator,'btn'),button('Refresh reset queue',load,'btn'));}}
  await load();
 }
 return {renderPolicy,renderRecovery};
}
