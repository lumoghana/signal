import {runActionFlow} from './approved-flow.js';
import { esc, cash, icon, field, progress, dateLabel } from './ui.js';
import { getGroupActor, activeGroupMember, canReadGroup, groupApprovers, groupSummary, groupPayoutStatus, groupCollectionStatus, groupMandateReady, collectionRefundPreview } from './group-ledger.js';

import { groupPayoutFee, GROUP_EVIDENCE_MAX_BYTES, validateGroupEvidence, designatedGroupApprovers, groupMandatePending, collectionReturnReview } from './group-policy.js';
import { evaluatePayment } from './model.js';
import { reviewOutflowImpact } from './outflow-impact.js';
import { RECIPIENT_BANKS, DEMO_MOMO_ACCOUNTS, validateRecipientLookup, createRecipientLookup } from './recipient-lookup.js';

const uid = () => `group-ui-${globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(36).slice(2)}`}`;
const head = (title, sub = '') => `<div class="life-sheet-head"><h2>${esc(title)}</h2>${sub ? `<p class="muted">${esc(sub)}</p>` : ''}</div>`;
const note = text => `<p class="muted life-note">${esc(text)}</p>`;
const button = (label, action, secondary = false, disabled = false) => `<button type="button" class="button${secondary ? ' secondary' : ''}" data-group-sheet="${action}"${disabled ? ' disabled' : ''}>${esc(label)}</button>`;
const error = '<p class="error group-action-error" role="alert"></p>';
const amountField = (name, value, label = 'Amount') => `<label class="field"><span>${esc(label)}</span><div class="life-currency-input"><span>GH₵</span><input class="input money-input" type="text" inputmode="decimal" name="${name}" value="${esc(value)}" placeholder="0.00" required></div></label>`;
const parseMoney = value => /^\d+(?:\.\d{0,2})?$/.test(String(value || '').trim()) ? Math.round(Number(value) * 100) : NaN;
const memberName = (g, id) => g.members.find(m => m.id === id)?.name || 'Group member';
const isCreator = g => getGroupActor(g) === g.creatorId && canReadGroup(g);
const eligible = g => groupApprovers(g).some(m => m.id === getGroupActor(g));
const payoutKey = p => JSON.stringify([p.amount,p.recipient,p.rail,p.destination,p.note,p.requiredApprovals,p.revision,p.fee,p.bank,p.network,p.evidenceReference,p.evidence]);
const latest = (ctx, g) => ctx.state.groups?.find(x => x.id === g.id);
const valid = (ctx, g, actor = getGroupActor(g)) => latest(ctx, g) === g && getGroupActor(g) === actor && (!ctx.route || ctx.route.id === g.id && ctx.route.section === 'life');
function showError(el, message) { const node = el?.querySelector('.group-action-error'); if (node) node.textContent = message; }
function commit(ctx, g, action, payload = {}, el, actor = getGroupActor(g)) {return runActionFlow(function*(){
  if (!valid(ctx, g, actor) || action !== 'acceptGroupInvite' && !canReadGroup(g)) return null;
  const result = (yield (ctx.actAsync||ctx.act).call(ctx,action, { groupId: g.id, ...payload }));
  if (!result?.ok) { if (el?.isConnected !== false) showError(el, result?.message || 'Please check this step.'); ctx.toast?.(result?.message || 'Please check this step.'); return null; }
  return result;
});}
function finish(ctx, g, message) { ctx.closeSheet(); if (latest(ctx, g) && (!ctx.route || ctx.route.id === g.id)) ctx.refresh(); if (message) ctx.toast?.(message); }
function authorise(ctx, g, title, action, payload, returnTo, el) {
  const actor = getGroupActor(g);
  if (!valid(ctx,g,actor) || el?.isConnected === false || !canReadGroup(g)) return;
  const operationId = uid(), payout = payload.payoutId ? g.payouts.find(p => p.id === payload.payoutId) : null, fingerprint = payout ? payoutKey(payout) : null, revision = payload.revision ?? payout?.revision;
  ctx.auth({ title, onCancel: () => { if (valid(ctx, g, actor)) returnTo(); }, onSuccess: () => {return runActionFlow(function*(){
    if (payout && (payoutKey(payout) !== fingerprint || payout.revision !== revision)) { ctx.toast?.('This payout changed. Review the current details first.'); return; }
    const r = (yield commit(ctx, g, action, { ...payload, ...(payout ? {revision} : {}), idempotencyKey: operationId }, el, actor));
    if (r) finish(ctx, g, r.message);
  });} });
}
function groupGuard(ctx, g) {
  if (canReadGroup(g)) return true;
  ctx.toast?.('Accept this group’s invitation before opening its conversation or money.'); return false;
}

export function openGroupDetails(ctx, g) {
  if (!groupGuard(ctx, g)) return;
  const summary = groupSummary(g);
  ctx.sheet(head('The plan, together.', g.name) + `<div class="panel life-padded group-detail-sheet"><p class="eyebrow">Purpose</p><h3>${esc(g.purpose || g.name)}</h3><div class="group-detail-line"><span>Target</span><strong>${cash(g.target)}</strong></div><div class="group-detail-line"><span>Deadline</span><strong>${g.deadline ? esc(dateLabel(g.deadline)) : 'Not set'}</strong></div><div class="group-detail-line"><span>Collected</span><strong>${cash(summary.collected)}</strong></div><div class="group-detail-line"><span>In the group account</span><strong>${cash(summary.balance)}</strong></div><div class="group-detail-line"><span>Reserved for payouts</span><strong>${cash(summary.reserved)}</strong></div></div><div class="panel life-padded"><h3>The payout agreement</h3><p>${summary.requiredApprovals} different approvals are needed from the designated approvers.</p><p class="muted">${designatedGroupApprovers(g).map(m => `${esc(m.name)}${groupMandatePending(g).some(p=>p.id===m.id)?' (acceptance waiting)':''}`).join(', ') || 'No designated approvers.'}</p><p class="muted">Only designated approvers need to accept the payout agreement before money actions begin. Inviting a contributor does not hold up joined members. Requests expire in 48 hours. A review lasts five minutes. Amount, fee, recipient and evidence are approved together. A message, reply or emoji never authorises a payout.</p></div>${note('Every accepted member can see this group’s conversation and financial history, including earlier activity. Personal balances, budgets and IOUs stay private.')}${isCreator(g)?g.status!=='closed'?button('Close collection & return unused money','close-collection',true):g.balance>0?button('Return merchant refund','close-collection',true):'':''}${g.status==='closed'?note('Collection closed. Contributions, refunds, messages and payout history are retained.'):''}${button('Back to the group', 'close')}`, el => { el.querySelector('[data-group-sheet="close"]').onclick = () => ctx.closeSheet();el.querySelector('[data-group-sheet="close-collection"]')?.addEventListener('click',()=>closeCollection(ctx,g)); });
}

export function openGroupJoin(ctx, g) {
  const actor = getGroupActor(g), member = g.members.find(m => m.id === actor), mandateRevision = g.mandateRevision || 1, invitationVersion = member?.invitationVersion || 1;
  if (member?.status !== 'invited') return;
  ctx.sheet(head(`You’re invited, ${member.name}.`, `Join ${g.name} as ${member.role === 'approver' ? 'an approver' : 'a contributor'}.`) + `<div class="panel life-padded"><h3>Everyone starts in the picture.</h3><p>After joining, you can see the full group conversation, including messages and money activity from before you joined.</p><p class="muted">Purpose: ${esc(g.purpose || g.name)}</p><p class="muted">Every payout needs ${groupSummary(g).requiredApprovals} different approvals.</p><p class="muted">${member.role === 'approver' ? 'You can contribute and review payout requests. Only an explicit authorised approval counts.' : 'You can contribute and join the conversation. You cannot approve payouts.'}</p></div><form class="form-stack"><label class="life-check"><input type="checkbox" name="groupJoinConsent" required><span>I understand the history and payout agreement.</span></label>${error}<button type="submit" class="button">Accept invitation</button></form>${note('Participant simulation on this browser. No invitation is sent to another person.')}`, el => {
    const form = el.querySelector('form'); form.onsubmit = event => {return runActionFlow(function*(){ event.preventDefault(); if (!valid(ctx, g, actor) || el.isConnected === false) return;
      if (!el.querySelector('[name="groupJoinConsent"]').checked) return showError(el, 'Read and accept the group agreement first.');
      if ((yield commit(ctx, g, 'acceptGroupInvite', { acceptHistory:true, mandateRevision, invitationVersion, idempotencyKey: `accept-${g.id}-${actor}-${invitationVersion}-${mandateRevision}` }, el, actor))) finish(ctx, g, 'You’re in. Keep everyone in the picture.');
    });};
  });
}

function inviteMember(ctx, g, rejoining = null) {
  if (!isCreator(g)) return;
  const draftKey = `invite:${g.id}:${rejoining?.id || 'new'}`, draft = ctx.draft.groupMemberDraft ||= {};
  const d = draft[draftKey] ||= { name: rejoining?.name || '', phone: rejoining?.phone || '', role: rejoining?.role === 'approver' ? 'approver' : 'contributor', operationId: uid() };
  ctx.sheet(head(rejoining ? 'Welcome them back.' : 'Who’s joining you?', rejoining ? 'A fresh invitation. Their earlier contributions and messages stay with their existing membership.' : 'They choose whether to accept. Contributor invitations do not pause the group.') + `<form class="form-stack">${field({label:'Their name',name:'groupInviteName',value:d.name,placeholder:'Abena',required:true})}${field({label:'Phone, if you like',name:'groupInvitePhone',value:d.phone,placeholder:'024 000 0000'})}<label class="field"><span>Their role</span><select class="input" name="groupInviteRole"><option value="contributor"${d.role === 'contributor' ? ' selected' : ''}>Contributor</option><option value="approver"${d.role === 'approver' ? ' selected' : ''}>Approver</option></select></label>${note('Adding an approver changes the payout agreement. Existing payout approvals reset, and designated approvers must accept the new rule. Contributor invitations do not change it.')}${error}<button type="submit" class="button">Create demo invitation</button></form>${note('No one is notified. Use Participant simulation to open their invitation, review the history disclosure and accept.')}`, el => {
    const actor = getGroupActor(g), capture = () => { d.name = el.querySelector('[name="groupInviteName"]').value.slice(0,60); d.phone = el.querySelector('[name="groupInvitePhone"]').value.slice(0,30); d.role = el.querySelector('[name="groupInviteRole"]').value; ctx.saveDraft?.(); };
    el.querySelectorAll('input,select').forEach(input => input.addEventListener('input', capture));
    el.querySelector('form').onsubmit = event => {return runActionFlow(function*(){ event.preventDefault(); if (!valid(ctx,g,actor) || el.isConnected === false) return; capture();
      const result = (yield commit(ctx,g,'inviteGroupMember',{name:d.name.trim(),phone:d.phone.trim(),role:d.role,...(rejoining?{memberId:rejoining.id}:{}),idempotencyKey:d.operationId},el,actor));
      if (!result) return; delete draft[draftKey]; ctx.saveDraft?.(); finish(ctx,g,'Invitation ready. They’ll need to accept before joining.');
    });};
  });
}

export function openGroupMembers(ctx, g) {
  if (!groupGuard(ctx,g)) return;
  const creator = isCreator(g), actor = getGroupActor(g), pending = groupMandatePending(g), needsAcceptance = pending.some(m => m.id === actor);
  ctx.sheet(head('Your people.', `${g.members.filter(m => m.status === 'active').length} joined · ${g.members.filter(m => m.status === 'invited').length} invited`) + (needsAcceptance ? `<div class="group-mandate-attention"><strong>The payout agreement changed.</strong><p>Read the current approvers and accept your role. This does not approve a payment.</p>${button('Review payout agreement','accept-mandate')}</div>` : pending.length ? note('Waiting for designated approvers to accept the current payout agreement. Contributor invitations do not hold up the group.') : '') + `<div class="group-member-sheet">${g.members.filter(m => m.status !== 'removed').map(m => `<div class="group-member-item"><span class="group-person-avatar">${esc(m.name.slice(0,1).toUpperCase())}</span><div><strong>${esc(m.name)}${m.id === actor ? ' · You' : ''}</strong><small>${m.id === g.creatorId ? 'Creator · ' : ''}${m.role === 'approver' ? 'Approver' : 'Contributor'} · ${m.status === 'invited' ? 'Invitation pending' : pending.some(person=>person.id===m.id) ? 'Agreement to review' : 'Joined'}${m.phone ? ` · Number ending ${esc(m.phone.slice(-4))}` : ''}</small></div>${creator && m.id !== g.creatorId ? `<button type="button" class="icon-button" data-group-manage="${esc(m.id)}" aria-label="Manage ${esc(m.name)}">${icon('more',20)}</button>` : ''}</div>`).join('')}</div>${creator&&g.status!=='closed' ? button('Invite someone', 'invite') : note('The creator manages invitations and roles.')}${creator&&g.status!=='closed'&&g.members.some(m=>m.status==='removed')?`<details class="group-history-disclosure"><summary>Former members</summary>${g.members.filter(m=>m.status==='removed').map(m=>`<div class="group-former-member"><span>${esc(m.name)}${m.phone?` · Number ending ${esc(m.phone.slice(-4))}`:''}</span><button type="button" class="text-button" data-group-reinvite="${esc(m.id)}">Invite again</button></div>`).join('')}</details>`:''}<details class="group-history-disclosure"><summary>What can members see?</summary><p>Once an invitation is accepted, a member can read the full earlier conversation and group money history. Removed members lose future access. Money records remain intact.</p></details>${button('Participant simulation', 'simulation', true)}`, el => {
    el.querySelector('[data-group-sheet="accept-mandate"]')?.addEventListener('click', () => { if (valid(ctx,g,actor)) openGroupMandate(ctx,g); });
    el.querySelectorAll('[data-group-reinvite]').forEach(b => b.onclick = () => { if (valid(ctx,g,actor)) inviteMember(ctx,g,g.members.find(m=>m.id===b.dataset.groupReinvite&&m.status==='removed')); });
    el.querySelector('[data-group-sheet="invite"]')?.addEventListener('click', () => { if (valid(ctx,g,actor)) inviteMember(ctx,g); });
    el.querySelector('[data-group-sheet="simulation"]').onclick = () => openGroupSimulation(ctx,g);
    el.querySelectorAll('[data-group-manage]').forEach(b => b.onclick = () => { if (!valid(ctx,g,actor)) return; manageMember(ctx,g,b.dataset.groupManage); });
  });
}
export function openGroupMandate(ctx,g) {
  if (!groupGuard(ctx,g)) return;
  const actor = getGroupActor(g), revision = g.mandateRevision || 1, designated = designatedGroupApprovers(g);
  if (!designated.some(m => m.id === actor)) return openGroupMembers(ctx,g);
  ctx.sheet(head('Same group. Clear agreement.', `${g.name} · Agreement ${revision}`) + `<div class="panel life-padded"><h3>${groupSummary(g).requiredApprovals} different approvals per payout.</h3><p>${designated.map(m=>esc(m.name)).join(', ')}</p><p class="muted">Every designated approver must accept this rule. Each payment still needs a separate review, demo PIN and confirmed payment result. A message saying “approved” never counts.</p></div><form class="form-stack"><label class="life-check"><input type="checkbox" name="groupMandateConsent" required><span>I accept my approver role and this payout agreement.</span></label>${error}<button type="submit" class="button">Accept payout agreement</button></form>${button('Back to members','back',true)}`, el => {
    el.querySelector('[data-group-sheet="back"]').onclick=()=>openGroupMembers(ctx,g);
    el.querySelector('form').onsubmit=event=>{return runActionFlow(function*(){event.preventDefault();if(!valid(ctx,g,actor)||el.isConnected===false)return;if(!el.querySelector('[name="groupMandateConsent"]').checked)return showError(el,'Read and accept the current payout agreement first.');if((yield commit(ctx,g,'acceptGroupMandate',{acceptMandate:true,mandateRevision:revision,idempotencyKey:`mandate-${g.id}-${actor}-${revision}`},el,actor)))finish(ctx,g,'Agreement accepted. Payments still need their own approvals.');});};
  });
}
function manageMember(ctx,g,memberId) {
  const m = g.members.find(m => m.id === memberId); if (!m || !isCreator(g) || memberId === g.creatorId) return;
  ctx.sheet(head(m.name, 'A role change or removal updates future chat and money permissions.') + `<p class="muted">Changing designated approvers clears open payout approvals. Each designated approver must accept the updated agreement. The required approval count stays the same.</p>${error}${button(m.role === 'approver' ? 'Make a contributor' : 'Make an approver','role')}${button('Remove from group','remove',true)}${button('Back to members','back',true)}`, el => {
    el.querySelector('[data-group-sheet="back"]').onclick = () => openGroupMembers(ctx,g);
    el.querySelector('[data-group-sheet="role"]').onclick = () => {return runActionFlow(function*(){ if (el.isConnected === false) return; if ((yield commit(ctx,g,'setGroupMemberRole',{memberId,role:m.role === 'approver' ? 'contributor' : 'approver',idempotencyKey:uid()},el))) finish(ctx,g,'Role updated. Check the payout agreement in Your people.'); });};
    el.querySelector('[data-group-sheet="remove"]').onclick = () => ctx.sheet(head(`Remove ${m.name}?`, 'Their earlier messages and financial records stay with the group. They lose future access.') + error + button('Remove member','confirm') + button('Keep in group','back',true), inner => {
      inner.querySelector('[data-group-sheet="back"]').onclick = () => openGroupMembers(ctx,g);
      inner.querySelector('[data-group-sheet="confirm"]').onclick = () => {return runActionFlow(function*(){ if (inner.isConnected === false) return; if ((yield commit(ctx,g,'removeGroupMember',{memberId,idempotencyKey:uid()},inner))) finish(ctx,g,'Member removed. Earlier records are kept.'); });};
    });
  });
}

function contributionResultControls(g,c) {
  const actor=getGroupActor(g);
  if(actor!==g.creatorId&&c.memberId!==actor)return '<span>Only the contributor or creator can test this result.</span>';
  if(c.status==='pending')return `<button type="button" data-group-contribution-result="${esc(c.id)}:success">Simulate confirmation</button><button type="button" data-group-contribution-result="${esc(c.id)}:failed">Simulate failure</button>`;
  if(c.status==='success')return `<button type="button" data-group-contribution-result="${esc(c.id)}:reversed">Simulate reversal</button>`;
  return `<span>Failed contributions do not count.</span><button type="button" data-group-contribution-retry="${esc(c.id)}">Simulate a retry</button>`;
}

export function openGroupSimulation(ctx,g) {
  const actor = getGroupActor(g), canRead = canReadGroup(g), contributions = (g.contributions || []).filter(c => ['pending','success','failed'].includes(c.status));
  ctx.sheet(head('Participant simulation', 'One browser. Sample people. No live messages or payments.') + `<p class="muted">Choose a participant to test their own invitation, conversation and permissions.</p>${canRead && g.isSample && contributions.some(c=>c.status==='pending'&&(actor===g.creatorId||c.memberId===actor)) ? `<div class="group-simulation-next"><p class="eyebrow">Next in the sample</p>${contributions.filter(c=>c.status==='pending'&&(actor===g.creatorId||c.memberId===actor)).map(c=>`<div class="group-simulation-record"><strong>${esc(memberName(g,c.memberId))} · ${cash(c.amount)} pending</strong>${contributionResultControls(g,c)}</div>`).join('')}</div>`:''}<div class="panel">${g.members.map(m => `<button type="button" class="row" data-group-participant="${esc(m.id)}"${m.status === 'removed' ? ' disabled' : ''}><span class="row-icon">${esc(m.name.slice(0,1).toUpperCase())}</span><span class="row-copy"><span class="row-title">${esc(m.name)}${m.id === 'me' ? ' · Account holder' : ''}</span><span class="row-sub">${m.status === 'invited' ? 'Review invitation' : m.status === 'removed' ? 'Removed' : m.role === 'approver' ? 'Approver' : 'Contributor'}${m.phone?` · ${esc(m.phone.slice(-4))}`:''}</span></span>${m.id === actor ? icon('check',18) : icon('chevron',18)}</button>`).join('')}</div>${canRead && contributions.length ? `<details class="group-simulation-results"><summary>Test contribution results</summary><p>Only a confirmed record changes the collection. This changes sample payment results, not another person’s bank account.</p>${contributions.map(c => `<div class="group-simulation-record"><strong>${esc(memberName(g,c.memberId))} · ${cash(c.amount)}</strong><small>${esc(c.status)}</small>${contributionResultControls(g,c)}</div>`).join('')}</details>` : ''}${error}`, el => {
    el.querySelectorAll('[data-group-participant]').forEach(b => b.onclick = () => {return runActionFlow(function*(){ if (el.isConnected === false) return;
      const r = (yield (ctx.actAsync||ctx.act).call(ctx,'setGroupParticipant',{groupId:g.id,memberId:b.dataset.groupParticipant})); if (!r?.ok) return showError(el,r?.message || 'This participant is unavailable.');
      ctx.closeSheet(); if (ctx.route?.page === 'group-chat' && !canReadGroup(g)) ctx.go({section:'life',page:'group-detail',id:g.id},{replace:true}); else ctx.refresh();
    });});
    el.querySelectorAll('[data-group-contribution-retry]').forEach(b => b.onclick = () => {return runActionFlow(function*(){ if (!valid(ctx,g,actor) || el.isConnected === false) return; if ((yield commit(ctx,g,'retryGroupContribution',{contributionId:b.dataset.groupContributionRetry,idempotencyKey:uid()},el,actor))) finish(ctx,g,'Retry processing. Only a confirmed result will count.'); });});
    el.querySelectorAll('[data-group-contribution-result]').forEach(b => b.onclick = () => {return runActionFlow(function*(){ if (!valid(ctx,g,actor) || el.isConnected === false) return; const split=b.dataset.groupContributionResult.lastIndexOf(':'), contributionId=b.dataset.groupContributionResult.slice(0,split), outcome=b.dataset.groupContributionResult.slice(split+1);
      if ((yield commit(ctx,g,'settleGroupContribution',{contributionId,outcome,idempotencyKey:`result-${contributionId}-${g.contributions.find(c=>c.id===contributionId)?.attempt||1}-${outcome}`},el,actor))) finish(ctx,g,outcome === 'success' ? 'Confirmed contribution recorded once.' : outcome === 'reversed' ? 'Reversal recorded. The total is updated.' : 'Failed contribution recorded. It is not collected money.');
    });});
  });
}

export function openGroupFinancial(ctx,g,action,payoutId) {return runActionFlow(function*(){
  if (!groupGuard(ctx,g)) return;
  if (action === 'contribute') return contribute(ctx,g);
  if (action === 'request') return request(ctx,g);
  const payout = g.payouts.find(p => p.id === payoutId) || g.payouts.find(p => !['success','cancelled'].includes(p.status)) || g.payouts[0];
  if (!payout) return ctx.toast?.('There isn’t a payout to review yet.');
  if (action === 'edit') return request(ctx,g,payout);
  if (action === 'cancel') return cancel(ctx,g,payout);
  if (action === 'execute') return (yield execute(ctx,g,payout));
  if (action === 'retry') return retry(ctx,g,payout);
  return (yield review(ctx,g,payout));
});}
function contribute(ctx,g) {
  if(g.status==='closed')return ctx.toast?.('This collection is closed. Its history is still here.');
  if(!groupMandateReady(g))return openWaitingAgreement(ctx,g);
  if(groupCollectionStatus(g)==='deadline-passed')return ctx.toast?.('The collection deadline has passed. Open Details to review or close it.');
  const capacity=Math.max(0,g.target-groupSummary(g).collected-(g.contributions||[]).filter(c=>c.status==='pending').reduce((n,c)=>n+c.amount,0));
  if(!capacity)return ctx.toast?.('The target is covered by confirmed and processing contributions.');
  const actor = getGroupActor(g), me = actor === 'me';
  const key = `${g.id}:${actor}`, d = ctx.draft.groupContribution ||= {};
  if (d.key !== key) Object.assign(d,{key,groupId:g.id,amountText:g.isSample ? String(Math.min(3000,capacity)/100) : '',status:'success',operationId:uid()});
  const show = () => ctx.sheet(head('Put your part in.', `${g.name} · ${cash(capacity)} still needed after pending payments`) + `<form class="form-stack">${amountField('groupContributionAmount',d.amountText)}${me ? note(`From your Everyday account. Available: ${cash(ctx.state.wallet)}.`) : note(`${memberName(g,actor)}’s external contribution is simulated. Your personal Everyday balance is not used.`)}<details class="group-simulation-results"><summary>Test a different result</summary><label class="field"><span>Simulated payment outcome</span><select class="input" name="groupContributionStatus"><option value="success"${d.status === 'success' ? ' selected' : ''}>Confirmed</option><option value="pending"${d.status === 'pending' ? ' selected' : ''}>Pending</option><option value="failed"${d.status === 'failed' ? ' selected' : ''}>Failed</option></select></label></details>${error}<button type="submit" class="button">Review contribution</button></form>${note('Only confirmed money counts towards the target. A chat message or receipt claim does not.')}`, el => {
    const capture=()=>{d.amountText=el.querySelector('[name="groupContributionAmount"]').value;d.status=ctx.connected?'success':el.querySelector('[name="groupContributionStatus"]').value;ctx.saveDraft?.();};
    el.querySelectorAll('input,select').forEach(input=>input.addEventListener('input',capture));
    el.querySelector('form').onsubmit = event => { event.preventDefault(); if (!valid(ctx,g,actor) || el.isConnected === false) return; capture(); const amount=parseMoney(d.amountText);
      if (!Number.isSafeInteger(amount)||amount<=0||amount>capacity||(me && amount>ctx.state.wallet)) return showError(el,`Choose an amount within ${cash(Math.min(capacity,me?ctx.state.wallet:capacity))}.`);
      const status=d.status;ctx.sheet(head('All looking right?', `${cash(amount)} towards ${g.name}`) + `<div class="panel life-padded"><div class="group-detail-line"><span>Contributor</span><strong>${esc(memberName(g,actor))}</strong></div><div class="group-detail-line"><span>Result being tested</span><strong>${esc(d.status === 'success' ? 'Confirmed' : d.status === 'pending' ? 'Pending' : 'Failed')}</strong></div><p class="muted">${me?'This uses your Everyday account.':'This is an external participant payment simulation.'}</p></div>${error}${button('Confirm with demo PIN','confirm')}${button('Edit amount','edit',true)}`, inner => {
        inner.querySelector('[data-group-sheet="edit"]').onclick=show;
        inner.querySelector('[data-group-sheet="confirm"]').onclick=()=>{
          if(!valid(ctx,g,actor)||inner.isConnected===false)return;
          const pin=()=>{if(!valid(ctx,g,actor))return;ctx.auth({title:`Confirm ${cash(amount)} contribution`,onCancel:show,onSuccess:()=>{return runActionFlow(function*(){const r=(yield commit(ctx,g,'contributeGroup',{amount,status,idempotencyKey:d.operationId},inner,actor));if(!r)return;delete ctx.draft.groupContribution;ctx.saveDraft?.();finish(ctx,g,r.message);});}});};
          if(me&&status!=='failed') {
            const impact=evaluatePayment(ctx.state,{amount,fee:0,category:'Other',merchant:g.name});
            if(!impact.allowed)return showError(inner,impact.reason);
            if(impact.needed)return reviewOutflowImpact(ctx,{amount,category:'Other',merchant:g.name,title:'Your share. Your plan.',actionLabel:'Confirm with demo PIN',onContinue:pin,onEdit:()=>{if(valid(ctx,g,actor))show();}});
          }
          pin();
        };
      });
    };
  }); show();
}
function request(ctx,g,payout) {
  if (!eligible(g)) return ctx.toast?.('Only a designated approver can request or change a payout.');
  if(g.status==='closed')return ctx.toast?.('This collection is closed.');
  if(!groupMandateReady(g))return openWaitingAgreement(ctx,g);
  const actor=getGroupActor(g), revision=payout?.revision, reviewedFingerprint=payout?payoutKey(payout):null, summary=groupSummary(g), key=`${g.id}:${actor}:${payout?.id||'new'}`, saved=ctx.draft.groupPayout||{},controller=createRecipientLookup(ctx.connected?{lookup:()=>({ok:false,message:'This payout provider is not connected. Choose a registered Lumo account.'}),delay:0}:undefined);
  const d=saved.key===key?saved:{key,amountText:payout?(payout.amount/100).toFixed(2):g.isSample?(Math.min(summary.available,g.target)/100).toFixed(2):'',recipient:payout?.recipient||(g.isSample?'Balme Library prints':''),rail:String(payout?.rail||'lumo').toLowerCase(),destination:payout?.destination||(g.isSample?'@balmeprints':''),bank:payout?.bank||'',network:payout?.network||'',lookedUp:payout?.lookupSource==='demo',note:payout?.note||(g.isSample?'Print and bind six project reports.':''),evidence:payout?.evidence||[],evidenceReference:payout?.evidenceReference||'',operationId:uid()};ctx.draft.groupPayout=d;
  d.evidence=Array.isArray(d.evidence)?d.evidence.map(file=>({...file})):[];
  const available=()=>groupSummary(g).available+(payout&&['pending','approved'].includes(groupPayoutStatus(payout))?payout.amount+(payout.fee||0):0);
  // Browser file selections and reads cannot be restored from session JSON.
  // Keep only a plain recovery marker; completed, validated evidence stays as-is.
  let evidenceEpoch=0;const evidenceReaders=new Set();
  const stopEvidenceRead=()=>{evidenceEpoch++;for(const reader of evidenceReaders){try{reader.abort();}catch{}}evidenceReaders.clear();};
  const recoverEvidence=()=>{if(['choosing','reading'].includes(d.evidencePick)){d.evidencePick='retry';ctx.saveDraft?.();}};
  recoverEvidence();
  const show=()=>{controller.cancel();stopEvidenceRead();recoverEvidence();ctx.sheet(head(payout?'Fresh details. Fresh approvals.':'What are we paying for?',payout?'Changing the amount, recipient, fee or evidence clears earlier approvals.':'Keep the purpose clear. Everyone can review the same details.')+`<form class="form-stack"><label class="field"><span>Where’s it going?</span><select class="input" name="groupPayoutRail">${[['lumo','A Lumo person or campus merchant'],['momo','Mobile money'],['bank','A bank account']].map(([rail,label])=>`<option value="${rail}"${d.rail===rail?' selected':''}>${label}</option>`).join('')}</select></label>${d.rail==='lumo'?`${field({label:'Recipient name',name:'groupPayoutRecipient',value:d.recipient,placeholder:'Campus printer',required:true})}${field({label:'Lumo handle or merchant code',name:'groupPayoutDestination',value:d.destination,placeholder:'@campusprinter',required:true})}`:`${field({label:d.rail==='bank'?'Their account number':'Their MoMo number',name:'groupPayoutDestination',value:d.destination,placeholder:d.rail==='bank'?'Account number':'024 555 0182',required:true})}${d.rail==='bank'?`<label class="field"><span>Their bank</span><select class="input" name="groupPayoutBank"><option value="">Choose their bank</option>${RECIPIENT_BANKS.map(bank=>`<option value="${esc(bank.label)}"${d.bank===bank.label?' selected':''}>${esc(bank.label)}</option>`).join('')}</select></label>`:''}<div class="inline-actions">${button('Find registered account','lookup',true)}${button('Try a sample','sample',true)}</div>${d.lookedUp?`<div class="notice"><span>${icon('check',18)} <strong>${esc(d.recipient)}</strong><br>${esc(d.rail==='bank'?d.bank:d.network)} · Demo lookup</span></div>`:note(d.rail==='momo'?'Just their number. We find the registered name and network.':'Account number and bank. We find the registered name.')}`}${amountField('groupPayoutAmount',d.amountText)}${field({label:'What’s it for?',name:'groupPayoutNote',value:d.note,placeholder:'Printing six reports',required:true})}<details class="group-history-disclosure"${d.evidencePick==='retry'?' open':''}><summary>Add a reference or sample invoice</summary><p class="notice" data-group-evidence-recovery role="status"${d.evidencePick==='retry'?'':' hidden style="display:none"'}><span>Choose the file again, or continue without it. Your typed payout details are kept.</span></p>${field({label:'Invoice or quote reference (optional)',name:'groupPayoutEvidenceReference',value:d.evidenceReference,placeholder:'PRINT-001'})}<label class="field"><span>Sample documents, up to 2 · 500 KB each</span><input type="file" name="groupPayoutEvidence" accept="image/png,image/jpeg,image/webp,application/pdf" multiple></label><p class="muted">Shared only inside this local group. Use sample documents, not personal financial or identity records. An attachment is evidence for discussion, never proof that someone paid.</p><div data-group-evidence-list>${d.evidence.map((f,i)=>`<p>${esc(f.name)} <button type="button" class="text-button" data-group-evidence-remove="${i}">Remove</button></p>`).join('')}</div></details>${note(`Group funds available: ${cash(available())}. Demo fee: ${cash(groupPayoutFee(d.rail))}.`)}${error}<button type="submit" class="button">${payout?'Review changes':'Review payout request'}</button></form>`,el=>{
    const capture=()=>{const query=name=>el.querySelector(`[name="${name}"]`);d.recipient=query('groupPayoutRecipient')?.value.slice(0,120)||d.recipient;d.amountText=query('groupPayoutAmount').value;d.note=query('groupPayoutNote').value.slice(0,240);d.destination=query('groupPayoutDestination').value.slice(0,100);d.bank=query('groupPayoutBank')?.value||d.bank;d.evidenceReference=query('groupPayoutEvidenceReference')?.value.slice(0,120)||'';ctx.saveDraft?.();};
    const invalidate=()=>{controller.cancel();d.lookedUp=false;d.recipient='';d.network='';const lookupButton=el.querySelector('[data-group-sheet="lookup"]');if(lookupButton){lookupButton.disabled=false;lookupButton.textContent='Find registered account';}el.querySelector('.notice')?.remove?.();capture();};
    el.querySelectorAll('input,select').forEach(input=>input.addEventListener('input',capture));
    el.querySelector('[name="groupPayoutRail"]').addEventListener('change',()=>{if(!valid(ctx,g,actor)||el.isConnected===false)return;capture();d.rail=el.querySelector('[name="groupPayoutRail"]').value;d.recipient='';d.destination='';d.bank='';d.network='';d.lookedUp=false;ctx.saveDraft?.();show();});
    if(d.rail!=='lumo'){
      el.querySelector('[name="groupPayoutDestination"]').addEventListener('input',invalidate);el.querySelector('[name="groupPayoutBank"]')?.addEventListener('change',invalidate);
      el.querySelector('[data-group-sheet="sample"]').onclick=()=>{if(!valid(ctx,g,actor)||el.isConnected===false)return;capture();d.destination=d.rail==='momo'?DEMO_MOMO_ACCOUNTS[0].number:RECIPIENT_BANKS[0].example;d.bank=d.rail==='bank'?RECIPIENT_BANKS[0].label:'';d.lookedUp=false;d.recipient='';show();};
      el.querySelector('[data-group-sheet="lookup"]').onclick=event=>{return runActionFlow(function*(){if(!valid(ctx,g,actor)||el.isConnected===false)return;capture();const checked=validateRecipientLookup(d.rail,{number:d.destination,bank:d.bank});if(!checked.ok)return showError(el,checked.message);const key=checked.key,lookupButton=event.currentTarget;lookupButton.disabled=true;lookupButton.textContent='Finding their account…';showError(el,'');let result;try{result=(yield controller.run(checked.request));}catch{result={ok:false,message:'The demo lookup took too long. Try again.'};}if(!valid(ctx,g,actor)||el.isConnected===false||!result)return;const current=validateRecipientLookup(d.rail,{number:d.destination,bank:d.bank});if(!current.ok||current.key!==key)return;lookupButton.disabled=false;lookupButton.textContent='Find registered account';if(!result.ok)return showError(el,result.message);d.recipient=result.recipient.name;d.destination=result.recipient.number;d.bank=result.recipient.bank||'';d.network=result.recipient.network||'';d.lookedUp=true;ctx.saveDraft?.();show();});};
    }
    el.querySelectorAll('[data-group-evidence-remove]').forEach(b=>b.onclick=()=>{d.evidence.splice(Number(b.dataset.groupEvidenceRemove),1);ctx.saveDraft?.();show();});
    const picker=el.querySelector('[name="groupPayoutEvidence"]');
    const pickState=status=>{d.evidencePick=status;ctx.saveDraft?.();const notice=el.querySelector('[data-group-evidence-recovery]');if(notice){notice.hidden=status!=='retry';if(status==='retry'){notice.style?.removeProperty('display');const details=notice.closest?.('details');if(details)details.open=true;}else notice.style?.setProperty('display','none');}};
    picker.addEventListener('click',()=>{if(!valid(ctx,g,actor)||el.isConnected===false)return;capture();stopEvidenceRead();pickState('choosing');});
    // Supported browsers emit cancel when their chooser closes without a selection.
    picker.addEventListener('cancel',()=>{if(!valid(ctx,g,actor)||el.isConnected===false)return;stopEvidenceRead();pickState('');});
    picker.addEventListener('change',event=>{return runActionFlow(function*(){
      if(!valid(ctx,g,actor)||el.isConnected===false)return;
      capture();stopEvidenceRead();const token=evidenceEpoch,files=[...(event.target.files||[])];
      const current=()=>token===evidenceEpoch&&valid(ctx,g,actor)&&el.isConnected!==false;
      if(!files.length){pickState('');return;}
      if(files.length+d.evidence.length>2){pickState('');return showError(el,'Use up to two small sample documents.');}
      if(files.some(file=>file.size>GROUP_EVIDENCE_MAX_BYTES)){pickState('');return showError(el,'Keep each sample document under 500 KB.');}
      pickState('reading');const added=[];
      for(const file of files){
        const dataUrl=(yield new Promise(resolve=>{let reader;try{reader=new FileReader();evidenceReaders.add(reader);const finish=value=>{evidenceReaders.delete(reader);resolve(value);};reader.onload=()=>finish(reader.result);reader.onerror=reader.onabort=()=>finish('');reader.readAsDataURL(file);}catch{if(reader)evidenceReaders.delete(reader);resolve('');}}));
        if(!current())return;
        if(!dataUrl){pickState('retry');return showError(el,'That file could not be read. Choose it again, or continue without it.');}
        added.push({name:file.name,type:file.type,size:file.size,dataUrl});
      }
      const checked=validateGroupEvidence([...d.evidence,...added]);
      if(!checked.ok){pickState('');return showError(el,checked.message);}
      capture();d.evidence=checked.evidence;pickState('');show();
    });});
    el.querySelector('form').onsubmit= event=>{return runActionFlow(function*(){event.preventDefault();if(!valid(ctx,g,actor)||el.isConnected===false)return;capture();if(d.evidencePick==='reading')return showError(el,'Let the file finish before reviewing the payout.');if(d.evidencePick)pickState('');const amount=parseMoney(d.amountText),fee=groupPayoutFee(d.rail);
      if(!d.recipient.trim()||!d.destination.trim()||!d.note.trim()||!Number.isSafeInteger(amount)||amount<=0||amount+fee>available())return showError(el,'Add the recipient, purpose and an amount plus fee within the group funds.');
      if(d.rail!=='lumo'&&!d.lookedUp)return showError(el,'Find and confirm the registered account before continuing.');
      if(ctx.connected){
        if(d.rail!=='lumo')return showError(el,'This payout provider is not connected. Choose a registered Lumo account.');
        const destination=d.destination.trim(),found=destination.startsWith('merchant:')?null:(yield ctx.shared.resolve(destination));
        if(!valid(ctx,g,actor)||el.isConnected===false)return;
        if(d.destination.trim()!==destination)return showError(el,'Those details changed. Review the current destination first.');
        if(found?.ok){d.recipient=found.recipient.name;d.destination='@'+found.recipient.handle;}
        else {
          if(found?.code&&found.code!=='RECIPIENT_NOT_FOUND')return showError(el,found.message);
          const quote=(yield ctx.shared.quote(destination.startsWith('merchant:')?{shopId:destination.slice(9)}:{query:destination}));
          if(!valid(ctx,g,actor)||el.isConnected===false)return;
          if(d.destination.trim()!==destination)return showError(el,'Those details changed. Review the current destination first.');
          if(!quote?.ok||!quote.shop?.id)return showError(el,quote?.message||'This person or campus shop could not be verified.');
          if(quote.request)return showError(el,'Use the shop’s reusable merchant code for a group payout.');
          d.recipient=[quote.merchant?.name,quote.shop.name].filter(Boolean).join(' · ');d.destination='merchant:'+quote.shop.id;
        }
        ctx.saveDraft?.();
      }
      const payload={amount,fee,recipient:d.recipient.trim(),rail:d.rail,destination:d.destination.trim(),bank:d.bank,network:d.network,note:d.note.trim(),evidence:d.evidence,evidenceReference:d.evidenceReference,...(payout?{payoutId:payout.id,revision}:{})};
      ctx.sheet(head(payout?'Fresh details. Fresh approvals.':'All looking right?',`${cash(amount+fee)} total from the group account`)+payoutDetails({...payload,status:'pending',approvals:[],requiredApprovals:summary.requiredApprovals})+note(payout?'Earlier approvals will not authorise these updated details.':'Creating a request does not move money or count as an approval. It expires after 48 hours.')+error+button(payout?(ctx.connected?'Save with transaction PIN':'Save with demo PIN'):(ctx.connected?'Create with transaction PIN':'Create with demo PIN'),'confirm')+button('Edit details','edit',true),inner=>{
        inner.querySelector('[data-group-sheet="edit"]').onclick=show;inner.querySelector('[data-group-sheet="confirm"]').onclick=()=>{if(!valid(ctx,g,actor)||inner.isConnected===false)return;ctx.auth({title:payout?'Authorise payout changes':'Authorise payout request',onCancel:show,onSuccess:()=>{return runActionFlow(function*(){if(payout&&payoutKey(payout)!==reviewedFingerprint){ctx.toast?.('This payout changed. Review the current details first.');return;}const r=(yield commit(ctx,g,payout?'editPayout':'requestPayout',{...payload,idempotencyKey:d.operationId},inner,actor));if(!r)return;delete ctx.draft.groupPayout;ctx.saveDraft?.();finish(ctx,g,r.message);});}});};
      });
    });};
  },{onClose:()=>{controller.dispose();stopEvidenceRead();recoverEvidence();}});};show();
}
function payoutDetails(p){return `<div class="panel life-padded group-payout-details"><div class="group-detail-line"><span>Recipient receives</span><strong>${cash(p.amount)}</strong></div><div class="group-detail-line"><span>Demo fee</span><strong>${cash(p.fee||0)}</strong></div><div class="group-detail-line"><span>Total from group</span><strong>${cash(p.amount+(p.fee||0))}</strong></div><div class="group-detail-line"><span>Recipient</span><strong>${esc(p.recipient)}</strong></div><div class="group-detail-line"><span>Destination</span><strong>${esc(p.rail)} · ${esc(p.destination)}${p.bank?`<br>${esc(p.bank)}`:p.network?`<br>${esc(p.network)}`:''}</strong></div><div class="group-detail-line"><span>Purpose</span><strong>${esc(p.note||p.purpose||'Group expense')}</strong></div>${p.evidenceReference?`<div class="group-detail-line"><span>Reference</span><strong>${esc(p.evidenceReference)}</strong></div>`:''}${p.evidence?.length?`<div class="group-evidence"><p class="eyebrow">Supporting sample documents</p>${p.evidence.map(f=>`<a class="button secondary" href="${esc(f.dataUrl)}" download="${esc(f.name)}">${icon('download',16)} ${esc(f.name)}</a>`).join('')}<p class="muted">Shared evidence does not confirm a contribution or approve a payment.</p></div>`:''}<div class="group-detail-line"><span>Approvals</span><strong>${p.approvals?.length||0} of ${p.requiredApprovals}</strong></div>${progress(p.approvals?.length||0,p.requiredApprovals)}${p.expiresAt?`<p class="muted">Request expires ${esc(new Date(p.expiresAt).toLocaleString('en-GH',{timeZone:'Africa/Accra'}))}.</p>`:''}</div>`;}
function review(ctx,g,p){return runActionFlow(function*(){
  if(groupPayoutStatus(p)==='expired')(yield (ctx.actAsync||ctx.act).call(ctx,'expireGroupPayouts',{groupId:g.id}));
  if(['pending','approved','failed'].includes(p.status)&&eligible(g)){const checked=(yield (ctx.actAsync||ctx.act).call(ctx,'reviewPayout',{groupId:g.id,payoutId:p.id,revision:p.revision}));if(!checked?.ok)return ctx.toast?.(checked?.message||'Review the current payout first.');}
  if(!valid(ctx,g))return;
  const actor=getGroupActor(g), revision=p.revision, fingerprint=payoutKey(p), settlementKey=`settle-${p.id}-${p.attempt||1}`, approved=(p.approvals||[]).includes(actor), mine=eligible(g), status={pending:'Awaiting approval',approved:'Approvals complete',processing:'Payment processing',success:'Payment confirmed',failed:'Payment failed',cancelled:'Request cancelled',declined:'Request declined',expired:'Request expired'}[groupPayoutStatus(p)]||p.status;
  ctx.sheet(head(status,`${cash(p.amount)} to ${p.recipient}`)+payoutDetails(p)+`<div class="group-approval-people">${groupApprovers(g).map(m=>`<p><span>${esc(m.name)}</span><span>${p.approvals.includes(m.id)?'Approved':p.declines?.some(d=>d.memberId===m.id)?'Declined':'Not approved'}</span></p>`).join('')}</div>`+note('Messages, replies and emoji do not approve payments. Group money stays separate from personal money.')+error+
    (p.status==='pending'?(mine&&!approved?button(`Approve as ${memberName(g,actor)}`,'approve'):note(approved?'Your approval is recorded. Another designated approver can review independently.':'You can follow this payout. Only the designated approvers can authorise it.')):'')+
    (p.status==='pending'&&mine&&!approved?button('Ask for a change','decline',true):'')+
    (p.status==='declined'?note(p.declines?.at(-1)?.reason||'An approver asked for a change. Edit the request to begin fresh approvals.'):'')+
    (p.status==='expired'?note('This request expired. Reserved money is available again. Create a new request from the group overview.'):'')+
    (p.status==='approved'&&mine?button('Continue to payment','execute'):'')+
    (p.status==='processing'?`<p class="group-processing-note">The payment has been submitted. Required approvals did not skip processing or confirmation.</p>${mine?`<div class="group-simulation-payment"><p class="eyebrow">Simulated payment result</p>${button('Simulate confirmed payment','confirm-result')}${button('Simulate failed payment','fail-result',true)}</div>`:''}`:'')+
    (p.status==='success'?`<div class="notice"><span>Confirmed from the group account. Reference: ${esc(p.reference||p.id)}. ${p.paidAt?esc(new Date(p.paidAt).toLocaleString('en-GH')):''}</span></div>`:'')+
    (p.status==='failed'&&mine?button('Review a retry','retry'):'')+
    (['pending','approved','failed','declined'].includes(p.status)&&mine?`<div class="inline-actions">${button('Edit details','edit',true)}${button('Cancel request','cancel',true)}</div>`:'')+button('Back to the group','close',true),el=>{
      const current=()=>valid(ctx,g,actor)&&el.isConnected!==false&&p.revision===revision&&payoutKey(p)===fingerprint;
      el.querySelector('[data-group-sheet="close"]').onclick=()=>ctx.closeSheet();
      el.querySelector('[data-group-sheet="approve"]')?.addEventListener('click',()=>{if(current())authorise(ctx,g,`Approve ${cash(p.amount)} to ${p.recipient}`,'approvePayout',{payoutId:p.id,revision,reviewId:p.reviews?.[actor]?.id},()=>runActionFlow(function*(){return (yield review(ctx,g,p));}),el);});
      el.querySelector('[data-group-sheet="decline"]')?.addEventListener('click',()=>{if(current())decline(ctx,g,p);});
      for(const a of ['execute','edit','cancel','retry'])el.querySelector(`[data-group-sheet="${a}"]`)?.addEventListener('click',()=>{return runActionFlow(function*(){if(current())(yield openGroupFinancial(ctx,g,a,p.id));});});
      for(const [a,outcome]of [['confirm-result','success'],['fail-result','failed']])el.querySelector(`[data-group-sheet="${a}"]`)?.addEventListener('click',()=>{return runActionFlow(function*(){if(current()&&(yield commit(ctx,g,'settleGroupPayout',{payoutId:p.id,revision,outcome,idempotencyKey:`${settlementKey}-${outcome}`},el,actor)))finish(ctx,g,outcome==='success'?'Group payment confirmed.':'Payment failed. Group funds are available again.');});});
    });
});}
function execute(ctx,g,p){return runActionFlow(function*(){if(groupPayoutStatus(p)==='expired')return (yield review(ctx,g,p));if(eligible(g))(yield (ctx.actAsync||ctx.act).call(ctx,'reviewPayout',{groupId:g.id,payoutId:p.id,revision:p.revision}));const revision=p.revision;if(p.status!=='approved')return (yield review(ctx,g,p));ctx.sheet(head('Ready to pay.',`${p.requiredApprovals} approvers have agreed.`)+payoutDetails(p)+note('This uses the group account. Your personal balance stays the same. The result will appear only after processing.')+error+button('Confirm group payment','confirm')+button('Back to payout','back',true),el=>{el.querySelector('[data-group-sheet="back"]').onclick=()=>runActionFlow(function*(){return (yield review(ctx,g,p));});el.querySelector('[data-group-sheet="confirm"]').onclick=()=>authorise(ctx,g,'Confirm group payment','executePayout',{payoutId:p.id,revision},()=>runActionFlow(function*(){return (yield execute(ctx,g,p));}),el);});});}
function retry(ctx,g,p){const revision=p.revision;ctx.sheet(head('Give it another try?', 'Review the same payment details before submitting again.')+payoutDetails(p)+note('A retry reuses this payout record. It cannot debit the group twice. Changed details require fresh approvals.')+error+button('Review approved retry','confirm')+button('Back to payout','back',true),el=>{el.querySelector('[data-group-sheet="back"]').onclick=()=>runActionFlow(function*(){return (yield review(ctx,g,p));});el.querySelector('[data-group-sheet="confirm"]').onclick=()=>{return runActionFlow(function*(){if(el.isConnected===false)return;if((yield commit(ctx,g,'retryGroupPayout',{payoutId:p.id,revision,idempotencyKey:uid()},el))){ctx.closeSheet();ctx.refresh();(yield execute(ctx,g,p));}});};});}
function cancel(ctx,g,p){const revision=p.revision;ctx.sheet(head('Cancel this request?', 'No group money is sent. Reserved funds become available again.')+error+button('Cancel payout request','confirm')+button('Keep request','back',true),el=>{el.querySelector('[data-group-sheet="back"]').onclick=()=>runActionFlow(function*(){return (yield review(ctx,g,p));});el.querySelector('[data-group-sheet="confirm"]').onclick=()=>{return runActionFlow(function*(){if(el.isConnected===false)return;if((yield commit(ctx,g,'cancelPayout',{payoutId:p.id,revision,idempotencyKey:uid()},el)))finish(ctx,g,'Request cancelled. Money stays with the group.');});};});}

function openWaitingAgreement(ctx,g){
  const waiting=groupMandatePending(g), actor=getGroupActor(g);
  ctx.sheet(head('A clear agreement first.', 'The designated approvers need to accept this payout agreement. Contributor invitations do not pause the group.')+`<div class="panel life-padded">${waiting.map(m=>`<p><strong>${esc(m.name)}</strong><br><span class="muted">${m.status==='invited'?'Invitation waiting':'Payout agreement to review'}</span></p>`).join('')}</div>`+note('Use Participant simulation to review each person’s own invitation or approver agreement. No messages or invitations are sent.')+(waiting.some(m=>m.id===actor)?button('Review my payout agreement','accept-mandate'):'')+button('Open your people','members')+button('Back to the group','back',true),el=>{el.querySelector('[data-group-sheet="accept-mandate"]')?.addEventListener('click',()=>openGroupMandate(ctx,g));el.querySelector('[data-group-sheet="members"]').onclick=()=>openGroupMembers(ctx,g);el.querySelector('[data-group-sheet="back"]').onclick=()=>ctx.closeSheet();});
}
function decline(ctx,g,p){
  const actor=getGroupActor(g),revision=p.revision;ctx.sheet(head('What needs a change?', 'Your decline is recorded. No group money moves.')+`<form class="form-stack">${field({label:'A short reason',name:'groupDeclineReason',value:'',placeholder:'Please attach the printer’s quote.',required:true})}${error}<button class="button" type="submit">Review decline</button></form>`+button('Back to payout','back',true),el=>{el.querySelector('[data-group-sheet="back"]').onclick=()=>runActionFlow(function*(){return (yield review(ctx,g,p));});el.querySelector('form').onsubmit=e=>{e.preventDefault();if(!valid(ctx,g,actor)||el.isConnected===false)return;const reason=el.querySelector('[name="groupDeclineReason"]').value.trim();if(!reason)return showError(el,'Let the group know what needs to change.');authorise(ctx,g,'Confirm your payout decline','declinePayout',{payoutId:p.id,revision,reason},()=>runActionFlow(function*(){return (yield review(ctx,g,p));}),el);};});
}
export function openGroupReturn(ctx,g){closeCollection(ctx,g);}
function closeCollection(ctx,g){
  if(!isCreator(g)||g.status==='closed'&&!(g.balance>0))return;
  const returningClosed=g.status==='closed',actor=getGroupActor(g),refunds=collectionRefundPreview(g),returnReview=collectionReturnReview(g),fingerprint=JSON.stringify([g.status,g.balance,g.contributions,g.payouts.map(p=>[p.id,p.status,p.amount,p.fee,p.revision])]);
  ctx.sheet(head(returningClosed?'Return the merchant refund?':'Wrap this one up?', returningClosed?'This collection stays closed. The returned money goes only to its original contributors, using their remaining contribution shares.':'Unused money goes back to the original contributors, in proportion to their confirmed contributions.')+`<div class="panel life-padded"><div class="group-detail-line"><span>To return</span><strong>${cash(g.balance)}</strong></div>${refunds.map(r=>`<div class="group-detail-line"><span>${esc(r.memberName)}</span><strong>${cash(r.amount)}</strong></div>`).join('')}</div>`+note(returningClosed?'Review every original-source return before entering your PIN. No new contributions or payouts are opened. Earlier money and conversation history stay available.':'Processing money must finish first. Open payout requests will be cancelled. Earlier messages, payments, contributions and refund records stay available. No new contributions or payouts can be made.')+error+button(returningClosed?'Return merchant refund':'Close & return unused money','confirm')+button(returningClosed?'Back to the closed collection':'Keep the collection open','back',true),el=>{el.querySelector('[data-group-sheet="back"]').onclick=()=>openGroupDetails(ctx,g);el.querySelector('[data-group-sheet="confirm"]').onclick=()=>{if(!valid(ctx,g,actor)||el.isConnected===false)return;ctx.auth({title:returningClosed?'Confirm original-source returns':'Confirm collection closure',onCancel:()=>closeCollection(ctx,g),onSuccess:()=>{return runActionFlow(function*(){if(JSON.stringify([g.status,g.balance,g.contributions,g.payouts.map(p=>[p.id,p.status,p.amount,p.fee,p.revision])])!==fingerprint)return ctx.toast?.('The group money changed. Review the returns again.');if((yield commit(ctx,g,'closeGroup',{...returnReview,idempotencyKey:uid()},el,actor)))finish(ctx,g,returningClosed?'Merchant refund returned. The collection stays closed.':'Collection closed. Original-source returns are recorded.');});}});};});
}
