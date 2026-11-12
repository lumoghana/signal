import test from 'node:test';
import assert from 'node:assert/strict';
import { createLumoClient, LumoClientError } from '../src/client.mjs';

const ORIGIN = 'https://iwutbrljiiodamtyoorg.supabase.co';
const KEY = 'sb_publishable_synthetic_test_key';
const USER = '10000000-0000-4000-8000-000000000001';
const OTHER = '10000000-0000-4000-8000-000000000002';
const ACCOUNT = '20000000-0000-4000-8000-000000000001';
const RECIPIENT = '20000000-0000-4000-8000-000000000002';
const SHOP = '30000000-0000-4000-8000-000000000001';
const REQUEST = '30000000-0000-4000-8000-000000000002';
const PAYMENT = '40000000-0000-4000-8000-000000000001';
const ATTEMPT = 'stable-original-attempt';
const account = (balance = 5000) => ({ id: ACCOUNT, userId: USER, handle: 'william', displayName: 'William', balance, currency: 'GHS' });
const session = (id = USER, suffix = 'one') => ({ access_token: 'synthetic-access-' + suffix, refresh_token: 'synthetic-refresh-' + suffix, user: { id, email: 'tester@example.invalid' } });
const ok = extra => ({ ok: true, sandbox: true, currency: 'GHS', ...extra });
const json = (value, status = 200) => new Response(JSON.stringify(value), { status, headers: { 'Content-Type': 'application/json' } });
function receipt(command = 'transfer', payload = {}) {
  return ok({ attemptId: payload.attemptId || ATTEMPT, account: account(), replayed: false, receipt: {
    id: PAYMENT, reference: 'LUMO-TEST-RECEIPT', type: { transfer: 'transfer', 'wallet.fund': 'test_funding', 'payment.pay': 'merchant_payment', 'payment.refund': 'refund' }[command],
    status: 'posted', sandbox: true, currency: 'GHS', actorUserId: USER,
    amount: payload.amount || 2500, payerAccountId: command === 'wallet.fund' ? RECIPIENT : ACCOUNT,
    payeeAccountId: command === 'wallet.fund' ? ACCOUNT : RECIPIENT,
    recipientHandle: 'akua', shopId: payload.shopId || null, requestId: payload.requestId || null,
    originalPaymentId: payload.paymentId || null, createdAt: new Date().toISOString(),
  } });
}
function memory() {
  const map = new Map();
  return { map, getItem: key => map.get(key) ?? null, setItem: (key, value) => map.set(key, value), removeItem: key => map.delete(key) };
}
async function setup(handler, options = {}) {
  const calls = [], changes = [], storage = options.storage || memory();
  const transport = async (url, init) => {
    const call = { url, init, body: init.body ? JSON.parse(init.body) : null }; calls.push(call);
    if (url.includes('grant_type=password')) return json(session(options.userId));
    return handler(call, calls);
  };
  const client = createLumoClient({ url: ORIGIN, publishableKey: KEY, pendingStorage: storage, fetch: transport,
    makeAttemptId: () => ATTEMPT, onSessionChange: value => changes.push(value), ...options });
  await client.signIn('tester@example.invalid', 'synthetic-password');
  return { client, calls, changes, storage };
}
function errorCode(code) { return failure => failure instanceof LumoClientError && failure.code === code; }
const transfer = { recipientHandle: 'akua', amount: 2500, pin: '4917', attemptId: ATTEMPT };

test('client only accepts HTTPS origins and publishable or legacy anon keys', () => {
  for (const url of ['http://example.com', ORIGIN + '/other', 'https://x@y.example', ORIGIN + '?x=1']) {
    assert.throws(() => createLumoClient({ url, publishableKey: KEY, pendingStorage: memory() }), errorCode('INVALID_INPUT'));
  }
  for (const publishableKey of ['sb_secret_private_key_should_never_enter_client', 'x.' + btoa(JSON.stringify({ role: 'service_role' })) + '.x']) {
    assert.throws(() => createLumoClient({ url: ORIGIN, publishableKey, pendingStorage: memory() }), errorCode('INVALID_INPUT'));
  }
  assert.ok(createLumoClient({ url: ORIGIN, publishableKey: 'x.' + btoa(JSON.stringify({ role: 'anon' })) + '.x', pendingStorage: memory() }));
});

