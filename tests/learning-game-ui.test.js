import test from 'node:test';
import assert from 'node:assert/strict';
import {createDemoState,applyAction} from '../dist/js/model.js';
import {getCampusGame,getCampusRun,CAMPUS_MISSIONS} from '../dist/js/learning-game-model.js';
import {renderCampusGame,renderCampusGameEntry,bindCampusGame,bindCampusGameEntry} from '../dist/js/learning-game-ui.js';
import {routeKey,safeRoute} from '../dist/js/navigation.js';
const run=(s,type,p={})=>{const result=applyAction(s,type,p);assert.equal(result.ok,true,result.message);return result;};
function student(){const s=createDemoState();run(s,'learningEnroll',{goal:'allowance',personalised:false});return s;}
function financial(s){return JSON.stringify({wallet:s.wallet,budget:s.budget,ious:s.ious,transactions:s.transactions,groups:s.groups,boxes:s.boxes});}
function harness(state,route={section:'learn',page:'game'},entry=false){
 let current=route,refreshes=0,sheetHtml='',sheetRoot=null;const attributes=new Map(),callbacks=new Map(),error={textContent:''},root={isConnected:true,setAttribute:(name,value)=>attributes.set(name,value),getAttribute:name=>attributes.get(name),addEventListener:(name,fn)=>callbacks.set(name,fn),removeEventListener:name=>callbacks.delete(name),querySelector:()=>error},actions=[],routes=[];
 const ctx={state,draft:{},get route(){return current;},$(selector){return selector===(entry?'.campus-game-entry':'.campus-game-page')?root:selector==='[data-campus-error]'?error:null;},act(type,payload){actions.push({type,payload});return applyAction(state,type,payload);},go(next){current=next;routes.push(next);},saveDraft(){},refresh(){refreshes++;},toast(){},sheet(html,bind){sheetHtml=html;const handlers=new Map();sheetRoot={isConnected:true,handlers,addEventListener:(name,fn)=>handlers.set(name,fn),removeEventListener:name=>handlers.delete(name),querySelectorAll:()=>[]};bind?.(sheetRoot);},closeSheet(){if(sheetRoot)sheetRoot.isConnected=false;}};
 let cleanup=entry?bindCampusGameEntry(ctx):bindCampusGame(ctx,route);
 return {ctx,root,error,actions,routes,get sheetHtml(){return sheetHtml;},get sheetOpen(){return sheetRoot?.isConnected===true;},cleanup(){cleanup();},rebind(){cleanup();cleanup=entry?bindCampusGameEntry(ctx):bindCampusGame(ctx,current);},get route(){return current;},get refreshes(){return refreshes;},click(dataset,disabled=false){callbacks.get('click')?.({target:{closest:()=>({dataset,disabled})}});},sheetClick(dataset,disabled=false){sheetRoot?.handlers.get('click')?.({target:{closest:()=>({dataset,disabled})}});}};
}

function start(s,mission=CAMPUS_MISSIONS[0]){return run(s,'campusStart',{missionId:mission.id,replay:true}).runId;}
function choose(s,id,index=0){const view=getCampusRun(s,id);return run(s,'campusChoose',{runId:id,stepId:view.stepId,choiceId:view.turn.choices[index].id});}
function finish(s,id){for(let i=0;i<3;i++){choose(s,id);const v=getCampusRun(s,id);run(s,'campusContinue',{runId:id,stepId:v.stepId});}return getCampusRun(s,id);}

test('campus entry is direct play with a separate fictional economy and no personal amounts',()=>{
 const s=student();s.wallet=98765432;const before=financial(s),h=harness(s,{section:'learn',page:'home'},true),html=renderCampusGameEntry(h.ctx);
 assert.match(html,/Campus Run/);assert.match(html,/data-world-stage data-world="campus" data-phase="preview"/);assert.match(html,/data-world-player/);assert.doesNotMatch(html,/campus-entry-score|campus-entry-scene|campus-diorama/);assert.match(html,/Story money/);assert.doesNotMatch(html,/987,654/);assert.match(html,/data-campus-action="start"/);assert.match(html,/data-campus-action="map"/);assert.match(html,/Lux looks/);
 h.click({campusAction:'start',missionId:CAMPUS_MISSIONS[0].id});assert.equal(h.actions[0].type,'campusStart');assert.equal(h.route.page,'play');assert.ok(getCampusRun(s,h.route.id));assert.equal(financial(s),before);h.cleanup();
});

