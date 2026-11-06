import test from 'node:test';
import assert from 'node:assert/strict';
import {CAMPUS_MISSIONS,getCampusRun,handleCampusGameAction} from '../dist/js/learning-game-model.js';
import {getCampusReflection} from '../dist/js/learning-game-reflection.js';

const student=()=>({wallet:913400,budget:{items:[{amount:45000}]},transactions:[{id:'private-transaction'}],ious:[],boxes:[],account:{status:'active',signedOut:false},learning:{enrolled:true,points:45,lessonProgress:{},sessions:[],activities:[],awards:[]}});
const clone=value=>JSON.parse(JSON.stringify(value));
const words=value=>String(value).trim().split(/\s+/).length;
const act=(s,type,p={})=>{const result=handleCampusGameAction(s,type,p,{now:'2026-11-04T12:00:00Z'});assert.equal(result.ok,true,result.message);return result;};
const choose=(s,id,choiceId)=>act(s,'campusChoose',{runId:id,stepId:getCampusRun(s,id).stepId,choiceId});
const next=(s,id)=>act(s,'campusContinue',{runId:id,stepId:getCampusRun(s,id).stepId});
function finish(s,missionId,choices=[]){
 const {runId}=act(s,'campusStart',{missionId});
 for(let i=0;i<3;i++){const view=getCampusRun(s,runId);choose(s,runId,choices[i]||view.turn.choices[0].id);next(s,runId);}
 return getCampusRun(s,runId);
}
function start(missionId){
 const s=student(),mission=CAMPUS_MISSIONS.find(m=>m.id===missionId);
 for(const prior of CAMPUS_MISSIONS.slice(0,mission.index))finish(s,prior.id);
 const {runId}=act(s,'campusStart',{missionId});return {s,runId};
}
function complete(missionId,choices){const {s,runId}=start(missionId);for(const id of choices){choose(s,runId,id);next(s,runId);}return {s,runId,run:getCampusRun(s,runId),reflection:getCampusReflection(getCampusRun(s,runId))};}

test('all 162 completed routes receive a short lesson and a factual choice-specific insight',()=>{
 let count=0;const lessons=new Set(),insights=new Set();
 function walk(s,id){
  const run=getCampusRun(s,id);
  if(run.status!=='completed'){
   assert.equal(getCampusReflection(run),null,'lessons follow the set of challenges');
   for(const c of run.turn.choices){const branch=clone(s);choose(branch,id,c.id);assert.equal(getCampusReflection(getCampusRun(branch,id)),null);next(branch,id);walk(branch,id);}return;
  }
  const snapshot=JSON.stringify(s),view=JSON.stringify(run),reflection=getCampusReflection(run);
  assert.equal(JSON.stringify(s),snapshot);assert.equal(JSON.stringify(run),view,'reflection cannot change a completed run');
  assert.equal(reflection.chapterId,run.missionId);assert.equal(reflection.title,run.title);assert.equal(reflection.challengeCount,3);
  assert.equal(reflection.storyLabel,'This run · story money');
  assert.ok(words(reflection.lesson.title)<=6,reflection.lesson.title);assert.ok(words(reflection.lesson.line)<=18,reflection.lesson.line);
  assert.ok(words(reflection.insight.title)<=6,reflection.insight.title);assert.ok(words(reflection.insight.line)<=24,reflection.insight.line);
  assert.ok(['split','sum','pace','trail','receipt','reset'].includes(reflection.lesson.visual.kind));
  assert.ok(reflection.lesson.visual.items.length>=2&&reflection.lesson.visual.items.length<=3);
  for(const item of reflection.lesson.visual.items){assert.ok(item.label);if(item.amount!==undefined)assert.ok(Number.isSafeInteger(item.amount)&&item.amount>=0);}
  const metric=reflection.insight.metric;
  if(metric){assert.equal(metric.unit,'money');assert.ok(metric.label);if(metric.value!==undefined)assert.ok(Number.isSafeInteger(metric.value)&&metric.value>=0);else assert.ok(Number.isSafeInteger(metric.before)&&Number.isSafeInteger(metric.after));}
  const m=reflection.money;assert.equal(m.wallet,run.money.wallet);assert.equal(m.expected,run.money.expected);
  assert.equal(m.flexible,Math.max(0,m.wallet-m.committed-m.cushion));assert.equal(m.shortfall,Math.max(0,m.committed+m.cushion-m.wallet));
  assert.deepEqual(reflection.skills,run.ending.skills);assert.equal(reflection.skills.filter(s=>s.earned).length,run.stars);
  assert.equal(reflection.insight.routeLabel,'Try this in Lumo');
  assert.doesNotMatch(JSON.stringify(reflection),/private-transaction|913400|45000/,'no private balance, budget or transactions');
  lessons.add(reflection.lesson.title);insights.add(reflection.insight.title);count++;
 }
 for(const mission of CAMPUS_MISSIONS){const {s,runId}=start(mission.id);walk(s,runId);}
 assert.equal(count,162);assert.equal(lessons.size,6);assert.ok(insights.size>=20);
});

