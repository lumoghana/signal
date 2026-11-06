import { esc, cash, icon, field } from './ui.js';
import { hasBoxProtection, protectionSummary, getPartnerRequestView, getBoxSupportRequestView, validatePartnerDetails } from './box-protection.js';

// These views simulate partner and support roles. No SMS or support case leaves this browser.
const sessions = new WeakMap();
const uid = () => `box-ui-${globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(36).slice(2)}`}`;
const amountOf = value => /^\d+(?:\.\d{1,2})?$/.test(String(value || '').trim()) ? Math.round(Number(value) * 100) : NaN;
const errorBox = '<p class="error bp-error" role="alert"></p>';
const note = text => `<p class="bp-note">${esc(text)}</p>`;
const localNote = '<p class="bp-demo-note">Local demo · No SMS, calls or requests are sent.</p>';
const button = (text, action, secondary = false) => `<button type="button" class="button${secondary ? ' secondary' : ''}" data-bp="${action}">${esc(text)}</button>`;
const heading = (title, subtitle = '') => `<div class="bp-heading"><span class="bp-symbol">${icon('users', 24)}</span><p class="eyebrow">Accountability partner</p><h2>${esc(title)}</h2>${subtitle ? `<p>${esc(subtitle)}</p>` : ''}</div>`;
const kindLabel = request => request.kind === 'withdrawal' ? 'Move back to Everyday' : request.kind === 'change-partner' ? 'Change accountability partner' : 'Remove partner protection';
const isOpen = request => request && ['pending', 'code-issued', 'support-pending', 'approved'].includes(request.status);
const requestAt = (box, id) => (box.protectionRequests || []).find(request => request.id === id);
const phoneLabel = phone => String(phone || '').replace(/\s+/g, '');

function start(ctx, box) {
  const state = ctx.state, origin = ctx.route;
  if (!sessions.has(state)) sessions.set(state, new Map());
  const records = sessions.get(state), token = {}, draft = (ctx.draft.boxProtection ||= {})[box.id] ||= {};
  records.set(box.id, token);
  let epoch = 0, done = false;
  const valid = () => !done && ctx.state === state && records.get(box.id) === token && ctx.state.boxes?.find(value => value.id === box.id) === box && (!origin || ctx.route === origin && ctx.route.section === 'boxes' && ['detail', 'edit'].includes(ctx.route.page) && ctx.route.id === box.id);
  const act = (type, payload = {}, sheet) => {
    if (!valid()) return null;
    const result = ctx.act(type, { boxId: box.id, ...payload });
    if (!result?.ok) {
      const node = sheet?.querySelector('.bp-error');
      if (node) node.textContent = result?.message || 'Let’s check that step.';
      else ctx.toast?.(result?.message || 'Let’s check that step.');
      return null;
    }
    return result;
  };
  const show = (html, bind) => {
    if (!valid()) return;
    const version = ++epoch;
    ctx.sheet(`<div class="box-protection-sheet">${html}${localNote}</div>`, sheet => {
      const current = () => valid() && version === epoch && sheet.isConnected !== false;
      const on = (action, callback) => sheet.querySelector(`[data-bp="${action}"]`)?.addEventListener('click', event => { if (current()) callback(event, sheet); });
      bind?.(sheet, on, current);
    });
  };
  const finish = message => {
    if (!valid()) return;
    done = true; epoch++; ctx.closeSheet(); ctx.saveDraft?.(); ctx.refresh(); if (message) ctx.toast?.(message);
  };
  const auth = (title, callback, onCancel) => {
    if (!valid()) return;
    const version = ++epoch, revision = box.protection?.revision;
    ctx.auth({ title, onCancel: () => { if (valid() && version === epoch) onCancel?.(); }, onSuccess: () => {
      if (!valid() || version !== epoch || box.protection?.revision !== revision) return;
      epoch++; callback(ctx.state.settings?.pin || '1234');
    } });
  };
  return { ctx, box, draft, valid, act, show, finish, auth, save: () => ctx.saveDraft?.() };
}

function ownerRequest(flow, request, message = '', feedbackError = false) {
  const { box, draft, act, show, auth, finish, valid } = flow;
  if (!valid() || !request) return;
  request = requestAt(box, request.id) || request;
  const requestId = request.id, operation = kindLabel(request), expired = ['approved', 'code-issued'].includes(request.status) && request.expiresAt && Date.parse(request.expiresAt) <= Date.now(), approved = request.status === 'approved' && !expired;
  const statusText = ({ pending: 'Waiting for a fresh partner code.', 'code-issued': 'Your partner has a code for this request.', 'support-pending': 'Support review requested. Nothing has been unlocked.', approved: 'This request has approval. Your PIN is still needed.', denied: 'This request was declined. Your money stays protected.', expired: 'This request expired. Your money stays protected.', locked: 'Too many incorrect codes. Start a fresh request or use verified support.', cancelled: 'Request cancelled. Your money stays protected.', superseded: 'A newer request replaced this one.' })[expired ? 'expired' : request.status] || 'Your protection stays in place.';
  const terminal = !isOpen(request) || expired, personalLock = approved && request.kind === 'withdrawal' && box.locked;
  show(heading(operation, box.name) + `<div class="bp-request-summary"><span>${esc(operation)}</span>${request.kind === 'withdrawal' ? `<strong>${cash(request.amount)}</strong>` : request.kind === 'change-partner' ? `<strong>${esc(request.partner?.name || request.newPartner?.name || 'New partner')}</strong>` : `<strong>${icon('unlock', 27)}</strong>`}<p>${esc(statusText)}</p></div>` +
    (approved ? note(`Approved by ${['support', 'verified-support'].includes(request.approvedBy) ? 'verified support' : 'your partner'}. This applies only to this exact request.`) + errorBox + (personalLock ? note('Your goal lock is still on. Unlock it in Saving options first. Partner protection stays on.') + button('Back to Money Box', 'goal-lock') : button(request.kind === 'withdrawal' ? 'Confirm transfer with PIN' : 'Confirm change with PIN', 'pin')) : terminal ? errorBox + button('Start a fresh request', 'restart') : request.status === 'support-pending' ? note('A support request alone cannot release money or remove protection. Verification and recorded approval must happen first.') + errorBox + button('Try verified support view', 'support-view', true) : `<form data-bp-code-form class="form-stack"><label class="field"><span>Code from your partner</span><input class="input bp-code-input" name="partnerCode" inputmode="numeric" autocomplete="one-time-code" maxlength="6" pattern="[0-9]{6}" value="${esc(draft.code || '')}" placeholder="6-digit code" required></label>${errorBox}<button type="submit" class="button">Check code</button></form>${['active', 'invited'].includes(box.protection?.status) ? button('Try the partner’s view', 'partner-view', true) : ''}${button('Ask Lumo support', 'support', true)}`) +
    (message ? `<p class="bp-feedback${feedbackError ? ' is-error' : ''}" role="status">${esc(message)}</p>` : '') + (isOpen(request) ? button('Cancel this request', 'cancel', true) : button('Back to protection', 'manage', true)) + note('A code never moves money by itself. Your partner cannot access or spend from your account.'), (sheet, on, current) => {
      const input = sheet.querySelector('[name="partnerCode"]');
      input?.addEventListener('input', () => { if (current()) { draft.code = input.value.replace(/\D/g, '').slice(0, 6); flow.save(); } });
      sheet.querySelector('[data-bp-code-form]')?.addEventListener('submit', event => {
        event.preventDefault(); if (!current()) return;
        const result = act('verifyBoxPartnerCode', { requestId, code: input.value.trim() }, sheet);
        if (!result) return;
        draft.code = ''; flow.save();
        // Wrong/expired codes intentionally return ok:true so attempts persist.
        ownerRequest(flow, requestAt(box, requestId), result.authorized === true ? 'Code checked. You can confirm this request with your PIN.' : result.message, result.authorized !== true);
      });
      on('partner-view', () => partnerRequest(flow, requestAt(box, requestId)));
      on('support', () => { if (act('requestBoxSupportReview', { requestId }, sheet)) ownerRequest(flow, requestAt(box, requestId)); });
      on('support-view', () => supportRequest(flow, requestAt(box, requestId)));
      on('cancel', () => { if (act('cancelBoxRelease', { requestId }, sheet)) { draft.code = ''; flow.save(); manage(flow, 'Request cancelled. Nothing moved.'); } });
      on('manage', () => manage(flow));
      on('goal-lock', () => finish('Choose Unlock in Saving options. Partner protection stays on.'));
      on('restart', () => {
        const original = requestAt(box, requestId);
        if (original.kind === 'withdrawal') amountForm(flow, original.amount);
        else if (original.kind === 'change-partner') partnerForm(flow, true);
        else createRequest(flow, { kind: 'remove-protection' });
      });
      on('pin', () => {
        const latest = requestAt(box, requestId);
        if (!latest || latest.status !== 'approved' || !latest.expiresAt || Date.parse(latest.expiresAt) <= Date.now() || latest.kind === 'withdrawal' && box.locked) return ownerRequest(flow, latest);
        const snapshot = JSON.stringify([latest.id, latest.kind, latest.amount, latest.protectionRevision, box.protection?.revision]);
        auth(latest.kind === 'withdrawal' ? 'Confirm your protected transfer' : 'Confirm protection change', pin => {
          const now = requestAt(box, requestId);
          if (!now || snapshot !== JSON.stringify([now.id, now.kind, now.amount, now.protectionRevision, box.protection?.revision])) return;
          const result = act(now.kind === 'withdrawal' ? 'withdrawBox' : 'completeBoxProtectionChange', { requestId, ...(now.kind === 'withdrawal' ? { amount: now.amount } : {}), pin, idempotencyKey: `box-final-${requestId}` });
          if (result) finish(now.kind === 'withdrawal' ? `${cash(now.amount)} is back in Everyday. This approval is now used.` : now.kind === 'change-partner' ? 'New partner invited. Protection stays in place.' : 'Partner protection removed after approval.');
          else ownerRequest(flow, requestAt(box, requestId));
        }, () => ownerRequest(flow, requestAt(box, requestId)));
      });
    });
}

function partnerRequest(flow, request) {
  const { box, act, show, valid } = flow;
  if (!valid() || !request) return;
  const view = getPartnerRequestView(box, request), requestId = request.id, invitationId = box.protection?.invitationId;
  if (!view) return ownerRequest(flow, request);
  const code = view.code;
  show(`<p class="eyebrow bp-role-label">Participant simulation · Partner view</p><h2>A little backup for a goal.</h2><p class="bp-subtitle">You can review this request. You cannot see or use the customer’s account.</p><div class="bp-partner-view"><span>Money Box</span><strong>${esc(view.boxName)}</strong><span>Request</span><strong>${esc(view.operation || kindLabel(request))}</strong>${view.amount !== undefined ? `<span>Requested amount</span><strong>${cash(view.amount)}</strong>` : ''}</div>` +
    (box.protection?.status === 'invited' ? note('Accept the invitation before reviewing codes for this goal.') + button('Accept partner invitation', 'accept-invite') : '') + (code ? `<div class="bp-code-card"><span>Code for this request only</span><strong>${esc(code)}</strong><small>Expires in 10 minutes. A fresh code is needed next time.</small></div>` : note('Only share a code if you agree with this exact request. A message saying “approved” does not unlock it.')) + errorBox + (box.protection?.status === 'active' && ['pending', 'code-issued'].includes(request.status) ? button(code ? 'Show this request’s code again' : 'Approve and show code', 'issue') + button('Decline request', 'deny', true) : '') + button('Back to customer view', 'owner', true) + note('This view contains the goal name and request only. No personal balance, other goals, budget or transactions are shared.'), (sheet, on) => {
      on('accept-invite', () => { if (act('respondBoxPartnerInvite', { invitationId, decision: 'accepted' }, sheet)) partnerRequest(flow, requestAt(box, requestId)); });
      on('issue', () => { if (act('issueBoxPartnerCode', { requestId }, sheet)) partnerRequest(flow, requestAt(box, requestId)); });
      on('deny', () => { if (act('denyBoxPartnerRequest', { requestId }, sheet)) ownerRequest(flow, requestAt(box, requestId)); });
      on('owner', () => ownerRequest(flow, requestAt(box, requestId)));
    });
}

function supportRequest(flow, request) {
  const { box, show, act } = flow, view = getBoxSupportRequestView(box, request), requestId = request.id;
  if (!view) return;
  show(`<p class="eyebrow bp-role-label">Participant simulation · Verified support</p><h2>A careful way back.</h2><p class="bp-subtitle">In the real service, Lumo support must verify the customer and record a decision before helping with a protected box.</p><div class="bp-partner-view"><span>Money Box</span><strong>${esc(view.boxName)}</strong><span>Request</span><strong>${esc(view.operation || kindLabel(request))}</strong>${view.amount !== undefined ? `<span>Requested amount</span><strong>${cash(view.amount)}</strong>` : ''}</div><label class="bp-consent"><input type="checkbox" name="supportIdentityVerified"><span>Simulate that support has verified the customer’s identity.</span></label>${errorBox}${button('Record verified approval', 'approve')}${button('Decline support request', 'deny', true)}${button('Back to customer view', 'owner', true)}` , (sheet, on) => {
    const decide = decision => {
      const verified = sheet.querySelector('[name="supportIdentityVerified"]').checked;
      if (!verified) { sheet.querySelector('.bp-error').textContent = 'Simulate customer verification before recording a decision.'; return; }
      const result = act('verifyBoxSupport', { requestId, identityVerified: true, decision }, sheet);
      if (result) ownerRequest(flow, requestAt(box, requestId), decision === 'approved' ? 'Support approval recorded. Your PIN is still required.' : 'Support declined this request. Your money stays protected.');
    };
    on('approve', () => decide('approved')); on('deny', () => decide('denied')); on('owner', () => ownerRequest(flow, requestAt(box, requestId)));
  });
}

function createRequest(flow, payload) {
  const result = flow.act('requestBoxRelease', { ...payload, idempotencyKey: uid() });
  if (!result) return;
  flow.draft.code = ''; flow.save();
  ownerRequest(flow, requestAt(flow.box, result.requestId || result.request?.id));
}
function amountForm(flow, suggested) {
  const { box, draft, show } = flow;
  draft.amountText = draft.amountText ?? ((suggested || Math.min(box.balance, 10000)) / 100).toFixed(2);
  show(heading('Bring a little back?', box.name) + `<p class="bp-subtitle">Your partner’s code and your PIN are needed for each move to Everyday.</p><form data-bp-amount-form class="form-stack">${field({ label: 'Amount to move (GH₵)', name: 'protectedAmount', value: draft.amountText, required: true })}${note(`Saved in this Money Box: ${cash(box.balance)}.`)}${errorBox}<button type="submit" class="button">Request a fresh code</button></form>${button('Back to protection', 'manage', true)}`, (sheet, on, current) => {
    const input = sheet.querySelector('[name="protectedAmount"]'); input.setAttribute?.('inputmode', 'decimal');
    input.addEventListener('input', () => { if (current()) { draft.amountText = input.value; flow.save(); } });
    sheet.querySelector('[data-bp-amount-form]').addEventListener('submit', event => {
      event.preventDefault(); if (!current()) return;
      draft.amountText = input.value; flow.save(); const amount = amountOf(input.value);
      if (!Number.isSafeInteger(amount) || amount <= 0 || amount > box.balance) { sheet.querySelector('.bp-error').textContent = `Choose an amount between GH₵0.01 and ${cash(box.balance)}.`; return; }
      createRequest(flow, { kind: 'withdrawal', amount });
    }); on('manage', () => manage(flow));
  });
}
function partnerForm(flow, changing = false) {
  const { box, draft, show, act, auth, finish } = flow;
  show(heading(changing ? 'Who’s your new backup?' : 'A little backup for your goal.', changing ? 'Your current partner or verified support must approve the change.' : 'Choose someone you trust. They can help you stick with this goal.') + `<form data-bp-partner-form class="form-stack">${field({ label: 'Partner’s name', name: 'partnerName', value: draft.partnerName || '', placeholder: 'Esi', required: true })}${field({ label: 'Partner’s mobile number', name: 'partnerPhone', value: draft.partnerPhone || '', type: 'tel', placeholder: '024 123 4567', required: true })}${errorBox}<button type="submit" class="button">${changing ? 'Review partner change' : 'Invite with demo PIN'}</button></form>${note('Your partner receives a new code for each withdrawal. They cannot access or spend from your account. You still confirm every move with your PIN.')}${button('Back', 'manage', true)}`, (sheet, on, current) => {
    const name = sheet.querySelector('[name="partnerName"]'), phone = sheet.querySelector('[name="partnerPhone"]');
    const capture = () => { if (!current()) return; draft.partnerName = name.value; draft.partnerPhone = phone.value; flow.save(); };
    name.addEventListener('input', capture); phone.addEventListener('input', capture);
    sheet.querySelector('[data-bp-partner-form]').addEventListener('submit', event => {
      event.preventDefault(); if (!current()) return; capture();
      const inputPartner = { name: name.value.trim(), phone: phone.value.trim() }, checked = validatePartnerDetails(inputPartner, flow.ctx.state.profile?.phone);
      if (!checked.ok) { sheet.querySelector('.bp-error').textContent = checked.message; return; }
      const partner = checked.partner;
      if (changing) { createRequest(flow, { kind: 'change-partner', partner }); return; }
      const snapshot = JSON.stringify(inputPartner);
      auth('Invite your accountability partner', pin => {
        if (JSON.stringify({ name: draft.partnerName.trim(), phone: draft.partnerPhone.trim() }) !== snapshot) return;
        const result = act('requestBoxProtection', { partner, pin, idempotencyKey: uid() });
        if (result) finish('Partner invited in the demo. Withdrawals stay available until they accept.');
        else partnerForm(flow, false);
      }, () => partnerForm(flow, false));
    }); on('manage', () => changing ? manage(flow) : flow.finish());
  });
}
function inviteView(flow) {
  const { box, show, act } = flow, view = getPartnerRequestView(box), invitationId = view?.invitationId;
  show(`<p class="eyebrow bp-role-label">Participant simulation · Partner invitation</p><h2>Be someone’s backup.</h2><p class="bp-subtitle">An invitation for ${esc(view?.partnerName || protectionSummary(box).partnerName)}.</p><div class="bp-partner-view"><span>Money Box</span><strong>${esc(view?.boxName || box.name)}</strong></div>${note('If you accept, you can review a request and provide its code. You cannot access the customer’s account or move money. The customer still confirms with their own PIN.')}${errorBox}${button('Accept partner invitation', 'accept')}${button('Decline invitation', 'decline', true)}${button('Back to customer view', 'owner', true)}`, (sheet, on) => {
    for (const [action, decision] of [['accept', 'accepted'], ['decline', 'declined']]) on(action, () => { if (act('respondBoxPartnerInvite', { invitationId, decision }, sheet)) manage(flow, decision === 'accepted' ? 'Invitation accepted. A fresh code will be needed for every withdrawal.' : 'Invitation declined. No new protection was activated.'); });
    on('owner', () => manage(flow));
  });
}
function manage(flow, feedback = '') {
  const { box, show, act } = flow, summary = protectionSummary(box), invitation = summary.pendingInvitation;
  if (!summary.protected && !['invited', 'declined', 'cancelled'].includes(summary.status)) return partnerForm(flow, false);
  const request = summary.pendingRequest && requestAt(box, summary.pendingRequest.id);
  const status = summary.invitationNeedsReview ? 'Invitation details need a fresh check. Protection is not active.' : summary.status === 'active' ? 'Partner protection is on.' : summary.status === 'invited' ? 'Invitation waiting. Protection is not active.' : summary.status === 'recovery-required' ? 'Partner details need review. Use verified support.' : summary.status === 'cancelled' ? 'Invitation cancelled. Protection is not active.' : 'Invitation declined. Protection is not active.';
  const explanation = summary.status === 'active' ? 'Every withdrawal needs a fresh code from your current partner, followed by your PIN. Codes cannot unlock the whole box.' : summary.status === 'recovery-required' ? 'Partner details could not be read safely. Verified support can review a specific transfer or protection change. Your money stays protected.' : 'Your normal Money Box withdrawal controls stay available. Partner protection begins only after an invitation is accepted.';
  show(heading('A little backup. Still your money.', box.name) + `<div class="bp-partner-card"><span class="bp-person">${esc((summary.partnerName || '?').slice(0, 1).toUpperCase())}</span><div><strong>${esc(summary.partnerName || 'Protection needs review')}</strong><span>${esc(phoneLabel(summary.partnerPhone))}</span><small>${esc(status)}</small></div>${icon(summary.protected ? 'lock' : 'clock', 19)}</div>${note(explanation)}${invitation && summary.protected ? `<div class="bp-pending-invitation"><strong>${esc(invitation.partnerName)} is invited.</strong><p>Your current partner remains active until the replacement accepts. Cancelling this invitation keeps the current protection.</p></div>` : ''}${feedback ? `<p class="bp-feedback" role="status">${esc(feedback)}</p>` : ''}${request ? button('Continue protected request', 'resume') : ''}${invitation ? button('Try the partner invitation', 'invite-view', true) + button('Cancel invitation', 'cancel-invite', true) : ''}${summary.protected ? button('Change accountability partner', 'change', true) + button('Remove partner protection', 'remove', true) : !invitation ? button('Invite someone else', 'invite-new') : ''}${button('Back to Money Box', 'close', true)}${summary.protected ? note('Changing or removing active protection needs your current partner or verified Lumo support. No request by itself releases money.') : ''}`, (sheet, on) => {
    on('resume', () => ownerRequest(flow, request)); on('invite-view', () => inviteView(flow));
    on('cancel-invite', () => { if (act('cancelBoxPartnerInvite', { invitationId: invitation.invitationId }, sheet)) manage(flow, summary.protected ? 'Invitation cancelled. Your current protection is unchanged.' : 'Invitation cancelled. Your normal withdrawal controls are unchanged.'); });
    on('invite-new', () => partnerForm(flow, false));
    on('change', () => partnerForm(flow, true));
    on('remove', () => show(heading('Remove the backup?', box.name) + note('Your partner or verified support must approve this change. Your money stays in the Money Box throughout.') + errorBox + button('Request removal approval', 'request') + button('Keep protection', 'keep', true), (inner, listen) => { listen('request', () => createRequest(flow, { kind: 'remove-protection' })); listen('keep', () => manage(flow)); }));
    on('close', () => flow.finish());
  });
}

export function openBoxProtection(ctx, box) { manage(start(ctx, box)); }
export function openProtectedBoxWithdrawal(ctx, box, suggested) {
  const flow = start(ctx, box);
  if (!hasBoxProtection(box)) return flow.finish('This Money Box has no partner protection. Return to its normal withdrawal controls.');
  const summary = protectionSummary(box), request = summary.pendingRequest && requestAt(box, summary.pendingRequest.id);
  if (request?.kind === 'withdrawal' && isOpen(request)) ownerRequest(flow, request);
  else amountForm(flow, suggested);
}
