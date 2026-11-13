/** Portable Lumo sandbox client. Host apps own secure session storage and UI approval. */
const CORE_MONEY = new Set(['wallet.fund', 'transfer', 'payment.pay', 'payment.refund']);
// Metadata can create an approval, consume an invitation or alter a mandate. It needs
// the same durable original-attempt recovery as an immediate money posting.
const EXTENDED_MUTATIONS = new Set([
  'group.create','group.invite','group.respond','group.join','group.message','group.contribute',
  'group.payout.request','group.payout.approve','group.payout.cancel','group.member.remove','group.leave','group.close',
  'plan.save','box.create','box.update','box.archive','box.save','box.withdraw',
  'box.partner.invite','box.partner.respond','box.release.request','box.release.decide','box.release.cancel',
  'hack.save','hack.delete','iou.create','iou.respond','iou.remind','iou.pay','iou.cancel',
  'staff.invite','staff.respond','staff.remove','shift.start','shift.end','merchant.settings',
  'refund.decide','notification.read','profile.update','security.pin','support.create',
  'recovery.save','recovery.finish','money.record','group.cancel',
  'merchant.create','shop.create','request.create','merchant.close','shop.discovery','favourite.save','favourite.delete',
  'person.request.create','person.request.pay','person.request.cancel','learning.save','chat.clear',
  'money.archive','schedule.create','schedule.cancel','security.session.revoke',
]);
const MONEY_COMMANDS = new Set([...CORE_MONEY, ...EXTENDED_MUTATIONS]);
const SECRET_KEYS = new Set(['pin','partnerCode','oldPin','newPin']);
const PIN_COMMANDS = new Set(['group.contribute','group.payout.request','group.payout.approve',
  'box.save','box.withdraw','iou.pay','box.partner.respond','box.release.decide','refund.decide','group.cancel','person.request.pay','schedule.create','schedule.cancel','security.session.revoke']);
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ATTEMPT = /^[A-Za-z0-9_.:-]{10,100}$/;
const clone = value => JSON.parse(JSON.stringify(value));
const plain = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const canonical = value => JSON.stringify(value, (key, item) => plain(item) ? Object.fromEntries(Object.keys(item).sort().map(k => [k,item[k]])) : item);
// Node adapters share this mutex only inside one process and for the same storage object.
// Browsers must use Web Locks. Native/multi-process hosts must inject a LockManager-compatible
// adapter whose exclusive lease covers every context that can access the pending storage.
const processLocks = new WeakMap();
function inProcessLocks(storage) {
  if (processLocks.has(storage)) return processLocks.get(storage);
  const tails = new Map();
  const manager = { async request(name, options, work) {
    if (options.mode !== 'exclusive') throw error('LOCK_UNAVAILABLE');
    const previous = tails.get(name) || Promise.resolve();
    let release;
    const current = new Promise(resolve => { release = resolve; });
    tails.set(name, current);
    await previous;
    try { return await work({ name, mode: 'exclusive' }); }
    finally { release(); if (tails.get(name) === current) tails.delete(name); }
  } };
  processLocks.set(storage, manager);
  return manager;
}
const messages = {
  SIGN_IN_REQUIRED: 'Sign in to your Lumo account first.',
  AUTH_REQUIRED: 'Sign in again to continue. Your saved payment is kept.',
  SESSION_CHANGED: 'The signed-in account changed. Open the original account to check its payment.',
  NETWORK_ERROR: 'The connection was interrupted. Check the saved original request before paying again.',
  BAD_RESPONSE: 'Lumo could not verify the response. Keep the saved request and check it again.',
  PENDING_PAYMENT: 'Check your saved original request before starting another money move.',
  LOCK_UNAVAILABLE: 'This app cannot safely coordinate payment requests. Reopen it in a supported browser or app.',
  STORAGE_ERROR: 'The original request could not be saved safely. Keep your app data and check it before paying again.',
  JOURNAL_CORRUPT: 'The saved request could not be read safely. Keep your app data and check the original payment.',
  INVALID_INPUT: 'Check the payment details and try again.',
  RECEIPT_MISMATCH: 'The receipt does not match the saved request. Check the original payment before paying again.',
  INSUFFICIENT_FUNDS: 'There is not enough available money for this payment.',
  PIN_INVALID: 'That payment PIN does not match. Your saved request is kept.',
  PIN_REQUIRED: 'Enter your payment PIN to authorise this request.',
  PIN_LOCKED: 'Payment PIN attempts are temporarily locked. Check the original request when you can authorise again.',
  REQUEST_UNAVAILABLE: 'This payment request is no longer available. Ask the merchant for a fresh QR.',
};

