import test from 'node:test';
import assert from 'node:assert/strict';
import {bindLuxWorld} from '../dist/js/learning-game-world-motion.js';

class Events{
 constructor(){this.listeners=new Map();}
 addEventListener(type,fn){if(!this.listeners.has(type))this.listeners.set(type,new Set());this.listeners.get(type).add(fn);}
 removeEventListener(type,fn){this.listeners.get(type)?.delete(fn);}
 emit(type,extra={}){const event={type,defaultPrevented:false,preventDefault(){this.defaultPrevented=true;},stopImmediatePropagation(){this.stopped=true;},...extra};for(const fn of [...(this.listeners.get(type)||[])]){fn(event);if(event.stopped)break;}return event;}
 count(){return [...this.listeners.values()].reduce((sum,set)=>sum+set.size,0);}
}
function clock(){let at=0,next=0;const tasks=new Map(),history=[];return {now:()=>at,tasks,history,raf(fn){const id=++next;tasks.set(id,fn);history.push(fn);return id;},cancel(id){tasks.delete(id);},step(ms=40){at+=ms;const work=[...tasks.values()];tasks.clear();work.forEach(fn=>fn(at));},advance(ms,step=40){for(let n=0;n<ms;n+=step)this.step(Math.min(step,ms-n));}};}
class Node extends Events{
 constructor(doc,{dataset={},tag='div',rect}={}){super();this.ownerDocument=doc;this.dataset={...dataset};this.tagName=tag;this.children=[];this.parentNode=null;this.isConnected=true;this.disabled=false;this.attrs={};this.values=new Map();this.style={setProperty:(key,value)=>this.values.set(key,value)};this.rectangle=rect;this.capture=new Set();}
 appendChild(node){node.parentNode=this;this.children.push(node);return node;}
 getBoundingClientRect(){const r=typeof this.rectangle==='function'?this.rectangle():this.rectangle;return r?{...r,right:r.right??r.left+r.width,bottom:r.bottom??r.top+r.height}:null;}
 setAttribute(key,value){this.attrs[key]=String(value);if(key.startsWith('data-'))this.dataset[key.slice(5).replace(/-([a-z])/g,(_,c)=>c.toUpperCase())]=String(value);}
 getAttribute(key){return this.attrs[key]??null;}
 hasAttribute(key){return key in this.attrs||key==='data-world-gate'&&this.dataset.worldGate!==undefined;}
 contains(node){return node===this||this.children.some(child=>child.contains(node));}
 matches(selector){return selector==='[data-world-stage]'&&this.dataset.worldStage!==undefined;}
 querySelector(selector){return this.querySelectorAll(selector)[0]||null;}
 querySelectorAll(selector){const found=[];const property={'[data-world-stage]':'worldStage','[data-world-player]':'worldPlayer','[data-world-choice]':'worldChoice','[data-world-effect]':'worldEffect'}[selector];const visit=node=>{for(const child of node.children){if(property&&child.dataset[property]!==undefined)found.push(child);visit(child);}};visit(this);return found;}
 closest(selector){if(selector==='button')return this.tagName==='button'?this:this.parentNode?.closest(selector);return null;}
 setPointerCapture(id){this.capture.add(id);}
 releasePointerCapture(id){this.capture.delete(id);}
}
function setup({reduced=false,width=400,height=500,scale=1,feedback=0}={}){
 const time=clock(),doc=new Events(),win=new Events(),media=new Events();doc.visibilityState='visible';media.matches=reduced;doc.defaultView=win;
 win.performance={now:time.now};win.requestAnimationFrame=time.raf;win.cancelAnimationFrame=time.cancel;win.matchMedia=()=>media;
 const root=new Node(doc),stage=root.appendChild(new Node(doc,{dataset:{worldStage:'',worldStartX:'12',worldStartY:'84'},rect:()=>({left:100,top:50,width:width*scale,height:height*scale})}));stage.clientWidth=width;stage.clientHeight=height;
 const player=stage.appendChild(new Node(doc,{dataset:{worldPlayer:''}}));player.offsetWidth=80;player.offsetHeight=90;
 player.rectangle=()=>{const x=parseFloat(player.values.get('--lux-x')||String(width*.12)),y=parseFloat(player.values.get('--lux-y')||String(height*.84));return {left:100+(x-40)*scale,top:50+(y-90)*scale,width:80*scale,height:90*scale};};
 const sprite=player.appendChild(new Node(doc,{tag:'img'}));
 const targets=[['cafe',25,58],['friends',50,75],['party',78,58]].map(([id,x,y])=>stage.appendChild(new Node(doc,{tag:'button',dataset:{worldChoice:id,worldX:String(x),worldY:String(y)},rect:()=>({left:100+(width*x/100-38)*scale,top:50+(height*y/100-70)*scale,width:76*scale,height:70*scale})})));
 const gate=stage.appendChild(new Node(doc,{tag:'button',dataset:{worldGate:'',worldX:'84',worldY:'84'},rect:()=>({left:100+width*.84*scale-30,top:50+height*.84*scale-50,width:60,height:50})}));
 const feedbackCards=[],feedbackAnimations=[];
 for(let i=0;i<feedback;i++){
  const card=root.appendChild(new Node(doc,{dataset:{worldEffect:''}}));card.textContent=i?'Plan released GH₵65':'Wallet −GH₵65';
  card.animate=(frames,timing)=>{const animation={frames,timing,cancelled:false,finished:new Promise(()=>{}),cancel(){this.cancelled=true;}};feedbackAnimations.push(animation);return animation;};
  feedbackCards.push(card);
 }
 const choices=[],controller=bindLuxWorld(root,{onChoose:(id,target)=>choices.push({id,target}),...arguments[0]?.options});
 const point=(x,y)=>({clientX:100+x*width/100*scale,clientY:50+y*height/100*scale});
 const drag=(x,y)=>{stage.emit('pointerdown',{target:sprite,pointerId:1,button:0,...point(12,75)});stage.emit('pointermove',{target:sprite,pointerId:1,...point(x,y-9)});return stage.emit('pointerup',{target:sprite,pointerId:1,...point(x,y-9)});};
 const resize=(nextWidth,nextHeight)=>{width=nextWidth;height=nextHeight;stage.clientWidth=width;stage.clientHeight=height;win.emit('resize');};
 return {root,stage,player,sprite,targets,gate,time,doc,win,media,choices,controller,point,drag,resize,feedbackCards,feedbackAnimations};
}
const px=(node,key)=>parseFloat(node.values.get(key));

