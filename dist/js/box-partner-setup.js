import {runActionFlow} from './approved-flow.js';
import {esc,icon,field,btn} from './ui.js';
import {validatePartnerDetails} from './box-protection.js';
import {getBoxPartnerInvitation,getBoxPartnerInvitationPreview} from './box-partner-invitation.js';
import {renderBoxPartnerSupportDisclosure} from './box-protection-ui.js';
import {normalizePartnerCode} from './partner-code.js';

const uid=()=>`partner-setup-${globalThis.crypto?.randomUUID?.()||`${Date.now()}-${Math.random().toString(36).slice(2)}`}`;
const clean=value=>String(value||'').trim().replace(/\s+/g,' ');
const masked=value=>{const n=String(value||'').replace(/\D/g,'');return n.length===10?`${n.slice(0,3)} ••• ${n.slice(-4)}`:value;};
const scope=d=>({invitationId:d?.partnerInvitationId,setupId:d?.partnerSetupId,boxName:d?.name,partner:{name:d?.partnerName||'',phone:d?.partnerPhone||''}});
const identity=ctx=>JSON.stringify([ctx.connected===true,ctx.shared?.user?.id||'',ctx.shared?.authVersion??null,ctx.shared?.recoveryScope??null]);
const routeKey=route=>JSON.stringify([route?.section,route?.page,route?.step,route?.id,route?.edit]);
const scopeKey=d=>JSON.stringify([d?.partnerSetupId,clean(d?.name),clean(d?.partnerName),String(d?.partnerPhone||'').replace(/[\s()-]/g,''),d?.partnerEnabled===true]);
const operations=new WeakMap();
const live=view=>view?.scopeMatches&&['awaiting-partner','accepted','verified'].includes(view.status);

export function initialPartnerView(ctx){
 const d=ctx.draft?.box;if(!d)return null;
 const current=getBoxPartnerInvitation(ctx.state,scope(d));
 // A consumed proof is terminal even if another record was subsequently added.
 if(current?.scopeMatches&&current.status==='consumed')return current;
 const candidates=(ctx.state.boxPartnerInvitations||[]).map(item=>getBoxPartnerInvitation(ctx.state,{...scope(d),invitationId:item.id})).filter(item=>item?.scopeMatches&&item.status!=='superseded');
 candidates.sort((a,b)=>(Date.parse(b.sentAt)||0)-(Date.parse(a.sentAt)||0));
 const latest=candidates[0]||current;
 // Repair only the draft's reference after an exact, validated scope match.
 if(latest?.scopeMatches&&latest.id!==d.partnerInvitationId)d.partnerInvitationId=latest.id;
 return latest;
}
export function partnerReady(ctx){const view=initialPartnerView(ctx);return !!view?.scopeMatches&&view.status==='verified'&&Date.parse(view.proofExpiresAt)>Date.now();}
export function initialPartnerPrimaryLabel(ctx){if(ctx.draft?.box?.partnerEnabled!==true)return 'Not now';const view=initialPartnerView(ctx);return live(view)||view?.scopeMatches&&view.status==='consumed'?'Continue':ctx.connected===true?'Send invitation':'Send partner code';}
export function initialPartnerReviewCopy(ctx){const d=ctx.draft.box;if(!d?.partnerEnabled)return 'No partner. You can add one later.';return `${d.partnerName||'Your partner'} · ${masked(d.partnerPhone)} · ${partnerReady(ctx)?'Accepted and number confirmed':'Confirmation needed'}`;}

