/** Small, explicit updates to recorded money. These actions never move Lumo funds. */
const MAX_MONEY = 10000000000;
const DAY = 86400000;
export const OUTSIDE_STALE_DAYS = 3;
export const MAINTENANCE_ACTIONS = new Set(['externalMovement', 'confirmExternalBalance', 'saveCommitment', 'reuseEssentialPlan', 'setEssentialRecurring', 'setMaintenancePreferences', 'completeMoneyCheck']);
const clone = value => JSON.parse(JSON.stringify(value));
const object = value => value && typeof value === 'object' && !Array.isArray(value);
const text = (value, limit = 120) => String(value ?? '').trim().slice(0, limit);
const cents = value => Number.isSafeInteger(value) && value >= 0 && value <= MAX_MONEY;
const revision = value => Number.isSafeInteger(value) && value >= 0 ? value : 0;
const fail = message => ({ ok: false, message });
const ok = (message, data = {}) => ({ ok: true, message, ...data });
const time = value => { const date = value === undefined ? new Date() : new Date(value); return Number.isFinite(date.getTime()) ? date : new Date(); };
const iso = value => time(value).toISOString();
const validDate = value => typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) && Number.isFinite(Date.parse(value + 'T12:00:00Z')) && new Date(value + 'T12:00:00Z').toISOString().slice(0, 10) === value;
const uid = prefix => `${prefix}-${globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(36).slice(2)}`}`;
const merchantKey = value => text(value, 160).toLowerCase().replace(/\s+/g, ' ');
function categoryKey(value) {
  const key = String(value ?? '').normalize('NFKC').trim().replace(/\s+/gu, ' ').toLocaleLowerCase('en');
  const known = key.replace(/[^a-z0-9]+/g, ' ').trim();
  const aliases = { food: 'food & groceries', groceries: 'food & groceries', takeaway: 'food & groceries', dining: 'food & groceries', meals: 'food & groceries', 'food groceries': 'food & groceries', 'food and groceries': 'food & groceries', data: 'data & airtime', airtime: 'data & airtime', 'mobile data': 'data & airtime', 'data airtime': 'data & airtime', 'data and airtime': 'data & airtime', transport: 'transport', travel: 'transport', rides: 'transport', essentials: 'fees & essentials', bills: 'fees & essentials', accommodation: 'fees & essentials', 'fees essentials': 'fees & essentials', 'fees and essentials': 'fees & essentials' };
  return Object.hasOwn(aliases, known) ? aliases[known] : key;
}
function preferences(s) {
  const saved = object(s?.moneyMaintenance) ? s.moneyMaintenance : {};
  return {
    version: 1, revision: revision(saved.revision),
    experience: saved.experience === 'minimal' ? 'minimal' : 'full',
    checkDay: Number.isInteger(saved.checkDay) && saved.checkDay >= 0 && saved.checkDay <= 6 ? saved.checkDay : null,
    lastCheckAt: typeof saved.lastCheckAt === 'string' && Number.isFinite(Date.parse(saved.lastCheckAt)) ? saved.lastCheckAt : null,
    recurringKeys: [...new Set((Array.isArray(saved.recurringKeys) ? saved.recurringKeys : []).filter(v => typeof v === 'string' && text(v)).map(categoryKey))],
    recurringBases: Object.fromEntries(Object.entries(object(saved.recurringBases) ? saved.recurringBases : {}).filter(([id, amount]) => text(id, 100) === id && cents(amount))),
  };
}
export function ensureMoneyMaintenance(s) {
  s.moneyMaintenance = preferences(s);
  for (const account of s.externalBalances || []) {
    account.revision = revision(account.revision);
    if (!(typeof account.confirmedAt === 'string' && Number.isFinite(Date.parse(account.confirmedAt)))) account.confirmedAt = account.updatedAt;
  }
  return s.moneyMaintenance;
}
const recurring = (s, item) => !!item && preferences(s).recurringKeys.includes(categoryKey(item.name));
const recurringBase = (s, item) => Math.min(item.amount, Object.hasOwn(preferences(s).recurringBases, item.id) ? preferences(s).recurringBases[item.id] : item.amount);
const setBase = (saved, id, amount) => Object.defineProperty(saved.recurringBases, id, { value: amount, enumerable: true, configurable: true, writable: true });
const planFingerprint = (s, plan) => [plan?.periodId || '', plan?.created === true, plan?.startDate || '', plan?.endDate || '', (plan?.items || []).map(i => [i.id, i.name, i.amount, i.spent, i.due || '', recurring(s, i), recurring(s, i) ? recurringBase(s, i) : null])];
const sourceFingerprint = (s, source = s.budget) => JSON.stringify([planFingerprint(s, s.budget), planFingerprint(s, source), s.buffer || 0]);
function reuseSource(s, sourcePeriodId) {
  if (sourcePeriodId !== undefined) return sourcePeriodId === (s.budget?.periodId || '') ? s.budget : (s.budgetHistory || []).find(b => b.periodId === sourcePeriodId);
  return s.budget?.items?.length ? s.budget : (s.budgetHistory || []).find(b => b.items?.length) || s.budget;
}
export function getOutsideFreshness(s, { now } = {}) {
  const current = time(now);
  const items = (s.externalBalances || []).map(account => {
    const confirmedAt = account.confirmedAt || account.updatedAt;
    const checked = Date.parse(confirmedAt);
    const unknown = !Number.isFinite(checked) || checked > current.getTime() + 300000;
    const ageDays = unknown ? null : Math.max(0, Math.floor((current.getTime() - checked) / DAY));
    return { ...account, revision: revision(account.revision), confirmedAt, ageDays, stale: unknown || current.getTime() - checked >= OUTSIDE_STALE_DAYS * DAY };
  });
  return { manual: true, asOf: current.toISOString(), items, staleCount: items.filter(i => i.stale).length, oldestAt: items.map(i => i.confirmedAt).filter(v => Number.isFinite(Date.parse(v))).sort()[0] || null };
}
export function getMoneyMaintenance(s, { now } = {}) {
  const saved = preferences(s), current = time(now), freshness = getOutsideFreshness(s, { now: current });
  let nextCheckAt = null, needsCheck = false;
  if (saved.checkDay !== null) {
    const start = new Date(current.toISOString().slice(0, 10) + 'T00:00:00Z');
    const since = (start.getUTCDay() - saved.checkDay + 7) % 7;
    const latest = new Date(start.getTime() - since * DAY);
    needsCheck = !saved.lastCheckAt || Date.parse(saved.lastCheckAt) < latest.getTime();
    nextCheckAt = new Date(start.getTime() + ((saved.checkDay - start.getUTCDay() + 7) % 7) * DAY).toISOString();
    if (!needsCheck && nextCheckAt <= current.toISOString()) nextCheckAt = new Date(Date.parse(nextCheckAt) + 7 * DAY).toISOString();
  }
  return { ...saved, mode: saved.experience === 'minimal' ? 'simple' : 'full', checkInDay: saved.checkDay, freshness, recurringEssentialIds: (s.budget?.items || []).filter(i => recurring(s, i)).map(i => i.id), needsCheck, nextCheckAt, planFingerprint: sourceFingerprint(s) };
}
export function getCategorySuggestion(s, { merchant } = {}) {
  const key = merchantKey(merchant);
  if (!key) return null;
  const rule = (s.categoryRules || []).find(r => merchantKey(r.merchantKey || r.merchant) === key);
  if (!rule) return null;
  const item = (s.budget?.items || []).find(i => i.id === rule.budgetItemId) || (s.budget?.items || []).find(i => categoryKey(i.name) === categoryKey(rule.category));
  return item ? { budgetItemId: item.id, category: item.name, merchant: text(merchant, 160), source: 'your-choice' } : null;
}
export function prepareEssentialReuse(s, { startDate, endDate, sourcePeriodId } = {}) {
  const start = startDate || new Date().toISOString().slice(0, 10);
  if (!validDate(start)) return fail('Choose valid dates for the new plan.');
  const source = reuseSource(s, sourcePeriodId);
  if (!source) return fail('That saved plan is no longer here. Choose another plan.');
  const daysBetween = (from, until) => validDate(from) && validDate(until) ? Math.round((Date.parse(until + 'T12:00:00Z') - Date.parse(from + 'T12:00:00Z')) / DAY) : 0;
  const previousDays = daysBetween(source.startDate, source.endDate);
  const savedHorizon = [source.endDate, s.budget?.endDate].find(date => { const days = daysBetween(start, date); return days >= 1 && days <= 366; });
  const hasDuration = previousDays >= 1 && previousDays <= 366;
  const followingDate = new Date(Date.parse(start + 'T12:00:00Z') + (hasDuration ? previousDays : 30) * DAY).toISOString().slice(0, 10);
  const end = endDate || (hasDuration ? followingDate : savedHorizon || followingDate);
  if (!validDate(end) || end < start) return fail('Choose valid dates for the new plan.');
  const items = (source.items || []).map(item => ({ ...clone(item), sourceId: item.id, amount: recurring(s, item) ? recurringBase(s, item) : item.amount, originalAmount: item.amount, oneOffExtra: recurring(s, item) ? item.amount - recurringBase(s, item) : 0, spent: 0, due: '', recurring: recurring(s, item) }));
  return ok('Review your regular essentials before starting a fresh plan.', { items: items.filter(i => i.recurring), oneOffItems: items.filter(i => !i.recurring), sourcePeriodId: source.periodId || '', sourceFingerprint: sourceFingerprint(s, source), expectedRevision: preferences(s).revision, startDate: start, endDate: end, buffer: s.buffer || 0 });
}
function accountGuard(account, p) {
  if (!account) return fail('That recorded balance is no longer here.');
  if (p.expectedRevision === undefined && p.expectedUpdatedAt === undefined) return fail('Review the latest recorded balance before saving this change.');
  if (p.expectedRevision !== undefined && (!Number.isSafeInteger(p.expectedRevision) || p.expectedRevision !== revision(account.revision))) return fail('This recorded balance changed. Review it again.');
  if (p.expectedUpdatedAt !== undefined && p.expectedUpdatedAt !== account.updatedAt) return fail('This recorded balance changed. Review it again.');
  if (p.expectedBalance !== undefined && p.expectedBalance !== account.balance) return fail('This recorded balance changed. Review it again.');
  return null;
}
function maintenanceGuard(s, p) {
  if (p.expectedRevision !== undefined && (!Number.isSafeInteger(p.expectedRevision) || p.expectedRevision !== preferences(s).revision)) return fail('Your money records changed. Review this draft again.');
  return p.expectedPlanFingerprint !== undefined && p.expectedPlanFingerprint !== sourceFingerprint(s) ? fail('Your plan changed. Review this draft again.') : null;
}
export function handleMoneyMaintenanceAction(s, type, p, helpers = {}) {
  if (!MAINTENANCE_ACTIONS.has(type)) return null;
  const saved = ensureMoneyMaintenance(s), stamp = iso(helpers.now), makeId = helpers.uid || uid;
  const changed = (message, data = {}) => { saved.revision += 1; return ok(message, { ...data, maintenanceRevision: saved.revision }); };
  if (type === 'externalMovement' || type === 'confirmExternalBalance') {
    const account = (s.externalBalances || []).find(i => i.id === (p.id || p.externalBalanceId));
    const guard = accountGuard(account, p); if (guard) return guard;
    if (p.expectedPlanFingerprint !== undefined && p.expectedPlanFingerprint !== sourceFingerprint(s)) return fail('Your plan changed. Review this draft again.');
    let balance, item;
    if (type === 'confirmExternalBalance') {
      if (!cents(p.balance)) return fail('Enter the balance you have checked, including zero.');
      if (p.budgetItemId) return fail('A balance check cannot mark an essential as spent. Record an actual expense instead.');
      balance = p.balance;
    } else {
      if (!['in', 'out'].includes(p.direction) || !cents(p.amount) || p.amount === 0) return fail('Choose money in or money out, and an amount above zero.');
      balance = account.balance + (p.direction === 'in' ? p.amount : -p.amount);
      if (!cents(balance)) return fail(p.direction === 'out' ? 'That is more than this recorded balance. Check the balance first.' : 'The resulting recorded balance is too large.');
      if (p.budgetItemId) {
        if (p.direction !== 'out') return fail('Only an actual expense can use an essential.');
        item = (s.budget?.items || []).find(i => i.id === p.budgetItemId);
        if (!item || !cents(item.spent + p.amount)) return fail('Choose an existing essential with a valid spent amount.');
      }
    }
    const before = clone(account);
    account.balance = balance; account.updatedAt = stamp; account.revision += 1;
    if (type === 'confirmExternalBalance') account.confirmedAt = stamp;
    if (item) item.spent += p.amount;
    const entry = { id: makeId('external-history'), externalBalanceId: account.id, type: type === 'confirmExternalBalance' ? 'confirmed' : p.direction === 'in' ? 'money-in' : 'money-out', at: stamp, before, after: clone(account), ...(type === 'externalMovement' ? { amount: p.amount, direction: p.direction, ...(item ? { budgetItemId: item.id, budgetPeriodId: s.budget.periodId } : {}) } : {}) };
    s.externalBalanceHistory ||= []; s.externalBalanceHistory.unshift(entry);
    return changed(type === 'confirmExternalBalance' ? 'Recorded balance checked. No Lumo money moved.' : 'Outside money recorded. Your Lumo balance is unchanged.', { id: account.id, externalBalance: account, historyEntry: entry });
  }
  const guard = maintenanceGuard(s, p); if (guard) return guard;
  if (type === 'setMaintenancePreferences') {
    const experience = p.experience ?? (p.mode === 'simple' ? 'minimal' : p.mode);
    const checkDay = Object.hasOwn(p, 'checkDay') ? p.checkDay : p.checkInDay;
    if (experience !== undefined && !['minimal', 'full'].includes(experience)) return fail('Choose a simple or full experience.');
    if (checkDay !== undefined && checkDay !== null && !(Number.isInteger(checkDay) && checkDay >= 0 && checkDay <= 6)) return fail('Choose a check-in day, or leave it off.');
    if (experience !== undefined) saved.experience = experience;
    if (checkDay !== undefined) saved.checkDay = checkDay;
    return changed('Your money check preferences are saved.', { preferences: { ...saved } });
  }
  if (type === 'completeMoneyCheck') {
    saved.lastCheckAt = stamp;
    return changed('Money check complete. Unchecked outside balances keep their own update dates.', { lastCheckAt: stamp });
  }
  if (type === 'setEssentialRecurring') {
    const item = (s.budget?.items || []).find(i => i.id === (p.id || p.budgetItemId));
    if (!item || typeof p.recurring !== 'boolean') return fail('Choose an essential and whether it repeats.');
    const key = categoryKey(item.name);
    saved.recurringKeys = saved.recurringKeys.filter(k => k !== key);
    if (p.recurring) { saved.recurringKeys.push(key); setBase(saved, item.id, item.amount); }
    else delete saved.recurringBases[item.id];
    return changed(p.recurring ? 'This essential will be offered in your next plan.' : 'This essential will stay out of your next plan unless you choose it.', { id: item.id, recurring: p.recurring });
  }
  if (type === 'saveCommitment') {
    const name = text(p.name, 60), due = p.due || '';
    if (!name || !cents(p.amount) || p.amount === 0) return fail('Give this cost a name and an amount above zero.');
    if (due && (!validDate(due) || due < stamp.slice(0, 10))) return fail('Choose today or a future date for this cost.');
    if (p.recurring !== undefined && typeof p.recurring !== 'boolean') return fail('Choose whether this cost repeats.');
    const key = categoryKey(name), items = s.budget.items;
    const item = p.budgetItemId ? items.find(i => i.id === p.budgetItemId) : items.find(i => categoryKey(i.name) === key);
    if (p.budgetItemId && !item) return fail('That essential changed. Review the plan again.');
    if (!item && items.length >= 30) return fail('Your plan already has thirty essentials. Combine this with an existing essential.');
    if (item && !cents(Math.max(item.amount, item.spent) + p.amount)) return fail('The combined planned amount is too large.');
    const entry = item || { id: makeId('budget'), name, emoji: text(p.emoji || '📌', 12), amount: 0, spent: 0, due };
    if (item && recurring(s, item) && p.recurring !== true && !Object.hasOwn(saved.recurringBases, item.id)) setBase(saved, item.id, item.amount);
    entry.amount = Math.max(entry.amount, entry.spent) + p.amount;
    if (due && (!entry.due || due < entry.due)) entry.due = due;
    if (!item) items.push(entry);
    s.budget.created = true;
    if (p.recurring === true) { const next = categoryKey(entry.name); if (!saved.recurringKeys.includes(next)) saved.recurringKeys.push(next); setBase(saved, entry.id, entry.amount); }
    return changed(item ? 'Additional cost added to this essential. Spending already recorded is kept.' : 'Cost added to your plan. No money moved.', { id: entry.id, budgetItem: entry, merged: !!item });
  }
  if (type === 'reuseEssentialPlan') {
    const sourcePlan = reuseSource(s, p.sourcePeriodId);
    if (!sourcePlan || p.sourceFingerprint !== sourceFingerprint(s, sourcePlan)) return fail('The source plan changed. Review a fresh copy before starting this period.');
    if (!validDate(p.startDate) || !validDate(p.endDate) || p.endDate < p.startDate || p.startDate > stamp.slice(0, 10) || p.endDate < stamp.slice(0, 10)) return fail('Choose a current plan period. Future plans stay as drafts until they begin.');
    const source = sourcePlan.items || [], selected = p.includeOneOffIds || [];
    if (!Array.isArray(selected) || new Set(selected).size !== selected.length || selected.some(id => !source.some(i => i.id === id && !recurring(s, i)))) return fail('Choose valid one-off costs to include.');
    const input = p.items || [...source.filter(i => recurring(s, i)), ...source.filter(i => selected.includes(i.id))];
    if (!Array.isArray(input) || !input.length || input.length > 30) return fail('Choose at least one essential for the new plan.');
    const seen = new Set(), categories = new Set(), items = [];
    for (const proposed of input) {
      if (!object(proposed)) return fail('Review each essential in the new plan.');
      const sourceId = proposed.sourceId || proposed.id, previous = source.find(i => i.id === sourceId);
      if (!previous || seen.has(sourceId) || (!recurring(s, previous) && !selected.includes(sourceId))) return fail('Include a one-off cost explicitly, and use each source essential once.');
      const name = text(proposed.name, 60), key = categoryKey(name), due = proposed.due || '';
      if (!name || !cents(proposed.amount) || categories.has(key) || (due && (!validDate(due) || due < p.startDate || due > p.endDate))) return fail('Check each essential’s name, amount and date. Keep one entry per category.');
      seen.add(sourceId); categories.add(key);
      items.push({ id: makeId('budget'), name, emoji: text(proposed.emoji || previous.emoji || '📌', 12), amount: proposed.amount, spent: 0, due });
    }
    const buffer = p.buffer === undefined ? s.buffer : p.buffer;
    if (!cents(buffer)) return fail('Use a valid keep-back amount.');
    const nextRecurring = input.filter(i => recurring(s, source.find(old => old.id === (i.sourceId || i.id)))).map(i => categoryKey(i.name));
    if (s.budget.created) {
      s.budgetHistory ||= [];
      s.budgetHistory.unshift({ ...clone(s.budget), archivedAt: stamp, totalPlanned: s.budget.items.reduce((n, i) => n + i.amount, 0), totalSpent: s.budget.items.reduce((n, i) => n + i.spent, 0) });
    }
    s.budget = { created: true, items, periodId: makeId('period'), startDate: p.startDate, endDate: p.endDate };
    s.buffer = buffer;
    saved.recurringKeys = [...new Set(nextRecurring)];
    for (const item of items) if (saved.recurringKeys.includes(categoryKey(item.name))) setBase(saved, item.id, item.amount);
    return changed('Fresh plan ready. Your previous spending stays in its own period.', { budget: s.budget });
  }
  return null;
}