test('Lux actually crosses and jumps through the world before settling, with a finite presentation callback',()=>{
 const h=setup(),done=[];h.controller.setPosition({x:12,y:84});
 assert.equal(h.controller.travelTo(h.targets[2],{onFinish:()=>done.push('landed')}),true);assert.equal(h.controller.isMoving(),true);
 h.time.step(200);const mid=h.controller.getPosition();assert.ok(mid.x>12&&mid.x<78);assert.ok(mid.y<84);assert.equal(h.player.dataset.worldState,'jumping');assert.equal(done.length,0);
 h.time.advance(500);assert.deepEqual(h.controller.getPosition(),{x:78,y:58});assert.equal(h.controller.isMoving(),false);assert.deepEqual(done,['landed']);assert.equal(h.time.tasks.size,0);assert.equal(h.choices.length,0);h.controller.dispose();
});

test('setPosition/getPosition use normalized coordinates and visual travel can reach a disabled destination',()=>{
 const h=setup({scale:.5});h.controller.setPosition({x:50,y:70});assert.deepEqual(h.controller.getPosition(),{x:50,y:70});
 h.targets[0].disabled=true;assert.equal(h.controller.travelTo(h.targets[0]),true);h.time.advance(700);assert.deepEqual(h.controller.getPosition(),{x:25,y:58});assert.equal(h.choices.length,0);
 h.controller.setPosition({x:-100,y:200});assert.ok(px(h.player,'--lux-x')>=43);assert.ok(px(h.player,'--lux-y')<=496);h.controller.dispose();
});

