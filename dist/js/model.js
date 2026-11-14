/** Lumo's local demonstration ledger. All amounts are integer pesewas. */
import { evaluatePauseHistory } from './pause-history.js';
import { ensureSavingsParity, normalizeSavingsHack, runSavingsRules, handleSavingsParityAction } from './savings-parity-model.js';
import { prepareServicePayment } from './payment-catalog.js';
import { ensureGroupState, handleGroupLedgerAction, GROUP_LEDGER_ACTIONS, getGroupActor, canReadGroup } from './group-ledger.js';
import { ensureGroupChat, handleGroupChatAction, isGroupChatAction } from './group-chat-model.js';
import { ensureBoxProtectionState, handleBoxProtectionAction, hasBoxProtection, validatePartnerDetails, makeBoxProtection, checkProtectedWithdrawal, consumeBoxRelease, invalidateBoxReleaseRequests } from './box-protection.js';
import {ensureBoxPartnerInvitations,handleBoxPartnerInvitationAction,BOX_PARTNER_INVITATION_ACTIONS,verifiedBoxPartnerInvitation,consumeBoxPartnerInvitation,validBoxPartnerInvitations} from './box-partner-invitation.js';
import {ensurePaymentParityState,handlePaymentParityAction,syncPaymentParityAfterAction,validatePaymentParityPayment,validatePaymentParityState} from './payments-parity-model.js';
import {ensureAccountState,handleAccountAction,accountAccess} from './account-model.js';
import {ensureLearningState,validLearningState,handleLearningAction,syncLearningAfterMoneyAction,LEARNING_ACTIONS} from './learning-model.js';
import {ensureGameState,handleCampusGameAction,GAME_ACTIONS} from './learning-game-model.js';
import {ensureMoneyIQState,validMoneyIQState,handleMoneyIQAction,purgePersonalMoneyIQ,MONEY_IQ_ACTIONS} from './money-iq-model.js';
export const STORAGE_KEY = 'lumo-up-experience-v1';
const DAY = 86400000;
const MAX_MONEY = 10000000000;
const copy = value => JSON.parse(JSON.stringify(value));
const integer = (value, fallback = 0) => Number.isSafeInteger(value) ? value : fallback;
const positive = value => Number.isSafeInteger(value) && value > 0 && value <= MAX_MONEY;
const nonnegative = value => Number.isSafeInteger(value) && value >= 0 && value <= MAX_MONEY;
const text = (value, limit = 120) => String(value ?? '').trim().slice(0, limit);
const day = value => { const d = new Date(value); return Number.isFinite(d.getTime()) ? d.toISOString().slice(0, 10) : ''; };
const today = () => new Date().toISOString().slice(0, 10);
const inDays = n => new Date(new Date(`${today()}T12:00:00Z`).getTime() + n * DAY).toISOString().slice(0, 10);
let sequence = 0;
const uid = prefix => `${prefix}-${globalThis.crypto?.randomUUID?.() ?? `${Date.now().toString(36)}-${++sequence}`}`;
const fail = message => ({ ok: false, message });
const good = (message, data = {}) => ({ ok: true, message, ...data });
const moneyRemaining = item => Math.max(0, integer(item.amount) - integer(item.spent));
const iouRemaining = item => Math.max(0, integer(item.amount) - integer(item.paid));
/** Pending debt payments reserve the obligation without pretending it is paid. */
export const pendingIOUAmount = (s, id) => (s.transactions || []).filter(t => t.type === 'payment' && t.iouId === id && t.status === 'pending' && t.walletDebited !== false).reduce((n,t) => n + integer(t.amount), 0);
export const repayableIOUAmount = (s, iou) => Math.max(0, iouRemaining(iou) - (iou.type === 'owedByMe' ? pendingIOUAmount(s, iou.id) : 0));
const normalized = value => text(value).toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
const externalTypes = ['cash', 'bank', 'momo'];
const externalNameKey = value => normalized(value) || text(value).toLowerCase();
const externalKey = item => `${item.type}:${externalNameKey(item.name)}`;
const record = value => !!value && typeof value === 'object' && !Array.isArray(value);
const strictText = (value, limit) => typeof value === 'string' && value.trim().length > 0 && value.trim().length <= limit ? value.trim() : '';
const recipientFields = { id: 100, name: 60, number: 80, network: 60, bank: 60, colour: 30, emoji: 12 };

function normalizePaymentRecipient(value, rail, { destinationRequired = false } = {}) {
  if (!record(value)) return null;
  const recipient = {};
  for (const [key, limit] of Object.entries(recipientFields)) {
    if (value[key] === undefined || value[key] === null || value[key] === '') continue;
    const item = strictText(value[key], limit);
    if (!item) return null;
    recipient[key] = item;
  }
  if (!recipient.name || recipient.name.length < 2) return null;
  if (destinationRequired && rail === 'momo') {
    let number = String(recipient.number || '').replace(/[\s()-]/g, '');
    if (/^\+233\d{9}$/.test(number)) number = `0${number.slice(4)}`;
    if (!/^0\d{9}$/.test(number)) return null;
    recipient.number = number;
  }
  if (destinationRequired && rail === 'bank') {
    const number = String(recipient.number || '').replace(/\s/g, '');
    if (!/^\d{8,16}$/.test(number) || !recipient.bank) return null;
    recipient.number = number;
  }
  return recipient;
}

export function favoriteRecipientKey(value) {
  if (!record(value) || !['lumo', 'momo', 'bank'].includes(value.rail)) return '';
  const recipient = normalizePaymentRecipient(value.recipient, value.rail, { destinationRequired: true });
  if (!recipient) return '';
  const destination = recipient.number || recipient.id || recipient.name;
  return `${value.rail}:${value.rail === 'bank' ? normalized(recipient.bank) + ':' : ''}${String(destination).normalize('NFKC').replace(/\s+/g, '').replace(/^@/, '').toLowerCase()}`;
}

const merchantShopId = value => typeof value === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
export function validMerchantFavorite(value) { return record(value) && merchantShopId(value.shopId) && typeof value.savedAt === 'string' && Number.isFinite(Date.parse(value.savedAt)) && Object.keys(value).every(key => ['shopId','savedAt'].includes(key)); }

function validPaymentFavorite(value) {
  return record(value) && typeof value.id === 'string' && !!text(value.id, 100) && !!favoriteRecipientKey(value);
}

function validDemoVirtualCard(value) {
  return value === null || record(value) && typeof value.id==='string' && /^(?:demo-virtual|card-[a-zA-Z0-9-]+)$/.test(value.id) && ['active', 'frozen'].includes(value.status)
    && typeof value.last4==='string' && /^\d{4}$/.test(value.last4) && typeof value.createdAt === 'string' && Number.isFinite(Date.parse(value.createdAt))
    && (value.balance===undefined||nonnegative(value.balance)) && (value.limit===undefined||positive(value.limit))
    && Object.keys(value).every(key => ['id', 'status', 'last4', 'createdAt','balance','name','limit','history','replaces'].includes(key));
}

function preparePaymentMetadata(p) {
  const metadata = {};
  if (p.recipient !== undefined && typeof p.recipient !== 'string') {
    const recipient = normalizePaymentRecipient(p.recipient, p.rail || 'lumo');
    if (!recipient) return { error: 'Check the recipient details before paying.' };
    metadata.recipient = recipient;
  }
  for (const [key, limit] of Object.entries({ serviceId: 80, reference: 100, bundleName: 100, billerName: 120 })) {
    if (p[key] === undefined || p[key] === '') continue;
    if (!strictText(p[key], limit)) return { error: 'Check the payment reference and service details.' };
    metadata[key] = p[key].trim();
  }
  if (p.paymentKind !== undefined) {
    if (!['person', 'service'].includes(p.paymentKind)) return { error: 'Choose a valid payment type.' };
    metadata.paymentKind = p.paymentKind;
  }
  if (p.hubTab !== undefined) {
    if (!['send', 'campus', 'bills'].includes(p.hubTab)) return { error: 'Choose a valid payment destination.' };
    metadata.hubTab = p.hubTab;
  }
  if (p.paymentKind === 'service' || p.serviceId !== undefined || p.serviceFields !== undefined) {
    if (p.paymentKind !== 'service' || !strictText(p.serviceId, 80) || !record(p.serviceFields)) return { error: 'Review this service before paying.' };
    const prepared = prepareServicePayment(p.serviceId, p.serviceFields);
    if (!prepared.ok || !prepared.payment) return { error: prepared.message || 'Check the service details.' };
    const canonical = prepared.payment;
    if (p.amount !== canonical.amount || p.category !== canonical.category || p.rail !== canonical.rail
      || text(p.reference) !== text(canonical.reference) || text(p.bundleName) !== text(canonical.bundleName) || text(p.billerName) !== text(canonical.billerName)
      || (p.merchant !== undefined && p.merchant !== canonical.recipient?.name)
      || metadata.recipient?.name !== canonical.recipient?.name || (metadata.recipient?.number || '') !== (canonical.recipient?.number || '')) {
      return { error: 'The service details changed. Review them again before paying.' };
    }
    metadata.recipient = normalizePaymentRecipient(canonical.recipient, canonical.rail);
    metadata.serviceFields = copy(canonical.serviceFields || canonical.fields);
  }
  return { metadata };
}

