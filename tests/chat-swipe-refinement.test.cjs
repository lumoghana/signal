/* Mounted input events verify gesture ownership, cancellation and financial
   isolation. Browser/device QA remains necessary for native touch delivery. */
const assert=require('node:assert/strict');
const {createHarness}=require('./helpers/task-sheet-dom.cjs');
let passed=0;const check=(name,run)=>{run();passed++;console.log('PASS '+name);};
const clone=x=>JSON.parse(JSON.stringify(x));
const app=h=>h.document.getElementById('app');
const view=h=>h.document.getElementById('view');
const financial=h=>clone({accounts:h.L.state.accounts,balance:h.L.state.balance,txs:h.L.state.txs,essentials:h.L.state.essentials,goals:h.L.state.goals});
function fixture(options={}){const h=createHarness({clock:true,...options});h.L.explore();h.L.openTab('home');h.L.render();h.flush();return h;}
function pointer(h,target,type,x,y,extra={}){const e=new h.Event(type,{pointerId:7,pointerType:'touch',isPrimary:true,button:0,clientX:390-x,clientY:y,...extra});target.dispatchEvent(e);return e;}
function touch(h,target,type,points,changed=points,extra={}){const e=new h.Event(type,{touches:points.map(([x,y,id=1])=>({clientX:390-x,clientY:y,identifier:id})),changedTouches:changed.map(([x,y,id=1])=>({clientX:390-x,clientY:y,identifier:id})),...extra});target.dispatchEvent(e);return e;}
function swipe(h,target,from=[280,300],to=[80,304],extra={}){pointer(h,target,'pointerdown',...from,extra);h.advance(80);const e=pointer(h,target,'pointermove',...to,extra);pointer(h,target,'pointerup',...to,extra);h.flush();return e;}
const clean=h=>assert.deepEqual(h.errors,[]);

