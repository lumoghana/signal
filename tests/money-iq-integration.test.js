import test from 'node:test';
import assert from 'node:assert/strict';
import {createDemoState,createEmptyState,applyAction,migrateState,validStoredState,getSummary} from '../dist/js/model.js';
import {getMoneyIQ,MONEY_IQ_ACTIONS} from '../dist/js/money-iq-model.js';
import {getLearningDashboard} from '../dist/js/learning-model.js';
import {LEARNING_LESSONS} from '../dist/js/learning-content.js';
import {createPersistence} from '../dist/js/persistence.js';
import {commitAction} from '../dist/js/state-boundary.js';
import {safeRoute,parentRoute,routeLabel,routeKey,chatReturnRoute} from '../dist/js/navigation.js';
import {canOpenChatBySwipe} from '../dist/js/chat-gestures.js';
import {renderLearning,bindLearning} from '../dist/js/learning-ui.js';
import {bindMoneyIQ} from '../dist/js/money-iq-ui.js';
import {renderActivity,bindActivity,filterActivity} from '../dist/js/activity-view.js';

const CLOCK='2026-11-04T12:00:00Z';
const must=result=>{assert.equal(result.ok,true,result.message);return result;};
const act=(state,type,payload={})=>applyAction(state,type,payload);
const IQ={section:'learn',page:'money-iq'};
function atTime(fn){const RealDate=globalThis.Date;globalThis.Date=class extends RealDate{constructor(...args){super(...(args.length?args:[CLOCK]));}static now(){return new RealDate(CLOCK).getTime();}};try{return fn();}finally{globalThis.Date=RealDate;}}
const finances=state=>structuredClone(Object.fromEntries(['wallet','buffer','income','budget','boxes','transactions','ious','groups','virtualCard','virtualCards','externalBalances','profile','fundingAttempts'].map(key=>[key,state[key]])));
function student({personalised=false}={}){
 const state=createDemoState();
 state.transactions=[
  {id:'data-1',type:'payment',direction:'out',amount:2000,merchant:'MTN Data',category:'Data',status:'success',at:'2026-11-03T12:00:00Z',rail:'momo',walletDebited:true},
  {id:'data-2',type:'payment',direction:'out',amount:3000,merchant:'Telecel Data',category:'Data',status:'success',at:'2026-11-04T09:00:00Z',rail:'momo',walletDebited:true},
  {id:'food',type:'payment',direction:'out',amount:3500,merchant:'Gɔbɛ Spot',category:'Food',status:'success',at:'2026-11-02T15:00:00Z',rail:'lumo',walletDebited:true},
  {id:'last-data',type:'payment',direction:'out',amount:4000,merchant:'MTN Data',category:'Data',status:'success',at:'2026-10-27T12:00:00Z',rail:'momo',walletDebited:true}
 ];
 must(act(state,'learningEnroll',{goal:'allowance',personalised}));
 return state;
}
function durable(state=student()){
 const map=new Map(),key='money-iq-integration';let failWrite=false;
 const storage={getItem:k=>map.get(k)??null,setItem:(k,value)=>{if(k===key&&failWrite)throw Error('quota');map.set(k,value);},removeItem:k=>map.delete(k)};
 const controller=createPersistence({storage,key,empty:()=>state,validate:validStoredState,migrate:migrateState,ownerId:'iq-a'});
 const current=must(controller.load()).state;
 return {state:current,storage,key,controller,failWrite:value=>{failWrite=value;},act:(type,payload={})=>commitAction({state:current,type,payload,apply:applyAction,persistence:controller})};
}
const session=(state,id)=>getMoneyIQ(state,{sessionId:id}).session;
const rawSession=(state,id)=>state.learning.moneyIQ.sessions.find(round=>round.id===id);
function begin(state,mode='example',extra={}){return must(act(state,'moneyIQStart',{mode,...extra})).sessionId;}
function reveal(state,id,option){const view=session(state,id);return must(act(state,'moneyIQAnswer',{sessionId:id,questionId:view.question.id,option:option??0}));}
function finish(state,id,run=payload=>act(state,payload.type,payload.p),{guessCorrect=false}={}){
 for(let i=0;i<5;i++){
  const view=session(state,id);
  if(view.status==='completed')return view;
  if(view.status==='question'){
   const option=guessCorrect?rawSession(state,id).questions[view.index].correct:0;
   must(run({type:'moneyIQAnswer',p:{sessionId:id,questionId:view.question.id,option}}));
  }
  const shown=session(state,id);
  if(shown.index<4)must(run({type:'moneyIQNext',p:{sessionId:id,questionId:shown.question.id}}));
  else return must(run({type:'moneyIQComplete',p:{sessionId:id}}));
 }
}

