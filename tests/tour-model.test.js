import test from 'node:test';
import assert from 'node:assert/strict';
import {
  TOUR_SCHEMA, TOUR_STORAGE_KEY, TOUR_SAMPLE, createTourDraft, normalizeTourDraft, safeTourStep,
  updateTourDemo, loadTourRecord, saveTourRecord, shouldOfferTour,
} from '../dist/js/tour-model.js';

const timestamp = '2026-11-01T12:00:00.000Z';
const record = status => ({ schema: TOUR_SCHEMA, status, timestamp });
function memoryStore(initial = null) {
  const entries = new Map(initial === null ? [] : [[TOUR_STORAGE_KEY, initial]]);
  return { getItem: key => entries.get(key) ?? null, setItem: (key, value) => entries.set(key, value), entries };
}

test('tour begins without touching an account, and presentation steps do not require demonstrations', () => {
  const account = { wallet: 128000, budget: { items: [{ name: 'Food', amount: 10000 }] }, transactions: [] };
  const before = structuredClone(account), d = createTourDraft();
  assert.deepEqual(d, { schema: TOUR_SCHEMA, step: 0, replay: false, returnTo: null, essentialsShown: false, paymentTried: false, smallerPayment: false, saved: false, luxReplied: false });
  for (const step of [0, 1, 2]) assert.equal(safeTourStep(step), step);
  updateTourDemo(d, 'essentials'); updateTourDemo(d, 'payment'); updateTourDemo(d, 'smaller-payment'); updateTourDemo(d, 'save'); updateTourDemo(d, 'lux-reply');
  assert.deepEqual(account, before);
  assert.deepEqual(Object.keys(d).sort(), ['schema', 'step', 'replay', 'returnTo', 'essentialsShown', 'paymentTried', 'smallerPayment', 'saved', 'luxReplied'].sort());
});

test('the shared examples reconcile clarity, the five-percent hack and its goal without account data', () => {
  for (const value of Object.values(TOUR_SAMPLE)) assert.ok(Number.isSafeInteger(value) && value >= 0);
  assert.equal(TOUR_SAMPLE.leftAfterPlan, TOUR_SAMPLE.available - TOUR_SAMPLE.planned - TOUR_SAMPLE.cushion);
  assert.equal(TOUR_SAMPLE.leftAfterPlan, 25000);
  assert.equal(TOUR_SAMPLE.hackPayment, 2000);
  assert.equal(TOUR_SAMPLE.hackPercent, 5);
  assert.equal(TOUR_SAMPLE.hackSaved, TOUR_SAMPLE.hackPayment * TOUR_SAMPLE.hackPercent / 100);
  assert.equal(TOUR_SAMPLE.hackSaved, 100);
  assert.equal(TOUR_SAMPLE.goalAfter, TOUR_SAMPLE.goalSaved + TOUR_SAMPLE.hackSaved);
  assert.equal(TOUR_SAMPLE.goalAfter, 25100);
  assert.ok(TOUR_SAMPLE.goalAfter < TOUR_SAMPLE.goalTarget);
});

test('demonstration actions are idempotent and smaller payment requires the sample payment first', () => {
  const d = createTourDraft(), untouched = JSON.stringify(d);
  assert.equal(updateTourDemo(d, 'smaller-payment'), false); assert.equal(JSON.stringify(d), untouched);
  for (const action of ['essentials', 'payment', 'smaller-payment', 'save', 'lux-reply']) {
    assert.equal(updateTourDemo(d, action), true);
    const once = JSON.stringify(d);
    assert.equal(updateTourDemo(d, action), true); assert.equal(JSON.stringify(d), once);
  }
  const done = JSON.stringify(d);
  for (const action of ['fund', 'payment-withdraw', '__proto__', 'constructor', undefined, null]) {
    assert.equal(updateTourDemo(d, action), false); assert.equal(JSON.stringify(d), done);
  }
  assert.equal(updateTourDemo(null, 'save'), false);
  assert.equal(updateTourDemo({ schema: 99 }, 'save'), false);
});

test('normalizing a saved tour strips account and identity data and never shares a return route', () => {
  const input = { schema: TOUR_SCHEMA, step: '2', replay: true, returnTo: { section: 'life', page: 'help', private: 'secret' }, essentialsShown: true, paymentTried: true, smallerPayment: true, saved: true, luxReplied: true, wallet: 80000, ghanaCardNumber: 'PRIVATE-ID' };
  const before = JSON.stringify(input), d = normalizeTourDraft(input);
  assert.equal(d.step, 2); assert.equal(d.saved, true); assert.equal(d.smallerPayment, true); assert.equal(d.luxReplied, true);
  assert.deepEqual(d.returnTo, { section: 'life', page: 'help' });
  assert.equal('wallet' in d, false); assert.equal('ghanaCardNumber' in d, false);
  d.returnTo.page = 'settings'; assert.equal(JSON.stringify(input), before);
});

