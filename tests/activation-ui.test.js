import test from 'node:test';
import assert from 'node:assert/strict';
import { createEmptyState } from '../dist/js/model.js';
import { createActivationDraft, restoreActivationDraft, acknowledgeCreatedAccount, addActivationBudgetItem, saveActivationBudget, safeActivationStep, completeActivation, requestActivationFunding } from '../dist/js/activation-model.js';
import { renderActivation, bindActivation } from '../dist/js/activation.js';
import { confirmFunding } from './helpers/activation-funding.js';

function draft({ funded = false, acknowledged = true } = {}) {
  const state = createEmptyState({ name: 'Ama', phone: '0240000000' }); state.onboardingDone = true;
  state.accounts = [
    { type: 'operational', holderName: 'Ama Mensah', status: 'simulated-ready', reference: 'DEMO-OPERATIONAL' },
    { type: 'savings', holderName: 'Savings decoy', accountNumber: '999999999999', status: 'simulated-ready' },
  ];
  const d = createActivationDraft({ state, preview: true });
  if (acknowledged || funded) assert.equal(acknowledgeCreatedAccount(d).ok, true);
  if (funded) assert.equal(confirmFunding(d, { amount: 10000, source: 'Mobile money' }).ok, true);
  return d;
}

test('signup first celebrates only the stored Everyday account and labels the sample number honestly', () => {
  const d = draft({ acknowledged: false });
  d.state.profile.name = 'Unverified nickname';
  const before = JSON.stringify(d), html = renderActivation({ draft: { activation: d } }, { step: 'fund' });
  assert.match(html, /Your sample account is ready, Ama/);
  assert.match(html, /Money just.*got personal/s);
  assert.match(html, /GCB Bank/);
  assert.match(html, /000000000001/);
  assert.match(html, /Ama Mensah/);
  assert.match(html, /Example number/);
  assert.match(html, /No live account/);
  assert.match(html, /Do not transfer real money/);
  assert.match(html, /data-activation-action="acknowledge-account"/);
  assert.match(html, /data-activation-action="copy-account-number"/);
  assert.doesNotMatch(html, /999999999999|Savings decoy|Unverified nickname|DEMO-SAVINGS/);
  assert.doesNotMatch(html, /data-activation-action="fund"|id="activation-funding"|data-activation-action="defer"/);
  assert.equal(JSON.stringify(d), before, 'Rendering congratulates without funding or changing the checkpoint.');
});

test('an operational number is used as supplied while a missing operational record never falls back to Savings', () => {
  const d = draft({ acknowledged: false });
  const everyday = d.state.accounts.find(item => item.type === 'operational');
  everyday.accountNumber = '100200300400'; everyday.status = 'ready'; delete everyday.demoNumber;
  const provided = renderActivation({ draft: { activation: d } }, { step: 'account-created' });
  assert.match(provided, /100200300400/);
  assert.doesNotMatch(provided, /000000000001|999999999999|Savings decoy/);
  delete everyday.accountNumber;
  const unavailable = renderActivation({ draft: { activation: d } }, { step: 'account-created' });
  assert.doesNotMatch(unavailable, /000000000001|999999999999|data-activation-action="copy-account-number"/);
  assert.match(unavailable.match(/<button\b[^>]*data-activation-action="acknowledge-account"[^>]*>/)?.[0] || '', /\bdisabled\b/);
  assert.equal(acknowledgeCreatedAccount(d).ok, false);
  d.state.accounts = d.state.accounts.filter(item => item.type === 'savings');
  const missing = renderActivation({ draft: { activation: d } }, { step: 'account-created' });
  assert.doesNotMatch(missing, /100200300400|000000000001|999999999999|Savings decoy/);
  assert.doesNotMatch(missing, /data-activation-action="copy-account-number"/);
  assert.match(missing.match(/<button\b[^>]*data-activation-action="acknowledge-account"[^>]*>/)?.[0] || '', /\bdisabled\b/);
  assert.equal(acknowledgeCreatedAccount(d).ok, false);
});

test('an invalid supplied operational number cannot show or copy an older valid demo number', () => {
  const d = draft({ acknowledged: false });
  d.state.accounts.find(account => account.type === 'operational').accountNumber = 'invalid-bank-reference';
  const before = JSON.stringify(d), html = renderActivation({ draft: { activation: d } }, { step: 'account-created' });
  assert.doesNotMatch(html, /000000000001|999999999999|invalid-bank-reference|data-activation-action="copy-account-number"/);
  assert.match(html.match(/<button\b[^>]*data-activation-action="acknowledge-account"[^>]*>/)?.[0] || '', /\bdisabled\b/);
  assert.equal(JSON.stringify(d), before);
  assert.equal(acknowledgeCreatedAccount(d).ok, false);
});

