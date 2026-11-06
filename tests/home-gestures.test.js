import test from 'node:test';
import assert from 'node:assert/strict';
import {bindHomeMovesGesture} from '../dist/js/home-gestures.js';
import {bindChatGestures} from '../dist/js/chat-gestures.js';

class Element {
  constructor(tag='div',attributes={},parent=null){this.tag=tag;this.attributes={...attributes};this.parentElement=parent;this.isConnected=true;this.scrollTop=0;this.listeners=new Map();this.clientWidth=390;}
  matches(selectors){return selectors.split(',').some(selector=>{const s=selector.trim();if(s===this.tag)return true;if(s.startsWith('[contenteditable]'))return this.attributes.contenteditable!==undefined&&this.attributes.contenteditable!=='false';const match=s.match(/^\[([^=\]]+)(?:="([^"]+)")?\]$/);return !!match&&Object.hasOwn(this.attributes,match[1])&&(match[2]===undefined||this.attributes[match[1]]===match[2]);});}
  closest(selector){for(let e=this;e;e=e.parentElement)if(e.matches?.(selector))return e;return null;}
  contains(node){for(let e=node;e;e=e.parentElement)if(e===this)return true;return false;}
  getAttribute(name){return this.attributes[name]??null;}
  getBoundingClientRect(){return {left:0,top:0,width:390,height:780};}
  addEventListener(name,handler,options){assert.equal(options.passive,true);this.listeners.set(name,handler);}
  removeEventListener(name,handler){if(this.listeners.get(name)===handler)this.listeners.delete(name);}
}
const point=(x=195,y=400,identifier=1)=>({clientX:x,clientY:y,identifier});
function harness(initialOpen=false){
  const target=new Element(),surface=new Element('div',{},target),toggle=new Element('button',{'data-home-moves-toggle':''},target),content=new Element('section',{'data-home-moves':''},target),row=new Element('div',{},content),changed=[],documentListeners=new Map();
  let open=initialOpen,time=0,selected='',modal=false;
  const doc={hidden:false,querySelector:()=>modal?{}:null,getSelection:()=>({isCollapsed:!selected,toString:()=>selected}),addEventListener:(name,fn)=>documentListeners.set(name,fn),removeEventListener:(name,fn)=>{if(documentListeners.get(name)===fn)documentListeners.delete(name);}};
  const cleanup=bindHomeMovesGesture({target,isOpen:()=>open,onChange:(value,meta)=>{changed.push({value,meta});open=value;},document:doc,now:()=>time});
  const emit=(name,touches,changedTouches=[],origin=surface)=>{
    const event={target:origin,touches,changedTouches,preventDefault(){assert.fail('Passive gestures must not prevent native movement.');}};
    target.listeners.get(name)?.(event);return event;
  };
  const swipe=(from=point(195,450),to=point(195,300),origin=surface)=>{emit('touchstart',[from],[],origin);time+=150;emit('touchmove',[to],[],origin);emit('touchend',[],[to],origin);};
  return {target,surface,toggle,content,row,changed,doc,documentListeners,cleanup,emit,swipe,advance:amount=>{time+=amount;},get open(){return open;},set open(value){open=value;},set modal(value){modal=value;},set selected(value){selected=value;}};
}

test('a deliberate upward swipe reveals moves only once after release, with click-suppression metadata',()=>{
  const h=harness();h.emit('touchstart',[point(195,450)]);h.emit('touchmove',[point(195,300)]);assert.deepEqual(h.changed,[]);
  h.emit('touchend',[],[point(195,300)]);assert.deepEqual(h.changed,[{value:true,meta:{gesture:true}}]);
  h.swipe();assert.equal(h.changed.length,1,'An upward reading gesture cannot toggle an already open drawer.');h.cleanup();
});

test('the handle remains swipeable even when implemented as a button; taps are left to its click binding',()=>{
  const h=harness();h.swipe(point(195,650),point(195,640),h.toggle);assert.equal(h.changed.length,0);
  h.swipe(point(195,650),point(195,500),h.toggle);assert.equal(h.open,true);
  const icon=new Element('svg',{},h.toggle);h.swipe(point(195,400),point(195,550),icon);assert.equal(h.open,false);
  assert.deepEqual(h.changed.map(x=>x.value),[true,false]);h.cleanup();
});

test('a downward swipe closes from top-of-list content but never from a scrolled list or the main hero',()=>{
  const h=harness(true);h.swipe(point(195,350),point(195,500),h.surface);assert.equal(h.changed.length,0);
  h.content.scrollTop=120;h.swipe(point(195,350),point(195,500),h.row);assert.equal(h.changed.length,0);
  h.content.scrollTop=0;h.swipe(point(195,350),point(195,500),h.row);assert.deepEqual(h.changed,[{value:false,meta:{gesture:true}}]);h.cleanup();
});

test('nested or mid-gesture scrolling cannot close a drawer while a member reads older moves',()=>{
  const h=harness(true),inner=new Element('div',{},h.content),text=new Element('span',{},inner);
  inner.scrollTop=45;h.swipe(point(195,350),point(195,500),text);assert.equal(h.changed.length,0);
  inner.scrollTop=0;h.emit('touchstart',[point(195,350)],[],text);h.content.scrollTop=30;h.emit('touchend',[],[point(195,500)],text);assert.equal(h.changed.length,0);
  h.content.scrollTop=30;h.emit('touchstart',[point(195,350)],[],text);h.content.scrollTop=0;h.emit('touchend',[],[point(195,500)],text);assert.equal(h.changed.length,0,'A swipe begun inside older entries keeps its scrolling even when it reaches the top.');h.cleanup();
});

test('horizontal and diagonal movement, small drags and native screen edges are ignored',()=>{
  const h=harness();
  for(const [from,to] of [[point(270,400),point(100,402)],[point(100,400),point(270,398)],[point(220,450),point(125,350)],[point(195,400),point(195,355)],[point(10,450),point(10,300)],[point(380,450),point(380,300)],[point(195,3),point(195,-100)],[point(195,778),point(195,600)]])h.swipe(from,to);
  h.emit('touchstart',[point(260,400)]);h.emit('touchmove',[point(200,402)]);h.emit('touchend',[],[point(190,200)]);
  assert.equal(h.changed.length,0,'An initial horizontal gesture never becomes drawer navigation after drifting vertically.');h.cleanup();
});

test('Home drawer gestures and horizontal Ask Lumo navigation coexist',()=>{
  const h=harness(),app=new Element(),opened=[];h.target.parentElement=app;
  const cleanupChat=bindChatGestures({target:app,getRoute:()=>({section:'home',page:'home'}),onOpenChat:route=>opened.push(route),document:h.doc,now:()=>0});
  for(const [name,touches,changes] of [['touchstart',[point(270,400)],[]],['touchmove',[point(100,402)],[]],['touchend',[],[point(100,402)]]]){
    const event=h.emit(name,touches,changes);app.listeners.get(name)?.(event);
  }
  assert.equal(h.changed.length,0);assert.equal(opened.length,1);cleanupChat();h.cleanup();
});

test('inputs, links, action buttons and editable text preserve their interaction',()=>{
  const h=harness();
  for(const [tag,attributes] of [['input',{}],['textarea',{}],['select',{}],['button',{}],['a',{}],['summary',{}],['label',{}],['div',{role:'button'}],['div',{role:'slider'}],['div',{contenteditable:'true'}],['div',{'data-horizontal-scroll':''}],['div',{'data-no-home-swipe':''}]]){
    const node=new Element(tag,attributes,h.target),child=new Element('span',{},node);h.swipe(undefined,undefined,child);
  }
  const form=new Element('form',{},h.target);h.swipe(undefined,undefined,new Element('div',{},form));
  h.swipe(undefined,undefined,new Element('input',{},h.toggle));assert.equal(h.changed.length,0);h.cleanup();
});

test('text selection, overlays and inert/hidden surfaces cannot start or finish a swipe',()=>{
  const h=harness();h.selected='A transaction';h.swipe();h.selected='';h.modal=true;h.swipe();h.modal=false;
  h.target.inert=true;h.swipe();h.target.inert=false;h.target.hidden=true;h.swipe();h.target.hidden=false;
  h.target.attributes['aria-hidden']='true';h.swipe();delete h.target.attributes['aria-hidden'];
  h.emit('touchstart',[point(195,450)]);h.modal=true;h.emit('touchend',[],[point(195,300)]);h.modal=false;
  assert.equal(h.changed.length,0);h.cleanup();
});

test('multitouch, wrong identities, malformed coordinates, cancellation and long holds are ignored',()=>{
  const h=harness();
  h.emit('touchstart',[point(),point(210,400,2)]);h.emit('touchend',[],[point(195,200)]);
  h.emit('touchstart',[point()]);h.emit('touchmove',[point(195,350),point(210,400,2)]);h.emit('touchend',[],[point(195,200)]);
  h.emit('touchstart',[point()]);h.emit('touchmove',[point(195,300,2)]);h.emit('touchend',[],[point(195,200)]);
  h.emit('touchstart',[point()]);h.emit('touchend',[],[point(195,200,2)]);
  h.emit('touchstart',[point()]);h.emit('touchend',[point(210,400,2)],[point(195,200)]);
  h.emit('touchstart',[point()]);h.emit('touchend',[],[point(195,200),point(210,200,2)]);
  h.emit('touchstart',[point()]);h.emit('touchcancel',[]);h.emit('touchend',[],[point(195,200)]);
  h.emit('touchstart',[point()]);h.advance(901);h.emit('touchend',[],[point(195,200)]);
  h.emit('touchstart',[point()]);h.advance(-100);h.emit('touchend',[],[point(195,200)]);
  h.swipe(point(NaN,400),point(195,200));h.swipe(point(),point(195,NaN));
  assert.equal(h.changed.length,0);h.cleanup();
});

test('route replacement, external state changes, hidden documents and disposed callbacks cannot change the drawer later',()=>{
  const h=harness();
  h.emit('touchstart',[point()]);h.target.isConnected=false;h.emit('touchend',[],[point(195,200)]);h.target.isConnected=true;
  h.emit('touchstart',[point()]);h.surface.isConnected=false;h.emit('touchend',[],[point(195,200)]);h.surface.isConnected=true;
  h.emit('touchstart',[point()]);h.open=true;h.emit('touchend',[],[point(195,200)]);h.open=false;
  h.emit('touchstart',[point()]);h.doc.hidden=true;h.documentListeners.get('visibilitychange')();h.doc.hidden=false;h.emit('touchend',[],[point(195,200)]);
  h.emit('touchstart',[point()]);const staleEnd=h.target.listeners.get('touchend');h.cleanup();staleEnd({target:h.surface,touches:[],changedTouches:[point(195,200)]});
  assert.equal(h.changed.length,0);assert.equal(h.target.listeners.size,0);assert.equal(h.documentListeners.size,0);h.cleanup();
});

test('binding is scoped to touch and gracefully tolerates an absent Home target',()=>{
  const h=harness();assert.deepEqual([...h.target.listeners.keys()].sort(),['touchcancel','touchend','touchmove','touchstart']);h.cleanup();
  assert.doesNotThrow(()=>bindHomeMovesGesture()());assert.doesNotThrow(()=>bindHomeMovesGesture({target:{}})());
});