test('sign-in uses Auth and gives host a session without persisting passwords or PINs', async () => {
  const h = await setup(() => json(ok({ account: account() })));
  assert.equal(h.client.user.id, USER);
  assert.equal(h.changes[0].access_token, 'synthetic-access-one');
  assert.equal(h.calls[0].url, ORIGIN + '/auth/v1/token?grant_type=password');
  assert.equal(h.calls[0].init.headers.apikey, KEY);
  assert.equal(h.calls[0].init.redirect, 'error');
  assert.equal(h.storage.map.size, 0);
  await h.client.getAccount();
  assert.equal(h.calls[1].init.headers.Authorization, 'Bearer synthetic-access-one');
  assert.deepEqual(h.calls[1].body, { p_command: 'account.get', p_payload: {} });
});

test('restored sessions must be verified by Auth user endpoint and cannot trust an edited cached owner', async () => {
  const h = await setup(() => json({ id: OTHER }));
  await assert.rejects(() => h.client.restoreSession(session()), errorCode('SESSION_CHANGED'));
  assert.equal(h.calls.at(-1).url, ORIGIN + '/auth/v1/user');
  assert.equal(h.calls.at(-1).init.method, 'GET');
  assert.equal(h.client.user.id, USER);
});

test('concurrent 401 responses share one refresh and repeat the unchanged RPC body once', async () => {
  let refreshCalls = 0;
  const h = await setup(async call => {
    if (call.url.includes('grant_type=refresh_token')) { refreshCalls++; await new Promise(resolve => setTimeout(resolve, 5)); return json(session(USER, 'two')); }
    if (call.init.headers.Authorization === 'Bearer synthetic-access-one') return json({ error: 'expired' }, 401);
    return json(ok({ account: account() }));
  });
  await Promise.all([h.client.getAccount(), h.client.lookupRecipient('akua')]);
  assert.equal(refreshCalls, 1);
  const rpcs = h.calls.filter(call => call.url.includes('/rpc/'));
  assert.equal(rpcs.length, 4);
  assert.deepEqual(rpcs[0].body, rpcs[2].body);
  assert.deepEqual(rpcs[1].body, rpcs[3].body);
});

test('money command saves its reference before POST, removes credentials from journal and verifies receipt', async () => {
  const storage = memory();
  const h = await setup(call => {
    const saved = JSON.parse([...storage.map.values()][0]);
    assert.equal(saved.userId, USER);
    assert.equal(saved.payload.attemptId, ATTEMPT);
    assert.equal(saved.payload.pin, undefined);
    assert.equal(JSON.stringify(saved).includes('4917'), false);
    assert.equal(call.body.p_payload.pin, '4917');
    return json(receipt());
  }, { storage });
  const result = await h.client.transfer(transfer);
  assert.equal(result.receipt.reference, 'LUMO-TEST-RECEIPT');
  assert.equal(await h.client.getPending(), null);
});

test('lost committed response is retained and blocks another money move', async () => {
  const h = await setup(() => { throw new Error('synthetic-access-one and pin 4917 must not escape'); });
  await assert.rejects(() => h.client.transfer(transfer), failure => errorCode('NETWORK_ERROR')(failure) && !failure.message.includes('4917'));
  assert.deepEqual((await h.client.getPending()).payload, { recipientHandle: 'akua', amount: 2500, attemptId: ATTEMPT });
  await assert.rejects(() => h.client.fundTestWallet(5000, { confirmSandbox: true }), errorCode('PENDING_PAYMENT'));
  assert.equal(h.calls.filter(call => call.url.includes('/rpc/')).length, 1);
});

test('lookup recovers exact committed receipt without requesting or storing PIN again', async () => {
  let first = true;
  const h = await setup(call => {
    if (first) { first = false; throw new Error('lost reply'); }
    assert.deepEqual(call.body, { p_command: 'attempt.lookup', p_payload: { attemptId: ATTEMPT } });
    return json(ok({ found: true, result: receipt(), account: account(7777) }));
  });
  await assert.rejects(() => h.client.transfer(transfer), errorCode('NETWORK_ERROR'));
  const result = await h.client.recoverPending();
  assert.equal(result.recovered, true);
  assert.equal(result.account.balance, 7777);
  assert.equal(await h.client.getPending(), null);
});

test('lookup absent attempt does not clear a potentially in-flight POST', async () => {
  let first = true;
  const h = await setup(() => { if (first) { first = false; throw new Error('timeout'); } return json(ok({ found: false })); });
  await assert.rejects(() => h.client.transfer(transfer));
  assert.equal((await h.client.recoverPending()).found, false);
  assert.equal((await h.client.getPending()).payload.attemptId, ATTEMPT);
});

