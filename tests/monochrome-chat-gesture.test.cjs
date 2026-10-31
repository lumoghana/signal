/* The edition's two-way gestures supplement real controls. The miniature DOM
   checks ownership, native history and unchanged money; device delivery is QA. */
'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {createHarness}=require('./helpers/task-sheet-dom.cjs');
const shipped=require('./helpers/shipped-entry.cjs').scripts(require('node:path').resolve(__dirname,'..'));
const modules=shipped.includes('mono-chat-gesture.js')?shipped:[...shipped,'mono-chat-gesture.js'];
const view=h=>h.document.getElementById('view');
const app=h=>h.document.getElementById('app');
const settle=h=>{h.flushHistory();h.flush();};
const clean=h=>assert.deepEqual(h.errors,[]);
const money=L=>JSON.stringify({balance:L.state.balance,accounts:L.state.accounts,txs:L.state.txs,essentials:L.state.essentials,goals:L.state.goals,requests:L.state.requests,virtualCards:L.state.virtualCards,groupMoney:L.state.groupMoney?.items||[],savingsHacks:L.state.savingsHacks});
function fixture(options={}){const h=createHarness({modules,clock:true,deferHistory:true,...options});h.L.explore();h.L.render();settle(h);return h;}
function pointer(h,target,type,x,y,extra={}){const event=new h.Event(type,{pointerId:7,pointerType:'touch',isPrimary:true,button:0,clientX:x,clientY:y,...extra});target.dispatchEvent(event);return event;}
function touch(h,target,type,points,changed=points,extra={}){const event=new h.Event(type,{touches:points.map(([x,y,id=1])=>({clientX:x,clientY:y,identifier:id})),changedTouches:changed.map(([x,y,id=1])=>({clientX:x,clientY:y,identifier:id})),...extra});target.dispatchEvent(event);return event;}
function swipe(h,target,direction='left',extra={}){const from=direction==='left'?280:80,to=direction==='left'?80:280;pointer(h,target,'pointerdown',from,250,extra);h.advance(80);const moved=pointer(h,target,'pointermove',to,254,extra);pointer(h,target,'pointerup',to,254,extra);settle(h);return moved;}
const surface=h=>view(h).querySelector('.screen');

for(const route of ['home','plan','pay','more','cardsHome','moneyStoryHome'])for(const direction of ['left','right'])test(direction+' swipe opens Ask Lumo from '+route+' and returns to that real origin',()=>{
 const h=fixture(),before=money(h.L);h.L.openTab(route);settle(h);view(h).scrollTop=73;
 const count=h.entries.length;
 assert.equal(swipe(h,surface(h),direction).defaultPrevented,true);
 assert.equal(h.L.route,'chat');assert(view(h).querySelector('.chat-workspace'));assert.equal(h.history.state.route,'chat');
 assert.equal(h.entries.length,count+1,'Exactly one destination history entry despite both recognizers loading');
 assert.equal(h.L.taskSheet.active,false);
 assert.equal(swipe(h,view(h).querySelector('.chat-workspace'),direction).defaultPrevented,true);
 assert.equal(h.L.route,route);assert.equal(h.history.state.route,route);assert(view(h).querySelector('.screen-'+route));assert.equal(view(h).scrollTop,73);
 assert.equal(h.L.taskSheet.active,false);assert.equal(money(h.L),before);clean(h);
});

test('Chat return restores Money Story scope and native Back/Forward without an extra render',()=>{
 const h=fixture(),{L}=h;L.openTab('moneyStoryHome');settle(h);L.moneyStoryAnalytics.setPeriod(30);L.moneyStoryAnalytics.filter('category','Data');settle(h);
 const scope=JSON.stringify(L.params),before=money(L);view(h).scrollTop=123;L.openBankingChat();settle(h);
 assert.equal(L.route,'chat');const count=h.entries.length;L.closeBankingChat();settle(h);
 assert.equal(h.entries.length,count+1);assert.equal(L.route,'moneyStoryHome');assert.equal(JSON.stringify(L.params),scope);assert.equal(JSON.stringify(h.history.state.params),scope);assert.equal(view(h).scrollTop,123);
 assert(view(h).querySelector('[data-money-story-dashboard]'));assert(view(h).textContent.includes('Last 30 days'));
 h.history.back();settle(h);assert.equal(L.route,'chat');assert(view(h).querySelector('.chat-workspace'));
 h.history.back();settle(h);assert.equal(L.route,'moneyStoryHome');assert.equal(JSON.stringify(L.params),scope);
 h.history.forward();settle(h);assert.equal(L.route,'chat');h.history.forward();settle(h);assert.equal(L.route,'moneyStoryHome');assert.equal(JSON.stringify(L.params),scope);
 assert.equal(money(L),before);clean(h);
});

