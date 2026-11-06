import test from 'node:test';
import assert from 'node:assert/strict';
import {createDemoState,applyAction} from '../dist/js/model.js';
import {CAMPUS_MISSIONS,getCampusGame,getCampusRun} from '../dist/js/learning-game-model.js';
import {renderCampusGame,bindCampusGame} from '../dist/js/learning-game-ui.js';
import {safeRoute} from '../dist/js/navigation.js';

const clone=value=>JSON.parse(JSON.stringify(value));
function act(state,type,payload={}){const result=applyAction(state,type,payload);assert.equal(result.ok,true,result.message);return result;}
function student(){const state=createDemoState();act(state,'learningEnroll',{goal:'allowance',personalised:false});return state;}
function finish(state,mission=CAMPUS_MISSIONS[0]){
 const {runId}=act(state,'campusStart',{missionId:mission.id,replay:true});
 for(let index=0;index<3;index++){
  let view=getCampusRun(state,runId);act(state,'campusChoose',{runId,stepId:view.stepId,choiceId:view.turn.choices[0].id});
  view=getCampusRun(state,runId);act(state,'campusContinue',{runId,stepId:view.stepId});
 }
 return runId;
}
function open(state,route){
 let current=clone(route),root,cleanup,sheetRoot,sheetHtml='',html='';const actions=[];
 const ctx={state,draft:{},get route(){return current;},$(selector){return selector==='.campus-game-page'?root:null;},saveDraft(){},toast(){},refresh(){mount(current);},act(type,payload){actions.push({type,payload:clone(payload)});return applyAction(state,type,payload);},go(next){mount(safeRoute(next,state,ctx.draft));},sheet(value,bind){sheetHtml=value;const listeners=new Map();sheetRoot={isConnected:true,querySelectorAll:()=>[],addEventListener:(name,fn)=>listeners.set(name,fn),removeEventListener:name=>listeners.delete(name),listeners};bind?.(sheetRoot);},closeSheet(){if(sheetRoot)sheetRoot.isConnected=false;}};
 function mount(next){
  cleanup?.();if(root)root.isConnected=false;current=clone(next);const attributes=new Map(),listeners=new Map(),error={textContent:''};
  root={isConnected:true,dataset:{},setAttribute:(name,value)=>attributes.set(name,value),getAttribute:name=>attributes.get(name),addEventListener:(name,fn)=>listeners.set(name,fn),removeEventListener:name=>listeners.delete(name),querySelector:selector=>selector==='[data-campus-error]'?error:null,querySelectorAll:()=>[],listeners};
  if(current.section==='learn'&&['game','play','rewards'].includes(current.page)){html=renderCampusGame(ctx,current);cleanup=bindCampusGame(ctx,current);}else{html='';cleanup=null;}
 }
 mount(current);
 const event=dataset=>({target:{closest:()=>({dataset,disabled:false})}});
 return {ctx,actions,get route(){return clone(current);},get html(){return html;},get sheetHtml(){return sheetHtml;},click(campusAction){root.listeners.get('click')?.(event({campusAction}));},selectArchived(id){root.listeners.get('click')?.(event({campusReflectionRun:id}));},sheetClick(dataset){sheetRoot?.listeners.get('click')?.(event(dataset));},dispose(){cleanup?.();root.isConnected=false;}};
}
const play=(id,step,archived=false)=>({section:'learn',page:'play',id,...(step?{step}:{}),...(archived?{archived:true}:{})});

test('reading an older takeaway preserves the later active run across lesson, insight and practice returns',()=>{
 const state=student(),first=finish(state);finish(state,CAMPUS_MISSIONS[1]);finish(state,CAMPUS_MISSIONS[2]);
 const active=act(state,'campusStart',{missionId:CAMPUS_MISSIONS[3].id}).runId,before=JSON.stringify(state),h=open(state,{section:'learn',page:'game'});
 h.click('reflections');h.sheetClick({campusReflectionRun:first});assert.deepEqual(h.route,play(first,'lesson',true));
 h.click('reflection-insight');assert.deepEqual(h.route,play(first,'insight',true));assert.match(h.html,/Resume my run/);
 h.click('real-life');assert.deepEqual(h.route.returnTo,play(first,'insight',true));
 h.dispose();const returned=open(state,h.route.returnTo);returned.click('reflection-lesson');assert.deepEqual(returned.route,play(first,'lesson',true));
 returned.click('reflection-result');assert.deepEqual(returned.route,play(first,undefined,true));returned.click('reflection-keep-playing');
 assert.deepEqual(returned.route,play(active));assert.equal(getCampusGame(state).activeRunId,active);assert.equal(returned.actions.length,0);assert.equal(JSON.stringify(state),before);returned.dispose();
});