export function renderInitialPartnerSetup(ctx,route,{setupHead,setupProgress,err}){
 const d=ctx.draft.box,enabled=d.partnerEnabled===true,view=initialPartnerView(ctx),connected=ctx.connected===true,codePage=enabled&&d.partnerCodePhase==='code'&&view?.scopeMatches;
 const base=`<section class="page task-page box-partner-setup${codePage?' box-partner-verification':''}">${setupHead(codePage?'Confirm your partner':'Accountability partner',{editing:!!route.edit})}${setupProgress(4,5)}`;
 if(!codePage)return base+`<div class="content"><p class="eyebrow">Optional · A little backup</p><h1 class="large-question">Save with a little backup.</h1><p class="muted box-partner-intro">Choose someone you trust to help you stick to this goal.</p><p class="box-partner-privacy">This is still your money. Your partner cannot spend it.</p>${renderBoxPartnerSupportDisclosure({noteClass:'box-partner-privacy',connected})}<button type="button" class="box-partner-choice${enabled?' selected':''}" data-action="p:box-partner-toggle" aria-pressed="${enabled}"><span class="box-partner-symbol">${icon('users',24)}</span><span><strong>Add an accountability partner</strong><small>Your goal. A trusted person on your side.</small></span>${icon(enabled?'check':'plus',18)}</button>${enabled?`<div class="form-stack box-partner-fields">${field({label:'Their name',name:'box-partner-name',value:d.partnerName||'',placeholder:'Esi',required:true})}${field({label:'Their phone number',name:'box-partner-phone',type:'tel',value:d.partnerPhone||'',placeholder:'024 123 4567',required:true})}</div><p class="box-partner-pending-note">${connected?'We’ll send an invitation to their Lumo account. They accept the role, then share their six-digit code with you.':'They accept the role in the partner phone simulation, then share a code to confirm their number before this box is created.'}</p>`:''}<div class="box-partner-explain"><span>${icon('lock',18)}</span><p>Once they accept, they receive a fresh code for each move back to Everyday. You still confirm with your PIN.</p></div><details class="box-partner-details"><summary>What your partner can see ${icon('chevron',16)}</summary><p class="box-partner-privacy">They see this box’s name and the withdrawal request only. Your balance and other Money Boxes stay private.</p></details><p class="box-partner-demo"${connected?' data-connected-partner-delivery':''}>${connected?'Invitations appear in Lumo. No SMS is sent.':'Prototype simulation. No SMS or message is sent.'}</p>${err()}</div><div class="bottom-action">${btn(initialPartnerPrimaryLabel(ctx),'p:box-partner')}${enabled?'<button type="button" class="text-button box-partner-skip" data-action="p:box-partner-skip">Not now</button>':''}</div></section>`;
 const ready=partnerReady(ctx),consumed=view.status==='consumed',expired=['expired','locked','declined','superseded'].includes(view.status)||(!ready&&!consumed&&Date.parse(view.expiresAt)<=Date.now()),accepted=view.status==='accepted'&&!expired;
 const title=consumed?'This invitation is complete.':ready?`${esc(d.partnerName)} is on your side.`:expired?'Get a fresh code.':accepted?'Enter their code.':'Waiting for their acceptance.';
 const description=consumed?'This confirmation was already used to create a Money Box. Open your boxes to continue.':ready?connected?'Your partner accepted and their number is confirmed.':'Their role is accepted and their number is confirmed in this demo.':view.status==='declined'?'They declined this invitation. Choose someone else or continue without a partner.':expired?'This code is no longer available. Send a new invitation when you’re ready.':accepted?`${esc(d.partnerName)} accepted. Enter the six-digit code they share.`:connected?`Ask ${esc(d.partnerName)} to open Partner requests in Lumo and accept your invitation. They can then share their code.`:`Ask ${esc(d.partnerName)} to accept in the partner phone simulation, then share their code.`;
 const wait=Math.max(0,Math.ceil((Date.parse(view.resendAt)-Date.now())/1000))||0;
 const support=connected?`<details class="box-partner-details"><summary>If your partner cannot respond ${icon('chevron',16)}</summary><p class="box-partner-privacy">Support recovery is not available in this connected test. This release cannot bypass your partner’s approval. You can continue without a partner before creating this Money Box.</p></details>`:renderBoxPartnerSupportDisclosure({noteClass:'box-partner-privacy'});
 return base+`<div class="content"><div class="partner-confirm-symbol" aria-hidden="true">${icon(ready||consumed?'check':'phone',32)}</div><p class="eyebrow">${ready?'Partner confirmed':'Before your Money Box is created'}</p><h1 class="large-question">${title}</h1><p class="muted partner-confirm-intro">${description}</p><div class="partner-confirm-person"><span>${esc(String(d.partnerName||'').slice(0,1).toUpperCase())}</span><div><strong>${esc(d.partnerName)}</strong><small>${esc(masked(d.partnerPhone))}</small></div><small class="accent">${ready?'Confirmed':consumed?'Complete':accepted?'Accepted':expired?'Needs a new code':'Awaiting acceptance'}</small></div>${ready||consumed?'':`<label class="field partner-confirm-code"><span>Code from your partner</span><input class="input" name="box-partner-code" inputmode="numeric" autocomplete="one-time-code" maxlength="32" placeholder="000000" aria-describedby="partner-code-help"></label><p class="box-partner-privacy" id="partner-code-help">One code confirms their number and acceptance. It cannot authorise a withdrawal. Spaces and hyphens are okay.</p>`}${err()}${!ready&&!consumed&&!connected?`<button type="button" class="partner-phone-preview" data-action="p:partner-initial-preview">${icon('phone',18)} Try the partner’s phone <small>Simulation</small>${icon('chevron',16)}</button>`:''}${!consumed?`<div class="partner-confirm-links"><button class="text-button" data-action="p:partner-initial-details">Change name or number</button>${!ready?`<button class="text-button" data-action="p:partner-initial-resend">Send a new invitation</button>${connected?'<button class="text-button" data-action="p:partner-initial-refresh">Check partner response</button>':''}`:''}</div>${!ready&&wait?`<p class="box-partner-privacy">Another invitation is available in ${wait} seconds. Your current invitation stays available.</p>`:''}${support}`:''}<p class="box-partner-demo"${connected?' data-connected-partner-delivery':''}>${connected?'Invitations and responses sync through Lumo. No SMS is sent.':'Prototype simulation. No SMS or message is sent.'} A fresh code and your own PIN are still needed for each withdrawal.</p></div><div class="bottom-action">${consumed?btn('Open Money Boxes','p:partner-initial-boxes'):btn(ready?'Continue':'Confirm partner',ready?'p:partner-initial-continue':'p:partner-initial-verify',{disabled:!ready&&!accepted})}${consumed?'':'<button type="button" class="text-button box-partner-skip" data-action="p:box-partner-skip">Continue without a partner</button>'}</div></section>`;
}

