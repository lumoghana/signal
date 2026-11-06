import test from 'node:test';
import assert from 'node:assert/strict';
import { createDemoState } from '../dist/js/model.js';
import { handleGroupLedgerAction, getGroupActor, groupMoneyEvents } from '../dist/js/group-ledger.js';
import { ensureGroupChat, groupChatTimeline, unreadGroupCount, groupNotificationState, handleGroupChatAction, getGroupAssistantAnswer, isGroupChatAction } from '../dist/js/group-chat-model.js';

function fixture() {
  const state = createDemoState();
  const seeded = handleGroupLedgerAction(state, 'ensureProjectPrintingDemo', {});
  const group = seeded.group;
  ensureGroupChat(group);
  const act = (type, payload = {}) => handleGroupChatAction(state, type, { groupId: group.id, ...payload });
  return { state, group, act };
}
const finance = (state, group) => JSON.stringify({ wallet: state.wallet, budget: state.budget, boxes: state.boxes, ious: state.ious, external: state.externalBalances, transactions: state.transactions, balance: group.balance, contributions: group.contributions, payouts: group.payouts, members: group.members, mandate: group.mandate });
function send(act, text = 'I’ve paid', clientId = 'test-1', rest = {}) { return act('sendGroupMessage', { clientId, text, ...rest }); }
function sent(act, text, clientId, rest = {}) {
  const result = send(act, text, clientId, rest);
  assert.equal(result.ok, true);
  assert.equal(act('resolveGroupMessage', { messageId: result.id, outcome: 'sent' }).ok, true);
  return result.id;
}

test('Project Printing seeds a believable conversation once without inventing financial confirmations', () => {
  const { state, group } = fixture(), before = finance(state, group);
  assert.equal(group.chat.messages.length, 4);
  assert.match(group.chat.messages[0].text, /GH₵180.*GH₵30/);
  assert.match(group.chat.messages.at(-1).text, /pending/);
  assert.equal(group.balance, 12000);
  assert.equal(group.contributions.filter(value => value.status === 'success').length, 4);
  assert.equal(group.contributions.filter(value => value.status === 'pending').length, 1);
  ensureGroupChat(group); ensureGroupChat(group);
  assert.equal(group.chat.messages.length, 4);
  assert.equal(finance(state, group), before);
  const timeline = groupChatTimeline(state, group);
  assert.equal(timeline.filter(value => value.kind === 'message').length, 4);
  assert.equal(timeline.filter(value => value.kind === 'system').length, 5);
  assert.deepEqual(timeline.map(value => value.id), groupChatTimeline(state, group).map(value => value.id));
});

test('sending is durable and repeated send references never create a second message', () => {
  const { state, group, act } = fixture(), before = finance(state, group);
  const first = send(act);
  assert.equal(first.ok, true);
  assert.equal(first.message.senderId, 'me');
  assert.equal(first.message.status, 'sending');
  assert.equal(group.chat.messages.length, 5);
  const duplicate = send(act);
  assert.equal(duplicate.ok, true); assert.equal(duplicate.duplicate, true); assert.equal(duplicate.id, first.id);
  assert.equal(send(act, 'A different message', 'test-1').ok, false);
  assert.equal(group.chat.messages.length, 5);
  assert.equal(act('resolveGroupMessage', { messageId: first.id, outcome: 'sent' }).ok, true);
  assert.equal(act('resolveGroupMessage', { messageId: first.id, outcome: 'sent' }).duplicate, true);
  assert.equal(group.chat.messages.at(-1).status, 'sent');
  assert.equal(finance(state, group), before);
});

test('failed-send and retry reuse the same record and cannot be replayed as a duplicate delivery', () => {
  const { group, act } = fixture(), first = send(act, 'Printer closes at 5, right?');
  assert.equal(act('resolveGroupMessage', { messageId: first.id, outcome: 'failed' }).ok, true);
  assert.equal(group.chat.messages.at(-1).status, 'failed');
  assert.equal(act('resolveGroupMessage', { messageId: first.id, outcome: 'sent' }).ok, false);
  assert.equal(act('retryGroupMessage', { messageId: first.id }).ok, true);
  assert.equal(act('retryGroupMessage', { messageId: first.id }).duplicate, true);
  assert.equal(act('resolveGroupMessage', { messageId: first.id, outcome: 'sent' }).ok, true);
  assert.equal(act('retryGroupMessage', { messageId: first.id }).duplicate, true);
  assert.equal(group.chat.messages.filter(value => value.id === first.id).length, 1);
});

