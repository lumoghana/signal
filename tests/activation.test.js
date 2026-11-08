import test from 'node:test';
import assert from 'node:assert/strict';
import { createEmptyState, createDemoState, getSummary } from '../dist/js/model.js';
import { createActivationDraft, restoreActivationDraft, acknowledgeCreatedAccount, activationEverydayAccount, activationEverydayAccountNumber, deferActivationFunding, safeActivationStep, fundActivation, requestActivationFunding, checkActivationFunding, addActivationBudgetItem, saveActivationBudget, completeActivation } from '../dist/js/activation-model.js';
import { confirmFunding } from './helpers/activation-funding.js';
import { safeRoute, parentRoute, compactTrail, routeKey } from '../dist/js/navigation.js';

const okay = result => { assert.equal(result.ok, true, result.message); return result; };
const activation = step => ({ section: 'activation', step });
const home = { section: 'home', page: 'home' };
const newAccount = () => Object.assign(createEmptyState({ name: 'Ama' }), { onboardingDone: true, accounts: [
  { type: 'operational', holderName: 'Ama Mensah', status: 'simulated-ready', reference: 'DEMO-OPERATIONAL' },
  { type: 'savings', holderName: 'Savings decoy', accountNumber: '999999999999', status: 'simulated-ready' },
] });
const create = (preview = false) => createActivationDraft({ state: newAccount(), preview });
const okayAcknowledged = (preview = false) => { const draft = create(preview); okay(acknowledgeCreatedAccount(draft)); return draft; };
const funded = (preview = false) => { const draft = create(preview); okay(acknowledgeCreatedAccount(draft)); okay(confirmFunding(draft, { amount: 10000, source: 'Mobile money' })); return draft; };
const planned = (preview = false) => { const draft = funded(preview); okay(addActivationBudgetItem(draft, { name: 'Food & groceries', amount: 6000, emoji: '🍲' })); okay(saveActivationBudget(draft)); return draft; };
const unchangedOnFailure = (draft, action) => { const before = JSON.stringify(draft); assert.equal(action().ok, false); assert.equal(JSON.stringify(draft), before); };

test('activation starts with no balance, budget or ledger entries and never funds on page entry', () => {
  const account = newAccount(), before = JSON.stringify(account), draft = createActivationDraft({ state: account });
  assert.equal(draft.step, 'account-created'); assert.equal(draft.accountAcknowledged, false); assert.equal(draft.state.wallet, 0); assert.equal(draft.state.budget.created, false);
  assert.deepEqual(draft.state.transactions, []); assert.deepEqual(draft.items, []);
  for (const requested of ['account-created', 'fund', 'purpose', 'ready', 'unknown']) assert.equal(safeActivationStep(draft, requested), 'account-created');
  assert.equal(getSummary(draft.state).available, 0); assert.equal(JSON.stringify(account), before);
  assert.notEqual(draft.state, account);
  assert.equal(activationEverydayAccount(draft).demoNumber, '000000000001');
  assert.equal(account.accounts[0].demoNumber, undefined, 'The source account stays untouched.');
});

test('the account-created acknowledgement gates funding, deferral and planning without financial side effects', () => {
  const draft = create();
  unchangedOnFailure(draft, () => fundActivation(draft, { amount: 10000, source: 'Mobile money' }));
  unchangedOnFailure(draft, () => deferActivationFunding(draft));
  unchangedOnFailure(draft, () => addActivationBudgetItem(draft, { name: 'Transport', amount: 1000 }));
  unchangedOnFailure(draft, () => saveActivationBudget(draft, { items: [{ name: 'Transport', amount: 1000 }] }));
  unchangedOnFailure(draft, () => completeActivation(draft));
  const beforeMoney = JSON.stringify(draft.state);
  okay(acknowledgeCreatedAccount(draft));
  assert.equal(draft.accountAcknowledged, true);
  assert.equal(draft.step, 'fund');
  assert.equal(safeActivationStep(draft, 'fund'), 'fund');
  assert.equal(JSON.stringify(draft.state), beforeMoney);
  const waiting = okay(deferActivationFunding(draft));
  assert.equal(waiting.state.wallet, 0);
  assert.equal(waiting.state.transactions.length, 0);
});

