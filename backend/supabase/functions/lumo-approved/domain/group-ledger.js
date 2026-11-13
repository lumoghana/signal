/** Shared collection ledger for the local participant simulation. Amounts are integer pesewas. */
import { GROUP_PROPOSAL_MS, GROUP_REVIEW_MS, groupPayoutFee, groupPayoutStatus, groupCollectionStatus, groupMandateReady, designatedGroupApprovers, groupMandateAccepted, canonicalGroupRecipient, validateGroupEvidence, collectionRefundPreview } from './group-policy.js';
export { groupPayoutStatus, groupCollectionStatus, groupMandateReady, collectionRefundPreview } from './group-policy.js';
const MAX = 10000000000;
const money = n => Number.isSafeInteger(n) && n >= 0 && n <= MAX;
const positive = n => money(n) && n > 0;
const clean = (v, limit = 120) => String(v ?? '').trim().slice(0, limit);
const clone = v => JSON.parse(JSON.stringify(v));
const normalizedGroupPhone = value => clean(value, 30).replace(/[\s()-]/g, '').replace(/^\+233/, '0');
const now = () => new Date().toISOString();
let serial = 0;
const uid = prefix => `${prefix}-${globalThis.crypto?.randomUUID?.() || `${Date.now().toString(36)}-${++serial}`}`;
const ok = (message, extra = {}) => ({ ok: true, message, ...extra });
const fail = message => ({ ok: false, message });
const successful = p => ['success', 'paid', 'completed', 'executed'].includes(p.status);
const cash = amount => `GH₵${(amount / 100).toLocaleString('en-GH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
export const GROUP_LEDGER_ACTIONS = new Set(['createGroup', 'contributeGroup', 'retryGroupContribution', 'settleGroupContribution', 'addGroupMember', 'inviteGroupMember', 'acceptGroupInvite', 'acceptGroupMandate', 'setGroupParticipant', 'removeGroupMember', 'setGroupMemberRole', 'requestPayout', 'approvePayout', 'editPayout', 'executePayout', 'settleGroupPayout', 'retryGroupPayout', 'cancelPayout', 'closeGroup', 'declinePayout', 'reviewPayout', 'expireGroupPayouts', 'ensureProjectPrintingDemo']);

export function getGroupActor(group) { return clean(group?.participantId, 80) || 'me'; }
export function activeGroupMember(group, id = getGroupActor(group)) { return group?.members?.find(m => m.id === id && (!m.status || m.status === 'active')) || null; }
export function canReadGroup(group, id = getGroupActor(group)) { return !!activeGroupMember(group, id); }
const nominatedApprovers = designatedGroupApprovers;
export function groupApprovers(g) { return nominatedApprovers(g).filter(m => groupMandateAccepted(g, m)); }
const threshold = g => Math.max(1, Number.isSafeInteger(g.mandate?.threshold) ? g.mandate.threshold : 1);
const reserved = (g, omitId) => (g.payouts || []).filter(p => p.id !== omitId && ['pending', 'approved', 'processing'].includes(groupPayoutStatus(p))).reduce((n, p) => n + p.amount + (p.fee || 0), 0);
export function groupSummary(g) {
  const contributions = Array.isArray(g.contributions) ? g.contributions : [];
  const collected = contributions.length ? contributions.filter(c => c.status === 'success').reduce((n, c) => n + c.amount, 0) : (g.members || []).reduce((n, m) => n + (money(m.amount) ? m.amount : 0), 0);
  return { balance: g.balance, collected, target: g.target, remaining: Math.max(0, g.target - collected), reserved: reserved(g), available: Math.max(0, g.balance - reserved(g)), confirmedCount: contributions.filter(c => c.status === 'success').length, pendingCount: contributions.filter(c => c.status === 'pending').length, requiredApprovals: threshold(g), approverCount: groupApprovers(g).length };
}
const payoutDetails = p => JSON.stringify({ amount: p.amount, recipient: p.recipient, rail: p.rail, destination: p.destination || '', note: p.note || '', requiredApprovals: p.requiredApprovals, fee: p.fee || 0, bank: p.bank || '', network: p.network || '', evidence: p.evidence || [], evidenceReference: p.evidenceReference || '' });
const eligibleApprovalIds = (g, p) => [...new Set(p.approvals || [])].filter(id => groupApprovers(g).some(m => m.id === id));
const approvalValid = (g, p) => p.approvalFingerprint === payoutDetails(p) && eligibleApprovalIds(g, p).length >= p.requiredApprovals;
const addContributionHistory = (c, status, actorId) => { c.statusHistory ||= []; c.statusHistory.push({ status, at: now(), actorId }); };
const addPayoutHistory = (p, type, actorId) => { p.history ||= []; p.history.push({ type, status: p.status, at: now(), actorId, approvals: [...(p.approvals || [])], requiredApprovals: p.requiredApprovals, revision: p.revision || 1, amount: p.amount, fee: p.fee || 0, recipient: p.recipient, note: p.note || '', ...(type==='declined'?{reason:p.declines?.at(-1)?.reason||''}:{}) }); };

/** Upgrade old snapshots once. Never derive any money from chat or overwrite a balance. */
export function ensureGroupState(state) {
  for (const g of state.groups || []) {
    g.creatorId ||= g.members.some(m => m.id === 'me') ? 'me' : g.members[0]?.id || 'me';
    g.participantId ||= 'me'; g.localSimulation = true;
    g.purpose = typeof g.purpose === 'string' ? g.purpose : g.name;
    g.deadline = typeof g.deadline === 'string' ? g.deadline : '';
    g.status ||= 'open'; g.refunds ||= [];
    g.createdAt ||= '2026-10-31T09:00:00.000Z';
    g.mandateRevision ||= 1;
    for (const member of g.members || []) {
      member.status ||= 'active'; member.amount = money(member.amount) ? member.amount : 0;
      member.invitationVersion ||= 1;
      if (member.status === 'active') { member.joinedAt ||= g.createdAt; member.mandateAcceptedRevision ??= g.mandateRevision === 1 ? 1 : 0; }
    }
    if (!Array.isArray(g.contributions)) {
      const gross = g.balance + (g.payouts || []).filter(successful).reduce((n, p) => n + p.amount + (p.fee||0), 0);
      const seen = new Set();
      // Personal contribution records are already included in member.amount. Retain their provenance,
      // then add only each member's opening remainder rather than counting both sources.
      g.contributions = (state.transactions || []).filter(tx => tx.groupId === g.id && tx.type === 'contribution' && positive(tx.amount) && !seen.has(tx.id) && seen.add(tx.id)).map(tx => {
        const memberId = tx.memberId || 'me', status = ['success', 'pending', 'failed', 'reversed'].includes(tx.status) ? tx.status : 'success';
        return { id: tx.contributionId || `imported-${tx.id}`, memberId, memberName: g.members.find(m => m.id === memberId)?.name || 'A member', amount: tx.amount, status, at: tx.at || g.createdAt, walletDebited: memberId === 'me' && ['success', 'pending'].includes(status) && tx.walletDebited !== false, transactionId: tx.id, legacy: true, statusHistory: [{ status, at: tx.at || g.createdAt, actorId: memberId }] };
      });
      for (const m of g.members) {
        const recorded = g.contributions.filter(c => c.memberId === m.id && c.status === 'success').reduce((n, c) => n + c.amount, 0);
        const amount = Math.max(0, m.amount - recorded);
        if (amount) g.contributions.push({ id: `opening-${m.id}`, memberId: m.id, memberName: m.name, amount, status: 'success', at: g.createdAt, walletDebited: false, legacy: true, statusHistory: [{ status: 'success', at: g.createdAt, actorId: m.id }] });
      }
      const recordedGross = g.contributions.filter(c => c.status === 'success').reduce((n, c) => n + c.amount, 0);
      if (gross > recordedGross) g.contributions.push({ id: 'opening-collection', memberId: '', memberName: 'Opening collection', amount: gross - recordedGross, status: 'success', at: g.createdAt, walletDebited: false, legacy: true, statusHistory: [{ status: 'success', at: g.createdAt }] });
    }
    for (const c of g.contributions) { c.statusHistory ||= [{ status: c.status, at: c.at || g.createdAt, actorId: c.memberId }]; c.attempt ||= Math.max(1, c.statusHistory.filter(h => h.status === 'pending').length); }
    for (const p of g.payouts || []) {
      p.fee ||= 0; p.evidence ||= []; p.reviews ||= {}; p.declines ||= []; p.expiresAt ||= new Date(Date.parse(p.at || g.createdAt) + GROUP_PROPOSAL_MS).toISOString();
      p.requiredApprovals ||= threshold(g); p.revision ||= 1; p.attempt ||= (p.history || []).filter(h => h.type === 'processing').length;
      if(p.policyVersion!==1){
        p.policyVersion=1;
        if(p.status==='processing')p.approvalFingerprint=payoutDetails(p);
        if(['pending','approved','failed'].includes(p.status)){
          p.approvals=[];p.reviews={};if(p.status!=='failed')p.status='pending';p.revision++;p.approvalFingerprint=payoutDetails(p);
          p.history ||= [];addPayoutHistory(p,'edit',g.creatorId);
        }
      }
      p.approvalFingerprint ||= payoutDetails(p);
      p.history ||= [{ type: 'request', status: 'pending', at: p.at || g.createdAt, actorId: p.requestedBy || g.creatorId, approvals: [], requiredApprovals: p.requiredApprovals, revision: p.revision, amount: p.amount, recipient: p.recipient, note: p.note || '' }];
      if (p.history.length === 1 && p.status !== 'pending') p.history.push({ type: p.status, status: p.status, at: p.paidAt || p.at || g.createdAt, approvals: [...(p.approvals || [])], requiredApprovals: p.requiredApprovals, revision: p.revision, amount: p.amount, recipient: p.recipient, note: p.note || '' });
    }
    g.schema = 2;
  }
  return state;
}

/** Financial announcements are projections of ledger records with stable transition IDs. */
export function groupMoneyEvents(g, state) {
  const events = [];
  for (const c of g.contributions || []) {
    const name = c.memberName || g.members.find(m => m.id === c.memberId)?.name || 'A member';
    (c.statusHistory || [{ status: c.status, at: c.at }]).forEach((entry, index) => {
      const title = entry.status === 'success' ? `${cash(c.amount)} contribution confirmed` : entry.status === 'pending' ? 'Contribution processing' : entry.status === 'reversed' ? 'Contribution reversed' : 'Contribution did not complete';
      const body = entry.status === 'success' ? `${name} added ${cash(c.amount)} to the group account.` : entry.status === 'pending' ? `${cash(c.amount)} is being checked. It is not in the collected total yet.` : entry.status === 'reversed' ? `${cash(c.amount)} returned to its source. The collected total has been updated.` : `${cash(c.amount)} was not collected. The group total has not increased.`;
      events.push({ id: `group-money:${g.id}:contribution:${c.id}:${index}`, kind: 'system', type: `contribution-${entry.status}`, at: entry.at || c.at, title, body, contributionId: c.id, actorId: entry.actorId || c.memberId, status: entry.status, amount: c.amount });
    });
  }
  for (const p of g.payouts || []) (p.history || []).forEach((entry, index) => {
    const type = entry.type, amount = entry.amount ?? p.amount, recipient = entry.recipient || p.recipient;
    const progress = `${(entry.approvals || []).length} of ${entry.requiredApprovals || p.requiredApprovals} approvals`;
    const titles = { request: 'Payout requested', declined:'Payout declined', expired:'Payout request expired', approval: 'Payout approval recorded', edit: 'Payout details changed', processing: 'Group payment processing', success: 'Group payment confirmed', failed: 'Group payment did not complete', retry: 'Group payment ready to retry', cancelled: 'Payout request cancelled', approved: 'Payout approvals complete' };
    let body = `${cash(amount)} to ${recipient}. ${progress}.`;
    if (type === 'processing') body = `${cash(amount)} to ${recipient} is processing. Approval is complete; payment confirmation is still pending.`;
    if (type === 'success') body = `${cash(amount)} paid to ${recipient} from the group account.`;
    if (type === 'failed') body = `${cash(amount)} was not paid. The group money is still here.`;
    if (type === 'declined') body = `${cash(amount)} request declined. ${entry.reason||'No money moved; a revision needs fresh approvals.'}`;
    if (type === 'expired') body = `${cash(amount)} request expired after 48 hours. Its reservation was released.`;
    if (type === 'edit') body = `${cash(amount)} to ${recipient}. Earlier approvals no longer apply; the approvers need to review it again.`;
    events.push({ id: `group-money:${g.id}:payout:${p.id}:${index}`, kind: 'system', at: entry.at || p.at, type: `payout-${type}`, title: titles[type] || 'Payout update', body, payoutId: p.id, actorId: entry.actorId, status: entry.status, amount, revision: entry.revision || 1 });
  });
  for(const refund of g.refunds||[])events.push({id:`group-money:${g.id}:refund:${refund.id}`,kind:'system',type:'collection-refund',status:'success',at:refund.at,title:'Unused contribution returned',body:`${cash(refund.amount)} returned to ${refund.memberName}’s original source.`,amount:refund.amount});
  if(g.status==='closed')events.push({id:`group-money:${g.id}:closed`,kind:'system',type:'collection-closed',status:'closed',at:g.closedAt,title:'Collection closed',body:'The conversation and financial history remain here. Unused money has been returned to its original sources.'});
  return events;
}

function createGroup(state, p) {
  const name = clean(p.name, 60);
  if (!name || !positive(p.target)) return fail('Give your collection a name and a target.');
  const raw = Array.isArray(p.members) && p.members.length ? p.members : [{ id: 'me', name: state.profile.name || 'You', role: 'approver' }];
  const ids = new Set(), phones = new Set();
  const members = raw.map((m, index) => {
    if (!m || typeof m !== 'object' || Array.isArray(m)) return null;
    const id = clean(m.id, 80) || (index === 0 ? 'me' : uid('member')), name = clean(m.name, 60).replace(/\s+/g, ' '), phone = clean(m.phone, 30).replace(/[\s()-]/g, ''), phoneKey = phone.replace(/^\+233/, '0');
    if (!name || ids.has(id) || phone && (!/^(0\d{9}|\+233\d{9})$/.test(phone) || phones.has(phoneKey))) return null;
    ids.add(id); if (phone) phones.add(phoneKey);
    return { id, name, ...(phone ? { phone } : {}), amount: 0, role: id === 'me' ? 'approver' : ['approver', 'creator'].includes(m.role) ? m.role : 'contributor', status: id === 'me' ? 'active' : 'invited', invitationVersion: 1, mandateAcceptedRevision: id === 'me' ? 1 : 0, ...(id === 'me' ? { joinedAt: now() } : { invitedAt: now() }) };
  });
  if (members.some(m => !m) || members.length > 50) return fail('Add distinct collection members.');
  if (!members.some(m => m.id === 'me')) members.unshift({ id: 'me', name: state.profile.name || 'You', role: 'approver', amount: 0, status: 'active', invitationVersion: 1, mandateAcceptedRevision: 1, joinedAt: now() });
  if (members.length > 50) return fail('This demo collection supports up to fifty members, including you.');
  const possible = members.filter(m => ['approver', 'creator'].includes(m.role)), selection = p.mandate?.approvers ?? possible.length, count = Array.isArray(selection) ? selection.length : selection, required = p.mandate?.threshold ?? Math.min(2, count);
  if (!Number.isSafeInteger(count) || count < 1 || count > possible.length || !Number.isSafeInteger(required) || required < 1 || required > count || Array.isArray(selection) && (new Set(selection).size !== count || selection.some(id => !possible.some(m => m.id === id)))) return fail('Choose an approval threshold that your approvers can meet.');
  const deadline = clean(p.deadline, 10); if (deadline && (!/^\d{4}-\d{2}-\d{2}$/.test(deadline) || Number.isNaN(Date.parse(deadline)) || new Date(deadline).toISOString().slice(0,10)!==deadline || deadline < now().slice(0,10))) return fail('Choose a valid group deadline.');
  const group = { id: uid('group'), schema: 2, mandateRevision: 1, status:'open', refunds:[], creatorId: 'me', participantId: 'me', localSimulation: true, name, emoji: clean(p.emoji || '👥', 12), target: p.target, balance: 0, purpose: clean(p.purpose || name, 240), deadline, createdAt: now(), members, mandate: { approvers: clone(selection), threshold: required }, contributions: [], payouts: [] };
  state.groups.push(group); return ok('Your collection is ready. Invitations are waiting to be accepted.', { id: group.id, group });
}

function seedProjectPrinting(state) {
  const existing = state.groups.find(g => g.id === 'group-project-printing');
  if (existing) return ok('Project Printing is ready.', { id: existing.id, ...(canReadGroup(existing) ? { group: existing } : {}), duplicate: true });
  const at = new Date(Date.now() - 86400000).toISOString(), deadline = new Date(Date.now() + 86400000).toISOString().slice(0, 10);
  const names = [['me', state.profile.name || 'Ama', 'approver'], ['esi', 'Esi', 'approver'], ['kofi', 'Kofi', 'approver'], ['kwame', 'Kwame', 'contributor'], ['akos', 'Akos', 'contributor'], ['senam', 'Senam', 'contributor']];
  const members = names.map(([id, name, role]) => ({ id, name, role, status: 'active', amount: ['esi', 'kofi', 'kwame', 'akos'].includes(id) ? 3000 : 0, joinedAt: at }));
  const contributions = ['esi', 'kofi', 'kwame', 'akos', 'senam'].map((id, index) => ({ id: `printing-${id}`, memberId: id, memberName: members.find(m => m.id === id).name, amount: 3000, status: id === 'senam' ? 'pending' : 'success', at: new Date(Date.parse(at) + (index + 1) * 60000).toISOString(), walletDebited: false, sample: true, attempt: 1, statusHistory: [{ status: id === 'senam' ? 'pending' : 'success', at: new Date(Date.parse(at) + (index + 1) * 60000).toISOString(), actorId: id }] }));
  const group = { id: 'group-project-printing', schema: 2, mandateRevision: 1, status:'open', refunds:[], creatorId: 'me', participantId: 'me', localSimulation: true, isSample: true, name: 'Project Printing', emoji: '📚', target: 18000, balance: 12000, purpose: 'Print and bind six project reports.', deadline, contributionEach: 3000, createdAt: at, members, mandate: { approvers: ['me', 'esi', 'kofi'], threshold: 2 }, contributions, payouts: [] };
  state.groups.push(group); return ok('Sample group ready. No personal money was added or moved.', { id: group.id, group });
}

const groupFor = (s, p) => s.groups.find(g => g.id === (p.groupId || p.id));
const actorIsApprover = g => groupApprovers(g).some(m => m.id === getGroupActor(g));
const actorIsCreator = g => canReadGroup(g) && getGroupActor(g) === g.creatorId;
const spoofed = (p, fields, actor) => fields.some(key => p[key] !== undefined && p[key] !== actor);
function addPersonalContributionTx(s, g, c) {
  const tx = { id: uid('tx'), type: 'contribution', direction: 'out', amount: c.amount, merchant: g.name, category: 'Group collection', emoji: g.emoji, status: c.status, at: c.at, rail: 'internal', groupId: g.id, contributionId: c.id, memberId: c.memberId, walletDebited: c.walletDebited, note: 'Your contribution to shared money' };
  s.transactions.unshift(tx); c.transactionId = tx.id; return tx;
}
function reflectContributionTx(s, c) { const tx = s.transactions.find(t => t.id === c.transactionId); if (tx) { tx.status = c.status; tx.walletDebited = c.walletDebited; } return tx; }
/** A changed payout rule needs fresh, explicit acceptance and fresh payout approvals. */
function reviseGroupMandate(g, actor) {
  g.mandateRevision = (g.mandateRevision || 1) + 1;
  g.mandateChangedAt = now();
  const creator = g.members.find(m => m.id === actor);
  if (creator) creator.mandateAcceptedRevision = g.mandateRevision;
  for (const payout of g.payouts.filter(p => ['pending','approved','failed'].includes(p.status))) {
    payout.approvals = []; payout.reviews = {};
    if (payout.status !== 'failed') payout.status = 'pending';
    payout.revision = (payout.revision || 1) + 1;
    payout.approvalFingerprint = payoutDetails(payout);
    addPayoutHistory(payout, 'edit', actor);
  }
}
function inviteGroupMember(g, p) {
  if (!actorIsCreator(g)) return fail('Only the group creator can invite members.');
  if (g.status === 'closed') return fail('This collection is closed. Its history remains available to existing members.');
  const name = clean(p.name, 60).replace(/\s+/g, ' '), phone = clean(p.phone, 30).replace(/[\s()-]/g, ''), phoneKey = phone.replace(/^\+233/, '0');
  if (!name || phone && !/^(0\d{9}|\+233\d{9})$/.test(phone)) return fail('Add a name and a valid Ghana phone number if you use one.');
  const identified = p.memberId ? g.members.find(m => m.id === clean(p.memberId,80)) : phone ? g.members.find(m => normalizedGroupPhone(m.phone) === phoneKey) : null;
  if (identified && identified.status !== 'removed') return fail('This person already has a group membership or invitation.');
  if (phone && g.members.some(m => m.id !== identified?.id && normalizedGroupPhone(m.phone) === phoneKey)) return fail('This phone number belongs to another group member.');
  if (g.members.filter(m => m.status !== 'removed').length >= 50) return fail('This demo collection supports up to fifty members.');
  const role = p.role === 'approver' ? 'approver' : 'contributor';
  if (role === 'approver' && g.payouts.some(payout => payout.status === 'processing')) return fail('Wait for the processing payout before changing its approver agreement.');
  const id = identified?.id || clean(p.memberId, 80) || uid('member');
  if (!identified && g.members.some(m => m.id === id)) return fail('This member already has a group identity.');
  const member = identified || { id, amount: 0 };
  Object.assign(member, { name, ...(phone ? { phone } : {}), role, status: 'invited', invitedAt: now(), invitationVersion: identified ? (identified.invitationVersion || 1) + 1 : 1, mandateAcceptedRevision: 0 });
  delete member.removedAt; delete member.historyConsentAt;
  if (!identified) g.members.push(member);
  if (role === 'approver') {
    g.mandate.approvers = [...new Set([...nominatedApprovers(g).map(m => m.id), id])];
    reviseGroupMandate(g, getGroupActor(g));
  }
  return ok(identified ? 'New invitation created. Their earlier financial history is retained.' : 'Invitation created. They need to accept before seeing the conversation.', { id, member, group: g });
}

export function handleGroupLedgerAction(s, type, p) {
  if (!GROUP_LEDGER_ACTIONS.has(type)) return null;
  if (type === 'createGroup') return createGroup(s, p);
  if (type === 'ensureProjectPrintingDemo') return seedProjectPrinting(s);
  const g = groupFor(s, p); if (!g) return fail('That collection could not be found.');
  const actor = getGroupActor(g), member = activeGroupMember(g);
  if (type === 'setGroupParticipant') {
    if (!g.localSimulation || !g.members.some(m => m.id === p.memberId)) return fail('Choose a participant from this local sample group.');
    g.participantId = p.memberId; return ok('Local participant changed.', { id: g.id, memberId: p.memberId });
  }
  if (type === 'acceptGroupInvite') {
    const invited = g.members.find(m => m.id === actor);
    if (spoofed(p, ['memberId', 'actorId'], actor)) return fail('Accept the selected participant’s own invitation.');
    if (g.status === 'closed') return fail('This collection has closed. This invitation no longer grants access.');
    if (!invited || invited.status !== 'invited') return fail('This invitation is already accepted or no longer active.');
    if (p.invitationVersion !== undefined && p.invitationVersion !== (invited.invitationVersion || 1)) return fail('This invitation changed. Open the current invitation.');
    if (p.mandateRevision !== undefined && p.mandateRevision !== (g.mandateRevision || 1)) return fail('The payout agreement changed. Review the current invitation.');
    if (p.acceptHistory !== true) return fail('Confirm that you understand the group history and payout agreement first.');
    invited.status = 'active'; invited.joinedAt = now(); invited.historyConsentAt = now(); invited.mandateAcceptedRevision = g.mandateRevision || 1; return ok('You joined the group.', { group: g, member: invited });
  }
  if (!member) return fail('Accept your invitation before joining this group conversation or using its money.');
  if (type === 'acceptGroupMandate') {
    if (g.status === 'closed') return fail('This collection is closed.');
    if (spoofed(p, ['memberId','actorId'], actor) || !nominatedApprovers(g).some(m => m.id === actor)) return fail('Only a designated approver can accept this payout agreement.');
    if (p.acceptMandate !== true || p.mandateRevision !== (g.mandateRevision || 1)) return fail('Review and explicitly accept the current payout agreement.');
    member.mandateAcceptedRevision = g.mandateRevision || 1;
    member.mandateAcceptedAt = now();
    return ok('Payout agreement accepted. Payout requests still need their own approvals.', { group: g, member });
  }
  if (type === 'inviteGroupMember' || type === 'addGroupMember') return inviteGroupMember(g, p);
  if (type === 'removeGroupMember' || type === 'setGroupMemberRole') {
    if (!actorIsCreator(g)) return fail('Only the creator can change group membership.');
    const target = g.members.find(m => m.id === p.memberId && m.status !== 'removed');
    if (!target || target.id === g.creatorId) return fail('The creator must remain in this group.');
    if (g.payouts.some(payout => payout.status === 'processing')) return fail('Wait for the processing payment to finish before changing member permissions.');
    if (type === 'setGroupMemberRole' && !['approver', 'contributor'].includes(p.role)) return fail('Choose a contributor or approver role.');
    const was = nominatedApprovers(g).some(m => m.id === target.id), will = type === 'setGroupMemberRole' && p.role === 'approver';
    if (was && !will && nominatedApprovers(g).filter(m => m.id !== target.id && m.status !== 'removed').length < threshold(g)) return fail('Keep enough designated approvers to meet the group agreement.');
    if (type === 'removeGroupMember') { target.status = 'removed'; target.removedAt = now(); }
    else target.role = p.role;
    const ids = nominatedApprovers(g).filter(m => m.status !== 'removed').map(m => m.id);
    if (will && !ids.includes(target.id)) ids.push(target.id);
    g.mandate.approvers = ids;
    if (was !== will) reviseGroupMandate(g, actor);
    return ok(type === 'removeGroupMember' ? 'Member removed. Their financial history is retained.' : was !== will ? 'Payout agreement changed. Designated approvers must accept it; open requests need fresh approvals.' : 'Role updated.', { group: g, member: target });
  }
  if (type === 'expireGroupPayouts') {
    let count=0; for (const payout of g.payouts) if(groupPayoutStatus(payout)==='expired'&&payout.status!=='expired'){payout.status='expired';addPayoutHistory(payout,'expired',actor);count++;}
    return ok(count?'Expired payout requests released their reservations.':'Payout dates checked.',{group:g,count});
  }
  if (type === 'closeGroup') {
    if (!actorIsCreator(g)) return fail('Only the creator can close this collection.');
    if (g.status==='closed') return ok('This collection is already closed.',{group:g,duplicate:true});
    if (g.payouts.some(p=>p.status==='processing') || (g.contributions||[]).some(c=>c.status==='pending')) return fail('Resolve processing contributions and payouts before closing the collection.');
    const refunds=collectionRefundPreview(g);
    if(refunds.some(r=>!r.memberId))return fail('Some opening collection money has no recorded contributor. Review its original sources before closing.');
    if (!money(s.wallet+refunds.filter(r=>r.walletCredit).reduce((n,r)=>n+r.amount,0))) return fail('Check the personal account limit before returning these funds.');
    if (refunds.reduce((n,r)=>n+r.amount,0)!==g.balance) return fail('The collection sources need review before a safe refund can be made.');
    for (const payout of g.payouts) if(['pending','approved','failed'].includes(payout.status)){payout.status='cancelled';addPayoutHistory(payout,'cancelled',actor);}
    for (const r of refunds) {
      const refund={...r,id:uid('group-refund'),at:now(),status:'success'};g.refunds.push(refund);
      const c=g.contributions.find(c=>c.id===r.contributionId);c.refundedAmount=(c.refundedAmount||0)+r.amount;
      if (r.walletCredit){s.wallet+=r.amount;s.transactions.unshift({id:uid('tx'),type:'groupRefund',direction:'in',amount:r.amount,merchant:g.name,category:'Group refund',emoji:g.emoji,rail:'internal',status:'success',at:refund.at,groupId:g.id,refundId:refund.id,parentContributionId:c.id,note:'Unused group money returned to its original source'});}
    }
    g.balance=0;g.status='closed';g.closedAt=now();g.closedBy=actor;
    return ok('Collection closed. Unused money returned proportionally to the original contributors.',{group:g,refunds:g.refunds});
  }
  if (['contributeGroup','retryGroupContribution','requestPayout','approvePayout','executePayout','retryGroupPayout'].includes(type)) {
    if (g.status==='closed') return fail('This collection is closed. Its conversation and financial history are retained.');
    if (!groupMandateReady(g)) return fail('The designated approvers must accept the current payout agreement before money actions continue. Open Your people to review it.');
  }
  if (type === 'contributeGroup') {
    if (spoofed(p, ['memberId', 'actorId'], actor)) return fail('Contribute as the selected participant.');
    if(groupCollectionStatus(g)==='deadline-passed')return fail('The collection deadline has passed. Review the collected money or close and refund it.');
    const capacity=Math.max(0,g.target-groupSummary(g).collected-(g.contributions||[]).filter(c=>c.status==='pending').reduce((n,c)=>n+c.amount,0));
    if(p.amount>capacity)return fail(`Only ${cash(capacity)} is still needed after pending contributions.`);
    const status = p.status || 'success';
    if (!positive(p.amount) || !['pending', 'failed', 'success'].includes(status) || !money(g.balance + p.amount) || actor === 'me' && status !== 'failed' && p.amount > s.wallet) return fail('Choose an amount within your available money.');
    if (actor !== 'me' && !g.localSimulation) return fail('This participant must contribute from their own account.');
    const c = { id: uid('contribution'), memberId: actor, memberName: member.name, amount: p.amount, status, at: now(), walletDebited: actor === 'me' && status !== 'failed', simulatedExternal: actor !== 'me', attempt: 1, statusHistory: [] };
    if (c.walletDebited) s.wallet -= c.amount;
    if (status === 'success') { g.balance += c.amount; member.amount += c.amount; }
    addContributionHistory(c, status, actor); g.contributions ||= []; g.contributions.push(c);
    const transaction = actor === 'me' ? addPersonalContributionTx(s, g, c) : undefined;
    return ok(status === 'success' ? 'Your contribution is in.' : status === 'pending' ? 'Contribution processing. It is not collected yet.' : 'Contribution did not complete. No money moved.', { id: g.id, group: g, contribution: c, ...(transaction ? { transaction } : {}) });
  }
  if (type === 'settleGroupContribution' || type === 'retryGroupContribution') {
    const c = (g.contributions || []).find(c => c.id === p.contributionId);
    if (!c || !g.localSimulation || !(actorIsCreator(g) || c.memberId === actor)) return fail('Choose one of your contributions or return to the creator’s simulation.');
    const contributor = g.members.find(m => m.id === c.memberId);
    if (type === 'retryGroupContribution') {
      if(groupCollectionStatus(g)==='deadline-passed')return fail('The collection deadline has passed.');
      const capacity=Math.max(0,g.target-groupSummary(g).collected-(g.contributions||[]).filter(x=>x.status==='pending').reduce((n,x)=>n+x.amount,0));
      if(c.amount>capacity)return fail('This retry would exceed the collection target.');
      if (c.status !== 'failed' || !contributor || contributor.status !== 'active' || c.memberId === 'me' && c.amount > s.wallet) return fail('This contribution cannot be retried right now.');
      c.status = 'pending'; c.attempt = (c.attempt || 1) + 1; c.walletDebited = c.memberId === 'me'; if (c.walletDebited) s.wallet -= c.amount;
      addContributionHistory(c, 'pending', actor); reflectContributionTx(s, c); return ok('Contribution retry processing.', { group: g, contribution: c });
    }
    if (c.status === p.outcome && ['success', 'failed', 'reversed'].includes(p.outcome)) return ok('This contribution update is already recorded.', { group: g, contribution: c, duplicate: true });
    if (c.status === 'pending' && ['success', 'failed'].includes(p.outcome)) {
      if (p.outcome === 'success') {
        if (!money(g.balance + c.amount) || groupSummary(g).collected+c.amount>g.target) return fail('This confirmation would exceed the collection target. Resolve this contribution as failed.');
        g.balance += c.amount; if (contributor) contributor.amount += c.amount;
      } else if (c.walletDebited) { s.wallet += c.amount; c.walletDebited = false; }
    } else if (c.status === 'success' && p.outcome === 'reversed') {
      if (c.amount > g.balance - reserved(g)) return fail('This money is already reserved or paid out. Resolve the payout before reversing the contribution.');
      g.balance -= c.amount; if (contributor) contributor.amount = Math.max(0, contributor.amount - c.amount);
      if (c.walletDebited) { s.wallet += c.amount; c.walletDebited = false; }
    } else return fail('This contribution cannot move to that state.');
    c.status = p.outcome; c.updatedAt = now(); addContributionHistory(c, c.status, actor); reflectContributionTx(s, c);
    return ok(c.status === 'success' ? 'Contribution confirmed once.' : c.status === 'reversed' ? 'Contribution reversed to its source.' : 'Contribution failed. Any held personal money has been returned.', { group: g, contribution: c });
  }
  if (type === 'reviewPayout') {
    const payout=g.payouts.find(x=>x.id===p.payoutId);if(!payout)return fail('That payout could not be found.');
    if(groupPayoutStatus(payout)==='expired')return fail('This request expired. Create a new request with fresh approvals.');
    if(p.revision!==undefined&&p.revision!==payout.revision)return fail('Review the latest payout details.');
    const review={id:uid('group-review'),revision:payout.revision,fingerprint:payoutDetails(payout),at:now(),expiresAt:new Date(Date.now()+GROUP_REVIEW_MS).toISOString()};
    payout.reviews ||= {};payout.reviews[actor]=review;return ok('Exact payout details opened for five minutes.',{group:g,payout,review});
  }
  if (!actorIsApprover(g)) return fail('Only a designated, active approver can act on this payout.');
  if (type === 'requestPayout') {
    if (spoofed(p, ['requesterId', 'actorId'], actor)) return fail('Request this payout as the selected approver.');
    const destination=canonicalGroupRecipient(p);if(!destination.ok)return fail(destination.message);
    const fee=groupPayoutFee(destination.rail);if(p.fee!==undefined&&p.fee!==fee)return fail('The fee changed. Review the exact group payment cost again.');
    const proof=validateGroupEvidence(p.evidence||[]);if(!proof.ok)return fail(proof.message);
    if (!positive(p.amount) || p.amount+fee > groupSummary(g).available) return fail('Choose an amount and fee within the unreserved group funds.');
    const payout = { id: uid('payout'), amount: p.amount, fee, ...destination, note: clean(p.note || p.purpose, 240), evidence:proof.evidence,evidenceReference:clean(p.evidenceReference,120),status: 'pending', approvals: [], declines:[], reviews:{}, requiredApprovals: threshold(g), requestedBy: actor, at: now(), expiresAt:new Date(Date.now()+GROUP_PROPOSAL_MS).toISOString(),policyVersion:1,revision: 1, history: [] };
    delete payout.ok;payout.approvalFingerprint = payoutDetails(payout); addPayoutHistory(payout, 'request', actor); g.payouts.unshift(payout);
    return ok('Payout sent for approval.', { id: payout.id, payoutId: payout.id, payout, group: g });
  }
  const payout = g.payouts.find(x => x.id === p.payoutId); if (!payout) return fail('That payout could not be found.');
  if (groupPayoutStatus(payout)==='expired' && type!=='cancelPayout') return fail('This payout request expired after 48 hours. Create a fresh request.');
  if (p.revision !== undefined && p.revision !== payout.revision) return fail('This request changed. Review the current payout first.');
  if (type === 'editPayout') {
    if (!['pending', 'approved', 'failed','declined'].includes(payout.status)) return fail('This payout can no longer be edited.');
    const amount=p.amount===undefined?payout.amount:p.amount, destination=canonicalGroupRecipient(p,payout);if(!destination.ok)return fail(destination.message);
    const fee=groupPayoutFee(destination.rail),note=p.note===undefined&&p.purpose===undefined?payout.note:clean(p.note||p.purpose,240),proof=validateGroupEvidence(p.evidence===undefined?payout.evidence:p.evidence);if(!proof.ok)return fail(proof.message);
    if(p.fee!==undefined&&p.fee!==fee)return fail('Review the current amount and fee.');
    if(!positive(amount)||amount+fee>g.balance-reserved(g,payout.id))return fail('Review an amount and fee within the group funds.');
    Object.assign(payout,{amount,fee,...destination,note,evidence:proof.evidence,evidenceReference:p.evidenceReference===undefined?payout.evidenceReference:clean(p.evidenceReference,120),status:'pending',approvals:[],declines:[],reviews:{},revision:payout.revision+1,requiredApprovals:threshold(g),expiresAt:new Date(Date.now()+GROUP_PROPOSAL_MS).toISOString()});delete payout.ok;
    payout.approvalFingerprint = payoutDetails(payout); addPayoutHistory(payout, 'edit', actor); return ok('Details changed. Fresh approvals are needed.', { group: g, payout, payoutId: payout.id });
  }
  if(type==='declinePayout'){
    if(payout.status!=='pending'||spoofed(p,['approverId','memberId','actorId'],actor))return fail('Only the selected designated approver can decline a pending request.');
    const review=payout.reviews?.[actor];if(!review||review.fingerprint!==payoutDetails(payout)||Date.parse(review.expiresAt)<=Date.now())return fail('Open the current payout details before declining. Reviews last five minutes.');
    payout.declines ||= [];payout.declines.push({memberId:actor,reason:clean(p.reason||'Please revise this payout.',240),at:now(),revision:payout.revision});payout.status='declined';addPayoutHistory(payout,'declined',actor);
    return ok('Decline recorded. No money moved. A revised request needs fresh approvals.',{group:g,payout});
  }
  if(['approvePayout','executePayout','retryGroupPayout'].includes(type)){
    const checked=canonicalGroupRecipient(payout);if(!checked.ok||groupPayoutFee(payout.rail)!==(payout.fee||0))return fail('Update this older request with the verified recipient and current demo fee before fresh approval.');
  }
  if (type === 'approvePayout') {
    if (spoofed(p, ['approverId', 'memberId', 'actorId'], actor)) return fail('Only the selected participant can give their own approval.');
    if (payout.status !== 'pending' || payout.approvalFingerprint !== payoutDetails(payout)) return fail('This payout changed or is no longer awaiting approval.');
    const review=payout.reviews?.[actor];if(!review||review.revision!==payout.revision||review.fingerprint!==payoutDetails(payout)||Date.parse(review.expiresAt)<=Date.now())return fail('Open the latest payout details first. A review expires after five minutes.');
    if(p.reviewId!==undefined&&p.reviewId!==review.id)return fail('This review was replaced. Open the payout again.');
    if (payout.approvals.includes(actor)) return fail('This approver has already approved.');
    payout.approvals.push(actor); if (eligibleApprovalIds(g, payout).length >= payout.requiredApprovals) payout.status = 'approved';
    addPayoutHistory(payout, 'approval', actor); return ok(payout.status === 'approved' ? 'Approvals complete. Payment is not sent yet.' : 'Approval recorded.', { id: payout.id, payoutId: payout.id, payout, group: g });
  }
  if (type === 'executePayout') {
    const review=payout.reviews?.[actor];if(!review||review.fingerprint!==payoutDetails(payout)||Date.parse(review.expiresAt)<=Date.now())return fail('Open the exact payout details again. Final reviews last five minutes.');
    if (payout.status !== 'approved' || !approvalValid(g, payout) || payout.amount + (payout.fee || 0) > g.balance - reserved(g, payout.id)) return fail('Review the current details and complete the required approvals before sending.');
    payout.status = 'processing'; payout.attempt = (payout.attempt || 0) + 1; payout.processingAt = now(); addPayoutHistory(payout, 'processing', actor);
    return ok('Group payment processing. Waiting for confirmation.', { id: payout.id, payoutId: payout.id, payout, group: g });
  }
  if (type === 'settleGroupPayout') {
    if (!g.localSimulation || !['success', 'failed'].includes(p.outcome)) return fail('Choose a valid local payment outcome.');
    if (payout.status === p.outcome) return ok('This payment result is already recorded.', { group: g, payout, duplicate: true });
    if (payout.status !== 'processing' || !approvalValid(g, payout)) return fail('Only a processing, authorised group payment can receive a result.');
    if (p.outcome === 'success' && payout.amount + (payout.fee || 0) > g.balance) return fail('There is not enough money in the group account.');
    payout.status = p.outcome;
    if (p.outcome === 'success') { g.balance -= payout.amount + (payout.fee || 0); payout.paidAt = now(); }
    else payout.failedAt = now();
    addPayoutHistory(payout, p.outcome, actor); return ok(p.outcome === 'success' ? 'Group payment confirmed.' : 'Payment failed. The group money is still here.', { id: payout.id, payoutId: payout.id, payout, group: g });
  }
  if (type === 'retryGroupPayout') {
    if (payout.status !== 'failed' || !approvalValid(g, payout) || payout.amount + (payout.fee || 0) > groupSummary(g).available) return fail('Review the payout and approvals before retrying.');
    payout.status = 'approved'; addPayoutHistory(payout, 'retry', actor); return ok('Ready to retry. Confirm the payment again.', { group: g, payout, payoutId: payout.id });
  }
  if (type === 'cancelPayout') {
    if (!['pending', 'approved', 'failed','declined'].includes(payout.status)) return fail('This payout is already closed or processing.');
    payout.status = 'cancelled'; addPayoutHistory(payout, 'cancelled', actor); return ok('Payout cancelled. The collection money is available again.', { group: g, payout });
  }
  return fail('This group action is not available.');
}
