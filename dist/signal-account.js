/* Signal account and conversation presentation. Native account forms, privacy,
   consent, support records and Chat answers keep their original controllers. */
(()=>{
'use strict';
if(!window.L||L.signalAccount)return;
const roots={profile:'user',security:'shield',privacy:'eye',notificationPrefs:'bell',notifications:'bell',dailyUpdatePrefs:'clock',devices:'phone',accountInfo:'bank',help:'help'};
const decorate=L.decorateView;
L.decorateView=function(html,route){
 let out=decorate?decorate.call(this,html,route):html;
 if(roots[route]){
  out=out.replace(/class="page-heading([^"]*)"/,`class="page-heading signal-account-heading$1"`);
  out=out.replace(/(<div\b[^>]*class="[^\"]*\bsignal-account-heading\b[^\"]*"[^>]*>)/,
   '$1'+`<span class="signal-account-mark signal-account-mark-${route}" aria-hidden="true">${L.icon(roots[route],42)}</span>`);
 }
 if(route==='profile'){
  const name=String(L.state.profile?.displayName||L.state.profile?.name||'You').trim();
  const initial=L.e(Array.from(name)[0]||'Y');
  out=out.replace('<div class="soft">',`<div class="soft signal-profile-pass"><span class="signal-customer-monogram" aria-hidden="true">${initial}</span>`);
 }
 if(route==='welcome')out=out.replace('<div class="mono-welcome-picture">','<div class="mono-welcome-picture"><span class="signal-welcome-hello" aria-hidden="true">hey.</span>');
 if(route==='ambassadorWelcome')out=out.replace('<h1>',`<div class="signal-ambassador-character" aria-hidden="true"><img class="signal-avatar-2d" src="/brand/lumo-avatar-icon-512.png" width="512" height="512" alt="" decoding="async"><span>hey.</span></div><h1>`);
 return out;
};
// The empty illustrated feed opens at its greeting once per sample account.
// Native Chat keeps its scroll restoration and newest-answer positioning for
// conversations, retained tasks and subsequent visits.
const introduced=new WeakSet(),render=L.render;
L.render=function(...args){
 const result=render.apply(this,args);
 if(L.route==='chat'&&!L.taskSheet?.active&&!(L.state.chats||[]).length&&!introduced.has(L.state)){
  const thread=document.getElementById('chat-thread');
  if(thread?.querySelector('.hibiscus-chat-feed')){introduced.add(L.state);thread.scrollTop=0;}
 }
 return result;
};
L.signalAccount=Object.freeze({version:2,routes:Object.keys(roots)});
})();
