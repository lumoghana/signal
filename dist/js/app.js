import {appearanceRow,openAppearance} from './appearance-ui.js';
import {createDemoState,createEmptyState,getSummary,applyAction,migrateState,validStoredState,STORAGE_KEY} from './model.js';
import {esc,cash,icon,categorySymbol,pageHead,row,field,btn,empty,progress,dateLabel} from './ui.js';
import {renderPayments,bindPayments,openFunding,readPaymentLink,cancelRecipientEditOnExit,isCompletedPayment} from './payments.js';
import {renderHome,bindHome,renderHomeAccounts} from './home-view.js';
import {renderWelcome} from './welcome-view.js';
import {renderSetupTerms,bindSetupTerms} from './setup-terms.js';
import {hasAcceptedSetupTerms,acceptSetupTerms} from './setup-terms-model.js';
import {bindExplore} from './explore-playback.js';
import {renderActivity,bindActivity} from './activity-view.js';
import {renderAccount,bindAccount,accountSettingsRows,bindAccountSettings,openBiometricAuth} from './account-ui.js';
import {accountAccess} from './account-model.js';
import {createPersistence,attachPersistenceEvents,renderPersistenceRecovery,bindPersistenceRecovery} from './persistence.js';
import {commitAction,reconcileState} from './state-boundary.js';
import {registerOfflineShell,updateOfflineBanner} from './offline-shell.js';
import {renderInsights,bindInsights} from './insights.js';
import {renderPlanning,bindPlanning,afterPlanning,openBoxFunding} from './planning.js';
import {renderLife,bindLife} from './life.js';
import {renderChat,bindChat} from './chat.js';
import {renderLearning,bindLearning,renderLearningEntry} from './learning-ui.js';
import {renderContextLearning,bindContextLearning} from './learning-entry.js';
import {renderGroupChat,bindGroupChat} from './group-chat.js';
import {routeKey,routeLabel,sectionForRoute,parentRoute,safeRoute,chatReturnRoute} from './navigation.js';
import {bindChatGestures,canOpenChatBySwipe} from './chat-gestures.js';
import {createRouter} from './router.js';
import {renderOnboarding,bindOnboarding,clearOnboardingMedia} from './onboarding.js';
import {renderActivation,bindActivation} from './activation.js';
import {renderTour,bindTour} from './tour.js';
import {createTourDraft,normalizeTourDraft,loadTourRecord,saveTourRecord,shouldOfferTour} from './tour-model.js';
import {createActivationDraft,restoreActivationDraft,completeActivation as finishActivation,deferActivationFunding} from './activation-model.js';
import {ONBOARDING_SCHEMA,createOnboardingDraft,normalizeOnboardingDraft,persistableOnboardingDraft,safeOnboardingStep,buildOnboardingState,resetCameraCaptures} from './onboarding-model.js';

const persistence=createPersistence({key:STORAGE_KEY,validate:validStoredState,empty:createEmptyState,migrate:migrateState});
const opened=persistence.load();
let state=opened.state||createEmptyState(), route=state.onboardingDone?{section:'home',page:'home'}:{section:'welcome'}, cleanup=null, toastTimer=null, overlayCleanup=null, router=null, captureCurrent=null, overlayMeta=null, pendingPageNavigation=false, pendingModalPop=false, lastRenderedKey='';
let tourRecord=loadTourRecord();
const draft={}, view=document.querySelector('#view'), shell=document.querySelector('#shell'), app=document.querySelector('#app'), overlays=document.querySelector('#overlay-root');
const daysFromNow=n=>new Date(Date.now()+n*86400000).toISOString().slice(0,10);
const firstName=()=>state.profile.name.split(' ')[0]||'friend';
const rootRoutes=['home','activity','pay','boxes','plan','groups'];
const isRoot=()=>rootRoutes.includes(route.section)&&(!route.page||route.page==='home')||route.section==='life'&&route.page==='groups';
const ctx={get state(){return state},get route(){return route},draft,$:s=>view.querySelector(s),$$:s=>[...view.querySelectorAll(s)],go,back,openChat,returnToApp,finish:next=>go(next,{finish:true}),saveDraft:persistSession,setCapture:fn=>{captureCurrent=typeof fn==='function'?fn:null;},refresh:render,toast,sheet,closeSheet,auth,celebrate,act,reset,signOut,completeOnboarding:completeSignup,exitOnboarding:exitSignup,startOnboardingPreview:startSignupPreview,completeActivation:completeAccountActivation,deferActivationFunding:()=>completeAccountActivation({waitForFunding:true}),exitActivation:exitAccountActivation,startTour,finishTour,installLoadedState,completeSetupTerms,exitSetupTerms};

