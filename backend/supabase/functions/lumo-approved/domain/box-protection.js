/** Local accountability-partner simulation. It never sends SMS or contacts support. */
const MAX_MONEY = 10000000000;
const CODE_LIFETIME = 10 * 60 * 1000;
const ACTIVE = new Set(['pending', 'code-issued', 'support-pending', 'approved']);
const INVITATION_ONLY = new Set(['invited', 'declined', 'cancelled']);
const KINDS = new Set(['withdrawal', 'change-partner', 'remove-protection']);
const clone = value => JSON.parse(JSON.stringify(value));
const record = value => !!value && typeof value === 'object' && !Array.isArray(value);
const text = (value, limit = 120) => typeof value === 'string' ? value.trim().slice(0, limit) : '';
const money = value => Number.isSafeInteger(value) && value > 0 && value <= MAX_MONEY;
const stamp = () => new Date().toISOString();
let serial = 0;
const uid = prefix => `${prefix}-${globalThis.crypto?.randomUUID?.() || `${Date.now().toString(36)}-${++serial}`}`;
const good = (message, data = {}) => ({ ok: true, message, ...data });
const fail = message => ({ ok: false, message });
const kinds = { withdrawal: 'Move money to Everyday', 'change-partner': 'Change accountability partner', 'remove-protection': 'Remove partner protection' };
const phone = value => { let number = String(value || '').replace(/[\s()-]/g, ''); if (/^\+233\d{9}$/.test(number)) number = `0${number.slice(4)}`; return /^0\d{9}$/.test(number) ? number : ''; };
const pinMatches = (state, pin) => typeof pin === 'string' && /^\d{4}$/.test(pin) && pin === String(state.settings?.pin || '1234');
const byId = (state, payload) => state.boxes?.find(box => box.id === (payload.boxId || payload.id));
const currentRequest = box => (box.protectionRequests || []).find(request => request.id === box.activeProtectionRequestId);
const requestFor = (box, payload) => (box.protectionRequests || []).find(request => request.id === payload.requestId);
const fresh = request => Number.isFinite(Date.parse(request.expiresAt)) && Date.parse(request.expiresAt) > Date.now();
const protectionFingerprint = protection => JSON.stringify([protection?.revision, protection?.invitationId, protection?.partner?.id, protection?.partner?.phone]);
const requestScope = request => JSON.stringify([request.kind, request.amount || 0, request.newPartner?.name || '', request.newPartner?.phone || '', request.protectionRevision, request.protectionFingerprint]);
const snapshotMatches = (box, request) => request.protectionRevision === box.protection?.revision && request.protectionFingerprint === protectionFingerprint(box.protection) && request.scope === requestScope(request);
const audit = (box, type, details = {}) => { box.protectionAudit ||= []; box.protectionAudit.push({ id: uid('box-audit'), type, at: stamp(), ...details }); };
const publicRequest = request => request ? { id: request.id, kind: request.kind, ...(request.kind === 'withdrawal' ? { amount: request.amount } : {}), status: request.status, expiresAt: request.expiresAt || '', attempts: request.attempts || 0, ...(request.approvedBy ? { approvedBy: request.approvedBy } : {}) } : null;