test('interleaved pointer and touch streams navigate once and a cancelled pointer does not lose a valid touch',()=>{
 for(const pointerCancelled of [false,true]){
  const h=fixture(),target=surface(h),count=h.entries.length;
  pointer(h,target,'pointerdown',280,250);touch(h,target,'touchstart',[[280,250]]);h.advance(60);
  pointer(h,target,'pointermove',160,252);if(pointerCancelled)pointer(h,target,'pointercancel',160,252);
  const moved=touch(h,target,'touchmove',[[80,254]]);assert.equal(moved.defaultPrevented,true);
  pointer(h,target,'pointerup',80,254);touch(h,target,'touchend',[],[[80,254]]);settle(h);
  assert.equal(h.L.route,'chat');assert.equal(h.entries.length,count+1);clean(h);
 }
});

test('vertical scroll, short movement, slow drags, mouse selection and native screen edges remain untouched',()=>{
 for(const scenario of ['vertical','short','slow','mouse','leftEdge','rightEdge','selection','nativePan']){
  const h=fixture(),target=surface(h);let moved;
  if(scenario==='selection')h.context.getSelection=()=>({toString:()=> 'Selected text'});
  const from=scenario==='leftEdge'?8:scenario==='rightEdge'?385:280;
  if(scenario==='nativePan'){
   touch(h,target,'touchstart',[[280,250]]);moved=touch(h,target,'touchmove',[[80,252]],[[80,252]],{cancelable:false});touch(h,target,'touchend',[],[[80,252]]);
  }else{
   const extra=scenario==='mouse'?{pointerType:'mouse'}:{};
   pointer(h,target,'pointerdown',from,250,extra);h.advance(scenario==='slow'?1850:80);
   moved=pointer(h,target,'pointermove',scenario==='short'?265:scenario==='vertical'?275:80,scenario==='vertical'?310:254,extra);
   pointer(h,target,'pointerup',scenario==='short'?265:80,scenario==='vertical'?310:254,extra);
  }
  settle(h);assert.equal(h.L.route,'home',scenario);if(scenario!=='short')assert.equal(moved.defaultPrevented,false,scenario);clean(h);
 }
});

test('two-finger, cancelled and lost-capture gestures cannot complete after their cancellation',()=>{
 for(const scenario of ['pointerMulti','touchMulti','pointerCancel','touchCancel','lostCapture']){
  const h=fixture(),target=surface(h);
  if(scenario.startsWith('touch')){
   touch(h,target,'touchstart',[[280,250]]);if(scenario==='touchMulti')touch(h,target,'touchstart',[[280,250],[250,250,2]]);else touch(h,target,'touchcancel',[],[[280,250]]);
   touch(h,target,'touchmove',[[80,254]]);touch(h,target,'touchend',[],[[80,254]]);
  }else{
   pointer(h,target,'pointerdown',280,250);
   if(scenario==='pointerMulti')pointer(h,target,'pointerdown',250,250,{pointerId:8,isPrimary:false});
   else pointer(h,target,scenario==='pointerCancel'?'pointercancel':'lostpointercapture',180,252);
   pointer(h,target,'pointermove',80,254);pointer(h,target,'pointerup',80,254);
  }
  settle(h);assert.equal(h.L.route,'home',scenario);clean(h);
 }
});

test('Home navigation cards accept both swipe directions without activating their tap actions',()=>{
 for(const selector of ['.account-room','.mono-budget-link','.mono-quick-action','.everyday-boxes-open','.mono-conversation-open'])for(const direction of ['left','right']){
  const h=fixture(),before=money(h.L),target=view(h).querySelector(selector);assert(target,selector);
  const entries=h.entries.length;assert.equal(swipe(h,target,direction).defaultPrevented,true);
  assert.equal(h.L.route,'chat');assert.equal(h.L.taskSheet.active,false);assert.equal(h.entries.length,entries+1);assert.equal(money(h.L),before);
  const actions=view(h).querySelector('.chat-banking-actions'),trailing=new h.Event('click',{detail:1,pointerId:7,clientX:direction==='left'?80:280,clientY:254});
  actions.dispatchEvent(trailing);assert.equal(trailing.defaultPrevented,true);assert.equal(h.L.taskSheet.active,false);
  pointer(h,actions,'pointerdown',280,30);pointer(h,actions,'pointerup',280,30);actions.click();settle(h);
  assert.equal(h.L.route,'chatBankingActions');assert.equal(h.L.taskSheet.active,true);assert.equal(money(h.L),before);clean(h);
 }
});

