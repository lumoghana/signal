import test from 'node:test';
import assert from 'node:assert/strict';
import {createDemoState,applyAction,saveState,loadState} from '../dist/js/model.js';
import {CAMPUS_MISSIONS,getCampusGame,getCampusRun,validGameState} from '../dist/js/learning-game-model.js';
import {getCampusReflection} from '../dist/js/learning-game-reflection.js';
import {renderCampusGame,bindCampusGame} from '../dist/js/learning-game-ui.js';
import {createRouter} from '../dist/js/router.js';
import {safeRoute,routeKey,parentRoute} from '../dist/js/navigation.js';

const clone=value=>JSON.parse(JSON.stringify(value));
const act=(state,type,payload={})=>{const result=applyAction(state,type,payload);assert.equal(result.ok,true,result.message);return result;};
const student=()=>{const state=createDemoState();act(state,'learningEnroll',{goal:'allowance',personalised:false});return state;};
function finish(state,mission=CAMPUS_MISSIONS[0],choices=[]){
 const {runId}=act(state,'campusStart',{missionId:mission.id,replay:true});
 for(let index=0;index<3;index++){
  let run=getCampusRun(state,runId);act(state,'campusChoose',{runId,stepId:run.stepId,choiceId:choices[index]||run.turn.choices[0].id});
  run=getCampusRun(state,runId);act(state,'campusContinue',{runId,stepId:run.stepId});
 }
 return runId;
}
const play=(id,step)=>({section:'learn',page:'play',id,...(step?{step}:{})});

/** Real game actions and the actual indexed router, with an intentionally small DOM surface. */
function experience(state,{initialRoute,saved,draft={}}){
 let current=initialRoute,root,cleanup,html='',sheetRoot,sheetHtml='',pointer=0;
 let native=[null];const pops=[],routes=[],actions=[];
 if(saved){native=saved.entries.slice(0,saved.cursor+1).map((entry,index)=>({lumoNav:2,generation:saved.generation,index,route:clone(entry.route),kind:'page'}));pointer=native.length-1;}
 const history={get state(){return native[pointer];},pushState(value){native=native.slice(0,pointer+1);native.push(clone(value));pointer++;},replaceState(value){native[pointer]=clone(value);},go(delta){const target=pointer+delta;assert.ok(target>=0&&target<native.length);pops.push(target);}};
 const flush=()=>{let limit=25;while(pops.length){assert.ok(limit-->0,'navigation terminates');pointer=pops.shift();router.receive(history.state);}};
 const ctx={state,draft,get route(){return current;},$(selector){return selector==='.campus-game-page'?root:null;},saveDraft(){},toast(){},refresh(){mount(current);},act(type,payload){actions.push({type,payload:clone(payload)});return applyAction(state,type,payload);},go(next){router.go(next);flush();},sheet(value,bind){sheetHtml=value;const callbacks=new Map();sheetRoot={isConnected:true,querySelectorAll:()=>[],addEventListener:(name,fn)=>callbacks.set(name,fn),removeEventListener:name=>callbacks.delete(name),callbacks};bind?.(sheetRoot);},closeSheet(){if(sheetRoot)sheetRoot.isConnected=false;}};
 function mount(route){
  cleanup?.();if(root)root.isConnected=false;current=clone(route);routes.push(clone(route));
  const callbacks=new Map(),attributes=new Map(),error={textContent:''};
  root={isConnected:true,dataset:{},setAttribute:(name,value)=>attributes.set(name,value),getAttribute:name=>attributes.get(name),addEventListener:(name,fn)=>callbacks.set(name,fn),removeEventListener:name=>callbacks.delete(name),querySelector:selector=>selector==='[data-campus-error]'?error:null,querySelectorAll:()=>[],callbacks};
  if(route.section==='learn'&&['play','game','rewards'].includes(route.page)){html=renderCampusGame(ctx,route);cleanup=bindCampusGame(ctx,route);}else {html='';cleanup=null;}
 }
 const router=createRouter({initialRoute,saved,history,normalize:route=>safeRoute(route,state,draft),parent:route=>parentRoute(route,state,draft),key:routeKey,rootFor:()=>({section:'home',page:'home'}),onNavigate:mount});
 router.initialise();flush();
 return {ctx,actions,routes,get route(){return current;},get html(){return html;},get sheetHtml(){return sheetHtml;},get sheetOpen(){return sheetRoot?.isConnected===true;},snapshot:()=>router.snapshot(),click(action){root.callbacks.get('click')?.({target:{closest:()=>({dataset:{campusAction:action},disabled:false})}});},sheetClick(dataset){sheetRoot?.callbacks.get('click')?.({target:{closest:()=>({dataset,disabled:false})}});},back(){history.go(-1);flush();},dispose(){cleanup?.();root.isConnected=false;}};
}