function openPartnerPhone(ctx){
 if(ctx.connected){ctx.toast('Your partner can open this invitation in their own Lumo account.');return;}
 const d=ctx.draft.box,view=initialPartnerView(ctx)&&getBoxPartnerInvitationPreview(ctx.state,d.partnerInvitationId),origin=ctx.route,actor=identity(ctx),state=ctx.state;
 if(!view){ctx.toast('Send a new partner invitation first.');return;}
 const accepted=['accepted','verified','consumed'].includes(view.status),code=view.code,expired=['expired','locked','superseded'].includes(view.status)||(!['verified','consumed'].includes(view.status)&&Date.parse(view.expiresAt)<=Date.now());
 ctx.sheet(`<div class="partner-phone-simulation"><span class="eyebrow">Partner’s phone · Simulation</span><h2>${accepted?'You’re on their side.':'A little backup for a big goal.'}</h2><p><strong>${esc(ctx.state.profile.name.split(' ')[0])}</strong> asked you to be an accountability partner for <strong>${esc(view.boxName)}</strong>.</p><div class="partner-phone-address">${icon('phone',18)} ${esc(view.partner?.phone||d.partnerPhone)}</div><p>You’ll receive a fresh code when they request money back from this box. Sharing a code approves only that request. They still use their own PIN.</p><p class="muted">You do not get access to their balance, budgets or other boxes.</p>${expired?'<p class="notice">This invitation code is no longer available. Ask for a fresh code before accepting.</p>':code?`<div class="partner-phone-code"><small>Share this first code after accepting</small><strong>${esc(code)}</strong></div><p class="muted">This confirms your number and role before the box is created. This first code cannot release money.</p>`:accepted?'<p class="notice">This confirmation has already been verified or the code has expired.</p>':view.status==='declined'?'<p class="notice">You declined this invitation. No box with you as partner can be created from it.</p>':`<label class="partner-role-consent"><input type="checkbox" data-partner-consent><span>I agree to be the accountability partner for this Money Box.</span></label><p class="error" role="alert" data-partner-phone-error></p><button class="button" data-partner-accept>Accept and reveal my code</button><button class="button text" data-partner-decline>Decline invitation</button>`}<p class="box-partner-demo">Local participant simulation. No SMS or message was sent, and this is not another person’s live device.</p></div>`,el=>{
  let busy=false;const current=()=>el.isConnected!==false&&ctx.draft.box===d&&ctx.state===state&&ctx.route===origin&&identity(ctx)===actor&&d.partnerInvitationId===view.id;
  const respond=decision=>runActionFlow(function*(){
   if(busy||!current())return;
   if(decision==='accepted'&&!el.querySelector('[data-partner-consent]')?.checked){el.querySelector('[data-partner-phone-error]').textContent='Confirm you accept this role first.';return;}
   busy=true;let result;try{result=yield (ctx.actAsync||ctx.act).call(ctx,'respondBoxPartnerInitialInvitation',{invitationId:view.id,decision});}catch{result={ok:false,message:'Your response could not be confirmed. Try again.'};}finally{busy=false;}
   if(!current())return;
   if(!result?.ok){const error=el.querySelector('[data-partner-phone-error]');if(error)error.textContent=result?.message||'Your response could not be confirmed. Try again.';return;}
   ctx.closeSheet();ctx.refresh();openPartnerPhone(ctx);
  });
  el.querySelector('[data-partner-accept]')?.addEventListener('click',()=>respond('accepted'));
  el.querySelector('[data-partner-decline]')?.addEventListener('click',()=>respond('declined'));
 });
}

