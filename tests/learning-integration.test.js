import test from 'node:test';
import assert from 'node:assert/strict';
import {createDemoState,createEmptyState,applyAction,getSummary,validStoredState,migrateState} from '../dist/js/model.js';
import {createPersistence} from '../dist/js/persistence.js';
import {commitAction} from '../dist/js/state-boundary.js';
import {getLearningDashboard,getLearningLesson,getLearningPractice,getLearningNudge} from '../dist/js/learning-model.js';
import {LEARNING_LESSONS} from '../dist/js/learning-content.js';

const must=result=>{assert.equal(result.ok,true,result.message);return result;};
const act=(s,type,p={})=>applyAction(s,type,p);
const financial=s=>structuredClone(Object.fromEntries(['wallet','buffer','income','budget','boxes','transactions','ious','groups','virtualCards','externalBalances','profile'].map(k=>[k,s[k]])));
const options=s=>({summary:getSummary(s),now:new Date()});
function atTime(time,fn){const RealDate=globalThis.Date;globalThis.Date=class extends RealDate{constructor(...args){super(...(args.length?args:[time]));}static now(){return new RealDate(time).getTime();}};try{return fn();}finally{globalThis.Date=RealDate;}}
function enroll(s,personalised=true){return must(act(s,'learningEnroll',{goal:'allowance',personalised}));}
function lesson(s,id='planning-allowance',review=false){const started=must(act(s,'learningStartLesson',{lessonId:id,review}));const content=LEARNING_LESSONS.find(x=>x.id===id);return {started,result:must(act(s,'learningAnswer',{sessionId:started.sessionId,option:content.questions[review?1:0].correct}))};}
function answerPractice(s,sessionId){const view=getLearningPractice(s,sessionId,options(s)),expected=view.mode==='actual'?getSummary(s).spendable:15000,target=`GH₵${(expected/100).toLocaleString('en-GH',{minimumFractionDigits:2,maximumFractionDigits:2})}`,option=view.options.indexOf(target);assert.ok(option>=0,'The exercise offers the correct flexible amount.');return must(act(s,'learningAnswerPractice',{sessionId,option}));}
function practice(s,kind='weekly-review',mode='example',reflection=mode==='actual'?'still-fits':'example-reviewed'){
 const started=must(act(s,'learningStartPractice',{kind,mode}));
 answerPractice(s,started.sessionId);
 return {started,result:must(act(s,'learningCompletePractice',{sessionId:started.sessionId,reflection}))};
}
function durable(){
 const data=new Map();let failWrite=false;
 const storage={getItem:k=>data.get(k)??null,setItem:(k,v)=>{if(failWrite&&k==='learning-review')throw new Error('Quota');data.set(k,v);},removeItem:k=>data.delete(k)};
 const state=createDemoState(),controller=createPersistence({storage,key:'learning-review',empty:()=>state,validate:validStoredState,migrate:migrateState});must(controller.load());
 return {state,storage,controller,act:(type,p)=>commitAction({state,type,payload:p,apply:applyAction,persistence:controller}),setFail:value=>{failWrite=value;}};
}

test('learning, example practice and weekly reflection never mutate any financial record',()=>atTime('2026-11-04T12:00:00Z',()=>{
 const s=createDemoState(),before=financial(s);enroll(s,false);lesson(s);practice(s);
 assert.deepEqual(financial(s),before);assert.equal(getLearningDashboard(s,options(s)).points,30);
 assert.equal(getLearningDashboard(s,options(s)).streak.completed,true);
}));

test('confirmed money triggers learning opportunities without awarding points for amounts or payments',()=>atTime('2026-11-04T12:00:00Z',()=>{
 for(const amount of [100,100000]){
  const s=createDemoState();enroll(s);must(act(s,'fund',{amount,source:'Confirmed sample allowance',rail:'momo'}));
  assert.equal(s.learning.points,0);assert.ok(s.learning.events.some(e=>e.type==='confirmed-income'));
  const n=getLearningNudge(s,{...options(s),topic:'planning'});assert.equal(n.topicId,'planning');assert.match(n.why,/confirmed incoming money/);
  must(act(s,'payment',{merchant:'Lunch',amount:100,rail:'lumo'}));assert.equal(s.learning.points,0);
 }
}));

