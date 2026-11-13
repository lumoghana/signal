import {runActionFlow} from './approved-flow.js';
import {unmatchedReceipts,unmatchedReceiptAmount} from './receipt-matching.js';
import { prepareIOURepayment } from './payments.js';
import { esc, cash, icon, pageHead, row, field, btn, empty, progress, dateLabel } from './ui.js';
import { getSummary, pendingIOUAmount, repayableIOUAmount } from './model.js';
import { reviewOutflowImpact } from './outflow-impact.js';
import { renderGroupOverview, bindGroupOverview } from './group-overview.js';
import { openGroupMembers, openGroupDetails, openGroupFinancial, openGroupSimulation } from './group-actions.js';
import { getGroupActor, canReadGroup, groupSummary } from './group-ledger.js';
import { unreadGroupCount } from './group-chat-model.js';

const NOW = () => new Date().toISOString().slice(0, 10);
const addDays = (days) => new Date(Date.now() + days * 86400000).toISOString().slice(0, 10);
const uid = () => 'life-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 7);
const personalMoney = (ctx, value, options = {}) => ctx.state.settings?.hideBalance ? '••••.••' : cash(value, options);
const remaining = (iou) => Math.max(0, Number(iou.amount || 0) - Number(iou.paid || 0));
const openIOUs = (s) => (s.ious || []).filter((x) => x.status === 'open');
const go = (page, extra = {}) => ({ section: 'life', page, ...extra });
const amountInput = (name, value = '', label = 'Amount', min = '0.01') => '<label class="field"><span>' + esc(label) + '</span><div class="life-currency-input"><span>GH₵</span><input class="input money-input" inputmode="decimal" type="number" min="' + min + '" step="0.01" name="' + esc(name) + '" value="' + esc(value) + '" placeholder="0.00" required></div></label>';
const readAmount = (el) => Math.round(Number(el?.value || 0) * 100);
const errorBox = '<p class="error life-form-error" role="alert"></p>';
const explain = (text) => '<p class="muted life-note">' + esc(text) + '</p>';
const sheetHead = (title, sub = '') => '<div class="life-sheet-head"><h2>' + esc(title) + '</h2>' + (sub ? '<p class="muted">' + esc(sub) + '</p>' : '') + '</div>';
const pending = (g) => (g.payouts || []).filter((p) => !['paid', 'executed', 'cancelled', 'rejected', 'success', 'completed'].includes(p.status));
const approvalIds = (p) => (p.approvals || []).map((a) => typeof a === 'string' ? a : (a.approverId || a.id || a.memberId || a.name));
const approvers = (g) => (g.members || []).filter((m) => ['approver', 'owner', 'creator', 'admin'].includes(m.role));
const requiredApprovals = (g) => Math.max(1, Number(g.mandate?.threshold || 1));
const formError = (root, message) => {
  const el = root.querySelector('.life-form-error');
  if (el) el.textContent = message;
};
const commit = (ctx, type, payload, root) => {return runActionFlow(function*(){
  const result = (yield (ctx.actAsync||ctx.act).call(ctx,type, payload));
  if (!result?.ok) {
    if (root?.isConnected) formError(root, result?.message || 'Please check the details and try again.');
    else ctx.toast(result?.message || 'Please check the details and try again.');
    return null;
  }
  return result;
});};

function actionRow(action, emoji, title, sub = '', right = '') {
  return row({ action, emoji, title, sub, right });
}

const outsideKinds = {
  cash: { label: 'Cash', icon: 'card', name: 'Cash in hand' },
  bank: { label: 'Other bank', icon: 'bank', name: 'My bank account' },
  momo: { label: 'MoMo', icon: 'phone', name: 'My MoMo wallet' }
};
function outsideUpdated(value) {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return 'Manually recorded';
  const stale = Date.now() - date.getTime() > 7 * 86400000;
  return 'Updated ' + date.toLocaleDateString('en-GH', { day: 'numeric', month: 'short' }) + ', ' + date.toLocaleTimeString('en-GH', { hour: '2-digit', minute: '2-digit' }) + (stale ? ' · Time for a balance check' : '');
}

function overview(ctx) {
  const s = ctx.state;
  const sum = getSummary(s);
  const incoming = openIOUs(s).filter((x) => x.type === 'owedToMe');
  const outgoing = openIOUs(s).filter((x) => x.type === 'owedByMe');
  const owed = incoming.reduce((n, x) => n + remaining(x), 0);
  const owe = outgoing.reduce((n, x) => n + remaining(x), 0);
  const hide = s.settings.hideBalance;
  const show = (n) => hide ? '••••' : cash(n);
  const outside = s.externalBalances || [];
  return '<section class="page life-page outside-overview">' + pageHead('All your money', { eyebrow: 'THE WHOLE PICTURE' }) +
    '<div class="life-total"><span class="muted">All recorded money</span><div class="amount-xl">' + show(sum.allMoneyTotal) + '</div><button class="icon-button" data-action="life-visibility" aria-label="' + (hide ? 'Show' : 'Hide') + ' balances">' + icon(hide ? 'eye' : 'eyeOff') + '</button><p class="outside-hero-note">In Lumo + the balances you add</p></div>' +
    '<div class="outside-section-head"><h2>In Lumo</h2><span>' + show(sum.total) + '</span></div>' +
    '<div class="panel">' +
      actionRow('life-wallet', '↗', 'Everyday account', 'Ready for payments', show(sum.available)) +
      actionRow('life-boxes', '◉', 'Money Boxes', 'Held separately for your goals', show(sum.savings)) +
      (((sum.cardTotal || sum.cardBalance) || (s.virtualCards || []).some(card => card.status !== 'closed')) ? actionRow('life-cards', icon('card'), 'Virtual cards', 'Held separately for online payments', show(sum.cardTotal ?? sum.cardBalance ?? 0)) : '') +
      (sum.transferHolds ? actionRow('life-wallet',icon('clock'),'Transfers awaiting confirmation','Held while the move is checked',show(sum.transferHolds)) : '') +
      (sum.pendingPaymentHolds ? actionRow('life-wallet',icon('clock'),'Payments awaiting confirmation','Included here once; unavailable to spend',show(sum.pendingPaymentHolds)) : '') +
      (sum.pendingCardHolds ? actionRow('life-cards',icon('clock'),'Card money awaiting confirmation','Included here once; unavailable to spend',show(sum.pendingCardHolds)) : '') +
      (sum.pendingContributionHolds ? actionRow('life-groups',icon('clock'),'Contributions awaiting confirmation','Not collected by the group until confirmed',show(sum.pendingContributionHolds)) : '') +
    '</div>' +
    '<div class="outside-section-head"><h2>Outside Lumo</h2>' + (outside.length ? '<button class="text-button" data-action="life-external-add" aria-label="Add outside money">' + icon('plus', 16) + ' Add</button>' : '<span>' + show(sum.outsideTotal) + '</span>') + '</div>' +
    (outside.length ? '<div class="panel outside-balances">' + outside.map((x) => row({
      action: 'life-external-edit:' + x.id, emoji: icon(outsideKinds[x.type].icon), title: x.name,
      sub: outsideKinds[x.type].label + ' · ' + outsideUpdated(x.updatedAt), right: show(x.balance)
    })).join('') + '<div class="outside-subtotal"><span>Manually recorded</span><strong>' + show(sum.outsideTotal) + '</strong></div></div>' :
      '<div class="outside-empty panel"><div class="outside-empty-icons">' + icon('card') + icon('bank') + icon('phone') + '</div><h3>Your money lives in more places.</h3><p>Cash in your pocket, another bank, or a MoMo wallet. Bring those balances into the picture.</p>' + btn('Add outside money', 'life-external-add') + '</div>') +
    explain(outside.length ? 'Tap a balance to update or remove it. Outside money stays separate from Lumo payments and your daily guide.' : 'Add a balance manually. No account numbers or connection needed.') +
    ((s.externalBalanceHistory || []).length ? '<button type="button" class="text-button" data-action="life-external-history">' + icon('clock', 16) + ' Balance change history</button>' : '') +
    '<div class="section-label">Planned in Lumo</div><div class="panel">' +
      actionRow('life-plan', '▤', 'Your plan', 'Reserved inside your everyday account', show(sum.planned)) +
      row({ emoji: '◇', title: 'Keep-back amount', sub: 'Your personal cushion', right: show(s.buffer || 0) }) +
      row({ emoji: '↗', title: 'Left in Lumo after plan', sub: 'After your plan and keep-back', right: '<span class="accent">' + show(sum.spendable) + '</span>' }) +
    '</div>' +
    '<div class="section-label">On its way</div><div class="panel">' +
      row({ emoji: '↓', title: 'Expected allowance', sub: s.income?.nextDate ? dateLabel(s.income.nextDate) : 'No date set', right: show(s.income?.amount || 0) }) +
      actionRow('life-ious', '↙', 'People owe you', incoming.length + ' open ' + (incoming.length === 1 ? 'IOU' : 'IOUs'), show(owed)) +
    '</div>' +
    '<div class="notice life-note">' + icon('info', 18) + '<span>Expected money joins your balance only when it arrives.</span></div>' +
    '<div class="panel">' +
      actionRow('life-ious-owe', '↗', 'You owe people', 'Keep repayments in view', show(owe)) +
      actionRow('life-groups', '◎', 'Group money', 'Shared funds stay separate') +
      actionRow('life-recovery', '↻', 'Allowance running late?', 'Make a plan for the days ahead') +
    '</div>' +
    explain('Keep outside balances up to date when money moves, including when you add money to Lumo.') + '</section>';
}

function editOutsideMoney(ctx, balance = null, draft = null) {
  const d = draft || { type: balance?.type || 'cash', name: balance?.name || outsideKinds.cash.name, balance: balance ? (balance.balance / 100).toFixed(2) : '', requestKey: uid() };
  ctx.sheet(sheetHead(balance ? 'Keep your balance up to date.' : 'Where else is your money?', balance ? 'Check the amount you hold here, then update your record.' : 'Add the money you hold outside Lumo.') +
    '<form class="sheet-form outside-form"><div class="outside-kind-picker" role="group" aria-label="Money type">' + Object.entries(outsideKinds).map(([type, kind]) => '<button type="button" data-outside-kind="' + type + '" aria-pressed="' + (d.type === type) + '">' + icon(kind.icon) + '<span>' + kind.label + '</span></button>').join('') + '</div>' +
    '<label class="field"><span>Give it a name</span><input class="input" name="outsideName" value="' + esc(d.name) + '" placeholder="' + esc(outsideKinds[d.type].name) + '" maxlength="60" autocomplete="off" required></label>' +
    amountInput('outsideAmount', d.balance, 'Current balance', '0') +
    '<p class="outside-manual-note">' + icon('info', 17) + '<span>Manually recorded. This does not connect an account or move money into Lumo.</span></p>' +
    (balance ? '<p class="muted small">' + esc(outsideUpdated(balance.updatedAt)) + '</p>' : '') + errorBox +
    '<button type="submit" class="button">' + (balance ? 'Update balance' : 'Add balance') + '</button>' + btn('Cancel', 'outside-cancel', { secondary: true }) +
    (balance ? '<button type="button" class="text-button outside-remove" data-action="outside-remove">Remove this balance</button>' : '') + '</form>', (el) => {
    const name = el.querySelector('[name="outsideName"]'), amount = el.querySelector('[name="outsideAmount"]');
    const capture = () => { d.name = name.value; d.balance = amount.value; };
    el.querySelectorAll('[data-outside-kind]').forEach((b) => b.onclick = () => {
      capture();
      const previousName = outsideKinds[d.type].name;
      d.type = b.dataset.outsideKind;
      if (d.name === previousName) name.value = d.name = outsideKinds[d.type].name;
      name.placeholder = outsideKinds[d.type].name;
      el.querySelectorAll('[data-outside-kind]').forEach((choice) => choice.setAttribute('aria-pressed', String(choice.dataset.outsideKind === d.type)));
    });
    el.querySelector('form').onsubmit = (e) => {return runActionFlow(function*(){
      e.preventDefault(); capture();
      if (!d.name.trim()) { formError(el, 'Give this balance a name you’ll recognise.'); return; }
      if (!/^(?:\d+(?:\.\d{0,2})?|\.\d{1,2})$/.test(d.balance)) { formError(el, 'Enter a balance of zero or more, with up to two decimal places.'); return; }
      const value = Math.round(Number(d.balance) * 100);
      const result = (yield commit(ctx, balance ? 'updateExternalBalance' : 'createExternalBalance', { id: balance?.id, type: d.type, name: d.name.trim(), balance: value, idempotencyKey: d.requestKey }, el));
      if (!result) return;
      ctx.closeSheet(); ctx.refresh(); ctx.toast(balance ? 'Outside balance updated.' : 'Outside money added to your picture.');
    });};
    el.querySelector('[data-action="outside-cancel"]').onclick = () => ctx.closeSheet();
    const remove = el.querySelector('[data-action="outside-remove"]');
    if (remove) remove.onclick = () => {
      capture();
      ctx.sheet(sheetHead('Remove ' + balance.name + '?', 'Only this manual record will be removed. No money moves.') + errorBox + btn('Keep this balance', 'outside-keep') + btn('Remove balance', 'outside-confirm-remove', { secondary: true }), (confirm) => {
        confirm.querySelector('[data-action="outside-keep"]').onclick = () => editOutsideMoney(ctx, balance, d);
        confirm.querySelector('[data-action="outside-confirm-remove"]').onclick = () => {return runActionFlow(function*(){
          if (!(yield commit(ctx, 'removeExternalBalance', { id: balance.id, idempotencyKey: uid() }, confirm))) return;
          ctx.closeSheet(); ctx.refresh(); ctx.$('[data-action="life-external-add"]')?.focus(); ctx.toast('Outside balance removed.');
        });};
      }, { onClose: () => editOutsideMoney(ctx, balance, d), closeLabel: 'Cancel removal' });
    };
  }, { closeLabel: 'Cancel balance changes' });
}