function installLoadedState(saved){closeSheet();reconcileState(state,saved);route=safeRoute(route,state,draft);render();}
function act(type,payload={}){
  const result=commitAction({state,type,payload,apply:applyAction,persistence});
  if(result.ok&&(((type==='learningPreferences'||type==='learningEnroll')&&payload.personalised===false)||(type==='accountPrivacy'&&payload.preference==='personalisation'&&payload.enabled===false))){delete draft.learning;delete draft.learningUI;delete draft.learningReturnTo;delete draft.moneyIQ;delete draft.moneyIQUI;persistSession();}
  if(result.persistenceFailure){toast(result.message);queueMicrotask(()=>{closeSheet();render();});}
  return result;
}
function canonicalRoot(next){
  if(next.section==='life'&&next.page.startsWith('group'))return {section:'life',page:'groups'};
  if(next.section==='life'&&next.page.startsWith('iou')){const x=state.ious.find(i=>i.id===next.id);return {section:'life',page:'ious',filter:x?.type||next.filter||draft.iouCreate?.type||'owedToMe'};}
  if(next.section==='pay'&&next.page==='fund-status')return draft.fundingReturnTo||next.backTo||{section:'home',page:'home'};
  if(next.section==='learn')return {section:'learn',page:'home'};
  if(['home','activity','pay','boxes','plan'].includes(next.section))return {section:next.section,page:'home'};
  return {section:'home',page:'home'};
}
function captureBeforeLeave(){
  captureCurrent?.();
  if(route.section==='life'&&route.page==='recovery'){const el=view.querySelector('[name="recoveryDate"]');if(el)draft.recovery={...(draft.recovery||{}),nextDate:el.value};}
  router?.setScroll(view.scrollTop);persistSession();
}
function prepareDestination(next){
  if(next.section==='learn')delete draft.learningReturnTo;
  if(next.section==='boxes'&&next.page==='create'&&!draft.box)draft.box={name:'',emoji:'✨',target:0,balance:0,deadline:daysFromNow(90)};
  if(next.section==='plan'&&next.page==='create'&&!draft.plan)draft.plan={items:[],item:{}};
  if(next.section==='chat'){const origin=next.returnTo||(route.section==='chat'?route.returnTo||draft.chatReturnTo:route);const returnTo=chatReturnRoute({section:'chat',returnTo:origin},state,draft);draft.chatReturnTo=returnTo;next={...next,returnTo};}
  if(next.section==='pay'&&next.page==='transaction'&&!next.returnTo)next={...next,returnTo:route.section==='pay'&&['review','pause','amount'].includes(route.page)?{section:'pay',page:'home'}:{...route}};
  return next;
}
function makeRouter(saved){return createRouter({initialRoute:route,saved,history:window.history,normalize:r=>safeRoute(r,state,draft),parent:r=>parentRoute(r,state,draft),key:routeKey,rootFor:canonicalRoot,onNavigate:(next,meta={})=>{pendingPageNavigation=false;captureCurrent=null;route=next;render({scroll:meta.scroll??0});focusView();}});}
function go(next,options={}){if(route.section==='home'&&next.section!=='home')draft.homeMovesOpen=false;captureBeforeLeave();captureCurrent=null;cancelRecipientEditOnExit(draft,route,next);pendingPageNavigation=true;closeSheet();router.go(prepareDestination({...next}),options);}
function back(){if(overlayMeta){userCloseSheet();return;}captureBeforeLeave();captureCurrent=null;cancelRecipientEditOnExit(draft,route,parentRoute(route,state,draft));pendingPageNavigation=true;router.back();}
function openChat(){if(!state.onboardingDone||route.section==='chat')return;go({section:'chat',page:'home',returnTo:{...route}});}
function returnToApp(){if(route.section!=='chat')return;go(chatReturnRoute(route,state,draft),{replace:true});}
function focusView(){if(overlayMeta)return;const heading=view.querySelector('h1,h2');if(heading){heading.tabIndex=-1;heading.focus({preventScroll:true});}else view.focus({preventScroll:true});}
function persistSession(){try{const savedDraft={...draft};if(draft.onboarding)savedDraft.onboarding=persistableOnboardingDraft(draft.onboarding);sessionStorage.setItem('lumo-session-v1',JSON.stringify({route,draft:savedDraft,navigation:router?.snapshot()}));}catch{}}
function reset({demo=false,persistenceReset=false}={}){const candidate=demo?createDemoState():createEmptyState();const saved=persistence.reset(candidate);if(!saved.ok){toast(saved.message);render();return;}clearOnboardingMedia(draft.onboarding);pendingPageNavigation=true;captureCurrent=null;closeSheet();clearTimeout(toastTimer);document.querySelector('#toast').textContent='';document.querySelector('#toast').classList.remove('visible');for(const key of Object.keys(draft))delete draft[key];state=saved.state;route=demo?(readPaymentLink(ctx)||{section:'home',page:'home'}):{section:'welcome'};router=makeRouter();router.initialise();}
function signOut(){
  const result=act('accountSignOut');
  if(!result.ok){toast(result.message);return;}
  cleanup?.();cleanup=null;clearOnboardingMedia(draft.onboarding);captureCurrent=null;
  pendingPageNavigation=true;closeSheet();
  for(const key of Object.keys(draft))delete draft[key];
  try{sessionStorage.removeItem('lumo-session-v1');}catch{}
  route={section:'life',page:'account-access'};
  router=makeRouter();router.initialise();focusView();
}
function toast(message){const el=document.querySelector('#toast');clearTimeout(toastTimer);el.textContent=message;el.classList.add('visible');toastTimer=setTimeout(()=>el.classList.remove('visible'),3600);}
function setInert(value){view.inert=value;shell.inert=value;}
function closeSheet(){const focusTarget=overlayMeta?.previous;overlayCleanup?.();overlayCleanup=null;overlayMeta=null;overlays.innerHTML='';setInert(false);if(!pendingPageNavigation&&focusTarget?.isConnected)focusTarget.focus({preventScroll:true});queueMicrotask(()=>{if(!overlayMeta&&!pendingPageNavigation&&!pendingModalPop&&window.history.state?.kind==='modal'){pendingModalPop=true;window.history.back();}});}
function userCloseSheet(){const callback=overlayMeta?.onClose;closeSheet();callback?.();}
function sheet(html,bind,{onClose=null,closeLabel='Close'}={}){
  closeSheet();const previous=document.activeElement;
  overlays.innerHTML=`<div class="overlay" data-overlay><section class="sheet" role="dialog" aria-modal="true" aria-label="Lumo details" tabindex="-1"><div class="sheet-handle"></div><button class="icon-button sheet-close" data-close-sheet aria-label="${esc(closeLabel)}">${icon('close',20)}</button>${html}</section></div>`;
  overlayMeta={onClose,previous};setInert(true);
  if(router&&window.history.state?.kind!=='modal')window.history.pushState({...window.history.state,kind:'modal'},'');
  const el=overlays.querySelector('.sheet');
  const close=()=>{userCloseSheet();if(!overlayMeta&&previous?.isConnected)previous.focus({preventScroll:true});};
  el.querySelector('[data-close-sheet]').addEventListener('click',close);
  overlays.querySelector('.overlay').addEventListener('click',e=>{if(e.target.hasAttribute('data-overlay'))close();});
  const keys=e=>{if(e.key==='Escape'){e.preventDefault();close();}if(e.key==='Tab'){const items=[...el.querySelectorAll('button:not([disabled]),input,select,textarea,a[href],[tabindex="0"]')];if(!items.length)return;const first=items[0],last=items.at(-1);if(e.shiftKey&&document.activeElement===first){e.preventDefault();last.focus();}else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first.focus();}}};
  document.addEventListener('keydown',keys);overlayCleanup=()=>document.removeEventListener('keydown',keys);bind?.(el);el.focus({preventScroll:true});
}
function auth(options){if(!accountAccess(state).canTransact){toast('This account is read-only. Your saved records are still available.');return;}const {title='A quick check. Then you’re good.',onSuccess,onCancel}=options;if(openBiometricAuth(ctx,{title,onSuccess,onCancel,onFallback:()=>pinAuth(options)}))return;return pinAuth(options);}
function pinAuth({title='A quick check. Then you’re good.',onSuccess,onCancel}){let pin='',busy=false;sheet(`<h2>${esc(title)}</h2><p>Enter your transaction PIN to confirm.</p><div class="pin-display" aria-label="PIN entry">${[0,1,2,3].map(()=>'<span></span>').join('')}</div><p class="error" id="pin-error" role="alert" style="text-align:center;min-height:20px"></p><div class="keypad">${['1','2','3','4','5','6','7','8','9','clear','0','delete'].map(k=>`<button type="button" data-key="${k}" aria-label="${k==='delete'?'Delete last digit':k==='clear'?'Clear PIN':k}">${k==='delete'?icon('back'):k==='clear'?'<span style="font-size:12px">Clear</span>':k}</button>`).join('')}</div><p class="pin-hint">This PIN approves money moves. Your sign-in password is separate. Initial demo PIN: <strong>1234</strong>.</p>`,el=>{const update=()=>el.querySelectorAll('.pin-display span').forEach((n,i)=>n.classList.toggle('filled',i<pin.length));const enter=k=>{if(busy)return;if(k==='delete')pin=pin.slice(0,-1);else if(k==='clear')pin='';else if(/^\d$/.test(k)&&pin.length<4)pin+=k;update();if(pin.length===4){busy=true;setTimeout(()=>{if(!el.isConnected)return;if(pin===(state.settings.pin||'1234')){closeSheet();onSuccess?.();}else{el.querySelector('#pin-error').textContent='That transaction PIN does not match. Your sign-in password cannot approve this.';pin='';busy=false;update();}},160);}};el.querySelectorAll('[data-key]').forEach(b=>b.addEventListener('click',()=>enter(b.dataset.key)));const keys=e=>{if(/^\d$/.test(e.key)){e.preventDefault();enter(e.key);}if(e.key==='Backspace'){e.preventDefault();enter('delete');}};document.addEventListener('keydown',keys);const old=overlayCleanup;overlayCleanup=()=>{old?.();document.removeEventListener('keydown',keys);};},{onClose:onCancel,closeLabel:'Cancel PIN'});}
function celebrate({title,body,button='Let’s go',onDone}){closeSheet();overlays.innerHTML=`<section class="celebration" role="dialog" aria-modal="true" aria-label="${esc(title)}"><div class="celebration-burst">${icon('check',70)}</div><h1>${esc(title)}</h1><p>${esc(body)}</p><button class="button" id="celebrate-done">${esc(button)} ${icon('arrow',20)}</button>${Array.from({length:26},(_,i)=>`<i class="confetti-piece" style="left:${i*4}%;animation-delay:${(i%7)*.06}s;--drift:${i%2?'-':'+'}${20+i*3}px;opacity:${.2+(i%4)*.15}"></i>`).join('')}</section>`;setInert(true);const b=overlays.querySelector('#celebrate-done');b.addEventListener('click',()=>{closeSheet();onDone?.();});b.focus({preventScroll:true});}

