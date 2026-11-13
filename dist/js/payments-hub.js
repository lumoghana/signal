import { cash, esc, icon } from './ui.js';
import { PAYMENT_SERVICES } from './payment-catalog.js';

const tabs = [{ id: 'send', label: 'Send money' }, { id: 'campus', label: 'Campus Pay' }, { id: 'bills', label: 'Top-ups & bills' }];
const titles = { send: 'Payments', campus: 'Campus Pay', bills: 'Top-ups & bills' };
export const paymentHubTab = value => tabs.some(tab => tab.id === value) ? value : 'send';
const hubRoute = tab => ({ section: 'pay', page: 'home', hubTab: paymentHubTab(tab) });
const pendingPayment = ctx => {
  const d = ctx.draft.payment;
  return !!d && !d.completed && !!(d.recipient || d.amount || d.recipientForms && Object.values(d.recipientForms).some(form => form.name || form.number));
};
const savedProviderUnavailable = ctx => ctx.connected === true && (['momo', 'bank'].includes(ctx.draft.payment?.rail)
  || PAYMENT_SERVICES.some(service => service.id === ctx.draft.payment?.serviceId && service.type !== 'campus'));
export const normalizeMerchantSearch = value => String(value || '').slice(0, 80).toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/ɔ/g, 'o').replace(/ɛ/g, 'e').replace(/[^a-z0-9]+/g, ' ').trim();
export function merchantMatches(service, query) {
  const words = normalizeMerchantSearch(query).split(' ').filter(Boolean);
  const haystack = normalizeMerchantSearch(`${service.name} ${service.id} ${service.description || ''} ${service.category || ''}`);
  return words.every(word => haystack.includes(word));
}
const hubRow = ({ action, title, subtitle = '', symbol = 'arrow', emoji = '', id = '', className = '', merchant = null, query = '', unavailable = false }) => `<button type="button" class="payments-hub-row ${className}" data-hub-action="${esc(action)}"${id ? ` data-service-id="${esc(id)}"` : ''}${unavailable ? ' aria-disabled="true"' : ''}${merchant ? ` data-campus-merchant="${esc(id)}"${merchantMatches(merchant, query) ? '' : ' hidden'}` : ''}><span class="payments-hub-icon" aria-hidden="true">${emoji ? esc(emoji) : icon(symbol, 22)}</span><span class="payments-hub-row-copy"><strong>${esc(title)}</strong>${subtitle ? `<small>${esc(subtitle)}</small>` : ''}</span>${icon('chevron', 17)}</button>`;
const serviceRow = (service, options = {}) => hubRow({ action: 'service', title: service.name, subtitle: service.description || '', symbol: service.icon || 'spark', id: service.id, ...options });

