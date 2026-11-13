/* Shared merchant business rules. No browser storage or network side effects. */
import {reconcileRows} from './reconciliation.js';
const VERSION = 1;
const copy = value => JSON.parse(JSON.stringify(value));
const id = prefix => `${prefix}-${globalThis.crypto?.randomUUID?.() || Math.random().toString(36).slice(2)+Date.now().toString(36)}`;
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


export function businessDay(value = Date.now(), cutoff = '00:00') {
  const [hours, minutes] = validCutoff(cutoff).split(':').map(Number);
  const instant = Date.parse(typeof value === 'number' ? new Date(value).toISOString() : value);
  if (!Number.isFinite(instant)) throw new Error('Choose a valid business date.');
  return new Date(instant - (hours * 60 + minutes) * 60000).toISOString().slice(0, 10);
}
export function businessDayStart(value = Date.now(), cutoff = '00:00') {
  return businessDay(value, cutoff) + 'T' + validCutoff(cutoff) + ':00.000Z';
}
function validCutoff(value) {
  if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(String(value))) throw new Error('Choose a closing cutoff in HH:MM format.');
  return String(value);
}
function closeMode(value) {
  if (!['manual', 'automatic'].includes(value)) throw new Error('Choose manual or automatic daily closing.');
  return value;
}
const receiptAt = tx => tx.confirmedAt || tx.createdAt;
const refundAt = refund => refund.paidAt || refund.approvedAt || refund.createdAt;
const validTradingDay = value => typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) && Number.isFinite(Date.parse(value+'T00:00:00Z')) && new Date(value+'T00:00:00Z').toISOString().slice(0,10) === value;
function configuredCutoff(snapshot, shopId) {return (snapshot.shops || []).find(shop => shop.id === shopId)?.cutoff || snapshot.business?.cutoff || '00:00';}
export function closingTradingDay(snapshot, close) {
  if (validTradingDay(close?.businessDay)) return close.businessDay;
  if (validTradingDay(close?.businessDate)) return close.businessDate;
  const at = close.automatic ? new Date(Date.parse(close.createdAt) - 1).toISOString() : close.createdAt;
  return businessDay(at, close.cutoff || configuredCutoff(snapshot, close.shopId));
}
function capturedClosing(snapshot, entity, kind) {
  const field = kind === 'refund' ? 'refundIds' : 'transactionIds';
  return (snapshot.closings || []).find(close => (close[field] || []).includes(entity.id));
}
export function financialTradingDay(snapshot, entity, kind = 'payment') {
  if (validTradingDay(entity?.tradingDay)) return entity.tradingDay;
  if (kind === 'payment' && entity?.status !== 'paid' && validTradingDay(entity?.recordedTradingDay)) return entity.recordedTradingDay;
  const close = capturedClosing(snapshot, entity, kind);
  if (close) return closingTradingDay(snapshot, close);
  const at = kind === 'refund' ? refundAt(entity) : receiptAt(entity);
  return businessDay(at, entity.tradingCutoff || configuredCutoff(snapshot, entity.shopId));
}
const UNKNOWN_OWNER_NAME = 'Business owner (historical name unavailable)';
function historicalShiftName(snapshot, shift) {
  if (shift.staffName && shift.staffName !== UNKNOWN_OWNER_NAME) return shift.staffName;
  if (shift.performedBy && shift.performedBy !== UNKNOWN_OWNER_NAME) return shift.performedBy;
  const receiptIds = new Set(shift.transactionIds || []), refundIds = new Set(shift.refundIds || []);
  const belongs = (event, membership) => event.shiftId === shift.id || !Object.hasOwn(event,'shiftId') && membership.has(event.id);
  const names = [
    ...(snapshot.transactions || []).filter(payment => belongs(payment,receiptIds) && payment.staffName).map(payment => ({name: payment.staffName, at: payment.createdAt})),
    ...(snapshot.requests || []).filter(request => request.shiftId === shift.id && request.staffName).map(request => ({name: request.staffName, at: request.createdAt})),
    ...(snapshot.refunds || []).filter(refund => belongs(refund,refundIds) && refund.performedBy).map(refund => ({name: refund.performedBy, at: refund.createdAt}))
  ].sort((a,b) => String(a.at || '').localeCompare(String(b.at || '')));
  if (names.length) return names[0].name;
  // Old owner shifts stored an identity or role in `by`, and never saved the name.
  // A readable original name is usable; the current business owner is not historical evidence.
  if (typeof shift.by === 'string' && /\s/.test(shift.by) && !/^(business owner|shop manager|assigned team member)$/i.test(shift.by.trim())) return shift.by.trim();
  if (String(shift.staffId).startsWith('owner-')) return UNKNOWN_OWNER_NAME;
  return (snapshot.staff || []).find(person => person.id === shift.staffId)?.name || 'Former team member';
}
function freezeFinancialEvents(snapshot) {
  let changed = false;
  for (const payment of snapshot.transactions) {
    if (payment.status !== 'paid') {
      if (!validTradingDay(payment.recordedTradingDay)) {payment.recordedTradingDay = businessDay(payment.createdAt, payment.recordedCutoff || configuredCutoff(snapshot, payment.shopId));changed=true;}
      if (!payment.recordedCutoff) {payment.recordedCutoff = configuredCutoff(snapshot, payment.shopId);changed=true;}
      continue;
    }
    if (validTradingDay(payment.tradingDay) && payment.tradingCutoff) continue;
    changed=true;
    const close = capturedClosing(snapshot, payment, 'payment');
    payment.tradingDay = financialTradingDay(snapshot, payment, 'payment');
    payment.tradingCutoff ||= close?.cutoff || configuredCutoff(snapshot, payment.shopId);
  }
  for (const refund of snapshot.refunds) {
    if (refund.status !== 'paid') continue;
    if (!validTradingDay(refund.tradingDay) || !refund.tradingCutoff) {
      changed=true;
      const close = capturedClosing(snapshot, refund, 'refund');
      refund.tradingDay = financialTradingDay(snapshot, refund, 'refund');
      refund.tradingCutoff ||= close?.cutoff || configuredCutoff(snapshot, refund.shopId);
    }
    // Earlier snapshots attached an approved refund to its requester's shift.
    // The approval endpoint was owner-only, but did not record an owner identity.
    if (refund.approvedAt && !refund.performedRole) {
      changed=true;
      if (!Object.hasOwn(refund,'requestedStaffId')) refund.requestedStaffId = refund.staffId || null;
      if (!Object.hasOwn(refund,'requestedShiftId')) refund.requestedShiftId = refund.shiftId || null;
      refund.requestedBy ||= refund.by || 'Former requester';
      refund.staffId = 'owner-legacy-approval';refund.shiftId = null;
      refund.performedBy = 'Business owner (legacy approval)';refund.performedRole = 'owner';refund.performedUserId = null;refund.legacyPerformer = true;
    }
    const original = snapshot.transactions.find(payment => payment.id === refund.transactionId);
    if (!Object.hasOwn(refund, 'sourceStaffId')) {refund.sourceStaffId = original?.staffId || null;changed=true;}
    if (!Object.hasOwn(refund, 'sourceShiftId')) {refund.sourceShiftId = original?.shiftId || null;changed=true;}
  }
  for (const shift of snapshot.shifts || []) {
    if (!shift.staffName || !shift.performedBy || shift.staffName === UNKNOWN_OWNER_NAME || shift.performedBy === UNKNOWN_OWNER_NAME) {const name = historicalShiftName(snapshot,shift);if (shift.staffName !== name || shift.performedBy !== name) {shift.staffName = name;shift.performedBy = name;changed=true;}}
    if (!validTradingDay(shift.tradingDay)) {shift.tradingDay = businessDay(shift.startedAt, shift.tradingCutoff || configuredCutoff(snapshot, shift.shopId));changed=true;}
    if (!shift.tradingCutoff) {shift.tradingCutoff = configuredCutoff(snapshot, shift.shopId);changed=true;}
  }
  if (refreshClosedShiftTotals(snapshot)) changed = true;
  return changed;
}
export function isShopCloseDue(snapshot, shopOrId, now = Date.now()) {
  const shop = typeof shopOrId === 'string' ? (snapshot.shops || []).find(item => item.id === shopOrId) : shopOrId;
  if (!shop) return false;
  const cutoff = shop.cutoff || snapshot.business?.cutoff || '00:00', currentDay = businessDay(now, cutoff);
  const previousDay = new Date(Date.parse(currentDay+'T00:00:00Z') - 86400000).toISOString().slice(0,10);
  const closes = (snapshot.closings || []).filter(close => close.shopId === shop.id);
  const paidIds = new Set(closes.flatMap(close => close.transactionIds || [])), refundIds = new Set(closes.flatMap(close => close.refundIds || []));
  if ((snapshot.transactions || []).some(payment => payment.shopId === shop.id && payment.status === 'paid' && !paidIds.has(payment.id) && financialTradingDay(snapshot, payment) <= previousDay)) return true;
  if ((snapshot.refunds || []).some(refund => refund.shopId === shop.id && refund.status === 'paid' && !refundIds.has(refund.id) && financialTradingDay(snapshot, refund, 'refund') <= previousDay)) return true;
  if (shop.open === false) return false;
  const startedAt = shop.createdAt || snapshot.business?.registeredAt;
  if (!startedAt || businessDay(startedAt, shop.createdCutoff || cutoff) > previousDay) return false;
  return !closes.some(close => closingTradingDay(snapshot, close) >= previousDay);
}
function performer(snapshot, actor, shopId) {
  const staffId = actor.staffId || (actor.role === 'owner' ? `owner-${actor.userId || snapshot.business.id || 'business'}` : null);
  const person = snapshot.staff.find(person => person.id === staffId);
  return {staffId, shiftId: snapshot.shifts.find(shift => shift.shopId === shopId && shift.staffId === staffId && shift.status === 'open')?.id || null, performedBy: person?.name || (actor.role === 'owner' ? snapshot.business.ownerName : actor.role), performedRole: actor.role, performedUserId: actor.userId || person?.authUserId || null};
}
function refreshClosedShiftTotals(current) {
  let changed = false;
  const paymentById = new Map(current.transactions.map(payment => [payment.id,payment]));
  const refundById = new Map(current.refunds.map(refund => [refund.id,refund]));
  const paymentsByShift = new Map(), refundsByShift = new Map();
  for (const payment of current.transactions) if (payment.status === 'paid' && payment.shiftId) {if (!paymentsByShift.has(payment.shiftId)) paymentsByShift.set(payment.shiftId,[]);paymentsByShift.get(payment.shiftId).push(payment);}
  for (const refund of current.refunds) if (refund.status === 'paid' && refund.shiftId) {if (!refundsByShift.has(refund.shiftId)) refundsByShift.set(refund.shiftId,[]);refundsByShift.get(refund.shiftId).push(refund);}
  for (const shift of current.shifts || []) {
    if (shift.status !== 'closed') continue;
    const before = JSON.stringify([shift.transactionIds,shift.refundIds,shift.gross,shift.refunds,shift.net,shift.lateConfirmedCount]);
    const receipts = new Map((paymentsByShift.get(shift.id) || []).map(payment => [payment.id,payment]));
    const returns = new Map((refundsByShift.get(shift.id) || []).map(refund => [refund.id,refund]));
    // Saved membership is evidence only for legacy events that never recorded a shift field.
    // An explicit null is authoritative: the event was not performed in any recorded shift.
    for (const id of shift.transactionIds || []) {const payment=paymentById.get(id);if (payment?.status === 'paid' && !Object.hasOwn(payment,'shiftId')) receipts.set(payment.id,payment);}
    for (const id of shift.refundIds || []) {const refund=refundById.get(id);if (refund?.status === 'paid' && !Object.hasOwn(refund,'shiftId')) returns.set(refund.id,refund);}
    const paid = [...receipts.values()], refunded = [...returns.values()];
    shift.transactionIds = paid.map(payment => payment.id);shift.refundIds = refunded.map(refund => refund.id);
    shift.gross = paid.reduce((sum,payment) => sum+payment.amount,0);shift.refunds = refunded.reduce((sum,refund) => sum+refund.amount,0);shift.net = shift.gross-shift.refunds;
    shift.lateConfirmedCount = paid.filter(payment => Date.parse(receiptAt(payment)) > Date.parse(shift.endedAt)).length;
    if (before !== JSON.stringify([shift.transactionIds,shift.refundIds,shift.gross,shift.refunds,shift.net,shift.lateConfirmedCount])) changed=true;
  }
  return changed;
}
function priorPeriodRefund(current, tx) {
  return current.closings.some(close => (close.transactionIds || []).includes(tx.id));
}
function assignedShopIds(person) { return Array.isArray(person?.shopIds) ? person.shopIds : person?.shopId ? [person.shopId] : []; }
export function ledger(current) {
  const paidReceipts = current.transactions.filter(tx => tx.status === 'paid').reduce((sum, tx) => sum + tx.amount, 0);
  const paidRefunds = current.refunds.filter(refund => refund.status === 'paid').reduce((sum, refund) => sum + refund.amount, 0);
  const paidPayouts = current.settlements.filter(payout => payout.status === 'paid').reduce((sum, payout) => sum + payout.amount + (payout.fee || 0), 0);
  const reservedPayouts = current.settlements.filter(payout => payout.status === 'processing' || payout.status === 'requested').reduce((sum, payout) => sum + payout.amount + (payout.fee || 0), 0);
  const reservedRefunds = current.refunds.filter(refund => refund.status === 'processing' || refund.status === 'requested').reduce((sum, refund) => sum + refund.amount, 0);
  const balance = current.openingBalance + paidReceipts - paidRefunds - paidPayouts;
  return { balance, available: balance - reservedPayouts - reservedRefunds, reserved: reservedPayouts + reservedRefunds, refunded: paidRefunds, settled: paidPayouts };
}
export function metricsFor(current, shopId = null, options = {}) {
  const now = options.now || new Date().toISOString();
  const shop = current.shops.find(s => s.id === shopId);
  const cutoff = shop?.cutoff || current.business.cutoff || '00:00';
  const today = businessDay(now, cutoff);
  const matches = entity => !shopId || entity.shopId === shopId;
  const transactions = current.transactions.filter(matches);
  const paid = transactions.filter(tx => tx.status === 'paid');
  const isCurrentDay = (entity,kind) => {const recordCutoff = shopId ? cutoff : configuredCutoff(current,entity.shopId);return financialTradingDay(current,entity,kind) === businessDay(now,recordCutoff)};
  const todayPaid = paid.filter(entity => isCurrentDay(entity,'payment'));
  const refunds = current.refunds.filter(refund => matches(refund) && refund.status === 'paid');
  const todayRefunds = refunds.filter(entity => isCurrentDay(entity,'refund'));
  const captured = new Set(current.closings.filter(matches).flatMap(close => close.transactionIds || []));
  const capturedRefunds = new Set(current.closings.filter(matches).flatMap(close => close.refundIds || []));
  const unclosed = paid.filter(tx => !captured.has(tx.id) && (!options.until || Date.parse(receiptAt(tx)) <= Date.parse(options.until)) && (!options.throughBusinessDay || financialTradingDay(current,tx) <= options.throughBusinessDay));
  const unclosedRefunds = refunds.filter(refund => !capturedRefunds.has(refund.id) && (!options.until || Date.parse(refundAt(refund)) <= Date.parse(options.until)) && (!options.throughBusinessDay || financialTradingDay(current,refund,'refund') <= options.throughBusinessDay));
  const sum = array => array.reduce((value, entry) => value + entry.amount, 0);
  const currentGross = sum(unclosed);
  const currentRefunds = sum(unclosedRefunds);
  const merchant = ledger(current);
  const closes = current.closings.filter(matches).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  return {
    ...merchant,
    balance: shopId ? currentGross - currentRefunds : merchant.balance,
    available: shopId ? Math.max(0, currentGross - currentRefunds) : merchant.available,
    reserved: shopId ? current.refunds.filter(refund => matches(refund) && ['requested', 'processing'].includes(refund.status)).reduce((sum, refund) => sum + refund.amount, 0) : merchant.reserved,
    pending: sum(transactions.filter(tx => tx.status === 'processing')),
    pendingCount: transactions.filter(tx => tx.status === 'processing').length,
    todayGross: sum(todayPaid), todayRefunds: sum(todayRefunds), todayNet: sum(todayPaid) - sum(todayRefunds), todayCount: todayPaid.length,
    businessDay: today, cutoff,
    priorPeriodRefunds: sum(unclosedRefunds.filter(refund => refund.priorPeriod === true)),
    priorPeriodAllocations: sum(unclosed.filter(payment => payment.priorPeriodAllocation === true)),
    currentGross, currentRefunds, currentNet: currentGross - currentRefunds, currentCount: unclosed.length,
    paidCount: paid.length, refundCount: refunds.length,
    refunded: sum(refunds),
    settled: shopId ? 0 : merchant.settled,
    periodStart: closes[0]?.createdAt || current.business.registeredAt || businessDayStart(now, cutoff),
    lastClosing: closes[0] || null,
    currentTransactions: copy(unclosed), currentRefundRecords: copy(unclosedRefunds)
  };
}
function actorCheck(current, actor) {
  if (!['owner', 'manager', 'cashier', 'student'].includes(actor.role)) throw new Error('This role is not supported.');
  if (actor.staffId || (actor.userId && ['manager', 'cashier'].includes(actor.role))) {
    const person = actor.staffId ? current.staff.find(staff => staff.id === actor.staffId) : current.staff.find(staff => staff.authUserId === actor.userId);
    if (!person?.active) throw new Error('This staff account is inactive. Ask the owner for access.');
    if (actor.userId && person.authUserId !== actor.userId) throw new Error('This staff account belongs to a different user identity.');
    if (actor.role !== person.role || !assignedShopIds(person).includes(actor.shopId)) throw new Error('This staff member is not assigned to this shop and role.');
  }
}
function ownerOnly(actor) { if (actor.role !== 'owner') throw new Error('Only the owner can perform this action.'); }
function shopAccess(current, actor, shopId, managerOnly = false) {
  const shop = current.shops.find(entry => entry.id === shopId);
  if (!shop) throw new Error('Shop not found.');
  if (actor.role === 'owner') return shop;
  if (actor.role === 'student') throw new Error('Shop staff access is required.');
  if (actor.shopId !== shopId) throw new Error('You can only manage your assigned shop.');
  if (managerOnly && actor.role !== 'manager') throw new Error('Ask your shop manager to perform this action.');
  return shop;
}
function getTransaction(current, txId) {
  const tx = current.transactions.find(entry => entry.id === txId);
  if (!tx) throw new Error('Payment not found.');
  return tx;
}
function getStaff(current, staffId, shopId) {
  if (!staffId) return null;
  const person = current.staff.find(entry => entry.id === staffId);
  if (!person && String(staffId).startsWith('owner-')) {
    const ownerRequest = current.requests.find(request => request.staffId === staffId && request.shopId === shopId && request.createdByRole === 'owner');
    if (ownerRequest) return {id: staffId, name: ownerRequest.staffName || current.business.ownerName, role: 'owner', active: true};
  }
  if (!person || !person.active || !assignedShopIds(person).includes(shopId)) throw new Error('Choose an active staff member assigned to this shop.');
  return person;
}