test('a game choice uses the current scene token and repeated taps cannot submit another move',()=>{
 const s=student(),id=start(s),view=getCampusRun(s,id),h=harness(s,{section:'learn',page:'play',id}),before=financial(s);
 h.click({campusChoice:view.turn.choices[0].id});h.click({campusChoice:view.turn.choices[0].id});
 assert.deepEqual(h.actions,[{type:'campusChoose',payload:{runId:id,stepId:view.stepId,choiceId:view.turn.choices[0].id}}]);assert.equal(getCampusRun(s,id).status,'consequence');assert.equal(h.refreshes,1);assert.equal(financial(s),before);
 const html=renderCampusGame(h.ctx,h.route);assert.match(html,/data-phase="consequence"/);assert.match(html,/Try another move/);assert.doesNotMatch(html,/<strong>true<\/strong>/);h.cleanup();
});

test('rewind reveals the same decision with a fresh token and continue advances only once',()=>{
 const s=student(),id=start(s);choose(s,id,2);const h=harness(s,{section:'learn',page:'play',id}),old=getCampusRun(s,id).stepId;
 h.click({campusAction:'rewind'});let v=getCampusRun(s,id);assert.equal(v.status,'choice');assert.notEqual(v.stepId,old);const choiceToken=v.stepId;
 h.click({campusChoice:v.turn.choices[0].id});h.click({campusAction:'continue'});h.click({campusAction:'continue'});v=getCampusRun(s,id);assert.equal(v.turnIndex,1);assert.equal(v.status,'choice');assert.equal(h.actions.filter(a=>a.type==='campusContinue').length,1);assert.equal(h.actions.find(a=>a.type==='campusChoose').payload.stepId,choiceToken);h.cleanup();
});

test('map navigation, resume and Home routes preserve the active run',()=>{
 const s=student(),id=start(s),h=harness(s,{section:'learn',page:'game'});
 let html=renderCampusGame(h.ctx,h.route);assert.match(html,/Resume my run/);assert.match(html,/Complete the previous chapter to unlock/);h.click({campusAction:'resume'});assert.deepEqual(h.route,{section:'learn',page:'play',id});
 h.click({campusAction:'map'});assert.deepEqual(h.route,{section:'learn',page:'game'});h.click({campusAction:'home'});assert.deepEqual(h.route,{section:'home',page:'home'});assert.equal(getCampusGame(s).activeRunId,id);assert.equal(h.actions.length,0);h.cleanup();
});

test('completed runs show skill stars and a real-life entry without moving money or granting lesson XP',()=>{
 const s=student(),id=start(s),before=financial(s),points=s.learning.points,v=finish(s,id),h=harness(s,{section:'learn',page:'play',id});
 const html=renderCampusGame(h.ctx,h.route);assert.match(html,/3 of 3 skill stars/);assert.match(html,/Game details/);assert.doesNotMatch(html,/campus-run-result|campus-skill-checks/);h.click({campusAction:'details'});assert.match(h.sheetHtml,/What earned these stars/);assert.match(h.sheetHtml,/Make room for plans/);assert.match(h.sheetHtml,/Best run/);assert.equal(v.stars,3);assert.equal(s.learning.points,points);assert.equal(financial(s),before);
 h.sheetClick({campusAction:'real-life'});assert.equal(h.sheetOpen,false);assert.equal(h.route.page,'practice');assert.deepEqual(h.route.returnTo,{section:'learn',page:'play',id});assert.equal(h.actions.length,0);h.cleanup();
});

