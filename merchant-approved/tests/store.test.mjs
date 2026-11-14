import test from 'node:test';
import assert from 'node:assert/strict';
import { getState, dispatch, metrics, resetDemo } from '../dist/store.js';

const owner = { role: 'owner' };
const manager = { role: 'manager', shopId: 'night-market', staffId: 'staff-ama' };
const cashier = { role: 'cashier', shopId: 'night-market', staffId: 'staff-kojo' };
const student = { role: 'student' };
const pay = (amount, extra = {}) => dispatch('PAY', { shopId: 'night-market', staffId: 'staff-kojo', payer: 'Test student', amount, method: 'qr', ...extra }, student);

test('closing archives the local collections without moving any merchant money', () => {
  resetDemo();
  const before = metrics();
  const current = metrics('night-market');
  const report = dispatch('CLOSE_DAY', { shopId: 'night-market' }, manager);
  assert.equal(report.net, current.currentNet);
  assert.equal(metrics('night-market').currentNet, 0);
  assert.equal(metrics('night-market').currentCount, 0);
  assert.equal(metrics().balance, before.balance);
  assert.equal(metrics().available, before.available);
  assert.ok(metrics('pentagon').currentNet > 0);
  assert.ok(getState().transactions.some(tx => report.transactionIds.includes(tx.id)));
});

test('pending is never available; a confirmation after close enters the next local period once', () => {
  resetDemo();
  const before = metrics().balance;
  const pending = pay(4321, { status: 'processing' });
  assert.equal(metrics().balance, before);
  dispatch('CLOSE_DAY', { shopId: 'night-market' }, manager);
  dispatch('RESOLVE_PAYMENT', { id: pending.id, status: 'paid' }, manager);
  assert.equal(metrics().balance, before + 4321);
  assert.equal(metrics('night-market').currentGross, 4321);
  dispatch('RESOLVE_PAYMENT', { id: pending.id, status: 'paid' }, manager);
  assert.equal(metrics().balance, before + 4321);
});

test('a payment request and retried payment attempt cannot credit twice', () => {
  resetDemo();
  const request = dispatch('CREATE_REQUEST', { shopId: 'night-market', amount: 2500, description: 'Lunch' }, cashier);
  const before = metrics().balance;
  const first = pay(2500, { requestId: request.id, method: 'request', attemptId: 'test-attempt' });
  const second = pay(2500, { requestId: request.id, method: 'request', attemptId: 'test-attempt' });
  assert.equal(first.id, second.id);
  assert.equal(metrics().balance, before + 2500);
  assert.equal(getState().requests.find(item => item.id === request.id).status, 'paid');
  assert.throws(() => dispatch('CANCEL_REQUEST', { id: request.id }, cashier), /paid request/);
});

test('refunds are capped, reserved for approval and returned against the original payment', () => {
  resetDemo();
  const tx = pay(5000);
  const before = metrics();
  const refund = dispatch('REFUND', { transactionId: tx.id, amount: 3000, reason: 'Item unavailable' }, cashier);
  assert.equal(refund.status, 'requested');
  assert.equal(refund.payer, tx.payer);
  assert.equal(metrics().balance, before.balance);
  assert.equal(metrics().available, before.available - 3000);
  assert.throws(() => dispatch('REFUND', { transactionId: tx.id, amount: 2500, reason: 'Again' }, owner), /exceeds/);
  dispatch('APPROVE_REFUND', { id: refund.id, approve: true }, owner);
  assert.equal(metrics().balance, before.balance - 3000);
  dispatch('APPROVE_REFUND', { id: refund.id, approve: true }, owner);
  assert.equal(metrics().balance, before.balance - 3000);
});