test('the arrival view never creates a missing sample number until the saved draft is explicitly restored', () => {
  const d = draft({ acknowledged: false });
  delete d.state.accounts.find(account => account.type === 'operational').demoNumber;
  const before = JSON.stringify(d), original = renderActivation({ draft: { activation: d } }, { step: 'account-created' });
  assert.equal(JSON.stringify(d), before);
  assert.doesNotMatch(original, /000000000001|data-activation-action="copy-account-number"/);
  assert.match(original.match(/<button\b[^>]*data-activation-action="acknowledge-account"[^>]*>/)?.[0] || '', /\bdisabled\b/);
  const restored = restoreActivationDraft(d), html = renderActivation({ draft: { activation: restored } }, { step: 'account-created' });
  assert.match(html, /000000000001/);
  assert.match(html, /Example number/);
  assert.doesNotMatch(html.match(/<button\b[^>]*data-activation-action="acknowledge-account"[^>]*>/)?.[0] || '', /\bdisabled\b/);
});

test('funding shows the demo boundary and returning to a completed top-up has one next action', () => {
  const d = draft();
  const first = renderActivation({ draft: { activation: d } }, { step: 'fund' });
  assert.match(first, /No real request or transfer is made/);
  assert.match(first, /SIGNUP PREVIEW/);
  assert.match(first, /id="activation-funding"/);
  assert.equal(confirmFunding(d, { amount: 10000, source: 'Mobile money' }).ok, true);
  const returned = renderActivation({ draft: { activation: d } }, { step: 'fund' });
  assert.doesNotMatch(returned, /id="activation-funding"/);
  assert.doesNotMatch(returned, /data-activation-action="fund"/);
  assert.equal((returned.match(/data-activation-action="continue-purpose"/g) || []).length, 1);
});

test('purpose controls reveal the selected category and used categories cannot be selected twice', () => {
  const d = draft({ funded: true });
  const initial = renderActivation({ draft: { activation: d } }, { step: 'purpose' });
  assert.doesNotMatch(initial, /id="activation-allocation"/);
  d.category = 'custom';
  const custom = renderActivation({ draft: { activation: d } }, { step: 'purpose' });
  assert.match(custom, /id="activation-category-name"/);
  assert.match(custom, /id="activation-allocation"/);
  assert.equal(addActivationBudgetItem(d, { name: 'Transport', amount: 3000 }).ok, true);
  const added = renderActivation({ draft: { activation: d } }, { step: 'purpose' });
  assert.match(added, /data-activation-category="Transport"[^>]*disabled/);
  assert.match(added, /GH₵70\.00/);
});

function binder(d, { step = 'purpose', fields = [], entering = false, selectors = {}, context = {} } = {}) {
  const handlers = {}, navigations = [], error = { textContent: '' }, copyFeedback = { textContent: '' };
  let refreshes = 0, exits = 0, saves = 0, captureCurrent = null;
  const root = {
    isConnected: true,
    classList: { contains(name) { return name === 'activation-enter' && entering; } },
    querySelectorAll(selector) { return selector === '[data-activation-field]' ? fields : []; },
    querySelector(selector) { return selector === '.activation-error' ? error : selector === '[data-activation-copy-feedback]' ? copyFeedback : selectors[selector] || null; },
    addEventListener(name, handler) { handlers[name] = handler; }, removeEventListener() {},
  };
  const ctx = { draft: { activation: d }, $: () => root, setCapture(callback) { captureCurrent = callback; }, saveDraft() { saves++; }, refresh() { captureCurrent?.(); refreshes++; }, go(route) { captureCurrent?.(); navigations.push(route); }, exitActivation() { captureCurrent?.(); exits++; }, ...context };
  const cleanup = bindActivation(ctx, { step });
  return { error, copyFeedback, navigations, cleanup, get refreshes() { return refreshes; }, get exits() { return exits; }, get saves() { return saves; }, input(target) { handlers.input({ target }); }, change(target) { handlers.change({ target }); }, click(dataset) { return handlers.click({ target: { closest() { return { dataset, disabled: false }; } } }); } };
}

