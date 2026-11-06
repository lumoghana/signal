import test from 'node:test';
import assert from 'node:assert/strict';
import {createEmptyState,createDemoState} from '../dist/js/model.js';
import {ensureLearningState,handleLearningAction,getLearningDashboard} from '../dist/js/learning-model.js';
import {getMoneyIQ,handleMoneyIQAction,ensureMoneyIQState,validMoneyIQState,purgePersonalMoneyIQ} from '../dist/js/money-iq-model.js';

const NOW=new Date('2026-11-04T12:00:00Z'),opts={now:NOW};
const clone=v=>JSON.parse(JSON.stringify(v));
const moneyProjection=s=>JSON.stringify(Object.fromEntries(Object.entries(s).filter(([key])=>key!=='learning')));
const student=(personalised=false)=>{const s=createEmptyState();s.onboardingDone=true;ensureLearningState(s);if(personalised){s.learning.enrolled=true;s.learning.personalised=true;}return s;};
const tx=(id,amount,category='Data',at='2026-11-03T10:00:00Z',rest={})=>({id,type:'payment',direction:'out',amount,category,at,status:'success',rail:'momo',walletDebited:true,...rest});
const seeded=()=>{const s=student(true);s.transactions=[tx('data-a',2000),tx('data-b',3000,'Data','2026-11-04T10:00:00Z'),tx('food-a',7000,'Food'),tx('last-data',4000,'Data','2026-10-27T10:00:00Z')];return s;};
function run(s,type,p={},o=opts){const r=handleMoneyIQAction(s,type,p,o);assert.equal(r.ok,true,r.message);return r;}
const session=(s,id)=>s.learning.moneyIQ.sessions.find(r=>r.id===id);
function answer(s,id,option=0,o=opts){const q=session(s,id).questions[session(s,id).index];return run(s,'moneyIQAnswer',{sessionId:id,questionId:q.id,option},o);}
function complete(s,id,{wrong=false,o=opts}={}){for(let i=0;i<5;i++){const r=session(s,id);if(r.status==='question')answer(s,id,wrong?(r.questions[i].correct+1)%3:r.questions[i].correct,o);if(i<4)run(s,'moneyIQNext',{sessionId:id,questionId:r.questions[i].id},o);}return run(s,'moneyIQComplete',{sessionId:id},o);}

