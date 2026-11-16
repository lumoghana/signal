import test from 'node:test';
import assert from 'node:assert/strict';
import { createDemoState, createEmptyState, applyAction, getSummary, migrateState } from '../dist/js/model.js';
import { getMoneyMaintenance, getOutsideFreshness, prepareEssentialReuse, getCategorySuggestion, handleMoneyMaintenanceAction, MAINTENANCE_ACTIONS } from '../dist/js/money-maintenance-model.js';

const clone = value => JSON.parse(JSON.stringify(value));
const today = () => new Date().toISOString().slice(0, 10);
const after = n => new Date(Date.now() + n * 86400000).toISOString().slice(0, 10);
const act = (s, type, p = {}) => { const result = applyAction(s, type, p); assert.equal(result.ok, true, result.message); return result; };
const external = (s, balance = 10000) => act(s, 'createExternalBalance', { type: 'momo', name: 'My MoMo', balance }).externalBalance;
const guard = account => ({ expectedRevision: account.revision, expectedUpdatedAt: account.updatedAt, expectedBalance: account.balance });
const ledger = s => clone({ wallet: s.wallet, income: s.income, buffer: s.buffer, transactions: s.transactions, boxes: s.boxes, groups: s.groups, savingsHistory: s.savingsHistory });

test('legacy migration preserves financial records and leaves checks voluntary', () => {
  const s = createDemoState(), before = ledger(s);
  delete s.moneyMaintenance;
  migrateState(s);
  assert.deepEqual(ledger(s), before);
  assert.equal(getMoneyMaintenance(s).experience, 'full');
  assert.equal(getMoneyMaintenance(s).checkDay, null);
  assert.equal(getMoneyMaintenance(s).needsCheck, false);
  assert.equal(getMoneyMaintenance(s).lastCheckAt, null);
  assert.equal(getMoneyMaintenance(s).recurringEssentialIds.length, 0);
});

test('record actual outside inflow without crediting Lumo, income or saving rules', () => {
  const s = createDemoState(), account = external(s), before = ledger(s), checked = account.confirmedAt;
  const payload = { id: account.id, direction: 'in', amount: 2500, ...guard(account), idempotencyKey: 'outside-in' };
  act(s, 'externalMovement', payload);
  assert.equal(account.balance, 12500);
  assert.equal(account.revision, 1);
  assert.equal(account.confirmedAt, checked);
  assert.deepEqual(ledger(s), before);
  assert.equal(s.externalBalanceHistory[0].type, 'money-in');
  assert.equal(act(s, 'externalMovement', payload).duplicate, true);
  assert.equal(account.balance, 12500);
  assert.equal(s.externalBalanceHistory.filter(h => h.type === 'money-in').length, 1);
});

test('outside outflow changes a selected essential exactly once, with no Lumo payment', () => {
  const s = createDemoState(), account = external(s), item = s.budget.items[0], spent = item.spent, before = ledger(s);
  const payload = { externalBalanceId: account.id, direction: 'out', amount: 1200, budgetItemId: item.id, ...guard(account), idempotencyKey: 'outside-out' };
  act(s, 'externalMovement', payload);
  assert.equal(account.balance, 8800);
  assert.equal(item.spent, spent + 1200);
  assert.equal(act(s, 'externalMovement', payload).duplicate, true);
  assert.equal(item.spent, spent + 1200);
  assert.deepEqual(ledger(s), before);
});

test('uncategorised outside expense cannot silently spend any essential', () => {
  const s = createDemoState(), account = external(s), before = clone(s.budget);
  act(s, 'externalMovement', { id: account.id, direction: 'out', amount: 999, ...guard(account), idempotencyKey: 'unclassified' });
  assert.deepEqual(s.budget, before);
});

