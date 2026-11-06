import { RECIPIENT_BANKS, DEMO_MOMO_ACCOUNTS, validateRecipientLookup, createRecipientLookup } from './recipient-lookup.js';
import {renderCardsParity,handleCardParityClick,selectedCard} from './card-parity-ui.js';
import { esc, cash, icon, pageHead, field, dateLabel } from './ui.js';

const railLabel = rail => ({ lumo: 'Lumo', momo: 'Mobile money', bank: 'Bank account' })[rail] || 'Payment';
const hub = { section: 'pay', page: 'home', hubTab: 'send' };
const button = (label, action, secondary = false) => `<button type="button" class="button${secondary ? ' secondary' : ''}" data-extra-action="${action}">${label}</button>`;
const contacts = ctx => Array.isArray(ctx.paymentContacts) ? ctx.paymentContacts : [];
const favourites = ctx => Array.isArray(ctx.state.paymentFavorites) ? ctx.state.paymentFavorites : [];
const recentPayments = ctx => (ctx.state.transactions || []).filter(tx => tx.type === 'payment').slice(0, 30);
const money = (ctx, amount) => ctx.state.settings.hideBalance ? '••••.••' : cash(amount);
const nonce = () => globalThis.crypto?.randomUUID?.() || `card-${Date.now()}-${Math.random().toString(36).slice(2)}`;

function repeatRecipient(ctx, tx) {
  if (!['lumo', 'momo', 'bank'].includes(tx.rail)) return null;
  if (tx.recipient && typeof tx.recipient === 'object' && tx.recipient.name && (tx.rail === 'lumo' || tx.recipient.number)) return tx.recipient;
  return tx.rail === 'lumo' ? contacts(ctx).find(contact => contact.name === tx.merchant) || null : null;
}

function peoplePage(ctx, route) {
  const saved = route.list === 'favourites';
  const items = saved ? favourites(ctx) : recentPayments(ctx);
  const rows = saved ? items.map(item => `<div class="payment-extra-person"><button type="button" class="payment-extra-person-pay" data-extra-favourite="${esc(item.id)}"><span class="payment-extra-avatar">${esc(item.recipient.name.slice(0, 1).toUpperCase())}</span><span><strong>${esc(item.recipient.name)}</strong><small>${esc(railLabel(item.rail))}${item.recipient.number ? ` · ${esc(item.recipient.number)}` : ''}</small></span>${icon('chevron', 17)}</button><button type="button" class="icon-button" data-extra-manage="${esc(item.id)}" aria-label="Manage ${esc(item.recipient.name)}">${icon('more', 20)}</button></div>`).join('') : items.map(tx => `<div class="payment-extra-recent"><button type="button" class="payment-extra-transaction" data-extra-transaction="${esc(tx.id)}"><span class="payment-extra-avatar">${icon(tx.serviceId ? 'plan' : 'send', 19)}</span><span><strong>${esc(tx.merchant || 'Payment')}</strong><small>${esc(dateLabel(tx.at))} · ${esc(tx.status || 'success')}</small></span><b>${money(ctx, tx.amount)}</b>${icon('chevron', 16)}</button>${repeatRecipient(ctx, tx) ? `<button type="button" class="payment-extra-repeat" data-extra-repeat="${esc(tx.id)}">Pay again</button>` : ''}</div>`).join('');
  return `<section class="page payment-extras-page" aria-label="${saved ? 'Favourite recipients' : 'Recent payments'}">${pageHead(saved ? 'Favourites' : 'Recent payments')}<div class="payment-extra-intro"><h1>${saved ? 'Your regulars.' : 'Your latest moves.'}</h1><p>${saved ? 'Keep the people you pay close by.' : 'Your payments, with the details that matter.'}</p></div>${items.length ? `<div class="payment-extra-list">${rows}</div>` : `<div class="payment-extra-empty">${icon(saved ? 'heart' : 'clock', 35)}<h2>${saved ? 'Someone you pay often?' : 'A fresh start.'}</h2><p>${saved ? 'Add a favourite so they are easy to find next time.' : 'Your payments will appear here after you make them.'}</p></div>`}<div class="payment-extra-bottom">${saved ? button(`${icon('plus', 18)} Add a favourite`, 'add-favourite') : button('Make a payment', 'new-payment')}</div></section>`;
}

function cardsPage(ctx) { return renderCardsParity(ctx); }

export function renderPaymentExtras(ctx, route) {
  return route.page === 'cards' ? cardsPage(ctx) : peoplePage(ctx, route);
}

function showError(ctx, result, element) {
  if (result.ok) return false;
  if (element) element.textContent = result.message || 'Check those details and try again.';
  else ctx.toast(result.message || 'Try that again.');
  return true;
}

