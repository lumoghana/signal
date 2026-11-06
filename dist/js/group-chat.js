import { esc, cash, icon } from './ui.js';
import { getGroupActor, activeGroupMember, canReadGroup, groupSummary, groupApprovers, groupPayoutStatus, groupCollectionStatus } from './group-ledger.js';
import { groupChatTimeline, unreadGroupCount, groupNotificationState, getGroupAssistantAnswer } from './group-chat-model.js';
import { renderGroupTabs } from './group-overview.js';
import { openGroupMembers, openGroupDetails, openGroupFinancial, openGroupSimulation } from './group-actions.js';

// Local delivery belongs to the message, not to the screen that submitted it.
const deliveries = new WeakMap();
const ref = prefix => `${prefix}-${globalThis.crypto?.randomUUID?.() || `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`}`;
const frames = callback => typeof requestAnimationFrame === 'function' ? requestAnimationFrame(callback) : setTimeout(callback, 0);
const cancelFrame = handle => typeof cancelAnimationFrame === 'function' ? cancelAnimationFrame(handle) : clearTimeout(handle);
const sameChat = (ctx, groupId, actorId) => ctx.route?.section === 'life' && ctx.route?.page === 'group-chat' && ctx.route?.id === groupId && getGroupActor(ctx.state.groups?.find(group => group.id === groupId)) === actorId;
const groupAt = (ctx, id) => ctx.state.groups?.find(group => group.id === id);
const overview = id => ({ section: 'life', page: 'group-detail', id });

function composerState(ctx, groupId, actorId) {
  ctx.draft.groupChats ||= {};
  ctx.draft.groupChats[groupId] ||= {};
  const draft = ctx.draft.groupChats[groupId][actorId] ||= { input: '', delivery: {} };
  draft.input = typeof draft.input === 'string' ? draft.input.slice(0, 2000) : '';
  draft.delivery = draft.delivery && typeof draft.delivery === 'object' ? draft.delivery : {};
  return draft;
}
const timeLabel = value => { const date = new Date(value); return Number.isFinite(date.getTime()) ? date.toLocaleTimeString('en-GH', { hour: '2-digit', minute: '2-digit', hour12: false, timeZone: 'Africa/Accra' }) : ''; };
function dateLabel(value) {
  const date = new Date(value), today = new Date();
  if (!Number.isFinite(date.getTime())) return 'Conversation';
  const key = date.toISOString().slice(0, 10), now = today.toISOString().slice(0, 10), yesterday = new Date(today.getTime() - 86400000).toISOString().slice(0, 10);
  return key === now ? 'Today' : key === yesterday ? 'Yesterday' : date.toLocaleDateString('en-GH', { day: 'numeric', month: 'short', year: date.getFullYear() === today.getFullYear() ? undefined : 'numeric', timeZone: 'Africa/Accra' });
}
const initials = name => String(name || '?').trim().split(/\s+/).slice(0, 2).map(word => word[0]).join('').toUpperCase();
const avatarTone = id => [...String(id)].reduce((sum, char) => sum + char.charCodeAt(0), 0) % 4;
const quote = reply => reply ? `<blockquote class="gc-quote"><strong>${esc(reply.senderName || 'Group member')}</strong><span>${esc(reply.text || 'Message removed')}</span></blockquote>` : '';

