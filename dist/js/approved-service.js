/** Shared transport for the approved experience. No local state is uploaded. */
export const APPROVED_CONFIG = Object.freeze({
  url: 'https://iwutbrljiiodamtyoorg.supabase.co',
  publishableKey: 'sb_publishable_4dmChQek8k-opkVhO4N_KA_TCGVjWi6',
});
const SESSION_KEY = 'lumo-approved-session-v1';
const PENDING_KEY = 'lumo-approved-pending-v1';
const MODE_KEY = 'lumo-approved-sample-v1';
const newAttempt = () => `approved-${globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(36).slice(2)}`}`;
const failure = (message, code = 'UNAVAILABLE', extra = {}) => ({ ok: false, message, code, ...extra });
const read = (storage, key, fallback) => { try { return JSON.parse(storage?.getItem(key) || 'null') ?? fallback; } catch { return fallback; } };
const write = (storage, key, value) => { try { value === null ? storage?.removeItem(key) : storage?.setItem(key, JSON.stringify(value)); } catch {} };
const object = value => !!value && typeof value === 'object' && !Array.isArray(value);
const clone = value => JSON.parse(JSON.stringify(value));
const journalFailure = () => failure('Lumo could not safely save this request reference. No new request was sent. Keep your browser data and try again.', 'JOURNAL_UNAVAILABLE');
const accountChanged = () => failure('Your signed-in account changed. Return to the original account to check this request.', 'ACCOUNT_CHANGED', { unknown: true });
const secretKeys = new Set(['pin','password','currentpassword','newpassword','currentpin','newpin','confirmpin','credential','passwordproof','currentpasswordproof','access_token','refresh_token','deviceproof','authorization','privatekey','servicerolekey']);
const withoutSecrets = value => Array.isArray(value) ? value.map(withoutSecrets) : object(value) ? Object.fromEntries(Object.entries(value).filter(([key]) => !secretKeys.has(key.toLowerCase())).map(([key,item]) => [key,withoutSecrets(item)])) : value;
const finalRejections = new Set(['DOMAIN_REJECTED','INVALID_INPUT','FORBIDDEN','AUTH_REQUIRED','SESSION_REVOKED','PILOT_REQUIRED','ACCOUNT_REQUIRED','ACCOUNT_UNAVAILABLE','PIN_REQUIRED','INSUFFICIENT_FUNDS','WALLET_LIMIT','RECIPIENT_NOT_FOUND','PROVIDER_UNAVAILABLE','PROVIDER_OUTCOME_FORBIDDEN','SELF_TRANSFER','SELF_REQUEST','INVALID_MEMBER','FEE_CHANGED','AMOUNT_CHANGED','REQUEST_UNAVAILABLE','PAYOUT_CHANGED','REFUND_SOURCE_UNAVAILABLE','PILOT_LIMIT','CONFIRMED_RECEIPT_REQUIRED','RECEIPT_ALREADY_MATCHED','PARTNER_NOT_FOUND','PARTNER_CHANGED','INVALID_PARTNER','DEVICE_PROOF_INVALID','UNBACKED_STATE','STATE_RECOVERY_REQUIRED']);

export function createApprovedService({ config = APPROVED_CONFIG, fetch: transport = globalThis.fetch, storage = globalThis.localStorage, modeStorage = globalThis.sessionStorage, lockManager = globalThis.navigator?.locks, onSnapshot = () => {} } = {}) {
  let session = read(storage, SESSION_KEY, null), sample = read(modeStorage, MODE_KEY, false) === true;
  let account=null,partnerRequests=[];
  let queue = Promise.resolve(), refreshing = null, authEpoch = 0;
  const saveSession = value => {
    if (value === null) session = null;
    try {
      const encoded = value === null ? null : JSON.stringify(value);
      if (value === null) storage.removeItem(SESSION_KEY); else storage.setItem(SESSION_KEY, encoded);
      if (storage.getItem(SESSION_KEY) !== encoded) return false;
      session = value; return true;
    } catch { return false; }
  };
  const currentOwner = () => session?.user?.id || '';
  const current = (owner, epoch) => !sample && epoch === authEpoch && currentOwner() === owner;
  async function withJournalLock(work) {
    if (typeof lockManager?.request !== 'function') return false;
    try {
      let entered = false;
      const saved = await lockManager.request(PENDING_KEY, { mode: 'exclusive' }, () => { entered = true; return work(); });
      return entered && saved === true;
    } catch { return false; }
  }
  function readPending() {
    if (typeof storage?.getItem !== 'function') throw Error('Journal unavailable');
    const raw = storage.getItem(PENDING_KEY), saved = raw === null ? {} : JSON.parse(raw);
    if (!object(saved) || Object.values(saved).some(value => typeof value !== 'string' || !/^[A-Za-z0-9_.:-]{10,100}$/.test(value))) throw Error('Journal invalid');
    return saved;
  }
  function updatePending(change) {
    try {
      const saved = readPending();
      change(saved);
      const encoded = JSON.stringify(saved);
      storage.setItem(PENDING_KEY, encoded);
      return storage.getItem(PENDING_KEY) === encoded;
    } catch { return false; }
  }
  const headers = token => ({ 'Content-Type': 'application/json', apikey: config.publishableKey, ...(token ? { Authorization: `Bearer ${token}` } : {}) });
  async function post(path, body, token) {
    try {
      const response = await transport(config.url + path, { method: 'POST', headers: headers(token), body: JSON.stringify(body), signal: AbortSignal.timeout(25000) });
      if (response.status === 204) return { ok: true };
      const data = await response.json();
      if (!data || typeof data !== 'object') return failure('The shared service returned an unreadable response. Try again.');
      if (response.status >= 500) return { ...data, ok: false, code: data.code || 'UNKNOWN_OUTCOME', message: data.message || 'The service could not confirm this result. Keep the same request reference and check again.', unknown: true };
      if (!response.ok && data.ok !== false) return failure(data.message || data.msg || 'The shared service could not complete this request.', response.status === 401 ? 'UNAUTHENTICATED' : 'UNAVAILABLE');
      return data;
    } catch {
      return failure('We could not confirm the result. Check your connection and try again. The same request will be checked safely.', 'UNKNOWN_OUTCOME', { unknown: true });
    }
  }
  async function refreshSession(owner = currentOwner(), epoch = authEpoch) {
    if (!current(owner, epoch) || !session?.refresh_token) return false;
    if (refreshing?.owner === owner && refreshing.epoch === epoch) return refreshing.promise;
    const refreshToken = session.refresh_token;
    const operation = { owner, epoch, promise: null };
    operation.promise = (async () => {
      const data = await post('/auth/v1/token?grant_type=refresh_token', { refresh_token: refreshToken });
      if (!current(owner, epoch)) return false;
      if (data.access_token) {
        if (data.user?.id !== owner) return false;
        return saveSession(data);
      }
      if (!data.unknown) saveSession(null);
      return false;
    })().finally(() => { if (refreshing === operation) refreshing = null; });
    refreshing = operation;
    return operation.promise;
  }
  async function request(body, { authenticated = true, owner = currentOwner(), epoch = authEpoch } = {}) {
    const valid = () => epoch === authEpoch && (!authenticated || !sample && currentOwner() === owner);
    if (authenticated) {
      if (!valid()) return accountChanged();
      if (!session?.access_token) return failure('Sign in to your shared Lumo account to continue.', 'UNAUTHENTICATED');
      if (session.expires_at && session.expires_at * 1000 < Date.now() + 45000 && !await refreshSession(owner, epoch)) {
        if (!valid()) return accountChanged();
        return failure('Sign in again before continuing.', 'UNAUTHENTICATED');
      }
    }
    if (!valid()) return accountChanged();
    let data = await post('/functions/v1/lumo-approved', body, authenticated ? session?.access_token : undefined);
    if (!valid()) return accountChanged();
    if (authenticated && ['UNAUTHENTICATED', 'AUTH_REQUIRED', 'INVALID_JWT', 'JWT_EXPIRED'].includes(data.code) && await refreshSession(owner, epoch)) {
      if (!valid()) return accountChanged();
      data = await post('/functions/v1/lumo-approved', body, session?.access_token);
    }
    if (!valid()) return accountChanged();
    if (data.session?.access_token && !saveSession(data.session)) return failure('Lumo could not safely save your sign-in. Keep this browser open and try signing in again.', 'SESSION_STORAGE_UNAVAILABLE');
    if (data.account) account=data.account;
    if (Array.isArray(data.partnerInbox)) partnerRequests=data.partnerInbox;
    if (Array.isArray(data.inbox)) partnerRequests=body.action==='partnerRespond'?[...partnerRequests.filter(item=>!data.inbox.some(next=>next.id===item.id)),...data.inbox]:data.inbox;
    if (data.state) onSnapshot(data.state, data);
    return data;
  }
  async function authenticate(action, values) {
    const epoch = ++authEpoch;
    sample = false; write(modeStorage, MODE_KEY, false);
    const data = await request({ action, ...values }, { authenticated: false, epoch });
    return data.ok ? { ...data.result, ...data, ok: true, message: data.result?.message || 'You’re signed in.' } : data;
  }
  return {
    get connected() { return !sample; },
    get authVersion() { return authEpoch; },
    get signedIn() { return !!session?.access_token; },
    get user() { return session?.user || null; },
    get account() { return account; },
    get partnerRequests() { return partnerRequests; },
    setSample(value) { const next = value === true; if (sample !== next) ++authEpoch; sample = next; write(modeStorage, MODE_KEY, sample); },
    login(handle, password) { return authenticate('login', { handle, password }); },
    register(values) { return authenticate('register', values); },
    async signOut() {
      const token = session?.access_token;
      const epoch = ++authEpoch;
      const localCleared = saveSession(null); account=null;partnerRequests=[];
      // The journal is already scoped by immutable account ID. A late or unknown
      // payment must keep its original reference across sign-out and account switches.
      const remote = token ? await post('/auth/v1/logout?scope=local', {}, token) : { ok: true };
      if (epoch !== authEpoch) return accountChanged();
      if (!localCleared && !remote.ok) return failure('Lumo could not confirm sign-out or clear the saved session. Keep this browser private and try again.', 'SIGNOUT_UNCONFIRMED');
      return { ok: true, pendingLogout: !remote.ok, localCleared };
    },
    snapshot() { return request({ action: 'snapshot' }); },
    quote(values) { return request({ action: 'quote', ...values }); },
    readPartnerInbox() { return request({ action: 'partnerInbox' }); },
    respondPartner(id, decision) { return request({ action: 'partnerRespond', id, decision }); },
    verifyPin(pin) { return request({ action: 'verifyPin', pin }); },
    changePin(currentPin, pin) { return request({ action: 'changePin', currentPin, pin }); },
    async resolve(query) {
      const value = String(query || '').trim().replace(/^@/, '');
      if (!value) return failure('Enter their exact Lumo username or registered phone number.', 'INVALID_INPUT');
      return request({ action: 'resolve', query: value });
    },
    action(type, payload = {}, { pin } = {}) {
      const owner = currentOwner(), epoch = authEpoch;
      if (!owner) return Promise.resolve(failure('Sign in to your shared Lumo account to continue.', 'UNAUTHENTICATED'));
      let clean;
      try { if (!object(payload)) throw Error('Invalid payload'); clean = clone(payload); }
      catch { return Promise.resolve(failure('Review these details and try again.', 'INVALID_INPUT')); }
      for (const key of ['pin', 'actorId', 'participantId']) delete clean[key];
      if (['password', 'currentPassword', 'newPassword', 'currentPin', 'newPin', 'confirmPin', 'credential', 'passwordProof', 'currentPasswordProof', 'access_token', 'refresh_token', 'deviceProof'].some(key => Object.hasOwn(clean, key))) return Promise.resolve(failure('Use the secure account prompt for credentials.', 'INVALID_INPUT'));
      clean = withoutSecrets(clean);
      if(['payment','contributeGroup','executePayout','contributeBox','withdrawBox','fund'].includes(type)){delete clean.outcome;delete clean.status;}
      const reference=clean.idempotencyKey||clean.clientId;
      const signature = JSON.stringify([owner, type, reference?{reference}:clean]);
      let attemptId;
      // Web Locks are scoped to this origin and serialize journal updates across
      // tabs. Readback alone cannot prevent another tab overwriting an attempt.
      const reservation = withJournalLock(() => current(owner, epoch) && updatePending(pending => { attemptId = pending[signature] || (pending[signature] = newAttempt()); }));
      const run = async () => {
        const saved = await reservation;
        if (!current(owner, epoch)) return { ...accountChanged(), attemptId };
        if (!saved) return journalFailure();
        let data = await request({ action: 'action', type, payload: clean, attemptId, ...(pin ? { pin } : {}) }, { owner, epoch });
        if (!current(owner, epoch)) return { ...accountChanged(), attemptId };
        if (!data.ok && !finalRejections.has(data.code)) data = { ...data, unknown: true };
        if (!data.unknown && !reference && !await withJournalLock(() => updatePending(pending => { if (pending[signature] === attemptId) delete pending[signature]; }))) return failure('The service replied, but Lumo could not safely save the result. Keep this request reference and check it again.', 'JOURNAL_UNAVAILABLE', { unknown: true, attemptId });
        if (!current(owner, epoch)) return { ...accountChanged(), attemptId };
        if (!data.ok) return { ...data.result, ...data, attemptId, ok: false, message: data.message || data.result?.message || 'That change could not be completed.' };
        return { ...data.result, ok: data.result?.ok !== false, state: data.state, revision: data.revision, receipts: data.receipts, account: data.account };
      };
      const operation = queue.then(run, run);
      queue = operation.catch(() => {});
      return operation;
    },
  };
}