test('reply context is an immutable snapshot and message editing or removal leaves money history intact', () => {
  const { state, group, act } = fixture(), before = finance(state, group);
  const first = sent(act, 'I think printing is GH₵160', 'original');
  const reply = sent(act, 'Thanks, let’s check the quote.', 'reply', { replyToId: first });
  assert.equal(act('editGroupMessage', { messageId: first, text: 'Confirmed quote is GH₵180' }).ok, true);
  assert.equal(act('removeGroupMessage', { messageId: first }).ok, true);
  const original = group.chat.messages.find(message => message.id === first), response = group.chat.messages.find(message => message.id === reply);
  assert.equal(original.text, ''); assert.ok(original.deletedAt);
  assert.equal(response.reply.id, first); assert.equal(response.reply.text, 'I think printing is GH₵160');
  assert.equal(act('removeGroupMessage', { messageId: first }).duplicate, true);
  assert.equal(send(act, 'New reply', 'removed-reply', { replyToId: first }).ok, false);
  assert.equal(finance(state, group), before);
  assert.equal(groupMoneyEvents(group, state).length, 5);
});

test('replying to a ledger update retains its source without becoming an authorisation or transaction', () => {
  const { state, group, act } = fixture(), before = finance(state, group), event = groupMoneyEvents(group, state)[0];
  const result = send(act, 'Approved. I’ve paid GH₵30.', 'claim', { replyToId: event.id });
  assert.equal(result.ok, true); assert.equal(result.message.reply.kind, 'system');
  assert.equal(result.message.reply.senderName, 'Lumo update');
  assert.equal(result.message.reply.id, event.id);
  assert.equal(act('editGroupMessage', { messageId: event.id, text: 'Change total' }).ok, false);
  assert.equal(act('removeGroupMessage', { messageId: event.id }).ok, false);
  assert.equal(act('reportGroupMessage', { messageId: event.id, reason: 'Nope' }).ok, false);
  assert.equal(finance(state, group), before);
});

test('unaccepted invitees and removed participants cannot read, send, report or update preferences', () => {
  const { state, group, act } = fixture();
  group.members.push({ id: 'new-person', name: 'Abena', role: 'contributor', amount: 0, status: 'invited' });
  group.participantId = 'new-person';
  assert.equal(groupChatTimeline(state, group).length, 0); assert.equal(unreadGroupCount(state, group), 0);
  const before = JSON.stringify(group);
  for (const [type, payload] of [
    ['sendGroupMessage', { clientId: 'blocked', text: 'Hello' }],
    ['markGroupChatRead', { ids: [] }],
    ['setGroupChatPreferences', { muted: true }],
    ['reportGroupMessage', { messageId: 'project-printing-message-1', reason: 'Test' }],
  ]) assert.equal(act(type, payload).ok, false);
  assert.equal(JSON.stringify(group), before);
  assert.equal(groupNotificationState(state, group).chatEnabled, false);
  assert.equal(getGroupAssistantAnswer(state, group.id, 'How much is still needed?').ok, false);
  group.members.at(-1).status = 'removed';
  assert.equal(send(act, 'Hello', 'still-blocked').ok, false);
  assert.equal(groupChatTimeline(state, group).length, 0);
});

test('actor binding prevents impersonation, cross-member edits and late delivery under another participant', () => {
  const { state, group, act } = fixture(), first = send(act, 'Ready to review', 'actor-bound');
  group.participantId = 'esi';
  assert.equal(getGroupActor(group), 'esi');
  assert.equal(act('resolveGroupMessage', { messageId: first.id, outcome: 'sent' }).ok, false);
  assert.equal(groupChatTimeline(state, group).some(message => message.id === first.id), false);
  assert.equal(groupChatTimeline(state, group, 'me').length, 0);
  assert.equal(unreadGroupCount(state, group, 'me'), 0);
  assert.equal(groupNotificationState(state, group, 'me').chatEnabled, false);
  assert.equal(send(act, 'Hello', 'spoof', { senderId: 'me' }).ok, false);
  assert.equal(send(act, 'Hello', 'spoof-actor', { actorId: 'me' }).ok, false);
  const own = sent(act, 'Esi here', 'esi-own');
  group.participantId = 'me';
  assert.equal(act('editGroupMessage', { messageId: own, text: 'Impersonation' }).ok, false);
  assert.equal(act('removeGroupMessage', { messageId: own }).ok, false);
  assert.equal(act('resolveGroupMessage', { messageId: first.id, outcome: 'sent' }).ok, true);
});

