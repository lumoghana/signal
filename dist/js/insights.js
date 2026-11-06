import { cash, esc, icon, categorySymbol } from './ui.js';

const validMoney = value => Number.isSafeInteger(value) && value >= 0;
const asMoney = value => validMoney(value) ? value : 0;
const utcDate = value => {
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? new Date() : date;
};
const monthOf = date => date.toISOString().slice(0, 7);
const monthLabel = (month, short = false) => new Date(`${month}-01T00:00:00Z`).toLocaleDateString('en-GH', { month: short ? 'short' : 'long', year: 'numeric', timeZone: 'UTC' });
const shiftMonth = (month, offset) => {
  const [year, number] = month.split('-').map(Number);
  return monthOf(new Date(Date.UTC(year, number - 1 + offset, 1)));
};
const dayCount = month => { const [year, number] = month.split('-').map(Number); return new Date(Date.UTC(year, number, 0)).getUTCDate(); };

/** Accept only a real, nonfuture calendar month. Ghana uses UTC throughout the year. */
export function normalizeInsightsMonth(value, now = new Date()) {
  const current = monthOf(utcDate(now));
  if (typeof value !== 'string' || !/^(?:19|20|21)\d{2}-(?:0[1-9]|1[0-2])$/.test(value) || value > current) return current;
  return value;
}

function transactionDate(tx) {
  if (typeof tx.at !== 'string' || !/^\d{4}-\d{2}-\d{2}T/.test(tx.at)) return '';
  const parsed = new Date(tx.at);
  return Number.isNaN(parsed.getTime()) ? '' : parsed.toISOString().slice(0, 10);
}

