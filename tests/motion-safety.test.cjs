/* Motion safety checks use browser API doubles, not a layout engine. */
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const events=new Map(),animations=[],media={matches:false,addEventListener(type,fn){this.change=fn;}};
class Element{
 constructor(name,text=''){this.name=name;this.text=text;this.nodes=new Map();this.dataset={};this.style={};this.classes=new Set();this.classList={add:n=>this.classes.add(n),remove:n=>this.classes.delete(n),toggle:(n,v)=>v?this.classes.add(n):this.classes.delete(n)};}
 get textContent(){return this.text;}
 set textContent(_){throw Error('Motion must not replace financial text on '+this.name);}
 set innerHTML(_){throw Error('Motion must not rewrite interface content on '+this.name);}
 querySelector(s){return (this.nodes.get(s)||[])[0]||null;}
 querySelectorAll(s){return this.nodes.get(s)||[];}
 set(s,...values){this.nodes.set(s,values);return this;}
 getBoundingClientRect(){return {left:this.name==='recipient'?120:10,top:20,width:50,height:40};}
 animate(frames,options){
  const item={element:this,frames,options,cancelled:false};
  const result={finished:{then(_ok,fail){item.reject=fail;}},cancel(){item.cancelled=true;item.reject?.();}};
  item.animation=result;animations.push(item);return result;
 }
}
const root=new Element('view'),html=new Element('html'),screen=new Element('screen');
const insight=new Element('insight','Food and transport would be GH₵30 short.'),projection=new Element('projection','Projected account balance GH₵320');
const available=new Element('available','GH₵600.00'),room=new Element('room','GH₵150.00'),math=new Element('math','GH₵350 for essentials and GH₵100 for goals.');
const hero=new Element('result'),mark=new Element('mark'),check=new Element('check');check.getTotalLength=()=>20;
hero.dataset={paymentState:'confirmed',resultId:'tx-1'};hero.set('.success-mark,.result-mark,[data-result-mark]',mark);mark.set('svg path',check);
root.set('.screen',screen).set('[data-insight]',insight).set('[data-projection]',projection).set('[data-payment-state]',hero).set('#overview-balance,#overview-room,.home-plan-math',available,room,math);
const document={hidden:false,documentElement:html,getElementById:id=>id==='view'?root:null,querySelector:s=>root.querySelector(s),querySelectorAll:s=>root.querySelectorAll(s),addEventListener:(type,fn)=>events.set(type,fn)};
const L={route:'paymentResult',params:{id:'tx-1'},state:{balance:320,essentials:[{name:'Food',amount:350}],goals:[{name:'Laptop',allocated:100}],txs:[{id:'tx-1',status:'success',delivery:'delivered'}],paymentDraft:{id:'d-1',amount:280,fee:0},chats:[]}};
const context={window:null,document,L,console,matchMedia:()=>media};context.window=context;vm.createContext(context);
vm.runInContext(fs.readFileSync(path.join(__dirname,'../dist/motion.js'),'utf8'),context,{filename:'motion.js'});
const money=JSON.stringify(L.state);
const start=()=>animations.length;
const since=n=>animations.slice(n);
const forElement=(name,n=0)=>since(n).filter(a=>a.element.name===name);
let at=start();L.motion();
assert.equal(JSON.stringify(L.state),money);assert.equal(available.text,'GH₵600.00');assert.equal(projection.text,'Projected account balance GH₵320');
assert(forElement('mark',at).some(a=>a.frames.some(f=>f.transform?.includes('scale'))),'Only the actual confirmed result resolves with a scale gesture');
assert.equal(forElement('check',at).length,1,'Confirmed delivered result draws its check');
for(const a of since(at)){assert(a.options.duration>0&&a.options.duration<=500);assert.equal(a.options.delay,undefined);assert(!a.frames.some(f=>f.opacity===0),'Financial text and controls do not disappear during entrance');}
console.log('PASS real financial figures are immutable, with no count-up, delayed controls or invented values');