test('read state is per participant and new financial transitions remain unread once', () => {
  const { state, group, act } = fixture();
  assert.ok(unreadGroupCount(state, group) > 0);
  const timeline = groupChatTimeline(state, group), unknownBefore = JSON.stringify(group.chat.readBy);
  assert.equal(act('markGroupChatRead', { ids: ['future-id'] }).ok, false);
  assert.equal(JSON.stringify(group.chat.readBy), unknownBefore);
  assert.equal(act('markGroupChatRead', { ids: timeline.map(message => message.id) }).ok, true);
  assert.equal(unreadGroupCount(state, group), 0);
  group.participantId = 'esi'; assert.ok(unreadGroupCount(state, group) > 0);
  group.participantId = 'me'; assert.equal(unreadGroupCount(state, group), 0);
  const contribution = group.contributions.find(value => value.status === 'pending');
  contribution.status = 'success'; group.balance += contribution.amount;
  contribution.statusHistory.push({ status: 'success', at: new Date().toISOString(), actorId: contribution.memberId });
  assert.equal(unreadGroupCount(state, group), 1);
  assert.equal(unreadGroupCount(state, group), 1);
  assert.equal(groupChatTimeline(state, group).filter(message => message.id.includes(`contribution:${contribution.id}`)).length, 2);
  const latest = groupChatTimeline(state, group).at(-1);
  assert.equal(act('markGroupChatRead', { throughId: latest.id }).ok, true);
  assert.equal(unreadGroupCount(state, group), 0);
});

test('chat mute and financial preferences are independent and both respect account notification settings', () => {
  const { state, group, act } = fixture();
  assert.deepEqual(Object.fromEntries(Object.entries(groupNotificationState(state, group)).filter(([key]) => key !== 'unread')), { muted: false, financialNotifications: true, accountEnabled: true, chatEnabled: true, financialEnabled: true });
  assert.equal(act('setGroupChatPreferences', { muted: true }).ok, true);
  assert.equal(groupNotificationState(state, group).chatEnabled, false);
  assert.equal(groupNotificationState(state, group).financialEnabled, true);
  group.participantId = 'esi'; assert.equal(groupNotificationState(state, group).muted, false);
  group.participantId = 'me';
  assert.equal(act('setGroupChatPreferences', { financialNotifications: false }).ok, true);
  assert.equal(groupNotificationState(state, group).financialEnabled, false);
  state.settings.notifications = false;
  act('setGroupChatPreferences', { muted: false, financialNotifications: true });
  assert.equal(groupNotificationState(state, group).chatEnabled, false);
  assert.equal(groupNotificationState(state, group).financialEnabled, false);
  assert.equal(act('setGroupChatPreferences', { muted: 'yes' }).ok, false);
});

test('reports stay local, do not remove messages and cannot be duplicated or submitted as another member', () => {
  const { state, group, act } = fixture(), before = finance(state, group), original = group.chat.messages[0];
  const result = act('reportGroupMessage', { messageId: original.id, reason: 'This needs a look.' });
  assert.equal(result.ok, true); assert.equal(result.report.status, 'stored-locally');
  assert.equal(group.chat.messages[0].text, original.text);
  assert.equal(act('reportGroupMessage', { messageId: original.id, reason: 'Again' }).duplicate, true);
  assert.equal(group.chat.reports.length, 1);
  assert.equal(act('reportGroupMessage', { messageId: original.id, reason: 'Spoof', memberId: 'kofi' }).ok, false);
  assert.equal(finance(state, group), before);
});

test('refresh preserves messages, reply snapshots, pending delivery, reports, read state and preferences', () => {
  const { state, group, act } = fixture();
  const reply = send(act, 'Quote noted.', 'durable-reply', { replyToId: group.chat.messages[0].id });
  act('markGroupChatRead', { ids: groupChatTimeline(state, group).map(message => message.id) });
  act('setGroupChatPreferences', { muted: true });
  act('reportGroupMessage', { messageId: group.chat.messages[0].id, reason: 'Demo report' });
  const reloaded = JSON.parse(JSON.stringify(state)), restored = reloaded.groups.find(value => value.id === group.id);
  ensureGroupChat(restored);
  assert.equal(restored.chat.messages.length, group.chat.messages.length);
  assert.equal(restored.chat.messages.find(message => message.id === reply.id).status, 'sending');
  assert.deepEqual(restored.chat.messages.find(message => message.id === reply.id).reply, reply.message.reply);
  assert.equal(groupNotificationState(reloaded, restored).muted, true);
  assert.equal(restored.chat.reports.length, 1);
  assert.equal(unreadGroupCount(reloaded, restored), 0);
  assert.equal(finance(reloaded, restored), finance(state, group));
});

