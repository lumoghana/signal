import test from 'node:test';
import assert from 'node:assert/strict';
import {createEmptyState,createDemoState,getSummary} from '../dist/js/model.js';
import {ensureLearningState,handleLearningAction,getLearningDashboard,getLearningLesson,getLearningPractice,getLearningNudge,syncLearningAfterMoneyAction,validLearningState,LEARNING_LESSONS} from '../dist/js/learning-model.js';
const baseNow=new Date('2026-11-04T12:00:00Z');
const later=days=>new Date(baseNow.getTime()+days*86400000);
const helpers=(s,now=baseNow)=>({getSummary,summary:getSummary(s),now});
function run(s,type,p={},now=baseNow){const r=handleLearningAction(s,type,p,helpers(s,now));assert.equal(r.ok,true,r.message);return r;}
function student({personalised=false,wealth=false}={}){
 const s=wealth?createDemoState():createEmptyState();
 // Demo income follows the real clock; keep this prerequisite before the fixture's now.
 if(wealth)s.transactions.find(t=>t.type==='income').at=new Date(baseNow.getTime()-2*86400000).toISOString();
 s.onboardingDone=true;ensureLearningState(s);run(s,'learningEnroll',{goal:'allowance',personalised});return s;
}
function lesson(s,lessonId,{review=false,now=baseNow}={}){const r=run(s,'learningStartLesson',{lessonId,review},now),definition=LEARNING_LESSONS.find(l=>l.id===lessonId);return run(s,'learningAnswer',{sessionId:r.sessionId,option:definition.questions[review?1:0].correct},now);}
function practice(s,kind='weekly-review',mode='example',now=baseNow,reflection=mode==='actual'?'still-fits':'example-reviewed'){
 const {sessionId}=run(s,'learningStartPractice',{kind,mode},now),session=s.learning.sessions.find(x=>x.id===sessionId);
 run(s,'learningAnswerPractice',{sessionId,option:session.template.correct},now);return run(s,'learningCompletePractice',{sessionId,reflection},now);
}
function moneyProjection(s){const {learning,...money}=s;return JSON.stringify(money);}