test('repeated acknowledgements and JSON resume preserve the number, funding and saved plan', () => {
  for (const initial of [okayAcknowledged(), funded(), planned()]) {
    const resumed = JSON.parse(JSON.stringify(initial)), before = JSON.stringify(resumed);
    okay(acknowledgeCreatedAccount(resumed));
    assert.equal(JSON.stringify(resumed), before, 'Acknowledging again cannot reset an active setup.');
    assert.equal(activationEverydayAccount(resumed).demoNumber, '000000000001');
    assert.equal(safeActivationStep(resumed, 'account-created'), 'account-created');
  }
  const unacknowledged = JSON.parse(JSON.stringify(create()));
  assert.equal(safeActivationStep(unacknowledged, 'ready'), 'account-created');
});

test('legacy funded drafts infer acknowledgement only from a matching successful income record', () => {
  const legacy = funded(); delete legacy.accountAcknowledged;
  assert.equal(safeActivationStep(legacy, 'purpose'), 'purpose');
  const beforeMoney = JSON.stringify(legacy.state), oldStep = legacy.step;
  okay(acknowledgeCreatedAccount(legacy));
  assert.equal(legacy.step, oldStep);
  assert.equal(JSON.stringify(legacy.state), beforeMoney);
  for (const change of [
    d => { d.fundingTransactionId = 'missing'; },
    d => { d.state.transactions[0].status = 'pending'; },
    d => { d.state.transactions[0].type = 'payment'; },
    d => { d.state.transactions[0].amount = 0; },
    d => { d.accountAcknowledged = false; },
  ]) {
    const damaged = funded(); delete damaged.accountAcknowledged; change(damaged);
    assert.equal(safeActivationStep(damaged, 'purpose'), 'account-created');
  }
  const invented = create(); delete invented.accountAcknowledged; invented.state.wallet = 10000; invented.funded = true;
  assert.equal(safeActivationStep(invented, 'fund'), 'account-created', 'A positive wallet alone proves no completed funding.');
});

test('the Everyday record is selected by operational type and keeps an existing provided number', () => {
  const account = newAccount();
  account.accounts.reverse();
  const operational = account.accounts.find(item => item.type === 'operational');
  operational.accountNumber = '100200300400';
  operational.status = 'ready';
  const draft = createActivationDraft({ state: account });
  assert.equal(activationEverydayAccount(draft).accountNumber, '100200300400');
  assert.equal(activationEverydayAccount(draft).holderName, 'Ama Mensah');
  assert.equal(activationEverydayAccount(draft).demoNumber, undefined);
  const missing = newAccount(); missing.accounts = [missing.accounts[1]];
  assert.equal(activationEverydayAccount(createActivationDraft({ state: missing })), null);
  const awaitingNumber = newAccount(); awaitingNumber.accounts[0].status = 'ready';
  const awaitingDraft = createActivationDraft({ state: awaitingNumber });
  assert.equal(activationEverydayAccount(awaitingDraft).accountNumber, undefined);
  assert.equal(activationEverydayAccount(awaitingDraft).demoNumber, undefined, 'A missing live number cannot be filled by a hardcoded example.');
});

test('the central account-number reader validates only operational digits and never falls back from an invalid provided number', () => {
  const draft = create(), operational = activationEverydayAccount(draft);
  assert.equal(activationEverydayAccountNumber(draft), '000000000001');
  for (const value of ['123456', '001002003004', '1'.repeat(24), ' 001002003004 ']) {
    operational.accountNumber = value;
    assert.equal(activationEverydayAccountNumber(draft), value.trim());
  }
  for (const value of ['', null, 123456789, '12345', '1'.repeat(25), 'DEMO-OPERATIONAL', '100-200-300', '<b>123456</b>']) {
    operational.accountNumber = value;
    assert.equal(activationEverydayAccountNumber(draft), '', `Invalid supplied value ${String(value)} must not reveal the existing demo number.`);
  }
  delete operational.accountNumber;
  operational.status = 'ready';
  assert.equal(activationEverydayAccountNumber(draft), '', 'A demo-number field cannot stand in for a live bank number.');
  draft.state.accounts = draft.state.accounts.filter(account => account.type === 'savings');
  assert.equal(activationEverydayAccountNumber(draft), '', 'The Savings number is never used as an operational fallback.');
});

