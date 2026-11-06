import { getMoneyAnswer, getSpendingPeriod, getSpendingScope } from './money-answers.js';
import { cash } from './ui.js';
import { getPreparedChatAction, stampFinancialAnswer, readChatAmount, financialInputAmbiguity, clarifyFinancialInput } from './chat-action-model.js';

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const MONTH_RE = new RegExp(`\\b(${MONTHS.join('|')})(?:\\s+((?:19|20|21)\\d{2}))?\\b`, 'i');
const TOPICS = new Set(['afford', 'saving', 'spending', 'balance', 'daily', 'recovery', 'expected', 'debts', 'outside', 'greeting', 'thanks', 'identity', 'clarify', 'approval']);
const routeAction = (label, section, page = 'home', rest = {}) => ({ label, route: { section, page, ...rest } });
const cleanText = value => String(value ?? '').trim().replace(/\s+/g, ' ').slice(0, 400);
const folds = value => cleanText(value).toLowerCase().replace(/[’‘]/g, "'");
const safeAmount = value => Number.isSafeInteger(value) && Math.abs(value) <= 10000000000;
const context = (topic, rest = {}) => ({ topic, ...rest });
const smallReply = (topic, title, paragraphs, followUps = [], actions = []) => ({ title, paragraphs, followUps, actions, context: context(topic) });

function subjectFrom(question, state, fallback = '') {
  const q = folds(question);
  if (/gobe|gɔbɛ|\b(?:food|lunch|breakfast|dinner|meal|waakye|jollof|hungry)\b/.test(q)) return /gobe|gɔbɛ/.test(q) ? 'gɔbɛ' : 'lunch';
  if (/\b(?:transport|trotro|tro tro|ride|uber|bolt|fare|shuttle)\b/.test(q)) return 'transport';
  if (/\b(?:data|airtime|internet|bundle)\b/.test(q)) return 'data';
  if (/\b(?:essentials|toiletries|laundry|hostel|school fees)\b/.test(q)) return 'essentials';
  const box = (state.boxes || []).find(item => typeof item.name === 'string' && item.name.trim().length > 1 && q.includes(item.name.toLowerCase()));
  return box ? box.name.slice(0, 60) : fallback;
}

function previousContext(messages) {
  if (!Array.isArray(messages)) return null;
  for (let index = messages.length - 1; index >= 0; index--) {
    const message = messages[index];
    if (message?.role !== 'assistant') continue;
    if (message.kind === 'lesson') return null;
    const value = message.context;
    if (!value || !TOPICS.has(value.topic)) return null;
    return {
      topic: value.topic,
      amount: safeAmount(value.amount) && value.amount > 0 ? value.amount : null,
      subject: typeof value.subject === 'string' ? value.subject.slice(0, 60) : '',
      canonicalQuestion: typeof value.canonicalQuestion === 'string' ? value.canonicalQuestion.slice(0, 400) : '',
      month: /^\d{4}-(?:0[1-9]|1[0-2])$/.test(value.month || '') ? value.month : '',
      period: ['today', 'this month', 'this week', 'last week', 'yesterday', 'this year', 'last year', 'history'].includes(value.period) ? value.period : '',
      spendingScope: typeof value.spendingScope === 'string' ? value.spendingScope.slice(0, 200) : '',
      spendingRange: value.spendingRange && ['start', 'end'].every(key => /^\d{4}-\d{2}-\d{2}$/.test(value.spendingRange[key] || '')) ? { start: value.spendingRange.start, end: value.spendingRange.end, through: /^\d{4}-\d{2}-\d{2}$/.test(value.spendingRange.through || '') ? value.spendingRange.through : null } : null,
    };
  }
  return null;
}

