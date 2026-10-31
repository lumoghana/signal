/* Five everyday destinations. Existing task sheets, authentication and ledgers
   remain authoritative; these roots only give Story and Cards a stable home. */
(()=>{
'use strict';
if(!window.L||L.hibiscusNavigation)return;
const E=L.e;
let account=L.state;
L.hibiscusLastTab='home';
const tabs=[['moneyStoryHome','Money Story','receipt'],['plan','Plan','target'],['home','Home','home'],['cardsHome','Cards','card'],['pay','Pay','grid']];
const newRoots=new Set(['moneyStoryHome','cardsHome']);
const rootSet=new Set([...tabs.map(([route])=>route),'more']);
const allowed=()=>!!L.state.onboarded&&!L.state.locked&&!L.state.closed;
const assistantIcon=()=>L.hibiscusAssistantButton?.().match(/<svg\b[\s\S]*?<\/svg>/)?.[0]||L.icon('chat',18);
const ask=()=>`<button type="button" class="hibiscus-root-chat" onclick="L.openBankingChat()" aria-label="Ask Lumo. Open full-screen Chat">${assistantIcon()}<span>Ask Lumo</span></button>`;
const headerActions=()=>{
 const count=L.dailyInsights?.unread?.()||0;
 const notifications=`<button type="button" class="hibiscus-header-notifications" onclick="L.go('notifications')" aria-label="Notifications"${count?' aria-describedby="hibiscus-unread-description"':''}>${L.icon('bell',20)}${count?`<span class="daily-unread-badge" aria-hidden="true">${Math.min(count,9)}${count>9?'+':''}</span><span id="hibiscus-unread-description" class="sr-only">${count} unread notification${count===1?'':'s'}</span>`:''}</button>`;
 return `<div class="hibiscus-header-utilities" aria-label="Your account and notifications">${notifications}<button type="button" class="hibiscus-header-you" onclick="L.openTab('more')" aria-label="You. Profile, security and settings"${L.route==='more'?' aria-current="page"':''}>${L.icon('user',18)}<span>You</span></button></div>`;
};
const rootHeader=title=>`<header class="hibiscus-tab-header hibiscus-root-header"><h1>${E(title)}</h1>${headerActions()}${ask()}</header>`;
const storyView=L.views.homeMoneyStory,cardView=L.views.virtualCards;
L.views.moneyStoryHome=function(...args){
 let html=storyView.apply(this,args);
 html=html.replace(L.header('Your money story'),'').replace('<h1>Where did it go?</h1>','');
 return `<section class="hibiscus-primary-page hibiscus-story-root" data-illustrated-screen="moneyStoryHome">${rootHeader('Money Story')}${html}</section>`;
};
L.views.cardsHome=function(...args){
 let html=cardView.apply(this,args);
 // The existing list owns statuses, limits and creation eligibility. A root
 // page has no dismiss action; its task children still use the sheet shell.
 const subtitle=L.virtualCards.list().length?'For online payments. Up to two cards.':'Your online payments, in one place.';
 html=html.replace(L.header('Virtual cards',subtitle),'');
 html=html.replace(/<button\b[^>]*onclick="L\.closeTask\(\)"[^>]*>Done<\/button>/,'');
 return `<section class="hibiscus-primary-page hibiscus-cards-root" data-illustrated-screen="cardsHome">${rootHeader('Cards')}<p class="hibiscus-root-subtitle">${E(subtitle)}</p>${html}</section>`;
};
for(const [route,label]of [['moneyStoryHome','Money Story'],['cardsHome','Cards']])L.taskSheet?.registerParent(route,label);
for(const [route,label]of [['plan','Plan'],['more','You'],['pay','Payments']]){
 const view=L.views[route];if(!view)continue;
 L.views[route]=function(...args){let html=view.apply(this,args);if(route==='plan')html=html.replace('<div class="plan-hub-heading"><h1>Your plan.</h1></div>','');return allowed()?html.replace(/<div class="topline[^"]*">[\s\S]*?<\/div>/,rootHeader(label)):html;};
}
// Keep each edition's single Home amount card. The full Story and Cards
// live in their own tabs, with a compact assistant entry in the header.
const home=L.views.home;
L.views.home=function(...args){
 let html=home.apply(this,args);if(!allowed())return html;
 html=html.replace('onclick="L.go(\'profile\')"','onclick="L.openTab(\'more\')"').replace('aria-label="Your profile"','aria-label="You. Profile, security and settings"');
 return html.replace(/(<div class="inline home-header-actions">)([\s\S]*?)(<\/div>)/,(_,open,body,close)=>open+body+ask()+close);
};
function sync(){
 if(account!==L.state){account=L.state;L.hibiscusLastTab='home';}
 const nav=document.getElementById('nav');if(!nav)return;
 if(L.taskSheet?.active){
  const previous=L.history?.[L.history.length-1];
  if(L.route==='txDetail'&&['homeMoneyStory','dailyMoneyStory','moneyStoryHome'].includes(previous?.route))document.querySelector('.task-sheet-back')?.setAttribute('aria-label','Back to Your money story');
  return;
 }
 if(!allowed()||!rootSet.has(L.route))return;
 L.hibiscusLastTab=L.route;
 nav.hidden=false;nav.classList.add('hibiscus-nav','hibiscus-five-nav');
 const existing=[...nav.querySelectorAll('.nav-item')];
 const unchanged=existing.length===tabs.length&&tabs.every(([route,label],i)=>existing[i].getAttribute('onclick')===`L.openTab('${route}')`&&existing[i].textContent.trim()===label&&(existing[i].getAttribute('aria-current')==='page')===(L.route===route));
 if(unchanged)return;
 nav.innerHTML=tabs.map(([route,label,icon])=>`<button type="button" class="nav-item${L.route===route?' active':''}${route==='home'?' home-destination':''}" onclick="L.openTab('${route}')"${L.route===route?' aria-current="page"':''}>${L.icon(icon,21)}<span>${label}</span></button>`).join('');
}
const render=L.render;
L.render=function(...args){const result=render.apply(this,args);sync();return result;};
// A retained sheet can close without repainting the root. Reapply only the
// navigation chrome after the existing controller restores its parent.
const syncChat=L.syncChatBanking;
L.syncChatBanking=function(...args){const result=syncChat?.apply(this,args);sync();return result;};
const closeChat=L.closeBankingChat;
L.closeBankingChat=function(...args){
 if(allowed()&&L.route==='chat'&&!L.taskSheet?.active&&!L.contextualChat?.current?.()&&newRoots.has(L.hibiscusLastTab))return L.openTab(L.hibiscusLastTab);
 return closeChat.apply(this,args);
};
const chatView=L.views.chat;
L.views.chat=function(...args){const html=chatView.apply(this,args),tab=L.hibiscusLastTab;return newRoots.has(tab)&&!L.contextualChat?.current?.()?html.replace('aria-label="Back to Home"','aria-label="Back to '+(tab==='cardsHome'?'Cards':'Money Story')+'"'):html;};
const openTab=L.openTab;
L.openTab=function(route){
 if(!newRoots.has(route))return openTab.apply(this,arguments);
 if(L.taskSheet?.active)return openTab.apply(this,arguments);
 if(L.route===route){sync();return;}
 L.captureFormDraft?.();L.beforeNavigate?.(route,{});L.syncBrowser?.('replace');
 L.history=[];L.route=route;L.params={};L.routeChanging=true;
 try{L.render();}finally{L.routeChanging=false;}
 L.syncBrowser?.('push');
};
// Graph period/category/merchant controls belong to their current root. The
// same controls in a contextual Story sheet retain the original sheet route.
const go=L.go;
L.go=function(route,params={}){
 if(!L.taskSheet?.active&&L.route==='moneyStoryHome'&&route==='homeMoneyStory')route='moneyStoryHome';
 return go.call(this,route,params);
};
L.hibiscusNavigation=Object.freeze({tabs:Object.freeze(tabs.map(row=>Object.freeze([...row]))),sync,rootHeader,headerActions});
sync();
})();
