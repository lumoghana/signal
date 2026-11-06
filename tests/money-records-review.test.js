import test from 'node:test';
import assert from 'node:assert/strict';
import { createEmptyState, applyAction, getSummary } from '../dist/js/model.js';
import { getMonthlyInsights, renderInsights } from '../dist/js/insights.js';
import { renderLife } from '../dist/js/life.js';
import { filterActivity, renderActivityEntries, renderActivity, bindActivity } from '../dist/js/activity-view.js';

const day = offset => new Date(Date.now() + offset * 86400000).toISOString().slice(0, 10);
function state() { const s = createEmptyState(); s.wallet = 50000; s.onboardingDone = true; s.buffer = 0; s.settings.hideBalance = false; return s; }
function act(s, type, payload = {}) { const r = applyAction(s, type, payload); assert.equal(r.ok, true, `${type}: ${r.message}`); return r; }

test('monthly spending and a renewed plan use their own periods, including current-plan holds', () => {
  const s = state();
  act(s, 'createBudget', { items:[{ id:'food', name:'Food', amount:10000 }], endDate:day(7) });
  act(s, 'payment', { amount:8000, merchant:'Earlier lunch', category:'Food' });
  act(s, 'startBudgetPeriod', { startDate:day(0), endDate:day(7) });
  let insights = getMonthlyInsights(s);
  assert.equal(insights.spent, 8000);
  assert.equal(insights.planUsed, 0);
  assert.equal(insights.planPercent, 0);
  assert.equal(insights.planRemaining, 10000);
  const pending = act(s, 'payment', { amount:1000, merchant:'Pending lunch', category:'Food', status:'pending' }).transaction;
  insights = getMonthlyInsights(s);
  assert.equal(insights.spent, 8000);
  assert.equal(insights.held, 1000);
  assert.equal(insights.planUsed, 1000);
  assert.equal(insights.planPercent, 10);
  assert.equal(insights.planRemaining, 9000);
  const html = renderInsights({ state:s });
  assert.match(html, /Spent this month/); assert.match(html, /GH₵80\.00/);
  assert.match(html, /GH₵10\.00 pending, excluded from spending/);
  assert.doesNotMatch(html, /insights-ref-ring|Original budget|Still set aside/);
  const planHtml = renderInsights({ state:s }, { insightsView:'plan' });
  assert.match(planHtml, /10% of this plan used or held/);
  assert.match(planHtml, /Used or held<\/span><strong>GH₵10\.00/);
  assert.match(planHtml, /GH₵90\.00/);
  assert.ok(planHtml.includes(insights.planDates));
  assert.doesNotMatch(planHtml, /Spent this month|Money in|Where your money went/);
  act(s, 'resolvePayment', { id:pending.id, status:'failed' });
  insights = getMonthlyInsights(s);
  assert.equal(insights.spent, 8000);
  assert.equal(insights.planUsed, 0);
  assert.equal(insights.planPercent, 0);
  assert.equal(insights.planRemaining, 10000);
});

test('Money Story names the actual plan horizon and distinguishes a recovery check-in', () => {
  const s = state();
  act(s, 'createBudget', { items:[{ id:'food', name:'Food', amount:2000 }], endDate:day(3) });
  act(s, 'setExpectedIncome', { amount:10000, date:day(30) });
  const ctx = { state:s, draft:{} };
  let html = renderLife(ctx, { section:'life', page:'story' });
  assert.equal(getSummary(s).guidanceDate, day(3));
  assert.match(html, /a day until the end of your plan on/);
  assert.doesNotMatch(html, /until your next expected income/);
  s.recovery = { active:true, checkInDate:day(1) };
  html = renderLife(ctx, { section:'life', page:'story' });
  assert.match(html, /a day until your recovery check-in on/);
  assert.doesNotMatch(html, /until the end of your plan/);
});

test('outside split receipts remain recorded repayments without a Lumo income presentation', () => {
  for (const method of ['cash', 'other']) {
    const s = state(), before = s.wallet;
    const split = act(s, 'createExpenseSplit', { amount:6000, purpose:'Project printing', members:[{ id:'me', name:'Me', isMe:true }, { id:'kofi', name:'Kofi' }] }).split;
    const receipt = act(s, 'settleSplitShare', { splitId:split.id, memberId:'kofi', method }).transaction;
    assert.equal(receipt.type, 'split-manual-receipt');
    assert.equal(s.wallet, before);
    const html = renderActivityEntries({ state:s, draft:{} });
    assert.match(html, /Outside repayment/);
    assert.match(html, /Lumo unchanged/);
    assert.doesNotMatch(html, /feed-positive|\+GH₵30\.00/);
    assert.equal(getMonthlyInsights(s).moneyIn, 0);
    assert.equal(split.members.find(m => m.id === 'kofi').paid, 3000);
    assert.equal(applyAction(s, 'settleSplitShare', { splitId:split.id, memberId:'kofi', method }).ok, false);
    assert.equal(s.wallet, before);
  }
});

test('Activity snapshot uses exact timestamps and keeps its cutoff visible and clearable', () => {
  const asOf = '2026-11-05T12:00:00Z';
  const transactions = [
    { id:'before', at:'2026-11-05T11:59:59Z', merchant:'Lunch', amount:1000, direction:'out', type:'payment', status:'success', category:'Food' },
    { id:'at', at:asOf, merchant:'Prints', amount:500, direction:'out', type:'payment', status:'success', category:'Study' },
    { id:'after', at:'2026-11-05T12:00:01Z', merchant:'Data', amount:2000, direction:'out', type:'payment', status:'success', category:'Data' },
  ];
  const filters = { from:'2026-11-01', to:'2026-11-05', asOf, query:'', direction:'all', status:'all', category:'' };
  assert.deepEqual(filterActivity(transactions, filters).map(t => t.id), ['at', 'before']);
  assert.equal(filterActivity(transactions, { ...filters, asOf:'invalid' }).length, 3);
  const callbacks = {}, s = state(); s.transactions = transactions;
  const ctx = { state:s, draft:{ activityFilters:filters }, route:{ section:'activity', page:'home' }, $:selector=>({ addEventListener:(_, callback)=>{ callbacks[selector] = callback; } }), $$:()=>[], refresh(){}, saveDraft(){} };
  assert.match(renderActivity(ctx), /Snapshot as of/);
  assert.match(renderActivity(ctx), /12:00/);
  assert.doesNotMatch(renderActivityEntries(ctx), /root-tx:after/);
  bindActivity(ctx);
  callbacks['[data-activity-clear-snapshot]']();
  assert.equal(filters.asOf, undefined);
  assert.match(renderActivityEntries(ctx), /root-tx:after/);
});
