/** Local member conversations. Money updates are projected from the group ledger. */
import { getGroupActor, activeGroupMember, canReadGroup, groupSummary, groupMoneyEvents, groupPayoutStatus, groupMandateReady } from './group-ledger.js';
import { cash } from './ui.js';
import { designatedGroupApprovers, groupMandatePending } from './group-policy.js';

const CHAT_VERSION = 1;
const MAX_TEXT = 2000;
const ACTIONS = new Set(['sendGroupMessage', 'resolveGroupMessage', 'retryGroupMessage', 'editGroupMessage', 'removeGroupMessage', 'reportGroupMessage', 'markGroupChatRead', 'setGroupChatPreferences']);
const record = value => !!value && typeof value === 'object' && !Array.isArray(value);
const clean = (value, length = MAX_TEXT) => typeof value === 'string' ? value.trim().slice(0, length) : '';
const validDate = value => typeof value === 'string' && Number.isFinite(Date.parse(value));
const stamp = () => new Date().toISOString();
const fail = message => ({ ok: false, message });
const good = (message, data = {}) => ({ ok: true, message, ...data });
const emptyChat = () => ({ version: CHAT_VERSION, messages: [], readBy: {}, preferences: {}, reports: [] });
const chatOf = group => record(group?.chat) ? group.chat : emptyChat();
const messagesOf = group => Array.isArray(chatOf(group).messages) ? chatOf(group).messages : [];
const memberName = (state, group, id) => id === 'me' ? clean(state.profile?.name, 60) || 'You' : clean(group.members?.find(member => member.id === id)?.name, 60) || 'Former member';
const signature = (text, replyToId = '') => JSON.stringify([text, replyToId]);
const idsAt = (chat, memberId) => Array.isArray(chat.readBy?.[memberId]) ? chat.readBy[memberId] : [];
const stableId = clientId => `group-message:${clientId}`;

export const isGroupChatAction = type => ACTIONS.has(type);

/** Use only on a cloned public projection. Reports belong to a private channel. */
export function redactGroupReports(group) {
  if (record(group?.chat)) group.chat.reports = [];
  return group;
}

/** A response can acknowledge saving a report without repeating its contents. */
export function publicGroupReport(report) {
  return report ? { id: report.id, messageId: report.messageId, status: 'saved' } : null;
}

function sampleMessages(group) {
  const base = validDate(group.createdAt) ? Date.parse(group.createdAt) : Date.now() - 3600000;
  const at = minute => new Date(base + minute * 60000).toISOString();
  return [
    { senderId: 'esi', senderName: 'Esi', text: 'Printing quote is GH₵180 for all six copies. That’s GH₵30 each 📚', minute: 2 },
    { senderId: 'kofi', senderName: 'Kofi', text: 'Nice. Can we get it to the printer before 4 tomorrow? We still need time for binding.', minute: 4 },
    { senderId: 'me', senderName: 'Ama', text: 'Yes! Let’s agree the printing details here, then review the payout together.', minute: 6 },
    { senderId: 'senam', senderName: 'Senam', text: 'My transfer is still pending. I’ll check back when it confirms.', minute: 8 },
  ].map((message, index) => ({ id: `project-printing-message-${index + 1}`, clientId: `project-printing-seed-${index + 1}`, senderId: message.senderId, senderName: group.members?.find(member => member.id === message.senderId)?.name || message.senderName, text: message.text, at: at(message.minute), status: 'sent', clientSignature: signature(message.text) }));
}

