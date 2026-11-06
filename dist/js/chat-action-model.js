import { cash } from './ui.js';
import { PAYMENT_SERVICES, prepareServicePayment } from './payment-catalog.js';

const clean = value => String(value || '').trim().replace(/\s+/g, ' ').slice(0, 400);
const norm = value => clean(value).toLowerCase().replace(/[’‘]/g, "'");
const KNOWN_CONTACTS = [{ id: 'kofi', name: 'Kofi Mensah', number: '024 555 0182', emoji: 'K', colour: 'violet' }, { id: 'akosua', name: 'Akosua Owusu', number: '055 555 0124', emoji: 'A', colour: 'peach' }, { id: 'efua', name: 'Efua Asante', number: '020 555 0166', emoji: 'E', colour: 'blue' }];
const escaped = value => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const mentions = (text, value) => new RegExp(`(?:^|[^\\p{L}\\p{N}])${escaped(value)}(?=$|[^\\p{L}\\p{N}])`, 'u').test(text);
const foreignCurrency = input => /[$€£¥₹₦₩₽]|\b(?:usd|eur|gbp|ngn|kes|zar|chf|cad|aud|jpy|cny|inr|xof|xaf|gmd|gnf|ugx|tzs|zmw|egp|mad|aed|sar|sgd|hkd|nzd|krw|rub|btc|eth|usdt|dollars?|euros?|pounds?|naira|shillings?|rand|rupees?|yen|yuan|cents?|pence|francs?|cfa|bitcoin|ether)\b/i.test(input);

/** The same integer-pesewa parser is used for advice and editable drafts. */
export function readChatAmount(question) {
  const input = String(question ?? '').trim().slice(0, 400);
  if (foreignCurrency(input) && /\d/.test(input)) return { found: true, invalid: true, amount: null, unsupportedCurrency: true };
  if (/\b(?:NaN|Infinity)\b|\d(?:\.\d+)?e[+-]?\d/i.test(input)) return { found: false, invalid: true, amount: null };
  let match = input.match(/(-?\d[\d,]*(?:\.\d+)?)\s*(?:pesewas?|cents?)\b/i), unit = 'pesewas';
  if (!match) { match = input.match(/(?:gh\s*[₵¢c]|ghs|cedis?)\s*(-?\d[\d,]*(?:\.\d+)?)/i) || input.match(/(-?\d[\d,]*(?:\.\d+)?)\s*(?:ghs|cedis?|ghana cedis|gh\s*[₵¢c])/i); unit = 'cedis'; }
  if (!match) { match = input.match(/(?:^|[^\w.])(-?\d[\d,]*(?:\.\d+)?)(?![\w.])/); unit = 'cedis'; }
  if (!match) return { found: false, invalid: false, amount: null };
  const raw = match[1], number = Number(raw.replace(/,/g, ''));
  const syntax = /^-?(?:\d+|\d{1,3}(?:,\d{3})+)(?:\.\d+)?$/.test(raw);
  const precision = unit === 'pesewas' ? Number.isInteger(number) : !raw.includes('.') || raw.split('.')[1].length <= 2;
  const amount = unit === 'pesewas' ? number : Math.round(number * 100);
  return { found: true, invalid: !syntax || !precision || !Number.isSafeInteger(amount) || Math.abs(amount) > 10000000000, amount };
}

/** A single-cost check must not silently discard a second amount or a rate. */
export function financialInputAmbiguity(question) {
  const input = String(question ?? '').toLowerCase();
  if (foreignCurrency(input) && /\d/.test(input)) return 'currency';
  if (/\b(?:per|each|every|a)\s+(?:day|week|month|year|person|member|item|meal|ride)|\b(?:daily|weekly|monthly|yearly|annually|each)\b|\d\s*[x×*]\s*\d/.test(input) && /\d/.test(input)) return 'rate';
  const numbers = input.match(/-?\d[\d,]*(?:\.\d+)?/g) || [];
  if (numbers.length > 1) return 'multiple';
  if (/\b(?:save|saving|put\s+aside)\b/.test(input) && /\b(?:spend|buy|pay|send)\b/.test(input) && numbers.length) return 'compound';
  return '';
}