function ious(ctx, route) {
  const filter = route.filter || 'owedToMe';
  const all = ctx.state.ious || [];
  const current = all.filter((x) => x.type === filter && x.status === 'open');
  const history = all.filter((x) => x.type === filter && x.status !== 'open');
  const total = current.reduce((n, x) => n + remaining(x), 0);
  const isIncoming = filter === 'owedToMe';
  const saved = ctx.draft.iouCreate;
  return '<section class="page life-page">' + pageHead('IOUs') +
    '<div class="chips life-tabs"><button class="chip ' + (isIncoming ? 'selected' : '') + '" data-action="life-iou-filter" data-filter="owedToMe">Owed to you</button><button class="chip ' + (!isIncoming ? 'selected' : '') + '" data-action="life-iou-filter" data-filter="owedByMe">You owe</button></div>' +
    '<div class="life-total"><span class="muted">' + (isIncoming ? 'Expected back' : 'Still to repay') + '</span><div class="amount-xl">' + personalMoney(ctx,total) + '</div></div>' +
    (isIncoming ? '<div class="notice">' + icon('clock', 18) + '<span>This is expected money. Your spendable balance does not include it.</span></div>' : explain('Repayments due during your plan are included once.')) +
    (saved ? '<div class="panel group-saved-draft"><p class="eyebrow">' + (saved.edit ? 'Unsaved changes' : 'Saved setup') + '</p><h2>' + esc(saved.name || 'Your next IOU') + '</h2><p class="muted">' + (saved.type === 'owedToMe' ? 'Money owed to you.' : 'Money you owe.') + ' Your answers are saved.</p><div class="inline-actions">' + btn('Discard draft', 'life-discard-iou', { secondary: true }) + '</div></div>' : '') +
    (current.length ? '<div class="panel">' + current.map((x) => {
      const overdue = x.due < NOW();
      return actionRow('life-iou-' + x.id, isIncoming ? '↙' : '↗', x.name, (overdue ? 'Overdue · ' : 'Due ') + dateLabel(x.due), '<span class="' + (overdue ? 'life-warning' : '') + '">' + personalMoney(ctx,remaining(x)) + '</span>');
    }).join('') + '</div>' : empty({ emoji: isIncoming ? '↙' : '↗', title: isIncoming ? 'Nothing to chase.' : 'A clean slate.', body: isIncoming ? 'Keep track when you lend someone money.' : 'Keep a simple record when someone helps you out.' })) +
    (history.length ? '<div class="section-label">Closed</div><div class="panel">' + history.map((x) => actionRow('life-iou-' + x.id, x.status === 'settled' ? '✓' : '–', x.name, x.status === 'settled' ? 'Settled' : 'Cancelled', personalMoney(ctx,x.amount))).join('') + '</div>' : '') +
    '<div class="panel">' + actionRow('life-requests',icon('arrow'),'Money requests','Send a request or review one you received') + actionRow('life-splits',icon('users'),'Split an expense','Keep each person’s share clear') + '</div>' +
    '<div class="bottom-action">' + btn(saved ? 'Continue IOU setup' : 'Add an IOU', saved ? 'life-resume-iou' : 'life-new-iou') + '</div></section>';
}

function iouDetail(ctx, route) {
  const x = (ctx.state.ious || []).find((i) => i.id === route.id);
  if (!x) return '<section class="page">' + pageHead('IOU') + empty({ emoji: '↙', title: 'This record is no longer here.', body: 'Your other IOUs are still safe.', action: 'life-ious', label: 'Back to IOUs' }) + '</section>';
  const incoming = x.type === 'owedToMe';
  const active = x.status === 'open';
  return '<section class="page life-page">' + pageHead(x.name, { action: active ? '<button class="icon-button" data-action="life-iou-options" aria-label="IOU options">' + icon('more') + '</button>' : '' }) +
    '<div class="life-total"><div class="life-hero-symbol">' + (active ? incoming ? '↙' : '↗' : '✓') + '</div><span class="muted">' + (active ? incoming ? 'Still expected from ' : 'Still owed to ' : 'Original amount · ') + esc(active ? x.name : x.status) + '</span><div class="amount-xl">' + personalMoney(ctx,active ? remaining(x) : x.amount) + '</div></div>' +
    '<div class="panel">' +
      row({ emoji: icon('calendar'), title: 'Agreed date', right: dateLabel(x.due) }) +
      (x.budgetItemId ? row({ emoji: icon('plan'), title: 'Covered by your plan', sub: (ctx.state.budget?.items || []).find(item => item.id === x.budgetItemId)?.name || 'Linked budget item', right: 'Counted once' }) : '') +
      row({ emoji: icon('check'), title: 'Already settled', right: personalMoney(ctx,x.paid || (x.status === 'settled' ? x.amount : 0)) }) +
      row({ emoji: icon('info'), title: 'Status', right: x.status === 'open' ? x.due < NOW() ? 'Overdue' : 'Open' : x.status === 'settled' ? 'Settled' : 'Cancelled' }) +
    '</div>' +
    (!incoming && pendingIOUAmount(ctx.state,x.id) > 0 ? '<div class="notice">' + personalMoney(ctx,pendingIOUAmount(ctx.state,x.id)) + ' is awaiting payment confirmation. It is still owed until confirmed.</div><div class="panel">' + ctx.state.transactions.filter(tx=>tx.iouId===x.id&&tx.status==='pending').map(tx=>row({title:'Repayment pending',sub:'Check the provider result before paying again',right:personalMoney(ctx,tx.amount),action:'life-repayment:'+tx.id})).join('') + '</div>' : '') +
    (x.note ? '<div class="section-label">Your note</div><div class="panel life-padded">' + esc(x.note) + '</div>' : '') +
    (active ? '<div class="notice">' + icon('info', 18) + '<span>' + (incoming ? 'Record a repayment only after the money has actually arrived.' : 'Pay from Lumo, or record money you already paid outside Lumo.') + '</span></div>' : explain(x.status === 'cancelled' ? 'Cancelling this record did not move any money.' : 'This IOU is complete. Its repayments are in your activity.')) +
    (active ? '<div class="inline-actions">' + btn(incoming ? 'Send a reminder' : 'Share an update', 'life-iou-remind', { secondary: true }) + '</div><div class="bottom-action">' + btn(incoming ? 'Record money received' : 'Make a repayment', 'life-iou-settle') + '</div>' : '<div class="bottom-action">' + btn('Back to IOUs', 'life-ious') + '</div>') + '</section>';
}

