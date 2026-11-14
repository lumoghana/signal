import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';

const source=()=>readFileSync(new URL('../dist/appearance.js',import.meta.url),'utf8');
const key='lumo-appearance-v1';

function harness({values=new Map(),systemLight=false,blockedRead=false,blockedWrite=false}={}){
 const storageEvents=new Map(),mediaEvents=new Map(),writes=[];
 const html={dataset:{},style:{}},meta={content:'initial'};
 const storage={
  getItem(name){if(blockedRead)throw new Error('Storage unavailable');return values.get(name)??null},
  setItem(name,value){if(blockedWrite)throw new Error('Storage unavailable');writes.push([name,String(value)]);values.set(name,String(value))}
 };
 const media={matches:systemLight,addEventListener(type,listener){mediaEvents.set(type,listener)}};
 const window={localStorage:storage,document:{documentElement:html,querySelector(selector){return selector==='meta[name="theme-color"]'?meta:null}},matchMedia(){return media},addEventListener(type,listener){storageEvents.set(type,listener)}};
 runInNewContext(source(),{window});
 return {appearance:window.LumoAppearance,html,meta,values,writes,system(value){media.matches=value;mediaEvents.get('change')?.({matches:value})},storageChanged(name=key){storageEvents.get('storage')?.({key:name})}};
}

test('a fresh device opens dark without changing account or money storage',()=>{
 const values=new Map([['account-record','private-account-state']]),h=harness({values});
 assert.equal(h.appearance.getPreference(),'dark');assert.equal(h.appearance.getTheme(),'dark');
 assert.equal(h.html.dataset.appearance,'dark');assert.equal(h.html.dataset.theme,'dark');
 assert.equal(h.html.style.colorScheme,'dark');assert.equal(h.meta.content,'#191a22');
 assert.equal(h.writes.length,0);assert.equal(values.get('account-record'),'private-account-state');
});

test('saved appearance is applied before the app renders and survives a new page load',()=>{
 for(const preference of ['light','dark','system']){
  const values=new Map([[key,preference],['account-record','untouched']]),h=harness({values,systemLight:true});
  const expected=preference==='system'?'light':preference;
  assert.equal(h.appearance.getPreference(),preference);assert.equal(h.appearance.getTheme(),expected);
  assert.equal(h.html.dataset.appearance,preference);assert.equal(h.html.dataset.theme,expected);
  assert.equal(h.html.style.colorScheme,expected);assert.equal(h.meta.content,expected==='light'?'#f3f4f1':'#191a22');
  const result=h.appearance.setPreference(preference==='dark'?'light':'dark');
  assert.equal(result.ok,true);assert.equal(result.saved,true);
  const reloaded=harness({values});assert.equal(reloaded.appearance.getPreference(),values.get(key));
  assert.equal(values.get('account-record'),'untouched');assert.equal(values.size,2);
 }
});

test('invalid saved and requested choices cannot change the selected appearance',()=>{
 const h=harness({values:new Map([[key,'invalid-theme']])});assert.equal(h.appearance.getPreference(),'dark');
 let updates=0;h.appearance.subscribe(()=>updates++);
 for(const invalid of ['auto','LIGHT','',null,undefined,{},1]){
  const result=h.appearance.setPreference(invalid);assert.equal(result.ok,false);assert.equal(result.saved,false);
  assert.equal(h.appearance.getPreference(),'dark');assert.equal(h.appearance.getTheme(),'dark');
 }
 assert.equal(h.values.get(key),'invalid-theme');assert.equal(h.writes.length,0);assert.equal(updates,0);
});

test('System follows device changes while explicit Light and Dark remain selected',()=>{
 const h=harness({systemLight:true});
 h.appearance.setPreference('system');assert.equal(h.appearance.getTheme(),'light');
 h.system(false);assert.equal(h.appearance.getTheme(),'dark');assert.equal(h.appearance.getPreference(),'system');
 h.system(true);assert.equal(h.appearance.getTheme(),'light');
 h.appearance.setPreference('dark');h.system(false);h.system(true);assert.equal(h.appearance.getTheme(),'dark');
 h.appearance.setPreference('light');h.system(false);assert.equal(h.appearance.getTheme(),'light');
 assert.equal(h.values.get(key),'light');
});

test('appearance changes notify subscribers and another page can update the device preference',()=>{
 const h=harness(),updates=[];const unsubscribe=h.appearance.subscribe(value=>updates.push({...value}));
 h.appearance.setPreference('light');assert.deepEqual(updates,[{preference:'light',theme:'light'}]);
 h.values.set(key,'dark');h.storageChanged('account-record');assert.equal(h.appearance.getTheme(),'light');
 h.storageChanged();assert.equal(h.appearance.getTheme(),'dark');assert.equal(updates.at(-1).theme,'dark');
 unsubscribe();h.values.delete(key);h.storageChanged(null);assert.equal(h.appearance.getPreference(),'dark');assert.equal(updates.length,2);
});

test('blocked storage keeps appearance usable for the current page without touching saved data',()=>{
 const values=new Map([['account-record','untouched']]),h=harness({values,blockedRead:true,blockedWrite:true});
 assert.equal(h.appearance.getTheme(),'dark');const result=h.appearance.setPreference('light');
 assert.equal(result.ok,true);assert.equal(result.saved,false);assert.equal(h.appearance.getPreference(),'light');
 assert.equal(h.html.dataset.theme,'light');assert.equal(h.html.style.colorScheme,'light');assert.equal(h.meta.content,'#f3f4f1');
 assert.equal(values.size,1);assert.equal(values.get('account-record'),'untouched');assert.equal(h.writes.length,0);
});
