import { getConversationalAnswer } from './chat-language.js';
import { getSummary, getGuidanceHorizon, evaluatePayment, budgetCategoryKey } from './model.js';
import { paymentTransactions, merchantRefundTransactions, getSpendingPeriod, getSpendingScope } from './money-answers.js';
import { readChatAmount, stampFinancialAnswer, financialInputAmbiguity } from './chat-action-model.js';
import { cash, dateLabel } from './ui.js';

// A language model may select a read tool. Only this module calculates money,
// chooses app routes, and creates answer cards. No tool can commit an action.
export const LUX_TASKS = Object.freeze(['balance','spending','afford','compare','recurring','patterns','forecast','goal','recovery','explain','legacy','clarify']);
const periods = ['this week','last week','this month','last month','today','yesterday','last 7 days','last 30 days','recorded history'];
const text = (v, max = 400) => typeof v === 'string' ? v.trim().replace(/\s+/g, ' ').slice(0, max) : '';
const normal = v => text(v).toLowerCase().replace(/[’‘]/g, "'");
const money = v => Number.isSafeInteger(v) && v > 0 && v <= 10000000000;
const day = v => /^\d{4}-\d{2}-\d{2}$/.test(v || '') && Number.isFinite(Date.parse(v)) && new Date(v).toISOString().slice(0,10) === v;
const sum = xs => xs.reduce((n, x) => n + x.amount, 0);
const route = (label, section, page = 'home', rest = {}) => ({ label, route: { section, page, ...rest } });
const previousAnswer = messages => [...(messages || [])].reverse().find(x => x?.role === 'assistant' && x.kind !== 'lesson');
const previousPlan = messages => previousAnswer(messages)?.luxPlan || null;
const categoryFor = subject => /food|g[oɔ]b[eɛ]|lunch|breakfast|dinner|meal|waakye|jollof/i.test(subject) ? 'Food' : /trotro|tro tro|transport|bolt|uber|fare|ride/i.test(subject) ? 'Transport' : /data|bundle|airtime|internet/i.test(subject) ? 'Data' : subject;
const details = (state, now) => {
  const s = getSummary(state, now), buffer = Number.isSafeInteger(state.buffer) ? state.buffer : 0;
  return [`${cash(s.available)} available − ${cash(s.planned)} in remaining commitments − ${cash(buffer)} kept back = ${cash(s.spendable)} left after plan${s.available < s.planned + buffer ? ' (floored at zero)' : ''}.`, 'Expected income, unpaid incoming IOUs, Money Boxes, group funds and outside balances cannot fund this Lumo payment.'];
};
const readBasis = ['Only completed payments recorded in Lumo are included, with recorded fees. Pending, failed, reversed and internal transfers are excluded. Card refunds reduce their purchase; merchant refund arrivals are reported separately.'];
export const isPrivateLuxQuestion = question => /\b(?:pin|password|passcode|otp|access.?token|refresh.?token|ghana.?card|card number|cvv)\b.{0,32}(?:\d{3,}|[=:]\s*\S+)|\bGHA-\d{9}-\d\b|\b(?:\d[ -]?){13,19}\b/i.test(question);

function numericWords(value) {
  const units={zero:0,one:1,two:2,three:3,four:4,five:5,six:6,seven:7,eight:8,nine:9,ten:10,eleven:11,twelve:12,thirteen:13,fourteen:14,fifteen:15,sixteen:16,seventeen:17,eighteen:18,nineteen:19,twenty:20,thirty:30,forty:40,fifty:50,sixty:60,seventy:70,eighty:80,ninety:90};
  const word=`(?:${Object.keys(units).join('|')}|hundred|thousand)`;
  return value.replace(new RegExp(`\\b${word}(?:(?:[ -]+(?:and[ -]+)?)${word})*\\b`,'gi'),phrase=>{
    let total=0,part=0;
    for(const w of phrase.toLowerCase().split(/[ -]+/)){if(w==='and')continue;if(w==='hundred')part=Math.max(1,part)*100;else if(w==='thousand'){total+=Math.max(1,part)*1000;part=0;}else part+=units[w];}
    return String(total+part);
  });
}

