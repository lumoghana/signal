import test from 'node:test';
import assert from 'node:assert/strict';
import { createTourDraft } from '../dist/js/tour-model.js';
import { renderTour, bindTour } from '../dist/js/tour.js';

function node() {
  const classes = new Set(), attributes = new Map();
  return { textContent: '', disabled: false, style: {}, dataset: {},
    classList: { add: (...values) => values.forEach(value => classes.add(value)), remove: (...values) => values.forEach(value => classes.delete(value)), contains: value => classes.has(value) },
    setAttribute: (key, value) => attributes.set(key, value), getAttribute: key => attributes.get(key) ?? null, removeAttribute: key => attributes.delete(key),
  };
}

function harness({ replay = false, step = 0, draftStep = step, bind = true, nativeBack = true, dom = false } = {}) {
  const d = createTourDraft({ replay }); d.step = draftStep;
  const handlers = {}, routes = [], finishes = [], nodes = new Map();
  let refreshes = 0, saves = 0, backs = 0, cleanup = () => {};
  const root = { isConnected: true, addEventListener: (name, cb) => handlers[name] = cb, removeEventListener: (name, cb) => { if (handlers[name] === cb) delete handlers[name]; } };
  if (dom) {
    for (const selector of ['[data-savings-stage]', '[data-tour-demo="save"]', '[data-saved-total]', '[role="progressbar"]', '.lm-track-fill', '[data-savings-live]', '[data-payment-status]', '[data-savings-result]', '[data-lux-stage]', '[data-tour-demo="lux-reply"]', '[data-lux-live]']) nodes.set(selector, node());
    nodes.get('[data-saved-total]').textContent = 'GH₵250';
    nodes.get('[data-tour-demo="save"]').dataset.tourDemo = 'save';
    nodes.get('[data-tour-demo="lux-reply"]').dataset.tourDemo = 'lux-reply';
    root.querySelector = selector => nodes.get(selector) || null;
  }
  const ctx = { draft: { tour: d }, $: () => root, go: route => routes.push(route), finishTour: result => finishes.push(result), saveDraft: () => saves++, refresh: () => refreshes++, setCapture() {}, get state() { throw new Error('The tour cannot access account state.'); }, act() { throw new Error('The tour cannot execute financial actions.'); } };
  if (nativeBack) ctx.back = () => backs++;
  const attach = () => { cleanup(); cleanup = bindTour(ctx, { section: 'tour', step }); };
  if (bind) attach();
  return { d, ctx, root, nodes, routes, finishes, attach, cleanup: () => cleanup(), get backs() { return backs; }, get refreshes() { return refreshes; }, get saves() { return saves; }, click(dataset, disabled = false) { const button = nodes.get(`[data-tour-demo="${dataset.tourDemo}"]`) || { dataset, disabled }; handlers.click?.({ target: { closest: () => button } }); return button; }, render: () => renderTour(ctx, { step }) };
}

function fakeClock(t, { reduced = false } = {}) {
  let now = 0, sequence = 0;
  const pending = new Map(), previous = Object.getOwnPropertyDescriptor(globalThis, 'matchMedia');
  Object.defineProperty(globalThis, 'matchMedia', { configurable: true, value: () => ({ matches: reduced }) });
  t.after(() => { if (previous) Object.defineProperty(globalThis, 'matchMedia', previous); else delete globalThis.matchMedia; });
  t.mock.method(globalThis, 'setTimeout', (callback, delay) => { const handle = ++sequence; pending.set(handle, { callback, at: now + delay }); return handle; });
  t.mock.method(globalThis, 'clearTimeout', handle => pending.delete(handle));
  return { pending, advance(ms) {
    const target = now + ms;
    for (;;) {
      const next = [...pending].filter(([, timer]) => timer.at <= target).sort((a, b) => a[1].at - b[1].at)[0];
      if (!next) break;
      now = next[1].at; pending.delete(next[0]); next[1].callback();
    }
    now = target;
  } };
}

test('all three benefits expose Skip, Back and a way onward before any sample interaction', () => {
  for (let step = 0; step < 3; step++) {
    const h = harness({ step, bind: false }), html = h.render();
    assert.match(html, /Interactive prototype · No real money\./);
    if (step > 0) assert.match(html, /EXAMPLE MONEY|EXAMPLE CHAT/i);
    assert.match(html, /data-tour-action="skip"/);
    assert.match(html, /data-tour-action="back"/);
    assert.match(html, /aria-label="Tour scenes"/);
    assert.match(html, new RegExp(`data-tour-action="${step === 2 ? 'finish' : 'next'}"`));
    h.attach();
    if (step < 2) {
      h.click({ tourAction: 'next' });
      assert.deepEqual(h.routes.at(-1), { section: 'tour', step: step + 1 });
      assert.equal(h.d.paymentTried, false);
    } else {
      h.click({ tourAction: 'finish' });
      assert.deepEqual(h.finishes, [{ skipped: false }]);
    }
    h.cleanup();
  }
});

