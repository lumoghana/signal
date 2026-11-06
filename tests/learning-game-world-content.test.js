import test from 'node:test';
import assert from 'node:assert/strict';
import {CAMPUS_MISSIONS,getCampusRun,handleCampusGameAction} from '../dist/js/learning-game-model.js';
import {getWorldPresentation} from '../dist/js/learning-game-world-content.js';

const student=()=>({wallet:900000,budget:{items:[{amount:12000}]},transactions:[],ious:[],boxes:[],account:{signedOut:false,status:'active'},learning:{enrolled:true,points:45,lessonProgress:{},sessions:[],activities:[],awards:[]}});
const clone=value=>JSON.parse(JSON.stringify(value));
const act=(s,type,p={})=>{const result=handleCampusGameAction(s,type,p,{now:'2026-11-04T12:00:00Z'});assert.equal(result.ok,true,result.message);return result;};
const choose=(s,runId,choiceId)=>act(s,'campusChoose',{runId,stepId:getCampusRun(s,runId).stepId,choiceId});
const next=(s,runId)=>act(s,'campusContinue',{runId,stepId:getCampusRun(s,runId).stepId});
const countWords=value=>String(value).trim().split(/\s+/).length;
const money=value=>`GH₵${value/100}`;
function finish(s,missionId){
 const {runId}=act(s,'campusStart',{missionId});
 for(let i=0;i<3;i++){
  const view=getCampusRun(s,runId);choose(s,runId,view.turn.choices[0].id);next(s,runId);
 }
}
function start(missionId){
 const s=student(),mission=CAMPUS_MISSIONS.find(m=>m.id===missionId);
 for(const prior of CAMPUS_MISSIONS.slice(0,mission.index))finish(s,prior.id);
 const {runId}=act(s,'campusStart',{missionId});return {s,runId};
}
const target=(view,id)=>getWorldPresentation(view).targets.find(t=>t.id===id);
const visible=display=>[display.prompt,display.heroLine,...display.targets.map(t=>`${t.label} ${t.costLabel}`),...display.facts.map(f=>`${f.label} ${f.value}`)].join(' ');

test('all 78 reachable scenes and 234 choices have concise world targets and factual outcomes',()=>{
 let scenes=0,choices=0;
 const foundTurns=new Set(),foundChoices=new Set(),worlds=new Set();
 function walk(s,runId){
  const view=getCampusRun(s,runId);if(view.status==='completed')return;
  const before=JSON.stringify(view),display=getWorldPresentation(view);
  assert.equal(JSON.stringify(view),before,'presentation cannot change the view');
  assert.ok(['campus','print','hostel','pay','promise','recovery'].includes(display.world));
  assert.ok(countWords(display.prompt)<=8,display.prompt);
  assert.ok(countWords(display.heroLine)<=8,display.heroLine);
  assert.ok(display.facts.length<=2);
  assert.deepEqual(display.targets.map(t=>t.id),view.turn.choices.map(c=>c.id));
  assert.equal(display.outcome,null);
  for(const t of display.targets){assert.ok(t.label&&countWords(t.label)<=4,t.label);assert.ok(t.icon);assert.ok(t.kind);assert.equal(typeof t.costLabel,'string');}
  foundTurns.add(view.turn.id);worlds.add(display.world);scenes++;
  for(const c of view.turn.choices){
   foundChoices.add(c.id);choices++;
   const branch=clone(s);choose(branch,runId,c.id);const consequence=getCampusRun(branch,runId),outcome=getWorldPresentation(consequence).outcome;
   assert.ok(outcome.line&&countWords(outcome.line)<=10,outcome.line);
   assert.equal(outcome.choiceId,c.id);
   assert.equal(outcome.skill,consequence.lastOutcome.skill);
   assert.equal(outcome.kind,consequence.lastOutcome.tone==='clear'?'clear':'thoughtful');
   if(consequence.lastOutcome.title==='This move needs a different plan.'){
    assert.equal(outcome.line,'Not enough room. Try another route.');
    assert.deepEqual(consequence.money,view.money);
   }
   next(branch,runId);walk(branch,runId);
  }
 }
 for(const m of CAMPUS_MISSIONS){const {s,runId}=start(m.id);walk(s,runId);}
 assert.equal(scenes,78);assert.equal(choices,234);assert.equal(foundTurns.size,18);assert.equal(foundChoices.size,54);assert.equal(worlds.size,6);
});