export function clarifyFinancialInput(reason = 'multiple') {
  if (reason === 'currency') return { title: 'What is that in Ghana cedis?', paragraphs: ['Lumo checks amounts in Ghana cedis. Tell me the final cedi amount, including any conversion costs; I won’t assume an exchange rate.'], actions: [], followUps: [], context: { topic: 'clarify' } };
  return { title: reason === 'rate' ? 'What’s the total cost?' : 'Let’s check one amount at a time.', paragraphs: [reason === 'rate' ? 'Tell me the total for all the days, people or items. I’ll check that full amount against your plan.' : 'Tell me one amount and what it is for. I’ll check it before we look at the next one.'], actions: [], followUps: [], context: { topic: 'clarify' } };
}

/** A small money-only projection. It contains no PIN, identity data or chat. */
export function financialSnapshotKey(state) {
  return JSON.stringify({ wallet: state.wallet, buffer: state.buffer, income: state.income, budget: state.budget, boxes: (state.boxes || []).map(box => ({ id: box.id, balance: box.balance, target: box.target, deadline: box.deadline, archived: box.archived, hack: box.hack })), cards: (state.virtualCards || []).map(card => ({ id: card.id, balance: card.balance, status: card.status, limit: card.limit })), ious: state.ious, outside: state.externalBalances, recovery: state.recovery, transactions: (state.transactions || []).map(tx => [tx.id, tx.type, tx.direction, tx.rail, tx.amount, tx.fee, tx.refunded, tx.held, tx.walletDebited, tx.status, tx.category, tx.merchant, tx.recipient?.name, tx.at, tx.resolvedAt]) });
}

export function stampFinancialAnswer(state, answer, question, now = new Date()) {
  if (!answer?.context || ['greeting', 'thanks', 'identity', 'clarify', 'approval'].includes(answer.context.topic)) return answer;
  return { ...answer, checkedAt: now.toISOString(), moneySnapshot: financialSnapshotKey(state), sourceQuestion: String(answer.context.canonicalQuestion || question || '').trim().slice(0, 400) };
}

export function isFinancialAnswerStale(state, message, now = new Date()) {
  if (!message?.context || ['greeting', 'thanks', 'identity', 'clarify', 'approval'].includes(message.context.topic)) return false;
  return !message.checkedAt || !Number.isFinite(Date.parse(message.checkedAt)) || message.checkedAt.slice(0, 10) !== now.toISOString().slice(0, 10) || message.moneySnapshot !== financialSnapshotKey(state);
}

function namedRecipient(state, question) {
  const q = norm(question);
  const saved = [...(state.paymentFavorites || []).map(item => ({ ...item.recipient, rail: item.rail })), ...(state.transactions || []).filter(tx => tx.status === 'success' && tx.recipient?.name).map(tx => ({ ...tx.recipient, rail: tx.rail })), ...KNOWN_CONTACTS.map(person => ({ ...person, rail: 'lumo' }))];
  const matched = saved.filter(person => { const name = norm(person.name), first = name.split(' ')[0]; return name.length > 1 && (mentions(q, name) || first.length > 2 && mentions(q, first)); });
  const fullMatches = matched.filter(person => mentions(q, norm(person.name)));
  // A full name can disambiguate a shared first name; distinct named people cannot.
  const candidates = matched.filter(person => !fullMatches.some(full => norm(full.name).split(' ')[0] === norm(person.name).split(' ')[0]) || fullMatches.includes(person));
  const unique = [...new Map(candidates.map(person => [`${person.rail || 'lumo'}:${String(person.number || '').replace(/\D/g, '') || person.id || norm(person.name)}`, person])).values()];
  return { recipient: unique.length === 1 ? unique[0] : null, ambiguous: unique.length > 1 };
}