test('Money IQ has its own full-screen route and preserves Home, learning and private chat return paths',()=>atTime(()=>{
 const state=createDemoState();
 assert.deepEqual(safeRoute(IQ,state,{}),IQ);
 assert.equal(routeLabel(IQ),'Money IQ');
 assert.deepEqual(parentRoute(IQ,state,{}),{section:'learn',page:'home'});
 assert.equal(canOpenChatBySwipe(IQ),false,'Swiping must not discard a challenge.');
 assert.notEqual(routeKey(IQ),routeKey({section:'chat',page:'home'}));
 assert.deepEqual(chatReturnRoute({section:'chat',page:'home',returnTo:IQ},state,{}),IQ);
 assert.deepEqual(parentRoute({section:'activity',page:'home',returnTo:IQ},state,{}),IQ);
 assert.deepEqual(safeRoute({section:'home',page:'home'},state,{}),{section:'home',page:'home'});
 state.account.signedOut=true;
 assert.deepEqual(safeRoute(IQ,state,{}),{section:'life',page:'account-access'});
}));

test('Money IQ renders before legacy learning enrollment and keeps personal amounts private by default',()=>atTime(()=>{
 const state=createDemoState(),before=structuredClone(state),route=IQ;
 const html=renderLearning({state,route,draft:{}},route);
 assert.match(html,/Money IQ|MONEY IQ/);
 assert.match(html,/Think you know/);
 assert.match(html,/Home/);
 assert.doesNotMatch(html,/248[,.]000|2,480|150[,.]000/);
 assert.doesNotMatch(html,/Campus has plans/,'New entry must not become the Campus Run onboarding.');
 assert.deepEqual(state,before,'A rendered entry is read-only.');
}));

test('Money IQ migration preserves the complete existing money ledger and earlier learning progress',()=>atTime(()=>{
 const state=student();state.learning.points=25;
 const before=finances(state),game=structuredClone(state.learning.game),lessons=structuredClone(state.learning.lessonProgress);
 delete state.learning.moneyIQ;
 migrateState(state);
 assert.equal(validStoredState(state),true);
 assert.deepEqual(finances(state),before);
 assert.equal(state.learning.points,25);
 assert.deepEqual(state.learning.game,game);
 assert.deepEqual(state.learning.lessonProgress,lessons);
}));

test('both challenge modes complete through real actions without changing money or pretending to prove understanding',()=>atTime(()=>{
 for(const mode of ['actual','example']){
  const state=student({personalised:true}),before=finances(state),id=begin(state,mode);
  assert.equal(session(state,id).status,'question');
  const result=finish(state,id);
  assert.equal(result.completed,true);
  assert.equal(result.points,50);
  assert.equal(session(state,id).recap.value,'GH¢50');
  assert.equal(state.learning.activities[0].type,'money-iq');
  assert.equal(state.learning.activities[0].participation,true);
  assert.equal(getLearningDashboard(state,{summary:getSummary(state)}).level.number,1);
  assert.deepEqual(finances(state),before);
  assert.equal(validStoredState(state),true);
 }
}));