export const BOX_PROTECTION_ACTIONS = new Set(['requestBoxProtection', 'respondBoxPartnerInvite', 'cancelBoxPartnerInvite', 'requestBoxRelease', 'issueBoxPartnerCode', 'verifyBoxPartnerCode', 'denyBoxPartnerRequest', 'requestBoxSupportReview', 'verifyBoxSupport', 'cancelBoxRelease', 'completeBoxProtectionChange']);
// An invitation is not a mandate. Unknown/damaged accepted protection still fails closed.
export function hasBoxProtection(box) { return !!box && box.protection != null && !INVITATION_ONLY.has(box.protection.status); }
const trustedRecord = value => record(value) && ['invited', 'active', 'declined', 'cancelled'].includes(value.status) && record(value.partner) && !!text(value.partner.name, 60) && !!phone(value.partner.phone) && !!text(value.partner.id, 100) && !!text(value.invitationId, 100) && Number.isSafeInteger(value.revision) && value.revision > 0;
const trustedProtection = box => trustedRecord(box?.protection);
const invitationFor = box => trustedRecord(box?.pendingProtection) && box.pendingProtection.status === 'invited' ? box.pendingProtection : trustedProtection(box) && box.protection.status === 'invited' ? box.protection : null;
const invitationSummary = value => value ? { invitationId: value.invitationId, status: value.status, partnerName: value.partner.name, partnerPhone: value.partner.phone } : null;
export function validatePartnerDetails(value, ownerPhone = '') {
  if (!record(value)) return fail('Add your accountability partner’s name and Ghana phone number.');
  const name = text(value.name, 60).replace(/\s+/g, ' '), number = phone(value.phone);
  if (!name || !number) return fail('Add a name and a valid Ghana phone number, such as 024 123 4567.');
  if (phone(ownerPhone) && number === phone(ownerPhone)) return fail('Choose someone else as your accountability partner.');
  return { ok: true, partner: { name, phone: number } };
}
export function makeBoxProtection(partner, revision = 1) {
  return { status: 'invited', partner: { id: uid('box-partner'), name: partner.name, phone: partner.phone }, revision, invitationId: uid('box-invite'), invitedAt: stamp() };
}
export function ensureBoxProtectionState(state) {
  // Earlier Money Boxes remain unprotected. Never invent a partner or change money.
  for (const box of state.boxes || []) {
    if (box.protection == null) continue;
    // An old pending/declined invitation was never an accepted mandate. Even
    // damaged invitation details cannot silently turn it into a savings lock.
    if (!INVITATION_ONLY.has(box.protection.status) && !trustedProtection(box) && !(record(box.protection) && box.protection.status === 'recovery-required' && record(box.protection.partner) && Number.isSafeInteger(box.protection.revision))) {
      box.protectionRecovery = { detectedAt: stamp(), reason: 'Saved partner details need verified support', previous: clone(box.protection) };
      box.protection = { status: 'recovery-required', partner: { id: uid('recovery-partner'), name: '', phone: '' }, revision: Number.isSafeInteger(box.protectionRevision) ? box.protectionRevision + 1 : 1, invitationId: uid('recovery-invite') };
    }
    box.protection.revision ||= 1;
    box.protectionRequests = Array.isArray(box.protectionRequests) ? box.protectionRequests : [];
    box.protectionAudit = Array.isArray(box.protectionAudit) ? box.protectionAudit : [];
  }
  return state;
}
export function protectionSummary(box) {
  const protectedBox = hasBoxProtection(box), request = protectedBox ? currentRequest(box) : null;
  const trusted = trustedProtection(box), invitation = invitationFor(box);
  return { protected: protectedBox, status: trusted || INVITATION_ONLY.has(box?.protection?.status) ? box.protection.status : protectedBox ? 'recovery-required' : 'none', partnerName: trusted ? box.protection.partner.name : '', partnerPhone: trusted ? box.protection.partner.phone : '', revision: protectedBox ? box.protection?.revision || 0 : 0, invitationNeedsReview: !protectedBox && box?.protection != null && !trusted, pendingInvitation: invitationSummary(invitation), pendingRequest: request && ACTIVE.has(request.status) ? publicRequest(request) : null };
}
export function getPartnerRequestView(box, request = null) {
  if (!request) { const protection = invitationFor(box) || (trustedProtection(box) ? box.protection : null); return protection ? { boxId: box.id, boxName: box.name, kind: 'invitation', operation: 'Support this Money Box', status: protection.status, invitationId: protection.invitationId, partnerName: protection.partner.name, partnerPhone: protection.partner.phone } : null; }
  if (!hasBoxProtection(box) || !trustedProtection(box)) return null;
  request = (box.protectionRequests || []).find(value => value.id === request.id);
  if (!request) return null;
  const isCurrent = box.activeProtectionRequestId === request.id && snapshotMatches(box, request);
  return { boxId: box.id, boxName: request.boxName || box.name, requestId: request.id, kind: request.kind, operation: kinds[request.kind] || 'Money Box request', ...(request.kind === 'withdrawal' ? { amount: request.amount } : {}), status: request.status, expiresAt: request.expiresAt || '', ...(isCurrent && request.status === 'code-issued' && fresh(request) ? { code: request.code } : {}) };
}
/** The verified-support simulator can review a quarantined request without seeing account data. */
export function getBoxSupportRequestView(box, value) {
  if (!hasBoxProtection(box) || !value) return null;
  const request = (box.protectionRequests || []).find(item => item.id === value.id);
  if (!request) return null;
  return { boxId: box.id, boxName: request.boxName || box.name, requestId: request.id, kind: request.kind, operation: kinds[request.kind] || 'Money Box request', ...(request.kind === 'withdrawal' ? { amount: request.amount } : {}), status: request.status, expiresAt: request.expiresAt || '' };
}
function closeOtherRequests(box, nextStatus = 'superseded') {
  for (const request of box.protectionRequests || []) if (ACTIVE.has(request.status)) { request.status = nextStatus; request.closedAt = stamp(); delete request.code; }
}
export function invalidateBoxReleaseRequests(box, reason = 'Box details changed') {
  if (!(box.protectionRequests || []).some(request => ACTIVE.has(request.status))) return;
  closeOtherRequests(box); audit(box, 'release-invalidated', { reason });
}
function checkedRequest(box, payload, expected = null) {
  const request = requestFor(box, payload);
  if (!request || box.activeProtectionRequestId !== request.id || !snapshotMatches(box, request)) return { error: 'This request is no longer current. Start a fresh request.' };
  if (expected && request.kind !== expected) return { error: 'This approval belongs to a different action.' };
  return { request };
}
/** Called by the financial ledger before moving any protected money. */
export function checkProtectedWithdrawal(state, box, payload) {
  if (!hasBoxProtection(box)) return { ok: true, request: null };
  const checked = checkedRequest(box, payload, 'withdrawal');
  if (checked.error) return fail(checked.error);
  const request = checked.request;
  if (!trustedProtection(box) && request.approvedBy !== 'verified-support') return fail('Partner details need verified support review before taking money out.');
  if (request.status !== 'approved' || !fresh(request)) return fail('Get a fresh partner code or verified support approval before taking money out.');
  if (request.amount !== payload.amount) return fail('This approval is for a different amount. Request a fresh code.');
  if (!pinMatches(state, payload.pin)) return fail('Confirm this transfer with your own demo PIN.');
  return { ok: true, request };
}
export function consumeBoxRelease(box, request, transactionId = '') {
  if (!request) return;
  request.status = 'consumed'; request.consumedAt = stamp(); delete request.code;
  if (transactionId) request.transactionId = transactionId;
  audit(box, 'withdrawal-authorised', { requestId: request.id, amount: request.amount, approvedBy: request.approvedBy, transactionId });
}