function amountsIn(question) {
  const q = numericWords(text(question)).replace(/\b\d{4}-\d{2}-\d{2}\b/g, '').replace(/(ghs|gh[₵¢c])(?=\d)/gi,'$1 ').replace(/(\d)(ghs|cedis?|pesewas?)/gi,'$1 $2');
  const matches=[...q.matchAll(/(?:^|[^\w.])(-?\d[\d,]*(?:\.\d+)?)(?![\w.])/g)];
  return matches.filter(x=>!/^\s*(?:days?|weeks?|months?|years?|times?|%|percent)\b/i.test(q.slice(x.index+x[0].length))).map(x=>{
    const unit=q.slice(x.index+x[0].length).match(/^\s*(pesewas?)\b/i)?.[1];
    return readChatAmount(`${x[1]}${unit?' '+unit:''}`);
  }).filter(x=>x.found&&!x.invalid&&money(x.amount)).map(x=>x.amount);

}

/** Conversation sent to the interpreter contains questions and bounded intent slots,
 * never answers, balances, transactions, PINs or identity documents. */
export function luxQuestionContext(messages = []) {
  const questions = messages.filter(x => x?.role === 'user' && typeof x.text === 'string' && !isPrivateLuxQuestion(x.text)).slice(-6).map(x => text(x.text));
  const p = previousPlan(messages);
  return { questions, previous: p ? Object.fromEntries(['task','amount','alternative','subject','period','days','start','end'].filter(k => p[k] !== undefined).map(k => [k,p[k]])) : null };
}

/** Reject invented numbers, unsupported commands, foreign currencies and invalid slots.
 * Interpretation is untrusted input, even when it came from our own model. */
export function validateLuxPlan(input, question, context = {}) {
  if (!input || typeof input !== 'object' || Array.isArray(input) || !LUX_TASKS.includes(input.task)) return null;
  const p = { task: input.task }, combined = [...(context.questions || []).slice(-6), text(question)].join(' '), numeric=numericWords(combined);
  if (input.confidence !== undefined && (!Number.isFinite(input.confidence) || input.confidence < 0 || input.confidence > 1)) return null;
  if (input.confidence !== undefined && input.confidence < .72) return { task: 'clarify' };
  const permitted = new Set(amountsIn(combined));
  if (money(context.previous?.amount)) permitted.add(context.previous.amount);
  if (money(context.previous?.alternative)) permitted.add(context.previous.alternative);
  for (const k of ['amount','alternative']) if (input[k] != null) { if (!money(input[k]) || !permitted.has(input[k])) return null; p[k] = input[k]; }
  if (input.days != null) { if (!Number.isSafeInteger(input.days) || input.days < 1 || input.days > 366 || !new RegExp(`\\b${input.days}\\s*(?:days?|times?)\\b`, 'i').test(numeric) && context.previous?.days !== input.days) return null; p.days = input.days; }
  if (input.subject) p.subject = text(input.subject, 80);
  if (input.period) { if (!periods.includes(input.period)) return null; p.period = input.period; }
  for (const k of ['start','end']) if (input[k]) { if (!day(input[k]) || !combined.includes(input[k])) return null; p[k] = input[k]; }
  if (p.start && p.end && p.start > p.end) return null;
  if (/[$€£¥₦]|\b(?:usd|dollars?|euros?|pounds?|naira|btc|eth)\b/i.test(combined) && ['afford','compare','recurring','goal'].includes(p.task)) return null;
  return p;
}