function recoveryDraft(ctx) {
  const d = ctx.draft.recovery ||= { days: 7, mode: 'steady', adjustments: {} };
  d.adjustments ||= {};
  return d;
}
function captureRecoveryDraft(ctx, route) {
  const d = recoveryDraft(ctx), step = Number(route.step || 0);
  if (step === 0) {
    const input = ctx.$('[name="recoveryDate"]');
    if (input) { d.checkInDate = input.value; d.nextDate = input.value; }
  }
  if (step === 1) for (const item of ctx.state.budget?.items || []) {
    const protect = ctx.$('[data-recovery-protect="' + item.id + '"]');
    const input = ctx.$('[data-recovery-remaining="' + item.id + '"]');
    if (protect && input) { if (protect.checked) delete d.adjustments[item.id]; else d.adjustments[item.id] = input.value; }
  }
  ctx.saveDraft?.();
}
function recoveryReductions(ctx, d) {
  return (ctx.state.budget?.items || []).filter(item => Object.hasOwn(d.adjustments || {}, item.id)).map(item => ({ id: item.id, amount: Math.round(Number(d.adjustments[item.id]) * 100) }));
}
function recoveryPreview(ctx, d) {
  const reductions = recoveryReductions(ctx, d), budget = ctx.state.budget?.items || [];
  const preview = { ...ctx.state, income: { ...ctx.state.income }, recovery: { active: true, checkInDate: d.checkInDate || d.nextDate || addDays(d.days) },
    budget: { ...ctx.state.budget, items: budget.map(item => { const reduction = reductions.find(x => x.id === item.id); return reduction ? { ...item, amount: item.spent + reduction.amount } : item; }) } };
  const sum = getSummary(preview);
  return { sum, reductions, daily: Math.floor(sum.spendable / Math.max(1, d.days)) };
}
function recoveryDashboard(ctx) {
  const r = ctx.state.recovery, sum = getSummary(ctx.state), checkIn = r.checkInDate || r.nextDate;
  const elapsed = Math.max(0, Math.floor((Date.now() - new Date(r.startedAt).getTime()) / 86400000));
  const days = Math.max(1, Number(r.days) || 7);
  const expenses = ctx.state.transactions.filter(t => ['payment','card-purchase'].includes(t.type) && t.status === 'success' && t.at >= r.startedAt).reduce((n,t) => n + Math.max(0,t.amount - (t.type === 'card-purchase' ? t.refunded || 0 : 0)) + (t.fee || 0), 0);
  const received = ctx.state.transactions.filter(t => t.type === 'income' && t.status === 'success' && t.at >= r.startedAt);
  return '<section class="page life-page recovery-active">' + pageHead('One day at a time', { eyebrow: r.active ? 'YOUR RECOVERY PLAN' : 'RECOVERY COMPLETE' }) +
    '<div class="life-total"><span class="muted">' + (r.active ? 'A guide for today' : 'Your current daily guide') + '</span><div class="amount-xl accent">' + personalMoney(ctx,sum.dailyAllowance) + '</div><span class="muted">from money already here</span></div>' +
    '<div class="panel life-padded"><div class="section-label"><span>' + (r.active ? 'Day ' + Math.min(days, elapsed + 1) + ' of ' + days : 'Plan completed') + '</span><span>' + dateLabel(checkIn) + '</span></div>' + progress(Math.min(elapsed, days), days) + '<p class="muted">' + (r.active ? 'Automatic saving is paused while you make room.' : 'Your saving rules can run again when there is room.') + '</p></div>' +
    '<div class="panel">' + row({emoji:'↗',title:'Available now',right:personalMoney(ctx,sum.available)}) + row({emoji:'▤',title:'Planned commitments',right:personalMoney(ctx,sum.planned)}) + row({emoji:'↘',title:'Payments since this plan began',right:personalMoney(ctx,expenses)}) + row({emoji:'◷',title:'Expected income date',right:dateLabel(ctx.state.income.nextDate)}) + '</div>' +
    '<p class="muted life-note">The check-in date is separate from your expected income. Expected money never increases this guide.</p>' +
    (r.active ? '<div class="panel">' + actionRow('life-recovery-review-income',icon('check'),'Money arrived?','Review a confirmed arrival · ' + received.length + ' available') + actionRow('life-recovery-adjust',icon('plan'),'Adjust this plan','Choose which costs to protect') + '</div><div class="bottom-action">' + btn('Review & finish recovery','life-recovery-complete') + '</div>' : '<div class="stack">' + btn('Make a new plan','life-recovery-adjust',{secondary:true}) + btn('Back to Home','life-recovery-home') + '</div>') + '</section>';
}
function recovery(ctx, route) {
  const d = recoveryDraft(ctx), step = Number(route.step || 0), budget = ctx.state.budget?.items || [];
  if (ctx.state.recovery && !d.editing) return recoveryDashboard(ctx);
  const { sum, daily, reductions } = recoveryPreview(ctx,d), freed = reductions.reduce((n,x) => { const item = budget.find(b => b.id === x.id); return n + Math.max(0,item.amount-item.spent)-x.amount; },0);
  if (step === 0) return '<section class="page life-page">' + pageHead('A little breathing room', { eyebrow: 'ALLOWANCE RUNNING LATE?' }) +
    '<h1 class="large-question">How many more days do you need your money to last?</h1><p class="muted">We’ll use the money already here. Your expected income date stays as it is.</p>' +
    '<div class="life-choice-grid">' + [3,7,14].map(n => '<button class="life-choice ' + (d.days===n?'selected':'') + '" data-action="life-recovery-days" data-days="' + n + '"><strong>' + n + '</strong><span>days</span></button>').join('') + '</div>' +
    '<label class="field"><span>Check in again on</span><input class="input" name="recoveryDate" type="date" min="' + addDays(1) + '" value="' + esc(d.checkInDate || d.nextDate || addDays(d.days)) + '"></label><div class="notice">' + icon('heart',18) + '<span>Plans change. There is no judgement here.</span></div><div class="bottom-action">' + btn('Let’s work with that','life-recovery-next') + '</div></section>';
  if (step === 1) return '<section class="page life-page">' + pageHead('Keep what matters') + '<h1 class="large-question">What stays<br>protected?</h1><p class="muted">Every cost starts protected. Uncheck a category only if you want to lower its remaining plan.</p>' +
    '<div class="stack recovery-costs">' + budget.filter(item => item.amount>item.spent).map(item => { const protectedCost = !Object.hasOwn(d.adjustments,item.id), left = Math.max(0,item.amount-item.spent); return '<div class="panel recovery-cost"><label class="recovery-protect"><input type="checkbox" data-recovery-protect="' + esc(item.id) + '" ' + (protectedCost?'checked':'') + '><span><strong>' + esc(item.name) + '</strong><small>' + personalMoney(ctx,left) + ' remaining · Keep protected</small></span></label><label class="field" ' + (protectedCost?'hidden':'') + '><span>New remaining allocation (GH₵)</span><input class="input" type="number" step="0.01" min="0" max="' + left/100 + '" data-recovery-remaining="' + esc(item.id) + '" value="' + esc(protectedCost ? (Math.round(left*.7)/100).toFixed(2) : d.adjustments[item.id]) + '" ' + (protectedCost?'disabled':'') + '></label></div>'; }).join('') + '</div>' +
    (!budget.length ? '<div class="notice">There are no budget costs to adjust. We’ll spread your current spendable money across the days ahead.</div>' : '') +
    '<div class="notice">' + icon('pause',18) + '<span>Automatic saving pauses during recovery. No existing savings move back.</span></div>' + errorBox + '<div class="bottom-action">' + btn('See my plan','life-recovery-next') + '</div></section>';
  return '<section class="page life-page">' + pageHead('You have a way forward') + '<div class="life-total"><span class="muted">Your guide for the next ' + d.days + ' days</span><div class="amount-xl accent">' + personalMoney(ctx,daily) + '</div><span class="muted">a day, after your plan</span></div><div class="panel">' +
    row({emoji:'↗',title:'Available now',right:personalMoney(ctx,sum.available)}) + row({emoji:'▤',title:'Plan protected',right:personalMoney(ctx,sum.planned)}) + row({emoji:'↘',title:'Room made in your budget',right:personalMoney(ctx,freed)}) + row({emoji:'◇',title:'Keep-back untouched',right:personalMoney(ctx,ctx.state.buffer||0)}) + row({emoji:'◷',title:'Check in again',right:dateLabel(d.checkInDate||d.nextDate||addDays(d.days))}) + '</div>' +
    '<div class="notice"><span>' + (daily>0 ? 'Expected income stays separate. Automatic saving is paused until recovery ends.' : 'Your funds are already committed. Review costs or ask someone you trust for support before a new payment.') + '</span></div><div class="bottom-action">' + btn('Keep this plan','life-recovery-save') + '</div></section>';
}
function outsideHistory(ctx) {
  const entries = [...(ctx.state.externalBalanceHistory || [])].sort((a,b)=>String(b.at).localeCompare(String(a.at))), show = n => ctx.state.settings.hideBalance ? '••••' : cash(n || 0);
  ctx.sheet(sheetHead('Your balance changes','Manual records only. No money moved through Lumo.') + (entries.length ? '<div class="outside-history">' + entries.map(entry => { const before = entry.before, after = entry.after, item = after || before || {}; return '<div class="panel life-padded"><strong>' + esc(item.name || 'Outside balance') + '</strong><p class="muted">' + esc(entry.type) + ' · ' + esc(new Date(entry.at).toLocaleString('en-GH')) + '</p><p>' + (before ? show(before.balance) : 'New record') + ' → ' + (after ? show(after.balance) : 'Record removed') + '</p></div>'; }).join('') + '</div>' : '<p>No changes recorded yet.</p>') + btn('Done','outside-history-done'), el => { el.querySelector('[data-action="outside-history-done"]').onclick=()=>ctx.closeSheet(); });
}
function reviewRecoveryIncome(ctx) {
  const r=ctx.state.recovery, received=ctx.state.transactions.filter(t=>t.type==='income'&&t.status==='success'&&t.at>=r.startedAt);
  ctx.sheet(sheetHead('Let’s check what arrived.','Only confirmed money already in your ledger can be reviewed. This does not add money again.') + (received.length ? '<div class="stack">'+received.map(t=>'<button type="button" class="panel life-option" data-review-income="'+esc(t.id)+'"><span><strong>'+esc(t.merchant||'Money received')+'</strong><small>'+dateLabel(t.at)+'</small></span><strong>'+personalMoney(ctx,t.amount)+'</strong></button>').join('')+'</div>' : '<p class="muted">No confirmed money has arrived since this plan began. Expected allowance and IOUs do not count.</p>') + errorBox + btn('Back to my plan','recovery-review-back'), el=>{
    el.querySelector('[data-action="recovery-review-back"]').onclick=()=>ctx.closeSheet();
    el.querySelectorAll('[data-review-income]').forEach(button=>button.onclick=()=>{return runActionFlow(function*(){const result=(yield commit(ctx,'reviewRecoveryIncome',{transactionId:button.dataset.reviewIncome,idempotencyKey:'recovery-review:'+r.startedAt+':'+button.dataset.reviewIncome},el));if(result){ctx.closeSheet();ctx.refresh();ctx.toast(result.message);}});});
  });
}
function finishRecovery(ctx) {
  const sum=getSummary(ctx.state), gap=Math.max(0,sum.planned+(ctx.state.buffer||0)-sum.available);
  ctx.sheet(sheetHead('Ready to finish recovery?','Your commitments and money records stay intact. Saving rules resume only when money allows.') + '<div class="panel life-padded"><p>Current shortfall: <strong>'+personalMoney(ctx,gap)+'</strong></p><p>Available: '+personalMoney(ctx,sum.available)+' · Planned: '+personalMoney(ctx,sum.planned)+'</p></div>' + (gap ? '<label class="recovery-protect"><input type="checkbox" name="recoveryAdjusted"><span>I have reviewed this remaining gap and adjusted my arrangements outside this plan.</span></label>' : '') + errorBox + btn('Finish recovery','recovery-finish-confirm') + btn('Keep this plan','recovery-finish-cancel',{secondary:true}),el=>{
    el.querySelector('[data-action="recovery-finish-cancel"]').onclick=()=>ctx.closeSheet();
    el.querySelector('[data-action="recovery-finish-confirm"]').onclick=()=>{return runActionFlow(function*(){ const confirmAdjusted=el.querySelector('[name="recoveryAdjusted"]')?.checked===true; const result=(yield commit(ctx,'completeRecovery',{confirmAdjusted,idempotencyKey:'recovery-complete:'+ctx.state.recovery.startedAt},el));if(result){ctx.closeSheet();ctx.refresh();ctx.toast(result.message);} });};
  });
}

function groups(ctx) {
  const list = (ctx.state.groups || []).filter(g => (g.members || []).some(m => m.id === getGroupActor(g) && m.status !== 'removed'));
  const saved = ctx.draft.groupCreate;
  const cards = list.map(g => {
    const allowed = canReadGroup(g), unread = allowed ? unreadGroupCount(ctx.state, g) : 0;
    const body = allowed ? '<div class="life-group-amount">' + cash(groupSummary(g).collected) + '<small>of ' + cash(g.target) + '</small></div>' + progress(groupSummary(g).collected, g.target) + '<div class="life-group-meta">' + g.members.filter(m => m.status !== 'removed').length + ' members <span>' + requiredApprovals(g) + ' approvals to pay out</span></div>' : '<div class="group-list-invitation"><strong>Invitation waiting</strong><p>Target: ' + cash(g.target) + ' · Review the agreement to join.</p></div>';
    return '<button class="panel life-group-card" data-action="life-group-' + esc(g.id) + '"><div class="life-group-heading"><span class="life-group-emoji">' + esc(g.emoji || '◎') + '</span><span>' + esc(g.name) + '</span>' + (unread ? '<span class="group-unread" aria-label="' + unread + ' unread updates">' + Math.min(99, unread) + '</span>' : '') + icon('chevron') + '</div>' + body + (g.isSample ? '<div class="group-list-badges"><span>Sample group</span><span>Participant simulation</span></div>' : allowed && g.members.some(m => m.status === 'invited') ? '<div class="group-list-badges"><span>Invitations waiting</span></div>' : '') + '</button>';
  }).join('');
  return '<section class="page life-page">' + pageHead('Group money', { back: false }) +
    '<h1 class="large-question">Good things happen together.</h1><p class="muted">Collect for a shared goal. Agree who can approve money leaving.</p>' +
    (saved ? '<div class="panel group-saved-draft"><p class="eyebrow">Saved setup</p><h2>' + esc((saved.emoji || '◎') + ' ' + (saved.name || 'Your new group')) + '</h2><p class="muted">Your answers are here. Pick up where you left off.</p><div class="inline-actions">' + btn('Continue setup', 'life-resume-group') + btn('Start again', 'life-restart-group', { secondary: true }) + '</div></div>' : '') +
    (list.length ? '<div class="stack">' + cards + '</div>' : saved ? '' : empty({ emoji: '◎', title: 'Start something together.', body: 'A birthday, a trip or your hall project. Give everyone a clear view.' })) +
    (!list.some(g => g.id === 'group-project-printing') ? '<button type="button" class="group-list-sample" data-action="life-printing-demo">' + icon('plan', 25) + '<span><strong>Try Project Printing</strong><small>Six people. One deadline. Follow a sample collection from chat to confirmed payment.</small></span>' + icon('chevron', 16) + '</button>' : '') +
    (!saved ? '<div class="bottom-action">' + btn('Create a group', 'life-new-group') + '</div>' : '') + '</section>';
}

function groupDetail(ctx, route) { return renderGroupOverview(ctx, route); }