/** Called during state migration and creation, never during a read-only projection. */
export function ensureGroupChat(group) {
  if (!record(group)) return null;
  const previous = record(group.chat) ? group.chat : null;
  const originalSample = previous?.messages?.find(message => message.id === 'project-printing-message-3' && message.clientId === 'project-printing-seed-3' && message.text === 'Yes! Let’s check the final PDF here first, then review the payout together.' && !message.editedAt);
  if (originalSample) { originalSample.text = 'Yes! Let’s agree the printing details here, then review the payout together.'; originalSample.clientSignature = signature(originalSample.text); }
  const source = previous || emptyChat();
  const seen = new Set(), clients = new Set();
  const messages = (Array.isArray(source.messages) ? source.messages : []).flatMap(value => {
    if (!record(value) || !clean(value.id, 240) || !clean(value.senderId, 80) || seen.has(value.id)) return [];
    const clientId = clean(value.clientId, 160) || value.id;
    if (clients.has(clientId)) return [];
    seen.add(value.id); clients.add(clientId);
    const message = { ...value, id: clean(value.id, 240), clientId, senderId: clean(value.senderId, 80), senderName: clean(value.senderName, 60) || 'Group member', text: typeof value.text === 'string' ? value.text.slice(0, MAX_TEXT) : '', at: validDate(value.at) ? value.at : validDate(group.createdAt) ? group.createdAt : stamp(), status: ['sending', 'sent', 'failed'].includes(value.status) ? value.status : 'failed' };
    if (message.deletedAt) message.text = '';
    if (record(value.reply)) message.reply = { id: clean(value.reply.id, 240), senderId: clean(value.reply.senderId, 80), senderName: clean(value.reply.senderName, 60), text: clean(value.reply.text, 320), kind: value.reply.kind === 'system' ? 'system' : 'message' };
    else delete message.reply;
    message.clientSignature = typeof value.clientSignature === 'string' ? value.clientSignature : signature(message.text, message.reply?.id);
    return [message];
  });
  const readBy = record(source.readBy) ? Object.fromEntries(Object.entries(source.readBy).filter(([memberId]) => clean(memberId, 80)).map(([memberId, ids]) => [memberId, [...new Set((Array.isArray(ids) ? ids : []).filter(id => typeof id === 'string' && id.length <= 240))]])) : {};
  const preferences = record(source.preferences) ? Object.fromEntries(Object.entries(source.preferences).filter(([memberId]) => clean(memberId, 80)).map(([memberId, prefs]) => [memberId, { muted: prefs?.muted === true, financialNotifications: prefs?.financialNotifications !== false }])) : {};
  const reports = (Array.isArray(source.reports) ? source.reports : []).filter(value => record(value) && clean(value.messageId, 240) && clean(value.reporterId, 80)).map(value => ({ ...value, reason: clean(value.reason, 500), status: 'stored-locally' }));
  group.chat = { version: CHAT_VERSION, messages, readBy, preferences, reports };
  if (!previous && group.isSample && group.id === 'group-project-printing') group.chat.messages = sampleMessages(group);
  return group.chat;
}

/** A member can see accepted group history. Other members' unsent drafts stay private. */
export function groupChatTimeline(state, group, memberId = getGroupActor(group)) {
  if (memberId !== getGroupActor(group) || !canReadGroup(group, memberId)) return [];
  const human = messagesOf(group).filter(message => message && (message.status === 'sent' || message.senderId === memberId)).map(message => ({ ...message, kind: 'message', isMine: message.senderId === memberId }));
  const events = groupMoneyEvents(group, state).map(event => ({ ...event, kind: 'system', isMine: false }));
  const unique = new Map();
  for (const entry of human) if (entry && typeof entry.id === 'string' && !unique.has(entry.id)) unique.set(entry.id, entry);
  // Ledger events take precedence even if a damaged local message reused an event ID.
  for (const entry of events) if (entry && typeof entry.id === 'string') {
    unique.delete(entry.id);
    unique.set(entry.id, entry);
  }
  // A ledger can record several transitions in the same millisecond. Preserve
  // their source order instead of comparing textual IDs (where 10 precedes 2).
  return [...unique.values()].map((entry, index) => ({ entry, index }))
    .sort((a, b) => (Date.parse(a.entry.at) || 0) - (Date.parse(b.entry.at) || 0) || a.index - b.index)
    .map(({ entry }) => entry);
}

