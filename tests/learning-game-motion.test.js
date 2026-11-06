import test from 'node:test';
import assert from 'node:assert/strict';
import {bindCampusMotion} from '../dist/js/learning-game-motion.js';

class Events{
 constructor(){this.listeners=new Map();}
 addEventListener(type,fn){if(!this.listeners.has(type))this.listeners.set(type,new Set());this.listeners.get(type).add(fn);}
 removeEventListener(type,fn){this.listeners.get(type)?.delete(fn);}
 emit(type,extra={}){for(const fn of [...(this.listeners.get(type)||[])])fn({type,...extra});}
 listenerCount(){return [...this.listeners.values()].reduce((n,set)=>n+set.size,0);}
}
function clock(){let at=0,next=0;const tasks=new Map(),history=[];return {tasks,history,now:()=>at,raf(fn){const id=++next;tasks.set(id,fn);history.push(fn);return id;},cancel(id){tasks.delete(id);},step(ms){at+=ms;const batch=[...tasks.values()];tasks.clear();batch.forEach(fn=>fn(at));}};}
class Node extends Events{
 constructor(doc,{motion,text='',tag='div',ariaHidden,from,to,format,className=''}={}){
  super();this.ownerDocument=doc;this.tagName=tag;this.dataset={};if(motion)this.dataset.motion=motion;if(from!==undefined)this.dataset.motionFrom=String(from);if(to!==undefined)this.dataset.motionTo=String(to);if(format)this.dataset.motionFormat=format;
  this.attrs={};if(ariaHidden!==undefined)this.attrs['aria-hidden']=String(ariaHidden);this.children=[];this.parentNode=null;this.isConnected=true;this.disabled=false;this._text=text;this.writes=[];this._classes=new Set(className.split(' ').filter(Boolean));
  this.classList={toggle:(key,on)=>{if(on)this._classes.add(key);else this._classes.delete(key);},contains:key=>this._classes.has(key)};this.style={setProperty(){}};
 }
 get textContent(){return this._text;}
 set textContent(value){this._text=String(value);this.writes.push(this._text);}
 set className(value){this._classes=new Set(String(value).split(' ').filter(Boolean));}
 get className(){return [...this._classes].join(' ');}
 setAttribute(key,value){this.attrs[key]=String(value);}
 getAttribute(key){return this.attrs[key]??null;}
 appendChild(node){this.children.push(node);node.parentNode=this;return node;}
 remove(){if(this.parentNode)this.parentNode.children=this.parentNode.children.filter(node=>node!==this);this.parentNode=null;this.isConnected=false;}
 querySelectorAll(selector){const found=[];const visit=node=>{for(const child of node.children){if(selector==='[data-motion]'&&child.dataset.motion)found.push(child);visit(child);}};visit(this);return found;}
 matches(selector){return selector==='[data-motion]'&&!!this.dataset.motion;}
 closest(selector){return selector==='button'?(this.tagName==='button'?this:this.parentNode?.closest(selector)):null;}
 contains(node){return node===this||this.children.some(child=>child.contains(node));}
 animate(keyframes,timing){return this.ownerDocument.animate(this,keyframes,timing);}
}
function setup(nodes=[],{reduced=false,waapi=true}={}){
 const time=clock(),media=new Events();media.matches=reduced;const doc=new Events(),win=new Events();doc.visibilityState='visible';doc.defaultView=win;
 win.performance={now:time.now};win.requestAnimationFrame=time.raf;win.cancelAnimationFrame=time.cancel;win.matchMedia=()=>media;win.getComputedStyle=()=>({transform:'none'});
 const animations=[];doc.animate=(el,keyframes,timing)=>{let resolve,reject;const finished=new Promise((yes,no)=>{resolve=yes;reject=no;});const animation={el,keyframes,timing,finished,cancelled:0,cancel(){this.cancelled++;reject(new Error('Cancelled'));},finish(){resolve();}};animations.push(animation);return animation;};
 doc.createElement=tag=>{const node=new Node(doc,{tag});if(!waapi)node.animate=undefined;return node;};
 const root=new Node(doc),children=nodes.map(value=>{const node=new Node(doc,value);if(!waapi)node.animate=undefined;root.appendChild(node);return node;});
 return {time,media,doc,win,root,children,animations,bind:options=>bindCampusMotion(root,options)};
}
const tick=async()=>{await Promise.resolve();await Promise.resolve();};

test('scene motion is finite and never installs game-action or click handlers',async()=>{
 const h=setup(['stage','hero','title','body','choice','star','unlock','path','lux'].map(motion=>({motion,className:motion==='star'?'earned':''})));
 const cleanup=h.bind({kind:'choice'});
 assert.ok(h.animations.length>=9);assert.ok(h.animations.every(a=>a.timing.duration*(a.timing.iterations||1)+(a.timing.delay||0)<=4000));
 assert.equal(h.root.listeners.has('click'),false);assert.equal(h.root.dataset.motionState,'ready');
 cleanup();assert.ok(h.animations.every(a=>a.cancelled===1));await tick();assert.equal(h.root.listenerCount(),0);assert.equal(h.doc.listenerCount(),0);
});