export class LumoClientError extends Error {
  constructor(code, { status = 0, definitive = false, attemptId = null } = {}) {
    super(messages[code] || 'Lumo could not complete this request. Check your account and try again.');
    this.name = 'LumoClientError';
    this.code = typeof code === 'string' && /^[A-Z0-9_]{1,70}$/.test(code) ? code : 'REQUEST_FAILED';
    this.status = status;
    this.definitive = definitive === true;
    this.attemptId = typeof attemptId === 'string' && ATTEMPT.test(attemptId) ? attemptId : null;
  }
}

function error(code, extra) { return new LumoClientError(code, extra); }
function validatePublicKey(key) {
  if (typeof key !== 'string' || key.length < 16) throw error('INVALID_INPUT');
  if (key.startsWith('sb_publishable_')) return key;
  // Legacy anon keys remain compatible. Reject service-role JWTs and every secret-key form.
  try {
    const payload = JSON.parse(globalThis.atob(key.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')));
    if (payload.role === 'anon') return key;
  } catch { /* handled below */ }
  throw error('INVALID_INPUT');
}
function sessionFrom(result) {
  if (!plain(result) || typeof result.access_token !== 'string' || !result.access_token ||
      typeof result.refresh_token !== 'string' || !result.refresh_token || !plain(result.user) || !UUID.test(result.user.id)) {
    throw error('BAD_RESPONSE');
  }
  return { access_token: result.access_token, refresh_token: result.refresh_token,
    expires_at: Number.isFinite(result.expires_at) ? result.expires_at : null,
    user: { id: result.user.id, ...(typeof result.user.email === 'string' ? { email: result.user.email } : {}) } };
}
function moneyPayload(command, input, makeId) {
  if (!plain(input)) throw error('INVALID_INPUT');
  if (EXTENDED_MUTATIONS.has(command)) {
    const payload = clone(input);
    payload.attemptId ||= makeId();
    if (typeof payload.attemptId !== 'string' || !ATTEMPT.test(payload.attemptId) || JSON.stringify(payload).length > 20000) throw error('INVALID_INPUT');
    if (PIN_COMMANDS.has(command) && (typeof payload.pin !== 'string' || !/^[0-9]{4,6}$/.test(payload.pin))) throw error('PIN_REQUIRED');
    if ('amount' in payload && (!Number.isSafeInteger(payload.amount) || payload.amount < 1 || payload.amount > 1000000)) throw error('INVALID_INPUT');
    for (const key of ['groupId','proposalId','boxId','iouId','shopId','membershipId','releaseId','invitationId','notificationId']) {
      if (key in payload && !UUID.test(payload[key])) throw error('INVALID_INPUT');
    }
    return payload;
  }
  const allowed = {
    'wallet.fund': ['amount', 'confirmSandbox', 'attemptId'],
    transfer: ['recipientHandle', 'amount', 'pin', 'attemptId', 'budgetCategoryId'],
    'payment.pay': ['shopId', 'requestId', 'amount', 'pin', 'attemptId', 'budgetCategoryId'],
    'payment.refund': ['paymentId', 'amount', 'pin', 'attemptId'],
  }[command];
  if (Object.keys(input).some(key => !allowed.includes(key))) throw error('INVALID_INPUT');
  const payload = clone(input);
  payload.attemptId ||= makeId();
  if (typeof payload.attemptId !== 'string' || !ATTEMPT.test(payload.attemptId) || !Number.isSafeInteger(payload.amount) || payload.amount < 1 || payload.amount > 1000000) throw error('INVALID_INPUT');
  if (command === 'wallet.fund') {
    if (payload.confirmSandbox !== true) throw error('INVALID_INPUT');
  } else if (typeof payload.pin !== 'string' || !/^[0-9]{4,6}$/.test(payload.pin)) throw error('INVALID_INPUT');
  if (command === 'transfer') {
    if (typeof payload.recipientHandle !== 'string') throw error('INVALID_INPUT');
    payload.recipientHandle = payload.recipientHandle.trim().toLowerCase();
    if (!/^[a-z][a-z0-9_]{2,29}$/.test(payload.recipientHandle)) throw error('INVALID_INPUT');
  }
  if (command === 'payment.pay' && (!UUID.test(payload.shopId) || payload.requestId != null && !UUID.test(payload.requestId))) throw error('INVALID_INPUT');
  if (command === 'payment.refund' && !UUID.test(payload.paymentId)) throw error('INVALID_INPUT');
  if ('budgetCategoryId' in payload && payload.budgetCategoryId != null && !UUID.test(payload.budgetCategoryId)) throw error('INVALID_INPUT');
  return payload;
}
function savedPayload(payload) { const saved = clone(payload); for (const key of SECRET_KEYS) delete saved[key]; return saved; }
function validPending(value, userId) {
  if (!plain(value) || value.version !== 1 || value.userId !== userId || !MONEY_COMMANDS.has(value.command) ||
      !plain(value.payload) || typeof value.payload.attemptId !== 'string' || !ATTEMPT.test(value.payload.attemptId) || CORE_MONEY.has(value.command) && (!Number.isSafeInteger(value.payload.amount) || value.payload.amount < 1) ||
      typeof value.createdAt !== 'string' || !Number.isFinite(Date.parse(value.createdAt)) ||
      Object.keys(value.payload).some(key => SECRET_KEYS.has(key) || /password|token|secret/i.test(key))) throw error('JOURNAL_CORRUPT');
  try { moneyPayload(value.command, { ...value.payload, ...(value.command === 'wallet.fund' ? {} : { pin: '1234' }) }, () => { throw error('JOURNAL_CORRUPT'); }); }
  catch { throw error('JOURNAL_CORRUPT'); }
  return value;
}

/**
 * Browser money operations require navigator.locks (secure context), otherwise they fail closed.
 * A native or multi-process host must pass lockManager.request(name, {mode:'exclusive'}, callback).
 * That adapter must hold the named exclusive lease across every journal-sharing context until
 * callback's promise settles, passing {name, mode:'exclusive'}. It must never run the callback
 * after a rejected acquisition. Node's default mutex covers only this process and storage object;
 * persistent storage shared with other processes requires an injected OS/distributed lease.
 */
export class LumoClient {
  constructor({ url, publishableKey, fetch: transport = globalThis.fetch, pendingStorage,
    onSessionChange = () => {}, makeAttemptId = () => globalThis.crypto.randomUUID(), timeoutMs = 20000, lockManager } = {}) {
    let origin;
    try { origin = new URL(url); } catch { throw error('INVALID_INPUT'); }
    if (origin.protocol !== 'https:' || origin.username || origin.password || origin.search || origin.hash || origin.pathname !== '/') throw error('INVALID_INPUT');
    if (typeof transport !== 'function' || !pendingStorage || ['getItem', 'setItem', 'removeItem'].some(key => typeof pendingStorage[key] !== 'function')) throw error('INVALID_INPUT');
    this.url = origin.origin;
    this.key = validatePublicKey(publishableKey);
    this.fetch = transport;
    this.storage = pendingStorage;
    this.lockManager = lockManager === undefined
      ? globalThis.navigator?.locks || (globalThis.process?.versions?.node ? inProcessLocks(pendingStorage) : null)
      : lockManager;
    this.onSessionChange = onSessionChange;
    this.makeAttemptId = makeAttemptId;
    this.timeoutMs = timeoutMs;
    this._session = null;
    this._refreshing = null;
    this._moneyBusy = false;
    this._authGeneration = 0;
    this._heldPending = new Map();
  }
  get user() { return this._session ? clone(this._session.user) : null; }
  get signedIn() { return !!this._session; }
  async _installSession(session, generation) {
    if (generation !== this._authGeneration) throw error('SESSION_CHANGED');
    this._session = session;
    try { await this.onSessionChange(session ? clone(session) : null); }
    catch { throw error('STORAGE_ERROR'); }
    if (generation !== this._authGeneration) throw error('SESSION_CHANGED');
  }
  async _raw(path, { token, body, method = 'POST' } = {}) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    try {
      const response = await this.fetch(this.url + path, { method, redirect: 'error', signal: controller.signal,
        headers: { apikey: this.key, Accept: 'application/json', ...(body === undefined ? {} : { 'Content-Type': 'application/json' }), ...(token ? { Authorization: 'Bearer ' + token } : {}) },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
      let result;
      if (response.status === 204) result = {};
      else { try { result = await response.json(); } catch { throw error('BAD_RESPONSE', { status: response.status }); } }
      if (!response.ok) throw error(response.status === 401 ? 'AUTH_REQUIRED' : 'REQUEST_FAILED', { status: response.status });
      if (!plain(result)) throw error('BAD_RESPONSE', { status: response.status });
      return result;
    } catch (failure) {
      if (failure instanceof LumoClientError) throw failure;
      throw error('NETWORK_ERROR');
    } finally { clearTimeout(timer); }
  }
  async signIn(email, password) {
    if (typeof email !== 'string' || !email.includes('@') || typeof password !== 'string' || !password) throw error('INVALID_INPUT');
    const generation = ++this._authGeneration;
    const session = sessionFrom(await this._raw('/auth/v1/token?grant_type=password', { body: { email, password } }));
    await this._installSession(session, generation);
    return this.user;
  }
  /** Restore only after verifying the cached token with Auth; JWT decoding is never identity verification. */
  async restoreSession(cached) {
    const candidate = sessionFrom(cached), generation = ++this._authGeneration;
    let session = candidate;
    try {
      const user = await this._raw('/auth/v1/user', { token: candidate.access_token, method: 'GET' });
      if (user.id !== candidate.user.id) throw error('SESSION_CHANGED');
      session = sessionFrom({ ...candidate, user });
    } catch (failure) {
      if (!(failure instanceof LumoClientError) || failure.status !== 401) throw failure;
      session = sessionFrom(await this._raw('/auth/v1/token?grant_type=refresh_token', { body: { refresh_token: candidate.refresh_token } }));
      if (session.user.id !== candidate.user.id) throw error('SESSION_CHANGED');
    }
    await this._installSession(session, generation);
    return this.user;
  }
  async refreshSession() {
    if (this._refreshing) return this._refreshing;
    if (!this._session) throw error('SIGN_IN_REQUIRED');
    const original = this._session, generation = this._authGeneration;
    this._refreshing = (async () => {
      const next = sessionFrom(await this._raw('/auth/v1/token?grant_type=refresh_token', { body: { refresh_token: original.refresh_token } }));
      if (next.user.id !== original.user.id) throw error('SESSION_CHANGED');
      await this._installSession(next, generation);
      return this.user;
    })();
    try { return await this._refreshing; } finally { this._refreshing = null; }
  }
  async signOut() {
    const original = this._session;
    const generation = ++this._authGeneration;
    this._session = null;
    try { if (original) await this._raw('/auth/v1/logout?scope=local', { token: original.access_token }); }
    catch (failure) {
      // Another window may already have revoked this exact session. The local
      // sign-out still completes, and an already invalid token is not an error.
      if (!(failure instanceof LumoClientError) || ![401,403].includes(failure.status)) throw failure;
    }
    finally {
      // A later sign-in owns host session storage. This old logout must never clear it.
      if (generation === this._authGeneration) {
        try { await this.onSessionChange(null); } catch { throw error('STORAGE_ERROR'); }
      }
    }
    // Pending references deliberately remain for the same account after sign-in.
  }
  _owner() { if (!this._session) throw error('SIGN_IN_REQUIRED'); return this._session.user.id; }
  _assertOwner(owner) { if (this._owner() !== owner) throw error('SESSION_CHANGED'); }
  async _rpc(command, payload, owner = this._owner()) {
    this._assertOwner(owner);
    const oldToken = this._session.access_token;
    let result;
    try { result = await this._raw('/rest/v1/rpc/lumo_rpc', { token: oldToken, body: { p_command: command, p_payload: payload } }); }
    catch (failure) {
      if (!(failure instanceof LumoClientError) || failure.status !== 401) throw failure;
      this._assertOwner(owner);
      if (this._session.access_token === oldToken) await this.refreshSession();
      this._assertOwner(owner);
      result = await this._raw('/rest/v1/rpc/lumo_rpc', { token: this._session.access_token, body: { p_command: command, p_payload: payload } });
    }
    this._assertOwner(owner);
    if (result.ok !== true) {
      if (result.ok !== false) throw error('BAD_RESPONSE');
      const detail = plain(result.error) ? result.error : result;
      throw error(detail.code || 'REQUEST_FAILED', { definitive: detail.definitive === true || result.definitive === true, attemptId: result.attemptId || detail.attemptId });
    }
    if (result.sandbox !== true || result.currency !== 'GHS') throw error('BAD_RESPONSE');
    return clone(result);
  }
  _pendingKey(owner) { return 'lumo.pending.v1.' + new URL(this.url).host + '.' + owner; }
  async _withMoneyLock(owner, work) {
    const name = 'lumo.money.v1.' + new URL(this.url).host + '.' + owner;
    if (!this.lockManager || typeof this.lockManager.request !== 'function') throw error('LOCK_UNAVAILABLE');
    let entered = false;
    try {
      return await this.lockManager.request(name, { mode: 'exclusive' }, async lock => {
        if (!lock || lock.name !== name || lock.mode !== 'exclusive') throw error('LOCK_UNAVAILABLE');
        entered = true;
        this._assertOwner(owner);
        return await work();
      });
    } catch (failure) {
      if (failure instanceof LumoClientError) throw failure;
      throw error(entered ? 'REQUEST_FAILED' : 'LOCK_UNAVAILABLE');
    }
  }
  async getPending() {
    const owner = this._owner(), key = this._pendingKey(owner);
    try {
      const raw = this._heldPending.has(key) ? this._heldPending.get(key) : await this.storage.getItem(key);
      this._assertOwner(owner);
      if (raw == null || raw === '') return null;
      return clone(validPending(JSON.parse(raw), owner));
    } catch (failure) { if (failure instanceof LumoClientError) throw failure; throw error('JOURNAL_CORRUPT'); }
  }
  async _savePending(pending, owner) {
    this._assertOwner(owner);
    const key = this._pendingKey(owner), raw = JSON.stringify(pending);
    try {
      await this.storage.setItem(key, raw);
      if (await this.storage.getItem(key) !== raw) throw error('STORAGE_ERROR');
      this._heldPending.delete(key);
    } catch { this._heldPending.set(key, raw); throw error('STORAGE_ERROR'); }
    this._assertOwner(owner);
  }
  async _clearPending(owner) {
    this._assertOwner(owner);
    const key = this._pendingKey(owner);
    const prior = await this.getPending();
    try {
      await this.storage.removeItem(key);
      if (await this.storage.getItem(key)) throw error('STORAGE_ERROR');
      this._heldPending.delete(key);
    } catch { if (prior) this._heldPending.set(key, JSON.stringify(prior)); throw error('STORAGE_ERROR'); }
    this._assertOwner(owner);
  }
  _verifyReceipt(pending, result) {
    const receipt = result.receipt, account = result.account, payload = pending.payload;
    const extended = EXTENDED_MUTATIONS.has(pending.command);
    if (extended || pending.command === 'payment.refund' && !receipt) {
      if (result.command !== pending.command || result.attemptId !== payload.attemptId ||
          !plain(account) || !UUID.test(account.id) || account.userId !== pending.userId ||
          account.currency !== 'GHS' || !Number.isSafeInteger(account.balance) || account.balance < 0) throw error('RECEIPT_MISMATCH');
      if (result.bindings !== undefined && (!plain(result.bindings) || canonical(result.bindings) !== canonical(payload))) throw error('RECEIPT_MISMATCH');
      for (const [key, entities] of Object.entries({ groupId:['group'],proposalId:['proposal','refundProposal'],
        boxId:['box','release','hack'],iouId:['iou'],membershipId:['membership'],releaseId:['release'],invitationId:['invitation'],
        notificationId:['notification'],shopId:['shop','request','shift'] })) {
        if (!payload[key]) continue;
        const matches = result.bindings?.[key] === payload[key] || result[key] === payload[key] || result.receipt?.[key] === payload[key] ||
          entities.some(entity => result[entity]?.id === payload[key] || result[entity]?.[key] === payload[key]);
        if (!matches) throw error('RECEIPT_MISMATCH');
      }
      if (pending.command === 'plan.save' && (!plain(result.plan) || !Number.isSafeInteger(result.plan.revision))) throw error('RECEIPT_MISMATCH');
      if (pending.command === 'payment.refund' && (!plain(result.refundProposal) || result.refundProposal.paymentId !== payload.paymentId || result.refundProposal.amount !== payload.amount || result.refundProposal.status !== 'pending')) throw error('RECEIPT_MISMATCH');
      const expectedType = {'group.contribute':'group_contribution','group.payout.approve':'group_payout','group.cancel':'group_refund',
        'box.save':'box_save','box.withdraw':'box_withdraw','iou.pay':'iou_payment','refund.decide':'refund','person.request.pay':'transfer'}[pending.command];
      const receipts = [...(receipt ? [receipt] : []), ...(Array.isArray(result.receipts) ? result.receipts : [])];
      if (['group.contribute','box.save','box.withdraw','iou.pay','person.request.pay'].includes(pending.command) && !receipt) throw error('RECEIPT_MISMATCH');
      for (const posting of receipts) {
        if (!plain(posting) || !UUID.test(posting.id) || posting.status !== 'posted' || posting.sandbox !== true || posting.currency !== 'GHS' ||
            posting.actorUserId !== pending.userId || posting.type !== expectedType || !UUID.test(posting.payerAccountId) || !UUID.test(posting.payeeAccountId) ||
            !Number.isSafeInteger(posting.amount) || posting.amount < 1 || typeof posting.reference !== 'string' || !posting.reference ||
            payload.amount != null && pending.command !== 'group.cancel' && posting.amount !== payload.amount) throw error('RECEIPT_MISMATCH');
        if (['group.contribute','box.save','iou.pay','person.request.pay'].includes(pending.command) && posting.payerAccountId !== account.id ||
            pending.command === 'box.withdraw' && posting.payeeAccountId !== account.id) throw error('RECEIPT_MISMATCH');
        if (pending.command === 'person.request.pay' && posting.personalRequestId !== payload.requestId) throw error('RECEIPT_MISMATCH');
        for (const key of ['groupId','boxId','iouId','proposalId']) if (payload[key] && posting[key] !== payload[key]) throw error('RECEIPT_MISMATCH');
      }
      return;
    }
    const expectedType = { 'wallet.fund': 'test_funding', transfer: 'transfer', 'payment.pay': 'merchant_payment', 'payment.refund': 'refund' }[pending.command];
    if (result.attemptId !== payload.attemptId || !plain(receipt) || !UUID.test(receipt.id) ||
        receipt.type !== expectedType || receipt.status !== 'posted' || receipt.sandbox !== true || receipt.currency !== 'GHS' ||
        typeof receipt.reference !== 'string' || !receipt.reference || receipt.amount !== payload.amount || receipt.actorUserId !== pending.userId ||
        !plain(account) || !UUID.test(account.id) || account.userId !== pending.userId || account.currency !== 'GHS' || !Number.isSafeInteger(account.balance) || account.balance < 0) throw error('RECEIPT_MISMATCH');
    if (pending.command === 'wallet.fund' && receipt.payeeAccountId !== account.id ||
        ['transfer', 'payment.pay'].includes(pending.command) && receipt.payerAccountId !== account.id ||
        pending.command === 'transfer' && receipt.recipientHandle !== payload.recipientHandle.toLowerCase() ||
        pending.command === 'payment.pay' && (receipt.shopId !== payload.shopId || (receipt.requestId || null) !== (payload.requestId || null)) ||
        pending.command === 'payment.refund' && receipt.originalPaymentId !== payload.paymentId) throw error('RECEIPT_MISMATCH');
  }
  async _submitPending(pending, credentials, owner) {
    try {
      const secrets = typeof credentials === 'string' ? { pin: credentials } : plain(credentials) ? credentials : {};
      const supplied = Object.fromEntries(Object.entries(secrets).filter(([key]) => SECRET_KEYS.has(key)));
      const result = await this._rpc(pending.command, { ...pending.payload, ...supplied }, owner);
      this._verifyReceipt(pending, result);
      await this._clearPending(owner);
      this._assertOwner(owner);
      return result;
    } catch (failure) {
      if (failure instanceof LumoClientError && failure.definitive && failure.attemptId === pending.payload.attemptId) await this._clearPending(owner);
      throw failure;
    }
  }
  async command(command, payload = {}) {
    if (typeof command !== 'string' || !/^[a-z][a-z.]{1,50}$/.test(command) || !plain(payload)) throw error('INVALID_INPUT');
    if (!MONEY_COMMANDS.has(command)) return this._rpc(command, payload);
    if (this._moneyBusy) throw error('PENDING_PAYMENT');
    this._moneyBusy = true;
    try {
      const owner = this._owner();
      const body = moneyPayload(command, payload, this.makeAttemptId);
      return await this._withMoneyLock(owner, async () => {
        if (await this.getPending()) throw error('PENDING_PAYMENT');
        const pending = { version: 1, userId: owner, command, payload: savedPayload(body), createdAt: new Date().toISOString() };
        await this._savePending(pending, owner);
        return await this._submitPending(pending, Object.fromEntries(Object.entries(body).filter(([key]) => SECRET_KEYS.has(key))), owner);
      });
    } finally { this._moneyBusy = false; }
  }
  async retryPending(credentials) {
    if (this._moneyBusy) throw error('PENDING_PAYMENT');
    this._moneyBusy = true;
    try {
      const owner = this._owner();
      return await this._withMoneyLock(owner, async () => {
        const pending = await this.getPending();
        if (!pending) throw error('INVALID_INPUT');
        const pin = typeof credentials === 'string' ? credentials : credentials?.pin;
        if ((CORE_MONEY.has(pending.command) && pending.command !== 'wallet.fund' || PIN_COMMANDS.has(pending.command)) && (typeof pin !== 'string' || !/^[0-9]{4,6}$/.test(pin))) throw error('PIN_REQUIRED');
        // A previous failed storage write may have left only an in-memory unresolved marker.
        // Never send that original request until its durable copy has been verified again.
        await this._savePending(pending, owner);
        return await this._submitPending(pending, credentials, owner);
      });
    } finally { this._moneyBusy = false; }
  }
  async recoverPending() {
    if (this._moneyBusy) throw error('PENDING_PAYMENT');
    this._moneyBusy = true;
    try {
      const owner = this._owner();
      return await this._withMoneyLock(owner, async () => {
        const pending = await this.getPending();
        if (!pending) return { found: false };
        const response = await this._rpc('attempt.lookup', { attemptId: pending.payload.attemptId }, owner);
        if (response.found === false) return response; // An absent attempt does not prove an in-flight POST cannot still commit.
        if (response.found !== true || !plain(response.result)) throw error('BAD_RESPONSE');
        const result = response.result;
        if (result.ok === false) {
          const detail = plain(result.error) ? result.error : result;
          if (detail.definitive !== true && result.definitive !== true || (result.attemptId || detail.attemptId) !== pending.payload.attemptId) throw error('BAD_RESPONSE');
          await this._clearPending(owner);
          throw error(detail.code || 'REQUEST_FAILED', { definitive: true, attemptId: pending.payload.attemptId });
        }
        if (result.ok !== true || result.sandbox !== true || result.currency !== 'GHS') throw error('BAD_RESPONSE');
        this._verifyReceipt(pending, result);
        if (response.account !== undefined && (!plain(response.account) || response.account.userId !== owner || response.account.id !== result.account.id ||
            response.account.currency !== 'GHS' || !Number.isSafeInteger(response.account.balance) || response.account.balance < 0)) throw error('RECEIPT_MISMATCH');
        await this._clearPending(owner);
        this._assertOwner(owner);
        return { ...clone(result), recovered: true, ...(plain(response.account) ? { account: clone(response.account) } : {}) };
      });
    } finally { this._moneyBusy = false; }
  }
  openAccount({ handle, displayName, pin }) {
    if (typeof handle !== 'string' || typeof displayName !== 'string' || typeof pin !== 'string') return Promise.reject(error('INVALID_INPUT'));
    handle = handle.trim().toLowerCase(); displayName = displayName.trim();
    if (!/^[a-z][a-z0-9_]{2,29}$/.test(handle) || !/^[0-9]{4,6}$/.test(pin) || displayName.length < 1 || displayName.length > 80 || /[\p{Cc}<>]/u.test(displayName)) return Promise.reject(error('INVALID_INPUT'));
    return this.command('account.open', { handle, displayName, pin });
  }
  getAccount() { return this.command('account.get'); }
  lookupRecipient(handle) {
    if (typeof handle !== 'string' || !/^[a-z][a-z0-9_]{2,29}$/.test(handle.trim().toLowerCase())) return Promise.reject(error('INVALID_INPUT'));
    return this.command('recipient.lookup', { handle: handle.trim().toLowerCase() });
  }
  fundTestWallet(amount, { confirmSandbox = false, attemptId } = {}) { return this.command('wallet.fund', { amount, confirmSandbox, ...(attemptId ? { attemptId } : {}) }); }
  transfer({ recipientHandle, amount, pin, attemptId, budgetCategoryId }) { return this.command('transfer', { recipientHandle, amount, pin, ...(attemptId ? { attemptId } : {}), ...(budgetCategoryId ? { budgetCategoryId } : {}) }); }
  createMerchant(payload) { return this.command('merchant.create', { ...payload, attemptId: payload.attemptId || this.makeAttemptId() }); }
  getMerchant() { return this.command('merchant.get'); }
  createPaymentRequest(payload) { return this.command('request.create', { ...payload, attemptId: payload.attemptId || this.makeAttemptId() }); }
  quotePayment(payload) { return this.command('payment.quote', payload); }
  payMerchant(payload) { return this.command('payment.pay', payload); }
  refundPayment(payload) { return this.command('payment.refund', payload); }
}

export function createLumoClient(options) { return new LumoClient(options); }