export function unreadGroupCount(state, group, memberId = getGroupActor(group)) {
  if (memberId !== getGroupActor(group) || !canReadGroup(group, memberId)) return 0;
  const seen = new Set(idsAt(chatOf(group), memberId));
  return groupChatTimeline(state, group, memberId).filter(entry => !seen.has(entry.id) && !entry.deletedAt && (entry.kind === 'system' ? entry.actorId !== memberId : entry.status === 'sent' && entry.senderId !== memberId)).length;
}

export function groupNotificationState(state, group, memberId = getGroupActor(group)) {
  const permitted = memberId === getGroupActor(group) && canReadGroup(group, memberId), prefs = permitted && record(chatOf(group).preferences?.[memberId]) ? chatOf(group).preferences[memberId] : {};
  const accountEnabled = state.settings?.notifications !== false;
  const muted = prefs.muted === true, financialNotifications = prefs.financialNotifications !== false;
  return { muted, financialNotifications, accountEnabled, chatEnabled: permitted && accountEnabled && !muted, financialEnabled: permitted && accountEnabled && financialNotifications, unread: unreadGroupCount(state, group, memberId) };
}

/** Only recognised actions are handled, so the existing ledger can delegate safely. */
export function handleGroupChatAction(state, type, payload = {}) {
  if (!ACTIONS.has(type)) return null;
  if (!record(payload)) return fail('Choose a valid conversation action.');
  const group = state.groups?.find(value => value.id === (payload.groupId || payload.id));
  if (!group) return fail('That group could not be found.');
  const actorId = getGroupActor(group);
  if (!canReadGroup(group, actorId)) return fail('Accept the invitation to join this conversation. Former members no longer have access.');
  if (payload.senderId !== undefined && payload.senderId !== actorId || payload.actorId !== undefined && payload.actorId !== actorId || payload.memberId !== undefined && payload.memberId !== actorId) return fail('Use your current participant’s own account for this action.');
  const current = chatOf(group), messages = messagesOf(group);

  if (type === 'sendGroupMessage') {
    const text = typeof payload.text === 'string' ? payload.text.trim() : '', clientId = clean(payload.clientId, 160);
    if (!text || text.length > MAX_TEXT) return fail('Write a message of up to 2,000 characters.');
    if (!clientId || clientId !== payload.clientId || !/^[\p{L}\p{N}_.:-]+$/u.test(clientId)) return fail('Give this message a valid send reference.');
    const replyToId = payload.replyToId === undefined ? '' : clean(payload.replyToId, 240);
    if (payload.replyToId !== undefined && (!replyToId || replyToId !== payload.replyToId)) return fail('Choose a message in this conversation to reply to.');
    const previous = messages.find(message => message.clientId === clientId);
    const clientSignature = signature(text, replyToId);
    if (previous) return previous.senderId === actorId && previous.clientSignature === clientSignature ? good('This message is already in the conversation.', { id: previous.id, message: previous, duplicate: true }) : fail('That send reference already belongs to another message.');
    const original = replyToId ? groupChatTimeline(state, group, actorId).find(message => message.id === replyToId) : null;
    if (replyToId && (!original || original.deletedAt || original.kind === 'message' && original.status !== 'sent')) return fail('That message is no longer available to reply to.');
    const message = { id: stableId(clientId), clientId, clientSignature, senderId: actorId, senderName: memberName(state, group, actorId), text, at: stamp(), status: 'sending' };
    if (original) message.reply = { id: original.id, senderId: original.senderId || '', senderName: original.kind === 'system' ? 'Lumo update' : original.senderName, text: clean(original.kind === 'system' ? [original.title, original.body].filter(Boolean).join(' · ') : original.text, 320), kind: original.kind };
    ensureGroupChat(group).messages.push(message);
    return good('Sending your message.', { id: message.id, message });
  }

  if (type === 'markGroupChatRead') {
    const timeline = groupChatTimeline(state, group, actorId), visible = new Set(timeline.map(entry => entry.id));
    let requested;
    if (payload.ids !== undefined) {
      if (!Array.isArray(payload.ids) || payload.ids.some(id => typeof id !== 'string' || !visible.has(id))) return fail('Only messages in this conversation can be marked as read.');
      requested = payload.ids;
    } else if (payload.throughId !== undefined) {
      const index = timeline.findIndex(entry => entry.id === payload.throughId);
      if (index < 0) return fail('That message is not in this conversation.');
      requested = timeline.slice(0, index + 1).map(entry => entry.id);
    } else return fail('Choose the visible messages to mark as read.');
    const next = [...new Set([...idsAt(current, actorId), ...requested])];
    const chat = ensureGroupChat(group); Object.defineProperty(chat.readBy, actorId, { value: next, enumerable: true, configurable: true, writable: true });
    return good('Conversation caught up.', { readIds: next, unread: unreadGroupCount(state, group, actorId) });
  }

  if (type === 'setGroupChatPreferences') {
    if (payload.muted === undefined && payload.financialNotifications === undefined || payload.muted !== undefined && typeof payload.muted !== 'boolean' || payload.financialNotifications !== undefined && typeof payload.financialNotifications !== 'boolean') return fail('Choose your conversation notification preferences.');
    const previous = record(current.preferences?.[actorId]) ? current.preferences[actorId] : {};
    const prefs = { muted: payload.muted ?? previous.muted === true, financialNotifications: payload.financialNotifications ?? previous.financialNotifications !== false };
    Object.defineProperty(ensureGroupChat(group).preferences, actorId, { value: prefs, enumerable: true, configurable: true, writable: true });
    return good('Your group notification preferences are saved.', { preferences: prefs });
  }

  const message = messages.find(value => value.id === payload.messageId);
  if (!message) return fail('That member message could not be found.');
  if (type === 'reportGroupMessage') {
    if (message.senderId === actorId || message.status !== 'sent' || message.deletedAt) return fail('Choose another member’s message to report.');
    const reason = typeof payload.reason === 'string' ? payload.reason.trim() : '';
    if (!reason || reason.length > 500) return fail('Add a short reason for this report.');
    const previous = (Array.isArray(current.reports) ? current.reports : []).find(report => report.messageId === message.id && report.reporterId === actorId);
    if (previous) return good('This report is already saved in the demo.', { report: previous, duplicate: true });
    const report = { id: `group-report:${message.id}:${actorId}`, messageId: message.id, reporterId: actorId, reason, at: stamp(), status: 'stored-locally' };
    ensureGroupChat(group).reports.push(report);
    return good('Report saved locally for this prototype. It has not been sent to a moderation team.', { report });
  }
  if (message.senderId !== actorId) return fail('You can only change your own messages.');
  if (message.deletedAt) return type === 'removeGroupMessage' ? good('Message already removed.', { id: message.id, message, duplicate: true }) : fail('This message was removed.');

  if (type === 'resolveGroupMessage') {
    if (!['sent', 'failed'].includes(payload.outcome)) return fail('Choose a valid message delivery result.');
    if (message.status === payload.outcome) return good('Delivery result already recorded.', { id: message.id, message, duplicate: true });
    if (message.status !== 'sending') return fail('Retry this message before changing its delivery result.');
    message.status = payload.outcome;
    if (payload.outcome === 'sent') { message.sentAt = stamp(); delete message.failedAt; }
    else message.failedAt = stamp();
    return good(payload.outcome === 'sent' ? 'Message sent.' : 'Message did not send. Your text is here to retry.', { id: message.id, message });
  }
  if (type === 'retryGroupMessage') {
    if (message.status === 'sending') return good('This message is already sending.', { id: message.id, message, duplicate: true });
    if (message.status === 'sent') return good('This message has already been sent.', { id: message.id, message, duplicate: true });
    if (message.status !== 'failed') return fail('Only a failed message needs another attempt.');
    message.status = 'sending'; delete message.failedAt;
    return good('Trying that message again.', { id: message.id, message });
  }
  if (type === 'editGroupMessage') {
    const text = typeof payload.text === 'string' ? payload.text.trim() : '';
    if (!text || text.length > MAX_TEXT) return fail('Write a message of up to 2,000 characters.');
    if (message.status === 'sending') return fail('Wait for this message to finish sending before editing.');
    if (message.text === text) return good('Message is already up to date.', { id: message.id, message, duplicate: true });
    message.text = text; message.editedAt = stamp();
    return good('Message updated.', { id: message.id, message });
  }
  if (type === 'removeGroupMessage') {
    if (message.status === 'sending') return fail('Wait for this message to finish sending before removing it.');
    message.text = ''; message.deletedAt = stamp();
    return good('Message removed. Group money records stay unchanged.', { id: message.id, message });
  }
  return null;
}

