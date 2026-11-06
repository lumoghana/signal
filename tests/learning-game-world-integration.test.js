import test from 'node:test';
import assert from 'node:assert/strict';
import {createDemoState,applyAction,saveState,loadState} from '../dist/js/model.js';
import {CAMPUS_MISSIONS,getCampusGame,getCampusRun} from '../dist/js/learning-game-model.js';
import {getWorldPresentation} from '../dist/js/learning-game-world-content.js';
import {renderCampusGame,bindCampusGame} from '../dist/js/learning-game-ui.js';
import {esc} from '../dist/js/ui.js';

const clone=value=>JSON.parse(JSON.stringify(value));
const act=(state,type,payload={})=>{
 const result=applyAction(state,type,payload);
 assert.equal(result.ok,true,result.message);
 return result;
};
const student=()=>{const state=createDemoState();act(state,'learningEnroll',{goal:'allowance',personalised:false});return state;};
const choose=(state,id,choiceId)=>act(state,'campusChoose',{runId:id,stepId:getCampusRun(state,id).stepId,choiceId});
const next=(state,id)=>act(state,'campusContinue',{runId:id,stepId:getCampusRun(state,id).stepId});
const render=(state,id)=>renderCampusGame({state,draft:{},route:{section:'learn',page:'play',id}});
const finish=(state,missionId)=>{
 const {runId}=act(state,'campusStart',{missionId});
 for(let turn=0;turn<3;turn++){choose(state,runId,getCampusRun(state,runId).turn.choices[0].id);next(state,runId);}
 return runId;
};

test('saved pre-world progress opens in the world without resetting money, stars, looks or pending choices',()=>{
 const originalStorage=globalThis.localStorage,values=new Map();
 globalThis.localStorage={getItem:key=>values.get(key)??null,setItem:(key,value)=>values.set(key,value)};
 try{
  const state=student();finish(state,CAMPUS_MISSIONS[0].id);
  const reward=getCampusGame(state).rewards.find(item=>item.unlocked&&item.id!=='classic');
  act(state,'campusEquip',{rewardId:reward.id});
  const {runId}=act(state,'campusStart',{missionId:CAMPUS_MISSIONS[1].id});
  const selected=getCampusRun(state,runId).turn.choices[1];choose(state,runId,selected.id);
  const game=clone(state.learning.game),points=state.learning.points,wallet=state.wallet;
  assert.equal(saveState(state),true);
  const restored=loadState(),before=JSON.stringify(restored),html=render(restored,runId);
  assert.deepEqual(restored.learning.game,game);
  assert.equal(restored.learning.points,points);assert.equal(restored.wallet,wallet);
  assert.equal(getCampusRun(restored,runId).status,'consequence');
  assert.ok(html.includes(`data-world-destination="${selected.id}"`));
  assert.match(html,/data-phase="consequence"/);
  assert.ok(html.includes(`data-look="${reward.id}"`));
  assert.match(html,/data-campus-action="continue"/);
  assert.doesNotMatch(html,/data-world-effect/,'a cold refresh does not replay money effects');
  assert.equal(JSON.stringify(restored),before,'rendering a saved run cannot mutate any account or game state');
 }finally{
  if(originalStorage===undefined)delete globalThis.localStorage;else globalThis.localStorage=originalStorage;
 }
});

test('every reachable branch renders native world destinations, truthful short copy and isolated Lux motion',()=>{
 let scenes=0,outcomes=0;
 function walk(state,id){
  const view=getCampusRun(state,id);if(view.status==='completed')return;
  const display=getWorldPresentation(view),before=JSON.stringify(state),html=render(state,id);
  assert.equal(JSON.stringify(state),before);
  assert.equal((html.match(/data-world-player(?:\s|>)/g)||[]).length,1);
  assert.match(html,/data-phase="choice"/);
  assert.doesNotMatch(html,/campus-choice-grid|campus-choice-card|campus-choice-notes/);
  const player=html.match(/<div[^>]*data-world-player[^>]*>/)?.[0];
  assert.ok(player);assert.doesNotMatch(player,/data-motion=/,'the world actor owns its transform');
  for(const target of display.targets){
   const button=html.match(new RegExp(`<button[^>]*data-world-choice="${target.id}"[^>]*>`))?.[0];
   assert.ok(button,`${view.turn.id}/${target.id} must be an actual button`);
   assert.doesNotMatch(button,/\sdisabled(?:\s|>)/);
   assert.ok(button.includes(esc(view.turn.choices.find(choice=>choice.id===target.id).detail)),'the full meaning remains accessible');
   assert.ok(html.includes(`>${esc(target.label)}</span>`));
   if(target.costLabel)assert.ok(html.includes(`>${esc(target.costLabel)}</span>`));
  }
  assert.ok(html.includes(esc(display.prompt)));scenes++;
  for(const choice of view.turn.choices){
   const branch=clone(state);choose(branch,id,choice.id);
   const result=getCampusRun(branch,id),resultDisplay=getWorldPresentation(result),resultHtml=render(branch,id);
   assert.match(resultHtml,/data-phase="consequence"/);
   assert.ok(resultHtml.includes(esc(resultDisplay.outcome.line)));
   assert.equal((resultHtml.match(/disabled tabindex="-1" aria-hidden="true"/g)||[]).length,3);
   assert.ok(resultHtml.includes(`data-world-destination="${choice.id}"`));
   assert.match(resultHtml,/data-campus-action="continue"/);
   assert.doesNotMatch(resultHtml,/data-world-effect/,'cold renders do not repeat feedback or awards');
   outcomes++;next(branch,id);walk(branch,id);
  }
 }
 for(const mission of CAMPUS_MISSIONS){
  const state=student();for(const prior of CAMPUS_MISSIONS.slice(0,mission.index))finish(state,prior.id);
  walk(state,act(state,'campusStart',{missionId:mission.id}).runId);
 }
 assert.equal(scenes,78);assert.equal(outcomes,234);
});

