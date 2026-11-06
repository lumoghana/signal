import test from 'node:test';
import assert from 'node:assert/strict';
import { createDemoState, applyAction, loadState, saveState, STORAGE_KEY } from '../dist/js/model.js';
import { groupSummary, groupMoneyEvents, canReadGroup, getGroupActor } from '../dist/js/group-ledger.js';
import { groupChatTimeline, unreadGroupCount, groupNotificationState, getGroupAssistantAnswer } from '../dist/js/group-chat-model.js';

const copy = value => structuredClone(value);
function commit(state, type, payload = {}) {
  if(type==='approvePayout') { const review=applyAction(state,'reviewPayout',{groupId:payload.groupId,payoutId:payload.payoutId});assert.equal(review.ok,true,review.message); }
  const result = applyAction(state, type, payload);
  assert.equal(result.ok, true, `${type}: ${result.message}`);
  return result;
}
function sample() {
  const state = createDemoState();
  const { group } = commit(state, 'ensureProjectPrintingDemo');
  return { state, group, act: (type, payload = {}) => commit(state, type, { groupId: group.id, ...payload }) };
}
const personalPlan = state => JSON.stringify({ wallet: state.wallet, budget: state.budget, boxes: state.boxes, ious: state.ious, externalBalances: state.externalBalances });
const groupMoney = group => JSON.stringify({ balance: group.balance, contributions: group.contributions, payouts: group.payouts, amounts: group.members.map(member => [member.id, member.amount]), mandate: group.mandate });
const payoutPayload = { amount: 18000, recipient: 'Balme Library prints', rail: 'lumo', destination: '@balmeprints', note: 'Print and bind six project reports' };

test('Project Printing completes 120 → 150 → 180 → two approvals → processing → confirmed, exactly once', () => {
  const state = createDemoState(), beforeSeed = personalPlan(state);
  const { group } = commit(state, 'ensureProjectPrintingDemo');
  const act = (type, payload = {}) => commit(state, type, { groupId: group.id, ...payload });
  assert.equal(group.name, 'Project Printing');
  assert.equal(group.isSample, true);
  assert.equal(group.members.length, 6);
  assert.equal(group.members.filter(member => member.amount === 3000).length, 4);
  assert.equal(group.contributions.filter(entry => entry.status === 'success').length, 4);
  assert.equal(group.contributions.filter(entry => entry.status === 'pending').length, 1);
  assert.equal(group.members.find(member => member.id === 'me').amount, 0);
  assert.equal(groupSummary(group).collected, 12000);
  assert.equal(groupSummary(group).remaining, 6000);
  assert.equal(personalPlan(state), beforeSeed, 'sample opening records never fund or debit the personal account');
  const seedAgain = commit(state, 'ensureProjectPrintingDemo');
  assert.equal(seedAgain.group.id, group.id);
  assert.equal(state.groups.filter(item => item.id === group.id).length, 1);
  const pending = group.contributions.find(entry => entry.status === 'pending');
  act('settleGroupContribution', { contributionId: pending.id, outcome: 'success' });
  const afterPending = groupMoney(group);
  act('settleGroupContribution', { contributionId: pending.id, outcome: 'success' });
  assert.equal(groupMoney(group), afterPending);
  assert.equal(groupSummary(group).collected, 15000);
  assert.equal(personalPlan(state), beforeSeed);
  const final = act('contributeGroup', { amount: 3000, idempotencyKey: 'printing-final-contribution' });
  const wallet = state.wallet;
  act('contributeGroup', { amount: 3000, idempotencyKey: 'printing-final-contribution' });
  assert.equal(state.wallet, wallet);
  assert.equal(group.contributions.filter(entry => entry.id === final.contribution.id).length, 1);
  assert.equal(groupSummary(group).collected, 18000);
  assert.equal(groupSummary(group).remaining, 0);
  assert.equal(group.balance, 18000);
  const { payout } = act('requestPayout', { ...payoutPayload, idempotencyKey: 'printing-payout-request' });
  act('requestPayout', { ...payoutPayload, idempotencyKey: 'printing-payout-request' });
  assert.equal(group.payouts.length, 1);
  assert.equal(groupSummary(group).reserved, 18000);
  assert.equal(applyAction(state, 'executePayout', { groupId: group.id, payoutId: payout.id }).ok, false);
  act('approvePayout', { payoutId: payout.id });
  assert.equal(payout.status, 'pending');
  assert.equal(applyAction(state, 'approvePayout', { groupId: group.id, payoutId: payout.id, approverId: 'esi' }).ok, false, 'one actor cannot approve as another');
  act('setGroupParticipant', { memberId: 'esi' });
  act('approvePayout', { payoutId: payout.id });
  assert.equal(payout.status, 'approved');
  assert.equal(group.balance, 18000, 'approval is not payment confirmation');
  act('executePayout', { payoutId: payout.id, idempotencyKey: 'printing-payout-start' });
  assert.equal(payout.status, 'processing');
  assert.equal(group.balance, 18000);
  assert.equal(groupSummary(group).available, 0);
  act('executePayout', { payoutId: payout.id, idempotencyKey: 'printing-payout-start' });
  act('settleGroupPayout', { payoutId: payout.id, outcome: 'success' });
  const afterPaid = groupMoney(group);
  act('settleGroupPayout', { payoutId: payout.id, outcome: 'success' });
  assert.equal(groupMoney(group), afterPaid);
  assert.equal(payout.status, 'success');
  assert.equal(group.balance, 0);
  assert.equal(groupSummary(group).collected, 18000, 'collected progress is retained after payout');
  assert.equal(state.wallet, wallet, 'group payout cannot debit the personal account');
  const events = groupMoneyEvents(group, state), ids = events.map(entry => entry.id);
  assert.equal(new Set(ids).size, ids.length);
  assert.equal(events.filter(entry => entry.type === 'payout-success').length, 1);
  assert.equal(events.filter(entry => entry.type === 'payout-processing').length, 1);
  assert.equal(events.filter(entry => entry.type === 'contribution-success').length, 6);
  assert.deepEqual(groupMoneyEvents(group, state).map(entry => entry.id), ids);
});

