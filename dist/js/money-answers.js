import { getSummary, getGuidanceHorizon, evaluatePayment, budgetCategoryKey } from './model.js';
import { cash, dateLabel } from './ui.js';
import { readChatAmount, financialInputAmbiguity, clarifyFinancialInput } from './chat-action-model.js';

function n(value) { return Number.isFinite(Number(value)) ? Number(value) : 0; }
function sum(items, fn) { return items.reduce((total, item) => total + n(fn(item)), 0); }
function openIOUs(state, type) { return (state.ious || []).filter(iou => iou.type === type && iou.status === 'open'); }
function iouRemaining(iou) { return Math.max(0, n(iou.amount) - n(iou.paid)); }
function amountIn(question) {
  const parsed = readChatAmount(question);
  return parsed.found && !parsed.invalid ? parsed.amount : null;
}
function action(label, section, page = 'home', rest = {}) { return { label, route: { section, page, ...rest } }; }
function horizonCopy(state, now) {
  const horizon = getGuidanceHorizon(state, now), today = now.toISOString().slice(0, 10);
  if (!horizon.date) return 'No planning end date is recorded, so this is a current balance, not a daily spending guide.';
  if (horizon.date < today) return horizon.source === 'income'
    ? `Your expected income date, ${dateLabel(horizon.date)}, has passed. Refresh the timing before relying on a daily guide.`
    : `Your ${horizon.source === 'recovery' ? 'check-in' : 'plan end'} date, ${dateLabel(horizon.date)}, has passed. Review the timing before relying on a daily guide.`;
  return horizon.source === 'income' ? `Your recorded expected income date is ${dateLabel(horizon.date)}; that money is not included.`
    : horizon.source === 'recovery' ? `Your recorded recovery check-in is ${dateLabel(horizon.date)}.`
      : `Your recorded plan runs through ${dateLabel(horizon.date)}.`;
}
function summaryOf(state, now) {
  const summary = getSummary(state, now);
  return { ...Object.fromEntries(['available', 'planned', 'spendable', 'savings', 'cardTotal', 'transferHolds', 'pendingPaymentHolds', 'pendingCardHolds', 'pendingContributionHolds', 'total', 'outsideTotal', 'allMoneyTotal', 'expected', 'daysLeft', 'dailyAllowance'].map(key => [key, n(summary[key])])), guidanceDate: summary.guidanceDate, planEndDate: summary.planEndDate };
}
function allMoneyAnswer(state, summary) {
  const hasOutsideBalances = (state.externalBalances || []).length > 0;
  return {
    title: 'Here is the money you hold.',
    paragraphs: [
      `${cash(summary.allMoneyTotal)} is your total recorded money: ${cash(summary.total)} in Lumo and ${cash(summary.outsideTotal)} outside Lumo.`,
      `Your Lumo total includes ${cash(summary.available)} in your spending account and ${cash(summary.savings)} in Money Boxes.`,
      ...(summary.cardTotal ? [`A further ${cash(summary.cardTotal)} is held on virtual cards. It is separate from Everyday payment money.`] : []),
      ...(summary.transferHolds ? [`${cash(summary.transferHolds)} is held for a pending internal transfer. It is included once in your total, but cannot be spent while held.`] : []),
      ...(summary.pendingPaymentHolds ? [`${cash(summary.pendingPaymentHolds)} is held for pending payments. It is counted once in your total and cannot be spent again.`] : []),
      ...(summary.pendingCardHolds ? [`${cash(summary.pendingCardHolds)} is held for pending card purchases, separate from your remaining card balance.`] : []),
      ...(summary.pendingContributionHolds ? [`${cash(summary.pendingContributionHolds)} is held for pending group contributions. It stays in your recorded money until confirmed or returned.`] : []),
      hasOutsideBalances
        ? 'Outside balances are manually recorded, so update them when they change. They do not increase your Lumo payment balance or left after plan.'
        : 'You have not added outside balances yet. Add cash, another bank or MoMo in All your money to see the full picture.',
      'Expected income, unpaid IOUs and group collections stay separate from this total.'
    ],
    stats: [{ label: 'In Lumo', value: cash(summary.total) }, { label: 'Outside Lumo', value: cash(summary.outsideTotal) }, { label: 'All recorded money', value: cash(summary.allMoneyTotal) }],
    actions: [action('All your money', 'life', 'overview')]
  };
}
function remaining(item) { return Math.max(0, n(item.amount) - n(item.spent)); }
function budgetMatch(state, question) {
  const q = question.toLowerCase();
  const synonyms = { food: /food|gɔbɛ|gobe|lunch|breakfast|dinner|meal|waakye|jollof/, transport: /transport|trotro|tro tro|ride|uber|bolt|fare/, data: /data|airtime|internet|bundle/, essentials: /essentials|toiletr|laundry/ };
  return (state.budget?.items || []).find(item => {
    const name = String(item.name || '').toLowerCase();
    return name.length > 2 && q.includes(name) || Object.entries(synonyms).some(([key, re]) => name.includes(key) && re.test(q));
  });
}
function nextDateLabel(state) {
  return state.income?.nextDate ? dateLabel(state.income.nextDate) : 'your next income';
}
const calendarMonths = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