export function createEmptyState(profile = {}) {
  const state = {
    version: 1, onboardingDone: false,
    profile: { name: text(profile.name || 'Ama', 60), phone: text(profile.phone, 30), campus: text(profile.campus || 'University of Ghana', 80) },
    wallet: 0, buffer: 10000, income: { amount: 0, nextDate: '' },
    budget: { items: [], created: false }, boxes: [], transactions: [], ious: [], groups: [], externalBalances: [], paymentFavorites: [], merchantFavorites: [], virtualCard: null,
    settings: { hideBalance: true, notifications: true, pin: '1234' }, recovery: null,
    _appliedActions: {},
  };
  return migrateState(state);
}

export function createDemoState() {
  const s = createEmptyState({ name: 'Ama Mensah', phone: '024 000 0000', campus: 'University of Ghana' });
  s.onboardingDone = true;
  s.wallet = 248000;
  s.income = { amount: 150000, nextDate: inDays(11) };
  s.budget = {
    created: true,
    items: [
      { id: 'food', name: 'Food', emoji: '🍲', amount: 55000, spent: 10000, due: inDays(11) },
      { id: 'transport', name: 'Transport', emoji: '🚌', amount: 24000, spent: 4000, due: inDays(11) },
      { id: 'data', name: 'Data', emoji: '📱', amount: 12000, spent: 2000, due: inDays(6) },
      { id: 'essentials', name: 'Essentials', emoji: '🏠', amount: 40000, spent: 5000, due: inDays(9) },
    ],
  };
  s.boxes = [
    { id: 'laptop', name: 'My next laptop', emoji: '💻', target: 600000, balance: 42000, deadline: inDays(180), hack: { type: 'roundup', value: 100 }, locked: false },
    { id: 'escape', name: 'December escape', emoji: '🌴', target: 200000, balance: 22000, deadline: inDays(50), hack: { type: 'none', value: 0 }, locked: false },
    { id: 'cushion', name: 'Just in case', emoji: '🛟', target: 100000, balance: 10000, deadline: '', hack: { type: 'none', value: 0 }, locked: false },
  ];
  s.ious = [
    { id: 'iou-akos', name: 'Akos', type: 'owedToMe', amount: 9000, paid: 0, due: inDays(1), status: 'open', note: 'Our lunch and printing run' },
    { id: 'iou-kwame', name: 'Kwame', type: 'owedByMe', amount: 5000, paid: 0, due: inDays(30), status: 'open', note: 'Shared ride home' },
  ];
  s.groups = [{
    id: 'group-weekend', name: 'Our Cape Coast weekend', emoji: '🌊', target: 200000, balance: 90000,
    members: [
      { id: 'me', name: 'You', amount: 25000, role: 'approver' },
      { id: 'senam', name: 'Senam', amount: 25000, role: 'approver' },
      { id: 'jonathan', name: 'Jonathan', amount: 20000, role: 'approver' },
      { id: 'akos', name: 'Akos', amount: 20000, role: 'contributor' },
    ], mandate: { approvers: 3, threshold: 2 }, payouts: [],
  }];
  const at = (ago, hour = 12) => `${inDays(-ago)}T${String(hour).padStart(2, '0')}:15:00.000Z`;
  s.transactions = [
    { id: 'tx-demo-1', type: 'payment', direction: 'out', amount: 2500, merchant: 'Gɔbɛ Spot', category: 'Food', status: 'success', at: at(0), note: 'Lunch sorted', emoji: '🍲', rail: 'lumo', walletDebited: true, budgetItemId: 'food', budgetAllocation: 2500 },
    { id: 'tx-demo-2', type: 'payment', direction: 'out', amount: 1500, merchant: 'Campus shuttle', category: 'Transport', status: 'success', at: at(0, 9), note: 'Legon → Madina', emoji: '🚌', rail: 'momo', walletDebited: true, budgetItemId: 'transport', budgetAllocation: 1500 },
    { id: 'tx-demo-3', type: 'payment', direction: 'out', amount: 2000, merchant: 'MTN Data', category: 'Data', status: 'success', at: at(1, 17), note: 'Data for the week', emoji: '📱', rail: 'momo', walletDebited: true, budgetItemId: 'data', budgetAllocation: 2000 },
    { id: 'tx-demo-4', type: 'income', direction: 'in', amount: 150000, merchant: 'Allowance from Mum', category: 'Income', status: 'success', at: at(2, 10), note: 'Thanks, Mum 💚', emoji: '💚', rail: 'momo' },
    { id: 'tx-demo-5', type: 'saving', direction: 'out', amount: 10000, merchant: 'My next laptop', category: 'Money Box', status: 'success', at: at(2, 11), note: 'A little closer', emoji: '💻', rail: 'internal' },
    { id: 'tx-demo-6', type: 'payment', direction: 'out', amount: 3500, merchant: 'Balme Library prints', category: 'Essentials', status: 'success', at: at(3), note: 'Project submission', emoji: '📚', rail: 'lumo', walletDebited: true, budgetItemId: 'essentials', budgetAllocation: 3500 },
  ];
  ensureGroupState(s); s.groups.forEach(ensureGroupChat); ensureBoxProtectionState(s); migrateState(s);
  return migrateState(s);
}

export function validStoredState(s) {
  return s && s.version === 1 && validatePaymentParityState(s) && validBoxPartnerInvitations(s) && validLearningState(s) && validMoneyIQState(s) && nonnegative(s.wallet) && nonnegative(s.buffer)
    && s.profile && s.income && s.budget && Array.isArray(s.budget.items)
    && Array.isArray(s.boxes) && Array.isArray(s.transactions) && Array.isArray(s.ious)
    && Array.isArray(s.groups) && s.settings && nonnegative(s.income.amount)
    && (s.paymentFavorites === undefined || Array.isArray(s.paymentFavorites) && s.paymentFavorites.length <= 30 && s.paymentFavorites.every(validPaymentFavorite)
      && new Set(s.paymentFavorites.map(item => item.id)).size === s.paymentFavorites.length
      && new Set(s.paymentFavorites.map(favoriteRecipientKey)).size === s.paymentFavorites.length)
    && (s.merchantFavorites === undefined || Array.isArray(s.merchantFavorites) && s.merchantFavorites.length <= 30 && s.merchantFavorites.every(validMerchantFavorite) && new Set(s.merchantFavorites.map(item => item.shopId)).size === s.merchantFavorites.length)
    && (s.virtualCard === undefined || validDemoVirtualCard(s.virtualCard))
    && Array.isArray(s.externalBalances)
    && s.externalBalances.every(item => item && typeof item.id === 'string' && text(item.id)
      && externalTypes.includes(item.type) && typeof item.name === 'string' && text(item.name, 60)
      && item.name === text(item.name, 60) && nonnegative(item.balance)
      && typeof item.updatedAt === 'string' && Number.isFinite(Date.parse(item.updatedAt)))
    && new Set(s.externalBalances.map(item => item.id)).size === s.externalBalances.length
    && new Set(s.externalBalances.map(externalKey)).size === s.externalBalances.length
    && s.budget.items.every(i => i && typeof i.id === 'string' && text(i.name) && nonnegative(i.amount) && nonnegative(i.spent))
    && s.boxes.every(b => b && typeof b.id === 'string' && text(b.name) && nonnegative(b.target) && nonnegative(b.balance))
    && s.ious.every(i => i && positive(i.amount) && nonnegative(i.paid ?? 0) && integer(i.paid) <= i.amount && ['owedToMe', 'owedByMe'].includes(i.type))
    && s.groups.every(g => g && nonnegative(g.balance) && Array.isArray(g.members) && Array.isArray(g.payouts) && g.mandate);
}

function syncActivationProgress(s) {
  if (!s.activation?.fundingDeferred || s.activation.status === 'ready') return;
  if (s.wallet > 0) s.activation.status = s.budget?.created && s.budget.items.length ? 'ready' : 'needs-plan';
}