/** Calendar-month totals from completed ledger entries, never expected income or internal transfers. */
export function getMonthlyInsights(state = {}, selectedMonth, now = new Date()) {
  const date = utcDate(now), today = date.toISOString().slice(0, 10), currentMonth = today.slice(0, 7);
  const month = normalizeInsightsMonth(selectedMonth, date), isCurrent = month === currentMonth;
  const previousMonth = shiftMonth(month, -1), elapsedDay = date.getUTCDate();
  const selectedLastDay = isCurrent ? elapsedDay : dayCount(month);
  const previousLastDay = isCurrent ? Math.min(elapsedDay, dayCount(previousMonth)) : dayCount(previousMonth);
  const transactions = (Array.isArray(state.transactions) ? state.transactions : []).filter(tx => tx && validMoney(tx.amount) && tx.amount > 0);
  const inPeriod = (tx, period, lastDay) => {
    const at = transactionDate(tx);
    return at.slice(0, 7) === period && Number(at.slice(8, 10)) <= lastDay;
  };
  const selected = transactions.filter(tx => inPeriod(tx, month, selectedLastDay));
  const isSpending = tx => ['payment','card-purchase'].includes(tx.type) && tx.direction === 'out' && tx.status === 'success' && tx.rail !== 'internal';
  const spendingCost = tx => Math.max(0,tx.amount-(tx.type==='card-purchase'?asMoney(tx.refunded):0))+asMoney(tx.fee);
  const spending = selected.filter(isSpending);
  const spent = spending.reduce((total, tx) => total + spendingCost(tx), 0);
  const moneyIn = selected.filter(tx => tx.type === 'income' && tx.direction === 'in' && tx.status === 'success' && tx.rail !== 'internal').reduce((total, tx) => total + tx.amount, 0);
  const held = selected.filter(tx => ['payment','card-purchase'].includes(tx.type) && tx.direction === 'out' && tx.status === 'pending' && tx.rail !== 'internal').reduce((total, tx) => total + tx.amount+asMoney(tx.fee), 0);
  const previousSpent = transactions.filter(tx => inPeriod(tx, previousMonth, previousLastDay) && isSpending(tx)).reduce((total, tx) => total + spendingCost(tx), 0);
  const hasPlan = !!state.budget?.created;
  const planItems = Array.isArray(state.budget?.items) ? state.budget.items : [];
  const planTotal = isCurrent && hasPlan ? planItems.reduce((total, item) => total + asMoney(item.amount), 0) : null;
  const planRemaining = isCurrent && hasPlan ? planItems.reduce((total, item) => total + Math.max(0, asMoney(item.amount) - asMoney(item.spent)), 0) : null;
  // The month and the current plan may have different dates. Never divide a
  // month's ledger spending by a renewed weekly plan. The ring describes only
  // the current plan's own commitments, including its pending payment holds.
  const planUsed = isCurrent && hasPlan ? planItems.reduce((total, item) => total + asMoney(item.spent), 0) : null;
  const planPercent = planTotal > 0 ? Math.round(planUsed / planTotal * 100) : null;
  const planDates = isCurrent && hasPlan && /^\d{4}-\d{2}-\d{2}$/.test(state.budget.startDate || '') && /^\d{4}-\d{2}-\d{2}$/.test(state.budget.endDate || '')
    ? `${new Date(state.budget.startDate + 'T00:00:00Z').toLocaleDateString('en-GH', { day: 'numeric', month: 'short', timeZone: 'UTC' })}–${new Date(state.budget.endDate + 'T00:00:00Z').toLocaleDateString('en-GH', { day: 'numeric', month: 'short', timeZone: 'UTC' })}` : '';
  const grouped = new Map();
  for (const tx of spending) {
    const category = typeof tx.category === 'string' && tx.category.trim() ? tx.category.trim() : 'Other';
    grouped.set(category, (grouped.get(category) || 0) + spendingCost(tx));
  }
  const categories = [...grouped].map(([name, amount]) => ({ name, amount, percent: spent ? Math.round(amount / spent * 100) : 0 })).sort((a, b) => b.amount - a.amount || a.name.localeCompare(b.name));
  const comparison = {
    available: previousSpent > 0,
    direction: spent < previousSpent ? 'lower' : spent > previousSpent ? 'higher' : 'same',
    percent: previousSpent > 0 ? Math.round(Math.abs(spent - previousSpent) / previousSpent * 100) : null,
    period: isCurrent ? 'vs the same days last month' : 'vs last month',
  };
  const noticed = !comparison.available ? 'Your first month is taking shape.' : comparison.percent === 0 ? 'Your spending is about the same as last month.' : `You’ve spent ${comparison.percent}% ${comparison.direction} ${isCurrent ? 'than at this point last month' : 'than the month before'}.`;
  return { month, label: monthLabel(month), shortLabel: monthLabel(month, true), isCurrent, spent, moneyIn, moneyOut: spent, held, planTotal, planRemaining, planUsed, planDates, planPercent, ringPercent: planPercent === null ? 0 : Math.min(100, planPercent), previousSpent, comparison, categories, noticed };
}


function categoryRows(categories, hidden) {
  return categories.map(category => `<div class="insights-ref-category"><span class="insights-ref-category-icon">${icon(categorySymbol(category.name),22)}</span><div class="insights-ref-category-body"><div class="insights-ref-category-top"><strong>${esc(category.name)}</strong><span>${hidden ? '••••.••' : cash(category.amount)}</span><small>${hidden ? '••%' : `${category.percent}%`}</small></div><div class="insights-ref-bar" aria-hidden="true"><span style="width:${hidden ? 0 : category.percent}%"></span></div></div></div>`).join('');
}

