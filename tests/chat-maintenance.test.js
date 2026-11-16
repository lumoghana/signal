import test from 'node:test';
import assert from 'node:assert/strict';
import { createEmptyState, applyAction } from '../dist/js/model.js';
import { getLuxAnswer, executeLuxPlan, validateLuxPlan, LUX_TASKS } from '../dist/js/lux-brain.js';
import { getConversationalAnswer } from '../dist/js/chat-language.js';
import { getMaintenanceChatAnswer, parseMaintenanceDate } from '../dist/js/chat-maintenance.js';
import { installPreparedChatAction, isFinancialAnswerStale } from '../dist/js/chat-action-model.js';
import { PLAN_SCHEMA, interpretLux } from '../api/lux.mjs';
import { renderChat } from '../dist/js/chat.js';

const now = new Date('2026-11-16T08:00:00Z');
const account = () => {
  const s = createEmptyState({ name: 'Ama' });
  s.wallet = 20000; s.buffer = 1000;
  s.budget = { ...s.budget, created: true, items: [{ id: 'food', name: 'Food', amount: 5000, spent: 1000, due: '2026-11-20' }] };
  s.externalBalances = [{ id: 'cash-1', type: 'cash', name: 'Pocket cash', balance: 10000, revision: 2, updatedAt: '2026-11-15T10:00:00Z' }, { id: 'momo-1', type: 'momo', name: 'MTN MoMo', balance: 15000, revision: 1, updatedAt: '2026-11-15T10:00:00Z' }];
  return s;
};
const ask = (s, q) => getLuxAnswer(s, q, { now });
const draft = answer => answer.actions?.find(x => x.prepare)?.prepare;

test('outside statements produce exact editable review drafts without altering any money', () => {
  const s = account(), before = structuredClone(s);
  for (const [q, action, id, value, direction] of [
    ['I spent 25 cash', 'externalMovement', 'cash-1', 2500, 'out'],
    ['I received GH₵200 on MoMo', 'externalMovement', 'momo-1', 20000, 'in'],
    ['My MoMo balance is now 180', 'confirmExternalBalance', 'momo-1', 18000],
    ['My Pocket cash balance is now 0', 'confirmExternalBalance', 'cash-1', 0],
  ]) {
    const answer = ask(s, q), p = draft(answer);
    assert.equal(p?.kind, 'maintenance', q); assert.equal(p.action, action, q);
    assert.equal(p.payload.id, id); assert.equal(p.payload[direction ? 'amount' : 'balance'], value);
    if (direction) assert.equal(p.payload.direction, direction);
    assert.match(answer.actions[0].label, /Review/);
    assert.deepEqual(s, before);
  }
});

test('ambiguous accounts, amounts, currencies and conditional arrivals never create a maintenance draft', () => {
  const s = account();
  s.externalBalances.push({ id: 'momo-2', type: 'momo', name: 'Telecel wallet', balance: 3000 });
  for (const q of ['I received 200 MoMo', 'My balance is now 180', 'I spent 25 cash and 10 MoMo', 'I spent $25 cash', 'I spent 25 or 30 cash', "I haven't received 200 MoMo", 'Have I received 200 MoMo?', 'I received 200 cash or MoMo', 'I spent 25 cash every day']) {
    const answer = ask(s, q); assert.equal(answer.context.topic, 'clarify', q); assert.equal(draft(answer), undefined, q);
  }
  const named = ask(s, 'I received 200 into Telecel wallet MoMo');
  assert.equal(draft(named).payload.id, 'momo-2');
});

test('promised outside inflows remain expected and cannot update held money', () => {
  const s = account(), before = structuredClone(s);
  for (const q of ['I will receive 200 MoMo tomorrow', 'I am expecting 200 cash next Friday', 'I received 200 MoMo 2026-11-20', 'I received 200 MoMo this Friday']) {
    const answer = ask(s, q); assert.equal(answer.context.topic, 'expected'); assert.equal(draft(answer), undefined);
    assert.match(answer.paragraphs.join(' '), /won’t add it/); assert.deepEqual(s, before);
  }
  assert.equal(ask(s, 'I spent 25 cash next Friday').context.topic, 'clarify');
});

