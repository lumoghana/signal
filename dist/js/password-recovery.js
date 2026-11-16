import {captureRecoverySelfies,validRecoveryPhotos} from './recovery-camera.js';
/** Shared account recovery. Passwords, photos and private proofs stay out of view state and storage. */
const escape = value => String(value ?? '').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const uuid = value => typeof value==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
const future = (value,now) => typeof value==='string'&&Number.isFinite(Date.parse(value))&&Date.parse(value)>now;
const usableKey = value => typeof value==='string'&&value.length>=16&&value.length<=512&&!/[\u0000-\u001f\u007f]/.test(value);
const message = value => typeof value==='string'&&value.trim()?value.trim().slice(0,500):'That did not finish. Please try again.';
const input=(label,name,{type='text',value='',autocomplete='off',extra='',hint=''}={})=>`<label class="lumo-recovery-field"><span>${escape(label)}</span><input name="${name}" type="${type}" value="${escape(value)}" autocomplete="${autocomplete}" ${extra}>${hint?`<small>${escape(hint)}</small>`:''}</label>`;
const action=(label,name,{secondary=false,disabled=false}={})=>`<button type="button" class="lumo-recovery-button${secondary?' secondary':''}" data-password-recovery-action="${name}" ${disabled?'disabled':''}>${escape(label)}</button>`;
const form=(body,label,busy,{consent=false}={})=>`<form data-password-recovery-form>${body}<button type="submit" class="lumo-recovery-button" ${busy||consent?'disabled':''}>${escape(busy?'Please wait…':label)}</button></form>`;
const keyInput=()=>input('Private recovery key','backupKey',{type:'password',extra:'required maxlength="512" spellcheck="false"',hint:'Use the key you saved while signed in. Keep it private, even from support.'});
const codeInput=()=>input('Six-digit code','code',{autocomplete:'one-time-code',extra:'required inputmode="numeric" pattern="[0-9]{6}" minlength="6" maxlength="6"'});
export const FACE_CONSENT_VERSION='2026-11-16.face.1';
export const isStoredFaceRecovery=value=>value?.faceMatching==='stored-template'&&value.faceSimulation===false&&value.identityVerified===false&&value.livenessVerified===false&&value.requiresBackupKey===true;
const storedFaceContract=isStoredFaceRecovery;
export function syncFaceStorageConsent(control,{busy=false}={}){const submit=control?.closest?.('form')?.querySelector('button[type="submit"],button:not([type])');if(submit)submit.disabled=busy||control.checked!==true;}
export function bindFaceStorageConsent(root,{busy=false}={}){root.querySelectorAll('[name="faceConsent"]').forEach(control=>{const sync=()=>syncFaceStorageConsent(control,{busy});sync();control.addEventListener('change',sync);});}
const faceConsent=()=>`<label class="lumo-recovery-check"><input type="checkbox" name="faceConsent" required><span>I agree to save an encrypted face profile from these selfies and use it for future identity checks, including password recovery. The photos are discarded after processing.</span></label>`;
export function normalizeRecoveryPhone(value){if(typeof value!=='string')return null;const text=value.trim();if(!text)return '';if(text.length>24||!/^[+0-9 ()-]+$/.test(text))return null;const local=text.replace(/[ ()-]/g,'').replace(/^\+?233/,'0');return /^0[25][0-9]{8}$/.test(local)?'+233'+local.slice(1):null;}