export function createBusiness(payload, options = {}) {
  const nowValue = options.now || new Date().toISOString();
  const timestamp = () => nowValue;
  const name = requireText(payload.name, 'Business name', 70);
  const ownerName = requireText(payload.ownerName, 'Owner name', 60);
  const enteredPhone = requireText(payload.phone, 'Phone number', 30).replace(/[\s()-]/g, '');
  if (!/^(?:0|\+233|233)[1-9]\d{8}$/.test(enteredPhone)) throw new Error('Enter a valid Ghana phone number, such as 024 000 0000.');
  const phone = enteredPhone.startsWith('+233') ? enteredPhone : enteredPhone.startsWith('233') ? '+' + enteredPhone : '+233' + enteredPhone.slice(1);
  const businessType = requireText(payload.businessType, 'Business type', 80);
  const destination = requireText(payload.destination, 'Settlement destination', 160);
  if (payload.verification?.identity !== true || payload.verification?.face !== true) throw new Error('Complete both sample owner identity and face verification checks.');
  if (!payload.shop || typeof payload.shop !== 'object') throw new Error('Add your first shop before activating the business.');
  const shopName = requireText(payload.shop.name, 'Shop name', 60);
  const area = requireText(payload.shop.area, 'Campus area', 60);
  const category = requireText(payload.shop.category, 'Shop category', 80);
  if ([payload.shop.lat, payload.shop.lng].some(value => !['number', 'string'].includes(typeof value) || String(value).trim() === '')) throw new Error('Set a valid location for your first shop.');
  const lat = Number(payload.shop.lat), lng = Number(payload.shop.lng);
  if (!Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180) throw new Error('Set a valid location for your first shop.');
  const now = timestamp(), firstShopId = options.shopId || id('shop');
  const manager = String(payload.shop.manager || ownerName).trim().slice(0, 60);
  const accountNumber = options.accountNumber || '9900' + String(Math.floor(Math.random() * 1000000)).padStart(6, '0');
  const firstShop = { id: firstShopId, name: shopName, area, category, lat, lng, code: options.shopCode || 'LUM101', color: '#d9f57b', open: true, accepting: true, manager, hours: String(payload.shop.hours || '7:00 am – 10:00 pm').slice(0, 100), landmark: String(payload.shop.landmark || '').slice(0, 180), cutoff: validCutoff(payload.shop.cutoff || '00:00'), closeMode: closeMode(payload.shop.closeMode || 'manual'), activation: {locationConfirmed: false, qrReady: false}, published: options.published === true, createdCutoff: validCutoff(payload.shop.cutoff || '00:00'), createdAt: now };
  const ownerManager = { id: id('staff'), name: ownerName, role: 'manager', shopId: firstShopId, active: true, phone, createdAt: now };
  return {
    version: VERSION, revision: 0, updatedAt: now, mode: 'registered',
    business: {
      id: options.businessId || id('business'), name, ownerName, phone, businessType, cutoff: '00:00', closeMode: 'manual',
      registrationNumber: String(payload.registrationNumber || '').trim().slice(0, 120),
      accountNumber, bankName: 'GCB Bank', destination, verificationStatus: 'approved-demo',
      verification: { identity: true, face: true }, registeredAt: now
    },
    openingBalance: 0, shops: [firstShop], staff: [ownerManager],
    transactions: [], requests: [], closings: [], refunds: [], settlements: [], tickets: [], audit: [], shifts: [], reconciliations: []
  };
}