function renderShell(){
  const fullPause=route.section==='pay'&&route.page==='pause',fullQr=route.section==='pay'&&route.page==='scan',fullChat=route.section==='chat',fullGroupChat=route.section==='life'&&route.page==='group-chat';
  const fullPaymentSuccess=route.section==='pay'&&route.page==='status'&&isCompletedPayment(state.transactions.find(t=>t.id===route.id)||draft.lastPayment);
  app.dataset.paymentSuccess=String(fullPaymentSuccess);
  app.dataset.pause=String(fullPause);app.dataset.chat=String(fullChat);app.dataset.groupChat=String(fullGroupChat);
  const home=route.section==='home',visible=!persistence.status().blocked&&!accountAccess(state).signedOut&&!fullPause&&!fullPaymentSuccess&&!fullQr&&!fullChat&&!fullGroupChat&&route.section!=='learn'&&state.onboardingDone&&!['welcome','terms','onboarding','activation','tour'].includes(route.section);
  app.dataset.home=String(home&&visible);app.dataset.flow=String(!visible);app.dataset.detail=String(visible&&!home&&!isRoot());
  if(!visible){shell.innerHTML='';return;}
  const active=route.section==='life'?'':sectionForRoute(route),sections=[['pay','Pay','arrow'],['activity','Activity','plan'],['home','Home','home'],['boxes','Boxes','box'],['plan','Plan','calendar']];
  const heading=home?`<div class="topbar home-topbar"><div class="home-top-left"><button type="button" class="home-header-control" data-shell="chat"><img class="home-lux-avatar" src="/assets/lux-chat-2d.webp" width="28" height="28" alt="" aria-hidden="true"><span>Ask Lux</span></button></div><div class="home-top-right"><button type="button" class="icon-button" data-shell="scan" aria-label="Scan or show your Lumo code">${icon('scan',22)}</button><button type="button" class="home-header-control home-menu-control" data-shell="menu" aria-label="Open menu"><span class="home-profile-initial" aria-hidden="true">${esc(firstName().slice(0,1).toUpperCase())}</span>${icon('menu',20)}</button></div></div>`:`<div class="topbar"><button class="wordmark" data-shell="home" aria-label="Go to Home">lumo</button><div class="top-actions"><button class="icon-button" data-shell="scan" aria-label="Scan or show your Lumo code">${icon('scan',21)}</button><button class="icon-button" data-shell="chat" aria-label="Ask Lux"><img class="home-lux-avatar" src="/assets/lux-chat-2d.webp" width="28" height="28" alt="" aria-hidden="true"></button><button class="icon-button profile-button" data-shell="menu" aria-label="Open menu">${icon('menu',19)}</button></div></div>`;
  shell.innerHTML=heading+`<nav class="tabs" aria-label="Main sections">${sections.map(([id,label,glyph])=>`<button type="button" class="tab ${active===id?'active':''}" data-tab="${id}" ${active===id?'aria-current="page"':''}>${icon(glyph,22)}<span>${label}</span></button>`).join('')}</nav>`;
  shell.querySelectorAll('[data-tab]').forEach(b=>b.addEventListener('click',()=>go({section:b.dataset.tab,page:'home'},{root:true})));
  shell.querySelectorAll('[data-shell]').forEach(b=>b.addEventListener('click',()=>{const a=b.dataset.shell;if(a==='menu')openMenu();else if(a==='chat')openChat();else if(a==='scan')openCodeMenu();else if(a==='visibility'){act('settings',{hideBalance:!state.settings.hideBalance});render();}else go({section:'home',page:'home'},{root:true});}));
}
function decorateNavigation(){
  if(!state.onboardingDone)return;const parent=parentRoute(route,state,draft),sameWizard=parent.section===route.section&&parent.page===route.page&&parent.step!==undefined;
  const label=sameWizard?(route.edit?'Review':'Previous'):routeLabel(parent);
  view.querySelectorAll('.page-head .back-button').forEach(b=>{b.innerHTML=`${icon('back',18)}<span>${esc(label)}</span>`;b.classList.add('labelled-back');b.setAttribute('aria-label',sameWizard&&!route.edit?'Previous step':`Back to ${label}`);});
}
function openCodeMenu(){go({section:'pay',page:'scan',mode:'scan',returnTo:{...route}});}
function openMenu(){
  const tools=[['overview','All your money','bank'],['ious','IOUs','repeat'],['cards','Cards','card'],['learning','Money IQ','spark']];
  const planning=[['upcoming','Upcoming','calendar'],['recovery','Allowance running late?','clock'],['story','Your money story','spark']];
  const menuRow=([page,title,glyph])=>row({emoji:icon(glyph,22),title,action:page==='learning'?'open-learning':`menu-${page}`});
  sheet(`<div class="lumo-menu menu-refined"><div class="menu-title-row"><h2>Menu</h2><button type="button" class="text-button" data-menu-signout>Sign out</button></div><div class="menu-intro"><span class="avatar">${esc(firstName().slice(0,1).toUpperCase())}</span><div><strong>${esc(state.profile.name)}</strong><p>${esc(state.profile.campus)} · Demo account</p></div></div><section class="menu-section" aria-labelledby="menu-shared-title"><h3 id="menu-shared-title" class="menu-section-heading">Shared money</h3>${row({emoji:icon('users',23),title:'Groups',sub:'Your people. Shared plans.',action:'menu-groups',className:'menu-groups-entry'})}</section><section class="menu-section" aria-labelledby="menu-tools-title"><h3 id="menu-tools-title" class="menu-section-heading">Money tools</h3><div class="menu-tool-grid">${tools.map(menuRow).join('')}</div><details class="menu-disclosure"><summary>${icon('calendar',21)}<span>Planning & insights</span>${icon('chevron',17)}</summary><div class="menu-disclosure-content">${planning.map(menuRow).join('')}</div></details></section><div class="menu-appearance-entry">${appearanceRow()}</div><details class="menu-disclosure menu-account-disclosure"><summary>${icon('settings',21)}<span>Account & help</span>${icon('chevron',17)}</summary><div class="menu-disclosure-content">${menuRow(['settings','Settings','settings'])}${menuRow(['help','Help & support','help'])}${row({emoji:icon('info',22),title:'About this experience',sub:'Interactive prototype · No real money',action:'menu-about'})}</div></details></div>`,el=>{
    el.querySelector('[data-menu-signout]').onclick=signOut;
    el.querySelectorAll('[data-action]').forEach(b=>b.addEventListener('click',()=>{
      const action=b.dataset.action;
      if(action==='appearance-open')return openAppearance(ctx);
      if(action==='open-learning')return go({section:'learn',page:'money-iq',returnTo:{...route}});
      if(action==='menu-cards')return go({section:'pay',page:'cards'});
      if(action==='menu-upcoming')return go({section:'activity',page:'upcoming'});
      if(action==='menu-about')return openAbout();
      if(action.startsWith('menu-'))go({section:'life',page:action.slice(5)});
    }));
  });
}
function openAbout(){
  sheet(`<section class="about-experience"><h2>About this experience</h2><p>Lumo helps you see what your next money move means.</p><dl><div><dt>Interactive prototype</dt><dd>Payments and identity checks are simulated. No real money moves.</dd></div><div><dt>Your demo stays here</dt><dd>Progress is saved in this browser. Group chat is a local participant simulation.</dd></div></dl><button type="button" class="button" data-about-done>Got it</button></section>`,el=>{el.querySelector('[data-about-done]').onclick=userCloseSheet;},{closeLabel:'Close About'});
}
function openHomeAccounts(){
  sheet(renderHomeAccounts(ctx),el=>{el.querySelectorAll('[data-home-select]').forEach(button=>button.addEventListener('click',()=>{draft.homeAccount=button.dataset.homeSelect;draft.homeMovesOpen=false;closeSheet();render();}));},{closeLabel:'Close account switcher'});
}
function openSavingsChoices(){
  const boxes=state.boxes.filter(box=>!box.archived);
  if(!boxes.length){go({section:'boxes',page:'home'});return;}
  sheet(`<h2>Which goal gets a little boost?</h2><p class="muted" style="margin:12px 0 16px">Move money from Everyday into a Money Box.</p><div class="panel">${boxes.map(box=>row({emoji:esc(box.emoji||'✨'),title:box.name,right:state.settings.hideBalance?'••••.••':cash(box.balance),action:`save-box:${box.id}`})).join('')}</div>`,el=>{el.querySelectorAll('[data-action^="save-box:"]').forEach(button=>button.addEventListener('click',()=>{const id=button.dataset.action.slice(9);closeSheet();openBoxFunding(ctx,id);}));});
}