/** Extend older saves without removing any prior ledger records. */
export function migrateState(s) {
  if (!s || typeof s !== 'object' || Array.isArray(s)) return s;
  if (s.version === 1 && s.externalBalances === undefined) s.externalBalances=[];
  if(s.version===1){
    const merchantIds=new Set();s.merchantFavorites=(Array.isArray(s.merchantFavorites)?s.merchantFavorites:[]).filter(validMerchantFavorite).filter(value=>{if(merchantIds.has(value.shopId)||merchantIds.size>=30)return false;merchantIds.add(value.shopId);return true;}).map(value=>({shopId:value.shopId,savedAt:value.savedAt}));
    const favorites=Array.isArray(s.paymentFavorites)?s.paymentFavorites:[],ids=new Set(),destinations=new Set();
    s.paymentFavorites=favorites.filter(validPaymentFavorite).flatMap(value=>{const key=favoriteRecipientKey(value),id=text(value.id,100);if(ids.has(id)||destinations.has(key)||ids.size>=30)return [];ids.add(id);destinations.add(key);return [{id,rail:value.rail,recipient:normalizePaymentRecipient(value.recipient,value.rail,{destinationRequired:true})}];});
    // An invalid old display-only card may be discarded. Funded card records must
    // reach validation and recovery rather than silently losing their balance.
    if(!Array.isArray(s.virtualCards)&&s.virtualCard&&!validDemoVirtualCard(s.virtualCard)&&!(s.virtualCard.balance>0))s.virtualCard=null;
  }
  ensureSavingsParity(s); ensurePaymentParityState(s); ensureAccountState(s); ensureBoxPartnerInvitations(s); ensureLearningState(s); ensureGameState(s); ensureMoneyIQState(s);
  if(Array.isArray(s.groups)){ensureGroupState(s);s.groups.forEach(ensureGroupChat);}
  if(Array.isArray(s.boxes))ensureBoxProtectionState(s);
  syncActivationProgress(s);
  return s;
}

export function loadState() {
  try {
    const raw = globalThis.localStorage?.getItem(STORAGE_KEY);
    if (!raw) return createEmptyState();
    const s = JSON.parse(raw);
    // Earlier v1 saves predate manually tracked money. Preserve their complete ledger.
    if (s && s.version === 1 && s.externalBalances === undefined) s.externalBalances = [];
    if (s && s.version === 1) {
      // Optional display preferences must not make an otherwise valid ledger disappear.
      const favorites = Array.isArray(s.paymentFavorites) ? s.paymentFavorites : [];
      const ids = new Set(), destinations = new Set();
      s.paymentFavorites = favorites.filter(validPaymentFavorite).flatMap(value => {
        const key = favoriteRecipientKey(value), id = text(value.id, 100);
        if (ids.has(id) || destinations.has(key) || ids.size >= 30) return [];
        ids.add(id); destinations.add(key);
        return [{ id, rail: value.rail, recipient: normalizePaymentRecipient(value.recipient, value.rail, { destinationRequired: true }) }];
      });
      if (!validDemoVirtualCard(s.virtualCard)) s.virtualCard = null;
    }
    if (!validStoredState(s)) return createEmptyState();
    s._appliedActions ||= {};
    s.ious.forEach(i => { i.paid = integer(i.paid); });
    ensureGroupState(s); s.groups.forEach(ensureGroupChat); ensureBoxProtectionState(s); migrateState(s);
    return s;
  } catch { return createEmptyState(); }
}

export function saveState(s) {
  if (!validStoredState(s)) return false;
  try {
    if (!globalThis.localStorage) return false;
    globalThis.localStorage.setItem(STORAGE_KEY, JSON.stringify(s));
    return true;
  } catch { return false; }
}

/** A guide needs recorded timing; an empty account never promises an income date. */
export function getGuidanceHorizon(s, now = new Date()) {
  const recordedDate = value => typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) && day(value) === value ? value : '';
  const currentDay = now.toISOString().slice(0, 10);
  const planDate = s.budget?.created === true && recordedDate(s.budget.endDate) || '';
  const incomeDate = positive(s.income?.amount) && recordedDate(s.income.nextDate) || '';
  const recoveryDate = s.recovery?.active && recordedDate(s.recovery.checkInDate || s.recovery.nextDate) || '';
  const date = recoveryDate || planDate || incomeDate;
  const source = recoveryDate ? 'recovery' : planDate ? 'plan' : incomeDate ? 'income' : '';
  // A shorter temporary guide must not drop existing commitments. A longer one
  // must include debts falling due before its check-in; overdue debts always count.
  const commitmentDate = [currentDay, planDate || incomeDate, recoveryDate].filter(Boolean).sort().at(-1);
  return { date, source, recorded: !!date, current: !!date && date >= currentDay, commitmentDate, planEndDate: planDate || incomeDate };
}

export function getSummary(s, now = new Date()) {
  const available = Math.max(0, integer(s.wallet));
  const guide = getGuidanceHorizon(s, now), planEndDate = guide.planEndDate;
  const horizon = guide.commitmentDate;
  const plannedBudget = (s.budget?.items || []).reduce((sum, item) => sum + moneyRemaining(item), 0);
  const dueDebts = (s.ious || []).filter(i => i.type === 'owedByMe' && i.status === 'open' && (!day(i.due) || day(i.due) <= horizon));
  const coverage=new Map((s.budget.items||[]).map(i=>[i.id,moneyRemaining(i)]));
  const planned = plannedBudget + dueDebts.reduce((sum,i)=>{const remaining=repayableIOUAmount(s,i),cover=Math.min(remaining,coverage.get(i.budgetItemId)||0);if(cover)coverage.set(i.budgetItemId,coverage.get(i.budgetItemId)-cover);return sum+remaining-cover;},0);
  const spendable = Math.max(0, available - planned - Math.max(0, integer(s.buffer)));
  const savings = (s.boxes || []).reduce((sum, b) => sum + Math.max(0, integer(b.balance)), 0);
  const transferHolds = (s.transactions || []).filter(t => t.boxTransfer && t.status === 'pending').reduce((n,t) => n+t.amount,0);
  const pendingPaymentHolds = (s.transactions || []).filter(t => t.type === 'payment' && t.status === 'pending' && t.walletDebited !== false).reduce((n,t) => n + integer(t.amount) + integer(t.fee), 0);
  const pendingContributionHolds = (s.transactions || []).filter(t => t.type === 'contribution' && t.status === 'pending' && t.walletDebited === true).reduce((n,t) => n + integer(t.amount), 0);
  const pendingCardHolds = (s.transactions || []).filter(t => t.type === 'card-purchase' && t.status === 'pending' && t.held === true).reduce((n,t) => n + integer(t.amount), 0);
  const cardBalance = (s.virtualCards || []).reduce((n,c) => n + Math.max(0, integer(c.balance)),0);
  const outsideTotal = (s.externalBalances || []).reduce((sum, item) => sum + Math.max(0, integer(item.balance)), 0);
  const expected = Math.max(0, integer(s.income?.amount)) + (s.ious || []).filter(i => i.type === 'owedToMe' && i.status === 'open').reduce((sum, i) => sum + iouRemaining(i), 0);
  const guidanceDate = guide.date;
  const guideHorizon = guidanceDate;
  const dateDifference = guide.current ? Math.ceil((new Date(`${guideHorizon}T12:00:00Z`) - new Date(`${now.toISOString().slice(0, 10)}T12:00:00Z`)) / DAY) : -1;
  const daysLeft = dateDifference < 0 ? 0 : Math.max(1, dateDifference);
  return { available, planned, spendable, savings, transferHolds, pendingPaymentHolds, pendingCardHolds, pendingContributionHolds, planEndDate, guidanceDate, guidanceSource: guide.source, hasDailyGuide: guide.current, commitmentDate: guide.commitmentDate, cardBalance, cardTotal:cardBalance, total: available + savings + transferHolds + pendingPaymentHolds + pendingCardHolds + pendingContributionHolds + cardBalance, outsideTotal, allMoneyTotal: available + savings + transferHolds + pendingPaymentHolds + pendingCardHolds + pendingContributionHolds + cardBalance + outsideTotal, expected, daysLeft, dailyAllowance: daysLeft > 0 ? Math.floor(spendable / daysLeft) : 0 };
}

function budgetMatch(s, category) {
  const key=budgetCategoryKey(category);
  if(!key)return null;
  return (s.budget?.items||[]).find(i=>budgetCategoryKey(i.name)===key||budgetCategoryKey(i.id)===key)||null;
}