test('sample is available without enrollment, money or personalisation and matches the approved amounts',()=>{
 const s=student(),before=moneyProjection(s),{sessionId}=run(s,'moneyIQStart',{mode:'example'}),v=getMoneyIQ(s,{...opts,sessionId});
 assert.equal(s.learning.enrolled,false);assert.equal(v.actualAvailable,false);assert.equal(v.session.mode,'example');assert.deepEqual(v.session.question.options,['GH¢30','GH¢50','GH¢80']);assert.equal(v.session.reveal,null);assert.equal(v.session.question.correct,undefined);assert.equal(v.session.recap,null);assert.equal(moneyProjection(s),before);
 answer(s,sessionId,1);const reveal=getMoneyIQ(s,{...opts,sessionId}).session.reveal;assert.equal(reveal.value,'GH¢50');assert.equal(reveal.correct,true);assert.match(reveal.lesson,/2 data payments/);
 const result=complete(s,sessionId);assert.equal(result.points,50);assert.equal(getMoneyIQ(s,{...opts,sessionId}).session.recap.value,'GH¢50');assert.deepEqual(getMoneyIQ(s,{...opts,sessionId}).session.recap.comparison,{current:5000,previous:4000,currentLabel:'This week so far',previousLabel:'Same point last week'});assert.equal(moneyProjection(s),before);
});
test('actual uses confirmed personal spending, net of card refunds and including fees',()=>{
 const s=seeded();s.transactions.push(tx('card',5000,'Data','2026-11-02T18:00:00Z',{type:'card-purchase',rail:'card',refunded:1000,fee:100,walletDebited:undefined}));
 const {sessionId}=run(s,'moneyIQStart',{mode:'actual'});answer(s,sessionId);const v=getMoneyIQ(s,{...opts,sessionId});assert.equal(v.session.reveal.value,'GH¢91');assert.match(v.session.reveal.lesson,/3 data payments/);assert.equal(v.session.period.start,'2026-11-02T00:00:00.000Z');assert.equal(v.session.period.end,NOW.toISOString());assert.equal(v.session.period.previousEnd,'2026-10-28T12:00:00.000Z');
});
test('pending, failed, reversed, future, internal, group and savings movements never inflate a clue',()=>{
 const s=seeded();for(const [id,rest] of [['pending',{status:'pending'}],['failed',{status:'failed'}],['reversed',{status:'reversed'}],['future',{at:'2026-11-04T12:00:01Z'}],['internal',{rail:'internal'}],['group',{groupId:'group-1'}],['collection',{collectionId:'collection-1'}],['contribution',{contributionId:'c-1'}],['payout',{payoutId:'p-1'}],['box',{boxTransfer:true}],['not-debited',{walletDebited:false}],['income',{type:'income',direction:'in'}],['saved',{type:'saving'}]])s.transactions.push(tx(id,100000,'Data','2026-11-04T09:00:00Z',rest));
 s.groups=[{id:'group-1',balance:999999,contributions:[{amount:99999,status:'success'}]}];s.externalBalances=[{type:'momo',balance:999999}];
 const {sessionId}=run(s,'moneyIQStart',{mode:'actual'});answer(s,sessionId);assert.equal(getMoneyIQ(s,{...opts,sessionId}).session.reveal.value,'GH¢50');
});
test('duplicate transaction ids count once, while conflicting duplicate records are omitted',()=>{
 const s=seeded();s.transactions.push(clone(s.transactions[0]));const {sessionId}=run(s,'moneyIQStart',{mode:'actual'});answer(s,sessionId);assert.equal(getMoneyIQ(s,{...opts,sessionId}).session.reveal.value,'GH¢50');
 const other=seeded();other.transactions.push({...clone(other.transactions[0]),status:'failed'});const r=run(other,'moneyIQStart',{mode:'actual'});answer(other,r.sessionId);assert.equal(getMoneyIQ(other,{...opts,sessionId:r.sessionId}).session.reveal.value,'GH¢30');
});
test('duplicate records conflicting only in group membership fields cannot leak into personal spending',()=>{
 for(const field of ['groupId','collectionId','contributionId','payoutId','boxTransfer']){const s=seeded();s.transactions.push({...clone(s.transactions[0]),[field]:field==='boxTransfer'?true:'group-record'});const {sessionId}=run(s,'moneyIQStart',{mode:'actual'});answer(s,sessionId);assert.equal(getMoneyIQ(s,{...opts,sessionId}).session.reveal.value,'GH¢30');}
});
test('payment costs follow the payment record while card refunds reduce card costs',()=>{
 const s=seeded();s.transactions[0].refunded=1000;const {sessionId}=run(s,'moneyIQStart',{mode:'actual'});answer(s,sessionId);assert.equal(getMoneyIQ(s,{...opts,sessionId}).session.reveal.value,'GH¢50','Only card purchases support cumulative partial refunds in the ledger.');
});
test('read-only access never creates a snapshot, changes privacy, or writes learning state',()=>{
 const s=createDemoState();delete s.learning.moneyIQ;const before=JSON.stringify(s);getMoneyIQ(s,opts);getMoneyIQ(s,{...opts,sessionId:'missing'});assert.equal(JSON.stringify(s),before);assert.equal(s.learning?.moneyIQ,undefined);
 const personal=seeded(),id=run(personal,'moneyIQStart',{mode:'actual'}).sessionId,snapshot=JSON.stringify(personal);getMoneyIQ(personal,{...opts,sessionId:id});assert.equal(JSON.stringify(personal),snapshot);
});
test('personal mode requires explicit effective consent and enough current confirmed spending',()=>{
 const s=seeded();s.learning.personalised=false;assert.equal(getMoneyIQ(s,opts).actualAvailable,false);assert.equal(handleMoneyIQAction(s,'moneyIQStart',{mode:'actual'},opts).ok,false);
 s.learning.personalised=true;s.account.privacy.personalisation=false;assert.equal(getMoneyIQ(s,opts).actualAvailable,false);s.account.privacy.personalisation=true;s.transactions=[tx('only',1000)];assert.equal(getMoneyIQ(s,opts).actualAvailable,false);s.transactions.push(tx('pending',1000,'Data',undefined,{status:'pending'}));assert.equal(getMoneyIQ(s,opts).actualAvailable,false);s.transactions.push(tx('second',1000));assert.equal(getMoneyIQ(s,opts).actualAvailable,true);
});
test('actual snapshots freeze the visible interval and later activity does not interrupt a round',()=>{
 const s=seeded(),{sessionId}=run(s,'moneyIQStart',{mode:'actual'});s.transactions.push(tx('after-snapshot',9000,'Data','2026-11-04T12:01:00Z'));
 assert.equal(getMoneyIQ(s,{now:new Date('2026-11-04T13:00:00Z'),sessionId}).session.status,'question');answer(s,sessionId);assert.equal(getMoneyIQ(s,{...opts,sessionId}).session.reveal.value,'GH¢50');
});
test('reversal or refund of snapshot evidence makes a round stale and prevents an award',()=>{
 for(const change of [s=>{s.transactions[0].status='reversed';},s=>{s.transactions[0].type='card-purchase';s.transactions[0].rail='card';s.transactions[0].refunded=1000;}]){
  const s=seeded(),{sessionId}=run(s,'moneyIQStart',{mode:'actual'});change(s);const v=getMoneyIQ(s,{...opts,sessionId});assert.equal(v.session.status,'stale');assert.equal(v.session.reveal,null);assert.equal(handleMoneyIQAction(s,'moneyIQComplete',{sessionId},opts).ok,false);assert.equal(handleMoneyIQAction(s,'moneyIQAnswer',{sessionId,questionId:'spending',option:0},opts).ok,false);assert.equal(s.learning.points,0);
 }
});
test('stale rounds can restart with updated figures and no lost financial history',()=>{
 const s=seeded(),first=run(s,'moneyIQStart',{mode:'actual'}).sessionId;s.transactions[0].status='reversed';const before=moneyProjection(s),next=run(s,'moneyIQStart',{mode:'actual',replay:true}).sessionId;assert.notEqual(next,first);answer(s,next);assert.equal(getMoneyIQ(s,{...opts,sessionId:next}).session.reveal.value,'GH¢30');assert.equal(moneyProjection(s),before);
});
test('answer, next, start and complete retries cannot duplicate learning or skip questions',()=>{
 const s=student(),{sessionId}=run(s,'moneyIQStart',{mode:'example'});assert.equal(run(s,'moneyIQStart',{mode:'example',replay:true}).sessionId,sessionId);assert.equal(s.learning.moneyIQ.sessions.length,1);
 assert.equal(handleMoneyIQAction(s,'moneyIQNext',{sessionId,questionId:'spending'},opts).ok,false);assert.equal(handleMoneyIQAction(s,'moneyIQComplete',{sessionId},opts).ok,false);assert.equal(handleMoneyIQAction(s,'moneyIQAnswer',{sessionId,questionId:'pending',option:0},opts).ok,false);
 answer(s,sessionId,1);const retry=run(s,'moneyIQAnswer',{sessionId,questionId:'spending',option:1});assert.equal(retry.duplicate,true);assert.equal(session(s,sessionId).answers.length,1);assert.equal(handleMoneyIQAction(s,'moneyIQAnswer',{sessionId,questionId:'spending',option:0},opts).ok,false);
 run(s,'moneyIQNext',{sessionId,questionId:'spending'});run(s,'moneyIQNext',{sessionId,questionId:'spending'});assert.equal(session(s,sessionId).index,1);assert.equal(run(s,'moneyIQAnswer',{sessionId,questionId:'spending',option:1}).duplicate,true);assert.equal(session(s,sessionId).status,'question');
 complete(s,sessionId);assert.equal(run(s,'moneyIQComplete',{sessionId}).points,0);assert.equal(s.learning.awards.length,1);assert.equal(s.learning.points,50);
});
test('five reveals are required and any set of guesses earns the same participation points',()=>{
 const right=student(),wrong=student();for(const [s,miss] of [[right,false],[wrong,true]]){const {sessionId}=run(s,'moneyIQStart',{mode:'example'});complete(s,sessionId,{wrong:miss});}
 assert.equal(right.learning.points,wrong.learning.points);assert.equal(right.learning.points,50);assert.equal(right.learning.activities[0].type,'money-iq');assert.equal(right.learning.activities[0].participation,true);assert.deepEqual(right.learning.lessonProgress,{});assert.equal(getLearningDashboard(right,opts).level.number,1);
});
test('mode switches and replays cannot farm a second award in one UTC week',()=>{
 const s=seeded(),sample=run(s,'moneyIQStart',{mode:'example'}).sessionId;complete(s,sample);const actual=run(s,'moneyIQStart',{mode:'actual'}).sessionId;assert.equal(complete(s,actual).points,0);assert.equal(run(s,'moneyIQStart',{mode:'example'}).sessionId,sample);
 const replay=run(s,'moneyIQStart',{mode:'example',replay:true}).sessionId;assert.notEqual(replay,sample);assert.equal(complete(s,replay).points,0);assert.equal(s.learning.points,50);assert.equal(s.learning.awards.length,1);assert.equal(getMoneyIQ(s,opts).completedThisWeek,true);assert.equal(getMoneyIQ(s,opts).pointsAvailable,0);
});
test('Money IQ uses the shared 100-point weekly cap and reports the actual partial award',()=>{
 const s=student();s.learning.points=85;s.learning.awards=[{key:'existing',week:'2026-11-02',points:85}];const {sessionId}=run(s,'moneyIQStart',{mode:'example'});assert.equal(getMoneyIQ(s,opts).pointsAvailable,15);assert.equal(complete(s,sessionId).points,15);assert.equal(s.learning.points,100);assert.equal(getMoneyIQ(s,{...opts,sessionId}).session.pointsEarned,15);
});
test('a later UTC week opens a new participation award without resetting earlier progress',()=>{
 const s=student(),{sessionId}=run(s,'moneyIQStart',{mode:'example'});complete(s,sessionId);const next={now:new Date('2026-11-09T00:00:00Z')},id=run(s,'moneyIQStart',{mode:'example'},next).sessionId;assert.notEqual(id,sessionId);assert.equal(getMoneyIQ(s,next).completedThisWeek,false);assert.equal(complete(s,id,{o:next}).points,50);assert.equal(s.learning.points,100);assert.equal(s.learning.awards.length,2);
});
test('privacy masking and purging remove personal snapshots and preserve generic earned progress',()=>{
 const s=seeded(),{sessionId}=run(s,'moneyIQStart',{mode:'actual'});complete(s,sessionId);s.learning.personalised=false;const before=JSON.stringify(s);assert.equal(getMoneyIQ(s,{...opts,sessionId}).session,null);assert.equal(getMoneyIQ(s,opts).activeSessionId,'');assert.equal(JSON.stringify(s),before);purgePersonalMoneyIQ(s);assert.equal(s.learning.moneyIQ.sessions.length,0);assert.equal(s.learning.points,50);assert.equal(s.learning.activities[0].value,undefined);assert.equal(s.learning.activities[0].title,'Money IQ weekly discovery');
});
test('snapshot persistence includes a pending reveal and safe resume after JSON serialization',()=>{
 const s=student(),{sessionId}=run(s,'moneyIQStart',{mode:'example'});answer(s,sessionId,1);const reloaded=clone(s);assert.equal(validMoneyIQState(reloaded),true);const v=getMoneyIQ(reloaded,{...opts,sessionId});assert.equal(v.session.status,'reveal');assert.equal(v.session.selected,1);assert.equal(v.session.reveal.value,'GH¢50');assert.equal(run(reloaded,'moneyIQStart',{mode:'example'}).sessionId,sessionId);
});
test('corrupt optional IQ state recovers without changing other learning or any ledger record',()=>{
 const s=seeded(),before=moneyProjection(s);s.learning.points=10;s.learning.moneyIQ={schema:1,sessions:'bad'};assert.equal(validMoneyIQState(s),false);ensureMoneyIQState(s);assert.equal(validMoneyIQState(s),true);assert.equal(s.learning.points,10);assert.match(getMoneyIQ(s,opts).recoveryNotice,/money records are still here/);assert.equal(moneyProjection(s),before);
});
test('unknown modes, options, sessions, actions and closed accounts fail without finance mutations',()=>{
 const s=student(),before=moneyProjection(s);assert.equal(handleMoneyIQAction(s,'not-money-iq',{},opts),null);assert.equal(handleMoneyIQAction(s,'moneyIQStart',{mode:'live'},opts).ok,false);const {sessionId}=run(s,'moneyIQStart',{mode:'example'});
 for(const p of [{sessionId:'missing',questionId:'spending',option:0},{sessionId,questionId:'spending',option:-1},{sessionId,questionId:'spending',option:3},{sessionId,questionId:'spending',option:'1'}])assert.equal(handleMoneyIQAction(s,'moneyIQAnswer',p,opts).ok,false);
 assert.equal(moneyProjection(s),before);s.account.status='closed';assert.equal(handleMoneyIQAction(s,'moneyIQStart',{mode:'example'},opts).ok,false);
});
test('same-period comparison excludes later days in the previous week',()=>{
 const s=seeded();s.transactions.push(tx('last-week-thursday',90000,'Data','2026-10-29T10:00:00Z'));const {sessionId}=run(s,'moneyIQStart',{mode:'actual'});complete(s,sessionId);const v=getMoneyIQ(s,{...opts,sessionId}).session;assert.equal(v.recap.comparison.previous,4000);assert.equal(v.recap.comparison.current,5000);assert.match(v.recap.body,/GH¢10 more than this point last week/);
});
test('changes outside either compared window do not interrupt an otherwise valid snapshot',()=>{
 const s=seeded();s.transactions.push(tx('uncompared-thursday',90000,'Data','2026-10-29T10:00:00Z'));const {sessionId}=run(s,'moneyIQStart',{mode:'actual'});s.transactions.at(-1).status='reversed';assert.equal(getMoneyIQ(s,{...opts,sessionId}).session.status,'question');
});
test('personal recap and reveal routes carry authoritative category and snapshot date filters',()=>{
 const s=seeded(),{sessionId}=run(s,'moneyIQStart',{mode:'actual'});answer(s,sessionId);const expected={query:'',direction:'out',status:'success',category:'Data',from:'2026-11-02',to:'2026-11-04',asOf:'2026-11-04T12:00:00.000Z'};assert.deepEqual(getMoneyIQ(s,{...opts,sessionId}).session.reveal.route.filters,expected);complete(s,sessionId);assert.deepEqual(getMoneyIQ(s,{...opts,sessionId}).session.recap.route.filters,expected);
});
test('no comparison records produces no invented improvement or misleading zero baseline chart',()=>{
 const s=seeded();s.transactions=s.transactions.filter(t=>t.id!=='last-data');const {sessionId}=run(s,'moneyIQStart',{mode:'actual'});complete(s,sessionId);const r=getMoneyIQ(s,{...opts,sessionId}).session.recap;assert.equal(r.comparison,undefined);assert.match(r.body,/No earlier spending recorded/);
});
test('equal top categories use an unambiguous amount question instead of choosing an arbitrary winner',()=>{
 const s=student(true);s.transactions=[tx('food',5000,'Food'),tx('data',5000,'Data')];const {sessionId}=run(s,'moneyIQStart',{mode:'actual'});answer(s,sessionId);run(s,'moneyIQNext',{sessionId,questionId:'spending'});const v=getMoneyIQ(s,{...opts,sessionId}).session;assert.match(v.question.prompt,/cost this week/);assert.equal(new Set(v.question.options).size,3);assert.equal(v.question.kind,'spending');
});

