import test from 'node:test';
import assert from 'node:assert/strict';
import { applyAction, budgetCategoryKey, createEmptyState, createDemoState } from '../dist/js/model.js';
import { bindPlanning, renderPlanning } from '../dist/js/planning.js';

const item = (id, name, amount = 2000) => ({ id, name, amount, spent: 0 });

test('category keys ignore letter case, repeated spaces and Unicode presentation variants', () => {
  assert.equal(budgetCategoryKey('  ＤＡＴＡ\u00a0 &   AIRTIME '), budgetCategoryKey('Data & airtime'));
  assert.notEqual(budgetCategoryKey('Coffee'), budgetCategoryKey('Coffee & snacks'));
});

test('known legacy labels share their category with current presets without broadening custom names', () => {
  for (const [legacy, preset] of [['Food', 'Food & groceries'], ['Data', 'Data & airtime'], ['Essentials', 'Fees & essentials']]) {
    const state = createEmptyState();
    assert.equal(applyAction(state, 'createBudget', { items: [item('existing', legacy)] }).ok, true);
    const before = structuredClone(state);
    assert.equal(applyAction(state, 'updateBudget', { items: [...state.budget.items, item('duplicate', preset)] }).ok, false);
    assert.deepEqual(state, before);
    const markup = renderPlanning({ state, draft: { plan: { items: state.budget.items, item: {} } } }, { section: 'plan', page: 'create', step: 'name' });
    assert.match(markup, /Already in your plan/);
  }
  assert.notEqual(budgetCategoryKey('Food for the hall'), budgetCategoryKey('Food & groceries'));
  assert.equal(budgetCategoryKey('__proto__'), '__proto__');
  const demo = createDemoState(), existing = demo.budget.items[0];
  assert.equal(applyAction(demo, 'updateBudget', { id: existing.id, amount: existing.amount + 1000 }).ok, true);
});

test('creating a budget rejects duplicate categories without reserving money or saving a partial plan', () => {
  const state = createEmptyState();
  const before = structuredClone(state);
  const result = applyAction(state, 'createBudget', {
    items: [item('first', 'Data & airtime'), item('second', ' ＤＡＴＡ\u00a0 &   AIRTIME ')],
    buffer: 9000,
    idempotencyKey: 'duplicate-create',
  });
  assert.equal(result.ok, false);
  assert.match(result.message, /already in your budget/);
  assert.deepEqual(state, before);
});

test('renaming an essential into another category is rejected atomically for both update APIs', () => {
  const state = createEmptyState();
  assert.equal(applyAction(state, 'createBudget', { items: [item('food', 'Food & groceries'), item('bus', 'Transport')] }).ok, true);
  const before = structuredClone(state);
  for (const payload of [
    { id: 'bus', name: ' food &   GROCERIES ', amount: 5000 },
    { items: [item('food', 'Food & groceries'), item('bus', ' food &   GROCERIES ', 5000)] },
  ]) {
    assert.equal(applyAction(state, 'updateBudget', payload).ok, false);
    assert.deepEqual(state, before);
  }
});

test('editing the amount of the existing category remains allowed and preserves spending', () => {
  const state = createEmptyState();
  assert.equal(applyAction(state, 'createBudget', { items: [{ ...item('food', 'Food & groceries'), spent: 400 }] }).ok, true);
  const result = applyAction(state, 'updateBudget', { id: 'food', name: 'FOOD & GROCERIES', amount: 6000 });
  assert.equal(result.ok, true, result.message);
  assert.equal(state.budget.items.length, 1);
  assert.equal(state.budget.items[0].amount, 6000);
  assert.equal(state.budget.items[0].spent, 400);
});

test('used preset categories show as already added while unused presets remain selectable', () => {
  const state = createEmptyState();
  const ctx = { state, draft: { plan: { items: [item('food', 'FOOD &   groceries')], item: {} } } };
  const markup = renderPlanning(ctx, { section: 'plan', page: 'create', step: 'name' });
  assert.match(markup, /Already in your plan/);
  assert.doesNotMatch(markup, /data-action="p:category-0"/);
  assert.match(markup, /data-action="p:category-1"/);
});

function clickPlanningAction({ action, items, current = {}, name = '', due = '2099-01-01' }) {
  const button = { dataset: { action: `p:${action}` }, addEventListener: (_event, fn) => { button.click = fn; } };
  const error = { textContent: '' };
  const input = { value: name };
  const draft = { plan: { items: structuredClone(items), item: structuredClone(current) } };
  const navigations = [];
  const ctx = {
    state: createEmptyState(), draft, setCapture() {}, saveDraft() {},
    $$(selector) { return selector.startsWith('[data-action') ? [button] : []; },
    $(selector) { return selector === '#planning-error' ? error : selector === '[name="planning-name"]' && action !== 'plan-date' ? input : selector === '[name="planning-date"]' ? { value: due } : null; },
    go(route) { navigations.push(route); },
  };
  bindPlanning(ctx, { section: 'plan', page: 'create', step: action === 'plan-date' ? 'date' : 'name' });
  button.click({});
  return { error: error.textContent, draft, navigations };
}

test('custom and stale preset submissions cannot add a duplicate to the setup draft', () => {
  const items = [item('food', 'Food & groceries')];
  for (const action of ['plan-name', 'category-0']) {
    const result = clickPlanningAction({ action, items, name: ' food &   GROCERIES ' });
    assert.match(result.error, /already in your plan/);
    assert.equal(result.navigations.length, 0);
    assert.deepEqual(result.draft.plan.items, items);
  }
});

test('the final item insertion rechecks for duplicate names while editing the same item is allowed', () => {
  const items = [item('food', 'Food & groceries')];
  const duplicate = clickPlanningAction({ action: 'plan-date', items, current: item('second', 'food & groceries') });
  assert.match(duplicate.error, /already in your plan/);
  assert.deepEqual(duplicate.draft.plan.items, items);
  const editing = clickPlanningAction({ action: 'plan-date', items, current: item('food', 'Food & groceries', 7000) });
  assert.equal(editing.error, '');
  assert.equal(editing.draft.plan.items.length, 1);
  assert.equal(editing.draft.plan.items[0].amount, 7000);
  assert.equal(editing.navigations[0].step, 'review');
});