test('account celebration is recorded when bound and cannot replay after Back or saved-draft restore', () => {
  const d = draft({ acknowledged: false }), before = JSON.stringify(d);
  const first = renderActivation({ draft: { activation: d } }, { step: 'account-created' });
  assert.match(first, /activation-step-account-created activation-enter/);
  assert.equal(JSON.stringify(d), before, 'Rendering does not record or consume the celebration.');
  const stateBefore = JSON.stringify(d.state);
  const arrival = binder(d, { step: 'account-created', entering: true });
  assert.equal(d.accountCelebrated, true);
  assert.equal(arrival.saves, 1);
  assert.equal(JSON.stringify(d.state), stateBefore);
  assert.equal(d.accountAcknowledged, false);
  assert.doesNotMatch(renderActivation({ draft: { activation: d } }, { step: 'account-created' }), /activation-step-account-created activation-enter/);
  arrival.click({ activationAction: 'acknowledge-account' });
  arrival.cleanup();
  renderActivation({ draft: { activation: d } }, { step: 'fund' });
  const funding = binder(d, { step: 'fund' });
  funding.click({ activationAction: 'back' });
  funding.cleanup();
  assert.equal(d.step, 'account-created');
  assert.doesNotMatch(renderActivation({ draft: { activation: d } }, { step: 'account-created' }), /activation-step-account-created activation-enter/);
  const restored = restoreActivationDraft(JSON.parse(JSON.stringify(d)));
  assert.equal(restored.accountCelebrated, true);
  assert.doesNotMatch(renderActivation({ draft: { activation: restored } }, { step: 'account-created' }), /activation-step-account-created activation-enter/);
  const resumed = binder(restored, { step: 'account-created', entering: false });
  assert.equal(resumed.saves, 0, 'Restoring a celebrated account does not consume another celebration.');
  resumed.cleanup();
  const fresh = draft({ acknowledged: false });
  assert.match(renderActivation({ draft: { activation: fresh } }, { step: 'account-created' }), /activation-step-account-created activation-enter/);
  const freshArrival = binder(fresh, { step: 'account-created', entering: true });
  assert.equal(fresh.accountCelebrated, true);
  assert.equal(freshArrival.saves, 1);
  freshArrival.cleanup();
});

test('an unconfirmed account does not consume the first celebration', () => {
  const d = draft({ acknowledged: false });
  d.state.accounts = [];
  const ui = binder(d, { step: 'account-created', entering: true });
  assert.notEqual(d.accountCelebrated, true);
  assert.equal(ui.saves, 0);
  ui.cleanup();
});

test('exiting before Continue preserves the congratulations checkpoint on resume', () => {
  const d = draft({ acknowledged: false }), ui = binder(d, { step: 'account-created' });
  ui.click({ activationAction: 'exit' });
  assert.equal(ui.exits, 1);
  assert.equal(d.accountAcknowledged, false);
  const resumed = JSON.parse(JSON.stringify(d));
  assert.equal(safeActivationStep(resumed, 'fund'), 'account-created');
  const html = renderActivation({ draft: { activation: resumed } }, { step: 'fund' });
  assert.match(html, /data-activation-action="acknowledge-account"/);
  assert.doesNotMatch(html, /id="activation-funding"/);
  assert.equal(resumed.state.wallet, 0);
  assert.equal(resumed.state.transactions.length, 0);
  ui.cleanup();
});

test('Continue acknowledges the account once and opens Add Money without creating a top-up', () => {
  const d = draft({ acknowledged: false }), before = JSON.stringify(d.state);
  const ui = binder(d, { step: 'account-created' });
  ui.click({ activationAction: 'acknowledge-account' });
  assert.equal(d.accountAcknowledged, true);
  assert.equal(ui.navigations.at(-1).step, 'fund');
  assert.equal(JSON.stringify(d.state), before);
  assert.equal(ui.error.textContent, '');
  ui.cleanup();
});

test('copying uses only the operational number and gives success or graceful failure feedback', async () => {
  const previous = Object.getOwnPropertyDescriptor(globalThis, 'navigator');
  try {
    const copied = [];
    Object.defineProperty(globalThis, 'navigator', { configurable: true, value: { clipboard: { async writeText(value) { copied.push(value); } } } });
    const d = draft({ acknowledged: false }), before = JSON.stringify(d), ui = binder(d, { step: 'account-created' });
    await ui.click({ activationAction: 'copy-account-number' });
    assert.deepEqual(copied, ['000000000001']);
    assert.match(ui.copyFeedback.textContent, /copied/i);
    assert.equal(JSON.stringify(d), before);
    ui.cleanup();
    Object.defineProperty(globalThis, 'navigator', { configurable: true, value: { clipboard: { async writeText() { throw new Error('Clipboard unavailable'); } } } });
    const retry = binder(d, { step: 'account-created' });
    await retry.click({ activationAction: 'copy-account-number' });
    assert.match(retry.copyFeedback.textContent, /select|copy/i);
    assert.equal(d.accountAcknowledged, false);
    retry.cleanup();
  } finally {
    if (previous) Object.defineProperty(globalThis, 'navigator', previous);
    else delete globalThis.navigator;
  }
});