function reminders(){if(!state.settings.notifications)return [];const end=daysFromNow(1);return [...state.budget.items.filter(i=>i.amount>i.spent&&i.due&&i.due<=end).map(i=>({title:i.name,sub:`${cash(i.amount-i.spent)} to cover · Due ${dateLabel(i.due)}`,emoji:i.emoji||'📅',action:'budget'})),...state.ious.filter(i=>i.status==='open'&&i.due&&i.due<=end).map(i=>({title:i.type==='owedToMe'?`${i.name} owes you`:`Repay ${i.name}`,sub:`${cash(i.amount-(i.paid||0))} · Due ${dateLabel(i.due)}${i.type==='owedToMe'?' · Expected only':''}`,emoji:i.type==='owedToMe'?'↙':'↗',action:`root-iou:${i.id}`}))];}
function home(){return renderHome(ctx);}
function transactionRow(t){return row({emoji:t.emoji||(t.direction==='in'?'↙':'↗'),title:t.merchant,sub:t.status==='success'?(t.note||new Date(t.at).toLocaleTimeString('en-GH',{hour:'2-digit',minute:'2-digit',timeZone:'Africa/Accra'})):t.status,right:`<span class="${t.direction==='in'?'feed-positive':''}">${t.direction==='in'?'+':'−'}${cash(t.amount)}</span>`,action:`root-tx:${t.id}`});}
function activity(){return renderActivity(ctx);}
function insights(){return renderInsights(ctx,route);}
function upcoming(){const list=[...state.budget.items.map(i=>({...i,remaining:Math.max(0,i.amount-i.spent),kind:'budget'})),...state.ious.filter(i=>i.type==='owedByMe'&&i.status==='open'&&i.due<=state.income.nextDate).map(i=>({...i,name:`Pay ${i.name} back`,remaining:i.amount-(i.paid||0),emoji:'↗',kind:'iou'}))].sort((a,b)=>(a.due||'9999').localeCompare(b.due||'9999'));return `<section class="page">${pageHead('Upcoming',{action:`<button data-action="budget">${icon('plus',16)} Add</button>`})}<h1 class="large-question">A little ahead<br>of your money.</h1><p class="muted" style="font-size:14px;margin-bottom:25px">Your essentials and upcoming repayments, with their dates.</p><div class="panel">${row({emoji:icon('download'),title:'Next allowance',sub:`Expected ${dateLabel(state.income.nextDate)} · Not in your balance`,right:cash(state.income.amount),action:'income-settings'})}</div>${reminders().length?`<div class="section-label">A heads-up</div><div class="panel">${reminders().map(r=>row({...r,emoji:icon(r.action==='budget'?categorySymbol(r.title):'repeat')})).join('')}</div>`:''}<div class="section-label">Your commitments</div>${list.length?`<div class="panel">${list.map(i=>row({emoji:icon(i.kind==='iou'?'repeat':categorySymbol(i.name)),title:i.name,sub:`Due ${dateLabel(i.due)}`,right:cash(i.remaining),action:i.kind==='iou'?`root-iou:${i.id}`:'budget'})).join('')}</div>`:empty({emoji:icon('calendar',28),title:'Let’s see what’s coming.',body:'Add food, transport, bills and anything else this money needs to cover.',action:'budget',label:'Create my plan'})}</section>`;}

