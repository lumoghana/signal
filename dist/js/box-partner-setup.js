import {esc,icon,field,btn} from './ui.js';
import {validatePartnerDetails} from './box-protection.js';
import {getBoxPartnerInvitation,getBoxPartnerInvitationPreview} from './box-partner-invitation.js';

const uid=()=>`partner-setup-${globalThis.crypto?.randomUUID?.()||`${Date.now()}-${Math.random().toString(36).slice(2)}`}`;
const masked=value=>{const n=String(value||'').replace(/\D/g,'');return n.length===10?`${n.slice(0,3)} ••• ${n.slice(-4)}`:value;};
const scope=d=>({invitationId:d?.partnerInvitationId,setupId:d?.partnerSetupId,boxName:d?.name,partner:{name:d?.partnerName||'',phone:d?.partnerPhone||''}});
export function initialPartnerView(ctx){return getBoxPartnerInvitation(ctx.state,scope(ctx.draft.box));}
export function partnerReady(ctx){const view=initialPartnerView(ctx);return !!view?.scopeMatches&&view.status==='verified'&&Date.parse(view.proofExpiresAt)>Date.now();}
export function initialPartnerReviewCopy(ctx){const d=ctx.draft.box;if(!d?.partnerEnabled)return 'No partner. You can add one later.';return `${d.partnerName||'Your partner'} · ${masked(d.partnerPhone)} · ${partnerReady(ctx)?'Accepted and number confirmed':'Confirmation needed'}`;}