function spendingQuestion(state, question, previous, now) {
  const q = folds(question), date = now instanceof Date && !Number.isNaN(now.getTime()) ? now : new Date();
  const requestedScope = getSpendingScope(state, question);
  if (requestedScope.unsupported) return `Explain my spending ${question}.`;
  const scope = requestedScope.query || previous?.spendingScope || '';
  const scoped = value => scope ? `Explain my spending ${scope}. ${value}` : value;
  const requestedPeriod = getSpendingPeriod(question, date);
  if (requestedPeriod.unsupported || requestedPeriod.label.startsWith('on ') || /\b(?:this week|last week|yesterday|last\s+\d+\s+days?|past\s+\d+\s+days?|this year|last year|from|between|(?:in|for|during)\s+(?:19|20|21)\d{2})\b/.test(q)) return scoped(`Explain my spending ${question}.`);
  const named = q.match(MONTH_RE);
  if (named) {
    const year = named[2] || previous?.month?.slice(0, 4) || String(date.getUTCFullYear());
    const name = MONTHS.find(month => month.toLowerCase() === named[1].toLowerCase());
    return scoped(`Explain my spending for ${name} ${year}.`);
  }
  if (/last month|month before/.test(q)) {
    const [year, month] = previous?.month ? previous.month.split('-').map(Number) : [date.getUTCFullYear(), date.getUTCMonth() + 1];
    const prior = new Date(Date.UTC(year, month - 2, 1));
    return scoped(`Explain my spending for ${MONTHS[prior.getUTCMonth()]} ${prior.getUTCFullYear()}.`);
  }
  if (/today/.test(q)) return scoped('Where did my money go today?');
  if (/this month/.test(q)) return scoped('Where did my money go this month?');
  if (previous?.month) return scoped(`Explain my spending for ${MONTHS[Number(previous.month.slice(5)) - 1]} ${previous.month.slice(0, 4)}.`);
  if (previous?.period === 'today') return scoped('Where did my money go today?');
  if (previous?.period === 'this month') return scoped('Where did my money go this month?');
  if (['this week', 'last week', 'yesterday', 'this year', 'last year'].includes(previous?.period)) return scoped(`Explain my spending ${previous.period}.`);
  const inheritedRange = previous?.spendingRange || (previous?.canonicalQuestion ? getSpendingPeriod(previous.canonicalQuestion, date) : null);
  if (inheritedRange?.start && inheritedRange.end) {
    const end = new Date(Date.parse(inheritedRange.end + 'T00:00:00Z') - 86400000);
    if (!Number.isNaN(end.getTime())) return scoped(`Explain my spending from ${inheritedRange.start} to ${end.toISOString().slice(0, 10)}.`);
  }
  return scoped('Where did my money go?');
}

function affordabilityParagraphs(answer) {
  const main = [], details = [];
  for (const paragraph of answer.paragraphs) {
    let match;
    if ((match = paragraph.match(/^Your (.+) plan has (.+?) left\. This payment fits inside it and would leave (.+?) in that category\.$/))) {
      details.push(`Your ${match[1]} plan would go from ${match[2]} to ${match[3]}.`);
    } else if ((match = paragraph.match(/^Your (.+) plan has (.+?) left\. (.+?) of this payment would sit beyond that remaining plan\.$/))) {
      details.push(`Your ${match[1]} plan has ${match[2]} left. This would go ${match[3]} beyond it.`);
    } else if ((match = paragraph.match(/^Before any optional saving hack, your spending balance would become (.+?)\. (.+?) would remain after the rest of your current plan and buffer\.$/))) {
      details.push(`You’d have ${match[1]} in spending and ${match[2]} left after plan, before any Savings Hacks.`);
    } else if ((match = paragraph.match(/^The cost is (.+?), but your spending account holds (.+?)\. The gap is (.+?)\. Expected money cannot cover a payment today\.$/))) {
      main.push(`You’re ${match[3]} short. This costs ${match[1]}; your spending account holds ${match[2]}.`, 'Expected money can’t cover a payment today.');
    } else if ((match = paragraph.match(/^You have (.+?) left after plan\. Paying this would use (.+?) assigned to another commitment or your buffer\. Review the plan before deciding\.$/))) {
      main.push(`You have ${match[1]} left after plan. This would take ${match[2]} from another commitment or your buffer.`, 'Let’s review your plan before deciding.');
    } else if ((match = paragraph.match(/^Your (.+?) recorded outside Lumo is separate from this Lumo payment check\.$/))) {
      details.push(`The ${match[1]} recorded outside Lumo stays separate. It can’t cover this Lumo payment.`);
    } else if (paragraph !== 'This is a check against your recorded plan. The payment review will show the final impact.') details.push(paragraph);
  }
  return [...main, ...details];
}