test('retry uses original recipient amount and attempt with newly entered PIN', async () => {
  let first = true;
  const h = await setup(call => {
    if (first) { first = false; throw new Error('timeout'); }
    assert.deepEqual(call.body.p_payload, { recipientHandle: 'akua', amount: 2500, attemptId: ATTEMPT, pin: '6024' });
    return json(receipt());
  });
  await assert.rejects(() => h.client.transfer(transfer));
  await h.client.retryPending('6024');
  assert.equal(await h.client.getPending(), null);
});

test('receipt attempt, type, target handle, money and actor mismatches keep the original request', async () => {
  for (const mutate of [
    result => result.attemptId = 'different-original-attempt',
    result => result.receipt.type = 'merchant_payment',
    result => result.receipt.recipientHandle = 'someone-else',
    result => result.receipt.amount = 2501,
    result => result.receipt.payerAccountId = RECIPIENT,
    result => result.receipt.status = 'pending',
    result => result.account.userId = OTHER,
    result => result.receipt.actorUserId = OTHER,
  ]) {
    const bad = receipt(); mutate(bad);
    const h = await setup(() => json(bad));
    await assert.rejects(() => h.client.transfer(transfer), errorCode('RECEIPT_MISMATCH'));
    assert.equal((await h.client.getPending()).payload.attemptId, ATTEMPT);
  }
});

test('only a definitive rejection bound to the exact saved attempt clears pending', async () => {
  for (const [definitive, attemptId, cleared] of [[true, ATTEMPT, true], [false, ATTEMPT, false], [true, undefined, false], [true, 'different-original-attempt', false]]) {
    const h = await setup(() => json({ ok: false, code: 'INSUFFICIENT_FUNDS', definitive, attemptId }));
    await assert.rejects(() => h.client.transfer(transfer), errorCode('INSUFFICIENT_FUNDS'));
    assert.equal(await h.client.getPending() === null, cleared);
  }
});

test('static and fixed merchant receipts must match original shop and request', async () => {
  for (const requestId of [undefined, REQUEST]) {
    const payload = { shopId: SHOP, ...(requestId ? { requestId } : {}), amount: 2500, pin: '4917', attemptId: ATTEMPT };
    const good = await setup(() => json(receipt('payment.pay', payload)));
    await good.client.payMerchant(payload);
    assert.equal(await good.client.getPending(), null);
    const mismatch = receipt('payment.pay', payload); mismatch.receipt.requestId = requestId ? null : REQUEST;
    const bad = await setup(() => json(mismatch));
    await assert.rejects(() => bad.client.payMerchant(payload), errorCode('RECEIPT_MISMATCH'));
  }
});

test('test funding requires explicit confirmation and validates credit into the current account', async () => {
  const h = await setup(call => json(receipt('wallet.fund', call.body.p_payload)));
  await assert.rejects(() => h.client.fundTestWallet(10000), errorCode('INVALID_INPUT'));
  assert.equal(h.calls.length, 1);
  await h.client.fundTestWallet(10000, { confirmSandbox: true });
  assert.equal(await h.client.getPending(), null);
});

test('refund receipt must identify the original payment', async () => {
  const payload = { paymentId: PAYMENT, amount: 2500, pin: '4917', attemptId: ATTEMPT };
  const h = await setup(() => json(receipt('payment.refund', payload)));
  assert.equal((await h.client.refundPayment(payload)).receipt.originalPaymentId, PAYMENT);
});

test('corrupt saved journal fails closed before another POST', async () => {
  const h = await setup(() => { throw new Error('must not call'); });
  const key = 'lumo.pending.v1.iwutbrljiiodamtyoorg.supabase.co.' + USER;
  for (const raw of ['{broken', '[]', JSON.stringify({ version: 1, userId: USER, command: 'transfer', payload: [] })]) {
    h.storage.map.set(key, raw);
    await assert.rejects(() => h.client.transfer(transfer), errorCode('JOURNAL_CORRUPT'));
  }
  assert.equal(h.calls.length, 1);
});

