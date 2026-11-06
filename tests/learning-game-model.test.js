import test from 'node:test';
import assert from 'node:assert/strict';
import {CAMPUS_MISSIONS,CAMPUS_REWARDS,GAME_ACTIONS,ensureGameState,validGameState,getCampusGame,getCampusRun,handleCampusGameAction} from '../dist/js/learning-game-model.js';
const student=()=>({wallet:900000,budget:{items:[{amount:12000}]},transactions:[{id:'real-payment',amount:5000}],ious:[{amount:8000}],boxes:[{balance:10000}],account:{signedOut:false,status:'active',privacy:{personalisation:false}},learning:{enrolled:true,points:45,personalised:false,lessonProgress:{kept:{completedAt:'2026-11-01T00:00:00Z'}},sessions:[],activities:[],awards:[]}});
const act=(s,t,p={})=>{const r=handleCampusGameAction(s,t,p,{now:'2026-11-04T12:00:00Z'});assert.equal(r.ok,true,r.message);return r;};
const move=(s,runId,choiceId)=>{const v=getCampusRun(s,runId);return act(s,'campusChoose',{runId,stepId:v.stepId,choiceId});};
const next=(s,runId)=>{const v=getCampusRun(s,runId);return act(s,'campusContinue',{runId,stepId:v.stepId});};
function finish(s,missionId,{good=true,replay=false}={}){
 const started=act(s,'campusStart',{missionId,replay}),runId=started.runId;
 for(let i=0;i<3;i++){
  let v=getCampusRun(s,runId);assert.equal(v.status,'choice');const definition=CAMPUS_MISSIONS.find(m=>m.id===missionId).turns[i];
  const options=definition.choices.filter(c=>c.skill===good);
  if(!good){move(s,runId,(options[0]||definition.choices[0]).id);}
  else {let found=false;for(const c of options){move(s,runId,c.id);v=getCampusRun(s,runId);if(v.lastOutcome.skill){found=true;break;}act(s,'campusRewind',{runId,stepId:v.stepId});}assert.ok(found,`${missionId} turn ${i} has a sound route`);}
  next(s,runId);
 }
 return getCampusRun(s,runId);
}
const financial=s=>JSON.stringify({wallet:s.wallet,budget:s.budget,transactions:s.transactions,ious:s.ious,boxes:s.boxes});

test('campus game has six three-turn missions and reads no personal financial records',()=>{
 assert.equal(CAMPUS_MISSIONS.length,6);for(const m of CAMPUS_MISSIONS){assert.equal(m.turns.length,3);assert.equal(m.skills.length,3);for(const t of m.turns){assert.ok(t.choices.length>=2);assert.ok(t.choices.filter(c=>c.skill).length>=2);}}
 const s=student();for(const k of ['wallet','budget','transactions','ious','boxes'])Object.defineProperty(s,k,{get(){throw new Error(`Personal ${k} was read`);}});
 getCampusGame(s);const r=act(s,'campusStart',{missionId:CAMPUS_MISSIONS[0].id});getCampusRun(s,r.runId);move(s,r.runId,CAMPUS_MISSIONS[0].turns[0].choices[0].id);next(s,r.runId);
 assert.equal(s.learning.points,45);assert.deepEqual(s.learning.lessonProgress,{kept:{completedAt:'2026-11-01T00:00:00Z'}});
});

test('getters do not create a game or mutate its returned views',()=>{
 const s=student(),before=JSON.stringify(s);getCampusGame(s);assert.equal(getCampusRun(s),null);assert.equal(JSON.stringify(s),before);
 const {runId}=act(s,'campusStart',{missionId:CAMPUS_MISSIONS[0].id});const saved=JSON.stringify(s);const v=getCampusRun(s,runId);v.money.wallet=1;v.turn.choices[0].label='changed';getCampusGame(s).missions[0].title='changed';assert.equal(JSON.stringify(s),saved);
});

