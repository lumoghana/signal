/** Shared transport for the approved experience. No local state is uploaded. */
import {MAINTENANCE_ACTIONS} from './money-maintenance-model.js';
export const APPROVED_CONFIG = Object.freeze({
  url: 'https://iwutbrljiiodamtyoorg.supabase.co',
  publishableKey: 'sb_publishable_4dmChQek8k-opkVhO4N_KA_TCGVjWi6',
  luxUrl: 'https://lumo-connected-pilot.vercel.app/api/lux',
  webSessionUrl: '/api/web-session',
  webSessionOrigin: 'https://lumo-connected-pilot.vercel.app',
});
const SESSION_KEY = 'lumo-approved-session-v1';
const PENDING_KEY = 'lumo-approved-pending-v1';
const MODE_KEY = 'lumo-approved-sample-v1';
const terminalAuth = new Set(['SESSION_REVOKED','SESSION_INVALID','SESSION_EXPIRED','USER_BANNED','USER_DELETED','ACCOUNT_DISABLED']);
const sessionStamp = value => (value?.access_token||value?.webSessionId) && value?.user?.id ? JSON.stringify([value.user.id,value.lumoAuthGeneration || value.webSessionId || `legacy:${value.refresh_token || value.access_token}`]) : '';
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
const finalRejections = new Set(['MAINTENANCE_ACTION_REQUIRED','ORIGIN_NOT_ALLOWED','REQUEST_TOO_LARGE','SERVICE_PAUSED','DOMAIN_REJECTED','INVALID_INPUT','FORBIDDEN','AUTH_REQUIRED','SESSION_REVOKED','PILOT_REQUIRED','ACCOUNT_REQUIRED','ACCOUNT_UNAVAILABLE','PIN_REQUIRED','INSUFFICIENT_FUNDS','WALLET_LIMIT','RECIPIENT_NOT_FOUND','PROVIDER_UNAVAILABLE','PROVIDER_OUTCOME_FORBIDDEN','SELF_TRANSFER','SELF_REQUEST','INVALID_MEMBER','FEE_CHANGED','AMOUNT_CHANGED','REQUEST_UNAVAILABLE','MERCHANT_DETAILS_CHANGED','PAYOUT_CHANGED','REFUND_SOURCE_UNAVAILABLE','PILOT_LIMIT','CONFIRMED_RECEIPT_REQUIRED','RECEIPT_ALREADY_MATCHED','PARTNER_NOT_FOUND','PARTNER_CHANGED','INVALID_PARTNER','DEVICE_PROOF_INVALID','UNBACKED_STATE','STATE_RECOVERY_REQUIRED','INVALID_ACTIVATION_CHECKPOINT','ACTIVATION_STEP_UNAVAILABLE','ACTIVATION_ALREADY_COMPLETE']);