test('locked looks cannot be equipped, earned looks equip and completed map nodes truly replay',()=>{
 const s=student(),h=harness(s,{section:'learn',page:'rewards'}),locked=getCampusGame(s).rewards.find(r=>!r.unlocked);h.click({campusReward:locked.id});assert.equal(h.actions.length,0);
 const id=start(s);finish(s,id);const reward=getCampusGame(s).rewards.find(r=>r.unlocked&&r.id!=='classic');h.click({campusReward:reward.id});assert.equal(getCampusGame(s).equipped,reward.id);assert.equal(h.actions[0].type,'campusEquip');assert.match(renderCampusGame(h.ctx,h.route),/Wearing it/);h.cleanup();
 const map=harness(s,{section:'learn',page:'game'});map.click({campusMission:CAMPUS_MISSIONS[0].id});assert.equal(map.actions[0].payload.replay,true);assert.notEqual(map.route.id,id);assert.equal(getCampusRun(s,map.route.id).status,'choice');map.cleanup();
});

test('a complete campus shows a replay route rather than another locked next chapter',()=>{
 const s=student();for(const mission of CAMPUS_MISSIONS)finish(s,start(s,mission));
 const h=harness(s,{section:'learn',page:'game'}),html=renderCampusGame(h.ctx,h.route),entry=renderCampusGameEntry(h.ctx);
 assert.match(entry,/Campus complete/);assert.match(entry,/Choose a replay/);h.click({campusAction:'details'});assert.match(h.sheetHtml,/18 \/ 18/);assert.doesNotMatch(html,/Your next chapter/);assert.doesNotMatch(html,/data-campus-mission="[^"]+" disabled/);start(s,CAMPUS_MISSIONS[0]);assert.match(renderCampusGameEntry(h.ctx),/Resume my run/);h.cleanup();
});

test('disposed or detached game controls cannot act and missing runs have a useful map return',()=>{
 for(const disposed of [true,false]){const s=student(),h=harness(s,{section:'learn',page:'home'},true);if(disposed)h.cleanup();else h.root.isConnected=false;h.click({campusAction:'start',missionId:CAMPUS_MISSIONS[0].id});assert.equal(h.actions.length,0);h.cleanup();}
 const s=student(),h=harness(s,{section:'learn',page:'play',id:'missing'});assert.match(renderCampusGame(h.ctx,h.route),/Find your next chapter/);assert.match(renderCampusGame(h.ctx,h.route),/data-campus-action="map"/);h.cleanup();
});


test('motion hooks animate only fictional display copies while final amounts remain accessible',()=>{
 const s=student(),id=start(s),h=harness(s,{section:'learn',page:'play',id}),before=financial(s);
 let html=renderCampusGame(h.ctx,h.route);assert.match(html,/lux-world-hud/);assert.match(html,/data-world-player/);assert.doesNotMatch(html,/campus-diorama|campus-motion-toolbar/);assert.match(html,/GH₵120/);
 h.click({campusChoice:getCampusRun(s,id).turn.choices[0].id});
 html=renderCampusGame(h.ctx,h.route);assert.match(html,/data-motion-from="12000" data-motion-to="9500"/);assert.match(html,/class="campus-sr-only">GH₵95/);assert.equal(getCampusRun(s,id).money.wallet,9500);
 h.rebind();assert.equal(h.root.getAttribute('data-motion-fresh'),'true');assert.equal(h.root.getAttribute('data-motion-kind'),'consequence');
 h.rebind();assert.equal(h.root.getAttribute('data-motion-fresh'),'false');assert.doesNotMatch(renderCampusGame(h.ctx,h.route),/data-motion-from="12000" data-motion-to="9500"/);assert.equal(h.actions.length,1);assert.equal(financial(s),before);h.cleanup();
});