export function planLuxQuestion(question, { messages = [] } = {}) {
  const q = normal(numericWords(question)), prior = previousPlan(messages), amounts = amountsIn(question);
  const follow = /^(?:and|what about|how about|instead|actually|make (?:it|that)|just|only|why|how|what if|so|then|yes|no)\b/.test(q) || /^\d[\d.,]*(?:\s*cedis?)?[?.!]*$/.test(q);
  let subject = /lunch|breakfast|dinner|food|g[oɔ]b[eɛ]|waakye|jollof|trotro|tro tro|transport|bolt|uber|data|airtime|internet|bundle/.exec(q)?.[0] || '';
  if (!subject && follow) subject = prior?.subject || previousAnswer(messages)?.context?.subject || '';
  const period = periods.find(p => q.includes(p)) || (follow ? prior?.period : '') || '';
  const base = { subject, ...(period ? { period } : {}) };
  if (/^(?:show (?:your|the) calculation|why|how (?:did you|is that|do you know)|explain (?:that|this|the maths)|show (?:your|the) (?:math|working|calculation)|what.*based on)[?.!\s]*$/.test(q)) return { task: 'explain' };
  if (/\b(?:compare|versus|vs|or|instead of|rather than|cheaper|difference between)\b/.test(q) && (amounts.length >= 2 || /afford|buy|cost|lunch|ride|transport|data|cedis?|ghs|₵/.test(q))) return { task: 'compare', ...base, amount: amounts[0], alternative: amounts[1] };
  const repeated = q.match(/\b(?:for|over|across)\s+(\d+)\s+days?\b/);
  if (repeated && /\b(?:a day|per day|daily|each day|every day)\b/.test(q)) return { task: 'recurring', ...base, amount: amounts[0] || (follow ? prior?.amount : undefined), days: +repeated[1] };
  if (/usual|more than (?:last|before)|less than (?:last|before)|changed|change in|spending.*(?:up|down)|spend.*(?:compare|compared)|compare.*spend|patterns?|habits?|notice about|spot.*(?:spend|money)/.test(q)) return { task: 'patterns', ...base };
  if (/at this (?:pace|rate)|run out|runway|how long.*(?:last|money)|(?:money|allowance).*last.*\?|burn rate/.test(q)) return { task: 'forecast', ...base };
  if (/\b(?:on track|catch up)\b/.test(q) || /\b(?:goal|money box|save|saving)\b/.test(q) && /\b(?:reach|pace|behind|how long|by when|when can|target|deadline)\b/.test(q)) return { task: 'goal', ...base, subject: text(question).match(/(?:for|toward|towards)\s+(.+?)[?.!]*$/i)?.[1]?.replace(/[?.!]+$/, '') || subject };
  if (follow && prior && ['afford','compare','recurring'].includes(prior.task) && amounts.length) return { ...prior, amount: amounts[0], ...(amounts[1] ? {alternative: amounts[1]} : {}), subject };
  return { task: 'legacy' };
}

function clarify(title, body, followUps = []) { return { title, paragraphs: [body], stats: [], actions: [], followUps, context: { topic: 'clarify' } }; }
function impact(state, amount, subject, now) { return evaluatePayment(state, { amount, category: categoryFor(subject) || 'Other', categoryExplicit: !!subject, rail: 'lumo' }, now); }
function tradeoff(x) { return !x.allowed ? 'Exceeds available Lumo money.' : x.additionalShortfall ? `Would add ${cash(x.additionalShortfall)} to the gap in your plan.` : x.baselineShortfall ? `Your existing ${cash(x.baselineShortfall)} plan shortfall remains.` : x.needed ? x.reason : 'Fits your recorded commitments.'; }
function periodQuestion(p, fallback = 'this week') { return `Where did my money go${p.subject ? ` on ${p.subject}` : ''} ${p.start && p.end ? `from ${p.start} to ${p.end}` : p.period || fallback}?`; }