const scopeText = value => String(value || '').trim().toLowerCase().replace(/[’‘]/g, "'").replace(/gɔbɛ/g, 'gobe');
const scopeMention = (question, value) => value.length > 1 && new RegExp(`(?:^|[^\\p{L}\\p{N}])${value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?=$|[^\\p{L}\\p{N}])`, 'u').test(question);
const spendingAliases = { Food: /\b(?:food|lunch|breakfast|dinner|meal|waakye|jollof|gobe)\b/, Transport: /\b(?:transport|trotro|tro tro|ride|uber|bolt|fare|shuttle)\b/, Data: /\b(?:data|airtime|internet|bundle)\b/, Essentials: /\b(?:essentials|toiletries|laundry)\b/ };

/** Only recognised categories or recorded merchants can narrow a spending total. */
export function getSpendingScope(state, question) {
  const q = scopeText(question);
  const merchants = [...new Set((state.transactions || []).flatMap(tx => [tx.merchant, tx.recipient?.name]).filter(name => typeof name === 'string' && name.trim().length > 2))].filter(name => scopeMention(q, scopeText(name)));
  const categoryQuestion = merchants.reduce((text, merchant) => text.replaceAll(scopeText(merchant), ''), q);
  const available = [...new Map([...Object.keys(spendingAliases), ...(state.budget?.items || []).map(item => item.name), ...(state.transactions || []).map(tx => tx.category)].filter(name => typeof name === 'string' && name.trim().length > 1).map(name => [budgetCategoryKey(name), name])).values()];
  const matchesCategory = (name, question) => budgetCategoryKey(name) === budgetCategoryKey(question) || scopeMention(question, scopeText(name)) || Object.entries(spendingAliases).some(([alias, pattern]) => budgetCategoryKey(name) === budgetCategoryKey(alias) && pattern.test(question));
  const categories = available.filter(name => matchesCategory(name, categoryQuestion) && (scopeText(name) !== 'other' || /\bon other\b/.test(categoryQuestion)));
  const distinct = [...new Map(categories.map(name => [budgetCategoryKey(name), name])).values()];
  const candidate = q.match(/\b(?:on|at|to)\s+(.+?)(?=\s+(?:today|yesterday|this\s+(?:week|month|year)|last\s+|past\s+|from\s+|between\s+|(?:in|for|during)\s+(?:january|february|march|april|may|june|july|august|september|october|november|december|\d{4}))|[?.!]|$)/)?.[1];
  const qualifier = candidate && !/^(?:\d{4}-\d{2}-\d{2}|\d{1,2}\s+(?:january|february|march|april|may|june|july|august|september|october|november|december)\b)/.test(candidate) ? candidate : '';
  if ((merchants.length || distinct.length || qualifier) && /\b(?:not|except|excluding|without|versus|vs|compare|comparison|instead|rather|opposed)\b/.test(q)) return { unsupported: true, query: '', label: '' };
  if (qualifier && qualifier.split(/\s+(?:and|or|at|on)\s+|\s*[&,/]\s*/).some(target => !/^(?:\d{4}-\d{2}-\d{2}|\d{1,2}\s+(?:january|february|march|april|may|june|july|august|september|october|november|december)\b)/.test(target) && !available.some(name => matchesCategory(name, target)) && !merchants.some(name => scopeMention(target, scopeText(name))))) return { unsupported: true, query: `on ${qualifier.slice(0, 100)}`, label: '' };
  if (merchants.length && distinct.length) { const query = `on ${distinct.join(' and ')} at ${merchants.join(' and ')}`; return { merchants, categories: distinct, query, label: query }; }
  if (merchants.length) return { merchants, categories: [], query: `at ${merchants.join(' and ')}`, label: `at ${merchants.join(' and ')}` };
  if (distinct.length) return { categories: distinct, merchants: [], query: `on ${distinct.join(' and ')}`, label: `on ${distinct.join(' and ')}` };
  if (qualifier) return { unsupported: true, query: `on ${qualifier.slice(0, 100)}`, label: '' };
  return { categories: [], merchants: [], query: '', label: '' };
}