test('a MoMo prompt waits for a separately confirmed receipt and keeps the received screen before planning', async () => {
  const d=draft();d.funding.amountText='100';d.funding.phone='0240000000';
  const entry=binder(d,{step:'fund'});entry.click({activationAction:'fund'});
  assert.equal(entry.refreshes,1);assert.equal(d.state.wallet,0);assert.equal(d.fundingAttempt.status,'pending');entry.cleanup();
  const waiting=renderActivation({draft:{activation:d}},{step:'fund'});
  assert.match(waiting,/Approve it/);assert.match(waiting,/0240000000/);assert.match(waiting,/I’ve approved it/);
  assert.doesNotMatch(waiting,/data-activation-action="defer"|data-activation-action="continue-purpose"|data-activation-source=/);
  const ui=binder(d,{step:'fund'});await ui.click({activationAction:'check-funding'});
  assert.equal(d.state.wallet,0);assert.equal(d.state.transactions.length,0);assert.equal(d.fundingAttempt.status,'pending');
  ui.click({activationDemoOutcome:'confirmed'});assert.equal(d.state.wallet,0,'A provider event is still checked before it is applied.');
  await ui.click({activationAction:'check-funding'});
  assert.equal(d.state.wallet,10000);assert.equal(d.state.transactions.length,1);assert.equal(d.step,'fund');
  assert.match(renderActivation({draft:{activation:d}},{step:'fund'}),/Money in.*Give it a plan/s);
  ui.cleanup();const received=binder(d,{step:'fund'});received.click({activationAction:'continue-purpose'});
  assert.equal(received.navigations.at(-1).step,'purpose');received.cleanup();
});

test('bank instructions show only Everyday details and saying sent only checks for receipt', async () => {
  const d=draft();assert.equal(requestActivationFunding(d,{amount:5000,source:'Bank transfer'}).ok,true);
  const html=renderActivation({draft:{activation:d}},{step:'fund'});
  assert.match(html,/GCB Bank/);assert.match(html,/Ama Mensah/);assert.match(html,/000000000001/);assert.match(html,/LUMO-/);assert.match(html,/I’ve sent it/);
  assert.doesNotMatch(html,/999999999999|Savings decoy/);
  const ui=binder(d,{step:'fund'});await ui.click({activationAction:'check-funding'});
  assert.equal(d.state.wallet,0);assert.equal(d.fundingAttempt.status,'pending');
  ui.click({activationDemoOutcome:'failed'});await ui.click({activationAction:'check-funding'});
  assert.equal(d.state.wallet,0);assert.match(renderActivation({draft:{activation:d}},{step:'fund'}),/Try again/);
  ui.cleanup();const failed=binder(d,{step:'fund'});failed.click({activationAction:'retry-funding'});
  assert.equal(d.fundingAttempt,null);assert.equal(failed.refreshes,1);failed.cleanup();
});

test('leaving while a status check resolves prevents a late credit on the detached screen', async () => {
  const d=draft();requestActivationFunding(d,{amount:5000,source:'Bank transfer'});
  const ui=binder(d,{step:'fund'});ui.click({activationDemoOutcome:'confirmed'});
  const check=ui.click({activationAction:'check-funding'});ui.cleanup();await check;
  assert.equal(d.state.wallet,0);assert.equal(d.fundingAttempt.status,'pending');
});

test('typing a custom purpose keeps focus by updating the draft without a rerender', () => {
  const d = draft({ funded: true }); d.category = 'custom';
  const field = { dataset: { activationField: 'categoryName' }, value: 'Final year project' };
  const ui = binder(d, { fields: [field] });
  ui.input(field);
  assert.equal(d.categoryName, 'Final year project');
  assert.equal(d.category, 'custom');
  assert.equal(ui.refreshes, 0);
  ui.cleanup();
});

test('adding the visible allocation then completing the budget reaches the funded summary', () => {
  const d = draft({ funded: true }); d.category = 'Transport'; d.amountText = '30';
  const entry = binder(d, { fields: [{ dataset: { activationField: 'amountText' }, value: '30' }] });
  entry.click({ activationAction: 'add-item' });
  assert.equal(entry.error.textContent, '');
  assert.equal(d.items.length, 1);
  assert.equal(d.state.budget.created, false, 'Adding an essential does not complete the budget.');
  assert.equal(entry.navigations.length, 0);
  assert.equal(d.category, '');
  assert.equal(d.amountText, '');
  entry.cleanup();
  const ui = binder(d);
  ui.click({ activationAction: 'save-budget' });
  assert.equal(ui.error.textContent, '');
  assert.equal(d.state.budget.items[0].name, 'Transport');
  assert.equal(d.state.budget.items[0].amount, 3000);
  assert.equal(ui.navigations.at(-1).step, 'ready');
  assert.equal(d.category, '');
  assert.equal(d.amountText, '');
  const summary = renderActivation({ draft: { activation: d } }, { step: 'ready' });
  assert.match(summary, /GH₵100\.00/);
  assert.match(summary, /GH₵30\.00/);
  assert.match(summary, /GH₵70\.00/);
  ui.cleanup();
});