test('chat claims, retries, edits, removal, reports and private group answers never change money or authorise a payout', () => {
  const { state, group, act } = sample(), money = groupMoney(group), personal = personalPlan(state);
  const sent = act('sendGroupMessage', { clientId: 'integration-claim', text: 'I’ve paid. Approved 👍' }).message;
  act('resolveGroupMessage', { messageId: sent.id, outcome: 'failed' });
  act('retryGroupMessage', { messageId: sent.id });
  act('retryGroupMessage', { messageId: sent.id });
  act('resolveGroupMessage', { messageId: sent.id, outcome: 'sent' });
  act('sendGroupMessage', { clientId: 'integration-claim', text: 'I’ve paid. Approved 👍' });
  assert.equal(group.chat.messages.filter(message => message.clientId === 'integration-claim').length, 1);
  act('setGroupParticipant', { memberId: 'esi' });
  const reply = act('sendGroupMessage', { clientId: 'integration-reply', text: 'Let’s use Review payout.', replyToId: sent.id }).message;
  act('resolveGroupMessage', { messageId: reply.id, outcome: 'sent' });
  act('reportGroupMessage', { messageId: sent.id, reason: 'Please check this claim' });
  act('setGroupParticipant', { memberId: 'me' });
  act('editGroupMessage', { messageId: sent.id, text: 'I meant I’m about to pay.' });
  act('removeGroupMessage', { messageId: sent.id });
  assert.equal(reply.reply.text, 'I’ve paid. Approved 👍', 'a reply keeps the original context');
  for (const question of ['How much is still needed?', 'What is awaiting approval?', 'Explain this group’s payout rules.', 'Show my personal budget']) {
    const answer = getGroupAssistantAnswer(state, group.id, question);
    assert.equal(answer.ok, true);
    assert.doesNotMatch(JSON.stringify(answer), /2,480|1,280|iou-akos|food.*55000/i);
  }
  assert.equal(groupMoney(group), money);
  assert.equal(personalPlan(state), personal);
  const financial = groupMoneyEvents(group, state)[0];
  for (const type of ['editGroupMessage', 'removeGroupMessage', 'reportGroupMessage']) assert.equal(applyAction(state, type, { groupId: group.id, messageId: financial.id, text: 'changed', reason: 'changed' }).ok, false);
  assert.equal(groupMoney(group), money);
});