/** A named month is an exact UTC calendar range, including its final day. */
export function getSpendingPeriod(question, now = new Date()) {
  const q = String(question).toLowerCase();
  const named = q.match(/\b(january|february|march|april|may|june|july|august|september|october|november|december)\s+((?:19|20|21)\d{2})\b/);
  const today = now.toISOString().slice(0, 10);
  const dateAfter = (day, count = 1) => new Date(Date.parse(day + 'T00:00:00Z') + count * 86400000).toISOString().slice(0, 10);
  const validDate = value => /^\d{4}-\d{2}-\d{2}$/.test(value) && Number.isFinite(Date.parse(value + 'T00:00:00Z')) && new Date(value + 'T00:00:00Z').toISOString().slice(0, 10) === value;
  const exactDay = q.match(/\bon\s+(\d{4}-\d{2}-\d{2})\b/);
  const naturalDay = q.match(/\bon\s+(\d{1,2})\s+(january|february|march|april|may|june|july|august|september|october|november|december)\s+((?:19|20|21)\d{2})\b/);
  if (exactDay || naturalDay) {
    const day = exactDay ? exactDay[1] : `${naturalDay[3]}-${String(calendarMonths.findIndex(name => name.toLowerCase() === naturalDay[2]) + 1).padStart(2, '0')}-${naturalDay[1].padStart(2, '0')}`;
    if (!validDate(day) || day > today) return { label: 'on that date', unsupported: true, reason: 'Use a valid date today or earlier, such as on YYYY-MM-DD.' };
    return { label: `on ${day}`, start: day, end: dateAfter(day) };
  }
  const range = q.match(/\b(?:from|between)\s+(\d{4}-\d{2}-\d{2})\s+(?:to|through|and|until)\s+(\d{4}-\d{2}-\d{2})\b/);
  if (range) {
    if (!validDate(range[1]) || !validDate(range[2]) || range[1] > range[2]) return { label: 'for that date range', unsupported: true, reason: 'Use a valid start and end date, with the start first.' };
    if (range[1] > today) return { label: 'for that date range', unsupported: true, reason: 'That range is still ahead. I can check money already recorded.' };
    return { label: `from ${range[1]} to ${range[2]}`, start: range[1], end: dateAfter(range[2]), through: today };
  }
  const naturalRange = q.match(/\b(?:from|between)\s+(\d{1,2})\s+([a-z]+)\s+(\d{4})\s+(?:to|through|and|until)\s+(\d{1,2})\s+([a-z]+)\s+(\d{4})\b/);
  if (naturalRange) {
    const toISO = (d, m, y) => { const month = calendarMonths.findIndex(name => name.toLowerCase() === m || name.slice(0, 3).toLowerCase() === m); return month < 0 ? '' : `${y}-${String(month + 1).padStart(2, '0')}-${d.padStart(2, '0')}`; };
    const start = toISO(naturalRange[1], naturalRange[2], naturalRange[3]), end = toISO(naturalRange[4], naturalRange[5], naturalRange[6]);
    return getSpendingPeriod(`from ${start} to ${end}`, now);
  }
  if (/\b(?:last|this) week\b/.test(q)) {
    const weekStart = dateAfter(today, -((now.getUTCDay() + 6) % 7));
    const last = /\blast week\b/.test(q);
    return { label: last ? 'last week (Monday to Sunday)' : 'this week (Monday onwards)', start: last ? dateAfter(weekStart, -7) : weekStart, end: last ? weekStart : dateAfter(weekStart, 7), ...(last ? {} : { through: today }) };
  }
  const rollingDays = q.match(/\b(?:last|past)\s+(\d{1,4})\s+days?\b/);
  if (rollingDays) {
    const days = Number(rollingDays[1]);
    if (!days || days > 3660) return { label: 'for that period', unsupported: true, reason: 'Choose a date range or up to 3,660 days.' };
    return { label: `in the last ${days} days, including today`, start: dateAfter(today, 1 - days), end: dateAfter(today), through: today };
  }
  if (/\byesterday\b/.test(q)) return { label: 'yesterday', start: dateAfter(today, -1), end: today };
  if (/\blast month\b/.test(q)) {
    const prior = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1));
    return getSpendingPeriod(`${calendarMonths[prior.getUTCMonth()]} ${prior.getUTCFullYear()}`, now);
  }
  const year = q.match(/\b(?:in|for|during)\s+((?:19|20|21)\d{2})\b/);
  if (/\b(?:last|this) year\b/.test(q) || year) {
    const value = year ? Number(year[1]) : now.getUTCFullYear() - (/\blast year\b/.test(q) ? 1 : 0);
    return { label: `in ${value}`, start: `${value}-01-01`, end: `${value + 1}-01-01`, ...(value === now.getUTCFullYear() ? { through: today } : {}) };
  }
  if (named) {
    const index = calendarMonths.findIndex(month => month.toLowerCase() === named[1]);
    const month = `${named[2]}-${String(index + 1).padStart(2, '0')}`;
    const end = new Date(Date.UTC(Number(named[2]), index + 1, 1)).toISOString().slice(0, 10);
    return { label: `in ${calendarMonths[index]} ${named[2]}`, month, start: `${month}-01`, end, through: month === today.slice(0, 7) ? today : null };
  }
  if (/today/.test(q)) return { label: 'today', start: today, end: new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1)).toISOString().slice(0, 10) };
  if (/this month/.test(q)) return { label: 'this month', start: `${today.slice(0, 7)}-01`, end: new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1)).toISOString().slice(0, 10), through: today };
  if (/\b(?:week|weeks|month|months|year|years|semester|term|fortnight|days? ago|from|between|monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b/.test(q)) return { label: 'for that period', unsupported: true, reason: 'Give me an exact period: last week, this month, the last 7 days, or from YYYY-MM-DD to YYYY-MM-DD.' };
  return { label: 'in your recorded history', start: null, end: null };
}