export function validateRecoveryPassword(password,confirmation,{minLength=10,maxLength=128,maxBytes,lettersAndNumbers=true}={}){
 if(typeof password!=='string'||password.length<minLength)return `Use at least ${minLength} characters for your password.`;
 if(password.length>maxLength||maxBytes&&new TextEncoder().encode(password).length>maxBytes)return `Keep your password within ${maxBytes||maxLength} ${maxBytes?'bytes':'characters'}.`;
 if(lettersAndNumbers&&(!/[A-Za-z]/.test(password)||!/[0-9]/.test(password)))return 'Include a letter and a number in your password.';
 if(password!==confirmation)return 'Those passwords do not match.';
 return '';
}
export function createPasswordRecovery({module='consumer',identifier='',request,capture=captureRecoverySelfies,onChange=()=>{},onBack=()=>{},onComplete=()=>{},now=Date.now,clipboard=globalThis.navigator?.clipboard}={}){
 if(!['consumer','merchant','admin'].includes(module)||typeof request!=='function'||typeof capture!=='function')throw Error('Use a supported account recovery service.');
 let disposed=false,generation=0,requestId='',resetToken='',proofExpiresAt='',backupKey='',backupKeyReference='',demoCode='',cameraAbort=null;
 let state={mode:'recover',phase:'loading',busy:false,error:'',message:'',identifier:String(identifier||''),method:'face',simulation:false,smsSimulation:false,environment:'',requiresBackupKey:false,smsAvailable:false,faceAvailable:false,faceMatching:'unavailable',expiresAt:'',retryAt:0,enrollment:{phoneMasked:'',phoneVerified:false,phoneSimulation:false,backupKeyReady:false,keyRotationAvailable:false,faceEnrolled:false,faceSimulation:false,templateEnrolled:false,templateVersion:null,faceConsentVersion:null,reEnrollmentRequired:false},showKey:false,passwordPolicy:{minLength:module==='admin'?12:10,maxLength:module==='admin'?72:128,...(module==='admin'?{maxBytes:72}:{}),lettersAndNumbers:true}};
 const view=()=>Object.freeze({...state,enrollment:Object.freeze({...state.enrollment}),passwordPolicy:Object.freeze({...state.passwordPolicy})});
 const current=token=>!disposed&&token===generation;
 const emit=()=>{if(!disposed)onChange(view());};
 const cancelCamera=()=>{cameraAbort?.abort();cameraAbort=null;};
 const clearProof=()=>{requestId='';resetToken='';proofExpiresAt='';demoCode='';state.expiresAt='';state.retryAt=0;};
 const clearKey=()=>{backupKey='';backupKeyReference='';state.showKey=false;};
 const fail=value=>{state.error=message(value);emit();return false;};
 async function call(operation,values={},authenticated=false){
  if(disposed||state.busy)return null;
  const token=generation;state.busy=true;state.error='';emit();
  try{const reply=await request(operation,values,{authenticated});if(!current(token))return null;if(!reply||reply.ok!==true){state.error=message(reply?.message);if(Number.isFinite(reply?.retryAfter)&&reply.retryAfter>0)state.retryAt=now()+Math.min(reply.retryAfter,3600)*1000;return null;}return reply;}
  catch{if(current(token))state.error='We could not confirm the result. Check your connection before trying again.';return null;}
  finally{if(current(token)){state.busy=false;emit();}}
 }
 function installChallenge(reply){
  if(!uuid(reply.requestId)||!future(reply.expiresAt,now()))return fail('A current recovery request could not be prepared. Start again.');
  clearProof();requestId=reply.requestId;state.expiresAt=reply.expiresAt;state.retryAt=now()+Math.max(0,Math.min(Number(reply.retryAfter)||60,3600))*1000;
  demoCode=state.smsSimulation&&typeof reply.demoCode==='string'&&/^[0-9]{6}$/.test(reply.demoCode)?reply.demoCode:'';
  state.message=typeof reply.message==='string'?message(reply.message):'';return true;
 }
 function installReset(reply){
  if(typeof reply.resetToken!=='string'||!/^[A-Za-z0-9_-]{40,128}$/.test(reply.resetToken)||!future(reply.expiresAt,now()))return fail('This password reset could not be verified. Start again.');
  resetToken=reply.resetToken;proofExpiresAt=reply.expiresAt;demoCode='';state.phase='password';state.message='';emit();return true;
 }
 function installKey(reply){
  if(!usableKey(reply.backupKey)){state.phase='settings';state.message='Your recovery settings may have changed, but this key could not be shown. Create a fresh backup key before relying on it.';clearProof();return false;}
  backupKey=reply.backupKey;backupKeyReference=String(reply.keyReference||reply.backupKeyReference||'');state.phase='backup-key';state.message='';state.error='';state.showKey=false;clearProof();return true;
 }
 async function takePhotos(purpose){
  if(disposed||state.busy)return null;
  const token=generation,controller=new AbortController();cameraAbort=controller;state.busy=true;state.error='';emit();
  try{const photos=await capture({signal:controller.signal,purpose,faceMatching:state.faceMatching,simulation:purpose==='enrollment'?false:state.faceMatching!=='stored-template'});if(!current(token)||controller.signal.aborted)return null;if(!validRecoveryPhotos(photos)){state.error='Take three current camera photos before continuing.';return null;}return photos;}
  catch(error){if(current(token))state.error=error?.name==='AbortError'?'Camera capture cancelled. Your recovery settings have not changed.':'The camera could not finish. Check camera permission and try again.';return null;}
  finally{if(cameraAbort===controller)cameraAbort=null;if(current(token)){state.busy=false;emit();}}
 }
 async function start(mode='recover'){
  if(disposed)return false;
  const token=++generation;cancelCamera();clearProof();clearKey();state={...state,mode:mode==='settings'?'settings':'recover',phase:'loading',busy:false,error:'',message:''};emit();
  const reply=await call('status',{},state.mode==='settings');if(!current(token))return false;
  if(!reply){state.phase='unavailable';emit();return false;}
  state.simulation=reply.simulation===true||reply.environment==='sandbox';state.smsSimulation=reply.smsSimulation===true||reply.phoneSimulation===true||state.simulation;state.environment=String(reply.environment||'');state.requiresBackupKey=reply.requiresBackupKey===true||state.simulation;state.smsAvailable=reply.smsAvailable===true;state.faceAvailable=reply.faceAvailable===true&&storedFaceContract(reply)&&reply.faceConsentVersion===FACE_CONSENT_VERSION;state.faceMatching=state.faceAvailable?'stored-template':'unavailable';
  const policy=reply.passwordPolicy;if(policy&&typeof policy==='object'){const min=Number(policy.minLength),max=Number(policy.maxLength);if(Number.isInteger(min)&&min>=state.passwordPolicy.minLength&&min<=64)state.passwordPolicy.minLength=min;if(Number.isInteger(max)&&max>=state.passwordPolicy.minLength&&max<=state.passwordPolicy.maxLength)state.passwordPolicy.maxLength=max;}
  const e=reply.enrollment||{},template=e.templateEnrolled===true&&e.templateVersion===1&&e.faceConsentVersion===FACE_CONSENT_VERSION;state.enrollment={phoneMasked:String(e.phoneMasked||''),phoneVerified:e.phoneVerified===true&&!state.smsSimulation,phoneSimulation:e.phoneSimulation===true||state.smsSimulation,backupKeyReady:e.backupKeyReady===true,keyRotationAvailable:e.keyRotationAvailable===true,faceEnrolled:e.faceEnrolled===true,faceSimulation:e.faceSimulation===true,templateEnrolled:template,templateVersion:template?1:null,faceConsentVersion:template?FACE_CONSENT_VERSION:null,reEnrollmentRequired:e.reEnrollmentRequired===true||e.faceEnrolled===true&&!template};
  state.phase=state.mode==='settings'?'settings':'identify';state.method=state.faceAvailable?'face':state.smsAvailable?'sms':'key';emit();return true;
 }
 async function submit(values={}){
  if(disposed||state.busy)return false;state.error='';
  if(state.phase==='identify'){
   const entered=String(values.identifier??state.identifier).trim(),valid=module==='admin'?/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(entered):/^[a-z0-9][a-z0-9._-]{2,29}$/i.test(entered.replace(/^@/,''));
   if(!valid||entered.length>254)return fail(module==='admin'?'Enter your work email address.':'Enter your Lumo username.');
   if(state.method==='sms'&&!state.smsAvailable||state.method==='face'&&!state.faceAvailable)return fail('That recovery option is unavailable. Use your saved private recovery key.');
   state.identifier=module==='admin'?entered.toLowerCase():entered.replace(/^@/,'').toLowerCase();
   const reply=await call('start',{identifier:state.identifier,method:state.method});if(!reply||!installChallenge(reply))return false;
   state.phase='verify-'+state.method;emit();return true;
  }
  if(['verify-face','verify-sms','verify-key'].includes(state.phase)){
   if(!requestId||!future(state.expiresAt,now()))return fail('This recovery request has expired. Start again for a fresh request.');
   const key=String(values.backupKey||'').trim(),method=state.phase.slice(7),id=requestId,token=generation;
   if((method==='key'||state.requiresBackupKey)&&!usableKey(key))return fail('Enter your saved private recovery key. It authorises this password reset.');
   if(method==='face'){
    let photos=await takePhotos('recovery');if(!photos||!current(token)||id!==requestId)return false;
    try{const reply=await call('faceVerify',{requestId:id,backupKey:key,photos});if(!reply)return false;if(!storedFaceContract(reply)||reply.faceMatched!==true)return fail('Your saved face could not be confirmed. Use another recovery method or start again.');return installReset(reply);}finally{photos=[];}
   }
   const code=String(values.code||'').trim();if(method==='sms'&&!/^[0-9]{6}$/.test(code))return fail(state.simulation?'Enter the six-digit test code shown here.':'Enter the six-digit code from the SMS.');
   const reply=await call(method==='sms'?'smsVerify':'keyVerify',{requestId:id,...(method==='sms'?{code,...(state.requiresBackupKey?{backupKey:key}:{})}:{backupKey:key})});return !!reply&&installReset(reply);
  }
  if(state.phase==='password'){
   if(!requestId||!resetToken||!future(proofExpiresAt,now())){resetToken='';return fail('This password reset has expired. Start again.');}
   const invalid=validateRecoveryPassword(values.newPassword,values.confirmPassword,state.passwordPolicy);if(invalid)return fail(invalid);
   const reply=await call('complete',{requestId,resetToken,newPassword:values.newPassword});if(!reply)return false;if(reply.completed!==true)return fail('The service could not confirm the password change. Try signing in before starting another reset.');
   clearProof();clearKey();state.phase='success';state.message='Your password is updated. Sign in again with your new password.';emit();onComplete({mode:'recover',passwordChanged:true,module,identifier:state.identifier});return true;
  }
  if(state.phase==='enrollment-start'){
   if(!state.faceAvailable)return fail('Saved-face setup is unavailable right now. Your existing recovery settings are unchanged.');
   if(values.faceConsent!==true&&values.faceConsent!=='on')return fail('Agree to encrypted face-profile storage before continuing.');
   if(typeof values.currentPassword!=='string'||!values.currentPassword||values.currentPassword.length>128)return fail('Enter your current password to protect this change.');
   const enteredPhone=String(values.phone||'').trim(),phone=normalizeRecoveryPhone(enteredPhone);if(phone===null)return fail('Enter a Ghana mobile number, such as 024 000 0000 or +233 24 000 0000.');
   const token=generation;let photos=state.faceAvailable?await takePhotos('enrollment'):null;if(state.faceAvailable&&!photos||!current(token))return false;
   try{const reply=await call('enrollmentStart',{currentPassword:values.currentPassword,faceConsent:{version:FACE_CONSENT_VERSION,accepted:true},...(photos?{photos}:{}),...(phone?{phone}:{})},true);if(!reply)return false;if(!storedFaceContract(reply))return fail('Saved-face setup could not be confirmed. Your existing recovery settings are unchanged.');if(!installChallenge(reply))return false;state.enrollment={...state.enrollment,phoneMasked:String(reply.phoneMasked||state.enrollment.phoneMasked)};state.phase='enrollment-verify';state.message=state.smsSimulation?'Use the test code shown here. No SMS has been sent. Your existing recovery settings stay in place until this step completes.':'Enter the code sent to this number. Your existing recovery settings stay in place until it is verified.';emit();return true;}finally{photos=null;}
  }
  if(state.phase==='enrollment-verify'){
   if(!requestId||!future(state.expiresAt,now()))return fail('This setup request expired. Return to settings and try again.');
   const code=String(values.code||'').trim();if(!/^[0-9]{6}$/.test(code))return fail(state.simulation?'Enter the six-digit test code shown here.':'Enter the six-digit code from the SMS.');
   const reply=await call('enrollmentVerify',{requestId,code},true);if(!reply)return false;
   if(!storedFaceContract(reply)||reply.templateEnrolled!==true||reply.templateVersion!==1||reply.faceConsentVersion!==FACE_CONSENT_VERSION)return fail('Your saved face profile could not be confirmed. Review recovery settings before relying on it.');
   state.enrollment={...state.enrollment,phoneVerified:!state.smsSimulation&&reply.phoneSimulation!==true,phoneSimulation:state.smsSimulation||reply.phoneSimulation===true,phoneMasked:String(reply.phoneMasked||state.enrollment.phoneMasked),faceEnrolled:true,faceSimulation:false,keyRotationAvailable:true,templateEnrolled:true,templateVersion:1,faceConsentVersion:FACE_CONSENT_VERSION,reEnrollmentRequired:false};const installed=installKey(reply);emit();return installed;
  }
  if(state.phase==='rotate'){
   if(typeof values.currentPassword!=='string'||!values.currentPassword||values.currentPassword.length>128)return fail('Enter your current password to protect this change.');
   const reply=await call('keyRotate',{currentPassword:values.currentPassword},true);if(!reply)return false;const installed=installKey(reply);emit();return installed;
  }
  if(state.phase==='face-remove'){
   if(values.removeFace!==true&&values.removeFace!=='on')return fail('Confirm you want to remove your saved face profile.');
   if(typeof values.currentPassword!=='string'||!values.currentPassword||values.currentPassword.length>128)return fail('Enter your current password to protect this change.');
   const reply=await call('faceRemove',{currentPassword:values.currentPassword},true);if(!reply)return false;
   if(reply.removed!==true||reply.templateEnrolled!==false)return fail('Face-profile removal could not be confirmed. Review recovery settings before relying on this change.');
   clearProof();state.enrollment={...state.enrollment,keyRotationAvailable:typeof reply.enrollment?.keyRotationAvailable==='boolean'?reply.enrollment.keyRotationAvailable:state.enrollment.keyRotationAvailable,faceEnrolled:false,faceSimulation:false,templateEnrolled:false,templateVersion:null,faceConsentVersion:null,reEnrollmentRequired:false};state.phase='settings';state.message='Your encrypted face profile was removed. Face recovery is disabled until you choose to set it up again.';emit();return true;
  }
  if(state.phase==='backup-key'){
   if(!values.savedKey)return fail('Confirm you have saved your recovery key somewhere private.');clearKey();state.enrollment={...state.enrollment,backupKeyReady:true};state.phase='settings';state.message='Your recovery key is ready. Keep it private and separate from your password.';emit();return true;
  }
  return false;
 }
 async function choose(name){
  if(disposed)return false;
  if(name==='back'||name==='restart'){generation++;cancelCamera();clearProof();clearKey();state.busy=false;state.error='';state.message='';if(name==='back'){onBack();return true;}state.phase=state.mode==='settings'?'settings':'identify';emit();return true;}
  if(state.busy)return false;state.error='';
  if(name==='retry')return start(state.mode);
  if(['face','sms','key'].includes(name)){if(state.phase!=='identify'||name==='sms'&&!state.smsAvailable||name==='face'&&!state.faceAvailable)return false;state.method=name;emit();return true;}
  if(name==='resend'){if(state.phase!=='verify-sms'||now()<state.retryAt)return fail('Wait before requesting another code.');const reply=await call('start',{identifier:state.identifier,method:'sms'});if(!reply||!installChallenge(reply))return false;emit();return true;}
  if(name==='enroll'){if(!state.faceAvailable||!state.smsAvailable)return fail('Saved-face setup is unavailable right now. Your existing recovery settings are unchanged.');clearProof();state.phase='enrollment-start';state.message='';emit();return true;}
  if(name==='rotate'){if(!state.enrollment.keyRotationAvailable)return fail('Complete recovery setup before creating a private key.');clearProof();clearKey();state.phase='rotate';state.message='';emit();return true;}
  if(name==='remove-face'){if(!state.enrollment.templateEnrolled)return false;clearProof();state.phase='face-remove';state.message='';emit();return true;}
  if(name==='show-key'){if(state.phase!=='backup-key')return false;state.showKey=!state.showKey;emit();return true;}
  if(name==='copy-key'){if(state.phase!=='backup-key'||!backupKey)return false;const token=generation;try{if(!clipboard?.writeText)throw Error();await clipboard.writeText(backupKey);if(!current(token))return false;state.message='Recovery key copied. Save it somewhere private.';emit();return true;}catch{return current(token)?fail('Copy is unavailable. Use Show key and save it privately.'):false;}}
  return false;
 }
 function render(){
  const s=state,busy=s.busy,notice=s.faceMatching==='stored-template'?`${s.mode==='settings'&&!s.enrollment.templateEnrolled?'Face recovery can compare fresh selfies with an encrypted face profile after you choose to save one.':'Selfies are compared with your encrypted face profile.'} Live-person checks are not verified. Keep your private recovery key. SMS and Ghana Card checks are still simulated.`:s.simulation?'SMS and Ghana Card checks are simulated. Saved-face comparison is unavailable here. Use your private recovery key or the test SMS flow.':'',feedback=`${notice?`<p class="lumo-recovery-test" role="note">${escape(notice)}</p>`:''}${s.error?`<p class="lumo-recovery-error" role="alert">${escape(s.error)}</p>`:''}${s.message?`<p class="lumo-recovery-notice" role="status">${escape(s.message)}</p>`:''}`;
  const demo=demoCode?`<p class="lumo-recovery-test-code">Test code: <strong>${escape(demoCode)}</strong><br>No SMS has been sent. This does not verify phone ownership.</p>`:'';
  let title='',intro='',body='';
  if(s.phase==='loading'){title='One moment.';intro='Checking your recovery options.';}
  else if(s.phase==='unavailable'){title='Let’s try that again.';intro='We could not load account recovery.';body=action('Try again','retry');}
  else if(s.phase==='identify'){
   title='Let’s get you back.';intro='Reset your password. Your transaction PIN and money stay as they are.';
   body=`<div class="lumo-recovery-methods" aria-label="Recovery method">${action('Face check','face',{secondary:s.method!=='face',disabled:busy||!s.faceAvailable})}${action('SMS code','sms',{secondary:s.method!=='sms',disabled:busy||!s.smsAvailable})}${action('Private key','key',{secondary:s.method!=='key',disabled:busy})}</div>`+form(input(module==='admin'?'Work email':'Lumo username','identifier',{value:s.identifier,autocomplete:module==='admin'?'email':'username',type:module==='admin'?'email':'text',extra:`required maxlength="${module==='admin'?254:31}" autocapitalize="none" spellcheck="false"`})+'<p class="lumo-recovery-hint">This step does not confirm whether an account exists.</p>',s.method==='face'?'Continue to face check':s.method==='sms'?s.simulation?'Prepare test code':'Send recovery code':'Use my private key',busy)+'<p class="lumo-recovery-hint">No saved recovery key? Contact Lumo support for identity review.</p>';
  }else if(s.phase==='verify-face'){
   title='A little face time.';intro='Take fresh camera photos to compare with your saved face profile. Your private recovery key is also required.';
   body=form((s.requiresBackupKey?keyInput():'')+'<p class="lumo-recovery-hint">You will see a camera preview and choose whether to allow capture. Nothing is uploaded until you continue.</p>','Take selfies and continue',busy)+action('Start again','restart',{secondary:true});
  }else if(s.phase==='verify-sms'||s.phase==='verify-key'){
   const sms=s.phase==='verify-sms';title=sms?s.simulation?'Your test code.':'Check your SMS.':'Your private way back.';intro=sms?s.simulation?'Use the displayed test code and your saved private key.':'Use the code for your recovery request.':'Enter the private key you saved while signed in.';
   body=demo+form((sms?codeInput():'')+(!sms||s.requiresBackupKey?keyInput():''),'Verify and continue',busy)+(sms?action(s.simulation?'Prepare another test code':'Send another code','resend',{secondary:true,disabled:busy||now()<s.retryAt}):'')+action('Start again','restart',{secondary:true});
  }else if(s.phase==='password'){
   title='A fresh password.';intro='Choose a password you do not use elsewhere. Existing sessions for this account will end.';
   body=form(input('New password','newPassword',{type:'password',autocomplete:'new-password',extra:`required minlength="${s.passwordPolicy.minLength}" maxlength="${s.passwordPolicy.maxLength}"`,hint:`Use at least ${s.passwordPolicy.minLength} characters, including a letter and a number.`})+input('Confirm new password','confirmPassword',{type:'password',autocomplete:'new-password',extra:`required maxlength="${s.passwordPolicy.maxLength}"`})+'<p class="lumo-recovery-hint">This does not reset your transaction PIN or cashier PIN.</p>','Update password',busy)+action('Start again','restart',{secondary:true});
  }else if(s.phase==='success'){title='You’re ready to sign in.';intro='Use your new password. Your money and transaction PIN are unchanged.';body=action('Back to sign in','back');}
  else if(s.phase==='settings'){
   title='Keep a way back in.';intro='Set up recovery while you can still sign in.';
   const phone=s.enrollment.phoneSimulation?'Test setup · ownership unverified':s.enrollment.phoneVerified?s.enrollment.phoneMasked||'Verified phone':'Not verified',face=s.enrollment.templateEnrolled?'Encrypted face profile saved':s.enrollment.reEnrollmentRequired?'Fresh setup required':'Not enrolled';
   body=`<dl class="lumo-recovery-summary"><div><dt>Face recovery</dt><dd>${escape(face)}</dd></div><div><dt>Recovery phone</dt><dd>${escape(phone)}</dd></div><div><dt>Private key</dt><dd>${s.enrollment.backupKeyReady?'Ready':'Not set up'}</dd></div></dl>${s.enrollment.reEnrollmentRequired?'<p class="lumo-recovery-hint">Your previous test setup did not save a reusable face profile. Confirm your password and take new selfies to enable saved-face comparison.</p>':''}`+action(s.enrollment.templateEnrolled?'Replace saved face profile':s.enrollment.reEnrollmentRequired?'Set up saved-face comparison':s.faceAvailable?'Save face for recovery':'Face setup unavailable','enroll',{disabled:busy||!s.smsAvailable||!s.faceAvailable})+(s.enrollment.templateEnrolled?action('Remove saved face','remove-face',{secondary:true,disabled:busy}):'')+action(s.enrollment.backupKeyReady?'Replace private key':'Create private key','rotate',{secondary:true,disabled:busy||!s.enrollment.keyRotationAvailable})+'<p class="lumo-recovery-hint">Your current password protects changes. Keep the private key separate from your password.</p>';
  }else if(s.phase==='enrollment-start'){
   title='Save your face for later.';intro='Confirm your password, then take three camera photos. Lumo saves an encrypted face profile and discards the photos after processing.';
   body=form(input('Current password','currentPassword',{type:'password',autocomplete:'current-password',extra:'required maxlength="128"'})+input('Recovery mobile number (optional)','phone',{type:'tel',autocomplete:'tel',extra:'inputmode="tel" maxlength="24"',hint:module==='admin'?'Enter a Ghana mobile number if your account has no recovery number.':'Leave blank to use your registered number. If your account has no number, enter a Ghana mobile number. An existing registered number cannot be changed here.'})+(s.enrollment.phoneMasked?`<p class="lumo-recovery-hint">Registered number: ${escape(s.enrollment.phoneMasked)}</p>`:'')+faceConsent(),'Continue to camera',busy,{consent:true})+action('Back to recovery settings','restart',{secondary:true});
  }else if(s.phase==='enrollment-verify'){
   title=s.simulation?'Finish test setup.':'Check your SMS.';intro=s.simulation?'Use the test code below. You will then receive a private recovery key.':`Enter the code for ${s.enrollment.phoneMasked||'your recovery phone'}.`;
   body=demo+form(codeInput(),s.simulation?'Complete test setup':'Verify recovery phone',busy)+action('Back to recovery settings','restart',{secondary:true});
  }else if(s.phase==='rotate'){
   title=s.enrollment.backupKeyReady?'Replace your private key.':'A private way back.';intro=s.enrollment.backupKeyReady?'Your previous key will stop working. Save the new one before leaving.':'Save this key somewhere private. It can authorise a password reset.';
   body=form(input('Current password','currentPassword',{type:'password',autocomplete:'current-password',extra:'required maxlength="128"'}),'Create private key',busy)+action('Back to recovery settings','restart',{secondary:true});
  }else if(s.phase==='face-remove'){
   title='Remove your saved face?';intro='This deletes your encrypted face profile and disables face recovery. Your password, private recovery key and recovery phone stay as they are.';
   body=form(input('Current password','currentPassword',{type:'password',autocomplete:'current-password',extra:'required maxlength="128"'})+'<label class="lumo-recovery-check"><input type="checkbox" name="removeFace" required><span>I want to remove my saved face profile.</span></label>','Remove saved face',busy)+action('Keep my saved face','restart',{secondary:true});
  }else if(s.phase==='backup-key'){
   title='Save your backup key.';intro='This key is shown once. It can reset your password, so keep it somewhere private.';
   body=form(input('Private backup key','savedBackupKey',{value:backupKey,type:s.showKey?'text':'password',extra:'readonly spellcheck="false"'})+`<div class="lumo-recovery-methods">${action(s.showKey?'Hide key':'Show key','show-key',{secondary:true})}${action('Copy key','copy-key',{secondary:true})}</div><label class="lumo-recovery-check"><input type="checkbox" name="savedKey" required><span>I saved my private key somewhere private.</span></label>`,'I saved my backup key',busy);
  }
  return `<section class="lumo-recovery" data-password-recovery-stage="${escape(s.mode+':'+s.phase)}"><h2>${escape(title)}</h2><p class="lumo-recovery-intro">${escape(intro)}</p>${feedback}${body}${s.phase!=='success'?action(s.mode==='settings'?'Close recovery settings':'Back to sign in','back',{secondary:true}):''}</section>`;
 }
 return {start,submit,action:choose,render,get view(){return view();},dispose(){if(disposed)return;disposed=true;generation++;cancelCamera();clearProof();clearKey();state.busy=false;}};
}
