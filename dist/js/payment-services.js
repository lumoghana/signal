import { cash, esc, icon } from './ui.js';
import { getPaymentService, getServiceHubTab, PAYMENT_NETWORKS, DEMO_DATA_BUNDLES, CAMPUS_BILLERS, prepareServicePayment } from './payment-catalog.js';

const hubRoute = service => ({ section: 'pay', page: 'home', hubTab: getServiceHubTab(service) });
const field = (label, key, value, options = {}) => `<label class="service-field"><span>${esc(label)}</span><input class="input" data-service-field="${key}" name="service-${key}" value="${esc(value || '')}" ${options.type ? `type="${options.type}"` : ''} ${options.inputmode ? `inputmode="${options.inputmode}"` : ''} placeholder="${esc(options.placeholder || '')}" maxlength="${options.maxlength || 60}" autocomplete="off"></label>`;
function draft(ctx, id) {
  ctx.draft.servicePayment ||= {};
  ctx.draft.servicePayment[id] ||= { network: ctx.topUpShortcuts?.(id)?.network || 'MTN', phone: '', reference: '', amountText: '', bundle: 'weekly', biller: '' };
  return ctx.draft.servicePayment[id];
}

export function renderPaymentService(ctx, route) {
  const service = getPaymentService(route.id);
  if (!service) return `<section class="page payment-service"><header class="service-header"><button class="service-back" data-service-action="exit">${icon('back', 18)}<span>Payments</span></button></header><h1>This service has moved.</h1><p class="muted">Choose another service from Payments.</p></section>`;
  const d = draft(ctx, service.id);
  const selectedBundle = service.bundleRequired ? DEMO_DATA_BUNDLES.find(bundle => bundle.id === d.bundle) : null;
  const reviewLabel = route.edit ? 'Save changes' : selectedBundle ? `Review ${cash(selectedBundle.amount, { decimals: false })}` : 'Review payment';
  const reviewAccessibleLabel = route.edit ? 'Save changes' : selectedBundle ? `Review payment, ${selectedBundle.name}, ${cash(selectedBundle.amount, { decimals: false })}` : 'Review payment';
  const title = service.id === 'school-fees' ? 'Your next chapter.' : service.id === 'hostel-fees' ? 'Room for what’s next.' : service.id === 'hall-dues' ? 'Your hall. Your people.' : service.type === 'campus' ? 'Pay on campus.' : service.id === 'data' ? 'A little more data.' : service.id === 'airtime' ? 'Stay connected.' : 'One bill, sorted.';
  const referenceField = service.referenceLabel ? field(service.referenceLabel, 'reference', d.reference, { placeholder: service.referencePlaceholder || 'Add a reference if you have one', maxlength: service.billerRequired ? 30 : service.referenceRequired ? 24 : 60 }) : '';
  const billers = service.billerRequired ? `<label class="service-field service-biller"><span>${esc(service.billerLabel)}</span><select class="input" name="service-biller" data-service-field="biller" aria-label="${esc(service.billerLabel)}"><option value="">${service.id === 'school-fees' ? 'Choose a demo school' : 'Choose a demo hostel'}</option>${CAMPUS_BILLERS[service.id].map(biller => `<option value="${esc(biller.id)}"${d.biller === biller.id ? ' selected' : ''}>${esc(biller.name)}</option>`).join('')}</select></label>` : '';
  const shortcuts = service.phoneRequired ? ctx.topUpShortcuts?.(service.id) || {} : {};
  const quick = service.phoneRequired ? `<div class="service-shortcuts">${shortcuts.phone ? '<button type="button" class="service-quick" data-service-action="my-number">My number</button>' : ''}${shortcuts.previous ? '<button type="button" class="service-quick" data-service-action="last-topup">Use last top-up</button>' : ''}${shortcuts.waiting ? '<button type="button" class="text-button" data-service-action="last-status">Check last top-up</button>' : ''}</div>` : '';
  const networks = service.phoneRequired ? `<div class="service-networks" role="group" aria-label="Choose a mobile network">${PAYMENT_NETWORKS.map(network => `<button type="button" data-service-network="${network}" aria-pressed="${d.network === network}">${network}</button>`).join('')}</div>${field('Mobile number', 'phone', d.phone, { type: 'tel', inputmode: 'tel', placeholder: '024 000 0000', maxlength: 30 })}${quick}` : '';
  const money = service.bundleRequired ? `<fieldset class="service-bundles"><legend>Choose a demo bundle</legend>${DEMO_DATA_BUNDLES.map(bundle => `<button type="button" data-service-bundle="${bundle.id}" aria-pressed="${d.bundle === bundle.id}"><span>${bundle.name}</span><strong>${cash(bundle.amount, { decimals: false })}</strong>${icon(d.bundle === bundle.id ? 'check' : 'chevron', 17)}</button>`).join('')}</fieldset>` : `<label class="service-money"><span>Amount to pay</span><div><span aria-hidden="true">GH₵</span><input data-service-field="amountText" name="service-amountText" aria-label="Amount to pay in Ghana cedis" inputmode="decimal" value="${esc(d.amountText || '')}" placeholder="0.00" maxlength="12" autocomplete="off"></div></label>${service.id === 'airtime' ? `<div class="service-presets" aria-label="Airtime amounts">${[500, 1000, 2000, 5000].map(value => `<button type="button" data-service-amount="${value}">${cash(value, { decimals: false })}</button>`).join('')}</div>` : ''}`;
  return `<section class="payment-service service-kind-${esc(service.id)}${service.type === 'campus-bill' ? ' service-campus-bill' : ''}" aria-label="${esc(service.name)}"><header class="service-header"><button type="button" class="service-back" data-service-action="exit" aria-label="${route.edit ? 'Back to payment review' : `Back to ${getServiceHubTab(service) === 'campus' ? 'Campus Pay' : 'Top-ups and bills'}`}">${icon('back', 18)}<span>${route.edit ? 'Review' : getServiceHubTab(service) === 'campus' ? 'Campus Pay' : 'Top-ups & bills'}</span></button><button type="button" class="text-button" data-service-action="exit">${route.edit ? 'Cancel edit' : 'Cancel'}</button></header><div class="service-main"><div class="service-merchant"><span aria-hidden="true">${icon(service.icon,26)}</span><div><strong>${esc(service.name)}</strong><small>${service.type === 'campus' ? 'Sample campus merchant' : service.type === 'campus-bill' ? 'Demo campus bill' : 'Demo service'}</small></div></div><h1>${title}</h1><form id="service-payment-form" novalidate>${networks}${billers}${referenceField}${money}<p class="service-error" role="alert">${esc(d.error || '')}</p></form><p class="service-demo-note">${service.bundleRequired ? 'Illustrative bundles and prices only. No real data is delivered.' : service.type === 'campus-bill' ? 'Practice payment only. No school, hostel or hall receives money.' : service.type === 'campus' ? 'This is a sample campus payment. No merchant receives money.' : 'This provider is not connected. This payment is simulated.'}</p></div><footer class="service-footer"><button type="button" class="button" data-service-action="review" aria-label="${esc(reviewAccessibleLabel)}">${esc(reviewLabel)} ${icon('arrow', 18)}</button></footer></section>`;
}

