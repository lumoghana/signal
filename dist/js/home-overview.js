import { esc, cash, icon } from './ui.js';
import { getSummary } from './model.js';
import { bindHomeMovesGesture } from './home-gestures.js';

export const homeAccount = ctx => ctx.draft?.homeAccount === 'savings' ? 'savings' : 'everyday';
const moneySlot = (value, hidden) => `<span class="home-money"><span class="home-money-spacer" aria-hidden="true">${cash(value)}</span><span class="home-money-value">${hidden ? '••••.••' : cash(value)}</span></span>`;
const externalReceipt = tx => ['iou-manual-receipt', 'iou-manual-repayment', 'split-manual-receipt'].includes(tx.type);
const savingsMove = tx => tx.boxTransfer || tx.boxId || (['saving', 'withdrawal'].includes(tx.type) && tx.rail === 'internal');

/** Outside receipts never become account credits. */
export function homeTransactions(state, account = 'everyday') {
  return (state.transactions || []).filter(tx => !externalReceipt(tx) && (account === 'savings' ? savingsMove(tx) : tx.type !== 'card-purchase' && (tx.type !== 'card-refund' || tx.refundDestination === 'Everyday'))).slice(0, 12);
}

function transaction(tx, account) {
  const saving = account === 'savings' && savingsMove(tx), incoming = saving ? tx.direction === 'out' : tx.direction === 'in';
  const status = tx.status && !['success', 'complete'].includes(tx.status) ? tx.status === 'pending' ? 'Awaiting confirmation' : tx.status === 'reversed' ? 'Reversed' : 'Not completed' : '';
  const description = status || tx.note || new Date(tx.at).toLocaleDateString('en-GH', { day: 'numeric', month: 'short', timeZone: 'Africa/Accra' });
  return `<button type="button" class="home-move" data-action="root-tx:${esc(tx.id)}"><span class="home-move-icon" aria-hidden="true">${esc(tx.emoji || (incoming ? '↙' : '↗'))}</span><span class="home-move-copy"><strong>${esc(tx.merchant || 'Money moved')}</strong><small>${esc(description)}</small></span><span class="home-move-amount ${incoming ? 'is-incoming' : ''}">${incoming ? '+' : '−'}${cash(tx.amount)}</span>${icon('chevron', 15)}</button>`;
}

export function homeNotice(state) {
  const today = new Date().toISOString().slice(0, 10);
  if (!state.wallet) return { action: 'fund', text: 'Add money when you’re ready.' };
  if (!state.budget?.created) return { action: 'budget', text: 'Give your money a purpose.' };
  if (state.income?.amount > 0 && state.income.nextDate && state.income.nextDate < today && !state.recovery?.active) return { action: 'story', text: 'Allowance running late? Let’s make room.' };
  if (state.budget.endDate && state.budget.endDate < today) return { action: 'budget', text: 'Time to refresh your plan.' };
  return null;
}

