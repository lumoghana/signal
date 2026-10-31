/* Bounded, account-backed Chat answers. This module never submits a payment or edits a plan. */
(()=>{
'use strict';
const DAY=86400000,periods=[7,30,90],E=L.e,M=L.money,B=L.btn;
const separate=state=>(state||L.state).accounts?.version===2;
const budgetText=text=>typeof text==='string'?text.replace(/\bEssentials\b/g,'Budget costs').replace(/\bessentials\b/g,'budget costs').replace(/\bEssential\b/g,'Budget cost').replace(/\bessential\b/g,'budget cost').replace(/\bgoals\b/gi,'Money Boxes').replace(/\bgoal\b/gi,'Money Box').replace(/\bPlan\b/g,'Budget').replace(/\bplan\b/g,'budget'):text;
const isInternal=tx=>tx?.internalTransfer===true||tx?.type==='internal'||!!tx?.boxId||tx?.method==='Money Box transfer';
const cents=value=>Math.round((Number(value)||0)*100)/100;
const validDays=value=>periods.includes(Number(value))?Number(value):30;
const categoryName=value=>typeof value==='string'?value.trim().slice(0,80):'';
const plainContext=(source=L.params||{})=>({days:validDays(source.days),category:categoryName(source.category)});
const contextLabel=c=>(c.category?c.category+' · ':'')+'Last '+c.days+' days';
const answer=(text,action,route,context,extra={})=>({text,action,route,params:route==='story'?plainContext(context):{},context:plainContext(context),...extra});
const compactAnswer=(headline,support,action,route,context,extra={})=>answer([headline,support].filter(Boolean).join(' '),action,route,context,{headline,support,...extra});
const amountToken='[+-]?[0-9][0-9,.]*';
const correctionPrefix=/^\s*(?:(?:actually|sorry)[,\s]+)?(?:make (?:it|that)|change (?:it|that|the (?:amount|total)) to|(?:the )?(?:amount|total)(?: is| should be)?|i (?:mean|meant)|what about)\s+/i;
function amountFrom(query,allowBare=false,cediContext=false){
 const candidate=allowBare?query.replace(correctionPrefix,''):query;
 const currency=new RegExp('(?:GHS|GH₵|₵)\\s*('+amountToken+')|('+amountToken+')\\s*(?:GHS|cedis?|GH₵|₵)(?=\\s|[?!.,]|$)','gi');
 const tokens=[...candidate.matchAll(currency)].map(m=>m[1]||m[2]);
 if(cediContext&&/\b(?:USD|EUR|GBP|NGN)(?=\s*[+-]?\d)|\b(?:USD|dollars?|EUR|euros?|GBP|pounds?|naira|NGN)\b|\$/i.test(candidate))return {amount:null,foreign:true};
 const uncertain=new RegExp('\\b(?:about|around|roughly|approximately|maybe|between|up to|at least)\\s+(?:(?:GHS|GH₵|₵)\\s*)?'+amountToken,'i').test(candidate);
 // A second unlabelled alternative is not silently ignored: GHS70 or 80 needs one total.
 const remainder=candidate.replace(currency,' ').replace(/\b\d{4}-\d{2}-\d{2}\b|\b\d{1,2}[/-]\d{1,2}(?:[/-]\d{2,4})?\b/g,' ');
 const alternative=tokens.length&&/\b(?:or|and|plus|between|instead of|rather than)\b/i.test(candidate)&&/[0-9]/.test(remainder);
 if(!tokens.length&&allowBare){
  if(/^\s*[+-]?[0-9][0-9,.]*\s*[?!.]?\s*$/.test(candidate))tokens.push(candidate.trim().replace(/[?!]$/,''));
  else if(new RegExp('^\\s*'+amountToken+'\\s*(?:or|and|plus|/)\\s*'+amountToken,'i').test(candidate))return {amount:null,ambiguous:true};
 }
 if(!tokens.length&&cediContext){
  // The app's account context is Ghana cedis. A single ordinary amount is
  // usable; date and duration numbers are never treated as a purchase price.
  const prices=candidate.replace(/\b\d{4}-\d{2}-\d{2}\b|\b\d{1,2}[/-]\d{1,2}(?:[/-]\d{2,4})?\b/g,' ').replace(/\b\d+\s*(?:days?|weeks?|months?|years?|hours?|minutes?)\b/gi,' ');
  tokens.push(...[...prices.matchAll(new RegExp(amountToken,'g'))].map(m=>m[0]));
 }
 if(!tokens.length)return {amount:null};
 if(tokens.length!==1||alternative||uncertain)return {amount:null,ambiguous:true};
 const token=tokens[0].replace(/\.$/,'');
 if(!/^\+?(?:\d+|\d{1,3}(?:,\d{3})+)(?:\.\d{1,2})?$/.test(token))return {amount:null,invalid:true};
 const amount=Number(token.replace(/,/g,''));
 return Number.isFinite(amount)&&amount>0?{amount:cents(amount)}:{amount:null,invalid:true};
}
function dateOnly(value){
 const match=String(value||'').match(/^(\d{4})-(\d{2})-(\d{2})$/);
 if(!match)return null;
 const date=new Date(Date.UTC(+match[1],+match[2]-1,+match[3]));
 return date.toISOString().slice(0,10)===match[0]?date:null;
}
const readableDate=date=>date.toLocaleDateString('en-GB',{timeZone:'UTC',day:'numeric',month:'short',year:'numeric'});
const todayDate=now=>{const date=new Date(now);return new Date(Date.UTC(date.getUTCFullYear(),date.getUTCMonth(),date.getUTCDate()));};
function timeframeNote(query,now){
 const iso=query.match(/\b\d{4}-\d{2}-\d{2}\b/);
 if(iso){const date=dateOnly(iso[0]);return date?` This checks today’s saved plan, not a forecast for ${readableDate(date)}.`:' Please use a valid date in YYYY-MM-DD format.';}
 if(/\b(?:this|next|the) weekend\b/.test(query))return ' This checks today’s saved plan, not a forecast of weekend spending.';
 if(/\btomorrow\b/.test(query))return ' This uses today’s available money; it doesn’t assume any money will arrive tomorrow.';
 if(/\b(?:next week|next month|on \w+day|in \d+ days?)\b/.test(query))return ' I can check the amount against today’s saved plan. Future income and spending are not forecast.';
 return '';
}

// Shared by Money Story and Chat: a rolling window, completed outgoing payments only.
L.spendingSummary=({days=30,now=Date.now(),category}={})=>{
 days=validDays(days);now=Number(now);if(!Number.isFinite(now))now=Date.now();
 category=categoryName(category);const cutoff=now-days*DAY,groups=Object.create(null);
 const txs=(L.state.txs||[]).filter(tx=>{
  const at=new Date(tx.date).getTime(),amount=Number(tx.amount),fee=Number(tx.fee||0),name=categoryName(tx.category)||'Other';
  return !isInternal(tx)&&tx.type==='out'&&tx.status==='success'&&Number.isFinite(at)&&at>=cutoff&&at<=now&&Number.isFinite(amount)&&amount>0&&Number.isFinite(fee)&&fee>=0&&(!category||name.toLowerCase()===category.toLowerCase());
 }).sort((a,b)=>new Date(b.date)-new Date(a.date));
 txs.forEach(tx=>{const key=categoryName(tx.category)||'Other';groups[key]=cents((groups[key]||0)+Number(tx.amount)+Number(tx.fee||0));});
 const categories=Object.entries(groups).sort((a,b)=>b[1]-a[1]||a[0].localeCompare(b[0]));
 return {days,now,cutoff,end:now,category,total:cents(categories.reduce((sum,pair)=>sum+pair[1],0)),categories,txs};
};

// Analytical answers keep their exact dates and source rows. This is read-only:
// a saved answer is never rewritten to look as though it used today's facts.
const dayKey=now=>new Date(now).toISOString().slice(0,10);
const validNow=value=>Number.isFinite(Number(value))?Number(value):Date.now();
const dateTime=value=>new Date(value).toLocaleString('en-GH',{timeZone:'Africa/Accra',day:'numeric',month:'short',year:'numeric',hour:'2-digit',minute:'2-digit',hour12:false});
function calendarRange({period='today',days,start,end}={},now=Date.now()){
 now=validNow(now);const today=+todayDate(now),d=new Date(today),week=today-((d.getUTCDay()+6)%7)*DAY,month=Date.UTC(d.getUTCFullYear(),d.getUTCMonth(),1);let a,b,label,relative=true;
 switch(period){
  case 'rolling':if(!Number.isInteger(Number(days))||days<1||days>366)return null;a=now-Number(days)*DAY;b=now;label=`Last ${days} days`;break;
  case 'today':a=today;b=now;label='Today';break;
  case 'yesterday':a=today-DAY;b=today-1;label='Yesterday';break;
  case 'thisWeek':a=week;b=now;label='This week';break;
  case 'lastWeek':a=week-7*DAY;b=week-1;label='Last week';break;
  case 'thisMonth':a=month;b=now;label='This month';break;
  case 'lastMonth':a=Date.UTC(d.getUTCFullYear(),d.getUTCMonth()-1,1);b=month-1;label='Last month';break;
  case 'range':a=typeof start==='string'?(dateOnly(start)?+dateOnly(start):NaN):Number(start);b=typeof end==='string'?(dateOnly(end)?+dateOnly(end)+DAY-1:NaN):Number(end);relative=false;label='Selected dates';break;
  default:return null;
 }
 if(!Number.isFinite(a)||!Number.isFinite(b)||a>b||a>now)return null;
 b=Math.min(b,now);return {start:a,end:b,label,relative};
}
function questionPeriod(raw,now){
 const q=String(raw||'').toLowerCase(),periods=[['this week','thisWeek'],['last week','lastWeek'],['this month','thisMonth'],['last month','lastMonth'],['yesterday','yesterday'],['today','today']];
 const named=periods.filter(([word])=>q.includes(word));
 const dates=[...q.matchAll(/\b\d{4}-\d{2}-\d{2}\b/g)].map(m=>m[0]);
 if(named.length>1||dates.length>2)return {invalid:true};
 if(dates.length){if(dates.some(x=>!dateOnly(x)||x>dayKey(now)))return {invalid:true};const query={period:'range',start:dates[0],end:dates[1]||dates[0]};return calendarRange(query,now)?query:{invalid:true};}
 if(named.length)return {period:named[0][1]};
 const rolling=q.match(/\b(?:last|past)\s+(\d+)\s*(days?|weeks?)\b/);
 if(rolling){const days=Number(rolling[1])*(rolling[2].startsWith('week')?7:1);return days>=1&&days<=366?{period:'rolling',days}:{invalid:true};}
 if(/\b(?:week|month|year|since|between|from|recently)\b/.test(q))return {invalid:true};
 return null;
}
const sourceMark=rows=>JSON.stringify(rows.map(t=>[t.id,t.date,t.type,t.status,Number(t.amount),Number(t.fee||0),t.name,t.category,t.boxId,t.boxDirection,!!t.internalTransfer,!!t.migration,!!t.refunded,t.originalId,t.reversalId]).sort((a,b)=>String(a[0]).localeCompare(String(b[0]))));
function savingsRows(query,now){
 const range=calendarRange(query,now);if(!range)return null;
 const all=L.state.txs||[];
 const rows=all.filter(t=>{const at=Date.parse(t.date),amount=Number(t.amount),reversed=t.status==='reversed'&&all.some(r=>isInternal(r)&&r.id===t.reversalId&&r.originalId===t.id&&r.status==='success'&&r.boxId===t.boxId&&['in','out'].includes(r.boxDirection)&&r.boxDirection!==t.boxDirection&&Number(r.amount)===amount&&Number.isFinite(Date.parse(r.date))&&Date.parse(r.date)<=now);return isInternal(t)&&t.boxId&&['in','out'].includes(t.boxDirection)&&!t.migration&&(t.status==='success'||reversed)&&Number.isFinite(amount)&&amount>0&&Number.isFinite(at)&&at>=range.start&&at<=range.end&&(!query.boxId||t.boxId===query.boxId);});
 return {...range,rows,added:cents(rows.filter(t=>t.boxDirection==='in').reduce((n,t)=>n+Number(t.amount),0)),takenBack:cents(rows.filter(t=>t.boxDirection==='out').reduce((n,t)=>n+Number(t.amount),0))};
}
function analyticalFacts(scope,now){
 if(!scope||typeof scope!=='object')return null;
 if(['calendar','savings-period'].includes(scope.kind)&&(!scope.query||typeof scope.query!=='object'))return null;
 if(scope.kind==='savings-period'){const s=savingsRows(scope.query,now),g=scope.query.boxId&&(L.state.goals||[]).find(g=>g.id===scope.query.boxId);return s&&{...s,mark:scope.query.boxId?JSON.stringify([sourceMark(s.rows),g?[g.id,g.name,!!g.archived,!!g.deleted]:null]):sourceMark(s.rows)};}
 if(scope.kind==='calendar'){
  const rolling=Number(scope.query.rollingDays),query=Number.isInteger(rolling)&&rolling>0&&rolling<=366?{...scope.query,period:'range',start:now-rolling*DAY,end:now}:scope.query;
  const first=L.dailySpendingSummary?.({...query,now}),second=scope.comparison?L.dailySpendingSummary?.({...query,...scope.comparison,now}):null;
  if(!first?.valid||scope.comparison&&!second?.valid)return null;
  const rows=[...new Map([...first.txs,...(second?.txs||[])].map(t=>[t.id,t])).values()];
  return {start:first.start,end:first.end,label:rolling?`Last ${rolling} days`:first.label,relative:!!rolling||scope.query.period!=='range'||!!scope.comparison&&scope.comparison.period!=='range',mark:sourceMark(rows)};
 }
 if(scope.kind==='rolling'){
  const s=L.spendingSummary({days:scope.days,category:scope.category,now}),merchant=String(scope.merchant||'').trim().toLocaleLowerCase('en-GH');
  const rows=merchant?s.txs.filter(t=>String(t.name||'').trim().toLocaleLowerCase('en-GH')===merchant):s.txs;
  return {start:s.cutoff,end:s.end,label:`Last ${s.days} days`,relative:true,mark:sourceMark(rows)};
 }
 return null;
}
function analyticalStamp(reply,scope,now=Date.now()){
 now=validNow(now);const s=analyticalFacts(scope,now);if(!s)return reply;
 return {...reply,checkedAt:new Date(now).toISOString(),answerScope:{version:1,...JSON.parse(JSON.stringify(scope)),start:s.start,end:s.end,relative:s.relative},answerSourceMark:s.mark,answerDateLabel:`Checked ${dateTime(now)} · Ghana time`,answerPeriodLabel:`${s.label}: ${dateTime(s.start)} to ${dateTime(s.end)}`};
}
function analyticalStatus(reply,now=Date.now()){
 const scope=reply.answerScope;if(!scope)return ['spending','calendarSpending','money-story-insight','savings-period'].includes(reply.intent)?'Saved answer. Ask again for current figures.':'';
 if(scope.version!==1||!Number.isFinite(Date.parse(reply.checkedAt)))return 'Saved answer. Ask again for current dates and figures.';
 now=validNow(now);const s=analyticalFacts(scope,now);
 if(scope.relative&&dayKey(Date.parse(reply.checkedAt))!==dayKey(now))return 'Earlier answer. Its date or spending period has moved on.';
 if(!s||s.mark!==reply.answerSourceMark)return 'Earlier answer. The recorded figures or date window have changed.';
 return '';
}
const runwayQuestion=q=>/\b(?:run(?:ning)? out|runway|burn rate|last until|last till|how long\b.*\b(?:money|balance|funds)|(?:money|balance|funds)\s+(?:(?:will|would|could|can|might)\s+)?(?:last|stretch)\b)/.test(q);
const savingsQuestion=q=>/\bmoney ?box(?:es)?\b|\bsav(?:e|ed|ing|ings)(?: account)?\b|\bmy goals?\b|\bhow much\b.*\b(?:put aside|set aside)\b/.test(q);
const goalQuestion=q=>{
 const named=(L.state.goals||[]).some(g=>g&&!g.archived&&!g.deleted&&String(g.name||'').trim().length>1&&q.includes(String(g.name).toLowerCase()));
 return (savingsQuestion(q)||named)&&/\b(?:will|can|could|on track|reach|meet|hit|finish|achieve|enough|by|deadline|how long)\b/.test(q)&&!/\b(?:spend|pay|buy|withdraw|back|use)\b/.test(q);
};
L.chatAnalytics=Object.freeze({stamp:analyticalStamp,status:analyticalStatus,questionPeriod,calendarRange,runwayQuestion,savingsQuestion,goalQuestion});

// Names scope analytical questions; duplicate or inactive matches never fall
// back to an all-box total which could be mistaken for the requested balance.
function namedSavingsScope(raw){
 const words=' '+normalPurpose(raw)+' ',matched=(L.state.goals||[]).filter(g=>g&&normalPurpose(g.name).length>1&&words.includes(' '+normalPurpose(g.name)+' ')),active=matched.filter(g=>!g.archived&&!g.deleted);
 return {box:active.length===1?active[0]:null,ambiguous:active.length>1,inactive:matched.length>0&&!active.length};
}
function savingScopeChoice(scope,context){
 return scope.ambiguous?compactAnswer('Which Money Box should I check?','More than one Money Box matches that question. Choose one so its money is not combined with another box.','Choose a Money Box','goals',context,{intent:'savings-choice'}):scope.inactive?compactAnswer('That Money Box is no longer active.','Open Money Boxes to review your active boxes or restore an archived box. I have not substituted another box or a total for all boxes.','Open Money Boxes','goals',context,{intent:'savings-choice'}):null;
}
function savingsPeriodAnswer(raw,context,now){
 const query=questionPeriod(raw,now);if(!query)return null;
 if(query.invalid)return compactAnswer('Which saving period should I check?','Use today, yesterday, this week, last week, this month, last month, or exact dates such as 2026-10-01 to 2026-10-15. This checks recorded transfers, not a forecast.','Open Money Boxes','goals',context,{intent:'savings-period-choice'});
 const scope=namedSavingsScope(raw),choice=savingScopeChoice(scope,context);if(choice)return choice;if(scope.box)query.boxId=scope.box.id;
 const s=savingsRows(query,now);if(!s)return compactAnswer('Choose a valid past saving period.','I can show confirmed Money Box transfers up to today. Future saving is not counted.','Open Money Boxes','goals',context,{intent:'savings-period-choice'});
 const net=cents(s.added-s.takenBack),name=scope.box?scope.box.name:'Money Boxes',headline=`${M(s.added)} added to ${name} ${s.label.toLowerCase()}.`,support=`${M(s.takenBack)} transferred back. Net saving: ${M(net)}. This is money moved during those dates, not your current savings balance.`;
 return analyticalStamp(compactAnswer(headline,support,scope.box?'Open this Money Box':'Open Money Boxes',scope.box?'goal':'goals',context,{intent:'savings-period',...(scope.box?{params:{id:scope.box.id}}:{}),calculation:{rows:[['Added to '+name,M(s.added)],['Transferred back',M(s.takenBack)],['Net saving in this period',M(net)]],notes:['Only completed recorded Money Box movements in the stated dates count, including confirmed reversals. Pending or failed moves, imported opening balances and Money Box migration are excluded. Current Money Box balances are a different measure. No money moves when you ask.']}}),{kind:'savings-period',query},now);
}
// Goal progress is shared across editions. Home may highlight one incomplete
// box, while an ordinary multi-box question must ask which box is intended.
const goalProgressMark=g=>g?JSON.stringify([g.id,g.name,Math.max(0,cents(g.target)),Math.max(0,cents(g.allocated)),g.date||'',!!g.archived,!!g.deleted]):'';
function goalProgressAnswer(raw,context,now){
 const q=raw.toLowerCase(),canonical=q==='how close am i to my savings goal?';
 const boxes=(L.state.goals||[]).filter(g=>g&&!g.archived&&!g.deleted&&Number(g.target)>0),words=' '+normalPurpose(raw)+' ',named=boxes.filter(g=>normalPurpose(g.name).length>1&&words.includes(' '+normalPurpose(g.name)+' '));
 if(!canonical&&(!(savingsQuestion(q)||named.length)||!/\b(?:how (?:close|far)|progress|left to save|still to save|remaining to save)\b/.test(q)||goalQuestion(q)))return null;
 const sorted=boxes.slice().sort((a,b)=>(dateOnly(a.date)?.getTime()??Infinity)-(dateOnly(b.date)?.getTime()??Infinity)||(Number(b.allocated)||0)/Number(b.target)-(Number(a.allocated)||0)/Number(a.target)||String(a.id).localeCompare(String(b.id))),incomplete=sorted.filter(g=>Number(g.allocated)<Number(g.target)),choices=named.length?named:incomplete.length?incomplete:sorted;
 if(!canonical&&choices.length>1)return compactAnswer('Which Money Box should I check?','Choose a Money Box to see its confirmed progress.','Choose a Money Box','goals',context,{intent:'savings'});
 const goal=choices[0],guide=goal&&L.moneyBoxGoalGuide?.(goal.id,{now});if(!guide?.available||!guide.hasTarget)return null;
 const saved=guide.saved,target=guide.target,remaining=guide.remaining,percent=Math.min(100,Math.floor(saved/target*100)),name=String(goal.name||'your Money Box'),headline=`You’re ${percent}% of the way to ${name}.`,support=`${M(saved)} saved towards ${M(target)}. ${M(remaining)} to go. This is your progress today; it doesn’t predict when you’ll reach the target.`;
 return compactAnswer(headline,support,'See this Money Box','goal',context,{intent:'savings',params:{id:goal.id},savingsGoalId:goal.id,savingsGoalSnapshot:goalProgressMark(goal),calculation:{rows:[['Money Box',name],['Target',M(target)],['Saved now',M(saved)],['Still to save',M(remaining)]],notes:['Only confirmed saved money is shown. Pending transfers are not counted as completed contributions. This does not predict a saving rate, future income or a target date. No money moves when you ask.']}});
}
function exactGoalDate(raw){
 const text=String(raw||'');const dates=[...text.matchAll(/\b\d{4}-\d{2}-\d{2}\b/g)];if(dates.length>1)return '';const iso=dates[0];if(iso)return dateOnly(iso[0])?iso[0]:'';
 const months=['january','february','march','april','may','june','july','august','september','october','november','december'];
 const named=text.toLowerCase().match(/\b(?:(\d{1,2})(?:st|nd|rd|th)?\s+(january|february|march|april|may|june|july|august|september|october|november|december)|(january|february|march|april|may|june|july|august|september|october|november|december)\s+(\d{1,2})(?:st|nd|rd|th)?),?\s+(\d{4})\b/);
 if(!named)return '';const month=months.indexOf(named[2]||named[3])+1,day=Number(named[1]||named[4]),value=`${named[5]}-${String(month).padStart(2,'0')}-${String(day).padStart(2,'0')}`;return dateOnly(value)?value:'';
}
function goalGuideAnswer(raw,context,now){
 if(/[$€£¥]|\b(?:USD|EUR|GBP|NGN|dollars?|euros?|pounds?|naira)\b/i.test(raw))return compactAnswer('Use Ghana cedis for a saving guide.','The saved target is in GH₵. I do not convert exchange rates or assume a different currency.','Open Money Boxes','goals',context,{intent:'goalGuide'});
 const boxes=(L.state.goals||[]).filter(g=>g&&!g.archived&&!g.deleted&&Number(g.target)>0),words=normalPurpose(raw),named=boxes.filter(g=>normalPurpose(g.name).length>1&&(' '+words+' ').includes(' '+normalPurpose(g.name)+' '));
 const candidates=named.length?named:boxes;
 if(candidates.length!==1)return compactAnswer(candidates.length?'Which Money Box do you mean?':'Create a target to check a saving pace.',candidates.length?'Open a Money Box to choose its target and date. I can calculate the pace needed, but I cannot predict future income or spending.':'A Money Box target and an exact date let me show the saving pace needed. This is a plan, not a forecast.',candidates.length?'Choose a Money Box':'Create a Money Box',candidates.length?'goals':'goalEdit',context,{intent:'goalGuide'});
 const g=candidates[0],targetDate=exactGoalDate(raw),asksDate=/\b(?:by|before|on|deadline)\b/.test(raw.toLowerCase());
 const proposed=amountFrom(raw);
 if(proposed.amount!==null&&(!/\b(?:goal|target|reach|meet|hit)\b/i.test(raw)||proposed.amount!==Number(g.target))||proposed.ambiguous||proposed.invalid)return compactAnswer('Which saving amount should I plan for?',`Your saved ${g.name} target is ${M(g.target)}. Review its target, or ask about progress towards that target. I won’t replace it with an amount from a question.`,'Review target','goalEdit',context,{intent:'goalGuide',params:{id:g.id}});
 if(asksDate&&!targetDate)return compactAnswer('What exact date should I use?',`Choose a full day, month and year for ${g.name}. I can show the saving pace needed, not promise that future money will arrive.`,'Set target date','goalEdit',context,{intent:'goalGuide',params:{id:g.id}});
 const guide=L.moneyBoxGoalGuide?.(g.id,{now,...(targetDate?{targetDate}:{})});
 if(!guide?.available)return compactAnswer('Your goal needs a target and date.',`Choose a target and date for ${g.name} to see the saving pace needed. This does not predict when you will reach it.`,'Review Money Box','goalEdit',context,{intent:'goalGuide',params:{id:g.id}});
 const daily=guide.hasDate&&!guide.overdue&&guide.daysLeft<7,pace=daily?(guide.requiredDaily??Math.ceil(guide.remaining*100/Math.max(1,guide.daysLeft))/100):guide.requiredWeekly;
 const headline=guide.reached?`${g.name} is fully funded.`:guide.overdue?'That target date has passed.':guide.hasDate?`${M(pace)} a ${daily?'day':'week'} would cover the remaining target.`:'Choose a target date to see the pace needed.';
 const support=guide.reached?`${M(guide.saved)} is saved towards ${M(guide.target)}.`:`${M(guide.remaining)} still to save${guide.hasDate?' by '+readableDate(dateOnly(guide.date)):''}. This is the pace required, not a prediction from your income or spending.`;
 return compactAnswer(headline,support,'Review this Money Box','goal',context,{intent:'goalGuide',params:{id:g.id},calculation:{rows:[['Money Box',g.name],['Target',M(guide.target)],['Saved now',M(guide.saved)],['Still to save',M(guide.remaining)],...(guide.hasDate?[['Target date',readableDate(dateOnly(guide.date))]]:[]),...(guide.hasDate&&!guide.overdue&&!guide.reached?[['Days to target, including today',String(guide.daysLeft)],[daily?'Required daily pace':'Required weekly pace',M(pace)]]:[])],notes:[guide.assumption||'This uses the saved target and confirmed progress. It does not assume future money will arrive.','Asking does not change the target, date or saved money.']}});
}

function contextForQuery(query,base){
 const context=plainContext(base),explicit=query.match(/\b(?:last|past|in(?: the last)?)\s+(7|30|90)\s*days?\b/);
 if(explicit)context.days=Number(explicit[1]);
 if(/\b(?:all (?:my )?spending|all categories|everything i spent)\b/.test(query))context.category='';
 else{
  const available=[...new Set(['Food','Transport','Study','Data','Phone','Shopping','Bills','Transfers','Other',...(L.state.txs||[]).map(tx=>categoryName(tx.category)).filter(Boolean)])].sort((a,b)=>b.length-a.length);
  const found=available.find(name=>{const escaped=name.toLowerCase().replace(/[.*+?^${}()|[\]\\]/g,'\\$&');return new RegExp('(?:^|\\W)'+escaped+'(?:$|\\W)').test(query);});
  if(found)context.category=found;
 }
 return context;
}

const normalPurpose=value=>String(value||'').toLowerCase().replace(/[’']/g,'').replace(/[^\p{L}\p{N}]+/gu,' ').trim();
const budgetCosts=()=>(L.state.essentials||[]).filter(x=>!x.archived&&!x.deleted&&Number(x.amount)>0);
// Saved labels and the shared student taxonomy supply the same vocabulary in
// affordability, item questions and Budget drafting. A familiar alias identifies
// a possible commitment, never permission to fulfil it or move money.
L.chatBudgetMatches=(query,items=budgetCosts())=>{
 const words=normalPurpose(query),contains=label=>(' '+words+' ').includes(' '+label+' ');
 return items.filter(cost=>{
  if(!cost||cost.archived||cost.deleted)return false;
  const parts=String(cost.name||'').split(/\s*(?:&|\/|\band\b)\s*/i),fixed=L.budgetCategories?.resolve(cost);
  const categories=fixed?[fixed]:parts.map(part=>L.budgetCategories?.resolve(part)).filter(Boolean);
  const aliases=[cost.name,...parts,...categories.flatMap(c=>[c.name,...c.aliases])].map(normalPurpose).filter(x=>x.length>1);
  return aliases.some(contains);
 });
};
function affordabilityPurpose(query,previous,selected,carried){
 const costs=budgetCosts(),words=normalPurpose(query),prior=normalPurpose(previous);
 const matches=text=>L.chatBudgetMatches(text,costs);
 if(selected!==undefined){const cost=costs.find(x=>x.id===selected);return selected===''?{kind:'extra'}:cost?{kind:'linked',cost}:{kind:'choice',costs,unavailable:true};}
 const mentioned=matches(words);
 if(mentioned.length&&/\b(?:without|not|rather than|instead of|or)\b/.test(words))return {kind:'choice',costs:mentioned};
 if(/\b(?:extra spending|extra spend|left after (?:my )?budget|after budget|spare money)\b/.test(words))return {kind:'extra'};
 const explicit=words.match(/\b(?:from|using|against|out of) (.+)/);
 if(explicit){const found=matches(explicit[1]);return found.length===1?{kind:'linked',cost:found[0]}:{kind:'choice',costs:found.length?found:costs,unavailable:!found.length};}
 const found=matches(words);
 if(found.length)return {kind:'choice',costs:found};
 if(carried!==undefined)return affordabilityPurpose(query,'',carried);
 if(prior&&prior!==words)return affordabilityPurpose(previous,'');
 return {kind:'extra'};
}
function affordability(query,context,previous,now,selected,carried){
 const result=amountFrom(query,!!previous,true),source=previous||query,note=timeframeNote(source+' '+query,now);
 const session={question:source.slice(0,500),amount:result.amount};
 const metadata={intent:'affordability',lastAffordability:session};
 if(result.amount===null){
  const text=result.foreign?'I can check amounts in Ghana cedis. What is the total in GH₵, including any fee?':result.ambiguous?'Which single total should I check? Include any fee, for example GH₵70.00.':result.invalid?'Use a positive amount in Ghana cedis with up to two decimal places, for example GH₵70.50.':'What is the total in Ghana cedis, including any fee? For example, GH₵70.00. I’ll check it against your saved plan.';
  return answer(text,'See my plan','plan',context,{...metadata,pendingAffordability:source});
 }
 const cost=result.amount,s=L.state,F=L.planMoney||M;
 if(typeof L.planImpactSummary!=='function')return answer('I can’t check that amount right now. Open your saved plan and try again.','See my plan','plan',context,metadata);
 // Chat and Pause share this exact account-backed calculation and consequence order.
 const purpose=separate(s)?affordabilityPurpose(query,previous,selected,carried):{kind:'extra'};
 if(purpose.kind==='choice'){
  const headline=purpose.unavailable?'Which Budget item should this cover?':'Is this in your Budget, or extra spending?';
  const choices=[...purpose.costs.map(x=>({id:x.id,name:x.name})),{id:'',name:'Extra spending'}];
  return compactAnswer(headline,`Check ${F(cost)} without counting a planned cost twice.`,null,null,context,{...metadata,budgetPurpose:{amount:cost,question:source,choices}});
 }
 session.sourceId=purpose.cost?.id||'';
 const impact=L.planImpactSummary(purpose.kind==='linked'?{amount:cost,fee:0,essentialId:purpose.cost.id}:cost,s,now),essentials=Number(impact.essentialsAfter)||0,goals=Number(impact.allocated)||0,scope=L.planScopeSummary?.(s),budget=L.budgetStateSummary?.(s,now);
 const line=purpose.cost&&impact.essentials?.find(x=>x.id===purpose.cost.id);
 const sourcePending=purpose.cost?(s.txs||[]).filter(t=>t.type==='out'&&t.status==='pending'&&t.essentialId===purpose.cost.id).reduce((sum,t)=>sum+Number(t.amount||0),0):0;
 const assumption=purpose.cost?(line?.before===0?`${sourcePending>0?`${purpose.cost.name} has ${F(sourcePending)} pending.`:`${purpose.cost.name} is used up.`} This uses money left after Budget.`:`From your ${purpose.cost.name} Budget item. ${F(impact.essentialCovered)} covers that saved cost.`):'Checked as extra spending.';
 const qualify=support=>[separate(s)?assumption:'',budget?.qualifier||'',support].filter(Boolean).join(' ');
 const calculation={rows:[[separate(s)?'Available operational balance':'Available balance',F(impact.available)],['Payment total, including any fee',F(cost)],[impact.projectionLabel,F(impact.after)],['Remaining planned essentials',F(essentials)],...(separate(s)?[]:[['Money set aside for goals',F(goals)]])],notes:[
  purpose.cost?assumption:'Checked as an extra spend. If this pays for a saved essential, select that essential in the payment form so it is not counted twice.',
  impact.commitmentExplanation,
  (scope?scope.label+' ':'')+'Uses your saved costs and current available money. Expected allowance is not received money; future income and costs are not forecast.'+(note?' '+note.trim():'')
 ]};
 const respond=(headline,support,action,route,extra={})=>{support=qualify(support);return answer([headline,support].filter(Boolean).join(' '),action,route,context,{...metadata,headline,support,calculation,planImpact:impact,secondaryAction:'Try a different amount',secondaryRoute:'chatAmount',...extra});};
 const savings=separate(s)?Number(L.accountBalances?.().savingsAvailable)||0:0;
 if(impact.canPay===false)return respond(`You need ${F(impact.fundingShortfall)} more to make this payment.`,savings?'Your Money Boxes are in savings. Move money back to your operational account before using it for a payment.':'Your expected allowance is not available until it arrives.',savings?'Open Money Boxes':'Add money',savings?'goals':'addMoney');
 if(!(scope?scope.costCount>0:(s.essentials||[]).some(cost=>Number(cost.amount)>0)))return respond(`Your balance would become ${F(impact.after)}. I can’t assess affordability yet.`,separate(s)?'Add the costs your operational money needs to cover. Money Boxes stay separate in savings.':'Add your essentials first. Money set aside for goals alone doesn’t show what still needs paying.','Add my essentials','essentials');
 if(impact.totalGap>0){
  calculation.rows.push(['Essentials shortfall',F(impact.essentialGap)],...(separate(s)?[]:[['Goal money uncovered',F(impact.goalGap)]]),['Total plan shortfall',F(impact.totalGap)]);
  const goal=impact.goals?.find(item=>item.allocated>0),headline=impact.headline||`This would leave your essentials ${F(impact.essentialGap)} short.`;
  const support=separate(s)&&savings?`${F(savings)} is held separately in Money Boxes. Move money back to your operational account before using it to cover this gap.`:impact.essentialGap>0&&impact.goalGap>0?impact.goalExplanation||`Money set aside for goals would also be ${F(impact.goalGap)} short.`:'';
  return respond(headline,support,impact.essentialGap>0?'Review essentials':goal?'Review '+goal.name:'Review my goals',impact.essentialGap>0?'essentials':goal?'goal':'goals',{params:impact.essentialGap>0?{}:goal?{id:goal.id}:{}});
 }
 calculation.rows.push(['Left after your plan',F(impact.room)]);
 return respond(impact.headline,budget?'':scope?scope.label+' Other costs aren’t included.':impact.roomExplanation,budget?.ended?'Review Budget dates':'See my plan',budget?.ended?'planPeriod':'plan');
}

const chatAnswer=(question,options={})=>{
 const raw=String(question||'').trim().slice(0,500),query=raw.toLowerCase().replace(/[’]/g,"'"),base={...(L.params||{}),...options},context=plainContext(base),now=Number(options.now)||Date.now();
 const pending=typeof base.pendingAffordability==='string'?base.pendingAffordability:'';
 if(separate()&&/\b(?:can|could|should|may|would|will) i sav(?:e|ing)\b/.test(query)&&!/\b(?:goal|target|reach|meet|hit|track|deadline|by)\b/.test(query))return compactAnswer('Which Money Box should this go into?','Choose a box to review a transfer against the money available today. Future income and spending are not assumed. Nothing has moved.','Choose a Money Box','goals',context,{intent:'savings-planning'});
 if(separate()&&goalQuestion(query))return goalGuideAnswer(raw,context,now);
 if(separate()){const progress=goalProgressAnswer(raw,context,now);if(progress)return progress;}
 if(separate()&&savingsQuestion(query)&&!/\b(?:budget|plan)\b/.test(query)){
  if(!/\b(?:will|can|could|should|would|may)\b/.test(query)){const period=savingsPeriodAnswer(raw,context,now);if(period)return period;}
  const scope=namedSavingsScope(raw),choice=savingScopeChoice(scope,context);if(choice)return choice;
  const accounts=L.accountBalances?.(),guide=scope.box&&L.moneyBoxGoalGuide?.(scope.box.id,{now}),saved=guide?.available?guide.saved:Number(accounts?.savings)||0,available=scope.box?Number(L.moneyBoxAvailable?.(scope.box.id)??saved):Number(accounts?.savingsAvailable??saved),operational=Number(accounts?.available??L.balances().available),count=(L.state.goals||[]).filter(g=>g&&!g.archived&&!g.deleted).length;
  const paying=/\b(?:spend|pay|buy|withdraw|back|use)\b/.test(query);
  const headline=paying?'Move Money Box funds back before you spend them.':scope.box?`${M(saved)} is saved in ${scope.box.name}.`:`${M(saved)} is saved across ${count} Money Box${count===1?'':'es'}.`;
  const support=`${M(operational)} is available in your operational account. ${available<saved?`${M(saved-available)} in savings is reserved for a pending transfer. `:''}Money Boxes sit in your savings account; funding one moves money from operational to savings.`;
  return compactAnswer(headline,support,scope.box?'Open this Money Box':'Open Money Boxes',scope.box?'goal':'goals',context,{intent:'savings',...(scope.box?{params:{id:scope.box.id}}:{}),calculation:{rows:[['Available operational balance',M(operational)],['Money Box savings',M(saved)],['Available to move back',M(available)]],notes:['Moving money between your own Lumo accounts is not spending or new income. Your budget applies to the operational account.']}});
 }
 // Only the immediately preceding affordability turn supplies follow-up context.
 // Historical chat amounts are never searched or used as a proposed payment.
 const previous=pending||(typeof base.lastAffordability?.question==='string'?base.lastAffordability.question.slice(0,500):'');
 const roomIntent=/\bhow much (?:can|could|may) i (?:spend|pay|use)\b|\bwhat (?:can|could|may) i spend\b/.test(query);
 const spendingIntent=!roomIntent&&!runwayQuestion(query)&&/\b(?:where|spent|spend|spending|history|transactions?)\b/.test(query)&&!/\b(?:can|could|should|would|may) i\b/.test(query);
 const affordIntent=/\b(?:afford|affordability)\b|\b(?:can|could|should|would|may) i (?:buy|spend|pay)|\b(?:have|got) enough (?:for|to)\b/.test(query)||/\b(?:i|i'm|i am)\s+(?:(?:want|plan|intend|need) to|(?:am )?(?:going|planning|about) to)\s+(?:spend|pay|buy|purchase|order)\b|\b(?:i'm|i am)\s+(?:thinking (?:of|about)|considering)\s+(?:buying|spending|paying|purchasing|ordering)\b|\b(?:i'm|i am)\s+(?:buying|paying|spending|ordering)\b/.test(query);
 const followup=amountFrom(raw,true);
 const correction=correctionPrefix.test(raw);
 if(!roomIntent&&(affordIntent||previous&&(correction||!spendingIntent&&(followup.amount!==null||followup.invalid||followup.ambiguous))))return affordability(raw,context,affordIntent?'':previous,now,base.affordabilitySource,!affordIntent?base.lastAffordability?.sourceId:undefined);
 if(spendingIntent){
  const requestedDays=query.match(/\b(?:last|past|in(?: the last)?)\s+(\d+)\s*days?\b/);
  const otherDate=/\b(?:today|tonight|tomorrow|yesterday|(?:this|last|next|past) (?:week|weekend|month|year)|on \w+day|\d{4}-\d{2}-\d{2}|\d{1,2}[/-]\d{1,2}(?:[/-]\d{2,4})?)\b/.test(query);
  if(requestedDays&&!periods.includes(Number(requestedDays[1]))||otherDate)return answer('I can show completed spending for the last 7, 30 or 90 days. Choose one of those periods above so the answer and Money Story use the same dates.','Open this money story','story',context,{intent:'spending-period'});
  const c=contextForQuery(query,context),summary=L.spendingSummary({...c,now}),lead=summary.categories[0];
  const text=summary.txs.length?`You spent ${M(summary.total)} ${c.category?'on '+c.category.toLowerCase()+' ':''}in the last ${c.days} days, including fees. ${c.category?summary.txs.length+' completed '+(summary.txs.length===1?'payment.':'payments.'):(lead[0]+' was the biggest category at '+M(lead[1])+'.')}`:`No completed ${c.category?c.category.toLowerCase()+' ':''}spending in the last ${c.days} days. Pending, failed, reversed and incoming payments are excluded.`;
  return analyticalStamp(answer(text,'See this money story','story',c,{intent:'spending',contextLabel:contextLabel(c)}),{kind:'rolling',days:c.days,category:c.category},now);
 }
 const b=L.balances(),s=L.state,F=L.planMoney||M,current=L.planImpactSummary?.(0,s,now),scope=L.planScopeSummary?.(s),budget=L.budgetStateSummary?.(s,now);
 const essentialProblem=current?.essentialGap>0?current.essentialsLabel+'.':'';
 const goalProblem=current?.goalGap>0?current.goalExplanation:'';
 const planProblem=essentialProblem||current?.goalGap>0&&current.goalLabel+'.'||'';
 const currentCalculation={rows:[[separate(s)?'Available operational balance':'Available balance',F(b.available)],['Unpaid essentials',F(b.essentials)],...(separate(s)?[]:[['Money set aside for goals',F(b.allocated)]]),['Left after your plan',F(b.room)]],notes:[(scope?scope.label+' ':'')+'Only saved costs are included. Expected allowance is not received money.',...(separate(s)?['Money Boxes are already held in savings and are not deducted from this operational balance again.']:[])]};
 if(current?.totalGap>0)currentCalculation.rows.push(['Essentials shortfall',F(current.essentialGap)],...(separate(s)?[]:[['Goal money uncovered',F(current.goalGap)]]),['Total plan shortfall',F(current.totalGap)]);
 if(runwayQuestion(query)||/\b(?:allowance|how long)\b/.test(query)){
  const expected=dateOnly(s.allowance?.date),today=todayDate(now),hasEssentials=scope?scope.costCount>0:(s.essentials||[]).some(cost=>Number(cost.amount)>0);
  let allowanceLine;
  if(!expected)allowanceLine='When do you expect your next allowance?';
  else{const days=Math.round((expected-today)/DAY);allowanceLine=days>0?`Your next allowance is expected in ${days} ${days===1?'day':'days'}, on ${readableDate(expected)}.`:days===0?'Your allowance is expected today.':`Your saved allowance date, ${readableDate(expected)}, has passed.`;}
  const pace=/\b(?:rate|pace|behaviou?r|burn)\b/.test(query)?' I don’t forecast a run-out date from your spending rate. Use your Budget-based daily guide to plan what is available.':'';
  const support=(hasEssentials?`${budget?.qualifier?budget.qualifier+' ':''}${planProblem?'':F(b.room)+' is left after your saved plan. '}I can’t promise this will last; unplanned costs are not included.`:'You haven’t saved your essentials, so I can’t say how long this money will last.')+pace;
  currentCalculation.notes.push('Future income and spending are not forecast. Update the allowance date if the expected money has not arrived.');
  return compactAnswer(planProblem||allowanceLine,[essentialProblem?goalProblem:'',planProblem?allowanceLine:'',support,'Expected allowance is not received money.'].filter(Boolean).join(' '),!expected?'Set my allowance date':!hasEssentials?'Add my essentials':'Review my plan',!expected?'allowance':!hasEssentials?'essentials':'plan',context,{intent:'runway',calculation:currentCalculation});
 }
 if(/\b(?:change|adjust|release|recover|tight|short|make(?: some)? room)\b/.test(query))return compactAnswer(planProblem||'You can change your saved plan.',separate(s)?'Review a budget cost if your needs have changed, add money, or move money back from a Money Box. A transfer back moves existing savings into your operational account.':[essentialProblem?goalProblem:'','Review an essential or set aside less for a goal. Neither adds money to the account.'].filter(Boolean).join(' '),'Review my options','makeRoom',context,{intent:'plan',calculation:currentCalculation});
 if(roomIntent||/\b(?:left|remain|balance|room|goals?|plan|budget|how much)\b/.test(query)){
  const noPlan=scope?!(scope.costCount||scope.goalCount):!(s.essentials||[]).some(cost=>Number(cost.amount)>0)&&!(s.goals||[]).some(goal=>Number(goal.allocated)>0);
  const balanceQuestion=/\b(?:balance|available)\b/.test(query),headline=noPlan?`${F(b.available)} is available.`:planProblem||(balanceQuestion?`${F(b.available)} is available.`:budget?.status==='completed'?`Your saved Budget costs are covered. ${F(b.room)} remains.`:`${F(b.room)} is left after your saved plan.`);
  const support=noPlan?(separate(s)?'Save the costs your operational money needs to cover before using “Left after your budget” to judge a spend.':'Save your essentials and money set aside for goals before using “Left after your plan” to judge a spend.'):planProblem?essentialProblem?goalProblem:'Your essentials stay covered.':balanceQuestion?`${F(b.room)} is left after your saved plan.`:(scope?scope.label+' Other costs aren’t included.':'This includes only the costs you saved. Expected allowance is not received money.');
  const explanation=budget?.qualifier?(balanceQuestion?[budget.qualifier,support].join(' '):planProblem?[budget.qualifier,support].filter(Boolean).join(' '):budget.qualifier):support;
  return compactAnswer(headline,explanation,noPlan?'Build my plan':budget?.ended?'Review Budget dates':'See my plan',budget?.ended?'planPeriod':'plan',context,{intent:'plan',calculation:currentCalculation});
 }
 if(/\b(?:send|pay|payments?|transfer)\b/.test(query))return answer('Open payments to choose a recipient, review the amount and any fee, then confirm yourself. This chat never sends money.','Open payments','pay',context,{intent:'payments'});
 return answer('I can check completed spending, a payment amount against your saved plan, what is left after the plan, or your next allowance date. Try one of the questions below.','See my plan','plan',context,{intent:'unsupported'});
};

// Snapshot the account-backed facts used by a financial answer. Saved replies
// stay immutable; a later plan or balance change is identified on presentation.
const financialContext=()=>{
 const b=L.balances(),s=L.state,p=L.pauseEngine?.planPosition?.({amount:0,fee:0},s);
 return JSON.stringify({available:b.available,essentials:b.essentials,allocated:b.allocated,
  ...(separate(s)?{savings:Number(L.accountBalances?.().savings)||0,savingsAvailable:Number(L.accountBalances?.().savingsAvailable)||0}:{}),
  savedCosts:(s.essentials||[]).map(x=>[x.id,x.name,x.amount,x.paid,x.externalPaid,x.date||'']),
  costs:(p?.essentials||s.essentials||[]).map(x=>[x.id,x.name,x.before??Math.max(0,Number(x.amount)-Number(x.paid||0)),x.date||'']),
  goals:(s.goals||[]).map(x=>[x.id,x.name,Number(x.allocated)||0,Number(x.target)||0,x.date||'',!!x.archived,!!x.deleted]),
  allowance:[Number(s.allowance?.amount)||0,s.allowance?.date||''],period:s.planHorizon||null});
};
L.chatAnswer=(question,options={})=>{
 let reply=chatAnswer(question,options);
 if(separate()&&['affordability','plan','runway','unsupported'].includes(reply.intent)){
  // A saved cost is the student's own label. Rename interface terminology,
  // never a named financial conclusion supplied by the shared engine.
  const namedHeadline=(L.state.essentials||[]).some(cost=>cost.name&&reply.headline?.startsWith(cost.name+' '))?reply.headline:null;
  reply={...reply,...Object.fromEntries(['text','headline','support','action','secondaryAction'].filter(key=>typeof reply[key]==='string').map(key=>[key,budgetText(reply[key])]))};
  if(namedHeadline){reply.headline=namedHeadline;reply.text=[namedHeadline,reply.support].filter(Boolean).join(' ');}
  if(reply.calculation)reply.calculation={...reply.calculation,rows:reply.calculation.rows.map(([label,value])=>[budgetText(label),value]),notes:reply.calculation.notes.map(budgetText)};
 }
 if(reply.calculation&&['affordability','plan','runway','savings','goalGuide'].includes(reply.intent)){const now=Number(options.now)||Date.now();return {...reply,financialContext:financialContext(),checkedAt:new Date(now).toISOString(),answerDateLabel:`Checked ${dateTime(now)} · Ghana time`};}
 return reply;
};
const snapshotStatus=reply=>{
 const extra=L.chatSnapshotStatusExtra?.(reply);if(extra)return extra;
 const goalSnapshot=reply?.savingsGoalSnapshot||reply?.monoGoalSnapshot;if(goalSnapshot&&goalSnapshot!==goalProgressMark((L.state.goals||[]).find(g=>g.id===(reply.savingsGoalId||reply.monoGoalId))))return 'Earlier answer. Your Money Box or target has changed.';
 const analytical=analyticalStatus(reply);if(analytical||reply.answerScope)return analytical;
 if(!reply.calculation||!['affordability','plan','runway','savings','goalGuide'].includes(reply.intent))return '';
 if(!reply.financialContext)return reply.planImpact?'Saved projection. Check again for current figures.':'Saved answer. Check again for current figures.';
 if(reply.checkedAt&&Number.isFinite(Date.parse(reply.checkedAt))&&dayKey(Date.parse(reply.checkedAt))!==dayKey(Date.now()))return 'Earlier answer. This was checked on '+readableDate(new Date(reply.checkedAt))+'.';
 return reply.financialContext!==financialContext()?(reply.planImpact?'Earlier projection. Your money or plan has changed.':'Earlier answer. Your money or plan has changed.'):'';
};
// History and calculation views must use the same saved-answer status as Chat.
L.chatSnapshotStatus=snapshotStatus;
const canRecheck=reply=>!!reply.q&&(['plan','runway','savings','goalGuide','spending','calendarSpending','money-story-insight','savings-period'].includes(reply.intent)||reply.intent==='affordability'&&Number(reply.planImpact?.amount)>0);

const prompts=[['Where did my money go?','Where did my money go?'],['Can I spend GH₵80?','Can I spend GH₵80?'],['How long will my money last?','How long will my money last?'],['What’s left after my budget?','What is left after my budget?']];
function recordQuestion(question,options={}){
 const q=String(question||'').trim().slice(0,500);if(!q)return null;
 const reply=L.chatAnswer(q,options);L.state.chats=L.state.chats||[];L.state.chats.push({q,...reply});
 L.params={...reply.context,...(reply.pendingAffordability?{pendingAffordability:reply.pendingAffordability}:{}),...(reply.lastAffordability?{lastAffordability:reply.lastAffordability}:{})};L.save();return reply;
}
L.askChat=()=>{const reply=recordQuestion(L.value('chatText'));if(!reply)return;L.clearFormDraft?.();L.render();L.announceChat?.(reply.text);document.getElementById('chatText')?.focus?.({preventScroll:true});};
L.askSuggestion=i=>{if(!prompts[i])return;const reply=recordQuestion(prompts[i][1]);if(!reply)return;L.clearFormDraft?.();L.render();L.announceChat?.(reply.text);};
L.setChatPeriod=days=>{if(!periods.includes(Number(days)))return;L.params={...plainContext(),days:Number(days)};L.render();};
L.clearChatCategory=()=>{L.params={...plainContext(),category:''};L.render();};
L.chatTryAmount=index=>{const reply=L.state.chats?.[index];if(!reply?.lastAffordability?.question)return;L.params={...plainContext(reply.context),pendingAffordability:reply.lastAffordability.question,lastAffordability:reply.lastAffordability};L.render();document.getElementById('chatText')?.focus?.({preventScroll:true});};
L.chatChooseBudget=(index,choiceIndex)=>{
 if(L.route!=='chat'||!Number.isSafeInteger(index)||!Number.isSafeInteger(choiceIndex)||choiceIndex<0)return false;
 const previous=L.state.chats?.[index],choice=previous?.budgetPurpose?.choices?.[choiceIndex];
 if(!choice||!(previous.budgetPurpose.amount>0))return false;
 const input=document.getElementById('chatText'),unsent=input?.value||'';
 const question=`Can I spend GH₵${Number(previous.budgetPurpose.amount).toFixed(2)} ${choice.id?'from my '+choice.name+' Budget':'as extra spending'}?`;
 const fresh=recordQuestion(question,{...plainContext(previous.context),affordabilitySource:choice.id,pendingAffordability:'',lastAffordability:null});
 L.render();const composer=document.getElementById('chatText');if(composer)composer.value=unsent;L.captureFormDraft?.();L.announceChat?.(fresh.text);return true;
};
L.chatCheckAgain=index=>{
 const reply=L.state.chats?.[index];if(L.route!=='chat'||!reply||!canRecheck(reply))return false;
 const input=document.getElementById('chatText'),unsent=input?.value||'';
 L.captureFormDraft?.();
 const question=reply.intent==='affordability'?`Can I spend GH₵${Number(reply.planImpact.amount).toFixed(2)}?`:reply.q;
 const fresh=recordQuestion(question,{...plainContext(reply.context),pendingAffordability:'',lastAffordability:null,affordabilitySource:reply.lastAffordability?.sourceId,...(reply.intent==='money-story-insight'?{moneyStoryInsight:true,storyParams:reply.params||reply.context}:{})});
 if(!fresh)return false;L.render();
 // Checking an earlier answer does not submit or clear the student's draft.
 const composer=document.getElementById('chatText');if(composer)composer.value=unsent;L.captureFormDraft?.();L.announceChat?.(fresh.text);return true;
};
L.chatOpenAnswer=(index,secondary=false)=>{const reply=L.state.chats?.[index],route=secondary?reply?.secondaryRoute:reply?.route;if(!reply)return;if(route==='chatAmount')return L.chatTryAmount(index);if(!['story','plan','planPeriod','makeRoom','pay','addMoney','essentials','allowance','goal','goalEdit','goals'].includes(route))return;L.go(route,route==='story'?plainContext(reply.params||reply.context||L.params):reply.params||{});};
const replyCalculationBody=reply=>`<dl>${(Array.isArray(reply.calculation?.rows)?reply.calculation.rows:[]).filter(row=>Array.isArray(row)&&row.length>=2).map(([label,value])=>`<div><dt>${E(label)}</dt><dd>${E(value)}</dd></div>`).join('')}</dl>${(Array.isArray(reply.calculation?.notes)?reply.calculation.notes:[]).map(note=>`<p>${E(note)}</p>`).join('')}`;
const calculationIndex=value=>typeof value==='number'&&Number.isSafeInteger(value)&&value>=0?value:typeof value==='string'&&/^\d+$/.test(value)&&Number.isSafeInteger(Number(value))?Number(value):null;
const calculatedReply=value=>{const index=calculationIndex(value),reply=index===null?null:L.state.chats?.[index];return reply?.calculation&&typeof reply.calculation==='object'?{index,reply}:null;};
L.openChatCalculation=index=>{
 const selected=calculatedReply(index);if(!selected)return false;
 // The sheet reads the saved answer snapshot. It does not quote current funds
 // again, change the plan, append a turn or clear the unsent composer draft.
 L.go('chatCalculation',{index:selected.index});return true;
};
L.views.chatCalculation=()=>{
 const selected=calculatedReply(L.params.index);
 if(!selected)return `<section class="chat-calculation-page" data-illustrated-screen="chatCalculation">${L.header('Calculation unavailable.','Return to your conversation and choose another answer.')}<div class="actions">${B('Back to conversation','L.back()')}</div></section>`;
 const reply=selected.reply,status=snapshotStatus(reply);
 return `<section class="chat-calculation-page" data-illustrated-screen="chatCalculation">${L.header('See calculation','The figures saved with this answer.')}${reply.answerDateLabel?`<p class="small muted chat-answer-date">${E(reply.answerDateLabel)}</p>`:''}${reply.answerPeriodLabel?`<p class="small muted">${E(reply.answerPeriodLabel)}</p>`:''}${status?`<p class="small muted chat-snapshot-status">${E(status)}</p>`:''}<blockquote class="chat-calculation-question">${E(reply.q||'Your money question')}</blockquote>${reply.headline?`<p class="chat-calculation-conclusion">${E(reply.headline)}</p>`:''}<div class="chat-calculation-body">${replyCalculationBody(reply)}</div><p class="chat-calculation-snapshot">This explains that answer. It does not update or move your money.</p><div class="actions">${B('Done','L.back()')}</div></section>`;
};
const replyDetails=(reply,index)=>reply.calculation?B('See calculation',`L.openChatCalculation(${index})`,'text-btn chat-calculation-link'):'';
const replyPurpose=(reply,index)=>reply.budgetPurpose?.choices?`<div class="chips" role="group" aria-label="Choose what this payment covers">${reply.budgetPurpose.choices.map((choice,i)=>B(E(choice.id?'From '+choice.name:choice.name),`L.chatChooseBudget(${index},${i})`,'chip')).join('')}</div>`:'';
// Keep long conversations readable without rendering every saved turn at once.
// Windows and search are session-only view state, keyed to the account object.
const THREAD_PAGE=40,threadWindows=new WeakMap();
function threadWindow(){
 const chats=L.state.chats||[];let page=threadWindows.get(L.state);
 if(!page||page.total!==chats.length){page={start:Math.max(0,chats.length-THREAD_PAGE),total:chats.length};threadWindows.set(L.state,page);}
 return {...page,end:Math.min(chats.length,page.start+THREAD_PAGE)};
}
function ensureTurn(index){
 if(!Number.isSafeInteger(index)||index<0||index>=(L.state.chats||[]).length)return false;
 const page=threadWindow();if(index>=page.start&&index<page.end)return false;
 threadWindows.set(L.state,{start:Math.max(0,Math.min(index-10,page.total-THREAD_PAGE)),total:page.total});return true;
}
function changeThreadPage(direction){
 if(!L.state.onboarded||L.state.locked||L.state.closed||L.route!=='chat'||L.taskSheet?.active||L.budgetGuide?.active?.()||![-1,1].includes(direction))return false;
 const page=threadWindow(),start=Math.max(0,Math.min(Math.max(0,page.total-THREAD_PAGE),page.start+direction*THREAD_PAGE));if(start===page.start)return false;
 const draft=document.getElementById('chatText')?.value||'';L.captureFormDraft?.();threadWindows.set(L.state,{start,total:page.total});L.render();
 const field=document.getElementById('chatText');if(field)field.value=draft;L.captureFormDraft?.();
 const thread=document.getElementById('chat-thread');if(thread)thread.scrollTop=0;document.getElementById('chat-saved-turn-'+start)?.focus?.({preventScroll:true});return true;
}
L.chatThreadWindow=Object.freeze({current:threadWindow,ensure:ensureTurn,previous:()=>changeThreadPage(-1),next:()=>changeThreadPage(1)});
function turnMarkup(reply,i){
 const status=snapshotStatus(reply),action=status&&['money-story-insight','spending'].includes(reply.intent)?'Open current Money Story':reply.action;
 return `<div class="chat-turn" id="chat-saved-turn-${i}" data-chat-turn-index="${i}" tabindex="-1"><div class="chat-bubble user">${E(reply.q)}</div><div class="chat-bubble chat-reply${status?' chat-reply-previous':''}"${reply.calculation?` data-financial-snapshot="${status?'earlier':'current'}"`:''}${reply.planImpact&&!status?` data-insight data-decision-state="${E(reply.planImpact.consequenceTone||'unknown')}"`:''}${i===(L.state.chats||[]).length-1?' id="chat-latest-reply"':''}>${reply.answerDateLabel?`<p class="small muted chat-answer-date">${E(reply.answerDateLabel)}</p>`:''}${status?`<p class="small muted chat-snapshot-status">${E(status)}</p>${canRecheck(reply)?B('Check again',`L.chatCheckAgain(${i})`,'text-btn chat-recheck'):''}`:''}${reply.contextLabel?`<p class="tiny muted">${E(reply.contextLabel)}</p>`:''}<p class="lead">${reply.planImpact&&!status?L.clarityRing():''}${E(reply.headline||reply.text)}</p>${reply.support?`<p class="impact-secondary">${E(reply.support)}</p>`:''}${replyPurpose(reply,i)}${L.chatExtraControls?.(reply,i)||''}${replyDetails(reply,i)}${action?`<div class="chat-reply-actions">${B(E(action),`L.chatOpenAnswer(${i})`,'text-btn')}${reply.secondaryAction?B(E(reply.secondaryAction),`L.chatOpenAnswer(${i},true)`,'text-btn'):''}</div>`:''}</div></div>`;
}
L.views.chat=()=>{
 if(L.params.question&&!L.params.used){const q=L.params.question;L.params.used=true;recordQuestion(q);}
 const context=plainContext(),chats=L.state.chats||[],pending=!!L.params.pendingAffordability,page=threadWindow();
 const history=chats.slice(page.start,page.end).map((reply,offset)=>turnMarkup(reply,page.start+offset)).join('');
 const pages=chats.length>THREAD_PAGE?`<div class="chat-thread-pages" role="group" aria-label="Conversation pages">${page.start?B('Earlier questions','L.chatThreadWindow.previous()','text-btn'):''}<span class="small muted">${page.start+1}–${page.end} of ${page.total}</span>${page.end<page.total?B('Newer questions','L.chatThreadWindow.next()','text-btn'):''}</div>`:'';
 const art=L.contextualIllustration?.('chat')||L.illustration?.('chat')||'',heading=L.header(chats.length?'Your conversation.':'Ask your money.','A clear answer. From your saved information.').replace('<div class="page-heading">',`<div class="page-heading"><div class="chat-illustration" aria-hidden="true">${art}</div>`);
 return `<section class="chat-workspace${chats.length?' chat-has-conversation':''}" data-illustrated-screen="chat">${heading}<div id="chat-thread" class="chat-thread" data-chat-turn-count="${chats.length}" role="log" aria-live="off" aria-label="Your conversation">${pages}${history||'<div class="chat-bubble">What would you like to understand? Choose a question below, or ask about a payment amount.</div>'}${pages}</div><div class="chat-tools"><details class="chat-context"><summary>Spending view: ${E(contextLabel(context))}</summary>${context.category?B('All spending','L.clearChatCategory()','text-btn'):''}<div class="chips" role="group" aria-label="Chat spending period">${periods.map(days=>B(days+' days',`L.setChatPeriod(${days})`,'chip '+(days===context.days?'selected':'')).replace('<button ',`<button aria-pressed="${days===context.days}" `)).join('')}</div></details><details class="chat-prompts"${chats.length?'':' open'}><summary>Try a question</summary><div class="chips" role="group" aria-label="Suggested money questions">${prompts.map(([label],i)=>B(label,`L.askSuggestion(${i})`,'chip')).join('')}</div></details></div><form class="chat-entry" onsubmit="event.preventDefault();L.askChat()"><label class="sr-only" for="chatText">${pending?'Total payment amount in Ghana cedis':'Ask your money'}</label><input id="chatText" name="chatText" aria-label="${pending?'Total payment amount in Ghana cedis':'Ask your money'}" placeholder="${pending?'For example, GH₵70.00':'Ask your money…'}" maxlength="500" autocomplete="off" enterkeyhint="send"><button type="submit" aria-label="Send question">${L.icon('arrowUp')}</button></form><p class="tiny muted chat-boundary">Saved information only. Chat never moves your money.</p></section>`;
};
// Only a new turn moves the conversation to its newest answer. Returning from a
// detail or plan sheet preserves the retained history position and draft.
const render=L.render;
L.render=function(...args){
 const before=document.getElementById('chat-thread'),count=Number(before?.getAttribute?.('data-chat-turn-count')),scroll=Number(before?.scrollTop)||0;
 const result=render.apply(this,args);
 if(L.route==='chat'){
  const thread=document.getElementById('chat-thread');
  if(thread){if(before&&Number.isFinite(count)&&count===(L.state.chats?.length||0))thread.scrollTop=scroll;else thread.scrollTop=thread.scrollHeight;}
 }
 L.updateChatViewport?.();return result;
};
// The visual viewport changes when a phone keyboard opens. Update layout
// variables without rerendering, replacing the input or changing its value.
L.updateChatViewport=()=>{
 const app=document.getElementById('app'),root=app||document.documentElement;
 const chat=L.route==='chat'||app?.getAttribute?.('data-route')==='chat'||app?.getAttribute?.('data-task-parent')==='chat';
 if(!chat){app?.classList?.remove?.('chat-keyboard-open','chat-composer-focused');return false;}
 const viewport=window.visualViewport,layout=Math.max(Number(window.innerHeight)||0,Number(document.documentElement?.clientHeight)||0)||800;
 const height=Number(viewport?.height)>0?Number(viewport.height):layout,top=Math.max(0,Number(viewport?.offsetTop)||0);
 const keyboard=Math.max(0,layout-height-top),focused=document.activeElement,composer=L.route==='chat'&&!L.taskSheet?.active&&focused?.id==='chatText';
 root?.style?.setProperty?.('--chat-viewport-height',height+'px');root?.style?.setProperty?.('--chat-viewport-top',top+'px');root?.style?.setProperty?.('--chat-keyboard-height',keyboard+'px');
 app?.classList?.toggle?.('chat-keyboard-open',keyboard>100);app?.classList?.toggle?.('chat-composer-focused',!!composer);
 // A sheet owns its own focused field. On Chat, only correct a genuinely
 // obscured composer; viewport events never scroll historical messages.
 if(composer&&keyboard>100){const rect=focused.getBoundingClientRect?.();if(rect&&(rect.top<top+8||rect.bottom>top+height-8))focused.scrollIntoView?.({block:'nearest',behavior:'auto'});}
 return true;
};
let viewportFrame=false;
const scheduleViewport=()=>{if(viewportFrame)return;viewportFrame=true;const run=()=>{viewportFrame=false;L.updateChatViewport();};if(typeof requestAnimationFrame==='function')requestAnimationFrame(run);else if(typeof setTimeout==='function')setTimeout(run,0);else run();};
window.addEventListener?.('resize',scheduleViewport);window.addEventListener?.('orientationchange',scheduleViewport);
window.visualViewport?.addEventListener?.('resize',scheduleViewport);window.visualViewport?.addEventListener?.('scroll',scheduleViewport);
document.addEventListener?.('focusin',event=>{
 if(event.target?.id!=='chatText')return;
 // Typing gets the space occupied by introductory suggestions. The summary
 // remains available, and reopening it is an explicit student choice.
 document.getElementById('view')?.querySelector?.('.chat-prompts')?.removeAttribute?.('open');scheduleViewport();
});
document.addEventListener?.('focusout',event=>{if(event.target?.id==='chatText')scheduleViewport();});
L.updateChatViewport();
})();