export function renderInsights(ctx, route = {}) {
  const insights = getMonthlyInsights(ctx.state, route.month), plan = getMonthlyInsights(ctx.state), hidden = !!ctx.state.settings?.hideBalance;
  const planView = route.insightsView === 'plan';
  const totalSize = Math.max(18, 32 - Math.max(0, cash(insights.spent).length - 9) * 2);
  const money = value => hidden ? '••••.••' : value === null ? '—' : cash(value);
  const comparison = hidden ? 'Your amounts are hidden' : !insights.comparison.available ? 'No earlier spending to compare yet' : insights.comparison.percent === 0 ? `About the same ${insights.comparison.period}` : `<span class="insights-ref-comparison-number">${insights.comparison.direction === 'lower' ? '↓' : '↑'} ${insights.comparison.percent}% ${insights.comparison.direction}</span> ${insights.comparison.period}`;
  const ringValue = hidden ? '••%' : plan.planPercent === null ? '—' : `${plan.planPercent}%`;
  const ringCaption = hidden ? 'hidden' : plan.planPercent === null ? 'No plan yet' : 'used or held';
  const ringProgress = hidden ? 0 : plan.ringPercent;
  const planContent = !(plan.planTotal > 0) ? `<div class="insights-ref-empty insights-ref-empty-plan"><h2>Give your money a purpose.</h2><p>Create a budget for the costs ahead.</p><button type="button" class="button" data-insights-action="plan">Create a budget ${icon('arrow', 18)}</button></div>` : `
    <div class="insights-ref-plan" aria-label="Current plan usage"><div class="insights-ref-ring" style="--insights-progress:${ringProgress}%" aria-label="${hidden ? 'Plan percentage hidden' : esc(ringValue + ' of this plan used or held')}"><div><strong>${ringValue}</strong><small>${ringCaption}</small></div></div><div class="insights-ref-plan-copy"><p class="insights-ref-plan-label">Still set aside</p><strong class="insights-ref-plan-amount">${money(plan.planRemaining)}</strong></div></div>
    <div class="insights-ref-plan-breakdown"><div><span>Original budget</span><strong>${money(plan.planTotal)}</strong></div><div><span>Used or held</span><strong>${money(plan.planUsed)}</strong></div></div>
    <details class="insights-ref-explanation"><summary>How this plan works ${icon('chevron', 14)}</summary><p>Used or held includes pending payments already assigned to these budget categories. Still set aside is what remains in those categories.</p><p>These are your current plan’s dates. Monthly spending is shown separately. Keep-back, Money Boxes and IOUs stay outside this chart.</p></details>
    <button type="button" class="insights-ref-plan-link" data-insights-action="plan">Review my plan ${icon('arrow', 18)}</button>`;
  return `<section class="insights-ref" style="--insights-total-size:${totalSize}px" aria-label="${planView ? 'Current plan insights' : 'Monthly spending insights'}">
    <header class="insights-ref-heading${planView ? ' insights-ref-heading--plan' : ''}"><div><h1>Insights</h1><p>${planView ? `Current plan${plan.planDates ? ` · ${esc(plan.planDates)}` : ''}` : 'Spending, month by month.'}</p></div>${planView ? '' : `<button type="button" class="insights-ref-month" data-insights-action="month" aria-label="Choose month, ${esc(insights.label)}">${icon('calendar', 17)}<span>${esc(insights.shortLabel)}</span><span class="insights-ref-down">${icon('chevron', 13)}</span></button>`}</header>
    <nav class="insights-ref-views" aria-label="Insight views"><button type="button" data-insights-action="view-month" aria-pressed="${!planView}">${insights.isCurrent ? 'This month' : esc(insights.shortLabel)}</button><button type="button" data-insights-action="view-plan" aria-pressed="${planView}">This plan</button></nav>
    ${planView ? planContent : `
    <div class="insights-ref-summary"><div class="insights-ref-spending"><p>${insights.isCurrent ? 'Spent this month' : 'Spent in ' + esc(insights.shortLabel)}</p><strong class="insights-ref-total">${money(insights.spent)}</strong><p class="insights-ref-comparison">${comparison}</p></div>
      <div class="insights-ref-statistics"><div><span>Money in</span><strong>${money(insights.moneyIn)}</strong></div><div><span>Money out</span><strong>${money(insights.moneyOut)}</strong></div></div>${insights.held && !hidden ? `<p class="insights-ref-hold-note">${cash(insights.held)} pending, excluded from spending.</p>` : ''}
    </div>
    <div class="insights-ref-category-heading"><h2>Where your money went</h2>${insights.categories.length ? `<button type="button" data-insights-action="categories">See all ${icon('arrow', 17)}</button>` : ''}</div>
    <div class="insights-ref-categories">${insights.categories.length ? categoryRows(insights.categories.slice(0, 4), hidden) : '<div class="insights-ref-empty">No completed payments this month.<br>Your spending will appear here.</div>'}</div>
    <button type="button" class="insights-ref-noticed" data-insights-action="noticed"><img src="/assets/lux-chat-2d.webp" width="52" height="52" alt=""><span><small>Lux noticed</small><strong>${hidden ? 'Show your balances to see your spending insight.' : esc(insights.noticed)}</strong></span>${icon('chevron', 18)}</button>`}
  </section>`;
}

