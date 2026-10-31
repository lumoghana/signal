/* A full-screen conversation beside Home. Payments and all financial decisions
   remain in the existing task, Pause, authorisation and ledger controllers. */
(() => {
 'use strict';
 if(!window.L||L.openBankingChat)return;
 const E=L.e,B=L.btn;
 let account=L.state,cache={count:-1,scroll:0,params:{}},restore=false,lastPage=null,motionTimer=null;
 const copy=x=>{try{return JSON.parse(JSON.stringify(x||{}));}catch{return {};}};
 const checkAccount=()=>{if(account!==L.state){account=L.state;cache={count:-1,scroll:0,params:{}};restore=false;}};
 const remember=()=>{
  checkAccount();if(L.route!=='chat')return;
  const thread=document.getElementById('chat-thread');
  if(thread){cache.scroll=thread.scrollTop||0;cache.count=L.state.chats?.length||0;}
  cache.params=copy(L.params);delete cache.params.question;delete cache.params.used;
 };
 const animate=direction=>{
  const app=document.getElementById('app');if(!app)return;
  if(motionTimer!==null)clearTimeout(motionTimer);
  if(window.matchMedia?.('(prefers-reduced-motion: reduce)').matches){app.removeAttribute('data-chat-direction');return;}
  app.setAttribute('data-chat-direction',direction);
  motionTimer=setTimeout(()=>{app.removeAttribute('data-chat-direction');motionTimer=null;},260);
 };
 const sync=()=>{
  const app=document.getElementById('app');if(!app)return;
  const chat=L.route==='chat'||L.taskSheet?.parentRoute==='chat';
  if(chat)app.setAttribute('data-chat-banking','true');else app.removeAttribute('data-chat-banking');
  document.body?.classList?.toggle('chat-banking-open',chat);
  const nav=document.getElementById('nav');if(nav&&chat)nav.hidden=true;
  L.updateChatViewport?.();
 };
 L.syncChatBanking=()=>{
  sync();if(L.route==='chat'&&!L.taskSheet?.active&&cache.count===(L.state.chats?.length||0)){const thread=document.getElementById('chat-thread');if(thread)thread.scrollTop=cache.scroll;}
 };
 const chat=L.views.chat;
 L.views.chat=()=>{
  const header=`<header class="chat-banking-header"><button type="button" class="chat-banking-back" onclick="L.closeBankingChat()" aria-label="Back to Home">${L.icon('arrowLeft',20)}<span>Home</span></button><span class="wordmark" aria-label="Lumo Chat"><img class="actual-wordmark lumo-wordmark-asset" src="/brand/Lumo-Wordmark-Black.svg" alt="Lumo"></span><button type="button" class="chat-banking-actions" onclick="L.openChatBankingActions()" aria-haspopup="dialog">${L.icon('grid',19)}<span>Actions</span></button></header>`;
  return chat().replace(/<div class="topline">[\s\S]*?<\/div>/,header)
   .replace('<div class="page-heading">','<div class="page-heading chat-banking-intro">')
   .replace('A clear answer. From your saved information.','Your money. One conversation.')
   .replace('<div class="chat-bubble">What would you like to understand? Choose a question below, or ask about a payment amount.</div>','')
   .replace('Saved information only. Chat never moves your money.','Answers use your saved information.');
 };
 L.homeChatEntry=()=>`<button type="button" class="chat-banking-home-entry" onclick="L.openBankingChat()" aria-label="Open full-screen Chat">${L.icon('chat',20)}<span>Chats<small>Swipe right ${L.icon('arrowRight',12)}</small></span></button>`;
 const item=(label,sub,icon,action)=>`<button type="button" class="chat-banking-action-item" onclick="${action}">${L.icon(icon,23)}<span><strong>${E(label)}</strong><small>${E(sub)}</small></span>${L.icon('chevron',18)}</button>`;
 L.views.chatBankingActions=()=>`<section class="chat-banking-menu">${L.header('What would you like to do?','Return to this conversation when you’re done.')}<section aria-label="Payments and money">${item('Campus Pay','Scan a QR or enter a merchant code.','scan',"L.go('campusPay')")}${item('Send money','To Lumo, mobile money or a bank.','arrowUp',"L.go('sendOptions')")}${item('Add money','Mobile money or bank transfer.','plus',"L.openFunding('chat')")}${item('Request money','Create and share a request.','arrowDown','L.newRequest()')}</section><section aria-label="Your plan and spending">${item('Edit budget','Give everyday costs a place.','plan',"L.go('planEdit')")}${item('Money Boxes','Save, fund a box or transfer back.','target',"L.go('goals')")}${item('Your money story','See where your money went.','receipt',"L.go('homeMoneyStory')")}</section><p class="chat-banking-menu-boundary">Sample money. Payments always need your approval.</p><div class="actions">${B('Back to conversation','L.closeTask()','secondary')}</div></section>`;
 const openTab=L.openTab;
 L.openTab=function(route){
  if(route==='home'&&L.route==='budgetAfterFunding'&&L.taskSheet?.parentRoute==='chat')route='chat';
  checkAccount();if(L.route==='chat'&&!L.taskSheet?.active)remember();
  if(route==='chat'&&L.route!=='chat'&&!L.taskSheet?.active)restore=true;
  return openTab.call(this,route);
 };
 const go=L.go;
 L.go=function(route){if(L.route==='chat'&&!L.taskSheet?.active&&route!=='chat')remember();return go.apply(this,arguments);};
 const before=L.beforeNavigate;
 L.beforeNavigate=function(route){if(L.route==='chat'&&route!=='chat')remember();return before?.apply(this,arguments);};
 const render=L.render;
 L.render=function(...args){
  checkAccount();const entering=L.route==='chat'&&!L.taskSheet?.active&&lastPage!=='chat';
  if(restore&&L.route==='chat'&&!L.taskSheet?.active){L.params={...copy(cache.params),...L.params};restore=false;}
  const previous=lastPage,result=render.apply(this,args);
  const page=L.taskSheet?.parentRoute||L.route;sync();
  if(L.route==='chat'&&!L.taskSheet?.active&&entering&&cache.count===(L.state.chats?.length||0)){
   const thread=document.getElementById('chat-thread');if(thread)thread.scrollTop=cache.scroll;
  }
  if(!L.taskSheet?.active&&previous!==page){if(['home','pay','plan','more'].includes(previous)&&page==='chat')animate('forward');if(previous==='chat'&&['home','pay','plan','more'].includes(page))animate('back');}
  lastPage=page;return result;
 };
 L.openBankingChat=()=>L.openTab('chat');
 L.closeBankingChat=()=>L.openTab('home');
 L.openChatBankingActions=()=>{if(L.route==='chat'&&!L.taskSheet?.active)L.go('chatBankingActions');};

 // Hibiscus collection: Ask Lumo sits to the left of the four app tabs.
 // Swipes supplement visible controls. Lock direction before claiming a touch:
 // vertical motion stays native, while a deliberate horizontal drag is navigation.
 // Touch handling must also run on PointerEvent browsers; their pan cancellation
 // otherwise ends the pointer stream before pointerup reaches this surface.
 let gesture=null,blockedClick=null;const pointers=new Set();
 const time=()=>window.performance?.now?.()??Date.now();
 const app=document.getElementById('app');
 const hasSelection=()=>!!window.getSelection?.()?.toString?.();
 const available=()=>['home','pay','plan','more','cardsHome','moneyStoryHome','chat'].includes(L.route)&&!L.taskSheet?.active&&L.state.onboarded&&!L.state.locked&&!L.state.closed;
 const canSwipe=target=>available()&&!hasSelection()
  &&!target?.closest?.('input,select,textarea,summary,label,form,[contenteditable],[data-no-swipe],#nav,.chat-banking-header,.chat-entry,.chat-tools,.home-header-actions,.balance-eye')
  &&(!['cardsHome','moneyStoryHome'].includes(L.route)||!target?.closest?.('button,a,[role="button"]'));
 const release=g=>{if(g?.kind==='pointer')try{if(app?.hasPointerCapture?.(g.id))app.releasePointerCapture(g.id);}catch{}};
 const cancel=()=>{const g=gesture;gesture=null;release(g);};
 const start=(target,x,y,id,kind)=>{
  cancel();blockedClick=null;
  // Leave the browser's screen-edge gestures alone.
  if(!canSwipe(target)||!Number.isFinite(x)||!Number.isFinite(y)||x<=18||x>=window.innerWidth-18)return;
  gesture={x,y,lastX:x,lastY:y,id,kind,route:L.route,account:L.state,started:time(),axis:null};
 };
 const suppress=g=>{blockedClick={x:g.lastX,y:g.lastY,pointerId:g.kind==='pointer'?g.id:null,until:time()+650};};
 const move=(x,y,id,kind,event)=>{
  const g=gesture;if(!g||g.id!==id||g.kind!==kind)return;
  if(kind==='touch'&&event.cancelable===false){cancel();return;} // The browser already owns a native pan.
  if(!available()||g.route!==L.route||g.account!==L.state||hasSelection()||time()-g.started>1800){cancel();return;}
  if(!Number.isFinite(x)||!Number.isFinite(y)){cancel();return;}
  g.lastX=x;g.lastY=y;const dx=x-g.x,dy=y-g.y,ax=Math.abs(dx),ay=Math.abs(dy);
  if(g.axis===null){
   if(ay>=12&&ay>=ax){cancel();return;}
   if(ax<12||ax<ay*1.35)return;
   g.axis='horizontal';
   if(kind==='pointer')try{app?.setPointerCapture?.(id);}catch{}
  }
  if(g.axis==='horizontal'){
   suppress(g);
   if(event.cancelable)event.preventDefault();
  }
 };
 const finish=(x,y,id,kind)=>{
  const g=gesture;if(!g||g.id!==id||g.kind!==kind)return;
  gesture=null;release(g);
  if(!available()||g.route!==L.route||g.account!==L.state||hasSelection()||time()-g.started>1800)return;
  const dx=x-g.x,dy=y-g.y;
  if(!Number.isFinite(dx)||!Number.isFinite(dy))return;
  if(g.axis==='horizontal'){g.lastX=x;g.lastY=y;suppress(g);}
  if(g.axis!=='horizontal'||Math.abs(dx)<56||Math.abs(dx)<Math.abs(dy)*1.35)return;
  if(['home','pay','plan','more','cardsHome','moneyStoryHome'].includes(g.route)&&dx>0)L.openBankingChat();else if(g.route==='chat'&&dx<0)L.closeBankingChat();
 };
 app?.addEventListener('pointerdown',event=>{
  blockedClick=null;
  if(!['touch','pen'].includes(event.pointerType)||event.button>0)return;
  pointers.add(event.pointerId);
  if(pointers.size>1||event.isPrimary===false){cancel();return;}
  start(event.target,event.clientX,event.clientY,event.pointerId,'pointer');
 },{passive:true});
 app?.addEventListener('pointermove',event=>move(event.clientX,event.clientY,event.pointerId,'pointer',event),{passive:false});
 app?.addEventListener('pointerup',event=>{
  pointers.delete(event.pointerId);
  if(!pointers.size)finish(event.clientX,event.clientY,event.pointerId,'pointer');
 },{passive:true});
 app?.addEventListener('pointercancel',event=>{
  pointers.delete(event.pointerId);if(gesture?.kind==='pointer'&&gesture.id===event.pointerId)cancel();
 },{passive:true});
 app?.addEventListener('lostpointercapture',event=>{if(gesture?.kind==='pointer'&&gesture.id===event.pointerId)cancel();},{passive:true});
 app?.addEventListener('touchstart',event=>{
  blockedClick=null;
  if(event.touches.length!==1){cancel();return;}
  const p=event.touches[0];start(event.target,p.clientX,p.clientY,p.identifier,'touch');
 },{passive:true});
 app?.addEventListener('touchmove',event=>{
  if(event.touches.length!==1){cancel();return;}
  const p=event.touches[0];move(p.clientX,p.clientY,p.identifier,'touch',event);
 },{passive:false});
 app?.addEventListener('touchend',event=>{
  if(event.touches.length||event.changedTouches.length!==1){cancel();return;}
  const p=event.changedTouches[0];finish(p.clientX,p.clientY,p.identifier,'touch');
 },{passive:true});
 app?.addEventListener('touchcancel',()=>{cancel();pointers.clear();},{passive:true});
 // A swipe starting on a balance/story button must not also activate it. A new
 // pointerdown clears this guard, so the next intentional tap never has to wait.
 app?.addEventListener('click',event=>{
  const blocked=blockedClick;
  if(!blocked||time()>blocked.until){blockedClick=null;return;}
  if(event.detail===0)return; // Keyboard and assistive-technology activation.
  const samePointer=Number.isFinite(event.pointerId)&&blocked.pointerId!==null&&event.pointerId===blocked.pointerId;
  const samePoint=Number.isFinite(event.clientX)&&Number.isFinite(event.clientY)&&Math.abs(event.clientX-blocked.x)<=48&&Math.abs(event.clientY-blocked.y)<=48;
  if(!samePointer&&!samePoint)return;
  blockedClick=null;event.preventDefault();event.stopImmediatePropagation();
 },true);
 window.addEventListener?.('blur',()=>{cancel();pointers.clear();blockedClick=null;});
 document.addEventListener?.('visibilitychange',()=>{if(document.hidden){cancel();pointers.clear();blockedClick=null;}});
 sync();
})();
