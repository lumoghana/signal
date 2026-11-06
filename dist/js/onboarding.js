import { esc, icon } from './ui.js';
import {
  ONBOARDING_STEPS, LIVENESS_PROMPTS, SAMPLE_CARD_NUMBER,
  updateOnboardingField, completeOnboardingStep, recordSelfieCapture,
  resetLiveness, resetCameraCaptures, safeOnboardingStep, validateIdentityNumber,
  beginIdentityVerification, resolveIdentityVerification, cancelIdentityVerification,
  confirmIdentityDetails, attemptOnboardingCode, resendOnboardingCode, expireOnboardingCode, checkPendingIdentityVerification,
  setOnboardingLogin
} from './onboarding-model.js';
import { createLoginCredential, normalizeUsername, validUsername, validateLoginPassword } from './login-credentials.js';
import { createCameraController, cameraErrorMessage, releasePhoto } from './camera.js';
import { createVerificationAnimation } from './verification-animation.js';

// Camera photos and verification records stay in memory through the signup.
const runtimes = new WeakMap();
const runtimeFor = draft => {
  if (!runtimes.has(draft)) runtimes.set(draft, { controller: null, photos: { centre: null, turn: null, blink: null }, cameraState: 'idle', cameraError: '', verificationAnimation: null, verificationStage: 0, verificationAttemptId: null, verificationOutcome: 'success' });
  return runtimes.get(draft);
};
export function clearOnboardingMedia(draft) {
  const r = runtimes.get(draft);
  if (!r) return;
  r.controller?.dispose(); r.verificationAnimation?.dispose();
  Object.values(r.photos).forEach(photo => releasePhoto(photo));
  runtimes.delete(draft);
}
const routeFor = step => ({ section: 'onboarding', step });
const action = (label, name) => `<button type="button" class="button" data-onb-action="${name}">${label}</button>`;
const link = (label, name) => `<button type="button" class="onb-link" data-onb-action="${name}">${label}</button>`;
const field = (label, key, value, { type = 'text', placeholder = '', maxlength = 60, inputmode = '', autocomplete = 'off', className = '' } = {}) => `<label class="onb-field"><span>${label}</span><input class="input ${className}" data-onb-field="${key}" name="onb-${key}" type="${type}" value="${esc(value)}" placeholder="${esc(placeholder)}" maxlength="${maxlength}" ${inputmode ? `inputmode="${inputmode}"` : ''} autocomplete="${autocomplete}"></label>`;
const prompts = {
  centre: { label: 'Face forward', title: 'Face forward.', body: 'Find your frame, then tap below.', button: 'Take my first selfie' },
  turn: { label: 'Turn left', title: 'A little turn left.', body: 'Turn slightly, then tap below.', button: 'I’ve turned left' },
  blink: { label: 'Blink once', title: 'One little blink.', body: 'Look ahead, blink, then tap below.', button: 'I’ve blinked' }
};
const hasPhotos = (d, r) => d.selfieCaptured && d.capturedNumber === String(d.ghanaCardNumber || '').trim().toUpperCase() && LIVENESS_PROMPTS.every(key => r.photos[key]);
const selfiePhase = (d, r) => !hasPhotos(d, r) ? 'capture' : d.verificationStatus === 'success' && d.verificationRecord ? 'ready' : ['failed', 'pending', 'attention', 'already-linked'].includes(d.verificationStatus) ? d.verificationStatus : 'checking';
const birthDate = value => /^\d{4}-\d{2}-\d{2}$/.test(value || '') ? new Date(value + 'T12:00:00Z').toLocaleDateString('en-GH', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' }) : value || '';
const progressRows = d => LIVENESS_PROMPTS.map((key, index) => `<li data-selfie-progress="${key}" aria-label="${prompts[key].label}: ${d.liveness.completed.includes(key) ? 'captured' : d.liveness.completed.length === index ? 'next' : 'waiting'}" class="${d.liveness.completed.includes(key) ? 'done' : d.liveness.completed.length === index ? 'active' : ''}"><span>${d.liveness.completed.includes(key) ? icon('check', 12) : index + 1}</span>${prompts[key].label}</li>`).join('');
const photoReview = r => LIVENESS_PROMPTS.map(key => r.photos[key] ? `<figure><img src="${esc(r.photos[key].url)}" alt="Your captured selfie: ${prompts[key].label.toLowerCase()}"><figcaption>${prompts[key].label}</figcaption></figure>` : '').join('');
const privacyLine = () => `<div class="onb-privacy-line">${icon('lock', 12)}<span>ID and photos stay in memory.</span>${link('How this works', 'privacy-help')}</div>`;
const identityDemoOptions = () => `<details class="onb-demo-control"><summary>Try a demo result</summary>${['failure','pending','attention','already-linked'].map(outcome => `<button type="button" class="button ghost" data-onb-outcome="${outcome}">${({failure:'Unsuccessful check',pending:'Pending check',attention:'Details need attention','already-linked':'Identity already linked'})[outcome]}</button>`).join('')}</details>`;
const stages = ['Checking the card number', 'Reviewing the selfie check', 'Preparing your details'];

// Pure markup for visual checks. The live binder separately requires actual photos.
export function renderIdentityVerification(d, { stage = 0 } = {}) {
  if (d.verificationStatus === 'success' && d.verificationRecord) {
    const record = d.verificationRecord;
    return `<div class="onb-verification-panel onb-verification-success"><div class="onb-returned-head"><span class="onb-result-mark">${icon('check', 22)}</span><div><strong>Ghana Card check complete</strong><small>Sample details · Demo verification</small></div><button type="button" class="icon-button" data-onb-action="retake" aria-label="Retake my selfies">${icon('repeat', 18)}</button></div><dl class="onb-returned-details"><div><dt>Full name</dt><dd>${esc(record.fullName)}</dd></div><div><dt>Ghana Card number</dt><dd>${esc(record.cardNumber)}</dd></div><div><dt>Date of birth</dt><dd>${esc(birthDate(record.dateOfBirth))}</dd></div><div><dt>Nationality</dt><dd>${esc(record.nationality)}</dd></div><div><dt>Sex</dt><dd>${esc(record.sex)}</dd></div></dl><p class="onb-result-note">These sample details will be used for your demo accounts.</p></div>`;
  }
  if (['pending', 'attention', 'already-linked'].includes(d.verificationStatus)) {
    const state = d.verificationStatus;
    const content = {
      pending: ['clock', 'Still in the queue.', 'Your demo check is pending. No account is created until a successful result returns.'],
      attention: ['info', 'Let’s check one thing.', 'The sample record needs attention. Check your card number or retry your selfies.'],
      'already-linked': ['lock', 'You may already be here.', 'This sample identity is linked to an existing demo account. Recover access instead of opening another.']
    }[state];
    return `<div class="onb-verification-panel onb-verification-failed" role="status"><div class="onb-verification-orb failed" aria-hidden="true">${icon(content[0], 32)}</div><span class="onb-verification-tag">DEMO VERIFICATION</span><h2>${content[1]}</h2><p>${content[2]}</p>${state === 'pending' ? link('Simulate a confirmed result', 'resolve-pending') : ''}</div>`;
  }
  if (d.verificationStatus === 'failed') return `<div class="onb-verification-panel onb-verification-failed"><div class="onb-verification-orb failed" aria-hidden="true">${icon('repeat', 32)}</div><span class="onb-verification-tag">DEMO VERIFICATION</span><h2>One more try?</h2><p>The demo check didn’t go through. Your selfies are still here.</p><div class="onb-verification-retry-note">Retry the check, or go back and check the card number.</div></div>`;
  const stageIndex = Math.max(0, Math.min(2, Number(stage) || 0));
  return `<div class="onb-verification-panel onb-verification-checking" role="status" aria-live="polite"><div class="onb-verification-orb" aria-hidden="true"><span></span>${icon('card', 35)}</div><span class="onb-verification-tag">DEMO VERIFICATION</span><h2>Checking your<br>Ghana Card…</h2><p>Your moves are in. A quick check next.</p><ol class="onb-verification-stages">${stages.map((label, index) => `<li class="${index < stageIndex ? 'done' : index === stageIndex ? 'active' : ''}"><span>${index < stageIndex ? icon('check', 13) : index + 1}</span>${label}</li>`).join('')}</ol></div>`;
}

function selfieBody(d, r) {
  const phase = selfiePhase(d, r), prompt = prompts[LIVENESS_PROMPTS[d.liveness.completed.length]] || prompts.centre;
  return `<div data-selfie-capture ${phase === 'capture' ? '' : 'hidden'}>
    <div class="onb-camera-row"><div class="onb-camera-frame" data-camera-frame>
      <video class="onb-camera-video" muted autoplay playsinline aria-label="Live selfie camera preview"></video>
      <div class="onb-camera-placeholder"><span>${icon('eye', 30)}</span><strong>Your face<br>goes here.</strong></div><div class="onb-face-guide" aria-hidden="true"></div>
      <span class="onb-camera-chip" data-camera-chip>CAMERA OFF</span><button type="button" class="onb-camera-stop" data-onb-action="stop-camera" aria-label="Stop camera" hidden>${icon('close', 15)}</button>
    </div><div class="onb-camera-guidance"><span class="onb-selfie-count" data-selfie-count>${Math.min(3, d.liveness.completed.length + 1)} OF 3</span><h2 data-selfie-title aria-live="polite">${prompt.title}</h2><p data-selfie-instruction>${prompt.body}</p></div></div>
    <ol class="onb-selfie-progress" aria-label="Selfie progress">${progressRows(d)}</ol>
    <label class="onb-consent"><input type="checkbox" data-onb-field="consent" name="onb-consent" ${d.consent ? 'checked' : ''}><span>I agree to the live camera demo check.</span></label>
    <p class="onb-camera-status" role="status"></p></div>
    <div data-selfie-verification ${['checking', 'failed', 'pending', 'attention', 'already-linked'].includes(phase) ? '' : 'hidden'}>${['checking', 'failed', 'pending', 'attention', 'already-linked'].includes(phase) ? renderIdentityVerification(d, { stage: r.verificationStage }) : ''}</div>
    <div class="onb-selfie-ready" data-selfie-ready ${phase === 'ready' ? '' : 'hidden'}><span class="onb-complete-mark">${icon('check', 22)}</span><h2>All three. Nicely done.</h2><p>Your check is ready. Your details are up next.</p><div class="onb-selfie-review">${photoReview(r)}</div>${link('Retake my selfies', 'retake')}</div>${privacyLine()}`;
}
const chapter = step => ['name', 'phone', 'code'].includes(step) ? { label: 'Say hello', number: '01' } : ['card-number', 'selfie', 'identity-review'].includes(step) ? { label: 'Make it yours', number: '02' } : { label: 'Ready to roll', number: '03' };

export function renderOnboarding(ctx, route) {
  const d = ctx.draft.onboarding, step = route.step || 'name', index = ONBOARDING_STEPS.indexOf(step), r = runtimeFor(d), part = chapter(step);
  const firstName = String(d.name || '').trim().split(/\s+/)[0], name = esc(firstName);
  const companion = !['selfie', 'identity-review'].includes(step) ? '<span class="onb-lux-greeting" aria-hidden="true"><img src="/assets/lux-chat-2d.webp" width="88" height="96" alt=""></span>' : '';
  d.currentStep = step;
  let title = '', description = '', body = '', primary = 'Continue', primaryAction = 'next', secondary = '', phase = '';
  if (step === 'name') {
    title = 'Hey. I’m Lux.'; description = 'What do your people call you?';
    body = `${field('Your name', 'name', d.name, { placeholder: 'Your first name', maxlength: 40, autocomplete: 'given-name', className: 'onb-question-input' })}<p class="onb-name-preview" data-name-preview aria-live="polite">${d.name.trim() ? `Nice to meet you, ${esc(d.name.trim())}.` : 'Your next chapter starts here.'}</p>`;
    primary = 'That’s me';
  } else if (step === 'phone') {
    title = firstName ? `Nice to meet<br>you, ${name}.` : 'Let’s stay<br>in touch.'; description = 'What number should we use?';
    body = `${field('Demo mobile number', 'phone', d.phone, { type: 'tel', inputmode: 'tel', maxlength: 20, autocomplete: 'tel', className: 'onb-phone-input' })}<p class="onb-fine">Demo number for this prototype. No SMS is sent.</p>`;
    primary = 'Send my demo code';
  } else if (step === 'code') {
    title = 'Got the code?'; description = `For ${esc(d.phone)}. Use the sample below.`;
    body = field('Six-digit demo code', 'code', d.code, { placeholder: '000000', maxlength: 6, inputmode: 'numeric', autocomplete: 'one-time-code', className: 'onb-code-input' }) + `<p class="onb-demo-code">Your demo code is <strong>123456</strong>.</p><p class="onb-fine">Valid for five minutes · Five attempts</p><div class="onb-inline-links">${link('Use demo code', 'fill-code')}${link('Resend code', 'resend-code')}</div><details class="onb-demo-control"><summary>Try a demo scenario</summary>${link('Expire this code', 'expire-code')}</details>`;
    primary = 'That’s my number';
  } else if (step === 'card-number') {
    title = firstName ? `A quick ID check,<br>${name}.` : 'A quick ID check.'; description = 'Your Ghana Card number first. Then a little face time.';
    body = `${d.captureResumeNotice ? '<p class="onb-resume-note">Your ID and selfies aren’t saved. Let’s pick up here.</p>' : ''}<div class="onb-id-field"><label for="onb-ghana-card">Ghana Card number</label><input id="onb-ghana-card" class="input" data-onb-field="ghanaCardNumber" name="onb-ghanaCardNumber" value="${esc(d.ghanaCardNumber)}" placeholder="GHA-000000000-0" maxlength="15" autocomplete="off" autocapitalize="characters" spellcheck="false"></div>${link('Use demo Ghana Card number', 'fill-card')}<div class="onb-card-memory">${icon('lock', 16)}<span>Your number stays in memory for this signup.</span></div>`;
    primary = 'Let’s keep going';
  } else if (step === 'selfie') {
    phase = selfiePhase(d, r);
    title = phase === 'ready' ? 'Looking good.' : phase === 'failed' ? 'A little retry.' : phase === 'checking' ? 'You made the moves.' : 'A little face time.';
    description = phase === 'ready' ? 'Your selfie check is ready. Take a look at your details.' : phase === 'failed' ? 'Let’s finish your Ghana Card check.' : phase === 'checking' ? 'Now for your Ghana Card demo check.' : 'Face forward. A little turn. One blink. You’ve got this.';
    body = selfieBody(d, r);
    primary = phase === 'ready' ? 'See my details' : phase === 'failed' ? 'Try verification again' : phase === 'checking' ? 'Checking your Ghana Card…' : 'Start selfie check';
    primaryAction = phase === 'ready' ? 'next' : phase === 'failed' ? 'retry-verification' : phase === 'checking' ? 'verification-wait' : 'open-camera';
    if (phase === 'failed') secondary = link('Check my card number', 'details-mismatch');
    if (phase === 'pending') { title = 'Hang tight.'; description = 'Your check is pending. Your place is safe.'; primary = 'Check verification status'; primaryAction = 'check-pending'; }
    if (phase === 'attention') { title = 'A quick double-check.'; description = 'Let’s get the details right.'; primary = 'Check my card number'; primaryAction = 'details-mismatch'; secondary = link('Retry verification', 'retry-verification'); }
    if (phase === 'already-linked') { title = 'Welcome back, maybe.'; description = 'One person. One Lumo.'; primary = 'Recover existing demo account'; primaryAction = 'recover-account'; secondary = link('Check my card number', 'details-mismatch'); }
  } else if (step === 'identity-review') {
    title = 'Is this you?'; description = 'A quick look at your Ghana Card details. Then secure your Lumo.';
    body = renderIdentityVerification(d) + privacyLine(); primary = 'Yep, that’s me'; primaryAction = 'confirm-details'; secondary = link('Something’s not right', 'details-mismatch');
  } else if (step === 'login') {
    title = 'Your way back in.'; description = 'A username and password for signing in. Your transaction PIN comes next.';
    body = `<div class="onb-login-fields"><label class="onb-field"><span>Username</span><input class="input" data-onb-login="username" name="demo-username" value="${esc(d.login?.username || '')}" autocapitalize="none" spellcheck="false" autocomplete="off" maxlength="30" placeholder="e.g. ama.campus"></label><label class="onb-field"><span>Demo password</span><input class="input" data-onb-login="password" name="demo-password" type="password" autocomplete="off" maxlength="128" placeholder="At least 10 characters"></label><label class="onb-field"><span>Confirm demo password</span><input class="input" data-onb-login="confirm" name="demo-password-confirm" type="password" autocomplete="off" maxlength="128"></label></div><p class="onb-fine">${d.login ? 'Your password is set. Leave both password fields blank to keep it.' : 'Use a made-up password for this local prototype. Never use a real password.'}</p>${link('Use sample sign-in details', 'fill-login')}`;
  } else if (step === 'pin' || step === 'pin-confirm') {
    const confirming = step === 'pin-confirm';
    title = confirming ? 'One more time.' : 'Your money.<br>Your little lock.';
    description = confirming ? 'The same four digits to authorise money moves.' : 'Four digits for money approvals. Your password is for signing in.';
    body = `<div class="onb-pin-symbol" aria-hidden="true">${icon(confirming ? 'check' : 'lock', 28)}</div><div class="onb-pin-fields">${field(confirming ? 'Confirm demo transaction PIN' : 'Demo transaction PIN', confirming ? 'pinConfirm' : 'pin', confirming ? d.pinConfirm : d.pin, { type: 'password', maxlength: 4, inputmode: 'numeric', className: 'onb-pin-input' })}</div>${link('Use demo PIN 1234', 'fill-pin')}<p class="onb-fine">Keep your real PIN to yourself.</p>`;
    primary = confirming ? 'Secure my Lumo' : 'That’s my PIN';

  }
  const demo = step === 'selfie' ? 'LIVE CAMERA · DEMO VERIFICATION' : step === 'identity-review' ? 'SAMPLE DETAILS · DEMO VERIFICATION' : 'DEMO SIGNUP';
  return `<section class="onb-page onb-step-${step}" ${phase ? `data-identity-phase="${phase}"` : ''} aria-label="Lumo signup">
    <header class="onb-header"><button type="button" class="icon-button" data-onb-action="back" aria-label="Previous setup step">${icon('back', 21)}</button><div><span>${part.label}</span><small>${index + 1} of ${ONBOARDING_STEPS.length}</small></div><button type="button" class="icon-button" data-onb-action="close" aria-label="Save and exit signup">${icon('close', 20)}</button></header>
    <div class="onb-progress" role="progressbar" aria-valuemin="1" aria-valuemax="${ONBOARDING_STEPS.length}" aria-valuenow="${index + 1}" aria-label="Signup progress">${ONBOARDING_STEPS.map((_, i) => `<span class="${i <= index ? 'done' : ''} ${i === index ? 'current' : ''}"></span>`).join('')}</div>
    <div class="onb-main"><div class="onb-simulation"><span>${demo}</span>${d.preview ? '<small>Account preview</small>' : ''}</div><div class="onb-welcome-heading"><div class="onb-heading-copy"><h1>${title}</h1><p class="onb-description">${description}</p></div>${companion}</div><form id="onb-form" autocomplete="off">${body}<p class="onb-error error" id="onb-error" role="alert"></p></form></div>
    <footer class="onb-footer">${action(primary, primaryAction)}${secondary}</footer>
  </section>`;
}

export function bindOnboarding(ctx, route) {
  const root = ctx.$('.onb-page');
  if (!root) return () => {};
  const d = ctx.draft.onboarding, step = route.step || 'name', r = runtimeFor(d), isSelfie = step === 'selfie', isReview = step === 'identity-review';
  let alive = true, busy = false, attempt = 0, lastPhase = isSelfie ? selfiePhase(d, r) : '';
  const current = () => alive && root.isConnected && runtimes.get(d) === r && ctx.draft.onboarding === d && ctx.route.section === 'onboarding' && ctx.route.step === step;
  const visible = () => current() && document.visibilityState !== 'hidden';
  const persist = () => ctx.saveDraft?.();
  const error = message => { const el = root.querySelector('#onb-error'); if (el) el.textContent = message || ''; };
  const discardPhotos = () => { for (const key of LIVENESS_PROMPTS) { releasePhoto(r.photos[key]); r.photos[key] = null; } };
  const captureInputs = () => {
    if (!current()) return;
    root.querySelectorAll('[data-onb-field]').forEach(input => updateOnboardingField(d, input.dataset.onbField, input.type === 'checkbox' ? input.checked : input.value));
  };
  ctx.setCapture?.(captureInputs);
  const setBusy = value => {
    busy = value;
    const checking = isSelfie && d.verificationStatus === 'checking';
    root.querySelectorAll('[data-onb-action]').forEach(button => { if (!['back', 'close', 'stop-camera'].includes(button.dataset.onbAction)) button.disabled = value || checking; });
    root.querySelectorAll('[data-onb-field],[data-onb-login]').forEach(input => { input.disabled = value || checking; });
  };
  const syncSelfie = () => {
    if (!current() || !isSelfie) return;
    const active = !!r.controller?.active, starting = r.cameraState === 'starting', phase = selfiePhase(d, r), checking = phase === 'checking';
    const prompt = prompts[LIVENESS_PROMPTS[d.liveness.completed.length]] || prompts.centre;
    root.dataset.identityPhase = phase;
    root.querySelector('[data-selfie-capture]').hidden = phase !== 'capture';
    const verification = root.querySelector('[data-selfie-verification]'); verification.hidden = !['checking', 'failed', 'pending', 'attention', 'already-linked'].includes(phase);
    if (['checking', 'failed', 'pending', 'attention', 'already-linked'].includes(phase)) verification.innerHTML = renderIdentityVerification(d, { stage: r.verificationStage });
    root.querySelector('[data-selfie-ready]').hidden = phase !== 'ready';
    root.querySelector('.onb-selfie-review').innerHTML = photoReview(r);
    root.querySelector('h1').innerHTML = phase === 'ready' ? 'Looking good.' : phase === 'failed' ? 'A little retry.' : checking ? 'You made the moves.' : 'A little face time.';
    root.querySelector('.onb-description').textContent = phase === 'ready' ? 'Your selfie check is ready. Take a look at your details.' : phase === 'failed' ? 'Let’s finish your Ghana Card check.' : checking ? 'Now for your Ghana Card demo check.' : 'Face forward. A little turn. One blink. You’ve got this.';
    if (phase !== lastPhase) { root.querySelector('.onb-main').scrollTop = 0; lastPhase = phase; }
    root.querySelector('[data-camera-frame]').classList.toggle('is-live', active);
    const placeholder = root.querySelector('.onb-camera-placeholder'); placeholder.hidden = active;
    placeholder.innerHTML = starting ? '<i class="onb-spinner"></i><strong>Opening camera…</strong><small>Allow access in your browser.</small>' : `<span>${icon('eye', 30)}</span><strong>${r.cameraError ? 'Let’s try again.' : 'Your face<br>goes here.'}</strong>`;
    root.querySelector('[data-camera-chip]').textContent = active ? 'LIVE CAMERA' : starting ? 'CONNECTING' : 'CAMERA OFF';
    const stop = root.querySelector('[data-onb-action="stop-camera"]'); stop.hidden = !(active || starting); stop.disabled = false;
    root.querySelector('[data-selfie-count]').textContent = `${Math.min(3, d.liveness.completed.length + 1)} OF 3`;
    root.querySelector('[data-selfie-title]').textContent = prompt.title;
    root.querySelector('[data-selfie-instruction]').textContent = prompt.body;
    root.querySelector('.onb-selfie-progress').innerHTML = progressRows(d);
    const status = root.querySelector('.onb-camera-status');
    status.textContent = r.cameraError || (starting ? 'Allow camera access in your browser.' : busy ? 'Taking your selfie…' : !active && d.liveness.completed.length ? 'Resume the camera for your next move.' : '');
    status.classList.toggle('is-error', !!r.cameraError);
    const primary = root.querySelector('.onb-footer>.button');
    primary.dataset.onbAction = phase === 'ready' ? 'next' : phase === 'failed' ? 'retry-verification' : checking ? 'verification-wait' : active ? 'capture-selfie' : 'open-camera';
    primary.textContent = phase === 'ready' ? 'See my details' : phase === 'failed' ? 'Try verification again' : checking ? 'Checking your Ghana Card…' : starting ? 'Opening camera…' : busy ? 'Taking selfie…' : active ? prompt.button : r.cameraError ? 'Try camera again' : d.liveness.completed.length ? 'Resume selfie check' : 'Start selfie check';
    if (phase === 'pending') { root.querySelector('h1').textContent = 'Hang tight.'; root.querySelector('.onb-description').textContent = 'Your check is pending. Your place is safe.'; primary.dataset.onbAction = 'check-pending'; primary.textContent = 'Check verification status'; }
    if (phase === 'attention') { root.querySelector('h1').textContent = 'A quick double-check.'; primary.dataset.onbAction = 'details-mismatch'; primary.textContent = 'Check my card number'; }
    if (phase === 'already-linked') { root.querySelector('h1').textContent = 'Welcome back, maybe.'; primary.dataset.onbAction = 'recover-account'; primary.textContent = 'Recover existing demo account'; }
    primary.disabled = busy || starting || checking;
    let mismatch = root.querySelector('.onb-footer [data-onb-action="details-mismatch"]');
    if (phase === 'failed' && !mismatch) { root.querySelector('.onb-footer').insertAdjacentHTML('beforeend', link('Check my card number', 'details-mismatch')); mismatch = root.querySelector('.onb-footer [data-onb-action="details-mismatch"]'); }
    if (mismatch) { mismatch.hidden = phase !== 'failed'; mismatch.disabled = busy || checking; }
    root.querySelectorAll('[data-onb-field]').forEach(input => { input.disabled = busy || checking; });
    root.querySelector('[data-onb-action="privacy-help"]').disabled = busy || checking;
  };
  const stopVerification = () => {
    r.verificationAnimation?.cancel();
    if (d.verificationStatus === 'checking') cancelIdentityVerification(d, r.verificationAttemptId ?? undefined);
    r.verificationAttemptId = null;
  };
  const stopCamera = ({ update = true } = {}) => {
    attempt += 1; r.controller?.stop(); r.cameraState = 'idle';
    if (current()) { setBusy(false); if (update) syncSelfie(); }
  };
  // Metadata cannot substitute for actual snapshots held by this signup.
  if ((isSelfie && (d.liveness.completed.some(key => !r.photos[key]) || (d.liveness.completed.length && d.capturedNumber !== String(d.ghanaCardNumber || '').trim().toUpperCase()))) || (isReview && (!hasPhotos(d, r) || d.verificationStatus !== 'success' || !d.verificationRecord))) {
    discardPhotos(); resetCameraCaptures(d); persist();
    ctx.go(routeFor(safeOnboardingStep(d, 'card-number')), { replace: true });
    return () => { alive = false; };
  }
  if (isSelfie) {
    r.controller?.dispose(); r.cameraState = 'idle'; r.cameraError = '';
    r.controller = createCameraController({ onEnded: failure => { if (!current()) return; attempt += 1; r.cameraState = 'idle'; r.cameraError = cameraErrorMessage(failure); setBusy(false); syncSelfie(); } });
  }
  const controller = r.controller;
  const finishSelfie = () => {
    if (!visible() || !hasPhotos(d, r) || d.verificationStatus !== 'success') return false;
    const result = completeOnboardingStep(d, 'selfie');
    if (!result.ok) { error(result.message); return false; }
    persist(); ctx.go(routeFor('identity-review')); return true;
  };
  const startVerification = () => {
    if (busy || !visible() || !isSelfie || !hasPhotos(d, r) || d.verificationStatus === 'success') return;
    stopCamera({ update: false }); stopVerification();
    const result = beginIdentityVerification(d);
    if (!result.ok) { discardPhotos(); resetLiveness(d); error(result.message); persist(); syncSelfie(); return; }
    r.verificationAttemptId = result.attemptId; r.verificationStage = 0;
    error(''); persist(); syncSelfie(); r.verificationAnimation.start();
  };
  if (isSelfie) {
    r.verificationAnimation?.dispose();
    r.verificationAnimation = createVerificationAnimation({
      onStage: stage => { if (!visible()) { stopVerification(); return; } r.verificationStage = stage; syncSelfie(); },
      onComplete: () => {
        if (!visible() || !hasPhotos(d, r)) { stopVerification(); return; }
        const result = resolveIdentityVerification(d, { outcome: r.verificationOutcome === 'failure' ? 'failed' : r.verificationOutcome, attemptId: r.verificationAttemptId });
        r.verificationAttemptId = null; r.verificationOutcome = 'success';
        if (!result.ok) { discardPhotos(); resetLiveness(d); error(result.message); }
        persist();
        if (result.ok && result.success && finishSelfie()) return;
        syncSelfie(); const heading = root.querySelector('h1'); heading.tabIndex = -1; heading.focus({ preventScroll: true });
      }
    });
  }
  const animation = r.verificationAnimation;
  const openCamera = async () => {
    if (busy || !visible() || !isSelfie || hasPhotos(d, r)) return;
    captureInputs();
    const invalidNumber = validateIdentityNumber(d.ghanaCardNumber);
    if (invalidNumber) { error(invalidNumber); ctx.go(routeFor('card-number')); return; }
    if (!d.consent) { error('Tick the camera check agreement, then you’re ready.'); return; }
    const token = ++attempt; r.cameraState = 'starting'; r.cameraError = ''; error(''); setBusy(true); syncSelfie();
    try {
      await controller.start(root.querySelector('video'), { facingMode: 'user' });
      if (!visible() || token !== attempt) return;
      r.cameraState = 'live'; setBusy(false); syncSelfie();
    } catch (failure) { if (!current() || token !== attempt) return; r.cameraState = 'idle'; r.cameraError = cameraErrorMessage(failure); setBusy(false); syncSelfie(); }
  };
  const takeSelfie = async () => {
    if (busy || !visible() || !controller?.active) return;
    const key = LIVENESS_PROMPTS[d.liveness.completed.length]; if (!key) return;
    const token = ++attempt; r.cameraError = ''; error(''); setBusy(true); syncSelfie();
    try {
      const photo = await controller.capture({ aspectRatio: .75, maxDimension: 1600, quality: .88 });
      if (!visible() || token !== attempt) { releasePhoto(photo); return; }
      const result = recordSelfieCapture(d, key);
      if (!result.ok) { releasePhoto(photo); throw new Error(result.message); }
      releasePhoto(r.photos[key]); r.photos[key] = photo;
      if (hasPhotos(d, r)) { controller.stop(); r.cameraState = 'idle'; }
      setBusy(false); persist(); if (hasPhotos(d, r)) startVerification(); else syncSelfie();
    } catch (failure) { if (!visible() || token !== attempt) return; r.cameraError = failure.name === 'Error' ? failure.message : cameraErrorMessage(failure); setBusy(false); syncSelfie(); }
  };
  const advance = async () => {
    if (busy) return;
    captureInputs();
    if (isSelfie) { if (!hasPhotos(d, r)) return error('Take all three selfies before continuing.'); return finishSelfie(); }
    if (isReview && !hasPhotos(d, r)) return error('Your photos are no longer here. Retake the check to continue.');
    if (step === 'code') { const attempt = attemptOnboardingCode(d); persist(); if (!attempt.ok) { error(attempt.message); return; } }
    if (step === 'login') {
      const username = normalizeUsername(root.querySelector('[data-onb-login="username"]').value), password = root.querySelector('[data-onb-login="password"]').value, confirm = root.querySelector('[data-onb-login="confirm"]').value;
      if (!validUsername(username)) return error('Choose a username with 3–30 letters, numbers, dots, underscores or hyphens.');
      if (!(d.login?.username === username && !password && !confirm)) {
        const invalid = validateLoginPassword(password); if (invalid) return error(invalid);
        if (password !== confirm) return error('Those demo passwords don’t match yet.');
        setBusy(true);
        try {
          const credential = await createLoginCredential(password);
          if (!current()) return;
          const saved = setOnboardingLogin(d, { username, credential }); if (!saved.ok) return error(saved.message);
          root.querySelector('[data-onb-login="password"]').value = ''; root.querySelector('[data-onb-login="confirm"]').value = '';
        } catch { return error('Couldn’t prepare sign-in on this browser. Please try again.'); }
        finally { if (current()) setBusy(false); }
      }
    }
    const result = completeOnboardingStep(d, step); if (!result.ok) { error(result.message); return; }
    stopCamera({ update: false }); persist();
    if (step === 'pin-confirm') { setBusy(true); ctx.completeOnboarding(); } else ctx.go(routeFor(result.next));
  };
  const confirmDetails = () => {
    if (busy || !visible() || !isReview || !hasPhotos(d, r)) return;
    const result = confirmIdentityDetails(d); if (!result.ok) return error(result.message);
    advance();
  };
  const resumeVerification = () => { if (visible() && isSelfie && hasPhotos(d, r) && ['idle', 'checking'].includes(d.verificationStatus)) startVerification(); else syncSelfie(); };
  const showPrivacy = () => {
    stopVerification(); stopCamera(); persist();
    ctx.sheet(`<h2>Your check. Your control.</h2><div class="onb-sheet-copy"><p>Your Ghana Card number has its own page. Here, allow the front camera once and follow the three selfie prompts.</p><p>After the selfies, a short verification animation returns sample details on a separate page. Confirm them before creating your PIN.</p><p>The camera and photos are real. Verification, returned identity details and liveness checks are simulated. No movement detection, face matching or NIA lookup runs here.</p><p>Your ID number, returned record and photos stay only in memory. They are never uploaded or saved. They are removed when you leave, reload or finish signup. The microphone stays off.</p></div><button type="button" class="button" data-onb-sheet="done">Got it</button>${isSelfie ? identityDemoOptions() : ''}`, el => {
      el.querySelector('[data-onb-sheet="done"]').onclick = () => { ctx.closeSheet(); resumeVerification(); };
      el.querySelectorAll('[data-onb-outcome]').forEach(button => { button.onclick = () => { r.verificationOutcome = button.dataset.onbOutcome; if (hasPhotos(d, r)) cancelIdentityVerification(d); ctx.closeSheet(); if (hasPhotos(d, r)) startVerification(); else ctx.toast('The next check will use your selected demo scenario. No real verification runs.'); }; });
    }, { onClose: resumeVerification });
  };
  const close = () => {
    stopVerification(); stopCamera(); captureInputs(); persist();
    ctx.sheet(`<h2>${d.preview ? 'Back to your account?' : 'Pick this up later?'}</h2><p>Your name and phone number stay here. Your ID, returned record and selfies are removed when you leave.</p><button type="button" class="button" data-onb-sheet="keep">Keep going</button><button type="button" class="button secondary" data-onb-sheet="exit">${d.preview ? 'Return to my account' : 'Save & exit'}</button>`, el => {
      el.querySelector('[data-onb-sheet="keep"]').onclick = () => { ctx.closeSheet(); resumeVerification(); };
      el.querySelector('[data-onb-sheet="exit"]').onclick = () => { ctx.closeSheet(); ctx.exitOnboarding(); };
    }, { onClose: resumeVerification });
  };
  const resetCheck = ({ clearNumber = false } = {}) => {
    stopVerification(); stopCamera({ update: false }); discardPhotos(); resetLiveness(d);
    if (clearNumber) updateOnboardingField(d, 'ghanaCardNumber', '');
    const input = root.querySelector('[data-onb-field="ghanaCardNumber"]'); if (input && clearNumber) input.value = '';
    r.verificationOutcome = 'success'; r.cameraError = ''; error(''); persist();
    if (clearNumber) ctx.go(routeFor('card-number'));
    else if (isReview) ctx.go(routeFor('selfie'));
    else syncSelfie();
  };
  root.querySelectorAll('[data-onb-field]').forEach(input => input.addEventListener(input.type === 'checkbox' ? 'change' : 'input', () => {
    const key = input.dataset.onbField, before = d[key]; updateOnboardingField(d, key, input.type === 'checkbox' ? input.checked : input.value);
    if (before !== d[key] && (key === 'ghanaCardNumber' || key === 'consent' && !input.checked || key === 'phone' && !d.phoneVerified)) { stopVerification(); stopCamera({ update: false }); discardPhotos(); resetLiveness(d); }
    if (key === 'name') { const preview = root.querySelector('[data-name-preview]'); if (preview) preview.textContent = d.name.trim() ? `Nice to meet you, ${d.name.trim()}.` : 'Your next chapter starts here.'; }
    error(''); persist(); syncSelfie();
  }));
  root.querySelector('#onb-form').addEventListener('submit', event => { event.preventDefault(); if (!isSelfie && !isReview) advance(); });
  root.querySelectorAll('input:not([type="checkbox"])').forEach(input => input.addEventListener('keydown', event => {
    if (event.key !== 'Enter') return; event.preventDefault();
    if (!isSelfie && !isReview) advance();
  }));
  root.addEventListener('click', event => {
    const button = event.target.closest('[data-onb-action]'); if (!button || !current() || button.disabled) return;
    const name = button.dataset.onbAction;
    if (name === 'back') { stopVerification(); stopCamera({ update: false }); captureInputs(); persist(); ctx.back(); }
    else if (name === 'close') close();
    else if (name === 'stop-camera') stopCamera();
    else if (busy) return;
    else if (name === 'next') advance();
    else if (name === 'confirm-details') confirmDetails();
    else if (name === 'retry-verification') startVerification();
    else if (name === 'details-mismatch') resetCheck({ clearNumber: true });
    else if (name === 'open-camera') openCamera();
    else if (name === 'capture-selfie') takeSelfie();
    else if (name === 'retake') resetCheck();
    else if (name === 'fill-card') { const changed = d.ghanaCardNumber !== SAMPLE_CARD_NUMBER; updateOnboardingField(d, 'ghanaCardNumber', SAMPLE_CARD_NUMBER); root.querySelector('[data-onb-field="ghanaCardNumber"]').value = SAMPLE_CARD_NUMBER; if (changed) { stopVerification(); stopCamera({ update: false }); discardPhotos(); } error(''); persist(); }
    else if (name === 'fill-code') { updateOnboardingField(d, 'code', '123456'); root.querySelector('[data-onb-field="code"]').value = d.code; error(''); persist(); }
    else if (name === 'resend-code') { const result = resendOnboardingCode(d); if (!result.ok) return error(result.message); root.querySelector('[data-onb-field="code"]').value = ''; error(''); persist(); ctx.toast(result.message); }
    else if (name === 'expire-code') { const result = expireOnboardingCode(d); error(result.message); persist(); }
    else if (name === 'check-pending' || name === 'resolve-pending') { const result = checkPendingIdentityVerification(d, { outcome: name === 'resolve-pending' ? 'success' : 'pending' }); if (!result.ok) return error(result.message); persist(); if (result.success && finishSelfie()) return; syncSelfie(); ctx.toast(result.message); }
    else if (name === 'recover-account') { stopCamera({ update: false }); clearOnboardingMedia(d); resetCameraCaptures(d); persist(); ctx.go({section:'life', page:'account-recovery'}); }
    else if (name === 'fill-pin') { const key = step === 'pin-confirm' ? 'pinConfirm' : 'pin'; updateOnboardingField(d, key, '1234'); root.querySelector('[data-onb-field="' + key + '"]').value = '1234'; error(''); persist(); }
    else if (name === 'fill-login') { root.querySelector('[data-onb-login="username"]').value = 'ama.campus'; root.querySelector('[data-onb-login="password"]').value = 'CampusDemo!26'; root.querySelector('[data-onb-login="confirm"]').value = 'CampusDemo!26'; error('Sample only: ama.campus / CampusDemo!26'); }
    else if (name === 'privacy-help') showPrivacy();
  });
  const onVisibility = () => { if (document.visibilityState === 'hidden') { stopVerification(); stopCamera({ update: false }); } else resumeVerification(); };
  const onPageHide = () => { attempt += 1; clearOnboardingMedia(d); resetCameraCaptures(d); persist(); };
  const onPageShow = event => { if (event.persisted && alive && root.isConnected && ctx.draft.onboarding === d && ctx.route.section === 'onboarding') ctx.go(routeFor(safeOnboardingStep(d, ctx.route.step)), { replace: true }); };
  document.addEventListener('visibilitychange', onVisibility); window.addEventListener('pagehide', onPageHide); window.addEventListener('pageshow', onPageShow);
  if (isSelfie && hasPhotos(d, r) && ['idle', 'checking'].includes(d.verificationStatus)) startVerification(); else syncSelfie();
  return () => {
    alive = false; attempt += 1; stopVerification(); animation?.dispose();
    if (r.verificationAnimation === animation) r.verificationAnimation = null;
    controller?.dispose(); if (r.controller === controller) r.controller = null; r.cameraState = 'idle';
    document.removeEventListener('visibilitychange', onVisibility); window.removeEventListener('pagehide', onPageHide); window.removeEventListener('pageshow', onPageShow);
  };
}