function humanHTML(message) {
  const name = message.senderName || 'Group member', removed = !!message.deletedAt;
  const delivery = message.status === 'sending' ? 'Sending…' : message.status === 'failed' ? 'Not sent' : 'Sent';
  return `<article class="gc-message${message.isMine ? ' is-mine' : ''}${message.status === 'failed' ? ' is-failed' : ''}${removed ? ' is-removed' : ''}" data-gc-entry="${esc(message.id)}" aria-label="${esc(name)} at ${esc(timeLabel(message.at))}">
    ${message.isMine ? '' : `<span class="gc-avatar tone-${avatarTone(message.senderId)}" aria-hidden="true">${esc(initials(name))}</span>`}
    <div class="gc-message-main"><div class="gc-message-meta"><strong>${esc(message.isMine ? `${name} · You` : name)}</strong>${!removed && message.status !== 'sending' ? `<button type="button" class="gc-message-menu" data-gc-message="${esc(message.id)}" aria-label="Message options for ${esc(name)}">${icon('more', 17)}</button>` : ''}</div>
    <div class="gc-bubble">${quote(message.reply)}<p>${removed ? 'Message removed' : esc(message.text)}</p><div class="gc-message-time"><time datetime="${esc(message.at)}">${esc(timeLabel(message.at))}</time>${message.editedAt && !removed ? '<span>edited</span>' : ''}${message.isMine && !removed ? `<span${message.status === 'sending' ? ' role="status"' : ''}>${esc(delivery)}${message.status === 'sent' ? icon('check', 11) : ''}</span>` : ''}</div></div>
    ${message.isMine && message.status === 'failed' && !removed ? `<button type="button" class="gc-retry" data-gc-retry="${esc(message.id)}">${icon('repeat', 14)} Try again</button>` : ''}</div>
  </article>`;
}

function payoutHTML(payout, group) {
  const status = ({ pending: 'Awaiting approval', approved: 'Ready for final review', processing: 'Processing', success: 'Payment confirmed', failed: 'Payment failed', cancelled: 'Cancelled', declined:'Declined', expired:'Expired' })[groupPayoutStatus(payout)] || groupPayoutStatus(payout);
  const required = payout.requiredApprovals || group.mandate?.threshold || 1;
  return `<div class="gc-payout"><div class="gc-payout-top"><strong>${esc(cash(payout.amount+(payout.fee||0)))}</strong><span>${esc(status)}</span></div><p>To ${esc(payout.recipient || 'group recipient')}</p>${payout.fee?`<p>${cash(payout.amount)} + ${cash(payout.fee)} demo fee</p>`:''}${payout.note || payout.purpose ? `<p class="gc-payout-purpose">${esc(payout.note || payout.purpose)}</p>` : ''}<div class="gc-approval-progress"><span>${(payout.approvals || []).length} of ${required} approvals</span><span>Group account</span></div><button type="button" data-gc-payout="${esc(payout.id)}">Review payout ${icon('arrow', 15)}</button></div>`;
}
function systemHTML(event, group, latestPayoutEvents) {
  const failed = /fail|revers/.test(event.status || event.type || ''), payout = event.payoutId && group.payouts?.find(value => value.id === event.payoutId);
  const contribution = event.contributionId && group.contributions?.find(value => value.id === event.contributionId);
  if (contribution) {
    const name = contribution.memberName || group.members?.find(value => value.id === contribution.memberId)?.name || 'Group member';
    const status = ({ success: 'Contribution confirmed', pending: 'Contribution processing', failed: 'Contribution failed', reversed: 'Contribution reversed' })[event.status] || event.title || 'Contribution update';
    return `<article class="gc-system gc-contribution-event${failed ? ' is-warning' : ''}" data-gc-entry="${esc(event.id)}" aria-label="Lumo update"><details><summary><span class="gc-event-status" aria-hidden="true">${icon(failed ? 'info' : event.status === 'success' ? 'check' : 'clock', 16)}</span><span class="gc-event-copy"><strong>${esc(name)} · ${esc(cash(event.amount))}</strong><span>${esc(status)}</span></span><time datetime="${esc(event.at)}">${esc(timeLabel(event.at))}</time><span class="gc-event-expand" aria-hidden="true">${icon('chevron', 13)}</span></summary>${event.body ? `<p>${esc(event.body)}</p>` : ''}</details></article>`;
  }
  return `<article class="gc-system${failed ? ' is-warning' : ''}" data-gc-entry="${esc(event.id)}"><div class="gc-system-label">${icon(failed ? 'info' : event.status === 'success' ? 'check' : 'lock', 13)}<span>Lumo update</span><time datetime="${esc(event.at)}">${esc(timeLabel(event.at))}</time></div><strong>${esc(event.title || 'Group money update')}</strong>${event.body ? `<p>${esc(event.body)}</p>` : ''}${payout && latestPayoutEvents.get(payout.id) === event.id ? payoutHTML(payout, group) : ''}</article>`;
}
function timelineHTML(timeline, group) {
  if (!timeline.length) return `<div class="gc-empty"><span>${icon('chat', 32)}</span><h2>The group starts here.</h2><p>Agree the details here.<br>Keep everyone in the picture.</p><small>Messages are for the group. Money updates come from confirmed records.</small></div>`;
  let date = '';
  const latestPayoutEvents = new Map(); timeline.forEach(entry => { if (entry.payoutId) latestPayoutEvents.set(entry.payoutId, entry.id); });
  return timeline.map(entry => { const next = String(entry.at || '').slice(0, 10), separator = next !== date ? `<div class="gc-date"><span>${esc(dateLabel(entry.at))}</span></div>` : ''; date = next; return separator + (entry.kind === 'system' ? systemHTML(entry, group, latestPayoutEvents) : humanHTML(entry)); }).join('');
}