export function evaluatePayment(s, payload = {}, now = new Date()) {
  const amount = integer(payload.amount, -1);
  const fee = nonnegative(payload.fee) ? payload.fee : 0;
  const total = Math.max(0, amount) + fee;
  const summary = getSummary(s, now);
  const rule = (s.categoryRules || []).find(r => r.merchantKey === String(payload.merchant || payload.recipient?.name || payload.recipient||'').trim().toLowerCase());
  const explicitCategory=!!payload.categoryExplicit || (payload.category && normalized(payload.category)!=='other');
  const debt = payload.iouId ? (s.ious || []).find(i=>i.id===payload.iouId && i.type==='owedByMe' && i.status==='open') : null;
  const item = payload.iouId ? s.budget.items.find(i=>i.id===debt?.budgetItemId) : payload.budgetItemId ? s.budget.items.find(i=>i.id===payload.budgetItemId) : explicitCategory ? budgetMatch(s,payload.category) : rule ? s.budget.items.find(i=>i.id===rule.budgetItemId) : budgetMatch(s,payload.category);
  const allocation = item ? Math.min(Math.max(0, amount), moneyRemaining(item)) : 0;
  const afterAvailable = summary.available - total;
  let afterPlanned = summary.planned;
  const settlingIOU = payload.iouId ? (s.ious || []).find(i => i.id === payload.iouId && i.type === 'owedByMe' && i.status === 'open') : null;
  const invalidIOU = payload.iouId && (!settlingIOU || amount > repayableIOUAmount(s, settlingIOU));
  if (positive(amount) && !invalidIOU) {
    // A purchase can consume a category that also covers an IOU. Recalculate
    // its uncovered debt instead of treating that category release as free money.
    const preview = {...s, budget:{...s.budget,items:s.budget.items.map(i=>i.id===item?.id?{...i,spent:integer(i.spent)+amount}:i)},ious:s.ious.map(i=>i.id===settlingIOU?.id?{...i,paid:integer(i.paid)+amount,status:integer(i.paid)+amount===i.amount?'settled':'open'}:i)};
    afterPlanned = getSummary(preview, now).planned;
  }
  const plannedRelease = summary.planned - afterPlanned;
  const rawAfterSpendable = afterAvailable - afterPlanned - integer(s.buffer);
  const afterSpendable = Math.max(0, rawAfterSpendable);
  const baselineShortfall = Math.max(0, summary.planned + integer(s.buffer) - summary.available);
  const additionalShortfall = Math.max(0, -rawAfterSpendable - baselineShortfall);
  const daysImpact = summary.dailyAllowance > 0 ? Math.max(0, Math.round((summary.spendable - afterSpendable) / summary.dailyAllowance)) : 0;
  let reason = '';
  if (invalidIOU) reason = 'Choose an amount within this open IOU.';
  else if (!positive(amount)) reason = 'Enter an amount greater than zero.';
  else if (total > summary.available) reason = 'There is not enough available money for this payment.';
  else if (rawAfterSpendable < 0) reason = baselineShortfall > 0
    ? additionalShortfall > 0 ? 'This payment would increase the existing shortfall in your plan or cushion.' : 'Your plan already has a shortfall. This payment leaves that gap unchanged.'
    : 'This payment would use money set aside for your plan or your minimum balance.';
  else if (summary.hasDailyGuide && amount - plannedRelease > summary.dailyAllowance * 1.5 && amount - plannedRelease >= 5000) reason = 'This uses more than a day of your flexible spending money.';
  const history = evaluatePauseHistory(s,{...payload,budgetItemId:item?.id||payload.budgetItemId},{summary,now});
  if(!reason&&history.show&&positive(amount)&&total<=summary.available)reason=history.reason;
  return {
    historySignals: history.signals, needed: !!reason && positive(amount) && total <= summary.available,
    allowed: !invalidIOU && positive(amount) && total <= summary.available, fee, total,
    reason, afterAvailable, afterSpendable, rawAfterSpendable, afterPlanned, baselineShortfall, additionalShortfall,
    daysImpact, budgetAllocation: allocation, budgetItemId: item?.id || null,
  };
}

function transaction(s, values) {
  const tx = { id: uid('tx'), type: 'payment', direction: 'out', amount: 0, merchant: '', category: 'Other', status: 'success', at: new Date().toISOString(), note: '', emoji: '↗', rail: 'lumo', ...values };
  s.transactions.unshift(tx);
  return tx;
}

/** Amend the originating plan only. Old receipts must never consume a new period's spending. */
export function adjustTransactionBudgetSpend(s, tx, delta) {
  const budget = tx.budgetPeriodId === s.budget.periodId ? s.budget : (s.budgetHistory || []).find(b => b.periodId === tx.budgetPeriodId);
  const item = budget?.items?.find(i => i.id === tx.budgetItemId);
  if (!item) return false;
  item.spent = Math.max(0, integer(item.spent) + delta);
  if (budget !== s.budget) budget.totalSpent = budget.items.reduce((n,i) => n + integer(i.spent), 0);
  return true;
}

export function budgetCategoryKey(name) {
  const key = String(name ?? '').normalize('NFKC').trim().replace(/\s+/gu, ' ').toLocaleLowerCase('en');
  const known = key.replace(/[^a-z0-9]+/g, ' ').trim();
  const aliases = {
    food:'food & groceries', groceries:'food & groceries', takeaway:'food & groceries', dining:'food & groceries', meals:'food & groceries', 'food groceries':'food & groceries', 'food and groceries':'food & groceries',
    data:'data & airtime', airtime:'data & airtime', 'mobile data':'data & airtime', 'data airtime':'data & airtime', 'data and airtime':'data & airtime',
    transport:'transport', travel:'transport', rides:'transport',
    essentials:'fees & essentials', bills:'fees & essentials', accommodation:'fees & essentials', 'fees essentials':'fees & essentials', 'fees and essentials':'fees & essentials',
  };
  return Object.hasOwn(aliases, known) ? aliases[known] : key;
}

function prepareBudgetItems(input, oldItems = []) {
  if (!Array.isArray(input) || input.length > 30) return { error: 'Add between one and thirty budget items.' };
  const items = [];
  const ids = new Set();
  const categories = new Set();
  for (const value of input) {
    const name = text(value.name, 60);
    if (!name || !nonnegative(value.amount)) return { error: 'Give each budget item a name and a valid amount.' };
    const category = budgetCategoryKey(name);
    if (categories.has(category)) return { error: `${name} is already in your budget. Edit its existing amount instead.` };
    categories.add(category);
    const old = oldItems.find(i => i.id === value.id);
    const spent = value.spent === undefined ? integer(old?.spent) : value.spent;
    if (!nonnegative(spent)) return { error: 'The spent amount must be zero or more.' };
    const due = value.due ? day(value.due) : '';
    if (value.due && !due) return { error: 'Choose a valid budget date.' };
    const id = text(value.id, 100) || uid('budget');
    if (ids.has(id)) return { error: 'Each budget item must have a different identifier.' };
    ids.add(id);
    items.push({ id, name, emoji: text(value.emoji || old?.emoji || '📌', 12), amount: value.amount, spent, due });
  }
  return { items };
}

function normalizeHack(value) { return normalizeSavingsHack(value); }
function runSavingHacks(s, payment) {
  const transfers = runSavingsRules(s, {kind:'payment',id:payment.id,amount:payment.amount}, {transaction,getSummary});
  payment.savingTransfers = transfers; return transfers;
}

