import test from 'node:test';
import assert from 'node:assert/strict';
import {webcrypto} from 'node:crypto';

// Run the real app event handlers and real appearance controller with a small
// DOM, as in shared-app.test.mjs. These device settings need no API transport.
class Storage {
 constructor(){this.data=new Map()}
 getItem(key){return this.data.get(key)??null}
 setItem(key,value){this.data.set(key,String(value))}
 removeItem(key){this.data.delete(key)}
}
class Element {
 constructor(){this.dataset={};this.children=[];this.inert=false;this.disabled=false;this.value='';this.classList={add(){},remove(){},toggle(){},contains(){return false}};this.innerHTML=''}
 set innerHTML(value){
  this.markup=value;this.radios=[...value.matchAll(/<input type="radio" name="appearance" value="([^"]+)"([^>]*)>/g)].map(([,value,attrs])=>Object.assign(new Element(),{name:'appearance',type:'radio',value,checked:attrs.includes('checked')}));
  this.hint=value.includes('class="appearance-hint"')?{textContent:''}:null;
  this.label=value.includes('data-appearance-label')?{textContent:''}:null;
  this.dataset.modalKey=value.match(/data-modal-key="([^"]+)"/)?.[1];
 }
 get innerHTML(){return this.markup}
 querySelector(){return null}
 querySelectorAll(selector){if(selector==='[name="appearance"]'||selector==='input,select,textarea')return this.radios;if(selector==='.appearance-hint')return this.hint?[this.hint]:[];if(selector==='[data-appearance-label]')return this.label?[this.label]:[];return []}
 append(child){this.children.push(child)} remove(){} focus(){} scrollTo(){} scrollIntoView(){} setAttribute(){} contains(){return false} matches(){return false}
}

