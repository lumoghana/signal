const DRAFT_KEY='lumo-merchant-signup-draft-v1';
const E=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const coordinates={'Night Market':[5.6509,-0.1878],Pentagon:[5.6535,-0.1845],Akuafo:[5.6490,-0.1936],Other:[5.6510,-0.1880]};
const paths={
 arrow:'<path d="M5 12h14m-5-5 5 5-5 5"/>',
 back:'<path d="M19 12H5m5-5-5 5 5 5"/>',
 shop:'<path d="M3 10h18M4 10v11h16V10M2 10l3-7h14l3 7M9 21v-7h6v7"/><path d="M2 10a3 3 0 0 0 5 2 3 3 0 0 0 5 0 3 3 0 0 0 5 0 3 3 0 0 0 5-2"/>',
 wallet:'<path d="M20 8V5H4a2 2 0 0 0 0 4h17v12H4a2 2 0 0 1-2-2V7m19 6h-6v4h6"/>',
 sound:'<path d="m11 4-6 5H2v6h3l6 5zM15 8a6 6 0 0 1 0 8m3-11a10 10 0 0 1 0 14"/>',
 shield:'<path d="m12 2 9 4v6c0 6-9 10-9 10S3 18 3 12V6z"/><path d="m8 12 3 3 5-6"/>',
 check:'<path d="m5 12 4 4L19 6"/>',
 phone:'<rect x="6" y="2" width="12" height="20" rx="3"/><path d="M11 18h2"/>',
 id:'<rect x="2" y="5" width="20" height="14" rx="3"/><circle cx="8" cy="11" r="2"/><path d="M5 16a3 3 0 0 1 6 0m3-7h5m-5 4h5"/>',
 face:'<path d="M3 8V3h5m8 0h5v5m0 8v5h-5M8 21H3v-5M8 10h.01M16 10h.01M8 15s4 4 8 0"/>',
 bank:'<path d="M3 10h18M5 10v9m5-9v9m4-9v9m5-9v9M2 21h20M3 6l9-4 9 4v2H3z"/>',
 pin:'<path d="M20 10c0 6-8 12-8 12S4 16 4 10a8 8 0 1 1 16 0"/><circle cx="12" cy="10" r="3"/>',
 edit:'<path d="m16 3 5 5L8 21H3v-5zM13 6l5 5"/>',
 sparkle:'<path d="m12 2 3 7 7 3-7 3-3 7-3-7-7-3 7-3z"/>',
 eye:'<path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12"/><circle cx="12" cy="12" r="3"/>',
 info:'<circle cx="12" cy="12" r="9"/><path d="M12 11v6m0-10h.01"/>'
};
const icon=name=>`<svg class="signup-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths[name]||paths.sparkle}</svg>`;
const button=(label,action,style='secondary',extra='')=>`<button type="button" class="signup-btn ${style}" data-action="signup-${action}" ${extra}>${label}</button>`;
const blank=()=>({phone:'',username:'',name:'',ownerName:'',businessType:'registered-business',registrationNumber:'',destinationMode:'bank',bankProvider:'GCB Bank',bankNumber:'',momoProvider:'MTN MoMo',momoNumber:'',shopName:'',area:'Night Market',customArea:'',category:'Food & drinks',managerName:'',lat:5.6509,lng:-0.1878,locationSource:'area'});
function normalisePhone(value){
 const digits=String(value||'').replace(/\D/g,'');
 if(/^0\d{9}$/.test(digits))return '+233'+digits.slice(1);
 if(/^233\d{9}$/.test(digits))return '+'+digits;
 if(/^\d{9}$/.test(digits))return '+233'+digits;
 return null;
}
function field(label,name,value='',extra='',help=''){
 return `<label class="signup-field"><span class="signup-label">${label}</span><input class="signup-input" name="${name}" value="${E(value)}" ${extra}>${help?`<span class="signup-help">${help}</span>`:''}</label>`;
}
function selection(label,name,value,options){
 return `<label class="signup-field"><span class="signup-label">${label}</span><select class="signup-select" name="${name}">${options.map(o=>{const val=Array.isArray(o)?o[0]:o,txt=Array.isArray(o)?o[1]:o;return `<option value="${E(val)}" ${value===val?'selected':''}>${E(txt)}</option>`}).join('')}</select></label>`;
}
export function createSignup(config={}){
 let password='',confirmation='',showPassword=false,showConfirmation=false,credentialsVerified=false;
 let attemptId=crypto.randomUUID(),submissionStarted=false,uncertainSubmission=false,pendingUsername='',pendingSubmission=null,sampleCredentials=null;
 let active=true,data=blank(),step='welcome',error='',notice='',phoneVerified=false,identity=false,face=false,consent=false,submitting=false,completed=null,privacy=false,locating=false,locationGeneration=0;
 try{const draft=JSON.parse(sessionStorage.getItem(DRAFT_KEY)||'null');if(draft&&draft.version===1&&draft.data){for(const name of Object.keys(blank()))if(name in draft.data)data[name]=draft.data[name];if(typeof draft.attemptId==='string'&&draft.attemptId)attemptId=draft.attemptId;submissionStarted=Boolean(draft.submissionStarted);uncertainSubmission=submissionStarted;pendingUsername=String(draft.pendingUsername||data.username||'')}}catch{}
 const stageOrder=['phone','credentials','business','verify','settlement','shop','review'];
 const stageLabels=['Your number','Account access','Your business','Owner checks','Settlement','First shop','Review'];
 const hasRegistration=()=>Boolean(config.hasRegistration?.());
 const currentIndex=()=>Math.max(0,stageOrder.indexOf(step==='otp'?'phone':step));
 function save(){try{const safeData=Object.fromEntries(Object.keys(blank()).map(name=>[name,data[name]]));sessionStorage.setItem(DRAFT_KEY,JSON.stringify({version:1,data:safeData,attemptId,submissionStarted,pendingUsername:submissionStarted?pendingUsername:''}));}catch{}}
 function redraw(){config.onRender?.();}
 function invalidateLocation(){locationGeneration++;locating=false}
 function go(target){invalidateLocation();step=target;error='';notice='';consent=false;save();redraw();}
 function setError(message){error=message;notice='';redraw();}
 function capture(form){
  if(!form)return;
  const p=Object.fromEntries(new FormData(form));
  const names=Object.keys(blank());
  for(const name of names)if(name in p&&!submissionStarted)data[name]=String(p[name]).trim();
  if('password' in p){if(password!==String(p.password))credentialsVerified=false;password=String(p.password)}
  if('confirmation' in p){if(confirmation!==String(p.confirmation))credentialsVerified=false;confirmation=String(p.confirmation)}
  save();
  return p;
 }
 function destination(){
  const mode=data.destinationMode==='momo',number=(mode?data.momoNumber:data.bankNumber).replace(/\D/g,'');
  return `${mode?data.momoProvider:data.bankProvider} · ••••${number.slice(-4)}`;
 }
 function back(element){
  capture(element?.closest('.signup-shell')?.querySelector('form'));
  if(step==='phone')go('welcome');
  else if(step==='otp')go('phone');
  else if(step==='credentials')go('otp');
  else if(step==='business')go('credentials');
  else if(step==='verify')go('business');
  else if(step==='settlement')go('verify');
  else if(step==='shop')go('settlement');
  else if(step==='review')go('shop');
 }
 function sample(){
  invalidateLocation();
  if(submissionStarted){setError('Finish the existing account request with @'+pendingUsername+'. Use Retry or Sign in instead of generating another login.');return}
  if(!sampleCredentials){const suffix=crypto.randomUUID().replaceAll('-','').slice(0,12);const bytes=crypto.getRandomValues(new Uint8Array(20));const secret=Array.from(bytes,value=>value.toString(16).padStart(2,'0')).join('');sampleCredentials={username:'sample.'+suffix,password:'Test'+secret+'9',suffix:suffix.slice(-4)}}
  if(data.username!==sampleCredentials.username||password!==sampleCredentials.password||confirmation!==sampleCredentials.password)credentialsVerified=false;
  password=sampleCredentials.password;confirmation=sampleCredentials.password;
  if(normalisePhone(data.phone)!=='+233245550100')phoneVerified=false;
  if(data.ownerName!=='Akua Sample'){identity=false;face=false}
  data={...data,phone:'24 555 0100',username:sampleCredentials.username,name:'Sample Campus Kitchen '+sampleCredentials.suffix,ownerName:'Akua Sample',businessType:'registered-business',registrationNumber:'DEMO-'+sampleCredentials.suffix.toUpperCase(),bankProvider:'GCB Bank',bankNumber:'113004567890',momoProvider:'MTN MoMo',momoNumber:'0245550100',shopName:'Sample Night Market',area:'Night Market',category:'Food & drinks',managerName:'Akua Sample',lat:5.6509,lng:-0.1878,locationSource:'area'};
  notice='Fictitious sample details added. A unique test username and password were generated for this signup. Use Show on Account access to review and save your login.';error='';save();redraw();
 }
 function header(title,description,kicker=''){
  return `<div class="signup-heading">${kicker?`<div class="signup-kicker">${kicker}</div>`:''}<h1 class="signup-title" id="signup-heading" tabindex="-1">${title}</h1><p class="signup-description">${description}</p></div>`;
 }
 function progress(){
  const ix=currentIndex();
  return `<div class="signup-progress" aria-label="Signup progress"><div class="signup-progress-label"><span>STEP ${ix+1} OF 7</span><span>${stageLabels[ix]}</span></div><div class="signup-progress-track"><div class="signup-progress-fill" style="width:${(ix+1)/7*100}%"></div></div></div>`;
 }
 function actions(label,{disabled=false,backButton=true}={}){
  return `<div class="signup-actions">${backButton?button(icon('back')+' Back','back','ghost',submitting?'disabled':''):''}<button class="signup-btn primary" type="submit" ${disabled?'disabled':''}>${label} ${icon('arrow')}</button></div>`;
 }
 function form(content,label,opts={}){
  return `<form data-form="signup" data-signup-step="${step}" aria-busy="${submitting}" novalidate>${content}${error?`<div class="signup-error" role="alert">${icon('info')}<span>${E(error)}</span></div>`:''}${notice?`<div class="signup-demo-note" role="status">${E(notice)}</div>`:''}${actions(label,opts)}</form>`;
 }
 function phoneScreen(){
  return header('Your number.<br>Your way in.','We’ll use this number for your merchant profile and access.')
   +form(`<label class="signup-field"><span class="signup-label">Mobile number</span><div class="signup-phone-field"><span class="signup-country">🇬🇭 <span>+233</span></span><input class="signup-input" name="phone" type="tel" inputmode="tel" autocomplete="tel-national" placeholder="24 000 0000" value="${E(data.phone)}" required autofocus maxlength="20"></div><span class="signup-help">A Ghana mobile number you control. Use sample details in this prototype.</span></label><div class="signup-demo-note">${icon('phone')}<span>No SMS will be sent. The next screen uses a demo verification code.</span></div>`,'Continue');
 }
 function otpScreen(){
  return header('A quick hello<br>to your phone.',`Enter the six-digit code for <strong>${E(normalisePhone(data.phone)||data.phone)}</strong>.`)
   +form(`<label class="signup-field"><span class="signup-label">Verification code</span><input class="signup-input signup-otp" name="otp" inputmode="numeric" type="text" pattern="[0-9]{6}" maxlength="6" autocomplete="one-time-code" placeholder="000000" required autofocus aria-describedby="signup-otp-help"><span class="signup-help" id="signup-otp-help">Demo code: <strong>123456</strong>. This prototype does not send text messages.</span></label><button class="signup-sample-link" type="button" data-action="signup-resend">Resend demo code</button>`,'Verify number');
 }
 function passwordRules(){
  const rules=[['At least 10 characters',password.length>=10],['At least one letter',/[A-Za-z]/.test(password)],['At least one number',/[0-9]/.test(password)]];
  const count=rules.filter(([,met])=>met).length;
  return `<div class="signup-password-meter" aria-hidden="true">${[0,1,2].map(i=>`<i class="${i<count?'met':''}"></i>`).join('')}</div><span class="signup-password-status" role="status" aria-live="polite">${count===3?'Ready to use':password?'Keep going — meet the requirements below.':'Use a unique test password.'}</span><ul class="signup-password-rules">${rules.map(([text,met])=>`<li class="${met?'met':''}">${text}</li>`).join('')}</ul>`;
 }
 function passwordField(label,name,value,visible,action,extra=''){
  return `<label class="signup-field"><span class="signup-label">${label}</span><div class="signup-password-wrap"><input class="signup-input" name="${name}" type="${visible?'text':'password'}" value="${E(value)}" autocomplete="new-password" minlength="10" maxlength="128" ${extra} required aria-describedby="${name==='password'?'signup-password-guide':'signup-password-match'}"><button type="button" class="signup-password-toggle" data-action="signup-${action}" aria-label="${visible?'Hide':'Show'} ${name==='confirmation'?'confirmed password':'password'}" aria-pressed="${visible}">${visible?'Hide':'Show'}</button></div></label>`;
 }
 function updatePasswordFeedback(formElement){
  const guide=formElement?.querySelector('[data-password-guide]');
  if(guide)guide.innerHTML=passwordRules();
  const match=formElement?.querySelector('[data-password-match]');
  if(match){match.textContent=confirmation?(password===confirmation?'Passwords match.':'Passwords do not match yet.'):'Enter the same password again.';match.classList.toggle('met',Boolean(confirmation&&password===confirmation))}
 }
 function credentialsScreen(){
  return header('Your own login.<br>Your business, protected.','Create the account you’ll use to manage your shops and team.')
   +form(`${field('Username','username',data.username,'required minlength="3" maxlength="24" autocomplete="username" autocapitalize="none" spellcheck="false" placeholder="e.g. akua.owner" autofocus','3–24 characters. Start with a letter; use letters, numbers, dots or underscores.')}${passwordField('Password','password',password,showPassword,'toggle-password')}<div class="signup-password-guide" id="signup-password-guide" data-password-guide>${passwordRules()}</div>${passwordField('Confirm password','confirmation',confirmation,showConfirmation,'toggle-confirmation')}<span class="signup-help signup-password-match ${confirmation&&password===confirmation?'met':''}" id="signup-password-match" data-password-match role="status" aria-live="polite">${confirmation?(password===confirmation?'Passwords match.':'Passwords do not match yet.'):'Enter the same password again.'}</span><p class="signup-credential-hint">Use a test password only. “Use sample details” creates a unique test login for this signup. Use Show to review and save it before continuing.</p>`,'Continue');
 }
 function businessScreen(){
  return header('Let’s meet<br>your business.','The name your customers know, and the person behind it.')
   +form(`${field('Business / trading name','name',data.name,'required maxlength="70" placeholder="e.g. Akua’s Campus Kitchen" autofocus')}${field('Owner’s full name','ownerName',data.ownerName,'required maxlength="70" autocomplete="name" placeholder="Your full name"')}${selection('Business type','businessType',data.businessType,[['registered-business','Registered business'],['sole-proprietor','Sole proprietor']])}${field('Registration reference (optional)','registrationNumber',data.registrationNumber,'maxlength="60" placeholder="Use a sample reference"','Live onboarding will request the documents applicable to your business.')}`,'Continue');
 }
 function verifyScreen(){
  return header('A little trust<br>goes a long way.','Verify the authorised owner before your business begins accepting payments.')
   +form(`<div class="signup-check-grid"><div class="signup-check-card ${identity?'done':''}"><span class="signup-check-icon">${icon('id')}</span><div><h3>Owner identity</h3><p>Sample Ghana Card check for ${E(data.ownerName||'the owner')}.</p><span class="signup-check-status">${identity?icon('check')+' Sample check complete':'Ready for a sample check'}</span></div>${button(identity?'Check complete':'Run sample ID check','verify-id',identity?'ghost small':'secondary small',identity?'disabled':'')}</div><div class="signup-check-card ${face?'done':''}"><span class="signup-check-icon">${icon('face')}</span><div><h3>Selfie & liveness</h3><p>A preview of the owner’s identity confirmation.</p><span class="signup-check-status">${face?icon('check')+' Sample check complete':'No camera or photo upload required'}</span></div>${button(face?'Check complete':'Try sample selfie check','verify-face',face?'ghost small':'secondary small',face?'disabled':'')}</div></div><div class="signup-verification-note">${icon('shield')}<span>These are explicit simulations. No Ghana Card record, face image or biometric information is collected or verified.</span></div>`,'Continue',{disabled:!identity||!face});
 }
 function settlementScreen(){
  const momo=data.destinationMode==='momo';
  return header('Where should<br>your proceeds go?','Link a business destination. The owner controls settlement from the shared merchant account.')
   +form(`<div class="signup-settlement-tabs" role="group" aria-label="Settlement method">${button(icon('bank')+' Bank account','settlement-bank','signup-settlement-tab '+(!momo?'active':''))}${button(icon('phone')+' Business MoMo','settlement-momo','signup-settlement-tab '+(momo?'active':''))}</div>${momo?selection('Business MoMo provider','momoProvider',data.momoProvider,['MTN MoMo','Telecel Cash','AT Money'])+field('Business MoMo number','momoNumber',data.momoNumber,'type="tel" inputmode="tel" maxlength="20" required placeholder="024 000 0000"'):selection('Bank','bankProvider',data.bankProvider,['GCB Bank','Fidelity Bank','Ecobank','Absa Bank','Stanbic Bank','Other business bank'])+field('Business account number','bankNumber',data.bankNumber,'inputmode="numeric" maxlength="24" required placeholder="Enter a sample account number"')}<div class="signup-name-match">${icon('shield')}<span><strong>${E(data.name||'Your business')}</strong><small>Business-name match is simulated in this prototype.</small></span></div><p class="signup-help">Live destinations will require verification. No bank or MoMo connection is made here.</p>`,'Continue');
 }
 function shopScreen(){
  const area=data.area==='Other'?data.customArea||'Your campus location':data.area;
  return header('Your first shop.<br>Ready for campus.','Give this location its own code, team and collection record.')
   +form(`${field('Shop name','shopName',data.shopName,'required maxlength="50" placeholder="e.g. Night Market shop" autofocus')}<div class="signup-form-grid">${selection('Campus area','area',data.area,['Night Market','Pentagon','Akuafo','Other'])}${selection('Business category','category',data.category,['Food & drinks','Provisions','Printing','Laundry','Other'])}</div>${data.area==='Other'?field('Campus landmark / area','customArea',data.customArea,'required maxlength="60" placeholder="Describe where students can find you"'):''}${field('Shop manager (optional)','managerName',data.managerName||data.ownerName,'maxlength="60" placeholder="You can invite a manager later"')}<div class="signup-map"><svg viewBox="0 0 420 124" aria-hidden="true"><rect width="420" height="124" fill="#edf1e6"/><path d="M-10 100 450 5M100-20 280 150M-20 25 450 110" stroke="#fff" stroke-width="13"/><path d="M-10 100 450 5M100-20 280 150M-20 25 450 110" stroke="#dce3d1" stroke-width="1"/><rect x="35" y="20" width="60" height="27" rx="5" fill="#dae4c8"/><rect x="318" y="75" width="66" height="32" rx="5" fill="#dfe7d0"/><circle cx="210" cy="58" r="24" fill="#d6f95b" opacity=".35"/><circle cx="210" cy="58" r="13" fill="#173e2a"/><circle cx="210" cy="58" r="4" fill="#d6f95b"/></svg><div class="signup-map-caption">${icon('pin')}<span>${E(area)}<small>${data.locationSource==='device'?'Position captured on this device':'Approximate demo position · illustrative map'}</small></span></div></div><div class="signup-location-controls">${button(icon('pin')+(locating?' Finding your location…':' Use my location'),'locate','ghost small',locating?'disabled':'')}<span class="signup-location-pill">${data.locationSource==='device'?'Device position saved':'Area pin selected'}</span></div>`,'Review business');
 }
 function reviewBlock(title,stage,rows){
  return `<section class="signup-review-block"><div class="signup-review-title"><h3>${title}</h3>${button('Edit '+icon('edit'),'edit','ghost small',`data-step="${stage}"`)}</div>${rows.map(([label,value])=>`<div class="signup-review-row"><span>${label}</span><strong>${E(value)}</strong></div>`).join('')}</section>`;
 }
 function reviewScreen(){
  return header('Everything in place.<br>Let’s make it yours.','One merchant account. Your first shop connected. A clear start at zero.')
   +form(`${reviewBlock('Account access','credentials',[['Username',data.username],['Password','Created · hidden']])}${reviewBlock('Business','business',[['Trading name',data.name],['Owner',data.ownerName],['Mobile',normalisePhone(data.phone)]])}${reviewBlock('Settlement','settlement',[['Destination',destination()],['Account name',data.name]])}${reviewBlock('First shop','shop',[['Shop',data.shopName],['Area',data.area==='Other'?data.customArea:data.area],['Category',data.category]])}<div class="signup-review-row signup-start-balance"><span>Starting merchant balance</span><strong>GH₵0.00</strong></div><label class="signup-checkbox"><input type="checkbox" name="consent" ${consent?'checked':''} required><span>I understand this is a prototype using sample details. It does not open a real financial account.</span></label>` ,submitting?'Creating your workspace…':'Create demo merchant account',{disabled:submitting});
 }
 function welcomeScreen(){
  const registered=hasRegistration();
  return header(registered?'Your business<br>is ready for you.':'Let’s get your<br>business on Lumo.',registered?`Continue to ${E(config.getRegisteredName?.()||'your merchant workspace')}, or explore the sample business.`:'A simpler way to receive student payments, run your shops and see your money clearly.','WELCOME TO LUMO MERCHANT')
   +(registered?`<div class="signup-resume">${icon('check')}<span>Your merchant signup is complete on this browser.</span></div>`:`<div class="signup-benefits"><div class="signup-benefit"><span class="signup-benefit-icon">${icon('wallet')}</span><span class="signup-benefit-copy"><strong>One account for your business</strong><small>Every shop’s collections, together.</small></span></div><div class="signup-benefit"><span class="signup-benefit-icon">${icon('sound')}</span><span class="signup-benefit-copy"><strong>Keep serving. Hear every payment.</strong><small>Spoken confirmation at the right counter.</small></span></div><div class="signup-benefit"><span class="signup-benefit-icon">${icon('shop')}</span><span class="signup-benefit-copy"><strong>Independent shops. Clear oversight.</strong><small>Your team runs the shop. You see the whole business.</small></span></div></div>`)
   +`<div class="signup-actions signup-welcome-actions">${button((registered?'Sign in to my business':'Create merchant account')+' '+icon('arrow'),registered?'login':'begin','primary full')}${button('Explore sample business','demo','secondary full')}</div>${registered?`<button class="signup-login-link" type="button" data-action="signup-begin">Create a different merchant account</button>`:''}${submissionStarted?pendingRequestNotice():''}${!registered?`<button class="signup-login-link" type="button" data-action="signup-login">Already have an account? <strong>Sign in</strong></button>`:''}<p class="signup-bottom-note">An interactive prototype. Use sample details to try the complete signup.</p>`;
 }
 function pendingRequestNotice(){
  return `<div class="signup-pending-request" role="status"><strong>An account request needs confirmation.</strong><p>Your request for <strong>@${E(pendingUsername||data.username)}</strong> may already have completed. Retry the same request or sign in with that username.</p><div>${button('Resume this request','resume-request','secondary small')}${button('Sign in instead','pending-login','ghost small')}</div></div>`;
 }
 function retryScreen(){
  return header('Let’s confirm<br>your account request.','Use the same login details. Retrying will not create a second business.','RESUME ACCOUNT REQUEST')+form(`${field('Original username','pendingUsername',pendingUsername||data.username,'readonly autocomplete="username"')}${passwordField('Original password','password',password,showPassword,'toggle-password',pendingSubmission?'readonly':'')}<div class="signup-pending-request"><p>Your business details and request reference are preserved. If creation already finished, you can sign in instead.</p>${button('Sign in with this username','pending-login','ghost small')}</div><label class="signup-checkbox"><input type="checkbox" name="consent" ${consent?'checked':''} required><span>I understand this is the same shared sandbox request using test details.</span></label>`,'Retry the same account request',{disabled:submitting});
 }
 function registrationPayload(){
  return {attemptId,signupAttemptId:attemptId,credentials:{username:(pendingUsername||data.username).trim(),password},name:data.name.trim(),ownerName:data.ownerName.trim(),phone:normalisePhone(data.phone),businessType:data.businessType,registrationNumber:data.registrationNumber.trim(),verification:{phone:true,identity:true,face:true},destination:destination(),shop:{name:data.shopName.trim(),area:data.area==='Other'?data.customArea.trim():data.area,category:data.category,manager:data.managerName.trim()||data.ownerName.trim(),lat:Number(data.lat),lng:Number(data.lng)}};
 }
 async function sendRegistration(){
  const wasUncertain=uncertainSubmission;submissionStarted=true;pendingUsername=pendingUsername||data.username.trim();pendingSubmission=pendingSubmission||registrationPayload();submitting=true;save();redraw();
  try{
   const result=await config.onComplete?.(pendingSubmission);
   if(!result?.business||!result?.shops?.length)throw new Error('Your account response could not be confirmed.');
   completed=result;step='success';password='';confirmation='';showPassword=false;showConfirmation=false;error='';notice='';submissionStarted=false;uncertainSubmission=false;pendingSubmission=null;pendingUsername='';attemptId=crypto.randomUUID();try{sessionStorage.removeItem(DRAFT_KEY)}catch{}
  }catch(e){
   const explicitCredentialFailure=!wasUncertain&&e.status===400&&(/username|password|credential/i.test(e.message||''));
   const uncertain=wasUncertain||!e.status||e.status>=500||[408,409,425].includes(e.status);
   if(uncertain&&!explicitCredentialFailure){uncertainSubmission=true;step='retry';error='We could not confirm the response. Your account may already exist. Retry this same request, or sign in with @'+pendingUsername+'.';notice='';save()}
   else{submissionStarted=false;uncertainSubmission=false;pendingSubmission=null;pendingUsername='';attemptId=crypto.randomUUID();if(/username|password|credential/i.test(e.message||'')){step='credentials';credentialsVerified=false}error=e.message||'Your account request could not be completed. Check the details and try again.';save()}
  }finally{submitting=false;redraw()}
 }
 function successScreen(){
  const b=completed?.business||{},s=completed?.shops?.[0]||{};
  return `<div class="signup-success-confetti" aria-hidden="true">${Array.from({length:10},(_,i)=>`<i style="--n:${i}"></i>`).join('')}</div><div class="signup-success-icon">${icon('check')}</div>${header('You’re in.<br>Let’s get business moving.',`${E(b.name||data.name)} has been created in the shared sandbox. Next, get your counter ready.`,'WELCOME TO YOUR BUSINESS')}<div class="signup-success-account"><span>Your merchant virtual account</span><strong>${E(b.accountNumber||'Your demo account')}</strong><small>One account · GH₵0.00 starting balance</small></div><div class="signup-success-next">${icon('shop')}<span><strong>${E(s.name||data.shopName)}</strong><small>${E(s.code||'LUM101')} · Complete the shop readiness checklist</small></span>${icon('check')}</div><div class="signup-actions">${button('Open my business '+icon('arrow'),'enter','primary full')}</div><p class="signup-bottom-note">${completed?.keyUnavailable||completed?.keyAvailable===false||completed?.recoveryKeyAvailable===false?'Your account request was recovered. Replace your private recovery key from Account & security after opening your business.':'Next: save your private recovery key, confirm your shop location, invite the team and test the receiving phone.'}</p>`;
 }
 function render(){
  const isWelcome=step==='welcome',success=step==='success';
  const content=isWelcome?welcomeScreen():success?successScreen():({phone:phoneScreen,otp:otpScreen,credentials:credentialsScreen,business:businessScreen,verify:verifyScreen,settlement:settlementScreen,shop:shopScreen,review:reviewScreen,retry:retryScreen})[step]();
  return `<div class="signup-shell ${isWelcome?'is-welcome':''} ${success?'is-success':''}"><aside class="signup-aside"><div class="signup-brand"><span class="signup-brand-mark">l</span><span><strong class="signup-brand-name">lumo</strong><small class="signup-brand-sub">MERCHANT</small></span></div><div class="signup-aside-copy"><div class="signup-aside-eyebrow">BUSINESS, WITH CLARITY</div><h2 class="signup-aside-title">One business.<br>Every shop.<br>In view<span>.</span></h2><p class="signup-aside-text">A simple counter for your team.<br>A clear view of every shop for you.</p></div><div class="signup-art" aria-hidden="true"><div class="signup-art-wallet"><div class="signup-art-label">${icon('wallet')}ONE MERCHANT ACCOUNT</div><div class="signup-art-total">GH₵0.00</div><span>Every shop, connected.</span></div><div class="signup-art-link"></div><div class="signup-art-shops">${['First shop','Next shop','And beyond'].map((n,i)=>`<div class="signup-art-shop" style="--shop-tone:${['#e8f3bb','#e8def1','#ecd9bf'][i]}">${icon('shop')}<span>${n}</span></div>`).join('')}</div></div><div class="signup-aside-footer"><span class="signup-trust-item">${icon('shield')}Your team sees only what they need.</span><span class="signup-trust-item">${icon('sound')}Clarity at every counter.</span></div></aside><main class="signup-main"><header class="signup-topbar"><div class="signup-mobile-brand"><strong>lumo</strong><span>MERCHANT</span></div>${!success?`<button type="button" class="signup-demo-link" data-action="signup-demo">Explore demo ${icon('arrow')}</button>`:''}</header><div class="signup-content"><section class="signup-card">${!isWelcome&&!success&&step!=='retry'?progress():''}${content}${!isWelcome&&!success&&step!=='review'&&step!=='retry'?`<button class="signup-sample-link" type="button" data-action="signup-sample">${icon('sparkle')} Use sample details</button>`:''}${isWelcome&&notice?`<p class="signup-demo-note">${E(notice)}</p>`:''}${isWelcome&&error?`<div class="signup-error" role="alert">${E(error)}</div>`:''}</section></div><footer class="signup-footer"><span>© ${new Date().getFullYear()} Lumo Merchant</span><button class="signup-demo-link" type="button" data-action="signup-privacy" aria-expanded="${privacy}">About this prototype</button>${privacy?`<div class="signup-privacy-body"><strong>Your business records are shared securely across devices.</strong><p>Phone verification, owner checks, account opening and settlement matching are simulated. No SMS, bank connection, document upload or biometric verification takes place. Registered business, staff and test-payment records are stored by this shared sandbox. Signup drafts and device preferences stay in this browser; passwords are never saved in the draft. A confirmed shop pin is stored for public campus discovery. Your student search location stays on-device. Use sample business details and a test password.</p></div>`:''}</footer></main></div>`;
 }
 function handleChange(element){
  if(submitting||!element?.name)return;
  if(element.name==='password'||element.name==='confirmation'){
   if(element.name==='password')password=element.value;else confirmation=element.value;
   credentialsVerified=false;updatePasswordFeedback(element.closest('form'));return;
  }
  if(element.name==='consent'){consent=element.checked;return}
  if(element.name==='otp')return;
  if(!Object.prototype.hasOwnProperty.call(data,element.name))return;
  if(submissionStarted)return;
  const value=element.value;
  if(element.name==='phone'&&data.phone!==value)phoneVerified=false;
  if(element.name==='username'&&data.username!==value)credentialsVerified=false;
  if(element.name==='ownerName'&&data.ownerName!==value){identity=false;face=false}
  data[element.name]=value;
  if(element.name==='customArea')invalidateLocation();
  if(element.name==='area'){
   invalidateLocation();
   const [lat,lng]=coordinates[value]||coordinates.Other;data.lat=lat;data.lng=lng;data.locationSource='area';save();redraw();return;
  }
  save();
 }
 function handleClick(action,element){
  if(submitting)return;
  const a=action.replace(/^signup-/,'');
  if(a==='begin'){if(submissionStarted){step='retry';error='';redraw();return}go('phone')}
  else if(a==='resume-request'){step='retry';error='';notice='';redraw()}
  else if(a==='pending-login'){const original=pendingUsername||data.username;password='';confirmation='';pendingSubmission=null;active=false;config.onLogin?.({username:original,notice:'Your account request may already have completed. Sign in with the same username and password.'})}
  else if(a==='back')back(element);
  else if(a==='toggle-password'||a==='toggle-confirmation'){
   capture(element?.closest('form'));if(a==='toggle-password')showPassword=!showPassword;else showConfirmation=!showConfirmation;redraw();
  }
  else if(a==='sample')sample();
  else if(a==='resend'){notice='Your demo verification code is 123456. No SMS has been sent.';error='';redraw()}
  else if(a==='verify-id'){identity=true;notice='Sample owner identity check complete.';error='';redraw()}
  else if(a==='verify-face'){face=true;notice='Sample selfie and liveness check complete.';error='';redraw()}
  else if(a==='settlement-bank'||a==='settlement-momo'){capture(element?.closest('.signup-shell')?.querySelector('form'));data.destinationMode=a==='settlement-momo'?'momo':'bank';error='';save();redraw()}
  else if(a==='edit'){capture(element?.closest('.signup-shell')?.querySelector('form'));go(element.dataset.step)}
  else if(a==='privacy'){privacy=!privacy;redraw()}
  else if(a==='demo'||a==='resume'||a==='login'||a==='enter'){
   if(a!=='enter'){password='';confirmation='';credentialsVerified=false;showPassword=false;showConfirmation=false}
   invalidateLocation();active=false;
   try{if(a==='demo')config.onDemo?.();else if(a==='resume'||a==='login'){if(!config.onLogin)throw new Error('Sign-in is not connected yet. Please try again shortly.');config.onLogin()}else config.onEnter?.(completed)}catch(e){active=true;setError(e.message||'Unable to open this workspace.')}
  }
  else if(a==='locate'){
   if(!active||step!=='shop'||locating)return;
   capture(element?.closest('.signup-shell')?.querySelector('form'));
   if(!navigator.geolocation){setError('Location is unavailable. Select the campus area instead.');return}
   const generation=++locationGeneration;
   const current=()=>generation===locationGeneration&&active&&step==='shop'&&!submissionStarted;
   locating=true;error='';redraw();
   const failure=()=>{if(!current())return;locating=false;error='We could not get your location. Select a campus area and continue with its demo pin.';redraw()};
   try{navigator.geolocation.getCurrentPosition(position=>{
    if(!current())return;const lat=position.coords?.latitude,lng=position.coords?.longitude;
    if(!Number.isFinite(lat)||!Number.isFinite(lng)||Math.abs(lat)>90||Math.abs(lng)>180){failure();return}
    locating=false;data.lat=lat;data.lng=lng;data.locationSource='device';notice='Shop position captured on this device. You can still change the area label.';save();redraw();
   },failure,{enableHighAccuracy:true,timeout:8000,maximumAge:60000})}catch{failure()}
  }
 }
 async function handleSubmit(formElement){
  if(submitting)return;
  const p=capture(formElement)||{};
  error='';notice='';
  if(step==='retry'){
   consent=p.consent==='on'||Boolean(formElement.elements.consent?.checked);if(!consent){setError('Confirm that you want to retry the same sandbox request.');return}
   if(!password){setError('Enter the password chosen for the original account request.');return}
   if(!pendingUsername){setError('The saved request has no username. Sign in or start a new request.');return}
   await sendRegistration();return;
  }
  if(step==='phone'){
   if(!normalisePhone(data.phone)){setError('Enter a valid Ghana mobile number, such as 24 555 0100.');return}
   phoneVerified=false;go('otp');
  }else if(step==='otp'){
   if(String(p.otp||'').trim()!=='123456'){setError('That code does not match. Use 123456 for this prototype.');return}
   phoneVerified=true;go('credentials');
  }else if(step==='credentials'){
   if(!phoneVerified){step='phone';setError('Verify your mobile number before creating your login.');return}
   if(!/^[A-Za-z][A-Za-z0-9._]{2,23}$/.test(data.username)){setError('Choose a username of 3–24 characters, starting with a letter. Use letters, numbers, dots or underscores.');return}
   if(password.length<10||password.length>128||!/[A-Za-z]/.test(password)||!/[0-9]/.test(password)){setError('Use a password with at least 10 characters, including a letter and a number.');return}
   if(password!==confirmation){setError('Your passwords do not match. Enter the same password in both fields.');return}
   credentialsVerified=true;go('business');
  }else if(step==='business'){
   if(!phoneVerified){step='phone';setError('Please verify your mobile number first.');return}
   if(!credentialsVerified){step='credentials';setError('Create and confirm your account login before continuing.');return}
   if(data.name.trim().length<2){setError('Enter your business or trading name.');return}
   if(data.ownerName.trim().length<2){setError('Enter the owner’s full name.');return}
   if(!data.managerName)data.managerName=data.ownerName;
   go('verify');
  }else if(step==='verify'){
   if(!identity||!face){setError('Complete both sample owner checks before continuing.');return}
   go('settlement');
  }else if(step==='settlement'){
   const momo=data.destinationMode==='momo',value=(momo?data.momoNumber:data.bankNumber).replace(/\D/g,'');
   if(momo&&!normalisePhone(data.momoNumber)){setError('Enter a valid Ghana business MoMo number.');return}
   if(!momo&&(value.length<6||value.length>20)){setError('Enter a sample business account number between 6 and 20 digits.');return}
   go('shop');
  }else if(step==='shop'){
   if(data.shopName.trim().length<2){setError('Give your first shop a name.');return}
   if(data.area==='Other'&&data.customArea.trim().length<2){setError('Enter a campus area or landmark for this shop.');return}
   if(!Number.isFinite(Number(data.lat))||!Number.isFinite(Number(data.lng))){setError('Choose a campus area to set the shop position.');return}
   go('review');
  }else if(step==='review'){
   consent=p.consent==='on'||Boolean(formElement.elements.consent?.checked);
   if(!consent){setError('Confirm that you understand this is a prototype before creating the demo account.');return}
   if(!phoneVerified||!credentialsVerified||!identity||!face){step=!phoneVerified?'phone':!credentialsVerified?'credentials':'verify';setError('Complete phone verification, account access and the owner checks before creating your workspace.');return}
   await sendRegistration();
  }
 }
 return {render,start(){invalidateLocation();active=true;step='welcome';error='';notice='';submitting=false;completed=null;phoneVerified=false;credentialsVerified=false;password='';confirmation='';showPassword=false;showConfirmation=false;identity=false;face=false;consent=false;redraw()},clearPendingFor(value){if(submissionStarted&&String(value||'').toLowerCase()===String(pendingUsername).toLowerCase()){submissionStarted=false;uncertainSubmission=false;pendingSubmission=null;pendingUsername='';attemptId=crypto.randomUUID();save()}},isActive:()=>active,setActive(value){if(!value)invalidateLocation();active=Boolean(value);if(!active){password='';confirmation='';pendingSubmission=null;credentialsVerified=false;showPassword=false;showConfirmation=false}},handleClick,handleSubmit,handleChange};
}