test('motion toggle is a presentation preference and never changes money, game progress or learning credit',()=>{
 const s=student(),id=start(s),h=harness(s,{section:'learn',page:'play',id}),before=JSON.stringify(s);
 h.click({campusAction:'details'});h.sheetClick({campusAction:'motion'});assert.equal(h.sheetOpen,false);assert.equal(h.ctx.draft.campusMotionOff,true);assert.equal(h.actions.length,0);assert.equal(JSON.stringify(s),before);assert.match(renderCampusGame(h.ctx,h.route),/campus-motion-off/);h.click({campusAction:'details'});assert.match(h.sheetHtml,/Motion off/);
 h.rebind();h.click({campusAction:'details'});h.sheetClick({campusAction:'motion'});assert.equal(h.ctx.draft.campusMotionOff,false);assert.equal(h.actions.length,0);assert.equal(JSON.stringify(s),before);h.cleanup();
});

test('a fresh completion and chapter unlock celebrate once, not on refresh or motion toggles',()=>{
 const s=student(),id=start(s);for(let i=0;i<2;i++){choose(s,id);const v=getCampusRun(s,id);run(s,'campusContinue',{runId:id,stepId:v.stepId});}
 const h=harness(s,{section:'learn',page:'play',id});h.click({campusChoice:getCampusRun(s,id).turn.choices[0].id});h.rebind();h.click({campusAction:'continue'});
 assert.equal(getCampusRun(s,id).status,'completed');h.rebind();assert.equal(h.root.getAttribute('data-motion-kind'),'completion');assert.equal(h.root.getAttribute('data-motion-fresh'),'true');
 h.rebind();assert.equal(h.root.getAttribute('data-motion-fresh'),'false');const stars=getCampusGame(s).totalStars;
 h.click({campusAction:'motion'});h.rebind();assert.equal(h.root.getAttribute('data-motion-fresh'),'false');assert.equal(getCampusGame(s).totalStars,stars);
 h.click({campusAction:'map'});assert.match(renderCampusGame(h.ctx,h.route),/The printing plot is open/);h.rebind();assert.equal(h.root.getAttribute('data-motion-fresh'),'true');h.rebind();assert.equal(h.root.getAttribute('data-motion-fresh'),'false');assert.doesNotMatch(renderCampusGame(h.ctx,h.route),/The printing plot is open/);assert.equal(h.actions.length,2);h.cleanup();
});

test('device reduced motion wins over the game preference without creating a game action',()=>{
 const original=globalThis.matchMedia;const listeners=new Set(),query={matches:true,addEventListener:(type,callback)=>listeners.add(callback),removeEventListener:(type,callback)=>listeners.delete(callback)};
 globalThis.matchMedia=()=>query;
 try{const s=student(),h=harness(s,{section:'learn',page:'game'}),before=JSON.stringify(s),html=renderCampusGame(h.ctx,h.route);assert.doesNotMatch(html,/campus-motion-toolbar/);h.click({campusAction:'details'});assert.match(h.sheetHtml,/Animations reduced by device settings/);assert.match(h.sheetHtml,/Motion reduced/);h.sheetClick({campusAction:'motion'},true);assert.equal(h.actions.length,0);assert.equal(h.ctx.draft.campusMotionOff,undefined);assert.equal(JSON.stringify(s),before);h.cleanup();assert.equal(listeners.size,0);}finally{if(original===undefined)delete globalThis.matchMedia;else globalThis.matchMedia=original;}
});

test('clean choices keep decision costs visible and the wallet sheet stays focused',()=>{
 const s=student(),id=start(s),h=harness(s,{section:'learn',page:'play',id}),before=JSON.stringify(s);
 const html=renderCampusGame(h.ctx,h.route);
 assert.match(html,/class="lux-world-target-cost">GH₵65<\/span>/);
 assert.doesNotMatch(html,/GH₵65\.<\/span>|campus-choice-emoji|campus-motion-toolbar|campus-diorama|campus-money-strip/);
 assert.match(html,/<small>Plan<\/small><strong><span class="campus-sr-only">GH₵60/);assert.match(html,/<small>Room<\/small>/);assert.match(html,/class="campus-sr-only">GH₵50/);assert.match(html,/expected, not available/);
 h.click({campusAction:'wallet'});assert.match(h.sheetHtml,/Expected · hasn’t arrived/);assert.match(h.sheetHtml,/Cushion/);
 assert.doesNotMatch(h.sheetHtml,/Your run|data-campus-action="progress"|campus-choice-notes|campus-motion-toggle/);
 assert.equal(h.actions.length,0);assert.equal(JSON.stringify(s),before);h.cleanup();
});