// DOM-like geometry and event surfaces exercise the real UI and locomotion modules
// together. They intentionally do not implement animation or financial behaviour.
class Surface{
 constructor(doc,dataset={},tag='div'){
  this.ownerDocument=doc;this.dataset=dataset;this.tagName=tag;this.children=[];this.parentNode=null;this.isConnected=true;this.listeners=new Map();this.attrs={};this.values=new Map();
  this.style={setProperty:(key,value)=>this.values.set(key,value)};this.classList={toggle(){}};
 }
 addEventListener(name,fn){if(!this.listeners.has(name))this.listeners.set(name,new Set());this.listeners.get(name).add(fn);}
 removeEventListener(name,fn){this.listeners.get(name)?.delete(fn);}
 emit(name,extra={}){
  const event={type:name,defaultPrevented:false,preventDefault(){this.defaultPrevented=true;},stopImmediatePropagation(){this.stopped=true;},...extra};
  for(const fn of [...this.listeners.get(name)||[]]){fn(event);if(event.stopped)break;}return event;
 }
 append(node){node.parentNode=this;this.children.push(node);return node;}
 contains(node){return node===this||this.children.some(child=>child.contains(node));}
 closest(selector){return selector==='button'?(this.tagName==='button'?this:this.parentNode?.closest(selector)):null;}
 matches(selector){return selector==='[data-world-stage]'&&'worldStage' in this.dataset;}
 setAttribute(name,value){this.attrs[name]=String(value);if(name.startsWith('data-'))this.dataset[name.slice(5).replace(/-([a-z])/g,(_,c)=>c.toUpperCase())]=String(value);}
 getAttribute(name){return this.attrs[name]??null;}
 hasAttribute(name){return name in this.attrs||name==='data-world-gate'&&'worldGate' in this.dataset;}
 querySelector(selector){return this.querySelectorAll(selector)[0]||null;}
 querySelectorAll(selector){
  const key={'[data-world-stage]':'worldStage','[data-world-player]':'worldPlayer','[data-world-choice]':'worldChoice','[data-world-destination]':'worldDestination','[data-world-effect]':'worldEffect'}[selector],found=[];
  const visit=node=>{for(const child of node.children){if(key&&key in child.dataset)found.push(child);visit(child);}};visit(this);return found;
 }
 getBoundingClientRect(){
  if('worldStage' in this.dataset)return {left:0,top:0,width:400,height:500,bottom:500};
  if('worldPlayer' in this.dataset)return {left:parseFloat(this.values.get('--lux-x')||48)-40,top:parseFloat(this.values.get('--lux-y')||420)-90,width:80,height:90};
  return {left:Number(this.dataset.worldX)*4-40,top:Number(this.dataset.worldY)*5-80,width:80,height:80,bottom:Number(this.dataset.worldY)*5};
 }
 disconnect(){this.isConnected=false;this.children.forEach(child=>child.disconnect());}
}