test('adding a duplicate pending allocation displays an error and cannot save or navigate forward', () => {
  const d = draft({ funded: true });
  assert.equal(addActivationBudgetItem(d, { name: 'Transport', amount: 3000 }).ok, true);
  d.category = 'custom'; d.categoryName = '  TRANSPORT  '; d.amountText = '10';
  const ui = binder(d);
  ui.click({ activationAction: 'add-item' });
  assert.match(ui.error.textContent, /already in your budget/);
  assert.equal(ui.navigations.length, 0);
  assert.equal(d.items.length, 1);
  assert.equal(d.state.budget.created, false);
  ui.click({ activationAction: 'save-budget' });
  assert.match(ui.error.textContent, /Add this essential first/);
  assert.equal(ui.navigations.length, 0);
  assert.equal(d.items.length, 1);
  assert.equal(d.state.budget.created, false);
  ui.cleanup();
});

test('first budget keeps Add this essential and Complete budget as separate footer actions', () => {
  const d = draft({ funded: true });
  const controls = () => {
    const html = renderActivation({ draft: { activation: d } }, { step: 'purpose' });
    const footer = html.match(/<footer class="activation-footer">([\s\S]*?)<\/footer>/)?.[1] || '';
    const button = action => footer.match(new RegExp(`<button\\b[^>]*data-activation-action="${action}"[^>]*>`))?.[0] || '';
    assert.match(footer, /class="activation-budget-actions"/);
    assert.match(footer, /class="activation-add-essential"/);
    assert.match(footer, /data-activation-action="save-budget"[^>]*>Complete budget<\/button>/);
    assert.ok(footer.indexOf('class="activation-add-essential"') < footer.indexOf('data-activation-action="save-budget"'));
    assert.equal((html.match(/data-activation-action="(?:add-item|choose-item)"/g) || []).length, 1, 'Add stays in the persistent footer rather than the scrolling form.');
    return { add: button('add-item'), choose: button('choose-item'), complete: button('save-budget'), footer };
  };
  let actions = controls();
  assert.match(actions.add, /\bdisabled\b/);
  assert.match(actions.footer, /Add this essential<\/button>/);
  assert.match(actions.complete, /\bdisabled\b/);
  d.category = 'Transport'; d.amountText = '30';
  actions = controls();
  assert.doesNotMatch(actions.add, /\bdisabled\b/);
  assert.match(actions.complete, /\bdisabled\b/, 'The visible essential must be added explicitly before completion.');
  const ui = binder(d);
  ui.click({ activationAction: 'add-item' });
  actions = controls();
  assert.equal(actions.add, '');
  assert.match(actions.choose, /data-activation-action="choose-item"/);
  assert.doesNotMatch(actions.choose, /\bdisabled\b/);
  assert.match(actions.footer, /Add another essential<\/button>/);
  assert.doesNotMatch(actions.complete, /\bdisabled\b/);
  assert.match(actions.footer, /1 essential added/);
  ui.cleanup();
});

test('Add another essential reveals and focuses the category picker without mutating the plan', () => {
  const d = draft({ funded: true });
  assert.equal(addActivationBudgetItem(d, { name: 'Transport', amount: 3000 }).ok, true);
  const scrolls = [], focuses = [];
  const ui = binder(d, { selectors: {
    '.activation-categories': { scrollIntoView(options) { scrolls.push(options); } },
    '[data-activation-category]:not(:disabled)': { focus(options) { focuses.push(options); } },
  } });
  const before = JSON.stringify(d);
  ui.click({ activationAction: 'choose-item' });
  assert.deepEqual(scrolls, [{ block: 'start', behavior: 'auto' }]);
  assert.deepEqual(focuses, [{ preventScroll: true }]);
  assert.equal(JSON.stringify(d), before);
  assert.equal(ui.saves, 0);
  assert.equal(ui.refreshes, 0);
  assert.equal(ui.navigations.length, 0);
  d.category = 'Data & airtime'; d.amountText = '20';
  const pending = JSON.stringify(d);
  ui.click({ activationAction: 'choose-item' });
  assert.equal(scrolls.length, 1, 'An old action cannot discard or bypass an essential being entered.');
  assert.equal(JSON.stringify(d), pending);
  ui.cleanup();
});

test('Complete budget cannot silently add a pending essential or change confirmed money', () => {
  for (const hasAddedItem of [false, true]) {
    const d = draft({ funded: true });
    if (hasAddedItem) assert.equal(addActivationBudgetItem(d, { name: 'Transport', amount: 3000 }).ok, true);
    d.category = 'Data & airtime'; d.amountText = '20';
    const beforeItems = JSON.stringify(d.items), beforeState = JSON.stringify(d.state);
    const ui = binder(d);
    ui.click({ activationAction: 'save-budget' });
    assert.match(ui.error.textContent, /Add this essential first/);
    assert.equal(JSON.stringify(d.items), beforeItems);
    assert.equal(JSON.stringify(d.state), beforeState);
    assert.equal(d.category, 'Data & airtime');
    assert.equal(d.amountText, '20');
    assert.equal(d.budgetSaved, false);
    assert.equal(ui.navigations.length, 0);
    ui.cleanup();
  }
});