test('an archived insight survives session-style restoration without starting another run',()=>{
 const state=student(),first=finish(state);finish(state,CAMPUS_MISSIONS[1]);const active=act(state,'campusStart',{missionId:CAMPUS_MISSIONS[2].id}).runId;
 const saved=clone({state,route:play(first,'insight',true)}),h=open(saved.state,safeRoute(saved.route,saved.state,{})),before=JSON.stringify(saved.state);
 assert.match(h.html,/Resume my run/);h.click('reflection-keep-playing');h.click('reflection-keep-playing');
 assert.deepEqual(h.route,play(active));assert.equal(h.actions.length,0);assert.equal(JSON.stringify(saved.state),before);h.dispose();
});

test('a takeaway saved by the older build also resumes the later active chapter',()=>{
 const state=student(),first=finish(state);finish(state,CAMPUS_MISSIONS[1]);finish(state,CAMPUS_MISSIONS[2]);
 const active=act(state,'campusStart',{missionId:CAMPUS_MISSIONS[3].id}).runId,before=JSON.stringify(state),h=open(state,play(first,'insight'));
 h.click('reflection-keep-playing');assert.deepEqual(h.route,play(active));assert.equal(h.actions.length,0);assert.equal(JSON.stringify(state),before);h.dispose();
});

test('archived chapters with no active run return to the map without automatically replaying',()=>{
 for(const [allComplete,archived] of [[false,true],[true,true],[true,false]]){
  const state=student(),first=finish(state);if(allComplete)for(const mission of CAMPUS_MISSIONS.slice(1))finish(state,mission);
  const before=JSON.stringify(state),h=open(state,play(first,'insight',archived));
  assert.match(h.html,/Back to campus map/);h.click('reflection-keep-playing');assert.deepEqual(h.route,{section:'learn',page:'game'});
  assert.equal(h.actions.length,0);assert.equal(JSON.stringify(state),before);h.dispose();
 }
});

test('a newly finished chapter still opens the next challenge once without repeating rewards',()=>{
 const state=student(),first=finish(state),stars=getCampusGame(state).totalStars,points=state.learning.points,finished=clone(getCampusRun(state,first));
 const bank=JSON.stringify({wallet:state.wallet,budget:state.budget,transactions:state.transactions,boxes:state.boxes,groups:state.groups,ious:state.ious}),h=open(state,play(first,'insight'));
 h.click('reflection-keep-playing');const next=h.route.id;h.click('reflection-keep-playing');
 assert.equal(getCampusRun(state,next).missionId,CAMPUS_MISSIONS[1].id);assert.equal(h.actions.length,1);assert.equal(h.actions[0].type,'campusStart');
 assert.deepEqual(getCampusRun(state,first),finished);assert.equal(getCampusGame(state).totalStars,stars);assert.equal(state.learning.points,points);
 assert.equal(JSON.stringify({wallet:state.wallet,budget:state.budget,transactions:state.transactions,boxes:state.boxes,groups:state.groups,ious:state.ious}),bank);h.dispose();
});

test('a confirmed printing bill keeps one wallet debit and a separately labelled reservation release after refresh',()=>{
 const state=student();finish(state);const id=act(state,'campusStart',{missionId:CAMPUS_MISSIONS[1].id}).runId;
 for(const choiceId of ['ask-breakdown','own-trip']){let view=getCampusRun(state,id);act(state,'campusChoose',{runId:id,stepId:view.stepId,choiceId});view=getCampusRun(state,id);act(state,'campusContinue',{runId:id,stepId:view.stepId});}
 let view=getCampusRun(state,id);act(state,'campusChoose',{runId:id,stepId:view.stepId,choiceId:'match-bill'});
 const before=JSON.stringify(state),h=open(state,play(id)),html=h.html,start=html.indexOf('class="lux-world-money-effects"'),stage=html.indexOf('data-world-stage');
 assert.ok(start>=0&&start<stage,'financial feedback owns a normal-flow region before the playfield');
 const feedback=html.slice(start,stage);assert.match(feedback,/>Wallet</);assert.match(feedback,/>Plan released</);
 assert.equal((feedback.match(/−GH₵65/g)||[]).length,1,'only the wallet is described as a debit');assert.match(feedback,/>GH₵65</);
 assert.doesNotMatch(feedback,/data-world-effect(?:\s|>)/,'restoring a consequence does not replay its entrance');
 assert.equal(JSON.stringify(state),before);assert.equal(h.actions.length,0);assert.equal(getCampusRun(state,id).money.wallet,3000);assert.equal(getCampusRun(state,id).money.committed,1000);h.dispose();
});
