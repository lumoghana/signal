import test from 'node:test';
import assert from 'node:assert/strict';
import { renderPaymentsHub, bindPaymentsHub, merchantMatches, normalizeMerchantSearch } from '../dist/js/payments-hub.js';
import { PAYMENT_SERVICES, getPaymentService } from '../dist/js/payment-catalog.js';

const campus = { section: 'pay', page: 'home', hubTab: 'campus' };
const bills = { section: 'pay', page: 'home', hubTab: 'bills' };
const state = () => ({ wallet: 12345, settings: { hideBalance: false }, externalBalances: [{ balance: 9000000 }], transactions: [{ id: 'existing', amount: 500 }] });
const context = draft => ({ state: state(), draft: draft || {} });
function renderedMerchants(html) {
  return [...html.matchAll(/<button[^>]*data-campus-merchant="([^"]+)"([^>]*)>/g)].map(match => ({ id: match[1], hidden: /\bhidden\b/.test(match[2]) }));
}
function node(extra = {}) {
  const listeners = new Map();
  return { hidden: false, value: '', textContent: '', ...extra, listeners,
    addEventListener(name, callback) { listeners.set(name, callback); },
    removeEventListener(name, callback) { if (listeners.get(name) === callback) listeners.delete(name); },
    emit(name, event = {}) { return listeners.get(name)?.(event); },
  };
}
function harness(tab = 'campus') {
  const ctx = context(), routes = [], search = node(), empty = node({ hidden: true }), count = node(), clear = node({ hidden: true }), utilities = node({ open: false });
  let saves = 0, focused = 0, codeOpened = 0, codeDisposed = 0;
  search.focus = () => focused++;
  const merchants = PAYMENT_SERVICES.filter(service => service.type === 'campus').map(service => node({ dataset: { campusMerchant: service.id } }));
  const root = node({ isConnected: true });
  root.querySelector = selector => ({ '#campus-merchant-search': tab === 'campus' ? search : null, '.campus-search-empty': empty, '[data-campus-result-count]': count, '[data-hub-action="clear-search"]': clear, '.payments-everyday-bills': tab === 'bills' ? utilities : null })[selector] || null;
  root.querySelectorAll = selector => selector === '[data-campus-merchant]' ? merchants : [];
  Object.assign(ctx, { $: () => root, saveDraft() { saves++; }, go: (...args) => routes.push(args), enterMerchantCode() { codeOpened++; return () => codeDisposed++; }, act() { throw new Error('Hub search cannot perform a financial action.'); } });
  const cleanup = bindPaymentsHub(ctx, { section: 'pay', page: 'home', hubTab: tab });
  return { ctx, root, search, empty, count, clear, merchants, utilities, routes, cleanup,
    get saves() { return saves; }, get focused() { return focused; }, get codeOpened() { return codeOpened; }, get codeDisposed() { return codeDisposed; },
    input(query) { search.value = query; search.emit('input'); },
    click(dataset, disabled = false) { root.emit('click', { target: { closest: () => ({ dataset, disabled }) } }); },
    visible() { return merchants.filter(row => !row.hidden).map(row => row.dataset.campusMerchant); },
  };
}

test('Campus Pay offers scan and merchant code before search and the merchant list', () => {
  const html = renderPaymentsHub(context(), campus);
  const scan = html.indexOf('data-hub-action="scan"'), code = html.indexOf('data-hub-action="merchant-code"'), search = html.indexOf('id="campus-merchant-search"'), firstMerchant = html.indexOf('data-campus-merchant=');
  assert.ok(scan >= 0 && code >= 0 && scan < search && code < search && search < firstMerchant);
  assert.match(html, /Search campus merchants/);
  assert.equal(renderedMerchants(html).length, PAYMENT_SERVICES.filter(service => service.type === 'campus').length);
  assert.doesNotMatch(html, /data-campus-merchant="hall-dues"/);
});

test('merchant matching understands Ghanaian spelling, ASCII aliases and all query terms', () => {
  const gobe = getPaymentService('gobe-spot'), prints = getPaymentService('balme-prints'), shuttle = getPaymentService('campus-shuttle');
  for (const query of ['gobe', 'GƆBƐ', 'góbè', 'gobe spot', 'gobe-spot', '   ']) assert.equal(merchantMatches(gobe, query), true, query);
  assert.equal(normalizeMerchantSearch(' GƆBƐ / SPOT '), 'gobe spot');
  assert.equal(merchantMatches(prints, 'balme prints'), true);
  assert.equal(merchantMatches(shuttle, 'campus shuttle'), true);
  assert.equal(merchantMatches(shuttle, 'campus gobe'), false);
  assert.equal(merchantMatches(gobe, 'hostel'), false);
});