test('a remembered future cost becomes a dated commitment review, including when AI guessed affordability', () => {
  const s = account(), q = 'Can you remember that I need to pay GH₵120 for lab next Friday?', before = structuredClone(s);
  for (const answer of [ask(s, q), executeLuxPlan(s, q, { task: 'afford', amount: 12000 }, { now }), getConversationalAnswer(s, q, { now })]) {
    const p = draft(answer); assert.equal(p.action, 'saveCommitment');
    assert.equal(p.payload.amount, 12000); assert.equal(p.payload.name, 'lab'); assert.equal(p.payload.due, '2026-11-20');
    assert.match(answer.paragraphs.join(' '), /2026-11-20/); assert.match(answer.paragraphs.join(' '), /confirm it in your plan/);
    assert.equal(answer.actions.some(x => x.route?.section === 'pay'), false); assert.deepEqual(s, before);
  }
});

test('missing, conflicting, invalid or past commitment dates clarify instead of inventing a due date', () => {
  const s = account();
  for (const q of ['Remember 120 for lab', 'Remember 120 for lab next week', 'Remember 120 for lab tomorrow or Friday', 'Remember 120 for lab 2026-02-30', 'Remember 120 for lab 2026-11-15', 'Remember 120 for lab Friday or Monday']) {
    const answer = ask(s, q); assert.equal(answer.context.topic, 'clarify', q); assert.equal(draft(answer), undefined, q);
  }
  assert.equal(parseMaintenanceDate('Friday', new Date('2026-11-20T00:01:00Z')).due, '2026-11-20');
  assert.equal(parseMaintenanceDate('next Friday', new Date('2026-11-20T00:01:00Z')).due, '2026-11-27');
  assert.equal(draft(ask(s, 'Remember 120 for lab 2026-11-25')).payload.due, '2026-11-25');
});

test('upcoming and reused plan tasks prepare shared reviews while yes alone remains non-authorising', () => {
  const s = account(), before = structuredClone(s);
  const upcoming = ask(s, 'What’s coming up this week?');
  assert.equal(draft(upcoming).action, 'completeMoneyCheck'); assert.match(upcoming.paragraphs.join(' '), /Food: GH₵40.00/);
  assert.equal(draft(ask(s, 'Reuse my last essentials plan')).action, 'reuseEssentialPlan');
  const yes = getLuxAnswer(s, 'Yes', { now, messages: [{ role: 'assistant', ...ask(s, 'I spent 25 cash') }] });
  assert.equal(draft(yes), undefined); assert.deepEqual(s, before);
});

test('maintenance drafts become stale after another balance update or next day and cannot open a review', () => {
  const s = account(), answer = ask(s, 'I spent 25 cash');
  assert.equal(isFinancialAnswerStale(s, answer, now), false);
  s.externalBalances[0].balance += 100;
  assert.equal(isFinancialAnswerStale(s, answer, now), true);
  let sheets = 0, acts = 0;
  const ctx = { state: s, shared: { user: { id: 'other-account' }, authVersion: 2 }, sheet() { sheets++; }, act() { acts++; }, toast() {} };
  assert.equal(installPreparedChatAction(ctx, answer.actions[0]), false);
  assert.equal(sheets, 0); assert.equal(acts, 0);
  assert.equal(isFinancialAnswerStale(account(), answer, new Date('2026-11-17T08:00:00Z')), true);
});