function story(ctx) {
  const s = ctx.state;
  const summary = getSummary(s);
  const guideEnd = summary.guidanceSource === 'recovery' ? 'your recovery check-in' : summary.guidanceSource === 'plan' ? 'the end of your plan' : 'your next expected income';
  const payments = (s.transactions || []).filter((x) => x.status === 'success' && ['payment','iou','card-purchase'].includes(x.type) && x.direction === 'out');
  const netAmount = x => Math.max(0,x.amount - (x.type === 'card-purchase' ? x.refunded || 0 : 0)) + (x.fee || 0);
  const categories = new Map();
  payments.forEach((x) => categories.set(x.category || 'Other', (categories.get(x.category || 'Other') || 0) + netAmount(x)));
  const ranked = Array.from(categories.entries()).filter(([,amount])=>amount>0).sort((a, b) => b[1] - a[1]);
  const spent = Math.max(0,payments.reduce((n, x) => n + netAmount(x), 0));
  const merchantRefunds = (s.transactions || []).filter(x => x.type === 'refund' && x.direction === 'in' && x.status === 'success').reduce((n, x) => n + x.amount, 0);
  const contributed = (s.transactions || []).filter((x) => x.type === 'saving' && x.direction === 'out' && x.status === 'success').reduce((n, x) => n + x.amount, 0);
  return '<section class="page life-page">' + pageHead('Your money story', { eyebrow: 'THE PATTERNS THAT MATTER' }) +
    '<h1 class="large-question">' + (ranked.length ? 'Every cedi has a story.' : 'Your story starts here.') + '</h1><p class="muted">A clear look at the activity in this account.</p>' +
    '<div class="stat-grid"><div class="stat"><span class="muted">Payments made</span><strong>' + personalMoney(ctx,spent) + '</strong></div><div class="stat"><span class="muted">Set aside</span><strong class="accent">' + personalMoney(ctx,contributed) + '</strong></div></div>' +
    (ranked.length ? '<div class="section-label">Where your spending went</div><div class="panel life-padded">' + ranked.map(([name, amount], i) => '<div class="life-story-category"><div class="life-between"><span>' + esc(name) + '</span><strong>' + personalMoney(ctx,amount) + '</strong></div><div class="progress"><div class="progress-bar life-category-' + (i % 4) + '" style="width:' + Math.max(2, Math.round(amount / Math.max(1, spent) * 100)) + '%"></div></div></div>').join('') + '</div>' : empty({ emoji: '↗', title: 'A fresh start.', body: 'Your spending patterns will appear as you make payments.', action: 'life-pay', label: 'Make a payment' })) +
    '<div class="panel life-padded"><span class="eyebrow">TODAY’S CHECK-IN</span><h2>' + personalMoney(ctx,summary.spendable) + ' is left after your plan.</h2><p class="muted">' + (summary.hasDailyGuide ? 'That works out to about ' + personalMoney(ctx,summary.dailyAllowance) + ' a day until ' + guideEnd + ' on ' + dateLabel(summary.guidanceDate) + '.' : summary.guidanceDate ? 'Review your planning dates to get a daily guide.' : 'Add a planning end date before using a daily guide. No expected income date is recorded.') + '</p>' + btn('Look at my plan', 'life-plan', { secondary: true }) + '</div>' +
    '<div class="panel">' + actionRow('life-chat', '✳', 'Ask Lux about it', 'Turn these numbers into a next step') + actionRow('life-overview', '◎', 'See the whole picture', 'Available, saved and expected') + '</div>' +
    explain('Transfers between your own accounts are kept out of spending totals.' + (merchantRefunds ? ' Payments made is before ' + personalMoney(ctx,merchantRefunds) + ' in merchant refunds received. Those refunds appear separately in Activity; card refunds already reduce card purchases.' : '')) + '</section>';
}

function settings(ctx) {
  const s = ctx.state;
  return '<section class="page life-page">' + pageHead('You & Lumo') +
    '<div class="life-profile"><div class="life-avatar">' + esc((s.profile.name || 'A').slice(0, 1).toUpperCase()) + '</div><h1>' + esc(s.profile.name || 'Your account') + '</h1><span class="muted">' + esc(s.profile.campus || 'University of Ghana') + '</span></div>' +
    '<div class="section-label">Your account</div><div class="panel">' +
      actionRow('life-profile-edit', icon('users'), 'Your details', 'Name and campus') +
      (s.verification?.mode === 'simulation' && s.verification.status === 'complete' ? row({ emoji: icon('check'), title: 'Identity simulation', sub: s.verification.detailsConfirmed ? `Sample Ghana Card details confirmed · ${s.profile.legalName || 'Demo identity'}` : s.verification.capture === 'live-camera' ? 'Guided selfie check complete · Demo verification' : 'Sample Ghana Card and face check completed', right: 'Complete' }) : '') +
      (s.accounts?.length === 2 ? row({ emoji: icon('bank'), title: 'Two sample accounts', sub: 'Everyday and Savings · No live accounts opened', right: 'Ready' }) : '') +
      actionRow('life-overview', icon('bank'), 'All your money', 'Your accounts, in one view') +
      actionRow('life-ious', '↙', 'IOUs', 'Keep money between friends clear') +
      actionRow('life-groups', icon('users'), 'Group money', 'Shared goals and clear approvals') +
    '</div><div class="section-label">Make it yours</div><div class="panel">' +
      '<button class="row" data-action="life-visibility"><span class="row-icon">' + icon(s.settings.hideBalance ? 'eyeOff' : 'eye') + '</span><span class="row-copy"><span class="row-title">Hide balances</span><span class="row-sub">Keep your numbers private</span></span><span class="life-toggle ' + (s.settings.hideBalance ? 'on' : '') + '" role="switch" aria-checked="' + Boolean(s.settings.hideBalance) + '" aria-label="Hide balances"></span></button>' +
      '<button class="row" data-action="life-notifications"><span class="row-icon">' + icon('clock') + '</span><span class="row-copy"><span class="row-title">In-app reminders</span><span class="row-sub">A heads-up for your plans</span></span><span class="life-toggle ' + (s.settings.notifications ? 'on' : '') + '" role="switch" aria-checked="' + Boolean(s.settings.notifications) + '" aria-label="In-app reminders"></span></button>' +
      actionRow('life-keepback', icon('lock'), 'Your keep-back', 'An amount you prefer to leave untouched', personalMoney(ctx,s.buffer || 0)) +
    '</div><div class="section-label">Here for you</div><div class="panel">' +
      actionRow('life-tour', icon('spark'), 'Take the Lumo tour', 'See what Lumo can do for you') +
      actionRow('life-help', icon('chat'), 'Talk to us', 'Questions, ideas and feedback') +
      actionRow('life-privacy', icon('lock'), 'Privacy & this prototype', ctx.connected?'What syncs and what stays on this device':'What stays on this device') +
    '</div><div class="section-label">Try the full experience</div><div class="panel">' + actionRow('life-onboarding-preview', icon('card'), ctx.draft.onboarding?.preview ? 'Continue signup preview' : 'Try full signup', 'Name, number, Ghana Card and selfie') + '</div>' + explain('Signup preview keeps your current demo account and money choices safe.') +
    '<div class="panel life-padded"><span class="eyebrow">INTERACTIVE PROTOTYPE</span><p>Payments, identity checks and approvals are simulated. No real money moves.</p><p class="muted">'+(ctx.connected?'Use your test transaction PIN. Your shared test-account records sync after sign-in on another device. Resetting this browser does not delete your shared account.':'Use your demo PIN only. Your demo data is saved in this browser.')+'</p><div class="inline-actions">' + btn('Start fresh', 'life-reset', { secondary: true }) + btn('Reload the demo', 'life-demo', { secondary: true }) + '</div></div>' +
    '<p class="life-signoff muted">Lumo · Decisions with clarity.</p></section>';
}

function help(ctx) {
  return '<section class="page life-page">' + pageHead('Talk to us', { eyebrow: 'WE’RE LISTENING' }) +
    '<h1 class="large-question">What is on your mind?</h1><p class="muted">A question, an idea or something that felt off. There is room for all of it.</p>' +
    '<div class="panel">' + actionRow('life-help-question', '?', 'I have a question', 'How something works') + actionRow('life-help-idea', '✳', 'I have an idea', 'Help shape Lumo') + actionRow('life-help-bug', '↻', 'Something is not right', 'Tell us what happened') + '</div>' +
    '<div class="section-label">A few useful answers</div><div class="panel">' + actionRow('life-help-balance', icon('bank'), 'Why are my balances different?') + actionRow('life-help-expected', icon('clock'), 'When does expected money count?') + actionRow('life-help-pause', icon('spark'), 'Why did Lumo pause my payment?') + '</div>' +
    '<div class="notice"><span>This prototype saves feedback on this device. It does not send a message to a support team.</span></div></section>';
}

export function renderLife(ctx, route) {
  switch (route.page) {
    case 'ious': return ious(ctx, route);
    case 'iou-create': return iouCreate(ctx, route);
    case 'iou-detail': return iouDetail(ctx, route);
    case 'recovery': return recovery(ctx, route);
    case 'groups': return groups(ctx);
    case 'group-create': return groupCreate(ctx, route);
    case 'group-detail': return groupDetail(ctx, route);
    case 'story': return story(ctx);
    case 'settings': return settings(ctx);
    case 'help': return help(ctx);
    default: return overview(ctx);
  }
}

