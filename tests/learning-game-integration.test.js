import test from 'node:test';
import assert from 'node:assert/strict';
import {createDemoState,createEmptyState,applyAction,validStoredState,migrateState} from '../dist/js/model.js';
import {getCampusGame,getCampusRun} from '../dist/js/learning-game-model.js';
import {getLearningDashboard} from '../dist/js/learning-model.js';
import {createPersistence} from '../dist/js/persistence.js';
import {commitAction} from '../dist/js/state-boundary.js';
import {safeRoute,parentRoute,routeKey} from '../dist/js/navigation.js';
import {canOpenChatBySwipe} from '../dist/js/chat-gestures.js';

const clone=v=>structuredClone(v);
const must=r=>{assert.equal(r.ok,true,r.message);return r;};
const act=(s,type,p={})=>applyAction(s,type,p);
const money=s=>clone(Object.fromEntries(['wallet','buffer','income','budget','boxes','transactions','ious','groups','virtualCards','externalBalances','profile'].map(k=>[k,s[k]])));
const learning=s=>clone(Object.fromEntries(Object.entries(s.learning).filter(([k])=>k!=='game')));
function student({empty=false,personalised=false}={}){const s=empty?createEmptyState():createDemoState();s.onboardingDone=true;must(act(s,'learningEnroll',{goal:'allowance',personalised}));return s;}
function start(s,missionId=getCampusGame(s).missions[0].id,replay=false){const r=must(act(s,'campusStart',{missionId,replay}));return r.runId||getCampusGame(s).activeRunId;}
function choose(s,id,index=0){const r=getCampusRun(s,id);assert.equal(r.status,'choice');const choice=r.turn.choices[index];assert.ok(choice);must(act(s,'campusChoose',{runId:id,stepId:r.stepId,choiceId:choice.id}));return getCampusRun(s,id);}
function next(s,id){const r=getCampusRun(s,id);assert.equal(r.status,'consequence');must(act(s,'campusContinue',{runId:id,stepId:r.stepId}));return getCampusRun(s,id);}
function finish(s,id,choices=[0,0,0]){let r=getCampusRun(s,id),guard=0;while(r.status!=='completed'&&guard++<8){if(r.status==='choice')r=choose(s,id,choices[r.turnIndex]||0);else r=next(s,id);}assert.equal(r.status,'completed');return r;}
function branches(s,id){const r=getCampusRun(s,id);if(r.status==='completed')return [{state:s,run:r}];if(r.status==='consequence'){next(s,id);return branches(s,id);}return r.turn.choices.flatMap((_,index)=>{const candidate=clone(s);choose(candidate,id,index);next(candidate,id);return branches(candidate,id);});}
function durable(){const data=new Map();let fail=false;const storage={getItem:k=>data.get(k)??null,setItem:(k,v)=>{if(fail&&k==='campus-review')throw new Error('quota');data.set(k,v);},removeItem:k=>data.delete(k)};const state=student(),controller=createPersistence({storage,key:'campus-review',empty:()=>state,validate:validStoredState,migrate:migrateState});must(controller.load());return {state,storage,controller,setFail:v=>{fail=v;},act:(type,p)=>commitAction({state,type,payload:p,apply:applyAction,persistence:controller})};}

test('campus game is independent of personal balances and privacy and never changes banking records',()=>{
 const a=student({empty:true}),b=student({personalised:true});b.settings.hideBalance=true;b.account.privacy.personalisation=false;const beforeA=money(a),beforeB=money(b),learnA=learning(a),learnB=learning(b);
 const idA=start(a),idB=start(b);assert.deepEqual(getCampusRun(a,idA).money,getCampusRun(b,idB).money);
 finish(a,idA);finish(b,idB);assert.deepEqual(getCampusRun(a,idA).money,getCampusRun(b,idB).money);assert.equal(getCampusRun(a,idA).stars,getCampusRun(b,idB).stars);
 assert.deepEqual(money(a),beforeA);assert.deepEqual(money(b),beforeB);assert.deepEqual(learning(a),learnA);assert.deepEqual(learning(b),learnB);assert.equal(b.settings.hideBalance,true);
 const snap=JSON.stringify(b);getCampusGame(b);getCampusRun(b,idB);assert.equal(JSON.stringify(b),snap,'Views do not mutate saved state.');
});