test('completion credit is equal for guessed and accurate rounds and cannot be farmed across modes',()=>atTime(()=>{
 const guessed=student({personalised:true}),accurate=student({personalised:true});
 finish(guessed,begin(guessed,'actual'));
 finish(accurate,begin(accurate,'actual'),undefined,{guessCorrect:true});
 assert.equal(guessed.learning.points,accurate.learning.points);
 const before=guessed.learning.points;
 const repeated=finish(guessed,begin(guessed,'example'));
 assert.equal(repeated.points,0);
 assert.equal(guessed.learning.points,before);
 assert.equal(guessed.learning.awards.filter(award=>award.key.startsWith('money-iq:')).length,1);
 const replay=finish(guessed,begin(guessed,'actual',{replay:true}));
 assert.equal(replay.points,0);
 assert.equal(guessed.learning.points,before);
}));

test('repeated start, reveal, next and completion events remain one saved progression and one reward',()=>atTime(()=>{
 const state=student(),id=begin(state),first=session(state,id),firstPayload={sessionId:id,questionId:first.question.id,option:1,idempotencyKey:'one-ui-action'};
 assert.equal(begin(state),id);
 assert.equal(state.learning.moneyIQ.sessions.length,1);
 must(act(state,'moneyIQAnswer',firstPayload));
 assert.equal(must(act(state,'moneyIQAnswer',firstPayload)).duplicate,true);
 assert.equal(act(state,'moneyIQAnswer',{...firstPayload,option:2}).ok,false);
 assert.equal(rawSession(state,id).answers.length,1);
 assert.equal(act(state,'moneyIQComplete',{sessionId:id}).ok,false);
 const next={sessionId:id,questionId:first.question.id,idempotencyKey:'one-ui-action'};
 must(act(state,'moneyIQNext',next));
 assert.equal(must(act(state,'moneyIQNext',next)).duplicate,true);
 assert.equal(session(state,id).index,1);
 finish(state,id);
 const total=state.learning.points;
 assert.equal(must(act(state,'moneyIQComplete',{sessionId:id,idempotencyKey:'one-ui-action'})).duplicate,true);
 assert.equal(state.learning.points,total);
 assert.equal(state.learning.awards.filter(award=>award.type==='money-iq').length,1);
 assert.equal(rawSession(state,id).answers.length,5);
}));

test('progress survives durable refresh at a reveal, and the restored round resumes without a second session',()=>atTime(()=>{
 const h=durable(),id=must(h.act('moneyIQStart',{mode:'example'})).sessionId;
 const question=session(h.state,id).question;
 must(h.act('moneyIQAnswer',{sessionId:id,questionId:question.id,option:2}));
 const before=finances(h.state);h.controller.release();
 const controller=createPersistence({storage:h.storage,key:h.key,empty:createEmptyState,validate:validStoredState,migrate:migrateState,ownerId:'iq-b'});
 const state=must(controller.load()).state;
 assert.equal(session(state,id).status,'reveal');
 assert.equal(session(state,id).selected,2);
 const run=({type,p})=>commitAction({state,type,payload:p,apply:applyAction,persistence:controller});
 assert.equal(must(run({type:'moneyIQStart',p:{mode:'example'}})).sessionId,id);
 finish(state,id,run);
 assert.equal(state.learning.points,50);
 assert.deepEqual(finances(state),before);
 controller.release();
}));

test('failed saves roll back answers and completion rewards until an explicit successful retry',()=>atTime(()=>{
 const h=durable(),id=must(h.act('moneyIQStart',{mode:'example'})).sessionId,first=session(h.state,id),before=structuredClone(h.state),saved=h.storage.getItem(h.key);
 h.failWrite(true);
 const failed=h.act('moneyIQAnswer',{sessionId:id,questionId:first.question.id,option:1});
 assert.equal(failed.ok,false);assert.equal(failed.persistenceFailure,true);
 assert.deepEqual(h.state,before);assert.equal(h.storage.getItem(h.key),saved);
 h.failWrite(false);must(h.controller.check());
 must(h.act('moneyIQAnswer',{sessionId:id,questionId:first.question.id,option:1}));
 for(let i=0;i<4;i++){
  const current=session(h.state,id);
  must(h.act('moneyIQNext',{sessionId:id,questionId:current.question.id}));
  const next=session(h.state,id);
  must(h.act('moneyIQAnswer',{sessionId:id,questionId:next.question.id,option:0}));
 }
 const beforeComplete=structuredClone(h.state),savedComplete=h.storage.getItem(h.key);h.failWrite(true);
 assert.equal(h.act('moneyIQComplete',{sessionId:id}).persistenceFailure,true);
 assert.deepEqual(h.state,beforeComplete);assert.equal(h.storage.getItem(h.key),savedComplete);assert.equal(h.state.learning.points,0);
 h.failWrite(false);must(h.controller.check());must(h.act('moneyIQComplete',{sessionId:id}));
 assert.equal(h.state.learning.points,50);
 must(h.act('moneyIQComplete',{sessionId:id}));assert.equal(h.state.learning.points,50);
 h.controller.release();
}));