/** Preparing a draft is distinct from sending money. No ledger is changed here. */
export function getPreparedChatAction(state, question) {
  const q = norm(question);
  if (/^(?:please\s+)?(?:(?:do not|don't|never)\s+)?(?:send|pay|transfer|move|put|add|save)\b/.test(q) && /\b(?:not|never|instead|rather|except|and|or|don't|if|unless)\b|&|,\s*\p{L}/u.test(q)) return { title: 'Let’s make the recipient clear.', paragraphs: ['Just to be sure, who should get the money? Tell me one name and one amount. Nothing has moved.'], actions: [], context: { topic: 'clarify' } };
  if (!/^(?:please\s+)?(?:send|pay|transfer|move|put|add|save)\b/.test(q) || /\b(?:did|have i|already|yesterday|last week)\b/.test(q)) return null;
  if (/%|\bpercent\b/.test(q)) return clarifyFinancialInput('rate');
  const ambiguity = financialInputAmbiguity(question);
  if (ambiguity) return clarifyFinancialInput(ambiguity);
  const parsed = readChatAmount(question), amount = parsed.amount;
  if (!parsed.found || parsed.invalid || amount <= 0 || amount > 1000000000) return null;
  // A purpose after “for” must never replace the explicitly named destination.
  const destination = q.match(/\b(?:to|into|towards?)\s+(.+?)(?=\s+for\s+|[?.!]|$)/)?.[1] || '';
  const destinationQuestion = destination || q;
  const named = namedRecipient(state, destinationQuestion);
  if (named.ambiguous) return { title: 'Which person do you mean?', paragraphs: ['More than one recipient matches that message. Use their full name, or choose and check the account in Payments.'], actions: [], context: { topic: 'clarify' } };
  const boxes = (state.boxes || []).filter(box => !box.archived && clean(box.name).length > 1 && mentions(destinationQuestion, norm(box.name)));
  if (boxes.length > 1) return { title: 'Which Money Box do you mean?', paragraphs: ['Pick one Money Box and one amount so the draft goes to the right goal.'], actions: [], context: { topic: 'clarify' } };
  const box = boxes[0];
  if (box && named.recipient) return { title: 'A person or a Money Box?', paragraphs: ['That destination matches both. Choose the recipient in Payments or the goal in Money Boxes before reviewing the amount. Nothing has moved.'], actions: [], context: { topic: 'clarify' } };
  if (box && /\b(?:save|move|put|add|transfer)\b/.test(q)) return {
    title: `Let’s review ${cash(amount)} for ${box.name}.`,
    paragraphs: ['I’ve filled in a savings transfer for you. Check the amount on the next screen, then confirm with your PIN.'],
    actions: [{ label: 'Review savings transfer', prepare: { kind: 'saving', amount, boxId: box.id }, route: { section: 'boxes', page: 'detail', id: box.id } }],
    context: { topic: 'saving', amount, subject: box.name, canonicalQuestion: question },
  };
  if (!/\b(?:send|pay|transfer)\b/.test(q)) return null;
  const merchantQ = destinationQuestion.replace(/gɔbɛ/g, 'gobe');
  const merchants = PAYMENT_SERVICES.filter(service => mentions(merchantQ, norm(service.name).replace(/gɔbɛ/g, 'gobe')) || service.id === 'gobe-spot' && /\bgobe\b/.test(merchantQ) || service.id === 'balme-prints' && /\bbalme\b/.test(merchantQ) || service.id === 'electricity' && /\becg\b/.test(merchantQ));
  if (merchants.length > 1 || merchants.length && named.recipient) return { title: 'Which recipient should I use?', paragraphs: ['That message names more than one destination. Tell me one person or merchant and one amount.'], actions: [], context: { topic: 'clarify' } };
  const merchant = merchants[0];
  if (merchant) {
    const values = { amountText: (amount / 100).toFixed(2), reference: '' }, checked = prepareServicePayment(merchant.id, values);
    return { title: `${cash(amount)} for ${merchant.name}.`, paragraphs: [checked.ok ? 'Your merchant and amount are filled in. Review the details, then authorise the payment yourself.' : 'Your amount is filled in. Add the account or reference details before reviewing this payment.'], actions: [{ label: checked.ok ? 'Review merchant payment' : 'Add payment details', prepare: { kind: 'payment', amount, serviceId: merchant.id, serviceFields: values, ...(checked.ok ? { servicePayment: checked.payment } : {}) }, route: { section: 'pay', page: checked.ok ? 'review' : 'service', ...(checked.ok ? {} : { id: merchant.id }) } }], context: { topic: 'afford', amount, subject: merchant.name, canonicalQuestion: question } };
  }
  const recipient = named.recipient;
  const category = (state.budget?.items || []).find(item => clean(item.name).length > 2 && q.includes(norm(item.name)))?.name || (/lunch|food|gɔbɛ|gobe|meal/.test(q) ? 'Food' : /data|airtime/.test(q) ? 'Data' : /transport|shuttle|fare/.test(q) ? 'Transport' : 'Other');
  const rail = recipient?.rail === 'momo' || recipient?.rail === 'bank' ? recipient.rail : /\b(?:momo|mobile money)\b/.test(q) ? 'momo' : /\bbank\b/.test(q) ? 'bank' : 'lumo';
  const preparedRecipient = recipient ? Object.fromEntries(Object.entries(recipient).filter(([key]) => ['id', 'name', 'number', 'network', 'bank', 'colour', 'emoji'].includes(key))) : null;
  return {
    title: recipient ? `${cash(amount)} to ${recipient.name}. Let’s check it.` : `${cash(amount)}. Who’s it going to?`,
    paragraphs: [recipient && rail === 'lumo' ? 'I’ve filled in an editable payment. Review the recipient, amount and purpose before you authorise it.' : 'I’ve filled in the amount. Choose the account and confirm the registered recipient on the next screen.'],
    actions: [{ label: recipient && rail === 'lumo' ? 'Review payment draft' : 'Choose and check recipient', prepare: { kind: 'payment', amount, recipient: preparedRecipient, rail, category, note: '', source: 'ask-lumo' }, route: { section: 'pay', page: recipient && rail === 'lumo' ? 'review' : 'recipient' } }],
    context: { topic: 'afford', amount, subject: recipient?.name || '', canonicalQuestion: question },
  };
}

export function installPreparedChatAction(ctx, action) {
  const value = action?.prepare;
  if (!value || !Number.isSafeInteger(value.amount) || value.amount <= 0) return false;
  if (value.kind === 'saving') {
    if (!(ctx.state.boxes || []).some(box => box.id === value.boxId && !box.archived)) { ctx.toast?.('That Money Box is no longer available.'); return false; }
    ctx.draft.boxTransferIntent = { boxId: value.boxId, amount: value.amount, direction: 'save' };
    ctx.saveDraft?.(); ctx.go({ section: 'boxes', page: 'detail', id: value.boxId }); return true;
  }
  if (value.kind !== 'payment') return false;
  const install = () => {
    if (value.serviceId) {
      const checked = prepareServicePayment(value.serviceId, { ...value.serviceFields, amountText: (value.amount / 100).toFixed(2) });
      if (!checked.ok) { ctx.draft.servicePayment ||= {}; ctx.draft.servicePayment[value.serviceId] = { ...value.serviceFields, amountText: (value.amount / 100).toFixed(2) }; ctx.closeSheet?.(); ctx.saveDraft?.(); ctx.go({ section: 'pay', page: 'service', id: value.serviceId }); return; }
      const p = checked.payment;
      ctx.draft.payment = { rail: p.rail, recipient: p.recipient, amount: p.amount, amountText: (p.amount / 100).toFixed(2), category: p.category, note: '', serviceId: value.serviceId, reference: p.reference, serviceFields: p.serviceFields, bundleName: p.bundleName || '', billerName: p.billerName || '', preparedBy: 'Lux', idempotencyKey: `chat-payment-${globalThis.crypto?.randomUUID?.() || Date.now()}` };
      ctx.closeSheet?.(); ctx.saveDraft?.(); ctx.go({ section: 'pay', page: 'review' }); return;
    }
    const accountRail = ['momo', 'bank'].includes(value.rail);
    ctx.draft.payment = { rail: value.rail || 'lumo', recipient: accountRail ? null : value.recipient ? { ...value.recipient } : null, amount: value.amount, amountText: (value.amount / 100).toFixed(2), category: value.category || 'Other', note: value.note || '', preparedBy: 'Lux', idempotencyKey: `chat-payment-${globalThis.crypto?.randomUUID?.() || Date.now()}` };
    if (accountRail) { ctx.draft.payment.lookupRequired = true; ctx.draft.payment.recipientForms = { [value.rail]: { number: value.recipient?.number || '', ...(value.rail === 'bank' ? { bank: value.recipient?.bank || '' } : {}) } }; }
    ctx.closeSheet?.(); ctx.saveDraft?.(); ctx.go({ section: 'pay', page: !accountRail && value.recipient ? 'review' : 'recipient' });
  };
  const current = ctx.draft.payment;
  if (current && !current.completed && (current.amount > 0 || current.recipient || current.recipientForms && Object.values(current.recipientForms).some(form => form.number))) {
    ctx.sheet('<h2>You have another draft.</h2><p>Keep that payment or replace it with this one. No money has moved.</p><div class="stack"><button type="button" class="button" data-chat-draft-replace>Use this new draft</button><button type="button" class="button secondary" data-chat-draft-keep>Keep my existing draft</button></div>', sheet => {
      sheet.querySelector('[data-chat-draft-replace]')?.addEventListener('click', install);
      sheet.querySelector('[data-chat-draft-keep]')?.addEventListener('click', () => { ctx.closeSheet?.(); ctx.go({ section: 'pay', page: current.recipient && current.amount > 0 ? 'review' : 'recipient' }); });
    });
  } else install();
  return true;
}