export function reduceBusiness(snapshot, type, payload = {}, actor = {role: 'owner'}, options = {}) {
  const now = options.now || new Date().toISOString();
  if (!Number.isFinite(Date.parse(now))) throw new Error('Choose a valid action date.');
  const timestamp = () => now;
  const unchanged = entity => ({state: copy(snapshot), entity: copy(entity), changed: false});
  actorCheck(snapshot, actor);
  if (type === 'REGISTER_BUSINESS') { ownerOnly(actor); const registered = createBusiness(payload, options); return {state: registered, entity: registered.business, changed: true}; }
  const next = copy(snapshot);
  next.shifts ||= []; next.reconciliations ||= [];
  freezeFinancialEvents(next);
  let entity;
  switch (type) {
    case 'ADD_SHOP': {
      ownerOnly(actor);
      const activation = payload.activation;
      if (activation !== undefined && (!activation || typeof activation !== 'object' || Array.isArray(activation) || ('locationConfirmed' in activation && typeof activation.locationConfirmed !== 'boolean'))) throw new Error('Shop location confirmation must be true or false.');
      const name = requireText(payload.name, 'Shop name', 60);
      if (next.shops.some(shop => shop.name.toLowerCase() === name.toLowerCase())) throw new Error('A shop with this name already exists.');
      if (!Number.isFinite(Number(payload.lat)) || !Number.isFinite(Number(payload.lng)) || Math.abs(Number(payload.lat)) > 90 || Math.abs(Number(payload.lng)) > 180) throw new Error('Enter a valid shop location.');
      const highestCode = Math.max(100, ...next.shops.map(shop => Number(shop.code.replace(/\D/g, '')) || 100));
      entity = { id: id('shop'), name, area: requireText(payload.area, 'Campus area', 60), category: payload.category || 'Food & drinks', lat: Number(payload.lat), lng: Number(payload.lng), code: `LUM${highestCode + 1}`, color: ['#d9f57b', '#cbbdf0', '#f1c9a8', '#a7d8cc'][next.shops.length % 4], open: true, accepting: true, manager: String(payload.manager || 'Unassigned').trim(), hours: String(payload.hours || '7:00 am – 10:00 pm').slice(0, 100), landmark: String(payload.landmark || '').slice(0, 180), cutoff: validCutoff(payload.cutoff || next.business.cutoff || '00:00'), closeMode: closeMode(payload.closeMode || next.business.closeMode || 'manual'), activation: {locationConfirmed: false, qrReady: false}, published: options.published === true, createdCutoff: validCutoff(payload.cutoff || next.business.cutoff || '00:00'), createdAt: timestamp() };
      entity.activation.locationConfirmed = activation?.locationConfirmed === true;
      if (entity.activation.locationConfirmed) entity.activation.updatedAt = timestamp();
      next.shops.push(entity);
      break;
    }
    case 'UPDATE_SHOP': {
      entity = shopAccess(next, actor, payload.id, true);
      if (actor.role !== 'owner' && Object.keys(payload).some(key => !['id', 'open', 'accepting', 'hours', 'landmark', 'cutoff', 'closeMode', 'lat', 'lng', 'published'].includes(key))) throw new Error('Only the owner can change these shop details.');
      if ('name' in payload) entity.name = requireText(payload.name, 'Shop name', 60);
      for (const key of ['area', 'category', 'manager']) if (key in payload) entity[key] = requireText(payload[key], key, 100);
      for (const key of ['open', 'accepting']) if (key in payload) {if (typeof payload[key] !== 'boolean') throw new Error('Shop status must be true or false.');entity[key] = payload[key];}
      if ('published' in payload) {if (typeof payload.published !== 'boolean') throw new Error('Choose whether this shop is published.');entity.published = payload.published;}
      if ('hours' in payload) entity.hours = requireText(payload.hours, 'Opening hours', 100);
      if ('landmark' in payload) entity.landmark = String(payload.landmark || '').trim().slice(0, 180);
      if ('cutoff' in payload) entity.cutoff = validCutoff(payload.cutoff);
      if ('closeMode' in payload) entity.closeMode = closeMode(payload.closeMode);
      for (const key of ['lat', 'lng']) if (key in payload) {
        const number = Number(payload[key]);
        if (!Number.isFinite(number) || Math.abs(number) > (key === 'lat' ? 90 : 180)) throw new Error('Enter a valid shop location.');
        entity[key] = number;
      }
      if ('activation' in payload) {
        const activation = payload.activation;
        if (!activation || typeof activation !== 'object' || Array.isArray(activation) || ('locationConfirmed' in activation && typeof activation.locationConfirmed !== 'boolean')) throw new Error('Shop location confirmation must be true or false.');
        if ('locationConfirmed' in activation) entity.activation = {...entity.activation, locationConfirmed: activation.locationConfirmed, updatedAt: timestamp()};
      }
      break;
    }
    case 'UPDATE_ACTIVATION': {
      entity = shopAccess(next, actor, payload.shopId, true);
      entity.activation ||= {locationConfirmed: false, qrReady: false};
      for (const key of ['locationConfirmed', 'qrReady']) if (key in payload) {if (typeof payload[key] !== 'boolean') throw new Error('Shop readiness must be true or false.');entity.activation[key] = payload[key];}
      if ('ownerOperated' in payload) {ownerOnly(actor);if (typeof payload.ownerOperated !== 'boolean') throw new Error('Owner-operated status must be true or false.');entity.activation.ownerOperated = payload.ownerOperated;}
      entity.activation.updatedAt = timestamp();
      break;
    }
    case 'ADD_STAFF': {
      ownerOnly(actor);
      const shop = shopAccess(next, actor, payload.shopId);
      if (!['manager', 'cashier'].includes(payload.role)) throw new Error('Choose manager or cashier.');
      entity = { id: id('staff'), name: requireText(payload.name, 'Staff name', 60), role: payload.role, shopId: payload.shopId, phone: requireText(payload.phone, 'Phone number', 30), active: true, createdAt: timestamp() };
      next.staff.push(entity);
      if (entity.role === 'manager') shop.manager = entity.name;
      break;
    }
    case 'UPDATE_STAFF': {
      ownerOnly(actor);
      entity = next.staff.find(entry => entry.id === payload.id);
      if (!entity) throw new Error('Staff member not found.');
      if ('active' in payload) {if (typeof payload.active !== 'boolean') throw new Error('Staff status must be true or false.');entity.active = payload.active;}
      break;
    }
    case 'CREATE_REQUEST': {
      const shop = shopAccess(next, actor, payload.shopId);
      const actorDetails = performer(next,actor,payload.shopId);
      const staffId = actor.staffId || payload.staffId || (actor.role === 'owner' ? actorDetails.staffId : null);
      const amount = moneyValue(payload.amount);
      const description = String(payload.description || '').trim().slice(0, 160);
      const attemptId = payload.attemptId == null ? null : requireText(payload.attemptId, 'Payment request attempt reference', 120);
      const prior = attemptId ? next.requests.find(request => request.attemptId === attemptId) : null;
      if (prior) {
        if (prior.shopId !== payload.shopId || prior.amount !== amount || prior.description !== description || prior.staffId !== staffId || prior.createdByRole !== actor.role || (prior.createdByUserId || null) !== (actor.userId || null)) throw new Error('This payment request reference was already used for a different request or operator.');
        return unchanged(prior);
      }
      if (!shop.accepting || shop.open === false) throw new Error('This shop is not accepting payments right now. Resume payments before creating a QR.');
      const person = actor.role === 'owner' && staffId === actorDetails.staffId ? {name: actorDetails.performedBy} : getStaff(next, staffId, payload.shopId);
      const shift = next.shifts.find(shift => shift.shopId === payload.shopId && shift.staffId === staffId && shift.status === 'open');
      entity = { id: id('request'), shopId: payload.shopId, staffId, staffName: person?.name || null, shiftId: shift?.id || null, createdByRole: actor.role, createdByUserId: actor.userId || null, amount, description, ...(attemptId ? {attemptId} : {}), createdAt: timestamp(), expiresAt: new Date(Date.parse(now) + 15 * 60000).toISOString(), status: 'open' };
      next.requests.unshift(entity);
      break;
    }
    case 'CANCEL_REQUEST': {
      entity = next.requests.find(entry => entry.id === payload.id);
      if (!entity) throw new Error('Payment request not found.');
      shopAccess(next, actor, entity.shopId);
      if (entity.status === 'paid') throw new Error('A paid request cannot be cancelled. Open the payment to issue a refund.');
      if (next.transactions.some(tx => tx.requestId === entity.id && tx.status === 'processing')) throw new Error('This payment is processing. Check its status before cancelling.');
      entity.status = 'cancelled';
      break;
    }
    case 'PAY': {
      if (actor.role !== 'student') shopAccess(next, actor, payload.shopId);
      const amount = moneyValue(payload.amount);
      const method = payload.method || 'qr';
      if (!['qr', 'code', 'account', 'request', 'link'].includes(method)) throw new Error('Choose a supported payment method.');
      let request = null;
      let shopId = payload.shopId || null;
      if (payload.requestId) {
        request = next.requests.find(entry => entry.id === payload.requestId);
        if (!request) throw new Error('Payment request not found.');
        if (amount !== request.amount) throw new Error('The amount must match this payment request.');
        if (shopId && shopId !== request.shopId) throw new Error('This payment request belongs to a different shop.');
        shopId = request.shopId;
        const previous = next.transactions.find(tx => tx.requestId === request.id && ['paid', 'processing'].includes(tx.status));
        if (previous) return unchanged(previous);
        if (request.status !== 'open' || Date.parse(request.expiresAt) <= Date.parse(now)) throw new Error('This payment request has expired or been cancelled. Ask for a new request.');
      }
      if (payload.attemptId) {
        const previous = next.transactions.find(tx => tx.attemptId === payload.attemptId);
        if (previous) {
          if (previous.amount !== amount || previous.shopId !== shopId) throw new Error('This payment attempt has already been used for another payment.');
          return unchanged(previous);
        }
      }
      if (shopId) {
        const shop = next.shops.find(entry => entry.id === shopId);
        if (!shop) throw new Error('Shop not found.');
        if (actor.role === 'student' && (!shop.open || !shop.accepting)) throw new Error('This shop is not accepting payments right now.');
      } else if (method !== 'account') throw new Error('Choose the shop you are paying.');
      const staffId = request?.staffId || payload.staffId || null;
      const receivingPerson = getStaff(next, staffId, shopId);
      const status = payload.status || 'paid';
      if (!['paid', 'processing', 'failed'].includes(status)) throw new Error('Payment status is not valid.');
      const shift = next.shifts.find(shift => shift.shopId === shopId && shift.staffId === staffId && shift.status === 'open');
      entity = { id: id('payment'), shopId, staffId, staffName: request?.staffName || receivingPerson?.name || null, shiftId: request?.shiftId || shift?.id || null, payer: requireText(payload.payer || 'Student customer', 'Customer name', 60), amount, status, createdAt: timestamp(), confirmedAt: status === 'paid' ? timestamp() : null, recordedTradingDay: businessDay(now,configuredCutoff(next,shopId)), recordedCutoff: configuredCutoff(next,shopId), tradingDay: status === 'paid' ? businessDay(now,configuredCutoff(next,shopId)) : null, tradingCutoff: status === 'paid' ? configuredCutoff(next,shopId) : null, reference: `LM${Date.parse(now).toString().slice(-7)}${id('ref').slice(-8)}`, method, requestId: request?.id || null, attemptId: payload.attemptId || null };
      next.transactions.unshift(entity);
      if (request && status === 'paid') request.status = 'paid';
      break;
    }
    case 'RESOLVE_PAYMENT': {
      entity = getTransaction(next, payload.id);
      if (actor.role !== 'owner') shopAccess(next, actor, entity.shopId);
      if (!['paid', 'failed'].includes(payload.status)) throw new Error('Choose paid or failed.');
      if (entity.status !== 'processing') {
        if (entity.status === payload.status) return unchanged(entity);
        throw new Error('A completed payment cannot change status.');
      }
      entity.status = payload.status;
      entity.confirmedAt = timestamp();
      if (payload.status === 'paid') {entity.tradingDay = businessDay(now,configuredCutoff(next,entity.shopId));entity.tradingCutoff = configuredCutoff(next,entity.shopId);}
      if (entity.requestId && payload.status === 'paid') {
        const request = next.requests.find(entry => entry.id === entity.requestId);
        if (request) request.status = 'paid';
      }
      break;
    }
    case 'CLOSE_DAY': {
      const closingShop = shopAccess(next, actor, payload.shopId, true);
      const cutoff = closingShop.cutoff || next.business.cutoff || '00:00';
      const reportDay = businessDay(options.automatic ? new Date(Date.parse(now) - 1).toISOString() : now, cutoff);
      const current = metricsFor(next, payload.shopId, {now, until: options.automatic ? new Date(Date.parse(now) - 1).toISOString() : undefined, throughBusinessDay: options.automatic ? reportDay : undefined});
      const latest = current.lastClosing;
      if (!current.currentCount && !current.currentRefundRecords.length && latest && closingTradingDay(next,latest) === reportDay) return unchanged({ ...latest, alreadyClosed: true });
      const adjustmentNote = [current.priorPeriodRefunds ? 'Includes refunds against payments from an earlier closed period.' : '', current.priorPeriodAllocations ? 'Includes account receipts allocated to this shop after an earlier collection period.' : ''].filter(Boolean).join(' ');
      entity = { id: id('close'), shopId: payload.shopId, createdAt: timestamp(), businessDay: reportDay, cutoff, automatic: options.automatic === true, zeroSales: current.currentCount === 0, priorPeriodRefunds: current.priorPeriodRefunds, priorPeriodAllocations: current.priorPeriodAllocations, adjustmentNote, periodStartedAt: current.periodStart, transactionIds: current.currentTransactions.map(tx => tx.id), refundIds: current.currentRefundRecords.map(refund => refund.id), gross: current.currentGross, refunds: current.currentRefunds, net: current.currentNet, count: current.currentCount, pending: current.pending, by: options.automatic ? 'Automatic daily close' : actor.staffId ? next.staff.find(person => person.id === actor.staffId)?.name : actor.role === 'owner' ? next.business.ownerName : 'Shop manager' };
      next.closings.unshift(entity);
      break;
    }
    case 'REFUND': {
      const tx = getTransaction(next, payload.transactionId);
      shopAccess(next, actor, tx.shopId);
      if (tx.status !== 'paid') throw new Error('Only confirmed payments can be refunded.');
      const amount = moneyValue(payload.amount, 'Refund');
      const reason = requireText(payload.reason || 'Customer refund', 'Refund reason', 180);
      const attemptId = payload.attemptId == null ? null : requireText(payload.attemptId, 'Refund attempt reference', 100);
      if (attemptId) {
        const prior = next.refunds.find(refund => refund.attemptId === attemptId);
        if (prior) {
          if (prior.transactionId !== tx.id || prior.amount !== amount || prior.reason !== reason) throw new Error('This refund reference was already used for a different refund.');
          return unchanged(prior);
        }
      }
      const reserved = next.refunds.filter(refund => refund.transactionId === tx.id && ['paid', 'processing', 'requested'].includes(refund.status)).reduce((sum, refund) => sum + refund.amount, 0);
      if (amount > tx.amount - reserved) throw new Error('The refund exceeds the amount remaining on this payment.');
      if (amount > ledger(next).available) throw new Error('There are not enough available merchant funds for this refund.');
      // The manager allowance belongs to the original payment, not each refund
      // request. Include paid and still-reserved returns from every operator so
      // splitting a return cannot bypass the owner's approval threshold.
      const status = actor.role === 'owner' || (actor.role === 'manager' && reserved + amount <= 10000) ? 'paid' : 'requested';
      const actorDetails = performer(next,actor,tx.shopId);
      entity = { id: id('refund'), transactionId: tx.id, shopId: tx.shopId, sourceStaffId: tx.staffId || null, sourceShiftId: tx.shiftId || null, requestedStaffId: actorDetails.staffId, requestedShiftId: actorDetails.shiftId, requestedBy: actorDetails.performedBy, ...(status === 'paid' ? actorDetails : {staffId: null, shiftId: null}), amount, status, createdAt: timestamp(), paidAt: status === 'paid' ? timestamp() : null, tradingDay: status === 'paid' ? businessDay(now,configuredCutoff(next,tx.shopId)) : null, tradingCutoff: status === 'paid' ? configuredCutoff(next,tx.shopId) : null, priorPeriod: status === 'paid' && priorPeriodRefund(next, tx), reason, payer: tx.payer, by: actorDetails.performedBy, attemptId };
      next.refunds.unshift(entity);
      break;
    }
    case 'APPROVE_REFUND': {
      ownerOnly(actor);
      if (typeof payload.approve !== 'boolean') throw new Error('The refund decision must be true or false.');
      entity = next.refunds.find(entry => entry.id === payload.id);
      if (!entity) throw new Error('Refund request not found.');
      if (entity.status !== 'requested') return unchanged(entity);
      if (payload.approve) {
        if (entity.amount > ledger(next).available + entity.amount) throw new Error('There are not enough available funds for this refund.');
        entity.status = 'paid';
        entity.approvedAt = timestamp();
        entity.paidAt = timestamp();
        const original = getTransaction(next, entity.transactionId);
        if (!Object.hasOwn(entity,'requestedStaffId')) {entity.requestedStaffId = entity.staffId || null;entity.requestedShiftId = entity.shiftId || null;entity.requestedBy = entity.by;}
        Object.assign(entity,performer(next,actor,entity.shopId));
        entity.sourceStaffId = original.staffId || null;entity.sourceShiftId = original.shiftId || null;
        entity.tradingDay = businessDay(now,configuredCutoff(next,entity.shopId));entity.tradingCutoff = configuredCutoff(next,entity.shopId);
        entity.priorPeriod = priorPeriodRefund(next, getTransaction(next, entity.transactionId));
      } else entity.status = 'rejected';
      break;
    }
    case 'SETTLE': {
      ownerOnly(actor);
      const amount = moneyValue(payload.amount, 'Settlement');
      const attemptId = payload.attemptId == null ? null : requireText(payload.attemptId, 'Settlement attempt reference', 120);
      const prior = attemptId ? next.settlements.find(settlement => settlement.attemptId === attemptId) : null;
      const destination = requireText(payload.destination ?? prior?.destination ?? next.business.destination, 'Settlement destination', 160);
      if (prior) {
        if (prior.amount !== amount || prior.destination !== destination) throw new Error('This settlement reference was already used for a different settlement.');
        return unchanged(prior);
      }
      if (destination !== next.business.destination) throw new Error('Settlements can use only the saved business destination.');
      if (amount > ledger(next).available) throw new Error('Settlement exceeds the available merchant balance.');
      entity = { id: id('settlement'), amount, fee: 0, createdAt: timestamp(), status: 'processing', destination, reference: `LS${Date.parse(now).toString().slice(-7)}${id('ref').slice(-8)}`, attemptId };
      next.settlements.unshift(entity);
      break;
    }
    case 'RESOLVE_SETTLEMENT': {
      ownerOnly(actor);
      entity = next.settlements.find(entry => entry.id === payload.id);
      if (!entity) throw new Error('Settlement not found.');
      if (!['paid', 'failed'].includes(payload.status)) throw new Error('Choose paid or failed.');
      if (entity.status !== 'processing') {
        if (entity.status === payload.status) return unchanged(entity);
        throw new Error('A completed settlement cannot change status.');
      }
      entity.status = payload.status;
      entity.completedAt = timestamp();
      break;
    }
    case 'ADD_TICKET': {
      if (payload.shopId) shopAccess(next, actor, payload.shopId);
      else ownerOnly(actor);
      let paymentReference = payload.transactionId ? requireText(payload.transactionId, 'Payment reference', 100) : null;
      let linkedTransaction = null;
      if (payload.transactionId) {
        linkedTransaction = next.transactions.find(tx => tx.id === paymentReference || tx.reference === paymentReference);
        if (linkedTransaction && actor.role !== 'owner') shopAccess(next, actor, linkedTransaction.shopId);
        if (linkedTransaction) paymentReference = linkedTransaction.reference;
      }
      entity = { id: id('ticket'), subject: requireText(payload.subject, 'Subject', 100), message: requireText(payload.message, 'Message', 1500), transactionId: linkedTransaction?.id || paymentReference, paymentReference, shopId: payload.shopId || null, status: 'open', createdAt: timestamp() };
      next.tickets.unshift(entity);
      break;
    }
    case 'UPDATE_TICKET': {
      ownerOnly(actor);
      entity = next.tickets.find(ticket => ticket.id === payload.id);
      if (!entity) throw new Error('Support case not found.');
      if (!['open', 'investigating', 'resolved'].includes(payload.status)) throw new Error('Choose an open, investigating or resolved support status.');
      const response = requireText(payload.response, 'Case response', 1500);
      entity.status = payload.status; entity.updatedAt = timestamp();
      entity.responses ||= [];
      entity.responses.push({id: id('response'), message: response, status: payload.status, by: actor.userId || next.business.ownerName, createdAt: timestamp()});
      if (payload.status === 'resolved') entity.resolvedAt = timestamp();
      else delete entity.resolvedAt;
      break;
    }
    case 'SAVE_RECONCILIATION': {
      ownerOnly(actor);
      const comparison = reconcileRows(next,payload.rows);
      entity = {id: id('reconciliation'), source: requireText(payload.source || 'Statement import', 'Statement source', 120), period: String(payload.period || '').slice(0, 100), createdAt: timestamp(), by: actor.userId || next.business.ownerName, ...comparison};
      next.reconciliations.unshift(entity);
      break;
    }
    case 'START_SHIFT': {
      shopAccess(next, actor, payload.shopId);
      const staffId = actor.staffId || payload.staffId || (actor.role === 'owner' ? `owner-${actor.userId || next.business.id || 'business'}` : null);
      if (!staffId) throw new Error('A signed-in staff member is required to start a shift.');
      if (actor.role !== 'owner' && staffId !== actor.staffId) throw new Error('You can only start your own shift.');
      if (!staffId.startsWith('owner-')) getStaff(next, staffId, payload.shopId);
      const existing = next.shifts.find(shift => shift.staffId === staffId && shift.status === 'open');
      if (existing) { if (existing.shopId !== payload.shopId) throw new Error('End your current shop shift before starting another.'); return unchanged(existing); }
      const shiftPerson = next.staff.find(person => person.id === staffId);
      const staffName = shiftPerson?.name || (String(staffId).startsWith('owner-') ? next.business.ownerName : 'Former team member');
      entity = {id: id('shift'), shopId: payload.shopId, staffId, staffName, performedBy: staffName, startedAt: timestamp(), tradingDay: businessDay(now,configuredCutoff(next,payload.shopId)), tradingCutoff: configuredCutoff(next,payload.shopId), status: 'open', transactionIds: [], refundIds: [], gross: 0, refunds: 0, net: 0, by: actor.userId || actor.staffId || next.business.ownerName};
      next.shifts.unshift(entity);
      break;
    }
    case 'END_SHIFT': {
      entity = next.shifts.find(shift => shift.id === payload.id);
      if (!entity) throw new Error('Shift not found.');
      shopAccess(next, actor, entity.shopId);
      if (actor.role === 'cashier' && entity.staffId !== actor.staffId) throw new Error('You can only close your own shift.');
      if (entity.status === 'closed') return unchanged(entity);
      const receipts = next.transactions.filter(tx => tx.status === 'paid' && (tx.shiftId === entity.id || !Object.hasOwn(tx,'shiftId') && tx.staffId === entity.staffId && tx.shopId === entity.shopId && Date.parse(receiptAt(tx)) >= Date.parse(entity.startedAt) && Date.parse(receiptAt(tx)) <= Date.parse(now)));
      const returns = next.refunds.filter(refund => refund.status === 'paid' && (refund.shiftId === entity.id || !Object.hasOwn(refund,'shiftId') && refund.staffId === entity.staffId && refund.shopId === entity.shopId && Date.parse(refundAt(refund)) >= Date.parse(entity.startedAt) && Date.parse(refundAt(refund)) <= Date.parse(now)));
      entity.transactionIds = receipts.map(tx => tx.id); entity.refundIds = returns.map(refund => refund.id);
      entity.gross = receipts.reduce((sum, tx) => sum + tx.amount, 0); entity.refunds = returns.reduce((sum, refund) => sum + refund.amount, 0); entity.net = entity.gross - entity.refunds;
      entity.status = 'closed'; entity.endedAt = timestamp(); entity.note = String(payload.note || '').trim().slice(0, 500);
      break;
    }
    case 'UPDATE_BUSINESS': {
      ownerOnly(actor);
      for (const key of ['name', 'ownerName', 'destination']) if (key in payload) next.business[key] = requireText(payload[key], key === 'destination' ? 'Settlement destination' : 'Name', 160);
      if ('cutoff' in payload) next.business.cutoff = validCutoff(payload.cutoff);
      if ('closeMode' in payload) next.business.closeMode = closeMode(payload.closeMode);
      entity = next.business;
      break;
    }
    case 'ASSIGN_PAYMENT': {
      ownerOnly(actor);
      shopAccess(next, actor, payload.shopId);
      entity = getTransaction(next, payload.id);
      if (entity.shopId) throw new Error('This payment has already been assigned to a shop.');
      const cutoff = configuredCutoff(next,payload.shopId);
      if (entity.status === 'paid') {
        const receiptDay = businessDay(receiptAt(entity),cutoff), allocationDay = businessDay(now,cutoff);
        const previouslyClosed = next.closings.some(close => close.shopId === payload.shopId && closingTradingDay(next,close) >= receiptDay && Date.parse(close.createdAt) >= Date.parse(receiptAt(entity)) && Date.parse(close.createdAt) <= Date.parse(now));
        entity.allocationSourceTradingDay = financialTradingDay(next,entity);
        entity.allocationSourceCutoff = entity.tradingCutoff || configuredCutoff(next,null);
        entity.allocationReceiptTradingDay = receiptDay;
        entity.priorPeriodAllocation = receiptDay < allocationDay || previouslyClosed;
        // Post a late allocation as an explicit adjustment in the open shop period.
        // Confirmation time and saved closing membership remain unchanged.
        entity.tradingDay = entity.priorPeriodAllocation ? allocationDay : receiptDay;
        entity.tradingCutoff = cutoff;
      } else {
        entity.recordedTradingDay = businessDay(entity.createdAt,cutoff);
        entity.recordedCutoff = cutoff;
      }
      entity.shopId = payload.shopId;
      entity.assignedAt = timestamp();
      break;
    }
    default: throw new Error(`Unknown action: ${type}`);
  }
  refreshClosedShiftTotals(next);
  const account = ledger(next);
  if (account.balance < 0 || account.available < 0) throw new Error('This action would overdraw the merchant account.');
  next.audit.unshift({ id: id('audit'), type, entityId: entity?.id || null, by: actor.staffId || actor.role, shopId: entity?.shopId || payload.shopId || null, createdAt: timestamp() });
  next.audit = next.audit.slice(0, 500);
  next.updatedAt = timestamp(); next.revision = (snapshot.revision || 0) + 1; next.mutationId = id('change');
  return {state: next, entity: copy(entity), changed: true};
}