test('printing reflection uses the confirmed solo, shared or recovered bill rather than a headline quote',()=>{
 for(const [route,paid] of [['own-trip',6500],['shared-ride',6000],['forty-plan',6500]]){
  const {run,reflection}=complete('printing-plot',['ask-breakdown',route,'match-bill']);
  assert.equal(reflection.insight.metric.value,paid);assert.equal(9500-run.money.wallet,paid);
  assert.match(reflection.insight.line,new RegExp(`GH₵${paid/100} bill`));assert.match(reflection.insight.line,/released once/);
  assert.equal(run.money.committed,1000);
  assert.deepEqual(reflection.lesson.visual.items.map(i=>i.amount),[4000,1500,1000]);
 }
 for(const choice of ['query-extra','skip-bill']){
  const {run,reflection}=complete('printing-plot',['ask-breakdown','own-trip',choice]);
  assert.equal(run.money.wallet,9500);assert.equal(reflection.insight.metric.value,0);
  assert.doesNotMatch(reflection.insight.line,/bill matched|was released/);
 }
});

test('recovery, expected money and support remain separate from available story money',()=>{
 const risky=complete('weekend-run',['full-night','shared-copy','keep-expected']);
 assert.equal(risky.run.ending.branch.printingSupport,true);assert.equal(risky.reflection.insight.metric.value,risky.run.money.shortfall);
 assert.match(risky.reflection.insight.line,/still finished/);assert.equal(risky.reflection.money.expected,2000);
 const promise=complete('weekend-run',['dinner-cap','reserve-print','promise-spend']);
 assert.equal(promise.reflection.insight.title,'Message, not money');assert.equal(promise.reflection.insight.metric.value,2000);
 const hostel=complete('hostel-countdown',['promise-all','full-data','mark-funded']);
 assert.equal(hostel.reflection.insight.metric.value,12000);assert.match(hostel.reflection.insight.line,/stayed expected/);
 const late=complete('plot-twist-week',['extra-spend','pause-rule','ask-support']);
 assert.equal(late.reflection.insight.metric.value,2500);assert.equal(late.reflection.money.expected,15000);
 assert.match(late.reflection.insight.line,/offer of help did not cover/);
 const flex=complete('plot-twist-week',['defer-club','review-rule','compare-gap']);
 assert.deepEqual(flex.reflection.insight.metric,{label:'Story planned costs',before:5500,after:4000,unit:'money'});
});

test('payment insight distinguishes extra debit, pending, approval and confirmation',()=>{
 const repeat=complete('counter-chaos',['confirm-number','pay-again','wait-confirmed']);
 assert.equal(repeat.reflection.insight.metric.value,2000);assert.match(repeat.reflection.insight.line,/first was pending/);
 const approval=complete('counter-chaos',['confirm-number','same-reference','chat-receipt']);
 assert.match(approval.reflection.insight.line,/no confirmed payment result/);assert.equal(approval.reflection.money.wallet,8000);
 assert.deepEqual(approval.reflection.lesson.visual.items.map(i=>i.label),['Approved','Processing','Confirmed']);
 const safe=complete('counter-chaos',['trusted-channel','official-status','review-card']);
 assert.equal(safe.reflection.insight.metric.value,0);assert.equal(safe.reflection.money.wallet,8000);
});

test('one official receipt is counted once and cash never becomes Lumo credit',()=>{
 const duplicate=complete('tomorrow-trap',['expected-lane','choose-transfer','image-proof']);
 assert.equal(duplicate.reflection.insight.metric.value,4000);assert.equal(duplicate.run.money.wallet,9000);assert.equal(duplicate.run.money.expected,0);
 assert.match(duplicate.reflection.insight.line,/no second credit/);
 const cash=complete('tomorrow-trap',['expected-lane','cash-wallet','match-once']);
 assert.equal(cash.reflection.insight.metric.value,0);assert.equal(cash.run.money.wallet,9000);assert.match(cash.reflection.insight.line,/cash offer did not credit/);
 const spend=complete('tomorrow-trap',['promise-shopping','cash-location','match-once']);
 assert.deepEqual(spend.reflection.insight.metric,{label:'Story wallet',before:5000,after:6000,unit:'money'});
 const saved=JSON.stringify(duplicate.s);assert.deepEqual(getCampusReflection(getCampusRun(JSON.parse(saved),duplicate.runId)),duplicate.reflection);
});

test('legacy saved runs do not invent debits or confirmed repayment arrivals',()=>{
 const print=clone(complete('printing-plot',['ask-breakdown','own-trip','match-bill']).run);
 print.money.wallet=9500;assert.equal(getCampusReflection(print).insight.metric.value,0);assert.match(getCampusReflection(print).insight.line,/does not record a completed debit/);
 const receipt=clone(complete('tomorrow-trap',['expected-lane','cash-location','match-once']).run);
 delete receipt.ending.branch.officialRepayment;receipt.money.wallet=5000;receipt.money.expected=4000;
 assert.equal(getCampusReflection(receipt).insight.metric.value,0);assert.match(getCampusReflection(receipt).insight.line,/no official repayment arrival/);
});

test('missing, incomplete and malformed chapter inputs have no reflection',()=>{
 for(const value of [null,{}, {status:'completed',missionId:'unknown'}, {status:'completed',missionId:'weekend-run',ending:{branch:{}},money:{wallet:NaN}}])assert.equal(getCampusReflection(value),null);
 const {s,runId}=start('weekend-run');assert.equal(getCampusReflection(getCampusRun(s,runId)),null);
 choose(s,runId,'dinner-cap');assert.equal(getCampusReflection(getCampusRun(s,runId)),null);
});