function savingParagraphs(paragraphs) {
  return paragraphs.flatMap(paragraph => {
    let match;
    if ((match = paragraph.match(/^Putting (.+?) into a Money Box would leave (.+?) after your current plan and buffer\.$/))) return [`Putting ${match[1]} into a Money Box would leave ${match[2]} after your plan and buffer.`];
    if (paragraph === 'A contribution moves money from spending to savings. Your total held money stays the same.') return ['It would move from spending to savings. Your total held money stays the same.'];
    if ((match = paragraph.match(/^You have (.+?) left after plan in Lumo\. A (.+?) contribution would use money already committed or exceed your Lumo balance\.$/))) return [`You have ${match[1]} left after plan in Lumo.`, `Saving ${match[2]} would use money already committed or go beyond your Lumo balance.`];
    if (paragraph === 'You can still set the goal now and fund it gradually as money arrives.') return ['You can set the goal now and add money as it arrives.'];
    if ((match = paragraph.match(/^You have (.+?) across (.+?) Money (Box|Boxes), separate from (.+?) in your spending account\.$/))) return [`You have ${match[1]} saved across ${match[2]} Money ${match[3]}. Your ${match[4]} in spending stays separate.`];
    if ((match = paragraph.match(/^(.+) has (.+?) saved, with (.+?) left to its goal\.$/))) return [`${match[1]} has ${match[2]} saved. ${match[3]} to go.`];
    if ((match = paragraph.match(/^To reach it by (.+?), the remaining pace is about (.+?) a day\. Check it against money actually received before contributing\.$/))) return [`To get there by ${match[1]}: about ${match[2]} a day.`, 'Check that pace against money you’ve actually received before adding to the goal.'];
    if (paragraph === 'Give your first goal a name, a target and a date. Lumo will show the saving pace and let you choose a savings hack.') return ['What’s the goal? Give it a name, an amount and a date.', 'Lumo can work out the pace. You can also choose a Savings Hack.'];
    return [paragraph];
  });
}

function recoveryParagraphs(paragraphs) {
  return paragraphs.flatMap(paragraph => {
    const match = paragraph.match(/^You have (.+?) in your spending account\. After your current commitments and (.+?) buffer, (.+?) is left after plan\.$/);
    if (match) return [`You have ${match[1]} in spending. ${match[3]} is left after your plan and ${match[2]} buffer.`];
    if (paragraph === 'We can review what is due, protect the essentials and choose a temporary daily limit. Your expected allowance stays outside the money available to spend.') return ['Let’s review what’s due, protect essentials and set a temporary daily limit.', 'Your expected allowance stays outside the money available to spend.'];
    return [paragraph];
  });
}

function financialReply(state, topic, canonicalQuestion, now, rest = {}) {
  const answer = getMoneyAnswer(state, canonicalQuestion, now);
  const ctx = context(topic, { canonicalQuestion, ...rest });
  let title = answer.title, paragraphs = [...answer.paragraphs], followUps = [];
  switch (topic) {
    case 'afford':
      if (title === 'It fits, with this trade-off.') title = 'There’s room, with one trade-off.';
      // Rephrase the existing calculation; keep its category, wallet and funding boundaries.
      paragraphs = affordabilityParagraphs(answer);
      followUps = ['How much can I spend today?', 'What’s left in my plan?']; break;
    case 'saving':
      if (title === 'That fits the money left after plan.') title = 'A little closer to that goal.';
      if (title === 'Give that goal a steady rhythm.') title = 'Let’s keep that goal moving.';
      paragraphs = savingParagraphs(paragraphs);
      followUps = ['Can I save GH₵20?', 'How much can I spend today?']; break;
    case 'recovery': title = 'Okay. Let’s take this one step at a time.'; paragraphs = recoveryParagraphs(paragraphs); followUps = ['What do I have available?', 'What do I owe?']; break;
    case 'spending': {
      const period = getSpendingPeriod(canonicalQuestion, now);
      ctx.month = period.month || '';
      ctx.period = canonicalQuestion.match(/\b(today|this month|this week|last week|yesterday|this year|last year)\b/i)?.[1].toLowerCase() || 'history';
      ctx.spendingScope = getSpendingScope(state, canonicalQuestion).query;
      ctx.spendingRange = period.start && period.end ? { start: period.start, end: period.end, through: period.through || null } : null;
      paragraphs = paragraphs.map(paragraph => paragraph.replace('Savings transfers are kept separate from spending. Pending, failed and reversed payments are excluded.', 'That’s completed payments only. Savings moves, pending, failed and reversed payments stay out.'));
      followUps = ['And last month?', 'How much can I spend today?']; break;
    }
    case 'expected': title = 'On its way. Not spendable yet.'; followUps = ['My allowance is late', 'What do I have available?']; break;
    case 'debts': followUps = ['Who owes me?', 'What do I have available?']; break;
    case 'outside': followUps = ['What do I have available?', 'How much is in my Money Boxes?']; break;
    case 'daily':
      if (title === 'Here is your daily guide.') title = 'A little room for today.';
      followUps = ['Can I spend GH₵50 on lunch?', 'My allowance is late']; break;
    case 'balance': title = answer.title === 'Every cedi has a place.' ? 'Here’s the money story.' : answer.title; paragraphs = paragraphs.slice(0, 2); followUps = ['How much can I spend today?', 'Where did my money go?']; break;
  }
  return { ...answer, title, paragraphs, followUps, context: ctx };
}