function makeIOUDraft(ctx, edit) {
  const existing = edit ? { ...edit } : null;
  const type = existing?.type || (ctx.route?.filter === 'owedByMe' ? 'owedByMe' : 'owedToMe');
  return { id: existing?.id || null, edit: Boolean(existing), type, name: existing?.name || '', amount: existing?.amount || 0, amountText: existing?.amount ? (existing.amount / 100).toFixed(2) : '', due: existing?.due || addDays(7), note: existing?.note || '', budgetItemId: existing?.budgetItemId || '', paid: existing?.paid || 0, step: existing ? 1 : 0, idempotencyKey: uid() };
}
function iouDraft(ctx) {
  if (!ctx.draft.iouCreate) ctx.draft.iouCreate = makeIOUDraft(ctx);
  const d = ctx.draft.iouCreate;
  d.idempotencyKey ||= uid();
  d.type = d.type === 'owedByMe' ? 'owedByMe' : 'owedToMe';
  if (d.amountText === undefined) d.amountText = d.amount ? (d.amount / 100).toFixed(2) : '';
  return d;
}
function openIOUWizard(ctx, edit) {
  const saved = ctx.draft.iouCreate;
  if (saved && (Boolean(saved.edit) !== Boolean(edit) || (edit && saved.id !== edit.id))) {
    ctx.sheet(sheetHead('You have an unfinished IOU.', 'Keep working on it, or start this one. Existing IOU records and repayments stay as they are.') + btn('Continue saved setup', 'life-keep-iou-setup') + btn(edit ? 'Edit this record instead' : 'Start a different IOU', 'life-replace-iou-setup', { secondary: true }), el => {
      el.querySelector('[data-action="life-keep-iou-setup"]').onclick = () => { ctx.closeSheet(); ctx.go(go('iou-create', { step: saved.step || (saved.edit ? 1 : 0) })); };
      el.querySelector('[data-action="life-replace-iou-setup"]').onclick = () => { ctx.draft.iouCreate = makeIOUDraft(ctx, edit); ctx.saveDraft?.(); ctx.closeSheet(); ctx.go(go('iou-create', { step: ctx.draft.iouCreate.step })); };
    });
    return;
  }
  if (!saved) ctx.draft.iouCreate = makeIOUDraft(ctx, edit);
  const d = iouDraft(ctx);
  ctx.go(go('iou-create', { step: Math.max(d.edit ? 1 : 0, Number(d.step) || 0) }));
}
function captureIOUDraft(ctx, route) {
  const d = ctx.draft.iouCreate;
  if (!d || route.page !== 'iou-create') return;
  const fields = [['iouName', 'name'], ['iouAmount', 'amountText'], ['iouDue', 'due'], ['iouNote', 'note'], ['iouBudgetItem', 'budgetItemId']];
  for (const [name, key] of fields) { const el = ctx.$('[name="' + name + '"]'); if (el) d[key] = el.value.slice(0, key === 'name' ? 60 : key === 'note' ? 240 : 60); }
  d.step = Math.max(d.edit ? 1 : 0, Math.min(3, Number(route.step) || 0));
}
function discardIOUDraft(ctx) {
  const d = ctx.draft.iouCreate;
  if (!d) return;
  ctx.sheet(sheetHead('Discard this unfinished IOU?', 'This clears only the unsaved setup. Existing records, repayments and balances stay as they are.') + btn('Discard draft', 'life-confirm-discard-iou') + btn('Keep my setup', 'life-keep-iou-draft', { secondary: true }), el => {
    el.querySelector('[data-action="life-keep-iou-draft"]').onclick = () => ctx.closeSheet();
    el.querySelector('[data-action="life-confirm-discard-iou"]').onclick = () => { const filter = d.type; delete ctx.draft.iouCreate; ctx.saveDraft?.(); ctx.closeSheet(); ctx.go(go('ious', { filter }), { replace: true }); };
  });
}
function iouBudgetLink(ctx, d) {
  if (d.type !== 'owedByMe') return '';
  return '<label class="field"><span>Already included in your plan?</span><select class="input" name="iouBudgetItem"><option value="">No, reserve this separately</option>' + (ctx.state.budget?.items || []).map(item => '<option value="' + esc(item.id) + '"' + (d.budgetItemId === item.id ? ' selected' : '') + '>' + esc(item.name) + '</option>').join('') + '</select><small>Link the same obligation so Lumo counts it once. Any uncovered amount remains planned.</small></label>';
}
function iouCreate(ctx, route) {
  const d = iouDraft(ctx), step = Math.max(d.edit ? 1 : 0, Math.min(3, Number(route.step) || 0));
  d.step = step;
  const labels = ['Direction', 'Person', 'Amount', 'Date & note'];
  const head = pageHead(d.edit ? 'Edit IOU' : 'Keep an IOU', { action: '<button type="button" class="text-button" data-action="life-record-exit">Save & exit</button>' });
  const track = '<div class="group-wizard-progress" aria-label="Step ' + (d.edit ? step : step + 1) + ' of ' + (d.edit ? 3 : 4) + '"><div class="setup-progress">' + labels.filter((_, i) => !d.edit || i > 0).map((_, i) => '<span class="' + (i <= step - (d.edit ? 1 : 0) ? 'done' : '') + '"></span>').join('') + '</div><div class="group-step-label"><span>Step ' + (d.edit ? step : step + 1) + ' of ' + (d.edit ? 3 : 4) + '</span><span>' + labels[step] + '</span></div></div>';
  let body;
  if (step === 0) body = '<h1 class="large-question">Which way is<br>the money going?</h1><div class="stack"><button type="button" class="panel life-option ' + (d.type === 'owedToMe' ? 'selected' : '') + '" data-action="life-record-direction" data-direction="owedToMe" aria-pressed="' + (d.type === 'owedToMe') + '"><span>↙</span><span><strong>Someone owes me</strong><small>Track money you expect back.</small></span>' + icon(d.type === 'owedToMe' ? 'check' : 'chevron') + '</button><button type="button" class="panel life-option ' + (d.type === 'owedByMe' ? 'selected' : '') + '" data-action="life-record-direction" data-direction="owedByMe" aria-pressed="' + (d.type === 'owedByMe') + '"><span>↗</span><span><strong>I owe someone</strong><small>Keep a repayment in view.</small></span>' + icon(d.type === 'owedByMe' ? 'check' : 'chevron') + '</button></div>';
  else if (step === 1) body = '<h1 class="large-question">' + (d.type === 'owedToMe' ? 'Who owes you?' : 'Who helped<br>you out?') + '</h1><p class="muted group-step-help">A name makes this agreement easy to find.</p><label class="field"><span>Their name</span><input class="input" name="iouName" value="' + esc(d.name) + '" maxlength="60" placeholder="Kofi" autocomplete="off" required></label>';
  else if (step === 2) body = '<h1 class="large-question">How much are we<br>keeping track of?</h1>' + amountInput('iouAmount', d.amountText, 'Total IOU amount') + (d.paid ? explain(personalMoney(ctx,d.paid) + ' has already been repaid. Keep the total at least that high.') : explain('No money moves when you save this record.'));
  else body = '<h1 class="large-question">When is<br>it due?</h1><p class="muted group-step-help">' + esc(d.name) + (d.type === 'owedToMe' ? ' owes you ' : ' is owed ') + cash(d.amount) + '.</p>' + field({ label: 'Agreed date', name: 'iouDue', type: 'date', value: d.due, required: true }) + '<label class="field"><span>A note, if you like</span><input class="input" name="iouNote" value="' + esc(d.note || '') + '" maxlength="240" placeholder="Lunch at Bush Canteen" autocomplete="off"></label>' + iouBudgetLink(ctx,d) + '<p class="notice">' + (d.type === 'owedToMe' ? 'This stays expected money until you record its arrival.' : 'This records what you owe. It does not send a payment.') + '</p>';
  const previous = step === (d.edit ? 1 : 0) ? 'IOUs' : 'Previous';
  return '<section class="page life-page group-wizard iou-wizard">' + head + track + '<form id="iou-create-form" class="group-create-form" novalidate>' + body + errorBox + '</form><div class="bottom-action"><div class="inline-actions">' + btn(previous, 'life-record-previous', { secondary: true }) + btn(step === 3 ? d.edit ? 'Save changes' : 'Keep this IOU' : 'Continue', step === 3 ? 'life-record-save' : 'life-record-next') + '</div></div></section>';
}
function validateIOUStep(ctx, route) {
  captureIOUDraft(ctx, route);
  const d = iouDraft(ctx), step = Number(route.step) || 0, root = document.querySelector('#view');
  if (step === 1) { d.name = d.name.trim(); if (!d.name) return formError(root, 'Add a name so you can recognise this IOU.'), false; }
  if (step === 2) {
    const text = String(d.amountText || '').trim(), amount = Math.round(Number(text) * 100);
    if (!/^\d+(\.\d{0,2})?$/.test(text) || !Number.isSafeInteger(amount) || amount <= 0 || amount > 10000000000 || amount < (d.paid || 0)) return formError(root, 'Add a valid total, including anything already repaid.'), false;
    d.amount = amount;
  }
  if (step === 3) {
    const date = /^\d{4}-\d{2}-\d{2}$/.test(d.due) ? new Date(d.due + 'T12:00:00Z') : null;
    if (!date || !Number.isFinite(date.getTime()) || date.toISOString().slice(0, 10) !== d.due) return formError(root, 'Choose a valid agreed date.'), false;
  }
  ctx.saveDraft?.(); return true;
}
function bindIOUCreate(ctx, route) {
  const root = document.querySelector('#view');
  iouDraft(ctx);
  ctx.setCapture?.(() => captureIOUDraft(ctx, route));
  ctx.saveDraft?.();
  root.querySelectorAll('[name="iouName"],[name="iouAmount"],[name="iouDue"],[name="iouNote"]').forEach(input => input.addEventListener('input', () => { captureIOUDraft(ctx, route); ctx.saveDraft?.(); }));
  root.querySelector('#iou-create-form')?.addEventListener('submit', event => { event.preventDefault(); root.querySelector('[data-action="' + ((Number(route.step) || 0) === 3 ? 'life-record-save' : 'life-record-next') + '"]')?.click(); });
}
function settleIOU(ctx, x) {
  if (!ctx.draft.iouSettlement || ctx.draft.iouSettlement.id !== x.id) ctx.draft.iouSettlement = { id:x.id,amountText:(remaining(x)/100).toFixed(2),operationId:uid(),destination:'',receiptTransactionId:'' };
  const d=ctx.draft.iouSettlement,incoming=x.type==='owedToMe';
  if(!incoming && !d.method)d.method='lumo';
  function show() {
    const receipts=unmatchedReceipts(ctx.state.transactions,{requireLedger:ctx.connected===true});
    const choices=incoming?`<label class="field"><span>Where did it arrive?</span><select name="receiptDestination" required><option value="">Choose where you received it</option>${[['lumo','In Lumo · match an existing receipt'],['cash','Cash'],['momo','My outside MoMo wallet'],['bank','My outside bank account']].map(([v,label])=>`<option value="${v}" ${d.destination===v?'selected':''}>${label}</option>`).join('')}</select></label><div data-receipt-choice ${d.destination==='lumo'?'':'hidden'}><label class="field"><span>Confirmed Lumo receipt</span><select name="receiptTransaction"><option value="">Choose a receipt</option>${receipts.map(t=>`<option value="${esc(t.id)}" ${d.receiptTransactionId===t.id?'selected':''}>${esc(t.merchant)} · ${personalMoney(ctx,unmatchedReceiptAmount(t,{requireLedger:ctx.connected===true}))} unmatched · ${dateLabel(t.at)}</option>`).join('')}</select></label><p class="muted">No receipt yet? Add the received money to Lumo first, then match it here. Matching never adds it twice.</p></div><p class="muted">Outside repayments close the IOU without changing Lumo or your manually recorded balances. Update outside balances separately if needed.</p>`:`<label class="field"><span>How are we settling up?</span><select name="repaymentMethod"><option value="lumo" ${d.method==='lumo'?'selected':''}>Pay a Lumo person</option><option value="momo" ${d.method==='momo'?'selected':''}>Send to mobile money</option><option value="outside" ${d.method==='outside'?'selected':''}>I already paid outside Lumo</option></select></label><div data-outside-choice ${d.method==='outside'?'':'hidden'}><label class="field"><span>Where did you pay?</span><select name="outsideDestination"><option value="">Choose where you paid</option>${[['cash','Cash'],['momo','My outside MoMo wallet'],['bank','My outside bank account']].map(([v,label])=>`<option value="${v}" ${d.destination===v?'selected':''}>${label}</option>`).join('')}</select></label><p class="muted">Record only a repayment you have already made. Lumo and your recorded outside balances stay unchanged.</p></div>`;
    ctx.sheet(sheetHead(incoming?'Where did the money land?':'How much are you repaying?',incoming?'Match money already received. A promise is still expected money.':'Choose a payment, or record money already paid elsewhere.')+'<form class="form-stack">'+amountInput('settleAmount',d.amountText)+'<p class="muted">'+personalMoney(ctx,remaining(x))+' still '+(incoming?'expected from ':'owed to ')+esc(x.name)+'.</p>'+choices+errorBox+'<button class="button" type="submit">'+(incoming?'Record repayment':'Review repayment')+'</button></form>'+btn('Back to IOU','life-settlement-close',{secondary:true}),el=>{
      el.querySelector('[name="settleAmount"]').addEventListener('input',e=>{d.amountText=e.target.value;ctx.saveDraft?.();});
      el.querySelector('[name="receiptDestination"]')?.addEventListener('change',e=>{d.destination=e.target.value;el.querySelector('[data-receipt-choice]').hidden=d.destination!=='lumo';ctx.saveDraft?.();});
      el.querySelector('[name="receiptTransaction"]')?.addEventListener('change',e=>{d.receiptTransactionId=e.target.value;ctx.saveDraft?.();});
      el.querySelector('[name="repaymentMethod"]')?.addEventListener('change',e=>{d.method=e.target.value;el.querySelector('[data-outside-choice]').hidden=d.method!=='outside';ctx.saveDraft?.();});
      el.querySelector('[name="outsideDestination"]')?.addEventListener('change',e=>{d.destination=e.target.value;ctx.saveDraft?.();});
      el.querySelector('[data-action="life-settlement-close"]').onclick=()=>ctx.closeSheet();
      el.querySelector('form').onsubmit=e=>{return runActionFlow(function*(){
        e.preventDefault();d.amountText=el.querySelector('[name="settleAmount"]').value;ctx.saveDraft?.();
        const amount=readAmount(el.querySelector('[name="settleAmount"]'));
        if(!Number.isSafeInteger(amount)||amount<=0||amount>remaining(x))return formError(el,'Choose an amount up to '+personalMoney(ctx,remaining(x))+'.');
        if(incoming&&(!d.destination||(d.destination==='lumo'&&!d.receiptTransactionId)))return formError(el,'Choose where it arrived and a confirmed receipt for Lumo money.');
        if(incoming&&d.destination==='lumo'){const receipt=ctx.state.transactions?.find(t=>t.id===d.receiptTransactionId),unmatched=unmatchedReceiptAmount(receipt,{requireLedger:ctx.connected===true});if(amount>unmatched)return formError(el,'This receipt has '+personalMoney(ctx,unmatched)+' unmatched. Choose that amount or less.');}
        if(!incoming && d.method!=='outside'){ const available=repayableIOUAmount(ctx.state,x);if(amount>available)return formError(el,'There is '+personalMoney(ctx,Math.max(0,available))+' left to repay after pending payments.');ctx.closeSheet();prepareIOURepayment(ctx,x,amount,d.method);return; }
        if(!incoming&&!['cash','momo','bank'].includes(d.destination))return formError(el,'Choose where you already paid.');
        const act=()=>{return runActionFlow(function*(){
          const payload={id:x.id,amount,idempotencyKey:d.operationId,...(incoming?d.destination==='lumo'?{receiptTransactionId:d.receiptTransactionId}:{destination:d.destination}:{outside:true,destination:d.destination})};
          const r=(yield commit(ctx,'settleIOU',payload,el));if(!r)return;
          delete ctx.draft.iouSettlement;ctx.saveDraft?.();ctx.closeSheet();ctx.refresh();ctx.toast(r.message);
        });};
        if(incoming)(yield act());else ctx.auth({title:'Record outside repayment to '+x.name,onCancel:show,onSuccess:act});
      });};
    });
  }
  show();
}

