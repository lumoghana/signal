(function () {
  'use strict';
  const L = window.L;
  const O = L.onboarding = {};
  const e = L.e;
  let accountChangeDepth=0;
  L.accountChange=function(run,label='Save account change',options={}){
    if(accountChangeDepth||!L.persistence?.transaction)return run();
    const route=L.route,params={...L.params},fields=[...(document.getElementById('view')?.querySelectorAll?.('input,select,textarea')||[])].filter(el=>el.id&&el.type!=='password'&&!/pin|otp|verification|password|code/i.test(el.id)).map(el=>({id:el.id,value:el.value,checked:el.checked}));
    accountChangeDepth++;
    try{return L.persistence.transaction(run,{financial:false,label});}
    catch(error){
      O.draftPin=null;
      const target=options.retryPin?'pin':route;
      L.go(target,options.retryPin?{mode:O.pinMode||'setup'}:params);
      for(const field of fields){const el=document.getElementById(field.id);if(el){el.value=field.value;if(typeof field.checked==='boolean')el.checked=field.checked;}}
      for(const field of document.querySelectorAll('input[type="password"]'))field.value='';
      L.error(error?.message||'This change could not be saved. Your previous details are unchanged.');return false;
    }finally{accountChangeDepth--;}
  };
  const title = (k, h, p) => `<div class="page-heading">${k ? `<div class="eyebrow" style="margin:22px 0 12px">${k}</div>` : ''}<h1>${h}</h1>${p ? `<p class="muted">${p}</p>` : ''}</div>`;
  const head = label => {
    const recoveryPhone=L.route==='phone'&&['recovery','replacement'].includes(L.params.purpose);
    const routes={identity:"L.go('setupProgress')",campus:"L.go('setupProgress')",pin:L.params.mode==='recovery'?"L.go('recoveryOwnership')":"L.go('setupProgress')",accountReview:"L.go('setupProgress')",livecheck:"L.go('identity')",phone:recoveryPhone?"L.go('recovery')":"L.go('welcome')",applicationStatus:"L.onboarding.leave()"};
    const back=L.route==='confirmPin'?"L.go('pin',{mode:L.params.mode||'setup'})":L.route==='otp'?"L.go('phone',{purpose:L.state.setup.otpPurpose||'signup'})":routes[L.route]||'L.back()';
    return `<div class="topline"><button type="button" class="icon-btn" onclick="${back}" aria-label="Go back">${L.icon('arrowLeft')}</button><span class="eyebrow">${e(label)}</span><button type="button" class="icon-btn" onclick="L.go('help',{returnTo:L.route,returnParams:L.params,context:'Getting started'})" aria-label="Get help">${L.icon('help',21)}</button></div>`;
  };
  const error = '<div id="error" role="alert"></div>';
  const button = (label, action, cls) => L.btn(label, action, cls || 'primary');
  const ref = kind => `${kind}-${Date.now().toString(36).toUpperCase()}`;
  const save = () => L.save();
  const samplePhone = '24 123 0123';
  const progress = n => `<div class="progress" aria-label="Step ${n} of 5"><div class="progress-bar" style="width:${n * 20}%"></div></div><p class="small muted" style="margin-top:10px">${['', 'Your number', 'Your identity', 'Your details', 'Your security', 'One last look'][n]} · ${n} of 5</p>`;
  const sampleControl = (id, values) => L.testMode ? `<details class="demo-options"><summary>Test another outcome</summary><label class="field"><span>Sample result</span><select class="input" id="${id}">${values.map(([v, t]) => `<option value="${v}">${t}</option>`).join('')}</select></label></details>` : '';
  const sampleButton = (id, value, label) => L.testMode ? `<button type="button" class="text-btn" onclick="L.onboarding.fill('${id}','${value}')">${label}</button>` : '';
  const outcome = (id, fallback) => L.testMode ? L.value(id) || fallback : fallback;
  const smallHelp = route => `<button class="text-btn" onclick="L.go('help',{returnTo:'${route}',context:'Getting started'})">Need a hand?</button>`;
  function setup() { return L.state.setup || (L.state.setup = {step: 'phone'}); }
  const sampleIdentity=()=>({name:'Kwame Mensah',ghanaCard:'GHA-000000000-0',dateOfBirth:'2004-03-12'});
  const verifiedIdentity=()=>setup().verifiedIdentity||{name:setup().verifiedName||L.state.profile.name||'',ghanaCard:L.state.profile.ghanaCard||'',dateOfBirth:L.state.profile.dateOfBirth||''};
  const universityName=prefix=>{const s=setup(),d=s.drafts||{},legacy=prefix==='campus'?s.interest||{}:{};return d[prefix+'Name']??(prefix==='campus'?d.interestCampus:undefined)??legacy.campus??L.state.profile.campus??'';};
  L.isLegonUniversity=value=>/^(?:university of ghana(?:[\s,()\-]*legon)?|ug|legon)$/i.test(String(value||'').trim().replace(/\s+/g,' '));
  const campusNotice=prefix=>{
    const name=universityName(prefix);
    return `<div id="${prefix}PilotNotice" class="notice university-pilot-notice" role="note" ${!name||L.isLegonUniversity(name)?'hidden':''}><strong>Built for Legon first.</strong><p class="small">Lumo is being piloted at the University of Ghana. Some campus features may be limited at other universities.</p></div>`;
  };
  O.refreshCampusNotice=prefix=>{const el=document.getElementById(prefix+'PilotNotice');if(el){const name=L.value(prefix+'Name');el.hidden=!name||L.isLegonUniversity(name);}};
  // Campus is self-reported, not an eligibility or identity check. The old
  // interest drafts still prefill this form so saved setups can continue.
  function universityFields(prefix = 'campus') {
    const s=setup(),d=s.drafts||{},legacy=prefix==='campus'?s.interest||{}:{};
    const name=d[prefix+'Name']??(prefix==='campus'?d.interestCampus:undefined)??legacy.campus??L.state.profile.campus??'University of Ghana';
    const email=d[prefix+'Email']??(prefix==='campus'?d.interestEmail:undefined)??legacy.email??L.state.profile.email??'';
    return `<label class="field" for="${prefix}Name"><span>University</span><input class="input" id="${prefix}Name" name="university" autocomplete="organization" enterkeyhint="next" maxlength="100" placeholder="Your university" value="${e(name)}" oninput="L.onboarding.remember('${prefix}Name',this.value)"></label><label class="field" for="${prefix}Email"><span>Email · optional</span><input class="input" id="${prefix}Email" name="email" type="email" inputmode="email" autocomplete="email" enterkeyhint="go" maxlength="120" placeholder="name@example.com" value="${e(email)}" oninput="L.onboarding.remember('${prefix}Email',this.value)"></label><p class="small muted">You can add or change your email later in Profile.</p>`;
  }
  function readUniversity(prefix = 'campus') {
    const campus=L.value(prefix+'Name').trim(),email=L.value(prefix+'Email').trim();
    if(!campus) { L.error('Enter your university.',prefix+'Name'); return null; }
    if(email&&!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) { L.error('Check the email address or leave it empty.',prefix+'Email'); return null; }
    return {campus,email};
  }
  function saveUniversity(details) {
    const s=setup();L.state.profile.campus=details.campus;L.state.profile.email=details.email;
    s.campusStatus='approved';s.campusRef=s.campusRef||ref('CAMPUS');
    L.state.profile.pilotCampusLimited=!L.isLegonUniversity(details.campus);
    s.drafts=s.drafts||{};s.drafts.campusName=details.campus;s.drafts.campusEmail=details.email;
    delete s.drafts.studentId;delete s.drafts.correctStudentId;
    // An earlier waitlist selection must not keep overriding saved details.
    delete s.interest;
  }
  function normalPhone(v) {
    let n = String(v || '').replace(/[\s().-]/g, '');
    if (n.startsWith('+233')) n = '0' + n.slice(4);
    else if (n.startsWith('233')) n = '0' + n.slice(3);
    else if (/^[235]\d{8}$/.test(n)) n = '0' + n;
    return /^0[235]\d{8}$/.test(n) ? n : '';
  }
  function phoneLabel(n) { return n ? `${n.slice(0, 3)} ${n.slice(3, 6)} ${n.slice(6)}` : ''; }
  function firstStep() {
    const s = setup();
    if (L.state.onboarded) return 'home';
    if (s.applicationRef) return 'applicationStatus';
    if (!s.phoneConfirmed) return 'phone';
    if (s.identityStatus !== 'approved') return s.identityStatus ? 'identityResult' : 'identity';
    if (s.identityDetailsReviewed === false || !s.identityDetailsReviewed && s.campusStatus !== 'approved') return 'identityResult';
    if (s.campusStatus !== 'approved') return s.campusStatus ? 'campusStatus' : 'campus';
    if (!s.securitySaved || !L.state.profile.pin) return 'pin';
    return 'accountReview';
  }
  O.next = function () { const next = firstStep(); setup().step = next; save(); L.go(next); };
  O.start = function () {
    if (L.state.onboarded) { L.go('signin'); return; }
    const s = setup();
    if (s.phoneConfirmed || s.phone || s.interest) { L.go('setupChoice'); return; }
    L.go('phone', {purpose: 'signup'});
  };
  O.restart = function () {
    const old = setup();
    L.state.setup = {step:'phone',otpWait:old.otpWait||0,otpLock:old.otpLock||0,otpPhone:old.otpPhone||'',otpExpires:old.otpExpires||0,otpRef:old.otpRef||'',otpAttempts:old.otpAttempts||0,otpPurpose:'signup'};
    L.state.profile.phone = '';
    L.state.profile.studentId = '';
    L.state.profile.campus = 'University of Ghana';
    L.state.profile.email = '';
    L.state.profile.address = '';
    L.state.profile.pin = '';
    save(); L.go('phone', {purpose: 'signup'});
  };
  O.resume = function () {
    if (L.state.onboarded) { L.go('signin'); return; }
    L.go('phone', {purpose: 'resume'});
  };
  O.fill = function (id, value) { const el = document.getElementById(id); if (el) { el.value = value; el.dispatchEvent(new Event('input', {bubbles:true})); } };
  O.remember = function (field,value) { const s=setup();s.drafts=s.drafts||{};s.drafts[field]=value;save();if(field==='campusName')O.refreshCampusNotice('campus');if(field==='correctCampusName')O.refreshCampusNotice('correctCampus'); };
  O.leave = function () { O.draftPin=null; save(); L.go('welcome'); L.toast('Your progress is saved on this device.'); };
  O.sendCode = function (purpose) {
    const s = setup();
    const input = L.value('phoneNumber');
    const n = normalPhone(input);
    if (!input) return L.error('Enter your mobile number.','phoneNumber');
    if (!n) return L.error('Check your number. Try a number like 024 123 0123.','phoneNumber');
    if (purpose === 'replacement' && n === normalPhone(L.state.profile.phone)) return L.error('Enter your new number. It must be different from your current one.');
    if (L.testMode && purpose === 'replacement' && n === '0200000000') return L.error('That sample number is already in use. Try another number or get help.');
    if (purpose === 'recovery' && n !== normalPhone(L.state.profile.phone)) return L.error('Enter the number linked to this account. If you no longer have it, choose lost phone or number.');
    if (purpose === 'resume' && s.phone && normalPhone(s.phone) !== n) return L.error('Enter the number used for your saved setup, or start again from Welcome.');
    if (Date.now() < (s.otpLock || 0)) return L.error(`Please wait ${Math.ceil((s.otpLock - Date.now()) / 1000)} seconds before trying again.`);
    if (Date.now() < (s.otpWait || 0) && s.otpPhone === n) { L.go('otp', {purpose}); return; }
    s.otpPhone = n; s.otpPurpose = purpose || 'signup'; s.otpRef = ref('CODE');
    s.otpWait = Date.now() + 30000; s.otpExpires = Date.now() + 300000; s.otpAttempts = 0;
    if (purpose === 'signup') { s.phone = n; }
    save(); L.go('otp', {purpose: s.otpPurpose});
  };
  O.resend = function () {
    const s = setup();
    if (Date.now() < (s.otpLock || 0)) return L.error('Please wait until the retry timer ends.');
    if (Date.now() < (s.otpWait || 0)) return L.error(`Try again in ${Math.ceil((s.otpWait - Date.now()) / 1000)} seconds.`);
    s.otpRef = ref('CODE'); s.otpWait = Date.now() + 30000; s.otpExpires = Date.now() + 300000;
    s.otpAttempts=0; save(); L.go('otp', {purpose:s.otpPurpose}); L.toast('Preview code: 123456. No SMS is sent.');
  };
  O.verifyCode = function () {
    const s = setup(), code = L.value('verificationCode');
    if (Date.now() < (s.otpLock || 0)) return L.error(`Please wait ${Math.ceil((s.otpLock - Date.now()) / 1000)} seconds.`);
    if (!/^\d{6}$/.test(code)) return L.error('Enter all six digits.','verificationCode');
    if (Date.now() > (s.otpExpires || 0)) return L.error('That code has expired. Request a new code.');
    if (code !== '123456') {
      s.otpAttempts = (s.otpAttempts || 0) + 1;
      if (s.otpAttempts >= 5) { s.otpLock = Date.now() + 30000; s.otpAttempts = 0; save(); L.go('otp'); return; }
      save(); return L.error('That code did not match. Try again.','verificationCode');
    }
    s.otpAttempts = 0;
    if (s.otpPurpose === 'recovery' || s.otpPurpose === 'replacement') {
      s.recovery = s.recovery || {};
      if (s.otpPurpose === 'replacement') { s.recovery.replacementConfirmed = true; s.recovery.newPhone = s.otpPhone; }
      else s.recovery.phoneChecked = true;
      save(); L.go('recoveryOwnership'); return;
    }
    if (L.state.onboarded) { save(); L.go('signin'); return; }
    s.phoneConfirmed = true; s.phone = s.otpPhone; L.state.profile.phone = s.otpPhone;
    save(); O.next();
  };
  O.beginIdentity = function () {
    if (!document.getElementById('identityPrivacy')?.checked) return L.error('Confirm that you understand the preview check before continuing.');
    setup().identityAcknowledged = true; save(); L.go('livecheck');
  };
  O.identityCheck = function () {
    const s = setup(); s.identityRef = s.identityRef || ref('ID');
    s.identityStatus = outcome('identityOutcome','approved');
    if (s.identityStatus === 'approved') { s.verifiedIdentity=sampleIdentity();L.state.profile.name=s.verifiedIdentity.name;s.verifiedName=s.verifiedIdentity.name;s.identityDetailsReviewed=false; }
    s.step = 'identityResult';
    save(); L.go('identityResult');
  };
  O.identityResolve = function () {
    const s = setup(),previous=s.identityStatus; const status = outcome('identityResolve',previous);
    s.identityStatus = status;
    if (status === 'approved') { s.verifiedIdentity=sampleIdentity();L.state.profile.name=s.verifiedIdentity.name;s.verifiedName=s.verifiedIdentity.name;s.identityDetailsReviewed=false; }
    save(); L.go('identityResult');
    if(status===previous&&status==='pending')L.toast('Still in review. Your progress is saved.');
  };
  O.checkCampus = function () {
    const details=readUniversity();if(!details)return;
    saveUniversity(details);setup().step='pin';save();O.next();
  };
  O.confirmVerifiedDetails = function () {
    const s=setup();if(!s.phoneConfirmed||s.identityStatus!=='approved'){O.next();return;}
    const details=readUniversity();if(!details)return;
    const verified=verifiedIdentity();
    Object.assign(L.state.profile,{name:verified.name,ghanaCard:verified.ghanaCard,dateOfBirth:verified.dateOfBirth,address:L.value('customerAddress').slice(0,200)});
    saveUniversity(details);s.identityDetailsReviewed=true;s.step='pin';save();O.next();
  };
  O.campusReview = O.campusResolve = function () { L.go('campus'); };
  O.interestSave = O.checkCampus;
  O.pinNext = function () {
    if(L.state.onboarded && !(L.params.mode==='recovery' && setup().recovery?.status==='approved')) { L.go('security'); return; }
    const pin = L.value('newPin');
    if (!/^\d{6}$/.test(pin)) return L.error('Enter all six digits.','newPin');
    O.draftPin = pin; O.pinMode = L.params.mode || 'setup'; L.go('confirmPin', {mode: O.pinMode});
  };
  O.pinConfirm = function () {
    if(L.state.onboarded && !(O.pinMode==='recovery' && setup().recovery?.status==='approved')) { O.draftPin=null; L.go('signin'); return; }
    const pin = L.value('confirmPin');
    if (!/^\d{6}$/.test(pin)) return L.error('Enter all six digits.','confirmPin');
    if (!O.draftPin) { L.go('pin', {mode: O.pinMode || 'setup'}); return; }
    if (pin !== O.draftPin) { O.fill('confirmPin', ''); return L.error('Those PINs do not match. Try again.','confirmPin'); }
    L.state.profile.pin = O.draftPin; O.draftPin = null; L.authPolicy?.reset();
    if (O.pinMode === 'recovery') {
      const r = setup().recovery || {};
      if (r.replacementConfirmed && r.newPhone) L.state.profile.phone = r.newPhone;
      setup().recovery = null; setup().signinAttempts = 0; setup().signinLock = 0; L.state.locked = true;
      save(); L.go('signin',{returnTo:r.returnTo||setup().signinReturn,returnParams:r.returnParams||setup().signinReturnParams||{}}); L.toast('Your PIN is updated. Sign in with your new PIN.'); return;
    }
    setup().securitySaved = true; setup().step = 'accountReview'; save(); L.go('accountReview');
  };
  O.editCheck = function(kind) { const s=setup(); if(kind==='phone')s.phoneConfirmed=false; if(kind==='identity'){s.identityStatus=null;s.identityDetailsReviewed=false;} if(kind==='campus')s.campusStatus=null; s.step=kind; save(); L.go(kind,kind==='phone'?{purpose:'signup'}:{}); };
  O.reviewChoices = function () { setup().reviewAgree=!!document.getElementById('accountAgree')?.checked; setup().reviewMarketing=!!document.getElementById('productMessages')?.checked; save(); };
  O.createAccount = function () {
    const s = setup();
    if (!document.getElementById('accountAgree')?.checked) return L.error('Accept the preview terms and privacy notice to continue.');
    if (s.applicationRef) { L.go('applicationStatus'); return; }
    if (!s.phoneConfirmed || s.identityStatus !== 'approved' || s.identityDetailsReviewed===false || s.campusStatus !== 'approved' || !s.securitySaved) { O.next(); return; }
    s.termsVersion = 'prototype-2026-10'; s.termsAccepted = true;
    L.state.prefs.marketing = document.getElementById('productMessages').checked;
    s.applicationRef = ref('LUMO'); s.applicationStatus = outcome('accountOutcome','ready');
    s.step = 'applicationStatus'; save();
    if (s.applicationStatus === 'ready') O.ready(); else L.go('applicationStatus');
  };
  O.correctApplication = function () { const details=readUniversity('correctCampus');if(!details)return;saveUniversity(details);setup().applicationStatus='pending';save();L.go('applicationStatus');L.toast('Your university and email are updated.'); };
  O.applicationCheck = function () {
    const s=setup(),previous=s.applicationStatus;
    s.applicationStatus = outcome('applicationOutcome',previous);
    save(); if (s.applicationStatus === 'ready') O.ready(); else {L.go('applicationStatus');if(s.applicationStatus===previous)L.toast('No change yet. Your application is saved.');}
  };
  O.ready = function () {
    L.state.onboarded = true; L.state.locked = false; L.showPrivateMoney?.(); const old=setup(); L.state.setup={step:'done',applicationRef:old.applicationRef,applicationStatus:'ready',termsVersion:old.termsVersion,acceptedAt:new Date().toISOString()};
    L.state.role = 'student';L.ensureAccounts?.();save();L.go('accountReady');L.toast('Your Lumo account is ready.');
  };
  O.captureAccessReturn = function (params) {
    const p=params||L.params||{}, s=setup();
    if(typeof p.returnTo==='string'&&!['signin','recovery','phone','otp','pin','confirmPin'].includes(p.returnTo)) { s.signinReturn=['authorize','pause'].includes(p.returnTo)?'paymentReview':p.returnTo; s.signinReturnParams=p.returnParams&&typeof p.returnParams==='object'?JSON.parse(JSON.stringify(p.returnParams)):{}; save(); }
  };
  O.openRecovery = function (kind) { O.captureAccessReturn(); const s=setup(); L.go('recovery',{kind:kind||'pin',returnTo:s.signinReturn,returnParams:s.signinReturnParams||{}}); };
  O.updateSigninLock = function () {
    if(O.signinTimer){clearTimeout(O.signinTimer);O.signinTimer=null;}
    if(L.route!=='signin')return;
    const seconds=Math.max(L.authPolicy?.status()?.seconds||0,Math.max(0,Math.ceil(((setup().signinLock||0)-Date.now())/1000)));
    const warning=document.getElementById('signinLock'),count=document.getElementById('signinLockSeconds'),submit=document.getElementById('signinButton');
    if(warning)warning.hidden=!seconds;
    if(count)count.textContent=String(seconds);
    if(submit)submit.disabled=seconds>0;
    if(!seconds&&O.signinWasLocked){const error=document.getElementById('error');if(/^Too many (?:PIN )?attempts\./.test(error?.textContent||''))error.textContent='';L.toast('You can try signing in again.');}
    O.signinWasLocked=seconds>0;
    if(seconds)O.signinTimer=setTimeout(O.updateSigninLock,1000);
  };
  O.signin = function () {
    O.captureAccessReturn();
    const s = setup(), input = L.value('signPhone'), n = normalPhone(input), pin = L.value('signPin');
    if (!n) return L.error('Enter the mobile number linked to your account.','signPhone');
    if (L.authPolicy?.status()?.coolingDown||Date.now() < (s.signinLock || 0)) {O.updateSigninLock();return;}
    if (!/^\d{6}$/.test(pin)) return L.error('Enter your six-digit PIN.','signPin');
    if (!L.state.profile.pin || !normalPhone(L.state.profile.phone)) return L.error('There is no account saved on this device. Return to Welcome and choose Get started.');
    if (n !== normalPhone(L.state.profile.phone)) return L.error('Those details don’t match. Check your mobile number and PIN.','signPhone');
    const verification=L.authPolicy?.verify(pin,{allowLocked:true,purpose:'signin'});
    if(verification&&!verification.ok){L.error(verification.message,'signPin');O.updateSigninLock();return;}
    if (!verification&&pin !== L.state.profile.pin) {
      s.signinAttempts = (s.signinAttempts || 0) + 1;
      if (s.signinAttempts >= 5) { s.signinLock = Date.now() + 30000; s.signinAttempts = 0; }
      save(); if(s.signinLock>Date.now()){L.error('Too many attempts. Wait for the retry timer, or recover access.','signPin');O.updateSigninLock();return;}return L.error('That PIN did not match. Try again.','signPin');
    }
    const returnTo=s.signinReturn,returnParams=s.signinReturnParams||{};
    s.signinAttempts = 0; s.signinLock=0; L.state.locked = false;
    s.signinReturn = null; s.signinReturnParams=null;
    L.hidePrivateMoney?.(); save();
    if (L.state.onboarded) {if(L.state.closed)L.go('accountInfo');else if(['help','caseDetail','supportCase','statements','dataExport'].includes(returnTo))L.go(returnTo,returnParams);else L.openTab('home');} else O.next();
  };
  O.recoveryStart = function (kind) {
    if (!L.state.profile.pin) {
      if(setup().identityStatus!=='linked')return L.go('recovery');
      setup().recovery={kind:'external',externalPreview:true,ref:ref('REC'),status:'checking'};save();L.go('recoveryOwnership');return;
    }
    O.captureAccessReturn(); const s=setup();
    s.recovery = {kind, ref:ref('REC'), status:'checking', returnTo:s.signinReturn,returnParams:s.signinReturnParams||{}}; save();
    if (kind === 'lost') L.go('recoveryReplacement'); else L.go('phone', {purpose:'recovery'});
  };
  O.resumeRecovery = function () { const r=setup().recovery; if(!r)return L.go('recovery'); if(r.externalPreview)return L.go(r.status==='checking'?'recoveryOwnership':'recoveryStatus');if(r.kind==='lost'&&!r.replacementConfirmed)return L.go('recoveryReplacement'); if(r.kind==='pin'&&!r.phoneChecked)return L.go('phone',{purpose:'recovery'}); L.go(r.status==='checking'?'recoveryOwnership':'recoveryStatus'); };
  O.recoveryOwnership = function () {
    const r = setup().recovery;
    if (!r) return L.go('recovery');
    if(r.kind==='lost'&&!r.replacementConfirmed)return L.go('recoveryReplacement');
    if(r.kind==='pin'&&!r.phoneChecked)return L.go('phone',{purpose:'recovery'});
    r.status = outcome('recoveryOutcome','approved'); save();
    if (r.status === 'approved'&&!r.externalPreview) L.go('pin', {mode:'recovery'}); else L.go('recoveryStatus');
  };
  O.recoveryCheck = function () {
    const r = setup().recovery;
    if (!r) return L.go('recovery');
    if(r.kind==='lost'&&!r.replacementConfirmed)return L.go('recoveryReplacement');
    if(r.kind==='pin'&&!r.phoneChecked)return L.go('phone',{purpose:'recovery'});
    const previous=r.status;r.status = outcome('recoveryResolve',previous); save();
    if (r.status === 'approved'&&!r.externalPreview) L.go('pin',{mode:'recovery'}); else {L.go('recoveryStatus');if(r.status===previous)L.toast('No change yet. Your recovery request is saved.');}
  };

  const hero = `<svg style="width:100%;height:200px" viewBox="0 0 360 290" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="A student in a patterned shirt, feeling clear about their money"><defs><pattern id="onbPrint" width="24" height="24" patternUnits="userSpaceOnUse"><path d="M0 0h24v24H0z" fill="#b6f05b"/><path d="M0 12 12 0l12 12-12 12Z" fill="none" stroke="#385035" stroke-width="1.2"/><path d="m7 12 5-5 5 5-5 5Z" fill="#faf9f5"/></pattern></defs><ellipse cx="185" cy="264" rx="134" ry="10" fill="#e8e8e0"/><circle cx="225" cy="119" r="103" fill="#edf3e5"/><circle cx="225" cy="119" r="75" fill="none" stroke="#d6e6c5"/><path d="M240 57c24 12 36 43 27 69" fill="none" stroke="#b6f05b" stroke-width="5" stroke-linecap="round"/><path d="m260 122 7 7 8-8" fill="none" stroke="#8cbf40" stroke-width="3" stroke-linecap="round"/><path d="M114 259c0-41 2-88 20-112 15-20 64-23 86 4 17 22 23 75 24 108" fill="url(#onbPrint)" stroke="#252b24" stroke-width="2"/><path d="M154 139v-25h36v28c-6 16-29 14-36-3" fill="#e2b99c" stroke="#252b24" stroke-width="2"/><path d="M144 71c6-25 50-30 60-2l-2 35c-3 16-17 28-30 27-14-1-28-17-29-34Z" fill="#edc7aa" stroke="#252b24" stroke-width="2"/><path d="M142 84c-8-12-3-33 7-39 13-11 33-10 48-2 13 7 18 18 10 36l-10 4-7-20c-13 11-30 5-38 10l-3 15Z" fill="#252b24"/><path d="m159 93 5-1m21 0 5 1m-18 8-1 7h5m-13 7c6 4 12 4 18-1" fill="none" stroke="#252b24" stroke-width="2" stroke-linecap="round"/><path d="M138 162c-17 17-28 47-23 58 5 13 41 2 64-9" fill="none" stroke="#252b24" stroke-width="27" stroke-linecap="round"/><path d="M138 162c-17 17-28 47-23 58 5 13 41 2 64-9" fill="none" stroke="#edc7aa" stroke-width="23" stroke-linecap="round"/><path d="M211 164c11 18 20 42 17 53-3 10-23 6-40-1" fill="none" stroke="#252b24" stroke-width="26" stroke-linecap="round"/><path d="M211 164c11 18 20 42 17 53-3 10-23 6-40-1" fill="none" stroke="#edc7aa" stroke-width="22" stroke-linecap="round"/><rect x="169" y="164" width="36" height="58" rx="7" fill="#292e27" transform="rotate(8 187 193)"/><rect x="174" y="170" width="26" height="38" rx="3" fill="#f9fbf5" transform="rotate(8 187 193)"/><circle cx="184" cy="191" r="7" fill="#b6f05b"/><path d="m181 191 2 2 4-5" fill="none" stroke="#283923" stroke-width="1.5"/><rect x="42" y="74" width="87" height="51" rx="15" fill="#fff" stroke="#e3e5dc"/><circle cx="61" cy="93" r="6" fill="#b6f05b"/><path d="M76 90h35m-35 8h25m-23 14h31" stroke="#a7aca0" stroke-width="3" stroke-linecap="round"/><path d="m275 192 5 10 11 2-8 8 2 11-10-5-10 5 2-11-8-8 11-2Z" fill="#b6f05b"/><circle cx="82" cy="176" r="5" fill="#b6f05b"/><path d="M292 63v14m-7-7h14" stroke="#839b6a" stroke-width="2" stroke-linecap="round"/></svg>`;

  L.views.welcome = function () {
    const hasSetup = !!(setup().phone || setup().phoneConfirmed || setup().interest);
    return `<div class="welcome-screen"><div class="topline"><span class="wordmark"><img class="actual-wordmark lumo-wordmark-asset" src="/brand/Lumo-Wordmark-Black.svg" alt="Lumo"></span>${L.testMode?'<span class="pill">Testing</span>':''}</div><div class="illustration welcome-illustration">${hero}</div><h1>Your money.<br>Your next move.</h1><p class="muted">Enjoy today. See what comes next.</p><div class="actions">${button(hasSetup&&!L.state.onboarded?'Continue my setup':'Get started',hasSetup&&!L.state.onboarded?'L.onboarding.resume()':'L.onboarding.start()')}${button('I already have Lumo',"L.go('signin')",'secondary')}</div>${L.testMode?button('Explore a sample account',"L.go('sampleConfirm')",'text-btn welcome-explore'):''}<div class="inline" style="justify-content:center">${button('Privacy',"L.go('privacyNotice',{returnTo:'welcome'})",'text-btn')}${button('Help',"L.go('help',{returnTo:'welcome',context:'Welcome'})",'text-btn')}</div><p class="tiny muted center">Interactive preview. No real money moves.</p></div>`;
  };
  L.views.setupChoice = function () {
    return `<div>${head('Your saved setup')}${title('','Pick up where you left off.','Your completed steps are saved on this device.')}<div class="actions">${button('Continue setup','L.onboarding.resume()')}${button('Start again','L.onboarding.restart()','secondary')}${button('Back to Welcome',"L.go('welcome')",'text-btn')}</div><p class="small muted">Starting again replaces your unfinished setup.</p></div>`;
  };
  L.views.phone = function () {
    const purpose = L.params.purpose || 'signup';
    const isRecovery = purpose === 'recovery' || purpose === 'replacement';
    const key='phone-'+purpose, drafts=setup().drafts||{};
    const saved=Object.hasOwn(drafts,key)?drafts[key]:(purpose==='replacement'?'':purpose==='recovery'?L.state.profile.phone:setup().phone||'');
    const h = purpose === 'replacement' ? 'Your new number.' : purpose === 'resume' ? 'Welcome back.' : purpose === 'recovery' ? 'Your mobile number.' : 'Your number, please.';
    return `<div>${head(isRecovery ? 'Recover access' : 'Get started')}${!isRecovery ? progress(1) : ''}${title('',h,purpose === 'resume' ? 'Confirm your number to continue your saved setup.' : purpose==='replacement'?'Keep your account. Change the number you use.':purpose==='recovery'?'Enter the number linked to your Lumo account.':'Start with your Ghana mobile number.')}<form class="form" onsubmit="event.preventDefault();L.onboarding.sendCode('${purpose}')"><label class="field" for="phoneNumber"><span>Mobile number</span><span class="phone-field"><span aria-label="Ghana country code">+233</span><input id="phoneNumber" class="input" inputmode="tel" type="tel" autocomplete="tel-national" enterkeyhint="go" maxlength="18" placeholder="24 123 0123" value="${e(normalPhone(saved)?normalPhone(saved).slice(1):saved)}" oninput="L.onboarding.remember('${key}',this.value)"></span></label>${sampleButton('phoneNumber',purpose==='replacement'?'55 987 0654':samplePhone,'Use sample number')}${error}<p class="small muted">Preview only. Use a made-up number; no SMS is sent.</p><div class="actions"><button class="primary" type="submit">Continue ${L.icon('arrowRight',18)}</button>${button('Save and leave','L.onboarding.leave()','text-btn')}</div></form><button class="text-btn small" onclick="L.go('privacyNotice',{returnTo:'phone',purpose:'${purpose}'})">How we use your information</button></div>`;
  };
  L.views.otp = function () {
    const s = setup(), wait = Math.max(0, Math.ceil(((s.otpWait || 0)-Date.now())/1000)), lock = Math.max(0,Math.ceil(((s.otpLock || 0)-Date.now())/1000));
    if(O.codeTimer) { clearInterval(O.codeTimer); O.codeTimer=null; }
    setTimeout(() => {
      if (L.route !== 'otp') return;
      O.codeTimer=setInterval(() => {
        if (L.route !== 'otp') { clearInterval(O.codeTimer); O.codeTimer=null; return; }
        const locked=Math.max(0,Math.ceil(((setup().otpLock||0)-Date.now())/1000));
        const t=Math.max(locked,Math.max(0,Math.ceil(((setup().otpWait||0)-Date.now())/1000)));
        const resend=document.getElementById('resendCode'),verify=document.getElementById('verifyCodeButton'),warning=document.getElementById('codeLock');
        if(resend) {resend.disabled=t>0;resend.textContent=t>0?`Resend code in ${t}s`:'Resend code';}
        if(verify)verify.disabled=locked>0;
        if(warning)warning.hidden=!locked;
        if(!t) {clearInterval(O.codeTimer);O.codeTimer=null;}
      },1000);
    },0);
    const resendWait=Math.max(wait,lock);
    return `<div>${head('Confirm your number')}${title('','Check your code.','Enter six digits for '+e(phoneLabel(s.otpPhone))+'.')}<div class="notice"><strong>Preview code: 123456</strong><p class="small">No SMS is sent. This code expires in five minutes.</p></div><form class="form" onsubmit="event.preventDefault();L.onboarding.verifyCode()"><label class="field" for="verificationCode"><span>Verification code</span><input id="verificationCode" class="input code-input" type="text" inputmode="numeric" maxlength="6" autocomplete="one-time-code" enterkeyhint="go" placeholder="000000" aria-label="Six-digit verification code"></label><div id="codeLock" class="warning" ${lock?'':'hidden'}>Too many attempts. Please wait a moment before trying again.</div>${error}<div class="actions"><button id="verifyCodeButton" class="primary" type="submit" ${lock?'disabled':''}>Confirm number</button><button id="resendCode" type="button" class="text-btn" ${resendWait?'disabled':''} onclick="L.onboarding.resend()">${resendWait?`Resend code in ${resendWait}s`:'Resend code'}</button>${button('Change number',`L.go('phone',{purpose:'${s.otpPurpose || 'signup'}'})`,'text-btn')}</div></form></div>`;
  };
  L.views.identity = function () {
    return `<div>${head('Your identity')}${progress(2)}${title('','A quick identity check.','A little care to keep your account yours.')}<div class="notice"><strong>A sample identity is used here.</strong><p class="small">No Ghana Card, camera or verification provider is connected.</p></div><label class="check-row"><input type="checkbox" id="identityPrivacy" ${setup().identityAcknowledged||setup().drafts?.identityPrivacy?'checked':''} onchange="L.onboarding.remember('identityPrivacy',this.checked)"><span>I understand this preview uses a sample identity.</span></label>${error}<div class="actions">${button('Continue','L.onboarding.beginIdentity()')}${button('Save and leave','L.onboarding.leave()','text-btn')}</div><button class="text-btn small" onclick="L.go('privacyNotice',{returnTo:'identity',section:'identity'})">How your identity information is used</button></div>`;
  };
  L.views.livecheck = function () {
    return `<div>${head('Identity check')}${title('','Confirm it’s you.','This preview walks you through an identity check.')}<div class="notice"><strong>Camera stays off.</strong><p class="small">Continue with the sample identity, Kwame Mensah.</p></div>${sampleControl('identityOutcome',[['approved','Identity approved'],['pending','Still checking'],['attention','Needs attention'],['linked','Identity already linked'],['refused','Unable to approve']])}${error}<div class="actions">${button('Continue','L.onboarding.identityCheck()')}${button('Back',"L.go('identity')",'text-btn')}</div></div>`;
  };
  L.views.identityResult = function () {
    const s=setup(), status=s.identityStatus;
    if(status==='approved') {
      const verified=verifiedIdentity(),dob=verified.dateOfBirth?new Date(verified.dateOfBirth+'T12:00:00').toLocaleDateString('en-GB',{day:'numeric',month:'short',year:'numeric'}):'Not returned in this saved preview';
      return `<div>${head('Review your details')}${campusNotice('campus')}${progress(3)}${title('','Does this look right?','These identity details came from the sample Ghana Card check.')}<div class="verified-identity-data receipt" aria-label="Verified identity details"><div class="summary-line"><span>Full name</span><strong>${e(verified.name)}</strong></div><div class="summary-line"><span>Date of birth</span><strong>${e(dob)}</strong></div><div class="summary-line"><span>Ghana Card</span><strong>${e(verified.ghanaCard||'Not returned in this saved preview')}</strong></div></div><p class="small muted">Verified identity details are read-only. If they are wrong, ${button('get help',"L.go('help',{returnTo:'identityResult',context:'Verified identity correction'})",'text-btn small')}.</p><div class="summary-line verified-phone-row"><span>Verified phone</span><strong>${e(phoneLabel(L.state.profile.phone))}</strong>${button('Change number',"L.onboarding.editCheck('phone')",'text-btn small')}</div><form class="form verified-details-form" onsubmit="event.preventDefault();L.onboarding.confirmVerifiedDetails()">${universityFields()}<details class="optional-address" ${String(s.drafts?.customerAddress??L.state.profile.address??'').trim()?'open':''}><summary>Add an address (optional)</summary><label class="field" for="customerAddress"><span>Address (optional)</span><input class="input" id="customerAddress" name="address" autocomplete="street-address" maxlength="200" placeholder="Your address" value="${e(s.drafts?.customerAddress??L.state.profile.address??'')}" oninput="L.onboarding.remember('customerAddress',this.value)"></label></details>${error}<div class="actions"><button type="submit" class="primary">Confirm details</button>${button('Save and leave','L.onboarding.leave()','text-btn')}</div></form></div>`;
    }
    const copy=status==='pending'?['We’re checking this.','Your progress is saved. You can come back later.']:status==='linked'?['You may already have Lumo.','Recover access to your existing account.']:status==='refused'?['We couldn’t complete this check.','Get help to find your next step.']:['Let’s try that again.','Repeat this check. Your other steps stay saved.'];
    return `<div>${head('Identity status')}${title('',copy[0],copy[1])}<div class="card"><span class="pill">${status==='pending'?'In review':status==='linked'?'Existing account':'Needs attention'}</span><p class="small muted">Reference ${e(s.identityRef||'Identity check')}</p></div>${status==='pending'?sampleControl('identityResolve',[['pending','Keep pending'],['approved','Approve this sample check'],['attention','Needs attention']]):''}<div class="actions">${status==='pending'?button('Check status','L.onboarding.identityResolve()'):status==='linked'?button('Recover access',"L.go('recovery')"):status!=='refused'?button('Try again',"L.go('identity')") : ''}${button('Get help',"L.go('help',{returnTo:'identityResult',context:'Identity check'})",status==='refused'?'primary':'secondary')}${button('Save and leave','L.onboarding.leave()','text-btn')}</div></div>`;
  };
  L.views.campus = function () {
    return `<div>${head('Your university')}${campusNotice('campus')}${progress(3)}${title('','Where do you study?','At Legon or elsewhere, you can continue with your university and email.')}<form class="form" onsubmit="event.preventDefault();L.onboarding.checkCampus()">${universityFields()}<p class="small muted">Preview only. Use a sample email. Nothing is sent or verified.</p>${error}<div class="actions"><button class="primary" type="submit">Continue</button>${button('Save and leave','L.onboarding.leave()','text-btn')}</div></form></div>`;
  };
  // Keep old saved routes usable without a separate waitlist or campus gate.
  L.views.campusStatus = L.views.campus;
  L.views.pilotUnavailable = L.views.campus;
  L.views.campusInterest = L.views.campus;
  L.views.campusInterestSaved = function () {
    const i=setup().interest||{};
    return `<div>${head('Your university')}${title('','Continue your setup.','Your university can be added directly.')}<div class="card"><h2>${e(i.campus||L.state.profile.campus||'Your university')}</h2><p class="small muted">Any university is welcome in this preview.</p></div><div class="actions">${button('Continue setup','L.onboarding.next()')}${button('Edit university and email',"L.go('campus')",'text-btn')}</div></div>`;
  };
  L.views.pin = function () {
    const recovery=L.params.mode==='recovery';
    return `<div>${head(recovery?'Reset your PIN':'Secure your account')}${recovery?'':progress(4)}${title('',recovery?'Choose a new PIN.':'Six digits. Just for you.','You’ll use your PIN to sign in and approve payments.')}<form class="form" onsubmit="event.preventDefault();L.onboarding.pinNext()"><label class="field" for="newPin"><span>Six-digit PIN</span><input class="input code-input" id="newPin" name="new-pin" type="password" inputmode="numeric" maxlength="6" autocomplete="new-password" enterkeyhint="next" placeholder="••••••" aria-label="New six-digit PIN"></label>${error}<p class="small muted">Preview only. Choose a PIN you don’t use anywhere else.</p><div class="actions"><button class="primary" type="submit">Continue</button>${button('Save and leave','L.onboarding.leave()','text-btn')}</div></form></div>`;
  };
  L.views.confirmPin = function () {
    return `<div>${head('Confirm your PIN')}${title('','Once more, to be sure.','Enter the same six digits.')}<form class="form" onsubmit="event.preventDefault();L.onboarding.pinConfirm()"><label class="field" for="confirmPin"><span>Confirm PIN</span><input class="input code-input" id="confirmPin" name="confirm-pin" type="password" inputmode="numeric" maxlength="6" autocomplete="new-password" enterkeyhint="go" placeholder="••••••" aria-label="Confirm six-digit PIN"></label>${error}<div class="actions"><button class="primary" type="submit">Save PIN</button>${button('Choose a different PIN',`L.go('pin',{mode:'${L.params.mode==='recovery'?'recovery':'setup'}'})`,'text-btn')}</div></form></div>`;
  };
  L.views.accountReview = function () {
    return `<div>${head('Review your details')}${progress(5)}${title('','Ready when you are.','Check your details before you continue.')}<div class="card"><div class="summary-line"><span>Name</span><strong>${e(L.state.profile.name)}</strong></div><div class="summary-line"><span>Mobile number</span><strong>${e(phoneLabel(L.state.profile.phone))}</strong></div><div class="summary-line"><span>University</span><strong>${e(L.state.profile.campus||'Not added')}</strong></div><div class="summary-line"><span>Email</span><strong>${e(L.state.profile.email||'Not added')}</strong></div></div><details class="demo-options"><summary>Edit a detail</summary><div class="inline">${button('Phone',"L.onboarding.editCheck('phone')",'text-btn small')}${button('Identity',"L.onboarding.editCheck('identity')",'text-btn small')}${button('University',"L.onboarding.editCheck('campus')",'text-btn small')}</div></details><div class="inline">${button('Preview terms',"L.go('privacyNotice',{returnTo:'accountReview',section:'terms'})",'text-btn small')}${button('Privacy notice',"L.go('privacyNotice',{returnTo:'accountReview'})",'text-btn small')}</div><label class="check-row"><input id="accountAgree" type="checkbox" ${setup().reviewAgree?'checked':''} onchange="L.onboarding.reviewChoices()"><span>I accept the preview terms and privacy notice.</span></label><label class="check-row"><input id="productMessages" type="checkbox" ${setup().reviewMarketing?'checked':''} onchange="L.onboarding.reviewChoices()"><span>Product updates (optional).</span></label><p class="tiny muted">Preview account only. No real money or bank account is opened.</p>${sampleControl('accountOutcome',[['ready','Test account ready'],['pending','Application pending'],['more','More information needed'],['refused','Unable to open account']])}${error}<div class="actions">${button('Create account','L.onboarding.createAccount()')}</div></div>`;
  };
  L.views.applicationStatus = function () {
    const s=setup(), status=s.applicationStatus||'pending';
    const copy=status==='more'?['One detail needs a second look.','Check your university and email to continue this application.']:status==='refused'?['We couldn’t open your account.','Get help to understand the available review options.']:['Your application is in review.','Your details are saved. You can come back later.'];
    return `<div>${head('Application status')}${title('',copy[0],copy[1])}<div class="card"><span class="pill">${status==='more'?'More information':status==='refused'?'Not approved':'In review'}</span><p class="small muted">Reference ${e(s.applicationRef||'No application submitted')}</p></div>${status!=='refused'?sampleControl('applicationOutcome',[[status,'Keep current result'],['ready','Confirm test account ready'],['more','More information needed'],['refused','Unable to approve']]):''}<div class="actions">${status==='more'?button('Update university and email',"L.go('applicationCorrection')"):''}${status!=='refused'?button('Check status','L.onboarding.applicationCheck()',status==='more'?'secondary':'primary'):''}${button('Get help',"L.go('help',{returnTo:'applicationStatus',context:'Account application'})",status==='refused'?'primary':'text-btn')}${button('Save and leave','L.onboarding.leave()','text-btn')}</div></div>`;
  };
  L.views.applicationCorrection = function () { return `<div>${head('Update your application')}${campusNotice('correctCampus')}${title('','Check your details.','Your phone, identity check and PIN stay saved.')}<form class="form" onsubmit="event.preventDefault();L.onboarding.correctApplication()">${universityFields('correctCampus')}${error}<div class="actions"><button class="primary" type="submit">Save correction</button>${button('Back to application',"L.go('applicationStatus')",'text-btn')}</div></form></div>`; };
  L.views.accountReady = function () {
    if(!L.state.onboarded)return `<div>${title('','Complete your setup.','Your account will be created after approval.')}<div class="actions">${button('Continue setup','L.onboarding.next()')}</div></div>`;
    if(L.state.locked)return L.views.signin();
    L.ensureAccounts?.();
    return `<div>${title('','Your account has been created.','Add money to get started.')}<div class="actions">${button('Add money','L.beginFirstFunding()')}${button('Explore Home',"L.go('home')",'text-btn')}</div><p class="tiny muted">Preview account · No live bank account is opened</p></div>`;
  };
  L.views.setupProgress = function () {
    const s=setup();
    const rows=[['Mobile number',s.phoneConfirmed],['Identity',s.identityStatus==='approved'],['University',s.campusStatus==='approved'],['PIN',s.securitySaved],['Account',L.state.onboarded]];
    return `<div>${head('Your setup')}${title('','A little closer.','Continue from your first unfinished step.')}<div class="list">${rows.map(([name,done])=>`<div class="row"><div class="row-icon ${done?'accent':'soft'}">${L.icon(done?'check':'clock',22)}</div><div class="row-copy"><h3>${name}</h3></div><span class="small muted">${done?'Done':'To do'}</span></div>`).join('')}</div><div class="actions">${button('Continue setup','L.onboarding.next()')}${button('Save and leave','L.onboarding.leave()','text-btn')}</div></div>`;
  };
  L.views.signin = function () {
    O.captureAccessReturn();
    const lock=Math.max(L.authPolicy?.status()?.seconds||0,Math.max(0,Math.ceil(((setup().signinLock||0)-Date.now())/1000)));
    if(O.signinTimer)clearTimeout(O.signinTimer);O.signinTimer=setTimeout(O.updateSigninLock,0);
    return `<div>${head('Welcome back')}${title('','Good to see you.','Your money. Your space.')}<p class="notice small">This preview signs in only to an account saved in this browser. It cannot retrieve an account from another phone or browser.</p><form class="form" onsubmit="event.preventDefault();L.onboarding.signin()"><label class="field" for="signPhone"><span>Mobile number</span><input class="input" id="signPhone" name="username" type="tel" inputmode="tel" autocomplete="username" enterkeyhint="next" maxlength="18" placeholder="024 123 0123" value="${e(L.state.profile.phone||'')}"></label><label class="field" for="signPin"><span>PIN</span><input class="input code-input" id="signPin" name="current-password" type="password" inputmode="numeric" maxlength="6" autocomplete="current-password" enterkeyhint="go" placeholder="••••••" aria-label="Six-digit PIN"></label><div id="signinLock" class="warning" ${lock?'':'hidden'}>Too many attempts. Try again in <span id="signinLockSeconds">${lock}</span>s, or recover access.</div>${error}<div class="actions"><button id="signinButton" class="primary" type="submit" ${lock?'disabled':''}>Sign in</button>${button('Forgot PIN?',"L.onboarding.openRecovery('pin')",'text-btn')}${button('I no longer have this number',"L.onboarding.openRecovery('lost')",'text-btn')}</div></form>${L.testMode?'<p class="small muted">Sample account PIN: 123456. For a new account, use the PIN you chose.</p>':''}<div class="inline">${button('Back to Welcome',"L.go('welcome')",'text-btn')}${smallHelp('signin')}</div></div>`;
  };
  L.views.recovery = function () {
    O.captureAccessReturn();
    const r=setup().recovery;
    if(!L.state.profile.pin){
      const linked=setup().identityStatus==='linked';
      return `<div>${head('Recover access')}${title('',linked?'Your existing account is elsewhere.':'No account is saved here.','This preview cannot retrieve an account from another phone or browser.')}<div class="notice">No account provider is connected. A live service would locate the existing account and confirm your ownership before changing access.</div><div class="actions">${linked?button('Try the sample ownership check',"L.onboarding.recoveryStart('external')") :button('Back to Welcome',"L.go('welcome')")}${r?.externalPreview?button('Continue sample recovery','L.onboarding.resumeRecovery()','secondary'):''}${button('General help',"L.go('help',{returnTo:'recovery',context:'Access on another browser'})",'text-btn')}</div><p class="small muted">The sample check never creates, imports or changes an existing financial account.</p></div>`;
    }
    return `<div>${head('Recover access')}${title('','Let’s get you back in.','The same account. A fresh way in.')}<div class="list">${L.row('I forgot my PIN','Confirm your number and ownership.','lock',"L.onboarding.recoveryStart('pin')")}${L.row('I lost my phone or number','Keep your account with a new number.','phone',"L.onboarding.recoveryStart('lost')")}${r?L.row('Continue recovery','Pick up your saved request.','clock',"L.onboarding.resumeRecovery()"):''}</div>${error}<p class="small muted">Recovery checks are simulated in this preview.</p>${smallHelp('recovery')}</div>`;
  };
  L.views.recoveryReplacement = function () {
    return `<div>${head('Replace your number')}${title('','New number. Same Lumo.','Confirm a new number, then complete an ownership check.')}<div class="notice">Use a made-up number. This preview does not change a number with any provider.</div><div class="actions">${button('Enter new number',"L.go('phone',{purpose:'replacement'})")}${button('Get help',"L.go('help',{returnTo:'recoveryReplacement',context:'Lost phone recovery'})",'secondary')}${button('Leave for now','L.onboarding.leave()','text-btn')}</div></div>`;
  };
  L.views.recoveryOwnership = function () {
    return `<div>${head('Confirm ownership')}${title('','One more check.','Protecting your account takes more than a code.')}<div class="notice"><strong>Preview ownership check.</strong><p class="small">No identity documents or camera are used.</p></div>${sampleControl('recoveryOutcome',[['approved','Ownership confirmed'],['pending','Ownership review pending'],['attention','Unable to confirm']])}${error}<div class="actions">${button('Continue','L.onboarding.recoveryOwnership()')}${button('Leave for now','L.onboarding.leave()','text-btn')}</div></div>`;
  };
  L.views.recoveryStatus = function () {
    const r=setup().recovery||{}; const pending=r.status==='pending'||r.status==='checking';
    if(r.externalPreview&&r.status==='approved')return `<div>${head('Sample recovery complete')}${title('','Sample ownership check complete.','Your existing account was not loaded or changed.')}<div class="notice"><strong>Recovery reference ${e(r.ref)}</strong><p class="small">In a live service, confirmed ownership would restore access to your existing account. This browser preview ends the remote-account example here.</p></div><div class="actions">${button('Download recovery summary','L.onboarding.downloadRecoverySummary()')}${button('Explore a sample account',"L.go('ambassadorSample')",'secondary')}${button('Back to Welcome',"L.go('welcome')",'text-btn')}</div><p class="small muted">Give the summary to a Lumo team contact you have been provided. Nothing is sent automatically.</p></div>`;
    return `<div>${head('Recovery status')}${title('',pending?'Your recovery is in review.':'Let’s get you some help.',pending?'Your request is saved. You can come back later.':'We couldn’t confirm ownership. Get help with your next step.')}<div class="card"><span class="pill">${pending?'In review':'Needs attention'}</span><p class="small muted">Reference ${e(r.ref||'No recovery started')}</p></div>${pending?sampleControl('recoveryResolve',[['pending','Keep pending'],['approved','Confirm sample ownership'],['attention','Unable to confirm']]):''}${error}<div class="actions">${pending?button('Check status','L.onboarding.recoveryCheck()'):''}${button('Get help',"L.go('help',{returnTo:'recoveryStatus',context:'Access recovery'})",pending?'secondary':'primary')}${button('Leave for now','L.onboarding.leave()','text-btn')}</div></div>`;
  };
  O.downloadRecoverySummary=function(){
    const r=setup().recovery;if(!r?.externalPreview||r.status!=='approved')return;
    L.download('Lumo-Sample-Recovery-'+String(r.ref).replace(/[^A-Za-z0-9_-]/g,'')+'.txt',['LUMO SAMPLE RECOVERY SUMMARY','Reference: '+r.ref,'Result: Sample ownership check completed','No remote account was loaded. No PIN, phone number or financial account was changed.','This preview cannot retrieve an account created in another browser.','Share through a contact provided by the Lumo team. Nothing has been sent.'].join('\n'),'text/plain');
  };
  O.closePrivacy=function () {
    const requested=L.params.returnTo||L.params.from||'welcome',route=Object.hasOwn(L.views,requested)?requested:'welcome';
    L.go(route,route==='phone'?{purpose:['signup','resume','recovery','replacement'].includes(L.params.purpose)?L.params.purpose:'signup'}:{});
  };
  L.views.privacyNotice = function () {
    const section=L.params.section;
    return `<div>${head(section==='terms'?'Preview terms':'Your information')}${title('',section==='terms'?'Clear from the start.':'Your privacy matters.','This is an interactive preview, not a live financial service.')}<div class="notice">Use sample details and a PIN you don’t use elsewhere.</div><div class="stack"><details class="screen-explainer"><summary>What is saved</summary><p class="small muted">Setup, your test PIN, sample payments, plans and feedback stay in this browser. Other people using the same browser may see them. Never enter a real Ghana Card number, bank PIN or wallet PIN.</p></details><details class="screen-explainer"><summary>What is connected</summary><p class="small muted">No real bank account is opened. No SMS, identity check or payment provider is connected. QR scanning can use your camera with permission; images are processed on this device. Biometric approval is a demo. Service outcomes are simulated.</p></details><details class="screen-explainer"><summary>Remove your saved data</summary><p class="small muted">Clear this site’s data in your browser to remove this preview’s saved details. ${L.testMode?'You can also use Reset demo in the Test guide. ':''}Feedback export is optional.</p></details><details class="screen-explainer"><summary>Before Lumo goes live</summary><p class="small muted">Live provider disclosures, account terms, retention periods, legal rights and support contacts must be confirmed before real accounts or money can be used. This notice covers the preview only.</p></details></div><div class="actions">${button('Back','L.onboarding.closePrivacy()')}</div></div>`;
  };
  // Commit sensitive account/setup mutations as one durable change. Ordinary
  // drafts remain drafts; exports execute only after their own PIN verification.
  for(const name of ['restart','sendCode','resend','verifyCode','beginIdentity','identityCheck','identityResolve','checkCampus','confirmVerifiedDetails','pinConfirm','editCheck','reviewChoices','createAccount','correctApplication','applicationCheck','ready','signin','recoveryStart','recoveryOwnership','recoveryCheck']){
    const action=O[name];if(typeof action!=='function')continue;
    O[name]=function(...args){return L.accountChange(()=>action.apply(this,args),'Save account setup',{retryPin:name==='pinConfirm'});};
  }
  // One layout owner for dedicated setup and access screens.
  for (const route of ['setupChoice','phone','otp','identity','livecheck','identityResult','campus','campusStatus','campusInterest','campusInterestSaved','pilotUnavailable','pin','confirmPin','accountReview','applicationStatus','applicationCorrection','accountReady','setupProgress','signin','recovery','recoveryReplacement','recoveryOwnership','recoveryStatus','privacyNotice']) {
    const view=L.views[route];
    if(view)L.views[route]=()=>view().replace(/^<div>/,'<div class="onboarding-page">');
  }
})();