test('Money IQ shares the existing weekly cap with lessons in either earning order',()=>atTime(()=>{
 for(const iqFirst of [true,false]){
  const state=student();
  const completeLesson=id=>{const content=LEARNING_LESSONS.find(item=>item.id===id),started=must(act(state,'learningStartLesson',{lessonId:id}));must(act(state,'learningAnswer',{sessionId:started.sessionId,option:content.questions[0].correct}));};
  if(iqFirst)finish(state,begin(state));
  for(const content of LEARNING_LESSONS)completeLesson(content.id);
  const before=state.learning.points;
  if(!iqFirst){const completed=finish(state,begin(state));assert.equal(completed.points,0);}
  assert.equal(state.learning.points,100);
  assert.equal(state.learning.awards.reduce((total,award)=>total+award.points,0),100);
  assert.equal(getLearningDashboard(state).pointsThisWeek,100);
  if(!iqFirst)assert.equal(state.learning.points,before);
 }
}));

test('both opt-out paths erase personal snapshots while keeping sample rounds, earned progress and financial history',()=>atTime(()=>{
 for(const [type,payload] of [['learningPreferences',{personalised:false}],['learningEnroll',{goal:'allowance',personalised:false}],['accountPrivacy',{preference:'personalisation',enabled:false}]]){
  const state=student({personalised:true}),personalId=begin(state,'actual'),sampleId=begin(state,'example');
  finish(state,sampleId);const before=finances(state),points=state.learning.points;
  assert.ok(rawSession(state,personalId).sourceKey.includes('data-1'));
  must(act(state,type,payload));
  assert.equal(state.learning.moneyIQ.sessions.some(round=>round.mode==='actual'),false);
  assert.equal(getMoneyIQ(state,{sessionId:personalId}).session,null);
  assert.ok(getMoneyIQ(state,{sessionId:sampleId}).session);
  assert.equal(state.learning.points,points);assert.deepEqual(finances(state),before);
  assert.equal(act(state,'moneyIQStart',{mode:'actual'}).ok,false);
  const html=renderLearning({state,route:{...IQ,id:personalId},draft:{}},{...IQ,id:personalId});
  assert.doesNotMatch(html,/data-1|Telecel Data|last-data/);
 }
}));

test('a financial reversal invalidates recorded reveals without rewriting history or allowing a reward',()=>atTime(()=>{
 const state=student({personalised:true}),id=begin(state,'actual');reveal(state,id);
 const snapshot=structuredClone(rawSession(state,id)),points=state.learning.points;
 state.transactions.find(t=>t.id==='data-2').status='reversed';
 const money=finances(state);
 assert.equal(session(state,id).status,'stale');assert.equal(session(state,id).reveal,null);
 assert.equal(act(state,'moneyIQNext',{sessionId:id,questionId:'spending'}).ok,false);
 assert.equal(act(state,'moneyIQComplete',{sessionId:id}).ok,false);
 assert.equal(state.learning.points,points);assert.deepEqual(rawSession(state,id),snapshot);assert.deepEqual(finances(state),money);
 const fresh=begin(state,'actual');assert.notEqual(fresh,id);
 reveal(state,fresh);assert.equal(session(state,fresh).reveal.value,'GH¢20');
}));

