/* Browser workspace adapter. Financial rules live in the shared domain engine. */
import {createBusiness, reduceBusiness, metricsFor} from './domain.js';
const STORAGE_KEY = 'lumo-merchant-demo-v1';
const REGISTERED_KEY = 'lumo-merchant-registered-v1';
const WORKSPACE_KEY = 'lumo-merchant-workspace-v1';
const VERSION = 1;
const listeners = new Set();
const copy = value => JSON.parse(JSON.stringify(value));
const timestamp = () => new Date().toISOString();
const dayKey = value => new Date(value || Date.now()).toISOString().slice(0, 10);
let sequence = 0;
const id = prefix => `${prefix}-${Date.now().toString(36)}-${(++sequence).toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
const requireText = (value, name, max = 120) => {
  const text = String(value ?? '').trim();
  if (!text) throw new Error(`${name} is required.`);
  if (text.length > max) throw new Error(`${name} must be ${max} characters or fewer.`);
  return text;
};
const moneyValue = (value, name = 'Amount') => {
  if (!Number.isSafeInteger(value) || value <= 0 || value > 9999999999) throw new Error(`${name} must be a positive amount in whole pesewas.`);
  return value;
};

function makeSeed() {
  const now = new Date();
  const atDay = (daysAgo, hour = 18, minute = 0) => {
    const date = new Date(now);
    date.setUTCDate(date.getUTCDate() - daysAgo);
    date.setUTCHours(hour, minute, 0, 0);
    return date.toISOString();
  };
  const dayStarted = new Date(now);
  dayStarted.setUTCHours(0, 0, 0, 0);
  const seedTimeScale = Math.min(1, Math.max(0, now.getTime() - dayStarted.getTime() - 1000) / (180 * 60000));
  const ago = minutes => new Date(now.getTime() - minutes * 60000 * seedTimeScale).toISOString();
  const shops = [
    { id: 'night-market', name: 'Night Market', area: 'Night Market', category: 'Food & drinks', lat: 5.6509, lng: -0.1878, code: 'LUM101', color: '#d9f57b', open: true, accepting: true, manager: 'Ama Mensah' },
    { id: 'pentagon', name: 'Pentagon', area: 'Pentagon', category: 'Food & drinks', lat: 5.6535, lng: -0.1845, code: 'LUM102', color: '#cbbdf0', open: true, accepting: true, manager: 'Esi Boateng' },
    { id: 'akuafo', name: 'Akuafo Hall', area: 'Akuafo', category: 'Food & drinks', lat: 5.6490, lng: -0.1936, code: 'LUM103', color: '#f1c9a8', open: true, accepting: true, manager: 'Abena Owusu' }
  ];
  const staff = [
    { id: 'staff-ama', name: 'Ama Mensah', role: 'manager', shopId: 'night-market', active: true, phone: '024 555 0101' },
    { id: 'staff-kojo', name: 'Kojo Asare', role: 'cashier', shopId: 'night-market', active: true, phone: '055 555 0102' },
    { id: 'staff-esi', name: 'Esi Boateng', role: 'manager', shopId: 'pentagon', active: true, phone: '024 555 0201' },
    { id: 'staff-yaw', name: 'Yaw Osei', role: 'cashier', shopId: 'pentagon', active: true, phone: '055 555 0202' },
    { id: 'staff-abena', name: 'Abena Owusu', role: 'manager', shopId: 'akuafo', active: true, phone: '024 555 0301' },
    { id: 'staff-kofi', name: 'Kofi Arthur', role: 'cashier', shopId: 'akuafo', active: true, phone: '055 555 0302' }
  ];
  const names = ['Nana A.', 'Akosua M.', 'Kwame B.', 'Efua S.', 'Kobby A.', 'Adwoa D.', 'Elikem K.', 'Nii T.', 'Abena O.', 'Kweku F.', 'Sena A.', 'Yaw B.'];
  const amounts = [2500, 4500, 3200, 1800, 6500, 4000, 5500, 2200, 7500, 3500, 2800, 5000];
  const transactions = [];
  const closings = [];
  for (let daysAgo = 7; daysAgo >= 1; daysAgo--) {
    shops.forEach((shop, shopIndex) => {
      const transactionIds = [];
      for (let n = 0; n < 7; n++) {
        const txId = `seed-${daysAgo}-${shopIndex}-${n}`;
        const amount = amounts[(n + shopIndex + daysAgo) % amounts.length] + (daysAgo % 3) * 100;
        transactions.push({ id: txId, shopId: shop.id, staffId: staff[shopIndex * 2 + 1].id, payer: names[(n + shopIndex + daysAgo) % names.length], amount, status: 'paid', createdAt: atDay(daysAgo, 10 + n, (n * 7) % 60), reference: `LM${daysAgo}${shopIndex}${String(n + 1).padStart(5, '0')}`, method: n % 3 === 0 ? 'code' : 'qr', requestId: null });
        transactionIds.push(txId);
      }
      const gross = transactions.filter(tx => transactionIds.includes(tx.id)).reduce((sum, tx) => sum + tx.amount, 0);
      closings.push({ id: `close-${daysAgo}-${shopIndex}`, shopId: shop.id, createdAt: atDay(daysAgo, 22, 0), periodStartedAt: atDay(daysAgo, 0, 0), transactionIds, refundIds: [], gross, refunds: 0, net: gross, count: transactionIds.length, by: staff[shopIndex * 2].name });
    });
  }
  shops.forEach((shop, shopIndex) => {
    for (let n = 0; n < 17 - shopIndex * 2; n++) {
      transactions.push({ id: `today-${shopIndex}-${n}`, shopId: shop.id, staffId: staff[shopIndex * 2 + (n % 5 === 0 ? 0 : 1)].id, payer: names[(n + shopIndex) % names.length], amount: amounts[(n + shopIndex) % amounts.length], status: 'paid', createdAt: ago(155 - n * 8 + shopIndex * 2), reference: `LM${shopIndex}${String(n + 201).padStart(6, '0')}`, method: ['qr', 'code', 'qr', 'account'][n % 4], requestId: null });
    }
  });
  transactions.push({ id: 'seed-pending', shopId: 'night-market', staffId: 'staff-kojo', payer: 'Sena A.', amount: 4500, status: 'processing', createdAt: ago(3), reference: 'LM0090081', method: 'qr', requestId: null });
  const refunds = [{ id: 'refund-seed', transactionId: 'today-1-2', shopId: 'pentagon', amount: 1500, status: 'paid', createdAt: ago(32), reason: 'Item unavailable', by: 'Esi Boateng', payer: transactions.find(tx => tx.id === 'today-1-2').payer }];
  const settlements = [
    { id: 'settlement-previous', amount: 150000, fee: 0, createdAt: atDay(1, 22, 15), status: 'paid', destination: 'GCB Bank · 12••••7340', reference: 'LS008041' },
    { id: 'settlement-pending', amount: 50000, fee: 0, createdAt: ago(20), status: 'processing', destination: 'GCB Bank · 12••••7340', reference: 'LS008042' }
  ];
  const paid = transactions.filter(tx => tx.status === 'paid').reduce((sum, tx) => sum + tx.amount, 0);
  return {
    version: VERSION, revision: 0, updatedAt: now.toISOString(),
    business: { name: 'Akua’s Campus Kitchen', ownerName: 'Akua Ofori', accountNumber: '9900123400', bankName: 'GCB Bank', destination: 'GCB Bank · 12••••7340' },
    openingBalance: 1800000 - paid + 1500 + 150000,
    shops, staff, transactions, closings, refunds, settlements,
    requests: [{ id: 'request-seed', shopId: 'night-market', staffId: 'staff-kojo', amount: 3200, description: 'Lunch · takeaway', createdAt: ago(1), expiresAt: new Date(now.getTime() + 14 * 60000).toISOString(), status: 'open' }],
    tickets: [{ id: 'ticket-seed', subject: 'Receiving phone setup', message: 'Please help us check the announcement volume at Pentagon.', transactionId: null, shopId: 'pentagon', status: 'open', createdAt: ago(50) }],
    audit: [{ id: 'audit-seed', type: 'DEMO_CREATED', by: 'Lumo', createdAt: now.toISOString(), description: 'Fictional demo business created.' }]
  };
}

function validSnapshot(value) {
  const arrays = ['shops', 'staff', 'transactions', 'requests', 'closings', 'refunds', 'settlements', 'tickets', 'audit'];
  return value?.version === VERSION && Number.isSafeInteger(value.openingBalance)
    && value.business && typeof value.business.name === 'string' && typeof value.business.accountNumber === 'string'
    && arrays.every(key => Array.isArray(value[key]))
    && value.shops.every(shop => typeof shop.id === 'string' && typeof shop.name === 'string' && Number.isFinite(shop.lat) && Number.isFinite(shop.lng))
    && ['transactions', 'refunds', 'settlements'].every(key => value[key].every(entry => typeof entry.id === 'string' && Number.isSafeInteger(entry.amount) && entry.amount > 0));
}
function readStorage(key) {
  try { return globalThis.localStorage?.getItem(key) ?? null; } catch { return null; }
}
function writeStorage(key, value) {
  try { globalThis.localStorage?.setItem(key, value); } catch {}
}
function readSnapshot(key) {
  try {
    const saved = JSON.parse(readStorage(key) || 'null');
    return validSnapshot(saved) ? saved : null;
  } catch { return null; }
}
const workspaces = { sample: readSnapshot(STORAGE_KEY) || makeSeed(), registered: readSnapshot(REGISTERED_KEY) };
let workspaceMode = readStorage(WORKSPACE_KEY) === 'registered' && workspaces.registered ? 'registered' : 'sample';
let state = workspaces[workspaceMode];
let registeredLocked = false;
let channel = null;
if (typeof window !== 'undefined' && typeof BroadcastChannel !== 'undefined') {
  channel = new BroadcastChannel('lumo-merchant-demo');
  channel.addEventListener('message', event => acceptExternal(event.data));
}
if (typeof window !== 'undefined') {
  window.addEventListener('storage', event => {
    const workspace = event.key === STORAGE_KEY ? 'sample' : event.key === REGISTERED_KEY ? 'registered' : null;
    if (!workspace || !event.newValue) return;
    try { acceptExternal({ state: JSON.parse(event.newValue), type: 'SYNC', workspace }); } catch {}
  });
}
function acceptExternal(message) {
  const workspace = message?.workspace || 'sample';
  if (!['sample', 'registered'].includes(workspace) || !validSnapshot(message?.state)) return;
  if (workspace === 'registered' && registeredLocked) { removeRegisteredStorage(); return; }
  const existing = workspaces[workspace];
  if (message.state.mutationId === existing?.mutationId) return;
  if (existing && message.state.business.id === existing.business.id && (message.state.revision || 0) < (existing.revision || 0) && !['RESET_DEMO', 'DEMO_RESET'].includes(message.type)) return;
  if (existing && Date.parse(message.state.updatedAt) < Date.parse(existing.updatedAt)) return;
  workspaces[workspace] = copy(message.state);
  if (workspace !== workspaceMode) return;
  state = workspaces[workspace];
  emit({ type: message.type || 'SYNC', entity: message.entity || null, external: true, workspace });
}
function emit(event) {
  const snapshot = getState();
  listeners.forEach(fn => { try { fn({ ...event, state: snapshot }); } catch (error) { console.error('Lumo subscriber:', error); } });
}
function persist(type, entity, stamped = false) {
  if (!stamped) {state.updatedAt = timestamp();state.revision = (state.revision || 0) + 1;state.mutationId = id('change');}
  workspaces[workspaceMode] = copy(state);
  writeStorage(workspaceMode === 'registered' ? REGISTERED_KEY : STORAGE_KEY, JSON.stringify(state));
  channel?.postMessage({ state, type, entity, workspace: workspaceMode });
  emit({ type, entity: copy(entity ?? null), external: false, workspace: workspaceMode });
}
export function getWorkspaceMode() { return workspaceMode; }
export function hasRegistration() {
  if (registeredLocked) return false;
  if (workspaces.registered) return true;
  const saved = readSnapshot(REGISTERED_KEY);
  if (saved) workspaces.registered = saved;
  return Boolean(saved);
}
function removeRegisteredStorage() {
  try { globalThis.localStorage?.removeItem(REGISTERED_KEY); } catch { try { globalThis.localStorage?.setItem(REGISTERED_KEY, ''); } catch {} }
}
// Forget this device's shared merchant data, without deleting any server records,
// legacy-import backups, or unresolved financial retry references.
export function clearRegisteredState({preserveLegacy = false, notify = true} = {}) {
  const snapshot = workspaces.registered || readSnapshot(REGISTERED_KEY);
  const business = snapshot?.business;
  const shared = business?.sandbox || business?.verificationStatus === 'approved-sandbox' || /^business-\d+$/.test(business?.id || '');
  if (preserveLegacy && business && !shared) return getState();
  registeredLocked = true;
  workspaces.registered = null;
  removeRegisteredStorage();
  if (workspaceMode === 'registered') { workspaceMode = 'sample'; state = copy(workspaces.sample); writeStorage(WORKSPACE_KEY, 'sample'); }
  if (notify) emit({type:'REGISTERED_CLEARED',entity:null,external:true,workspace:workspaceMode});
  return getState();
}
// Install an authorised server response. The server remains the authority for permissions and money.
export function replaceRegisteredState(snapshot, {activate = true, eventType = 'REMOTE_SYNC', notify = true} = {}) {
  if (!validSnapshot(snapshot)) throw new Error('The shared business response is incomplete. Refresh and try again.');
  registeredLocked = false;
  workspaces.registered = copy(snapshot);
  writeStorage(REGISTERED_KEY, JSON.stringify(workspaces.registered));
  if (activate) {workspaceMode = 'registered';writeStorage(WORKSPACE_KEY, workspaceMode);}
  if (workspaceMode === 'registered') state = copy(snapshot);
  if (notify && workspaceMode === 'registered') emit({type: eventType, entity: null, external: true, workspace: 'registered'});
  return getState();
}
export function switchWorkspace(mode = 'sample') {
  if (!['sample', 'registered'].includes(mode)) throw new Error('Choose the sample or registered workspace.');
  if (mode === 'registered' && !hasRegistration()) throw new Error('Complete merchant signup before opening your business.');
  workspaces[workspaceMode] = copy(state);
  writeStorage(workspaceMode === 'registered' ? REGISTERED_KEY : STORAGE_KEY, JSON.stringify(state));
  const saved = readSnapshot(mode === 'registered' ? REGISTERED_KEY : STORAGE_KEY);
  if (saved && (!workspaces[mode] || Date.parse(saved.updatedAt) >= Date.parse(workspaces[mode].updatedAt))) workspaces[mode] = saved;
  workspaceMode = mode;
  state = copy(workspaces[mode]);
  writeStorage(WORKSPACE_KEY, mode);
  emit({ type: 'WORKSPACE_SWITCH', entity: { mode }, external: false, workspace: mode });
  return getState();
}

export function getState() {
  const snapshot = copy(state);
  snapshot.requests = snapshot.requests.map(request => request.status === 'open' && Date.parse(request.expiresAt) <= Date.now() ? { ...request, status: 'expired' } : request);
  return snapshot;
}
export function subscribe(fn) { listeners.add(fn); return () => listeners.delete(fn); }
export function formatMoney(pesewas, compact = false) {
  const value = Number(pesewas || 0) / 100;
  const formatted = new Intl.NumberFormat('en-GH', { minimumFractionDigits: compact ? 0 : 2, maximumFractionDigits: compact ? 1 : 2, notation: compact ? 'compact' : 'standard' }).format(value);
  return `GH₵${formatted}`;
}

export function metrics(shopId = null) { return metricsFor(state, shopId); }

function assignedShopIds(person) {
  return Array.isArray(person?.shopIds) ? person.shopIds : person?.shopId ? [person.shopId] : [];
}
export function syncAccessUsers(users, { authoritative = true } = {}) {
  if (workspaceMode !== 'registered') return getState();
  const saved = readSnapshot(REGISTERED_KEY);
  if (saved && saved.business.id === state.business.id && (saved.revision || 0) > (state.revision || 0)) {state = saved;workspaces.registered = copy(saved);}
  if (!Array.isArray(users)) throw new Error('Provide the business user list.');
  const businessId = state.business.id;
  const validShopIds = new Set(state.shops.map(shop => shop.id));
  const seen = new Set(), projected = [];
  for (const user of users) {
    if (!user || user.businessId !== businessId) continue;
    const userId = requireText(user.id, 'User identity', 200);
    if (seen.has(userId)) throw new Error('A user identity appears more than once.');
    seen.add(userId);
    if (!['owner', 'manager', 'cashier'].includes(user.role)) throw new Error('Choose a supported user role.');
    if (user.role === 'owner') continue;
    const name = requireText(user.name, 'User name', 100);
    if (!Array.isArray(user.shopIds) || user.shopIds.length === 0) throw new Error('Assign at least one shop to this user.');
    const shopIds = [...new Set(user.shopIds)];
    if (shopIds.some(shopId => typeof shopId !== 'string' || !validShopIds.has(shopId))) throw new Error('A user is assigned to an unknown shop.');
    const active = user.active !== false && !['inactive', 'suspended', 'revoked', 'deleted', 'pending', 'invited'].includes(user.status);
    projected.push({ id: `access-${userId}`, authUserId: userId, name, phone: String(user.phone || '').trim().slice(0, 30), role: user.role, shopIds, shopId: shopIds[0], active });
  }
  if (!authoritative && projected.length === 0) return getState();
  const next = copy(state);
  const projectedIds = new Set(projected.map(person => person.id));
  if (authoritative) next.staff = next.staff.map(person => projectedIds.has(person.id) ? person : { ...person, active: false });
  for (const person of projected) {
    const existing = next.staff.find(entry => entry.id === person.id);
    if (existing) Object.assign(existing, person);
    else next.staff.push({ ...person, createdAt: timestamp() });
  }
  for (const shop of next.shops) {
    const manager = next.staff.find(person => person.active && person.role === 'manager' && assignedShopIds(person).includes(shop.id));
    shop.manager = manager?.name || next.business.ownerName || 'Unassigned';
  }
  if (JSON.stringify(next.staff) === JSON.stringify(state.staff) && JSON.stringify(next.shops) === JSON.stringify(state.shops)) return getState();
  next.audit.unshift({ id: id('audit'), type: 'ACCESS_USERS_SYNC', by: 'Account access', createdAt: timestamp(), description: 'Business user roles and shop assignments updated.' });
  next.audit = next.audit.slice(0, 500);
  state = next;
  persist('ACCESS_USERS_SYNC', { count: projected.length });
  return getState();
}
export function dispatch(type, payload = {}, actor = {role: 'owner'}) {
  // Storage events arrive asynchronously. Refresh before mutation so another tab's committed receipt is retained.
  const saved = readSnapshot(workspaceMode === 'registered' ? REGISTERED_KEY : STORAGE_KEY);
  if (saved && (saved.revision || 0) >= (state.revision || 0)) { state = saved; workspaces[workspaceMode] = copy(saved); }
  if (type === 'REGISTER_BUSINESS') {
    if (actor.role !== 'owner') throw new Error('Only the owner can perform this action.');
    if (hasRegistration()) throw new Error('A business is already registered in this browser. Resume your business instead.');
    const registered = createBusiness(payload);
    workspaces[workspaceMode] = copy(state);
    writeStorage(workspaceMode === 'registered' ? REGISTERED_KEY : STORAGE_KEY, JSON.stringify(state));
    registeredLocked = false; workspaceMode = 'registered'; state = registered; writeStorage(WORKSPACE_KEY, workspaceMode);
    persist(type, registered.business); return getState();
  }
  const result = reduceBusiness(state, type, payload, actor);
  if (result.changed) { state = result.state; persist(type, result.entity, true); }
  return copy(result.entity);
}

export function resetDemo() {
  if (workspaceMode === 'registered') {
    workspaces.registered = copy(state);
    writeStorage(REGISTERED_KEY, JSON.stringify(state));
  }
  workspaceMode = 'sample';
  state = makeSeed();
  writeStorage(WORKSPACE_KEY, workspaceMode);
  persist('RESET_DEMO', null);
  return getState();
}
