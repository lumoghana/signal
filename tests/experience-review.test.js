import test from 'node:test';
import assert from 'node:assert/strict';
import {createEmptyState} from '../dist/js/model.js';
import {getMoneyIQ,handleMoneyIQAction} from '../dist/js/money-iq-model.js';
import {getLearningDashboard,handleLearningAction} from '../dist/js/learning-model.js';
import {CAMPUS_MISSIONS,getCampusRun,getCampusGame,handleCampusGameAction} from '../dist/js/learning-game-model.js';
import {filterActivity} from '../dist/js/activity-view.js';
import {renderAccount} from '../dist/js/account-ui.js';
import {bindSupportDraft,getSupportDraft,clearSupportDraft} from '../dist/js/account-support-drafts.js';

const now=new Date('2026-11-04T12:00:00Z'), options={now};
const must=result=>{assert.equal(result.ok,true,result.message);return result;};
const financial=s=>JSON.stringify(Object.fromEntries(Object.entries(s).filter(([key])=>key!=='learning')));

test('a saved Money IQ reveal links to its exact timestamp, including older saved routes',()=>{
 const s=createEmptyState();s.onboardingDone=true;
 must(handleLearningAction(s,'learningEnroll',{goal:'allowance',personalised:true},options));
 const tx=(id,amount,at)=>({id,amount,at,type:'payment',direction:'out',status:'success',category:'Data',rail:'momo',walletDebited:true});
 s.transactions=[tx('before',2000,'2026-11-04T10:00:00Z'),tx('also-before',3000,'2026-11-03T10:00:00Z')];
 const {sessionId}=must(handleMoneyIQAction(s,'moneyIQStart',{mode:'actual'},options));
 const saved=s.learning.moneyIQ.sessions[0];
 // Existing pre-fix snapshots have date-only links; viewing repairs the link, not the ledger.
 delete saved.questions[0].reveal.route.filters.asOf;
 must(handleMoneyIQAction(s,'moneyIQAnswer',{sessionId,questionId:'spending',option:0},options));
 s.transactions.push(tx('later-same-day',9000,'2026-11-04T12:30:00Z'));
 const before=financial(s),view=getMoneyIQ(s,{...options,sessionId}).session;
 assert.equal(view.status,'reveal');assert.equal(view.reveal.value,'GH¢50');
 assert.equal(view.reveal.route.filters.asOf,now.toISOString());
 assert.deepEqual(filterActivity(s.transactions,view.reveal.route.filters).map(t=>t.id),['before','also-before']);
 assert.equal(financial(s),before);
});

test('all practice topic badges have a completed story route without extra XP or money movement',()=>{
 const s=createEmptyState();s.onboardingDone=true;
 must(handleLearningAction(s,'learningEnroll',{goal:'allowance',personalised:false},options));
 const before=financial(s),points=s.learning.points;
 for(const mission of CAMPUS_MISSIONS){
  const started=must(handleCampusGameAction(s,'campusStart',{missionId:mission.id},options));
  for(let i=0;i<mission.turns.length;i++){
   const run=getCampusRun(s,started.runId);
   const choice=mission.turns[i].choices.find(c=>c.skill);
   must(handleCampusGameAction(s,'campusChoose',{runId:run.id,stepId:run.stepId,choiceId:choice.id},options));
   const consequence=getCampusRun(s,run.id);
   must(handleCampusGameAction(s,'campusContinue',{runId:run.id,stepId:consequence.stepId},options));
  }
 }
 const dashboard=getLearningDashboard(s,options),game=getCampusGame(s);
 assert.equal(dashboard.topics.every(t=>t.practised&&t.practiceSource==='story'),true);
 assert.equal(dashboard.topics.some(t=>t.understood),false,'Story practice cannot invent completed lesson understanding.');
 assert.equal(dashboard.level.number,1);assert.equal(s.learning.points,points);
 assert.equal(s.learning.activities.length,0);assert.equal(financial(s),before);
 assert.equal(game.totalStars,game.maxStars);assert.equal(game.rewards.every(r=>r.unlocked),true,'Every advertised cosmetic reward is reachable.');
});

