import {cash,dateLabel} from './ui.js';

const normal=value=>String(value||'').trim().slice(0,400).toLowerCase().replace(/[’‘]/g,"'").replace(/\s+/g,' ');
const date=value=>/^\d{4}-\d{2}-\d{2}$/.test(value||'')&&Number.isFinite(Date.parse(value))&&new Date(value).toISOString().slice(0,10)===value;
const action={label:'View IOUs',route:{section:'life',page:'ious'}};
const incoming=/\bowe(?:s)?\s+me\b|\bowed\s+to\s+me\b|\b(?:am i|i am|i'm|im|i have been|i've been)\s+owed\b|\bincoming\s+ious?\b/;
const outgoing=/\bi\s+(?:still\s+|dey\s+)?owe\b|\b(?:i\s+(?:need to|have to|must|should)\s+repay|owe\s+(?:someone|people|them)|owed\s+by\s+me|my\s+(?:debts?|repayments?)|outgoing\s+ious?)\b/;
const dateFollow=/^(?:(?:and|what about|how about)\s+)?(?:today|tomorrow|yesterday|overdue|this week|next week|\d{4}-\d{2}-\d{2})[.!?\s]*$/;
const readIntent=/\b(?:can|could|should|may) i\s+(?:afford|pay|send|spend|buy|save|transfer)\b|\b(?:spending|spent|buying|saving|afford)\b|\b(?:did|have) i\s+(?:pay|paid)\b/;
const clarify=(reason,direction=null)=>({direction,period:'unsupported',reason});

/** Direction is established before dates. Neither a date nor a model plan can
 * turn incoming IOUs into spending guidance or expected spendable money. */
export function parseIouQuestion(question,{now=new Date(),previousDirection=null}={}){
 const q=normal(question);if(!q||readIntent.test(q))return null;
 const inwards=incoming.test(q),outwards=outgoing.test(q);
 if(inwards&&outwards)return clarify('Choose money people owe you or money you owe. I will not combine the two directions.');
 let direction=inwards?'incoming':outwards?'outgoing':null;
 if(!direction&&['incoming','outgoing'].includes(previousDirection)&&dateFollow.test(q))direction=previousDirection;
 if(!direction){
  if(/\b(?:ious?|debts?|owe|owed|owing|repayments?)\b/.test(q)&&!/\b(?:allowance|expected income|next income)\b/.test(q))return clarify('Do you mean money people owe you, or money you owe?');
  return null;
 }
 const current=now instanceof Date&&!Number.isNaN(now.getTime())?now:new Date(),today=current.toISOString().slice(0,10),midnight=Date.parse(today+'T00:00:00Z'),shift=n=>new Date(midnight+n*86400000).toISOString().slice(0,10);
 const dates=[...q.matchAll(/\b\d{4}-\d{2}-\d{2}\b/g)].map(m=>m[0]);
 const periods=['today','tomorrow','yesterday','overdue','this week','next week'].filter(p=>new RegExp('\\b'+p+'\\b').test(q));
 if(dates.length>1||periods.length>1||dates.length&&periods.length||dates.some(d=>!date(d)))return clarify('Use one clear due date or period for this IOU check.',direction);
 let remaining=q.replace(/\bowed\s+by\s+me\b/g,'');for(const p of periods)remaining=remaining.replace(p,'');for(const d of dates)remaining=remaining.replace(d,'');
 if(/\b(?:monday|tuesday|wednesday|thursday|friday|saturday|sunday|jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|june?|july?|aug(?:ust)?|sep(?:tember)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?|(?:last|next|this)\s+(?:week|month|year)|by|before|after)\b|\bon\s+\d|\b(?:[0-9]+|a|an|one|two|three|four|five|six|seven|eight|nine|ten)\s+(?:days?|weeks?|months?|years?|fortnights?)\b/.test(remaining))return clarify('Use today, tomorrow, yesterday, overdue, this week, next week, or an exact due date such as 2026-11-18.',direction);
 const period=dates.length?'date':periods[0]||'all',offset=(current.getUTCDay()+6)%7;
 let start=null,end=null,label='';
 if(period==='date'){start=dates[0];end=dates[0];label='due on '+dateLabel(start);}
 else if(period==='today'||period==='tomorrow'||period==='yesterday'){start=shift(period==='tomorrow'?1:period==='yesterday'?-1:0);end=start;label='due '+period;}
 else if(period==='overdue'){end=shift(-1);label='overdue';}
 else if(period==='this week'||period==='next week'){start=shift(-offset+(period==='next week'?7:0));end=shift(-offset+(period==='next week'?13:6));label='due '+period;}
 return {direction,period,start,end,label};
}