export function handleInitialPartnerAction(ctx,route,action,{setError,boxRoute,refresh}){return runActionFlow(function*(){
 if(!['box-partner','box-partner-toggle','box-partner-skip','partner-initial-preview','partner-initial-verify','partner-initial-resend','partner-initial-details','partner-initial-continue','partner-initial-refresh','partner-initial-boxes'].includes(action))return false;
 const d=ctx.draft.box;if(!d)return true;
 const actor=identity(ctx),origin=ctx.route,originKey=routeKey(origin),state=ctx.state;
 let run=operations.get(d);if(!run||run.actor!==actor||run.origin!==origin||run.state!==state){run={actor,origin,state,busy:false,attempt:null};operations.set(d,run);}
 if(run.busy)return true;
 const current=()=>operations.get(d)===run&&ctx.draft.box===d&&ctx.state===state&&ctx.route===origin&&routeKey(ctx.route)===originKey&&identity(ctx)===actor&&ctx.route?.section==='boxes'&&ctx.route?.page==='create';
 if(!current())return true;
 const error=message=>{if(current())setError(ctx,message);};
 const continueToReview=()=>{if(route.edit)delete ctx.draft.boxEditBackup;boxRoute('review');};
 const perform=(type,payload)=>runActionFlow(function*(){
  if(!current()||run.busy)return null;
  const fingerprint=JSON.stringify([type,payload]),expectedScope=scopeKey(d);
  if(!run.attempt||run.attempt.fingerprint!==fingerprint)run.attempt={fingerprint,key:uid()};
  // The persistent service journal sees this reference, never the entered code.
  const request={...payload,idempotencyKey:run.attempt.key};run.busy=true;
  const controls=(ctx.$$?.('[data-action^="p:"]')||[]).map(node=>({node,disabled:node.disabled}));controls.forEach(({node})=>node.disabled=true);
  let result;try{result=yield (ctx.actAsync||ctx.act).call(ctx,type,request);}catch{result={ok:false,unknown:true,message:'This step could not be confirmed. Try again with the same details.'};}finally{run.busy=false;if(current())controls.forEach(({node,disabled})=>{if(node.isConnected!==false)node.disabled=disabled;});}
  if(!current()||scopeKey(d)!==expectedScope)return null;
  if(type==='verifyBoxPartnerInvitation'&&initialPartnerView(ctx)?.id!==payload.invitationId)return null;
  if(!result?.unknown)run.attempt=null;
  return result;
 });
 const send=resend=>runActionFlow(function*(){
  const checked=validatePartnerDetails({name:d.partnerName,phone:d.partnerPhone},ctx.state.profile?.phone);
  if(!checked.ok){error(checked.message);return;}
  d.partnerName=checked.partner.name;d.partnerPhone=checked.partner.phone;d.name=clean(d.name);d.partnerSetupId ||= uid();
  const existing=initialPartnerView(ctx);
  if(existing?.scopeMatches&&existing.status==='consumed'){d.partnerCodePhase='code';refresh();return;}
  if(!resend&&live(existing)){d.partnerCodePhase='code';refresh();return;}
  if(resend&&existing?.scopeMatches&&Date.parse(existing.resendAt)>Date.now()){error('Wait a moment before sending another invitation. Your current invitation is still available.');return;}
  const result=yield perform('sendBoxPartnerInvitation',scope(d));if(!result)return;
  if(result.ok&&typeof result.invitationId==='string')d.partnerInvitationId=result.invitationId;
  const recovered=initialPartnerView(ctx);
  if(result.ok||live(recovered)||recovered?.scopeMatches&&recovered.status==='consumed'){d.partnerCodePhase='code';refresh();return;}
  error(result.message||'The invitation could not be confirmed. Try again with the same details.');
 });
 if(action==='box-partner-toggle'){d.partnerEnabled=!d.partnerEnabled;refresh();}
 else if(action==='box-partner-skip'){d.partnerEnabled=false;d.partnerCodePhase='';continueToReview();}
 else if(action==='box-partner') {if(!d.partnerEnabled)continueToReview();else yield send(false);}
 else if(action==='partner-initial-resend')yield send(true);
 else if(action==='partner-initial-details'){d.partnerCodePhase='';refresh();}
 else if(action==='partner-initial-preview')openPartnerPhone(ctx);
 else if(action==='partner-initial-boxes')ctx.go({section:'boxes',page:'home'});
 else if(action==='partner-initial-refresh'){
  if(typeof ctx.shared?.snapshot!=='function'){refresh();return true;}
  const expectedScope=scopeKey(d);run.busy=true;let result;
  try{result=yield ctx.shared.snapshot();}catch{result={ok:false,message:'Could not refresh this invitation. Try again.'};}finally{run.busy=false;}
  if(current()&&scopeKey(d)===expectedScope){initialPartnerView(ctx);refresh();if(!result?.ok)error(result?.message||'Could not refresh this invitation. Try again.');}
 }
 else if(action==='partner-initial-continue'){if(!partnerReady(ctx)){error('Ask your partner to confirm again before creating this box.');return true;}continueToReview();}
 else if(action==='partner-initial-verify'){
  const input=ctx.$('[name="box-partner-code"]'),code=normalizePartnerCode(input?.value);
  if(!code){error('Enter the six digits your partner shared. Spaces and hyphens are okay.');return true;}
  const view=initialPartnerView(ctx);
  if(!view?.scopeMatches||view.status!=='accepted'||Date.parse(view.expiresAt)<=Date.now()){error('Ask your partner to accept the current invitation and share an unexpired code.');return true;}
  const result=yield perform('verifyBoxPartnerInvitation',{...scope(d),invitationId:view.id,code});if(!result)return true;
  if(!result.ok){if(input&&!result.unknown)input.value='';error(result.message||'This code could not be checked. Try again.');return true;}
  if(input)input.value='';refresh();ctx.toast(`${d.partnerName} is confirmed. Your Money Box is ready to create.`);
 }
 return true;
});}