export function createApprovedService({ config = APPROVED_CONFIG, fetch: transport = globalThis.fetch, storage = globalThis.localStorage, modeStorage = globalThis.sessionStorage, lockManager = globalThis.navigator?.locks, eventTarget = globalThis.window, onSnapshot = () => {} } = {}) {
  const cookieMode=config.webSession===true||config.webSession!==false&&config.webSessionUrl&&globalThis.location?.origin===config.webSessionOrigin;
  const cookieSession=value=>object(value)&&value.transport==='http-only'&&/^[a-f0-9]{32}$/.test(value.webSessionId||'')&&/^[a-f0-9]{24}$/.test(value.webSessionVersion||'')&&typeof value.user?.id==='string';
  const hydrate=value=>cookieMode&&cookieSession(value)?{...value,access_token:'http-only',refresh_token:'http-only:'+value.webSessionVersion}:value;
  const publicStored=value=>cookieMode&&cookieSession(value)?Object.fromEntries(Object.entries(value).filter(([key])=>!['access_token','refresh_token'].includes(key))):value;
  let session = hydrate(read(storage, SESSION_KEY, null)), sample = read(modeStorage, MODE_KEY, false) === true;
  let account=null,partnerRequests=[],capabilities={};
  let queue = Promise.resolve(), refreshing = null, authEpoch = 0;
  let storedStamp = sessionStamp(session);
  const authListeners = new Set();
  const notifyAuth = reason => { for (const listener of authListeners) { try { listener({reason}); } catch {} } };
  function clearLocalAuth(reason) {
    session=null;account=null;partnerRequests=[];capabilities={};++authEpoch;refreshing=null;
    notifyAuth(reason);
  }
  function syncAuth() {
    const saved=read(storage,SESSION_KEY,null),stamp=sessionStamp(saved);
    if(stamp!==storedStamp){storedStamp=stamp;clearLocalAuth('ACCOUNT_CHANGED');return false;}
    // A refresh in another tab may rotate tokens without changing the login generation.
    if(session && saved && sessionStamp(session)===stamp)session=hydrate(saved);
    return true;
  }
  async function saveSession(value,{newIdentity=false,epoch=authEpoch,expectedStamp=storedStamp,expectedRefreshToken}={}) {
    if(typeof lockManager?.request!=='function')return false;
    const generation=session?.lumoAuthGeneration&&!session.lumoAuthGeneration.startsWith('legacy:')?session.lumoAuthGeneration:cookieMode?newAttempt():session?`legacy:${session.refresh_token||session.access_token}`:newAttempt();
    const next=value===null?null:publicStored({...value,lumoAuthGeneration:newIdentity?newAttempt():generation});
    try {
      let entered=false;
      const saved=await lockManager.request(SESSION_KEY,{mode:'exclusive'},()=>{
        entered=true;
        if(epoch!==authEpoch)return false;
        const raw=storage.getItem(SESSION_KEY),persisted=raw===null?null:JSON.parse(raw);
        if(sessionStamp(persisted)!==expectedStamp){syncAuth();return false;}
        // Another tab may have rotated this same login while our HTTP request ran.
        if(expectedRefreshToken!==undefined&&hydrate(persisted)?.refresh_token!==expectedRefreshToken){session=hydrate(persisted);return !!session?.access_token;}
        const encoded=next===null?null:JSON.stringify(next);
        if(next===null)storage.removeItem(SESSION_KEY);else storage.setItem(SESSION_KEY,encoded);
        if(storage.getItem(SESSION_KEY)!==encoded)return false;
        session=hydrate(next);storedStamp=sessionStamp(next);return true;
      });
      return entered&&saved===true;
    }catch{return false;}
  }
  function expireSession() {
    if(!syncAuth())return Promise.resolve(false);
    const expectedStamp=storedStamp;
    // Lock the current page before waiting for another tab's short storage write.
    clearLocalAuth('SESSION_REVOKED');
    return saveSession(null,{epoch:authEpoch,expectedStamp});
  }
  const storageListener=event=>{if(event.key===SESSION_KEY||event.key===null)syncAuth();};
  eventTarget?.addEventListener?.('storage',storageListener);
  const currentOwner = () => session?.user?.id || '';
  const current = (owner, epoch) => syncAuth() && !sample && epoch === authEpoch && currentOwner() === owner;
  const recoveryScope=()=>{const storedOwner=read(storage,SESSION_KEY,null)?.user?.id||'';return storedOwner===currentOwner()?JSON.stringify([authEpoch,currentOwner(),storedOwner]):null;};
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
  async function cookieRequest(path,body,authenticated,options={}) {
    if(typeof lockManager?.request!=='function')throw Error('Secure browser session needs Web Locks.');
    const epoch=authEpoch,initialOwner=currentOwner(),savedIdentity=options.webSessionIdentity;
    return lockManager.request('lumo-web-cookie-network-v1',{mode:'exclusive'},async()=>{
      if(epoch!==authEpoch||!syncAuth()||!savedIdentity&&initialOwner!==currentOwner())return new Response(JSON.stringify(accountChanged()),{status:409});
      const send=async values=>transport(config.webSessionUrl,{method:'POST',headers:{'Content-Type':'application/json','X-Lumo-Web':'1'},body:JSON.stringify(values),signal:options.signal||AbortSignal.timeout(28000),credentials:'same-origin',cache:'no-store',redirect:'error'});
      if(path==='/auth/v1/token?grant_type=refresh_token'&&cookieSession(session)&&body?.refresh_token&&body.refresh_token!==session.refresh_token){
        return new Response(JSON.stringify(publicStored(session)),{status:200});
      }
      if(options.legacyLogout){
        const result=await send({operation:'logout-legacy',legacy:options.legacyLogout});
        return new Response(JSON.stringify(await result.json()),{status:result.status});
      }
      const preflight=async()=>{
        const result=await send({operation:'probe'});if(!result.ok)return null;
        const data=await result.json();if(typeof data.probe!=='string')return null;
        const ack=await send({operation:'probe-ack',probe:data.probe});
        return ack.ok&&(await ack.json()).ok===true?data.probe:null;
      };
      const acknowledge=async next=>{
        const ack=await send({operation:'ack',generation:next.webSessionId,version:next.webSessionVersion,owner:next.user.id});
        return ack.ok&&(await ack.json()).ok===true;
      };
      const cookiesRequired=()=>new Response(JSON.stringify(failure('Open Lumo directly in your browser and allow its secure cookies to sign in.','WEB_COOKIES_REQUIRED')),{status:401});
      if(authenticated&&!savedIdentity&&!cookieSession(session)){
        const old=session;if(!old?.access_token||!old.refresh_token)throw Error('Sign in again.');
        const probe=await preflight();if(!probe)return cookiesRequired();
        const response=await send({operation:'migrate',probe,legacy:{access_token:old.access_token,refresh_token:old.refresh_token,user:{id:old.user.id}}});
        const data=await response.json();
        if(!response.ok||!data.ok||!cookieSession(data.session))return new Response(JSON.stringify(data),{status:response.status});
        // Raw legacy credentials are removed only after the server validated the
        // same account/session, rotated Auth and acknowledged its HttpOnly cookie.
        if(!await acknowledge(data.session))return cookiesRequired();
        if(epoch!==authEpoch||!await saveSession(data.session,{epoch}))return new Response(JSON.stringify(accountChanged()),{status:409});
      }
      const selected=savedIdentity||session;
      const needsProbe=path==='/functions/v1/lumo-approved'&&['login','register'].includes(body?.action);
      const probe=needsProbe?await preflight():null;if(needsProbe&&!probe)return cookiesRequired();
      const response=await send({operation:'proxy',path,...probe?{probe}:{},body:body||{},authenticated:!!authenticated,...cookieSession(selected)?{generation:selected.webSessionId,version:selected.webSessionVersion,owner:selected.user.id}:{}});
      if(response.status===204)return response;
      const data=await response.json();
      const next=cookieSession(data.session)?data.session:cookieSession(data)?data:null;
      if(next){
        if(!await acknowledge(next))return cookiesRequired();
        const newIdentity=path==='/functions/v1/lumo-approved'&&['login','register'].includes(body.action);
        if(epoch!==authEpoch||!await saveSession(next,{epoch,newIdentity}))return new Response(JSON.stringify(accountChanged()),{status:409});
      }
      return new Response(JSON.stringify(data),{status:response.status,headers:{'Content-Type':'application/json'}});
    });
  }
  async function post(path, body, token, options = {}) {
    try {
      const response = cookieMode?await cookieRequest(path,body,!!token||path.startsWith('/auth/v1/'),options):await transport(config.url + path, { method: 'POST', headers: headers(token), body: JSON.stringify(body), signal: AbortSignal.timeout(25000), ...options });
      if (response.status === 204) return { ok: true };
      const data = await response.json();
      if (!data || typeof data !== 'object') return failure('The shared service returned an unreadable response. Try again.');
      if(data.code==='SERVICE_PAUSED'&&data.noMutation===true)return {...data,unknown:false};
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
      if(session?.refresh_token!==refreshToken)return !!session?.access_token;
      if (data.access_token) {
        if (data.user?.id !== owner) return false;
        return await saveSession(data,{epoch,expectedRefreshToken:refreshToken});
      }
      if (!data.unknown) await expireSession();
      return false;
    })().finally(() => { if (refreshing === operation) refreshing = null; });
    refreshing = operation;
    return operation.promise;
  }
  async function request(body, { authenticated = true, owner = currentOwner(), epoch = authEpoch, installSnapshot = true } = {}) {
    const valid = () => syncAuth() && epoch === authEpoch && (!authenticated || !sample && currentOwner() === owner);
    if (authenticated) {
      if (!valid()) return accountChanged();
      if (!session?.access_token) return failure('Sign in to your shared Lumo account to continue.', 'UNAUTHENTICATED');
      if (session.expires_at && session.expires_at * 1000 < Date.now() + 45000 && !await refreshSession(owner, epoch)) {
        if (!valid()) return accountChanged();
        return failure('Sign in again before continuing.', 'UNAUTHENTICATED');
      }
    }
    if (!valid()) return accountChanged();
    const path = body.action === 'action' && MAINTENANCE_ACTIONS.has(body.type) ? '/functions/v1/lumo-maintenance' : '/functions/v1/lumo-approved';
    let data = await post(path, body, authenticated ? session?.access_token : undefined);
    if (!valid()) return accountChanged();
    if(authenticated&&terminalAuth.has(data.code)){await expireSession();return data;}
    let authRetried=false;
    if (authenticated && ['UNAUTHENTICATED', 'AUTH_REQUIRED', 'INVALID_JWT', 'JWT_EXPIRED'].includes(data.code) && await refreshSession(owner, epoch)) {
      authRetried=true;
      if (!valid()) return accountChanged();
      data = await post(path, body, session?.access_token);
    }
    if (!valid()) return accountChanged();
    if(authenticated&&terminalAuth.has(data.code)){await expireSession();return data;}
    if(authenticated&&authRetried&&['UNAUTHENTICATED','AUTH_REQUIRED','INVALID_JWT','JWT_EXPIRED'].includes(data.code)){await expireSession();return data;}
    if(installSnapshot&&(data.session?.access_token||cookieMode&&cookieSession(data.session))){
      if(!(cookieMode&&data.session.webSessionId===session?.webSessionId&&data.session.webSessionVersion===session?.webSessionVersion)&&!await saveSession(data.session,{newIdentity:!authenticated,epoch}))return valid()?failure('Lumo could not safely save your sign-in. Keep this browser open and try signing in again.','SESSION_STORAGE_UNAVAILABLE'):accountChanged();
      if(!valid())return accountChanged();
    }
    if (installSnapshot && data.account) account=data.account;
    if (installSnapshot && object(data.capabilities)) capabilities={...data.capabilities};
    if (installSnapshot && Array.isArray(data.partnerInbox)) partnerRequests=data.partnerInbox;
    if (installSnapshot && Array.isArray(data.inbox)) partnerRequests=body.action==='partnerRespond'?[...partnerRequests.filter(item=>!data.inbox.some(next=>next.id===item.id)),...data.inbox]:data.inbox;
    if (installSnapshot && data.state) onSnapshot(data.state, data);
    return data;
  }
  async function authenticate(action, values) {
    syncAuth();
    if(typeof lockManager?.request!=='function')return failure('This browser cannot safely coordinate shared sign-in. Use a supported browser and try again.','SESSION_STORAGE_UNAVAILABLE');
    const epoch = ++authEpoch;capabilities={};
    sample = false; write(modeStorage, MODE_KEY, false);
    const data = await request({ action, ...values }, { authenticated: false, epoch });
    return data.ok ? { ...data.result, ...data, ok: true, message: data.result?.message || 'You’re signed in.' } : data;
  }
  return {
    get connected() { return !sample; },
    get authVersion() { syncAuth();return authEpoch; },
    get recoveryScope() { syncAuth();return recoveryScope(); },
    get signedIn() { syncAuth();return !!session?.access_token; },
    get user() { syncAuth();return session?.user || null; },
    get account() { syncAuth();return account; },
    get partnerRequests() { syncAuth();return partnerRequests; },
    get capabilities() { syncAuth();return {...capabilities}; },
    subscribeAuth(listener) { authListeners.add(listener);return ()=>authListeners.delete(listener); },
    dispose() { eventTarget?.removeEventListener?.('storage',storageListener);authListeners.clear(); },
    lookupExternalRecipient(values) { return request({action:'externalRecipient',rail:values?.rail,number:values?.number,network:values?.network,bank:values?.bank,name:values?.name}); },
    setSample(value) { const next = value === true; if (sample !== next) ++authEpoch; sample = next; write(modeStorage, MODE_KEY, sample); },
    async socialRequest(body) {
      const friendOperation=['list','save','remove'].includes(body?.operation)||(body?.schemaVersion===2&&['createGroup','renameGroup','deleteGroup'].includes(body?.operation));
      const allowed=body?.action==='friends'&&(body.schemaVersion===undefined||body.schemaVersion===2)&&friendOperation||body?.action==='notifications'&&['list','read'].includes(body.operation);
      if(!allowed)return failure('That friends or notification action is unavailable.','INVALID_INPUT');
      const owner=currentOwner(),epoch=authEpoch,scope=recoveryScope();
      const valid=()=>scope!==null&&current(owner,epoch)&&recoveryScope()===scope;
      if(!owner||!session?.access_token||!valid())return failure('Sign in to use Lumo friends and notifications.','AUTH_REQUIRED');
      if(session.expires_at&&session.expires_at*1000<Date.now()+45000&&!await refreshSession(owner,epoch))return failure('Sign in again to use Lumo friends and notifications.','AUTH_REQUIRED');
      if(!valid())return accountChanged();
      const send=()=>post('/functions/v1/lumo-social',body,session.access_token,{signal:AbortSignal.timeout(12000),credentials:'omit',cache:'no-store',redirect:'error'});
      let data=await send();if(!valid())return accountChanged();
      if(terminalAuth.has(data.code)){await expireSession();return data;}
      let authRetried=false;
      if(['UNAUTHENTICATED','AUTH_REQUIRED','INVALID_JWT','JWT_EXPIRED'].includes(data.code)&&await refreshSession(owner,epoch)){authRetried=true;if(!valid())return accountChanged();data=await send();}
      if(!valid())return accountChanged();
      if(terminalAuth.has(data.code)){await expireSession();return data;}
      if(authRetried&&['UNAUTHENTICATED','AUTH_REQUIRED','INVALID_JWT','JWT_EXPIRED'].includes(data.code)){await expireSession();return data;}
      // These records cannot install sign-in credentials or financial snapshots.
      return {ok:data.ok===true,...(object(data.data)?{data:data.data}:{}),...(data.code?{code:data.code}:{}),...(data.message?{message:data.message}:{}),...(data.unknown===true?{unknown:true}:{})};
    },
    async businessRequest(body) {
      if (!body || !['context','experience','survey'].includes(body.action)) return failure('Pilot feedback is unavailable.', 'INVALID_INPUT');
      const owner=currentOwner(), epoch=authEpoch, scope=recoveryScope();
      const valid=()=>scope!==null && current(owner,epoch) && recoveryScope()===scope;
      if (!owner || !session?.access_token || !valid()) return failure('Sign in to use pilot feedback.', 'AUTH_REQUIRED');
      if (session.expires_at && session.expires_at*1000 < Date.now()+45000 && !await refreshSession(owner,epoch)) return failure('Sign in again to use pilot feedback.', 'AUTH_REQUIRED');
      if (!valid()) return accountChanged();
      const data=await post('/functions/v1/lumo-business', body, session.access_token, {signal:AbortSignal.timeout(6000), credentials:'omit', cache:'no-store', redirect:'error'});
      if (!valid()) return accountChanged();
      if(terminalAuth.has(data.code)){await expireSession();return data;}
      // Feedback responses must never install credentials or financial snapshots.
      return {ok:data.ok===true, ...(data.data && typeof data.data==='object'?{data:data.data}:{}), ...(data.code?{code:data.code}:{}), ...(data.message?{message:data.message}:{})};
    },
    async passwordRecoveryRequest(operation,values={},options={}) {
      const publicOperations=new Set(['start','faceVerify','smsVerify','keyVerify','complete']);
      const protectedOperations=new Set(['enrollmentStart','enrollmentVerify','keyRotate','faceRemove']);
      if(operation!=='status'&&!publicOperations.has(operation)&&!protectedOperations.has(operation))return failure('That recovery step is unavailable.','INVALID_INPUT');
      if(publicOperations.has(operation)&&options.authenticated===true)return failure('Use the private recovery request for that step.','INVALID_INPUT');
      const authenticated=protectedOperations.has(operation)||operation==='status'&&options.authenticated===true;
      const owner=currentOwner(),epoch=authEpoch,scope=recoveryScope();
      const valid=()=>syncAuth()&&scope!==null&&authEpoch===epoch&&recoveryScope()===scope&&(!authenticated||!sample&&currentOwner()===owner);
      if(authenticated&&(!owner||!session?.access_token||sample))return failure('Sign in before updating recovery options.','AUTH_REQUIRED');
      if(authenticated&&session.expires_at&&session.expires_at*1000<Date.now()+45000&&!await refreshSession(owner,epoch))return failure('Sign in again before updating recovery options.','AUTH_REQUIRED');
      if(!valid())return accountChanged();
      const data=await post('/functions/v1/lumo-access',{...values,module:'consumer',operation},authenticated?session?.access_token:undefined,{credentials:'omit',cache:'no-store',redirect:'error'});
      if(!valid())return accountChanged();
      if(authenticated&&['AUTH_REQUIRED',...terminalAuth].includes(data.code))await expireSession();
      // Recovery cannot install a session, account projection or money snapshot.
      return data;
    },
    login(handle, password) { return authenticate('login', { handle, password }); },
    register(values) { return authenticate('register', values); },
    async signOut() {
      syncAuth();
      const token = session?.access_token;
      const webSessionIdentity=cookieMode&&cookieSession(session)?publicStored(session):null;
      const legacyLogout=cookieMode&&!webSessionIdentity&&session?.user?.id?{access_token:session.access_token,refresh_token:session.refresh_token,user:{id:session.user.id}}:null;
      const expectedStamp=storedStamp;
      clearLocalAuth('SIGNED_OUT');
      const epoch=authEpoch;
      const localCleanup=token?saveSession(null,{epoch,expectedStamp}):Promise.resolve(true);
      // The journal is already scoped by immutable account ID. A late or unknown
      // payment must keep its original reference across sign-out and account switches.
      const [localCleared,remote]=await Promise.all([localCleanup,token?post('/auth/v1/logout?scope=local',{},token,webSessionIdentity?{webSessionIdentity}:legacyLogout?{legacyLogout}:{}):{ok:true}]);
      if (epoch !== authEpoch) return accountChanged();
      if (!localCleared) return failure('Lumo could not clear the saved session. Keep this browser private and try again before leaving it.', 'SIGNOUT_UNCONFIRMED', { remoteRevoked: remote.ok === true });
      return { ok: true, pendingLogout: !remote.ok, localCleared };
    },
    snapshot() { return request({ action: 'snapshot' }); },
    async askLux(question, context, { signal } = {}) {
      const owner=currentOwner(),epoch=authEpoch;
      if(!owner || sample) return failure('Sign in to use connected Ask Lux.', 'UNAUTHENTICATED');
      if(session.expires_at && session.expires_at*1000<Date.now()+45000 && !await refreshSession(owner,epoch)) return failure('Sign in again to ask Lux.', 'UNAUTHENTICATED');
      if(!current(owner,epoch)) return accountChanged();
      const send=async()=>{
        try {
          const timeout=AbortSignal.timeout(28000);
          const combined=signal && typeof AbortSignal.any==='function'?AbortSignal.any([signal,timeout]):timeout;
          if(signal?.aborted) return failure('Question cancelled.', 'CANCELLED');
          const response=cookieMode?await cookieRequest('/api/lux',{question,context},true,{signal:combined}):await transport(config.luxUrl||APPROVED_CONFIG.luxUrl,{method:'POST',headers:{'Content-Type':'application/json',Authorization:`Bearer ${session.access_token}`},body:JSON.stringify({question,context}),signal:combined,redirect:'error'});
          const data=await response.json();
          return object(data) ? data : failure('Lux could not read that reply. Try again.', 'UNAVAILABLE');
        } catch { return failure('I couldn’t connect to Lux. Try again; your question has not moved any money.', signal?.aborted?'CANCELLED':'LUX_UNAVAILABLE'); }
      };
      let data=await send();
      if(!current(owner,epoch)) return accountChanged();
      if(terminalAuth.has(data.code)){await expireSession();return data;}
      let authRetried=false;
      if(data.code==='UNAUTHENTICATED' && await refreshSession(owner,epoch)) { authRetried=true;if(!current(owner,epoch)) return accountChanged();data=await send(); }
      if(!current(owner,epoch)) return accountChanged();
      if(terminalAuth.has(data.code)||authRetried&&data.code==='UNAUTHENTICATED'){await expireSession();return data;}
      if(data.ok && data.owner!==owner) return accountChanged();
      if(signal?.aborted) return failure('Question cancelled.', 'CANCELLED');
      // Install a fresh, authenticated projection through the normal account path.
      // Chat never uploads a local wallet or touches the money-command journal.
      if(data.ok && data.state && data.account?.userId===owner && data.sandbox===true && data.currency==='GHS') { account=data.account;onSnapshot(data.state,data); }
      else if(data.ok){const latest=await request({action:'snapshot'},{owner,epoch});if(!current(owner,epoch))return accountChanged();if(!latest.ok)return failure('I couldn’t refresh your money. Try again before relying on a number.','RECORDS_UNAVAILABLE');}
      return data;
    },
    loyalty(operation, payload = {}, options = {}) {
      const allowed = new Set(['list','detail','programme','join','claim','prepare','cancel','recover']);
      if (!allowed.has(operation) || !object(payload)) return Promise.resolve(failure('That loyalty step is unavailable.', 'INVALID_INPUT'));
      let clean;
      try { clean = clone(payload); if (JSON.stringify(withoutSecrets(clean)) !== JSON.stringify(clean)) throw Error('Credentials'); }
      catch { return Promise.resolve(failure('Use only the programme details for this step.', 'INVALID_INPUT')); }
      const mutating = ['join','claim','prepare','cancel'].includes(operation), attemptId = options?.attemptId;
      if (mutating && (typeof attemptId !== 'string' || !/^[A-Za-z0-9_.:-]{10,120}$/.test(attemptId))) return Promise.resolve(failure('Keep the original loyalty request reference and try again.', 'INVALID_INPUT'));
      // Loyalty is an account-scoped merchant projection. It cannot install a
      // sign-in, wallet snapshot, capability list or partner inbox.
      return request({action:'loyalty',operation,payload:clean,...(attemptId?{attemptId}:{})},{installSnapshot:false});
    },
    quote(values) { return request({ action: 'quote', ...values }); },
    async guestMerchantQuote(link) {
      if(typeof link!=='string'||! /^[a-f0-9]{64}$/.test(link))return failure('Use a current merchant payment link.','INVALID_INPUT');
      const epoch=authEpoch,started=session;
      const data=await post('/functions/v1/lumo-approved',{action:'guestCheckout',operation:'quote',link},undefined,{credentials:'omit',cache:'no-store',redirect:'error'});
      if(authEpoch!==epoch||session!==started)return accountChanged();
      // Public lookup data never enters the consumer session or money snapshot.
      return data;
    },
    serviceStatus() { return request({action:'serviceStatus'},{authenticated:false}); },
    merchantDirectory() { return request({action:'merchant',path:'/api/directory',method:'GET'},{authenticated:false}); },
    caseInbox(operation='list',payload={}) { return request({action:'caseInbox',operation,page:payload.page,pageSize:payload.pageSize,notificationId:payload.notificationId,caseId:payload.caseId}); },
    readPartnerInbox() { return request({ action: 'partnerInbox' }); },
    respondPartner(id, decision) { return request({ action: 'partnerRespond', id, decision }); },
    verifyPin(pin) { return request({ action: 'verifyPin', pin }); },
    pinRepairStatus() { return request({ action: 'pinRepairStatus' }); },
    repairTestPin(currentPassword, newPin) {
      if (typeof currentPassword !== 'string' || !currentPassword || currentPassword.length > 128 || typeof newPin !== 'string' || !/^\d{4}$/.test(newPin)) return Promise.resolve(failure('Enter your sign-in password and a new four-digit test PIN.', 'INVALID_INPUT'));
      // This one-time test-account repair is credential step-up, never a queued
      // financial action. Passwords and PINs must not enter the request journal.
      return request({ action: 'repairTestPin', currentPassword, newPin });
    },
    changePin(currentPin, pin) { return request({ action: 'changePin', currentPin, pin }); },
    async resolve(query) {
      const value = String(query || '').trim().replace(/^@/, '');
      if (!value) return failure('Enter their exact Lumo username or registered phone number.', 'INVALID_INPUT');
      return request({ action: 'resolve', query: value });
    },
    searchPeople(query='') {
      if(typeof query!=='string'||query.length>80||/[\u0000-\u001f\u007f]/.test(query))return Promise.resolve(failure('Use a name, Lumo username or full registered phone number.', 'INVALID_INPUT'));
      return request({action:'searchPeople',query:query.trim()});
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
        if (!data.unknown && !reference) {
          const cleared = await withJournalLock(() => current(owner, epoch) && updatePending(pending => { if (pending[signature] === attemptId) delete pending[signature]; }));
          if (!current(owner, epoch)) return { ...accountChanged(), attemptId };
          if (!cleared) return failure('The service replied, but Lumo could not safely save the result. Keep this request reference and check it again.', 'JOURNAL_UNAVAILABLE', { unknown: true, attemptId });
        }
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