test('expected repayments and nonfinal funding cannot unlock actual incoming-money practice',()=>atTime('2026-11-04T12:00:00Z',()=>{
 const s=createEmptyState();s.onboardingDone=true;s.income={amount:999999,nextDate:'2026-11-10'};
 s.ious=[{id:'promise',type:'owedToMe',name:'Kojo',amount:50000,paid:0,status:'open',due:'2026-11-05'}];
 s.transactions=['pending','failed','reversed'].map((status,i)=>({id:`not-confirmed-${i}`,type:'income',direction:'in',status,amount:50000,rail:'momo',at:'2026-11-04T10:00:00Z'}));
 enroll(s);const before=financial(s);
 assert.equal(act(s,'learningStartPractice',{kind:'incoming-plan',mode:'actual'}).ok,false);
 assert.equal(getLearningPractice(s,'incoming-plan',options(s)).actualAvailable,false);
 assert.deepEqual(financial(s),before);practice(s,'incoming-plan','example');assert.equal(s.wallet,0);
}));

test('own-number answers and completion are rejected when money changes without a reviewed plan update',()=>atTime('2026-11-04T12:00:00Z',()=>{
 const s=createDemoState();enroll(s);const started=must(act(s,'learningStartPractice',{kind:'incoming-plan',mode:'actual'}));
 const current=getLearningPractice(s,started.sessionId,options(s));assert.equal(current.stats[0].value,getSummary(s).available);
 must(act(s,'payment',{merchant:'Unplanned lunch',amount:100,rail:'lumo'}));
 assert.equal(getLearningPractice(s,started.sessionId,options(s)).status,'stale');
 const stale=act(s,'learningAnswerPractice',{sessionId:started.sessionId,option:1});assert.equal(stale.ok,false);assert.match(stale.message,/changed/);assert.equal(s.learning.points,0);
 const fresh=must(act(s,'learningStartPractice',{kind:'incoming-plan',mode:'actual'}));assert.notEqual(fresh.sessionId,started.sessionId);
 answerPractice(s,fresh.sessionId);assert.equal(act(s,'learningCompletePractice',{sessionId:fresh.sessionId,reflection:'adjusted-plan'}).ok,false,'Clicking an action is not proof of saving a plan.');
 must(act(s,'learningCompletePractice',{sessionId:fresh.sessionId,reflection:'still-fits'}));assert.equal(s.learning.points,15);
}));

test('weekly practice credits a genuine explicit plan review and keeps normal money authorisation separate',()=>atTime('2026-11-04T12:00:00Z',()=>{
 const s=createDemoState();enroll(s);const started=must(act(s,'learningStartPractice',{kind:'weekly-review',mode:'actual'}));
 answerPractice(s,started.sessionId);
 const beforeWallet=s.wallet,items=s.budget.items.map(i=>({...i}));items[0].amount+=100;
 must(act(s,'createBudget',{items,buffer:s.buffer}));
 const view=getLearningPractice(s,started.sessionId,options(s));assert.equal(view.evidence,true);assert.notEqual(view.status,'stale');assert.equal(view.summary.planned,getSummary(s).planned,'Returning from a saved plan shows current commitments.');assert.match(view.explanation,/earlier figures/);
 must(act(s,'learningCompletePractice',{sessionId:started.sessionId,reflection:'adjusted-plan'}));assert.equal(s.learning.points,20);assert.equal(s.wallet,beforeWallet);
}));