test('progression unlocks every mission and stars reflect skills rather than ending money',()=>{
 const a=student(),b=student();a.wallet=0;b.wallet=90000000;
 const beforeA=financial(a),beforeB=financial(b);
 for(const mission of CAMPUS_MISSIONS){assert.ok(getCampusGame(a).missions.find(m=>m.id===mission.id).unlocked);assert.equal(finish(a,mission.id).stars,3);assert.equal(finish(b,mission.id).stars,3);}
 assert.equal(getCampusGame(a).totalStars,18);assert.equal(getCampusGame(a).allCompleted,true);assert.deepEqual(getCampusGame(a).missions.map(m=>m.bestStars),getCampusGame(b).missions.map(m=>m.bestStars));assert.equal(financial(a),beforeA);assert.equal(financial(b),beforeB);assert.equal(a.learning.points,45);assert.equal(a.learning.activities.length,0);
});

test('an imperfect completed run unlocks the next chapter and supports a stronger replay without farming stars',()=>{
 const s=student(),first=CAMPUS_MISSIONS[0];assert.equal(handleCampusGameAction(s,'campusStart',{missionId:CAMPUS_MISSIONS[1].id}).ok,false);
 const imperfect=finish(s,first.id,{good:false});assert.equal(imperfect.stars,0);assert.equal(getCampusGame(s).missions[1].unlocked,true);
 const improved=finish(s,first.id,{replay:true});assert.equal(improved.stars,3);assert.equal(improved.starGain,3);assert.equal(getCampusGame(s).totalStars,3);
 const repeated=finish(s,first.id,{replay:true});assert.equal(repeated.stars,3);assert.equal(repeated.starGain,0);assert.equal(getCampusGame(s).totalStars,3);assert.equal(s.learning.points,45);
});

test('duplicate submissions and stale scene tokens never repeat a consequence or advance twice',()=>{
 const s=student(),m=CAMPUS_MISSIONS[0],{runId}=act(s,'campusStart',{missionId:m.id}),v=getCampusRun(s,runId),p={runId,stepId:v.stepId,choiceId:m.turns[0].choices[0].id};
 act(s,'campusChoose',p);const chosen=JSON.stringify(s.learning.game);assert.equal(act(s,'campusChoose',p).duplicate,true);assert.equal(JSON.stringify(s.learning.game),chosen);
 const cp={runId,stepId:v.stepId};act(s,'campusContinue',cp);const advanced=JSON.stringify(s.learning.game);assert.equal(act(s,'campusContinue',cp).duplicate,true);assert.equal(JSON.stringify(s.learning.game),advanced);
 assert.equal(handleCampusGameAction(s,'campusChoose',{...p,choiceId:m.turns[0].choices[1].id}).ok,false);assert.equal(getCampusRun(s,runId).turnIndex,1);
 const startedAgain=act(s,'campusStart',{missionId:m.id,replay:true});assert.equal(startedAgain.runId,runId);assert.equal(s.learning.game.runs.length,1);
});

test('rewind restores the exact fictional ledger and invalidates the old scene token',()=>{
 const s=student(),m=CAMPUS_MISSIONS[0],{runId}=act(s,'campusStart',{missionId:m.id}),before=getCampusRun(s,runId),choice=m.turns[0].choices.find(c=>!c.skill);
 move(s,runId,choice.id);const after=getCampusRun(s,runId),p={runId,stepId:after.stepId};act(s,'campusRewind',p);const rewound=getCampusRun(s,runId);assert.deepEqual(rewound.money,before.money);assert.notEqual(rewound.stepId,before.stepId);assert.equal(rewound.stars,0);
 const saved=JSON.stringify(s.learning.game);assert.equal(act(s,'campusRewind',p).duplicate,true);assert.equal(JSON.stringify(s.learning.game),saved);assert.equal(handleCampusGameAction(s,'campusChoose',{runId,stepId:before.stepId,choiceId:choice.id}).duplicate,true);assert.equal(JSON.stringify(s.learning.game),saved);assert.equal(handleCampusGameAction(s,'campusChoose',{runId,stepId:before.stepId,choiceId:m.turns[0].choices.find(c=>c.skill).id}).ok,false);
});

