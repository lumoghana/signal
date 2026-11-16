import { cash, dateLabel } from './ui.js';
import { readChatAmount, financialSnapshotKey } from './chat-action-model.js';

const clean = value => String(value || '').trim().replace(/\s+/g, ' ').slice(0, 400);
const norm = value => clean(value).toLowerCase().replace(/[’‘]/g, "'");
const validDay = value => /^\d{4}-\d{2}-\d{2}$/.test(value || '') && Number.isFinite(Date.parse(value)) && new Date(value).toISOString().slice(0, 10) === value;
const outsideWords = /\b(?:cash|momo|mobile money|bank|outside)\b/;
const weekdays = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
const clarify = (title, paragraph, followUps = []) => ({ title, paragraphs: [paragraph], actions: [], followUps, context: { topic: 'clarify' } });
const questionType = question => {
  const q = norm(question);
  if (/\b(?:reuse|repeat|bring back|use again)\b.*\b(?:plan|budget|essentials)\b|\b(?:same|last|previous)\s+(?:essential(?:s)?\s+)?(?:plan|budget)\b.*\b(?:again|reuse|next|new)\b/.test(q)) return 'plan_reuse';
  if (/\b(?:money check|weekly check|check my money|money check.in)\b|\bwhat(?:'s| is)?\b.*\b(?:coming up|due (?:soon|next|this)|upcoming)\b/.test(q)) return 'money_check';
  if (/\b(?:remember|remind|record a commitment|save a commitment|add an? essential)\b|\b(?:need to pay|must pay|have to pay|will need to pay)\b/.test(q) && /\d/.test(q)) return 'commitment';
  if (/\b(?:balance|have|left)\b.*\b(?:now|actually|currently)\b.*\d|\b(?:now|actually|currently)\b.*\b(?:balance|have|left)\b.*\d/.test(q)) return 'outside_record';
  if (/\b(?:spent|paid|received|got|earned|will receive|expecting|expect to receive)\b/.test(q) && outsideWords.test(q) && /\d/.test(q)) return 'outside_record';
  return '';
};

/** Classification carries no amounts, accounts or authority to save. */
export const maintenanceQuestionTask = question => questionType(question);

export function parseMaintenanceDate(question, now = new Date()) {
  const q = norm(question), today = now.toISOString().slice(0, 10), iso = q.match(/\b\d{4}-\d{2}-\d{2}\b/g) || [];
  const shift = days => new Date(Date.parse(today) + days * 86400000).toISOString().slice(0, 10);
  const relative = q.match(/\b(?:day after tomorrow|tomorrow|today)\b/g) || [];
  const weekdayCount = weekdays.filter(name => new RegExp(`\\b${name}\\b`).test(q)).length;
  if (relative.length > 1 || relative.length && weekdayCount || iso.length && (relative.length || weekdayCount)) return { error: 'Give me one due date. I found more than one date in that sentence.' };
  if (iso.length > 1 || iso.length === 1 && !validDay(iso[0])) return { error: 'Give me one valid due date, in YYYY-MM-DD, so you can review it.' };
  if (iso.length) return iso[0] < today ? { error: 'That date has passed. Give me the date this cost is next needed.' } : { due: iso[0], phrase: iso[0] };
  if (/day after tomorrow/.test(q)) return { due: shift(2), phrase: 'day after tomorrow' };
  if (/\btomorrow\b/.test(q)) return { due: shift(1), phrase: 'tomorrow' };
  if (/\btoday\b/.test(q)) return { due: today, phrase: 'today' };
  const matches = weekdays.filter(day => new RegExp(`\\b${day}\\b`).test(q));
  if (matches.length > 1) return { error: 'Which single date is this cost needed? You can use YYYY-MM-DD.' };
  if (matches.length) {
    const name = matches[0], current = new Date(`${today}T12:00:00Z`).getUTCDay();
    let distance = (weekdays.indexOf(name) - current + 7) % 7;
    if (new RegExp(`\\bnext\\s+${name}\\b`).test(q) && distance === 0) distance = 7;
    return { due: shift(distance), phrase: name };
  }
  return { error: 'When is this needed? Give me one date, such as next Friday or YYYY-MM-DD.' };
}

function singleAmount(question, { allowZero = false } = {}) {
  const withoutDates = question.replace(/\b\d{4}-\d{2}-\d{2}\b/g, '');
  const values = withoutDates.match(/-?\d[\d,]*(?:\.\d+)?/g) || [];
  const parsed = readChatAmount(withoutDates);
  if (values.length !== 1 || !parsed.found || parsed.invalid || parsed.amount < (allowZero ? 0 : 1) || parsed.amount > 10000000000 || /%|\b(?:percent|per|every|daily|weekly|monthly)\b/i.test(withoutDates)) return null;
  return { amount: parsed.amount, raw: values[0] };
}

function chooseOutside(state, question) {
  const q = norm(question), accounts = (state.externalBalances || []).filter(x => x && typeof x.id === 'string');
  const named = accounts.filter(x => norm(x.name).length > 1 && q.includes(norm(x.name)));
  const type = /\bcash\b/.test(q) ? 'cash' : /\b(?:momo|mobile money)\b/.test(q) ? 'momo' : /\bbank\b/.test(q) ? 'bank' : '';
  const matches = named.length ? named : type ? accounts.filter(x => x.type === type) : [];
  return matches.length === 1 ? { account: matches[0] } : { error: matches.length > 1 ? 'You have more than one matching outside account. Use its saved name so I can prepare the right record.' : 'Which saved cash, MoMo or bank account is this? Add it in All your money first if it is not recorded yet.' };
}

function reviewAnswer(state, action, payload, title, paragraphs, now) {
  return { title, paragraphs, actions: [{ label: action === 'completeMoneyCheck' ? 'Review my money check' : action === 'reuseEssentialPlan' ? 'Review essentials to reuse' : 'Review this record', prepare: { kind: 'maintenance', action, payload, moneySnapshot: financialSnapshotKey(state), preparedOn: now.toISOString().slice(0, 10) } }], followUps: ['What’s coming up this week?'], context: { topic: 'maintenance' } };
}

/** Understanding a sentence only creates a review draft. It never mutates money. */
export function getMaintenanceChatAnswer(state, question, { now = new Date() } = {}) {
  const task = questionType(question);
  if (!task) return null;
  const q = norm(question);
  if (/\b(?:don't|do not|didn't|did not|haven't|hasn't|hadn't|have not|has not|never|not yet|if|unless|instead|rather)\b/.test(q)) return clarify('Let’s make the record clear.', 'Tell me one thing that actually happened, or one future cost you want to record. Nothing has been saved.');
  if (task === 'plan_reuse') return reviewAnswer(state, 'reuseEssentialPlan', {}, 'Let’s reuse the useful parts.', ['Choose the new plan dates and review each essential. One-off costs stay out unless you choose them. Your existing spending is not reset by this chat.'], now);
  if (task === 'money_check') {
    const today = now.toISOString().slice(0, 10), until = new Date(Date.parse(today) + 7 * 86400000).toISOString().slice(0, 10);
    const upcoming = (state.budget?.items || []).filter(x => validDay(x.due) && x.due >= today && x.due <= until && Number.isSafeInteger(x.amount) && x.amount > (x.spent || 0)).sort((a, b) => a.due.localeCompare(b.due));
    return reviewAnswer(state, 'completeMoneyCheck', {}, upcoming.length ? 'Here’s what is coming up.' : 'Let’s check the week ahead.', upcoming.length ? [...upcoming.slice(0, 4).map(x => `${x.name}: ${cash(x.amount - (x.spent || 0))} still planned, needed ${dateLabel(x.due)} (${x.due}).`), 'These are recorded costs, not payments already made. Review outside balances and dates before marking your check complete.'] : ['No unpaid essentials with a date in the next seven days are recorded. That does not prove there are no costs coming up. Review your balances and plan before marking the check complete.'], now);
  }
  const value = singleAmount(question, { allowZero: task === 'outside_record' && /balance|\bnow\b/.test(q) });
  if (!value) return clarify('What is the one amount in cedis?', 'Use one actual amount with up to two decimal places. Dates can be YYYY-MM-DD. I won’t combine several costs or assume a currency conversion.');
  if (task === 'commitment') {
    const date = parseMaintenanceDate(question, now);
    if (date.error) return clarify('What date should I record?', date.error);
    const location = question.indexOf(value.raw), after = question.slice(location + value.raw.length).replace(/^\s*(?:cedis?|ghs|pesewas?)\b/i, '').replace(/^\s*(?:for|on|to)\s+/i, '');
    let name = after.split(/\b(?:today|tomorrow|day after tomorrow|next|this|on|by|due|monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b|\d{4}-\d{2}-\d{2}/i)[0].replace(/[?.!]+$/, '').trim();
    if (!name) name = question.slice(0, location).replace(/^(?:please\s+)?(?:can you\s+)?(?:remember(?: that)?|remind me(?: that)?|record a commitment(?: for)?|save a commitment(?: for)?|add an? essential(?: for)?)\s*/i, '').replace(/\b(?:i|will|need to pay|must pay|have to pay|for|ghs|gh[₵¢c])\b/gi, '').trim();
    if (!name || name.length > 80 || /\b(?:pay|remember|need|cost|money)\b/i.test(name) && name.split(/\s+/).length < 2) return clarify('What is this cost for?', 'Give the cost a short name, amount and date. For example, “Remember GH₵120 for lab next Friday”.');
    return reviewAnswer(state, 'saveCommitment', { name, amount: value.amount, due: date.due, expectedRevision: state.moneyMaintenance?.revision ?? state.maintenance?.revision ?? 0 }, `Let’s review ${name}.`, [`${cash(value.amount)} needed ${dateLabel(date.due)} (${date.due}, Ghana time). Check that date in the review.`, 'Review the cost, then confirm it in your plan.'], now);
  }
  if (/\b(?:did i|have i|has it|can i|could i|should i|might|would)\b|\b(?:and|or)\b/.test(q)) return clarify('Let’s check one outside record.', 'Tell me one completed movement or one current balance, and the saved outside account name. I won’t turn a question or alternative into a recorded arrival.');
  const dated = /\d{4}-\d{2}-\d{2}|\b(?:today|tomorrow|monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b/.test(q) ? parseMaintenanceDate(question, now) : null;
  const future = /\b(?:will|expect|expecting|promised|coming|tomorrow|next)\b/.test(q) || dated?.due > now.toISOString().slice(0, 10);
  if (future && /\b(?:spent|paid)\b/.test(q)) return clarify('Has that cost happened yet?', 'A future cost belongs in your plan until it is actually paid. Say “Remember 25 for lunch next Friday” to review a commitment. I have not reduced your outside balance.');
  if (future) return { title: 'Expected until it arrives.', paragraphs: [`${cash(value.amount)} is still on the way. I won’t add it to an outside balance or Lumo money before it has actually arrived. Record the expected amount and date in your income plan.`], actions: [{ label: 'Review expected income', route: { section: 'plan', page: 'home' } }], followUps: ['My allowance is late'], context: { topic: 'expected' } };
  const chosen = chooseOutside(state, question);
  if (chosen.error) return clarify('Which outside account?', chosen.error);
  const account = chosen.account, base = { id: account.id, expectedRevision: account.revision || 0, ...(account.updatedAt ? { expectedUpdatedAt: account.updatedAt } : {}) };
  if (/\b(?:balance|have|left)\b.*\b(?:now|actually|currently)\b|\b(?:now|actually|currently)\b.*\b(?:balance|have|left)\b/.test(q)) return reviewAnswer(state, 'confirmExternalBalance', { ...base, balance: value.amount }, `Review ${account.name} at ${cash(value.amount)}.`, ['This replaces your manually recorded outside balance. It does not top up Lumo or create a payment. Check the actual balance before confirming.'], now);
  const direction = /\b(?:spent|paid)\b/.test(q) ? 'out' : /\b(?:received|got|earned)\b/.test(q) ? 'in' : '';
  if (!direction || /\b(?:spent|paid)\b/.test(q) && /\b(?:received|got|earned)\b/.test(q)) return clarify('Did money come in or go out?', 'Tell me one completed outside movement and the account. No money has changed.');
  return reviewAnswer(state, 'externalMovement', { ...base, amount: value.amount, direction }, `Review ${cash(value.amount)} ${direction === 'out' ? 'spent from' : 'received into'} ${account.name}.`, ['This updates your manual outside-money record only. Check the account, amount and optional matching essential before confirming. It does not move money in Lumo.'], now);
}