test('privacy, forms, chart gestures and nested horizontal regions keep their own controls',()=>{
 const h=fixture(),before=money(h.L);
 for(const selector of ['.balance-eye','.home-header-actions button']){
  for(const direction of ['left','right']){const e=swipe(h,view(h).querySelector(selector),direction);assert.equal(e.defaultPrevented,false);assert.equal(h.L.route,'home',selector);}
 }
 for(const route of ['plan','pay','more']){
  h.L.openTab(route);settle(h);const control=view(h).querySelector('.hibiscus-root-header button');assert(control,'Header control on '+route);
  for(const direction of ['left','right']){assert.equal(swipe(h,control,direction).defaultPrevented,false);assert.equal(h.L.route,route);}
 }
 h.L.openTab('moneyStoryHome');settle(h);
 for(const selector of ['.ms-chart','.ms-periods button','.ms-breakdown-tabs button']){const e=swipe(h,view(h).querySelector(selector));assert.equal(e.defaultPrevented,false);assert.equal(h.L.route,'moneyStoryHome',selector);}
 for(const attribute of ['data-no-swipe','contenteditable']){const region=h.document.createElement('div');region.setAttribute(attribute,'true');view(h).appendChild(region);assert.equal(swipe(h,region).defaultPrevented,false);assert.equal(h.L.route,'moneyStoryHome');}
 const region=h.document.createElement('div');region.clientWidth=120;region.scrollWidth=300;view(h).appendChild(region);assert.equal(swipe(h,region).defaultPrevented,false);assert.equal(h.L.route,'moneyStoryHome');
 h.L.openBankingChat();settle(h);h.set('chatText','Keep this unfinished question');
 assert.equal(swipe(h,h.document.getElementById('chatText')).defaultPrevented,false);assert.equal(h.L.route,'chat');assert.equal(h.document.getElementById('chatText').value,'Keep this unfinished question');
 assert.equal(swipe(h,view(h).querySelector('.chat-banking-actions')).defaultPrevented,false);assert.equal(h.L.route,'chat');
 assert.equal(money(h.L),before);clean(h);
});

test('task sheets, the Menu drawer and Budget guide never give navigation to a horizontal swipe',()=>{
 const h=fixture(),before=money(h.L);
 for(const route of ['sendOptions','goals','monoMenu']){
  if(route==='monoMenu')h.L.openMonoMenu();else h.L.go(route);settle(h);const current=h.L.route;assert.equal(h.L.taskSheet.active,true);
  for(const direction of ['left','right']){const e=swipe(h,surface(h),direction);assert.equal(e.defaultPrevented,false);assert.equal(h.L.route,current);assert.equal(h.L.taskSheet.active,true);}
  h.L.closeTask();settle(h);
 }
 h.L.budgetGuide.start({mode:'create'});settle(h);assert(h.L.budgetGuide.active());assert.equal(h.L.route,'chat');
 for(const direction of ['left','right']){const e=swipe(h,surface(h),direction);assert.equal(e.defaultPrevented,false);assert.equal(h.L.route,'chat');assert(h.L.budgetGuide.active());}
 assert.equal(money(h.L),before);clean(h);
});

test('a route change, account replacement, lock or background event retires an in-flight gesture',()=>{
 for(const change of ['route','account','lock','blur','hidden']){
  const h=fixture(),target=surface(h);pointer(h,target,'pointerdown',280,250);pointer(h,target,'pointermove',160,252);
  if(change==='route')h.L.openTab('plan');else if(change==='account')h.L.state=JSON.parse(JSON.stringify(h.L.state));else if(change==='lock')h.L.state.locked=true;else if(change==='blur')h.emit('blur');else {h.document.hidden=true;h.document.dispatchEvent(new h.Event('visibilitychange'));}
  pointer(h,app(h),'pointerup',80,254);settle(h);assert.notEqual(h.L.route,'chat',change);clean(h);
 }
});

test('trailing click is suppressed once while fresh taps and keyboard activation work immediately',()=>{
 const h=fixture();swipe(h,surface(h));const target=view(h).querySelector('.chat-banking-actions');
 const trailing=new h.Event('click',{detail:1,pointerId:7,clientX:80,clientY:254});target.dispatchEvent(trailing);assert.equal(trailing.defaultPrevented,true);assert.equal(h.L.taskSheet.active,false);
 const keyboard=new h.Event('click',{detail:0,clientX:80,clientY:254});target.dispatchEvent(keyboard);assert.equal(keyboard.defaultPrevented,false);
 pointer(h,target,'pointerdown',280,30);pointer(h,target,'pointerup',280,30);target.click();settle(h);assert.equal(h.L.route,'chatBankingActions');assert.equal(h.L.taskSheet.active,true);clean(h);
});

test('reduced motion keeps both directions and preserves an unsent Chat question on return',()=>{
 const h=fixture({reducedMotion:true}),before=money(h.L);swipe(h,surface(h),'right');assert.equal(h.L.route,'chat');h.set('chatText','Can I make this last?');
 swipe(h,view(h).querySelector('.chat-workspace'),'right');assert.equal(h.L.route,'home');assert.equal(app(h).getAttribute('data-chat-direction'),null);
 swipe(h,surface(h),'left');assert.equal(h.L.route,'chat');assert.equal(h.document.getElementById('chatText').value,'Can I make this last?');assert.equal(money(h.L),before);clean(h);
});