test('every cost in a resolved choice stays visible, including risky and recovery branches',()=>{
 function walk(s,runId){
  const view=getCampusRun(s,runId);if(view.status==='completed')return;
  const display=getWorldPresentation(view);
  for(const c of view.turn.choices){
   const prices=[...`${c.label} ${c.detail}`.matchAll(/GH₵(\d+(?:\.\d+)?)/g)].map(m=>`GH₵${m[1]}`);
   const prop=display.targets.find(t=>t.id===c.id);
   for(const price of prices)assert.ok(prop.costLabel.includes(price),`${view.turn.id}/${c.id} hid ${price}`);
   const branch=clone(s);choose(branch,runId,c.id);next(branch,runId);walk(branch,runId);
  }
 }
 for(const m of CAMPUS_MISSIONS){const {s,runId}=start(m.id);walk(s,runId);}
 const {s,runId}=start('weekend-run');assert.equal(target(getCampusRun(s,runId),'full-night').costLabel,'GH₵65');
 choose(s,runId,'full-night');assert.equal(getWorldPresentation(getCampusRun(s,runId)).outcome.line,'GH₵15 still needs covering.');next(s,runId);
 let view=getCampusRun(s,runId);assert.equal(target(view,'shared-copy').label,'Ask course rep');assert.equal(target(view,'shared-copy').costLabel,'No new cost');assert.equal(target(view,'shared-copy').kind,'support');
 assert.doesNotMatch(visible(getWorldPresentation(view)),/GH₵10/,'recovery arrangement is not the old shared-copy price');
 const before=view.money;choose(s,runId,'shared-copy');view=getCampusRun(s,runId);assert.deepEqual(view.money,before);assert.equal(getWorldPresentation(view).outcome.line,'Reference agreed. GH₵15 still needs covering.');
});

test('final bill prop and result use the actual solo, shared or recovered bill',()=>{
 for(const [route,cost] of [['own-trip',6500],['shared-ride',6000],['forty-plan',6500]]){
  const {s,runId}=start('printing-plot');choose(s,runId,'ask-breakdown');next(s,runId);choose(s,runId,route);next(s,runId);
  let view=getCampusRun(s,runId);assert.equal(target(view,'match-bill').costLabel,`${money(cost)} bill`);assert.deepEqual(getWorldPresentation(view).facts,[{label:'Sample bill',value:money(cost)}]);
  const before=view.money.wallet;choose(s,runId,'match-bill');view=getCampusRun(s,runId);
  assert.equal(before-view.money.wallet,cost);assert.equal(getWorldPresentation(view).outcome.line,`${money(cost)} paid. Reservation released once.`);
 }
});

test('a blocked payment has no success copy or invented reservation release',()=>{
 const {s,runId}=start('printing-plot');choose(s,runId,'ask-breakdown');next(s,runId);choose(s,runId,'own-trip');next(s,runId);
 s.learning.game.runs.find(r=>r.id===runId).money.wallet=6000;
 const before=getCampusRun(s,runId).money;choose(s,runId,'match-bill');const view=getCampusRun(s,runId),display=getWorldPresentation(view);
 assert.deepEqual(view.money,before);assert.equal(display.outcome.line,'Not enough room. Try another route.');assert.equal(display.outcome.kind,'thoughtful');assert.equal(display.outcome.skill,false);
});