let completingSignup=false;
function onboardingDraft(){
  if(!draft.onboarding||draft.onboarding.schema!==ONBOARDING_SCHEMA)draft.onboarding=normalizeOnboardingDraft(draft.onboarding);
  return draft.onboarding;
}
function welcome(){
  const d=draft.onboarding,preview=!!d?.preview,resume=!!d?.completedSteps?.length||!!draft.activation;
  return renderWelcome({preview,resume,touring:!!draft.tour,page:route.page});
}
function startSignupPreview(){
  if(!draft.onboarding?.preview||draft.onboarding.completed)draft.onboarding=createOnboardingDraft({preview:true});
  completingSignup=false;
  const d=draft.onboarding;
  // Start this preview from the current native entry, beyond any older external history.
  captureBeforeLeave();closeSheet();captureCurrent=null;router=makeRouter();router.initialise();
  beginSignup();
}

function beginSignup(){
  if(draft.activation){go({section:'activation',step:draft.activation.step});return;}
  const d=onboardingDraft();
  if(!hasAcceptedSetupTerms(d)){go({section:'terms'});return;}
  // Explore is the optional introduction. Setup begins after the terms.
  if(draft.tour&&!draft.tour.replay){go({section:'tour',step:draft.tour.step});return;}
  go({section:'onboarding',step:safeOnboardingStep(d,d.currentStep||'name')});
}
function completeSetupTerms({accepted=false}={}){
  const result=acceptSetupTerms(onboardingDraft(),{accepted});
  if(!result.ok)return result;
  persistSession();beginSignup();return result;
}
function exitSetupTerms(){
  if(draft.onboarding?.preview){exitSignup();return;}
  go({section:'welcome',page:'home'});
}
function startTour({replay=false,returnTo=null}={}){
  if(draft.activation){go({section:'activation',step:draft.activation.step});return;}
  if(replay){
    captureBeforeLeave();closeSheet();captureCurrent=null;router=makeRouter();router.initialise();
  }else onboardingDraft();
  draft.tour=createTourDraft({replay,returnTo:replay?(returnTo||route):null});
  persistSession();go({section:'tour',step:0});
}
function finishTour({skipped=false}={}){
  const t=draft.tour;if(!t)return;
  const target=t.replay?t.returnTo:{section:'onboarding',step:safeOnboardingStep(onboardingDraft(),draft.onboarding.currentStep||'name')};
  if(!t.replay){
    const status=skipped?'skipped':'completed';saveTourRecord(status);
    tourRecord=loadTourRecord()||{schema:1,status,timestamp:new Date().toISOString()};
  }
  captureCurrent=null;delete draft.tour;persistSession();
  ctx.finish(target||{section:'life',page:'settings'});
}
function exitSignup(){
  const d=onboardingDraft();
  clearOnboardingMedia(d);resetCameraCaptures(d);persistSession();
  if(d.preview)ctx.finish({section:'life',page:'settings'});
  else go({section:'welcome'});
}
function completeSignup(){
  if(completingSignup)return;
  const d=onboardingDraft(),result=buildOnboardingState(d);
  if(!result.ok){toast(result.message||'Complete the earlier steps first.');go({section:'onboarding',step:safeOnboardingStep(d,'pin')},{replace:true});return;}
  clearOnboardingMedia(d);
  draft.activation=createActivationDraft({state:result.state,preview:d.preview});
  delete draft.onboarding;persistSession();
  go({section:'activation',step:'account-created'},{finish:true});
}