test('merely finishing a story with missing skills does not claim its practice badge',()=>{
 const s=createEmptyState();s.onboardingDone=true;
 must(handleLearningAction(s,'learningEnroll',{goal:'allowance',personalised:false},options));
 const mission=CAMPUS_MISSIONS[0],{runId}=must(handleCampusGameAction(s,'campusStart',{missionId:mission.id},options));
 for(let i=0;i<mission.turns.length;i++){
  const run=getCampusRun(s,runId),choice=mission.turns[i].choices.find(c=>!c.skill);
  must(handleCampusGameAction(s,'campusChoose',{runId,stepId:run.stepId,choiceId:choice.id},options));
  must(handleCampusGameAction(s,'campusContinue',{runId,stepId:getCampusRun(s,runId).stepId},options));
 }
 assert.equal(getLearningDashboard(s,options).topics.find(t=>t.id==='planning').practised,false);
});

class Form {
 constructor(values){this.values=values;this.listeners=new Map();}
 addEventListener(name,fn){if(!this.listeners.has(name))this.listeners.set(name,new Set());this.listeners.get(name).add(fn);}
 removeEventListener(name,fn){this.listeners.get(name)?.delete(fn);}
 emit(name){for(const fn of this.listeners.get(name)||[])fn();}
}
function supportContext(t,route,values,draft={}){
 t.mock.method(globalThis,'FormData',function(form){return Object.entries(form.values);});
 const form=new Form(values),ctx={draft,route,saved:0,capture:null,$:selector=>selector===`[data-account-form="${route.page==='account-support-detail'?'support-update':'support-new'}"]`?form:null,saveDraft(){this.saved++;},setCapture(fn){this.capture=fn;}};
 return {form,ctx};
}

test('support report and update text survives navigation, refresh and reopened forms without crossing references',t=>{
 const route={section:'life',page:'account-support-new',transactionId:'payment-1'};
 const {ctx,form}=supportContext(t,route,{title:'Still waiting',category:'payment',body:'Please check this reference.'});
 const cleanup=bindSupportDraft(ctx,route);form.emit('input');
 assert.equal(getSupportDraft(ctx,route).body,'Please check this reference.');
 assert.equal(getSupportDraft(ctx,{...route,transactionId:'payment-2'}).body,undefined);
 const roundtrip={draft:JSON.parse(JSON.stringify(ctx.draft))};
 assert.equal(getSupportDraft(roundtrip,route).title,'Still waiting');
 form.values.body='A detail added just before leaving';ctx.capture();cleanup();
 assert.equal(getSupportDraft(ctx,route).body,'A detail added just before leaving');
 assert.equal([...form.listeners.values()].every(x=>x.size===0),true);
 const updateRoute={section:'life',page:'account-support-detail',id:'case-1'};
 const update=supportContext(t,updateRoute,{body:'Here is the update.'},roundtrip.draft),dispose=bindSupportDraft(update.ctx,updateRoute);
 update.form.emit('change');assert.equal(getSupportDraft(update.ctx,updateRoute).body,'Here is the update.');
 assert.equal(getSupportDraft(update.ctx,{...updateRoute,id:'case-2'}).body,undefined);dispose();
});

test('saving a support report clears its draft without navigation capture resurrecting it',t=>{
 const route={section:'life',page:'account-support-new'},env=supportContext(t,route,{title:'A question',category:'question',body:'My report.'});
 const dispose=bindSupportDraft(env.ctx,route);env.form.emit('input');
 clearSupportDraft(env.ctx,route);env.ctx.capture();env.form.emit('submit');
 assert.deepEqual(getSupportDraft(env.ctx,route),{});dispose();
});

test('session-only Ask Lumo persistence is explained honestly in account privacy and access',()=>{
 const s=createEmptyState();s.onboardingDone=true;
 const ctx={state:s,draft:{}},privacy=renderAccount(ctx,{section:'life',page:'account-privacy'}),access=renderAccount(ctx,{section:'life',page:'account-access'});
 assert.match(privacy,/Private Ask Lux conversations are kept for this tab’s session/);
 assert.match(privacy,/Closing the tab can remove them/);
 assert.doesNotMatch(access,/Your money, chats and goals stay here/);
});