export function addFavourite(ctx, { createLookup = createRecipientLookup } = {}) {
  const known = contacts(ctx), lookup = createLookup();
  let alive = true, busy = false, found = null;
  ctx.sheet(`<h2>Add a favourite.</h2><p>Find your person. Keep them close for next time.</p>${known.length ? `<div class="payment-extra-contact-picks" aria-label="Your people">${known.map((person, index) => `<button type="button" data-favourite-contact="${index}"><span>${esc(person.name.slice(0, 1))}</span>${esc(person.short || person.name.split(' ')[0])}</button>`).join('')}</div>` : ''}
    <form class="form-stack payment-favourite-form" novalidate><label class="field"><span>Payment method</span><select class="input" name="favouriteRail"><option value="lumo">Lumo</option><option value="momo">Mobile money</option><option value="bank">Bank account</option></select></label>
    <div data-favourite-name>${field({ label: 'Lumo name', name: 'favouriteName', placeholder: '@kofi', required: true })}</div>
    <div data-favourite-destination hidden>${field({ label: 'Phone or account number', name: 'favouriteNumber', type: 'tel', placeholder: 'Enter their details' })}</div>
    <label class="field" data-favourite-bank hidden><span>Their bank</span><select class="input" name="favouriteBank"><option value="">Choose their bank</option>${RECIPIENT_BANKS.map(bank => `<option value="${esc(bank.label)}">${esc(bank.label)}</option>`).join('')}</select></label>
    <button type="button" class="text-button" data-favourite-demo hidden>Try a demo account</button><div class="favourite-lookup-result" data-favourite-result hidden></div><p class="muted small" data-favourite-feedback aria-live="polite"></p><p class="error" role="alert"></p><button class="button" type="submit">Save favourite</button></form>`, el => {
    const form = el.querySelector('form'), error = form.querySelector('.error'), result = form.querySelector('[data-favourite-result]'), feedback = form.querySelector('[data-favourite-feedback]'), submit = form.querySelector('[type="submit"]');
    const value = name => form.querySelector(`[name="${name}"]`).value.trim();
    const valid = () => alive && el.isConnected !== false;
    const request = () => validateRecipientLookup(value('favouriteRail'), { number: value('favouriteNumber'), bank: value('favouriteBank') });
    const invalidate = () => { lookup.cancel(); busy = false; found = null; result.hidden = true; result.innerHTML = ''; error.textContent = ''; feedback.textContent = ''; submit.disabled = false; submit.removeAttribute('aria-busy'); submit.textContent = value('favouriteRail') === 'lumo' ? 'Save favourite' : 'Find account'; };
    const save = payload => {
      if (!valid() || busy) return;
      busy = true;
      const saved = ctx.act('savePaymentFavorite', payload);
      if (showError(ctx, saved, error)) { busy = false; return; }
      alive = false; lookup.dispose(); ctx.closeSheet(); ctx.setCapture?.(null); ctx.refresh(); ctx.toast(saved.duplicate ? 'This person is already a favourite.' : 'Favourite saved.');
    };
    el.querySelectorAll('[data-favourite-contact]').forEach(button => button.addEventListener('click', () => { const person = known[Number(button.dataset.favouriteContact)]; if (person) { invalidate(); save({ rail: 'lumo', recipient: { ...person } }); } }));
    form.querySelector('[name="favouriteRail"]').addEventListener('change', () => {
      const rail = value('favouriteRail'); invalidate();
      form.querySelector('[data-favourite-name]').hidden = rail !== 'lumo';
      form.querySelector('[data-favourite-destination]').hidden = rail === 'lumo';
      form.querySelector('[data-favourite-bank]').hidden = rail !== 'bank';
      form.querySelector('[data-favourite-demo]').hidden = rail === 'lumo';
      feedback.textContent = rail === 'momo' ? 'Just their number. The demo lookup finds the name and network.' : rail === 'bank' ? 'Their account number and bank. The demo lookup finds the name.' : '';
    });
    for (const name of ['favouriteNumber', 'favouriteBank']) { form.querySelector(`[name="${name}"]`).addEventListener('input', invalidate); form.querySelector(`[name="${name}"]`).addEventListener('change', invalidate); }
    form.querySelector('[data-favourite-demo]').addEventListener('click', () => {
      if (value('favouriteRail') === 'momo') form.querySelector('[name="favouriteNumber"]').value = DEMO_MOMO_ACCOUNTS[0].number;
      else { const bank = RECIPIENT_BANKS.find(bank => bank.label === value('favouriteBank')) || RECIPIENT_BANKS[0]; form.querySelector('[name="favouriteNumber"]').value = bank.example; form.querySelector('[name="favouriteBank"]').value = bank.label; }
      invalidate();
    });
    form.addEventListener('submit', async event => {
      event.preventDefault(); if (!valid() || busy) return;
      const rail = value('favouriteRail');
      if (rail === 'lumo') return save({ rail, recipient: { name: value('favouriteName').replace(/^@/, '') } });
      const checked = request();
      if (!checked.ok) { error.textContent = checked.message; return; }
      if (found?.key === checked.key) return save({ rail, recipient: { ...found.recipient } });
      error.textContent = ''; busy = true; submit.disabled = true; submit.setAttribute('aria-busy', 'true'); submit.textContent = 'Finding account…'; feedback.textContent = 'One sec. Finding your person…';
      let response; try { response = await lookup.run(checked.request); } catch { response = { ok: false, message: 'The demo lookup took a little too long. Try again.' }; }
      if (!valid() || !response) return;
      const latest = request(); if (!latest.ok || latest.key !== checked.key) return;
      busy = false; submit.disabled = false; submit.removeAttribute('aria-busy'); feedback.textContent = 'Demo lookup · no live account data';
      if (!response.ok) { submit.textContent = 'Find account'; error.textContent = response.message; return; }
      found = { key: checked.key, recipient: { ...response.recipient } };
      result.hidden = false; result.innerHTML = `<span class="eyebrow">IS THIS YOUR PERSON?</span><strong>${esc(found.recipient.name)}</strong><p>${esc(found.recipient.number)} · ${esc(rail === 'momo' ? found.recipient.network : found.recipient.bank)}</p>`;
      submit.textContent = 'Yes, save favourite';
    });
  }, { onClose: () => { alive = false; lookup.dispose(); } });
}