test('dragging to a destination chooses only on release and synthetic click cannot choose again',()=>{
 const h=setup({scale:.5});h.controller.setPosition({x:12,y:84});
 h.stage.emit('pointerdown',{target:h.sprite,pointerId:1,button:0,...h.point(12,75)});h.stage.emit('pointermove',{target:h.sprite,pointerId:1,...h.point(50,66)});
 assert.equal(h.choices.length,0);assert.equal(h.targets[1].dataset.worldHover,'true');
 h.stage.emit('pointerup',{target:h.sprite,pointerId:1,...h.point(50,66)});h.doc.emit('pointerup',{pointerId:1,...h.point(50,66)});assert.deepEqual(h.choices.map(x=>x.id),['friends']);
 const click=h.stage.emit('click',{target:h.targets[1],detail:1});assert.equal(click.defaultPrevented,true);assert.equal(click.stopped,true);assert.equal(h.choices.length,1);h.controller.dispose();
});

test('control discovery follows an intentional drag or keyboard move without submitting a choice',()=>{
 const interactions=[],h=setup({options:{onInteract:kind=>interactions.push(kind)}});
 h.controller.setPosition({x:12,y:84});
 h.stage.emit('pointerdown',{target:h.sprite,pointerId:1,button:0,...h.point(12,75)});
 h.stage.emit('pointermove',{target:h.sprite,pointerId:1,...h.point(12.5,75)});
 assert.deepEqual(interactions,[],'a touch or tiny movement is not a learned drag');
 h.stage.emit('pointermove',{target:h.sprite,pointerId:1,...h.point(40,82)});
 h.stage.emit('pointermove',{target:h.sprite,pointerId:1,...h.point(45,82)});
 assert.deepEqual(interactions,['drag'],'one drag emits one discovery cue');
 assert.equal(h.choices.length,0,'discovering the controls does not choose a financial story action');
 h.stage.emit('pointercancel',{pointerId:1});
 h.stage.emit('keydown',{target:h.player,key:'ArrowRight'});h.time.advance(700);
 assert.deepEqual(interactions,['drag','keyboard']);assert.equal(h.choices.length,0);
 h.controller.dispose();
});

test('cancelled, foreign-pointer and disabled-target drags cannot make a game choice',()=>{
 const h=setup();h.controller.setPosition({x:12,y:84});
 h.stage.emit('pointerdown',{target:h.sprite,pointerId:1,button:0,...h.point(12,75)});h.stage.emit('pointermove',{target:h.sprite,pointerId:2,...h.point(78,49)});assert.deepEqual(h.controller.getPosition(),{x:12,y:84});
 h.stage.emit('pointermove',{target:h.sprite,pointerId:1,...h.point(78,49)});h.stage.emit('pointercancel',{pointerId:1});assert.deepEqual(h.controller.getPosition(),{x:12,y:84});h.doc.emit('pointerup',{pointerId:1,...h.point(78,49)});assert.equal(h.choices.length,0);
 h.stage.emit('pointerdown',{target:h.sprite,pointerId:1,button:0,...h.point(12,75)});h.stage.emit('pointermove',{target:h.sprite,pointerId:1,...h.point(50,66)});h.stage.emit('pointerleave',{pointerId:1});h.doc.emit('pointerup',{pointerId:1});assert.equal(h.choices.length,0);assert.deepEqual(h.controller.getPosition(),{x:12,y:84});
 h.targets[0].disabled=true;h.drag(25,58);assert.equal(h.choices.length,0);h.controller.dispose();
});

test('dragging Lux onto a visible elevated prop works even when its landing point is below that prop',()=>{
 const h=setup({scale:.5});h.controller.setPosition({x:12,y:84});
 // Prop bottom is at 38% while the landing feet are at 58%; the actor body must hit the prop.
 h.targets[0].rectangle=()=>({left:100+(400*.25-38)*.5,top:50+(500*.38-70)*.5,width:38,height:35});
 h.drag(25,40);assert.deepEqual(h.choices.map(choice=>choice.id),['cafe']);assert.equal(h.controller.isMoving(),false);h.controller.dispose();
});

test('resizing during travel preserves its normalized destination, clamps the actor and settles once',()=>{
 const h=setup(),done=[];h.controller.travelTo(h.targets[2],{onFinish:()=>done.push(h.controller.getPosition())});h.time.step(140);
 h.resize(300,430);assert.deepEqual(h.controller.getPosition(),{x:78,y:58});assert.equal(h.controller.isMoving(),false);assert.equal(h.time.tasks.size,0);assert.deepEqual(done,[{x:78,y:58}]);
 h.time.advance(1000);assert.equal(done.length,1);h.resize(240,380);assert.deepEqual(h.controller.getPosition(),{x:78,y:58});assert.ok(px(h.player,'--lux-x')<=197);h.controller.dispose();
 const narrow=setup({width:220,height:360});assert.ok(px(narrow.player,'--lux-x')>=43);narrow.controller.dispose();
});