test('saved allocations can be revisited without accidentally funding the account again', () => {
  const d = draft({ funded: true });
  addActivationBudgetItem(d, { name: 'Transport', amount: 3000 });
  saveActivationBudget(d);
  const before = d.state.wallet;
  const ui = binder(d, { step: 'ready' });
  ui.click({ activationAction: 'back' });
  assert.equal(ui.navigations.at(-1).step, 'purpose');
  assert.equal(d.state.wallet, before);
  assert.equal(d.items.length, 1);
  ui.cleanup();
});

test('selecting a preset clears stale custom input before the app captures the outgoing screen', () => {
  const d = draft({ funded: true }); d.category = 'custom'; d.categoryName = 'Old custom entry';
  const ui = binder(d, { fields: [{ dataset: { activationField: 'categoryName' }, value: 'Old custom entry' }] });
  ui.click({ activationCategory: 'Transport' });
  assert.equal(d.category, 'Transport');
  assert.equal(d.categoryName, '');
  assert.equal(ui.refreshes, 1);
  ui.cleanup();
});


function revisitPurpose(d, fields = []) {
  const ready = binder(d, { step: 'ready' });
  ready.click({ activationAction: 'back' });
  assert.equal(d.step, 'purpose', 'the resume checkpoint follows the visible previous page');
  ready.cleanup();
  return binder(d, { step: 'purpose', fields });
}
function readyDraft() {
  const d = draft({ funded: true });
  assert.equal(addActivationBudgetItem(d, { name: 'Transport', amount: 3000 }).ok, true);
  assert.equal(saveActivationBudget(d).ok, true);
  return d;
}
function assertNeedsSave(d) {
  assert.equal(d.step, 'purpose'); assert.equal(d.budgetSaved, false);
  assert.equal(safeActivationStep(d, 'ready'), 'purpose');
  assert.equal(completeActivation(d).ok, false);
  const resumed = JSON.parse(JSON.stringify(d));
  assert.equal(safeActivationStep(resumed, 'ready'), 'purpose', 'resume cannot skip unsaved edits');
}

test('adding another essential after revisiting the saved summary requires saving the new plan', () => {
  const d = readyDraft(), ui = revisitPurpose(d);
  d.category = 'Data & airtime'; d.amountText = '20';
  ui.click({ activationAction: 'add-item' });
  assertNeedsSave(d);
  assert.equal(d.state.budget.items.length, 1); assert.equal(d.items.length, 2);
  ui.cleanup();
  const save = binder(d);
  save.click({ activationAction: 'save-budget' });
  assert.equal(save.error.textContent, ''); assert.equal(d.step, 'ready');
  assert.equal(d.state.budget.items.length, 2); assert.equal(completeActivation(d).ok, true);
  assert.equal(d.state.wallet, 10000); assert.equal(d.state.transactions.length, 1);
  save.cleanup();
});

test('removing the last essential after revisiting Ready cannot reopen Ready or finish with the old plan', () => {
  const d = readyDraft(), ui = revisitPurpose(d);
  ui.click({ activationRemove: '0' });
  assertNeedsSave(d); assert.equal(d.items.length, 0);
  assert.equal(d.state.budget.items.length, 1, 'the old confirmed plan stays separate until a replacement is saved');
  ui.click({ activationAction: 'save-budget' });
  assert.match(ui.error.textContent, /at least one essential/);
  assert.equal(ui.navigations.length, 0); assertNeedsSave(d);
  ui.cleanup();
});

test('editing the last-until date through input or change requires a fresh budget confirmation', () => {
  for (const event of ['input', 'change']) {
    const d = readyDraft(), originalDue = d.state.budget.items[0].due;
    const changedDue = new Date(Date.now() + 60 * 86400000).toISOString().slice(0, 10);
    const field = { dataset: { activationField: 'due' }, value: changedDue };
    const ui = revisitPurpose(d, [field]);
    ui[event](field);
    assertNeedsSave(d); assert.equal(d.due, changedDue); assert.equal(d.state.budget.items[0].due, originalDue);
    ui.click({ activationAction: 'save-budget' });
    assert.equal(ui.error.textContent, ''); assert.equal(d.state.budget.items[0].due, changedDue);
    assert.equal(d.step, 'ready'); assert.equal(completeActivation(d).ok, true);
    ui.cleanup();
  }
});