test('server schema and local parser share maintenance intents, rejecting invented maintenance tasks', async () => {
  for (const task of ['outside_record', 'commitment', 'money_check', 'plan_reuse']) assert.ok(LUX_TASKS.includes(task) && PLAN_SCHEMA.properties.task.enum.includes(task));
  assert.equal(validateLuxPlan({ task: 'commitment' }, 'Can I afford 120 lunch?'), null);
  assert.deepEqual(validateLuxPlan({ task: 'commitment', amount: 999999, subject: 'invented', start: '2099-01-01' }, 'Remember 120 for lab next Friday'), { task: 'commitment' });
  const result = await interpretLux({ question: 'Remember 120 for lab next Friday', context: { questions: [] } }, { credential: 'synthetic-test', fetcher: async (_url, init) => {
    const sent = JSON.parse(init.body); assert.match(sent.messages[0].content, /editable records only/);
    return { ok: true, json: async () => ({ choices: [{ message: { content: JSON.stringify({ task: 'commitment', confidence: .99 }) } }] }) };
  } });
  assert.equal(result.plan.task, 'commitment');
});

function reviewRuntime(state, action) {
  const node = value => ({ value, disabled: false, isConnected: true, textContent: '' });
  const fields = new Map([['[name="outsideId"]', node(action.prepare.payload.id)], ['[name="amount"]', node((action.prepare.payload.amount / 100).toFixed(2))], ['[name="budgetItemId"]', node('')], ['[name="commitmentName"]', node(action.prepare.payload.name || '')], ['[name="due"]', node(action.prepare.payload.due || '')], ['[type="submit"]', node('')]]);
  const form = { querySelector: selector => fields.get(selector), querySelectorAll: () => [...fields.values()], addEventListener() {} };
  const error = node(''), root = { isConnected: true, querySelector: selector => selector === 'form' ? form : selector === '.maintenance-error' ? error : selector === '[data-maintenance-cancel]' ? node('') : node('') };
  const ctx = { state, shared: { user: { id: 'student-a' }, authVersion: 3 }, calls: [], notices: [],
    sheet(html, bind) { this.html = html; bind(root); }, closeSheet() { root.isConnected = false; }, refresh() {}, toast(message) { this.notices.push(message); },
    act(type, payload) { this.calls.push({ type, payload }); return applyAction(state, type, payload); } };
  action.prepare.owner = 'student-a'; action.prepare.authVersion = 3;
  return { ctx, form, root, fields, error };
}

test('a Lux outside draft opens an editable shared review, then saves the edited amount once after confirmation', async () => {
  const s = account(), answer = getLuxAnswer(s, 'I spent 25 cash'), action = answer.actions[0], before = structuredClone(s);
  const env = reviewRuntime(s, action);
  assert.equal(installPreparedChatAction(env.ctx, action), true);
  assert.deepEqual(s, before); assert.equal(env.ctx.calls.length, 0);
  env.fields.get('[name="amount"]').value = '20.00';
  let finish;
  env.ctx.actAsync = (type, payload) => { env.ctx.calls.push({ type, payload }); return new Promise(resolve => { finish = () => resolve(applyAction(s, type, payload)); }); };
  const first = env.form.onsubmit({ preventDefault() {} });
  await env.form.onsubmit({ preventDefault() {} });
  assert.equal(env.ctx.calls.length, 1); assert.equal(env.ctx.calls[0].type, 'externalMovement'); assert.equal(env.ctx.calls[0].payload.amount, 2000);
  finish(); await first;
  assert.equal(s.externalBalances[0].balance, before.externalBalances[0].balance - 2000);
  assert.equal(s.wallet, before.wallet); assert.equal(s.transactions.length, before.transactions.length);
});

test('an account or money change after opening a Lux review prevents confirmation', async () => {
  for (const change of ['actor', 'money']) {
    const s = account(), action = getLuxAnswer(s, 'I spent 25 cash').actions[0], env = reviewRuntime(s, action);
    assert.equal(installPreparedChatAction(env.ctx, action), true);
    if (change === 'actor') env.ctx.shared.user.id = 'student-b'; else s.externalBalances[0].balance += 100;
    await env.form.onsubmit({ preventDefault() {} });
    assert.equal(env.ctx.calls.length, 0); assert.match(env.error.textContent, /changed/);
  }
});