check('financial card buttons accept a deliberate swipe without activating their detail',()=>{
 const h=fixture(),before=financial(h),target=view(h).querySelector('.account-room');assert(target);const e=swipe(h,target);
 assert.equal(h.L.route,'chat');assert.equal(e.defaultPrevented,true);assert.equal(h.L.taskSheet.active,false);assert.deepEqual(financial(h),before);clean(h);
});
check('a modern phone touch stream still navigates when its pointer stream is cancelled',()=>{
 const h=fixture(),target=view(h).querySelector(h.L.monoChatGesture?'.mono-home':'.account-room'),before=financial(h);
 pointer(h,target,'pointerdown',280,300);touch(h,target,'touchstart',[[280,300]]);h.advance(60);
 pointer(h,target,'pointermove',210,301);pointer(h,target,'pointercancel',210,301);
 const move=touch(h,target,'touchmove',[[180,303]]);assert.equal(move.defaultPrevented,true);
 touch(h,target,'touchend',[],[[80,305]]);h.flush();assert.equal(h.L.route,'chat');assert.deepEqual(financial(h),before);clean(h);
});
check('interleaved pointer and touch completion navigates exactly once',()=>{
 const h=fixture(),target=view(h).querySelector('.mono-home');let calls=0;const open=h.L.openBankingChat;h.L.openBankingChat=()=>{calls++;return open();};
 pointer(h,target,'pointerdown',280,300);touch(h,target,'touchstart',[[280,300]]);h.advance(60);
 pointer(h,target,'pointermove',80,302);touch(h,target,'touchmove',[[80,302]]);pointer(h,target,'pointerup',80,302);touch(h,target,'touchend',[],[[80,302]]);h.flush();
 assert.equal(calls,1);assert.equal(h.L.route,'chat');clean(h);
});
check('left swipe from conversation text returns Home and keeps the composer draft',()=>{
 const h=fixture();h.L.openBankingChat();h.flush();h.set('chatText','Keep my unsent question');const before=financial(h);
 swipe(h,view(h).querySelector('.chat-workspace'),[55,300],[275,305]);assert.equal(h.L.route,'home');h.L.openBankingChat();h.flush();
 assert.equal(h.document.getElementById('chatText').value,'Keep my unsent question');assert.deepEqual(financial(h),before);clean(h);
});
check('vertical touch scrolling remains native and cannot later become navigation',()=>{
 const h=fixture(),target=view(h).querySelector(h.L.monoChatGesture?'.mono-home':'.account-room');touch(h,target,'touchstart',[[280,300]]);
 const vertical=touch(h,target,'touchmove',[[275,335]]);assert.equal(vertical.defaultPrevented,false);
 const later=touch(h,target,'touchmove',[[90,340]]);assert.equal(later.defaultPrevented,false);touch(h,target,'touchend',[],[[90,340]]);h.flush();assert.equal(h.L.route,'home');clean(h);
});
check('a browser-owned pan cannot be turned into Chat navigation by a later diagonal move',()=>{
 const h=fixture(),target=view(h).querySelector('.mono-home');touch(h,target,'touchstart',[[280,300]]);
 touch(h,target,'touchmove',[[260,318]]);const owned=touch(h,target,'touchmove',[[90,325]],[[90,325]],{cancelable:false});
 touch(h,target,'touchend',[],[[90,325]]);h.flush();assert.equal(owned.defaultPrevented,false);assert.equal(h.L.route,'home');clean(h);
});
check('short and reversed drags stay put while the other horizontal direction follows the edition gesture rules',()=>{
 for(const kind of ['short','reverse','wrong']){
  const h=fixture(),target=view(h).querySelector('.mono-home');pointer(h,target,'pointerdown',220,300);h.advance(60);
  pointer(h,target,'pointermove',kind==='wrong'?310:140,302);pointer(h,target,'pointerup',kind==='short'?180:kind==='reverse'?235:310,302);h.flush();assert.equal(h.L.route,kind==='wrong'&&h.L.monoChatGesture?'chat':'home');clean(h);
 }
});
check('slow exploratory drags expire rather than opening Chat accidentally',()=>{
 const h=fixture(),target=view(h).querySelector('.mono-home');pointer(h,target,'pointerdown',280,300);h.advance(1850);pointer(h,target,'pointermove',80,302);pointer(h,target,'pointerup',80,302);h.flush();assert.equal(h.L.route,'home');clean(h);
});
check('an ordinary tap remains available on the financial button',()=>{
 const h=fixture(),target=view(h).querySelector('.account-room');pointer(h,target,'pointerdown',180,300);pointer(h,target,'pointerup',180,300);target.click();h.flush();assert.equal(h.L.taskSheet.active,true);assert.notEqual(h.L.route,'chat');clean(h);
});
check('a swipe suppresses its trailing click but permits a fresh intentional tap immediately',()=>{
 const h=fixture();swipe(h,view(h).querySelector(h.L.monoChatGesture?'.mono-home':'.account-room'));
 const target=view(h).querySelector('.chat-banking-actions'),trailing=new h.Event('click',{detail:1,clientX:310,clientY:304});target.dispatchEvent(trailing);assert.equal(trailing.defaultPrevented,true);assert.equal(h.L.taskSheet.active,false);
 pointer(h,target,'pointerdown',300,30);pointer(h,target,'pointerup',300,30);target.click();h.flush();assert.equal(h.L.route,'chatBankingActions');assert.equal(h.L.taskSheet.active,true);clean(h);
});
check('keyboard activation is never swallowed by the post-drag click guard',()=>{
 const h=fixture();swipe(h,view(h).querySelector(h.L.monoChatGesture?'.mono-home':'.account-room'));const target=view(h).querySelector('.chat-banking-actions');
 const e=new h.Event('click',{detail:0,clientX:310,clientY:304});target.dispatchEvent(e);assert.equal(e.defaultPrevented,false);target.click();h.flush();assert.equal(h.L.route,'chatBankingActions');clean(h);
});
check('touch cancellation and two-finger gestures leave navigation unchanged',()=>{
 const h=fixture(),target=view(h).querySelector('.mono-home');touch(h,target,'touchstart',[[280,300]]);touch(h,target,'touchmove',[[180,302]]);touch(h,target,'touchcancel',[],[[80,302]]);touch(h,target,'touchend',[],[[80,302]]);assert.equal(h.L.route,'home');
 touch(h,target,'touchstart',[[280,300]]);touch(h,target,'touchstart',[[280,300],[230,300,2]]);touch(h,target,'touchmove',[[80,302],[70,302,2]]);touch(h,target,'touchend',[[80,302]],[[70,302,2]]);touch(h,target,'touchend',[],[[80,302]]);h.flush();assert.equal(h.L.route,'home');clean(h);
});
check('lost capture cancels a pointer gesture, with a later fresh swipe still working',()=>{
 const h=fixture(),target=view(h).querySelector('.mono-home');pointer(h,target,'pointerdown',280,300);pointer(h,target,'pointermove',180,302);pointer(h,target,'lostpointercapture',180,302);pointer(h,target,'pointerup',80,302);h.flush();assert.equal(h.L.route,'home');
 swipe(h,target);assert.equal(h.L.route,'chat');clean(h);
});
check('privacy, header controls, forms and open sheets retain their own interactions',()=>{
 const h=fixture();const eye=view(h).querySelector('.balance-eye');assert(eye);swipe(h,eye);assert.equal(h.L.route,'home');
 h.L.openBankingChat();h.flush();h.set('chatText','Still here');swipe(h,h.document.getElementById('chatText'),[60,300],[280,302]);assert.equal(h.L.route,'chat');
 swipe(h,view(h).querySelector('.chat-banking-actions'),[60,300],[280,302]);assert.equal(h.L.route,'chat');h.L.openChatBankingActions();h.flush();swipe(h,view(h).querySelector('h1'),[60,300],[280,302]);assert.equal(h.L.route,'chatBankingActions');assert.equal(h.L.taskSheet.active,true);clean(h);
});
check('browser edges, selected text and mouse drags are not taken over',()=>{
 for(const startX of [8,385]){const h=fixture();swipe(h,view(h).querySelector('.mono-home'),[startX,300],[70,302]);assert.equal(h.L.route,'home');clean(h);}
 const h=fixture(),target=view(h).querySelector('.mono-home');h.context.getSelection=()=>({toString:()=> 'Selected money text'});swipe(h,target);assert.equal(h.L.route,'home');h.context.getSelection=()=>({toString:()=>''});swipe(h,target,[280,300],[80,302],{pointerType:'mouse'});assert.equal(h.L.route,'home');clean(h);
});
check('account locks, route changes and backgrounding cancel an in-flight swipe',()=>{
 for(const change of ['lock','route','blur']){
  const h=fixture(),target=view(h).querySelector('.mono-home');pointer(h,target,'pointerdown',280,300);pointer(h,target,'pointermove',180,302);
  if(change==='lock')h.L.state.locked=true;else if(change==='route')h.L.openTab('plan');else h.emit('blur');
  pointer(h,app(h),'pointerup',80,302);h.flush();assert.notEqual(h.L.route,'chat');clean(h);
 }
});
check('reduced motion retains both swipe directions without financial side effects',()=>{
 const h=fixture({reducedMotion:true}),before=financial(h);swipe(h,view(h).querySelector('.mono-home'));assert.equal(h.L.route,'chat');assert.equal(app(h).getAttribute('data-chat-direction'),null);
 swipe(h,view(h).querySelector('.chat-workspace'),[55,300],[275,304]);assert.equal(h.L.route,'home');assert.deepEqual(financial(h),before);clean(h);
});
console.log(passed+' swipe refinement checks passed.');