test('outside mutations reject missing guard, stale revision, stale timestamp, overdraw and invalid amounts atomically', () => {
  const s = createDemoState(), account = external(s), initial = clone(s);
  const good = { id: account.id, direction: 'out', amount: 1000, ...guard(account) };
  for (const p of [
    { id: account.id, direction: 'out', amount: 1 },
    { ...good, expectedRevision: 99 }, { ...good, expectedUpdatedAt: '2001-01-01T00:00:00.000Z' },
    { ...good, expectedBalance: 3 }, { ...good, amount: 10001 }, { ...good, amount: 1.1 },
    { ...good, amount: -1 }, { ...good, amount: 0 }, { ...good, amount: NaN },
    { ...good, budgetItemId: 'missing' }, { ...good, direction: 'in', budgetItemId: s.budget.items[0].id },
  ]) {
    assert.equal(applyAction(s, 'externalMovement', p).ok, false);
    assert.deepEqual(s, initial);
  }
  act(s, 'externalMovement', { ...good, idempotencyKey: 'changed' });
  const changed = clone(s);
  assert.equal(applyAction(s, 'externalMovement', { ...good, idempotencyKey: 'stale-other-key' }).ok, false);
  assert.deepEqual(s, changed);
});

test('absolute check refreshes a balance without marking difference as income or expense', () => {
  const s = createDemoState(), account = external(s), budget = clone(s.budget), before = ledger(s);
  account.updatedAt = account.confirmedAt = '2026-01-01T00:00:00.000Z';
  const result = act(s, 'confirmExternalBalance', { id: account.id, balance: 0, ...guard(account), idempotencyKey: 'checked' });
  assert.equal(account.balance, 0);
  assert.equal(account.updatedAt, account.confirmedAt);
  assert.equal(getOutsideFreshness(s).staleCount, 0);
  assert.equal(result.historyEntry.type, 'confirmed');
  assert.deepEqual(s.budget, budget);
  assert.deepEqual(ledger(s), before);
  assert.equal(applyAction(s, 'confirmExternalBalance', { id: account.id, balance: 500, ...guard(account), budgetItemId: s.budget.items[0].id }).ok, false);
});

test('freshness preserves an old absolute-check anchor after a quick movement', () => {
  const s = createDemoState(), account = external(s);
  account.updatedAt = account.confirmedAt = '2026-01-01T00:00:00.000Z';
  const future = '2026-01-05T12:00:00.000Z';
  handleMoneyMaintenanceAction(s, 'externalMovement', { id: account.id, direction: 'in', amount: 100, ...guard(account) }, { now: future });
  const summary = getOutsideFreshness(s, { now: future });
  assert.equal(summary.items[0].stale, true);
  assert.equal(summary.items[0].ageDays, 4);
  assert.equal(summary.items[0].confirmedAt, '2026-01-01T00:00:00.000Z');
  assert.equal(summary.items[0].updatedAt, future);
});

test('familiar merchant categories come only from explicit remembered choices and survive new plan ids', () => {
  const s = createDemoState();
  assert.equal(getCategorySuggestion(s, { merchant: 'Food Place' }), null);
  act(s, 'rememberCategory', { merchant: 'Night Market Auntie', budgetItemId: s.budget.items[0].id });
  const previous = s.budget.items[0].id;
  assert.equal(getCategorySuggestion(s, { merchant: ' night   market auntie ' }).category, s.budget.items[0].name);
  s.budget.items[0].id = 'new-period-food';
  assert.notEqual(getCategorySuggestion(s, { merchant: 'Night Market Auntie' }).budgetItemId, previous);
  s.budget.items = [];
  assert.equal(getCategorySuggestion(s, { merchant: 'Night Market Auntie' }), null);
});

test('confirmed commitment adds to an existing essential and preserves spending and all money', () => {
  const s = createDemoState(), item = s.budget.items[0], before = ledger(s), amount = item.amount, spent = item.spent;
  const p = { name: 'Food & groceries', amount: 2500, due: after(3), expectedRevision: s.moneyMaintenance.revision, idempotencyKey: 'commitment' };
  const result = act(s, 'saveCommitment', p);
  assert.equal(result.merged, true);
  assert.equal(item.amount, amount + 2500);
  assert.equal(item.spent, spent);
  assert.equal(act(s, 'saveCommitment', p).duplicate, true);
  assert.equal(item.amount, amount + 2500);
  assert.deepEqual(ledger(s), before);
  assert.equal(applyAction(s, 'saveCommitment', { ...p, idempotencyKey: 'stale-commitment' }).ok, false);
});