test('the first benefit introduces Pause without becoming the real payment approval screen', () => {
  const h = harness({ step: 0, bind: false }), html = h.render();
  assert.match(html, /lux-pause-worried\.png/);
  assert.match(html, /pause/i);
  assert.doesNotMatch(html, /class="pause-screen|data-action="pay-|data-tour-demo="smaller-payment"/);
  assert.equal(h.d.paymentTried, false);
  assert.equal(h.d.smallerPayment, false);
});

test('the Savings Hack example moves its sample goal by one cedi exactly once', () => {
  const h = harness({ step: 1, bind: false });
  assert.match(h.render(), /GH₵250/);
  assert.doesNotMatch(h.render(), /GH₵251/);
  h.attach(); h.click({ tourDemo: 'save' });
  assert.equal(h.d.saved, true);
  assert.match(h.render(), /GH₵251/);
  const once = h.render();
  h.click({ tourDemo: 'save' });
  assert.equal(h.render(), once);
  assert.equal(h.routes.length, 0);
  assert.equal(h.finishes.length, 0);
  h.cleanup();
});

test('Ask Lux answers only its labelled fictional money example and keeps the response on return', () => {
  const h = harness({ step: 2, bind: false });
  assert.match(h.render(), /EXAMPLE CHAT/i);
  assert.match(h.render(), /lux-chat-2d\.webp/);
  assert.match(h.render(), /your spending|Your money/i);
  h.attach(); h.click({ tourDemo: 'lux-reply' });
  assert.equal(h.d.luxReplied, true);
  const answer = h.render();
  assert.match(answer, /GH₵250/);
  assert.match(answer, /plan and cushion/);
  assert.doesNotMatch(answer, /data-chat-send|data-action="pay-/);
  h.click({ tourDemo: 'lux-reply' });
  assert.equal(h.render(), answer);
  h.cleanup(); h.attach();
  assert.equal(h.d.luxReplied, true);
  assert.equal(h.render(), answer);
  h.cleanup();
});

test('replaying returns to Lumo and duplicate completion events cannot run twice', () => {
  const h = harness({ replay: true, step: 2 });
  assert.match(h.render(), /Back to Lumo/);
  assert.doesNotMatch(h.render(), /Make it mine/);
  h.click({ tourAction: 'skip' }); h.click({ tourAction: 'finish' });
  assert.deepEqual(h.finishes, [{ skipped: true }]);
  h.cleanup();
});

test('first-scene Back uses native navigation without finishing or clamping to the same scene', () => {
  for (const replay of [false, true]) {
    const h = harness({ replay, step: 0 }), before = JSON.stringify(h.d);
    h.click({ tourAction: 'back' });
    assert.equal(h.backs, 1);
    assert.equal(h.routes.length, 0);
    assert.equal(h.finishes.length, 0);
    assert.equal(JSON.stringify(h.d), before);
    h.cleanup();
  }
});

test('first-scene Back has an explicit welcome or replay destination without native navigation', () => {
  for (const replay of [false, true]) {
    const h = harness({ replay, step: 0, nativeBack: false });
    h.click({ tourAction: 'back' });
    assert.deepEqual(h.routes.at(-1), replay ? { section: 'life', page: 'settings' } : { section: 'welcome' });
    assert.equal(h.finishes.length, 0);
    h.cleanup();
  }
});

test('Back and scene controls preserve examples while detached or replaced tour views cannot act', () => {
  const h = harness({ step: 2 });
  h.click({ tourDemo: 'lux-reply' });
  h.click({ tourAction: 'back' }); assert.equal(h.routes.at(-1).step, 1);
  h.click({ tourStep: '0' }); assert.equal(h.routes.at(-1).step, 0);
  assert.equal(h.d.luxReplied, true);
  const routeCount = h.routes.length;
  h.root.isConnected = false; h.click({ tourAction: 'next' });
  assert.equal(h.routes.length, routeCount);
  h.root.isConnected = true; h.ctx.draft.tour = createTourDraft();
  h.click({ tourAction: 'skip' });
  assert.equal(h.finishes.length, 0);
  h.cleanup(); h.click({ tourAction: 'finish' });
  assert.equal(h.finishes.length, 0);
});

test('binding a native Back or Forward destination checkpoints its visible scene for reload', () => {
  for (const [draftStep, step] of [[2, 0], [0, 1], [1, 2]]) {
    const h = harness({ draftStep, step });
    assert.equal(h.d.step, step);
    assert.ok(h.saves > 0);
    h.cleanup();
  }
});

test('the animated hack waits for its sample payment and replays without accumulating money', t => {
  const clock = fakeClock(t), h = harness({ step: 1, dom: true });
  const amount = h.nodes.get('[data-saved-total]'), play = h.nodes.get('[data-tour-demo="save"]'), stage = h.nodes.get('[data-savings-stage]');
  assert.equal(h.d.saved, false); assert.equal(amount.textContent, 'GH₵250');
  assert.equal(play.disabled, true); assert.equal(play.getAttribute('aria-busy'), 'true');
  clock.advance(700);
  assert.equal(h.nodes.get('[data-payment-status]').textContent, 'Paid ✓');
  assert.equal(h.d.saved, false); assert.equal(amount.textContent, 'GH₵250');
  clock.advance(400);
  assert.equal(stage.classList.contains('lm-saving-in-flight'), true);
  clock.advance(1000);
  assert.equal(h.d.saved, true); assert.equal(amount.textContent, 'GH₵251');
  assert.equal(h.nodes.get('[role="progressbar"]').getAttribute('aria-valuenow'), '251');
  assert.match(h.nodes.get('[data-savings-live]').textContent, /5%.*GH₵1.*Everyday.*GH₵20/);
  assert.equal(play.disabled, false); assert.equal(play.getAttribute('aria-busy'), null);
  assert.equal(clock.pending.size, 0);
  h.click({ tourDemo: 'save' });
  const replayTimers = clock.pending.size;
  h.click({ tourDemo: 'save' });
  assert.equal(clock.pending.size, replayTimers, 'repeat taps cannot start another concurrent transfer');
  clock.advance(2100);
  assert.equal(amount.textContent, 'GH₵251');
  assert.equal(h.nodes.get('[role="progressbar"]').getAttribute('aria-valuenow'), '251');
  assert.equal(h.refreshes, 0, 'the real DOM animation updates locally rather than replacing the whole view');
  h.cleanup();
});

test('Lux types once, reveals the verified sample answer and does not restart after return', t => {
  const clock = fakeClock(t), h = harness({ step: 2, dom: true });
  const stage = h.nodes.get('[data-lux-stage]'), play = h.nodes.get('[data-tour-demo="lux-reply"]');
  assert.equal(stage.classList.contains('lm-chat-thinking'), true);
  assert.equal(play.disabled, true); assert.equal(h.d.luxReplied, false);
  clock.advance(1899);
  assert.equal(h.d.luxReplied, false);
  clock.advance(1);
  assert.equal(h.d.luxReplied, true);
  assert.equal(stage.classList.contains('lm-chat-thinking'), false);
  assert.equal(stage.classList.contains('lm-chat-arrived'), true);
  assert.match(h.nodes.get('[data-lux-live]').textContent, /GH₵250.*plan and cushion/);
  assert.equal(play.disabled, false); assert.equal(clock.pending.size, 0);
  h.cleanup(); h.attach();
  assert.equal(clock.pending.size, 0, 'an answered sample should stay readable on return');
  assert.equal(stage.classList.contains('lm-chat-thinking'), false);
  h.cleanup();
});

test('navigation and cleanup cancel animations before they can update an abandoned tour', t => {
  const clock = fakeClock(t);
  for (const [step, action] of [[1, 'next'], [1, 'back'], [1, 'skip'], [2, 'back'], [2, 'skip'], [2, 'finish'], [1, 'cleanup'], [2, 'cleanup']]) {
    const h = harness({ step, dom: true });
    assert.ok(clock.pending.size > 0);
    if (action === 'cleanup') h.cleanup(); else h.click({ tourAction: action });
    assert.equal(clock.pending.size, 0, `scene ${step} ${action} cancels outstanding work`);
    clock.advance(5000);
    assert.equal(h.d.saved, false); assert.equal(h.d.luxReplied, false);
    h.cleanup();
  }
});

test('a detached root or replaced tour draft cannot receive a delayed sample completion', t => {
  const clock = fakeClock(t);
  for (const [step, change] of [[1, 'detach'], [2, 'detach'], [1, 'replace'], [2, 'replace']]) {
    const h = harness({ step, dom: true });
    if (change === 'detach') h.root.isConnected = false;
    else h.ctx.draft.tour = createTourDraft();
    clock.advance(5000);
    assert.equal(clock.pending.size, 0);
    assert.equal(h.d.saved, false); assert.equal(h.d.luxReplied, false);
    h.cleanup();
  }
});

test('reduced motion shows both useful outcomes immediately without pending visual work', t => {
  const clock = fakeClock(t, { reduced: true });
  const saving = harness({ step: 1, dom: true });
  assert.equal(saving.d.saved, true);
  assert.equal(saving.nodes.get('[data-saved-total]').textContent, 'GH₵251');
  assert.equal(saving.nodes.get('[data-tour-demo="save"]').disabled, false);
  assert.equal(clock.pending.size, 0);
  const lux = harness({ step: 2, dom: true });
  assert.equal(lux.d.luxReplied, true);
  assert.equal(lux.nodes.get('[data-lux-stage]').classList.contains('lm-chat-thinking'), false);
  assert.match(lux.nodes.get('[data-lux-live]').textContent, /GH₵250.*plan and cushion/);
  assert.equal(lux.nodes.get('[data-tour-demo="lux-reply"]').disabled, false);
  assert.equal(clock.pending.size, 0);
  saving.cleanup(); lux.cleanup();
});