for(const status of ['pending','failed']){
 L.state.txs[0].status=status;hero.dataset.paymentState=status;at=start();L.motion();
 assert.equal(forElement('mark',at).length,1);assert(!forElement('mark',at).some(a=>a.frames.some(f=>f.transform)));
 assert.equal(forElement('check',at).length,0);
}
for(const delivery of ['pending','failed']){
 L.state.txs[0].status='success';L.state.txs[0].delivery=delivery;hero.dataset.paymentState='delivery-'+delivery;at=start();L.motion();
 assert.equal(forElement('check',at).length,0);assert(!forElement('mark',at).some(a=>a.frames.some(f=>f.transform)));
}
// Defensive guard: incorrectly styled markup still cannot animate an unconfirmed success.
hero.dataset.paymentState='confirmed';L.state.txs[0].status='pending';at=start();L.motion();assert.equal(forElement('mark',at).length,0);
L.state.txs[0].status='success';L.state.txs[0].delivery='pending';at=start();L.motion();assert.equal(forElement('mark',at).length,0);
L.state.txs=[];at=start();L.motion();assert.equal(forElement('mark',at).length,0);
console.log('PASS pending, failed, undelivered and missing transactions never receive a success animation');

at=start();L.motionPrivacy(true);assert.equal(forElement('available',at).length,1);assert.equal(forElement('room',at).length,1);assert.equal(forElement('math',at).length,1);assert(root.classes.has('lumo-balances-revealed'));
L.motionPrivacy(false);assert(!root.classes.has('lumo-balances-revealed'));assert.equal(available.text,'GH₵600.00');
L.route='paymentReview';at=start();L.state.paymentDraft.amount=140;L.motion();assert.equal(forElement('projection',at).length,1);at=start();L.motion();assert.equal(forElement('projection',at).length,0,'Unchanged projection does not repeatedly demand attention');
const answer=new Element('answer','Your plan stays covered. Just GH₵10 spare.'),workspace=new Element('workspace');root.set('#chat-latest-reply',answer).set('.chat-has-conversation',workspace);L.route='chat';L.state.chats=[{role:'user'},{role:'assistant'}];at=start();L.motion();assert.equal(forElement('answer',at).length,1);assert.equal(forElement('workspace',at).length,1);assert.equal(answer.text,'Your plan stays covered. Just GH₵10 spare.');
console.log('PASS privacy relation, changed projection and first conversation share finite immediate reveal motion');

at=start();const projectionSnapshot=JSON.stringify(L.state);L.motionProjection(projection);
assert.equal(since(at).length,1,'In-place projection updates do not restart the screen or other effects');
const inPlace=since(at)[0];assert.equal(inPlace.element,projection);assert(inPlace.options.duration<220);
assert(inPlace.frames.every(frame=>frame.opacity===1&&!frame.transform),'Typing keeps the projection fully visible and stationary');
L.motionProjection(projection);assert(inPlace.cancelled,'Successive keystrokes replace the subtle edge effect instead of stacking animations');
assert.equal(JSON.stringify(L.state),projectionSnapshot);assert.equal(projection.text,'Projected account balance GH₵320');
console.log('PASS live amount projections use only a replaceable edge emphasis, without moving focus or replaying screen entrance');

const scene=new Element('scene'),wallet=new Element('wallet','GH₵320'),recipient=new Element('recipient'),token=new Element('token','−GH₵280');
scene.dataset={before:'600',after:'320'};scene.set('.pause-wallet',wallet).set('.pause-recipient',recipient).set('.pause-payment-token',token);root.set('.pause-scene',scene);
at=start();L.animatePause();assert.equal(wallet.text,'GH₵320');assert.equal(forElement('token',at).length,1);const firstToken=forElement('token',at)[0];L.animatePause();assert(firstToken.cancelled,'Replay replaces prior illustrative motion');
console.log('PASS optional Pause replay animates the route while projected amount remains final');

at=start();L.motion();assert(since(at).length);media.matches=true;media.change();assert(since(at).every(a=>a.cancelled));at=start();L.motion();L.motionPrivacy(true);L.motionProjection(projection);L.animatePause();assert.equal(since(at).length,0);assert.equal(wallet.text,'GH₵320');assert(scene.classes.has('pause-is-complete'));
media.matches=false;media.change();document.hidden=true;events.get('visibilitychange')();at=start();L.motion();assert.equal(since(at).length,0);
const css=fs.readFileSync(path.join(__dirname,'../dist/motion.css'),'utf8');assert(css.includes('@media(prefers-reduced-motion:reduce)'));assert(css.includes('scroll-behavior:auto!important'));assert(!css.includes('infinite'));
console.log('PASS reduced motion and backgrounding cancel active effects with facts, choices and sample replay final state intact');
