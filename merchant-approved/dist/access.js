const E=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const paths={
 arrow:'<path d="M5 12h14m-5-5 5 5-5 5"/>',
 back:'<path d="M19 12H5m5-5-5 5 5 5"/>',
 shield:'<path d="m12 2 9 4v6c0 6-9 10-9 10S3 18 3 12V6z"/><path d="m8 12 3 3 5-6"/>',
 copy:'<rect x="8" y="8" width="13" height="13" rx="2"/><path d="M16 8V3H3v13h5"/>',
 key:'<circle cx="8" cy="8" r="5"/><path d="m12 12 9 9m-4-4 3-3m-7-1 3-3"/>',
 user:'<circle cx="12" cy="8" r="4"/><path d="M4 22v-2a8 8 0 0 1 16 0v2"/>',
 team:'<circle cx="9" cy="8" r="3"/><path d="M3 21v-3a6 6 0 0 1 12 0v3m1-16a3 3 0 0 1 0 6m2 4a5 5 0 0 1 3 4v2"/>',
 phone:'<rect x="6" y="2" width="12" height="20" rx="3"/><path d="M11 18h2"/>',
 check:'<path d="m5 12 4 4L19 6"/>',
 clock:'<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
 logout:'<path d="M9 4H3v16h6m5-13 5 5-5 5m-7-5h12"/>',
 eye:'<path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12"/><circle cx="12" cy="12" r="3"/>',
 info:'<circle cx="12" cy="12" r="9"/><path d="M12 11v6m0-10h.01"/>',
 mail:'<rect x="2" y="4" width="20" height="16" rx="3"/><path d="m3 6 9 7 9-7"/>',
 shop:'<path d="M3 10h18M4 10v11h16V10M2 10l3-7h14l3 7M9 21v-7h6v7"/>'
};
const icon=name=>`<svg class="access-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths[name]||paths.shield}</svg>`;
const button=(label,action,style='secondary',extra='')=>`<button type="button" class="access-btn ${style}" data-action="access-${action}" ${extra}>${label}</button>`;
const field=(label,name,value='',extra='',hint='')=>{
 const css=extra.match(/\bclass="([^"]+)"/)?.[1]||'';extra=extra.replace(/\bclass="[^"]+"/,'');
 return `<label class="access-field"><span class="access-label">${label}</span><input class="access-input ${css}" name="${name}" value="${E(value)}" ${extra}>${hint?`<span class="access-hint">${hint}</span>`:''}</label>`;
};
const when=value=>{if(!value)return '—';const d=new Date(value);return Number.isNaN(d.getTime())?'—':d.toLocaleString('en-GB',{day:'numeric',month:'short',hour:'2-digit',minute:'2-digit'})};
export function accessSessionState(value,now=Date.now()){
 if(value?.revokedAt||value?.revoked)return 'revoked';
 if(value?.expiresAt&&Date.parse(value.expiresAt)<=now)return 'expired';
 if(value?.active===false)return 'inactive';
 return 'active';
}
const roleLabel=role=>({owner:'Business owner',manager:'Shop manager',cashier:'Cashier'})[role]||'Team member';
const initial=name=>String(name||'L').split(/\s+/).map(x=>x[0]).slice(0,2).join('');
export function accessPasswordField(label,name='password',options={}){
 const autocomplete=options.autocomplete||'new-password';
 return `<label class="access-field"><span class="access-label">${label}</span><span class="access-password-wrap"><input class="access-input" name="${E(name)}" type="password" required autocomplete="${E(autocomplete)}" ${options.autofocus?'autofocus':''} maxlength="128" placeholder="${E(options.placeholder||'Enter a test password')}" ${options.strength?'data-access-strength="true" aria-describedby="access-password-guidance"':''}><button type="button" class="access-password-toggle" data-action="access-toggle-password" data-field="${E(name)}" aria-label="Show ${E(label.toLowerCase())}" aria-pressed="false">${icon('eye')}<span>Show</span></button></span>${options.hint?`<span class="access-hint">${options.hint}</span>`:''}</label>${options.strength?`<div class="access-strength" aria-live="polite"><div class="access-strength-bars">${[1,2,3,4].map(i=>`<span class="access-strength-bar" data-strength-bar="${i}"></span>`).join('')}</div><span class="access-strength-label" data-strength-label>Choose a test password</span></div><div class="access-requirements" id="access-password-guidance"><span class="access-requirement" data-password-rule="length">${icon('check')}10 characters or more</span><span class="access-requirement" data-password-rule="letter">${icon('check')}At least one letter</span><span class="access-requirement" data-password-rule="number">${icon('check')}At least one number</span></div>`:''}`;
}
export function validateAccessCredentials(username,password,confirmation){
 if(!/^[a-z0-9][a-z0-9._]{2,23}$/.test(String(username||'').trim().toLowerCase()))return 'Choose a username of 3–24 letters, numbers, dots or underscores, starting with a letter or number.';
 if(String(password||'').length<10||String(password).length>128||!/[A-Za-z]/.test(password)||!/\d/.test(password))return 'Use 10–128 characters, including a letter and a number.';
 if(confirmation!==undefined&&password!==confirmation)return 'The passwords do not match. Enter the same password twice.';
 return '';
}
function securityCard(i,title,text,action,label){
 return `<section class="access-security-card"><span class="access-security-card-icon">${icon(i)}</span><h3>${title}</h3><p>${text}</p>${button(label+' '+icon('arrow'),action,'secondary small')}</section>`;
}
export function securityPage({session,users=[],sessions=[],audit=[]}={}){
 if(!session)return `<div class="access-empty">${icon('shield')}<h2>Sign in to manage access.</h2>${button('Sign in','login','primary')}</div>`;
 const own=sessions.filter(s=>s.userId===session.userId&&accessSessionState(s)==='active'),activeUsers=users.filter(u=>u.active!==false&&u.status!=='suspended');
 return `<div class="access-security-page"><div class="page-heading"><div><div class="eyebrow">ACCOUNT & SECURITY</div><h1 class="page-title">Access you can account for.</h1><p class="subtitle">Your profile, password and signed-in sessions.</p></div><span class="access-role-badge">${E(roleLabel(session.role))}</span></div><section class="access-profile-summary"><span class="access-profile-avatar">${E(initial(session.name))}</span><span><strong>${E(session.name)}</strong><small>@${E(session.username)} · ${E(session.phone||'Phone not set')}</small></span>${button('View profile','profile','ghost small')}</section><div class="access-security-cards">${securityCard('key','Your password','Change your password with your current password.','password','Change password')}${securityCard('phone','Signed-in sessions',`${own.length} active session${own.length===1?'':'s'} for your account. Review current access and history.`, 'sessions','Review sessions')}${securityCard('phone','Your phone number','Replace your recovery number after confirming your password.','phone','Update phone')}${securityCard('logout','Sign out','End this session without changing your business records.','sign-out','Sign out')}</div><section class="access-recovery-settings"><span class="access-security-card-icon">${icon('key')}</span><div><h3>Your private recovery key</h3><p>If your key is lost or exposed, replace it after confirming your password. Your previous key will stop working.</p></div>${button('Replace recovery key','regenerate-key','secondary small')}</section>${session.role==='owner'?`<div class="access-owner-note">${icon('team')}<span><strong>${activeUsers.length} active account${activeUsers.length===1?'':'s'}</strong> · Use Team & access to invite people and manage their roles and assigned shops.</span></div>`:''}<section class="panel section-gap"><div class="panel-heading"><h2 class="panel-title">Recent account activity</h2></div><div class="access-audit-list">${audit.length?audit.slice(0,8).map(a=>`<div class="access-audit-row"><span>${icon(a.type?.includes('PASSWORD')?'key':a.type?.includes('SIGN')?'user':'shield')}</span><div><strong>${E(a.description||String(a.type||'Account activity').replaceAll('_',' ').toLowerCase())}</strong><small>${E(a.username||a.actorUsername||a.actorName||'Account')} · ${when(a.createdAt||a.at)}</small></div></div>`).join(''):'<div class="access-empty"><p>Your account activity will appear here.</p></div>'}</div></section><p class="notice">Use a test password in this prototype. Bank and SMS services are not connected.</p></div>`;
}
export function createAccess(config={}){
 const auth=config.auth||{};
 let active=false,view='login',phase='username',error='',notice='',busy=false,username='',remember=false,token='',invitation=null,challengeId='',recoveryCode='',maskedPhone='',securedCode=false,privacy=false,lastStage='';
 let phone='',recoveredUsernames=[],phoneChallenge=null,stepUp=null,stepUpResolve=null,invitationRequest=0,demoCode='123456',recoveryMethod='code',recoveryKey='',recoveryKeyReference='',recoveryIdentity='';
 const shared=()=>typeof config.shared==='function'?Boolean(config.shared()):typeof auth.isShared==='function'?Boolean(auth.isShared()):Boolean(auth.isShared);
 const challengeHint=()=>demoCode?`Prototype code: <strong>${E(demoCode)}</strong>. No SMS is sent. Valid for five minutes.`:'Enter the verification code for this request.';
 function setChallenge(value={}){challengeId=value.challengeId||'';maskedPhone=value.maskedPhone||'your linked phone';recoveryMethod=value.method||(shared()?'recovery-key':'code');demoCode=value.demoCode===undefined?(shared()?'':'123456'):String(value.demoCode||'')}
 function settleStepUp(value=null){const resolve=stepUpResolve;stepUpResolve=null;stepUp=null;resolve?.(value)}
 function business(){return config.business?.()||{}}
 function session(){try{return auth.getSession?.()||null}catch{return null}}
 function recoveryRequired(){const current=session();return Boolean(current&&(current.recoveryKeyPending||auth.getRecoveryKey?.()||auth.getRecoveryKeyNotice?.(current)||auth.getInvitationRecoveryNotice?.(current)))}
 function enforceRecoveryCheckpoint(){
  if(!recoveryRequired()){if(!session()){recoveryKey='';recoveryKeyReference='';recoveryIdentity='';if(['recovery-key','regenerate-key'].includes(view)){view='login';phase='username';busy=false;}}return false;}
  const current=session(),identity=[current?.businessId,current?.userId,current?.id].join(':'),key=String(auth.getRecoveryKey?.()||'');
  active=true;
  if(key&&(view!=='recovery-key'||identity!==recoveryIdentity)){settleStepUp();view='recovery-key';phase='key';recoveryKey=key;recoveryKeyReference=String(auth.getRecoveryKeyReference?.()||'');recoveryIdentity=identity;error='';busy=false;lastStage='';}
  else if(!key&&view!=='regenerate-key'){settleStepUp();view='regenerate-key';phase='username';error='';busy=false;lastStage='';notice=auth.getRecoveryKeyNotice?.(session())||auth.getInvitationRecoveryNotice?.(session())||'Save your private recovery key before opening the business. Confirm your password to create a replacement.';}
  return true;
 }
 function redraw(){config.onRender?.();focusStage()}
 function focusStage(){const stage=view+':'+phase;if(stage===lastStage)return;lastStage=stage;requestAnimationFrame(()=>{const target=document.querySelector('.access-shell [autofocus]')||document.querySelector('#access-heading');target?.focus({preventScroll:true});window.scrollTo(0,0)})}
 function fail(message){busy=false;error=message||'Something went wrong. Please try again.';redraw()}
 function info(message){notice=message;error='';redraw()}
 function show(next='login',params={}){
  if(recoveryRequired()&&!['recovery-key','regenerate-key'].includes(next)){enforceRecoveryCheckpoint();redraw();return}
  if(next!=='step-up')settleStepUp();invitationRequest++;
  active=true;view=next==='accept-invite'?'invite':next;phase=view==='secure'?'code':'username';error='';notice=String(params.notice||'');busy=false;lastStage='';
  if(params.username!==undefined)username=String(params.username);
  if(view==='invite'){
   const pending=auth.getPendingInvitation?.();if(params.username===undefined)username=pending?.username||'';
   token=String(params.token||pending?.token||'');invitation=null;invitationRequest++;
   if(pending&&token&&pending.token!==token){phase='pending-other';busy=false}
   else if(token)void readInvitation();
  }
  if(view==='secure'){securedCode=false;recoveryCode='';const pending=auth.getPendingLegacyImport?.();if(pending?.targetBusinessId&&session()?.businessId===pending.targetBusinessId){view='resume-import';phase='password'}}
  if(view==='recovery'){challengeId=params.challengeId||'';maskedPhone=params.maskedPhone||'';phase=challengeId?'code':'username';recoveryCode=''}
  if(view==='username-recovery'){phase='phone';recoveredUsernames=[];challengeId='';phone=''}
  if(view==='phone'){phase='details';phoneChallenge=null;phone=''}
  if(view==='recovery-key'){const current=session();recoveryIdentity=[current?.businessId,current?.userId,current?.id].join(':');recoveryKey=String(params.recoveryKey||auth.getRecoveryKey?.()||'');recoveryKeyReference=String(params.recoveryKeyReference||auth.getRecoveryKeyReference?.()||'');phase='key'}
  redraw();
 }
 function hide(){if(enforceRecoveryCheckpoint()){redraw();return}settleStepUp();active=false;error='';notice='';busy=false;recoveryCode='';redraw()}
 function backToApp(){if(enforceRecoveryCheckpoint()){redraw();return}settleStepUp();active=false;error='';notice='';busy=false;if(config.onBack)config.onBack();else redraw()}
 async function finishInvitationAccess(value){
  await authenticated(value?.session||value);
  const message=auth.getRecoveryKeyNotice?.(session())||auth.getInvitationRecoveryNotice?.(session())||((value?.keyUnavailable||value?.recoveryKeyAvailable===false)&&session()?'Your invitation request was recovered. Confirm your password to replace the private recovery key, then save the new key.':'');
  if(message&&!auth.getRecoveryKey?.())show('regenerate-key',{notice:message});
 }
 async function authenticated(value){
  const current=value?.userId?value:session();
  if(!current){show('login');notice='Your account is ready. Sign in with your username and password.';redraw();return}
  active=false;busy=false;error='';notice='';
  try{await config.onAuthenticated?.(current);redraw()}catch(e){active=true;view='login';fail(e.message)}
 }
 function heading(title,description,kicker='YOUR LUMO ACCOUNT'){
  return `<div class="access-heading"><div class="access-kicker">${kicker}</div><h1 class="access-title" id="access-heading" tabindex="-1">${title}</h1><p class="access-description">${description}</p></div>`;
 }
 function form(content,label,{back=null,disabled=false}={}){
  return `<form data-form="access" data-access-view="${view}" data-access-phase="${phase}" novalidate>${content}${error?`<div class="access-error" role="alert">${icon('info')}<span>${E(error)}</span></div>`:''}${notice?`<div class="access-notice" role="status">${E(notice)}</div>`:''}<div class="access-actions">${back?button(icon('back')+' '+back.label,back.action,'ghost'):''}<button class="access-btn primary ${back?'':'full'}" type="submit" ${busy||disabled?'disabled':''}>${busy?'Please wait…':label+' '+icon('arrow')}</button></div></form>`;
 }
 function usernameField(value=username,label='Username'){return field(label,'username',value,'required autocomplete="username" autocapitalize="none" spellcheck="false" maxlength="24" autofocus placeholder="Your username"')}
 function newCredentialsContent(){
  return usernameField(username,'Choose a username')+`<p class="access-hint">Start with a letter or number. Use 3–24 letters, numbers, dots or underscores. Your team signs in with individual usernames.</p>`+accessPasswordField('Create password','newPassword',{strength:true,autocomplete:'new-password'})+accessPasswordField('Confirm password','confirmPassword',{autocomplete:'new-password',placeholder:'Enter the same password again'});
 }
 function loginScreen(){
  const existing=config.hasRegistration?.(),b=business(),legacy=Boolean(auth.canMigrateLegacyBusiness?.(b)),pending=auth.getPendingLegacyImport?.();
  return heading('Welcome back.<br>Your business is waiting.','Sign in to your own workspace with the access your owner has assigned.')+
   form(usernameField()+accessPasswordField('Password','password',{autocomplete:'current-password',placeholder:'Your test password'})+`<div class="access-inline-row"><label class="access-checkbox"><input type="checkbox" name="remember" ${remember?'checked':''}><span>Keep me signed in</span></label><span class="access-recovery-links"><button type="button" class="access-link" data-action="access-username-recovery">Forgot username?</button><button type="button" class="access-link" data-action="access-recovery">Forgot password?</button></span></div>`,'Sign in')+
   `<div class="access-divider"><span>New to Lumo Merchant?</span></div><div class="access-form-footer">${legacy?button(pending?.targetBusinessId?'Continue saved prototype import':'Import a saved prototype','secure','secondary full'):''}${button(existing?'Create a different merchant account':'Create a merchant account','signup','secondary full')}${button('I have a staff invitation','invite','ghost full')}</div>`;
 }
 function recoveryScreen(){
  if(phase==='username')return heading('Let’s get you<br>back in.','Enter your username to start password recovery.')+form(usernameField()+`<p class="access-hint">${shared()?'You will need the private recovery key saved when your account was created.':'Use the phone linked to your local sample account to complete recovery.'} This prototype does not send SMS.</p>`,'Continue',{back:{label:'Sign in',action:'login'}});
  if(phase==='code')return heading('Check your<br>recovery code.',`Verify this request for <strong>${E(maskedPhone||'your linked phone')}</strong>.`)+form(field('Recovery code','code','','required type="text" inputmode="numeric" maxlength="6" pattern="[0-9]{6}" autocomplete="one-time-code" class="access-otp" autofocus',challengeHint())+`<div class="access-inline-row"><button type="button" class="access-link" data-action="access-resend-recovery">Get a new demo code</button><button type="button" class="access-link" data-action="access-recovery">Start again</button></div>`,'Continue',{back:{label:'Back',action:'recovery'}});
  if(phase==='password')return heading('A fresh password.<br>A clear start.','Choose a new test password for @'+E(username)+'.')+form((recoveryMethod==='recovery-key'?field('Saved recovery key','recoveryKey','','required type="password" autocomplete="off" spellcheck="false" placeholder="Your private recovery key" autofocus','The key was shown once when your account was created. Lumo cannot recover it for you.'): '')+accessPasswordField('New password','newPassword',{strength:true,autofocus:true})+accessPasswordField('Confirm new password','confirmPassword',{placeholder:'Enter the same password again'})+`<p class="access-hint">Resetting your password signs out existing sessions for this account.</p>`,'Reset password',{back:{label:'Start again',action:'recovery'}});
  return `<div class="access-success-icon">${icon('check')}</div>`+heading('You’re ready<br>to sign in.','Your password has been reset. Sign in again to continue.')+button('Back to sign in '+icon('arrow'),'login','primary full');
 }
 function clearResolvedInvitation(){const pending=auth.getPendingInvitation?.();if(pending?.token===token)auth.clearPendingInvitation?.(pending.username)}
 async function readInvitation(){
  const request=++invitationRequest;busy=true;phase='loading';redraw();
  try{
   const value=await auth.getInvitation?.(token);if(request!==invitationRequest||view!=='invite')return;invitation=value||null;
   if(!invitation){clearResolvedInvitation();error='This invitation could not be found. Check the code or ask the owner for a new invitation.';phase='token';return}
   const expired=invitation.expiresAt&&new Date(invitation.expiresAt).getTime()<=Date.now();
   const pending=auth.getPendingInvitation?.(),resumable=pending?.token===token;
   if(invitation.status==='accepted'&&(invitation.retryAllowed===true||resumable)){
    phase='resume';if(resumable)username=pending.username;error='';notice='This invitation has already created an account. Use the original username and password to finish, or sign in with them.';return;
   }
   if(expired||['revoked','accepted','expired','cancelled'].includes(invitation.status)){
    if(invitation.status!=='accepted')clearResolvedInvitation();
    phase='unavailable';error=invitation.status==='accepted'?'This invitation has already been accepted. Sign in with the account you created.':'This invitation has expired or been revoked. Ask the owner to send a new one.';return;
   }
   phase=resumable?'resume':'credentials';if(resumable){username=pending.username;notice='The result of this invitation request is unconfirmed. Retry the same account request using the original password, or sign in.'}error='';
  }catch(e){if(request!==invitationRequest)return;if(e.status===404||['INVITATION_INVALID','INVITATION_NOT_FOUND','INVITATION_REVOKED','INVITATION_EXPIRED'].includes(e.code))clearResolvedInvitation();invitation=null;phase='token';error=e.message||'Unable to read this invitation.'}finally{if(request===invitationRequest){busy=false;redraw()}}
 }
 function invitationScreen(){
  const pending=auth.getPendingInvitation?.();
  if(phase==='pending-other')return heading('Finish your first<br>invitation request.','The result for <strong>@'+E(pending?.username||username)+'</strong> must be checked before accepting another invitation.')+`<div class="access-notice">${icon('info')}<span>Retry the original invitation or sign in with its chosen username and password. Your password has not been saved in this browser.</span></div><div class="access-actions">${button('Resume original request','resume-invitation','secondary')}${button('Sign in with this account','invitation-sign-in','primary')}</div>`;
  if(phase==='loading')return heading('Checking your<br>invitation.','Your role and assigned shops are being checked.')+'<div class="access-notice" role="status">Please wait…</div>';
  if(phase==='unavailable')return heading('Check this invitation.','Sign in if your account was created, or ask the owner for help with changed access.')+`<div class="access-error" role="alert">${icon('info')}<span>${E(error)}</span></div><div class="access-actions">${button('Enter another code','invite','secondary')}${button('Sign in','invitation-sign-in','primary')}</div>`;
  if(phase==='resume')return heading('Finish your<br>invitation request.','Use the username and password chosen for this invitation. Retrying retrieves the same account.')+
   form(field('Original username','username',pending?.token===token?pending.username:username,'required autocomplete="username" autocapitalize="none" spellcheck="false" maxlength="24" autofocus '+(pending?.token===token?'readonly':''))+accessPasswordField('Original password','password',{autocomplete:'current-password',placeholder:'The password you chose for this invitation'})+`<p class="access-hint">A recovered request does not reveal its old private recovery key. After sign-in, you can replace the key using your password.</p>`,'Retry the same invitation',{back:{label:'Sign in instead',action:'invitation-sign-in'}});
  if(phase==='token'||!invitation)return heading('Your place<br>on the team.','Paste the invitation code shared by the business owner.')+form(field('Invitation code or link','token',token,'required autocomplete="off" spellcheck="false" autofocus placeholder="Paste your invitation code"')+`<p class="access-hint">${shared()?'Open the invitation link on your own phone.':'Invitations in the local sample work in the same browser.'} The owner can copy the invitation link from Team & access.</p>`,'Find invitation',{back:{label:'Sign in',action:'login'}});
  const name=invitation.name||'Team member',role=roleLabel(invitation.role),shops=invitation.shopNames||invitation.shopIds||[];
  return heading('Welcome to<br>the team, '+E(name.split(' ')[0])+'.','Create your own sign-in. Your access is limited to the role and shops assigned by the owner.')+
   `<div class="access-invite-card"><span class="access-role-badge">${E(role)}</span><strong>${E(name)}</strong><small>${shops.length} assigned shop${shops.length===1?'':'s'} · Invitation expires ${when(invitation.expiresAt)}</small></div>`+
   form(newCredentialsContent()+`<p class="access-hint">Use a test password you do not use elsewhere.</p>`,'Accept invitation & sign in',{back:{label:'Sign in',action:'login'}});
 }
 function secureScreen(){
  const b=business(),pending=auth.getPendingLegacyImport?.();
  if(!auth.canMigrateLegacyBusiness?.(b))return heading('This business<br>is already shared.','Use its existing username and password to sign in. Import is only for an older browser-only prototype.')+button('Back to sign in','login','primary full');
  if(pending?.targetBusinessId&&session()?.businessId===pending.targetBusinessId)return resumeImportScreen();
  if(securedCode===false)return heading('Bring your saved<br>prototype with you.',`Import <strong>${E(pending?.businessName||b.name||'your saved business')}</strong> into a new shared sandbox account.`,'SAVED PROTOTYPE IMPORT')+
   form(`<div class="access-notice">${icon('shield')}<span>This uploads the saved business, shop and test-payment records from this browser. Your original browser copy is preserved until import succeeds.</span></div><p class="access-hint">Import creates a new shared account with new account and shop identifiers. It does not reconnect an existing shared merchant account.</p><label class="access-checkbox access-import-consent"><input type="checkbox" name="importConsent" required><span>I want to upload these saved prototype records into a new shared sandbox account.</span></label>`,'Continue with import',{back:{label:'Sign in instead',action:'login'}});
  return heading('Choose access<br>for your import.',`Create a username and password for <strong>${E(pending?.businessName||b.name||'your saved business')}</strong>.`,'IMPORT OWNER ACCOUNT')+
   form(newCredentialsContent()+`<p class="access-hint">Use a test password. ${pending?.username?'Retry with @'+E(pending.username)+' to finish the same import.':'Your saved history will be copied after the shared owner account is created.'}</p>`,'Create account and import',{back:{label:'Back',action:'secure'}});
 }
 function resumeImportScreen(){
  const pending=auth.getPendingLegacyImport?.(),s=session();
  if(!pending||!s||s.role!=='owner'||pending.targetBusinessId!==s.businessId)return heading('Sign in to finish<br>your saved import.','Use the owner account created for this import. Your preserved browser copy has not been removed.')+button('Sign in','login','primary full');
  return heading('Finish bringing<br>your history over.',`Your shared account is ready. Import the saved records for <strong>${E(pending.businessName||'your prototype')}</strong>.`,'RESUME SAVED IMPORT')+form(accessPasswordField('Current password','currentPassword',{autocomplete:'current-password',autofocus:true,placeholder:'The password chosen for this import'})+`<div class="access-notice">${icon('shield')}<span>The saved browser copy remains available until the import succeeds. Retrying this same import will not copy its records twice.</span></div><label class="access-checkbox access-import-consent"><input type="checkbox" name="importConsent" required><span>I confirm that these saved prototype records should be uploaded into this shared sandbox account.</span></label>`,'Finish saved import',{back:{label:'Back to business',action:'back'}});
 }
 function passwordScreen(){
  if(phase==='success')return `<div class="access-success-icon">${icon('check')}</div>`+heading('Password updated.','Your other signed-in sessions have been revoked. This session stays open.')+button('Back to my account '+icon('arrow'),'back','primary full');
  return heading('Your password.<br>Your control.','Confirm your current password, then choose a new one.')+
   form(accessPasswordField('Current password','currentPassword',{autocomplete:'current-password',autofocus:true,placeholder:'Your current test password'})+accessPasswordField('New password','newPassword',{strength:true})+accessPasswordField('Confirm new password','confirmPassword',{placeholder:'Enter the same password again'})+`<p class="access-hint">Changing your password ends other sessions for this account.</p>`,'Update password',{back:{label:'My account',action:'back'}});
 }
 function profileScreen(){
  const s=session();if(!s)return loginScreen();
  const rows=[['Username','@'+s.username],['Role',roleLabel(s.role)],['Phone',s.phone||'Not set'],['Assigned shops',s.role==='owner'?'All business shops':String(s.shopIds?.length||0)]];
  return `<div class="access-profile-avatar">${E(initial(s.name))}</div>`+heading(E(s.name),'Your individual merchant account. Access follows your assigned role.')+
   `<div class="access-summary">${rows.map(([k,v])=>`<div class="access-summary-row"><span>${k}</span><strong>${E(v)}</strong></div>`).join('')}</div>`+
   (s.role==='owner'?form(field('Display name','name',s.name,'required maxlength="70" autocomplete="name"'),'Save profile',{back:{label:'Back',action:'back'}}):`<p class="access-hint">Ask the business owner to update your name, role or shop assignment.</p><div class="access-actions">${button('Back','back','secondary')}${button('Change password','password','primary')}</div>`) + `<div class="access-profile-tools">${button(icon('phone')+' Update account phone','phone','secondary full')}</div>`;
 }
 function sessionsScreen(){
  const s=session();if(!s)return loginScreen();
  let list=[];try{list=(auth.listSessions?.(s.businessId,s)||[]).filter(x=>x.userId===s.userId)}catch(e){error=e.message}
  const activeCount=list.filter(x=>accessSessionState(x)==='active').length;
  return heading('Know where<br>you’re signed in.',`${activeCount} active session${activeCount===1?'':'s'}. End current access or review your session history.`)+
   `<div class="access-session-list">${list.length?list.map(x=>{const status=accessSessionState(x),isCurrent=status==='active'&&(x.id===s.id||x.current);return `<article class="access-session-card ${status!=='active'?'is-ended':''}"><div class="access-session-top"><span>${icon('phone')}<strong>${E(x.deviceLabel||x.deviceName||'Browser session')}</strong></span><span class="access-status-badge ${status!=='active'?'ended':''}">${isCurrent?'This session':status==='active'?'Active':status[0].toUpperCase()+status.slice(1)}</span></div><div class="access-session-meta"><span>Started ${when(x.createdAt)}</span><span>Last active ${when(x.lastSeen||x.createdAt)}</span><span>${status==='revoked'?'Ended '+when(x.revokedAt):'Expires '+when(x.expiresAt)}</span>${x.revokeReason?`<span>${E(x.revokeReason)}</span>`:''}</div>${status==='active'?button(isCurrent?'Sign out here':'Revoke session','revoke-session',isCurrent?'ghost small':'secondary small',`data-id="${E(x.id)}"`):'<p class="access-session-ended">This session cannot access your account.</p>'}</article>`}).join(''):'<div class="access-empty"><p>No session history yet.</p></div>'}</div>`+
   (error?`<div class="access-error" role="alert">${E(error)}</div>`:'')+button('Back to my account','back','secondary full');
 }
 function usernameRecoveryScreen(){
  if(phase==='phone')return heading('Your username.<br>Within reach.','Use your registered phone number and private recovery key to find your sign-in.')+form(field('Registered mobile number','phone',phone,'required type="tel" inputmode="tel" autocomplete="tel" maxlength="22" autofocus placeholder="024 000 0000"')+field('Saved recovery key','recoveryKey','','required type="password" autocomplete="off" spellcheck="false" placeholder="Your private recovery key"')+'<p class="access-hint">A phone number alone never reveals an account. No SMS is sent. Keep your recovery key private.</p>','Find my username',{back:{label:'Sign in',action:'login'}});
  return heading('Your sign-in<br>details.',recoveredUsernames.length?'Use your username and password to sign in.':'We could not find an available account for those recovery details.')+`<div class="access-recovered-users">${recoveredUsernames.map(value=>{const name=typeof value==='string'?value:value.username;return `<div><strong>@${E(name)}</strong>${button('Use this username','use-username','secondary small',`data-username="${E(name)}"`)}</div>`}).join('')||'<p>Check the registered number and recovery key, or contact your business owner.</p>'}</div>`+button('Back to sign in','login','secondary full');
 }
 function phoneScreen(){
  const s=session();if(!s)return loginScreen();
  if(phase==='success')return `<div class="access-success-icon">${icon('check')}</div>`+heading('Account phone<br>updated.','Your account, shops and transaction history stay in place.')+'<p class="access-hint">This change is authorised with your password. No carrier or SMS verification has taken place.</p>'+button('Back to my account','back','primary full');
  return heading('A new number.<br>The same account.','Confirm your current password before replacing your account phone number.')+form(field('Current account phone','oldPhone',s.phone||'Not set','readonly')+field('New mobile number','newPhone',phone,'required type="tel" inputmode="tel" autocomplete="tel" maxlength="22" autofocus placeholder="024 000 0000"')+accessPasswordField('Current password','currentPassword',{autocomplete:'current-password',placeholder:'Your current test password'})+'<p class="access-hint">No SMS service is connected. Updating the number does not verify ownership of the SIM. Your private recovery key remains necessary for account recovery.</p>','Update account phone',{back:{label:'My account',action:'back'}});
 }
 function regenerateKeyScreen(){
  const s=session();if(!s)return loginScreen();
  return heading('A new way<br>back in.','Confirm your password to replace your private recovery key.','REPLACE RECOVERY KEY')+form(accessPasswordField('Current password','currentPassword',{autocomplete:'current-password',autofocus:true,placeholder:'Your current test password'})+`<div class="access-notice">${icon('shield')}<span>Your existing recovery key will stop working immediately. Save the new key before continuing.</span></div>`,'Generate a new recovery key',recoveryRequired()?{}:{back:{label:'My account',action:'back'}});
 }
 function recoveryKeyScreen(){
  return heading('Keep your way<br>back in.','Save this private recovery key somewhere safe before continuing.','YOUR RECOVERY KEY')+
   form(`<div class="access-recovery-key-box">${field('Private recovery key','savedRecoveryKey',recoveryKey,'type="password" readonly autocomplete="off" spellcheck="false"')}<div class="access-key-actions">${button(icon('copy')+' Copy recovery key','copy-recovery-key','secondary full')}${button('Show key','toggle-saved-key','ghost small')}</div></div><div class="access-notice">${icon('shield')}<span>This key is shown once. It can recover your account and must not be shared with shop staff or support agents.</span></div><p class="access-hint">If you lose both your password and this key, the prototype cannot restore access. No SMS recovery service is connected.</p><label class="access-checkbox access-key-saved"><input type="checkbox" name="keySaved" required><span>I have saved my recovery key in a safe place.</span></label>`,'I saved my recovery key');
 }
 function stepUpScreen(){
  const s=session();if(!s)return loginScreen();
  return heading(E(stepUp?.title||'Confirm it’s you.'),E(stepUp?.description||'Confirm your current password to continue with this owner action.'),'OWNER CONFIRMATION')+form(accessPasswordField('Current password','currentPassword',{autocomplete:'current-password',autofocus:true,placeholder:'Your current test password'})+'<div class="access-notice">'+icon('shield')+'<span>This confirmation applies only to the action you are completing.</span></div>','Confirm and continue',{back:{label:'Cancel',action:'cancel-step-up'}});
 }
 function requestStepUp(options={}){
  if(enforceRecoveryCheckpoint()){redraw();return Promise.reject(new Error('Save your private recovery key before confirming business actions.'))}
  if(session()?.role!=='owner'&&!(options.purpose==='refund'&&session()?.role==='manager'))return Promise.reject(new Error('Sign in as the business owner to confirm this action.'));
  settleStepUp();stepUp={purpose:String(options.purpose||'owner-action'),title:options.title,description:options.description};
  return new Promise(resolve=>{stepUpResolve=resolve;active=true;view='step-up';phase='password';error='';notice='';busy=false;lastStage='';redraw()});
 }
 function render(){
  enforceRecoveryCheckpoint();
  const content=({login:loginScreen,recovery:recoveryScreen,invite:invitationScreen,secure:secureScreen,password:passwordScreen,profile:profileScreen,sessions:sessionsScreen,'username-recovery':usernameRecoveryScreen,phone:phoneScreen,'step-up':stepUpScreen,'recovery-key':recoveryKeyScreen,'regenerate-key':regenerateKeyScreen,'resume-import':resumeImportScreen})[view]?.()||loginScreen();
  const signedIn=Boolean(session()),lockedViews=['password','profile','sessions','phone','step-up','regenerate-key','resume-import'];
  return `<div class="access-shell" data-access-stage="${E(view+':'+phase)}"><aside class="access-aside"><div class="access-brand"><span class="access-brand-mark">l</span><span><strong class="access-brand-word">lumo</strong><small>MERCHANT</small></span></div><div class="access-aside-copy"><div class="access-kicker">YOUR BUSINESS, IN GOOD HANDS</div><h2 class="access-aside-title">Your account.<br>Your team.<br>Your control<span>.</span></h2><p class="access-aside-subtitle">One sign-in for each person.<br>The right access for every shop.</p></div><div class="access-art" aria-hidden="true"><div class="access-art-shield">${icon('shield')}</div><div class="access-art-card"><span class="access-art-label">${icon('user')}INDIVIDUAL ACCOUNT</span><strong class="access-art-value">@your.username</strong><small>Access that follows your role.</small></div></div><div class="access-aside-note">${icon('shield')}Your business records stay in place when you sign out.</div></aside><main class="access-main"><header class="access-topbar"><span class="access-mobile-brand"><strong>lumo</strong><small>MERCHANT</small></span>${recoveryRequired()?button('Sign out','sign-out','ghost small'):view==='recovery-key'?'<span class="access-protected-label">Save before continuing</span>':signedIn&&lockedViews.includes(view)?button(icon('back')+' Back to business','back','ghost small'):button('Explore sample business '+icon('arrow'),'demo','ghost small')}</header><div class="access-content"><section class="access-card">${content}</section></div><footer class="access-footer"><span>© ${new Date().getFullYear()} Lumo Merchant</span><button type="button" class="access-link" data-action="access-privacy" aria-expanded="${privacy}">About account access</button>${privacy?`<p class="access-footer-note">${shared()?'This shared prototype stores account access on this site so authorised people can sign in on separate devices.':'This local sample stores account access in this browser.'} Use a test password. Bank, identity verification and SMS providers are not connected. Demo recovery is explicitly labelled when a code is shown.</p>`:''}</footer></main></div>`;
 }
 async function handleSubmit(formElement){
  if(busy)return;
  const p=Object.fromEntries(new FormData(formElement));error='';notice='';
  const usernameValue=String(p.username??username).trim();
  if(p.username!==undefined)username=usernameValue;
  const current=session();
  try{
   if(view==='login'){
    if(!usernameValue||!p.password){fail('Enter your username and password.');return}
    busy=true;remember=p.remember==='on';redraw();
    const result=await auth.signIn(usernameValue,p.password,{remember});
    await finishInvitationAccess(result);return;
   }
   if(view==='recovery'){
    if(phase==='username'){
     if(!usernameValue){fail('Enter the username for your account.');return}
     busy=true;redraw();const challenge=await auth.beginRecovery(usernameValue);setChallenge(challenge);phase=recoveryMethod==='recovery-key'?'password':'code';busy=false;redraw();return;
    }
    if(phase==='code'){
     if(!/^\d{6}$/.test(String(p.code||'').trim())){fail('Enter the six-digit code for this request.');return}
     if(demoCode&&String(p.code).trim()!==demoCode){fail('That code does not match the prototype code shown above.');return}
     recoveryCode=String(p.code).trim();phase='password';redraw();return;
    }
    const invalid=validateAccessCredentials(usernameValue,p.newPassword,p.confirmPassword);
    if(invalid){fail(invalid);return}
    if(recoveryMethod==='recovery-key'&&!String(p.recoveryKey||'').trim()){fail('Enter the private recovery key saved when your account was created.');return}
    busy=true;redraw();await auth.completeRecovery({challengeId,...(recoveryMethod==='recovery-key'?{recoveryKey:String(p.recoveryKey||'').trim()}:{code:recoveryCode}),newPassword:p.newPassword});recoveryCode='';challengeId='';phase='success';busy=false;redraw();return;
   }
   if(view==='invite'){
    if(phase==='pending-other'){fail('Resume the original invitation request or sign in before accepting another invitation.');return}
    if(!['credentials','resume'].includes(phase)){
     let value=String(p.token||'').trim();
     try{const u=new URL(value);value=u.searchParams.get('invite')||u.searchParams.get('invitation')||value}catch{}
     if(!value){fail('Paste your invitation code or link.');return}
     token=value;await readInvitation();redraw();return;
    }
    const pending=auth.getPendingInvitation?.();
    if(pending&&(pending.token!==token||pending.username.toLowerCase()!==usernameValue.toLowerCase())){fail('Use the original username @'+pending.username+' for this request.');return}
    const password=phase==='resume'?p.password:p.newPassword,invalid=validateAccessCredentials(usernameValue,password,phase==='resume'?undefined:p.confirmPassword);if(invalid){fail(invalid);return}
    busy=true;redraw();const result=await auth.acceptInvitation({token,username:usernameValue,password});token='';await finishInvitationAccess(result);return;
   }
   if(view==='secure'){
    if(!auth.canMigrateLegacyBusiness?.(business())){fail('This business is already shared. Sign in with its existing account.');return}
    if(!securedCode){if(!p.importConsent){fail('Confirm that you want to upload the saved prototype records.');return}securedCode=true;phase='credentials';const pending=auth.getPendingLegacyImport?.();if(pending?.username)username=pending.username;redraw();return}
    const invalid=validateAccessCredentials(usernameValue,p.newPassword,p.confirmPassword);if(invalid){fail(invalid);return}
    if(typeof config.onSecureExisting!=='function'){fail('Account setup is unavailable. Return to merchant signup.');return}busy=true;redraw();await config.onSecureExisting({username:usernameValue,password:p.newPassword,confirmImport:true});await authenticated();return;
   }
   if(view==='resume-import'){
    if(!current){show('login');return}
    if(!p.currentPassword||!p.importConsent){fail('Enter your password and confirm the saved-record import.');return}
    if(typeof auth.resumeLegacyImport!=='function'){fail('Saved-record import is unavailable.');return}
    busy=true;redraw();await auth.resumeLegacyImport({currentPassword:p.currentPassword,confirmImport:true});await authenticated();return;
   }
   if(view==='password'){
    if(!current){show('login');return}
    if(!p.currentPassword){fail('Enter your current password.');return}
    const invalid=validateAccessCredentials(current.username,p.newPassword,p.confirmPassword);if(invalid){fail(invalid);return}
    if(p.currentPassword===p.newPassword){fail('Choose a different password from your current one.');return}
    busy=true;redraw();await auth.changePassword({currentPassword:p.currentPassword,newPassword:p.newPassword});phase='success';busy=false;redraw();return;
   }
   if(view==='username-recovery'){
    phone=String(p.phone||'').trim();const key=String(p.recoveryKey||'').trim();
    if(!phone||!key){fail('Enter your registered number and private recovery key.');return}
    if(typeof auth.recoverUsername!=='function'){fail('Username recovery is unavailable in this local sample. Ask the business owner for your username.');return}
    busy=true;redraw();const result=await auth.recoverUsername({phone,recoveryKey:key});recoveredUsernames=Array.isArray(result?.usernames)?result.usernames:result?.username?[result.username]:[];phase='success';busy=false;redraw();return;
   }
   if(view==='phone'){
    if(!current){show('login');return}
    phone=String(p.newPhone||'').trim();if(!phone||!p.currentPassword){fail('Enter your new number and current password.');return}
    if(typeof auth.changePhone!=='function'){fail('Phone replacement is unavailable in this local sample.');return}
    busy=true;redraw();await auth.changePhone({currentPassword:p.currentPassword,newPhone:phone});phone='';phase='success';busy=false;redraw();return;
   }
   if(view==='regenerate-key'){
    if(!current){show('login');return}
    if(!p.currentPassword){fail('Enter your current password.');return}
    if(typeof auth.regenerateRecoveryKey!=='function'){fail('Recovery key replacement is unavailable in this local sample.');return}
    busy=true;redraw();const result=await auth.regenerateRecoveryKey({currentPassword:p.currentPassword});
    if(!result?.recoveryKey)throw new Error('A new recovery key could not be prepared. Try again.');
    show('recovery-key',{recoveryKey:result.recoveryKey,recoveryKeyReference:result.recoveryKeyReference});return;
   }
   if(view==='recovery-key'){
    if(!p.keySaved){fail('Confirm that you have saved the private recovery key.');return}
    busy=true;redraw();if(typeof auth.acknowledgeRecoveryKey==='function')await auth.acknowledgeRecoveryKey({reference:recoveryKeyReference});else auth.clearRecoveryKey?.();recoveryKey='';recoveryKeyReference='';active=false;busy=false;
    if(config.onRecoveryKeySaved)await config.onRecoveryKeySaved();else config.onBack?.();redraw();return;
   }
   if(view==='step-up'){
    if(!current){settleStepUp();show('login');return}
    if(!p.currentPassword){fail('Enter your current password.');return}
    if(typeof auth.verifyStepUp!=='function'){fail('Owner confirmation is unavailable in this local sample.');return}
    busy=true;redraw();const value=await auth.verifyStepUp({currentPassword:p.currentPassword,purpose:stepUp?.purpose||'owner-action'});const proof=typeof value==='string'?{stepUpToken:value}:{...value,stepUpToken:value?.stepUpToken||value?.proof};if(!proof.stepUpToken)throw new Error('Owner confirmation could not be completed. Try again.');active=false;busy=false;settleStepUp(proof);redraw();return;
   }
   if(view==='profile'){
    if(!current){show('login');return}
    if(current.role!=='owner'){fail('Ask the owner to update this account.');return}
    const name=String(p.name||'').trim();if(name.length<2){fail('Enter your full name.');return}
    busy=true;redraw();await auth.updateUser(current.userId,{name},current);busy=false;notice='Your profile has been updated.';redraw();return;
   }
  }catch(e){
   if(view==='recovery-key'&&e.code==='RECOVERY_KEY_CHANGED'){
    const failedReference=recoveryKeyReference,latestKey=auth.getRecoveryKey?.(),latestReference=auth.getRecoveryKeyReference?.();recoveryKey='';recoveryKeyReference='';
    if(latestKey&&latestReference&&latestReference!==failedReference)show('recovery-key',{recoveryKey:latestKey,recoveryKeyReference:latestReference,notice:'The recovery key changed in another request. Save this current key before continuing.'});
    else{auth.clearRecoveryKey?.();show('regenerate-key',{notice:'Your recovery key changed in another request. Confirm your password to replace it, then save the current key.'});}
    return;
   }
   if(view==='invite'){
    const pending=auth.getPendingInvitation?.();
    if(pending?.token===token){username=pending.username;phase='resume';notice='The original account request is preserved. Retry with its original password, or sign in with @'+pending.username+'.';fail(e.invitationPending&&!e.status?'We could not confirm the response. Your account may already exist.':e.message||'The invitation result could not be confirmed.');return}
    if(e.status===400&&e.code==='INVALID_REQUEST'&&invitation?.status==='pending'){phase='credentials';notice='Correct the account details and try again. No account was created by the rejected request.';fail(e.message);return}
    if(['INVITATION_INVALID','INVITATION_NOT_FOUND','INVITATION_EXPIRED','INVITATION_REVOKED','INVITATION_ACCESS_CHANGED'].includes(e.code)){phase='unavailable';fail(e.message);return}
    if(e.code==='INVITATION_ACCEPTED'){phase='resume';notice='This invitation already has an account. Enter the username and password originally chosen for it, or sign in.';fail(e.message);return}
   }
   if(view==='secure'){const pending=auth.getPendingLegacyImport?.();if(pending?.targetBusinessId&&session()?.businessId===pending.targetBusinessId){view='resume-import';phase='password'}}if(['password','phone','profile','sessions','step-up','regenerate-key','resume-import'].includes(view)&&!session()){settleStepUp();view='login';phase='username';notice='This action could not be confirmed. Sign in again before continuing.'}fail(e.message||'We could not complete that step. Please try again.')}
 }
 async function handleClick(action,element){
  const a=String(action).replace(/^access-/,'');
  if(recoveryRequired()&&!['sign-out','privacy','copy-recovery-key','toggle-saved-key','toggle-password','regenerate-key'].includes(a)){enforceRecoveryCheckpoint();redraw();return}
  if(a==='toggle-password'){
   const form=element?.closest('form');const input=[...form?.querySelectorAll('input')||[]].find(x=>x.name===element.dataset.field);
   if(input){const showing=input.type==='password';input.type=showing?'text':'password';element.setAttribute('aria-pressed',String(showing));element.setAttribute('aria-label',(showing?'Hide ':'Show ')+element.dataset.field.replaceAll(/([A-Z])/g,' $1').toLowerCase());element.innerHTML=icon('eye')+`<span>${showing?'Hide':'Show'}</span>`;input.focus({preventScroll:true})}return;
  }
  if(a==='privacy'){privacy=!privacy;redraw();return}
  if(a==='copy-recovery-key'){try{await navigator.clipboard.writeText(recoveryKey);info('Recovery key copied. Store it somewhere private.')}catch{info('Clipboard is unavailable. Use Show key, then save the key privately.')}return}
  if(a==='toggle-saved-key'){const input=document.querySelector('[name="savedRecoveryKey"]');if(input){const visible=input.type==='password';input.type=visible?'text':'password';element.textContent=visible?'Hide key':'Show key'}return}
  if(a==='resume-invitation'){const pending=auth.getPendingInvitation?.();show('invite',{token:pending?.token||token,username:pending?.username||username});return}
  if(a==='invitation-sign-in'){const pending=auth.getPendingInvitation?.(),original=pending?.username||username;show('login',{username:original,notice:'Sign in with the username and password chosen for your invitation. If its recovery key was not saved, you will be guided to replace it.'});return}
  if(a==='signup'){active=false;config.onSignup?.();return}
  if(a==='demo'){active=false;config.onDemo?.();return}
  if(a==='back'||a==='cancel-step-up'){backToApp();return}
  if(a==='use-username'){username=String(element?.dataset.username||'');show('login',{username});return}
  if(a==='sign-out'){recoveryKey='';recoveryKeyReference='';recoveryIdentity='';active=true;view='login';phase='username';error='';busy=true;settleStepUp();config.onSignOut?.();redraw();try{const result=await auth.signOut?.();busy=false;notice=result?.localOnly?result.message||'This device is locked. Server sign-out will retry when connected.':'You have signed out on this device. Your business records are unchanged.';redraw()}catch(e){busy=false;notice='This device is locked. Server sign-out could not be confirmed while disconnected.';redraw()}return}
  if(a==='resend-recovery'){
   if(busy)return;
   try{busy=true;redraw();const result=await auth.beginRecovery(username);challengeId=result.challengeId;maskedPhone=result.maskedPhone;phase='code';busy=false;info('A new demo recovery code is ready: 123456.')}catch(e){fail(e.message)}return;
  }
  if(a==='revoke-session'){
   try{const current=session();if(!current){show('login');return}await auth.revokeSession(element.dataset.id,current);if(element.dataset.id===current.id){config.onSignOut?.();show('login');notice='This session has ended.';redraw()}else info('The selected session has been revoked.')}catch(e){fail(e.message)}return;
  }
  if(['login','recovery','invite','secure','password','profile','sessions','username-recovery','phone','regenerate-key','resume-import'].includes(a)){show(a,{username});return}
 }
 function handleChange(element){
  if(!element?.name)return;
  if(element.name==='username')username=element.value;
  if(element.name==='remember')remember=element.checked;
  if(element.dataset.accessStrength){
   const value=element.value,rules={length:value.length>=10,letter:/[A-Za-z]/.test(value),number:/\d/.test(value)};
   const score=Object.values(rules).filter(Boolean).length+(value.length>=14?1:0),formElement=element.closest('form');
   formElement?.querySelectorAll('[data-strength-bar]').forEach((bar,i)=>bar.classList.toggle('on',i<score));
   formElement?.querySelectorAll('[data-password-rule]').forEach(rule=>rule.classList.toggle('met',Boolean(rules[rule.dataset.passwordRule])));
   const label=formElement?.querySelector('[data-strength-label]');if(label)label.textContent=!value?'Choose a test password':score<3?'Keep going':score===3?'Meets the requirements':'Strong test password';
  }
 }
 return {render,isActive:()=>active,enforceRecoveryCheckpoint,show,hide,handleClick,handleSubmit,handleChange,requestStepUp};
}