test('signed-out and closed accounts cannot use any Money IQ mutation to bypass account permissions',()=>atTime(()=>{
 const signedOut=student(),id=begin(signedOut);must(act(signedOut,'accountSignOut'));
 for(const type of MONEY_IQ_ACTIONS)assert.equal(act(signedOut,type,{mode:'example',sessionId:id,questionId:'spending',option:0}).ok,false);
 const closed=createEmptyState();closed.onboardingDone=true;must(act(closed,'accountClose',{confirm:'CLOSE',pin:'1234'}));
 const before=structuredClone(closed);
 for(const type of MONEY_IQ_ACTIONS)assert.equal(act(closed,type,{mode:'example'}).ok,false);
 assert.deepEqual(closed,before);
}));

test('recorded recap opens its matching activity slice, clears old filters and provides a direct return to the same reveal',()=>atTime(()=>{
 const state=student({personalised:true}),id=begin(state,'actual');finish(state,id);
 let click,destination,returned;
 const root={contains:()=>true,addEventListener:(name,fn)=>{if(name==='click')click=fn;},removeEventListener(){},querySelector:()=>null};
 const draft={activityQuery:'a forgotten search',activityFilters:{query:'old',direction:'in',status:'failed',category:'Food',from:'2020-01-01',to:'2020-01-02'}};
 const ctx={state,route:{...IQ,id},draft,$:selector=>selector==='.miq-page'?root:null,go:route=>{destination=route;},saveDraft(){}};
 const cleanup=bindMoneyIQ(ctx,ctx.route),control={dataset:{miqAction:'activity'},disabled:false};
 click({target:{closest:selector=>selector==='[data-miq-action]'?control:null}});
 assert.equal(destination.section,'activity');assert.equal(destination.page,'home');
 assert.deepEqual(destination.returnTo,{...IQ,id});
 assert.equal(draft.activityQuery,'');
 assert.deepEqual(draft.activityFilters,{query:'',direction:'out',status:'success',category:'Data',from:'2026-11-02',to:'2026-11-04',asOf:'2026-11-04T12:00:00.000Z'});
 assert.deepEqual(filterActivity(state.transactions,draft.activityFilters).map(record=>record.id),['data-2','data-1']);
 const returnControl={addEventListener:(name,fn)=>{if(name==='click')returned=fn;}};
 const activityCtx={state,route:destination,draft,$:selector=>selector==='[data-activity-iq-return]'?returnControl:null,$$:()=>[],go:route=>{destination=route;}};
 assert.match(renderActivity(activityCtx),/Back to my Money IQ reveal/);
 bindActivity(activityCtx);returned();
 assert.deepEqual(destination,{...IQ,id});
 assert.equal(session(state,id).status,'completed');cleanup();
}));

test('sample recap opens personal activity separately without applying fictional sample amounts or categories',()=>atTime(()=>{
 const state=student(),id=begin(state);finish(state,id);
 const before=finances(state);let click,destination;
 const root={contains:()=>true,addEventListener:(name,fn)=>{if(name==='click')click=fn;},removeEventListener(){},querySelector:()=>null};
 const draft={activityQuery:'stale',activityFilters:{query:'stale',category:'Data',from:'2026-01-01'}};
 const ctx={state,route:{...IQ,id},draft,$:selector=>selector==='.miq-page'?root:null,go:route=>{destination=route;},saveDraft(){}};
 const cleanup=bindMoneyIQ(ctx,ctx.route),control={dataset:{miqAction:'activity'},disabled:false};
 click({target:{closest:selector=>selector==='[data-miq-action]'?control:null}});
 assert.deepEqual(draft.activityFilters,{query:'',direction:'all',status:'all',category:'',from:'',to:''});
 assert.deepEqual(destination.returnTo,{...IQ,id});
 assert.deepEqual(finances(state),before);cleanup();
}));