test('promises, offered cash, pending payments and group approvals never become confirmation',()=>{
 const {s,runId}=start('tomorrow-trap');let view=getCampusRun(s,runId),display=getWorldPresentation(view);
 assert.match(display.prompt,/still expected/);assert.equal(target(view,'expected-lane').costLabel,'GH₵40 expected');
 choose(s,runId,'expected-lane');next(s,runId);view=getCampusRun(s,runId);display=getWorldPresentation(view);
 assert.match(display.prompt,/offers GH₵30 cash/);assert.equal(target(view,'cash-location').costLabel,'GH₵30 cash offer');assert.equal(target(view,'choose-transfer').costLabel,'Not received');
 const wallet=view.money.wallet;choose(s,runId,'cash-wallet');assert.equal(getCampusRun(s,runId).money.wallet,wallet);assert.match(getWorldPresentation(getCampusRun(s,runId)).outcome.line,/not a Lumo credit/);
 const counter=start('counter-chaos');choose(counter.s,counter.runId,'name-skip');next(counter.s,counter.runId);view=getCampusRun(counter.s,counter.runId);
 assert.match(getWorldPresentation(view).prompt,/separate payment is pending/);choose(counter.s,counter.runId,'pay-again');assert.match(getWorldPresentation(getCampusRun(counter.s,counter.runId)).outcome.line,/First still pending/);next(counter.s,counter.runId);view=getCampusRun(counter.s,counter.runId);display=getWorldPresentation(view);
 assert.match(display.prompt,/No payment result/);assert.equal(target(view,'wait-confirmed').costLabel,'Awaiting result');assert.equal(target(view,'chat-receipt').costLabel,'Not confirmed');
 const before=view.money;choose(counter.s,counter.runId,'chat-receipt');assert.deepEqual(getCampusRun(counter.s,counter.runId).money,before);assert.match(getWorldPresentation(getCampusRun(counter.s,counter.runId)).outcome.line,/not receipts/);
});

test('official receipt arrival reflects the engine credit once and survives refresh and rewind',()=>{
 const {s,runId}=start('tomorrow-trap');choose(s,runId,'expected-lane');next(s,runId);choose(s,runId,'choose-transfer');
 const before=getCampusRun(s,runId).money;assert.equal(getWorldPresentation(getCampusRun(s,runId)).arrival,undefined);next(s,runId);
 let view=getCampusRun(s,runId),display=getWorldPresentation(view);assert.equal(view.money.wallet,before.wallet+4000);assert.equal(view.money.expected,before.expected-4000);assert.deepEqual(display.arrival,{amount:4000,label:'GH₵40 confirmed',credited:true});
 const credited=clone(view.money);for(let i=0;i<3;i++){const snapshot=JSON.stringify(s);getWorldPresentation(getCampusRun(s,runId));assert.equal(JSON.stringify(s),snapshot);}
 choose(s,runId,'image-proof');view=getCampusRun(s,runId);assert.deepEqual(view.money,credited);assert.equal(getWorldPresentation(view).outcome.line,'Same reference. No second credit.');
 act(s,'campusRewind',{runId,stepId:view.stepId});view=getCampusRun(clone(s),runId);assert.deepEqual(view.money,credited);assert.deepEqual(getWorldPresentation(view).arrival,display.arrival);
 choose(s,runId,'match-once');view=getCampusRun(s,runId);assert.deepEqual(view.money,credited);assert.equal(getWorldPresentation(view).outcome.line,'GH₵40 counted once.');
});

test('important scenario facts stay on the play area without original paragraphs',()=>{
 const hostel=start('hostel-countdown');assert.deepEqual(getWorldPresentation(getCampusRun(hostel.s,hostel.runId)).facts,[{label:'Deadline',value:'3 weeks'},{label:'Target',value:'GH₵120'}]);
 const print=start('printing-plot');choose(print.s,print.runId,'headline-only');next(print.s,print.runId);assert.deepEqual(getWorldPresentation(getCampusRun(print.s,print.runId)).facts,[{label:'Full trip',value:'GH₵65'},{label:'Shared ride',value:'GH₵60'}]);
 const reset=start('plot-twist-week');assert.deepEqual(getWorldPresentation(getCampusRun(reset.s,reset.runId)).facts,[{label:'Essentials',value:'GH₵40'},{label:'Optional club',value:'GH₵15'}]);
 choose(reset.s,reset.runId,'extra-spend');next(reset.s,reset.runId);assert.deepEqual(getWorldPresentation(getCampusRun(reset.s,reset.runId)).facts,[{label:'Saving rule',value:'GH₵10'}]);
 assert.equal(getWorldPresentation(null),null);assert.equal(getWorldPresentation({}),null);
});