test('settlements reserve funds and failure restores availability without creating a debit', () => {
  resetDemo();
  const before = metrics();
  const payout = dispatch('SETTLE', { amount: before.available - 1000 }, owner);
  assert.equal(metrics().balance, before.balance);
  assert.equal(metrics().available, 1000);
  assert.throws(() => dispatch('SETTLE', { amount: 1001 }, owner), /exceeds/);
  dispatch('RESOLVE_SETTLEMENT', { id: payout.id, status: 'failed' }, owner);
  assert.equal(metrics().available, before.available);
  assert.equal(metrics().balance, before.balance);
  const next = dispatch('SETTLE', { amount: 1200 }, owner);
  dispatch('RESOLVE_SETTLEMENT', { id: next.id, status: 'paid' }, owner);
  assert.equal(metrics().balance, before.balance - 1200);
  dispatch('RESOLVE_SETTLEMENT', { id: next.id, status: 'paid' }, owner);
  assert.equal(metrics().balance, before.balance - 1200);
});

test('site permissions and revoked staff prevent cross-site changes', () => {
  resetDemo();
  assert.throws(() => dispatch('CLOSE_DAY', { shopId: 'pentagon' }, manager), /assigned shop/);
  assert.throws(() => dispatch('CLOSE_DAY', { shopId: 'night-market' }, cashier), /manager/);
  assert.throws(() => dispatch('SETTLE', { amount: 100 }, cashier), /owner/);
  assert.throws(() => dispatch('UPDATE_BUSINESS', { name: 'Changed' }, manager), /owner/);
  dispatch('UPDATE_STAFF', { id: 'staff-kojo', active: false }, owner);
  assert.throws(() => dispatch('CREATE_REQUEST', { shopId: 'night-market', amount: 100 }, cashier), /inactive/);
});

test('invalid monetary input and mismatched requests leave the ledger intact', () => {
  resetDemo();
  const before = metrics().balance;
  assert.throws(() => pay(10.5), /whole pesewas/);
  assert.throws(() => pay(-1), /positive/);
  const request = dispatch('CREATE_REQUEST', { shopId: 'night-market', amount: 2500 }, cashier);
  assert.throws(() => pay(2600, { requestId: request.id }), /must match/);
  assert.equal(metrics().balance, before);
});

test('unassigned account receipts can be assigned once while preserving account funds', () => {
  resetDemo();
  const tx = pay(2000, { shopId: null, staffId: null, method: 'account' });
  const balance = metrics().balance;
  const before = metrics('pentagon').currentGross;
  dispatch('ASSIGN_PAYMENT', { id: tx.id, shopId: 'pentagon' }, owner);
  assert.equal(metrics('pentagon').currentGross, before + 2000);
  assert.equal(metrics().balance, balance);
  assert.throws(() => dispatch('ASSIGN_PAYMENT', { id: tx.id, shopId: 'night-market' }, owner), /already been assigned/);
});

test('support accepts displayed references and unknown receipts without exposing another shop', () => {
  resetDemo();
  const tx = pay(2500);
  const linked = dispatch('ADD_TICKET', { subject: 'Payment help', message: 'Please check this receipt.', shopId: 'night-market', transactionId: tx.reference }, manager);
  assert.equal(linked.transactionId, tx.id);
  assert.equal(linked.paymentReference, tx.reference);
  const missing = dispatch('ADD_TICKET', { subject: 'Missing receipt', message: 'The customer has this reference.', shopId: 'night-market', transactionId: 'LM-UNKNOWN' }, manager);
  assert.equal(missing.paymentReference, 'LM-UNKNOWN');
  const other = getState().transactions.find(entry => entry.shopId === 'pentagon');
  assert.throws(() => dispatch('ADD_TICKET', { subject: 'Payment', message: 'Check it', shopId: 'night-market', transactionId: other.reference }, manager), /assigned shop/);
});

test('shop metrics omit global account details', () => {
  resetDemo();
  const local = metrics('night-market');
  assert.equal(local.merchantBalance, undefined);
  assert.equal(local.reserved, 0);
  assert.notEqual(local.balance, metrics().balance);
});

test('damaged persisted data recovers to a usable sample workspace', async () => {
  const previous = globalThis.localStorage;
  globalThis.localStorage = { getItem: () => JSON.stringify({ version: 1, openingBalance: 'broken', business: {}, shops: [], transactions: [], closings: [], refunds: [], settlements: [] }) };
  try {
    const recovered = await import('../dist/store.js?corrupt-snapshot-test');
    assert.equal(recovered.metrics().balance, 1800000);
    assert.ok(recovered.getState().requests.length);
    assert.equal(recovered.getState().shops.length, 3);
  } finally {
    if (previous === undefined) delete globalThis.localStorage;
    else globalThis.localStorage = previous;
  }
});