test('missing or invalid account numbers block acknowledgement atomically', () => {
  for (const invalidate of [
    d => { d.state.accounts = d.state.accounts.filter(account => account.type !== 'operational'); },
    d => { const account = activationEverydayAccount(d); account.status = 'pending'; },
    d => { activationEverydayAccount(d).accountNumber = 'invalid-bank-reference'; },
    d => { const account = activationEverydayAccount(d); account.demoNumber = '123'; },
  ]) {
    const draft = create(); invalidate(draft);
    assert.equal(safeActivationStep(draft, 'fund'), 'account-created');
    unchangedOnFailure(draft, () => acknowledgeCreatedAccount(draft));
    unchangedOnFailure(draft, () => fundActivation(draft, { amount: 10000, source: 'Mobile money' }));
    unchangedOnFailure(draft, () => deferActivationFunding(draft));
    assert.equal(draft.accountAcknowledged, false);
  }
});

test('an acknowledgement flag cannot bypass unavailable account details at a later funding or planning stage', () => {
  for (const initial of [okayAcknowledged(), funded(), planned()]) {
    initial.state.accounts = initial.state.accounts.filter(account => account.type !== 'operational');
    assert.equal(initial.accountAcknowledged, true);
    assert.equal(safeActivationStep(initial, initial.step), 'account-created');
    unchangedOnFailure(initial, () => acknowledgeCreatedAccount(initial));
    unchangedOnFailure(initial, () => fundActivation(initial, { amount: 1000, source: 'Mobile money' }));
    unchangedOnFailure(initial, () => deferActivationFunding(initial));
    unchangedOnFailure(initial, () => addActivationBudgetItem(initial, { name: 'Transport', amount: 1000 }));
    unchangedOnFailure(initial, () => saveActivationBudget(initial, { items: [{ name: 'Transport', amount: 1000 }] }));
    unchangedOnFailure(initial, () => completeActivation(initial));
  }
});

test('restoring an old unfunded reference-only prototype draft adds its persisted sample number once and never on a read', () => {
  const saved = create();
  delete activationEverydayAccount(saved).demoNumber;
  delete saved.accountAcknowledged;
  saved.funding.amountText = '75'; saved.categoryName = 'Saved draft text'; saved.step = 'fund';
  const before = JSON.stringify(saved);
  assert.equal(safeActivationStep(saved, 'fund'), 'account-created');
  assert.equal(activationEverydayAccountNumber(saved), '');
  assert.equal(JSON.stringify(saved), before, 'Read-only routing never silently manufactures an account number.');
  const restored = restoreActivationDraft(saved);
  assert.notEqual(restored, saved);
  assert.notEqual(restored.state, saved.state);
  assert.equal(JSON.stringify(saved), before);
  assert.equal(activationEverydayAccount(restored).demoNumber, '000000000001');
  assert.equal(restored.funding.amountText, '75');
  assert.equal(restored.categoryName, 'Saved draft text');
  assert.equal(restored.state.wallet, 0);
  assert.equal(restored.state.transactions.length, 0);
  assert.equal(restored.accountAcknowledged, undefined);
  assert.deepEqual(restoreActivationDraft(JSON.parse(JSON.stringify(restored))), restored);
});

test('restoration preserves confirmed funding and acknowledgements and cannot manufacture live or invalid supplied numbers', () => {
  for (const original of [create(), okayAcknowledged(), funded(), planned()]) {
    const before = JSON.stringify(original), restored = restoreActivationDraft(original);
    assert.deepEqual(restored, original);
    assert.equal(JSON.stringify(original), before);
  }
  for (const configure of [
    d => { const account = activationEverydayAccount(d); account.status = 'ready'; delete account.demoNumber; },
    d => { const account = activationEverydayAccount(d); account.accountNumber = 'invalid'; delete account.demoNumber; },
    d => { const account = activationEverydayAccount(d); account.demoNumber = 'invalid'; },
    d => { d.state.accounts = d.state.accounts.filter(account => account.type !== 'operational'); },
  ]) {
    const source = create(); configure(source);
    const before = JSON.stringify(source), restored = restoreActivationDraft(source);
    assert.equal(activationEverydayAccountNumber(restored), '');
    assert.equal(JSON.stringify(source), before);
  }
  for (const invalid of [null, undefined, [], {}, { schema: 2, state: { onboardingDone: true } }, { schema: 1, state: { onboardingDone: false } }]) assert.equal(restoreActivationDraft(invalid), null);
});