function exitAccountActivation(){
  captureBeforeLeave();
  if(draft.activation?.preview){delete draft.activation;persistSession();ctx.finish({section:'life',page:'settings'});}
  else ctx.go({section:'welcome'});
}
function completeAccountActivation({waitForFunding=false}={}){
  if(completingSignup)return;
  const result=waitForFunding?deferActivationFunding(draft.activation):finishActivation(draft.activation);
  if(!result.ok){toast(result.message);return;}
  completingSignup=true;
  if(result.preview){
    draft.lastSignupSimulation={completedAt:new Date().toISOString()};
    delete draft.activation;persistSession();
    celebrate({title:waitForFunding?'Ready when your money is.':'That’s your first move.',body:waitForFunding?'You explored the waiting state. Your current demo account stays exactly where you left it.':'Signup, a first top-up and a budget. Your current demo account stays exactly where you left it.',button:'Back to my Lumo',onDone:()=>{completingSignup=false;ctx.finish({section:'life',page:'settings'});}});
    return;
  }
  const saved=persistence.commit(migrateState(result.state));
  if(!saved.ok){draft.activation.completed=false;completingSignup=false;toast(saved.message);render();return;}
  state=saved.state;
  delete draft.activation;persistSession();
  completingSignup=false;ctx.finish(readPaymentLink(ctx)||{section:'home',page:'home'});
}