test('all twelve lessons cover six topics, and points never mutate money or create understanding by themselves',()=>{
 const s=student(),before=moneyProjection(s);assert.equal(LEARNING_LESSONS.length,12);
 for(const definition of LEARNING_LESSONS)lesson(s,definition.id);
 const dashboard=getLearningDashboard(s,helpers(s));assert.equal(dashboard.topics.length,6);assert.equal(dashboard.topics.filter(t=>t.understood).length,6);assert.equal(dashboard.points,100,'The weekly effort award has a cap.');assert.equal(dashboard.level.number,2,'Application is required before the planner level.');assert.equal(moneyProjection(s),before);
 const points=s.learning.points;lesson(s,LEARNING_LESSONS[0].id);assert.equal(s.learning.points,points,'Replaying a lesson is available without farming XP.');
});
test('example practice gives the same learning opportunity to a student with no money',()=>{
 const a=student(),b=student({wealth:true});
 for(const s of [a,b]){lesson(s,'planning-allowance');lesson(s,'planning-flex');practice(s);}
 assert.equal(a.learning.points,b.learning.points);assert.equal(getLearningDashboard(a).level.number,getLearningDashboard(b).level.number);assert.equal(a.wallet,0);
});
test('getters are read-only and no personal tracking is created before opt-in',()=>{
 const s=createDemoState(),before=JSON.stringify(s);getLearningDashboard(s,helpers(s));getLearningLesson(s,'expected-promises');getLearningPractice(s,'incoming-plan');getLearningNudge(s);assert.equal(JSON.stringify(s),before);
 ensureLearningState(s);const initial=JSON.stringify(s.learning);syncLearningAfterMoneyAction(s,'fund',{}, {ok:true,transaction:s.transactions.find(t=>t.type==='income')},helpers(s));assert.equal(JSON.stringify(s.learning),initial);
});
test('only confirmed incoming money makes actual incoming-money practice available',()=>{
 const s=student({personalised:true});s.wallet=50000;s.transactions=[{id:'money',type:'income',direction:'in',status:'pending',amount:50000,rail:'momo',at:'2026-11-04T10:00:00Z'}];
 assert.equal(getLearningDashboard(s,helpers(s)).practices[0].actualAvailable,false);assert.equal(handleLearningAction(s,'learningStartPractice',{kind:'incoming-plan',mode:'actual'},helpers(s)).ok,false);
 s.transactions[0].status='failed';assert.equal(getLearningDashboard(s,helpers(s)).practices[0].actualAvailable,false);
 s.transactions[0].status='success';const start=run(s,'learningStartPractice',{kind:'incoming-plan',mode:'actual'});s.transactions[0].status='reversed';
 assert.equal(handleLearningAction(s,'learningAnswerPractice',{sessionId:start.sessionId,option:0},helpers(s)).ok,false);assert.equal(s.learning.points,0);
});
test('actual practice uses the authoritative summary and excludes expected repayments',()=>{
 const s=student({personalised:true,wealth:true});s.wallet=60000;s.buffer=5000;s.budget={...s.budget,created:true,items:[{id:'food',name:'Food',amount:40000,spent:0,due:'2026-11-20'}]};s.ious=[{id:'expected',name:'Kojo',type:'owedToMe',amount:90000,paid:0,status:'open',due:'2026-11-05'}];
 const {sessionId}=run(s,'learningStartPractice',{kind:'incoming-plan',mode:'actual'}),view=getLearningPractice(s,sessionId,helpers(s));
 assert.equal(view.summary.flexible,15000);assert.equal(view.stats.find(x=>x.label==='Flexible money').value,15000);assert.equal(view.options.filter(x=>x==='GH₵150.00').length,1);assert.equal(view.correct,undefined);
});
test('stale questions cannot award learning for numbers that changed',()=>{
 const s=student({personalised:true,wealth:true}),{sessionId}=run(s,'learningStartPractice',{kind:'weekly-review',mode:'actual'}),session=s.learning.sessions.find(x=>x.id===sessionId);s.wallet-=1000;
 const r=handleLearningAction(s,'learningAnswerPractice',{sessionId,option:session.template.correct},helpers(s));assert.equal(r.ok,false);assert.match(r.message,/changed/);assert.equal(s.learning.points,0);assert.equal(getLearningPractice(s,sessionId,helpers(s)).status,'stale');
});
test('a genuine saved plan can be reviewed after the question without an endless stale restart',()=>{
 const s=student({personalised:true,wealth:true}),{sessionId}=run(s,'learningStartPractice',{kind:'incoming-plan',mode:'actual'}),session=s.learning.sessions.find(x=>x.id===sessionId);
 run(s,'learningAnswerPractice',{sessionId,option:session.template.correct});assert.equal(handleLearningAction(s,'learningCompletePractice',{sessionId,reflection:'adjusted-plan'},helpers(s)).ok,false,'Opening a route does not prove a saved plan.');
 s.budget.items[0].amount+=1000;syncLearningAfterMoneyAction(s,'updateBudget',{}, {ok:true,budget:s.budget},helpers(s));
 assert.equal(getLearningPractice(s,sessionId,helpers(s)).status,'answered');run(s,'learningCompletePractice',{sessionId,reflection:'adjusted-plan'});assert.equal(s.learning.points,15);
});
test('confirmed money events suggest a relevant lesson but never earn points',()=>{
 const s=student({personalised:true,wealth:true}),t=s.transactions.find(t=>t.type==='income');
 syncLearningAfterMoneyAction(s,'fund',{}, {ok:true,transaction:t},helpers(s));syncLearningAfterMoneyAction(s,'fund',{}, {ok:true,transaction:t},helpers(s));assert.equal(s.learning.events.length,1);assert.equal(s.learning.points,0);
 assert.equal(getLearningNudge(s,{...helpers(s),topic:'planning'}).topicId,'planning');assert.equal(getLearningNudge(s,{...helpers(s),topic:'safety'}).topicId,'safety');assert.equal(getLearningNudge(s,{...helpers(s),topic:'expected'}).topicId,'expected');assert.equal(getLearningNudge(s,{...helpers(s),topic:'saving'}).topicId,'saving');
 const nudge=getLearningNudge(s,{...helpers(s),topic:'planning'});run(s,'learningDismissNudge',{eventId:nudge.eventId});assert.notEqual(getLearningNudge(s,{...helpers(s),topic:'planning'})?.eventId,nudge.eventId);
});
test('personal and account-level opt-out purge own-money sessions and keep earned generic progress',()=>{
 const s=student({personalised:true,wealth:true});lesson(s,'planning-allowance');run(s,'learningStartPractice',{kind:'incoming-plan',mode:'actual'});assert.equal(s.learning.sessions.some(x=>x.mode==='actual'),true);
 s.account.privacy.personalisation=false;assert.equal(getLearningPractice(s,s.learning.sessions.at(-1).id,helpers(s)).status,'stale');syncLearningAfterMoneyAction(s,'accountPrivacy',{preference:'personalisation',enabled:false},{ok:true},helpers(s));assert.equal(s.learning.sessions.some(x=>x.mode==='actual'),false);assert.equal(s.learning.points,10);assert.equal(s.learning.events.length,0);
 assert.equal(handleLearningAction(s,'learningPreferences',{personalised:true},helpers(s)).ok,false);practice(s,'weekly-review','example');assert.equal(s.learning.points,30);
 s.account.privacy.personalisation=true;run(s,'learningPreferences',{personalised:true});run(s,'learningStartPractice',{kind:'incoming-plan',mode:'actual'});run(s,'learningPreferences',{personalised:false});assert.equal(s.learning.sessions.some(x=>x.mode==='actual'),false);
});
test('retention uses a reserved fresh question after seven days and cannot be farmed',()=>{
 const s=student();lesson(s,'safety-recipient');const first=getLearningLesson(s,'safety-recipient',helpers(s)).question;
 assert.equal(handleLearningAction(s,'learningStartLesson',{lessonId:'safety-recipient',review:true},helpers(s,later(6))).ok,false);
 const {sessionId}=run(s,'learningStartLesson',{lessonId:'safety-recipient',review:true},later(7));assert.notEqual(getLearningLesson(s,'safety-recipient',helpers(s,later(7))).question,first);
 const r=run(s,'learningAnswer',{sessionId,option:LEARNING_LESSONS.find(l=>l.id==='safety-recipient').questions[1].correct},later(7));assert.equal(r.points,15);assert.equal(run(s,'learningAnswer',{sessionId,option:1},later(7)).points,0);assert.equal(handleLearningAction(s,'learningStartLesson',{lessonId:'safety-recipient',review:true},helpers(s,later(8))).ok,false);
});
test('weekly reflection, duplicate prevention and forgiving streaks do not depend on spending',()=>{
 const s=student();lesson(s,'planning-allowance');practice(s);let dashboard=getLearningDashboard(s,helpers(s));assert.equal(dashboard.streak.current,1);assert.equal(dashboard.streak.completed,true);
 const points=s.learning.points;practice(s);assert.equal(s.learning.points,points);
 run(s,'learningGraceWeek',{},later(7));assert.equal(getLearningDashboard(s,helpers(s,later(7))).streak.current,1);assert.equal(handleLearningAction(s,'learningGraceWeek',{},helpers(s,later(14))).ok,false);
 lesson(s,'planning-flex',{now:later(14)});practice(s,'weekly-review','example',later(14));dashboard=getLearningDashboard(s,helpers(s,later(14)));assert.equal(dashboard.streak.current,2);assert.equal(dashboard.streak.longest,2);
 assert.equal(getLearningDashboard(s,helpers(s,later(35))).streak.current,0);assert.equal(getLearningDashboard(s,helpers(s,later(35))).topics[0].understood,true,'Completed learning stays after an interrupted streak.');assert.equal(s.wallet,0);
});
test('corrupt optional learning can recover without resetting financial records',()=>{
 const s=createDemoState(),before=s.wallet,transactions=JSON.stringify(s.transactions);s.learning={schema:1,sessions:'damaged'};assert.equal(validLearningState(s),false);ensureLearningState(s);assert.equal(validLearningState(s),true);assert.match(getLearningDashboard(s).recoveryNotice,/money records are unchanged/);assert.equal(s.wallet,before);assert.equal(JSON.stringify(s.transactions),transactions);
});
test('pending payment and overdue commitment offer accurate learning context without confirming money',()=>{
 const s=student({personalised:true,wealth:true});s.transactions.unshift({id:'pending-check',type:'payment',status:'pending',direction:'out',amount:1000,rail:'momo',at:'2026-11-04T11:00:00Z'});
 const n=getLearningNudge(s,{...helpers(s),topic:'safety'});assert.equal(n.route.id,'safety-result');assert.match(n.why,/awaiting/);assert.equal(s.learning.points,0);assert.equal(s.transactions[0].status,'pending');
 s.budget.items.push({id:'overdue',name:'Unpaid study cost',amount:5000,spent:0,due:'2026-11-01'});const {sessionId}=run(s,'learningStartPractice',{kind:'weekly-review',mode:'actual'});const view=getLearningPractice(s,sessionId,helpers(s));assert.equal(view.upcoming.find(i=>i.id==='overdue').overdue,true);
});
test('a balance without recorded essentials does not turn into an affordability claim',()=>{
 const s=student({personalised:true});s.wallet=50000;s.transactions=[{id:'fresh-money',type:'income',direction:'in',status:'success',amount:50000,rail:'momo',at:'2026-11-04T10:00:00Z'}];const {sessionId}=run(s,'learningStartPractice',{kind:'incoming-plan',mode:'actual'}),view=getLearningPractice(s,sessionId,helpers(s));assert.equal(view.summary.hasPlan,false);assert.equal(view.stats.some(x=>x.label==='Flexible money'),false);assert.match(view.question,/essentials are not recorded/);assert.equal(view.reflectionOptions.some(x=>x.id==='still-fits'),false);
});