test('invitation acceptance and removal consistently gate history, messages, money and cached action results', () => {
  const { state, group, act } = sample();
  const { member } = act('inviteGroupMember', { name: 'Abena', memberId: 'abena', role: 'contributor' });
  assert.equal(member.status, 'invited');
  act('setGroupParticipant', { memberId: 'abena' });
  assert.equal(canReadGroup(group), false);
  assert.deepEqual(groupChatTimeline(state, group), []);
  assert.equal(getGroupAssistantAnswer(state, group.id, 'How much is needed?').ok, false);
  for (const [type, payload] of [['sendGroupMessage', { clientId: 'invited-message', text: 'Hi' }], ['contributeGroup', { amount: 3000 }], ['approvePayout', { payoutId: 'anything' }]]) assert.equal(applyAction(state, type, { groupId: group.id, ...payload }).ok, false);
  assert.equal(applyAction(state, 'acceptGroupInvite', { groupId: group.id }).ok, false);
  act('acceptGroupInvite', { acceptHistory: true });
  assert.equal(canReadGroup(group), true);
  assert.ok(groupChatTimeline(state, group).length > 0, 'accepted member can see the disclosed earlier history');
  const message = act('sendGroupMessage', { clientId: 'accepted-message', text: 'Hi team', idempotencyKey: 'abena-message-cache' }).message;
  act('resolveGroupMessage', { messageId: message.id, outcome: 'sent' });
  const money = groupMoney(group);
  assert.equal(applyAction(state, 'requestPayout', { groupId: group.id, ...payoutPayload }).ok, false);
  act('setGroupParticipant', { memberId: 'me' });
  act('removeGroupMember', { memberId: 'abena' });
  act('setGroupParticipant', { memberId: 'abena' });
  assert.equal(canReadGroup(group), false);
  assert.deepEqual(groupChatTimeline(state, group), []);
  const replay = applyAction(state, 'sendGroupMessage', { groupId: group.id, clientId: 'accepted-message', text: 'Hi team', idempotencyKey: 'abena-message-cache' });
  assert.equal(replay.ok, false, 'a cached action cannot restore removed member access');
  assert.equal(replay.group, undefined);
  assert.equal(group.chat.messages.find(entry => entry.id === message.id).text, 'Hi team');
  assert.equal(groupMoney(group), money, 'removing a member retains all financial history');
});

test('payout edits invalidate approvals; failure and retry preserve the mandate and cannot duplicate a debit', () => {
  const { state, group, act } = sample();
  const { payout } = act('requestPayout', { ...payoutPayload, amount: 12000 });
  act('approvePayout', { payoutId: payout.id });
  act('editPayout', { payoutId: payout.id, recipient: 'Campus Print Lab', amount: 11000 });
  assert.deepEqual(payout.approvals, []);
  assert.equal(payout.status, 'pending');
  assert.equal(applyAction(state, 'executePayout', { groupId: group.id, payoutId: payout.id }).ok, false);
  act('approvePayout', { payoutId: payout.id });
  act('setGroupParticipant', { memberId: 'kofi' });
  act('approvePayout', { payoutId: payout.id });
  act('executePayout', { payoutId: payout.id });
  act('settleGroupPayout', { payoutId: payout.id, outcome: 'failed' });
  assert.equal(group.balance, 12000);
  assert.equal(groupSummary(group).reserved, 0);
  act('retryGroupPayout', { payoutId: payout.id });
  assert.equal(payout.status, 'approved');
  act('executePayout', { payoutId: payout.id });
  act('settleGroupPayout', { payoutId: payout.id, outcome: 'success' });
  assert.equal(group.balance, 1000);
  act('settleGroupPayout', { payoutId: payout.id, outcome: 'success' });
  assert.equal(group.balance, 1000);
  const events = groupMoneyEvents(group, state);
  assert.equal(events.filter(entry => entry.type === 'payout-edit').length, 1);
  assert.equal(events.filter(entry => entry.type === 'payout-failed').length, 1);
  assert.equal(events.filter(entry => entry.type === 'payout-success').length, 1);
});