test('malformed and stale tour drafts cannot restore old demonstrations or unsafe destinations', () => {
  const d = normalizeTourDraft({ schema: 0, step: 2, replay: true, returnTo: { section: 'pay', page: 'review' }, saved: true, paymentTried: true, luxReplied: true });
  assert.equal(d.step, 0); assert.equal(d.saved, false); assert.equal(d.paymentTried, false); assert.equal(d.luxReplied, false);
  assert.deepEqual(d.returnTo, { section: 'life', page: 'settings' });
  for (const input of [null, undefined, [], '2', 12]) assert.deepEqual(normalizeTourDraft(input), createTourDraft());
  assert.equal(normalizeTourDraft({ schema: TOUR_SCHEMA, smallerPayment: true, paymentTried: false }).smallerPayment, false);
  assert.equal(normalizeTourDraft({ schema: TOUR_SCHEMA, essentialsShown: 'true', saved: 1 }).essentialsShown, false);
  for (const value of ['true', 1, [], {}]) assert.equal(normalizeTourDraft({ schema: TOUR_SCHEMA, luxReplied: value }).luxReplied, false);
});

test('existing schema-one drafts retain their old demonstration progress with an unanswered Lux example', () => {
  const original = { schema: 1, step: 2, replay: false, essentialsShown: true, paymentTried: true, smallerPayment: true, saved: true };
  const before = JSON.stringify(original), restored = normalizeTourDraft(original);
  assert.equal(TOUR_SCHEMA, 1);
  assert.deepEqual([restored.essentialsShown, restored.paymentTried, restored.smallerPayment, restored.saved], [true, true, true, true]);
  assert.equal(restored.luxReplied, false);
  assert.equal(restored.step, 2);
  assert.equal(JSON.stringify(original), before);
});

test('tour step inputs clamp to the three scenes while malformed values fall back to the first', () => {
  for (const [value, expected] of [[0,0], ['1',1], [2,2], [50,2], [-2,0], [1.9,1], [{step:2},2]]) assert.equal(safeTourStep(value), expected);
  for (const value of [undefined, null, true, false, '', ' ', NaN, Infinity, {}, [], 'pause', {step:'invalid'}]) assert.equal(safeTourStep(value), 0);
});

test('replay returns only to Settings, Help or Home with no transient form metadata', () => {
  assert.deepEqual(createTourDraft({ replay: true }).returnTo, { section: 'life', page: 'settings' });
  for (const returnTo of [{section:'pay',page:'amount'}, {section:'onboarding',step:'pin'}, {section:'activation',step:'ready'}, {section:'life',page:'group-create'}, null]) assert.deepEqual(createTourDraft({ replay: true, returnTo }).returnTo, { section:'life',page:'settings' });
  for (const returnTo of [{section:'life',page:'settings'}, {section:'life',page:'help'}, {section:'home',page:'home'}]) assert.deepEqual(createTourDraft({ replay:true,returnTo }).returnTo, returnTo);
});

test('completed and skipped tours are remembered independently of account state', () => {
  for (const status of ['completed', 'skipped']) {
    const storage = memoryStore();
    assert.equal(saveTourRecord(status, storage), true);
    const loaded = loadTourRecord(storage);
    assert.equal(loaded.schema, TOUR_SCHEMA); assert.equal(loaded.status, status);
    assert.equal(new Date(loaded.timestamp).toISOString(), loaded.timestamp);
    assert.equal(shouldOfferTour({ record: loaded }), false);
    assert.deepEqual([...storage.entries.keys()], [TOUR_STORAGE_KEY]);
    assert.deepEqual(Object.keys(loaded).sort(), ['schema','status','timestamp']);
  }
});

test('malformed completion records do not hide the introduction', () => {
  const values = ['broken JSON', JSON.stringify(null), JSON.stringify([]), JSON.stringify({ ...record('completed'), schema: 0 }), JSON.stringify(record('dismissed')), JSON.stringify({ ...record('completed'), timestamp: 'yesterday' }), JSON.stringify({ ...record('completed'), timestamp: '2026-11-01' })];
  for (const value of values) {
    assert.equal(loadTourRecord(memoryStore(value)), null);
    assert.equal(shouldOfferTour({ record: JSON.parse(value === 'broken JSON' ? 'null' : value) }), true);
  }
  const clean = loadTourRecord(memoryStore(JSON.stringify({ ...record('completed'), ghanaCardNumber: 'PRIVATE-ID', wallet: 100 })));
  assert.deepEqual(clean, record('completed'));
});

test('blocked or unavailable browser storage never interrupts tour completion', () => {
  const throwing = { getItem() { throw Error('blocked'); }, setItem() { throw Error('quota'); } };
  assert.equal(loadTourRecord(throwing), null); assert.equal(saveTourRecord('completed', throwing), false);
  assert.equal(loadTourRecord({}), null); assert.equal(saveTourRecord('skipped', {}), false);
  const storage = memoryStore();
  for (const status of ['other', '', undefined, null, '__proto__']) assert.equal(saveTourRecord(status, storage), false);
  assert.equal(storage.entries.size, 0);
});

test('resuming signup or activation bypasses the tour while a new signup can see it', () => {
  assert.equal(shouldOfferTour(), true);
  assert.equal(shouldOfferTour({ onboarding: { completedSteps: [] } }), true);
  assert.equal(shouldOfferTour({ onboarding: { completedSteps: ['name'] } }), false);
  assert.equal(shouldOfferTour({ onboarding: { completedSteps: [], completed: true } }), false);
  assert.equal(shouldOfferTour({ activation: { step: 'fund' } }), false);
  assert.equal(shouldOfferTour({ record: record('skipped'), onboarding: { completedSteps: [] } }), false);
});