test('fresh sample receipts remain in the current Ghana day even immediately after midnight', () => {
  const RealDate = globalThis.Date;
  const fixed = RealDate.parse('2026-11-11T00:01:00Z');
  globalThis.Date = class extends RealDate {
    constructor(...args) { super(...(args.length ? args : [fixed])); }
    static now() { return fixed; }
  };
  try {
    resetDemo();
    const receipts = getState().transactions.filter(tx => tx.id.startsWith('today-'));
    assert.ok(receipts.length > 0);
    assert.ok(receipts.every(tx => tx.createdAt.startsWith('2026-11-11')));
    assert.equal(metrics().todayCount, receipts.length);
    assert.equal(metrics().balance, 1800000);
  } finally {
    globalThis.Date = RealDate;
    resetDemo();
  }
});
const signupPayload = (overrides = {}) => ({
  name: 'Campus Print House', ownerName: 'Akua Owusu', phone: '024 000 0000',
  businessType: 'Registered business', registrationNumber: 'SAMPLE-12345',
  destination: 'GCB Bank · SAMPLE-0099', verification: { identity: true, face: true },
  shop: { name: 'Night Market Print Shop', area: 'Night Market', category: 'Printing', lat: 5.6509, lng: -0.1878 },
  ...overrides
});
let signupImportSequence = 0;
async function isolatedSignupStore(callback, values = new Map()) {
  const previous = globalThis.localStorage;
  globalThis.localStorage = {
    getItem: key => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value),
    removeItem: key => values.delete(key)
  };
  try {
    const api = await import(`../dist/store.js?signup-test-${signupImportSequence++}`);
    await callback(api, values);
  } finally {
    if (previous === undefined) delete globalThis.localStorage;
    else globalThis.localStorage = previous;
  }
}

test('merchant signup creates one zero-balance account and only the first shop', async () => {
  await isolatedSignupStore(api => {
    const snapshot = api.dispatch('REGISTER_BUSINESS', signupPayload({
      verification: { identity: true, face: true, rawGhanaCard: 'must-not-be-kept', selfie: 'must-not-be-kept' }
    }), owner);
    assert.equal(api.getWorkspaceMode(), 'registered');
    assert.equal(api.hasRegistration(), true);
    assert.equal(snapshot.business.name, 'Campus Print House');
    assert.equal(snapshot.business.ownerName, 'Akua Owusu');
    assert.equal(snapshot.business.phone, '+233240000000');
    assert.match(snapshot.business.accountNumber, /^9900\d{6}$/);
    assert.equal(snapshot.business.verificationStatus, 'approved-demo');
    assert.deepEqual(snapshot.business.verification, { identity: true, face: true });
    assert.equal(JSON.stringify(snapshot).includes('must-not-be-kept'), false);
    assert.equal(snapshot.shops.length, 1);
    assert.equal(snapshot.shops[0].name, 'Night Market Print Shop');
    assert.equal(snapshot.shops[0].code, 'LUM101');
    assert.equal(snapshot.staff.length, 1);
    assert.equal(snapshot.staff[0].role, 'manager');
    assert.equal(snapshot.staff[0].name, 'Akua Owusu');
    assert.equal(snapshot.staff[0].shopId, snapshot.shops[0].id);
    for (const key of ['transactions', 'requests', 'closings', 'refunds', 'settlements', 'tickets', 'audit']) assert.equal(snapshot[key].length, 0);
    assert.equal(api.metrics().balance, 0);
    assert.equal(api.metrics().available, 0);
    assert.equal(api.metrics(snapshot.shops[0].id).currentNet, 0);
  });
});

