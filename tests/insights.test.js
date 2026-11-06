import test from 'node:test';
import assert from 'node:assert/strict';
import { getMonthlyInsights, normalizeInsightsMonth, renderInsights, bindInsights } from '../dist/js/insights.js';

const now = new Date('2026-11-02T06:00:00Z');
const tx = (amount, at, overrides = {}) => ({ amount, at, type: 'payment', direction: 'out', status: 'success', category: 'Food', rail: 'momo', ...overrides });
const state = transactions => ({ transactions, budget: { created: true, items: [{ amount: 10000, spent: 3000 }, { amount: 4000, spent: 5000 }] }, settings: { hideBalance: false } });

test('month validation falls back for invalid and future months', () => {
  for (const value of [undefined, '', '2026-13', '2026-00', '2026-1', '2027-01', '<script>']) assert.equal(normalizeInsightsMonth(value, now), '2026-11');
  assert.equal(normalizeInsightsMonth('2026-10', now), '2026-10');
});

test('spending excludes held, failed, reversed and internal moves; money in is completed income', () => {
  const s = state([
    tx(2000, '2026-11-02T17:00:00Z'),
    tx(300, '2026-11-01T10:00:00Z', { status: 'pending' }),
    tx(400, '2026-11-01T10:00:00Z', { status: 'failed' }),
    tx(500, '2026-11-01T10:00:00Z', { status: 'reversed' }),
    tx(600, '2026-11-01T10:00:00Z', { type: 'saving', rail: 'internal' }),
    tx(700, '2026-11-01T10:00:00Z', { type: 'contribution' }),
    tx(9900, '2026-11-01T10:00:00Z', { type: 'iou-manual-repayment', manual: true }),
    tx(800, '2026-11-01T10:00:00Z', { rail: 'internal' }),
    tx(10000, '2026-11-01T10:00:00Z', { type: 'income', direction: 'in' }),
    tx(90000, '2026-11-01T10:00:00Z', { type: 'income', direction: 'in', status: 'pending' }),
    tx(100000, '2026-11-03T10:00:00Z'),
  ]);
  s.ious = [{ direction: 'incoming', amount: 999999, status: 'open' }];
  s.externalBalances = [{ balance: 999999 }];
  const result = getMonthlyInsights(s, '2026-11', now);
  assert.equal(result.spent, 2000); assert.equal(result.moneyOut, 2000);
  assert.equal(result.moneyIn, 10000); assert.equal(result.held, 300);
  assert.equal(result.planTotal, 14000); assert.equal(result.planRemaining, 7000);
  assert.equal(result.planUsed, 8000); assert.equal(result.planPercent, 57);
  assert.deepEqual(result.categories, [{ name: 'Food', amount: 2000, percent: 100 }]);
});

test('current months compare the same elapsed days, while historical months compare whole months', () => {
  const s = state([tx(1000, '2026-11-01T12:00:00Z'), tx(2000, '2026-10-01T12:00:00Z'), tx(9000, '2026-10-25T12:00:00Z'), tx(22000, '2026-09-30T12:00:00Z')]);
  const current = getMonthlyInsights(s, '2026-11', now);
  assert.equal(current.previousSpent, 2000); assert.equal(current.comparison.percent, 50); assert.equal(current.comparison.direction, 'lower');
  assert.equal(current.comparison.period, 'vs the same days last month');
  const historic = getMonthlyInsights(s, '2026-10', now);
  assert.equal(historic.spent, 11000); assert.equal(historic.previousSpent, 22000);
  assert.equal(historic.comparison.percent, 50); assert.equal(historic.comparison.period, 'vs last month');
  assert.equal(historic.planTotal, null); assert.equal(historic.planRemaining, null); assert.equal(historic.planPercent, null);
});

test('leap years and shorter baseline months compare only available elapsed days', () => {
  const s = state([tx(1000, '2024-03-30T12:00:00Z'), tx(2000, '2024-02-29T12:00:00Z')]);
  assert.equal(getMonthlyInsights(s, '2024-03', new Date('2024-03-31T00:00:00Z')).previousSpent, 2000);
});

test('no baseline fabricates no improvement; over-plan numbers are honest with a capped visual', () => {
  const s = state([tx(28000, '2026-11-01T12:00:00Z')]);
  s.budget.items = [{ amount: 14000, spent: 28000 }];
  const result = getMonthlyInsights(s, '2026-11', now);
  assert.equal(result.comparison.available, false); assert.equal(result.comparison.percent, null);
  assert.equal(result.noticed, 'Your first month is taking shape.');
  assert.equal(result.planPercent, 200); assert.equal(result.ringPercent, 100);
  s.budget.created = false;
  assert.equal(getMonthlyInsights(s, '2026-11', now).planPercent, null);
});

test('categories use ledger amounts, sort by spending, and invalid amounts/dates are ignored', () => {
  const s = state([tx(1000, '2026-11-01T12:00:00Z'), tx(2500, '2026-11-01T12:00:00Z', { category: 'Transport' }), tx(500, '2026-11-01T12:00:00Z'), tx(0.3, '2026-11-01T12:00:00Z'), tx(-900, '2026-11-01T12:00:00Z'), tx(80000, 'invalid')]);
  const result = getMonthlyInsights(s, '2026-11', now);
  assert.equal(result.spent, 4000);
  assert.deepEqual(result.categories, [{ name: 'Transport', amount: 2500, percent: 63 }, { name: 'Food', amount: 1500, percent: 38 }]);
});