test('a new learner can enable recorded activity from Money IQ preferences and return to Money IQ',()=>atTime(()=>{
 const state=createDemoState(),route={section:'learn',page:'preferences',returnTo:IQ};let click,destination;
 const root={isConnected:true,addEventListener:(name,fn)=>{if(name==='click')click=fn;},removeEventListener(){},querySelector:()=>null};
 const ctx={state,route,draft:{learningUI:{preferenceMode:'actual'}},$:selector=>selector==='.learning-page'?root:null,go:next=>{destination=next;},act:(type,payload)=>act(state,type,payload),toast(){},saveDraft(){},refresh(){}};
 assert.equal(state.learning.enrolled,false);
 const cleanup=bindLearning(ctx,route),control={dataset:{learnAction:'save-preferences'},disabled:false};
 click({target:{closest:selector=>selector==='button'?control:null}});
 assert.equal(state.learning.enrolled,true);assert.equal(state.learning.personalised,true);
 assert.deepEqual(destination,IQ);
 assert.equal(getMoneyIQ(state).personalAllowed,true);cleanup();
}));

test('a damaged optional challenge save recovers without losing personal financial or existing learning history',()=>atTime(()=>{
 const state=student();finish(state,begin(state));
 const before=finances(state),points=state.learning.points,awards=structuredClone(state.learning.awards);
 state.learning.moneyIQ={schema:999,sessions:'broken'};
 const migrated=migrateState(state);
 assert.equal(validStoredState(migrated),true);
 assert.deepEqual(finances(migrated),before);assert.equal(migrated.learning.points,points);assert.deepEqual(migrated.learning.awards,awards);
 assert.deepEqual(migrated.learning.moneyIQ.sessions,[]);
 assert.match(getMoneyIQ(migrated).recoveryNotice,/could not be opened/);
}));

test('legacy home opens Money IQ and secondary library stays reachable without a return loop',()=>atTime(()=>{
 const state=student(),route={section:'learn',page:'home'};
 const html=renderLearning({state,route,draft:{}},route);
 assert.match(html,/miq-page/);assert.match(html,/data-miq-action="home"/);assert.match(html,/More with Lux/);
 const library=renderLearning({state,route:{section:'learn',page:'library'},draft:{}},{section:'learn',page:'library'});
 assert.match(library,/data-learning-tab/);assert.match(library,/data-learn-action="money-iq"/);
 let click,destination;
 const root={contains:()=>true,addEventListener:(name,fn)=>{if(name==='click')click=fn;},removeEventListener(){},querySelector:()=>null};
 const ctx={state,route:{...IQ,returnTo:route},draft:{},$:()=>root,go:next=>{destination=next;}};
 const cleanup=bindMoneyIQ(ctx,ctx.route),control={dataset:{miqAction:'return'},disabled:false};
 click({target:{closest:selector=>selector==='[data-miq-action]'?control:null}});
 assert.deepEqual(destination,{section:'home',page:'home'});
 control.dataset.miqAction='library';click({target:{closest:selector=>selector==='[data-miq-action]'?control:null}});
 assert.deepEqual(destination,{section:'learn',page:'library'});cleanup();
}));
test('Money IQ keeps a private Ask Lumo return through a started round and its landing',()=>atTime(()=>{
 const state=student(),returnTo={section:'chat',page:'home',returnTo:{section:'home',page:'home'}};let click,destination;
 const root={contains:()=>true,addEventListener:(name,fn)=>{if(name==='click')click=fn;},removeEventListener(){},querySelector:()=>null};
 const ctx={state,route:{...IQ,returnTo},draft:{},$:()=>root,go:next=>{destination=next;},act:(type,payload)=>act(state,type,payload)};
 let cleanup=bindMoneyIQ(ctx,ctx.route),control={dataset:{miqAction:'start',mode:'example'},disabled:false};
 const press=()=>click({target:{closest:selector=>selector==='[data-miq-action]'?control:null}});
 press();assert.deepEqual(destination.returnTo,returnTo);assert.ok(destination.id);cleanup();
 ctx.route=destination;cleanup=bindMoneyIQ(ctx,ctx.route);control.dataset.miqAction='return';press();assert.deepEqual(destination,{...IQ,returnTo});cleanup();
 ctx.route=destination;cleanup=bindMoneyIQ(ctx,ctx.route);press();assert.deepEqual(destination,returnTo);cleanup();
}));