export function renderInitialPartnerSetup(ctx,route,{setupHead,setupProgress,err}){
 const d=ctx.draft.box,enabled=d.partnerEnabled===true,view=initialPartnerView(ctx),codePage=enabled&&d.partnerCodePhase==='code'&&view?.scopeMatches;
 const base=`<section class="page task-page box-partner-setup${codePage?' box-partner-verification':''}">${setupHead(codePage?'Confirm your partner':'Accountability partner',{editing:!!route.edit})}${setupProgress(4,5)}`;
 if(!codePage)return base+`<div class="content"><p class="eyebrow">Optional · A little backup</p><h1 class="large-question">Save with a little backup.</h1><p class="muted box-partner-intro">Choose someone you trust to help you stick to this goal.</p><button type="button" class="box-partner-choice${enabled?' selected':''}" data-action="p:box-partner-toggle" aria-pressed="${enabled}"><span class="box-partner-symbol">${icon('users',24)}</span><span><strong>Add an accountability partner</strong><small>Your goal. A trusted person on your side.</small></span>${icon(enabled?'check':'plus',18)}</button>${enabled?`<div class="form-stack box-partner-fields">${field({label:'Their name',name:'box-partner-name',value:d.partnerName||'',placeholder:'Esi',required:true})}${field({label:'Their phone number',name:'box-partner-phone',type:'tel',value:d.partnerPhone||'',placeholder:'024 123 4567',required:true})}</div><p class="box-partner-pending-note">We’ll send them a code first. They accept the role, then share the code with you to confirm their number before this box is created.</p>`:''}<div class="box-partner-explain"><span>${icon('lock',18)}</span><p>They receive a fresh code for each move back to Everyday. You still confirm with your PIN.</p></div><details class="box-partner-details"><summary>What your partner can see ${icon('chevron',16)}</summary><p class="box-partner-privacy">They see this box’s name and the withdrawal request only. Your balance and other Money Boxes stay private.</p></details><p class="box-partner-demo">Prototype simulation. No SMS or message is sent.</p>${err()}</div><div class="bottom-action">${btn(enabled?(partnerReady(ctx)?'Continue':'Send partner code'):'Not now','p:box-partner')}${enabled?'<button type="button" class="text-button box-partner-skip" data-action="p:box-partner-skip">Not now</button>':''}</div></section>`;
 const ready=partnerReady(ctx),expired=['expired','locked','declined','superseded'].includes(view.status)||(!ready&&Date.parse(view.expiresAt)<=Date.now());
 const accepted=view.status==='accepted';
 const title=ready?`${esc(d.partnerName)} is on your side.`:view.status==='declined'?'Let’s find your backup.':'A little yes.<br>Then you’re set.';
 const description=ready?'Their role is accepted and their number is confirmed in this demo.':view.status==='declined'?'They declined this invitation. Choose someone else or continue without a partner.':expired?'This code is no longer available. Send a fresh one when you’re ready.':accepted?`${esc(d.partnerName)} accepted. Ask them for the code to confirm their number.`:`A code is waiting for ${esc(d.partnerName)} at ${esc(masked(d.partnerPhone))}. They accept the role before sharing it.`;
 return base+`<div class="content"><div class="partner-confirm-symbol" aria-hidden="true">${icon(ready?'check':'phone',32)}</div><p class="eyebrow">${ready?'Partner confirmed':'Before your Money Box is created'}</p><h1 class="large-question">${title}</h1><p class="muted partner-confirm-intro">${description}</p><div class="partner-confirm-person"><span>${esc(d.partnerName.slice(0,1).toUpperCase())}</span><div><strong>${esc(d.partnerName)}</strong><small>${esc(masked(d.partnerPhone))}</small></div><small class="accent">${ready?'Confirmed':view.status==='accepted'?'Accepted':'Awaiting confirmation'}</small></div>${ready?'':`<label class="field partner-confirm-code"><span>Code from your partner</span><input class="input" name="box-partner-code" inputmode="numeric" autocomplete="one-time-code" maxlength="6" pattern="[0-9]{6}" placeholder="000000" aria-describedby="partner-code-help"></label><p class="box-partner-privacy" id="partner-code-help">One code confirms their number and acceptance. It cannot authorise a withdrawal.</p>`}${err()}${!ready?`<button type="button" class="partner-phone-preview" data-action="p:partner-initial-preview">${icon('phone',18)} Try the partner’s phone <small>Simulation</small>${icon('chevron',16)}</button>`:''}<div class="partner-confirm-links"><button class="text-button" data-action="p:partner-initial-details">Change name or number</button>${!ready?'<button class="text-button" data-action="p:partner-initial-resend">Resend code</button>':''}</div><p class="box-partner-demo">Prototype simulation. No SMS or message is sent. ${ready?'A new code and your PIN are still needed for each withdrawal.':'The sample code appears only after the partner accepts in the phone simulation.'}</p></div><div class="bottom-action">${btn(ready?'Continue':'Confirm partner',ready?'p:partner-initial-continue':'p:partner-initial-verify',{disabled:!ready&&!accepted})}<button type="button" class="text-button box-partner-skip" data-action="p:box-partner-skip">Continue without a partner</button></div></section>`;
}