test('privacy masks every displayed amount and percentage including category bars and noticed copy', () => {
  const s = state([tx(12345, '2026-10-01T12:00:00Z'), tx(24690, '2026-09-01T12:00:00Z')]);
  s.settings.hideBalance = true;
  const html = renderInsights({ state: s }, { month: '2026-10' });
  assert.doesNotMatch(html, /GH₵|50%|100%|width:100|123\.45|246\.90/);
  assert.match(html, /••••\.••/); assert.match(html, /Show your balances/);
  const planHtml = renderInsights({ state: s }, { month: '2026-10', insightsView: 'plan' });
  assert.doesNotMatch(planHtml, /GH₵|57%|123\.45|246\.90/);
  assert.match(planHtml, /--insights-progress:0%/);
});

test('monthly spending keeps four category rows and does not mix in a current or historical plan chart', () => {
  const s = state(Array.from({ length: 6 }, (_, i) => tx((i + 1) * 100, '2026-10-01T12:00:00Z', { category: `Category ${i}` })));
  const html = renderInsights({ state: s }, { month: '2026-10' });
  assert.equal((html.match(/class="insights-ref-category"/g) || []).length, 4);
  assert.doesNotMatch(html, /insights-ref-ring|Original budget|Still set aside|Past plan snapshots/);
  assert.match(html, /data-insights-action="view-plan"/);
  assert.match(html, /data-insights-action="categories"/);
  assert.doesNotMatch(html, /<strong>76%|12% lower/);
});

test('the plan scope shows the current budget only, independently of a selected historical month', () => {
  const s = state([tx(12345, '2026-10-01T12:00:00Z')]);
  const before = structuredClone(s);
  const html = renderInsights({ state: s }, { month: '2026-10', insightsView: 'plan' });
  assert.match(html, /Current plan/);
  assert.match(html, /Original budget/); assert.match(html, /Used or held/); assert.match(html, /Still set aside/);
  assert.match(html, /57%/); assert.match(html, /GH₵140\.00/); assert.match(html, /GH₵80\.00/); assert.match(html, /GH₵70\.00/);
  assert.doesNotMatch(html, /Spent in|Money in|Where your money went|GH₵123\.45|data-insights-action="month"/);
  assert.match(html, /Monthly spending is shown separately/);
  assert.deepEqual(s, before, 'changing the view is read-only');
  s.budget.created = false;
  assert.match(renderInsights({ state: s }, { insightsView: 'plan' }), /Create a budget/);
});

function binder() {
  const s = state([]), handlers = {}, routes = [], sheets = [];
  const root = { isConnected: true, addEventListener(name, fn) { handlers[name] = fn; }, removeEventListener(name, fn) { if (handlers[name] === fn) delete handlers[name]; } };
  let closed = 0, saved = 0;
  const ctx = { state: s, draft: {}, $: () => root, go: (...args) => routes.push(args), saveDraft: () => saved++, closeSheet: () => closed++, sheet: (...args) => sheets.push(args) };
  const route = { section: 'activity', page: 'insights', month: '2026-10', returnTo: { section: 'home', page: 'home' } };
  const cleanup = bindInsights(ctx, route);
  return { ctx, root, route, cleanup, routes, sheets, get closed() { return closed; }, get saved() { return saved; }, click(action) { handlers.click?.({ target: { closest: () => ({ dataset: { insightsAction: action } }) } }); } };
}

test('month changes replace history and preserve the original return route', () => {
  const h = binder(); h.click('month');
  const [html, bind] = h.sheets.at(-1); assert.match(html, /Pick a month/);
  let choose;
  bind({ querySelectorAll: () => [{ dataset: { insightsMonth: '2026-09' }, addEventListener: (_, fn) => { choose = fn; } }] });
  choose();
  assert.equal(h.closed, 1);
  assert.deepEqual(h.routes[0], [{ ...h.route, month: '2026-09' }, { replace: true }]);
  h.cleanup(); h.click('month'); assert.equal(h.sheets.length, 1);
});

test('switching month and plan scopes preserves month selection and origin without adding back presses', () => {
  const h = binder();
  const before = structuredClone(h.ctx.state);
  h.click('view-plan');
  assert.deepEqual(h.routes.at(-1), [{ ...h.route, insightsView: 'plan' }, { replace: true }]);
  h.click('view-month');
  assert.deepEqual(h.routes.at(-1), [{ ...h.route, insightsView: 'month' }, { replace: true }]);
  h.click('plan');
  assert.deepEqual(h.routes.at(-1), [{ section: 'plan', page: 'home', returnTo: { ...h.route, insightsView: 'plan' } }]);
  assert.deepEqual(h.ctx.state, before);
});

test('noticed opens a month-specific conversation and returns to that exact insight', () => {
  const h = binder(); h.click('noticed');
  assert.equal(h.ctx.draft.chatPendingQuestion, 'Explain my spending for October 2026.');
  assert.equal(h.saved, 1);
  assert.deepEqual(h.routes[0], [{ section: 'chat', page: 'home', returnTo: h.route }]);
  h.root.isConnected = false; h.click('noticed'); assert.equal(h.routes.length, 1);
});
