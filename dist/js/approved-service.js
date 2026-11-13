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

export function createApprovedService({ config = APPROVED_CONFIG, fetch: transport = globalThis.fetch, storage = globalThis.localStorage, modeStorage = globalThis.sessionStorage, onSnapshot = () => {} } = {}) {
  let session = read(storage, SESSION_KEY, null), sample = read(modeStorage, MODE_KEY, false) === true;
  let account=null,partnerRequests=[];
  let pending = read(storage, PENDING_KEY, {}), queue = Promise.resolve(), refreshing = null;
  const saveSession = value => { session = value; write(storage, SESSION_KEY, value); };
  const headers = token => ({ 'Content-Type': 'application/json', apikey: config.publishableKey, ...(token ? { Authorization: `Bearer ${token}` } : {}) });
  async function post(path, body, token) {
    try {
      const response = await transport(config.url + path, { method: 'POST', headers: headers(token), body: JSON.stringify(body), signal: AbortSignal.timeout(25000) });
      const data = await response.json();
      if (!data || typeof data !== 'object') return failure('The shared service returned an unreadable response. Try again.');
      if (!response.ok && data.ok !== false) return failure(data.message || data.msg || 'The shared service could not complete this request.', response.status === 401 ? 'UNAUTHENTICATED' : 'UNAVAILABLE');
      return data;
    } catch {
      return failure('We could not confirm the result. Check your connection and try again. The same request will be checked safely.', 'UNKNOWN_OUTCOME', { unknown: true });
    }
  }
  async function refreshSession() {
    if (!session?.refresh_token) return false;
    if (refreshing) return refreshing;
    refreshing = (async () => {
      const data = await post('/auth/v1/token?grant_type=refresh_token', { refresh_token: session.refresh_token });
      if (data.access_token) { saveSession(data); return true; }
      if (!data.unknown) saveSession(null);
      return false;
    })().finally(() => { refreshing = null; });
    return refreshing;
  }
  async function request(body, { authenticated = true } = {}) {
    if (authenticated) {
      if (!session?.access_token) return failure('Sign in to your shared Lumo account to continue.', 'UNAUTHENTICATED');
      if (session.expires_at && session.expires_at * 1000 < Date.now() + 45000) await refreshSession();
    }
    let data = await post('/functions/v1/lumo-approved', body, authenticated ? session?.access_token : undefined);
    if (authenticated && ['UNAUTHENTICATED', 'AUTH_REQUIRED', 'INVALID_JWT', 'JWT_EXPIRED'].includes(data.code) && await refreshSession()) data = await post('/functions/v1/lumo-approved', body, session?.access_token);
    if (data.session?.access_token) saveSession(data.session);
    if (data.account) account=data.account;
    if (Array.isArray(data.partnerInbox)) partnerRequests=data.partnerInbox;
    if (Array.isArray(data.inbox)) partnerRequests=body.action==='partnerRespond'?[...partnerRequests.filter(item=>!data.inbox.some(next=>next.id===item.id)),...data.inbox]:data.inbox;
    if (data.state) onSnapshot(data.state, data);
    return data;
  }
  async function authenticate(action, values) {
    sample = false; write(modeStorage, MODE_KEY, false);
    const data = await request({ action, ...values }, { authenticated: false });
    return data.ok ? { ...data.result, ...data, ok: true, message: data.result?.message || 'You’re signed in.' } : data;
  }
  return {
    get connected() { return !sample; },
    get signedIn() { return !!session?.access_token; },
    get user() { return session?.user || null; },
    get account() { return account; },
    get partnerRequests() { return partnerRequests; },
    setSample(value) { sample = value === true; write(modeStorage, MODE_KEY, sample); },
    login(handle, password) { return authenticate('login', { handle, password }); },
    register(values) { return authenticate('register', values); },
    async signOut() {
      if (session?.access_token) await post('/auth/v1/logout', {}, session.access_token);
      saveSession(null); account=null;partnerRequests=[];pending = {}; write(storage, PENDING_KEY, pending);
      return { ok: true };
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
      const clean = { ...payload };
      for (const key of ['pin', 'actorId', 'participantId']) delete clean[key];
      if(['payment','contributeGroup','executePayout','contributeBox','withdrawBox','fund'].includes(type)){delete clean.outcome;delete clean.status;}
      const reference=payload.idempotencyKey||payload.clientId;
      const signature = JSON.stringify([session?.user?.id, type, reference?{reference}:clean]);
      const attemptId = pending[signature] || (pending[signature] = newAttempt());
      write(storage, PENDING_KEY, pending);
      const run = async () => {
        const data = await request({ action: 'action', type, payload: clean, attemptId, ...(pin ? { pin } : {}) });
        if (!data.unknown && !reference) { delete pending[signature]; write(storage, PENDING_KEY, pending); }
        if (!data.ok) return { ...data.result, ...data, attemptId, ok: false, message: data.message || data.result?.message || 'That change could not be completed.' };
        return { ...data.result, ok: data.result?.ok !== false, state: data.state, revision: data.revision, receipts: data.receipts, account: data.account };
      };
      const operation = queue.then(run, run);
      queue = operation.catch(() => {});
      return operation;
    },
  };
}
