import test from 'node:test';
import assert from 'node:assert/strict';
import { createEmptyState, createDemoState, getSummary } from '../dist/js/model.js';
import { createActivationDraft, safeActivationStep, fundActivation, addActivationBudgetItem, saveActivationBudget, completeActivation } from '../dist/js/activation-model.js';
import { safeRoute, parentRoute, compactTrail, routeKey } from '../dist/js/navigation.js';

const okay = result => { assert.equal(result.ok, true, result.message); return result; };
const activation = step => ({ section: 'activation', step });
const home = { section: 'home', page: 'home' };
const newAccount = () => Object.assign(createEmptyState({ name: 'Ama' }), { onboardingDone: true });
const create = (preview = false) => createActivationDraft({ state: newAccount(), preview });
const funded = (preview = false) => { const draft = create(preview); okay(fundActivation(draft, { amount: 10000, source: 'Mobile money' })); return draft; };
const planned = (preview = false) => { const draft = funded(preview); okay(addActivationBudgetItem(draft, { name: 'Food & groceries', amount: 6000, emoji: '🍲' })); okay(saveActivationBudget(draft)); return draft; };
const unchangedOnFailure = (draft, action) => { const before = JSON.stringify(draft); assert.equal(action().ok, false); assert.equal(JSON.stringify(draft), before); };

test('activation starts with no balance, budget or ledger entries and never funds on page entry', () => {
  const account = newAccount(), before = JSON.stringify(account), draft = createActivationDraft({ state: account });
  assert.equal(draft.step, 'fund'); assert.equal(draft.state.wallet, 0); assert.equal(draft.state.budget.created, false);
  assert.deepEqual(draft.state.transactions, []); assert.deepEqual(draft.items, []);
  for (const requested of ['fund', 'purpose', 'ready', 'unknown']) assert.equal(safeActivationStep(draft, requested), 'fund');
  assert.equal(getSummary(draft.state).available, 0); assert.equal(JSON.stringify(account), before);
  assert.notEqual(draft.state, account);
});

test('activation requires a new empty account and rejects existing balances or budgets', () => {
  assert.throws(() => createActivationDraft());
  assert.throws(() => createActivationDraft({ state: createEmptyState() }));
  assert.throws(() => createActivationDraft({ state: { ...newAccount(), wallet: 1 } }));
  const account = newAccount(); account.budget.created = true;
  assert.throws(() => createActivationDraft({ state: account }));
});

test('unfunded accounts cannot add a budget, save a budget or finish activation', () => {
  const draft = create();
  unchangedOnFailure(draft, () => addActivationBudgetItem(draft, { name: 'Transport', amount: 1000 }));
  unchangedOnFailure(draft, () => saveActivationBudget(draft, { items: [{ name: 'Transport', amount: 1000 }] }));
  unchangedOnFailure(draft, () => completeActivation(draft));
});

test('invalid top-ups fail atomically; an explicit top-up records money once even if a retry changes the amount', () => {
  const draft = create();
  for (const amount of [undefined, 0, -1, 0.5, Infinity, NaN, 1000000001, '100']) unchangedOnFailure(draft, () => fundActivation(draft, { amount, source: 'Mobile money' }));
  unchangedOnFailure(draft, () => fundActivation(draft, { amount: 10000, source: 'Cash' }));
  const result = okay(fundActivation(draft, { amount: 10000, source: 'Bank transfer' }));
  assert.equal(draft.step, 'purpose'); assert.equal(draft.state.wallet, 10000); assert.equal(draft.state.transactions.length, 1);
  assert.equal(draft.state.transactions[0].rail, 'bank'); assert.equal(result.id, draft.fundingTransactionId);
  const ledger = JSON.stringify(draft.state);
  okay(fundActivation(draft, { amount: 50000, source: 'Mobile money' }));
  assert.equal(JSON.stringify(draft.state), ledger); assert.equal(draft.state.wallet, 10000);
  assert.equal(safeActivationStep(draft, 'ready'), 'purpose');
  unchangedOnFailure(draft, () => completeActivation(draft));
});