// Called by the server scheduler/read path. Each cutoff closes only receipts confirmed by that boundary.
export function applyAutomaticClosings(snapshot, now = new Date().toISOString()) {
  const currentTime = Date.parse(now);
  if (!Number.isFinite(currentTime)) throw new Error('Choose a valid closing date.');
  let state = copy(snapshot); const closings = [];
  const metadataChanged = freezeFinancialEvents(state);
  for (const shop of state.shops) {
    if ((shop.closeMode || state.business.closeMode || 'manual') !== 'automatic') continue;
    const cutoff = validCutoff(shop.cutoff || state.business.cutoff || '00:00');
    const latest = state.closings.filter(close => close.shopId === shop.id).sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0];
    const firstAt = latest?.createdAt || shop.createdAt || state.business.registeredAt || now;
    let boundary = Date.parse(businessDayStart(firstAt, cutoff)) + 86400000;
    // An explicit manual close before the cutoff still needs an automatic cutoff for the remaining period.
    while (boundary <= currentTime) {
      const result = reduceBusiness(state, 'CLOSE_DAY', {shopId: shop.id}, {role: 'owner'}, {now: new Date(boundary).toISOString(), automatic: true});
      state = result.state; if (result.changed) closings.push(result.entity);
      boundary += 86400000;
      // Bound catch-up work; a subsequent read can continue without losing any already archived period.
      if (closings.length >= 31) return {state, closings, metadataChanged, changed: metadataChanged || closings.length > 0};
    }
  }
  return {state, closings, metadataChanged, changed: metadataChanged || closings.length > 0};
}