test('Appearance is reachable before signup and in Administration without changing business or account records',async t=>{
 const original={fetch:globalThis.fetch,setTimeout:globalThis.setTimeout,setInterval:globalThis.setInterval,clearInterval:globalThis.clearInterval,history:globalThis.history};
 const listeners=new Map(),windowListeners=new Map(),mediaListeners=new Map(),calls=[];
 const nodes=new Map(['app','modal-root','toast-root','payment-announcement'].map(id=>[id,new Element()]));
 const localStorage=new Storage(),sessionStorage=new Storage(),media={matches:true,addEventListener(name,fn){mediaListeners.set(name,fn)}};
 const meta={content:'#191a22'},htmlElement={dataset:{},style:{}};
 const document={body:new Element(),documentElement:htmlElement,activeElement:null,
  querySelector(selector){if(selector==='meta[name="theme-color"]')return meta;if(selector==='[data-modal-key]')return nodes.get('modal-root').dataset.modalKey?nodes.get('modal-root'):null;return /^#[a-z-]+$/.test(selector)?nodes.get(selector.slice(1))||null:null},
  querySelectorAll(selector){return [...nodes.values()].flatMap(node=>node.querySelectorAll(selector))},
  getElementById(id){return nodes.get(id)||null},createElement(){return new Element()},
  addEventListener(name,fn){if(!listeners.has(name))listeners.set(name,[]);listeners.get(name).push(fn)}
 };
 Object.defineProperty(globalThis,'crypto',{value:webcrypto,configurable:true});
 Object.defineProperty(globalThis,'navigator',{value:{onLine:true,userAgent:'Appearance app test',clipboard:{writeText:async()=>{}}},configurable:true});
 const window={document,localStorage,matchMedia(){return media},scrollTo(){},speechSynthesis:{cancel(){}},addEventListener(name,fn){if(!windowListeners.has(name))windowListeners.set(name,[]);windowListeners.get(name).push(fn)},dispatchEvent(event){for(const fn of windowListeners.get(event.type)||[])fn(event)}};
 // Keep the browser's queued Back/Forward and popstate separate from the click.
 // With history absent, the app falls back to dismiss() and misses preauth bugs.
 const historyStates=[null],historyQueue=[];let historyIndex=0,backCalls=0;
 const history={get state(){return historyStates[historyIndex]},pushState(value){historyStates.splice(historyIndex+1);historyStates.push(structuredClone(value));historyIndex++},replaceState(value){historyStates[historyIndex]=structuredClone(value)},back(){backCalls++;historyQueue.push(historyIndex-1)},forward(){historyQueue.push(historyIndex+1)}};
 function flushHistory(){assert.equal(historyQueue.length,1,'The action queues one browser history move');historyIndex=Math.max(0,Math.min(historyStates.length-1,historyQueue.shift()));window.dispatchEvent({type:'popstate',state:history.state})}
 Object.assign(globalThis,{document,window,history,localStorage,sessionStorage,location:new URL('https://merchant.example.test/'),
  fetch:async(...args)=>{calls.push(args);throw Error('Appearance must not call an external service')},
  requestAnimationFrame(fn){fn();return 1},cancelAnimationFrame(){},BroadcastChannel:class {addEventListener(){}postMessage(){}close(){}},
  setInterval(){return {unref(){}}},clearInterval(){},setTimeout(fn,ms,...args){const timer=original.setTimeout(fn,ms,...args);timer.unref();return timer}
 });
 const html=()=>nodes.get('app').innerHTML,modal=()=>nodes.get('modal-root').innerHTML;
 async function click(action){const element={...new Element(),tagName:'BUTTON',dataset:{action},closest(selector){return selector==='[data-action]'?this:null}};for(const fn of listeners.get('click')||[])await fn({target:element,preventDefault(){}})}
 function choose(value){const radio=nodes.get('modal-root').radios.find(input=>input.value===value);assert.ok(radio,'The real modal renders this appearance choice');radio.checked=true;for(const fn of listeners.get('change')||[])fn({target:radio})}
 const records=storage=>[...storage.data].filter(([key])=>key!=='lumo-appearance-v1');
 try{
  await import('../dist/appearance.js');await import('../dist/app.js');
  const store=await import('../dist/store.js'),Auth=await import('../dist/account.js');
  await t.test('welcome opens the picker, saves Light and returns to the same signup screen',async()=>{
   assert.match(html(),/signup-shell is-welcome/);assert.match(html(),/data-action="appearance-settings"/);
   const business=JSON.stringify(store.getState()),beforeLocal=records(localStorage),beforeSession=records(sessionStorage),beforeCalls=calls.length;
   await click('appearance-settings');assert.match(modal(),/appearance-modal/);assert.equal(nodes.get('app').inert,true);
   assert.deepEqual(nodes.get('modal-root').radios.map(input=>input.value),['system','light','dark']);
   choose('light');assert.equal(window.LumoAppearance.getPreference(),'light');assert.equal(htmlElement.dataset.theme,'light');assert.equal(localStorage.getItem('lumo-appearance-v1'),'light');
   assert.deepEqual(nodes.get('modal-root').radios.map(input=>[input.value,input.checked]),[['system',false],['light',true],['dark',false]]);
   assert.equal(JSON.stringify(store.getState()),business);assert.deepEqual(records(localStorage),beforeLocal);assert.deepEqual(records(sessionStorage),beforeSession);assert.equal(Auth.getSession(),null);assert.equal(calls.length,beforeCalls,'Appearance adds no service calls');
   const beforeBack=backCalls;await click('dismiss');assert.equal(backCalls,beforeBack+1,'Close uses the actual browser Back path');assert.match(modal(),/appearance-modal/,'The overlay waits for popstate');
   flushHistory();assert.equal(modal(),'');assert.equal(nodes.get('app').inert,false);assert.match(html(),/signup-shell is-welcome/);
   history.forward();flushHistory();assert.match(modal(),/appearance-modal/,'Forward restores Appearance while signup stays open');assert.match(html(),/signup-shell is-welcome/);assert.equal(nodes.get('app').inert,true);assert.equal(nodes.get('modal-root').radios.find(input=>input.value==='light').checked,true);
   assert.equal(JSON.stringify(store.getState()),business);assert.equal(Auth.getSession(),null);assert.equal(calls.length,beforeCalls);
   await click('dismiss');flushHistory();assert.equal(modal(),'');
  });
  await t.test('sign-in also exposes System and follows a device appearance change',async()=>{
   await click('signup-login');assert.match(html(),/Welcome back/);assert.match(html(),/data-action="appearance-settings"/);const beforeCalls=calls.length;
   await click('appearance-settings');choose('system');assert.equal(htmlElement.dataset.theme,'light');
   media.matches=false;mediaListeners.get('change')?.({matches:false});assert.equal(htmlElement.dataset.theme,'dark');assert.equal(window.LumoAppearance.getPreference(),'system');
   assert.equal(nodes.get('modal-root').hint.textContent,'Follows your phone’s appearance.');assert.equal(Auth.getSession(),null);assert.equal(calls.length,beforeCalls,'Appearance adds no service calls');
   const beforeBack=backCalls;await click('dismiss');assert.equal(backCalls,beforeBack+1);flushHistory();assert.equal(modal(),'');assert.equal(nodes.get('app').inert,false);assert.match(html(),/Welcome back/);
   history.forward();flushHistory();assert.match(modal(),/appearance-modal/,'Forward restores Appearance above sign-in');assert.match(html(),/Welcome back/);assert.equal(Auth.getSession(),null);assert.equal(calls.length,beforeCalls);
   await click('dismiss');flushHistory();assert.equal(modal(),'');
  });
  await t.test('Administration exposes the saved choice and Dark remains a device-only setting',async()=>{
   await click('access-demo');await click('go-administration');assert.match(html(),/appearance-settings-group/);assert.match(html(),/data-appearance-label>System/);
   const business=JSON.stringify(store.getState()),beforeLocal=records(localStorage),beforeSession=records(sessionStorage),beforeCalls=calls.length;
   await click('appearance-settings');choose('dark');assert.equal(htmlElement.dataset.theme,'dark');assert.equal(nodes.get('app').label.textContent,'Dark');
   assert.equal(JSON.stringify(store.getState()),business);assert.deepEqual(records(localStorage),beforeLocal);assert.deepEqual(records(sessionStorage),beforeSession);assert.equal(Auth.getSession(),null);assert.equal(calls.length,beforeCalls,'Appearance adds no service calls');
   await click('dismiss');flushHistory();assert.equal(modal(),'');await click('appearance-settings');assert.equal(nodes.get('modal-root').radios.find(input=>input.value==='dark').checked,true);
  });
 }finally{Object.assign(globalThis,original)}
});