test('full campaign unlocks through completed missions and best stars do not farm on replay',()=>{
 let s=student(),before=money(s),learn=learning(s);const ids=getCampusGame(s).missions.map(m=>m.id);assert.equal(ids.length,6);
 for(const [index,id]of ids.entries()){
  const map=getCampusGame(s);assert.equal(map.missions[index].unlocked,true);if(index+1<ids.length)assert.equal(map.missions[index+1].unlocked,false);
  const runId=start(s,id),outcomes=branches(s,runId);assert.ok(outcomes.length>=2);const best=outcomes.sort((a,b)=>b.run.stars-a.run.stars)[0];assert.equal(best.run.stars,3,'Each mission has a reachable three-skill route.');s=best.state;
  assert.equal(getCampusGame(s).completedCount,index+1);assert.equal(getCampusGame(s).totalStars,(index+1)*3);
 }
 const map=getCampusGame(s);assert.equal(map.totalStars,18);assert.equal(map.missions.every(m=>m.completed),true);assert.ok(map.rewards.filter(r=>r.unlocked).length>=3);
 const total=map.totalStars,runId=start(s,ids[0],true);finish(s,runId);assert.equal(getCampusGame(s).totalStars,total);assert.deepEqual(money(s),before);assert.deepEqual(learning(s),learn);assert.equal(getLearningDashboard(s).points,0,'Game stars do not claim learning mastery or XP.');
});

test('branch choices change the simulation and rewind restores only the current turn without farming stars',()=>{
 const s=student(),id=start(s),initial=getCampusRun(s,id),before=money(s);const alternatives=initial.turn.choices.map((_,index)=>{const candidate=clone(s);return choose(candidate,id,index);});
 assert.ok(new Set(alternatives.map(r=>JSON.stringify(r.money))).size>1,'Choices alter story-money consequences rather than only a correctness label.');
 const one=choose(s,id,0),chosen=clone(s.learning.game);must(act(s,'campusChoose',{runId:id,stepId:initial.stepId,choiceId:initial.turn.choices[0].id}));assert.deepEqual(s.learning.game,chosen,'A duplicate submitted choice cannot apply twice.');
 must(act(s,'campusRewind',{runId:id,stepId:one.stepId}));const rewound=getCampusRun(s,id);assert.equal(rewound.status,'choice');assert.deepEqual(rewound.money,initial.money);assert.notEqual(rewound.stepId,initial.stepId,'Rewind issues a fresh decision token.');
 const rewindState=clone(s.learning.game);act(s,'campusChoose',{runId:id,stepId:initial.stepId,choiceId:initial.turn.choices[0].id});assert.deepEqual(s.learning.game,rewindState,'An old decision cannot apply after rewind.');
 choose(s,id,1);const consequence=getCampusRun(s,id);next(s,id);const afterNext=clone(s.learning.game);act(s,'campusContinue',{runId:id,stepId:consequence.stepId});assert.deepEqual(s.learning.game,afterNext);finish(s,id);assert.ok(getCampusGame(s).totalStars<=3);assert.deepEqual(money(s),before);
});

test('locked missions, unavailable cosmetics and forged run references cannot alter progress',()=>{
 const s=student(),map=getCampusGame(s);assert.equal(act(s,'campusStart',{missionId:map.missions[5].id}).ok,false);
 const locked=map.rewards.find(r=>!r.unlocked);assert.ok(locked);assert.equal(act(s,'campusEquip',{rewardId:locked.id}).ok,false);assert.equal(act(s,'campusEquip',{rewardId:'__proto__'}).ok,false);
 const id=start(s),before=clone(s.learning.game);for(const [type,p]of [['campusChoose',{runId:'forged',stepId:'x',choiceId:'x'}],['campusContinue',{runId:id,stepId:'forged'}],['campusRewind',{runId:id,stepId:'forged'}]])assert.equal(act(s,type,p).ok,false);assert.deepEqual(s.learning.game,before);
});