function manageFavourite(ctx, item) {
  ctx.sheet(`<h2>${esc(item.recipient.name)}</h2><p>${esc(railLabel(item.rail))}${item.recipient.number ? ` · ${esc(item.recipient.number)}` : ''}</p><div class="stack">${button('Pay this person', 'pay-favourite')}${button('Remove favourite', 'remove-favourite', true)}</div>`, el => {
    el.querySelector('[data-extra-action="pay-favourite"]').onclick = () => { ctx.closeSheet(); ctx.startPayment({ ...item.recipient }, item.rail); };
    el.querySelector('[data-extra-action="remove-favourite"]').onclick = () => {
      const result = ctx.act('removePaymentFavorite', { id: item.id });
      if (showError(ctx, result)) return;
      ctx.closeSheet(); ctx.setCapture?.(null); ctx.refresh(); ctx.toast('Favourite removed.');
    };
  });
}

export function bindPaymentExtras(ctx, route) {
  const root = ctx.$('.payment-extras-page');
  if (!root) return () => {};
  let alive = true, authenticating = false;
  const valid = () => alive && root.isConnected;
  const authorize = (title, action, payload) => {
    if (authenticating) return;
    authenticating = true;
    ctx.auth({ title, onCancel: () => { authenticating = false; }, onSuccess: () => {
      authenticating = false;
      if (!valid()) return;
      const result = ctx.act(action, payload);
      if (showError(ctx, result)) return;
      if (action === 'createDemoVirtualCard') { ctx.draft.selectedCardId = result.id; delete ctx.draft.virtualCardCreateKey; }
      ctx.setCapture?.(null); ctx.refresh();
    } });
  };
  const click = event => {
    const button = event.target.closest('button');
    if (!valid() || !button || button.disabled) return;
    if (route.page === 'cards' && handleCardParityClick(ctx, button)) return;
    if (button.dataset.extraFavourite) { const item = favourites(ctx).find(item => item.id === button.dataset.extraFavourite); if (item) ctx.startPayment({ ...item.recipient }, item.rail); return; }
    if (button.dataset.extraManage) { const item = favourites(ctx).find(item => item.id === button.dataset.extraManage); if (item) manageFavourite(ctx, item); return; }
    if (button.dataset.extraTransaction) return ctx.go({ section: 'pay', page: 'transaction', id: button.dataset.extraTransaction, backTo: { ...route }, returnTo: { ...route } });
    if (button.dataset.extraRepeat) { const tx = recentPayments(ctx).find(tx => tx.id === button.dataset.extraRepeat), recipient = tx && repeatRecipient(ctx, tx); if (recipient) ctx.startPayment({ ...recipient }, tx.rail); return; }
    const action = button.dataset.extraAction;
    if (action === 'add-favourite') return addFavourite(ctx);
    if (action === 'new-payment') return ctx.go({ ...hub });
    if (action === 'create-card') {
      ctx.draft.virtualCardCreateKey ||= nonce(); ctx.saveDraft?.();
      return authorize('Create your demo virtual card?', 'createDemoVirtualCard', { idempotencyKey: ctx.draft.virtualCardCreateKey, additional: !!ctx.state.virtualCard });
    }
    if (action === 'toggle-card' && selectedCard(ctx)) {
      const card = selectedCard(ctx), frozen = card.status !== 'frozen';
      return authorize(frozen ? 'Freeze your demo card?' : 'Unfreeze your demo card?', 'setDemoVirtualCardFrozen', { frozen, cardId: card.id });
    }
    if (action === 'card-details' && selectedCard(ctx)) {
      const card = selectedCard(ctx);
      ctx.sheet(`<h2>Your demo card.</h2><dl class="payment-card-details"><div><dt>Card</dt><dd>DEMO •••• ${esc(card.last4)}</dd></div><div><dt>Status</dt><dd>${card.status === 'frozen' ? 'Frozen' : 'Active demo'}</dd></div><div><dt>Created</dt><dd>${esc(dateLabel(card.createdAt))}</dd></div></dl><p>This is a visual prototype. It has no live card number, expiry or security code and cannot be used for online purchases.</p>`);
    }
  };
  root.addEventListener('click', click);
  return () => { alive = false; root.removeEventListener('click', click); };
}