function shareText(ctx, title, text, onReturn) {return runActionFlow(function*(){
  try {
    if (navigator.share) {
      (yield navigator.share({ title, text }));
      return;
    }
    if (navigator.clipboard?.writeText) {
      (yield navigator.clipboard.writeText(text));
      ctx.toast('Copied. Share it wherever you like.');
      return;
    }
  } catch (e) {
    if (e?.name === 'AbortError') return;
  }
  ctx.sheet(sheetHead(title, 'Copy this text to share it.') + '<textarea class="input life-share-text" readonly>' + esc(text) + '</textarea>' + btn(onReturn ? 'Back to invitation' : 'Done', 'life-share-done'), (el) => {
    el.querySelector('textarea').select();
    el.querySelector('[data-action="life-share-done"]').onclick = () => onReturn ? onReturn() : ctx.closeSheet();
  });
});}

const groupPhone = value => String(value || '').replace(/[\s()-]/g, '');
const groupApproverCount = d => 1 + d.members.filter(m => m.role === 'approver').length;
function groupDraft(ctx) {
  if (!ctx.draft.groupCreate) ctx.draft.groupCreate = { name: '', emoji: '◎', target: 0, targetText: '', members: [], threshold: 2, step: 0, editing: false, idempotencyKey: uid(), membersVersion: 1 };
  const d = ctx.draft.groupCreate;
  d.idempotencyKey ||= uid();
  if (d.membersVersion !== 1) {
    d.members = []; d.membersVersion = 1; d.step = Math.min(Number(d.step) || 0, 2);
    d.editing = false; delete d.reviewSnapshot;
  }
  d.members = Array.isArray(d.members) ? d.members : [];
  d.count = groupApproverCount(d);
  d.threshold = Math.max(1, Math.min(d.count, Number(d.threshold) || 2));
  if (d.targetText === undefined) d.targetText = d.target ? (d.target / 100).toFixed(2) : '';
  return d;
}
function captureGroupDraft(ctx, route) {
  const d = ctx.draft.groupCreate;
  if (!d || route.page !== 'group-create') return;
  const name = ctx.$('[name="groupName"]'), purpose = ctx.$('[name="groupPurpose"]'), deadline = ctx.$('[name="groupDeadline"]'), target = ctx.$('[name="groupTarget"]'), threshold = ctx.$('[name="threshold"]');
  if (name) d.name = name.value.slice(0, 60);
  if (purpose) d.purpose = purpose.value.slice(0, 240);
  if (deadline) d.deadline = deadline.value;
  if (target) d.targetText = target.value;
  d.count = groupApproverCount(d);
  if (threshold) d.threshold = Math.max(1, Math.min(d.count, Number(threshold.value)));
  d.step = Math.max(0, Math.min(4, Number(route.step) || 0));
  d.editing = Boolean(route.edit);
}
function groupStep(ctx, step, extra = {}, replace = false) {
  ctx.go(go('group-create', { step, ...extra }), { replace });
}
function newGroup(ctx) {
  const d = groupDraft(ctx);
  groupStep(ctx, d.step || 0, d.editing ? { edit: true } : {});
}
function restartGroup(ctx) {
  ctx.sheet(sheetHead('Start this setup again?', 'Only this unfinished group setup will be cleared. Your existing groups stay as they are.') + btn('Start a new setup', 'life-confirm-group-restart') + btn('Keep my saved setup', 'life-keep-group-draft', { secondary: true }), el => {
    el.querySelector('[data-action="life-keep-group-draft"]').onclick = () => ctx.closeSheet();
    el.querySelector('[data-action="life-confirm-group-restart"]').onclick = () => { delete ctx.draft.groupCreate; ctx.saveDraft?.(); ctx.closeSheet(); newGroup(ctx); };
  });
}
function groupCreate(ctx, route) {
  const d = groupDraft(ctx), step = Math.max(0, Math.min(4, Number(route.step) || 0));
  if (step === 4 && !route.edit && d.reviewSnapshot) { Object.assign(d, d.reviewSnapshot); delete d.reviewSnapshot; }
  d.count = groupApproverCount(d); d.threshold = Math.max(1, Math.min(d.count, d.threshold));
  d.step = step; d.editing = Boolean(route.edit);
  const names = ['You', ...d.members.filter(m => m.role === 'approver').map(m => m.name)].join(' + ');
  const steps = ['Purpose', 'Target', 'Your people', 'Agreement', 'Review'];
  const head = pageHead(route.edit ? 'Edit group details' : 'Create a group', { action: '<button type="button" class="text-button" data-action="life-create-exit">Save & exit</button>' });
  const track = '<div class="group-wizard-progress" aria-label="Step ' + (step + 1) + ' of 5"><div class="setup-progress">' + steps.map((_, i) => '<span class="' + (i <= step ? 'done' : '') + '"></span>').join('') + '</div><div class="group-step-label"><span>Step ' + (step + 1) + ' of 5</span><span>' + steps[step] + '</span></div></div>';
  let body;
  if (step === 0) body = '<h1 class="large-question">What are you bringing people together for?</h1><p class="muted group-step-help">Give your shared goal a name.</p>' +
    '<label class="field"><span>Group name</span><input class="input" name="groupName" value="' + esc(d.name) + '" placeholder="Legon weekend away" maxlength="60" autocomplete="off" required></label>' +
    field({ label: 'A little more detail, if you like', name: 'groupPurpose', value: d.purpose || '', placeholder: 'Print and bind our project reports' }) + '<div class="chips" role="group" aria-label="Choose a group symbol">' + ['◎', '🎉', '⚽', '🏖️', '🎓'].map(emoji => '<button type="button" class="chip ' + (d.emoji === emoji ? 'selected' : '') + '" data-group-emoji="' + emoji + '" aria-label="' + emoji + '" aria-pressed="' + (d.emoji === emoji) + '">' + emoji + '</button>').join('') + '</div>';
  else if (step === 1) body = '<h1 class="large-question">What’s the goal<br>you’re aiming for?</h1><p class="muted group-step-help">Everyone can see the target and your progress together.</p>' + amountInput('groupTarget', d.targetText, 'Group target') + field({ label: 'Deadline, if there is one', name: 'groupDeadline', type: 'date', value: d.deadline || '' }) + '<p class="muted life-note">This is a target, not a payment. Your group starts at GH₵0.00.</p>';
  else if (step === 2) body = '<h1 class="large-question">Who’s coming<br>along?</h1><p class="muted group-step-help">Add your people and choose what each person can do.</p><div class="panel group-member-list">' +
    row({ emoji: icon('users'), title: 'You', sub: 'Group creator · Approver' }) + d.members.map((m, i) => row({ emoji: esc(m.name.slice(0, 1).toUpperCase()), title: m.name, sub: (m.role === 'approver' ? 'Approver' : 'Contributor') + (m.phone ? ' · ' + m.phone : ''), right: 'Edit', action: 'life-create-member-' + i })).join('') + '</div>' +
    btn('+ Add someone', 'life-create-add-member', { secondary: true }) + '<p class="muted life-note">People you add receive a demo invitation to accept. No real invitation is sent. They cannot read the group chat or approve money before joining.</p>';
  else if (step === 3) body = '<h1 class="large-question">Agree how<br>money leaves.</h1><p class="muted group-step-help">Choose how many of your approvers must agree to each payout.</p>' +
    '<div class="panel group-approvers">' + row({ emoji: icon('users'), title: d.count + (d.count === 1 ? ' approver' : ' approvers'), sub: names }) + '</div>' +
    '<label class="field"><span>Approvals needed for every payout</span><select class="input" name="threshold">' + Array.from({ length: d.count }, (_, i) => i + 1).map(n => '<option value="' + n + '"' + (d.threshold === n ? ' selected' : '') + '>' + n + (n === 1 ? ' approval' : ' different approvals') + '</option>').join('') + '</select></label>' +
    '<p class="notice group-mandate-copy" id="group-mandate-copy">' + d.threshold + ' of ' + d.count + ' different approvers must agree before money leaves.</p>' + (d.count === 1 ? '<p class="muted life-note">You are the only approver. You can go back and give another member an approver role.</p>' : '');
  else body = '<h1 class="large-question">A clear start.<br>For everyone.</h1><p class="muted group-step-help">Check the details. Tap anything you’d like to change.</p><div class="panel group-review">' +
    row({ emoji: d.emoji, title: d.name || 'Group name', sub: 'Purpose and symbol', action: 'life-create-edit-0', right: 'Edit' }) +
    row({ emoji: '🎯', title: 'Group target', right: cash(d.target), action: 'life-create-edit-1', sub: 'Starting balance: GH₵0.00' }) +
    row({ emoji: icon('users'), title: (d.members.length + 1) + ' group members', sub: ['You', ...d.members.map(m => m.name)].join(', '), action: 'life-create-edit-2', right: 'Edit' }) +
    row({ emoji: icon('lock'), title: d.threshold + ' of ' + d.count + ' approvals to pay out', sub: names, action: 'life-create-edit-3', right: 'Edit' }) + '</div>' +
    '<p class="muted life-note">Demo group only. You start as the creator. The others join after reviewing and accepting their invitations. No one is notified and no real money moves.</p>';
  const previous = step === 0 ? 'Groups' : route.edit ? 'Cancel edit' : 'Previous';
  const next = step === 4 ? 'Create the group' : route.edit ? 'Save change' : step === 3 ? 'Review group' : 'Continue';
  return '<section class="page life-page group-wizard">' + head + track + '<form id="group-create-form" class="group-create-form" novalidate>' + body + errorBox + '</form><div class="bottom-action"><div class="inline-actions">' + btn(previous, 'life-create-previous', { secondary: true }) + btn(next, step === 4 ? 'life-create-save' : 'life-create-next') + '</div></div></section>';
}
function validateGroupStep(ctx, route) {
  captureGroupDraft(ctx, route);
  const d = groupDraft(ctx), step = Number(route.step) || 0, root = document.querySelector('#view');
  if (step === 0) { d.name = d.name.trim(); if (!d.name) return formError(root, 'Give your group a name.'), false; }
  if (step === 1) {
    const text = String(d.targetText || '').trim();
    const amount = Math.round(Number(text) * 100);
    if (!/^\d+(\.\d{0,2})?$/.test(text) || !Number.isSafeInteger(amount) || amount <= 0 || amount > 10000000000) return formError(root, 'Choose a valid target above zero, with up to two decimal places.'), false;
    d.target = amount;
    if (d.deadline && (!/^\d{4}-\d{2}-\d{2}$/.test(d.deadline) || !Number.isFinite(Date.parse(d.deadline + 'T12:00:00Z')) || new Date(d.deadline + 'T12:00:00Z').toISOString().slice(0,10) !== d.deadline)) return formError(root, 'Choose a valid deadline or leave it empty.'), false;
  }
  if (step === 2 && !d.members.length) return formError(root, 'Add at least one person to your group.'), false;
  if (step === 3 && (!Number.isSafeInteger(d.threshold) || d.threshold < 1 || d.threshold > d.count)) return formError(root, 'Choose an approval rule your approvers can meet.'), false;
  ctx.saveDraft?.();
  return true;
}
function editGroupDraftMember(ctx, index = -1) {
  const d = groupDraft(ctx), member = d.members[index], value = member || { id: uid(), name: '', phone: '', role: 'contributor' };
  if (!member && d.members.length >= 49) { ctx.toast('This demo group supports up to fifty members, including you.'); return; }
  ctx.sheet(sheetHead(member ? 'Edit your person.' : 'Bring someone along.', 'Choose their role in this demo group.') + '<form class="form-stack">' +
    field({ label: 'Their name', name: 'groupMemberName', value: value.name, placeholder: 'Esi', required: true }) +
    field({ label: 'Phone number (optional)', name: 'groupMemberPhone', type: 'tel', value: value.phone || '', placeholder: '024 000 0000' }) +
    '<label class="field"><span>Their role</span><select class="input" name="groupMemberRole"><option value="contributor"' + (value.role !== 'approver' ? ' selected' : '') + '>Contributor · add money and follow progress</option><option value="approver"' + (value.role === 'approver' ? ' selected' : '') + '>Approver · also approve payouts</option></select></label>' +
    errorBox + '<button class="button" type="submit">' + (member ? 'Save member' : 'Add to group') + '</button></form>' + (member ? btn('Remove member', 'life-remove-draft-member', { secondary: true }) : '') + '<p class="muted life-note">Saved in this prototype only. No invitation or message is sent.</p>', el => {
    el.querySelector('form').onsubmit = event => {
      event.preventDefault();
      const name = el.querySelector('[name="groupMemberName"]').value.trim().replace(/\s+/g, ' ').slice(0, 60), phone = groupPhone(el.querySelector('[name="groupMemberPhone"]').value), role = el.querySelector('[name="groupMemberRole"]').value;
      if (!name) return formError(el, 'Add their name first.');
      if (phone && !/^(0\d{9}|\+233\d{9})$/.test(phone)) return formError(el, 'Use a 10-digit Ghana number or +233 followed by 9 digits.');
      if (phone && d.members.some((m, i) => i !== index && groupPhone(m.phone).replace(/^\+233/, '0') === phone.replace(/^\+233/, '0'))) return formError(el, 'This phone number is already in your group. Edit their existing entry.');
      const saved = { ...value, name, phone, role: role === 'approver' ? 'approver' : 'contributor' };
      if (member) d.members[index] = saved; else d.members.push(saved);
      d.count = groupApproverCount(d); d.threshold = Math.max(1, Math.min(d.count, d.threshold));
      ctx.saveDraft?.(); ctx.closeSheet(); ctx.refresh();
    };
    el.querySelector('[data-action="life-remove-draft-member"]')?.addEventListener('click', () => { d.members.splice(index, 1); d.count = groupApproverCount(d); d.threshold = Math.max(1, Math.min(d.count, d.threshold)); ctx.saveDraft?.(); ctx.closeSheet(); ctx.refresh(); });
  });
}
function bindGroupCreate(ctx, route) {
  const root = document.querySelector('#view');
  groupDraft(ctx);
  ctx.setCapture?.(() => captureGroupDraft(ctx, route));
  ctx.saveDraft?.();
  root.querySelectorAll('[name="groupName"],[name="groupPurpose"],[name="groupDeadline"],[name="groupTarget"],[name="threshold"]').forEach(input => input.addEventListener('input', () => { captureGroupDraft(ctx, route); ctx.saveDraft?.(); }));
  root.querySelector('[name="threshold"]')?.addEventListener('change', () => { captureGroupDraft(ctx, route); const d = groupDraft(ctx); root.querySelector('#group-mandate-copy').textContent = d.threshold + ' of ' + d.count + ' different approvers must agree before money leaves.'; ctx.saveDraft?.(); });
  root.querySelectorAll('[data-group-emoji]').forEach(b => b.addEventListener('click', () => { const d = groupDraft(ctx); d.emoji = b.dataset.groupEmoji; root.querySelectorAll('[data-group-emoji]').forEach(x => { x.classList.toggle('selected', x === b); x.setAttribute('aria-pressed', String(x === b)); }); ctx.saveDraft?.(); }));
  root.querySelector('#group-create-form')?.addEventListener('submit', event => { event.preventDefault(); root.querySelector('[data-action="' + ((Number(route.step) || 0) === 4 ? 'life-create-save' : 'life-create-next') + '"]')?.click(); });
}