test('failed durable write prevents a payment POST and retains an unresolved marker', async () => {
  const storage = memory(); storage.setItem = () => { throw new Error('disk full'); };
  const h = await setup(() => { throw new Error('must not call'); }, { storage });
  await assert.rejects(() => h.client.transfer(transfer), errorCode('STORAGE_ERROR'));
  assert.equal(h.calls.length, 1);
  assert.equal((await h.client.getPending()).payload.attemptId, ATTEMPT);
  await assert.rejects(() => h.client.retryPending('4917'), errorCode('STORAGE_ERROR'));
  assert.equal(h.calls.length, 1, 'Retry must not send a marker that still cannot be durably saved');
});

test('failure to clear committed receipt keeps pending until safe recovery succeeds', async () => {
  const storage = memory(); const remove = storage.removeItem;
  storage.removeItem = () => { throw new Error('disk full'); };
  const h = await setup(call => json(call.body.p_command === 'attempt.lookup' ? ok({ found: true, result: receipt() }) : receipt()), { storage });
  await assert.rejects(() => h.client.transfer(transfer), errorCode('STORAGE_ERROR'));
  assert.ok(await h.client.getPending());
  storage.removeItem = remove;
  assert.equal((await h.client.recoverPending()).recovered, true);
});

test('concurrent taps send only one money request', async () => {
  let release;
  const h = await setup(async () => { await new Promise(resolve => release = resolve); return json(receipt()); });
  const pending = h.client.transfer(transfer);
  await assert.rejects(() => h.client.transfer(transfer), errorCode('PENDING_PAYMENT'));
  while (!release) await new Promise(resolve => setTimeout(resolve, 0));
  release(); await pending;
  assert.equal(h.calls.length, 2);
});

test('mutable caller payload is captured before asynchronous journal access', async () => {
  const h = await setup(call => { assert.equal(call.body.p_payload.recipientHandle, 'akua'); return json(receipt()); });
  const input = { ...transfer }; const send = h.client.transfer(input); input.recipientHandle = 'changed-recipient';
  await send;
});

test('pending survives sign-out and is isolated by verified immutable account identity', async () => {
  let rejectPayment = true;
  const h = await setup(call => {
    if (call.url.includes('/logout')) return new Response(null, { status: 204 });
    if (call.url.includes('/auth/v1/user')) return json({ id: OTHER });
    if (rejectPayment) { rejectPayment = false; throw new Error('lost'); }
    return json(ok({ account: account() }));
  });
  await assert.rejects(() => h.client.transfer(transfer));
  await h.client.signOut();
  assert.equal(h.client.signedIn, false);
  assert.equal(h.storage.map.size, 1);
  await h.client.restoreSession(session(OTHER, 'other'));
  assert.equal(await h.client.getPending(), null);
  assert.equal(h.storage.map.size, 1);
});

test('account switches during journal clearing cannot return the old-account receipt', async () => {
  let client;
  const storage = memory(), remove = storage.removeItem;
  storage.removeItem = async key => { remove(key); await client.signOut(); };
  const h = await setup(call => call.url.includes('/logout') ? new Response(null, { status: 204 }) : json(receipt()), { storage });
  client = h.client;
  await assert.rejects(() => client.transfer(transfer), failure => errorCode('SIGN_IN_REQUIRED')(failure) || errorCode('SESSION_CHANGED')(failure));
  assert.equal(client.signedIn, false);
});

test('an RPC with an unverified response envelope never clears a pending request', async () => {
  for (const result of [[], { ...receipt(), sandbox: false }, { ...receipt(), currency: 'USD' }, { ...receipt(), ok: undefined }]) {
    const h = await setup(() => json(result));
    await assert.rejects(() => h.client.transfer(transfer), errorCode('BAD_RESPONSE'));
    assert.ok(await h.client.getPending());
  }
});

test('handles are normalised and unsupported PINs and handles never reach the server', async () => {
  const h = await setup(call => {
    if (call.body.p_command === 'transfer') { assert.equal(call.body.p_payload.recipientHandle, 'akua'); return json(receipt()); }
    assert.equal(call.body.p_payload.handle, 'william'); return json(ok({ account: account() }));
  });
  await h.client.openAccount({ handle: ' William ', displayName: 'William', pin: '4917' });
  await h.client.transfer({ ...transfer, recipientHandle: ' Akua ' });
  const before = h.calls.length;
  await assert.rejects(() => h.client.transfer({ ...transfer, pin: '1234567' }), errorCode('INVALID_INPUT'));
  await assert.rejects(() => h.client.transfer({ ...transfer, recipientHandle: 'a.name' }), errorCode('INVALID_INPUT'));
  await assert.rejects(() => h.client.openAccount({ handle: 'one-two', displayName: 'William', pin: '4917' }), errorCode('INVALID_INPUT'));
  assert.equal(h.calls.length, before);
});