test('cleanup finalizes a number copy, cancels scheduled work and rejects stale callbacks',async()=>{
 const h=setup([{motion:'number',text:'GH₵95',ariaHidden:true,from:12000,to:9500},{text:'Story wallet GH₵95',tag:'strong'}]);
 const [display,authoritative]=h.children,cleanup=h.bind({kind:'consequence'});
 assert.equal(display.textContent,'GH₵120');h.time.step(200);assert.notEqual(display.textContent,'GH₵95');assert.equal(authoritative.textContent,'Story wallet GH₵95');
 const stale=[...h.time.history];cleanup();assert.equal(display.textContent,'GH₵95');assert.equal(h.time.tasks.size,0);const writes=display.writes.length;
 stale.forEach(fn=>fn(4000));h.time.step(4000);assert.equal(display.writes.length,writes);assert.equal(authoritative.writes.length,0);assert.equal(h.root.dataset.motionState,'stopped');await tick();
});

test('only explicitly hidden numeric presentation copies can count while final labels stay untouched',()=>{
 const h=setup([
  {motion:'number',text:'GH₵120',from:10000,to:12000},
  {motion:'number',text:'Invalid',ariaHidden:true,from:-1,to:12000},
  {motion:'number',text:'Missing',ariaHidden:true,to:12000},
  {motion:'number',text:'3',ariaHidden:true,from:0,to:3,format:'integer'},
 ]),cleanup=h.bind({kind:'completion'});
 assert.deepEqual(h.children.slice(0,3).map(node=>node.writes),[[],[],[]]);assert.equal(h.children[3].textContent,'0');h.time.step(1000);assert.equal(h.children[3].textContent,'3');cleanup();
});

test('OS reduced motion and explicit motion-off start with every result immediately readable',()=>{
 for(const explicit of [false,true]){
  const h=setup([{motion:'hero'},{motion:'number',text:'GH₵95',ariaHidden:true,from:12000,to:9500}],{reduced:!explicit});
  const cleanup=h.bind({kind:'completion',reduced:explicit,transition:{fresh:true},celebrate:true});
  assert.equal(h.animations.length,0);assert.equal(h.time.tasks.size,0);assert.equal(h.root.children.length,2);assert.equal(h.children[1].textContent,'GH₵95');assert.equal(h.root.dataset.motionState,'reduced');assert.equal(h.root.classList.contains('campus-motion-off'),true);cleanup();
 }
});

test('changing reduced-motion preference stops animation and never restarts a past celebration',async()=>{
 const h=setup([{motion:'hero'},{motion:'number',text:'GH₵95',ariaHidden:true,from:12000,to:9500}]),cleanup=h.bind({kind:'completion',transition:{fresh:true}});
 assert.equal(h.root.children.length,3);h.time.step(100);h.media.matches=true;h.media.emit('change',{matches:true});
 assert.equal(h.root.children.length,2);assert.equal(h.children[1].textContent,'GH₵95');assert.equal(h.time.tasks.size,0);assert.ok(h.animations.every(a=>a.cancelled===1));
 const count=h.animations.length;h.media.matches=false;h.media.emit('change',{matches:false});assert.equal(h.animations.length,count);assert.equal(h.root.classList.contains('campus-motion-off'),false);assert.equal(h.root.classList.contains('campus-motion-paused'),true);cleanup();await tick();
});

test('backgrounding a tab finalizes counters and particles without replaying on return',async()=>{
 const h=setup([{motion:'hero'},{motion:'number',text:'GH₵40',ariaHidden:true,from:0,to:4000}]),cleanup=h.bind({kind:'completion',transition:{fresh:true}});
 h.doc.visibilityState='hidden';h.doc.emit('visibilitychange');assert.equal(h.children[1].textContent,'GH₵40');assert.equal(h.root.children.length,2);assert.equal(h.root.classList.contains('campus-motion-paused'),true);assert.equal(h.time.tasks.size,0);
 const count=h.animations.length;h.doc.visibilityState='visible';h.doc.emit('visibilitychange');assert.equal(h.animations.length,count);cleanup();await tick();
});

test('fresh rewards burst once, a refreshed completion has no confetti and cleanup removes late effects',async()=>{
 const resumed=setup([{motion:'hero'}]),resumeCleanup=resumed.bind({kind:'completion',celebrate:true});assert.equal(resumed.root.children.length,1);resumeCleanup();
 const fresh=setup([{motion:'hero'}]),cleanup=fresh.bind({kind:'rewards',transition:{fresh:true}});
 assert.equal(fresh.root.children.length,2);const layer=fresh.root.children[1];assert.equal(layer.getAttribute('aria-hidden'),'true');assert.equal(layer.children.length,12);
 cleanup();assert.equal(fresh.root.children.length,1);fresh.animations.forEach(animation=>animation.finish());await tick();assert.equal(fresh.root.children.length,1);
});