function render(options={}){if(persistence.status().blocked){cleanup?.();cleanup=null;captureCurrent=null;shell.innerHTML='';app.dataset.flow='true';view.innerHTML=renderPersistenceRecovery(ctx,persistence);bindPersistenceRecovery(ctx,persistence);return;}route=safeRoute(route,state,draft);const samePage=lastRenderedKey===routeKey(route),focused=view.contains(document.activeElement)?document.activeElement:null,focusDescriptor=focused?{id:focused.id,name:focused.getAttribute('name'),action:focused.dataset?.action}:null;const savedScroll=options.scroll??(lastRenderedKey===routeKey(route)?view.scrollTop:0);captureCurrent?.();captureCurrent=null;if(route.page==='create'&&route.section==='plan'&&!draft.plan)route={section:'plan',page:'home'};if(route.page==='create'&&route.section==='boxes'&&!draft.box)route={section:'boxes',page:'home'};cleanup?.();cleanup=null;if(route.section!=='onboarding'&&draft.onboarding){clearOnboardingMedia(draft.onboarding);resetCameraCaptures(draft.onboarding);}persistSession();renderShell();try{if(route.section==='welcome'){view.innerHTML=welcome();cleanup=bindExplore(ctx);}else if(route.section==='terms'){view.innerHTML=renderSetupTerms(ctx);cleanup=bindSetupTerms(ctx);}else if(route.section==='tour'){view.innerHTML=renderTour(ctx,route);cleanup=bindTour(ctx,route);}else if(route.section==='onboarding'){onboardingDraft();view.innerHTML=renderOnboarding(ctx,route);cleanup=bindOnboarding(ctx,route);}else if(route.section==='activation'){view.innerHTML=renderActivation(ctx,route);cleanup=bindActivation(ctx,route);}else if(route.section==='home'){view.innerHTML=home();cleanup=bindHome(ctx);}else if(route.section==='activity'){view.innerHTML=route.page==='insights'?insights():route.page==='upcoming'?upcoming():activity();if(route.page==='insights')cleanup=bindInsights(ctx,route);}else if(route.section==='pay'){view.innerHTML=renderPayments(ctx,route);cleanup=bindPayments(ctx,route)||null;}else if(route.section==='plan'||route.section==='boxes'){view.innerHTML=renderPlanning(ctx,route);const bindingCleanup=bindPlanning(ctx,route),visualCleanup=afterPlanning?.(ctx,route);cleanup=()=>{bindingCleanup?.();visualCleanup?.();};}else if(route.section==='life'&&route.page==='group-chat'){view.innerHTML=renderGroupChat(ctx,route);cleanup=bindGroupChat(ctx,route)||null;}else if(route.section==='life'&&route.page.startsWith('account-')){view.innerHTML=renderAccount(ctx,route);cleanup=bindAccount(ctx,route)||null;}else if(route.section==='life'){view.innerHTML=renderLife(ctx,route);if(route.page==='settings'){const anchor=[...view.querySelectorAll('.section-label')].find(x=>x.textContent==='Make it yours');if(anchor){anchor.insertAdjacentHTML('beforebegin',accountSettingsRows(ctx)+renderLearningEntry(ctx));anchor.nextElementSibling.insertAdjacentHTML('afterbegin',appearanceRow());}}cleanup=bindLife(ctx,route)||null;if(route.page==='settings')bindAccountSettings(ctx);}else if(route.section==='learn'){view.innerHTML=renderLearning(ctx,route);cleanup=bindLearning(ctx,route)||null;}else if(route.section==='chat'){view.innerHTML=renderChat(ctx,route);cleanup=bindChat(ctx,route)||null;}else{route={section:'home',page:'home'};view.innerHTML=home();}const learningEntry=renderContextLearning(ctx);if(learningEntry){const page=view.querySelector('.page');if(page){const bottom=page.querySelector(':scope > .bottom-action');if(bottom)bottom.insertAdjacentHTML('beforebegin',learningEntry);else page.insertAdjacentHTML('beforeend',learningEntry);bindContextLearning(ctx);}}bindRoot();if(accountAccess(state).closed&&!route.page?.startsWith('account-'))view.insertAdjacentHTML('afterbegin','<div class="account-readonly-banner" role="status">Account closed · Your records are available to read and export.</div>');decorateNavigation();view.scrollTop=savedScroll;if(samePage&&focusDescriptor){const target=[...view.querySelectorAll('button,input,select,textarea')].find(el=>focusDescriptor.id?el.id===focusDescriptor.id:focusDescriptor.name?el.getAttribute('name')===focusDescriptor.name:focusDescriptor.action&&el.dataset.action===focusDescriptor.action);if(target&&!target.disabled)target.focus({preventScroll:true});}lastRenderedKey=routeKey(route);persistSession();}catch(e){console.error('Lumo view:',route,e);view.innerHTML=`<section class="page">${pageHead('Let’s pick that up again.')}<div class="empty"><h2>A small interruption.</h2><p>Your money choices are saved. Return home and try that step again.</p>${btn('Back to Lumo','home')}</div></section>`;}}
function bindRoot(){if(route.section==='activity'&&isRoot())bindActivity(ctx);}