test('privacy opt-out purges personal practice amounts and global privacy choices override local consent',()=>atTime('2026-11-04T12:00:00Z',()=>{
 const s=createDemoState();enroll(s);lesson(s);const oldPoints=s.learning.points;
 const started=must(act(s,'learningStartPractice',{kind:'weekly-review',mode:'actual'}));assert.ok(s.learning.sessions.some(x=>x.id===started.sessionId));
 must(act(s,'accountPrivacy',{preference:'personalisation',enabled:false}));
 assert.equal(getLearningDashboard(s,options(s)).effectivePersonalised,false);assert.equal(s.learning.sessions.some(x=>x.mode==='actual'),false);assert.equal(s.learning.events.length,0);assert.equal(s.learning.points,oldPoints);
 assert.equal(act(s,'learningPreferences',{personalised:true}).ok,false);assert.equal(act(s,'learningStartPractice',{kind:'weekly-review',mode:'actual'}).ok,false);
 practice(s,'weekly-review','example');assert.ok(s.learning.points>oldPoints);
 assert.doesNotMatch(JSON.stringify(s.groups),/learning-practice|lessonProgress|learning-activity/);
}));

test('a failed durable save cannot grant knowledge points and refresh/retry cannot duplicate them',()=>atTime('2026-11-04T12:00:00Z',()=>{
 const h=durable();must(h.act('learningEnroll',{goal:'allowance',personalised:false}));
 const started=must(h.act('learningStartLesson',{lessonId:'planning-allowance'})),before=financial(h.state);h.setFail(true);
 const failed=h.act('learningAnswer',{sessionId:started.sessionId,option:1});assert.equal(failed.ok,false);assert.equal(failed.persistenceFailure,true);assert.equal(h.state.learning.points,0);assert.deepEqual(financial(h.state),before);
 h.setFail(false);must(h.controller.check());must(h.act('learningAnswer',{sessionId:started.sessionId,option:1}));assert.equal(h.state.learning.points,10);
 must(h.act('learningAnswer',{sessionId:started.sessionId,option:1}));assert.equal(h.state.learning.points,10);h.controller.release();
 const next=createPersistence({storage:h.storage,key:'learning-review',empty:createDemoState,validate:validStoredState,migrate:migrateState}),restored=must(next.load()).state;
 must(act(restored,'learningAnswer',{sessionId:started.sessionId,option:1}));assert.equal(restored.learning.points,10);assert.equal(restored.learning.awards.filter(x=>x.key==='lesson:planning-allowance').length,1);next.release();
}));

test('sample and personal practice give equal credit and replaying another mode cannot farm a weekly award',()=>atTime('2026-11-04T12:00:00Z',()=>{
 const example=createDemoState(),actual=createDemoState();enroll(example,false);enroll(actual,true);
 lesson(example);lesson(actual);practice(example,'weekly-review','example');practice(actual,'weekly-review','actual');
 assert.equal(example.learning.points,actual.learning.points);assert.equal(getLearningDashboard(example,options(example)).level.number,getLearningDashboard(actual,options(actual)).level.number);
 const before=actual.learning.points;practice(actual,'weekly-review','example');assert.equal(actual.learning.points,before);assert.equal(actual.learning.activities.filter(x=>x.type==='practice').length,1);
}));

test('later checks use a fresh question after seven days, while weekly grace preserves progress without points',()=>{
 let s;
 atTime('2026-11-04T23:55:00Z',()=>{s=createDemoState();enroll(s,false);lesson(s);practice(s);assert.equal(getLearningDashboard(s,options(s)).streak.weekKey,'2026-11-02');});
 atTime('2026-11-10T23:54:00Z',()=>{assert.equal(act(s,'learningStartLesson',{lessonId:'planning-allowance',review:true}).ok,false);});
 atTime('2026-11-11T23:56:00Z',()=>{const before=s.learning.points;must(act(s,'learningGraceWeek'));assert.equal(s.learning.points,before);const started=must(act(s,'learningStartLesson',{lessonId:'planning-allowance',review:true}));const view=getLearningLesson(s,'planning-allowance',options(s));assert.match(view.question,/GH₵450/);assert.doesNotMatch(view.question,/GH₵600/);must(act(s,'learningAnswer',{sessionId:started.sessionId,option:0}));assert.ok(s.learning.lessonProgress['planning-allowance'].retainedAt);});
 atTime('2026-11-16T00:01:00Z',()=>{practice(s);lesson(s,'expected-promises');const dashboard=getLearningDashboard(s,options(s));assert.equal(dashboard.streak.weekKey,'2026-11-16');assert.equal(dashboard.streak.current,2);assert.equal(dashboard.streak.longest,2);assert.equal(dashboard.streak.graceAvailable,false);});
});

