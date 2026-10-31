/* Deliberately small, tree-based DOM for behavior tests. It preserves node identity,
   propagation, focus, inert, history and input values. It is not a layout engine. */
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const decode = value => String(value ?? '').replace(/&quot;/g,'"').replace(/&#39;/g,"'").replace(/&amp;/g,'&').replace(/&lt;/g,'<').replace(/&gt;/g,'>');
const voids = new Set(['area','base','br','col','embed','hr','img','input','link','meta','param','source','track','wbr']);
function attributes(source) { return Object.fromEntries([...source.matchAll(/([^\s=/>]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+)))?/g)].map(m=>[m[1],decode(m[2]??m[3]??m[4]??'')])); }
const splitSelectors = selector => selector.split(/,(?![^\[]*\])/).map(s=>s.trim()).filter(Boolean);
function simpleMatches(element, selector) {
  if (!element || element.nodeType !== 1) return false;
  let rejected = false;
  selector=selector.replace(/:not\(([^()]*)\)/g,(_,exclude)=>{if(simpleMatches(element,exclude))rejected=true;return '';});
  if(rejected)return false;
  selector=selector.replace(/:scope/g,'');
  const tag=selector.match(/^[a-z][\w-]*/i)?.[0];
  if(tag&&element.localName!==tag.toLowerCase())return false;
  for(const id of selector.matchAll(/#([\w-]+)/g))if(element.id!==id[1])return false;
  for(const cls of selector.matchAll(/\.([\w-]+)/g))if(!element.classList.contains(cls[1]))return false;
  for(const attr of selector.matchAll(/\[([^\]\s=~^$*|]+)(?:\s*([~^$*|]?=)\s*["']?([^\]"']*)["']?)?\]/g)) {
    const actual=element.getAttribute(attr[1]);if(actual===null)return false;
    if(attr[2]){const expected=attr[3].trim();if(attr[2]==='='&&actual!==expected)return false;if(attr[2]==='^='&&!actual.startsWith(expected))return false;if(attr[2]==='$='&&!actual.endsWith(expected))return false;if(attr[2]==='*='&&!actual.includes(expected))return false;}
  }
  if(selector.includes(':disabled')&&!element.disabled)return false;
  if(selector.includes(':enabled')&&element.disabled)return false;
  if(selector.includes(':focus')&&element.ownerDocument.activeElement!==element)return false;
  return true;
}
function matches(element, selector) {
  return splitSelectors(selector).some(part=>{
    const pieces=part.replace(/\s*>\s*/g,' > ').trim().split(/\s+(?![^\[]*\])/);
    let candidate=element,index=pieces.length-1;
    if(!simpleMatches(candidate,pieces[index--]))return false;
    while(index>=0){if(pieces[index]==='>'){index--;candidate=candidate.parentElement;if(!simpleMatches(candidate,pieces[index--]))return false;}else{candidate=candidate.parentElement;while(candidate&&!simpleMatches(candidate,pieces[index]))candidate=candidate.parentElement;if(!candidate)return false;index--;}}
    return true;
  });
}
class MiniEvent {
  constructor(type,init={}){this.type=type;this.bubbles=init.bubbles!==false;this.cancelable=init.cancelable!==false;Object.assign(this,init);this.defaultPrevented=false;this._stopped=false;this._immediate=false;}
  preventDefault(){if(this.cancelable)this.defaultPrevented=true;}
  stopPropagation(){this._stopped=true;}
  stopImmediatePropagation(){this._stopped=this._immediate=true;}
}
class EventTarget {
  constructor(){this.listeners=new Map();}
  addEventListener(type,fn,options={}){const capture=options===true||!!options.capture;this.listeners.set(type,[...this.listeners.get(type)||[],{fn,capture}]);}
  removeEventListener(type,fn){this.listeners.set(type,(this.listeners.get(type)||[]).filter(item=>item.fn!==fn));}
  _fire(event,capture){for(const item of this.listeners.get(event.type)||[]){if(item.capture!==capture)continue;event.currentTarget=this;item.fn.call(this,event);if(event._immediate)break;}}
  dispatchEvent(event){if(!event.target)event.target=this;this._fire(event,true);if(!event._immediate)this._fire(event,false);return !event.defaultPrevented;}
}
function createHarness({testing=false,reducedMotion=false,deferHistory=false,resizeObserver=false,viewportWidth=390,viewportHeight=844,modules,clock=false}={}) {
  let context;const errors=[],animations=[],scrolls=[],activations=[],observers=[],store=new Map(),timers=new Map();let timerID=0,clockTick=0;
  const clockStart=Date.now();
  class ClockDate extends Date{constructor(...args){super(...(args.length?args:[clockStart+clockTick]));}static now(){return clockStart+clockTick;}}
  const schedule=(fn,delay=0)=>{const id=++timerID,wait=Math.max(0,Number(delay)||0);timers.set(id,{fn,delay,due:clockTick+wait});return id;};
  class Element extends EventTarget {
    constructor(tag='div',attrs={}){super();this.nodeType=1;this.localName=tag.toLowerCase();this.tagName=tag.toUpperCase();this.attributes={...attrs};this.childNodes=[];this.parentNode=null;this.ownerDocument=document;this.style={setProperty(n,v){this[n]=String(v);},removeProperty(n){delete this[n];}};this.scrollTop=0;this.scrollLeft=0;this.clientHeight=700;this.scrollHeight=700;this.clientWidth=390;this.offsetHeight=700;this.offsetWidth=390;this._value=attrs.value??'';this.checked='checked'in attrs;this.disabled='disabled'in attrs;this.hidden='hidden'in attrs;this.inert='inert'in attrs;this.tabIndex=attrs.tabindex!==undefined?Number(attrs.tabindex):(['button','input','select','textarea'].includes(this.localName)||this.localName==='a'&&'href'in attrs?0:-1);this.dataset=new Proxy({}, {get:(_,key)=>this.getAttribute('data-'+String(key).replace(/[A-Z]/g,c=>'-'+c.toLowerCase()))??undefined,set:(_,key,value)=>{this.setAttribute('data-'+String(key).replace(/[A-Z]/g,c=>'-'+c.toLowerCase()),value);return true;}});this.classList={add:(...names)=>{this.className=[...new Set([...this.className.split(/\s+/),...names])].filter(Boolean).join(' ');},remove:(...names)=>{this.className=this.className.split(/\s+/).filter(name=>!names.includes(name)).join(' ');},contains:name=>this.className.split(/\s+/).includes(name),toggle:(name,force)=>{const on=force??!this.classList.contains(name);this.classList[on?'add':'remove'](name);return on;}};}
    get id(){return this.attributes.id||'';}set id(value){this.attributes.id=String(value);}
    get className(){return this.attributes.class||'';}set className(value){this.attributes.class=String(value);}
    get type(){return this.attributes.type||(this.localName==='button'?'submit':this.localName==='input'?'text':'');}set type(v){this.attributes.type=v;}
    get name(){return this.attributes.name||'';}
    get value(){if(this.localName==='select'&&!this._value){const options=this.querySelectorAll('option');return options.find(el=>el.hasAttribute('selected'))?.value??options[0]?.value??'';}if(this.localName==='option')return this.attributes.value??this.textContent;return this._value;}set value(value){this._value=String(value);if(this.localName==='select'){for(const option of this.querySelectorAll('option')){if(option.value===this._value)option.setAttribute('selected','');else option.removeAttribute('selected');}}}
    get parentElement(){return this.parentNode?.nodeType===1?this.parentNode:null;}
    get children(){return this.childNodes.filter(node=>node.nodeType===1);}
    get firstChild(){return this.childNodes[0]||null;}
    get firstElementChild(){return this.children[0]||null;}
    get nextSibling(){return this.parentNode?.childNodes[this.parentNode.childNodes.indexOf(this)+1]||null;}
    get isConnected(){return document.documentElement===this||document.documentElement?.contains(this);}
    get innerHTML(){return this.childNodes.map(node=>node.nodeType===3?node.text:node.outerHTML).join('');}
    set innerHTML(value){this.replaceChildren();parse(String(value),this);}
    get outerHTML(){return '<'+this.localName+Object.entries(this.attributes).map(([k,v])=>' '+k+'="'+String(v).replace(/"/g,'&quot;')+'"').join('')+'>'+this.innerHTML+(voids.has(this.localName)?'':'</'+this.localName+'>');}
    get textContent(){return this.childNodes.map(node=>node.nodeType===3?decode(node.text):node.textContent).join('');}
    set textContent(value){this.replaceChildren();this.childNodes.push({nodeType:3,text:String(value),parentNode:this});}
    setAttribute(name,value){this.attributes[name]=String(value);if(name==='tabindex')this.tabIndex=Number(value);if(name==='inert')this.inert=true;if(name==='hidden')this.hidden=true;}
    getAttribute(name){return this.attributes[name]??null;}
    removeAttribute(name){delete this.attributes[name];if(name==='inert')this.inert=false;if(name==='hidden')this.hidden=false;}
    hasAttribute(name){return name in this.attributes;}
    appendChild(node){node.remove?.();node.parentNode=this;this.childNodes.push(node);return node;}
    append(...nodes){nodes.forEach(node=>typeof node==='string'?this.childNodes.push({nodeType:3,text:node,parentNode:this}):this.appendChild(node));}
    prepend(node){node.remove?.();node.parentNode=this;this.childNodes.unshift(node);}
    removeChild(node){const index=this.childNodes.indexOf(node);if(index>=0){this.childNodes.splice(index,1);node.parentNode=null;}return node;}
    replaceChildren(...nodes){for(const node of this.childNodes)node.parentNode=null;this.childNodes=[];this.append(...nodes);}
    insertBefore(node,reference){node.remove?.();node.parentNode=this;const index=this.childNodes.indexOf(reference);if(index<0)this.childNodes.push(node);else this.childNodes.splice(index,0,node);return node;}
    replaceWith(node){const parent=this.parentNode;if(!parent)return;parent.insertBefore(node,this);this.remove();}
    remove(){this.parentNode?.removeChild(this);}
    contains(other){return other===this||this.children.some(child=>child.contains(other));}
    matches(selector){return matches(this,selector);}
    closest(selector){let element=this;while(element){if(element.matches(selector))return element;element=element.parentElement;}return null;}
    querySelectorAll(selector){const found=[];const walk=root=>{for(const child of root.children){if(child.matches(selector))found.push(child);walk(child);}};walk(this);return found;}
    querySelector(selector){return this.querySelectorAll(selector)[0]||null;}
    focus(){for(let ancestor=this;ancestor;ancestor=ancestor.parentElement)if(ancestor.inert||ancestor.hidden)return;document.activeElement=this;this.dispatchEvent(new MiniEvent('focusin'));}
    blur(){if(document.activeElement===this)document.activeElement=document.body;}
    getClientRects(){return this.hidden?[]:[this.getBoundingClientRect()];}
    getBoundingClientRect(){return {x:0,y:0,top:0,left:0,width:this.clientWidth,height:this.clientHeight,right:this.clientWidth,bottom:this.clientHeight};}
    scrollTo(first,second){if(typeof first==='object'){this.scrollTop=first.top??this.scrollTop;this.scrollLeft=first.left??this.scrollLeft;}else{this.scrollLeft=first;this.scrollTop=second;}}
    scrollIntoView(options){scrolls.push({id:this.id,options});}
    animate(frames,options){animations.push({element:this,frames,options});return {cancel(){},finished:Promise.resolve()};}
    select(){}
    dispatchEvent(event){if(!event.target)event.target=this;const chain=[];let node=this;while(node){chain.push(node);node=node.parentNode;}if(!chain.includes(document))chain.push(document);chain.push(windowTarget);for(const target of [...chain].reverse()){target._fire(event,true);if(event._stopped)return !event.defaultPrevented;}for(const target of chain){target._fire(event,false);if(event._stopped||!event.bubbles)break;}return !event.defaultPrevented;}
    click(){if(['button','summary'].includes(this.localName))activations.push({tag:this.localName,id:this.id,label:this.textContent.trim(),action:this.getAttribute('onclick'),route:context?.L?.route});const event=new MiniEvent('click');this.dispatchEvent(event);if(!event.defaultPrevented&&this.getAttribute('onclick'))vm.runInContext(this.getAttribute('onclick'),context);if(!event.defaultPrevented&&this.localName==='summary'&&this.parentElement?.localName==='details'){const details=this.parentElement;details.hasAttribute('open')?details.removeAttribute('open'):details.setAttribute('open','');details.dispatchEvent(new MiniEvent('toggle',{bubbles:false}));}if(!event.defaultPrevented&&this.localName==='button'&&this.type==='submit'){const form=this.closest('form');if(form)submit(form);}}
  }
  const document=new EventTarget();document.nodeType=9;document.hidden=false;document.activeElement=null;document.createElement=tag=>new Element(tag);document.documentElement=new Element('html');document.body=new Element('body');document.documentElement.appendChild(document.body);document.body.innerHTML='<div class="demo-strip"></div><div id="app"><main id="view"></main><nav id="nav"></nav></div><div id="toast"></div>';document.activeElement=document.body;document.getElementById=id=>document.documentElement.id===id?document.documentElement:document.documentElement.querySelector('#'+id);document.querySelector=selector=>document.documentElement.matches(selector)?document.documentElement:document.documentElement.querySelector(selector);document.querySelectorAll=selector=>document.documentElement.querySelectorAll(selector);document.contains=node=>document.documentElement.contains(node);
  function parse(html,parent){const tokens=html.match(/<!--[\s\S]*?-->|<(?:(?:"[^"]*"|'[^']*'|[^'">])*)>|[^<]+/g)||[];const stack=[parent];for(const token of tokens){if(token.startsWith('<!--'))continue;if(token.startsWith('</')){const name=token.slice(2).trim().replace(/>$/,'').toLowerCase();for(let i=stack.length-1;i>0;i--)if(stack[i].localName===name){stack.length=i;break;}continue;}if(token.startsWith('<')){const name=token.match(/^<([\w:-]+)/)?.[1];if(!name)continue;const el=new Element(name,attributes(token.slice(name.length+1,-1)));stack[stack.length-1].appendChild(el);if(!voids.has(name.toLowerCase())&&!token.endsWith('/>'))stack.push(el);}else stack[stack.length-1].childNodes.push({nodeType:3,text:token,parentNode:stack[stack.length-1]});}}
  const windowTarget=new EventTarget(),viewport=new EventTarget(),media=new EventTarget();viewport.height=viewportHeight;viewport.width=viewportWidth;viewport.offsetTop=0;viewport.offsetLeft=0;media.matches=reducedMotion;media.media='(prefers-reduced-motion: reduce)';
  class MiniResizeObserver{constructor(callback){this.callback=callback;this.targets=new Set();observers.push(this);}observe(target){this.targets.add(target);}unobserve(target){this.targets.delete(target);}disconnect(){this.targets.clear();}}
  const entries=[],pendingHistory=[];let historyIndex=-1;
  const history={get state(){return entries[historyIndex]||null;},get length(){return entries.length;},get pending(){return pendingHistory.length;},replaceState(state){if(historyIndex<0)historyIndex=0;entries[historyIndex]=JSON.parse(JSON.stringify(state));},pushState(state){entries.splice(historyIndex+1);entries.push(JSON.parse(JSON.stringify(state)));historyIndex++;},go(delta){const traverse=()=>{const next=historyIndex+delta;if(next<0||next>=entries.length)return;historyIndex=next;windowTarget.dispatchEvent(new MiniEvent('popstate',{state:JSON.parse(JSON.stringify(this.state))}));};if(deferHistory)pendingHistory.push(traverse);else traverse();},back(){this.go(-1);},forward(){this.go(1);}};
  context={window:null,document,history,visualViewport:viewport,navigator:{clipboard:{writeText:async()=>{}}},location:{origin:'https://test.example',pathname:'/',hash:'',search:testing?'?testing=1':''},localStorage:{getItem:key=>store.get(key)||null,setItem:(key,value)=>store.set(key,value),removeItem:key=>store.delete(key)},console:{log(){},error:error=>errors.push(String(error))},setTimeout:schedule,clearTimeout:id=>timers.delete(id),requestAnimationFrame:fn=>schedule(()=>fn(clock?clockTick:0),clock?16:0),cancelAnimationFrame:id=>timers.delete(id),matchMedia:()=>media,scrollX:0,scrollY:0,innerHeight:viewportHeight,innerWidth:viewportWidth,scrollTo(first,second){if(typeof first==='object'){this.scrollY=first.top??this.scrollY;this.scrollX=first.left??this.scrollX;}else{this.scrollX=first;this.scrollY=second;}},addEventListener:(...args)=>windowTarget.addEventListener(...args),removeEventListener:(...args)=>windowTarget.removeEventListener(...args),dispatchEvent:event=>windowTarget.dispatchEvent(event),getComputedStyle:element=>({display:element.hidden?'none':'block',visibility:'visible',paddingTop:element.style.paddingTop||'0px',paddingBottom:element.style.paddingBottom||'0px',maxHeight:element.style.maxHeight||element.style['max-height']||'',getPropertyValue:key=>element.style[key]||''}),confirm:()=>true,URLSearchParams,Date:clock?ClockDate:Date,performance:{now:()=>clock?clockTick:Date.now()},Math,Blob,Event:MiniEvent,KeyboardEvent:MiniEvent,CustomEvent:MiniEvent,HTMLElement:Element,Element,ResizeObserver:resizeObserver?MiniResizeObserver:undefined,URL:{createObjectURL:()=>'',revokeObjectURL(){}}};context.window=context;context.globalThis=context;vm.createContext(context);
  const root=path.resolve(__dirname,'../../dist');
  // Load exactly the shipped script order, including the new sheet adapter.
  const sequence=modules||[...fs.readFileSync(path.join(root,'index.html'),'utf8').matchAll(/<script\b[^>]*\bsrc="\/([^"?]+)(?:\?[^" ]*)?"/g)].map(match=>match[1]);
  for(const file of sequence)vm.runInContext(fs.readFileSync(path.join(root,file),'utf8'),context,{filename:file});
  function submit(form){const event=new MiniEvent('submit');form.dispatchEvent(event);if(!event.defaultPrevented&&form.getAttribute('onsubmit')){context.event=event;vm.runInContext(form.getAttribute('onsubmit'),context);delete context.event;}}
  const flush=()=>{for(let pass=0;pass<20;pass++){const ready=[...timers].filter(([,job])=>clock?job.due<=clockTick:job.delay<500);if(!ready.length)break;for(const [id,job]of ready){timers.delete(id);job.fn();}}};
  const advance=ms=>{if(!clock)throw Error('Use createHarness({clock:true}) to advance time');const target=clockTick+Math.max(0,Number(ms)||0);for(let count=0;count<10000;count++){const ready=[...timers].filter(([,job])=>job.due<=target).sort((a,b)=>a[1].due-b[1].due||a[0]-b[0]);if(!ready.length){clockTick=target;return;}const[id,job]=ready[0];timers.delete(id);clockTick=Math.max(clockTick,job.due);job.fn();}throw Error('Fake clock timer loop failed to settle');};
  const set=(id,value)=>{const element=document.getElementById(id);if(!element)throw Error('Missing actual field '+id+' on '+context.L.route);element.value=String(value);element.dispatchEvent(new MiniEvent('input'));element.dispatchEvent(new MiniEvent('change'));return element;};
  const flushHistory=()=>{for(let count=0;pendingHistory.length&&count<30;count++)pendingHistory.shift()();if(pendingHistory.length)throw Error('History cleanup failed to settle');};
  const measure=(element,{height=element.clientHeight,width=element.clientWidth,scrollHeight=height}={})=>{element.clientHeight=element.offsetHeight=height;element.clientWidth=element.offsetWidth=width;element.scrollHeight=scrollHeight;for(const observer of observers){const targets=[...observer.targets].filter(target=>target===element||target.contains?.(element));if(targets.length)observer.callback(targets.map(target=>({target,contentRect:target.getBoundingClientRect()})),observer);}};
  return {L:context.L,context,document,history,viewport,media,errors,animations,scrolls,activations,observers,store,entries,flush,advance,flushHistory,set,submit,measure,emit:(type,init={})=>windowTarget.dispatchEvent(new MiniEvent(type,init)),key:(key,init={})=>(document.activeElement||document.body).dispatchEvent(new MiniEvent('keydown',{key,...init})),Event:MiniEvent};
}
module.exports={createHarness};