test('chapter result, lesson and insight are distinct destinations and review navigation changes no game or bank records',()=>{
 const state=student(),id=finish(state),before=JSON.stringify(state),h=experience(state,{initialRoute:play(id)});
 assert.match(h.html,/data-reflection-step="result"/);assert.match(h.html,/3 of 3 skill stars/);
 assert.notEqual(routeKey(play(id)),routeKey(play(id,'lesson')));assert.notEqual(routeKey(play(id,'lesson')),routeKey(play(id,'insight')));
 h.click('reflection-lesson');assert.deepEqual(h.route,play(id,'lesson'));assert.match(h.html,/data-reflection-step="lesson"/);assert.match(h.html,/Give your balance jobs/);
 h.click('reflection-insight');assert.deepEqual(h.route,play(id,'insight'));assert.match(h.html,/data-reflection-step="insight"/);assert.match(h.html,/this run/);
 h.click('reflection-lesson');assert.deepEqual(h.route,play(id,'lesson'));h.click('reflection-result');assert.deepEqual(h.route,play(id));
 for(let pass=0;pass<3;pass++){h.click('reflection-lesson');h.click('reflection-insight');h.click('reflection-result');}
 assert.equal(JSON.stringify(state),before,'reading and revisiting cannot mint stars, XP or money');assert.equal(h.actions.length,0);h.dispose();
});

test('an insight survives state save and session restoration, including real-life return and direct Home',()=>{
 const originalStorage=globalThis.localStorage,values=new Map();globalThis.localStorage={getItem:key=>values.get(key)??null,setItem:(key,value)=>values.set(key,value)};
 try{
  const state=student(),id=finish(state),h=experience(state,{initialRoute:play(id)});h.click('reflection-lesson');h.click('reflection-insight');
  const saved=clone(h.snapshot()),game=clone(state.learning.game),points=state.learning.points;assert.equal(saveState(state),true);h.dispose();
  const restored=loadState(),before=JSON.stringify(restored),resumed=experience(restored,{initialRoute:{section:'home',page:'home'},saved});
  assert.deepEqual(resumed.route,play(id,'insight'));assert.match(resumed.html,/data-reflection-step="insight"/);assert.deepEqual(restored.learning.game,game);assert.equal(restored.learning.points,points);
  resumed.click('real-life');assert.equal(resumed.route.page,'practice');assert.deepEqual(resumed.route.returnTo,play(id,'insight'));assert.deepEqual(parentRoute(resumed.route,restored,{}),play(id,'insight'));
  resumed.ctx.go(resumed.route.returnTo);assert.match(resumed.html,/data-reflection-step="insight"/);resumed.click('home');assert.deepEqual(resumed.route,{section:'home',page:'home'});
  assert.equal(JSON.stringify(restored),before);assert.equal(resumed.actions.length,0);resumed.dispose();
 }finally{if(originalStorage===undefined)delete globalThis.localStorage;else globalThis.localStorage=originalStorage;}
});