test('unknown or forged learning IDs and signed-out/closed accounts cannot change progress or money',()=>atTime('2026-11-04T12:00:00Z',()=>{
 const s=createDemoState();enroll(s,false);const before=structuredClone(s.learning),money=financial(s);
 for(const [type,p]of[['learningAnswer',{sessionId:'not-yours',option:1}],['learningAnswerPractice',{sessionId:'missing',option:1}],['learningCompletePractice',{sessionId:'missing',reflection:'still-fits'}],['learningStartLesson',{lessonId:'__proto__'}]])assert.equal(act(s,type,p).ok,false);
 assert.deepEqual(s.learning,before);assert.deepEqual(financial(s),money);
 must(act(s,'accountSignOut'));assert.equal(act(s,'learningStartLesson',{lessonId:'planning-allowance'}).ok,false);assert.deepEqual(s.learning,before);
 const closed=createEmptyState();closed.onboardingDone=true;must(act(closed,'accountClose',{confirm:'CLOSE',pin:'1234'}));assert.equal(act(closed,'learningEnroll',{goal:'safety',personalised:false}).ok,false);assert.equal(closed.learning.enrolled,false);
}));

test('pending payment guidance and overdue costs are relevant learning context without confirming money',()=>atTime('2026-11-04T12:00:00Z',()=>{
 const s=createDemoState();enroll(s);const pending=must(act(s,'payment',{merchant:'Campus merchant',amount:100,status:'pending',rail:'lumo'}));
 const nudge=getLearningNudge(s,{...options(s),topic:'safety'});assert.equal(nudge.route.id,'safety-result');assert.match(nudge.why,/awaiting|pending/i);assert.equal(s.learning.points,0);assert.equal(pending.transaction.status,'pending');
 s.budget.items[0].due='2026-11-03';const started=must(act(s,'learningStartPractice',{kind:'weekly-review',mode:'actual'})),view=getLearningPractice(s,started.sessionId,options(s));
 assert.ok(view.upcoming.some(x=>x.id===s.budget.items[0].id&&x.overdue===true));
}));

test('a reversed source cannot be rescued by updating a budget after answering',()=>atTime('2026-11-04T12:00:00Z',()=>{
 const s=createDemoState();enroll(s);const started=must(act(s,'learningStartPractice',{kind:'incoming-plan',mode:'actual'}));answerPractice(s,started.sessionId);
 const session=s.learning.sessions.find(x=>x.id===started.sessionId),income=s.transactions.find(t=>t.id===session.template.sourceId);income.status='reversed';
 must(act(s,'createBudget',{items:s.budget.items.map(x=>({...x})),buffer:s.buffer}));
 assert.equal(getLearningPractice(s,started.sessionId,options(s)).status,'stale');assert.equal(act(s,'learningCompletePractice',{sessionId:started.sessionId,reflection:'adjusted-plan'}).ok,false);assert.equal(s.learning.points,0);
}));

test('learning level needs demonstrated skills and practice rather than a large points balance',()=>atTime('2026-11-04T12:00:00Z',()=>{
 const s=createDemoState();enroll(s,false);s.learning.points=100000;
 assert.equal(getLearningDashboard(s,options(s)).level.number,1);
 for(const item of LEARNING_LESSONS)lesson(s,item.id);
 const beforePractice=getLearningDashboard(s,options(s));assert.equal(beforePractice.level.number,2);assert.equal(beforePractice.level.retainedTopics,0);
 practice(s,'weekly-review','example');assert.equal(getLearningDashboard(s,options(s)).level.number,3);
 assert.equal(s.wallet,248000,'Skills and progress never credit the spending account.');
}));
