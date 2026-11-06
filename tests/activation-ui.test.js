import test from 'node:test';
import assert from 'node:assert/strict';
import { createEmptyState } from '../dist/js/model.js';
import { createActivationDraft, fundActivation, addActivationBudgetItem, saveActivationBudget, safeActivationStep, completeActivation } from '../dist/js/activation-model.js';
import { renderActivation, bindActivation } from '../dist/js/activation.js';

function draft({ funded = false } = {}) {
  const state = createEmptyState(); state.onboardingDone = true;
  const d = createActivationDraft({ state, preview: true });
  if (funded) assert.equal(fundActivation(d, { amount: 10000, source: 'Mobile money' }).ok, true);
  return d;
}

test('funding shows the demo boundary and returning to a completed top-up has one next action', () => {
  const d = draft();
  const first = renderActivation({ draft: { activation: d } }, { step: 'fund' });
  assert.match(first, /No real money leaves/);
  assert.match(first, /SIGNUP PREVIEW/);
  assert.match(first, /id="activation-funding"/);
  assert.equal(fundActivation(d, { amount: 10000, source: 'Mobile money' }).ok, true);
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

function binder(d, { step = 'purpose', fields = [] } = {}) {
  const handlers = {}, navigations = [], error = { textContent: '' };
  let refreshes = 0, captureCurrent = null;
  const root = {
    isConnected: true,
    querySelectorAll(selector) { return selector === '[data-activation-field]' ? fields : []; },
    querySelector(selector) { return selector === '.activation-error' ? error : null; },
    addEventListener(name, handler) { handlers[name] = handler; }, removeEventListener() {},
  };
  const ctx = { draft: { activation: d }, $: () => root, setCapture(callback) { captureCurrent = callback; }, saveDraft() {}, refresh() { captureCurrent?.(); refreshes++; }, go(route) { captureCurrent?.(); navigations.push(route); } };
  const cleanup = bindActivation(ctx, { step });
  return { error, navigations, cleanup, get refreshes() { return refreshes; }, input(target) { handlers.input({ target }); }, change(target) { handlers.change({ target }); }, click(dataset) { handlers.click({ target: { closest() { return { dataset, disabled: false }; } } }); } };
}

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

test('save includes the visible allocation, then reaches the funded and budgeted summary', () => {
  const d = draft({ funded: true }); d.category = 'Transport'; d.amountText = '30';
  const ui = binder(d, { fields: [{ dataset: { activationField: 'amountText' }, value: '30' }] });
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

test('a duplicate pending allocation displays an error and cannot save or navigate forward', () => {
  const d = draft({ funded: true });
  assert.equal(addActivationBudgetItem(d, { name: 'Transport', amount: 3000 }).ok, true);
  d.category = 'custom'; d.categoryName = '  TRANSPORT  '; d.amountText = '10';
  const ui = binder(d);
  ui.click({ activationAction: 'save-budget' });
  assert.match(ui.error.textContent, /already in your budget/);
  assert.equal(ui.navigations.length, 0);
  assert.equal(d.items.length, 1);
  assert.equal(d.state.budget.created, false);
  ui.cleanup();
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
 const field={dataset:{activationField:'keepBackText'},value:'10'};
 const ui=binder(d,{fields:[field]});
 assert.match(renderActivation({draft:{activation:d}},{step:'purpose'}),/Keep a little back · optional/);
 ui.click({activationAction:'save-budget'});
 assert.equal(ui.error.textContent,'');assert.equal(d.state.buffer,1000);assert.equal(d.state.wallet,10000);
 const html=renderActivation({draft:{activation:d}},{step:'ready'});assert.match(html,/Kept back/);assert.match(html,/GH₵60\.00/);ui.cleanup();
});
test('a keep-back edit cannot overallocate first money or complete without saving',()=>{
 const d=readyDraft(),field={dataset:{activationField:'keepBackText'},value:'90'},ui=revisitPurpose(d,[field]);
 ui.input(field);assertNeedsSave(d);ui.click({activationAction:'save-budget'});
 assert.match(ui.error.textContent,/within the money/);assert.equal(d.state.buffer,0);assert.equal(d.budgetSaved,false);ui.cleanup();
});
