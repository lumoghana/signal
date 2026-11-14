/** Private Money IQ snapshots. All ledger values are integer pesewas; money is read, never changed. */
import {ensureLearningState} from './learning-model.js';

export const MONEY_IQ_ACTIONS=new Set(['moneyIQStart','moneyIQAnswer','moneyIQNext','moneyIQComplete']);
const DAY=86400000,WEEK=7*DAY,XP=50,WEEKLY_CAP=100,MAX_SESSIONS=100;
const clone=v=>JSON.parse(JSON.stringify(v));
const object=v=>!!v&&typeof v==='object'&&!Array.isArray(v);
const amount=v=>Number.isSafeInteger(v)&&v>=0;
const identifier=v=>typeof v==='string'&&v.length>0&&v.length<=180;
const stamp=v=>typeof v==='string'&&Number.isFinite(Date.parse(v));
const ok=(message,rest={})=>({ok:true,message,...rest}),fail=message=>({ok:false,message});
const nowOf=o=>{const n=typeof o?.now==='function'?o.now():o?.now;const d=n?new Date(n):new Date();return Number.isFinite(d.getTime())?d:new Date();};
const uid=()=>`money-iq-${globalThis.crypto?.randomUUID?.()||`${Date.now()}-${Math.random().toString(36).slice(2)}`}`;
const money=v=>`GH¢${(v/100).toLocaleString('en-GH',{minimumFractionDigits:v%100?2:0,maximumFractionDigits:2})}`;
const text=(v,max=220)=>typeof v==='string'&&v.length<=max;
const weekOf=d=>{const n=new Date(d);n.setUTCHours(0,0,0,0);n.setUTCDate(n.getUTCDate()-(n.getUTCDay()+6)%7);return n.toISOString().slice(0,10);};
const dateLabel=v=>new Date(v).toLocaleDateString('en-GH',{day:'numeric',month:'short',timeZone:'UTC'});
function periodOf(now){
 const start=`${weekOf(now)}T00:00:00.000Z`,end=now.toISOString(),previousStart=new Date(Date.parse(start)-WEEK).toISOString(),previousEnd=new Date(now.getTime()-WEEK).toISOString();
 return {start,end,previousStart,previousEnd,label:`${dateLabel(start)}–${dateLabel(end)}`,previousLabel:`${dateLabel(previousStart)}–${dateLabel(previousEnd)}`,asOf:now.toISOString(),timezone:'UTC'};
}
const blank=()=>({schema:1,sessions:[],recoveryNotice:''});
const personal=s=>s.learning?.enrolled===true&&s.learning.personalised===true&&s.account?.privacy?.personalisation!==false;
const comparisonValid=c=>c===undefined||object(c)&&amount(c.current)&&amount(c.previous)&&text(c.currentLabel)&&text(c.previousLabel);
const insightValid=r=>object(r)&&['title','value','body','lesson'].every(k=>text(r[k],800))&&comparisonValid(r.comparison)&&(r.route===undefined||object(r.route)&&['activity','learn'].includes(r.route.section));
const periodValid=p=>object(p)&&['start','end','previousStart','previousEnd','asOf'].every(k=>stamp(p[k]))&&Date.parse(p.start)<=Date.parse(p.end)&&Date.parse(p.previousStart)<=Date.parse(p.previousEnd)&&text(p.label)&&text(p.previousLabel)&&p.timezone==='UTC';
function validSession(r){
 if(!object(r)||!identifier(r.id)||!['actual','example'].includes(r.mode)||!['question','reveal','completed'].includes(r.status)||!stamp(r.startedAt)||!periodValid(r.period)||!/^\d{4}-\d{2}-\d{2}$/.test(r.week)||!Number.isInteger(r.index)||r.index<0||r.index>4||!amount(r.pointsEarned)||r.pointsEarned>XP||typeof r.sourceKey!=='string'||r.sourceKey.length>1500000||!insightValid(r.recap))return false;
 if(!Array.isArray(r.questions)||r.questions.length!==5||new Set(r.questions.map(q=>q?.id)).size!==5||!r.questions.every(q=>object(q)&&identifier(q.id)&&text(q.prompt)&&text(q.subtext)&&['spending','category','count','practice'].includes(q.kind)&&Array.isArray(q.options)&&q.options.length===3&&q.options.every(x=>text(x,180))&&new Set(q.options).size===3&&Number.isInteger(q.correct)&&q.correct>=0&&q.correct<3&&insightValid(q.reveal)))return false;
 const expected=r.status==='question'?r.index:r.index+1;
 if(!Array.isArray(r.answers)||r.answers.length!==expected||!r.answers.every((a,i)=>object(a)&&a.questionId===r.questions[i].id&&Number.isInteger(a.option)&&a.option>=0&&a.option<3&&stamp(a.at)))return false;
 return r.status!=='completed'||r.index===4&&stamp(r.completedAt);
}
export function validMoneyIQState(s){const q=s.learning?.moneyIQ;return q===undefined||object(q)&&q.schema===1&&Array.isArray(q.sessions)&&q.sessions.length<=MAX_SESSIONS&&q.sessions.every(validSession)&&new Set(q.sessions.map(r=>r.id)).size===q.sessions.length&&text(q.recoveryNotice,400);}
function storeOf(s){return validMoneyIQState(s)&&s.learning?.moneyIQ?s.learning.moneyIQ:blank();}
export function ensureMoneyIQState(s){
 ensureLearningState(s);
 if(s.learning.moneyIQ===undefined)s.learning.moneyIQ=blank();
 else if(!validMoneyIQState(s))s.learning.moneyIQ={...blank(),recoveryNotice:'That Money IQ save could not be opened. Your other progress and money records are still here.'};
 if(!personal(s))purgePersonalMoneyIQ(s);
 return s;
}
export function purgePersonalMoneyIQ(s){if(s.learning?.moneyIQ&&Array.isArray(s.learning.moneyIQ.sessions))s.learning.moneyIQ.sessions=s.learning.moneyIQ.sessions.filter(r=>r?.mode!=='actual');return s;}