test('pending choices survive refresh and final continuation awards a completion once',()=>{
 let s=student(),m=CAMPUS_MISSIONS[0],{runId}=act(s,'campusStart',{missionId:m.id});
 for(let i=0;i<3;i++){move(s,runId,m.turns[i].choices.find(c=>c.skill).id);s=JSON.parse(JSON.stringify(s));assert.equal(validGameState(s),true);assert.equal(getCampusRun(s,runId).status,'consequence');if(i<2)next(s,runId);}
 const p={runId,stepId:getCampusRun(s,runId).stepId};act(s,'campusContinue',p);const completed=JSON.stringify(s.learning.game),stars=getCampusGame(s).totalStars;assert.equal(act(s,'campusContinue',p).duplicate,true);assert.equal(JSON.stringify(s.learning.game),completed);assert.equal(getCampusGame(s).totalStars,stars);
});

test('cosmetic rewards have fixed thresholds and cannot be equipped before they are earned',()=>{
 const s=student(),reward=CAMPUS_REWARDS[0];assert.equal(handleCampusGameAction(s,'campusEquip',{rewardId:reward.id}).ok,false);
 finish(s,CAMPUS_MISSIONS[0].id);const g=getCampusGame(s);assert.ok(g.rewards.find(r=>r.id===reward.id).unlocked);const money=financial(s);act(s,'campusEquip',{rewardId:reward.id});assert.equal(getCampusGame(s).equipped,reward.id);assert.equal(act(s,'campusEquip',{rewardId:reward.id}).duplicate,true);assert.equal(financial(s),money);assert.equal(s.learning.points,45);
});

test('bad optional saves reset only the campus game and preserve established learning and finance',()=>{
 const s=student(),old=JSON.stringify({...s.learning}),money=financial(s);s.learning.game={schema:1,runs:'broken'};assert.equal(validGameState(s),false);ensureGameState(s);assert.equal(validGameState(s),true);assert.match(getCampusGame(s).recoveryNotice,/lessons, progress and money records/);const {game,...learning}=s.learning;assert.equal(JSON.stringify(learning),old);assert.equal(financial(s),money);
});

test('locked, unknown, signed-out and unenrolled actions cannot create progress',()=>{
 for(const change of [s=>{s.learning.enrolled=false;},s=>{s.account.signedOut=true;},s=>{s.account.status='closed';}]){const s=student();change(s);const before=JSON.stringify(s);assert.equal(handleCampusGameAction(s,'campusStart',{missionId:CAMPUS_MISSIONS[0].id}).ok,false);assert.equal(JSON.stringify(s),before);}
 const s=student();assert.equal(handleCampusGameAction(s,'not-a-game-action',{}),null);assert.equal(handleCampusGameAction(s,'campusStart',{missionId:'forged'}).ok,false);assert.equal(handleCampusGameAction(s,'campusChoose',{runId:'forged',stepId:'x',choiceId:'x'}).ok,false);assert.equal(getCampusGame(s).totalStars,0);assert.equal(GAME_ACTIONS.size,5);
});

test('route choices change a later scene and the ending without valuing the cheaper route more',()=>{
 const a=student(),b=student(),m=CAMPUS_MISSIONS[0];
 const ra=act(a,'campusStart',{missionId:m.id}).runId,rb=act(b,'campusStart',{missionId:m.id}).runId;
 move(a,ra,'dinner-cap');next(a,ra);move(b,rb,'after-dinner');next(b,rb);
 assert.notEqual(getCampusRun(a,ra).turn.body,getCampusRun(b,rb).turn.body);
 for(const [s,id] of [[a,ra],[b,rb]]){move(s,id,'shared-copy');next(s,id);move(s,id,'keep-expected');next(s,id);}
 const va=getCampusRun(a,ra),vb=getCampusRun(b,rb);assert.equal(va.stars,3);assert.equal(vb.stars,3);assert.notEqual(va.money.wallet,vb.money.wallet);assert.notEqual(va.ending.body,vb.ending.body);
 const stored=JSON.stringify(a.learning.game);va.ending.branch.joinedDinner=false;assert.equal(JSON.stringify(a.learning.game),stored);
});