test('result details preserve every money change without adding navigation clutter',()=>{
 const s=student();finish(s,start(s));const id=start(s,CAMPUS_MISSIONS[1]);
 for(let i=0;i<2;i++){choose(s,id);run(s,'campusContinue',{runId:id,stepId:getCampusRun(s,id).stepId});}choose(s,id);
 const v=getCampusRun(s,id),h=harness(s,{section:'learn',page:'play',id});assert.ok(v.lastOutcome.changes.length>=2);
 const html=renderCampusGame(h.ctx,h.route);assert.match(html,/data-phase="consequence"/);assert.doesNotMatch(html,/campus-result-line|campus-change-list|campus-skill-spark/);
 h.click({campusAction:'details'});assert.match(h.sheetHtml,/About this moment/);for(const change of v.lastOutcome.changes)assert.ok(h.sheetHtml.includes(`${change.label}</span><strong>`));
 assert.equal(h.actions.length,0);h.cleanup();
});

test('details keep learning routes accessible and disposed sheet controls cannot act',()=>{
 const s=student(),h=harness(s,{section:'learn',page:'home'},true),before=JSON.stringify(s);
 h.click({campusAction:'details'});assert.match(h.sheetHtml,/My learning progress/);assert.match(h.sheetHtml,/Learning preferences/);
 h.sheetClick({campusAction:'progress'});assert.equal(h.sheetOpen,false);assert.deepEqual(h.route,{section:'learn',page:'progress',returnTo:{section:'learn',page:'home'}});assert.equal(h.actions.length,0);h.cleanup();
 const other=harness(s,{section:'learn',page:'home'},true);other.click({campusAction:'details'});other.cleanup();other.sheetClick({campusAction:'start',missionId:CAMPUS_MISSIONS[0].id});assert.equal(other.actions.length,0);assert.equal(JSON.stringify(s),before);
});


test('Game details begins as a compact menu and opens its separate wallet without acting',()=>{
 const s=student(),id=start(s),h=harness(s,{section:'learn',page:'play',id}),before=JSON.stringify(s);
 h.click({campusAction:'details'});
 assert.match(h.sheetHtml,/<details class="campus-moment-details"><summary>About this moment/);
 assert.doesNotMatch(h.sheetHtml,/<details[^>]* open|campus-details-wallet|Chapters explored/);
 assert.match(h.sheetHtml,/data-campus-action="wallet"/);assert.match(h.sheetHtml,/campus-details-progress/);
 h.sheetClick({campusAction:'wallet'});assert.equal(h.sheetOpen,true);assert.match(h.sheetHtml,/<h2>Story wallet/);assert.match(h.sheetHtml,/Expected · hasn’t arrived/);assert.doesNotMatch(h.sheetHtml,/campus-details-actions|campus-moment-details/);
 assert.equal(h.actions.length,0);assert.equal(JSON.stringify(s),before);h.cleanup();
});


test('destinations make a short world decision and keep the full story in Info',()=>{
 const s=student(),id=start(s),h=harness(s,{section:'learn',page:'play',id}),view=getCampusRun(s,id),html=renderCampusGame(h.ctx,h.route);
 assert.equal((html.match(/data-world-choice=/g)||[]).length,view.turn.choices.length);assert.match(html,/data-world-player[^>]*tabindex="0"/);assert.doesNotMatch(html,/data-world-player[^>]*data-motion=|campus-choices|campus-choice-card/);
 assert.ok(!html.includes(`<p>${view.turn.body}</p>`));assert.equal((html.match(/<h1>/g)||[]).length,1);
 const prompt=html.match(/<h1>([^<]*)<\/h1>/)?.[1]||'';assert.ok(prompt.split(/\s+/).length<=8);
 h.click({campusAction:'details'});assert.ok(h.sheetHtml.includes(view.turn.body));for(const choice of view.turn.choices)assert.ok(h.sheetHtml.includes(choice.detail));assert.equal(h.actions.length,0);h.cleanup();
});