function liveWorld(state,id){
 let now=0,frame=0,root,stage,player,targets,cleanup=()=>{},route={section:'learn',page:'play',id};const frames=new Map(),stale=[],actions=[],phasesAtRefresh=[];
 const doc=new Surface(null),win=new Surface(doc),media=new Surface(doc);doc.visibilityState='visible';doc.defaultView=win;media.matches=false;
 win.performance={now:()=>now};win.matchMedia=()=>media;
 win.requestAnimationFrame=fn=>{const key=++frame;frames.set(key,fn);stale.push(fn);return key;};win.cancelAnimationFrame=key=>frames.delete(key);
 const ctx={state,draft:{},get route(){return route;},$(selector){return selector==='.campus-game-page'?root:null;},saveDraft(){},toast(){},
  act(type,payload){actions.push(type);const result=applyAction(state,type,payload);assert.equal(saveState(state),true);return result;},
  refresh(){phasesAtRefresh.push(getCampusRun(loadState(),id).status);mount();},
  go(nextRoute){route=nextRoute;cleanup();root.disconnect();},
 };
 function mount(){
  cleanup();root?.disconnect();const html=renderCampusGame(ctx);root=new Surface(doc);stage=root.append(new Surface(doc,{worldStage:''}));stage.clientWidth=400;stage.clientHeight=500;
  const playerTag=html.match(/<div[^>]*data-world-player[^>]*>/)[0];player=stage.append(new Surface(doc,{worldPlayer:'',worldX:playerTag.match(/data-world-x="([^"]+)"/)[1],worldY:playerTag.match(/data-world-y="([^"]+)"/)[1]}));player.offsetWidth=80;player.offsetHeight=90;player.append(new Surface(doc,{},'img'));
  targets=[...html.matchAll(/<button[^>]*data-world-choice="([^"]+)"[^>]*>/g)].map(match=>{
   const tag=match[0],target=stage.append(new Surface(doc,{worldChoice:match[1],worldDestination:match[1],campusChoice:match[1],worldX:tag.match(/data-world-x="([^"]+)"/)[1],worldY:tag.match(/data-world-y="([^"]+)"/)[1]},'button'));target.disabled=/\sdisabled\s/.test(tag);return target;
  });cleanup=bindCampusGame(ctx);
 }
 mount();
 return {ctx,doc,actions,phasesAtRefresh,get stage(){return stage;},get player(){return player;},get targets(){return targets;},get route(){return route;},
  tap(target){const event=stage.emit('click',{target,detail:1});if(!event.stopped)root.emit('click',{target,detail:1});},
  command(action){const button=root.append(new Surface(doc,{campusAction:action},'button'));root.emit('click',{target:button,detail:1});},
  step(ms){now+=ms;const work=[...frames.values()];frames.clear();work.forEach(fn=>fn(now));},
  stale(){stale.forEach(fn=>fn(now+5000));},dispose(){cleanup();root.disconnect();},
 };
}

test('real UI binding saves before moving Lux, supports drag once and cancels old-world work on navigation',()=>{
 const originalStorage=globalThis.localStorage,values=new Map();globalThis.localStorage={getItem:key=>values.get(key)??null,setItem:(key,value)=>values.set(key,value)};
 try{
  const state=student(),{runId}=act(state,'campusStart',{missionId:CAMPUS_MISSIONS[0].id}),h=liveWorld(state,runId);
  assert.match(renderCampusGame(h.ctx),/Drag Lux to a place/);
  const oldStage=h.stage;h.tap(h.targets[0]);
  assert.equal(h.ctx.draft.campusDragHintSeen,true,'an intentional choice dismisses the one-time control guide');
  assert.deepEqual(h.actions,['campusChoose']);assert.deepEqual(h.phasesAtRefresh,['consequence']);
  assert.equal(h.stage.dataset.worldMoving,'true');assert.equal(getCampusRun(loadState(),runId).money.wallet,9500);
  h.step(180);assert.ok(parseFloat(h.player.values.get('--lux-x'))>48,'the real world binder moves Lux after persistence');
  h.command('continue');assert.equal(getCampusRun(state,runId).status,'choice');assert.deepEqual(h.phasesAtRefresh,['consequence','choice']);assert.equal(oldStage.isConnected,false);
  assert.doesNotMatch(renderCampusGame(h.ctx),/Drag Lux to a place/);
  assert.doesNotMatch(renderCampusGame({state,draft:{},route:h.route}),/Drag Lux to a place/,'saved played turns prevent repeating the introduction in a new session');
  const currentStage=h.stage,actor=h.player,startX=parseFloat(actor.values.get('--lux-x')),startY=parseFloat(actor.values.get('--lux-y'));
  currentStage.emit('pointerdown',{target:actor,pointerId:3,button:0,clientX:startX,clientY:startY-45});
  currentStage.emit('pointermove',{target:actor,pointerId:3,clientX:200,clientY:330});
  currentStage.emit('pointerup',{target:actor,pointerId:3,clientX:200,clientY:330});h.doc.emit('pointerup',{pointerId:3,clientX:200,clientY:330});
  assert.equal(h.actions.filter(type=>type==='campusChoose').length,2);assert.equal(getCampusRun(loadState(),runId).status,'consequence');
  const saved=JSON.stringify(state),actionCount=h.actions.length;h.command('home');h.stale();h.step(5000);
  assert.deepEqual(h.route,{section:'home',page:'home'});assert.equal(h.actions.length,actionCount);assert.equal(JSON.stringify(state),saved);h.dispose();
 }finally{if(originalStorage===undefined)delete globalThis.localStorage;else globalThis.localStorage=originalStorage;}
});
