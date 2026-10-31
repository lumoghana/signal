/* Signal page presentation over the existing guarded navigation controller.
   No financial, draft, authentication or browser-history rule is replaced. */
(()=>{
'use strict';
if(!window.L||!L.signalEdition||L.signalNavigation)return;
const choices=Object.freeze(['addMoney','chatBankingActions','chatBankingChoice','chatBankingReplace','paymentCancel','paymentPlanLink','requestConfirm','actionConfirm','monoGroupDraftReplace','categoryEdit','moneySourceRemove','budgetDelete','chatExpectedDate','everydayRepeatChoice']);
const choiceSet=new Set(choices),boundHeaders=new WeakSet(),frames=new WeakMap();
const accessRoutes=new Set('welcome samplePause setupChoice phone otp identity livecheck identityResult campus campusStatus campusInterest campusInterestSaved pilotUnavailable pin confirmPin accountReview applicationStatus applicationCorrection accountReady setupProgress signin recovery recoveryReplacement recoveryOwnership recoveryStatus privacyNotice ambassadorWelcome ambassadorSample ambassadorReset sampleConfirm resetConfirm'.split(' '));
const primaryRoots=new Set(['home','chat','more','pay','plan','moneyStoryHome','cardsHome']);
const nativePages=new Set('activity ambassadorGuide merchant merchantApply merchantCollect merchantCollection merchantDestination merchantPayer merchantSales pauseDemo pauseLog settlementDetail settlements story testing'.split(' '));
const paymentPages=new Set([...L.taskSheet.coverage.families.payment,'virtualCardAuthorize','collectionPayoutRail']);
const retainedNavigation=new WeakMap();
let session=null,pending=null,globalChatReturn=null,navigating=0,leaving=0;
const allowed=()=>!!L.state.onboarded&&!L.state.locked&&!L.state.closed;
const blocked=()=>!!L.persistence?.status?.()?.blocked;
const hasGlobalNavigation=(route=L.route)=>allowed()&&!accessRoutes.has(route)&&route!=='monoMenu'&&!L.contextualChat?.current?.()&&!L.budgetGuide?.active?.();
const surfaceFor=route=>route==='monoMenu'?'drawer':choiceSet.has(route)?'sheet':'page';
const currentLayer=()=>L.taskSheet?.active?document.querySelector('.task-sheet-layer'):null;
function clearPending(){pending=null;}
function clearSensitiveFields(){
 for(const field of document.getElementById('view')?.querySelectorAll('input')||[])if(field.type==='password'||/pin|otp|verification|password/i.test(field.id||'')){field.value='';field.removeAttribute?.('value');}
}
function validPending(ticket=pending){
 return !!ticket&&ticket===pending&&ticket.account===L.state&&allowed()&&!blocked()&&(!ticket.layer||!currentLayer()||ticket.layer===currentLayer())&&(!L.state.paymentDraft||L.state.paymentDraft.id===ticket.draft);
}
function completeDestination(ticket,approved=false){
 if(!validPending(ticket)){clearPending();return;}
 // A successful explicit Keep/Discard is the only authority to finish a
 // still-mounted specialized collection payment without asking twice.
 if(L.taskSheet?.active&&!approved)return;
 clearPending();navigating++;
 try{
  const exit=ticket.exit;
  if(L.taskSheet?.active)L.go(exit);
  else if(L.route!==exit)L.openTab(exit);
  // Calls use the native asynchronous close queue. The global Chat entry
  // owns a Home return, independently of an older contextual Chat origin.
  if(ticket.target==='chat'){globalChatReturn={account:L.state,entered:false};L.openBankingChat();}
  else if(ticket.target==='menu')L.go('monoMenu');
 }finally{navigating--;}
}
function navigate(target){
 if(!['home','chat','menu'].includes(target)||!hasGlobalNavigation())return false;
 if(blocked()){clearPending();return false;}
 globalChatReturn=null;clearSensitiveFields();
 const existing=currentLayer(),base=L.taskSheet?.parentRoute;
 // Menu opened on an ordinary page retains that page. An active journey
 // first leaves through its native guard and then opens Menu on its root.
 if(target==='menu'&&!existing&&(primaryRoots.has(L.route)||nativePages.has(L.route))&&!(paymentPages.has(L.route)&&L.state.paymentDraft&&!L.state.paymentDraft.submittedTxId)){clearPending();L.openMonoMenu();return true;}
 const ticket={target,account:L.state,layer:existing,draft:L.state.paymentDraft?.id,exit:target==='menu'&&primaryRoots.has(base)?base:'home'};
 pending=ticket;navigating++;
 try{
  // A restored financial page can exist without a task. Mount its native
  // cancellation decision before navigating, rather than skipping its draft.
  if(!L.taskSheet?.active&&paymentPages.has(L.route)&&L.state.paymentDraft&&!L.state.paymentDraft.submittedTxId){
   ticket.standalone=true;L.leavePayment();ticket.layer=currentLayer();
   if(!L.taskSheet?.active&&L.route==='paymentCancel')return true;
  }
  const wasFunding=L.taskSheet?.kind==='funding';
  L.openTab(ticket.exit);
  // A nested top-up returns to its payment review first. That return must
  // still pass through the ordinary payment-draft exit decision.
  if(wasFunding&&L.taskSheet?.active&&L.taskSheet.kind!=='funding'&&L.route!=='paymentCancel')L.openTab(ticket.exit);
  if(!L.taskSheet?.active)completeDestination(ticket);
  else if(L.route!=='paymentCancel')clearPending();
 }finally{navigating--;}
 return true;
}
function closePage(destination){
 if(L.taskSheet?.active)return L.closeTask();
 if(!hasGlobalNavigation())return;
 if(destination==='chat')return navigate('chat');
 L.back();
}
function footer(dialog,show){
 let nav=dialog.querySelector('.signal-page-nav');
 if(!nav&&show){
  nav=document.createElement('nav');nav.className='signal-page-nav';nav.setAttribute('aria-label','Main navigation');
  const menu='<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" aria-hidden="true"><path d="M4 6h16M4 12h16M4 18h16"/></svg>';
  for(const [target,label,icon]of [['home','Home',L.icon('home',24)],['chat','Ask Lumo',L.icon('chat',24)],['menu','Menu',menu]]){
   const button=document.createElement('button');button.type='button';button.className='nav-item';button.setAttribute('data-signal-destination',target);
   button.innerHTML=icon+'<span>'+label+'</span>';button.addEventListener('click',()=>navigate(target));
   if(target==='menu'){button.setAttribute('aria-haspopup','dialog');button.setAttribute('aria-expanded','false');}
   nav.append(button);
  }
  dialog.append(nav);
 }
 if(nav){nav.hidden=!show;for(const button of nav.querySelectorAll('.nav-item')){
  const selected=button.getAttribute('data-signal-destination')==='menu';button.classList.toggle('active',selected);
  if(selected)button.setAttribute('aria-current','page');else button.removeAttribute('aria-current');
 }}
}
function ordinaryNavigation(){
 const nav=document.getElementById('nav'),view=document.getElementById('view');if(!nav||!view)return;
 if(!hasGlobalNavigation())return;
 // The shared renderer paints five legacy tabs on native non-root pages,
 // before the original three-tab adapter returns early. Restore the exact
 // retained Signal controls, including their focus and native Menu identity.
 let controls=retainedNavigation.get(nav);
 if(primaryRoots.has(L.route)&&nav.children.length===3){controls=[...nav.children];retainedNavigation.set(nav,controls);}
 if(!controls&&nav.children.length>=5){
  controls=[nav.children[0],nav.children[2],nav.children[4]];retainedNavigation.set(nav,controls);
  controls[0].innerHTML=L.icon('home',24)+'<span>Home</span>';
  controls[1].innerHTML=L.icon('chat',24)+'<span>Ask Lumo</span>';controls[1].setAttribute('data-signal-chat','true');
  controls[2].innerHTML='<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" aria-hidden="true"><path d="M4 6h16M4 12h16M4 18h16"/></svg><span>Menu</span>';
  controls[2].setAttribute('aria-haspopup','dialog');controls[2].setAttribute('aria-expanded','false');
  nav.classList.add('mono-primary-nav');nav.setAttribute('aria-label','Main navigation');
 }
 if(controls&&(nav.children.length!==3||controls.some((button,index)=>nav.children[index]!==button)))nav.replaceChildren(...controls);
 if(controls){
  const selected=L.route==='home'?0:L.route==='chat'?1:2;
  const targets=['home','chat','menu'],rootActions=["L.openTab('home')",'L.openBankingChat()','L.openMonoMenu()'];
  for(let i=0;i<controls.length;i++){
   const button=controls[i];button.classList.toggle('active',i===selected);
   if(i===selected)button.setAttribute('aria-current','page');else button.removeAttribute('aria-current');
   button.setAttribute('onclick',primaryRoots.has(L.route)?rootActions[i]:"L.signalNavigation.navigate('"+targets[i]+"')");
  }
  controls[1].setAttribute('title','Ask Lumo · Your money companion');
  controls[2].setAttribute('aria-haspopup','dialog');controls[2].setAttribute('aria-expanded','false');controls[2].removeAttribute('aria-controls');
 }
 // The public parent registration also makes Menu and nested tasks work on
 // restored pages and native records such as Activity, not just seven tabs.
 const title=view.querySelector('h1')?.textContent?.trim()||L.route.replace(/([a-z])([A-Z])/g,'$1 $2');
 if(nativePages.has(L.route)&&typeof L.views[L.route]==='function')L.taskSheet.registerParent(L.route,title||'Previous page');
 nav.hidden=false;
 for(const button of view.querySelectorAll('button[onclick]')){
  const action=(button.getAttribute('onclick')||'').replace(/\s/g,'').replace(/;$/,'');
  if(action==='L.closeTask()'||action==='L.closeTask?L.closeTask():L.back()'){
   const chat=/back to (?:the )?conversation|back to (?:ask )?lumo/i.test(button.textContent);
   button.setAttribute('onclick',chat?"L.signalNavigation.closePage('chat')":'L.signalNavigation.closePage()');
  }
 }
}
function wrapLeave(owner,name){
 const original=owner?.[name];if(typeof original!=='function')return;
 const wrapped=function(...args){
  const ticket=pending,from=L.route,layer=currentLayer();leaving++;
  let result;try{result=original.apply(this,args);}finally{leaving--;}
  if(from==='paymentCancel'&&(layer||ticket?.standalone)&&ticket===pending&&L.route!=='paymentCancel'&&validPending(ticket))completeDestination(ticket,true);
  return result;
 };
 if(Object.isFrozen(owner))return wrapped;
 owner[name]=wrapped;
}
for(const name of ['keepPaymentLater','discardPayment'])wrapLeave(L,name);
wrapLeave(L.collectionContributionUI,'leave');
if(L.collectionPayoutRails){
 const wrapped=wrapLeave(L.collectionPayoutRails,'leave');
 if(wrapped){const descriptors=Object.getOwnPropertyDescriptors(L.collectionPayoutRails);descriptors.leave={...descriptors.leave,value:wrapped};L.collectionPayoutRails=Object.freeze(Object.create(Object.getPrototypeOf(L.collectionPayoutRails),descriptors));}
}
const openMenu=L.openMonoMenu;
L.openMonoMenu=function(...args){
 if(!hasGlobalNavigation())return openMenu?.apply(this,args);
 if(L.taskSheet?.active)return navigate('menu');
 if(paymentPages.has(L.route)&&L.state.paymentDraft&&!L.state.paymentDraft.submittedTxId)return navigate('menu');
 if(primaryRoots.has(L.route))return openMenu?.apply(this,args);
 if(!nativePages.has(L.route))return navigate('menu');
 L.go('monoMenu');return true;
};
const closeChat=L.closeBankingChat;
L.closeBankingChat=function(...args){
 if(globalChatReturn?.account===L.state&&allowed()&&L.route==='chat'&&!L.taskSheet?.active){globalChatReturn=null;return L.openTab('home');}
 return closeChat?.apply(this,args);
};
function measure(layer=currentLayer()){
 if(!layer||layer.getAttribute('data-signal-surface')!=='page')return;
 const app=document.getElementById('app'),rect=app?.getBoundingClientRect?.(),vv=window.visualViewport;
 const viewportTop=Number(vv?.offsetTop)||0,viewportHeight=Number(vv?.height)||window.innerHeight||800;
 const top=rect&&rect.height>0?Math.max(rect.top,viewportTop):viewportTop;
 const bottom=rect&&rect.height>0?Math.min(rect.bottom,viewportTop+viewportHeight):viewportTop+viewportHeight;
 const values={'--signal-page-top':top+'px','--signal-page-left':(rect?.left||0)+'px','--signal-page-width':(rect?.width||window.innerWidth||390)+'px','--signal-page-height':Math.max(0,bottom-top)+'px'};
 const old=frames.get(layer)||{};
 for(const [name,value]of Object.entries(values))if(old[name]!==value)layer.style?.setProperty?.(name,value);
 frames.set(layer,values);
}
function headerGuard(header,layer){
 if(!header||boundHeaders.has(header))return;
 boundHeaders.add(header);
 // A page header has no drag-to-dismiss gesture. Interactive controls keep
 // their normal pointer, focus, QR and help behavior.
 const guard=event=>{
  if(layer.getAttribute('data-signal-surface')!=='page'||event.target?.closest?.('button,input,select,textarea,a,summary,label,[role="button"],[contenteditable]'))return;
  event.stopImmediatePropagation?.();
 };
 for(const type of ['pointerdown','pointermove','pointerup','pointercancel','lostpointercapture'])header.addEventListener(type,guard,true);
}
function sync(){
 const layer=currentLayer(),app=document.getElementById('app');
 if(globalChatReturn){
  if(globalChatReturn.account!==L.state||!allowed())globalChatReturn=null;
  else if(L.route==='chat'&&!layer){globalChatReturn.entered=true;for(const button of document.querySelectorAll('.hibiscus-chat-app-return,.chat-banking-back'))button.setAttribute('aria-label','Back to Home');}
  else if(globalChatReturn.entered&&!layer)globalChatReturn=null;
 }
 if(pending&&(!validPending()||!navigating&&!leaving&&L.route!=='paymentCancel'))clearPending();
 if(!layer){session=null;app?.removeAttribute?.('data-signal-surface');document.body?.removeAttribute?.('data-signal-surface');ordinaryNavigation();return;}
 if(session?.layer!==layer)session={layer,pageVisited:false,rootChoices:new Set()};
 const route=L.taskSheet.step||L.route,dialog=layer.querySelector('.task-sheet');if(!dialog)return;
 const proposed=surfaceFor(route),history=window.history?.state?.taskSheet;
 const depth=history?.id===layer.getAttribute('data-task-id')?history.depth:(L.history?.length||0);
 const key=[route,depth,L.params?.id||'',L.params?.kind||'',L.params?.reference||''].join('|');
 let surface=proposed;
 // The native controller retains its original primary page. A new choice
 // after a page step stays in-page, so it cannot expose an unrelated Home
 // behind a popup. Root-launched choices retain their real root context,
 // including when Back returns from a subsequent full-page form.
 if(surface==='sheet'){
  const wholePage=!!dialog.querySelector('.pay-tabs,.signal-home,.chat-workspace,.qr-hub,.onboarding-page');
  if(wholePage||session.pageVisited&&!session.rootChoices.has(key))surface='page';
  else session.rootChoices.add(key);
 }
 if(surface==='page')session.pageVisited=true;
 layer.setAttribute('data-signal-surface',surface);dialog.setAttribute('data-signal-surface',surface);
 app?.setAttribute?.('data-signal-surface',surface);document.body?.setAttribute?.('data-signal-surface',surface);
 const page=surface==='page',header=layer.querySelector('.task-sheet-chrome');
 if(surface!=='drawer'){
  dialog.setAttribute('role',page?'region':'dialog');
  if(page)dialog.removeAttribute('aria-modal');else dialog.setAttribute('aria-modal','true');
  const backdrop=layer.querySelector('.task-sheet-backdrop'),grab=layer.querySelector('.task-sheet-grab'),close=layer.querySelector('.task-sheet-close');
  for(const node of [backdrop,grab,close])if(node)node.hidden=page;
  if(page){
   layer.classList?.remove('is-dragging');dialog.style?.setProperty?.('--task-drag-y','0px');
   // These are legacy whole-sheet dismissals, not financial Cancel/Done
   // actions. A real page already has the native Back control in its header.
   for(const button of dialog.querySelectorAll('.task-sheet-body button'))if((button.getAttribute('onclick')||'').includes('L.closeTask')&&button.textContent.trim()==='Close'){
    button.setAttribute('data-signal-page-dismiss','true');button.hidden=true;
   }
  }
 }
 if(surface==='drawer'){
  const menu=document.getElementById('nav')?.querySelectorAll('.nav-item')?.[2];
  if(menu){menu.setAttribute('aria-expanded','true');menu.setAttribute('aria-controls','mono-menu-dialog');}
 }
 footer(dialog,page&&hasGlobalNavigation());
 headerGuard(header,layer);measure(layer);
}
const render=L.render;
L.render=function(...args){const result=render.apply(this,args);sync();return result;};
// Task completion can call a captured renderer, then this public hook. Keep
// the page/body state clean on Done, browser Back and native Menu dismissal.
const chatSync=L.syncChatBanking;
if(chatSync)L.syncChatBanking=function(...args){const result=chatSync.apply(this,args);sync();return result;};
for(const name of ['go','back','openTab','closeTask']){
 const original=L[name];if(typeof original!=='function')continue;
 L[name]=function(...args){
  if(pending&&!navigating&&!leaving&&(name!=='go'||args[0]!=='paymentCancel'))clearPending();
  const explicitParent=name==='go'&&L.taskSheet?.active&&nativePages.has(args[0])&&L.taskSheet.parentRoute===args[0]&&args[1]&&Object.keys(args[1]).length?{route:args[0],params:JSON.parse(JSON.stringify(args[1]))}:null;
  const result=original.apply(this,args);
  // A deliberate destination scope (for example a card's Activity) replaces
  // an old parent filter. Back/Close without parameters still restores it.
  if(explicitParent&&!L.taskSheet?.active&&JSON.stringify(L.params)!==JSON.stringify(explicitParent.params))L.go(explicitParent.route,explicitParent.params);
  sync();return result;
 };
}
window.addEventListener?.('keydown',event=>{
 const layer=currentLayer();if(!layer||layer.getAttribute('data-signal-surface')!=='page'||event.defaultPrevented)return;
 const recovery=document.getElementById('persistence-recovery');
 if(recovery&&!recovery.hidden)return;
 const target=event.target,external=target?.closest?.('[role="dialog"],[role="alertdialog"]');
 if(external&&!layer.contains(external))return;
 if(event.key==='Tab'){
  // Keep the browser's normal tab order. The native modal focus loop is
  // appropriate only for the short sheets and the Menu drawer.
  event.stopImmediatePropagation?.();return;
 }
 if(event.key==='Escape'){
  // Native QR owns its earlier camera/return handler. Native select pickers
  // close themselves; neither should become a whole-journey dismissal.
  if(layer.querySelector('.qr-hub'))return;
  event.stopImmediatePropagation?.();
  if(target?.closest?.('select,[role="combobox"],[role="listbox"]'))return;
  event.preventDefault?.();L.back();
 }
},true);
window.addEventListener?.('resize',()=>measure());window.visualViewport?.addEventListener?.('resize',()=>measure());window.visualViewport?.addEventListener?.('scroll',()=>measure());
L.signalNavigation=Object.freeze({sheetCandidates:choices,surfaceFor,hasGlobalNavigation,navigate,closePage,sync,get surface(){return currentLayer()?.getAttribute('data-signal-surface')||'page';}});
sync();
})();