// Conflicting duplicate IDs are omitted rather than guessing which record is authoritative.
function ledgerRecords(s){
 const byId=new Map(),conflicts=new Set();
 for(const t of Array.isArray(s.transactions)?s.transactions:[]){
  if(!object(t)||!identifier(t.id))continue;
  const key=JSON.stringify([t.type,t.direction,t.status,t.amount,t.fee||0,t.refunded||0,t.at,t.rail,t.category,t.groupId,t.collectionId,t.boxTransfer,t.walletDebited,t.contributionId,t.payoutId]);
  if(byId.has(t.id)&&byId.get(t.id).key!==key)conflicts.add(t.id);else if(!byId.has(t.id))byId.set(t.id,{key,t});
 }
 return [...byId].filter(([id])=>!conflicts.has(id)).map(([,v])=>v.t);
}
const category=v=>String(v||'Other').trim().slice(0,60)||'Other';
function spendRecord(t,cutoff){
 const when=Date.parse(t.at);
 if(t.status!=='success'||t.direction!=='out'||!['payment','card-purchase'].includes(t.type)||t.rail==='internal'||t.groupId||t.collectionId||t.boxTransfer||t.contributionId||t.payoutId||t.walletDebited===false||!amount(t.amount)||!amount(t.fee??0)||!amount(t.refunded??0)||!Number.isFinite(when)||when>cutoff)return null;
 const net=Math.max(0,t.amount-(t.type==='card-purchase'?(t.refunded||0):0))+(t.fee||0);
 if(!Number.isSafeInteger(net)||net<=0)return null;
 return {id:t.id,amount:net,category:category(t.category),at:new Date(when).toISOString()};
}
function aggregate(records){
 const groups=new Map();let total=0;
 for(const t of records){total+=t.amount;if(!Number.isSafeInteger(total))return null;const k=t.category.toLowerCase(),g=groups.get(k)||{name:t.category,amount:0,count:0};g.amount+=t.amount;g.count++;groups.set(k,g);}
 return {total,count:records.length,categories:[...groups.values()].sort((a,b)=>b.amount-a.amount||a.name.localeCompare(b.name)),data:records.filter(t=>t.category.toLowerCase()==='data').reduce((n,t)=>n+t.amount,0),dataCount:records.filter(t=>t.category.toLowerCase()==='data').length};
}
function evidence(s,p){
 const earliest=Date.parse(p.previousStart),cutoff=Date.parse(p.end),records=ledgerRecords(s).map(t=>spendRecord(t,cutoff)).filter(Boolean).filter(t=>Date.parse(t.at)>=earliest).sort((a,b)=>a.id.localeCompare(b.id));
 const current=records.filter(t=>Date.parse(t.at)>=Date.parse(p.start)&&Date.parse(t.at)<=cutoff),previous=records.filter(t=>Date.parse(t.at)>=earliest&&Date.parse(t.at)<=Date.parse(p.previousEnd));
 // Only evidence actually used by these two like-for-like windows can stale the round.
 const used=[...current,...previous].sort((a,b)=>a.id.localeCompare(b.id));
 return {current:aggregate(current),previous:aggregate(previous),sourceKey:JSON.stringify(used)};
}
function sampleEvidence(round=0){
 const samples=[
  {amounts:[8500,5500,5000,4000],counts:[3,2,2,2],previous:[8000,5000,4000,3000]},
  {amounts:[6000,4500,3000,7000],counts:[2,1,3,4],previous:[5500,4500,5000,6000]},
  {amounts:[9000,12000,7500,3500],counts:[3,2,3,2],previous:[8500,10000,6000,4000]},
  {amounts:[5000,3000,4000,5500],counts:[2,1,2,3],previous:[6500,3500,4000,4500]}
 ];
 const sample=samples[round%samples.length],names=['Food','Essentials','Data','Transport'];
 const make=(amounts,counts)=>({total:amounts.reduce((n,v)=>n+v,0),count:counts.reduce((n,v)=>n+v,0),data:amounts[2],dataCount:counts[2],categories:names.map((name,i)=>({name,amount:amounts[i],count:counts[i]})).sort((a,b)=>b.amount-a.amount||a.name.localeCompare(b.name))});
 return {current:make(sample.amounts,sample.counts),previous:make(sample.previous,[3,2,2,1]),sourceKey:''};
}
const CAMPUS_MOMENTS=[
 [
  ['expected','“I’ll send GH¢50 tomorrow.” Spend it today?','Wait until the GH¢50 arrives',['Yes, it is already available','Wait until the GH¢50 arrives','Add it to today’s balance'],'Promises need a little space.','Wait for it to land.','Money promised is expected money, until it is received.','Keep it out of today’s available balance. Plan with what is already in your hands.'],
  ['pending','Payment still pending. What now?','Check the same payment reference',['Send it again immediately','Check the same payment reference','Assume the person has been paid'],'One payment. One reference.','Check before retrying.','Pending means the result has not been confirmed.','Check the existing payment first. Sending again could create another payment.']
 ],
 [
  ['cushion','The shuttle fare jumps. What helps?','A little money kept back',['Spend the whole allowance first','A little money kept back','Count tomorrow’s promised money'],'Room for the unexpected.','A small cushion.','An unexpected cost is easier to handle when some received money has no other job.','Keep back what works for you after the essentials. Even a small amount can make a difference.'],
  ['proof','“I’ve paid” in the group chat. Count it?','Wait for the confirmed contribution',['Count the message as payment','A screenshot is confirmation','Wait for the confirmed contribution'],'Messages help you coordinate.','The record confirms it.','A message or screenshot does not change the group’s collected total.','Check the contribution record. Only confirmed money counts toward the collection.']
 ],
 [
  ['recipient','MoMo name looks unfamiliar. Your move?','Check the number and name first',['Send quickly before class','Check the number and name first','Ask for a screenshot afterwards'],'A pause worth taking.','Check who gets it.','The registered name helps you check the destination before paying.','If the name is unexpected, confirm with the person through a contact you already trust.'],
  ['mandate','An approver types “yes” in chat. Pay out?','Use the payout approval screen',['The chat message is approval','Any member can now send it','Use the payout approval screen'],'Chat is for the conversation.','Approval has its own step.','A group message never authorises a payout.','Designated approvers must review and authorise the request. Processing and confirmation still follow.']
 ],
 [
  ['bundle','Three tiny top-ups or one bundle. Compare?','Price and what I will actually use',['Only choose the biggest bundle','Price and what I will actually use','Ignore the expiry date'],'Make the bundle fit your week.','Useful beats bigger.','A larger bundle only helps if the price, expiry and allowance fit your needs.','Compare the full price and expiry before buying. An unused bargain still costs money.'],
  ['balance','Your box holds GH¢60. Free to spend again?','No, it already has a purpose',['Yes, add it to Everyday too','No, it already has a purpose','Count it twice until withdrawal'],'One amount. One place.','Give each cedi one job.','Money set aside is still yours, but it is not extra Everyday spending money.','Look at Everyday and your plan before spending. Moving money between your own pots does not create income.']
 ]
];
function campusMoments(round){return CAMPUS_MOMENTS[round%CAMPUS_MOMENTS.length].map(([id,prompt,correct,options,title,value,body,lesson])=>({id,kind:'practice',prompt,subtext:'A campus money moment',...choices(options,correct,id),reveal:{title,value,body,lesson}}));}
const rotation=key=>[...key].reduce((n,c)=>n+c.charCodeAt(0),0)%3;
function choices(values,correctValue,key){const shift=rotation(key),options=[...values];options.push(...options.splice(0,shift));return {options,correct:options.indexOf(correctValue)};}
function numericOptions(value,key,{count=false}={}){
 const gap=count?Math.max(1,Math.ceil(value/3)):Math.max(500,Math.round(value/3000)*1000),lower=Math.max(0,value-gap),upper=value+gap,values=[lower,value,upper];
 if(new Set(values).size<3)values[0]=value+gap*2;
 const labels=values.map(v=>count?`${v} payment${v===1?'':'s'}`:money(v));return choices(labels,count?`${value} payment${value===1?'':'s'}`:money(value),key);
}
function makeQuestions(e,mode,period,round=0){
 const c=e.current,p=e.previous,sample=mode==='example',source=sample?'Sample week · fictional amounts':'Your recorded week · confirmed payments only',hasData=c.dataCount>0,value=hasData?c.data:c.total,label=hasData?'data':'confirmed spending';
 const activityRoute=(name='')=>({section:'activity',page:'home',filter:'out',filters:{query:'',direction:'out',status:'success',category:name,from:period.start.slice(0,10),to:period.end.slice(0,10),asOf:period.asOf}});
 const dataCategory=c.categories.find(g=>g.name.toLowerCase()==='data')?.name||'Data';
 const primary={title:'Here’s the reveal.',value:money(value),body:hasData?`${money(value)} went on data this week.`:`${money(value)} is your recorded spending this week.`,lesson:hasData?`${c.dataCount===1?'One data payment':`${c.dataCount} data payments`} made up that total. Small top-ups can add up.`:'A few separate payments can look different when you see the total.',route:activityRoute(hasData?dataCategory:'')};
 const first={id:'spending',kind:'spending',prompt:hasData?'What did data cost this week?':'What did spending cost this week?',subtext:source,...(sample&&round===0?{options:[money(3000),money(5000),money(8000)],correct:1}:numericOptions(value,'spending')),reveal:primary};
 const top=c.categories[0],ties=c.categories.filter(x=>x.amount===top.amount).length;
 let second;
 if(ties===1){
  const alternatives=[...c.categories.slice(1).map(x=>x.name),...['Food','Transport','Data','Essentials','Other']].filter((v,i,a)=>v.toLowerCase()!==top.name.toLowerCase()&&a.findIndex(x=>x.toLowerCase()===v.toLowerCase())===i).slice(0,2);
  second={id:'category',kind:'category',prompt:'Which category took the biggest slice?',subtext:source,...choices([top.name,...alternatives],top.name,'category'),reveal:{title:'The big picture.',value:top.name,body:`${money(top.amount)} of your ${money(c.total)} recorded spending.`,lesson:'Seeing the biggest category helps you decide what deserves a closer look. No judgement here.',route:activityRoute(top.name)}};
 }else second={id:'category',kind:'spending',prompt:`What did ${top.name.toLowerCase()} cost this week?`,subtext:source,...numericOptions(top.amount,'category'),reveal:{title:'Here’s that slice.',value:money(top.amount),body:`That is the recorded ${top.name.toLowerCase()} total.`,lesson:'Categories show where payments added up. A tie for the biggest category is still useful to notice.',route:activityRoute(top.name)}};
 const third={id:'count',kind:'count',prompt:'How many payments made your week?',subtext:sample?'Count the sample’s confirmed payments':'Count confirmed spending, including card purchases',...numericOptions(c.count,'count',{count:true}),reveal:{title:'One move at a time.',value:`${c.count} payments`,body:`Together, they came to ${money(c.total)}.`,lesson:'This counts confirmed personal spending only. Pending, failed and reversed payments are left out.',route:activityRoute()}};
 const [fourth,fifth]=campusMoments(round);
 const previous=hasData?p.data:p.total,comparison={current:value,previous,currentLabel:'This week so far',previousLabel:'Same point last week'};
 const difference=value-previous,hasComparison=p.count>0,body=hasComparison?(difference===0?'The same recorded cost as this point last week.':`${money(Math.abs(difference))} ${difference>0?'more':'less'} than this point last week.`):'No earlier spending recorded to compare yet.';
 const recap={eyebrow:hasData?'DATA THIS WEEK':'RECORDED SPENDING',title:'Your week, decoded.',value:money(value),body,lesson:hasData?'Before your next top-up, compare a bundle with what you actually use. Check its price and expiry.':'Before your next week, check the essentials and keep a little back if you can. Plan with money already received.',...(hasComparison?{comparison}:{}),route:activityRoute(hasData?dataCategory:''),routeLabel:hasData?'See my data spending':'See my spending'};
 return {questions:[first,second,third,fourth,fifth],recap};
}
function isStale(s,r){return r.mode==='actual'&&evidence(s,r.period).sourceKey!==r.sourceKey;}
function availability(s,now){
 if(!personal(s))return {actualAvailable:false,availabilityReason:s.account?.privacy?.personalisation===false?'Personalised learning is off. Your student example is ready.':'Choose personalised learning to play with your own recorded week.'};
 const e=evidence(s,periodOf(now));
 return e.current&&e.previous&&e.current.count>=2?{actualAvailable:true,availabilityReason:''}:{actualAvailable:false,availabilityReason:'Your week needs at least two confirmed spending records. Try the student example while your activity builds.'};
}
function snapshotInsight(info,period){
 const result=clone(info);
 if(result.route?.section==='activity')result.route={...result.route,filters:{...(result.route.filters||{}),asOf:period.asOf}};
 return result;
}
function viewSession(s,r){
 const stale=isStale(s,r),q=r.questions[r.index],a=r.answers[r.index],reveal=r.status!=='question'&&!stale?{...snapshotInsight(q.reveal,r.period),title:a?.option===q.correct?'You spotted it.':q.reveal.title,correct:a?.option===q.correct,correctIndex:q.correct,selected:a?.option}:null;
 return {id:r.id,mode:r.mode,status:stale?'stale':r.status,index:r.index,number:r.index+1,total:5,period:clone(r.period),startedAt:r.startedAt,completedAt:r.completedAt||'',question:{id:q.id,prompt:q.prompt,subtext:q.subtext,kind:q.kind,options:[...q.options]},selected:a?.option??null,reveal,recap:r.status==='completed'&&!stale?snapshotInsight(r.recap,r.period):null,pointsEarned:r.pointsEarned,staleMessage:stale?'A recorded payment changed since this round started. Start a fresh round for the updated figures.':'',sourceLabel:r.mode==='example'?'Sample week · fictional amounts':`Recorded Lumo activity · ${r.period.label} · as of ${new Date(r.period.end).toLocaleTimeString('en-GH',{hour:'2-digit',minute:'2-digit',hour12:false,timeZone:'UTC'})} UTC`,replayed:r.pointsEarned===0&&r.status==='completed'};
}
export function getMoneyIQ(s,o={}){
 const now=nowOf(o),q=storeOf(s),allowed=personal(s),sessions=q.sessions.filter(r=>r.mode!=='actual'||allowed),active=[...sessions].reverse().find(r=>r.status!=='completed'&&!isStale(s,r)),last=sessions.at(-1),requested=o.sessionId?sessions.find(r=>r.id===o.sessionId):null,weekKey=weekOf(now),awards=Array.isArray(s.learning?.awards)?s.learning.awards:[],completedThisWeek=awards.some(a=>a.key===`money-iq:${weekKey}`),earned=awards.filter(a=>a.week===weekKey).reduce((n,a)=>n+(amount(a.points)?a.points:0),0);
 return {personalised:allowed,personalAllowed:allowed,...availability(s,now),period:periodOf(now),weekKey,activeSessionId:active?.id||'',lastSessionId:last?.id||'',completedThisWeek,pointsAvailable:completedThisWeek?0:Math.max(0,Math.min(XP,WEEKLY_CAP-earned)),recoveryNotice:q.recoveryNotice,session:requested?viewSession(s,requested):null};
}
function awardCompletion(s,r,now){
 const l=s.learning,week=weekOf(now),key=`money-iq:${week}`;
 if(l.awards.some(a=>a.key===key))return {points:0,duplicate:true};
 const earned=l.awards.filter(a=>a.week===week).reduce((n,a)=>n+(amount(a.points)?a.points:0),0),points=Math.max(0,Math.min(XP,WEEKLY_CAP-earned));
 const activity={id:uid(),key,type:'money-iq',title:'Money IQ weekly discovery',points,mode:r.mode,at:now.toISOString(),week,participation:true};
 l.awards.push(activity);l.activities.unshift({...activity});l.points+=points;r.pointsEarned=points;r.rewardWeek=week;
 return {points,duplicate:false};
}
export function handleMoneyIQAction(s,type,p={},o={}){
 if(!MONEY_IQ_ACTIONS.has(type))return null;
 ensureMoneyIQState(s);
 if(s.account?.signedOut||s.account?.status==='closed')return fail('Return to your active Lumo account before playing.');
 const now=nowOf(o),store=s.learning.moneyIQ;
 if(type==='moneyIQStart'){
  if(!['actual','example'].includes(p.mode))return fail('Choose your recorded week or a student example.');
  const available=availability(s,now);if(p.mode==='actual'&&!available.actualAvailable)return fail(available.availabilityReason);
  const existing=[...store.sessions].reverse().find(r=>r.mode===p.mode&&r.week===weekOf(now)&&r.status!=='completed'&&!isStale(s,r));
  if(existing)return ok('Your week is right where you left it.',{sessionId:existing.id,duplicate:true});
  const completed=[...store.sessions].reverse().find(r=>r.mode===p.mode&&r.week===weekOf(now)&&r.status==='completed'&&!isStale(s,r));
  if(completed&&!p.replay)return ok('Your weekly reveal is here.',{sessionId:completed.id,duplicate:true,completed:true});
  const round=store.sessions.filter(r=>r.mode===p.mode&&r.status==='completed').length,period=periodOf(now),e=p.mode==='example'?sampleEvidence(round):evidence(s,period),built=makeQuestions(e,p.mode,period,round),r={id:uid(),mode:p.mode,week:weekOf(now),period,status:'question',index:0,startedAt:now.toISOString(),answers:[],questions:built.questions,recap:built.recap,sourceKey:e.sourceKey,pointsEarned:0};
  store.sessions.push(r);if(store.sessions.length>MAX_SESSIONS)store.sessions.splice(0,store.sessions.length-MAX_SESSIONS);
  return ok('Let’s play your week.',{sessionId:r.id});
 }
 const r=store.sessions.find(r=>r.id===p.sessionId);if(!r)return fail('Open this Money IQ round again before continuing.');
 if(r.mode==='actual'&&!personal(s))return fail('Personalised learning is off. Try a student example.');
 if(isStale(s,r))return fail('A recorded payment changed. Start a fresh round for updated figures.');
 const q=r.questions[r.index];
 if(type==='moneyIQComplete'){
  if(r.status==='completed')return ok('Your weekly discovery is already saved.',{sessionId:r.id,completed:true,duplicate:true,points:0});
  if(r.index!==4||r.status!=='reveal'||r.answers.length!==5)return fail('Explore all five reveals before finishing.');
  r.status='completed';r.completedAt=now.toISOString();return ok('Your week, decoded.',{sessionId:r.id,completed:true,...awardCompletion(s,r,now)});
 }
 if(!identifier(p.questionId))return fail('Continue from the current Money IQ question.');
 const answered=r.answers.find(a=>a.questionId===p.questionId);
 if(type==='moneyIQAnswer'){
  if(!Number.isInteger(p.option)||p.option<0||p.option>2)return fail('Choose one of the three guesses shown.');
  if(answered)return answered.option===p.option?ok('That guess is already saved.',{sessionId:r.id,duplicate:true}):fail('That reveal is already saved. Continue to the next question.');
  if(r.status!=='question'||q.id!==p.questionId)return fail('Continue from the current Money IQ question.');
  r.answers.push({questionId:q.id,option:p.option,at:now.toISOString()});r.status='reveal';return ok('Here’s the reveal.',{sessionId:r.id});
 }
 if(type==='moneyIQNext'){
  const prior=r.questions.findIndex(v=>v.id===p.questionId);
  if(prior>=0&&prior<r.index)return ok('The next question is already open.',{sessionId:r.id,duplicate:true});
  if(r.status!=='reveal'||q.id!==p.questionId)return fail('See this reveal before moving on.');
  if(r.index===4)return fail('Finish this round to see your weekly insight.');
  r.index++;r.status='question';return ok('Your next money clue.',{sessionId:r.id});
 }
 return fail('Choose a Money IQ action from this round.');
}