function sendMoney(ctx) {
  const availability = ctx.connected === true ? { unavailable: true, subtitle: 'Not connected in this test' } : {};
  const tools = [{ action: 'cards', title: 'Virtual cards', symbol: 'card' }, { action: 'requests', title: 'Requests', symbol: 'download' }, { action: 'ious', title: 'IOUs', symbol: 'repeat' }, { action: 'activity', title: 'Activity', symbol: 'plan' }];
  return `<div class="payments-hub-rails" role="group" aria-label="Send money to">${hubRow({ action: 'lumo', title: 'Lumo user', symbol: 'users' })}${hubRow({ action: 'momo', title: 'Mobile money', symbol: 'phone', ...availability })}${hubRow({ action: 'bank', title: 'Bank account', symbol: 'bank', ...availability })}</div><div class="payments-hub-shortcuts" role="group" aria-label="Your recipients"><button type="button" data-hub-action="recent">${icon('clock', 18)} Recent</button><button type="button" data-hub-action="favourites">${icon('heart', 18)} Favourites</button></div><div class="payments-hub-tools" role="group" aria-label="More payment tools">${tools.map(tool => `<button type="button" data-hub-action="${tool.action}">${icon(tool.symbol, 19)}<span>${tool.title}</span>${icon('chevron', 14)}</button>`).join('')}</div>`;
}
function campusPay(ctx) {
  const services = PAYMENT_SERVICES.filter(service => service.type === 'campus');
  const query = String(ctx.draft.campusMerchantQuery || '').slice(0, 80), count = services.filter(service => merchantMatches(service, query)).length;
  return `<div class="campus-quick-pay" aria-label="Quick campus payment"><button type="button" class="campus-scan-now" data-hub-action="scan">${icon('scan', 27)}<span><strong>Scan QR</strong><small>Point. Check. Pay.</small></span>${icon('arrow', 19)}</button><button type="button" class="campus-enter-code" data-hub-action="merchant-code">${icon('plan', 22)}<span>Enter merchant<br>code</span>${icon('chevron', 15)}</button></div><label class="campus-merchant-search" for="campus-merchant-search">${icon('search', 19)}<input id="campus-merchant-search" type="search" placeholder="Find your campus spot" aria-label="Search campus merchants" autocomplete="off" maxlength="80" value="${esc(query)}"><button type="button" data-hub-action="clear-search" aria-label="Clear merchant search"${query ? '' : ' hidden'}>${icon('close', 17)}</button></label><div class="payments-hub-section-title"><h2>Your campus spots</h2><small data-campus-result-count role="status" aria-live="polite">${count} ${count === 1 ? 'spot' : 'spots'} · demo</small></div><div class="payments-hub-services campus-merchant-results">${services.map(service => serviceRow(service, { merchant: service, query })).join('')}</div><div class="campus-search-empty"${count ? ' hidden' : ''}><strong>No spot by that name.</strong><p>Try another name, or use a merchant code above.</p></div>`;
}
function billsAndTopups(ctx) {
  const bills = PAYMENT_SERVICES.filter(service => service.type === 'bill'), topups = PAYMENT_SERVICES.filter(service => service.type === 'topup'), campusBills = PAYMENT_SERVICES.filter(service => service.type === 'campus-bill');
  const connected = ctx.connected === true, availability = connected ? { unavailable: true, subtitle: 'Not connected in this test' } : {};
  return `<div class="payments-hub-section-title payments-topup-heading"><h2>Top-ups</h2></div><div class="payments-topup-grid">${topups.map(service => `<button type="button" data-hub-action="service" data-service-id="${service.id}"${connected ? ' aria-disabled="true"' : ''}><span class="payments-topup-symbol" aria-hidden="true">${icon(service.icon,24)}</span><span><strong>${esc(service.name)}</strong><small>${connected ? 'Not connected in this test' : service.id === 'airtime' ? 'A quick hello.' : 'Data for your day.'}</small></span>${icon('chevron', 15)}</button>`).join('')}</div><div class="payments-hub-section-title payments-campus-bills-heading"><h2>Campus bills</h2></div><div class="payments-hub-services campus-bills-services">${campusBills.map(service => serviceRow(service, availability)).join('')}</div><details class="payments-everyday-bills"${ctx.draft.paymentUtilitiesOpen === true ? ' open' : ''}><summary><span class="payments-utility-symbol">${icon('home', 21)}</span><span><strong>Everyday bills</strong><small>${connected ? 'Not connected in this test' : 'Electricity, water & TV'}</small></span>${icon('chevron', 17)}</summary><div class="payments-hub-services">${bills.map(service => serviceRow(service, availability)).join('')}</div></details>`;
}
export function renderPaymentsHub(ctx, route = {}) {
  const tab = paymentHubTab(route.hubTab);
  const hasSaved = pendingPayment(ctx) && (tab === 'send' || ctx.draft.payment.hubTab === tab);
  const unavailableSaved = savedProviderUnavailable(ctx);
  return `<section class="payments-hub payments-hub--${tab}${hasSaved ? ' has-saved-payment' : ''}" aria-label="Payments"><header class="payments-hub-heading"><h1>${titles[tab]}</h1></header><div class="payments-hub-balance"><span>Available balance</span><strong>${ctx.state.settings.hideBalance ? '••••.••' : cash(ctx.state.wallet)}</strong></div>${hasSaved ? `<button type="button" class="payments-hub-resume" data-hub-action="resume"${unavailableSaved ? ' aria-disabled="true"' : ''}><span>${unavailableSaved ? 'Saved payment · Provider not connected' : 'Continue saved payment'}</span>` + icon('chevron', 16) + '</button>' : ''}<nav class="payments-hub-tabs" aria-label="Payment options">${tabs.map(item => `<button type="button" data-hub-tab="${item.id}" ${tab === item.id ? 'aria-current="page"' : ''}>${item.label}</button>`).join('')}</nav><div class="payments-hub-body">${tab === 'campus' ? campusPay(ctx) : tab === 'bills' ? billsAndTopups(ctx) : sendMoney(ctx)}</div></section>`;
}
export function bindPaymentsHub(ctx, route = {}) {
  const root = ctx.$('.payments-hub');
  if (!root) return () => {};
  let alive = true, merchantCodeCleanup = null;
  const tab = paymentHubTab(route.hubTab), origin = hubRoute(tab), current = () => alive && root.isConnected !== false;
  const search = root.querySelector?.('#campus-merchant-search');
  const filter = () => {
    if (!current() || !search) return;
    const query = search.value.slice(0, 80); ctx.draft.campusMerchantQuery = query;
    let count = 0;
    root.querySelectorAll('[data-campus-merchant]').forEach(row => {
      const service = PAYMENT_SERVICES.find(service => service.id === row.dataset.campusMerchant), matches = !!service && merchantMatches(service, query);
      row.hidden = !matches; if (matches) count++;
    });
    root.querySelector('.campus-search-empty').hidden = count > 0;
    root.querySelector('[data-campus-result-count]').textContent = `${count} ${count === 1 ? 'spot' : 'spots'} · demo`;
    root.querySelector('[data-hub-action="clear-search"]').hidden = !query; ctx.saveDraft?.();
  };
  const utilities = root.querySelector?.('.payments-everyday-bills');
  const toggleUtilities = () => { if (current()) { ctx.draft.paymentUtilitiesOpen = utilities.open; ctx.saveDraft?.(); } };
  const click = event => {
    const button = event.target.closest('button');
    if (!current() || !button || button.disabled) return;
    if (button.dataset.hubTab) return ctx.go(hubRoute(button.dataset.hubTab), { replace: true });
    const action = button.dataset.hubAction;
    const service = action === 'service' ? PAYMENT_SERVICES.find(service => service.id === button.dataset.serviceId) : null;
    if (ctx.connected === true && (['momo', 'bank'].includes(action) || service && service.type !== 'campus' || action === 'resume' && savedProviderUnavailable(ctx))) {
      ctx.toast?.('This provider is not connected in the shared test. You can pay a Lumo user or scan a merchant’s Lumo QR.');
      return;
    }
    if (['lumo', 'momo', 'bank'].includes(action)) return ctx.startPayment(null, action);
    if (action === 'resume') return ctx.resumePayment();
    if (action === 'recent' || action === 'favourites') return ctx.go({ section: 'pay', page: 'recipients-list', list: action, backTo: origin });
    if (action === 'service' && PAYMENT_SERVICES.some(service => service.id === button.dataset.serviceId)) return ctx.go({ section: 'pay', page: 'service', id: button.dataset.serviceId, backTo: origin });
    if (action === 'scan') return ctx.go({ section: 'pay', page: 'scan', backTo: origin });
    if (action === 'merchant-code') { merchantCodeCleanup?.(); merchantCodeCleanup = ctx.enterMerchantCode?.(); return; }
    if (action === 'clear-search' && search) { search.value = ''; filter(); search.focus(); return; }
    if (action === 'cards') return ctx.go({ section: 'pay', page: 'cards', backTo: origin });
    if (action === 'requests') return ctx.go({ section: 'pay', page: 'requests', backTo: origin });
    if (action === 'activity') return ctx.go({ section: 'activity', page: 'home', returnTo: origin });
    if (action === 'ious') return ctx.go({ section: 'life', page: 'ious', backTo: origin });
  };
  root.addEventListener('click', click); search?.addEventListener('input', filter); utilities?.addEventListener('toggle', toggleUtilities);
  return () => { alive = false; merchantCodeCleanup?.(); root.removeEventListener('click', click); search?.removeEventListener('input', filter); utilities?.removeEventListener('toggle', toggleUtilities); };
}
