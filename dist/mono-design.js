/* Lumo Monochrome. An edition-owned presentation layer. Existing financial,
   privacy, navigation and authentication controllers remain authoritative. */
(()=>{
'use strict';
if(!window.L||L.monoDesign)return;
const E=L.e, B=L.btn;
const allowed=()=>L.state.onboarded&&!L.state.locked&&!L.state.closed;
const mainRoots=new Set(['home','chat','more','plan','pay','moneyStoryHome','cardsHome']);
let primaryNavigation=null,primaryControls=null;
const menuDisclosureStates=new WeakMap();
const menuDisclosures=()=>{let state=menuDisclosureStates.get(L.state);if(!state){state=new Map();menuDisclosureStates.set(L.state,state);}return state;};
const menuGroups=[
 {id:'move',title:'Move money',items:[
  ['Payments','Transfers, bills and top-ups','arrowUp','pay',true],
  ['Requests & collections','Split costs or collect together','arrowDown','groupMoneyHome'],
  ['Cards','Your online payments','card','cardsHome',true],
  ['Activity','Payments and receipts','receipt','activity']
 ]},
 {id:'plan',title:'Plan & save',items:[
  ['Plan','Budget, dates and expected money','plan','plan',true],
  ['Money Boxes','Savings goals and savings hacks','target','goals'],
  ['Money Story','Understand your spending','receipt','moneyStoryHome',true]
 ]},
 {id:'account',title:'Your account',preview:'Profile, account details, security, privacy, notifications',items:[
  ['Profile','Your personal details','user','profile'],
  ['Account details','Account numbers and statements','bank','accountInfo'],
  ['Security','PIN, biometrics and devices','shield','security'],
  ['Privacy','Your data and choices','eye','privacy'],
  ['Notifications','Your reminders and preferences','bell','notificationPrefs']
 ]},
 {id:'support',title:'Help & support',preview:'Help, feedback & ambassador guide',items:[
  ['Get help','Questions and saved reports','help','help'],
  ['Share feedback','Tell us about your experience','chat','feedback'],
  ['Ambassador guide','How to explore this preview','target','ambassadorGuide']
 ]}
];
const menuItem=([label,sub,icon,route,tab])=>{
 const current=route===(L.route==='monoMenu'?L.taskSheet?.parentRoute:L.route);
 return `<button type="button" class="mono-menu-item${current?' is-current':''}" ${current?'aria-current="page" ':''}data-menu-route="${route}" onclick="L.${tab?'openTab':'go'}('${route}')"><span class="mono-menu-icon" aria-hidden="true">${L.icon(icon,21)}</span><span class="mono-menu-copy"><strong>${E(label)}</strong><small>${E(sub)}</small></span>${L.icon('chevron',16)}</button>`;
};
const menuGroup=group=>group.preview
 ?`<details class="mono-menu-group mono-menu-disclosure" data-menu-group="${group.id}" ${menuDisclosures().get(group.id)?'open ':''}ontoggle="L.monoMenuDisclosure(this)"><summary id="mono-menu-${group.id}"><span><strong>${E(group.title)}</strong><small>${E(group.preview)}</small></span>${L.icon('chevron',18)}</summary><div>${group.items.map(menuItem).join('')}</div></details>`
 :`<section class="mono-menu-group" data-menu-group="${group.id}" aria-labelledby="mono-menu-${group.id}"><h2 id="mono-menu-${group.id}">${E(group.title)}</h2><div>${group.items.map(menuItem).join('')}</div></section>`;
L.monoMenuDisclosure=element=>{
 const id=element?.dataset?.menuGroup;
 if(!allowed()||!['monoMenu','more'].includes(L.route)||!['account','support'].includes(id)||!element.isConnected||!document.getElementById('view')?.contains(element))return false;
 menuDisclosures().set(id,!!element.open);return true;
};
const oldMore=L.views.more;
L.views.more=function(...args){
 if(!allowed())return oldMore.apply(this,args);
 const name=L.state.profile?.displayName||L.state.profile?.name||'Your Lumo';
 return `<section class="mono-menu"><header class="hibiscus-tab-header hibiscus-root-header"><h1>Menu</h1><button type="button" class="hibiscus-root-chat" onclick="L.openBankingChat()" aria-label="Ask Lumo. Open full-screen Chat">${L.icon('chat',21)}</button><button type="button" class="hibiscus-header-notifications" onclick="L.go('notifications')" aria-label="Notifications">${L.icon('bell',20)}</button></header><p class="mono-menu-owner">${E(name)}</p>${menuGroups.map(menuGroup).join('')}${L.testMode?`<details class="mono-menu-testing"><summary>Preview tools</summary>${menuItem(['Test scenarios','Sample outcomes and test guide','target','testing'])}${menuItem(['Merchant preview','Explore sample collections','grid','merchant'])}</details>`:''}<footer class="mono-menu-footer">${B(L.icon('logout',18)+'<span>Sign out</span>','L.acct.signout()','text-btn')}<small>Lumo · Sample money only</small></footer></section>`;
};
// Menu is a retained native task, presented as a side drawer. The controller
// still owns focus, inert background, Escape, dismissal and browser history.
const menuDestinations=new Map(menuGroups.flatMap(group=>group.items.map(item=>[item[3],!!item[4]])));
menuDestinations.set('testing',false);menuDestinations.set('merchant',false);
L.views.monoMenu=()=>L.views.more()
 .replace(/<header\b[^>]*>[\s\S]*?<\/header>/,'')
 .replace(/(data-menu-route="([^"]+)" )onclick="L\.(?:go|openTab)\('[^']+'\)"/g,(_,attribute,route)=>attribute+`onclick="L.monoMenuSelect('${route}')"`)
 .replace('onclick="L.acct.signout()"','onclick="L.monoMenuSignout()"');
L.taskSheet?.register('monoMenu',{family:'records',treatment:'selection',label:'Menu'});
L.openMonoMenu=()=>{
 if(!allowed()||!mainRoots.has(L.route)||L.taskSheet?.active||L.contextualChat?.current?.()||L.budgetGuide?.active?.())return false;
 L.go('monoMenu');return true;
};
L.monoMenuSelect=route=>{
 if(!allowed()||L.route!=='monoMenu'||!L.taskSheet?.active||!menuDestinations.has(route)||['testing','merchant'].includes(route)&&!L.testMode)return false;
 const tab=menuDestinations.get(route);
 // Native closing unwinds browser history asynchronously. Story and Cards
 // have an added tab wrapper, so use the native go queue for those roots;
 // their openTab wrapper would run before the pending close is complete.
 L.closeTask();if(tab&&!['moneyStoryHome','cardsHome'].includes(route))L.openTab(route);else L.go(route);return true;
};
L.monoMenuSignout=()=>{
 if(!allowed()||L.route!=='monoMenu'||!L.taskSheet?.active)return false;
 L.closeTask();L.acct.signout();return true;
};
function syncDrawer(){
 if(L.route!=='monoMenu'||!L.taskSheet?.active)return;
 const layer=document.querySelector('.task-sheet-layer[data-task-route="monoMenu"]');if(!layer)return;
 const dialog=layer.querySelector('.task-sheet'),header=layer.querySelector('.task-sheet-chrome');
 if(dialog)dialog.id='mono-menu-dialog';
 for(const control of layer.querySelectorAll('.task-sheet-back,.task-sheet-help,.task-sheet-grab'))control.hidden=true;
 const qr=layer.querySelector('#lumo-scan-qr');if(qr)qr.hidden=true;
 const close=layer.querySelector('.task-sheet-close');if(close)close.setAttribute('aria-label','Close menu');
 const backdrop=layer.querySelector('.task-sheet-backdrop');if(backdrop)backdrop.setAttribute('aria-label','Close menu');
 if(header&&!header.__monoDrawerDragGuard){
  header.__monoDrawerDragGuard=true;
  header.addEventListener('pointerdown',event=>{if(!event.target?.closest?.('button,a,input,select,textarea,summary'))event.stopImmediatePropagation?.();},true);
 }
 const rect=document.getElementById('app')?.getBoundingClientRect?.(),viewport=window.visualViewport;
 if(rect){
  const top=Math.max(Number(viewport?.offsetTop)||0,rect.top),bottom=Math.min((Number(viewport?.offsetTop)||0)+(Number(viewport?.height)||window.innerHeight||rect.bottom),rect.bottom);
  layer.style.setProperty('--mono-drawer-top',top+'px');layer.style.setProperty('--mono-drawer-height',Math.max(1,bottom-top)+'px');
 }
}
function syncNavigation(){
 const nav=document.getElementById('nav');if(!nav)return;
 const taskBack=document.querySelector('.task-sheet-back');
 if(taskBack?.getAttribute('aria-label')==='Back to You')taskBack.setAttribute('aria-label','Back to Menu');
 const returnButton=document.querySelector('.hibiscus-chat-app-return');
 if(returnButton?.getAttribute('aria-label')==='Back to You')returnButton.setAttribute('aria-label','Back to Menu');
 if(allowed()&&L.route==='monoMenu'&&L.taskSheet?.active){
  // Keep the retained page's layout while its inert navigation sits behind
  // the drawer. Closing returns the very same controls and scroll position.
  nav.hidden=false;const menu=primaryControls?.[2];
  if(menu){menu.setAttribute('aria-expanded','true');menu.setAttribute('aria-controls','mono-menu-dialog');}
  return;
 }
 if(!allowed()||!mainRoots.has(L.route)||L.taskSheet?.active||L.contextualChat?.current?.()||L.budgetGuide?.active?.()){
  nav.hidden=true;return;
 }
 const active=L.route==='home'?'home':L.route==='moneyStoryHome'?'moneyStoryHome':'more';
 const menuIcon='<svg width="21" height="21" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" aria-hidden="true"><path d="M4 6h16M4 12h16M4 18h16"/></svg>';
 const storyIcon='<svg width="21" height="21" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 3v17h17M8 15l4-5 4 3 4-6"/></svg>';
 const tabs=[['home','Home',L.icon('home',21),"L.openTab('home')"],['moneyStoryHome','Money Story',storyIcon,"L.openTab('moneyStoryHome')"],['more','Menu',menuIcon,'L.openMonoMenu()']];
 // Keep these exact controls when the shared five-tab presenter refreshes its
 // chrome. A retained task must restore its original navigation nodes too.
 if(primaryNavigation!==nav){primaryNavigation=nav;primaryControls=null;}
 if(!primaryControls){
  nav.innerHTML=tabs.map(([route,label,icon,action])=>`<button type="button" class="nav-item" onclick="${action}">${icon}<span>${label}</span></button>`).join('');
  primaryControls=[...nav.querySelectorAll('.nav-item')];
 }else if(nav.children.length!==3||primaryControls.some((node,index)=>nav.children[index]!==node))nav.replaceChildren(...primaryControls);
 for(let i=0;i<tabs.length;i++){
  const selected=tabs[i][0]===active,node=primaryControls[i];node.classList.toggle('active',selected);
  if(selected)node.setAttribute('aria-current','page');else node.removeAttribute('aria-current');
 }
 primaryControls[2].setAttribute('aria-haspopup','dialog');primaryControls[2].setAttribute('aria-expanded','false');primaryControls[2].removeAttribute('aria-controls');
 primaryControls[1].setAttribute('title','Money Story · Spending insights');
 nav.classList.remove('hibiscus-five-nav');nav.classList.add('mono-primary-nav');nav.hidden=false;
}
function block(html,opening){
 const start=html.indexOf(opening);if(start<0)return '';
 const tags=/<\/?div\b[^>]*>/g;tags.lastIndex=start;let depth=0,m;
 while((m=tags.exec(html))){depth+=m[0].startsWith('</')?-1:1;if(depth===0)return html.slice(start,tags.lastIndex);}
 return '';
}
const aperture=`<svg class="mono-aperture" viewBox="0 0 320 220" fill="none" aria-hidden="true"><path d="M67 110a93 93 0 0 1 186 0v38H67z" fill="#161616"/><path d="M90 110a70 70 0 0 1 140 0v38H90z" fill="#444444"/><path d="M113 110a47 47 0 0 1 94 0v38h-94z" fill="#747474"/><path d="M136 110a24 24 0 0 1 48 0v38h-48z" fill="#fafafa"/><path d="M45 169h230" stroke="#d9d9d9"/><circle cx="253" cy="148" r="13" fill="#d7ff3f"/><path d="M249 148h8m-4-4v8" stroke="#161616" stroke-width="1.5" stroke-linecap="round"/></svg>`;
const welcome=L.views.welcome;
L.views.welcome=function(...args){
 const html=welcome.apply(this,args);
 const actions=block(html,'<div class="actions"');
 const utilities=block(html,'<div class="welcome-utilities"');
 const sample=html.match(/<button\b[^>]*class="[^"]*(?:getting-started-sample|welcome-explore)[^\"]*"[^>]*>[\s\S]*?<\/button>/)?.[0]||'';
 return `<section class="mono-welcome"><div class="mono-welcome-brand"><img class="actual-wordmark" src="/brand/Lumo-Wordmark-Black.svg" alt="Lumo"><span>Money. In perspective.</span></div><div class="mono-welcome-picture">${aperture}</div><div class="mono-welcome-copy"><p class="mono-kicker">A LITTLE CLARITY GOES A LONG WAY</p><h1>Your money.<br>Room to live.</h1><p>See what you can spend.<br>Make room for what’s next.</p></div><div class="mono-welcome-actions">${actions}${sample}${utilities}<p class="mono-demo-note">Interactive preview · Sample money only</p></div></section>`;
};
// Neutral size buckets reserve the same wrapping space while money is hidden.
// No amount is copied into attributes, hidden text or an off-screen measure.
const homeContextClass=value=>'mono-context-amount'+(Math.abs(Number(value)||0)>=10000000?' has-huge-context-amount':Math.abs(Number(value)||0)>=1000?' has-wide-context-amount':'');
function syncHomeFacts(){
 const available=L.accountBalances().available;
 for(const node of document.querySelectorAll('[data-mono-context-available]'))node.setAttribute('class',homeContextClass(available));
 L.monoConversation?.syncPrivacy?.();
}
const refreshHomePrivacy=L.refreshPrivateMoney;
L.refreshPrivateMoney=function(...args){const result=refreshHomePrivacy?.apply(this,args);syncHomeFacts();return result;};
const home=L.views.home;
L.views.home=function(...args){
 const inherited=home.apply(this,args);if(!allowed())return inherited;
 const s=L.state,b=L.balances(),a=L.accountBalances(),has=L.hasMeaningfulPlan(s),budget=L.budgetStateSummary?.(s);
 const boxes=(s.goals||[]).filter(x=>x&&!x.archived&&!x.deleted).length;
 const amount=has?b.room:a.available,key=has?'room':'available',id=has?'overview-room':'overview-balance';
 const start=s.planDraft?.step||'planSetup';
 const calculation=has?(budget?.ended?"L.go('planPeriod')":"L.spendingOutlook.open()"):`L.go('${E(start)}')`;
 const details=has&&!budget?.ended?"L.budgetReadability?.rememberItems(true);L.openTab('plan')":calculation;
 const budgetLabel=has?(budget?.ended?'Review budget dates':'View budget'):s.planDraft?'Continue your budget':'Create your budget';
 const header=block(inherited,'<div class="home-greeting"').replace(/<button\b[^>]*class="hibiscus-root-chat"[^>]*>[\s\S]*?<\/button>/,'');
 const campus=block(inherited,'<div class="notice pilot-campus-note"');
 const name=String(s.profile?.displayName||s.profile?.name||'').trim().split(/\s+/)[0];
 const privacy=L.balancePrivacyControl(true,(has?'overview-room overview-balance':'overview-balance')+(boxes?' overview-savings':''));
 const basis=L.experienceClarity?.basis?.({state:s})||{status:has?'saved-costs':'no-budget',count:(s.essentials||[]).filter(c=>c&&!c.archived&&!c.deleted&&Number(c.amount)>0).length};
 const periodAction=has&&['saved-costs','ended','changed-allowance','allowance-due'].includes(basis.status);
 const basisText=!has?'Your Everyday account':basis.status==='saved-costs'?`${basis.count} planned ${basis.count===1?'cost':'costs'}`:basis.text;
 const basisMarkup=has?`<p class="experience-budget-basis mono-budget-basis" data-budget-basis data-basis-status="${E(basis.status)}"><span>${E(basisText)}</span>${periodAction?`<button type="button" class="mono-budget-date-action" onclick="L.go('planPeriod')">${basis.status==='saved-costs'?'Add dates':'Review dates'}</button>`:''}</p>`:'';
 const context=has?`<div class="everyday-available-context mono-available-row${Math.abs(a.available)>=10000?' has-wide-context':''}"><span class="mono-balance-cell"><span>Available<span class="sr-only"> balance</span></span><strong id="overview-balance" class="${homeContextClass(a.available)}" data-mono-context-available>${L.privateMoney('available',a.available)}</strong></span></div>`:'';
 const boxIcon='<svg width="21" height="21" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m4 7 8-4 8 4v11l-8 4-8-4Z"/><path d="m4 7 8 4 8-4M12 11v11M8 5l8 4"/></svg>';
 const pending=a.held?`<button type="button" class="mono-home-alert everyday-pending" onclick="L.go('pending')">${L.icon('clock',17)}<span>Payment in progress</span>${L.icon('chevron',16)}</button>`:'';
 const gap=has&&b.gap?`<button type="button" class="mono-home-alert everyday-gap" onclick="L.go('makeRoom')">${L.icon('help',17)}<span>Your budget needs attention</span>${L.icon('chevron',16)}</button>`:'';
 const migration=Number(s.accounts?.migration?.unfunded)>0?`<p class="notice everyday-migration">${L.money(s.accounts.migration.unfunded)} of an old allocation could not move into savings. ${B('Review boxes',"L.go('goals')",'text-btn')}</p>`:'';
 const action=(label,icon,handler,extra='')=>`<button type="button" class="mono-quick-action ${extra}" onclick="${handler}"${label==='Collect'?' aria-label="Collect. Request money, split costs or collect together" title="Request money, split costs or collect together"':''}><span class="mono-action-icon">${L.icon(icon,22)}</span><span>${label}</span></button>`;
 return `<section class="edition-home everyday-account-home home-refined mono-home"><h1 class="sr-only">Home</h1>${header}<div class="mono-home-intro"><p>${name?'Hello, '+E(name)+'.':'Hello there.'}</p><span>Let’s make room for life.</span></div>${campus}<section class="account-card account-operational everyday-money-card mono-money-card${has?' has-budget':''}${Math.abs(amount)>=1000?' has-wide-amount':''}${Math.abs(amount)>=10000000?' has-huge-amount':''}" aria-label="Everyday money"><div class="everyday-account-heading"><div><h2>Everyday money</h2>${basisMarkup}</div>${privacy}</div><button type="button" class="everyday-primary-money account-room" ${has&&!budget?.ended?'data-spending-outlook-entry':''} onclick="${has?calculation:"L.go('balances')"}" aria-label="${has?'Left after planned costs. See calculation':'Available balance. See account breakdown'}"><span class="everyday-primary-label">${has?'Left after planned costs':'Available balance'}</span><strong id="${id}">${L.privateMoney(key,amount,true)}</strong></button>${context}<button type="button" class="everyday-budget-link mono-budget-link" onclick="${details}"><span>${budgetLabel}</span>${L.icon('chevron',17)}</button></section>${gap}${pending}<div class="everyday-home-actions mono-home-actions" role="group" aria-label="Quick actions">${action('Add money','plus',"L.openFunding('home')",'mono-action-acid')}${action('Pay','arrowUp',"L.go('sendOptions')")}${action('Collect','arrowDown','L.newRequest()')}</div>${boxes?`<section class="account-card account-savings everyday-boxes-card mono-boxes-card" aria-label="Money Boxes"><button type="button" class="everyday-boxes-open" onclick="L.go('goals')"><span class="mono-box-symbol" aria-hidden="true">${boxIcon}</span><span class="mono-box-copy"><strong class="mono-box-title">Money Boxes${boxes?` <span class="mono-box-count">${boxes}<span class="sr-only"> ${boxes===1?'box':'boxes'}</span></span>`:''}</strong><small class="mono-box-total-label">Total saved</small><strong class="everyday-savings-amount${Math.abs(a.savings)>=10000?' has-wide-savings':''}${Math.abs(a.savings)>=10000000?' has-huge-savings':''}" id="overview-savings">${L.privateMoney('savings',a.savings)}<span class="mono-savings-reserve" aria-hidden="true"></span></strong></span>${L.icon('chevron',18)}</button></section>`:`<section class="account-card account-savings everyday-boxes-card mono-boxes-card is-empty" aria-label="Money Boxes"><button type="button" class="everyday-boxes-open" onclick="L.go('goalEdit')"><span class="mono-box-symbol" aria-hidden="true">${boxIcon}</span><span class="mono-box-copy mono-box-empty-copy"><strong class="mono-box-title">Create a Money Box</strong><small class="mono-box-empty-note">Put money aside for a goal.</small></span>${L.icon('chevron',18)}</button></section>`}${L.monoConversation?.card()||''}${migration}</section>`;
};
// Compose final view markup after every feature has supplied its facts and
// controls. Optional Pause paths remain available in one disclosure; the two
// main decisions and cancellation keep their original handlers and timing.
const decorate=L.decorateView;
L.decorateView=function(html,route){
 let result=decorate?decorate.call(this,html,route):html;
 result=result.replace(/onclick="L\.openTab\('more'\)"/g,'onclick="L.openMonoMenu()"');
 if(route==='plan')result=result.replace(/(<header\b[^>]*class="[^"]*hibiscus-root-header[^\"]*"[^>]*><h1>)Budget(<\/h1>)/,'$1Plan$2');
 if(route!=='pause'||!result.includes('class="pause-decisions"'))return result;
 const choices=block(result,'<div class="pause-recovery-options');
 const cost=result.match(/<button\b[^>]*class="[^"]*pause-link-cost[^\"]*"[^>]*>[\s\S]*?<\/button>/)?.[0]||'';
 const later=result.match(/<button\b[^>]*onclick="L\.pauseAction\('delay_payment'\)"[^>]*>[\s\S]*?<\/button>/)?.[0]||'';
 if(!choices&&!cost&&!later)return result;
 for(const node of [choices,cost,later])if(node)result=result.replace(node,'');
 const main=block(result,'<div class="pause-decisions"');
 const more=`<details class="mono-pause-options" data-pause-effects aria-hidden="true" inert><summary>Other ways forward ${L.icon('chevron',16)}</summary>${choices}${cost}${later}</details>`;
 return main?result.replace(main,main+more):result;
};
function sync(){
 document.body.classList.add('lumo-monochrome');
 const pay=document.querySelector('.screen-pay');
 const balance=pay?.querySelector('[data-payment-balance]'),intro=pay?.querySelector('.focus-pay-heading');
 if(balance&&intro&&typeof intro.insertAdjacentElement==='function'&&intro.nextElementSibling!==balance)intro.insertAdjacentElement('afterend',balance);
 // Root names orient visitors without duplicating task titles.
 for(const root of document.querySelectorAll('.hibiscus-root-header')){
  root.classList.add('mono-root-header');
  if(root.closest('.screen-plan')){const heading=root.querySelector('h1');if(heading)heading.textContent='Plan';}
 }
 syncNavigation();
 syncDrawer();
 syncHomeFacts();
}
const chatSync=L.syncChatBanking;
L.syncChatBanking=function(...args){const result=chatSync?.apply(this,args);if(!L.taskSheet?.active)L.qrCorner?.sync?.();syncNavigation();syncDrawer();return result;};
window.addEventListener?.('resize',syncDrawer,{passive:true});window.visualViewport?.addEventListener?.('resize',syncDrawer,{passive:true});
const render=L.render;
L.render=function(...args){const result=render.apply(this,args);sync();return result;};
L.monoDesign=Object.freeze({version:1,sync,syncHomeFacts});
sync();
})();