test('recovery cannot replace the verified account with malformed or another-user fresh account data', async () => {
  for (const current of [[], { ...account(), userId: OTHER }, { ...account(), id: RECIPIENT }, { ...account(), currency: 'USD' }, { ...account(), balance: -1 }]) {
    let first = true;
    const h = await setup(() => { if (first) { first = false; throw new Error('lost'); } return json(ok({ found: true, result: receipt(), account: current })); });
    await assert.rejects(() => h.client.transfer(transfer), errorCode('NETWORK_ERROR'));
    await assert.rejects(() => h.client.recoverPending(), errorCode('RECEIPT_MISMATCH'));
    assert.ok(await h.client.getPending());
  }
});

test('two clients sharing asynchronous storage cannot overwrite an unresolved money request', async () => {
  const sync = memory();
  const delay = () => new Promise(resolve => setTimeout(resolve, 1));
  const storage = { map: sync.map, async getItem(key) { await delay(); return sync.getItem(key); },
    async setItem(key, value) { await delay(); sync.setItem(key, value); }, async removeItem(key) { await delay(); sync.removeItem(key); } };
  let release, firstRpcCount = 0, secondRpcCount = 0;
  const first = await setup(async () => { firstRpcCount++; await new Promise(resolve => release = resolve); throw new Error('lost committed reply'); }, { storage });
  const second = await setup(() => { secondRpcCount++; return json(receipt()); }, { storage });
  const sending = first.client.transfer(transfer);
  const firstResult = assert.rejects(() => sending, errorCode('NETWORK_ERROR'));
  while (!release) await delay();
  const secondResult = assert.rejects(() => second.client.transfer({ ...transfer, attemptId: 'another-original-attempt' }), errorCode('PENDING_PAYMENT'));
  await delay(); assert.equal(secondRpcCount, 0, 'Second client must wait while first owns the lease');
  release(); await Promise.all([firstResult, secondResult]);
  assert.equal(firstRpcCount, 1);
  assert.equal(secondRpcCount, 0);
  assert.equal((await second.client.getPending()).payload.attemptId, ATTEMPT);
});

test('missing or failed cross-context lock providers fail closed before any money POST', async () => {
  for (const lockManager of [null,
    { request() { throw new Error('lock denied with synthetic private data'); } },
    { request(name, options, callback) { return callback(null); } },
    { request(name, options, callback) { return callback({ name, mode: 'shared' }); } },
  ]) {
    const h = await setup(() => { throw new Error('must not POST'); }, { lockManager });
    await assert.rejects(() => h.client.transfer(transfer), failure => errorCode('LOCK_UNAVAILABLE')(failure) && !failure.message.includes('synthetic'));
    await assert.rejects(() => h.client.retryPending('4917'), errorCode('LOCK_UNAVAILABLE'));
    await assert.rejects(() => h.client.recoverPending(), errorCode('LOCK_UNAVAILABLE'));
    assert.equal(h.calls.length, 1);
    assert.equal(h.storage.map.size, 0);
  }
});

test('injected exclusive lease covers storage, original POST, retry and PIN-free recovery', async () => {
  let held = false, fail = true, acquisitions = 0;
  const lockManager = { async request(name, options, callback) {
    assert.equal(options.mode, 'exclusive'); assert.equal(held, false); acquisitions++; held = true;
    try { return await callback({ name, mode: 'exclusive' }); } finally { held = false; }
  } };
  const original = memory();
  const storage = { getItem(key) { assert.equal(held, true); return original.getItem(key); },
    setItem(key, value) { assert.equal(held, true); original.setItem(key, value); },
    removeItem(key) { assert.equal(held, true); original.removeItem(key); } };
  const h = await setup(call => {
    assert.equal(held, true);
    if (fail) { fail = false; throw new Error('lost response'); }
    if (call.body.p_command === 'attempt.lookup') return json(ok({ found: true, result: receipt() }));
    return json(receipt());
  }, { storage, lockManager });
  await assert.rejects(() => h.client.transfer(transfer), errorCode('NETWORK_ERROR'));
  await h.client.retryPending('4917');
  fail = true;
  await assert.rejects(() => h.client.transfer(transfer), errorCode('NETWORK_ERROR'));
  await h.client.recoverPending();
  assert.equal(acquisitions, 4);
  assert.equal(held, false);
});