export function handleBoxProtectionAction(state, type, payload) {
  if (!BOX_PROTECTION_ACTIONS.has(type)) return null;
  const box = byId(state, payload); if (!box) return fail('That Money Box could not be found.');
  if (type === 'requestBoxProtection') {
    if (hasBoxProtection(box)) return fail('Use the approved partner-change journey to change this protection.');
    if (invitationFor(box)) return fail('This invitation is still waiting. Cancel it before inviting someone else.');
    const validation = validatePartnerDetails(payload.partner, state.profile?.phone); if (!validation.ok) return validation;
    if (!pinMatches(state, payload.pin)) return fail('Confirm adding protection with your own demo PIN.');
    if (box.archived) return fail('Restore this Money Box before inviting an accountability partner.');
    box.protection = { ...makeBoxProtection(validation.partner, (box.protectionRevision || 0) + 1), boxName: box.name }; box.protectionRevision = box.protection.revision;
    box.protectionRequests ||= []; audit(box, 'partner-invited', { revision: box.protection.revision });
    return good('Invitation ready. Withdrawals stay available until your partner accepts.', { id: box.id, protection: protectionSummary(box) });
  }
  if (type === 'respondBoxPartnerInvite' || type === 'cancelBoxPartnerInvite') {
    const invitation = invitationFor(box);
    if (!invitation || payload.invitationId !== invitation.invitationId) return fail('This invitation is already answered or no longer current.');
    if (type === 'cancelBoxPartnerInvite') {
      invitation.status = 'cancelled'; invitation.respondedAt = stamp();
      audit(box, 'partner-invitation-cancelled', { invitationId: invitation.invitationId, revision: invitation.revision });
      return good(hasBoxProtection(box) ? 'Invitation cancelled. Your current partner protection is unchanged.' : 'Invitation cancelled. Your normal withdrawal controls are unchanged.', { protection: protectionSummary(box) });
    }
    if (box.archived || invitation.boxName && invitation.boxName !== box.name) return fail('This Money Box changed. Cancel this invitation and send a fresh one.');
    if (!['accepted', 'declined'].includes(payload.decision)) return fail('Choose whether to accept this invitation.');
    invitation.status = payload.decision === 'accepted' ? 'active' : 'declined'; invitation.respondedAt = stamp();
    if (payload.decision === 'accepted') {
      const replacement = invitation === box.pendingProtection;
      invalidateBoxReleaseRequests(box, 'Partner accepted a new mandate');
      box.protection = invitation; box.protectionRevision = invitation.revision; box.activeProtectionRequestId = null;
      if (replacement) { box.pendingProtection = null; audit(box, 'partner-changed', { invitationId: invitation.invitationId, revision: invitation.revision }); }
    }
    audit(box, `partner-${payload.decision}`, { invitationId: invitation.invitationId, revision: invitation.revision });
    return good(payload.decision === 'accepted' ? 'Partner accepted. Each withdrawal needs a fresh code and your PIN.' : hasBoxProtection(box) ? 'Invitation declined. Your current partner protection is unchanged.' : 'Invitation declined. Your normal withdrawal controls are unchanged.', { protection: protectionSummary(box) });
  }
  if (!hasBoxProtection(box)) return fail('Partner protection is not active. Your normal Money Box controls remain available.');
  if (type === 'requestBoxRelease') {
    if (!KINDS.has(payload.kind)) return fail('Choose a transfer, partner change or protection removal.');
    if (payload.kind === 'change-partner' && invitationFor(box)) return fail('Finish or cancel the pending partner invitation first.');
    let partner;
    if (payload.kind === 'withdrawal' && (!money(payload.amount) || payload.amount > box.balance)) return fail('Choose an amount within this Money Box.');
    if (payload.kind === 'change-partner') { const validation = validatePartnerDetails(payload.partner, state.profile?.phone); if (!validation.ok) return validation; partner = validation.partner; if (partner.phone === box.protection?.partner?.phone) return fail('Choose a different accountability partner.'); }
    const request = { id: uid('box-release'), boxId: box.id, boxName: box.name, kind: payload.kind, ...(payload.kind === 'withdrawal' ? { amount: payload.amount } : {}), ...(partner ? { newPartner: partner } : {}), status: 'pending', createdAt: stamp(), protectionRevision: box.protection.revision, protectionFingerprint: protectionFingerprint(box.protection), attempts: 0 };
    request.scope = requestScope(request); closeOtherRequests(box); box.protectionRequests ||= []; box.protectionRequests.unshift(request); box.activeProtectionRequestId = request.id;
    audit(box, 'release-requested', { requestId: request.id, kind: request.kind, ...(request.amount ? { amount: request.amount } : {}) });
    return good('Request ready. Your money and protection stay in place until approval and your PIN.', { requestId: request.id, request: publicRequest(request) });
  }
  const checked = checkedRequest(box, payload); if (checked.error) return fail(checked.error); const request = checked.request;
  if (type === 'cancelBoxRelease') {
    if (!ACTIVE.has(request.status)) return fail('This request is already closed.');
    request.status = 'cancelled'; request.closedAt = stamp(); delete request.code; audit(box, 'release-cancelled', { requestId: request.id });
    return good('Request cancelled. Nothing moved or unlocked.', { requestId: request.id });
  }
  if (type === 'issueBoxPartnerCode') {
    if (box.protection.status !== 'active') return fail('Your partner needs to accept the invitation first. Verified support can help meanwhile.');
    if (request.status === 'code-issued' && fresh(request)) return good('This request already has a fresh code.', { requestId: request.id, code: request.code, view: getPartnerRequestView(box, request), duplicate: true });
    if (request.status !== 'pending') return fail('Start a fresh request before asking for another code.');
    const random = globalThis.crypto?.getRandomValues ? globalThis.crypto.getRandomValues(new Uint32Array(1))[0] : Math.floor(Math.random() * 4294967296);
    let code = String(100000 + random % 900000);
    if (code === box.lastPartnerCode) code = String(100000 + (Number(code) - 100000 + 1) % 900000);
    box.lastPartnerCode = code; request.code = code; request.expiresAt = new Date(Date.now() + CODE_LIFETIME).toISOString(); request.status = 'code-issued'; request.issuedBy = 'partner'; request.issuedAt = stamp();
    audit(box, 'partner-code-issued', { requestId: request.id });
    return good('A fresh code is ready in the partner simulation.', { requestId: request.id, code: request.code, view: getPartnerRequestView(box, request) });
  }
  if (type === 'verifyBoxPartnerCode') {
    if (request.status !== 'code-issued' || box.protection.status !== 'active') return fail('Ask your partner for a fresh code for this request.');
    if (!fresh(request)) { request.status = 'expired'; delete request.code; audit(box, 'code-expired', { requestId: request.id }); return good('That code expired. Start a fresh request.', { requestId: request.id, authorized: false }); }
    if (typeof payload.code !== 'string' || !/^\d{6}$/.test(payload.code) || payload.code !== request.code) {
      request.attempts += 1;
      if (request.attempts >= 5) { request.status = 'locked'; delete request.code; audit(box, 'code-attempts-exhausted', { requestId: request.id }); }
      return good(request.status === 'locked' ? 'Too many attempts. Start a fresh request.' : 'That code does not match. Check with your partner.', { requestId: request.id, authorized: false, attempts: request.attempts });
    }
    request.status = 'approved'; request.approvedBy = 'partner'; request.approvedAt = stamp(); delete request.code;
    audit(box, 'partner-approved', { requestId: request.id });
    return good('Partner code verified. Your own PIN is still needed.', { requestId: request.id, authorized: true });
  }
  if (type === 'denyBoxPartnerRequest') {
    if (box.protection.status !== 'active' || !['pending', 'code-issued'].includes(request.status)) return fail('This request is no longer awaiting your partner.');
    request.status = 'denied'; request.closedAt = stamp(); delete request.code; audit(box, 'partner-denied', { requestId: request.id });
    return good('Request declined. The savings and protection stay in place.', { requestId: request.id, authorized: false });
  }
  if (type === 'requestBoxSupportReview') {
    if (!['pending', 'code-issued'].includes(request.status)) return fail('Start a fresh request for a support review.');
    request.status = 'support-pending'; request.supportRequestedAt = stamp(); delete request.code; delete request.expiresAt;
    audit(box, 'support-requested', { requestId: request.id });
    return good('Support review requested. This request alone does not release money or protection.', { requestId: request.id, authorized: false });
  }
  if (type === 'verifyBoxSupport') {
    if (request.status !== 'support-pending') return fail('Request a support review first.');
    if (!['approved', 'denied'].includes(payload.decision)) return fail('Choose a support review decision.');
    if (payload.decision === 'approved' && payload.identityVerified !== true) return fail('Support must verify the customer before approving this request.');
    request.status = payload.decision === 'approved' ? 'approved' : 'denied'; request.supportDecisionAt = stamp();
    if (request.status === 'approved') { request.approvedBy = 'verified-support'; request.approvedAt = stamp(); request.supportVerifiedAt = stamp(); request.expiresAt = new Date(Date.now() + CODE_LIFETIME).toISOString(); }
    audit(box, request.status === 'approved' ? 'verified-support-approved' : 'support-denied', { requestId: request.id, identityVerified: payload.identityVerified === true });
    return good(request.status === 'approved' ? 'Verified support approval recorded. Your PIN is still needed.' : 'Support declined. Nothing moved or unlocked.', { requestId: request.id, authorized: request.status === 'approved' });
  }
  if (type === 'completeBoxProtectionChange') {
    if (!['change-partner', 'remove-protection'].includes(request.kind)) return fail('This approval is for a money transfer.');
    if (!trustedProtection(box) && request.approvedBy !== 'verified-support') return fail('Verified support must review the partner details first.');
    if (request.status !== 'approved' || !fresh(request) || !pinMatches(state, payload.pin)) return fail('A fresh partner or verified support approval and your own PIN are required.');
    request.status = 'consumed'; request.consumedAt = stamp(); delete request.code;
    const revision = Math.max(Number.isSafeInteger(box.protection.revision) ? box.protection.revision : 0, Number.isSafeInteger(box.protectionRevision) ? box.protectionRevision : 0) + 1;
    audit(box, request.kind === 'remove-protection' ? 'protection-removed' : 'partner-change-authorised', { requestId: request.id, approvedBy: request.approvedBy, previousRevision: box.protection.revision });
    box.protectionRevision = revision;
    if (request.kind === 'remove-protection') { if (invitationFor(box)) { box.pendingProtection.status = 'cancelled'; box.pendingProtection.respondedAt = stamp(); } box.protection = null; box.activeProtectionRequestId = null; }
    else { box.pendingProtection = { ...makeBoxProtection(request.newPartner, revision), boxName: box.name }; box.activeProtectionRequestId = null; audit(box, 'partner-invited', { revision, invitationId: box.pendingProtection.invitationId }); }
    return good(request.kind === 'remove-protection' ? 'Partner protection removed with approval.' : 'New partner invited. Your current partner stays active until the replacement accepts.', { id: box.id, protection: protectionSummary(box) });
  }
  return fail('This protection action is unavailable.');
}