export function paymentTransactions(state, question, now, scope = getSpendingScope(state, question)) {
  const period = getSpendingPeriod(question, now);
  return (state.transactions || []).filter(tx => {
    if (!['payment', 'card-purchase'].includes(tx.type) || tx.status !== 'success' || tx.direction !== 'out' || tx.rail === 'internal' || !Number.isSafeInteger(tx.amount) || tx.amount <= 0) return false;
    if (scope.categories.length && !scope.categories.some(category => budgetCategoryKey(category) === budgetCategoryKey(tx.category || 'Other'))) return false;
    if (scope.merchants.length && !scope.merchants.some(merchant => [tx.merchant, tx.recipient?.name].some(name => scopeText(name) === scopeText(merchant)))) return false;
    const at = new Date(tx.at);
    if (Number.isNaN(at.getTime())) return false;
    const day = at.toISOString().slice(0, 10);
    return (!period.start || day >= period.start) && (!period.end || day < period.end) && (!period.through || day <= period.through);
  }).map(tx => ({ ...tx, amount: Math.max(0, tx.amount - (tx.type === 'card-purchase' ? n(tx.refunded) : 0)) + n(tx.fee) })).filter(tx => tx.amount > 0);
}

/** Refund arrivals are separate facts, never silently netted against another period. */
export function merchantRefundTransactions(state, period, scope) {
  return (state.transactions || []).filter(tx => {
    if (tx.type !== 'refund' || tx.status !== 'success' || tx.direction !== 'in' || !Number.isSafeInteger(tx.amount) || tx.amount <= 0) return false;
    const original = (state.transactions || []).find(value => value.id === tx.parentPaymentId || tx.originalPaymentId && value.ledgerJournalId === tx.originalPaymentId);
    if (scope.categories.length && !scope.categories.some(category => budgetCategoryKey(category) === budgetCategoryKey(original?.category || tx.category || 'Other'))) return false;
    if (scope.merchants.length && !scope.merchants.some(merchant => [original?.merchant, tx.merchant].some(name => scopeText(name) === scopeText(merchant)))) return false;
    const at = new Date(tx.at); if (Number.isNaN(at.getTime())) return false;
    const day = at.toISOString().slice(0, 10);
    return (!period.start || day >= period.start) && (!period.end || day < period.end) && (!period.through || day <= period.through);
  });
}