test('empty ground taps and actor keyboard controls move Lux without financial or choice actions',()=>{
 const h=setup();h.controller.setPosition({x:12,y:84});
 h.stage.emit('click',{target:h.stage,detail:1,...h.point(65,91)});h.time.advance(700);assert.deepEqual(h.controller.getPosition(),{x:65,y:94});
 h.stage.emit('keydown',{target:h.player,key:'ArrowRight'});h.time.advance(700);assert.deepEqual(h.controller.getPosition(),{x:79,y:94});
 h.stage.emit('keydown',{target:h.player,key:' '});h.time.step(100);assert.ok(h.controller.getPosition().y<94);h.time.advance(700);assert.deepEqual(h.controller.getPosition(),{x:79,y:94});
 h.stage.emit('keydown',{target:h.targets[0],key:'ArrowLeft'});assert.equal(h.controller.isMoving(),false);assert.equal(h.choices.length,0);h.controller.dispose();
});

test('ordinary target button clicks are left to UI and movement is locked against repeated travel',()=>{
 const h=setup();h.controller.setPosition({x:12,y:84});const event=h.stage.emit('click',{target:h.targets[0],detail:1,...h.point(25,58)});assert.equal(event.defaultPrevented,false);assert.equal(h.controller.isMoving(),false);assert.equal(h.choices.length,0);
 assert.equal(h.controller.travelTo(h.targets[0]),true);assert.equal(h.controller.travelTo(h.targets[1]),false);h.drag(78,58);assert.equal(h.choices.length,0);h.time.advance(700);h.controller.dispose();
});

test('manual or device reduced motion remains fully interactive with immediate settled results',()=>{
 for(const manual of [true,false]){const h=setup({reduced:!manual,options:{reduced:manual}}),done=[];assert.equal(h.time.tasks.size,0);h.controller.setPosition({x:12,y:84});
  assert.equal(h.controller.travelTo(h.targets[0],{onFinish:()=>done.push(true)}),true);assert.deepEqual(h.controller.getPosition(),{x:25,y:58});assert.deepEqual(done,[true]);assert.equal(h.time.tasks.size,0);
  h.controller.setPosition({x:12,y:84});h.drag(50,75);assert.equal(h.choices.length,1);h.controller.dispose();}
});

test('semantic money cards outside the world enter in place and retain their final meaning',()=>{
 const h=setup({feedback:2}),copy=h.feedbackCards.map(card=>card.textContent);
 assert.equal(h.feedbackAnimations.length,2,'Feedback belongs to the root, outside the moving playfield.');
 for(const card of h.feedbackCards){assert.equal(h.stage.contains(card),false);assert.equal(card.getAttribute('aria-hidden'),null);}
 for(const animation of h.feedbackAnimations){
  assert.equal(animation.timing.fill,'none');
  assert.equal(animation.frames.at(-1).opacity,1);
  for(const frame of animation.frames){
   assert.ok(frame.opacity>=.65,'Money stays readable during its short entrance.');
   assert.match(frame.transform,/^translateY\((?:[0-4]px|0)\)$/,'No horizontal flight, scale or rotation can cross another card.');
  }
 }
 h.time.advance(1000);assert.deepEqual(h.feedbackCards.map(card=>card.textContent),copy);assert.equal(h.choices.length,0);
 h.controller.dispose();assert.ok(h.feedbackAnimations.every(animation=>animation.cancelled));assert.deepEqual(h.feedbackCards.map(card=>card.textContent),copy);
});

test('money-card motion can be skipped or cancelled without hiding the financial feedback',()=>{
 for(const options of [{reduced:true},{options:{reduced:true}}]){
  const h=setup({...options,feedback:2});assert.equal(h.feedbackAnimations.length,0);assert.deepEqual(h.feedbackCards.map(card=>card.textContent),['Wallet −GH₵65','Plan released GH₵65']);h.controller.dispose();
 }
 const h=setup({feedback:2});h.doc.visibilityState='hidden';h.doc.emit('visibilitychange');
 assert.ok(h.feedbackAnimations.every(animation=>animation.cancelled));assert.deepEqual(h.feedbackCards.map(card=>card.textContent),['Wallet −GH₵65','Plan released GH₵65']);
 h.doc.visibilityState='visible';h.doc.emit('visibilitychange');assert.equal(h.feedbackAnimations.length,2,'Returning does not replay old money changes.');assert.equal(h.choices.length,0);h.controller.dispose();
});

