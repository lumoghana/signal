import {encodeSharedQrLink} from './approved-qr.js';
import {parseQrPayload} from './qr-decoder.js';
import {recoveryPending} from './payment-recovery.js';
import {runActionFlow} from './approved-flow.js';
import {paymentFee} from './payments-parity-model.js';
import {renderPaymentParity,bindPaymentParity,createSplitSheet,createRequestSheet} from './payments-parity-ui.js';
import {renderPauseAlternatives,bindPauseAlternatives,getPauseTradeoff} from './pause-intelligence.js';
import { esc, cash, icon, categorySymbol, pageHead, row, field, btn, empty, dateLabel } from './ui.js';
import { getSummary, evaluatePayment, repayableIOUAmount } from './model.js';
import qrcode from './vendor/qrcode.js';
import { renderPauseScreen } from './pause-view.js';
import { getPauseConsequence } from './pause-consequence.js';
import { accountFundingPhone } from './funding-phone.js';
import { renderPaymentsHub, bindPaymentsHub } from './payments-hub.js';
import { renderPaymentService, bindPaymentService } from './payment-services.js';
import { getPaymentService, prepareServicePayment, getServiceHubTab, isCampusCodeService, getTopUpShortcuts } from './payment-catalog.js';
import { openMerchantCodeSheet } from './merchant-code.js';
import { renderPaymentExtras, bindPaymentExtras } from './payment-extras.js';
import { renderQrScreen, bindQrScreen } from './qr-screen.js';
import { renderAccountRecipient, bindAccountRecipient } from './payment-recipient.js';
import { recipientLookupMatches } from './recipient-lookup.js';
import {renderLumoRecipientDirectory,bindLumoRecipientDirectory} from './lumo-recipient-directory.js';

