/** Private browser-local learning. This module never mutates financial records. */
import {getCampusGame,validGameState} from './learning-game-model.js';
import {LEARNING_GOALS,LEARNING_TOPICS,LEARNING_LESSONS,LESSON_BY_ID} from './learning-content.js';
export {LEARNING_GOALS,LEARNING_TOPICS,LEARNING_LESSONS} from './learning-content.js';
export const LEARNING_ACTIONS=new Set(['learningEnroll','learningPreferences','learningStartLesson','learningAnswer','learningStartPractice','learningAnswerPractice','learningCompletePractice','learningGraceWeek','learningDismissNudge']);
const DAY=86400000,REVIEW_DELAY=7*DAY,WEEKLY_XP_CAP=100;
const clone=v=>JSON.parse(JSON.stringify(v)), object=v=>v&&typeof v==='object'&&!Array.isArray(v), cents=v=>Number.isSafeInteger(v)&&v>=0?v:0;
const ok=(message,rest={})=>({ok:true,message,...rest}),fail=message=>({ok:false,message});
const nowOf=options=>{const value=typeof options?.now==='function'?options.now():options?.now;const d=value?new Date(value):new Date();return Number.isFinite(d.getTime())?d:new Date();};
const iso=d=>d.toISOString(),date=d=>iso(d).slice(0,10),id=prefix=>`${prefix}-${globalThis.crypto?.randomUUID?.()||`${Date.now()}-${Math.random().toString(36).slice(2)}`}`;
const weekOf=d=>{const value=new Date(`${date(d)}T12:00:00Z`);value.setUTCDate(value.getUTCDate()-(value.getUTCDay()+6)%7);return date(value);};
const weeksBetween=(a,b)=>Math.round((new Date(`${a}T12:00:00Z`)-new Date(`${b}T12:00:00Z`))/(7*DAY));
const money=v=>`GH₵${(cents(v)/100).toLocaleString('en-GH',{minimumFractionDigits:2,maximumFractionDigits:2})}`;
const clean=v=>String(v||'').trim().slice(0,120);
const blank=()=>({schema:1,enrolled:false,goal:'allowance',personalised:false,points:0,awards:[],activities:[],sessions:[],lessonProgress:{},events:[],dismissed:[],graceWeeks:[]});
const stateOf=s=>validLearningState(s)&&s.learning?s.learning:blank();
export function ensureLearningState(s){if(s.learning===undefined)s.learning=blank();else if(!validLearningState(s)){s.learning=blank();s.learning.recoveryNotice='Saved learning progress could not be opened. Choose your learning goal to begin again. Your money records are unchanged.';}return s;}
export function validLearningState(s){const l=s.learning;return l===undefined||object(l)&&l.schema===1&&typeof l.enrolled==='boolean'&&typeof l.personalised==='boolean'&&LEARNING_GOALS.some(g=>g.id===l.goal)&&Number.isSafeInteger(l.points)&&l.points>=0&&['awards','activities','sessions','events','dismissed','graceWeeks'].every(k=>Array.isArray(l[k]))&&object(l.lessonProgress)&&Object.values(l.lessonProgress).every(v=>object(v)&&(!v.completedAt||Number.isFinite(Date.parse(v.completedAt)))&&(!v.retainedAt||Number.isFinite(Date.parse(v.retainedAt))))&&l.sessions.every(x=>object(x)&&typeof x.id==='string'&&['lesson','practice'].includes(x.type)&&['actual','example'].includes(x.mode)&&['question','answered','completed'].includes(x.status)&&Number.isFinite(Date.parse(x.startedAt))&&(x.type!=='practice'||object(x.template)&&Array.isArray(x.template.options)&&Array.isArray(x.template.reflectionOptions)));}
const personal=s=>stateOf(s).enrolled&&stateOf(s).personalised&&s.account?.privacy?.personalisation!==false;
function purgePersonal(l){l.sessions=l.sessions.filter(s=>s.mode!=='actual');l.events=[];l.dismissed=[];}
function safeSummary(s,o){
 const supplied=o?.summary||(typeof o?.getSummary==='function'?o.getSummary(s):null);
 if(supplied)return {available:cents(supplied.available),planned:cents(supplied.planned),spendable:cents(supplied.spendable),daysLeft:cents(supplied.daysLeft),dailyAllowance:cents(supplied.dailyAllowance)};
 // Read-only fallback for direct consumers. The app supplies its authoritative summary.
 const available=cents(s.wallet),planned=(s.budget?.items||[]).reduce((n,i)=>n+Math.max(0,cents(i.amount)-cents(i.spent)),0);
 const remainingCoverage=new Map((s.budget?.items||[]).map(i=>[i.id,Math.max(0,cents(i.amount)-cents(i.spent))]));
 let due=0;for(const i of s.ious||[]){if(i.type!=='owedByMe'||i.status!=='open'||i.due&&i.due>s.income?.nextDate)continue;const amount=Math.max(0,cents(i.amount)-cents(i.paid)),covered=Math.min(amount,remainingCoverage.get(i.budgetItemId)||0);remainingCoverage.set(i.budgetItemId,(remainingCoverage.get(i.budgetItemId)||0)-covered);due+=amount-covered;}
 const daysLeft=Math.max(0,Math.ceil((new Date(`${s.income?.nextDate||date(nowOf(o))}T12:00:00Z`)-new Date(`${date(nowOf(o))}T12:00:00Z`))/DAY));
 const spendable=Math.max(0,available-planned-due-cents(s.buffer));return {available,planned:planned+due,spendable,daysLeft,dailyAllowance:daysLeft?Math.floor(spendable/daysLeft):0};
}
function snapshot(s,o){const summary=safeSummary(s,o);return JSON.stringify({summary,buffer:cents(s.buffer),income:s.income,budget:s.budget,transactions:(s.transactions||[]).map(t=>[t.id,t.type,t.status,t.amount,t.fee,t.refunded,t.at]),ious:(s.ious||[]).map(i=>[i.id,i.type,i.status,i.amount,i.paid,i.due,i.budgetItemId]),boxes:(s.boxes||[]).map(b=>[b.id,b.balance,b.target,b.deadline,b.archived]),recovery:s.recovery?.active===true});}
function confirmedIncome(s,now){return (s.transactions||[]).filter(t=>t.type==='income'&&t.status==='success'&&t.direction==='in'&&t.rail!=='internal'&&cents(t.amount)>0&&Number.isFinite(Date.parse(t.at))&&Date.parse(t.at)<=now.getTime()).sort((a,b)=>b.at.localeCompare(a.at))[0];}
function hasOwnContext(s){return !!(s.budget?.created||(s.transactions||[]).some(t=>t.status==='success')||(s.ious||[]).length||(s.boxes||[]).length||s.wallet>0);}
function actualAllowed(s,kind,now){return personal(s)&&(kind==='incoming-plan'?!!confirmedIncome(s,now):hasOwnContext(s));}
function award(l,key,type,title,amount,mode,now){
 if(l.awards.some(a=>a.key===key))return {points:0,duplicate:true};
 const week=weekOf(now),earned=l.awards.filter(a=>a.week===week).reduce((n,a)=>n+a.points,0),points=Math.max(0,Math.min(amount,WEEKLY_XP_CAP-earned));
 const record={id:id('learning-activity'),key,type,title,points,mode,at:iso(now),week};l.awards.push(record);l.activities.unshift({...record});l.points+=points;return {points,duplicate:false};
}
function streakOf(l,now){
 const weekKey=weekOf(now),counts=new Map();for(const a of l.activities)counts.set(a.week,(counts.get(a.week)||0)+1);
 const complete=new Set([...counts].filter(([,n])=>n>=2).map(([w])=>w)),graces=new Set(l.graceWeeks),all=[...new Set([...complete,...graces])].sort();
 let longest=0,run=0,last='';for(const w of all){if(last&&weeksBetween(w,last)!==1)run=0;if(complete.has(w))run++;longest=Math.max(longest,run);last=w;}
 let current=0,w=weekKey,first=true;
 for(let i=0;i<520;i++){if(complete.has(w))current++;else if(!graces.has(w)&&!(first&&!complete.has(w)))break;first=false;w=date(new Date(new Date(`${w}T12:00:00Z`).getTime()-7*DAY));}
 const thisWeekActivities=counts.get(weekKey)||0,graceAvailable=!l.graceWeeks.some(w=>weeksBetween(weekKey,w)>=0&&weeksBetween(weekKey,w)<4);
 return {current,weeks:current,longest,thisWeekActivities,currentActivities:thisWeekActivities,target:2,required:2,weekKey,completed:thisWeekActivities>=2,graceAvailable,graceActive:graces.has(weekKey)};
}
function storyPracticeTopics(l){
 if(!validGameState({learning:l}))return new Set();
 const topics=new Set();
 for(const mission of getCampusGame({learning:l}).missions.filter(m=>m.completed&&m.bestStars===3)){topics.add(mission.topicId);if(mission.id==='plot-twist-week')topics.add('saving');}
 return topics;
}
function topicProgress(l,topic,storyTopics=new Set()){const lessons=LEARNING_LESSONS.filter(x=>x.topicId===topic.id),completedLessons=lessons.filter(x=>l.lessonProgress[x.id]?.completedAt).length,retained=lessons.every(x=>l.lessonProgress[x.id]?.retainedAt),reviewPractice=l.activities.some(a=>a.type==='practice'&&(topic.id==='planning'||topic.id==='recovery'&&a.reflection==='income-late')),storyPractice=storyTopics.has(topic.id),practised=reviewPractice||storyPractice;
 return {...topic,lessons:lessons.map(x=>({id:x.id,title:x.title,completed:!!l.lessonProgress[x.id]?.completedAt})),lessonIds:lessons.map(x=>x.id),completedLessons,totalLessons:2,practiceSource:reviewPractice?'review':storyPractice?'story':'',understood:completedLessons===2,understanding:completedLessons===2?'Understood':completedLessons?'Building':'Ready to explore',retained,practised,application:practised?'Practised':'Try a practice',habit:topic.id==='planning'&&l.activities.filter(a=>a.type==='practice').length>=2?'Returning to it':'A little at a time'};}