export function renderGroupChat(ctx, route) {
  const group = groupAt(ctx, route.id);
  if (!group) return `<section class="gc-access"><h1>That group isn’t here.</h1><p>Choose one of your groups to carry on.</p><button type="button" class="button" data-gc-action="groups">Your groups</button><button type="button" class="button secondary" data-gc-action="home">Home</button></section>`;
  const actorId = getGroupActor(group), member = activeGroupMember(group, actorId);
  if (!canReadGroup(group, actorId)) return `<section class="gc-access" data-group-chat-denied><span class="gc-access-icon">${icon('lock', 34)}</span><h1>${esc(group.name)}</h1><p>${group.members?.find(value => value.id === actorId)?.status === 'invited' ? 'Accept your invitation before joining the conversation. You can review what the group shares first.' : 'This participant no longer has access to the conversation.'}</p><button type="button" class="button" data-gc-action="overview">View group access</button><button type="button" class="button secondary" data-gc-action="home">Home</button></section>`;
  const draft = composerState(ctx, group.id, actorId), summary = groupSummary(group), timeline = groupChatTimeline(ctx.state, group), notifications = groupNotificationState(ctx.state, group);
  const renderedIds = new Set(Array.isArray(draft.renderedIds) ? draft.renderedIds : []);
  if (draft.followTail === false && renderedIds.size && timeline.some(entry => !renderedIds.has(entry.id))) draft.hasNew = true;
  draft.renderedIds = timeline.map(entry => entry.id);
  const payout = group.payouts?.find(value => ['pending', 'approved', 'processing', 'failed'].includes(groupPayoutStatus(value)));
  const canRequest = group.status!=='closed'&&!payout && summary.remaining === 0 && summary.available > 0 && groupApprovers(group).some(value => value.id === actorId);
  const displayName = actorId === 'me' ? ctx.state.profile?.name || member?.name || 'You' : member?.name || 'Group member';
  const memberCount = group.members?.filter(value => !value.status || value.status === 'active').length || 0;
  const unread = unreadGroupCount(ctx.state, group);
  return `<section class="gc-page" data-group-chat-view aria-label="${esc(group.name)} group chat">
    <header class="gc-topbar"><button type="button" class="gc-back" data-gc-action="overview" aria-label="Back to group overview">${icon('back', 22)}</button><div class="gc-title"><h1>${esc(group.name)}</h1><button type="button" data-gc-action="members">${memberCount} ${memberCount === 1 ? 'member' : 'members'} ${icon('chevron', 11)}</button></div><button type="button" class="gc-home" data-gc-action="home" aria-label="Home">${icon('home', 18)}<span>Home</span></button><button type="button" class="gc-options" data-gc-action="options" aria-label="Group chat options">${icon('more', 21)}</button></header>
    <div class="gc-navigation">${renderGroupTabs(group, 'chat', unread)}<button type="button" class="gc-simulation" data-gc-action="simulation" aria-label="Local participant simulation · ${esc(displayName)}"><span><i></i> Local demo</span><strong>${esc(displayName.split(' ')[0])} ${icon('chevron', 12)}</strong></button></div>
    <div class="gc-money-summary"><button type="button" class="gc-money-copy" data-gc-action="details"><strong>${esc(cash(summary.collected, { decimals: false }))} <span>collected of ${esc(cash(summary.target, { decimals: false }))}</span></strong><small>${summary.remaining ? `${esc(cash(summary.remaining, { decimals: false }))} remaining` : 'Target covered'} · Details ${icon('chevron', 11)}</small></button><div class="gc-money-actions">${group.status!=='closed'&&groupCollectionStatus(group)!=='deadline-passed'&&summary.remaining>0?`<button type="button" class="gc-contribute" data-gc-action="contribute">${icon('plus', 14)} Contribute</button>`:''}${payout ? `<button type="button" class="gc-review" data-gc-payout="${esc(payout.id)}">Review payout ${icon('arrow', 14)}</button>` : canRequest ? `<button type="button" class="gc-review" data-gc-action="request-payout">Request payout ${icon('arrow', 14)}</button>` : ''}</div></div>
    <div class="gc-thread" id="group-chat-thread" role="log" aria-label="Group conversation" aria-live="polite" aria-relevant="additions text">${timelineHTML(timeline, group)}<div class="gc-thread-end" aria-hidden="true"></div></div>
    <div class="gc-new-message-area"><button type="button" class="gc-new-messages" data-gc-action="latest"${!draft.hasNew ? ' hidden' : ''}>${icon('download', 14)} New messages</button></div>
    <footer class="gc-composer-wrap">${draft.reply ? `<div class="gc-reply-draft"><span><strong>Replying to ${esc(draft.reply.senderName || 'group member')}</strong><small>${esc(draft.reply.text)}</small></span><button type="button" data-gc-action="cancel-reply" aria-label="Cancel reply">${icon('close', 17)}</button></div>` : ''}<form class="gc-composer" id="group-chat-form" autocomplete="off"><label class="sr-only" for="group-chat-input">Message the group</label><textarea id="group-chat-input" name="message" rows="1" maxlength="2000" enterkeyhint="send" placeholder="Keep everyone in the picture…" aria-label="Message the group">${esc(draft.input)}</textarea><button type="submit" class="gc-send" aria-label="Send group message"${!draft.input.trim() ? ' disabled' : ''}>${icon('arrow', 20)}</button></form><p class="gc-local-note">Local demo · No live messages between devices${notifications.muted ? ' · Chat muted' : ''}</p></footer>
  </section>`;
}