function compare(state, p, now) {
  if (!money(p.amount) || !money(p.alternative)) return clarify('What do the two options cost?', 'Give me both totals in cedis. For example, “GH₵30 lunch or GH₵50 lunch?” I won’t guess a price.', ['GH₵30 lunch or GH₵50 lunch?']);
  const a = impact(state,p.amount,p.subject,now), b = impact(state,p.alternative,p.subject,now), gap = Math.abs(p.amount-p.alternative), cheaper = Math.min(p.amount,p.alternative);
  return { title: gap ? `${cash(gap)} of breathing room between them.` : 'The money impact is the same.', paragraphs: [`${cash(p.amount)}: ${tradeoff(a)} ${a.allowed ? `Leaves ${cash(a.afterAvailable)} available and ${cash(a.afterSpendable)} after plan.` : ''}`, `${cash(p.alternative)}: ${tradeoff(b)} ${b.allowed ? `Leaves ${cash(b.afterAvailable)} available and ${cash(b.afterSpendable)} after plan.` : ''}`, gap ? `The ${cash(cheaper)} option keeps ${cash(gap)} more in Everyday. You decide whether the difference is worth it.` : 'Compare what you receive and any final fees before deciding.', ...(a.allowed && b.allowed && a.afterSpendable === b.afterSpendable && gap ? ['Both prices use money already reserved in the matching plan item. That is why left after plan is unchanged; the cheaper choice preserves more of that allocation.'] : []), ...(!state.budget?.created ? ['Your essentials are not recorded yet, so neither result is a complete affordability assessment.'] : [])], stats: [{label: `${cash(p.amount)} · left after plan`,value: a.allowed ? cash(a.afterSpendable) : 'Not enough available'}, {label: `${cash(p.alternative)} · left after plan`,value:b.allowed ? cash(b.afterSpendable) : 'Not enough available'}], basis: [...details(state,now), 'These are two separate Lumo payment scenarios, each starting from the same balance. External fees are not assumed. Payment review checks the final amount.'], actions: [route('Review my plan','plan')], followUps: [`Can I spend ${cash(cheaper)}${p.subject ? ` on ${p.subject}` : ''}?`, 'Show the calculation'], context: {topic:'afford',amount:cheaper,subject:p.subject || ''} };
}

function recurring(state, p, now) {
  if (!money(p.amount) || !Number.isInteger(p.days) || p.days < 1 || p.days > 366 || !Number.isSafeInteger(p.amount*p.days) || p.amount*p.days > 10000000000) return clarify('What is the daily cost, and for how many days?', 'For example, “GH₵20 a day on lunch for 5 days.” I’ll check the full cost together.');
  const total = p.amount*p.days, x = impact(state,total,p.subject,now);
  return {title:`That adds up to ${cash(total)}.`,paragraphs:[`${cash(p.amount)} × ${p.days} days = ${cash(total)}${p.subject ? ` for ${p.subject}` : ''}.`,tradeoff(x), ...(x.allowed ? [`After that full cost, ${cash(x.afterSpendable)} would remain after your current plan.`] : []), 'This is a what-if check. It does not schedule payments or change your plan.'],stats:[{label:'Full cost',value:cash(total)},{label:'Left after plan',value:x.allowed ? cash(x.afterSpendable) : 'Exceeds available'}],basis:[...details(state,now),'The full amount is checked once against the matching commitment. Future top-ups, price changes and unquoted fees are not assumed.'],actions:[route('Review my plan','plan')],followUps:['Show the calculation','How much can I spend today?'],context:{topic:'afford',amount:total,subject:p.subject || ''}};
}