test('an unfunded account offers an honest wait route but a confirmed top-up keeps the planning objective',()=>{
 const d=draft();let deferred=0;
 const html=renderActivation({draft:{activation:d}},{step:'fund'});
 assert.match(html,/Waiting for my money/);assert.match(html,/Add money and plan when it arrives/);
 const handlers={},root={isConnected:true,querySelectorAll:()=>[],querySelector:()=>null,addEventListener:(name,fn)=>{handlers[name]=fn;},removeEventListener(){}};
 const cleanup=bindActivation({draft:{activation:d},$:()=>root,saveDraft(){},deferActivationFunding(){deferred++;}},{step:'fund'});
 handlers.click({target:{closest:()=>({dataset:{activationAction:'defer'},disabled:false})}});
 assert.equal(deferred,1);assert.equal(d.state.wallet,0);assert.equal(d.state.transactions.length,0);cleanup();
 const funded=draft({funded:true});assert.doesNotMatch(renderActivation({draft:{activation:funded}},{step:'fund'}),/data-activation-action="defer"/);
});
test('optional keep-back is saved separately and shown in the free-money summary',()=>{
 const d=draft({funded:true});d.category='Transport';d.amountText='30';
 const originalBuffer=d.state.buffer;
 const field={dataset:{activationField:'keepBackText'},value:'10'};
 const ui=binder(d,{fields:[field]});
 assert.match(renderActivation({draft:{activation:d}},{step:'purpose'}),/Keep a little back · optional/);
 ui.click({activationAction:'add-item'});
 assert.equal(ui.error.textContent,'');assert.equal(d.items.length,1);assert.equal(d.state.buffer,originalBuffer);ui.cleanup();
 const complete=binder(d);complete.click({activationAction:'save-budget'});
 assert.equal(complete.error.textContent,'');assert.equal(d.state.buffer,1000);assert.equal(d.state.wallet,10000);
 const html=renderActivation({draft:{activation:d}},{step:'ready'});assert.match(html,/Kept back/);assert.match(html,/GH₵60\.00/);complete.cleanup();
});
test('a keep-back edit cannot overallocate first money or complete without saving',()=>{
 const d=readyDraft(),field={dataset:{activationField:'keepBackText'},value:'90'},ui=revisitPurpose(d,[field]);
 ui.input(field);assertNeedsSave(d);ui.click({activationAction:'save-budget'});
 assert.match(ui.error.textContent,/within the money/);assert.equal(d.state.buffer,0);assert.equal(d.budgetSaved,false);ui.cleanup();
});

test('first top-up displays the account phone read-only and cannot capture an injected phone field', () => {
  const d = draft();
  d.funding.phone = '0551111111';
  const html = renderActivation({ draft: { activation: d } }, { step: 'fund' });
  assert.match(html, /Your registered MoMo number/);
  assert.match(html, /id="activation-momo-phone" value="0240000000" readonly aria-readonly="true"/);
  assert.doesNotMatch(html, /0551111111|data-activation-field="funding.phone"/);
  const fields = [
    { dataset: { activationField: 'funding.phone' }, value: '0552222222' },
    { dataset: { activationField: 'funding.amountText' }, value: '100' },
  ];
  const ui = binder(d, { step: 'fund', fields });
  ui.click({ activationAction: 'fund' });
  assert.equal(d.funding.phone, '0240000000');
  assert.equal(d.fundingAttempt.phone, '0240000000');
  assert.equal(d.state.wallet, 0);
  ui.cleanup();
});

test('connected first-plan validation keeps the approved cushion, date and essential rules before any server request', async () => {
  for (const alter of [
    d => { d.keepBackText = '90'; },
    d => { d.keepBackText = '-1'; },
    d => { d.due = '2020-01-01'; },
    d => { d.items = []; },
  ]) {
    const d = draft({ funded: true }); d.shared = true; d.state.transactions[0].ledgerJournalId = 'confirmed-shared-funding';
    addActivationBudgetItem(d, { name: 'Transport', amount: 3000 }); alter(d);
    const before = JSON.stringify(d.state), calls = [];
    const ui = binder(d, { context: { connected: true, checkpointActivation: async () => ({ok:true}), actAsync(...args) { calls.push(args); throw Error('Invalid first plan must not be posted.'); } } });
    await ui.click({ activationAction: 'save-budget' });
    assert.equal(calls.length, 0);
    assert.ok(ui.error.textContent);
    assert.equal(JSON.stringify(d.state), before);
    assert.equal(ui.navigations.length, 0);
    assert.equal(d.budgetSaved, false);
    ui.cleanup();
  }
});