test('invalid signup leaves the existing business and funds untouched', async () => {
  await isolatedSignupStore(api => {
    const before = api.getState();
    const bad = [
      { name: '' }, { ownerName: '  ' }, { phone: '+234240000000' }, { phone: '0240' },
      { businessType: '' }, { destination: '' }, { verification: { identity: true } },
      { verification: { identity: false, face: true } }, { shop: null },
      { shop: { ...signupPayload().shop, lat: '' } },
      { shop: { ...signupPayload().shop, lat: '   ' } },
      { shop: { ...signupPayload().shop, lng: true } },
      { shop: { ...signupPayload().shop, lng: Infinity } },
      { shop: { ...signupPayload().shop, lat: 91 } },
      { shop: { ...signupPayload().shop, name: '' } }
    ];
    for (const override of bad) {
      assert.throws(() => api.dispatch('REGISTER_BUSINESS', signupPayload(override), owner));
      assert.deepEqual(api.getState(), before);
      assert.equal(api.hasRegistration(), false);
    }
    assert.throws(() => api.dispatch('REGISTER_BUSINESS', signupPayload(), cashier), /owner/);
    assert.deepEqual(api.getState(), before);
  });
});

test('sample and registered workspaces preserve independent payments and balances', async () => {
  await isolatedSignupStore(api => {
    const sampleTx = api.dispatch('PAY', { shopId: 'night-market', payer: 'Sample customer', amount: 5100, method: 'code' }, student);
    const sampleBefore = api.getState(), sampleBalance = api.metrics().balance;
    const registered = api.dispatch('REGISTER_BUSINESS', signupPayload(), owner);
    const shopId = registered.shops[0].id;
    const registeredTx = api.dispatch('PAY', { shopId, payer: 'New customer', amount: 4200, method: 'qr' }, student);
    assert.equal(api.metrics().balance, 4200);
    api.switchWorkspace('sample');
    assert.equal(api.metrics().balance, sampleBalance);
    assert.equal(api.getState().business.name, sampleBefore.business.name);
    assert.ok(api.getState().transactions.some(tx => tx.id === sampleTx.id));
    assert.equal(api.getState().transactions.some(tx => tx.id === registeredTx.id), false);
    api.switchWorkspace('registered');
    assert.equal(api.metrics().balance, 4200);
    assert.ok(api.getState().transactions.some(tx => tx.id === registeredTx.id));
    assert.equal(api.getState().transactions.some(tx => tx.id === sampleTx.id), false);
  });
});

test('a registered business resumes after reload and remains available from sample mode', async () => {
  const values = new Map();
  let account, firstShopId;
  await isolatedSignupStore(api => {
    const created = api.dispatch('REGISTER_BUSINESS', signupPayload({ phone: '+233 24 000 0000' }), owner);
    account = created.business.accountNumber;
    firstShopId = created.shops[0].id;
    api.dispatch('PAY', { shopId: firstShopId, amount: 2500, payer: 'First customer', method: 'qr' }, student);
  }, values);
  await isolatedSignupStore(api => {
    assert.equal(api.getWorkspaceMode(), 'registered');
    assert.equal(api.getState().business.accountNumber, account);
    assert.equal(api.metrics().balance, 2500);
    api.switchWorkspace('sample');
  }, values);
  await isolatedSignupStore(api => {
    assert.equal(api.getWorkspaceMode(), 'sample');
    assert.equal(api.hasRegistration(), true);
    api.switchWorkspace('registered');
    assert.equal(api.getState().shops[0].id, firstShopId);
    assert.equal(api.metrics().balance, 2500);
  }, values);
});

test('resetting sample data preserves registered funds and prevents signup overwrite', async () => {
  await isolatedSignupStore(api => {
    assert.equal(api.hasRegistration(), false);
    assert.throws(() => api.switchWorkspace('registered'), /signup/);
    assert.throws(() => api.switchWorkspace('unknown'), /Choose/);
    const created = api.dispatch('REGISTER_BUSINESS', signupPayload(), owner);
    api.dispatch('PAY', { shopId: created.shops[0].id, payer: 'Customer', amount: 3500, method: 'account' }, student);
    const before = api.getState();
    assert.throws(() => api.dispatch('REGISTER_BUSINESS', signupPayload({ name: 'A different business' }), owner), /already registered/);
    assert.deepEqual(api.getState(), before);
    api.resetDemo();
    assert.equal(api.getWorkspaceMode(), 'sample');
    assert.equal(api.metrics().balance, 1800000);
    assert.equal(api.hasRegistration(), true);
    api.switchWorkspace('registered');
    assert.equal(api.metrics().balance, 3500);
    assert.equal(api.getState().business.accountNumber, before.business.accountNumber);
  });
});