function editProfile(ctx) {
  ctx.sheet(sheetHead('A little about you.') + '<form class="form-stack">' +
    field({ label: 'What should we call you?', name: 'profileName', value: ctx.state.profile.name, required: true }) +
    field({ label: 'Your campus', name: 'profileCampus', value: ctx.state.profile.campus || '', placeholder: 'University of Ghana' }) +
    errorBox + '<button class="button" type="submit">Save details</button></form>', (el) => {
    el.querySelector('form').onsubmit = (e) => {return runActionFlow(function*(){
      e.preventDefault();
      const name = el.querySelector('[name="profileName"]').value.trim().slice(0, 50);
      const campus = el.querySelector('[name="profileCampus"]').value.trim().slice(0, 80);
      if (!name) return formError(el, 'What name would you like to use?');
      if (!(yield commit(ctx, 'updateProfile', { name, campus }, el))) return;
      ctx.closeSheet(); ctx.refresh(); ctx.toast('That is you.');
    });};
  });
}

function feedback(ctx, kind) {
  const title = kind === 'idea' ? 'What would make Lumo better?' : kind === 'bug' ? 'What happened?' : 'What would you like to know?';
  ctx.sheet(sheetHead(title) + '<form class="form-stack"><label class="field"><span>Your ' + (kind === 'idea' ? 'idea' : kind === 'bug' ? 'feedback' : 'question') + '</span><textarea class="input life-feedback" name="feedback" placeholder="Tell us in your own words…" maxlength="1500" required></textarea></label>' +
    '<p class="muted">Saved on this device for your prototype review. Nothing is sent.</p>' + errorBox + '<button class="button" type="submit">Save feedback</button></form>', (el) => {
    el.querySelector('form').onsubmit = (e) => {
      e.preventDefault();
      const message = el.querySelector('textarea').value.trim();
      if (!message) return formError(el, 'Add a few words first.');
      try {
        const list = JSON.parse(localStorage.getItem('lumo-prototype-feedback') || '[]');
        list.push({ type: kind, message, at: new Date().toISOString() });
        localStorage.setItem('lumo-prototype-feedback', JSON.stringify(list));
      } catch {
        ctx.draft.feedback = [...(ctx.draft.feedback || []), { type: kind, message }];
      }
      ctx.closeSheet(); ctx.toast('Feedback saved on this device.');
    };
  });
}

function infoSheet(ctx, title, body) {
  ctx.sheet(sheetHead(title) + '<div class="life-info-copy">' + body + '</div>' + btn('Got it', 'life-info-done'), (el) => {
    el.querySelector('[data-action="life-info-done"]').onclick = () => ctx.closeSheet();
  });
}