function patterns(state,p,now) {
  const today=now.toISOString().slice(0,10),d=new Date(`${today}T00:00:00Z`),ms=86400000;
  const iso=n=>new Date(n).toISOString().slice(0,10),shift=n=>iso(d.getTime()+n*ms);
  let start,end=today,previousStart,previousEnd,label='This week so far',previousLabel='Same days last week',description;
  const elapsed=(d.getUTCDay()+6)%7+1;
  if(p.start&&p.end){start=p.start;end=p.end;const length=Math.floor((Date.parse(end)-Date.parse(start))/ms)+1;if(length<1||length>366||end>today)return clarify('Which completed dates should I compare?', 'Use a past date range of up to 366 days.');previousEnd=iso(Date.parse(start)-ms);previousStart=iso(Date.parse(start)-length*ms);label='Chosen dates';previousLabel='Previous equal period';description=`Matched ${length} calendar days in each period.`;}
  else if(p.period==='recorded history') return clarify('Which dates should I compare?', 'Choose this week, this month, last month or an exact date range so the comparison has a defined baseline.');
  else if(p.period==='today'||p.period==='yesterday'){end=p.period==='today'?today:shift(-1);start=end;previousStart=iso(Date.parse(start)-ms);previousEnd=previousStart;label=p.period==='today'?'Today so far':'Yesterday';previousLabel='Previous calendar day';description=p.period==='today'?'Today is incomplete; yesterday is a full calendar day.':'Compared two full calendar days.';}
  else if(p.period==='this month'||p.period==='last month'){
    const offset=p.period==='last month'?1:0,y=d.getUTCFullYear(),m=d.getUTCMonth()-offset,first=new Date(Date.UTC(y,m,1)),prev=new Date(Date.UTC(y,m-1,1)),fullEnd=new Date(Date.UTC(y,m+1,0)),prevFullEnd=new Date(Date.UTC(y,m,0));
    start=iso(first.getTime());end=offset?iso(fullEnd.getTime()):today;previousStart=iso(prev.getTime());previousEnd=offset?iso(prevFullEnd.getTime()):iso(Date.UTC(prev.getUTCFullYear(),prev.getUTCMonth(),Math.min(d.getUTCDate(),prevFullEnd.getUTCDate())));label=offset?'Last month':'This month so far';previousLabel=offset?'Month before':'Same dates last month';description=offset?'Full calendar months can have different lengths. These are recorded totals, not daily rates.':'Compared elapsed calendar dates, clipped to the earlier month’s last day when needed.';
  } else if(p.period==='last 7 days'||p.period==='last 30 days'||p.period==='last week'){
    const length=p.period==='last 30 days'?30:7;end=p.period==='last week'?shift(-elapsed):today;start=iso(Date.parse(end)-(length-1)*ms);previousEnd=iso(Date.parse(start)-ms);previousStart=iso(Date.parse(start)-length*ms);label=p.period==='last week'?'Last week':`Last ${length} days`;previousLabel=`Previous ${length} days`;description=`Matched ${length} calendar days in each period.`;
  } else {start=shift(1-elapsed);previousStart=shift(-6-elapsed);previousEnd=shift(-7);description=`Matched ${elapsed} elapsed weekdays in Africa/Accra.`;}
  const currentQ = `Where did my money go${p.subject ? ` on ${p.subject}` : ''} from ${start} to ${end}?`, previousQ = `Where did my money go${p.subject ? ` on ${p.subject}` : ''} from ${previousStart} to ${previousEnd}?`;
  const scope = getSpendingScope(state,currentQ);
  if (scope.unsupported) return clarify('Which recorded category or person?', 'Use a category such as Food, Transport or Data, or the exact name on your activity.');
  const current = paymentTransactions(state,currentQ,now), prior = paymentTransactions(state,previousQ,now), a=sum(current),b=sum(prior),delta=a-b;
  const groups = new Map(); for (const x of current) { const key = x.category || 'Other';groups.set(key,(groups.get(key)||0)+x.amount); }
  const top = [...groups].sort((x,y)=>y[1]-x[1])[0];
  const refundNow = sum(merchantRefundTransactions(state,getSpendingPeriod(currentQ,now),scope));
  return {title:!current.length && !prior.length ? 'There isn’t a pattern to call yet.' : delta===0 ? 'The same recorded spend so far.' : `${cash(Math.abs(delta))} ${delta>0?'more':'less'} in ${label.toLowerCase()}.`,paragraphs:[`Snapshot: ${label} (${start}–${end}): ${cash(a)} across ${current.length} completed payments. ${previousLabel} (${previousStart}–${previousEnd}): ${cash(b)} across ${prior.length}.`,...(b ? [`That is ${Math.round(Math.abs(delta)*100/b)}% ${delta>=0?'higher':'lower'} in these records.`] : ['There is no earlier spending baseline in this comparison, so a percentage or “usual” spending would be misleading.']),...(top ? [`${top[0]} accounts for ${cash(top[1])} of the current period’s recorded payments.`] : []),...(refundNow ? [`${cash(refundNow)} in merchant refunds arrived in this period, shown separately from those payment totals.`] : []),'This describes Lumo’s records. It cannot establish your usual habits from missing cash, MoMo or bank activity.'],stats:[{label,value:cash(a)},{label:previousLabel,value:cash(b)}],basis:[...readBasis,`${description} A rise is an observation, not a judgement or prediction.`],actions:[route('See my activity','activity')],followUps:['Where did my money go this week?','How long will my money last?'],context:{topic:'spending',canonicalQuestion:currentQ}};
}