test('cross-tab updates stay within their own sample or registered workspace', async () => {
  const previousWindow = globalThis.window, previousChannel = globalThis.BroadcastChannel;
  const channels = [];
  globalThis.window = { addEventListener() {} };
  globalThis.BroadcastChannel = class {
    constructor() { this.listener = null; channels.push(this); }
    addEventListener(_type, callback) { this.listener = callback; }
    postMessage(message) { for (const channel of channels) if (channel !== this) channel.listener?.({ data: structuredClone(message) }); }
  };
  const values = new Map();
  try {
    await isolatedSignupStore(async ownerTab => {
      const created = ownerTab.dispatch('REGISTER_BUSINESS', signupPayload(), owner);
      let ownerUpdates = 0;
      ownerTab.subscribe(() => ownerUpdates++);
      await isolatedSignupStore(sampleTab => {
        assert.equal(sampleTab.getWorkspaceMode(), 'registered');
        sampleTab.switchWorkspace('sample');
        const sampleBalance = sampleTab.metrics().balance;
        sampleTab.dispatch('PAY', { shopId: 'night-market', amount: 2500, payer: 'Sample student', method: 'qr' }, student);
        assert.equal(ownerTab.getWorkspaceMode(), 'registered');
        assert.equal(ownerTab.metrics().balance, 0);
        assert.equal(ownerUpdates, 0);
        ownerTab.dispatch('PAY', { shopId: created.shops[0].id, amount: 1800, payer: 'Registered student', method: 'qr' }, student);
        assert.equal(sampleTab.getWorkspaceMode(), 'sample');
        assert.equal(sampleTab.metrics().balance, sampleBalance + 2500);
        sampleTab.switchWorkspace('registered');
        assert.equal(sampleTab.metrics().balance, 1800);
        assert.equal(sampleTab.getState().business.accountNumber, ownerTab.getState().business.accountNumber);
      }, values);
    }, values);
  } finally {
    if (previousWindow === undefined) delete globalThis.window;
    else globalThis.window = previousWindow;
    globalThis.BroadcastChannel = previousChannel;
  }
});


test('access users project into registered staff without changing money or historical receipts', async () => {
  await isolatedSignupStore(api => {
    const created = api.dispatch('REGISTER_BUSINESS', signupPayload(), owner);
    const first = created.shops[0].id, legacyStaffId = created.staff[0].id;
    const second = api.dispatch('ADD_SHOP', { name: 'Pentagon print desk', area: 'Pentagon', category: 'Printing', lat: 5.6535, lng: -0.1845 }, owner);
    const tx = api.dispatch('PAY', { shopId: first, payer: 'Student', amount: 2500, method: 'qr', staffId: legacyStaffId }, student);
    const financial = api.getState(), balance = api.metrics().balance;
    const users = [
      { id: 'owner-account', businessId: created.business.id, name: 'Akua Owusu', role: 'owner', shopIds: [] },
      { id: 'manager-account', businessId: created.business.id, name: 'Ama Mensah', phone: '+233245550101', role: 'manager', shopIds: [first, second.id], active: true },
      { id: 'foreign-account', businessId: 'another-business', role: 'invalid', shopIds: ['unknown'] }
    ];
    let updates = 0;
    api.subscribe(() => updates++);
    const result = api.syncAccessUsers(users);
    const person = result.staff.find(entry => entry.authUserId === 'manager-account');
    assert.equal(person.id, 'access-manager-account');
    assert.deepEqual(person.shopIds, [first, second.id]);
    assert.equal(person.shopId, first);
    assert.equal(result.staff.find(entry => entry.id === legacyStaffId).active, false);
    assert.equal(result.staff.some(entry => entry.authUserId === 'owner-account'), false);
    assert.equal(result.staff.some(entry => entry.authUserId === 'foreign-account'), false);
    assert.equal(api.metrics().balance, balance);
    for (const key of ['transactions', 'refunds', 'settlements', 'closings', 'requests']) assert.deepEqual(result[key], financial[key]);
    assert.equal(result.transactions.find(entry => entry.id === tx.id).staffId, legacyStaffId);
    assert.equal(updates, 1);
    const revision = result.revision;
    api.syncAccessUsers(users);
    assert.equal(api.getState().revision, revision);
    assert.equal(updates, 1);
  });
});

