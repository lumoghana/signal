import {requestPresentation} from './collections-ui.js';
import {shopPaymentReceipts} from './merchant-receipts.js';

const escapeHTML = value => String(value ?? '').replace(/[&<>"']/g, character => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'}[character]));
const array = value => Array.isArray(value) ? value : [];
const identifier = () => globalThis.crypto?.randomUUID?.() || `cashier-${Date.now()}-${Math.random().toString(36).slice(2)}`;

/** Counter receipts keep their recorded operator, including payments received after handover. */
export function cashierReceipts(state, actor, counter) {
  if (!actor?.staffId || counter?.locked) return [];
  return array(state?.transactions).filter(payment => payment.shopId === actor.shopId && (
    payment.staffId === actor.staffId || counter?.id && payment.counterId === counter.id
  )).sort((a, b) => Date.parse(b.confirmedAt || b.createdAt) - Date.parse(a.confirmedAt || a.createdAt));
}

export function cashierRequests(state, actor, counter, now = Date.now()) {
  if (!actor?.staffId || counter?.locked) return [];
  return array(state?.requests).filter(request => request.shopId === actor.shopId && (
    request.staffId === actor.staffId || counter?.id && request.counterId === counter.id
  ) && ['waiting', 'processing'].includes(requestPresentation({transactions: array(state?.transactions)}, request, now).status));
}

export function cashierShiftSummary(state, actor, counter) {
  if (!actor?.staffId || counter?.locked) return {shift: null, count: 0, gross: 0};
  const shift = array(state?.shifts).find(record => record.staffId === actor.staffId && record.shopId === actor.shopId && record.status === 'open') || null;
  const receipts = shift ? array(state?.transactions).filter(payment => payment.status === 'paid' && payment.shiftId === shift.id && payment.staffId === actor.staffId) : [];
  return {shift, count: receipts.length, gross: receipts.reduce((total, payment) => total + payment.amount, 0)};
}

export function appendCashierDigit(amount, digit) {
  if (digit === '⌫') return amount.slice(0, -1);
  if (!/^[0-9.]$/.test(digit) || digit === '.' && amount.includes('.')) return amount;
  if (digit === '.') return `${amount || '0'}.`;
  if (amount.includes('.') && amount.split('.')[1].length >= 2) return amount;
  const next = amount === '0' ? digit : amount + digit;
  return next.replace('.', '').length > 8 ? amount : next;
}

/** A small, role-specific workspace. Account and receiving-phone authority remain in the shared service. */
export function createCashier(config = {}) {
  const E = config.E || escapeHTML;
  const money = config.money || (value => `GH₵ ${(Number(value) / 100).toFixed(2)}`);
  const icon = name => config.icon?.(name) || '';
  const time = value => config.time?.(value) || new Date(value).toLocaleTimeString('en-GH', {hour: '2-digit', minute: '2-digit'});
  let page = 'collect', sheet = '', amount = '', note = '', requestId = '', receiptId = '', error = '', notice = '', busy = false;
  let attempt = null, refundAttempt = null, query = '', selectedStaff = '', context = '', generation = 0, focusedSheet = '';
  const snapshot = () => config.getState?.() || {};
  const actor = () => config.getActor?.() || {};
  const counter = () => config.getCounter?.() || null;
  const shop = () => config.getShop?.() || array(snapshot().shops).find(value => value.id === actor().shopId) || {};
  const online = () => {
    const status = config.getConnectivity?.();
    return globalThis.navigator?.onLine !== false && status !== false && !['offline', 'disconnected', 'error'].includes(typeof status === 'string' ? status : status?.status);
  };
  const redraw = () => config.onChange?.();
  const storage = () => {try {return config.storage || globalThis.sessionStorage;} catch {return null;}};
  const attemptKey = () => `lumo-cashier-request-v1:${config.getSession?.()?.businessId || snapshot().business?.id || ''}:${counter()?.id || ''}:${actor().staffId || ''}:${actor().shopId || ''}`;
  function saveAttempt() {try {if (attempt) storage()?.setItem(attemptKey(), JSON.stringify(attempt)); else storage()?.removeItem(attemptKey());} catch {}}
  function loadAttempt() {
    try {
      const saved = JSON.parse(storage()?.getItem(attemptKey()) || 'null');
      if (saved?.shopId === actor().shopId && Number.isSafeInteger(saved.amount) && saved.amount > 0 && typeof saved.attemptId === 'string') {
        attempt = saved; amount = (saved.amount / 100).toFixed(2); note = String(saved.description || '');
      }
    } catch {}
  }
  const currentRequest = () => array(snapshot().requests).find(value => value.id === requestId && value.shopId === actor().shopId && (value.staffId === actor().staffId || counter()?.id && value.counterId === counter().id));
  const readOnlyReceipts = () => actor().staffId && !counter()?.locked ? shopPaymentReceipts(snapshot(), actor().shopId) : [];
  const currentReceipt = () => [...cashierReceipts(snapshot(), actor(), counter()),...readOnlyReceipts()].find(value => value.id === receiptId);
  const receiptRefunds = receipt => {const rows=new Map();for(const refund of [...array(snapshot().refunds).filter(value=>value.transactionId===receipt.id),...array(receipt.refunds)]){const key=refund.id||refund.reference||refund.providerReference;if(key)rows.set(key,refund);}return [...rows.values()];};
  const remainingRefund = receipt => Math.max(0, receipt.amount-Math.max(Number.isSafeInteger(receipt.refundedAmount)?receipt.refundedAmount:0,receiptRefunds(receipt).filter(refund=>['requested','processing','paid','confirmed','sandbox-completed'].includes(refund.status)).reduce((total,refund)=>total+refund.amount,0)));
  const field = (label, input) => `<label class="field"><span class="label">${label}</span>${input}</label>`;
  const button = (label, action, style = 'secondary', extra = '') => `<button type="button" class="btn ${style}" data-action="cashier-${action}" ${extra}>${label}</button>`;

  function ensureContext() {
    const next = [snapshot().business?.id || config.getSession?.()?.businessId || '', config.getSession?.()?.id || '', counter()?.id || '', actor().staffId || '', actor().shopId || '', !!counter()?.locked].join(':');
    if (context && context !== next) clear();
    if (context !== next) loadAttempt();
    context = next;
  }

  function clear() {
    generation++;
    page = 'collect'; sheet = ''; amount = ''; note = ''; requestId = ''; receiptId = ''; error = ''; notice = ''; busy = false;
    attempt = null; refundAttempt = null; query = ''; selectedStaff = ''; focusedSheet = '';
  }

  async function run(task, success = '') {
    if (busy) return;
    const epoch = generation;
    busy = true; error = ''; notice = ''; redraw();
    try {
      const result = await task(() => epoch === generation);
      if (epoch === generation) notice = success;
      return result;
    } catch (failure) {
      if (epoch === generation) error = failure?.message || 'Lumo could not complete that request. Try again.';
    } finally {
      if (epoch === generation) {busy = false; redraw();}
    }
  }

  function connectivity() {
    return online() ? '' : `<div class="cashier-message warning" role="status">${icon('alert')}<span>Connection lost. Wait for Lumo to confirm the payment before handing over goods.</span></div>`;
  }

  function feedback() {
    return `${error ? `<div class="cashier-message error" role="alert">${icon('alert')}<span>${E(error)}</span></div>` : ''}${notice ? `<div class="cashier-message success" role="status">${icon('check')}<span>${E(notice)}</span></div>` : ''}`;
  }

  function sampleNotice() {
    return config.isSample?.() ? '<p class="cashier-sample-notice">Sample in this browser. Sign in to collect from the Lumo consumer app.</p>' : '';
  }

  function heading(locked = false) {
    const c = counter(), a = actor(), person = c?.staffName || a.staffName || array(snapshot().staff).find(value => value.id === a.staffId)?.name;
    return `<header class="cashier-heading"><div><span class="eyebrow">${E(shop().name || 'Your counter')}</span><h1>${locked ? 'Ready when you are.' : page === 'receipts' ? 'Receipts' : 'Collect payment'}</h1><p>${E(c?.label || 'Store front')} <span aria-hidden="true">·</span> ${E(c?.mode === 'shared' ? 'Shared phone' : c?.mode === 'dedicated' ? 'Dedicated phone' : 'Cashier view')}</p></div>${locked ? '' : `<button class="icon-btn" data-action="cashier-menu" aria-label="Counter menu" aria-expanded="${sheet === 'menu'}">${icon('settings')}</button>`}</header>${!locked && person ? `<div class="cashier-operator"><span class="cashier-operator-dot"></span><span>${E(person)}</span><small>On counter</small></div>` : ''}`;
  }

  function brand() {
    return `<div class="cashier-topbar"><div class="cashier-brand"><img src="./icon.svg" alt=""><span><strong class="canonical-wordmark">lumo</strong><small class="brand-qualifier">merchant</small></span></div><span class="cashier-counter-label">Cashier</span></div>`;
  }

  function lockedView() {
    const c = counter(), staff = array(c?.eligibleStaff), dedicated = c?.mode === 'dedicated';
    const choice = selectedStaff || (staff.length === 1 ? staff[0].userId || staff[0].id : '');
    return `<section class="cashier-locked" aria-label="Unlock counter"><div class="cashier-lock-mark">${icon('shield')}</div><h2>${dedicated ? 'Unlock your counter' : 'Who’s collecting?'}</h2><p>${!online() ? 'This phone is locked. Reconnect to Lumo before entering your PIN.' : dedicated ? 'Use your cashier PIN to start serving.' : 'Choose your name and enter your cashier PIN.'}</p><form data-form="cashier" data-cashier-form="unlock">${field('Cashier', `<select class="select" name="userId" required ${busy ? 'disabled' : ''}><option value="">Choose your name</option>${staff.map(person => `<option value="${E(person.userId || person.id)}" ${(person.userId || person.id) === choice ? 'selected' : ''} ${person.pinReady === false ? 'disabled' : ''}>${E(person.name)}${person.pinReady === false ? ' · PIN needed' : ''}</option>`).join('')}</select>`)}${field('Cashier PIN', '<input class="input cashier-pin" type="password" name="pin" inputmode="numeric" pattern="[0-9]{6}" minlength="6" maxlength="6" autocomplete="off" required placeholder="6-digit PIN" aria-describedby="cashier-pin-hint">')}<small id="cashier-pin-hint" class="muted">Your manager sets up your cashier PIN.</small><button class="btn primary full" type="submit" ${busy || !online() || !staff.some(person => person.pinReady !== false) ? 'disabled' : ''}>${busy ? 'Checking PIN…' : 'Unlock & collect'}</button></form>${!staff.some(person => person.pinReady !== false) ? '<p class="cashier-empty">Ask your manager to assign a cashier and set up a PIN for this phone.</p>' : ''}<p class="cashier-lock-note">Pending payments stay with the cashier who requested them.</p>${config.onSignOut || config.onExit ? button('Sign in to another account', 'exit', 'ghost full') : ''}${config.isSample?.() && config.onDemoRoles ? button('Explore sample roles', 'demo-roles', 'ghost full') : ''}</section>`;
  }

  function shiftSummary() {
    const summary = cashierShiftSummary(snapshot(), actor(), counter());
    if (!summary.shift) return `<div class="cashier-start-shift"><p>Start your shift to record your collections.</p>${button('Start my shift', 'start-shift', 'primary full', busy || !online() ? 'disabled' : '')}</div>`;
    return `<div class="cashier-shift-summary" aria-label="Your shift collections"><span>Your shift <strong>${money(summary.gross)}</strong></span><span>${summary.count} received</span></div>`;
  }

  function receiverStatus() {
    const receiver = config.getReceiver?.();
    return receiver ? `<button class="cashier-sound-status" type="button" data-action="cashier-sound" aria-label="Receiving sound: ${E(receiver.label || 'Check sound')}. ${E(receiver.detail || '')}">${icon(receiver.state === 'ready' ? 'sound' : 'mute')}<span>${E(receiver.label || 'Check sound')}</span></button>` : '';
  }

  function amountView() {
    const s = shop(), summary = cashierShiftSummary(snapshot(), actor(), counter());
    const ready = s.accepting !== false && s.open !== false && online() && !!summary.shift;
    return `${shiftSummary()}${s.accepting === false || s.open === false ? '<div class="cashier-message warning" role="status">This shop is paused. Ask your manager to resume collections.</div>' : ''}<section class="cashier-amount-entry" aria-label="Create a payment request"><div class="cashier-amount"><label for="cashier-amount">Amount to collect · GH₵</label><input id="cashier-amount" name="cashierAmount" inputmode="decimal" type="text" value="${E(amount)}" placeholder="0.00" autocomplete="off" aria-label="Amount to collect in Ghana cedis" ${busy || attempt ? 'readonly' : ''}></div><input class="cashier-note" name="cashierNote" value="${E(note)}" maxlength="80" placeholder="Add a note (optional)" aria-label="Payment note, optional" ${busy || attempt ? 'readonly' : ''}><div class="cashier-keypad">${['1', '2', '3', '4', '5', '6', '7', '8', '9', '.', '0', '⌫'].map(digit => `<button type="button" data-action="cashier-key" data-value="${digit}" aria-label="${digit === '⌫' ? 'Delete digit' : digit === '.' ? 'Decimal point' : digit}" ${busy || attempt ? 'disabled' : ''}>${digit === '⌫' ? icon('back') || digit : digit}</button>`).join('')}</div><button type="button" class="btn primary full cashier-primary" data-action="cashier-create" ${!ready || !Number(amount) || busy ? 'disabled' : ''}>${busy ? 'Creating QR…' : attempt ? 'Retrieve payment QR' : 'Show payment QR'} ${icon('arrow')}</button><div class="cashier-amount-foot">${button('Shop QR', 'shop-qr', 'ghost')}${amount && !attempt ? button('Clear', 'clear', 'ghost') : '<span>Customer confirms in Lumo</span>'}</div></section>${config.onSharePayment?button('Share payment link','share-amount','ghost full cashier-share-entry',busy||!online()?'disabled':''):''}${receiverStatus()}${pendingQueue()}`;
  }

  function pendingQueue() {
    const queue = cashierRequests(snapshot(), actor(), counter());
    return queue.length ? `<details class="cashier-pending"><summary><span>${icon('clock')} ${queue.length} awaiting confirmation</span>${icon('down')}</summary>${queue.map(request => `<button type="button" class="cashier-receipt-row" data-action="cashier-request" data-id="${E(request.id)}"><span>${icon('qr')}</span><span><strong>${money(request.amount)}</strong><small>${E(request.staffName || 'Original cashier')} · ${time(request.createdAt)}</small></span>${icon('chevron')}</button>`).join('')}</details>` : '';
  }

  function requestView(request) {
    const status = requestPresentation({transactions: array(snapshot().transactions)}, request);
    if (status.transaction && online()) return confirmedView(status.transaction, request);
    const expired = ['expired', 'cancelled', 'failed'].includes(status.status);
    const checking = status.status === 'processing' || status.status === 'paid' || !online();
    const title = !online() ? 'Checking connection' : expired ? status.status === 'cancelled' ? 'Request cancelled' : 'QR expired' : checking ? 'Checking payment' : 'Ready to scan';
    return `<section class="cashier-request-view" aria-label="Payment request"><span class="cashier-state ${expired ? 'warning' : ''}">${icon(expired ? 'clock' : checking ? 'refresh' : 'qr')} ${title}</span><h2>${money(request.amount)}</h2><p>${E(request.description || (config.isSample?.() ? 'Preview a customer payment in this browser.' : 'Customer scans this QR in Lumo.'))}</p>${!expired ? `<div class="cashier-qr">${config.qrSvg?.(config.paymentLink?.(request.shopId, request) || '') || ''}</div><p class="cashier-qr-caption">${E(shop().name)} <span>·</span> ${E(shop().code || '')}${config.isSample?.() ? '<br><small>Sample QR · this browser only</small>' : ''}</p>` : `<div class="cashier-result-mark warning">${icon('clock')}</div>`}<div class="cashier-request-status" role="status">${checking ? 'Keep this request open. Wait for confirmation from Lumo.' : expired ? 'Check receipts before making another request for this purchase.' : config.isSample?.() ? 'Waiting for the sample customer payment.' : 'Waiting for payment. This screen updates when Lumo confirms it.'}</div><small class="cashier-attribution">Requested by ${E(request.staffName || 'Original cashier')} · ${time(request.createdAt)}</small>${config.isSample?.() && config.onPreviewPayment && !expired && !checking ? button('Preview customer payment', 'preview-payment', 'primary full') : ''}${!expired&&!checking&&config.onSharePayment?button('Share payment link','share-request','secondary full'):''}${button(expired ? 'Back to collect' : 'Serve another customer', 'next', 'secondary full')}<p class="cashier-lock-note">${expired ? 'A screenshot from a customer is not a payment receipt.' : 'This request stays in pending payments when you leave this screen.'}</p></section>`;
  }

  function confirmedView(receipt, request) {
    return `<section class="cashier-confirmed" aria-label="Confirmed payment"><div class="cashier-result-mark">${icon('check')}</div><p class="cashier-confirmed-label">Payment received</p><h2>${money(receipt.amount)}</h2><p>${E(receipt.payer || 'Lumo customer')}</p><div class="cashier-confirmation-meta"><strong>Confirmed by Lumo</strong><span>${time(receipt.confirmedAt || receipt.createdAt)}</span><small>${E(receipt.reference || receipt.id)}</small></div>${request?.staffId !== actor().staffId ? `<p class="cashier-lock-note">${E(request?.staffName || receipt.staffName || 'Original cashier')}’s request. Its original attribution is kept.</p>` : ''}${button('Next customer', 'next', 'primary full')}${button('View receipt', 'receipt', 'ghost full', `data-id="${E(receipt.id)}"`)}</section>`;
  }

  function receiptsView() {
    const receipts = cashierReceipts(snapshot(), actor(), counter()), term = query.trim().toLowerCase();
    const filtered = receipts.filter(receipt => [receipt.reference, receipt.payer, receipt.staffName, (receipt.amount / 100).toFixed(2)].some(value => String(value || '').toLowerCase().includes(term)));
    return `<section class="cashier-receipts"><label class="cashier-search">${icon('search')}<input class="input" type="search" name="cashierSearch" value="${E(query)}" placeholder="Find a name, amount or reference" aria-label="Search counter receipts"></label><p class="cashier-list-caption">${counter() ? 'This counter’s receipts. Each keeps its original cashier.' : 'Your payment receipts.'}</p>${filtered.length ? filtered.slice(0, 100).map(receipt => `<button type="button" class="cashier-receipt-row" data-action="cashier-receipt" data-id="${E(receipt.id)}"><span class="cashier-receipt-mark ${receipt.status === 'paid' ? 'confirmed' : ''}">${icon(receipt.status === 'paid' ? 'check' : 'clock')}</span><span><strong>${E(receipt.payer || 'Lumo customer')}</strong><small>${time(receipt.confirmedAt || receipt.createdAt)} · ${receipt.status === 'paid' ? 'Confirmed' : 'Checking'}${receipt.staffId !== actor().staffId ? ` · ${E(receipt.staffName || 'Original cashier')}` : ''}</small></span><strong>${money(receipt.amount)}</strong></button>`).join('') : `<div class="cashier-empty">${term ? 'No receipts match your search.' : 'Confirmed collections will appear here.'}</div>`}${button('Shop QR & online receipts'+(readOnlyReceipts().length?' · '+readOnlyReceipts().length:''),'shop-receipts','secondary full')}${pendingQueue()}</section>`;
  }

  function receiptView() {
    const receipt = currentReceipt();
    if (!receipt) return '<p class="cashier-empty">This receipt is no longer available to this counter.</p>';
    const refunds = receiptRefunds(receipt);
    const remaining = remainingRefund(receipt);
    return `<div class="cashier-receipt-detail"><span class="cashier-state">${icon(receipt.status === 'paid' ? 'check' : 'clock')} ${receipt.status === 'paid' ? 'Confirmed by Lumo' : 'Checking payment'}</span><h3>${money(receipt.amount)}</h3><p>${E(receipt.payer || 'Lumo customer')}</p><dl><div><dt>Reference</dt><dd>${E(receipt.reference || receipt.id)}</dd></div><div><dt>Time</dt><dd>${E(new Date(receipt.confirmedAt || receipt.createdAt).toLocaleString('en-GH', {day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit'}))}</dd></div><div><dt>Cashier</dt><dd>${E(receipt.staffName || (receipt.intentChannel==='online'||receipt.method==='online-request'?'Online request · no cashier assigned':'Shop QR · no cashier assigned'))}</dd></div></dl>${refunds.length ? `<div class="cashier-refund-status">${refunds.map(refund => `<p>${refund.status === 'requested' ? 'Refund requested' : refund.status === 'paid' ? 'Refunded' : E(refund.status)} · ${money(refund.amount)}</p>`).join('')}</div>` : ''}${receipt.status === 'paid' && remaining > 0 ? button('Request a refund', 'refund', 'secondary full') : ''}${button('Get help with this payment', 'help-receipt', 'ghost full')}</div>`;
  }

  function refundView() {
    const receipt = currentReceipt();
    if (!receipt || receipt.status !== 'paid') return '<p class="cashier-empty">Choose a confirmed receipt first.</p>';
    const remaining = remainingRefund(receipt);
    return `<p class="cashier-sheet-intro">${refundAttempt ? 'The last response was not confirmed. Retrieve the same request before creating another.' : 'Your manager will review this request. No money is returned until it is approved.'}</p><form data-form="cashier" data-cashier-form="refund">${field('Amount · GH₵', `<input class="input" name="amount" type="number" inputmode="decimal" min="0.01" max="${((refundAttempt?.amount || remaining) / 100).toFixed(2)}" step="0.01" required value="${((refundAttempt?.amount || remaining) / 100).toFixed(2)}" ${refundAttempt ? 'readonly' : ''}>`)}${field('Reason', `<textarea class="input" name="reason" rows="2" maxlength="180" required placeholder="What happened?" ${refundAttempt ? 'readonly' : ''}>${E(refundAttempt?.reason || '')}</textarea>`)}<button class="btn primary full" ${busy || !online() ? 'disabled' : ''}>${busy ? 'Sending request…' : refundAttempt ? 'Retrieve refund request' : 'Send refund request'}</button></form>`;
  }

  function helpView() {
    const receipt = currentReceipt();
    return `<p class="cashier-sheet-intro">${receipt ? `Receipt ${E(receipt.reference || receipt.id)} will be attached.` : 'Tell your manager what you need help with.'}</p><form data-form="cashier" data-cashier-form="help">${field('What happened?', '<textarea class="input" name="message" rows="3" maxlength="1500" required placeholder="Describe the problem"></textarea>')}<button class="btn primary full" ${busy || !online() ? 'disabled' : ''}>${busy ? 'Sending…' : 'Send for help'}</button></form>`;
  }

  function handoverView() {
    const pending = cashierRequests(snapshot(), actor(), counter()).filter(request => request.staffId === actor().staffId);
    const summary = cashierShiftSummary(snapshot(), actor(), counter());
    return `<div class="cashier-handover-summary"><span>Your shift’s confirmed collections</span><strong>${money(summary.gross)}</strong><small>${summary.count} received${pending.length ? ` · ${pending.length} still awaiting confirmation` : ''}</small></div><p class="cashier-sheet-intro">Pending requests stay open and keep your name. The next cashier can check them here.</p><form data-form="cashier" data-cashier-form="handover">${field('Handover note (optional)', '<textarea class="input" name="note" rows="2" maxlength="500" placeholder="Anything the next cashier should know?"></textarea>')}<button class="btn primary full" ${busy || !online() ? 'disabled' : ''}>${busy ? 'Ending shift…' : counter()?.mode === 'shared' ? 'End shift & switch cashier' : 'End shift & lock'}</button></form>`;
  }

  function shopQRView() {
    const s = shop();
    return `<div class="cashier-shop-qr"><div class="cashier-qr">${config.qrSvg?.(config.paymentLink?.(s.id) || '') || ''}</div><h3>${E(s.name)}</h3><p>${E(s.code || '')}</p><p class="cashier-sheet-intro">The customer enters the amount. These payments belong to the shop and are not assigned to your cashier shift.</p>${config.onSharePayment?button('Share payment link','share-shop','secondary full'):''}${button('Check shop QR receipts', 'shop-receipts', 'secondary full')}</div>`;
  }

  function shopReceiptsView() {
    const receipts = readOnlyReceipts();
    const label=receipt=>receipt.source==='guest-momo'?'Guest MoMo · test payment':receipt.intentChannel==='online'||receipt.method==='online-request'?'Online request':'Shop QR';
    return `<p class="cashier-sheet-intro">Confirmed shop payments from the last 24 hours. These keep their shop attribution and do not count as your shift collections.</p>${receipts.length?receipts.map(receipt=>`<button type="button" class="cashier-shop-receipt cashier-shop-receipt-button" data-action="cashier-receipt" data-id="${E(receipt.id)}"><header><strong>${money(receipt.amount)}</strong><span>Confirmed by Lumo</span></header><p>${E(receipt.payer||'Customer')}</p><small>${E(label(receipt))} · no cashier assigned</small><small>${time(receipt.confirmedAt||receipt.createdAt)} · ${E(receipt.reference)}</small><small>View receipt ${icon('chevron')}</small></button>`).join(''):'<p class="cashier-empty">No recent shop QR or online receipts. A customer screenshot is not payment confirmation.</p>'}`;
  }

  function sheetView() {
    if (!sheet) return '';
    const titles = {menu: 'Your counter', receipt: 'Payment receipt', refund: 'Request a refund', help: 'Get help', handover: 'Shift handover', 'shop-qr': 'Shop QR', 'shop-receipts': 'Shop payments'};
    const content = sheet === 'menu' ? `<div class="cashier-menu">${button(`${icon('sound')} Sound & receiving phone`, 'sound', 'secondary full')}${button(`${icon('help')} Get help`, 'help', 'secondary full')}${config.onSharedLinks?button(`${icon('link')} Shared payment links`,'shared-links','secondary full'):''}${counter() ? button(`${icon('shield')} Lock phone`, 'lock', 'secondary full', busy ? 'disabled' : '') : ''}${button(`${icon('people')} ${counter()?.mode === 'shared' ? 'Switch cashier / end shift' : 'End my shift'}`, 'handover', 'secondary full', busy || !online() ? 'disabled' : '')}${config.isSample?.() && config.onDemoRoles ? button('Explore sample roles', 'demo-roles', 'ghost full') : ''}${config.onSignOut || config.onExit ? button('Sign out of this phone', 'exit', 'ghost full') : ''}</div>` : sheet === 'receipt' ? receiptView() : sheet === 'refund' ? refundView() : sheet === 'help' ? helpView() : sheet === 'handover' ? handoverView() : sheet === 'shop-receipts' ? shopReceiptsView() : shopQRView();
    return `<div class="cashier-sheet-backdrop"><section class="cashier-sheet" role="dialog" aria-modal="true" aria-labelledby="cashier-sheet-title"><header><h2 id="cashier-sheet-title">${titles[sheet]}</h2><button class="icon-btn" data-action="cashier-close" aria-label="Close ${titles[sheet].toLowerCase()}" ${busy ? 'disabled' : ''}>${icon('close') || '×'}</button></header>${content}${feedback()}</section></div>`;
  }

  function render() {
    ensureContext();
    const locked = counter()?.locked === true;
    const request = currentRequest();
    return `<main class="cashier-workspace ${locked ? 'is-locked' : ''}">${brand()}${heading(locked)}${sampleNotice()}${connectivity()}${!sheet ? feedback() : ''}${locked ? lockedView() : `<div class="cashier-body" ${sheet ? 'inert' : ''}>${page === 'receipts' ? receiptsView() : request ? requestView(request) : amountView()}</div><nav class="cashier-nav" aria-label="Cashier navigation" ${sheet ? 'inert' : ''}><button data-action="cashier-tab" data-page="collect" class="${page === 'collect' ? 'active' : ''}" ${page === 'collect' ? 'aria-current="page"' : ''}>${icon('qr')}<span>Collect</span></button><button data-action="cashier-tab" data-page="receipts" class="${page === 'receipts' ? 'active' : ''}" ${page === 'receipts' ? 'aria-current="page"' : ''}>${icon('payments')}<span>Receipts</span></button></nav>${sheetView()}`}</main>`;
  }

  async function handleClick(element) {
    const action = element?.dataset?.action;
    if (!action?.startsWith('cashier-')) return false;
    ensureContext();
    const command = action.slice(8);
    if (counter()?.locked && !['exit', 'demo-roles'].includes(command)) return true;
    if (busy && !['tab'].includes(command)) return true;
    if (command === 'key' && !attempt) amount = appendCashierDigit(amount, element.dataset.value);
    if (command === 'clear' && !attempt) {amount = ''; note = '';}
    if (command === 'tab') {page = element.dataset.page === 'receipts' ? 'receipts' : 'collect'; sheet = ''; error = ''; notice = '';}
    if (command === 'menu') sheet = 'menu';
    if (command === 'close') {sheet = ''; error = ''; notice = '';}
    if (command === 'next') {requestId = ''; amount = ''; note = ''; attempt = null; saveAttempt(); error = ''; notice = ''; page = 'collect';}
    if (command === 'request') {requestId = element.dataset.id; page = 'collect'; sheet = '';}
    if (command === 'receipt') {receiptId = element.dataset.id; sheet = 'receipt'; refundAttempt = null;}
    if (command === 'refund') {sheet = 'refund'; refundAttempt = null;}
    if (command === 'help-receipt') sheet = 'help';
    if (command === 'help') {receiptId = ''; sheet = 'help';}
    if (command === 'handover') sheet = 'handover';
    if (command === 'shop-qr') sheet = 'shop-qr';
    if (command === 'share-amount' && !attempt && online()) {sheet='';config.onSharePayment?.({amount:Number(amount)>0?Math.round(Number(amount)*100):undefined,description:note});}
    if (command === 'share-shop') {sheet='';config.onSharePayment?.({});}
    if (command === 'share-request') {const request=currentRequest();if(request&&requestPresentation({transactions:array(snapshot().transactions)},request).canPay){sheet='';config.onSharePayment?.({requestId:request.id});}}
    if (command === 'shared-links') {sheet='';config.onSharedLinks?.();}
    if (command === 'sound') {sheet = ''; config.onSound?.();}
    if (command === 'exit') await (config.onSignOut || config.onExit)?.();
    if (command === 'demo-roles' && config.isSample?.()) config.onDemoRoles?.();
    if (command === 'shop-receipts') sheet = 'shop-receipts';
    if (command === 'preview-payment' && config.isSample?.()) {
      const request = currentRequest();
      if (request && requestPresentation({transactions: array(snapshot().transactions)}, request).canPay) config.onPreviewPayment?.(request);
    }
    if (command === 'lock') await run(() => config.onLock?.({endShift: false}));
    if (command === 'start-shift') await run(() => config.onStartShift ? config.onStartShift({shopId: actor().shopId}) : config.act?.('START_SHIFT', {shopId: actor().shopId}));
    if (command === 'create') {
      if (!online() || !cashierShiftSummary(snapshot(), actor(), counter()).shift) return true;
      const cents = Math.round(Number(amount) * 100);
      if (!Number.isSafeInteger(cents) || cents <= 0) return true;
      attempt ||= {shopId: actor().shopId, amount: cents, description: note.trim(), attemptId: identifier()};
      saveAttempt();
      await run(async current => {
        const result = await (config.onCreateRequest ? config.onCreateRequest({...attempt}) : config.act?.('CREATE_REQUEST', {...attempt}));
        if (!current()) return;
        const request = result?.entity || result?.request || result;
        if (!request?.id) throw new Error('Lumo did not return a payment QR. Tap Retrieve to check the same request.');
        requestId = request.id; attempt = null; saveAttempt(); amount = ''; note = '';
      });
    }
    redraw();
    return true;
  }

  async function handleSubmit(form) {
    if (form?.dataset?.form !== 'cashier') return false;
    ensureContext();
    if (busy || !online()) return true;
    const values = Object.fromEntries(new FormData(form));
    const kind = form.dataset.cashierForm;
    if (counter()?.locked && kind !== 'unlock') return true;
    if (kind === 'unlock') {
      const pinInput = form.elements?.namedItem?.('pin');
      const pin = String(values.pin || '');
      if (pinInput) pinInput.value = '';
      if (!/^\d{6}$/.test(pin)) {error = 'Enter your 6-digit cashier PIN.'; redraw(); return true;}
      selectedStaff = String(values.userId || '');
      await run(() => {
        if (!config.onUnlock) throw new Error('This counter is not connected. Sign in again.');
        return config.onUnlock({userId: selectedStaff, pin});
      });
    }
    if (kind === 'handover') await run(async current => {
      const payload = {note: String(values.note || '').trim().slice(0, 500)};
      if (config.onHandover) await config.onHandover(payload);
      else if (counter()) await config.onLock?.({...payload, endShift: true});
      else {
        const shift = cashierShiftSummary(snapshot(), actor(), counter()).shift;
        if (shift) await config.act?.('END_SHIFT', {id: shift.id, ...payload});
        sheet = '';
      }
      if (current() && !counter()) sheet = '';
    });
    if (kind === 'refund') {
      const receipt = currentReceipt(), cents = Math.round(Number(values.amount) * 100), reason = String(values.reason || '').trim();
      if (!receipt || receipt.status !== 'paid' || !Number.isSafeInteger(cents) || cents <= 0 || !reason) return true;
      refundAttempt ||= {transactionId: receipt.id, amount: cents, reason, attemptId: identifier()};
      await run(async () => {
        if (refundAttempt.amount !== cents || refundAttempt.reason !== reason) throw new Error('Retry your original refund request before changing its amount or reason.');
        if (config.onRefundRequest) await config.onRefundRequest({...refundAttempt});
        else await config.act?.('REFUND', {...refundAttempt});
        refundAttempt = null; sheet = 'receipt';
      }, 'Refund request sent for approval.');
    }
    if (kind === 'help') await run(async () => {
      const receipt = currentReceipt();
      const payload = {shopId: actor().shopId, transactionId: receipt?.id || null, subject: receipt ? 'Help with a counter payment' : 'Help at the counter', message: String(values.message || '').trim().slice(0, 1500)};
      if (!payload.message) throw new Error('Tell us what happened.');
      if (config.onHelp) await config.onHelp(payload);
      else await config.act?.('ADD_TICKET', {...payload, category: 'payment', reference: receipt?.reference || ''});
      sheet = '';
    }, 'Your help request has been sent.');
    return true;
  }

  function handleChange(element) {
    if (!element) return false;
    ensureContext();
    if (element.name === 'cashierSearch') {query = element.value; redraw(); return true;}
    if (element.name === 'cashierNote') {if (!busy && !attempt) note = element.value.slice(0, 80); return true;}
    if (element.name === 'cashierAmount') {if (!busy && !attempt && /^\d{0,6}(?:\.\d{0,2})?$/.test(element.value)) {amount = element.value; redraw();} else element.value = amount; return true;}
    if (element.name === 'userId' && element.closest?.('[data-form="cashier"]')) {selectedStaff = element.value; return true;}
    return false;
  }

  function handleKeydown(event) {
    if (sheet) {
      if (event.key === 'Escape' && !busy) {event.preventDefault(); sheet = ''; redraw(); return true;}
      if (event.key === 'Tab') {
        const items = array(Array.from(globalThis.document?.querySelectorAll('.cashier-sheet button:not(:disabled), .cashier-sheet input:not(:disabled), .cashier-sheet select:not(:disabled), .cashier-sheet textarea:not(:disabled), .cashier-sheet a[href]') || []));
        const first = items[0], last = items.at(-1), active = globalThis.document?.activeElement;
        if (event.shiftKey && (active === first || !items.includes(active))) {event.preventDefault(); last?.focus();}
        else if (!event.shiftKey && (active === last || !items.includes(active))) {event.preventDefault(); first?.focus();}
      }
      return true;
    }
    if (counter()?.locked || page !== 'collect' || requestId || busy || attempt || event.ctrlKey || event.metaKey || event.altKey || /INPUT|TEXTAREA|SELECT/.test(event.target?.tagName || '')) return false;
    if (/^[0-9.]$/.test(event.key) || event.key === 'Backspace') {
      event.preventDefault(); amount = appendCashierDigit(amount, event.key === 'Backspace' ? '⌫' : event.key); redraw(); return true;
    }
    if (event.key === 'Enter' && !event.target?.closest?.('button,a')) {event.preventDefault(); handleClick({dataset: {action: 'cashier-create'}}); return true;}
    return false;
  }

  function afterRender() {
    if (sheet && focusedSheet !== sheet) {
      focusedSheet = sheet;
      globalThis.document?.querySelector('.cashier-sheet button, .cashier-sheet input, .cashier-sheet select, .cashier-sheet textarea')?.focus();
    }
    if (!sheet) focusedSheet = '';
  }

  return {render, handleClick, handleSubmit, handleChange, handleKeydown, afterRender, reset() {clear(); context = '';}, openReceipt(id) {receiptId = id; sheet = 'receipt'; redraw();}, setPage(value) {page = value === 'receipts' ? value : 'collect'; sheet = '';}, isOpen: () => !!sheet, close() {if (!busy) {sheet = ''; redraw();}}};
}