const CONTACTS = [
  { id: 'kofi', name: 'Kofi Mensah', short: 'Kofi', number: '024 555 0182', emoji: 'K', colour: 'violet' },
  { id: 'akosua', name: 'Akosua Owusu', short: 'Akosua', number: '055 555 0124', emoji: 'A', colour: 'peach' },
  { id: 'efua', name: 'Efua Asante', short: 'Efua', number: '020 555 0166', emoji: 'E', colour: 'blue' },
  { id: 'nightmarket', name: 'Night Market', short: 'Night Market', number: '@nightmarket', emoji: '🍲', colour: 'green' },
];
const CATEGORIES = ['Food', 'Transport', 'Data', 'Essentials', 'Personal', 'Other'];
const RAILS = [{ id: 'lumo', label: 'Lumo', icon: 'spark' }, { id: 'momo', label: 'MoMo', icon: 'phone' }, { id: 'bank', label: 'Bank', icon: 'bank' }];
const pence = value => Math.round(Number(String(value ?? '').replace(/,/g, '')) * 100);
const amountInput = value => value ? (value / 100).toFixed(2).replace(/\.00$/, '') : '';
const nonce = prefix => `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
const payRoute = (page, more = {}) => ({ section: 'pay', page, ...more });
const paymentSubmissions=new WeakSet();
export const hasUnresolvedPayment=recoveryPending;
function originalPaymentFirst(ctx){
  if(!hasUnresolvedPayment(ctx.draft.payment))return false;
  ctx.toast('Check the original payment before starting another. Its result is not confirmed.');
  ctx.go(payRoute('review'));return true;
}

function draft(ctx) {
  if (!ctx.draft.payment) ctx.draft.payment = { rail: 'lumo', recipient: null, amount: 0, category: 'Other', note: '', idempotencyKey: nonce('payment') };
  return ctx.draft.payment;
}
function resetDraft(ctx, recipient = null, rail = 'lumo') {
  const accountRail = ['momo', 'bank'].includes(rail);
  ctx.draft.payment = { rail, recipient: accountRail ? null : recipient, amount: 0, category: 'Other', note: '', idempotencyKey: nonce('payment') };
  if (accountRail) {
    ctx.draft.payment.lookupRequired = true;
    ctx.draft.payment.recipientForms = { [rail]: { number: recipient?.number || '', ...(rail === 'bank' ? { bank: recipient?.bank || '' } : {}) } };
  }
  return ctx.draft.payment;
}
/** Restore only recorded destination fields. A new retry needs new lookup/review/auth. */
export function prepareFailedPaymentRetry(tx) {
  if (!tx || tx.type !== 'payment' || tx.status !== 'failed') return null;
  const recipient = tx.recipient && typeof tx.recipient === 'object' ? structuredClone(tx.recipient) : { name: tx.merchant, emoji: tx.merchant?.[0], number: tx.recipientNumber || '', bank: tx.recipientBank || tx.bank || '', network: tx.recipientNetwork || tx.network || '' };
  const holder = { draft: {} }, d = resetDraft(holder, recipient, tx.rail || 'lumo');
  Object.assign(d, { amount: tx.amount, amountText: amountInput(tx.amount), category: tx.category || 'Other', note: tx.note || '', fee: paymentFee(tx.rail), retryOf: tx.id,
    ...(tx.requestId ? { requestId: tx.requestId, flowOrigin: payRoute('request-detail', { id: tx.requestId, backTo: payRoute('requests') }) } : {}),
    ...(tx.iouId ? { iouId: tx.iouId, flowOrigin: { section: 'life', page: 'iou-detail', id: tx.iouId } } : {}) });
  if (tx.serviceId) Object.assign(d, { serviceId: tx.serviceId, serviceFields: { ...tx.serviceFields }, paymentKind: 'service', reference: tx.reference, bundleName: tx.bundleName, billerName: tx.billerName, hubTab: tx.hubTab, recipient });
  return d;
}

function remember(ctx) { ctx.saveDraft?.(); }
function finish(ctx, route) { ctx.setCapture?.(null); return ctx.finish ? ctx.finish(route) : ctx.go(route, { replace: true }); }
function pendingPayment(ctx) {
  const d = ctx.draft.payment;
  return !!d && !d.completed && !!(d.recipient || d.recipientForms && Object.values(d.recipientForms).some(f => f.name || f.number) || d.amount);
}
function capturePayment(ctx, route) {
  const d = ctx.draft.payment;
  if (!d || d.completed) return;
  if (route.page === 'recipient') {
    d.recipientForms ||= {};
    const f = d.recipientForms[d.rail] ||= {};
    const read = (name) => ctx.$(`[name="${name}"]`);
    for (const [key, name] of [['name','recipientName'],['number','recipientNumber'],['network','recipientNetwork'],['bank','recipientBank']]) {
      const el = read(name); if (el) f[key] = el.value;
    }
    d.recipientSearch = ctx.$('#recipient-search')?.value || '';
  }
  if (route.page === 'amount') {
    const input = ctx.$('#payment-amount');
    if (input) { d.amountText = input.value; const value = pence(input.value); if (/^\d+(?:\.\d{1,2})?$/.test(input.value) && Number.isSafeInteger(value) && value > 0) d.amount = value; else if (!route.edit) d.amount = 0; }
  }
  if (['recipient','recipient-confirm','conversation','amount','review','pause'].includes(route.page)) d.lastRoute = { ...route };
  remember(ctx);
}
function resumePayment(ctx) {
  const d = ctx.draft.payment;
  if (!pendingPayment(ctx)) return startPayment(ctx);
  if(hasUnresolvedPayment(d)){ctx.closeSheet();ctx.go(payRoute('review'));return;}
  let target = d.serviceId ? (d.lastRoute?.page === 'pause' ? payRoute('pause', { backTo: paymentReviewRoute(d) }) : paymentReviewRoute(d)) : d.lastRoute && !d.lastRoute.edit && ['recipient','recipient-confirm','conversation','amount','review','pause'].includes(d.lastRoute.page)
    ? { ...d.lastRoute } : d.recipient && d.amount > 0 ? paymentReviewRoute(d) : payRoute(d.recipient ? 'amount' : 'recipient');
  if (['momo', 'bank'].includes(d.rail)) {
    d.lookupRequired = true; d.recipientForms ||= {};
    d.recipientForms[d.rail] ||= { number: d.recipient?.number || '', ...(d.rail === 'bank' ? { bank: d.recipient?.bank || '' } : {}) };
    if (!recipientLookupMatches(d, { confirmed: true })) { d.recipient = null; target = payRoute(recipientLookupMatches(d) ? 'recipient-confirm' : 'recipient', { backTo: payRoute('home') }); }
    remember(ctx);
  }
  ctx.setCapture?.(null); ctx.closeSheet(); ctx.go(target);
}
function startPayment(ctx, person = null, rail = 'lumo', force = false, origin = null) {
  if(originalPaymentFirst(ctx))return;
  if(ctx.connected&&['momo','bank'].includes(rail)){ctx.toast('This provider is not connected. Choose a Lumo person or scan a connected merchant.');return;}
  const fresh = () => {
    ctx.setCapture?.(null); const d=resetDraft(ctx, person, rail);if(origin)d.flowOrigin=origin;remember(ctx);
    const conversation = person && rail === 'lumo';
    ctx.go(payRoute(conversation ? 'conversation' : 'recipient', conversation ? { id: person.id, backTo: origin || payRoute('home') } : { backTo: origin || payRoute('home') }));
  };
  if (!force && pendingPayment(ctx)) {
    ctx.sheet(`<h2>Pick up where you left off?</h2><p>Your unfinished payment is saved. No money has moved.</p><div class="stack">${btn('Continue payment','payment-resume')}${btn('Start a new payment','payment-start-again',{secondary:true})}</div>`, el => {
      el.querySelector('[data-action="payment-resume"]').onclick = () => resumePayment(ctx);
      el.querySelector('[data-action="payment-start-again"]').onclick = () => { ctx.closeSheet(); fresh(); };
    }, origin?.page === 'scan' ? { onClose: () => ctx.refresh() } : {}); return;
  }
  fresh();
}
/** Start a repayment draft, never a transfer. The recipient is chosen and verified next. */
export function prepareIOURepayment(ctx, record, amount, rail = 'lumo') {
  if(originalPaymentFirst(ctx))return false;
  if(ctx.connected&&rail!=='lumo'){ctx.toast('Mobile money is not connected. Choose a Lumo person, or record a repayment already made outside Lumo.');return false;}
  const iou = ctx.state.ious?.find(item => item.id === record?.id && item.type === 'owedByMe' && item.status === 'open');
  if (!iou || !['lumo','momo'].includes(rail) || !Number.isSafeInteger(amount) || amount <= 0 || amount > repayableIOUAmount(ctx.state, iou)) { ctx.toast('Check the IOU and any repayment still waiting for confirmation.'); return false; }
  const origin = { section: 'life', page: 'iou-detail', id: iou.id };
  const adopt = () => { ctx.setCapture?.(null); const d = resetDraft(ctx, null, rail); Object.assign(d, { iouId: iou.id, iouName: iou.name, amount, amountText: amountInput(amount), category: 'IOU', note: 'IOU repayment', budgetItemId: iou.budgetItemId || undefined, flowOrigin: origin }); remember(ctx); ctx.closeSheet(); ctx.go(payRoute('recipient', { backTo: origin })); };
  if (pendingPayment(ctx)) { ctx.sheet(`<h2>Use this repayment?</h2><p>Your unfinished payment is saved. Choose which one to continue.</p><div class="stack">${btn('Use this repayment','iou-use-repayment')}${btn('Continue saved payment','iou-resume-payment',{secondary:true})}</div>`, el => { el.querySelector('[data-action="iou-use-repayment"]').onclick = adopt; el.querySelector('[data-action="iou-resume-payment"]').onclick = () => resumePayment(ctx); }); return true; }
  adopt(); return true;
}

function taskHead(title, { editing = false, ...options } = {}) { return pageHead(title, { ...options, action: `<button class="text-button" data-action="${editing ? 'pay-cancel-edit' : 'pay-cancel'}">${editing ? 'Cancel edit' : 'Cancel'}</button>` }); }
function beginPaymentEdit(ctx) { const d = draft(ctx); ctx.draft.paymentEditBackup = structuredClone({...d,lastRoute:ctx.route ? {...ctx.route} : d.lastRoute}); remember(ctx); }
function restorePaymentEdit(payment, backup) { for (const key of Object.keys(payment)) delete payment[key]; Object.assign(payment, structuredClone(backup)); }

/** Leaving an unaccepted recipient edit restores the payment it was editing. */
export function cancelRecipientEditOnExit(session, from, to) {
  const editing = route => route?.section === 'pay' && route.edit === true && ['recipient','recipient-confirm','amount'].includes(route.page);
  const payment = session?.payment, backup = session?.paymentEditBackup;
  if (!editing(from) || editing(to) || !payment || payment.completed || !backup) return false;
  if (backup.idempotencyKey !== undefined && backup.idempotencyKey !== payment.idempotencyKey) return false;
  restorePaymentEdit(payment, backup); delete session.paymentEditBackup; return true;
}
function amountParent(d) { return d.amountBackTo || payRoute('recipient'); }
function serviceReviewParent(d) { return d.serviceId ? payRoute('service', { id: d.serviceId, edit: true, backTo: payRoute('review') }) : payRoute('amount', { backTo: amountParent(d) }); }
function paymentReviewRoute(d) { return payRoute('review', { backTo: d.iouReviewBackTo || serviceReviewParent(d) }); }

function on(ctx, action, fn) { ctx.$$(`[data-action="${action}"]`).forEach(el => el.addEventListener('click', fn)); }
function getTransaction(ctx, id) { return ctx.state.transactions.find(t => t.id === id); }
function recipientLabel(d) { return typeof d.recipient === 'string' ? d.recipient : d.recipient?.name || 'Someone'; }
function railName(rail) { return { lumo: 'Lumo', momo: 'Mobile money', bank: 'Bank transfer', campus: 'Campus Pay', bill: 'Bill payment', airtime: 'Airtime', data: 'Data bundle' }[rail] || 'Lumo'; }
function destinationLabel(d) { return (d.rail === 'momo' ? d.recipient?.network : d.rail === 'bank' ? d.recipient?.bank : '') || railName(d.rail); }
function formError(ctx, message) {
  const node = ctx.$('#payment-error');
  if (node) { node.textContent = message; node.hidden = !message; }
  else if (message) ctx.toast(message);
}
function recipientAvatar(person, size = '') {
  return `<span class="person-avatar ${esc(person?.colour || 'violet')} ${size}">${esc(person?.emoji || person?.name?.charAt(0) || '?')}</span>`;
}
function txAmount(tx) { return `${tx.direction === 'in' ? '+' : '−'}${cash(tx.amount)}`; }
function txRows(transactions) {
  return transactions.map(tx => row({ emoji: tx.type === 'saving' && tx.emoji ? esc(tx.emoji) : icon(categorySymbol(tx.category),22), title: tx.merchant || 'Payment', sub: `${dateLabel(tx.at)}${tx.status && tx.status !== 'success' ? ` · ${tx.status}` : ''}`, right: txAmount(tx), action: `pay-tx:${tx.id}` })).join('');
}
function home(ctx) { return renderPaymentsHub(paymentContext(ctx), ctx.route || payRoute('home')); }
function paymentContext(ctx) {
  const child = Object.create(ctx);
  child.paymentContacts = ctx.connected ? [] : CONTACTS;
  child.topUpShortcuts = id => getTopUpShortcuts(ctx.state, id);
  child.startPayment = (person = null, rail = 'lumo') => startPayment(ctx, person, rail);
  child.canStartPayment = () => !originalPaymentFirst(ctx);
  child.resumePayment = () => resumePayment(ctx);
  child.openFunding = () => openFunding(ctx);
  child.confirmAccountRecipient = () => {
    const d = draft(ctx);
    if (!recipientLookupMatches(d)) return ctx.go(payRoute('recipient'), { replace: true });
    d.recipient = { ...d.recipientLookup.recipient }; d.recipientLookup.confirmed = true;
    const details = payRoute('recipient', { backTo: d.flowOrigin || payRoute('home') });
    d.amountBackTo = payRoute('recipient-confirm', { backTo: details });
    const editing = !!ctx.route?.edit;
    if (editing) delete ctx.draft.paymentEditBackup;
    ctx.setCapture?.(null); remember(ctx);
    if (d.iouId) d.iouReviewBackTo = d.amountBackTo;
    ctx.go(editing || d.iouId && d.amount > 0 ? paymentReviewRoute(d) : payRoute('amount', { backTo: d.amountBackTo }), { replace: editing });
  };
  child.startServicePayment = payment => startServicePayment(ctx, payment);
  const ensureRequest = () => { ctx.draft.collect ||= {amount:0,note:'',from:'',idempotencyKey:nonce('collect')}; };
  child.qrPaymentLink = () => { ensureRequest(); return collectLink(ctx); };
  child.qrCodeMarkup = () => { ensureRequest(); return paymentCode(ctx); };
  child.openQrPayment = parsed => openQrPayment(ctx, parsed);
  child.findQrPerson = () => startPayment(ctx, null, 'lumo', false, { ...ctx.route });
  child.openQrMerchant = (id,options) => { if(ctx.connected)return openSharedMerchant(ctx,id,options);const service=getPaymentService(id);if(isCampusCodeService(service))ctx.go(payRoute('service',{id,backTo:payRoute('home',{hubTab:getServiceHubTab(service)})})); };
  child.enterMerchantCode = () => openMerchantCodeSheet(child);
  child.editQrRequest = () => { if(ctx.connected){createRequestSheet(ctx);return;}ensureRequest(); collectAmountSheet(ctx); };
  child.shareQrCode = () => {const link=collectLink(ctx);return link?shareText(ctx,link,'Pay me with Lumo'):ctx.toast('Reconnect to open your signed-in code.');};
  child.copyQrCode = () => {const link=collectLink(ctx);return link?copyText(ctx,link):ctx.toast('Reconnect to open your signed-in code.');};
  return child;
}
/** A return visit starts a fresh shop payment. Old requests and approvals are never copied. */
export function merchantReturnDestination(tx) {
  return tx?.type==='payment'&&tx.status==='success'&&tx.direction!=='in'&&typeof tx.shopId==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(tx.shopId)?{shopId:tx.shopId}:null;
}
export function payMerchantAgain(ctx,tx) {
  const destination=merchantReturnDestination(tx);if(!ctx.connected||!destination){ctx.toast('Choose a completed merchant payment.');return {ok:false};}
  return openSharedMerchant(ctx,destination);
}

export function openSharedMerchant(ctx,input,{isCurrent=()=>true}={}){return runActionFlow(function*(){
  if(originalPaymentFirst(ctx))return {ok:false,message:'Check your original payment first.'};
  const origin=ctx.route,previous=ctx.draft.payment,version=ctx.shared.authVersion;
  const unchanged=()=>ctx.route===origin&&ctx.draft.payment===previous&&ctx.shared.authVersion===version;
  const current=()=>isCurrent()&&unchanged();
  const value=typeof input==='string'?{query:input}:input||{};
  const quote=(yield ctx.shared.quote(value.shopId?{shopId:value.shopId,...(value.requestId?{requestId:value.requestId}:{}),...(value.testKey?{testKey:value.testKey}:{})}:{query:value.query}));
  if(!current())return {ok:false,cancelled:true};
  if(!quote.ok||!quote.shop?.id){const message=quote.message||'This merchant is unavailable. Check their code and try again.';ctx.toast(message);return {ok:false,message};}
  const name=quote.merchant?.name||quote.shop.name||'Lumo merchant';
  const adopt=(fromChoice=false)=>{
    if(!(fromChoice?unchanged():current()))return;
    const d=resetDraft(ctx,{id:quote.shop.id,name,emoji:name.charAt(0)},'merchant');
    Object.assign(d,{shopId:quote.shop.id,shopName:quote.shop.name||'',shopCode:quote.shop.code||'',shopArea:quote.shop.area||'',...(quote.request?.id?{requestId:quote.request.id}:{}),...(value.testKey?{testKey:value.testKey}:{}),amount:quote.request?.amount||0,amountText:quote.request?.amount?amountInput(quote.request.amount):'',flowOrigin:{...origin},amountBackTo:{...origin},note:quote.request?.note||''});
    remember(ctx);ctx.go(payRoute(d.amount?'review':'amount',{backTo:{...origin}}));
  };
  if(pendingPayment(ctx)){
    let choosing=true;
    ctx.sheet(`<h2>Use this merchant payment?</h2><p>Your unfinished payment is saved. Choose which one to continue.</p><div class="stack">${btn('Use this merchant','merchant-use-payment')}${btn('Continue saved payment','merchant-resume-payment',{secondary:true})}</div>`,el=>{el.querySelector('[data-action="merchant-use-payment"]').onclick=()=>{if(!choosing||!unchanged())return;choosing=false;ctx.closeSheet();adopt(true);};el.querySelector('[data-action="merchant-resume-payment"]').onclick=()=>{if(!choosing||!unchanged())return;choosing=false;resumePayment(ctx);};},{onDispose:()=>{choosing=false;},onClose:()=>ctx.refresh()});
    return {ok:true,choosing:true};
  }
  adopt();return {ok:true};
});}
function openQrPayment(ctx, parsed) {
  if(originalPaymentFirst(ctx))return;
  if(parsed?.type !== 'person' || typeof parsed.name !== 'string' || !parsed.name.trim() || parsed.name.length > 60 || !Number.isSafeInteger(parsed.amount) || parsed.amount < 0 || parsed.amount > 100000000) { ctx.toast('This QR code does not contain a valid Lumo payment.');return; }
  const origin = { ...ctx.route }, adopt = () => {
    ctx.setCapture?.(null);
    const d=resetDraft(ctx,{...(parsed.handle?{handle:parsed.handle}:{}),name:parsed.name.trim(),number:'@'+parsed.name.toLowerCase().replace(/[^a-z0-9]/g,'').slice(0,16),emoji:parsed.name.charAt(0).toUpperCase()},'lumo');
    d.amount=parsed.amount;d.amountText=amountInput(parsed.amount);d.note=String(parsed.note||'').slice(0,140);d.flowOrigin=origin;
    d.amountBackTo=origin;remember(ctx);
    ctx.go(payRoute(d.amount?'review':'amount',{backTo:d.amount?payRoute('amount',{backTo:origin}):origin}));
  };
  if(pendingPayment(ctx)) {
    ctx.sheet(`<h2>Use this QR payment?</h2><p>Your unfinished payment is saved. Choose which one to continue.</p><div class="stack">${btn('Use this QR payment','qr-use-payment')}${btn('Continue saved payment','qr-resume-payment',{secondary:true})}</div>`, el=>{
      el.querySelector('[data-action="qr-use-payment"]').onclick=()=>{ctx.closeSheet();adopt();};
      el.querySelector('[data-action="qr-resume-payment"]').onclick=()=>resumePayment(ctx);
    },{onClose:()=>ctx.refresh()});return;
  }
  adopt();
}
function paymentHubOrigin(d) { if((d?.requestId||d?.iouId)&&d.flowOrigin)return d.flowOrigin; return ['campus','bills'].includes(d?.hubTab) ? payRoute('home', { hubTab: d.hubTab }) : payRoute('home'); }
function startServicePayment(ctx, prepared) {
  if(originalPaymentFirst(ctx))return {ok:false,message:'Check your original payment first.'};
  if(ctx.connected){ctx.toast('This provider is not connected. Use a Lumo person or a connected merchant.');return {ok:false,message:'This provider is not connected.'};}
  const checked = prepareServicePayment(prepared?.service?.id, prepared?.serviceFields || prepared?.fields);
  if (!checked.ok) return checked;
  const p = checked.payment, origin = payRoute('home', { hubTab: getServiceHubTab(p.service) });
  const adopt = () => {
    ctx.setCapture?.(null);
    ctx.draft.payment = { recipient: p.recipient, amount: p.amount, amountText: amountInput(p.amount), category: p.category,
      rail: p.rail, note: p.bundleName || p.service.name, paymentKind: 'service', serviceId: p.service.id,
      serviceFields: { ...p.serviceFields }, reference: p.reference, bundleName: p.bundleName, billerName: p.billerName || '', hubTab: origin.hubTab,
      amountBackTo: payRoute('service', { id: p.service.id, backTo: origin }), idempotencyKey: nonce('service-payment') };
    remember(ctx);ctx.go(payRoute('review', { backTo: payRoute('service', { id: p.service.id, backTo: origin }) }), { replace: !!prepared.editing });
  };
  const saved = ctx.draft.payment;
  const sameServiceDetails = saved?.serviceId === p.service.id && saved.amount === p.amount && JSON.stringify(saved.serviceFields || {}) === JSON.stringify(p.serviceFields || {});
  if (!prepared.editing && pendingPayment(ctx) && !sameServiceDetails) {
    ctx.sheet(`<h2>Start this payment?</h2><p>Your unfinished payment is saved. Choose which one to continue.</p><div class="stack">${btn('Use these service details','service-replace')}${btn('Continue saved payment','service-resume',{secondary:true})}</div>`, el => {
      el.querySelector('[data-action="service-replace"]').onclick = () => { ctx.closeSheet();adopt(); };
      el.querySelector('[data-action="service-resume"]').onclick = () => resumePayment(ctx);
    }, { onClose: () => ctx.refresh() });
    return { ok: true };
  }
  adopt();return { ok: true };
}
function editServicePayment(ctx) {
  const d = draft(ctx), origin = paymentHubOrigin(d);
  ctx.draft.servicePayment ||= {};ctx.draft.servicePayment[d.serviceId] = { ...d.serviceFields };
  ctx.setCapture?.(null);remember(ctx);
  ctx.go(payRoute('service', { id: d.serviceId, edit: true, backTo: payRoute('review') }), { replace: true });
}

function recipients(ctx, route = ctx.route || payRoute('recipient')) {
  const d = draft(ctx);
  const rail = d.rail || 'lumo';
  if (rail === 'momo' || rail === 'bank') return renderAccountRecipient(ctx, route);
  const f = d.recipientForms?.[rail] || d.recipient || {};
  const contacts=ctx.connected?[]:CONTACTS;
  if(ctx.connected)return `<div class="page pay-recipient">${taskHead('Pay someone',{editing:!!ctx.route?.edit})}<div class="content"><h1 class="large-question">Who’s it for?</h1><div class="chips rail-chips" role="group" aria-label="Payment method">${RAILS.map(r=>`<button class="chip ${rail===r.id?'selected':''}" data-rail="${r.id}">${icon(r.icon,17)}${r.label}</button>`).join('')}</div>${renderLumoRecipientDirectory(d)}</div><div class="bottom-action">${btn('Continue','pay-recipient-next')}</div></div>`;
  return `<div class="page pay-recipient">${taskHead('Pay someone',{editing:!!ctx.route?.edit})}
    <div class="content"><h1 class="large-question">Who’s it for?</h1>
    <div class="chips rail-chips" role="group" aria-label="Payment method">${RAILS.map(r => `<button class="chip ${rail === r.id ? 'selected' : ''}" data-rail="${r.id}">${icon(r.icon, 17)}${r.label}</button>`).join('')}</div>
    <label class="search-field">${icon('search', 19)}<input class="input" id="recipient-search" placeholder="Search your people" autocomplete="off" aria-label="Search people" value="${esc(d.recipientSearch || '')}"></label>
    <div class="panel contacts-list">${contacts.map(c => `<button class="row" data-contact="${c.id}" data-person="${esc(c.name.toLowerCase())}">${recipientAvatar(c)}<span class="row-copy"><span class="row-title">${esc(c.name)}</span><span class="row-sub">@${c.id === 'nightmarket' ? 'nightmarket' : c.id} · Lumo</span></span><span class="row-right">${icon('chevron')}</span></button>`).join('')}</div><p class="muted small">Or use a Lumo name below.</p>
    <div class="form-stack">${field({ label: 'Lumo name', name: 'recipientName', value: f.name || '', placeholder: '@kofi' })}</div>
    <p class="error" id="payment-error" role="alert" hidden></p><p class="muted small">Demo recipients. No real account lookup is performed.</p></div>
    <div class="bottom-action">${btn('Continue', 'pay-recipient-next')}</div>
  </div>`;
}
function conversation(ctx, route) {
  const d = draft(ctx);
  const person = d.recipient || CONTACTS.find(c => c.id === route.id) || CONTACTS[0];
  d.recipient = person;
  const name = typeof person === 'string' ? person : person.name;
  const history = ctx.state.transactions.filter(t => t.type === 'payment' && (t.merchant || '').toLowerCase() === name.toLowerCase()).slice().reverse();
  return `<div class="page pay-conversation">${pageHead(name)}<div class="conversation-person">${recipientAvatar(person, 'large')}<p class="muted">${esc(railName(d.rail))} · ${esc(person.number || `@${person.id || name.split(' ')[0].toLowerCase()}`)}</p></div>
    <div class="payment-thread">${history.length ? history.map(t => `<div class="thread-entry ${t.direction === 'in' ? 'received' : 'sent'}"><span class="thread-date">${dateLabel(t.at)}</span><button class="payment-bubble" data-action="pay-tx:${esc(t.id)}"><strong>${cash(t.amount)}</strong><span>${esc(t.note || (t.direction === 'in' ? 'Money received' : 'Sent with Lumo'))}</span><small>${t.status === 'success' ? `${t.direction === 'in' ? 'Received' : 'Paid'} ✓` : esc(t.status)}</small></button>${t.reaction ? `<span class="payment-reaction">${esc(t.reaction)}</span>` : ''}</div>`).join('') : `<div class="thread-empty"><span class="accent">${icon('chat', 32)}</span><p>Your money story<br>with ${esc(name.split(' ')[0])} starts here.</p></div>`}</div>
    <div class="bottom-action">${btn(`Pay ${esc(name.split(' ')[0])}`, 'pay-conversation-send')}<button class="button ghost" data-action="pay-collect-person">Request money</button></div></div>`;
}
function amount(ctx) {
  const d = draft(ctx), sum = getSummary(ctx.state);
  return `<div class="page pay-amount">${taskHead(`To ${recipientLabel(d).split(' ')[0]}`,{editing:!!ctx.route?.edit})}
    <div class="content"><h1 class="large-question">How much?</h1>
    <label class="money-entry"><span>GH₵</span><input class="money-input" id="payment-amount" name="paymentAmount" type="text" inputmode="decimal" autocomplete="off" maxlength="12" placeholder="0" value="${esc(d.amountText ?? amountInput(d.amount))}" aria-label="Payment amount in Ghana cedis"></label>
    <p class="muted balance-hint">${cash(sum.available)} available · <span class="accent">${cash(sum.spendable)} left after plan</span></p>
    <details class="payment-optional-details" ${d.detailsOpen ? 'open' : ''}><summary><span>Plan & note <small>Optional</small></span>${icon('chevron', 18)}</summary><div class="payment-optional-content">
    <div class="section-label"><span>What’s it for?</span></div>
    <div class="chips category-chips">${CATEGORIES.map(c => `<button type="button" class="chip ${d.category === c ? 'selected' : ''}" data-category="${c}" aria-pressed="${d.category === c}">${{ Food: '🍲', Transport: '🚕', Data: '📶', Essentials: '📌', Personal: '✨', Other: '↗' }[c]} ${c}</button>`).join('')}</div>
    ${ctx.state.budget.items.length?`<label class="field"><span>Use this budget</span><select class="input" id="payment-budget-source"><option value="">Match my category</option>${ctx.state.budget.items.map(i=>`<option value="${esc(i.id)}" ${d.budgetItemId===i.id?'selected':''}>${esc(i.name)}</option>`).join('')}</select></label><label class="payment-remember-choice"><input type="checkbox" id="payment-remember-category" ${d.rememberCategory?'checked':''}><span>Use this plan for ${esc(recipientLabel(d).split(' ')[0])} next time</span></label>`:''}<button type="button" class="text-button payment-note-control" data-action="pay-note">${icon('chat',18)} ${d.note ? esc(d.note) : 'Add a note'}</button>
    </div></details>
    <p class="error" id="payment-error" role="alert" hidden></p></div>
    <div class="bottom-action">${btn('Continue', 'pay-amount-next', { disabled: !(d.amount>0 && /^(?:\d+)(?:\.\d{1,2})?$/.test(d.amountText ?? amountInput(d.amount))) })}</div>
  </div>`;
}
function review(ctx) {
  const d = draft(ctx);
  if (!d.recipient || !d.amount) return amount(ctx);
  const fee = paymentFee(d.rail), total = d.amount + fee;
  d.fee = fee;
  const canPay = total <= ctx.state.wallet;
  return `<div class="page pay-review${d.serviceId ? ' service-payment-review' : ''}">${taskHead('Review payment')}
    <div class="content"><h1 class="large-question">${d.serviceId ? 'Ready to go?' : 'All looking right?'}</h1>
    <div class="review-person">${recipientAvatar(d.recipient, 'large')}<div><strong>${esc(recipientLabel(d))}</strong><p class="muted">${esc(destinationLabel(d))}${!d.serviceId && d.recipient?.number ? ` · ${esc(d.recipient.number)}` : ''}</p></div></div>
    ${d.rail==='merchant'?`<div class="panel">${row({title:'Receiving shop',right:esc(d.shopName||'Connected merchant')})}${d.shopCode?row({title:'Merchant code',right:esc(d.shopCode)}):''}${d.shopArea?row({title:'Location',right:esc(d.shopArea)}):''}${d.requestId?row({title:'Payment request',sub:'The merchant confirmed this exact amount',right:cash(d.amount)}):''}</div>`:''}
    <div class="panel review-summary">${row({ emoji: icon('send'), title: 'You’re sending', right: cash(d.amount) })}${row({ emoji: icon('check'), title: 'Demo fee', right: cash(fee) })}${row({ emoji: icon('wallet'), title: 'Total', right: cash(total), className: 'total-row' })}</div>
    ${d.iouId ? `<p class="notice">Towards your IOU with ${esc(ctx.state.ious?.find(item => item.id === d.iouId)?.name || d.iouName || 'this person')}. Only confirmed money reduces what you owe.</p>` : ''}
    ${d.note && !d.serviceId ? `<p class="payment-note">“${esc(d.note)}”</p>` : ''}
    ${!canPay ? `<div class="notice error">${icon('lock', 19)}<span>You need ${cash(total - ctx.state.wallet)} more to make this payment.</span></div>` : ''}
    ${d.serviceId ? `<div class="panel service-review-details">${d.billerName ? row({title:'Biller',right:esc(d.billerName)}) : ''}${d.reference ? row({title:d.rail==='airtime'||d.rail==='data'?'Mobile number':'Payment reference',right:esc(d.reference)}) : ''}${d.bundleName ? row({title:'Demo bundle',right:esc(d.bundleName)}) : ''}</div><button class="button ghost" data-action="pay-edit-amount">Edit details</button>` : d.rail==='merchant'?`<p class="muted small">${d.requestId?'The merchant sets this request amount. Start a different payment to change the receiving shop.':'Check the receiving shop above.'}</p>${d.requestId?'':'<button class="button ghost" data-action="pay-edit-amount">Edit amount</button>'}` : `<details class="payment-review-options"><summary>Edit payment details</summary><div class="inline-actions"><button class="button ghost" data-action="pay-edit-amount">Edit amount</button><button class="button ghost" data-action="pay-edit-recipient">Change recipient</button></div><button class="text-button" data-action="pay-save-favourite">Save as favourite</button></details>`}<details class="parity-demo"><summary>Payment simulation</summary><p class="muted small">No provider is connected. A pending result keeps money held until separately confirmed. Fees are sample pricing.</p><label class="field"><span>Sample result</span><select class="input" id="payment-outcome"><option value="success" ${d.outcome!=='pending'&&d.outcome!=='failed'?'selected':''}>Confirmed</option><option value="pending" ${d.outcome==='pending'?'selected':''}>Pending</option><option value="failed" ${d.outcome==='failed'?'selected':''}>Failed</option></select></label></details><p class="error" id="payment-error" role="alert" hidden></p></div>
    <div class="bottom-action">${btn(canPay ? 'Continue' : 'Add money', canPay ? 'pay-review-next' : 'pay-fund')}</div>
  </div>`;
}
function pause(ctx) {
  const d = draft(ctx), sum = getSummary(ctx.state);
  const check = evaluatePayment(ctx.state, { ...d, fee: paymentFee(d.rail), merchant: recipientLabel(d) });
  const after = Math.max(0, check.afterSpendable ?? sum.spendable - d.amount);
  const baselineGap = check.baselineShortfall ?? Math.max(0, sum.planned + (ctx.state.buffer || 0) - sum.available);
  const totalGap = Math.max(0, -(check.rawAfterSpendable ?? (sum.spendable - d.amount)));
  const touches = check.additionalShortfall ?? Math.max(0, totalGap - baselineGap);
  const planUse = Math.max(0, check.afterPlanned - check.afterAvailable) - Math.max(0, sum.planned - sum.available);
  const reservedFrom = planUse === 0 ? 'cushion' : planUse >= touches ? 'plan' : 'plan and cushion';
  const unchangedGap = baselineGap > 0 && touches === 0;
  const consequence = getPauseTradeoff(ctx.state, { ...d, fee: check.fee, merchant: recipientLabel(d) }, check);
  const context = unchangedGap ? 'This payment leaves that gap unchanged.' : baselineGap > 0 ? `Your plan already has a ${cash(baselineGap)} gap.` : touches === 0 ? check.reason : '';
  return renderPauseScreen({
    amount: d.amount, metric: touches || (unchangedGap ? baselineGap : after), kind: touches > 0 ? 'reserved' : unchangedGap ? 'existing-gap' : 'remaining', reservedFrom, recipient: recipientLabel(d),
    consequence: getPauseConsequence(ctx.state, { ...d, fee: check.fee, merchant: recipientLabel(d) }, check),
    reason: [consequence.copy, context].filter(Boolean).join(' '),
    primary: { label: 'Continue to PIN', attributes: 'data-action="pay-pause-next" aria-busy="true"', disabled: true },
    secondary: { label: 'Edit amount', attributes: 'data-action="pay-edit-amount"' },
    alternatives: renderPauseAlternatives(ctx.state, d, check),
    headerLeft: { label: 'Review', attributes: 'data-action="back"' },
    headerRight: { label: 'Cancel', attributes: 'data-action="pay-cancel"' },
  });
}
export function isCompletedPayment(tx) {
  return tx?.type === 'payment' && tx.direction !== 'in' && tx.status === 'success' && !isOutsideRepayment(tx) && (!tx.serviceId || tx.delivery?.status === 'delivered');
}
function completedPayment(ctx, tx) {
  const delivered = !!tx.serviceId;
  return `<section class="payment-success-screen" aria-labelledby="payment-success-title">
    <header class="payment-success-header"><span class="payment-success-brand" aria-label="Lumo">lumo</span><span class="payment-success-confirmed">${icon('check',15)} All done</span></header>
    <div class="payment-success-main">
      <div class="payment-success-art" aria-hidden="true"><div class="payment-success-ring"></div><div class="payment-success-check">${icon('check',78)}</div>${Array.from({length:12},(_,i)=>`<i class="payment-success-spark" style="--spark-angle:${i*30}deg;--spark-delay:${(i%3)*70}ms"></i>`).join('')}</div>
      <h1 id="payment-success-title">${delivered ? 'All sorted.' : 'Sent. Sorted.'}</h1>
      <p class="payment-success-amount">${cash(tx.amount)}</p>
      <p class="payment-success-recipient">To <strong>${esc(tx.merchant || recipientLabel(draft(ctx)))}</strong></p>
      <p class="payment-success-copy">${delivered ? 'Demo service delivered. You’re good to go.' : 'One less thing. Go enjoy your day.'}</p>
      ${delivered ? '<p class="payment-success-demo">Demo payment · No real service was delivered.</p>' : ''}
    </div>
    <footer class="payment-success-footer"><button type="button" class="payment-success-done" data-action="pay-home">Done ${icon('check',19)}</button><button type="button" class="payment-success-receipt" data-action="pay-detail">View receipt ${icon('arrow',17)}</button></footer>
  </section>`;
}
function status(ctx, route) {
  const tx = getTransaction(ctx, route.id) || ctx.draft.lastPayment;
  if (!tx) return `<div class="page">${pageHead('Payment')}${empty({ emoji: '↗', title: 'Let’s start again.', body: 'There isn’t a payment to show here.', action: 'pay-new', label: 'Make a payment' })}</div>`;
  if (isOutsideRepayment(tx)) return outsideRepaymentRecord(tx);
  if (isCompletedPayment(tx)) return completedPayment(ctx, tx);
  const pending = tx.status === 'pending', failed = tx.status === 'failed', reversed = tx.status === 'reversed';
  const servicePending = tx.status === 'success' && tx.serviceId && tx.delivery?.status !== 'delivered';
  const deliveryFailed = servicePending && tx.delivery?.status === 'failed';
  const title = pending ? 'On its way.' : failed ? 'That didn’t go through.' : reversed ? 'Money returned.' : servicePending ? deliveryFailed ? 'Payment made. Delivery needs help.' : 'Payment made. Awaiting delivery.' : tx.serviceId ? 'Demo service delivered.' : 'Money sent.';
  const statusLabel = pending ? 'Pending' : failed ? 'Unsuccessful' : reversed ? 'Reversed' : servicePending ? deliveryFailed ? 'Delivery issue' : 'Waiting for provider' : 'All done';
  return `<div class="page payment-status">${pageHead('Payment', { back: false })}<div class="content status-content"><div class="status-orbit ${failed ? 'failed' : ''}">${icon(pending || servicePending ? deliveryFailed ? 'info' : 'clock' : failed ? 'close' : 'check', 42)}</div><p class="eyebrow accent">${statusLabel}</p><h1 class="large-question">${title}</h1><p class="amount amount-xl">${cash(tx.amount)}</p><p class="muted">${reversed ? 'The payment amount is back in your everyday account.' : failed ? 'Your available money is unchanged by this payment.' : `To ${esc(tx.merchant || recipientLabel(draft(ctx)))}`}</p>
    ${pending ? '<div class="notice"><span>We’re waiting for the final result. This amount is held so it cannot be spent twice. You can check it in Activity.</span></div>' : failed ? '<div class="notice"><span>Your money is available. Check the recipient details before trying again.</span></div>' : reversed && tx.savingTransfers?.length ? '<div class="notice"><span>Money moved by a Savings Hack stays saved in its Money Box. You can move it back separately.</span></div>' : `<p class="payment-note">${esc(tx.note || 'A little less admin. A little more life.')}</p>`}
    ${tx.serviceId ? '<p class="muted small">Demo payment. No real bill was settled or top-up delivered.</p>' : ''}${pending ? '<button class="button secondary" data-action="pay-check-status">Check payment status</button>' : ''}${paymentOutcomeControls(tx)}${serviceDeliveryControls(tx)}<button class="button ghost" data-action="pay-detail">View payment details</button></div><div class="bottom-action">${btn(failed ? 'Review and try again' : 'Done', failed ? 'pay-retry' : 'pay-home')}</div></div>`;
}
function transaction(ctx, route) {
  const tx = getTransaction(ctx, route.id);
  if (!tx) return `<div class="page">${pageHead('Payment details')}${empty({ emoji: '↗', title: 'Payment not found.', body: 'Head back to Activity to find your latest payments.', action: 'pay-activity', label: 'Open Activity' })}</div>`;
  if (isOutsideRepayment(tx)) return outsideRepaymentRecord(tx);
  const success = tx.status === 'success';
  return `<div class="page transaction-detail">${pageHead('Payment details')}<div class="content"><div class="transaction-hero"><div class="transaction-emoji">${tx.type === 'saving' && tx.emoji ? esc(tx.emoji) : icon(categorySymbol(tx.category),36)}</div><h1>${esc(tx.merchant || 'Payment')}</h1><p class="amount amount-xl ${tx.direction === 'in' ? 'accent' : ''}">${txAmount(tx)}</p><span class="chip ${success ? 'selected' : ''}">${icon(success ? 'check' : tx.status === 'pending' ? 'clock' : 'info', 15)}${esc({ success: 'Completed', pending: 'Pending', failed: 'Unsuccessful', reversed: 'Reversed' }[tx.status] || tx.status)}</span></div>
    <div class="panel">${row({ emoji: icon('calendar'), title: 'When', right: dateLabel(tx.at) })}${row({ emoji: icon('send'), title: 'Via', right: railName(tx.rail) })}${row({ emoji: icon('plan'), title: 'Category', right: esc(tx.category || 'Other') })}${tx.fee?row({title:'Demo fee',right:cash(tx.fee)})+row({title:'Total paid',right:cash(tx.amount+tx.fee)}):''}${tx.billerName ? row({title:'Biller',right:esc(tx.billerName)}) : ''}${tx.reference ? row({title:'Payment reference',right:esc(tx.reference)}) : ''}${tx.bundleName ? row({title:'Demo bundle',right:esc(tx.bundleName)}) : ''}</div>
    ${tx.status === 'reversed' ? `<div class="notice"><span>The payment amount has returned to your everyday account.${tx.savingTransfers?.length ? ' Money moved by a Savings Hack stays saved in its Money Box. You can move it back separately.' : ''}</span></div>` : ''}
    ${tx.note ? `<div class="payment-note">“${esc(tx.note)}”</div>` : ''}
    <div class="section-label"><span>A little reply</span><span class="muted small">${tx.reaction ? 'Tap to change' : 'Make it personal'}</span></div><div class="reaction-chips">${['👍', '❤️', '🙌', '🙏'].map(r => `<button class="reaction-button ${tx.reaction === r ? 'selected' : ''}" data-reaction="${r}" aria-label="React ${r}" aria-pressed="${tx.reaction === r}">${r}</button>`).join('')}</div>
    ${ctx.connected&&merchantReturnDestination(tx)?`<div class="stack"><button class="button primary" data-action="pay-merchant-again">Pay this shop again</button><button class="button ghost" data-action="pay-save-merchant">${(ctx.state.merchantFavorites||[]).some(item=>item.shopId===tx.shopId)?'Remove from favourite shops':'Save this shop'}</button></div>`:''}${tx.type==='payment'&&success?'<button class="button secondary" data-action="pay-split-receipt">Split this expense</button>':''}${paymentOutcomeControls(tx)}${serviceDeliveryControls(tx)}<p class="muted small transaction-reference">Reference ${esc(tx.id)}</p><div class="inline-actions"><button class="button secondary" data-action="pay-share-receipt">${icon('share', 18)} Share receipt</button><button class="button ghost" data-action="pay-help">Need help?</button></div></div></div>`;
}
const outsideRepaymentRail = rail => ({ cash: 'Cash', momo: 'MoMo outside Lumo', bank: 'Bank account outside Lumo', other: 'Another bank or MoMo outside Lumo' })[rail] || 'Outside Lumo';
const isOutsideRepayment = tx => ['iou-manual-receipt','split-manual-receipt','iou-manual-repayment'].includes(tx?.type);
function outsideRepaymentRecord(tx) {
  return `<div class="page transaction-detail">${pageHead('Repayment record')}<div class="content"><div class="transaction-hero"><div class="transaction-emoji">${icon('plan',36)}</div><h1>Outside repayment recorded</h1><p class="amount amount-xl">${cash(tx.amount)}</p><span class="chip">Recorded by you</span></div><div class="notice"><span><strong>Lumo balance unchanged</strong><br>You recorded this ${tx.type === 'split-manual-receipt' ? 'expense-share repayment' : 'IOU repayment'} as ${tx.type === 'iou-manual-repayment' ? 'paid' : 'received'} outside Lumo. Your recorded outside balances can be updated separately.</span></div><div class="panel">${row({title:tx.type === 'iou-manual-repayment' ? 'To' : 'From',right:esc(tx.merchant || 'Repayment')})}${row({title:tx.type === 'iou-manual-repayment' ? 'Paid using' : 'Received in',right:esc(outsideRepaymentRail(tx.rail))})}${tx.type === 'split-manual-receipt' && tx.note ? row({title:'Expense',right:esc(tx.note)}) : ''}${row({title:'Recorded on',right:dateLabel(tx.at)})}</div><p class="muted small transaction-reference">Record reference ${esc(tx.id)}</p><div class="inline-actions"><button class="button secondary" data-action="pay-share-receipt">${icon('share',18)} Share record</button><button class="button ghost" data-action="pay-help">Need help?</button></div></div></div>`;
}
export function paymentReceiptText(tx) {
  if (isOutsideRepayment(tx)) return `Outside repayment recorded\n${tx.type === 'iou-manual-repayment' ? 'To' : 'From'} ${tx.merchant || 'Repayment'}\n${cash(tx.amount)}\n${tx.type === 'iou-manual-repayment' ? 'Paid using' : 'Received in'} ${outsideRepaymentRail(tx.rail)}${tx.type === 'split-manual-receipt' && tx.note ? '\nExpense: ' + tx.note : ''}\nRecorded by you · ${dateLabel(tx.at)}\nLumo balance unchanged. Recorded outside balances are unchanged.\nRecord reference ${tx.id}`;
  return `Lumo payment\n${tx.merchant}${tx.billerName ? '\n' + tx.billerName : ''}\n${cash(tx.amount)}\n${tx.status}\n${dateLabel(tx.at)}\nReference ${tx.id}${tx.status === 'reversed' ? '\nPayment amount returned to the everyday account.' : ''}${tx.status === 'reversed' && tx.savingTransfers?.length ? '\nSeparate Savings Hack money remains saved in its Money Box.' : ''}`;
}
function paymentOutcomeControls(tx){if(tx.type!=='payment')return '';return tx.status==='pending'?'<details class="parity-demo"><summary>Provider simulation</summary><p class="muted small">A check leaves the payment pending. Choose a confirmed provider outcome here.</p><button class="button secondary" data-action="pay-simulate-success">Confirm payment</button><button class="button secondary" data-action="pay-simulate-failed">Fail payment and release hold</button></details>':tx.status==='success'?'<details class="parity-demo"><summary>Reversal simulation</summary><p class="muted small">Return this confirmed payment once. Separate saving transfers stay saved.</p><button class="button secondary" data-action="pay-simulate-reversed">Simulate reversal</button></details>':'';}
function serviceDeliveryControls(tx){if(!tx.serviceId||tx.status!=='success')return '';const delivery=tx.delivery||{status:'pending'};return `<div class="panel service-delivery"><h2>${delivery.status === 'failed' ? 'Let’s sort this out.' : 'Service delivery'}</h2><p>${esc({pending:'Waiting for the provider.',delivered:'Demo service delivered.',failed:'Delivery failed. Your payment remains recorded.'}[delivery.status]||delivery.status)}</p>${delivery.status==='failed'?'<button class="button secondary" data-action="pay-help">Get help with this payment</button><p class="muted small">Don’t pay again while we check. Your payment has not been refunded.</p>':''}${delivery.token?`<p class="muted small">Sample ECG token</p><strong>${esc(delivery.token)}</strong>`:''}<button class="button ghost" data-action="pay-delivery-check">Check delivery</button>${delivery.status!=='delivered'?'<details class="parity-demo"><summary>Delivery simulation</summary><button class="button secondary" data-action="pay-delivery-success">Confirm delivery</button><button class="button secondary" data-action="pay-delivery-failed">Fail delivery</button></details>':''}<p class="muted small">No real electricity token, airtime or bundle is issued.</p></div>`;}
function paymentCode(ctx) {
  const link=collectLink(ctx);if(!link)return '<p role="status">Reconnect to show your signed-in Lumo code.</p>';
  const code = qrcode(0, 'M');
  code.addData(link, 'Byte');
  code.make();
  return code.createSvgTag({ cellSize: 4, margin: 16, scalable: true, title: 'Your Lumo payment code', alt: 'Scan with a phone camera to open your Lumo payment request.' });
}
function collect(ctx) {
  ctx.draft.collect ||= { amount: 0, note: '', from: '', idempotencyKey: nonce('collect') };
  const c = ctx.draft.collect;
  const name = ctx.state.profile?.name || 'Ama';
  const handle = ctx.connected?'@'+(ctx.shared?.account?.handle||''): `@${name.toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 16) || 'ama'}`;
  return `<div class="page collect-page">${pageHead('Collect')}<div class="content"><h1 class="large-question">Your money.<br>Your way back.</h1><div class="personal-code">${paymentCode(ctx)}</div><p class="code-name">${esc(name)} <span class="accent">${esc(handle)}</span></p><p class="muted small code-caption">${ctx.connected?'Your personal code has no amount. The sender chooses an amount, reviews your identity and confirms.':'Scan with a phone camera to open this demo payment request.'}</p>
    ${ctx.connected?'':`<button class="row panel" data-action="collect-amount"><span class="row-icon">${icon('plus')}</span><span class="row-copy"><span class="row-title">${c.amount ? cash(c.amount) : 'Add an amount'}</span><span class="row-sub">${c.note ? esc(c.note) : 'Let them know what it’s for'}</span></span>${icon('chevron')}</button>`}
    <button class="button secondary" data-action="collect-request">Ask one person</button><button class="button ghost" data-action="collect-requests">View sent and received requests</button><button class="button ghost" data-action="collect-track">Track money someone owes you ${icon('arrow', 17)}</button><p class="muted small">A request is expected money. Your balance changes only when money arrives.</p></div><div class="bottom-action">${btn(`${icon('share', 18)} Share payment link`, 'collect-share')}<button class="button ghost" data-action="collect-copy">Copy link</button></div></div>`;
}
function fundingStatus(ctx, route) {
  const tx = getTransaction(ctx, route.id) || ctx.draft.lastFunding;
  return `<div class="page payment-status">${pageHead('Add money', { back: false })}<div class="content status-content"><div class="status-orbit">${icon('check', 42)}</div><p class="eyebrow accent">A fresh start</p><h1 class="large-question">Money’s here.</h1><p class="amount amount-xl">${cash(tx?.amount || 0)}</p><p class="muted">Added to your everyday account.</p><p class="muted small">Simulated top-up. No real money moved.</p><div class="panel">${row({ emoji: '↙', title: tx?.merchant || 'Mobile money', sub: 'Available now', right: icon('check') })}</div></div><div class="bottom-action">${btn(ctx.draft.fundingReturnTo?.section === 'pay' && ctx.draft.fundingReturnTo?.page === 'review' ? 'Back to payment' : 'Back to your money', 'fund-done')}</div></div>`;
}

export function renderPayments(ctx, route) {
  if(hasUnresolvedPayment(ctx.draft.payment)&&['recipient','recipient-confirm','conversation','amount','review','pause','status'].includes(route.page))return unresolvedPaymentView(ctx);
  if(ctx.connected&&route.page==='service'){
    const service=getPaymentService(route.id);
    return `<section class="page">${pageHead(service?.name||'Payment service')}<h1 class="large-question">${service?.type==='campus'?'Use the merchant’s connected code.':'This provider is not connected.'}</h1><p class="muted">${service?.type==='campus'?'This is a sample campus listing. Scan the shop’s Lumo QR or enter its merchant code to check the receiving shop and amount.':'Top-ups and bills cannot complete in this shared test. No payment details have been submitted.'}</p><div class="bottom-action">${btn('Scan a merchant QR','provider-scan')}${btn('Back to Payments','provider-back',{secondary:true})}</div></section>`;
  }
  switch (route.page || 'home') {
    case 'requests': case 'request-detail': case 'splits': case 'split-detail': case 'funding-detail': return renderPaymentParity(paymentContext(ctx), route);
    case 'service': return renderPaymentService(paymentContext(ctx), route);
    case 'recipients-list': case 'cards': return renderPaymentExtras(paymentContext(ctx), route);
    case 'recipient': return recipients(ctx, route);
    case 'recipient-confirm': return renderAccountRecipient(ctx, route);
    case 'conversation': return conversation(ctx, route);
    case 'amount': return amount(ctx);
    case 'review': return review(ctx);
    case 'pause': return pause(ctx);
    case 'status': return status(ctx, route);
    case 'transaction': return transaction(ctx, route);
    case 'collect': return collect(ctx);
    case 'scan': return renderQrScreen(paymentContext(ctx), route);
    case 'fund-status': return fundingStatus(ctx, route);
    default: return renderPaymentsHub(paymentContext(ctx), route);
  }
}

function unresolvedPaymentView(ctx){
  const d=ctx.draft.payment,submitted=d.submittedPayload||d;
  if(ctx.connected&&d.submissionOwnerId!==ctx.shared?.user?.id)return `<section class="page">${pageHead('Original payment',{back:false})}<h1 class="large-question">Use the original account.</h1><p>This saved request cannot be checked from this account. Sign in to the account that reviewed it. No payment has been submitted from this account.</p><div class="bottom-action">${btn('Back to Payments','pay-unknown-leave')}</div></section>`;
  return `<section class="page payment-status">${pageHead('Checking your payment',{back:false})}<div class="content status-content"><div class="status-orbit">${icon('clock',42)}</div><h1 class="large-question">Let’s check the original.</h1><p class="amount amount-xl">${cash(submitted.amount)}</p><p>To ${esc(submitted.merchant||recipientLabel(submitted))}</p><div class="notice" role="status">The result is not confirmed. This payment may already have completed. Check this original request before making another payment.</div><p class="transaction-reference">Reference ${esc(d.submissionAttemptId||submitted.idempotencyKey||d.idempotencyKey)}</p><p class="error" id="payment-error" role="alert"></p></div><div class="bottom-action">${btn('Check original payment','pay-check-original',{disabled:paymentSubmissions.has(d)})}${btn('Back to Payments','pay-unknown-leave',{secondary:true})}</div></section>`;
}

function submitReviewedPayment(ctx,d){return runActionFlow(function*(){
  if(d.completed||ctx.draft.payment!==d||paymentSubmissions.has(d))return;
  const owner=ctx.shared?.user?.id,version=ctx.shared?.authVersion;
  if(ctx.connected&&hasUnresolvedPayment(d)&&d.submissionOwnerId!==owner){ctx.toast('Sign in to the original account to check this request.');ctx.refresh?.();return;}
  const wasUnresolved=hasUnresolvedPayment(d);
  const payload=d.submittedPayload||{...d,fee:paymentFee(d.rail),merchant:recipientLabel(d),status:d.outcome||'success'};
  for(const key of ['submittedPayload','submissionState','submissionAttemptId','submissionOwnerId','lastSubmissionError'])delete payload[key];
  d.submittedPayload=structuredClone(payload);d.submissionState='submitting';if(ctx.connected)d.submissionOwnerId=owner;
  if(ctx.connected&&ctx.savePaymentRecovery?.(d)===false){
    if(wasUnresolved)d.submissionState='unknown';else{delete d.submissionState;delete d.submittedPayload;delete d.submissionOwnerId;}
    remember(ctx);ctx.toast('Lumo could not safely save this request for recovery. No new request was sent. Try again when browser saving is available.');return;
  }
  remember(ctx);paymentSubmissions.add(d);
  if(ctx.connected)ctx.refresh?.();
  let result;
  try{result=(yield (ctx.actAsync||ctx.act).call(ctx,'payment',structuredClone(d.submittedPayload)));}
  catch{result={ok:false,unknown:true,message:'The result is not confirmed. Check this original payment again.'};}
  finally{paymentSubmissions.delete(d);}
  if(ctx.draft.payment!==d||ctx.shared?.user?.id!==owner||ctx.shared?.authVersion!==version)return;
  if(!result.ok){
    if(result.unknown){d.submissionState='unknown';d.submissionAttemptId=result.attemptId||d.submissionAttemptId;d.lastSubmissionError=result.message;}
    else{delete d.submissionState;delete d.submittedPayload;delete d.submissionAttemptId;delete d.submissionOwnerId;d.idempotencyKey=nonce('payment');}
    remember(ctx);ctx.toast(result.message||'We couldn’t complete that payment.');ctx.go(paymentReviewRoute(d));return;
  }
  const tx=result.transaction||getTransaction(ctx,result.id);
  if(!tx){d.submissionState='unknown';remember(ctx);ctx.toast('The service replied, but the receipt is not available yet. Check the original payment.');ctx.go(paymentReviewRoute(d));return;}
  ctx.draft.lastPayment=tx;d.completed=true;d.lastTransactionId=tx.id||result.id;delete d.submissionState;delete d.submittedPayload;delete d.submissionAttemptId;delete d.submissionOwnerId;remember(ctx);
  if(ctx.route?.section==='pay')finish(ctx,payRoute('status',{id:tx.id||result.id,backTo:payRoute('home')}));else ctx.toast('Your original payment result is available in Activity.');
});}

function noteSheet(ctx) {
  const d = draft(ctx);
  ctx.sheet(`<div class="content"><p class="eyebrow">A little context</p><h2 class="large-question">What’s the<br>story?</h2>${field({ label: 'Payment note', name: 'paymentNote', value: d.noteDraft ?? d.note, placeholder: 'e.g. Thanks for lunch 🙌' })}<div class="sheet-actions">${btn('Save note', 'save-note')}</div></div>`, el => {
    el.querySelector('[name="paymentNote"]').addEventListener('input', e => { d.noteDraft = e.target.value; remember(ctx); });
    el.querySelector('[data-action="save-note"]').addEventListener('click', () => { d.note = el.querySelector('[name="paymentNote"]').value.trim().slice(0, 140); delete d.noteDraft; remember(ctx); ctx.closeSheet(); ctx.refresh(); });
  });
}
 function authenticatePayment(ctx) {return runActionFlow(function*(){
  const d = draft(ctx);
  if(hasUnresolvedPayment(d)){ctx.go(payRoute('review'));return;}
  const origin=ctx.route,version=ctx.shared?.authVersion;
  if(ctx.connected){
    if(!['lumo','merchant'].includes(d.rail)){ctx.toast('This provider is not connected. Use a registered Lumo account or a connected merchant.');return;}
    if(d.rail==='lumo'&&d.requestId){const request=ctx.state.moneyRequests?.find(item=>item.id===d.requestId&&item.direction==='incoming');if(!request){ctx.toast('This request is no longer available.');return;}d.recipient={id:request.senderUserId,name:request.name,emoji:request.name.charAt(0)};}
    else if(d.rail==='lumo'){const found=(yield ctx.shared.resolve(d.recipient?.handle||d.recipient?.number||d.recipient?.name));if(ctx.route!==origin||ctx.draft.payment!==d||ctx.shared?.authVersion!==version)return;if(!found.ok){ctx.toast(found.message);ctx.go(payRoute('recipient'));return;}d.recipient={...found.recipient,number:'@'+found.recipient.handle,emoji:found.recipient.name.charAt(0)};}
  }
  if (d.lookupRequired && !recipientLookupMatches(d, { confirmed: true })) return ctx.go(payRoute('recipient'), { replace: true });
  ctx.auth({ title: d.serviceId ? `Pay ${cash(d.amount)} for ${recipientLabel(d)}` : `Send ${cash(d.amount)} to ${recipientLabel(d).split(' ')[0]}`, onCancel: () => { ctx.refresh(); }, onSuccess: () => {return runActionFlow(function*(){
    if (d.completed || ctx.draft.payment !== d) return;
    if (d.lookupRequired && !recipientLookupMatches(d, { confirmed: true })) return ctx.go(payRoute('recipient'), { replace: true });
    (yield submitReviewedPayment(ctx,d));
  });} });
});}

export function bindPayments(ctx, route) {
  if(hasUnresolvedPayment(ctx.draft.payment)&&['recipient','recipient-confirm','conversation','amount','review','pause','status'].includes(route.page)){
    on(ctx,'pay-check-original',()=>{const d=ctx.draft.payment;if(paymentSubmissions.has(d))return;if(ctx.connected&&d.submissionOwnerId!==ctx.shared?.user?.id){ctx.toast('Sign in to the original account to check this request.');return;}ctx.auth({title:'Check your original payment',onCancel:()=>ctx.refresh(),onSuccess:()=>submitReviewedPayment(ctx,d)});});
    on(ctx,'pay-unknown-leave',()=>{remember(ctx);ctx.go(payRoute('home'));});return;
  }
  if(ctx.connected&&route.page==='service'){
    on(ctx,'provider-scan',()=>ctx.go(payRoute('scan',{backTo:payRoute('home',{hubTab:'campus'})})));
    on(ctx,'provider-back',()=>ctx.go(payRoute('home',{hubTab:getServiceHubTab(getPaymentService(route.id))})));return;
  }
  if (['requests','request-detail','splits','split-detail','funding-detail'].includes(route.page)) return bindPaymentParity(paymentContext(ctx), route);
  if (!route.page || route.page === 'home') return bindPaymentsHub(paymentContext(ctx), route);
  if (route.page === 'scan') return bindQrScreen(paymentContext(ctx), route);
  if (route.page === 'service') return bindPaymentService(paymentContext(ctx), route);
  if (['recipients-list','cards'].includes(route.page)) return bindPaymentExtras(paymentContext(ctx), route);
  ctx.setCapture?.(() => capturePayment(ctx, route));
  on(ctx, 'pay-new', () => startPayment(ctx));
  on(ctx, 'pay-campus-home', () => ctx.go(payRoute('home', {hubTab:'campus'})));
  on(ctx, 'pay-resume', () => resumePayment(ctx));
  on(ctx, 'pay-cancel-edit', () => { const d=draft(ctx), backup=ctx.draft.paymentEditBackup; if(backup)restorePaymentEdit(d,backup); delete ctx.draft.paymentEditBackup; ctx.setCapture?.(null); ctx.go(payRoute('review',{backTo:payRoute('amount',{backTo:amountParent(d)})}),{replace:true}); });
  on(ctx, 'pay-cancel', () => { capturePayment(ctx, route); const unresolved=hasUnresolvedPayment(ctx.draft.payment);ctx.go(paymentHubOrigin(ctx.draft.payment), { replace: true }); ctx.toast(unresolved?'Your original payment is saved. Its result still needs confirmation.':'Payment saved for later. No money moved.'); });
  on(ctx, 'pay-collect', () => ctx.go(payRoute('collect')));
  on(ctx, 'pay-scan', () => ctx.go(payRoute('scan')));
  on(ctx, 'pay-fund', () => openFunding(ctx));
  on(ctx, 'pay-activity', () => ctx.go({ section: 'activity', page: 'home' }));
  on(ctx, 'pay-help', () => ctx.go({ section: 'life', page: 'account-support-new', transactionId: route.id, returnTo: {...route} }));
  if (route.page === 'recipient-confirm' || (route.page === 'recipient' && ['momo','bank'].includes(draft(ctx).rail))) return bindAccountRecipient(paymentContext(ctx), route);
  ctx.$$('[data-contact]').forEach(el => el.addEventListener('click', () => { const person = CONTACTS.find(c => c.id === el.dataset.contact); if (person) { if (route.page === 'recipient' && (route.edit || draft(ctx).iouId)) { const d = draft(ctx); d.recipient = { ...person }; if(d.iouId)d.iouReviewBackTo=payRoute('recipient',{backTo:d.flowOrigin}); delete ctx.draft.paymentEditBackup; ctx.setCapture?.(null); remember(ctx);ctx.go(paymentReviewRoute(d), { replace: !!route.edit }); } else startPayment(ctx, { ...person }, 'lumo', false, ctx.draft.payment?.flowOrigin || null); } }));
  ctx.$$('[data-action^="pay-tx:"]').forEach(el => el.addEventListener('click', () => ctx.go(payRoute('transaction', { id: el.dataset.action.slice(7), returnTo: { ...route }, backTo: { ...route } }))));

  if (route.page === 'recipient') {
    const d = draft(ctx);
    ctx.$$('[data-rail]').forEach(el => el.addEventListener('click', () => {
      const newRail = el.dataset.rail;
      if (newRail !== d.rail && RAILS.some(rail => rail.id === newRail)) { capturePayment(ctx, route); d.rail = newRail; d.recipient = null; d.lookupRequired = newRail !== 'lumo'; delete d.recipientLookup; ctx.setCapture?.(null); remember(ctx); ctx.refresh(); }
    }));
    if(ctx.connected)return bindLumoRecipientDirectory(ctx,route,{onContinue:person=>{
      d.recipient=person;d.amountBackTo=d.flowOrigin?payRoute('recipient',{backTo:d.flowOrigin}):payRoute('recipient');
      if(route.edit)delete ctx.draft.paymentEditBackup;if(d.iouId)d.iouReviewBackTo=d.amountBackTo;ctx.setCapture?.(null);remember(ctx);
      ctx.go(route.edit||d.iouId&&d.amount>0?paymentReviewRoute(d):payRoute('amount',{backTo:d.amountBackTo}),{replace:!!route.edit});
    }});
    ctx.$$('[name="recipientName"], [name="recipientNumber"], [name="recipientNetwork"], [name="recipientBank"]').forEach(el => { el.addEventListener('input', () => capturePayment(ctx, route)); el.addEventListener('change', () => capturePayment(ctx, route)); });
    ctx.$('#recipient-search')?.addEventListener('input', event => { d.recipientSearch = event.target.value; remember(ctx); const term = event.target.value.toLowerCase(); ctx.$$('[data-person]').forEach(el => { el.hidden = !el.dataset.person.includes(term); }); });
    on(ctx, 'pay-recipient-next',  () => {return runActionFlow(function*(){
      const name = ctx.$('[name="recipientName"]')?.value.trim();
      const number = ctx.$('[name="recipientNumber"]')?.value.trim() || name;
      if (!name || name.length < 2) return formError(ctx, 'Tell us who you’re paying.');
      if (d.rail === 'momo' && !/^0\d{9}$/.test(number.replace(/\s/g, ''))) return formError(ctx, 'Use a 10-digit Ghanaian mobile number, starting with 0.');
      if (d.rail === 'bank' && !/^\d{8,16}$/.test(number.replace(/\s/g, ''))) return formError(ctx, 'Check the account number. It should have 8–16 digits.');
      if(ctx.connected){const found=(yield ctx.shared.resolve(name));if(!found.ok)return formError(ctx,found.message);d.recipient={...found.recipient,number:'@'+found.recipient.handle,emoji:found.recipient.name.charAt(0)};}
      else d.recipient = { name: name.replace(/^@/, ''), number, emoji: name.replace(/^@/, '').charAt(0).toUpperCase(), network: ctx.$('[name="recipientNetwork"]')?.value, bank: ctx.$('[name="recipientBank"]')?.value };
      d.amountBackTo = d.flowOrigin ? payRoute('recipient',{backTo:d.flowOrigin}) : payRoute('recipient'); if(route.edit)delete ctx.draft.paymentEditBackup; ctx.setCapture?.(null); remember(ctx);
      if(d.iouId)d.iouReviewBackTo=d.amountBackTo;
      ctx.go(route.edit || d.iouId && d.amount > 0 ? paymentReviewRoute(d) : payRoute('amount', { backTo: d.amountBackTo }), { replace: !!route.edit });
    });});
  }
  if (route.page === 'conversation') {
    on(ctx, 'pay-conversation-send', () => { let d = draft(ctx); const person = d.recipient, rail = d.rail; if (d.completed) { ctx.setCapture?.(null); d = resetDraft(ctx, person, rail); } d.amountBackTo = payRoute('conversation', { id: route.id || person?.id, backTo: d.flowOrigin || payRoute('home') }); remember(ctx); ctx.go(payRoute('amount', { backTo: d.amountBackTo })); });
    on(ctx, 'pay-collect-person', () => { ctx.draft.collect = { amount: 0, note: '', from: recipientLabel(draft(ctx)), idempotencyKey: nonce('collect') }; ctx.go(payRoute('collect')); });
  }
  if (route.page === 'amount') {
    const optionalDetails = ctx.$('.payment-optional-details');
    optionalDetails?.addEventListener('toggle', () => { draft(ctx).detailsOpen = optionalDetails.open; remember(ctx); });
    ctx.$('#payment-budget-source')?.addEventListener('change',e=>{draft(ctx).budgetItemId=e.target.value||undefined;remember(ctx);});
    ctx.$('#payment-remember-category')?.addEventListener('change',e=>{draft(ctx).rememberCategory=e.target.checked;remember(ctx);});
    const d = draft(ctx), input = ctx.$('#payment-amount');
    input?.addEventListener('input', () => {
      const clean = input.value.replace(/[^\d.]/g, '');
      if (clean !== input.value) input.value = clean;
      d.amountText = clean; const valid = /^\d+(?:\.\d{1,2})?$/.test(clean) && Number.isSafeInteger(pence(clean)) && pence(clean)>0; if(valid)d.amount=pence(clean); else if(!route.edit)d.amount=0; remember(ctx);
      const next = ctx.$('[data-action="pay-amount-next"]');
      if (next) next.disabled = !valid;
      formError(ctx, '');
    });
    ctx.$$('[data-category]').forEach(el => el.addEventListener('click', () => { d.category = el.dataset.category; d.categoryExplicit = true; remember(ctx); ctx.$$('[data-category]').forEach(chip => { chip.classList.toggle('selected', chip === el); chip.setAttribute('aria-pressed', String(chip === el)); }); }));
    on(ctx, 'pay-note', () => noteSheet(ctx));
    on(ctx, 'pay-amount-next', () => {
      if (!d.recipient) return ctx.go(payRoute('recipient'));
      if (!/^(?:\d+)(?:\.\d{1,2})?$/.test(input?.value || '') || d.amount <= 0 || !Number.isSafeInteger(d.amount)) return formError(ctx, 'Enter an amount with up to two decimal places.');
      if (d.amount > 100000000) return formError(ctx, 'Try a smaller amount for this demo.');
      if(route.edit)delete ctx.draft.paymentEditBackup;
      ctx.go(payRoute('review', { backTo: payRoute('amount', { backTo: amountParent(d) }) }), { replace: !!route.edit });
    });
  }
  if (route.page === 'review' || route.page === 'pause') on(ctx, 'pay-edit-amount', () => { if(draft(ctx).rail==='merchant'&&draft(ctx).requestId){ctx.toast('The merchant sets this exact request amount.');return;}if(draft(ctx).serviceId)return editServicePayment(ctx);beginPaymentEdit(ctx); ctx.go(payRoute('amount', { edit: true, backTo: payRoute('review', { backTo: payRoute('amount', { backTo: amountParent(draft(ctx)) }) }) }), { replace: true }); });
  if (route.page === 'review') ctx.$('#payment-outcome')?.addEventListener('change', e => { draft(ctx).outcome=e.target.value; remember(ctx); });
  if (route.page === 'review') on(ctx, 'pay-save-favourite', () => {return runActionFlow(function*(){ const d=draft(ctx), result=(yield (ctx.actAsync||ctx.act).call(ctx,'savePaymentFavorite',{rail:d.rail,recipient:d.recipient}));ctx.toast(result.ok?'Saved to Favourites.':result.message); });});
  if (route.page === 'review') on(ctx, 'pay-edit-recipient', () => { if(draft(ctx).rail==='merchant'){ctx.toast('Start a different payment to choose another receiving shop.');return;}beginPaymentEdit(ctx); ctx.go(payRoute('recipient', { edit: true, backTo: payRoute('review') }), { replace: true }); });
  if (route.page === 'review') on(ctx, 'pay-review-next', () => {return runActionFlow(function*(){
    const d = draft(ctx),version=ctx.shared?.authVersion;
    if(ctx.connected&&d.rail==='merchant'){
      const selected=ctx.draft.payment,quote=yield ctx.shared.quote({shopId:d.shopId,...(d.requestId?{requestId:d.requestId}:{}),...(d.testKey?{testKey:d.testKey}:{})});
      if(ctx.draft.payment!==selected||ctx.shared.authVersion!==version||ctx.route!==route)return;
      if(!quote?.ok||quote.shop?.id!==d.shopId)return formError(ctx,quote?.message||'This shop or payment request is unavailable. Open the merchant again.');
      const name=quote.merchant?.name||quote.shop.name;
      if(name!==d.recipient?.name||quote.shop.name!==(d.shopName||'')||(quote.shop.code||'')!==(d.shopCode||'')||!!quote.request!==!!d.requestId||quote.request&&quote.request.amount!==d.amount)return formError(ctx,'This merchant’s details changed. Open the shop again and review the current details.');
    }
    if (d.lookupRequired && !recipientLookupMatches(d, { confirmed: true })) return ctx.go(payRoute('recipient'), { replace: true });
    if (d.amount + paymentFee(d.rail) > ctx.state.wallet) return formError(ctx, 'Add enough money before continuing.');
    const check = evaluatePayment(ctx.state, { ...d, fee: paymentFee(d.rail), merchant: recipientLabel(d) });
    if (check.needed) { d.pauseStarted = Date.now(); ctx.go(payRoute('pause', { backTo: paymentReviewRoute(d) })); }
    else authenticatePayment(ctx);
  });});
  if (route.page === 'pause') {
    const pauseDraft=draft(ctx), pauseEvaluation=evaluatePayment(ctx.state,{...pauseDraft,fee:paymentFee(pauseDraft.rail),merchant:recipientLabel(pauseDraft)});
    bindPauseAlternatives(ctx,ctx.$('.pause-screen'),{draft:pauseDraft,evaluation:pauseEvaluation,onFund:shortfall=>openFunding(ctx,{source:'MTN MoMo',number:ctx.state.profile.phone,amountText:(shortfall/100).toFixed(2),idempotencyKey:nonce('fund'),returnTo:payRoute('review')})});
    const d = draft(ctx), button = ctx.$('[data-action="pay-pause-next"]'), counter = ctx.$('.pause-gate');
    d.pauseStarted = Date.now();
    const timer = setInterval(() => {
      if (!button?.isConnected) return clearInterval(timer);
      const remaining = Math.max(0, Math.ceil((3000 - (Date.now() - d.pauseStarted)) / 1000));
      if (counter && !remaining) counter.textContent = 'You can continue the payment.';
      if (!remaining) { button.disabled = false; button.removeAttribute('aria-busy'); clearInterval(timer); }
    }, 150);
    on(ctx, 'pay-pause-next', () => { if (Date.now() - d.pauseStarted >= 3000) authenticatePayment(ctx); });
  }
  if (route.page === 'status') {
    on(ctx, 'pay-home', () => { ctx.draft.payment = null; remember(ctx); finish(ctx, { section: 'home', page: 'home' }); });
    on(ctx, 'pay-done', () => { const origin=paymentHubOrigin(ctx.draft.payment || ctx.draft.lastPayment);ctx.draft.payment = null;finish(ctx, origin); });
    on(ctx, 'pay-detail', () => ctx.go(payRoute('transaction', { id: route.id || ctx.draft.lastPayment?.id, returnTo: { ...route }, backTo: { ...route } })));
    on(ctx, 'pay-retry', () => {
      const tx=getTransaction(ctx,route.id||ctx.draft.lastPayment?.id);if(!tx||tx.status!=='failed')return ctx.toast('Only an unsuccessful payment can be retried.');
      if(tx.iouId&&!ctx.state.ious?.some(i=>i.id===tx.iouId&&i.type==='owedByMe'&&i.status==='open')){ctx.toast('This IOU has changed. Review it before paying again.');return ctx.go({section:'life',page:'iou-detail',id:tx.iouId});}
      if(ctx.connected&&tx.shopId)return openSharedMerchant(ctx,{shopId:tx.shopId});
      const d=prepareFailedPaymentRetry(tx);ctx.draft.payment=d;
      remember(ctx);finish(ctx,d.lookupRequired?payRoute('recipient',{backTo:payRoute('status',{id:tx.id})}):paymentReviewRoute(d));
    });
    on(ctx, 'pay-check-status', () => {return runActionFlow(function*(){
      const id = route.id || ctx.draft.lastPayment?.id;
      const result = (yield (ctx.actAsync||ctx.act).call(ctx,'checkPaymentOutcome', { id }));
      if (!result.ok) return ctx.toast(result.message || 'We’re still checking this payment.');
      ctx.draft.lastPayment = getTransaction(ctx, id); ctx.refresh(); ctx.toast(result.message);
    });});
  }
  if (['transaction','status'].includes(route.page)) {
    for(const outcome of ['success','failed','reversed']) on(ctx,`pay-simulate-${outcome}`,()=>{return runActionFlow(function*(){const result=(yield (ctx.actAsync||ctx.act).call(ctx,'simulatePaymentOutcome',{id:route.id||ctx.draft.lastPayment?.id,status:outcome,idempotencyKey:nonce('payment-result')}));if(result.ok)ctx.refresh();ctx.toast(result.message);});});
    on(ctx,'pay-delivery-check',()=>{return runActionFlow(function*(){const result=(yield (ctx.actAsync||ctx.act).call(ctx,'checkServiceDelivery',{id:route.id}));ctx.toast(result.message);});});
    on(ctx,'pay-delivery-success',()=>{return runActionFlow(function*(){const result=(yield (ctx.actAsync||ctx.act).call(ctx,'simulateServiceDelivery',{id:route.id,status:'delivered',idempotencyKey:nonce('delivery')}));if(result.ok)ctx.refresh();ctx.toast(result.message);});});
    on(ctx,'pay-delivery-failed',()=>{return runActionFlow(function*(){const result=(yield (ctx.actAsync||ctx.act).call(ctx,'simulateServiceDelivery',{id:route.id,status:'failed',idempotencyKey:nonce('delivery')}));if(result.ok)ctx.refresh();ctx.toast(result.message);});});
  }
  if (route.page === 'transaction' || (route.page === 'status' && isOutsideRepayment(getTransaction(ctx, route.id)))) {
    const tx = getTransaction(ctx, route.id);
    on(ctx,'pay-merchant-again',()=>payMerchantAgain(ctx,tx));
    on(ctx,'pay-save-merchant',()=>runActionFlow(function*(){if(!merchantReturnDestination(tx))return;const saved=(ctx.state.merchantFavorites||[]).some(item=>item.shopId===tx.shopId),result=yield (ctx.actAsync||ctx.act).call(ctx,saved?'removeMerchantFavorite':'saveMerchantFavorite',{shopId:tx.shopId});ctx.toast(result.message);if(result.ok)ctx.refresh();}));
    on(ctx,'pay-split-receipt',()=>createSplitSheet(ctx,{transactionId:tx?.id}));
    ctx.$$('[data-reaction]').forEach(el => el.addEventListener('click', () => {return runActionFlow(function*(){ const result = (yield (ctx.actAsync||ctx.act).call(ctx,'reactPayment', { id: route.id, reaction: el.dataset.reaction })); if (result.ok) ctx.refresh(); else ctx.toast(result.message || 'Try that again.'); });}));
    on(ctx, 'pay-share-receipt', () => { if (tx) shareText(ctx, paymentReceiptText(tx), isOutsideRepayment(tx) ? 'Outside repayment record' : 'Lumo payment receipt'); });
  }
  if (route.page === 'collect') {
    on(ctx,'collect-request',()=>createRequestSheet(ctx));
    on(ctx,'collect-requests',()=>ctx.go(payRoute('requests',{backTo:{...route}})));
    on(ctx, 'collect-amount', () => collectAmountSheet(ctx));
    on(ctx, 'collect-share', () => shareText(ctx, collectLink(ctx), 'Pay me with Lumo'));
    on(ctx, 'collect-copy', () => copyText(ctx, collectLink(ctx)));
    on(ctx, 'collect-track', () => trackCollection(ctx));
  }
  if (route.page === 'fund-status') on(ctx, 'fund-done', () => { const target = ctx.draft.fundingReturnTo || { section: 'home', page: 'home' }; delete ctx.draft.fundingReturnTo; finish(ctx, target); });
}

function collectAmountSheet(ctx) {
  if(ctx.connected)return createRequestSheet(ctx);
  const c = ctx.draft.collect;
  ctx.sheet(`<div class="content"><p class="eyebrow">Collect</p><h2 class="large-question">What’s coming<br>your way?</h2>${field({ label: 'Amount (GH₵)', name: 'collectAmount', type: 'number', min: '0.01', value: amountInput(c.amount), placeholder: 'e.g. 50' })}${field({ label: 'A note, if you like', name: 'collectNote', value: c.note, placeholder: 'e.g. Our lunch split' })}<p class="error" id="collect-error" role="alert" hidden></p><div class="sheet-actions">${btn('Update request', 'collect-save')}</div></div>`, el => {
    el.querySelector('[data-action="collect-save"]').addEventListener('click', () => {
      const value = el.querySelector('[name="collectAmount"]').value;
      const amount = pence(value);
      if (value && (!/^\d+(?:\.\d{1,2})?$/.test(value) || !Number.isSafeInteger(amount) || amount <= 0 || amount > 100000000)) { const error = el.querySelector('#collect-error'); error.textContent = 'Enter up to GH₵1,000,000 with no more than two decimal places, or leave it empty.'; error.hidden = false; return; }
      c.amount = value ? amount : 0; c.note = el.querySelector('[name="collectNote"]').value.trim().slice(0, 140); ctx.closeSheet(); ctx.refresh();
    });
  });
}
function collectLink(ctx) {
  if(ctx.connected)return ctx.shared?.account?.handle?encodeSharedQrLink({kind:'person',handle:ctx.shared.account.handle}):'';
  const c = ctx.draft.collect || {};
  const url = new URL(window.location.origin + window.location.pathname);
  url.searchParams.set('payTo', ctx.state.profile?.name || 'Ama');
  if (c.amount) url.searchParams.set('amount', String(c.amount));
  if (c.note) url.searchParams.set('note', c.note);
  return url.toString();
}
function copyText(ctx, text) {return runActionFlow(function*(){
  try { (yield navigator.clipboard.writeText(text)); ctx.toast('Copied. Ready to share.'); }
  catch {
    ctx.sheet(`<div class="content"><h2>Ready to share</h2><p class="muted">Select and copy the text below.</p><textarea class="input share-text" readonly aria-label="Text to copy">${esc(text)}</textarea><div class="sheet-actions">${btn('Done', 'share-close')}</div></div>`, el => { el.querySelector('textarea')?.select(); el.querySelector('[data-action="share-close"]')?.addEventListener('click', () => ctx.closeSheet()); });
  }
});}
function shareText(ctx, text, title) {return runActionFlow(function*(){
  if (navigator.share) {
    try { (yield navigator.share({ title, text })); return; }
    catch (error) { if (error.name === 'AbortError') return; }
  }
  (yield copyText(ctx, text));
});}
function trackCollection(ctx) {
  const c = ctx.draft.collect || {};
  ctx.sheet(`<div class="content"><p class="eyebrow">Expected money</p><h2 class="large-question">Who owes you?</h2>${field({ label: 'Their name', name: 'collectFrom', value: c.from || '', placeholder: 'e.g. Kofi' })}${field({ label: 'Amount (GH₵)', name: 'collectTrackAmount', type: 'number', value: amountInput(c.amount), min: '0.01' })}${field({ label: 'Expected back', name: 'collectDue', type: 'date', value: new Date(Date.now() + 86400000).toISOString().slice(0, 10) })}<p class="muted small">This stays outside available money until you confirm it has been received.</p><p class="error" id="collect-track-error" role="alert" hidden></p><div class="sheet-actions">${btn('Track expected money', 'collect-track-save')}</div></div>`, el => {
    el.querySelector('[data-action="collect-track-save"]').addEventListener('click', () => {return runActionFlow(function*(){
      const name = el.querySelector('[name="collectFrom"]').value.trim(), amount = pence(el.querySelector('[name="collectTrackAmount"]').value), due = el.querySelector('[name="collectDue"]').value;
      const result = (yield (ctx.actAsync||ctx.act).call(ctx,'createIOU', { name, amount, due, type: 'owedToMe', note: c.note || 'Payment request', idempotencyKey: c.idempotencyKey || nonce('collect') }));
      if (!result.ok) { const error = el.querySelector('#collect-track-error'); error.textContent = result.message; error.hidden = false; return; }
      c.idempotencyKey = nonce('collect'); ctx.closeSheet(); ctx.toast('Tracked as expected money.'); ctx.go({ section: 'life', page: 'ious' });
    });});
  });
}

export function openFunding(ctx, restored = null) {
  const current = ctx.route || { section: 'home', page: 'home' };
  const f = restored || { source: 'MTN MoMo', number: accountFundingPhone(ctx.state), amountText: '', idempotencyKey: nonce('fund'), returnTo: { ...current } };
  f.number = accountFundingPhone(ctx.state);
  ctx.draft.funding = f; remember(ctx);
  const bank=f.source==='Bank transfer',receiving=`Lumo demo receiving details\nBank: GCB Bank · simulation\nAccount name: ${ctx.state.profile?.name||'Lumo student'} · demo\nAccount number: 000005001118\nReference: LUMO-DEMO\nDo not send real money to these sample details.`;
  ctx.sheet(`<div class="content funding-sheet"><p class="eyebrow">Add money</p><h2 class="large-question">A little fuel<br>for your plans.</h2><div class="chips"><button class="chip ${!bank?'selected':''}" data-fund-source="MTN MoMo">${icon('phone',17)} Mobile money</button><button class="chip ${bank?'selected':''}" data-fund-source="Bank transfer">${icon('bank',17)} Bank transfer</button></div>${bank?`<div class="panel">${row({title:'Bank',right:'GCB Bank · demo'})}${row({title:'Account name',sub:esc(ctx.state.profile?.name||'Lumo student')+' · demo'})}${row({title:'Sample account',right:'000005001118'})}${row({title:'Reference',right:'LUMO-DEMO'})}</div><p class="muted small">Sample receiving details only. Do not transfer real money to them.</p><div class="inline-actions">${btn('Copy details','fund-copy',{secondary:true})}${btn('Share details','fund-share',{secondary:true})}</div>`:`<label class="field"><span>Your MoMo number</span><input class="input" name="fundNumber" type="tel" value="${esc(f.number)}" readonly aria-readonly="true" aria-describedby="fund-number-note"></label><p class="muted small" id="fund-number-note">Your registered Lumo number. You can only add money from this MoMo wallet.</p>`}${field({label:bank?'Amount to track (GH₵)':'Top-up amount (GH₵)',name:'fundAmount',type:'number',value:f.amountText,min:'0.01',placeholder:'e.g. 100'})}<p class="muted small">${bank?'Track the transfer, then wait for its confirmed result.':'Review your own wallet and amount. A top-up stays pending until confirmation.'} This is a simulation. No prompt, bank debit or real transfer is sent.</p><p class="error" id="fund-error" role="alert" hidden></p><div class="sheet-actions">${btn(bank?'Track this transfer':'Review top-up','fund-continue')}<button class="button ghost" data-action="fund-history">View top-up history</button></div></div>`,el=>{
    const capture=()=>{f.amountText=el.querySelector('[name="fundAmount"]').value;f.number=accountFundingPhone(ctx.state);remember(ctx);};
    el.querySelectorAll('[data-fund-source]').forEach(b=>b.addEventListener('click',()=>{capture();f.source=b.dataset.fundSource;openFunding(ctx,f);}));
    el.querySelector('[name="fundAmount"]').addEventListener('input',capture);
    el.querySelector('[data-action="fund-copy"]')?.addEventListener('click',()=>copyText(ctx,receiving));el.querySelector('[data-action="fund-share"]')?.addEventListener('click',()=>shareText(ctx,receiving,'Lumo demo receiving details'));
    el.querySelector('[data-action="fund-history"]').onclick=()=>{ctx.closeSheet();ctx.go(payRoute('funding-detail',{backTo:f.returnTo}));};
    el.querySelector('[data-action="fund-continue"]').onclick=()=>{
      capture();const value=f.amountText,amount=pence(value),error=el.querySelector('#fund-error');
      if(!/^\d+(?:\.\d{1,2})?$/.test(value)||!Number.isSafeInteger(amount)||amount<=0||amount>100000000){error.textContent='Use GH₵0.01 to GH₵1,000,000, with up to two decimal places.';error.hidden=false;return;}
      const number=f.number.replace(/\s/g,'');if(!bank&&!/^0\d{9}$/.test(number)){error.textContent='Your registered Lumo number is missing or invalid. Check your account details before adding money.';error.hidden=false;return;}
      ctx.closeSheet();ctx.auth({title:ctx.connected?`Add ${cash(amount)} of shared test money?`:bank?`Track ${cash(amount)} bank transfer?`:`Request ${cash(amount)} from your own wallet?`,onCancel:()=>openFunding(ctx,f),onSuccess:()=>{return runActionFlow(function*(){
        const result=(yield (ctx.actAsync||ctx.act).call(ctx,ctx.connected?'fund':'startFundingAttempt',ctx.connected?{amount,rail:'test',source:'Shared test money',note:'Shared pilot test money. No bank or MoMo debit.',idempotencyKey:f.idempotencyKey}:{amount,rail:bank?'bank':'momo',number,source:f.source,idempotencyKey:f.idempotencyKey}));if(!result.ok)return ctx.toast(result.message);
        ctx.draft.fundingReturnTo=f.returnTo;delete ctx.draft.funding;if(ctx.connected){ctx.draft.lastFunding=result.transaction;finish(ctx,payRoute('fund-status',{id:result.id,backTo:f.returnTo}));}else finish(ctx,payRoute('funding-detail',{id:result.id,backTo:f.returnTo}));
      });}});
    };
  });
}

export function readPaymentLink(ctx) {
  const params = new URLSearchParams(window.location.search);
  if(params.has('lumoCode')||params.has('pay')){
    const raw=new URL(window.location.pathname+window.location.search,window.location.origin).href;
    const parsed=parseQrPayload(raw,{origin:window.location.origin});
    if(!parsed.ok){ctx.toast(parsed.message);return null;}
    if(!ctx.connected||!ctx.shared?.signedIn){ctx.toast('Sign in to your shared Lumo account to review this payment.');return null;}
    const version=ctx.shared.authVersion;
    try{history.replaceState(history.state,'',window.location.pathname);}catch{}
    if(hasUnresolvedPayment(ctx.draft.payment))return payRoute('review');
    queueMicrotask(()=>{if(!ctx.connected||!ctx.shared?.signedIn||ctx.shared.authVersion!==version)return;if(parsed.payment.type==='merchant')void openSharedMerchant(ctx,parsed.payment);else openQrPayment(ctx,parsed.payment);});
    return payRoute('home');
  }
  const name = params.get('payTo');
  if (!name) return null;
  if(ctx.connected){ctx.toast('Ask for a fresh shared Lumo code or open your addressed request in Payments.');return null;}
  const d = resetDraft(ctx, { name: name.slice(0, 60), number: `@${name.toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 16)}`, emoji: name.charAt(0).toUpperCase() });
  const requested = Number(params.get('amount'));
  d.amount = Number.isSafeInteger(requested) && requested > 0 && requested <= 100000000 ? requested : 0;
  d.note = (params.get('note') || '').slice(0, 140);
  try { history.replaceState(history.state, '', window.location.pathname); } catch {}
  return payRoute(d.amount ? 'review' : 'amount');
}
