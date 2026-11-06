import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';

const source=readFileSync(new URL('../dist/js/appearance.js',import.meta.url),'utf8');
function boot({saved=null,light=false,blocked=false}={}) {
  const values=new Map(saved===null?[]:[['lumo-appearance-v1',saved]]),events={},media={},meta={},html={dataset:{},style:{}};
  const query={matches:light,addEventListener:(name,fn)=>{media[name]=fn;}};
  const window={document:{documentElement:html,querySelector:()=>meta},localStorage:{getItem:key=>{if(blocked)throw Error('blocked');return values.get(key)??null;},setItem:(key,value)=>{if(blocked)throw Error('blocked');values.set(key,value);}},matchMedia:()=>query,addEventListener:(name,fn)=>{events[name]=fn;}};
  vm.runInNewContext(source,{window});
  return {controller:window.LumoAppearance,html,meta,values,system(value){query.matches=value;media.change();},storage(value){if(value===null)values.clear();else values.set('lumo-appearance-v1',value);events.storage({key:value===null?null:'lumo-appearance-v1'});}};
}
test('dark remains the default; invalid saved preferences never become a theme',()=>{
  for(const saved of [null,'invalid','<script>']){const b=boot({saved,light:true});assert.equal(b.controller.getPreference(),'dark');assert.equal(b.html.dataset.theme,'dark');assert.equal(b.meta.content,'#191a22');}
});
test('explicit choice persists after reload and ignores system changes',()=>{
  const b=boot();assert.equal(b.controller.setPreference('light').saved,true);b.system(false);assert.equal(b.controller.getTheme(),'light');assert.equal(b.meta.content,'#f3f4f1');
  assert.equal(boot({saved:b.values.get('lumo-appearance-v1')}).controller.getTheme(),'light');
  b.controller.setPreference('dark');b.system(true);assert.equal(b.controller.getTheme(),'dark');
});
test('System follows device changes while keeping the saved preference System',()=>{
  const b=boot({saved:'system',light:true});assert.equal(b.controller.getTheme(),'light');b.system(false);assert.equal(b.controller.getTheme(),'dark');assert.equal(b.controller.getPreference(),'system');assert.equal(b.values.get('lumo-appearance-v1'),'system');assert.equal(b.html.style.colorScheme,'dark');
});
test('storage failure allows an in-session choice without claiming it was saved',()=>{
  const b=boot({blocked:true});assert.equal(b.controller.getTheme(),'dark');const result=b.controller.setPreference('light');assert.equal(result.ok,true);assert.equal(result.saved,false);assert.equal(b.controller.getTheme(),'light');assert.equal(b.controller.setPreference('unknown').ok,false);assert.equal(b.controller.getTheme(),'light');
});
test('cross-tab changes notify subscribers without touching money records',()=>{
  const b=boot(),seen=[];b.values.set('account-record','untouched');const unsubscribe=b.controller.subscribe(value=>seen.push(value.theme));b.storage('light');assert.equal(b.controller.getTheme(),'light');assert.deepEqual(seen,['light']);assert.equal(b.values.get('account-record'),'untouched');unsubscribe();b.storage('dark');assert.deepEqual(seen,['light']);b.storage(null);assert.equal(b.controller.getPreference(),'dark');
});