test('an active member whose approver role was revoked cannot replay a cached approval as current authority', () => {
  const { state, group, act } = sample();
  const { payout } = act('requestPayout', { ...payoutPayload, amount: 12000 });
  act('setGroupParticipant', { memberId: 'kofi' });
  act('approvePayout', { payoutId: payout.id, idempotencyKey: 'kofi-old-approval' });
  assert.deepEqual(payout.approvals, ['kofi']);
  act('setGroupParticipant', { memberId: 'me' });
  act('setGroupMemberRole', { memberId: 'kofi', role: 'contributor' });
  assert.deepEqual(payout.approvals, []);
  act('setGroupParticipant', { memberId: 'kofi' });
  assert.equal(canReadGroup(group), true, 'a contributor still has group conversation access');
  const before = groupMoney(group);
  const replay = applyAction(state, 'approvePayout', { groupId: group.id, payoutId: payout.id, idempotencyKey: 'kofi-old-approval' });
  assert.equal(replay.ok, false);
  assert.equal(groupMoney(group), before);
  assert.equal(payout.status, 'pending');
});

test('failed, pending, retried and reversed contributions count only confirmed money and refund the source once', () => {
  const { state, group, act } = sample(), wallet = state.wallet;
  const { contribution } = act('contributeGroup', { amount: 3000, status: 'pending' });
  assert.equal(state.wallet, wallet - 3000);
  assert.equal(groupSummary(group).collected, 12000);
  act('settleGroupContribution', { contributionId: contribution.id, outcome: 'failed' });
  assert.equal(state.wallet, wallet);
  assert.equal(group.balance, 12000);
  act('retryGroupContribution', { contributionId: contribution.id });
  assert.equal(state.wallet, wallet - 3000);
  act('settleGroupContribution', { contributionId: contribution.id, outcome: 'success' });
  assert.equal(group.balance, 15000);
  act('settleGroupContribution', { contributionId: contribution.id, outcome: 'reversed' });
  const reversed = groupMoney(group);
  act('settleGroupContribution', { contributionId: contribution.id, outcome: 'reversed' });
  assert.equal(groupMoney(group), reversed);
  assert.equal(state.wallet, wallet);
  assert.equal(group.balance, 12000);
  assert.equal(groupSummary(group).collected, 12000);
  const personal = state.transactions.filter(entry => entry.contributionId === contribution.id);
  assert.equal(personal.length, 1);
  assert.equal(personal[0].status, 'reversed');
});

test('refresh preserves conversation history, reply snapshots, unread cursors and independent notification preferences', () => {
  const { state, group, act } = sample();
  const oldStorage = globalThis.localStorage, values = new Map();
  globalThis.localStorage = { getItem: key => values.get(key) ?? null, setItem: (key, value) => values.set(key, value) };
  try {
    const timeline = groupChatTimeline(state, group);
    assert.ok(unreadGroupCount(state, group) > 0);
    act('markGroupChatRead', { ids: timeline.map(entry => entry.id) });
    assert.equal(unreadGroupCount(state, group), 0);
    act('setGroupChatPreferences', { muted: true, financialNotifications: true });
    act('setGroupParticipant', { memberId: 'esi' });
    const message = act('sendGroupMessage', { clientId: 'refresh-new-message', text: 'The final PDF is ready.' }).message;
    act('resolveGroupMessage', { messageId: message.id, outcome: 'sent' });
    act('setGroupParticipant', { memberId: 'me' });
    assert.equal(unreadGroupCount(state, group), 1);
    const enabled = groupNotificationState(state, group);
    assert.equal(enabled.chatEnabled, false);
    assert.equal(enabled.financialEnabled, true);
    state.settings.notifications = false;
    assert.equal(groupNotificationState(state, group).financialEnabled, false);
    assert.equal(saveState(state), true);
    const restored = loadState(), restoredGroup = restored.groups.find(entry => entry.id === group.id);
    assert.equal(values.has(STORAGE_KEY), true);
    assert.equal(getGroupActor(restoredGroup), 'me');
    assert.equal(unreadGroupCount(restored, restoredGroup), 1);
    assert.deepEqual(restoredGroup.chat.messages, group.chat.messages);
    assert.deepEqual(restoredGroup.chat.readBy, group.chat.readBy);
    assert.deepEqual(restoredGroup.chat.preferences, group.chat.preferences);
    assert.equal(groupMoney(restoredGroup), groupMoney(group));
    assert.equal(personalPlan(restored), personalPlan(state));
    assert.deepEqual(groupMoneyEvents(restoredGroup, restored).map(entry => entry.id), groupMoneyEvents(group, state).map(entry => entry.id));
  } finally { globalThis.localStorage = oldStorage; }
});