test('new commitment creates a planned cost, never held money or expected funds', () => {
  const s = createEmptyState(), before = ledger(s);
  const result = act(s, 'saveCommitment', { name: 'Project printing', amount: 4400, due: after(4), recurring: false, idempotencyKey: 'printing' });
  assert.equal(result.budgetItem.spent, 0);
  assert.equal(getSummary(s).planned, 4400);
  assert.equal(getSummary(s).available, 0);
  assert.deepEqual(ledger(s), before);
  assert.equal(applyAction(s, 'saveCommitment', { name: 'Late cost', amount: 12, due: '2026-02-30' }).ok, false);
  assert.equal(applyAction(s, 'saveCommitment', { name: 'Fraction', amount: 1.25 }).ok, false);
});

test('an additional commitment reserves its full amount even if that category was overspent', () => {
  const s = createDemoState(), item = s.budget.items[0];
  item.spent = item.amount + 500;
  const previous = getSummary(s).planned;
  act(s, 'saveCommitment', { name: item.name, amount: 1000, budgetItemId: item.id });
  assert.equal(item.amount - item.spent, 1000);
  assert.equal(getSummary(s).planned - previous, 1000);
});

test('reuse draft contains only explicit regular essentials and never old spent or due dates', () => {
  const s = createDemoState(), food = s.budget.items[0];
  const first = prepareEssentialReuse(s, { startDate: today(), endDate: after(30) });
  assert.equal(first.items.length, 0);
  assert.equal(first.oneOffItems.length, s.budget.items.length);
  act(s, 'setEssentialRecurring', { id: food.id, recurring: true });
  const draft = prepareEssentialReuse(s, { startDate: today(), endDate: after(30) });
  assert.equal(draft.items.length, 1);
  assert.equal(draft.items[0].sourceId, food.id);
  assert.equal(draft.items[0].spent, 0);
  assert.equal(draft.items[0].due, '');
  assert.equal(prepareEssentialReuse(s, { startDate: 'nonsense' }).ok, false);
});

test('weekly reuse keeps seven days by default while allowing an edited end date', () => {
  const s = createDemoState();
  s.budget.startDate = '2026-01-01'; s.budget.endDate = '2026-01-08';
  const draft = prepareEssentialReuse(s, { startDate: '2026-11-16' });
  assert.equal(draft.endDate, '2026-11-23');
  assert.equal(prepareEssentialReuse(s, { startDate: '2026-11-16', endDate: '2026-11-30' }).endDate, '2026-11-30');
});

test('legacy reuse without a valid duration uses a saved future horizon before falling back to thirty days', () => {
  const s = createDemoState();
  s.budget.startDate = ''; s.budget.endDate = '2026-11-20';
  assert.equal(prepareEssentialReuse(s, { startDate: '2026-11-16' }).endDate, '2026-11-20');
  s.budget.endDate = '';
  s.income.nextDate = '2026-11-18';
  assert.equal(prepareEssentialReuse(s, { startDate: '2026-11-16' }).endDate, '2026-12-16');
  s.budget.startDate = '2020-01-01'; s.budget.endDate = '2025-01-01';
  assert.equal(prepareEssentialReuse(s, { startDate: '2026-11-16' }).endDate, '2026-12-16');
});

