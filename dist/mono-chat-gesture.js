/* Monochrome: Ask Lumo is available from either horizontal direction.
   The shared controller's documented opt-out prevents two recognizers from
   handling one touch. This adapter never handles tasks or authorisation. */
(()=>{
'use strict';
if(!window.L||L.monoChatGesture)return;
const app=document.getElementById('app');if(!app)return;
const roots=new Set(['home','plan','pay','more','cardsHome','moneyStoryHome']);
const labels={home:'Home',plan:'Plan',pay:'Payments',more:'Menu',cardsHome:'Cards',moneyStoryHome:'Money Story'};
const clone=value=>{try{return JSON.parse(JSON.stringify(value||{}));}catch{return {};}};
const signedIn=()=>!!L.state.onboarded&&!L.state.locked&&!L.state.closed;
const ordinary=()=>signedIn()&&!L.taskSheet?.active&&!document.querySelector('.task-sheet-layer')&&!L.contextualChat?.current?.()&&!L.budgetGuide?.active?.();
const available=()=>ordinary()&&!document.hidden&&(roots.has(L.route)||L.route==='chat');
let account=L.state,origin=null,pendingReturn=null;
const checkAccount=()=>{if(account!==L.state){account=L.state;origin=null;pendingReturn=null;}};
const before=L.beforeNavigate;
L.beforeNavigate=function(route,...args){
 checkAccount();
 if(route==='chat'&&roots.has(L.route)&&ordinary())origin={account:L.state,route:L.route,params:clone(L.params),scroll:document.getElementById('view')?.scrollTop||0};
 return before?.call(this,route,...args);
};
const close=L.closeBankingChat;
L.closeBankingChat=function(...args){
 checkAccount();
 if(L.route==='chat'&&ordinary()&&origin?.account===L.state&&roots.has(origin.route)){
  // Restore scope before the existing tab renderer runs, and let its normal
  // history write record that scope. No extra render or history entry.
  pendingReturn=origin;
  try{return L.openTab(origin.route);}finally{pendingReturn=null;}
 }
 return close?.apply(this,args);
};
const render=L.render;
L.render=function(...args){
 checkAccount();
 const returning=pendingReturn&&pendingReturn.account===L.state&&L.route===pendingReturn.route&&ordinary()?pendingReturn:null;
 if(returning)L.params=clone(returning.params);
 const result=render.apply(this,args);
 if(returning&&L.route===returning.route){const view=document.getElementById('view');if(view)view.scrollTop=returning.scroll;}
 if(L.route==='chat'&&ordinary()&&origin?.account===L.state)document.querySelector('.hibiscus-chat-app-return')?.setAttribute('aria-label','Back to '+labels[origin.route]);
 return result;
};
// The shared recognizer explicitly excludes ancestors with data-no-swipe.
// Our own exclusions inspect only descendants, retaining nested opt-outs.
app.setAttribute('data-no-swipe','monochrome-chat-controller');
let gesture=null,blockedClick=null,multi=false;
const pointers=new Set(),time=()=>window.performance?.now?.()??Date.now();
const selected=()=>!!window.getSelection?.()?.toString?.();
const excluded='input,select,textarea,summary,label,form,[contenteditable],[data-no-swipe],[role="slider"],[role="tablist"],[aria-orientation="horizontal"],#nav,#lumo-scan-qr,.chat-banking-header,.chat-entry,.chat-tools,.home-header-actions,.hibiscus-root-header,.hibiscus-tab-header,.balance-eye,.ms-chart,.ms-periods,.ms-breakdown-tabs,canvas,video,audio';
function canSwipe(target){
 if(!available()||selected()||!app.contains(target))return false;
 // Home and the ordinary planning/payment roots contain large navigation
 // cards. A deliberate drag on those cards navigates; a tap keeps its action.
 // Story, Cards and Chat controls manage their own filters or conversation.
 if(['cardsHome','moneyStoryHome','chat'].includes(L.route)&&target.closest?.('button,a,[role="button"]'))return false;
 for(let node=target;node&&node!==app;node=node.parentElement){
  if(node.matches?.(excluded))return false;
  if(Number(node.scrollWidth)>Number(node.clientWidth)+1)return false;
 }
 return true;
}
const release=g=>{if(g?.kind==='pointer')try{if(app.hasPointerCapture?.(g.id))app.releasePointerCapture(g.id);}catch{}};
const cancel=()=>{const g=gesture;gesture=null;release(g);};
const reset=()=>{cancel();pointers.clear();multi=false;blockedClick=null;};
function start(target,x,y,id,kind,event){
 cancel();blockedClick=null;
 if(multi||event.defaultPrevented||!canSwipe(target)||!Number.isFinite(x)||!Number.isFinite(y)||x<=18||x>=window.innerWidth-18)return;
 gesture={target,x,y,lastX:x,lastY:y,id,kind,route:L.route,account:L.state,started:time(),axis:null};
}
const suppress=g=>{blockedClick={x:g.lastX,y:g.lastY,pointerId:g.kind==='pointer'?g.id:null,until:time()+650};};
const stillValid=g=>available()&&g.route===L.route&&g.account===L.state&&g.target.isConnected!==false&&!selected()&&time()-g.started<=1800;
function move(x,y,id,kind,event){
 const g=gesture;if(!g||g.id!==id||g.kind!==kind)return;
 if((kind==='touch'&&event.cancelable===false)||event.defaultPrevented||!stillValid(g)||!Number.isFinite(x)||!Number.isFinite(y)){cancel();return;}
 g.lastX=x;g.lastY=y;const dx=x-g.x,dy=y-g.y,ax=Math.abs(dx),ay=Math.abs(dy);
 if(g.axis===null){
  if(ay>=12&&ay>=ax){cancel();return;}
  if(ax<12||ax<ay*1.35)return;
  g.axis='horizontal';
  if(kind==='pointer')try{app.setPointerCapture?.(id);}catch{}
 }
 if(g.axis==='horizontal'){suppress(g);if(event.cancelable)event.preventDefault();}
}
function finish(x,y,id,kind){
 const g=gesture;if(!g||g.id!==id||g.kind!==kind)return;
 gesture=null;release(g);
 if(!stillValid(g))return;
 const dx=x-g.x,dy=y-g.y;if(!Number.isFinite(dx)||!Number.isFinite(dy))return;
 if(g.axis==='horizontal'){g.lastX=x;g.lastY=y;suppress(g);}
 if(g.axis!=='horizontal'||Math.abs(dx)<56||Math.abs(dx)<Math.abs(dy)*1.35)return;
 if(roots.has(g.route))L.openBankingChat();else if(g.route==='chat')L.closeBankingChat();
}
app.addEventListener('pointerdown',event=>{
 blockedClick=null;
 if(!['touch','pen'].includes(event.pointerType)||event.button>0)return;
 pointers.add(event.pointerId);
 if(pointers.size>1||event.isPrimary===false){multi=true;cancel();return;}
 start(event.target,event.clientX,event.clientY,event.pointerId,'pointer',event);
},{passive:true});
app.addEventListener('pointermove',event=>move(event.clientX,event.clientY,event.pointerId,'pointer',event),{passive:false});
app.addEventListener('pointerup',event=>{pointers.delete(event.pointerId);if(!pointers.size){if(!multi)finish(event.clientX,event.clientY,event.pointerId,'pointer');multi=false;}},{passive:true});
app.addEventListener('pointercancel',event=>{pointers.delete(event.pointerId);if(gesture?.kind==='pointer'&&gesture.id===event.pointerId)cancel();if(!pointers.size)multi=false;},{passive:true});
app.addEventListener('lostpointercapture',event=>{if(gesture?.kind==='pointer'&&gesture.id===event.pointerId)cancel();},{passive:true});
app.addEventListener('touchstart',event=>{
 blockedClick=null;
 if(event.touches.length!==1){multi=true;cancel();return;}
 const p=event.touches[0];start(event.target,p.clientX,p.clientY,p.identifier,'touch',event);
},{passive:true});
app.addEventListener('touchmove',event=>{if(event.touches.length!==1){multi=true;cancel();return;}const p=event.touches[0];move(p.clientX,p.clientY,p.identifier,'touch',event);},{passive:false});
app.addEventListener('touchend',event=>{
 if(event.touches.length||event.changedTouches.length!==1){cancel();return;}
 const p=event.changedTouches[0];if(!multi)finish(p.clientX,p.clientY,p.identifier,'touch');multi=false;
},{passive:true});
app.addEventListener('touchcancel',reset,{passive:true});
app.addEventListener('click',event=>{
 const blocked=blockedClick;if(!blocked||time()>blocked.until){blockedClick=null;return;}
 if(event.detail===0)return;
 const samePointer=Number.isFinite(event.pointerId)&&blocked.pointerId!==null&&event.pointerId===blocked.pointerId;
 const samePoint=Number.isFinite(event.clientX)&&Number.isFinite(event.clientY)&&Math.abs(event.clientX-blocked.x)<=48&&Math.abs(event.clientY-blocked.y)<=48;
 if(!samePointer&&!samePoint)return;
 blockedClick=null;event.preventDefault();event.stopImmediatePropagation();
},true);
window.addEventListener?.('blur',reset);
document.addEventListener?.('visibilitychange',()=>{if(document.hidden)reset();});
L.monoChatGesture=Object.freeze({version:1,available});
})();