test('active or pending runs cannot expose a completed takeaway through a forged route or archive control',()=>{
 for(const pending of [false,true]){
  const state=student(),{runId:id}=act(state,'campusStart',{missionId:CAMPUS_MISSIONS[0].id});
  if(pending){const run=getCampusRun(state,id);act(state,'campusChoose',{runId:id,stepId:run.stepId,choiceId:run.turn.choices[0].id});}
  const before=JSON.stringify(state),h=experience(state,{initialRoute:play(id,'insight')});
  assert.doesNotMatch(h.html,/data-reflection-step=/);assert.match(h.html,new RegExp(`data-phase="${pending?'consequence':'choice'}"`));assert.equal(getCampusReflection(getCampusRun(state,id)),null);
  for(const action of ['reflection-lesson','reflection-insight','reflection-result','reflection-keep-playing'])h.click(action);
  h.click('reflections');assert.doesNotMatch(h.sheetHtml,/data-campus-reflection-run=/);assert.match(h.sheetHtml,/Finish three challenges/);
  h.sheetClick({campusReflectionRun:id});assert.equal(h.route.step,'insight');assert.equal(JSON.stringify(state),before);assert.equal(h.actions.length,0);h.dispose();
 }
});

test('Keep playing skips takeaways, submits the next chapter once and preserves the completed chapter record',()=>{
 for(const step of [undefined,'lesson','insight']){
  const state=student(),id=finish(state),finished=clone(getCampusRun(state,id)),points=state.learning.points,stars=getCampusGame(state).totalStars;
  const bank=JSON.stringify({wallet:state.wallet,budget:state.budget,transactions:state.transactions,boxes:state.boxes,ious:state.ious,groups:state.groups});
  const h=experience(state,{initialRoute:play(id,step)});h.click('reflection-keep-playing');
  const nextId=h.route.id;assert.notEqual(nextId,id);assert.equal(getCampusRun(state,nextId).missionId,CAMPUS_MISSIONS[1].id);assert.equal(getCampusRun(state,nextId).status,'choice');
  h.click('reflection-keep-playing');assert.equal(h.actions.filter(action=>action.type==='campusStart').length,1);assert.equal(state.learning.game.runs.length,2);
  assert.deepEqual(getCampusRun(state,id),finished);assert.equal(state.learning.points,points);assert.equal(getCampusGame(state).totalStars,stars);
  assert.equal(JSON.stringify({wallet:state.wallet,budget:state.budget,transactions:state.transactions,boxes:state.boxes,ious:state.ious,groups:state.groups}),bank);h.dispose();
 }
});

test('schema-one saves gain a chapter archive without migration and only completed latest runs appear',()=>{
 const state=student(),oldId=finish(state),latestId=finish(state,CAMPUS_MISSIONS[0],['after-dinner','shared-copy','check-receipt']);
 const {runId:activeId}=act(state,'campusStart',{missionId:CAMPUS_MISSIONS[1].id});
 assert.equal(state.learning.game.schema,1);assert.equal(validGameState(state),true);
 const restored=clone(state),before=JSON.stringify(restored),h=experience(restored,{initialRoute:{section:'learn',page:'game'}});
 h.click('reflections');assert.match(h.sheetHtml,/Lessons & insights/);assert.ok(h.sheetHtml.includes(`data-campus-reflection-run="${latestId}"`));
 assert.ok(!h.sheetHtml.includes(`data-campus-reflection-run="${oldId}"`));assert.ok(!h.sheetHtml.includes(`data-campus-reflection-run="${activeId}"`));
 h.sheetClick({campusReflectionRun:latestId});assert.equal(h.sheetOpen,false);assert.deepEqual(h.route,{...play(latestId,'lesson'),archived:true});assert.match(h.html,/data-reflection-step="lesson"/);
 h.click('reflection-insight');assert.match(h.html,/Same friends. Your own route./);assert.equal(JSON.stringify(restored),before);assert.equal(h.actions.length,0);h.dispose();
});

test('the final chapter returns to the map after its insight with no extra game start',()=>{
 const state=student();let id;for(const mission of CAMPUS_MISSIONS)id=finish(state,mission);
 const before=JSON.stringify(state),h=experience(state,{initialRoute:play(id,'insight')});
 assert.match(h.html,/Back to campus map/);h.click('reflection-keep-playing');assert.deepEqual(h.route,{section:'learn',page:'game'});
 assert.equal(h.actions.length,0);assert.equal(JSON.stringify(state),before);h.dispose();
});
