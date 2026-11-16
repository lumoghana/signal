/** Ghana-local spending signals. Evidence only, never payment authorisation. */
import { getSummary } from './model.js';
const normal = value => String(value || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
const cents = value => Number.isSafeInteger(value) ? Math.max(0, value) : 0;
const remaining = item => Math.max(0, cents(item.amount) - cents(item.spent));
const accountIdentity = value => {
  const compact = String(value || '').replace(/[\s()-]/g, '');
  return /^(?:\+?233|0)\d{9}$/.test(compact) ? compact.replace(/^\+?233/, '0') : normal(value);
};
// A shared provider name is not a recipient. Qualify a service by its actual
// reference and provider, and a bank account by both bank and account number.
const paymentRecipient = payload => {
  const recipient = payload.recipient, person = typeof recipient === 'object' ? recipient : {};
  const rail = normal(payload.rail || 'lumo');
  const service = payload.serviceId || (['bill', 'airtime', 'data', 'campus'].includes(rail) ? rail : '');
  if (service) {
    const reference = accountIdentity(payload.reference || person.number || payload.serviceFields?.phone || payload.serviceFields?.reference);
    if (!reference && rail !== 'campus') return '';
    const provider = normal(payload.billerName || payload.serviceFields?.biller || person.name || payload.merchant);
    return provider ? `service:${normal(service)}:${provider}:${reference}` : '';
  }
  const destination = accountIdentity(person.number || person.id || person.name || recipient || payload.merchant);
  return destination ? `${rail}:${rail === 'bank' ? normal(person.bank) : ''}:${destination}` : '';
};
const successfulPayments = state => (state.transactions || []).filter(tx => tx.type === 'payment' && tx.status === 'success' && tx.direction === 'out' && tx.rail !== 'internal' && Number.isSafeInteger(tx.amount) && tx.amount > 0);

/** Ghana uses UTC year round. History is evidence, never an authorisation. */
export function evaluatePauseHistory(state, payload = {}, { now = new Date(), summary } = {}) {
  const at = now.getTime(), amount = cents(payload.amount), fee = cents(payload.fee);
  const context = summary || getSummary(state, now);
  const guide = context.hasDailyGuide ? cents(context.dailyAllowance) : 0, today = now.toISOString().slice(0, 10);
  const records = successfulPayments(state).filter(tx => Number.isFinite(Date.parse(tx.at)) && Date.parse(tx.at) <= at);
  const todays = records.filter(tx => tx.at.slice(0, 10) === today);
  const recent = records.filter(tx => at - Date.parse(tx.at) <= 10 * 60000);
  const recipient = paymentRecipient(payload);
  const same = recipient ? recent.filter(tx => paymentRecipient(tx) === recipient) : [];
  const item = (state.budget?.items || []).find(item => normal(item.name) === normal(payload.category) || normal(item.id) === normal(payload.budgetItemId));
  const unplanned = Math.max(0, amount + fee - (item ? Math.min(amount, remaining(item)) : 0));
  const dailySpent = todays.reduce((total, tx) => total + tx.amount + cents(tx.fee), 0);
  const signals = [];
  const destinationLabel = payload.serviceId || ['bill', 'airtime', 'data', 'campus'].includes(payload.rail) ? 'this service account' : 'this person';
  if (same.length >= 2 && amount >= 1000 && same.reduce((total, tx) => total + tx.amount, amount) >= Math.max(5000, guide)) signals.push({ id: 'repeat-recipient', count: same.length, label: `${same.length} payments to ${destinationLabel} in the last 10 minutes` });
  if (todays.length >= 4 && guide > 0 && unplanned >= 1000 && dailySpent + amount + fee > Math.max(10000, guide * 2)) signals.push({ id: 'daily-frequency', count: todays.length, total: dailySpent, label: `${todays.length} completed payments today` });
  const hour = now.getUTCHours();
  if ((hour >= 23 || hour < 5) && guide > 0 && unplanned >= Math.max(5000, guide) && amount > cents(state.wallet) * .1) signals.push({ id: 'late-night', label: 'A late-night payment above your daily flex guide' });
  const show = amount > 0 && amount + fee <= cents(state.wallet) && signals.length > 0;
  return { show, signals, reason: !show ? '' : signals[0].id === 'repeat-recipient' ? `You have already made ${same.length} payments to ${destinationLabel} in the last 10 minutes. Check this is another payment you intended.` : signals[0].id === 'daily-frequency' ? `You have made ${todays.length} payments today. Together with this one, spending is above two days of your flex guide.` : 'This late-night payment is above your daily flex guide. Take a moment to check the amount.' };
}