function levelOf(topics,l){const understood=topics.filter(t=>t.understood).length,retained=topics.filter(t=>t.retained).length,practiceWeeks=new Set(l.activities.filter(a=>a.type==='practice').map(a=>a.week)).size;
 const levels=[{title:'Starting out',description:'Your money skills can grow from here.',next:'Complete both short lessons in one topic.'},{title:'Money Aware',description:'You have demonstrated understanding in a topic.',next:'Understand three topics and finish one practice.'},{title:'Money Planner',description:'You are connecting understanding with practice.',next:'Understand five topics and practise in two different weeks.'},{title:'Money Confident',description:'You are practising skills over time.',next:'Understand all six topics and complete later checks in three topics.'},{title:'Thinking Ahead',description:'You have demonstrated understanding, practice and recall.',next:'Keep revisiting your skills as life changes.'}];
 const number=understood>=6&&retained>=3&&practiceWeeks>=2?5:understood>=5&&practiceWeeks>=2?4:understood>=3&&practiceWeeks>=1?3:understood>=1?2:1;
 return {number,...levels[number-1],name:levels[number-1].title,progress:Math.min(100,Math.round(understood/6*100)),understoodTopics:understood,retainedTopics:retained};
}
export function getLearningDashboard(s,o={}){
 const l=stateOf(s),now=nowOf(o),storyTopics=storyPracticeTopics(l),topics=LEARNING_TOPICS.map(t=>topicProgress(l,t,storyTopics));
 const dueReviews=LEARNING_LESSONS.filter(x=>l.lessonProgress[x.id]?.completedAt&&!l.lessonProgress[x.id]?.retainedAt&&Date.parse(l.lessonProgress[x.id].completedAt)+REVIEW_DELAY<=now.getTime()).map(x=>({id:x.id,lessonId:x.id,title:x.title,topicId:x.topicId,dueAt:new Date(Date.parse(l.lessonProgress[x.id].completedAt)+REVIEW_DELAY).toISOString()}));
 const active=[...l.sessions].reverse().find(x=>x.type==='practice'&&x.status!=='completed'&&(x.mode!=='actual'||personal(s)));
 return {enrolled:l.enrolled,personalised:l.personalised,effectivePersonalised:personal(s),globalPersonalisation:s.account?.privacy?.personalisation!==false,recoveryNotice:l.recoveryNotice||'',goal:l.goal,goals:clone(LEARNING_GOALS),points:l.points,xp:l.points,weeklyPointsLimit:WEEKLY_XP_CAP,pointsThisWeek:l.awards.filter(a=>a.week===weekOf(now)).reduce((sum,a)=>sum+a.points,0),level:levelOf(topics,l),streak:streakOf(l,now),topics,lessons:LEARNING_LESSONS.map(x=>({id:x.id,topicId:x.topicId,title:x.title,minutes:x.minutes,completed:!!l.lessonProgress[x.id]?.completedAt})),dueReviews,activities:clone(l.activities.slice(0,40)),history:clone(l.activities.slice(0,40)),currentPracticeSessionId:active?.id||'',practices:[{id:'incoming-plan',title:'Give incoming money a plan',description:'Understand what is already committed, then review a plan that fits.',available:true,actualAvailable:actualAllowed(s,'incoming-plan',now)},{id:'weekly-review',title:'Your weekly money check',description:'What arrived, what went out, and what needs attention?',available:true,actualAvailable:actualAllowed(s,'weekly-review',now)}],nudge:getLearningNudge(s,o)};
}
export function getLearningLesson(s,lessonId,o={}){
 const lesson=LESSON_BY_ID.get(lessonId);if(!lesson)return null;
 const l=stateOf(s),now=nowOf(o),progress=l.lessonProgress[lessonId]||{},session=[...l.sessions].reverse().find(x=>x.type==='lesson'&&x.lessonId===lessonId),index=session?.variant??0,q=lesson.questions[index]||lesson.questions[0],reviewDueAt=progress.completedAt?new Date(Date.parse(progress.completedAt)+REVIEW_DELAY).toISOString():'';
 return {id:lesson.id,topicId:lesson.topicId,title:lesson.title,minutes:lesson.minutes,story:lesson.story,scene:lesson.scene?clone(lesson.scene):null,kicker:'A little money clarity',question:q.prompt,options:[...q.options],explanation:session?.selected!==undefined?q.explanation:'',sessionId:session?.id||'',status:session?.status||'ready',stage:session?.status||'ready',correct:session?.correct,selected:session?.selected,completed:!!progress.completedAt,retained:!!progress.retainedAt,review:session?.review===true,reviewDueAt,reviewAvailable:!!reviewDueAt&&Date.parse(reviewDueAt)<=now.getTime()&&!progress.retainedAt};
}
function practiceTemplate(s,kind,mode,o){
 const now=nowOf(o),actual=mode==='actual',summary=actual?safeSummary(s,o):{available:60000,planned:40000,spendable:15000,daysLeft:21,dailyAllowance:714},cushion=actual?cents(s.buffer):5000;
 const hasPlan=!actual||!!s.budget?.created&&(s.budget.items||[]).length>0;
 if(!hasPlan)summary.spendable=0;
 const amount=summary.spendable,options=hasPlan?[money(summary.available),money(amount),money(summary.planned)]:['Treat all available money as free to spend','Record the essentials this money needs to cover','Count the next allowance as already available'];let correct=1;
 // Even equal balances must yield one unambiguous choice.
 if(hasPlan&&options[0]===options[1])options[0]=money(amount+10000);
 if(hasPlan&&(options[2]===options[1]||options[2]===options[0]))options[2]=money(amount+5000);
 const shift=[...(o.seed||`${kind}:${weekOf(now)}`)].reduce((n,c)=>n+c.charCodeAt(0),0)%3;
 options.push(...options.splice(0,shift));correct=(correct-shift+3)%3;
 const incoming=actual?confirmedIncome(s,now):null,sourceId=incoming?.id||'';
 const movements=actual?(s.transactions||[]).filter(t=>t.status==='success'&&['income','payment','card-purchase'].includes(t.type)&&Date.parse(t.at)<=now.getTime()&&Date.parse(t.at)>=now.getTime()-7*DAY).map(t=>({id:t.id,title:t.merchant||'Money move',amount:Math.max(0,cents(t.amount)-(t.type==='card-purchase'?cents(t.refunded):0))+cents(t.fee),direction:t.direction})).slice(0,6):[{id:'example-in',title:'Sample allowance',amount:60000,direction:'in'},{id:'example-food',title:'Sample food payment',amount:2500,direction:'out'}];
 const upcoming=actual?(s.budget?.items||[]).filter(i=>i.due&&i.due<=date(new Date(now.getTime()+7*DAY))&&i.amount>i.spent).map(i=>({id:i.id,title:i.name,amount:i.amount-i.spent,due:i.due,overdue:i.due<date(now)})): [{id:'example-cost',title:'Sample study supplies',amount:4000,due:date(new Date(now.getTime()+3*DAY))}];
 const stats=hasPlan?[{label:actual?'Available in Everyday':'Sample available money',value:summary.available},{label:'Remaining commitments',value:summary.planned},{label:'Your cushion',value:cushion},{label:'Flexible money',value:summary.spendable}]:[{label:'Available in Everyday',value:summary.available},{label:'Your cushion',value:cushion}];
 return {kind,title:kind==='incoming-plan'?'Give this money a purpose.':'A little check-in. A clearer week.',description:kind==='incoming-plan'?'Look at confirmed money, essentials and your cushion before deciding what is flexible.':'Review what is recorded, then decide whether your plan still fits.',mode,sourceId,sourceLabel:actual?hasPlan?'Based on your recorded Lumo activity. Outside activity may need your input.':'Your essentials are not recorded yet. Create a plan before treating money as flexible.':'Example practice · These are sample amounts.',summary:{...summary,hasPlan,essentials:summary.planned,cushion,flexible:summary.spendable},stats,movements,upcoming,question:hasPlan?'After the recorded commitments and cushion, how much is flexible?':'Your essentials are not recorded yet. What is the useful next step?',options,correct,explanation:hasPlan?`${money(summary.spendable)} is flexible after the remaining plan and cushion. Expected income and unpaid incoming IOUs stay outside your available money.`:'Record the essentials this money needs to cover before deciding what is flexible. An available balance alone does not show all your commitments.',routes:actual?[{label:s.budget?.created?'Review my plan':'Create my plan',route:{section:'plan',page:'home'}},{label:'Allowance running late?',route:{section:'life',page:'recovery'}},{label:'All your money',route:{section:'life',page:'overview'}}]:[],reflectionOptions:actual?[...(hasPlan?[{id:'still-fits',label:'I checked. My plan still fits.'}]:[]),{id:'adjusted-plan',label:'I reviewed and saved an updated plan.'},{id:'income-late',label:'My expected income changed or is late.'},{id:'new-cost',label:'A new cost needs attention.'},{id:'outside-spend',label:'I have cash or other-bank activity to review.'}]:[{id:'example-reviewed',label:'I understand what I would review in this situation.'}]};
}
export function getLearningPractice(s,practiceId,o={}){
 const l=stateOf(s),session=l.sessions.find(x=>x.id===practiceId&&x.type==='practice')||[...l.sessions].reverse().find(x=>x.kind===practiceId&&x.type==='practice'&&x.status!=='completed'),kind=session?.kind||practiceId;
 if(!['incoming-plan','weekly-review'].includes(kind))return null;
 const actualAvailable=actualAllowed(s,kind,nowOf(o));
 if(!session){const preview=practiceTemplate(s,kind,'example',o);delete preview.correct;delete preview.explanation;return {...preview,id:kind,sessionId:'',status:'ready',actualAvailable};}
 if(session.mode==='actual'&&!personal(s))return {id:session.id,sessionId:session.id,kind,title:'Choose how to practise.',description:'Personalised learning is off. Example practice is always available.',status:'stale',mode:'example',actualAvailable:false,stats:[],options:[],routes:[],reflectionOptions:[],sourceLabel:'Personalisation is off.'};
 const liveKey=session.mode==='actual'?snapshot(s,o):'',sourceValid=session.kind!=='incoming-plan'||(s.transactions||[]).some(t=>t.id===session.template.sourceId&&t.type==='income'&&t.status==='success'&&t.direction==='in'&&t.rail!=='internal');
 const stale=session.status!=='completed'&&session.mode==='actual'&&(!sourceValid||liveKey!==(session.evidence?.snapshotKey||session.snapshotKey));
 const view=clone(session.template);delete view.correct;if(session.selected===undefined)delete view.explanation;
 if(session.mode==='actual'&&session.evidence&&!stale&&session.status==='answered'){
  const current=practiceTemplate(s,kind,'actual',o);for(const key of ['stats','summary','movements','upcoming'])view[key]=current[key];
  view.explanation='You answered using the earlier figures, then saved a change. Review the current amounts before finishing your reflection.';
  view.sourceLabel='Your plan has been updated. These amounts reflect the current recorded money.';
 }
 return {...view,id:session.id,sessionId:session.id,status:stale?'stale':session.status,correct:session.correct,selected:session.selected,reflection:session.reflection,completed:session.status==='completed',actualAvailable,evidence:!!session.evidence,updatedAfterAnswer:!!session.evidence};
}
export function getLearningNudge(s,o={}){
 const l=stateOf(s);if(!l.enrolled)return null;const now=nowOf(o),week=weekOf(now),dismissed=new Set(l.dismissed);
 const make=(eventId,topicId,title,body,why,page,id)=>dismissed.has(eventId)||o.topic&&o.topic!==topicId?null:{id:eventId,eventId,topicId,title,body,why,sourceLabel:why,route:{section:'learn',page,id},action:{label:page==='practice'?'Try it with Lux':'Explore with Lux',route:{section:'learn',page,id}}};
 if(personal(s)){
  const income=confirmedIncome(s,now),due=(s.budget?.items||[]).find(i=>i.amount>i.spent&&i.due&&i.due<=date(new Date(now.getTime()+7*DAY)));
  if(s.recovery?.active){const n=make(`recovery:${s.recovery.startedAt||week}`,'recovery','When plans change.','A short practice can help you review the next step.','Based on your active recovery plan.','lesson','recovery-essentials');if(n)return n;}
  if((l.goal==='upcoming'||o.topic==='upcoming')&&due){const n=make(`upcoming:${due.id}:${due.due}`,'upcoming','A little ahead of that date.','Work backwards from a cost coming up soon.','Based on a recorded commitment due soon or still needing attention.','lesson','upcoming-deadline');if(n)return n;}
  if(l.goal==='safety'||o.topic==='safety'){const payment=(s.transactions||[]).find(t=>t.type==='payment'&&['success','pending'].includes(t.status));if(payment){const pending=payment.status==='pending',n=make(`safety:${payment.id}:${payment.status}`,'safety',pending?'A result worth checking.':'A little payment confidence.',pending?'Practise checking the same payment reference before trying again.':'Practise checking the person and result.',pending?'Based on a recorded payment awaiting its final result.':'Based on a completed payment in your Lumo ledger.','lesson',pending?'safety-result':'safety-recipient');if(n)return n;}}
  if((l.goal==='saving'||o.topic==='saving')&&(s.boxes||[]).length){const b=s.boxes.find(x=>!x.archived);if(b){const n=make(`saving:${b.id}`,'saving','Your goal. Your pace.','Explore a saving pace that protects your essentials.','Based on a Money Box you have recorded.','lesson','saving-rules');if(n)return n;}}
  if(income){const n=make(`income:${income.id}`,'planning','Your money has arrived.','What does it need to cover before the next one?','Based on confirmed incoming money in your Lumo ledger.','practice','incoming-plan');if(n)return n;}
  const iou=(s.ious||[]).find(i=>i.type==='owedToMe'&&i.status==='open');if(iou){const n=make(`iou:${iou.id}`,'expected','Money on the way.','Keep expected repayments separate from today’s money.','Based on an unpaid incoming IOU you recorded.','lesson','expected-promises');if(n)return n;}
  if(due){const n=make(`upcoming:${due.id}:${due.due}`,'upcoming','A date worth a little planning.','Break down an upcoming cost before it is due.','Based on a recorded commitment due in the next seven days.','lesson','upcoming-deadline');if(n)return n;}
 }
 if(!l.awards.some(a=>a.key===`practice:weekly-review:${week}`))return make(`weekly:${week}`,'planning','Your weekly money check.','A few minutes to understand and review your week.','A weekly learning invitation. You can use an example.','practice','weekly-review');
 return make('next-lesson:planning','planning','A little more money clarity.','Pick a short topic and keep building your skills.','Based on your learning progress.','lesson','planning-allowance');
}
export function handleLearningAction(s,type,p={},helpers={}){
 if(!LEARNING_ACTIONS.has(type))return null;ensureLearningState(s);if(!validLearningState(s))return fail('Your saved learning needs attention. Your money records have not changed.');
 const l=s.learning,now=nowOf(helpers),options={...helpers,summary:typeof helpers.getSummary==='function'?helpers.getSummary(s):helpers.summary,now};
 if(type==='learningEnroll'){
  if(!LEARNING_GOALS.some(g=>g.id===p.goal)||typeof p.personalised!=='boolean')return fail('Choose one learning goal and how you would like to practise.');
  if(p.personalised&&s.account?.privacy?.personalisation===false)return fail('Personalisation is off in Privacy choices. You can use example practice or change that preference first.');
  l.enrolled=true;l.goal=p.goal;l.personalised=p.personalised;l.enrolledAt ||= iso(now);if(!l.personalised)purgePersonal(l);return ok('Your learning starts here.');
 }
 if(!l.enrolled)return fail('Choose your learning goal first.');
 if(type==='learningPreferences'){
  if(p.goal!==undefined&&!LEARNING_GOALS.some(g=>g.id===p.goal)||p.personalised!==undefined&&typeof p.personalised!=='boolean')return fail('Choose a valid learning preference.');
  if(p.personalised===true&&s.account?.privacy?.personalisation===false)return fail('Personalisation is off in Privacy choices. Example practice remains available.');
  if(p.goal!==undefined)l.goal=p.goal;if(p.personalised!==undefined)l.personalised=p.personalised;if(!l.personalised)purgePersonal(l);return ok('Your learning preferences are saved.');
 }
 if(type==='learningDismissNudge'){const eventId=clean(p.eventId);if(!eventId)return fail('Choose a learning invitation.');if(!l.dismissed.includes(eventId))l.dismissed.push(eventId);return ok('Invitation tucked away.');}
 if(type==='learningGraceWeek'){const streak=streakOf(l,now);if(streak.graceActive)return ok('This week already has a little breathing room.',{duplicate:true});if(!streak.graceAvailable)return fail('Your grace week is available once every four weeks. Your completed learning is always kept.');l.graceWeeks.push(streak.weekKey);return ok('A little breathing room this week. Your completed learning stays yours.');}
 if(type==='learningStartLesson'){
  const lesson=LESSON_BY_ID.get(p.lessonId);if(!lesson)return fail('Choose a lesson from your learning page.');
  const progress=l.lessonProgress[lesson.id]||{};
  if(p.review&&(!progress.completedAt||Date.parse(progress.completedAt)+REVIEW_DELAY>now.getTime()))return fail('This later check opens seven days after your first completion.');
  if(p.review&&progress.retainedAt)return fail('This later check is already complete. You can revisit the lesson without extra points.');
  const existing=[...l.sessions].reverse().find(x=>x.type==='lesson'&&x.lessonId===lesson.id&&x.review===!!p.review&&x.status==='question');if(existing)return ok('Your lesson is ready.',{sessionId:existing.id,lessonId:lesson.id,duplicate:true});
  const session={id:id('learning-session'),type:'lesson',mode:'example',lessonId:lesson.id,topicId:lesson.topicId,review:!!p.review,variant:p.review?1:0,status:'question',startedAt:iso(now),attempts:0};l.sessions.push(session);return ok('A little money clarity.',{sessionId:session.id,lessonId:lesson.id});
 }
 if(type==='learningAnswer'){
  const session=l.sessions.find(x=>x.id===p.sessionId&&x.type==='lesson');if(!session)return fail('Open this lesson again before answering.');
  if(session.status==='completed')return ok('You already completed this question.',{correct:true,duplicate:true,points:0});
  const lesson=LESSON_BY_ID.get(session.lessonId),q=lesson?.questions[session.variant];if(!q||!Number.isInteger(p.option)||p.option<0||p.option>=q.options.length)return fail('Choose one of the answers shown.');
  session.selected=p.option;session.correct=p.option===q.correct;session.attempts++;session.answeredAt=iso(now);
  if(!session.correct)return ok(q.explanation,{correct:false,points:0});
  const progress=l.lessonProgress[lesson.id] ||= {};progress.completedAt ||= iso(now);if(session.review)progress.retainedAt ||= iso(now);session.status='completed';
  const earned=award(l,`${session.review?'retention':'lesson'}:${lesson.id}`,session.review?'retention':'lesson',`${session.review?'Later check':'Lesson'}: ${lesson.title}`,session.review?15:10,'example',now);
  return ok(q.explanation,{correct:true,...earned});
 }
 if(type==='learningStartPractice'){
  if(!['incoming-plan','weekly-review'].includes(p.kind)||!['actual','example'].includes(p.mode))return fail('Choose a practice and whether to use your money or an example.');
  if(p.mode==='actual'&&!actualAllowed(s,p.kind,now))return fail(personal(s)?'There is no confirmed activity for this practice yet. Try the example.':'Choose personalised learning first, or use the example.');
  const sessionId=id('learning-practice'),template=practiceTemplate(s,p.kind,p.mode,{...options,seed:sessionId}),key=p.mode==='actual'?snapshot(s,options):'';
  const existing=[...l.sessions].reverse().find(x=>x.type==='practice'&&x.kind===p.kind&&x.mode===p.mode&&x.status!=='completed'&&x.snapshotKey===key);if(existing)return ok('Your practice is ready.',{sessionId:existing.id,duplicate:true});
  const session={id:sessionId,type:'practice',kind:p.kind,mode:p.mode,status:'question',startedAt:iso(now),week:weekOf(now),snapshotKey:key,template,attempts:0};l.sessions.push(session);return ok('Try it with Lux.',{sessionId:session.id});
 }
 const session=l.sessions.find(x=>x.id===p.sessionId&&x.type==='practice');if(!session)return fail('Open the practice again before continuing.');
 if(session.status==='completed')return ok('This practice is already recorded.',{duplicate:true,points:0,completed:true});
 if(session.mode==='actual'&&!personal(s))return fail('Personalised learning is off. You can continue with an example.');
 if(session.mode==='actual'&&session.kind==='incoming-plan'&&!((s.transactions||[]).some(t=>t.id===session.template.sourceId&&t.type==='income'&&t.status==='success'&&t.direction==='in'&&t.rail!=='internal')))return fail('That incoming money no longer has a confirmed result. Start again with current records or an example.');
 if(session.mode==='actual'&&snapshot(s,options)!==(session.evidence?.snapshotKey||session.snapshotKey))return fail('Your recorded money changed. Start this practice again so the numbers are current.');
 if(type==='learningAnswerPractice'){
  if(!Number.isInteger(p.option)||p.option<0||p.option>=session.template.options.length)return fail('Choose one of the answers shown.');
  session.selected=p.option;session.correct=p.option===session.template.correct;session.attempts++;if(session.correct)session.status='answered';return ok(session.template.explanation,{correct:session.correct,points:0});
 }
 if(type==='learningCompletePractice'){
  if(!session.correct||session.status!=='answered')return fail('Complete the short question before your reflection.');
  const allowed=session.template.reflectionOptions.map(x=>x.id);if(!allowed.includes(p.reflection))return fail('Choose what you noticed in this review.');
  if(session.mode==='actual'&&p.reflection==='adjusted-plan'&&session.evidence?.type!=='plan-reviewed')return fail('Save a plan update first, or choose the reflection that fits what you actually reviewed.');
  session.status='completed';session.reflection=p.reflection;session.completedAt=iso(now);
  const earned=award(l,`practice:${session.kind}:${weekOf(now)}`,'practice',session.kind==='weekly-review'?'Weekly money check':'Incoming money practice',session.kind==='weekly-review'?20:15,session.mode,now);
  if(!earned.duplicate){const activity=l.activities[0];activity.reflection=p.reflection;activity.application='reviewed';}
  return ok('You checked, understood and reviewed a next step. That is useful progress.',{completed:true,...earned});
 }
 return fail('Choose a learning action from your learning page.');
}
/** Record contextual opportunities, never reward money amounts or transactions. */
export function syncLearningAfterMoneyAction(s,type,p,result,helpers={}){
 if(!result?.ok||!s.learning?.enrolled)return;
 const l=s.learning;if(!personal(s)){purgePersonal(l);return;}
 const now=nowOf(helpers),funding=(s.fundingAttempts||[]).find(x=>x.id===(result.id||p.id||p.fundingId));
 const t=result.transaction||(s.transactions||[]).find(x=>x.id===(result.transactionId||result.attempt?.transactionId||funding?.transactionId||result.id||p.transactionId||p.id));
 let topicId,eventType,sourceId;
 if(t?.type==='income'&&t.status==='success'&&t.direction==='in'&&t.rail!=='internal'){topicId='planning';eventType='confirmed-income';sourceId=t.id;}
 else if(['createBudget','updateBudget','startBudgetPeriod','reuseBudgetPeriod'].includes(type)){topicId='planning';eventType='plan-reviewed';sourceId=s.budget?.periodId;}
 else if(['recoveryPlan','createRecovery','completeRecovery'].includes(type)){topicId='recovery';eventType='recovery-reviewed';sourceId=s.recovery?.startedAt||date(now);}
 else if(type==='createBox'){topicId='saving';eventType='box-created';sourceId=result.id;}
 else if(['createIOU','updateIOU'].includes(type)){topicId='expected';eventType='iou-recorded';sourceId=result.id;}
 else if(t?.type==='payment'&&t.status==='success'){topicId='safety';eventType='payment-confirmed';sourceId=t.id;}
 if(eventType&&sourceId){const key=`${eventType}:${sourceId}`;if(!l.events.some(e=>e.id===key))l.events.unshift({id:key,type:eventType,topicId,sourceId,at:iso(now)});l.events=l.events.slice(0,30);}
 if(['plan-reviewed','recovery-reviewed'].includes(eventType))for(const session of l.sessions.filter(x=>x.type==='practice'&&x.mode==='actual'&&x.status==='answered'))session.evidence={type:eventType,at:iso(now),snapshotKey:snapshot(s,{...helpers,now})};
}