test('stored search filters on return and user text is safely escaped', () => {
  const ctx = context({ campusMerchantQuery: 'balme prints' });
  const html = renderPaymentsHub(ctx, campus), rows = renderedMerchants(html);
  assert.deepEqual(rows.filter(row => !row.hidden).map(row => row.id), ['balme-prints']);
  assert.match(html, /value="balme prints"/);
  ctx.draft.campusMerchantQuery = '"><script>alert(1)</script>';
  const untrusted = renderPaymentsHub(ctx, campus);
  assert.doesNotMatch(untrusted, /<script>/);
  assert.match(untrusted, /&quot;&gt;&lt;script&gt;/);
});

test('live filtering, no-match and clear states persist only the presentation draft', () => {
  const h = harness(), before = JSON.stringify(h.ctx.state);
  try {
    h.input('gobe'); assert.deepEqual(h.visible(), ['gobe-spot']); assert.equal(h.ctx.draft.campusMerchantQuery, 'gobe');
    assert.equal(h.empty.hidden, true); assert.equal(h.clear.hidden, false); assert.match(h.count.textContent, /^1 spot/);
    h.input('not a real spot'); assert.deepEqual(h.visible(), []); assert.equal(h.empty.hidden, false); assert.match(h.count.textContent, /^0 spots/);
    h.click({ hubAction: 'clear-search' });
    assert.equal(h.search.value, ''); assert.equal(h.ctx.draft.campusMerchantQuery, ''); assert.equal(h.clear.hidden, true); assert.equal(h.empty.hidden, true); assert.equal(h.focused, 1);
    assert.equal(h.visible().length, PAYMENT_SERVICES.filter(service => service.type === 'campus').length);
    h.input('Balme'); h.click({ hubAction: 'service', serviceId: 'balme-prints' });
    assert.deepEqual(h.routes.at(-1)[0].backTo, campus);
    assert.deepEqual(renderedMerchants(renderPaymentsHub(h.ctx, campus)).filter(row => !row.hidden).map(row => row.id), ['balme-prints']);
    assert.equal(JSON.stringify(h.ctx.state), before); assert.ok(h.saves >= 4);
  } finally { h.cleanup(); }
});

test('detached and cleaned-up search handlers cannot rewrite the saved query', () => {
  const h = harness(); h.input('gobe');
  const lateInput = h.search.listeners.get('input'), lateClick = h.root.listeners.get('click');
  h.root.isConnected = false; h.search.value = 'prints'; lateInput();
  assert.equal(h.ctx.draft.campusMerchantQuery, 'gobe');
  h.root.isConnected = true; h.cleanup(); const saves = h.saves;
  lateInput(); lateClick({ target: { closest: () => ({ dataset: { hubAction: 'clear-search' } }) } });
  assert.equal(h.ctx.draft.campusMerchantQuery, 'gobe'); assert.equal(h.saves, saves);
});

test('merchant-code entry keeps its owner cleanup and scan returns to the Campus Pay tab', () => {
  const h = harness(), before = JSON.stringify(h.ctx.state);
  h.click({ hubAction: 'merchant-code' }); assert.equal(h.codeOpened, 1); assert.equal(h.codeDisposed, 0);
  h.click({ hubAction: 'scan' }); assert.deepEqual(h.routes.at(-1)[0], { section: 'pay', page: 'scan', backTo: campus });
  h.cleanup(); assert.equal(h.codeDisposed, 1);
  h.click({ hubAction: 'merchant-code' }); assert.equal(h.codeOpened, 1);
  assert.equal(JSON.stringify(h.ctx.state), before);
});

test('top-ups lead Campus bills and expandable everyday utilities while all destinations remain actionable', () => {
  const ctx = context(), html = renderPaymentsHub(ctx, bills);
  const airtime = html.indexOf('data-service-id="airtime"'), data = html.indexOf('data-service-id="data"'), school = html.indexOf('data-service-id="school-fees"'), hostel = html.indexOf('data-service-id="hostel-fees"'), hall = html.indexOf('data-service-id="hall-dues"'), electricity = html.indexOf('data-service-id="electricity"');
  assert.ok(airtime >= 0 && data >= 0 && airtime < school && data < school && school < electricity && hostel < electricity && hall < electricity);
  assert.match(html, /<h2>Campus bills<\/h2>/);
  assert.match(html, /<details class="payments-everyday-bills"><summary>/);
  for (const id of ['electricity', 'water', 'tv']) assert.ok(html.includes('data-service-id="' + id + '"'));
  const h = harness('bills'), before = JSON.stringify(h.ctx.state);
  try {
    h.utilities.open = true; h.utilities.emit('toggle');
    assert.equal(h.ctx.draft.paymentUtilitiesOpen, true); assert.match(renderPaymentsHub(h.ctx, bills), /payments-everyday-bills" open/);
    h.click({ hubAction: 'service', serviceId: 'school-fees' }); assert.deepEqual(h.routes.at(-1)[0], { section: 'pay', page: 'service', id: 'school-fees', backTo: bills });
    h.utilities.open = false; h.utilities.emit('toggle'); assert.equal(h.ctx.draft.paymentUtilitiesOpen, false);
    assert.equal(JSON.stringify(h.ctx.state), before);
  } finally { h.cleanup(); }
});