test('first-budget items need positive amounts, distinct normalized categories and funds already added', () => {
  const draft = funded();
  for (const amount of [undefined, 0, -10, 0.1, Infinity, 10001]) unchangedOnFailure(draft, () => addActivationBudgetItem(draft, { name: 'Transport', amount }));
  unchangedOnFailure(draft, () => addActivationBudgetItem(draft, { name: '  ', amount: 1000 }));
  okay(addActivationBudgetItem(draft, { name: ' Food   & groceries ', amount: 6000 }));
  assert.equal(draft.items[0].name, 'Food & groceries');
  unchangedOnFailure(draft, () => addActivationBudgetItem(draft, { name: '  FOOD & groceries ', amount: 1000 }));
  unchangedOnFailure(draft, () => addActivationBudgetItem(draft, { name: 'Transport', amount: 5000 }));
  okay(addActivationBudgetItem(draft, { name: 'Transport', amount: 4000 }));
  assert.equal(draft.items.reduce((sum, item) => sum + item.amount, 0), draft.state.wallet);
  assert.equal(draft.state.budget.created, false, 'draft selections do not commit before confirmation');
});

test('first-budget save validates atomically even when passed items directly', () => {
  const draft = funded(), goodItem = { name: 'Transport', amount: 1000 };
  for (const items of [[], null, [goodItem, { ...goodItem, name: '  TRANSPORT ' }], [{ ...goodItem, amount: 0 }], [{ ...goodItem, amount: 10001 }], [{ ...goodItem, spent: 1 }], [{ ...goodItem, name: '' }]]) {
    unchangedOnFailure(draft, () => saveActivationBudget(draft, { items }));
  }
  for (const due of ['', 'not-a-date', '2020-01-01']) unchangedOnFailure(draft, () => saveActivationBudget(draft, { items: [goodItem], due }));
  okay(saveActivationBudget(draft, { items: [goodItem] }));
  assert.equal(draft.step, 'ready'); assert.equal(draft.state.budget.created, true);
  assert.equal(draft.state.wallet, 10000, 'budgeting reserves money without moving it');
  assert.equal(draft.state.transactions.length, 1); assert.equal(draft.state.budget.items[0].spent, 0);
  assert.equal(getSummary(draft.state).planned, 1000);
});

test('completion requires both choices, returns an isolated account once and prevents later changes', () => {
  const draft = planned(), snapshot = JSON.stringify(draft.state);
  assert.equal(safeActivationStep(draft, 'ready'), 'ready');
  const result = okay(completeActivation(draft));
  assert.equal(draft.completed, true); assert.equal(result.preview, false);
  assert.equal(JSON.stringify({...result.state,activation:undefined}), snapshot);
  assert.equal(result.state.activation.status,'ready'); assert.notEqual(result.state, draft.state);
  unchangedOnFailure(draft, () => completeActivation(draft));
  unchangedOnFailure(draft, () => fundActivation(draft, { amount: 1000, source: 'Mobile money' }));
  unchangedOnFailure(draft, () => addActivationBudgetItem(draft, { name: 'Data & airtime', amount: 1000 }));
  unchangedOnFailure(draft, () => saveActivationBudget(draft));
  result.state.wallet = 1; assert.equal(draft.state.wallet, 10000);
});

test('preview funding and budgeting never mutate the signed-in demo account', () => {
  const existing = createDemoState(), before = JSON.stringify(existing), draft = planned(true);
  const result = okay(completeActivation(draft));
  assert.equal(result.preview, true); assert.equal(result.state.wallet, 10000);
  assert.equal(JSON.stringify(existing), before);
  assert.notEqual(result.state, existing);
});