test('ordinary cold-resume cards have no entrance hook and cannot replay a change',()=>{
 const h=setup(),card=h.root.appendChild(new Node(h.doc));card.textContent='Wallet −GH₵65';let animations=0;card.animate=()=>{animations++;return {finished:Promise.resolve(),cancel(){}};};
 h.controller.dispose();const controller=bindLuxWorld(h.root);assert.equal(animations,0);assert.equal(card.textContent,'Wallet −GH₵65');controller.dispose();
});

test('backgrounding settles visual travel with no callback until visible and disposal discards that callback',()=>{
 const h=setup(),done=[];h.controller.travelTo(h.targets[1],{onFinish:()=>done.push('visible')});h.time.step(100);h.doc.visibilityState='hidden';h.doc.emit('visibilitychange');
 assert.equal(h.controller.isMoving(),false);assert.equal(h.time.tasks.size,0);assert.equal(done.length,0);assert.deepEqual(h.controller.getPosition(),{x:50,y:75});
 h.doc.visibilityState='visible';h.doc.emit('visibilitychange');assert.deepEqual(done,['visible']);h.doc.emit('visibilitychange');assert.equal(done.length,1);h.controller.dispose();
 const gone=setup(),late=[];gone.controller.travelTo(gone.gate,{onFinish:()=>late.push(true)});gone.doc.visibilityState='hidden';gone.doc.emit('visibilitychange');gone.controller.dispose();gone.doc.visibilityState='visible';gone.doc.emit('visibilitychange');assert.equal(late.length,0);
});

test('reduced motion while moving settles immediately without replaying old work',()=>{
 const h=setup(),done=[];h.controller.travelTo(h.targets[2],{onFinish:()=>done.push(true)});h.time.step(140);h.media.matches=true;h.media.emit('change');assert.deepEqual(h.controller.getPosition(),{x:78,y:58});assert.equal(h.time.tasks.size,0);assert.deepEqual(done,[true]);
 h.media.matches=false;h.media.emit('change');h.time.advance(2000);assert.equal(done.length,1);assert.equal(h.time.tasks.size,0);h.controller.dispose();
});

test('dispose cancels queued frames, restores pose and removes every listener without late callbacks',()=>{
 const h=setup(),done=[];h.controller.travelTo(h.targets[0],{onFinish:()=>done.push(true)});h.time.step(100);const stale=[...h.time.history];h.controller.dispose();const value=px(h.player,'--lux-x');
 stale.forEach(fn=>fn(2000));h.time.advance(2000);assert.equal(px(h.player,'--lux-x'),value);assert.equal(done.length,0);assert.equal(h.choices.length,0);assert.equal(h.time.tasks.size,0);
 assert.equal(h.stage.count(),0);assert.equal(h.doc.count(),0);assert.equal(h.win.count(),0);assert.equal(h.media.count(),0);h.controller.dispose();
});

test('idle is finite and missing scene/animation APIs leave immediate play functional',()=>{
 const idle=setup();assert.ok(idle.time.tasks.size>0);idle.time.advance(3200);assert.equal(idle.time.tasks.size,0);assert.equal(idle.player.dataset.worldState,'idle');idle.controller.dispose();
 const minimal=bindLuxWorld({isConnected:true}),done=[];assert.doesNotThrow(()=>minimal.travelTo(null,{onFinish:()=>done.push(true)}));assert.equal(done.length,1);minimal.dispose();assert.equal(minimal.travelTo(null),false);
 const plain=setup({options:{raf:undefined}});plain.win.requestAnimationFrame=undefined;plain.win.cancelAnimationFrame=undefined;plain.controller.dispose();const control=bindLuxWorld(plain.root);let complete=false;control.travelTo(plain.targets[1],{onFinish:()=>complete=true});assert.equal(complete,true);control.dispose();
});