test('an authenticated manager can work at assigned shops and cannot use another identity or shop', async () => {
  await isolatedSignupStore(api => {
    const created = api.dispatch('REGISTER_BUSINESS', signupPayload(), owner);
    const first = created.shops[0].id;
    const addShop = name => api.dispatch('ADD_SHOP', { name, area: name, category: 'Printing', lat: 5.65, lng: -0.18 }, owner);
    const second = addShop('Pentagon desk'), third = addShop('Akuafo desk');
    api.syncAccessUsers([{ id: 'manager-account', businessId: created.business.id, name: 'Ama', role: 'manager', shopIds: [first, second.id], active: true }]);
    const accessManager = { role: 'manager', userId: 'manager-account', staffId: 'access-manager-account', shopId: second.id };
    const request = api.dispatch('CREATE_REQUEST', { shopId: second.id, amount: 3000 }, accessManager);
    assert.equal(request.staffId, accessManager.staffId);
    const receipt = api.dispatch('PAY', { shopId: second.id, payer: 'Student', amount: 3000, method: 'request', requestId: request.id }, student);
    assert.equal(receipt.staffId, accessManager.staffId);
    const before = api.metrics().balance;
    api.dispatch('CLOSE_DAY', { shopId: second.id }, accessManager);
    assert.equal(api.metrics(second.id).currentNet, 0);
    assert.equal(api.metrics().balance, before);
    api.dispatch('CREATE_REQUEST', { shopId: first, amount: 1200 }, { ...accessManager, shopId: first });
    assert.throws(() => api.dispatch('CREATE_REQUEST', { shopId: third.id, amount: 1200 }, { ...accessManager, shopId: third.id }), /assigned/);
    assert.throws(() => api.dispatch('CREATE_REQUEST', { shopId: second.id, amount: 1200 }, { ...accessManager, userId: 'different-user' }), /identity/);
    assert.throws(() => api.dispatch('CREATE_REQUEST', { shopId: third.id, amount: 1200 }, { role: 'manager', userId: 'manager-account', shopId: third.id }), /assigned/);
  });
});

test('suspending or removing an access user revokes actions and preserves their receipt attribution', async () => {
  await isolatedSignupStore(api => {
    const created = api.dispatch('REGISTER_BUSINESS', signupPayload(), owner), shopId = created.shops[0].id;
    const user = { id: 'cashier-account', businessId: created.business.id, name: 'Kojo', role: 'cashier', shopIds: [shopId], active: true };
    api.syncAccessUsers([user]);
    const accessCashier = { role: 'cashier', userId: user.id, staffId: 'access-cashier-account', shopId };
    const receipt = api.dispatch('PAY', { shopId, staffId: accessCashier.staffId, amount: 2500, payer: 'Student', method: 'qr' }, student);
    const balance = api.metrics().balance;
    api.syncAccessUsers([{ ...user, active: false }]);
    assert.throws(() => api.dispatch('CREATE_REQUEST', { shopId, amount: 1000 }, accessCashier), /inactive/);
    api.syncAccessUsers([user]);
    api.dispatch('CREATE_REQUEST', { shopId, amount: 1000 }, accessCashier);
    api.syncAccessUsers([]);
    assert.throws(() => api.dispatch('CREATE_REQUEST', { shopId, amount: 1000 }, accessCashier), /inactive/);
    assert.equal(api.getState().transactions.find(entry => entry.id === receipt.id).staffId, accessCashier.staffId);
    assert.equal(api.getState().staff.find(entry => entry.id === accessCashier.staffId).name, 'Kojo');
    assert.equal(api.metrics().balance, balance);
  });
});

