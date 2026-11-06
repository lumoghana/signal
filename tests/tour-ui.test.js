import test from 'node:test';
import assert from 'node:assert/strict';
import { createTourDraft } from '../dist/js/tour-model.js';
import { renderTour, bindTour } from '../dist/js/tour.js';

function harness({ replay = false, step = 0, draftStep = step } = {}) {
  const d = createTourDraft({ replay }); d.step = draftStep;
  const handlers = {}, routes = [], finishes = [];
  let refreshes = 0, saves = 0;
  const root = { isConnected: true, addEventListener: (name, cb) => handlers[name] = cb, removeEventListener: (name, cb) => { if (handlers[name] === cb) delete handlers[name]; } };
  const ctx = { draft: { tour: d }, $: () => root, go: route => routes.push(route), finishTour: result => finishes.push(result), saveDraft: () => saves++, refresh: () => refreshes++, setCapture() {}, get state() { throw new Error('The tour cannot access account state.'); }, act() { throw new Error('The tour cannot execute financial actions.'); } };
  const cleanup = bindTour(ctx, { section: 'tour', step });
  return { d, ctx, routes, finishes, cleanup, get refreshes() { return refreshes; }, get saves() { return saves; }, click(dataset, disabled = false) { const button = { dataset, disabled }; handlers.click?.({ target: { closest: () => button } }); return button; }, render: () => renderTour(ctx, { step }) };
}

test('every scene is labelled sample money, can be skipped and can advance without a demonstration', () => {
  for (let step = 0; step < 3; step++) {
    const h = harness({ step });
    const html = h.render();
    assert.match(html, /SAMPLE MONEY/i);
    assert.match(html, /data-tour-action="skip"/);
    if (step !== 1) assert.match(html, /aria-label="Tour scenes"/);
    else assert.match(html, /pause-screen/);
    assert.match(html, new RegExp(`data-tour-action="${step === 2 ? 'finish' : 'next'}"`));
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

test('sample interactions change presentation flags without accessing money or signup state', () => {
  const h = harness();
  h.click({ tourDemo: 'essentials' });
  assert.match(h.render(), /Left after plan/);
  assert.match(h.render(), /GH₵350/);
  h.click({ tourDemo: 'payment' }); h.click({ tourDemo: 'smaller-payment' }); h.click({ tourDemo: 'save' });
  assert.deepEqual([h.d.essentialsShown, h.d.paymentTried, h.d.smallerPayment, h.d.saved], [true, true, true, true]);
  assert.equal(h.refreshes, 4);
  assert.equal(h.routes.length, 0);
  assert.equal(h.finishes.length, 0);
  h.cleanup();
});

test('the tour uses the full-page Pause immediately and a smaller example stays optional', () => {
  const h = harness({ step: 1 });
  const initial = h.render();
  assert.match(initial, /pause-screen/);
  assert.match(initial, /lux-pause-2d.webp/);
  assert.match(initial, /This payment would use/);
  assert.match(initial, /GH₵150/);
  assert.doesNotMatch(initial, /class="tour-main"|class="tour-stage"|class="tour-demo/);
  assert.doesNotMatch(initial, /Try a GH₵500 payment/);
  h.click({ tourDemo: 'smaller-payment' });
  assert.deepEqual([h.d.paymentTried, h.d.smallerPayment], [true, true]);
  assert.match(h.render(), /You’d have/);
  assert.match(h.render(), /left after your plan/);
  assert.match(h.render(), /GH₵150/);
  assert.doesNotMatch(h.render(), /from your plan or cushion/);
  h.click({ tourAction: 'next' });
  assert.deepEqual(h.routes.at(-1), { section: 'tour', step: 2 });
  h.cleanup();
});

test('replaying uses a return button and duplicate completion events do not run twice', () => {
  const h = harness({ replay: true, step: 2 });
  assert.match(h.render(), /Back to Lumo/);
  assert.doesNotMatch(h.render(), /Make it mine/);
  h.click({ tourAction: 'skip' }); h.click({ tourAction: 'finish' });
  assert.deepEqual(h.finishes, [{ skipped: true }]);
  h.cleanup();
});

test('back and scene navigation preserve examples and detached views cannot act', () => {
  const h = harness({ step: 2 });
  h.click({ tourDemo: 'save' });
  h.click({ tourAction: 'back' }); assert.equal(h.routes.at(-1).step, 1);
  h.click({ tourStep: '0' }); assert.equal(h.routes.at(-1).step, 0);
  assert.equal(h.d.saved, true);
  h.cleanup(); h.click({ tourAction: 'skip' });
  assert.equal(h.finishes.length, 0);
});


test('binding a native Back or Forward destination checkpoints the visible scene for reload', () => {
  for (const [draftStep, step] of [[2, 0], [0, 1], [1, 2]]) {
    const h = harness({ draftStep, step });
    assert.equal(h.d.step, step);
    assert.ok(h.saves > 0);
    h.cleanup();
  }
});
