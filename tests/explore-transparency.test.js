import test from 'node:test';
import assert from 'node:assert/strict';
import { calculateExploreAnswer, EXPLORE_SAMPLE } from '../dist/js/explore-model.js';
import { renderExploreScene, renderExploreEnd } from '../dist/js/explore-view.js';
import { renderWelcome } from '../dist/js/welcome-view.js';
import { renderSavingsHackTerms } from '../dist/js/savings-hack-disclosure.js';

const text = html => html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();

test('Lux explains the Friday example with a fixed snapshot and all three deductions', () => {
  const html = renderExploreScene(3), copy = text(html);
  assert.match(copy, /Based on your plan, you have GH₵250 left until Friday/);
  assert.match(copy, /Available money GH₵1,000/);
  assert.match(copy, /Planned obligations − GH₵650/);
  assert.match(copy, /Breathing room − GH₵100/);
  assert.match(copy, /Left until Friday GH₵250/);
  assert.match(copy, /Fixed example snapshot\. Friday is the end of this example plan/);
  assert.match(copy, /not connected to a live balance/);
  assert.doesNotMatch(copy, /updated just now|synced just now|checked just now/i);
});

test('the only editable tour information is a labelled three-figure example calculator', () => {
  const html = renderExploreScene(3), copy = text(html);
  assert.match(copy, /Try different example figures/);
  assert.match(copy, /calculator changes this example answer only/);
  assert.match(copy, /Review plan lets you correct your plan and breathing room/);
  const inputs = [...html.matchAll(/<input\b[^>]*>/g)].map(match => match[0]);
  assert.equal(inputs.length, 3);
  assert.deepEqual(inputs.map(input => input.match(/name="([^"]+)"/)[1]), ['available', 'planned', 'cushion']);
  for (const input of inputs) {
    assert.match(input, /type="number"/);
    assert.match(input, /step="0\.01"/);
    assert.match(input, /min="0"/);
  }
  assert.doesNotMatch(html, /<textarea\b|contenteditable|type="(?:tel|email|password|text)"|data-action="(?:pay-|demo|p:)/);
});

test('the simplified Pause example highlights only its truthful cushion consequence', () => {
  const html = renderExploreScene(2), copy = text(html);
  assert.match(copy, /This payment uses GH₵50 of your breathing room until Friday/);
  assert.match(copy, /Sample payment · GH₵300/);
  assert.doesNotMatch(copy, /short for food|Food and transport.*short|GH₵700|GH₵650|GH₵100/);
  assert.match(copy, /Continue to PIN/);
  assert.match(copy, /Edit amount/);
  assert.doesNotMatch(html, /<button\b|data-action="pay-/);
  assert.equal(EXPLORE_SAMPLE.afterPayment, EXPLORE_SAMPLE.available - EXPLORE_SAMPLE.payment);
  assert.equal(EXPLORE_SAMPLE.remainingCushion, EXPLORE_SAMPLE.afterPayment - EXPLORE_SAMPLE.planned);
  assert.equal(EXPLORE_SAMPLE.shortfall, EXPLORE_SAMPLE.cushion - EXPLORE_SAMPLE.remainingCushion);
});

test('partner access explains support verification and an unconfirmed toll-free line without sending a request', () => {
  const html = renderExploreScene(5), copy = text(html);
  assert.match(copy, /Your money stays yours\. Your partner cannot spend it/);
  assert.match(copy, /request a partner change or removal/);
  assert.match(copy, /fresh approval and your own PIN/);
  assert.match(copy, /planned toll-free line/);
  assert.match(copy, /Support must verify it is you, review the request and record a decision/);
  assert.match(copy, /Calling does not automatically release money or remove protection/);
  assert.match(copy, /Toll-free number to be confirmed/);
  assert.match(copy, /No call or support request is sent from this tour/);
  assert.match(copy, /recovery procedure must be confirmed with GCB Bank before launch/);
  assert.doesNotMatch(html, /href="tel:|type="tel"|<form\b|data-action="(?:pay-|p:|support)/);
});

test('Money Box info preserves the shared Savings Hack rules, fees and reversal explanation', () => {
  const html = renderExploreScene(4), copy = text(html);
  assert.ok(html.includes(renderSavingsHackTerms()), 'tour rules reuse the same current terms as the actual Money Box');
  assert.match(copy, /Savings Hack rules before activation/);
  assert.match(copy, /payment and its fee/);
  assert.match(copy, /Expected allowance, money owed to you and Money Boxes do not count/);
  assert.match(copy, /Pending and failed payments do not trigger them/);
  assert.match(copy, /skipped, with no catch-up charge later/);
  assert.match(copy, /Edit, Pause or Cancel/);
  assert.match(copy, /Reversing a payment does not undo a Savings Hack already saved/);
  assert.match(copy, /goal lock or partner approval still applies/);
  assert.match(copy, /prototype applies no fee to the internal Savings Hack move\. Payment fees are separate/);
  assert.match(copy, /Live charges, if any, must be confirmed and shown before activation/);
});

test('the welcome and tour completion identify the banking provider without adding a signup gate', () => {
  const welcome = renderWelcome(), finish = renderExploreEnd();
  assert.match(text(welcome), /Powered by GCB Bank/);
  assert.match(welcome, /aria-label="Banking services powered by GCB Bank"/);
  assert.match(text(finish), /Banking powered by GCB Bank/);
  assert.equal((welcome.match(/data-action="start"/g) || []).length, 1);
  assert.equal((finish.match(/data-action="start"/g) || []).length, 1);
  assert.doesNotMatch(welcome + finish, /href="tel:|<form\b/);
});

test('example edits use exact pesewas and explain a gap rather than showing negative spending room', () => {
  assert.deepEqual(calculateExploreAnswer({ available: 100000, planned: 65000, cushion: 10000 }), {
    ok: true, available: 100000, planned: 65000, cushion: 10000, left: 25000, gap: 0,
  });
  assert.deepEqual(calculateExploreAnswer({ available: 70000, planned: 65000, cushion: 10000 }), {
    ok: true, available: 70000, planned: 65000, cushion: 10000, left: 0, gap: 5000,
  });
  assert.deepEqual(calculateExploreAnswer({ available: 255, planned: 200, cushion: 50 }), {
    ok: true, available: 255, planned: 200, cushion: 50, left: 5, gap: 0,
  });
});

test('invalid example figures are rejected without changing input, stored samples or account data', () => {
  const before = structuredClone(EXPLORE_SAMPLE);
  for (const value of [-1, 1.5, NaN, Infinity, '10000', undefined, null, 100000001]) {
    for (const name of ['available', 'planned', 'cushion']) {
      const input = Object.freeze({ available: 100000, planned: 65000, cushion: 10000, [name]: value });
      const result = calculateExploreAnswer(input);
      assert.equal(result.ok, false, `${name}=${String(value)} is rejected`);
      assert.equal(result.left, undefined);
      assert.equal(input[name], value);
    }
  }
  const input = Object.freeze({ available: 0, planned: 0, cushion: 0 });
  assert.deepEqual(calculateExploreAnswer(input), { ok: true, available: 0, planned: 0, cushion: 0, left: 0, gap: 0 });
  assert.deepEqual(EXPLORE_SAMPLE, before);
  assert.ok(Object.isFrozen(EXPLORE_SAMPLE));
});