test('connected Complete budget waits for the same confirmed plan before showing the approved ready recap', async () => {
  const d = draft({ funded: true }); d.shared = true; d.state.transactions[0].ledgerJournalId = 'confirmed-shared-funding'; d.keepBackText = '10';
  addActivationBudgetItem(d, { name: 'Transport', amount: 3000 });
  let confirm; const calls = [], pending = new Promise(resolve => { confirm = resolve; });
  const ui = binder(d, { context: { connected: true, checkpointActivation: async () => ({ok:true}), actAsync(type, payload) { calls.push({type,payload}); return pending; } } });
  const posting = ui.click({ activationAction: 'save-budget' });
  assert.equal(calls.length, 1); assert.equal(calls[0].type, 'createBudget');
  assert.equal(calls[0].payload.buffer, 1000); assert.equal(calls[0].payload.endDate, d.due);
  assert.equal(calls[0].payload.items[0].due, d.due);
  assert.equal(d.state.budget.created, false); assert.equal(d.budgetSaved, false); assert.equal(ui.navigations.length, 0);
  await ui.click({ activationAction: 'save-budget' }); assert.equal(calls.length, 1, 'Repeated taps cannot create a second first plan.');
  d.state.budget = { ...d.state.budget, created: true, items: structuredClone(calls[0].payload.items), endDate: d.due }; d.state.buffer = 1000;
  confirm({ok:true}); await posting;
  assert.equal(d.budgetSaved, true); assert.equal(ui.navigations.at(-1).step, 'ready');
  const recap = renderActivation({draft:{activation:d}}, {step:'ready'});
  assert.match(recap, /FIRST MOVE\. MADE\./); assert.match(recap, /Meet my Lumo/); assert.match(recap, /GH₵60\.00/);
  assert.equal(d.state.wallet, 10000, 'Planning does not move money out of Everyday.');
  ui.cleanup();
});

test('an unconfirmed connected first-plan save retains the entered essentials for correction or retry', async () => {
  const d = draft({ funded: true }); d.shared = true; d.state.transactions[0].ledgerJournalId = 'confirmed-shared-funding';
  addActivationBudgetItem(d, { name: 'Transport', amount: 3000 });
  const before = JSON.stringify(d.state), ui = binder(d, { context: { connected: true, checkpointActivation: async () => ({ok:true}), actAsync: async () => ({ok:false,message:'Lumo could not confirm this plan yet.'}) } });
  await ui.click({ activationAction: 'save-budget' });
  assert.match(ui.error.textContent, /could not confirm/); assert.equal(d.items[0].amount, 3000);
  assert.equal(d.budgetSaved, false); assert.equal(ui.navigations.length, 0); assert.equal(JSON.stringify(d.state), before);
  ui.cleanup();
});

test('shared account acknowledgement stays on its approved arrival screen until the checkpoint confirms', async () => {
  const d = draft({ acknowledged: false }); d.shared = true;
  let confirm; const posted = [], ui = binder(d, { step:'account-created', context: { connected:true, checkpointActivation(step,details) { posted.push({step,details}); return new Promise(resolve=>{confirm=resolve;}); } } });
  const acknowledgement = ui.click({activationAction:'acknowledge-account'});
  assert.deepEqual(posted,[{step:'fund',details:{accountAcknowledged:true}}]);
  assert.equal(d.accountAcknowledged,false);assert.equal(ui.navigations.length,0);assert.equal(d.state.wallet,0);
  d.accountAcknowledged=true;confirm({ok:true});await acknowledgement;
  assert.equal(ui.navigations.at(-1).step,'fund');assert.equal(d.state.transactions.length,0);ui.cleanup();
});

test('editing a saved connected first plan gets a fresh reference while unchanged retries reuse theirs', async () => {
  const d = draft({funded:true});d.shared=true;d.state.transactions[0].ledgerJournalId='confirmed-shared-funding';addActivationBudgetItem(d,{name:'Transport',amount:3000});
  const posted=[],checkpoints=[];
  const context={connected:true,checkpointActivation:async step=>{checkpoints.push(step);return {ok:true};},actAsync:async(type,payload)=>{
    posted.push({type,payload:structuredClone(payload)});d.state.budget={...d.state.budget,created:true,items:structuredClone(payload.items),endDate:payload.endDate};d.state.buffer=payload.buffer;return {ok:true};
  }};
  for(const amount of [3000,3000,4000]){d.items[0].amount=amount;const ui=binder(d,{context});await ui.click({activationAction:'save-budget'});assert.equal(ui.navigations.at(-1).step,'ready');ui.cleanup();}
  assert.equal(posted[0].payload.idempotencyKey,posted[1].payload.idempotencyKey);
  assert.notEqual(posted[1].payload.idempotencyKey,posted[2].payload.idempotencyKey);
  assert.deepEqual(checkpoints,['ready','ready','ready']);assert.equal(d.state.wallet,10000);assert.equal(d.state.budget.items[0].amount,4000);
});