/** Local conversational layer. It can explain and open pages, never move money. */
function conversationAnswer(state, question, { messages = [], now = new Date() } = {}) {
  const original = cleanText(question), q = folds(original), previous = previousContext(messages);
  const name = cleanText(state.profile?.name).split(' ')[0] || 'there';
  const prepared = getPreparedChatAction(state, original);
  if (prepared) return prepared;
  if (financialInputAmbiguity(original) === 'currency') return clarifyFinancialInput('currency');
  if (!original) return smallReply('clarify', 'I’m listening.', ['A payment, a goal, or just making sense of your money. Where shall we start?'], ['Can I afford lunch?', 'Where did my money go?', 'Help me save']);
  if (/^(?:(?:hi|hello|hey)(?: there)?|good (?:morning|afternoon|evening))(?:[,!\s]+(?:lux|lumo))?[.!?\s]*$/.test(q)) return smallReply('greeting', `Hey ${name}.`, ['Lux here. What’s the money question today?'], ['Can I afford lunch?', 'My allowance is late', 'Help me save']);
  if (/^(?:thanks|thank you|cheers)(?: so much| a lot)?(?:[,!\s]+(?:lux|lumo))?[.!?\s]*$/.test(q)) return smallReply('thanks', 'Anytime.', ['A little clearer is a good place to be. I’m here for the next question.'], ['How much can I spend today?', 'Help me save']);
  if (/\b(?:who are you|what(?:'s| is) your name|are you (?:a real person|an? ai|human)|what can you do)\b/.test(q)) return smallReply('identity', 'I’m Lux, your Lumo money buddy.', ['I can help you read your balance, check a cost, unpack spending or plan a goal. In this demo, I work from the money recorded in Lumo.'], ['Explain my balance', 'Can I afford lunch?', 'Help me save']);
  if (/^(?:how are you|you good|what(?:'s| is) up)(?:[,!\s]+(?:lux|lumo))?[.!?\s]*$/.test(q)) return smallReply('greeting', 'Ready when you are.', ['A money question, a plan, or a little clarity. What’s on your mind?'], ['Can I afford lunch?', 'Where did my money go?', 'Help me save']);
  if (/^(?:yes|yep|yeah|okay|ok|go ahead|do it|send it|pay it|save it|let'?s do (?:it|that)|do that|move it)[.!?\s]*$/.test(q)) {
    const actions = previous?.topic === 'saving' ? [routeAction('Open Money Boxes', 'boxes')] : previous?.topic === 'afford' ? [routeAction('Open payments', 'pay')] : previous?.topic === 'recovery' ? [routeAction('Open recovery plan', 'life', 'recovery')] : [];
    return smallReply('approval', 'You’re in charge of the next step.', ['This chat doesn’t move money. Open the matching page to review the details and approve it there.'], ['Explain my balance'], actions);
  }

  // Read historical intent before prices: a year in a date is not a payment amount.
  if (/\b(?:what|how much)\b.*\b(?:did|have) i\b.*\b(?:spend|spent|pay|paid)\b/.test(q)) {
    const canonical = spendingQuestion(state, original, null, now), period = getSpendingPeriod(canonical, now);
    if (period.month && period.month > now.toISOString().slice(0, 7)) return smallReply('clarify', 'That month is still ahead.', ['I can look at recorded spending for this month or an earlier one.']);
    return financialReply(state, 'spending', canonical, now);
  }

  const amount = readChatAmount(original);
  if ((/\b(?:saved|saving transfers|moved to savings|put aside)\b/.test(q) || /\bhow much\b.*\bsave\b/.test(q)) && /\b(?:today|yesterday|week|month|days?|year|from|between|recorded history)\b/.test(q)) return financialReply(state, 'saving', original, now);
  const followup = /^(?:and\b|what about\b|how about\b|instead\b|would\b|could\b|for\b|per\b)/.test(q) || /^-?(?:gh\s*[₵¢c]|ghs\s*)?\d[\d,.]*(?:\s*(?:cedis?|pesewas?|instead))?[.!?\s]*$/.test(q);
  if (followup && previous && ['afford', 'saving'].includes(previous.topic)) {
    const topic = /\b(?:save|saving|savings|put\s+aside)\b/.test(q) ? 'saving' : /\b(?:spend|buy|pay|afford)\b/.test(q) ? 'afford' : previous.topic;
    const subject = subjectFrom(original, state, topic === previous.topic ? previous.subject : topic === 'saving' ? 'my goal' : '');
    const ambiguity = financialInputAmbiguity(original);
    if (ambiguity) return clarifyFinancialInput(ambiguity);
    if (/per day|a day|daily|each day/.test(q)) return financialReply(state, 'daily', 'How much can I spend today?', now);
    const value = amount.found ? amount.amount : topic === previous.topic ? previous.amount : null;
    if (amount.invalid || value !== null && value <= 0) return { ...smallReply('clarify', 'Let’s use a clear amount.', ['Use an amount above zero, with no more than two decimal places in cedis. Pesewas need to be whole numbers.']), context: context(previous.topic, { amount: null, subject }) };
    if (value !== null && safeAmount(value) && (amount.found || subject !== previous.subject)) {
      const canonical = topic === 'saving' ? `Can I save ${cash(value)}${subject ? ` toward ${subject}` : ''}?` : `Can I spend ${cash(value)}${subject ? ` on ${subject}` : ''}?`;
      return financialReply(state, topic, canonical, now, { amount: value, subject });
    }
  }
  if (followup && previous?.topic === 'spending' && (getSpendingScope(state, original).query || MONTH_RE.test(q) || /last month|month before|this month|today|yesterday|week|last\s+\d+\s+days?|from|between|year/.test(q))) {
    const canonical = spendingQuestion(state, original, previous, now), period = getSpendingPeriod(canonical, now);
    if (period.month && period.month > now.toISOString().slice(0, 7)) return smallReply('clarify', 'That month is still ahead.', ['I can look at recorded spending for this month or an earlier one.'], ['Where did my money go this month?', 'Where did my money go last month?']);
    return financialReply(state, 'spending', canonical, now);
  }

  if (/(?:allowance|income|money).*(?:late|not (?:landed|arrived|come)|hasn'?t (?:landed|arrived|come)|isn'?t here|still waiting|delayed)|(?:still waiting|waiting).*(?:allowance|income)|(?:allowance|income).*no show/.test(q) || /\b(?:recover|recovery)\b/.test(q) || previous && ['expected','recovery'].includes(previous.topic) && /^(?:it|that).*(?:hasn'?t|not|isn'?t).*(?:landed|come|arrived|here)/.test(q)) return financialReply(state, 'recovery', 'My allowance is late', now);
  if (/\b(?:i(?:'m| am) broke|money(?:'s| is) tight|stressed about money|wallet is crying|running out of money)\b/.test(q)) {
    const answer = financialReply(state, 'balance', 'Explain my available balance', now);
    return { ...answer, title: 'Let’s take it one step at a time.', paragraphs: ['We can start with what’s actually here.', ...answer.paragraphs] };
  }

  if (/\b(?:hungry|need lunch)\b/.test(q) && !amount.found) return { ...smallReply('afford', 'Let’s check lunch first.', ['Tell me what it would cost, and I’ll check how it sits with your plan.'], ['How much can I spend today?']), context: context('afford', { amount: null, subject: 'lunch' }) };

  if (/^(?:what|how much)(?: money)? can i (?:spend|use)(?: in| from)? lumo(?: now)?[.!?\s]*$/.test(q)) return financialReply(state, 'balance', 'Explain my available balance', now);
  if (/\b(?:make|help).*(?:allowance|money).*(?:last|stretch)|\bstretch.*(?:allowance|money)|\b(?:allowance|money).*last (?:until|till|to)\b/.test(q)) return { ...financialReply(state, 'daily', 'How much can I spend today?', now), followUps: ['What’s left in my plan?', 'My allowance is late'] };

  const saving = /\b(?:save|saving|savings|money box|money boxes|goal|goals|round.?up|hack|hacks)\b|put.*aside/.test(q);
  const costPhrase = amount.found && subjectFrom(original, state) && /^(?:(?:gh\s*[₵¢c]|ghs)\s*)?-?\d[\d,.]*(?:\s*(?:cedis?|pesewas?))?\s+(?:for|on)\s+.+[?!.]*$/.test(q);
  const afford = costPhrase || /\bafford\b|\b(?:can|could|should|may) i (?:buy|pay|spend|grab|get|order)|\b(?:buy|pay|spend|grab|get|cost)\b.*\d|\bi want (?:to |a )?(?:buy|pay|spend|grab|get)/.test(q);
  if (saving || afford) {
    const topic = saving ? 'saving' : 'afford', subject = subjectFrom(original, state, saving ? 'my goal' : '');
    if (amount.invalid || amount.found && amount.amount <= 0) return { ...smallReply('clarify', 'Let’s use a clear amount.', ['Use an amount above zero, with no more than two decimal places in cedis. Pesewas need to be whole numbers.']), context: context(topic, { amount: null, subject }) };
    const ambiguity = financialInputAmbiguity(original);
    if (ambiguity) return clarifyFinancialInput(ambiguity);
    const percent = /%|percent|round.?up|hack/.test(q);
    if (afford && !saving && !amount.found && !/today|daily|per day|a day|each day|how much.*spend/.test(q)) return { ...smallReply('afford', 'How much would it cost?', ['Tell me the amount in cedis and I’ll check it against your plan.'], ['How much can I spend today?', 'Explain my balance']), context: context('afford', { amount: null, subject }) };
    const goalDate = saving && /\b(?:by|in|for)\s+(?:19|20|21)\d{2}\b/.test(q) && !/(?:gh\s*[₵¢c]|ghs|cedis?|pesewas?)/.test(q);
    if (amount.found && !percent && !goalDate) {
      const canonical = topic === 'saving' ? `Can I save ${cash(amount.amount)}${subject ? ` toward ${subject}` : ''}?` : `Can I spend ${cash(amount.amount)}${subject ? ` on ${subject}` : ''}?`;
      return financialReply(state, topic, canonical, now, { amount: amount.amount, subject });
    }
    if (saving) return financialReply(state, 'saving', percent ? original : `Help me save${subject !== 'my goal' ? ` for ${subject}` : ''}`, now, { amount: null, subject });
  }

  if (/where.*(?:money|all go|it.*go)|\b(?:spending|spent|transactions|biggest category)\b|\b(?:how much|what) did i (?:spend|pay)|\b(?:how much|what) have i (?:spent|paid)/.test(q)) {
    const canonical = spendingQuestion(state, original, null, now), period = getSpendingPeriod(canonical, now);
    if (period.month && period.month > now.toISOString().slice(0, 7)) return smallReply('clarify', 'That month is still ahead.', ['I can look at recorded spending for this month or an earlier one.'], ['Where did my money go this month?']);
    return financialReply(state, 'spending', canonical, now);
  }
  if (/\b(?:today|daily|per day|a day|each day)\b|how much.*spend/.test(q)) return financialReply(state, 'daily', 'How much can I spend today?', now);
  if (/who.*owe.*me|\b(?:owed to me|expected|on the way|coming in|next allowance|next income)\b|when.*allowance/.test(q)) return financialReply(state, 'expected', 'Who owes me? What income is expected?', now);
  if (/\b(?:what.*owe|i owe|owe someone|owe people|my debt|debts|repay)\b/.test(q)) return financialReply(state, 'debts', 'What do I owe?', now);
  if (/\b(?:outside|other bank|another bank|cash|all my money|total|net worth)\b|how much.*have|my (?:momo|mobile money).*(?:balance|money)/.test(q)) return financialReply(state, 'outside', original, now);
  if (/why|spendable|left after|available|budget|plan|buffer|balance|what.*left|what can i spend in lumo/.test(q)) return financialReply(state, 'balance', 'Explain my available balance', now);
  return smallReply('clarify', 'Help me read that.', ['Is this about spending, saving, or money you’re waiting for? Pick one below, or tell me a little more.'], ['Can I afford lunch?', 'Help me save', 'My allowance is late']);
}

export function getConversationalAnswer(state, question, options = {}) {
  const now = options.now || new Date();
  return stampFinancialAnswer(state, conversationAnswer(state, question, { ...options, now }), question, now);
}