test('cold consequence resume stands at its chosen destination without replaying effects',()=>{
 const s=student(),id=start(s);choose(s,id,2);const h=harness(s,{section:'learn',page:'play',id}),html=renderCampusGame(h.ctx,h.route),before=JSON.stringify(s);
 assert.match(html,/data-world-player data-world-x="78" data-world-y="58"/);assert.match(html,/data-world-gate/);assert.doesNotMatch(html,/data-world-effect/);h.rebind();assert.equal(h.root.getAttribute('data-motion-fresh'),'false');assert.equal(JSON.stringify(s),before);h.cleanup();
});

test('world destination aliases save immediately and never delay Home or the next gate',()=>{
 const s=student(),id=start(s),h=harness(s,{section:'learn',page:'play',id}),choice=getCampusRun(s,id).turn.choices[0].id;let refreshedStatus='';
 h.ctx.refresh=()=>{refreshedStatus=getCampusRun(s,id).status;};h.click({worldChoice:choice});assert.equal(refreshedStatus,'consequence');assert.equal(h.actions.length,1);h.rebind();
 h.click({campusAction:'continue'});assert.equal(getCampusRun(s,id).status,'choice');assert.equal(getCampusRun(s,id).turnIndex,1);h.click({campusAction:'home'});assert.deepEqual(h.route,{section:'home',page:'home'});assert.equal(h.actions.length,2);h.cleanup();
});

test('every completed chapter offers a lesson then a run insight before the next chapter',()=>{
 const s=student(),id=start(s);finish(s,id);const before=JSON.stringify(s),h=harness(s,{section:'learn',page:'play',id});
 let html=renderCampusGame(h.ctx,h.route);assert.match(html,/See what I learned/);assert.match(html,/3 challenges/);assert.match(html,/3 of 3 skill stars/);
 h.click({campusAction:'reflection-lesson'});assert.deepEqual(h.route,{section:'learn',page:'play',id,step:'lesson'});html=renderCampusGame(h.ctx,h.route);assert.match(html,/Give your balance jobs/);assert.match(html,/data-lesson-kind="split"/);assert.match(html,/See my insight/);assert.match(html,/Keep playing/);
 const lessonRoute=h.route;h.click({campusAction:'reflection-insight'});assert.deepEqual(h.route,{section:'learn',page:'play',id,step:'insight'});html=renderCampusGame(h.ctx,h.route);assert.match(html,/Lux noticed · this run/);assert.match(html,/This run · story money/);assert.match(html,/Next chapter/);assert.match(html,/Try this in Lumo/);
 assert.notEqual(routeKey(h.route),routeKey(lessonRoute));assert.equal(JSON.stringify(s),before);assert.equal(h.actions.length,0);h.cleanup();
});

test('lesson and insight refresh preserve their destination and real-life work returns to the insight',()=>{
 const s=student(),id=start(s);finish(s,id);const route={section:'learn',page:'play',id,step:'insight'},saved=JSON.parse(JSON.stringify({s,route})),h=harness(saved.s,safeRoute(saved.route,saved.s,{})),before=financial(saved.s),points=saved.s.learning.points;
 assert.match(renderCampusGame(h.ctx,h.route),/data-reflection-step="insight"/);h.click({campusAction:'real-life'});assert.deepEqual(h.route.returnTo,route);assert.equal(h.route.page,'practice');assert.equal(financial(saved.s),before);assert.equal(saved.s.learning.points,points);assert.equal(h.actions.length,0);h.cleanup();
});