/** Local prototype guidance. Every amount is read from the current model. */
export function getMoneyAnswer(state, question, now = new Date()) {
  const q = String(question).trim().toLowerCase();
  const generalSpendQuestion = /^(?:what|how much)(?: money)? can i (?:spend|use)(?:(?: in| from)? lumo)?(?: now)?[.!?\s]*$/.test(q);
  if (financialInputAmbiguity(q) === 'currency') return clarifyFinancialInput('currency');
  const summary = summaryOf(state, now);
  const amount = amountIn(q);
  const buffer = n(state.buffer);
  const items = state.budget?.items || [];
  const asksOutsideMoney = (/\boutside (?:of )?lumo\b/.test(q)
      || /\b(?:cash|momo|mobile money|other banks?|another bank|external accounts?)\b/.test(q)
        && /\b(?:balance|balances|account|accounts|have|hold|held|record|recorded|track|update|add|my|total|money)\b/.test(q))
    && !/\b(?:pay|spend|spent|buy|afford|send|transfer|repay|save|saving)\b/.test(q);

  if (asksOutsideMoney) return allMoneyAnswer(state, summary);

  if (/allowance.*late|late.*allowance|income.*late|money.*late|hasn.t arrived|not arrived|haven.t been paid|haven't been paid|recover|recovery/.test(q)) {
    return {
      title: 'Let’s work with what is here.',
      paragraphs: [
        `You have ${cash(summary.available)} in your spending account. After your current commitments and ${cash(buffer)} buffer, ${cash(summary.spendable)} is left after plan.`,
        'We can review what is due, protect the essentials and choose a temporary daily limit. Your expected allowance stays outside the money available to spend.'
      ],
      actions: [action('Make a recovery plan', 'life', 'recovery'), action('Review my plan', 'plan')]
    };
  }

  if (/owe me|owed to me|iou|expected|on the way|coming in|next allowance|next income|when.*allowance/.test(q)) {
    const incoming = openIOUs(state, 'owedToMe');
    const allowance = n(state.income?.amount);
    const ious = sum(incoming, iouRemaining);
    return {
      title: 'Expected, until it arrives.',
      paragraphs: [
        allowance ? `Your next recorded income is ${cash(allowance)}, expected ${nextDateLabel(state)}.` : 'You have not recorded a next income amount yet.',
        incoming.length ? `${incoming.length === 1 ? incoming[0].name + ' owes' : incoming.length + ' people owe'} you ${cash(ious)} in total. Neither an unpaid IOU nor expected income increases your available balance. Mark money as received only when it has arrived.` : 'There are no open IOUs owed to you. Any new money becomes available when you record it as received.'
      ],
      stats: [{ label: 'Available now', value: cash(summary.available) }, { label: 'Expected income + IOUs', value: cash(allowance + ious) }],
      actions: [action('View IOUs', 'life', 'ious'), action('All your money', 'life', 'overview')]
    };
  }

  if (/what.*owe|\bi owe\b|owe someone|owe people|my debt|debts|repay/.test(q)) {
    const outgoing = openIOUs(state, 'owedByMe');
    return {
      title: outgoing.length ? 'Here is what you owe.' : 'No open debts recorded.',
      paragraphs: outgoing.length ? [
        `You have ${outgoing.length} open ${outgoing.length === 1 ? 'IOU' : 'IOUs'} totalling ${cash(sum(outgoing, iouRemaining))}.`,
        ...outgoing.slice(0, 3).map(item => `${item.name}: ${cash(iouRemaining(item))} still owed, due ${dateLabel(item.due)}.`),
        'Due repayments are included in your planned commitments. Settle an IOU only when you actually repay it.'
      ] : ['If you borrow money, record who you owe, how much and when it is due. Lumo can then include the commitment in your plan.'],
      actions: [action('View IOUs', 'life', 'ious')]
    };
  }

  if (/where.*money|where.*spen|spending|spent|biggest|transactions|money go/.test(q)) {
    const requested = getSpendingPeriod(q, now);
    if (requested.unsupported) return { title: 'Which dates should I check?', paragraphs: [requested.reason], actions: [action('Open activity', 'activity')] };
    const scope = getSpendingScope(state, q);
    if (scope.unsupported) return { title: 'Which category or merchant should I check?', paragraphs: ['Use a recorded category, such as Food, Transport or Data, or the exact merchant name. I won’t substitute your total spending.'], actions: [action('Open activity', 'activity')] };
    const transactions = paymentTransactions(state, q, now, scope);
    const categories = new Map();
    for (const tx of transactions) {
      const category = tx.category || 'Other';
      categories.set(category, (categories.get(category) || 0) + n(tx.amount));
    }
    const sorted = [...categories.entries()].sort((a, b) => b[1] - a[1]);
    const total = sum(transactions, tx => tx.amount);
    const { label: period, month } = getSpendingPeriod(q, now);
    const refunds = sum(merchantRefundTransactions(state, requested, scope), tx => tx.amount);
    return {
      title: transactions.length ? `${cash(total)} ${scope.label || 'in completed payments'}${refunds ? ', before merchant refunds' : ''}.` : `No completed payments${scope.label ? ` ${scope.label}` : ''} ${period}.`,
      paragraphs: transactions.length ? [
        `That covers ${transactions.length} ${transactions.length === 1 ? 'payment' : 'payments'}${scope.label ? ` ${scope.label}` : ''} ${period}.`,
        `Your biggest category is ${sorted[0][0]} at ${cash(sorted[0][1])}. Savings transfers are kept separate from spending. Pending, failed and reversed payments are excluded.`,
        ...(refunds ? [`${cash(refunds)} in merchant refunds arrived ${period}${scope.label ? ` ${scope.label}` : ''}. These are shown separately in Activity; this payment total is before those refunds. Card refunds already reduce the card purchases shown here.`] : [])
      ] : ['Savings transfers and money you expect to receive are kept separate. Your spending story develops as you make payments.', ...(refunds ? [`${cash(refunds)} in merchant refunds arrived ${period}. A refund can relate to an earlier payment, so it is shown separately in Activity.`] : [])],
      stats: [...sorted.slice(0, 3).map(([label, value]) => ({ label, value: cash(value) })), ...(refunds ? [{ label: 'Merchant refunds received', value: cash(refunds) }] : [])],
      actions: [month ? action('View month’s insights', 'activity', 'insights', { month }) : action('Open Money Story', 'life', 'story'), action('Review my plan', 'plan')]
    };
  }

  if (/save|saving|money box|goal|round.?up|hack/.test(q)) {
    if ((/\b(?:saved|saving transfers|moved to savings|put aside)\b/.test(q) || /\bhow much\b.*\bsave\b/.test(q)) && /\b(?:today|yesterday|week|month|days?|year|from|between|recorded history)\b/.test(q)) {
      const period = getSpendingPeriod(q, now);
      if (period.unsupported) return { title: 'Which dates should I check?', paragraphs: [period.reason], actions: [action('See Money Boxes', 'boxes')] };
      const records = (state.transactions || []).filter(tx => ['saving', 'withdrawal'].includes(tx.type) && tx.status === 'success' && tx.rail === 'internal' && Number.isSafeInteger(tx.amount) && tx.amount > 0 && Number.isFinite(Date.parse(tx.at)) && (!period.start || tx.at.slice(0, 10) >= period.start) && (!period.end || tx.at.slice(0, 10) < period.end) && (!period.through || tx.at.slice(0, 10) <= period.through));
      const added = sum(records.filter(tx => tx.type === 'saving'), tx => tx.amount), taken = sum(records.filter(tx => tx.type === 'withdrawal'), tx => tx.amount);
      return { title: `${cash(added)} added to savings ${period.label}.`, paragraphs: [`You moved ${cash(added)} into Money Boxes and ${cash(taken)} back to Everyday.`, `Your net saving transfers for this period were ${cash(added - taken)}. These are internal moves, not spending or income.`], stats: [{ label: 'Added to savings', value: cash(added) }, { label: 'Moved back', value: cash(taken) }, { label: 'Net transfers', value: cash(added - taken) }], actions: [action('See Money Boxes', 'boxes'), action('Open activity', 'activity')] };
    }
    const ambiguity = financialInputAmbiguity(q);
    if (ambiguity) return clarifyFinancialInput(ambiguity);
    const boxes = state.boxes || [];
    const namedBox = boxes.find(box => q.includes(String(box.name || '').toLowerCase()));
    const box = namedBox || boxes.find(item => n(item.target) > n(item.balance));
    if (amount !== null && amount > 0 && !/round.?up|percent|%/.test(q)) {
      const fits = amount <= summary.spendable;
      return {
        title: fits ? 'That fits the money left after plan.' : 'Let’s protect your commitments first.',
        paragraphs: [
          fits ? `Putting ${cash(amount)} into a Money Box would leave ${cash(summary.spendable - amount)} after your current plan and buffer.` : `You have ${cash(summary.spendable)} left after plan in Lumo. A ${cash(amount)} contribution would use money already committed or exceed your Lumo balance.`,
          fits ? 'A contribution moves money from spending to savings. Your total held money stays the same.' : 'You can still set the goal now and fund it gradually as money arrives.'
        ],
        actions: [box ? action(`Open ${box.name}`, 'boxes', 'detail', { id: box.id }) : action('Create a Money Box', 'boxes', 'create'), action('Review my plan', 'plan')]
      };
    }
    const paragraphs = [`You have ${cash(summary.savings)} across ${boxes.length} Money ${boxes.length === 1 ? 'Box' : 'Boxes'}, separate from ${cash(summary.available)} in your spending account.`];
    if (box) {
      const left = Math.max(0, n(box.target) - n(box.balance));
      paragraphs.push(`${box.name} has ${cash(box.balance)} saved, with ${cash(left)} left to its goal.`);
      if (box.deadline && left > 0) {
        const days = Math.ceil((new Date(box.deadline + (box.deadline.length === 10 ? 'T23:59:59Z' : '')).getTime() - Date.now()) / 86400000);
        if (days > 0) paragraphs.push(`To reach it by ${dateLabel(box.deadline)}, the remaining pace is about ${cash(Math.ceil(left / days))} a day. Check it against money actually received before contributing.`);
        else paragraphs.push('Its target date has arrived. You can adjust the date or amount to make the goal workable.');
      }
    } else paragraphs.push('Give your first goal a name, a target and a date. Lumo will show the saving pace and let you choose a savings hack.');
    return {
      title: box ? 'Give that goal a steady rhythm.' : 'What are you saving for?',
      paragraphs,
      actions: [box ? action(`Open ${box.name}`, 'boxes', 'detail', { id: box.id }) : action('Create a Money Box', 'boxes', 'create'), action('See Money Boxes', 'boxes')]
    };
  }

  if (!generalSpendQuestion && /afford|can i (?:buy|pay|spend)|should i (?:buy|pay|spend)|buy.*\d|pay.*\d|spend.*\d/.test(q)
      && !(amount === null && /today|daily|per day|each day|how much.*spend/.test(q))) {
    const ambiguity = financialInputAmbiguity(q);
    if (ambiguity) return clarifyFinancialInput(ambiguity);
    if (amount === null) return {
      title: 'How much would it cost?',
      paragraphs: [`You have ${cash(summary.spendable)} left after your current plan and buffer. Tell me an amount, such as “Can I spend GH₵50 on lunch?”`],
      actions: [action('Review my plan', 'plan')]
    };
    if (amount <= 0) return { title: 'Let’s use an amount above zero.', paragraphs: ['Tell me what you are considering paying, in Ghana cedis.'] };
    if (!state.budget?.created || !items.length) return {
      title: amount > summary.available ? 'This needs a pause.' : 'Let’s give your essentials a place first.',
      paragraphs: [amount > summary.available ? `The cost is ${cash(amount)}, but your spending account holds ${cash(summary.available)}. The gap is ${cash(amount - summary.available)}. Expected money cannot cover a payment today.` : `You have ${cash(summary.available)} available, but your essential costs are not recorded yet. I cannot tell you this is affordable from balance alone.`, ...(summary.outsideTotal > 0 ? [`Your ${cash(summary.outsideTotal)} recorded outside Lumo is separate from this Lumo payment check.`] : []), 'Add food, transport, fees and anything due before your next income, then let’s check again.'],
      stats: [{ label: 'Considering', value: cash(amount) }, { label: 'Available', value: cash(summary.available) }, { label: 'Left after plan now', value: cash(summary.spendable) }],
      actions: [action('Create my budget', 'plan', 'create'), action('Open payments', 'pay')]
    };
    const budget = budgetMatch(state, q);
    const reserved = budget ? remaining(budget) : 0;
    const impact = evaluatePayment(state, { amount, fee: 0, category: budget?.name || 'Other', ...(budget ? { budgetItemId: budget.id } : {}) }, now);
    const beyondPlan = Math.max(0, amount - impact.budgetAllocation);
    const covered = impact.allowed && impact.rawAfterSpendable >= 0;
    const paragraphs = [];
    if (budget) paragraphs.push(`Your ${budget.name} plan has ${cash(reserved)} left. ${amount <= reserved ? `This payment fits inside it and would leave ${cash(reserved - amount)} in that category.` : `${cash(beyondPlan)} of this payment would sit beyond that remaining plan.`}`);
    if (amount > summary.available) paragraphs.push(`The cost is ${cash(amount)}, but your spending account holds ${cash(summary.available)}. The gap is ${cash(amount - summary.available)}. Expected money cannot cover a payment today.`);
    else if (covered) {
      paragraphs.push(`Before any optional saving hack, your spending balance would become ${cash(impact.afterAvailable)}. ${cash(impact.afterSpendable)} would remain after the rest of your current plan and buffer.`);
      if (impact.needed) paragraphs.push(impact.reason);
    } else if (impact.baselineShortfall > 0) {
      paragraphs.push(`Your plan and buffer already have a ${cash(impact.baselineShortfall)} gap. ${impact.additionalShortfall > 0 ? `This payment adds ${cash(impact.additionalShortfall)} to that gap.` : 'This payment leaves that gap unchanged.'} After it, ${cash(impact.afterAvailable)} would remain against ${cash(impact.afterPlanned)} of commitments and your ${cash(buffer)} buffer. Review the plan before deciding.`);
    } else paragraphs.push(`You have ${cash(summary.spendable)} left after plan. Paying this would use ${cash(Math.max(0, -impact.rawAfterSpendable))} assigned to another commitment or your buffer. Review the plan before deciding.`);
    if (summary.outsideTotal > 0) paragraphs.push(`Your ${cash(summary.outsideTotal)} recorded outside Lumo is separate from this Lumo payment check.`);
    paragraphs.push('This is a check against your recorded plan. The payment review will show the final impact.');
    return {
      title: covered && !impact.needed ? budget && amount <= reserved ? 'That fits your plan.' : 'It fits, with this trade-off.' : 'This needs a pause.',
      paragraphs,
      stats: [{ label: 'Considering', value: cash(amount) }, { label: 'Left after plan now', value: cash(summary.spendable) }],
      actions: [action(covered ? 'Open payments' : 'Review my plan', covered ? 'pay' : 'plan'), action('See all your money', 'life', 'overview')]
    };
  }

  if (!generalSpendQuestion && /today|daily|per day|each day|how much.*spend/.test(q)) {
    const guideDate = getGuidanceHorizon(state, now).date;
    const currentGuideDate = !!guideDate && guideDate.slice(0, 10) >= now.toISOString().slice(0, 10);
    return {
      title: currentGuideDate ? 'Here is your daily guide.' : 'Let’s refresh the timing.',
      paragraphs: currentGuideDate ? [
        `You have ${cash(summary.spendable)} left after your commitments and buffer, across ${summary.daysLeft} ${summary.daysLeft === 1 ? 'day' : 'days'} until ${dateLabel(guideDate)}.`,
        `That works out to about ${cash(summary.dailyAllowance)} a day. It is a guide for the money left after plan; planned food, transport and other commitments are already reserved separately.`
      ] : [
        `You have ${cash(summary.spendable)} left after plan. Update your planning end date before using a daily guide.`,
        'If the allowance is late, build a short recovery plan using only the money already in Lumo.'
      ],
      actions: [action('Review my plan', 'plan'), action('Allowance is late', 'life', 'recovery')]
    };
  }

  if (/all.*money|total|balance.*total|net worth|how much.*have/.test(q)) {
    return allMoneyAnswer(state, summary);
  }

  if (generalSpendQuestion || /why|spendable|left after|available|budget|plan|buffer/.test(q)) {
    const shortage = Math.max(0, summary.planned + buffer - summary.available);
    const recordedPlan = state.budget?.created === true;
    return {
      title: shortage ? 'Your commitments need attention.' : 'Every cedi has a place.',
      paragraphs: [
        `Start with ${cash(summary.available)} available in your spending account. Your remaining planned commitments are ${cash(summary.planned)}, and your safety buffer is ${cash(buffer)}.`,
        `${shortage ? `Together they exceed your available funds by ${cash(shortage)}, so your spendable amount stays at ${cash(0)}.` : `That leaves ${cash(summary.spendable)} after plan.`} ${horizonCopy(state, now)}`,
        recordedPlan ? 'This uses your recorded commitments. Review Plan if an amount, date or breathing room needs changing. Expected income, unpaid incoming IOUs and Money Boxes stay separate.' : 'Your essentials are not recorded as a plan yet, so this balance alone cannot tell you what is affordable. Add them in Plan before deciding. Expected income, unpaid incoming IOUs and Money Boxes stay separate.'
      ],
      stats: [{ label: 'Available', value: cash(summary.available) }, { label: 'Planned commitments', value: cash(summary.planned) }, { label: 'Safety buffer', value: cash(buffer) }, { label: 'Left after plan', value: cash(summary.spendable) }],
      actions: [action(recordedPlan ? 'Review my plan' : 'Create my plan', 'plan'), ...(shortage ? [action('Make a recovery plan', 'life', 'recovery')] : [])]
    };
  }

  if (/hello|hi$|hey|good morning|thanks|thank you/.test(q)) return {
    title: /thank/.test(q) ? 'You’re welcome.' : `Hey ${String(state.profile?.name || '').split(' ')[0] || 'there'}.`,
    paragraphs: [`You have ${cash(summary.spendable)} left after plan. Ask about a payment, your spending or a goal, and we will work from your current numbers.`],
    actions: [action('Review my plan', 'plan'), action('Money Boxes', 'boxes')]
  };

  return {
    title: 'Let’s make that a money question.',
    paragraphs: [
      'This prototype can explain your balances, check an amount against your plan, review recorded spending, look at a saving goal or help with a late allowance.',
      'Try “Can I spend GH₵50?”, “Why is my spendable balance lower?” or “Where did my money go?”'
    ],
    actions: [action('Review my plan', 'plan'), action('All your money', 'life', 'overview')]
  };
}

