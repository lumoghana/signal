import {validRecoveryPhotos} from './recovery-camera.js';
import {FACE_CONSENT_VERSION,isStoredFaceRecovery,bindFaceStorageConsent} from './password-recovery.js';
/** Signup recovery owns secrets only in this short-lived controller, never drafts. */
const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const uuid=value=>typeof value==='string'&&/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(value);
const future=(value,now)=>typeof value==='string'&&Number.isFinite(Date.parse(value))&&Date.parse(value)>now;
const safeMessage=value=>typeof value==='string'&&value.trim()?value.trim().slice(0,500):'Recovery setup could not finish. Your account has already been created.';
const validPhotos=validRecoveryPhotos;
const button=(label,action,{secondary=false,disabled=false}={})=>`<button type="button" class="button${secondary?' ghost':''}" data-signup-recovery-action="${action}"${disabled?' disabled':''}>${esc(label)}</button>`;

export function createSignupRecovery({request,password,captures,preparePhotos,now=Date.now,isCurrent=()=>true,clipboard=globalThis.navigator?.clipboard,onChange=()=>{},onComplete=()=>{},onSignIn=()=>{}}={}){
 if(typeof request!=='function'||typeof preparePhotos!=='function')throw new TypeError('Signup recovery needs the authenticated request and captured-photo encoder.');
 let disposed=false,generation=0,currentPassword=password,originalCaptures=captures,requestId='',expiresAt='',demoCode='',backupKey='';
 let state={phase:'prepare',busy:false,error:'',phoneMasked:'',showKey:false,message:'',faceMatching:'unavailable'};
 const view=()=>({...state});
 const emit=()=>{if(!disposed)onChange(view());};
 const valid=token=>!disposed&&token===generation&&isCurrent();
 const clearCaptures=()=>{currentPassword='';originalCaptures=null;};
 const clearProof=()=>{requestId='';expiresAt='';demoCode='';backupKey='';};
 const fail=message=>{state.error=safeMessage(message);emit();return false;};
 async function start(){
  if(disposed||state.busy||!isCurrent())return false;
  if(!currentPassword||!Array.isArray(originalCaptures)||originalCaptures.length!==3){state.phase='interrupted';return fail('Your account is created. Sign in again and finish password recovery in Security & access. New selfies will be needed.');}
  const token=++generation;state={...state,phase:'prepare',busy:true,error:'',message:''};emit();
  try{
   const reply=await request('status',{}, {authenticated:true});if(!valid(token))return false;
   if(reply?.ok!==true||reply.faceAvailable!==true||!isStoredFaceRecovery(reply)||reply.faceConsentVersion!==FACE_CONSENT_VERSION){state.phase='unavailable';return fail('Your account is created. Saved-face matching is unavailable right now. Sign in to review recovery settings later.');}
   state.faceMatching='stored-template';state.phase='consent';return true;
  }catch{if(valid(token)){state.phase='unavailable';state.error='Your account is created. Recovery setup could not connect. Retry, or sign in to finish it later.';}return false;}
  finally{if(valid(token)){state.busy=false;emit();}}
 }
 async function enrollWithConsent(){
  const token=generation;state={...state,phase:'prepare',busy:true,error:'',message:''};emit();let photos;
  try{
   photos=await preparePhotos(originalCaptures);if(!valid(token))return false;
   if(!validPhotos(photos))throw Error('Your setup photos could not be prepared within the upload limit.');
   const reply=await request('enrollmentStart',{currentPassword,photos,faceConsent:{version:FACE_CONSENT_VERSION,accepted:true}},{authenticated:true});if(!valid(token))return false;
   if(reply?.ok!==true){state.phase='prepare';return fail(reply?.message);}
   if(!isStoredFaceRecovery(reply)||reply.faceConsentVersion!==FACE_CONSENT_VERSION||!uuid(reply.requestId)||!future(reply.expiresAt,now())||!/^\d{6}$/.test(reply.demoCode||'')){
    clearCaptures();state.phase='interrupted';return fail('Your account is created, but recovery setup could not be confirmed. Sign in again to review recovery settings.');
   }
   requestId=reply.requestId;expiresAt=reply.expiresAt;demoCode=reply.demoCode;state.phoneMasked=String(reply.phoneMasked||'');state.phase='code';clearCaptures();return true;
  }catch(error){if(valid(token)){state.phase='prepare';state.error='Your account is created. The recovery step could not connect. Retry this step, or sign in again to finish it later.';}return false;}
  finally{photos=null;if(valid(token)){state.busy=false;emit();}}
 }
 async function submit(values={}){
  if(disposed||state.busy||!isCurrent())return false;
  if(state.phase==='consent'){
   if(values.faceConsent!==true&&values.faceConsent!=='on')return fail('Agree to encrypted face-profile storage before continuing.');
   return enrollWithConsent();
  }
  if(state.phase==='code'){
   if(!requestId||!future(expiresAt,now())){state.phase='interrupted';return fail('This setup code expired. Your account is already created. Sign in again to finish recovery settings.');}
   const code=String(values.code||'').trim();if(!/^\d{6}$/.test(code))return fail('Enter the six-digit test code shown here.');
   const token=generation;state.busy=true;state.error='';emit();
   try{
    const reply=await request('enrollmentVerify',{requestId,code},{authenticated:true});if(!valid(token))return false;
    if(reply?.ok!==true)return fail(reply?.message);
    if(!isStoredFaceRecovery(reply)||reply.enrolled!==true||reply.templateEnrolled!==true||reply.templateVersion!==1||reply.faceConsentVersion!==FACE_CONSENT_VERSION||!/^LUMO-[A-Za-z0-9_-]{43}$/.test(reply.backupKey||'')){
     clearProof();state.phase='interrupted';return fail('Your recovery settings may have changed, but the private key could not be shown. Sign in again to replace it before relying on recovery.');
    }
    backupKey=reply.backupKey;demoCode='';requestId='';expiresAt='';state.phase='key';state.showKey=false;state.message='';return true;
   }catch{if(valid(token)){clearCaptures();clearProof();state.phase='interrupted';state.error='Your account is created. Recovery may have been saved, but the private key was not received. Sign in again and review or replace it in Password recovery before relying on it.';}return false;}
   finally{if(valid(token)){state.busy=false;emit();}}
  }
  if(state.phase==='key'){
   if(!values.savedKey)return fail('Save your private recovery key before continuing.');
   clearCaptures();clearProof();state={...state,phase:'done',error:'',message:'',showKey:false};emit();onComplete({enrolled:true,simulation:true,faceMatching:'stored-template',faceSimulation:false});return true;
  }
  return false;
 }
 async function action(name){
  if(disposed||state.busy||!isCurrent())return false;
  if(name==='retry'&&['prepare','unavailable'].includes(state.phase))return start();
  if(name==='sign-in'&&state.phase!=='key'){clearCaptures();clearProof();state.phase='interrupted';onSignIn();return true;}
  if(name==='show-key'&&state.phase==='key'){state.showKey=!state.showKey;emit();return true;}
  if(name==='copy-key'&&state.phase==='key'){
   const token=generation;try{if(!clipboard?.writeText)throw Error();await clipboard.writeText(backupKey);if(!valid(token))return false;state.message='Recovery key copied. Save it somewhere private.';emit();return true;}
   catch{return valid(token)?fail('Copy is unavailable. Show the key and save it somewhere private.'):false;}
  }
  return false;
 }
 function render(){
  const busy=state.busy,feedback=`${state.error?`<p class="error" role="alert">${esc(state.error)}</p>`:''}${state.message?`<p role="status">${esc(state.message)}</p>`:''}`;
  let title='Keep a way back in.',description='Choose whether to save a face profile from the three selfies you just took.',body='';
  if(state.phase==='prepare')body=busy?'<p role="status">Preparing recovery from your setup selfies…</p>':button('Retry recovery setup','retry')+button('Sign in to finish later','sign-in',{secondary:true});
  else if(state.phase==='consent'){
   title='Your face. Your choice.';description='Lumo can save an encrypted face profile for later identity checks, including password recovery.';
   body=`<form data-signup-recovery-form><label class="onb-consent"><input type="checkbox" name="faceConsent" required><span>I agree to save an encrypted face profile from my setup selfies and use it for future identity checks. The photos are discarded after processing.</span></label>${feedback}<button class="button" disabled>Save my face for recovery</button></form>${button('Sign in to finish later','sign-in',{secondary:true,disabled:busy})}`;
  }
  else if(state.phase==='code'){
   title='Finish your test setup.';description='Your account is created. One recovery step before your first Lumo moment.';
   body=`<p class="onb-demo-code">Your test code is <strong>${esc(demoCode)}</strong>.</p><p class="onb-fine">No SMS was sent. This does not verify phone ownership.</p><form data-signup-recovery-form><label class="onb-field"><span>Six-digit test code</span><input class="input" name="code" inputmode="numeric" autocomplete="one-time-code" maxlength="6" required${busy?' disabled':''}></label>${feedback}<button class="button"${busy?' disabled':''}>${busy?'Checking…':'Confirm test setup'}</button></form>${button('Sign in to finish later','sign-in',{secondary:true,disabled:busy})}`;
  }else if(state.phase==='key'){
   title='Save your way back in.';description='This private key is shown once. Keep it separate from your password.';
   body=`<form data-signup-recovery-form><label class="onb-field"><span>Private recovery key</span><input class="input" name="recoveryKey" type="${state.showKey?'text':'password'}" value="${esc(backupKey)}" readonly autocomplete="off" spellcheck="false"></label><div class="onb-inline-links">${button(state.showKey?'Hide key':'Show key','show-key',{secondary:true})}${button('Copy key','copy-key',{secondary:true})}</div><label class="onb-consent"><input type="checkbox" name="savedKey" required><span>I saved my private recovery key somewhere private.</span></label>${feedback}<button class="button">I saved my key. Let’s go.</button></form>`;
  }else if(state.phase==='interrupted'||state.phase==='unavailable'){
   title='Your account is safe.';description='Recovery setup is not confirmed. Sign in again and open Security & access → Password recovery.';body=feedback+button('Back to sign in','sign-in');
   if(state.phase==='unavailable')body+=button('Try recovery setup again','retry',{secondary:true});
  }
  return `<section class="onb-page onb-step-recovery" aria-label="Finish signup recovery" data-signup-recovery-stage="${esc(state.phase)}"><header class="onb-header"><span></span><div><span>Your way back</span><small>Finish setup</small></div><span></span></header><main class="onb-main"><span class="onb-kicker">FACE RECOVERY</span><h1>${esc(title)}</h1><p class="onb-description">${esc(description)}</p><p class="onb-fine" role="note">${state.faceMatching==='stored-template'?'Selfies are compared with your encrypted face profile. Live-person checks are not verified. SMS and Ghana Card checks remain simulated. Your private recovery key is also required.':'Saving a reusable face profile needs your separate consent and an available matching service. Your account has already been created.'}</p>${state.phase==='prepare'?feedback:''}${body}</main></section>`;
 }
 function bind(root){
  bindFaceStorageConsent(root,{busy:state.busy});
  root.querySelectorAll('[data-signup-recovery-form]').forEach(form=>form.addEventListener('submit',event=>{event.preventDefault();void submit(Object.fromEntries(new FormData(form)));}));
  root.querySelectorAll('[data-signup-recovery-action]').forEach(control=>control.addEventListener('click',()=>void action(control.dataset.signupRecoveryAction)));
 }
 return {start,submit,action,render,bind,get view(){return view();},dispose(){if(disposed)return;disposed=true;generation++;clearCaptures();clearProof();state.busy=false;}};
}