test('reflection back, Home and skip routes do not repeat completion or reward credit',()=>{
 const s=student(),id=start(s);finish(s,id);const stars=getCampusGame(s).totalStars,before=financial(s),points=s.learning.points,h=harness(s,{section:'learn',page:'play',id,step:'insight'});
 h.click({campusAction:'reflection-lesson'});assert.equal(h.route.step,'lesson');h.click({campusAction:'reflection-result'});assert.deepEqual(h.route,{section:'learn',page:'play',id});h.click({campusAction:'home'});assert.deepEqual(h.route,{section:'home',page:'home'});h.cleanup();
 const skip=harness(s,{section:'learn',page:'play',id,step:'lesson'});skip.click({campusAction:'reflection-keep-playing'});const nextId=skip.route.id;skip.click({campusAction:'reflection-keep-playing'});assert.equal(skip.actions.length,1);assert.equal(getCampusRun(s,nextId).missionId,CAMPUS_MISSIONS[1].id);assert.equal(getCampusRun(s,id).status,'completed');assert.equal(getCampusGame(s).totalStars,stars);assert.equal(financial(s),before);assert.equal(s.learning.points,points);skip.cleanup();
});

test('active runs cannot reveal post-challenge lessons or bypass challenges through reflection controls',()=>{
 const s=student(),id=start(s),h=harness(s,{section:'learn',page:'play',id,step:'lesson'}),before=JSON.stringify(s);
 assert.match(renderCampusGame(h.ctx,h.route),/data-phase="choice"/);assert.doesNotMatch(renderCampusGame(h.ctx,h.route),/Give your balance jobs|data-reflection-step/);
 for(const campusAction of ['reflection-lesson','reflection-insight','reflection-result','reflection-keep-playing'])h.click({campusAction});
 assert.equal(h.routes.length,0);assert.equal(h.actions.length,0);assert.equal(JSON.stringify(s),before);h.cleanup();
});

test('lessons archive selects the latest completed run and excludes active or invalid ids',()=>{
 const s=student(),empty=harness(s,{section:'learn',page:'game'});empty.click({campusAction:'details'});empty.sheetClick({campusAction:'reflections'});assert.match(empty.sheetHtml,/Finish three challenges/);assert.doesNotMatch(empty.sheetHtml,/data-campus-reflection-run/);empty.cleanup();
 const older=start(s);finish(s,older);const latest=start(s);finish(s,latest);const active=start(s,CAMPUS_MISSIONS[1]),h=harness(s,{section:'learn',page:'game'}),before=JSON.stringify(s);
 h.click({campusAction:'details'});h.sheetClick({campusAction:'reflections'});assert.match(h.sheetHtml,/Lessons & insights/);assert.ok(h.sheetHtml.includes(`data-campus-reflection-run="${latest}"`));assert.ok(!h.sheetHtml.includes(`data-campus-reflection-run="${older}"`));assert.ok(!h.sheetHtml.includes(`data-campus-reflection-run="${active}"`));h.sheetClick({campusReflectionRun:latest});assert.deepEqual(h.route,{section:'learn',page:'play',id:latest,step:'lesson',archived:true});h.click({campusReflectionRun:active});h.click({campusReflectionRun:'missing'});assert.equal(h.routes.length,1);assert.equal(JSON.stringify(s),before);assert.equal(h.actions.length,0);h.cleanup();
});

test('final chapter reflection leads to the map and keeps its verified status examples visible',()=>{
 const s=student();let id;for(const mission of CAMPUS_MISSIONS){id=start(s,mission);finish(s,id);}const h=harness(s,{section:'learn',page:'play',id,step:'insight'}),before=JSON.stringify(s);
 assert.match(renderCampusGame(h.ctx,h.route),/Back to campus map/);assert.doesNotMatch(renderCampusGame(h.ctx,h.route),/>Next chapter</);h.click({campusAction:'reflection-keep-playing'});assert.deepEqual(h.route,{section:'learn',page:'game'});assert.equal(JSON.stringify(s),before);h.cleanup();
 const hostel=s.learning.game.runs.find(r=>r.missionId==='hostel-countdown'),lesson=harness(s,{section:'learn',page:'play',id:hostel.id,step:'lesson'});assert.match(renderCampusGame(lesson.ctx,lesson.route),/Needs funding/);lesson.cleanup();
});