test('an uncertain Lux save checks the immutable original reference after its committed snapshot arrives', async () => {
  const s = account(), action = getLuxAnswer(s, 'I spent 25 cash').actions[0], env = reviewRuntime(s, action), before = s.externalBalances[0].balance;
  installPreparedChatAction(env.ctx, action);
  let first = true;
  env.ctx.actAsync = async (type, payload) => {
    env.ctx.calls.push({ type, payload });
    const result = applyAction(s, type, payload);
    if (first) { first = false; return { ok: false, unknown: true, message: 'Checking original request' }; }
    return result;
  };
  await env.form.onsubmit({ preventDefault() {} });
  assert.equal(s.externalBalances[0].balance, before - 2500);
  assert.equal(env.fields.get('[name="amount"]').disabled, true);
  env.fields.get('[name="amount"]').value = '90';
  await env.form.onsubmit({ preventDefault() {} });
  assert.equal(env.ctx.calls.length, 2);
  assert.deepEqual(env.ctx.calls[0].payload, env.ctx.calls[1].payload);
  assert.equal(s.externalBalances[0].balance, before - 2500);
  assert.equal(s.externalBalanceHistory.length, 1);
});

test('a confirmed edited cost leaves a persistent Lux acknowledgement of the actual saved record', async () => {
  const s = account(), answer = getLuxAnswer(s, 'Remember 120 for lab next Friday'), action = answer.actions[0], env = reviewRuntime(s, action);
  env.ctx.draft = { chat: { messages: [{ id: 'prepared-cost', role: 'assistant', ...answer }] } };
  const due = new Date(Date.now() + 6 * 86400000).toISOString().slice(0, 10);
  let persisted = 0; env.ctx.saveDraft = () => { persisted++; };
  installPreparedChatAction(env.ctx, action);
  assert.equal(env.ctx.draft.chat.messages.length, 1);
  env.fields.get('[name="commitmentName"]').value = 'Lab fees';
  env.fields.get('[name="amount"]').value = '135.00';
  env.fields.get('[name="due"]').value = due;
  await env.form.onsubmit({ preventDefault() {} });
  const saved = env.ctx.draft.chat.messages.at(-1);
  assert.equal(saved.title, 'Saved Lab fees.'); assert.match(saved.paragraphs.join(' '), /GH₵135.00/); assert.match(saved.paragraphs.join(' '), new RegExp(due));
  assert.equal(saved.context.topic, 'approval'); assert.equal(persisted, 1);
  assert.equal(saved.actions[0].route.section, 'plan');
  const stored = JSON.parse(JSON.stringify(env.ctx.draft)), html = renderChat({ state: s, draft: stored });
  assert.match(html, /Saved Lab fees\./); assert.match(html, /GH₵135.00/);
  assert.match(html, /earlier answer needs a recheck/);
});

test('an unconfirmed or rejected cost never gets a saved Lux acknowledgement', async () => {
  const s = account(), answer = getLuxAnswer(s, 'Remember 120 for lab next Friday'), action = answer.actions[0], env = reviewRuntime(s, action);
  env.ctx.draft = { chat: { messages: [{ id: 'prepared-cost', role: 'assistant', ...answer }] } };
  installPreparedChatAction(env.ctx, action);
  assert.equal(env.ctx.draft.chat.messages.length, 1);
  env.ctx.act = () => ({ ok: false, message: 'Review this record again.' });
  await env.form.onsubmit({ preventDefault() {} });
  assert.equal(env.ctx.draft.chat.messages.length, 1);
  assert.equal(env.ctx.draft.chat.messages.some(message => message.title?.startsWith('Saved ')), false);
});