test('same-session JSON roundtrips preserve each activation stage without adding money twice', () => {
  for (const original of [create(), funded(), planned()]) {
    const draft = JSON.parse(JSON.stringify(original));
    assert.equal(draft.step, original.step); assert.equal(safeActivationStep(draft, draft.step), original.step);
    assert.equal(JSON.stringify(draft.state), JSON.stringify(original.state));
    if (draft.funded) {
      const wallet = draft.state.wallet, count = draft.state.transactions.length;
      okay(fundActivation(draft, { amount: 20000, source: 'Mobile money' }));
      assert.equal(draft.state.wallet, wallet); assert.equal(draft.state.transactions.length, count);
    }
  }
});

test('new signup and preview routes stay in pending activation until both choices are complete', () => {
  for (const [state, preview] of [[createEmptyState(), false], [createDemoState(), true]]) {
    const draft = { activation: create(preview) }, before = JSON.stringify(state);
    for (const requested of [home, activation('purpose'), activation('ready'), { section: 'plan', page: 'home' }, { section: 'onboarding', step: 'pin' }]) assert.deepEqual(safeRoute(requested, state, draft), activation('fund'));
    okay(fundActivation(draft.activation, { amount: 10000, source: 'Mobile money' }));
    assert.deepEqual(safeRoute(home, state, draft), activation('purpose'));
    assert.deepEqual(safeRoute(activation('ready'), state, draft), activation('purpose'));
    okay(addActivationBudgetItem(draft.activation, { name: 'Transport', amount: 1000 })); okay(saveActivationBudget(draft.activation));
    assert.deepEqual(safeRoute(home, state, draft), activation('ready'));
    assert.deepEqual(safeRoute(activation('ready'), state, draft), activation('ready'));
    assert.equal(JSON.stringify(state), before);
  }
});

test('activation destinations have distinct identities and explicit previous steps', () => {
  assert.equal(new Set(['fund', 'purpose', 'ready'].map(step => routeKey(activation(step)))).size, 3);
  assert.deepEqual(parentRoute(activation('purpose')), activation('fund'));
  assert.deepEqual(parentRoute(activation('ready')), activation('purpose'));
  assert.deepEqual(parentRoute(activation('fund')), { section: 'welcome' });
});

test('completed activation cannot be reopened from stale browser entries and finishing prunes the wizard trail', () => {
  const draft = planned(), { state } = okay(completeActivation(draft));
  for (const requested of ['fund', 'purpose', 'ready']) {
    assert.deepEqual(safeRoute(activation(requested), state, { activation: draft }), home);
    assert.deepEqual(safeRoute(activation(requested), state, {}), home);
  }
  assert.deepEqual(safeRoute(activation('ready'), createEmptyState(), {}), { section: 'welcome' });
  assert.equal(compactTrail([{ section: 'welcome' }, { section: 'onboarding', step: 'pin-confirm' }, activation('fund'), activation('purpose'), activation('ready')], home, { finish: true }).some(route => ['welcome', 'onboarding', 'activation'].includes(route.section)), false);
});


test('adding an essential after the saved summary revokes completion until the edited budget is saved', () => {
  const draft = planned(), originalBudget = JSON.stringify(draft.state.budget);
  okay(addActivationBudgetItem(draft, { name: 'Data & airtime', amount: 2000 }));
  assert.equal(draft.budgetSaved, false);
  assert.equal(safeActivationStep(draft, 'ready'), 'purpose');
  unchangedOnFailure(draft, () => completeActivation(draft));
  assert.equal(JSON.stringify(draft.state.budget), originalBudget, 'pending edits do not silently overwrite the confirmed budget');
  const resumed = JSON.parse(JSON.stringify(draft));
  assert.deepEqual(safeRoute(activation('ready'), createEmptyState(), { activation: resumed }), activation('purpose'));
  okay(saveActivationBudget(resumed));
  assert.equal(resumed.state.budget.items.length, 2);
  assert.equal(resumed.state.budget.items.reduce((sum, item) => sum + item.amount, 0), 8000);
  okay(completeActivation(resumed));
  assert.equal(resumed.state.wallet, 10000); assert.equal(resumed.state.transactions.length, 1);
});