test('saved stars and unlocks settle without replaying the fresh reward pop',()=>{
 const saved=setup([{motion:'star',className:'earned'},{motion:'unlock'}]),dispose=saved.bind({kind:'completion'});
 assert.ok(saved.animations.every(animation=>animation.keyframes.every(frame=>!frame.transform)));dispose();
 const fresh=setup([{motion:'star',className:'earned'},{motion:'unlock'}]),cleanup=fresh.bind({kind:'completion',transition:{fresh:true}});
 assert.ok(fresh.animations.slice(0,2).every(animation=>animation.keyframes.some(frame=>frame.transform?.includes('scale('))));cleanup();
});

test('press feedback responds to pointer and keyboard without preventing or dispatching actions',async()=>{
 const h=setup([{tag:'button',text:'Make a move'}]),cleanup=h.bind({kind:'choice',enter:false}),button=h.children[0];let prevented=0;
 h.root.emit('pointerdown',{target:button,button:0,preventDefault:()=>prevented++});assert.equal(h.animations.length,1);
 h.doc.emit('pointerup',{target:button});assert.equal(h.animations[0].cancelled,1);assert.equal(h.animations.length,2);
 h.root.emit('keydown',{target:button,key:'Enter'});h.root.emit('keyup',{target:button,key:'Enter'});assert.equal(h.animations.length,4);assert.equal(prevented,0);assert.equal(h.root.listeners.has('click'),false);
 cleanup();const count=h.animations.length;h.root.emit('pointerdown',{target:button,button:0});assert.equal(h.animations.length,count);await tick();
});

test('enter:false keeps static final results and press feedback without replaying entrances or rewards',()=>{
 const h=setup([{motion:'hero'},{motion:'number',text:'GH₵95',ariaHidden:true,from:12000,to:9500},{tag:'button'}]),cleanup=h.bind({kind:'completion',enter:false,transition:{fresh:true}});
 assert.equal(h.animations.length,0);assert.equal(h.time.tasks.size,0);assert.equal(h.root.children.length,3);assert.equal(h.children[1].textContent,'GH₵95');h.root.emit('pointerdown',{target:h.children[2],button:0});assert.equal(h.animations.length,1);cleanup();
});

test('missing browser animation APIs and minimal UI harnesses remain functional',()=>{
 assert.doesNotThrow(()=>bindCampusMotion(null)());assert.doesNotThrow(()=>bindCampusMotion({isConnected:true})());
 const h=setup([{motion:'hero'},{motion:'number',text:'GH₵95',ariaHidden:true,from:12000,to:9500}],{waapi:false});h.win.requestAnimationFrame=undefined;h.win.cancelAnimationFrame=undefined;
 const cleanup=h.bind({kind:'completion',transition:{fresh:true}});assert.equal(h.root.children.length,2);assert.equal(h.children[1].textContent,'GH₵95');cleanup();
 const short=setup([{motion:'hero'}]);let cancelled=0;short.children[0].animate=()=>({cancel(){cancelled++;}});const dispose=short.bind();dispose();assert.equal(cancelled,1);
});

test('detached screens cannot keep changing their presentation in queued animation frames',()=>{
 const h=setup([{motion:'number',text:'GH₵95',ariaHidden:true,from:12000,to:9500}]),cleanup=h.bind(),display=h.children[0];
 h.root.isConnected=false;const writes=display.writes.length;h.time.step(200);assert.equal(display.writes.length,writes);assert.equal(h.time.tasks.size,0);cleanup();assert.equal(display.textContent,'GH₵95');
});

test('returning to a visible tab or enabling motion restores press response without replaying a scene',()=>{
 const h=setup([{motion:'hero'},{tag:'button'}]),cleanup=h.bind({kind:'completion',transition:{fresh:true}}),button=h.children[1];
 h.doc.visibilityState='hidden';h.doc.emit('visibilitychange');const stopped=h.animations.length;
 h.doc.visibilityState='visible';h.doc.emit('visibilitychange');assert.equal(h.animations.length,stopped);assert.equal(h.root.classList.contains('campus-motion-paused'),true);
 h.root.emit('pointerdown',{target:button,button:0});h.root.emit('pointerup',{target:button});assert.equal(h.animations.length,stopped+2);
 h.media.matches=true;h.media.emit('change',{matches:true});const reduced=h.animations.length;
 h.media.matches=false;h.media.emit('change',{matches:false});assert.equal(h.animations.length,reduced);h.root.emit('pointerdown',{target:button,button:0});assert.equal(h.animations.length,reduced+1);assert.equal(h.root.children.length,2);cleanup();
});