test('staff self-sync preserves colleagues and owner roster sync still removes omitted access', async () => {
  await isolatedSignupStore(api => {
    const created = api.dispatch('REGISTER_BUSINESS', signupPayload(), owner), shopId = created.shops[0].id;
    const manager = { id: 'manager-account', businessId: created.business.id, name: 'Ama', role: 'manager', shopIds: [shopId], active: true };
    const cashier = { id: 'cashier-account', businessId: created.business.id, name: 'Kojo', role: 'cashier', shopIds: [shopId], active: true };
    api.syncAccessUsers([manager, cashier]);
    const colleagueBefore = api.getState().staff.find(person => person.authUserId === manager.id);
    api.syncAccessUsers([{ ...cashier, name: 'Kojo Asare' }], { authoritative: false });
    assert.deepEqual(api.getState().staff.find(person => person.authUserId === manager.id), colleagueBefore);
    assert.equal(api.getState().staff.find(person => person.authUserId === cashier.id).name, 'Kojo Asare');
    for (const user of [manager, cashier]) {
      const request = api.dispatch('CREATE_REQUEST', { shopId, amount: 1000 }, { role: user.role, userId: user.id, shopId, staffId: `access-${user.id}` });
      assert.equal(request.staffId, `access-${user.id}`);
    }
    api.syncAccessUsers([cashier]);
    assert.equal(api.getState().staff.find(person => person.authUserId === manager.id).active, false);
    assert.equal(api.getState().staff.find(person => person.authUserId === cashier.id).active, true);
  });
});

test('partial access sync preserves legacy records and ignores empty or invalid roster changes atomically', async () => {
  await isolatedSignupStore(api => {
    const sample = api.getState();
    api.syncAccessUsers([], { authoritative: false });
    assert.deepEqual(api.getState(), sample);
    const created = api.dispatch('REGISTER_BUSINESS', signupPayload(), owner), shopId = created.shops[0].id;
    const legacy = created.staff;
    const user = { id: 'cashier-account', businessId: created.business.id, name: 'Kojo', role: 'cashier', shopIds: [shopId], active: true };
    api.syncAccessUsers([user], { authoritative: false });
    for (const person of legacy) assert.deepEqual(api.getState().staff.find(entry => entry.id === person.id), person);
    const before = api.getState();
    let updates = 0;
    api.subscribe(() => updates++);
    api.syncAccessUsers([], { authoritative: false });
    api.syncAccessUsers([{ id: 'foreign', businessId: 'another-business', role: 'invalid' }], { authoritative: false });
    api.syncAccessUsers([user], { authoritative: false });
    assert.deepEqual(api.getState(), before);
    assert.equal(updates, 0);
    assert.throws(() => api.syncAccessUsers([{ ...user, name: 'Changed name' }, { ...user, id: 'invalid-shop', shopIds: ['unknown-shop'] }], { authoritative: false }), /unknown shop/);
    assert.deepEqual(api.getState(), before);
    assert.equal(updates, 0);
    api.syncAccessUsers([{ ...user, active: false }], { authoritative: false });
    assert.equal(api.getState().staff.find(person => person.authUserId === user.id).active, false);
    for (const person of legacy) assert.deepEqual(api.getState().staff.find(entry => entry.id === person.id), person);
  });
});

test('access projection validates atomically and leaves the sample workspace untouched', async () => {
  await isolatedSignupStore(api => {
    const sample = api.getState();
    api.syncAccessUsers([{ id: 'foreign', role: 'invalid', shopIds: [] }]);
    assert.deepEqual(api.getState(), sample);
    const created = api.dispatch('REGISTER_BUSINESS', signupPayload(), owner), shopId = created.shops[0].id;
    const before = api.getState();
    const base = { id: 'user-one', businessId: created.business.id, name: 'Ama', role: 'manager', shopIds: [shopId] };
    const invalid = [
      [{ ...base, role: 'superuser' }],
      [{ ...base, shopIds: [] }],
      [{ ...base, shopIds: ['another-shop'] }],
      [{ ...base, id: '' }],
      [base, base],
      [{ ...base, name: '' }]
    ];
    for (const users of invalid) {
      assert.throws(() => api.syncAccessUsers(users));
      assert.deepEqual(api.getState(), before);
    }
    api.syncAccessUsers([base]);
    api.switchWorkspace('sample');
    assert.deepEqual(api.getState(), sample);
  });
});