test('one official sample receipt moves expected money once, including across rewind, repeated continue and refresh',()=>{
 let s=student();for(const m of CAMPUS_MISSIONS.slice(0,4))finish(s,m.id);
 const m=CAMPUS_MISSIONS[4],{runId}=act(s,'campusStart',{missionId:m.id});move(s,runId,'expected-lane');next(s,runId);move(s,runId,'cash-location');const before=getCampusRun(s,runId),p={runId,stepId:before.stepId};act(s,'campusContinue',p);
 let v=getCampusRun(s,runId);assert.equal(v.money.wallet,before.money.wallet+4000);assert.equal(v.money.expected,before.money.expected-4000);const arrival=JSON.stringify(v.money);
 act(s,'campusContinue',p);assert.equal(JSON.stringify(getCampusRun(s,runId).money),arrival);
 move(s,runId,'image-proof');act(s,'campusRewind',{runId,stepId:getCampusRun(s,runId).stepId});assert.equal(JSON.stringify(getCampusRun(s,runId).money),arrival);
 s=JSON.parse(JSON.stringify(s));ensureGameState(s);assert.equal(JSON.stringify(getCampusRun(s,runId).money),arrival);move(s,runId,'match-once');next(s,runId);assert.equal(JSON.stringify(getCampusRun(s,runId).money),arrival);
});

test('printing payments follow the selected route and release the amount actually reserved',()=>{
 for(const [route,paid,reserved] of [['own-trip',6500,6500],['shared-ride',6000,6000],['forty-plan',6500,4000]]){
  const s=student();finish(s,CAMPUS_MISSIONS[0].id);const m=CAMPUS_MISSIONS[1],{runId}=act(s,'campusStart',{missionId:m.id});move(s,runId,'ask-breakdown');next(s,runId);move(s,runId,route);next(s,runId);const before=getCampusRun(s,runId).money;
  move(s,runId,'match-bill');const after=getCampusRun(s,runId);assert.equal(after.lastOutcome.skill,true);assert.equal(after.money.wallet,before.wallet-paid);assert.equal(after.money.committed,before.committed-reserved);assert.equal(after.money.shortfall,0);assert.equal(after.money.flexible,after.money.wallet-after.money.committed-after.money.cushion);
 }
});

test('a branch-aware payment that cannot fit leaves story money intact and offers rewind',()=>{
 const s=student();finish(s,CAMPUS_MISSIONS[0].id);const {runId}=act(s,'campusStart',{missionId:CAMPUS_MISSIONS[1].id});move(s,runId,'ask-breakdown');next(s,runId);move(s,runId,'own-trip');next(s,runId);
 const run=s.learning.game.runs.find(r=>r.id===runId);run.money.wallet=6000;const before=getCampusRun(s,runId).money;move(s,runId,'match-bill');let after=getCampusRun(s,runId);assert.equal(after.lastOutcome.skill,false);assert.deepEqual(after.money,before);act(s,'campusRewind',{runId,stepId:after.stepId});move(s,runId,'query-extra');after=getCampusRun(s,runId);assert.equal(after.lastOutcome.skill,true);assert.deepEqual(after.money,before);
});

test('every reachable later scene retains a skilled recovery route after any earlier choice',()=>{
 let scenes=0;
 function walk(state,runId){
  const v=getCampusRun(state,runId);if(v.status==='completed')return;
  assert.equal(v.status,'choice');let skilled=0;
  for(const choice of v.turn.choices){const branch=JSON.parse(JSON.stringify(state));move(branch,runId,choice.id);if(getCampusRun(branch,runId).lastOutcome.skill)skilled++;next(branch,runId);walk(branch,runId);}
  assert.ok(skilled>0,`${v.missionId}/${v.turn.id} needs at least one skilled route`);scenes++;
 }
 for(const m of CAMPUS_MISSIONS){const s=student();for(const prior of CAMPUS_MISSIONS.slice(0,m.index))finish(s,prior.id);const {runId}=act(s,'campusStart',{missionId:m.id});walk(s,runId);}
 assert.equal(scenes,78);
});