/** A deliberately small private group explainer, using shared group records only. */
export function getGroupAssistantAnswer(state, groupId, question) {
  const group = state.groups?.find(value => value.id === groupId);
  if (!group || !activeGroupMember(group, getGroupActor(group))) return fail('Join this group before asking about it.');
  const q = clean(question, 400).toLowerCase(), summary = groupSummary(group);
  if (/who.*(?:not.*paid|still.*pay|contribut)|hasn.t.*contribut|missing.*contribut/.test(q)) {
    const members = (group.members || []).filter(member => member.status === 'active');
    const waiting = members.filter(member => !(member.amount > 0));
    return good('Here are the confirmed contribution records.', { title: waiting.length ? 'Some contributions are still unconfirmed.' : 'Every joined member has a confirmed contribution.', paragraphs: waiting.length ? [...waiting.map(member => `${memberName(state, group, member.id)}: no confirmed contribution recorded${(group.contributions || []).some(c => c.memberId === member.id && c.status === 'pending') ? '; a contribution is processing' : ''}.`), 'A missing contribution is not an IOU or a promise to pay.'] : ['Every joined member has at least one confirmed contribution. That does not mean each has paid an agreed equal share.'] });
  }
  if (/why|blocked|can.t|cannot|next|what.*do|ready.*pay/.test(q)) {
    if (group.status === 'closed') return good('This collection is closed.', { title: summary.balance > 0 ? 'A merchant refund is ready to return.' : 'The history is still here.', paragraphs: [summary.balance > 0 ? `${cash(summary.balance)} is held in this closed group. ${group.creatorId === getGroupActor(group) ? 'Choose Return merchant refund, review the original-source shares and confirm with your PIN.' : 'Ask the group creator to review Return merchant refund and confirm the original-source returns.'} This does not reopen contributions or payouts.` : 'New contributions and payouts are closed. Review the recorded contributions, returns and payment history.'] });
    if (!groupMandateReady(group)) {
      const pending = groupMandatePending(group).map(member => memberName(state, group, member.id));
      return good('The payout agreement needs acceptance.', { title: 'Review the group agreement first.', paragraphs: [pending.length ? `${pending.join(', ')} still ${pending.length === 1 ? 'needs' : 'need'} to accept the current payout agreement.` : 'There are not enough designated approvers to meet the group agreement.', 'Open Your people to review the current agreement. A message or emoji does not accept it or authorise a payout.'] });
    }
    const actor = getGroupActor(group), approvers = designatedGroupApprovers(group);
    if (!approvers.some(member => member.id === actor)) return good('Only designated approvers can authorise a payout.', { title: 'Your group money stays protected.', paragraphs: [`Ask ${approvers.map(member => memberName(state, group, member.id)).join(', ') || 'the creator'} to open Review payout. You can follow the shared details and contribute, but your chat reply cannot approve money leaving.`] });
    const payout = (group.payouts || []).find(value => ['pending','approved','processing','failed'].includes(groupPayoutStatus(value))) || (group.payouts || [])[0];
    if (payout) {
      const status = groupPayoutStatus(payout);
      if (status === 'expired') return good('This payout request has expired.', { title: 'Create a fresh request.', paragraphs: ['Its 48-hour approval window has ended and its reservation is released. Review the current recipient, amount and evidence, then collect fresh approvals.'] });
      if (status === 'processing') return good('Payment confirmation is still pending.', { title: 'Wait for the confirmed result.', paragraphs: ['Do not send another payout to replace a processing payment. Its status and the group balance update together when the result is confirmed.'] });
      if (status === 'pending') return good('This request still needs approvals.', { title: `${(payout.approvals || []).length} of ${payout.requiredApprovals} approvals recorded.`, paragraphs: ['Open Review payout to check the exact recipient, amount, fee and evidence. Each designated approver gives their own approval; the final payment remains a separate PIN-authorised step.'] });
      if (status === 'approved') return good('The approvals are complete.', { title: 'Review once more before sending.', paragraphs: ['Open Review payout and check the current details. Reviews last five minutes. A current final review and your PIN are still required to send from the group account.'] });
      if (status === 'failed') return good('The payout did not complete.', { title: 'The unpaid money stays in the group.', paragraphs: ['Open its recorded details before retrying. Changed details or expired approvals need a fresh request or review; a chat message cannot retry a payment.'] });
    }
    return good('There is no open payout to authorise.', { title: summary.available > 0 ? 'Review a new payout request.' : 'Collect confirmed contributions first.', paragraphs: [`${cash(summary.available)} is available after existing payout reservations. Group funds stay separate from everyone’s personal money.`] });
  }
  if (/how much.*(?:needed|remaining|left)|still needed|remaining|collected|target/.test(q)) return good('Here’s where the group stands.', { title: summary.remaining === 0 ? 'The target is covered.' : `${cash(summary.remaining)} still needed.`, paragraphs: [`${cash(summary.collected)} in confirmed contributions towards ${cash(summary.target)}. Pending contributions are counted when they confirm.`, `${cash(summary.balance)} is currently held in the group account. Group money stays separate from personal available balances.`] });
  if (/awaiting|approval|pending|payout/.test(q) && !/rules|mandate|agreement/.test(q)) {
    const payouts = (group.payouts || []).filter(payout => ['pending', 'approved', 'processing'].includes(groupPayoutStatus(payout)));
    return good('These are the recorded payout requests.', { title: payouts.length ? `${payouts.length} payout ${payouts.length === 1 ? 'to follow' : 'updates'}.` : 'Nothing awaiting payout.', paragraphs: payouts.length ? payouts.map(payout => `${cash(payout.amount+(payout.fee||0))} total to ${payout.recipient || 'the group recipient'}: ${payout.status === 'processing' ? 'processing, not confirmed yet' : `${(payout.approvals || []).length} of ${payout.requiredApprovals || summary.requiredApprovals} approvals${payout.status === 'approved' ? ', ready for the final payment review' : ''}`}.`) : ['There are no open payout requests in this group.'] });
  }
  if (/rules|mandate|agreement|who.*approv/.test(q)) {
    const waiting = groupMandatePending(group);
    const approvers = designatedGroupApprovers(group).map(member => `${memberName(state, group, member.id)}${waiting.some(person=>person.id===member.id)?' (agreement to accept)':''}`);
    return good('Here’s the group agreement.', { title: `${summary.requiredApprovals} different approvals to pay out.`, paragraphs: [`Designated approvers: ${approvers.join(', ') || 'none currently active'}. A chat reply or an “approved” message does not authorise a payment.`, 'Designated approvers must accept the current payout agreement before money actions begin. Contributor invitations do not pause the group. Use Review payout to check the amount, fee, recipient, purpose and supporting evidence. Each request expires after 48 hours and a review lasts five minutes. After the required approvals, the final payment still goes through processing and confirmation. Changing payout details requires fresh approval.'] });
  }
  return good('Let’s stick to the group’s recorded details.', { title: 'What would you like to check?', paragraphs: ['I can explain how much is still needed, what is awaiting approval, or this group’s payout rules. This private demo answer uses shared group records only.'] });
}
