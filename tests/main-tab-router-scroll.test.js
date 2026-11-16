import test from 'node:test';
import assert from 'node:assert/strict';
import {createRouter} from '../dist/js/router.js';
import {routeKey,parentRoute} from '../dist/js/navigation.js';
import {rememberMainTab,mainTabDestination} from '../dist/js/main-tab-state.js';
const home={section:'home',page:'home'},box={section:'boxes',page:'create',step:'target'},activity={section:'activity',page:'home'},plan={section:'plan',page:'home'};
function harness(){
 let entries=[null],cursor=0;const pending=[],renders=[];
 const history={get state(){return entries[cursor];},pushState(value){entries=entries.slice(0,cursor+1);entries.push(structuredClone(value));cursor++;},replaceState(value){entries[cursor]=structuredClone(value);},go(delta){const target=cursor+delta;assert.ok(target>=0&&target<entries.length);pending.push(target);}};
 const router=createRouter({initialRoute:home,history,key:routeKey,parent:parentRoute,onNavigate:(route,info)=>renders.push({route,...info})});
 const flush=()=>{let remaining=30;while(pending.length){assert.ok(remaining-->0);cursor=pending.shift();router.receive(history.state);}};router.initialise();return{router,flush,renders};
}
test('a main tab resumes its saved scroll after native forward history was replaced',()=>{
 const f=harness(),draft={box:{name:'Study laptop',target:45000}},state={onboardingDone:true};f.router.go(box);f.router.setScroll(244);rememberMainTab(draft,box,244);f.router.go(activity);f.router.go(home);f.flush();f.router.go(plan);assert.equal(f.router.snapshot().entries.some(e=>e.route.section==='boxes'),false);const destination=mainTabDestination('boxes',state,draft);f.router.go(destination.route,{scroll:destination.scroll});assert.deepEqual(f.router.current,box);assert.equal(f.renders.at(-1).scroll,244);assert.equal(f.router.snapshot().entries.at(-1).scroll,244);assert.equal(draft.box.target,45000);
});
test('explicit tab scroll overrides an older history position and survives a queued navigation',()=>{
 const f=harness();f.router.go(box);f.router.setScroll(22);f.router.go(activity);f.router.setScroll(66);f.router.go(plan);f.router.go(box,{scroll:450});f.router.go(activity,{scroll:310});f.flush();const boxRender=f.renders.filter(r=>routeKey(r.route)===routeKey(box)).at(-1);assert.equal(boxRender.scroll,450);assert.equal(f.router.snapshot().entries.find(e=>routeKey(e.route)===routeKey(box)).scroll,450);assert.deepEqual(f.router.current,activity);assert.equal(f.renders.at(-1).scroll,310);assert.equal(f.router.snapshot().entries.at(-1).scroll,310);
});