test('two stale browser module instances retain both sequentially committed receipts before storage events arrive', async () => {
  await isolatedSignupStore(async (first, values) => {
    const snapshot = first.dispatch('REGISTER_BUSINESS', signupPayload(), owner);
    const second = await import(`../dist/store.js?concurrent-tab-${signupImportSequence++}`);
    first.dispatch('PAY', {shopId: snapshot.shops[0].id, amount: 1000, payer: 'First counter'}, student);
    second.dispatch('PAY', {shopId: snapshot.shops[0].id, amount: 2000, payer: 'Second counter'}, student);
    const stored = JSON.parse(values.get('lumo-merchant-registered-v1'));
    assert.equal(stored.transactions.length, 2);
    assert.equal(stored.transactions.reduce((sum, tx) => sum + tx.amount, 0), 3000);
  });
});

test('installing an authorised server snapshot preserves its money and leaves the sample workspace isolated', async () => {
  await isolatedSignupStore(async api => {
    const sample = api.getState();
    const {createBusiness, reduceBusiness} = await import('../dist/domain.js');
    let remote = createBusiness(signupPayload(), {businessId: 'remote-business', accountNumber: '9900000002', shopCode: 'LUM900002'});
    remote = reduceBusiness(remote, 'PAY', {shopId: remote.shops[0].id, amount: 4321, payer: 'Remote student'}, student).state;
    api.replaceRegisteredState(remote, {activate: false, notify: false});
    assert.deepEqual(api.getState(), sample);
    api.switchWorkspace('registered');
    assert.equal(api.metrics().balance, 4321);assert.equal(api.getState().business.id, 'remote-business');
    api.switchWorkspace('sample');assert.deepEqual(api.getState().transactions, sample.transactions);
  });
});

test('clearing shared cache rejects delayed registered storage events until another authorised snapshot arrives',async()=>{
 const previousWindow=globalThis.window,previousChannel=globalThis.BroadcastChannel;let onStorage;
 globalThis.window={addEventListener(name,handler){if(name==='storage')onStorage=handler}};globalThis.BroadcastChannel=class{addEventListener(){}postMessage(){}unref(){}};
 try{await isolatedSignupStore(async(api,values)=>{
  const {createBusiness}=await import('../dist/domain.js');const remote=createBusiness(signupPayload(),{businessId:'business-8888',accountNumber:'9900888800',shopCode:'LUM8888'});remote.business.sandbox=true;remote.transactions=[{id:'private-cached',shopId:remote.shops[0].id,amount:7725,status:'paid',payer:'Private cached payer',createdAt:new Date().toISOString(),reference:'PRIVATE-STORAGE'}];
  api.replaceRegisteredState(remote,{activate:true,notify:false});api.clearRegisteredState();assert.equal(values.has('lumo-merchant-registered-v1'),false);assert.equal(api.hasRegistration(),false);
  // A queued old storage event and its written value cannot resurrect the signed-out cache.
  values.set('lumo-merchant-registered-v1',JSON.stringify(remote));onStorage({key:'lumo-merchant-registered-v1',newValue:JSON.stringify(remote)});assert.equal(api.hasRegistration(),false);assert.equal(values.has('lumo-merchant-registered-v1'),false);assert.ok(!JSON.stringify(api.getState()).includes('Private cached payer'));
  api.replaceRegisteredState(remote,{activate:true,notify:false});assert.equal(api.hasRegistration(),true);assert.equal(api.getState().transactions[0].payer,'Private cached payer');
 });}finally{globalThis.window=previousWindow;globalThis.BroadcastChannel=previousChannel}
});