export function bindPaymentService(ctx, route) {
  const root = ctx.$('.payment-service'), service = getPaymentService(route.id);
  if (!root) return () => {};
  if (!service) { const click = () => ctx.go(hubRoute()); root.querySelector('[data-service-action="exit"]')?.addEventListener('click', click); return () => {}; }
  const d = draft(ctx, service.id);
  let alive = true, submitting = false;
  const current = () => alive && root.isConnected && ctx.draft.servicePayment?.[service.id] === d;
  const capture = () => {
    if (!current()) return;
    root.querySelectorAll('[data-service-field]').forEach(input => { d[input.dataset.serviceField] = input.value; });
    ctx.saveDraft?.();
  };
  ctx.setCapture?.(capture);
  const refresh = () => { ctx.setCapture?.(null); ctx.saveDraft?.(); ctx.refresh(); };
  const error = message => { d.error = message; const node = root.querySelector('.service-error'); if (node) node.textContent = message; ctx.saveDraft?.(); };
  const click = event => {
    const button = event.target.closest('button');
    if (!current() || !button || button.disabled || submitting) return;
    capture();
    if (button.dataset.serviceAction === 'my-number') { const saved = ctx.topUpShortcuts?.(service.id); if (!saved?.phone) return error('Add your mobile number in Your details first.'); d.phone = saved.phone; d.error = ''; return refresh(); }
    if (button.dataset.serviceAction === 'last-topup') { const saved = ctx.topUpShortcuts?.(service.id); if (!saved?.previous || saved.waiting) return error('Check your last top-up before preparing another.'); Object.assign(d, saved.previous, { error: '' }); return refresh(); }
    if (button.dataset.serviceAction === 'last-status') { const saved = ctx.topUpShortcuts?.(service.id); if (saved?.waiting?.id) { ctx.setCapture?.(null); ctx.go({ section: 'pay', page: 'status', id: saved.waiting.id, backTo: { ...route } }); } return; }
    if (button.dataset.serviceNetwork) { d.network = button.dataset.serviceNetwork; d.error = ''; return refresh(); }
    if (button.dataset.serviceBundle) { d.bundle = button.dataset.serviceBundle; d.error = ''; return refresh(); }
    if (button.dataset.serviceAmount) { d.amountText = (Number(button.dataset.serviceAmount) / 100).toFixed(2); d.error = ''; return refresh(); }
    if (button.dataset.serviceAction === 'exit') {
      ctx.setCapture?.(null);
      if (route.edit && ctx.draft.payment?.serviceId === service.id) {
        ctx.draft.servicePayment[service.id] = { ...ctx.draft.payment.serviceFields };
        ctx.saveDraft?.(); ctx.go({ section: 'pay', page: 'review' }, { replace: true });
      } else ctx.go(hubRoute(service));
      return;
    }
    if (button.dataset.serviceAction === 'review') {
      const result = prepareServicePayment(service.id, d);
      if (!result.ok) return error(result.message);
      submitting = true; button.disabled = true; d.error = ''; ctx.setCapture?.(null); ctx.saveDraft?.();
      const accepted = ctx.startServicePayment({ ...result.payment, editing: route.edit === true });
      if (accepted === false || accepted?.ok === false) { submitting = false; button.disabled = false; error(accepted?.message || 'Complete your current payment before starting this one.'); }
    }
  };
  const submit = event => { event.preventDefault(); root.querySelector('[data-service-action="review"]')?.click(); };
  root.addEventListener('click', click); root.addEventListener('input', capture); root.addEventListener('change', capture); root.querySelector('form')?.addEventListener('submit', submit);
  return () => { alive = false; ctx.setCapture?.(null); root.removeEventListener('click', click); root.removeEventListener('input', capture); root.removeEventListener('change', capture); root.querySelector('form')?.removeEventListener('submit', submit); };
}
