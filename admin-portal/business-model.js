export const METRIC_ORDER = ['onboarding','activation','returning','active_shops','payment_completion','merchant_confirmation','money_integrity','support','clarity','pilot_spend'];
const ALIASES = {returning_payers:'returning',receipt_confirmation:'merchant_confirmation',support_response:'support'};
export const metricId = id => ALIASES[id] || id;
export const money = value => Number.isSafeInteger(value) ? new Intl.NumberFormat('en-GH',{style:'currency',currency:'GHS'}).format(value/100) : 'Not recorded';
export function parsePesewas(value,{nullable=false}={}) {
  const raw=String(value??'').trim();
  if(!raw&&nullable)return null;
  if(!/^\d+(?:\.\d{1,2})?$/.test(raw))throw new Error('Enter a positive amount with no more than two decimal places.');
  const [whole,fraction='']=raw.split('.');
  const amount=BigInt(whole)*100n+BigInt(fraction.padEnd(2,'0'));
  if(amount>BigInt(Number.MAX_SAFE_INTEGER))throw new Error('This amount is too large.');
  return Number(amount);
}
export const validNumber = value => typeof value==='number' && Number.isFinite(value);
export function metricValue(metric) {
  if(!metric||!validNumber(metric.value))return 'Not measured yet';
  if(metric.unit==='pesewas')return money(metric.value);
  return new Intl.NumberFormat('en-GH',{maximumFractionDigits:metric.unit==='percent'?1:0}).format(metric.value)+(metric.unit==='percent'?'%':'');
}
export function metricTone(metric) {
  if(!metric||!validNumber(metric.value))return 'neutral';
  if(metricId(metric.id)==='clarity'&&(metric.denominator??0)<(metric.minimumResponses??metric.details?.minimumResponses??30))return 'neutral';
  if(!validNumber(metric.target))return 'neutral';
  const lowerBetter=['money_integrity','pilot_spend'].includes(metricId(metric.id));
  return (lowerBetter?metric.value<=metric.target:metric.value>=metric.target)?'good':'attention';
}
export function metricStatus(metric) {
  if(!validNumber(metric?.value))return ({not_configured:'Set up pilot',collecting:'Collecting data',waiting:'Waiting for a complete period',unavailable:'Measurement unavailable',not_measured:'Not measured yet'})[metric?.status]||'Not measured yet';
  if(metricId(metric.id)==='clarity'&&(metric?.denominator??0)<(metric.minimumResponses??metric.details?.minimumResponses??30))return 'Small sample';
  return metricTone(metric)==='good'?'Within planning target':metricTone(metric)==='attention'?'Needs attention':'Recorded';
}
export function cohortLine(metric) {
  if(Number.isFinite(metric?.numerator)&&Number.isFinite(metric?.denominator))return `${metric.numerator} of ${metric.denominator} eligible ${metricId(metric.id)==='clarity'?'responses':'records'}`;
  return metric?.coverage?.label || (typeof metric?.coverage==='string'?metric.coverage:'');
}
export function targetText(metric) {
  if(!validNumber(metric?.target))return 'Not set';
  return metric.unit==='pesewas'?money(metric.target):String(metric.target)+(metric.unit==='percent'?'%':'');
}
export function asUtcInput(value) {try{return value?new Date(value).toISOString().slice(0,16):'';}catch{return '';}}
export function fromAccraInput(value) {
  if(!value)return null;
  if(!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(value))throw new Error('Enter a valid date and time.');
  const date=new Date(value+':00.000Z');
  if(!Number.isFinite(date.getTime())||date.toISOString().slice(0,16)!==value)throw new Error('Enter a valid date and time.');
  return date.toISOString();
}
export function pilotPeriod(startAt,now) {
  if(!startAt)return {label:'Pilot dates not set',day:null};
  const start=Date.parse(startAt),current=Date.parse(now||new Date().toISOString());
  if(!Number.isFinite(start)||!Number.isFinite(current))return {label:'Pilot dates unavailable',day:null};
  if(current<start)return {label:'Pilot starts soon',day:0};
  const day=Math.floor((current-start)/86400000)+1;
  return {label:day>30?'First 30 days complete':`Day ${day} of 30`,day};
}
export function visibleActions(actions,filter,staffId,now) {
  const at=Date.parse(now||new Date().toISOString());
  return (actions||[]).filter(action=>filter==='all'||filter==='mine'&&action.ownerId===staffId||filter==='open'&&!['resolved','cancelled'].includes(action.status)||filter==='overdue'&&!['resolved','cancelled'].includes(action.status)&&action.dueAt&&Date.parse(action.dueAt)<at);
}