test('verified legacy funding can finish without being trapped by a newly introduced account-number gate', () => {
  const legacy = funded(); delete legacy.accountAcknowledged; legacy.state.accounts = [];
  assert.equal(safeActivationStep(legacy, 'purpose'), 'purpose');
  assert.equal(safeActivationStep(legacy, 'account-created'), 'purpose');
  const beforeAcknowledgement = JSON.stringify(legacy);
  okay(acknowledgeCreatedAccount(legacy));
  assert.equal(JSON.stringify(legacy), beforeAcknowledgement, 'A legacy bypass without a number cannot be converted into a false explicit acknowledgement.');
  okay(addActivationBudgetItem(legacy, { name: 'Transport', amount: 3000 }));
  okay(saveActivationBudget(legacy));
  assert.equal(safeActivationStep(legacy, 'ready'), 'ready');
  const result = okay(completeActivation(legacy));
  assert.equal(result.state.wallet, 10000);
  assert.equal(result.state.transactions.length, 1);
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

test('invalid funding requests fail atomically and only a confirmed receipt records money once', () => {
  const draft = create(); okay(acknowledgeCreatedAccount(draft));
  for (const amount of [undefined, 0, -1, 0.5, Infinity, NaN, 1000000001, '100']) unchangedOnFailure(draft, () => requestActivationFunding(draft, { amount, source: 'Mobile money', phone: '0240000000' }));
  unchangedOnFailure(draft, () => requestActivationFunding(draft, { amount: 10000, source: 'Cash' }));
  unchangedOnFailure(draft, () => fundActivation(draft, { amount: 10000, source: 'Bank transfer' }));
  const result = okay(confirmFunding(draft, { amount: 10000, source: 'Bank transfer' }));
  assert.equal(draft.step, 'fund'); assert.equal(draft.state.wallet, 10000); assert.equal(draft.state.transactions.length, 1);
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
  for (const original of [create(), okayAcknowledged(), funded(), planned()]) {
    const draft = JSON.parse(JSON.stringify(original));
    assert.equal(draft.step, original.step); assert.equal(safeActivationStep(draft, draft.step), original.step);
    assert.equal(JSON.stringify(draft.state), JSON.stringify(original.state));
    if (draft.funded) {
      const wallet = draft.state.wallet, count = draft.state.transactions.length;
      okay(checkActivationFunding(draft));
      assert.equal(draft.state.wallet, wallet); assert.equal(draft.state.transactions.length, count);
    }
  }
});

test('new signup and preview routes stay in pending activation until both choices are complete', () => {
  for (const [state, preview] of [[createEmptyState(), false], [createDemoState(), true]]) {
    const draft = { activation: create(preview) }, before = JSON.stringify(state);
    for (const requested of [home, activation('purpose'), activation('ready'), { section: 'plan', page: 'home' }, { section: 'onboarding', step: 'pin' }]) assert.deepEqual(safeRoute(requested, state, draft), activation('account-created'));
    okay(acknowledgeCreatedAccount(draft.activation));
    assert.deepEqual(safeRoute(home, state, draft), activation('fund'));
    okay(confirmFunding(draft.activation, { amount: 10000, source: 'Mobile money' }));
    assert.deepEqual(safeRoute(home, state, draft), activation('fund'), 'resume retains the received-money page');
    assert.deepEqual(safeRoute(activation('ready'), state, draft), activation('purpose'));
    okay(addActivationBudgetItem(draft.activation, { name: 'Transport', amount: 1000 })); okay(saveActivationBudget(draft.activation));
    assert.deepEqual(safeRoute(home, state, draft), activation('ready'));
    assert.deepEqual(safeRoute(activation('ready'), state, draft), activation('ready'));
    assert.equal(JSON.stringify(state), before);
  }
});

test('activation destinations have distinct identities and explicit previous steps', () => {
  assert.equal(new Set(['account-created', 'fund', 'purpose', 'ready'].map(step => routeKey(activation(step)))).size, 4);
  assert.deepEqual(parentRoute(activation('purpose')), activation('fund'));
  assert.deepEqual(parentRoute(activation('ready')), activation('purpose'));
  assert.deepEqual(parentRoute(activation('fund')), activation('account-created'));
  assert.deepEqual(parentRoute(activation('account-created')), { section: 'welcome' });
});

test('completed activation cannot be reopened from stale browser entries and finishing prunes the wizard trail', () => {
  const draft = planned(), { state } = okay(completeActivation(draft));
  for (const requested of ['account-created', 'fund', 'purpose', 'ready']) {
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