test('fresh plan archives old spending, allocates fresh ids and keeps one-offs out', () => {
  const s = createDemoState(), previous = clone(s.budget), before = ledger(s);
  act(s, 'setEssentialRecurring', { id: s.budget.items[0].id, recurring: true });
  const draft = prepareEssentialReuse(s, { startDate: today(), endDate: after(30) });
  draft.items[0].amount = 60000;
  draft.items[0].due = after(10);
  act(s, 'reuseEssentialPlan', { ...draft, idempotencyKey: 'reuse' });
  assert.equal(s.budget.items.length, 1);
  assert.equal(s.budget.items[0].amount, 60000);
  assert.equal(s.budget.items[0].spent, 0);
  assert.notEqual(s.budget.items[0].id, previous.items[0].id);
  assert.notEqual(s.budget.periodId, previous.periodId);
  assert.deepEqual(s.budgetHistory[0].items, previous.items);
  assert.equal(act(s, 'reuseEssentialPlan', { ...draft, idempotencyKey: 'reuse' }).duplicate, true);
  assert.equal(s.budgetHistory.length, 1);
  assert.deepEqual(ledger(s), before);
});

test('reuse rejects stale source, duplicate categories, hidden one-offs and future starts without mutation', () => {
  const s = createDemoState();
  act(s, 'setEssentialRecurring', { id: s.budget.items[0].id, recurring: true });
  const draft = prepareEssentialReuse(s, { startDate: today(), endDate: after(30) });
  const initial = clone(s);
  for (const p of [
    { ...draft, sourceFingerprint: 'old' },
    { ...draft, items: [...draft.items, draft.oneOffItems[0]] },
    { ...draft, items: [draft.items[0], draft.items[0]] },
    { ...draft, startDate: after(1) },
    { ...draft, includeOneOffIds: ['missing'] },
    { ...draft, items: [{ ...draft.items[0], amount: -1 }] },
  ]) { assert.equal(applyAction(s, 'reuseEssentialPlan', p).ok, false); assert.deepEqual(s, initial); }
  act(s, 'reuseEssentialPlan', { ...draft, items: [...draft.items, draft.oneOffItems[0]], includeOneOffIds: [draft.oneOffItems[0].id], idempotencyKey: 'selected-oneoff' });
  assert.equal(s.budget.items.length, 2);
  assert.equal(getMoneyMaintenance(s).recurringEssentialIds.length, 1);
});

test('voluntary check preferences and completion never confirm outside balances or move money', () => {
  const s = createDemoState(), account = external(s), before = ledger(s);
  account.confirmedAt = '2026-01-01T00:00:00.000Z';
  act(s, 'setMaintenancePreferences', { mode: 'simple', checkInDay: 1, idempotencyKey: 'prefs' });
  assert.equal(getMoneyMaintenance(s).experience, 'minimal');
  assert.equal(getMoneyMaintenance(s).checkDay, 1);
  const payload = { idempotencyKey: 'check' };
  act(s, 'completeMoneyCheck', payload);
  assert.equal(act(s, 'completeMoneyCheck', payload).duplicate, true);
  assert.equal(getOutsideFreshness(s).staleCount, 1);
  assert.equal(getMoneyMaintenance(s).needsCheck, false);
  act(s, 'setMaintenancePreferences', { experience: 'full', checkDay: null });
  assert.equal(getMoneyMaintenance(s).needsCheck, false);
  assert.equal(getMoneyMaintenance(s).nextCheckAt, null);
  assert.deepEqual(ledger(s), before);
  assert.equal(applyAction(s, 'setMaintenancePreferences', { checkDay: 7 }).ok, false);
  assert.equal(applyAction(s, 'setMaintenancePreferences', { experience: 'invented' }).ok, false);
});

test('reuse can select an archived source and protects changes to the current plan too', () => {
  const s = createDemoState(), food = s.budget.items[0];
  act(s, 'setEssentialRecurring', { id: food.id, recurring: true });
  const archivedId = s.budget.periodId;
  act(s, 'archiveBudgetPeriod');
  const draft = prepareEssentialReuse(s, { startDate: today(), endDate: after(30) });
  assert.equal(draft.sourcePeriodId, archivedId);
  assert.equal(draft.items.length, 1);
  act(s, 'saveCommitment', { name: 'Current urgent cost', amount: 1200 });
  const before = clone(s);
  assert.equal(applyAction(s, 'reuseEssentialPlan', { ...draft }).ok, false);
  assert.deepEqual(s, before);
  const selected = prepareEssentialReuse(s, { sourcePeriodId: archivedId, startDate: today(), endDate: after(30) });
  act(s, 'reuseEssentialPlan', selected);
  assert.equal(s.budget.items[0].name, food.name);
  assert.equal(s.budgetHistory[0].items[0].name, 'Current urgent cost');
});

