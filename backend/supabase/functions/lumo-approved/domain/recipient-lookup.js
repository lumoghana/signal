/** Demo account lookup only. These fixtures are never a live account directory. */
export const RECIPIENT_BANKS = Object.freeze([
  { id: 'gcb', label: 'GCB Bank', example: '1234567890123' },
  { id: 'ecobank', label: 'Ecobank Ghana', example: '0123456789' },
  { id: 'fidelity', label: 'Fidelity Bank', example: '123456789012' },
  { id: 'stanbic', label: 'Stanbic Bank', example: '12345678901' },
  { id: 'absa', label: 'Absa Bank Ghana', example: '1234567890123456' },
].map(Object.freeze));

export const DEMO_MOMO_ACCOUNTS = Object.freeze([
  { number: '0245550182', name: 'Kofi Mensah', network: 'MTN MoMo' },
  { number: '0205550166', name: 'Efua Asante', network: 'Telecel Cash' },
  { number: '0275550188', name: 'Kojo Adjei', network: 'AT Money' },
  // A deliberately ported-number example: its network comes from this lookup.
  { number: '0555550124', name: 'Akosua Owusu', network: 'Telecel Cash' },
].map(Object.freeze));

const bankAccounts = Object.freeze([
  { bank: 'GCB Bank', number: '1234567890123', name: 'Ama Mensah' },
  { bank: 'Ecobank Ghana', number: '0123456789', name: 'Esi Boateng' },
  { bank: 'Fidelity Bank', number: '123456789012', name: 'Kwame Asare' },
  { bank: 'Stanbic Bank', number: '12345678901', name: 'Nana Osei' },
  { bank: 'Absa Bank Ghana', number: '1234567890123456', name: 'Abena Boateng' },
].map(Object.freeze));

// This explicit fixture lets the prototype exercise a recoverable provider error.
export const DEMO_LOOKUP_UNAVAILABLE_NUMBER = '0240000000';
const unavailable = () => ({ ok: false, code: 'unavailable', message: 'The demo lookup is taking a break. Try again, or use a sample account.' });
const invalid = (field, message) => ({ ok: false, field, message });

function inputText(value, maxLength) {
  return typeof value === 'string' && value.length <= maxLength && !/[\u0000-\u001f\u007f]/.test(value) ? value.trim() : '';
}

/** Formatting is accepted, but a number's prefix never selects its network. */
export function normalizeMomoNumber(value) {
  const text = inputText(value, 50);
  if (!text || !/^[+\d() \u00a0-]+$/.test(text) || /^-|-$|--/.test(text)) return '';
  let depth = 0;
  for (const char of text) {
    if (char === '(' && ++depth > 1) return '';
    if (char === ')' && --depth < 0) return '';
  }
  if (depth || /\([ \u00a0-]*\)/.test(text)) return '';
  let number = text.replace(/[() \u00a0-]/g, '');
  if (/^\+?233[1-9]\d{8}$/.test(number)) number = `0${number.replace(/^\+?233/, '')}`;
  return /^0[1-9]\d{8}$/.test(number) ? number : '';
}

/** Keep bank account identifiers as text so leading zeroes survive. */
export function normalizeBankAccount(value) {
  const text = inputText(value, 50);
  if (!/^\d+(?:[ \u00a0-]+\d+)*$/.test(text) || /--/.test(text)) return '';
  const number = text.replace(/[ \u00a0-]/g, '');
  return /^\d{8,16}$/.test(number) ? number : '';
}

export function validateRecipientLookup(rail, form = {}) {
  if (rail !== 'momo' && rail !== 'bank') return invalid('number', 'Choose mobile money or a bank account.');
  const details = form && typeof form === 'object' && !Array.isArray(form) ? form : {};
  const number = rail === 'momo' ? normalizeMomoNumber(details.number) : normalizeBankAccount(details.number);
  if (!number) return invalid('number', rail === 'momo' ? 'Use a 10-digit Ghanaian mobile number, or start with +233.' : 'Check the account number. Use 8–16 digits.');
  const request = { rail, number };
  if (rail === 'bank') {
    const bank = RECIPIENT_BANKS.find(item => item.id === details.bank || item.label === details.bank);
    if (!bank) return invalid('bank', 'Choose the bank this account belongs to.');
    request.bank = bank.label;
  }
  return { ok: true, key: JSON.stringify([rail, number, request.bank || '']), request };
}