function scheduleDelivery(ctx, groupId, actorId, messageId, draft) {
  const state = ctx.state;
  if (!deliveries.has(state)) deliveries.set(state, new Map());
  const running = deliveries.get(state), key = `${groupId}:${messageId}`;
  if (running.has(key)) return;
  const outcome = draft.delivery[messageId] || 'sent';
  const timer = setTimeout(() => {
    running.delete(key);
    if (ctx.state !== state) return;
    const group = groupAt(ctx, groupId), message = group?.chat?.messages?.find(value => value.id === messageId);
    if (!group || getGroupActor(group) !== actorId || !canReadGroup(group, actorId) || !message || message.deletedAt || message.status !== 'sending' || message.senderId !== actorId) return;
    const result = ctx.act('resolveGroupMessage', { groupId, messageId, outcome });
    if (!result?.ok) return;
    delete draft.delivery[messageId];
    if (draft.followTail !== false) draft.scrollToEnd = true;
    else draft.hasNew = true;
    ctx.saveDraft?.();
    if (sameChat(ctx, groupId, actorId)) ctx.refresh();
  }, 460);
  running.set(key, timer);
}

export function bindGroupChat(ctx, route) {
  const group = groupAt(ctx, route.id), actorId = group ? getGroupActor(group) : 'me';
  const root = ctx.$('[data-group-chat-view]') || ctx.$('[data-group-chat-denied]');
  if (!root) {
    const buttons = ctx.$$?.('[data-gc-action]') || [];
    const handlers = buttons.map(button => { const action = () => button.dataset.gcAction === 'home' ? ctx.go({ section: 'home', page: 'home' }, { root: true }) : ctx.go({ section: 'life', page: 'groups' }); button.addEventListener('click', action); return () => button.removeEventListener('click', action); });
    return () => handlers.forEach(remove => remove());
  }
  let alive = true, frame = null, composing = false;
  const currentGroup = () => groupAt(ctx, route.id);
  const current = () => sameChat(ctx, route.id, actorId);
  const authorised = () => current() && canReadGroup(currentGroup(), actorId);
  const valid = () => alive && root.isConnected !== false && current();
  const listeners = [], listen = (element, name, callback, options) => { if (!element) return; element.addEventListener(name, callback, options); listeners.push(() => element.removeEventListener(name, callback, options)); };
  const draft = group && canReadGroup(group, actorId) ? composerState(ctx, group.id, actorId) : null;
  const input = root.querySelector('#group-chat-input'), send = root.querySelector('.gc-send'), thread = root.querySelector('#group-chat-thread');
  const notice = root.querySelector('.gc-new-messages');
  const act = (type, payload = {}) => {
    if (!authorised()) return null;
    const result = ctx.act(type, { groupId: route.id, ...payload });
    if (!result?.ok) ctx.toast?.(result?.message || 'Let’s try that again.');
    return result?.ok ? result : null;
  };
  const markRead = () => {
    if (!valid() || !authorised() || !thread || draft?.followTail === false) return;
    const timeline = groupChatTimeline(ctx.state, currentGroup());
    const seen = new Set(currentGroup()?.chat?.readBy?.[actorId] || []), ids = timeline.map(value => value.id).filter(id => !seen.has(id));
    if (ids.length) act('markGroupChatRead', { ids });
    draft.hasNew = false; if (notice) notice.hidden = true;
    root.querySelector('[data-group-tab="chat"] .group-unread')?.remove?.();
  };
  const recordScroll = () => { if (!valid() || !draft || !thread) return; draft.scrollTop = thread.scrollTop; draft.followTail = thread.scrollHeight - thread.scrollTop - thread.clientHeight < 48; if (draft.followTail) markRead(); ctx.saveDraft?.(); };
  const restore = () => {
    if (frame !== null) cancelFrame(frame);
    frame = frames(() => {
      frame = null; if (!valid() || !thread || !draft) return;
      const top = draft.scrollToEnd || draft.scrollTop === undefined ? thread.scrollHeight : draft.scrollTop;
      if (thread.scrollTo) thread.scrollTo({ top, behavior: 'auto' }); else thread.scrollTop = top;
      draft.scrollToEnd = false; recordScroll();
    });
  };
  const autoSize = () => {
    if (!input || !draft) return;
    const computedMax = typeof globalThis.getComputedStyle === 'function' ? Number.parseFloat(globalThis.getComputedStyle(input).maxHeight) : NaN;
    const maximum = Number.isFinite(computedMax) && computedMax >= 44 ? computedMax : root.dataset.gcTight === 'true' ? 66 : root.dataset.gcCompact === 'true' ? 84 : 116;
    input.style.height = 'auto'; input.style.height = `${Math.min(maximum, Math.max(44, input.scrollHeight || 44))}px`;
    input.style.overflowY = input.scrollHeight > maximum ? 'auto' : 'hidden';
    if (send) send.disabled = !input.value.trim();
  };
  const submit = () => {
    if (!valid() || !authorised() || !draft) return;
    const text = String(input?.value || '').trim().slice(0, 2000); if (!text) return;
    const result = act('sendGroupMessage', { clientId: ref('gc'), text, ...(draft.reply?.id ? { replyToId: draft.reply.id } : {}) });
    if (!result) return;
    draft.delivery[result.id] = draft.failNext ? 'failed' : 'sent'; draft.failNext = false;
    draft.input = ''; delete draft.reply; draft.scrollToEnd = true; draft.followTail = true;
    if (input) input.value = ''; if (send) send.disabled = true;
    scheduleDelivery(ctx, group.id, actorId, result.id, draft); ctx.saveDraft?.(); ctx.refresh();
  };
  listen(input, 'input', () => { if (!valid() || !authorised()) return; draft.input = input.value.slice(0, 2000); autoSize(); ctx.saveDraft?.(); if (draft.followTail !== false && thread) thread.scrollTop = thread.scrollHeight; });
  listen(input, 'compositionstart', () => { composing = true; }); listen(input, 'compositionend', () => { composing = false; });
  listen(input, 'keydown', event => { if (event.key === 'Enter' && !event.shiftKey && !event.isComposing && !composing) { event.preventDefault(); submit(); } });
  listen(root.querySelector('#group-chat-form'), 'submit', event => { event.preventDefault(); submit(); });
  listen(thread, 'scroll', recordScroll, { passive: true });

  // Sheets survive a message refresh underneath them. Their own connection and
  // current participant checks prevent stale controls acting after navigation.
  const sheetValid = sheet => sheet?.isConnected !== false && authorised();
  const sheetListen = (element, name, callback) => element?.addEventListener(name, callback);
  const closeRefresh = () => { ctx.closeSheet(); if (authorised()) ctx.refresh(); };
  function editMessage(message) {
    ctx.sheet(`<div class="gc-sheet"><p class="eyebrow">Your message</p><h2>A quick edit.</h2><form data-gc-edit-form><label class="field"><span>Message</span><textarea name="editedMessage" maxlength="2000" required>${esc(message.text)}</textarea></label><p class="error" data-gc-error role="alert"></p><button type="submit" class="button">Save message</button></form><p class="gc-sheet-note">Editing a message never changes group money records.</p></div>`, sheet => {
      sheetListen(sheet.querySelector('[data-gc-edit-form]'), 'submit', event => { event.preventDefault(); if (!sheetValid(sheet)) return; const result = act('editGroupMessage', { messageId: message.id, text: sheet.querySelector('[name="editedMessage"]').value }); if (result) closeRefresh(); });
    });
  }
  function reportMessage(message) {
    ctx.sheet(`<div class="gc-sheet"><p class="eyebrow">Report a message</p><h2>Something isn’t right?</h2><p>Save a report for this prototype. Nothing is sent to a moderation team.</p><form data-gc-report-form><label class="field"><span>What happened?</span><select name="reportReason"><option value="Unwanted or offensive message">Unwanted or offensive message</option><option value="Misleading payment claim">Misleading payment claim</option><option value="Sharing private information">Sharing private information</option></select></label><button type="submit" class="button">Save demo report</button></form><p class="gc-sheet-note">The conversation and financial records stay intact.</p></div>`, sheet => {
      sheetListen(sheet.querySelector('[data-gc-report-form]'), 'submit', event => { event.preventDefault(); if (!sheetValid(sheet)) return; const result = act('reportGroupMessage', { messageId: message.id, reason: sheet.querySelector('[name="reportReason"]').value }); if (result) { closeRefresh(); ctx.toast?.('Report saved locally. No report was sent.'); } });
    });
  }
  function messageOptions(messageId) {
    const message = groupChatTimeline(ctx.state, currentGroup()).find(value => value.id === messageId && value.kind === 'message');
    if (!message || message.deletedAt || message.status === 'sending') return;
    const own = message.senderId === actorId;
    ctx.sheet(`<div class="gc-sheet"><p class="eyebrow">${esc(message.senderName)}</p><p class="gc-message-preview">${esc(message.text)}</p>${message.status === 'sent' ? '<button type="button" class="button secondary" data-gc-sheet-reply>Reply to message</button>' : ''}${own ? '<button type="button" class="button secondary" data-gc-sheet-edit>Edit message</button><button type="button" class="button ghost gc-danger" data-gc-sheet-remove>Remove message</button>' : '<button type="button" class="button secondary" data-gc-sheet-report>Report message</button>'}</div>`, sheet => {
      sheetListen(sheet.querySelector('[data-gc-sheet-reply]'), 'click', () => { if (!sheetValid(sheet)) return; draft.reply = { id: message.id, senderName: message.senderName, text: message.text.slice(0, 180) }; ctx.saveDraft?.(); closeRefresh(); });
      sheetListen(sheet.querySelector('[data-gc-sheet-edit]'), 'click', () => { if (sheetValid(sheet)) editMessage(message); });
      sheetListen(sheet.querySelector('[data-gc-sheet-report]'), 'click', () => { if (sheetValid(sheet)) reportMessage(message); });
      sheetListen(sheet.querySelector('[data-gc-sheet-remove]'), 'click', () => { if (!sheetValid(sheet)) return; ctx.sheet(`<div class="gc-sheet"><h2>Remove your message?</h2><p>A “Message removed” note stays in the conversation. Replies keep their original context. Financial records stay untouched.</p><button type="button" class="button" data-gc-remove-confirm>Remove message</button><button type="button" class="button secondary" data-gc-remove-keep>Keep message</button></div>`, confirm => { sheetListen(confirm.querySelector('[data-gc-remove-confirm]'), 'click', () => { if (sheetValid(confirm) && act('removeGroupMessage', { messageId: message.id })) closeRefresh(); }); sheetListen(confirm.querySelector('[data-gc-remove-keep]'), 'click', () => { if (sheetValid(confirm)) closeRefresh(); }); }); });
    });
  }
  function options() {
    const prefs = groupNotificationState(ctx.state, currentGroup());
    ctx.sheet(`<div class="gc-sheet"><p class="eyebrow">Group conversation</p><h2>Keep it your way.</h2><label class="gc-preference"><span><strong>Mute chat notifications</strong><small>Keep the conversation here, minus the pings.</small></span><input type="checkbox" data-gc-mute${prefs.muted ? ' checked' : ''}></label><label class="gc-preference"><span><strong>Group money notifications</strong><small>Contribution and payout updates.</small></span><input type="checkbox" data-gc-financial${prefs.financialNotifications ? ' checked' : ''}></label>${!prefs.accountEnabled ? '<p class="gc-sheet-note">Notifications are off in your account settings. These choices apply when you turn them back on.</p>' : ''}<button type="button" class="button secondary" data-gc-lux>${icon('spark', 17)} Ask Lux about this group</button><div class="gc-simulation-tools"><p class="eyebrow">Local testing</p><label class="gc-preference"><span><strong>Fail my next send</strong><small>Try a failed message and retry it.</small></span><input type="checkbox" data-gc-fail${draft.failNext ? ' checked' : ''}></label><button type="button" class="button secondary" data-gc-simulation>Switch participant</button><p>No messages or notifications leave this browser. Payment approval still uses the group mandate.</p></div><button type="button" class="button" data-gc-options-done>Done</button></div>`, sheet => {
      sheetListen(sheet.querySelector('[data-gc-mute]'), 'change', event => { if (sheetValid(sheet)) act('setGroupChatPreferences', { muted: event.target.checked }); });
      sheetListen(sheet.querySelector('[data-gc-financial]'), 'change', event => { if (sheetValid(sheet)) act('setGroupChatPreferences', { financialNotifications: event.target.checked }); });
      sheetListen(sheet.querySelector('[data-gc-fail]'), 'change', event => { if (!sheetValid(sheet)) return; draft.failNext = event.target.checked; ctx.saveDraft?.(); });
      sheetListen(sheet.querySelector('[data-gc-options-done]'), 'click', () => { if (sheetValid(sheet)) closeRefresh(); });
      sheetListen(sheet.querySelector('[data-gc-simulation]'), 'click', () => { if (sheetValid(sheet)) openGroupSimulation(ctx, currentGroup()); });
      sheetListen(sheet.querySelector('[data-gc-lux]'), 'click', () => { if (sheetValid(sheet)) privateGroupLumo(); });
    });
  }
  function privateGroupLumo(question = '') {
    if (!authorised()) return;
    const answer = question ? getGroupAssistantAnswer(ctx.state, route.id, question) : null;
    const questions = ['How much is still needed?', 'What is awaiting approval?', 'Explain this group’s payout rules.'];
    ctx.sheet(`<div class="gc-sheet gc-private-lux"><div class="gc-lux-head"><img src="/assets/lux-chat-2d.webp" alt="Lux" width="58" height="58"><div><p class="eyebrow">Private · Only you</p><h2>Ask Lux</h2></div></div><p class="gc-sheet-note">A private group explainer. Lux uses shared group records only. These answers aren’t posted in the chat.</p>${answer ? `<div class="gc-lux-answer"><h3>${esc(answer.title || answer.message)}</h3>${(answer.paragraphs || []).map(paragraph => `<p>${esc(paragraph)}</p>`).join('')}</div>` : '<p>What would help you see this group a little clearer?</p>'}<div class="gc-lux-questions">${questions.map((text, index) => `<button type="button" data-gc-lux-question="${index}">${esc(text)} ${icon('arrow', 14)}</button>`).join('')}</div><button type="button" class="button secondary" data-gc-lux-done>Back to group chat</button></div>`, sheet => { questions.forEach((question, index) => sheetListen(sheet.querySelector(`[data-gc-lux-question="${index}"]`), 'click', () => { if (sheetValid(sheet)) privateGroupLumo(question); })); sheetListen(sheet.querySelector('[data-gc-lux-done]'), 'click', () => { if (sheetValid(sheet)) closeRefresh(); }); });
  }

  listen(root, 'click', event => {
    const button = event.target?.closest?.('button'); if (!valid() || !button || button.disabled) return;
    const action = button.dataset.gcAction;
    if (action === 'home') { ctx.go({ section: 'home', page: 'home' }, { root: true }); return; }
    if (action === 'overview' || button.dataset.groupTab === 'overview') { ctx.go(overview(route.id), { replace: true }); return; }
    if (!authorised()) return;
    if (button.dataset.groupTab === 'chat') return;
    if (button.dataset.gcMessage) { messageOptions(button.dataset.gcMessage); return; }
    if (button.dataset.gcRetry) { const result = act('retryGroupMessage', { messageId: button.dataset.gcRetry }); if (result) { draft.delivery[result.id] = 'sent'; scheduleDelivery(ctx, group.id, actorId, result.id, draft); ctx.saveDraft?.(); ctx.refresh(); } return; }
    if (button.dataset.gcPayout) { openGroupFinancial(ctx, currentGroup(), 'review', button.dataset.gcPayout); return; }
    if (action === 'contribute') openGroupFinancial(ctx, currentGroup(), 'contribute');
    else if (action === 'request-payout') openGroupFinancial(ctx, currentGroup(), 'request');
    else if (action === 'details') openGroupDetails(ctx, currentGroup());
    else if (action === 'members') openGroupMembers(ctx, currentGroup());
    else if (action === 'simulation') openGroupSimulation(ctx, currentGroup());
    else if (action === 'options') options();
    else if (action === 'cancel-reply') { delete draft.reply; ctx.saveDraft?.(); ctx.refresh(); }
    else if (action === 'latest') { draft.scrollToEnd = true; draft.followTail = true; draft.hasNew = false; restore(); }
  });
  const viewport = globalThis.visualViewport;
  const viewportSize = () => {
    const viewportHeight = viewport?.height || globalThis.innerHeight || root.parentElement?.clientHeight;
    if (!valid() || !root.getBoundingClientRect || !Number.isFinite(viewportHeight)) return;
    const available = Math.min(root.parentElement?.clientHeight || viewportHeight, viewportHeight - Math.max(0, root.getBoundingClientRect().top - (viewport?.offsetTop || 0)));
    if (Number.isFinite(available) && available > 0) { root.style.setProperty('--group-chat-height', `${available}px`); root.dataset.gcCompact = String(available <= 500); root.dataset.gcTight = String(available <= 400); }
    autoSize(); if (draft?.followTail !== false) restore();
  };
  listen(viewport, 'resize', viewportSize, { passive: true }); listen(viewport, 'scroll', viewportSize, { passive: true });
  // Connection banners resize the view without resizing the phone viewport.
  // Observe that available space so the composer stays above its bottom edge.
  const parentResize = typeof globalThis.ResizeObserver === 'function' && root.parentElement ? new globalThis.ResizeObserver(viewportSize) : null;
  parentResize?.observe(root.parentElement);
  if (parentResize) listeners.push(() => parentResize.disconnect());
  if (draft) { for (const message of group.chat?.messages || []) if (message.senderId === actorId && message.status === 'sending' && !message.deletedAt) scheduleDelivery(ctx, group.id, actorId, message.id, draft); autoSize(); restore(); viewportSize(); }
  return () => { alive = false; if (frame !== null) cancelFrame(frame); listeners.forEach(remove => remove()); root.style.removeProperty('--group-chat-height'); ctx.saveDraft?.(); };
}