test('one-off additions to a recurring essential stay in this plan and out of the next default', () => {
  const s = createDemoState(), food = s.budget.items[0], regular = food.amount;
  act(s, 'setEssentialRecurring', { id: food.id, recurring: true });
  act(s, 'saveCommitment', { name: food.name, amount: 1200, budgetItemId: food.id, recurring: false });
  assert.equal(food.amount, regular + 1200);
  const draft = prepareEssentialReuse(s, { startDate: today(), endDate: after(30) });
  assert.equal(draft.items[0].amount, regular);
  assert.equal(draft.items[0].oneOffExtra, 1200);
  draft.items[0].amount = regular + 500;
  act(s, 'reuseEssentialPlan', draft);
  assert.equal(s.budget.items[0].amount, regular + 500);
  assert.equal(s.moneyMaintenance.recurringBases[s.budget.items[0].id], regular + 500);
  assert.equal(s.budgetHistory[0].items[0].amount, regular + 1200);
  assert.equal(prepareEssentialReuse(s).items[0].amount, regular + 500);
});

test('outside expenses never lower a recurring base and bases cannot exceed the current planned amount', () => {
  const s = createDemoState(), food = s.budget.items[0], account = external(s), amount = food.amount;
  act(s, 'setEssentialRecurring', { id: food.id, recurring: true });
  act(s, 'externalMovement', { id: account.id, direction: 'out', amount: 1000, budgetItemId: food.id, ...guard(account) });
  assert.equal(s.moneyMaintenance.recurringBases[food.id], amount);
  food.amount = 100;
  assert.equal(prepareEssentialReuse(s).items[0].amount, 100);
});

test('old absolute edits and new quick movement reject each other’s stale baseline', () => {
  const s = createDemoState(), account = external(s), first = guard(account);
  act(s, 'updateExternalBalance', { id: account.id, balance: 20000, ...first });
  assert.equal(applyAction(s, 'externalMovement', { id: account.id, amount: 10, direction: 'out', ...first }).ok, false);
  const next = guard(account);
  act(s, 'externalMovement', { id: account.id, amount: 10, direction: 'out', ...next });
  assert.equal(applyAction(s, 'updateExternalBalance', { id: account.id, balance: 100, ...next }).ok, false);
  assert.equal(account.balance, 19990);
});

test('commitment review fingerprint rejects legacy plan edits even if maintenance revision is unchanged', () => {
  const s = createDemoState(), maintenance = getMoneyMaintenance(s);
  const p = { name: s.budget.items[0].name, amount: 500, expectedRevision: maintenance.revision, expectedPlanFingerprint: maintenance.planFingerprint };
  act(s, 'updateBudget', { items: s.budget.items.map((i, index) => ({ ...i, amount: i.amount + (index ? 0 : 1000) })) });
  assert.equal(s.moneyMaintenance.revision, maintenance.revision);
  const before = clone(s);
  assert.equal(applyAction(s, 'saveCommitment', p).ok, false);
  assert.deepEqual(s, before);
});

test('new actions use existing sign-out and idempotency guards', () => {
  const s = createDemoState();
  act(s, 'setMaintenancePreferences', { experience: 'minimal', idempotencyKey: 'same' });
  assert.equal(applyAction(s, 'setMaintenancePreferences', { experience: 'full', idempotencyKey: 'same' }).ok, false);
  act(s, 'accountSignOut');
  for (const type of MAINTENANCE_ACTIONS) assert.equal(applyAction(s, type, {}).ok, false);
});