test('failed durable completion saves no stars or unlock, then refresh and retry credit once',()=>{
 const h=durable(),missionId=getCampusGame(h.state).missions[0].id,started=must(h.act('campusStart',{missionId})),id=started.runId||getCampusGame(h.state).activeRunId;
 for(let index=0;index<3;index++){const r=getCampusRun(h.state,id);must(h.act('campusChoose',{runId:id,stepId:r.stepId,choiceId:r.turn.choices[0].id}));if(index<2){const outcome=getCampusRun(h.state,id);must(h.act('campusContinue',{runId:id,stepId:outcome.stepId}));}}
 const outcome=getCampusRun(h.state,id),before=clone(h.state.learning.game),banking=money(h.state);h.setFail(true);const failed=h.act('campusContinue',{runId:id,stepId:outcome.stepId});assert.equal(failed.ok,false);assert.equal(failed.persistenceFailure,true);assert.deepEqual(h.state.learning.game,before);assert.equal(getCampusGame(h.state).completedCount,0);assert.deepEqual(money(h.state),banking);
 h.setFail(false);must(h.controller.check());must(h.act('campusContinue',{runId:id,stepId:outcome.stepId}));const stars=getCampusGame(h.state).totalStars;h.controller.release();
 const reloaded=createPersistence({storage:h.storage,key:'campus-review',empty:createDemoState,validate:validStoredState,migrate:migrateState}),restored=must(reloaded.load()).state;assert.equal(getCampusRun(restored,id).status,'completed');assert.equal(getCampusGame(restored).totalStars,stars);act(restored,'campusContinue',{runId:id,stepId:outcome.stepId});assert.equal(getCampusGame(restored).totalStars,stars);assert.equal(getCampusGame(restored).completedCount,1);reloaded.release();
});

test('corrupt optional game state resets only the game and preserves existing learning and money',()=>{
 const s=student();const lesson=must(act(s,'learningStartLesson',{lessonId:'planning-allowance'}));must(act(s,'learningAnswer',{sessionId:lesson.sessionId,option:1}));const before=money(s),learn=learning(s);s.learning.game={schema:999,runs:'damaged'};migrateState(s);assert.deepEqual(money(s),before);assert.deepEqual(learning(s),learn);assert.equal(getCampusGame(s).completedCount,0);assert.ok(getCampusGame(s).recoveryNotice);assert.equal(validStoredState(s),true);
});

test('game respects account access and map, play and looks retain direct navigation without opening private chat',()=>{
 const s=student(),id=start(s),before=clone(s.learning.game);must(act(s,'accountSignOut'));assert.equal(act(s,'campusContinue',{runId:id,stepId:getCampusRun(s,id).stepId}).ok,false);assert.deepEqual(s.learning.game,before);
 const closed=student({empty:true});must(act(closed,'accountClose',{confirm:'CLOSE',pin:'1234'}));assert.equal(act(closed,'campusStart',{missionId:getCampusGame(closed).missions[0].id}).ok,false);
 const active=student();for(const page of ['game','play','rewards']){const r={section:'learn',page,...(page==='play'?{id:'sample-run'}:{})};assert.deepEqual(safeRoute(r,active,{}),r);assert.equal(canOpenChatBySwipe(r),false);assert.deepEqual(parentRoute(r,active,{}),{section:'learn',page:page==='game'?'home':'game'});}
 assert.notEqual(routeKey({section:'learn',page:'play',id:'run-one'}),routeKey({section:'learn',page:'play',id:'run-two'}));assert.deepEqual(parentRoute({section:'learn',page:'game',returnTo:{section:'home',page:'home'}},active,{}),{section:'home',page:'home'});
});