function perform(s, type, p) {
  const moneyIQ=handleMoneyIQAction(s,type,p);if(moneyIQ)return moneyIQ;
  const game=handleCampusGameAction(s,type,p);if(game)return game;
  const learning=handleLearningAction(s,type,p,{getSummary});if(learning)return learning;
  ensureSavingsParity(s);
  const partnerInvitation=handleBoxPartnerInvitationAction(s,type,p);if(partnerInvitation)return partnerInvitation;
  const account = handleAccountAction(s,type,p,{uid});
  if(account)return account;
  const paymentParity=handlePaymentParityAction(s,type,p,{transaction,getSummary,evaluatePayment,adjustTransactionBudgetSpend,applyCore:(action,payload)=>perform(s,action,payload)});
  if(paymentParity)return paymentParity;
  const parity = handleSavingsParityAction(s, type, p, {transaction,getSummary,uid,prepareBudgetItems,adjustTransactionBudgetSpend});
  if (parity) return parity;
  const protectionResult = handleBoxProtectionAction(s, type, p);
  if (protectionResult) return protectionResult;
  const groupResult = handleGroupLedgerAction(s, type, p) || handleGroupChatAction(s, type, p);
  if (groupResult) { if (groupResult.ok) s.groups.forEach(ensureGroupChat); return groupResult; }
  if (type === 'saveMerchantFavorite') {
    if (!merchantShopId(p.shopId)) return fail('Choose a connected Lumo shop.');
    const favorites = s.merchantFavorites ||= [];
    if (favorites.some(item => item.shopId === p.shopId)) return good('This shop is already saved.', { shopId: p.shopId, duplicate: true });
    if (favorites.length >= 30) return fail('You can save up to thirty shops.');
    favorites.push({ shopId: p.shopId, savedAt: new Date().toISOString() });
    return good('Shop saved to your favourites.', { shopId: p.shopId });
  }
  if (type === 'removeMerchantFavorite') {
    if (!merchantShopId(p.shopId)) return fail('Choose a saved shop.');
    const favorites = s.merchantFavorites ||= [], index = favorites.findIndex(item => item.shopId === p.shopId);
    if (index < 0) return good('This shop is no longer saved.', { shopId: p.shopId, duplicate: true });
    favorites.splice(index, 1); return good('Shop removed from your favourites.', { shopId: p.shopId });
  }
  if (type === 'savePaymentFavorite') {
    if (!['lumo', 'momo', 'bank'].includes(p.rail)) return fail('Choose Lumo, mobile money or a bank account.');
    const recipient = normalizePaymentRecipient(p.recipient, p.rail, { destinationRequired: true });
    if (!recipient) return fail('Check this person’s name and payment details.');
    const favorites = s.paymentFavorites || [];
    const current = p.id === undefined ? null : favorites.find(item => item.id === p.id);
    if (p.id !== undefined && !current) return fail('That favourite could not be found.');
    const key = favoriteRecipientKey({ rail: p.rail, recipient });
    const duplicate = favorites.find(item => item.id !== current?.id && favoriteRecipientKey(item) === key);
    if (duplicate) return current ? fail('That destination is already saved as a favourite.') : good('Already in your favourites.', { id: duplicate.id, favorite: copy(duplicate), duplicate: true });
    if (!current && favorites.length >= 30) return fail('You can save up to thirty favourites in this demo.');
    if (current) {
      current.rail = p.rail; current.recipient = recipient;
      return good('Favourite updated.', { id: current.id, favorite: copy(current) });
    }
    const favorite = { id: uid('favorite'), rail: p.rail, recipient };
    favorites.push(favorite); s.paymentFavorites = favorites;
    return good('Saved to your favourites.', { id: favorite.id, favorite: copy(favorite) });
  }
  if (type === 'removePaymentFavorite') {
    const index = (s.paymentFavorites || []).findIndex(item => item.id === p.id);
    if (index < 0) return fail('That favourite could not be found.');
    const [favorite] = s.paymentFavorites.splice(index, 1);
    return good('Favourite removed.', { id: favorite.id });
  }
  if (type === 'createDemoVirtualCard') {
    if (s.virtualCard) return good('Your demo virtual card is already here.', { virtualCard: copy(s.virtualCard), duplicate: true });
    s.virtualCard = { id: 'demo-virtual', status: 'active', last4: '4242', createdAt: new Date().toISOString() };
    return good('Demo virtual card created. No live card was issued.', { virtualCard: copy(s.virtualCard) });
  }
  if (type === 'setDemoVirtualCardFrozen') {
    if (!s.virtualCard) return fail('Create a demo virtual card first.');
    if (typeof p.frozen !== 'boolean') return fail('Choose whether this demo card should be frozen.');
    s.virtualCard.status = p.frozen ? 'frozen' : 'active';
    return good(p.frozen ? 'Demo card frozen.' : 'Demo card unfrozen.', { virtualCard: copy(s.virtualCard) });
  }
  if (type === 'createExternalBalance' || type === 'updateExternalBalance') {
    const existing = type === 'updateExternalBalance' ? s.externalBalances.find(item => item.id === p.id) : null;
    if (type === 'updateExternalBalance' && !existing) return fail('That balance could not be found.');
    const nextType = p.type === undefined ? existing?.type : p.type;
    const nextName = p.name === undefined && existing ? existing.name : typeof p.name === 'string' ? text(p.name, 60) : '';
    if (!externalTypes.includes(nextType)) return fail('Choose cash, a bank account or a MoMo wallet.');
    if (!nextName) return fail('Give this money a name.');
    if (!nonnegative(p.balance)) return fail('Enter a valid balance, including zero.');
    const duplicate = s.externalBalances.some(item => item.id !== existing?.id && externalKey(item) === externalKey({ type: nextType, name: nextName }));
    if (duplicate) return fail('That balance is already here. Use a different name for a separate account.');
    if (existing) {
      const before = copy(existing);
      Object.assign(existing, { type: nextType, name: nextName, balance: p.balance, updatedAt: new Date().toISOString() });
      s.externalBalanceHistory.unshift({id:uid('external-history'),externalBalanceId:existing.id,type:'updated',at:new Date().toISOString(),before,after:copy(existing)});
      return good('Balance updated.', { id: existing.id, externalBalance: existing });
    }
    const externalBalance = { id: uid('external'), type: nextType, name: nextName, balance: p.balance, updatedAt: new Date().toISOString() };
    s.externalBalances.push(externalBalance);
    s.externalBalanceHistory.unshift({id:uid('external-history'),externalBalanceId:externalBalance.id,type:'created',at:new Date().toISOString(),after:copy(externalBalance)});
    return good('Balance added to your money overview.', { id: externalBalance.id, externalBalance });
  }
  if (type === 'removeExternalBalance') {
    const index = s.externalBalances.findIndex(item => item.id === p.id);
    if (index < 0) return fail('That balance could not be found.');
    const [externalBalance] = s.externalBalances.splice(index, 1);
    s.externalBalanceHistory.unshift({id:uid('external-history'),externalBalanceId:externalBalance.id,type:'removed',at:new Date().toISOString(),before:copy(externalBalance)});
    return good('Balance removed from your overview.', { id: externalBalance.id, externalBalance });
  }
  if (type === 'fund') {
    if (!positive(p.amount)) return fail('Enter a valid amount to add.');
    if (!nonnegative(s.wallet + p.amount)) return fail('That amount is above this demo’s balance limit.');
    s.wallet += p.amount;
    const tx = transaction(s, { type: 'income', direction: 'in', amount: p.amount, merchant: text(p.source || p.merchant || 'Money added'), category: 'Income', emoji: '↓', rail: text(p.rail || 'momo'), note: text(p.note || 'Added to your available money') });
    runSavingsRules(s,{kind:'income',id:tx.id,amount:tx.amount},{transaction,getSummary});
    return good('Money added.', { id: tx.id, transaction: tx });
  }
  if (type === 'setExpectedIncome') {
    if(!nonnegative(p.amount)||!day(p.date))return fail('Choose a valid expected amount and date.');
    s.income={amount:p.amount,nextDate:day(p.date)};return good('Your expected income is updated.');
  }
  if (type === 'payment') {
    const debt=p.iouId?s.ious.find(i=>i.id===p.iouId&&i.type==='owedByMe'&&i.status==='open'):null;
    if(p.iouId&&(!debt||!['lumo','momo','bank'].includes(p.rail||'lumo')||!positive(p.amount)||p.amount>repayableIOUAmount(s,debt)))return fail('Choose an amount within this IOU, excluding repayments still pending.');
    const invalid=validatePaymentParityPayment(s,p);if(invalid)return invalid;
    if (!positive(p.amount)) return fail('Enter a valid payment amount.');
    const recipient = text(p.merchant || (typeof p.recipient === 'object' ? p.recipient?.name : p.recipient));
    if (!recipient) return fail('Choose who you are paying.');
    const fee = p.fee === undefined ? 0 : p.fee;
    if (!nonnegative(fee)) return fail('Choose a valid payment fee.');
    if (p.amount + fee > s.wallet) return fail('You do not have enough available money, including the fee.');
    const status = p.status || 'success';
    if (!['success', 'pending', 'failed'].includes(status)) return fail('Choose a valid payment outcome.');
    const prepared = preparePaymentMetadata(p);
    if (prepared.error) return fail(prepared.error);
    const evaluation = evaluatePayment(s, p);
    const rememberedCategory=(!p.category||normalized(p.category)==='other')&&!p.categoryExplicit&&evaluation.budgetItemId?s.budget.items.find(i=>i.id===evaluation.budgetItemId)?.name:null;
    const tx = transaction(s, { amount: p.amount, fee, total:p.amount+fee, budgetPeriodId:s.budget.periodId, rememberCategory:!!p.rememberCategory, merchant: recipient, category: text(rememberedCategory || p.category || 'Other'), status, note: text(p.note), rail: text(p.rail || 'lumo'), emoji: text(p.emoji || '↗', 12), ...prepared.metadata, ...(debt?{iouId:debt.id,iouApplied:status==='success'}:{}), budgetItemId: evaluation.budgetItemId, budgetAllocation: status === 'failed' ? 0 : evaluation.budgetAllocation, budgetSpentAmount: status !== 'failed' && evaluation.budgetItemId ? p.amount : 0, walletDebited: status !== 'failed' });
    if (status !== 'failed') {
      s.wallet -= p.amount + fee;
      const item = s.budget.items.find(i => i.id === tx.budgetItemId);
      if (item) item.spent += tx.budgetSpentAmount;
      if(debt&&status==='success'){debt.paid=integer(debt.paid)+p.amount;if(debt.paid===debt.amount){debt.status='settled';debt.settledAt=new Date().toISOString();}}
      if (status === 'success') { runSavingHacks(s, tx); if(p.rememberCategory && evaluation.budgetItemId) handleSavingsParityAction(s,'rememberCategory',{merchant:recipient,budgetItemId:evaluation.budgetItemId},{transaction,getSummary}); }
    }
    return good(status === 'failed' ? 'Payment failed. Your money has not moved.' : status === 'pending' ? 'Payment pending. The amount is held while it is confirmed.' : 'Payment sent.', { id: tx.id, transaction: tx, evaluation });
  }
  if (type === 'resolvePayment' || type === 'completePayment') {
    const tx = s.transactions.find(t => t.id === (p.transactionId || p.id));
    if (!tx || tx.type !== 'payment') return fail('That payment could not be found.');
    if (tx.status !== 'pending') return fail('This payment already has a final outcome.');
    if (!['success', 'failed'].includes(p.status)) return fail('Choose a confirmed payment outcome.');
    const debt=tx.iouId?s.ious.find(i=>i.id===tx.iouId&&i.type==='owedByMe'):null;
    if(p.status==='success'&&tx.iouId&&(!debt||debt.status!=='open'||tx.amount>iouRemaining(debt)))return fail('This IOU changed. Resolve this repayment as failed before reviewing a new payment.');
    if (p.status === 'failed' && tx.walletDebited) {
      s.wallet += tx.amount + integer(tx.fee);
      adjustTransactionBudgetSpend(s, tx, -integer(tx.budgetSpentAmount, integer(tx.budgetAllocation)));
      tx.walletDebited = false;
    }
    tx.status = p.status;
    if(debt&&p.status==='success'){debt.paid=integer(debt.paid)+tx.amount;tx.iouApplied=true;if(debt.paid===debt.amount){debt.status='settled';debt.settledAt=new Date().toISOString();}}
    tx.resolvedAt = new Date().toISOString();
    if (p.status === 'success') { runSavingHacks(s, tx); if(tx.rememberCategory&&tx.budgetItemId)handleSavingsParityAction(s,'rememberCategory',{merchant:tx.merchant,budgetItemId:tx.budgetItemId},{transaction,getSummary}); }
    return good(p.status === 'success' ? 'Payment confirmed.' : 'Payment failed. The held amount is available again.', { id: tx.id, transaction: tx });
  }
  if (type === 'reversePayment') {
    const tx = s.transactions.find(t => t.id === (p.transactionId || p.id));
    if (!tx || tx.type !== 'payment') return fail('That payment could not be found.');
    if (!['success', 'pending'].includes(tx.status)) return fail('This payment cannot be reversed again.');
    if (tx.walletDebited !== false) {
      s.wallet += tx.amount + integer(tx.fee);
      adjustTransactionBudgetSpend(s, tx, -integer(tx.budgetSpentAmount, integer(tx.budgetAllocation)));
    }
    if (tx.iouId && (tx.iouApplied===true || tx.iouApplied===undefined&&tx.status==='success')) {
      const iou = s.ious.find(i => i.id === tx.iouId);
      if (iou) {
        iou.paid = Math.max(0, integer(iou.paid) - tx.amount);
        iou.status = 'open';
        delete iou.settledAt;
      }
      tx.iouApplied=false;
    }
    tx.status = 'reversed'; tx.walletDebited = false; tx.reversedAt = new Date().toISOString();
    return good('Payment reversed. The payment amount is available again.', { id: tx.id, transaction: tx });
  }
  if (type === 'reactPayment') {
    const tx = s.transactions.find(t => t.id === (p.transactionId || p.id));
    if (!tx) return fail('That payment could not be found.');
    if (!['👍', '❤️', '🙌', '💚', '🙏', '🎉'].includes(p.reaction)) return fail('Choose a reaction.');
    tx.reaction = p.reaction;
    return good('Reaction added.', { id: tx.id, transaction: tx });
  }
  if (type === 'createBudget' || type === 'updateBudget') {
    let input = p.items;
    if (!input && p.id && type === 'updateBudget') {
      if (!s.budget.items.some(i => i.id === p.id)) return fail('That budget item could not be found.');
      input = s.budget.items.map(i => i.id === p.id ? { ...i, ...p } : i);
    }
    const prepared = prepareBudgetItems(input, s.budget.items);
    if (prepared.error) return fail(prepared.error);
    if (!prepared.items.length) return fail('Add at least one thing your money needs to cover.');
    const buffer = p.buffer === undefined ? s.buffer : p.buffer;
    if (!nonnegative(buffer)) return fail('Choose a valid minimum balance.');
    if(p.endDate!==undefined&&(!day(p.endDate)||day(p.endDate)!==p.endDate||day(p.endDate)<today()))return fail('Choose today or a future date for this plan.');
    s.budget = { ...s.budget, created: true, items: prepared.items, ...(p.endDate?{endDate:day(p.endDate)}:{}), ...(p.provenance ? {provenance:copy(p.provenance)} : {}) };
    s.buffer = buffer;
    return good(type === 'createBudget' ? 'Your plan is ready.' : 'Your plan is updated.', { budget: s.budget });
  }
  if (type === 'deleteBudgetItem') {
    const index = s.budget.items.findIndex(i => i.id === p.id);
    if (index < 0) return fail('That budget item could not be found.');
    s.budget.items.splice(index, 1);
    s.budget.created = s.budget.items.length > 0;
    return good('Budget item removed.', { budget: s.budget });
  }
  if (type === 'createBox' || type === 'updateBox') {
    const old = type === 'updateBox' ? s.boxes.find(b => b.id === (p.boxId || p.id)) : null;
    if (type === 'updateBox' && !old) return fail('That Money Box could not be found.');
    if (['protection', 'protectionRequests', 'protectionAudit', 'activeProtectionRequestId', 'protectionRevision', 'pendingProtection'].some(key => Object.hasOwn(p, key))) return fail('Use the accountability partner journey to manage protection.');
    if (old && p.accountabilityPartner !== undefined) return fail('Use the approved partner-change journey to change protection.');
    const partner = !old && p.accountabilityPartner != null ? validatePartnerDetails(p.accountabilityPartner, s.profile.phone) : null;
    if (partner && !partner.ok) return partner;
    const name = text(p.name ?? old?.name, 60);
    const target = p.target ?? old?.target;
    const deadline = p.deadline === undefined ? old?.deadline || '' : p.deadline ? day(p.deadline) : '';
    const hack = normalizeHack(p.hack ?? old?.hack ?? { type: 'none', value: 0 });
    if (!name) return fail('Give your Money Box a name.');
    if (!nonnegative(target)) return fail('Choose a savings target of zero or more, or leave it open-ended.');
    if (p.deadline && !deadline) return fail('Choose a valid target date.');
    if (!hack) return fail('Choose a valid Savings Hack.');
    if(partner){const confirmation=verifiedBoxPartnerInvitation(s,{...p,name,accountabilityPartner:partner.partner});if(!confirmation.ok)return confirmation;}
    const box = old || { id: uid('box'), balance: 0 };
    if (old && old.name !== name && hasBoxProtection(old)) invalidateBoxReleaseRequests(old, 'Money Box name changed');
    if (JSON.stringify(old?.hack||null)!==JSON.stringify(hack) && hack.type!=='none') s.savingsHistory.unshift({id:uid('hack-event'),boxId:box.id,at:new Date().toISOString(),status:old?'updated':'created',amount:0,reason:old?'Saving rule updated':'Saving rule created',rule:copy(hack)});
    Object.assign(box, { name, emoji: text(p.emoji ?? old?.emoji ?? '✨', 12), target, deadline, hack, locked: p.locked === undefined ? !!old?.locked : !!p.locked });
    if (!old) { if (partner) { const {confirmation}=consumeBoxPartnerInvitation(s,{...p,name,accountabilityPartner:partner.partner},box.id);box.protection = {...makeBoxProtection(partner.partner),status:'active',respondedAt:confirmation.acceptedAt,phoneVerifiedAt:confirmation.phoneVerifiedAt,initialInvitationId:confirmation.invitationId,verificationMode:confirmation.mode};box.lastPartnerCode=confirmation.lastCode; box.protectionRevision = box.protection.revision; box.protectionRequests = []; box.protectionAudit = [{ id: uid('box-audit'), type: 'partner-confirmed-before-creation', at: new Date().toISOString(), revision: 1,invitationId:confirmation.invitationId }]; } s.boxes.push(box); }
    return good(old ? 'Money Box updated.' : 'Money Box created.', { id: box.id, box });
  }
  if (['resolveBoxTransfer','retryBoxTransfer','reverseBoxTransfer'].includes(type)) {
    const tx=s.transactions.find(t=>t.id===(p.transactionId||p.id)&&t.boxTransfer);
    if(!tx)return fail('That box transfer could not be found.');
    const box=s.boxes.find(b=>b.id===tx.boxId);if(!box)return fail('That Money Box could not be found.');
    const saving=tx.type==='saving';
    if(type==='retryBoxTransfer'){
      if(tx.status!=='failed')return fail('Only a failed transfer can be retried.');
      if(box.archived)return fail('Restore this box before retrying.');
      if(saving?tx.amount>s.wallet:tx.amount>box.balance)return fail('There is not enough money at the source to retry.');
      if(!saving){const release=checkProtectedWithdrawal(s,box,{...p,amount:tx.amount});if(!release.ok)return release;if(box.locked)return fail('Unlock the box before trying again.');if(release.request){consumeBoxRelease(box,release.request,tx.id);tx.protectionRequestId=release.request.id;}}
      if(saving)s.wallet-=tx.amount;else box.balance-=tx.amount;
      tx.status='pending';tx.sourceHeld=true;tx.attempt=(tx.attempt||1)+1;tx.retriedAt=new Date().toISOString();
      return good('Transfer retried with the same reference.',{transaction:tx,box});
    }
    if(type==='resolveBoxTransfer'){
      if(tx.status!=='pending')return fail('This transfer already has a final outcome.');
      if(!['success','failed'].includes(p.status))return fail('Choose the confirmed transfer result.');
      if(p.status==='success'){if(saving)box.balance+=tx.amount;else s.wallet+=tx.amount;}
      else{if(saving)s.wallet+=tx.amount;else box.balance+=tx.amount;}
      tx.status=p.status;tx.sourceHeld=false;tx.resolvedAt=new Date().toISOString();return good(p.status==='success'?'Box transfer confirmed.':'Transfer failed. Money returned to its source.',{transaction:tx,box});
    }
    if(!['pending','success'].includes(tx.status))return fail('This transfer cannot be reversed again.');
    if(tx.status==='success'){
      if(saving&&tx.amount>box.balance||!saving&&tx.amount>s.wallet)return fail('The receiving account no longer has enough money to reverse this transfer.');
      if(saving){box.balance-=tx.amount;s.wallet+=tx.amount;}else{s.wallet-=tx.amount;box.balance+=tx.amount;}
    }else if(saving)s.wallet+=tx.amount;else box.balance+=tx.amount;
    tx.status='reversed';tx.sourceHeld=false;tx.reversedAt=new Date().toISOString();return good('Transfer reversed once. Money returned to its source.',{transaction:tx,box});
  }
  if (type === 'contributeBox' || type === 'withdrawBox') {
    const box = s.boxes.find(b => b.id === (p.boxId || p.id));
    if (!box) return fail('That Money Box could not be found.');
    if (box.archived) return fail('Restore this Money Box before moving money.');
    if (!positive(p.amount)) return fail('Enter a valid amount.');
    const saving = type === 'contributeBox';
    if (saving && p.amount > s.wallet) return fail('There is not enough available money to save that amount.');
    const release = !saving ? checkProtectedWithdrawal(s, box, p) : { ok: true, request: null };
    if (!release.ok) return release;
    if (!saving && box.locked) return fail('Unlock this Money Box before taking money out.');
    if (!saving && p.amount > box.balance) return fail('There is not that much money in this Money Box.');
    const status=p.status||'success';if(!['success','pending','failed'].includes(status))return fail('Choose a valid transfer outcome.');
    if(status!=='failed'){if(saving)s.wallet-=p.amount;else box.balance-=p.amount;if(status==='success'){if(saving)box.balance+=p.amount;else s.wallet+=p.amount;}}
    const tx = transaction(s, { type: saving ? 'saving' : 'withdrawal', status, boxTransfer:true, sourceHeld:status==='pending', attempt:1, direction: saving ? 'out' : 'in', amount: p.amount, merchant: box.name, category: 'Money Box', emoji: box.emoji, rail: 'internal', boxId: box.id, note: saving ? 'Added to your Money Box' : 'Moved back to available money' });
    if (status!=='failed' && !saving && release.request) { tx.protectionRequestId = release.request.id; tx.protectionApprovedBy = release.request.approvedBy; consumeBoxRelease(box, release.request, tx.id); }
    return good(status==='pending'?'Transfer pending. Money held at its source.':status==='failed'?'Transfer failed. No money moved.':saving ? 'A little closer.' : 'Money moved to your available balance.', { id: box.id, box, transaction: tx });
  }
  if (type === 'deleteBox') {
    const index = s.boxes.findIndex(b => b.id === (p.boxId || p.id));
    if (index < 0) return fail('That Money Box could not be found.');
    if (s.transactions.some(t => t.boxId === s.boxes[index].id && t.boxTransfer && t.status === 'pending')) return fail('Wait for this box’s pending transfer before deleting it.');
    if (hasBoxProtection(s.boxes[index])) return fail('Remove partner protection with approval before closing this Money Box.');
    if (s.boxes[index].balance > 0) return fail('Move the money out before deleting this Money Box.');
    s.boxes.splice(index, 1);
    return good('Money Box deleted.');
  }
  if (type === 'createIOU' || type === 'updateIOU') {
    const old = p.id ? s.ious.find(i => i.id === p.id) : null;
    if (p.id && !old) return fail('That IOU could not be found.');
    if (old && old.status !== 'open') return fail('Only an open IOU can be edited.');
    const name = text(p.name ?? old?.name, 60), amount = p.amount ?? old?.amount;
    const direction = p.type ?? old?.type;
    const due = p.due === undefined ? old?.due || '' : p.due ? day(p.due) : '';
    if (!name || !positive(amount) || !['owedToMe', 'owedByMe'].includes(direction)) return fail('Add a name, amount and who owes whom.');
    if (old && amount < integer(old.paid) + pendingIOUAmount(s,old.id)) return fail('The total cannot be less than the amount already settled.');
    if (old && (integer(old.paid) > 0 || pendingIOUAmount(s,old.id)>0) && direction !== old.type) return fail('An IOU with a repayment cannot change direction.');
    if (p.due && !due) return fail('Choose a valid repayment date.');
    const iou = old || { id: uid('iou'), paid: 0, status: 'open' };
    const budgetItemId = p.budgetItemId === undefined ? old?.budgetItemId || '' : text(p.budgetItemId,100);
    if (budgetItemId && !s.budget.items.some(i=>i.id===budgetItemId)) return fail('Choose an existing budget item, or leave this IOU separate.');
    Object.assign(iou, { name, type: direction, amount, due, budgetItemId, note: text(p.note ?? old?.note, 240) });
    if (integer(iou.paid) === amount) {
      iou.status = 'settled';
      iou.settledAt = new Date().toISOString();
    }
    if (!old) s.ious.push(iou);
    return good(old ? 'IOU updated.' : 'IOU noted.', { id: iou.id, iou });
  }
  if (type === 'settleIOU') {
    const iou = s.ious.find(i => i.id === p.id);
    if (!iou || iou.status !== 'open') return fail('This IOU is already closed or could not be found.');
    const remaining = repayableIOUAmount(s,iou), amount = p.amount ?? remaining;
    if (!positive(amount) || amount > remaining) return fail('Enter an amount up to the outstanding IOU.');
    const incoming = iou.type === 'owedToMe';
    if(!incoming&&!p.outside){const paid=perform(s,'payment',{...p,amount,merchant:iou.name,category:'IOU',rail:p.rail||'lumo',note:p.note||'IOU repayment',iouId:iou.id});return paid.ok?good(paid.message,{...paid,id:iou.id,iou,remaining:iouRemaining(iou)}):paid;}
    if(p.status&&p.status!=='success')return fail('Only record an outside repayment after it has actually happened.');
    let tx;
    if (incoming) {
      if (p.receiptTransactionId) {
        tx = s.transactions.find(t => t.id === p.receiptTransactionId && t.type === 'income' && t.direction === 'in' && t.status === 'success');
        if (!tx) return fail('Choose a confirmed payment already received in Lumo.');
        const allocated = tx.iouId && !tx.iouAllocations ? tx.amount : (tx.iouAllocations || []).reduce((n,a) => n + integer(a.amount), 0);
        if (amount > tx.amount - allocated) return fail('That receipt has already been matched, or has less unmatched money than this amount.');
        tx.iouAllocations ||= []; tx.iouAllocations.push({iouId:iou.id,amount,at:new Date().toISOString()});
      } else {
        if (!externalTypes.includes(p.destination)) return fail('Match a confirmed Lumo receipt, or choose where the money arrived outside Lumo.');
        tx = transaction(s, {type:'iou-manual-receipt',direction:'in',amount,merchant:iou.name,category:'IOU',emoji:'↓',rail:p.destination,iouId:iou.id,manual:true,note:'Received outside Lumo. Lumo and recorded outside balances are unchanged.'});
      }
      iou.receipts ||= []; iou.receipts.push({transactionId:tx.id,amount,destination:p.receiptTransactionId?'lumo':p.destination,at:new Date().toISOString()});
    } else {
      if(!externalTypes.includes(p.destination))return fail('Choose where you already repaid this IOU outside Lumo.');
      tx=transaction(s,{type:'iou-manual-repayment',direction:'out',amount,merchant:iou.name,category:'IOU',emoji:'↗',rail:p.destination,iouId:iou.id,manual:true,walletDebited:false,note:'Paid outside Lumo. Lumo and recorded outside balances are unchanged.'});
      iou.receipts ||= [];iou.receipts.push({transactionId:tx.id,amount,destination:p.destination,outside:true,at:new Date().toISOString()});
    }
    iou.paid = integer(iou.paid) + amount;
    if (iou.paid === iou.amount) { iou.status = 'settled'; iou.settledAt = new Date().toISOString(); }
    return good(incoming ? p.receiptTransactionId ? 'Receipt matched. Your balance has not been credited twice.' : 'Outside repayment recorded. Your Lumo balance is unchanged.' : p.outside ? 'Outside repayment recorded. Your balances are unchanged.' : iou.status === 'settled' ? 'IOU settled.' : 'Part-payment recorded.', {id:iou.id,iou,transaction:tx,remaining:iouRemaining(iou)});
  }
  if (type === 'cancelIOU') {
    const iou = s.ious.find(i => i.id === p.id);
    if (!iou || iou.status !== 'open') return fail('This IOU is already closed or could not be found.');
    if(pendingIOUAmount(s,iou.id)>0)return fail('Wait for the pending repayment result before closing this IOU.');
    iou.status = 'cancelled'; iou.cancelledAt = new Date().toISOString();
    return good('IOU closed. No money moved.', { id: iou.id, iou });
  }
  if (type === 'recoveryPlan' || type === 'createRecovery') {
    const checkIn = p.checkInDate || p.nextDate;
    const nextDate = checkIn ? day(checkIn) : s.income.nextDate;
    if(checkIn&&(!nextDate||nextDate<today()||nextDate>inDays(365)))return fail('Choose a check-in date from today through the next year.');
    const reductions = p.reduceCategories || p.cuts || [];
    if (!Array.isArray(reductions)) return fail('Choose valid budget adjustments.');
    const adjusted = [];
    for (const change of reductions) {
      const item = s.budget.items.find(i => i.id === change.id);
      if (!item || !nonnegative(change.amount) || change.amount>moneyRemaining(item)) return fail('Keep each adjusted cost within its current remaining amount.');
      adjusted.push({ item, amount: change.amount });
    }
    if (p.dailyLimit !== undefined && !nonnegative(p.dailyLimit)) return fail('Choose a valid daily guide amount.');
    const baselineGap = Math.max(0, getSummary(s).planned+s.buffer-s.wallet);
    adjusted.forEach(({ item, amount }) => { item.amount = integer(item.spent) + amount; });
    s.recovery = { active: true, checkInDate:nextDate, nextDate, baselineGap, pauseSavings:true, days: Math.max(1, integer(p.days, getSummary(s).daysLeft)), dailyLimit: p.dailyLimit ?? getSummary(s).dailyAllowance, reduceCategories: reductions.map(x => ({ id: x.id, amount: x.amount })), message: text(p.message || 'One manageable day at a time.', 240), startedAt: new Date().toISOString() };
    return good('Your recovery plan is ready.', { recovery: s.recovery, summary: getSummary(s) });
  }
  if (type === 'updateProfile') {
    if (p.name !== undefined && !text(p.name)) return fail('Tell us what to call you.');
    if (p.buffer !== undefined && !nonnegative(p.buffer)) return fail('Choose a valid minimum balance.');
    for (const key of ['name', 'phone', 'campus']) if (p[key] !== undefined) s.profile[key] = text(p[key], key === 'phone' ? 30 : 80);
    if (p.buffer !== undefined) s.buffer = p.buffer;
    return good('Profile updated.', { profile: s.profile });
  }
  if (type === 'settings') {
    if (p.pin !== undefined && !/^\d{4}$/.test(String(p.pin))) return fail('Use a four-digit demo PIN.');
    if (p.buffer !== undefined && !nonnegative(p.buffer)) return fail('Choose a valid minimum balance.');
    for (const key of ['hideBalance', 'notifications']) if (p[key] !== undefined) s.settings[key] = !!p[key];
    if (p.pin !== undefined) s.settings.pin = String(p.pin);
    if (p.buffer !== undefined) s.buffer = p.buffer;
    return good('Preferences updated.', { settings: s.settings });
  }
  return fail('This action is not available.');
}