function openPartnerPhone(ctx){
 const d=ctx.draft.box,view=getBoxPartnerInvitationPreview(ctx.state,d.partnerInvitationId);
 if(!view){ctx.toast('Send a new partner code first.');return;}
 const accepted=['accepted','verified','consumed'].includes(view.status),code=view.code,expired=['expired','locked','superseded'].includes(view.status)||(!['verified','consumed'].includes(view.status)&&Date.parse(view.expiresAt)<=Date.now());
 ctx.sheet(`<div class="partner-phone-simulation"><span class="eyebrow">Partner’s phone · Simulation</span><h2>${accepted?'You’re on their side.':'A little backup for a big goal.'}</h2><p><strong>${esc(ctx.state.profile.name.split(' ')[0])}</strong> asked you to be an accountability partner for <strong>${esc(view.boxName)}</strong>.</p><div class="partner-phone-address">${icon('phone',18)} ${esc(view.partner?.phone||d.partnerPhone)}</div><p>You’ll receive a fresh code when they request money back from this box. Sharing a code approves only that request. They still use their own PIN.</p><p class="muted">You do not get access to their balance, budgets or other boxes.</p>${expired?'<p class="notice">This invitation code is no longer available. Ask for a fresh code before accepting.</p>':code?`<div class="partner-phone-code"><small>Share this first code after accepting</small><strong>${esc(code)}</strong></div><p class="muted">This confirms your number and role before the box is created. This first code cannot release money.</p>`:accepted?'<p class="notice">This confirmation has already been verified or the code has expired.</p>':view.status==='declined'?'<p class="notice">You declined this invitation. No box with you as partner can be created from it.</p>':`<label class="partner-role-consent"><input type="checkbox" data-partner-consent><span>I agree to be the accountability partner for this Money Box.</span></label><p class="error" role="alert" data-partner-phone-error></p><button class="button" data-partner-accept>Accept and reveal my code</button><button class="button text" data-partner-decline>Decline invitation</button>`}<p class="box-partner-demo">Local participant simulation. No SMS or message was sent, and this is not another person’s live device.</p></div>`,el=>{
   const respond=decision=>{
    if(!el.isConnected||ctx.draft.box!==d||ctx.route.section!=='boxes'||ctx.route.page!=='create')return;
    if(decision==='accepted'&&!el.querySelector('[data-partner-consent]')?.checked){el.querySelector('[data-partner-phone-error]').textContent='Confirm you accept this role first.';return;}
    const result=ctx.act('respondBoxPartnerInitialInvitation',{invitationId:d.partnerInvitationId,decision});
    if(!result.ok){const error=el.querySelector('[data-partner-phone-error]');if(error)error.textContent=result.message;else ctx.toast(result.message);return;}
    ctx.closeSheet();ctx.refresh();openPartnerPhone(ctx);
   };
   el.querySelector('[data-partner-accept]')?.addEventListener('click',()=>respond('accepted'));
   el.querySelector('[data-partner-decline]')?.addEventListener('click',()=>respond('declined'));
 });
}

export function handleInitialPartnerAction(ctx,route,action,{setError,boxRoute,refresh}){
 if(!['box-partner','box-partner-toggle','box-partner-skip','partner-initial-preview','partner-initial-verify','partner-initial-resend','partner-initial-details','partner-initial-continue'].includes(action))return false;
 const d=ctx.draft.box;if(!d)return true;
 const error=message=>setError(ctx,message);
 const continueToReview=()=>{if(route.edit)delete ctx.draft.boxEditBackup;boxRoute('review');};
 const send=()=>{
  const checked=validatePartnerDetails({name:d.partnerName,phone:d.partnerPhone},ctx.state.profile?.phone);
  if(!checked.ok){error(checked.message);return;}
  d.partnerName=checked.partner.name;d.partnerPhone=checked.partner.phone;d.partnerSetupId ||= uid();
  const result=ctx.act('sendBoxPartnerInvitation',{...scope(d)});
  if(!result.ok){error(result.message);return;}
  d.partnerInvitationId=result.invitationId;d.partnerCodePhase='code';refresh();
 };
 if(action==='box-partner-toggle'){d.partnerEnabled=!d.partnerEnabled;refresh();}
 else if(action==='box-partner-skip'){d.partnerEnabled=false;d.partnerCodePhase='';continueToReview();}
 else if(action==='box-partner'){if(!d.partnerEnabled)continueToReview();else if(partnerReady(ctx)){d.partnerCodePhase='code';refresh();}else send();}
 else if(action==='partner-initial-resend')send();
 else if(action==='partner-initial-details'){d.partnerCodePhase='';refresh();}
 else if(action==='partner-initial-preview')openPartnerPhone(ctx);
 else if(action==='partner-initial-continue'){if(!partnerReady(ctx)){error('Ask your partner to confirm again before creating this box.');return true;}continueToReview();}
 else if(action==='partner-initial-verify'){
  const input=ctx.$('[name="box-partner-code"]'),code=input?.value||'';
  const result=ctx.act('verifyBoxPartnerInvitation',{...scope(d),code});
  if(!result.ok){if(input)input.value='';refresh();error(result.message);return true;}
  if(input)input.value='';refresh();ctx.toast(`${d.partnerName} is confirmed. Your Money Box is ready to create.`);
 }
 return true;
}