export function getIouMoneyAnswer(state,query){
 if(query.reason)return {title:'Which IOUs should I check?',paragraphs:[query.reason],stats:[],actions:[action],followUps:['Who owes me?','What do I owe?'],context:{topic:'clarify'}};
 const type=query.direction==='incoming'?'owedToMe':'owedByMe';
 const remaining=i=>Number.isSafeInteger(i.amount)&&i.amount>0?Math.max(0,i.amount-(Number.isSafeInteger(i.paid)&&i.paid>=0?i.paid:0)):0;
 const all=(Array.isArray(state.ious)?state.ious:[]).filter(i=>i?.type===type&&i.status==='open'&&remaining(i)>0);
 const scoped=query.period!=='all',unknown=scoped?all.filter(i=>!date(i.due)).length:0;
 const matches=all.filter(i=>!scoped||date(i.due)&&(!query.start||i.due>=query.start)&&(!query.end||i.due<=query.end));
 const total=matches.reduce((n,i)=>n+remaining(i),0),isIncoming=query.direction==='incoming',suffix=query.label?' '+query.label:'',label=isIncoming?'owed to you':'you owe';
 const canonicalBase=isIncoming?'Who owes me':'What do I owe',canonicalQuestion=query.period==='all'?canonicalBase+'?':query.period==='date'?canonicalBase+' on '+query.start+'?':query.period==='overdue'?(isIncoming?'Which IOUs owed to me are overdue?':'Which of my debts are overdue?'):canonicalBase+' '+query.period+'?';
 return {
  title:matches.length?(isIncoming?'Money owed to you.':'Here is what you owe.'):(isIncoming?'No matching incoming IOUs.':'No matching outgoing IOUs.'),
  paragraphs:[
   matches.length?`${matches.length} open ${matches.length===1?'IOU':'IOUs'} ${label}${suffix}, totalling ${cash(total)}.`:`There are no open ${isIncoming?'incoming':'outgoing'} IOUs${suffix} with an amount still outstanding.`,
   ...matches.slice(0,3).map(i=>`${i.name}: ${cash(remaining(i))} ${isIncoming?'owed to you':'still owed'}${date(i.due)?', due '+dateLabel(i.due):', no due date recorded'}.`),
   ...(matches.length>3?[`Open IOUs to see all ${matches.length} matching records.`]:[]),
   ...(unknown?[`${unknown} open ${unknown===1?'IOU has':'IOUs have'} no valid due date and ${unknown===1?'is':'are'} excluded from this date check.`]:[]),
   isIncoming?'Unpaid IOUs are not available or spendable money. Record money as received only after it has arrived.':'Due repayments remain part of your recorded commitments. Record repayment only after you actually pay.',
  ],
  stats:[{label:(isIncoming?'IOUs owed to you':'IOUs you owe')+(query.label?' · '+query.label:''),value:cash(total)}],
  actions:[action],followUps:isIncoming?['What do I owe?','What do I have available?']:['Who owes me?','What do I have available?'],
  context:{topic:isIncoming?'expected':'debts',iouDirection:query.direction,iouPeriod:query.period,canonicalQuestion},
 };
}