function forecast(state,now) {
  const s=getSummary(state,now),h=getGuidanceHorizon(state,now),today=now.toISOString().slice(0,10);
  const start=new Date(Date.parse(today)-6*86400000).toISOString().slice(0,10);
  const records=paymentTransactions(state,`spending from ${start} to ${today}`,now);
  const flexible=records.filter(x=>!x.budgetItemId),rate=Math.ceil(sum(flexible)/7);
  const planMissing=!state.budget?.created, paragraphs=[`${cash(s.spendable)} is left after your recorded commitments and keep-back.`];
  if(h.date && h.date>=today && s.hasDailyGuide) paragraphs.push(`Across ${s.daysLeft} ${s.daysLeft===1?'day':'days'} until ${dateLabel(h.date)}, that is about ${cash(s.dailyAllowance)} a day for money outside the plan. Planned essentials are reserved separately.`);
  if(h.source==='income' && h.date>=today) paragraphs.push('That allowance date is expected, not guaranteed. The guide uses only money already here; recheck the timing if the allowance is late.');
  if(!(h.date && h.date>=today && s.hasDailyGuide)) paragraphs.push('There is no current planning end date to use. Choose a check-in date in Plan or a short recovery plan before relying on a daily guide.');
  if(flexible.length>=3 && rate>0 && !planMissing) paragraphs.push(`Over the last 7 calendar days, ${cash(sum(flexible))} in recorded payments was not linked to a plan item: about ${cash(rate)} a day. If those costs repeated, the ${cash(s.spendable)} left after plan would cover about ${Math.floor(s.spendable/rate)} full days. This is a scenario, not a promise.`);
  else paragraphs.push('There are too few unplanned payment records for a useful spending-pace estimate. I won’t invent a run-out date.');
  if(planMissing) paragraphs.push('Your essentials are not recorded yet. Add them before treating the remaining balance as room to spend.');
  return {title:'Let’s make the money here last.',paragraphs,stats:[{label:'Left after plan',value:cash(s.spendable)},...(s.hasDailyGuide ? [{label:'Daily guide outside plan',value:cash(s.dailyAllowance)}] : [])],basis:[...details(state,now),'The pace scenario uses only recorded payments without a linked plan item, divided by 7 calendar days. Cash and outside activity may be missing. No expected allowance is added.'],actions:[h.date && h.date>=today?route('Review my plan','plan'):route('Choose a recovery check-in','life','recovery')],followUps:['My allowance is late','What changed in my spending?'],context:{topic:'daily'}};
}

function goal(state,p,now) {
  const boxes=(state.boxes||[]).filter(x=>!x.archived && x.target>x.balance), q=normal(p.subject), exact=q && boxes.filter(x=>normal(x.name)===q || q.includes(normal(x.name)));
  const box=exact?.length===1?exact[0]:boxes.length===1?boxes[0]:null;
  if(!box) return clarify(boxes.length?'Which Money Box should we check?':'What would you like to put money towards?', boxes.length?`Your open goals are ${boxes.slice(0,5).map(x=>x.name).join(', ')}. Tell me the goal name.`:'Create a goal with an amount and target date. I can then explain the pace without promising money that hasn’t arrived.',boxes.slice(0,2).map(x=>`Am I on track for ${x.name}?`));
  const remaining=Math.max(0,box.target-box.balance),today=now.toISOString().slice(0,10),days=day(box.deadline)?Math.ceil((Date.parse(box.deadline)-Date.parse(today))/86400000):0,s=getSummary(state,now);
  const targetDays=days>0?days:0,daily=targetDays?Math.ceil(remaining/targetDays):0;
  return {title:`${box.name}: ${cash(remaining)} still to go.`,paragraphs:[`${cash(box.balance)} of ${cash(box.target)} is already in this Money Box.`,targetDays?`${targetDays} days until ${dateLabel(box.deadline)} means about ${cash(daily)} a day, or ${cash(Math.min(remaining,daily*7))} over the next seven days.`:box.deadline?'That target date has arrived or passed. Choose a new date before relying on a saving pace.':'No target date is recorded. Add one before I calculate a daily saving pace.',`${cash(s.spendable)} is currently left after plan. Funding this goal uses that money; it does not create extra income.`,'A saving pace is a target, not evidence that the goal is on track. A smaller target or later date can create breathing room.'],stats:[{label:'Already protected',value:cash(box.balance)},{label:'Still needed',value:cash(remaining)},...(daily?[{label:'Target per day',value:cash(daily)}]:[])],basis:[...details(state,now),'Daily targets round up to a whole pesewa. Expected income and unagreed partner contributions are not assumed.'],actions:[route(`Open ${box.name}`,'boxes','detail',{id:box.id})],followUps:[`Can I save ${cash(Math.min(remaining,Math.max(100,daily||1000)))} toward ${box.name}?`,'Explain my balance'],context:{topic:'saving',subject:box.name}};
}