function availableMonths(state, now = new Date()) {
  const current = normalizeInsightsMonth(null, now), months = new Set(Array.from({ length: 12 }, (_, offset) => shiftMonth(current, -offset)));
  for (const tx of state.transactions || []) {
    const month = transactionDate(tx).slice(0, 7);
    if (month && normalizeInsightsMonth(month, now) === month) months.add(month);
  }
  return [...months].sort().reverse();
}

export function bindInsights(ctx, route = {}) {
  const root = ctx.$('.insights-ref');
  if (!root) return () => {};
  let alive = true;
  const click = event => {
    const button = event.target.closest('button[data-insights-action]');
    if (!alive || !root.isConnected || !button || button.disabled) return;
    const insights = getMonthlyInsights(ctx.state, route.month), hidden = !!ctx.state.settings?.hideBalance;
    if (button.dataset.insightsAction === 'view-month' || button.dataset.insightsAction === 'view-plan') {
      ctx.go({ ...route, section: 'activity', page: 'insights', insightsView: button.dataset.insightsAction === 'view-plan' ? 'plan' : 'month' }, { replace: true });
      return;
    }
    if (button.dataset.insightsAction === 'plan') {
      ctx.go({ section: 'plan', page: 'home', returnTo: { ...route, section: 'activity', page: 'insights', insightsView: 'plan' } });
      return;
    }
    if (button.dataset.insightsAction === 'month') {
      ctx.sheet(`<div class="insights-ref-sheet"><h2>Pick a month</h2><p>Take a look at your money over time.</p><div class="insights-ref-month-list">${availableMonths(ctx.state).map(month => `<button type="button" data-insights-month="${month}"${month === insights.month ? ' aria-current="true"' : ''}><span>${esc(monthLabel(month))}</span>${month === insights.month ? icon('check', 20) : icon('chevron', 16)}</button>`).join('')}</div></div>`, sheet => {
        sheet.querySelectorAll('[data-insights-month]').forEach(option => option.addEventListener('click', () => {
          if (!alive || !root.isConnected) return;
          const month = normalizeInsightsMonth(option.dataset.insightsMonth);
          ctx.closeSheet();
          ctx.go({ ...route, section: 'activity', page: 'insights', month }, { replace: true });
        }));
      });
    }
    if (button.dataset.insightsAction === 'categories') {
      ctx.sheet(`<div class="insights-ref-sheet"><h2>Where your money went</h2><p>${esc(insights.label)} · completed payments only</p><div class="insights-ref-categories insights-ref-categories--all">${categoryRows(insights.categories, hidden)}</div><p class="insights-ref-sheet-note">Savings and group transfers aren’t spending. Pending, failed and reversed payments are excluded.</p></div>`);
    }
    if (button.dataset.insightsAction === 'noticed') {
      ctx.draft.chatPendingQuestion = `Explain my spending for ${insights.label}.`;
      ctx.saveDraft?.();
      ctx.go({ section: 'chat', page: 'home', returnTo: { ...route, section: 'activity', page: 'insights', month: insights.month } });
    }
  };
  root.addEventListener('click', click);
  return () => { alive = false; root.removeEventListener('click', click); };
}