export function applyAction(s, type, payload = {}) {
  if (!validStoredState(s) || !payload || typeof payload !== 'object' || Array.isArray(payload)) return fail('The demo could not complete that action.');
  const access=accountAccess(s);
  if(!String(type).startsWith('account')&&!access.canTransact&&!(type==='settings'&&Object.keys(payload).every(k=>['hideBalance','notifications'].includes(k))))return fail(access.signedOut?'Sign back in before changing this saved account.':'This account is closed. Its records are read-only.');
  const p = { ...payload };
  const key = text(p.idempotencyKey, 200);
  delete p.idempotencyKey;
  const isGroupAction = GROUP_LEDGER_ACTIONS.has(type) || isGroupChatAction(type);
  const group = isGroupAction ? s.groups.find(g => g.id === (p.groupId || p.id || (type === 'ensureProjectPrintingDemo' ? 'group-project-printing' : ''))) : null;
  const actor = group ? getGroupActor(group) : undefined;
  if (group && type !== 'setGroupParticipant' && !canReadGroup(group) && !(type === 'acceptGroupInvite' && group.members.some(m => m.id === actor && m.status === 'invited'))) return fail('This participant does not have access to this group.');
  const authority = group ? { role: group.members.find(m => m.id === actor)?.role, creatorId: group.creatorId, mandate: group.mandate, mandateRevision:group.mandateRevision, invitationVersion:group.members.find(m=>m.id===actor)?.invitationVersion, revision: p.payoutId ? group.payouts.find(x => x.id === p.payoutId)?.revision : undefined } : undefined;
  const signature = JSON.stringify({ type, payload: p, ...(isGroupAction ? { actor: actor || 'me', ...(authority ? { authority } : {}) } : {}) });
  s._appliedActions ||= {};
  const uncachedProtection = MONEY_IQ_ACTIONS.has(type)||GAME_ACTIONS.has(type)||LEARNING_ACTIONS.has(type)||BOX_PARTNER_INVITATION_ACTIONS.has(type)||['issueBoxPartnerCode', 'verifyBoxPartnerCode', 'requestBoxSupportReview', 'verifyBoxSupport', 'respondBoxPartnerInvite', 'completeBoxProtectionChange'].includes(type);
  if (key && !uncachedProtection && Object.hasOwn(s._appliedActions, key)) {
    const previous = s._appliedActions[key];
    if (previous.signature !== signature) return fail('This action reference has already been used for a different request.');
    return { ...copy(previous.result), duplicate: true };
  }
  const result = perform(s, type, p);
  syncPaymentParityAfterAction(s,type,p,result);
  if(result.ok)syncActivationProgress(s);
  syncLearningAfterMoneyAction(s,type,p,result,{getSummary});
  if(result.ok&&((type==='learningPreferences'&&p.personalised===false)||(type==='learningEnroll'&&p.personalised===false)||(type==='accountPrivacy'&&p.preference==='personalisation'&&p.enabled===false)))purgePersonalMoneyIQ(s);
  if (result.ok && key && !uncachedProtection) {
    Object.defineProperty(s._appliedActions, key, { value: { signature, result: copy(result) }, enumerable: true, configurable: true, writable: true });
    const keys = Object.keys(s._appliedActions);
    if (keys.length > 500) delete s._appliedActions[keys[0]];
  }
  return result;
}