test('a rough route still opens the next chapter and earned Lux looks persist without banking effects',()=>{
 const rough=student(),first=getCampusGame(rough).missions[0].id,runId=start(rough,first);finish(rough,runId,[2,2,2]);const map=getCampusGame(rough);assert.equal(map.completedCount,1);assert.equal(map.missions[1].unlocked,true,'A student can keep playing without a perfect run.');assert.ok(map.totalStars<3);
 const s=student(),before=money(s),id=start(s);finish(s,id);const reward=getCampusGame(s).rewards.find(r=>r.id!=='classic'&&r.unlocked);assert.ok(reward);must(act(s,'campusEquip',{rewardId:reward.id}));const snapshot=migrateState(JSON.parse(JSON.stringify(s)));assert.equal(getCampusGame(snapshot).equipped,reward.id);assert.deepEqual(money(s),before);assert.deepEqual(money(snapshot),before);assert.equal(snapshot.learning.points,0);
});

test('spending less story money does not earn a higher skill score',()=>{
 const a=student(),b=student(),idA=start(a),idB=start(b);const dinner=finish(a,idA,[0,0,0]),afterDinner=finish(b,idB,[1,0,0]);assert.notEqual(dinner.money.wallet,afterDinner.money.wallet);assert.equal(dinner.stars,afterDinner.stars);assert.equal(dinner.stars,3);assert.equal(getCampusGame(a).totalStars,getCampusGame(b).totalStars);
});

test('earlier choices change later scenes and branch endings instead of only changing a score',()=>{
 const a=student(),b=student(),idA=start(a),idB=start(b);choose(a,idA,0);choose(b,idB,1);next(a,idA);next(b,idB);
 const routeA=getCampusRun(a,idA),routeB=getCampusRun(b,idB);assert.notEqual(routeA.turn.title,routeB.turn.title);assert.notEqual(routeA.turn.body,routeB.turn.body);assert.match(routeA.turn.body,/dinner/i);assert.match(routeB.turn.body,/after dinner/i);
 const endA=finish(a,idA),endB=finish(b,idB);assert.equal(endA.stars,endB.stars);assert.notEqual(endA.ending.title,endB.ending.title,'Equal-skill routes retain a different story ending.');
});

test('an explicit confirmed story receipt credits once and rewind cannot turn its screenshot into a second payment',()=>{
 const s=student(),beforeBanking=money(s),ids=getCampusGame(s).missions.map(m=>m.id);for(const missionId of ids.slice(0,4))finish(s,start(s,missionId));
 const id=start(s,ids[4]);choose(s,id,0);next(s,id);choose(s,id,0);const prior=getCampusRun(s,id),priorToken=prior.stepId;assert.equal(prior.money.wallet,5000);assert.equal(prior.money.expected,4000);next(s,id);
 const receipt=getCampusRun(s,id);assert.match(receipt.turn.body,/confirm/i);assert.equal(receipt.money.wallet,9000);assert.equal(receipt.money.expected,0);
 const saved=clone(s.learning.game);must(act(s,'campusContinue',{runId:id,stepId:priorToken}));assert.deepEqual(s.learning.game,saved,'The entry event is not applied twice on duplicate advance.');
 choose(s,id,2);assert.equal(getCampusRun(s,id).money.wallet,9000);const image=getCampusRun(s,id);must(act(s,'campusRewind',{runId:id,stepId:image.stepId}));assert.equal(getCampusRun(s,id).money.wallet,9000);assert.equal(getCampusRun(s,id).money.expected,0,'Rewinding a claim does not undo a confirmed receipt.');choose(s,id,0);next(s,id);assert.equal(getCampusRun(s,id).money.wallet,9000);assert.equal(getCampusRun(s,id).money.expected,0);assert.deepEqual(money(s),beforeBanking);
});