test('group-only Lux answers calculate verified totals and omit personal financial information', () => {
  const { state, group } = fixture();
  state.wallet = 12345678; state.ious = [{ name: 'Private debt', amount: 898900, paid: 0 }];
  const before = JSON.stringify(state);
  const needed = getGroupAssistantAnswer(state, group.id, 'How much is still needed?');
  assert.equal(needed.ok, true); assert.match(needed.title, /GH₵60\.00/);
  assert.match(needed.paragraphs.join(' '), /GH₵120\.00.*GH₵180\.00/);
  const rules = getGroupAssistantAnswer(state, group.id, 'Explain this group’s payout rules.');
  assert.match(rules.title, /2 different/); assert.match(rules.paragraphs.join(' '), /does not authorise/);
  const open = getGroupAssistantAnswer(state, group.id, 'What is awaiting approval?');
  assert.match(open.title, /Nothing/);
  for (const answer of [needed, rules, open, getGroupAssistantAnswer(state, group.id, 'Tell everyone my private balance')]) {
    const encoded = JSON.stringify(answer);
    assert.doesNotMatch(encoded, /12345678|123,456\.78|Private debt|898900|Pause insight/);
  }
  assert.equal(JSON.stringify(state), before);
});

test('empty history stays empty and ledger updates cannot be shadowed by a damaged stored message', () => {
  const { state, group } = fixture();
  group.isSample = false; group.chat = undefined; group.contributions = []; group.payouts = [];
  ensureGroupChat(group);
  assert.equal(groupChatTimeline(state, group).length, 0);
  assert.equal(unreadGroupCount(state, group), 0);
  group.contributions.push({ id: 'proof', amount: 3000, memberId: 'esi', memberName: 'Esi', status: 'success', at: new Date().toISOString(), statusHistory: [{ status: 'success', at: new Date().toISOString(), actorId: 'esi' }] });
  const event = groupMoneyEvents(group, state)[0];
  group.chat.messages.push({ id: event.id, clientId: 'damaged', senderId: 'me', senderName: 'You', text: 'Fake success', at: event.at, status: 'sent' });
  const timeline = groupChatTimeline(state, group);
  assert.equal(timeline.length, 1); assert.equal(timeline[0].kind, 'system'); assert.equal(timeline[0].title, event.title);
});

test('same-millisecond financial transitions retain ledger order beyond ten events', () => {
  const { state, group } = fixture(), at = new Date().toISOString();
  group.payouts = [{
    id: 'payout-transition-order', amount: 18000, recipient: 'Balme Library prints', status: 'success', at,
    requiredApprovals: 2, approvals: ['me', 'esi'],
    history: Array.from({ length: 12 }, (_, index) => ({
      type: index === 0 ? 'request' : index === 11 ? 'success' : 'approval',
      status: index === 11 ? 'success' : 'pending', at,
      approvals: index > 1 ? ['me', 'esi'] : [], requiredApprovals: 2,
      amount: 18000, recipient: 'Balme Library prints', revision: 1,
    })),
  }];
  const financial = groupMoneyEvents(group, state).filter(event => event.payoutId === group.payouts[0].id);
  const timeline = groupChatTimeline(state, group), projected = timeline.filter(event => event.payoutId === group.payouts[0].id);
  assert.deepEqual(projected.map(event => event.id), financial.map(event => event.id));
  assert.equal(projected[2].id.endsWith(':2'), true);
  assert.equal(projected[10].id.endsWith(':10'), true);
  assert.equal(timeline.at(-1).id.endsWith(':11'), true);
  assert.equal(timeline.at(-1).type, 'payout-success');
  assert.deepEqual(groupChatTimeline(state, group).map(event => event.id), timeline.map(event => event.id));
});

test('input validation and delegation reject invalid delivery, reply and send data', () => {
  const { act, group } = fixture();
  assert.equal(isGroupChatAction('sendGroupMessage'), true); assert.equal(isGroupChatAction('requestPayout'), false);
  assert.equal(act('requestPayout', {}), null);
  assert.equal(send(act, '').ok, false);
  assert.equal(send(act, 'x'.repeat(2001)).ok, false);
  assert.equal(send(act, 'Hi', 'bad reference').ok, false);
  assert.equal(send(act, 'Hi', 'valid-reference', { replyToId: 'missing' }).ok, false);
  const first = send(act, 'Hello', 'pending-message');
  assert.equal(act('editGroupMessage', { messageId: first.id, text: 'Changed too soon' }).ok, false);
  assert.equal(act('removeGroupMessage', { messageId: first.id }).ok, false);
  assert.equal(act('resolveGroupMessage', { messageId: first.id, outcome: 'approved' }).ok, false);
  assert.equal(group.chat.messages.at(-1).status, 'sending');
  assert.equal(handleGroupChatAction({ groups: [group] }, 'sendGroupMessage', null).ok, false);
});