export function executeLuxPlan(state,question,plan,{messages=[],now=new Date(),mode='local'}={}) {
  if(isPrivateLuxQuestion(question)) return {...clarify('Keep that detail private.', 'Use Lumo’s secure account controls for PINs, passwords and identity details. Don’t put them in the chat.'),engine:mode};
  let p=financialInputAmbiguity(question)==='currency'?{task:'legacy'}:plan||planLuxQuestion(question,{messages}),answer;
  if(p.task==='compare') answer=compare(state,p,now);
  else if(p.task==='recurring') answer=recurring(state,p,now);
  else if(p.task==='patterns') answer=patterns(state,p,now);
  else if(p.task==='forecast') answer=forecast(state,now);
  else if(p.task==='goal') answer=goal(state,p,now);
  else if(p.task==='explain') {
    const previous=previousAnswer(messages),old=previous?.luxPlan;
    if(old && !['explain','clarify'].includes(old.task)) {
      const refreshed=executeLuxPlan(state,previous.sourceQuestion||question,old,{messages:messages.slice(0,-1),now,mode});
      answer={...refreshed,title:'Here’s what that answer rests on.',paragraphs:refreshed.basis||details(state,now),actions:refreshed.actions,followUps:refreshed.followUps};p=old;
    } else answer={title:'Here is the calculation.',paragraphs:details(state,now),actions:[route('Review my plan','plan')],followUps:['What changed in my spending?'],context:{topic:'balance'}};
  }
  else if(p.task==='clarify') answer=clarify('Let’s make sure I’ve understood.', 'Is this about a payment you’re considering, your recorded spending, or money you’re waiting for?', ['Can I afford lunch?','My allowance is late']);
  else {
    let canonical=p.task==='legacy' && amountsIn(question).length && /afford|cost|spend|grab|buy|cedis?|ghs|₵|pesewa/i.test(question) && !/\b(?:spent|did i|have i|history|transactions)\b/i.test(question)?numericWords(question):question;
    if(p.task==='balance') canonical='Explain my available balance';
    if(p.task==='spending') canonical=periodQuestion(p,'recorded history');
    if(p.task==='afford') canonical=money(p.amount)?`Can I spend ${cash(p.amount)}${p.subject?` on ${p.subject}`:''}?`:`Can I afford ${p.subject||'this payment'}?`;
    if(p.task==='recovery') canonical='My allowance is late';
    answer=getConversationalAnswer(state,canonical,{messages,now});
    // Store resolved slots so a plain-language follow-up can use the same decision.
    if(p.task==='legacy' && answer.context) p={task:answer.context.topic==='afford'?'afford':answer.context.topic==='spending'?'spending':'legacy',...(money(answer.context.amount)?{amount:answer.context.amount}:{}),...(answer.context.subject?{subject:answer.context.subject}:{}),...(answer.context.period?{period:answer.context.period}:{})};
    if(answer.context && !['clarify','greeting','thanks','identity','approval'].includes(answer.context.topic)) answer.basis=answer.context.topic==='spending'?readBasis:details(state,now);
  }
  return {...stampFinancialAnswer(state,answer,question,now),sourceQuestion:question,luxPlan:p,engine:mode};
}

export function getLuxAnswer(state,question,options={}) { return executeLuxPlan(state,question,planLuxQuestion(question,options),options); }
