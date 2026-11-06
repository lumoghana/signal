import test from 'node:test';
import assert from 'node:assert/strict';
import { createDemoState, getSummary } from '../dist/js/model.js';
import { renderLife } from '../dist/js/life.js';
import { cash } from '../dist/js/ui.js';

const visibleText = html => html.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ');
const context = (hidden = true) => {
  const state = createDemoState();
  state.settings.hideBalance = hidden;
  return { state, draft: {}, route: { section: 'life' }, $: () => null };
};
const checkIn = () => new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10);
const assertHidden = html => {
  const text = visibleText(html);
  assert.match(text, /••••\.••/);
  assert.doesNotMatch(text, /GH₵[\d,.]+/, 'Hidden read views must not expose personal amounts in their visible or accessible text.');
};

test('Recovery preview masks personal totals and protected costs without changing the proposed plan', () => {
  const ctx = context();
  ctx.draft.recovery = { days: 7, adjustments: {}, checkInDate: checkIn() };
  const before = JSON.stringify(ctx.state);
  assertHidden(renderLife(ctx, { page: 'recovery', step: 1 }));
  assertHidden(renderLife(ctx, { page: 'recovery', step: 2 }));
  assert.equal(JSON.stringify(ctx.state), before);
  ctx.state.settings.hideBalance = false;
  const summary = getSummary(ctx.state), html = renderLife(ctx, { page: 'recovery', step: 2 });
  for (const value of [summary.available, summary.planned, ctx.state.buffer, Math.floor(summary.spendable / 7)]) {
    assert.ok(visibleText(html).includes(cash(value)), `Revealing balances restores ${cash(value)}.`);
  }
  assert.match(html, /Keep this plan/);
});

test('Active Recovery honors hiding for its daily guide, balances and transaction totals', () => {
  const ctx = context();
  ctx.state.recovery = { active: true, startedAt: new Date(Date.now() - 86400000).toISOString(), days: 7, checkInDate: checkIn(), pauseSavings: true };
  const before = JSON.stringify(ctx.state);
  const hidden = renderLife(ctx, { page: 'recovery' });
  assertHidden(hidden);
  assert.match(hidden, /YOUR RECOVERY PLAN/);
  assert.match(hidden, /Expected income date/);
  assert.equal(JSON.stringify(ctx.state), before);
  ctx.state.settings.hideBalance = false;
  const summary = getSummary(ctx.state), text = visibleText(renderLife(ctx, { page: 'recovery' }));
  assert.ok(text.includes(cash(summary.dailyAllowance)));
  assert.ok(text.includes(cash(summary.available)));
  assert.ok(text.includes(cash(summary.planned)));
});

test('Money Story hides spending, saving and current daily guidance while retaining category context', () => {
  const ctx = context();
  ctx.state.transactions = [
    { id: 'payment', type: 'payment', direction: 'out', status: 'success', amount: 12345, category: 'Printing', at: new Date().toISOString() },
    { id: 'saved', type: 'saving', direction: 'out', status: 'success', amount: 6789, category: 'Money Box', at: new Date().toISOString() }
  ];
  const before = JSON.stringify(ctx.state), hidden = renderLife(ctx, { page: 'story' });
  assertHidden(hidden);
  assert.match(hidden, /Printing/);
  assert.match(hidden, /TODAY’S CHECK-IN/);
  assert.equal(JSON.stringify(ctx.state), before);
  ctx.state.settings.hideBalance = false;
  const text = visibleText(renderLife(ctx, { page: 'story' }));
  for (const value of [12345, 6789, getSummary(ctx.state).spendable, getSummary(ctx.state).dailyAllowance]) assert.ok(text.includes(cash(value)));
});

test('IOU read views and Settings keep-back respect the same preference', () => {
  const ctx = context(), iou = ctx.state.ious[0];
  assertHidden(renderLife(ctx, { page: 'ious', filter: iou.type }));
  assertHidden(renderLife(ctx, { page: 'iou-detail', id: iou.id }));
  assertHidden(renderLife(ctx, { page: 'settings' }));
  ctx.state.settings.hideBalance = false;
  assert.ok(visibleText(renderLife(ctx, { page: 'iou-detail', id: iou.id })).includes(cash(iou.amount - iou.paid)));
  assert.ok(visibleText(renderLife(ctx, { page: 'settings' })).includes(cash(ctx.state.buffer)));
});

test('Hiding personal balances preserves editable amounts and separately shared group money', () => {
  const ctx = context();
  ctx.draft.iouCreate = { type: 'owedToMe', name: 'Kofi', amount: 3750, amountText: '37.50', due: checkIn(), note: '', step: 2 };
  const html = renderLife(ctx, { page: 'iou-create', step: 2 });
  assert.match(html, /name="iouAmount" value="37\.50"/);
  const group = ctx.state.groups[0], groupHTML = renderLife(ctx, { page: 'groups' });
  assert.ok(visibleText(groupHTML).includes(cash(group.balance)), 'Personal privacy must not mask the group’s shared collection total.');
});