test('fresh sample rounds rotate student scenarios and figures while preserving one weekly award',()=>{
 const s=student(),before=moneyProjection(s),sets=[],totals=[];
 for(let round=0;round<4;round++){
  const {sessionId}=run(s,'moneyIQStart',{mode:'example',replay:true}),r=session(s,sessionId);
  sets.push(r.questions.slice(3).map(q=>q.prompt).join('|'));
  totals.push(r.questions[0].reveal.value);
  assert.equal(run(s,'moneyIQStart',{mode:'example',replay:true}).sessionId,sessionId,'repeated start resumes this round');
  const result=complete(s,sessionId);assert.equal(result.points,round===0?50:0);
  assert.match(getMoneyIQ(s,{...opts,sessionId}).session.recap.lesson,/price and expiry/);
 }
 assert.equal(new Set(sets).size,4);assert.equal(new Set(totals).size,4);
 assert.equal(s.learning.awards.length,1);assert.equal(s.learning.points,50);assert.equal(moneyProjection(s),before);
});
test('fresh recorded rounds rotate practice without changing verified figures or rewards',()=>{
 const s=seeded(),before=moneyProjection(s),first=run(s,'moneyIQStart',{mode:'actual'}).sessionId;
 complete(s,first);const next=run(s,'moneyIQStart',{mode:'actual',replay:true}).sessionId;
 assert.notEqual(session(s,first).questions[3].prompt,session(s,next).questions[3].prompt);
 assert.equal(session(s,next).questions[0].reveal.value,'GH¢50');assert.equal(complete(s,next).points,0);
 assert.equal(moneyProjection(s),before);assert.equal(validMoneyIQState(clone(s)),true);
});
