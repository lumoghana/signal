// A screen lock is local authority to hide a counter, never authority to unlock
// it. The caller must reconcile the server lock and verify a cashier PIN before
// clearing this marker. No PIN or payment data is kept here.
const KEY = 'lumo-counter-screen-lock-v1';
const text = value => typeof value === 'string' && value.length > 0 && value.length <= 160 ? value : null;

export function createCounterLocalLock({storage: suppliedStorage, now = () => Date.now()} = {}) {
  const memory = new Map();
  const storage = () => {
    try { return suppliedStorage === undefined ? globalThis.localStorage : suppliedStorage; }
    catch { return null; }
  };
  function identity(counter, session) {
    const counterId = text(counter?.id), sessionId = text(session?.id);
    const businessId = text(session?.businessId), shopId = text(counter?.shopId);
    if (!counterId || !sessionId || !businessId || !shopId || session.counterId !== counterId) return null;
    const expiry = Date.parse(session.expiresAt || '');
    if (!Number.isFinite(expiry) || expiry <= now()) return null;
    if (counter.businessId && counter.businessId !== businessId) return null;
    if (!Array.isArray(session.shopIds) || !session.shopIds.includes(shopId)) return null;
    return {businessId, sessionId, counterId, shopId};
  }
  const stamp = value => JSON.stringify([value.businessId, value.sessionId, value.counterId, value.shopId]);
  function read() {
    try {
      const raw = storage()?.getItem(KEY);
      if (!raw) return {entries: [], corrupt: false};
      const saved = JSON.parse(raw);
      if (saved?.version !== 1 || !Array.isArray(saved.locks) || saved.locks.length > 8) return {entries: [], corrupt: true};
      const valid = saved.locks.every(value => value?.locked === true && ['businessId', 'sessionId', 'counterId', 'shopId'].every(key => text(value[key])));
      return {entries: valid ? saved.locks : [], corrupt: !valid};
    } catch { return {entries: [], corrupt: true}; }
  }
  function write(entries) {
    try {
      const target = storage();
      if (!target) return false;
      if (!entries.length) { target.removeItem(KEY); return target.getItem(KEY) === null; }
      const value = JSON.stringify({version: 1, locks: entries.slice(-8)});
      target.setItem(KEY, value);
      return target.getItem(KEY) === value;
    } catch { return false; }
  }
  function status(counter, session) {
    const current = identity(counter, session);
    if (!current) return {locked: false, pendingServerLock: false, persistent: false};
    const saved = read(), key = stamp(current);
    const persisted = saved.entries.some(value => stamp(value) === key);
    // A damaged existing marker is never interpreted as permission to reveal
    // receipts. A fresh verified server unlock can replace it safely.
    const locked = memory.has(key) || persisted || saved.corrupt;
    return {locked, pendingServerLock: locked, persistent: persisted};
  }
  function lock(counter, session) {
    const current = identity(counter, session);
    if (!current) throw Object.assign(new Error('Sign in to the current counter before locking it.'), {code: 'COUNTER_IDENTITY_REQUIRED'});
    const key = stamp(current), entry = {...current, locked: true};
    memory.set(key, entry);
    const entries = read().entries.filter(value => stamp(value) !== key);
    const persistent = write([...entries, entry]);
    return {locked: true, pendingServerLock: true, persistent};
  }
  function clear(counter, session) {
    const current = identity(counter, session);
    if (!current) return {locked: false, pendingServerLock: false, persistent: false};
    const key = stamp(current);
    memory.delete(key);
    const persistent = write(read().entries.filter(value => stamp(value) !== key));
    // A failed removal remains locked in memory, so a failed storage write
    // cannot make the live screen disagree with its reload state.
    if (!persistent) memory.set(key, {...current, locked: true});
    return status(counter, session);
  }
  function reset() { memory.clear(); return write([]); }
  return {isLocked: (counter, session) => status(counter, session).locked, status, lock, clear, reset};
}

const local = createCounterLocalLock();
export const isLocked = local.isLocked;
export const status = local.status;
export const lock = local.lock;
export const clear = local.clear;
export const reset = local.reset;