export function bindLife(ctx, route) {
  const root = document.querySelector('#view');
  if (!root) return;
  if (route.page === 'group-detail') return bindGroupOverview(ctx, route);
  if (route.page === 'group-create') bindGroupCreate(ctx, route);
  if (route.page === 'iou-create') bindIOUCreate(ctx, route);
  if (route.page === 'recovery') { ctx.setCapture?.(() => captureRecoveryDraft(ctx, route)); root.querySelectorAll('[data-recovery-protect]').forEach(input => { input.onchange = () => { const amount = root.querySelector('[data-recovery-remaining="' + input.dataset.recoveryProtect + '"]'); amount.disabled = input.checked; amount.closest('label').hidden = input.checked; captureRecoveryDraft(ctx, route); }; }); }
  root.querySelectorAll('[data-action]').forEach((b) => {
    const a = b.dataset.action;
    if (!a?.startsWith('life-')) return;
    b.addEventListener('click', () => {return runActionFlow(function*(){
      const s = ctx.state;
      const x = (s.ious || []).find((i) => i.id === route.id);
      const g = (s.groups || []).find((i) => i.id === route.id);
      if (a === 'life-external-history') { outsideHistory(ctx); return; }
      if (a === 'life-recovery-review-income') { reviewRecoveryIncome(ctx); return; }
      if (a === 'life-recovery-complete') { finishRecovery(ctx); return; }
      if (a === 'life-recovery-home') { ctx.go({section:'home',page:'home'}); return; }
      if (a === 'life-recovery-adjust') { ctx.draft.recovery = { days: ctx.state.recovery.days || 7, checkInDate: ctx.state.recovery.active ? ctx.state.recovery.checkInDate || ctx.state.recovery.nextDate : addDays(7), adjustments: {}, editing: true }; ctx.go(go('recovery',{step:0})); return; }
      if (a === 'life-external-add') { editOutsideMoney(ctx); return; }
      if (a.startsWith('life-external-edit:')) { const balance = (s.externalBalances || []).find((item) => item.id === a.slice('life-external-edit:'.length)); if (balance) editOutsideMoney(ctx, balance); return; }
      if (a === 'life-visibility') { (yield (ctx.actAsync||ctx.act).call(ctx,'settings', { hideBalance: !s.settings.hideBalance })); ctx.refresh(); return; }
      if (a === 'life-notifications') { (yield (ctx.actAsync||ctx.act).call(ctx,'settings', { notifications: !s.settings.notifications })); ctx.refresh(); return; }
      if (a === 'life-tour') { ctx.startTour({ replay: true, returnTo: route }); return; }
      if (a === 'life-onboarding-preview') { ctx.startOnboardingPreview(); return; }
      if (a === 'life-requests' || a === 'life-splits') { ctx.go({section:'pay',page:a === 'life-requests'?'requests':'splits'}); return; }
      if (a === 'life-cards') { ctx.go({section:'pay',page:'cards'}); return; }
      if (a === 'life-wallet') { ctx.go({ section: 'activity', page: 'home' }); return; }
      if (a === 'life-boxes') { ctx.go({ section: 'boxes', page: 'home' }); return; }
      if (a === 'life-plan') { ctx.go({ section: 'plan', page: 'home' }); return; }
      if (a === 'life-chat') { ctx.go({ section: 'chat', page: 'home' }); return; }
      if (a === 'life-pay') { ctx.go({ section: 'pay', page: 'home' }); return; }
      if (a === 'life-iou-filter') { ctx.go(go('ious', { filter: b.dataset.filter })); return; }
      if (a === 'life-ious-owe') { ctx.go(go('ious', { filter: 'owedByMe' })); return; }
      if (['life-overview', 'life-ious', 'life-recovery', 'life-groups', 'life-story', 'life-settings', 'life-help'].includes(a)) {
        if (a === 'life-recovery') ctx.draft.recovery = { days: 7, mode: 'steady', adjustments: {} };
        ctx.go(go(a.slice(5))); return;
      }
      if (a === 'life-new-iou') { openIOUWizard(ctx); return; }
      if (a === 'life-resume-iou') { const d = ctx.draft.iouCreate; if (d) ctx.go(go('iou-create', { step: Math.max(d.edit ? 1 : 0, d.step || 0) })); else openIOUWizard(ctx); return; }
      if (a === 'life-discard-iou') { discardIOUDraft(ctx); return; }
      if (a === 'life-record-direction') { const d = iouDraft(ctx); if (!d.edit) d.type = b.dataset.direction === 'owedByMe' ? 'owedByMe' : 'owedToMe'; ctx.saveDraft?.(); ctx.refresh(); return; }
      if (a === 'life-record-exit') { captureIOUDraft(ctx, route); const d = iouDraft(ctx); ctx.saveDraft?.(); ctx.go(go('ious', { filter: d.type }), { replace: true }); return; }
      if (a === 'life-record-previous') { captureIOUDraft(ctx, route); const d = iouDraft(ctx), step = Number(route.step) || 0; ctx.saveDraft?.(); if (step <= (d.edit ? 1 : 0)) ctx.go(go('ious', { filter: d.type }), { replace: true }); else ctx.go(go('iou-create', { step: step - 1 }), { replace: true }); return; }
      if (a === 'life-record-next') { if (validateIOUStep(ctx, route)) ctx.go(go('iou-create', { step: Number(route.step || 0) + 1 })); return; }
      if (a === 'life-record-save') {
        if (!ctx.draft.iouCreate || !validateIOUStep(ctx, route)) return;
        const d = ctx.draft.iouCreate;
        if (!d.name.trim() || !Number.isSafeInteger(d.amount) || d.amount <= 0) { formError(root, 'Check the person and total amount before saving.'); return; }
        const r = (yield commit(ctx, d.edit ? 'updateIOU' : 'createIOU', { id: d.edit ? d.id : undefined, name: d.name.trim(), type: d.type, amount: d.amount, due: d.due, note: d.note.trim().slice(0, 240), budgetItemId: d.type === 'owedByMe' ? d.budgetItemId || '' : '', idempotencyKey: d.idempotencyKey }, root));
        if (!r) return;
        const id = r.iou?.id || r.id, edited = d.edit;
        delete ctx.draft.iouCreate; ctx.saveDraft?.(); ctx.finish(go('iou-detail', { id })); ctx.toast(edited ? 'IOU updated.' : 'A clear agreement. Kept.'); return;
      }
      if(a.startsWith('life-repayment:')){ctx.go({section:'pay',page:'status',id:a.slice(15),backTo:{...route}});return;}
      if (a.startsWith('life-iou-') && !['life-iou-options', 'life-iou-edit', 'life-iou-settle', 'life-iou-remind'].includes(a)) { ctx.go(go('iou-detail', { id: a.slice(9) })); return; }
      if (a === 'life-iou-edit' && x) { openIOUWizard(ctx, x); return; }
      if (a === 'life-iou-settle' && x) { settleIOU(ctx, x); return; }
      if (a === 'life-iou-remind' && x) {
        const text = x.type === 'owedToMe' ? 'Hi ' + x.name + ', a quick reminder about the ' + cash(remaining(x)) + ' due ' + dateLabel(x.due) + '. Let me know what works for you. Thanks!' : 'Hi ' + x.name + ', I have the ' + cash(remaining(x)) + ' I owe you recorded for ' + dateLabel(x.due) + '. I will keep you posted.';
        shareText(ctx, 'An IOU update', text); return;
      }
      if (a === 'life-iou-options' && x) {
        ctx.sheet(sheetHead('Keep this record clear.') + '<div class="stack">' + btn('Edit details', 'iou-edit', { secondary: true }) + btn('Cancel this IOU', 'iou-cancel', { secondary: true }) + '</div>' + explain('Cancelling a record does not move money or undo repayments.'), (el) => {
          el.querySelector('[data-action="iou-edit"]').onclick = () => openIOUWizard(ctx, x);
          el.querySelector('[data-action="iou-cancel"]').onclick = () => {
            infoSheet(ctx, 'Cancel this IOU?', '<p>The remaining ' + personalMoney(ctx,remaining(x)) + ' will leave your open IOUs. No money moves.</p><button class="button secondary" data-action="iou-confirm-cancel">Yes, cancel the record</button>');
            document.querySelector('[data-action="iou-confirm-cancel"]').onclick = () => {return runActionFlow(function*(){
              if ((yield commit(ctx, 'cancelIOU', { id: x.id }))) { ctx.closeSheet(); ctx.refresh(); ctx.toast('IOU cancelled.'); }
            });};
          };
        }); return;
      }
      if (a === 'life-recovery-days') {
        ctx.draft.recovery = { ...(ctx.draft.recovery || {}), days: Number(b.dataset.days), checkInDate: addDays(Number(b.dataset.days)), nextDate: addDays(Number(b.dataset.days)) };
        ctx.refresh(); return;
      }
      if (a === 'life-recovery-mode') {
        ctx.draft.recovery = { ...(ctx.draft.recovery || {}), mode: b.dataset.mode };
        ctx.refresh(); return;
      }
      if (a === 'life-recovery-next') {
        const step = Number(route.step || 0);
        const d = ctx.draft.recovery || { days: 7, mode: 'steady' };
        if (step === 0) {
          const input = root.querySelector('[name="recoveryDate"]');
          const date = input?.value || addDays(d.days);
          const days = Math.ceil((new Date(date + 'T12:00:00Z') - new Date(NOW() + 'T12:00:00Z')) / 86400000);
          if (!Number.isFinite(days) || days < 1 || days > 365) return ctx.toast('Choose a date after today, within the next year.');
          ctx.draft.recovery = { ...d, checkInDate: date, nextDate: date, days };
        } else if (step === 1) {
          captureRecoveryDraft(ctx, route);
          const invalid = recoveryReductions(ctx,d).some(x => { const item = s.budget.items.find(i=>i.id===x.id); return !Number.isSafeInteger(x.amount)||x.amount<0||x.amount>Math.max(0,item.amount-item.spent); });
          if(invalid) return formError(root,'Choose a remaining allocation between zero and its current amount.');
        }
        ctx.go(go('recovery', { step: step + 1 })); return;
      }
      if (a === 'life-recovery-save') {
        const d = recoveryDraft(ctx), reductions = recoveryReductions(ctx,d);
        const r = (yield commit(ctx, 'recoveryPlan', { checkInDate: d.checkInDate || d.nextDate || addDays(d.days), days: d.days, reduceCategories: reductions, pauseSavings: true, message: reductions.length ? 'Your chosen costs eased. Other commitments protected.' : 'Current plan protected.' }));
        if (!r) return;
        delete ctx.draft.recovery; ctx.saveDraft?.(); ctx.go(go('recovery')); ctx.toast('Your recovery plan is in place. One day at a time.'); return;
      }
      if (a === 'life-printing-demo') { const result = (yield (ctx.actAsync||ctx.act).call(ctx,'ensureProjectPrintingDemo', {})); if (result?.ok) ctx.go(go('group-detail', { id: result.group?.id || result.id || 'group-project-printing' })); else ctx.toast(result?.message || 'This sample is unavailable.'); return; }
      if (a === 'life-new-group' || a === 'life-resume-group') { newGroup(ctx); return; }
      if (a === 'life-restart-group') { restartGroup(ctx); return; }
      if (a === 'life-create-exit') { captureGroupDraft(ctx, route); ctx.saveDraft?.(); ctx.go(go('groups'), { replace: true }); return; }
      if (a === 'life-create-previous') { captureGroupDraft(ctx, route); ctx.saveDraft?.(); if (route.edit) groupStep(ctx, 4, {}, true); else if (Number(route.step) > 0) groupStep(ctx, Number(route.step) - 1, {}, true); else ctx.go(go('groups'), { replace: true }); return; }
      if (a === 'life-create-next') { if (!validateGroupStep(ctx, route)) return; if (route.edit) delete ctx.draft.groupCreate.reviewSnapshot; groupStep(ctx, route.edit ? 4 : Number(route.step || 0) + 1, {}, Boolean(route.edit)); return; }
      if (a.startsWith('life-create-edit-')) { const d = groupDraft(ctx); d.reviewSnapshot = { name: d.name, purpose: d.purpose, deadline: d.deadline, emoji: d.emoji, target: d.target, targetText: d.targetText, members: d.members.map(m => ({ ...m })), count: d.count, threshold: d.threshold }; groupStep(ctx, Number(a.slice('life-create-edit-'.length)), { edit: true }); return; }
      if (a === 'life-create-add-member') { editGroupDraftMember(ctx); return; }
      if (a.startsWith('life-create-member-')) { editGroupDraftMember(ctx, Number(a.slice('life-create-member-'.length))); return; }
      if (a === 'life-create-save') {
        const d = ctx.draft.groupCreate;
        if (!d) return;
        if (!d.name.trim() || !Number.isSafeInteger(d.target) || d.target <= 0 || !d.members.length || d.threshold > groupApproverCount(d)) { ctx.toast('Review the group name, target and agreement first.'); return; }
        const members = [{ id: 'me', name: ctx.state.profile.name || 'You', role: 'approver' }, ...d.members.map(m => ({ ...m }))];
        const r = (yield commit(ctx, 'createGroup', { name: d.name.trim(), purpose: d.purpose?.trim() || d.name.trim(), deadline: d.deadline || '', emoji: d.emoji, target: d.target, members, mandate: { approvers: members.filter(m => m.role === 'approver').map(m => m.id), threshold: d.threshold }, idempotencyKey: d.idempotencyKey }, root));
        if (!r) return;
        const id = r.group?.id || r.id || ctx.state.groups.at(-1)?.id, name = d.name;
        delete ctx.draft.groupCreate; ctx.saveDraft?.();
        ctx.celebrate({ title: 'Together starts here.', body: name + ' is ready. Your people can review their invitations before joining.', button: 'See the group', onDone: () => ctx.finish(go('group-detail', { id })) }); return;
      }
      if (a.startsWith('life-group-')) { ctx.go(go('group-detail', { id: a.slice(11) })); return; }
      if (a === 'life-profile-edit') { editProfile(ctx); return; }
      if (a === 'life-keepback') {
        ctx.sheet(sheetHead('What would you like to leave untouched?') + '<form class="form-stack">' + amountInput('keepback', ((s.buffer || 0) / 100).toFixed(2), 'Keep-back amount', '0') + errorBox + '<button class="button" type="submit">Keep that aside</button></form>', (el) => {
          el.querySelector('form').onsubmit = (e) => {return runActionFlow(function*(){
            e.preventDefault(); const amount = readAmount(el.querySelector('[name="keepback"]'));
            if (!Number.isSafeInteger(amount) || amount < 0 || amount > s.wallet) return formError(el, 'Choose an amount within your available balance.');
            if ((yield commit(ctx, 'settings', { buffer: amount }, el))) { ctx.closeSheet(); ctx.refresh(); ctx.toast('Your keep-back is updated.'); }
          });};
        }); return;
      }
      if (a === 'life-reset' || a === 'life-demo') {
        const demo = a === 'life-demo';
        ctx.sheet(sheetHead(demo ? 'Reload the demo?' : 'Start with a clean slate?', 'This replaces the demo data saved in this browser.') + btn(demo ? 'Reload demo account' : 'Start fresh', 'life-confirm-reset') + btn('Keep exploring', 'life-cancel-reset', { secondary: true }), (el) => {
          el.querySelector('[data-action="life-cancel-reset"]').onclick = () => ctx.closeSheet();
          el.querySelector('[data-action="life-confirm-reset"]').onclick = () => {
            ctx.closeSheet();
            if (ctx.reset) ctx.reset({ demo });
            else ctx.toast('Use the welcome screen to restart the demo.');
          };
        }); return;
      }
      if (a === 'life-privacy') {
        if(ctx.connected){ctx.go(go('account-privacy'));return;}
        infoSheet(ctx, 'Your privacy in this prototype', '<p>Demo account activity and preferences are stored in this browser. You can clear them using Start fresh.</p><p>Signup asks for your Ghana Card number and takes three guided selfies in one camera session. The number and photos stay only in memory, are never uploaded or saved, and are removed when you finish, exit or reload signup. The microphone stays off.</p><p>After the selfies, a demo verification animation returns sample Ghana Card details for you to confirm before PIN setup. The confirmed sample legal name becomes the holder name on both demo accounts. No live bank, NIA or biometric service is connected. Use the demo Ghana Card number GHA-000000000-0 and a demo PIN only.</p><p>Feedback stays on this device. Sharing opens your device’s own sharing controls.</p>'); return;
      }
      if (a === 'life-help-question') { feedback(ctx, 'question'); return; }
      if (a === 'life-help-idea') { feedback(ctx, 'idea'); return; }
      if (a === 'life-help-bug') { feedback(ctx, 'bug'); return; }
      if (a === 'life-help-balance') { infoSheet(ctx, 'Three views of your money', '<p><strong>Available</strong> is the money in your everyday account.</p><p><strong>Planned</strong> is what you have reserved for commitments.</p><p><strong>Left after plan</strong> subtracts your plan and keep-back from available money. Money Boxes are held separately.</p>'); return; }
      if (a === 'life-help-expected') { infoSheet(ctx, 'Expected is not available.', '<p>Allowance and money someone owes you remain expected until they actually arrive.</p><p>Match an existing confirmed Lumo receipt, or record a repayment that arrived in cash, MoMo or another bank. Recording an IOU repayment never credits Lumo a second time. A due date alone never adds money.</p>'); return; }
      if (a === 'life-help-pause') { infoSheet(ctx, 'A moment of clarity.', '<p>Lumo may pause when a payment could use money your plan is relying on.</p><p>You can see the effect, change the amount or continue after reviewing it. There is no judgement.</p>'); }
    });});
  });
}