view.addEventListener('click',e=>{const b=e.target.closest('[data-action]');if(!b)return;const a=b.dataset.action;if(a==='appearance-open'){openAppearance(ctx);return;}if(a==='open-learning'){go({section:'learn',page:'money-iq',returnTo:{...route}});return;}if(a==='home-accounts'){openHomeAccounts();return;}if(a==='home-save'){openSavingsChoices();return;}if(a==='home-boxes'){go({section:'boxes',page:'home'});return;}if(a==='back'){back();return;}if(a.startsWith('root-tx:')){go({section:'pay',page:'transaction',id:a.slice(8)});return;}if(a.startsWith('root-iou:')){go({section:'life',page:'iou-detail',id:a.slice(9)});return;}if(a==='start'){beginSignup({fromExplore:route.section==='welcome'&&route.page==='explore'});}else if(a==='welcome-signin'){go({section:'life',page:'account-access'});}else if(a==='signup-preview-exit'){exitSignup();}else if(a==='welcome-explore'){go({section:'welcome',page:'explore'});}else if(a==='welcome-tour-close'){go({section:'welcome',page:'home'});}else if(a==='demo'){reset({demo:true});}else if(a==='home')go({section:'home',page:'home'},{root:true});else if(a==='visibility'){act('settings',{hideBalance:!state.settings.hideBalance});render();}else if(a==='balance-mode'){draft.balanceMode=draft.balanceMode==='available'?'spendable':'available';render();}else if(a==='fund')openFunding(ctx);else if(a==='pay')go({section:'pay',page:'home'});else if(a==='budget')go({section:'plan',page:'home'});else if(a==='story')go({section:'life',page:state.income?.amount>0&&state.income?.nextDate<daysFromNow(0)&&!state.recovery?.active?'recovery':'story'});else if(a==='upcoming')go({section:'activity',page:'upcoming'});else if(a==='insights')go({section:'activity',page:'insights',returnTo:{...route}});else if(a==='all-activity')go({section:'activity',page:'home'});else if(a==='ask-spending'){draft.chatPendingQuestion='Where did my money go?';go({section:'chat',page:'home'});}else if(a==='income-settings')openIncome();});
function openIncome(){sheet(`<h2>When’s your next money coming?</h2><p>An estimate helps you plan. It stays outside your available balance.</p><form id="income-form">${field({label:'Expected amount (GH₵)',name:'amount',type:'number',value:state.income.amount/100,min:0})}${field({label:'Expected date',name:'date',type:'date',value:state.income.nextDate})}<p class="error" id="income-error"></p><button class="button" type="submit">Update expected income</button></form>`,el=>{el.querySelector('form').onsubmit=e=>{e.preventDefault();const amount=Math.round(Number(el.querySelector('[name=amount]').value)*100),date=el.querySelector('[name=date]').value;if(!Number.isSafeInteger(amount)||amount<0||!date){el.querySelector('#income-error').textContent='Choose an amount and date.';return;}const result=act('setExpectedIncome',{amount,date});if(!result.ok){el.querySelector('#income-error').textContent=result.message;return;}closeSheet();render();toast('Your next income is updated.');};});}
bindChatGestures({target:app,getRoute:()=>route,isEnabled:()=>state.onboardingDone&&!overlayMeta&&!pendingPageNavigation,onOpenChat:openChat,onReturnApp:returnToApp});
window.addEventListener('keydown',e=>{if(!e.altKey||overlayMeta||view.inert||document.querySelector('[aria-modal="true"]')||pendingPageNavigation||!state.onboardingDone||e.target?.closest?.('input,textarea,select,[contenteditable]'))return;if(e.key==='ArrowLeft'&&route.section==='chat'){e.preventDefault();returnToApp();}else if(e.key==='ArrowRight'&&canOpenChatBySwipe(route)){e.preventDefault();openChat();}});
window.addEventListener('popstate',e=>{
  if(pendingModalPop){pendingModalPop=false;if(e.state?.kind!=='modal'&&e.state?.index===router.index)return;}
  if(overlayMeta&&!pendingPageNavigation&&e.state?.kind!=='modal'){const callback=overlayMeta.onClose;closeSheet();callback?.();return;}
  if(e.state?.kind==='modal'&&!overlayMeta){window.history.replaceState({...e.state,kind:'page'},'');}
  if(lastRenderedKey)captureBeforeLeave();captureCurrent=null;if(!pendingPageNavigation)cancelRecipientEditOnExit(draft,route,window.history.state?.route);router.receive(window.history.state);
});
let savedNavigation=null;
try{const session=JSON.parse(sessionStorage.getItem('lumo-session-v1')||'null');if(session?.draft){Object.assign(draft,session.draft);if(draft.activation)draft.activation=restoreActivationDraft(draft.activation);if(draft.tour)draft.tour=normalizeTourDraft(draft.tour);if(draft.onboarding){draft.onboarding=normalizeOnboardingDraft(draft.onboarding);resetCameraCaptures(draft.onboarding);}}if(session?.route)route=safeRoute(session.route,state,draft);savedNavigation=session?.navigation||null;}catch{}
if(state.onboardingDone&&!draft.activation&&!draft.tour){const linked=readPaymentLink(ctx);if(linked){route=linked;savedNavigation=null;}}
router=makeRouter(savedNavigation);router.initialise();


let lastStorageReason=persistence.status().reason;
attachPersistenceEvents(persistence,{onChange:status=>{if(status.reason!==lastStorageReason){lastStorageReason=status.reason;if(status.blocked)closeSheet();render();}}});
registerOfflineShell({onChange:({offline})=>{app.dataset.offline=offline?'true':'false';updateOfflineBanner(app,{offline});}});

function checkDueSavingRules(){
  if(!state.onboardingDone||!accountAccess(state).canTransact||persistence.status().blocked||draft.activation)return;
  const date=daysFromNow(0);
  if(!state.boxes.some(b=>!b.archived&&b.hack?.type==='scheduled'&&!b.hack.paused&&b.hack.nextRun<=date))return;
  const result=act('runScheduledSavings');
  if(result.ok){render();if(result.transfers?.length)toast('Your scheduled saving made a little progress.');}
}
checkDueSavingRules();
window.addEventListener('focus',checkDueSavingRules);
document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible')checkDueSavingRules();});