/** Unknown numbers never receive a made-up identity or a prefix-derived network. */
export function resolveDemoRecipient(request) {
  const checked = validateRecipientLookup(request?.rail, request);
  if (!checked.ok) return { ok: false, code: 'not_found', message: checked.message };
  const { rail, number, bank } = checked.request;
  if (rail === 'momo' && number === DEMO_LOOKUP_UNAVAILABLE_NUMBER) return unavailable();
  const account = rail === 'momo'
    ? DEMO_MOMO_ACCOUNTS.find(item => item.number === number)
    : bankAccounts.find(item => item.number === number && item.bank === bank);
  if (!account) return { ok: false, code: 'not_found', message: rail === 'momo' ? 'We couldn’t find that number in this demo. Check it, or try a sample number.' : 'That account and bank don’t match a demo account. Check both, or try a sample account.' };
  return { ok: true, recipient: { ...account, emoji: account.name.charAt(0), lookupSource: 'demo' } };
}

/** A lookup belongs only to the exact rail and details currently on the form. */
export function recipientLookupMatches(payment, { confirmed = false } = {}) {
  if (!payment || !['momo', 'bank'].includes(payment.rail)) return false;
  const record = payment.recipientLookup;
  const checked = validateRecipientLookup(payment.rail, payment.recipientForms?.[payment.rail]);
  if (!record || !checked.ok || record.key !== checked.key || !record.request || record.request.rail !== checked.request.rail || record.request.number !== checked.request.number || (record.request.bank || '') !== (checked.request.bank || '')) return false;
  const found = record.recipient;
  if (!found || found.lookupSource !== 'demo' || typeof found.name !== 'string' || !found.name.trim() || found.name.length > 60 || /[<>\u0000-\u001f\u007f]/.test(found.name)) return false;
  const normalize = payment.rail === 'momo' ? normalizeMomoNumber : normalizeBankAccount;
  if (normalize(found.number) !== checked.request.number) return false;
  if (payment.rail === 'momo' && !['MTN MoMo', 'Telecel Cash', 'AT Money'].includes(found.network)) return false;
  if (payment.rail === 'bank' && found.bank !== checked.request.bank) return false;
  if (!confirmed) return true;
  const accepted = payment.recipient;
  return record.confirmed === true && !!accepted && accepted.name === found.name && normalize(accepted.number) === checked.request.number && (payment.rail === 'momo' ? accepted.network === found.network : accepted.bank === found.bank);
}

/** Cancelled or superseded runs resolve null, including late provider responses. */
export function createRecipientLookup({
  lookup = request => resolveDemoRecipient(request),
  delay = 1100,
  schedule = (callback, milliseconds) => setTimeout(callback, milliseconds),
  cancel: unschedule = timer => clearTimeout(timer),
} = {}) {
  let active = null, disposed = false;
  const wait = Number.isFinite(delay) && delay >= 0 ? delay : 1100;

  function cancel() {
    const previous = active;
    active = null;
    if (!previous) return;
    if (previous.timer !== null) unschedule(previous.timer);
    previous.timer = null;
    previous.resolve(null);
  }

  function run(request) {
    cancel();
    if (disposed) return Promise.resolve(null);
    return new Promise(resolve => {
      const record = { resolve, timer: null, started: false, request: { rail: request?.rail, number: request?.number, ...(request?.bank !== undefined ? { bank: request.bank } : {}) } };
      active = record;
      const settle = result => {
        if (active !== record || disposed) return;
        active = null;
        record.resolve(result && typeof result.ok === 'boolean' ? result : unavailable());
      };
      try {
        record.timer = schedule(() => {
          record.timer = null;
          if (active !== record || disposed || record.started) return;
          record.started = true;
          Promise.resolve().then(() => {
            if (active !== record || disposed) return null;
            return lookup(record.request);
          }).then(result => settle(result), () => settle(unavailable()));
        }, wait);
      } catch {
        settle(unavailable());
      }
    });
  }

  return {
    run,
    cancel,
    dispose() { if (disposed) return; disposed = true; cancel(); },
    get running() { return active !== null; },
  };
}