/** Account views contain held funds, never expected or group money. */
export function renderHome(ctx) {
  const state = ctx.state, account = homeAccount(ctx), savings = account === 'savings', summary = getSummary(state), hidden = state.settings.hideBalance;
  const amount = savings ? summary.savings : summary.spendable;
  const label = savings ? 'Total saved' : state.budget?.created ? 'Left after plan' : 'Available to plan';
  const text = cash(amount), numberSize = text.length > 16 ? 27 : text.length > 13 ? 32 : 43;
  const moves = homeTransactions(state, account), open = !!ctx.draft?.homeMovesOpen, notice = savings ? null : homeNotice(state);
  const boxes = state.boxes.filter(box => !box.archived);
  return `<section class="home-overview" data-home-account="${account}" data-moves-open="${open}" aria-label="${savings ? 'Your Savings account' : 'Your Everyday account'}">
    <div class="home-hero">
      <div class="home-account-tools"><button type="button" class="home-account-selector" data-action="home-accounts" aria-label="Switch account. ${savings ? 'Savings' : 'Everyday'} selected" aria-haspopup="dialog">${savings ? 'Savings' : 'Everyday'}<span class="home-account-chevron">${icon('chevron', 14)}</span></button><button type="button" class="home-balance-toggle" data-action="visibility" aria-label="${hidden?'Show':'Hide'} balance" aria-pressed="${!hidden}" title="${hidden?'Show':'Hide'} balances">${icon(hidden?'eyeOff':'eye',22)}</button></div>
      <div class="home-amount-line"><div class="home-hero-amount" style="--home-number-size:${numberSize}px" aria-label="${hidden ? 'Balance hidden' : esc(`${label} ${text}`)}">${moneySlot(amount, hidden)}</div><button type="button" class="home-add" data-action="${savings ? 'home-save' : 'fund'}" aria-label="${savings ? 'Add money to a Money Box' : 'Add money to Everyday'}">${icon('plus', 22)}</button></div>
      <p class="home-balance-label">${label}</p>
      ${notice ? `<button type="button" class="home-context-link" data-action="${notice.action}">${esc(notice.text)} ${icon('chevron', 13)}</button>` : ''}
    </div>
    <div class="home-account-summary"><div><small>${savings ? 'Money Boxes' : 'Available balance'}</small><strong>${savings ? `${boxes.length} ${boxes.length === 1 ? 'goal' : 'goals'}` : moneySlot(summary.available, hidden)}</strong></div><button type="button" data-action="${savings ? 'home-boxes' : 'budget'}">${savings ? 'View boxes' : state.budget.created ? 'View budget' : 'Create a budget'}${icon('chevron', 17)}</button></div>
    <button type="button" class="home-moves-scrim" data-home-moves-close aria-label="Close latest moves" ${open ? '' : 'hidden'}></button>
    <section class="home-moves" data-home-drawer data-no-chat-swipe aria-label="Latest moves">
      <button type="button" class="home-moves-toggle" data-home-moves-toggle aria-expanded="${open}" aria-controls="home-moves-content"><span class="home-drag-handle" aria-hidden="true"></span><span>${open ? 'Latest moves' : 'Swipe up for latest moves'}</span></button>
      <div class="home-moves-content" data-home-moves id="home-moves-content" ${open ? '' : 'inert aria-hidden="true"'}><div class="home-moves-heading"><span>${savings ? 'Your savings moves' : 'Your Everyday account'}</span><button type="button" data-action="all-activity">See all ${icon('arrow', 15)}</button></div>${moves.length ? moves.map(tx => transaction(tx, account)).join('') : `<div class="home-moves-empty"><h2>${savings ? 'A little saved. A lot ahead.' : 'Your first move starts here.'}</h2><p>${savings ? 'Add money to a Money Box and watch your progress grow.' : 'Your confirmed and pending Lumo moves will appear here.'}</p><button type="button" data-action="${savings ? 'home-save' : 'fund'}">${savings ? 'Choose a Money Box' : 'Add your first money'} ${icon('arrow', 16)}</button></div>`}</div>
    </section>
  </section>`;
}

export function renderHomeAccounts(ctx) {
  const current = homeAccount(ctx), summary = getSummary(ctx.state), hidden = ctx.state.settings.hideBalance;
  return `<div class="home-account-picker"><h2>Your Lumo accounts</h2><p>Everyday for now. Savings for what’s next.</p>${[['everyday', 'Everyday', 'Available balance', summary.available, 'bank'], ['savings', 'Savings', 'In your Money Boxes', summary.savings, 'box']].map(([id, name, sub, amount, glyph]) => `<button type="button" class="home-account-option" data-home-select="${id}" aria-pressed="${current === id}"><span class="home-account-symbol">${icon(glyph, 23)}</span><span><strong>${name}</strong><small>${sub}</small></span><b>${hidden ? '••••.••' : cash(amount)}</b>${current === id ? icon('check', 18) : icon('chevron', 16)}</button>`).join('')}<p class="home-account-note">Group collections and money outside Lumo stay separate.</p></div>`;
}

export function bindHome(ctx) {
  const target = ctx.$('.home-overview');
  if (!target) return () => {};
  let ignoreClickUntil = 0;
  const setOpen = (open, meta = {}) => {
    if (!!ctx.draft.homeMovesOpen === open) return;
    if (meta.gesture) ignoreClickUntil = Date.now() + 450;
    ctx.draft.homeMovesOpen = open; target.dataset.movesOpen = String(open);
    const toggle = target.querySelector('[data-home-moves-toggle]'), content = target.querySelector('#home-moves-content'), scrim = target.querySelector('[data-home-moves-close]');
    toggle.setAttribute('aria-expanded', String(open)); toggle.querySelector('span:nth-child(2)').textContent = open ? 'Latest moves' : 'Swipe up for latest moves';
    content.inert = !open; content.setAttribute('aria-hidden', String(!open)); scrim.hidden = !open;
    if (!open && content.contains(globalThis.document?.activeElement)) toggle.focus({ preventScroll: true });
    ctx.saveDraft?.();
  };
  const click = event => {
    if (event.target.closest('[data-home-moves-toggle]')) { if (Date.now() >= ignoreClickUntil) setOpen(!ctx.draft.homeMovesOpen); }
    else if (event.target.closest('[data-home-moves-close]')) setOpen(false);
  };
  const keys = event => { if (event.key === 'Escape' && ctx.draft.homeMovesOpen) { event.preventDefault(); setOpen(false); } };
  target.addEventListener('click', click); target.addEventListener('keydown', keys);
  const stopGesture = bindHomeMovesGesture({ target, isOpen: () => !!ctx.draft.homeMovesOpen, onChange: setOpen });
  return () => { stopGesture(); target.removeEventListener('click', click); target.removeEventListener('keydown', keys); };
}
